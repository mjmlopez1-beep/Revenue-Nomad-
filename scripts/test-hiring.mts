/**
 * Checks of Hiring now (app/post/hiring, HiringNow.dc.html, Signals / Hiring now in the new look):
 * its place in the registry, its views, what each column says for a role, the fit and its why, the
 * way in, the status, the sorts, the words under the headings, and the "role posted" list alert it
 * saves (F5), down to the weekly email's own matcher.
 *
 *   npx tsx scripts/test-hiring.mts      exits 1 on any failure
 *
 * Pure: no server, no network, no seed. Every record is made up here (member Jordan Avery;
 * companies Northwind Clinics, Cedar and Pine, Halcyon Freight, Larkspur Learning).
 *
 * Covered:
 *   - every old Hiring now address (the table listing seats on the "hiring" view) is the page hiring2;
 *     seats on any other view stay the Seats page;
 *   - views: the member's function, every function, the roles they pitched; closed in the last 30 days;
 *   - a locked company: nothing the page says names it, its rate reads "On file" (never a figure) or
 *     "No rate posted", and its way in through a fellow fractional is never a name;
 *   - fit: another function is "Not your function"; the ideal client gives Strong, Good or Possible with
 *     a short why; without an ideal client, the member's own function is Good;
 *   - way in: Warm paths' route when the company is open; a seat the member held; a fellow fractional;
 *     else "No path yet" (on a first visit, "Bring in who you know");
 *   - status: Pitched from the pipeline (Sent or later), New since the last visit and not opened here, else Seen;
 *   - chips and sorts; the heading words; the foot line;
 *   - the alert: its title and name, what it keeps, the save body (a list of open roles, alert on by
 *     email, Slack when asked), the server's cleaner and savedViewAction keep it, and the weekly email's
 *     matcher (lib/mcp/alerts.ts alertMatches) matches a role in the function and no other.
 */
import type { Cell, EngagementRec, Me, SavedViewRec } from "../lib/tableTypes";

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

const v = (x: string): Cell => ({ s: "value", v: x, ver: 0 }) as Cell;
const locked: Cell = { s: "locked", ver: 0 };
const empty: Cell = { s: "empty" };
const DAY = 86_400_000;
const NOW = Date.now();
const dayAgo = (n: number) => new Date(NOW - n * DAY).toISOString().slice(0, 10);
const isoAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

function role(id: string, fn: string, more: Partial<EngagementRec> = {}, cells: Record<string, Cell> = {}): EngagementRec {
  return {
    id,
    source: "Demand scan",
    verified: false,
    people: [],
    updatedAt: null,
    yours: false,
    opened: dayAgo(3),
    openedAt: isoAgo(3),
    closed: null,
    cells: { function: v(fn), role: v(`Fractional ${fn} Lead`), status: v("Open role"), type: v("Fractional"), rate: empty, hours: empty, posting: locked, operator: empty, ...cells },
    ...more,
  } as EngagementRec;
}
function seat(id: string, fn: string, operator: Cell, more: Partial<EngagementRec> = {}): EngagementRec {
  return { id, source: "Seat scan", verified: false, people: [], updatedAt: null, yours: false, cells: { function: v(fn), role: v(`Fractional ${fn}`), status: v("Ended"), operator }, ...more } as EngagementRec;
}
function co(id: string, name: string, engs: EngagementRec[], o: { hidden?: boolean; industry?: string; employees?: string; revenue?: string; hq?: string; hires?: number; fns?: string[] } = {}) {
  const cells: Record<string, Cell> = {};
  if (o.industry) cells.industry = v(o.industry);
  if (o.employees) cells.employees = v(o.employees);
  if (o.revenue) cells.revenue = v(o.revenue);
  if (o.hq) cells.hq = v(o.hq);
  const c = { id, name: o.hidden ? "Locked company" : name, hidden: !!o.hidden, iconDomain: null, cells, engagements: engs, people: [], friendly: { score: 50, tier: "Medium", fractional: o.hires ?? 0, open: engs.filter((e) => !e.closed && e.source === "Demand scan").length, functions: o.fns ?? [], operators: 0, recent: 0 }, following: false, updatedAt: null };
  return { c, engs, people: [], domain: null, fns: [], fnState: { hired: o.fns ?? [], hiring: [], story: [] }, latest: engs[0] ?? null, locked: [], unlockedByMe: false, teaser: [o.industry, o.revenue].filter(Boolean).join(" · "), hay: "", nameHay: "", leads: [] } as never;
}
const rowOf = (i: { engs: EngagementRec[] }, k = 0) => ({ key: i.engs[k].id, i, e: i.engs[k] }) as never;

const ICP = { industries: ["Health Care"], employees: ["51-200"], revenue: ["$5M-$20M"], countries: [] };
const me = { id: "mem_jordan", function: "Sales", icp: ICP } as unknown as Me;
const noIcp = { id: "mem_jordan", function: "Sales", icp: null } as unknown as Me;

async function main() {
  const SL = await import("../app/post/shell/slots");
  const H = await import("../app/post/hiring/hiringModel");
  const M = await import("../app/post/model");
  const A = await import("../lib/mcp/alerts");
  const HU = await import("../lib/hunt");

  /* ----- the registry ----- */
  check("every old Hiring now address (seats on the hiring view) is the page hiring2", SL.tableSlotOf("engagements", "hiring") === "hiring2");
  check("seats on any other view stay the Seats page; companies and people their pages", SL.tableSlotOf("engagements", "all") === "seats2" && SL.tableSlotOf("engagements", "repeat") === "seats2" && SL.tableSlotOf("companies", "hiring") === "companies2" && SL.tableSlotOf("people", "hiring") === "people2");

  const P = await import("../app/post/place");
  const pm = { ...me, goal: "friendly", savedViews: [], firstView: null } as unknown as Me;
  const p1 = P.parsePlace(pm, "?v=hiring", new Set(), undefined, { ui2: true });
  const p0 = P.parsePlace(pm, "?v=hiring", new Set(), undefined, { ui2: false });
  check("Slack's ?v=hiring opens Hiring now's own page in the new look (the open roles), and the old look as before", p1.t === "engagements" && p1.v === "hiring" && p0.v === "hiring" && SL.tableSlotOf(p1.t, p1.v) === "hiring2", { p1: [p1.t, p1.v], p0: [p0.t, p0.v] });
  const p2 = P.parsePlace(pm, "?v=hiring&t=companies", new Set(), undefined, { ui2: true });
  check("an address that names its list keeps it (Companies hiring)", p2.t === "companies" && p2.v === "hiring");
  check("the rail's Hiring now address keeps every function apart (af=1)", P.parsePlace(pm, "?v=hiring&t=seats&af=1", new Set(), undefined, { ui2: true }).all === true);

  /* ----- made-up companies ----- */
  const northwind = co("c_nw", "Northwind Clinics", [role("e_nw_sales", "Sales", {}, { rate: v("$9,500 a month"), hours: v("15"), posting: v("https://northwind.example/jobs/1") })], { industry: "Health Care", employees: "51-200", revenue: "$5M-$20M", hq: "Ohio", hires: 2, fns: ["Marketing", "Finance"] });
  const cedar = co("c_cp", "Cedar and Pine", [role("e_cp_sales", "Sales", {}, { rate: locked, hours: locked }), seat("e_cp_old", "Marketing", v("Rita Okafor"))], { industry: "Health Care", employees: "51-200", hq: "Texas" });
  const halcyon = co("c_hf", "Halcyon Freight", [role("e_hf_revops", "RevOps", { opened: dayAgo(20), openedAt: isoAgo(20) }, { rate: locked }), seat("e_hf_old", "Sales", v("Casey Morgan"))], { hidden: true, industry: "Freight & Trucking", employees: "201-500", revenue: "$20M-$50M", hq: "US Central", hires: 1, fns: ["Sales"] });
  const larkspur = co("c_ll", "Larkspur Learning", [role("e_ll_sales", "Sales", { unseen: true }), role("e_ll_old", "Sales", { opened: dayAgo(40), openedAt: isoAgo(40), closed: dayAgo(5), closedAt: isoAgo(5) })], { industry: "EdTech", employees: "11-50", revenue: "$1M-$5M" });
  const rNw = rowOf(northwind);
  const rCp = rowOf(cedar);
  const rHf = rowOf(halcyon);
  const rLl = rowOf(larkspur);
  const rLlClosed = rowOf(larkspur, 1);
  const all = [rNw, rCp, rHf, rLl, rLlClosed];
  const open = all.filter((r: { e: EngagementRec }) => M.isOpenRole(r.e));

  /* ----- views ----- */
  check("open roles: the closed one is not among them", open.length === 4);
  const mine = H.inView(open, "mine", "Sales", () => false);
  check("the member's function: only Sales roles", mine.length === 3 && mine.every((r: { e: EngagementRec }) => H.fnOf(r.e) === "Sales"));
  check("every function: all four", H.inView(open, "all", "Sales", () => false).length === 4);
  check("no function on file: every function", H.inView(open, "mine", null, () => false).length === 4);
  const pipe = new Map([["c_cp", { stage: "sent", sent: dayAgo(2) }], ["c_nw", { stage: "reach", sent: null }]]);
  check("pitched: the companies written to (Sent or later), not a target", JSON.stringify(H.inView(open, "pitched", "Sales", (r) => !!H.pitchedAt(r, pipe)).map((r: { key: string }) => r.key)) === JSON.stringify(["e_cp_sales"]));
  const closed = H.closedLately(all, NOW);
  check("closed in the last 30 days: the role that came down 5 days ago, and no open one", closed.length === 1 && (closed[0] as { key: string }).key === "e_ll_old");
  check("a role closed 40 days ago is not closed lately", H.closedLately(all, NOW + 40 * DAY).length === 0);

  /* ----- a locked company says nothing that names it ----- */
  const words = [H.wayOf(rHf, null).text, H.wayOf(rHf, null).sub, H.fitOf(rHf, me).why, H.pastHires(halcyon), H.sizeHq(halcyon).size, H.sizeHq(halcyon).hq, H.hoursOf(rHf).text, H.hoursOf(rHf).sub].join(" | ");
  check("a locked company: no word names it or who held its seat", !/Halcyon|Casey|Morgan/.test(words), words);
  check("a locked company's way in through a fellow fractional: never a name", H.wayOf(rHf, null).text === "Through a fractional" && H.wayOf(rHf, null).sub === "Name shows when open");
  check("Warm paths' route is not shown on a locked company", H.wayOf(rHf, new Map([["c_hf", { via: "Through Casey Morgan", best: 30, locked: true }]])).text === "Through a fractional");

  /* ----- rate and hours ----- */
  check("a posting with no rate: No rate posted, never a guess", H.rateOf(rLl) === "none");
  check("a rate at a locked company: on file, with the company", H.rateOf(rHf) === "with");
  check("a rate at an open company, still locked: one purchase (the posting, its rate and hours)", H.rateOf(rCp) === "buy" && M.bundleLead(rCp.e) === "posting");
  check("a rate the member sees", H.rateOf(rNw) === "value");
  check("hours: posted, on file, not posted", H.hoursOf(rNw).text === "15" && H.hoursOf(rNw).sub === "a week" && H.hoursOf(rCp).text === "On file" && H.hoursOf(rLl).text === "Not posted");

  /* ----- listed ----- */
  const l1 = H.listedOf(rNw.e, NOW);
  check("listed: the day, how long ago, new this week", l1.ago === "3 days ago" && l1.fresh && /^[A-Z][a-z]{2} \d{1,2}$/.test(l1.day), l1);
  check("a role the last clean scan did not list: May be closed, and not new", H.listedOf(rLl.e, NOW).ago === "May be closed" && !H.listedOf(rLl.e, NOW).fresh);
  check("a role first seen 20 days ago is not new this week", !H.listedOf(rHf.e, NOW).fresh);
  check("a closed role says when it closed", H.listedOf(rLlClosed.e, NOW).day.startsWith("Closed "));

  /* ----- fit ----- */
  const fHf = H.fitOf(rHf, me);
  check("another function: Not your function, and why", fHf.tier === 0 && fHf.label === "Not your function" && fHf.why === "RevOps, not Sales", fHf);
  const fNw = H.fitOf(rNw, me);
  check("the ideal client matched, with past fractional hires: Strong", fNw.tier === 3 && fNw.label === "Strong" && fNw.why.includes("Health Care"), fNw);
  const fCp = H.fitOf(rCp, me);
  check("part of the ideal client not on file, no past hires: Possible, saying what is missing", fCp.tier === 1 && /not on file/.test(fCp.why), fCp);
  const fLl = H.fitOf(rLl, me);
  check("a known part that conflicts: Possible, saying which", fLl.tier === 1 && fLl.why === "EdTech, outside your industries", fLl);
  const nwNoHire = co("c_nw2", "Northwind Clinics", [role("e_nw2", "Sales")], { industry: "Health Care", employees: "51-200", revenue: "$5M-$20M" });
  check("the ideal client matched, no past hires: Good", H.fitOf(rowOf(nwNoHire), me).tier === 2);
  check("no ideal client: the member's own function is Good", H.fitOf(rCp, noIcp).tier === 2 && H.fitOf(rCp, noIcp).why === "Sales, your function");
  check("the fit is words, never a number or percent", ![fNw, fCp, fLl, fHf].some((f) => /\d+%|score/i.test(f.label)));

  /* ----- the way in ----- */
  check("an open company where a fellow fractional held a seat: their name, free", H.wayOf(rCp, null).text === "Through Rita Okafor" && H.wayOf(rCp, null).has);
  check("Warm paths' route, with its estimated success", H.wayOf(rCp, new Map([["c_cp", { via: "Through Casey Morgan, then Rita Vance", best: 35, locked: false }]])).sub === "Estimated success 35%");
  const own = co("c_own", "Larkspur Learning", [role("e_own_role", "Sales"), seat("e_own_seat", "Sales", v("Jordan Avery"), { yours: true })]);
  check("a seat the member held there", H.wayOf(rowOf(own), null).text === "You held a seat here");
  check("no path: says so, and on a first visit the next step", H.wayOf(rNw, null).text === "No path yet" && H.wayOf(rNw, null, true).sub === "Bring in who you know" && !H.wayOf(rNw, null).has);
  const keptOut = co("c_ko", "Cedar and Pine", [role("e_ko_role", "Sales"), seat("e_ko_seat", "Sales", locked)]);
  check("a holder who keeps out of the directory: a fractional, 1 credit shows who", H.wayOf(rowOf(keptOut), null).text === "Through a fractional" && /1 credit/.test(H.wayOf(rowOf(keptOut), null).sub));

  /* ----- status ----- */
  const ctx0 = { since: null, seen: new Set<string>(), pipe: new Map() };
  check("a first visit: every role is New", open.every((r) => H.statusOf(r, ctx0).k === "new"));
  check("the status says New to you, never a bare New beside \"0 new this week\" (two different counts)", open.every((r) => H.statusOf(r, ctx0).label === "New to you") && /\} new to you`/.test((await import("node:fs")).readFileSync(new URL("../app/post/hiring/hiringModel.ts", import.meta.url), "utf8")));
  check("a role opened here reads Seen", H.statusOf(rNw, { ...ctx0, seen: new Set(["e_nw_sales"]) }).label === "Seen");
  const since = isoAgo(10);
  check("since the last visit: a role first seen after it is New, one before it Seen", H.statusOf(rNw, { ...ctx0, since }).k === "new" && H.statusOf(rHf, { ...ctx0, since }).k === "seen");
  check("written to (pipeline Sent): Pitched, with the day", H.statusOf(rCp, { ...ctx0, pipe }).label === "Pitched" && H.statusOf(rCp, { ...ctx0, pipe }).sub !== "");
  check("a target in the pipeline: not pitched, says In pipeline", H.statusOf(rNw, { ...ctx0, pipe }).k === "new" && H.statusOf(rNw, { ...ctx0, pipe }).sub === "In pipeline");

  /* ----- chips and sorts ----- */
  const x = { ways: null, me };
  check("chip New this week", H.chipTest("fresh", rNw, x) && !H.chipTest("fresh", rHf, x) && !H.chipTest("fresh", rLl, x));
  check("chip Rate posted: a rate on file counts, locked or not", H.chipTest("rate", rNw, x) && H.chipTest("rate", rHf, x) && !H.chipTest("rate", rLl, x));
  check("chip I have a way in", H.chipTest("path", rCp, x) && !H.chipTest("path", rNw, x));
  check("chip My ideal client: confirmed matches only", H.chipTest("icp", rNw, x) && !H.chipTest("icp", rCp, x));
  check("sorts: the six of the mockup, Newest first by default", H.HIRE_SORTS.length === 6 && H.hireSortOf(null) === "newest" && H.hireSortOf("best") === "best" && H.hireSortOf("start") === "newest");
  const newest = H.sortRoles(open, "newest", me).map((r: { key: string }) => r.key);
  check("Newest first: by the day listed", newest[newest.length - 1] === "e_hf_revops", newest);
  const best = H.sortRoles(open, "best", me).map((r: { key: string }) => r.key);
  check("Best fit first: Strong leads, another function last", best[0] === "e_nw_sales" && best[best.length - 1] === "e_hf_revops", best);

  /* ----- columns ----- */
  const cols = H.hiringColumns({ me, ways: null, status: ctx0, first: false });
  check("twelve columns, nine before the member adds one, in the mockup's order", cols.length === 12 && JSON.stringify(cols.filter((c) => H.HIRING_DEFAULT_COLS.includes(c.id)).map((c) => c.label)) === JSON.stringify(["Role", "Function", "Company", "Listed", "Rate", "Hours", "Fit to you", "Your way in", "Status"]));
  check("the three to add: Closest evidence, Size and HQ, Past fractional hires", JSON.stringify(cols.filter((c) => !H.HIRING_DEFAULT_COLS.includes(c.id)).map((c) => c.label)) === JSON.stringify(["Closest evidence", "Size and HQ", "Past fractional hires"]));
  const w = (id: string) => cols.find((c) => c.id === id)!.words!(open);
  check("heading words in each column's terms", w("role") === "4 roles" && w("fn") === "2 functions" && w("company") === "75% open" && w("listed") === "2 this week" && w("rate") === "75% posted a rate" && w("status") === "4 new to you", cols.map((c) => c.words?.(open)));
  check("Closest evidence: none matched before the member's cases come in", w("evidence") === "0% matched");
  const CL = await import("../app/post/workbench/closest.ts");
  CL.putClosest([open[0].i.c.id], { [open[0].i.c.id]: { label: "Close", same: ["Same size"], diff: [], caseId: "ev1", title: "Sales off the founder's desk" } });
  check("…and the share of rows whose company has a close case once they do", w("evidence") === `${Math.round((100 * open.filter((r) => r.i.c.id === open[0].i.c.id).length) / open.length)}% matched`, w("evidence"));
  check("…it is Close's column (the plan's pill off Close)", cols.find((c) => c.id === "evidence")!.plan === "close");
  CL.clearClosest();

  /* ----- the alert (F5) ----- */
  const f0 = { ...M.EMPTY_FILTERS };
  check("the alert's title, from the view", H.alertTitle("mine", "Sales", f0) === "Tell me when a Sales role is posted" && H.alertTitle("all", "Sales", f0) === "Tell me when any role is posted");
  check("the list's name, from the view", H.alertName("mine", "Sales", f0) === "Sales roles for me" && H.alertName("all", "Sales", f0) === "All open roles" && H.alertName("all", "Sales", { ...f0, fn: ["Finance"] }) === "Finance roles");
  check("what it keeps", JSON.stringify(H.alertKeeps("mine", "Sales", { ...f0, industry: ["Health Care"], icp: true })) === JSON.stringify(["Function: Sales", "Industry: Health Care", "Your ideal client"]));
  const body = H.alertSaveBody({ view: "mine", myFn: "Sales", f: f0, icp: ICP as never, sort: "newest", name: "Sales roles for me", slack: false });
  check("the save: a list of open roles, alert on by weekly email, Slack off", body.type === "savedView" && body.op === "save" && body.list.kind === "roles" && body.list.alert.on && body.list.alert.email && !body.list.alert.slack && body.email === true);
  check("its place is Hiring now (every old address opens it), with the sort", /(^|&)v=hiring(&|$)/.test(body.place) && /t=seats/.test(body.place) && /s=newest/.test(body.place) && !/af=1/.test(body.place));
  check("every function: the place says so (af=1)", /af=1/.test(H.alertSaveBody({ view: "all", myFn: "Sales", f: f0, icp: null, sort: null, name: "All open roles", slack: true }).place));
  check("its criteria: the member's function", body.criteria.function === "Sales");
  const withIcp = H.alertSaveBody({ view: "mine", myFn: "Sales", f: { ...f0, icp: true }, icp: ICP as never, sort: null, name: "x", slack: true });
  check("the ideal client is written out, so the list keeps what it showed", JSON.stringify(withIcp.criteria.industry) === JSON.stringify(["Health Care"]) && withIcp.list.alert.slack === true);
  const clean = A.cleanListFields(body.list);
  check("the server's cleaner keeps the list's kind and alert", clean.kind === "roles" && !!clean.alert?.on && clean.alert.email && !clean.alert.slack);
  const saved = HU.savedViewAction([], { op: "save", name: body.name, place: body.place, criteria: body.criteria, email: body.email, list: body.list }, () => "al_test1", new Date(NOW).toISOString());
  const s0 = saved.list[0];
  check("savedViewAction stores it as a list of roles with its alert on", saved.list.length === 1 && s0.kind === "roles" && !!s0.alert?.on && s0.email === true, s0);
  const facts = (fn: string) => ({ function: fn, industry: "Health Care", employees: "51-200", revenue: "$5M-$20M", hq: "Ohio", pastHires: 0 });
  check("the weekly email's matcher: a Sales role matches, a Marketing role does not", A.alertMatches(s0, facts("Sales")) && !A.alertMatches(s0, facts("Marketing")));
  const off = HU.savedViewAction(saved.list, { op: "alert", id: s0.id, list: { alert: { on: false } } }, () => "x", new Date(NOW).toISOString());
  check("turning the alert off keeps the list and stops the weekly email", off.list.length === 1 && !off.list[0].alert?.on && off.list[0].email === false);
  const views: SavedViewRec[] = [
    { id: "a", name: "Sales roles for me", place: body.place, criteria: {}, email: true, createdAt: "" } as SavedViewRec,
    { id: "b", name: "Fintech roles", place: "v=hiring&t=seats&f=-", criteria: {}, email: true, createdAt: "" } as SavedViewRec,
    { id: "c", name: "Repeat hirers", place: "v=repeat&t=companies&f=-", criteria: {}, email: true, createdAt: "" } as SavedViewRec,
    { id: "d", name: "From my agent", place: null, criteria: {}, email: true, createdAt: "", kind: "roles" } as SavedViewRec,
  ];
  check("the other saved lists of roles: Hiring now places and role lists, not this one, not companies", JSON.stringify(H.roleLists(views, body.place).map((x) => x.id)) === JSON.stringify(["b", "d"]));

  /* ----- the bulk bar's Unlock on open roles ----- */
  const SB = await import("../app/post/workbench/pickItems");
  const u = SB.unlockItems("engagements", [rNw, rCp, rHf]);
  check("bulk unlock on open roles: the posting of an open company's role (one purchase), nothing waits on a locked one", JSON.stringify(u.items) === JSON.stringify([{ entity: "engagement", id: "e_cp_sales", field: "posting" }]) && u.wait === 0, u);
  check("bulk open: the locked company, once", JSON.stringify(SB.companyItems("engagements", [rHf, rHf])) === JSON.stringify([{ entity: "company", id: "c_hf", field: "identity" }]));

  /* ----- the foot ----- */
  check("the foot on the member's function: the rest, and passing one on", H.footWords({ view: "mine", shown: 3, total: 4, mine: 3, myFn: "Sales", filtered: false, pitched: 0 }).text.startsWith("1 more open role in other functions") );
  check("the foot with nothing matching the filters: Clear filters", H.footWords({ view: "all", shown: 0, total: 4, mine: 3, myFn: "Sales", filtered: true, pitched: 0 }).go?.to === "clear");
  check("plain words: no exclamation marks in what the page says", ![H.footWords({ view: "pitched", shown: 0, total: 4, mine: 3, myFn: "Sales", filtered: false, pitched: 0 }).text, H.alertTitle("mine", "Sales", f0), fCp.why, fLl.why].some((s) => s.includes("!")));

  const { readFileSync } = await import("node:fs");
  /* ----- one number set: Hiring now's views, the sidebar and the first screen count the same roles (model.ts hireCounts) ----- */
  {
    const infos = [northwind, cedar, halcyon, larkspur];
    const rowsE = M.rowsFor("engagements", infos as never);
    const fIcp = { ...M.EMPTY_FILTERS, icp: true };
    const fOff = { ...M.EMPTY_FILTERS, icp: false };
    // Sales: two of its open roles are at companies in the ideal client (Health Care, 51-200).
    const hs = M.hireCounts(rowsE, fIcp as never, me);
    check("counts: Sales with the ideal client on lists its 2 roles there, not lifted", hs.icpOn && hs.mine.length === 2 && !hs.lifted && hs.listedMine.length === 2, { mine: hs.mine.length, lifted: hs.lifted });
    check("counts: the member's function is a part of every function, and both of everyone", hs.mine.every((r) => hs.all.includes(r)) && hs.all.every((r) => hs.everyone.all.includes(r)) && hs.everyone.mine.length === 3 && hs.everyone.all.length === 4);
    check("counts: what fits the ideal client is the same whether its filter is on or off", M.hireCounts(rowsE, fOff as never, me).fit.all.length === hs.all.length && M.hireCounts(rowsE, fOff as never, me).everyone.all.length === hs.everyone.all.length);
    // RevOps: its only open role is outside the ideal client, so its view lists it with the ideal client lifted, and says so.
    const rev = { ...me, function: "RevOps" } as unknown as Me;
    const hr = M.hireCounts(rowsE, fIcp as never, rev);
    check("counts: none of the function fits, so its view is lifted and lists every role of it", hr.lifted && hr.mine.length === 0 && hr.listedMine.length === 1 && H.listedCount(hr) === 1);
    check("…and every function stays the ideal client's 2 roles, said as such", hr.all.length === 2 && H.rolesWords(hr.all.length, { view: "all", myFn: "RevOps", icpOn: hr.icpOn, lifted: false }) === "2 open roles in your ideal client");
    check("…the lifted count says it is outside the ideal client, so 1 RevOps role beside 2 in all never reads as a contradiction", H.rolesWords(hr.listedMine.length, { view: "mine", myFn: "RevOps", icpOn: hr.icpOn, lifted: hr.lifted }) === "1 open RevOps role, none in your ideal client");
    const P2 = await import("../app/post/place");
    const place = (m: Me) => ({ t: "engagements" as const, v: "hiring" as const, s: null, f: fIcp as never, q: "", c: null, p: null, all: false, sig: null, home: false });
    const side = (m: Me) => P2.placeRows(infos as never, m, place(m) as never, new Set()).length;
    check("the sidebar's Hiring now count is the page's own view count (Sales)", side(me) === H.listedCount(hs), { side: side(me), page: H.listedCount(hs) });
    check("the sidebar's Hiring now count is the page's own view count (RevOps, lifted)", side(rev) === H.listedCount(hr), { side: side(rev), page: H.listedCount(hr) });
    const first = P2.listAt(infos as never, { ...rev, benchRates: [], savedViews: [] } as unknown as Me, place(rev) as never, new Set()).first;
    check("the first screen counts the same list (lifted)", first.n === H.listedCount(hr), first.n);
    const src = readFileSync(new URL("../app/post/hiring/HiringNow.tsx", import.meta.url), "utf8");
    check("the page reads its counts from hireCounts, and its status says what it counts", /hireCounts\(all, t\.filters, me\)/.test(src) && /of \$\{words\(base\.length\)\}/.test(src) && !/roles · \$\{n\(rows\.filter/.test(src));
    check("the foot says when the other functions' count is the ideal client's", H.footWords({ view: "mine", shown: 1, total: 2, mine: 0, myFn: "RevOps", filtered: false, pitched: 0, icpOn: true }).text.startsWith("2 more open roles in other functions in your ideal client"));
  }

  /* ----- Evidence Bank is Close only (BUILD_PLAN part 8) ----- */
  const drawer = readFileSync(new URL("../app/post/hiring/RoleDrawer.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/post/hiring/HiringNow.tsx", import.meta.url), "utf8");
  check("the drawer's Closest case study shows only on Close", /\{close && <ClosestCase companyId=\{c\.id\} \/>\}/.test(drawer) && /aria-label="Closest case study"/.test(drawer) && !/Part of the Close plan/.test(drawer) && !/Evidence Bank is coming/.test(drawer));
  check("…it reads the member's own closest case, with why, and goes to Evidence Bank (no placeholder)", /useClosest\(\[companyId\], true\)/.test(drawer) && /It goes into your note and the Proof part of a proposal\./.test(drawer) && /openPage\("evidence"\)/.test(drawer));
  check("the column asks only on Close, and only while it shows", /useClosest\(close && extras\.includes\("evidence"\)/.test(page) && /if \(!close\) return <span className="wb-pill-gate">Close<\/span>;/.test(page));
  check("the Closest evidence column is added only on Close (else the plans)", /if \(id === "evidence" && !close\) return openPlans\("proposals"\);/.test(page));
  check("no export anywhere on the page or the drawer", ![drawer, page].some((x) => />[^<]*\b(Export|Download)\b/.test(x)));

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.log(`FAIL threw: ${e instanceof Error ? e.stack : e}`);
  process.exit(1);
});
