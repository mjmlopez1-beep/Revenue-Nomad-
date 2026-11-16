#!/usr/bin/env node
/**
 * End-to-end checks of the Trading Post server against a running server.
 *
 *   BASE=http://localhost:3000 node scripts/test-server.mjs
 *
 * Run it against a throwaway server: it creates about 130 test accounts and adds, unlocks,
 * confirms and reports facts, and it stores test scans that open and close roles. Start that
 * server on a fresh RN_DATA_DIR with RN_STARTER_CREDITS=25, RN_ADMIN_EMAILS=admin-qa@example.com,
 * RN_SCAN_TEST=1 and RN_CRON_SECRET=qa-cron (the last two let the scan checks store results
 * without reading a job board; without them those checks are skipped). The cron secret also
 * lets the tests create the admin account, which the join form alone refuses.
 *
 * Optional environment:
 *   ADMIN_EMAIL    admin account to join (default admin-qa@example.com)
 *   ADMIN_TOKEN    its sign-in code, when that email already joined
 *   SEED_FILE      the private seed the server runs on (default data/intel-seed.json). When it
 *                  is there, a few checks sign in as seed members (a linked seat holder, a
 *                  member past the first-day unlock limit). Nothing from it is printed.
 *   SEED_TOKEN     a seed member's sign-in code, instead of SEED_FILE, for the unlock checks
 *   SEED_EMAIL     a seed member's email (join answer is the same as for a joined email)
 *   STARTER        expected starter credits (default 25)
 *   CRON_SECRET    the server's RN_CRON_SECRET (default qa-cron)
 *   ID_SECRET      the server's RN_ID_SECRET, to build an unsubscribe link (default: the dev key)
 *   ONLY           comma-separated sections to run (default all): ssrf ids economy ip unlock
 *                  reports fields stats gzip result join seat hidden gtm benchmarks seats
 *                  benchrate pilot settings scan load
 *   LOAD_OUT       write the load test's accounts and expected ledgers to this file
 *   CHECK_LEDGERS  re-check a LOAD_OUT file only (run it after restarting the server, to
 *                  check that what was written to disk survived)
 */
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createServer } from "node:net";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const STARTER = Number(process.env.STARTER ?? 25);
const CRON_SECRET = process.env.CRON_SECRET ?? "qa-cron";
const ONLY = new Set((process.env.ONLY || "").split(",").map((x) => x.trim()).filter(Boolean));
const RUN = Date.now().toString(36);
/** A distinct client address per test client (the rightmost X-Forwarded-For entry). */
const IP_BASE = `10.${(Date.now() >> 8) & 255}.${Date.now() & 255}`;
const ip = (n) => `${IP_BASE}.${n}`;

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
  const t0 = performance.now();
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  const ms = performance.now() - t0;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, json, text, headers: r.headers, ms };
}

/** Raw GET (fetch would decompress), for the gzip check. */
function rawGet(path, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + path);
    const req = (u.protocol === "https:" ? httpsRequest : httpRequest)(u, { method: "GET", headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

class Client {
  constructor(name, ipAddr, token = null) {
    this.name = name;
    this.ip = ipAddr;
    this.token = token;
  }
  get first() {
    return this.name.split(" ")[0];
  }
  async view() {
    const r = await call("GET", "/api/table", { token: this.token, ipAddr: this.ip });
    if (r.status !== 200) throw new Error(`GET as ${this.name}: ${r.status} ${r.text.slice(0, 200)}`);
    return r.json;
  }
  act(action) {
    return call("POST", "/api/table", { token: this.token, ipAddr: this.ip, body: { action } });
  }
}

async function join(name, ipAddr, { ref, email, headers } = {}) {
  const r = await call("POST", "/api/table", {
    ipAddr,
    headers,
    body: { join: { name, email: email ?? `qa+${RUN}-${name.toLowerCase().replace(/\W+/g, "")}-${Math.random().toString(36).slice(2, 7)}@example.com`, ref } },
  });
  const token = (r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean) ?? null;
  return { r, client: token ? new Client(name, ipAddr, token) : null };
}

async function member(name, ipAddr, opts) {
  const { r, client } = await join(name, ipAddr, opts);
  if (!client) throw new Error(`join ${name} failed: ${r.status} ${r.text.slice(0, 200)}`);
  await client.act({ type: "profile", function: "Sales", goal: "friendly" });
  return client;
}

/* ---------- seed members and test scans ---------- */

/** The private seed, when this machine has the one the server runs on. Never printed. */
let seedFile = null;
try {
  seedFile = JSON.parse(readFileSync(process.env.SEED_FILE ?? "data/intel-seed.json", "utf8"));
} catch {
  /* no seed here: the checks that need a seed member are skipped */
}
/** A failed check prints what it got. Names, emails, phones and sign-in codes from the seed never go to the log. */
let secrets = null;
function redact(text) {
  if (!seedFile) return text;
  secrets ??= [
    ...seedFile.members.flatMap((m) => [m.token, m.email, m.name]),
    ...(seedFile.contacts ?? []).flatMap((p) => [p.fields.name, p.fields.email, p.fields.phone, p.fields.linkedin]),
    ...seedFile.engagements.map((e) => e.fields.operator),
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
    if (same.length !== 1 || e.fields.source === "Demand scan") continue;
    out.set(same[0].id, { m: same[0], fn: !!e.fields.function || out.get(same[0].id)?.fn });
  }
  // Holders with a function on a seat first (the correction check needs one).
  return [...out.values()].sort((a, b) => Number(!!b.fn) - Number(!!a.fn)).map((x) => x.m);
})();
/** A seed member to sign in as: the nth from the end of the list who holds no seat (so tests don't collide). */
function seedClient(n, ipAddr) {
  if (!seedFile) return null;
  const holders = new Set(seedHolders.map((m) => m.id));
  const m = seedFile.members.filter((x) => x.token && !holders.has(x.id)).slice(-n)[0];
  return m ? new Client("Seed Member", ipAddr, m.token) : null;
}

/**
 * Make a joined member's word count (lib/table.ts trustOf): they add a free fact and two seed
 * members confirm it. A claim on an open role closes it only from an account that counts.
 * Takes companies from the end of the list, away from the ones other checks use. Returns
 * whether it could (it needs the seed file the server runs on).
 */
let vouchN = 0;
async function vouch(who) {
  const a = seedClient(40, ip(236));
  const b = seedClient(41, ip(237));
  if (!a || !b) return false;
  const v = await who.view();
  const c = [...v.companies].reverse().filter((x) => !x.hidden && !x.mine && x.cells.hq?.s === "empty")[vouchN++];
  if (!c) return false;
  const fill = await who.act({ type: "fill", entity: "company", id: c.id, field: "hq", value: "Austin, TX" });
  const ok = [await a.act({ type: "verify", entity: "company", id: c.id, field: "hq" }), await b.act({ type: "verify", entity: "company", id: c.id, field: "hq" })];
  return fill.status === 200 && ok.every((r) => r.status === 200);
}

/** Store a test scan (the server must run with RN_SCAN_TEST=1 and RN_CRON_SECRET). */
const scanPost = (body, secret = CRON_SECRET) =>
  call("POST", "/api/table/scan", { ipAddr: ip(240), body, headers: secret === null ? {} : { "x-cron-secret": secret } });
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const DAY_MS = 24 * 60 * 60 * 1000;
const engOf = (view, id) => {
  for (const c of view.companies) for (const e of c.engagements) if (e.id === id) return { ...e, company: c };
  return null;
};

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

/** A valid value for each field a test fills (role, function and website are left alone). */
const SAMPLE = {
  "company.hq": "Austin, TX",
  "company.linkedin": "linkedin.com/company/qa-test",
  "company.industry": "SaaS",
  "company.employees": "11–50",
  "company.revenue": "$1M–$5M",
  "engagement.type": "Fractional",
  "engagement.status": "Active",
  "engagement.operator": "Qa Operator",
  "engagement.start": "2024-01",
  "engagement.end": "Ongoing",
  "engagement.rate": "$8k/mo",
  "engagement.hours": "15",
  "engagement.posting": "example.com/jobs/qa",
  "engagement.revenue": "$1M–$5M",
  "engagement.employees": "11–50",
  "contact.title": "CEO",
  "contact.relationship": "Decision maker",
  "contact.email": "qa.person@example.com",
  "contact.phone": "+1 555 010 0000",
  "contact.linkedin": "linkedin.com/in/qa-person",
};
const FREE = new Set(["company.hq", "company.linkedin", "company.industry", "company.employees", "company.revenue", "engagement.type", "engagement.start", "engagement.revenue", "engagement.employees", "contact.title", "contact.relationship"]);
const claimed = new Set();
/** n empty cells nobody in this run has picked yet. */
function pickEmpty(view, n, { free = false, entity } = {}) {
  const out = [];
  for (const x of cellsOf(view)) {
    if (out.length >= n) break;
    const col = `${x.entity}.${x.field}`;
    if (x.cell.s !== "empty" || !SAMPLE[col] || (free && !FREE.has(col)) || (entity && x.entity !== entity) || x.company.hidden) continue;
    const k = `${x.id}.${x.field}`;
    if (claimed.has(k)) continue;
    claimed.add(k);
    out.push({ entity: x.entity, id: x.id, field: x.field, value: SAMPLE[col], company: x.company });
  }
  if (out.length < n) throw new Error(`only ${out.length} empty cells left`);
  return out;
}
/**
 * n locked facts that cost 1 credit each. A hidden company is one unlock with its website, LinkedIn and
 * About and with the role and posting of its open roles, so company cells and hidden companies are left out.
 */
const pickLocked = (view, n) => {
  const out = [];
  for (const x of cellsOf(view)) {
    if (out.length >= n) break;
    if (x.cell.s === "locked" && x.entity !== "company" && !x.company.hidden) out.push({ entity: x.entity, id: x.id, field: x.field });
  }
  return out;
};
const fillAct = (t) => ({ type: "fill", entity: t.entity, id: t.id, field: t.field, value: t.value });

/* ---------- sections ---------- */

const sections = {};
const section = (name, fn) => (sections[name] = fn);
const shared = {};

async function admin() {
  if (shared.admin !== undefined) return shared.admin;
  const email = process.env.ADMIN_EMAIL || "admin-qa@example.com";
  if (process.env.ADMIN_TOKEN) return (shared.admin = new Client("Admin Qa", ip(250), process.env.ADMIN_TOKEN));
  // An admin address joins only with the server's cron secret while email sign-in is off.
  const { client } = await join("Admin Qa", ip(250), { email, headers: { "x-cron-secret": CRON_SECRET } });
  if (client) await client.act({ type: "profile", function: "Sales", goal: "friendly" });
  return (shared.admin = client);
}

section("ssrf", async () => {
  const m = await member("Lou Lookup", ip(10));
  for (const url of ["169.254.169.254", "127.0.0.1", "metadata.google.internal", "10.0.0.1", "[::1]", "localhost", "router.lan", "printer.local", "0x7f.1", "http://127.1/", "https://169.254.169.254/latest/meta-data/"]) {
    const r = await call("GET", `/api/table/lookup?url=${encodeURIComponent(url)}`, { token: m.token, ipAddr: m.ip });
    check(`lookup refuses ${url}`, r.status === 400, r.status);
  }
  // A public name that resolves to 127.0.0.1 must not get a connection (checked in the socket's lookup).
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) {
    let hits = 0;
    const srv = createServer((sock) => (hits++, sock.destroy()));
    const listening = await new Promise((resolve) => {
      srv.once("error", () => resolve(false));
      srv.listen(443, "127.0.0.1", () => resolve(true));
    });
    if (listening) {
      const r = await call("GET", "/api/table/lookup?url=localtest.me", { token: m.token, ipAddr: m.ip });
      await new Promise((res) => setTimeout(res, 300));
      check("localtest.me (resolves to 127.0.0.1) makes no connection", hits === 0 && r.status === 200, { hits, status: r.status });
      srv.close();
    } else skip("localtest.me connection check", "cannot listen on 127.0.0.1:443");
  } else skip("localtest.me connection check", "BASE is not this machine");
  const s = await call("GET", "/api/table/lookup?url=stripe.com", { token: m.token, ipAddr: m.ip });
  check("lookup stripe.com still returns Stripe", s.status === 200 && s.json?.name === "Stripe", s.json);
  const l = await member("Lia Limit", ip(11));
  let last = null;
  for (let i = 0; i < 31; i++) last = await call("GET", "/api/table/lookup?url=x", { token: l.token, ipAddr: l.ip });
  check("lookup is limited to 30 a minute", last.status === 429, last.status);
});

section("ids", async () => {
  const m = await member("Ivy Ids", ip(20));
  const r = await call("GET", "/api/table", { token: m.token, ipAddr: m.ip });
  const leaks = (r.text.match(/jamieklanac|lawrencecoffee|patrickkriske/gi) ?? []).length;
  check("no seat holder or person names in ids", leaks === 0, `${leaks} matches`);
  const v = r.json;
  const engIds = v.companies.flatMap((c) => c.engagements.map((e) => e.id));
  const people = v.companies.flatMap((c) => [...c.people, ...c.engagements.flatMap((e) => e.people)]);
  check("engagement ids are e_ + 12 opaque characters", engIds.length > 0 && engIds.every((id) => /^e_[A-Za-z0-9_-]{12}$/.test(id)), engIds.find((id) => !/^e_[A-Za-z0-9_-]{12}$/.test(id)));
  check("person ids are p_ + 12 opaque characters", people.length > 0 && people.every((p) => /^p_[A-Za-z0-9_-]{12}$/.test(p.id)), people.find((p) => !/^p_[A-Za-z0-9_-]{12}$/.test(p.id))?.id);
  check("person engagement ids are public", people.every((p) => p.engagementId === null || /^e_[A-Za-z0-9_-]{12}$/.test(p.engagementId)));
  const nf1 = await m.act({ type: "unlock", entity: "engagement", id: "e_aventinehillpartners_lawrencecoffee", field: "operator" });
  const nf2 = await m.act({ type: "unlock", entity: "engagement", id: "e_AAAAAAAAAAAA", field: "operator" });
  const GONE = "We couldn't find that seat. It may have been removed. Refresh the page and try again.";
  check("internal and unknown ids get the same not-found answer", nf1.json?.error === GONE && nf2.json?.error === GONE, [nf1.json, nf2.json]);

  // Add an engagement, a person on it, and details into it, all by public id.
  const co = v.companies.find((c) => c.engagements.length > 0 && c.cells.website?.s === "value");
  // A new seat says what the work was (a function or a role): a type and a start alone are refused.
  const vague = await m.act({ type: "add", company: co.name, newEngagement: true, engagementFields: { type: "Advisory", start: "2024-03" } });
  check(
    "a new seat with no function or role is refused, and says what to add",
    vague.status === 400 && vague.json?.error === "Add the seat's function or its role too, so members can tell what the work was.",
    vague.json,
  );
  const add = await m.act({ type: "add", company: co.name, newEngagement: true, engagementFields: { function: "Enablement", type: "Advisory", start: "2024-03" } });
  check("add engagement returns a public id", add.status === 200 && /^e_[A-Za-z0-9_-]{12}$/.test(add.json?.id ?? ""), add.json);
  check("adding a seat says what happened and what it earned", /^(Added a seat at .+|.+ was already on Trading Post, so we added what you know to it)\. You earned 3 credits\.$/.test(add.json?.message ?? ""), add.json?.message);
  const eid = add.json?.id;
  const addP = await m.act({ type: "addPerson", companyId: co.id, engagementId: eid, person: { name: "Quinn Qa", title: "CEO" } });
  check("add person on that engagement", addP.status === 200 && /^p_[A-Za-z0-9_-]{12}$/.test(addP.json?.id ?? ""), addP.json);
  check("adding a person names them and says what it earned", /^Added Quinn Qa at .+\. You earned 2 credits\.$/.test(addP.json?.message ?? ""), addP.json?.message);
  const into = await m.act({ type: "add", company: co.name, engagementId: eid, engagementFields: { hours: "12" } });
  check("add details into the engagement by id", into.status === 200 && into.json?.id === eid, into.json);
  check("details added to a company that is already there say so", /^.+ was already on Trading Post, so we added what you know to it\. You earned 1 credit\.$/.test(into.json?.message ?? ""), into.json?.message);
  const same = await m.act({ type: "add", company: co.name, engagementId: eid, engagementFields: { hours: "20" } });
  // DESK-11: an Add that saves nothing says so, instead of "Seat added".
  check("a fact that is already there is left alone, and the answer says nothing new was added", same.status === 200 && /^That seat at .+ is already on file\. Nothing new was added\.$/.test(same.json?.message ?? ""), same.json?.message);
  const coOnly = await m.act({ type: "add", company: co.name });
  check("an Add of a company that is already there, with nothing else, says nothing new was added", coOnly.status === 200 && /^.+ is already on Trading Post\. Nothing new was added\.$/.test(coOnly.json?.message ?? ""), coOnly.json?.message);
  const v2 = await m.view();
  const c2 = v2.companies.find((c) => c.id === co.id);
  const e2 = c2?.engagements.find((e) => e.id === eid);
  check("the credit history says a person's name and title are a person's", ["Person name", "Person title"].every((f) => v2.ledger.some((l) => l.field === f && l.reason === "fill")), v2.ledger.slice(0, 5).map((l) => l.field));
  check("new engagement shows under its company", !!e2 && e2.cells.type?.v === "Advisory" && e2.cells.hours?.v === "12", e2?.cells);
  check("new person shows on the engagement", !!e2?.people.find((p) => p.id === addP.json?.id && p.engagementId === eid));
  const badEng = await m.act({ type: "addPerson", companyId: co.id, engagementId: "e_AAAAAAAAAAAA", person: { name: "Nope Qa" } });
  check("add person on an unknown engagement is refused", badEng.status === 400, badEng.json);
});

section("economy", async () => {
  const A = await member("Ada Tester", ip(30));
  const vA = await A.view();
  const meA = vA.me;
  // First fact: a free one, for the confirmation check below. Then up to the cap.
  const [factX] = pickEmpty(vA, 1, { free: true, entity: "company" });
  const fills = [factX, ...pickEmpty(vA, 25)];
  let lastMsg = "";
  for (let i = 0; i < 25; i++) {
    const r = await A.act(fillAct(fills[i]));
    if (r.status !== 200) return fail(`A fill ${i}`, r.json);
    lastMsg = r.json.message;
  }
  let a = (await A.view()).me;
  check("A earned 25 of 25 after 25 fills", a.earned24h === 25 && a.credits === STARTER + 25, a);
  const capped = await A.act(fillAct(fills[25]));
  check("a fill at the cap says so, without Saved.", capped.status === 200 && /You've reached the limit of 25 credits earned in 24 hours, so this one earned nothing\./.test(capped.json?.message) && !/Saved\./.test(capped.json?.message), capped.json?.message);
  check("toast after a normal fill says what was added and what it earned", /^Added [^:]+\. You earned 1 credit\.$/.test(lastMsg), lastMsg);

  // Invite: the landing can name the inviter.
  const ref = await call("GET", `/api/table?ref=${encodeURIComponent(meA.inviteCode)}`, { ipAddr: ip(31) });
  check("GET ?ref= names the inviter", ref.json?.inviter === "Ada", ref.json);
  const badRef = await call("GET", "/api/table?ref=nope1234", { ipAddr: ip(31) });
  check("GET ?ref= unknown code gives null", badRef.status === 200 && badRef.json?.inviter === null, badRef.json);

  const B = await member("Ben Tester", ip(32), { ref: meA.inviteCode });
  a = (await A.view()).me;
  let b = (await B.view()).me;
  check("after B joins: A invited 1, invitesPaid 0", a.invited === 1 && a.invitesPaid === 0, a);
  check("after B joins: B invitePending", b.invitePending === true, b);
  const vB = await B.view();
  const bFills = pickEmpty(vB, 5);
  const first = await B.act(fillAct(bFills[0]));
  check("B's first fact pays the invite bonus", /Your invite bonus added 10 more\./.test(first.json?.message ?? ""), first.json);
  for (const t of bFills.slice(1)) await B.act(fillAct(t));
  const vA2 = await A.view();
  a = vA2.me;
  const vB2 = await B.view();
  b = vB2.me;
  // The cap covers every credit earned: capped A's invite bonus is held, not paid or lost.
  check("capped A's invite bonus is held, not paid", a.credits === STARTER + 25 && a.held === 10, { credits: a.credits, held: a.held });
  check("A stays at 25 of 25 earned", a.earned24h === 25, a.earned24h);
  check("A invitesPaid 1", a.invitesPaid === 1, a.invitesPaid);
  check("B invitePending false after the first fact", b.invitePending === false, b);
  check("after 5 fills plus an invite, B's meter reads 15 of 25", b.earned24h === 15 && b.credits === STARTER + 5 + 10 && b.held === 0, b);
  const bRef = vB2.ledger.find((l) => l.reason === "referral");
  check("A's ledger has no referral row while it is held", !vA2.ledger.some((l) => l.reason === "referral"), vA2.ledger.slice(0, 3));
  check("B's ledger names A", bRef?.company === "Ada" && bRef?.delta === 10, bRef);

  // Same network: no invite bonus.
  const B2 = await member("Bea Tester", ip(30), { ref: meA.inviteCode });
  const b2v = await B2.view();
  check("an invite from the same network sets no invite", b2v.me.invitePending === false);
  const b2f = await B2.act(fillAct(pickEmpty(b2v, 1)[0]));
  const a3 = (await A.view()).me;
  const b2 = (await B2.view()).me;
  check("same-network invite pays no bonus to either", !/invite bonus/i.test(b2f.json?.message ?? "") && a3.credits === a.credits && a3.held === a.held && b2.credits === STARTER + 1, { msg: b2f.json?.message, a: a3.credits, b2: b2.credits });
  check("A's invited count ignores the same-network join", a3.invited === 1, a3.invited);

  // A confirmation bonus for a capped member is held too.
  const C = await member("Cal Tester", ip(33));
  const D = await member("Dee Tester", ip(34));
  shared.C = C;
  shared.D = D;
  const before = (await A.view()).me.credits;
  const c1 = await C.act({ type: "verify", entity: factX.entity, id: factX.id, field: factX.field });
  const d1 = await D.act({ type: "verify", entity: factX.entity, id: factX.id, field: factX.field });
  const a4 = (await A.view()).me;
  check("two confirmations hold +1 for a capped member", c1.status === 200 && d1.status === 200 && a4.credits === before && a4.held === 11 && a4.earned24h === 25, { c1: c1.json?.message, d1: d1.json?.message, before, after: a4.credits, held: a4.held, earned: a4.earned24h });
  check("confirm result has the new ver and iv", d1.json?.cells?.[0]?.cell?.iv === true && d1.json?.cells?.[0]?.cell?.ver === 2, d1.json?.cells);
  shared.A = A;
  shared.B = B;
});

section("ip", async () => {
  // Proxy-style headers: the client-supplied first entry rotates, the proxy's last entry doesn't.
  const proxy = `${IP_BASE}.200`;
  const codes = [];
  for (let i = 1; i <= 12; i++) {
    const rr = await call("POST", "/api/table", {
      headers: { "x-forwarded-for": `198.51.100.${i}, ${proxy}` },
      // A first and last name of letters (join refuses a name with digits in it, as a seat holder's name does).
      body: { join: { name: `Xff Person${String.fromCharCode(96 + i)}`, email: `qa+${RUN}-xff${i}@example.com` } },
    });
    codes.push(rr.status);
  }
  check("10 joins per IP per hour, forged first X-Forwarded-For entries ignored", codes.slice(0, 10).every((c) => c === 200) && codes[10] === 429 && codes[11] === 429, codes.join(" "));
});

section("unlock", async () => {
  const N = await member("Neo Tester", ip(40));
  const v = await N.view();
  // The first-day limit equals the starter credits (25), so a new account can spend all of them.
  const locked = pickLocked(v, 27);
  const r18 = await N.act({ type: "unlockMany", items: locked.slice(0, 18) });
  check("a new account unlocks 18", r18.status === 200 && r18.json?.me?.credits === STARTER - 18, r18.json);
  const r8 = await N.act({ type: "unlockMany", items: locked.slice(18, 26) });
  check("new account: 18 + 8 says how many are left and what the limit is", r8.json?.error === "You can unlock 7 more today. New accounts can unlock 25 facts in their first 24 hours, then 100 a day.", r8.json);
  const r7 = await N.act({ type: "unlockMany", items: locked.slice(18, 25) });
  check("new account unlocks 7 more (25)", r7.status === 200 && r7.json?.me?.credits === 0, r7.json);
  const r26 = await N.act({ type: "unlock", ...locked[25] });
  check("new account's 26th unlock is refused for credits, not the limit", r26.json?.error === "You're out of credits. Add a missing fact to earn one.", r26.json);

  const S = process.env.SEED_TOKEN ? new Client("Seed Member", ip(41), process.env.SEED_TOKEN) : seedClient(1, ip(41));
  const sv = S ? await S.view() : null;
  if (!sv?.me) return skip("seed member unlock checks", "no SEED_TOKEN, and no seed file the server knows");
  const credits = sv.me.credits;
  const sl = pickLocked(sv, Math.min(60, credits + 1));
  if (credits < 22 || credits > 59 || sl.length < credits + 1) return skip("seed member unlock checks", `needs 22 to 59 credits (has ${credits})`);
  const s21 = await S.act({ type: "unlockMany", items: sl.slice(0, 21) });
  check("a seed member can unlock more than 20 a day", s21.status === 200, s21.json);
  const rest = await S.act({ type: "unlockMany", items: sl.slice(21, credits) });
  check("seed member spends every credit", rest.status === 200 && rest.json?.me?.credits === 0, rest.json?.me ?? rest.json);
  const zero = await S.act({ type: "unlockMany", items: sl.slice(credits, credits + 1) });
  check("0 credits gives the credits message, not the daily limit", zero.json?.error === "You're out of credits. Add a missing fact to earn one.", zero.json);
});

section("reports", async () => {
  const C = shared.C ?? (await member("Cal Tester", ip(33)));
  const D = shared.D ?? (await member("Dee Tester", ip(34)));
  const E = await member("Eve Tester", ip(50));
  const Fresh = await member("Fay Fresh", ip(51));
  const adm = await admin();
  const cv = await C.view();
  // Reporters need a paid fill.
  await C.act(fillAct(pickEmpty(cv, 1)[0]));
  await D.act(fillAct(pickEmpty(cv, 1)[0]));
  const targets = [];
  // Seed facts (from our own records) that no test in this run touched.
  for (const x of cellsOf(cv)) {
    if (x.entity !== "company" || !["hq", "industry", "employees", "revenue"].includes(x.field) || claimed.has(`${x.id}.${x.field}`)) continue;
    if (x.cell.s === "value" && !x.cell.mine && !x.cell.system && x.cell.from === "records" && !x.company.mine) targets.push(x);
    if (targets.length >= 12) break;
  }
  const t = targets[0];
  const ref = { entity: t.entity, id: t.id, field: t.field };
  const nofill = await Fresh.act({ type: "report", ...ref });
  check("a new account with no fills can't report", nofill.json?.error === "Reporting opens once you've added a fact of your own. Add one first.", nofill.json);
  const r1 = await C.act({ type: "report", ...ref });
  check("report says it is hidden for the reporter and goes to review", r1.json?.message === "Reported. It's hidden for you now, and an admin will review it." && r1.json?.cells?.[0]?.cell?.s === "reported", r1.json);
  const again = await C.act({ type: "report", ...ref });
  check("reporting twice says 'You already reported this.'", again.json?.message === "You already reported this.", again.json);
  check("the reporter sees it under review", findCell(await C.view(), ref.entity, ref.id, ref.field)?.s === "reported");
  check("another member still sees the value", findCell(await D.view(), ref.entity, ref.id, ref.field)?.s === "value");
  if (adm) {
    const row = (await adm.view()).reported.find((r) => r.id === ref.id && r.field === ref.field);
    check(
      "admin sees the row with names, date and company",
      !!row && row.reporters.join() === "Cal Tester" && row.addedBy === "Revenue Nomad records" && !!row.reportedAt && row.companyId === t.company.id,
      row,
    );
  } else skip("admin report row", "no admin account (set ADMIN_TOKEN)");
  await D.act({ type: "report", ...ref });
  check("after a second report it is hidden for everyone", findCell(await E.view(), ref.entity, ref.id, ref.field)?.s === "reported");
  if (adm) {
    const keep = await adm.act({ type: "review", ...ref, decision: "keep" });
    check("admin keep", keep.json?.message === "Kept. It shows for everyone again.", keep.json);
    check("kept fact is visible again to its reporter", findCell(await C.view(), ref.entity, ref.id, ref.field)?.s === "value");
    check("kept fact leaves the review list", !(await adm.view()).reported.some((r) => r.id === ref.id && r.field === ref.field));
  }
  // Daily report limit: 10 in 24 hours (the first one above counts).
  let r = null;
  for (const x of targets.slice(1, 11)) r = await C.act({ type: "report", entity: x.entity, id: x.id, field: x.field });
  check("the 11th report in a day is refused", r?.json?.error === "You've reported 10 facts in 24 hours, which is the limit. Try again tomorrow.", r?.json);
  if (adm) {
    const x = targets[1];
    const rm = await adm.act({ type: "review", entity: x.entity, id: x.id, field: x.field, decision: "remove" });
    check("admin remove", rm.json?.message === "Removed. Anyone who unlocked it got their credit back, and it can be added again.", rm.json);
    check("removed fact reopens", findCell(await D.view(), x.entity, x.id, x.field)?.s === "empty");
  }
});

section("fields", async () => {
  const m = await member("Fin Fields", ip(60));
  const v = await m.view();
  const eng = v.companies.flatMap((c) => c.engagements).find((e) => e.cells.rate?.s === "empty" && e.cells.hours?.s === "empty" && !claimed.has(`${e.id}.rate`) && !claimed.has(`${e.id}.hours`));
  if (!eng) return fail("an engagement with empty rate and hours");
  claimed.add(`${eng.id}.rate`);
  claimed.add(`${eng.id}.hours`);
  for (const bad of ["Test value", "Austin, TX", "123"]) {
    const r = await m.act({ type: "fill", entity: "engagement", id: eng.id, field: "rate", value: bad });
    check(`rate refuses '${bad}'`, r.json?.error === "Rate. Use a rate like $8k/mo or $150/hr.", r.json);
  }
  const ok = await m.act({ type: "fill", entity: "engagement", id: eng.id, field: "rate", value: "€6,000 per month" });
  check("rate accepts '€6,000 per month'", ok.status === 200, ok.json);
  const hrs = await m.act({ type: "fill", entity: "engagement", id: eng.id, field: "hours", value: "99" });
  check("hours 99 says 'Hours a week. Use a whole number from 1 to 80.'", hrs.json?.error === "Hours a week. Use a whole number from 1 to 80.", hrs.json);
  const raw = `Uni \u0000‮EVIL‬ Co ${RUN}`;
  const add = await m.act({ type: "add", company: raw });
  const v2 = await m.view();
  check("control and bidi characters are stripped from names", add.status === 200 && v2.companies.some((c) => c.name === `Uni EVIL Co ${RUN}`), add.json);
});

section("stats", async () => {
  const anon = ip(70);
  const s1 = await call("GET", "/api/table", { ipAddr: anon });
  const s2 = await call("GET", "/api/table", { ipAddr: anon });
  check("signed-out GET gives the same stats twice", JSON.stringify(s1.json.stats) === JSON.stringify(s2.json.stats) && s1.json.companies.length === 0);
  check(`stats.starter is ${STARTER}`, s1.json.stats.starter === STARTER, s1.json.stats);
  check("signed-out stats say how many roles opened this week", Number.isInteger(s1.json.stats.openedWeek) && s1.json.stats.openedWeek >= 0 && s1.json.stats.openedWeek <= s1.json.stats.openRoles, s1.json.stats);
  const m = await member("Sam Stats", ip(71));
  const v = await m.view();
  check("a fresh join gets the starter credits the landing shows", v.me.credits === s1.json.stats.starter, [v.me.credits, s1.json.stats.starter]);
  const fills = pickEmpty(v, 1);
  await m.act(fillAct(fills[0]));
  const s3 = await call("GET", "/api/table", { ipAddr: anon });
  check("stats change after a member action", s3.json.stats.facts === s2.json.stats.facts + 1, [s2.json.stats.facts, s3.json.stats.facts]);
  const open = v.companies.filter((c) => c.friendly.open > 0);
  check("hiring companies score Medium or better", open.length > 0 && open.every((c) => c.friendly.score >= 30 && ["Medium", "High"].includes(c.friendly.tier)), open.map((c) => [c.name, c.friendly.score]));
  check("every company's friendly has recent", v.companies.every((c) => typeof c.friendly.recent === "number"));
  check("stats.fractionalFriendly counts Medium and High", v.stats.fractionalFriendly === v.companies.filter((c) => ["Medium", "High"].includes(c.friendly.tier)).length);
  const names = v.companies.map((c) => c.name);
  const bad = names.filter((n) => /301 W Osborn|Triangle, Grand Avenue|Greensburg, Kansas/i.test(n));
  check("addresses and projects are not companies", bad.length === 0, bad);
  // GET rate limit.
  const lim = ip(72);
  const codes = await Promise.all(Array.from({ length: 121 }, () => call("GET", "/api/table", { ipAddr: lim }).then((r) => r.status)));
  check("the 121st GET in a minute from one IP gets 429", codes.filter((c) => c === 200).length === 120 && codes.filter((c) => c === 429).length === 1, codes.filter((c) => c !== 200).length);
});

section("gzip", async () => {
  const m = await member("Gus Gzip", ip(80));
  const as = (enc) => rawGet("/api/table", { ...(enc ? { "accept-encoding": enc } : {}), cookie: `rn_table=${m.token}`, "x-forwarded-for": m.ip });
  const parse = (body, unpack) => {
    try {
      return JSON.parse(unpack(body).toString("utf8"));
    } catch {
      return null;
    }
  };
  // PERF-8: brotli when the browser takes it (every current browser does over https), gzip otherwise.
  const b = await as("gzip, deflate, br");
  const bv = parse(b.body, brotliDecompressSync);
  check("GET is brotli when accepted", b.headers["content-encoding"] === "br" && !!bv?.companies?.length, b.headers["content-encoding"]);
  const z = await as("gzip, deflate");
  const zv = parse(z.body, gunzipSync);
  check("GET is gzipped when brotli isn't accepted", z.headers["content-encoding"] === "gzip" && !!zv?.companies?.length, z.headers["content-encoding"]);
  const refused = await as("br;q=0, gzip");
  check("a coding the client refuses with q=0 is not used", refused.headers["content-encoding"] === "gzip", refused.headers["content-encoding"]);
  const plain = await as(null);
  console.log(`  member view: ${(plain.body.length / 1024).toFixed(0)} KB raw, ${(z.body.length / 1024).toFixed(1)} KB gzip, ${(b.body.length / 1024).toFixed(1)} KB brotli`);
  check("brotli is smaller than gzip", b.body.length < z.body.length, [b.body.length, z.body.length]);
  check("the compressed view is under 200 KB", z.body.length < 200 * 1024 && b.body.length < 200 * 1024, [z.body.length, b.body.length]);
  check("both say the same thing", JSON.stringify(bv?.me) === JSON.stringify(zv?.me) && bv?.companies?.length === zv?.companies?.length, [bv?.companies?.length, zv?.companies?.length]);
  check("vary: Accept-Encoding", /accept-encoding/i.test(String(b.headers.vary ?? "")) && /accept-encoding/i.test(String(z.headers.vary ?? "")));
  check("not compressed when not accepted", !plain.headers["content-encoding"] && !!JSON.parse(plain.body.toString("utf8")).companies);
});

section("result", async () => {
  const m = await member("Ria Result", ip(90));
  const v = await m.view();
  const [t] = pickLocked(v, 1);
  const r = await m.act({ type: "unlock", ...t });
  const c = r.json?.cells?.[0];
  const later = findCell(await m.view(), t.entity, t.id, t.field);
  check("unlock returns the cell a later GET shows", c?.id === t.id && c?.cell?.s === "value" && JSON.stringify(c.cell) === JSON.stringify(later), [c, later]);
  check("unlock returns credits one lower", r.json?.me?.credits === v.me.credits - 1 && r.json?.me?.unlocked === 1, r.json?.me);
  const [f] = pickEmpty(v, 1);
  const fr = await m.act(fillAct(f));
  const fc = fr.json?.cells?.[0];
  const flater = findCell(await m.view(), f.entity, f.id, f.field);
  check("fill returns the new cell", fc?.cell?.s === "value" && fc.cell.mine === true && fc.cell.v === f.value && JSON.stringify(fc.cell) === JSON.stringify(flater), [fc, flater]);
  check("fill returns me", fr.json?.me?.added === 1 && fr.json?.me?.credits === v.me.credits - 1 + 1 && fr.json?.me?.earned24h === 1, fr.json?.me);
  // A role fill on an engagement with no function returns the function cell too.
  const eng = v.companies.flatMap((x) => x.engagements).find((e) => e.cells.role?.s === "empty" && e.cells.function?.s === "empty" && !claimed.has(`${e.id}.role`));
  if (eng) {
    claimed.add(`${eng.id}.role`);
    const rr = await m.act({ type: "fill", entity: "engagement", id: eng.id, field: "role", value: "Fractional CMO" });
    const fn = rr.json?.cells?.find((x) => x.field === "function");
    check("role fill returns the function it filled", fn?.cell?.v === "Marketing", rr.json?.cells);
  } else skip("role fill function cell", "no engagement with empty role and function");
});

section("join", async () => {
  const email = `qa+${RUN}-dup@example.com`;
  await join("Dup Tester", ip(100), { email });
  const { r: dup } = await join("Dup Tester", ip(100), { email });
  check("joined email: 'That email already belongs to a member. Sign in with your personal link.'", dup.json?.error === "That email already belongs to a member. Sign in with your personal link.", dup.json);
  if (process.env.SEED_EMAIL) {
    const { r: seed } = await join("Seed Tester", ip(100), { email: process.env.SEED_EMAIL });
    check("seed member email gives the same answer", seed.json?.error === dup.json?.error, seed.json);
  } else skip("seed email join", "SEED_EMAIL not set");
  // The server answers a bad name or email in the same words the join form uses for its own checks.
  const { r: noName } = await join("J", ip(103));
  check("a one-letter name: 'Add your first and last name.'", noName.status === 400 && noName.json?.error === "Add your first and last name.", noName.json);
  // DESK-24: the label asks for a first and last name, and a seat links to a member by that name.
  const { r: oneWord } = await join("Robin", ip(103));
  check("a one-word name is refused: 'Add your first and last name.'", oneWord.status === 400 && oneWord.json?.error === "Add your first and last name.", oneWord.json);
  const { r: digits } = await join("Robin 2000", ip(103));
  check("a name with digits in it is refused the same way", digits.status === 400 && digits.json?.error === "Add your first and last name.", digits.json);
  const { r: accented } = await join("Zoë O'Brien-Núñez", ip(103));
  check("a first and last name with accents, an apostrophe and a hyphen joins", accented.status === 200, accented.json);
  const { r: badMail } = await join("Bad Email", ip(103), { email: "not-an-email" });
  check("a bad email: the join form's own words", badMail.status === 400 && badMail.json?.error === "That doesn't look like an email address. Check it for a typo.", badMail.json);
  const m = await member("Sid Signin", ip(101));
  const k = m.token;
  for (const raw of [`${BASE}/?k=${k}`, k, `  ${k}  `, `${BASE}/?k=${k}.`, `<${BASE}/?k=${k}>`, `/table?k=${k}`]) {
    const r = await call("POST", "/api/table", { ipAddr: ip(102), body: { signIn: raw } });
    check(`sign in with ${JSON.stringify(raw.replace(k, "CODE").replace(BASE, "…"))}`, r.status === 200, r.json);
  }
  const wrong = await call("POST", "/api/table", { ipAddr: ip(102), body: { signIn: "notarealcode123" } });
  check("a wrong code gets 401", wrong.status === 401, wrong.status);
});

section("seat", async () => {
  const S = await member("Sana Seatholder", ip(70));
  const T = await member("Theo Tester", ip(71));
  const anon = await call("GET", "/api/table?people=sana", { ipAddr: ip(72) });
  check("signed-out member search returns nothing", anon.status === 200 && Array.isArray(anon.json?.members) && anon.json.members.length === 0, anon.json);
  const found = await call("GET", "/api/table?people=" + encodeURIComponent("sana sea"), { token: T.token, ipAddr: T.ip });
  const hit = found.json?.members?.find((m) => m.name === "Sana Seatholder");
  check("member search finds a member by first-name and last-name prefixes", !!hit && !("email" in hit) && !/sana/i.test(hit.id), found.json);
  const short = await call("GET", "/api/table?people=s", { token: T.token, ipAddr: T.ip });
  check("a one-letter search returns nothing", short.json?.members?.length === 0, short.json);

  // Fresh engagements to fill (the few empty seat holders on file are open roles).
  const v0 = await T.view();
  const hosts = v0.companies.filter((c) => !c.hidden).slice(-3);
  const seats = [];
  for (const c of hosts) {
    const r = await T.act({ type: "add", company: c.name, newEngagement: true, engagementFields: { function: "Marketing", type: "Advisory", start: "2024-06" } });
    if (r.status !== 200 || !r.json?.id) return fail("seat: add engagement", r.json);
    seats.push({ id: r.json.id });
  }
  const one = await T.act({ type: "fill", entity: "engagement", id: seats[0].id, field: "operator", value: "Jane" });
  check("a one-word seat holder is refused with a first-and-last-name message", one.status === 400 && /first and last name/.test(one.json?.error ?? ""), one.json);
  const mail = await T.act({ type: "fill", entity: "engagement", id: seats[0].id, field: "operator", value: "jane@acme.com" });
  check("an email as seat holder is refused", mail.status === 400, mail.json);
  const bogus = await T.act({ type: "fill", entity: "engagement", id: seats[0].id, field: "operator", value: "Sana Seatholder", memberId: "m_notamember1" });
  check("an unknown member id is refused", bogus.status === 400 && /isn't on Trading Post/.test(bogus.json?.error ?? ""), bogus.json);
  const linked = await T.act({ type: "fill", entity: "engagement", id: seats[0].id, field: "operator", value: "whatever typed", memberId: hit?.id });
  const c0 = linked.json?.cells?.[0]?.cell;
  check("picking a member saves their name and links the seat", linked.status === 200 && c0?.v === "Sana Seatholder" && c0?.member && c0.member.you === false, linked.json);
  const typed = await T.act({ type: "fill", entity: "engagement", id: seats[1].id, field: "operator", value: "sana  seatholder" });
  const c1 = typed.json?.cells?.[0]?.cell;
  check("typing a member's exact name links it too", typed.status === 200 && !!c1?.member, typed.json);
  const other = await T.act({ type: "fill", entity: "engagement", id: seats[2].id, field: "operator", value: "Jean-Luc O'Neill" });
  const c2 = other.json?.cells?.[0]?.cell;
  check("a non-member full name saves without a member link", other.status === 200 && c2?.s === "value" && !c2.member, other.json);
  // The linked member sees "You" on their own seat without unlocking it.
  const vS = await S.view();
  let mine = null;
  for (const x of cellsOf(vS)) if (x.id === seats[0].id && x.field === "operator") mine = x.cell;
  check("the linked member sees the seat as theirs, free", mine?.member?.you === true && vS.me.credits === STARTER && vS.me.unlocked === 0, { mine, credits: vS.me.credits });
  const un = await S.act({ type: "unlock", entity: "engagement", id: seats[0].id, field: "operator" });
  check("there is nothing to unlock on your own seat", un.json?.error === "Nothing here is locked, so no credit was spent.", un.json);
  // Locked cells never carry the member link.
  const vT2 = await (await member("Uma Viewer", ip(73))).view();
  let locked = null;
  for (const x of cellsOf(vT2)) if (x.id === seats[0].id && x.field === "operator") locked = x.cell;
  check("a locked seat holder carries no member hint", locked?.s === "locked" && !("member" in locked), locked);
});

section("hidden", async () => {
  // A company with an active open role hides its identity until unlocked (1 credit).
  const H = await member("Hana Hidden", ip(80));
  const v = await H.view();
  const hid = v.companies.filter((c) => c.hidden);
  check("companies with an open role come back hidden", hid.length > 0 && hid.every((c) => c.friendly.open > 0), hid.length);
  const c = hid[0];
  if (!c) return fail("hidden: no hidden company to test");
  check("a hidden company has no name, logo, website, LinkedIn or About", c.name === "Hidden company" && c.iconDomain === null && ["website", "linkedin", "about"].every((k) => c.cells[k]?.s !== "value"), { name: c.name, icon: c.iconDomain, w: c.cells.website, l: c.cells.linkedin });
  const hq = c.cells.hq;
  check("a hidden company's HQ is cut to its region", !hq || hq.s !== "value" || !hq.v.includes(","), hq);
  check("company ids are opaque", v.companies.every((x) => /^c_[A-Za-z0-9_-]{12}$/.test(x.id)), v.companies.slice(0, 3).map((x) => x.id));
  check("open companies still show their name", v.companies.some((x) => !x.hidden && x.name !== "Hidden company"));
  const empty = Object.entries(c.cells).find(([, cell]) => cell.s === "empty");
  if (empty) {
    const f = await H.act({ type: "fill", entity: "company", id: c.id, field: empty[0], value: SAMPLE[`company.${empty[0]}`] ?? "Somewhere, TX" });
    check("adding a fact at a hidden company by its id is refused", f.status === 400 && /This company is hidden\. Unlock it for 1 credit/.test(f.json?.error ?? ""), f.json);
  }
  const fo = await H.act({ type: "follow", companyId: c.id, on: true });
  check("following a hidden company doesn't say its name", fo.status === 200 && /this company/.test(fo.json?.message ?? ""), fo.json);
  const before = (await H.view()).me.credits;
  const un = await H.act({ type: "unlock", entity: "company", id: c.id, field: "identity" });
  const v2 = await H.view();
  const c2 = v2.companies.find((x) => x.id === c.id);
  check("unlocking a company costs 1 credit and reveals it", un.status === 200 && v2.me.credits === before - 1 && c2 && !c2.hidden && c2.name !== "Hidden company", { msg: un.json, credits: [before, v2.me.credits], name: c2?.name });
  // The same credit opens the role and the posting of its open roles, and the answer names them too.
  const boughtWith = (c2?.engagements ?? []).some((e) => e.cells.role?.s === "value" || e.cells.posting?.s === "value");
  const named = (un.json?.message ?? "").startsWith(`Unlocked ${c2?.name}`) && un.json?.message.endsWith(" for 1 credit.");
  check("the answer names the company, what came with it and the price", !!c2 && named && (!boughtWith || /, the role|, the posting| and the (role|posting)/.test(un.json?.message ?? "")), un.json?.message);
  const again = await H.act({ type: "unlockMany", items: [{ entity: "company", id: c.id, field: "identity" }, { entity: "company", id: c.id, field: "website" }] });
  check("unlocking it again costs nothing", again.status === 200 && (await H.view()).me.credits === before - 1, again.json);
  check("and says no credits were spent", again.json?.message === "You can already see all of these, so no credits were spent.", again.json?.message);
  // Someone who already knows the name can add to it by typing it, and then sees it.
  const K = await member("Kai Knows", ip(81));
  const kv = await K.view();
  check("the company is still hidden for another member", kv.companies.find((x) => x.id === c.id)?.hidden === true);
  const add = await K.act({ type: "add", company: c2.name, newEngagement: true, engagementFields: { function: "Sales", type: "Fractional", start: "2025-01" } });
  const kc = (await K.view()).companies.find((x) => x.id === c.id);
  check("adding by typing the real name works and reveals it to that member", add.status === 200 && kc && !kc.hidden, { add: add.json, hidden: kc?.hidden });
  const fake = await K.act({ type: "add", company: "Hidden company", newEngagement: true, engagementFields: { function: "Sales" } });
  check("the placeholder name can't be added as a company", fake.status === 400, fake.json);
  // The ledger never names a hidden company.
  const L = await member("Lea Ledger", ip(82));
  const lv = await L.view();
  // A person's name: the role of an open role now comes with the company, which would unhide it.
  const peopleAt = (x) => [...x.people, ...x.engagements.flatMap((e) => e.people)];
  const h2 = lv.companies.find((x) => x.hidden && peopleAt(x).some((p) => p.cells.name?.s === "locked"));
  if (h2) {
    const p = peopleAt(h2).find((x) => x.cells.name?.s === "locked");
    await L.act({ type: "unlock", entity: "contact", id: p.id, field: "name" });
    const lv2 = await L.view();
    check("the ledger says Hidden company for an unlock there", lv2.ledger[0]?.company === "Hidden company", lv2.ledger[0]);
  }
});

section("gtm", async () => {
  const G = await member("Gia Gtm", ip(90));
  const v = await G.view();
  const co = v.companies.find((c) => !c.hidden && ["businessModel", "motion", "dealSize", "salesCycle"].every((k) => c.cells[k]?.s === "empty"));
  if (!co) return fail("gtm: no company with empty GTM fields");
  check("companies carry the new GTM fields, empty and free", ["businessModel", "motion", "dealSize", "salesCycle"].every((k) => co.cells[k]?.s === "empty"));
  const ok = [];
  for (const [k, val] of [["businessModel", "B2B"], ["motion", "PLG to sales"], ["dealSize", "$15K–$50K"], ["salesCycle", "30–90 days"]]) ok.push((await G.act({ type: "fill", entity: "company", id: co.id, field: k, value: val })).status);
  check("business model, sales motion, deal size and sales cycle save from Revenue Nomad's lists", ok.every((x) => x === 200), ok);
  const bad = await G.act({ type: "fill", entity: "company", id: v.companies.find((c) => !c.hidden && c.cells.dealSize?.s === "empty" && c.id !== co.id).id, field: "dealSize", value: "$20K" });
  check("a deal size outside the list is refused", bad.status === 400, bad.json);
  check("revenue uses the standard 'Under $1M' label", !JSON.stringify(v.companies.map((c) => c.cells.revenue)).includes("< $1M"));
  const host = v.companies.filter((c) => !c.hidden && c.id !== co.id)[3];
  const add = await G.act({ type: "add", company: host.name, newEngagement: true, engagementFields: { function: "Sales", reason: "Build the first sales motion", sourced: "Investor intro", pricing: "Monthly retainer" } });
  const e = (await G.view()).companies.find((c) => c.id === host.id).engagements.find((x) => x.id === add.json?.id);
  check("an engagement takes why they hired, how it was sourced and pricing model", add.status === 200 && e?.cells.reason?.v === "Build the first sales motion" && e?.cells.sourced?.v === "Investor intro" && e?.cells.pricing?.v === "Monthly retainer", e?.cells);
  const other = await (await member("Oli Other", ip(91))).view();
  const oe = other.companies.find((c) => c.id === host.id).engagements.find((x) => x.id === add.json?.id);
  check("how it was sourced is locked for others; why hired and pricing are free", oe?.cells.sourced?.s === "locked" && oe?.cells.reason?.s === "value" && oe?.cells.pricing?.s === "value", oe?.cells);
  // New this round: hours are free, AI roles have their own function, and two new pick-list values.
  const host2 = v.companies.filter((c) => !c.hidden && c.id !== co.id)[4];
  const ai = await G.act({ type: "add", company: host2.name, newEngagement: true, engagementFields: { role: "Fractional AI SDR Lead", hours: "10", reason: "Move off founder-led sales", status: "Closed" } });
  const ae = (await G.view()).companies.find((c) => c.id === host2.id).engagements.find((x) => x.id === ai.json?.id);
  check("an AI role title files the seat under AI GTM", ai.status === 200 && ae?.cells.function?.v === "AI GTM", ae?.cells.function);
  const oa = (await (await member("Ola Other", ip(91))).view()).companies.find((c) => c.id === host2.id).engagements.find((x) => x.id === ai.json?.id);
  check("hours per week and status are free; status Closed and the new hire reason are accepted", oa?.cells.hours?.v === "10" && oa.cells.reason?.v === "Move off founder-led sales" && oa.cells.status?.v === "Closed", oa?.cells);
});

section("benchmarks", async () => {
  const R = await member("Rae Rates", ip(92));
  const v = await R.view();
  const rows = v.benchmarks?.rows ?? [];
  check("signed-in views carry benchmarks", !!v.benchmarks && v.benchmarks.minN === 5 && Array.isArray(v.benchmarks.rows));
  const anon = await call("GET", "/api/table", { ipAddr: ip(93) });
  check("signed-out views carry no benchmarks", !anon.json?.benchmarks);
  const REVENUE = ["All", "Pre-revenue", "Under $1M", "$1M–$5M", "$5M–$20M", "$20M–$50M", "$50M+"];
  const fns = [...new Set(rows.map((r) => r.function))];
  check("a row for every function, AI GTM included", fns.length === 11 && fns.includes("AI GTM"), fns);
  check(
    "each function has a row for All and for every client revenue band",
    fns.every((fn) => REVENUE.every((rev) => rows.filter((r) => r.function === fn && r.revenue === rev).length === 1)) && rows.length === fns.length * REVENUE.length,
    rows.length,
  );
  const stats = rows.flatMap((r) => [r.monthly, r.hourly]);
  check("every group says how many rates it needs (5 or 20)", stats.every((s) => s.min === 5 || s.min === 20), stats.find((s) => s.min !== 5 && s.min !== 20));
  check("no group below its floor shows numbers", stats.every((s) => s.n >= s.min || (s.median === undefined && s.p25 === undefined && s.p75 === undefined)), stats.find((s) => s.n < s.min && s.median !== undefined));
  check("every group at its floor shows numbers", stats.every((s) => s.n < s.min || typeof s.median === "number"));
  check("a group without Rate Index data needs 5", rows.filter((r) => !r.indexed).every((r) => r.monthly.min === 5 && r.hourly.min === 5));
  check("a group needs 20 only when it has Rate Index data", rows.every((r) => r.indexed || (r.monthly.min === 5 && r.hourly.min === 5)) && rows.filter((r) => r.monthly.min === 20 || r.hourly.min === 20).every((r) => r.indexed));

  const rowOf = (view, fn, rev) => view.benchmarks.rows.find((r) => r.function === fn && r.revenue === rev);
  const hosts = v.companies.filter((c) => !c.hidden);
  const addRate = (who, host, fn, rev, extra) =>
    who.act({ type: "add", company: host.name, newEngagement: true, engagementFields: { function: fn, ...(rev === "All" ? {} : { revenue: rev }), ...extra } });

  // A floor counts people, and a new account's rate does not count toward it yet, so the
  // rates below come from seed members, one each (scripts/test-bench.mjs has the full rules).
  const T = seedFile ? Array.from({ length: 10 }, (_, i) => seedClient(11 + i, ip(170 + i))).filter(Boolean) : [];
  // The plain floor: a group with no Rate Index data shows numbers at 5 contributors.
  const plain = rows.find((r) => !r.indexed && r.revenue !== "All" && r.monthly.n === 0) ?? rows.find((r) => !r.indexed && r.monthly.n < 5);
  if (plain && T.length === 10) {
    const rates = ["$6k/mo", "$8k/mo", "$9k per month", "$10k/mo", "$12,000 monthly"];
    const need = 5 - plain.monthly.n;
    for (let i = 0; i < need; i++) {
      if (i === need - 1) {
        const pre = rowOf(await R.view(), plain.function, plain.revenue).monthly;
        check("a group with 4 rates shows no numbers", pre.median === undefined && pre.n === 4, pre);
      }
      await addRate(T[i], hosts[10 + i], plain.function, plain.revenue, { pricing: "Monthly retainer", rate: rates[i] });
    }
    const m = rowOf(await R.view(), plain.function, plain.revenue).monthly;
    check("5 contributors show a median, and the range waits for 10", m.n === 5 && m.min === 5 && typeof m.median === "number" && m.p25 === undefined && m.p75 === undefined, m);
  } else skip("plain floor of 5", T.length === 10 ? "every group already has Rate Index data or 5 rates" : "no seed file the server knows");

  // The Rate Index floor: a group with Rate Index data shows numbers only at 20 rates.
  const idx = rows.find((r) => r.indexed && r.revenue !== "All" && r.hourly.min === 20 && r.hourly.n >= 10 && r.hourly.n < 20);
  if (idx && T.length === 10 && idx.hourly.n >= 15) {
    const I = await member("Ina Index", ip(94));
    check("a Rate Index group below 20 shows no numbers", idx.hourly.median === undefined && idx.hourly.min === 20, idx.hourly);
    const need = 20 - idx.hourly.n;
    for (let i = 0; i < need; i++) {
      if (i === need - 1) {
        const pre = rowOf(await I.view(), idx.function, idx.revenue).hourly;
        check("a Rate Index group with 19 rates still shows no numbers", pre.n === 19 && pre.median === undefined, pre);
      }
      await addRate(T[5 + i], hosts[20], idx.function, idx.revenue, { pricing: "Hourly", rate: `$${140 + i * 5}/hr` });
    }
    const h = rowOf(await I.view(), idx.function, idx.revenue).hourly;
    // Once it shows, the count also takes in rates from new accounts that were waiting.
    check("a Rate Index group shows numbers at 20 rates", h.n >= 20 && h.min === 20 && typeof h.median === "number" && h.p25 <= h.median && h.median <= h.p75, h);
    check("that group is marked as including Rate Index data", rowOf(await I.view(), idx.function, idx.revenue).indexed === true);
  } else skip("Rate Index floor of 20", "the seed has no Rate Index group with 10 to 19 hourly rates (add a small rateIndex to the test seed)");
  if (seedFile?.rateIndex?.length) {
    check("Rate Index points count in the benchmarks", rows.some((r) => r.indexed) && v.benchmarks.total >= seedFile.rateIndex.length, v.benchmarks.total);
    // An index entry with hours a month gives a monthly point too (counted where the figure counts Rate Index data).
    const idxAll = rows.filter((r) => r.revenue === "All" && r.monthly.indexed);
    const withHours = seedFile.rateIndex.filter((x) => idxAll.some((r) => r.function === x.fn) && x.hours && x.hourly * x.hours >= 1000 && x.hourly * x.hours <= 150000).length;
    const monthlyAll = idxAll.reduce((n, r) => n + r.monthly.n, 0);
    check("Rate Index entries with hours a month give monthly points", idxAll.length > 0 && monthlyAll >= withHours, { monthlyAll, withHours });
  } else skip("Rate Index totals", "the seed here has no rateIndex");

  // Hours on the record give the other kind too: $150/hr at 10 hours a week is about $6,500 a month.
  if (T.length < 10) return skip("hours and revenue band checks", "no seed file the server knows");
  const D = T[8];
  const dFn = "Executive";
  const dRev = "Pre-revenue";
  // (Seen by another member: a member's own rates are left out of the benchmarks they see.)
  const before = rowOf(await R.view(), dFn, dRev);
  const beforeAll = rowOf(await R.view(), dFn, "All");
  const der = await addRate(D, hosts[30], dFn, dRev, { pricing: "Hourly", rate: "$150/hr", hours: "10" });
  const after = rowOf(await R.view(), dFn, dRev);
  check("an hourly rate with hours a week counts as hourly and as monthly", der.status === 200 && after.hourly.n === before.hourly.n + 1 && after.monthly.n === before.monthly.n + 1, { before, after });
  check("it counts in the All row too", rowOf(await R.view(), dFn, "All").hourly.n === beforeAll.hourly.n + 1);
  const own = rowOf(await D.view(), dFn, dRev);
  check("the member who shared it sees the group without their own rate, and is told so", own.hourly.n === before.hourly.n && own.hourly.withoutYours === true, own.hourly);
  const mo = await addRate(T[9], hosts[31], dFn, dRev, { pricing: "Monthly retainer", rate: "$8k/mo" });
  const after2 = rowOf(await R.view(), dFn, dRev);
  check("a monthly rate with no hours counts once", mo.status === 200 && after2.monthly.n === after.monthly.n + 1 && after2.hourly.n === after.hourly.n, after2);
  // The band comes from the engagement's revenue at the time, else the company's.
  const coBand = hosts.find((c) => c.cells.revenue?.s === "value" && c.cells.revenue.v !== dRev && !c.mine);
  if (coBand) {
    const b0 = rowOf(await R.view(), dFn, coBand.cells.revenue.v).monthly.n;
    await D.act({ type: "add", company: coBand.name, newEngagement: true, engagementFields: { function: dFn, pricing: "Monthly retainer", rate: "$7k/mo" } });
    check("with no revenue on the seat, the company's revenue band is used", rowOf(await R.view(), dFn, coBand.cells.revenue.v).monthly.n === b0 + 1);
  }
});

section("seats", async () => {
  const Y = await member("Yara Yours", ip(110));
  const T = await member("Tom Teller", ip(111));
  const U = await member("Una Other", ip(112));
  const v0 = await T.view();
  const host = v0.companies.filter((c) => !c.hidden && c.friendly.open === 0)[40];
  const found = await call("GET", "/api/table?people=" + encodeURIComponent("yara yours"), { token: T.token, ipAddr: T.ip });
  const pick = found.json?.members?.find((m) => m.name === "Yara Yours");
  // T adds a seat Yara held, with gated facts on it.
  const add = await T.act({
    type: "add", company: host.name, newEngagement: true, operatorMemberId: pick?.id,
    engagementFields: { function: "Sales", type: "Fractional", role: "Fractional VP Sales", status: "Ended", operator: "Yara Yours", start: "2024-02", end: "2025-01", sourced: "Referral", rate: "$9k/mo", posting: "example.com/jobs/yara" },
    people: [{ name: "Pat Person", title: "CEO", relationship: "Reported to", email: "pat.person@example.com" }],
  });
  const eid = add.json?.id;
  if (add.status !== 200 || !eid) return fail("seats: add a seat for Yara", add.json);
  const GATED = ["role", "operator", "end", "sourced", "rate", "posting"];
  const vy = await Y.view();
  const ey = engOf(vy, eid);
  check("the seat holder's engagement comes back as yours", ey?.yours === true, ey?.yours);
  check("every gated fact on your own seat is visible", GATED.every((k) => ey?.cells[k]?.s === "value"), GATED.map((k) => ey?.cells[k]?.s));
  check("seeing your own seat costs nothing and records no unlock", vy.me.credits === STARTER && vy.me.unlocked === 0 && vy.ledger.length === 0, { credits: vy.me.credits, unlocked: vy.me.unlocked });
  check("your own seat's seat holder says it is you", ey?.cells.operator?.member?.you === true, ey?.cells.operator);
  check("people on your seat stay locked", ey?.people.length === 1 && ey.people[0].cells.name?.s === "locked" && ey.people[0].cells.email?.s === "locked", ey?.people[0]?.cells);
  const eu = engOf(await U.view(), eid);
  check("another member's view has yours false and the gated facts locked", eu?.yours === false && GATED.every((k) => eu.cells[k]?.s === "locked"), eu && GATED.map((k) => eu.cells[k]?.s));
  check("the member who added the seat is not its holder", engOf(await T.view(), eid)?.yours === false);
  // What another member added still needs a report: the holder can't overwrite it.
  const over = await Y.act({ type: "fill", entity: "engagement", id: eid, field: "role", value: "Fractional CRO" });
  check("a seat holder can't overwrite a fact another member added", over.status === 400 && /already there/.test(over.json?.error ?? ""), over.json);
  const conf = await Y.act({ type: "verify", entity: "engagement", id: eid, field: "rate" });
  check("a seat holder can confirm a gated fact on their seat without unlocking it", conf.status === 200, conf.json);
  // The holder fills what's missing and earns for it.
  const miss = await Y.act({ type: "fill", entity: "engagement", id: eid, field: "hours", value: "12" });
  check("a seat holder earns for filling a missing fact on their seat", miss.status === 200 && miss.json?.me?.credits === STARTER + 1, miss.json);

  // "me": add a seat you held without knowing your own public id.
  const host2 = v0.companies.filter((c) => !c.hidden && c.friendly.open === 0)[41];
  const mine = await Y.act({ type: "add", company: host2.name, newEngagement: true, operatorMemberId: "me", engagementFields: { function: "Sales", type: "Interim", operator: "typed over" } });
  const em = engOf(await Y.view(), mine.json?.id);
  check('add with operatorMemberId "me" links the seat to the viewer', mine.status === 200 && em?.yours === true && em.cells.operator?.v === "Yara Yours" && em.cells.operator.member?.you === true, { add: mine.json, yours: em?.yours });
  const host3 = v0.companies.filter((c) => !c.hidden && c.friendly.open === 0)[42];
  const blank = await T.act({ type: "add", company: host3.name, newEngagement: true, engagementFields: { function: "Marketing", type: "Advisory" } });
  const viaFill = await Y.act({ type: "fill", entity: "engagement", id: blank.json?.id, field: "operator", value: "anything", memberId: "me" });
  check('fill with memberId "me" links the seat to the viewer', viaFill.status === 200 && viaFill.json?.cells?.[0]?.cell?.member?.you === true, viaFill.json);
  // On a seat somebody else made, naming yourself is not enough to see it free: another member confirms the name first.
  check("on a seat another member made, naming yourself does not make it yours yet", engOf(await Y.view(), blank.json?.id)?.yours === false, engOf(await Y.view(), blank.json?.id)?.yours);
  await U.act({ type: "unlock", entity: "engagement", id: blank.json?.id, field: "operator" });
  const vouchName = await U.act({ type: "verify", entity: "engagement", id: blank.json?.id, field: "operator" });
  check("once another member confirms the name, it is", vouchName.status === 200 && engOf(await Y.view(), blank.json?.id)?.yours === true, vouchName.json);

  // "This isn't me".
  const not = await Y.act({ type: "notMine", engagementId: eid });
  const ey2 = engOf(await Y.view(), eid);
  check("notMine unlinks the seat", not.status === 200 && ey2?.yours === false, { not: not.json?.message, yours: ey2?.yours });
  check("after notMine the name a member added is under review, with the other locked facts that member put on the seat", GATED.every((k) => ey2?.cells[k]?.s === "reported"), ey2 && GATED.map((k) => ey2.cells[k]?.s));
  check("notMine returns the cells as they now look", not.json?.cells?.find((c) => c.field === "operator")?.cell?.s === "reported", not.json?.cells?.map((c) => [c.field, c.cell.s]));
  const again = await Y.act({ type: "notMine", engagementId: eid });
  check("notMine on a seat that isn't yours is refused", again.status === 400 && again.json?.error === "That seat isn't linked to you.", again.json);
  const unl = await U.act({ type: "unlock", entity: "engagement", id: eid, field: "operator" });
  check("after notMine nobody can buy the name a member put on that seat", unl.status === 400 && unl.json?.error === "Nothing here is locked, so no credit was spent." && engOf(await U.view(), eid)?.cells.operator?.s === "reported", unl.json);
  const pay = await U.act({ type: "unlock", entity: "engagement", id: eid, field: "rate" });
  check("nor the rate that member put there", pay.status === 400 && pay.json?.error === "Nothing here is locked, so no credit was spent.", pay.json);

  // A real linked seat holder from the seed: free to see, and they can correct our own records.
  const sm = seedHolders[0];
  const S = sm ? new Client("Seed Holder", ip(113), sm.token) : null;
  const sv = S ? await S.view() : null;
  if (!sv?.me) return skip("seed seat holder checks", "no seed file the server knows");
  const own = sv.companies.flatMap((c) => c.engagements.map((e) => ({ ...e, company: c }))).filter((e) => e.yours);
  check("a seed member linked by name has their seats marked yours", own.length > 0, own.length);
  check("every gated fact on a seed member's own seats is visible or empty", own.every((e) => GATED.every((k) => e.cells[k]?.s !== "locked")));
  check("their own seats cost them nothing", sv.me.credits === STARTER && sv.me.unlocked === 0, sv.me.credits);
  check("their company is not hidden from them", own.every((e) => !e.company.hidden));
  const seat = own.find((e) => e.cells.function?.s === "value" && !e.cells.function.mine && e.cells.function.from === "records");
  if (seat) {
    const next = seat.cells.function.v === "Other" ? "Sales" : "Other";
    const fix = await S.act({ type: "fill", entity: "engagement", id: seat.id, field: "function", value: next });
    const cell = fix.json?.cells?.[0]?.cell;
    check("a seat holder can correct what our records say about their seat", fix.status === 200 && cell?.v === next && cell?.mine === true && /^Updated the function\.$/.test(fix.json?.message ?? ""), { status: fix.status, s: cell?.s, message: fix.json?.error ?? fix.json?.message });
    check("a correction earns no credit", fix.json?.me?.credits === STARTER && fix.json?.me?.added === 0, fix.json?.me);
    const back = await S.act({ type: "fill", entity: "engagement", id: seat.id, field: "function", value: seat.cells.function.v });
    check("they can edit their correction", back.status === 200, back.status);
    // Someone who isn't the holder can't change it.
    const no = await U.act({ type: "fill", entity: "engagement", id: seat.id, field: "function", value: "Other" });
    check("a member who isn't the seat holder can't correct that seat", no.status === 400, no.status);
  } else skip("seed seat correction", "no own seat with a function from the seed");
});

section("benchrate", async () => {
  const M = await member("Mia Money", ip(120));
  const O = await member("Oz Onlooker", ip(121));
  const HELP = "Use a rate like $8k/mo or $150/hr.";
  for (const bad of ["$5k project fee", "abc", "$900/day", "10% equity", "$5"]) {
    const r = await M.act({ type: "benchRate", pricing: "Monthly retainer", rate: bad });
    check(`benchRate refuses '${bad}'`, r.status === 400 && r.json?.error === HELP, r.json);
  }
  const badFn = await M.act({ type: "benchRate", pricing: "Hourly", rate: "$150/hr", function: "Wizardry" });
  check("benchRate refuses a function outside the list", badFn.status === 400, badFn.json);
  const badRev = await M.act({ type: "benchRate", pricing: "Hourly", rate: "$150/hr", revenue: "$3M" });
  check("benchRate refuses a revenue band outside the list", badRev.status === 400, badRev.json);

  const rowOf = (view, fn, rev) => view.benchmarks.rows.find((r) => r.function === fn && r.revenue === rev);
  const n0 = rowOf(await M.view(), "Executive", "Under $1M").monthly.n;
  const first = await M.act({ type: "benchRate", pricing: "Monthly retainer", rate: "$7,777", function: "Executive", revenue: "Under $1M" });
  check("a private rate earns 1 credit", first.status === 200 && first.json?.me?.credits === STARTER + 1 && first.json?.me?.added === 1 && /You earned 1 credit\./.test(first.json?.message ?? ""), first.json);
  const vm = await M.view();
  const mineRates = vm.me.benchRates ?? [];
  check("Me.benchRates lists it", mineRates.length === 1 && mineRates[0].id === first.json?.id && mineRates[0].kind === "monthly" && mineRates[0].amount === 7777 && mineRates[0].function === "Executive" && mineRates[0].engagementId === null, mineRates);
  check("a new account's rate does not count toward its group's floor yet", rowOf(vm, "Executive", "Under $1M").monthly.n === n0);
  check("the ledger row names no record", vm.ledger[0]?.reason === "fill" && vm.ledger[0]?.field === "Private rate" && vm.ledger[0]?.company === "" && vm.ledger[0]?.delta === 1, vm.ledger[0]);
  const hourly = await M.act({ type: "benchRate", pricing: "Monthly retainer", rate: "$185/hr" });
  const two = (await M.view()).me.benchRates;
  check("a unit in the rate wins over the pricing model, and the function defaults to the member's", hourly.status === 200 && two.some((b) => b.kind === "hourly" && b.amount === 185 && b.function === "Sales"), two);
  await M.act({ type: "benchRate", pricing: "Hourly", rate: "210" });
  const fourth = await M.act({ type: "benchRate", pricing: "Hourly", rate: "220" });
  check("at most 3 rates that aren't tied to a seat", fourth.status === 400 && /3 rates/.test(fourth.json?.error ?? "") && (await M.view()).me.benchRates.length === 3, fourth.json);

  // Tied to a seat: only your own seat or one whose record you added.
  const v = await M.view();
  const foreign = v.companies.flatMap((c) => c.engagements).find((e) => !e.yours);
  const notYours = await M.act({ type: "benchRate", engagementId: foreign.id, pricing: "Hourly", rate: "$150/hr" });
  check("a private rate on a seat that isn't yours is refused", notYours.status === 400 && notYours.json?.error === "You can only share a rate for a seat you held or added.", notYours.json);
  const hosts = v.companies.filter((c) => !c.hidden && c.friendly.open === 0);
  // A seat you added counts as tied to you once it has a role and names you (a blank one counts toward the 3).
  const seatA = await M.act({ type: "add", company: hosts[50].name, newEngagement: true, operatorMemberId: "me", engagementFields: { function: "RevOps", type: "Fractional", revenue: "$5M–$20M", role: "Fractional RevOps lead", operator: "typed over" } });
  const t0 = (await M.view()).benchmarks.total;
  const onSeat = await M.act({ type: "benchRate", engagementId: seatA.json?.id, pricing: "Hourly", rate: "$200/hr", function: "Marketing", revenue: "$50M+" });
  const vm2 = await M.view();
  const tied = vm2.me.benchRates.find((b) => b.engagementId === seatA.json?.id);
  check("a private rate on a seat you added takes its function and revenue from the record", onSeat.status === 200 && tied?.function === "RevOps" && tied.kind === "hourly" && tied.amount === 200 && vm2.benchmarks.total === t0 + 1, { onSeat: onSeat.json, tied });
  const dup = await M.act({ type: "benchRate", engagementId: seatA.json?.id, pricing: "Hourly", rate: "$210/hr" });
  check("one private rate per seat", dup.status === 400 && dup.json?.error === "You already shared a rate for this seat. Remove it first to share a different one.", dup.json);
  // Adding the public rate later doesn't count the same member twice (it replaces the private one, leaving 3).
  await M.act({ type: "fill", entity: "engagement", id: seatA.json?.id, field: "rate", value: "$200/hr" });
  check("a member's private and public rate on one seat count once", (await M.view()).benchmarks.total === t0 + 1);
  const seatB = await M.act({ type: "add", company: hosts[51].name, newEngagement: true, engagementFields: { function: "RevOps", type: "Fractional", rate: "$9k/mo" } });
  const pub = await M.act({ type: "benchRate", engagementId: seatB.json?.id, pricing: "Monthly retainer", rate: "$9k/mo" });
  check("a private rate is refused when your rate is already on the seat", pub.status === 400 && /already on this seat/.test(pub.json?.error ?? ""), pub.json);

  // Privacy: nobody else, admins included, gets a trace of it.
  const adm = await admin();
  const oRaw = await call("GET", "/api/table", { token: O.token, ipAddr: O.ip });
  const ids = vm2.me.benchRates.map((b) => b.id);
  check("another member's view has no trace of the private rates", oRaw.json?.me?.benchRates?.length === 0 && !ids.some((id) => oRaw.text.includes(id)) && !oRaw.text.includes("7777"), oRaw.json?.me?.benchRates);
  if (adm) {
    const aRaw = await call("GET", "/api/table", { token: adm.token, ipAddr: adm.ip });
    check("an admin's view has no trace of them either", aRaw.json?.me?.benchRates?.length === 0 && !ids.some((id) => aRaw.text.includes(id)) && !aRaw.text.includes("7777"));
    check("the admin's pilot metrics only count them", aRaw.json?.admin?.benchmarks?.privateRates >= 3, aRaw.json?.admin?.benchmarks);
    const exp = await call("GET", "/api/table?export=1", { token: adm.token, ipAddr: adm.ip });
    const out = exp.json?.benchRates ?? [];
    check("the admin export carries private rates without who shared them or where", exp.status === 200 && out.length >= 3 && out.every((b) => !("by" in b) && !("id" in b) && !("engagementId" in b)), out[0] && Object.keys(out[0]));
  } else skip("admin benchRate privacy", "no admin account");
  const steal = await O.act({ type: "benchRateRemove", id: first.json?.id });
  check("another member can't remove it", steal.status === 400 && steal.json?.error === "We couldn't find that rate. It may already be removed.", steal.json);

  // Remove: the credit it earned goes back.
  const credits = (await M.view()).me.credits;
  const rm = await M.act({ type: "benchRateRemove", id: first.json?.id });
  const vm3 = await M.view();
  check("removing a private rate takes its credit back", rm.status === 200 && vm3.me.credits === credits - 1 && !vm3.me.benchRates.some((b) => b.id === first.json?.id), { rm: rm.json, credits: [credits, vm3.me.credits] });
  check("it leaves its benchmark group", rowOf(vm3, "Executive", "Under $1M").monthly.n === n0);
  check("the ledger says it was removed", vm3.ledger[0]?.reason === "Removed" && vm3.ledger[0]?.delta === -1 && vm3.ledger[0]?.field === "Private rate", vm3.ledger[0]);
  const rm2 = await M.act({ type: "benchRateRemove", id: first.json?.id });
  check("removing it twice is refused", rm2.status === 400, rm2.json);
  const refill = await M.act({ type: "benchRate", pricing: "Monthly retainer", rate: "$7k/mo" });
  check("after removing one there is room for another", refill.status === 200, refill.json);

  // A private rate is not a fact on a record: the invite bonus waits for the first one that is.
  const inviter = (await O.view()).me.inviteCode;
  const N = await member("Nia Newbie", ip(122), { ref: inviter });
  const nb = await N.act({ type: "benchRate", pricing: "Hourly", rate: "$160/hr" });
  check("a private rate as a first fact leaves the invite bonus waiting", nb.status === 200 && !/invite bonus/i.test(nb.json?.message ?? "") && nb.json?.me?.credits === STARTER + 1 && (await N.view()).me.invitePending === true, nb.json);
});

section("pilot", async () => {
  const adm = await admin();
  if (!adm) return skip("pilot metrics", "no admin account (set ADMIN_TOKEN)");
  const W = await member("Wes Waitlist", ip(130));
  const a0 = (await adm.view()).admin;
  const KEYS = ["members", "credits", "activity", "walls", "pro", "topUnlocked", "topAdded", "scan", "digest", "seats", "benchmarks"];
  check("admins get pilot metrics", !!a0 && KEYS.every((k) => k in a0), a0 && Object.keys(a0));
  const wv = await W.view();
  check("a member who isn't an admin gets no admin block", !("admin" in wv) && wv.me.admin === false);
  check("signed-out views get no admin or scan block", await call("GET", "/api/table", { ipAddr: ip(131) }).then((r) => !("admin" in r.json) && !("scan" in r.json)));
  check("signed-in views carry the scan summary", !!wv.scan && ["openNow", "opened7", "closed30", "mine7"].every((k) => typeof wv.scan[k] === "number") && "lastRunAt" in wv.scan && typeof wv.scan.digest === "boolean", wv.scan);
  check("Me carries digest and proInterest", wv.me.digest === true && wv.me.proInterest === false && Array.isArray(wv.me.benchRates), { digest: wv.me.digest, pro: wv.me.proInterest });

  const view1 = await W.act({ type: "signal", name: "pro_view", where: "unlock-wall" });
  check("a signal answers with an empty message", view1.status === 200 && view1.json?.message === "", view1.json);
  await W.act({ type: "signal", name: "pro_view", where: "credits page!!" });
  const want = await W.act({ type: "signal", name: "pro_interest", where: "unlock-wall" });
  check("pro_interest says 'You're on the list.'", want.status === 200 && want.json?.message === "You're on the list.", want.json);
  const want2 = await W.act({ type: "signal", name: "pro_interest", where: "my-credits" });
  check("asking again gives the same answer", want2.status === 200 && want2.json?.message === "You're on the list.", want2.json);
  check("Me.proInterest is set", (await W.view()).me.proInterest === true);
  const badName = await W.act({ type: "signal", name: "page_view", where: "x" });
  check("an unknown signal name is refused", badName.status === 400, badName.json);
  const a1 = (await adm.view()).admin;
  check("pro views and interest are counted", a1.pro.views === a0.pro.views + 2 && a1.pro.interested === a0.pro.interested + 1, { before: a0.pro, after: a1.pro });
  check("pro interest is recorded once per member, by place", (a1.pro.byWhere["unlock-wall"] ?? 0) === (a0.pro.byWhere["unlock-wall"] ?? 0) + 1 && (a1.pro.byWhere["my-credits"] ?? 0) === (a0.pro.byWhere["my-credits"] ?? 0), a1.pro.byWhere);

  check("members counts are sane", a1.members.total >= a1.members.joined && a1.members.joined >= 2 && a1.members.onboarded >= 1 && a1.members.total === wv.stats.members + 0, a1.members);
  await new Promise((r) => setTimeout(r, 400)); // last seen is saved just after the GET
  const a2 = (await adm.view()).admin;
  check("a visit counts the member as active in the last 7 and 30 days", a2.members.active7 >= 2 && a2.members.active30 >= a2.members.active7 && a2.members.active7 <= a2.members.total, a2.members);
  check("credits has atZero, low and a median", [a2.credits.atZero, a2.credits.low, a2.credits.median].every((n) => Number.isInteger(n)) && a2.credits.median > 0, a2.credits);
  const topOk = (xs) => Array.isArray(xs) && xs.length <= 8 && xs.every((x) => typeof x.field === "string" && x.field && x.n > 0) && xs.every((x, i) => i === 0 || xs[i - 1].n >= x.n);
  // Something to count, whatever ran before this section.
  const [f] = pickEmpty(wv, 1);
  await W.act(fillAct(f));
  const [l] = pickLocked(wv, 1);
  await W.act({ type: "unlock", ...l });
  const a3 = (await adm.view()).admin;
  check("topAdded and topUnlocked are the most common fields, by label", topOk(a3.topAdded) && topOk(a3.topUnlocked) && a3.topAdded.length > 0 && a3.topUnlocked.length > 0, { added: a3.topAdded, unlocked: a3.topUnlocked });
  check("activity counts adds and unlocks, all time and this week", a3.activity.adds === a2.activity.adds + 1 && a3.activity.unlocks === a2.activity.unlocks + 1 && a3.activity.adds7 === a2.activity.adds7 + 1 && a3.activity.unlocks7 === a2.activity.unlocks7 + 1, { before: a2.activity, after: a3.activity });
  check("digest block says whether it is on", a3.digest.enabled === wv.email && typeof a3.digest.sent === "number" && typeof a3.digest.optedOut === "number", a3.digest);
  check("seats and benchmarks blocks are numbers", [a3.seats.linkedMembers, a3.seats.factsMissing, a3.benchmarks.memberRates, a3.benchmarks.privateRates, a3.benchmarks.indexRates].every((n) => Number.isInteger(n) && n >= 0), [a3.seats, a3.benchmarks]);
  if (seedFile) {
    check("seats.linkedMembers counts the seed's linked seat holders", a3.seats.linkedMembers >= seedHolders.length - 2 && a3.seats.factsMissing > 0, [a3.seats.linkedMembers, seedHolders.length]);
    check("benchmarks.indexRates is the seed's Rate Index size", a3.benchmarks.indexRates === (seedFile.rateIndex?.length ?? 0), a3.benchmarks.indexRates);
  }
  const notAdmin = await W.act({ type: "scanNow" });
  check("scanNow is for admins", notAdmin.status === 400 && notAdmin.json?.error === "Only admins can start a scan.", notAdmin.json);
  // Past 200 signals a day from one member, the rest are dropped without an error.
  const F = await member("Fay Flood", ip(133));
  const flood = await Promise.all(Array.from({ length: 205 }, () => F.act({ type: "signal", name: "pro_view", where: "flood" })));
  const a4 = (await adm.view()).admin;
  check("a member's signals past 200 a day are dropped silently", flood.every((r) => r.status === 200 && r.json?.message === "") && a4.pro.views === a3.pro.views + 200, { ok: flood.filter((r) => r.status === 200).length, views: a4.pro.views - a3.pro.views });

  // The wall: a member past the first-day limit runs out of credits on an unlock.
  const S = seedClient(2, ip(132));
  const sv = S ? await S.view() : null;
  if (!sv?.me || sv.me.credits < 4 || sv.me.credits > 59) return skip("wall checks", "no unused seed member here (needs the seed file the server runs on)");
  const locked = pickLocked(sv, sv.me.credits + 1);
  const b = (await adm.view()).admin;
  await S.act({ type: "unlockMany", items: locked.slice(0, sv.me.credits - 2) });
  const low = (await adm.view()).admin;
  check("credits.low counts members with 1 to 3 credits", low.credits.low === b.credits.low + 1 && low.credits.atZero === b.credits.atZero, { before: b.credits, after: low.credits });
  const many = await S.act({ type: "unlockMany", items: locked.slice(sv.me.credits - 2, sv.me.credits + 1) });
  // Details for a seed member carry counts and messages only, never their record.
  check("asking for more than you have is refused with the count", many.status === 400 && many.json?.error === "That needs 3 credits and you have 2. Add a missing fact to earn more.", many.json?.error ?? many.json?.message);
  await S.act({ type: "unlockMany", items: locked.slice(sv.me.credits - 2, sv.me.credits) });
  const zero = await S.act({ type: "unlock", ...locked[sv.me.credits] });
  check("an unlock at 0 credits is refused", zero.status === 400 && zero.json?.error === "You're out of credits. Add a missing fact to earn one.", zero.json?.error ?? zero.json?.message);
  const sv2 = await S.view();
  check("a refused unlock spends nothing and unlocks nothing", sv2.me.credits === 0 && sv2.me.unlocked === sv.me.credits, { credits: sv2.me.credits, unlocked: sv2.me.unlocked });
  await S.act({ type: "signal", name: "wall", where: "drawer" }); // the app's own signal for the same wall, a moment later
  const w = (await adm.view()).admin;
  check("walls counts the member once and each refusal once", w.walls.members === b.walls.members + 1 && w.walls.hits === b.walls.hits + 2, { before: b.walls, after: w.walls });
  check("credits.atZero counts the member", w.credits.atZero === b.credits.atZero + 1 && w.credits.low === b.credits.low, { before: b.credits, after: w.credits });
});

section("settings", async () => {
  const E = await member("Eli Email", ip(140));
  check("the weekly email is on by default", (await E.view()).me.digest === true);
  const off = await E.act({ type: "settings", digest: false });
  check("settings turns the weekly email off", off.status === 200 && off.json?.message === "The weekly email is off. We won't send another one." && (await E.view()).me.digest === false, off.json);
  check("settings does not change onboarding", (await E.view()).me.onboarded === true);
  const on = await E.act({ type: "settings", digest: true });
  const ev = await E.view();
  check("and back on", on.status === 200 && ev.me.digest === true, on.json);

  // The unsubscribe link in the email: a public member id and a signature, no sign-in.
  const key = process.env.ID_SECRET || "rn-dev-ids";
  const h = (x) => createHmac("sha256", key).update(x).digest("base64url");
  const m = `${ev.me.id[0]}_${h(ev.me.id).slice(0, 12)}`;
  const sig = h(`unsubscribe:${ev.me.id}`).slice(0, 22);
  // A last character that differs from the real one (a fixed "x" matched it once in 64 runs).
  const bad = await call("GET", `/api/table/unsubscribe?m=${m}&s=${sig.slice(0, 21)}${sig[21] === "x" ? "y" : "x"}`, { ipAddr: ip(141) });
  check("a bad signature is refused", bad.status === 400 && /didn't work/.test(bad.text) && (await E.view()).me.digest === true, bad.status);
  const none = await call("GET", "/api/table/unsubscribe", { ipAddr: ip(141) });
  const wrong = await call("GET", `/api/table/unsubscribe?m=j_AAAAAAAAAAAA&s=${sig}`, { ipAddr: ip(141) });
  check("a missing or unknown member is refused the same way", none.status === 400 && wrong.status === 400 && none.text === wrong.text && wrong.text === bad.text, [none.status, wrong.status]);
  const ok = await call("GET", `/api/table/unsubscribe?m=${m}&s=${sig}`, { ipAddr: ip(141) });
  if (ok.status !== 200) return skip("unsubscribe link", "the server signs with a different key (set ID_SECRET to its RN_ID_SECRET)");
  check("the unsubscribe link turns the email off", (await E.view()).me.digest === false);
  check("the page says so, and how to turn it back on", /text\/html/.test(ok.headers.get("content-type") ?? "") && /You're unsubscribed/.test(ok.text) && /Your credits/.test(ok.text), ok.text.slice(0, 200));
  check("the page has no member data", !ok.text.includes(ev.me.email) && !ok.text.includes("Eli"));
  const adm = await admin();
  if (adm) check("admins see how many opted out", (await adm.view()).admin.digest.optedOut >= 1);
});

section("scan", async () => {
  const none = await scanPost({ roles: [], sources: [] }, null);
  const wrong = await scanPost({ roles: [], sources: [] }, "not-the-secret");
  check("the scan endpoint needs the cron secret", none.status === 404 && wrong.status === 404, [none.status, wrong.status]);
  const probe = await scanPost({ roles: [], sources: [] });
  if (probe.status !== 200 || probe.json?.test !== true) return skip("scan checks", "start the server with RN_SCAN_TEST=1 and RN_CRON_SECRET=qa-cron");
  const adm = await admin();
  const V = await member("Val Viewer", ip(160));
  const G = await member("Gil Guest", ip(161));
  // Their claims on open roles below close them, so their word must count.
  const counted = (await vouch(V)) && (await vouch(G));
  if (!counted) return skip("scan checks", "needs the seed file the server runs on (two seed members vouch for the claimers)");
  const t0 = Date.now();
  const at = (days) => new Date(t0 + days * DAY_MS).toISOString();
  const v0 = await V.view();
  // Open roles that came with the seed: followed from the day the seed was built.
  const seedOpen = v0.companies.flatMap((c) => c.engagements.map((e) => ({ ...e, company: c }))).filter((e) => e.source === "Demand scan" && e.opened && !e.closed);
  if (seedOpen.length) {
    check("open roles from the seed carry the day they opened", seedOpen.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.opened) && e.opened <= dayOf(t0)), seedOpen.length);
    check("their status is free to see and their company is hidden", seedOpen.every((e) => e.cells.status?.s === "value" && e.cells.status.v === "Open role" && e.company.hidden), seedOpen.map((e) => [e.cells.status?.s, e.company.hidden]));
    if (seedFile) check("they opened the day the seed was built", seedOpen.every((e) => e.opened === dayOf(Date.parse(seedFile.builtAt))), seedOpen[0].opened);
  }
  const host = v0.companies.filter((c) => !c.hidden && c.friendly.open === 0 && !c.mine)[60];
  const coName = `Qa Scan Co ${RUN}`;
  const board = `qa-board-${RUN}`;
  const role1 = { key: `qascan${RUN}:fractionalvpsales`, company: coName, domain: `https://www.qa-scan-${RUN}.example.com/careers`, title: "Fractional VP Sales", function: "Sales", type: "Fractional", url: `https://jobs.example.com/qa/${RUN}/1`, source: board, postedAt: null, rate: "$150/hr", hoursPerWeek: 10 };
  const role2 = { key: `${RUN}:host:cmo`, company: host.name, domain: null, title: "Interim CMO", function: null, type: null, url: `https://jobs.example.com/qa/${RUN}/2`, source: board, postedAt: null, rate: null, hoursPerWeek: null };
  const cleanRun = [{ source: board, fetched: 12, matched: 2 }];

  // Open.
  const s1 = await scanPost({ roles: [role1, role2, { ...role1, source: "another-board" }, { company: "", title: "No company", url: "x" }], sources: cleanRun, now: at(0) });
  check("a scan opens new roles and adds the company it doesn't know", s1.json?.result?.opened === 2 && s1.json.result.companiesAdded === 1 && s1.json.result.closed === 0 && s1.json.result.stillOpen === 0, s1.json);
  const v1 = await V.view();
  const h1 = v1.companies.find((c) => c.id === host.id);
  const e2 = h1?.engagements.find((e) => e.source === "Demand scan" && e.opened === dayOf(t0));
  check("the role shows under its company with the day it opened", !!e2 && e2.closed === null, h1?.engagements.map((e) => [e.source, e.opened, e.closed]));
  check("its status is a free visible value, never locked", e2?.cells.status?.s === "value" && e2.cells.status.v === "Open role", e2?.cells.status);
  check("role and posting stay locked; function and type are derived from the title", e2?.cells.role?.s === "locked" && e2.cells.posting?.s === "locked" && e2.cells.function?.v === "Marketing" && e2.cells.type?.v === "Interim", e2?.cells);
  check("the company is hidden while the role is open", h1?.hidden === true && h1.name === "Hidden company" && h1.friendly.open === 1, { hidden: h1?.hidden, open: h1?.friendly.open });
  check("stats and the scan summary count the open roles", v1.stats.openRoles === v0.stats.openRoles + 2 && v1.scan.openNow === v0.scan.openNow + 2 && v1.scan.opened7 === v0.scan.opened7 + 2 && v1.scan.mine7 === v0.scan.mine7 + 1 && !!v1.scan.lastRunAt, { before: v0.scan, after: v1.scan });
  check("the public counts carry the roles opened this week", v1.stats.openedWeek === v1.scan.opened7, { stats: v1.stats.openedWeek, scan: v1.scan.opened7 });
  const av = adm ? await adm.view() : null;
  const newCo = av?.companies.find((c) => c.name === coName);
  if (adm) {
    const e1 = newCo?.engagements[0];
    check("the new company has the posting's website, rate and hours", newCo?.cells.website?.v === `qa-scan-${RUN}.example.com` && e1?.cells.hours?.v === "10" && e1.cells.rate?.s === "locked" && e1.cells.function?.v === "Sales" && e1.cells.type?.v === "Fractional", { site: newCo?.cells.website, cells: e1?.cells });
    check("a company the scan added is hidden from members too", v1.companies.find((c) => c.id === newCo?.id)?.hidden === true);
    check("pilot metrics carry the scan's sources", av.admin.scan.sources.some((x) => x.source === board && x.fetched === 12 && x.matched === 2) && av.admin.scan.openNow === v1.scan.openNow, av.admin.scan);
  }
  // Scan values behave like our own records: they say where they came from, and members can't overwrite them.
  const un = await G.act({ type: "unlockMany", items: [{ entity: "company", id: host.id, field: "identity" }, { entity: "engagement", id: e2.id, field: "role" }] });
  const roleCell = un.json?.cells?.find((c) => c.field === "role")?.cell;
  check("a scan value says it came from the posting, with no confirmation yet", un.status === 200 && roleCell?.v === "Interim CMO" && roleCell.ver === 0 && roleCell.from === "posting" && roleCell.mine === false, un.json);
  check("an unlock says what it bought and what it cost", un.json?.message === `Unlocked ${host.name}, the role and the posting for 1 credit.`, un.json?.message);
  const over = await G.act({ type: "fill", entity: "engagement", id: e2.id, field: "role", value: "Interim Chief Marketing Officer" });
  check("a member can't overwrite a scan value", over.status === 400 && /already there/.test(over.json?.error ?? ""), over.json);
  const noUnlock = await G.act({ type: "unlock", entity: "engagement", id: e2.id, field: "status" });
  check("there is nothing to unlock on a followed role's status", noUnlock.json?.error === "Nothing here is locked, so no credit was spent.", noUnlock.json);

  // Still open.
  const s2 = await scanPost({ roles: [role1, role2], sources: cleanRun, now: at(3) });
  check("a role seen again stays open", s2.json?.result?.stillOpen === 2 && s2.json.result.opened === 0 && s2.json.result.closed === 0, s2.json);
  check("the same posting under a new key is the same role (matched by its link)", (await scanPost({ roles: [{ ...role2, key: "another-key" }, role1], sources: cleanRun, now: at(3) })).json?.result?.opened === 0);
  // Not listed, but not long enough.
  // The seed's own open roles close on their own clock (35 days after the seed was built). With a
  // fresh seed that is after this test's clock, so the counts below are exact.
  const seedQuiet = !seedOpen.length || t0 + 17 * DAY_MS < Date.parse(seedOpen[0].opened) + 34 * DAY_MS;
  const exact = (n, want) => (seedQuiet ? n === want : n >= want);
  const stillOpenHere = async () => engOf(await V.view(), e2.id)?.closed === null;
  const s3 = await scanPost({ roles: [], sources: [{ source: board, fetched: 9, matched: 0 }], now: at(12) });
  check("a role unseen for 9 days stays open", exact(s3.json?.result?.closed, 0) && (await stillOpenHere()), s3.json);
  // A board outage closes nothing, and neither does another board's clean run.
  const s4 = await scanPost({ roles: [], sources: [{ source: board, fetched: 0, matched: 0, error: "timeout" }], now: at(14) });
  const s5 = await scanPost({ roles: [], sources: [{ source: board, fetched: 0, matched: 0 }, { source: "other-board", fetched: 30, matched: 3 }], now: at(14) });
  check("a board outage closes nothing", s4.json?.result?.closed === 0 && exact(s5.json?.result?.closed, 0), [s4.json, s5.json]);
  // Since day 12 the board answered without them, so they are not counted in open now (and day 12 was a clean run of a small board).
  check("the roles are still open after the outage, and left out of open now", (await stillOpenHere()) && (!seedQuiet || (await V.view()).scan.openNow === v1.scan.openNow - 2), (await V.view()).scan);
  // Close: two clean runs of its board miss it, and it has been unseen for more than 10 days. A run
  // is clean only when the board matched something, so another role on the board stays listed.
  const keeper = { ...role1, key: `qakeeper${RUN}:cro`, company: `Qa Keeper Co ${RUN}`, domain: null, title: "Fractional CRO", url: `https://jobs.example.com/qa/${RUN}/keeper` };
  const missRun = [{ source: board, fetched: 9, matched: 1 }];
  await scanPost({ roles: [keeper], sources: missRun, now: at(13) }); // the first miss closes nothing (scripts/scan-scenarios.mts checks that)
  const s6 = await scanPost({ roles: [keeper], sources: missRun, now: at(14) });
  check("a role unseen for more than 10 days closes", exact(s6.json?.result?.closed, 2), s6.json);
  const v6 = await V.view();
  const h6 = v6.companies.find((c) => c.id === host.id);
  const e6 = h6?.engagements.find((e) => e.id === e2.id);
  check("a closed role carries the day it closed and status Closed", e6?.closed === dayOf(t0 + 14 * DAY_MS) && e6.opened === dayOf(t0) && e6.cells.status?.s === "value" && e6.cells.status.v === "Closed", { closed: e6?.closed, status: e6?.cells.status });
  check("a closed role is not open: the company shows again", h6?.hidden === false && h6.name === host.name && h6.friendly.open === 0, { hidden: h6?.hidden, open: h6?.friendly.open });
  check("the history stays on the record", !!e6 && e6.source === "Demand scan" && e6.cells.function?.v === "Marketing");
  // One more open role than at the start: the one that stayed listed.
  if (seedQuiet) check("stats and the scan summary follow", v6.stats.openRoles === v0.stats.openRoles + 1 && v6.scan.openNow === v0.scan.openNow + 1 && v6.scan.closed30 === v0.scan.closed30 + 2, { stats: v6.stats.openRoles, scan: v6.scan });
  else skip("stats after closing", "the seed is old enough that its own open roles closed during this test");
  if (adm) check("the company the scan added shows too", (await V.view()).companies.find((c) => c.id === newCo?.id)?.hidden === false);

  // Reopen.
  const s7 = await scanPost({ roles: [role2], sources: cleanRun, now: at(15) });
  check("a closed role listed again reopens", s7.json?.result?.reopened === 1 && s7.json.result.opened === 0, s7.json);
  const v7 = await V.view();
  const h7 = v7.companies.find((c) => c.id === host.id);
  const e7 = h7?.engagements.find((e) => e.id === e2.id);
  check("reopened: status Open role, no close date, the first open date kept", e7?.closed === null && e7.opened === dayOf(t0) && e7.cells.status?.v === "Open role", { closed: e7?.closed, status: e7?.cells.status });
  check("reopened: the company is hidden again", h7?.hidden === true);

  // Naming the seat holder fills the role.
  const fillIt = await V.act({ type: "add", company: host.name, engagementId: e2.id, operatorMemberId: "me", engagementFields: { operator: "Val Viewer" } });
  const v8 = await V.view();
  const h8 = v8.companies.find((c) => c.id === host.id);
  const e8 = h8?.engagements.find((e) => e.id === e2.id);
  check("naming the seat holder on an open role sets it Active and stamps the close date", fillIt.status === 200 && e8?.cells.status?.v === "Active" && e8.closed === dayOf(Date.now()) && e8.yours === true, { add: fillIt.json, status: e8?.cells.status, closed: e8?.closed });
  check("a filled role is not open: the company shows to everyone", (await G.view()).companies.find((c) => c.id === host.id)?.friendly.open === 0 && (await (await member("Hal Later", ip(162))).view()).companies.find((c) => c.id === host.id)?.hidden === false);
  const s8 = await scanPost({ roles: [role2], sources: cleanRun, now: at(16) });
  check("a posting that lingers doesn't reopen a filled role", s8.json?.result?.reopened === 0 && engOf(await V.view(), e2.id)?.cells.status?.v === "Active", s8.json);
  // The holder can correct what the scan wrote on their seat, at no credit.
  const c0 = (await V.view()).me.credits;
  const fix = await V.act({ type: "fill", entity: "engagement", id: e2.id, field: "role", value: "Interim Chief Marketing Officer" });
  check("the seat holder can correct a scan value on their seat, for no credit", fix.status === 200 && fix.json?.cells?.[0]?.cell?.v === "Interim Chief Marketing Officer" && fix.json?.me?.credits === c0, fix.json);
  // A fill by id on a second open role returns the status cell it changed.
  const role3 = { ...role2, key: `${RUN}:host:revops`, title: "Fractional RevOps Lead", url: `https://jobs.example.com/qa/${RUN}/3` };
  await scanPost({ roles: [role3], sources: cleanRun, now: at(16) });
  const e3 = (await V.view()).companies.find((c) => c.id === host.id)?.engagements.find((e) => e.source === "Demand scan" && e.id !== e2.id && !e.closed);
  // Only the member who took the role can name its seat holder, once a day: V took one above, so G takes this one.
  const byId = await G.act({ type: "fill", entity: "engagement", id: e3?.id, field: "operator", value: "Gil Guest", memberId: "me" });
  check("a seat-holder fill on an open role returns the new status too", byId.status === 200 && byId.json?.cells?.find((c) => c.field === "status")?.cell?.v === "Active", byId.json?.cells?.map((c) => [c.field, c.cell.v]));

  // The seat-holder exemption from hiding, and notMine taking it away.
  const coH = `Qa Hidden Co ${RUN}`;
  const role4 = { key: `qahidden${RUN}:cs`, company: coH, domain: null, title: "Fractional Head of Customer Success", function: "Customer Success", type: "Fractional", url: `https://jobs.example.com/qa/${RUN}/4`, source: board, postedAt: null, rate: null, hoursPerWeek: null };
  await scanPost({ roles: [role4], sources: cleanRun, now: at(16) });
  const Z = await member("Zed Seatholder", ip(163));
  const zSeat = await G.act({ type: "add", company: coH, newEngagement: true, engagementFields: { function: "Sales", type: "Fractional", operator: "Zed Seatholder" } });
  const zc = (await Z.view()).companies.find((c) => c.engagements.some((e) => e.id === zSeat.json?.id));
  check("a company with an open role is not hidden from a member who held a seat there", zc?.hidden === false && zc.name === coH && zc.friendly.open === 1, { hidden: zc?.hidden, open: zc?.friendly.open });
  await Z.act({ type: "notMine", engagementId: zSeat.json?.id });
  const zc2 = (await Z.view()).companies.find((c) => c.id === zc?.id);
  check("after notMine the company is hidden from them like anyone else", zc2?.hidden === true && zc2.name === "Hidden company", { hidden: zc2?.hidden });

  // Open roles from the seed close 35 days after the seed was built, unless a scan sees them.
  if (seedOpen.length) {
    const built = Date.parse(seedOpen[0].opened);
    const sv = await V.view();
    const stillOpen = seedOpen.filter((e) => !engOf(sv, e.id)?.closed);
    if (t0 + 16 * DAY_MS < built + 35 * DAY_MS) check("seed roles are still open before day 35", stillOpen.length === seedOpen.length, stillOpen.length);
    const late = Math.max(t0 + 17 * DAY_MS, built + 37 * DAY_MS);
    const s9 = await scanPost({ roles: [], sources: [{ source: "other-board", fetched: 0, matched: 0, error: "down" }], now: new Date(late).toISOString() });
    check("a scan where every board failed doesn't close seed roles", s9.json?.result?.closed === 0, s9.json);
    const s10 = await scanPost({ roles: [], sources: [{ source: "other-board", fetched: 30, matched: 3 }], now: new Date(late).toISOString() });
    const lv = await V.view();
    const after = seedOpen.map((e) => engOf(lv, e.id));
    check("seed roles close 35 days after the seed was built", s10.json?.result?.closed >= stillOpen.length && after.every((e) => e?.closed && e.cells.status?.v === "Closed"), { closed: s10.json?.result?.closed, n: stillOpen.length });
    check("their open date is still the day the seed was built", after.every((e, i) => e?.opened === seedOpen[i].opened));
    check("their companies show again", after.every((e) => e.company.hidden === false || e.company.friendly.open > 0), after.map((e) => [e.company.hidden, e.company.friendly.open]));
  } else skip("seed open roles", "the seed here has no open roles");

  if (adm) {
    const now = await adm.act({ type: "scanNow" });
    check("an admin can start a scan", now.status === 200 && now.json?.message === "Scan started. It reads several job boards, so give it a few minutes.", now.json);
  }
});

section("load", async () => {
  const accounts = [];
  // Names of letters only (join refuses digits in a name): Load Testeraa, Load Testerab, ...
  for (let i = 0; i < 50; i++) accounts.push(await member(`Load Tester${String.fromCharCode(97 + Math.floor(i / 26), 97 + (i % 26))}`, ip(150 + Math.floor(i / 10))));
  const v = await accounts[0].view();
  const empties = pickEmpty(v, 50);
  const locked = pickLocked(v, 50);
  const jobs = accounts.flatMap((a, i) => [
    { a, action: fillAct(empties[i]), kind: "fill" },
    { a, action: { type: "unlock", ...locked[i] }, kind: "unlock" },
  ]);
  const t0 = performance.now();
  const results = await Promise.all(jobs.map(async (j) => ({ ...j, r: await j.a.act(j.action) })));
  const wall = performance.now() - t0;
  const ms = results.map((x) => x.r.ms).sort((x, y) => x - y);
  const ok = results.filter((x) => x.r.status === 200);
  console.log(`  100 concurrent actions: ${ok.length} ok, median ${ms[49].toFixed(0)} ms, p90 ${ms[89].toFixed(0)} ms, wall ${wall.toFixed(0)} ms`);
  check("every concurrent action succeeded", ok.length === 100, results.filter((x) => x.r.status !== 200).map((x) => x.r.json));
  const expect = accounts.map((a) => ({
    token: a.token,
    ip: a.ip,
    fills: results.filter((x) => x.a === a && x.kind === "fill" && x.r.status === 200).length,
    unlocks: results.filter((x) => x.a === a && x.kind === "unlock" && x.r.status === 200).length,
  }));
  await checkLedgers(expect);
  if (process.env.LOAD_OUT) {
    writeFileSync(process.env.LOAD_OUT, JSON.stringify(expect));
    console.log(`  wrote ${expect.length} accounts to ${process.env.LOAD_OUT}; restart the server and run with CHECK_LEDGERS=${process.env.LOAD_OUT}`);
  }
});

/** Every success has its ledger row, and every balance is the starter credits plus the ledger. */
async function checkLedgers(expect) {
  let bad = 0;
  for (const e of expect) {
    const v = await new Client("Load", e.ip, e.token).view();
    const sum = v.ledger.reduce((n, l) => n + l.delta, 0);
    const fills = v.ledger.filter((l) => l.reason === "fill").length;
    const unlocks = v.ledger.filter((l) => l.reason === "unlock").length;
    if (v.me.credits !== STARTER + sum || fills !== e.fills || unlocks !== e.unlocks) bad++;
  }
  check(`${expect.length} accounts: ledger rows match successes and balances match ledgers`, bad === 0, `${bad} accounts off`);
}

/* ---------- run ---------- */

if (process.env.CHECK_LEDGERS) {
  await checkLedgers(JSON.parse(readFileSync(process.env.CHECK_LEDGERS, "utf8")));
} else {
  for (const [name, fn] of Object.entries(sections)) {
    if (ONLY.size && !ONLY.has(name)) continue;
    console.log(`\n# ${name}`);
    try {
      await fn();
    } catch (e) {
      fail(`${name} (threw)`, String(e?.stack ?? e));
    }
  }
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
