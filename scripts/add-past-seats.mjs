#!/usr/bin/env node
/**
 * Merge ended fractional seats (the sheet's Past Seats tab: one row per person per fractional role
 * that ended in 2021 or later) into the private seed, data/intel-seed.json, then re-seal
 * data/intel-seed.enc. Run it again with the same or a newer file: seats already on file are not
 * added twice.
 *
 *   node scripts/add-past-seats.mjs <past-seats.csv>
 *   node scripts/add-past-seats.mjs <past-seats.csv> --companies <past-companies.csv>   (the Past Companies tab)
 *   node scripts/add-past-seats.mjs <past-seats.csv> --names                            (US holders' names, unverified)
 *   node scripts/add-past-seats.mjs <past-seats.csv> --dry-run                          (counts only, writes nothing)
 *   node scripts/add-past-seats.mjs <past-seats.csv> --counts-only                      (no company name or title printed)
 *   node scripts/add-past-seats.mjs <past-seats.csv> --seed <intel-seed.json> --no-seal (tests, a copy)
 *   node scripts/add-past-seats.mjs <interim-seats.csv> --interim [--companies ...]      (the Interim Seats tab)
 *
 * Needs the seed key (RN_INTEL_SEED_KEY, else data/intel-seed.key): seats are keyed by a one-way
 * HMAC of the file's past_seat_id under it: "e_ps_" + the first 20 hex of
 * HMAC-SHA256(key, "past-seat:" + past_seat_id). A row whose seat is on the seed by that id adds
 * nothing (a re-run). Re-seals only the default seed, unless --no-seal or --dry-run.
 *
 * Each kept row is one seat: source "Seat scan" (members read it as "Revenue Nomad research", as
 * they do the current seats), type Fractional, status Ended, its title, function, and start and end
 * as years alone ("2023"): the file has years only, and the app reads a year alone as that year
 * (a start as its December for Recently hired, lib/hired.ts). A row with no start year gets no start.
 * The seat carries no `addedAt`: add-seat-scan stamps it so saved views that follow hires hear about
 * a new hire that week (lib/hireAlerts.ts), and Crystal Ball reads it as a hire that just came in
 * (lib/radar/signals.ts, adjacent). An ended seat is neither: Recently hired, which the hire alerts
 * read, leaves an ended seat out, but Crystal Ball's adjacent signal doesn't look at the status, so
 * the stamp stays off. Like a current seat, it has no holder until its fractional claims
 * it (claimSeat in lib/table.ts), unless --names gives it one.
 *
 * Each seat also gets the holder's one-way person key, `holderKey` = "p_" + the first 20 hex of
 * HMAC-SHA256(seed key, "person:" + person_sales_nav_id) (scripts/seat-import.mjs personKey): the same
 * key as on that person's current seats (add-seat-scan.mjs --backfill-holder-keys), so one
 * fractional's seats can be grouped. It sits on the seat record, outside its fields, so no view,
 * export or connector answer carries it. A seat on file that lacks one gets it on a re-run.
 *
 * --interim reads the Interim Seats tab instead (the same columns, with interim_seat_id, "li-int-..."):
 * each seat is type Interim, keyed "e_is_" + the first 20 hex of HMAC-SHA256(key, "interim-seat:" +
 * interim_seat_id), so it never collides with a past seat. An interim title at an executive search,
 * staffing or interim placement firm (staffingFirm in scripts/seat-import.mjs, e.g. WittKieffer) is
 * the firm that placed the person, not the client that hired them: those rows are dropped. Interim
 * seats count toward fractional friendly like any fractional seat (FRACTIONAL_TYPES in lib/tableFields.ts).
 *
 * A company size reads from the Past Companies tab's employee_range_std first (employee_range may
 * show a band Sheets turned into a date, "2/10"), then employee_range, then employee_count. A seat
 * whose Past Companies row says skipped (a placeholder, or a name too short to look up) is dropped
 * unless the company is on the seed already: no company is created from a skipped row.
 *
 * Nothing about the person is stored: no past_seat_id, profile id, location, current title or
 * company, search query, capture day, tenure, or the holder's country. The person's name is read
 * to tell their own firm from a client and to keep an About line that names a seat holder off the
 * seed, and with --names, for United States rows only, it goes on the seat as its holder.
 *
 * Rows dropped (counted by reason): no past_seat_id or the same one twice; still current
 * (is_current TRUE); an end year missing, before 2021 or after this year, or before the start year;
 * then the seat scan's own rules (scripts/seat-import.mjs): not fractional work, outside GTM and below
 * Director, the fractional's own firm (a one-person company, a stand-in like Self-employed, a
 * company named after the person), no company, a fractional firm, agency or marketplace
 * (lib/firms.ts, from the name, website or About text), and a company the file flags as a likely
 * fractional provider (company_likely_fractional_provider, provider_by_name, or the Past Companies
 * tab's likely_fractional_provider; NOT_FIRMS in lib/firms.ts overrules the flag).
 *
 * Duplicates (counted apart): a company that already has a seat with the same title whose years
 * overlap this one's (the same person may be on file as a current seat: person_also_in_current_seats),
 * and the same company, title, start and end twice in the file.
 *
 * Companies match by the current seats' company (matched_company_id's company id as a LinkedIn page,
 * or its "name:"), then the Past Companies match's LinkedIn page, then website host, then the
 * company its website names, then name, as add-seat-scan.mjs matches them. An existing company only
 * gets the fields it does not have; a new one gets the row's facts, under one of these rules only:
 *   - matched_company_id names a company on the current seats' Companies tab (its company id, or
 *     "name:" + its name): the seat row's own website, industry, size, revenue and About;
 *   - --companies, and the company's Past Companies row matched a domain (match_method
 *     "domain+name+country" or "domain+name", or a matched_domain): that row's website, LinkedIn
 *     page, industry, size, revenue and About, the owner's best guess (the sheet kept a domain match
 *     only where the country didn't conflict). HQ country (hq_country) only from "domain+name+country";
 *   - without the tab row, a matched_company_id that is a LinkedIn page (the Past Companies match
 *     itself) brings the seat row's own copy of that match's facts, as a best guess (no HQ);
 *   - otherwise (no_match, skipped, no row): the company's name only.
 * A company given facts carries a private import mark, `enrichedBy` = { by: "past seats", match:
 * the rule, fields: what it filled }, on its seed record outside its fields: never shown to members,
 * so a wrong match (two companies that share a name) can be found and undone.
 * An About line is never stored when it names one of the company's seat holders in the file.
 *
 * --names puts the holder's name on a seat only when the row's country is exactly "United States",
 * cleaned (lib/personName.ts) and marked holderFrom "public profile", unverified, as
 * add-seat-names.mjs does. A seat that has a holder keeps it. A name from public profiles on a seat
 * whose row is outside the United States comes off, and nothing is written if any such seat would
 * still carry a name.
 *
 * Prints counts. Company names (firms dropped, borderline providers) and titles only without
 * --counts-only; never a person's name.
 */
import { execFileSync, spawnSync } from "child_process";
import { createHmac } from "crypto";
import { readFileSync, writeFileSync } from "fs";

// The matching keys and rules are TypeScript (lib/), so this runs under tsx: started with plain node, it starts itself again with tsx loaded.
if (!process.env.RN_PAST_SEATS_TSX) {
  const r = spawnSync(process.execPath, ["--import", "tsx", ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, RN_PAST_SEATS_TSX: "1" } });
  process.exit(r.status ?? 1);
}
const { companyKey, textKey } = await import("../lib/scan/clean.ts");
const { siteKey, FUNCTIONS, GTM_FUNCTIONS } = await import("../lib/tableFields.ts");
const { keepsNonGtm } = await import("../lib/seniority.ts");
const { isNotFirm } = await import("../lib/firms.ts");
const { normalizeHq } = await import("../lib/geo.ts");
const { employeeBand, industryOf, revenueBand } = await import("../lib/industryMap.ts");
const { companyFirm } = await import("../lib/firmRemoval.ts");
const {
  FUNCTION_MAP, aboutNamesHolder, cleanKeeping, cleanUrl, companyIndex, companyName, host, hqCountry, inCa, inUs, isTrue, linkedinKey, nameSeat, newCompanyId, notFractional,
  outsideUsNames, ownFirm, parseCsv, personKey, real, seedKey, seniorTitle, staffingFirm,
} = await import("./seat-import.mjs");

/* ---------- arguments ---------- */

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const seedPath = flag("--seed") ?? "data/intel-seed.json";
const companiesPath = flag("--companies");
const BOOLEANS = ["--no-seal", "--dry-run", "--counts-only", "--names", "--interim"];
const noSeal = args.includes("--no-seal");
const dryRun = args.includes("--dry-run");
/** Print counts only: no company name or title (the file names real people and their clients). */
const countsOnly = args.includes("--counts-only");
const withNames = args.includes("--names");
/** The Interim Seats tab: interim_seat_id, type Interim, "e_is_" ids, staffing firms dropped. */
const interim = args.includes("--interim");
const ID_COL = interim ? "interim_seat_id" : "past_seat_id";
const ID_PREFIX = interim ? "e_is_" : "e_ps_";
const SEAT_TYPE = interim ? "Interim" : "Fractional";
/** The row's stable id (past_seat_id, or interim_seat_id with --interim). */
const sidOf = (r) => String(r[ID_COL] ?? "").trim();
const csvPath = args.filter((a) => !BOOLEANS.includes(a))[0];
if (!csvPath || args.some((a) => a.startsWith("--") && !BOOLEANS.includes(a))) {
  console.error("Usage: node scripts/add-past-seats.mjs <past-seats.csv> [--interim] [--companies <past-companies.csv>] [--dry-run] [--counts-only] [--seed <path> --no-seal] [--names]");
  process.exit(1);
}

/* ---------- keys, years ---------- */

const seatKey = seedKey("Seats are keyed by an HMAC under it.");
/** The seat's id: a one-way HMAC of the file's past_seat_id, so no profile id reaches the seed. */
const pastId = (id) => `${ID_PREFIX}${createHmac("sha256", seatKey).update(`${interim ? "interim-seat" : "past-seat"}:${id}`).digest("hex").slice(0, 20)}`;
/** The earliest end year kept (the file holds roles that ended in 2021 or later). */
const FIRST_END = 2021;
const THIS_YEAR = new Date().getUTCFullYear();
/** A year cell ("2023", or "2023.0" from a spreadsheet), or null. */
const yearOf = (v) => {
  const m = /^(\d{4})(?:\.0+)?$/.exec(String(v ?? "").trim());
  return m ? Number(m[1]) : null;
};
/** A standard size band ("2-10", "1001-5000", "10001+") from employee_range_std, or null when the cell holds anything else. */
const STD_BANDS = new Set(["1", "2-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"]);
const stdBand = (v) => {
  const t = real(v).replace(/[,\s]/g, "").replace(/[–—]/g, "-");
  return STD_BANDS.has(t) ? employeeBand(t) : null;
};
/** The year a seat's start or end month is in ("2025-03" and "2025" are 2025), or null. */
const yearIn = (v) => {
  const m = /^(\d{4})(?:-\d{2})?$/.exec(String(v ?? "").trim());
  return m ? Number(m[1]) : null;
};

/* ---------- the files ---------- */

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const rows = parseCsv(readFileSync(csvPath, "utf8"));
if (rows.length && !(ID_COL in rows[0])) {
  console.error(`The file has no ${ID_COL} column.${interim ? "" : " For the Interim Seats tab, add --interim."}`);
  process.exit(1);
}

/** Past Companies rows by name and the example person's country, and by name alone (the first one). */
const tabByNameCountry = new Map();
const tabByName = new Map();
let tabRows = 0;
if (companiesPath) {
  for (const c of parseCsv(readFileSync(companiesPath, "utf8"))) {
    const k = textKey(c.company_name ?? "");
    if (!k) continue;
    tabRows++;
    const kc = `${k}|${String(c.country ?? "").trim().toLowerCase()}`;
    if (!tabByNameCountry.has(kc)) tabByNameCountry.set(kc, c);
    if (!tabByName.has(k)) tabByName.set(k, c);
  }
}
const tabOf = (r) => {
  if (!companiesPath) return null;
  const k = textKey(r.company_name ?? "");
  return tabByNameCountry.get(`${k}|${String(r.country ?? "").trim().toLowerCase()}`) ?? tabByName.get(k) ?? null;
};
/** The match the Past Companies row was made by ("domain+name+country", "domain+name", "no_match", "skipped"). */
const methodOf = (tab) => real(tab?.match_method).toLowerCase().replace(/\s*\(guess \d+\)$/, "");
const TRUSTED_METHOD = "domain+name+country";
/**
 * A Past Companies row whose facts this run attaches, as the owner's best guess: one the sheet
 * matched to a domain ("domain+name+country", "domain+name", or a matched_domain with another
 * method), not "no_match" or "skipped". The sheet kept a domain match only where the country didn't
 * conflict. HQ country comes only from "domain+name+country".
 */
const usableTab = (tab) => {
  const m = methodOf(tab);
  if (!tab || m === "no_match" || m === "skipped") return false;
  return m.startsWith("domain+") || !!host(real(tab.matched_domain));
};
/** The private import mark on a company this run gave facts to (SeedCompany.enrichedBy): never shown to members, so a wrong match can be found and undone. */
const markEnriched = (c, rule, keys) => {
  if (!keys.length) return;
  const was = c.enrichedBy?.by === "past seats" && c.enrichedBy.match === rule ? c.enrichedBy.fields : [];
  // A company marked by another rule keeps its first mark and gains the fields under this one.
  if (c.enrichedBy && c.enrichedBy.match !== rule) c.enrichedBy = { ...c.enrichedBy, fields: [...new Set([...c.enrichedBy.fields, ...keys])], also: [...new Set([...(c.enrichedBy.also ?? []), rule])] };
  else c.enrichedBy = { by: "past seats", match: rule, fields: [...new Set([...was, ...keys])] };
};

/** Seat holders' names in the file by company (and Past Companies' example person), for the About check only (never stored or printed). */
const holderKey = (r) => (real(r.matched_company_id) ? `id:${real(r.matched_company_id).toLowerCase()}` : `name:${textKey(r.company_name ?? "")}`);
const holdersAt = new Map();
const holdersOf = (k) => {
  if (!holdersAt.has(k)) holdersAt.set(k, []);
  return holdersAt.get(k);
};
for (const r of rows) {
  holdersOf(holderKey(r)).push(String(r.person_name ?? ""));
  // The same company may be keyed by its LinkedIn page on one row and by name on another.
  holdersOf(`name:${textKey(r.company_name ?? "")}`).push(String(r.person_name ?? ""));
  const tab = tabOf(r);
  if (tab?.example_person) holdersOf(holderKey(r)).push(String(tab.example_person));
}
const namesHolder = (about, r) => aboutNamesHolder(about, [...new Set([...(holdersAt.get(holderKey(r)) ?? []), ...(holdersAt.get(`name:${textKey(r.company_name ?? "")}`) ?? [])])]);

/* ---------- the seed as it is ---------- */

const ids = new Set(seed.companies.map((c) => c.id));
const { bySite, byName, byLinkedin, index, domainOwner } = companyIndex(seed.companies);
const companyById = new Map(seed.companies.map((c) => [c.id, c]));
const removedNames = new Set((seed.removedFirms?.companies ?? []).map((c) => companyKey(c.name)).filter(Boolean));
const removedEngs = new Set((seed.removedFirms?.engagements ?? []).map((e) => e.id));
const engById = new Map(seed.engagements.map((e) => [e.id, e]));
/** Seats on file before this run by company and title, with the years each covers: a past seat whose years overlap one is the same seat. */
const titleKey = (companyId, role) => `${companyId}|${textKey(role)}`;
const yearsOnFile = new Map();
for (const e of seed.engagements) {
  if (!e.fields.role || !textKey(e.fields.role)) continue;
  const from = yearIn(e.fields.start) ?? -Infinity;
  // Ongoing, or no end on file: the seat runs on.
  const to = yearIn(e.fields.end) ?? Infinity;
  const k = titleKey(e.companyId, e.fields.role);
  if (!yearsOnFile.has(k)) yearsOnFile.set(k, []);
  yearsOnFile.get(k).push({ from, to });
}
/** The same company, title, start and end twice in this file. */
const thisRun = new Set();

/* ---------- counts ---------- */

const dropped = {};
const drop = (why) => (dropped[why] = (dropped[why] ?? 0) + 1);
const count = (bag, k) => (bag[k || "(blank)"] = (bag[k || "(blank)"] ?? 0) + 1);
const top = (bag, n = 99) => Object.entries(bag).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(", ");
const seen = new Set();
/** Each past_seat_id's first row: the one this run reads (a later row with the same id is dropped, and says nothing about the seat). */
const firstRows = [];
let added = 0;
let onSeed = 0;
let dupOnFile = 0;
let dupOnFileCurrent = 0;
let dupInFile = 0;
let alsoCurrent = 0;
let alsoCurrentKept = 0;
const matched = new Set();
const created = new Set();
const matchedBy = {};
const fnCount = {};
const endCount = {};
const countryCount = {};
const juniorTitles = {};
/** Companies that got facts, by the rule that gave them (created or on file), and companies created by name only. */
/** A Past Companies match read from the seat row alone (matched_company_id is its LinkedIn page; no --companies). */
const SEAT_ROW_MATCH = "Past Companies match (seat row)";
const enrichedBy = { matched_company_id: new Set(), [TRUSTED_METHOD]: new Set(), "domain+name": new Set(), [SEAT_ROW_MATCH]: new Set() };
const nameOnly = new Set();
/** The Past Companies match_method of the row each name-only company came from, and of each seat added. */
const nameOnlyMethod = new Map();
const methodCount = {};
let tabFound = 0;
let tabMissing = 0;
let filledOnExisting = 0;
const filledCompanies = new Set();
const aboutSkipped = new Set();
const aboutHint = new Map();
const firmNames = new Map();
const flagged = new Map();
const providerCompanies = new Set();
/** The rows of the seats this run keeps (added or on file), for --names and the person key, and the ids of the seats it adds. */
const keptRows = [];
const newSeats = new Set();

for (const r of rows) {
  count(countryCount, String(r.country ?? "").trim());
  const psid = sidOf(r);
  if (!psid) {
    drop(interim ? "no interim seat id" : "no past seat id");
    continue;
  }
  if (seen.has(psid)) {
    drop(interim ? "same interim seat id twice in the file" : "same past seat id twice in the file");
    continue;
  }
  seen.add(psid);
  firstRows.push(r);
  const engId = pastId(psid);
  // A re-run: the seat is on the seed already and stays as it is (its company, fields and any holder).
  if (engById.has(engId)) {
    onSeed++;
    keptRows.push({ r, e: engById.get(engId) });
    continue;
  }
  if (removedEngs.has(engId)) {
    drop("fractional firm the seed already removed");
    continue;
  }
  if (isTrue(r.is_current)) {
    drop("still current (is_current)");
    continue;
  }
  const nf = notFractional(r);
  if (nf) {
    drop(nf);
    continue;
  }
  const start = yearOf(r.start_year);
  const end = yearOf(r.end_year);
  if (end === null) {
    drop("no end year");
    continue;
  }
  if (end < FIRST_END) {
    drop(`ended before ${FIRST_END}`);
    continue;
  }
  if (end > THIS_YEAR) {
    drop("end year after this year");
    continue;
  }
  if (start !== null && start > end) {
    drop("ends before it starts");
    continue;
  }
  const company = companyName(r.company_name);
  if (!company || !companyKey(company)) {
    drop("no company");
    continue;
  }
  const tab = tabOf(r);
  if (companiesPath) tab ? tabFound++ : tabMissing++;
  const method = tab ? methodOf(tab) || "(blank)" : companiesPath ? "(no Past Companies row)" : "(no --companies)";
  // matched_company_id: a company on the current seats' Companies tab (its company id, digits, or
  // "name:" + its name), or a LinkedIn company page, which is the Past Companies match itself.
  const mcid = real(r.matched_company_id);
  const pcLink = /linkedin\.com\/company\//i.test(mcid) ? mcid : "";
  const viaCurrent = mcid && !pcLink ? mcid : "";
  const curLi = /^\d+$/.test(viaCurrent) ? viaCurrent : null;
  const curName = /^name:/i.test(viaCurrent) ? viaCurrent.slice(5).trim() : null;
  const trustedTab = !!tab && methodOf(tab) === TRUSTED_METHOD;
  const guessTab = usableTab(tab);
  // The fractional's own firm: the row's own size, or a trusted match's.
  const why = ownFirm({ ...r, company_employee_range: real(r.company_employee_range) || (guessTab ? real(tab.employee_range) : "") });
  if (why) {
    drop(why);
    continue;
  }
  // An interim title at a search, staffing or interim placement firm: the firm placed them, it didn't hire them.
  if (interim && staffingFirm(company)) {
    drop("executive search or staffing firm (staffingFirm)");
    continue;
  }
  const fn = FUNCTION_MAP[String(r.function ?? "").trim()] ?? FUNCTION_MAP[String(r.role_category ?? "").trim()] ?? null;
  if (fn && !FUNCTIONS.includes(fn)) throw new Error(`function ${fn} is not in FUNCTIONS`);
  if ((!GTM_FUNCTIONS.includes(fn) && !seniorTitle(r.seat_title)) || !keepsNonGtm(r.seat_title, fn)) {
    drop("outside GTM and below Director");
    count(juniorTitles, String(r.seat_title ?? "").trim().replace(/\s+/g, " "));
    continue;
  }

  // What the row may say about the company, by the enrichment rule (the file header).
  // A Past Companies match the tab doesn't give (no --companies): the seat row carries its facts, as a best guess too.
  const rule = viaCurrent ? "matched_company_id" : guessTab ? (methodOf(tab) === TRUSTED_METHOD ? TRUSTED_METHOD : "domain+name") : pcLink ? SEAT_ROW_MATCH : null;
  const fromTab = guessTab ? tab : null;
  const fromRow = viaCurrent || pcLink ? r : null;
  const site = host(real(fromTab?.website)) ?? host(real(fromTab?.website_url)) ?? host(real(fromTab?.matched_domain)) ?? host(fromRow?.company_website);
  const liRaw = curLi ? `linkedin.com/company/${curLi}` : real(fromTab?.linkedin_url) || pcLink;
  const li = /linkedin\.com\/company\//i.test(liRaw ?? "") ? cleanUrl(liRaw) : null;
  const trustedAbout = (real(fromTab?.company_about) || real(fromRow?.company_about)).replace(/\s+/g, " ");
  const want = {
    website: site,
    linkedin: li,
    industry: industryOf(real(fromTab?.industry) || real(fromRow?.company_industry), company),
    // employee_range_std first: employee_range may hold a band Sheets read as a date ("2/10" for 2-10).
    employees: fromTab
      ? stdBand(fromTab.employee_range_std) ?? employeeBand(real(fromTab.employee_range)) ?? employeeBand(real(fromTab.employee_count)) ?? employeeBand(real(fromRow?.company_employee_range))
      : employeeBand(real(fromRow?.company_employee_range)),
    revenue: revenueBand(real(fromTab?.rn_revenue_bucket) || real(fromRow?.company_rn_revenue_bucket)),
    // HQ country only when the match carries the country.
    hq: fromTab && trustedTab ? hqCountry(fromTab.hq_country) ?? normalizeHq(real(fromTab.hq_country)).country ?? null : null,
    about: null,
  };
  if (trustedAbout) {
    if (namesHolder(trustedAbout, r)) aboutSkipped.add(company);
    else want.about = trustedAbout.slice(0, 200);
  }

  // The company on file: its LinkedIn page, then website, then the company its website names, then name.
  let c;
  let how = "";
  const lkTab = (fromTab ? linkedinKey(fromTab.linkedin_url) : null) ?? linkedinKey(pcLink);
  if (curLi && byLinkedin.get(curLi)) (c = byLinkedin.get(curLi)), (how = "LinkedIn page (matched_company_id)");
  if (!c && curName && byName.get(companyKey(curName))) (c = byName.get(companyKey(curName))), (how = "name (matched_company_id)");
  if (!c && lkTab && byLinkedin.get(lkTab)) (c = byLinkedin.get(lkTab)), (how = "LinkedIn page (Past Companies)");
  if (!c && site && bySite.get(siteKey(site))) (c = bySite.get(siteKey(site))), (how = "website");
  if (!c && domainOwner(site, company)) (c = domainOwner(site, company)), (how = "the company its website names");
  if (!c && byName.get(companyKey(company))) (c = byName.get(companyKey(company))), (how = "name");
  // A placeholder or a name too short to look up (the tab says skipped): never a new company.
  if (!c && methodOf(tab) === "skipped") {
    drop("placeholder or too-short name (Past Companies says skipped)");
    continue;
  }
  if (!c && removedNames.has(companyKey(company))) {
    drop("fractional firm the seed already removed");
    continue;
  }

  // Firms, agencies and marketplaces are not clients (lib/firms.ts). Any About or website the row
  // has is read for this (never stored unless trusted): a firm kept as a client is worse than a seat left out.
  const checkAbout = trustedAbout || real(r.company_about) || real(tab?.company_about) || null;
  const checkSite = site || host(r.company_website) || host(real(tab?.website)) || null;
  const firm = companyFirm(c?.fields.name ?? company, checkAbout, c?.fields.website || checkSite) ?? (c ? companyFirm(company, checkAbout, checkSite) : null);
  if (firm) {
    drop("fractional firm, agency or marketplace (lib/firms.ts)");
    // One already on file goes in the cleanup below, with what a trusted match says about it.
    if (c && trustedAbout) aboutHint.set(c.id, trustedAbout);
    if (!c) firmNames.set(company, firm);
    continue;
  }
  if ((isTrue(r.company_likely_fractional_provider) || isTrue(r.provider_by_name) || isTrue(tab?.likely_fractional_provider)) && !isNotFirm(c?.fields.name ?? company)) {
    drop("likely fractional provider (the file's flag)");
    providerCompanies.add(c?.id ?? `new:${companyKey(company)}`);
    continue;
  }

  const role = String(r.seat_title ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const also = isTrue(r.person_also_in_current_seats);
  if (also) alsoCurrent++;
  // The same seat on file already: the same title at the company, and the years overlap.
  if (c && role) {
    const from = start ?? end;
    const hit = (yearsOnFile.get(titleKey(c.id, role)) ?? []).some((y) => from <= y.to && end >= y.from);
    if (hit) {
      dupOnFile++;
      if (also) dupOnFileCurrent++;
      continue;
    }
  }
  // The same company, title, start and end as a row this run kept already.
  const twin = c ? `${c.id}|${textKey(role)}|${start ?? ""}|${end}` : null;
  if (twin && thisRun.has(twin)) {
    dupInFile++;
    continue;
  }

  if (c) {
    if (!created.has(c.id)) {
      matched.add(c.id);
      count(matchedBy, how);
    }
    // Never overwrite: an existing company only gets the fields it does not have.
    const filled = [];
    for (const [k, v] of Object.entries(want)) {
      if (v && !c.fields[k]) {
        c.fields[k] = v;
        filled.push(k);
        if (!created.has(c.id)) filledOnExisting++, filledCompanies.add(c.id);
        if (rule) enrichedBy[rule].add(c.id), nameOnly.delete(c.id);
      }
    }
    if (rule) markEnriched(c, rule, filled);
    const lk = linkedinKey(li);
    if (lk && !byLinkedin.has(lk)) byLinkedin.set(lk, c);
  } else {
    const id = newCompanyId(company, ids);
    const facts = Object.fromEntries(Object.entries(want).filter(([, v]) => v));
    c = { id, fields: { name: company, ...facts } };
    seed.companies.push(c);
    companyById.set(id, c);
    created.add(id);
    index(c);
    if (rule && Object.keys(facts).length) enrichedBy[rule].add(id), markEnriched(c, rule, Object.keys(facts));
    else nameOnly.add(id), nameOnlyMethod.set(id, method);
  }
  if (trustedAbout && !aboutHint.has(c.id)) aboutHint.set(c.id, trustedAbout);
  if (isTrue(fromTab?.likely_fractional_provider) || isTrue(fromRow?.company_likely_fractional_provider)) flagged.set(c.id, c.fields.name ?? company);

  // The seat. Years alone: the file has no months.
  const fields = { source: "Seat scan", role, type: SEAT_TYPE, status: "Ended", end: String(end) };
  if (!fields.role) delete fields.role;
  if (start !== null) fields.start = String(start);
  if (fn) fields.function = fn;
  thisRun.add(`${c.id}|${textKey(role)}|${start ?? ""}|${end}`);
  // No addedAt: an ended seat is no new hire (the file header).
  const e = { id: engId, companyId: c.id, fields, verified: false };
  seed.engagements.push(e);
  engById.set(engId, e);
  added++;
  newSeats.add(engId);
  if (also) alsoCurrentKept++;
  keptRows.push({ r, e });
  if (fn) count(fnCount, fn);
  count(endCount, String(end));
  count(methodCount, method);
}

/* ---------- the holder's person key ---------- */

// The one-way person key (seat-import.mjs personKey) on each kept seat, new or on file, so one
// fractional's seats can be grouped. A seat that has one keeps it; nothing else about the seat changes.
const keys = { addedNew: 0, addedOnFile: 0, had: 0, differs: 0, noId: 0 };
for (const { r, e } of keptRows) {
  const k = personKey(seatKey, r.person_sales_nav_id);
  if (!k) keys.noId++;
  else if (!e.holderKey) {
    e.holderKey = k;
    if (newSeats.has(e.id)) keys.addedNew++;
    else keys.addedOnFile++;
  } else if (e.holderKey === k) keys.had++;
  else keys.differs++;
}

/* ---------- names: United States only ---------- */

const names = { us: 0, ca: 0, named: 0, kept: 0, skipped: {} };
if (withNames) {
  for (const { r, e } of keptRows) {
    if (!inUs(r)) continue;
    names.us++;
    // The California rule (lib/california.ts): never named, by the person's own location.
    if (inCa(r)) {
      names.ca++;
      continue;
    }
    const put = nameSeat(e, r.person_name);
    if (put.kept) names.kept++;
    else if (put.skip) names.skipped[put.skip] = (names.skipped[put.skip] ?? 0) + 1;
    else names.named++;
  }
}
// Whatever the flag: a name from public profiles on a seat whose row is outside the United States,
// or in California, comes off, and nothing is written if any such seat would still carry a name.
const seatOfRow = (r) => {
  const psid = sidOf(r);
  return psid ? engById.get(pastId(psid)) : undefined;
};
const { takenOff, namedOutsideUs } = outsideUsNames(firstRows, seatOfRow, (e) => e.id.startsWith(ID_PREFIX));
if (namedOutsideUs) {
  console.error(`${namedOutsideUs} seats outside the United States or in California would carry a name. Nothing was written.`);
  process.exit(1);
}

/* ---------- the cleanup, and write ---------- */

const { cleaned, stdKept } = cleanKeeping(seed, created, aboutHint);
if (!dryRun) writeFileSync(seedPath, JSON.stringify(seed, null, 1));

/* ---------- what happened ---------- */

const left = new Set(seed.companies.map((c) => c.id));
const engsAt = new Map();
for (const e of seed.engagements) engsAt.set(e.companyId, [...(engsAt.get(e.companyId) ?? []), e]);
const allEnded = (id) => (engsAt.get(id) ?? []).length > 0 && engsAt.get(id).every((e) => e.fields.status === "Ended");
const newOnlyEnded = [...created].filter((id) => left.has(id) && allEnded(id)).length;
const seedOnlyEnded = seed.companies.filter((c) => allEnded(c.id)).length;
const n = (set) => [...set].filter((id) => left.has(id)).length;
const pastOnSeed = seed.engagements.filter((e) => e.id.startsWith(ID_PREFIX)).length;
// The table's count for the unverified-names switch (lib/table.ts seatCount): seats, not open roles or postings nobody took.
const tableSeats = seed.engagements.filter((e) => e.fields.status !== "Open role" && !(e.fields.source === "Demand scan" && !e.fields.operator)).length;
const namesUntil = Number.parseInt(process.env.RN_UNVERIFIED_NAMES_UNTIL ?? "", 10) > 0 ? Number.parseInt(process.env.RN_UNVERIFIED_NAMES_UNTIL, 10) : 10_000;
const named = (x) => (x.reason === "named after its seat holder" ? "(named after its seat holder)" : x.name);

console.log(`${dryRun ? "DRY RUN, nothing written. " : ""}rows read: ${rows.length}`);
console.log(`kept: ${added + onSeed} (seats added: ${added}; on the seed from an earlier run, unchanged: ${onSeed}, apart from a missing person key)`);
for (const [why, k] of Object.entries(dropped).sort((a, b) => b[1] - a[1])) console.log(`dropped (${why}): ${k}`);
console.log(`duplicates: ${dupOnFile + dupInFile} (same company and title as a seat on file, years overlap: ${dupOnFile}, ${dupOnFileCurrent} of them say the person is also in current seats; the same seat twice in this file: ${dupInFile})`);
console.log(`rows that say the person is also in current seats: ${alsoCurrent} past the filters (${dupOnFileCurrent} were duplicates, ${alsoCurrentKept} added as their own seat)`);
console.log(`companies matched: ${matched.size} (${filledOnExisting} empty fields filled on ${filledCompanies.size} of them; by ${top(matchedBy) || "nothing"})`);
console.log(`companies created: ${created.size}`);
const nameOnlyBy = {};
for (const id of nameOnly) if (left.has(id)) count(nameOnlyBy, nameOnlyMethod.get(id));
console.log(`enrichment (companies given facts): by matched_company_id ${n(enrichedBy.matched_company_id)}, by ${TRUSTED_METHOD} ${n(enrichedBy[TRUSTED_METHOD])}, by domain+name (best guess) ${n(enrichedBy["domain+name"])}, by the seat row's Past Companies match ${n(enrichedBy[SEAT_ROW_MATCH])}; with a website ${n(new Set([...enrichedBy.matched_company_id, ...enrichedBy[TRUSTED_METHOD], ...enrichedBy["domain+name"], ...enrichedBy[SEAT_ROW_MATCH]].filter((id) => companyById.get(id)?.fields.website)))} of them; created by name only ${n(nameOnly)} (their match: ${top(nameOnlyBy) || "none"})`);
console.log(`seats added by Past Companies match: ${top(methodCount) || "none"}`);
if (companiesPath) console.log(`Past Companies: ${tabRows} rows; found for ${tabFound} seat rows past the year checks, missing for ${tabMissing}`);
console.log(`About lines left out (they name a seat holder): ${aboutSkipped.size}`);
console.log(`values on companies on file the cleanup would have re-read, kept as they were: ${stdKept}`);
console.log(`new companies whose only seat is an ended one: ${newOnlyEnded}; companies on the seed whose every seat ended: ${seedOnlyEnded}`);
console.log(`by function (seats added): ${top(fnCount) || "none"}`);
console.log(`by end year (seats added): ${Object.entries(endCount).sort().map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
console.log(`outside GTM and below Director, ${countsOnly ? `${Object.keys(juniorTitles).length} distinct titles` : `top 15 titles: ${top(juniorTitles, 15)}`}`);
console.log(`seat holders' countries (counted, never stored), top 10: ${top(countryCount, 10)}`);
if (withNames) {
  const sk = Object.values(names.skipped).reduce((a, b) => a + b, 0);
  console.log(`names: United States seats ${names.us}; in California (their own location), never named: ${names.ca}; named now: ${names.named}; already had a seat holder (kept): ${names.kept}; skipped, the name doesn't read as a first and last name: ${sk}`);
  for (const [why, k] of Object.entries(names.skipped).sort((a, b) => b[1] - a[1])) console.log(`  skipped (${why}): ${k}`);
} else console.log("names: none stored (run with --names for United States seats)");
console.log(`rows outside the United States: ${firstRows.filter((r) => !inUs(r)).length}; names taken off them and California's: ${takenOff}; named seats outside the United States or in California: ${namedOutsideUs}`);
console.log(`likely fractional providers (the file's flag), seats dropped: ${dropped["likely fractional provider (the file's flag)"] ?? 0} at ${providerCompanies.size} companies`);
console.log(`new firms dropped at import: ${firmNames.size}${countsOnly ? "" : firmNames.size ? `: ${[...firmNames].map(([nm, w]) => `${nm} (${w})`).sort().join(" | ")}` : ""}`);
console.log(`firms the cleanup removed: ${cleaned.removed.companies} companies, ${cleaned.removed.seats} seats (${cleaned.kept.length} kept for admin review)`);
if (cleaned.removed.names.length) {
  if (countsOnly) console.log(`  removed, by reason: ${top(cleaned.removed.reasons)}`);
  else console.log(`  removed: ${cleaned.removed.names.map((x) => `${named(x)} (${x.reason})`).join(" | ")}`);
}
const borderline = [...flagged].filter(([id]) => left.has(id)).map(([, nm]) => nm).sort();
console.log(`borderline (the file calls it a likely fractional provider, the rules keep it as a client): ${borderline.length}${countsOnly || !borderline.length ? "" : `: ${borderline.join(" | ")}`}`);
// People by their one-way key: past seats that join a person who already holds a current seat on the seed (scripts/add-seat-scan.mjs --backfill-holder-keys keys those).
const currentKeys = new Set(seed.engagements.filter((e) => e.holderKey && !e.id.startsWith("e_ps_") && !e.id.startsWith("e_is_")).map((e) => e.holderKey));
const pastKeyed = seed.engagements.filter((e) => e.holderKey && e.id.startsWith(ID_PREFIX));
const pastPeople = new Set(pastKeyed.map((e) => e.holderKey));
const seatsOf = new Map();
for (const e of seed.engagements) if (e.holderKey) seatsOf.set(e.holderKey, (seatsOf.get(e.holderKey) ?? 0) + 1);
console.log(
  `person keys: ${keys.addedNew} on seats added, ${keys.addedOnFile} added to seats on file, ${keys.had} already there, ${keys.differs} on file under another key (kept), ${keys.noId} rows with no person id`,
);
console.log(
  `people: ${pastKeyed.length} ended seats keyed, ${pastPeople.size} distinct people; ${pastKeyed.filter((e) => currentKeys.has(e.holderKey)).length} ended seats (${[...pastPeople].filter((k) => currentKeys.has(k)).length} people) join a person with a current seat (${currentKeys.size} people keyed on current seats); people with 2+ seats on the seed: ${[...seatsOf.values()].filter((x) => x >= 2).length}`,
);
console.log(`seed now: ${seed.companies.length} companies, ${seed.engagements.length} seats (${pastOnSeed} ended seats from ${interim ? "interim" : "past"} seats)`);
// Companies the website finder (lib/websites, RN_WEBSITES) reads next: new ones with no website (it skips placeholders, firms and a person's own practice); the About job (lib/about) reads each site it finds.
console.log(`new companies with no website (the website finder's queue, then About): ${[...created].filter((id) => left.has(id) && !companyById.get(id)?.fields.website).length} of ${n(created)}`);
console.log(
  `seats for the unverified-names switch: ${tableSeats} on the seed${tableSeats >= namesUntil ? `, at or over ${namesUntil.toLocaleString("en-US")} (RN_UNVERIFIED_NAMES_UNTIL): names from public profiles stop showing until it is raised` : `, under ${namesUntil.toLocaleString("en-US")} (RN_UNVERIFIED_NAMES_UNTIL)`}`,
);
if (!dryRun && !noSeal && seedPath === "data/intel-seed.json") execFileSync(process.execPath, ["scripts/seal-intel-seed.mjs"], { stdio: "inherit" });
