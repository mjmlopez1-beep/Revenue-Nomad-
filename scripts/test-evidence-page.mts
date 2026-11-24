/**
 * Checks of the Evidence Bank page (app/post/evidence): case studies in a two-column table, the
 * client's real name and logo shown on this private page, a tile opened into its form in place
 * (saving through the same route as everything else), the tag search with quick picks, the wizard
 * and where it picks up, "Build this for me" (the prompt, and Claude's link only when Claude is
 * connected), case studies an agent saved marked for review, the coverage count, and no export.
 *
 *   npx tsx scripts/test-evidence-page.mts      exits 1 on any failure
 *
 * In process: no server, no seed. `fetch` is a stub that answers as the route does. Every record
 * is made up (member Jordan Avery; companies Northwind Clinics, Cedar and Pine, Halcyon Freight,
 * Larkspur Learning).
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

type Study = import("../app/post/evidence/types").Study;
const NOW = "2026-11-20T10:00:00.000Z";
function study(id: string, more: Partial<Study> = {}): Study {
  return {
    id,
    status: "ready",
    seatId: null,
    companyId: "c_northwind01",
    client: { named: false, label: "A health care company, $20M to $50M", name: "Northwind Clinics" },
    title: "One sales process and a forecast that holds",
    role: "Fractional VP Sales",
    fn: "Sales",
    start: "2024-02",
    end: "2024-12",
    dates: "Feb 2024 to Dec 2024",
    hours: "12",
    size: "201–500",
    revenue: "$20M–$50M",
    motion: "Sales-led",
    industry: "Health Care",
    soldTo: "Clinic groups",
    problems: [],
    workType: ["Forecast methodology"],
    outcomes: [{ k: "Win rate", before: "22%", after: "31%" }],
    workedWith: [],
    answers: { problem: "Four reps sold four different ways.", did: "Set one sales process and a weekly forecast.", numbers: "Win rate went from 22% to 31%." },
    answered: { problem: true, did: true, numbers: true },
    took: "6 months",
    quote: null,
    from: null,
    review: false,
    blanks: [],
    text: "",
    textBy: "template",
    showOnCard: false,
    usedIn: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...more,
  };
}
const CATALOGUE = {
  categories: ["Sales Leadership", "Marketing", "Revenue Operations", "Sales Enablement", "Customer Success and Growth", "AI go-to-market", "Partnerships", "Sellers", "Finance", "Technology"],
  tags: [
    { name: "Sales process design", category: "Sales Leadership" },
    { name: "Forecast methodology", category: "Sales Leadership" },
    { name: "Founder-led sales exit", category: "Sales Leadership" },
    { name: "Sales team hiring and ramp", category: "Sales Leadership" },
    { name: "Pricing and packaging", category: "Sales Leadership" },
    { name: "Demand generation", category: "Marketing" },
    { name: "Positioning and messaging", category: "Marketing" },
    { name: "CRM sales configuration", category: "Revenue Operations" },
    { name: "Revenue reporting and dashboards", category: "Revenue Operations" },
    { name: "Sales playbook", category: "Sales Enablement" },
    { name: "Renewal management", category: "Customer Success and Growth" },
    { name: "Discovery call execution", category: "Sellers" },
  ],
};

async function main() {
  const M = await import("../app/post/evidence/evidenceModel");
  const api = await import("../app/post/evidence/api");
  const { seatLiteOf } = await import("../app/post/evidence/seatLite");
  const ui = await import("../app/ui/shared");
  const files = readdirSync(join(ROOT, "app/post/evidence")).filter((f) => /\.tsx?$/.test(f));

  /* ----- Close only ----- */
  check("Close only: Free and Pro see the upgrade screen", !M.evidenceOpen({ canClose: false }));
  check("Close only: the trial and Close see the case studies", M.evidenceOpen({ canClose: true }));
  check("Close only: with billing off (no plan) nothing is gated", M.evidenceOpen(null) && M.evidenceOpen(undefined));
  const U = await import("../app/post/evidence/Upgrade");
  const up = renderToStaticMarkup(h(U.EvidenceUpgrade, { tier: "pro" }));
  check("the upgrade screen says what Evidence Bank does and offers the Close plan", up.includes("Evidence Bank is part of Close") && up.includes("See the Close plan") && up.includes("Private by default") && up.includes("Built from your seats") && up.includes("You are on Pro"), up);
  check("the upgrade screen shows no case study and no client", !/Northwind|data-case/.test(up));
  const ev = src("app/post/evidence/Evidence.tsx");
  check("the page draws the upgrade screen, and nothing else, without Close", /if \(!open\)\s*return \(\s*<>\s*\{header\}\s*<EvidenceUpgrade/.test(ev) && ev.indexOf("evidenceOpen(c.me.plan)") > 0 && ev.indexOf("<Bank />") > ev.indexOf("<EvidenceUpgrade"));
  const pages = src("app/post/shell/pages.tsx");
  check("the registry mounts Evidence Bank", /evidence: \{ title: "Evidence Bank", component: EvidenceP, ownHeader: true, ownStrip: true/.test(pages) && pages.includes('import("../evidence/Evidence")'));
  check("the nav item stays Evidence Bank; the page speaks of case studies", ev.includes('{ label: "Evidence Bank"') && ev.includes('"Case studies"') && ev.includes("Add a case study"));

  /* ----- seats as the page reads them ----- */
  const v = (x: string) => ({ s: "value", v: x, ver: 0 }) as never;
  const seatInfo = (id: string, coId: string, name: string, cells: Record<string, string>, co: Record<string, string>, hidden = false) =>
    ({
      i: { c: { id: coId, name, hidden, cells: Object.fromEntries(Object.entries(co).map(([k, x]) => [k, v(x)])), engagements: [] }, engs: [], people: [], domain: null },
      e: { id, source: "Member", verified: true, cells: Object.fromEntries(Object.entries(cells).map(([k, x]) => [k, v(x)])), people: [], updatedAt: null, yours: true },
      missing: [],
      coMissing: [],
    }) as never;
  const nw = seatLiteOf(seatInfo("e_nw", "c_northwind01", "Northwind Clinics", { role: "Fractional VP Sales", start: "2024-02", end: "2024-12", hours: "12", reason: "Build the first sales motion" }, { industry: "Health Care", employees: "201–500", revenue: "$20M–$50M" }));
  const hf = seatLiteOf(seatInfo("e_hf", "c_halcyon001", "Halcyon Freight", { function: "Sales", start: "2025-03" }, { industry: "Logistics", employees: "201–500" }));
  check("a seat brings its company, logo id, role, dates and facts", nw.company === "Northwind Clinics" && nw.companyId === "c_northwind01" && nw.industry === "Health Care" && nw.dates === "Feb to Dec 2024" && nw.role === "Fractional VP Sales", nw);

  /* ----- the table: column A the company with its name and logo, column B its case studies ----- */
  const cases = [study("a1", { updatedAt: "2026-11-21T10:00:00.000Z" }), study("a2", { title: "Hired the first four reps", companyId: null }), study("c1", { companyId: null, client: { named: false, label: "A SaaS company", name: "Cedar and Pine" }, industry: "SaaS", size: "51–200" })];
  const rows = M.companyRows(cases, [nw, hf]);
  check("one row a company: Northwind's two case studies together, Cedar and Pine, then Halcyon's seat with none yet", rows.map((r) => `${r.name}:${r.cases.length}`).join(",") === "Northwind Clinics:2,Cedar and Pine:1,Halcyon Freight:0", rows.map((r) => `${r.name}:${r.cases.length}`));
  check("the company's real name shows (the page is the member's own), with its facts", rows[0].name === "Northwind Clinics" && M.companyName(rows[0]) === "Northwind Clinics" && rows[0].facts === "Health Care · 201 to 500 people" && rows[1].facts === "SaaS · 51 to 200 people", rows.map((r) => r.facts));
  check("the logo comes from the company on Merlin (its public id), the seat's when there is no case study yet; none for a typed company", rows[0].logoId === "c_northwind01" && rows[2].logoId === "c_halcyon001" && rows[1].logoId === null);
  const logo = renderToStaticMarkup(h(ui.CompanyLogo, { name: "Northwind Clinics", domain: null, seed: rows[0].logoId!, hidden: false, size: "lg" }));
  const letters = renderToStaticMarkup(h(ui.CompanyLogo, { name: "Cedar and Pine", domain: null, hidden: false, size: "lg" }));
  check("column A draws the logo from /api/logo/<id>; a typed company gets its lettered tile", logo.includes('src="/api/logo/c_northwind01"') && !letters.includes("<img") && /class="logo logo-lg"[^>]*>[A-Z]{1,2}</.test(letters), [logo, letters]);
  check("the page draws column A with the name and the logo, and column B with the tiles (no side panel)", ev.includes('<span role="columnheader">Company</span>') && ev.includes('<span role="columnheader">Case studies</span>') && /<CompanyLogo name=\{companyName\(r\)\} domain=\{null\} seed=\{r\.logoId/.test(ev) && ev.includes("<CaseTile") && !/CasePanel|MatchPanel|ev-aside/.test(ev));
  check("no 'Client hidden' and no Show button on the page: names aren't hidden here", !files.some((f) => /Client names: hidden|>Show<|Client hidden/.test(src(join("app/post/evidence", f)))));
  check("search keeps a company by its name, or the case studies with the words", M.searchRows(rows, "cedar").map((r) => r.name).join() === "Cedar and Pine" && M.searchRows(rows, "first four").flatMap((r) => r.cases.map((c) => c.id)).join() === "a2" && M.searchRows(rows, "").length === 3);

  /* ----- one tile, and the tile opened ----- */
  const T = await import("../app/post/evidence/CaseTile");
  const tile = renderToStaticMarkup(h(T.CaseTile, { c: cases[0], onOpen: () => {} }));
  check("a tile: title, the result line, the role and dates, where it stands", tile.includes("One sales process and a forecast that holds") && tile.includes("Win rate: 22% to 31% in 6 months") && tile.includes("Fractional VP Sales · Feb 2024 to Dec 2024") && tile.includes(">Ready<") && tile.includes('aria-label="Edit the case study: One sales process'), tile);
  const review = study("r1", { review: true, from: "Claude", status: "draft", answers: { problem: "No forecast.", did: "Built one.", numbers: "Pipeline went from [add the starting number] to $3.4M." }, outcomes: [], blanks: ["[add the starting number]"] });
  const rtile = renderToStaticMarkup(h(T.CaseTile, { c: review, onOpen: () => {} }));
  check("a case study the connector saved shows From Claude · review, its blank marked", rtile.includes("From Claude · review") && rtile.includes('<mark class="ev-blank">[add the starting number]</mark>') && rtile.includes("ev-tone-review"), rtile);
  check("where it stands: review, blanks to fill, draft, ready", M.statusOf(review).word === "From Claude · review" && M.statusOf({ ...review, review: false }).word === "Draft · 1 blank to fill" && M.statusOf({ ...cases[0], status: "draft" }).word === "Draft" && M.statusOf(cases[0]).tone === "ready");
  const form = renderToStaticMarkup(h(T.CaseForm, { c: cases[0], catalogue: CATALOGUE, onCancel: () => {}, onSaved: () => {}, onRemoved: () => {}, onUse: () => {} }));
  check("the tile opened is its form, in place: every part, Save and Cancel, Use in a proposal, Remove", ['class="ev-tile ev-tile-open"', "Your seat", "Started", "Ended", "The problem when you got there", "What you did", "The result, with numbers", "How long it took", "Who can vouch", "The quote", "Their name", "Where they&#x27;re based", "Tags", "Name the client in proposals", "Show on my Fractionals card", ">Save<", ">Cancel<", "Use in a proposal", "Remove"].every((w) => form.includes(w)), form.slice(0, 400));
  check("the form starts with the case study's own words", form.includes("Four reps sold four different ways.") && form.includes('value="6 months"') && form.includes('value="2024-02"'));
  const rform = renderToStaticMarkup(h(T.CaseForm, { c: review, catalogue: CATALOGUE, onCancel: () => {}, onSaved: () => {}, onRemoved: () => {}, onUse: () => {} }));
  check("a review case study's form says where it came from, asks to fill the blanks, and saves as Looks right", rform.includes("From Claude, to review.") && rform.includes("Fill in the part in square brackets.") && rform.includes("Looks right, save it") && !rform.includes("Use in a proposal"), rform.slice(0, 600));
  const f0 = { title: "One sales process", company: "Northwind Clinics", role: "Fractional VP Sales", start: "2024-02", end: "2024-12", going: false, datesTouched: false, problem: "Four reps sold four ways.", did: "Set one sales process.", numbers: "Win rate went from 22% to 31%.", took: "6 months", quote: "", by: "", byTitle: "", where: "", tags: ["Forecast methodology"], named: false, onCard: true, industry: "Health Care", size: "", revenue: "" };
  const in1 = T.formInput(cases[0], f0);
  check("Save sends the route's fields: ready, the answers, the tags, no quote, the dates left as they were, the company on Merlin kept", in1.id === "a1" && in1.status === "ready" && in1.showOnCard === true && in1.quote === null && JSON.stringify(in1.answers) === JSON.stringify({ problem: f0.problem, did: f0.did, numbers: f0.numbers }) && !("start" in in1) && !("clientName" in in1) && in1.clientNamed === false, in1);
  const in2 = T.formInput(review, { ...f0, numbers: "Pipeline went from [add the starting number] to $3.4M.", by: "Sam Lee", byTitle: "CEO", where: "Denver, CO", quote: "It worked." });
  check("with a blank left it saves as a draft (and never on the card); the quote goes with who said it", in2.status === "draft" && in2.showOnCard === false && JSON.stringify(in2.quote) === JSON.stringify({ text: "It worked.", by: "Sam Lee", title: "CEO", where: "Denver, CO" }), in2);
  const fresh = T.blankStudy({ name: "Halcyon Freight", companyId: "c_halcyon001", industry: "Logistics" });
  const in3 = T.formInput(fresh, { ...f0, company: "Halcyon Freight", datesTouched: false });
  check("a new case study at a company sends its name, facts and dates, and no id", !("id" in in3) && in3.clientName === "Halcyon Freight" && in3.start === "2024-02" && in3.end === "2024-12");
  // The inline save goes through the same route as everything else.
  answer = (c) => ({ json: { ...study(String(c.body!.id)), title: String(c.body!.title) } });
  const saved = await api.save(in1);
  const sb = calls.at(-1)!;
  check("inline edit saves through the same API: POST /api/evidence { op: save, ...fields }, the case study back", !api.failed(saved) && saved.title === "One sales process" && sb.url === "/api/evidence" && sb.body!.op === "save" && sb.body!.id === "a1" && JSON.stringify(sb.body!.workType) === '["Forecast methodology"]', sb.body);
  const ct = src("app/post/evidence/CaseTile.tsx");
  check("the form's Save calls that save with formInput; Escape cancels", /const input = formInput\(c, \{/.test(ct) && ct.includes("await api.save(input)") && ct.includes('e.key === "Escape"'));

  /* ----- tags: search, not a long list ----- */
  check("tag search: what was typed, best first; picked ones left out", M.searchTags("forec", CATALOGUE, []).map((t) => t.name).join() === "Forecast methodology" && M.searchTags("sales", CATALOGUE, ["Sales playbook"]).every((t) => t.name !== "Sales playbook") && M.searchTags("sales", CATALOGUE, [])[0].name.toLowerCase().startsWith("sales"));
  check("tag search: by the category's name too, at most 8", M.searchTags("marketing", CATALOGUE, []).map((t) => t.name).sort().join() === "Demand generation,Positioning and messaging" && M.searchTags("e", CATALOGUE, []).length <= 8);
  check("tag search matches the start of a word: board finds Board reporting, never Onboarding", M.searchTags("board", { categories: [], tags: [{ name: "Board reporting on sales", category: "Sales Leadership" }, { name: "Onboarding program", category: "Sales Enablement" }] }, []).map((t) => t.name).join() === "Board reporting on sales");
  check("tag search with only the category names loaded searches the categories", M.searchTags("rev", { categories: CATALOGUE.categories, tags: [] }, []).map((t) => t.name).join() === "Revenue Operations");
  const sug = M.suggestTagsFor({ title: "Forecast", role: "Fractional VP Sales", fn: "Sales", industry: "Health Care", answers: { problem: "No sales process and the forecast missed.", did: "Wrote a sales playbook and set the forecast methodology.", numbers: "" } }, CATALOGUE, []);
  check("quick picks: 5 to 8 likely tags from the case study's words and its function", sug.length >= 5 && sug.length <= 8 && sug.includes("Forecast methodology") && sug.includes("Sales playbook") && sug.includes("Sales process design"), sug);
  check("quick picks leave out tags already on it", !M.suggestTagsFor({ role: "Fractional VP Sales", fn: "Sales", answers: { problem: "forecast", did: "forecast methodology" } }, CATALOGUE, ["Forecast methodology"]).includes("Forecast methodology"));
  const TS = await import("../app/post/evidence/TagSearch");
  const tags = renderToStaticMarkup(h(TS.TagSearch, { value: ["Forecast methodology"], onChange: () => {}, catalogue: CATALOGUE, suggested: ["Sales playbook", "Forecast methodology"] }));
  check("the tag box: a search field, the picked tag as a chip to remove, likely fits one click each, no list of every tag", tags.includes('role="combobox"') && tags.includes('aria-label="Remove the tag Forecast methodology"') && tags.includes("Likely fits") && tags.includes("+ Sales playbook") && !tags.includes("+ Forecast methodology") && !tags.includes("Demand generation"), tags);
  const tsrc = src("app/post/evidence/TagSearch.tsx");
  check("the tag box picks with Enter or a click and takes the member's own words", tsrc.includes('e.key === "Enter"') && tsrc.includes("onMouseDown") && tsrc.includes("Your own tag") && tsrc.includes('e.key === "ArrowDown"'));

  /* ----- coverage: from the saved case studies ----- */
  check("coverage: no case study, 0 of 10 categories", JSON.stringify(M.coverageOf([], CATALOGUE)) === JSON.stringify({ n: 0, of: 10, covered: [] }));
  check("coverage: saving one case study in a category moves it to 1 of 10", M.coverageOf([study("x1", { workType: ["Demand generation"] })], CATALOGUE).n === 1 && M.coverageOf([study("x1", { workType: ["Demand generation"] })], CATALOGUE).covered[0] === "Marketing");
  check("coverage: an untagged case study counts for its seat's category, drafts and review ones too", M.coverageOf([study("x2", { workType: [], status: "draft", review: true, role: "Fractional CMO", fn: "Marketing" })], CATALOGUE).covered.join() === "Marketing");
  check("coverage: with the category names only, a category used as a tag counts", M.coverageOf([study("x3", { workType: ["Finance"] })], { categories: CATALOGUE.categories, tags: [] }).covered.join() === "Finance");
  check("the page counts from the same list it draws, so a save moves it at once", /const cover = coverageOf\(cases, catalogue\)/.test(ev) && ev.includes("Covers {cover.n} of {cover.of} categories") && /setCases\(\(cs\) => \[x, \.\.\.\(cs \?\? \[\]\)/.test(ev));
  check("coming back from Claude reads the bank again (cases the connector saved)", ev.includes('addEventListener("visibilitychange", back)') && ev.includes('window.addEventListener("focus", back)'));
  check("coming back reads the bank again with the wizard or a form open too (Build this for me sits inside the wizard), once a return", !/const back = \(\) => [^\n]*(!editing|!wiz)/.test(ev) && /\[load\]\);/.test(ev.slice(ev.indexOf('addEventListener("visibilitychange", back)'))) && ev.includes("Date.now() - lastBack.current < 2000"));

  /* ----- the wizard ----- */
  check("four steps in fractional words", M.WIZ_STEPS.map((s) => s.h).join(" | ") === "Pick a client you did great work for | What was the problem, and what did you do? | What changed? | Who can vouch for it?");
  const blankA = { problem: "", did: "", numbers: "" };
  check("where a case study picks up: the work, then the result, then who can vouch", M.stepOf(null) === 0 && M.stepOf({ answers: blankA }) === 1 && M.stepOf({ answers: { ...blankA, problem: "x", did: "y" } }) === 2 && M.stepOf({ answers: { problem: "x", did: "y", numbers: "z" } }) === 3);
  const d1 = study("d1", { status: "draft", answers: { problem: "x", did: "y", numbers: "" }, outcomes: [] });
  check("resume: the kept case study at the later of the kept step and its answers", JSON.stringify(M.resumeAt({ caseId: "d1", step: 1 }, [d1], false)) === JSON.stringify({ caseId: "d1", step: 2 }) && JSON.stringify(M.resumeAt({ caseId: "d1", step: 3 }, [d1], false)) === JSON.stringify({ caseId: "d1", step: 3 }));
  check("resume: nothing once it is ready, or gone; on a first visit the newest started draft", M.resumeAt({ caseId: "a1", step: 1 }, [cases[0]], false) === null && M.resumeAt({ caseId: "zz", step: 1 }, [d1], false) === null && M.resumeAt(null, [d1], true)?.caseId === "d1" && M.resumeAt(null, [d1], false) === null);
  check("resume: the kept step reads safely (junk is nothing)", M.readResume('{"caseId":"d1","step":2}')?.step === 2 && M.readResume("nope") === null && M.readResume('{"caseId":"d1","step":9}') === null && M.readResume(null) === null && M.wizKey("mem_jordan") === "rn-ev-wizard:mem_jordan");
  check("the page keeps the step in this browser only, and opens the wizard on a first visit", ev.includes("readResume(store.get(memberKey))") && ev.includes("resumeAt(kept, list, first)") && ev.includes("if (first && store.get(`${memberKey}:skip`)") && /try \{\s*return window\.localStorage\.getItem/.test(ev));
  const W = await import("../app/post/evidence/Wizard");
  const wiz0 = renderToStaticMarkup(h(W.Wizard, { seats: [nw, hf], cases: [], catalogue: CATALOGUE, start: null, onCase: () => {}, onStep: () => {}, onClose: () => {}, buildForMe: h("span", null, "BFM-SLOT"), first: true }));
  check("wizard step 1: pick a client from your seats (logo, name, role, dates) or type the company; Build this for me there too", wiz0.includes("Pick a client you did great work for") && wiz0.includes("Step 1 of 4") && wiz0.includes("Northwind Clinics") && wiz0.includes('src="/api/logo/c_northwind01"') && wiz0.includes("Fractional VP Sales · Feb to Dec 2024") && wiz0.includes("Or type the company") && wiz0.includes("BFM-SLOT") && wiz0.includes("Skip for now"), wiz0.slice(0, 500));
  const wiz2 = renderToStaticMarkup(h(W.Wizard, { seats: [nw], cases: [d1], catalogue: CATALOGUE, start: { caseId: "d1", step: 2 }, onCase: () => {}, onStep: () => {}, onClose: () => {}, buildForMe: null, first: true }));
  check("wizard resumed: step 3 of 4, what changed, with the client named, and Save and finish later", wiz2.includes("Step 3 of 4 · Northwind Clinics") && wiz2.includes("What changed?") && wiz2.includes("The result, with a number") && wiz2.includes("How long it took") && wiz2.includes("Save and finish later") && wiz2.includes("Merlin never fills one in for you"), wiz2.slice(0, 500));
  const wiz3 = renderToStaticMarkup(h(W.Wizard, { seats: [], cases: [d1], catalogue: CATALOGUE, start: { caseId: "d1", step: 3 }, onCase: () => {}, onStep: () => {}, onClose: () => {}, buildForMe: null, first: false }));
  check("wizard step 4: who can vouch, optional, and the California rule said plainly", wiz3.includes("Who can vouch for it?") && wiz3.includes("Skip this") && wiz3.includes("never when they are in California"));
  const wsrc = src("app/post/evidence/Wizard.tsx");
  check("each wizard step saves as it goes (the same route), and Add another or Done at the end", wsrc.includes("api.draftFromSeat(pick)") && (wsrc.match(/api\.save\(/g) ?? []).length >= 4 && wsrc.includes("Add another") && wsrc.includes(">\n              Done") && wsrc.includes("onStep(c && s < 4"));

  /* ----- Build this for me ----- */
  const prompt = M.buildPrompt("https://merlin.example");
  check("the prompt: Claude's memory and the member's email (Gmail or Outlook), past client engagements", prompt.includes("Use what you remember about my work") && prompt.includes("connected email (Gmail or Outlook)") && prompt.includes("past client engagements"));
  check("the prompt: the company, the role, the dates, the problem, what I did, the result, how long, the quote", ["the company", "my seat or role", "the start and end month", "the problem when I got there", "what I did", "the result with numbers", "how long it took", "a quote"].every((w) => prompt.includes(w)));
  check("the prompt: never invent a number, and marked blanks where unsure", prompt.includes("Never invent, round or guess a number") && prompt.includes("[add the result number]") && prompt.includes("Leave a date out rather than guess it"));
  check("the prompt: save_evidence_case once per case study, after asking", prompt.includes("call Merlin's save_evidence_case once per case study") && prompt.includes("Show me the list first and ask") && prompt.includes("confirm: true") && prompt.includes("client_name") && prompt.includes("leave client_named off"));
  check("the prompt: then review them in Merlin, From Claude · review", prompt.includes("review them in Merlin's Evidence Bank (https://merlin.example/?p=evidence)") && prompt.includes('"From Claude · review"'));
  check("the prompt: plain words, no invented promise, short enough for a link", !M.NOT_OUR_WORDS.test(prompt) && prompt.length < 1800 && M.claudeLink(prompt).length < 4000);
  check("the link opens Claude with the prompt ready", M.claudeLink(prompt) === `https://claude.ai/new?q=${encodeURIComponent(prompt)}` && decodeURIComponent(M.claudeLink(prompt).split("?q=")[1]) === prompt);
  check("which agent: Claude by its name; Claude Code and ChatGPT are not the claude.ai link", M.agentState([{ name: "Claude" }]).claude && !M.agentState([{ name: "Claude Code" }]).claude && M.agentState([{ name: "Claude Code" }]).any && !M.agentState([{ name: "ChatGPT" }]).claude && !M.agentState([]).any);
  const B = await import("../app/post/evidence/BuildForMe");
  const panel = (agents: ReturnType<typeof M.agentState> | null) => renderToStaticMarkup(h(B.BuildForMePanel, { agents, origin: "https://merlin.example", onRecheck: () => {}, checking: false, onClose: () => {}, onAgentAccess: () => {}, agentHref: "/?p=agent" }));
  const withClaude = panel(M.agentState([{ name: "Claude" }]));
  check("Claude connected: the link to Claude with the prompt, Copy the prompt, the member presses send", (/href="(https:\/\/claude\.ai\/new\?q=[^"]+)"/.exec(withClaude)?.[1] ?? "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&") === M.claudeLink(prompt) && withClaude.includes('target="_blank"') && withClaude.includes("Open Claude with the prompt") && withClaude.includes("Copy the prompt") && withClaude.includes("Press send there"), withClaude.slice(0, 600));
  check("Claude connected: the email stays in Claude, Merlin never sees it; each shows for review", withClaude.includes("Merlin never sees it") && withClaude.includes("From Claude, review"));
  const none = panel(M.agentState([]));
  check("no agent connected: no link to Claude, the three steps to connect, Open Agent access, Check again", !none.includes("claude.ai/new") && none.includes("First, connect Claude to Merlin") && (none.match(/<li>/g) ?? []).length === 3 && none.includes("Copy your Merlin address") && none.includes("https://merlin.example/api/mcp") && none.includes("Add custom connector") && none.includes("Open Agent access") && none.includes('href="/?p=agent"') && none.includes("Check again"), none.slice(0, 500));
  const other = panel(M.agentState([{ name: "ChatGPT" }]));
  check("another agent connected: copy the prompt, no Claude link", !other.includes("claude.ai/new") && other.includes("Copy the prompt"));
  check("while it checks: no link yet", !panel(null).includes("claude.ai/new") && panel(null).includes("Checking your agents"));
  const bsrc = src("app/post/evidence/BuildForMe.tsx");
  check("nothing claims Claude runs without the member: it opens Claude, and the member presses send", !/Claude (is building|will build now|started)|we('ve| have) asked Claude/i.test(bsrc) && bsrc.includes("Press send there"));
  check("Build this for me sits at the top of the page and in the wizard", (ev.match(/<BuildForMeButton/g) ?? []).length >= 2 && ev.includes("buildForMe={"));
  answer = (c) => (c.url === "/api/agent" ? { json: { view: { apps: [{ name: "Claude", id: "x" }, { bad: 1 }] } } } : { json: {} });
  const ag = await api.agents();
  check("agents(): the connected agents from Agent access", !api.failed(ag) && ag.length === 1 && ag[0].name === "Claude" && calls.at(-1)!.url === "/api/agent");

  /* ----- the thin client ----- */
  answer = () => ({ json: { canUse: true, kept: 1, limit: 50, cases: [study("w1"), { junk: true }], tags: CATALOGUE, problems: [], motions: [], ai: { on: false, agreed: false } } });
  const bk = await api.bank();
  check("bank(): asks with reveal (names show on this page), the case studies and the tag catalogue", !api.failed(bk) && bk.cases.length === 1 && bk.cases[0].client.name === "Northwind Clinics" && bk.tags.tags.length === CATALOGUE.tags.length && calls.at(-1)!.body!.op === "list" && calls.at(-1)!.body!.reveal === true);
  answer = () => ({ status: 403, json: { error: "Evidence Bank is part of Close.", upgrade: "close" } });
  const l3 = await api.bank();
  check("an error comes back in its words, with the upgrade", api.failed(l3) && l3.error === "Evidence Bank is part of Close." && l3.upgrade === "close");
  answer = () => ({ status: 500, json: { error: "boom" } });
  const l4 = await api.list();
  check("a server error says so plainly, never its text", api.failed(l4) && !l4.error.includes("boom"));
  answer = (c) => ({ json: study("d9", { status: "draft", seatId: String(c.body!.seatId) }) });
  const dd = await api.draftFromSeat("e_nw");
  check("draftFromSeat: { op, seatId }, the case study back", !api.failed(dd) && dd.seatId === "e_nw" && calls.at(-1)!.body!.op === "draftFromSeat");
  answer = () => ({ json: { card: [] } });
  const cd = await api.card("r1", true);
  check("card: { op, id, on }", !api.failed(cd) && JSON.stringify(calls.at(-1)!.body) === JSON.stringify({ op: "card", id: "r1", on: true }));
  check("nothing in the client spends a credit", !/unlock|spend|confirm: true|credits?:/i.test(src("app/post/evidence/api.ts").replace(/\/\*[\s\S]*?\*\//g, "")));

  /* ----- draft on seat add, Your seats ----- */
  answer = (c) => ({ json: study(`d_${c.body!.seatId}`, { status: "draft", seatId: String(c.body!.seatId) }) });
  const n0 = calls.length;
  const none0 = await api.draftNewSeats(new Set(["e_nw"]), ["e_nw", "e_new"], false);
  check("draft on seat add: never without Close", none0.length === 0 && calls.length === n0);
  const fr = await api.draftNewSeats(new Set(["e_nw"]), ["e_nw", "e_new"], true);
  check("draft on seat add: a new seat starts its draft, once", fr.join(",") === "e_new" && calls.at(-1)!.body!.seatId === "e_new" && (await api.draftNewSeats(new Set(["e_nw"]), ["e_nw", "e_new"], true)).length === 0);
  const SE = await import("../app/post/evidence/SeatEvidence");
  check("Your seats' column: Close in the new look only", SE.seatEvidenceOn(true, { canClose: true }) && !SE.seatEvidenceOn(true, { canClose: false }) && !SE.seatEvidenceOn(false, { canClose: true }));
  check("Your seats' column head", SE.seatCasesFill(null, ["a"], false) === "On the Close plan" && SE.seatCasesFill(new Map([["a", "ready"]]), ["a", "b"], true) === "1 of 2 case studies ready");
  const cell = renderToStaticMarkup(h(SE.SeatCaseCell, { seatId: "e_nw", status: undefined, page: "seats", openPage: () => {}, name: "Northwind Clinics" }));
  const ready = renderToStaticMarkup(h(SE.SeatCaseCell, { seatId: "e_nw", status: "ready", page: "seats", openPage: () => {}, name: "Northwind Clinics" }));
  check("a seat without a ready case study: Finish its case study; with one: Case study ready, Open it", cell.includes("Finish its case study") && ready.includes("Case study ready") && ready.includes("Open it"));
  const O = await import("../app/post/evidence/open");
  let opened = "";
  O.openEvidence({ page: "seats", openPage: (p) => (opened = p) }, "e_nw");
  check("Finish its case study opens Evidence Bank at that seat, once, where its tile opens in place", opened === "evidence" && O.takeEvidenceSeat() === "e_nw" && O.takeEvidenceSeat() === null && ev.includes("const seat = takeEvidenceSeat()") && ev.includes("setEditing({ id: r.id })"));

  /* ----- plain words ----- */
  const all = files.map((f) => src(join("app/post/evidence", f))).join("\n");
  const strings = (all.match(/"[^"\n]{3,}"|`[^`\n]{3,}`|>[^<>{}\n]{3,}</g) ?? []).join("\n");
  check("no export, CSV or download anywhere on the page", !/Export|Download|\bCSV\b|\.csv|PDF/.test(strings.replace(/ExportProof|ExportPanel/g, "")), strings.match(/.*(Export|Download|CSV|PDF).*/)?.[0]);
  check("on a phone, Still going stays on one line beside or under the month, and no 28px box squeezes it or the two switches", /\.ev-endrow \.ev-check \{[^}]*flex-wrap: nowrap;[^}]*white-space: nowrap;/.test(src("app/post/evidence/evidence.css")) && /\.ev-endrow \.input \{[^}]*min-width: 0;/.test(src("app/post/evidence/evidence.css")) && !/\.ev-phone \.ev-check \{[^}]*width: 28px/.test(src("app/post/evidence/evidence.css")));
  check("no volt: nothing on Evidence Bank earns a credit", !all.includes("btn-volt") && !src("app/post/evidence/evidence.css").includes("--volt"));
  check("fractional words, not generic AI words", !M.NOT_OUR_WORDS.test(strings), strings.match(new RegExp(`.*${M.NOT_OUR_WORDS.source}.*`, "i"))?.[0]);
  check("case studies, never 'evidence case' in what the member reads", !/evidence case|New case(?! study)|case library/i.test(strings), strings.match(/.*(evidence case|New case(?! study)|case library).*/i)?.[0]);
  check("Claude is only the member's own agent: never Anthropic, never Merlin's writing", !/Anthropic|Merlin's AI is Claude|Claude wrote|written by Claude/i.test(strings));
  check("no exclamation marks and no em dashes in the words", !/![ "<`]|—/.test(strings.replace(/!==?|!\w|!\(|!!/g, "")), strings.match(/.*(![ "<`]|—).*/)?.[0]);
  check("the right-side navigator is gone", !files.includes("Panels.tsx") && !files.includes("Builder.tsx"));
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
