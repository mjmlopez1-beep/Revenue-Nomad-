#!/usr/bin/env node
/**
 * Checks of the places where Merlin's rules meet each other, against a running server:
 * the one-credit company unlock against the first-day limit and the scan's refunds, a refund
 * against a balance that is owed, a member's claim to a seat against the weekly scan, removed
 * rates against the benchmarks, and the invite bonus against a rate that moves onto a record.
 *
 *   BASE=http://localhost:3000 node scripts/test-integration.mjs
 *
 * Run it against a throwaway server on a FRESH RN_DATA_DIR, started like the one for
 * scripts/test-server.mjs: RN_STARTER_CREDITS=25, RN_ADMIN_EMAILS=admin-qa@example.com,
 * RN_SCAN_TEST=1 and RN_CRON_SECRET=qa-cron. It creates about 30 test accounts and stores test
 * scans, some dated up to 20 days back.
 *
 * What it covers:
 *   bundle   a hidden company, its role and its posting are one unlock for the daily limit, the
 *            scan pays back what was spent (not more) when the role closes, and a later removal
 *            pays nobody twice
 *   claim    a role a member took stays closed while the scan still sees its posting, also while
 *            the name waits for review, and opens again when the name is removed
 *   relist   a role the scan closed, listed again, reopens unless a member has since taken the
 *            seat as their own
 *   owed     a refund to a member who owes credits pays off what is owed first
 *   bench    a removed rate leaves the benchmark counts, and a private rate that moves onto the
 *            record counts once
 *   invite   the invite bonus is paid when a private rate moves onto a record as the first fact
 *   add      a seat title in another script is its own record
 *
 * Optional environment:
 *   ADMIN_EMAIL   the address in the server's RN_ADMIN_EMAILS (default admin-qa@example.com)
 *   ADMIN_TOKEN   its sign-in code, when that address already joined on this server
 *   CRON_SECRET   the server's RN_CRON_SECRET (default qa-cron)
 *   SEED_FILE     the private seed the server runs on (default data/intel-seed.json). The checks
 *                 that sign in as a seed member are skipped without it. Nothing from it is printed.
 *   STARTER       expected starter credits (default 25)
 *   ONLY          comma-separated sections to run (default all)
 */
import { readFileSync } from "node:fs";

const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const STARTER = Number(process.env.STARTER ?? 25);
const CRON_SECRET = process.env.CRON_SECRET ?? "qa-cron";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin-qa@example.com";
const ONLY = new Set((process.env.ONLY || "").split(",").map((x) => x.trim()).filter(Boolean));
const RUN = Date.now().toString(36);
/** A distinct client address per test client (the rightmost X-Forwarded-For entry). */
const IP_BASE = `10.${(Date.now() >> 8) & 255}.${Date.now() & 255}`;
let ipN = 0;
const nextIp = () => `${IP_BASE}.${++ipN}`;
const DAY_MS = 24 * 60 * 60 * 1000;

let failures = 0;
let passes = 0;
function check(name, ok, detail) {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${redact(typeof detail === "string" ? detail : JSON.stringify(detail) ?? "undefined").slice(0, 400)}`}`);
}
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

const mail = (name) => `qa+${RUN}-${name.toLowerCase().replace(/\W+/g, "")}-${Math.random().toString(36).slice(2, 7)}@example.com`;
async function join(name, { email, ref, headers } = {}) {
  const ipAddr = nextIp();
  const r = await call("POST", "/api/table", { ipAddr, headers, body: { join: { name, email: email ?? mail(name), ref } } });
  const token = (r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean) ?? null;
  return { r, client: token ? new Client(name, ipAddr, token) : null };
}
/** A new member, onboarded, on their own network. Names link seats, so each must be unique in a run. */
async function member(name, opts = {}) {
  const { r, client } = await join(name, opts);
  if (!client) throw new Error(`join ${name} failed: ${r.status} ${r.text.slice(0, 200)}`);
  await client.act({ type: "profile", function: "Sales", goal: "friendly" });
  return client;
}
let adminClient;
async function admin() {
  if (adminClient !== undefined) return adminClient;
  if (process.env.ADMIN_TOKEN) return (adminClient = new Client("Admin Qa", nextIp(), process.env.ADMIN_TOKEN));
  // An admin address can't be claimed in the join form alone, so the cron secret goes with it.
  const { client } = await join("Admin Qa", { email: ADMIN_EMAIL, headers: { "x-cron-secret": CRON_SECRET } });
  if (client) await client.act({ type: "profile", function: "Sales", goal: "friendly" });
  return (adminClient = client);
}

/* ---------- seed members (never printed) ---------- */

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
    ...seedFile.companies.flatMap((c) => [c.fields.name, c.fields.website, c.fields.linkedin]),
  ].filter((x) => typeof x === "string" && x.length >= 4);
  for (const x of secrets) if (text.includes(x)) text = text.split(x).join("[redacted]");
  return text;
}
const normName = (n) => n.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s'-]/g, " ").replace(/\s+/g, " ").trim();
/** Seed members with a sign-in code and a first and last name nobody else on file has. */
const seedPool = (() => {
  if (!seedFile) return [];
  const count = new Map();
  for (const m of seedFile.members) count.set(normName(m.name ?? ""), (count.get(normName(m.name ?? "")) ?? 0) + 1);
  return seedFile.members.filter((m) => m.token && /^\p{L}+ \p{L}+$/u.test(m.name ?? "") && count.get(normName(m.name)) === 1);
})();
/** The nth seed member this file uses, from the middle of the list. */
const seedMember = (n) => seedPool[Math.floor(seedPool.length / 2) + n] ?? null;
/** Sign in as a seed member, the way their personal link does. */
async function seedSignIn(m) {
  const ipAddr = nextIp();
  const r = await call("POST", "/api/table", { ipAddr, body: { signIn: m.token } });
  if (r.status !== 200) throw new Error(`seed sign-in failed: ${r.status}`);
  return new Client("Seed Member", ipAddr, m.token);
}

/**
 * Make a joined member's word count (lib/table.ts trustOf): they add a free fact and two seed
 * members confirm it. A claim on an open role closes it only from an account that counts.
 * It pays the member 2 credits (the fact, and the confirmation bonus). False without the seed.
 */
async function vouch(who) {
  const [a, b] = [seedMember(30), seedMember(31)];
  if (!a || !b) return false;
  // On a company of their own (every company on file is locked for them): its industry, which the
  // seed members can confirm while it stays locked for them.
  const made = await who.act({ type: "add", company: `Qa Vouch Co ${RUN} ${++vouchN}` });
  const f = { type: "fill", entity: "company", id: made.json?.id, field: "industry", value: "SaaS" };
  const r = await who.act(f);
  let ok = r.status === 200;
  for (const m of [a, b]) ok = (await (await seedSignIn(m)).act({ type: "verify", entity: f.entity, id: f.id, field: f.field })).status === 200 && ok;
  return ok;
}
let vouchN = 0;
const NEED_SEED = "needs the seed file the server runs on (two seed members vouch for the member who claims the role)";

/* ---------- test scans ---------- */

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
  key: `qaint${RUN}:${n}`, company, domain: null, title, function: null, type: "Fractional", url: `https://jobs.example.com/int/${RUN}/${n}`, source: board, postedAt: null, rate: null, hoursPerWeek: null, ...extra,
});
/** Three more roles on a board, so a scan that misses one role still matches enough to count as clean. */
const keepers = (tag, board) => [1, 2, 3].map((i) => posting(`${tag}k${i}`, `Qa ${tag} Keeper ${i} Co ${RUN}`, "Fractional Head of Partnerships", board));
const ago = (days) => new Date(Date.now() - days * DAY_MS).toISOString();
/** A moment after now: later than anything a member did so far. */
const soon = () => new Date(Date.now() + 2000).toISOString();

/* ---------- view helpers ---------- */

const engOf = (view, id) => {
  for (const c of view.companies) for (const e of c.engagements) if (e.id === id) return { ...e, company: c };
  return null;
};
const companyNamed = (view, name) => view.companies.find((c) => c.name === name) ?? null;
const PLAIN = { hq: "Austin, TX", industry: "SaaS", employees: "11–50", revenue: "$1M–$5M" };
const claimed = new Set();
/** A fill of an empty free company fact nobody in this run has picked yet. Hidden companies and test companies are left out. */
function pickEmpty(view) {
  for (const c of view.companies) {
    if (c.hidden || /^Qa /.test(c.name)) continue;
    for (const [field, value] of Object.entries(PLAIN)) {
      const k = `${c.id}.${field}`;
      if (c.cells[field]?.s !== "empty" || claimed.has(k)) continue;
      claimed.add(k);
      return { type: "fill", entity: "company", id: c.id, field, value };
    }
  }
  throw new Error("no empty company fact left");
}
/** n locked facts on engagements and people at companies that are not hidden. */
function pickLocked(view, n, skipIds = new Set()) {
  const out = [];
  for (const c of view.companies) {
    if (c.hidden || /^Qa /.test(c.name)) continue;
    const people = [...c.people];
    for (const e of c.engagements) {
      // Who held a seat and the role they held are one purchase too: the role is left out when the holder is locked.
      if (!skipIds.has(e.id)) for (const [field, cell] of Object.entries(e.cells)) if (cell.s === "locked" && out.length < n && !(field === "role" && e.cells.operator?.s === "locked")) out.push({ entity: "engagement", id: e.id, field });
      people.push(...e.people);
    }
    // A person's name and title are one purchase: the title is left out when the name is locked too.
    for (const p of people) for (const [field, cell] of Object.entries(p.cells)) if (cell.s === "locked" && out.length < n && !(field === "title" && p.cells.name?.s === "locked")) out.push({ entity: "contact", id: p.id, field });
    if (out.length >= n) break;
  }
  if (out.length < n) throw new Error(`only ${out.length} locked facts`);
  return out;
}
/**
 * Companies with no open role, for adding seats, as the admin sees them (named): every company is
 * locked for a member until they unlock it or know it, and a member adds their seat by the name.
 * Each is used once in a run.
 */
let hostN = 5;
const named = async () => (await (await admin()).view()).companies;
const host = async () => {
  const c = (await named()).filter((x) => x.friendly.open === 0 && !/^Qa /.test(x.name))[hostN++];
  if (!c) throw new Error("no host company left");
  return c;
};
/** A host company with no seat Revenue Nomad found: adding a seat there adds one, it never claims a found seat instead. */
const hostWithoutFound = async () => {
  const c = (await named()).filter((x) => x.friendly.open === 0 && !/^Qa /.test(x.name) && !(x.engagements ?? []).some((e) => e.source === "Seat scan"))[hostN++];
  if (!c) throw new Error("no host company left");
  return c;
};
/** What Unlock company costs (COMPANY_PRICE in lib/tableFields.ts). */
const PRICE = 2;
const unlockCo = (who, id) => who.act({ type: "unlock", entity: "company", id, field: "identity" });
/** Locked facts at a company (about as pickLocked counts them once it is unlocked). */
const lockedAt = (c) =>
  [...c.engagements.flatMap((e) => [...Object.values(e.cells), ...e.people.flatMap((p) => Object.values(p.cells))]), ...c.people.flatMap((p) => Object.values(p.cells))].filter((x) => x.s === "locked").length;
const openedIds = new Set();
/** Unlock companies with the most locked facts (none with an open role) until pickLocked finds `need(opened)` there. Returns how many. */
async function openForLocked(who, need, skipIds = new Set(), max = 8) {
  let opened = 0;
  for (;;) {
    let have = 0;
    try {
      have = pickLocked(await who.view(), 400, skipIds).length;
    } catch (e) {
      have = Number(String(e.message).match(/only (\d+)/)?.[1] ?? 0);
    }
    if (have >= need(opened) || opened >= max) return opened;
    const c = (await who.view()).companies.filter((x) => x.hidden && x.friendly.open === 0 && !/^Qa /.test(x.name) && !openedIds.has(x.id)).sort((a, b) => lockedAt(b) - lockedAt(a))[0];
    if (!c) return opened;
    openedIds.add(c.id);
    await unlockCo(who, c.id);
    opened++;
  }
}
const sum = (rows) => rows.reduce((n, l) => n + l.delta, 0);

/* ---------- sections ---------- */

const sections = {};
const section = (name, fn) => (sections[name] = fn);
const OUT = "You're out of credits. Add a missing fact to earn one.";
const CLOSED_REFUND = "Refund for a role that had closed";

// The company, its role, its posting and its posted rate are one purchase (PRICE credits). The first-day
// limit counts it in credits, the scan's refund pays it back in full, and an admin's removal pays nobody twice.
section("bundle", async () => {
  if (!(await canScan())) return skip("one-credit company unlock", NEED_SCAN);
  const adm = await admin();
  if (!adm) return skip("one-credit company unlock", "no admin account (set ADMIN_TOKEN)");
  const board = `qa-int-bundle-${RUN}`;
  const co = `Qa Bundle Co ${RUN}`;
  const role = posting("b", co, "Fractional CRO", board, { domain: `qa-int-bundle-${RUN}.example.com`, rate: "$12,000/mo" });
  const keep = keepers("Bundle", board);
  // Listed 20 days ago, and missed once by a clean scan 12 days ago.
  const s1 = await scanPost({ roles: [role, ...keep], sources: [{ source: board, fetched: 20, matched: 4 }], now: ago(20) });
  const rest = { roles: keep, sources: [{ source: board, fetched: 20, matched: 3 }] };
  const s2 = await scanPost({ ...rest, now: ago(12) });
  check("a scan opens the role and one clean miss leaves it open", s1.json?.result?.opened === 4 && s2.json?.result?.closed === 0, [s1.json?.result, s2.json?.result]);
  const coRec = companyNamed(await adm.view(), co);
  const eid = coRec?.engagements[0]?.id;

  // A new account buys it by clicking the posting's lock. The title is free.
  const M = await member("Mia Onecredit");
  const m0 = engOf(await M.view(), eid);
  check("the company is locked, the title is free, and the role says it was not seen in the last scan", m0?.company.hidden === true && m0.unseen === true && m0.cells.role?.s === "value" && m0.cells.posting?.s === "locked" && m0.cells.rate?.s === "locked", { hidden: m0?.company.hidden, unseen: m0?.unseen });
  const buy = await M.act({ type: "unlock", entity: "engagement", id: eid, field: "posting" });
  check(`unlocking the posting buys the company, the posting and the posted rate for ${PRICE} credits`, buy.status === 200 && /^Unlocked .+, the posting and the posted rate for 2 credits\.$/.test(buy.json?.message ?? "") && buy.json?.me?.credits === STARTER - PRICE && buy.json?.cells?.some((x) => x.id === eid && x.field === "rate" && x.cell.v === "$12,000/mo"), buy.json);
  check("the first-day limit counts it as one purchase of PRICE credits, not three", buy.json?.me?.unlocksLeft === STARTER - PRICE && buy.json?.me?.unlocked === 1, buy.json?.me);

  // Another new account spends all 25 in one go: the purchase and 24 more facts.
  // (Every company is locked for it: it unlocks a few others first, for facts to unlock there.)
  const P = await member("Pat Allin");
  const k = await openForLocked(P, (n) => STARTER - PRICE - PRICE * n);
  const pv = await P.view();
  const facts = STARTER - PRICE - PRICE * k;
  const more = pickLocked(pv, facts + 1);
  const items = [{ entity: "company", id: coRec.id, field: "identity" }, { entity: "engagement", id: eid, field: "role" }, { entity: "engagement", id: eid, field: "posting" }, { entity: "engagement", id: eid, field: "rate" }, ...more.slice(0, facts)];
  const all = await P.act({ type: "unlockMany", items });
  check(`a new account can spend all 25 credits: ${k} companies, the purchase and ${facts} more facts`, all.status === 200 && all.json?.me?.credits === 0 && all.json?.me?.unlocksLeft === 0 && all.json?.me?.unlocked === k + 1 + facts, all.json?.me ?? all.json);
  const wall = await P.act({ type: "unlock", ...more[facts] });
  check("at 0 credits and 0 unlocks left, the answer is about credits", wall.status === 400 && wall.json?.error === OUT, wall.json);

  // A member who already sees the company (they added a fact there) pays once for the open role's posting and rate (LOGIC-2), here through the rate's lock.
  const N = await member("Ned Twocredits");
  const fact = await N.act({ type: "add", company: co, companyFields: { industry: "SaaS" } });
  const two = await N.act({ type: "unlockMany", items: [{ entity: "engagement", id: eid, field: "rate" }, { entity: "engagement", id: eid, field: "posting" }] });
  check("a member who already sees the company pays 1 for the posting and the rate together", fact.status === 200 && two.status === 200 && two.json?.me?.credits === STARTER + 1 - 1 && two.json?.message === "Unlocked the posting and the posted rate for 1 credit.", two.json?.me ?? two.json);

  // The second clean miss, 20 days after the posting was last seen: the role closes, and every
  // unlock made after it was last seen is paid back, row by row, a company in full.
  const s3 = await scanPost({ ...rest, now: soon() });
  check("the scan closes the role and pays back 3 unlocks (one row each)", s3.json?.result?.closed === 1 && s3.json?.result?.refunded === 3, s3.json?.result);
  const mv = await M.view();
  const mRefunds = mv.ledger.filter((l) => l.reason === CLOSED_REFUND);
  check(`the company purchase comes back as ${PRICE} credits, in one row, and the company stays theirs`, mv.me.credits === STARTER && mRefunds.length === 1 && mRefunds[0].delta === PRICE && !engOf(mv, eid)?.company.hidden, { credits: mv.me.credits, refunds: mRefunds.length });
  check("the refund names the company in the ledger", mRefunds[0]?.company === co, mRefunds[0]);
  const pv2 = await P.view();
  const nv = await N.view();
  const nRefunds = nv.ledger.filter((l) => l.reason === CLOSED_REFUND);
  check(`the member who spent everything has ${PRICE} credits again`, pv2.me.credits === PRICE && pv2.me.owed === 0, { credits: pv2.me.credits, owed: pv2.me.owed });
  check("the member who paid 1 for the posting and the rate gets it back", nv.me.credits === STARTER + 1 && nRefunds.length === 1 && nRefunds[0].delta === 1, nv.me.credits);
  const lee = engOf(await (await member("Lee Latecomer")).view(), eid);
  check("the closed role's posting is free to a member who sees the company, and its company stays locked for a new member", engOf(nv, eid)?.cells.posting?.s === "value" && engOf(nv, eid)?.company.hidden === false && lee?.company.hidden === true && lee.cells.posting?.s === "locked", { lee: lee?.company.hidden });

  // The same role's rate is then reported by two of them and removed. Nobody is paid a second time.
  const r1 = await N.act({ type: "report", entity: "engagement", id: eid, field: "rate" });
  const r2 = await M.act({ type: "report", entity: "engagement", id: eid, field: "rate" });
  const rm = await adm.act({ type: "review", entity: "engagement", id: eid, field: "rate", decision: "remove" });
  const after = [(await M.view()).me.credits, (await P.view()).me.credits, (await N.view()).me.credits];
  check("an admin removal after the scan's refund pays nobody twice", r1.status === 200 && r2.status === 200 && rm.status === 200 && after[0] === STARTER && after[1] === PRICE && after[2] === STARTER + 1, { statuses: [r1.status, r2.status, rm.status], after });
});

// A role a member took is closed on that member's word. The scan must not undo it while the
// member holds the seat, and must not keep it closed once the name is gone.
section("claim", async () => {
  if (!(await canScan())) return skip("claimed role against the scan", NEED_SCAN);
  const adm = await admin();
  if (!adm) return skip("claimed role against the scan", "no admin account (set ADMIN_TOKEN)");
  const board = `qa-int-claim-${RUN}`;
  const co = `Qa Claim Co ${RUN}`;
  const role = posting("c", co, "Fractional CMO", board, { domain: `qa-int-claim-${RUN}.example.com` });
  const listed = { roles: [role, ...keepers("Claim", board)], sources: [{ source: board, fetched: 20, matched: 4 }] };
  await scanPost(listed);
  const coId = companyNamed(await adm.view(), co)?.id;
  const B = await member("Bo Onlooker");
  const look = async (who = B) => {
    const c = (await who.view()).companies.find((x) => x.id === coId);
    const e = c?.engagements[0];
    return { id: e?.id, hidden: c?.hidden, status: e?.cells.status?.v, closed: e?.closed, holder: e?.cells.operator?.s };
  };
  const eid = (await look()).id;
  const T = await member("Tia Taker");
  if (!(await vouch(T))) return skip("claimed role against the scan", NEED_SEED);
  await T.act({ type: "unlock", entity: "company", id: coId, field: "identity" });
  const claim = await T.act({ type: "fill", entity: "engagement", id: eid, field: "operator", value: "Tia Taker", memberId: "me" });
  const b1 = await look();
  // It stays locked for a member who never unlocked it: every company is, hiring or not.
  check("a member takes the open role and it closes", claim.status === 200 && b1.status === "Active" && b1.closed !== null && b1.hidden === true, { status: claim.status, b1 });

  const s2 = await scanPost(listed);
  check("the posting lingers and the scan leaves the role closed", s2.json?.result?.reopened === 0 && (await look()).status === "Active", s2.json?.result);

  // Two members pay to see the name and report it: it waits for an admin.
  const R1 = await member("Rex Reporter");
  const R2 = await member("Roz Reporter");
  for (const r of [R1, R2]) {
    await unlockCo(r, coId);
    await r.act({ type: "unlock", entity: "engagement", id: eid, field: "operator" });
    await r.act({ type: "report", entity: "engagement", id: eid, field: "operator" });
  }
  const b2 = await look();
  const s3 = await scanPost(listed);
  const b3 = await look();
  check("two reports hide the name", b2.holder === "reported", b2);
  check("while the name waits for review the scan still leaves the role closed", s3.json?.result?.reopened === 0 && b3.status === "Active" && b3.closed !== null, { result: s3.json?.result, b3 });

  const rm = await adm.act({ type: "review", entity: "engagement", id: eid, field: "operator", decision: "remove" });
  const b4 = await look();
  check("when an admin removes the name the role is open again and the company hidden", rm.status === 200 && b4.status === "Open role" && b4.closed === null && b4.hidden === true && b4.holder === "empty", { status: rm.status, b4 });
  const credits = [(await T.view()).me.credits, (await R1.view()).me.credits, (await R2.view()).me.credits];
  check("the claim's credit is taken back and both reporters get their unlock back (the company stays theirs)", credits[0] === STARTER + 2 - PRICE && credits[1] === STARTER - PRICE && credits[2] === STARTER - PRICE, credits);
  const s4 = await scanPost(listed);
  check("the next scan counts it as still open", s4.json?.result?.reopened === 0 && s4.json?.result?.stillOpen === 4 && (await look()).status === "Open role", s4.json?.result);
});

// A role the scan closed (its posting came down), listed again. It reopens, unless a member has
// since taken the seat as their own. A name somebody else typed does not outweigh the posting.
section("relist", async () => {
  if (!(await canScan())) return skip("relisted roles", NEED_SCAN);
  const adm = await admin();
  if (!adm) return skip("relisted roles", "no admin account (set ADMIN_TOKEN)");
  const board = `qa-int-relist-${RUN}`;
  const mineCo = `Qa Relist Mine Co ${RUN}`;
  const otherCo = `Qa Relist Other Co ${RUN}`;
  const mine = posting("rm", mineCo, "Fractional VP Marketing", board);
  const other = posting("ro", otherCo, "Interim VP Sales", board);
  const keep = keepers("Relist", board);
  const all = { roles: [mine, other, ...keep], sources: [{ source: board, fetched: 20, matched: 5 }] };
  const rest = { roles: keep, sources: [{ source: board, fetched: 20, matched: 3 }] };
  await scanPost({ ...all, now: ago(20) });
  await scanPost({ ...rest, now: ago(12) });
  const closed = await scanPost({ ...rest, now: ago(1) });
  check("two clean misses close both roles", closed.json?.result?.closed === 2, closed.json?.result);
  const av = await adm.view();
  const mineId = companyNamed(av, mineCo)?.engagements[0]?.id;
  const otherId = companyNamed(av, otherCo)?.engagements[0]?.id;

  const U = await member("Uma Owner");
  // Her claim keeps a listed role closed only on an account that counts.
  if (!(await vouch(U))) return skip("relisted roles", NEED_SEED);
  const V = await member("Vic Voucher");
  // The companies are locked for them: they unlock them first, so what follows is about the roles.
  await unlockCo(U, companyNamed(av, mineCo)?.id);
  await unlockCo(V, companyNamed(av, otherCo)?.id);
  const own = await U.act({ type: "fill", entity: "engagement", id: mineId, field: "operator", value: "Uma Owner", memberId: "me" });
  const typed = await V.act({ type: "fill", entity: "engagement", id: otherId, field: "operator", value: "Jane Thirdparty" });
  check("on a closed role a member can take the seat, and nobody can name somebody else", own.status === 200 && typed.status === 400 && typed.json?.error === "You can add seats you held. Pick yourself as the seat holder.", [own.json, typed.json]);

  const again = await scanPost({ ...all, now: soon() });
  const v1 = await adm.view();
  check("listed again, only the role nobody took as their own reopens", again.json?.result?.reopened === 1, again.json?.result);
  check("the role a member took as their own stays closed", engOf(v1, mineId)?.cells.status?.v === "Closed" && engOf(v1, mineId)?.closed !== null, engOf(v1, mineId)?.cells.status);
  check("the role nobody holds opens again", engOf(v1, otherId)?.cells.status?.v === "Open role" && engOf(v1, otherId)?.closed === null, engOf(v1, otherId)?.cells.status);

  // "This isn't me" takes the claim away, so the next listing reopens it.
  const not = await U.act({ type: "notMine", engagementId: mineId });
  const third = await scanPost({ ...all, now: new Date(Date.now() + 4000).toISOString() });
  const v2 = await adm.view();
  check("after This isn't me the next listing reopens it", not.status === 200 && third.json?.result?.reopened === 1 && engOf(v2, mineId)?.cells.status?.v === "Open role", { status: not.status, result: third.json?.result });
});

// A refund is a credit like any other: it pays off what is owed before it shows as a balance.
section("owed", async () => {
  const adm = await admin();
  const sm = seedMember(0);
  if (!adm || !sm) return skip("refund against credits owed", "needs the admin account and a seed member (a new account can't spend past its starter credits on day one)");
  const D = await seedSignIn(sm);
  const v = await D.view();
  if (v.me.credits !== STARTER || v.me.unlocked !== 0) return skip("refund against credits owed", "this seed member was used before on this server");
  // Another member puts a rate on a record, for the seed member to pay for.
  const W = await member("Wes Writer");
  const wHost = await host();
  const seat = await W.act({ type: "add", company: wHost.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: W.name, function: "Sales", type: "Fractional", pricing: "Monthly retainer", rate: "$9k/mo" } });
  const wEng = seat.json?.id;
  // The seed member adds one fact (26 credits) and spends all 26: the companies (every company is
  // locked for it, Wes's included), that rate and the facts it has credits left for.
  await unlockCo(D, wHost.id);
  const k = await openForLocked(D, (n) => STARTER - PRICE - PRICE * n + 2, new Set([wEng]));
  const mine = await D.act({ type: "add", company: `Qa Owed Own Co ${RUN}` });
  const mineFact = { type: "fill", entity: "company", id: mine.json?.id, field: "hq", value: "Austin, TX" };
  await D.act(mineFact);
  const left = (await D.view()).me.credits;
  const more = pickLocked(await D.view(), left + 1, new Set([wEng]));
  const spend = await D.act({ type: "unlockMany", items: [{ entity: "engagement", id: wEng, field: "rate" }, ...more.slice(0, left - 1)] });
  check("a member adds a fact and spends all 26 credits", seat.status === 200 && spend.status === 200 && spend.json?.me?.credits === 0 && spend.json?.me?.owed === 0, spend.json?.me ?? spend.json);
  const rm1 = await adm.act({ type: "adminRemove", entity: "company", id: mineFact.id, field: mineFact.field });
  const d1 = (await D.view()).me;
  check("their fact is removed after its credit was spent: 0 credits and 1 owed", rm1.status === 200 && d1.credits === 0 && d1.owed === 1, { status: rm1.status, credits: d1.credits, owed: d1.owed });
  const rm2 = await adm.act({ type: "adminRemove", entity: "engagement", id: wEng, field: "rate" });
  const dv = await D.view();
  check("a refund for a removed fact pays off what is owed first", rm2.status === 200 && dv.me.credits === 0 && dv.me.owed === 0, { status: rm2.status, credits: dv.me.credits, owed: dv.me.owed });
  check("the ledger adds up to the same", sum(dv.ledger) === -STARTER, sum(dv.ledger));
  const no = await D.act({ type: "unlock", ...more[left - 1] });
  check("at exactly 0 an unlock is refused for credits", no.status === 400 && no.json?.error === OUT, no.json);
  const wv = (await W.view()).me;
  check("the member whose rate was removed keeps the credits for the four facts that stand (the seat holder too)", wv.credits === STARTER + 4 && wv.owed === 0, { credits: wv.credits, owed: wv.owed });
});

// The benchmarks count rates that stand. A removed rate leaves them, and a private rate that
// moves onto the record counts once.
section("bench", async () => {
  const adm = await admin();
  if (!adm) return skip("benchmarks against removals", "no admin account (set ADMIN_TOKEN)");
  const A = await member("Bea Bench");
  const total = async () => (await A.view()).benchmarks.total;
  const t0 = await total();
  const hosts = [await host(), await host()];
  // Seats the member held: their own name as the seat holder (the server writes it).
  const add = (who, h, fields) => who.act({ type: "add", company: h.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: "Seat Holder", function: "Sales", type: "Fractional", ...fields } });
  const s1 = await add(A, hosts[0], { pricing: "Monthly retainer", rate: "$9k/mo" });
  const t1 = await total();
  const rm = await adm.act({ type: "adminRemove", entity: "engagement", id: s1.json?.id, field: "rate" });
  check("a rate on a record counts in the benchmarks, and stops counting when an admin removes it", s1.status === 200 && rm.status === 200 && t1 === t0 + 1 && (await total()) === t0, { t0, t1, after: await total() });

  // A private rate for a seat, then the same member puts the rate on that seat's record.
  const s2 = await add(A, hosts[1], {});
  const priv = await A.act({ type: "benchRate", engagementId: s2.json?.id, pricing: "Hourly", rate: "$150/hr" });
  const t2 = await total();
  const row = (await adm.view()).admin?.recentAdds?.find((r) => r.name === "Bea Bench");
  check("a rate shared for the benchmarks only counts once", priv.status === 200 && t2 === t0 + 1, { status: priv.status, t0, t2 });
  check("Pilot metrics lists the member with 1 private rate", row?.privateRates === 1 && typeof row.memberId === "string", row);
  const before = (await A.view()).me.credits;
  const pub = await A.act({ type: "fill", entity: "engagement", id: s2.json?.id, field: "rate", value: "$150/hr" });
  const av = await A.view();
  check("putting the rate on the record replaces the private one: still one rate, no second credit", pub.status === 200 && /replaces the one you shared/.test(pub.json?.message ?? "") && (await total()) === t0 + 1 && av.me.benchRates.length === 0 && av.me.credits === before, { message: pub.json?.message, credits: [before, av.me.credits] });

  // Everything this member added goes, and the counts follow.
  const gone = await adm.act({ type: "adminRemoveMember", memberId: row?.memberId });
  const after = await A.view();
  check("removing everything a member added takes their rate out of the benchmarks", gone.status === 200 && after.benchmarks.total === t0, { status: gone.status, total: after.benchmarks.total, t0 });
  check("the member is back at their starter credits, with nothing owed", after.me.credits === STARTER && after.me.owed === 0, { credits: after.me.credits, owed: after.me.owed });
  check("Pilot metrics no longer lists them", !(await adm.view()).admin?.recentAdds?.some((r) => r.name === "Bea Bench"));

  // A group's count of people follows removals too. Seed members count toward a floor (new accounts don't).
  const T = [];
  for (let i = 0; i < 5; i++) if (seedMember(10 + i)) T.push({ m: seedMember(10 + i), c: await seedSignIn(seedMember(10 + i)) });
  if (T.length < 5) return skip("a group's count after a removal", "no seed file the server knows");
  const rowOf = (view, fn, rev) => view.benchmarks.rows.find((r) => r.function === fn && r.revenue === rev);
  const plain = (await A.view()).benchmarks.rows.find((r) => !r.indexed && r.revenue !== "All" && r.monthly.n === 0 && r.monthly.min === 5);
  if (!plain) return skip("a group's count after a removal", "every group already has rates");
  const rates = ["$6k/mo", "$8k/mo", "$9k/mo", "$10k/mo", "$12k/mo"];
  const seats = [];
  for (let i = 0; i < 5; i++) seats.push(await T[i].c.act({ type: "add", company: (await host()).name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: "Seat Holder", function: plain.function, revenue: plain.revenue, pricing: "Monthly retainer", rate: rates[i] } }));
  const g1 = rowOf(await A.view(), plain.function, plain.revenue).monthly;
  check("five members' rates show a median for the group", seats.every((s) => s.status === 200) && g1.n === 5 && typeof g1.median === "number", g1);
  await adm.act({ type: "adminRemove", entity: "engagement", id: seats[0].json?.id, field: "rate" });
  const g2 = rowOf(await A.view(), plain.function, plain.revenue).monthly;
  check("an admin removes one rate: the group is at 4 of 5 and shows no number", g2.n === 4 && g2.median === undefined, g2);
  const second = (await adm.view()).admin?.recentAdds?.find((r) => r.name === T[1].m.name);
  await adm.act({ type: "adminRemoveMember", memberId: second?.memberId });
  const g3 = rowOf(await A.view(), plain.function, plain.revenue).monthly;
  check("everything a second member added is removed: the group is at 3 of 5", g3.n === 3 && g3.median === undefined, g3);
});

// The invite bonus waits for the invitee's first fact on a record. A rate shared for the
// benchmarks only is not one, but it becomes one when the member puts it on the record.
section("invite", async () => {
  const I = await member("Ivy Inviter");
  const code = (await I.view()).me.inviteCode;
  const J = await member("Jo Joined", { ref: code });
  // A private rate is not a fact on a record, so the bonus waits.
  const priv = await J.act({ type: "benchRate", pricing: "Monthly retainer", rate: "$8k/mo", function: "Sales" });
  const j1 = await J.view();
  check("a private rate earns its credit and leaves the bonus waiting", priv.status === 200 && !/invite bonus/i.test(priv.json?.message ?? "") && j1.me.credits === STARTER + 1 && j1.me.invitePending === true, { message: priv.json?.message, credits: j1.me.credits });
  // A seat they held is a first fact on a record: the bonus is paid.
  const seat = await J.act({ type: "add", company: (await hostWithoutFound()).name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: "Jo Joined", function: "Sales" } });
  const j2 = await J.view();
  check("adding a seat they held pays the bonus", seat.status === 200 && /Your invite bonus added 10 more\./.test(seat.json?.message ?? "") && j2.me.credits === STARTER + 1 + 2 + 10 && j2.me.invitePending === false, { message: seat.json?.message, credits: j2.me.credits, pending: j2.me.invitePending });
  const iv = await I.view();
  check("the inviter is paid too", iv.me.credits === STARTER + 10 && iv.me.invitesPaid === 1, { credits: iv.me.credits, paid: iv.me.invitesPaid });
});

// Seats are matched by title the way the scan matches them: in any script, and never on an empty key.
section("add", async () => {
  const A = await member("Ada Adder");
  const B = await member("Ben Adder");
  const h = await host();
  const a = await A.act({ type: "add", company: h.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: A.name, function: "Sales", type: "Fractional" } });
  const b = await B.act({ type: "add", company: h.name, operatorMemberId: "me", engagementFields: { operator: B.name, role: "Директор по продажам", type: "Interim" } });
  check("a seat with a title in another script is its own record, not another member's seat with no title", a.status === 200 && b.status === 200 && !!b.json?.id && b.json.id !== a.json?.id, { a: a.status, b: b.status, same: b.json?.id === a.json?.id });
  const c = await B.act({ type: "add", company: h.name, operatorMemberId: "me", engagementFields: { operator: B.name, role: "директор  по продажам", start: "2024-03" } });
  check("the same title typed again by its holder lands on that seat", c.status === 200 && c.json?.id === b.json?.id, { status: c.status, same: c.json?.id === b.json?.id });
});

/* ---------- run ---------- */

for (const [name, fn] of Object.entries(sections)) {
  if (ONLY.size && !ONLY.has(name)) continue;
  console.log(`\n# ${name}`);
  try {
    await fn();
  } catch (e) {
    failures++;
    console.log(`FAIL ${name} (threw): ${redact(String(e?.stack ?? e)).slice(0, 600)}`);
  }
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
