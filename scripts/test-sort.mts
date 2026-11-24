/**
 * Checks of click-to-sort (app/ui/sortCore.ts, app/ui/sortable.tsx, app/post/rowSort.ts): every
 * data table sorts by any header, both ways, the same way.
 *
 *   npx tsx scripts/test-sort.mts      exits 1 on any failure
 *
 * No server, no network, no seed: made-up rows only (companies Northwind Clinics, Cedar and Pine,
 * Halcyon Freight, Larkspur Learning).
 *
 * Covered:
 *   - kinds: text A to Z first (case and accents aside, "Seat 2" before "Seat 10"), numbers high to
 *     low first, money on one scale ("$150/hr" against "$9,000/mo"), dates newest first (ISO,
 *     "2024-03", "Mar 2025");
 *   - the toggle: a first click takes the column's first way, a second reverses it, another column
 *     starts at its own first way, clear goes back to the list's own order, and the words say it;
 *   - blanks and locks last both ways, and a remembered column the table no longer has is ignored;
 *   - stable: ties keep the order the rows came in, both ways;
 *   - the row registry never sorts by a hidden value: a locked company's name, a locked rate, a
 *     locked decision maker read as blanks, and bands sort in their own order;
 *   - every table the brief lists draws its headers with SortHeader (or the workbench's sorter).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 600)}`);
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const S = await import("../app/ui/sortCore");
type R = { id: string; v: string | number | null | undefined };
const col = (kind: import("../app/ui/sortCore").SortKind) => ({ key: "v", kind, get: (r: R) => r.v });
const ids = (rows: R[]) => rows.map((r) => r.id).join(",");
const rows = (vals: (string | number | null | undefined)[]) => vals.map((v, k) => ({ id: String.fromCharCode(97 + k), v }));

/* ---------- kinds ---------- */
{
  const r = rows(["cedar and Pine", "Northwind Clinics", "Halcyon Freight", "Écru Labs", "Seat 10", "Seat 2"]);
  check("text sorts A to Z on the first click", S.firstDir("text") === "asc" && ids(S.sortByCol(r, col("text"), "asc")) === "a,d,c,b,f,e", ids(S.sortByCol(r, col("text"), "asc")));
  check("text reversed is Z to A", ids(S.sortByCol(r, col("text"), "desc")) === "e,f,b,c,d,a", ids(S.sortByCol(r, col("text"), "desc")));
}
{
  const r = rows([12, "1,200", "51-200", 3, "8k"]);
  check("numbers sort high to low on the first click", S.firstDir("number") === "desc" && ids(S.sortByCol(r, col("number"), "desc")) === "e,b,c,a,d", ids(S.sortByCol(r, col("number"), "desc")));
  check("numbers read 8k, 1,200 and a band's start", S.numberOf("8k") === 8000 && S.numberOf("1,200") === 1200 && S.numberOf("51-200") === 51 && S.numberOf("$1.5M") === 1_500_000);
}
{
  const r = rows(["$150/hr", "$9,000/mo", "$12k a month", "$95 an hour", "1 credit"]);
  // An hour each: 150, 9000/60 = 150, 12000/60 = 200, 95. "1 credit" is no rate: the tables pass null for it, here it reads as 1.
  const got = ids(S.sortByCol(r, col("money"), "desc"));
  check("money puts hourly and monthly on one scale, high to low", got === "c,a,b,d,e", got);
  check("money reads a monthly retainer as about 60 hours", S.moneyOf("$9,000/mo") === 150 && S.moneyOf("$150/hr") === 150);
}
{
  const r = rows(["2024-03", "2025-11-21T10:00:00Z", "Mar 2025", "2023-12-01", "Nov 21, 2025"]);
  const got = ids(S.sortByCol(r, col("date"), "desc"));
  check("dates sort newest first on the first click", S.firstDir("date") === "desc" && got === "b,e,c,a,d", got);
  check("dates reversed are oldest first", ids(S.sortByCol(r, col("date"), "asc")) === "d,a,c,e,b");
  check("a word that isn't a date is a blank", S.dateOf("Not yet") === null && S.dateOf("") === null);
}

/* ---------- the toggle, and the words ---------- */
{
  let state: import("../app/ui/sortCore").SortState | null = null;
  const store = { get state() { return state; }, set: (s: typeof state) => void (state = s) };
  const data = [
    { id: "n", name: "Northwind Clinics", rate: "$150/hr" },
    { id: "c", name: "Cedar and Pine", rate: "$12k/mo" },
    { id: "h", name: "Halcyon Freight", rate: null },
  ];
  const cols = [
    { key: "name", label: "Company" },
    { key: "rate", label: "Rate", kind: "money" as const },
  ];
  const at = () => S.sorterOf(data, cols, store);
  check("no click: the list's own order, no words", ids(at().rows as never) === "n,c,h" && at().key === null && at().words === null && at().ariaOf("name") === undefined);
  at().toggle("name");
  check("first click on text: A to Z", ids(at().rows as never) === "c,h,n" && at().dir === "asc" && at().ariaOf("name") === "ascending" && at().words === "Company, a to z");
  at().toggle("name");
  check("second click: reversed", ids(at().rows as never) === "n,h,c" && at().ariaOf("name") === "descending" && at().words === "Company, z to a");
  at().toggle("rate");
  check("another column starts at its own first way (money high to low)", ids(at().rows as never) === "c,n,h" && at().dir === "desc" && at().ariaOf("name") === undefined && at().words === "Rate, high to low");
  at().toggle("rate");
  check("reversed money keeps the blank last", ids(at().rows as never) === "n,c,h", ids(at().rows as never));
  at().clear();
  check("clear goes back to the list's own order", ids(at().rows as never) === "n,c,h" && state === null);
  state = { key: "gone", dir: "asc" };
  check("a remembered column the table no longer has is ignored", ids(at().rows as never) === "n,c,h" && at().key === null && !at().can("gone") && at().can("name"));
  at().toggle("nope");
  check("a header the table can't sort does nothing", state !== null && (state as { key: string }).key === "gone");
  state = null;
  const def = S.sorterOf(data, cols, store, { defaultKey: "rate" });
  check("a default sort shows before any click, at its first way", ids(def.rows as never) === "c,n,h" && def.key === "rate" && def.dir === "desc");
  check("direction words by kind", S.dirWords("text", "asc") === "A to Z" && S.dirWords("number", "desc") === "High to low" && S.dirWords("date", "desc") === "Newest first" && S.dirWords("date", "asc") === "Oldest first");
}

/* ---------- blanks and locks last, both ways ---------- */
for (const kind of ["text", "number", "money", "date"] as const) {
  const v = kind === "text" ? ["Larkspur Learning", "Cedar and Pine"] : kind === "date" ? ["2025-01", "2024-01"] : kind === "money" ? ["$200/hr", "$100/hr"] : [5, 9];
  const r = rows([null, v[0], undefined, "", v[1], "   "]);
  for (const dir of ["asc", "desc"] as const) {
    const got = S.sortByCol(r, col(kind), dir).map((x) => x.id);
    const tail = new Set(got.slice(2));
    check(`${kind} ${dir}: blanks and locks sort last`, got.slice(0, 2).every((x) => x === "b" || x === "e") && ["a", "c", "d", "f"].every((x) => tail.has(x)), got.join(","));
  }
}

/* ---------- stable ---------- */
{
  const r = rows(["Sales", "RevOps", "Sales", "Sales", "RevOps"]);
  check("ties keep their order, A to Z", ids(S.sortByCol(r, col("text"), "asc")) === "b,e,a,c,d");
  check("ties keep their order, Z to A", ids(S.sortByCol(r, col("text"), "desc")) === "a,c,d,b,e");
  const n = rows([2, 2, 1, 2]);
  check("ties keep their order on numbers both ways", ids(S.sortByCol(n, col("number"), "desc")) === "a,b,d,c" && ids(S.sortByCol(n, col("number"), "asc")) === "c,a,b,d");
  check("sorting never changes the rows given", ids(r) === "a,b,c,d,e");
}

/* ---------- the row registry never sorts by a hidden value ---------- */
{
  const RS = await import("../app/post/rowSort");
  const { RN_EMPLOYEES } = await import("../lib/tableFields");
  const cell = (v: string) => ({ s: "value" as const, v });
  const locked = { s: "locked" as const };
  const empty = { s: "empty" as const };
  const seat = (id: string, cells: Record<string, unknown>) => ({ id, cells, people: [], updatedAt: null });
  const co = (key: string, o: { name: string; hidden?: boolean; emp?: string; rate?: unknown; dm?: unknown }) => {
    const e = seat(`${key}-e`, { rate: o.rate ?? empty, start: cell("2024-06"), operator: empty, function: cell("Sales") });
    const people = o.dm ? [{ p: { id: `${key}-p`, cells: { name: o.dm, relationship: cell("Decision maker") } }, e: null }] : [];
    const c = { id: key, name: o.name, hidden: !!o.hidden, cells: { employees: o.emp ? cell(o.emp) : empty, industry: cell("Healthcare") }, friendly: { score: 1, fractional: 1, functions: [] }, engagements: [e], people: [] };
    return { key, i: { c, latest: e, engs: [e], fns: ["Sales"], people } } as never;
  };
  const list = [
    co("n", { name: "Northwind Clinics", emp: RN_EMPLOYEES[1], rate: cell("$150/hr"), dm: cell("Jordan Avery") }),
    co("x", { name: "Locked company", hidden: true, emp: RN_EMPLOYEES[3], rate: locked, dm: locked }),
    co("c", { name: "Cedar and Pine", emp: RN_EMPLOYEES[0], rate: cell("$9,000/mo"), dm: empty }),
  ];
  const sortBy = (id: string, dir?: "asc" | "desc") => {
    const s = RS.rowSortSpec(id)!;
    return S.sortByCol(list, { key: id, ...s }, dir ?? S.firstDir(s.kind)).map((r: { key: string }) => r.key).join(",");
  };
  check("a locked company's name never sorts: it goes last both ways", sortBy("company") === "c,n,x" && sortBy("company", "desc") === "n,c,x", [sortBy("company"), sortBy("company", "desc")]);
  check("a locked rate sorts last, the shown ones high to low on one scale (a tie keeps its order)", sortBy("rate") === "n,c,x", sortBy("rate"));
  check("a locked rate stays last reversed", sortBy("rate", "asc").endsWith(",x"));
  check("a locked decision maker and a blank one sort last", sortBy("decider").startsWith("n,"));
  check("company size sorts by its band's place, high to low", sortBy("employees") === "x,n,c", sortBy("employees"));
  check("every company column of the workbench has a sort", ["company", "heldBy", "seat", "fns", "industry", "employees", "revenue", "hq", "history", "rate", "decider", "email", "evidence"].every((id) => !!RS.rowSortSpec(id)));
  check("every seat column of the workbench has a sort", ["function", "role", "operator", "type", "status", "start", "end", "hours", "rate", "reason", "source", "posting"].every((id) => !!RS.rowSortSpec(id)));
  check("every people column of the workbench has a sort", ["name", "relationship", "email", "phone", "linkedin"].every((id) => !!RS.rowSortSpec(id)));
  check("a column with nothing to sort by (the action) has none", RS.rowSortSpec("act") === null && RS.rowSortSpec("what") === null);
}

/* ---------- every listed table uses the shared header ---------- */
{
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const read = (f: string) => readFileSync(path.join(root, f), "utf8");
  const header = [
    "app/post/Tables.tsx",
    "app/post/workbench/Workbench.tsx",
    "app/post/find/Find.tsx",
    "app/post/fractionals/FractionalsPage.tsx",
    "app/post/Fractionals.tsx",
    "app/post/contracts/ContractsPage.tsx",
    "app/post/evidence/Evidence.tsx",
    "app/post/rates/RatesPage.tsx",
    "app/post/Benchmarks.tsx",
    "app/post/credits/CreditsUsage.tsx",
    "app/post/Credits.tsx",
    "app/post/seatsPage/YourSeats.tsx",
    "app/post/alerts/Alerts.tsx",
    "app/post/alerts/Workflows.tsx",
    "app/post/agent/AgentAccess.tsx",
    "app/post/Admin.tsx",
    "app/post/AdminHealth.tsx",
    "app/post/AdminJobs.tsx",
  ];
  for (const f of header) check(`${f} draws its headers with SortHeader`, /<SortHeader\b/.test(read(f)));
  // The workbench's pages hand it the sorter, built on the whole list before it is cut to a page.
  const wb = ["app/post/workbench/CompaniesWorkbench.tsx", "app/post/hiring/HiringNow.tsx", "app/post/crystal/CrystalBall.tsx", "app/post/network/WarmPaths.tsx", "app/post/people/People.tsx", "app/post/pipeline/Board.tsx", "app/post/seatsPage/SeatsData.tsx", "app/post/rates/RatesPage.tsx"];
  for (const f of wb) {
    const src = read(f);
    const uses = (src.match(/<Workbench\b/g) ?? []).length;
    const sorters = (src.match(/\bsorter=\{/g) ?? []).length;
    check(`${f}: every workbench table gets a sorter`, uses > 0 && sorters >= uses, { uses, sorters });
  }
  check("the old tables' list sorts by its headers before the page is cut", /useSort\(sortedLive, headCols/.test(read("app/post/TradingPost.tsx")) && /sorter=\{colSort\}/.test(read("app/post/TradingPost.tsx")));
  // A real button, aria-sort on the header, the arrow, 44px on phones, and the storage kept safe.
  const ui = read("app/ui/sortable.tsx");
  const css = read("app/ui/sortable.css");
  check("the header is a real button with aria-sort", /<button type="button" className=\{`sh-btn/.test(ui) && /aria-sort=\{aria\}/.test(ui));
  check("the choice is kept per table, every storage call in try/catch", /localStorage\.getItem/.test(ui) && (ui.match(/try \{/g) ?? []).length >= 2);
  check("44px touch target on phones, a faint arrow on hover", /min-height: 44px/.test(css) && /\.sh-btn:hover \.sh-arrow/.test(css));
  // Skipped on purpose: layout tables and the Proposals list being rebuilt.
  check("the Proposals list is left for its rebuild", !/SortHeader/.test(read("app/post/proposalsPage/ProposalsHome.tsx")));
  check("Connections is left as it is", !/SortHeader/.test(read("app/post/settings/Connections.tsx")));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
