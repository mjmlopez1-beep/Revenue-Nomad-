/**
 * Clean company data: HQ as a country and region (lib/geo.ts), industry, employees and revenue
 * as Revenue Nomad's standard values (lib/industryMap.ts), fractional firms removed
 * (lib/firms.ts, lib/firmRemoval.ts), firmographics from research for a company the weekly scan
 * added (without giving a locked company away), and the connector's place filters.
 *
 *   npx tsx scripts/test-geo.mts
 *
 * The table parts run in this process on a made-up seed in a temporary data dir.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL ${name}${detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 400)}`}`);
  }
}

const dir = mkdtempSync(path.join(tmpdir(), "rn-geo-"));
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

/* ---------- the made-up seed and state ---------- */

const seed = {
  builtAt: daysAgo(1),
  members: [
    { id: "m1", name: "Gia Geo", email: "gia@example.com", title: "Fractional CMO", token: "tok-gia" },
    { id: "m2", name: "Fran Firm", email: "fran@example.com", title: "Fractional CFO", token: "tok-fran" },
    { id: "m3", name: "Una Unlocker", email: "una@example.com", title: "Fractional CRO", token: "tok-una" },
  ],
  companies: [
    { id: "c_austin", fields: { name: "Austin Widgets", website: "austinwidgets.example.com", industry: "SaaS", employees: "11–50", revenue: "< $1M", hq: "Austin, TX" } },
    { id: "c_sf", fields: { name: "Bay Gadgets", website: "baygadgets.example.com", industry: "Software & IT Services", hq: "San Francisco, California" } },
    { id: "c_ldn", fields: { name: "Thames Data", website: "thamesdata.example.com", industry: "Health Care", about: "A pharmaceutical research company.", hq: "London, United Kingdom" } },
    { id: "c_tor", fields: { name: "Maple Metrics", website: "maplemetrics.example.com", hq: "Toronto, Canada", employees: "51-200" } },
    // Our records know this company well; the weekly scan added it again under a slightly different name.
    { id: "c_known", fields: { name: "Quietly Known", website: "quietlyknown.example.com", industry: "Fintech", employees: "51–200", revenue: "$5M–$20M", hq: "Denver, CO", linkedin: "linkedin.com/company/quietly-known", about: "Secret sauce." } },
    // A firm a member published a seat at: kept, for an admin's review.
    { id: "c_toptal", fields: { name: "Toptal", website: "toptal.com" } },
    // A firm the rules know (an admin added the name after the seed was built): left out of the table.
    { id: "c_yor", fields: { name: "yorCMO", website: "yorcmo.example.com" } },
  ],
  engagements: [
    { id: "e_austin1", companyId: "c_austin", fields: { source: "Published engagement", operator: "Gia Geo", function: "Marketing", type: "Fractional", revenue: "$1M-$5M", employees: "75" } },
    { id: "e_sf1", companyId: "c_sf", fields: { source: "Member success story", operator: "Una Unlocker", function: "Sales" } },
    { id: "e_toptal1", companyId: "c_toptal", fields: { source: "Published engagement", operator: "Fran Firm", function: "Finance", type: "Fractional" } },
    { id: "e_yor1", companyId: "c_yor", fields: { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", status: "Active", end: "Ongoing" } },
  ],
  contacts: [],
  // A firm the seed cleanup dropped, which the running table still holds facts about.
  removedFirms: { companies: [{ id: "c_dropped", name: "Agile Executives" }], engagements: [{ id: "e_dropped1", companyId: "c_dropped" }], contacts: [] },
};
const scanAt = daysAgo(2);
const state = {
  companies: [
    // The weekly scan added Quietly Known again (same website): research fills its free facts.
    { id: "c_scanq", name: "Quietly Known Inc", by: "scan", at: scanAt },
    // A member added a fractional firm before Add refused them: removed on load, unlocks refunded.
    { id: "c_memberfirm", name: "Chief Outsiders", by: "m2", at: daysAgo(5) },
    // A firm where a member holds their own seat: kept for review.
    { id: "c_heldfirm", name: "GoFractional", by: "m1", at: daysAgo(5) },
  ],
  engagements: [
    { id: "e_scanq", companyId: "c_scanq", by: "scan", at: scanAt, source: "Demand scan" },
    { id: "e_memberfirm", companyId: "c_memberfirm", by: "m2", at: daysAgo(5) },
    { id: "e_heldfirm", companyId: "c_heldfirm", by: "m1", at: daysAgo(5) },
  ],
  contacts: [],
  values: {
    "c_scanq.website": { value: "quietlyknown.example.com", by: "scan", at: scanAt, status: "live" },
    "e_scanq.role": { value: "Fractional VP Marketing", by: "scan", at: scanAt, status: "live" },
    "e_scanq.function": { value: "Marketing", by: "scan", at: scanAt, status: "live" },
    "e_scanq.status": { value: "Open role", by: "scan", at: scanAt, status: "live" },
    "e_scanq.posting": { value: "jobs.example.com/quietly-vp", by: "scan", at: scanAt, status: "live" },
    "c_memberfirm.hq": { value: "Boston, MA", by: "m2", at: daysAgo(5), status: "live" },
    "e_memberfirm.operator": { value: "Una Unlocker", by: "m2", at: daysAgo(5), status: "live" },
    "e_memberfirm.rate": { value: "$9k/mo", by: "m2", at: daysAgo(5), status: "live" },
    "e_heldfirm.operator": { value: "Gia Geo", by: "m1", at: daysAgo(5), status: "live", memberId: "m1" },
    "e_heldfirm.function": { value: "Marketing", by: "m1", at: daysAgo(5), status: "live" },
    "c_dropped.industry": { value: "Corporate Services", by: "m3", at: daysAgo(6), status: "live" },
    "c_austin.industry": { value: "Software", by: "m3", at: daysAgo(6), status: "live" },
  },
  unlocks: { "e_memberfirm.rate": ["m3"], "e_dropped1.rate": ["m3"] },
  verifications: {},
  members: [],
  ledger: [
    { memberId: "m2", delta: 1, reason: "fill", ref: "e_memberfirm.rate", at: daysAgo(5) },
    { memberId: "m3", delta: -1, reason: "unlock", ref: "e_memberfirm.rate", at: daysAgo(4) },
    { memberId: "m3", delta: -1, reason: "unlock", ref: "e_dropped1.rate", at: daysAgo(4) },
  ],
  profiles: {},
  follows: { m3: ["c_memberfirm", "c_austin"] },
  referralPaid: [],
  reportLog: [],
  held: [],
  benchRates: [],
  signals: [],
  notMine: {},
  seen: {},
  scan: {
    lastRunAt: scanAt,
    sources: [],
    roles: { "quietly:vp": { engagementId: "e_scanq", companyId: "c_scanq", firstSeen: scanAt, lastSeen: scanAt, closedAt: null, url: "jobs.example.com/quietly-vp", source: "board" } },
  },
  digest: { lastSentAt: null, sent: 0, members: {} },
  flags: {},
  connector: { clients: [], grants: [], alerts: { m3: [{ id: "a1", name: "old", industry: ["Software"], revenue: ["< $1M"], createdAt: daysAgo(3) }] } },
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(path.join(dir, "intel.json"), JSON.stringify(state));
Object.assign(process.env, { RN_DATA_DIR: dir, RN_STARTER_CREDITS: "25", RN_ADMIN_EMAILS: "admin@example.com", RN_LOGO_LOOKUP: "off" });

const geo = await import("../lib/geo.ts");
const F = await import("../lib/tableFields.ts");
const IM = await import("../lib/industryMap.ts");
const firms = await import("../lib/firms.ts");
const FR = await import("../lib/firmRemoval.ts");

/* ---------- HQ: country and region ---------- */

const hq = (raw: string, country: string | null, region: string | null) => {
  const g = geo.normalizeHq(raw);
  check(`HQ "${raw}" is ${country} / ${region}`, g.country === country && g.region === region, g);
};
hq("Austin, TX", "United States", "Texas");
hq("San Francisco, CA", "United States", "California");
hq("San Francisco, California", "United States", "California");
hq("Venice , Ca", "United States", "California");
hq("New York, NY", "United States", "New York");
hq("New York, United States", "United States", "New York");
hq("Armonk, New York, NY", "United States", "New York");
hq("Washington, DC", "United States", "District of Columbia");
hq("Washington, Utah", "United States", "Utah");
hq("United States", "United States", null);
hq("USA", "United States", null);
hq("U.S.", "United States", null);
hq("California", "United States", "California");
hq("Dublin, Ohio", "United States", "Ohio");
hq("Vancouver, Washington", "United States", "Washington");
hq("Warsaw, Indiana", "United States", "Indiana");
hq("London, United Kingdom", "United Kingdom", "England");
hq("London, UK", "United Kingdom", "England");
hq("London, London", "United Kingdom", "England");
hq("Reading, Berkshire", "United Kingdom", "England");
hq("Edinburgh", "United Kingdom", "Scotland");
hq("London, Ontario", "Canada", "Ontario");
hq("Toronto, Canada", "Canada", "Ontario");
hq("Vancouver, BC", "Canada", "British Columbia");
hq("Montreal, QC", "Canada", "Quebec");
hq("Perth, WA", "Australia", "Western Australia");
hq("Seattle, WA", "United States", "Washington");
hq("Brisbane, Qld", "Australia", "Queensland");
hq("Dublin 2, Ireland", "Ireland", "County Dublin");
hq("Nürnberg, Bayern", "Germany", "Bavaria");
hq("Paris, Île-de-France", "France", "Île-de-France");
hq("Lerma , Estado de México", "Mexico", "State of Mexico");
hq("Singapore, Singapore", "Singapore", null);
hq("Bay Area/Global, United States", "United States", "California");
hq("Work from Anywhere, Remote", null, null);
hq("", null, null);
check("normalizeHq never throws on odd input", [null, undefined, 42, {}, "   ", ",,,", "x".repeat(5000)].every((x) => { try { geo.normalizeHq(x); return true; } catch { return false; } }));
check("COUNTRIES_FIRST starts with the United States, the United Kingdom and Canada", geo.COUNTRIES_FIRST.slice(0, 3).join() === "United States,United Kingdom,Canada" && new Set(geo.COUNTRIES_FIRST).size === geo.COUNTRIES_FIRST.length);
check("placeFilter reads a country or a state, not a city", geo.placeFilter("UK")?.country === "United Kingdom" && geo.placeFilter("Texas")?.region === "Texas" && geo.placeFilter("Ontario, Canada")?.region === "Ontario" && geo.placeFilter("Austin, TX") === null);
check("cleanValue keeps the HQ as typed, without a space before a comma", F.cleanValue(F.fieldDef("company", "hq")!, "Venice , CA").value === "Venice, CA");

/* ---------- industry, employees and revenue: always a standard value ---------- */

check("RN_INDUSTRIES is the platform's 110 active industries, with a slug each", F.RN_INDUSTRIES.length === 110 && F.RN_INDUSTRIES[0] === "SaaS" && F.RN_INDUSTRIES.every((n) => !!F.RN_INDUSTRY_SLUGS[n]) && !F.RN_INDUSTRIES.includes("B2B SaaS"));
check("RN_REVENUE and RN_EMPLOYEES are unchanged", F.RN_REVENUE.join() === "Pre-revenue,Under $1M,$1M–$5M,$5M–$20M,$20M–$50M,$50M+" && F.RN_EMPLOYEES.join() === "1–10,11–50,51–200,201–500,501–1,000,1,001+");
const band = (fn: (x: unknown) => string | null, raw: string, want: string | null) => check(`${fn === IM.revenueBand ? "revenue" : "employees"} "${raw}" is ${want}`, fn(raw) === want, fn(raw));
band(IM.employeeBand, "75", "51–200");
band(IM.employeeBand, "51-200", "51–200");
band(IM.employeeBand, "1001-5000", "1,001+");
band(IM.employeeBand, "10,001+", "1,001+");
band(IM.employeeBand, "2-10", "1–10");
band(IM.employeeBand, "11_50", "11–50");
band(IM.employeeBand, "51_200|201_500", "51–200");
band(IM.employeeBand, "$5M", null);
band(IM.employeeBand, "lots", null);
band(IM.revenueBand, "< $1M", "Under $1M");
band(IM.revenueBand, "$12M", "$5M–$20M");
band(IM.revenueBand, "$1M-$5M", "$1M–$5M");
band(IM.revenueBand, "0-500K", "Under $1M");
band(IM.revenueBand, "25M-75M", "$20M–$50M");
band(IM.revenueBand, "$100M+", "$50M+");
band(IM.revenueBand, "1m_5m", "$1M–$5M");
band(IM.revenueBand, "50m_plus", "$50M+");
band(IM.revenueBand, "Pre-revenue", "Pre-revenue");
band(IM.revenueBand, "unknown", null);
const ind = (raw: string, want: string | null, ctx = "", legacy = false) => check(`industry "${raw}"${ctx ? ` (${ctx})` : ""} is ${want}`, IM.industryOf(raw, ctx, legacy) === want, IM.industryOf(raw, ctx, legacy));
ind("SaaS", "SaaS");
ind("B2B SaaS", "SaaS");
ind("Software Development", "SaaS");
ind("Software", "Enterprise Software", "ERP for large organizations", true);
ind("Software", "SMB Software", "Invoicing for small businesses", true);
ind("Software & IT Services", "IT Services", "", true);
ind("IT Services and IT Consulting", "IT Services");
ind("Computer and Network Security", "Cybersecurity");
ind("Health Care", "Pharma & Biotech", "A pharmaceutical company", true);
ind("Health Care", "Health Care", "", true);
ind("Health Care", "Health Care", "A pharmaceutical company", false);
ind("Corporate Services", "Staffing & Recruiting", "A staffing agency for nurses", true);
ind("Staffing and Recruiting", "Staffing & Recruiting");
ind("Business Consulting and Services", "Consulting & Advisory");
ind("Finance", "Accounting & Tax", "", true);
ind("Accounting", "Accounting & Tax");
ind("Financial Services", "Banking & Credit Unions", "A community bank", true);
ind("Financial Services", null, "", true);
ind("Media & Communications", "Media & Content", "", true);
ind("Marketing Services", "Advertising & Media Agencies");
ind("Hospitals and Health Care", "Healthcare Providers & Health Systems", "Regional hospital system");
ind("Artificial Intelligence, Transportation; SaaS", "Deep Tech / AI");
ind("Xyzzy", null);
for (const old of Object.keys(IM.OLD_INDUSTRY_DEFAULTS)) {
  const d = IM.OLD_INDUSTRY_DEFAULTS[old];
  check(`the earlier tag ${old} maps onto the list (or stays empty)`, d === null || F.RN_INDUSTRIES.includes(d), d);
}
check("cleanValue maps a value outside the list to its standard value", F.cleanValue(F.fieldDef("company", "revenue")!, "< $1M").value === "Under $1M" && F.cleanValue(F.fieldDef("company", "employees")!, "51-200").value === "51–200" && F.cleanValue(F.fieldDef("company", "industry")!, "B2B SaaS").value === "SaaS");
check("cleanValue refuses what maps to nothing", !!F.cleanValue(F.fieldDef("company", "industry")!, "Xyzzy").error && !!F.cleanValue(F.fieldDef("company", "revenue")!, "lots").error);

/* ---------- firms ---------- */

const firm = (name: string, want: boolean, more: Partial<Parameters<typeof firms.firmReason>[0]> = {}) =>
  check(`${name} is ${want ? "" : "not "}a fractional firm`, (firms.firmReason({ name, ...more }) !== null) === want, firms.firmReason({ name, ...more }));
for (const n of ["Toptal", "Catalant", "Chief Outsiders", "FocusCFO®", "Freeman Clarke", "yorCMO", "salesQB", "Connectd", "GoFractional", "Agile Executives", "ScaleWise", "Contractor", "Independent", "Profesional Independiente", "Freelance", "Self-employed", "HireCMO.com", "The FCFO", "Acme Fractional Partners"]) firm(n, true);
for (const n of ["Acme Robotics", "Microsoft", "Micro Focus", "Stealth Startup", "Confidential", "Arthur Recruitment", "Lumino Consulting", "RecruitBot", "Talent Matters"]) firm(n, false);
firm("Pinnacle Growth", true, { listedBy: 3, employees: "11–50" });
firm("Oracle", false, { listedBy: 4, employees: "1,001+" });
firm("Small Co", true, { about: "We are a network of vetted fractional executives." });
firm("Jane Doe Consulting", true, { holders: ["Jane Doe"], employees: "1–10" });
check("NOT_FIRMS wins over the rules", firms.isNotFirm("RecruitBot") && firms.firmReason({ name: "RecruitBot" }) === null);

// The seed cleanup on a copy.
const copy = structuredClone(seed) as never as Parameters<typeof FR.cleanSeed>[0];
delete (copy as { removedFirms?: unknown }).removedFirms;
const st = FR.cleanSeed(copy);
check("cleanSeed drops a firm and its seats", !copy.companies.some((c) => c.id === "c_yor") && !copy.engagements.some((e) => e.companyId === "c_yor") && st.removed.companies === 1 && st.removed.seats === 1, st.removed);
check("cleanSeed keeps a firm where a member published a seat, for review", copy.companies.some((c) => c.id === "c_toptal") && copy.firmReview?.some((r) => r.companyId === "c_toptal") === true);
check("cleanSeed records what it dropped", copy.removedFirms?.companies.some((c) => c.id === "c_yor") === true && copy.removedFirms?.engagements.some((e) => e.id === "e_yor1") === true);
const austin = copy.companies.find((c) => c.id === "c_austin")!.fields;
const ldn = copy.companies.find((c) => c.id === "c_ldn")!.fields;
check("cleanSeed maps values to standard ones and stores the place", austin.revenue === "Under $1M" && austin.country === "United States" && austin.region === "Texas" && ldn.industry === "Pharma & Biotech" && copy.companies.find((c) => c.id === "c_tor")!.fields.employees === "51–200", { austin, ldn });
check("cleanSeed reports remapped values", (st.remapped.revenue ?? 0) >= 1 && (st.remapped.industry ?? 0) >= 2, st.remapped);
const twice = FR.cleanSeed(copy);
check("cleanSeed run again changes nothing", twice.removed.companies === 0 && Object.keys(twice.remapped).length === 0, twice);

/* ---------- the running table ---------- */

const T = await import("../lib/table.ts");
const s = await T.loadState();
check("a firm a member added is removed on load", !s.companies.some((c) => c.id === "c_memberfirm") && !s.engagements.some((e) => e.id === "e_memberfirm") && !Object.keys(s.values).some((k) => k.startsWith("c_memberfirm.") || k.startsWith("e_memberfirm.")));
check("its unlocks are refunded once, and so are unlocks of a firm the seed dropped", s.ledger.filter((l) => l.reason === "refund" && l.memberId === "m3").length === 2 && !s.unlocks["e_memberfirm.rate"] && !s.unlocks["e_dropped1.rate"], s.ledger);
check("follows of a removed firm go, others stay", s.follows.m3?.join() === "c_austin", s.follows);
check("facts about a firm the seed dropped go", !s.values["c_dropped.industry"]);
check("a firm where a member holds a seat stays, listed for review", s.companies.some((c) => c.id === "c_heldfirm") && s.firmReview?.some((r) => r.companyId === "c_heldfirm") === true);
check("a stored value outside the list takes its standard value on load", s.values["c_austin.industry"]?.value === "SaaS", s.values["c_austin.industry"]);
const alert = s.connector?.alerts.m3?.[0];
check("saved searches take standard values on load", alert?.industry?.join() === "SaaS" && alert?.revenue?.join() === "Under $1M", alert);
const again = FR.purgeFirms(await T.loadSeed(), structuredClone(s), new Date().toISOString());
check("purging again removes nothing and pays nothing", again.companies === 0 && again.refunds === 0 && again.facts === 0, again);

const view = await T.buildView("tok-una");
const byName = (n: string) => view.companies.find((c) => c.name === n);
check("a seed firm the rules know is left out of the table", !view.companies.some((c) => c.name === "yorCMO"));
check("no company named Chief Outsiders or Agile Executives is on the table", !byName("Chief Outsiders") && !byName("Agile Executives"));
const off: string[] = [];
for (const c of view.companies) {
  for (const [f, list] of [["industry", F.RN_INDUSTRIES], ["employees", F.RN_EMPLOYEES], ["revenue", F.RN_REVENUE]] as const)
    if (c.cells[f]?.s === "value" && !list.includes((c.cells[f] as { v: string }).v)) off.push(`${c.name} ${f}`);
  for (const e of c.engagements)
    for (const [f, list] of [["employees", F.RN_EMPLOYEES], ["revenue", F.RN_REVENUE]] as const)
      if (e.cells[f]?.s === "value" && !list.includes((e.cells[f] as { v: string }).v)) off.push(`${c.name} seat ${f}`);
}
check("every company and seat value in the view is on its standard list", off.length === 0, off);
const aw = byName("Austin Widgets")!;
check("a company carries its country and region", aw.country === "United States" && aw.region === "Texas" && byName("Thames Data")?.country === "United Kingdom" && byName("Maple Metrics")?.region === "Ontario");
check("a seat's revenue and employees at the time are standard values", aw.engagements[0].cells.revenue?.s === "value" && (aw.engagements[0].cells.revenue as { v: string }).v === "$1M–$5M" && (aw.engagements[0].cells.employees as { v: string }).v === "51–200");

// The company the weekly scan added: locked (an open role), with its free facts from research.
const locked = view.companies.find((c) => c.hidden && c.engagements.some((e) => e.cells.function?.s === "value"));
check("the scan-added company is locked while its role is open", !!locked && locked.name === F.HIDDEN_COMPANY && locked.iconDomain === null, locked?.name);
const cell = (k: string) => locked?.cells[k] as { s: string; v?: string; from?: string } | undefined;
check("it shows industry, size and revenue from Revenue Nomad research", cell("industry")?.v === "Fintech" && cell("employees")?.v === "51–200" && cell("revenue")?.v === "$5M–$20M" && cell("industry")?.from === "research" && cell("revenue")?.from === "research", locked?.cells);
check("its HQ shows its region only, and its country and region come with it", cell("hq")?.v === "CO" && locked?.country === "United States" && locked?.region === "Colorado", { hq: cell("hq"), c: locked?.country, r: locked?.region });
check("research never fills its name, website, LinkedIn or About", cell("website")?.s !== "value" && cell("linkedin")?.s !== "value" && cell("about")?.s !== "value" && !JSON.stringify(locked).includes("Quietly") && !JSON.stringify(locked).includes("Secret sauce"), locked?.cells);
const admin = await T.buildView(null);
check("a signed-out view still answers", !!admin.stats);

// Add refuses a firm; the scan never adds one.
const refused = await T.perform("tok-una", { type: "add", company: "Catalant", companyFields: { industry: "SaaS" } } as never).catch((e: Error) => e);
check("Add refuses a fractional firm", refused instanceof Error && refused.message === T.FIRM_REFUSED, refused instanceof Error ? refused.message : refused);
const ok = await T.perform("tok-una", { type: "add", company: "Plain Client Co", companyFields: { industry: "SaaS", hq: "Boise, ID" } } as never).catch((e: Error) => e);
check("Add takes a client", !(ok instanceof Error), ok instanceof Error ? ok.message : ok);
const s2 = await T.loadState();
const plain = s2.companies.find((c) => c.name === "Plain Client Co");
check("a new HQ is stored with its country and region beside the typed text", !!plain && s2.values[`${plain.id}.hq`]?.value === "Boise, ID" && s2.values[`${plain.id}.hq`]?.geo?.region === "Idaho", plain && s2.values[`${plain.id}.hq`]);
const scan = await T.applyScan({
  roles: [
    { key: "co:vp", company: "Chief Outsiders", domain: "chiefoutsiders.com", title: "Fractional CMO", function: "Marketing", type: "Fractional", url: "jobs.example.com/co-vp", source: "board", postedAt: null, rate: null, hoursPerWeek: null },
    { key: "new:vp", company: "Brand New Client", domain: "brandnew.example.com", title: "Fractional VP Sales", function: "Sales", type: "Fractional", url: "jobs.example.com/bn-vp", source: "board", postedAt: null, rate: null, hoursPerWeek: null },
  ],
  sources: [{ source: "board", fetched: 2, matched: 2 }],
});
const s3 = await T.loadState();
check("the scan never adds a fractional firm", scan.firms === 1 && !s3.companies.some((c) => c.name === "Chief Outsiders") && s3.companies.some((c) => c.name === "Brand New Client"), scan);

/* ---------- the connector's place filters ---------- */

const tools = await import("../lib/mcp/tools.ts");
const member = (await T.loadSeed()).members.find((m) => m.id === "m3")!;
const ctx = { member, origin: "https://post.example.com" };
const names = (out: Record<string, unknown>) => ((out.companies as { name: string }[]) ?? []).map((c) => c.name);
const inUs = await tools.searchCompanies(ctx, { country: "USA", limit: 25 });
check("search_companies country USA finds every US company, CA and California alike", names(inUs).includes("Austin Widgets") && names(inUs).includes("Bay Gadgets") && !names(inUs).includes("Thames Data"), names(inUs));
const inUk = await tools.searchCompanies(ctx, { country: "UK", limit: 25 });
check("search_companies country UK", names(inUk).join() === "Thames Data", names(inUk));
const inCal = await tools.searchCompanies(ctx, { region: "CA", limit: 25 });
check("search_companies region CA is California", names(inCal).join() === "Bay Gadgets", names(inCal));
const hqUs = await tools.searchCompanies(ctx, { hq: "United States", limit: 25 });
check("search_companies hq United States matches by country too", names(hqUs).includes("Austin Widgets") && names(hqUs).includes("Bay Gadgets"), names(hqUs));
const ont = await tools.searchCompanies(ctx, { country: "Canada", region: "ON", limit: 25 });
check("search_companies country and region together", names(ont).join() === "Maple Metrics", names(ont));
const bad = await tools.searchCompanies(ctx, { country: "Atlantis" }).catch((e: Error) => e);
check("search_companies says so for a country it doesn't know", bad instanceof Error && /isn't a country/.test(bad.message));
const summary = (inUs.companies as Record<string, unknown>[]).find((c) => c.name === "Austin Widgets");
check("search results carry country and region", summary?.country === "United States" && summary?.region === "Texas", summary);
const legacyFilter = await tools.searchCompanies(ctx, { industry: ["Software & IT Services"], limit: 25 });
check("an industry filter given an earlier tag reads it as today's value", names(legacyFilter).join() === "Bay Gadgets", names(legacyFilter));

rmSync(dir, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
