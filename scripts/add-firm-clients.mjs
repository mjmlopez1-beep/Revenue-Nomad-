#!/usr/bin/env node
/**
 * Merge the sheet's Firm Clients tab into the private seed, data/intel-seed.json, then re-seal
 * data/intel-seed.enc. The tab lists companies that fractional or outsourced executive firms name
 * as their own clients (case studies, testimonials and logo walls on the firms' websites), and
 * clients named in Clutch reviews of fractional, part-time, interim or outsourced leadership
 * (provider_firms ends with "(Clutch review)", evidence_type clutch_review). Run it again with the
 * same or a newer file: seats already on file are not added twice.
 *
 *   node scripts/add-firm-clients.mjs <firm-clients.csv>
 *   node scripts/add-firm-clients.mjs <firm-clients.csv> --dry-run                          (counts only, writes nothing)
 *   node scripts/add-firm-clients.mjs <firm-clients.csv> --counts-only                      (no company or firm name printed)
 *   node scripts/add-firm-clients.mjs <firm-clients.csv> --seed <intel-seed.json> --no-seal (tests, a copy)
 *
 * One seat per client per firm, with nobody in it: id "e_fc_" + the first 20 hex of
 * HMAC-SHA256(seed key, "firm-client:" + the client's name key + "|" + the firm's name key), so a
 * re-run finds it. A row naming several firms ("Chief Outsiders, Sales Xceleration") makes one seat
 * for each; the same client and firm twice in the file is one seat with both rows' evidence.
 *
 * The seat: source "Firm client list" (members read "Named by a fractional firm") or "Clutch review"
 * (members read "Clutch review"); status Ended with start and end the row's year when it gives one,
 * else no status, start or end (unknown); no addedAt (no new hire). What was bought (role_or_service):
 *   - a leadership role (Fractional CMO, Part-time CFO, Interim CEO, Outsourced VP of Sales): a
 *     leadership seat, type Interim when the role says interim, else Fractional, the role as its title;
 *   - a blank role at a firm that places fractional leaders (LEADER_FIRMS): a leadership seat with no title;
 *   - anything else (outsourced accounting, bookkeeping, freelance marketers, RevOps as a service,
 *     or a blank role at any other firm): a fractional service, type Project, marked `service` on the
 *     seed record. A service makes a company fractional friendly (a past seat on file) but is not a
 *     hire: it never counts toward a repeat hirer, Functions hired or the hire order (lib/table.ts friendliness).
 * The function is the row's function (HR is People; Multi reads the role, lib/tableFields.ts functionOf).
 *
 * For admins only, on the seed record outside its fields (never in a view, export or connector
 * answer): `firmClient` = { firms, detail (case study, testimonial, logo, Clutch review), urls
 * (source_urls), confidence, year, note }, and `needsReview` on a medium-confidence row (a logo wall).
 *
 * Companies match by website domain (matched_domain, website), then LinkedIn page, then name
 * (lib/scan/clean.ts companyKey). An already_on_file row finds its company the same way and adds the
 * seat there. A new company gets the row's Clay match (columns O to Y) when match_method is a domain
 * match: website, LinkedIn page, industry, size, revenue, About, and HQ country only when the match
 * carried the country; otherwise its name, and the row's country as its HQ, so the website finder
 * (lib/websites, RN_WEBSITES) can look for it, and then the About job. A company given facts carries
 * the private import mark `enrichedBy` = { by: "firm clients", match, fields }.
 *
 * Rows dropped (counted by reason): no client name; a client in a country Merlin doesn't read
 * (lib/geo.ts normalizeHq); a skipped row (a placeholder or a name too short to look up) whose
 * company isn't on the seed; the firm itself or another fractional firm (lib/firms.ts, or a firm
 * the file names as a provider): the firm is never created as its own client.
 *
 * Prints counts. Company and firm names only without --counts-only; this file names no person.
 */
import { execFileSync, spawnSync } from "child_process";
import { createHmac } from "crypto";
import { readFileSync, writeFileSync } from "fs";

if (!process.env.RN_FIRM_CLIENTS_TSX) {
  const r = spawnSync(process.execPath, ["--import", "tsx", ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, RN_FIRM_CLIENTS_TSX: "1" } });
  process.exit(r.status ?? 1);
}
const { companyKey } = await import("../lib/scan/clean.ts");
const { siteKey, FUNCTIONS, functionOf } = await import("../lib/tableFields.ts");
const { normalizeHq } = await import("../lib/geo.ts");
const { employeeBand, industryOf, revenueBand } = await import("../lib/industryMap.ts");
const { companyFirm } = await import("../lib/firmRemoval.ts");
const { cleanKeeping, cleanUrl, companyIndex, companyName, host, linkedinKey, newCompanyId, parseCsv, real, seedKey } = await import("./seat-import.mjs");

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
const BOOLEANS = ["--no-seal", "--dry-run", "--counts-only"];
const noSeal = args.includes("--no-seal");
const dryRun = args.includes("--dry-run");
const countsOnly = args.includes("--counts-only");
const csvPath = args.filter((a) => !BOOLEANS.includes(a))[0];
if (!csvPath || args.some((a) => a.startsWith("--") && !BOOLEANS.includes(a))) {
  console.error("Usage: node scripts/add-firm-clients.mjs <firm-clients.csv> [--dry-run] [--counts-only] [--seed <path> --no-seal]");
  process.exit(1);
}

/* ---------- the rules ---------- */

const key = seedKey("Seats are keyed by an HMAC under it.");
const FIRM_SOURCE = "Firm client list";
const CLUTCH_SOURCE = "Clutch review";
const seatId = (client, firm) => `e_fc_${createHmac("sha256", key).update(`firm-client:${companyKey(client)}|${companyKey(firm)}`).digest("hex").slice(0, 20)}`;
const THIS_YEAR = new Date().getUTCFullYear();
const yearOf = (v) => {
  const m = /^(\d{4})(?:\.0+)?$/.exec(String(v ?? "").trim());
  const y = m ? Number(m[1]) : null;
  return y && y >= 1990 && y <= THIS_YEAR ? y : null;
};
/** A leadership role: C-level, VP, Head, Director, Finance Director, a leader, a controller, a sales manager. */
const LEADER = /\b(chief|ceo|cfo|cmo|cro|coo|cto|cio|cso|cpo|chro|cxo|ciso|vp|svp|evp|vice[- ]president|president|head of|director|fd|leader|leadership|controller|sales manag(?:er|ement))\b/i;
/** Firms that place fractional or interim leaders: a row with no role at one of them is a leadership seat. Any other firm's blank row is a service. */
const LEADER_FIRMS = new Set(
  [
    "Chief Outsiders", "TechCXO", "Ampleo", "Sales Manager Now", "Marketri", "Scaleup Finance", "NOW CFO", "Reverb People", "Kalungi", "Freeman Clarke",
    "The CFO Centre", "The Marketing Centre", "Vendux", "Sales Xceleration", "Preferred CFO", "FD Capital", "FD Recruit", "InterimExecs", "Go Fractional",
  ].map((n) => companyKey(n)),
);
const FN = { Marketing: "Marketing", Sales: "Sales", RevOps: "RevOps", Finance: "Finance", Operations: "Operations", Technology: "Technology", HR: "People", People: "People" };
/** The seat's function: the row's first named function (Multi reads the role), or null. */
const functionFor = (raw, role) => {
  for (const p of String(raw ?? "").split(/\s*,\s*/)) if (FN[p.trim()]) return FN[p.trim()];
  const f = functionOf(role);
  return f && FUNCTIONS.includes(f) ? f : null;
};
const DETAIL = { case_study: "case study", testimonial: "testimonial", logo: "logo", clutch_review: "Clutch review" };
const upperFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* ---------- the files ---------- */

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const rows = parseCsv(readFileSync(csvPath, "utf8"));
for (const col of ["client_name", "provider_firms", "role_or_service", "evidence_type", "confidence", "source_urls"])
  if (rows.length && !(col in rows[0])) {
    console.error(`The file has no ${col} column. Is it the Firm Clients tab?`);
    process.exit(1);
  }

const clutchRow = (r) => /clutch/i.test(real(r.evidence_type)) || /\(clutch review\)\s*$/i.test(real(r.provider_firms));
/** The firms a row names: a Clutch row names one (its name may hold a comma), a website row may name several. */
const firmsOf = (r) => {
  const raw = real(r.provider_firms).replace(/\s*\(clutch review\)\s*$/i, "").trim();
  if (!raw) return [];
  return clutchRow(r) ? [raw] : raw.split(/\s*[,;]\s*/).filter(Boolean);
};
/** Every firm the file names as a provider: never a client. */
const providerKeys = new Set(rows.flatMap((r) => firmsOf(r)).map((f) => companyKey(f)).filter(Boolean));
const methodOf = (r) => real(r.match_method).toLowerCase().replace(/\s*\(guess \d+\)$/, "");

/* ---------- the seed as it is ---------- */

const ids = new Set(seed.companies.map((c) => c.id));
const { bySite, byName, byLinkedin, index } = companyIndex(seed.companies);
const engById = new Map(seed.engagements.map((e) => [e.id, e]));
const removedNames = new Set((seed.removedFirms?.companies ?? []).map((c) => companyKey(c.name)).filter(Boolean));
const titleKey = (companyId, role) => `${companyId}|${companyKey(role)}`;
/** Seats on file by company and title (not this import's): a firm client seat with the same title there is that seat. */
const titled = new Map();
for (const e of seed.engagements) if (!e.id.startsWith("e_fc_") && e.fields.role && companyKey(e.fields.role)) titled.set(titleKey(e.companyId, e.fields.role), e);

/* ---------- counts ---------- */

const dropped = {};
const drop = (kind, why) => {
  dropped[why] ??= { website: 0, clutch: 0 };
  dropped[why][kind]++;
};
const tally = () => ({ website: 0, clutch: 0 });
const added = tally();
const leadership = tally();
const services = tally();
const interimSeats = tally();
const review = tally();
const onSeed = tally();
const twice = tally();
const sameTitle = tally();
const rowsKept = tally();
const rowsRead = tally();
const covered = {};
const matchedBy = {};
const matched = new Set();
const created = new Set();
const createdWithClay = new Set();
const onFileNotFound = { website: 0, clutch: 0 };
const onFileFound = { website: 0, clutch: 0 };
const firmNames = new Set();
const fnCount = {};
const aboutHint = new Map();
const count = (bag, k) => (bag[k || "(blank)"] = (bag[k || "(blank)"] ?? 0) + 1);
const top = (bag, n = 99) => Object.entries(bag).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(", ");
const both = (t) => `${t.website + t.clutch} (firm websites ${t.website}, Clutch ${t.clutch})`;

/** Add a row's evidence to a seat record's admin-only note. */
const addEvidence = (e, firm, r, detail) => {
  const fc = (e.firmClient ??= { firms: [], detail: [], urls: [], confidence: real(r.confidence).toLowerCase() || null });
  if (!fc.firms.includes(firm)) fc.firms.push(firm);
  for (const d of detail) if (!fc.detail.includes(d)) fc.detail.push(d);
  for (const u of real(r.source_urls).split(/\s+/).filter((x) => /^https?:\/\//i.test(x))) if (!fc.urls.includes(u)) fc.urls.push(u.slice(0, 300));
  // A high-confidence row wins over a logo wall.
  if (real(r.confidence).toLowerCase() === "high") fc.confidence = "high";
  const y = yearOf(r.year);
  if (y && !fc.year) fc.year = String(y);
  const note = real(r.note).replace(/\s+/g, " ").slice(0, 300);
  if (note && !fc.note) fc.note = note;
};

for (const r of rows) {
  const kind = clutchRow(r) ? "clutch" : "website";
  rowsRead[kind]++;
  const client = companyName(r.client_name);
  if (!client || !companyKey(client)) {
    drop(kind, "no client name");
    continue;
  }
  const country = real(r.country);
  const geo = country ? normalizeHq(country).country : null;
  if (country && !geo) {
    drop(kind, "a country Merlin doesn't read (lib/geo.ts)");
    continue;
  }
  count(covered, `${kind}: ${geo ?? "(no country)"}`);
  const firms = firmsOf(r);
  if (!firms.length) {
    drop(kind, "no provider firm");
    continue;
  }
  const method = methodOf(r);
  const clay = method.startsWith("domain+");
  const site = host(real(r.matched_domain)) ?? host(real(r.website));
  const li = /linkedin\.com\/company\//i.test(real(r.linkedin_url)) ? cleanUrl(real(r.linkedin_url)) : null;
  const about = clay ? real(r.company_about).replace(/\s+/g, " ") : "";

  // The company on file: website domain, then LinkedIn page, then name.
  let c;
  let how = "";
  if (site && bySite.get(siteKey(site))) (c = bySite.get(siteKey(site))), (how = "website");
  if (!c && linkedinKey(li) && byLinkedin.get(linkedinKey(li))) (c = byLinkedin.get(linkedinKey(li))), (how = "LinkedIn page");
  if (!c && byName.get(companyKey(client))) (c = byName.get(companyKey(client))), (how = "name");
  if (!c && real(r.clay_company_name) && byName.get(companyKey(real(r.clay_company_name)))) (c = byName.get(companyKey(real(r.clay_company_name)))), (how = "name (Clay's)");
  if (real(r.already_on_file)) c && !created.has(c.id) ? onFileFound[kind]++ : onFileNotFound[kind]++;

  // The firm itself, another firm the file names, or any fractional firm: never a client.
  const name = c?.fields.name ?? client;
  if (providerKeys.has(companyKey(client)) || providerKeys.has(companyKey(name)) || companyFirm(name, about || c?.fields.about || null, c?.fields.website || site || null) || removedNames.has(companyKey(client))) {
    drop(kind, "a fractional firm, not a client (lib/firms.ts or a provider in the file)");
    firmNames.add(client);
    continue;
  }
  if (!c && method === "skipped") {
    drop(kind, "placeholder or too-short name (match_method skipped)");
    continue;
  }

  // What the row says about the company: its Clay match when there is one, else the row's country.
  const want = {
    website: clay ? site : null,
    linkedin: clay ? li : null,
    industry: clay ? industryOf(real(r.industry), client) : null,
    employees: clay ? employeeBand(real(r.employee_range).replace(/,/g, "")) ?? employeeBand(real(r.employee_count)) : null,
    revenue: clay ? revenueBand(real(r.revenue_range_provider)) : null,
    hq: clay && method.includes("country") ? normalizeHq(real(r.hq_country)).country ?? geo : !clay ? geo : null,
    about: about ? about.slice(0, 200) : null,
  };
  const rule = clay ? (method.includes("country") ? "domain+name+country" : "domain+name") : "row country";
  const mark = (co, filled) => {
    if (!filled.length) return;
    if (co.enrichedBy && co.enrichedBy.by !== "firm clients") co.enrichedBy = { ...co.enrichedBy, fields: [...new Set([...co.enrichedBy.fields, ...filled])], also: [...new Set([...(co.enrichedBy.also ?? []), `firm clients: ${rule}`])] };
    else co.enrichedBy = { by: "firm clients", match: co.enrichedBy?.match ?? rule, fields: [...new Set([...(co.enrichedBy?.fields ?? []), ...filled])] };
  };
  if (c) {
    if (!created.has(c.id)) {
      if (!matched.has(c.id)) count(matchedBy, how);
      matched.add(c.id);
    }
    // Never overwrite: only what the company lacks.
    const filled = [];
    for (const [k, v] of Object.entries(want)) if (v && !c.fields[k]) (c.fields[k] = v), filled.push(k);
    mark(c, filled);
  } else {
    const id = newCompanyId(client, ids);
    const facts = Object.fromEntries(Object.entries(want).filter(([, v]) => v));
    c = { id, fields: { name: client, ...facts } };
    seed.companies.push(c);
    created.add(id);
    if (clay) createdWithClay.add(id);
    index(c);
    mark(c, Object.keys(facts));
  }
  if (about) aboutHint.set(c.id, about);
  rowsKept[kind]++;

  // What was bought.
  const said = real(r.role_or_service).replace(/\s+/g, " ");
  const firstRole = said.split(/\s*;\s*/)[0];
  const lead = said ? LEADER.test(said) : firms.some((f) => LEADER_FIRMS.has(companyKey(f)));
  const role = lead ? upperFirst(firstRole).slice(0, 120) : upperFirst(said).slice(0, 120);
  const fn = functionFor(r.function, said);
  const year = yearOf(r.year);
  const detail = real(r.evidence_type).split(/\s*,\s*/).map((d) => DETAIL[d.trim()] ?? d.trim()).filter(Boolean);
  const source = kind === "clutch" ? CLUTCH_SOURCE : FIRM_SOURCE;

  for (const firm of firms) {
    const id = seatId(client, firm);
    const had = engById.get(id);
    if (had) {
      // On file: a re-run, or the same client and firm on another row of this file. It gains this row's evidence.
      if (had.addedNow) twice[kind]++;
      else onSeed[kind]++;
      addEvidence(had, firm, r, detail);
      continue;
    }
    // The same title at the company already on file (a seat its fractional held, from another source): that seat gains the firm's evidence.
    const same = lead && role ? titled.get(titleKey(c.id, role)) : null;
    if (same) {
      sameTitle[kind]++;
      addEvidence(same, firm, r, detail);
      continue;
    }
    const fields = { source, type: lead ? (/\binterim\b/i.test(said) ? "Interim" : "Fractional") : "Project" };
    if (role) fields.role = role;
    if (fn) fields.function = fn;
    if (year) Object.assign(fields, { status: "Ended", start: String(year), end: String(year) });
    const e = { id, companyId: c.id, fields, verified: false };
    if (!lead) e.service = true;
    if (real(r.confidence).toLowerCase() === "medium") e.needsReview = true;
    addEvidence(e, firm, r, detail);
    Object.defineProperty(e, "addedNow", { value: true, enumerable: false });
    seed.engagements.push(e);
    engById.set(id, e);
    added[kind]++;
    (lead ? leadership : services)[kind]++;
    if (fields.type === "Interim") interimSeats[kind]++;
    if (e.needsReview) review[kind]++;
    if (fn) count(fnCount, fn);
  }
}
// A seat that only medium rows named stays for review; one a high row named too does not.
for (const e of seed.engagements) if (e.needsReview && e.firmClient?.confidence === "high") delete e.needsReview;

/* ---------- the cleanup, and write ---------- */

const { cleaned, stdKept } = cleanKeeping(seed, created, aboutHint);
if (!dryRun) writeFileSync(seedPath, JSON.stringify(seed, null, 1));

/* ---------- what happened ---------- */

const left = new Set(seed.companies.map((c) => c.id));
const byId = new Map(seed.companies.map((c) => [c.id, c]));
const n = (set) => [...set].filter((id) => left.has(id)).length;
console.log(`${dryRun ? "DRY RUN, nothing written. " : ""}rows read: ${both(rowsRead)}; rows kept: ${both(rowsKept)}`);
console.log(`seats added: ${both(added)}; leadership seats ${both(leadership)} (Interim ${both(interimSeats)}); fractional services, not hires ${both(services)}; needs review (logo walls) ${both(review)}`);
console.log(`on the seed from an earlier run, evidence added: ${both(onSeed)}; the same client and firm twice in this file (one seat): ${both(twice)}; the same title on a seat on file (evidence added to it): ${both(sameTitle)}`);
for (const [why, t] of Object.entries(dropped).sort((a, b) => b[1].website + b[1].clutch - (a[1].website + a[1].clutch))) console.log(`dropped (${why}): ${both(t)}`);
console.log(`countries kept: ${top(covered)}`);
console.log(`companies matched on file: ${matched.size} (by ${top(matchedBy) || "nothing"}); already_on_file rows found ${both(onFileFound)}, not found (added as new) ${both(onFileNotFound)}`);
console.log(`companies created: ${n(created)} (with a Clay match ${n(createdWithClay)}, by name ${n(created) - n(createdWithClay)})`);
console.log(`new companies with no website (the website finder's queue, then About): ${[...created].filter((id) => left.has(id) && !byId.get(id)?.fields.website).length} of ${n(created)}`);
console.log(`by function (seats added): ${top(fnCount) || "none"}`);
console.log(`firms dropped as clients: ${firmNames.size}${countsOnly || !firmNames.size ? "" : `: ${[...firmNames].sort().join(" | ")}`}`);
console.log(`values on companies on file the cleanup would have re-read, kept as they were: ${stdKept}; firms the cleanup removed: ${cleaned.removed.companies} companies, ${cleaned.removed.seats} seats`);
console.log(`seed now: ${seed.companies.length} companies, ${seed.engagements.length} seats (${seed.engagements.filter((e) => e.id.startsWith("e_fc_")).length} from firm client lists and Clutch reviews)`);
if (!dryRun && !noSeal && seedPath === "data/intel-seed.json") execFileSync(process.execPath, ["scripts/seal-intel-seed.mjs"], { stdio: "inherit" });
