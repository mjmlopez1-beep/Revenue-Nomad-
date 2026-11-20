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
import { ALL_FIELDS, GROUPS, HIDDEN_COMPANY, RN_EMPLOYEES, RN_REVENUE } from "../lib/tableFields";
import { ledgerLine, owedLine, unlockLimitLine } from "../app/post/ledger";
import { atTime, fieldText } from "../app/post/hooks";
import {
  EMPTY_FILTERS, ENG_GATED, LIST_OPTIONS, NOT_YET_ON_OPEN_ROLE, activeChips, activeCount, applyFilters, coverOf, daysListed, deriveAll, hasRoleDates, isOpenSeat, isUnheldOpenRole,
  bandRange, bestFit, countryOf, criteriaOf, icpLabel, icpMatch, icpTest, icpUnknown, industryWords, openSince, regionOf, splitByFn, viewName, withIcpSpelled, activeChips,
  cardSeat, newRolesFor, newThisWeek, rolesThisWeek, personCoverOf, personNoun, personUnseen, PERSON_NO_ADD, seatBundled, seatBothLocked, seatNoun, seatWhat, waitWords, AFTER_NAME, AFTER_COMPANY,
  checkSteps, fitReason, fitTier, listedDays, lockedInEngagement, mySeats, namedFn, notMineLabel, placeWords, rowsFor, searchWords, seatMissingCount, sortRows, sortFor, sortsFor, SORTS, TABS, repeatHirer, tabOf, tabTest, toggleTest,
} from "../app/post/model";
import { holderSeen, holderTarget, lockedHolder, personTarget, sameBuy, startSteps, stepOneKind } from "../app/post/getStarted";
import { isTodayAnswer, radarSince, rolesSince, sinceWords } from "../app/post/todayModel";
import { SEAT_YIELD, inviteMailto, inviteMessage, tappedWhat, wallBack } from "../app/post/earnBack";
import { UNLOCKS_LEFT_TIP, confirmedWords, fnChipPlan, foldParts, marksConfirmed, postingToOpen, unlocksLeft, unlocksLeftWords } from "../app/post/display";

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
check("Open now: engagement rows, a role a member marked open included", count("engagements", ["Open now"]).rows.map((r) => r.e!.id).sort().join() === [openRole.id, memberOpen.id].sort().join());
// One definition of open (C43): the Open now chip lists exactly what the Hiring now view lists, on every list.
for (const t of ["companies", "engagements", "people"] as const) {
  const chip = count(t, ["Open now"]).rows.map((r) => r.key).sort().join();
  const view = applyFilters(rowsFor(t, infos), EMPTY_FILTERS, "hiring", "", me);
  check(`Open now and Hiring now list the same ${t}`, chip === view.rows.map((r) => r.key).sort().join() && count(t, []).facets.lists.roleState["Open now"] === view.rows.length, [chip, view.rows.length]);
}
check("Closed: engagement rows (not the undated seat at the same company)", count("engagements", ["Closed"]).rows.map((r) => r.e!.id).sort().join() === [closedRole.id, filledRole.id].sort().join());
check("Open now: people rows at that company", count("people", ["Open now"]).rows.length === 1);
check("Closed: people rows at those companies", count("people", ["Closed"]).rows.length === 2);
check("a role a member marked open is never Closed", !count("companies", ["Closed"]).rows.some((r) => r.i.c.name === "Member Open Co"));
const facets = count("engagements", []).facets.lists.roleState;
check("counts for each chip (engagements)", facets["Open now"] === 2 && facets.Closed === 2, facets);
const coFacets = count("companies", ["Closed"]).facets.lists.roleState;
check("a chip's own group is lifted when counting (companies)", coFacets["Open now"] === 1 && coFacets.Closed === 2, coFacets);
const chips = activeChips({ ...EMPTY_FILTERS, roleState: ["Open now", "Closed"] });
check("active chips read as plain words", chips.map((c) => c.label).join() === "Role open now,Role closed", chips.map((c) => c.label));
check("removing a chip clears only that one", chips[0].clear({ ...EMPTY_FILTERS, roleState: ["Open now", "Closed"] }).roleState.join() === "Closed");
check("active filters are counted", activeCount({ ...EMPTY_FILTERS, roleState: ["Closed"] }) === 1);
check("hasRoleDates: companies with a followed role or an open one", infos.filter(hasRoleDates).map((i) => i.c.name).join() === "Open Co,Closed Co,Filled Co,Member Open Co");

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
const roleSeen = unlockedTab(eng({ role: val("Fractional CRO", { paid: true }), hours: val("15") }, { source: "Published engagement" }));
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
// Free values on a brand-new account: an open role's free title, a posting, our records' facts. None was paid for.
const freeTitle = unlockedTab(eng({ status: val("Open role", { system: true }), role: val("Fractional CMO", { from: "posting" }), posting: val("https://jobs.example.com/2", { from: "posting" }) }, { opened: "2026-11-03", closed: null }));
check("an open role's free title and posting are not an unlock", !freeTitle.eng && !freeTitle.company, freeTitle);
const recordsName = unlockedTab(eng({ operator: val("Jane Smith", { from: "records" }) }, { source: "Published engagement" }));
check("a value showing without a paid flag is not an unlock", !recordsName.eng && !recordsName.company, recordsName);
{
  // A fresh account counts 0 in Unlocked, and each real unlock moves it by one.
  const fresh = [0, 1, 2].map(() => co("Fresh", [eng({ role: val("Fractional CRO", { from: "posting" }), operator: LOCKED }, { source: "Published engagement" })]));
  const tabN = (cs: CompanyRec[]) => applyFilters(rowsFor("companies", deriveAll(cs)), EMPTY_FILTERS, "all", "", me).facets.tabs.unlocked;
  const n0 = tabN(fresh);
  const paid1 = fresh.map((c, k) => (k === 0 ? { ...c, engagements: [{ ...c.engagements[0], cells: { ...c.engagements[0].cells, operator: val("Jane Smith", { paid: true }) } }] } : c));
  const n1 = tabN(paid1);
  const paid2 = paid1.map((c, k) => (k === 1 ? ({ ...c, unlocked: true } as CompanyRec) : c));
  check("a fresh account has Unlocked 0, and each unlock moves it by one", n0 === 0 && n1 === 1 && tabN(paid2) === 2, { n0, n1, n2: tabN(paid2) });
}
{
  // Following counts companies, whatever the list shows.
  const a = { ...co("Followed", [1, 2, 3, 4, 5].map(() => eng({ role: LOCKED }, { source: "Published engagement" }))), following: true } as CompanyRec;
  const b = co("Not followed", [eng({ role: LOCKED }, { source: "Published engagement" })]);
  const seatsTabs = applyFilters(rowsFor("engagements", deriveAll([a, b])), EMPTY_FILTERS, "all", "", me).facets.tabs;
  check("Following counts 1 company with 5 seats as 1 on the seats list", seatsTabs.following === 1, seatsTabs.following);
}

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
  // The table carries an About without its text (Cell.lazy, a record loads it), so search never reads it, even a text it was given.
  check("the About text is not searched", cos("outreach") === 0 && cos("outre") === 0 && cos("supersend") === 1);
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
  {
    // A person's name and title are one purchase: locked until unlocked, never searched while locked.
    const locked = (): PersonRec => ({ id: `p${++n}`, engagementId: null, source: "Member added", cells: { name: LOCKED, title: LOCKED, relationship: val("Decision maker"), email: LOCKED, phone: EMPTY, linkedin: EMPTY } });
    const lp = locked();
    const lc = co("Quiet Co", [], [lp]);
    const li = deriveAll([lc]);
    check("a locked title is not searched", applyFilters(rowsFor("people", li), EMPTY_FILTERS, "all", "ceo", me).rows.length === 0 && applyFilters(rowsFor("companies", li), EMPTY_FILTERS, "all", "ceo", me).rows.length === 0);
    check("a person's name and title are one entry in Unlock all, the email another", JSON.stringify(li[0].locked.map((t) => t.field)) === JSON.stringify(["name", "email"]), li[0].locked);
    check("a locked name and title: either lock spends, for both", personCoverOf(li[0], null, lp, "name") === null && personCoverOf(li[0], null, lp, "title") === null, [personCoverOf(li[0], null, lp, "name"), personCoverOf(li[0], null, lp, "title")]);
    check("the lock says it opens the name and the title, the title's too", personNoun(lp.cells, "name") === "name and title" && personNoun(lp.cells, "title") === "name and title" && personNoun(lp.cells, "email") === undefined);
    check("their email waits for the name: a quiet lock, Opens after the name", personCoverOf(li[0], null, lp, "email") === AFTER_NAME && waitWords(AFTER_NAME) === "Opens after the name", personCoverOf(li[0], null, lp, "email"));
    check("nothing but a relationship can be added to a person the member can't see", personUnseen(lp.cells) && PERSON_NO_ADD.join() === "linkedin,email,phone,title");
    const half: PersonRec = { ...locked(), cells: { ...locked().cells, name: val("Pia Person", { paid: true }), title: LOCKED } };
    check("a title locked alone is its own lock", personCoverOf(deriveAll([co("Half Co", [], [half])])[0], null, half, "title") === null && personNoun(half.cells, "title") === undefined);
    const named: PersonRec = { ...locked(), cells: { ...locked().cells, name: val("Pia Person", { paid: true }), title: val("CEO", { paid: true }) } };
    check("once the name and title show, the email is its own 1 credit lock", personCoverOf(deriveAll([co("Named Co", [], [named])])[0], null, named, "email") === null && !personUnseen(named.cells));
    const hiddenPeople = { ...co("Locked People Co", [], [locked()]), hidden: true } as CompanyRec;
    const hp = hiddenPeople.people[0];
    const hpi = deriveAll([hiddenPeople])[0];
    check("at a locked company its people open after the company", ["name", "title", "email"].every((f) => personCoverOf(hpi, null, hp, f) === AFTER_COMPANY) && waitWords(AFTER_COMPANY) === "Opens after the company");
    check("a cover that isn't a wait has no words", waitWords("Open the record to unlock this.") === null && waitWords(null) === null);
    check("a seat's people count their name and title once too", JSON.stringify(lockedInEngagement({ ...eng({}), people: [locked()] }).filter((t) => t.entity === "contact").map((t) => t.field)) === JSON.stringify(["name", "email"]));
    const sortI = deriveAll([co("Zed Known", [], [{ ...locked(), cells: { ...locked().cells, title: val("Advisor") } }]), co("Amp Locked", [], [locked()])]);
    check("a locked title sorts as unknown (last)", sortRows(rowsFor("people", sortI), "title").map((r) => r.i.c.name).join() === "Zed Known,Amp Locked");
  }
  // Ranking: rows whose company name matches come first.
  const a = deriveAll([co("Acme Sales Tools", [])])[0];
  const b = deriveAll([{ ...co("Zed Corp", []), cells: { ...co("x", []).cells, industry: val("Sales tools") } }])[0];
  const ranked = sortRows(rowsFor("companies", [b, a]), "name", false, "sales");
  check("search ranks name matches first", ranked[0].i === a, ranked.map((r) => r.i.c.name));
}

/* ---------- a role the last scan did not see is still open on file: in Open now, as in Hiring now ---------- */

{
  const seen = eng({ status: val("Open role", { system: true }) }, { opened: "2026-11-03", closed: null });
  const unseen = eng({ status: val("Open role", { system: true }) }, { opened: "2026-10-03", closed: null, unseen: true });
  const i = deriveAll([co("Seen Co", [seen]), co("Unseen Co", [unseen])]);
  const open = applyFilters(rowsFor("engagements", i), { ...EMPTY_FILTERS, roleState: ["Open now"] }, "all", "", me).rows.map((r) => r.e!.id);
  check("Open now: every role open on file, the unseen one too (the Hiring now list)", open.sort().join() === [seen.id, unseen.id].sort().join(), open);
  check("an unseen role is still an open role (Hiring now)", tabTest("hiring", rowsFor("engagements", i).find((r) => r.e === unseen)!));
  check("days listed from the full times", listedDays(eng({}, { opened: "2026-11-03", closed: "2026-11-05", openedAt: "2026-11-03T23:00:00Z", closedAt: "2026-11-05T01:00:00Z" })) === 1);
}

/* ---------- what Unlock all buys, one entry per purchase ---------- */

{
  // An open role's title is free (the server sends it as a value). Its posting and rate are one purchase.
  const role = eng({ role: val("Fractional CMO"), posting: LOCKED, rate: LOCKED, status: val("Open role", { system: true }) }, { opened: "2026-11-03", closed: null });
  const past = eng({ role: LOCKED, operator: LOCKED }, { source: "Published engagement" });
  const visible = deriveAll([co("Seen Co", [role, past])])[0];
  const fields = (refs: { field: string }[]) => refs.map((t) => t.field).sort().join();
  check("an open role's posting and rate are one purchase", fields(lockedInEngagement(role)) === "posting");
  check("Unlock all at a visible company: the open role once, and the past seat's holder with their role once", visible.locked.length === 2 && fields(visible.locked) === "operator,posting", visible.locked);
  const role2 = eng({ role: val("Fractional CMO"), posting: LOCKED, rate: LOCKED, status: val("Open role", { system: true }) }, { opened: "2026-11-03", closed: null });
  const past2 = eng({ role: LOCKED, operator: LOCKED }, { source: "Published engagement" });
  const hc = { ...co("Hidden", [role2, past2]), hidden: true } as CompanyRec;
  hc.cells = { ...hc.cells, website: LOCKED, linkedin: LOCKED, about: LOCKED };
  const hidden = deriveAll([hc])[0];
  check("Unlock all at a locked company: the company (with the posting and rate), then the past seat's holder with their role", fields(hidden.locked) === "identity,operator", hidden.locked);
  check("at a locked company who held a seat opens after the company, the role with them", coverOf(hidden, past2, "operator") === AFTER_COMPANY && coverOf(hidden, past2, "role") === AFTER_COMPANY);
  const lone = eng({ role: LOCKED, operator: EMPTY }, { source: "Seat scan", claimable: true } as Partial<EngagementRec>);
  const hc2 = { ...co("Hidden Lone", [role2, lone]), hidden: true } as CompanyRec;
  // Every purchase at a company opens it, so at a locked one each paid fact waits for the company.
  check("at a locked company a seat's role with nobody named opens after the company too", coverOf(deriveAll([hc2])[0], lone, "role") === AFTER_COMPANY);
  check("at a locked company the open role's posting and rate are quiet on a row", !!coverOf(hidden, role2, "posting") && !!coverOf(hidden, role2, "rate"));
  check("at a visible company the rate is quiet while the posting is locked", coverOf(visible, role, "posting") === null && !!coverOf(visible, role, "rate"));
  const rateOnly = eng({ role: val("Fractional CMO"), posting: val("https://jobs.example.com/x"), rate: LOCKED, status: val("Open role", { system: true }) }, { opened: "2026-11-03", closed: null });
  check("an open role with only its rate locked: the rate's lock is the one that spends", coverOf(deriveAll([co("Rate Co", [rateOnly])])[0], rateOnly, "rate") === null && fields(lockedInEngagement(rateOnly)) === "rate");
  check("an open role nobody holds can't have a start or end yet", isUnheldOpenRole(role) && !isUnheldOpenRole(past) && NOT_YET_ON_OPEN_ROLE.join() === "start,end,reason,sourced");
}

/* ---------- who held a seat and their role: one purchase (SEAT_BUNDLE) ---------- */

{
  const held = eng({ role: LOCKED, operator: LOCKED, status: val("Ended") }, { source: "Published engagement" });
  check("a seat with its holder on file bundles the holder and the role", seatBundled(held) && seatBothLocked(held));
  check("both locks say they open who held it", seatNoun(held, "operator") === "who held it" && seatNoun(held, "role") === "who held it" && seatWhat(held, "role") === "who held this seat and their role");
  check("Unlock all counts the holder and the role once", lockedInEngagement(held).map((t) => t.field).join() === "operator", lockedInEngagement(held));
  const nobody = eng({ role: LOCKED, operator: EMPTY }, { source: "Seat scan", claimable: true } as Partial<EngagementRec>);
  check("a seat with nobody named keeps its role as its own lock", !seatBundled(nobody) && seatNoun(nobody, "role") === undefined && lockedInEngagement(nobody).map((t) => t.field).join() === "role");
  const noRole = eng({ role: EMPTY, operator: LOCKED }, { source: "Member success story" });
  check("a holder with no role on file: the lock opens who held it", seatNoun(noRole, "operator") === "who held it" && seatWhat(noRole, "operator") === "who held this seat" && lockedInEngagement(noRole).map((t) => t.field).join() === "operator");
  const claimOpen = eng({ role: val("Fractional CMO"), operator: LOCKED, status: val("Open role", { system: true }), posting: LOCKED }, { opened: "2026-11-03", closed: null });
  check("an open role is never bundled (its title is free)", !seatBundled(claimOpen) && seatNoun(claimOpen, "role") === undefined);
  const paidHolder = eng({ role: val("Fractional CRO", { paid: true }), operator: val("Pat Holder", { paid: true }) }, { source: "Published engagement" });
  check("once unlocked, nothing about the pair is locked", !seatBothLocked(paidHolder) && seatNoun(paidHolder, "operator") === undefined && lockedInEngagement(paidHolder).length === 0);
}

/* ---------- Repeat hirers (the tab that replaced Fractional friendly) ---------- */

{
  const withF = (name: string, fractional: number, functions: string[], engs: EngagementRec[] = []) => {
    const c = co(name, engs);
    c.friendly = { ...c.friendly, fractional, functions };
    return c;
  };
  const open = eng({ status: val("Open role", { system: true }), function: val("Sales") }, { opened: "2026-11-03", closed: null });
  const [two, fns, one, openOnly] = deriveAll([withF("Two Hires", 2, ["Sales"]), withF("Two Functions", 1, ["Sales", "Marketing"]), withF("One Hire", 1, ["Sales"]), withF("Open Only", 0, [], [open])]);
  const rowOf = (i: typeof two) => rowsFor("companies", [i])[0];
  check("Repeat hirers: 2 or more fractional hires", tabTest("repeat", rowOf(two)) && repeatHirer(two));
  check("Repeat hirers: hires in 2 or more functions", tabTest("repeat", rowOf(fns)));
  check("Repeat hirers: one hire is not enough", !tabTest("repeat", rowOf(one)));
  check("Repeat hirers: an open role is not a hire", !tabTest("repeat", rowOf(openOnly)) && tabTest("hiring", rowOf(openOnly)));
  check("the tab is labelled Repeat hirers, with a one-line hint, and Fractional friendly is gone", TABS.some((t) => t.key === "repeat" && t.label === "Repeat hirers" && !!t.hint) && !TABS.some((t) => /friendly/i.test(t.label)));
  check("an old v=friendly address opens Repeat hirers", tabOf("friendly") === "repeat" && tabOf("hiring") === "hiring" && tabOf("nope") === null && tabOf(null) === null);
}

/* ---------- functions: hired, hiring now, and stories ---------- */

{
  // A full-time hire is the one seat that isn't counted as fractional (a story with no type is).
  const story = eng({ function: val("Sales"), type: val("Full-time") }, { source: "Member success story" });
  const untypedStory = eng({ function: val("Product") }, { source: "Member success story" });
  const openMk = eng({ function: val("Marketing"), status: val("Open role", { system: true }) }, { opened: "2026-11-03", closed: null });
  const added = eng({ function: val("RevOps") }, { source: "Member added" });
  const closedPosting = eng({ function: val("Growth"), status: val("Closed", { system: true }) }, { opened: "2026-10-03", closed: "2026-10-20" });
  // The server before this round counted open roles and postings in functions, and missed a member-added seat with no type.
  const c = co("Mix Co", [story, openMk, added, closedPosting]);
  c.friendly = { ...c.friendly, functions: ["Marketing", "Growth"] };
  const i = deriveAll([c])[0];
  check("a member-added seat is a hire, whatever its type", i.fnState.hired.includes("RevOps"), i.fnState);
  check("an open role's function is hiring, not hired", i.fnState.hiring.join() === "Marketing" && !i.fnState.hired.includes("Marketing"), i.fnState);
  check("a full-time seat's function is muted, not hired", i.fnState.story.includes("Sales") && !i.fnState.hired.includes("Sales"), i.fnState);
  check("a member story with no type counts as a fractional hire, like any other source", deriveAll([co("Story Co", [untypedStory])])[0].fnState.hired.includes("Product"));
  const newServer = co("New Co", [story, openMk, added]);
  newServer.friendly = { ...newServer.friendly, functions: ["RevOps"], hiring: ["Marketing"] } as typeof newServer.friendly;
  const j = deriveAll([newServer])[0];
  check("with friendly.hiring from the server", j.fnState.hired.join() === "RevOps" && j.fnState.hiring.join() === "Marketing" && j.fnState.story.join() === "Sales", j.fnState);
  // "No Sales yet" shows only when nothing on file names Sales (FnChips): never next to a Sales chip.
  const gap = (x: typeof i) => x.fnState.hired.length > 0 && !x.fns.includes("Sales");
  check("no 'No Sales yet' next to a Sales story", !gap(i) && !gap(j));
  const notMine = (x: typeof i) => toggleTest("notMine", me)({ key: x.c.id, i: x });
  const noSales = co("No Sales Co", [added]);
  noSales.friendly = { ...noSales.friendly, functions: ["RevOps"] };
  check("No Sales seat yet: hired other functions, none in Sales", notMine(deriveAll([noSales])[0]) && !notMine(deriveAll([co("Only open", [eng({ function: val("Marketing"), status: val("Open role", { system: true }) }, { opened: "2026-11-03", closed: null })])])[0]));
  // L39: a member story names Sales there, and the row shows a Sales chip, so it is not "No fractional Sales yet".
  check("No Sales seat yet leaves out a company whose full-time seat names Sales", j.fnState.story.includes("Sales") && !notMine(j), j.fnState);
  {
    // A company hiring a Sales seat right now is not "No Sales seat yet".
    const hiringSales = co("Hiring sales", [eng({ function: val("Marketing"), status: val("Ended") }, { source: "Member added" }), eng({ function: val("Sales"), status: val("Open role", { system: true }) }, { opened: "2026-11-03", closed: null })]);
    const h = deriveAll([hiringSales])[0];
    check("No Sales seat yet leaves out a company with an open Sales role", h.fnState.hiring.includes("Sales") && !notMine(h), h.fnState);
  }
  check("a catch-all function is not named in labels", notMineLabel("Executive") === "No fractional in your function yet" && notMineLabel("Sales") === "No fractional Sales yet" && namedFn("Other") === null);
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
  check("only a closed posting: the fit reads Posting closed, not Full-time only or Past seat", fitTier(c.friendly, 1, true).label === "Posting closed" && fitTier(c.friendly, 1).label === "Full-time only");
  check("its reason says when the posting came down", /^A job posting here came down on Oct 20\b/.test(fitReason(i)), fitReason(i));
}

/* ---------- Your seats: what is still missing ---------- */

{
  const mine = (status: Cell) => eng({ function: val("Sales"), role: val("VP Sales"), status, end: EMPTY }, { source: "Published engagement", yours: true });
  const active = mine(val("Active"));
  const ended = mine(val("Ended"));
  const meSeats = { function: "Sales", benchRates: [] } as unknown as Me;
  // An ended seat also asks why it ended (endReason); an active one asks neither.
  check("an Active seat's end month is not missing (Your seats doesn't ask for it), nor why it ended", seatMissingCount(active, meSeats) === seatMissingCount(ended, meSeats) - 2, [seatMissingCount(active, meSeats), seatMissingCount(ended, meSeats)]);
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
check("a person's name and title read as one purchase in the history", ledgerLine(row("unlock", "Person name and title", -1), 25).text === "Unlocked a person's name and title at Acme");
check("so do who held a seat and their role", ledgerLine(row("unlock", "Seat holder and role", -1), 25).text === "Unlocked the seat holder and their role at Acme" && ledgerLine(row("refund", "Seat holder and role"), 25).text === "Refund for the seat holder and their role at Acme, removed after review");
check(
  "the credit back for an ongoing end month reads the owner's line, with nothing after it",
  ledgerLine(row("Gave back 1 credit: an ongoing seat's end month is free now.", "", 1, ""), 25).text === "Gave back 1 credit: an ongoing seat's end month is free now.",
);
check("a private rate never names a company", ledgerLine(row("fill", "Private rate", 1, ""), 25).text === "Shared a rate privately" && ledgerLine(row("Removed", "Private rate", -1, ""), 25).text === "Removed a rate you shared privately");
// Unlock company reads "Unlocked a company", with its name once the member sees it, and never names one still locked.
check(
  "unlocking a locked company says so, and never names one still locked",
  ledgerLine(row("unlock", HIDDEN_COMPANY, -2), 25).text === "Unlocked a company: Acme" &&
    ledgerLine(row("unlock", HIDDEN_COMPANY, -2, HIDDEN_COMPANY), 25).text === "Unlocked a company" &&
    ledgerLine(row("unlock", "Rate", -1, HIDDEN_COMPANY), 25).text === "Unlocked the rate at a locked company",
);
check(
  "no credit history line says hidden or prints the placeholder",
  ["fill", "unlock", "refund", "reversal", "retract", "referral", "confirm", "Refund for a role that had closed"].every((r) => {
    const t = ledgerLine(row(r, r === "unlock" ? HIDDEN_COMPANY : "Role", -1, HIDDEN_COMPANY), 25).text;
    return !/hidden/i.test(t) && !t.includes(HIDDEN_COMPANY);
  }),
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

/* ---------- Get started ---------- */

{
  const base = { goal: "friendly", added: 0, unlocked: 0, holdersUnlocked: 0, companiesUnlocked: 0, invited: 0, invitesPaid: 0 } as const;
  const n = (r: ReturnType<typeof checkSteps>) => r.steps.filter((x) => x.done).length;
  const coOnly = checkSteps({ ...base, unlocked: 1, companiesUnlocked: 1 }, { seatsHeld: 0, seatsLeft: 0, earn: 0 });
  check("a company unlock does not tick See who held a seat", !coOnly.steps[0].done && coOnly.steps[0].label === "See who held a seat", coOnly.steps[0]);
  const holder = checkSteps({ ...base, unlocked: 1, holdersUnlocked: 1 }, { seatsHeld: 0, seatsLeft: 0, earn: 0 });
  check("unlocking a seat holder ticks it", holder.steps[0].done);
  const roles = checkSteps({ ...base, goal: "roles", unlocked: 1, companiesUnlocked: 1 }, { seatsHeld: 0, seatsLeft: 0, earn: 0 });
  check("looking for roles, a hidden company ticks See who is hiring", roles.steps[0].done && roles.steps[0].label === "See who is hiring");
  // Step 2 is "Find your seats": only a seat ticks it, never a company fact or a rate shared for the benchmarks (C33, C42).
  const facts = checkSteps({ ...base, added: 3, unlocked: 1, holdersUnlocked: 1 }, { seatsHeld: 0, seatsLeft: 0, earn: 0 });
  check("facts and benchmark rates don't tick Find your seats", n(facts) === 1 && !facts.steps[1].done && facts.steps[1].label === "Find your seats", facts.steps[1]);
  check("step 2 says what a seat is worth, honestly", facts.steps[1].hint === "up to ~12 credits a seat", facts.steps[1].hint);
  const after = checkSteps({ ...base, added: 4, unlocked: 1, holdersUnlocked: 1 }, { seatsHeld: 1, seatsLeft: 6, earn: 6 });
  check("a seat on file ticks step 2, and its label stays the same", n(after) === 2 && after.steps[1].done && after.steps[1].label === "Find your seats", after.steps[1]);
  check("Fill in your seats is a nudge once step 2 is done (it takes step 2's place: three items, never four)", !!after.nudge && after.nudge.label === "Fill in your seats" && after.steps.length === 3, after.nudge);
  const sticky = checkSteps({ ...base }, { seatsHeld: 0, seatsLeft: 0, earn: 0, stuck: new Set(["unlock", "seat"]) });
  check("a step done before stays done", n(sticky) === 2);
  const oldTick = checkSteps({ ...base }, { seatsHeld: 0, seatsLeft: 0, earn: 0, stuck: new Set(["give"]) });
  check("an old step 2 tick from any fact doesn't carry over", !oldTick.steps[1].done);
  const filled = checkSteps({ ...base }, { seatsHeld: 2, seatsLeft: 0, earn: 8 });
  check("seats on file with nothing left to fill: step 2 done, no nudge", filled.steps[1].done && !filled.nudge);
  // A seat holder and the seat's role are one purchase: the credit may have gone through the role's lock.
  const seenIt = checkSteps({ ...base, unlocked: 1, holdersUnlocked: 0 }, { seatsHeld: 0, seatsLeft: 0, earn: 0, seen: true, stepOne: "holder" });
  check("a seat holder the table shows as paid for ticks See who held a seat", seenIt.steps[0].done && seenIt.steps[0].label === "See who held a seat", seenIt.steps[0]);
  const person = checkSteps({ ...base }, { seatsHeld: 0, seatsLeft: 0, earn: 0, stepOne: "person" });
  check("no seat holder locked anywhere: step 1 names a person's name and title instead", person.steps[0].label === "See who decides at a company" && !person.steps[0].done, person.steps[0]);
  const none = checkSteps({ ...base }, { seatsHeld: 1, seatsLeft: 3, earn: 3, stepOne: "none" });
  check(
    "nothing locked anywhere: step 1 is left out, and the nudge still takes step 2's place",
    none.steps.map((x) => x.key).join() === "seat,invite" && !!none.nudge,
    none.steps.map((x) => x.key),
  );
  const rolesNone = checkSteps({ ...base, goal: "roles" }, { seatsHeld: 0, seatsLeft: 0, earn: 0, stepOne: "none" });
  check("looking for roles, step 1 stays See who is hiring", rolesNone.steps[0].label === "See who is hiring" && rolesNone.steps.length === 3);
}

/* ---------- Get started as the app shows it: step 1 stays "Unlock a company" (startSteps) ---------- */

{
  const base = { goal: "adjacent", added: 0, unlocked: 0, holdersUnlocked: 0, companiesUnlocked: 0, invited: 0, invitesPaid: 0, freeCompany: true, unlocksLeft: 25 } as const;
  const fresh = startSteps(base, { seatsHeld: 0, seatsLeft: 0, earn: 0, stepOne: "company" });
  check("step 1 is Unlock a company, free while the company of the day is left", fresh.steps[0].label === "Unlock a company" && !fresh.steps[0].done && fresh.steps[0].hint === "1 free company today", fresh.steps[0]);
  check("  and it is the next thing to do", fresh.next?.action === "unlock" && fresh.next.label === "Unlock a company", fresh.next);
  const paid = startSteps({ ...base, freeCompany: false }, { seatsHeld: 0, seatsLeft: 0, earn: 0, stepOne: "company" });
  check("after the free one, it costs 2 credits", paid.steps[0].hint === "costs 2 credits", paid.steps[0].hint);
  // A company unlock ticks step 1, and its label stays (it used to turn into See who held a seat).
  const one = startSteps({ ...base, unlocked: 1, companiesUnlocked: 1 }, { seatsHeld: 0, seatsLeft: 0, earn: 0, stepOne: "holder" });
  check("any company unlock ticks step 1, and the label stays the same", one.steps[0].done && one.steps[0].label === "Unlock a company" && one.steps.length === 3, one.steps[0]);
  check("  Find your seats is next, as one line", one.next?.action === "seats" && one.next.label === "Find your seats" && one.next.hint === "up to ~12 credits a seat", one.next);
  check("  See who held a seat is never a step", !one.steps.some((x) => x.label === "See who held a seat"));
  const seated = startSteps({ ...base, unlocked: 1, companiesUnlocked: 1 }, { seatsHeld: 1, seatsLeft: 0, earn: 0, stepOne: "holder" });
  check("with a seat on file, See who held a seat is the next nudge", seated.next?.action === "holder" && seated.next.label === "See who held a seat", seated.next);
  const filling = startSteps({ ...base, unlocked: 1, companiesUnlocked: 1 }, { seatsHeld: 1, seatsLeft: 4, earn: 4, stepOne: "holder" });
  check("seats still to fill in come before who held a seat", filling.next?.action === "fillSeats", filling.next);
  const held = startSteps({ ...base, unlocked: 2, companiesUnlocked: 1, holdersUnlocked: 1 }, { seatsHeld: 1, seatsLeft: 0, earn: 0, stepOne: "holder" });
  check("once a seat holder is seen, the invite is next", held.next?.action === "invite", held.next);
  const all = startSteps({ ...base, unlocked: 2, companiesUnlocked: 1, holdersUnlocked: 1, invitesPaid: 1, invited: 1 }, { seatsHeld: 1, seatsLeft: 0, earn: 0, stepOne: "holder" });
  check("every step done: nothing next", all.next === null && all.steps.every((x) => x.done), all);
  const none = startSteps(base, { seatsHeld: 0, seatsLeft: 0, earn: 0, stepOne: "none" });
  check("nothing locked to unlock and none unlocked: step 1 is left out", none.steps.map((x) => x.key).join() === "seat,invite", none.steps);
  const roles = startSteps({ ...base, goal: "roles" }, { seatsHeld: 0, seatsLeft: 0, earn: 0, stepOne: "company" });
  check("looking for roles reads the same", roles.steps[0].label === "Unlock a company", roles.steps[0]);
}

/* ---------- Get started step 1: who held a seat, and nothing else ---------- */

{
  const held = (fn: string, extra: Partial<EngagementRec> = {}, cells: Record<string, Cell> = {}) =>
    eng({ function: val(fn), type: val("Fractional"), start: val("2024-01"), status: val("Ended"), operator: LOCKED, role: LOCKED, ...cells }, { source: "Published engagement", ...extra });
  // A LinkedIn-found seat with nobody named: the latest seat at most companies, its role locked.
  const research = (fn: string) => eng({ function: val(fn), start: val("2026-06"), status: val("Active"), operator: EMPTY, role: LOCKED, end: LOCKED }, { source: "Seat scan", claimable: true } as Partial<EngagementRec>);
  const aSales = held("Sales");
  const a = co("Alpha", [research("Marketing"), aSales]);
  const bMkt = held("Marketing", {}, { start: val("2026-01") });
  const b = co("Beta", [bMkt]);
  const hiddenSeat = held("Sales");
  const h = Object.assign(co("Locked company", [hiddenSeat]), { hidden: true });
  const own = held("Sales", { yours: true }, { operator: val("Me Myself") });
  const o = co("Own Co", [own]);
  const infosS = deriveAll([a, b, h, o]);
  const rows = rowsFor("companies", infosS);
  const latest = (r: { i: { latest: EngagementRec | null } }) => r.i.latest;
  check("the research seat is Alpha's latest seat (the row shows it)", infosS[0].latest?.source === "Seat scan", infosS[0].latest?.source);
  const t1 = holderTarget(rows, infosS, "Sales", latest);
  check("step 1 points at a seat holder, never the role of the seat the row shows", t1?.t.field === "operator" && t1.t.id === aSales.id && t1.focus === aSales.id, t1 && { field: t1.t.field, id: t1.t.id });
  check("an older seat's holder counts: every seat of every row is looked at", t1?.row?.i.c.name === "Alpha" && t1.idx === 0);
  const t2 = holderTarget(rows, infosS, "Marketing", latest);
  check("seats in the member's function come first", t2?.t.id === bMkt.id, t2?.t.id);
  b.following = true;
  const followed = deriveAll([a, b, h, o]);
  const t3 = holderTarget(rowsFor("companies", followed), followed, "Sales", latest);
  check("followed companies come first", t3?.t.id === bMkt.id, t3?.t.id);
  b.following = false;
  check("never a locked company's holder, never the member's own seat", !lockedHolder(infosS[2], hiddenSeat) && !lockedHolder(infosS[3], own));
  // The list on screen has no holder locked: the member's whole table, with no row (the record opens there).
  const onlyHidden = rowsFor("companies", [infosS[2]]);
  const t4 = holderTarget(onlyHidden, infosS, "Sales", latest);
  check("no holder in the list on screen: one from the whole table, opened in its record", !!t4 && t4.row === null && t4.idx === -1 && t4.t.field === "operator" && t4.i.c.name === "Alpha", t4 && { row: t4.row, co: t4.i.c.name });
  // The Seats list: each seat is its own row.
  const seatRows = rowsFor("engagements", infosS);
  const t5 = holderTarget(seatRows, infosS, null, (r) => r.e ?? null);
  check("on the Seats list it is that seat's own holder", t5?.t.id === aSales.id && t5.row?.e === aSales, t5?.t.id);
  check("a seat holder and the seat's role are found as one lock", sameBuy({ entity: "engagement", id: "e1", field: "operator" }).join() === "e1.operator,e1.role");
  check("a person's name and title are found as one lock", sameBuy({ entity: "contact", id: "p1", field: "name" }).join() === "p1.name,p1.title");
  check("with a seat holder locked anywhere, step 1 is the seat holder step", stepOneKind(infosS) === "holder");
  // No seat holder locked anywhere: a person's name and title, else nothing.
  const p = person();
  const peopleOnly = deriveAll([co("Gamma", [research("Sales")], [p])]);
  check("no seat holder anywhere but a person: the person step", stepOneKind(peopleOnly) === "person");
  const pt = personTarget(rowsFor("companies", peopleOnly), peopleOnly);
  check("the person step points at their name (name and title are one lock)", pt?.t.entity === "contact" && pt.t.id === p.id && pt.t.field === "name" && pt.focus === p.id, pt?.t);
  check("nothing locked anywhere: no step 1 target", stepOneKind(deriveAll([co("Delta", [research("Sales")])])) === "none");
  // Ticks from what the table shows.
  check("nothing paid for yet: not seen", !holderSeen(infosS));
  const paidSeat = held("Sales", {}, { operator: val("Jane Smith", { paid: true }) });
  check("a seat holder the member paid for is seen", holderSeen(deriveAll([co("Paid Co", [paidSeat])])));
  check("their own seat's holder is not", !holderSeen(infosS));
}

/* ---------- earning back from the wall: the fact named, the way back, the invite ---------- */

{
  check("the wall names the fact tapped", tappedWhat("e12.operator") === "who held this seat" && tappedWhat("e12.rate") === "the rate" && tappedWhat("p3.title") === "this person's name and title");
  check("the wall's Unlock company button has no cell: the company", tappedWhat(null) === "this company" && tappedWhat("c9.identity") === "this company");
  wallBack.set({ id: "e12", key: "e12.rate", search: true });
  const back1 = wallBack.take();
  check("Your seats takes what the wall left, once", back1?.key === "e12.rate" && back1.search && wallBack.take() === null, back1);
  const msg = inviteMessage("Sales", "https://merlin.example/?ref=abc");
  const words = msg.slice(0, msg.lastIndexOf("\n\n"));
  check("the invite is written for the member's function, with the link at the end", /fractional sales leaders/.test(msg) && msg.endsWith("https://merlin.example/?ref=abc"), msg);
  check("the invite keeps the voice rules (no colon, semicolon or em dash)", !/[:;—]/.test(words), words);
  check("RevOps keeps its capitals in the invite", /fractional RevOps leaders/.test(inviteMessage("RevOps", "x")));
  check("no named function: fractional leaders", /hire fractional leaders/.test(inviteMessage("Other", "x")));
  const mail = inviteMailto(msg);
  check("Email it opens a mail with the subject and the message filled in", mail.startsWith("mailto:?subject=Join%20me%20on%20Merlin&body=") && decodeURIComponent(mail.split("body=")[1]) === msg);
  check("the wall states a seat's yield honestly", SEAT_YIELD === "up to ~12 credits a seat");
}

/* ---------- who the member hunts: ideal client, firms, country, best fit, saved views ---------- */

{
  const withCells = (c: CompanyRec, cells: Record<string, string>, extra: Record<string, unknown> = {}) => {
    for (const [k, v] of Object.entries(cells)) c.cells[k] = val(v);
    return Object.assign(c, extra);
  };
  const hire = (fn: string, start: string) => eng({ function: val(fn), type: val("Fractional"), start: val(start), operator: LOCKED }, { source: "Published engagement" });
  const fit = withCells(co("Fit Co", [hire("Sales", "2025-03")]), { industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX" });
  fit.friendly = { ...fit.friendly, fractional: 1, functions: ["Sales"], recent: 1 };
  const owned = withCells(co("Has Marketing", [hire("Marketing", "2024-01")]), { industry: "SaaS", employees: "51–200", revenue: "$5M–$20M" });
  owned.friendly = { ...owned.friendly, fractional: 1, functions: ["Marketing"] };
  const wrong = withCells(co("Retail Co", [hire("Sales", "2025-01")]), { industry: "Retail", employees: "51–200", revenue: "$5M–$20M" });
  wrong.friendly = { ...wrong.friendly, fractional: 1, functions: ["Sales"] };
  const merged = withCells(co("Old Name Co", []), { industry: "saas", employees: "11–50", revenue: "$5M–$20M", hq: "London, United Kingdom" });
  const firm = withCells(co("Firm Co", []), { industry: "SaaS", employees: "11–50", revenue: "$5M–$20M" }, { firm: true });
  const abroad = withCells(co("Berlin Co", []), { industry: "SaaS", employees: "11–50", revenue: "$5M–$20M" }, { country: "Germany", region: "Berlin" });
  // No size on file, a recent hire in another function and no Marketing seat: a strong company, but a maybe.
  const maybe = withCells(co("Maybe Co", [hire("Sales", "2026-02"), hire("RevOps", "2026-01")]), { industry: "SaaS", revenue: "$5M–$20M" }, { country: "United States", region: "Texas" });
  maybe.friendly = { ...maybe.friendly, fractional: 2, functions: ["Sales", "RevOps"], recent: 2 };
  const all = deriveAll([fit, owned, wrong, merged, firm, abroad, maybe]);
  const icp = { industries: ["SaaS"], employees: ["11–50", "51–200"], revenue: ["$5M–$20M"], countries: [] as string[] };
  const mkt = { function: "Marketing", goal: null, icp } as unknown as Me;
  const names = (f: Partial<typeof EMPTY_FILTERS>, who: Me = mkt) => applyFilters(rowsFor("companies", all), { ...EMPTY_FILTERS, ...f }, "all", "", who).rows.map((r) => r.i.c.name);

  const on = names({ icp: true });
  check("ideal client: matching industry, size and revenue, and maybes, never a known conflict", on.includes("Fit Co") && on.includes("Has Marketing") && on.includes("Maybe Co") && !on.includes("Retail Co"), on);
  check("ideal client: industries match case aside", on.includes("Old Name Co"), on);
  check("ideal client off: everyone", names({}).includes("Retail Co"));
  const facets = applyFilters(rowsFor("companies", all), { ...EMPTY_FILTERS, icp: true }, "all", "", mkt).facets;
  check("Show everyone counts the rows without the ideal client", facets.everyone === names({}).length, facets.everyone);
  const us = names({ icp: true }, { ...mkt, icp: { ...icp, countries: ["US"] } } as Me);
  check("ideal client US only: US companies and ones with no country on file, not Germany or the UK", us.includes("Fit Co") && !us.includes("Berlin Co") && !us.includes("Old Name Co") && us.includes("Has Marketing"), us);

  check("fractional firms never show", !names({}).includes("Firm Co") && !names({ icp: true }).includes("Firm Co"));

  check(
    "country filter reads the record, else the HQ",
    names({ country: ["United States"] }).join() === "Fit Co,Maybe Co" && names({ country: ["Germany"] }).join() === "Berlin Co" && names({ country: ["United Kingdom"] }).join() === "Old Name Co",
    names({ country: ["United States"] }),
  );
  check("region filter under a country", names({ country: ["United States"], region: ["Texas"] }).join() === "Fit Co,Maybe Co" && names({ region: ["Berlin"] }).join() === "Berlin Co");
  const cf = applyFilters(rowsFor("companies", all), { ...EMPTY_FILTERS, country: ["United States"] }, "all", "", mkt).facets.lists;
  check("country counts, and regions only under the picked country", cf.country["United States"] === 2 && cf.country.Germany === 1 && cf.region.Texas === 2 && !cf.region.Berlin, cf);
  check("countryOf and regionOf from an HQ", countryOf(fit) === "United States" && regionOf(fit) === "Texas" && countryOf(abroad) === "Germany");

  const order = sortRows(rowsFor("companies", all), "best", false, "", { me: mkt }).map((r) => r.i.c.name);
  check(
    "best fit: the ideal client with no Marketing seat and a recent hire comes first",
    order[0] === "Fit Co" && order.indexOf("Has Marketing") > 0 && order.indexOf("Retail Co") > order.indexOf("Has Marketing") && order[order.length - 1] === "Firm Co",
    order,
  );
  check(
    "best fit: confirmed matches first, maybes after, known conflicts last",
    order.indexOf("Maybe Co") > order.indexOf("Has Marketing") && order.indexOf("Maybe Co") < order.indexOf("Retail Co") && order.indexOf("Fit Co") < order.indexOf("Maybe Co"),
    order,
  );
  const mwhy = bestFit(all[6], mkt);
  check("a maybe says what isn't on file", mwhy.match === "maybe" && /· Size not on file$/.test(mwhy.reason), mwhy);
  check("a confirmed match says nothing is missing", bestFit(all[0], mkt).match === "match" && !/not on file/.test(bestFit(all[0], mkt).reason));
  const bare = withCells(co("Bare Co", []), {}, { country: null, region: null });
  const usIcp = { ...icp, countries: ["United States"] };
  check("nothing on file: a maybe that names every part, left out of the clients view", icpMatch(usIcp, bare) === "maybe" && icpUnknown(usIcp, bare) === "Industry, size, revenue and country not on file" && !icpTest(usIcp)(bare), icpUnknown(usIcp, bare));
  check("a maybe with one confirmed part stays in the clients view", icpTest(usIcp)(withCells(co("Half Co", []), { employees: icp.employees[0] }, { country: null, region: null })));
  check("a known conflict is out whatever else is missing", icpMatch(usIcp, abroad) === "no" && !icpTest(usIcp)(abroad) && icpUnknown(usIcp, abroad) === null);
  check("the server's country wins over the HQ", countryOf(withCells(co("Field Co", []), { hq: "Austin, TX" }, { country: null, region: null })) === null);
  const why = bestFit(all[0], mkt).reason;
  check("best fit reason reads like the spec", why === "SaaS · 51–200 · $5M–$20M · hired Sales in 2025 · no Marketing seat", why);
  check("Best fit without a member sorts like fit", sortRows(rowsFor("companies", all), "best").length === all.length);

  check("pill label joins bands", icpLabel({ ...icp, countries: ["United States"] }) === "SaaS · 11–200 · $5M–$20M · US", icpLabel({ ...icp, countries: ["United States"] }));
  check("band ranges", bandRange(RN_REVENUE, ["$20M–$50M", "$50M+"]) === "$20M+" && bandRange(RN_REVENUE, ["Under $1M", "$1M–$5M"]) === "Under $5M" && bandRange(RN_EMPLOYEES, ["1–10", "201–500"]) === "1–10, 201–500");

  const sw = ["SaaS", "Enterprise Software", "SMB Software", "Developer Tools"];
  check("Software (all) reads as one in the pill", icpLabel({ ...icp, industries: [...sw, "Fintech"] }) === "Software (all), Fintech · 11–200 · $5M–$20M", icpLabel({ ...icp, industries: [...sw, "Fintech"] }));
  check("part of the group stays as picked", industryWords(["SaaS", "Developer Tools"]).join() === "SaaS,Developer Tools");
  const swChips = activeChips({ ...EMPTY_FILTERS, industry: [...sw, "Fintech"] }).map((c) => c.label);
  check("Software (all) is one filter chip that clears all four", swChips.join() === "Industry Software (all),Industry Fintech" && activeChips({ ...EMPTY_FILTERS, industry: sw })[0].clear({ ...EMPTY_FILTERS, industry: [...sw, "Fintech"] }).industry.join() === "Fintech", swChips);
  check("a view of Software (all) is named Software", viewName({ ...EMPTY_FILTERS, industry: sw }, "all", "companies") === "Software companies");

  // Hiring now: the member's function first, then the newest open role.
  const open = (fn: string, opened: string, posted?: string) => eng({ function: val(fn), status: val("Open role", { system: true }), role: LOCKED }, { opened, closed: null, posted: posted ?? null });
  const roles = deriveAll([co("A", [open("Sales", "2026-11-10")]), co("B", [open("Marketing", "2026-11-01")]), co("C", [open("Marketing", "2026-11-02", "2026-11-12")]), co("D", [open("Sales", "2026-11-14")])]);
  const hr = sortRows(rowsFor("engagements", roles), "newest", false, "", { me: mkt, fnFirst: "Marketing" }).map((r) => r.i.c.name);
  check("Hiring now: the member's function first, then newest by posted day, else first seen", hr.join("") === "CBDA", hr);
  const split = splitByFn(rowsFor("engagements", roles), "Marketing");
  check("Hiring now splits by function", split.mine.length === 2 && split.others.length === 2);
  check("one date label: open since the posted day, else first seen", openSince(roles[2].engs[0]) === "2026-11-12" && openSince(roles[0].engs[0]) === "2026-11-10");

  // Saved views.
  const spelled = withIcpSpelled({ ...EMPTY_FILTERS, icp: true, fn: ["Marketing"] }, icp);
  check("a saved view writes the ideal client out", !spelled.icp && spelled.industry.join() === "SaaS" && spelled.employees.length === 2);
  const vn = viewName({ ...EMPTY_FILTERS, fn: ["Marketing"], industry: ["SaaS"], revenue: ["$5M–$20M"] }, "hiring", "engagements");
  check("a view's name comes from its filters", vn === "Marketing roles at SaaS companies, $5M–$20M", vn);
  check("a view's email criteria", JSON.stringify(criteriaOf(spelled, null)) === JSON.stringify({ function: "Marketing", industry: ["SaaS"], employees: ["11–50", "51–200"], revenue: ["$5M–$20M"] }), criteriaOf(spelled, null));

  // The owner's changes: no Needs facts view, and old links to it open All.
  check("Needs facts is gone and old links open All", !TABS.some((t) => (t.key as string) === "needs") && tabOf("needs") === "all");
  check("Best fit for you is a sort, and Most fractional-friendly stays", SORTS[0].key === "best" && SORTS[0].label === "Best fit for you" && SORTS.some((s) => s.label === "Most fractional-friendly"));
}

/* ---------- round 3 table fixes: the profile, own lists, Hiring now counts, card seats, best fit by function ---------- */

{
  const withCells = (c: CompanyRec, cells: Record<string, string>, extra: Record<string, unknown> = {}) => {
    for (const [k, v] of Object.entries(cells)) c.cells[k] = val(v);
    return Object.assign(c, extra);
  };
  // C17: "US only" with nothing else: a company whose country isn't on file is not a match.
  const usOnly = { industries: [] as string[], employees: [] as string[], revenue: [] as string[], countries: ["United States"] };
  const noCountry = withCells(co("Somewhere Co", []), { industry: "SaaS" }, { country: null, region: null });
  const inUs = withCells(co("Austin Co", []), { industry: "SaaS" }, { country: "United States", region: "Texas" });
  check("a country-only profile leaves out a company whose country isn't on file", !icpTest(usOnly)(noCountry) && icpTest(usOnly)(inUs));
  const saasUs = { ...usOnly, industries: ["SaaS"] };
  check("a confirmed industry with the country not on file stays, as a maybe", icpTest(saasUs)(noCountry) && icpMatch(saasUs, noCountry) === "maybe");

  // C23, C35: Following and Unlocked are the member's own lists: the profile never narrows them, rows or counts.
  const followed = withCells(co("Followed Retail", [eng({ function: val("Sales"), type: val("Fractional") }, { source: "Published engagement" })]), { industry: "Retail" }, { following: true });
  const fitCo = withCells(co("Fit SaaS", []), { industry: "SaaS" }, { following: true });
  const other = withCells(co("Other Retail", []), { industry: "Retail" });
  const all = deriveAll([followed, fitCo, other]);
  const who = { function: "Sales", goal: null, icp: { industries: ["SaaS"], employees: [], revenue: [], countries: [] } } as unknown as Me;
  const f = { ...EMPTY_FILTERS, icp: true };
  const following = applyFilters(rowsFor("companies", all), f, "following", "", who);
  check("Following ignores the profile", following.rows.map((r) => r.i.c.name).sort().join() === "Fit SaaS,Followed Retail", following.rows.map((r) => r.i.c.name));
  const onAll = applyFilters(rowsFor("companies", all), f, "all", "", who);
  check("All keeps the profile, and the Following tab counts both follows", onAll.rows.map((r) => r.i.c.name).join() === "Fit SaaS" && onAll.facets.tabs.following === 2 && following.facets.tabs.following === 2, onAll.facets.tabs);
  check("the All count on the Following tab still reads the profile", following.facets.tabs.all === 1, following.facets.tabs);

  // C48: Hiring now lists the member's function alone; its count says so (hiringMine).
  const open = (fn: string, extra: Partial<EngagementRec> = {}) => eng({ function: val(fn), status: val("Open role", { system: true }), role: LOCKED }, { opened: "2026-11-10", closed: null, ...extra });
  const hiring = deriveAll([co("H1", [open("Sales")]), co("H2", [open("Marketing")]), co("H3", [open("Partnerships")])]);
  const hf = applyFilters(rowsFor("engagements", hiring), EMPTY_FILTERS, "all", "", who).facets;
  check("Hiring now counts every function, and the member's own apart", hf.tabs.hiring === 3 && hf.hiringMine === 1, [hf.tabs.hiring, hf.hiringMine]);
  check("the Open now chip counts what Hiring now lists", hf.lists.roleState["Open now"] === hf.tabs.hiring);

  // C25: new this week, counted the way the server counts View.scan.mine7.
  const now = Date.now();
  const day = (ago: number) => new Date(now - ago * 86_400_000).toISOString();
  const fresh = open("Sales", { opened: day(2).slice(0, 10), openedAt: day(2) });
  const old = open("Sales", { opened: day(10).slice(0, 10), openedAt: day(10) });
  const repost = open("Sales", { opened: day(1).slice(0, 10), openedAt: day(1), posted: day(30).slice(0, 10) });
  const unseen = open("Sales", { opened: day(1).slice(0, 10), openedAt: day(1), unseen: true });
  check("new this week: first seen in 7 days, posted in 14, still listed", newThisWeek(fresh) && !newThisWeek(old) && !newThisWeek(repost) && !newThisWeek(unseen));
  const wk = deriveAll([co("W1", [fresh, old]), withCells(co("W2", [open("Sales", { opened: day(1).slice(0, 10), openedAt: day(1) })]), { industry: "Retail" }), co("W3", [open("Marketing", { opened: day(1).slice(0, 10), openedAt: day(1) })])]);
  wk[0].c.cells.industry = val("SaaS");
  const fit = icpTest(who.icp!);
  const card = newRolesFor(wk, "Sales", (i) => fit(i.c));
  const week = rolesThisWeek(wk, "Sales", (i) => fit(i.c));
  check("the next-move card counts inside the profile, like the Hiring now line under it", card.roles === 1 && week.mine === 1 && newRolesFor(wk, "Sales").roles === 2, [card, week]);

  // C45: a phone card leads with a seat in the member's function, its holder on file first.
  const research = eng({ function: val("AI GTM"), start: val("2026-05"), operator: EMPTY }, { source: "Seat scan", claimable: true } as Partial<EngagementRec>);
  const salesNoName = eng({ function: val("Sales"), start: val("2024-01"), operator: EMPTY }, { source: "Published engagement" });
  const salesNamed = eng({ function: val("Sales"), start: val("2022-01"), operator: LOCKED }, { source: "Published engagement" });
  const revops = eng({ function: val("RevOps"), start: val("2023-01"), operator: LOCKED }, { source: "Published engagement" });
  const ci = deriveAll([co("Card Co", [research, salesNoName, salesNamed, revops])])[0];
  check("card seat: the member's function with a holder on file first", cardSeat(ci, "Sales") === salesNamed);
  check("card seat: no seat in the function, a seat with a holder on file", cardSeat(ci, "Marketing") === revops);
  check("card seat: no function, a holder on file before a nameless research seat", cardSeat(ci, null) === revops && ci.latest === research);

  // C24: Best fit for you on seats leads with the member's function, fractional ahead of full-time.
  const s1 = eng({ function: val("RevOps"), type: val("Fractional") }, { source: "Published engagement" });
  const s2 = eng({ function: val("Sales"), type: val("Full-time") }, { source: "Published engagement" });
  const s3 = eng({ function: val("Sales"), type: val("Fractional") }, { source: "Published engagement" });
  const seats = deriveAll([co("S1", [s1]), co("S2", [s2]), co("S3", [s3])]);
  const order = sortRows(rowsFor("engagements", seats), "best", false, "", { me: who }).map((r) => r.e!.id);
  check("best fit on seats: the member's function first, fractional before full-time", order.join() === [s3.id, s2.id, s1.id].join(), order);

  // L42: a view's name says the shortcut that makes it.
  check("a view's name names its shortcuts", viewName({ ...EMPTY_FILTERS, notMine: true }, "all", "companies", null, "Marketing") === "Companies, no fractional Marketing yet");
}

/* ---------- what the table, the cards and the record show (app/post/display.ts) ---------- */
{
  // The Companies table's "Functions hired": 3 chips at most, the dashed "No fractional Sales yet" counted, then "+N".
  const fnSeat = (fn: string) => eng({ function: val(fn), type: val("Fractional"), status: val("Active"), start: val("2025-03") }, { source: "Published engagement" });
  const fnCo = (name: string, fns: string[]) => deriveAll([co(name, fns.map(fnSeat))])[0];
  const many = fnCo("Many Co", ["Marketing", "Finance", "RevOps", "Customer Success"]);
  check("four functions hired fractionally are on file", many.fnState.hired.length === 4, many.fnState);
  const table = fnChipPlan(many, "Sales", { total: 3 });
  check("table: 2 function chips, then +2, then No fractional Sales yet (3 chips in all)", table.chips.length === 2 && table.rest.length === 2 && table.gap, table);
  check("table: +N names what it stands for", table.rest.join() === "RevOps,Customer Success", table.rest);
  const mineHired = fnChipPlan(fnCo("Mine Co", ["Marketing", "Sales", "Finance", "RevOps"]), "Sales", { total: 3 });
  check("table: the member's function hired comes first, 3 chips and +1, no dashed chip", mineHired.chips.length === 3 && mineHired.chips[0].f === "Sales" && mineHired.rest.length === 1 && !mineHired.gap, mineHired);
  const filterOn = fnChipPlan(many, "Sales", { total: 3, gap: false });
  check("table with the No fractional Sales yet filter on: 3 function chips and +1", filterOn.chips.length === 3 && filterOn.rest.length === 1 && !filterOn.gap, filterOn);
  const one = fnChipPlan(fnCo("One Co", ["Marketing"]), "Sales", { total: 3 });
  check("table: one function and the dashed chip, nothing folded into +N", one.chips.length === 1 && one.rest.length === 0 && one.gap, one);
  const cards = fnChipPlan(many, "Sales");
  check("phone cards keep 3 function chips beside the dashed chip", cards.chips.length === 3 && cards.rest.length === 1 && cards.gap, cards);
  check("no function of their own: no dashed chip, 3 function chips", (() => {
    const p = fnChipPlan(many, null, { total: 3 });
    return p.chips.length === 3 && !p.gap;
  })());

  // No confirmation mark beside a name from public profiles nobody verified. Verify says how many confirmed it.
  check("an unverified name gets no check, even confirmed once", !marksConfirmed(val("A Name", { unverified: true, ver: 1 })));
  check("a verified name and any other fact keep the mark", marksConfirmed(val("A Name", { ver: 2 })) && marksConfirmed(val("Fractional CFO")));
  check("a lock or an empty fact has no mark", !marksConfirmed(LOCKED) && !marksConfirmed(EMPTY) && !marksConfirmed(undefined));
  check("Verify says how many members confirmed the name", confirmedWords(1) === "1 member confirmed this name." && confirmedWords(2) === "2 members confirmed this name.");
  check("Verify says when nobody has yet", confirmedWords(0) === "No member has confirmed this name yet.");

  // The day's unlock limit, shown only where it binds before the balance.
  check("day one with credits earned: 25 unlocks left today", unlocksLeft({ credits: 29, unlocksLeft: 25 }) === 25 && unlocksLeftWords({ credits: 29, unlocksLeft: 25 }) === "25 unlocks left today");
  check("the balance runs out first: nothing to say", unlocksLeftWords({ credits: 25, unlocksLeft: 25 }) === null && unlocksLeftWords({ credits: 10, unlocksLeft: 24 }) === null);
  check("one left", unlocksLeftWords({ credits: 3, unlocksLeft: 1 }) === "1 unlock left today");
  check("none left today with credits to spend", unlocksLeft({ credits: 5, unlocksLeft: 0 }) === 0 && unlocksLeftWords({ credits: 5, unlocksLeft: 0 }) === "No unlocks left today");
  check("out of credits and unlocks: the credits say it, not the limit", unlocksLeftWords({ credits: 0, unlocksLeft: 0 }) === null);
  check("no limit in play", unlocksLeftWords({ credits: 30, unlocksLeft: null }) === null && unlocksLeftWords({ credits: 30 }) === null);
  check("the tooltip says the first day and the daily limit", /25 facts on their first day/.test(UNLOCKS_LEFT_TIP) && /100 a day/.test(UNLOCKS_LEFT_TIP));

  // A hiring company the member unlocked: its job posting is the record's primary button.
  const role = (posting: Cell, extra: Partial<EngagementRec> = {}) =>
    eng({ status: val("Open role", { system: true }), role: val("Fractional VP Sales"), posting }, { opened: "2026-11-03", closed: null, ...extra });
  const r1 = role(val("jobs.example.com/vp-sales"));
  const r2 = role(val("https://jobs.example.com/cmo"));
  const unlockedCo = (engs: EngagementRec[], extra: Partial<CompanyRec> = { unlocked: true }) => deriveAll([{ ...co("Hiring Co", engs), ...extra } as CompanyRec])[0];
  const pick = postingToOpen(unlockedCo([r1, r2]), null);
  check("unlocked and hiring: the newest open role's posting, as a web link", !!pick && pick.href === "https://jobs.example.com/vp-sales", pick);
  check("opened at a seat: that open role's posting", postingToOpen(unlockedCo([r1, r2]), r2.id)?.href === "https://jobs.example.com/cmo");
  check("still hidden: no posting button (Unlock company leads)", postingToOpen(unlockedCo([r1], { hidden: true }), null) === null);
  check("seen without paying (added to it, or held a seat): Add keeps the lead", postingToOpen(unlockedCo([r1], {}), null) === null);
  check("a posting still locked, or none: no button", postingToOpen(unlockedCo([role(LOCKED)]), null) === null && postingToOpen(unlockedCo([role(EMPTY)]), null) === null);
  check("a closed role's posting is not the lead", postingToOpen(unlockedCo([role(val("https://jobs.example.com/old"), { closed: "2026-11-10" })]), null) === null);
  check("a posting that is no web address is no button", postingToOpen(unlockedCo([role(val("javascript:alert(1)"))]), null) === null);

  // Recently hired on a phone, folded to one line.
  check(
    "the folded line reads like the owner's example",
    foldParts({ fns: ["Finance"], within: 6, scope: "in my profile", mine: "Sales", notMine: true }).join(" · ") === "Finance hires · 6 mo · in my profile · no Sales yet",
  );
  check("two functions, any time, all companies, no gap switch", foldParts({ fns: ["Finance", "Marketing"], within: 0, scope: "all companies", mine: "Sales", notMine: false }).join(" · ") === "Finance or Marketing hires · any time · all companies");
  check("three functions, and none picked", foldParts({ fns: ["Finance", "Marketing", "RevOps"], within: 12, scope: "in my profile", mine: null, notMine: true })[0] === "Hires in 3 functions" && foldParts({ fns: [], within: 3, scope: "x", mine: "Sales", notMine: false })[0] === "Hires in any function");
}

/* ---------- Today: its data with or without GET ?today=1, and since your last visit ---------- */

{
  const small = { me: {}, freeCompany: true, radar: { day: "2026-11-20", fn: "Sales", rows: [], newCount: 3 } };
  check("?today=1's small answer is read", isTodayAnswer(small));
  // TodayView (lib/viewWire.ts) carries its rows' companies: the answer as the server sends it is read too.
  check("?today=1's answer with its rows' companies is read", isTodayAnswer({ ...small, companies: [{ id: "c_1" }] }));
  check("a full view (a server without ?today=1) or an error is not: Today falls back to ?radar=1", !isTodayAnswer({ me: {}, companies: [], stats: {}, radar: small.radar }) && !isTodayAnswer({ me: {}, companies: [] }) && !isTodayAnswer({ error: "x" }) && !isTodayAnswer(null));
  const days = [
    { day: "2026-11-20", companies: 2 },
    { day: "2026-11-19", companies: 0 },
    { day: "2026-11-18", companies: 4 },
    { day: "2026-11-17", companies: 1 },
  ];
  check("Crystal Ball since the last visit: the days after it", radarSince({ days }, "2026-11-17T15:00:00Z") === 6 && radarSince({ days }, "2026-11-20T08:00:00Z") === 0, radarSince({ days }, "2026-11-17T15:00:00Z"));
  check("on a first visit, its latest day with any", radarSince({ days }, null) === 2 && radarSince({ days: [] }, null) === 0);
  const at = "2026-11-17T12:00:00Z";
  const opened = (fn: string, day: string, extra: Partial<EngagementRec> = {}) => eng({ function: val(fn), status: val("Open") }, { opened: day, openedAt: `${day}T09:00:00Z`, ...extra });
  const roleInfos = deriveAll([co("Roles", [opened("Sales", "2026-11-19"), opened("Sales", "2026-11-10"), opened("Marketing", "2026-11-19"), opened("Sales", "2026-11-19", { closed: "2026-11-20" })])]);
  check("roles opened since: the member's function, open now, after the visit", rolesSince(roleInfos, "Sales", at) === 1, rolesSince(roleInfos, "Sales", at));
  check("  none on a first visit or with no function", rolesSince(roleInfos, "Sales", null) === 0 && rolesSince(roleInfos, null, at) === 0);
  const now = new Date("2026-11-20T12:00:00");
  check(
    "Since Tuesday, yesterday, earlier today, or a date a week back",
    sinceWords(new Date("2026-11-17T10:00:00").toISOString(), now) === "Since Tuesday" &&
      sinceWords(new Date("2026-11-19T10:00:00").toISOString(), now) === "Since yesterday" &&
      sinceWords(new Date("2026-11-20T07:00:00").toISOString(), now) === "Since earlier today" &&
      sinceWords(new Date("2026-11-02T10:00:00").toISOString(), now) === "Since Nov 2",
    [sinceWords(new Date("2026-11-17T10:00:00").toISOString(), now), sinceWords(new Date("2026-11-02T10:00:00").toISOString(), now)],
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
