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

/* ---------- when earning opens again ---------- */

const later = new Date();
later.setHours(23, 59, 0, 0);
const tomorrow = new Date(Date.now() + 86_400_000);
check("today reads at a time, tomorrow says tomorrow", /^at \d/.test(atTime(later.toISOString())) && /^tomorrow at \d/.test(atTime(tomorrow.toISOString())) && atTime(null) === "within 24 hours", [atTime(later.toISOString()), atTime(tomorrow.toISOString())]);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
