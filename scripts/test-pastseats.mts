#!/usr/bin/env node
/**
 * Checks of the past seats import (scripts/add-past-seats.mjs) and of how the table reads an ended seat.
 *
 *   npx tsx scripts/test-pastseats.mts
 *
 * No private data: a made-up seed, a made-up seed key and made-up Past Seats and Past Companies
 * CSVs in a scratch folder, removed at the end. Every person and company in them is made up, and
 * no person's name may show up anywhere it isn't asked for.
 *
 *  1. The script: each drop rule, year-only start and end, status Ended, type Fractional, source
 *     Seat scan, no addedAt, ids an HMAC of past_seat_id with nothing about the person in the seed,
 *     a re-run that adds nothing, a duplicate of a current seat, the enrichment rules by
 *     match_method (and without --companies), --names for United States rows only and its
 *     refusal, --counts-only printing no company name, --dry-run writing nothing.
 *  2. The firm rule: three ended seats at a company don't make it a firm; three current ones still do.
 *  Interim seats (--interim): type Interim, "e_is_" HMAC ids apart from past seats, search and
 *     staffing firms dropped, a re-run that adds nothing. Firm clients (scripts/add-firm-clients.mjs):
 *     one seat per client per firm, leadership vs fractional service, sources and member labels,
 *     admin-only evidence, firms never clients, countries, a re-run that adds nothing.
 *  3. In process, on the seed the script wrote: an ended seat's cells (status and start free, a dated
 *     end and a named holder locked at 1 credit), claiming an ended seat, no hire alert and no new
 *     hire for an ended seat (and why the import leaves addedAt off); an interim seat counts as a
 *     hire, a fractional service makes a company fractional friendly but never a repeat hirer, no
 *     provider firm reaches any view, and the new companies with no website are in the website finder's queue.
 */
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 600)}`);
};
type Fields = Record<string, string>;
type Eng = { id: string; companyId: string; fields: Fields; holderFrom?: string; addedAt?: string; verified?: boolean };
type Co = { id: string; fields: Fields };

/* ---------- a made-up seed, key and files ---------- */

const dir = mkdtempSync(path.join(tmpdir(), "tp-pastseats-"));
const TEST_KEY = Buffer.alloc(32, 5).toString("base64");
const pastId = (id: string) => `e_ps_${createHmac("sha256", Buffer.from(TEST_KEY, "base64")).update(`past-seat:${id}`).digest("hex").slice(0, 20)}`;
const personKeyOf = (id: string) => `p_${createHmac("sha256", Buffer.from(TEST_KEY, "base64")).update(`person:${id}`).digest("hex").slice(0, 20)}`;
const THIS_YEAR = new Date().getUTCFullYear();

const seed = {
  builtAt: new Date().toISOString(),
  members: [{ id: "sm1", name: "Fixture Seedmember", email: "seedmember-past@example.com", title: "Fractional CMO", token: "pastseats-seed-token-1" }, { id: "sm2", name: "Fixture Adminperson", email: "admin-past@example.com", title: "Admin", token: "pastseats-admin-token-2" }],
  companies: [
    // Matched by matched_company_id (its LinkedIn page), with nothing else on file: the seat row's facts fill it.
    { id: "c_ember", fields: { name: "Ember Fixture Grove", linkedin: "linkedin.com/company/99077" } },
    // Has a current seat: a past row with the same title and overlapping years is that seat.
    { id: "c_quarry", fields: { name: "Quarry Fixture Systems", website: "quarry-fixture.example.com", industry: "SaaS", employees: "51–200" } },
    // Matched by a trusted Past Companies row's LinkedIn page; its own values stay.
    { id: "c_harbor", fields: { name: "Harbor Fixture Works", linkedin: "linkedin.com/company/88001", industry: "SaaS" } },
  ],
  engagements: [
    { id: "e_ss_quarrycurrent", companyId: "c_quarry", fields: { source: "Seat scan", role: "Fractional CMO", type: "Fractional", status: "Active", end: "Ongoing", start: "2024-06", function: "Marketing" }, verified: false },
  ],
  contacts: [],
  removedFirms: { companies: [{ id: "c_gonefirm", name: "Gonefirm Fixture Collective" }], engagements: [], contacts: [] },
};
const seedPath = path.join(dir, "intel-seed.json");
writeFileSync(seedPath, JSON.stringify(seed));

/** Made-up people. Only a United States holder's name, with --names, may reach the seed, and never the output. */
const P = {
  zelda: "Zelda Quartermaine", orrin: "Orrin Featherstone", pella: "Pella Vantongeren", rhea: "Rhea Ostrowski", sable: "Sable Underhill",
  tobin: "Tobin Marchetti", wren: "Wren Castellanos", barnaby: "Barnaby Wexford", ilse: "Ilse Brandvold", ximena: "Ximena Pettigrew",
  ulric: "Ulric Danforth", odalys: "Odalys Kerrigan", cosima: "Cosima Rutledge", dashiell: "Dashiell Ormsby", fenwick: "Fenwick Aldous",
  galatea: "Galatea Moorcroft", yorick: "Yorick Halloran", quill: "Quill Abernathy", elspeth: "Elspeth Vandermeer", example: "Exemplar Personwick",
};
const HEAD =
  "past_seat_id,person_name,person_sales_nav_id,seat_title,company_name,function,role_category,is_gtm,role_type,start_year,end_year,duration_months,is_current,person_current_title,person_current_company,person_location,country,source,source_query,captured_on,person_also_in_current_seats,matched_company_id,company_website,company_industry,company_employee_range,company_rn_revenue_bucket,company_about,company_likely_fractional_provider,provider_by_name,company_fractional_seats_total";
const TAB_HEAD =
  "company_name,example_person,country,slug,domain_guess_1,domain_guess_2,matched_domain,match_method,clay_company_name,linkedin_url,website,industry,employee_range,employee_count,revenue_range_provider,hq_country,company_about,rn_revenue_bucket,employee_range_std,website_url,likely_fractional_provider,past_seat_count,,extra_col";
const csvLine = (head: string, o: Record<string, string>) =>
  head.split(",").map((k) => {
    const v = k ? o[k] ?? "" : "";
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(",");
let nav = 0;
const base = (o: Record<string, string>) => ({
  role_type: "Fractional", is_current: "FALSE", is_gtm: "TRUE", duration_months: "17", person_current_title: "Zedcurrent Title Fixture", person_current_company: "Zedcurrent Company Fixture",
  person_location: "Springfield Fixtureville", country: "Fixtureland", source: "fixture source", source_query: "fixture query", captured_on: "2026-10-03", person_also_in_current_seats: "FALSE",
  person_sales_nav_id: `NAVPAST${String(++nav).padStart(4, "0")}`, function: "Marketing", role_category: "Marketing", ...o,
});
const US = "United States";
const kept = [
  // Trusted Past Companies match (domain+name+country): website, LinkedIn, industry, size, revenue, About, HQ.
  base({ past_seat_id: "PSFX-001", person_name: `${P.zelda}, MBA`, seat_title: "Fractional VP Marketing", company_name: "Kestrel Fixture Mills", start_year: "2022", end_year: "2024", country: US }),
  // domain+name without the country: the tab's facts as a best guess (no HQ), before the seat row's copy of the match (matched_company_id is its LinkedIn page).
  base({ past_seat_id: "PSFX-002", person_name: P.orrin, seat_title: "Fractional CFO", company_name: "Bluefin Fixture Analytics", function: "Finance", role_category: "Non-GTM", is_gtm: "FALSE", start_year: "2023", end_year: "2025", matched_company_id: "https://www.linkedin.com/company/bluefin-wrong", company_website: "https://bluefin-fixture.example.com", company_industry: "Software Development", company_employee_range: "11-50", company_rn_revenue_bucket: "$1M-$5M" }),
  // no_match: name only. A United States holder.
  base({ past_seat_id: "PSFX-003", person_name: P.pella, seat_title: "Fractional CRO", company_name: "Corvid Fixture Freight", function: "Revenue Leadership", role_category: "Sales Leadership", start_year: "2021", end_year: "2022", country: US }),
  // no_match (with a website the tab didn't match), and no start year: no start on the seat.
  base({ past_seat_id: "PSFX-004", person_name: P.rhea, seat_title: "Fractional Head of Growth", company_name: "Dunmore Fixture Robotics", function: "Growth", start_year: "", end_year: "2023" }),
  // matched_company_id: the seat row's own facts fill the company on file. A United States holder whose seat holder name is "Dr. ...".
  base({ past_seat_id: "PSFX-005", person_name: `Dr. ${P.sable}`, seat_title: "Fractional COO", company_name: "Ember Grove (Fixture)", function: "Operations", role_category: "Non-GTM", is_gtm: "FALSE", start_year: "2024", end_year: String(THIS_YEAR), country: US, matched_company_id: "99077", company_website: "https://www.embergrove-fixture.example.com", company_industry: "Truck Transportation", company_employee_range: "51-200", company_rn_revenue_bucket: "$20M-$50M" }),
  // Matched by a trusted Past Companies row's LinkedIn page.
  base({ past_seat_id: "PSFX-006", person_name: P.tobin, seat_title: "Fractional VP Sales", company_name: "Harbor Fixture Holdings", function: "Sales", start_year: "2022", end_year: "2023" }),
  // The same title as the current seat at Quarry, years before it: its own seat.
  base({ past_seat_id: "PSFX-007", person_name: P.ilse, person_sales_nav_id: "NAVPASTSAME", seat_title: "Fractional CMO", company_name: "Quarry Fixture Systems", start_year: "2020", end_year: "2021" }),
  // A trusted About line that names a seat holder: not stored.
  base({ past_seat_id: "PSFX-008", person_name: P.barnaby, seat_title: "Fractional CMO", company_name: "Osprey Fixture Diagnostics", start_year: "2022", end_year: "2023" }),
  // Three ended seats at one company: a client that went through fractionals, not a firm.
  base({ past_seat_id: "PSFX-009a", person_name: P.ximena, seat_title: "Fractional CMO", company_name: "Larkfield Fixture Pay", start_year: "2021", end_year: "2022" }),
  base({ past_seat_id: "PSFX-009b", person_name: P.ulric, seat_title: "Fractional CFO", company_name: "Larkfield Fixture Pay", function: "Finance", role_category: "Non-GTM", is_gtm: "FALSE", start_year: "2022", end_year: "2023" }),
  base({ past_seat_id: "PSFX-009c", person_name: P.odalys, seat_title: "Fractional VP Sales", company_name: "Larkfield Fixture Pay", function: "Sales", start_year: "2023", end_year: "2025", country: US }),
  // The file flags it as a provider, but NOT_FIRMS overrules the flag.
  base({ past_seat_id: "PSFX-010", person_name: P.cosima, seat_title: "Fractional VP Marketing", company_name: "SKYSHARE", start_year: "2022", end_year: "2024", company_likely_fractional_provider: "TRUE" }),
  // A spreadsheet's number "2023.0" reads as the year.
  base({ past_seat_id: "PSFX-011", person_name: P.ilse, person_sales_nav_id: "NAVPASTSAME", seat_title: "Fractional Head of Partnerships", company_name: "Wrenfield Fixture Energy", function: "Partnerships", start_year: "2022.0", end_year: "2023.0", matched_company_id: "name:Quarry Fixture Systems" }),
];
const dropped = [
  base({ past_seat_id: "PSFX-d01", person_name: P.fenwick, seat_title: "Fractional CMO", company_name: "Still Current Fixture Co", start_year: "2024", end_year: String(THIS_YEAR), is_current: "TRUE" }),
  base({ past_seat_id: "PSFX-d02", person_name: P.fenwick, seat_title: "VP Marketing", company_name: "Fulltime Fixture Co", role_type: "Full-time", start_year: "2021", end_year: "2023" }),
  base({ past_seat_id: "PSFX-d03", person_name: P.fenwick, seat_title: "VP Sales (Full-Time)", company_name: "Fulltime Title Fixture Co", function: "Sales", start_year: "2021", end_year: "2023" }),
  base({ past_seat_id: "PSFX-d04", person_name: P.fenwick, seat_title: "Available for Fractional CMO roles", company_name: "Seeking Fixture Co", start_year: "2021", end_year: "2023" }),
  base({ past_seat_id: "PSFX-d05", person_name: P.fenwick, seat_title: "Fractional CMO", company_name: "No End Fixture Co", start_year: "2021", end_year: "" }),
  base({ past_seat_id: "PSFX-d06", person_name: P.fenwick, seat_title: "Fractional CMO", company_name: "Too Early Fixture Co", start_year: "2019", end_year: "2020" }),
  base({ past_seat_id: "PSFX-d07", person_name: P.fenwick, seat_title: "Fractional CMO", company_name: "Future Fixture Co", start_year: "2024", end_year: String(THIS_YEAR + 1) }),
  base({ past_seat_id: "PSFX-d08", person_name: P.fenwick, seat_title: "Fractional CMO", company_name: "Backwards Fixture Co", start_year: "2025", end_year: "2023" }),
  base({ past_seat_id: "PSFX-d09", person_name: P.fenwick, seat_title: "Fractional CMO", company_name: "", start_year: "2021", end_year: "2023" }),
  base({ past_seat_id: "PSFX-d10", person_name: P.galatea, seat_title: "Fractional CMO", company_name: "Solo Fixture Shop", start_year: "2021", end_year: "2023", company_employee_range: "1" }),
  base({ past_seat_id: "PSFX-d11", person_name: P.galatea, seat_title: "Fractional CMO", company_name: "Self-employed", start_year: "2021", end_year: "2023" }),
  base({ past_seat_id: "PSFX-d12", person_name: `${P.wren}, MBA`, seat_title: "Fractional CMO", company_name: "Castellanos Growth Partners", start_year: "2021", end_year: "2023" }),
  base({ past_seat_id: "PSFX-d13", person_name: P.yorick, seat_title: "Fractional Bookkeeper", company_name: "Larkspur Fixture Dental", function: "Finance", role_category: "Non-GTM", is_gtm: "FALSE", start_year: "2021", end_year: "2023" }),
  base({ past_seat_id: "PSFX-d14", person_name: P.yorick, seat_title: "Fractional CMO", company_name: "Brightpath Fixture Partners", start_year: "2021", end_year: "2023", company_about: "Brightpath provides fractional CMOs to growing startups." }),
  base({ past_seat_id: "PSFX-d15", person_name: P.yorick, seat_title: "Fractional CMO", company_name: "Heron Fixture Woodworks", start_year: "2021", end_year: "2023", company_likely_fractional_provider: "TRUE" }),
  base({ past_seat_id: "PSFX-d16", person_name: P.yorick, seat_title: "Fractional CMO", company_name: "Tallow Fixture Works", start_year: "2021", end_year: "2023", provider_by_name: "TRUE" }),
  base({ past_seat_id: "PSFX-d17", person_name: P.yorick, seat_title: "Fractional CMO", company_name: "Juniper Fixture Fields", start_year: "2021", end_year: "2023" }),
  base({ past_seat_id: "", person_name: P.yorick, seat_title: "Fractional CMO", company_name: "No Id Fixture Co", start_year: "2021", end_year: "2023" }),
  base({ past_seat_id: "PSFX-001", person_name: P.yorick, seat_title: "Fractional CMO", company_name: "Twice Fixture Co", start_year: "2021", end_year: "2023" }),
  base({ past_seat_id: "PSFX-d20", person_name: P.yorick, seat_title: "Fractional CMO", company_name: "Gonefirm Fixture Collective", start_year: "2021", end_year: "2023" }),
  base({ past_seat_id: "PSFX-d21", person_name: P.yorick, seat_title: "Fractional CMO", company_name: "Zq Fixture", start_year: "2021", end_year: "2023" }),
];
const dups = [
  // The current seat at Quarry, captured again as a past seat: the same title, years overlap.
  base({ past_seat_id: "PSFX-u01", person_name: P.quill, seat_title: "Fractional CMO", company_name: "Quarry Fixture Systems", start_year: "2023", end_year: "2025", person_also_in_current_seats: "TRUE" }),
  // The same company, title and years as PSFX-002 under another id.
  base({ past_seat_id: "PSFX-u02", person_name: P.orrin, seat_title: "Fractional CFO", company_name: "Bluefin Fixture Analytics", function: "Finance", role_category: "Non-GTM", is_gtm: "FALSE", start_year: "2023", end_year: "2025" }),
];
const ROWS = [...kept, ...dropped, ...dups];
const csvPath = path.join(dir, "past-seats.csv");
writeFileSync(csvPath, [HEAD, ...ROWS.map((r) => csvLine(HEAD, r))].join("\n") + "\n");

const tab = [
  { company_name: "Kestrel Fixture Mills", example_person: P.example, country: US, match_method: "domain+name+country", linkedin_url: "https://www.linkedin.com/company/kestrel-fixture", website: "https://www.kestrel-fixture.example.com/", industry: "Software Development", employee_range: "Nov-50", employee_range_std: "11-50", hq_country: "GB", company_about: "Kestrel Fixture Mills makes recycled paper goods for offices.", rn_revenue_bucket: "$1M-$5M", likely_fractional_provider: "FALSE" },
  { company_name: "Bluefin Fixture Analytics", example_person: P.orrin, country: "Fixtureland", match_method: "domain+name", linkedin_url: "https://www.linkedin.com/company/bluefin-wrong", website: "https://bluefin-wrong.example.com", industry: "Software Development", employee_range: "201-500", hq_country: "US", company_about: "Bluefin Fixture Analytics charts tides for harbors.", rn_revenue_bucket: "$50M+", matched_domain: "bluefin-wrong.example.com" },
  { company_name: "Corvid Fixture Freight", country: US, match_method: "no_match" },
  { company_name: "Dunmore Fixture Robotics", country: "Fixtureland", match_method: "no_match", website: "https://dunmore-skipped.example.com" },
  // A placeholder or a name too short to look up: never a new company, so its seat is dropped.
  { company_name: "Zq Fixture", country: "Fixtureland", match_method: "skipped" },
  { company_name: "Harbor Fixture Holdings", country: "Fixtureland", match_method: "domain+name+country", linkedin_url: "https://www.linkedin.com/company/88001/", website: "https://harbor-fixture.example.com", industry: "Software Development", employee_range: "51-200", hq_country: "US", company_about: "Harbor Fixture Works runs marinas." },
  { company_name: "Osprey Fixture Diagnostics", country: "Fixtureland", match_method: "domain+name+country", website: "https://osprey-fixture.example.com", industry: "Medical Equipment Manufacturing", hq_country: "US", company_about: "Osprey Fixture Diagnostics, led by Barnaby Wexford, builds lab tests." },
  { company_name: "Juniper Fixture Fields", country: "Fixtureland", match_method: "domain+name+country", website: "https://juniper-fixture.example.com", likely_fractional_provider: "TRUE" },
];
const tabPath = path.join(dir, "past-companies.csv");
writeFileSync(tabPath, [TAB_HEAD, ...tab.map((r) => csvLine(TAB_HEAD, r))].join("\n") + "\n");

/** What must never be stored or printed (names are checked apart: one may reach the seed with --names). */
const FILE_ONLY = ["PSFX", "NAVPAST", "Springfield Fixtureville", "Fixtureland", "fixture query", "fixture source", "2026-10-03", "Zedcurrent"];
const PEOPLE = Object.values(P);
const leaks = (text: string, extra: string[] = []) => [...FILE_ONLY, ...extra].filter((x) => text.includes(x));
const COMPANIES = [...new Set(ROWS.map((r) => r.company_name).filter((n) => n && n !== "Self-employed" && n !== "SKYSHARE")), "Gonefirm", "Ember Fixture Grove", "Harbor Fixture Works"];

const run = (seedFile: string, ...extra: string[]) =>
  spawnSync(process.execPath, [path.join(ROOT, "scripts", "add-past-seats.mjs"), csvPath, "--seed", seedFile, "--no-seal", ...extra], { cwd: ROOT, encoding: "utf8", env: { ...process.env, RN_INTEL_SEED_KEY: TEST_KEY } });
const line = (out: string, re: RegExp) => out.match(re)?.[1];
const dropCount = (out: string, why: string) => line(out, new RegExp(`dropped \\(${why.replace(/[()]/g, "\\$&")}\\): (\\d+)`));

/* ---------- 1. the script ---------- */

console.log("\nThe script, with the Past Companies tab");
const dry = run(seedPath, "--companies", tabPath, "--dry-run");
check("a dry run writes nothing", dry.status === 0 && readFileSync(seedPath, "utf8") === JSON.stringify(seed), dry.stderr);
const first = run(seedPath, "--companies", tabPath);
const out1 = first.stdout;
check("the script runs", first.status === 0, first.stderr + out1);
check(`${ROWS.length} rows read, ${kept.length} kept`, line(out1, /rows read: (\d+)/) === String(ROWS.length) && line(out1, /^kept: (\d+)/m) === String(kept.length) && line(out1, /seats added: (\d+)/) === String(kept.length), out1);
const DROPS: [string, string][] = [
  ["still current (is_current)", "1"],
  ["not fractional work (role type)", "1"],
  ["not fractional work (title says full-time)", "1"],
  ["not a seat (title is a search for work)", "1"],
  ["no end year", "1"],
  ["ended before 2021", "1"],
  ["end year after this year", "1"],
  ["ends before it starts", "1"],
  ["no company", "1"],
  ["one-person company", "1"],
  ["stand-in name (self-employed, stealth, freelance, confidential)", "1"],
  ["company named after the person", "1"],
  ["outside GTM and below Director", "1"],
  ["fractional firm, agency or marketplace (lib/firms.ts)", "1"],
  ["likely fractional provider (the file's flag)", "3"],
  ["no past seat id", "1"],
  ["same past seat id twice in the file", "1"],
  ["fractional firm the seed already removed", "1"],
  ["placeholder or too-short name (Past Companies says skipped)", "1"],
];
for (const [why, n] of DROPS) check(`drops: ${why} (${n})`, dropCount(out1, why) === n, out1.split("\n").filter((l) => l.startsWith("dropped")));
check("the provider flag: company_likely_fractional_provider, provider_by_name and the Past Companies tab's, NOT_FIRMS overrules it", dropCount(out1, "likely fractional provider (the file's flag)") === "3");
check(
  "duplicates: the current seat captured as a past one (same title, years overlap, the person also in current seats), and the same seat twice in the file",
  /duplicates: 2 \(same company and title as a seat on file, years overlap: 1, 1 of them say the person is also in current seats; the same seat twice in this file: 1\)/.test(out1),
  out1,
);
check("prints no person's name, and nothing from the file about the person", !leaks(out1 + first.stderr, PEOPLE).filter((x) => x !== "Fixtureland").length, leaks(out1, PEOPLE));
check("holders' countries are printed as counts only", /countries \(counted, never stored\), top 10: Fixtureland \d+, United States \d+$/m.test(out1), out1);

const text1 = readFileSync(seedPath, "utf8");
const s1 = JSON.parse(text1) as typeof seed & { engagements: Eng[]; companies: Co[] };
const past = s1.engagements.filter((e) => e.id.startsWith("e_ps_"));
const seatOf = (psid: string) => s1.engagements.find((e) => e.id === pastId(psid));
const coOf = (psid: string) => s1.companies.find((c) => c.id === seatOf(psid)?.companyId);
const coNamed = (name: string) => s1.companies.find((c) => c.fields.name === name);
check(`${kept.length} ended seats on the seed`, past.length === kept.length, past.length);
check("each is source Seat scan, type Fractional, status Ended", past.every((e) => e.fields.source === "Seat scan" && e.fields.type === "Fractional" && e.fields.status === "Ended"));
check("start and end are years alone", past.every((e) => /^\d{4}$/.test(e.fields.end) && (!e.fields.start || /^\d{4}$/.test(e.fields.start))) && seatOf("PSFX-001")?.fields.start === "2022" && seatOf("PSFX-001")?.fields.end === "2024");
check("a spreadsheet's 2023.0 reads as 2023", seatOf("PSFX-011")?.fields.start === "2022" && seatOf("PSFX-011")?.fields.end === "2023", seatOf("PSFX-011")?.fields);
check("no start year: no start on the seat", !!seatOf("PSFX-004") && !("start" in seatOf("PSFX-004")!.fields) && seatOf("PSFX-004")!.fields.end === "2023");
check("title and function from the row (Revenue Leadership is Sales)", seatOf("PSFX-003")?.fields.role === "Fractional CRO" && seatOf("PSFX-003")?.fields.function === "Sales" && seatOf("PSFX-005")?.fields.function === "Operations");
check("no ended seat carries addedAt (no new hire)", past.every((e) => !("addedAt" in e)));
check("ids are e_ps_ and the HMAC of past_seat_id", past.every((e) => /^e_ps_[0-9a-f]{20}$/.test(e.id)) && kept.every((r) => !!seatOf(r.past_seat_id)));
check("each ended seat carries its holder's person key: p_ and the HMAC of person_sales_nav_id, on the record, outside its fields", kept.every((r) => seatOf(r.past_seat_id)?.holderKey === personKeyOf(r.person_sales_nav_id) && !("holderKey" in seatOf(r.past_seat_id)!.fields)) && past.every((e) => /^p_[0-9a-f]{20}$/.test(e.holderKey ?? "")));
check("one person's two seats share one key; another person's differs", seatOf("PSFX-007")?.holderKey === seatOf("PSFX-011")?.holderKey && seatOf("PSFX-007")?.holderKey !== seatOf("PSFX-001")?.holderKey);
check("the key counts are printed", /person keys: 13 on seats added, 0 added to seats on file/.test(out1) && /people: 13 ended seats keyed, 12 distinct people; 0 ended seats \(0 people\) join a person with a current seat/.test(out1), out1.split("\n").filter((l) => /^(person keys|people):/.test(l)));
check("no person key is printed", !past.some((e) => out1.includes(e.holderKey!)));
check("the seed holds no past seat id, profile id, location, current job, query, capture day or the holder's country", !leaks(text1).length, leaks(text1));
check("without --names the seed holds no person's name", !PEOPLE.some((p) => text1.includes(p)) && past.every((e) => !e.fields.operator && !e.holderFrom), PEOPLE.filter((p) => text1.includes(p)));
check("the seed holds no tenure (duration_months)", past.every((e) => Object.keys(e.fields).every((k) => ["source", "role", "type", "status", "end", "start", "function"].includes(k))));

// Enrichment by match_method.
const kes = coOf("PSFX-001");
check(
  "domain+name+country: website, LinkedIn page, industry, size, revenue, About and HQ country from the Past Companies row",
  kes?.fields.name === "Kestrel Fixture Mills" && kes.fields.website === "kestrel-fixture.example.com" && kes.fields.linkedin === "linkedin.com/company/kestrel-fixture" && !!kes.fields.industry && kes.fields.employees === "11–50" && kes.fields.revenue === "$1M–$5M" && kes.fields.about === "Kestrel Fixture Mills makes recycled paper goods for offices." && kes.fields.hq === "United Kingdom" && kes.fields.country === "United Kingdom",
  kes?.fields,
);
const nameOnlyCo = (psid: string) => {
  const c = coOf(psid);
  return !!c && Object.keys(c.fields).every((k) => k === "name");
};
const blue = coOf("PSFX-002");
check(
  "domain+name without the country: the best guess attaches the tab's website, LinkedIn page, industry, size, revenue and About, but no HQ country",
  blue?.fields.website === "bluefin-wrong.example.com" && blue.fields.linkedin === "linkedin.com/company/bluefin-wrong" && !!blue.fields.industry && blue.fields.employees === "201–500" && blue.fields.revenue === "$50M+" && blue.fields.about === "Bluefin Fixture Analytics charts tides for harbors." && !blue.fields.hq && !blue.fields.country,
  blue?.fields,
);
check("the tab's facts come before the seat row's copy of the match", !text1.includes("bluefin-fixture.example.com"));
check("matched_company_id as \"name:\" + a current company's name: the seat goes to that company", seatOf("PSFX-011")?.companyId === "c_quarry" && !coNamed("Wrenfield Fixture Energy"));
type Marked = Co & { enrichedBy?: { by: string; match: string; fields: string[] } };
const mark = (c: Co | undefined) => (c as Marked | undefined)?.enrichedBy;
check("size reads from employee_range_std first (employee_range may be a band Sheets made a date)", kes?.fields.employees === "11–50" && !!mark(kes)?.fields.includes("employees"), kes?.fields);
check(
  "each company given facts carries a private import mark: the match and the fields it filled, outside its fields",
  mark(blue)?.by === "past seats" && mark(blue)?.match === "domain+name" && mark(blue)!.fields.includes("website") && !mark(blue)!.fields.includes("hq") &&
    mark(kes)?.match === "domain+name+country" && mark(kes)!.fields.includes("hq") &&
    mark(s1.companies.find((c) => c.id === "c_ember"))?.match === "matched_company_id" && mark(s1.companies.find((c) => c.id === "c_ember"))!.fields.join() === "website,industry,employees,revenue" &&
    !mark(coOf("PSFX-003")) && !mark(coOf("PSFX-004")) && s1.companies.every((c) => !("enrichedBy" in c.fields)),
  [mark(blue), mark(kes), mark(s1.companies.find((c) => c.id === "c_ember"))],
);
check("no_match: the name only", nameOnlyCo("PSFX-003") && nameOnlyCo("PSFX-004") && !text1.includes("dunmore-skipped"));
check("skipped (a placeholder): no company and no seat", !coNamed("Zq Fixture") && !seatOf("PSFX-d21"));
const ember = s1.companies.find((c) => c.id === "c_ember");
check(
  "matched_company_id: the company on file, by its LinkedIn page, gets the seat row's website, industry, size and revenue, and keeps its name",
  seatOf("PSFX-005")?.companyId === "c_ember" && ember?.fields.name === "Ember Fixture Grove" && ember.fields.website === "embergrove-fixture.example.com" && ember.fields.industry === "Freight & Trucking" && ember.fields.employees === "51–200" && ember.fields.revenue === "$20M–$50M",
  ember?.fields,
);
const harbor = s1.companies.find((c) => c.id === "c_harbor");
check("a trusted Past Companies LinkedIn page matches a company on file, which keeps its own values and only gets what it lacked", seatOf("PSFX-006")?.companyId === "c_harbor" && harbor?.fields.industry === "SaaS" && harbor.fields.website === "harbor-fixture.example.com" && !coNamed("Harbor Fixture Holdings"), harbor?.fields);
check("a trusted About that names a seat holder is not stored", !!coOf("PSFX-008") && !coOf("PSFX-008")!.fields.about && !text1.includes("Wexford") && coOf("PSFX-008")!.fields.website === "osprey-fixture.example.com", coOf("PSFX-008")?.fields);
check("NOT_FIRMS overrules the provider flag", !!seatOf("PSFX-010"));
check("enrichment counts by rule", /enrichment \(companies given facts\): by matched_company_id 1, by domain\+name\+country 3, by domain\+name \(best guess\) 1, by the seat row's Past Companies match 0; with a website 5 of them; created by name only 4/.test(out1) && /\(their match: .*no_match 2/.test(out1), out1.split("\n").find((l) => l.startsWith("enrichment")));
check("new companies whose only seat is an ended one are counted", line(out1, /new companies whose only seat is an ended one: (\d+)/) === "7", out1);

// Duplicates and the current seat.
check("the past CMO seat at Quarry before the current one is its own seat; the one that overlaps it is not added", seatOf("PSFX-007")?.companyId === "c_quarry" && !seatOf("PSFX-u01") && s1.engagements.filter((e) => e.companyId === "c_quarry").length === 3);
check("the same seat twice in the file is added once", !!seatOf("PSFX-002") && !seatOf("PSFX-u02"));
check("no seat or company for a dropped row", dropped.every((r) => !r.past_seat_id || r.past_seat_id === "PSFX-001" || !seatOf(r.past_seat_id)) && !["Brightpath Fixture Partners", "Heron Fixture Woodworks", "Tallow Fixture Works", "Juniper Fixture Fields", "Solo Fixture Shop", "Castellanos Growth Partners", "Still Current Fixture Co"].some((n) => coNamed(n)));
check("three ended seats at one company: kept, not taken for a firm", s1.engagements.filter((e) => e.companyId === coOf("PSFX-009a")?.id).length === 3 && /firms the cleanup removed: 0 companies/.test(out1), out1);
check("the About text of a dropped firm is read, not stored", !text1.includes("growing startups"));

// A re-run.
const second = run(seedPath, "--companies", tabPath);
check("a second run adds nothing", second.status === 0 && line(second.stdout, /seats added: (\d+)/) === "0" && line(second.stdout, /companies created: (\d+)/) === "0" && line(second.stdout, /unchanged: (\d+),/) === String(kept.length), second.stdout + second.stderr);
check("a second run leaves the seed as it was", readFileSync(seedPath, "utf8") === text1);

// --counts-only: no company name, title or person.
{
  const p = path.join(dir, "intel-seed-counts.json");
  writeFileSync(p, JSON.stringify(seed));
  const r = run(p, "--companies", tabPath, "--counts-only");
  const said = r.stdout + r.stderr;
  check("--counts-only runs", r.status === 0, r.stderr);
  check("--counts-only prints no company name, title or person", !COMPANIES.some((c) => said.includes(c)) && !/Fractional (VP|CMO|CFO|Bookkeeper)/.test(said) && !leaks(said, PEOPLE).filter((x) => x !== "Fixtureland").length, said);
  const d = run(p, "--companies", tabPath);
  check("without it, a firm dropped at import is named (a company, never a person)", /new firms dropped at import: \d+: .*Brightpath Fixture Partners/.test(d.stdout) && !leaks(d.stdout, PEOPLE).filter((x) => x !== "Fixtureland").length, d.stdout);
}

// Without --companies: only matched_company_id rows bring facts.
console.log("\nWithout the Past Companies tab");
{
  const p = path.join(dir, "intel-seed-notab.json");
  writeFileSync(p, JSON.stringify(seed));
  const r = run(p);
  check("runs", r.status === 0, r.stderr);
  const t = JSON.parse(readFileSync(p, "utf8")) as { engagements: Eng[]; companies: Co[] };
  const co = (psid: string) => t.companies.find((c) => c.id === t.engagements.find((e) => e.id === pastId(psid))?.companyId);
  check("a trusted tab match counts for nothing without the tab: name only", !!co("PSFX-001") && Object.keys(co("PSFX-001")!.fields).join() === "name", co("PSFX-001")?.fields);
  check("without the tab, a matched_company_id that is the match's LinkedIn page brings the seat row's facts as a best guess (no HQ)", co("PSFX-002")?.fields.website === "bluefin-fixture.example.com" && co("PSFX-002")?.fields.linkedin === "linkedin.com/company/bluefin-wrong" && !co("PSFX-002")?.fields.hq && (co("PSFX-002") as Co & { enrichedBy?: { match: string } })?.enrichedBy?.match === "Past Companies match (seat row)", co("PSFX-002"));
  check("a row with no matched_company_id and no tab: name only", Object.keys(co("PSFX-003")?.fields ?? { x: 1 }).join() === "name", co("PSFX-003")?.fields);
  check("matched_company_id still fills the company on file", co("PSFX-005")?.id === "c_ember" && co("PSFX-005")?.fields.website === "embergrove-fixture.example.com");
  check("Harbor (no matched_company_id, no tab): matched by name only if the name is on file, else a new company by name", t.engagements.some((e) => e.id === pastId("PSFX-006")) && !t.companies.find((c) => c.id === "c_harbor")?.fields.website);
  check("the provider flag on the tab is not read without it (Juniper kept)", t.engagements.some((e) => e.id === pastId("PSFX-d17")));
  check("enrichment counts: matched_company_id 1, domain+name+country 0", /by matched_company_id 1, by domain\+name\+country 0, by domain\+name \(best guess\) 0, by the seat row's Past Companies match 1;/.test(r.stdout), r.stdout);
}

// --names: United States rows only.
console.log("\nNames");
const namedSeedPath = path.join(dir, "intel-seed-names.json");
{
  writeFileSync(namedSeedPath, JSON.stringify(seed));
  const r = run(namedSeedPath, "--companies", tabPath, "--names");
  check("--names runs", r.status === 0, r.stderr);
  const t = JSON.parse(readFileSync(namedSeedPath, "utf8")) as { engagements: Eng[] };
  const e = (psid: string) => t.engagements.find((x) => x.id === pastId(psid));
  const usRows = kept.filter((x) => x.country === US).map((x) => x.past_seat_id);
  check("United States holders are named, cleaned (credentials and Dr. off)", e("PSFX-001")?.fields.operator === P.zelda && e("PSFX-003")?.fields.operator === P.pella && e("PSFX-005")?.fields.operator === P.sable && e("PSFX-009c")?.fields.operator === P.odalys, usRows.map((x) => e(x)?.fields.operator));
  check("each named seat is marked holderFrom public profile", usRows.every((x) => e(x)?.holderFrom === "public profile"));
  check("no seat outside the United States carries a name", kept.filter((x) => x.country !== US).every((x) => !e(x.past_seat_id)?.fields.operator && !e(x.past_seat_id)?.holderFrom));
  check("the counts say so, and print no name", line(r.stdout, /named now: (\d+)/) === String(usRows.length) && /named seats outside the United States or in California: 0/.test(r.stdout) && !PEOPLE.some((p) => r.stdout.includes(p)), r.stdout);
  const text = readFileSync(namedSeedPath, "utf8");
  check("no other person's name reaches the seed", PEOPLE.filter((p) => text.includes(p)).sort().join() === [P.zelda, P.pella, P.sable, P.odalys].sort().join(), PEOPLE.filter((p) => text.includes(p)));
  const again = run(namedSeedPath, "--companies", tabPath, "--names");
  check("a second run names nothing and keeps them", line(again.stdout, /named now: (\d+)/) === "0" && line(again.stdout, /already had a seat holder \(kept\): (\d+)/) === String(usRows.length) && readFileSync(namedSeedPath, "utf8") === text, again.stdout);
}
{
  // A seat that already has a holder keeps it; one named from public profiles whose row is now outside the United States loses it.
  const p = path.join(dir, "intel-seed-held.json");
  const held = {
    ...seed,
    companies: [...seed.companies, { id: "c_kestrel", fields: { name: "Kestrel Fixture Mills" } }, { id: "c_bluefin", fields: { name: "Bluefin Fixture Analytics" } }],
    engagements: [
      ...seed.engagements,
      { id: pastId("PSFX-001"), companyId: "c_kestrel", fields: { source: "Seat scan", role: "Fractional VP Marketing", type: "Fractional", status: "Ended", end: "2024", start: "2022", function: "Marketing", operator: "Kept Holdername" }, verified: false },
      { id: pastId("PSFX-002"), companyId: "c_bluefin", fields: { source: "Seat scan", role: "Fractional CFO", type: "Fractional", status: "Ended", end: "2025", start: "2023", function: "Finance", operator: P.orrin }, holderFrom: "public profile", verified: false },
    ],
  };
  writeFileSync(p, JSON.stringify(held));
  const r = run(p, "--names");
  const t = JSON.parse(readFileSync(p, "utf8")) as { engagements: Eng[] };
  const e = (psid: string) => t.engagements.find((x) => x.id === pastId(psid));
  check("a seat that has a holder keeps it", r.status === 0 && e("PSFX-001")?.fields.operator === "Kept Holdername", r.stderr);
  check("a public-profile name on a seat whose row is outside the United States comes off", !e("PSFX-002")?.fields.operator && !e("PSFX-002")?.holderFrom && /names taken off them and California's: 1; named seats outside the United States or in California: 0/.test(r.stdout), r.stdout);
}
{
  // The refusal: a seat outside the United States with a name that didn't come from public profiles.
  const p = path.join(dir, "intel-seed-refuse.json");
  const bad = { ...seed, companies: [...seed.companies, { id: "c_bluefin", fields: { name: "Bluefin Fixture Analytics" } }], engagements: [...seed.engagements, { id: pastId("PSFX-002"), companyId: "c_bluefin", fields: { source: "Seat scan", role: "Fractional CFO", type: "Fractional", status: "Ended", end: "2025", operator: P.orrin }, verified: false }] };
  const before = JSON.stringify(bad);
  writeFileSync(p, before);
  const r = run(p, "--names");
  check("refuses to write when a seat outside the United States would carry a name", r.status === 1 && /1 seats outside the United States or in California would carry a name\. Nothing was written\./.test(r.stderr) && readFileSync(p, "utf8") === before, r.stdout + r.stderr);
  check("  and the refusal prints no name", !PEOPLE.some((x) => (r.stdout + r.stderr).includes(x)));
}

/* ---------- 2. the firm rule ---------- */

/* ---------- person keys on current seats: add-seat-scan.mjs --backfill-holder-keys ---------- */

console.log("\nPerson keys on current seats");
{
  const p = path.join(dir, "intel-seed-keys.json");
  writeFileSync(p, JSON.stringify(seed, null, 1));
  const before = readFileSync(p, "utf8");
  const SCAN_HEAD = "seat_id,person_name,person_sales_nav_id,seat_title,company_name,company_sales_nav_id,company_linkedin_url,function,role_category,is_gtm,role_type,start_month_est,end_month,is_current,tenure_months,person_location,country,source,source_query,captured_on,company_website,company_industry,company_employee_range,company_employee_count,company_rn_revenue_bucket,company_about,company_likely_fractional_provider";
  const scanCsv = path.join(dir, "current-seats.csv");
  // The seed's current seat at Quarry, by the first batch's id ("e_ss_" + the seat id's letters and digits), held by the person of PSFX-007 and PSFX-011.
  const scanRows = [
    { seat_id: "quarry-current", person_name: P.ilse, person_sales_nav_id: "NAVPASTSAME", seat_title: "Changed Title Fixture", company_name: "Renamed Fixture Co", function: "Sales", start_month_est: "2019-01", country: "Fixtureland", person_location: "Springfield Fixtureville" },
    { seat_id: "not-on-the-seed", person_name: P.elspeth, person_sales_nav_id: "NAVPAST9999", seat_title: "Fractional CRO", company_name: "Nowhere Fixture Co" },
  ];
  writeFileSync(scanCsv, [SCAN_HEAD, ...scanRows.map((r) => csvLine(SCAN_HEAD, r))].join("\n") + "\n");
  const backfill = (...extra: string[]) =>
    spawnSync(process.execPath, [path.join(ROOT, "scripts", "add-seat-scan.mjs"), scanCsv, "--seed", p, "--no-seal", "--backfill-holder-keys", ...extra], { cwd: ROOT, encoding: "utf8", env: { ...process.env, RN_INTEL_SEED_KEY: TEST_KEY } });
  const d = backfill("--dry-run");
  check("backfill: a dry run counts and writes nothing", d.status === 0 && /person keys added: 1;/.test(d.stdout) && readFileSync(p, "utf8") === before, d.stdout + d.stderr);
  const b = backfill();
  const k = JSON.parse(readFileSync(p, "utf8")) as typeof seed & { engagements: Eng[] };
  const cur = k.engagements.find((e) => e.id === "e_ss_quarrycurrent")!;
  check("backfill: the seat on file gets its holder's key (found by its id)", b.status === 0 && cur.holderKey === personKeyOf("NAVPASTSAME") && /seats on file matched by seat id: 1 \(not on the seed: 1\)/.test(b.stdout), b.stdout + b.stderr);
  const { holderKey: _k, ...rest } = cur;
  check("backfill: nothing else changes (the row's other title, company and start are not read)", JSON.stringify({ ...k, engagements: k.engagements.map((e) => (e.id === cur.id ? rest : e)) }) === JSON.stringify(JSON.parse(before)) && k.engagements.length === seed.engagements.length && k.companies.length === seed.companies.length);
  check("backfill: counts people, prints no name, key or profile id", /distinct people: 1, people with 2\+ current seats: 0/.test(b.stdout) && !PEOPLE.some((x) => b.stdout.includes(x)) && !b.stdout.includes(cur.holderKey!) && !leaks(b.stdout + b.stderr).length, b.stdout);
  const keyed = readFileSync(p, "utf8");
  const again = backfill();
  check("backfill: a re-run changes nothing", again.status === 0 && /person keys added: 0; already there: 1;/.test(again.stdout) && readFileSync(p, "utf8") === keyed, again.stdout);
  const ps = run(p, "--companies", tabPath);
  check("past seats join the person who holds a current seat", ps.status === 0 && /2 ended seats \(1 people\) join a person with a current seat \(1 people keyed on current seats\); people with 2\+ seats on the seed: 1/.test(ps.stdout), ps.stdout.split("\n").filter((l) => l.startsWith("people")));
}

/* ---------- a person's further current seats under one seat_id (add-seat-scan.mjs, add-seat-names.mjs) ---------- */

console.log("\nA person's further seats");
{
  const scanId = (k: string) => `e_ss_${createHmac("sha256", Buffer.from(TEST_KEY, "base64")).update(`seat-scan:${k}`).digest("hex").slice(0, 20)}`;
  const p = path.join(dir, "intel-seed-further.json");
  // The seat the first import made for fx-p1 is at Alpha (the person's second row in this file).
  const fseed = {
    ...seed,
    companies: [...seed.companies, { id: "c_alphafx", fields: { name: "Alpha Fixture Co", website: "alpha-fixture.example.com" } }],
    engagements: [...seed.engagements, { id: scanId("fx-p1"), companyId: "c_alphafx", fields: { source: "Seat scan", role: "Fractional CMO", type: "Fractional", status: "Active", end: "Ongoing", start: "2025-02", function: "Marketing" }, verified: false }],
  };
  writeFileSync(p, JSON.stringify(fseed));
  const SCAN_HEAD = "seat_id,person_name,person_sales_nav_id,seat_title,company_name,company_sales_nav_id,company_linkedin_url,function,role_category,is_gtm,role_type,start_month_est,end_month,is_current,tenure_months,person_location,country,source,source_query,captured_on,company_website,company_industry,company_employee_range,company_employee_count,company_rn_revenue_bucket,company_about,company_likely_fractional_provider";
  const b = { role_type: "Fractional", is_current: "TRUE", person_location: "Springfield Fixtureville", source: "fixture source", source_query: "fixture query", captured_on: "2026-10-03", function: "Marketing", role_category: "Marketing", is_gtm: "TRUE" };
  const fRows = [
    { ...b, seat_id: "fx-p1", person_name: P.zelda, person_sales_nav_id: "NAVSAME1", seat_title: "Fractional CMO", company_name: "Bravo Fixture Labs", company_sales_nav_id: "NAVCOB", start_month_est: "2025-06", country: US },
    { ...b, seat_id: "fx-p1", person_name: P.zelda, person_sales_nav_id: "NAVSAME1", seat_title: "Fractional CMO", company_name: "Alpha Fixture Co", company_sales_nav_id: "NAVCOA", start_month_est: "2025-02", country: US },
    // The same person, company and title again (captured by a second search): one seat.
    { ...b, seat_id: "fx-p1", person_name: P.zelda, person_sales_nav_id: "NAVSAME1", seat_title: "Fractional CMO", company_name: "Alpha Fixture Co", company_sales_nav_id: "NAVCOA", start_month_est: "2025-02", country: US, source_query: "another query" },
    // Another title at a company the person already has a row at.
    { ...b, seat_id: "fx-p1", person_name: P.zelda, person_sales_nav_id: "NAVSAME1", seat_title: "Fractional Head of Growth", company_name: "Bravo Fixture Labs", company_sales_nav_id: "NAVCOB", function: "Growth", start_month_est: "2026-01", country: US },
    { ...b, seat_id: "fx-p2", person_name: P.orrin, person_sales_nav_id: "NAVSOLO2", seat_title: "Fractional VP Sales", company_name: "Charlie Fixture Inc", company_sales_nav_id: "NAVCOC", function: "Sales", start_month_est: "2025-09", country: "Fixtureland" },
  ];
  const fCsv = path.join(dir, "seats-further.csv");
  writeFileSync(fCsv, [SCAN_HEAD, ...fRows.map((r) => csvLine(SCAN_HEAD, r))].join("\n") + "\n");
  const scan = (script: string, ...extra: string[]) =>
    spawnSync(process.execPath, [path.join(ROOT, "scripts", script), fCsv, "--seed", p, "--no-seal", ...extra], { cwd: ROOT, encoding: "utf8", env: { ...process.env, RN_INTEL_SEED_KEY: TEST_KEY } });
  const dryF = scan("add-seat-scan.mjs", "--dry-run", "--counts-only");
  check("further seats: a dry run counts them and writes nothing", dryF.status === 0 && /a person's further seats \(one seat_id, another company or title\): 2 rows past the id checks, 2 seats added for 1 people/.test(dryF.stdout) && readFileSync(p, "utf8") === JSON.stringify(fseed), dryF.stdout + dryF.stderr);
  const r1 = scan("add-seat-scan.mjs");
  const t = JSON.parse(readFileSync(p, "utf8")) as { engagements: Eng[]; companies: Co[] };
  const at = (name: string) => t.engagements.filter((e) => t.companies.find((c) => c.id === e.companyId)?.fields.name === name);
  check("further seats: the row at the seat's company on the seed keeps the seat_id's own id (a claim never moves), the identical row is one seat", r1.status === 0 && at("Alpha Fixture Co").length === 1 && at("Alpha Fixture Co")[0].id === scanId("fx-p1") && /dropped \(same seat twice in the file\): 1/.test(r1.stdout), r1.stdout + r1.stderr);
  const bravo = at("Bravo Fixture Labs");
  check(
    "further seats: another company's row gets HMAC(seat_id:company key), another title there its own id too",
    bravo.length === 2 && bravo.some((e) => e.id === scanId("fx-p1:NAVCOB") && e.fields.role === "Fractional CMO") && bravo.some((e) => e.fields.role === "Fractional Head of Growth" && /^e_ss_[0-9a-f]{20}$/.test(e.id) && e.id !== scanId("fx-p1:NAVCOB")),
    bravo.map((e) => [e.id, e.fields.role]),
  );
  check("further seats: each new seat carries the holder's person key, the same for one person", bravo.every((e) => e.holderKey === personKeyOf("NAVSAME1")) && at("Charlie Fixture Inc")[0]?.holderKey === personKeyOf("NAVSOLO2"));
  const bf = scan("add-seat-scan.mjs", "--backfill-holder-keys");
  const t2 = JSON.parse(readFileSync(p, "utf8")) as { engagements: Eng[] };
  check("further seats: the backfill gives the seat on file the same key, and counts 3 seats for that person", bf.status === 0 && t2.engagements.find((e) => e.id === scanId("fx-p1"))?.holderKey === personKeyOf("NAVSAME1") && /distinct people: 2, people with 2\+ current seats: 1/.test(bf.stdout), bf.stdout);
  const nm = scan("add-seat-names.mjs");
  const t3 = JSON.parse(readFileSync(p, "utf8")) as { engagements: Eng[] };
  const zelda = t3.engagements.filter((e) => e.fields.operator === P.zelda);
  check("further seats: add-seat-names finds each by its own id and names all three United States seats", nm.status === 0 && zelda.length === 3 && zelda.every((e) => e.holderFrom === "public profile") && /the same seat twice in the file: 1/.test(nm.stdout) && !t3.engagements.some((e) => e.fields.operator === P.orrin), nm.stdout + nm.stderr);
  const before2 = readFileSync(p, "utf8");
  const again = scan("add-seat-scan.mjs");
  check("further seats: a re-run adds nothing", again.status === 0 && /seats added: 0/.test(again.stdout) && JSON.stringify(JSON.parse(readFileSync(p, "utf8")).engagements) === JSON.stringify(JSON.parse(before2).engagements), again.stdout);
  check("further seats: no person's name, profile id or key printed", ![dryF, r1, bf, nm, again].some((x) => PEOPLE.some((n) => x.stdout.includes(n)) || /NAVSAME|NAVSOLO|p_[0-9a-f]{20}/.test(x.stdout + x.stderr)));
}

console.log("\nThe firm rule");
{
  const FR = await import("../lib/firmRemoval.ts");
  const mk = (status: string) => ({
    builtAt: "2026-11-01T00:00:00Z",
    members: [],
    companies: [{ id: "c_three", fields: { name: "Threeseat Fixture Pay", employees: "11–50" } }],
    engagements: ["CMO", "CFO", "CRO"].map((t, i) => ({ id: `e_three_${i}`, companyId: "c_three", fields: { source: "Seat scan", role: `Fractional ${t}`, status, ...(status === "Ended" ? { end: "2024" } : { end: "Ongoing" }) }, verified: false })),
    contacts: [],
  });
  const ended = mk("Ended");
  FR.cleanSeed(ended as never);
  check("three ended seats at a company don't make it a firm", ended.companies.length === 1 && ended.engagements.length === 3);
  check("  nor at run time (seedFirmIds)", !FR.seedFirmIds(mk("Ended") as never).has("c_three"));
  const current = mk("Active");
  FR.cleanSeed(current as never);
  check("three current ones still do (several fractionals work there)", current.companies.length === 0 && FR.seedFirmIds(mk("Active") as never).get("c_three")?.reason === "several fractionals work there");
}

/* ---------- interim seats: add-past-seats.mjs --interim ---------- */

console.log("\nInterim seats");
const interimId = (id: string) => `e_is_${createHmac("sha256", Buffer.from(TEST_KEY, "base64")).update(`interim-seat:${id}`).digest("hex").slice(0, 20)}`;
const IP = { marisol: "Marisol Thackeray", lucan: "Lucan Pembrook", nerys: "Nerys Galloway", tamsin: "Tamsin Oakhurst", bertil: "Bertil Ravensworth" };
const INT_HEAD = "interim_seat_id,person_name,person_sales_nav_id,seat_title,company_name,function,role_category,is_gtm,role_type,start_year,end_year,duration_months,is_current,person_current_title,person_current_company,person_location,country,source,source_query,captured_on";
const ibase = (o: Record<string, string>) => ({ ...base({ role_type: "Interim", source: "fixture interim source", country: US, ...o }) });
const interimRows = [
  ibase({ interim_seat_id: "LIFX-001", person_name: IP.marisol, seat_title: "Interim CFO", company_name: "Thistle Fixture Clinics", function: "Finance", role_category: "Non-GTM", is_gtm: "FALSE", start_year: "2022", end_year: "2023" }),
  // At a company the past seats put on the seed (by name).
  ibase({ interim_seat_id: "LIFX-002", person_name: IP.lucan, seat_title: "Interim CEO", company_name: "Larkfield Fixture Pay", function: "Executive", role_category: "Non-GTM", is_gtm: "FALSE", start_year: "2024", end_year: "2025" }),
  // The same id text as a past seat: its own seat (another HMAC prefix), not a re-run.
  ibase({ interim_seat_id: "PSFX-001", person_name: IP.nerys, seat_title: "Interim COO", company_name: "Kestrel Fixture Mills", function: "Operations", role_category: "Non-GTM", is_gtm: "FALSE", start_year: "2024", end_year: "2025" }),
  // The firm that placed them, not a client: dropped.
  ibase({ interim_seat_id: "LIFX-d01", person_name: IP.tamsin, seat_title: "Interim CFO", company_name: "WittKieffer", function: "Finance", role_category: "Non-GTM", is_gtm: "FALSE", start_year: "2022", end_year: "2023" }),
  ibase({ interim_seat_id: "LIFX-d02", person_name: IP.bertil, seat_title: "Interim VP Sales", company_name: "Bramble Fixture Staffing Group", function: "Sales", start_year: "2022", end_year: "2023" }),
  ibase({ interim_seat_id: "", person_name: IP.bertil, seat_title: "Interim CMO", company_name: "No Id Interim Fixture", start_year: "2022", end_year: "2023" }),
];
const interimCsv = path.join(dir, "interim-seats.csv");
writeFileSync(interimCsv, [INT_HEAD, ...interimRows.map((r) => csvLine(INT_HEAD, r))].join("\n") + "\n");
{
  const runI = (seedFile: string, ...extra: string[]) =>
    spawnSync(process.execPath, [path.join(ROOT, "scripts", "add-past-seats.mjs"), interimCsv, "--seed", seedFile, "--no-seal", ...extra], { cwd: ROOT, encoding: "utf8", env: { ...process.env, RN_INTEL_SEED_KEY: TEST_KEY } });
  const before = readFileSync(namedSeedPath, "utf8");
  const wrong = runI(namedSeedPath);
  check("interim: without --interim the file is refused (no past_seat_id)", wrong.status === 1 && /no past_seat_id column/.test(wrong.stderr) && readFileSync(namedSeedPath, "utf8") === before, wrong.stderr);
  const ri = runI(namedSeedPath, "--interim", "--companies", tabPath, "--names");
  const out = ri.stdout;
  check("interim: runs", ri.status === 0, ri.stderr + out);
  check("interim: 3 kept, 2 at search or staffing firms dropped, 1 with no id", line(out, /seats added: (\d+)/) === "3" && dropCount(out, "executive search or staffing firm (staffingFirm)") === "2" && dropCount(out, "no interim seat id") === "1", out);
  const t = JSON.parse(readFileSync(namedSeedPath, "utf8")) as { engagements: Eng[]; companies: Co[] };
  const ints = t.engagements.filter((e) => e.id.startsWith("e_is_"));
  const iseat = (id: string) => t.engagements.find((e) => e.id === interimId(id));
  check("interim: ids are e_is_ and the HMAC of interim_seat_id", ints.length === 3 && ["LIFX-001", "LIFX-002", "PSFX-001"].every((x) => !!iseat(x)));
  check("interim: the same id text as a past seat is its own seat", interimId("PSFX-001") !== pastId("PSFX-001") && !!t.engagements.find((e) => e.id === pastId("PSFX-001")));
  check("interim: type Interim, status Ended, source Seat scan (members read Revenue Nomad research), years alone", ints.every((e) => e.fields.type === "Interim" && e.fields.status === "Ended" && e.fields.source === "Seat scan" && /^\d{4}$/.test(e.fields.end)));
  check("interim: matched by name to a company on file", iseat("LIFX-002")?.companyId === t.engagements.find((e) => e.id === pastId("PSFX-009a"))?.companyId);
  check("interim: no company for a staffing firm", !t.companies.some((c) => /WittKieffer|Bramble Fixture Staffing/.test(c.fields.name ?? "")));
  check("interim: a United States holder is named, as on past seats", iseat("LIFX-001")?.fields.operator === IP.marisol && iseat("LIFX-001")?.holderFrom === "public profile");
  check("interim: the new companies with no website are counted for the website finder", /new companies with no website \(the website finder's queue, then About\): 1 of 1/.test(out), out.split("\n").filter((l) => l.startsWith("new companies")));
  check("interim: prints no person's name", !Object.values(IP).some((n) => (out + ri.stderr).includes(n)));
  const text = readFileSync(namedSeedPath, "utf8");
  const again = runI(namedSeedPath, "--interim", "--companies", tabPath, "--names");
  check("interim: a re-run adds nothing and leaves the seed as it was", again.status === 0 && line(again.stdout, /seats added: (\d+)/) === "0" && readFileSync(namedSeedPath, "utf8") === text, again.stdout + again.stderr);
  const SI = await import("./seat-import.mjs");
  check("staffingFirm: search and staffing firms by name and words, not clients that share a word", SI.staffingFirm("WittKieffer") && SI.staffingFirm("BE SMITH/AMN HEALTHCARE") && SI.staffingFirm("Tatum by Randstad") && SI.staffingFirm("Acme Fixture Recruiting") && !SI.staffingFirm("Hays County Fixture Clinic") && !SI.staffingFirm("Duke Fixture Research Institute") && !SI.staffingFirm("Thistle Fixture Clinics"));
}

/* ---------- firm clients: add-firm-clients.mjs ---------- */

console.log("\nFirm clients");
const FC_HEAD =
  "client_name,provider_firms,role_or_service,function,evidence_type,confidence,country,year,note,source_urls,already_on_file,slug,domain_guess_1,domain_guess_2,matched_domain,match_method,clay_company_name,linkedin_url,website,industry,employee_range,employee_count,revenue_range_provider,hq_country,company_about,source,domain_guess_3,domain_guess_4,domain_guess_5,domain_guess_6,domain_guess_7";
const FC_SRC = "Provider firm client lists, collected fixture day";
const fcRows = [
  // A leadership seat with a year, a new company with its Clay match.
  { client_name: "Mossgrove Fixture Foods", provider_firms: "Chief Outsiders", role_or_service: "Fractional CMO", function: "Marketing", evidence_type: "case_study", confidence: "high", country: "United States", year: "2024", source_urls: "https://firm-one.example.com/case/mossgrove", matched_domain: "mossgrove-fixture.example.com", match_method: "domain+name+country", website: "https://mossgrove-fixture.example.com", industry: "Food and Beverage Services", employee_range: "51-200", revenue_range_provider: "10M-25M", hq_country: "United States", company_about: "Mossgrove Fixture Foods bakes bread for cafes.", source: FC_SRC },
  // The same client and firm again: one seat, both pages.
  { client_name: "Mossgrove Fixture Foods", provider_firms: "Chief Outsiders", role_or_service: "Fractional CMO", function: "Marketing", evidence_type: "testimonial", confidence: "high", country: "United States", source_urls: "https://firm-one.example.com/testimonials", matched_domain: "mossgrove-fixture.example.com", match_method: "domain+name+country", source: FC_SRC },
  // A service at the same company (a logo wall: needs review).
  { client_name: "Mossgrove Fixture Foods", provider_firms: "Kruze Consulting", role_or_service: "outsourced accounting", function: "Finance", evidence_type: "logo", confidence: "medium", country: "United States", source_urls: "https://firm-two.example.com/clients", matched_domain: "mossgrove-fixture.example.com", match_method: "domain+name+country", source: FC_SRC },
  // Two services at a company with no match: name only, the row's country as its HQ, no website (the website finder's queue).
  { client_name: "Pebblecroft Fixture Dental", provider_firms: "Pilot", role_or_service: "", function: "Finance", evidence_type: "logo", confidence: "medium", country: "United States", source_urls: "https://firm-three.example.com/customers", match_method: "no_match", source: FC_SRC },
  { client_name: "Pebblecroft Fixture Dental", provider_firms: "MarketerHire", role_or_service: "Freelance marketer", function: "Marketing", evidence_type: "testimonial", confidence: "high", country: "United States", source_urls: "https://firm-four.example.com/stories", match_method: "no_match", source: FC_SRC },
  // Two leadership firms on one row, no role: a leadership seat for each.
  { client_name: "Fernhollow Fixture Tools", provider_firms: "Chief Outsiders, Sales Xceleration", role_or_service: "", function: "Multi, Sales", evidence_type: "case_study", confidence: "high", country: "United States", source_urls: "https://firm-one.example.com/case/fernhollow", match_method: "no_match", source: FC_SRC },
  // A firm named as a client: never a company.
  { client_name: "Kalungi", provider_firms: "Ampleo", role_or_service: "Fractional CFO", function: "Finance", evidence_type: "logo", confidence: "medium", country: "United States", match_method: "no_match", source: FC_SRC },
  // Already on file (from the past seats): matched by its website, no new company.
  { client_name: "Kestrel Fixture Mills Ltd", provider_firms: "TechCXO", role_or_service: "Fractional CTO", function: "Technology", evidence_type: "testimonial", confidence: "high", country: "United Kingdom", already_on_file: "Past Companies tab", source_urls: "https://firm-five.example.com/kestrel", matched_domain: "kestrel-fixture.example.com", match_method: "already on file", source: FC_SRC },
  // Clutch: a firm whose name holds a comma, an interim role, Poland (a country Merlin reads).
  { client_name: "Quillmere Fixture Labs", provider_firms: "Solve For Fixture, llc (Clutch review)", role_or_service: "Interim CFO", function: "Finance", evidence_type: "clutch_review", confidence: "high", country: "Poland", year: "2023", note: "Software, 11-50 employees, reviewer is the founder", source_urls: "https://clutch.example.com/review/1", match_method: "no_match", source: "Clutch reviews of fractional providers, collected fixture day" },
  // Clutch, a country Merlin doesn't read: dropped.
  { client_name: "Tidewater Fixture Holdings", provider_firms: "Solve For Fixture, llc (Clutch review)", role_or_service: "Fractional CFO", function: "Finance", evidence_type: "clutch_review", confidence: "high", country: "British Virgin Islands", match_method: "no_match", source: "Clutch reviews of fractional providers, collected fixture day" },
  // A placeholder: dropped.
  { client_name: "Zq Fixture", provider_firms: "Chief Outsiders", role_or_service: "Fractional CMO", function: "Marketing", evidence_type: "logo", confidence: "medium", country: "United States", match_method: "skipped", source: FC_SRC },
];
const fcCsv = path.join(dir, "firm-clients.csv");
writeFileSync(fcCsv, [FC_HEAD, ...fcRows.map((r) => csvLine(FC_HEAD, r))].join("\n") + "\n");
const FIRMS = ["Chief Outsiders", "Kruze", "Pilot", "MarketerHire", "Sales Xceleration", "TechCXO", "Solve For Fixture", "Ampleo"];
{
  const runF = (seedFile: string, ...extra: string[]) =>
    spawnSync(process.execPath, [path.join(ROOT, "scripts", "add-firm-clients.mjs"), fcCsv, "--seed", seedFile, "--no-seal", ...extra], { cwd: ROOT, encoding: "utf8", env: { ...process.env, RN_INTEL_SEED_KEY: TEST_KEY } });
  const before = readFileSync(namedSeedPath, "utf8");
  const dryF = runF(namedSeedPath, "--dry-run", "--counts-only");
  check("firm clients: a dry run writes nothing", dryF.status === 0 && readFileSync(namedSeedPath, "utf8") === before, dryF.stderr);
  check("firm clients: --counts-only prints no firm or company name", !FIRMS.some((f) => dryF.stdout.includes(f)) && !/Mossgrove|Pebblecroft|Fernhollow|Quillmere|Kalungi/.test(dryF.stdout), dryF.stdout);
  const rf = runF(namedSeedPath);
  const out = rf.stdout;
  check("firm clients: runs", rf.status === 0, rf.stderr + out);
  check("firm clients: 8 seats (7 from firm websites, 1 Clutch), 5 leadership, 3 services", /seats added: 8 \(firm websites 7, Clutch 1\); leadership seats 5 \(firm websites 4, Clutch 1\) \(Interim 1 \(firm websites 0, Clutch 1\)\); fractional services, not hires 3 \(firm websites 3, Clutch 0\)/.test(out), out);
  check("firm clients: drops a firm, a placeholder and a country Merlin doesn't read", /dropped \(a fractional firm, not a client .*\): 1 /.test(out) && /dropped \(placeholder or too-short name \(match_method skipped\)\): 1 /.test(out) && /dropped \(a country Merlin doesn't read \(lib\/geo.ts\)\): 1 \(firm websites 0, Clutch 1\)/.test(out), out);
  check("firm clients: the same client and firm twice is one seat", /the same client and firm twice in this file \(one seat\): 1 \(firm websites 1/.test(out), out);
  check("firm clients: an already_on_file row matches its company by website", /companies matched on file: 1 \(by website 1\); already_on_file rows found 1/.test(out) && /companies created: 4 \(with a Clay match 1, by name 3\)/.test(out), out);
  check("firm clients: new companies with no website are counted for the website finder", /new companies with no website \(the website finder's queue, then About\): 3 of 4/.test(out), out);
  const t = JSON.parse(readFileSync(namedSeedPath, "utf8")) as { engagements: (Eng & { service?: boolean; needsReview?: boolean; firmClient?: { firms: string[]; urls: string[]; detail: string[]; confidence: string; year?: string } })[]; companies: Co[] };
  const fcs = t.engagements.filter((e) => e.id.startsWith("e_fc_"));
  const coN = (n: string) => t.companies.find((c) => c.fields.name === n);
  const at = (n: string) => fcs.filter((e) => e.companyId === coN(n)?.id);
  check("firm clients: ids are e_fc_ and an HMAC", fcs.length === 8 && fcs.every((e) => /^e_fc_[0-9a-f]{20}$/.test(e.id)));
  const moss = at("Mossgrove Fixture Foods");
  const mossLead = moss.find((e) => !e.service)!;
  const mossSvc = moss.find((e) => e.service)!;
  check("firm clients: a leadership seat: source Firm client list, type Fractional, its role and function, the year as start and end, status Ended, nobody in it", mossLead?.fields.source === "Firm client list" && mossLead.fields.type === "Fractional" && mossLead.fields.role === "Fractional CMO" && mossLead.fields.function === "Marketing" && mossLead.fields.start === "2024" && mossLead.fields.end === "2024" && mossLead.fields.status === "Ended" && !mossLead.fields.operator, mossLead);
  check("firm clients: its evidence is for admins, on the record outside its fields: firms, how, both pages", mossLead.firmClient?.firms.join() === "Chief Outsiders" && mossLead.firmClient.urls.length === 2 && mossLead.firmClient.detail.join() === "case study,testimonial" && !JSON.stringify(mossLead.fields).includes("Chief Outsiders") && !mossLead.needsReview);
  check("firm clients: a service: type Project, marked service, a logo wall needs review, no status without a year", mossSvc?.fields.type === "Project" && mossSvc.service === true && mossSvc.needsReview === true && mossSvc.fields.role === "Outsourced accounting" && !mossSvc.fields.status && !mossSvc.fields.start, mossSvc);
  check("firm clients: a new company with its Clay match (website, size, revenue, About, HQ)", coN("Mossgrove Fixture Foods")?.fields.website === "mossgrove-fixture.example.com" && !!coN("Mossgrove Fixture Foods")?.fields.employees && !!coN("Mossgrove Fixture Foods")?.fields.revenue && coN("Mossgrove Fixture Foods")?.fields.hq === "United States", coN("Mossgrove Fixture Foods")?.fields);
  check("firm clients: a no_match company: its name and the row's country, no website", coN("Pebblecroft Fixture Dental")?.fields.hq === "United States" && !coN("Pebblecroft Fixture Dental")?.fields.website && at("Pebblecroft Fixture Dental").length === 2 && at("Pebblecroft Fixture Dental").every((e) => e.service));
  check("firm clients: two firms on one row make a seat each, leadership (a blank role at leadership firms), function Sales", at("Fernhollow Fixture Tools").length === 2 && at("Fernhollow Fixture Tools").every((e) => !e.service && e.fields.type === "Fractional" && e.fields.function === "Sales" && !e.fields.role));
  const kesCo = t.engagements.find((e) => e.id === pastId("PSFX-001"))!.companyId;
  check("firm clients: already on file adds the seat to that company, no duplicate company", fcs.some((e) => e.companyId === kesCo && e.fields.role === "Fractional CTO") && !coN("Kestrel Fixture Mills Ltd"));
  const quill = at("Quillmere Fixture Labs")[0];
  check("firm clients: a Clutch row: source Clutch review, type Interim, one firm whose name holds a comma, the year", quill?.fields.source === "Clutch review" && quill.fields.type === "Interim" && quill.firmClient?.firms.join() === "Solve For Fixture, llc" && quill.fields.end === "2023" && quill.firmClient?.detail.join() === "Clutch review", quill);
  check("firm clients: no firm is ever a client company", !t.companies.some((c) => FIRMS.some((f) => (c.fields.name ?? "").includes(f)) || /Kalungi|Tidewater|^Zq Fixture$/.test(c.fields.name ?? "")));
  const text = readFileSync(namedSeedPath, "utf8");
  const again = runF(namedSeedPath);
  check("firm clients: a re-run adds nothing and leaves the seed as it was", again.status === 0 && /seats added: 0 /.test(again.stdout) && readFileSync(namedSeedPath, "utf8") === text, again.stdout + again.stderr);
  const TF = await import("../lib/tableFields.ts");
  // The company page's "From ..." words (env.tsx loads CSS, so it is read as text here).
  const sayBlock = readFileSync(path.join(ROOT, "app/post/company/sections/env.tsx"), "utf8").match(/export const SOURCE_SAY[^}]*\}/)?.[0] ?? "";
  check("firm clients: members read Named by a fractional firm and Clutch review", TF.SOURCE_LABEL["Firm client list"] === "Named by a fractional firm" && TF.SOURCE_LABEL["Clutch review"] === "Clutch review" && TF.sourceWithDate("Firm client list", null) === "Named by a fractional firm");
  check("no member-facing source label names LinkedIn or Sales Navigator", ![...Object.values(TF.SOURCE_LABEL), sayBlock].some((l) => /linkedin|sales navigator/i.test(l)) && /"Firm client list": "fractional firms' client lists"/.test(sayBlock) && (TF.SOURCES as readonly string[]).includes("Firm client list") && (TF.SOURCES as readonly string[]).includes("Clutch review"));
}

/* ---------- 3. in process: the table on the seed the script wrote (with --names) ---------- */

console.log("\nIn process");
const procDir = path.join(dir, "proc");
mkdirSync(procDir);
Object.assign(process.env, { RN_DATA_DIR: procDir, RN_INTEL_SEED: namedSeedPath, RN_INTEL_SEED_KEY: TEST_KEY, RN_LOGO_LOOKUP: "off", RN_STARTER_CREDITS: "25", RN_ID_SECRET: "pastseats-test", RN_SCAN_TEST: "1", RN_FREE_COMPANY: "off", RN_ADMIN_EMAILS: "admin-past@example.com" });
for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_UNVERIFIED_NAMES_UNTIL"]) delete process.env[k];
const T = await import("../lib/table.ts");
const HA = await import("../lib/hireAlerts.ts");
const M = await import("../app/post/model.ts");
const sm = seed.members[0];
const named = JSON.parse(readFileSync(namedSeedPath, "utf8")) as { engagements: Eng[]; companies: Co[] };
const pub = (id: string) => T.tableInternals.pubId(id);
const kesId = named.engagements.find((e) => e.id === pastId("PSFX-001"))!.companyId;
const corvidId = named.engagements.find((e) => e.id === pastId("PSFX-003"))!.companyId;
const bluefinId = named.engagements.find((e) => e.id === pastId("PSFX-002"))!.companyId;
for (const id of [kesId, corvidId, bluefinId]) await T.perform(sm.token, { type: "unlock", entity: "company", id: pub(id), field: "identity" });
type Cell = { s: string; v?: string; unverified?: boolean };
type ViewSeat = { id: string; source: string; claimable?: boolean; yours?: boolean; cells: Record<string, Cell> };
type ViewCo = { id: string; name: string; engagements: ViewSeat[]; friendly: { fractional: number; tier: string | null; recent: number; functions: string[] } };
const view = async () => (await T.buildView(sm.token)) as unknown as { companies: ViewCo[]; me: { credits: number } };
let v = await view();
const vCo = (id: string) => v.companies.find((c) => c.id === pub(id))!;
const vSeat = (psid: string) => v.companies.flatMap((c) => c.engagements).find((e) => e.id === pub(pastId(psid)))!;
const ks = vSeat("PSFX-001");
check("an ended seat reads as Revenue Nomad research's, status Ended, its start free", ks?.source === "Seat scan" && ks.cells.status?.s === "value" && ks.cells.status.v === "Ended" && ks.cells.start?.s === "value" && ks.cells.start.v === "2022", ks?.cells);
check("its dated end is a paid fact (locked)", ks.cells.end?.s === "locked", ks.cells.end);
// Fellow fractionals are free (PEERS_FREE): the member opened these companies, so who held the seat shows, with the role.
check("a named ended seat: its holder free with the role once the company is open, unverified, and claimable", ks.cells.operator?.s === "value" && ks.cells.operator.v === P.zelda && ks.cells.operator.unverified === true && ks.cells.role?.s === "value" && !!ks.claimable, ks);
check("an unnamed ended seat: its role free, its holder empty and claimable", vSeat("PSFX-002").cells.role?.s === "value" && (vSeat("PSFX-002").cells.operator?.s ?? "empty") === "empty" && !!vSeat("PSFX-002").claimable, vSeat("PSFX-002").cells);
check("a company whose only seat ended counts one fractional hire (Past seat or Recent seat, fractional friendly)", vCo(corvidId).friendly.fractional === 1 && vCo(corvidId).friendly.functions.includes("Sales") && ["High", "Medium"].includes(vCo(corvidId).friendly.tier ?? ""), vCo(corvidId).friendly);
check("no other person's name in the view: only who held seats at the companies the member opened", PEOPLE.filter((p) => JSON.stringify(v).includes(p)).every((p) => p === P.zelda || p === P.pella), PEOPLE.filter((p) => JSON.stringify(v).includes(p)));
const c0 = v.me.credits;
const already = await T.perform(sm.token, { type: "unlock", entity: "engagement", id: ks.id, field: "operator" }).then(() => null, (e: Error) => e.message);
v = await view();
check("the holder's name on an ended seat costs nothing: nothing to unlock", /Nothing here is locked/.test(already ?? "") && v.me.credits === c0, { credits: [c0, v.me.credits], already });
let r: { cells?: { field: string; cell: Cell }[] };
const c1 = v.me.credits;
r = (await T.perform(sm.token, { type: "unlock", entity: "engagement", id: ks.id, field: "end" })) as { cells?: { field: string; cell: Cell }[] };
v = await view();
check("the end year unlocks for 1 credit and reads 2024", v.me.credits === c1 - 1 && vSeat("PSFX-001").cells.end?.v === "2024", vSeat("PSFX-001").cells.end);
const claimed = (await T.perform(sm.token, { type: "claimSeat", engagementId: vSeat("PSFX-002").id })) as { message?: string };
v = await view();
check("a member can claim an ended seat as theirs (Your seats)", /It's yours/.test(claimed.message ?? "") && !!vSeat("PSFX-002").yours && vSeat("PSFX-002").cells.operator?.v === sm.name, claimed);

// The person key stays on the server: not in a member's view (whole or packed), an admin's, the connector's answer, the export, or the log.
{
  const KEYS = [...new Set(named.engagements.map((e) => e.holderKey).filter((x): x is string => !!x))];
  const W = await import("../lib/viewWire.ts");
  const MCP = await import("../lib/mcp/tools.ts");
  const has = (text: string) => KEYS.some((x) => text.includes(x)) || /holderKey|enrichedBy|past seats/.test(text);
  const mv = await T.buildView(sm.token);
  const av = await T.buildView(seed.members[1].token);
  const g = await MCP.getCompany({ member: sm, origin: "https://merlin.example.com" } as never, { company: "Kestrel Fixture Mills" });
  const exp = await T.exportState();
  check("there are person keys on the seed to look for", KEYS.length >= 10, KEYS.length);
  check("no person key or import mark in a member's view, whole or packed", !has(JSON.stringify(mv)) && !has(JSON.stringify(W.packView(mv))));
  check("no person key or import mark in an admin's view", !!(av as { me?: { admin?: boolean } }).me && !has(JSON.stringify(av)));
  check("no person key or import mark in the connector's get_company", JSON.stringify(g).includes("Kestrel") && !has(JSON.stringify(g)), JSON.stringify(g).slice(0, 200));
  check("no person key or import mark in the admin export", !has(JSON.stringify(exp)));
  check("(the import mark is on the seed, and stays there)", JSON.stringify(named.companies).includes('"enrichedBy"'));
}

// Interim seats and firm clients in the table: fractional friendly, and a service never makes a repeat hirer.
{
  const coIdOf = (name: string) => named2.companies.find((c) => c.fields.name === name)!.id;
  const named2 = JSON.parse(readFileSync(namedSeedPath, "utf8")) as { engagements: Eng[]; companies: Co[] };
  const infos = M.deriveAll((await view()).companies as never);
  const inf = (name: string) => infos.find((i) => i.c.id === pub(coIdOf(name)))!;
  const thistle = inf("Thistle Fixture Clinics");
  check("an interim seat counts as a fractional hire (fractional friendly, Past seat)", thistle.c.friendly.fractional === 1 && M.fitTier(thistle.c.friendly, thistle.engs.length).label === "Past seat" && thistle.engs.every((e) => M.isHire(e as never)), thistle.c.friendly);
  check("an interim seat reads type Interim, free", thistle.engs[0]?.cells.type?.s === "value" && (thistle.engs[0].cells.type as Cell).v === "Interim", thistle.engs[0]?.cells.type);
  const peb = inf("Pebblecroft Fixture Dental");
  check(
    "two fractional services in two functions: fractional friendly (a past seat on file), never a repeat hirer, no hire",
    peb.c.friendly.fractional === 0 && (peb.c.friendly as { services?: number }).services === 2 && peb.c.friendly.functions.length === 0 && !M.repeatHirer(peb) && M.fitTier(peb.c.friendly, peb.engs.length).label === "Past seat" && peb.c.friendly.score > 0 && peb.engs.every((e) => (e as { service?: boolean }).service === true && !M.isHire(e as never)),
    peb.c.friendly,
  );
  const moss = inf("Mossgrove Fixture Foods");
  check("a leadership seat and a service: one hire, not a repeat hirer", moss.c.friendly.fractional === 1 && (moss.c.friendly as { services?: number }).services === 1 && moss.c.friendly.functions.join() === "Marketing" && !M.repeatHirer(moss), moss.c.friendly);
  const fern = inf("Fernhollow Fixture Tools");
  check("two firms that placed leaders: two hires, a repeat hirer", fern.c.friendly.fractional === 2 && M.repeatHirer(fern), fern.c.friendly);
  check("the seats read Named by a fractional firm and Clutch review", peb.engs.every((e) => e.source === "Firm client list") && inf("Quillmere Fixture Labs").engs[0]?.source === "Clutch review");
  const W = await import("../lib/viewWire.ts");
  const MCP = await import("../lib/mcp/tools.ts");
  const adminOnly = (text: string) => /firmClient|needsReview|Chief Outsiders|Kruze|MarketerHire|Sales Xceleration|TechCXO|Solve For Fixture|firm-one\.example|clutch\.example|reviewer is the founder/.test(text);
  const mv = await T.buildView(sm.token);
  const av = await T.buildView(seed.members[1].token);
  const g = await MCP.getCompany({ member: sm, origin: "https://merlin.example.com" } as never, { company: "Kestrel Fixture Mills" });
  const exp = await T.exportState();
  check("no provider firm, page, note or review mark in a member's view, an admin's, the connector's get_company or the export", !adminOnly(JSON.stringify(mv)) && !adminOnly(JSON.stringify(W.packView(mv))) && !adminOnly(JSON.stringify(av)) && !adminOnly(JSON.stringify(g)) && !adminOnly(JSON.stringify(exp)));
  check("(the firms and pages are on the seed, for admins)", adminOnly(JSON.stringify(named2.engagements)));
  // The website finder (RN_WEBSITES) reads every company with no website it hasn't tried: the new ones from these imports are in its queue; About follows once a site is found.
  const WS = await import("../lib/websites/store.ts");
  const queue = new Set((await WS.websiteTargets()).map((x) => x.companyId));
  check("the website finder's queue holds the new companies with no website (interim, firm clients), not those with one", ["Thistle Fixture Clinics", "Pebblecroft Fixture Dental", "Fernhollow Fixture Tools", "Quillmere Fixture Labs"].every((n) => queue.has(coIdOf(n))) && !queue.has(coIdOf("Mossgrove Fixture Foods")));
}

// No hire alert, no new hire.
const [seedNow, stateNow] = await Promise.all([T.loadSeed(), T.loadState()]);
const added = HA.seatAddedTimes(seedNow, stateNow);
check("no ended seat has a seat-added time (never a new hire this week)", named.engagements.filter((e) => e.id.startsWith("e_ps_")).every((e) => !added.has(pub(e.id))));
const views = [{ id: "v_hires", name: "Hires any time", hiredFn: [], hiredWithin: 240, createdAt: new Date().toISOString() }];
const nowMs = Date.now();
const hits = await HA.newHires(sm as never, views as never, nowMs - 7 * 86_400_000, nowMs, added);
check("a saved view that follows hires gets no new hire from the ended seats", hits.length === 0, hits);
// And if one carried addedAt: Recently hired, which the hire alerts read, leaves an ended seat out.
const stamped = new Map(added);
for (const e of named.engagements) if (e.id.startsWith("e_ps_")) stamped.set(pub(e.id), nowMs - 3_600_000);
const wouldBe = await HA.newHires(sm as never, views as never, nowMs - 7 * 86_400_000, nowMs, stamped);
check("even with an addedAt stamped, an ended seat is no new hire (Recently hired leaves it out)", wouldBe.length === 0, wouldBe.map((h) => h.n));
// The hire alert's own reader (hiresOf) on the member's view: the company with only an ended seat.
const info = M.deriveAll((await view()).companies as never).find((i) => i.c.id === pub(corvidId))!;
check("Repeat hirer reads hires on file, ended ones too: one ended seat is not a repeat hirer, three are", !M.repeatHirer(info) && M.repeatHirer(M.deriveAll((await view()).companies as never).find((i) => i.c.id === pub(named.engagements.find((e) => e.id === pastId("PSFX-009a"))!.companyId))!));

// Recently hired and the "Recent seat" tag leave out a seat that ended; a year alone reads as its December everywhere.
{
  const H = await import("../lib/hired.ts");
  const infos = M.deriveAll((await view()).companies as never);
  const infoOf = (id: string) => infos.find((i) => i.c.id === pub(id))!;
  const emberInfo = infoOf("c_ember");
  const quarryInfo = infoOf("c_quarry");
  check("Recently hired: a company whose only seat ended has no recent hire, in any window", M.hiresOf(emberInfo, [], 0).length === 0 && M.hiresOf(emberInfo, [], 240).length === 0);
  check("Recently hired: next to an ended seat, the current one still counts", M.hiresOf(quarryInfo, [], 0).length === 1 && M.hiresOf(quarryInfo, [], 0)[0].id === pub("e_ss_quarrycurrent"));
  // Ember's seat started in 2024 (its December, under two years ago) and ended: not a recent seat.
  check("Recent seat: an ended seat that started in the last two years is not recent (server)", emberInfo.c.friendly.recent === 0, emberInfo.c.friendly);
  const noServer = (i: typeof emberInfo) => ({ ...i, c: { ...i.c, friendly: { ...i.c.friendly, recent: undefined } } }) as never;
  check("Recent seat: the app's own count agrees (an ended seat is not recent)", M.recentSeats(noServer(emberInfo)) === 0 && M.fitTier({ ...emberInfo.c.friendly, recent: 0 } as never, 1).label === "Past seat");
  check("a year alone reads as its December, on the server's and the app's clock alike", H.startMs("2025") === Date.UTC(2025, 11, 1) && H.startMs("2025-03") === Date.UTC(2025, 2, 1) && Number.isNaN(H.startMs("Ongoing")));
  // The claim page: an ended seat reads "2022 to 2024", never "since".
  const CT = await import("../lib/claimToken.ts");
  const SL = await import("../app/claim/seatLine.ts");
  const cp = await T.claimPage(CT.claimToken(pastId("PSFX-001")), null);
  const said = cp.seat ? SL.seatLine(cp.seat) : "";
  check("claim page: an ended seat reads its years, start to end", cp.seat?.ended === true && cp.seat.start === "2022" && cp.seat.end === "2024" && /2022 to 2024$/.test(said) && !/since/.test(said), [cp.seat, said]);
  check("claim page: a current seat still reads since", SL.seatLine({ role: "Fractional CMO", fn: "Marketing", company: "Acme Fixture", start: "2025-03", named: false }) === "Fractional CMO at Acme Fixture since Mar 2025");
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} failed, ` : ""}${passed} passed`);
process.exit(failed ? 1 : 0);
