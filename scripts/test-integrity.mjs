#!/usr/bin/env node
/**
 * Checks that what members add stays honest, against a running server: a seat a member held that
 * Revenue Nomad already found is claimed instead of added twice, a person already on file is not
 * added again, "Not my seat" and "Remove this seat" take back what the member put there, example
 * company names are refused, and a person's contact details come only from a member who can see
 * who the person is.
 *
 *   BASE=http://localhost:3000 node scripts/test-integrity.mjs
 *
 * Run it against a throwaway server on a FRESH RN_DATA_DIR, started like the one for
 * scripts/test-rules.mjs (RN_STARTER_CREDITS=25). The checks that need seats from the seat scan
 * or people from our records need the private seed (data/intel-seed.json) on the server.
 *
 * Optional environment:
 *   STARTER   expected starter credits (default 25)
 *   ONLY      comma-separated sections to run (default all): claim people remove names details
 */

const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const STARTER = Number(process.env.STARTER ?? 25);
const ONLY = new Set((process.env.ONLY || "").split(",").map((x) => x.trim()).filter(Boolean));
/** A run tag in letters only: person names compare without digits. */
const RUN = Date.now().toString(36).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]);
/** A distinct client address per test client (the rightmost X-Forwarded-For entry). */
const IP_BASE = `10.${(Date.now() >> 9) & 255}.${(Date.now() >> 1) & 255}`;
let ipN = 0;
const nextIp = () => `${IP_BASE}.${++ipN}`;

let failures = 0;
let passes = 0;
const pass = (name) => (passes++, console.log(`PASS ${name}`));
const fail = (name, detail) => (failures++, console.log(`FAIL ${name}${detail === undefined ? "" : `: ${(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)}`}`));
const check = (name, ok, detail) => (ok ? pass(name) : fail(name, detail));
const skip = (name, why) => console.log(`SKIP ${name}: ${why}`);

/* ---------- http ---------- */

async function call(method, path, { token, ipAddr, body } = {}) {
  const h = {};
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
  constructor(name, ipAddr, token) {
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
  async credits() {
    return (await this.view()).me.credits;
  }
}

/** A new member. Names link seats, so each test member's name is new in this run. */
async function member(first) {
  const name = `${first} ${RUN.charAt(0).toUpperCase()}${RUN.slice(1)}`;
  const ipAddr = nextIp();
  const r = await call("POST", "/api/table", { ipAddr, body: { join: { name, email: `qa+${RUN}-${first.toLowerCase().replace(/\W+/g, "")}@example.com` } } });
  const token = (r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean) ?? null;
  if (!token) throw new Error(`join ${name} failed: ${r.status} ${r.text.slice(0, 200)}`);
  const m = new Client(name, ipAddr, token);
  await m.act({ type: "profile", function: "Sales", goal: "friendly" });
  return m;
}

/* ---------- view helpers ---------- */

const companyOf = (view, id) => view.companies.find((c) => c.id === id) ?? null;
const companyNamed = (view, name) => view.companies.find((c) => c.name === name) ?? null;
const engOf = (view, id) => {
  for (const c of view.companies) for (const e of c.engagements) if (e.id === id) return { ...e, company: c };
  return null;
};
const peopleOf = (c) => [...c.people, ...c.engagements.flatMap((e) => e.people)];
const personOf = (view, id) => {
  for (const c of view.companies) for (const p of peopleOf(c)) if (p.id === id) return { ...p, company: c };
  return null;
};
const val = (cell) => (cell?.s === "value" ? cell.v : null);
/** "2024-03" plus n months. */
const addMonths = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const used = new Set();
/**
 * A company where a member's own seat would match exactly one seat the seat scan found: visible,
 * no open role, not used by another check, and one claimable seat with a function and a start
 * month that no other seat there shares the function of. `test` narrows the seat further.
 */
function scanHost(view, test = () => true) {
  for (const c of view.companies) {
    if (c.hidden || c.friendly.open !== 0 || c.mine || used.has(c.id) || /^Qa /.test(c.name)) continue;
    // A seat the scan found with nobody named on it yet. One named from public profiles is only claimed by a name match (scripts/test-names.mts).
    const claimable = c.engagements.filter((e) => e.claimable && e.cells.operator?.s === "empty");
    if (claimable.length !== 1) continue;
    const e = claimable[0];
    const fn = val(e.cells.function);
    const start = val(e.cells.start);
    if (!fn || !/^\d{4}-\d{2}$/.test(start ?? "") || !test(e, start)) continue;
    if (c.engagements.some((x) => x.id !== e.id && val(x.cells.function) === fn)) continue;
    used.add(c.id);
    return { c, e, fn, start };
  }
  return null;
}
/** Another claimable seat anywhere, for using up the daily claims. */
function anyClaimable(view) {
  for (const c of view.companies) {
    if (c.hidden || used.has(c.id) || /^Qa /.test(c.name)) continue;
    const e = c.engagements.find((x) => x.claimable && x.cells.operator?.s === "empty");
    if (!e) continue;
    used.add(c.id);
    return { c, e };
  }
  return null;
}
const NEED_SEED = "no seat from the seat scan on the server (needs the private seed)";

/* ---------- sections ---------- */

const sections = {};
const section = (name, fn) => (sections[name] = fn);

section("claim", async () => {
  const A = await member("Ana Claimer");
  const B = await member("Bea Buyer");
  let v = await A.view();
  const h = scanHost(v);
  if (!h) return skip("claim", NEED_SEED);
  const seatsBefore = h.c.engagements.length;
  const fractionalBefore = h.c.friendly.fractional;
  // "Add a seat you held", the way the Add form sends it, for the seat the scan already has.
  const add = await A.act({
    type: "add", company: h.c.name, newEngagement: true, operatorMemberId: "me",
    engagementFields: { operator: A.name, function: h.fn, type: "Fractional", start: h.start, rate: "$9k/mo", hours: "12" },
  });
  check(
    "adding a seat the scan already found claims it instead of adding a second seat",
    add.status === 200 && add.json?.id === h.e.id && /^Your seat at .+ was already on file, so we put your name on it and added your answers\. You earned 2 credits\. 3 facts were already there, so we left them as they were\.$/.test(add.json?.message ?? ""),
    add.json,
  );
  v = await A.view();
  let c = companyOf(v, h.c.id);
  let e = engOf(v, h.e.id);
  check("the company still has the same seats, and the same fractional hires", c?.engagements.length === seatsBefore && c.friendly.fractional === fractionalBefore, { seats: [seatsBefore, c?.engagements.length], fractional: [fractionalBefore, c?.friendly.fractional] });
  check("the seat is theirs now: their name on it, claimed, on Your seats", !!e?.yours && !e.claimable && e.cells.operator?.v === A.name && e.cells.operator.claimed === true && e.cells.rate?.v === "$9k/mo", e && { yours: e.yours, op: e.cells.operator });
  check("only the facts that were missing earned: the rate and the hours", v.me.credits === STARTER + 2, v.me.credits);
  const eb = engOf(await B.view(), h.e.id);
  check("another member sees it claimed: the name and the rate behind locks, not claimable", eb?.cells.operator?.s === "locked" && eb.cells.rate?.s === "locked" && !eb.claimable, eb && { op: eb.cells.operator?.s, claimable: eb.claimable });

  // The same Add from another member now makes their own seat: nobody else's claim is taken over.
  const again = await B.act({ type: "add", company: h.c.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: B.name, function: h.fn, start: h.start } });
  check("a seat someone already claimed is never claimed again by an Add", again.status === 200 && again.json?.id !== h.e.id && /^Added a seat at /.test(again.json?.message ?? ""), again.json);

  // Not the same seat: a start more than three months away, a full-time job, another function.
  const C = await member("Cal Careful");
  const far = scanHost(await C.view(), (_, start) => start >= "2019-01");
  if (far) {
    const r = await C.act({ type: "add", company: far.c.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: C.name, function: far.fn, start: addMonths(far.start, -14) } });
    check("a start more than three months from the scan's makes its own seat", r.status === 200 && r.json?.id !== far.e.id && !!engOf(await C.view(), far.e.id)?.claimable, r.json);
  } else skip("a far start", NEED_SEED);
  const ft = scanHost(await C.view());
  if (ft) {
    const r = await C.act({ type: "add", company: ft.c.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: C.name, function: ft.fn, type: "Full-time", start: ft.start } });
    check("a full-time job is not the fractional seat the scan found", r.status === 200 && r.json?.id !== ft.e.id && !!engOf(await C.view(), ft.e.id)?.claimable, r.json);
  } else skip("a full-time job", NEED_SEED);
  const other = scanHost(await C.view(), (x) => val(x.cells.function) !== "Legal");
  if (other) {
    const r = await C.act({ type: "add", company: other.c.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: C.name, function: "Legal", start: other.start } });
    check("a seat in another function makes its own seat", r.status === 200 && r.json?.id !== other.e.id && !!engOf(await C.view(), other.e.id)?.claimable, r.json);
  } else skip("another function", NEED_SEED);
  const old = scanHost(await C.view(), (_, start) => start >= "2023-01");
  if (old) {
    const r = await C.act({ type: "add", company: old.c.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: C.name, function: old.fn, status: "Ended", end: addMonths(old.start, -12) } });
    check("a seat that ended a year before the scan's started is its own seat", r.status === 200 && r.json?.id !== old.e.id && !!engOf(await C.view(), old.e.id)?.claimable, r.json);
  } else skip("an earlier seat", NEED_SEED);
  // "Not me" on a seat the scan found ("Is this you?"): an Add of theirs never claims it after that.
  const nm = scanHost(await C.view());
  if (nm) {
    const no = await C.act({ type: "notMine", engagementId: nm.e.id });
    const r = await C.act({ type: "add", company: nm.c.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: C.name, function: nm.fn, start: nm.start } });
    check("after Not me on a seat the scan found, a matching Add makes its own seat", no.status === 200 && r.status === 200 && r.json?.id !== nm.e.id && !!engOf(await C.view(), nm.e.id)?.claimable, [no.json?.message, r.json]);
    const back = await C.act({ type: "claimSeat", engagementId: nm.e.id });
    check("and the member can still claim it themselves", back.status === 200 && !!engOf(await C.view(), nm.e.id)?.yours, back.json);
  } else skip("Not me on a seat the scan found", NEED_SEED);

  // A seat that has ended: a dated end with no status ends it, and what differs from the scan corrects it (for no credit).
  const D = await member("Dee Ended");
  const ended = scanHost(await D.view(), (_, start) => start <= "2025-12");
  if (!ended) return skip("an ended seat", NEED_SEED);
  const end = addMonths(ended.start, 3);
  const d0 = await D.credits();
  const dAdd = await D.act({ type: "add", company: ended.c.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: D.name, function: ended.fn, start: ended.start, end } });
  const de = engOf(await D.view(), ended.e.id);
  check(
    "claiming with a dated end ends the seat, corrected for no credit",
    dAdd.status === 200 && dAdd.json?.id === ended.e.id && de?.cells.status?.v === "Ended" && de.cells.end?.v === end && (await D.credits()) === d0,
    { add: dAdd.json, status: de?.cells.status, end: de?.cells.end },
  );

  // "Not my seat" on a claimed seat puts it back as the scan had it.
  const dNot = await D.act({ type: "notMine", engagementId: ended.e.id });
  const dv = await D.view();
  const back = engOf(dv, ended.e.id);
  check(
    "Not my seat takes the name off, and what the scan said comes back",
    dNot.status === 200 && /^Got it\. That seat is no longer linked to you\. Your name is off it\. What you added to it came off too\.$/.test(dNot.json?.message ?? "") && !!back?.claimable && back.cells.status?.v === "Active" && back.cells.end?.s !== "empty" && !back.yours,
    { message: dNot.json?.message, status: back?.cells.status, end: back?.cells.end?.s },
  );

  // A's claimed seat: B pays to see the rate, then A gives the seat back.
  const bUn = await B.act({ type: "unlock", entity: "engagement", id: h.e.id, field: "rate" });
  const b0 = await B.credits();
  const aNot = await A.act({ type: "notMine", engagementId: h.e.id });
  v = await A.view();
  e = engOf(v, h.e.id);
  check(
    "Not my seat takes back what they added there, with the credits it earned",
    bUn.status === 200 && aNot.status === 200 && /^Got it\. That seat is no longer linked to you\. Your name is off it\. What you added to it came off too\. The 2 credits it earned came off your balance\.$/.test(aNot.json?.message ?? "") && v.me.credits === STARTER,
    { unlock: bUn.json?.message, message: aNot.json?.message, credits: v.me.credits },
  );
  check("the seat is claimable again, with no rate or hours on it", !!e?.claimable && !e.yours && e.cells.operator?.s === "empty" && e.cells.rate?.s === "empty" && e.cells.hours?.s === "empty", e && { op: e.cells.operator, rate: e.cells.rate, hours: e.cells.hours });
  check("the member who paid to see the rate gets the credit back", (await B.credits()) === b0 + 1);
  check("the credit history says what was taken back", v.ledger.some((l) => /^Took back /.test(l.reason) && l.delta < 0), v.ledger.slice(0, 6).map((l) => [l.reason, l.delta]));

  // Three claims a day, Add included: the fourth is refused before anything is saved.
  const E = await member("Eli Eager");
  const ev = await E.view();
  const picks = [anyClaimable(ev), anyClaimable(ev)];
  for (const p of picks) if (p) await E.act({ type: "claimSeat", engagementId: p.e.id });
  const h3 = scanHost(ev);
  const h4 = scanHost(ev);
  if (!h3 || !h4 || picks.some((p) => !p)) return skip("the claim limit", NEED_SEED);
  const third = await E.act({ type: "add", company: h3.c.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: E.name, function: h3.fn } });
  const fourth = await E.act({ type: "add", company: h4.c.name, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: E.name, function: h4.fn, hours: "10" } });
  check("an Add that claims counts toward the 3 claims a day", third.status === 200 && third.json?.id === h3.e.id, third.json);
  check(
    "a fourth claim through Add is refused, and nothing is added",
    fourth.status === 400 && /^We have this seat on file already, so adding it claims it\. You can claim 3 seats in 24 hours, so add it tomorrow\.$/.test(fourth.json?.error ?? "") && !!engOf(await E.view(), h4.e.id)?.claimable && companyOf(await E.view(), h4.c.id)?.engagements.length === h4.c.engagements.length,
    fourth.json,
  );
});

section("people", async () => {
  const A = await member("Ari Adder");
  const B = await member("Bo Second");
  const C = await member("Cy Third");
  const D = await member("Di Fourth");
  const coName = `Qa People Co ${RUN}`;
  const N = `Morgan Ellery${RUN}`;
  const add = await A.act({ type: "add", company: coName, companyFields: { industry: "SaaS" }, people: [{ name: N, title: "VP Marketing", relationship: "Hiring for the seat" }] });
  if (add.status !== 200) return fail("people: add a company with a person", add.json);
  const co = companyNamed(await A.view(), coName);
  const pid = co?.people[0]?.id;
  check("the first add earns for each answer", (await A.credits()) === STARTER + 4);

  // The same member, the same name again (any case or spacing): refused.
  const rep = await A.act({ type: "addPerson", companyId: co.id, person: { name: `  ${N.toUpperCase()} `, title: "CMO" } });
  check("adding the same person again is refused", rep.status === 400 && rep.json?.error === `You already added ${N.toUpperCase()} here.`, rep.json);
  const repAdd = await A.act({ type: "add", company: coName, people: [{ name: N.toLowerCase() }] });
  check("through Add as well", repAdd.status === 400 && /^You already added /.test(repAdd.json?.error ?? ""), repAdd.json);
  check("and nothing was earned or added", (await A.credits()) === STARTER + 4 && peopleOf(companyNamed(await A.view(), coName)).length === 1);

  // Another member who knows them: what's empty goes onto the person on file, and it counts as a confirmation.
  // (B and C unlock the company first: every company is locked for a member until they unlock it or know it.)
  const PRICE = 2;
  for (const who of [B, C]) await who.act({ type: "unlock", entity: "company", id: co.id, field: "identity" });
  const bp = await B.act({ type: "addPerson", companyId: co.id, person: { name: N.toLowerCase(), title: "VP Marketing", email: "morgan.ellery@example.com" } });
  const bView = await B.view();
  const bPerson = personOf(bView, pid);
  check(
    "another member adding the same name adds to the person on file",
    bp.status === 200 && bp.json?.id === pid && /^.+ was already on file at .+, so we added what you know to that record\. It counts as a confirmation too\. You earned 1 credit\. 1 detail was already there, so we left it as it was\.$/.test(bp.json?.message ?? ""),
    bp.json,
  );
  check("only the empty field earned, and there is still one person", bView.me.credits === STARTER + 1 - PRICE && peopleOf(companyNamed(bView, coName)).length === 1, { credits: bView.me.credits, people: peopleOf(companyNamed(bView, coName)).length });
  check("their email shows to them, and the name and title stay locked", bPerson?.cells.email?.v === "morgan.ellery@example.com" && bPerson.cells.name?.s === "locked" && bPerson.cells.title?.s === "locked", bPerson?.cells);
  const aName = personOf(await A.view(), pid)?.cells.name;
  check("the name shows one confirmation", aName?.s === "value" && aName.ver === 1, aName);

  // A third member with nothing new: a confirmation only, and the second one pays the author.
  const cp = await C.act({ type: "addPerson", companyId: co.id, person: { name: N } });
  check("a third member with nothing new adds nothing and earns nothing", cp.status === 200 && cp.json?.message === `${N} is already on file at ${coName}. Nothing new was added. It counts as a confirmation of their name.` && (await C.credits()) === STARTER - PRICE, cp.json);
  check("two members confirming the name pays the author the confirmation credit", (await A.credits()) === STARTER + 5 && personOf(await A.view(), pid)?.cells.name?.ver === 2);
  const cp2 = await C.act({ type: "addPerson", companyId: co.id, person: { name: N } });
  check("adding them again does not confirm twice", cp2.status === 200 && personOf(await A.view(), pid)?.cells.name?.ver === 2 && (await A.credits()) === STARTER + 5, cp2.json);

  // Through Add, with a seat: the person on file gets the phone.
  const dAdd = await D.act({ type: "add", company: coName, people: [{ name: N, phone: "+1 555 010 0000" }] });
  check("Add with a person already on file says so and adds what's new", dAdd.status === 200 && new RegExp(`${N} was already on file there, so we added what you know to that record\\.`).test(dAdd.json?.message ?? "") && (await D.credits()) === STARTER + 1, dAdd.json);
  check("still one person", peopleOf(companyNamed(await D.view(), coName)).length === 1);

  // Two people with one name in the same Add: the second is a repeat.
  const twice = await D.act({ type: "add", company: coName, people: [{ name: "Lee Twice" }, { name: "lee  twice" }] });
  check("the same name twice in one Add is refused", twice.status === 400 && twice.json?.error === "You already added lee twice here.", twice.json);
  check("and the whole Add is left out", !peopleOf(companyNamed(await D.view(), coName)).some((p) => /twice/i.test(val(p.cells.name) ?? "")) && (await D.credits()) === STARTER + 1);

  // The same name at another company is another person.
  const other = await A.act({ type: "add", company: `Qa People Two ${RUN}`, people: [{ name: N }] });
  check("the same name at another company is a new person", other.status === 200 && /^Added Qa People Two /.test(other.json?.message ?? ""), other.json);
});

section("remove", async () => {
  const A = await member("Ada Remover");
  const B = await member("Ben Payer");
  const C = await member("Cara Person");
  const coName = `Qa Remove Co ${RUN}`;
  const add = await A.act({
    type: "add", company: coName, newEngagement: true, operatorMemberId: "me",
    engagementFields: { operator: A.name, function: "Sales", type: "Fractional", start: "2024-01", end: "2024-09", rate: "$9k/mo", sourced: "Referral" },
  });
  const sid = add.json?.id;
  if (add.status !== 200 || !sid) return fail("remove: add a seat", add.json);
  const a1 = await A.credits();
  check("the seat earned for each answer", a1 > STARTER, a1);
  // B and C unlock the company first: it is locked for them.
  const co = companyNamed(await A.view(), coName);
  for (const who of [B, C]) await who.act({ type: "unlock", entity: "company", id: co.id, field: "identity" });
  const bUn = await B.act({ type: "unlock", entity: "engagement", id: sid, field: "rate" });
  const b1 = await B.credits();
  const cP = await C.act({ type: "addPerson", companyId: co.id, engagementId: sid, person: { name: `Rob Reporter${RUN}`, relationship: "Reported to" } });
  const aP = await A.act({ type: "addPerson", companyId: co.id, engagementId: sid, person: { name: `Pat Boss${RUN}`, title: "CEO" } });
  const a2 = await A.credits();
  const rm = await A.act({ type: "notMine", engagementId: sid });
  const av = await A.view();
  check(
    "Remove this seat removes it and takes back what it earned",
    bUn.status === 200 && cP.status === 200 && aP.status === 200 && rm.status === 200 && rm.json?.message === `Removed that seat. What you added to it came off too. The ${a1 - STARTER} credits it earned came off your balance.` && av.me.credits === a2 - (a1 - STARTER),
    { message: rm.json?.message, credits: [a1, a2, av.me.credits] },
  );
  check("the seat is gone for everyone", !engOf(av, sid) && !engOf(await B.view(), sid));
  check("the member who paid to see its rate gets the credit back", (await B.credits()) === b1 + 1);
  const left = companyNamed(av, coName);
  check("the people on it stay, on the company", !!left && left.people.some((p) => p.id === cP.json?.id) && left.people.some((p) => p.id === aP.json?.id) && left.engagements.length === 0, left && { people: left.people.length, seats: left.engagements.length });
  check("their history says what came back", av.ledger.filter((l) => /^Took back /.test(l.reason)).length >= 5, av.ledger.slice(0, 8).map((l) => l.reason));
  check("Remove this seat again finds nothing", (await A.act({ type: "notMine", engagementId: sid })).status === 400);

  // A company they made only for that seat goes with it.
  const lone = `Qa Lone Co ${RUN}`;
  const l1 = await A.act({ type: "add", company: lone, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: A.name, function: "Marketing" } });
  const l2 = await A.act({ type: "notMine", engagementId: l1.json?.id });
  check("an empty company they made for the seat goes too", l1.status === 200 && l2.status === 200 && !companyNamed(await A.view(), lone) && !companyNamed(await B.view(), lone), l2.json);

  // A private rate they shared for the seat goes too, with its credit.
  const priv = await A.act({ type: "add", company: `Qa Private Co ${RUN}`, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: A.name, function: "RevOps", role: "Fractional RevOps Lead" } });
  const bench = await A.act({ type: "benchRate", engagementId: priv.json?.id, pricing: "Monthly retainer", rate: "$7k/mo" });
  const p0 = await A.credits();
  const pRm = await A.act({ type: "notMine", engagementId: priv.json?.id });
  const pv = await A.view();
  check("the private rate shared for it comes out of the benchmarks, with its credit", bench.status === 200 && pRm.status === 200 && !pv.me.benchRates.some((r) => r.engagementId === priv.json?.id) && pv.me.credits === p0 - 4, { bench: bench.json?.message, rm: pRm.json?.message, credits: [p0, pv.me.credits] });
});

section("names", async () => {
  const A = await member("Ann Namer");
  const REFUSED = "That reads like an example name, not a real company. Type the name the company goes by.";
  for (const company of ["Acme", "ACME Inc.", "Test", "Test Company 2", "Example", "Example.com", "Your client", "Company name", "Demo Co", "Lorem Ipsum", "Sample"]) {
    const r = await A.act({ type: "add", company, newEngagement: true, operatorMemberId: "me", engagementFields: { operator: A.name, function: "Marketing", role: "Fractional CMO" } });
    check(`"${company}" is refused as a company name`, r.status === 400 && r.json?.error === REFUSED, r.json);
  }
  const hidden = await A.act({ type: "add", company: "Locked company", companyFields: { industry: "SaaS" } });
  check("our locked-company placeholder keeps its own answer", hidden.status === 400 && /placeholder for a company you haven't unlocked/.test(hidden.json?.error ?? ""), hidden.json);
  const plain = await A.act({ type: "add", company: "Example", companyFields: { industry: "SaaS" } });
  check("an example name is refused for a company alone too", plain.status === 400 && plain.json?.error === REFUSED, plain.json);
  const v = await A.view();
  check("nothing was added and nothing earned", v.me.credits === STARTER && !v.companies.some((c) => /^(acme|test|example|your client|company name|demo co|lorem ipsum|sample)/i.test(c.name) && c.mine), v.me.credits);
  const real = await A.act({ type: "add", company: `Acme Robotics Qa ${RUN}`, companyFields: { industry: "SaaS" } });
  check("a real name that starts like one is fine", real.status === 200, real.json);
});

section("details", async () => {
  const F = await member("Fay Fresh");
  const v = await F.view();
  // A person from our records whose name is locked for this member and whose email is empty.
  // (At a company she unlocks first, for 2 credits: every company is locked for a new member.)
  let target = null;
  for (const c of v.companies) {
    target = peopleOf(c).find((p) => p.cells.name?.s === "locked" && p.cells.email?.s === "empty" && p.cells.phone?.s === "empty");
    if (target) {
      if (c.hidden) await F.act({ type: "unlock", entity: "company", id: c.id, field: "identity" });
      break;
    }
  }
  const f0 = await F.credits();
  const NAME_FIRST = "Unlock their name and title first. Then you can add what you know about them.";
  if (target) {
    const tries = await Promise.all(
      [["email", "someone@example.com"], ["phone", "+1 555 010 0000"], ["linkedin", "linkedin.com/in/someone-qa"]].map(([field, value]) => F.act({ type: "fill", entity: "contact", id: target.id, field, value })),
    );
    check("an email, phone or LinkedIn for a person whose name is locked is refused", tries.every((r) => r.status === 400 && r.json?.error === NAME_FIRST), tries.map((r) => r.json));
    if (target.cells.title?.s === "empty") {
      const t = await F.act({ type: "fill", entity: "contact", id: target.id, field: "title", value: "CFO" });
      check("so is their title", t.status === 400 && t.json?.error === NAME_FIRST, t.json);
    }
    check("and nothing was earned", (await F.credits()) === f0);
    const un = await F.act({ type: "unlock", entity: "contact", id: target.id, field: "name" });
    const fill = await F.act({ type: "fill", entity: "contact", id: target.id, field: "email", value: "someone@example.com" });
    check("once they unlock the name, they can add the email and earn for it", un.status === 200 && fill.status === 200 && (await F.credits()) === f0, [un.json?.message, fill.json?.message]);
  } else skip("a person from our records", "no locked person with an empty email (needs the private seed)");

  // A person the member added: theirs to fill in. With their name taken back, nobody can add details.
  const coName = `Qa Details Co ${RUN}`;
  const add = await F.act({ type: "add", company: coName, people: [{ name: `Una Named${RUN}` }] });
  const p = companyNamed(await F.view(), coName)?.people[0];
  const own = await F.act({ type: "fill", entity: "contact", id: p?.id, field: "title", value: "COO" });
  check("a member adds details to a person they added", add.status === 200 && own.status === 200, own.json);
  const G = await member("Gus Guess");
  // Gus unlocks her company first: it is locked for him.
  await G.act({ type: "unlock", entity: "company", id: companyNamed(await F.view(), coName)?.id, field: "identity" });
  const blind = await G.act({ type: "fill", entity: "contact", id: p?.id, field: "email", value: "una@example.com" });
  const rel = await G.act({ type: "fill", entity: "contact", id: p?.id, field: "relationship", value: "Decision maker" });
  check("another member can't add their email without the name", blind.status === 400 && blind.json?.error === NAME_FIRST, blind.json);
  check("their relationship to the seat or company is free to add, as before", rel.status === 200, rel.json);
  const back = await F.act({ type: "retract", entity: "contact", id: p?.id, field: "name" });
  const nameless = await F.act({ type: "fill", entity: "contact", id: p?.id, field: "email", value: "una@example.com" });
  check("a person with no name takes no details", back.status === 200 && nameless.status === 400 && nameless.json?.error === "Add their name first. Then you can add what you know about them.", [back.json, nameless.json]);
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
