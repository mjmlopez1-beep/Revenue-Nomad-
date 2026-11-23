#!/usr/bin/env node
/**
 * Link each named United States seat holder to their own firm, so the own-sites job (lib/ownsites)
 * can read the email address they publish on its website. Writes a private section of the seed,
 * data/intel-seed.json, then re-seals data/intel-seed.enc:
 *
 *   seed.ownSites = { [holderKey]: { site?: "theirfirm.com", firm?: "Their Firm LLC", how } }
 *   seed.ownSiteProspects = { [personKey]: { name, site, firm?, how: "known site" } }
 *
 *   node scripts/add-own-sites.mjs --seats <seats.csv> --past <past-seats.csv> [--companies <past-companies.csv>]
 *   ... --counts-only     print the counts and seal
 *   ... --dry             print the counts, write nothing
 *   ... --seed <intel-seed.json> --no-seal   (tests, a copy)
 *
 * The files: the current seats (Seats tab: person_name, person_sales_nav_id, company_name,
 * company_website, company_employee_range, company_likely_fractional_provider, country,
 * person_location), the past seats (Past Seats tab: the same, plus person_current_title and
 * person_current_company) and, optionally, the Past Companies tab (company_name, website,
 * matched_domain), for the website of a past own-firm row that has none.
 *
 * Who: people whose row says country "United States", and not in California (person_location reads
 * as California: the state, or one of its metro areas and cities). California is held back until a
 * lawyer answers. The location is read here as a yes or no only and never stored.
 *
 * The person key: holderKey = "p_" + the first 20 hex of HMAC-SHA256(seed key, "person:" +
 * person_sales_nav_id), the same function as add-seat-scan.mjs and add-past-seats.mjs
 * (scripts/seat-import.mjs personKey). Only people whose key is on a named seat in the seed are
 * written (the seat holders names show for). No Sales Navigator id is stored or printed.
 *
 * Their own firm, in this order:
 *  1. how "known site": a row the importers drop as the person's own firm (seat-import.mjs ownFirm:
 *     a one-person company or a company named after the person; or a likely fractional provider,
 *     a fractional firm or practice by lib/firms.ts, of at most 10 people) that has a website.
 *     A company named after them first, then a one-person company, then the rest; current seats
 *     before past ones. Never a shared host (LinkedIn, a site builder, a directory).
 *  2. how "current company": their current company from the past seats file, when their current
 *     title says founder, owner, principal, fractional, consultant, advisor or CEO, the name is not
 *     a stand-in (self-employed, stealth, freelance, confidential, independent) and it is not a
 *     client company already in the seed (or a client row in the files). The firm's name, and the
 *     site the files give for a firm by that name when they give one; else the job finds its site.
 *
 * Prospects (outreach only): United States people outside California with no named seat on the
 * seed (their only seats were their own firm, which the importers drop) and an own-firm row with a
 * website (rule 1). Keyed by the same person key (never a profile id), with their name, cleaned
 * (lib/personName.ts): it is needed to match their email and to greet them. They have no seat to
 * claim and never show in the app: lib/ownsites reads their site, and only the admin's sample and
 * the outreach file's "join" list (scripts/claim-outreach.mjs) carry them.
 *
 * Prints counts only, never a name, a company, a domain or an email.
 */
import { execFileSync, spawnSync } from "child_process";
import { readFileSync, realpathSync, renameSync, writeFileSync } from "fs";

// The rules are TypeScript (lib/), so this runs under tsx: started with plain node, it starts itself again with tsx loaded.
if (!process.env.RN_OWN_SITES_TSX) {
  const r = spawnSync(process.execPath, ["--import", "tsx", ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, RN_OWN_SITES_TSX: "1" } });
  process.exit(r.status ?? 1);
}
const { companyKey, isPlaceholderCompany } = await import("../lib/scan/clean.ts");
const { companyFirm } = await import("../lib/firmRemoval.ts");
const { isDirectoryHost } = await import("../lib/websites/verify.ts");
// The California rule, one everywhere (lib/california.ts): the person's own location.
const { californian } = await import("../lib/california.ts");
const { host, isTrue, ownFirm, parseCsv, personKey, real, seedKey } = await import("./seat-import.mjs");
const { cleanPersonName } = await import("../lib/personName.ts");

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
const seatsPath = flag("--seats");
const pastPath = flag("--past");
const companiesPath = flag("--companies");
const BOOLEANS = ["--no-seal", "--dry", "--counts-only"];
const noSeal = args.includes("--no-seal");
const dry = args.includes("--dry");
if ((!seatsPath && !pastPath) || args.some((a) => !BOOLEANS.includes(a))) {
  console.error("Usage: node scripts/add-own-sites.mjs --seats <seats.csv> --past <past-seats.csv> [--companies <past-companies.csv>] [--counts-only | --dry] [--seed <path> --no-seal]");
  process.exit(1);
}

/* ---------- the rules ---------- */

const key = seedKey("People are keyed by an HMAC under it.");
const inUs = (r) => String(r.country ?? "").trim() === "United States";
/** Employee ranges of at most 10 people ("1", "2-10", "1-10"), or none on file. */
const SMALL = /^\s*(|0|1|0\s*[-–]\s*1|1\s*[-–]\s*10|2\s*[-–]\s*10|self[\s-]?employed)\s*$/i;
/** The site a row names, when it is one of the firm's own (never a shared host or a directory). */
const ownHost = (u) => {
  const h = host(u);
  return h && !isDirectoryHost(h) ? h : null;
};
/** How strongly a row reads as the person's own firm: 3 named after them, 2 a one-person company, 1 a small firm or provider, 0 not theirs. */
function ownRank(r) {
  const why = ownFirm({ ...r, company_name: String(r.company_name ?? "") });
  if (why === "company named after the person") return 3;
  if (why === "one-person company") return 2;
  if (why) return 0; // a stand-in name: no firm to read
  const name = String(r.company_name ?? "").trim();
  if (!name || isPlaceholderCompany(name)) return 0;
  const firm = companyFirm(name, real(r.company_about) || null, r.company_website || null);
  const provider = isTrue(r.company_likely_fractional_provider) || isTrue(r.provider_by_name);
  if (!provider && (!firm || firm === "placeholder name")) return 0;
  // A small firm (at most 10 people, or no size on file) reads as theirs before a larger one they work at.
  return SMALL.test(String(r.company_employee_range ?? "")) ? 1.5 : 1;
}
/** A current title that reads as running their own firm. */
const OWNER_TITLE = /\b(founder|co[- ]?founder|owner|principal|fractional|consultant|consulting|advisor|adviser|ceo|chief executive)\b/i;

/* ---------- the files ---------- */

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
/** Person keys on seats that carry a name (only United States seats do). */
const named = new Set(seed.engagements.filter((e) => e.holderKey && e.fields?.operator).map((e) => e.holderKey));
/** Client companies on the seed, by name. */
const clients = new Set(seed.companies.map((c) => companyKey(c.fields?.name ?? "")).filter(Boolean));

const seatRows = seatsPath ? parseCsv(readFileSync(seatsPath, "utf8")) : [];
const pastRows = pastPath ? parseCsv(readFileSync(pastPath, "utf8")) : [];
/** Past Companies' websites by name (the first one each). */
const tabSite = new Map();
if (companiesPath)
  for (const c of parseCsv(readFileSync(companiesPath, "utf8"))) {
    const k = companyKey(c.company_name ?? "");
    const h = ownHost(real(c.website)) ?? ownHost(real(c.website_url)) ?? ownHost(real(c.matched_domain));
    if (k && h && !tabSite.has(k)) tabSite.set(k, h);
  }

/** Each person by their profile id: their rows (current first), whether they are in the United States and California. */
const people = new Map();
const add = (r, current) => {
  const id = String(r.person_sales_nav_id ?? "").trim();
  if (!id) return;
  let p = people.get(id);
  if (!p) people.set(id, (p = { rows: [], us: false, other: false, ca: false }));
  p.rows.push({ r, current });
  if (inUs(r)) p.us = true;
  else if (real(r.country)) p.other = true;
  if (californian({ location: r.person_location })) p.ca = true;
};
for (const r of seatRows) add(r, true);
for (const r of pastRows) add(r, false);

/**
 * Websites the files give for a company name that is no client on the seed: its own-firm rows on
 * either file (a firm, provider or practice the importers dropped), else the Past Companies tab.
 * For a current company (rule 2), the site of the firm by that name.
 */
const firmSiteByName = new Map();
for (const r of [...seatRows, ...pastRows]) {
  const k = companyKey(r.company_name ?? "");
  const h = ownHost(r.company_website);
  if (k && h && !clients.has(k) && ownRank(r) && !firmSiteByName.has(k)) firmSiteByName.set(k, h);
}
for (const [k, h] of tabSite) if (!clients.has(k) && !firmSiteByName.has(k)) firmSiteByName.set(k, h);
/** Companies the files show as someone's client (a row that is no own firm): never a person's own firm by rule 2. */
const fileClients = new Set();
for (const r of [...seatRows, ...pastRows]) {
  const k = companyKey(r.company_name ?? "");
  if (k && !ownRank(r) && !ownFirm({ ...r, company_name: String(r.company_name ?? "") })) fileClients.add(k);
}

/* ---------- linking ---------- */

const counts = { people: people.size, us: 0, notUs: 0, ca: 0, notNamed: 0, noOwnFirm: 0, prospects: 0, prospectNoName: 0, linked: 0, withSite: 0, firmOnly: 0, siteFromTab: 0, ranks: { 3: 0, 2: 0, 1.5: 0, 1: 0 }, firmSite: 0, currentRows: 0, pastRows: 0 };
const out = {};
const prospects = {};
for (const [id, p] of people) {
  // A person whose rows disagree on the country (one says elsewhere) is left out: the rule is United States only.
  if (!p.us || p.other) {
    counts.notUs++;
    continue;
  }
  counts.us++;
  if (p.ca) {
    counts.ca++;
    continue;
  }
  const hk = personKey(key, id);
  if (!hk) continue;
  // 1. A known site: the best own-firm row with a website.
  let best = null;
  for (const { r, current } of p.rows) {
    const rank = ownRank(r);
    if (!rank) continue;
    let site = ownHost(r.company_website);
    let fromTab = false;
    if (!site && !current) {
      site = tabSite.get(companyKey(r.company_name ?? "")) ?? null;
      fromTab = !!site;
    }
    if (!site) continue;
    const score = rank * 2 + (current ? 1 : 0);
    if (!best || score > best.score) best = { site, rank, current, fromTab, score, firm: String(r.company_name ?? "").trim().slice(0, 80), person: r.person_name };
  }
  if (!named.has(hk)) {
    counts.notNamed++;
    // A prospect: no seat to claim, a known own-firm site. Outreach only.
    if (best) {
      const clean = cleanPersonName(best.person ?? p.rows[0].r.person_name);
      if ("skip" in clean) counts.prospectNoName++;
      else {
        prospects[hk] = { name: clean.name, site: best.site, ...(best.firm ? { firm: best.firm } : {}), how: "known site" };
        counts.prospects++;
      }
    }
    continue;
  }
  if (best) {
    out[hk] = { site: best.site, how: "known site" };
    counts.linked++;
    counts.withSite++;
    counts.ranks[best.rank]++;
    if (best.current) counts.currentRows++;
    else counts.pastRows++;
    if (best.fromTab) counts.siteFromTab++;
    continue;
  }
  // 2. Their current company, when the title says it is theirs and it is no client on the seed.
  let firm = null;
  for (const { r } of p.rows) {
    const co = String(r.person_current_company ?? "").trim().replace(/\s+/g, " ");
    if (!co || !OWNER_TITLE.test(String(r.person_current_title ?? ""))) continue;
    if (ownFirm({ ...r, company_name: co, company_employee_range: "" }) === "stand-in name (self-employed, stealth, freelance, confidential)" || isPlaceholderCompany(co)) continue;
    if (/\b(self[\s-]?employed|stealth|freelanc\w*|confidential|independent)\b/i.test(co)) continue;
    const k = companyKey(co);
    if (!k || clients.has(k) || fileClients.has(k)) continue;
    firm = co.slice(0, 80);
    break;
  }
  if (firm) {
    const site = firmSiteByName.get(companyKey(firm));
    out[hk] = site ? { site, firm, how: "current company" } : { firm, how: "current company" };
    counts.linked++;
    if (site) counts.firmSite++;
    else counts.firmOnly++;
    continue;
  }
  counts.noOwnFirm++;
}

// Never a profile id: the section holds person keys, domains and firm names only.
const flat = JSON.stringify(out) + JSON.stringify(prospects);
for (const id of people.keys()) if (id.length >= 6 && flat.includes(id)) throw new Error("A profile id would reach the seed. Nothing was written.");

const before = seed.ownSites ? Object.keys(seed.ownSites).length : 0;
console.log(`people in the files: ${counts.people}; United States: ${counts.us}; elsewhere or mixed: ${counts.notUs}`);
console.log(`excluded, California: ${counts.ca}`);
console.log(`no named seat on the seed: ${counts.notNamed} (prospects come from these)`);
console.log(`excluded, no own firm: ${counts.noOwnFirm}`);
console.log(`people linked: ${counts.linked} (with site: ${counts.withSite + counts.firmSite}, firm only: ${counts.firmOnly})`);
console.log(`  by how: known site ${counts.withSite}; current company ${counts.firmSite + counts.firmOnly} (${counts.firmSite} with a site the files give for that firm, ${counts.firmOnly} name only)`);
console.log(`  with site, by row: named after them ${counts.ranks[3]}, one-person company ${counts.ranks[2]}, small firm or provider ${counts.ranks[1.5]}, larger firm or provider ${counts.ranks[1]}; from current seats ${counts.currentRows}, past seats ${counts.pastRows}${companiesPath ? `, site from Past Companies ${counts.siteFromTab}` : ""}`);
console.log(`seed.ownSites: ${before} before, ${counts.linked} now`);
console.log(`prospects (no named seat, a known own-firm site, outreach only): ${counts.prospects}${counts.prospectNoName ? `; left out, the name doesn't read as a first and last name: ${counts.prospectNoName}` : ""}`);
console.log(`known sites in all (seat holders and prospects): ${counts.withSite + counts.firmSite + counts.prospects}`);
if (dry) {
  console.log("dry run: nothing written");
  process.exit(0);
}
seed.ownSites = out;
seed.ownSiteProspects = prospects;
// Written whole, then moved into place: a server or another script reading the seed never sees half a file.
const target = realpathSync(seedPath);
writeFileSync(`${target}.own-sites.tmp`, JSON.stringify(seed));
renameSync(`${target}.own-sites.tmp`, target);
console.log(`wrote ${seedPath}`);
if (!noSeal && seedPath === "data/intel-seed.json") execFileSync(process.execPath, ["scripts/seal-intel-seed.mjs"], { stdio: "inherit" });
