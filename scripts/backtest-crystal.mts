/**
 * Back-test of Crystal Ball's "which function is next" on the real seed (data/intel-seed.json,
 * git-ignored, never committed). Prints counts and rates only: no company, no person.
 *
 *   npx tsx scripts/backtest-crystal.mts
 *
 * For every company with two or more dated fractional leadership seats in different functions, at
 * the start of each later seat in a function the company had not hired before, rank the functions
 * the company had no fractional seat in yet, with
 *   (a) today's logic: the functions whose "usually hired before" list (beforeOrder, from the
 *       seats that started before that date) holds the company's last hire, the last hire nearer
 *       the front of the list ranking higher (what the radar flagged before Crystal Ball);
 *   (b) the new model (lib/radar/predict.ts): the likelihood after Merlin's transitions counted only
 *       from seats that started before that date, times the timing curve, from the company's recent seats;
 *   (c) the new model's likelihood alone (no timing), for reference.
 * A hit is the function that actually came next in the top 1 or the top 3. Today's logic only
 * counts a hit for a function it would have flagged at all.
 */
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const seedPath = path.resolve(process.cwd(), "data/intel-seed.json");
if (!existsSync(seedPath)) {
  console.log("No data/intel-seed.json here: the back-test runs on the real seed only.");
  process.exit(0);
}
const dir = mkdtempSync(path.join(tmpdir(), "rn-backtest-"));
writeFileSync(path.join(dir, "intel.json"), JSON.stringify({ ledger: [], values: {}, unlocks: {}, seen: {}, profiles: {} }));
Object.assign(process.env, { RN_DATA_DIR: dir, RN_INTEL_SEED: seedPath, RN_LOGO_LOOKUP: "off", RN_ID_SECRET: process.env.RN_ID_SECRET || "backtest" });
globalThis.fetch = (async () => new Response("no network", { status: 599 })) as typeof fetch;

async function main() {
  const t = await import("../lib/table");
  const S = await import("../lib/radar/signals");
  const P = await import("../lib/radar/predict");
  const { beforeOrder } = await import("../app/onboard/firstView");
  const { FUNCTIONS } = await import("../lib/tableFields");
  const T = t.tableInternals;
  const seed = await t.loadSeed();
  const s = await t.loadState();
  const g = T.graph(seed, s);
  const points = S.seatPoints(seed, s);
  const candidatesAll = FUNCTIONS.filter((f) => f !== "Other");

  const byCo = new Map<string, (typeof points[number] & { m: number })[]>();
  for (const x of points) {
    const m = P.monthIndex(x.ym);
    if (m === null) continue;
    const l = byCo.get(x.companyId) ?? [];
    l.push({ ...x, m });
    byCo.set(x.companyId, l);
  }
  // Today's logic needs the seats as the app reads them: a leadership hire with its function, start and type.
  const recOf = (x: { fn: string; ym: string }, i: number) =>
    ({
      id: `r${i}`,
      source: "backtest",
      verified: false,
      cells: { function: { s: "value", v: x.fn, ver: 0 }, start: { s: "value", v: x.ym, ver: 0 }, type: { s: "value", v: "Fractional", ver: 0 }, operator: { s: "locked", ver: 0 } },
      people: [],
      updatedAt: null,
      yours: false,
      opened: null,
      closed: null,
    }) as unknown as import("../lib/tableTypes").EngagementRec;

  interface Tally {
    n: number;
    a1: number;
    a3: number;
    b1: number;
    b3: number;
    c1: number;
    c3: number;
    aFlagged: number;
  }
  const zero = (): Tally => ({ n: 0, a1: 0, a3: 0, b1: 0, b3: 0, c1: 0, c3: 0, aFlagged: 0 });
  const overall = zero();
  const byStage = new Map<string, Tally>();
  let companies = 0;
  const eligible = [...byCo.entries()].filter(([, l]) => new Set(l.map((x) => x.fn)).size >= 2);

  for (const [companyId, list] of eligible) {
    list.sort((a, b) => a.m - b.m || a.fn.localeCompare(b.fn));
    let used = false;
    const c = g.companies.get(companyId);
    const co = { employees: c ? T.live(c, s, "employees") : null, businessModel: c ? T.live(c, s, "businessModel") : null };
    const owner = P.ownerOf(c ? T.live(c, s, "ownership") : null);
    const doneFns = new Set<string>();
    for (const b of list) {
      const earlier = list.filter((x) => x.m < b.m);
      if (!earlier.length || doneFns.has(b.fn)) continue;
      const held = new Set(earlier.map((x) => x.fn));
      if (held.has(b.fn)) continue;
      doneFns.add(b.fn);
      const lastM = Math.max(...earlier.map((x) => x.m));
      const last = [...new Set(earlier.filter((x) => x.m === lastM).map((x) => x.fn))];
      const cands = candidatesAll.filter((f) => !held.has(f));
      if (!cands.includes(b.fn)) continue;
      used = true;

      // (a) today's logic, from the seats that started before this date.
      const infos = [...byCo.entries()].map(([, l]) => ({ c: {}, engs: l.filter((x) => x.m < b.m).map(recOf) })).filter((i) => i.engs.length) as unknown as import("../app/post/model").CoInfo[];
      const aScore = new Map<string, number>();
      for (const f of cands) {
        const sug = beforeOrder(infos, f).suggested;
        const pos = Math.min(...last.map((x) => (sug.includes(x) ? sug.indexOf(x) : Infinity)));
        aScore.set(f, pos);
      }
      const aRank = [...cands].filter((f) => Number.isFinite(aScore.get(f)!)).sort((x, y) => aScore.get(x)! - aScore.get(y)! || FUNCTIONS.indexOf(x) - FUNCTIONS.indexOf(y));

      // (b) the new model, with counts only from seats before this date; (c) its likelihood alone.
      const counts = P.countTransitions(points, b.m);
      const stage = P.isStage(b.stage) ? b.stage : null;
      const recent = earlier.filter((x) => b.m - x.m <= 18);
      const from = recent.length ? recent : earlier.filter((x) => x.m === lastM);
      const bScore = new Map<string, number>();
      const cScore = new Map<string, number>();
      for (const f of cands) {
        let best = 0;
        let bestP = 0;
        for (const x of from) {
          const l = P.likelihood(x.fn, f, stage, owner, co, counts);
          best = Math.max(best, l.p * P.timing(b.m - x.m, l.gap));
          bestP = Math.max(bestP, l.p);
        }
        bScore.set(f, best);
        cScore.set(f, bestP);
      }
      const rank = (m: Map<string, number>) => [...cands].sort((x, y) => m.get(y)! - m.get(x)! || FUNCTIONS.indexOf(x) - FUNCTIONS.indexOf(y));
      const bRank = rank(bScore);
      const cRank = rank(cScore);

      const key = stage ?? "Stage not on file";
      const tl = byStage.get(key) ?? zero();
      byStage.set(key, tl);
      for (const x of [overall, tl]) {
        x.n++;
        if (aRank.length) x.aFlagged++;
        if (aRank[0] === b.fn) x.a1++;
        if (aRank.slice(0, 3).includes(b.fn)) x.a3++;
        if (bRank[0] === b.fn) x.b1++;
        if (bRank.slice(0, 3).includes(b.fn)) x.b3++;
        if (cRank[0] === b.fn) x.c1++;
        if (cRank.slice(0, 3).includes(b.fn)) x.c3++;
      }
    }
    if (used) companies++;
  }

  const pct = (k: number, n: number) => (n ? `${((100 * k) / n).toFixed(1)}%` : "n/a");
  const row = (label: string, x: Tally) =>
    `${label.padEnd(20)} ${String(x.n).padStart(4)}   today top-1 ${pct(x.a1, x.n).padStart(6)} top-3 ${pct(x.a3, x.n).padStart(6)}   new top-1 ${pct(x.b1, x.n).padStart(6)} top-3 ${pct(x.b3, x.n).padStart(6)}   (likelihood alone top-1 ${pct(x.c1, x.n)} top-3 ${pct(x.c3, x.n)})`;
  console.log(`Seats read: ${points.length} dated fractional leadership seats. Companies with 2+ in different functions: ${eligible.length}; with a later seat in a new function: ${companies}.`);
  console.log(`Predictions scored: ${overall.n} (today's logic flagged any function for ${overall.aFlagged}).`);
  console.log(`Candidates: the ${candidatesAll.length} functions but Other, less the ones the company had already hired.`);
  console.log("");
  console.log(row("Overall", overall));
  for (const stage of [...P.STAGES, "Stage not on file"]) {
    const x = byStage.get(stage);
    if (x) console.log(row(stage, x));
  }

  // Crystal Ball's tenure marks (predict.ts TENURE_MARKS) read the ended seats' median and average: check them against
  // the ended seats on file, month to month where both are months, a year alone as its middle (counts only).
  const tracks = T.tracksOf(seed, s);
  const lengths: number[] = [];
  let yearOnly = 0;
  for (const e of g.engagements.values()) {
    if (!S.isLeaderRaw(e, s, tracks) || T.live(e, s, "status") !== "Ended") continue;
    const a = P.monthSpan(T.live(e, s, "start"));
    const b = P.monthSpan(T.live(e, s, "end"));
    if (!a || !b) continue;
    if (a.from !== a.to || b.from !== b.to) yearOnly++;
    const len = (b.from + b.to) / 2 - (a.from + a.to) / 2;
    if (len >= 0) lengths.push(len);
  }
  lengths.sort((x, y) => x - y);
  const med = lengths.length ? lengths[Math.floor(lengths.length / 2)] : NaN;
  const avg = lengths.length ? lengths.reduce((x, y) => x + y, 0) / lengths.length : NaN;
  const after12 = lengths.filter((x) => x >= 12);
  const in12to18 = after12.filter((x) => x < 18).length;
  console.log("");
  console.log(
    `Tenure of ended fractional leadership seats with a start and an end: ${lengths.length} (${yearOnly} with a year alone). Median ${Number.isFinite(med) ? med.toFixed(1) : "n/a"} months, average ${Number.isFinite(avg) ? avg.toFixed(1) : "n/a"} (the marks use ${P.TENURE_MARKS.join(" and ")}).`,
  );
  console.log(`Of the seats that lasted 12 months or more, ${pct(in12to18, after12.length)} ended in the 6 months after (the 12-month mark's window).`);
}

main()
  .catch((e) => {
    console.error("the back-test threw", e);
    process.exitCode = 1;
  })
  .finally(() => rmSync(dir, { recursive: true, force: true }));
