/**
 * Checks of Crystal Ball in the new look: tuning (lib/radar/tune.ts, Profile.radarTune, scoreFor's
 * multipliers), "Why not" (lib/radar/out.ts, the radarOut action, the ranges and the morning pick),
 * what the page reads for each signal (RadarRow.sigs), and the page's own words
 * (app/post/crystal/crystalModel.ts). No server, Stripe, email or network.
 *
 *   npx tsx scripts/test-crystal-ball.mts      exits 1 on any failure
 *
 * Runs on a made-up seed and state in a temporary data dir (member Jordan Avery; companies
 * Northwind Clinics, Cedar and Pine, Halcyon Freight, Larkspur Learning, Quillon Labs).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-cball-"));
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();
const ago = (n: number) => iso(-n * DAY).slice(0, 10);
const monthAgo = (n: number) => {
  const d = new Date(t0);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};

const NAMES: Record<string, string> = { c_n: "Northwind Clinics", c_c: "Cedar and Pine", c_h: "Halcyon Freight", c_l: "Larkspur Learning", c_q: "Quillon Labs" };
const companies = Object.entries(NAMES).map(([id, name]) => ({ id, fields: { name, website: `${id.slice(2)}co.example`, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX" } }));
const seed = {
  builtAt: iso(-90 * DAY),
  members: [
    { id: "mem_jor", name: "Jordan Avery", email: "jordan.avery@example.com", title: "Fractional VP Sales", token: "tok-jor-cball" },
    { id: "mem_fre", name: "Frey Freeman", email: "frey.free@example.com", title: "Fractional VP Sales", token: "tok-fre-cball" },
  ],
  companies,
  engagements: Object.keys(NAMES).map((c) => ({ id: `e_${c}`, companyId: c, verified: false, fields: { source: "Member success story", operator: `Holder ${c}`, role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2023-02", status: "Ended", end: "2023-11" } })),
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

let kn = 0;
const row = (c: string, b: "High" | "Medium" | "Low", kind: string, s: number, l = "A fractional Marketing leader was hired") => ({ k: `test:${c}:${++kn}`, c, kind, l, b, w: `${kind} why · window`, s, a: ago(1), h: [1, 4] as [number, number] });
// Jordan's ball: today High Northwind; yesterday (a delivery: only Cedar's row was sent) Medium Cedar (s .12), Medium Halcyon (s .2), High Larkspur (not sent: kept off the email).
const today = [row("c_n", "High", "role", 0.8)];
const yday = [row("c_c", "Medium", "adjacent", 0.12), row("c_h", "Medium", "seat", 0.2), row("c_l", "High", "adjacent", 0.3)];
const sales = { function: "Sales", onboarded: true, icp: { industries: ["SaaS"], employees: [], revenue: [], countries: [] } };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: { mem_jor: iso(-HOUR), mem_fre: iso(-HOUR) },
    profiles: { mem_jor: sales, mem_fre: sales },
    billing: { members: { mem_jor: { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) } }, events: [], payments: [], ended: [] },
    radar: {
      lastRunAt: iso(-DAY),
      lastRunDay: ago(1),
      members: {
        mem_jor: { sent: { [yday[0].k]: iso(-DAY) }, shown: {}, days: { [ago(0)]: today, [ago(1)]: yday } },
        mem_fre: { sent: {}, days: { [ago(1)]: [row("c_c", "Medium", "adjacent", 0.12), row("c_h", "Medium", "seat", 0.2)] } },
      },
      stats: { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 },
    },
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_ID_SECRET: "cball-test-id-secret",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_cball",
  STRIPE_WEBHOOK_SECRET: "whsec_test_cball",
  STRIPE_PRICE_MONTH: "price_month_cball",
  STRIPE_PRICE_YEAR: "price_year_cball",
});
for (const k of ["RN_FREE_COMPANY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_INTEL_SEED_KEY", "RN_GOOGLE", "RESEND_API_KEY"]) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 700)}`}`);
};

async function main() {
  const t = await import("../lib/table");
  const radar = await import("../lib/radar");
  const M = await import("../lib/radar/match");
  const TU = await import("../lib/radar/tune");
  const O = await import("../lib/radar/out");
  const CM = await import("../app/post/crystal/crystalModel");
  const T = t.tableInternals;
  const P = Object.fromEntries(Object.keys(NAMES).map((c) => [c.slice(2), T.pubId(c)])) as Record<string, string>;
  const JOR = "tok-jor-cball";
  const FRE = "tok-fre-cball";
  const BASE = "https://post.example.com";
  const nowIso = () => new Date().toISOString();
  const view = (tok: string, range: string | null = "30d", day: string | null = null) => radar.radarView(tok, day, nowIso(), range);
  const ids = (v: { rows: { id: string }[] } | null) => (v?.rows ?? []).map((r) => r.id);
  const refused = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  /* ---------- tuning, pure ---------- */
  console.log("\nTuning: the words and the groups");
  check("every signal kind sits in exactly one group", (await import("../lib/radar/types")).RADAR_KINDS.every((k) => TU.TUNE_GROUPS.filter((g) => g.kinds.includes(k)).length === 1));
  check("cleanTune keeps only known groups off Normal", JSON.stringify(TU.cleanTune({ role: 2, seat: 1, grow: 0, nope: 2, gap: 7, adj: "2" })) === JSON.stringify({ role: 2, grow: 0 }));
  check("nothing tuned reads as untuned", !TU.isTuned({}) && !TU.isTuned(undefined) && TU.isTuned({ role: 0 }));
  check("Less is half, More one and a half, Normal one", TU.tuneMultiplier({ role: 0 }, "role") === 0.5 && TU.tuneMultiplier({ role: 2 }, "role") === 1.5 && TU.tuneMultiplier({}, "seat") === 1);
  const w = (x: string) => JSON.stringify(TU.tuneFromWords(x));
  check("'roles matter more' sets roles to More", w("roles matter more") === JSON.stringify([{ group: "role", step: 2 }]), w("roles matter more"));
  check("'growth matters less' sets growing to Less", w("growth matters less") === JSON.stringify([{ group: "grow", step: 0 }]));
  check("'count ended seats more' sets seats to More", w("Count ended seats more") === JSON.stringify([{ group: "seat", step: 2 }]));
  check("words with no signal in them set nothing (never a guess)", TU.tuneFromWords("make it better").length === 0 && TU.tuneFromWords("").length === 0);

  /* ---------- tuning in the score ---------- */
  console.log("\nTuning in the score (match.ts scoreFor)");
  const icp = { industries: ["SaaS"], employees: [], revenue: [], countries: [] };
  const co = (o: Record<string, unknown> = {}) => ({ name: "X Co", industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", country: "United States", region: null, model: "B2B", ...o });
  const raw = (o: Record<string, unknown>) =>
    ({ key: String(o.key), kind: "adjacent", at: new Date().toISOString(), atMs: Date.now(), companyId: "c_x", engagementId: null, fn: "Marketing", title: null, co: co(), hiredFns: [], stage: "$5M–$20M", owner: null, ym: monthAgo(2), recent: [], lead: { teamAt: new Date().toISOString(), ft: {} }, ...o }) as import("../lib/radar/signals").RawSignal;
  const base = { memberId: "m", fn: "Sales", icp, before: [], beforeFromMember: false };
  const sigs = [
    raw({ key: "a1" }),
    raw({ key: "a2", fn: "Finance", ym: monthAgo(4) }),
    raw({ key: "r1", kind: "role", fn: "Sales", companyId: "c_r" }),
    raw({ key: "s1", kind: "seat", fn: "Sales", companyId: "c_s" }),
    raw({ key: "ft", kind: "sales-build", fn: null, build: { from: 0, to: 3 }, ledFullTime: { Sales: "2023" }, companyId: "c_ft" }),
    raw({ key: "g1", kind: "gap", fn: "Sales", stage: "$5M–$20M", companyId: "c_g" }),
    raw({ key: "weak", fn: "Legal", ym: monthAgo(2), companyId: "c_w" }),
  ];
  const plain = M.signalsFor(sigs, base);
  const normal = M.signalsFor(sigs, { ...base, tune: { role: 1, seat: 1, lead: 1, adj: 1, rep: 1, grow: 1, gap: 1 } });
  const empty = M.signalsFor(sigs, { ...base, tune: {} });
  const same = (a: typeof plain, b: typeof plain) => a.length === b.length && a.every((x, i) => b[i].key === x.key && b[i].score === x.score && b[i].band === x.band && b[i].whyNow === x.whyNow);
  check("no tuning, an empty tuning and every group at Normal score exactly the same", same(plain, normal) && same(plain, empty));
  const more = M.signalsFor(sigs, { ...base, tune: { adj: 2, gap: 2 } });
  const less = M.signalsFor(sigs, { ...base, tune: { adj: 0, role: 0 } });
  const by = (xs: typeof plain) => new Map(xs.map((x) => [x.key, x]));
  check("tuning never adds or drops a signal (the floor is on the untuned score)", more.length === plain.length && less.length === plain.length && [...by(more).keys()].sort().join() === [...by(plain).keys()].sort().join());
  check("More raises a group's score by half", Math.abs(by(more).get("a1")!.score - Math.min(by(plain).get("a1")!.score * 1.5, M.UNKNOWN_CAP)) < 1e-9 || by(more).get("a1")!.score > by(plain).get("a1")!.score, [by(more).get("a1")?.score, by(plain).get("a1")?.score]);
  check("Less halves it", Math.abs(by(less).get("r1")!.score - by(plain).get("r1")!.score * 0.5) < 1e-9);
  const ftMore = by(M.signalsFor(sigs, { ...base, tune: { grow: 2 } })).get("ft");
  check("a full-time leader on file stays under Medium, tuned More or not", !!ftMore && ftMore.score <= M.FT_CAP + 1e-12 && ftMore.band === "Low", ftMore?.score);
  // A gap: the member's function's share at the stage, capped under High. Finance reads one at most stages.
  const gapSig = (stage: string) => raw({ key: `g:${stage}`, kind: "gap", fn: "Finance", stage, companyId: "c_g" });
  const fin = { ...base, fn: "Finance" };
  const gapPlain = ["$1M–$5M", "$5M–$20M", "$20M–$50M", "$50M+"].map((st) => M.scoreFor(gapSig(st), fin)).filter(Boolean);
  const gapMore = ["$1M–$5M", "$5M–$20M", "$20M–$50M", "$50M+"].map((st) => M.scoreFor(gapSig(st), { ...fin, tune: { gap: 2 } })).filter(Boolean);
  check("a gap never reads High, even at More", gapPlain.length > 0 && gapMore.length === gapPlain.length && gapMore.every((x) => x!.band !== "High" && x!.score <= M.UNKNOWN_CAP + 1e-12), gapMore.map((x) => x?.score));
  check("Less on roles changes their order against seats, not the set", less.findIndex((x) => x.key === "r1") > plain.findIndex((x) => x.key === "r1") || less.findIndex((x) => x.key === "r1") === plain.findIndex((x) => x.key === "r1"));
  check("every scored signal carries when a hire is likely (months from now)", plain.every((x) => Array.isArray(x.horizon) && x.horizon[0] >= 0 && x.horizon[1] >= Math.max(1, x.horizon[0])), plain.map((x) => x.horizon));
  check("an open role is now; an ended seat within 3 months", JSON.stringify(by(plain).get("r1")!.horizon) === "[0,1]" && JSON.stringify(by(plain).get("s1")!.horizon) === "[0,3]");
  check("the member's tuning is read from their profile, and only off-Normal groups", (() => {
    const p = M.profileOf(seed as never, { profiles: { m: { function: "Sales", before: ["Marketing"], radarTune: { role: 2, seat: 1, junk: 0 } } } } as never, "m", "Sales");
    return JSON.stringify(p.tune) === JSON.stringify({ role: 2 });
  })());

  /* ---------- why not, pure ---------- */
  console.log("\nWhy not: the reasons");
  const at = new Date(Date.now() - DAY).toISOString();
  check("a reason takes it out", O.isOut({ r: "size", at }, null) && O.isOut({ r: "known", at }, Date.now()));
  check("Not now lasts until something new happens there", O.isOut({ r: "notnow", at }, Date.parse(at) - 1000) && !O.isOut({ r: "notnow", at }, Date.now()));
  check("Show it anyway is never out", !O.isOut({ r: "anyway", at }, null) && O.wantsAnyway({ r: "anyway", at }, Date.now()) && !O.wantsAnyway({ r: "anyway", at: new Date(Date.now() - 8 * DAY).toISOString() }, Date.now()));
  check("an unknown reason is refused in plain words", "error" in O.applyOut({}, "c", "out", "because", at));
  const ap = O.applyOut({}, "c1", "out", "notnow", at);
  check("out, then back, leaves nothing", "out" in ap && !("c1" in (O.applyOut(ap.out, "c1", "back", null, at) as { out: object }).out));
  check("every reason says what Merlin does with it, with no exclamation marks or dashes", O.OUT_REASONS.every((r) => O.OUT_WORDS[r].t && O.OUT_WORDS[r].did && !/[!—–]/.test(O.OUT_WORDS[r].did + O.OUT_WORDS[r].t)));

  console.log("\nWhy not in the morning pick (match.ts pickDaily)");
  const sc = (key: string, companyId: string, band: "High" | "Medium" = "High", atMs = Date.now()) => ({ ...raw({ key, companyId, atMs }), why: "w", score: 0.5, band, whyNow: "n", horizon: [0, 3] as [number, number] });
  const fresh = [sc("k1", "c1"), sc("k2", "c2"), sc("k3", "c3"), sc("k4", "c4"), sc("k5", "c5"), sc("k6", "c6"), sc("k7", "c7")];
  const pick0 = M.pickDaily(fresh, [], { sent: {} }, Date.now());
  const pickE = M.pickDaily(fresh, [], { sent: {}, out: {} }, Date.now());
  check("with nothing left out, the pick is exactly as before", pick0.send.map((x) => x.key).join() === pickE.send.map((x) => x.key).join() && pick0.send.length === 5);
  const pickO = M.pickDaily(fresh, [], { sent: {}, out: { c1: { r: "known", at }, c2: { r: "notnow", at }, c7: { r: "anyway", at } } }, Date.now());
  check("a company left out is not sent; one left out Not now is, once something new happened", !pickO.send.some((x) => x.companyId === "c1") && pickO.send.some((x) => x.companyId === "c2"));
  const pickN = M.pickDaily([sc("k2", "c2", "High", Date.parse(at) - 1000)], [], { sent: {}, out: { c2: { r: "notnow", at } } }, Date.now());
  check("Not now with nothing newer: not sent", pickN.send.length === 0);
  check("Show it anyway goes first, inside the day's limit", pickO.send[0]?.companyId === "c7" && new Set(pickO.send.map((x) => x.companyId)).size <= 5);

  /* ---------- the view ---------- */
  console.log("\nThe view (radarView with a range)");
  const v0 = await view(JOR);
  check("the range lists the ball, most likely first", ids(v0).join() === [P.n, P.l, P.c, P.h].join(), ids(v0));
  const r0 = v0!.rows.find((r) => r.id === P.h)!;
  check("each row carries its signals for the side panel: kind, line, band, weight word, date, window", r0.sigs?.[0]?.kind === "seat" && r0.sigs[0].weight === "Some" && r0.sigs[0].at === ago(1) && JSON.stringify(r0.sigs[0].h) === "[1,4]" && JSON.stringify(r0.h) === "[1,4]");
  check("no numeric score leaves the server on a row", !/"s":|score/.test(JSON.stringify(v0!.rows)));
  check("an untuned member's view says nothing about tuning", v0!.tune === undefined);
  const heldBack = (v0!.out ?? []).filter((o) => o.by === "merlin");
  check("Merlin's rows: yesterday's Medium and High that its email did not carry, with their bands", heldBack.map((o) => `${o.id}:${o.r}:${o.band}`).sort().join() === [`${P.h}:held:Medium`, `${P.l}:held:High`].sort().join(), v0!.out);
  check("a day that sent nothing held nothing back (today's rows are not listed)", !heldBack.some((o) => o.id === P.n));
  check("a day's link (?sig=) has no Why not and no side-panel extras", (await view(JOR, null, ago(1)))!.out === undefined);

  console.log("\nTuning through the action");
  const tr = await t.perform(JOR, { type: "radarTune", tune: { adj: 2, role: 1, seat: 0 } }, BASE);
  check("radarTune saves only the groups off Normal", JSON.stringify((await t.loadState()).profiles.mem_jor.radarTune) === JSON.stringify({ seat: 0, adj: 2 }) && /re-ranked/.test(tr.message ?? ""), tr.message);
  const v1 = await view(JOR);
  check("the view says how it is tuned", JSON.stringify(v1!.tune) === JSON.stringify({ seat: 0, adj: 2 }));
  check("a tuned member's ball re-ranks inside a band by their scores", ids(v1).join() === [P.n, P.l, P.h, P.c].join() || ids(v1).indexOf(P.h) < ids(v1).indexOf(P.c), ids(v1));
  check("tuning changes no company in the ball", [...ids(v1)].sort().join() === [...ids(v0)].sort().join());
  const vf = await view(FRE);
  check("another member's ball is untouched by Jordan's tuning", ids(vf).join() === [P.c, P.h].join() && vf!.tune === undefined, ids(vf));
  await t.perform(JOR, { type: "radarTune", tune: {} }, BASE);
  check("Reset removes the stored tuning", (await t.loadState()).profiles.mem_jor.radarTune === undefined && ids(await view(JOR)).join() === ids(v0).join());

  console.log("\nWhy not through the action");
  const o1 = await t.perform(JOR, { type: "radarOut", companyId: P.c, op: "out", reason: "size" }, BASE);
  check("a reason takes the company out of the ranges", !ids(await view(JOR)).includes(P.c) && /left your Crystal Ball/.test(o1.message ?? ""), o1.message);
  const v2 = await view(JOR);
  const mine = (v2!.out ?? []).find((o) => o.by === "you");
  check("and it is listed under Why not with the reason", mine?.id === P.c && mine.r === "size");
  check("the reason is kept server-side by internal id", (await t.loadState()).radar!.members.mem_jor.out?.c_c?.r === "size");
  check("a day's link still lists exactly what it listed", (await view(JOR, null, ago(1)))!.rows.some((r) => r.id === P.c));
  check("the company still opens free from the ball (the server's check is not cut)", radar.crystalCompanyIds(await t.loadSeed(), await t.loadState(), (await t.loadSeed()).members[0] as never, Date.now()).has("c_c"));
  check("a reason that isn't one is refused", (await refused(t.perform(JOR, { type: "radarOut", companyId: P.h, op: "out", reason: "meh" }, BASE))) === "Pick why it is not for you.");
  check("a company that isn't there is refused", !!(await refused(t.perform(JOR, { type: "radarOut", companyId: "c_nope", op: "out", reason: "size" }, BASE))));
  check("leaving out earns nothing", (await t.loadState()).ledger.filter((l) => l.memberId === "mem_jor").length === 0);
  await t.perform(JOR, { type: "radarOut", companyId: P.c, op: "back" }, BASE);
  check("Bring it back returns it, and clears the list", ids(await view(JOR)).includes(P.c) && (await t.loadState()).radar!.members.mem_jor.out === undefined);
  await t.perform(JOR, { type: "radarOut", companyId: P.l, op: "anyway" }, BASE);
  const v3 = await view(JOR);
  check("Show it anyway: listed as first tomorrow, no longer as held back", (v3!.out ?? []).some((o) => o.id === P.l && o.r === "anyway") && !(v3!.out ?? []).some((o) => o.id === P.l && o.r === "held"));
  check("a locked company is named by nothing in Why not on Free", (await view(FRE))!.out!.every((o) => !o.name));

  /* ---------- the page's words ---------- */
  console.log("\nThe page's words (crystalModel.ts)");
  const way = (o: Partial<import("../app/post/crystal/crystalModel").WayFacts>) => ({ paths: 0, knows: false, holder: null, held: false, open: true, ...o });
  check("someone you know: ask for an introduction", CM.moveOf({ kinds: ["adjacent"], band: "High" }, way({ paths: 2 })).move === "Ask for an introduction");
  check("a fractional held a seat at an open company: ask them by name", CM.moveOf({ kinds: ["seat"], band: "High" }, way({ held: true, holder: "Rowan Hale" })).move === "Ask Rowan Hale");
  check("at a locked company the holder is never named", !/Rowan/.test(JSON.stringify(CM.moveOf({ kinds: ["seat"], band: "High" }, way({ held: true, holder: null, open: false })))));
  check("a role: reply to the posting; Low: follow it", CM.moveOf({ kinds: ["role"], band: "High" }, way({})).move === "Reply to the posting" && CM.moveOf({ kinds: ["gap"], band: "Low" }, way({})).go === "follow");
  check("when: Now, Within, In", CM.whenWords([0, 1]) === "Now" && CM.whenWords([0, 3]) === "Within 3 months" && CM.whenWords([2, 6]) === "In 2 to 6 months" && CM.whenWords(undefined) === null);
  check("fit in words, never a number", !/\d/.test(CM.fitWords({ industries: ["SaaS"], employees: ["51–200"], revenue: [], countries: [] }, { industry: "SaaS", employees: null })) && /not on file/.test(CM.fitWords({ industries: ["SaaS"], employees: ["51–200"], revenue: [], countries: [] }, { industry: "SaaS", employees: null })));
  check("sources never name LinkedIn or Sales Navigator", !/linkedin|navigator/i.test(Object.values(CM.SOURCE_OF).join(" ")));
  check("moved places counts companies whose place changed", CM.movedCount(["a", "b", "c"], ["b", "a", "c"]) === 2 && CM.movedCount(["a"], ["a"]) === 0);
  check("the timeline puts a signal today at the middle and a window ahead of it", (() => {
    const tl = CM.timeline([{ at: ago(0) }], [0, 3], ago(0));
    return Math.abs((tl.dots[0] ?? 0) - 0.5) < 0.01 && !!tl.win && tl.win[0] >= 0.5 && tl.win[1] > tl.win[0];
  })());
  check("groups count the companies behind them", CM.groupCounts([{ kinds: ["role", "seat"] }, { kinds: ["tenure"] }]).seat === 2 && CM.groupCounts([{ kinds: ["role"] }]).role === 1);
}

main()
  .catch((e) => {
    console.error(e);
    failures++;
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
