/**
 * Checks for the app's client-side read model (app/post/model.ts): the Open roles filter on
 * company, engagement and people rows, what counts as "Unlocked" now that hours per week
 * is free, and the dates on roles the weekly scan follows. Also the credit history's sentences
 * (app/post/ledger.ts), which must keep up with the labels the server sends, and how long a
 * toast stays up. Pure functions, no server.
 *
 *   npx tsx scripts/test-model.mts      exits 1 on any failure
 */
import type { Cell, CompanyRec, EngagementRec, Me, PersonRec } from "../lib/tableTypes";
import { ALL_FIELDS, GROUPS, HIDDEN_COMPANY } from "../lib/tableFields";
import { ledgerLine, owedLine, unlockLimitLine } from "../app/post/ledger";
import { atTime, fieldText } from "../app/post/hooks";
import {
  EMPTY_FILTERS, ENG_GATED, LIST_OPTIONS, NOT_YET_ON_OPEN_ROLE, activeChips, activeCount, applyFilters, coverOf, daysListed, deriveAll, hasRoleDates, isOpenSeat, isUnheldOpenRole,
  fitReason, fitTier, listedDays, lockedInEngagement, mySeats, namedFn, notMineLabel, placeWords, rowsFor, searchWords, seatMissingCount, sortRows, sortFor, sortsFor, SORTS, tabTest, toggleTest,
} from "../app/post/model";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      got ${JSON.stringify(detail)}`}`);
}

const val = (v: string, extra: Partial<Extract<Cell, { s: "value" }>> = {}): Cell => ({ s: "value", v, ver: 0, ...extra });
const EMPTY: Cell = { s: "empty" };
const LOCKED: Cell = { s: "locked", ver: 0 };

let n = 0;
function eng(cells: Record<string, Cell>, extra: Partial<EngagementRec> = {}): EngagementRec {
  const all: Record<string, Cell> = {};
  for (const f of GROUPS.find((g) => g.entity === "engagement")!.fields) if (!f.system) all[f.key] = EMPTY;
  return { id: `e${++n}`, source: "Demand scan", verified: false, cells: { ...all, ...cells }, people: [], updatedAt: null, yours: false, ...extra };
}
const person = (): PersonRec => ({ id: `p${++n}`, engagementId: null, source: "Member added", cells: { name: LOCKED, title: val("CEO"), relationship: EMPTY, email: EMPTY, phone: EMPTY, linkedin: EMPTY } });
function co(name: string, engagements: EngagementRec[], people: PersonRec[] = []): CompanyRec {
  return {
    id: `c${++n}`,
    name,
    iconDomain: null,
    cells: { website: EMPTY, industry: EMPTY, employees: EMPTY, revenue: EMPTY, hq: EMPTY, linkedin: EMPTY, about: EMPTY },
    friendly: { score: 30, tier: "Medium", fractional: 0, open: engagements.filter((e) => e.opened && !e.closed).length, functions: [], operators: 0, recent: 0 },
    engagements,
    people,
    following: false,
    facts: { known: 0, locked: 0, missing: 0 },
    updatedAt: null,
    mine: false,
  };
}
const me = { function: "Sales", goal: null } as unknown as Me;

/* ---------- the Open roles filter ---------- */

const openRole = eng({ status: val("Open role", { system: true }), role: LOCKED }, { opened: "2026-11-03", closed: null });
const closedRole = eng({ status: val("Closed", { system: true }), role: LOCKED }, { opened: "2026-11-03", closed: "2026-12-08" });
const filledRole = eng({ status: val("Active"), operator: LOCKED }, { opened: "2026-10-01", closed: "2026-10-20" });
const plainSeat = eng({ status: LOCKED, role: LOCKED, hours: val("15") }, { source: "Published engagement" });
const memberOpen = eng({ status: val("Open role") }, { source: "Member added" });

const companies = [
  co("Open Co", [openRole], [person()]),
  co("Closed Co", [closedRole, plainSeat], [person(), person()]),
  co("Filled Co", [filledRole]),
  co("Plain Co", [plainSeat2()], [person()]),
  co("Member Open Co", [memberOpen]),
];
function plainSeat2() {
  return eng({ status: LOCKED, role: LOCKED }, { source: "Published engagement" });
}
const infos = deriveAll(companies);
const count = (type: "companies" | "engagements" | "people", roleState: string[]) => applyFilters(rowsFor(type, infos), { ...EMPTY_FILTERS, roleState }, "all", "", me);

check("the filter's options are Open now and Closed", JSON.stringify(LIST_OPTIONS.roleState) === JSON.stringify(["Open now", "Closed"]));
check("Open now: company rows", count("companies", ["Open now"]).rows.map((r) => r.i.c.name).join() === "Open Co");
check("Closed: company rows", count("companies", ["Closed"]).rows.map((r) => r.i.c.name).join() === "Closed Co,Filled Co");
check("both chips together: any dated role", count("companies", ["Open now", "Closed"]).rows.length === 3);
check("Open now: engagement rows", count("engagements", ["Open now"]).rows.map((r) => r.e!.id).join() === openRole.id);
check("Closed: engagement rows (not the undated seat at the same company)", count("engagements", ["Closed"]).rows.map((r) => r.e!.id).sort().join() === [closedRole.id, filledRole.id].sort().join());
check("Open now: people rows at that company", count("people", ["Open now"]).rows.length === 1);
check("Closed: people rows at those companies", count("people", ["Closed"]).rows.length === 2);
check("a role a member marked open has no dates, so it is in neither", !count("companies", ["Open now", "Closed"]).rows.some((r) => r.i.c.name === "Member Open Co"));
const facets = count("engagements", []).facets.lists.roleState;
check("counts for each chip (engagements)", facets["Open now"] === 1 && facets.Closed === 2, facets);
const coFacets = count("companies", ["Closed"]).facets.lists.roleState;
check("a chip's own group is lifted when counting (companies)", coFacets["Open now"] === 1 && coFacets.Closed === 2, coFacets);
const chips = activeChips({ ...EMPTY_FILTERS, roleState: ["Open now", "Closed"] });
check("active chips read as plain words", chips.map((c) => c.label).join() === "Role open now,Role closed", chips.map((c) => c.label));
check("removing a chip clears only that one", chips[0].clear({ ...EMPTY_FILTERS, roleState: ["Open now", "Closed"] }).roleState.join() === "Closed");
check("active filters are counted", activeCount({ ...EMPTY_FILTERS, roleState: ["Closed"] }) === 1);
check("hasRoleDates: only companies with a followed role", infos.filter(hasRoleDates).map((i) => i.c.name).join() === "Open Co,Closed Co,Filled Co");

/* ---------- open seats and dates ---------- */

check("an open followed role is an open seat", isOpenSeat(openRole));
check("a closed one is not, so the record asks who held it", !isOpenSeat(closedRole) && !isOpenSeat(filledRole));
check("a role a member marked open is still an open seat", isOpenSeat(memberOpen));
check("days listed: Nov 3 to Dec 8 is 35", daysListed("2026-11-03", "2026-12-08") === 35);
check("days listed: the same day counts as 1", daysListed("2026-11-03", "2026-11-03") === 1);
check("days listed: across the daylight saving change", daysListed("2026-10-30", "2026-11-04") === 5 && daysListed("2026-03-06", "2026-03-11") === 5);

/* ---------- unlocked by me, with hours per week free ---------- */

const gated = GROUPS.find((g) => g.entity === "engagement")!.fields.filter((f) => f.gated).map((f) => f.key);
check("the app's gated list matches the field definitions", JSON.stringify([...ENG_GATED].sort()) === JSON.stringify([...gated].sort()), { app: ENG_GATED, fields: gated });
check("hours per week and status are not in it", !ENG_GATED.includes("hours") && !ENG_GATED.includes("status"));
const unlockedTab = (e: EngagementRec) => {
  const i = deriveAll([co("X", [e])])[0];
  return { eng: tabTest("unlocked", { key: e.id, i, e }), company: tabTest("unlocked", { key: i.c.id, i }) };
};
const hoursOnly = unlockedTab(eng({ hours: val("15"), role: LOCKED }, { source: "Published engagement" }));
check("someone else's hours showing is not an unlock", !hoursOnly.eng && !hoursOnly.company, hoursOnly);
const roleSeen = unlockedTab(eng({ role: val("Fractional CRO"), hours: val("15") }, { source: "Published engagement" }));
check("a role the member paid to see is", roleSeen.eng && roleSeen.company, roleSeen);
const followed = unlockedTab(eng({ status: val("Open role"), role: LOCKED }, { opened: "2026-11-03", closed: null }));
check("a followed role's free status is not an unlock", !followed.eng && !followed.company, followed);
const undated = unlockedTab(eng({ status: val("Active") }, { source: "Published engagement" }));
check("a status showing is not an unlock (status is free)", !undated.eng && !undated.company, undated);
const closedPosting = unlockedTab(eng({ status: val("Closed", { system: true }), posting: val("https://jobs.example.com/1", { from: "posting" }) }, { opened: "2026-10-01", closed: "2026-10-20" }));
check("a closed role's free posting is not an unlock", !closedPosting.eng && !closedPosting.company, closedPosting);
{
  const hiddenPaid = { ...co("Paid Co", [eng({ role: LOCKED }, { opened: "2026-11-03", closed: null })]), unlocked: true } as CompanyRec;
  check("a hidden company the member paid to see is in Unlocked (CompanyRec.unlocked)", tabTest("unlocked", { key: hiddenPaid.id, i: deriveAll([hiddenPaid])[0] }));
}
const seat = unlockedTab(eng({ operator: val("Jane Smith", { member: { title: "Fractional CRO", you: true } }), rate: val("$8k/mo") }, { source: "Published engagement", yours: true }));
check("the member's own seat, free to them, is not an unlock", !seat.eng && !seat.company, seat);
const own = unlockedTab(eng({ role: val("Fractional CRO", { mine: true }) }, { source: "Member added" }));
check("a fact the member added is not an unlock", !own.eng && !own.company, own);

/* ---------- Hiring now lists open roles ---------- */

{
  const open = eng({ status: val("Open role", { system: true }), function: val("Sales") }, { opened: "2026-11-03", closed: null });
  const past = [1, 2, 3, 4].map(() => eng({ function: val("Sales"), type: val("Fractional") }, { source: "Published engagement" }));
  const c = co("Busy Co", [open, ...past], [person()]);
  const i = deriveAll([c])[0];
  const seatRows = rowsFor("engagements", [i]);
  check("Hiring now, seats: only the open role, not the company's past seats", seatRows.filter((r) => tabTest("hiring", r)).map((r) => r.e!.id).join() === open.id);
  check("Hiring now, companies: the company", tabTest("hiring", { key: c.id, i }));
}

/* ---------- search reads the row ---------- */

{
  const mk = eng({ function: val("Marketing"), role: val("Fractional CMO"), source: val("Member success story", { system: true }) }, { source: "Member success story" });
  const sales = eng({ function: val("Sales"), role: LOCKED }, { source: "Published engagement" });
  const c = co("Supersend", [mk, sales], [person()]);
  c.cells = { ...c.cells, website: val("https://www.supersend.io"), about: val("We help phone teams hone their outreach."), industry: val("Software") };
  const i = deriveAll([c])[0];
  const seats = (q: string) => applyFilters(rowsFor("engagements", [i]), EMPTY_FILTERS, "all", q, me).rows.map((r) => r.e!.id);
  check("a seat search matches that seat, not every seat at the company", seats("marketing").join() === mk.id, seats("marketing"));
  check("a seat search reads the company name and domain", seats("supersend").length === 2);
  check("a seat search reads the company's industry", seats("software").length === 2);
  const cos = (q: string) => applyFilters(rowsFor("companies", [i]), EMPTY_FILTERS, "all", q, me).rows.length;
  check("a pasted address finds the company", cos("https://www.supersend.io/pricing") === 1 && cos("www.supersend.io") === 1 && cos("supersend.io/") === 1);
  check("the About text is searched by the start of a word", cos("outreach") === 1 && cos("outre") === 1 && cos("utreach") === 0 && cos("one") === 0);
  check("the source is not searched", cos("member story") === 0 && cos("success") === 0);
  {
    const h = co("Hidden Pharma", [eng({ status: val("Open role", { system: true }), function: val("Sales") }, { opened: "2026-11-03", closed: null })]);
    h.cells = { ...h.cells, about: LOCKED };
    check("a hidden company's locked About is not searched", applyFilters(rowsFor("companies", deriveAll([h])), EMPTY_FILTERS, "all", "pharmaceutical", me).rows.length === 0);
  }
  check("a locked role is not searched", seats("cro").length === 0);
  check("searchWords keeps plain words", JSON.stringify(searchWords("  VP Sales ")) === JSON.stringify(["vp", "sales"]));
  const people = applyFilters(rowsFor("people", [i]), EMPTY_FILTERS, "all", "ceo", me).rows.length;
  check("a person search reads that person's title", people === 1);
  // Ranking: rows whose company name matches come first.
  const a = deriveAll([co("Acme Sales Tools", [])])[0];
  const b = deriveAll([{ ...co("Zed Corp", []), cells: { ...co("x", []).cells, industry: val("Sales tools") } }])[0];
  const ranked = sortRows(rowsFor("companies", [b, a]), "name", false, "sales");
  check("search ranks name matches first", ranked[0].i === a, ranked.map((r) => r.i.c.name));
}

/* ---------- Open now leaves out a role the last scan did not see ---------- */

{
  const seen = eng({ status: val("Open role", { system: true }) }, { opened: "2026-11-03", closed: null });
  const unseen = eng({ status: val("Open role", { system: true }) }, { opened: "2026-10-03", closed: null, unseen: true });
  const i = deriveAll([co("Seen Co", [seen]), co("Unseen Co", [unseen])]);
  const open = applyFilters(rowsFor("engagements", i), { ...EMPTY_FILTERS, roleState: ["Open now"] }, "all", "", me).rows.map((r) => r.e!.id);
  check("Open now: the role the last scan listed, not the unseen one", open.join() === seen.id, open);
  check("an unseen role is still an open role (Hiring now)", tabTest("hiring", rowsFor("engagements", i).find((r) => r.e === unseen)!));
  check("days listed from the full times", listedDays(eng({}, { opened: "2026-11-03", closed: "2026-11-05", openedAt: "2026-11-03T23:00:00Z", closedAt: "2026-11-05T01:00:00Z" })) === 1);
}

/* ---------- what Unlock all buys, one entry per purchase ---------- */

{
  const role = eng({ role: LOCKED, posting: LOCKED, rate: LOCKED, status: val("Open role", { system: true }) }, { opened: "2026-11-03", closed: null });
  const past = eng({ role: LOCKED, operator: LOCKED }, { source: "Published engagement" });
  const visible = deriveAll([co("Seen Co", [role, past])])[0];
  const fields = (refs: { field: string }[]) => refs.map((t) => t.field).sort().join();
  check("an open role's role, posting and rate are one purchase", fields(lockedInEngagement(role)) === "role");
  check("Unlock all at a visible company: the open role once and the past seat's two", visible.locked.length === 3, visible.locked);
  const role2 = eng({ role: LOCKED, posting: LOCKED, rate: LOCKED, status: val("Open role", { system: true }) }, { opened: "2026-11-03", closed: null });
  const past2 = eng({ role: LOCKED, operator: LOCKED }, { source: "Published engagement" });
  const hc = { ...co("Hidden", [role2, past2]), hidden: true } as CompanyRec;
  hc.cells = { ...hc.cells, website: LOCKED, linkedin: LOCKED, about: LOCKED };
  const hidden = deriveAll([hc])[0];
  check("Unlock all at a hidden company: the company (with the role, posting and rate) and the past seat's two", fields(hidden.locked) === "identity,operator,role", hidden.locked);
  check("at a hidden company the open role's role and posting are quiet on a row", !!coverOf(hidden, role2, "role") && !!coverOf(hidden, role2, "posting") && !!coverOf(hidden, role2, "rate"));
  check("at a visible company the posting and the rate are quiet while the role is locked", coverOf(visible, role, "role") === null && !!coverOf(visible, role, "posting") && !!coverOf(visible, role, "rate"));
  const rateOnly = eng({ role: val("Fractional CMO"), posting: val("https://jobs.example.com/x"), rate: LOCKED, status: val("Open role", { system: true }) }, { opened: "2026-11-03", closed: null });
  check("an open role with only its rate locked: the rate's lock is the one that spends", coverOf(deriveAll([co("Rate Co", [rateOnly])])[0], rateOnly, "rate") === null && fields(lockedInEngagement(rateOnly)) === "rate");
  check("an open role nobody holds can't have a start or end yet", isUnheldOpenRole(role) && !isUnheldOpenRole(past) && NOT_YET_ON_OPEN_ROLE.join() === "start,end,reason,sourced");
}

/* ---------- functions: hired, hiring now, and stories ---------- */

{
  const story = eng({ function: val("Sales") }, { source: "Member success story" });
  const openMk = eng({ function: val("Marketing"), status: val("Open role", { system: true }) }, { opened: "2026-11-03", closed: null });
  const added = eng({ function: val("RevOps") }, { source: "Member added" });
  const closedPosting = eng({ function: val("Growth"), status: val("Closed", { system: true }) }, { opened: "2026-10-03", closed: "2026-10-20" });
  // The server before this round counted open roles and postings in functions, and missed a member-added seat with no type.
  const c = co("Mix Co", [story, openMk, added, closedPosting]);
  c.friendly = { ...c.friendly, functions: ["Marketing", "Growth"] };
  const i = deriveAll([c])[0];
  check("a member-added seat is a hire, whatever its type", i.fnState.hired.includes("RevOps"), i.fnState);
  check("an open role's function is hiring, not hired", i.fnState.hiring.join() === "Marketing" && !i.fnState.hired.includes("Marketing"), i.fnState);
  check("a member story's function is a story", i.fnState.story.includes("Sales"), i.fnState);
  const newServer = co("New Co", [story, openMk, added]);
  newServer.friendly = { ...newServer.friendly, functions: ["RevOps"], hiring: ["Marketing"] } as typeof newServer.friendly;
  const j = deriveAll([newServer])[0];
  check("with friendly.hiring from the server", j.fnState.hired.join() === "RevOps" && j.fnState.hiring.join() === "Marketing" && j.fnState.story.join() === "Sales", j.fnState);
  // "No Sales yet" shows only when nothing on file names Sales (FnChips): never next to a Sales chip.
  const gap = (x: typeof i) => x.fnState.hired.length > 0 && !x.fns.includes("Sales");
  check("no 'No Sales yet' next to a Sales story", !gap(i) && !gap(j));
  const notMine = (x: typeof i) => toggleTest("notMine", me)({ key: x.c.id, i: x });
  check("No Sales seat yet: hired other functions, none in Sales", notMine(j) && !notMine(deriveAll([co("Only open", [eng({ function: val("Marketing"), status: val("Open role", { system: true }) }, { opened: "2026-11-03", closed: null })])])[0]));
  check("a catch-all function is not named in labels", notMineLabel("Executive") === "No seat in your function yet" && notMineLabel("Sales") === "No Sales seat yet" && namedFn("Other") === null);
}

/* ---------- HQ by place ---------- */

{
  const at = (hq: string) => {
    const c = co(hq, []);
    c.cells = { ...c.cells, hq: val(hq) };
    return c;
  };
  const i = deriveAll(["San Francisco, California", "Los Angeles, CA", "Venice , Ca", "Austin, TX", "LA Metro", "New York, NY"].map(at));
  const hq = (q: string[]) => applyFilters(rowsFor("companies", i), { ...EMPTY_FILTERS, hq: q }, "all", "", me).rows.map((r) => r.i.c.name).join("|");
  check("california catches every spelling", hq(["california"]) === "San Francisco, California|Los Angeles, CA|Venice , Ca", hq(["california"]));
  check("a state code reads as the state", hq(["CA"]) === hq(["california"]) && hq(["texas"]) === "Austin, TX");
  check("a picked HQ still matches itself and its other spellings", hq(["Austin, TX"]) === "Austin, TX" && hq(["New York, NY"]) === "New York, NY");
  check("LA in a name is not Louisiana", hq(["louisiana"]) === "");
  check("placeWords spells codes out", placeWords("Venice , Ca").join(" ") === "venice california");
}

/* ---------- sorting by a column ---------- */

{
  const sized = (name: string, employees: string | null, revenue: string | null, start: string | null) => {
    const c = co(name, start ? [eng({ start: val(start) }, { source: "Published engagement" })] : []);
    c.cells = { ...c.cells, ...(employees ? { employees: val(employees) } : {}), ...(revenue ? { revenue: val(revenue) } : {}) };
    return c;
  };
  const i = deriveAll([sized("Small", "1–10", "$50M+", "2024-01"), sized("Big", "1,001+", "Under $1M", "2026-03"), sized("Unknown", null, null, null), sized("Mid", "51–200", "$5M–$20M", "2025-06")]);
  const by = (k: "employees" | "revenue" | "start") => sortRows(rowsFor("companies", i), k).map((r) => r.i.c.name).join();
  check("most employees first, unknown last", by("employees") === "Big,Mid,Small,Unknown", by("employees"));
  check("most revenue first, unknown last", by("revenue") === "Small,Mid,Big,Unknown", by("revenue"));
  check("latest start first", by("start") === "Big,Mid,Small,Unknown", by("start"));
}

/* ---------- each list sorts by its own facts (DESK-17) ---------- */

{
  const withFn = (name: string, fn: string | null, hq: string | null, title: string | null) => {
    const c = co(name, [eng(fn ? { function: val(fn) } : {}, { source: "Published engagement" })]);
    if (hq) c.cells = { ...c.cells, hq: val(hq) };
    if (title) c.people = [{ ...person(), cells: { ...person().cells, title: val(title) } }];
    return c;
  };
  const i = deriveAll([withFn("Zed", "RevOps", "Austin, TX", "VP Sales"), withFn("Amp", "Marketing", null, "CEO"), withFn("Mid", null, "Boston, MA", null)]);
  const names = (t: "companies" | "engagements" | "people", k: Parameters<typeof sortRows>[1]) => sortRows(rowsFor(t, i), k).map((r) => r.i.c.name).join();
  check("seats sort by function A to Z, none last", names("engagements", "fn") === "Amp,Zed,Mid", names("engagements", "fn"));
  check("people sort by title A to Z", names("people", "title") === "Amp,Zed", names("people", "title"));
  check("companies sort by HQ A to Z, none last", names("companies", "hq") === "Zed,Mid,Amp", names("companies", "hq"));
  check("People has no Most seats or Latest start, and Seats has no Most seats", !sortsFor("people").some((s) => s.key === "engagements" || s.key === "start") && !sortsFor("engagements").some((s) => s.key === "engagements"), sortsFor("people").map((s) => s.key));
  check("a sort the list can't use reads as Best fit", sortFor("people", "engagements") === "fit" && sortFor("engagements", "fn") === "fn");
  check("the name sort says it sorts by the company", SORTS.find((s) => s.key === "name")?.label === "Company name");
}

/* ---------- ties break on the row, never its name ---------- */

{
  // Two rows that tie on every sort key: unlocking a hidden company changes its name, and the row must not move.
  const a = co(HIDDEN_COMPANY, [eng({}, { source: "Published engagement" })]);
  const b = co("Aardvark Labs", [eng({}, { source: "Published engagement" })]);
  const keys = (cs: CompanyRec[], k: "fit" | "newest" | "engagements") => sortRows(rowsFor("companies", deriveAll(cs)), k).map((r) => r.key).join();
  const before = (["fit", "newest", "engagements"] as const).map((k) => keys([a, b], k));
  const renamed = { ...a, name: "Zephyr Health" };
  const after = (["fit", "newest", "engagements"] as const).map((k) => keys([renamed, b], k));
  check("a tie keeps its order when a company's name changes (fit, newest, most seats)", JSON.stringify(before) === JSON.stringify(after), { before, after });
  check("the Name sort still reads names", sortRows(rowsFor("companies", deriveAll([renamed, b])), "name").map((r) => r.i.c.name).join() === "Aardvark Labs,Zephyr Health");
}

/* ---------- a posting that came down with nobody in the seat ---------- */

{
  const gone = eng({ function: val("Sales", { system: true }), status: val("Closed", { system: true }), role: LOCKED }, { opened: "2026-10-01", closed: "2026-10-20", closedAt: "2026-10-20T12:00:00.000Z" });
  const c = co("Gone Co", [gone]);
  c.friendly = { score: 30, tier: "Medium", fractional: 0, open: 0, functions: [], hiring: [], operators: 0, recent: 0 };
  const [i] = deriveAll([c]);
  check("only a closed posting: the fit reads Posting closed, not Story only or Past seat", fitTier(c.friendly, 1, true).label === "Posting closed" && fitTier(c.friendly, 1).label === "Story only");
  check("its reason says when the posting came down", /^A job posting here came down on Oct 20\b/.test(fitReason(i)), fitReason(i));
}

/* ---------- Your seats: what is still missing ---------- */

{
  const mine = (status: Cell) => eng({ function: val("Sales"), role: val("VP Sales"), status, end: EMPTY }, { source: "Published engagement", yours: true });
  const active = mine(val("Active"));
  const ended = mine(val("Ended"));
  const meSeats = { function: "Sales", benchRates: [] } as unknown as Me;
  check("an Active seat's end month is not missing (Your seats doesn't ask for it)", seatMissingCount(active, meSeats) === seatMissingCount(ended, meSeats) - 1, [seatMissingCount(active, meSeats), seatMissingCount(ended, meSeats)]);
  const seats = mySeats(deriveAll([co("Held Co", [active])]), meSeats);
  check("Fill in your seats counts no end on an Active seat", seats.length === 1 && !seats[0].missing.includes("end"), seats[0]?.missing);
}

/* ---------- the credit history, as sentences ---------- */

// The server names a row's field by its label, and a person's field as "Person <label>" (ledgerLabel in lib/table.ts).
const serverLower = (label: string) => (/[A-Z]/.test(label.slice(1)) ? label : label.toLowerCase());
const row = (reason: string, field: string, delta = 1, company = "Acme") => ({ at: "2026-11-16T10:00:00.000Z", delta, reason, company, field });
const unnamed = ALL_FIELDS.filter(({ f }) => !f.identity && !f.system).filter(({ entity, f }) => {
  const label = entity === "contact" ? `Person ${serverLower(f.label)}` : f.label;
  return !f.say || ledgerLine(row("fill", label), 25).text !== `Added ${f.say} at Acme`;
});
check("every field a member can add reads as a sentence in the history", unnamed.length === 0, unnamed.map((x) => `${x.entity}.${x.f.key}`));
check("a person's LinkedIn keeps its capitals", ledgerLine(row("unlock", "Person LinkedIn", -1), 25).text === "Unlocked a person's LinkedIn at Acme" && fieldText("Person LinkedIn") === "person LinkedIn" && fieldText("HQ") === "HQ");
check("a private rate never names a company", ledgerLine(row("fill", "Private rate", 1, ""), 25).text === "Shared a rate privately" && ledgerLine(row("Removed", "Private rate", -1, ""), 25).text === "Removed a rate you shared privately");
// A hidden company is one purchase with its open role, and the company leads so a cut-off line keeps it.
check(
  "unlocking a hidden company says so",
  ledgerLine(row("unlock", HIDDEN_COMPANY, -1), 25).text === "Unlocked Acme and its open role" && ledgerLine(row("unlock", HIDDEN_COMPANY, -1, HIDDEN_COMPANY), 25).text === "Unlocked a hidden company and its open role",
);
check("an add past the limit explains its 0", /No credit/.test(ledgerLine(row("fill", "Role", 0), 25).note ?? "") && ledgerLine(row("fill", "Role", 1), 25).note === undefined);
check(
  "refunds, reversals, confirmations and invite bonuses read as sentences",
  ledgerLine(row("refund", "Rate"), 25).text === "Refund for the rate at Acme, removed after review" &&
    ledgerLine(row("reversal", "Role", -1), 25).text === "Credit taken back for the role at Acme, removed after review" &&
    ledgerLine(row("confirm", "Industry"), 25).text === "Two members confirmed the industry at Acme" &&
    ledgerLine(row("referral", "Invite bonus", 10, "Dana"), 25).text === "Invite bonus, with Dana",
);
check("a reason the server wrote out in words is shown as it is", ledgerLine(row("Topped up to 0 when starter credits changed", "", 3, ""), 25).text === "Topped up to 0 when starter credits changed");
check("a refund for a role that had closed names the company", ledgerLine(row("Refund for a role that had closed", ""), 25).text === "Refund for a role that had closed at Acme");
check("a fact the member took back says so", ledgerLine(row("retract", "Role", -1), 25).text === "Took back the role at Acme");
check(
  "a 0 on a company pick list names that limit, other 0s the daily one",
  /Only 5 answers like this/.test(ledgerLine(row("fill", "Industry", 0), 25).note ?? "") && ledgerLine(row("fill", "HQ", 0), 25).note === "No credit. You had already earned 25 today.",
);
{
  const t = Date.parse("2026-11-16T12:00:00.000Z");
  const unlocks = (n: number) => Array.from({ length: n }, () => row("unlock", "Role", -1));
  check("no unlock line while the balance runs out first", unlockLimitLine({ credits: 5, unlocksLeft: 20 }, unlocks(5), t) === null && unlockLimitLine({ credits: 5, unlocksLeft: null }, [], t) === null);
  check("day one: the limit binds and says so", unlockLimitLine({ credits: 7, unlocksLeft: 3 }, unlocks(22), t) === "You can unlock 3 more facts today. New accounts can unlock 25 facts on day one.");
  check("after day one: no day-one line", unlockLimitLine({ credits: 30, unlocksLeft: 2 }, unlocks(98), t) === "You can unlock 2 more facts today.");
  check("at the limit with credits left", /^You've used today's unlocks\. Your credits are here tomorrow\./.test(unlockLimitLine({ credits: 4, unlocksLeft: 0 }, unlocks(25), t) ?? ""));
  check("owed reads in credits and clears with adds", owedLine(0) === null && owedLine(undefined) === null && owedLine(1) === "You owe 1 credit. A fact you added was removed after you spent what it earned. The next fact you add clears it." && /The next 3 facts you add clear it\.$/.test(owedLine(3) ?? ""));
}

/* ---------- facet counts: each row read once, the same counts as one test per option ---------- */

{
  const many = deriveAll([
    ...companies,
    co("Seat Scan Co", [eng({ function: val("Finance"), type: val("Fractional"), status: val("Active") }, { source: "Seat scan" })]),
    co("Two Fns Co", [eng({ function: val("Sales"), type: val("Fractional") }, { source: "Published engagement" }), eng({ function: val("People"), type: val("Interim") }, { source: "Member added" })]),
  ]);
  let off = 0;
  for (const type of ["companies", "engagements", "people"] as const) {
    const rows = rowsFor(type, many);
    for (const f of [EMPTY_FILTERS, { ...EMPTY_FILTERS, fn: ["Sales"] }, { ...EMPTY_FILTERS, type: ["Fractional"], roleState: ["Closed"] }]) {
      const { facets } = applyFilters(rows, f, "all", "", me);
      for (const [k, opts] of Object.entries(LIST_OPTIONS)) {
        // Each group counted with its own selection lifted.
        const lifted = applyFilters(rows, { ...f, [k]: [] }, "all", "", me).rows;
        for (const o of opts) if (facets.lists[k as keyof typeof facets.lists][o] !== lifted.filter((r) => applyFilters([r], { ...EMPTY_FILTERS, [k]: [o] }, "all", "", me).rows.length).length) off++;
      }
    }
  }
  check("facet counts match one test per option", off === 0, off);
  const src = applyFilters(rowsFor("engagements", many), { ...EMPTY_FILTERS, source: ["Clay"] }, "all", "", me).rows;
  check("one Revenue Nomad research source option covers seat-scan seats", LIST_OPTIONS.source.filter((s) => s === "Clay" || s === "Seat scan").length === 1 && src.length === 1);
  check("rowsOnly gives the same rows", applyFilters(rowsFor("companies", many), EMPTY_FILTERS, "all", "co", me, true).rows.length === applyFilters(rowsFor("companies", many), EMPTY_FILTERS, "all", "co", me).rows.length);
}

/* ---------- when earning opens again ---------- */

const later = new Date();
later.setHours(23, 59, 0, 0);
const tomorrow = new Date(Date.now() + 86_400_000);
check("today reads at a time, tomorrow says tomorrow", /^at \d/.test(atTime(later.toISOString())) && /^tomorrow at \d/.test(atTime(tomorrow.toISOString())) && atTime(null) === "within 24 hours", [atTime(later.toISOString()), atTime(tomorrow.toISOString())]);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
