#!/usr/bin/env node
/**
 * Checks of the rate benchmarks and of rates shared for the benchmarks only.
 *
 *   npx tsx scripts/test-bench.mjs
 *
 * No server and no private data. It writes a made-up seed and a made-up state (a few accounts
 * that joined 6 and 8 days ago) into a scratch folder, points lib/table.ts at them and calls
 * buildView() and perform() directly. The folder is removed at the end.
 *
 * What it covers:
 *  - a benchmark figure counts people, not rows, so one account can't fill or pad a group
 *  - only contributors who count are in a figure: Rate Index rows, our own records, seed members,
 *    and joined accounts two members vouched for (a confirmed fact). Age alone is no proof.
 *  - a member's own rates are left out of what that member sees, so swapping them moves nothing
 *    they can read, and figures under 10 contributors are rounded wider
 *  - a group with a few survey rows shows from member rates alone at 5
 *  - numbers are rounded ($250 and $5, or $1,000 and $25 under 10), and the range is sent only at 10
 *  - a rate on a made-up blank seat counts as not tied to a seat, at most 5 saves a day
 *  - the audit's attacks (one padding account, throwaway accounts, one account making a group)
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 500)}`);
}

/* ---------- a made-up seed and state ---------- */

const DAY = 24 * 60 * 60 * 1000;
const dir = mkdtempSync(path.join(tmpdir(), "tp-bench-"));
const dataDir = path.join(dir, "data");
mkdirSync(dataDir);

const two = (i) => String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
const seedMembers = Array.from({ length: 60 }, (_, i) => ({
  id: `m_seed${i + 1}`, name: `Sami Seed${two(i)}`, email: `seed${i + 1}@bench.example`, title: "Fractional leader", token: `seed-token-${i + 1}`,
}));
const ADMIN_EMAIL = "admin@bench.example";
seedMembers[59].email = ADMIN_EMAIL;
const OWNER = seedMembers[39]; // holds four seats in the seed
const span = (n, from, step) => Array.from({ length: n }, (_, i) => from + i * step);
const index = (fn, revenue, hourlies, hours = null) => hourlies.map((hourly) => ({ fn, hourly, hours, revenue }));
const SURVEY = {
  sales: span(22, 100, 10), // already past 20
  marketing: span(19, 100, 10), // one short of 20, with hours a month
  revops: span(15, 300, 10),
  cs: [900, 950], // a couple of survey rows
  partnerships: [333], // one survey row
};
const seed = {
  builtAt: new Date(Date.now() - 30 * DAY).toISOString(),
  members: seedMembers,
  companies: [
    { id: "c_ownseats", fields: { name: "Own Seats Test Co", revenue: "Under $1M" } },
    { id: "c_records", fields: { name: "Our Records Test Co", revenue: "$50M+" } },
  ],
  engagements: [
    ...[1, 2, 3, 4].map((i) => ({
      id: `e_own${i}`, companyId: "c_ownseats",
      fields: { source: "Published engagement", function: "AI GTM", type: "Fractional", role: `Fractional AI GTM lead ${i}`, operator: OWNER.name, status: "Ended" },
    })),
    { id: "e_foreign", companyId: "c_ownseats", fields: { source: "Published engagement", function: "AI GTM", type: "Fractional", role: "Fractional advisor", operator: "Someone Else Entirely" } },
    // Five rates from our own records: each record is one trusted contributor.
    ...["$6k/mo", "$7k/mo", "$8,100/mo", "$9k/mo", "$10k/mo"].map((rate, i) => ({
      id: `e_rec${i + 1}`, companyId: "c_records",
      fields: { source: "Published engagement", function: "Product Marketing", type: "Fractional", role: "Fractional PMM", operator: `Nobody Here${two(i)}`, rate, pricing: "Monthly retainer" },
    })),
  ],
  contacts: [],
  rateIndex: [
    ...index("Sales", "$1M–$5M", SURVEY.sales),
    ...index("Marketing", "$5M–$20M", SURVEY.marketing, 40),
    ...index("RevOps", "$20M–$50M", SURVEY.revops),
    ...index("Customer Success", "$1M–$5M", SURVEY.cs),
    ...index("Partnerships", "$20M–$50M", SURVEY.partnerships),
  ],
};
writeFileSync(path.join(dir, "seed.json"), JSON.stringify(seed));
const aged = (id, days) => ({ id, name: `Aged ${id}`, email: `${id}@bench.example`, title: "Member", token: `token-${id}`, at: new Date(Date.now() - days * DAY).toISOString(), ipHash: id });
// Every state on file holds a ledger and the values (a file without them is not a state).
const AGED = ["j_aged1", "j_aged2", "j_aged3", "j_aged4"];
writeFileSync(
  path.join(dataDir, "intel.json"),
  JSON.stringify({ members: [aged("j_eightdays", 8), aged("j_sixdays", 6), ...AGED.map((id) => aged(id, 8))], ledger: [], values: {}, flags: { starterFloor: 25 } }),
);

Object.assign(process.env, { RN_DATA_DIR: dataDir, RN_INTEL_SEED: path.join(dir, "seed.json"), RN_STARTER_CREDITS: "25", RN_ADMIN_EMAILS: ADMIN_EMAIL, RN_LOGO_LOOKUP: "off" });
for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_BACKUP_S3_ENDPOINT", "RN_INTEL_SEED_KEY", "RN_INTEL_SEED_B64"]) delete process.env[k];

const table = await import("../lib/table.ts");

/* ---------- helpers ---------- */

const S = (n) => seedMembers[n - 1].token;
const EIGHT_DAYS = "token-j_eightdays";
const SIX_DAYS = "token-j_sixdays";
let joined = 0;
/** A brand-new account (joined just now, so not trusted yet). */
async function fresh() {
  joined++;
  const m = await table.joinMember(`Nina New${two(joined)}`, `new${joined}@bench.example`, undefined, `10.9.0.${joined}`);
  return m.token;
}
async function act(token, action) {
  try {
    return { ok: true, ...(await table.perform(token, action)) };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
const view = (token) => table.buildView(token);
const rowOf = (v, fn, revenue) => v.benchmarks.rows.find((r) => r.function === fn && r.revenue === revenue);
const stat = async (token, fn, revenue, kind) => rowOf(await view(token), fn, revenue)[kind];
const share = (token, fn, revenue, rate, pricing = /hr/.test(rate) ? "Hourly" : "Monthly retainer") =>
  act(token, { type: "benchRate", function: fn, revenue, pricing, rate });
const shown = (s) => s.median !== undefined;
const quant = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
};
const near = (x, unit) => Math.round(x / unit) * unit;
/** The rounding a figure with n contributors gets. */
const unitFor = (kind, n) => (n < 10 ? (kind === "monthly" ? 1000 : 25) : kind === "monthly" ? 250 : 5);
/** Every number a benchmarks block sends, to look for a rate that should not be there. */
const numbersIn = (b) => b.rows.flatMap((r) => [r.monthly, r.hourly]).flatMap((s) => [s.median, s.p25, s.p75]).filter((x) => x !== undefined);
const ONLOOKER = S(50);
/** A made-up company with one seat, as the attack scripts made them. Returns the seat's id. */
let made = 0;
async function madeUpSeat(token, fn, revenue, extra = {}, top = {}) {
  made++;
  const r = await act(token, { type: "add", company: `Zz Made Up Co ${two(made)}`, newEngagement: true, companyFields: { revenue }, engagementFields: { function: fn, ...extra }, ...top });
  return r.ok ? r.id : null;
}

/* ---------- day one: what the seed alone shows ---------- */

{
  const v = await view(ONLOOKER);
  const b = v.benchmarks;
  check("the benchmarks say when the range shows (rangeN 10) and keep minN 5", b.rangeN === 10 && b.minN === 5, { rangeN: b.rangeN, minN: b.minN });
  const sales = rowOf(v, "Sales", "$1M–$5M").hourly;
  check(
    "a survey group past 20 shows a rounded median and range and says it includes Rate Index data",
    sales.n === 22 && sales.min === 20 && sales.indexed === true && sales.median === near(quant(SURVEY.sales, 0.5), 5) && sales.p25 === near(quant(SURVEY.sales, 0.25), 5) && sales.p75 === near(quant(SURVEY.sales, 0.75), 5),
    sales,
  );
  const mk = rowOf(v, "Marketing", "$5M–$20M");
  check("a survey group at 19 counts toward 20 and shows nothing", mk.hourly.n === 19 && mk.hourly.min === 20 && mk.hourly.indexed === true && !shown(mk.hourly) && mk.indexed === true, mk);
  check("a survey row with hours a month counts once in the monthly figure too", mk.monthly.n === 19 && mk.monthly.min === 20 && !shown(mk.monthly), mk.monthly);
  const cs = rowOf(v, "Customer Success", "$1M–$5M");
  check(
    "a group with 2 survey rows needs 5 member rates, not 18 more (LOGIC-12)",
    cs.hourly.n === 0 && cs.hourly.min === 5 && cs.hourly.indexed === false && cs.indexed === false && !shown(cs.hourly),
    cs,
  );
  const pm = rowOf(v, "Product Marketing", "$50M+").monthly;
  check("five of our own records are five contributors, and under 10 the median is rounded to $1,000", pm.n === 5 && pm.min === 5 && pm.median === 8000 && pm.indexed === false, pm);
  check("under 10 contributors the range is left out", !("p25" in pm) && !("p75" in pm), pm);
}

/* ---------- ECON-3: one account pads a group around one private rate ---------- */

{
  const FN = "Customer Success";
  const REV = "$50M+";
  const victim = S(1);
  const attacker = S(2);
  const told = await share(victim, FN, REV, "$7,350/mo");
  check(
    "the answer to a shared rate no longer says nobody sees it",
    told.ok && told.message.startsWith("Added to the benchmarks. Your rate is never shown with your name or the seat.") && !/Nobody sees/.test(told.message),
    told,
  );
  check("a seed member's answer has no note about new accounts", told.ok && !/7 days/.test(told.message), told.message);
  const pads = [];
  for (const rate of ["$1,000/mo", "$1,000/mo", "$150,000/mo"]) pads.push(await share(attacker, FN, REV, rate));
  check("three rates not tied to a seat are accepted, each for 1 credit", pads.every((r) => r.ok) && pads[2].me.credits === 28, pads.map((r) => r.error ?? r.me.credits));
  const fourth = await share(attacker, FN, REV, "$150,000/mo");
  check("a fourth is refused", !fourth.ok && /3 rates that aren't tied to a seat\. Remove one/.test(fourth.error), fourth);
  const blank = await madeUpSeat(attacker, FN, REV);
  const onBlank = await act(attacker, { type: "benchRate", engagementId: blank, pricing: "Monthly retainer", rate: "$150,000/mo" });
  check(
    "a rate on a blank seat the member made up counts as not tied to a seat (ECON-4)",
    !!blank && !onBlank.ok && /3 rates that aren't tied to a seat you held/.test(onBlank.error) && /role/.test(onBlank.error),
    onBlank,
  );
  // The same padding with rates on records: made-up seats with a public rate each.
  for (const rate of ["$150,000/mo", "$150,000/mo", "$1,000/mo"]) await madeUpSeat(attacker, FN, REV, { rate, pricing: "Monthly retainer" });
  const g = await stat(ONLOOKER, FN, REV, "monthly");
  check("one account's six rates in a group count as one contributor (ECON-3, LOGIC-4)", g.n === 2 && g.min === 5, g);
  check("the padded group shows no number", !shown(g) && g.p25 === undefined && g.p75 === undefined, g);
  const mine = await stat(attacker, FN, REV, "monthly");
  check("the attacker sees the group without their own rates, and is told so", mine.n === 1 && mine.withoutYours === true && !shown(mine), mine);
  check("the victim's rate is nowhere in the attacker's benchmarks", !numbersIn((await view(attacker)).benchmarks).includes(7350));
  const all = await stat(ONLOOKER, FN, "All", "monthly");
  check("the function's All row counts the same two people", all.n === 2 && !shown(all), all);
}

/* ---------- ECON-3, second form: three honest members, one account adds a low and a high ---------- */

{
  const FN = "Enablement";
  const REV = "$20M–$50M";
  await share(S(3), FN, REV, "$6,100/mo");
  await share(S(4), FN, REV, "$9,900/mo");
  await share(S(5), FN, REV, "$12,750/mo");
  await share(S(6), FN, REV, "$1,000/mo");
  await share(S(6), FN, REV, "$150,000/mo");
  const g = await stat(ONLOOKER, FN, REV, "monthly");
  check("three honest rates and one account's low and high are four people, so nothing shows", g.n === 4 && !shown(g), g);
  await share(S(7), FN, REV, "$8,000/mo");
  const g5 = await stat(ONLOOKER, FN, REV, "monthly");
  check("with a fifth member the group shows a median only, rounded to $1,000 under 10", g5.n === 5 && g5.median === 10000 && !("p25" in g5) && !("p75" in g5), g5);
  const theirs = await stat(S(6), FN, REV, "monthly");
  check("the member with the low and the high still sees four people and no number", theirs.n === 4 && !shown(theirs) && theirs.withoutYours === true, theirs);
}

/* ---------- LEAK-1: a new account pads with rates on throwaway seats ---------- */

{
  const FN = "Customer Success";
  const REV = "$5M–$20M";
  const victim = S(8);
  await share(victim, FN, REV, "$237/hr");
  const attacker = await fresh();
  const out = [];
  for (const amount of [25, 25, 1500, 1500]) {
    const seat = await madeUpSeat(attacker, FN, REV);
    out.push(await act(attacker, { type: "benchRate", engagementId: seat, pricing: "Hourly", rate: `$${amount}/hr` }));
  }
  check("a new account is told when its rate starts to count", out[0].ok && / Your rate counts in the benchmarks once two members confirm a fact you added\.$/.test(out[0].message), out[0]);
  check("the fourth throwaway seat is refused", out.slice(0, 3).every((r) => r.ok) && !out[3].ok, out.map((r) => r.ok));
  const g = await stat(attacker, FN, REV, "hourly");
  check("a new account's pads don't count toward the floor, so the group stays at 1 and shows nothing (LEAK-1)", g.n === 1 && g.min === 5 && !shown(g), g);
  check("the victim's hourly rate is nowhere in the attacker's benchmarks", !numbersIn((await view(attacker)).benchmarks).includes(237));
}

/* ---------- LEAK-1: one new account against a group with a single survey row ---------- */

{
  const FN = "Partnerships";
  const REV = "$20M–$50M";
  const attacker = await fresh();
  let ok = 0;
  for (let i = 0; i < 20; i++) if (await madeUpSeat(attacker, FN, REV, { rate: `$${i < 10 ? 25 : 1500}/hr`, pricing: "Hourly" })) ok++;
  const g = await stat(attacker, FN, REV, "hourly");
  check("20 rates from one new account don't lift a one-row survey group to its floor", ok === 20 && !shown(g) && g.n === 0 && g.min === 5, { ok, g });
  check("the survey respondent's rate is not sent", !numbersIn((await view(attacker)).benchmarks).includes(SURVEY.partnerships[0]));
}

/* ---------- LEAK-1: four throwaway accounts around one member ---------- */

{
  const FN = "Enablement";
  const REV = "Under $1M";
  await share(S(9), FN, REV, "$9,260/mo");
  let last = null;
  for (const amount of [1000, 1000, 150000, 150000]) {
    last = await fresh();
    await share(last, FN, REV, `$${amount}/mo`);
  }
  const g = await stat(last, FN, REV, "monthly");
  check("four throwaway accounts and one member are not a group of five (LEAK-1)", g.n === 1 && !shown(g), g);
}

/* ---------- ECON-4: one account can't make a published group alone ---------- */

{
  const FN = "Executive";
  const REV = "Pre-revenue";
  const me = S(10);
  for (const rate of ["$50/hr", "$51/hr", "$52/hr"]) await share(me, FN, REV, rate);
  let refused = 0;
  for (let i = 0; i < 4; i++) {
    const seat = await madeUpSeat(me, FN, REV);
    const r = await act(me, { type: "benchRate", engagementId: seat, pricing: "Hourly", rate: `$${60 + i}/hr` });
    if (!r.ok) refused++;
  }
  const v = await view(me);
  check("rates on made-up blank seats are refused past the 3 (ECON-4)", refused === 4 && v.me.benchRates.length === 3, { refused, mine: v.me.benchRates.length });
  const o = await view(ONLOOKER);
  check("one account is one contributor in its group and in the All row", rowOf(o, FN, REV).hourly.n === 1 && rowOf(o, FN, "All").hourly.n === 1, [rowOf(o, FN, REV).hourly, rowOf(o, FN, "All").hourly]);
  check("one account alone publishes nothing", !shown(rowOf(o, FN, REV).hourly) && !shown(rowOf(o, FN, "All").hourly));
}

/* ---------- the floor counts trusted contributors, and new accounts weigh as one ---------- */

{
  const FN = "Growth";
  const REV = "Pre-revenue";
  for (const [n, rate] of [[11, "$5k/mo"], [12, "$6k/mo"], [13, "$7k/mo"], [14, "$8k/mo"]]) await share(S(n), FN, REV, rate);
  const newbie = await fresh();
  await share(newbie, FN, REV, "$20k/mo");
  const four = await stat(newbie, FN, REV, "monthly");
  check("four trusted members and a new account are not five", four.n === 4 && four.min === 5 && !shown(four), four);
  await share(SIX_DAYS, FN, REV, "$30k/mo");
  const six = await stat(newbie, FN, REV, "monthly");
  check("an account that joined 6 days ago does not count", six.n === 4 && !shown(six), six);
  const old = await share(EIGHT_DAYS, FN, REV, "$9k/mo");
  const eight = await stat(newbie, FN, REV, "monthly");
  check("an account that joined 8 days ago does not count either: age is no proof (LEAK-1)", eight.n === 4 && !shown(eight), eight);
  check("an account that old is still told when its rate will count", old.ok && /two members confirm a fact you added/.test(old.message), old.message);
  for (let i = 0; i < 2; i++) await share(await fresh(), FN, REV, "$150k/mo");
  const padded = await stat(newbie, FN, REV, "monthly");
  check("more new accounts change nothing", padded.n === 4 && !shown(padded), padded);
  // Two seed members confirm a fact the 8 day old account added: now it counts.
  const host = (await view(EIGHT_DAYS)).companies.find((c) => c.name === "Our Records Test Co");
  const fact = await act(EIGHT_DAYS, { type: "fill", entity: "company", id: host?.id, field: "hq", value: "Austin, TX" });
  const c1 = await act(S(51), { type: "verify", entity: "company", id: host?.id, field: "hq" });
  const half = await stat(newbie, FN, REV, "monthly");
  check("one confirmation is not enough", fact.ok && c1.ok && half.n === 4 && !shown(half), { fact: fact.error, c1: c1.error, half });
  const c2 = await act(S(52), { type: "verify", entity: "company", id: host?.id, field: "hq" });
  const vouched = await stat(newbie, FN, REV, "monthly");
  check("an account with a fact two members confirmed counts toward the floor", c2.ok && vouched.n === 5 && vouched.median === 7000 && !("p25" in vouched), { c2: c2.error, vouched });
}

/* ---------- LOGIC-12: member rates alone can show a group that has a few survey rows ---------- */

{
  const FN = "Customer Success";
  const REV = "$1M–$5M";
  const rates = [100, 120, 140, 160, 180];
  for (const [i, amount] of rates.entries()) await share(S(15 + i), FN, REV, `$${amount}/hr`);
  const r = rowOf(await view(ONLOOKER), FN, REV);
  check(
    "five trusted member rates show the group without its two survey rows (LOGIC-12)",
    r.hourly.n === 5 && r.hourly.min === 5 && r.hourly.indexed === false && r.hourly.median === 150 && r.indexed === false,
    r,
  );
}

/* ---------- with Rate Index data the floor stays 20, counted in trusted contributors ---------- */

{
  const FN = "RevOps";
  const REV = "$20M–$50M";
  const mine = [310, 330, 350, 370, 390];
  for (let i = 0; i < 4; i++) await share(S(20 + i), FN, REV, `$${mine[i]}/hr`);
  const g19 = await stat(ONLOOKER, FN, REV, "hourly");
  check("15 survey rows and 4 trusted members count 19 of 20", g19.n === 19 && g19.min === 20 && g19.indexed === true && !shown(g19), g19);
  await share(await fresh(), FN, REV, "$25/hr");
  const still = await stat(ONLOOKER, FN, REV, "hourly");
  check("a new account's rate does not complete the 20", still.n === 19 && !shown(still), still);
  await share(S(24), FN, REV, `$${mine[4]}/hr`);
  const g = await stat(ONLOOKER, FN, REV, "hourly");
  const pool = [...SURVEY.revops, ...mine];
  check(
    "at 20 the figure includes the survey rows and the members, with a range, and not the new account",
    g.n === 20 && g.min === 20 && g.indexed === true && g.median === near(quant(pool, 0.5), 5) && g.p25 === near(quant(pool, 0.25), 5) && g.p75 === near(quant(pool, 0.75), 5),
    g,
  );
}
{
  const FN = "Marketing";
  const REV = "$5M–$20M";
  await share(await fresh(), FN, REV, "$200/hr");
  const no = await stat(ONLOOKER, FN, REV, "hourly");
  check("19 survey rows and a new account stay at 19", no.n === 19 && !shown(no), no);
  await share(S(25), FN, REV, "$200/hr");
  const yes = await stat(ONLOOKER, FN, REV, "hourly");
  check("19 survey rows and one trusted member show at 20, as before", yes.n === 20 && yes.indexed === true && shown(yes), yes);
  const twice = await share(S(25), FN, REV, "$900/hr");
  const same = await stat(ONLOOKER, FN, REV, "hourly");
  check("a second rate from the same member adds no contributor", twice.ok && same.n === 20, same);
}

/* ---------- the range shows at 10 trusted contributors ---------- */

{
  const FN = "Growth";
  const REV = "$50M+";
  for (let i = 0; i < 9; i++) await share(S(26 + i), FN, REV, `$${4 + i}k/mo`);
  const nine = await stat(ONLOOKER, FN, REV, "monthly");
  check("nine contributors show a median and no range", nine.n === 9 && nine.median === 8000 && !("p25" in nine) && !("p75" in nine), nine);
  for (let i = 0; i < 3; i++) await share(await fresh(), FN, REV, "$1k/mo");
  const twelve = await stat(ONLOOKER, FN, REV, "monthly");
  check("new accounts are not in the figure, so they neither move it nor bring the range forward", twelve.n === 9 && twelve.median === 8000 && !("p25" in twelve), twelve);
  await share(S(35), FN, REV, "$13k/mo");
  const ten = await stat(ONLOOKER, FN, REV, "monthly");
  check("ten contributors show the range, rounded to $250", ten.n === 10 && ten.median === 8500 && ten.p25 === 6250 && ten.p75 === 10750, ten);
}

/* ---------- a rate on a record is no cover for a private one ---------- */

{
  const FN = "Product Marketing";
  const REV = "$1M–$5M";
  // Four trusted members put a rate on a record (any member can unlock those), one shares privately.
  for (const [n, rate] of [[36, "$4k/mo"], [37, "$5k/mo"], [38, "$6k/mo"], [39, "$7k/mo"]]) await madeUpSeat(S(n), FN, REV, { rate, pricing: "Monthly retainer" });
  await share(S(43), FN, REV, "$5,500/mo");
  const g = await stat(ONLOOKER, FN, REV, "monthly");
  check("four rates on records and one private rate show nothing, since the four can be unlocked and taken out", g.n === 4 && g.min === 5 && !shown(g), g);
  await madeUpSeat(S(44), FN, REV, { rate: "$8k/mo", pricing: "Monthly retainer" });
  const five = await stat(ONLOOKER, FN, REV, "monthly");
  check("five rates on records show their own median, and the private rate waits", five.n === 5 && five.median === 6000, five);
  for (const [n, rate] of [[45, "$9k/mo"], [46, "$10k/mo"], [47, "$11k/mo"], [48, "$12k/mo"]]) await share(S(n), FN, REV, rate);
  const ten = await stat(ONLOOKER, FN, REV, "monthly");
  check("with five private rates the figure takes everyone in", ten.n === 10 && ten.median === 7500, ten);
  check("the range waits for 10 private rates, since the 5 on records can be taken out", !("p25" in ten) && !("p75" in ten), ten);
}

/* ---------- ECON-4: what counts as tied to a seat, and 5 saves a day ---------- */

{
  const v0 = await view(OWNER.token);
  const own = v0.companies.flatMap((c) => c.engagements).filter((e) => e.yours);
  const foreign = v0.companies.flatMap((c) => c.engagements).find((e) => !e.yours && e.cells.role?.s === "locked" && e.cells.function?.v === "AI GTM");
  check("the seed member holds four seats", own.length === 4, own.length);
  for (const rate of ["$100/hr", "$110/hr", "$120/hr"]) await share(OWNER.token, "Other", "Under $1M", rate);
  const s1 = await act(OWNER.token, { type: "benchRate", engagementId: own[0].id, pricing: "Hourly", rate: "$130/hr" });
  const s2 = await act(OWNER.token, { type: "benchRate", engagementId: own[1].id, pricing: "Hourly", rate: "$140/hr" });
  check("rates on seats the member holds are accepted past the 3, each for 1 credit", s1.ok && s2.ok && s2.me.credits === 30, [s1.error, s2.error, s2.me?.credits]);
  const placed = await stat(ONLOOKER, "AI GTM", "Under $1M", "hourly");
  check("they take the seat's function and the company's revenue band, as one contributor", placed.n === 1 && !shown(placed), placed);
  // Hours turn an hourly rate into a monthly point too. Anyone can fill and edit hours on a seat,
  // so for a private rate only the member's own hours count.
  const theirs = await act(S(42), { type: "fill", entity: "engagement", id: own[0].id, field: "hours", value: "10" });
  const moved = await stat(ONLOOKER, "AI GTM", "Under $1M", "monthly");
  check("hours another member puts on the seat make no monthly point from a private hourly rate", theirs.ok && moved.n === 0, { theirs: theirs.error, moved });
  const ownHours = await act(OWNER.token, { type: "fill", entity: "engagement", id: own[1].id, field: "hours", value: "10" });
  const derived = await stat(ONLOOKER, "AI GTM", "Under $1M", "monthly");
  check("the member's own hours do", ownHours.ok && derived.n === 1, { ownHours: ownHours.error, derived });
  const s3 = await act(OWNER.token, { type: "benchRate", engagementId: own[2].id, pricing: "Hourly", rate: "$150/hr" });
  check("a sixth save in 24 hours is refused (ECON-4)", !s3.ok && s3.error === "You can share 5 rates for the benchmarks a day. Share the next one tomorrow.", s3);
  const mine = (await view(OWNER.token)).me;
  const rm = await act(OWNER.token, { type: "benchRateRemove", id: mine.benchRates[0].id });
  const again = await act(OWNER.token, { type: "benchRate", engagementId: own[2].id, pricing: "Hourly", rate: "$150/hr" });
  check("removing one gives its credit back and does not reopen the day", rm.ok && rm.me.credits === mine.credits - 1 && !again.ok && /5 rates/.test(again.error), { rm: rm.error ?? rm.me, again });
  const notMine = await act(S(41), { type: "benchRate", engagementId: foreign?.id, pricing: "Hourly", rate: "$150/hr" });
  check("a rate on a seat the member neither holds nor added is refused, as before", !notMine.ok && notMine.error === "You can share a rate for a seat you held or added.", notMine);
}
{
  const me = S(41);
  for (const rate of ["$100/hr", "$110/hr", "$120/hr"]) await share(me, "Other", "$1M–$5M", rate);
  const named = await madeUpSeat(me, "Other", "$1M–$5M", { role: "Fractional chief of staff", operator: "typed over" }, { operatorMemberId: "me" });
  const onNamed = await act(me, { type: "benchRate", engagementId: named, pricing: "Hourly", rate: "$130/hr" });
  check("a seat the member added with a role and their own name counts as tied", !!named && onNamed.ok, onNamed);
  const blank = await madeUpSeat(me, "Other", "$1M–$5M");
  const onBlank = await act(me, { type: "benchRate", engagementId: blank, pricing: "Hourly", rate: "$140/hr" });
  check("the same member's blank seat does not", !onBlank.ok && /role/.test(onBlank.error), onBlank);
  await act(me, { type: "fill", entity: "engagement", id: blank, field: "role", value: "Fractional operations lead" });
  await act(me, { type: "fill", entity: "engagement", id: blank, field: "operator", value: "typed over", memberId: "me" });
  const onFilled = await act(me, { type: "benchRate", engagementId: blank, pricing: "Hourly", rate: "$140/hr" });
  check("once the seat has a role and names them it does", onFilled.ok, onFilled);
}

/* ---------- ECON-3 again: one account swaps its own rate to read the members next to the middle ---------- */

{
  const FN = "Sales";
  const REV = "$50M+";
  const honest = [[53, "$6,100/mo"], [54, "$7,300/mo"], [55, "$9,900/mo"], [56, "$12,750/mo"], [57, "$15,400/mo"]];
  for (const [n, rate] of honest) await share(S(n), FN, REV, rate);
  const before = await stat(ONLOOKER, FN, REV, "monthly");
  check("five members show a median, rounded to $1,000 under 10", before.n === 5 && before.median === 10000, before);
  // A new account: its rate is in no figure, so its low and its high move nothing.
  const newbie = await fresh();
  const low = await share(newbie, FN, REV, "$1,000/mo");
  const afterLow = await stat(ONLOOKER, FN, REV, "monthly");
  const takeBack = await act(newbie, { type: "benchRateRemove", id: (await view(newbie)).me.benchRates[0]?.id });
  await share(newbie, FN, REV, "$150,000/mo");
  const afterHigh = await stat(ONLOOKER, FN, REV, "monthly");
  check("a new account's low and high rates move no figure anyone sees (ECON-3)", low.ok && takeBack.ok && afterLow.median === 10000 && afterLow.n === 5 && afterHigh.median === 10000 && afterHigh.n === 5, [afterLow, afterHigh]);
  check("and it sees no other number than everyone else does", (await stat(newbie, FN, REV, "monthly")).median === 10000);
  // A seed member does the same. Others' figure moves, theirs never does.
  const attacker = S(58);
  await share(attacker, FN, REV, "$1,000/mo");
  const seenLow = await stat(attacker, FN, REV, "monthly");
  const id = (await view(attacker)).me.benchRates[0]?.id;
  await act(attacker, { type: "benchRateRemove", id });
  await share(attacker, FN, REV, "$150,000/mo");
  const seenHigh = await stat(attacker, FN, REV, "monthly");
  check(
    "a member who swaps a low rate for a high one reads the same median both times, so it gives no one's rate away",
    seenLow.median === 10000 && seenHigh.median === 10000 && seenLow.n === 5 && seenHigh.n === 5 && seenLow.withoutYours === true && seenHigh.withoutYours === true,
    [seenLow, seenHigh],
  );
  const others = await stat(ONLOOKER, FN, REV, "monthly");
  check("everyone else sees the group with that member in it", others.n === 6 && shown(others) && !others.withoutYours, others);
  const sent = [...numbersIn((await view(attacker)).benchmarks), ...numbersIn((await view(ONLOOKER)).benchmarks)];
  check("no figure anyone sees is one of the five rates", ![6100, 7300, 9900, 12750, 15400].some((x) => sent.includes(x)));
}
{
  // A group of four, and a fifth member who would make it show.
  const FN = "Partnerships";
  const REV = "$5M–$20M";
  for (const [n, rate] of [[53, "$6,100/mo"], [54, "$7,300/mo"], [55, "$9,900/mo"], [56, "$12,750/mo"]]) await share(S(n), FN, REV, rate);
  const four = await stat(ONLOOKER, FN, REV, "monthly");
  check("four members are four of five", four.n === 4 && four.min === 5 && !shown(four), four);
  const fifth = S(49);
  await share(fifth, FN, REV, "$1,000/mo");
  const theirs = await stat(fifth, FN, REV, "monthly");
  check("the fifth member still sees four of five and no number, since their own rate is left out", theirs.n === 4 && !shown(theirs) && theirs.withoutYours === true, theirs);
  await act(fifth, { type: "benchRateRemove", id: (await view(fifth)).me.benchRates.find((b) => b.function === FN)?.id });
  await share(fifth, FN, REV, "$150,000/mo");
  const again = await stat(fifth, FN, REV, "monthly");
  check("and after swapping it for a high one, the same", again.n === 4 && !shown(again), again);
  check("others see the five", shown(await stat(ONLOOKER, FN, REV, "monthly")));
}

/* ---------- LEAK-1 again: four accounts old enough, around one member ---------- */

{
  const FN = "Enablement";
  const REV = "$1M–$5M";
  await share(S(59), FN, REV, "$11,750/mo");
  const said = [];
  for (const [i, amount] of [1000, 1000, 150000, 150000].entries()) said.push(await share(`token-${AGED[i]}`, FN, REV, `$${amount}/mo`));
  const g = await stat(ONLOOKER, FN, REV, "monthly");
  check("four accounts that joined 8 days ago are taken, and told when they will count", said.every((r) => r.ok && /two members confirm/.test(r.message)), said.map((r) => r.error ?? r.message));
  check("but they are not a group of five with the member (LEAK-1)", g.n === 1 && !shown(g), g);
  check("the member's rate is nowhere in anyone's benchmarks", !numbersIn((await view(ONLOOKER)).benchmarks).includes(11750) && !numbersIn((await view(`token-${AGED[0]}`)).benchmarks).includes(11750));
}

/* ---------- what holds for every figure, and what never leaves the server ---------- */

{
  const sharers = [S(1), S(8), S(9), OWNER.token, S(41)];
  const ids = [];
  for (const t of sharers) ids.push(...(await view(t)).me.benchRates.map((b) => b.id));
  const v = await view(ONLOOKER);
  const stats = v.benchmarks.rows.flatMap((r) => [["monthly", r.monthly], ["hourly", r.hourly]]);
  check("a figure shows numbers exactly when it has reached its floor", stats.every(([, s]) => shown(s) === s.n >= s.min && (s.min === 5 || s.min === 20)), stats.find(([, s]) => shown(s) !== s.n >= s.min));
  check(
    "every number is a multiple of $250 a month or $5 an hour, and under 10 contributors of $1,000 or $25",
    stats.every(([kind, s]) => [s.median, s.p25, s.p75].every((x) => x === undefined || x % unitFor(kind, s.n) === 0)),
    stats.find(([kind, s]) => [s.median, s.p25, s.p75].some((x) => x !== undefined && x % unitFor(kind, s.n) !== 0)),
  );
  check("a range comes with a median, in order, and only from 10 contributors", stats.every(([, s]) => (s.p25 === undefined) === (s.p75 === undefined) && (s.p25 === undefined || (s.n >= 10 && s.p25 <= s.median && s.median <= s.p75))));
  check("a row is marked Rate Index only when one of its figures is", v.benchmarks.rows.every((r) => r.indexed === !!(r.monthly.indexed || r.hourly.indexed)));
  const text = JSON.stringify(v);
  check("another member's view carries none of the private rates or their ids", ids.length >= 10 && v.me.benchRates.length === 0 && !ids.some((id) => text.includes(id)), ids.length);
  check("no private rate below a floor shows up as a number", [7350, 9260, 237].every((x) => !numbersIn(v.benchmarks).includes(x)));
  const adm = await view(seedMembers[59].token);
  const ab = adm.admin?.benchmarks;
  check(
    "the admin's benchmarks block is three counts and nothing else",
    !!ab && Object.keys(ab).sort().join() === "indexRates,memberRates,privateRates" && Object.values(ab).every((n) => Number.isInteger(n)) && ab.indexRates === seed.rateIndex.length,
    ab,
  );
  check("the admin's view carries none of the private rate ids either", !ids.some((id) => JSON.stringify(adm).includes(id)));
  const counts = table.benchRateCounts?.(await table.loadState());
  check(
    "benchRateCounts gives private rates per member as counts",
    counts instanceof Map && counts.get(OWNER.id) === 4 && counts.get("m_seed41") === 5 && [...counts.values()].every((n) => Number.isInteger(n) && n > 0),
    counts && [...counts.values()],
  );
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
