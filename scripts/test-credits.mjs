#!/usr/bin/env node
/**
 * Checks of the credit limits, invites and member rules, against a running server.
 *
 *   BASE=http://localhost:3000 node scripts/test-credits.mjs
 *
 * Run it against a throwaway server on a FRESH data dir, started like the one for
 * scripts/test-server.mjs: RN_STARTER_CREDITS=25, RN_ADMIN_EMAILS=admin-qa@example.com,
 * RN_SCAN_TEST=1 and RN_CRON_SECRET=qa-cron. It creates about 60 test accounts.
 *
 * What it covers:
 *   sell      the four "How they sell" pick lists: 5 earn a day, 20 save a day
 *   flood     150 facts a day on records, not counting the member's own seats
 *   adds      Pilot metrics: the members who added the most this week
 *   invites   5 different invitees per 30 days, same-network invites, private rates, Gmail addresses
 *   limit     the first-day unlock limit (25), unlocks left, and which refusal wins at 0 credits
 *   owed      a balance below zero shows as 0 credits and credits owed
 *   picker    the seat-holder search lists only members who have signed in, 30 searches a minute
 *   admin     an admin address can't be claimed in the join form, and what the admin export holds
 *
 * Optional environment:
 *   ADMIN_EMAIL   the address in the server's RN_ADMIN_EMAILS (default admin-qa@example.com)
 *   ADMIN_TOKEN   its sign-in code, when that address already joined on this server
 *   ADMIN_GMAIL   a Gmail address that is also in the server's RN_ADMIN_EMAILS (and not a member),
 *                 to check that another spelling of it is refused
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
const IP_BASE = `11.${(Date.now() >> 8) & 255}.${Date.now() & 255}`;
let ipN = 0;
const nextIp = () => `${IP_BASE}.${++ipN}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  if (ipAddr) h["x-forwarded-for"] = ipAddr;
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
  async view(ipAddr = this.ip) {
    const r = await call("GET", "/api/table", { token: this.token, ipAddr });
    if (r.status !== 200) throw new Error(`GET as ${this.name}: ${r.status} ${r.text.slice(0, 200)}`);
    return r.json;
  }
  act(action) {
    return call("POST", "/api/table", { token: this.token, ipAddr: this.ip, body: { action } });
  }
  people(q) {
    return call("GET", "/api/table?people=" + encodeURIComponent(q), { token: this.token, ipAddr: this.ip });
  }
}

const mail = (name) => `qa+${RUN}-${name.toLowerCase().replace(/\W+/g, "")}-${Math.random().toString(36).slice(2, 7)}@example.com`;

async function join(name, ipAddr, { ref, email, headers } = {}) {
  const r = await call("POST", "/api/table", { ipAddr, headers, body: { join: { name, email: email ?? mail(name), ref } } });
  const token = (r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean) ?? null;
  return { r, client: token ? new Client(name, ipAddr, token) : null };
}

/** A new member, onboarded, on their own network unless one is given. */
async function member(name, opts = {}) {
  const { r, client } = await join(name, opts.ip ?? nextIp(), opts);
  if (!client) throw new Error(`join ${name} failed: ${r.status} ${r.text.slice(0, 200)}`);
  await client.act({ type: "profile", function: "Sales", goal: "friendly" });
  return client;
}

/* ---------- seed members (never printed) ---------- */

let seedFile = null;
try {
  seedFile = JSON.parse(readFileSync(process.env.SEED_FILE ?? "data/intel-seed.json", "utf8"));
} catch {
  /* no seed here: the checks that need a seed member are skipped */
}
/** A failed check prints what it got. Names, emails and sign-in codes from the seed never go to the log. */
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
/** Seed members with a sign-in code and a first and last name nobody else on file has. */
const seedPool = (() => {
  if (!seedFile) return [];
  const count = new Map();
  for (const m of seedFile.members) count.set(normName(m.name ?? ""), (count.get(normName(m.name ?? "")) ?? 0) + 1);
  return seedFile.members.filter((m) => m.token && /^\p{L}+ \p{L}+$/u.test(m.name ?? "") && count.get(normName(m.name)) === 1);
})();
/**
 * The nth seed member this file uses, from the middle of the list: scripts/test-server.mjs
 * signs in as the last few and as the first seat holders, and may have run on this server.
 */
const seedMember = (n) => seedPool[Math.floor(seedPool.length / 2) + n] ?? null;
/** Sign in as a seed member from a network, the way their personal link does. */
async function seedSignIn(m, ipAddr) {
  const r = await call("POST", "/api/table", { ipAddr, body: { signIn: m.token } });
  if (r.status !== 200) throw new Error(`seed sign-in failed: ${r.status}`);
  return new Client("Seed Member", ipAddr, m.token);
}

/* ---------- view helpers ---------- */

const SELL = { businessModel: "B2B", motion: "Inside sales", dealSize: "$15K–$50K", salesCycle: "30–90 days" };
const PLAIN = { hq: "Austin, TX", industry: "SaaS", employees: "11–50", revenue: "$1M–$5M", linkedin: "linkedin.com/company/qa-credits" };
const claimed = new Set();
/** n empty company cells nobody in this run has picked yet, from the given fields. Hidden companies are left out. */
function pickEmpty(view, n, values = PLAIN) {
  const out = [];
  for (const c of view.companies) {
    if (c.hidden) continue;
    for (const [field, value] of Object.entries(values)) {
      if (out.length >= n) return out;
      const k = `${c.id}.${field}`;
      if (c.cells[field]?.s !== "empty" || claimed.has(k)) continue;
      claimed.add(k);
      out.push({ type: "fill", entity: "company", id: c.id, field, value, company: c });
    }
  }
  if (out.length < n) throw new Error(`only ${out.length} empty cells left`);
  return out;
}
const fillAct = ({ type, entity, id, field, value }) => ({ type, entity, id, field, value });
/** n locked facts on engagements and people at companies that are not hidden. */
function pickLocked(view, n) {
  const out = [];
  for (const c of view.companies) {
    if (c.hidden) continue;
    const people = [...c.people];
    for (const e of c.engagements) {
      for (const [field, cell] of Object.entries(e.cells)) if (cell.s === "locked" && out.length < n) out.push({ entity: "engagement", id: e.id, field });
      people.push(...e.people);
    }
    for (const p of people) for (const [field, cell] of Object.entries(p.cells)) if (cell.s === "locked" && out.length < n) out.push({ entity: "contact", id: p.id, field });
    if (out.length >= n) break;
  }
  if (out.length < n) throw new Error(`only ${out.length} locked facts`);
  return out;
}
/** Companies with no open role, for adding seats (the same list for every new member). */
const hostsOf = (view) => view.companies.filter((c) => !c.hidden && c.friendly.open === 0);
let hostN = 60;

/* ---------- sections ---------- */

const sections = {};
const section = (name, fn) => (sections[name] = fn);
const shared = {};

/** The admin account. An admin address joins only with the server's cron secret while email sign-in is off. */
async function admin() {
  if (shared.admin !== undefined) return shared.admin;
  if (process.env.ADMIN_TOKEN) return (shared.admin = new Client("Admin Qa", nextIp(), process.env.ADMIN_TOKEN));
  const { client } = await join("Admin Qa", nextIp(), { email: ADMIN_EMAIL, headers: { "x-cron-secret": CRON_SECRET } });
  if (client) await client.act({ type: "profile", function: "Sales", goal: "friendly" });
  return (shared.admin = client);
}

section("admin", async () => {
  // LEAK-5: admin rights follow the address, so the join form must not hand it out.
  const plain = await join("Admin Squatter", nextIp(), { email: ADMIN_EMAIL });
  check("an address in RN_ADMIN_EMAILS can't be claimed in the join form", plain.r.status === 400 && plain.client === null && plain.r.json?.error === "That email is already in use. Sign in with your link.", { status: plain.r.status, error: plain.r.json?.error });
  // If the server let that through, the account is the admin now: keep it so the checks below still run.
  if (plain.client && shared.admin === undefined) {
    await plain.client.act({ type: "profile", function: "Sales", goal: "friendly" });
    shared.admin = plain.client;
  }
  const upper = await join("Admin Squatter", nextIp(), { email: `  ${ADMIN_EMAIL.toUpperCase()} ` });
  check("the same address in capitals and spaces is refused too", upper.r.status === 400 && upper.client === null, upper.r.status);
  const wrong = await join("Admin Squatter", nextIp(), { email: ADMIN_EMAIL, headers: { "x-cron-secret": CRON_SECRET + "x" } });
  check("a wrong secret does not let it through", wrong.r.status === 400 && wrong.client === null, wrong.r.status);
  const dup = await join("Dup Tester", nextIp(), { email: `qa+${RUN}-dup@example.com` });
  const dup2 = await join("Dup Tester", nextIp(), { email: `qa+${RUN}-dup@example.com` });
  check("it gets the same answer as an address already in use", dup.r.status === 200 && dup2.r.json?.error === plain.r.json?.error, dup2.r.json);
  // One inbox, one account holds for admin addresses too: another spelling of an admin's Gmail
  // address must not take the inbox (the admin could then never join with it).
  if (process.env.ADMIN_GMAIL) {
    const [local, domain] = process.env.ADMIN_GMAIL.toLowerCase().split("@");
    const spelled = `${local.replace(/\./g, "").split("").join(".")}+qa@${domain === "gmail.com" ? "googlemail.com" : "gmail.com"}`;
    const alias = await join("Admin Squatter", nextIp(), { email: spelled });
    check("another spelling of an admin's Gmail address is refused too", alias.r.status === 400 && alias.client === null, alias.r.status);
  } else skip("admin Gmail spelling", "ADMIN_GMAIL not set (a Gmail address in the server's RN_ADMIN_EMAILS)");
  const adm = await admin();
  if (!adm) return skip("admin account checks", "the admin address is taken on this server (set ADMIN_TOKEN)");
  const av = await adm.view();
  check("whoever runs the server can still create the first admin, with the cron secret", av.me?.admin === true && !!av.admin, av.me?.admin);
  const member1 = await member("Mel Member");
  const exp1 = await call("GET", "/api/table?export=1", { token: member1.token, ipAddr: member1.ip });
  check("the export is for admins only", exp1.status === 403, exp1.status);

  // The export must not link a private rate to its member: not by order, not by the ledger.
  const A = await member("Rae Rates");
  const B = await member("Rob Rates");
  const shares = [
    [A, "$311/hr"], [B, "$266/hr"], [A, "$211/hr"], [B, "$166/hr"], [A, "$111/hr"],
  ];
  for (const [who, rate] of shares) {
    const r = await who.act({ type: "benchRate", pricing: "Hourly", rate, function: "Enablement" });
    if (r.status !== 200) return fail("admin: share a private rate", r.json);
  }
  const exp = await call("GET", "/api/table?export=1", { token: adm.token, ipAddr: adm.ip });
  const rates = (exp.json?.benchRates ?? []).filter((b) => b.fn === "Enablement" && b.kind === "hourly" && [311, 266, 211, 166, 111].includes(b.amount)).map((b) => b.amount);
  check("the export lists private rates in a fixed order, not the order they were shared in", exp.status === 200 && JSON.stringify(rates) === JSON.stringify([111, 166, 211, 266, 311]), rates);
  const ledger = exp.json?.ledger ?? [];
  const benchRows = ledger.filter((l) => String(l.ref).startsWith("bench"));
  check("ledger rows for private rates carry no rate id", benchRows.length >= 5 && benchRows.every((l) => l.ref === "bench"), benchRows.slice(0, 2).map((l) => String(l.ref).replace(/\.[\w-]+$/, ".ID")));
  check("private rates in the export still carry no member, id or seat", (exp.json?.benchRates ?? []).every((b) => !("by" in b) && !("id" in b) && !("engagementId" in b) && !("at" in b)));
  check("the export keeps what a restore needs: members with their sign-in codes", (exp.json?.members ?? []).length >= 4 && exp.json.members.every((m) => typeof m.token === "string" && m.token.length > 8));
  const mine = (await A.view()).me.benchRates;
  check("the member's own view still lists their rates, and the ledger still names them", mine.length === 3 && (await A.view()).ledger.filter((l) => l.field === "Rate (benchmarks only)").length === 3, mine.length);
});

section("sell", async () => {
  // ECON-5, LOGIC-5: one-click pick lists that are easy to guess earn 5 a day and save 20 a day.
  const F = await member("Fen Filler");
  const v = await F.view();
  check("Me.sellEarnLeft starts at 5", v.me.sellEarnLeft === 5, v.me.sellEarnLeft);
  const sells = pickEmpty(v, 22, SELL);
  let r;
  for (let i = 0; i < 5; i++) {
    r = await F.act(fillAct(sells[i]));
    if (r.status !== 200 || !/\+1 credit\./.test(r.json?.message ?? "")) return fail(`sell: answer ${i + 1} should earn`, r.json);
  }
  check("the first 5 answers under How they sell earn a credit each", r.json?.me?.credits === STARTER + 5 && r.json?.me?.sellEarnLeft === 0, r.json?.me);
  const sixth = await F.act(fillAct(sells[5]));
  check("the 6th saves and earns nothing", sixth.status === 200 && sixth.json?.cells?.[0]?.cell?.s === "value" && sixth.json?.me?.credits === STARTER + 5 && sixth.json?.capped === true, sixth.json);
  check(
    "its message says why, and what still earns",
    /^Added [^.]+\. Only 5 answers under How they sell earn a credit each day, so this one didn't earn\. A role, a rate or who held the seat still earns\.$/.test(sixth.json?.message ?? "") && !/hit today's max/.test(sixth.json?.message ?? ""),
    sixth.json?.message,
  );
  const other = await F.act(fillAct(pickEmpty(v, 1)[0]));
  check("another kind of fact still earns after that", other.status === 200 && /\+1 credit\.$/.test(other.json?.message ?? "") && other.json?.me?.credits === STARTER + 6, other.json);
  for (let i = 6; i < 20; i++) {
    r = await F.act(fillAct(sells[i]));
    if (r.status !== 200) return fail(`sell: answer ${i + 1} should save`, r.json);
  }
  check("answers 7 to 20 save for no credit", r.json?.me?.credits === STARTER + 6 && r.json?.me?.earned24h === 6, r.json?.me);
  const over = await F.act(fillAct(sells[20]));
  check(
    "the 21st in a day is refused until tomorrow",
    over.status === 400 && over.json?.error === "You've added 20 answers under How they sell today. Add more tomorrow. A role, a rate or who held the seat can go in now.",
    over.json,
  );
  const viaAdd = await F.act({ type: "add", company: sells[21].company.name, companyFields: { [sells[21].field]: sells[21].value } });
  check("the Add form can't carry one past the limit either", viaAdd.status === 400 && /20 answers under How they sell/.test(viaAdd.json?.error ?? ""), viaAdd.json);
  const v2 = await F.view();
  const c21 = v2.companies.find((c) => c.id === sells[20].id);
  check("a refused answer is not saved", c21?.cells[sells[20].field]?.s === "empty" && v2.me.added === 21, { cell: c21?.cells[sells[20].field]?.s, added: v2.me.added });
  const still = await F.act(fillAct(pickEmpty(v, 1)[0]));
  check("other facts still go in past it", still.status === 200 && still.json?.me?.credits === STARTER + 7, still.json);
});

section("flood", async () => {
  // ECON-5: a hard stop on facts per day, so the table can't be flooded past the earn cap.
  const G = await member("Gil Flood");
  const v = await G.view();
  // A seat G holds, added first: facts on it don't count toward the 150.
  const seat = await G.act({ type: "add", company: hostsOf(v)[hostN++].name, newEngagement: true, operatorMemberId: "me", engagementFields: { function: "Sales", type: "Fractional", operator: "typed over" } });
  if (seat.status !== 200) return fail("flood: add own seat", seat.json);
  const fills = pickEmpty(v, 151);
  let r;
  for (let i = 0; i < 150; i++) {
    r = await G.act(fillAct(fills[i]));
    if (r.status !== 200) return fail(`flood: fact ${i + 1} of 150 should save (facts on the member's own seat don't count)`, r.json);
  }
  check("150 facts in a day all save, 25 of them for credit", r.json?.me?.earned24h === 25 && r.json?.me?.added === 153, r.json?.me);
  const over = await G.act(fillAct(fills[150]));
  check(
    "the 151st fact in a day is refused until tomorrow",
    over.status === 400 && over.json?.error === "You've added 150 facts today, and that's the daily limit. Add more tomorrow. You can still fill in the seats you hold.",
    over.json,
  );
  const own = await G.act({ type: "fill", entity: "engagement", id: seat.json.id, field: "hours", value: "12" });
  check("a fact on a seat the member holds still goes in", own.status === 200 && own.json?.cells?.[0]?.cell?.v === "12", own.json);
  const person = await G.act({ type: "addPerson", companyId: fills[0].id, person: { name: "Pat Flood", title: "CEO" } });
  check("the limit covers people added too", person.status === 400 && /150 facts today/.test(person.json?.error ?? ""), person.json);
  shared.flood = G;
});

section("adds", async () => {
  // Pilot metrics: who added the most this week, for spotting a flood.
  const adm = await admin();
  if (!adm) return skip("recent adds", "no admin account (set ADMIN_TOKEN)");
  const P = await member("Pia Private");
  const pv = await P.view();
  const [fact, fact2] = pickEmpty(pv, 2);
  await P.act(fillAct(fact));
  await P.act(fillAct(fact2));
  await P.act({ type: "benchRate", pricing: "Hourly", rate: "$140/hr", function: "Sales" });
  const a = (await adm.view()).admin;
  const list = a?.recentAdds;
  check("admins get recentAdds: at most 20 members, most facts first", Array.isArray(list) && list.length > 0 && list.length <= 20 && list.every((x, i) => i === 0 || list[i - 1].adds7 >= x.adds7), list?.length);
  if (!Array.isArray(list)) return;
  const KEYS = ["adds24h", "adds7", "lastAt", "memberId", "name", "privateRates"];
  check("each row has a public member id, a name and counts, and nothing else", list.every((x) => JSON.stringify(Object.keys(x).sort()) === JSON.stringify(KEYS) && /^[a-z]_[A-Za-z0-9_-]{12}$/i.test(x.memberId) && x.adds24h <= x.adds7 && !Number.isNaN(Date.parse(x.lastAt))), list[0] && Object.keys(list[0]));
  const row = list.find((x) => x.name === "Pia Private");
  check("a member's row counts facts on records, and private rates apart", row?.adds7 === 2 && row?.adds24h === 2 && row?.privateRates === 1, row);
  if (shared.flood) {
    const top = list[0];
    check("the member who flooded the table is at the top", top.name === "Gil Flood" && top.adds7 >= 150, { name: top.name, adds7: top.adds7 });
  }
  check("a member who isn't an admin gets none of it", !("admin" in pv));
  // A removed fact drops out of the count.
  const R1 = await member("Rex Reporter");
  const R2 = await member("Rya Reporter");
  const rv = await R1.view();
  await R1.act(fillAct(pickEmpty(rv, 1)[0]));
  await R2.act(fillAct(pickEmpty(rv, 1)[0]));
  const target = { entity: "company", id: fact.id, field: fact.field };
  const rep1 = await R1.act({ type: "report", ...target });
  const rep2 = await R2.act({ type: "report", ...target });
  const rm = await adm.act({ type: "review", ...target, decision: "remove" });
  if (rep1.status !== 200 || rep2.status !== 200 || rm.status !== 200) return skip("removed facts leave recentAdds", `report and review answered ${rep1.status} ${rep2.status} ${rm.status}`);
  const row2 = (await adm.view()).admin.recentAdds.find((x) => x.name === "Pia Private");
  check("a fact an admin removed no longer counts", row2?.adds7 === 1, row2);
});

section("invites", async () => {
  // LOGIC-9: the limit is 5 different invitees per 30 days, however the daily cap splits their bonuses.
  const INV = await member("Ina Inviter");
  const iv = await INV.view();
  const code = iv.me.inviteCode;
  const facts = pickEmpty(iv, 20);
  let last;
  const paidAfter = [];
  for (let i = 1; i <= 6; i++) {
    const u = await member(`Guest Invitee${"abcdef"[i - 1]}`, { ref: code });
    last = await u.act(fillAct(facts.pop()));
    paidAfter.push((await INV.view()).me.invitesPaid);
  }
  const me6 = (await INV.view()).me;
  check("5 different invitees pay the inviter in 30 days, and the 6th does not", JSON.stringify(paidAfter) === "[1,2,3,4,5,5]" && me6.invited === 6, paidAfter);
  check("all 5 bonuses are paid or held: 25 under today's cap, 25 waiting", me6.credits === STARTER + 25 && me6.held === 25 && me6.earned24h === 25, { credits: me6.credits, held: me6.held });
  check("the 6th invitee still gets their own bonus", /Invite bonus \+10\./.test(last.json?.message ?? ""), last.json?.message);

  // The inviter's own bonus for having been invited is not one of their 5.
  const J = await member("Jo Joined", { ref: code });
  await J.act(fillAct(facts.pop()));
  const jcode = (await J.view()).me.inviteCode;
  for (let i = 1; i <= 5; i++) {
    const u = await member(`Visitor Invitee${"abcde"[i - 1]}`, { ref: jcode });
    await u.act(fillAct(facts.pop()));
  }
  const jme = (await J.view()).me;
  check("an inviter who was invited themselves still gets 5", jme.invitesPaid === 5 && jme.credits + jme.held === STARTER + 1 + 10 + 50, { paid: jme.invitesPaid, credits: jme.credits, held: jme.held });

  // ECON-8: a private rate is not a fact on a record, so the bonus waits for one.
  const K = await member("Kit Inviter");
  const kcode = (await K.view()).me.inviteCode;
  const N = await member("Nia Newbie", { ref: kcode });
  const bench = await N.act({ type: "benchRate", pricing: "Hourly", rate: "$160/hr", function: "Sales" });
  const nv = await N.view();
  check("a private rate as a first fact pays no invite bonus yet", bench.status === 200 && !/Invite bonus/.test(bench.json?.message ?? "") && bench.json?.me?.credits === STARTER + 1 && nv.me.invitePending === true && (await K.view()).me.invitesPaid === 0, bench.json);
  const real = await N.act(fillAct(facts.pop()));
  const kme = (await K.view()).me;
  check("the first fact on a record pays it to both", /Invite bonus \+10\./.test(real.json?.message ?? "") && real.json?.me?.credits === STARTER + 12 && kme.invitesPaid === 1 && kme.credits === STARTER + 10, { msg: real.json?.message, inviter: kme.credits });

  // ECON-8: same network, by any network the inviter has used, not only the one they joined from.
  const moved = nextIp();
  await K.view(moved); // K visits from a second network
  await sleep(400); // the visit is saved just after the GET
  const S1 = await member("Sam Samenet", { ref: kcode, ip: moved });
  const s1 = (await S1.view()).me;
  const S2 = await member("Sue Samenet", { ref: kcode, ip: K.ip });
  const s2 = (await S2.view()).me;
  check("an invitee on a network the inviter visited from gets no invite", s1.invitePending === false, s1.invitePending);
  check("an invitee on the network the inviter joined from gets none either", s2.invitePending === false, s2.invitePending);
  const s1f = await S1.act(fillAct(facts.pop()));
  check("a same-network invite pays no bonus to either", !/Invite bonus/.test(s1f.json?.message ?? "") && (await K.view()).me.invited === 1, s1f.json?.message);

  // Seed members have no join network: theirs come from sign-ins and visits.
  const sm = seedMember(0);
  if (sm) {
    const home = nextIp();
    const SI = await seedSignIn(sm, home);
    const scode = (await SI.view()).me.inviteCode;
    const X1 = await member("Xan Seednet", { ref: scode, ip: home });
    check("an invitee on the network a seed member signed in from gets no invite", (await X1.view()).me.invitePending === false);
    const cafe = nextIp();
    await SI.view(cafe);
    await sleep(400);
    const X2 = await member("Xia Seednet", { ref: scode, ip: cafe });
    check("nor does one on a network the seed member only visited from", (await X2.view()).me.invitePending === false);
    const X3 = await member("Xor Elsewhere", { ref: scode });
    const before = (await SI.view()).me;
    const x3f = await X3.act(fillAct(facts.pop()));
    const after = (await SI.view()).me;
    check("an invitee on another network still earns a seed member the bonus", /Invite bonus \+10\./.test(x3f.json?.message ?? "") && before.invited === 1 && after.invitesPaid === 1 && after.credits + after.held === before.credits + before.held + 10, { invited: before.invited, paid: after.invitesPaid });
  } else skip("seed member invite checks", "no seed file the server knows");

  // One Gmail inbox is one account.
  const g1 = await join("Gia Gmail", nextIp(), { email: `Rn.Qa.${RUN}+one@gmail.com` });
  const g2 = await join("Gia Gmail", nextIp(), { email: `rnqa${RUN}@googlemail.com` });
  const g3 = await join("Gia Gmail", nextIp(), { email: `r.n.q.a.${RUN}+two@gmail.com` });
  check("a.b+tag@gmail.com and ab@googlemail.com are one address", g1.r.status === 200 && g2.r.status === 400 && g3.r.status === 400 && g2.r.json?.error === "That email is already in use. Sign in with your link.", [g1.r.status, g2.r.status, g3.r.status]);
  const o1 = await join("Oli Other", nextIp(), { email: `rn.qa.${RUN}@example.com` });
  const o2 = await join("Oli Other", nextIp(), { email: `rnqa${RUN}@example.com` });
  const o3 = await join("Oli Other", nextIp(), { email: `rn.qa.${RUN}+tag@example.com` });
  check("other domains compare as typed", o1.r.status === 200 && o2.r.status === 200 && o3.r.status === 200, [o1.r.status, o2.r.status, o3.r.status]);
});

section("limit", async () => {
  // ECON-9, LOGIC-6: the first-day limit equals the starter credits, and the screen can show what is left.
  const L = await member("Lee Limit");
  const v = await L.view();
  check("a new account's Me carries unlocksLeft 25 and owed 0", v.me.unlocksLeft === 25 && v.me.owed === 0 && v.me.credits === STARTER, { left: v.me.unlocksLeft, owed: v.me.owed });
  const locked = pickLocked(v, 30);
  for (const f of pickEmpty(v, 5)) await L.act(fillAct(f));
  const first = await L.act({ type: "unlock", ...locked[0] });
  check("an unlock answers with the unlocks left", first.status === 200 && first.json?.me?.unlocksLeft === 24 && first.json?.me?.credits === STARTER + 4 && first.json?.me?.owed === 0, first.json?.me);
  const r24 = await L.act({ type: "unlockMany", items: locked.slice(1, 25) });
  check("a new account can unlock 25 facts on day one", r24.status === 200 && r24.json?.me?.unlocksLeft === 0 && r24.json?.me?.credits === 5, r24.json?.me ?? r24.json);
  const r26 = await L.act({ type: "unlock", ...locked[25] });
  check("past 25 the refusal names the limit and the credits that wait", r26.status === 400 && r26.json?.error === "New accounts can unlock 25 facts on day one. Your 5 credits are here tomorrow.", r26.json);
  const many = await L.act({ type: "unlockMany", items: locked.slice(25, 29) });
  check("unlock all gets the same answer", many.status === 400 && many.json?.error === r26.json?.error, many.json);
  const lv = await L.view();
  check("the view agrees: 5 credits, 0 unlocks left", lv.me.credits === 5 && lv.me.unlocksLeft === 0, { credits: lv.me.credits, left: lv.me.unlocksLeft });

  const One = await member("Uno Limit");
  await One.act(fillAct(pickEmpty(v, 1)[0]));
  await One.act({ type: "unlockMany", items: locked.slice(0, 25) });
  const one = await One.act({ type: "unlock", ...locked[25] });
  check("one credit left reads as one credit", one.json?.error === "New accounts can unlock 25 facts on day one. Your 1 credit is here tomorrow.", one.json);

  // At 0 credits the out-of-credits answer wins, and the wall is counted.
  const adm = await admin();
  const Z = await member("Zed Zero");
  const b = adm ? (await adm.view()).admin.walls : null;
  const all = await Z.act({ type: "unlockMany", items: locked.slice(0, 25) });
  check("a new account can spend every starter credit on day one", all.status === 200 && all.json?.me?.credits === 0 && all.json?.me?.unlocksLeft === 0, all.json?.me ?? all.json);
  const zero = await Z.act({ type: "unlock", ...locked[25] });
  check("at 0 credits and 0 unlocks left, out of credits wins", zero.status === 400 && zero.json?.error === "You're out of credits. Add a missing fact to earn one.", zero.json);
  if (adm) {
    const w = (await adm.view()).admin.walls;
    check("and the wall is counted", w.hits === b.hits + 1 && w.members === b.members + 1, { before: b, after: w });
  } else skip("wall count at the first-day limit", "no admin account (set ADMIN_TOKEN)");

  const sm = seedMember(1);
  if (sm) {
    const S = await seedSignIn(sm, nextIp());
    const sv = await S.view();
    check("a seed member has the full daily limit left", sv.me.unlocksLeft > 25 && sv.me.unlocksLeft <= 100, sv.me.unlocksLeft);
  } else skip("seed member unlocks left", "no seed file the server knows");
});

section("owed", async () => {
  // ECON-10: the ledger keeps the full take-back. The screen never shows a negative balance.
  const sm = seedMember(2);
  if (!sm) return skip("credits owed", "needs a seed member (a new account can't spend past its starter credits on day one)");
  const Z = await seedSignIn(sm, nextIp());
  const v = await Z.view();
  if (v.me.credits !== STARTER || v.me.unlocked !== 0) return skip("credits owed", "this seed member was used before on this server");
  const rate = await Z.act({ type: "benchRate", pricing: "Hourly", rate: "$150/hr", function: "Sales" });
  const locked = pickLocked(v, STARTER + 3);
  const spend = await Z.act({ type: "unlockMany", items: locked.slice(0, STARTER + 1) });
  check("a member shares a private rate and spends everything", rate.status === 200 && spend.status === 200 && spend.json?.me?.credits === 0 && spend.json?.me?.owed === 0, spend.json?.me ?? spend.json);
  const rm = await Z.act({ type: "benchRateRemove", id: rate.json?.id });
  check("taking the rate back leaves 0 credits and 1 owed, not -1", rm.status === 200 && rm.json?.me?.credits === 0 && rm.json?.me?.owed === 1, rm.json?.me ?? rm.json);
  const zv = await Z.view();
  check("the view says the same", zv.me.credits === 0 && zv.me.owed === 1, { credits: zv.me.credits, owed: zv.me.owed });
  check("the ledger still holds the full take-back", zv.ledger.reduce((n, l) => n + l.delta, 0) === -(STARTER + 1), zv.ledger.reduce((n, l) => n + l.delta, 0));
  const no = await Z.act({ type: "unlock", ...locked[STARTER + 1] });
  check("an unlock while owing gets the out-of-credits answer", no.status === 400 && no.json?.error === "You're out of credits. Add a missing fact to earn one.", no.json);
  const pay = await Z.act(fillAct(pickEmpty(v, 1)[0]));
  check("the next fact clears what is owed", pay.status === 200 && pay.json?.me?.credits === 0 && pay.json?.me?.owed === 0, pay.json?.me);
  const still = await Z.act({ type: "unlock", ...locked[STARTER + 1] });
  check("at exactly 0 an unlock is still refused for credits", still.json?.error === "You're out of credits. Add a missing fact to earn one.", still.json);
  await Z.act(fillAct(pickEmpty(v, 1)[0]));
  const ok = await Z.act({ type: "unlock", ...locked[STARTER + 1] });
  check("one more fact and the unlock goes through", ok.status === 200 && ok.json?.me?.credits === 0, ok.json?.me ?? ok.json);
});

section("picker", async () => {
  // LEAK-2: the seat-holder search is not a directory of everyone who was invited.
  const T = await member("Theo Picker");
  const U = await member("Una Picked");
  const anon = await call("GET", "/api/table?people=una", { ipAddr: nextIp() });
  check("signed out, the search returns nothing", anon.status === 200 && anon.json?.members?.length === 0, anon.json);
  const joined = await T.people("una pick");
  check("a joined member is listed, with no email", joined.json?.members?.some((m) => m.name === "Una Picked" && !("email" in m) && m.you === false), joined.json);

  const quiet = seedMember(3);
  const self = seedMember(4);
  if (quiet && self) {
    const names = async (who, q) => ((await who.people(q)).json?.members ?? []).map((m) => m.name);
    check("a seed member who never signed in is not listed, even by full name", !(await names(T, quiet.name)).includes(quiet.name));
    // Their exact name still links a seat to them when it is saved.
    const v = await T.view();
    const add = await T.act({ type: "add", company: hostsOf(v)[hostN++].name, newEngagement: true, engagementFields: { function: "Sales", type: "Advisory", operator: quiet.name } });
    const eng = (await T.view()).companies.flatMap((c) => c.engagements).find((e) => e.id === add.json?.id);
    check("typing their exact full name still links the seat to them", add.status === 200 && !!eng?.cells.operator?.member && eng.cells.operator.member.you === false, { status: add.status, linked: !!eng?.cells.operator?.member });
    // A sweep by two-letter prefixes finds no seed member who hasn't signed in.
    const signedIn = new Set([0, 1, 2].map((n) => seedMember(n)?.name));
    const seedNames = new Set(seedFile.members.map((m) => m.name));
    const found = new Set();
    for (const q of ["ja", "jo", "ma", "mi", "da", "ch", "an", "br", "ke", "st", "ro", "sa", "ti", "pa", "la", "al", "be", "ca", "de", "je"]) for (const n of await names(T, q)) if (seedNames.has(n) && !signedIn.has(n)) found.add(n);
    // Up to 5 allowed: seed members another test file signed in as on this same server.
    check("20 prefix searches turn up no directory of seed members", found.size <= 5, `${found.size} seed members listed`);
    // The searcher finds themselves before any visit is on file.
    const Me = new Client("Seed Member", nextIp(), self.token);
    const own = (await Me.people(self.name)).json?.members ?? [];
    check("a member always finds themselves", own.some((m) => m.name === self.name && m.you === true), own.length);
    check("until they visit, nobody else finds them", !(await names(T, self.name)).includes(self.name));
    await seedSignIn(quiet, nextIp());
    check("once a seed member signs in, they are listed", (await names(T, quiet.name)).includes(quiet.name));
  } else skip("seed member picker checks", "no seed file the server knows");

  // 30 searches a minute per member.
  const R = await member("Ray Ratelimit");
  const codes = [];
  for (let i = 0; i < 31; i++) codes.push((await R.people("una")).status);
  check("the 31st search in a minute gets 429", codes.slice(0, 30).every((c) => c === 200) && codes[30] === 429, codes.filter((c) => c !== 200).length);
  check("the limit is per member", (await U.people("theo")).status === 200);
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
