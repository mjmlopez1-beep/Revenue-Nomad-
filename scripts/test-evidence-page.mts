/**
 * Checks of the Evidence Bank page (app/post/evidence, Evidence.dc.html): who sees it, the client
 * hidden by default, the first visit (step 6: a case built from a seat in three questions), the
 * Example rows, filters, sorts and match words, the draft on seat add and Your seats' column, the
 * thin client's reading of the route's answers, and no export anywhere.
 *
 *   npx tsx scripts/test-evidence-page.mts      exits 1 on any failure
 *
 * In process: no server, no seed. The route (app/api/evidence) is Builder A's; here `fetch` is a
 * stub that answers as it will. Every record is made up (member Jordan Avery; companies Northwind
 * Clinics, Cedar and Pine, Halcyon Freight, Larkspur Learning).
 *
 * Covered:
 *   - Close only: Free and Pro get the upgrade screen (what Evidence Bank does, See the Close plan),
 *     the trial and Close get the library; no plan (billing off) is open. The registry mounts it.
 *   - client hidden by default: every row and the case view say "Client hidden" and what a reader
 *     sees; Show reveals the member's own client on this screen only; a locked company never names;
 *     how it reads in a Proof part names the client only once the member named it;
 *   - first visit: no ready case is a first visit; each seat without a case is a draft row with the
 *     industry, size and dates from the seat; two Example rows that are never counted, selected,
 *     matched or sent; the builder asks the three questions, says what is on file and privacy;
 *     why they hired seeds question 1; a case is ready once the problem and what you did are written;
 *     numbers only as typed;
 *   - filters, sorts, match words (never a percentage), the fill line and the status line;
 *   - Your seats: "Finish its evidence case" per seat for Close, "On the Close plan" without it, the
 *     placeholder is gone; the draft on seat add asks once per new seat and never without Close;
 *   - the thin client: { cases } or a list, { case } or the case, errors in words; nothing spends;
 *   - plain words: no export, CSV or download; no volt (nothing earns); Merlin, never the AI's maker.
 */
import * as ReactNS from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import Module, { register } from "node:module";
import { join, resolve } from "node:path";

// The pages import their stylesheets: in this process a stylesheet is nothing.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);
(globalThis as { React?: unknown }).React = ReactNS;
const ROOT = resolve(import.meta.dirname, "..");
const src = (f: string) => readFileSync(join(ROOT, f), "utf8");

let failures = 0;
let passes = 0;
const check = (name: string, ok: unknown, detail?: unknown) => {
  if (ok) {
    passes++;
    console.log(`PASS ${name}`);
  } else {
    failures++;
    console.log(`FAIL ${name}${detail === undefined ? "" : `: ${(typeof detail === "string" ? detail : JSON.stringify(detail))?.slice(0, 500)}`}`);
  }
};

/* ---------- a stub of the route ---------- */
type Call = { url: string; body: Record<string, unknown> | null };
const calls: Call[] = [];
let answer: (c: Call) => { status?: number; json: unknown } = () => ({ json: {} });
(globalThis as { fetch?: unknown }).fetch = async (url: string, init?: { body?: string }) => {
  const c = { url: String(url), body: init?.body ? JSON.parse(init.body) : null };
  calls.push(c);
  const a = answer(c);
  return { ok: (a.status ?? 200) < 400, status: a.status ?? 200, json: async () => a.json } as unknown as Response;
};

const NOW = "2026-11-20T10:00:00.000Z";
function kase(id: string, more: Record<string, unknown> = {}) {
  return {
    id,
    status: "ready",
    seatId: undefined,
    clientNamed: false,
    clientLabel: "A health care company, $20M to $50M",
    title: "One sales process and a forecast that holds",
    size: "201–500",
    revenue: "$20M–$50M",
    motion: "Inside sales",
    industry: "Health Care",
    soldTo: "Clinic groups",
    problems: ["No shared sales process", "The forecast kept missing"],
    workType: ["Sales process design", "Forecast methodology", "Sales playbook"],
    outcomes: [
      { k: "Win rate", before: "22%", after: "31%" },
      { k: "Sales cycle", before: "94 days", after: "61 days" },
    ],
    workedWith: [{ title: "CEO" }],
    text: "Set one sales process and a weekly forecast, and wrote the first playbook.",
    showOnCard: false,
    usedIn: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...more,
  } as import("../app/post/evidence/types").EvidenceCase;
}

async function main() {
  const M = await import("../app/post/evidence/evidenceModel");
  const T = await import("../app/post/evidence/types");
  const api = await import("../app/post/evidence/api");
  const { seatLiteOf } = await import("../app/post/evidence/seatLite");

  /* ----- Close only ----- */
  check("Close only: Free and Pro see the upgrade screen", !M.evidenceOpen({ canClose: false }));
  check("Close only: the trial and Close see the library", M.evidenceOpen({ canClose: true }));
  check("Close only: with billing off (no plan) nothing is gated", M.evidenceOpen(null) && M.evidenceOpen(undefined));
  const U = await import("../app/post/evidence/Upgrade");
  const up = renderToStaticMarkup(h(U.EvidenceUpgrade, { tier: "pro" }));
  check("the upgrade screen says what Evidence Bank does and offers the Close plan", up.includes("Evidence Bank is part of Close") && up.includes("See the Close plan") && up.includes("Private by default") && up.includes("Built from your seats") && up.includes("You are on Pro"), up);
  check("the upgrade screen shows no case and no client", !/Northwind|Client hidden|Your case library/.test(up));
  const ev = src("app/post/evidence/Evidence.tsx");
  check("the page draws the upgrade screen, and nothing else, without Close", /if \(!open\)\s*return \(\s*<>\s*\{header\}\s*<EvidenceUpgrade/.test(ev) && ev.indexOf("evidenceOpen(c.me.plan)") > 0 && ev.indexOf("<Bank />") > ev.indexOf("<EvidenceUpgrade"));
  const pages = src("app/post/shell/pages.tsx");
  check("the registry mounts Evidence Bank (the placeholder is gone)", /evidence: \{ title: "Evidence Bank", component: EvidenceP, ownHeader: true, ownStrip: true/.test(pages) && !pages.includes("EvidenceSoon") && pages.includes('import("../evidence/Evidence")') && /loadContracts, loadEvidence[,\]]/.test(pages));

  /* ----- seats as the page reads them ----- */
  const v = (x: string) => ({ s: "value", v: x, ver: 0 }) as never;
  const seatInfo = (id: string, coId: string, name: string, cells: Record<string, string>, co: Record<string, string>, hidden = false) =>
    ({
      i: { c: { id: coId, name, hidden, cells: Object.fromEntries(Object.entries(co).map(([k, x]) => [k, v(x)])), engagements: [] }, engs: [], people: [], domain: null },
      e: { id, source: "Member", verified: true, cells: Object.fromEntries(Object.entries(cells).map(([k, x]) => [k, v(x)])), people: [], updatedAt: null, yours: true },
      missing: [],
      coMissing: [],
    }) as never;
  const nw = seatLiteOf(seatInfo("e_nw", "c_nw", "Northwind Clinics", { role: "Fractional VP Sales", start: "2024-02", end: "2024-12", hours: "12", reason: "Build the first sales motion" }, { industry: "Health Care", employees: "201–500", revenue: "$20M–$50M" }));
  const hf = seatLiteOf(seatInfo("e_hf", "c_hf", "Halcyon Freight", { function: "Sales", start: "2025-03" }, { industry: "Logistics", employees: "201–500" }));
  const lk = seatLiteOf(seatInfo("e_lk", "c_lk", "Larkspur Learning", { role: "Fractional CRO" }, { industry: "Education" }, true));
  check("a seat brings its size, industry, revenue, dates, hours and why they hired", nw.industry === "Health Care" && nw.size === "201–500" && nw.revenue === "$20M–$50M" && nw.dates === "Feb to Dec 2024" && nw.hours === "12 hours a week" && nw.why === "Build the first sales motion" && nw.role === "Fractional VP Sales", nw);
  check("a seat with only a function reads as Fractional <function>, still going", hf.role === "Fractional Sales" && hf.dates === "Since Mar 2025", hf);
  check("a seat at a company locked for the member carries no name", lk.hidden && lk.company === "", lk);

  /* ----- first visit ----- */
  check("first visit: no case at all", M.isFirstVisit([]));
  check("first visit: drafts only", M.isFirstVisit([kase("d1", { status: "draft" })]));
  check("not a first visit once a case is ready", !M.isFirstVisit([kase("r1")]));
  const firstRows = M.rowsOf([], [nw, hf], true);
  check("first visit: a draft row for each seat with no case, then two Example rows", firstRows.map((r) => r.kind).join(",") === "seat,seat,example,example", firstRows.map((r) => r.kind));
  check("a seat's draft reads as '<role> seat, <dates>' with 3 questions to go", M.titleOf(firstRows[0]) === "Fractional VP Sales seat, Feb to Dec 2024" && M.statusWord(firstRows[0]) === "Draft" && M.subOf(firstRows[0]) === "From your seat · 3 questions, about 3 minutes");
  const f0 = M.factsOf(firstRows[0]);
  check("a seat's draft is prefilled: industry, size, revenue from the seat", f0.industry === "Health Care" && f0.size === "201–500" && f0.revenue === "$20M–$50M" && M.sizeWords(f0) === "201 to 500 people · $20M to $50M revenue", f0);
  check("Example rows are the examples module's (Example<T>), labelled Example", firstRows.slice(2).every((r) => r.kind === "example" && r.x.kind === "example" && r.x.label === "Example" && M.statusWord(r) === "Example"));
  const own = M.ownRows(firstRows);
  check("Example rows are never the member's own (not counted, selected, matched or sent)", own.length === 2 && own.every((r) => r.kind !== "example"));
  const fill = M.fillLine(firstRows, null, 0);
  check("the fill line counts the member's rows only", fill[0].fill === "0 ready · 2 drafts" && fill.find((x) => x.key === "ind")!.fill === "100% from your seats", fill);
  check("the status line counts no example", M.statusLine(firstRows, true, null, 0) === "Private to you. Building a case costs no credits. 0 of 2 ready.");
  check("what the library covers counts no example", M.coverage(firstRows).n === 0 && M.coverage(firstRows).line.startsWith("Build your first case"));
  check("no Example rows once a case is ready", !M.rowsOf([kase("r1")], [nw], false).some((r) => r.kind === "example"));
  check("a seat with a case is not listed twice", M.rowsOf([kase("r1", { seatId: "e_nw" })], [nw, hf], false).map((r) => r.key).join(",") === "r1,seat:e_hf");
  check("why they hired seeds question 1, for the member to change", M.seededProblem(nw) === "They brought me in to build the first sales motion." && M.seededProblem(hf) === "");
  check("three questions: the problem, what you did, the numbers", M.QUESTIONS.map((q) => q.q).join(" | ") === "What was the problem? | What did you do? | What changed, in numbers?");
  check("a case is ready once the problem and what you did are written; numbers are never required", M.canBeReady({ problems: ["x"], text: "y" }) && !M.canBeReady({ problems: [], text: "y" }) && !M.canBeReady({ problems: ["x"], text: "  " }));
  check("problems one a line: cleaned, no repeats", JSON.stringify(M.problemLines("- Four reps, no process\n\nForecast missed\nforecast missed\n• Renewals had no owner")) === JSON.stringify(["Four reps, no process", "Forecast missed", "Renewals had no owner"]));
  check("numbers only as typed: an empty row is dropped, nothing filled in", JSON.stringify(M.cleanOutcomes([{ k: "Win rate", before: "22%", after: "" }, { k: "", before: "1", after: "2" }, { k: "Cycle", before: "", after: "" }])) === JSON.stringify([{ k: "Win rate", before: "22%", after: "" }]));
  check("a title from the answers when none was typed", M.titleFrom(["Four reps, no process."], nw) === "Four reps, no process" && M.titleFrom([], nw) === "Fractional VP Sales seat, Feb to Dec 2024");

  const B = await import("../app/post/evidence/Builder");
  const build = renderToStaticMarkup(h(B.Builder, { row: firstRows[0] as never, others: [hf], onPick: () => {}, onSaved: () => {}, onSeats: () => {}, seatsHref: "/?p=seats", firstCase: true }));
  check("the builder: what is on file from the seat (industry, size, revenue, dates, hours)", build.includes("Already on file. Merlin filled these in from your seat") && build.includes("Health Care") && build.includes("201 to 500 people") && build.includes("Feb to Dec 2024") && build.includes("12 hours a week"), build);
  check("the builder: question 1 of 3, the problem, seeded from why they hired", build.includes("Question 1 of 3") && build.includes("What was the problem?") && build.includes("They brought me in to build the first sales motion.") && build.includes("Merlin started this from why they hired you"));
  check("the builder: privacy said plainly (private by default, the client name hidden)", build.includes("Private by default") && build.includes("Only you see your cases") && build.includes("The client name is hidden. A reader sees") && build.includes("a health care company, $20M to $50M"));
  check("the builder never shows the client's name", !build.includes("Northwind"), build.slice(build.indexOf("Northwind") - 200, build.indexOf("Northwind") + 50));
  check("the builder: build from another seat you added", build.includes("Build from a seat you added") && build.includes("Logistics · Since Mar 2025") && !build.includes("Halcyon"));
  check("the builder: no credits", build.includes("No credits. About 3 minutes for all three."));
  check("the first case's head says step 6", B.buildHead(firstRows[0] as never, true).kicker === "Step 6 · your first case");
  const nums = renderToStaticMarkup(h(B.Builder, { row: firstRows[0] as never, others: [], onPick: () => {}, onSaved: () => {}, onSeats: () => {}, seatsHref: "/?p=seats", firstCase: true, startAt: 2 }));
  check("the builder: the numbers are what changed, before and after, empty until typed", nums.includes("What changed, in numbers?") && nums.includes("Before") && nums.includes("After") && nums.includes("Merlin never fills a number in for you") && !/value="\d/.test(nums), nums.slice(0, 300));

  /* ----- the client: hidden by default ----- */
  const rows = M.rowsOf([kase("r1", { seatId: "e_nw" }), kase("r2", { seatId: "e_lk", industry: "Education", clientLabel: "" })], [nw, hf, lk], false);
  const r1 = rows.find((r) => r.key === "r1")!;
  const r2 = rows.find((r) => r.key === "r2")!;
  check("hidden by default: the row says Client hidden and what a reader sees", JSON.stringify(M.clientWords(r1, false)) === JSON.stringify(["Client hidden", "Reads as a health care company, $20M to $50M"]), M.clientWords(r1, false));
  check("Show reveals the member's own client, on this screen", JSON.stringify(M.clientWords(r1, true)) === JSON.stringify(["Northwind Clinics", "Kept out of proposals"]));
  check("a company locked for the member never shows a name, even shown", M.clientWords(r2, true)[0] === "Client hidden" && !M.canReveal(r2));
  check("no clientLabel: the reader's words are made from the facts", M.labelOf({ clientLabel: "", industry: "Education", size: "51–200", revenue: "" }) === "An education company, 51 to 200 people" && M.labelFrom({ industry: "Health Care", revenue: "$20M–$50M" }) === "A health care company, $20M to $50M" && M.labelFrom({ industry: "EdTech" }) === "An EdTech company");
  check("an example's client is an example", M.clientWords(firstRows[2], true)[0] === "Example client" && !M.canReveal(firstRows[2]));
  const reads = M.readsAs(kase("x"), "Northwind Clinics");
  check("in a Proof part the client is the label until named", reads.startsWith("A health care company, $20M to $50M came in with no shared sales process and the forecast kept missing.") && !reads.includes("Northwind"), reads);
  check("named, the Proof part names the client", M.readsAs(kase("x", { clientNamed: true }), "Northwind Clinics").startsWith("Northwind Clinics, a health care company, $20M to $50M, came in"));
  check("the Proof sentence uses only the numbers typed", reads.endsWith("Win rate went from 22% to 31%, sales cycle went from 94 days to 61 days."), reads);
  check("clientNamed is off by default in what the builder saves", src("app/post/evidence/Builder.tsx").includes("clientNamed: false") && src("app/post/evidence/Builder.tsx").includes("showOnCard: false"));
  const P = await import("../app/post/evidence/Panels");
  const panel = (shown: boolean) =>
    renderToStaticMarkup(
      h(P.CasePanel, { row: r1 as never, clientName: "Northwind Clinics", shown, onEye: () => {}, tab: "case", setTab: () => {}, fresh: false, proposals: [], cos: [], onChange: () => {}, onEdit: () => {}, onMatch: () => {}, onRemove: () => {}, proposalHref: (id: string) => `/?p=proposals&pr=${id}`, openProposals: () => {}, fractionalsHref: "/?p=fractionals", openFractionals: () => {} }),
    );
  check("the case view: client hidden by default, with Show", panel(false).includes("Client hidden") && !panel(false).includes("Northwind") && panel(false).includes(">Show<"));
  check("the case view: every field (facts, problems, what you did, type of work, before and after) and Use in a proposal", ["Industry", "Company size", "Revenue", "Go-to-market motion", "Sold to", "Who you worked with", "Problems solved", "What you did:", "Type of work", "Sales Leadership", "Before and after", "After 31%", "Use in a proposal"].every((w) => panel(false).includes(w)));
  check("the case view, shown: the member's own client", panel(true).includes("Northwind Clinics") && panel(true).includes(">Hide<"));
  const use = renderToStaticMarkup(
    h(P.CasePanel, { row: r1 as never, clientName: "Northwind Clinics", shown: true, onEye: () => {}, tab: "use", setTab: () => {}, fresh: false, proposals: [{ id: "pr1", title: "Cedar and Pine · Fractional CRO", company: "Cedar and Pine", status: "draft" }], cos: [], onChange: () => {}, onEdit: () => {}, onMatch: () => {}, onRemove: () => {}, proposalHref: (id: string) => `/?p=proposals&pr=${id}`, openProposals: () => {}, fractionalsHref: "/?p=fractionals", openFractionals: () => {} }),
  );
  check("Where it is used: how it reads (client kept out even while shown here), the name switch off, Add to Proof, Show on my card off", use.includes("How it reads in the Proof part") && !/<p>[^<]*Northwind/.test(use) && use.includes('aria-checked="false"') && use.includes("The client name is kept out") && use.includes("Add to Proof") && use.includes("Show on my card") && use.includes("Start a new proposal"), use.slice(0, 600));

  /* ----- filters, sorts, match ----- */
  const lib = M.rowsOf([kase("a", { workType: ["Renewal management"], motion: "Channel", usedIn: ["p1", "p2"] }), kase("b", { usedIn: ["p1"] }), kase("c", { status: "draft", workType: ["Renewal management"] })], [], false);
  check("type of work filter: ready cases with a tag in that category (a draft's tags don't count yet)", M.filterRows(lib, { ...M.NO_FILTERS, cat: "Customer Success and Growth" }).map((r) => r.key).join(",") === "a" && M.catCount(lib, "Customer Success and Growth") === 1);
  check("motion filter", M.filterRows(lib, { ...M.NO_FILTERS, motion: "Channel" }).map((r) => r.key).join(",") === "a" && M.motionsOf(lib).join(",") === "Channel,Inside sales");
  check("the bottom tabs: ready, drafts", M.filterRows(lib, { ...M.NO_FILTERS, tab: "ready" }).length === 2 && M.filterRows(lib, { ...M.NO_FILTERS, tab: "draft" }).map((r) => r.key).join(",") === "c");
  check("search your cases: words in a title, problem, tag or fact", M.filterRows(lib, { ...M.NO_FILTERS, q: "renewal channel" }).map((r) => r.key).join(",") === "a");
  check("most used first, drafts first on a first visit", M.sortRows(lib, "used").map((r) => r.key).join(",") === "a,b,c" && M.sortRows(lib, "drafts").map((r) => r.key).join(",") === "c,a,b");
  const ms = new Map([
    ["a", { caseId: "a", label: "Close", same: ["Same size"], diff: ["Sells through partners"] }],
    ["b", { caseId: "b", label: "Same", same: ["Same industry", "Same size"], diff: [] }],
  ] as [string, import("../app/post/evidence/types").EvidenceMatch][]);
  check("closest match first", M.sortRows(lib, "match", ms).map((r) => r.key).join(",") === "b,a,c" && M.topOf(ms) === "b");
  check("match words: Closest match, Close, Not close; never a percentage", M.matchWord(ms.get("b"), true) === "Closest match" && M.matchWord(ms.get("a"), false) === "Close" && M.matchWord({ caseId: "z", label: "Different", same: [], diff: [] }, false) === "Not close" && M.matchWord(undefined, false) === "Not run");
  check("a draft is never ranked, an example never", M.matchCell(lib[2], undefined, false).word === "Finish the case to rank it" && M.matchCell(firstRows[2], undefined, false).word === "Example, not ranked");
  check("the match cell says what is the same", M.matchCell(lib[0], ms.get("a"), false).why === "Same size");
  check("the status line while matching: free", M.statusLine(lib, false, "Cedar and Pine", 2) === "Match to Cedar and Pine · 2 of 3 ranked · free");
  check("the status line in use", M.statusLine(lib, false, null, 0) === "Private to you · 2 ready, 1 draft · used in 2 proposals");
  check("eight type of work categories, each tag filed once", T.workCats().length === 8 && new Set(T.tagGroups().flatMap((g) => g.tags)).size === T.tagGroups().flatMap((g) => g.tags).length && T.catOf("Sales playbook") === "Sales Enablement" && T.catOf("My own tag") === null);

  /* ----- the thin client ----- */
  answer = () => ({ json: { cases: [kase("r1")] } });
  const l1 = await api.list();
  check("list: { cases }", Array.isArray(l1) && l1[0].id === "r1" && calls.at(-1)!.url === "/api/evidence" && calls.at(-1)!.body!.op === "list");
  answer = () => ({ json: [kase("r2")] });
  const l2 = await api.list();
  check("list: a bare list too", Array.isArray(l2) && l2[0].id === "r2");
  answer = () => ({ status: 403, json: { error: "Evidence Bank is part of Close.", upgrade: "close" } });
  const l3 = await api.list();
  check("an error comes back in its words, with the upgrade", api.failed(l3) && l3.error === "Evidence Bank is part of Close." && l3.upgrade === "close");
  answer = () => ({ status: 500, json: { error: "boom" } });
  const l4 = await api.list();
  check("a server error says so plainly, never its text", api.failed(l4) && !l4.error.includes("boom"));
  answer = (c) => ({ json: { case: kase("d9", { status: "draft", seatId: String(c.body!.seatId) }) } });
  const d = await api.draftFromSeat("e_nw");
  check("draftFromSeat: { op, seatId }, the case back", !api.failed(d) && d.seatId === "e_nw" && calls.at(-1)!.body!.op === "draftFromSeat");
  answer = (c) => ({ json: { ...kase(String(c.body!.id)), status: "ready" } });
  const s1 = await api.save({ id: "d9", seatId: "e_nw", status: "ready", problems: ["No shared sales process", "Four reps sold four ways"], text: "Set one sales process.", outcomes: [{ k: "Win rate", before: "22%", after: "31%" }], workType: ["Sales playbook"] });
  const sb = calls.at(-1)!.body!;
  check("save: the fields as the route takes them, the case itself back", !api.failed(s1) && s1.id === "d9" && sb.op === "save" && sb.id === "d9" && sb.status === "ready" && JSON.stringify(sb.workType) === '["Sales playbook"]', sb);
  check("save: what you did is the route's answers.did, the problems its answers.problem, the numbers in words; never a seat id or the case's words", JSON.stringify(sb.answers) === JSON.stringify({ did: "Set one sales process.", problem: "No shared sales process. Four reps sold four ways", numbers: "Win rate went from 22% to 31%." }) && !("text" in sb) && !("seatId" in sb), sb);
  answer = () => ({ json: { companyId: "c_cp", cases: [{ caseId: "r1", title: "x", closest: true, label: "Close", same: ["Same size"], diff: [] }, { bad: true }, { caseId: "r2", label: "72%" }], skipped: 1 } });
  const m1 = await api.match("c_cp", ["r1"]);
  check("match: the route's MatchView, words for each case, junk and anything not a word dropped", !api.failed(m1) && m1.length === 1 && m1[0].label === "Close" && m1[0].same[0] === "Same size" && JSON.stringify(calls.at(-1)!.body) === JSON.stringify({ op: "match", companyId: "c_cp", caseIds: ["r1"] }), m1);
  answer = () => ({ json: { card: [] } });
  const cd = await api.card("r1", true);
  check("card: { op, id, on }", !api.failed(cd) && JSON.stringify(calls.at(-1)!.body) === JSON.stringify({ op: "card", id: "r1", on: true }));
  answer = () => ({ json: { items: [] } });
  const tp = await api.toProof("r1", { id: "pr_1", proofCases: ["r0", "r9"] });
  check("toProof: this case first in that proposal's Proof, beside the one it held (the proposals route)", !api.failed(tp) && calls.at(-1)!.url === "/api/proposals" && JSON.stringify(calls.at(-1)!.body) === JSON.stringify({ op: "update", id: "pr_1", proofCases: ["r1", "r0"] }));
  // The route's list: CaseView (client { named, label, name? }, answers apart, its own words in text) and its pick lists.
  answer = () => ({
    json: {
      canUse: true,
      kept: 0,
      limit: 50,
      cases: [{ id: "v1", status: "draft", seatId: "e_nw", companyId: "c_nw", client: { named: false, label: "A health care company, $20M to $50M" }, title: "Fractional VP Sales seat, Feb 2024 to Dec 2024", role: "Fractional VP Sales", fn: "Sales", start: "2024-02", end: "2024-12", dates: "Feb 2024 to Dec 2024", hours: "12", size: "201–500", revenue: "$20M–$50M", motion: "Sales-led", industry: "Health Care", soldTo: "", problems: ["Build the first sales motion"], workType: [], outcomes: [], workedWith: [], answers: { problem: "They brought me in to build the first sales motion.", did: "", numbers: "" }, answered: { problem: true, did: false, numbers: false }, text: "The client: a health care company, $20M to $50M. The problem: they brought me in to build the first sales motion.", textBy: "template", showOnCard: false, usedIn: [], createdAt: NOW, updatedAt: NOW }],
      tags: { categories: ["Sales Leadership", "Marketing"], tags: [{ name: "Founder-led sales exit", category: "Sales Leadership" }, { name: "Demand generation", category: "Marketing" }] },
      problems: ["Move off founder-led sales", "Build the first sales motion"],
      motions: ["Founder-led", "Sales-led", "Product-led", "Channel"],
      ai: { on: false, agreed: false },
    },
  });
  const lv = await api.list();
  const v1 = !api.failed(lv) ? lv[0] : null;
  check("list: the route's CaseView reads as the page's case (client hidden, the label, no name)", !!v1 && v1.clientNamed === false && v1.clientLabel === "A health care company, $20M to $50M" && !v1.clientName && v1.seatId === "e_nw" && v1.status === "draft", v1);
  check("list: the route's answers apart: what you did, the problem as typed, the case's words", !!v1 && v1.text === "" && v1.problemText === "They brought me in to build the first sales motion." && !!v1.reads?.startsWith("The client: a health care company"), v1);
  check("list: the route's tags and problems become the pick lists", T.workCats().join(",") === "Sales Leadership,Marketing" && T.catOf("Demand generation") === "Marketing" && T.problemPicks().includes("Move off founder-led sales"));
  T.setPicks({ tags: T.WORK_TAGS_DEFAULT, problems: T.PROBLEMS });
  check("nothing in the client spends a credit", !/unlock|spend|confirm: true|credits?:/i.test(src("app/post/evidence/api.ts").replace(/\/\*[\s\S]*?\*\//g, "")));

  /* ----- draft on seat add, Your seats ----- */
  answer = (c) => ({ json: { case: kase(`d_${c.body!.seatId}`, { status: "draft", seatId: c.body!.seatId }) } });
  const n0 = calls.length;
  const none = await api.draftNewSeats(new Set(["e_nw"]), ["e_nw", "e_new"], false);
  check("draft on seat add: never without Close", none.length === 0 && calls.length === n0);
  const fresh = await api.draftNewSeats(new Set(["e_nw"]), ["e_nw", "e_new"], true);
  check("draft on seat add: a new seat starts its draft", fresh.join(",") === "e_new" && calls.at(-1)!.body!.op === "draftFromSeat" && calls.at(-1)!.body!.seatId === "e_new");
  const again = await api.draftNewSeats(new Set(["e_nw"]), ["e_nw", "e_new"], true);
  check("draft on seat add: asked once per seat", again.length === 0);
  const SE = await import("../app/post/evidence/SeatEvidence");
  check("Your seats' column: Close in the new look only", SE.seatEvidenceOn(true, { canClose: true }) && !SE.seatEvidenceOn(true, { canClose: false }) && !SE.seatEvidenceOn(false, { canClose: true }));
  check("Your seats' column head", SE.seatCasesFill(null, ["a"], false) === "On the Close plan" && SE.seatCasesFill(new Map([["a", "ready"]]), ["a", "b"], true) === "1 of 2 cases ready");
  const cell = renderToStaticMarkup(h(SE.SeatCaseCell, { seatId: "e_nw", status: undefined, page: "seats", openPage: () => {}, name: "Northwind Clinics" }));
  const ready = renderToStaticMarkup(h(SE.SeatCaseCell, { seatId: "e_nw", status: "ready", page: "seats", openPage: () => {}, name: "Northwind Clinics" }));
  check("a seat without a ready case: Finish its evidence case", cell.includes("Finish its evidence case") && cell.includes("3 questions, about 3 minutes"));
  check("a seat with its case ready: Case ready, Open it", ready.includes("Case ready") && ready.includes("Open it"));
  const ys = src("app/post/seatsPage/YourSeats.tsx");
  check("Your seats: the placeholder column is gone", !ys.includes("coming soon") && !ys.includes("Starts with Evidence Bank") && ys.includes("<SeatCaseCell") && ys.includes("useSeatCases(seatIds, evOn)"));
  const st = src("app/post/Seats.tsx");
  check("phones and the old look: the seat card's line only in the new look with Close", st.includes("seatEvidenceOn(!!me.ui2, me.plan)") && st.includes("{evOn && <SeatCaseLine"));
  const O = await import("../app/post/evidence/open");
  let opened = "";
  O.openEvidence({ page: "seats", openPage: (p) => (opened = p) }, "e_nw");
  check("Finish its evidence case opens Evidence Bank at that seat, once", opened === "evidence" && O.takeEvidenceSeat() === "e_nw" && O.takeEvidenceSeat() === null);

  /* ----- plain words ----- */
  const files = readdirSync(join(ROOT, "app/post/evidence")).filter((f) => /\.tsx?$/.test(f));
  const all = files.map((f) => src(join("app/post/evidence", f))).join("\n");
  const strings = (all.match(/"[^"\n]{3,}"|`[^`\n]{3,}`|>[^<>{}\n]{3,}</g) ?? []).join("\n");
  check("no export, CSV or download anywhere on the page", !/Export|Download|\bCSV\b|\.csv|PDF/.test(strings), strings.match(/.*(Export|Download|CSV|PDF).*/)?.[0]);
  check("no volt: nothing on Evidence Bank earns a credit", !all.includes("btn-volt") && !src("app/post/evidence/evidence.css").includes("--volt"));
  check("Merlin, never the AI's maker, and no AI claim for the words", !/Claude|Anthropic|\bAI wrote|Merlin wrote/.test(strings));
  check("no exclamation marks and no em dashes in the words", !/![ "<`]|—/.test(strings.replace(/!==?|!\w|!\(|!!/g, "")), strings.match(/.*(![ "<`]|—).*/)?.[0]);
  check("the paste box (results email) is left out: drafting with AI is not on this page", !strings.includes("Paste a results email"));
}

main()
  .then(() => {
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
