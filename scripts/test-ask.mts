/**
 * Checks of Ask Merlin as rules (lib/ask.ts): phrases to filters, a page and a kind; the words it
 * doesn't know come back; a company is never guessed from part of a name; the cleaner keeps only
 * values from our lists (the AI path's answer goes through it too); a chip comes off on its own.
 * Also the saved list fields on saved views (lib/hunt.ts, lib/mcp/alerts.ts): an old view reads its
 * alert from its weekly email, an alert turned off stops the weekly email, a list's columns and kind
 * round-trip.
 *
 *   npx tsx scripts/test-ask.mts
 *
 * Pure: no seed, no state, no network.
 */
import { ask, cleanAskPlan, emptyPlan, withoutChip, type AskPlan } from "../lib/ask";
import { savedViewAction, savedViewsOut, listOf } from "../lib/hunt";
import { alertOf, slackOn, type SavedSearch } from "../lib/mcp/alerts";
import { EMPTY_FILTERS, activeChips, activeCount, decodeFilters, encodeFilters, endedTest, signalTest, type Filters } from "../app/post/model";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 600)}`);
};
const V = { myFn: "Sales", hasIcp: true };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const SOFTWARE = ["SaaS", "Enterprise Software", "SMB Software", "Developer Tools"];
const show = (p: AskPlan) => ({ page: p.page, kind: p.kind, f: p.filters, unknown: p.unknown, company: p.company, sort: p.sort, cols: p.cols });

/* ---------- 1. phrases to filters ---------- */

{
  const p = ask("Companies where a fractional CRO just left", V);
  check("a CRO who just left: Find, Sales, a seat ended in the last 90 days", p.page === "find" && same(p.filters, { fn: ["Sales"], endedWithin: 3 }) && !p.unknown.length, show(p));
  check("it explains each chip in plain words", same(p.explain, ["Function: Sales", "A seat ended in the last 90 days"]), p.explain);
  check("and where it lands", p.where === "Find, companies, with 2 filters set", p.where);
}
{
  const p = ask("SaaS companies of 11 to 500 people with no fractional sales leader yet", V);
  check("software, 11 to 500 people, no fractional Sales yet", same(p.filters.industry, SOFTWARE) && same(p.filters.employees, ["11–50", "51–200", "201–500"]) && p.filters.notMine === true && !p.unknown.length, show(p));
  check("Software reads as one chip, the size as a range", p.explain.includes("Industry: Software (all)") && p.explain.includes("Size: 11 to 500 people"), p.explain);
}
{
  const p = ask("SaaS companies under 500 people that hired a fractional sales leader and are hiring again", V);
  check("hired a Sales leader and hiring again", same(p.filters.hiredFn, ["Sales"]) && p.filters.hiringNow === true && same(p.filters.employees, ["1–10", "11–50", "51–200", "201–500"]) && !p.filters.fn, show(p));
}
{
  const p = ask("Who is hiring a fractional sales leader right now?", V);
  check("who is hiring: Hiring now, filtered to Sales", p.page === "hiring" && p.kind === "roles" && same(p.filters, { fn: ["Sales"], hiringNow: true }) && p.where === "Hiring now, filtered to Sales", show(p));
}
{
  const p = ask("What should I charge a $20M SaaS company?", V);
  check("what to charge: Rate benchmarks, with their function, software and the band $20M falls in", p.page === "rates" && same(p.filters.fn, ["Sales"]) && same(p.filters.revenue, ["$20M–$50M"]) && same(p.filters.industry, SOFTWARE), show(p));
}
check("how do credits work: Credits and usage", ask("How do credits work?", V).page === "credits");
check("draft a proposal from today's call: Proposals", ask("Draft a proposal from today's call", V).page === "proposals" && !ask("Draft a proposal from today's call", V).unknown.length, show(ask("Draft a proposal from today's call", V)));
check("who needs a follow-up: the pipeline", ask("Who needs a follow-up today?", V).page === "pipeline" && !ask("Who needs a follow-up today?", V).unknown.length);
check("Crystal Ball by name", ask("open my crystal ball", V).page === "radar");
{
  const p = ask("Repeat hirers I already have a way into", V);
  check("repeat hirers I have a way into", same(p.filters, { repeatHirer: true, wayIn: true }) && !p.company && !p.unknown.length, show(p));
}
{
  const p = ask("Find SaaS companies that just lost a fractional CRO, and show me who I know there", V);
  check("lost a CRO, and who I know there: a filter set and a column", p.filters.endedWithin === 3 && same(p.filters.fn, ["Sales"]) && same(p.cols, ["wayIn"]) && !p.filters.wayIn, show(p));
}
{
  const p = ask("fintech $5M-$50M in Texas hired a CFO in the last 6 months", V);
  check("revenue range, a state, a hire with its window", same(p.filters.revenue, ["$5M–$20M", "$20M–$50M"]) && same(p.filters.region, ["Texas"]) && same(p.filters.country, ["United States"]) && same(p.filters.hiredFn, ["Finance"]) && p.filters.hiredWithin === 6, show(p));
}
{
  const p = ask("CRO seats that ended this quarter", V);
  check("seats that ended this quarter: the Seats kind, 3 months", p.kind === "seats" && p.filters.endedWithin === 3 && same(p.filters.fn, ["Sales"]), show(p));
}
{
  const p = ask("Deciders at health care companies over 1,000 employees", V);
  check("deciders: People, decision makers, over 1,000 employees", p.kind === "people" && same(p.filters.relationship, ["Decision maker"]) && same(p.filters.employees, ["1,001+"]) && same(p.filters.industry, ["Health Care"]), show(p));
}
{
  const p = ask("US companies that are hiring a fractional sales leader right now", V);
  check("US and hiring now stays on Find (more than a function)", p.page === "find" && same(p.filters.country, ["United States"]) && p.filters.hiringNow === true, show(p));
}
check("the ideal client", ask("Show me companies that fit my ideal client", V).filters.icp === true);
check("the ideal client is not set for a member without one", !ask("Show me companies that fit my ideal client", { myFn: "Sales", hasIcp: false }).filters.icp);
check("biggest first is a sort", ask("biggest fintech companies", V).sort === "employees");
check("fractionals is a kind", ask("fractionals who serve health care", V).kind === "fractionals");
check("product led is a motion, not the Product function", same(ask("product led software companies", V).filters.motion, ["PLG"]) && !ask("product led software companies", V).filters.fn);
check("dashes and money words read the same", same(ask("$5 million to $20 million revenue", V).filters.revenue, ["$5M–$20M"]) && same(ask("$5m-$20m", V).filters.revenue, ["$5M–$20M"]));
check("an empty text is an empty plan", emptyPlan(ask("", V)) && emptyPlan(ask("   ", V)));

/* ---------- 2. unknown words come back, never a guessed company ---------- */

{
  const p = ask("companies like Larkspur with great vibes", V);
  check("words it doesn't know come back as typed", same(p.unknown, ["Larkspur", "great", "vibes"]), p.unknown);
  check("and no company is guessed from them", p.company === null && p.page === "find", show(p));
}
{
  const p = ask("Sales-led SaaS, hiring", V);
  check("a phrase with no filter yet is said back", p.unknown.includes("sales led") && same(p.filters.industry, SOFTWARE) && p.filters.hiringNow === true, show(p));
}
{
  const p = ask("product led software companies with no fractional marketing yet", V);
  check("no fractional X yet for another function than theirs is said back, not set", !p.filters.notMine && p.unknown.includes("no fractional marketing yet"), show(p));
}
check("a window with nothing to apply to is said back", ask("fintech roles posted in the last 7 days", V).unknown.some((w) => /last 7 days/.test(w)), ask("fintech roles posted in the last 7 days", V).unknown);
{
  const p = ask("Who can get me into Larkspur Learning?", V);
  check("a full name after 'get me into' is passed on as typed, for Warm paths", p.page === "warm" && p.company === "Larkspur Learning" && p.where === "Warm paths, for Larkspur Learning" && !p.unknown.length, show(p));
}
{
  const p = ask("brightloop.io", V);
  check("a website is a lookup, by that website", p.page === "lookup" && p.company === "brightloop.io", show(p));
  const q = ask("look up https://www.Cedar-and-Pine.example/about", V);
  check("a website is cleaned to its host", q.company === "cedar-and-pine.example", show(q));
}
{
  const p = ask("get me into software companies in Texas", V);
  check("'get me into' followed by our own words is a filter, not a name", p.company === null && same(p.filters.industry, SOFTWARE) && same(p.filters.region, ["Texas"]), show(p));
}
check("a lone capitalised word is never a company", ask("Northwind", V).company === null && same(ask("Northwind", V).unknown, ["Northwind"]));
check("part of a name in a sentence is never a company", ask("hiring companies like Halcyon", V).company === null && ask("hiring companies like Halcyon", V).unknown.includes("Halcyon"));

/* ---------- 3. the cleaner (the AI path's answer goes through it too) ---------- */

{
  const raw = {
    page: "find",
    kind: "companies",
    filters: { fn: ["sales", "Wizardry"], industry: ["saas", "Made up"], employees: ["11–50", "huge"], endedWithin: 999, hiringNow: "yes", icp: true, notMine: true },
    sort: "random",
    cols: ["wayIn", "ssn"],
    company: "<script>x</script>",
    unknown: ["a", "b"],
    chips: [{ id: "x", label: "Injected" }],
  };
  const p = cleanAskPlan(raw, V, true);
  check("the cleaner keeps only values on our lists, in their spelling", same(p.filters.fn, ["Sales"]) && same(p.filters.industry, ["SaaS"]) && same(p.filters.employees, ["11–50"]), p.filters);
  check("numbers are held in range, and only true is a yes", p.filters.endedWithin === 24 && p.filters.hiringNow === undefined && p.filters.icp === true, p.filters);
  check("unknown sorts and columns are dropped", p.sort === null && same(p.cols, ["wayIn"]));
  check("the chips are the cleaner's own, never the raw answer's", !p.explain.includes("Injected") && p.explain.includes("Function: Sales"), p.explain);
  check("a company name is plain text, and a company is a lookup", p.company === "script x/script" || (p.company !== null && !/[<>]/.test(p.company)), p.company);
  check("it says it came from the AI path", p.ai === true);
  check("a junk answer is an empty plan", emptyPlan(cleanAskPlan(null, V)) && emptyPlan(cleanAskPlan({ page: "nowhere", filters: "x" } as never, V)));
  check("no fractional X yet needs a function to be read", !cleanAskPlan({ filters: { notMine: true } }, { myFn: null }).filters.notMine);
}

/* ---------- 4. chips come off one at a time ---------- */

{
  const p = ask("SaaS companies of 11 to 500 people with no fractional sales leader yet", V);
  const q = withoutChip(p, "employees", V);
  check("taking off one chip keeps the others", !q.filters.employees && same(q.filters.industry, SOFTWARE) && q.filters.notMine === true && q.explain.length === p.explain.length - 1, q.explain);
  const w = withoutChip(ask("Who can get me into Larkspur Learning?", V), "company", V);
  check("taking off the company leaves Find with nothing set", w.company === null && w.page === "find");
  const r = withoutChip(ask("fintech in Texas", V), "region", V);
  check("taking off a state takes its country with it", !r.filters.region && !r.filters.country, r.filters);
}

/* ---------- 5. Find's new filter keys (app/post/model.ts) ---------- */

{
  const f: Filters = { ...EMPTY_FILTERS, endedWithin: 3, repeatHirer: true, wayIn: true };
  const back = decodeFilters(encodeFilters(f));
  check("the new keys round-trip in the address", back.endedWithin === 3 && back.repeatHirer && back.wayIn && !back.hiringNow, encodeFilters(f));
  check("an address from before them reads as before", same(decodeFilters("fn:Sales~icp"), { ...EMPTY_FILTERS, fn: ["Sales"], icp: true }));
  check("no new key shows in an old address", encodeFilters(EMPTY_FILTERS) === "" && encodeFilters({ ...EMPTY_FILTERS, fn: ["Sales"] }) === "fn:Sales");
  check("each is one active filter and one chip", activeCount(f) === 3 && activeChips(f).map((c) => c.id).join() === "endedWithin,repeatHirer,wayIn", activeChips(f).map((c) => c.id));
  check("a chip clears only its own key", activeChips(f)[0].clear(f).endedWithin === 0 && activeChips(f)[0].clear(f).repeatHirer);
  check("the ended window is held to 24 months", decodeFilters("endedWithin:500").endedWithin === 24);
  // A seat ended: by its end month on show, else when it was recorded.
  const now = Date.parse("2026-11-20T12:00:00Z");
  const eng = (end: { s: string; v?: string }, status: string, fn: string, updatedAt: string | null) =>
    ({ id: "e", cells: { status: { s: "value", v: status }, end, function: { s: "value", v: fn } }, people: [], updatedAt, yours: false, source: "x", verified: false }) as never;
  const row = (e: never) => ({ key: "r", i: { engs: [e] } as never, e }) as never;
  const t = endedTest(3, ["Sales"], now);
  check("an end month on show inside the window counts", t(row(eng({ s: "value", v: "2026-10" }, "Ended", "Sales", null))));
  check("an end month on show outside the window doesn't", !t(row(eng({ s: "value", v: "2025-10" }, "Ended", "Sales", "2026-11-01T00:00:00Z"))));
  check("a locked end counts by when the seat was recorded", t(row(eng({ s: "locked" }, "Ended", "Sales", "2026-10-15T00:00:00Z"))) && !t(row(eng({ s: "locked" }, "Ended", "Sales", "2026-01-15T00:00:00Z"))));
  check("only seats that ended, in the function asked for", !t(row(eng({ s: "value", v: "2026-10" }, "Active", "Sales", null))) && !t(row(eng({ s: "value", v: "2026-10" }, "Ended", "Finance", null))));
  check("way in and pipeline list nothing until the member's sets are here", !signalTest("wayIn")({ i: { c: { id: "c1" } } } as never) && !signalTest("inPipeline")({ i: { c: { id: "c1" } } } as never));
}

/* ---------- 6. saved lists: kind, columns, starter, the alert ---------- */

{
  const now = "2026-11-20T12:00:00.000Z";
  let n = 0;
  const id = () => `al_test000${n++}`;
  const legacy: SavedSearch = { id: "al_legacy01", name: "Old view", function: "Sales", createdAt: now, place: "v=all&t=companies&f=fn:Sales" };
  const off: SavedSearch = { ...legacy, id: "al_legacy02", name: "Quiet view", email: false, place: "v=all&t=companies&f=fn:Finance" };
  check("an old view reads its alert from its weekly email", same(alertOf(legacy), { on: true, triggers: ["role"], every: "weekly", email: true, slack: true, bell: true }) && alertOf(off).on === false);
  check("an old view keeps going to Slack, as every saved view did (its weekly email aside)", slackOn(legacy) && slackOn(off));
  check("a list with its alert off, or its Slack off, stays out of Slack", !slackOn({ alert: { on: false, every: "weekly", email: true, slack: true } }) && !slackOn({ alert: { on: true, every: "weekly", email: true, slack: false } }));
  const out = savedViewsOut([legacy, off]);
  check("Me.savedViews keeps every old field and adds the list fields", out[0].email === true && out[1].email === false && out[0].kind === null && same(out[0].cols, []) && out[0].starter === false && out[0].alert.on === true, out[0]);
  check("listOf reads a view from an older server", listOf({ id: "x", name: "x", place: null, criteria: {}, email: false, createdAt: now }).alert.on === false);
  const saved = savedViewAction([legacy], { op: "save", name: "Ended Sales seats", place: "v=all&t=seats&f=fn:Sales~endedWithin:3", criteria: { function: "Sales" }, list: { kind: "seats", cols: ["holder", "rate", "bad id!"], starter: true, alert: { on: true, email: false, slack: true } } }, id, now);
  const s = saved.list[1];
  check("a list saves its kind, columns and starter flag", s.kind === "seats" && same(s.cols, ["holder", "rate"]) && s.starter === true, s);
  check("a list's alert decides its weekly email", s.alert?.on === true && s.email === false && slackOn(s) && /Slack/.test(saved.message), [s, saved.message]);
  check("the list fields are not criteria", !("kind" in savedViewsOut([s])[0].criteria) && !("alert" in savedViewsOut([s])[0].criteria));
  const offAlert = savedViewAction(saved.list, { op: "alert", id: s.id, list: { alert: { on: false } } }, id, now);
  check("an alert turned off stops the weekly email too", offAlert.list[1].alert?.on === false && offAlert.list[1].email === false && /Alert off/.test(offAlert.message), offAlert.list[1]);
  const onAgain = savedViewAction(offAlert.list, { op: "alert", id: s.id, list: { alert: { on: true, email: true, slack: false } } }, id, now);
  check("turned on by email, the weekly email is on", onAgain.list[1].email === true && onAgain.list[1].alert?.slack === false && /by email each week/.test(onAgain.message), onAgain);
  const bare = savedViewAction(onAgain.list, { op: "alert", id: s.id, list: { alert: { on: true, email: false, slack: false, bell: false } } }, id, now);
  check("an alert on with no channel goes by email", bare.list[1].alert?.email === true && bare.list[1].email === true);
  const mailOff = savedViewAction(bare.list, { op: "email", id: s.id, on: false }, id, now);
  check("the old email switch still works on a list, and moves its alert", mailOff.list[1].email === false && mailOff.list[1].alert?.email === false && mailOff.list[1].alert?.on === false, mailOff.list[1]);
  const mailOld = savedViewAction([legacy], { op: "email", id: legacy.id, on: false }, id, now);
  check("on an old view the email switch is as before (no alert added)", mailOld.list[0].email === false && mailOld.list[0].alert === undefined);
  const cols = savedViewAction(bare.list, { op: "list", id: s.id, list: { cols: ["name", "wayIn"], kind: "companies", alert: { on: false } } }, id, now);
  check("the list op changes columns and kind, never the alert", same(cols.list[1].cols, ["name", "wayIn"]) && cols.list[1].kind === "companies" && cols.list[1].alert?.on === true);
  const opened = savedViewAction(cols.list, { op: "opened", id: s.id }, id, now);
  check("opened records when, and says nothing", opened.list[1].openedAt === now && opened.message === "");
  const restored = savedViewAction([legacy], { op: "restore", view: { ...savedViewsOut([s])[0], id: "al_restore1" }, at: 1 }, id, now);
  check("Undo after Remove puts a list back with its fields", restored.list[1].kind === "seats" && same(restored.list[1].cols, ["holder", "rate"]) && restored.list[1].alert?.slack === true && restored.list[1].email === false, restored.list[1]);
  let threw = false;
  try {
    savedViewAction([legacy], { op: "alert", id: "al_gone0000" }, id, now);
  } catch {
    threw = true;
  }
  check("an alert on a list that is gone says so", threw);
}

console.log(`\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
