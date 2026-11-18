#!/usr/bin/env node
/**
 * Checks of the seat scan (scripts/add-seat-scan.mjs) and of claiming its seats.
 *
 *   npx tsx scripts/test-seatscan.mts             (SEATSCAN_PORT=4598 by default)
 *
 * No private data: a made-up seed and a made-up seats CSV in a scratch folder, removed at the end.
 * Every person in the CSV has a made-up name, and none of those names may show up anywhere.
 *
 *  1. The script: rows kept and dropped (the fractional's own firm, a firm by its About text,
 *     full-time, a search for work, a seat already on file), companies matched by LinkedIn page,
 *     website, the company a website names, or name, and never overwritten, the mappings, seats
 *     keyed by an HMAC of seat_id (a first-batch seat keeps its id), no name, profile data or
 *     About text in the seed, and a second run that changes nothing.
 *  2. In process: the client's view of the table (packView/unpackView gives back the same view),
 *     the MCP tools (get_company says nobody holds the seat, add_my_seat with claim claims it),
 *     and the weekly scan's functions staying GTM-only.
 *  3. Over HTTP, against a server started here on the made-up seed: the seat holder cell is empty
 *     and claimable, can't be unlocked, confirmed, reported or filled with someone else's name,
 *     the seats count as fractional hires, a claim works once, earns nothing, and at most 3 a day,
 *     a claimed seat is a member seat like any other (on Your seats, locked for others at 1
 *     credit, its facts earn), "This isn't me" gives it back and refunds the unlock, an admin
 *     can remove a claim, and Pilot metrics lists the claims.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 400)}`);
};

/* ---------- a made-up seed and seats CSV ---------- */

const dir = mkdtempSync(path.join(tmpdir(), "tp-seatscan-"));
const seedPath = path.join(dir, "intel-seed.json");
const csvPath = path.join(dir, "seats.csv");
const seed = {
  builtAt: new Date().toISOString(),
  members: [{ id: "sm1", name: "Fixture Seedmember", email: "seedmember@example.com", title: "Fractional CMO", token: "seatscan-seed-token-1" }],
  companies: [
    { id: "c_northwindlabs", fields: { name: "Northwind Labs", website: "northwind.example.com", industry: "Health Care", employees: "51–200" } },
    // Matched by its LinkedIn page alone (the file names it differently, with no website).
    { id: "c_quarry", fields: { name: "Quarry Systems", linkedin: "linkedin.com/company/99001" } },
    // No website on file: a row whose website is mangofixture.com goes here (the company the domain names).
    { id: "c_mango", fields: { name: "Mangofixture" } },
    // A seat the first batch added, under the id it gave seats then.
    { id: "c_harbor", fields: { name: "Harbor Legacy Works", website: "harborlegacy.example.com" } },
  ],
  engagements: [
    { id: "e_northwind_pub", companyId: "c_northwindlabs", fields: { source: "Published engagement", operator: "Fixture Seedmember", role: "Fractional CMO", function: "Marketing", type: "Fractional", status: "Active", start: "2025-01" }, verified: false },
    { id: "e_ss_fxlegacy1", companyId: "c_harbor", fields: { source: "Seat scan", role: "Fractional COO", type: "Fractional", status: "Active", end: "Ongoing", start: "2024-04", function: "Operations" }, verified: false },
  ],
  contacts: [],
};
writeFileSync(seedPath, JSON.stringify(seed));

/** Made-up people. None of these may reach the seed, a view, an action result or the export. */
const PEOPLE = [
  "Zelda Quartermaine", "Orrin Featherstone", "Pella Vantongeren", "Quill Abernathy-Moss", "Rhea Ostrowski", "Sable Underhill", "Tobin Marchetti", "Yorick Halloran", "Wren Castellanos", "Ilse Brandvold",
  "Ximena Pettigrew", "Ulric Danforth", "Odalys Kerrigan", "Barnaby Wexford", "Cosima Rutledge", "Dashiell Ormsby", "Elspeth Vandermeer",
  "Fenwick Aldous", "Galatea Moorcroft",
];
const HEAD = "seat_id,person_name,person_sales_nav_id,seat_title,company_name,company_sales_nav_id,company_linkedin_url,function,role_category,is_gtm,role_type,start_month_est,end_month,is_current,tenure_months,person_location,country,source,source_query,captured_on,company_website,company_industry,company_employee_range,company_employee_count,company_rn_revenue_bucket,company_about,company_likely_fractional_provider";
/** A made-up seed key: the script keys seats by an HMAC of seat_id under it. */
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
const seatIdOf = (sid: string) => `e_ss_${createHmac("sha256", Buffer.from(TEST_KEY, "base64")).update(`seat-scan:${sid}`).digest("hex").slice(0, 20)}`;
const row = (o: Record<string, string>) =>
  HEAD.split(",").map((k) => {
    const v = o[k] ?? "";
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(",");
const base = { role_type: "Fractional", is_current: "TRUE", tenure_months: "7", person_location: "Springfield Fixtureville", country: "Fixtureland", source: "fixture source", source_query: "fixture query", captured_on: "2026-11-16" };
const rows = [
  // 1. At an existing company, matched by its website. Its industry stays as it was.
  { ...base, seat_id: "fx-aaa111", person_name: PEOPLE[0], person_sales_nav_id: "NAVPERSON0001", seat_title: "Fractional VP Marketing", company_name: "Northwind Laboratories", company_sales_nav_id: "NAVCO0001", company_linkedin_url: "https://www.linkedin.com/company/northwind-fixture", function: "Marketing", role_category: "Marketing", is_gtm: "TRUE", start_month_est: "2025-06", company_website: "https://www.northwind.example.com/about", company_industry: "Software Development", company_employee_range: "11-50", company_employee_count: "30", company_rn_revenue_bucket: "$5M-$20M" },
  // 2-3. A new company, two seats there.
  { ...base, seat_id: "fx-bbb222", person_name: PEOPLE[1], person_sales_nav_id: "NAVPERSON0002", seat_title: "Fractional CFO", company_name: "Bluefin Analytics", company_sales_nav_id: "NAVCO0002", company_linkedin_url: "https://www.linkedin.com/company/bluefin-fixture/", function: "Finance", role_category: "Non-GTM", is_gtm: "FALSE", start_month_est: "2026-02", company_website: "https://bluefin.example.com", company_industry: "Software Development", company_employee_range: "11-50", company_employee_count: "35", company_rn_revenue_bucket: "$1M-$5M" },
  { ...base, seat_id: "fx-ccc333", person_name: PEOPLE[2], person_sales_nav_id: "NAVPERSON0003", seat_title: "Fractional CRO", company_name: "Bluefin Analytics, Inc.", company_sales_nav_id: "NAVCO0002", company_linkedin_url: "", function: "Revenue Leadership", role_category: "Sales Leadership", is_gtm: "TRUE", start_month_est: "2025-11", company_website: "", company_industry: "", company_employee_range: "", company_employee_count: "", company_rn_revenue_bucket: "" },
  // 4-6. Three more companies, for the daily claim limit.
  { ...base, seat_id: "fx-ddd444", person_name: PEOPLE[3], person_sales_nav_id: "NAVPERSON0004", seat_title: "Fractional Head of People", company_name: "Corvid Freight", company_sales_nav_id: "NAVCO0003", company_linkedin_url: "https://www.linkedin.com/company/corvid-fixture", function: "People/HR", role_category: "Non-GTM", is_gtm: "FALSE", start_month_est: "2024-09", company_website: "corvid.example.com", company_industry: "Truck Transportation", company_employee_range: "51-200", company_employee_count: "", company_rn_revenue_bucket: "$20M-$50M" },
  { ...base, seat_id: "fx-eee555", person_name: PEOPLE[4], person_sales_nav_id: "NAVPERSON0005", seat_title: "Fractional RevOps Lead", company_name: "Dunmore Robotics", company_sales_nav_id: "NAVCO0004", company_linkedin_url: "", function: "Revenue Operations", role_category: "RevOps", is_gtm: "TRUE", start_month_est: "2025-03", company_website: "dunmore.example.com", company_industry: "Some Industry Nobody Maps", company_employee_range: "1001-5000", company_employee_count: "", company_rn_revenue_bucket: "" },
  { ...base, seat_id: "fx-fff666", person_name: PEOPLE[5], person_sales_nav_id: "NAVPERSON0006", seat_title: "Fractional CTO", company_name: "Ember Grove", company_sales_nav_id: "NAVCO0005", company_linkedin_url: "", function: "Technology", role_category: "Non-GTM", is_gtm: "FALSE", start_month_est: "", company_website: "embergrove.example.com", company_industry: "", company_employee_range: "", company_employee_count: "", company_rn_revenue_bucket: "" },
  // Dropped: the fractional's own firm.
  { ...base, seat_id: "fx-ggg777", person_name: PEOPLE[6], person_sales_nav_id: "NAVPERSON0007", seat_title: "Fractional CMO", company_name: "Solo Shop", function: "Marketing", role_category: "Marketing", is_gtm: "TRUE", start_month_est: "2025-01", company_employee_range: "1" },
  { ...base, seat_id: "fx-hhh888", person_name: PEOPLE[7], person_sales_nav_id: "NAVPERSON0008", seat_title: "Fractional CMO", company_name: "Self-employed", function: "Marketing", role_category: "Marketing", is_gtm: "TRUE", start_month_est: "2025-01" },
  { ...base, seat_id: "fx-iii999", person_name: `${PEOPLE[8]}, MBA`, person_sales_nav_id: "NAVPERSON0009", seat_title: "Fractional CMO", company_name: "Castellanos Growth Partners", function: "Growth", role_category: "Marketing", is_gtm: "TRUE", start_month_est: "2025-01" },
  { ...base, seat_id: "fx-jjj000", person_name: PEOPLE[9], person_sales_nav_id: "NAVPERSON0010", seat_title: "Fractional CMO", company_name: "Stealth Startup", function: "Marketing", role_category: "Marketing", is_gtm: "TRUE", start_month_est: "2025-01" },
  // Kept: the first batch's seat (its id stays), a company matched by LinkedIn page, one by the company its website names.
  { ...base, seat_id: "fx-legacy1", person_name: PEOPLE[10], person_sales_nav_id: "NAVPERSON0011", seat_title: "Fractional COO", company_name: "Harbor Legacy Works", function: "Operations", role_category: "Non-GTM", is_gtm: "FALSE", start_month_est: "2024-04", company_website: "harborlegacy.example.com" },
  { ...base, seat_id: "fx-kkk111", person_name: PEOPLE[11], person_sales_nav_id: "NAVPERSON0012", seat_title: "Fractional CRO", company_name: "Quarry Systems Group Holdings", company_linkedin_url: "https://www.linkedin.com/company/99001/", function: "Sales", role_category: "Sales Leadership", is_gtm: "TRUE", start_month_est: "2025-08" },
  { ...base, seat_id: "fx-lll222", person_name: PEOPLE[12], person_sales_nav_id: "NAVPERSON0013", seat_title: "Fractional Head of Growth", company_name: "Langtree", function: "Growth", role_category: "Marketing", is_gtm: "TRUE", start_month_est: "2025-09", company_website: "https://mangofixture.com" },
  // Dropped: the same seat as one on file (company, title, start), a firm by its About text, full-time, a search for work.
  { ...base, seat_id: "fx-mmm333", person_name: PEOPLE[13], person_sales_nav_id: "NAVPERSON0014", seat_title: "Fractional CMO", company_name: "Northwind Labs", function: "Marketing", role_category: "Marketing", is_gtm: "TRUE", start_month_est: "2025-01", company_website: "northwind.example.com" },
  { ...base, seat_id: "fx-nnn444", person_name: PEOPLE[14], person_sales_nav_id: "NAVPERSON0015", seat_title: "Fractional CMO", company_name: "Brightpath Partners", function: "Marketing", role_category: "Marketing", is_gtm: "TRUE", start_month_est: "2025-02", company_about: "Brightpath provides fractional CMOs to growing startups.", company_likely_fractional_provider: "TRUE" },
  { ...base, seat_id: "fx-ooo555", person_name: PEOPLE[15], person_sales_nav_id: "NAVPERSON0016", seat_title: "Chief Business Officer (Full-Time <- Fractional)", company_name: "Tallow Works", function: "Executive", role_category: "Non-GTM", is_gtm: "FALSE", start_month_est: "2024-02" },
  { ...base, seat_id: "fx-ppp666", person_name: PEOPLE[16], person_sales_nav_id: "NAVPERSON0017", seat_title: "Growth Leader | Available for Fractional CMO roles", company_name: "Juniper Fields", function: "Marketing", role_category: "Marketing", is_gtm: "TRUE", start_month_est: "2024-02" },
  // Outside GTM and below Director: dropped (the CFO, CTO, Head of People and COO rows above stay).
  { ...base, seat_id: "fx-qqq777", person_name: PEOPLE[17], person_sales_nav_id: "NAVPERSON0018", seat_title: "Fractional Bookkeeper", company_name: "Larkspur Dental", function: "Finance", role_category: "Non-GTM", is_gtm: "FALSE", start_month_est: "2025-05" },
  { ...base, seat_id: "fx-rrr888", person_name: PEOPLE[18], person_sales_nav_id: "NAVPERSON0019", seat_title: "Fractional Executive Assistant to the CEO", company_name: "Larkspur Dental", function: "Operations", role_category: "Non-GTM", is_gtm: "FALSE", start_month_est: "2025-05" },
];
writeFileSync(csvPath, [HEAD, ...rows.map(row)].join("\n") + "\n");

/** Strings from the CSV that must never be stored or shown. */
const FORBIDDEN = [...PEOPLE, ...PEOPLE.map((p) => p.toLowerCase()), "NAVPERSON", "NAVCO000", "Springfield Fixtureville", "Fixtureland", "fixture query", "fixture source"];
const leaks = (text: string) => FORBIDDEN.filter((x) => text.includes(x));

/* ---------- 1. the script ---------- */

console.log("\nThe script");
const runScript = () => spawnSync(process.execPath, [path.join(ROOT, "scripts", "add-seat-scan.mjs"), csvPath, "--seed", seedPath, "--no-seal"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, RN_INTEL_SEED_KEY: TEST_KEY } });
const first = runScript();
check("the script runs", first.status === 0, first.stderr);
const line = (out: string, re: RegExp) => out.match(re)?.[1];
check("19 rows read, 9 kept", line(first.stdout, /rows read: (\d+)/) === "19" && line(first.stdout, /kept: (\d+)/) === "9", first.stdout);
check("drops the one-person company", line(first.stdout, /dropped \(one-person company\): (\d+)/) === "1", first.stdout);
check("drops stand-in names (self-employed, stealth)", line(first.stdout, /dropped \(stand-in name[^)]*\)\): (\d+)/) === "2", first.stdout);
check("drops a company named after the person (credentials after the name aside)", line(first.stdout, /dropped \(company named after the person\): (\d+)/) === "1", first.stdout);
check("4 companies matched (LinkedIn page, website, the company its website names, a seat on file), 4 created", line(first.stdout, /companies matched: (\d+)/) === "4" && line(first.stdout, /companies created: (\d+)/) === "4" && /LinkedIn page 1/.test(first.stdout) && /the company its website names 1/.test(first.stdout), first.stdout);
check("8 seats added, the first batch's seat unchanged under its own id", line(first.stdout, /seats added: (\d+)/) === "8" && line(first.stdout, /unchanged: (\d+)/) === "1" && /\(1 keep the first batch's id\)/.test(first.stdout), first.stdout);
check("drops a seat already on file (same company, title and start)", line(first.stdout, /dropped \(same company, title and start as a seat on file\): (\d+)/) === "1", first.stdout);
check("drops a fractional firm by its About text", line(first.stdout, /dropped \(fractional firm, agency or marketplace[^)]*\)\): (\d+)/) === "1" && /Brightpath Partners/.test(first.stdout), first.stdout);
check("drops a full-time seat and a search for work", line(first.stdout, /dropped \(not fractional work \(title says full-time\)\): (\d+)/) === "1" && line(first.stdout, /dropped \(not a seat \(title is a search for work\)\): (\d+)/) === "1", first.stdout);
// The seat holders' countries are printed as counts (never stored); nothing else from the file about a person is printed.
check("prints no name", !leaks(first.stdout + first.stderr).filter((x) => x !== "Fixtureland").length, leaks(first.stdout));
check("countries are printed as counts only", /countries \(counted, never stored\), top 10: Fixtureland 19$/m.test(first.stdout), first.stdout);
check("outside GTM, a title below Director is dropped (an assistant to the CEO too); GTM keeps every level", line(first.stdout, /dropped \(outside GTM and below Director\): (\d+)/) === "2" && /top 15 titles: .*Fractional Bookkeeper 1/.test(first.stdout), first.stdout);
const after1 = readFileSync(seedPath, "utf8");
check("the seed holds no name, profile id, location or query from the file", !leaks(after1).length, leaks(after1));
const s1 = JSON.parse(after1);
const scanSeats = s1.engagements.filter((e: { fields: Record<string, string> }) => e.fields.source === "Seat scan");
check("no seat-scan seat has a seat holder or a private flag", scanSeats.every((e: { fields: Record<string, string> }) => !("operator" in e.fields) && !("privateHolder" in e)));
check("each seat is Fractional, Active, Ongoing", scanSeats.every((e: { fields: Record<string, string> }) => e.fields.type === "Fractional" && e.fields.status === "Active" && e.fields.end === "Ongoing"));
// "New hires this week" for saved views that follow hires (lib/hireAlerts.ts) reads this day; a seat on file before the run has none.
check(
  "a new seat carries the day it came into the table (addedAt), the seat on file before has none",
  scanSeats.filter((e: { id: string }) => e.id !== "e_ss_fxlegacy1").every((e: { addedAt?: string }) => Number.isFinite(Date.parse(e.addedAt ?? ""))) &&
    !scanSeats.find((e: { id: string; addedAt?: string }) => e.id === "e_ss_fxlegacy1")?.addedAt,
);
const fnOf = (sid: string) => scanSeats.find((e: { id: string }) => e.id === seatIdOf(sid))?.fields;
const seatOf = (id: string) => scanSeats.find((e: { id: string }) => e.id === id);
check("new seats are keyed by an HMAC of seat_id, never by the seat_id itself", scanSeats.filter((e: { id: string }) => e.id !== "e_ss_fxlegacy1").every((e: { id: string }) => /^e_ss_[0-9a-f]{20}$/.test(e.id)) && !/fx-?(aaa|bbb|ccc|kkk|lll)/.test(after1));
check("the first batch's seat keeps its id and is not added twice", seatOf("e_ss_fxlegacy1")?.companyId === "c_harbor" && !seatOf(seatIdOf("fx-legacy1")) && s1.engagements.filter((e: { companyId: string }) => e.companyId === "c_harbor").length === 1);
check("a company matched by its LinkedIn page alone keeps its name", seatOf(seatIdOf("fx-kkk111"))?.companyId === "c_quarry" && !s1.companies.some((c: { fields: Record<string, string> }) => /Holdings/.test(c.fields.name)));
check("a seat goes to the company its website names (and that company gets the website)", seatOf(seatIdOf("fx-lll222"))?.companyId === "c_mango" && s1.companies.find((c: { id: string }) => c.id === "c_mango")?.fields.website === "mangofixture.com" && !s1.companies.some((c: { fields: Record<string, string> }) => c.fields.name === "Langtree"));
check("no seat for the duplicate, the firm, the full-time seat or the search for work", !seatOf(seatIdOf("fx-mmm333")) && !seatOf(seatIdOf("fx-nnn444")) && !seatOf(seatIdOf("fx-ooo555")) && !seatOf(seatIdOf("fx-ppp666")) && !s1.companies.some((c: { fields: Record<string, string> }) => ["Brightpath Partners", "Tallow Works", "Juniper Fields", "Larkspur Dental"].includes(c.fields.name)));
check("the About text is read, not stored", !after1.includes("growing startups"));
check("functions map (Revenue Leadership -> Sales, People/HR -> People, Revenue Operations -> RevOps)",
  fnOf("fx-ccc333")?.function === "Sales" && fnOf("fx-ddd444")?.function === "People" && fnOf("fx-eee555")?.function === "RevOps" && fnOf("fx-bbb222")?.function === "Finance" && fnOf("fx-fff666")?.function === "Technology");
check("role and start come from the row; no start when the row has none", fnOf("fx-aaa111")?.role === "Fractional VP Marketing" && fnOf("fx-aaa111")?.start === "2025-06" && !fnOf("fx-fff666")?.start);
const co = (name: string) => s1.companies.find((c: { fields: Record<string, string> }) => c.fields.name === name);
const nw = co("Northwind Labs");
check("an existing company matched by website keeps its own values", nw?.fields.industry === "Health Care" && nw?.fields.employees === "51–200" && nw?.fields.website === "northwind.example.com", nw?.fields);
check("an existing company gets only what it lacked", nw?.fields.linkedin === "linkedin.com/company/northwind-fixture" && nw?.fields.revenue === "$5M–$20M", nw?.fields);
check("the Northwind seat is at Northwind", fnOf("fx-aaa111") && seatOf(seatIdOf("fx-aaa111"))?.companyId === "c_northwindlabs");
const bf = co("Bluefin Analytics");
check("a new company: website host, LinkedIn, industry (Software Development at an analytics company is Data & Analytics), employees and revenue mapped", bf?.fields.website === "bluefin.example.com" && bf?.fields.linkedin === "linkedin.com/company/bluefin-fixture" && bf?.fields.industry === "Data & Analytics" && bf?.fields.employees === "11–50" && bf?.fields.revenue === "$1M–$5M", bf?.fields);
check("two seats at one company (matched by name, Inc. aside)", scanSeats.filter((e: { companyId: string }) => e.companyId === bf?.id).length === 2);
check("employees from a range, revenue en dash", co("Corvid Freight")?.fields.employees === "51–200" && co("Corvid Freight")?.fields.revenue === "$20M–$50M" && co("Dunmore Robotics")?.fields.employees === "1,001+");
check("an industry no rule is sure of is left empty", !co("Dunmore Robotics")?.fields.industry && co("Corvid Freight")?.fields.industry === "Freight & Trucking");
const second = runScript();
check("a second run adds nothing and changes nothing", line(second.stdout, /seats added: (\d+)/) === "0" && line(second.stdout, /updated: (\d+)/) === "0" && line(second.stdout, /companies created: (\d+)/) === "0", second.stdout);
check("a second run leaves the seed as it was (apart from nothing)", JSON.stringify(JSON.parse(readFileSync(seedPath, "utf8")).engagements) === JSON.stringify(s1.engagements));

/* ---------- 2. in process: the view on the wire, MCP, the scan ---------- */

console.log("\nIn process");
const procDir = path.join(dir, "proc");
mkdirSync(procDir);
Object.assign(process.env, { RN_DATA_DIR: procDir, RN_INTEL_SEED: seedPath, RN_LOGO_LOOKUP: "off", RN_STARTER_CREDITS: "25", RN_ID_SECRET: "seatscan-test" });
const T = await import("../lib/table.ts");
const W = await import("../lib/viewWire.ts");
const MCP = await import("../lib/mcp/tools.ts");
const F = await import("../lib/tableFields.ts");
const C = await import("../lib/scan/collect.ts");
const sm = s1.members[0];
const v0 = await T.buildView(sm.token);
const full = JSON.stringify(v0);
check("the packed view unpacks to the same view", JSON.stringify(W.unpackView(JSON.parse(JSON.stringify(W.packView(v0))))) === full);
check("the packed view is smaller", JSON.stringify(W.packView(v0)).length < full.length);
check("no name in the view", !leaks(full).length, leaks(full));
const ctx = { member: sm, origin: "https://post.example.com" };
const g1 = (await MCP.getCompany(ctx, { company: "Bluefin Analytics" })) as { seats?: { id: string; seat_holder?: string; claimable?: string }[] };
const mseat = g1.seats?.find((x) => x.claimable);
check("get_company: the seat says nobody holds it yet, and how to claim it", !!mseat && mseat.seat_holder === "Not on Merlin yet", g1.seats);
check("get_company: no name", !leaks(JSON.stringify(g1)).length);
let refused = "";
try {
  await MCP.addMySeat(ctx, { seat_id: mseat!.id, start: "2026-03" });
} catch (e) {
  refused = String((e as Error).message);
}
check("add_my_seat on a seat nobody holds asks for claim first", /claim: true/.test(refused), refused);
const claimed = (await MCP.addMySeat(ctx, { seat_id: mseat!.id, claim: true })) as { message?: string };
check("add_my_seat with claim claims it", /It's yours/.test(claimed.message ?? ""), claimed);
const g2 = (await MCP.getCompany(ctx, { company: "Bluefin Analytics" })) as { seats?: { id: string; yours?: boolean; seat_holder?: string }[] };
const mine = g2.seats?.find((x) => x.id === mseat!.id);
check("get_company: the claimed seat is theirs", !!mine?.yours && /\(you\)/.test(mine?.seat_holder ?? ""), mine);
check("FUNCTIONS: GTM first, then the rest", F.FUNCTIONS.slice(0, F.GTM_FUNCTIONS.length).join() === F.GTM_FUNCTIONS.join() && ["Technology", "Finance", "Operations", "People", "Product", "Legal"].every((f) => F.FUNCTIONS.includes(f)));
check("Seat scan reads as Revenue Nomad research", F.SOURCE_LABEL["Seat scan"] === "Revenue Nomad research");
// The scan keeps Director-and-above roles outside GTM (lib/seniority.ts), each under its own function, never Executive or none.
check("the weekly scan files a CFO under Finance and a CTO under Technology", C.roleFunction("Fractional CFO", { functions: [] } as never, "Finance") === "Finance" && C.roleFunction("Fractional CTO", { functions: [] } as never, "Technology") === "Technology");
check("the weekly scan still files GTM roles", C.roleFunction("Fractional VP Sales", { functions: [] } as never) === "Sales");

/* ---------- 3. over HTTP ---------- */

console.log("\nOver HTTP");
const PORT = Number(process.env.SEATSCAN_PORT ?? 4598);
const BASE = `http://localhost:${PORT}`;
const httpDir = path.join(dir, "http");
mkdirSync(httpDir);
let server: ChildProcess | null = null;
let log = "";
const env: NodeJS.ProcessEnv = { ...process.env, RN_DATA_DIR: httpDir, RN_INTEL_SEED: seedPath, RN_LOGO_LOOKUP: "off", RN_STARTER_CREDITS: "25", RN_ADMIN_EMAILS: "admin-qa@example.com", RN_CRON_SECRET: "qa-cron", RN_SCAN_TEST: "1", RN_ID_SECRET: "seatscan-test" };
for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_REQUIRE_SEED", "RN_INTEL_SEED_KEY", "RN_INTEL_SEED_B64", "RN_SCAN", "RN_DIGEST"]) delete env[k];
server = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
server.stdout?.on("data", (b) => (log += b));
server.stderr?.on("data", (b) => (log += b));
let up = false;
for (let i = 0; i < 150 && !up; i++) {
  up = (await fetch(`${BASE}/api/health`).then((r) => r.status, () => 0)) > 0;
  if (!up) await new Promise((r) => setTimeout(r, 200));
}
check("server starts", up, log.slice(-400));

let ipN = 0;
type Res = { status: number; json: any; text: string; headers: Headers };
async function call(method: string, p: string, o: { token?: string | null; ip?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Res> {
  const h: Record<string, string> = { ...(o.headers ?? {}) };
  if (o.token) h.cookie = `rn_table=${o.token}`;
  if (o.ip) h["x-forwarded-for"] = o.ip;
  if (o.body !== undefined) h["content-type"] = "application/json";
  const r = await fetch(BASE + p, { method, headers: h, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, json, text, headers: r.headers };
}
class Who {
  constructor(readonly token: string, readonly ip: string) {}
  view = async () => (await call("GET", "/api/table", { token: this.token, ip: this.ip })).json;
  text = async () => (await call("GET", "/api/table", { token: this.token, ip: this.ip })).text;
  act = (action: unknown) => call("POST", "/api/table", { token: this.token, ip: this.ip, body: { action } });
}
async function join(name: string, email: string, headers: Record<string, string> = {}) {
  const ip = `10.77.${Math.floor(++ipN / 200)}.${ipN % 200}`;
  const r = await call("POST", "/api/table", { ip, headers, body: { join: { name, email } } });
  const token = (r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean);
  if (!token) throw new Error(`join failed: ${r.status} ${r.text.slice(0, 200)}`);
  const w = new Who(token, ip);
  await w.act({ type: "profile", function: "Finance", goal: "friendly" });
  return w;
}

if (up) {
  const ann = await join("Annika Claimworth", "ann-seatscan@example.com");
  const bob = await join("Bertram Lookwell", "bob-seatscan@example.com");
  const adm = await join("Admin Qa", "admin-qa@example.com", { "x-cron-secret": "qa-cron" });

  type Seat = { id: string; source: string; claimable?: boolean; yours: boolean; cells: Record<string, { s: string; v?: string; member?: { you: boolean } }> };
  type Co = { id: string; name: string; engagements: Seat[]; friendly: { fractional: number; functions: string[] }; facts: { known: number; missing: number } };
  const coIn = (v: { companies: Co[] }, name: string) => v.companies.find((c) => c.name === name)!;
  const seatAt = (v: { companies: Co[] }, name: string, i = 0) => coIn(v, name).engagements.filter((e) => e.source === "Seat scan")[i];

  let bv = await bob.view();
  const bfB = coIn(bv, "Bluefin Analytics");
  const s0 = seatAt(bv, "Corvid Freight");
  check("a seat nobody holds: claimable, its holder cell empty", !!s0?.claimable && s0.cells.operator?.s === "empty", s0);
  check("profile takes a function outside GTM (Finance)", bv.me.function === "Finance");
  check("rate benchmarks have a Finance row", JSON.stringify(bv.benchmarks ?? {}).includes('"Finance"'));
  check("seat-scan seats count as fractional hires, in their functions", bfB.friendly.fractional >= 1 && bfB.friendly.functions.includes("Sales"), bfB.friendly);
  check("Corvid Freight counts as fractional friendly (one hire)", coIn(bv, "Corvid Freight").friendly.fractional === 1 && coIn(bv, "Corvid Freight").friendly.functions.includes("People"));
  check("no name from the file in a member's view", !leaks(await bob.text()).length);
  const packedText = (await call("GET", "/api/table?compact=1", { token: bob.token, ip: bob.ip })).text;
  check("?compact=1 leaves out empty cells", packedText.length < (await bob.text()).length && !packedText.includes('"operator":{"s":"empty"}'));

  const credits = async (w: Who) => (await w.view()).me.credits as number;
  const t = { entity: "engagement", id: s0.id, field: "operator" };
  let r = await bob.act({ type: "unlock", ...t });
  check("unlock on a seat nobody holds: nothing to unlock", r.status === 400 && /Nothing here is locked/.test(r.json?.error ?? ""), r.json);
  r = await bob.act({ type: "unlockMany", items: [t] });
  check("unlockMany spends nothing there", r.status === 200 && /no credits were spent/.test(r.json?.message ?? ""), r.json);
  r = await bob.act({ type: "verify", ...t });
  check("nothing to confirm there", r.status === 400, r.json);
  r = await bob.act({ type: "report", ...t });
  check("nothing to report there", r.status === 400, r.json);
  r = await bob.act({ type: "fill", ...t, value: "Someone Else" });
  check("nobody can put another person's name on it", r.status === 400, r.json);

  // Claiming
  const before = await credits(ann);
  // "Is this you?": the seat's title, function and dates, before anything is claimed.
  r = await ann.act({ type: "claimSeat", engagementId: s0.id, preview: true });
  const pv = r.json?.claim;
  check("a claim preview shows the seat's title, function and dates", r.status === 200 && !!pv && typeof pv.role === "string" && !!pv.function && "start" in pv && pv.end === "Ongoing", r.json);
  check("the preview claims nothing and costs nothing", !!seatAt(await ann.view(), "Corvid Freight").claimable && (await credits(ann)) === before);
  r = await ann.act({ type: "claimSeat", engagementId: s0.id });
  check("a member claims a seat", r.status === 200 && /It's yours/.test(r.json?.message ?? ""), r.json);
  check("the claim earns nothing", (await credits(ann)) === before);
  let av = await ann.view();
  let mineSeat = seatAt(av, "Corvid Freight");
  check("the claimed seat is theirs (Your seats), with their name and the you tag", mineSeat.yours && mineSeat.cells.operator.s === "value" && mineSeat.cells.operator.v === "Annika Claimworth" && !!mineSeat.cells.operator.member?.you && !mineSeat.claimable, mineSeat);
  check("the claimed seat says You claimed this (Cell.claimed)", mineSeat.cells.operator.s === "value" && mineSeat.cells.operator.claimed === true && mineSeat.cells.operator.mine === true, mineSeat.cells.operator);
  r = await bob.act({ type: "claimSeat", engagementId: s0.id, preview: true });
  check("a claimed seat has no preview", r.status === 400 && /already claimed/.test(r.json?.error ?? ""), r.json);
  check("its role is free for them now", mineSeat.cells.role.s === "value");
  r = await ann.act({ type: "fill", entity: "engagement", id: s0.id, field: "rate", value: "$9k/mo" });
  check("a fact they add after claiming earns as usual", r.status === 200 && (await credits(ann)) === before + 1, r.json);
  bv = await bob.view();
  const forBob = seatAt(bv, "Corvid Freight");
  check("others see the name behind a lock, and it isn't claimable", forBob.cells.operator.s === "locked" && !forBob.claimable && !forBob.yours, forBob);
  check("others see its rate locked", forBob.cells.rate.s === "locked");
  r = await bob.act({ type: "claimSeat", engagementId: s0.id });
  check("a claimed seat can't be claimed again", r.status === 400 && /already claimed/.test(r.json?.error ?? ""), r.json);
  const bobBefore = await credits(bob);
  r = await bob.act({ type: "unlock", ...t });
  check("the name unlocks for 1 credit, as a member seat holder", r.status === 200 && (await credits(bob)) === bobBefore - 1, r.json);
  const unlocked = r.json?.cells?.find((c: { field: string }) => c.field === "operator")?.cell;
  check("and shows the member", unlocked?.s === "value" && unlocked.v === "Annika Claimworth" && !!unlocked.member && !unlocked.member.you, unlocked);

  // The daily limit: 3 claims in 24 hours.
  av = await ann.view();
  const more = ["Dunmore Robotics", "Ember Grove"].map((n) => seatAt(av, n));
  for (const x of more) await ann.act({ type: "claimSeat", engagementId: x.id });
  const fourth = seatAt(av, "Bluefin Analytics", 0).claimable ? seatAt(av, "Bluefin Analytics", 0) : seatAt(av, "Bluefin Analytics", 1);
  r = await ann.act({ type: "claimSeat", engagementId: fourth.id });
  check("a fourth claim in 24 hours is refused", r.status === 400 && /3 seats in 24 hours/.test(r.json?.error ?? ""), r.json);
  r = await ann.act({ type: "fill", entity: "engagement", id: fourth.id, field: "operator", value: "Annika Claimworth", memberId: "me" });
  check("the limit holds through fill as well", r.status === 400 && /3 seats in 24 hours/.test(r.json?.error ?? ""), r.json);
  const pub = coIn(av, "Northwind Labs").engagements.find((e) => e.source !== "Seat scan")!;
  r = await bob.act({ type: "claimSeat", engagementId: pub.id });
  check("only seat-scan seats can be claimed", r.status === 400, r.json);

  // Pilot metrics
  const admView = await adm.view();
  const claims = admView.admin?.seatClaims ?? [];
  check("Pilot metrics lists the seat claims", claims.length === 3 && claims.every((c: { name: string; standing: boolean }) => c.name === "Annika Claimworth" && c.standing), claims);

  // Release: "This isn't me" gives it back, and the unlock is refunded.
  const bobMid = await credits(bob);
  r = await ann.act({ type: "notMine", engagementId: s0.id });
  check("This isn't me releases a claimed seat", r.status === 200 && /Your name is off it/.test(r.json?.message ?? ""), r.json);
  av = await ann.view();
  bv = await bob.view();
  check("released: claimable again, not theirs, no name", !!seatAt(bv, "Corvid Freight").claimable && seatAt(bv, "Corvid Freight").cells.operator.s === "empty" && !seatAt(av, "Corvid Freight").yours);
  check("the member who unlocked the name gets the credit back", (await credits(bob)) === bobMid + 1);
  check("released claims still count toward the daily limit", (await ann.act({ type: "claimSeat", engagementId: s0.id })).status === 400);

  // An admin removes a claim.
  const dun = seatAt(av, "Dunmore Robotics");
  r = await adm.act({ type: "adminRemove", entity: "engagement", id: dun.id, field: "operator" });
  check("an admin can remove a claim", r.status === 200, r.json);
  bv = await bob.view();
  check("after the removal the seat is claimable again", !!seatAt(bv, "Dunmore Robotics").claimable);
  r = await bob.act({ type: "claimSeat", engagementId: seatAt(bv, "Dunmore Robotics").id });
  check("and another member can claim it", r.status === 200, r.json);

  const exp = await call("GET", "/api/table?export=1", { token: adm.token, ip: adm.ip });
  check("the admin export holds no name from the file", exp.status === 200 && !leaks(exp.text).length);
  check("no action result named anyone from the file", !leaks(log).length);
}

server?.kill("SIGTERM");
await new Promise((r) => setTimeout(r, 300));
rmSync(dir, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} failed, ` : ""}${passed} passed`);
process.exit(failed ? 1 : 0);
