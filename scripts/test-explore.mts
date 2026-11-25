/**
 * The landing page's Explore answer (owner review M3): what each tab counts, how the counts relate,
 * and the words that say so (app/landing/explore.ts, Finder.tsx). lib/preview.ts runs in process on a
 * made-up seed in a temporary data dir, with fetch replaced, so nothing leaves the machine.
 *
 *   npx tsx scripts/test-explore.mts      exits 1 on any failure
 *
 * The seed for Technology: one company with a fractional CTO seat whose holder is on file, one with
 * an open CTO role and a past CTO seat, one with only an open CTO role, three that hired fractionals
 * in other functions and no CTO (no known CTO), and one with nothing hired. Checked: the "CTO seat or
 * role" count is the companies with a Technology seat or role on file, Hiring now is part of it, No
 * fractional CTO yet are other companies (none in the first), the rows of each tab are the companies
 * of that population, no tab is called All and no count is drawn as a total of the others, and the
 * line under the tabs names the scope (function, industry, country) and how the counts relate.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-explore-"));
const DAY = 86_400_000;
const t0 = Date.now();
const ago = (ms: number) => new Date(t0 - ms).toISOString();
const co = (id: string, name: string, extra: Record<string, string> = {}) => ({
  id,
  fields: { name, website: `${id.slice(2)}.example`, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX", ...extra },
});
const seat = (id: string, companyId: string, fields: Record<string, string>) => ({ id, companyId, verified: false, fields: { source: "Seat scan", type: "Fractional", ...fields } });
const seed = {
  builtAt: ago(30 * DAY),
  members: [{ id: "mem_x", name: "Xavi Explore", email: "x.explore@example.com", title: "Fractional CTO", token: "tok-x-explore" }],
  companies: [
    co("c_ctoheld", "Ctoheld Systems"),
    co("c_ctoboth", "Ctoboth Labs"),
    co("c_ctoopen", "Ctoopen Data"),
    co("c_mktonly", "Mktonly Brands"),
    co("c_finonly", "Finonly Freight", { hq: "Toronto, ON, Canada" }),
    co("c_salesonly", "Salesonly Health"),
    co("c_nothing", "Nothing Hired Co"),
  ],
  engagements: [
    seat("e_ctoheld", "c_ctoheld", { function: "Technology", role: "Fractional CTO", status: "Active", start: "2025-02", end: "Ongoing", operator: "Hana Holdername" }),
    seat("e_ctoboth_past", "c_ctoboth", { function: "Technology", role: "Fractional CTO", status: "Ended", start: "2023-01", end: "2024-01" }),
    seat("e_ctoboth_open", "c_ctoboth", { source: "Demand scan", function: "Technology", role: "Fractional CTO", status: "Open role", type: "" }),
    seat("e_ctoopen", "c_ctoopen", { source: "Demand scan", function: "Technology", role: "Fractional CTO", status: "Open role", type: "" }),
    seat("e_mkt", "c_mktonly", { function: "Marketing", role: "Fractional CMO", status: "Active", start: "2025-03", end: "Ongoing" }),
    seat("e_fin", "c_finonly", { function: "Finance", role: "Fractional CFO", status: "Active", start: "2025-04", end: "Ongoing" }),
    seat("e_sales", "c_salesonly", { function: "Sales", role: "Fractional VP Sales", status: "Ended", start: "2024-01", end: "2024-09" }),
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(path.join(dir, "intel.json"), JSON.stringify({ ledger: [], values: {}, unlocks: {}, seen: {}, profiles: {} }));
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
});
for (const k of ["RN_BILLING", "STRIPE_SECRET_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_PREVIEW_OPEN_ROLE_COMPANIES"]) delete process.env[k];
globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};

async function main() {
  const { preview } = await import("../lib/preview");
  const X = await import("../app/landing/explore");

  /* ---------- the populations, from lib/preview.ts ---------- */
  console.log("What each tab counts (Technology)");
  const [all, hiring, notyet] = await Promise.all((["all", "hiring", "notyet"] as const).map((view) => preview({ fn: "Technology", view })));
  const c = all.counts;
  check("CTO seat or role: the 3 companies with a Technology seat or open role on file", c.all === 3, c);
  check("Hiring now: the 2 with an open CTO role, part of the first", c.hiring === 2 && c.hiring <= c.all, c);
  check("No fractional CTO yet: the 3 that hired fractionals in other functions, none for CTO", c.notYet === 3, c);
  check("the company with nothing hired is in none of them", c.all + c.notYet === 6 && c.anyHire === 5, c);
  check("who held a CTO seat is on file at 1 company", c.holders === 1, c);
  const names = (a: typeof all) => new Set(a.rows.map((r) => r.company?.name ?? r.seed));
  const nAll = names(all);
  const nHiring = names(hiring);
  const nNot = names(notyet);
  check("the first tab's rows are its population (one row a company)", nAll.size === 3 && all.total === 3, [...nAll]);
  check("Hiring now's rows are all in the first tab", [...nHiring].every((n) => nAll.has(n)) && nHiring.size === 2, [...nHiring]);
  check("No fractional CTO yet's rows are other companies: none in the first", [...nNot].every((n) => !nAll.has(n)) && nNot.size === 3, [...nNot]);
  check("the first and the third are separate groups: with the one company that hired nobody they are every company", c.all + c.notYet + 1 === seed.companies.length, c);

  /* ---------- the words ---------- */
  console.log("\nThe words (app/landing/explore.ts)");
  check("no tab is called All: the first names its population", X.viewLabel("all", "Technology") === "CTO seat or role" && X.viewLabel("all", "Sales") === "Sales leader seat or role" && X.viewLabel("hiring", "Technology") === "Hiring now" && X.viewLabel("notyet", "Technology") === "No fractional CTO yet");
  const line = X.populationLine(c, "Technology", null, null);
  check("the line under the tabs names the scope and each population, and how they relate", line === "In Technology, any industry, any country: 3 companies have a CTO seat or role on file, 2 of them hiring now. 3 other companies hired fractionals in other functions and no CTO yet.", line);
  check("with a mix picked, the scope says it", X.populationLine({ all: 1, hiring: 0, notYet: 0 }, "Finance", "SaaS", "Canada") === "In Finance, SaaS, Canada: 1 company has a CFO seat or role on file, 0 of them hiring now.");
  check("the M3 example reads as two populations, never All and a part of it", /2,123 companies have a CTO seat or role on file, 41 of them hiring now\. 17,301 other companies hired fractionals in other functions and no CTO yet\.$/.test(X.populationLine({ all: 2123, hiring: 41, notYet: 17301 }, "Technology", null, null)));
  const plain = (s: string) => !/—/.test(s) && !/\b(insights?|leverage|seamless|empower|actionable)\b/i.test(s) && !/%/.test(s);
  check("plain words: no em dash, AI words or percentages", [line, X.viewLabel("all", "Technology")].every(plain));

  /* ---------- the page ---------- */
  const finder = readFileSync(path.join(process.cwd(), "app/landing/Finder.tsx"), "utf8");
  check("Finder draws the tabs with these names and the line under them, each tab described by it", /import \{ populationLine, seatNoun, viewLabel \} from "\.\/explore";/.test(finder) && /<p className="lp-res-pop" id=\{`\$\{id\}-pop`\}>\s*\{populationLine\(c, shownFn, industry \|\| null, country \|\| null\)\}/.test(finder) && /aria-describedby=\{c \? `\$\{id\}-pop` : undefined\}/.test(finder));
  check("Finder says no 'All' and draws no sum of the tabs", !/"All"|Try All/.test(finder) && !/c\.all \+ c\.notYet|notYet \+ c\.all/.test(finder));
  check("the scope chips (function, industry, country) stay right above the tabs", /<p className="lp-res-scope">[\s\S]{0,400}<div className="lp-tabs" role="tablist"/.test(finder) || /lp-res-scope[\s\S]*lp-tabs/.test(finder));

  console.log(`\n${passes} passed, ${failures} failed`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.log("FAIL threw:", e);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
