/**
 * Checks of Stage 8's two pages in the new look: Rate benchmarks (app/post/rates/RatesPage.tsx,
 * the working in app/post/chargeModel.ts, rates/ratesModel.ts) and Credits and usage
 * (app/post/credits/CreditsUsage.tsx, credits/creditsModel.ts). Pure functions on benchmarks and
 * ledgers shaped as the server sends them (lib/table.ts rateStat and fullView), and the pages'
 * source. No server, no browser, no member data: everything here is made up.
 *
 *   npx tsx scripts/test-rates-credits.mts      exits 1 on any failure
 *
 * Covered:
 *   - the tabs and the old addresses: ?p=rates (By function, tab=size, tab=seats), ?p=credits
 *     (Overview, tab=ledger, tab=earn), ?p=billing and its emails' and Stripe's links (Plans), and
 *     no Plans tab while billing is off;
 *   - a group's figure keeps the server's floors: under its floor nothing but the count, the
 *     fallback to every company size ("Not enough reports yet for X, showing Y instead"), Free's
 *     client size is Pro, no figure anywhere says so;
 *   - What should I charge: every dollar amount in the working is a figure the server sent, the
 *     member's own rate, or the hour check's arithmetic on a shown figure; with no figure it says
 *     it cannot answer and prints no amount; words are read by the rules (function, revenue,
 *     hours, by the hour, a company the member can see) and the rest come back unknown;
 *   - your rates: private ones (removable) and seat ones, a private rate tied to a seat once;
 *   - the ledger by kind: each reason the server writes has its kind, an unknown reason is Other,
 *     a line a workflow spent (its name on the line, or a reason that starts "Workflow") is
 *     Workflows; the running balance and the opening; weeks sum to the ledger; the filters;
 *   - ways to earn: each with its credit, the 25-a-day cap, the paid ways only with billing;
 *   - no export, CSV or download anywhere on either page (members cannot export data), and Plan
 *     and billing's Stripe line no longer says "download".
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  Benchmarks,
  BenchmarkRow,
  LedgerRow,
  Me,
  RateStat,
} from "../lib/tableTypes";
import {
  chargeWorking,
  figureOf,
  pickGroup,
  readChargeAsk,
  hoursOf,
  hoursMonth,
  byHours,
  groupLabel,
} from "../app/post/chargeModel";
import { RATE_FLOOR, RATE_INDEX_FLOOR, RATE_RANGE_FLOOR, floorWords } from "../lib/rates";
import { askChips, myRates, rateTabOf } from "../app/post/rates/ratesModel";
import {
  CAP_LINE,
  buckets,
  byKind,
  creditTabOf,
  filterLedger,
  kindOf,
  threeLines,
  toneOf,
  totals,
  waysToEarn,
  withBalance,
  type Line,
} from "../app/post/credits/creditsModel";
import {
  EARN_CAP,
  HIDDEN_COMPANY,
  REFERRAL_BONUS,
  RN_REVENUE,
} from "../lib/tableFields";
import { PASS_CREDIT } from "../lib/peersCore";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== undefined ? `\n     ${JSON.stringify(detail)}` : ""}`,
  );
}

/* ---------- made-up benchmarks, as rateStat sends them ---------- */

const few = (n: number, min = 5): RateStat => ({ n, min });
const med = (
  n: number,
  median: number,
  extra: Partial<RateStat> = {},
): RateStat => ({ n, min: 5, median, ...extra });
const rng = (
  n: number,
  p25: number,
  median: number,
  p75: number,
  extra: Partial<RateStat> = {},
): RateStat => ({ n, min: 5, p25, median, p75, ...extra });
const row = (
  fn: string,
  revenue: string,
  monthly: RateStat,
  hourly: RateStat,
  indexed = false,
): BenchmarkRow => ({ function: fn, revenue, indexed, monthly, hourly });
const BENCH: Benchmarks = {
  minN: 5,
  rangeN: 10,
  total: 420,
  rows: [
    row("Sales", "All", rng(40, 8500, 11500, 15000), rng(30, 150, 190, 240)),
    row("Sales", "$5M–$20M", rng(14, 9000, 12000, 15500), med(7, 200)),
    row("Sales", "$20M–$50M", few(3), few(2)),
    row("Sales", "Pre-revenue", med(6, 7000), few(1)),
    ...RN_REVENUE.filter(
      (r) => !["$5M–$20M", "$20M–$50M", "Pre-revenue"].includes(r),
    ).map((r) => row("Sales", r, few(0), few(0))),
    row("Marketing", "All", med(8, 9500), few(4)),
    ...RN_REVENUE.map((r) => row("Marketing", r, few(1), few(0))),
    row("RevOps", "All", few(2), few(1)),
    ...RN_REVENUE.map((r) => row("RevOps", r, few(0), few(0))),
  ],
};
// Free: the server sends no client-size rows and no ranges.
const FREE: Benchmarks = {
  ...BENCH,
  limited: true,
  rows: BENCH.rows
    .filter((r) => r.revenue === "All")
    .map((r) => ({
      ...r,
      monthly: { ...r.monthly, p25: undefined, p75: undefined },
      hourly: { ...r.hourly, p25: undefined, p75: undefined },
    })),
};
const amountsIn = (b: Benchmarks) =>
  new Set(
    b.rows.flatMap((r) =>
      [r.monthly, r.hourly].flatMap((s) =>
        [s.p25, s.median, s.p75].filter((x): x is number => x !== undefined),
      ),
    ),
  );
const dollars = (text: string) =>
  [...text.matchAll(/\$([\d,]+)(?![\dMk])/g)].map((m) =>
    Number(m[1].replace(/,/g, "")),
  );

console.log("Tabs and old addresses");
check(
  "?p=rates opens By function; tab=size, tab=seats, tab=function name theirs",
  rateTabOf("?p=rates") === "fn" &&
    rateTabOf("?p=rates&tab=size") === "size" &&
    rateTabOf("?p=rates&tab=seats") === "seats" &&
    rateTabOf("?p=rates&tab=function") === "fn",
);
check(
  "?p=credits opens Overview; ?p=billing, ?plans=1, ?aipack=1 and Stripe's way back open Plans",
  creditTabOf("credits", "?p=credits", true) === "overview" &&
    creditTabOf("billing", "?p=billing", true) === "plans" &&
    creditTabOf("credits", "?p=credits&plans=1", true) === "plans" &&
    creditTabOf("billing", "?p=billing&aipack=1", true) === "plans" &&
    creditTabOf("billing", "?p=billing&paid=1", true) === "plans",
);
check(
  "tab= names a tab outright, with aliases",
  creditTabOf("credits", "?tab=ledger", true) === "ledger" &&
    creditTabOf("credits", "?tab=ways", true) === "earn" &&
    creditTabOf("billing", "?tab=overview", true) === "overview" &&
    creditTabOf("credits", "?tab=nope", true) === "overview",
);
check(
  "billing off: no Plans tab, so ?p=billing opens Overview",
  creditTabOf("billing", "?p=billing&plans=1", false) === "overview",
);

console.log("\nA group's figure keeps the server's floors");
{
  const a = pickGroup(BENCH, "Sales", "$5M–$20M", "monthly");
  check(
    "a group with a middle half shows it as sent",
    a.shown === a.asked && a.shown?.fig?.state === "range" && !a.widened,
  );
  const b = pickGroup(BENCH, "Sales", "$20M–$50M", "monthly");
  check(
    "under its floor: widened to every size, the asked group keeps only its count",
    b.widened &&
      b.shown?.band === "All" &&
      b.asked.fig?.state === "few" &&
      b.asked.fig.n === 3 &&
      !("median" in (b.asked.fig ?? {})),
  );
  const c = pickGroup(BENCH, "RevOps", "All", "monthly");
  check(
    "no figure anywhere in the function: nothing shown",
    c.shown === null && c.asked.fig?.state === "few",
  );
  const d = pickGroup(FREE, "Sales", "$5M–$20M", "monthly");
  check(
    "Free: client size is Pro, the function across every size shows, its median only",
    d.sizeLocked &&
      d.shown?.band === "All" &&
      d.shown.fig?.state === "median" &&
      d.shown.fig.state === "median" &&
      d.shown.fig.rangeLocked,
  );
  const e = pickGroup(BENCH, "Sales", "Pre-revenue", "monthly");
  check(
    "a median under 10 people: no middle half, and the nearest middle half is every size",
    e.shown?.fig?.state === "median" && e.ranged?.band === "All",
  );
  check(
    "figureOf: a stat with no median is below the floor, whatever its count",
    figureOf({ n: 50, min: 20, indexed: true }, BENCH).state === "few",
  );
}

console.log("\nWhat should I charge: the working");
{
  const own = {
    monthly: {
      kind: "monthly" as const,
      amount: 12000,
      at: "Northwind Clinics",
    },
  };
  const ask = readChargeAsk("Sales at a $5M to $20M company, 2 days a week", {
    myFn: "Marketing",
  });
  check(
    "words: the function, the revenue band and the hours (2 days a week is 16)",
    ask.fn === "Sales" &&
      ask.band === "$5M–$20M" &&
      ask.hours === 16 &&
      ask.kind === "monthly",
    ask,
  );
  const w = chargeWorking(BENCH, { ...ask, fn: ask.fn! }, own);
  const titles = w.steps.map((s) => s.t);
  check(
    "the steps: the group, what they were paid, by your hours, your own rate, what to ask",
    JSON.stringify(titles) ===
      JSON.stringify([
        "The group",
        "What they were paid",
        "By your hours",
        "Your own rate",
        "What to ask",
      ]),
    titles,
  );
  const hourly = 200;
  const hm = hoursMonth(16);
  const check1 = Math.round((hm * hourly) / 250) * 250;
  check(
    "with hours given, the answer is the hours math shown (an hourly median only: start there)",
    w.big === `Start at $${check1.toLocaleString("en-US")} a month` && w.answered && !w.band && byHours(hm, hourly) === check1,
    w.big,
  );
  const allowed = new Set([...amountsIn(BENCH), 12000, hourly, check1]);
  const said = dollars([...w.steps.map((s) => s.s), w.big, w.sub].join(" "));
  check(
    "every dollar amount is a figure sent, your own rate, or the hour math on a shown figure",
    said.length > 0 && said.every((x) => allowed.has(x)),
    { said, check1 },
  );
  check(
    "the hour math says its arithmetic",
    w.steps[2].s.includes(`${hm} hours a month`) &&
      w.steps[2].s.includes("$200") &&
      w.steps[2].s.includes(`$${check1.toLocaleString("en-US")}`),
    w.steps[2],
  );
  // The tester's case: 2 days a week, an hourly middle half on file. The range asked and the shown math are one sum.
  const w2 = chargeWorking(BENCH, { fn: "Sales", band: "All", kind: "monthly", hours: 16, company: null, industry: false }, {});
  const lo = byHours(hm, 190);
  const hi = byHours(hm, 240);
  const usd = (x: number) => `$${x.toLocaleString("en-US")}`;
  check(
    "hours and an hourly range: Ask is the hours times the hourly middle to the top of its middle half",
    w2.big === `Ask ${usd(lo)} to ${usd(hi)} a month` && w2.band?.from === lo && w2.band?.to === hi,
    { big: w2.big, lo, hi },
  );
  const hourStep = w2.steps.find((x) => x.t === "By your hours")?.s ?? "";
  check(
    "the shown math produces exactly the range asked",
    hourStep.includes(`${hm} hours a month`) && hourStep.includes("$190 to $240 an hour") && hourStep.includes(`${usd(lo)} to ${usd(hi)} a month`),
    hourStep,
  );
  const askStep = w2.steps.find((x) => x.t === "What to ask")?.s ?? "";
  check(
    "the monthly retainers are said as what they are, not as a second answer",
    askStep.includes("Merlin goes by your hours") && askStep.includes("$8,500 to $15,000") && !w2.big.includes("11,500"),
    askStep,
  );
  const w3 = chargeWorking(BENCH, { fn: "Sales", band: "All", kind: "monthly", hours: null, company: null, industry: false }, {});
  check(
    "without hours the answer stays the monthly median to the top of the middle half",
    w3.big === "Ask $11,500 to $15,000 a month" && w3.band?.from === 11500 && w3.band.to === 15000,
    w3.big,
  );
  const wf = chargeWorking(
    BENCH,
    {
      fn: "RevOps",
      band: "All",
      kind: "monthly",
      hours: null,
      company: null,
      industry: false,
    },
    {},
  );
  check(
    "no figure: Merlin says it cannot answer, and no amount is printed",
    !wf.answered &&
      wf.big === "Merlin cannot answer from the numbers yet" &&
      dollars([...wf.steps.map((s) => s.s), wf.big, wf.sub].join(" "))
        .length === 0,
    wf,
  );
  const wn = chargeWorking(
    BENCH,
    {
      fn: "Sales",
      band: "$20M–$50M",
      kind: "monthly",
      hours: null,
      company: null,
      industry: false,
    },
    {},
  );
  check(
    "too few in the group: the working says it widened, and to which group",
    wn.steps[0].s.includes("widened to Sales") &&
      wn.big.startsWith("Ask $11,500"),
    wn.steps[0],
  );
  const wm = chargeWorking(
    BENCH,
    {
      fn: "Marketing",
      band: "All",
      kind: "monthly",
      hours: null,
      company: null,
      industry: false,
    },
    {},
  );
  check(
    "a median only: start at the middle, never an invented range",
    wm.big === "Start at $9,500 a month" &&
      !wm.band &&
      dollars(wm.big + wm.sub).every((x) => x === 9500),
    wm,
  );
  const wfree = chargeWorking(
    FREE,
    {
      fn: "Sales",
      band: "$5M–$20M",
      kind: "monthly",
      hours: null,
      company: null,
      industry: false,
    },
    {},
  );
  check(
    "Free: client size is Pro in the working, and only the median is asked",
    wfree.steps[0].s.includes("client size is Pro") &&
      wfree.big === "Start at $11,500 a month",
    wfree,
  );
  const h = readChargeAsk("By the hour", { myFn: "Sales" });
  check(
    "by the hour: hourly, the member's function",
    h.kind === "hourly" && h.fn === "Sales" && h.band === "All",
    h,
  );
  const co = readChargeAsk("Cedar and Pine renewal, 20 hours a week", {
    myFn: "Sales",
    companies: [
      { name: "Cedar", revenue: "Pre-revenue" },
      { name: "Cedar and Pine", revenue: "$5M–$20M" },
    ],
  });
  check(
    "a company the member can see, named in full, sets the band from its revenue (the longest name wins)",
    co.company === "Cedar and Pine" &&
      co.band === "$5M–$20M" &&
      co.hours === 20,
    co,
  );
  const unk = readChargeAsk("Halcyon Freight wombat", {
    myFn: "Sales",
    companies: [],
  });
  check(
    "a company the member can't see is never matched; its words come back unknown",
    unk.company === null &&
      unk.unknown.includes("wombat") &&
      unk.unknown.includes("Halcyon"),
    unk,
  );
  const ind = readChargeAsk("a health care client", { myFn: "Sales" });
  const wi = chargeWorking(BENCH, { ...ind, fn: ind.fn! }, {});
  check(
    "an industry: the working says the benchmarks have no industry groups",
    ind.industry && wi.steps[0].s.includes("no industry groups"),
    wi.steps[0],
  );
  check(
    "hours: half time 20, 3 days a week 24, no hours null",
    hoursOf("half time") === 20 &&
      hoursOf("3 days a week") === 24 &&
      hoursOf("a software company") === null,
  );
  const same: Benchmarks = {
    ...BENCH,
    rows: [row("Finance", "All", rng(33, 12000, 12000, 12000), few(0))],
  };
  const ws = chargeWorking(
    same,
    {
      fn: "Finance",
      band: "All",
      kind: "monthly",
      hours: null,
      company: null,
      industry: false,
    },
    {},
  );
  check(
    'every rate alike (low, middle and high the same): one amount, never "$12,000 to $12,000"',
    ws.big === "Ask $12,000 a month" &&
      !ws.steps.some((x) => x.s.includes("$12,000 to $12,000")),
    ws,
  );
  check(
    "groupLabel",
    groupLabel("Sales", "All") === "Sales" &&
      groupLabel("Sales", "$5M–$20M") === "Sales, $5M–$20M",
  );
}

console.log("\nYour rates against the market");
{
  const list = myRates(
    BENCH,
    [
      {
        id: "br1",
        engagementId: null,
        function: "Sales",
        kind: "hourly",
        amount: 190,
      },
      {
        id: "br2",
        engagementId: "e2",
        function: "Sales",
        kind: "monthly",
        amount: 12000,
      },
    ],
    [
      {
        company: "Northwind Clinics",
        engagementId: "e2",
        fn: "Sales",
        rate: "$11k/mo",
        pricing: "Monthly retainer",
        revenue: "$5M–$20M",
      },
      {
        company: "Larkspur Learning",
        engagementId: "e3",
        fn: "Sales",
        rate: "$9,500 a month",
        pricing: null,
        revenue: "$20M–$50M",
      },
      {
        company: "Cedar and Pine",
        engagementId: "e4",
        fn: "Sales",
        rate: null,
        pricing: null,
        revenue: null,
      },
    ],
  );
  check(
    "private rates first, then the rates on the member's seats; a seat with a private rate once",
    list.map((r) => r.id).join() === "br1,br2,seat:e3",
    list.map((r) => r.id),
  );
  check(
    "a rate is placed in its seat's client size when that has a figure, else every size",
    list[1].group?.band === "$5M–$20M" && list[2].group?.band === "All",
  );
  check(
    "private rates are removable (benchRateRemove), seat rates are edited on the seat",
    list[0].source === "private" && list[2].source === "seat",
  );
  const chips = askChips(
    "Sales",
    { industries: [], employees: [], revenue: ["$5M–$20M"], countries: [] },
    [
      { name: "Northwind Clinics", revenue: "$20M–$50M" },
      { name: "Cedar and Pine", revenue: null },
    ],
  );
  check(
    "starting questions: the ideal client, a seat's company with a known revenue, any client, by the hour",
    chips.map((x) => x.id).join() === "icp,co:Northwind Clinics,mine,hour",
    chips,
  );
}

console.log("\nThe ledger by kind");
{
  const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const L = (
    delta: number,
    reason: string,
    field = "",
    company = "",
    h = 1,
    wf?: string,
  ): Line => ({
    at: at(h),
    delta,
    reason,
    field,
    company,
    ...(wf ? { wf } : {}),
  });
  const ledger: Line[] = [
    L(-2, "unlock", HIDDEN_COMPANY, "Halcyon Freight", 1),
    L(0, "Opened free in your Close trial", "", "Cedar and Pine", 2),
    L(0, "Opened free from Crystal Ball", "", "Larkspur Learning", 3),
    L(-1, "unlock", "Person email", "Halcyon Freight", 4),
    L(-1, "unlock", "Rate", "Northwind Clinics", 5, "When a seat ends"),
    L(-1, "Workflow: Ended seats in Sales", "", "", 6),
    L(1, "fill", "Hours a week", "Northwind Clinics", 7),
    L(1, "confirm", "Role", "Northwind Clinics", 8),
    L(1, "fill", "Private rate", "", 9),
    L(-1, "Removed", "Private rate", "", 10),
    L(REFERRAL_BONUS, "referral", "Invite bonus", "Devon", 11),
    L(PASS_CREDIT, "A peer took the company you referred", "", "", 12),
    L(100, "Close credits for the month", "", "", 13),
    L(50, "Bought 50 credits", "", "", 14),
    L(1, "refund", "Person email", "Harrow and Vale", 15),
    L(1, "Refund for a role that had closed", "", "Pinecrest Data", 16),
    L(-1, "reversal", "Industry", "Pinecrest Data", 17),
    L(-1, "Took back the HQ", "", "Pinecrest Data", 18),
    L(3, "Something new the server says", "", "", 19),
  ];
  const kinds = ledger.map(kindOf);
  const want = [
    "opens",
    "opens",
    "opens",
    "facts",
    "workflows",
    "workflows",
    "added",
    "added",
    "rates",
    "rates",
    "invites",
    "leads",
    "plan",
    "plan",
    "refunds",
    "refunds",
    "takenBack",
    "takenBack",
    "other",
  ];
  check(
    "each reason the server writes has its kind; a workflow's line (its name, or Workflow: …) is Workflows",
    JSON.stringify(kinds) === JSON.stringify(want),
    kinds
      .map((k, i) => (k === want[i] ? "" : `${i}:${k}!=${want[i]}`))
      .filter(Boolean),
  );
  check(
    "an unknown reason is Other, never guessed",
    kindOf(L(-4, "zz unheard of", "Mystery")) === "other" &&
      kindOf(L(2, "")) === "other",
  );
  const sums = byKind(ledger);
  const sumE = sums.reduce((n, s) => n + s.earned, 0);
  const sumS = sums.reduce((n, s) => n + s.spent, 0);
  const t = totals(ledger);
  check(
    "by kind adds up to the ledger, Other last",
    sumE === t.earned &&
      sumS === t.spent &&
      sums[sums.length - 1].kind === "other" &&
      sums.find((s) => s.kind === "opens")?.free === 2,
    { sumE, sumS, t },
  );
  check(
    "tone: earned, spent, free",
    toneOf(ledger[0]) === "spent" &&
      toneOf(ledger[1]) === "free" &&
      toneOf(ledger[6]) === "earned",
  );
  const credits = 200;
  const { rows, opening } = withBalance(ledger, credits, 0);
  check(
    "running balance: the newest line ends at today's balance; the opening is what came before",
    rows[0].after === credits &&
      rows[1].after === credits + 2 &&
      opening === credits - ledger.reduce((n, l) => n + l.delta, 0),
  );
  const owed = withBalance([L(-3, "reversal", "Role", "", 1)], 0, 2);
  check("owed: the balance reads below 0", owed.rows[0].after === -2);
  const weeks = buckets(ledger, credits, 0, Date.now(), "week");
  const days = buckets(ledger, credits, 0, Date.now(), "day");
  check(
    "weeks and days sum to the ledger, the last bucket ends at today's balance",
    weeks.reduce((n, w) => n + w.earned, 0) === t.earned &&
      days.reduce((n, w) => n + w.spent, 0) === t.spent &&
      weeks[weeks.length - 1].bal === credits &&
      weeks[weeks.length - 1].label === "This week",
  );
  check(
    "a new member: one bucket, this week, at the starting credits",
    (() => {
      const b = buckets([], 25, 0, Date.now());
      return b.length === 1 && b[0].bal === 25 && b[0].earned === 0;
    })(),
  );
  const texts = rows.map((r) => ({ ...r, text: r.l.reason }));
  check(
    "filters: earned, spent, free, and the search over the line and its company",
    filterLedger(texts, "free", "").length === 2 &&
      filterLedger(texts, "earned", "").every((r) => r.l.delta > 0) &&
      filterLedger(texts, "all", "pinecrest").length === 3,
  );
}

console.log("\nWays to earn and the rules");
{
  const me = {
    earned24h: 6,
    earnCap: EARN_CAP,
    added: 46,
    invited: 2,
    invitesPaid: 2,
    benchRates: [],
    plan: undefined,
  } as unknown as Me;
  const w = waysToEarn(me, { seatsNoRate: 2, seats: 3 });
  check(
    "each way says its credit: rates on your seats +2, a fact +1, an invite +10 each, a lead +5",
    w[0].id === "seatRates" &&
      w[0].reward === "+2" &&
      w.find((x) => x.id === "fact")?.reward === "+1 each" &&
      w.find((x) => x.id === "invite")?.reward === `+${REFERRAL_BONUS} each` &&
      w.find((x) => x.id === "lead")?.reward === `+${PASS_CREDIT}`,
  );
  check(
    "where you stand: 19 of 25 left to earn today",
    w
      .find((x) => x.id === "fact")!
      .status.includes(`${EARN_CAP - 6} of ${EARN_CAP} left to earn today`),
  );
  check("billing off: no paid ways", !w.some((x) => !x.earns));
  const paid = waysToEarn(
    {
      ...me,
      plan: {
        name: "trial",
        prices: { proCredits: 100, topupCredits: 50, topup: 19 },
        topup: true,
      },
    } as unknown as Me,
    { seatsNoRate: 0, seats: 0 },
  );
  check(
    "billing live: a plan's 100 a month and the top-up, as bought, not earned",
    paid
      .filter((x) => !x.earns)
      .map((x) => x.id)
      .join() === "plan,topup" && !paid.some((x) => x.id === "seatRates"),
  );
  check(
    "the cap line says 25 a day, bonuses included",
    CAP_LINE.includes(`${EARN_CAP} credits in any 24 hours, bonuses included`),
  );
  const three = threeLines(
    { earnCap: EARN_CAP, proOpens: { left: 11, of: 40 } } as Me,
    25,
  );
  check(
    "credits in three lines: start, spend to see, earn by adding",
    three.length === 3 &&
      three[0].n === "25" &&
      three[1].s.includes("2 credits") &&
      three[1].s.includes("40 a day") &&
      three[2].s.includes(`${EARN_CAP} a day`),
  );
}

console.log("\nNo export, CSV or download anywhere");
{
  const files = [
    "app/post/rates/RatesPage.tsx",
    "app/post/rates/ratesModel.ts",
    "app/post/credits/CreditsUsage.tsx",
    "app/post/credits/creditsModel.ts",
  ];
  for (const f of files) {
    const src = readFileSync(path.join(process.cwd(), f), "utf8");
    // Words a member reads: string literals and JSX text. Code keywords (export function) aren't either.
    const strings = [
      ...src.matchAll(/"([^"\n]*)"|`([^`]*)`|>([^<>{}\n]+)</g),
    ].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
    const bad = strings.filter((x) => /\b(export|csv|download)/i.test(x));
    check(
      `${f}: no export, CSV or download in what members read`,
      bad.length === 0,
      bad,
    );
    check(
      `${f}: no file is made for the member (no Blob, no download attribute, no text/csv)`,
      !/new Blob\(|\bdownload=|text\/csv|createObjectURL/.test(src),
    );
  }
  const billing = readFileSync(
    path.join(process.cwd(), "app/post/Billing.tsx"),
    "utf8",
  );
  check(
    "Plan and billing's Stripe line: see your invoices, no download",
    billing.includes("see your invoices") &&
      !/download invoices/i.test(billing),
  );
  const page = readFileSync(
    path.join(process.cwd(), "app/post/credits/CreditsUsage.tsx"),
    "utf8",
  );
  check(
    "Credits and usage: four tabs, Plans only with billing; the admin queue for admins; Settings has the account",
    /CREDIT_TABS\.filter\(\(t\) => t !== "plans" \|\| !!plan\)/.test(page) &&
      /me\.admin &&/.test(page) &&
      page.includes("closing your account are in"),
  );
  const rates = readFileSync(
    path.join(process.cwd(), "app/post/rates/RatesPage.tsx"),
    "utf8",
  );
  check(
    "Rate benchmarks: removing a private rate asks first and says it takes the credit back",
    rates.includes("Removing this rate takes back the 1 credit it earned.") &&
      /type: "benchRateRemove"/.test(rates),
  );
  check(
    "Rate benchmarks: Seats with a rate lists only seats with a rate on file (rateKnown)",
    /rateKnown: true/.test(rates),
  );
}

/* ---------- the floors: one constant set, one sentence everywhere ---------- */
{
  console.log("\nRate benchmarks' floors");
  const src = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
  const table = src("lib/table.ts");
  check(
    "the server's floors are lib/rates.ts's constants (5, 20 with Rate Index data, 10 for the range)",
    /export const BENCHMARK_MIN_N = RATE_FLOOR;/.test(table) &&
      /export const BENCHMARK_INDEX_MIN_N = RATE_INDEX_FLOOR;/.test(table) &&
      /export const BENCHMARK_RANGE_N = RATE_RANGE_FLOOR;/.test(table) &&
      RATE_FLOOR === 5 && RATE_INDEX_FLOOR === 20 && RATE_RANGE_FLOOR === 10,
  );
  check(
    "the one sentence says both floors and the range",
    floorWords().includes(`${RATE_FLOOR} people`) && floorWords().includes(`${RATE_INDEX_FLOOR} when it includes Rate Index`) && floorWords().includes(`${RATE_RANGE_FLOOR}`),
    floorWords(),
  );
  const pages = ["app/post/rates/RatesPage.tsx", "app/post/Benchmarks.tsx", "app/post/Charge.tsx", "app/post/chargeModel.ts", "app/landing/faq.ts", "lib/mcp/server.ts"];
  // A threshold typed as a number in words a member reads ("once 5 people", "show at 20 people") would drift from the rule.
  const literal = /\b(?:once|at)\s+(?:5|10|20)\s+(?:different\s+)?people\b/;
  const bad = pages.filter((f) => src(f).split("\n").some((l) => !/^\s*(\*|\/\/|\/\*)/.test(l) && literal.test(l)));
  check("no page types a floor as a number: each reads the constants", bad.length === 0, bad);
  check(
    "Rate benchmarks says the whole rule where it lists functions with no figure yet (no 5 beside a list that reads 3 of 20)",
    src("app/post/rates/RatesPage.tsx").includes(". {floorWords()}") && src("app/post/Charge.tsx").includes("{floorWords()}"),
  );
  const wf = chargeWorking(BENCH, { fn: "RevOps", band: "All", kind: "monthly", hours: null, company: null, industry: false }, {});
  check("What should I charge with no figure says the same rule", wf.steps.some((x) => x.s.includes(floorWords())), wf.steps);
}

console.log(
  `\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`,
);
process.exit(failed ? 1 : 0);
