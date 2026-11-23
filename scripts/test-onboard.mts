/**
 * Checks for onboarding (app/onboard), which ends on the member's first saved view:
 *   - the title a new member starts with, and what a client card on Find your seats says;
 *   - "Which fractional usually gets hired before you?": the functions it offers, the suggested
 *     order (our data where it says enough, else the usual ones), at most 3, Not sure;
 *   - the first view: its filters and words, widening in order when it is short, never empty,
 *     "Not sure" using the suggested functions, and its saved view reopening with the same rows;
 *   - the open roles view beside it, picking up where the member left off, the goal a new member gets.
 * The pure parts run with no server. With BASE set (scripts/test-all.sh does), it also joins fresh
 * accounts and checks the server: the draft saved per step and read back in a new tab, `before`
 * stored and editable, the first view saved and reopened on the real table, and a member from
 * before (no `before`) left as they were.
 *
 *   npx tsx scripts/test-onboard.mts                       pure checks only
 *   BASE=http://localhost:4600 npx tsx scripts/test-onboard.mts
 */
import type { Cell, CompanyRec, EngagementRec, Icp, Me, View } from "../lib/tableTypes";
import { alertView, metaOf, pillPlace, realTitle, seatState, seatsAt, titlesFor } from "../app/onboard/suggest";
import { firstViewPlace } from "../app/onboard/place";
import {
  BEFORE_DEFAULTS, BEFORE_MAX, ENOUGH, FIRST_WINDOW, WIDER_WINDOW, beforeOptions, beforeOrder, firstView, firstViewLine, firstViewName, goalFor, guessLine, holdersLine, newerAnswers, openRolesCount,
  resumeStep, STEPS, toggleBefore, widenLine,
} from "../app/onboard/firstView";
import { applyFilters, deriveAll, hireOfRow, placeFilters, rowsFor, sortRows, type Row } from "../app/post/model";
import { FUNCTIONS, GROUPS, HIDDEN_COMPANY } from "../lib/tableFields";
import { invitedLine } from "../lib/notify/format";
import {
  LIKE_ALERT, LIKE_LIST_NAME, PROFILE_SCREEN, SCREENS, SETUP_STEPS, companyLabel, factsLine, idealCounts, ledgerLines, likeListAction, likeRowView, likeStep, resumeScreen, screenN, seatSource,
} from "../app/onboard/setupModel";
import { defaultSeeds } from "../app/post/find/lookalikes";
import { alertPlanProblem } from "../lib/hunt";
import { alertOf } from "../lib/mcp/alerts";
import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      got ${JSON.stringify(detail)?.slice(0, 600)}`}`);
}

const v = (x: string): Cell => ({ s: "value", v: x, ver: 0 });
const EMPTY: Cell = { s: "empty" };
const LOCKED: Cell = { s: "locked", ver: 0 };
const val = (c: Cell | undefined) => (c && c.s === "value" ? c.v : null);

/** The month `k` months before this one, as a start ("2026-09"). */
const now = new Date();
const ym = (k: number) => {
  const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

let n = 0;
const ENG_FIELDS = GROUPS.find((g) => g.entity === "engagement")!.fields.filter((f) => !f.system).map((f) => f.key);
function seat(cells: Record<string, Cell>, extra: Partial<EngagementRec> = {}): EngagementRec {
  const all: Record<string, Cell> = Object.fromEntries(ENG_FIELDS.map((k) => [k, EMPTY]));
  return { id: `e${++n}`, source: "Seat scan", verified: false, cells: { ...all, ...cells }, people: [], updatedAt: null, yours: false, ...extra } as EngagementRec;
}
/** A fractional hire in `fn` that started `k` months ago (null: no start on file). */
const hire = (fn: string, k: number | null, extra: Record<string, Cell> = {}) =>
  seat({ function: v(fn), type: v("Fractional"), status: v("Active"), role: v(`Fractional ${fn} lead`), ...(k === null ? {} : { start: v(ym(k)) }), ...extra });
/** The same with a title below Lead ("Fractional Marketing Manager"), as the server marks it (EngagementRec.belowLead). */
const junior = (fn: string, k: number | null, role: string, extra: Record<string, Cell> = {}) =>
  seat({ function: v(fn), type: v("Fractional"), status: v("Active"), role: v(role), ...(k === null ? {} : { start: v(ym(k)) }), ...extra }, { belowLead: true });
function co(name: string, seats: EngagementRec[], o: { country?: string; industry?: string; employees?: string; hidden?: boolean; score?: number } = {}): CompanyRec {
  const fns = [...new Set(seats.map((e) => val(e.cells.function)).filter((x): x is string => !!x))];
  return {
    id: `c_${name.toLowerCase().replace(/\W+/g, "")}_${++n}`,
    name: o.hidden ? HIDDEN_COMPANY : name,
    iconDomain: null,
    cells: { website: EMPTY, industry: o.industry ? v(o.industry) : EMPTY, employees: o.employees ? v(o.employees) : EMPTY, revenue: EMPTY, hq: EMPTY, linkedin: EMPTY, about: EMPTY },
    country: o.country ?? null,
    region: null,
    engagements: seats,
    people: [],
    following: false,
    facts: { known: 0, locked: 0, missing: 0 },
    updatedAt: null,
    mine: false,
    ...(o.hidden ? { hidden: true } : {}),
    friendly: { score: o.score ?? 50, tier: null, fractional: seats.length, open: 0, functions: fns, operators: 0, recent: 0, hiring: [] },
  } as unknown as CompanyRec;
}
const ME = { id: "m_test", name: "Olive Onboard", function: null, goal: null, icp: null, savedViews: [] } as unknown as Me;
const US: Icp = { industries: [], employees: [], revenue: [], countries: ["United States"] };
/** The rows a view lists, as the table lists them on opening its place: its filters, then the most recent hire first. */
function reopen(place: string, infos: ReturnType<typeof deriveAll>, who: Me): Row[] {
  const p = placeFilters(place);
  const rows = applyFilters(rowsFor(p.t ?? "companies", infos), p.f, p.v ?? "all", p.q, who, true).rows;
  return sortRows(rows, "hired", false, "", { me: who, hire: { fns: p.f.hiredFn, within: p.f.hiredWithin } });
}
const keys = (rows: Row[]) => rows.map((r) => r.key).join(",");

/* ---------- title ---------- */

check("a stored 'Member' is no title, so the field starts empty", realTitle("Member") === "" && realTitle(" Member ") === "" && realTitle(undefined) === "");
check("a real title is kept", realTitle("Fractional CRO") === "Fractional CRO");
check("Sales gets title suggestions, the first one is the placeholder", titlesFor("Sales")[0] === "Fractional VP Sales" && titlesFor("Sales").length >= 2);
check("no function, no suggestions", titlesFor(null).length === 0);

/* ---------- Find your seats: the client card ---------- */

const revops = seat({ function: v("RevOps"), operator: LOCKED });
const belFuse = co("Bel Fuse Inc.", [revops]);
const a = seatsAt(belFuse, "Sales");
check("a seat in another function is listed, never 'no seat on file'", a.others.length === 1 && !/don't have a seat/.test(a.note ?? "") && /No Sales seat on file here yet/.test(a.note ?? "") && /RevOps/.test(a.note ?? ""), a);
const hone = co("Hone", [seat({ function: v("Sales"), operator: LOCKED })]);
const h = seatsAt(hone, "Sales");
check("a Sales seat under someone else says so", /1 Sales seat on file here is under someone else/.test(h.note ?? "") && h.others.length === 1, h.note);
check("its state reads as held", seatState(h.others[0]) === "A seat holder is on file", seatState(h.others[0]));
const scan = co("Scanned", [seat({ function: v("Sales") }, { claimable: true }), seat({ function: v("RevOps") }, { claimable: true })]);
const sc = seatsAt(scan, "Sales");
check("claimable seats in their function come to claim, with no note", sc.claim.length === 1 && val(sc.claim[0].cells.function) === "Sales" && sc.note === null, sc);
check("nothing on file: the plain line", seatsAt(co("Empty", []), "Sales").note === "We don't have a seat on file there yet." && seatsAt(null, "Sales").note === "We don't have a seat on file there yet.");
check("a company card's meta counts its seats", /\b1 (past )?seat\b/.test(metaOf(co("Blueshift", [seat({ function: v("Growth"), type: v("Full-time") })]))), metaOf(co("Blueshift", [seat({ function: v("Growth"), type: v("Full-time") })])));

/* ---------- which fractional usually gets hired before you ---------- */

console.log("\nWho usually gets hired before you");
check("the owner's examples are the usual order", JSON.stringify(BEFORE_DEFAULTS.Sales) === '["Marketing","RevOps","Finance"]' && JSON.stringify(BEFORE_DEFAULTS.Marketing) === '["Sales","RevOps","Product Marketing"]' && JSON.stringify(BEFORE_DEFAULTS.Finance) === '["Sales","Operations","People"]' && JSON.stringify(BEFORE_DEFAULTS.RevOps) === '["Sales","Marketing","Customer Success"]');
check("every function offers 3 suggestions, never its own or a catch-all", FUNCTIONS.every((f) => {
  const o = beforeOrder([], f);
  return o.suggested.length === BEFORE_MAX && !o.suggested.includes(f) && !o.suggested.some((x) => x === "Other" || x === "Executive");
}), FUNCTIONS.map((f) => [f, beforeOrder([], f).suggested]));
check("with no data, the suggested ones are the usual ones", JSON.stringify(beforeOrder([], "Sales").suggested) === '["Marketing","RevOps","Finance"]' && beforeOrder([], "Sales").fromData.length === 0);
check("it offers every function but the member's own and Other (none of the above), each once, Executive last", (() => {
  const o = beforeOrder([], "Sales");
  return o.order.length === FUNCTIONS.length - 2 && new Set(o.order).size === o.order.length && !o.order.includes("Sales") && !o.order.includes("Other") && o.order.at(-1) === "Executive" && [...beforeOptions("Sales")].sort().join() === [...o.order].sort().join();
})(), beforeOrder([], "Sales").order);
check("a member in a catch-all function is offered every named function and Executive", beforeOrder([], "Other").order.length === FUNCTIONS.length - 1 && beforeOrder([], "Other").order.at(-1) === "Executive" && beforeOrder([], "Executive").order.length === FUNCTIONS.length - 2);
check("the suggested ones come first in the order", beforeOrder([], "Finance").order.slice(0, 3).join() === beforeOrder([], "Finance").suggested.join());
// Our data: at three companies a fractional Growth lead started before the fractional Sales lead.
const growthFirst = [0, 1, 2].map((k) => co(`Growth First ${k}`, [hire("Growth", 20), hire("Sales", 4)]));
const fromData = beforeOrder(deriveAll(growthFirst), "Sales");
check("our data leads where it says enough: a function that started first at 3 companies", fromData.suggested[0] === "Growth" && fromData.fromData.join() === "Growth" && fromData.suggested.slice(1).join() === "Marketing,RevOps", fromData);
const twoOnly = beforeOrder(deriveAll(growthFirst.slice(0, 2)), "Sales");
check("at 2 companies it is chance: the usual order stays", twoOnly.suggested.join() === "Marketing,RevOps,Finance" && twoOnly.fromData.length === 0, twoOnly);
check("a function found at the same companies leads the rest", twoOnly.order[3] === "Growth", twoOnly.order);
const fullTime = [0, 1, 2].map((k) => co(`Full-time First ${k}`, [hire("Partnerships", 20, { type: v("Full-time") }), hire("Sales", 4)]));
check("full-time seats don't count as hires before you", beforeOrder(deriveAll(fullTime), "Sales").fromData.length === 0);
const later = [0, 1, 2].map((k) => co(`Growth Later ${k}`, [hire("Growth", 2), hire("Sales", 9)]));
check("a function that came after doesn't count as before", beforeOrder(deriveAll(later), "Sales").fromData.length === 0);
// Leadership seats only: a Growth Coordinator who started first, or a Sales Manager the member's function would start from, says nothing.
const juniorFirst = [0, 1, 2].map((k) => co(`Junior Growth ${k}`, [junior("Growth", 20, "Fractional Growth Coordinator"), hire("Sales", 4)]));
check("a seat below Lead that started first doesn't count as before", beforeOrder(deriveAll(juniorFirst), "Sales").fromData.length === 0, beforeOrder(deriveAll(juniorFirst), "Sales").fromData);
const juniorMine = [0, 1, 2].map((k) => co(`Junior Sales ${k}`, [hire("Growth", 20), junior("Sales", 4, "Fractional Sales Manager")]));
check("nor does a function before a seat below Lead in the member's own function", beforeOrder(deriveAll(juniorMine), "Sales").fromData.length === 0, beforeOrder(deriveAll(juniorMine), "Sales").fromData);
check("up to 3: a fourth tap changes nothing", toggleBefore(["Marketing", "RevOps", "Finance"], "People").join() === "Marketing,RevOps,Finance");
check("a tap takes one off, and picks one from Not sure or nothing", toggleBefore(["Marketing", "RevOps"], "RevOps").join() === "Marketing" && toggleBefore([], "Sales").join() === "Sales" && toggleBefore(null, "Sales").join() === "Sales");

/* ---------- the first view ---------- */

console.log("\nThe first view");
// Six companies in the US that hired a fractional Marketing lead two months ago, with no fractional Sales yet.
const plenty = Array.from({ length: 6 }, (_, k) => co(`Plenty ${k}`, [hire("Marketing", 2 + (k % 3))], { country: "United States" }));
const fv1 = firstView(deriveAll(plenty), ME, { fn: "Sales", icp: US, before: ["Marketing"], suggested: ["Marketing", "RevOps", "Finance"] });
check("enough companies: no widening", fv1.widened.length === 0 && fv1.rows.length === 6 && fv1.first === 6, fv1.widened);
check("its filters: the functions picked, 12 months, no fractional Sales yet, the profile pill", fv1.f.hiredFn.join() === "Marketing" && fv1.f.hiredWithin === FIRST_WINDOW && fv1.f.notMine && fv1.f.icp && !fv1.f.industry.length && !fv1.f.country.length, fv1.f);
check(
  "its sentence, in the owner's words",
  firstViewLine(fv1, "Sales") === "6 companies in your profile hired a fractional Marketing leader in the last 12 months and have no fractional Sales yet.",
  firstViewLine(fv1, "Sales"),
);
check("one company reads as one", firstViewLine({ f: fv1.f, rows: fv1.rows.slice(0, 1) }, "Sales") === "1 company in your profile hired a fractional Marketing leader in the last 12 months and has no fractional Sales yet.");
check("no widening, no line about it", widenLine(fv1, "Sales") === null);
const place1 = new URLSearchParams(fv1.place);
check("its place: All companies with the recently hired keys, the pill and no fractional Sales yet (not the profile spelled out)", place1.get("v") === "all" && place1.get("t") === "companies" && place1.get("f") === "hiredFn:Marketing~hiredWithin:12~notMine~icp" && !place1.has("s"), fv1.place);
check("its name is short and says what it is for", fv1.name === "Likely to need Sales next", fv1.name);
check("its subtitle says what it follows in full", fv1.about === "Hired a fractional Marketing leader in the last 12 months, in my profile, no fractional Sales yet", fv1.about);
check("with no function named, a short name too", firstViewName(null) === "Recently hired a fractional" && firstViewName("Other") === "Recently hired a fractional" && firstViewName("Finance") === "Likely to need Finance next");
check("its weekly email follows hires in those functions, with the profile spelled out", JSON.stringify(fv1.criteria.hiredFn) === '["Marketing"]' && fv1.criteria.hiredWithin === 12 && fv1.criteria.country?.[0] === "United States" && !fv1.criteria.function, fv1.criteria);
const order1 = fv1.rows.map((r) => hireOfRow(r, fv1.f.hiredFn, fv1.f.hiredWithin)).map((e) => val(e?.cells.start));
check("the most recent hire first", order1.every((m, k) => k === 0 || (order1[k - 1] ?? "") >= (m ?? "")), order1);

// Short: two match, one more hired 18 months ago, two more have a fractional Sales already, one is outside the profile.
const short = [
  co("Match A", [hire("Marketing", 3)], { country: "United States" }),
  co("Match B", [hire("Marketing", 4)], { country: "United States" }),
  co("Eighteen Months", [hire("Marketing", 18)], { country: "United States" }),
  co("Has Sales A", [hire("Marketing", 3), hire("Sales", 30)], { country: "United States" }),
  co("Has Sales B", [hire("Marketing", 5), hire("Sales", 40)], { country: "United States" }),
  co("Overseas", [hire("Marketing", 2)], { country: "United Kingdom" }),
];
const shortInfos = deriveAll(short);
const fv2 = firstView(shortInfos, ME, { fn: "Sales", icp: US, before: ["Marketing"], suggested: [] });
check("short: it looks back 24 months, then adds companies with a fractional Sales, and stops at 5", fv2.widened.join() === "window,notMine" && fv2.rows.length === 5 && fv2.first === 2 && fv2.f.hiredWithin === WIDER_WINDOW && !fv2.f.notMine && fv2.f.icp, { w: fv2.widened, n: fv2.rows.length });
check("the profile stays while the view has enough without dropping it", !fv2.rows.some((r) => r.i.c.name === "Overseas"));
check("one line says what it widened", widenLine(fv2, "Sales") === "Only 2 matched at first, so we looked back 24 months and added companies with a fractional Sales already.", widenLine(fv2, "Sales"));
check("the sentence follows what it shows", firstViewLine(fv2, "Sales") === "5 companies in your profile hired a fractional Marketing leader in the last 24 months.", firstViewLine(fv2, "Sales"));
// The profile goes last: only one company in it, four outside it.
const outside = [co("In Profile", [hire("Marketing", 2)], { country: "United States" }), ...[0, 1, 2, 3].map((k) => co(`Abroad ${k}`, [hire("Marketing", 2)], { country: "Canada" }))];
const fv3 = firstView(deriveAll(outside), ME, { fn: "Sales", icp: US, before: ["Marketing"], suggested: [] });
check("a step that adds nothing is left out, and the profile goes last", fv3.widened.join() === "icp" && fv3.rows.length === 5 && fv3.f.hiredWithin === FIRST_WINDOW && fv3.f.notMine && !fv3.f.icp, { w: fv3.widened, f: fv3.f });
check("its line and sentence say so", widenLine(fv3, "Sales") === "Only 1 matched at first, so we looked past your profile." && firstViewLine(fv3, "Sales").startsWith("5 companies hired"), [widenLine(fv3, "Sales"), firstViewLine(fv3, "Sales")]);
// Never empty: the only hire is five years old, or in another function.
const old = [co("Long Ago", [hire("Marketing", 60)], { country: "United States" })];
const fv4 = firstView(deriveAll(old), ME, { fn: "Sales", icp: US, before: ["Marketing"], suggested: [] });
check("never empty: with nothing in 24 months it looks back as far as our records go", fv4.rows.length === 1 && fv4.widened.join() === "anyTime" && fv4.f.hiredWithin === 0 && fv4.f.hiredFn.join() === "Marketing", { w: fv4.widened, n: fv4.rows.length });
check("and says so", widenLine(fv4, "Sales") === "Nothing matched at first, so we looked back as far as our records go." && firstViewLine(fv4, "Sales").includes("at any time"), [widenLine(fv4, "Sales"), firstViewLine(fv4, "Sales")]);
const otherFn = [co("Finance Only", [hire("Finance", 2)], { country: "United States" })];
const fv5 = firstView(deriveAll(otherFn), ME, { fn: "Sales", icp: US, before: ["Product Marketing"], suggested: [] });
check("never empty: with no hire in those functions at all, a hire in any function", fv5.rows.length === 1 && fv5.widened.includes("anyFn") && !fv5.f.hiredFn.length && fv5.f.hiredWithin > 0, { w: fv5.widened, f: fv5.f });
check("a view of any function still follows hires (a window stays on)", new URLSearchParams(fv5.place).get("f")!.includes("hiredWithin"), fv5.place);
// Not sure: the suggested functions stand in, and it says so.
const fv6 = firstView(deriveAll(plenty), ME, { fn: "Sales", icp: US, before: [], suggested: ["Marketing", "RevOps", "Finance"] });
check("Not sure uses the suggested functions", fv6.guessed && fv6.f.hiredFn.join() === "Marketing,RevOps,Finance" && fv6.rows.length === 6, fv6.f.hiredFn);
check("and says so in one line", guessLine(fv6, "Sales") === "Not sure is fine. This starts with Marketing, RevOps and Finance, who often get hired before a fractional Sales leader.", guessLine(fv6, "Sales"));
check("a picked answer has no such line", guessLine(fv1, "Sales") === null && !fv1.guessed);
check("the sentence names the suggested functions", firstViewLine(fv6, "Sales").includes("a fractional Marketing, RevOps or Finance leader"), firstViewLine(fv6, "Sales"));
// A catch-all function has no "no fractional <fn> yet" part.
const fv7 = firstView(deriveAll(plenty), ME, { fn: "Other", icp: null, before: ["Marketing"], suggested: [] });
check("a catch-all function or no profile: no gap part, no pill", !fv7.f.notMine && !fv7.f.icp && firstViewLine(fv7, "Other") === "6 companies hired a fractional Marketing leader in the last 12 months.", firstViewLine(fv7, "Other"));
// The saved view reopens with the preview's rows, in the same order.
const who2 = { ...ME, function: "Sales", icp: US } as Me;
check("the saved view reopens with the preview's rows, in the same order", keys(reopen(fv2.place, shortInfos, who2)) === keys(fv2.rows) && fv2.rows.length === 5, [keys(reopen(fv2.place, shortInfos, who2)), keys(fv2.rows)]);
check("so does a view that kept everything", keys(reopen(fv1.place, deriveAll(plenty), who2)) === keys(fv1.rows));
// A locked company (an open Finance role) that hired a fractional Marketing lead: free facts only, so nothing in the view names it.
const locked = co("Secret Freight", [seat({ function: v("Finance"), status: v("Open role"), role: v("Fractional CFO") }, { source: "Demand scan" }), hire("Marketing", 2, { role: LOCKED, operator: LOCKED })], { country: "United States", hidden: true });
const fv8 = firstView(deriveAll([...plenty, locked]), ME, { fn: "Sales", icp: US, before: ["Marketing"], suggested: [] });
check("a locked company's hire counts (its function and start are free facts)", fv8.rows.some((r) => r.i.c.id === locked.id) && fv8.rows.length === 7, fv8.rows.length);
check("and nothing the view says or saves names it", !JSON.stringify([fv8.place, fv8.name, firstViewLine(fv8, "Sales"), fv8.criteria]).includes(HIDDEN_COMPANY));
const lockedHire = hireOfRow(fv8.rows.find((r) => r.i.c.id === locked.id)!, ["Marketing"], 12);
check("its seat holder is a lock, and so is the role that comes with them", !!lockedHire && lockedHire.cells.role?.s === "locked" && lockedHire.cells.operator?.s === "locked");
check("it counts the companies whose seat holder is on file (behind a lock): the member's potential referral partners", fv8.holders === 1 && fv1.holders === 0, [fv8.holders, fv1.holders]);
check("and says so in one line, or nothing at none", holdersLine(fv8) === "At 1 of them, the fractional who held that seat is on file, a potential referral partner." && holdersLine({ holders: 3, rows: fv1.rows }) === "At 3 of them, the fractional who held that seat is on file. Each is a potential referral partner." && holdersLine(fv1) === null && holdersLine({ holders: 2, rows: fv8.rows.slice(0, 2) })!.startsWith("At all 2"), holdersLine(fv8));

// Leadership seats only: six companies whose only Marketing seat is a Marketing Manager (its holder on file) are no "fractional Marketing leader".
const juniors = Array.from({ length: 6 }, (_, k) => co(`Junior Marketing ${k}`, [junior("Marketing", 2, "Fractional Marketing Manager", { operator: LOCKED, role: LOCKED })], { country: "United States" }));
const leaderCo = co("Marketing Leader", [hire("Marketing", 3)], { country: "United States" });
const juniorInfos = deriveAll([...juniors, leaderCo]);
const fvJ = firstView(juniorInfos, ME, { fn: "Sales", icp: US, before: ["Marketing"], suggested: [] });
check("the first view counts leadership seats only: six Marketing Manager seats add no company", fvJ.first === 1 && fvJ.rows.length === 1 && fvJ.rows[0].i.c.name === "Marketing Leader", { first: fvJ.first, n: fvJ.rows.length });
check("widening never brings them back: every step still counts leadership seats", fvJ.widened.length === 0, fvJ.widened);
check("their seat holders are not counted as referral partners", fvJ.holders === 0, fvJ.holders);
check("its sentence counts what it shows", firstViewLine(fvJ, "Sales") === "1 company in your profile hired a fractional Marketing leader in the last 12 months and has no fractional Sales yet.", firstViewLine(fvJ, "Sales"));
check("and the saved view reopens with the same row", keys(reopen(fvJ.place, juniorInfos, who2)) === keys(fvJ.rows));
// Only seats below Lead in 12 months, and a leader 18 months back: it widens past them to the leader.
const lateInfos = deriveAll([...juniors, co("Late Leader", [hire("Marketing", 18)], { country: "United States" })]);
const fvL = firstView(lateInfos, ME, { fn: "Sales", icp: US, before: ["Marketing"], suggested: [] });
check("short of leaders, it widens past seats below Lead to a leader 18 months back", fvL.first === 0 && fvL.widened.join() === "window" && fvL.rows.length === 1 && fvL.rows[0].i.c.name === "Late Leader", { first: fvL.first, w: fvL.widened, n: fvL.rows.length });
check("and says so", widenLine(fvL, "Sales") === "Nothing matched at first, so we looked back 24 months.", widenLine(fvL, "Sales"));

/* ---------- the open roles view beside it ---------- */

console.log("\nThe open roles view");
const avIcp: Icp = { industries: ["SaaS"], employees: ["11–50"], revenue: [], countries: ["United States"] };
const av = alertView("Sales", avIcp);
const place = new URLSearchParams(av.place);
check("it opens Hiring now on seats", place.get("v") === "hiring" && place.get("t") === "seats", av.place);
check("with the profile pill on and only the function as a hard filter", place.get("f") === "fn:Sales~icp", place.get("f"));
check("its criteria (the weekly email) spell the profile out", av.criteria.function === "Sales" && av.criteria.industry?.[0] === "SaaS" && av.criteria.employees?.[0] === "11–50" && av.criteria.country?.[0] === "United States", av.criteria);
check("its name names the function and the profile", /^Sales roles at SaaS companies/.test(av.name), av.name);
check("no profile: the function alone, no pill", new URLSearchParams(alertView("Marketing", null).place).get("f") === "fn:Marketing");
const oldPlace = new URLSearchParams({ v: "hiring", t: "seats", f: "industry:SaaS~employees:11–50~fn:Sales~country:United States" }).toString();
check("an old onboarding view (the profile spelled out) moves to the pill form", pillPlace(oldPlace, "Sales", avIcp) === av.place, pillPlace(oldPlace, "Sales", avIcp));
check("the pill form, another profile, or a view the member saved themselves stays as it is", pillPlace(av.place, "Sales", avIcp) === null && pillPlace(oldPlace, "Sales", { ...avIcp, employees: ["51–200"] }) === null && pillPlace(oldPlace, "Marketing", avIcp) === null && pillPlace("v=all&t=companies&f=industry:SaaS", "Sales", avIcp) === null);
const openSales = co("Hiring Sales", [seat({ function: v("Sales"), status: v("Open role"), role: v("Fractional VP Sales") }, { source: "Demand scan", opened: ym(0) + "-02", closed: null })], { country: "United States" });
check("it counts the open roles in the member's function that fit the profile", openRolesCount(deriveAll([openSales, ...plenty]), ME, "Sales", US) === 1 && openRolesCount(deriveAll([openSales]), ME, "Sales", { ...US, countries: ["Canada"] }) === 0 && openRolesCount(deriveAll([openSales]), ME, "Other", US) === 0);

/* ---------- picking up, the goal, the first place ---------- */

console.log("\nPicking up where they left off");
check("the newer copy of the answers wins: this tab's or the server's", newerAnswers({ at: "2026-11-18T10:00:00Z", step: 2 }, { at: "2026-11-18T09:00:00Z", step: 4 })?.step === 2 && newerAnswers({ at: "2026-11-18T08:00:00Z", step: 2 }, { at: "2026-11-18T09:00:00Z", step: 4 })?.step === 4);
check("with one copy, that one", newerAnswers(null, { at: "x", step: 3 })?.step === 3 && newerAnswers({ at: "2026-11-18T08:00:00Z", step: 2 }, null)?.step === 2 && newerAnswers(null, null) === null);
check("a copy with no time loses to one with a time", newerAnswers({ step: 2 }, { at: "2026-11-18T09:00:00Z", step: 4 })?.step === 4 && newerAnswers({ at: "2026-11-18T09:00:00Z", step: 2 }, { step: 4 })?.step === 2);
// Three steps now (STEPS): 1 what you do, 2 who you want to work with (the before answer and the profile), 3 the first view.
check("it opens on the step it left, inside the flow", resumeStep(3, { fn: "Sales", before: ["Marketing"] }, STEPS) === 3 && resumeStep(9, { fn: "Sales", before: [] }, STEPS) === 3 && resumeStep(0, { fn: "Sales", before: null }, STEPS) === 1);
check("never past an answer it needs: the function, then the before answer (step 2)", resumeStep(3, { fn: null, before: ["Marketing"] }, STEPS) === 1 && resumeStep(3, { fn: "Sales", before: null }, STEPS) === 2 && resumeStep(2, { fn: "Sales", before: null }, STEPS) === 2);
check("a draft from the six-step flow lands inside the three", resumeStep(5, { fn: "Sales", before: ["Marketing"] }, STEPS) === 3 && resumeStep(6, { fn: "Sales", before: [] }, STEPS) === 3 && resumeStep(4, { fn: "Sales", before: null }, STEPS) === 2);
check("the old look's onboarding (Classic.tsx, RN_UI2=off) is still three steps", STEPS === 3);
check("a new member's goal: no fractional in their function yet, or repeat hirers for a catch-all", goalFor("Sales") === "adjacent" && goalFor("Other") === "friendly" && goalFor("Executive") === "friendly" && goalFor(null) === "friendly");
const views = [{ id: "al_1", place: "v=hiring&t=seats&f=fn:Sales" }, { id: "al_2", place: fv1.place }];
check("the table opens on the first view while it is saved", firstViewPlace({ firstView: "al_2", savedViews: views }) === fv1.place);
check("not once it is gone, nor for a member from before", firstViewPlace({ firstView: "al_9", savedViews: views }) === null && firstViewPlace({ firstView: null, savedViews: views }) === null && firstViewPlace({ savedViews: views }) === null);
check("the first view's numbers stay as set", ENOUGH === 5 && FIRST_WINDOW === 12 && WIDER_WINDOW === 24 && BEFORE_MAX === 3);


/* ---------- the new look's set-up (app/onboard/Setup.tsx, setupModel.ts) ---------- */

console.log("\nThe new look's set-up");
check("the screens follow the mockup, with lookalikes right after the seats", SCREENS.join() === "welcome,ideal,seats,like,know,first,done" && screenN("like") === screenN("seats") + 1 && SETUP_STEPS === 5);
check("the profile goes in on Open your first company, so a draft never resumes past Who you know", PROFILE_SCREEN === screenN("first") && resumeScreen(6, { fn: "Sales" }) === screenN("know") && resumeScreen(7, { fn: "Sales" }) === screenN("know"));
check("it resumes on the screen it left, never past the function", resumeScreen(screenN("like"), { fn: "Sales" }) === screenN("like") && resumeScreen(screenN("like"), { fn: null }) === screenN("ideal") && resumeScreen(0, { fn: null }) === 1 && resumeScreen(2, { fn: null }) === 2);
const ME2 = { ...ME, id: "m_setup", benchRates: [], credits: 31, plan: { name: "free", hadTrial: false } } as unknown as Me;
const mySeat = (fn: string, extra: Record<string, Cell> = {}) => seat({ function: v(fn), type: v("Fractional"), status: v("Ended"), role: v(`Fractional VP ${fn}`), operator: v("Olive Onboard"), ...extra }, { yours: true });
const pastA = co("Cedar and Pine", [mySeat("Sales")], { industry: "Software", employees: "51–200" });
const pastB = co("Northwind Clinics", [mySeat("Sales")], { industry: "Software", employees: "51–200" });
const lockedLike = co("Locked Lookalike", [hire("Sales", 6)], { industry: "Software", employees: "51–200", hidden: true });
(lockedLike as { name: string }).name = "Secretname Coqa"; // as if a name had leaked onto a locked record: the step must still never print it
const openLike = co("Halcyon Freight", [hire("Sales", 8)], { industry: "Software", employees: "51–200" });
const unlike = co("Larkspur Learning", [hire("Finance", 3)], { industry: "EdTech", employees: "1–10" });
const likeInfos = deriveAll([pastA, pastB, lockedLike, openLike, unlike]);
const seeds0 = defaultSeeds(likeInfos, ME2);
const ls = likeStep(likeInfos, ME2, seeds0);
check("lookalikes: the seeds are the member's own seats' companies", seeds0.length === 2 && seeds0.includes(pastA.id) && seeds0.includes(pastB.id) && ls.seeds.map((x) => x.c.id).sort().join() === [pastA.id, pastB.id].sort().join(), seeds0);
check("lookalikes: the profile shows as chips read from the seeds", ls.chips.some((c) => c.label === "Software") && ls.chips.some((c) => /51 to 200/.test(c.label)) && ls.chips.some((c) => /hired Sales/.test(c.label)), ls.chips);
const likeIds = ls.ranked.map((r) => r.row.i.c.id);
check("lookalikes: the companies that share the traits are ranked, never a seed, never the one that shares nothing", likeIds.includes(lockedLike.id) && likeIds.includes(openLike.id) && !likeIds.includes(unlike.id) && !likeIds.includes(pastA.id) && !likeIds.includes(pastB.id), likeIds);
check("lookalikes: each row says why it matched", ls.ranked.every((r) => /^Same /.test(likeRowView(r).why)), ls.ranked.map((r) => r.why));
const lockedRow = ls.ranked.find((r) => r.row.i.c.id === lockedLike.id)!;
const lv = likeRowView(lockedRow);
check("lookalikes: a locked company is described by its industry and size, never named", lv.locked && !JSON.stringify(lv).includes("Secretname") && /software company/i.test(lv.title) && /51–200 people/.test(lv.meta), lv);
check("lookalikes: one the member can see keeps its name", likeRowView(ls.ranked.find((r) => r.row.i.c.id === openLike.id)!).title === "Halcyon Freight");
check("a locked company's label and facts never carry a name", !companyLabel(lockedRow.row.i).includes("Secretname") && !factsLine(lockedRow.row.i).includes("Secretname"));
const la = likeListAction(ls.tokens, true);
check("lookalikes save as the member's first list, named Like your past clients, with its alert on", la.type === "savedView" && la.op === "save" && la.name === LIKE_LIST_NAME && LIKE_LIST_NAME === "Like your past clients" && la.list.kind === "companies" && la.list.alert.on === true && la.email === true);
check("the list opens on the lookalike filter and follows the profile's industries and sizes", /f=[^&]*like/.test(la.place) && JSON.stringify(la.criteria.industry) === '["Software"]' && JSON.stringify(la.criteria.employees) === '["51–200"]', la);
check("its alert passes Free's gate: weekly, never as it happens", LIKE_ALERT.every === "weekly" && alertPlanProblem(alertOf({ alert: la.list.alert as never }), null, true) === null && alertPlanProblem({ every: "instant", triggers: ["role"] }, null, true) !== null);
check("turned off, it saves with no alert email", likeListAction(ls.tokens, false).list.alert.on === false && likeListAction(ls.tokens, false).email === false);
const none = likeStep(deriveAll([lockedLike, openLike, unlike]), ME2, defaultSeeds(deriveAll([lockedLike, openLike, unlike]), ME2));
check("no seats: the step is skipped with an honest line, nothing ranked, nothing to save", none.empty === "noSeats" && none.ranked.length === 0 && none.seeds.length === 0);
const bare = co("Bare Seat Co", [seat({ type: v("Fractional"), operator: v("Olive Onboard") }, { yours: true })]);
check("a seat with nothing on file to match: said so, nothing ranked", likeStep(deriveAll([bare, openLike]), ME2, [bare.id]).empty === "noTraits");
const setupSrc = ["Setup.tsx", "SetupSeats.tsx", "SetupKnow.tsx"].map((f) => readFileSync(`app/onboard/${f}`, "utf8")).join("\n");
check("the set-up seeds lookalikes with the member's seats and saves the list with likeListAction", /likeStep\(infos, me, seedIds/.test(setupSrc) && /seats\.map\(\(s\) => s\.i\.c\.id\)/.test(setupSrc) && /likeListAction\(like\.tokens, alertOn\)/.test(setupSrc));
check("the ideal client's count: what fits, inside the table's count", (() => {
  const c = idealCounts(likeInfos, ME2, { fn: "Sales", icp: { ...US, countries: [], industries: ["Software"] }, before: null, suggested: ["Marketing"] });
  return c.total === 5 && c.match === 4 && c.hiring === 0 && c.match <= c.total;
})(), idealCounts(likeInfos, ME2, { fn: "Sales", icp: { ...US, countries: [], industries: ["Software"] }, before: null, suggested: ["Marketing"] }));
check("where a seat under their name came from, in their words", seatSource({ source: "Seat scan", cells: { operator: { s: "value" } } }) === "Revenue Nomad's seat scan found it with your name." && seatSource({ source: "Member added", cells: { operator: { s: "value", mine: true } } }) === "You added it." && /published on Revenue Nomad/.test(seatSource({ source: "Published engagement", cells: {} })));
const ll = ledgerLines({ credits: 34 }, [{ delta: 1, reason: "Added a fact" }, { delta: 10, reason: "Invite bonus" }, { delta: -2, reason: "Unlocked a company" }]);
check("the credits beside every screen: started, earned, the invite bonus, spent, have", ll.start === 25 && ll.earned === 1 && ll.bonus === 10 && ll.spent === 2 && ll.have === 34, ll);

/* ---------- the server ---------- */

const BASE = (process.env.BASE || "").replace(/\/$/, "");
if (BASE) {
  console.log("\nThe server");
  const call = async (body: unknown, token?: string, ip = "10.77.0.1") => {
    const r = await fetch(`${BASE}/api/table`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "x-forwarded-for": ip, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { cookie: `rn_table=${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { r, json };
  };
  const stamp = Date.now().toString(36);
  const join = async (name: string, ip: string) => {
    const j = await call({ join: { name, email: `qa+onboard-${name.split(" ")[0].toLowerCase()}-${stamp}@example.com` } }, undefined, ip);
    return (j.r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean) ?? null;
  };
  const ipA = `10.77.${(Date.now() >> 8) & 255}.${Date.now() & 255}`;
  const token = await join("Olive Onboard", ipA);
  check("joins", !!token);
  if (token) {
    const act = (action: unknown) => call({ action }, token, ipA);
    const view = async (): Promise<View> => (await call(undefined, token, ipA)).json;
    const v0 = await view();
    check("a new member has no title, never 'Member'", v0?.me?.title === "", v0?.me?.title);
    check("a new member was never asked who comes before them, has no first view and no draft yet", v0?.me?.before === undefined && v0?.me?.firstView === null && v0?.me?.draft === null && v0?.me?.onboarded === false, { b: v0?.me?.before, f: v0?.me?.firstView, d: v0?.me?.draft });

    // A draft after each step, cleaned: what isn't on its list comes back empty.
    const junk = await act({
      type: "onboardDraft",
      draft: { step: 9, function: "Wizardry", title: "  Fractional   VP Sales ", icp: { industries: ["Nope"], countries: ["United States"] }, before: ["Marketing", "RevOps", "Finance", "People", "Marketing"], roles: false, clients: Array.from({ length: 25 }, (_, k) => `name:Client ${k}`), views: ["al_madeup"], at: "2026-01-02T03:04:05Z" },
    });
    check("a draft saves", junk.r.status === 200 && !junk.json?.error, junk.json?.error);
    const d1 = (await view())?.me?.draft;
    check(
      "it is cleaned: the step inside the flow, no function off the list, the title tidied, at most 3 before, 20 clients, no view that isn't theirs",
      d1?.step === 6 && d1?.function === null && d1?.title === "Fractional VP Sales" && d1?.icp?.industries.length === 0 && d1?.icp?.countries[0] === "United States" && d1?.before?.join() === "Marketing,RevOps,Finance" && d1?.roles === false && d1?.email === true && d1?.clients.length === 20 && d1?.views.length === 0 && d1?.at === "2026-01-02T03:04:05.000Z",
      d1,
    );
    await act({ type: "onboardDraft", draft: { step: 3, function: "Sales", title: "Fractional VP Sales", icp: US, before: null, at: new Date().toISOString() } });
    const other = await call(undefined, token, "10.77.250.250");
    const d2 = other.json?.me?.draft;
    check("a new tab or device picks up the draft where they left off", d2?.step === 3 && d2?.function === "Sales" && d2?.before === null && d2?.icp?.countries[0] === "United States" && other.json?.me?.onboarded === false, d2);
    // The new look's set-up (Setup.tsx): the seats said "Yes, this is mine" to ride in the draft, cleaned.
    await act({ type: "onboardDraft", draft: { step: 4, function: "Sales", title: "", icp: US, before: null, mine: ["e_pub_1", "e_pub_1", "<b>x</b>", ...Array.from({ length: 60 }, (_, k) => `e_${k}`)], at: new Date().toISOString() } });
    const dm = (await view())?.me?.draft;
    check("set-up: the seats confirmed ride in the draft, each once, cleaned, at most 40", dm?.step === 4 && dm?.mine?.[0] === "e_pub_1" && dm?.mine?.filter((x: string) => x === "e_pub_1").length === 1 && !dm?.mine?.some((x: string) => /</.test(x)) && dm?.mine?.length === 40, dm?.mine);
    // Lookalikes saved before onboarding ends: the first list, its alert on, weekly; as it happens refused (Free's gate, before the trial starts).
    const likeTokens = ["i:Software", "e:51–200", "f:Sales"];
    const la = likeListAction(likeTokens, true);
    // Free's gate applies only while billing is live (a test server without billing has no Free plan): checked in process above (alertPlanProblem).
    const billingLive = !!(await view())?.me?.plan;
    if (billingLive) {
      const instant = await act({ ...la, list: { ...la.list, alert: { ...la.list.alert, every: "instant" } } });
      check("set-up: a lookalikes list with an as-it-happens alert is refused before the trial (Free's gate)", instant.r.status !== 200 && /Pro/.test(instant.json?.error ?? ""), instant.json);
    } else check("set-up: billing off on this server, so Free's gate is checked in process only", true);
    const ok = await act(la);
    const sv0 = (await view())?.me?.savedViews?.find((x: { id: string }) => x.id === ok.json?.id);
    check("set-up: the lookalikes list saves as Like your past clients, its alert on, weekly", ok.r.status === 200 && sv0?.name === "Like your past clients" && sv0?.alert?.on === true && sv0?.alert?.every === "weekly" && /like/.test(sv0?.place ?? ""), sv0);
    await act({ type: "savedView", op: "delete", id: ok.json?.id });
    const big = await act({ type: "onboardDraft", draft: "not an object" });
    check("a draft that isn't one still saves as an empty one, never a server error", big.r.status === 200, big.r.status);
    await act({ type: "onboardDraft", draft: { step: 3, function: "Sales", title: "Fractional VP Sales", icp: US, before: null, at: new Date().toISOString() } });

    // "before" is checked: a list of up to 3 functions (refused answers change nothing, and don't finish onboarding).
    const four = await act({ type: "profile", function: "Sales", before: ["Marketing", "RevOps", "Finance", "People"] });
    check("more than 3 before is refused with a plain message", four.r.status !== 200 && /up to 3/.test(four.json?.error ?? ""), four.json?.error);
    const notList = await act({ type: "profile", function: "Sales", before: "Marketing" });
    check("an answer that isn't a list is refused", notList.r.status !== 200 && /from the list/.test(notList.json?.error ?? ""), notList.json?.error);
    const ghost = await act({ type: "profile", function: "Sales", firstView: "al_madeup" });
    check("a first view that isn't one of theirs is refused", ghost.r.status !== 200 && /gone already/.test(ghost.json?.error ?? ""), ghost.json?.error);
    const still = await view();
    check("refused answers left them in onboarding, with their draft", still?.me?.onboarded === false && still?.me?.draft?.step === 3 && still?.me?.before === undefined, { o: still?.me?.onboarded, d: still?.me?.draft?.step });

    // The first view on the real table, saved, then the profile that finishes onboarding.
    const infos = deriveAll(still.companies);
    const ord = beforeOrder(infos, "Sales");
    check("on the real table every function but their own and Other is offered, with 3 suggested", ord.suggested.length === 3 && ord.order.length === FUNCTIONS.length - 2, ord.suggested);
    const fv = firstView(infos, still.me!, { fn: "Sales", icp: US, before: ["Marketing", "Finance"], suggested: ord.suggested });
    check("the first view on the real table is never empty", fv.rows.length > 0, { n: fv.rows.length, w: fv.widened });
    check(
      "every hire it shows is a leadership seat, and the server marks seats below Lead with a flag only",
      fv.rows.every((r) => !hireOfRow(r, fv.f.hiredFn, fv.f.hiredWithin)?.belowLead) &&
        still.companies.every((c) => c.engagements.every((e) => e.belowLead === undefined || e.belowLead === true)),
    );
    const thin = firstView(infos, still.me!, { fn: "Sales", icp: US, before: ["Product Marketing"], suggested: ord.suggested });
    check("a thin answer widens and is still never empty", thin.rows.length > 0 && thin.widened.length > 0, { n: thin.rows.length, w: thin.widened });
    const unsure = firstView(infos, still.me!, { fn: "Sales", icp: US, before: [], suggested: ord.suggested });
    check("Not sure on the real table uses the suggested functions", unsure.guessed && unsure.f.hiredFn.join() === ord.suggested.join() && unsure.rows.length > 0, unsure.f.hiredFn);
    const sv = await act({ type: "savedView", op: "save", name: fv.name, place: fv.place, criteria: fv.criteria, email: true });
    check("the first view saves", sv.r.status === 200 && typeof sv.json?.id === "string", sv.json?.error);
    const done = await act({ type: "profile", function: "Sales", goal: goalFor("Sales"), title: "Fractional VP Sales", icp: US, before: ["Marketing", "Finance", "Marketing", "Wizardry"], firstView: sv.json?.id });
    check("the onboarding answers save", done.r.status === 200 && !done.json?.error, done.json?.error);
    check("its answer carries the member's answers, so the table opens on the first view at once", done.json?.me?.firstView === sv.json?.id && done.json?.me?.before?.join() === "Marketing,Finance" && done.json?.me?.savedViews?.some((x: { id: string }) => x.id === sv.json?.id), done.json?.me);
    const after = await view();
    check("before is stored: functions on the list, each once", JSON.stringify(after?.me?.before) === '["Marketing","Finance"]', after?.me?.before);
    check("the goal is stored, the member is onboarded, and the draft is gone", after?.me?.goal === "adjacent" && after?.me?.onboarded === true && after?.me?.draft === null, { g: after?.me?.goal, o: after?.me?.onboarded, d: after?.me?.draft });
    check("the first view is theirs, and the table opens on it", after?.me?.firstView === sv.json?.id && firstViewPlace(after!.me!) === fv.place, after?.me?.firstView);
    const saved = after?.me?.savedViews?.find((x) => x.id === sv.json?.id);
    check("the saved view keeps its place, and follows hires in the weekly email", saved?.place === fv.place && saved?.email === true && saved?.criteria?.hiredFn?.join() === "Marketing,Finance" && saved?.criteria?.hiredWithin === fv.f.hiredWithin, saved);
    const again = reopen(saved!.place!, deriveAll(after.companies), after.me!);
    check("the saved view reopens with the preview's rows, in the same order", keys(again) === keys(fv.rows), { again: again.length, preview: fv.rows.length });
    const late = await act({ type: "onboardDraft", draft: { step: 2, function: "Marketing" } });
    check("a draft after onboarding changes nothing", late.r.status === 200 && (await view())?.me?.draft === null);

    // Your profile: before is editable, and left alone by a save that doesn't name it.
    await act({ type: "profile", before: [] });
    check("Not sure is stored as an empty list", JSON.stringify((await view())?.me?.before) === "[]");
    await act({ type: "profile", before: ["RevOps"] });
    await act({ type: "profile", icp: US, title: "Fractional VP Sales", function: "Sales" });
    const kept = await view();
    check("editable later, and a profile save without it keeps it", JSON.stringify(kept?.me?.before) === '["RevOps"]' && kept?.me?.firstView === sv.json?.id, kept?.me?.before);
    await act({ type: "savedView", op: "delete", id: sv.json?.id });
    check("once the first view is removed, the table no longer opens on it", (await view())?.me?.firstView === null);

    // The invite loop: a member who joins from Olive's invite is told on onboarding's first step who invited them.
    const code = (await view())?.me?.inviteCode;
    const ipC = `10.79.${(Date.now() >> 8) & 255}.${Date.now() & 255}`;
    const jc = await call({ join: { name: "Cleo Invitee", email: `qa+onboard-cleo-${stamp}@example.com`, ref: code } }, undefined, ipC);
    const tokenC = (jc.r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean) ?? null;
    const cv = tokenC ? (await call(undefined, tokenC, ipC)).json : null;
    check(
      "a member who joins from an invite hears who invited them, and that they both get the bonus",
      cv?.me?.onboarded === false && cv?.me?.invitedBy?.first === "Olive" && cv.me.invitedBy.both === true && invitedLine(cv.me.invitedBy.first, cv.me.invitedBy.both, 10) === "Olive invited you. You both get 10 credits when you add your first fact.",
      cv?.me?.invitedBy,
    );
    check("by first name only, never an email", !!cv && !/@|Onboard/.test(JSON.stringify(cv.me?.invitedBy ?? {})));
    check("a member who joined on their own hears nothing of the kind", (await view())?.me?.invitedBy === undefined);
  }

  // A member from before the question: their answers stay as they were.
  const ipB = `10.78.${(Date.now() >> 8) & 255}.${Date.now() & 255}`;
  const tokenB = await join("Bram Before", ipB);
  if (tokenB) {
    const prof = await call({ action: { type: "profile", function: "Sales", goal: "intro", icp: { industries: ["SaaS"], employees: [], revenue: [], countries: [] } } }, tokenB, ipB);
    check("an old-style profile still saves", prof.r.status === 200 && !prof.json?.error, prof.json?.error);
    const b = (await call(undefined, tokenB, ipB)).json;
    check("a member from before keeps their goal and is never given a before answer or a first view", b?.me?.goal === "intro" && b?.me?.before === undefined && b?.me?.firstView === null && b?.me?.draft === null && b?.me?.onboarded === true, { g: b?.me?.goal, b: b?.me?.before });
    check("another member's answers never reach their view", !JSON.stringify(b).includes('"before":'), "before found");
    const alert = alertView("Sales", b?.me?.icp ?? null);
    const sv2 = await call({ action: { type: "savedView", op: "save", name: alert.name, place: alert.place, criteria: alert.criteria, email: true } }, tokenB, ipB);
    check("the open roles view saves as a saved view", sv2.r.status === 200 && !sv2.json?.error, sv2.json?.error);
    const last = (await call(undefined, tokenB, ipB)).json;
    const s2 = last?.me?.savedViews?.[0];
    check("it keeps its place, function and email", s2?.place === alert.place && s2?.criteria?.function === "Sales" && s2?.email === true, s2);
  }
}

console.log(`\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
