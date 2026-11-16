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
 *                  report keep rate admin closed
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

async function join(name, { email, headers } = {}) {
  const ipAddr = nextIp();
  const r = await call("POST", "/api/table", {
    ipAddr,
    headers,
    body: { join: { name, email: email ?? `qa+${RUN}-${name.toLowerCase().replace(/\W+/g, "")}-${Math.random().toString(36).slice(2, 7)}@example.com` } },
  });
  const token = (r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean) ?? null;
  return { r, client: token ? new Client(name, ipAddr, token) : null };
}

/** A new member with a name nobody else in this run has (names link seats, so they must be unique). */
async function member(name) {
  const { r, client } = await join(name);
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

/* ---------- sections ---------- */

const sections = {};
const section = (name, fn) => (sections[name] = fn);

const STILL_OPEN = "This role is still open. If you took it, pick yourself as the seat holder.";

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
  check("a made-up seat holder on an open role is refused", made.status === 400 && made.json?.error === STILL_OPEN, made.json);
  check("the role is still open for everyone after it", isOpen(await look(B)), await look(B));
  const typed = await name(A, "Ann Attacker");
  check("typing your own name without picking yourself is refused too", typed.status === 400 && typed.json?.error === STILL_OPEN, typed.json);
  const other = await name(A, "Bo Bystander", await A.pick("Bo Bystander"));
  check("picking another member on an open role is refused", other.status === 400 && other.json?.error === STILL_OPEN, other.json);
  const viaAdd = await A.act({ type: "add", company: coName, engagementId: eid, engagementFields: { operator: "Jane Madeup" } });
  check("a made-up name through Add on the open role is refused", viaAdd.status === 400 && viaAdd.json?.error === STILL_OPEN, viaAdd.json);
  check("after four tries the role is open and the company hidden", isOpen(await look(B)), await look(B));
  check("refused tries earn nothing", (await look(A)).credits === STARTER - 1, (await look(A)).credits);

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
  check("they can't rename the seat holder to someone else afterwards", rename.status === 400 && /You took this open role/.test(rename.json?.error ?? ""), rename.json);
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
  check("the admin removes the name", rm.status === 200 && rm.json?.message === "Removed. The field is open to fill again.", rm.json);
  const back = await look(B);
  check("removing the seat holder reopens the role", isOpen(back) && back.holder === "empty", back);
  check("the member who took it loses the credit, the reporters get theirs back", (await look(A)).credits === STARTER - 1 && (await look(C)).credits === STARTER, [(await look(A)).credits, (await look(C)).credits]);
  const s3 = await scanPost(listed);
  check("a rescan that still lists the role finds it open", s3.json?.result?.stillOpen >= 1 && s3.json.result.opened === 0 && s3.json.result.reopened === 0 && isOpen(await look(B)), s3.json);

  // One close by self-claim per member per rolling 24 hours.
  const again = await name(A, "x", "me");
  check("a second self-claim inside 24 hours is refused", again.status === 400 && /once a day/.test(again.json?.error ?? "") && isOpen(await look(B)), again.json);

  // "This isn't me" undoes a claim.
  const F = await member("Flo Fickle");
  const fClaim = await F.act({ type: "add", company: coName, engagementId: eid, operatorMemberId: "me", engagementFields: { operator: "Flo Fickle" } });
  check("another member can take the role through Add", fClaim.status === 200 && isClosed(await look(B)), fClaim.json);
  const notMe = await F.act({ type: "notMine", engagementId: eid });
  check("this isn't me reopens the role and says so", notMe.status === 200 && /The role is open again\./.test(notMe.json?.message ?? "") && notMe.json?.cells?.find((c) => c.field === "status")?.cell?.v === "Open role", notMe.json);
  const afterNot = await look(B);
  check("after this isn't me the role is open and the name is hidden for everyone", isOpen(afterNot) && afterNot.holder === "reported", afterNot);
  const row = (await adm.view()).reported.find((r) => r.id === eid && r.field === "operator");
  check("the admin's review list has the name", !!row && row.reporters.join() === "Flo Fickle" && row.addedBy === "Flo Fickle", row);
  // The old way to keep it closed: unlink, then rename the seat holder to someone who isn't a member.
  const swap = await F.act({ type: "fill", entity: "engagement", id: eid, field: "operator", value: "Jane Madeup" });
  check("after this isn't me they can't put another name on the role", swap.status === 400 && swap.json?.error === STILL_OPEN && isOpen(await look(B)), swap.json);
  await adm.act({ type: "review", entity: "engagement", id: eid, field: "operator", decision: "remove" });
  check("removing a name that already came off leaves the role open", isOpen(await look(B)), await look(B));

  // An admin removal with no report does the same.
  const G = await member("Gus Grabber");
  await G.act({ type: "unlock", entity: "company", id: coId, field: "identity" });
  const gClaim = await name(G, "x", "me");
  check("a third member takes the role", gClaim.status === 200 && isClosed(await look(B)), gClaim.json);
  const direct = await adm.act({ type: "adminRemove", entity: "engagement", id: eid, field: "operator" });
  check("adminRemove on the seat holder reopens the role", direct.status === 200 && isOpen(await look(B)), direct.json);
  check("and takes back the credit the claim earned", (await look(G)).credits === STARTER - 1, (await look(G)).credits);
  const I = await member("Ike Inventor");
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
  check("a made-up name on a seed open role is refused, and it stays open", seedTry.status === 400 && seedTry.json?.error === STILL_OPEN && seedAfter?.closed === null && seedAfter.company.hidden === true && bv.stats.openRoles === b0.open, { status: seedTry.status, closed: seedAfter?.closed, hidden: seedAfter?.company.hidden });
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
    check(`confirming a hidden company's ${field} is refused and returns no value`, conf.status === 400 && conf.json?.error === "Nothing to confirm here." && !leaks(conf), { status: conf.status, error: conf.json?.error, leaked: leaks(conf) });
    const rep = await M.act({ type: "report", entity: "company", id: co.id, field });
    check(`reporting a hidden company's ${field} is refused and returns no value`, rep.status === 400 && rep.json?.error === "Nothing to report here." && !leaks(rep), { status: rep.status, error: rep.json?.error, leaked: leaks(rep) });
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

// LOGIC-2: a hidden company, the role and the posting of its open role are one purchase.
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
  const BOUGHT = "Unlocked the company, the role and the posting. −1 credit.";
  const seen = async (who) => {
    const v = await who.view();
    const c = v.companies.find((x) => x.id === co.id);
    const e = c.engagements.find((x) => x.id === eid);
    return { hidden: c.hidden, name: c.name === coName, role: e.cells.role?.s, posting: e.cells.posting?.s, rate: e.cells.rate?.s, holder: e.cells.operator?.s, website: c.cells.website?.s, credits: v.me.credits, unlocked: v.me.unlocked, ledger: v.ledger.length };
  };
  const whole = (x, spent) => x.hidden === false && x.name && x.role === "value" && x.posting === "value" && x.website === "value" && x.credits === STARTER - spent;

  const M0 = await member("Nil Nopay");
  const before = await seen(M0);
  check("before paying, the company is hidden and role, posting and rate are locked", before.hidden === true && before.role === "locked" && before.posting === "locked" && before.rate === "locked", before);

  // Each of the three ways in costs 1 credit and opens all three.
  for (const [n, field, entity, id] of [["Pia Posting", "posting", "engagement", eid], ["Rui Role", "role", "engagement", eid], ["Ida Identity", "identity", "company", co.id]]) {
    const M = await member(n);
    const r = await M.act({ type: "unlock", entity, id, field });
    const got = (f) => r.json?.cells?.find((x) => x.id === eid && x.field === f)?.cell;
    check(`unlocking the ${field === "identity" ? "company" : field} of an open role at a hidden company costs 1 credit and names what it bought`, r.status === 200 && r.json?.message === BOUGHT && r.json?.me?.credits === STARTER - 1 && r.json.me.unlocked === 1, r.json?.error ?? r.json?.message);
    check(`it returns the role and the posting (asked for the ${field === "identity" ? "company" : field})`, got("role")?.v === "Fractional VP Sales" && got("posting")?.s === "value" && r.json?.cells?.some((x) => x.id === co.id && x.field === "website" && x.cell.s === "value"), r.json?.cells?.map((x) => [x.field, x.cell.s]));
    const after = await seen(M);
    check(`afterwards the company, role and posting show, for one ledger row (asked for the ${field === "identity" ? "company" : field})`, whole(after, 1) && after.unlocked === 1 && after.ledger === 1, after);
    check("rate and seat holder stay separate", after.rate === "locked", after);
    for (const f of [["engagement", eid, "role"], ["engagement", eid, "posting"], ["company", co.id, "identity"]]) {
      const twice = await M.act({ type: "unlock", entity: f[0], id: f[1], field: f[2] });
      if (twice.json?.error !== "Nothing to unlock here.") fail(`a second unlock of ${f[2]} buys nothing`, twice.json);
    }
    check("no part of it can be bought twice", (await seen(M)).credits === STARTER - 1);
  }

  // unlockMany never charges twice for parts of one purchase.
  const U = await member("Uli Unlockall");
  const many = await U.act({ type: "unlockMany", items: [{ entity: "company", id: co.id, field: "identity" }, { entity: "engagement", id: eid, field: "role" }, { entity: "engagement", id: eid, field: "posting" }, { entity: "engagement", id: eid, field: "rate" }] });
  check("unlockMany charges the company, role and posting once, and the rate on top", many.status === 200 && many.json?.me?.credits === STARTER - 2 && many.json?.message === "Unlocked the company, the role and the posting, plus 1 more fact. −2 credits.", many.json?.error ?? many.json?.message);
  const uAfter = await seen(U);
  check("all four show afterwards", whole(uAfter, 2) && uAfter.rate === "value", uAfter);

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
  const add = await T.act({ type: "add", company: h.name, newEngagement: true, engagementFields: { function: "Sales", type: "Fractional", role: "Fractional VP Sales", status: "Ended", start: "2024-02", end: "2025-01" } });
  const uv = await U.view();
  const e = engOf(uv, add.json?.id);
  check("status is free to see on a seat another member added", add.status === 200 && e?.cells.status?.s === "value" && e.cells.status.v === "Ended", e?.cells.status);
  check("end and role stay locked", e?.cells.end?.s === "locked" && e.cells.role?.s === "locked", [e?.cells.end?.s, e?.cells.role?.s]);
  let locked = 0;
  let statuses = 0;
  for (const x of cellsOf(uv)) if (x.entity === "engagement" && x.field === "status" && x.cell.s !== "empty") (statuses++, x.cell.s === "locked" && locked++);
  check("no status anywhere in the table is locked", statuses > 10 && locked === 0, { statuses, locked });
  const un = await U.act({ type: "unlock", entity: "engagement", id: add.json?.id, field: "status" });
  check("there is nothing to unlock on a status", un.json?.error === "Nothing to unlock here." && (await U.view()).me.credits === STARTER, un.json);
});

// LOGIC-3: a seat holder controls their own seat.
section("seat", async () => {
  const adm = await admin();
  const Y = await member("Yara Yours");
  const T = await member("Tom Teller");
  const U = await member("Una Other");
  const h = host(await T.view());
  // T pins a seat with a rate on Yara. She has added nothing and unlocked nothing.
  const add = await T.act({
    type: "add", company: h.name, newEngagement: true, operatorMemberId: await T.pick("Yara Yours"),
    engagementFields: { function: "Sales", type: "Fractional", role: "Fractional VP Sales", operator: "Yara Yours", rate: "$2k/mo" },
  });
  const eid = add.json?.id;
  if (add.status !== 200 || !eid) return fail("seat: add a seat for Yara", add.json);
  check("the seat shows as hers", engOf(await Y.view(), eid)?.yours === true);
  const rep = await Y.act({ type: "report", entity: "engagement", id: eid, field: "rate" });
  check("the seat holder can report a fact on her own seat with no fact added and no unlock", rep.status === 200 && rep.json?.message === "Reported. It's hidden for everyone until an admin reviews it." && rep.json?.me?.credits === STARTER && rep.json.me.unlocked === 0, rep.json);
  check("her one report hides it for everyone at once", engOf(await U.view(), eid)?.cells.rate?.s === "reported" && engOf(await T.view(), eid)?.cells.rate?.s === "reported", engOf(await U.view(), eid)?.cells.rate);
  const buy = await U.act({ type: "unlock", entity: "engagement", id: eid, field: "rate" });
  check("nobody can buy it while it waits for review", buy.json?.error === "Nothing to unlock here.", buy.json);
  if (adm) {
    const row = (await adm.view()).reported.find((r) => r.id === eid && r.field === "rate");
    check("it is in the admin's review list under her name", !!row && row.reporters.join() === "Yara Yours" && row.addedBy === "Tom Teller", row);
  }

  // "This isn't me" on a name a member added hides the name for everyone until an admin decides.
  const not = await Y.act({ type: "notMine", engagementId: eid });
  check("this isn't me says the name is hidden until an admin reviews it", not.status === 200 && /^Got it\. That seat is no longer linked to you\. The name on that seat is hidden for everyone until an admin reviews it\.$/.test(not.json?.message ?? ""), not.json?.message ?? not.json);
  check("it returns the seat holder as under review", not.json?.cells?.find((c) => c.field === "operator")?.cell?.s === "reported", not.json?.cells?.map((c) => [c.field, c.cell.s]));
  check("the seat is no longer hers", engOf(await Y.view(), eid)?.yours === false);
  check("the name is hidden for everyone", engOf(await U.view(), eid)?.cells.operator?.s === "reported" && engOf(await T.view(), eid)?.cells.operator?.s === "reported", engOf(await U.view(), eid)?.cells.operator);
  const buyName = await U.act({ type: "unlock", entity: "engagement", id: eid, field: "operator" });
  check("nobody can buy her name on that seat", buyName.json?.error === "Nothing to unlock here." && (await U.view()).me.credits === STARTER, buyName.json);
  if (adm) {
    const row = (await adm.view()).reported.find((r) => r.id === eid && r.field === "operator");
    check("the admin decides: the name is in the review list", !!row && row.reporters.join() === "Yara Yours" && row.value === "Yara Yours", row);
    await adm.act({ type: "review", entity: "engagement", id: eid, field: "operator", decision: "keep" });
    const kept = await U.act({ type: "unlock", entity: "engagement", id: eid, field: "operator" });
    check("if the admin keeps it, it sells again without the member link", kept.status === 200 && kept.json?.cells?.[0]?.cell?.v === "Yara Yours" && !kept.json.cells[0].cell.member && engOf(await Y.view(), eid)?.yours === false, kept.json?.cells?.[0]);
  }

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
  check("a member who unlocked a fact can report it without having added one", un.status === 200 && rep.status === 200 && rep.json?.message === "Reported. An admin will review it.", rep.json);
  const freeRep = await P.act({ type: "report", ...free1 });
  check("a free fact still needs a fact added first", freeRep.status === 400 && freeRep.json?.error === "Add a fact before you report one.", freeRep.json);

  const Q = await member("Quin Quiet");
  const bench = await Q.act({ type: "benchRate", pricing: "Hourly", rate: "$150/hr", function: "Sales" });
  const qRep = await Q.act({ type: "report", ...free2 });
  check("a benchmark-only rate is not the fact that lets a member report", bench.status === 200 && qRep.status === 400 && qRep.json?.error === "Add a fact before you report one.", { bench: bench.status, report: qRep.json });
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
  check("confirming it gives the real count: 1 confirmation", c1.status === 200 && /\. 1 confirmation now\.$/.test(c1.json?.message ?? "") && c1.json?.cells?.[0]?.cell?.ver === 1 && c1.json.cells[0].cell.iv === true && c1.json.cells[0].cell.from === "records", { message: c1.json?.message?.replace(/^Confirmed [^.]+/, "Confirmed …"), ver: c1.json?.cells?.[0]?.cell?.ver });
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
  check("the admin keeps it", keep.json?.message === "Kept." && findCell(await C.view(), t.entity, t.id, t.field)?.s === "value", keep.json);
  const KEPT = "An admin reviewed this fact and kept it, so you can't report it again.";
  const c2 = await C.act({ type: "report", ...t });
  const d2 = await D.act({ type: "report", ...t });
  check("neither reporter can report it again", c2.status === 400 && c2.json?.error === KEPT && d2.status === 400 && d2.json?.error === KEPT, [c2.json, d2.json]);
  check("it stays visible to them", findCell(await C.view(), t.entity, t.id, t.field)?.s === "value" && findCell(await D.view(), t.entity, t.id, t.field)?.s === "value");
  const e1 = await E.act({ type: "report", ...t });
  check("a member who had not reported it still can", e1.status === 200 && e1.json?.message === "Reported. An admin will review it.", e1.json);
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
  check("a benchmark-only rate on your own seat earns 1", priv.status === 200 && v1.me.benchRates.some((b) => b.engagementId === eid) && /\+1 credit\./.test(priv.json?.message ?? ""), priv.json);
  const pub = await M.act({ type: "fill", entity: "engagement", id: eid, field: "rate", value: "$10k/mo" });
  const v2 = await M.view();
  check("adding the rate to the record afterwards earns nothing more", pub.status === 200 && v2.me.credits === v1.me.credits && !/\+1 credit/.test(pub.json?.message ?? ""), { message: pub.json?.error ?? pub.json?.message, credits: [v1.me.credits, v2.me.credits] });
  check("the message says the private rate was replaced", /^Added rate\. This rate replaces the one you shared for the benchmarks only, which already earned its credit\.$/.test(pub.json?.message ?? ""), pub.json?.message);
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
    type: "add", company: coName, companyFields: { industry: "SaaS", hq: "Austin, TX" },
    engagementFields: { function: "Sales", type: "Fractional", role: "Fractional VP Sales", pricing: "Monthly retainer", rate: "$9k/mo" },
    people: [{ name: "Pat Junk", title: "CEO" }],
  });
  if (add.status !== 200) return fail("admin: add a made-up company", add.json);
  const elsewhere = freeFill(await J.view());
  await J.act(elsewhere);
  await J.act({ type: "benchRate", pricing: "Hourly", rate: "$150/hr", function: "Sales" });
  const j0 = (await J.view()).me;
  check("the member earned for every fact", j0.credits === STARTER + 11 && j0.benchRates.length === 1, { credits: j0.credits, bench: j0.benchRates.length });
  const kv = await K.view();
  const junk = companyNamed(kv, coName);
  const eid = junk.engagements[0].id;
  const pid = junk.engagements[0].people[0]?.id ?? junk.people[0]?.id;
  await K.act({ type: "unlockMany", items: [{ entity: "engagement", id: eid, field: "rate" }, { entity: "contact", id: pid, field: "name" }] });
  check("another member paid 2 credits to see two of the facts", (await K.view()).me.credits === STARTER - 2);

  const notAdmin1 = await K.act({ type: "adminRemove", entity: "engagement", id: eid, field: "rate" });
  const notAdmin2 = await K.act({ type: "adminRemoveMember", memberId: await K.pick("Jay Junk") });
  check("both removals are for admins", notAdmin1.json?.error === "Admins only." && notAdmin2.json?.error === "Admins only.", [notAdmin1.json, notAdmin2.json]);

  // One fact, with no report on it.
  const rm = await adm.act({ type: "adminRemove", entity: "engagement", id: eid, field: "rate" });
  check("adminRemove takes an unreported fact off the table", rm.status === 200 && rm.json?.message === "Removed. The field is open to fill again." && rm.json?.cells?.[0]?.cell?.s === "empty", rm.json);
  check("the field reopens for everyone", engOf(await K.view(), eid)?.cells.rate?.s === "empty");
  check("the member who added it loses that credit, the unlocker gets theirs back", (await J.view()).me.credits === j0.credits - 1 && (await K.view()).me.credits === STARTER - 1, [(await J.view()).me.credits, (await K.view()).me.credits]);
  const twice = await adm.act({ type: "adminRemove", entity: "engagement", id: eid, field: "rate" });
  check("removing it twice is refused", twice.status === 400 && twice.json?.error === "Nothing to remove here.", twice.json);
  const [seedFact] = seedFacts(kv, 1);
  const noSeed = await adm.act({ type: "adminRemove", ...seedFact });
  check("a fact from our own records can't be removed this way", noSeed.status === 400 && findCell(await K.view(), seedFact.entity, seedFact.id, seedFact.field)?.s === "value", noSeed.json?.error);

  // Everything one member added.
  const unknown = await adm.act({ type: "adminRemoveMember", memberId: "j_AAAAAAAAAAAA" });
  check("an unknown member is refused", unknown.status === 400 && unknown.json?.error === "Member not found.", unknown.json);
  const all = await adm.act({ type: "adminRemoveMember", memberId: await adm.pick("Jay Junk") });
  check("adminRemoveMember says what it removed", all.status === 200 && all.json?.message === "Removed 9 facts, 1 benchmark-only rate and 3 empty records that Jay Junk added. The credits they earned were taken back and unlocks were refunded.", all.json?.error ?? all.json?.message);
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
  check("there is nothing to unlock on it", un.json?.error === "Nothing to unlock here.", un.json);
  check("its role title is still an unlock", zNow?.cells.role?.s === "locked", zNow?.cells.role);
  check("while the company is hidden for another open role, the closed posting stays locked (the link would name it)", xNow?.company.hidden === true && xNow.cells.posting?.s === "locked", { hidden: xNow?.company.hidden, posting: xNow?.cells.posting?.s });
  await N.act({ type: "unlock", entity: "company", id: twoCo.id, field: "identity" });
  const n2 = await N.view();
  check("once the company is unlocked the closed posting shows, at no extra credit", engOf(n2, xe.id)?.cells.posting?.s === "value" && n2.me.credits === STARTER - 1, { posting: engOf(n2, xe.id)?.cells.posting?.s, credits: n2.me.credits });
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
