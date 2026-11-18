/**
 * Tests for the weekly scan collector (lib/scan), the digest email (lib/digest.ts) and the sign-in email (lib/email.ts).
 * No network: postings are fixtures, and the board parser reads a saved copy of its markup.
 *
 *   npx tsx scripts/test-scan.mts                    run the checks (exits 1 on any failure)
 *   npx tsx scripts/test-scan.mts --samples <dir>    also write the rendered emails there (two weekly, one sign-in)
 *   npx tsx scripts/test-scan.mts --live             one real scan, printing what each source returned
 */
import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { cleanCompany, cleanTitle, companyDomain, isPlaceholderCompany, isRealCompany, roleKey, titleWithout } from "../lib/scan/clean";
import { webLink } from "../lib/links";
import { collectOpenRoles, dedupeRoles, gtmByTitle, MAX_ROLES, roleFunction, rolesFromRaw, roleType, screenJob, type ScanRawJob } from "../lib/scan/collect";
import { hoursFromText, parseFractionalJobs } from "../lib/scan/sources/fractionaljobs";
import { renderDigest } from "../lib/digest";
import { signInEmail } from "../lib/email";
import { ENGAGEMENT_TYPES, FUNCTIONS, functionOf } from "../lib/tableFields";
import { MIN_SCORE, scoreJob } from "../lib/crawler/score";
import type { DigestData, ScanRole } from "../lib/scanTypes";

const args = process.argv.slice(2);

if (args.includes("--live")) {
  const started = Date.now();
  const res = await collectOpenRoles();
  console.log(`Live scan took ${((Date.now() - started) / 1000).toFixed(1)}s and found ${res.roles.length} roles`);
  for (const s of res.sources) console.log(`  ${s.source}: fetched ${s.fetched}, matched ${s.matched}${s.error ? `, error: ${s.error}` : ""}`);
  for (const r of res.roles.slice(0, 15)) {
    console.log(`  ${r.postedAt?.slice(0, 10) ?? "no date   "}  ${r.company} | ${r.title} | ${r.function ?? "?"} | ${r.type} | ${r.rate ?? "no rate"} | ${r.hoursPerWeek ?? "?"} hrs | ${r.domain ?? "no domain"} | ${r.source}`);
  }
  process.exit(0);
}

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      got ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), got);

const NOW = Date.parse("2026-11-16T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const job = (over: Partial<ScanRawJob>): ScanRawJob => ({
  title: "Fractional VP of Sales",
  company: "Acme Robotics",
  url: "https://remotive.com/remote-jobs/sales/fractional-vp-of-sales-1",
  source: "remotive",
  postedAt: daysAgo(5),
  description: "We are hiring a fractional VP of Sales to own pipeline and revenue.",
  ...over,
});

/* ---------- collector: what gets through ---------- */
console.log("\nCollector");

const vp = screenJob(
  job({
    title: "Fractional VP of Sales (Remote)",
    company: "Acme Robotics, Inc.",
    description: "<p>Acme Robotics is hiring a fractional VP of Sales for 15 hrs/week at $175/hr.</p><p>More about us at https://www.acmerobotics.com/about</p>",
  }),
  NOW
);
check("keeps a fractional VP Sales listing", !!vp.role, vp);
eq("  company is cleaned", vp.role?.company, "Acme Robotics");
eq("  title is cleaned", vp.role?.title, "Fractional VP of Sales");
eq("  key is company and title, squeezed", vp.role?.key, "acmerobotics::fractionalvpofsales");
eq("  function is Sales", vp.role?.function, "Sales");
eq("  type is Fractional", vp.role?.type, "Fractional");
eq("  rate comes from the posting", vp.role?.rate, "$175/hr");
eq("  hours a week come from the posting", vp.role?.hoursPerWeek, 15);
eq("  domain is the company's own site", vp.role?.domain, "acmerobotics.com");
eq("  postedAt is an ISO date", vp.role?.postedAt, daysAgo(5));
eq("  source and link are kept", [vp.role?.source, vp.role?.url], ["remotive", "https://remotive.com/remote-jobs/sales/fractional-vp-of-sales-1"]);

eq(
  "drops a full-time role",
  screenJob(job({ title: "VP of Sales", company: "Globex", description: "Full-time role with health insurance, a 401k and a base salary. Own pipeline and revenue." }), NOW).skip,
  "full-time"
);
eq(
  "drops a full-time role that only mentions fractional people in passing",
  screenJob(
    job({
      title: "VP of Marketing",
      company: "Initech",
      description: "Lead our go-to-market and demand gen. You will manage agencies and fractional designers. Full-time, with health insurance and a 401k.",
    }),
    NOW
  ).skip,
  "full-time"
);

/* ---------- the owner's rule: fractional, interim, freelance or contract work, in GTM ---------- */
console.log("\nOnly fractional, interim, freelance or contract work");

// The posting the owner found in Hiring now: a remote full-time AE job on We Work Remotely.
const gong = (description: string, over: Partial<ScanRawJob> = {}) =>
  job({ title: "Commercial Account Executive", company: "Gong", source: "weworkremotely", url: "https://weworkremotely.com/remote-jobs/gong-io-commercial-account-executive", description, ...over });
const gongFull = screenJob(
  gong(
    "<p>Gong is hiring a Commercial Account Executive to own the full sales cycle and build pipeline.</p>" +
      "<ul><li>Be a trusted advisor to revenue leaders</li><li>Run a consultative sales process</li><li>Negotiate and manage customer contracts and renewals</li></ul>" +
      "<p>This is a remote role. If you live near a hub, join us 3 days a week in our office.</p>" +
      "<p>The salary band is $120,000 - $150,000 a year plus commission, with health insurance, a 401(k), and an equity package.</p>"
  ),
  NOW
);
eq("drops the Gong Commercial Account Executive posting", gongFull.skip, "full-time");
eq("  and names its key, so a role an older scan added can be taken back", gongFull.skip && gongFull.key, "gong::commercialaccountexecutive");
// Each way a posting like that used to get through, alone, with no full-time tell to catch it.
const ae = "Gong is hiring a Commercial Account Executive to own the full sales cycle and build pipeline.";
const paths: [string, string][] = [
  ["a trusted advisor line", `${ae} Be a trusted advisor to customers.`],
  ["advisory wording", `${ae} Take an advisory approach with every account.`],
  ["consultative selling", `${ae} Run a consultative sales process with prospects.`],
  ["a consulting background", `${ae} A background in management consulting is a plus.`],
  ["3 days a week in the office", `${ae} Hybrid, 3 days a week in our office.`],
  ["hours a week of travel", `${ae} Expect about 10 hours a week of travel.`],
  ["an hourly pay rate", `${ae} Pay starts at $40/hr plus commission.`],
  ["customer contracts", `${ae} Negotiate and close contracts, and manage customer contracts.`],
  ["contract negotiation", `${ae} You will own contract negotiation with procurement.`],
  ["contract value", `${ae} Grow annual contract value and renewals.`],
  ["a 12-month contract value", `${ae} Our customers sign a 12-month contract on average.`],
  ["remote", `${ae} This is a remote role, work from anywhere in the US.`],
  ["part-time", `${ae} A part-time schedule is possible.`],
  ["months of ramp", `${ae} Ramp to full quota in 6 months.`],
  ["contractors we work with", `${ae} You will work with our fractional CFO and a team of contractors.`],
  ["an interim goal", `${ae} In the interim, you will shadow our top sellers.`],
  ["someone else's fractional seat", `${ae} You will report to the fractional CRO.`],
];
for (const [why, body] of paths) eq(`drops a full-time AE job whose only signal is ${why}`, screenJob(gong(body), NOW).skip, "full-time");
eq("drops a part-time SDR", screenJob(job({ title: "Part-time SDR", company: "Pipewell", description: "Book meetings for our sales team. 20 hours per week at $25/hr." }), NOW).skip, "full-time");
eq(
  "drops an hourly customer support rep",
  screenJob(job({ title: "Customer Support Representative (Hourly)", company: "Helpwise", description: "Answer customer success tickets. Paid hourly at $22/hr, 30 hours a week." }), NOW).skip,
  "full-time"
);
for (const title of ["Sales Consultant", "Sales Advisor", "Customer Success Advisor", "Marketing Consultant", "Contract Manager, Sales", "Account Executive, Contract Renewals", "Remote Account Executive"]) {
  eq(`drops a title whose only signal is a job word: ${title}`, screenJob(job({ title, company: "Quillfield", description: "Own pipeline and revenue for our sales team." }), NOW).skip, "full-time");
}
eq(
  "a body that says the role is fractional still loses to a full-time tell",
  screenJob(job({ title: "Head of Marketing", company: "Hooli", description: "This is a fractional role. Full-time hours expected, with health insurance." }), NOW).skip,
  "full-time"
);

const keeps: [string, Partial<ScanRawJob>, string, number | null][] = [
  ["Fractional CMO", { title: "Fractional CMO", description: "Lead marketing for our go-to-market team." }, "Fractional", null],
  ["Interim VP Sales", { title: "Interim VP Sales", description: "Lead the sales team while we hire." }, "Interim", null],
  ["Freelance Growth Marketer", { title: "Freelance Growth Marketer", description: "Run paid acquisition and lifecycle campaigns." }, "Project", null],
  ["Contract Demand Gen Manager (6 months)", { title: "Contract Demand Gen Manager (6 months)", description: "Build our demand gen engine." }, "Project", null],
  ["a (Contract) note", { title: "Head of Growth (Contract)", description: "Own growth." }, "Project", null],
  ["a 1099 title", { title: "RevOps Lead, 1099", description: "Own our HubSpot and revenue operations." }, "Project", null],
  ["an advisor seat", { title: "Advisor, GTM", description: "Advise our founders on go-to-market." }, "Advisory", null],
  ["a fractional title with full-time words around it", { title: "Interim VP Sales", description: "Lead sales. Our full-time staff get health insurance." }, "Interim", null],
  ["a body-only fractional engagement", { title: "Head of Demand Generation", description: "This is a fractional engagement, 15 hours a week." }, "Fractional", 15],
  ["a body-only contract position", { title: "Head of Marketing", description: "This is a contract position. Lead our demand gen." }, "Project", null],
  ["a body-only freelance engagement", { title: "Growth Marketer", description: "A freelance engagement to run paid acquisition and lifecycle campaigns." }, "Project", null],
  ["a body-only interim VP", { title: "VP of Marketing", description: "We need an interim VP of Marketing to lead demand gen while we search." }, "Interim", null],
  ["a body-only 6-month contract", { title: "Head of Sales", description: "A 6-month contract to rebuild our outbound sales motion." }, "Project", null],
  ["a body-only first fractional hire", { title: "Head of Marketing", description: "We are hiring our first fractional CMO to lead demand gen." }, "Fractional", null],
  ["a body that is open to a fractional engagement", { title: "Head of Sales", description: "We are open to a fractional engagement for the right sales leader." }, "Fractional", null],
  ["a body-only 1099 contractor", { title: "Sales Enablement Lead", description: "You will be a 1099 contractor working with our sales team." }, "Project", null],
  ["a fractional board listing", { title: "Head of Sales", source: "fractionaljobs", fractionalBoard: true, hoursPerWeek: 12, description: "Fractional role listed on Fractional Jobs. Function: Sales." }, "Fractional", 12],
];
for (const [why, over, type, hours] of keeps) {
  const r = screenJob(job({ company: "Kestrel Labs", ...over }), NOW);
  eq(`keeps ${why}, typed ${type}`, [!!r.role, r.role?.type, hours === null ? null : r.role?.hoursPerWeek], [true, type, hours]);
}
eq("a fractional board listing with nothing in its text still counts", !!screenJob(job({ title: "Head of Sales", source: "fractionaljobs", fractionalBoard: true, description: "Function: Sales." }), NOW).role, true);
const crawlerSays = (title: string, description: string) => {
  const t = scoreJob({ title, description, company: "X", url: "", source: "" });
  return t.isFractional && t.score >= MIN_SCORE;
};
eq(
  "the crawler's bar follows the same rule",
  [crawlerSays("Commercial Account Executive", paths.map(([, b]) => b).join(" ")), crawlerSays("Freelance Growth Marketer", "Run paid acquisition."), crawlerSays("Fractional CMO", "Lead marketing.")],
  [false, true, true]
);

const screened = await collectOpenRoles({ now: NOW, sources: [{ name: "weworkremotely", fetchJobs: async () => [gong(ae + " Be a trusted advisor."), job({ title: "Fractional CMO", company: "Northwind" })] }] });
eq("the collector lists what it screened out as not fractional", [screened.roles.length, screened.screenedOut?.map((x) => [x.key, x.source])], [1, [["gong::commercialaccountexecutive", "weworkremotely"]]]);
check(
  "keeps a role whose body says the role itself is fractional",
  !!screenJob(job({ title: "Head of Marketing", company: "Hooli", description: "This is a fractional role. You will lead marketing and demand gen for our go-to-market team." }), NOW).role
);
const salesy = "Work closely with our sales and marketing leaders on pipeline, revenue and go-to-market plans. 10 hrs/week.";
// Outside GTM, a Director-and-above seat is kept (the owner's rule); below Director it is dropped.
for (const title of ["Fractional CFO", "Fractional CTO", "Fractional COO", "Fractional Head of People", "Fractional General Counsel", "Fractional Head of Operations"]) {
  check(`keeps a Director-and-above seat outside GTM: ${title}`, !!screenJob(job({ title, description: salesy }), NOW).role);
}
// Its function is the one its title names, never Executive or none (the titles the audit found filed wrong first).
const NON_GTM_TITLES: [string, string][] = [
  ["Fractional CFO", "Finance"],
  ["Fractional Controller", "Finance"],
  ["Fractional Comptroller", "Finance"],
  ["Fractional VP Finance", "Finance"],
  ["Interim Vice President of Finance", "Finance"],
  ["Interim Head of Finance", "Finance"],
  ["Fractional CTO", "Technology"],
  ["Fractional VP Engineering", "Technology"],
  ["Head of Engineering (Interim)", "Technology"],
  ["Fractional CIO", "Technology"],
  ["Fractional CISO", "Technology"],
  ["Interim COO", "Operations"],
  ["Fractional Head of Operations", "Operations"],
  ["Fractional CHRO", "People"],
  ["Fractional Chief People Officer", "People"],
  ["Fractional Head of People", "People"],
  ["Interim HR Director", "People"],
  ["Fractional General Counsel", "Legal"],
  ["Fractional CLO", "Legal"],
  ["Interim Head of Legal", "Legal"],
  ["Fractional CPO", "Product"],
  ["Interim Head of Product", "Product"],
  ["Fractional VP Product", "Product"],
  ["Fractional CEO", "Executive"],
  ["Interim President", "Executive"],
  ["Fractional Chief of Staff", "Executive"],
];
for (const [title, fn] of NON_GTM_TITLES) {
  eq(`functionOf files ${title} under ${fn}`, functionOf(title), fn);
  eq(`  and the scan keeps it there`, screenJob(job({ title, description: salesy }), NOW).role?.function, fn);
}
// Below Director the scan leaves these out, but a member's seat with such a title still gets the function.
for (const [title, fn] of [["HR Business Partner", "People"], ["Head of Talent Acquisition", "People"], ["General Manager", "Executive"], ["Finance Manager", "Finance"], ["Chief Executive Officer", "Executive"]] as const)
  eq(`functionOf files ${title} under ${fn}`, functionOf(title), fn);
// GTM rules come first: an operations or product word inside a GTM title keeps the GTM function.
for (const [title, fn] of [
  ["Fractional Revenue Operations Lead", "RevOps"],
  ["Head of Sales Operations", "RevOps"],
  ["Fractional Marketing Operations Lead", "RevOps"],
  ["Fractional Product Marketing Lead", "Product Marketing"],
  ["VP Product Marketing", "Product Marketing"],
  ["Fractional VP Sales", "Sales"],
  ["VP Sales Engineering", "Sales"],
  ["Fractional CRO", "Sales"],
  ["Fractional GTM Engineer", "AI GTM"],
  ["Fractional Partnerships Lead", "Partnerships"],
] as const) eq(`a GTM title keeps its GTM function: ${title}`, functionOf(title), fn);
// The board's own label for a seat outside GTM counts when the title names no function.
eq("a board's Finance label is kept for a title that names none", roleFunction("Interim Director (Contract)", { functions: [] }, "Finance"), "Finance");
eq("a board's Engineering label reads as Technology", roleFunction("Interim Director (Contract)", { functions: [] }, "Engineering"), "Technology");
// A CFO or CTO title is not a GTM title, so a posting has to clear the seniority bar on its own.
check("a CFO or CTO title is not read as GTM", !gtmByTitle("Fractional CFO") && !gtmByTitle("Fractional CTO") && gtmByTitle("Fractional VP Sales"), [gtmByTitle("Fractional CFO"), gtmByTitle("Fractional CTO")]);
eq("a finance seat below Director is still left out, as a seat outside GTM", screenJob(job({ title: "Fractional Finance Manager", description: salesy }), NOW).skip, "not-gtm");
check("drops a seat outside GTM below Director even when the body talks about sales: Fractional Product Manager", !!screenJob(job({ title: "Fractional Product Manager", description: salesy }), NOW).skip);
for (const [title, fn] of [["Fractional Sales Engineer", "Sales"], ["Fractional GTM Engineer", "AI GTM"], ["Fractional Marketing Operations Lead", "RevOps"], ["Fractional Product Marketing Manager", "Product Marketing"], ["Fractional CEO", "Executive"]]) {
  eq(`keeps a GTM seat with a technical or executive word in the title: ${title}`, screenJob(job({ title, description: salesy }), NOW).role?.function, fn);
}
// The seniority bar (lib/seniority.ts): outside GTM, only Director and above, whatever the body says.
const staffing = "Help our school district with staffing, onboarding and support for new teachers. Work with the sales team on pipeline for our programs. 20 hrs/week.";
for (const [title, want] of [
  ["School Staffing Coordinator (Contract)", "seniority"],
  ["Contract Software Engineer", "not-gtm"],
  ["Art Director (freelance)", "not-gtm"],
  ["Operations Coordinator (Contract)", "not-gtm"],
  ["Program Coordinator (Contract)", "seniority"],
  ["Fractional Office Associate", "seniority"],
] as const) {
  eq(`drops a role outside GTM below Director: ${title}`, screenJob(job({ title, description: staffing }), NOW).skip, want);
}
eq("drops it even with a GTM label from the board", screenJob(job({ title: "School Staffing Coordinator (Contract)", description: staffing, functionHint: "Customer Success" }), NOW).skip, "seniority");
for (const title of ["Fractional Account Executive", "Freelance Marketing Coordinator", "Contract Customer Success Associate", "Fractional SDR"]) {
  check(`keeps a GTM role at any seniority: ${title}`, !!screenJob(job({ title, description: salesy }), NOW).role);
}
eq("drops a discussion", screenJob(job({ kind: "discussion", title: "Ask HN: anyone hiring a fractional CMO?", company: "someuser" }), NOW).skip, "discussion");
eq("drops a stale posting (75 days old)", screenJob(job({ postedAt: daysAgo(75) }), NOW).skip, "stale");
check("keeps a posting 59 days old", !!screenJob(job({ postedAt: daysAgo(59) }), NOW).role);
const undated = screenJob(job({ postedAt: undefined }), NOW);
check("keeps a posting with no date, with postedAt null", !!undated.role && undated.role.postedAt === null, undated);
eq("a date in the future is treated as no date", screenJob(job({ postedAt: daysAgo(-30) }), NOW).role?.postedAt, null);

for (const name of ["Unknown", "Confidential", "Stealth", "Stealth Startup", "Confidential Company", "N/A", "See listing", "A Series B Fintech Startup", "Early-stage B2B SaaS company"]) {
  eq(`drops a nameless company: ${name}`, screenJob(job({ company: name }), NOW).skip, "company");
}
eq(
  "drops a recruiter posting for an unnamed client",
  screenJob(job({ company: "Hartwell Partners", description: "Our client is a Series B SaaS company seeking a fractional VP of Sales to own pipeline." }), NOW).skip,
  "company"
);
eq("drops a recruiter by name", screenJob(job({ company: "Apex Executive Search" }), NOW).skip, "company");
for (const name of ["Remotive", "We Work Remotely", "Fractional Jobs", "Toptal", "Dynamite Jobs"]) {
  eq(`drops a job board as the company: ${name}`, screenJob(job({ company: name }), NOW).skip, "company");
}
check("keeps an agency that talks about its clients in general", !!screenJob(job({ company: "Brightline", description: "Fractional VP of Sales. You will help our clients grow pipeline." }), NOW).role);

/* ---------- collector: dedupe, order, cap ---------- */

const twoBoards = rolesFromRaw(
  [
    job({ title: "Fractional CMO - Remote", company: "Northwind LLC", source: "remoteok", url: "https://remoteok.com/remote-jobs/1", postedAt: daysAgo(2), description: "Fractional CMO to lead marketing." }),
    job({
      title: "Fractional CMO",
      company: "Northwind",
      source: "weworkremotely",
      url: "https://weworkremotely.com/remote-jobs/northwind-fractional-cmo",
      postedAt: daysAgo(4),
      description: "Fractional CMO to lead marketing. 10 hrs/week at $150/hr.",
    }),
  ],
  NOW
);
eq("dedupes the same role from two boards", twoBoards.length, 1);
eq("  keeps the posting with the most detail", [twoBoards[0]?.source, twoBoards[0]?.rate, twoBoards[0]?.hoursPerWeek], ["weworkremotely", "$150/hr", 10]);
eq("  both postings share one key", twoBoards[0]?.key, "northwind::fractionalcmo");

const role = (over: Partial<ScanRole>): ScanRole => ({
  key: "a::b", company: "A", domain: null, title: "B", function: null, type: "Fractional", url: "https://x.test/1", source: "one", postedAt: null, rate: null, hoursPerWeek: null, ...over,
});
const merged = dedupeRoles([role({ source: "one", rate: "$150/hr" }), role({ source: "two", domain: "a.com", hoursPerWeek: 12, function: "Sales" })]);
eq("the kept posting takes facts it lacks from its duplicate", [merged.length, merged[0].source, merged[0].rate, merged[0].domain, merged[0].hoursPerWeek], [1, "two", "$150/hr", "a.com", 12]);

const many = rolesFromRaw(
  Array.from({ length: 75 }, (_, i) => job({ company: `Company ${i}`, postedAt: i % 10 === 0 ? undefined : daysAgo(i % 50) })),
  NOW
);
eq(`caps the result at ${MAX_ROLES} roles`, many.length, 60);
check(
  "sorts newest first, postings with no date last",
  many.every((r, i) => i === 0 || (many[i - 1].postedAt ?? "") >= (r.postedAt ?? "")),
  many.map((r) => r.postedAt?.slice(0, 10))
);
eq("every key is unique", new Set(many.map((r) => r.key)).size, many.length);

/* ---------- collector: names and titles ---------- */
console.log("\nNames and titles");

const companies: [string, string][] = [
  ["Acme Robotics, Inc.", "Acme Robotics"],
  ["Acme Inc", "Acme"],
  ["Northwind LLC", "Northwind"],
  ["Northwind, L.L.C.", "Northwind"],
  ["Globex Ltd.", "Globex"],
  ["Globex Pty Ltd", "Globex"],
  ["Initech Corp.", "Initech"],
  ["Umbrella GmbH", "Umbrella"],
  ["Hooli (YC W24)", "Hooli"],
  ["  Stark   Industries.  ", "Stark Industries"],
  ["Wayne &amp; Sons", "Wayne & Sons"],
  ["Copper Kettle Co", "Copper Kettle Co"],
  ["acme-robotics", "Acme Robotics"],
  ["Tidewater AG", "Tidewater"],
];
for (const [raw, want] of companies) eq(`company "${raw}"`, cleanCompany(raw), want);

const titles: [string, string, string?][] = [
  ["Fractional VP of Sales (Remote)", "Fractional VP of Sales"],
  ["Fractional CMO - Remote", "Fractional CMO"],
  ["Fractional CMO – Remote, US", "Fractional CMO"],
  ["Fractional Head of Marketing | New York, NY", "Fractional Head of Marketing"],
  ["Fractional CRO, Remote (US only)", "Fractional CRO"],
  ["Interim CMO (Part-time, Remote)", "Interim CMO"],
  ["Fractional VP Sales - San Francisco, CA", "Fractional VP Sales"],
  ["[Remote] Fractional Head of Growth", "Fractional Head of Growth"],
  ["Remote Fractional CMO", "Fractional CMO"],
  ["Fractional RevOps Lead (20 hrs/week)", "Fractional RevOps Lead"],
  ["Fractional Head of Sales / Remote / $150-200/hr", "Fractional Head of Sales"],
  ["Fractional Sales Leader (m/f/d)", "Fractional Sales Leader"],
  ["Fractional CMO (Remote, US) - 20 hrs/week", "Fractional CMO"],
  ["Fractional CMO - Healthcare", "Fractional CMO - Healthcare"],
  ["Fractional VP of Sales - B2B SaaS", "Fractional VP of Sales - B2B SaaS"],
  ["VP, Sales and Marketing", "VP, Sales and Marketing"],
  ["VP Sales, EMEA", "VP Sales, EMEA"],
  ["Fractional Go-to-Market Lead - Remote", "Fractional Go-to-Market Lead"],
  ["Fractional CMO at Northwind", "Fractional CMO", "Northwind"],
  ["Northwind: Fractional CMO", "Fractional CMO", "Northwind"],
  ["Fractional CMO | Northwind | Remote", "Fractional CMO", "Northwind"],
  ["Hiring: Fractional CMO", "Fractional CMO"],
  ["Fractional Head of Sales &amp; Partnerships", "Fractional Head of Sales & Partnerships"],
];
for (const [raw, want, company] of titles) eq(`title "${raw}"`, cleanTitle(raw, company), want);

// An open role's title is free while its company is locked, so the title must never name the company.
const withouts: [string, string, string | null, string][] = [
  ["Fractional CMO at Acme Health", "Acme Health", null, "Fractional CMO"],
  ["Acme Health: Fractional CMO", "Acme Health", null, "Fractional CMO"],
  ["Fractional CMO, Acme Health (Remote)", "Acme Health", null, "Fractional CMO"],
  ["Fractional Acme Health CMO", "Acme Health", null, "Fractional CMO"],
  ["Fractional VP Sales for acmehealth.com", "Acme Health", "acmehealth.com", "Fractional VP Sales"],
  ["Acmehealth Fractional RevOps Lead", "Acme Health", "https://www.acmehealth.com/jobs", "Fractional RevOps Lead"],
  ["Fractional CMO", "Acme Health", "acmehealth.com", "Fractional CMO"],
  ["Acme Health", "Acme Health", null, "Fractional role"],
  ["Head of Growth (Fractional)", "Growthly", "growthly.io", "Head of Growth (Fractional)"],
];
for (const [raw, co, dom, want] of withouts) eq(`a free title never names its locked company: "${raw}"`, titleWithout(raw, co, dom), want);

eq("key squeezes everything but letters and digits", roleKey("Acme & Sons", "Fractional VP, Sales (EMEA)"), "acmesons::fractionalvpsalesemea");
check("a real company name passes", isRealCompany("A Place for Mom") && isRealCompany("Acme Robotics") && isRealCompany("Fieldstone Talent"));

// Placeholder names: not companies, at import and on the table (lib/table.ts graph).
const placeholders = ["Private Company", "Confidential", "Confidential Company", "Stealth", "Stealth Startup", "Stealth Mode", "Undisclosed", "Undisclosed Company", "Company", "N/A", "Self-employed", "Various", "Multiple", "Freelance", "Independent", "Hiring Company", "A fintech company", "An AI startup", "A Series B SaaS company", "Start- Up", "The Company"];
for (const n of placeholders) check(`a placeholder name is not a company: "${n}"`, isPlaceholderCompany(n) && !isRealCompany(n));
for (const n of ["A Place for Mom", "Acme Robotics", "1440", "Private Family Office", "Independent Bank", "Stealth Security Labs", "The Hatch Company", "Hawaii Coffee Company", "ABC & Company", "Unknown Worlds Entertainment"])
  check(`a real name is not a placeholder: "${n}"`, !isPlaceholderCompany(n));

// Links go out whole: https:// on a stored "acme.com/jobs/1", and nothing that isn't a web address.
const links: [string, string | null][] = [
  ["jobs.example.com/x/1", "https://jobs.example.com/x/1"],
  ["acme.com", "https://acme.com"],
  ["http://acme.com/a", "http://acme.com/a"],
  ["https://acme.com/a?b=1", "https://acme.com/a?b=1"],
  ["//acme.com/x", "https://acme.com/x"],
  ["linkedin.com/company/acme", "https://linkedin.com/company/acme"],
  ["javascript:alert(1)", null],
  ["JavaScript:alert(1)", null],
  [" java\tscript:alert(1)", null],
  ["data:text/html,<b>x</b>", null],
  ["mailto:a@acme.com", null],
  ["https://user:pw@acme.com", null],
  ["not a link", null],
  ["acme", null],
];
for (const [raw, want] of links) eq(`a link goes out whole: ${JSON.stringify(raw)}`, webLink(raw), want);

eq("domain: the board's own company link is trusted", companyDomain("Pebble", { companyUrl: "https://heypebble.example/" }), "heypebble.example");
eq("domain: www is dropped", companyDomain("Northwind", { companyUrl: "https://www.northwind.example/" }), "northwind.example");
eq("domain: never the job board's", companyDomain("Remotive", { url: "https://remotive.com/remote-jobs/1", companyUrl: "https://remotive.com/company/acme" }), null);
eq("domain: never the applicant tracking system's", companyDomain("Acme", { url: "https://boards.greenhouse.io/acme/jobs/1", text: "Apply at https://jobs.lever.co/acme/1" }), null);
eq("domain: a careers page on the company's own site counts", companyDomain("Acme", { url: "https://careers.acme.co.uk/jobs/1?gh_jid=1" }), "acme.co.uk");
eq("domain: a link to some other company does not count", companyDomain("Acme", { text: "We use https://www.bigcrm.example every day" }), null);
eq("domain: a generic word shared with the name does not count", companyDomain("Global Health Solutions", { text: "Read more at https://health.com" }), null);
eq("domain: a trailing word like Labs can be left out", companyDomain("Acme Labs", { text: "Visit www.acme.com." }), "acme.com");
eq("domain: an email at the company's domain counts", companyDomain("Northwind", { text: "Send a note to jobs@getnorthwind.com" }), "getnorthwind.com");
eq("domain: none given", companyDomain("Northwind", { url: "https://weworkremotely.com/remote-jobs/northwind-cmo", text: "Fractional CMO" }), null);

/* ---------- collector: functions and types ---------- */
console.log("\nFunctions and types");

const none = { functions: [] };
const fns: [string, string | null][] = [
  ["Fractional VP of Sales", "Sales"],
  ["Fractional CRO", "Sales"],
  ["Interim CMO", "Marketing"],
  ["Fractional Head of Demand Gen", "Growth"],
  ["Fractional RevOps Lead", "RevOps"],
  ["Fractional Head of Customer Success", "Customer Success"],
  ["Fractional Head of Partnerships", "Partnerships"],
  ["Fractional Product Marketing Lead", "Product Marketing"],
  ["Fractional Sales Enablement Lead", "Enablement"],
  ["Fractional AI GTM Lead", "AI GTM"],
  ["Fractional Wizard", null],
];
for (const [title, want] of fns) eq(`function of "${title}"`, roleFunction(title, none), want);
eq("function falls back to the board's label", roleFunction("Account Director", none, "Sales"), "Sales");
eq("function falls back to the crawler's tag", roleFunction("Fractional Leader", { functions: ["GTM Leadership", "Marketing"] }), "Marketing");
eq("the crawler's GTM Leadership tag maps to Sales", roleFunction("Fractional Leader", { functions: ["GTM Leadership"] }), "Sales");
check("every function is one of FUNCTIONS", fns.every(([t]) => roleFunction(t, none) === null || FUNCTIONS.includes(roleFunction(t, none)!)));

const types: [string, string, string][] = [
  ["Fractional VP of Sales", "", "Fractional"],
  ["Interim CMO", "A fractional engagement for six months.", "Interim"],
  ["Sales Advisor", "", "Advisory"],
  ["Advisory Board Member, GTM", "", "Advisory"],
  ["Marketing Consultant", "", "Project"],
  ["Head of Growth (Contract)", "", "Project"],
  ["Head of Marketing", "A six month project to rebuild demand gen.", "Project"],
  ["Head of Marketing", "This is a fractional role.", "Fractional"],
  ["Part-time Head of Customer Success", "", "Fractional"],
];
for (const [title, body, want] of types) eq(`type of "${title}"${body ? " with body wording" : ""}`, roleType(title, body), want);
check("every type is one of ENGAGEMENT_TYPES", types.every(([t, b]) => ENGAGEMENT_TYPES.includes(roleType(t, b))));

const consultant = screenJob(job({ title: "Marketing Consultant, 20 hrs/week (Contract)", company: "Vandelay", description: "Contract marketing role, 20 hrs/week, $8,000 per month." }), NOW);
eq("a contract role comes through as Project with its monthly rate", [consultant.role?.type, consultant.role?.function, consultant.role?.rate, consultant.role?.hoursPerWeek], ["Project", "Marketing", "$8,000/mo", 20]);
const interim = screenJob(job({ title: "Head of Sales (Interim)", description: "Lead the sales team and own pipeline for six months." }), NOW);
eq("a note the title loses in cleaning still sets the type", [interim.role?.title, interim.role?.type], ["Head of Sales", "Interim"]);
eq("days a week become hours", screenJob(job({ description: "Fractional VP of Sales, 2 days per week." }), NOW).role?.hoursPerWeek, 16);
eq("a range of hours becomes its middle", screenJob(job({ description: "Fractional VP of Sales, 10-20 hours per week." }), NOW).role?.hoursPerWeek, 15);
eq("'paid hourly' with no number is not a rate", screenJob(job({ description: "Fractional VP of Sales, paid hourly." }), NOW).role?.rate, null);

/* ---------- collector: the Fractional Jobs board ---------- */
console.log("\nFractional Jobs board");

// The board's card markup, as served in November 2026 (class names and structure kept, content trimmed).
const card = (o: { company: string; role: string; slug: string; site?: string; hours: string; rate: string; where: string; fn: string; date: string }) => `
<div role="listitem" class="job-item w-dyn-item"><div class="job-item_flex"><div class="star_component"><div tabindex="0" role="button" class="fs_modal-1_button-2"><div class="star_img"><img src="https://cdn.example/star.svg" alt="" class="object-fit"></div></div></div>
<div class="job-item_content"><div class="job-item_job-info"><div class="job-item_name_url"><div class="text-size-regular text-inline"><h3 class="text-size-regular text-inline">${o.company}</h3><h3 class="text-size-regular text-inline">&nbsp;-&nbsp;</h3><h3 class="text-size-regular text-inline">${o.role}</h3><h3 class="text-size-regular text-inline">&nbsp;</h3></div>
<div class="text-inline"><div class="text-inline${o.site ? "" : " w-condition-invisible"}">(</div><a data-clean="remove-http" href="${o.site ?? "#"}" target="_blank" class="job-item_company-link w-inline-block${o.site ? "" : " w-condition-invisible"}">${o.site ? o.site.replace("https://", "") : ""}</a><div class="text-inline${o.site ? "" : " w-condition-invisible"}">)</div></div>
<a href="/jobs/${o.slug}" target="_blank" class="job-item_link-to-job w-inline-block"></a></div>
<div class="job-item_more-info"><div class="text-inline">${o.hours}</div><div class="text-inline">&nbsp;|&nbsp;</div><div class="text-inline">${o.rate}</div><div class="text-inline">&nbsp;|&nbsp;</div><div class="text-inline">${o.where}</div>
<div class="hide"><div fs-cmsfilter-field="function">${o.fn}</div><div class="syndicated w-condition-invisible">Syndicated</div><div class="date">${o.date}</div><div class="job-id">${o.slug}</div></div></div></div>
<div class="job-item_date"><div class="text-inline">added&nbsp;</div><div class="post-date text-inline">2 days ago</div></div></div></div></div>`;
const boardHtml = `<html><body><div class="jobs-filter_collection-item w-dyn-item"><span fs-cmsfilter-field="function">Engineering</span></div><div class="w-dyn-list"><div role="list" class="w-dyn-items">${[
  card({ company: "Kestrel Freight", role: "Head of Marketing", slug: "head-of-marketing-at-kestrel-freight", site: "https://kestrelfreight.example/", hours: "10 - 15 hrs", rate: "$100 - $125 / hr", where: "Remote (USA only)", fn: "Marketing", date: "November 13, 2026" }),
  card({ company: "A Financial Services SaaS Startup", role: "Sales Lead", slug: "sales-lead-at-a-financial-services-saas-startup", hours: "15 - 20 hrs", rate: "$5K - $8K / mo + commission", where: "Remote (USA only)", fn: "Sales", date: "November 13, 2026" }),
  card({ company: "Tallybook", role: "Controller", slug: "controller-at-tallybook", site: "https://www.tallybook.example/", hours: "16 hrs", rate: "$8K - $11K / mo", where: "Hybrid (Raleigh-Durham only)", fn: "Finance", date: "November 9, 2026" }),
  card({ company: "Harborview Health", role: "Account Director", slug: "account-director-at-harborview-health", site: "https://www.harborviewhealth.example/", hours: "40 hrs", rate: "$90 - $110 / hr", where: "Remote", fn: "Sales", date: "November 10, 2026" }),
  card({ company: "Pebble", role: "Business Development Lead", slug: "business-development-lead-at-pebble", site: "https://heypebble.example/", hours: "8 - 12 hrs", rate: "$6K - $9K / mo", where: "Remote", fn: "Sales", date: "November 8, 2026" }),
].join("")}</div></div><footer><a href="/blog/what-is-fractional-work">What is fractional work?</a></footer></body></html>`;

const parsed = parseFractionalJobs(boardHtml);
eq("reads every card on the page", parsed.length, 5);
eq("  company and role come from the headline", [parsed[0]?.company, parsed[0]?.title], ["Kestrel Freight", "Head of Marketing"]);
eq("  link, date and company site", [parsed[0]?.url, parsed[0]?.postedAt, parsed[0]?.companyUrl], ["https://www.fractionaljobs.io/jobs/head-of-marketing-at-kestrel-freight", "2026-11-13T00:00:00.000Z", "https://kestrelfreight.example/"]);
eq("  hours, rate and the board's function", [parsed[0]?.hoursPerWeek, parsed[0]?.rate, parsed[0]?.functionHint], [13, "$100 - $125 / hr", "Marketing"]);
eq("  an unnamed company has no site link", parsed[1]?.companyUrl, undefined);
// One card exactly as a rendering crawler returned it on 2026-11-15 (links made absolute, unnamed company).
const servedCard = `<div role="listitem" class="job-item w-dyn-item"><div class="job-item_flex"><div class="star_component"><div tabindex="0" role="button" aria-roledescription="open-modal-trigger" aria-controls="fs-modal-1-popup" aria-haspopup="dialog" aria-expanded="false" data-w-id="9e108133-0d83-1535-4f7b-7f859e2881ab" class="fs_modal-1_button-2"><div data-w-id="9e108133-0d83-1535-4f7b-7f859e2881ac" class="star_img" style="width: 1.25rem; height: 1.25rem;"><img src="https://cdn.prod.website-files.com/6578c49d9871fac26dd7700e/661a6911701485a8909acb22_star.svg" loading="lazy" alt="" class="object-fit" width="300" height="150"></div><div class="star_componenet-line"></div></div></div><div class="job-item_not-syndicated"><div class="job-item_purple-dot"></div></div><div class="job-item_content"><div class="job-item_job-info"><div class="job-item_name_url"><div class="text-size-regular text-inline"><h3 class="text-size-regular text-inline">A Financial Services SaaS Startup</h3><h3 class="text-size-regular text-inline">&nbsp;-&nbsp;</h3><h3 class="text-size-regular text-inline">Sales Lead</h3><h3 class="text-size-regular text-inline">&nbsp;</h3></div><div class="text-inline"><div class="text-inline w-condition-invisible">(</div><a data-clean="remove-http" href="https://www.fractionaljobs.io/#" class="job-item_company-link w-inline-block w-condition-invisible"></a><div class="text-inline w-condition-invisible">)</div></div><a href="https://www.fractionaljobs.io/jobs/sales-lead-at-a-financial-services-saas-startup" target="_blank" class="job-item_link-to-job w-inline-block"></a></div><div class="job-item_more-info"><div class="text-inline">15 - 20 hrs</div><div class="text-inline">&nbsp;|&nbsp;</div><div class="text-inline">$5K - $8K / mo + commission</div><div class="text-inline">&nbsp;|&nbsp;</div><div class="text-inline">Remote (USA only)</div><div class="hide"><div fs-cmsfilter-field="function">Sales</div><div class="syndicated w-condition-invisible">Syndicated</div><div class="date">November 13, 2026</div><div class="job-id">sales-lead-at-a-financial-services-saas-startup</div></div></div></div><div class="job-item_date"><div class="text-inline">added&nbsp;</div><div class="post-date text-inline">2 days ago</div></div></div></div></div>`;
const served = parseFractionalJobs(servedCard)[0];
eq(
  "reads a card exactly as served",
  [served?.company, served?.title, served?.url, served?.hoursPerWeek, served?.rate, served?.location, served?.functionHint, served?.postedAt, served?.companyUrl],
  ["A Financial Services SaaS Startup", "Sales Lead", "https://www.fractionaljobs.io/jobs/sales-lead-at-a-financial-services-saas-startup", 18, "$5K - $8K / mo + commission", "Remote (USA only)", "Sales", "2026-11-13T00:00:00.000Z", undefined]
);
eq("hours text: a range, one number, none", [hoursFromText("15 - 20 hrs"), hoursFromText("16 hrs"), hoursFromText("Remote")], [18, 16, null]);
eq("an empty or changed page gives no cards, not an error", parseFractionalJobs("<html><body><a href='/jobs/x'></a></body></html>").length, 0);

const boardRoles = rolesFromRaw(parsed, NOW);
eq("keeps the GTM roles at named companies", boardRoles.map((r) => `${r.company} | ${r.title}`), ["Kestrel Freight | Head of Marketing", "Tallybook | Controller", "Pebble | Business Development Lead"]);
eq("  with the board's facts", [boardRoles[0]?.function, boardRoles[0]?.type, boardRoles[0]?.rate, boardRoles[0]?.hoursPerWeek, boardRoles[0]?.domain], ["Marketing", "Fractional", "$100–$125/hr", 13, "kestrelfreight.example"]);
eq("  a company site that differs from the name is still taken from the board", [boardRoles[2]?.domain, boardRoles[2]?.rate, boardRoles[2]?.function], ["heypebble.example", "$6K–$9K/mo", "Partnerships"]);
eq("  drops the unnamed company", screenJob(parsed[1], NOW).skip, "company");
check("  keeps the Director-level finance seat (a Controller), as the owner asked", !!screenJob(parsed[2], NOW).role);
eq("  and files it under Finance", screenJob(parsed[2], NOW).role?.function, "Finance");
eq("  drops the 40 hour a week seat", screenJob(parsed[3], NOW).skip, "full-time");

/* ---------- collector: sources ---------- */
console.log("\nSources");

const scan = await collectOpenRoles({
  now: NOW,
  timeoutMs: 150,
  sources: [
    { name: "good", fetchJobs: async () => [job({}), job({ company: "Confidential" }), job({ kind: "discussion" })] },
    { name: "broken", fetchJobs: async () => { throw new Error("HTTP 403 from example.com"); } },
    { name: "hung", fetchJobs: () => new Promise<ScanRawJob[]>(() => {}) },
    { name: "throws-early", fetchJobs: () => { throw new Error("bad setup"); } },
    { name: "garbage", fetchJobs: async () => [null, { title: 5 }, job({ company: "Second Co" })] as unknown as ScanRawJob[] },
  ],
});
eq("one failing source does not fail the scan", scan.roles.map((r) => r.company).sort(), ["Acme Robotics", "Second Co"]);
eq("every source is reported", scan.sources.map((s) => s.source), ["good", "broken", "hung", "throws-early", "garbage"]);
eq("  fetched and matched are counted", [scan.sources[0].fetched, scan.sources[0].matched, scan.sources[0].error], [3, 1, undefined]);
eq("  a failed source carries its error", [scan.sources[1].fetched, scan.sources[1].matched, scan.sources[1].error], [0, 0, "HTTP 403 from example.com"]);
check("  a hung source times out", /timed out/i.test(scan.sources[2].error ?? ""), scan.sources[2]);
eq("  a source that throws before fetching is reported too", scan.sources[3].error, "bad setup");
eq("  malformed postings are skipped", [scan.sources[4].fetched, scan.sources[4].matched], [3, 1]);
const empty = await collectOpenRoles({ sources: [], now: NOW });
eq("no sources gives an empty result", empty, { roles: [], all: [], sources: [], seenKeys: [], screenedOut: [] });
const overCap = await collectOpenRoles({
  now: NOW,
  max: 3,
  sources: [{ name: "big", fetchJobs: async () => Array.from({ length: 5 }, (_, i) => job({ company: `Company ${i}`, postedAt: daysAgo(i + 1) })) }],
});
eq("past the cap, seenKeys still lists every role that passed", [overCap.roles.length, overCap.seenKeys.length, overCap.roles[0]?.company], [3, 5, "Company 0"]);
eq("  and `all` hands every one of them over, newest first", overCap.all?.map((r) => r.company), ["Company 0", "Company 1", "Company 2", "Company 3", "Company 4"]);
eq("malformed postings do not break rolesFromRaw", rolesFromRaw([null, job({})] as unknown as ScanRawJob[], NOW).length, 1);

/* ---------- digest ---------- */
console.log("\nDigest");

const base: DigestData = {
  name: "Maya Okafor",
  email: "maya@example.com",
  function: "Sales",
  newRoles: 12,
  newRolesMine: 4,
  newRolesMineHidden: 3,
  byFunction: [
    { function: "Sales", n: 4 },
    { function: "Marketing", n: 3 },
    { function: "RevOps", n: 3 },
    { function: "Customer Success", n: 2 },
  ],
  closedRoles: 5,
  seatFactsMissing: 9,
  credits: 12,
  appUrl: "https://table-pilot.up.railway.app/?k=abc123&tab=roles",
  unsubscribeUrl: "https://table-pilot.up.railway.app/api/table?unsubscribe=tok_123&m=1",
};
const digest = (over: Partial<DigestData> = {}) => renderDigest({ ...base, ...over });

eq("subject: roles in the member's function", digest().subject, "4 new Sales roles this week");
eq("subject: one role in the member's function", digest({ newRolesMine: 1, newRolesMineHidden: 1 }).subject, "1 new Sales role this week");
eq("subject: none in the member's function", digest({ newRolesMine: 0, newRolesMineHidden: 0 }).subject, "12 new fractional roles this week");
eq("subject: one role overall", digest({ newRoles: 1, newRolesMine: 0, newRolesMineHidden: 0 }).subject, "1 new fractional role this week");
eq("subject: member has no function", digest({ function: null, newRolesMine: 0, newRolesMineHidden: 0 }).subject, "12 new fractional roles this week");
eq("subject: a two word function", digest({ function: "Customer Success", newRolesMine: 2 }).subject, "2 new Customer Success roles this week");
eq("subject: nothing new", digest({ newRoles: 0, newRolesMine: 0, newRolesMineHidden: 0, byFunction: [] }).subject, "No new fractional roles this week");

const d = digest();
check("greets by first name", d.text.startsWith("Hi Maya,") && d.html.includes("Hi Maya,"));
check("says how many of the companies are hidden", d.text.includes("3 of the 4 companies are locked") && d.html.includes("3 of the 4 companies are locked"));
check("lists functions with counts", ["Sales  4", "Marketing  3", "RevOps  3", "Customer Success  2"].every((l) => d.text.includes(l)), d.text);
check("says how many roles closed", d.text.includes("5 roles closed this week") && d.html.includes("5 roles closed this week"));
check("has the seats line", d.text.includes("9 things are still missing on your seats. Add one and you earn a credit.") && d.html.includes("9 things are still missing on your seats. Add one and you earn a credit."));
check("no seats line when nothing is missing", !/missing on your seats/.test(digest({ seatFactsMissing: 0 }).text + digest({ seatFactsMissing: 0 }).html));
check("one missing thing reads right", digest({ seatFactsMissing: 1 }).text.includes("1 thing is still missing on your seats. Add it and you earn a credit."));
check("shows the credit balance", d.text.includes("You have 12 credits to spend.") && d.html.includes("You have 12 credits to spend."));
check("one credit reads right, and says how to earn", digest({ credits: 1, seatFactsMissing: 0 }).text.includes("You have 1 credit left. Add a fact you know and you earn another."));
check("3 credits or fewer says how to earn", digest({ credits: 3, seatFactsMissing: 0 }).text.includes("You have 3 credits left. Add a fact you know and you earn another.") && digest({ credits: 4, seatFactsMissing: 0 }).text.includes("You have 4 credits to spend."));
check("with the seats line above it, a low balance does not repeat how to earn", digest({ credits: 2 }).text.includes("You have 2 credits left.\n") && !digest({ credits: 2 }).text.includes("earn another"));
check("one closed role reads right", digest({ closedRoles: 1 }).text.includes("1 role closed this week. Its company is visible again."));
check("all hidden reads right", digest({ newRolesMineHidden: 4 }).text.includes("All 4 companies are locked."));
check("the button comes before the list of functions", d.html.indexOf("See this week&#39;s roles") < d.html.indexOf("New roles by function") && d.text.indexOf("See this week's roles") < d.text.indexOf("New roles by function"));
check("says so when every company in the member's function is already visible", digest({ newRolesMineHidden: 0 }).text.includes("You can already see all 4 companies."));
check("has one button to the app", (d.html.match(/See this week&#39;s roles/g) ?? []).length === 1 && d.html.includes('href="https://table-pilot.up.railway.app/?k=abc123&amp;tab=roles"'), d.html.match(/<a [^>]*>/g));
check("text has the app link", d.text.includes("See this week's roles\nhttps://table-pilot.up.railway.app/?k=abc123&tab=roles"));
check("unsubscribe link is in the text", d.text.includes(base.unsubscribeUrl));
check("unsubscribe link is in the HTML", d.html.includes('href="https://table-pilot.up.railway.app/api/table?unsubscribe=tok_123&amp;m=1"') && />Unsubscribe<\/a>/.test(d.html));
check("says why they got it", d.text.includes("because you're a Merlin member") && d.html.includes("because you&#39;re a Merlin member"));
// The header: the banner image from the site the email links to, on pine, with the name as its alt text.
const BANNER = /<td bgcolor="#073F2F" style="padding:0;[^"]*background-color:#073F2F[^"]*"><img src="([^"]+)" width="560" height="128" alt="Merlin by Revenue Nomad" style="display:block;[^"]*"><\/td>/;
check("header is the banner on pine, from the app's own site", d.html.match(BANNER)?.[1] === "https://table-pilot.up.railway.app/brand/merlin-banner-email.png", d.html.match(/<img [^>]*>/)?.[0]);
check("one image, in the header", (d.html.match(/<img /g) ?? []).length === 1);
check("the text part has no header", d.text.startsWith("Hi "));
{
  // With no link and no RN_PUBLIC_URL there is nowhere to load the banner from: the name in text, on pine.
  const was = process.env.RN_PUBLIC_URL;
  delete process.env.RN_PUBLIC_URL;
  const bare = renderDigest({ ...base, appUrl: "", unsubscribeUrl: "" } as DigestData);
  check("no site to load the banner from: the pine bar with the name in text", /bgcolor="#073F2F"[^>]*>Merlin</.test(bare.html) && !bare.html.includes("<img"));
  process.env.RN_PUBLIC_URL = "https://merlin.example.com/";
  const viaEnv = renderDigest({ ...base, appUrl: "", unsubscribeUrl: "" } as DigestData);
  check("no link in the email: the banner comes from RN_PUBLIC_URL", viaEnv.html.match(BANNER)?.[1] === "https://merlin.example.com/brand/merlin-banner-email.png", viaEnv.html.match(/<img [^>]*>/)?.[0]);
  if (was === undefined) delete process.env.RN_PUBLIC_URL;
  else process.env.RN_PUBLIC_URL = was;
}
check("button is volt with pine text", /bgcolor="#2EE59D"[^>]*><a [^>]*color:#073F2F/.test(d.html));
eq("ember is used once, on the count", (d.html.match(/#FF5A1F/gi) ?? []).length, 1);
check("max width is 560px", d.html.includes("max-width:560px"));
check("layout uses tables and inline styles only", !/<style|<link|<script|class=/i.test(d.html) && d.html.includes('role="presentation"'));
check("system fonts only", !/Figtree|googleapis|@font-face/i.test(d.html));

process.env.RN_EMAIL_FOOTER = 'Revenue Nomad <b>LLC</b>, 1 Main St & "Suite" 2';
const hostile = digest({
  name: '<script>alert("x")</script> Smith',
  function: 'Sales & "Ops" <i>',
  byFunction: [{ function: "<img src=x onerror=alert(1)>", n: 2 }, { function: 'Sales & "Ops" <i>', n: 4 }],
  appUrl: 'https://example.com/?a=1&b="2"><script>',
  unsubscribeUrl: "https://example.com/u?t=<tok>&x='1'",
});
// The banner is the one image the frame adds; its address is only the link's origin.
check("the banner comes from the link's site only", hostile.html.match(BANNER)?.[1] === "https://example.com/brand/merlin-banner-email.png", hostile.html.match(/<img [^>]*>/)?.[0]);
const hostileBody = hostile.html.replace(BANNER, "");
check("HTML is escaped: no raw tags from data", !/<script|<img|<i>|<b>/i.test(hostileBody), hostileBody.match(/<(script|img|i|b)[ >][^\n]{0,60}/i)?.[0]);
check("HTML is escaped: name, function, footer", hostile.html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;") && hostile.html.includes("Sales &amp; &quot;Ops&quot; &lt;i&gt;") && hostile.html.includes("Revenue Nomad &lt;b&gt;LLC&lt;/b&gt;, 1 Main St &amp; &quot;Suite&quot; 2"));
check("HTML is escaped: links cannot break out of the attribute", !/href="[^"]*"[^ >]/.test(hostile.html) && hostile.html.includes("&lt;tok&gt;&amp;x=&#39;1&#39;"), hostile.html.match(/href="[^"]*"[^ >][^\n]{0,40}/)?.[0]);
check("footer line from RN_EMAIL_FOOTER is in the text", hostile.text.includes('Revenue Nomad <b>LLC</b>, 1 Main St & "Suite" 2'));
check("a link that is not a web link is left out", !digest({ appUrl: "javascript:alert(1)" }).html.includes("javascript:"));
delete process.env.RN_EMAIL_FOOTER;
// The header says "by Revenue Nomad"; the footer (after the rule) must not carry the footer line.
const footOf = (html: string) => html.slice(html.lastIndexOf("border-top:1px solid"));
check("no footer line when RN_EMAIL_FOOTER is not set", footOf(digest().html).length > 0 && !footOf(digest().html).includes("Revenue Nomad"));

const sparse = [
  digest(),
  digest({ function: null, newRolesMine: 0, newRolesMineHidden: 0 }),
  digest({ newRoles: 0, newRolesMine: 0, newRolesMineHidden: 0, byFunction: [], closedRoles: 0, seatFactsMissing: 0, credits: 0 }),
  digest({ name: "", function: "Other", newRolesMine: 3 }),
  renderDigest({ name: "Sam", email: "s@example.com", appUrl: base.appUrl, unsubscribeUrl: base.unsubscribeUrl } as unknown as DigestData),
  renderDigest({ ...base, newRoles: NaN, newRolesMine: undefined, byFunction: null, credits: -4, closedRoles: null } as unknown as DigestData),
];
check("never prints undefined, null or NaN", sparse.every((r) => !/undefined|null|NaN/.test(r.subject + r.text + r.html)), sparse.map((r) => (r.subject + r.text + r.html).match(/.{0,40}(undefined|null|NaN).{0,20}/)?.[0]));
check("an empty name still gets a greeting", sparse[3].text.startsWith("Hi there,"));
check("the Other bucket gets the general subject", sparse[3].subject === "12 new fractional roles this week", sparse[3].subject);
check("a zero balance says how to earn", sparse[2].text.includes("You have 0 credits. Add a fact you know and you earn one."));

// Brand voice: no em dashes, no semicolons, no colons in running copy (links aside).
const copy = sparse.map((r) => r.subject + "\n" + r.text).join("\n").split("\n").filter((l) => !/^https?:\/\//.test(l));
check("copy has no em dash, semicolon or colon", copy.every((l) => !/[—;:]/.test(l)), copy.filter((l) => /[—;:]/.test(l)));
check("copy has no banned words", !/\b(unlock the power|seamless|leverage|insights|supercharge|elevate|streamline|robust|journey|buyers?|talent)\b/i.test(copy.join("\n")));
check("never names a company", !/Acme|Northwind|Kestrel/.test(sparse.map((r) => r.text + r.html).join("")));

/* ---------- sign-in email ---------- */
console.log("\nSign-in email");

const si = signInEmail("Maya Okafor", "https://table-pilot.up.railway.app/?k=abc123&x=<1>");
eq("subject", si.subject, "Your Merlin sign-in link");
check("greets by first name", si.text.startsWith("Hi Maya,") && si.html.includes("Hi Maya,"));
check("an empty name still gets a greeting", signInEmail("", "https://example.com/?k=a").text.startsWith("Hi there,"));
check("text carries the link on its own line", si.text.split("\n").includes("https://table-pilot.up.railway.app/?k=abc123&x=<1>"));
check("same frame as the weekly email: the banner header", si.html.match(BANNER)?.[1] === "https://table-pilot.up.railway.app/brand/merlin-banner-email.png" && si.html.includes("max-width:560px"), si.html.match(/<img [^>]*>/)?.[0]);
check("one volt button with pine text, to the link", (si.html.match(/bgcolor="#2EE59D"/g) ?? []).length === 1 && /bgcolor="#2EE59D"[^>]*><a href="https:\/\/table-pilot\.up\.railway\.app\/\?k=abc123&amp;x=&lt;1&gt;"[^>]*color:#073F2F[^>]*>Sign in to Merlin</.test(si.html), si.html.match(/<a [^>]*>/g));
check("no ember in the sign-in email", !/#FF5A1F/i.test(si.html));
check("the link is also shown as text, in mono", /font-family:ui-monospace[^>]*><a [^>]*>https:\/\/table-pilot\.up\.railway\.app\/\?k=abc123&amp;x=&lt;1&gt;<\/a>/.test(si.html));
check("tables and inline styles only, system fonts", !/<style|<link|<script|class=|googleapis|@font-face|Schibsted|Figtree/i.test(si.html) && si.html.includes('role="presentation"'));
check("says to keep the link private and what to do if they did not ask", si.text.includes("It works like a password.") && si.text.includes("If it wasn't you, ignore this email."));
const siCopy = (si.subject + "\n" + si.text).split("\n").filter((l) => !/^https?:\/\//.test(l));
check("copy has no em dash, semicolon or colon", siCopy.every((l) => !/[—;:]/.test(l)), siCopy.filter((l) => /[—;:]/.test(l)));

/* ---------- scans stored on a table (applyScan in lib/table.ts) ---------- */

// Each scenario in scripts/scan-scenarios.mts runs in its own process on a made-up seed and an
// empty data folder: the server module keeps its state in memory, and each one needs a fresh table.
const scenarioFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "scan-scenarios.mts");
const SCENARIOS: [string, string][] = [
  ["cap", "The cap of 60 a run"],
  ["health", "A board that reads but matches nothing"],
  ["baseline", "A board that got smaller"],
  ["dates", "What a role's dates say"],
  ["refunds", "Unlocks on a role that had closed"],
  ["names", "One company, one record"],
  ["small", "A board that lists one role"],
  ["claimgone", "This isn't me on a role whose posting is long gone"],
  ["notfractional", "A full-time job an older screen let in, listed again"],
  ["seniority", "Roles outside GTM below Director"],
  ["functions", "Functions outside GTM, and the roles an older scan filed under Executive"],
];
for (const [name, title] of SCENARIOS) {
  console.log(`\nStored scans: ${title}`);
  const run = spawnSync(process.execPath, [...process.execArgv, scenarioFile, name], { encoding: "utf8", timeout: 180_000 });
  const out = run.stdout ?? "";
  const lines = out.split("\n").filter((l) => l && !l.startsWith("##"));
  if (lines.length) console.log(lines.join("\n"));
  const result = out.match(/^##RESULT (\d+) (\d+)$/m);
  if (result) {
    passed += Number(result[1]);
    failed += Number(result[2]);
  } else check(`scenario ${name} ran to the end`, false, (run.stderr || String(run.error ?? "no output")).slice(-600));
}

const samples = args.indexOf("--samples");
if (samples >= 0 && args[samples + 1]) {
  const dir = args[samples + 1];
  mkdirSync(dir, { recursive: true });
  process.env.RN_EMAIL_FOOTER = "Revenue Nomad, 100 Example Street, Suite 1, Anytown, USA";
  const a = digest();
  const b = digest({ name: "Dev Patel", function: "Marketing", newRoles: 7, newRolesMine: 0, newRolesMineHidden: 0, byFunction: [{ function: "Sales", n: 4 }, { function: "RevOps", n: 2 }, { function: "Customer Success", n: 1 }], closedRoles: 1, seatFactsMissing: 0, credits: 0 });
  writeFileSync(path.join(dir, "digest-roles-in-function.html"), a.html);
  writeFileSync(path.join(dir, "digest-roles-in-function.txt"), `Subject: ${a.subject}\n\n${a.text}\n`);
  writeFileSync(path.join(dir, "digest-none-in-function.html"), b.html);
  writeFileSync(path.join(dir, "digest-none-in-function.txt"), `Subject: ${b.subject}\n\n${b.text}\n`);
  const c = signInEmail("Maya Okafor", "https://table-pilot.up.railway.app/?k=EXAMPLEcode123");
  writeFileSync(path.join(dir, "sign-in.html"), c.html);
  writeFileSync(path.join(dir, "sign-in.txt"), `Subject: ${c.subject}\n\n${c.text}\n`);
  console.log(`\nWrote 3 sample emails to ${dir}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
