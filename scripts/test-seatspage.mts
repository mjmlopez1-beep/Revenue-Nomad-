/**
 * Checks of the Seats page (app/post/seatsPage, Seats.dc.html): its three tabs, the "ended lately"
 * list, Your seats' verification words, what it says a seat earned, Merlin's guesses from seats on
 * file under the member's name, and the workbench's seat columns and tools it runs on.
 *
 *   npx tsx scripts/test-seatspage.mts      exits 1 on any failure
 *
 * Pure: no server, no network, no seed. Every record is made up here (member Jordan Avery;
 * companies Northwind Clinics, Cedar and Pine, Halcyon Freight, Larkspur Learning).
 *
 * Covered:
 *   - the tabs: the page "seats" is Your seats; the table listing seats is All seats, or Seats that
 *     ended lately with its filter on; switching between the two data tabs changes only that filter;
 *     the table's place is the Seats page for seats, and Hiring now its own page (shell/slots.ts);
 *   - ended lately: when a seat ended (the month on show, else when Merlin recorded it), how long ago
 *     in the free words, never the month; the newest end first; model.ts endedTest agrees;
 *   - Your seats: Verified, Waiting for a member (with the credits that wait), With an admin;
 *     earned at a company from the credit history, waiting apart; dates in a few words;
 *   - guesses: only a name from public profiles that is the member's own as written, at a company
 *     they can see, not theirs yet and with no claim waiting; a one-word name guesses nothing;
 *   - the workbench for seats: its default columns, Added by's fill, each seat run's row needs (the
 *     row's own seat, a locked company waits, nothing on file is skipped), and Tools has no export.
 */
import type { EngagementRec, Cell, LedgerRow } from "../lib/tableTypes";

let failures = 0;
let passes = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) {
    passes++;
    console.log(`PASS ${name}`);
  } else {
    failures++;
    console.log(`FAIL ${name}${detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 400)}`}`);
  }
};

const v = (x: string, more: Record<string, unknown> = {}): Cell => ({ s: "value", v: x, ver: 0, ...more }) as Cell;
const locked: Cell = { s: "locked", ver: 0 };
const empty: Cell = { s: "empty" };
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 23, 12);
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

function seat(id: string, cells: Record<string, Cell>, more: Partial<EngagementRec> = {}): EngagementRec {
  return { id, source: "Seat scan", verified: false, cells, people: [], updatedAt: null, yours: false, ...more } as EngagementRec;
}
function co(id: string, name: string, engs: EngagementRec[], hidden = false) {
  return { c: { id, name, hidden, cells: { industry: v("Health Care") }, engagements: engs }, engs, people: [], domain: null } as never;
}

async function main() {
  const S = await import("../app/post/seatsPage/seatsModel");
  const SL = await import("../app/post/shell/slots");
  const M = await import("../app/post/model");
  const C = await import("../app/post/workbench/columns");
  const TL = await import("../app/post/workbench/tools");

  /* ----- the tabs ----- */
  const f0 = { ...M.EMPTY_FILTERS, industry: ["Health Care"] };
  check("the page seats is Your seats, whatever the filters", S.tabOf("mine", f0) === "mine" && S.tabOf("mine", { ...f0, endedWithin: 3 }) === "mine");
  check("the table listing seats is All seats, or Seats that ended lately with its filter on", S.tabOf("data", f0) === "all" && S.tabOf("data", { ...f0, endedWithin: 3 }) === "ended");
  const toEnded = S.endedFilters(f0, "ended");
  const back = S.endedFilters(toEnded, "all");
  check("Seats that ended lately is the last 90 days (3 months), and only that filter changes", toEnded.endedWithin === S.ENDED_MONTHS && S.ENDED_MONTHS === 3 && JSON.stringify(toEnded.industry) === JSON.stringify(["Health Care"]));
  check("back to All seats takes only that filter off", back.endedWithin === 0 && JSON.stringify({ ...back }) === JSON.stringify({ ...f0 }));
  check("the table's place: Companies is the workbench, seats the Seats page", SL.tableSlotOf("companies", "all") === "companies2" && SL.tableSlotOf("engagements", "all") === "seats2" && SL.tableSlotOf("engagements", "repeat") === "seats2");
  check("People is the People page; Hiring now is its own page", SL.tableSlotOf("people", "all") === "people2" && SL.tableSlotOf("engagements", "hiring") === "hiring2");

  /* ----- ended lately ----- */
  const endShown = seat("e1", { status: v("Ended"), end: v("2026-10") }, { updatedAt: iso(200) });
  const endLocked = seat("e2", { status: v("Ended"), end: locked }, { updatedAt: iso(45) });
  const endOld = seat("e3", { status: v("Ended"), end: locked }, { updatedAt: iso(200) });
  const active = seat("e4", { status: v("Active"), end: v("Ongoing") }, { updatedAt: iso(1) });
  const endRecent = seat("e5", { status: v("Ended"), end: locked }, { updatedAt: iso(10) });
  check("a seat that ended: its month where on show", S.endedAt(endShown) === Date.UTC(2026, 9, 28));
  check("a locked end month: when Merlin recorded the seat as ended", S.endedAt(endLocked) === Date.parse(iso(45)));
  check("a seat that hasn't ended has no end", S.endedAt(active) === null);
  const bands = [endRecent, endLocked, endShown, endOld].map((e) => S.endedBand(e, NOW));
  check("how long ago, in the free words", JSON.stringify(bands) === JSON.stringify(["In the last 30 days", "31 to 60 days ago", "In the last 30 days", null]), bands);
  const MONTHS = /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|20\d\d/;
  check("the free words never say the month a locked end opens", bands.every((b) => !b || !MONTHS.test(b)));
  const rows = [active, endOld, endLocked, endRecent].map((e) => ({ key: e.id, i: co("c1", "Northwind Clinics", [e]), e }));
  check("the ended list: the most recent end first, a seat with none last", S.sortEnded(rows as never).map((r) => r.key).join(",") === "e5,e2,e3,e4");
  const t3 = M.endedTest(3, [], NOW);
  check("model.ts endedTest agrees on the 90 days", rows.filter((r) => t3(r as never)).map((r) => r.key).sort().join(",") === "e2,e5");

  /* ----- Your seats ----- */
  const mine = (cells: Record<string, Cell>, more: Partial<EngagementRec> = {}) => seat("y", { operator: v("Jordan Avery", { mine: true }), ...cells }, { yours: true, ...more });
  check("matched to work the member published: Verified", S.verificationOf(mine({}, { source: "Published engagement" })).word === "Verified");
  check("the company confirmed it: Verified", S.verificationOf(mine({}, { verified: true })).ok);
  check("two members confirmed the name: Verified", S.verificationOf(mine({ operator: v("Jordan Avery", { ver: 2 }) })).sub === "2 members confirmed it");
  check("their claim on a name not theirs as written: With an admin", S.verificationOf(mine({}, { claimWaiting: true })).word === "With an admin");
  const w = S.verificationOf(mine({}), 4);
  check("credits that wait are said with the count", w.word === "Waiting for a member" && /4 credits wait/.test(w.sub), w);
  check("otherwise it waits for a member to confirm a fact", S.verificationOf(mine({})).word === "Waiting for a member" && !S.verificationOf(mine({})).ok);
  const ledger: LedgerRow[] = [
    { at: iso(1), delta: 1, reason: "fill", company: "Northwind Clinics", field: "rate" },
    { at: iso(1), delta: 1, reason: "fill", company: "Northwind Clinics", field: "hours" },
    { at: iso(1), delta: 1, reason: "fill", company: "Northwind Clinics", field: "reason", pending: true },
    { at: iso(1), delta: -2, reason: "unlock", company: "Northwind Clinics", field: "identity" },
    { at: iso(1), delta: 1, reason: "fill", company: "Cedar and Pine", field: "rate" },
  ];
  const er = S.earnedAt(ledger, "Northwind Clinics");
  check("earned at a company: paid and waiting apart, spending not counted, other companies not counted", er.paid === 2 && er.waiting === 1, er);
  const when = [
    S.whenWords(seat("a", { start: v("2024-02"), end: v("2024-12"), status: v("Ended") })),
    S.whenWords(seat("b", { start: v("2023-03"), end: v("2024-01"), status: v("Ended") })),
    S.whenWords(seat("c", { start: v("2026-06"), end: v("Ongoing"), status: v("Active") })),
    S.whenWords(seat("d", { start: v("2021"), end: empty, status: empty })),
    S.whenWords(seat("e", { start: empty, end: empty, status: empty })),
  ];
  check("dates in a few words", JSON.stringify(when) === JSON.stringify(["Feb to Dec 2024", "Mar 2023 to Jan 2024", "Since Jun 2026", "Since 2021", null]), when);

  /* ----- guesses: seats on file under the member's name ----- */
  const pub = (id: string, name: string, more: Partial<EngagementRec> = {}, cell: Record<string, unknown> = { unverified: true }) => seat(id, { operator: v(name, cell) }, more);
  const infos = [
    co("c1", "Northwind Clinics", [pub("g1", "Jordan  avery"), pub("g2", "Jordan Avery", {}, {}), pub("g3", "Jordan Avery", { yours: true })]),
    co("c2", "Cedar and Pine", [pub("g4", "Jordan Avery", { claimWaiting: true }), pub("g5", "J. Avery")]),
    co("c3", "Halcyon Freight", [pub("g6", "Jordan Avery")], true),
    co("c4", "Larkspur Learning", [pub("g7", "jordan avery")]),
  ];
  const g = S.onFileUnderName(infos as never, { name: "Jordan Avery" }).map((x) => x.e.id);
  check("guesses: the member's own name as written, unverified, at a company they can see, not theirs, no claim waiting", g.join(",") === "g1,g7", g);
  check("a one-word name guesses nothing", S.onFileUnderName(infos as never, { name: "Jordan" }).length === 0);
  check("the step's place in Getting started", S.stepWords(["icp", "seat", "network", "open", "alert"], "seat") === "Step 2 of 5" && S.stepWords(["icp"], "seat") === null);

  /* ----- the workbench for seats ----- */
  const defs = C.defaultCols("engagements");
  check("the seat columns the mockup shows by default, in its order", defs.join(",") === "company,function,role,operator,type,status,start,end,hours,rate,reason,source", defs);
  const src = C.columnOf("engagements", "source")!;
  check("Added by is free and on file wherever a seat has a source", src.cost === "free" && src.fill({ key: "x", i: co("c1", "Northwind Clinics", []), e: seat("s", {}) } as never) === "value");
  const open = co("c1", "Northwind Clinics", []);
  const shut = co("c2", "Cedar and Pine", [], true);
  const r = (i: unknown, e: EngagementRec) => ({ key: e.id, i, e }) as never;
  const sRate = seat("s1", { rate: locked, end: locked, status: v("Ended"), operator: locked });
  check("a seat row's rate run buys that seat's own rate", JSON.stringify(C.rowNeed("rate", r(open, sRate))) === JSON.stringify({ entity: "engagement", id: "s1", field: "rate" }));
  check("a seat row's end run buys that seat's end month", JSON.stringify(C.rowNeed("end", r(open, sRate))) === JSON.stringify({ entity: "engagement", id: "s1", field: "end" }));
  check("a holder out of the directory: one unlock on the seat", JSON.stringify(C.rowNeed("operator", r(open, sRate))) === JSON.stringify({ entity: "engagement", id: "s1", field: "operator" }));
  check("at a locked company each waits for the company", ["rate", "end", "operator"].every((k) => C.rowNeed(k, r(shut, sRate)) === "wait"));
  check("nothing on file to buy is skipped, never charged", C.rowNeed("rate", r(open, seat("s2", { rate: empty }))) === "skip" && C.rowNeed("end", r(open, seat("s3", { end: v("2026-01") }))) === "skip");
  const ctx = { me: { proOpens: null, plan: null, credits: 25 } as never, network: false, close: true };
  const items = TL.toolItems("engagements", ctx);
  const enrich = items.filter((x) => x.tab === "enrich").map((x) => `${x.label}=${x.cost}`);
  check("Tools on Seats: the seat columns with their price a row", ["Rate paid=1 / row", "Month it ended=1 / row", "A holder out of the directory=1 / row", "Who held the seat=Free"].every((x) => enrich.includes(x)), enrich);
  check("Tools on Seats: no export, CSV or download anywhere", !items.some((x) => /export|csv|download/i.test(`${x.label} ${x.sub}`)));
  check("the companies list keeps its own Enrich items, no seat ones", !TL.toolItems("companies", ctx).some((x) => x.id.startsWith("seat-")));

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures) process.exit(1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
