/**
 * Checks for the app's client-side read model (app/post/model.ts): the Open roles filter on
 * company, engagement and people rows, what counts as "Unlocked by me" now that hours per week
 * is free, and the dates on roles the weekly scan follows. Pure functions, no server.
 *
 *   npx tsx scripts/test-model.mts      exits 1 on any failure
 */
import type { Cell, CompanyRec, EngagementRec, Me, PersonRec } from "../lib/tableTypes";
import { GROUPS } from "../lib/tableFields";
import {
  EMPTY_FILTERS, ENG_GATED, LIST_OPTIONS, activeChips, activeCount, applyFilters, daysListed, deriveAll, hasRoleDates, isOpenSeat, rowsFor, tabTest,
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
// Status is free on the server now. app/post/model.ts still lists it until the client round drops it
// (and with it the "status unlocked on an undated seat" check below). Nothing else may differ.
const appGated = ENG_GATED.filter((f) => f !== "status");
check("the app's gated list matches the field definitions", JSON.stringify([...appGated].sort()) === JSON.stringify([...gated].sort()), { app: ENG_GATED, fields: gated });
check("hours per week is not in it", !ENG_GATED.includes("hours"));
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
check("a status unlocked on an undated seat is", undated.eng && undated.company, undated);
const seat = unlockedTab(eng({ operator: val("Jane Smith", { member: { title: "Fractional CRO", you: true } }), rate: val("$8k/mo") }, { source: "Published engagement", yours: true }));
check("the member's own seat, free to them, is not an unlock", !seat.eng && !seat.company, seat);
const own = unlockedTab(eng({ role: val("Fractional CRO", { mine: true }) }, { source: "Member added" }));
check("a fact the member added is not an unlock", !own.eng && !own.company, own);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
