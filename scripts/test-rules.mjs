#!/usr/bin/env node
/**
 * Checks of the rules for open roles, seats, reports and admin removal, against a running server.
 *
 *   BASE=http://localhost:3000 node scripts/test-rules.mjs
 *
 * Run it against a throwaway server on a FRESH RN_DATA_DIR, started like the one for
 * scripts/test-server.mjs: RN_STARTER_CREDITS=25, RN_ADMIN_EMAILS=admin-qa@example.com,
 * RN_SCAN_TEST=1 and RN_CRON_SECRET=qa-cron. It creates about 60 test accounts and stores test
 * scans. The last section dates its scans up to 11 days ahead, so don't reuse the data dir.
 *
 * Optional environment:
 *   ADMIN_EMAIL    admin account to join (default admin-qa@example.com)
 *   ADMIN_TOKEN    its sign-in code, when that email already joined
 *   SEED_FILE      the private seed the server runs on (default data/intel-seed.json). When it
 *                  is there, one check signs in as a seed member who holds a seat. Nothing from
 *                  it is printed.
 *   STARTER        expected starter credits (default 25)
 *   CRON_SECRET    the server's RN_CRON_SECRET (default qa-cron)
 *   ONLY           comma-separated sections to run (default all): role hidden bundle status seat
 *                  report keep rate admin price twin repair dates retract company wire closed
 *   SUPPORT_EMAIL, INTRO_EMAIL   the server's RN_SUPPORT_EMAIL and RN_INTRO_EMAIL (default: not set)
 */
import { readFileSync } from "node:fs";

const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const STARTER = Number(process.env.STARTER ?? 25);
const CRON_SECRET = process.env.CRON_SECRET ?? "qa-cron";
const ONLY = new Set((process.env.ONLY || "").split(",").map((x) => x.trim()).filter(Boolean));
const RUN = Date.now().toString(36);
/** A distinct client address per test client (the rightmost X-Forwarded-For entry). */
const IP_BASE = `10.${(Date.now() >> 8) & 255}.${Date.now() & 255}`;
let ipN = 0;
const nextIp = () => `${IP_BASE}.${++ipN}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

let failures = 0;
let passes = 0;
const pass = (name) => (passes++, console.log(`PASS ${name}`));
const fail = (name, detail) => (failures++, console.log(`FAIL ${name}${detail === undefined ? "" : `: ${redact(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)}`}`));
const check = (name, ok, detail) => (ok ? pass(name) : fail(name, detail));
const skip = (name, why) => console.log(`SKIP ${name}: ${why}`);

/* ---------- http ---------- */

async function call(method, path, { token, ipAddr, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.cookie = `rn_table=${token}`;
  if (ipAddr && !h["x-forwarded-for"]) h["x-forwarded-for"] = ipAddr;
  if (body !== undefined) h["content-type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, json, text, headers: r.headers };
}

class Client {
  constructor(name, ipAddr, token = null) {
    this.name = name;
    this.ip = ipAddr;
    this.token = token;
  }
  async view() {
    const r = await call("GET", "/api/table", { token: this.token, ipAddr: this.ip });
    if (r.status !== 200) throw new Error(`GET as ${this.name}: ${r.status} ${r.text.slice(0, 200)}`);
    return r.json;
  }
  act(action) {
    return call("POST", "/api/table", { token: this.token, ipAddr: this.ip, body: { action } });
  }
  /** The public id the seat-holder picker gives for a member's exact name. */
  async pick(name) {
    const r = await call("GET", "/api/table?people=" + encodeURIComponent(name), { token: this.token, ipAddr: this.ip });
    return r.json?.members?.find((m) => m.name === name)?.id ?? null;
  }
}

async function join(name, { email, headers, ref } = {}) {
  const ipAddr = nextIp();
  const r = await call("POST", "/api/table", {
    ipAddr,
    headers,
    body: { join: { name, email: email ?? `qa+${RUN}-${name.toLowerCase().replace(/\W+/g, "")}-${Math.random().toString(36).slice(2, 7)}@example.com`, ...(ref ? { ref } : {}) } },
  });
  const token = (r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean) ?? null;
  return { r, client: token ? new Client(name, ipAddr, token) : null };
}

/** A new member with a name nobody else in this run has (names link seats, so they must be unique). `ref`: an invite code. */
async function member(name, { ref } = {}) {
  const { r, client } = await join(name, { ref });
  if (!client) throw new Error(`join ${name} failed: ${r.status} ${r.text.slice(0, 200)}`);
  await client.act({ type: "profile", function: "Sales", goal: "friendly" });
  return client;
}

let adminClient;
async function admin() {
  if (adminClient !== undefined) return adminClient;
  const email = process.env.ADMIN_EMAIL || "admin-qa@example.com";
  if (process.env.ADMIN_TOKEN) return (adminClient = new Client("Admin Qa", nextIp(), process.env.ADMIN_TOKEN));
  // An admin address can't be claimed in the join form alone, so the cron secret goes with it.
  const { client } = await join("Admin Qa", { email, headers: { "x-cron-secret": CRON_SECRET } });
  if (client) await client.act({ type: "profile", function: "Sales", goal: "friendly" });
  return (adminClient = client);
}

/* ---------- seed members and test scans ---------- */

/** The private seed, when this machine has the one the server runs on. Never printed. */
let seedFile = null;
try {
  seedFile = JSON.parse(readFileSync(process.env.SEED_FILE ?? "data/intel-seed.json", "utf8"));
} catch {
  /* no seed here: the check that needs a seed member is skipped */
}
/** A failed check prints what it got. Names, emails, phones and sign-in codes from the seed never go to the log. */
let secrets = null;
function redact(text) {
  if (!seedFile) return text;
  secrets ??= [
    ...seedFile.members.flatMap((m) => [m.token, m.email, m.name]),
    ...(seedFile.contacts ?? []).flatMap((p) => [p.fields.name, p.fields.email, p.fields.phone, p.fields.linkedin]),
    ...seedFile.engagements.map((e) => e.fields.operator),
    ...seedFile.companies.flatMap((c) => [c.fields.name, c.fields.website, c.fields.linkedin]),
  ].filter((x) => typeof x === "string" && x.length >= 4);
  for (const x of secrets) if (text.includes(x)) text = text.split(x).join("[redacted]");
  return text;
}
const normName = (n) => n.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s'-]/g, " ").replace(/\s+/g, " ").trim();
/** Seed members a seat-holder name resolves to (exactly one member has that name). */
const seedHolders = (() => {
  if (!seedFile) return [];
  const byName = new Map();
  for (const m of seedFile.members) byName.set(normName(m.name), [...(byName.get(normName(m.name)) ?? []), m]);
  const out = new Map();
  for (const e of seedFile.engagements) {
    const same = e.fields.operator ? byName.get(normName(e.fields.operator)) ?? [] : [];
    if (same.length === 1 && e.fields.source !== "Demand scan") out.set(same[0].id, same[0]);
  }
  return [...out.values()];
})();

/** Store a test scan (the server must run with RN_SCAN_TEST=1 and RN_CRON_SECRET). */
const scanPost = (body) => call("POST", "/api/table/scan", { ipAddr: `${IP_BASE}.250`, body, headers: { "x-cron-secret": CRON_SECRET } });
let scanOk;
async function canScan() {
  if (scanOk === undefined) {
    const probe = await scanPost({ roles: [], sources: [] });
    scanOk = probe.status === 200 && probe.json?.test === true;
  }
  return scanOk;
}
const NEED_SCAN = "start the server with RN_SCAN_TEST=1 and RN_CRON_SECRET=qa-cron";
/** One posting for a test scan. */
const posting = (n, company, title, board, extra = {}) => ({
  key: `qarules${RUN}:${n}`, company, domain: null, title, function: null, type: "Fractional", url: `https://jobs.example.com/rules/${RUN}/${n}`, source: board, postedAt: null, rate: null, hoursPerWeek: null, ...extra,
});

/* ---------- view helpers ---------- */

function* cellsOf(view) {
  for (const c of view.companies) {
    for (const [field, cell] of Object.entries(c.cells)) yield { entity: "company", id: c.id, field, cell, company: c };
    const people = [...c.people];
    for (const e of c.engagements) {
      for (const [field, cell] of Object.entries(e.cells)) yield { entity: "engagement", id: e.id, field, cell, company: c, eng: e };
      people.push(...e.people);
    }
    for (const p of people) for (const [field, cell] of Object.entries(p.cells)) yield { entity: "contact", id: p.id, field, cell, company: c, person: p };
  }
}
const findCell = (view, entity, id, field) => {
  for (const x of cellsOf(view)) if (x.entity === entity && x.id === id && x.field === field) return x.cell;
  return null;
};
const engOf = (view, id) => {
  for (const c of view.companies) for (const e of c.engagements) if (e.id === id) return { ...e, company: c };
  return null;
};
const companyNamed = (view, name) => view.companies.find((c) => c.name === name) ?? null;
/** A valid value for the free company facts a test fills. */
const SAMPLE = { hq: "Austin, TX", industry: "SaaS", employees: "11–50", revenue: "$1M–$5M" };
const claimed = new Set();
/** A fill of a free, empty company fact nobody in this run has picked yet (earns the credit that lets a member report free facts). */
function freeFill(view) {
  for (const c of view.companies) {
    if (c.hidden || /^Qa /.test(c.name)) continue;
    for (const [field, value] of Object.entries(SAMPLE)) {
      const k = `${c.id}.${field}`;
      if (c.cells[field]?.s !== "empty" || claimed.has(k)) continue;
      claimed.add(k);
      return { type: "fill", entity: "company", id: c.id, field, value };
    }
  }
  throw new Error("no empty free company fact left");
}
/** Free facts from our own records that no test in this run touched: visible values on companies that are not hidden. */
function seedFacts(view, n) {
  const out = [];
  for (const x of cellsOf(view)) {
    if (out.length >= n) break;
    if (x.entity !== "company" || !["industry", "employees", "revenue"].includes(x.field) || x.company.hidden || x.company.mine) continue;
    const k = `${x.id}.${x.field}`;
    if (x.cell.s !== "value" || x.cell.mine || x.cell.system || claimed.has(k)) continue;
    claimed.add(k);
    out.push({ entity: x.entity, id: x.id, field: x.field });
  }
  if (out.length < n) throw new Error(`only ${out.length} untouched seed facts`);
  return out;
}
/** Companies to add test seats to: visible, no open role, not used by another check. */
const usedHosts = new Set();
function host(view) {
  const c = view.companies.find((x) => !x.hidden && x.friendly.open === 0 && !x.mine && x.engagements.length > 0 && !usedHosts.has(x.id) && !/^Qa /.test(x.name));
  if (!c) throw new Error("no host company left");
  usedHosts.add(c.id);
  return c;
}

/**
 * Make a joined member's word count (lib/table.ts trustOf): they add a free fact and two seed
 * members confirm it. A claim on an open role closes it only from an account that counts. It
 * pays the member 2 credits (the fact, and the confirmation bonus). False without the seed file.
 */
const vouchers = seedFile
  ? seedFile.members.filter((m) => m.token && !seedHolders.some((h) => h.id === m.id)).slice(-2).map((m) => new Client("Voucher", nextIp(), m.token))
  : [];
async function vouch(who) {
  if (vouchers.length < 2) return false;
  const f = freeFill(await who.view());
  const r = await who.act(f);
  let ok = r.status === 200;
  for (const v of vouchers) ok = (await v.act({ type: "verify", entity: f.entity, id: f.id, field: f.field })).status === 200 && ok;
  return ok;
}
const NEED_SEED = "needs the seed file the server runs on (two seed members vouch for the member who claims the role)";

/* ---------- sections ---------- */

const sections = {};
const section = (name, fn) => (sections[name] = fn);

/** Naming anyone but yourself as a seat holder, an open role included (members add only seats they held). */
const SELF_ONLY = "You can add seats you held. Pick yourself as the seat holder.";
/** A fact about a seat from anyone but its holder. */
const HOLDER_ONLY = "Only the person who held this seat can add this.";

// LOGIC-1, ECON-2: naming a seat holder must not close an open role for everyone.
section("role", async () => {
  if (!(await canScan())) return skip("open role checks", NEED_SCAN);
  const adm = await admin();
  if (!adm) return skip("open role checks", "no admin account (set ADMIN_TOKEN)");
  const A = await member("Ann Attacker");
  const B = await member("Bo Bystander");
  const board = `qa-rules-role-${RUN}`;
  const coName = `Qa Role Co ${RUN}`;
  const role = posting("role", coName, "Fractional CMO", board, { domain: `qa-role-${RUN}.example.com` });
  const listed = { roles: [role], sources: [{ source: board, fetched: 10, matched: 1 }] };
  const s1 = await scanPost(listed);
  check("a scan opens the role", s1.json?.result?.opened === 1, s1.json);
  const coId = companyNamed(await adm.view(), coName)?.id;
  /** The role and its company as this member sees them. */
  const look = async (who) => {
    const v = await who.view();
    const c = v.companies.find((x) => x.id === coId);
    const e = c?.engagements.find((x) => x.source === "Demand scan");
    return { open: v.stats.openRoles, hidden: c?.hidden, status: e?.cells.status?.v, from: e?.cells.status?.from, closed: e?.closed, holder: e?.cells.operator?.s, engs: c?.engagements.length, id: e?.id, credits: v.me.credits, yours: e?.yours };
  };
  const b0 = await look(B);
  const eid = b0.id;
  check("a bystander sees an open role at a hidden company", b0.hidden === true && b0.status === "Open role" && b0.from === "posting" && b0.closed === null, b0);
  const isOpen = (x) => x.open === b0.open && x.hidden === true && x.status === "Open role" && x.closed === null;
  const isClosed = (x) => x.open === b0.open - 1 && x.hidden === false && x.status === "Active" && x.closed === dayOf(Date.now());
  const name = (who, value, memberId) => who.act({ type: "fill", entity: "engagement", id: eid, field: "operator", value, ...(memberId ? { memberId } : {}) });

  // A made-up name, three ways.
  await A.act({ type: "unlock", entity: "company", id: coId, field: "identity" });
  const made = await name(A, "Jane Madeup");
  check("a made-up seat holder on an open role is refused", made.status === 400 && made.json?.error === SELF_ONLY, made.json);
  check("the role is still open for everyone after it", isOpen(await look(B)), await look(B));
  const typed = await name(A, "Ann Attacker");
  check("typing your own name without picking yourself is refused too", typed.status === 400 && typed.json?.error === SELF_ONLY, typed.json);
  const other = await name(A, "Bo Bystander", await A.pick("Bo Bystander"));
  check("picking another member on an open role is refused", other.status === 400 && other.json?.error === SELF_ONLY, other.json);
  const viaAdd = await A.act({ type: "add", company: coName, engagementId: eid, engagementFields: { operator: "Jane Madeup" } });
  check("a made-up name through Add on the open role is refused", viaAdd.status === 400 && viaAdd.json?.error === SELF_ONLY, viaAdd.json);
  check("after four tries the role is open and the company hidden", isOpen(await look(B)), await look(B));
  check("refused tries earn nothing", (await look(A)).credits === STARTER - 1, (await look(A)).credits);

  // ECON-2: a claim from an account nobody has vouched for keeps the name and leaves the role open.
  const N = await member("Nia Newcomer");
  // Through Add, which needs no unlock: the posting is on a public board, so its company's name is no secret.
  const nClaim = await N.act({ type: "add", company: coName, engagementId: eid, operatorMemberId: "me", engagementFields: { operator: "Nia Newcomer" } });
  check(
    "a new account's claim is saved and says the role stays open for others",
    nClaim.status === 200 && /You earned 1 credit\. Others still see the role as open until its posting comes down\./.test(nClaim.json?.message ?? ""),
    nClaim.json,
  );
  check("the role stays open and the company hidden for everyone (ECON-2)", isOpen(await look(B)), await look(B));
  const sN = await scanPost(listed);
  check("a scan that still lists it keeps it open", sN.json?.result?.stillOpen >= 1 && sN.json.result.reopened === 0 && isOpen(await look(B)), sN.json?.result);
  const nRow = (await adm.view()).admin?.roleClaims?.find((c) => c.engagementId === eid);
  check("pilot metrics list the claim, and that it did not close the role", !!nRow && nRow.name === "Nia Newcomer" && nRow.closed === false && nRow.standing === true && !!nRow.at, nRow);
  // N5: taking a claim back takes the name off, so the seat is free for whoever really took it.
  const nNot = await N.act({ type: "notMine", engagementId: eid });
  check("this isn't me on their own claim takes the name off the seat", nNot.status === 200 && /Your name is off it\./.test(nNot.json?.message ?? "") && (await look(B)).holder === "empty" && isOpen(await look(B)), [nNot.json?.message, await look(B)]);
  check("and takes back the credit the claim earned", (await look(N)).credits === STARTER, (await look(N)).credits);
  const nAgain = await name(N, "x", "me");
  check("their second claim the same day is refused", nAgain.status === 400 && /once a day/.test(nAgain.json?.error ?? ""), nAgain.json);
  if (!(await vouch(A))) return skip("claims that close the role", NEED_SEED);

  // A past seat with the same title is its own record. It never lands on the open role.
  const E = await member("Eve Earlier");
  const past = await E.act({ type: "add", company: coName, operatorMemberId: "me", engagementFields: { role: "Fractional CMO", operator: "Eve Earlier", start: "2023-03", end: "2024-01" } });
  const afterPast = await look(B);
  check("a past seat with the open role's title becomes its own engagement", past.status === 200 && !!past.json?.id && past.json.id !== eid, { status: past.status, same: past.json?.id === eid, message: past.json?.error ?? past.json?.message });
  check("adding that past seat leaves the role open", isOpen(afterPast) && afterPast.engs === 2, afterPast);

  // Picking yourself fills the role.
  const claim = await name(A, "whatever is typed", "me");
  check("picking yourself as seat holder fills the role", claim.status === 200 && claim.json?.cells?.find((c) => c.field === "status")?.cell?.v === "Active", claim.json);
  const a1 = await look(A);
  check("the seat is theirs, and the role is closed for everyone", a1.yours === true && isClosed(await look(B)), [a1, await look(B)]);
  check("the Active status a claim sets is not marked as coming from the posting", (await look(B)).from === undefined, (await look(B)).from);
  const rename = await name(A, "Jane Madeup");
  check("they can't rename the seat holder to someone else afterwards", rename.status === 400 && rename.json?.error === SELF_ONLY, rename.json);
  const s2 = await scanPost(listed);
  check("a posting that lingers doesn't reopen a role somebody holds", s2.json?.result?.reopened === 0 && isClosed(await look(B)), s2.json);

  // Two reports and an admin removal bring it back.
  const C = await member("Cy Reporter");
  const D = await member("Di Reporter");
  for (const who of [C, D]) {
    await who.act({ type: "unlock", entity: "engagement", id: eid, field: "operator" });
    await who.act({ type: "report", entity: "engagement", id: eid, field: "operator" });
  }
  const pending = await look(B);
  check("two reports hide the name, and the role waits for the admin", pending.holder === "reported" && pending.status === "Active" && pending.hidden === false, pending);
  const rm = await adm.act({ type: "review", entity: "engagement", id: eid, field: "operator", decision: "remove" });
  check("the admin removes the name", rm.status === 200 && rm.json?.message === "Removed. Anyone who unlocked it got their credit back, and it can be added again.", rm.json);
  const back = await look(B);
  check("removing the seat holder reopens the role", isOpen(back) && back.holder === "empty", back);
  check("the member who took it loses the credit, the reporters get theirs back", (await look(A)).credits === STARTER + 1 && (await look(C)).credits === STARTER, [(await look(A)).credits, (await look(C)).credits]);
  const s3 = await scanPost(listed);
  check("a rescan that still lists the role finds it open", s3.json?.result?.stillOpen >= 1 && s3.json.result.opened === 0 && s3.json.result.reopened === 0 && isOpen(await look(B)), s3.json);

  // One close by self-claim per member per rolling 24 hours.
  const again = await name(A, "x", "me");
  check("a second self-claim inside 24 hours is refused", again.status === 400 && /once a day/.test(again.json?.error ?? "") && isOpen(await look(B)), again.json);

  // "This isn't me" undoes a claim.
  const F = await member("Flo Fickle");
  await vouch(F);
  const fClaim = await F.act({ type: "add", company: coName, engagementId: eid, operatorMemberId: "me", engagementFields: { operator: "Flo Fickle" } });
  check("another member can take the role through Add", fClaim.status === 200 && isClosed(await look(B)), fClaim.json);
  const fRow = (await adm.view()).admin?.roleClaims?.find((c) => c.engagementId === eid && c.name === "Flo Fickle");
  check("pilot metrics list a claim that closed the role", !!fRow && fRow.closed === true && fRow.standing === true, fRow);
  const notMe = await F.act({ type: "notMine", engagementId: eid });
  check("this isn't me reopens the role and says so", notMe.status === 200 && /The role is open again\./.test(notMe.json?.message ?? "") && notMe.json?.cells?.find((c) => c.field === "status")?.cell?.v === "Open role", notMe.json);
  const afterNot = await look(B);
  check("after this isn't me the role is open and their name is off the seat (N5)", isOpen(afterNot) && afterNot.holder === "empty", afterNot);
  const row = (await adm.view()).reported.find((r) => r.id === eid && r.field === "operator");
  check("nothing is left waiting for the admin, and the claim's credit is taken back", !row && (await look(F)).credits === STARTER + 2, [row, (await look(F)).credits]);
  // The old way to keep it closed: unlink, then rename the seat holder to someone who isn't a member.
  const swap = await F.act({ type: "fill", entity: "engagement", id: eid, field: "operator", value: "Jane Madeup" });
  check("after this isn't me they can't put another name on the role", swap.status === 400 && swap.json?.error === SELF_ONLY && isOpen(await look(B)), swap.json);
  await adm.act({ type: "review", entity: "engagement", id: eid, field: "operator", decision: "remove" });
  check("removing a name that already came off leaves the role open", isOpen(await look(B)), await look(B));

  // An admin removal with no report does the same.
  const G = await member("Gus Grabber");
  await G.act({ type: "unlock", entity: "company", id: coId, field: "identity" });
  await vouch(G);
  const gClaim = await name(G, "x", "me");
  check("a third member takes the role", gClaim.status === 200 && isClosed(await look(B)), gClaim.json);
  const direct = await adm.act({ type: "adminRemove", entity: "engagement", id: eid, field: "operator" });
  check("adminRemove on the seat holder reopens the role", direct.status === 200 && isOpen(await look(B)), direct.json);
  check("and takes back the credit the claim earned", (await look(G)).credits === STARTER + 1, (await look(G)).credits);
  const I = await member("Ike Inventor");
  await vouch(I);
  const iClaim = await I.act({ type: "add", company: coName, engagementId: eid, operatorMemberId: "me", engagementFields: { operator: "Ike Inventor" } });
  check("a fourth member takes the role", iClaim.status === 200 && isClosed(await look(B)), iClaim.json);
  const sweep = await adm.act({ type: "adminRemoveMember", memberId: await adm.pick("Ike Inventor") });
  check("adminRemoveMember on that member reopens the role too", sweep.status === 200 && isOpen(await look(B)) && (await look(B)).holder === "empty", sweep.json);

  // The same rule on an open role that came with the seed.
  const H = await member("Hal Hopeful");
  const hv = await H.view();
  const seedCo = hv.companies.find((c) => c.hidden && c.id !== coId && c.engagements.some((e) => e.source === "Demand scan" && e.opened && !e.closed && e.cells.operator?.s === "empty"));
  if (!seedCo) return skip("seed open role", "the seed here has no open role");
  const se = seedCo.engagements.find((e) => e.source === "Demand scan" && e.opened && !e.closed && e.cells.operator?.s === "empty");
  await H.act({ type: "unlock", entity: "company", id: seedCo.id, field: "identity" });
  const seedTry = await H.act({ type: "fill", entity: "engagement", id: se.id, field: "operator", value: "Jane Madeup" });
  const bv = await B.view();
  const seedAfter = engOf(bv, se.id);
  check("a made-up name on a seed open role is refused, and it stays open", seedTry.status === 400 && seedTry.json?.error === SELF_ONLY && seedAfter?.closed === null && seedAfter.company.hidden === true && bv.stats.openRoles === b0.open, { status: seedTry.status, closed: seedAfter?.closed, hidden: seedAfter?.company.hidden });
});

// ECON-1: confirm and report must not hand over a hidden company's website, LinkedIn or HQ.
section("hidden", async () => {
  if (!(await canScan())) return skip("hidden company checks", NEED_SCAN);
  const adm = await admin();
  if (!adm) return skip("hidden company checks", "no admin account (set ADMIN_TOKEN)");
  const board = `qa-rules-hidden-${RUN}`;
  const coName = `Qa Leak Co ${RUN}`;
  const site = `qa-leak-${RUN}.example.com`;
  await scanPost({ roles: [posting("leak", coName, "Fractional VP Sales", board, { domain: site })], sources: [{ source: board, fetched: 10, matched: 1 }] });
  const co = companyNamed(await adm.view(), coName);
  const li = `linkedin.com/company/qa-leak-${RUN}`;
  await adm.act({ type: "fill", entity: "company", id: co.id, field: "linkedin", value: li });
  await adm.act({ type: "fill", entity: "company", id: co.id, field: "hq", value: "Leaktown, TX" });
  const M = await member("Mo Mole");
  const v = await M.view();
  const c = v.companies.find((x) => x.id === co.id);
  check("the view hides the website and LinkedIn and cuts the HQ to its region", c?.hidden === true && c.cells.website?.s === "locked" && c.cells.linkedin?.s === "locked" && c.cells.hq?.v === "TX", c?.cells);
  await M.act(freeFill(v)); // so a refused report is about the company, not about having no fact
  const leaks = (r) => [site, li, "Leaktown"].some((x) => r.text.includes(x));
  for (const field of ["website", "linkedin", "hq"]) {
    const conf = await M.act({ type: "verify", entity: "company", id: co.id, field });
    check(`confirming a hidden company's ${field} is refused and returns no value`, conf.status === 400 && conf.json?.error === "There's nothing here to confirm. You can only confirm a fact you can see." && !leaks(conf), { status: conf.status, error: conf.json?.error, leaked: leaks(conf) });
    const rep = await M.act({ type: "report", entity: "company", id: co.id, field });
    check(`reporting a hidden company's ${field} is refused and returns no value`, rep.status === 400 && rep.json?.error === "There's nothing here to report. You can only report a fact you can see." && !leaks(rep), { status: rep.status, error: rep.json?.error, leaked: leaks(rep) });
  }
  const raw = await call("GET", "/api/table", { token: M.token, ipAddr: M.ip });
  const c2 = raw.json.companies.find((x) => x.id === co.id);
  check("after all of it the company is still hidden and nothing leaked into the view", c2.hidden === true && c2.cells.website?.s === "locked" && c2.cells.hq?.v === "TX" && !leaks(raw) && raw.json.me.credits === STARTER + 1, { hidden: c2.hidden, website: c2.cells.website?.s, credits: raw.json.me.credits });
  await M.act({ type: "unlock", entity: "company", id: co.id, field: "identity" });
  const ok = await M.act({ type: "verify", entity: "company", id: co.id, field: "website" });
  check("once the company is unlocked its website can be confirmed", ok.status === 200 && ok.json?.cells?.[0]?.cell?.v === site, ok.json);
  const hq = await M.act({ type: "verify", entity: "company", id: co.id, field: "hq" });
  check("and its full HQ comes back", hq.status === 200 && hq.json?.cells?.[0]?.cell?.v === "Leaktown, TX", hq.json);
});

// LOGIC-2: a hidden company, the role, the posting and the posted rate of its open role are one purchase.
section("bundle", async () => {
  if (!(await canScan())) return skip("unlock company checks", NEED_SCAN);
  const adm = await admin();
  if (!adm) return skip("unlock company checks", "no admin account (set ADMIN_TOKEN)");
  const board = `qa-rules-bundle-${RUN}`;
  const coName = `Qa Bundle Co ${RUN}`;
  const p = posting("bundle", coName, "Fractional VP Sales", board, { domain: `qa-bundle-${RUN}.example.com`, rate: "$150/hr" });
  await scanPost({ roles: [p], sources: [{ source: board, fetched: 10, matched: 1 }] });
  const co = companyNamed(await adm.view(), coName);
  const eid = co.engagements[0].id;
  const BOUGHT = `Unlocked ${coName}, the role, the posting and the posted rate for 1 credit.`;
  const seen = async (who) => {
    const v = await who.view();
    const c = v.companies.find((x) => x.id === co.id);
    const e = c.engagements.find((x) => x.id === eid);
    return { hidden: c.hidden, name: c.name === coName, role: e.cells.role?.s, posting: e.cells.posting?.s, rate: e.cells.rate?.s, holder: e.cells.operator?.s, website: c.cells.website?.s, credits: v.me.credits, unlocked: v.me.unlocked, ledger: v.ledger.length };
  };
  const whole = (x, spent) => x.hidden === false && x.name && x.role === "value" && x.posting === "value" && x.rate === "value" && x.website === "value" && x.credits === STARTER - spent;

  const M0 = await member("Nil Nopay");
  const before = await seen(M0);
  check("before paying, the company is hidden and role, posting and rate are locked", before.hidden === true && before.role === "locked" && before.posting === "locked" && before.rate === "locked", before);

  // Each of the four ways in costs 1 credit and opens all of it.
  for (const [n, field, entity, id] of [["Pia Posting", "posting", "engagement", eid], ["Rui Role", "role", "engagement", eid], ["Rae Rate", "rate", "engagement", eid], ["Ida Identity", "identity", "company", co.id]]) {
    const M = await member(n);
    const r = await M.act({ type: "unlock", entity, id, field });
    const got = (f) => r.json?.cells?.find((x) => x.id === eid && x.field === f)?.cell;
    check(`unlocking the ${field === "identity" ? "company" : field} of an open role at a hidden company costs 1 credit and names what it bought`, r.status === 200 && r.json?.message === BOUGHT && r.json?.me?.credits === STARTER - 1 && r.json.me.unlocked === 1, r.json?.error ?? r.json?.message);
    check(`it returns the role, the posting and the rate (asked for the ${field === "identity" ? "company" : field})`, got("role")?.v === "Fractional VP Sales" && got("posting")?.s === "value" && got("rate")?.v === "$150/hr" && r.json?.cells?.some((x) => x.id === co.id && x.field === "website" && x.cell.s === "value"), r.json?.cells?.map((x) => [x.field, x.cell.s]));
    const after = await seen(M);
    check(`afterwards the company, role, posting and rate show, for one ledger row (asked for the ${field === "identity" ? "company" : field})`, whole(after, 1) && after.unlocked === 1 && after.ledger === 1, after);
    for (const f of [["engagement", eid, "role"], ["engagement", eid, "posting"], ["engagement", eid, "rate"], ["company", co.id, "identity"]]) {
      const twice = await M.act({ type: "unlock", entity: f[0], id: f[1], field: f[2] });
      if (twice.json?.error !== "Nothing here is locked, so no credit was spent.") fail(`a second unlock of ${f[2]} buys nothing`, twice.json);
    }
    check("no part of it can be bought twice", (await seen(M)).credits === STARTER - 1);
  }

  // unlockMany never charges twice for parts of one purchase.
  const U = await member("Uli Unlockall");
  const many = await U.act({ type: "unlockMany", items: [{ entity: "company", id: co.id, field: "identity" }, { entity: "engagement", id: eid, field: "role" }, { entity: "engagement", id: eid, field: "posting" }, { entity: "engagement", id: eid, field: "rate" }] });
  check("unlockMany charges the company, role, posting and rate once", many.status === 200 && many.json?.me?.credits === STARTER - 1 && many.json?.message === BOUGHT, many.json?.error ?? many.json?.message);
  const uAfter = await seen(U);
  check("all four show afterwards", whole(uAfter, 1), uAfter);

  // At a company the member can see, the posted rate is part of the open role's one purchase too.
  const S = await member("Sid Seer");
  await S.act({ type: "add", company: coName, companyFields: { hq: "Austin, TX" } });
  const sBefore = await seen(S);
  const sRate = await S.act({ type: "unlock", entity: "engagement", id: eid, field: "rate" });
  const sGot = (f) => sRate.json?.cells?.find((x) => x.id === eid && x.field === f)?.cell;
  check(
    "a member who sees the company pays 1 for the posted rate, and the role and the posting come with it",
    sBefore.hidden === false && sRate.status === 200 && sRate.json?.message === "Unlocked the role, the posting and the posted rate for 1 credit." && sRate.json?.me?.credits === sBefore.credits - 1 && sGot("role")?.s === "value" && sGot("posting")?.s === "value" && sGot("rate")?.v === "$150/hr",
    [sBefore.hidden, sRate.json?.error ?? sRate.json?.message],
  );
  const sRole = await S.act({ type: "unlock", entity: "engagement", id: eid, field: "role" });
  check("  and the role is not sold again", sRole.json?.error === "Nothing here is locked, so no credit was spent.", sRole.json);

  // The role that came with the company was not paid for on its own: removing it refunds nothing.
  const V = await member("Val Viewer");
  const W = await member("Wim Viewer");
  for (const who of [V, W]) {
    await who.act({ type: "unlock", entity: "company", id: co.id, field: "identity" });
    await who.act({ type: "report", entity: "engagement", id: eid, field: "role" });
  }
  const rm = await adm.act({ type: "review", entity: "engagement", id: eid, field: "role", decision: "remove" });
  const vAfter = await seen(V);
  check("removing a role that came with the company refunds no extra credit", rm.status === 200 && vAfter.credits === STARTER - 1 && vAfter.role === "empty", { rm: rm.json, credits: vAfter.credits, role: vAfter.role });
});

// LOGIC-8: status is free. End stays locked.
section("status", async () => {
  const T = await member("Tess Teller");
  const U = await member("Uwe Onlooker");
  const v0 = await T.view();
  const h = host(v0);
  const add = await T.act({ type: "add", company: h.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: T.name, function: "Sales", type: "Fractional", role: "Fractional VP Sales", status: "Ended", start: "2024-02", end: "2025-01" } });
  const uv = await U.view();
  const e = engOf(uv, add.json?.id);
  check("status is free to see on a seat another member added", add.status === 200 && e?.cells.status?.s === "value" && e.cells.status.v === "Ended", e?.cells.status);
  check("end and role stay locked", e?.cells.end?.s === "locked" && e.cells.role?.s === "locked", [e?.cells.end?.s, e?.cells.role?.s]);
  let locked = 0;
  let statuses = 0;
  for (const x of cellsOf(uv)) if (x.entity === "engagement" && x.field === "status" && x.cell.s !== "empty") (statuses++, x.cell.s === "locked" && locked++);
  check("no status anywhere in the table is locked", statuses > 10 && locked === 0, { statuses, locked });
  const un = await U.act({ type: "unlock", entity: "engagement", id: add.json?.id, field: "status" });
  check("there is nothing to unlock on a status", un.json?.error === "Nothing here is locked, so no credit was spent." && (await U.view()).me.credits === STARTER, un.json);
});

// LOGIC-3: a seat holder controls their own seat.
section("seat", async () => {
  const adm = await admin();
  const Y = await member("Yara Yours");
  const T = await member("Tom Teller");
  const U = await member("Una Other");
  const h = host(await T.view());
  // Only the seat holder adds a seat: T can't pin one on Yara, by picking her or by typing her name.
  const picked = await T.act({
    type: "add", company: h.name, newEngagement: true, operatorMemberId: await T.pick("Yara Yours"),
    engagementFields: { function: "Sales", type: "Fractional", role: "Fractional VP Sales", operator: "Yara Yours", rate: "$2k/mo" },
  });
  const typed = await T.act({ type: "add", company: h.name, newEngagement: true, engagementFields: { function: "Sales", operator: "Yara Yours" } });
  check("a member can't add a seat another member held", picked.json?.error === SELF_ONLY && typed.json?.error === SELF_ONLY, [picked.json, typed.json]);
  // Yara adds the seat she held.
  const add = await Y.act({
    type: "add", company: h.name, newEngagement: true, operatorMemberId: "me",
    engagementFields: { function: "Sales", type: "Fractional", role: "Fractional VP Sales", operator: "Yara Yours", rate: "$2k/mo" },
  });
  const eid = add.json?.id;
  if (add.status !== 200 || !eid) return fail("seat: add a seat for Yara", add.json);
  check("the seat shows as hers", engOf(await Y.view(), eid)?.yours === true);
  const tEnd = await T.act({ type: "fill", entity: "engagement", id: eid, field: "end", value: "2025-01" });
  const uWhy = await U.act({ type: "fill", entity: "engagement", id: eid, field: "reason", value: "Build the function from scratch" });
  const tAdd = await T.act({ type: "add", company: h.name, engagementId: eid, engagementFields: { sourced: "Referral" } });
  check("nobody but the seat holder adds a fact to it, in a cell or through Add", [tEnd, uWhy, tAdd].every((r) => r.status === 400 && r.json?.error === HOLDER_ONLY), [tEnd.json, uWhy.json, tAdd.json]);
  const yWhy = await Y.act({ type: "fill", entity: "engagement", id: eid, field: "reason", value: "Build the function from scratch" });
  check("she can", yWhy.status === 200, yWhy.json);
  const buy = await U.act({ type: "unlock", entity: "engagement", id: eid, field: "rate" });
  check("others still unlock what she added", buy.status === 200 && buy.json?.cells?.[0]?.cell?.v === "$2k/mo", buy.json);

  // "This isn't me" on a seat she added herself takes her name off it.
  const not = await Y.act({ type: "notMine", engagementId: eid });
  check("this isn't me on her own seat unlinks it and sends the name to review", not.status === 200 && /^Got it\. That seat is no longer linked to you\./.test(not.json?.message ?? ""), not.json?.message ?? not.json);
  check("the seat is no longer hers", engOf(await Y.view(), eid)?.yours === false);
  const late = await Y.act({ type: "fill", entity: "engagement", id: eid, field: "sourced", value: "Referral" });
  check("and takes no more facts from her", late.status === 400 && late.json?.error === HOLDER_ONLY, late.json);

  // On a name from our own records it only unlinks, as before.
  const sm = seedHolders[seedHolders.length - 1];
  const S = sm ? new Client("Seed Holder", nextIp(), sm.token) : null;
  const sv = S ? await S.view() : null;
  if (!sv?.me) return skip("seed seat holder: this isn't me", "no seed file the server knows");
  const own = sv.companies.flatMap((c) => c.engagements).find((e) => e.yours && e.cells.operator?.s === "value" && !e.cells.operator.mine);
  if (!own) return skip("seed seat holder: this isn't me", "that seed member has no seat from our records");
  const sNot = await S.act({ type: "notMine", engagementId: own.id });
  const others = engOf(await U.view(), own.id)?.cells.operator;
  check("this isn't me on a name from our records only unlinks", sNot.status === 200 && sNot.json?.message === "Got it. That seat is no longer linked to you." && others?.s === "locked", { status: sNot.status, others: others?.s });
});

// LOGIC-14: who may report, and what a confirmation count means.
section("report", async () => {
  const P = await member("Pat Payer");
  const pv = await P.view();
  // A fact she pays for, on a company that is not hidden (so the unlock is that one fact).
  let paidFact = null;
  for (const x of cellsOf(pv)) if (!paidFact && x.entity === "engagement" && x.field === "role" && x.cell.s === "locked" && !x.company.hidden) paidFact = { entity: x.entity, id: x.id, field: x.field };
  const [free1, free2, free3, conf] = seedFacts(pv, 4);
  const un = await P.act({ type: "unlock", ...paidFact });
  const rep = await P.act({ type: "report", ...paidFact });
  check("a member who unlocked a fact can report it without having added one", un.status === 200 && rep.status === 200 && rep.json?.message === "Reported. It's hidden for you now, and an admin will review it.", rep.json);
  const freeRep = await P.act({ type: "report", ...free1 });
  check("a free fact still needs a fact added first", freeRep.status === 400 && freeRep.json?.error === "Reporting opens once you've added a fact of your own. Add one first.", freeRep.json);

  const Q = await member("Quin Quiet");
  const bench = await Q.act({ type: "benchRate", pricing: "Hourly", rate: "$150/hr", function: "Sales" });
  const qRep = await Q.act({ type: "report", ...free2 });
  check("a benchmark-only rate is not the fact that lets a member report", bench.status === 200 && qRep.status === 400 && qRep.json?.error === "Reporting opens once you've added a fact of your own. Add one first.", { bench: bench.status, report: qRep.json });
  await Q.act(freeFill(await Q.view()));
  const qRep2 = await Q.act({ type: "report", ...free3 });
  check("a fact on a record is", qRep2.status === 200, qRep2.json);

  // Confirmations count members only. Our own records and the scan say where a fact came from.
  const V = await member("Vic Viewer");
  const vv = await V.view();
  let records = 0;
  let lockedFrom = 0;
  let wrong = 0;
  let memberFrom = 0;
  for (const x of cellsOf(vv)) {
    const c = x.cell;
    if (c.s !== "value" && c.s !== "locked") continue;
    if (c.from !== undefined && c.from !== "records" && c.from !== "posting") wrong++;
    if (c.from === "records") (records++, c.s === "locked" && lockedFrom++, c.ver !== 0 && wrong++);
    if (c.s === "value" && c.mine && c.from !== undefined) memberFrom++;
  }
  check("facts from our own records carry from 'records' and no confirmation", records > 100 && lockedFrom > 0 && wrong === 0, { records, lockedFrom, wrong });
  const seedCell = findCell(vv, conf.entity, conf.id, conf.field);
  check("a seed fact nobody confirmed has ver 0", seedCell?.ver === 0 && seedCell.from === "records", seedCell && { ver: seedCell.ver, from: seedCell.from });
  const c1 = await V.act({ type: "verify", ...conf });
  check("confirming it gives the real count: 1 confirmation", c1.status === 200 && /\. That makes 1 confirmation\.$/.test(c1.json?.message ?? "") && c1.json?.cells?.[0]?.cell?.ver === 1 && c1.json.cells[0].cell.iv === true && c1.json.cells[0].cell.from === "records", { message: c1.json?.message?.replace(/^Confirmed [^.]+/, "Confirmed …"), ver: c1.json?.cells?.[0]?.cell?.ver });
  const mine = freeFill(vv);
  const f = await V.act(mine);
  check("a fact a member added carries no from", f.status === 200 && f.json?.cells?.[0]?.cell?.s === "value" && !("from" in f.json.cells[0].cell) && memberFrom === 0, f.json?.cells?.[0]?.cell && Object.keys(f.json.cells[0].cell));
  const other = findCell(await P.view(), mine.entity, mine.id, mine.field);
  check("for other members too", other?.s === "value" && other.ver === 0 && !("from" in other), other && Object.keys(other));
  if (await canScan()) {
    const board = `qa-rules-from-${RUN}`;
    const coName = `Qa From Co ${RUN}`;
    await scanPost({ roles: [posting("from", coName, "Fractional Head of Growth", board)], sources: [{ source: board, fetched: 10, matched: 1 }] });
    const adm = await admin();
    const e = adm ? companyNamed(await adm.view(), coName)?.engagements[0] : null;
    if (e) check("facts the scan read carry from 'posting'", e.cells.role?.from === "posting" && e.cells.role.ver === 0 && e.cells.posting?.from === "posting", { role: e.cells.role?.from, posting: e.cells.posting?.from });
    const asMember = e ? engOf(await V.view(), e.id) : null;
    check("a member who hasn't unlocked them sees the same on the locked cells", asMember?.cells.role?.s === "locked" && asMember.cells.role.from === "posting", asMember?.cells.role);
  } else skip("scan facts carry from 'posting'", NEED_SCAN);
});

// ECON-7: when an admin keeps a reported fact, the same reporters can't report it again.
section("keep", async () => {
  const adm = await admin();
  if (!adm) return skip("keep checks", "no admin account (set ADMIN_TOKEN)");
  const C = await member("Cal Crier");
  const D = await member("Dee Crier");
  const E = await member("Eli Else");
  const cv = await C.view();
  for (const who of [C, D, E]) await who.act(freeFill(cv));
  const [t] = seedFacts(cv, 1);
  await C.act({ type: "report", ...t });
  await D.act({ type: "report", ...t });
  check("two reports hide the fact", findCell(await E.view(), t.entity, t.id, t.field)?.s === "reported");
  const keep = await adm.act({ type: "review", ...t, decision: "keep" });
  check("the admin keeps it", keep.json?.message === "Kept. It shows for everyone again." && findCell(await C.view(), t.entity, t.id, t.field)?.s === "value", keep.json);
  const KEPT = "An admin reviewed this fact and kept it, so you can't report it again.";
  const c2 = await C.act({ type: "report", ...t });
  const d2 = await D.act({ type: "report", ...t });
  check("neither reporter can report it again", c2.status === 400 && c2.json?.error === KEPT && d2.status === 400 && d2.json?.error === KEPT, [c2.json, d2.json]);
  check("it stays visible to them", findCell(await C.view(), t.entity, t.id, t.field)?.s === "value" && findCell(await D.view(), t.entity, t.id, t.field)?.s === "value");
  const e1 = await E.act({ type: "report", ...t });
  check("a member who had not reported it still can", e1.status === 200 && e1.json?.message === "Reported. It's hidden for you now, and an admin will review it.", e1.json);
});

// LOGIC-13: a rate is paid once per seat, whichever way it is shared.
section("rate", async () => {
  const M = await member("Mia Money");
  const h = host(await M.view());
  const seat = await M.act({ type: "add", company: h.name, newEngagement: true, operatorMemberId: "me", engagementFields: { function: "RevOps", type: "Fractional", role: "Fractional RevOps Lead", operator: "Mia Money" } });
  const eid = seat.json?.id;
  if (seat.status !== 200 || !eid) return fail("rate: add your own seat", seat.json);
  const priv = await M.act({ type: "benchRate", engagementId: eid, pricing: "Monthly retainer", rate: "$10k/mo" });
  const v1 = await M.view();
  check("a benchmark-only rate on your own seat earns 1", priv.status === 200 && v1.me.benchRates.some((b) => b.engagementId === eid) && /You earned 1 credit\./.test(priv.json?.message ?? ""), priv.json);
  const pub = await M.act({ type: "fill", entity: "engagement", id: eid, field: "rate", value: "$10k/mo" });
  const v2 = await M.view();
  check("adding the rate to the record afterwards earns nothing more", pub.status === 200 && v2.me.credits === v1.me.credits && !/You earned/.test(pub.json?.message ?? ""), { message: pub.json?.error ?? pub.json?.message, credits: [v1.me.credits, v2.me.credits] });
  check("the message says the private rate was replaced", /^Added the rate\. This rate replaces the one you shared privately, which already earned its credit\.$/.test(pub.json?.message ?? ""), pub.json?.message);
  check("the private rate is gone and the rate is on the record", !v2.me.benchRates.some((b) => b.engagementId === eid) && engOf(v2, eid)?.cells.rate?.v === "$10k/mo" && engOf(v2, eid).cells.rate.mine === true, { bench: v2.me.benchRates.length, rate: engOf(v2, eid)?.cells.rate });
  const rows = v2.ledger.filter((l) => /^Rate/.test(l.field));
  check("the ledger has one +1 for the rate, on the record", rows.length === 1 && rows[0].delta === 1 && rows[0].field === "Rate" && rows[0].company === h.name && v2.me.added === v1.me.added, rows.map((l) => [l.field, l.delta]));
  const back = await M.act({ type: "benchRate", engagementId: eid, pricing: "Monthly retainer", rate: "$10k/mo" });
  check("it can't be shared privately again on top", back.status === 400 && /already on this seat/.test(back.json?.error ?? ""), back.json);
  const adm = await admin();
  if (!adm) return skip("rate removal", "no admin account (set ADMIN_TOKEN)");
  const rm = await adm.act({ type: "adminRemove", entity: "engagement", id: eid, field: "rate" });
  check("removing that rate takes back the one credit it earned", rm.status === 200 && (await M.view()).me.credits === v2.me.credits - 1, { rm: rm.json, credits: (await M.view()).me.credits });
});

// ECON-5, LOGIC-5: admins can remove a member-added fact, or everything a member added.
section("admin", async () => {
  const adm = await admin();
  if (!adm) return skip("admin removal checks", "no admin account (set ADMIN_TOKEN)");
  const J = await member("Jay Junk");
  const K = await member("Kit Keen");
  const coName = `Qa Junk Co ${RUN}`;
  const add = await J.act({
    type: "add", company: coName, companyFields: { industry: "SaaS", hq: "Austin, TX" }, operatorMemberId: "me",
    engagementFields: { operator: J.name, function: "Sales", type: "Fractional", role: "Fractional VP Sales", pricing: "Monthly retainer", rate: "$9k/mo" },
    people: [{ name: "Pat Junk", title: "CEO" }],
  });
  if (add.status !== 200) return fail("admin: add a made-up company", add.json);
  const elsewhere = freeFill(await J.view());
  await J.act(elsewhere);
  await J.act({ type: "benchRate", pricing: "Hourly", rate: "$150/hr", function: "Sales" });
  const j0 = (await J.view()).me;
  check("the member earned for every fact", j0.credits === STARTER + 12 && j0.benchRates.length === 1, { credits: j0.credits, bench: j0.benchRates.length });
  const kv = await K.view();
  const junk = companyNamed(kv, coName);
  const eid = junk.engagements[0].id;
  const pid = junk.engagements[0].people[0]?.id ?? junk.people[0]?.id;
  await K.act({ type: "unlockMany", items: [{ entity: "engagement", id: eid, field: "rate" }, { entity: "contact", id: pid, field: "name" }] });
  check("another member paid 2 credits to see two of the facts", (await K.view()).me.credits === STARTER - 2);

  const notAdmin1 = await K.act({ type: "adminRemove", entity: "engagement", id: eid, field: "rate" });
  const notAdmin2 = await K.act({ type: "adminRemoveMember", memberId: await K.pick("Jay Junk") });
  check("both removals are for admins", notAdmin1.json?.error === "Only admins can remove a fact." && notAdmin2.json?.error === "Only admins can remove a member's facts.", [notAdmin1.json, notAdmin2.json]);

  // One fact, with no report on it.
  const rm = await adm.act({ type: "adminRemove", entity: "engagement", id: eid, field: "rate" });
  check("adminRemove takes an unreported fact off the table", rm.status === 200 && rm.json?.message === "Removed. Anyone who unlocked it got their credit back, and it can be added again." && rm.json?.cells?.[0]?.cell?.s === "empty", rm.json);
  check("the field reopens for everyone", engOf(await K.view(), eid)?.cells.rate?.s === "empty");
  check("the member who added it loses that credit, the unlocker gets theirs back", (await J.view()).me.credits === j0.credits - 1 && (await K.view()).me.credits === STARTER - 1, [(await J.view()).me.credits, (await K.view()).me.credits]);
  const twice = await adm.act({ type: "adminRemove", entity: "engagement", id: eid, field: "rate" });
  check("removing it twice is refused", twice.status === 400 && twice.json?.error === "There's nothing to remove on this one. It may already be gone.", twice.json);
  const [seedFact] = seedFacts(kv, 1);
  const noSeed = await adm.act({ type: "adminRemove", ...seedFact });
  check("a fact from our own records can't be removed this way", noSeed.status === 400 && findCell(await K.view(), seedFact.entity, seedFact.id, seedFact.field)?.s === "value", noSeed.json?.error);

  // Everything one member added.
  const unknown = await adm.act({ type: "adminRemoveMember", memberId: "j_AAAAAAAAAAAA" });
  check("an unknown member is refused", unknown.status === 400 && unknown.json?.error === "We couldn't find that member. Refresh the page and try again.", unknown.json);
  const all = await adm.act({ type: "adminRemoveMember", memberId: await adm.pick("Jay Junk") });
  check("adminRemoveMember says what it removed", all.status === 200 && all.json?.message === "Removed 10 facts, 1 private rate and 3 empty records that Jay Junk added. The credits they earned came off their balance, and anyone who unlocked them got their credit back.", all.json?.error ?? all.json?.message);
  const j1 = await J.view();
  check("every credit the member earned is taken back", j1.me.credits === STARTER && j1.me.benchRates.length === 0, { credits: j1.me.credits, bench: j1.me.benchRates.length });
  const av = await adm.view();
  check("the made-up company, its seat and its person are gone", !companyNamed(av, coName) && !companyNamed(j1, coName) && !engOf(av, eid), { company: !!companyNamed(av, coName) });
  check("a fact they added to a real company is gone and the field is open again", findCell(av, elsewhere.entity, elsewhere.id, elsewhere.field)?.s === "empty", findCell(av, elsewhere.entity, elsewhere.id, elsewhere.field));
  check("the member who paid to see a fact of theirs is refunded", (await K.view()).me.credits === STARTER, (await K.view()).me.credits);
  const none = await adm.act({ type: "adminRemoveMember", memberId: await adm.pick("Jay Junk") });
  check("a second run finds nothing", none.status === 200 && none.json?.message === "Jay Junk has nothing on the table to remove.", none.json);
  // A record someone else added to stays, with their fact on it.
  const L = await member("Lou Litter");
  const N = await member("Ned Neighbor");
  const shared = `Qa Shared Co ${RUN}`;
  await L.act({ type: "add", company: shared, companyFields: { industry: "SaaS" } });
  const sc = companyNamed(await N.view(), shared);
  await N.act({ type: "fill", entity: "company", id: sc.id, field: "hq", value: "Boise, ID" });
  await adm.act({ type: "adminRemoveMember", memberId: await adm.pick("Lou Litter") });
  const kept = companyNamed(await N.view(), shared);
  check("a company another member added a fact to stays, with that fact", kept?.cells.hq?.v === "Boise, ID" && kept.cells.industry?.s === "empty" && (await N.view()).me.credits === STARTER + 1, kept?.cells);
});

// Repair round, LOGIC-2: one price for an open role, whoever the member is and in whatever order they buy.
section("price", async () => {
  if (!(await canScan())) return skip("open role price checks", NEED_SCAN);
  const adm = await admin();
  if (!adm) return skip("open role price checks", "no admin account (set ADMIN_TOKEN)");
  const board = `qa-rules-price-${RUN}`;
  const coName = `Qa Price Co ${RUN}`;
  const p1 = posting("price1", coName, "Fractional VP Sales", board);
  const keep = posting("pricekeep", `Qa Price Keeper ${RUN}`, "Fractional CMO", board);
  await scanPost({ roles: [p1, keep], sources: [{ source: board, fetched: 10, matched: 2 }] });
  const coId = companyNamed(await adm.view(), coName)?.id;
  const e1 = companyNamed(await adm.view(), coName)?.engagements[0]?.id;
  const cellsBack = (r, id) => ["role", "posting"].map((f) => r.json?.cells?.find((c) => c.id === id && c.field === f)?.cell?.s);

  // Bought the company and its open role last week. Then the scan adds a second role there.
  const W = await member("Wes Weekbefore");
  await W.act({ type: "unlock", entity: "company", id: coId, field: "identity" });
  const p2 = posting("price2", coName, "Fractional CMO", board);
  await scanPost({ roles: [p1, p2, keep], sources: [{ source: board, fetched: 10, matched: 3 }] });
  const e2 = companyNamed(await adm.view(), coName)?.engagements.find((e) => e.id !== e1)?.id;
  const w = await W.act({ type: "unlockMany", items: [{ entity: "engagement", id: e2, field: "role" }, { entity: "engagement", id: e2, field: "posting" }, { entity: "company", id: coId, field: "identity" }] });
  check(
    "a member who already sees the company pays 1 for a new open role's title and posting together (LOGIC-2)",
    w.status === 200 && w.json?.message === "Unlocked the role and the posting for 1 credit." && w.json?.me?.credits === STARTER - 2,
    w.json?.error ?? [w.json?.message, w.json?.me?.credits],
  );
  check("  and both come back", cellsBack(w, e2).every((x) => x === "value"), cellsBack(w, e2));

  // Sees the company because they added a fact there: the title alone brings the posting.
  const A = await member("Ada Added");
  await A.act({ type: "add", company: coName, companyFields: { hq: "Austin, TX" } });
  const aRole = await A.act({ type: "unlock", entity: "engagement", id: e1, field: "role" });
  const aPost = await A.act({ type: "unlock", entity: "engagement", id: e1, field: "posting" });
  check(
    "a member the company is not hidden from pays 1 for an open role's title, and its posting comes with it",
    aRole.status === 200 && aRole.json?.message === "Unlocked the role and the posting for 1 credit." && aPost.json?.error === "Nothing here is locked, so no credit was spent." && (await A.view()).me.credits === STARTER,
    [aRole.json?.error ?? aRole.json?.message, aPost.json, (await A.view()).me.credits],
  );

  // Bought while a claim had closed the role, then the claim came off.
  if (vouchers.length < 2) return skip("bought while closed", NEED_SEED);
  const soloName = `Qa Price Solo Co ${RUN}`;
  const p3 = posting("price3", soloName, "Fractional RevOps Lead", board);
  await scanPost({ roles: [p1, p2, p3, keep], sources: [{ source: board, fetched: 10, matched: 4 }] });
  const solo = companyNamed(await adm.view(), soloName);
  const e3 = solo?.engagements[0]?.id;
  const K = await member("Kai Claimer");
  await vouch(K);
  const kClaim = await K.act({ type: "add", company: soloName, engagementId: e3, operatorMemberId: "me", engagementFields: { operator: "Kai Claimer" } });
  const M = await member("Moe Midway");
  const L = await member("Lia Linkonly");
  const mRole = await M.act({ type: "unlock", entity: "engagement", id: e3, field: "role" });
  const mPost = await M.act({ type: "unlock", entity: "engagement", id: e3, field: "posting" });
  const lPost = await L.act({ type: "unlock", entity: "engagement", id: e3, field: "posting" });
  check("while the claim holds, the role and the posting of the closed role are separate facts", kClaim.status === 200 && mRole.status === 200 && mPost.status === 200 && lPost.status === 200 && (await M.view()).me.credits === STARTER - 2, [kClaim.json?.error, mRole.json?.error, mPost.json?.error, (await M.view()).me.credits]);
  await K.act({ type: "notMine", engagementId: e3 });
  const mv = await M.view();
  check("when the role reopens, a member who paid for its title and posting still sees the company (no third credit)", companyNamed(mv, soloName)?.hidden === false && mv.me.credits === STARTER - 2, { hidden: mv.companies.find((c) => c.id === solo?.id)?.hidden, credits: mv.me.credits });
  const mCo = await M.act({ type: "unlock", entity: "company", id: solo?.id, field: "identity" });
  check("  and there is nothing more to buy", mCo.json?.error === "Nothing here is locked, so no credit was spent.", mCo.json);
  const lRole = await L.act({ type: "unlock", entity: "engagement", id: e3, field: "role" });
  check(
    "a member who paid only for the posting gets the title at no charge",
    lRole.status === 200 && lRole.json?.message === "Unlocked the role. You had already paid for this open role, so no credit was spent." && lRole.json?.me?.credits === STARTER - 1 && cellsBack(lRole, e3)[0] === "value",
    lRole.json?.error ?? [lRole.json?.message, lRole.json?.me?.credits],
  );
});

// Repair round, LOGIC-3: a second account with a member's exact name does not take their seats.
section("twin", async () => {
  const sm = seedHolders[1];
  const S = sm ? new Client("Seed Holder", nextIp(), sm.token) : null;
  const sv = S ? await S.view() : null;
  if (!sv?.me) return skip("a member's twin", "no seed file the server knows");
  const mine0 = sv.companies.flatMap((c) => c.engagements).filter((e) => e.yours);
  const { client: X } = await join(sm.name, { email: `qa+${RUN}-twin-${Math.random().toString(36).slice(2, 8)}@example.com` });
  check("a new account can still join with a member's exact name", !!X);
  if (!X) return;
  const sv1 = await S.view();
  const mine1 = sv1.companies.flatMap((c) => c.engagements.map((e) => ({ ...e, company: c }))).filter((e) => e.yours);
  check("the member's seats stay theirs (LOGIC-3)", mine0.length > 0 && mine1.length === mine0.length, [mine0.length, mine1.length]);
  const own = mine1.find((e) => e.cells.operator?.s === "value" && !e.cells.operator.mine);
  check("their own name on their seat is still theirs to see", !!own && own.cells.operator.member?.you === true, own?.cells.operator?.s);
  const xv = await X.view();
  check("the new account holds none of those seats", mine1.every((e) => engOf(xv, e.id)?.yours !== true));
  const xNot = await X.act({ type: "notMine", engagementId: own?.id });
  check("and can't say This isn't me on them", xNot.status === 400 && xNot.json?.error === "That seat isn't linked to you.", xNot.json);
  // Nobody else can put a fact on the member's seat. What our records say there, the member still hides at once.
  const Z = await member("Zoe Stranger");
  const zv = await Z.view();
  const empty = mine1.find((e) => e.cells.rate?.s === "empty" && !e.company.hidden && engOf(zv, e.id) && !engOf(zv, e.id).company.hidden);
  if (empty) {
    const put = await Z.act({ type: "fill", entity: "engagement", id: empty.id, field: "rate", value: "$2k/mo" });
    check("a stranger can't put a rate on the member's seat", put.status === 400 && put.json?.error === HOLDER_ONLY, put.json);
  }
  const FREE_SEAT = ["function", "type", "start", "reason", "pricing"];
  const target = mine1.find((e) => !e.company.hidden && engOf(zv, e.id) && FREE_SEAT.some((f) => e.cells[f]?.s === "value" && e.cells[f].from === "records"));
  if (!target) return skip("twin: the holder's report", "the member's seats have no free fact from our records");
  const field = FREE_SEAT.find((f) => target.cells[f]?.s === "value" && target.cells[f].from === "records");
  const rep = await S.act({ type: "report", entity: "engagement", id: target.id, field });
  check("the holder's report on a fact on their own seat still hides it for everyone", rep.status === 200 && rep.json?.message === "Reported. It's hidden for everyone until an admin reviews it." && engOf(await Z.view(), target.id)?.cells[field]?.s === "reported", rep.json);
  const not = await S.act({ type: "notMine", engagementId: own.id });
  check("and This isn't me still works for them", not.status === 200, not.json);
});

// Repair round: open roles a member adds (N1, N3), reports on a listed role (N2), naming yourself on someone else's seat (N4), This isn't me first (N7).
section("repair", async () => {
  if (!(await canScan())) return skip("repair round checks", NEED_SCAN);
  const adm = await admin();
  if (!adm) return skip("repair round checks", "no admin account (set ADMIN_TOKEN)");
  const board = `qa-rules-repair-${RUN}`;
  const keep = posting("repkeep", `Qa Repair Keeper ${RUN}`, "Fractional CMO", board);
  const B = await member("Bea Bystander");

  // N3: a member's word that a seat is open shows it as open and hides nothing.
  const P = await member("Pre Registrar");
  const hostCo = host(await P.view());
  // (A title of its own: Add puts details into a seat there with the same title.)
  const fake = await P.act({ type: "add", company: hostCo.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: P.name, function: "Sales", role: `Fractional Sales Lead ${RUN}`, status: "Open role" } });
  const bv = await B.view();
  check("a member-added open role does not hide a company that was free a minute before (N3)", fake.status === 200 && companyNamed(bv, hostCo.name)?.hidden === false && engOf(bv, fake.json?.id)?.cells.status?.v === "Open role", { status: fake.status, hidden: companyNamed(bv, hostCo.name)?.hidden, msg: fake.json?.message, cell: engOf(bv, fake.json?.id)?.cells.status });

  // N1: a member adds the role before the scan finds it, then marks it ended.
  const preName = `Qa Prereg Co ${RUN}`;
  const pre = await P.act({ type: "add", company: preName, operatorMemberId: "me", engagementFields: { operator: P.name, function: "Marketing", role: "Fractional VP Marketing", status: "Open role" } });
  const listed = { roles: [posting("prereg", preName, "Fractional VP Marketing", board), keep], sources: [{ source: board, fetched: 10, matched: 2 }] };
  await scanPost(listed);
  const adopted = engOf(await B.view(), pre.json?.id);
  check("the scan takes the member's seat as the role it follows, and its status is the posting's", !!adopted && adopted.company.hidden === true && adopted.cells.status?.v === "Open role" && adopted.cells.status.from === "posting" && !!adopted.opened, adopted && { hidden: adopted.company.hidden, status: adopted.cells.status, opened: adopted.opened });
  const ended = await P.act({ type: "fill", entity: "engagement", id: pre.json?.id, field: "status", value: "Ended" });
  const after = engOf(await B.view(), pre.json?.id);
  check("the member who added it can't close it for everyone by editing the status (N1)", ended.status === 400 && after?.company.hidden === true && after.cells.status?.v === "Open role" && after.closed === null, [ended.json, after?.cells.status?.v]);
  const rm = await adm.act({ type: "adminRemove", entity: "engagement", id: pre.json?.id, field: "status" });
  check("its status is the scan's now, so there is no member fact to remove", rm.status === 400 && engOf(await B.view(), pre.json?.id)?.closed === null, rm.json);

  // N2: two members who bought a listed role report its title and its link.
  const roleName = `Qa Reported Co ${RUN}`;
  await scanPost({ roles: [...listed.roles, posting("reported", roleName, "Fractional Head of Growth", board)], sources: [{ source: board, fetched: 10, matched: 3 }] });
  const rc = companyNamed(await adm.view(), roleName);
  const re = rc?.engagements[0]?.id;
  for (const n of ["Rex Reporter", "Roz Reporter"]) {
    const R = await member(n);
    await R.act({ type: "unlock", entity: "company", id: rc?.id, field: "identity" });
    for (const field of ["role", "posting"]) await R.act({ type: "report", entity: "engagement", id: re, field });
  }
  const Q = await member("Quin Later");
  const q = await Q.act({ type: "unlock", entity: "engagement", id: re, field: "posting" });
  const qe = engOf(await Q.view(), re);
  check("two reports don't blank a listed role's title and link for others (N2)", q.status === 200 && qe?.cells.role?.s === "value" && qe.cells.posting?.s === "value", [q.json?.error ?? q.json?.message, qe?.cells.role?.s, qe?.cells.posting?.s]);
  const rows = (await adm.view()).reported.filter((r) => r.id === re);
  check("  the admin's review list still has both, with both reporters", rows.length === 2 && rows.every((r) => r.reporters.length === 2), rows.map((r) => [r.field, r.reporters.length]));

  // N4: naming yourself on a seat somebody else made and holds.
  const Mk = await member("Max Maker");
  const mHost = host(await Mk.view());
  const made = await Mk.act({ type: "add", company: mHost.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: Mk.name, function: "Sales", role: "Fractional VP Sales", rate: "$8k/mo", end: "2024-06", sourced: "Referral" } });
  const Sn = await member("Sid Selfnamer");
  const self = await Sn.act({ type: "fill", entity: "engagement", id: made.json?.id, field: "operator", value: "x", memberId: "me" });
  const sSeat = engOf(await Sn.view(), made.json?.id);
  const sFill = await Sn.act({ type: "fill", entity: "engagement", id: made.json?.id, field: "hours", value: "10" });
  check("naming yourself on someone else's seat is refused and shows you none of its locked facts free (N4)", self.status === 400 && sFill.json?.error === HOLDER_ONLY && sSeat?.yours === false && sSeat.cells.rate?.s === "locked" && (await Sn.view()).me.credits === STARTER, [self.json?.error, sFill.json?.error, sSeat?.yours, sSeat?.cells.rate?.s]);
  const sRep = await Sn.act({ type: "report", entity: "engagement", id: made.json?.id, field: "end" });
  check("  and gives no power to hide them for everyone", sRep.status === 400 && engOf(await B.view(), made.json?.id)?.cells.end?.s === "locked", [sRep.json, engOf(await B.view(), made.json?.id)?.cells.end?.s]);

  // N7: a seat made up about a member can't be added at all: members add only seats they held.
  const Tg = await member("Tia Target");
  await Tg.view();
  const Iv = await member("Ivo Inventor");
  const iHost = host(await Iv.view());
  const inv = await Iv.act({
    type: "add", company: iHost.name, newEngagement: true, operatorMemberId: await Iv.pick("Tia Target"),
    engagementFields: { function: "Sales", role: "Fractional VP Sales", operator: "Tia Target", rate: "$1k/mo" },
  });
  check("a seat made up about another member is refused (N7)", inv.status === 400 && inv.json?.error === SELF_ONLY, inv.json);
});

/* ---------- round 5 ---------- */

const OPEN_NO_DATES = "This role is still open, so it has no start or end yet.";
const OPEN_NO_HIRE = "This role is still open, so nobody has been hired for it yet.";
const OPEN_NO_END = "This role is still open, so it has no end yet.";
const END_BEFORE_START = "The end month can't be before the start.";
const ACTIVE_NO_END = "An active seat has no end month yet. Pick Ongoing, or change the status to Ended.";
const ENDED_NOT_ACTIVE = "This seat has an end month, so it isn't active. Pick Ended, or change the end month.";

// FIRST-4, DESK-10: a seat can't say what can't be true, and a guessed date on an open role earns nothing.
section("dates", async () => {
  if (!(await canScan())) return skip("date checks", NEED_SCAN);
  const adm = await admin();
  if (!adm) return skip("date checks", "no admin account (set ADMIN_TOKEN)");
  const board = `qa-rules-dates-${RUN}`;
  const coName = `Qa Dates Co ${RUN}`;
  await scanPost({ roles: [posting("dates", coName, "Fractional Head of Growth", board)], sources: [{ source: board, fetched: 10, matched: 1 }] });
  const co = companyNamed(await adm.view(), coName);
  const eid = co?.engagements[0]?.id;
  const D = await member("Dee Dates");
  await D.act({ type: "unlock", entity: "company", id: co.id, field: "identity" });
  const fill = (who, id, field, value) => who.act({ type: "fill", entity: "engagement", id, field, value });
  for (const [field, value, want] of [
    ["start", "2025-01", OPEN_NO_DATES],
    ["end", "2025-06", OPEN_NO_DATES],
    ["end", "Ongoing", OPEN_NO_DATES],
    ["reason", "Build the function from scratch", OPEN_NO_HIRE],
    ["sourced", "Referral", OPEN_NO_HIRE],
  ]) {
    // Nobody holds it, so nobody adds facts to it: the posting's facts come from the scan.
    const r = await fill(D, eid, field, value);
    check(`an open role nobody holds refuses ${field} ${value} (${want === OPEN_NO_DATES ? "no dates yet" : "nobody hired yet"}, and only a seat holder adds facts)`, r.status === 400 && r.json?.error === HOLDER_ONLY, r.json);
  }
  const viaAdd = await D.act({ type: "add", company: coName, engagementId: eid, engagementFields: { start: "2025-01", hours: "10" } });
  check("the same through Add, and nothing else in that Add is saved", viaAdd.status === 400 && viaAdd.json?.error === HOLDER_ONLY && engOf(await D.view(), eid)?.cells.hours?.s === "empty", viaAdd.json);
  const rate = await fill(D, eid, "rate", "$150/hr");
  const hours = await fill(D, eid, "hours", "20");
  check("members don't add a posted rate or hours to an open role nobody holds", rate.json?.error === HOLDER_ONLY && hours.json?.error === HOLDER_ONLY, [rate.json, hours.json]);
  check("refused guesses earned nothing", (await D.view()).me.credits === STARTER - 1, (await D.view()).me.credits);

  // Any seat: the end can't come before the start.
  const h = host(await D.view());
  const seat = (fields) => D.act({ type: "add", company: h.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: D.name, function: "Growth", ...fields } });
  const backwards = await seat({ role: `Fractional Growth Lead ${RUN}`, start: "2025-03", end: "2023-01" });
  check("an Add with the end before the start is refused", backwards.status === 400 && backwards.json?.error === END_BEFORE_START, backwards.json);
  const sameYear = await seat({ role: `Growth Advisor ${RUN}`, start: "2024-05", end: "2024" });
  const sy = engOf(await D.view(), sameYear.json?.id);
  check("an end given as a year compares by the year", sameYear.status === 200 && sy?.cells.end?.v === "2024", sameYear.json);
  check("a dated end with no status marks the seat Ended", sy?.cells.status?.v === "Ended", sy?.cells.status);
  const statusEarned = (await D.view()).ledger.filter((l) => l.reason === "fill" && l.field === "Status").length;
  check("the Ended it sets earns no extra credit", statusEarned === 0, statusEarned);

  // DESK-10: an active seat has no dated end, and a seat with a dated end isn't active.
  const active = await seat({ role: `Interim Growth Lead ${RUN}`, status: "Active", start: "2024-01" });
  const aid = active.json?.id;
  const dated = await fill(D, aid, "end", "2024-09");
  check("after Active, a dated end is refused", dated.status === 400 && dated.json?.error === ACTIVE_NO_END, dated.json);
  const both = await seat({ role: `Growth Consultant ${RUN}`, status: "Active", end: "2024-09" });
  check("Active and a dated end in one Add are refused", both.status === 400 && both.json?.error === ACTIVE_NO_END, both.json);
  const ongoing = await fill(D, aid, "end", "Ongoing");
  check("after Active, Ongoing goes in", ongoing.status === 200, ongoing.json);

  const later = await seat({ role: `Growth Partner ${RUN}`, start: "2023-02" });
  const lid = later.json?.id;
  const ended = await fill(D, lid, "end", "2024-02");
  check(
    "a dated end on a seat with no status sets it to Ended, and says so in the cells",
    ended.status === 200 && ended.json?.cells?.some((c) => c.field === "status" && c.cell?.v === "Ended"),
    ended.json,
  );
  const moved = await fill(D, lid, "start", "2024-06");
  check("moving your own start past the end you gave is refused", moved.status === 400 && moved.json?.error === END_BEFORE_START, moved.json);
  const nowActive = await fill(D, lid, "status", "Active");
  check("calling a seat with a dated end Active is refused", nowActive.status === 400 && nowActive.json?.error === ENDED_NOT_ACTIVE, nowActive.json);
  // FIRST-15: reasons that fit a seat outside sales.
  const why1 = await fill(D, lid, "reason", "Cover while hiring full-time");
  const why2 = await fill(D, aid, "reason", "Build the function from scratch");
  check("the two hire reasons for any function go in", why1.status === 200 && why2.status === 200, [why1.json, why2.json]);

  // A locked end is never compared, so a refusal can't be used to guess it.
  const O = await member("Ola Othermember");
  const noStart = await D.act({ type: "add", company: h.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: D.name, function: "Growth", role: `Growth Lead Two ${RUN}`, end: "2024-02" } });
  const o = engOf(await O.view(), noStart.json?.id);
  const guess = await fill(O, noStart.json?.id, "start", "2025-01");
  check("another member's start is refused for who they are, never checked against an end they can't see", o?.cells.end?.s === "locked" && guess.status === 400 && guess.json?.error === HOLDER_ONLY, [o?.cells.end?.s, guess.json]);

  // A role somebody holds can have its dates.
  const held = await D.act({ type: "add", company: h.name, newEngagement: true, operatorMemberId: "me", engagementFields: { function: "Growth", role: `Growth Head ${RUN}`, status: "Open role", operator: D.name } });
  const hs = await fill(D, held.json?.id, "start", "2025-01");
  const he = await fill(D, held.json?.id, "end", "2025-02");
  check("an open role with a seat holder takes a start, but not an end while it is open", hs.status === 200 && he.status === 400 && he.json?.error === OPEN_NO_END, [hs.json, he.json]);
});

// Decision 10: Undo. A member takes back a fact they added while nobody has paid for it or confirmed it.
section("retract", async () => {
  const R = await member("Rio Retract");
  const O = await member("Oz Observer");
  const back = (who, f) => who.act({ type: "retract", entity: f.entity, id: f.id, field: f.field });
  const f1 = freeFill(await R.view());
  const add = await R.act(f1);
  const r1 = await back(R, f1);
  const v1 = await R.view();
  check("taking back a fact you just added works", add.status === 200 && r1.status === 200 && /^Took back the .+\. The credit it earned came off your balance\.$/.test(r1.json?.message ?? ""), r1.json);
  check("the credit comes back off, and the field is open again", r1.json?.me?.credits === STARTER && r1.json?.cells?.[0]?.cell?.s === "empty" && findCell(v1, f1.entity, f1.id, f1.field)?.s === "empty", [r1.json?.me, r1.json?.cells]);
  check("it no longer counts toward today's earning or as a fact you added", v1.me.earned24h === 0 && v1.me.added === 0, [v1.me.earned24h, v1.me.added]);
  check("the credit history says what happened", v1.ledger[0]?.reason?.startsWith("Took back the ") && v1.ledger[0].delta === -1 && !!v1.ledger[0].company, v1.ledger[0]);
  const twice = await back(R, f1);
  check("there is nothing left to take back", twice.status === 400 && twice.json?.error === "There's nothing of yours here to take back.", twice.json);
  const again = await R.act(f1);
  check("the field can be added again, and earns again", again.status === 200 && again.json?.me?.credits === STARTER + 1, again.json);

  // Someone confirmed it: it stays.
  const conf = await O.act({ type: "verify", entity: f1.entity, id: f1.id, field: f1.field });
  const r2 = await back(R, f1);
  check("a confirmed fact can't be taken back", conf.status === 200 && r2.status === 400 && r2.json?.error === "Someone already confirmed this, so it stays. You can still edit it.", r2.json);

  // Someone paid for it: it stays.
  const rv = await R.view();
  const h = host(rv);
  // A seat from our records with a function and no role, at a company with no open role.
  const e =
    rv.companies
      .filter((c) => !c.hidden && c.friendly.open === 0 && !/^Qa /.test(c.name))
      .flatMap((c) => c.engagements)
      .find((x) => x.cells.role?.s === "empty" && x.cells.function?.s === "value" && !x.cells.function.system && !x.yours) ?? null;
  const seat = await R.act({ type: "add", company: h.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: R.name, function: "Marketing", role: `Fractional CMO ${RUN}` } });
  const sid = seat.json?.id;
  const un = await O.act({ type: "unlock", entity: "engagement", id: sid, field: "role" });
  const r3 = await back(R, { entity: "engagement", id: sid, field: "role" });
  check("a fact another member unlocked can't be taken back", un.status === 200 && r3.status === 400 && r3.json?.error === "Someone already unlocked this, so it stays. You can still edit it.", [un.json?.message, r3.json]);

  // A seat from our records that someone else holds takes no role from this member, so there is nothing to take back.
  if (e) {
    const fr = await R.act({ type: "fill", entity: "engagement", id: e.id, field: "role", value: "Fractional VP Sales" });
    const r4 = await back(R, { entity: "engagement", id: e.id, field: "role" });
    check("a role on a seat they don't hold is refused, and there is nothing to take back", fr.json?.error === HOLDER_ONLY && r4.status === 400 && engOf(await R.view(), e.id)?.cells.role?.s === "empty", [fr.json, r4.json]);
  } else skip("role on a seed seat", "no seat with a function and no role on the host");
  const bare = await R.act({ type: "add", company: h.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: R.name, type: "Fractional", role: `Fractional Head of Partnerships ${RUN}` } });
  const bid = bare.json?.id;
  const bareFn = engOf(await R.view(), bid)?.cells.function;
  const r5 = await back(R, { entity: "engagement", id: bid, field: "role" });
  const bareAfter = engOf(await R.view(), bid);
  check("a function read from the role goes with the role", bareFn?.v === "Partnerships" && r5.status === 200 && bareAfter?.cells.function?.s === "empty" && r5.json?.cells?.some((c) => c.field === "function"), [bareFn, bareAfter?.cells.function, r5.json]);
  // An end takes the Ended it set with it.
  const endSeat = await R.act({ type: "add", company: h.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: R.name, function: "Growth", role: `Growth Lead Retract ${RUN}` } });
  await R.act({ type: "fill", entity: "engagement", id: endSeat.json?.id, field: "end", value: "2024-01" });
  const r6 = await back(R, { entity: "engagement", id: endSeat.json?.id, field: "end" });
  const es = engOf(await R.view(), endSeat.json?.id);
  check("taking back a dated end takes the Ended it set with it", r6.status === 200 && es?.cells.end?.s === "empty" && es?.cells.status?.s === "empty", [r6.json, es?.cells.status]);
  const derived = await back(R, { entity: "engagement", id: sid, field: "function" });
  check("a fact added in the same Add is its own fill and can be taken back on its own", derived.status === 200, derived.json);

  // Our records' facts were never the member's.
  const seedFact = seedFacts(await R.view(), 1)[0];
  const r7 = await back(R, seedFact);
  check("a fact from our records can't be taken back", r7.status === 400 && r7.json?.error === "There's nothing of yours here to take back.", r7.json);

  // The fact that paid the invite bonus stays.
  const I = await member("Ivo Inviter");
  const code = (await I.view()).me.inviteCode;
  const J = await member("Jem Invitee", { ref: code });
  const jf = freeFill(await J.view());
  const jadd = await J.act(jf);
  const r8 = await back(J, jf);
  check("the fact that paid the invite bonus can't be taken back", /Your invite bonus added 10 more/.test(jadd.json?.message ?? "") && r8.status === 400 && r8.json?.error === "This fact paid your invite bonus, so it stays. You can still edit it.", [jadd.json?.message, r8.json]);
  const jf2 = freeFill(await J.view());
  await J.act(jf2);
  const r9 = await back(J, jf2);
  check("their next fact can be", r9.status === 200, r9.json);
  check("signed out, retract is refused like every action", (await new Client("Nobody", nextIp()).act({ ...jf2, type: "retract" })).status === 400);
});

// Decision 17, WORD-6, decision 2: what the server says about a company and its seat holders.
section("company", async () => {
  if (!(await canScan())) return skip("company checks", NEED_SCAN);
  const adm = await admin();
  if (!adm) return skip("company checks", "no admin account (set ADMIN_TOKEN)");
  const board = `qa-rules-company-${RUN}`;
  const coName = `Qa Hiring Co ${RUN}`;
  await scanPost({ roles: [posting("hiring", coName, "Fractional Head of Growth", board)], sources: [{ source: board, fetched: 10, matched: 1 }] });
  const fr = companyNamed(await adm.view(), coName)?.friendly;
  check("an open role is hiring now, not a function they hired", fr?.functions.length === 0 && fr?.hiring?.join() === "Growth" && fr?.fractional === 0 && fr?.open === 1, fr);
  check("an open role on its own still makes a company Medium", fr?.tier === "Medium", fr);

  // A seat a member added with no type is a fractional seat. One typed Full-time is not.
  const M = await member("Mo Maker");
  const plain = await M.act({ type: "add", company: `Qa Untyped Co ${RUN}`, operatorMemberId: "me", engagementFields: { operator: M.name, function: "Marketing" } });
  const full = await M.act({ type: "add", company: `Qa Fulltime Co ${RUN}`, operatorMemberId: "me", engagementFields: { operator: M.name, function: "Marketing", type: "Full-time" } });
  const mv = await M.view();
  const pf = companyNamed(mv, `Qa Untyped Co ${RUN}`)?.friendly;
  const ff = companyNamed(mv, `Qa Fulltime Co ${RUN}`)?.friendly;
  check("a member-added seat with no type counts as a fractional seat in its function", plain.status === 200 && pf?.fractional === 1 && pf.functions.join() === "Marketing" && pf.hiring?.length === 0, pf);
  check("a member-added Full-time seat does not", full.status === 200 && ff?.fractional === 0 && ff.functions.length === 0, ff);

  // Decision 17: a hidden company the member paid to see is marked unlocked.
  const U = await member("Uri Unlocker");
  const hid = companyNamed(await adm.view(), coName);
  const before = (await U.view()).companies.find((c) => c.id === hid.id);
  await U.act({ type: "unlock", entity: "engagement", id: hid.engagements[0].id, field: "role" });
  const after = (await U.view()).companies.find((c) => c.id === hid.id);
  check("a hidden company is not marked unlocked before the member pays", before?.hidden === true && before.unlocked === undefined, [before?.hidden, before?.unlocked]);
  check("paying for its open role marks the company unlocked", after?.hidden === false && after.unlocked === true, [after?.hidden, after?.unlocked]);
  check("a company the member added to is not marked unlocked", companyNamed(mv, `Qa Untyped Co ${RUN}`)?.unlocked === undefined);

  // View.contact is sent to everyone, from the server's environment.
  const anon = await call("GET", "/api/table", { ipAddr: nextIp() });
  const support = process.env.SUPPORT_EMAIL ?? null;
  const intro = process.env.INTRO_EMAIL ?? null;
  check("signed out, the view says where to write", anon.json?.contact && anon.json.contact.support === support && anon.json.contact.intro === intro, anon.json?.contact);
  check("signed in too", JSON.stringify(mv.contact) === JSON.stringify({ support, intro }), mv.contact);

  // Decision 2: "Member" only for a seat holder who has signed in.
  const sm = seedHolders.length > 3 ? seedHolders[2] : null;
  if (!sm) return skip("member tag", "needs the seed file the server runs on");
  const seat = seedFile.engagements.find((e) => e.fields.source !== "Demand scan" && e.fields.operator && normName(e.fields.operator) === normName(sm.name));
  const coRec = seedFile.companies.find((c) => c.id === seat?.companyId);
  const W = await member("Wil Watcher");
  const wc = (await W.view()).companies.find((c) => c.name === coRec?.fields.name && !c.hidden);
  if (!wc) return skip("member tag", "the seed holder's company is hidden or missing");
  const ops = wc.engagements.filter((e) => e.cells.operator?.s === "locked").slice(0, 4);
  for (const e of ops) await W.act({ type: "unlock", entity: "engagement", id: e.id, field: "operator" });
  const holderCell = () => W.view().then((v) => v.companies.find((c) => c.id === wc.id)?.engagements.map((e) => e.cells.operator).find((c) => c?.s === "value" && normName(c.v) === normName(sm.name)));
  const before2 = await holderCell();
  check("a seed member who never signed in is a name, not a Member", !!before2 && before2.member === undefined, before2 ? { member: before2.member } : "seat not found");
  const holder = new Client("Seed holder", nextIp(), sm.token);
  await holder.view();
  await new Promise((r) => setTimeout(r, 300));
  const after2 = await holderCell();
  check("once they sign in, the seat holder shows as a Member", !!after2?.member && after2.member.you === false, after2 ? { member: !!after2.member } : "seat not found");
});

// Round 5 wiring: the fields the client areas asked for, and the member's own seat never merged into another's.
section("wire", async () => {
  // CompanyRec.added: the viewer created the company (its pick lists earn without the 5 a day).
  const A = await member("Abe Adder");
  const B = await member("Bea Bystander");
  const coName = `Qa Added Co ${RUN}`;
  const made = await A.act({ type: "add", company: coName, companyFields: { industry: "SaaS" } });
  const mine = companyNamed(await A.view(), coName);
  const theirs = companyNamed(await B.view(), coName);
  check("a company the member created is marked added for them", made.status === 200 && mine?.added === true, { status: made.status, added: mine?.added });
  check("and for nobody else", !!theirs && theirs.added === undefined, theirs && { added: theirs.added });
  const h = host(await A.view());
  check("a company the member only added a seat to is not", (await A.act({ type: "add", company: h.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: A.name, function: "Sales", type: "Fractional" } })).status === 200 && companyNamed(await A.view(), h.name)?.added === undefined);

  // "Add a seat you held" (operatorMemberId "me") with the title of somebody else's seat makes the member's own seat.
  const host2 = host(await A.view());
  const role = "Fractional Head of RevOps";
  const other = await A.act({ type: "add", company: host2.name, newEngagement: true, operatorMemberId: "me", engagementFields: { function: "RevOps", role, type: "Fractional", operator: A.name } });
  const otherId = other.json?.id;
  const own = await B.act({ type: "add", company: host2.name, newEngagement: true, operatorMemberId: "me", engagementFields: { function: "RevOps", role, type: "Fractional", operator: "Bea Bystander", start: "2024-02" } });
  const bv = await B.view();
  const ownSeat = own.json?.id ? engOf(bv, own.json.id) : null;
  check("a seat you held with the same title as another member's seat is its own seat", other.status === 200 && own.status === 200 && !!own.json?.id && own.json.id !== otherId && /^Added a seat at /.test(own.json?.message ?? ""), { other: other.status, own: own.json?.message, same: own.json?.id === otherId });
  check("it is yours at once, with your name on it", ownSeat?.yours === true && ownSeat.cells.operator?.v === "Bea Bystander", ownSeat && { yours: ownSeat.yours });
  const av = await A.view();
  check("the other member's seat keeps its own seat holder and start", engOf(av, otherId)?.cells.operator?.v === A.name && engOf(av, otherId)?.cells.start?.s === "empty", engOf(av, otherId)?.cells.start);
  const bench = await B.act({ type: "benchRate", engagementId: own.json?.id, pricing: "Monthly retainer", rate: "$9k/mo" });
  check("a private rate on that seat goes in", bench.status === 200, bench.json);
  const again = await B.act({ type: "add", company: host2.name, newEngagement: true, operatorMemberId: "me", engagementFields: { role, operator: "Bea Bystander" } });
  check("adding the same seat of your own again goes to that seat", again.status === 200 && again.json?.id === own.json?.id, { message: again.json?.message ?? again.json?.error, same: again.json?.id === own.json?.id });

  // View.reported says which facts are hidden from everyone, and a reporter's cell says they reported it.
  const adm = await admin();
  if (!adm) return skip("reported rows", "no admin account (set ADMIN_TOKEN)");
  const C = await member("Cyd Caller");
  const D = await member("Dot Caller");
  const E = await member("Ed Elsewhere");
  const cv = await C.view();
  for (const who of [C, D]) await who.act(freeFill(cv));
  const [t] = seedFacts(cv, 1);
  const rowOf = async () => (await adm.view()).reported.find((r) => r.entity === t.entity && r.id === t.id && r.field === t.field);
  await C.act({ type: "report", ...t });
  const one = await rowOf();
  const cCell = findCell(await C.view(), t.entity, t.id, t.field);
  check("one report: listed for review, not hidden from everyone", one?.hidden === false && one.reporters.length === 1, one && { hidden: one.hidden, n: one.reporters.length });
  check("the reporter's cell says they reported it", cCell?.s === "reported" && cCell.byMe === true, cCell);
  await D.act({ type: "report", ...t });
  const two = await rowOf();
  const eCell = findCell(await E.view(), t.entity, t.id, t.field);
  check("two reports: hidden from everyone", two?.hidden === true && two.reporters.length === 2, two && { hidden: two.hidden, n: two.reporters.length });
  check("a member who didn't report it sees it under review, not as theirs", eCell?.s === "reported" && eCell.byMe === undefined, eCell);
  const list = (await adm.view()).reported;
  const firstShown = list.findIndex((r) => !r.hidden);
  check("hidden facts come first in the review list", firstShown === -1 || list.slice(firstShown).every((r) => !r.hidden), list.map((r) => r.hidden));
});

// LOGIC-8 point 4: the posting of a role the scan closed is free to see. Runs last: its scans are dated ahead.
section("closed", async () => {
  if (!(await canScan())) return skip("closed role checks", NEED_SCAN);
  const adm = await admin();
  if (!adm) return skip("closed role checks", "no admin account (set ADMIN_TOKEN)");
  const board = `qa-rules-closed-${RUN}`;
  const t0 = Date.now();
  const at = (days) => new Date(t0 + days * DAY_MS).toISOString();
  const two = `Qa Two Roles Co ${RUN}`;
  const one = `Qa One Role Co ${RUN}`;
  const x = posting("x", two, "Fractional CRO", board);
  const y = posting("y", two, "Fractional CMO", board);
  const z = posting("z", one, "Interim VP Sales", board);
  const keep = [1, 2, 3].map((i) => posting(`w${i}`, `Qa Keeper ${i} Co ${RUN}`, "Fractional Head of Partnerships", board));
  await scanPost({ roles: [x, y, z, ...keep], sources: [{ source: board, fetched: 20, matched: 6 }], now: at(0) });
  const av = await adm.view();
  const twoCo = companyNamed(av, two);
  const oneCo = companyNamed(av, one);
  const xe = twoCo.engagements.find((e) => e.cells.function?.v === "Sales"); // the CRO role (role titles are locked, the function is free)
  const ze = oneCo.engagements[0];
  const N = await member("Nan Nopay");
  const n0 = await N.view();
  check("while a role is open its posting is locked", engOf(n0, ze.id)?.cells.posting?.s === "locked" && engOf(n0, xe.id)?.cells.posting?.s === "locked", [engOf(n0, ze.id)?.cells.posting?.s, engOf(n0, xe.id)?.cells.posting?.s]);
  // Two clean runs of the board without them, the second more than 10 days after they were last seen.
  const rest = { roles: [y, ...keep], sources: [{ source: board, fetched: 20, matched: 4 }] };
  await scanPost({ ...rest, now: at(5) });
  const s = await scanPost({ ...rest, now: at(11) });
  const n1 = await N.view();
  const zNow = engOf(n1, ze.id);
  const xNow = engOf(n1, xe.id);
  check("the scan closes both roles", zNow?.cells.status?.v === "Closed" && xNow?.cells.status?.v === "Closed", { result: s.json?.result, z: zNow?.cells.status, x: xNow?.cells.status });
  check("the posting of a closed role is free to see for a member who never paid", zNow?.company.hidden === false && zNow.cells.posting?.s === "value" && zNow.cells.posting.from === "posting" && n1.me.credits === STARTER && n1.me.unlocked === 0, { hidden: zNow?.company.hidden, posting: zNow?.cells.posting?.s, credits: n1.me.credits });
  const un = await N.act({ type: "unlock", entity: "engagement", id: ze.id, field: "posting" });
  check("there is nothing to unlock on it", un.json?.error === "Nothing here is locked, so no credit was spent.", un.json);
  check("its role title is still an unlock", zNow?.cells.role?.s === "locked", zNow?.cells.role);
  check("while the company is hidden for another open role, the closed posting stays locked (the link would name it)", xNow?.company.hidden === true && xNow.cells.posting?.s === "locked", { hidden: xNow?.company.hidden, posting: xNow?.cells.posting?.s });
  await N.act({ type: "unlock", entity: "company", id: twoCo.id, field: "identity" });
  const n2 = await N.view();
  check("once the company is unlocked the closed posting shows, at no extra credit", engOf(n2, xe.id)?.cells.posting?.s === "value" && n2.me.credits === STARTER - 1, { posting: engOf(n2, xe.id)?.cells.posting?.s, credits: n2.me.credits });

  // WORD-6: a posting that came down with nobody named as its seat holder is not a hire.
  const of = companyNamed(await adm.view(), one)?.friendly;
  check("a closed posting with no seat holder counts in neither functions nor fractional seats", of?.functions.length === 0 && of?.fractional === 0 && of?.hiring?.length === 0 && of?.open === 0, of);
  check("it still says they went looking for a fractional (Medium)", of?.tier === "Medium", of);
  // DESK-10: an end can't come before the month the role was first listed. Only its seat holder adds one.
  const early0 = await N.act({ type: "fill", entity: "engagement", id: ze.id, field: "end", value: "2020-01" });
  check("nobody but a seat holder adds an end to a closed role", early0.json?.error === HOLDER_ONLY, early0.json);
  if (!(await vouch(N))) return skip("end before the role was listed", NEED_SEED);
  const took = await N.act({ type: "fill", entity: "engagement", id: ze.id, field: "operator", value: "x", memberId: "me" });
  const early = await N.act({ type: "fill", entity: "engagement", id: ze.id, field: "end", value: "2020-01" });
  check("an end before the role was first listed is refused, and says when that was", took.status === 200 && early.status === 400 && /^The end month can't be before [A-Z][a-z]{2} \d{4}, when the role was first listed\.$/.test(early.json?.error ?? ""), [took.json?.error, early.json]);
});

/* ---------- run ---------- */

for (const [name, fn] of Object.entries(sections)) {
  if (ONLY.size && !ONLY.has(name)) continue;
  console.log(`\n# ${name}`);
  try {
    await fn();
  } catch (e) {
    fail(`${name} (threw)`, String(e?.stack ?? e));
  }
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
