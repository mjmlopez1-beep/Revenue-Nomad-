/**
 * Checks of GET /api/table?today=1 (lib/today.ts todayView, TodayView in lib/viewWire.ts): what
 * Today draws before the full view. No server: lib/table.ts runs in process on a made-up seed in a
 * temporary data dir, with fetch replaced, so nothing leaves the machine.
 *
 *   npx tsx scripts/test-today.mts      exits 1 on any failure
 *
 * Covered: signed out is nothing; the member is the view's own Me, their free company of the day;
 * Crystal Ball's rows are its own (the top 4 of its latest day, ranked as it ranks them) and count
 * the day; today's moves are up to three of that day's companies (scripts/test-moves.mts checks
 * which, and everything else about them), and each move's record is exactly the record the member's
 * table builds (its locks with it), so a locked company names nothing and an unlocked one is named;
 * under 20 KB; and with &since=
 * the counts for "Since Tuesday": the day's companies, roles opened in the member's function and
 * followed companies with a new fact.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-today-"));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const ago = (ms: number) => new Date(t0 - ms).toISOString();
const monthAgo = (n: number) => {
  const d = new Date(t0);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};
const seat = (id: string, companyId: string, fields: Record<string, string>, addedAt?: string) => ({ id, companyId, fields, verified: false, ...(addedAt ? { addedAt } : {}) });

const seed = {
  builtAt: ago(30 * DAY),
  members: [
    { id: "mem_sal", name: "Sal Starter", email: "sal.starter@example.com", title: "Fractional VP Sales", token: "tok-sal-today" },
    { id: "mem_mo", name: "Mo Marketer", email: "mo.marketer@example.com", title: "Fractional CMO", token: "tok-mo-today" },
    { id: "mem_noicp", name: "Ned Noprofile", email: "ned.noprofile@example.com", title: "Fractional VP Sales", token: "tok-noicp-today" },
  ],
  companies: [
    { id: "c_acme", fields: { name: "Acme Robotics", website: "acme.example", industry: "SaaS", employees: "51–200", revenue: "$1M–$5M", hq: "Austin, TX" } },
    { id: "c_beta", fields: { name: "Beta Labs", website: "beta.example", industry: "SaaS", employees: "11–50", revenue: "$1M–$5M", hq: "Denver, CO" } },
    { id: "c_fox", fields: { name: "Fox Freight", website: "fox.example", industry: "SaaS", employees: "201–500", revenue: "$20M–$50M", hq: "Chicago, IL" } },
    { id: "c_kilo", fields: { name: "Kilo Kitchens", website: "kilo.example", industry: "SaaS", employees: "51–200", hq: "Phoenix, AZ" } },
    { id: "c_lima", fields: { name: "Lima Logistics", website: "lima.example", industry: "SaaS", employees: "51–200", hq: "Tampa, FL" } },
    { id: "c_mike", fields: { name: "Mike Metals", website: "mike.example", industry: "SaaS", employees: "11–50", hq: "Dallas, TX" } },
  ],
  engagements: [
    // Fractional Marketing hires (Marketing comes before Sales): Crystal Ball's companies for Sal, today.
    seat("e_acme_mkt", "c_acme", { source: "Seat scan", operator: "Hana Holder", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(2 * HOUR)),
    seat("e_beta_mkt", "c_beta", { source: "Seat scan", role: "Fractional VP Marketing", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(2 * HOUR)),
    seat("e_fox_mkt", "c_fox", { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(2 * HOUR)),
    seat("e_kilo_mkt", "c_kilo", { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(2 * HOUR)),
    seat("e_lima_mkt", "c_lima", { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(2 * HOUR)),
    seat("e_mike_mkt", "c_mike", { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(2 * HOUR)),
    // An open Sales role whose title names its company, opened an hour ago.
    seat("e_beta_open", "c_beta", { source: "Demand scan", role: "Fractional VP Sales at Beta Labs", function: "Sales", status: "Open role", posting: "https://beta.example/jobs/vp-sales", rate: "$9k/mo" }),
  ],
  contacts: [{ id: "p_acme_ceo", engagementId: "e_acme_mkt", fields: { name: "Carla Chief", title: "CEO", relationship: "Hiring for the seat", email: "carla@acme.example" } }],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const US_MID = { industries: [], employees: ["11–50", "51–200", "201–500"], revenue: [], countries: ["United States"] };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(HOUR)])),
    profiles: {
      mem_sal: { function: "Sales", onboarded: true, icp: US_MID },
      mem_mo: { function: "Marketing", onboarded: true, icp: US_MID },
      mem_noicp: { function: "Sales", onboarded: true },
    },
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-today@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
});
for (const k of ["RN_BILLING", "STRIPE_SECRET_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_FREE_COMPANY", "RESEND_API_KEY"]) delete process.env[k];
globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};
const NAMES = ["Acme Robotics", "Acme", "Beta Labs", "Fox Freight", "Kilo Kitchens", "Lima Logistics", "Mike Metals", "Hana Holder", "Carla Chief", "acme.example", "beta.example"];
const named = (x: unknown, names = NAMES) => {
  const s = typeof x === "string" ? x : JSON.stringify(x);
  return names.filter((n) => new RegExp(`\\b${n.replace(/\./g, "\\.")}\\b`, "i").test(s));
};
/** The same JSON, key order aside. */
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const sortKeys = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(sortKeys) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys((x as Record<string, unknown>)[k])])) : x;

async function main() {
  const t = await import("../lib/table");
  const radar = await import("../lib/radar");
  const { todayView, TODAY_MAX } = await import("../lib/today");
  const { unpackCompany } = await import("../lib/viewWire");
  const SAL = "tok-sal-today";
  const BASE = "https://post.example.com";

  check("signed out: nothing", (await todayView(null)) === null && (await todayView("not-a-token")) === null);

  const view = await t.buildView(SAL);
  const rv = await radar.radarView(SAL);
  const today = (await todayView(SAL))!;
  const raw = JSON.stringify(today);
  check("Crystal Ball has a day of companies for Sal", (rv?.rows.length ?? 0) >= 5, rv?.rows.length);
  check("the member is the view's own Me", today.me.id === view.me!.id && today.me.credits === view.me!.credits && today.me.function === "Sales" && today.me.token === view.me!.token, today.me);
  check("the free company of the day is said", typeof today.freeCompany === "boolean" && today.freeCompany === !!view.me!.freeCompany);
  check("no plan while billing is off", !("plan" in today));
  check("the rows are Crystal Ball's top 4, in its order", same(today.radar.rows, rv!.rows.slice(0, 4)), { today: today.radar.rows.map((x) => x.id), radar: rv!.rows.map((x) => x.id) });
  check("the day, the function and how many companies that day", today.radar.day === rv!.day && today.radar.fn === "Sales" && today.radar.newCount === rv!.rows.length && today.radar.on && today.radar.ready, today.radar);
  check("under 20 KB", raw.length < TODAY_MAX, raw.length);
  check("no since without &since=", !("since" in today));
  check("names no company and no person while they are locked", !named(today).length, named(today));
  // Today's moves: three different companies of the day, each with its record, as the table builds it.
  const recs = today.companies.map((c) => unpackCompany(JSON.parse(JSON.stringify(c))));
  const byId = new Map(view.companies.map((c) => [c.id, c]));
  const moves = today.moves!.list;
  const dayIds = new Set(rv!.rows.map((x) => x.id));
  check("three moves, each a different company of Crystal Ball's day, with that company's own row", moves.length === 3 && new Set(moves.map((w) => w.id)).size === 3 && moves.every((w) => dayIds.has(w.id) && same(w.row, rv!.rows.find((x) => x.id === w.id))), moves.map((w) => w.id));
  check("no network, no Google line, nothing done yet (the connector is off here)", moves.every((w) => !w.know) && today.moves!.google === "off" && today.moves!.month === 0, today.moves);
  check("every move comes with its record", recs.length === moves.length && recs.every((c, i) => c.id === moves[i].id), recs.map((c) => c.id));
  check("each record is the member's table's own record", recs.every((c) => same(c, byId.get(c.id))), recs.find((c) => !same(c, byId.get(c.id)))?.id);
  check("a locked record shows the free facts and no name", recs.every((c) => c.hidden && c.name === "Locked company" && c.cells.industry?.s === "value" && c.cells.website?.s === "locked"), recs[0]?.cells);

  // Unlocked: the record names it, as the table does.
  const first = moves[0].id;
  await t.perform(SAL, { type: "unlock", entity: "company", id: first, field: "identity" }, BASE);
  const after = (await todayView(SAL))!;
  const rec = after.companies.find((c) => c.id === first);
  const fromView = (await t.buildView(SAL)).companies.find((c) => c.id === first);
  check("after Unlock company, its record is named, as in the table", !!rec && !rec.hidden && rec.name === fromView?.name && rec.name !== "Locked company", rec?.name);
  check("and only that one", after.companies.filter((c) => !c.hidden).length === 1);

  // Another member sees their own.
  const mo = (await todayView("tok-mo-today"))!;
  check("another member gets their own Me and nothing Sal unlocked", mo.me.id === "mem_mo" && mo.companies.every((c) => c.hidden) && !named(mo).length, named(mo));
  const ned = (await todayView("tok-noicp-today"))!;
  // A function but no Ideal Fractional Profile: Crystal Ball looks at any company (lib/radar anyCompany), still capped at 4 here and still locked.
  check("without a profile: ready, any company, still locked", ned.radar.ready && ned.radar.rows.length <= 4 && ned.companies.every((c) => c.hidden), ned.radar);

  // Since Tuesday: Sal follows a company, Mo adds a fact there.
  const follow = today.radar.rows[1].id;
  await t.perform(SAL, { type: "follow", companyId: follow, on: true }, BASE);
  const since = ago(3 * HOUR);
  await t.perform("tok-mo-today", { type: "unlock", entity: "company", id: follow, field: "identity" }, BASE);
  await t.perform("tok-mo-today", { type: "fill", entity: "company", id: follow, field: "ownership", value: "VC-backed" }, BASE);
  const withSince = (await todayView(SAL, since))!;
  check("&since= gives the counts", !!withSince.since && withSince.since.sinceIso === new Date(since).toISOString(), withSince.since);
  check("Crystal Ball's companies since then", withSince.since?.radar === rv!.days.filter((d) => d.day >= since.slice(0, 10)).reduce((n, d) => n + d.companies, 0) && (withSince.since?.radar ?? 0) > 0, withSince.since);
  check("a followed company with a new fact counts", withSince.since?.follows === 1, withSince.since);
  check("no role opened in Sales since then", withSince.since?.roles === 0, withSince.since);
  // The seed's open role was first seen when the seed was built, 30 days ago.
  const month = (await todayView(SAL, ago(31 * DAY)))!;
  check("the open Sales role counts as opened since a month ago", month.since?.roles === 1, month.since);
  const mark = new Date().toISOString();
  await new Promise((r) => setTimeout(r, 5));
  const later = (await todayView(SAL, mark))!;
  check("nothing since just now", later.since?.follows === 0 && later.since?.roles === 0, later.since);
  check("a since in the future or past the window is left out", !("since" in (await todayView(SAL, new Date(Date.now() + DAY).toISOString()))!) && !("since" in (await todayView(SAL, "2001-01-01"))!) && !("since" in (await todayView(SAL, "nonsense"))!));
  const moSince = (await todayView("tok-mo-today", since))!;
  check("Mo's roles count is in Marketing (none open), and Mo follows nothing", (await todayView("tok-mo-today", ago(31 * DAY)))?.since?.roles === 0 && moSince.since?.follows === 0, moSince.since);

  await firstSession(t, radar, SAL, BASE);
}

/**
 * A new member's first session (app/post/todayModel.ts, Moves.tsx, CrystalOpen.tsx, Home.tsx): the
 * Crystal Ball button by plan and balance, a click on a row, the trial's card and pill, the
 * directory question held back, the ranges, the search's names, and an open role in their function
 * showing its title, posted rate and the posting once its company is open.
 */
async function firstSession(t: typeof import("../lib/table"), radar: typeof import("../lib/radar"), SAL: string, BASE: string) {
  const m = await import("../app/post/todayModel");
  const gs = await import("../app/post/getStarted");
  const moves = await import("../lib/moves");
  const me = (o: Partial<{ crystal: "all" | "one" | "used"; credits: number; freeCompany: boolean; unlocksLeft: number }>) => ({ crystal: undefined, credits: 25, freeCompany: false, unlocksLeft: undefined, ...o });

  // The Crystal Ball button: Free after today's free one is the ordinary unlock, with Pro beside it, never only an upgrade.
  check("Trial and Pro: Open", JSON.stringify(m.crystalButton(me({ crystal: "all" }))) === JSON.stringify({ kind: "crystal", label: "Open", pro: false }));
  check("Free with today's left: Open free · 1 left today", m.crystalButton(me({ crystal: "one" }))?.label === "Open free · 1 left today" && m.crystalButton(me({ crystal: "one" }))?.kind === "crystal");
  const used = m.crystalButton(me({ crystal: "used", credits: 25 }));
  check("Free, today's used, credits in hand: Unlock · 2 credits, the ordinary unlock, with the Pro link", used?.kind === "unlock" && used.label === "Unlock · 2 credits" && used.pro && m.CRYSTAL_PRO_LINK === "Pro opens all of these free", used);
  const broke = m.crystalButton(me({ crystal: "used", credits: 1 }));
  check("Free, today's used, short of credits: the same words, and the zero-credit wall on a click", broke?.kind === "wall" && broke.label === "Unlock · 2 credits", broke);
  check("Free, today's used, at 0 credits: the wall too", m.crystalButton(me({ crystal: "used", credits: 0 }))?.kind === "wall");
  check("the day's unlock limit binds: Unlocks again tomorrow", m.crystalButton(me({ crystal: "used", credits: 25, unlocksLeft: 1 }))?.kind === "later");
  check("billing off: no Crystal Ball button (the record's own Unlock company)", m.crystalButton(me({})) === null);
  check("the used line states the cost", m.CRYSTAL_USED_UNLOCK.includes("2 credits") && !/Upgrade/.test(m.CRYSTAL_USED_UNLOCK), m.CRYSTAL_USED_UNLOCK);
  // A click on the row opens free only where the plan does; never a credit on a row click.
  check("a row click opens free on Trial, Pro and Free's one a day", m.rowOpensFree({ crystal: "all" }) && m.rowOpensFree({ crystal: "one" }));
  check("a row click spends nothing after Free's is used, or with billing off (the record states the cost)", !m.rowOpensFree({ crystal: "used" }) && !m.rowOpensFree({}));

  // The trial's one-time card and the phone's pill.
  check("the trial card's line: free opens left of 15, then Crystal Ball's count in its own words", m.trialCardLine(21, { left: 15, of: 15 }, 18) === "Your trial runs 21 more days. On Pro, Close and the trial, any company opens free, up to 15 a day, and your Crystal Ball companies don't count toward that. 15 of 15 free opens left today. 18 companies are in your Crystal Ball today.", m.trialCardLine(21, { left: 15, of: 15 }, 18));
  check("with no counts it leaves them out", m.trialCardLine(20, null, 0) === "Your trial runs 20 more days. On Pro, Close and the trial, any company opens free, up to 15 a day, and your Crystal Ball companies don't count toward that.", m.trialCardLine(20, null, 0));
  check("today's opens used: it says so, not 0 left", /Today's 15 free opens are used\. More open free tomorrow\.$/.test(m.trialCardLine(20, { left: 0, of: 15 })), m.trialCardLine(20, { left: 0, of: 15 }));
  check("the phone's trial pill", m.trialPillWords({ name: "trial", trialDaysLeft: 18 }) === "Close trial · 18 days left" && m.trialPillWords({ name: "trial", trialDaysLeft: 1 }) === "Close trial · last day");
  check("no pill off the trial", m.trialPillWords({ name: "free", trialDaysLeft: null }) === null && m.trialPillWords({ name: "pro", trialDaysLeft: null }) === null && m.trialPillWords(undefined) === null);

  // "Show you in the Fractionals directory?" waits for a first unlock or a second visit.
  const fresh = { fractionals: null, unlocked: 0, companiesUnlocked: 0, holdersUnlocked: 0 };
  check("the directory question waits on a first visit with nothing opened", !m.showMeDue(fresh, null));
  check("it comes after the first unlock", m.showMeDue({ ...fresh, companiesUnlocked: 1 }, null) && m.showMeDue({ ...fresh, unlocked: 1 }, null));
  check("or on the second visit", m.showMeDue(fresh, ago(DAY)));
  check("and never once answered", !m.showMeDue({ ...fresh, fractionals: false, unlocked: 3 }, ago(DAY)) && !m.showMeDue({ ...fresh, fractionals: true }, ago(DAY)));

  // Crystal Ball's ranges stay out of the way when all three count the same.
  check("three equal counts: no ranges", !m.rangesWorthShowing([{ companies: 6 }, { companies: 6 }, { companies: 6 }]));
  check("different counts: the ranges", m.rangesWorthShowing([{ companies: 2 }, { companies: 6 }, { companies: 6 }]));
  check("Home's line for tomorrow", m.TOMORROW_LINE === "Tomorrow: 3 new moves.");
  check("Get started on the trial says Crystal Ball opens free", gs.startSteps({ goal: null, added: 0, unlocked: 0, holdersUnlocked: 0, companiesUnlocked: 0, invited: 0, invitesPaid: 0, crystal: "all", freeCompany: true } as never, { seatsHeld: 0, seatsLeft: 0, earn: 0, stepOne: "company" }).steps[0].hint === gs.CRYSTAL_ALL_FREE);

  // Home's search: names the member can see, Crystal Ball's names on their plan included, at the start of a word.
  const list = [
    { id: "a", name: "Acme Robotics" },
    { id: "b", name: "Beta Labs" },
    { id: "c", name: "Northwind Acme" },
    { id: "a", name: "Acme Robotics" },
  ];
  check("a name's start matches first, then a word's start, each company once", m.nameMatches("acme", list).map((x) => x.id).join() === "a,c", m.nameMatches("acme", list));
  check("the middle of a word doesn't match, and one letter is nothing", !m.nameMatches("cme", list).length && !m.nameMatches("a", list).length);
  check("a word later in the name matches", m.nameMatches("labs", list).map((x) => x.id).join() === "b");
  const data = { rows: [{ id: "r1", kinds: [], lines: [], name: "Row Named" }, { id: "r2", kinds: [], lines: [] }], moves: { list: [{ id: "m1", row: { id: "m1", kinds: [], lines: [], name: "Move Named" } }], month: 0, google: "off" as const } };
  check("the Crystal Ball names Today carries (moves first), and only named ones", JSON.stringify(m.crystalNames(data as never)) === JSON.stringify([{ id: "m1", name: "Move Named" }, { id: "r1", name: "Row Named" }]), m.crystalNames(data as never));
  check("no Today data: no names", m.crystalNames(null).length === 0);

  // An open role in their function: once its company is open, the move carries the role, its posting and its posted rate.
  const before = await t.buildView(SAL);
  const rv = await radar.radarView(SAL);
  const beta = before.companies.find((c) => c.engagements.some((e) => moves.openRoleSeat(e) && e.cells.function?.s === "value" && (e.cells.function as { v: string }).v === "Sales"));
  const row = beta ? rv!.rows.find((r) => r.id === beta.id) : undefined;
  check("the company hiring a Sales role is in Sal's Crystal Ball", !!beta && !!row, { beta: beta?.id, rows: rv?.rows.map((r) => r.id) });
  if (!beta || !row) return;
  const meSal = { name: "Sal Starter", function: "Sales" };
  const locked = moves.buildMove(beta, row, undefined, meSal);
  // (Sal may have opened it in the checks above: then it is the open company already.)
  check("Hiring now, with the open role in their function", locked.hiring && !!locked.open && (beta.hidden ? locked.do === "open" && locked.open.posting === "locked" : locked.do === "reply"), locked);
  if (beta.hidden) await t.perform(SAL, { type: "unlock", entity: "company", id: beta.id, field: "identity" }, BASE);
  const after = (await t.buildView(SAL)).companies.find((c) => c.id === beta.id)!;
  const open = moves.buildMove(after, row, undefined, meSal);
  const seatRec = after.engagements.find((e) => e.id === open.open?.seatId);
  check("open: the role's posting is a link the move can open", !after.hidden && !!open.open && open.open.posting === "https://beta.example/jobs/vp-sales", open.open);
  check("open: the role's title shows", open.open?.title === "Fractional VP Sales at Beta Labs", open.open?.title);
  check("open: the posted rate shows, with no hours posted", !!seatRec && m.roleTermsLine(seatRec.cells as never) === "$9k/mo", seatRec && m.roleTermsLine(seatRec.cells as never));
  check("the terms line: hours too, no rate posted, and nothing while the rate is locked", m.roleTermsLine({ hours: { s: "value", v: "20" } }) === "No rate posted · 20 hours a week" && m.roleTermsLine({ rate: { s: "locked" } }) === null);
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
