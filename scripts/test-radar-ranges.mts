/**
 * Checks of Crystal Ball's ranges (lib/radar radarView with &range=, the page's switcher): Today,
 * Last 7 days and Last 30 days, without a server, Stripe, email or a network.
 *
 *   npx tsx scripts/test-radar-ranges.mts      exits 1 on any failure
 *
 * Runs on a made-up seed and state in a temporary data dir, billing live with made-up Stripe
 * settings (fetch is replaced: nothing leaves the machine), the clock moved forward a day where a
 * rule is about UTC days. Covered:
 *   - each range's companies and counts, a company on several days once at its latest day with
 *     that day's lines, most likely first then newest;
 *   - the range that opens by default: Today when it has companies, else Last 7 days, else Last
 *     30 days; a range asked for by name; a name that isn't one;
 *   - old links: a kept day (?sig=, &day=) opens that day alone, exactly what was kept, with the
 *     ranges beside it; a day 30 days back (kept, outside Last 30 days) too; one older than what is
 *     kept opens the default range and says so; without &range= the view is the one Home, Today's
 *     moves and the connect moment read, unchanged (the latest day, no ranges);
 *   - what counts "new" (RadarView.days, ?today=1's newCount and since) means what it meant;
 *   - plans: the trial names only what it opened (lists keep the rest locked), Free names none; everything a range
 *     lists is in crystalCompanyIds (the server's check); Free opens one a UTC day in full from
 *     anywhere in Last 30 days, a second is refused; on the trial one older than what is kept opens as a trial company;
 *   - the keep window: RADAR_KEEP_VIEW_DAYS is at least 31, and a delivery forgets older days;
 *   - the state's cost: the radar's share for a member with 30 days of history, printed.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-ranges-"));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();
/** The UTC day `n` days before now. */
const ago = (n: number) => iso(-n * DAY).slice(0, 10);

/* ---------- the made-up seed ---------- */

const NAMES: Record<string, string> = {
  c_a: "Alderwick Systems", c_b: "Bramblecote Labs", c_c: "Cindervale Health", c_d: "Dunmere Logistics", c_e: "Eskerfield Media",
  c_f: "Fallowmere Foods", c_g: "Greywater Analytics", c_h: "Hollinsby Robotics", c_i: "Ivybridge Capital", c_j: "Juniper Moor Studio",
  c_k: "Kestrel Ridge Software", c_role: "Larchmont Data",
};
const companies = Object.entries(NAMES).map(([id, name]) => ({
  id,
  fields: { name, website: `${id.slice(2)}.example`, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX" },
}));
const member = (id: string, name: string) => ({ id, name, email: `${id.slice(4)}.ranges@example.com`, title: "Fractional VP Sales", token: `tok-${id.slice(4)}-ranges` });
const seed = {
  builtAt: iso(-90 * DAY),
  members: [
    member("mem_rae", "Rae Ranger"), member("mem_fen", "Fen Free"), member("mem_qui", "Quin Quiet"), member("mem_uma", "Uma Older"), member("mem_nil", "Nils Nothing"),
    { id: "mem_ada", name: "Ada Admin", email: "admin-ranges@example.com", title: "Admin", token: "tok-ada-ranges" },
  ],
  companies,
  engagements: [
    // One seat a company, so a full open has something on it to open.
    ...Object.keys(NAMES).map((c) => ({ id: `e_${c}`, companyId: c, verified: false, fields: { source: "Member success story", operator: `Holder ${c}`, role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2023-02", status: "Ended", end: "2023-11" } })),
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

const LINE = {
  role: "New open role: Fractional VP Sales · In your function, at a company in your profile",
  hire: "Just hired a fractional Marketing leader · Marketing usually comes before Sales. No fractional Sales leader on Merlin. We haven't checked their team page yet",
  end: "A fractional Sales seat just ended · Their kind of seat opened up",
};
const WHY = { High: "Open now", Medium: "Fractional CMO hired 2 months ago · Sales usually follows in 4–9 months", Low: "Fractional CFO hired 8 months ago · Sales usually follows in 1–4 months" };
type Band = "High" | "Medium" | "Low";
let kn = 0;
/** One kept Crystal Ball row (lib/radar/types.ts RadarSentRow). */
const row = (c: string, band: Band, l: string = LINE.role, kind = "role") => ({ k: `test:${c}:${++kn}`, c, kind, l, b: band, w: WHY[band] });

// Rae's Crystal Ball, today back to 33 days: Alderwick is on two days (today High, yesterday Medium with another line), Cindervale too (yesterday and 20 days back).
const raeDays: Record<string, ReturnType<typeof row>[]> = {
  [ago(0)]: [row("c_a", "High"), row("c_b", "Low", LINE.hire, "adjacent")],
  [ago(1)]: [row("c_c", "High"), row("c_a", "Medium", LINE.hire, "adjacent")],
  [ago(3)]: [row("c_d", "Medium", LINE.hire, "adjacent")],
  [ago(6)]: [row("c_e", "Low", LINE.hire, "adjacent")],
  [ago(7)]: [row("c_f", "High")],
  [ago(20)]: [row("c_c", "Low", LINE.end, "seat"), row("c_g", "Medium", LINE.hire, "adjacent")],
  [ago(29)]: [row("c_h", "High")],
  [ago(30)]: [row("c_i", "High")],
  [ago(33)]: [row("c_j", "High")],
};
const fenDays: Record<string, ReturnType<typeof row>[]> = {
  [ago(0)]: [row("c_a", "High")],
  [ago(20)]: [row("c_g", "Medium", LINE.hire, "adjacent")],
  [ago(29)]: [row("c_h", "High")],
  [ago(33)]: [row("c_j", "High")],
};
const sales = { function: "Sales", onboarded: true, icp: { industries: ["SaaS"], employees: [], revenue: [], countries: [] } };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(seed.members.map((m) => [m.id, iso(-HOUR)])),
    profiles: Object.fromEntries(seed.members.map((m) => [m.id, sales])),
    billing: {
      members: {
        mem_rae: { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) },
        mem_fen: { trialStartedAt: iso(-40 * DAY), trialEndsAt: iso(-19 * DAY) },
      },
      events: [],
      payments: [],
      ended: [],
    },
    radar: {
      lastRunAt: iso(-DAY),
      lastRunDay: ago(1),
      members: {
        mem_rae: { sent: {}, days: raeDays },
        mem_fen: { sent: {}, days: fenDays },
        // Quin: nothing today, something two days back. Uma: only 12 days back.
        mem_qui: { sent: {}, days: { [ago(2)]: [row("c_d", "Medium", LINE.hire, "adjacent"), row("c_e", "High")] } },
        mem_uma: { sent: {}, days: { [ago(12)]: [row("c_k", "Medium", LINE.hire, "adjacent")] } },
      },
      stats: { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 },
    },
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-ranges@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RESEND_API_KEY: "re_test_key",
  RN_EMAIL_FROM: "Merlin <post@example.com>",
  RN_EMAIL_API_URL: "https://mail.test/emails",
  // Billing live: made-up Stripe settings (fetch is replaced, nothing reaches Stripe).
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_ranges",
  STRIPE_WEBHOOK_SECRET: "whsec_test_ranges",
  STRIPE_PRICE_MONTH: "price_month_ranges",
  STRIPE_PRICE_YEAR: "price_year_ranges",
});
for (const k of ["RN_FREE_COMPANY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_INTEL_SEED_KEY", "RN_GOOGLE", "RN_EMAIL_REPLY_TO"]) delete process.env[k];
globalThis.fetch = (async (input: RequestInfo | URL) =>
  String(input).startsWith("https://mail.test") ? new Response(JSON.stringify({ id: "m1" }), { status: 200 }) : new Response("{}", { status: 200 })) as typeof fetch;

/* ---------- the clock: moved forward a day for the next UTC day ---------- */

const RealDate = Date;
let skew = 0;
class SkewDate extends RealDate {
  constructor(...a: unknown[]) {
    if (a.length) super(...(a as [string]));
    else super(RealDate.now() + skew);
  }
  static now() {
    return RealDate.now() + skew;
  }
}
globalThis.Date = SkewDate as unknown as DateConstructor;
const nowIso = () => new Date(Date.now()).toISOString();

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 700)}`}`);
};
const named = (x: unknown) => {
  const s = typeof x === "string" ? x : JSON.stringify(x);
  return Object.values(NAMES).filter((n) => s.includes(n));
};

async function main() {
  const t = await import("../lib/table");
  const radar = await import("../lib/radar");
  const types = await import("../lib/radar/types");
  const { todayView } = await import("../lib/today");
  const { radarSince } = await import("../app/post/todayModel");
  const { parsePlace } = await import("../app/post/place");
  const T = t.tableInternals;
  const pub = (id: string) => T.pubId(id);
  const P = Object.fromEntries(Object.keys(NAMES).map((c) => [c.slice(2), pub(c)])) as Record<string, string>;
  const RAE = "tok-rae-ranges";
  const FEN = "tok-fen-ranges";
  const BASE = "https://post.example.com";
  const view = (tok: string, range?: string | null, day?: string | null) => radar.radarView(tok, day ?? null, nowIso(), range);
  const ids = (v: { rows: { id: string }[] } | null) => (v?.rows ?? []).map((r) => r.id);
  const counts = (v: Awaited<ReturnType<typeof view>>) => Object.fromEntries((v?.ranges ?? []).map((r) => [r.range, r.companies]));

  /* ---------- the ranges ---------- */
  console.log("\nThe three ranges");
  check("the ranges are Today, Last 7 days and Last 30 days", types.RADAR_RANGES.map((r) => `${r.label}:${r.days}`).join() === "Today:1,Last 7 days:7,Last 30 days:30");
  const today = await view(RAE, "today");
  const week = await view(RAE, "7d");
  const month = await view(RAE, "30d");
  check("each range counts its companies, each company once", JSON.stringify(counts(week)) === JSON.stringify({ today: 2, "7d": 5, "30d": 8 }), counts(week));
  check("every range's answer carries the same counts", JSON.stringify(counts(today)) === JSON.stringify(counts(month)));
  check("Today: today's companies, most likely first", today?.range === "today" && ids(today).join() === [P.a, P.b].join(), ids(today));
  check("Last 7 days: most likely first, then newest", week?.range === "7d" && ids(week).join() === [P.a, P.c, P.d, P.b, P.e].join(), ids(week));
  check("Last 30 days: the same, back 30 days", month?.range === "30d" && ids(month).join() === [P.a, P.c, P.f, P.h, P.d, P.g, P.b, P.e].join(), ids(month));
  check("a range doesn't reach past 30 days (a day 30 back is kept, not listed)", !ids(month).includes(P.i) && !ids(month).includes(P.j));
  const aWeek = week?.rows.find((r) => r.id === P.a);
  check("a company on two days shows once, at its latest day, with what happened then", aWeek?.day === ago(0) && aWeek.lines.join() === LINE.role && aWeek.band === "High" && aWeek.notes?.[0] === `High · ${WHY.High}`, aWeek);
  const cMonth = month?.rows.find((r) => r.id === P.c);
  check("and its older day's lines aren't added to it", cMonth?.day === ago(1) && cMonth.lines.join() === LINE.role && cMonth.band === "High", cMonth);
  check("each row in a range says its day", (month?.rows ?? []).every((r) => types.SIG_DAY_RE.test(r.day ?? "")) && month?.rows.find((r) => r.id === P.h)?.day === ago(29));
  check("the pill's words: Last 7 days, and each range's", types.rangeLabel("7d") === "Last 7 days" && types.rangeLabel("today") === "Today" && types.rangeLabel("30d") === "Last 30 days");
  check("a range's view says today is its day", week?.day === week?.today && week?.today === ago(0));

  console.log("\nThe range that opens by default");
  const auto = await view(RAE, "auto");
  check("Today has companies: Today", auto?.range === "today" && ids(auto).join() === ids(today).join(), auto?.range);
  const quiet = await view("tok-qui-ranges", "auto");
  check("a quiet day: Last 7 days, never a zero", quiet?.range === "7d" && quiet.rows.length === 2 && counts(quiet).today === 0, { range: quiet?.range, counts: counts(quiet) });
  check("its rows: most likely first", ids(quiet).join() === [P.e, P.d].join(), ids(quiet));
  const older = await view("tok-uma-ranges", "auto");
  check("nothing this week: Last 30 days", older?.range === "30d" && ids(older).join() === P.k && counts(older)["7d"] === 0, { range: older?.range, counts: counts(older) });
  const none = await view("tok-nil-ranges", "auto");
  check("nothing at all: Last 30 days, empty", none?.range === "30d" && none.rows.length === 0 && Object.values(counts(none)).every((n) => n === 0), none);
  check("a range that isn't one opens the default", (await view(RAE, "90d"))?.range === "today" && (await view("tok-qui-ranges", ""))?.range === "7d");
  check("a range asked for by name opens it, even an empty one", (await view("tok-qui-ranges", "today"))?.range === "today" && (await view("tok-qui-ranges", "today"))?.rows.length === 0);

  console.log("\nOld links: a day");
  const yday = await view(RAE, "auto", ago(1));
  check("a kept day opens that day alone, exactly as kept (no range on)", yday?.range === null && yday.day === ago(1) && ids(yday).join() === [P.c, P.a].join(), { range: yday?.range, day: yday?.day, ids: ids(yday) });
  check("with that day's lines, Alderwick's Medium one", yday?.rows.find((r) => r.id === P.a)?.lines.join() === LINE.hire && yday.rows.find((r) => r.id === P.a)?.band === "Medium");
  check("its rows carry no day (it is the day)", (yday?.rows ?? []).every((r) => r.day === undefined));
  check("the ranges are beside it, a tap away", JSON.stringify(counts(yday)) === JSON.stringify(counts(week)));
  const legacy = await radar.radarView(RAE, ago(1), nowIso());
  check("without &range= the day reads as it always did", JSON.stringify(legacy?.rows) === JSON.stringify(yday?.rows) && legacy?.day === ago(1) && !("range" in (legacy as object)) && !("ranges" in (legacy as object)));
  const d30 = await view(RAE, "auto", ago(30));
  check("a day 30 back is still kept: its link opens it", d30?.range === null && ids(d30).join() === P.i && !d30.expired, d30);
  const d33 = await view(RAE, "auto", ago(33));
  check("a day older than what is kept: the default range, and it says so", !!d33?.expired && d33.range === "today" && !ids(d33).includes(P.j), { expired: d33?.expired, range: d33?.range });
  check("a day that isn't one: the same", !!(await view(RAE, "auto", "../../x"))?.expired);
  const place = (q: string) => parsePlace({} as never, q, new Set());
  check("an email's link (?p=table&sig=) still opens Crystal Ball on that day", place(`?p=table&sig=${ago(1)}`).p === "radar" && place(`?p=table&sig=${ago(1)}`).sig === ago(1) && !place(`?p=table&sig=${ago(1)}`).range);
  check("the page's own address keeps a range picked (?p=radar&range=30d), a day wins over it", place("?p=radar&range=30d").range === "30d" && place("?p=radar").range === undefined && !place(`?p=radar&sig=${ago(1)}&range=30d`).range && place("?p=radar&range=x").range === undefined);
  check("an old ?upgrade=radar link still opens Crystal Ball", place("?upgrade=radar").p === "radar");

  console.log("\nWhat counts as new keeps its meaning");
  const home = await radar.radarView(RAE);
  check("Home's read (no range): the latest day, its rows, no ranges", home?.day === ago(0) && ids(home).join() === [P.a, P.b].join() && !("ranges" in (home as object)), { day: home?.day, ids: ids(home) });
  check("the days new is counted from are the last 7, the same with or without ranges", JSON.stringify(home?.days) === JSON.stringify(week?.days) && home?.days.length === 7 && home.days[0].companies === 2 && home.days[1].companies === 2, home?.days);
  const td = (await todayView(RAE, iso(-2 * DAY) + "", Date.now()))!;
  check("?today=1's new count is the latest day's, not a range's", td.radar.newCount === 2 && td.radar.day === ago(0), td.radar);
  check("its since count is the days after the last visit, as before", td.since?.radar === (home?.days ?? []).filter((d) => d.day >= iso(-2 * DAY).slice(0, 10)).reduce((n, d) => n + d.companies, 0), td.since);
  check("the page's own since count (todayModel radarSince) is unchanged", radarSince(home!, `${ago(2)}T12:00:00.000Z`) === 4 && radarSince(home!, null) === 2);

  /* ---------- plans ---------- */
  // Open data on paid plans (owner, 2026-11-24): the trial opens up to 40 companies a day in full, and lists show the rest
  // locked until opened. So Crystal Ball names only what the trial opened: a locked company is described, never named.
  console.log("\nTrial: every range keeps its locked companies unnamed until she opens them");
  check("Rae is on the trial", radar.isPro(await t.loadState(), "mem_rae", Date.now()));
  check("no locked company in Last 30 days is named for her, and each stays locked in her table", (month?.rows ?? []).length > 0 && (month?.rows ?? []).every((r) => !r.name) && !JSON.stringify(month).includes(NAMES[Object.keys(NAMES)[0]]) && (await t.buildView(RAE)).companies.filter((c) => ids(month).includes(c.id)).every((c) => c.hidden));
  const ballRae = await radar.crystalPublicIds(RAE);
  check("everything any range lists is in her Crystal Ball, so it opens free", [today, week, month].every((v) => ids(v).every((id) => ballRae.has(id))), [...ballRae]);
  check("a kept day outside the range is too (its link opens free), and nothing older", ballRae.has(P.i) && !ballRae.has(P.j));
  const c0 = (await t.buildView(RAE)).me!.credits;
  await t.perform(RAE, { type: "unlock", entity: "company", id: P.h, field: "identity", from: "crystal" }, BASE);
  check("she opens one from 29 days back for 0 credits", (await t.buildView(RAE)).me!.credits === c0 && !(await t.buildView(RAE)).companies.find((c) => c.id === P.h)!.hidden);
  const refused = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
  // One older than what is kept isn't Crystal Ball's to open: on the trial it opens as one of the day's 40, said as the trial's.
  const pastKeep = (await t.perform(RAE, { type: "unlock", entity: "company", id: P.j, field: "identity", from: "crystal" }, BASE)) as { message?: string };
  check("one older than what is kept opens as one of the trial's companies today, not as Crystal Ball's", /Free in your trial\. \d+ of today's 40 companies left\./.test(pastKeep.message ?? "") && (await t.buildView(RAE)).me!.credits === c0, pastKeep.message);
  void refused;

  console.log("\nFree: no more than one a day, whatever the range");
  const fenMe = (await t.buildView(FEN)).me!;
  check("Fen is on Free: one a day", fenMe.crystal === "one", fenMe.crystal);
  const fenViews = await Promise.all(["today", "7d", "30d", "auto"].map((r) => view(FEN, r)));
  check("no range names a locked company for her", fenViews.every((v) => (v?.rows ?? []).every((r) => !r.name)) && !named(fenViews).length, named(fenViews));
  check("her Last 30 days lists her three", ids(fenViews[2]).join() === [P.a, P.h, P.g].join(), ids(fenViews[2]));
  const ballFen = await radar.crystalPublicIds(FEN);
  check("all three are in her Crystal Ball, the one older than what is kept isn't", [P.a, P.g, P.h].every((id) => ballFen.has(id)) && !ballFen.has(P.j));
  const f0 = (await t.buildView(FEN)).me!.credits;
  const notIn = await refused(t.perform(FEN, { type: "unlock", entity: "company", id: P.j, field: "identity", from: "crystal" }, BASE));
  check("older than what is kept: refused, and today's open isn't used", notIn === t.CRYSTAL_NOT_IN && (await t.buildView(FEN)).me!.crystal === "one", notIn);
  const full = await t.perform(FEN, { type: "unlock", entity: "company", id: P.h, field: "identity", from: "crystal" }, BASE);
  let fen = await t.buildView(FEN);
  check("one from 29 days back opens in full, free", fen.me!.credits === f0 && !fen.companies.find((c) => c.id === P.h)!.hidden && /with everything on it, free/.test(full.message), full.message);
  check("and today's is used", fen.me!.crystal === "used");
  const second = await refused(t.perform(FEN, { type: "unlock", entity: "company", id: P.g, field: "identity", from: "crystal" }, BASE));
  check("a second from the same range is refused with the upgrade line, nothing spent", second === types.CRYSTAL_USED_LINE && (await t.buildView(FEN)).me!.credits === f0, second);
  const third = await refused(t.perform(FEN, { type: "unlock", entity: "company", id: P.a, field: "identity", from: "crystal" }, BASE));
  check("so is today's own", third === types.CRYSTAL_USED_LINE);
  check("one ledger line today, 0 credits, why crystalFull", (await t.loadState()).ledger.filter((l) => l.memberId === "mem_fen" && l.why === "crystalFull").length === 1);
  skew += DAY;
  fen = await t.buildView(FEN);
  check("the next UTC day, one again", fen.me!.crystal === "one");
  await t.perform(FEN, { type: "unlock", entity: "company", id: P.g, field: "identity", from: "crystal" }, BASE);
  check("it opens one more (20 days back, 21 now), and then no more", (await t.buildView(FEN)).me!.crystal === "used" && (await refused(t.perform(FEN, { type: "unlock", entity: "company", id: P.a, field: "identity", from: "crystal" }, BASE))) === types.CRYSTAL_USED_LINE);
  check("two days, two opens: never more than one a day", (await t.loadState()).ledger.filter((l) => l.memberId === "mem_fen" && l.why === "crystalFull").length === 2);
  skew -= DAY;

  /* ---------- the keep window ---------- */
  console.log("\nThe keep window");
  check("RADAR_KEEP_VIEW_DAYS is at least 31", types.RADAR_KEEP_VIEW_DAYS >= 31, types.RADAR_KEEP_VIEW_DAYS);
  // A new open role at Larchmont Data (SaaS) today: the morning run delivers it, and the delivery forgets days older than the keep.
  const role = { key: "larchmont data::fractional vp sales", company: NAMES.c_role, domain: "role.example", title: "Fractional VP Sales", function: "Sales", type: "Fractional", url: "https://jobs.example.com/vp-sales", source: "board", postedAt: null, rate: null, hoursPerWeek: null };
  await t.applyScan({ roles: [role], sources: [{ source: "board", fetched: 1, matched: 1 }] }, nowIso());
  await new Promise((r) => setTimeout(r, 50));
  const run = await radar.runRadar({ now: nowIso(), force: true });
  const kept = (await t.loadState()).radar?.members.mem_rae?.days ?? {};
  check("the run delivered to Rae", run.ran && run.members >= 1 && (kept[ago(0)] ?? []).some((x) => x.c === "c_role"), { run, today: kept[ago(0)] });
  check("a day older than 31 days is forgotten, every day back to 30 is kept", !kept[ago(33)] && !!kept[ago(30)] && !!kept[ago(29)] && Object.keys(kept).every((d) => Date.now() - Date.parse(`${d}T00:00:00Z`) <= types.RADAR_KEEP_VIEW_DAYS * DAY), Object.keys(kept).sort());
  const after = await view(RAE, "auto");
  check("and the new company is in each range, each count up by one", ids(after).includes(P.role) && JSON.stringify(counts(after)) === JSON.stringify({ today: 3, "7d": 6, "30d": 9 }), counts(after));

  /* ---------- the state's cost ---------- */
  console.log("\nThe state's cost: a member with 30 days of history");
  // The rows the run kept are real ones (lib/radar sentRow): Sam, a made-up member, gets a month of them, `perDay` signals a
  // day (a third each High, Medium and Low, each kind's line), and the state file is measured with and without his history.
  const real = (kept[ago(0)] ?? []).find((x) => x.c === "c_role")!;
  const rowBytes = (x: unknown) => JSON.stringify(x).length + 1;
  const stateFile = () => readFileSync(path.join(dir, "intel.json"), "utf8").length;
  const history = (perDay: number, days: number) => {
    const out: Record<string, unknown[]> = {};
    for (let d = 0; d < days; d++)
      out[ago(d)] = Array.from({ length: perDay }, (_, i) => ({ ...row(`c_${String(10000 + d * perDay + i)}`, (["High", "Medium", "Low"] as const)[i % 3], [LINE.role, LINE.hire, LINE.end][i % 3]), k: `${["role", "hire", "end"][i % 3]}:${pub(`e_${d}_${i}`)}` }));
    return out;
  };
  const sam = async (perDay: number, days: number) => {
    await T.mutate((dd) => {
      dd.radar!.members.mem_sam = days ? { sent: {}, lastAt: nowIso(), lastCount: perDay, lastVia: "email", days: history(perDay, days) as never } : (undefined as never);
      if (!days) delete dd.radar!.members.mem_sam;
    });
    return { state: stateFile(), sam: JSON.stringify((await t.loadState()).radar?.members.mem_sam ?? {}).length };
  };
  const base = (await sam(0, 0)).state;
  const avgRow = JSON.stringify(Object.values(history(12, 1))[0]).length / 12;
  const lines = [`a real kept row ${rowBytes(real)} bytes, the made-up ones ${avgRow.toFixed(0)} bytes on average; the made-up state without Sam ${(base / 1024).toFixed(1)} KB`];
  const results: Record<number, { was: number; now: number; state: number }> = {};
  for (const perDay of [5, 12, 30, 200]) {
    const was = await sam(perDay, 15);
    const now = await sam(perDay, 31);
    results[perDay] = { was: was.sam, now: now.sam, state: now.state };
    lines.push(
      `${perDay} a day: Sam's radar ${(was.sam / 1024).toFixed(1)} KB kept 15 days, ${(now.sam / 1024).toFixed(1)} KB kept 31 days (+${((now.sam - was.sam) / 1024).toFixed(1)} KB); ` +
        `the state ${(now.state / 1024).toFixed(1)} KB, his radar ${((100 * now.sam) / now.state).toFixed(0)}% of it`,
    );
  }
  await sam(0, 0);
  for (const l of lines) console.log(`  ${l}`);
  check("a real kept row is a few hundred bytes", rowBytes(real) < 500, rowBytes(real));
  check("31 days cost about twice 15 days, no more", Object.values(results).every((r) => r.now / r.was < 2.2), results);
  check("a typical month (12 a day) is under 100 KB a member", results[12].now < 100 * 1024, results[12]);
}

try {
  await main();
} catch (e) {
  failures++;
  console.log("FAIL threw:", e);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
