/**
 * Checks of Lookalikes (app/post/find/lookalikes.ts and Filters.like in app/post/model.ts): the
 * profile from seed companies, ranking by traits shared with "why it matched", seeds and pipeline
 * companies left out, the profile round-trips in an address (so a saved list lists the same), the
 * starter list, and the no-seeds case. Made-up companies only.
 *
 *   npx tsx scripts/test-lookalikes.mts
 */
import type { Cell, CompanyRec, EngagementRec, Me } from "../lib/tableTypes";
import { GROUPS } from "../lib/tableFields";
import { EMPTY_FILTERS, applyFilters, decodeFilters, deriveAll, encodeFilters, rowsFor, setFilterSets, activeChips } from "../app/post/model";
import { defaultSeeds, likeCriteria, lookalikesFor, profileOf, profileWords, rankLike, seedMatches, traitChips, withoutTrait } from "../app/post/find/lookalikes";
import { starterLists } from "../app/post/find/lists";
import { ask } from "../lib/ask";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail)}`.slice(0, 600)}`);
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const val = (v: string): Cell => ({ s: "value", v, ver: 0 }) as Cell;
const EMPTY: Cell = { s: "empty" };
let n = 0;
function eng(fn: string, extra: Partial<EngagementRec> = {}, status = "Ended"): EngagementRec {
  const all: Record<string, Cell> = {};
  for (const f of GROUPS.find((g) => g.entity === "engagement")!.fields) if (!f.system) all[f.key] = EMPTY;
  return { id: `e${++n}`, source: "Published engagement", verified: false, cells: { ...all, function: val(fn), status: val(status), type: val("Fractional"), start: val("2025-01") }, people: [], updatedAt: null, yours: false, ...extra };
}
function co(name: string, f: { industry?: string; employees?: string; revenue?: string; hq?: string; fns?: string[]; mine?: boolean; hidden?: boolean; repeat?: boolean }): CompanyRec {
  const engs = (f.fns ?? []).map((fn, k) => eng(fn, k === 0 && f.mine ? { yours: true } : {}));
  return {
    id: `c_${name.toLowerCase().replace(/\W+/g, "_")}`,
    name: f.hidden ? "Locked company" : name,
    iconDomain: null,
    ...(f.hidden ? { hidden: true } : {}),
    cells: { website: EMPTY, industry: f.industry ? val(f.industry) : EMPTY, employees: f.employees ? val(f.employees) : EMPTY, revenue: f.revenue ? val(f.revenue) : EMPTY, hq: f.hq ? val(f.hq) : EMPTY, linkedin: EMPTY, about: EMPTY },
    friendly: { score: f.repeat ? 70 : 30, tier: "Medium", fractional: f.repeat ? 2 : engs.length, open: 0, functions: f.repeat ? ["Sales", "Marketing"] : (f.fns ?? []), operators: 0, recent: 0 },
    engagements: engs,
    people: [],
    following: false,
    facts: { known: 0, locked: 0, missing: 0 },
    updatedAt: null,
    mine: false,
  } as unknown as CompanyRec;
}

const companies = [
  // The member's past clients (their seats).
  co("Northwind Clinics", { industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX", fns: ["Sales"], mine: true }),
  co("Cedar and Pine", { industry: "SaaS", employees: "51–200", revenue: "$20M–$50M", hq: "Dallas, TX", fns: ["Sales", "Marketing"], mine: true }),
  // Others.
  co("Halcyon Freight", { industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Houston, TX", fns: ["Sales"] }),
  co("Larkspur Learning", { industry: "SaaS", employees: "51–200", fns: ["Finance"] }),
  co("Quillmoor", { industry: "EdTech", employees: "1–10", revenue: "Under $1M", hq: "Boston, MA", fns: ["Finance"] }),
  co("Brightwater Labs", { industry: "SaaS", employees: "201–500", revenue: "$5M–$20M", hq: "Austin, TX", fns: ["Sales"], hidden: true }),
  co("Fernhill Software", { industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX", fns: ["Sales"] }),
];
const infos = deriveAll(companies);
const me = { id: "m1", function: "Sales", icp: null, savedViews: [], benchRates: [], earnCap: 25 } as unknown as Me;

/* ---------- seeds and the profile ---------- */

const seeds = defaultSeeds(infos, me);
check("the default seeds are the member's own seat companies", same(seeds, ["c_northwind_clinics", "c_cedar_and_pine"]), seeds);
const seedInfos = infos.filter((i) => seeds.includes(i.c.id));
const tokens = profileOf(seedInfos);
check("the profile reads industry, size, revenue, region and the functions hired", ["i:SaaS", "e:51–200", "r:$5M–$20M", "r:$20M–$50M", "f:Sales", "f:Marketing"].every((t) => tokens.includes(t)) && tokens.some((t) => t.startsWith("g:")), tokens);
check("the seeds are in the profile, to be left out", tokens.includes("x:c_northwind_clinics") && tokens.includes("x:c_cedar_and_pine"));
check("repeat hirer only when most seeds are one", !tokens.includes("rep"));
const words = profileWords(tokens);
check("the profile in words", /^Built from 2 past clients: SaaS, \$5M to \$50M, 51 to 200 people, Texas, hired Sales or Marketing\.$/.test(words), words);
check("each trait is a chip", same(traitChips(tokens).map((c) => c.k), ["industry", "revenue", "employees", "region", "fns"]));

/* ---------- matching and ranking ---------- */

const look = lookalikesFor(infos, me);
const ids = look.ranked.map((x) => x.row.i.c.id);
check("seeds are never listed", !ids.includes("c_northwind_clinics") && !ids.includes("c_cedar_and_pine"), ids);
check("a company sharing fewer than 3 traits is not listed", !ids.includes("c_quillmoor") && !ids.includes("c_larkspur_learning"), ids);
check("the closest come first", ids[0] === "c_halcyon_freight" || ids[0] === "c_fernhill_software", ids);
check("a locked company matches by its free facts and is never named", ids.includes("c_brightwater_labs") && look.ranked.find((x) => x.row.i.c.id === "c_brightwater_labs")!.row.i.c.name === "Locked company");
const top = look.ranked[0];
check("each row says why it matched", /^Same industry, revenue, size, region and functions hired$/.test(top.why), top.why);
check("and which past client it is like", top.like === "Northwind Clinics" || top.like === "Cedar and Pine", top.like);
check("ranked by traits shared, most first", look.ranked.every((x, k, a) => k === 0 || a[k - 1].shared.length >= x.shared.length));

setFilterSets({ pipeline: ["c_halcyon_freight"] });
const noPipe = lookalikesFor(infos, me).ranked.map((x) => x.row.i.c.id);
check("a company already in the pipeline is left out", !noPipe.includes("c_halcyon_freight") && noPipe.includes("c_fernhill_software"), noPipe);
setFilterSets({ pipeline: null });

const wider = withoutTrait(withoutTrait(withoutTrait(tokens, "revenue"), "region"), "fns");
const wideIds = applyFilters(rowsFor("companies", infos), { ...EMPTY_FILTERS, like: wider }, "all", "", me, true).rows.map((r) => r.i.c.id);
check("taking traits off widens the match", wideIds.includes("c_larkspur_learning") && !wider.some((t) => t.startsWith("r:") || t.startsWith("g:") || t.startsWith("f:")), wideIds);

const picked = lookalikesFor(infos, me, ["c_quillmoor"]);
check("seeds the member picks replace the default", picked.seeds.length === 1 && picked.tokens.includes("i:EdTech") && !picked.ranked.some((x) => x.row.i.c.id === "c_quillmoor"));
check("a seed to add is found by a name the member can see, never a locked one", seedMatches(infos, "fern", new Set()).map((i) => i.c.id).join() === "c_fernhill_software" && !seedMatches(infos, "locked", new Set()).length);

/* ---------- a saved list lists the same ---------- */

const f = { ...EMPTY_FILTERS, like: tokens };
const back = decodeFilters(encodeFilters(f));
check("the profile round-trips in the address", same(back.like, tokens), back.like);
check("it is one chip in the table, and it clears", activeChips(f).some((c) => c.id === "like" && c.label === "Like your past clients") && activeChips(f).find((c) => c.id === "like")!.clear(f).like.length === 0);
const rowsTable = applyFilters(rowsFor("companies", infos), back, "all", "", me, true).rows.map((r) => r.i.c.id).sort();
check("the table lists the same companies as Find", same(rowsTable, [...ids].sort()), [rowsTable, ids]);
check("ranking keeps every row it is given", rankLike(rowsFor("companies", infos), tokens).length === infos.length);
const crit = likeCriteria(tokens);
check("the list's weekly email follows its industries, sizes and functions", same(crit.industry, ["SaaS"]) && same(crit.employees, ["51–200"]) && same(crit.functions, ["Sales", "Marketing"]), crit);

/* ---------- the starter list, and no seeds ---------- */

const starters = starterLists(me, infos);
check("'Like your past clients' is a starter once the member has a seat", starters.some((s) => s.key === "like" && s.name === "Like your past clients"), starters.map((s) => s.key));
const newcomer = deriveAll(companies.filter((c) => !c.engagements.some((e) => e.yours)));
const none = lookalikesFor(newcomer, me);
check("no seats: no profile and nothing listed", none.seeds.length === 0 && none.tokens.length === 0 && none.ranked.length === 0);
check("no seats: the words say so", profileWords([]) === "No past clients picked yet.");
check("no seats: no starter", !starterLists(me, newcomer).some((s) => s.key === "like"));
check("no profile matches nothing (never every company)", applyFilters(rowsFor("companies", infos), { ...EMPTY_FILTERS, like: ["x:c_quillmoor"] }, "all", "", me, true).rows.length === 0);
check("Ask reads 'more like my past clients' as Lookalikes", ask("Find more like my past clients", { myFn: "Sales" }).kind === "lookalikes");

console.log(`\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
