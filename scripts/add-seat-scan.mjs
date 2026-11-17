#!/usr/bin/env node
/**
 * Merge a seat scan (people whose current title is a fractional role, one row per seat, from
 * LinkedIn Sales Navigator) into the private seed, data/intel-seed.json, then re-seal
 * data/intel-seed.enc. Run it again with a newer file: seats already on file are not added twice.
 *
 *   node scripts/add-seat-scan.mjs <seats.csv>
 *   node scripts/add-seat-scan.mjs <seats.csv> --dry-run                               (counts only, writes nothing)
 *   node scripts/add-seat-scan.mjs <seats.csv> --seed <intel-seed.json> --no-seal      (tests)
 *
 * Needs the seed key (RN_INTEL_SEED_KEY, else data/intel-seed.key): seats are keyed by a one-way
 * HMAC of the file's seat_id under it, never by the profile id itself.
 *
 * Columns read: seat_id, person_name, seat_title, role_type, company_name, company_linkedin_url,
 * function, role_category, start_month_est, company_website, company_industry,
 * company_employee_range, company_employee_count, company_rn_revenue_bucket, company_about,
 * company_likely_fractional_provider (and country, for the printed counts only). What reaches the
 * seed is the seat (title, start, function) and company facts (name, website, LinkedIn page,
 * industry, employees, revenue). No person name, profile id, location, country, search query or
 * tenure is stored, and neither is the About text: on a small company it can name its one
 * fractional. The person's name and the About text are read only to tell the fractional's own
 * firm, or a fractional firm, from a client.
 *
 * Each kept row is one seat: source "Seat scan", type Fractional, status Active, end Ongoing, with
 * its title, start and function. The seat holder is NOT stored: these people did not share this
 * with us, so the seat has no holder until a member claims it as theirs ("claimSeat" in
 * lib/table.ts). A claim lives in the state, so a re-run never undoes one.
 *
 * Seat ids: "e_ss_" + the first 20 hex of HMAC-SHA256(seed key, "seat-scan:" + seat_id). A seat
 * the first batch added keeps the id it has ("e_ss_" + the seat_id's letters and digits), so a
 * claim on it still points at it; a re-run finds either form and updates the seat in place.
 * A seat is also a duplicate when its company already has a seat with the same title and start.
 *
 * Companies match by LinkedIn company page, then website host, then name (as Add matches them).
 * When the website's own name is another company on file and not this one (e.g. "Lang" with
 * mangopay.com), the seat goes to the company the domain names. A new company gets what the row
 * says, an existing one only gets the fields it does not have.
 *
 * Rows dropped: not fractional work (role type or title says full-time, or the title is a search
 * for work), a seat outside GTM (lib/tableFields.ts GTM_FUNCTIONS) whose title is below Director
 * (Director, Head of, VP, Chief or a C-level abbreviation, General Counsel, Controller, President
 * and the like stay; GTM seats keep every level), the fractional's own firm rather than a client (a one-person company, a stand-in like
 * Self-employed or Stealth, or a company named after the person), a fractional firm, agency or
 * marketplace (lib/firms.ts, from the name or the About text), and rows with no company.
 * Prints counts and company names only, never a person's name.
 */
import { execFileSync, spawnSync } from "child_process";
import { createHmac } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";

// The same matching keys as Add (lib/scan/clean.ts, lib/tableFields.ts) are TypeScript, so this
// runs under tsx: started with plain node, it starts itself again with tsx loaded.
if (!process.env.RN_SEAT_SCAN_TSX) {
  const r = spawnSync(process.execPath, ["--import", "tsx", ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, RN_SEAT_SCAN_TSX: "1" } });
  process.exit(r.status ?? 1);
}
const { companyKey, isPlaceholderCompany, textKey } = await import("../lib/scan/clean.ts");
const { siteKey, FUNCTIONS, GTM_FUNCTIONS } = await import("../lib/tableFields.ts");
const { employeeBand, industryOf, revenueBand } = await import("../lib/industryMap.ts");
// Fractional firms, agencies and marketplaces are not clients (lib/firms.ts): never added, and the cleanup drops any the seed has.
const { companyFirm, cleanSeed } = await import("../lib/firmRemoval.ts");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const seedPath = flag("--seed") ?? "data/intel-seed.json";
const noSeal = args.includes("--no-seal");
const dryRun = args.includes("--dry-run");
const csvPath = args.filter((a) => a !== "--no-seal" && a !== "--dry-run")[0];
if (!csvPath) {
  console.error("Usage: node scripts/add-seat-scan.mjs <seats.csv> [--seed data/intel-seed.json] [--no-seal] [--dry-run]");
  process.exit(1);
}

/* ---------- CSV ---------- */

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(cell), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  const keys = head.map((h) => h.replace(/^﻿/, "").trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/* ---------- mappings ---------- */

/** The file's function labels, as Merlin's functions. */
const FUNCTION_MAP = {
  Marketing: "Marketing", Growth: "Growth", Sales: "Sales", "Revenue Leadership": "Sales", "Sales Leadership": "Sales",
  Partnerships: "Partnerships", "Customer Success": "Customer Success", "AI GTM": "AI GTM", "Revenue Operations": "RevOps", RevOps: "RevOps",
  "Sales Enablement": "Enablement", Enablement: "Enablement", Technology: "Technology", Finance: "Finance", Operations: "Operations",
  "People/HR": "People", People: "People", Product: "Product", Executive: "Executive", Legal: "Legal", Other: "Other",
};
/** A LinkedIn industry, an employee count or range and a revenue band, as Revenue Nomad's standard values (lib/industryMap.ts), or null. */
const rnIndustry = (raw, company) => industryOf(raw, company);
const rnEmployees = (count, range) => employeeBand(count) ?? employeeBand(range);
const rnRevenue = (raw) => revenueBand(raw);
const host = (u) => {
  const s = String(u ?? "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const h = s.split(/[/?#]/)[0].toLowerCase();
  return /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}$/.test(h) ? h : null;
};
const cleanUrl = (u) => String(u ?? "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").slice(0, 200);
const month = (v) => (/^\d{4}-\d{2}$/.test(String(v ?? "").trim()) ? String(v).trim() : null);

/* ---------- the fractional's own firm ---------- */

/** Names that stand for "no client": the fractional's own practice or a client they won't name. */
const STAND_INS = new Set(
  [
    "self", "selfemployed", "self employed", "freelance", "freelancer", "freelancing", "independent", "independentconsultant", "independent consultant",
    "stealth", "stealthstartup", "stealth startup", "stealthmode", "stealth mode", "stealthcompany", "confidential", "confidentialclient", "confidential client",
    "various", "variousclients", "multipleclients", "multiple clients", "consultant", "selfemployedconsultant", "myself", "private", "undisclosed",
  ].map((s) => textKey(s)),
);
const STAND_IN_START = /^(self[\s-]?employed|stealth\b|freelance\b|independent (consultant|contractor|advisor)\b|confidential\b)/i;
const words = (s) =>
  String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Why a row is the fractional's own firm, or null when the company reads as a client. */
function ownFirm(r) {
  if (String(r.company_employee_range ?? "").trim() === "1") return "one-person company";
  const name = r.company_name;
  const key = textKey(name);
  if (STAND_INS.has(key) || STAND_IN_START.test(name.trim()) || isPlaceholderCompany(name)) return "stand-in name (self-employed, stealth, freelance, confidential)";
  // "Jane Doe, MBA" or "Jane Doe (she/her)": the name before any credentials or note.
  const person = words(String(r.person_name ?? "").split(/[,(|]/)[0]);
  const surname = person[person.length - 1] ?? "";
  const full = person.join("");
  const coWords = words(name);
  if ((full.length >= 5 && key.includes(full)) || (surname.length >= 2 && coWords.includes(surname)) || (surname.length >= 5 && key.includes(surname)))
    return "company named after the person";
  return null;
}

/* ---------- seat keys ---------- */

const keyB64 = process.env.RN_INTEL_SEED_KEY || (existsSync("data/intel-seed.key") ? readFileSync("data/intel-seed.key", "utf8").trim() : "");
if (!keyB64) {
  console.error("No seed key: set RN_INTEL_SEED_KEY or put it in data/intel-seed.key. Seats are keyed by an HMAC under it.");
  process.exit(1);
}
const seatKey = Buffer.from(keyB64, "base64");
/** The seat's id: a one-way HMAC of the file's seat_id, so no profile id reaches the seed. */
const hashedId = (seatId) => `e_ss_${createHmac("sha256", seatKey).update(`seat-scan:${seatId}`).digest("hex").slice(0, 20)}`;
/** The id the first batch gave a seat (the seat_id's letters and digits). Kept for the seats it added. */
const legacyId = (seatId) => `e_ss_${seatId.replace(/[^A-Za-z0-9]/g, "")}`;

/* ---------- fractional work only ---------- */

/** Role types that are fractional work (blank counts: the file is a search for fractional titles). */
const WORK_TYPES = /^(|fractional|interim|freelance|contract|contractor|advisory|advisor|project|part[- ]?time|consultant|consulting)$/i;
/** Why the row is not current fractional work, or null. */
function notFractional(r) {
  if (!WORK_TYPES.test(String(r.role_type ?? "").trim())) return "not fractional work (role type)";
  const t = String(r.seat_title ?? "");
  // "VP Sales (Fractional 2019-2022, Full-Time 2022-Present)". A full-time contract is contract work.
  if (/\bfull[- ]?time\b/i.test(t) && !/\bfull[- ]?time contract/i.test(t)) return "not fractional work (title says full-time)";
  // "Available for Fractional CMO roles", "Open to fractional work": a search for work, not a seat.
  if (/\b(available for|open to|seeking|looking for)\b/i.test(t)) return "not a seat (title is a search for work)";
  if (/\b(ex|former|formerly|previously)[- ]+fractional\b/i.test(t)) return "not a seat (a past fractional role)";
  return null;
}

/* ---------- seniority outside GTM ---------- */

/** C-level abbreviations (CSO and CPO read either way; both are C-level). */
const C_LEVEL = "ceo|cfo|coo|cto|cio|ciso|cpo|chro|cho|clo|cco|cdo|cso|cmo|cro|cao|caio|cbo|cxo|cgo|cno|cuo|cko|cqo|cpto";
const SENIOR = new RegExp(
  [
    "\\bdirector\\b", "\\bhead\\b", "\\bvp\\b", "\\bsvp\\b", "\\bevp\\b", "\\bvice[- ]president\\b", "\\bpresident\\b", "\\bchief\\b", `\\b(${C_LEVEL})s?\\b`,
    "\\bc[- ]?suite\\b", "\\bc[- ]?level\\b", "\\bgeneral counsel\\b", "\\bcontroller\\b", "\\bcomptroller\\b", "\\bmanaging (partner|director)\\b",
    "\\b(operating|executive|equity) partner\\b", "\\bfractional (executive|exec)\\b", "\\bexecutive director\\b",
  ].join("|"),
  "i",
);
/** Phrases that hold a senior word without being senior: "Assistant to the CEO", "Associate Director", "Deputy Head of". */
const NOT_SENIOR_PHRASE = /\b(executive assistant|personal assistant|assistant|ea|pa)\s+(to|for)\b.*$|\b(assistant|associate|deputy)\s+(to\s+(the\s+)?)?(director|vp|vice[- ]president|head|controller|general counsel|chief)\b/gi;
/** True when a title shows Director-and-above seniority (the rule for seats outside GTM). */
const seniorTitle = (title) => SENIOR.test(String(title ?? "").replace(NOT_SENIOR_PHRASE, " "));

/* ---------- merge ---------- */

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const rows = parseCsv(readFileSync(csvPath, "utf8"));
const dropped = {};
const drop = (why) => (dropped[why] = (dropped[why] ?? 0) + 1);
const count = (bag, k) => (bag[k || "(blank)"] = (bag[k || "(blank)"] ?? 0) + 1);
const top = (bag, n = 99) => Object.entries(bag).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(", ");

/** A LinkedIn company page as matched: its id or slug ("linkedin.com/company/12345" is 12345). */
const linkedinKey = (u) => {
  const m = String(u ?? "").match(/linkedin\.com\/company\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
};
const bySite = new Map();
const byName = new Map();
const byLinkedin = new Map();
const ids = new Set(seed.companies.map((c) => c.id));
const index = (c) => {
  const sk = siteKey(c.fields.website);
  if (sk && !bySite.has(sk)) bySite.set(sk, c);
  const nk = companyKey(c.fields.name ?? "");
  if (nk && !byName.has(nk)) byName.set(nk, c);
  const lk = linkedinKey(c.fields.linkedin);
  if (lk && !byLinkedin.has(lk)) byLinkedin.set(lk, c);
};
for (const c of seed.companies) index(c);
const companyById = new Map(seed.companies.map((c) => [c.id, c]));
/** Firms the seed cleanup removed before (lib/firmRemoval.ts), by name and by their seats. */
const removedNames = new Set((seed.removedFirms?.companies ?? []).map((c) => companyKey(c.name)).filter(Boolean));
const removedEngs = new Set((seed.removedFirms?.engagements ?? []).map((e) => e.id));
const engIndex = new Map(seed.engagements.map((e, i) => [e.id, i]));
/** Seats on file by company, title and start: the same seat under another id is a duplicate. */
const seatSig = (companyId, role, start) => (role && start ? `${companyId}|${textKey(role)}|${start}` : null);
const bySig = new Map();
for (const e of seed.engagements) {
  const sig = seatSig(e.companyId, e.fields.role, e.fields.start);
  if (sig && !bySig.has(sig)) bySig.set(sig, e.id);
}

/**
 * The company a website's own name is, when that is another company on file and not this one
 * (the "Lang" -> mangopay.com fix in build-intel-seed.py): a lookup goes to the company its domain names.
 */
function domainOwner(site, company) {
  if (!site) return null;
  const stem = companyKey(site.split(".")[0]);
  if (!stem || stem.length < 4 || companyKey(company).includes(stem)) return null;
  const owner = byName.get(stem);
  // An owner with another website is a different company that only shares the name.
  return owner && (!owner.fields.website || siteKey(owner.fields.website) === siteKey(site)) ? owner : null;
}

const matched = new Set();
const created = new Set();
const matchedBy = {};
let added = 0;
let updated = 0;
let unchanged = 0;
let legacyKept = 0;
let filledOnExisting = 0;
const seen = new Set();
const fnCount = {};
const typeCount = {};
const countryCount = {};
/** Titles dropped by the seniority rule outside GTM, and first-batch seats on file that it would drop. */
const juniorTitles = {};
const juniorOnFile = [];
/** Company id -> the file's About text, for the firm check only (never stored). */
const aboutHint = new Map();
/** Companies the file marks as a likely fractional provider (reported when the rules keep them). */
const flagged = new Map();
/** Firms dropped at import, by name. */
const firmNames = new Map();

for (const r of rows) {
  count(typeCount, String(r.role_type ?? "").trim());
  count(countryCount, String(r.country ?? "").trim());
  const seatId = String(r.seat_id ?? "").trim();
  const company = String(r.company_name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!seatId) {
    drop("no seat id");
    continue;
  }
  if (seen.has(seatId)) {
    drop("same seat twice in the file");
    continue;
  }
  seen.add(seatId);
  const nf = notFractional(r);
  if (nf) {
    drop(nf);
    continue;
  }
  if (!company || !companyKey(company)) {
    drop("no company");
    continue;
  }
  const why = ownFirm(r);
  if (why) {
    drop(why);
    continue;
  }
  const about = String(r.company_about ?? "").trim();
  const fn = FUNCTION_MAP[String(r.function ?? "").trim()] ?? FUNCTION_MAP[String(r.role_category ?? "").trim()] ?? null;
  if (fn && !FUNCTIONS.includes(fn)) throw new Error(`function ${fn} is not in FUNCTIONS`);
  // Outside GTM, Director and above only (Director, Head of, VP, Chief and C-level, General Counsel, Controller, President).
  if (!GTM_FUNCTIONS.includes(fn) && !seniorTitle(r.seat_title)) {
    drop("outside GTM and below Director");
    count(juniorTitles, String(r.seat_title ?? "").trim().replace(/\s+/g, " "));
    if (engIndex.has(legacyId(seatId))) juniorOnFile.push(legacyId(seatId));
    continue;
  }

  const site = host(r.company_website);
  const li = /linkedin\.com\//i.test(r.company_linkedin_url ?? "") ? cleanUrl(r.company_linkedin_url) : null;
  const want = {
    website: site,
    linkedin: li,
    industry: rnIndustry(r.company_industry, company),
    employees: rnEmployees(r.company_employee_count, r.company_employee_range),
    revenue: rnRevenue(r.company_rn_revenue_bucket),
  };
  // The first batch's id when the seed has it, else the hashed one.
  const engId = engIndex.has(legacyId(seatId)) ? legacyId(seatId) : hashedId(seatId);
  // A seat already on file stays at its company, so a re-run moves nothing.
  const before = engIndex.has(engId) ? companyById.get(seed.engagements[engIndex.get(engId)].companyId) : undefined;
  const lk = linkedinKey(li);
  let how = "seat on file";
  let c = before;
  if (!c && lk && byLinkedin.get(lk)) (c = byLinkedin.get(lk)), (how = "LinkedIn page");
  if (!c && site && bySite.get(siteKey(site))) (c = bySite.get(siteKey(site))), (how = "website");
  if (!c && domainOwner(site, company)) (c = domainOwner(site, company)), (how = "the company its website names");
  if (!c && byName.get(companyKey(company))) (c = byName.get(companyKey(company))), (how = "name");
  // A firm an earlier run or cleanup took off the seed stays off (so a re-run changes nothing).
  if (removedEngs.has(hashedId(seatId)) || removedEngs.has(legacyId(seatId)) || (!c && removedNames.has(companyKey(company)))) {
    drop("fractional firm the seed already removed");
    continue;
  }

  // Fractional firms, agencies and marketplaces are not clients (lib/firms.ts), by name or About text.
  const firm = companyFirm(c?.fields.name ?? company, about || null) ?? (c ? companyFirm(company, about || null) : null);
  if (firm) {
    drop("fractional firm, agency or marketplace (lib/firms.ts)");
    // One already on file goes in the cleanup below, with what the seed holds there.
    if (c) aboutHint.set(c.id, about);
    else firmNames.set(company, firm);
    continue;
  }

  if (c) {
    if (!created.has(c.id)) {
      matched.add(c.id);
      count(matchedBy, how);
    }
    // Never overwrite: an existing company only gets the fields it does not have.
    for (const [k, v] of Object.entries(want)) {
      if (v && !c.fields[k]) {
        c.fields[k] = v;
        if (!created.has(c.id)) filledOnExisting++;
      }
    }
    if (lk && !byLinkedin.has(lk)) byLinkedin.set(lk, c);
  } else {
    const base = `c_${companyKey(company).replace(/[^a-z0-9]/g, "").slice(0, 40) || "co"}`;
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}_${n}`;
    ids.add(id);
    c = { id, fields: { name: company, ...Object.fromEntries(Object.entries(want).filter(([, v]) => v)) } };
    seed.companies.push(c);
    companyById.set(id, c);
    created.add(id);
    index(c);
  }
  if (about && !aboutHint.has(c.id)) aboutHint.set(c.id, about);
  if (/^true$/i.test(String(r.company_likely_fractional_provider ?? "").trim())) flagged.set(c.id, c.fields.name ?? company);

  const fields = { source: "Seat scan", role: String(r.seat_title ?? "").trim().replace(/\s+/g, " ").slice(0, 120), type: "Fractional", status: "Active", end: "Ongoing" };
  if (!fields.role) delete fields.role;
  const start = month(r.start_month_est);
  if (start) fields.start = start;
  if (fn) fields.function = fn;
  // The same seat under another id (same company, title and start): keep the one on file.
  const sig = seatSig(c.id, fields.role, fields.start);
  if (sig && bySig.has(sig) && bySig.get(sig) !== engId) {
    drop("same company, title and start as a seat on file");
    continue;
  }
  if (sig) bySig.set(sig, engId);
  if (fn) fnCount[fn] = (fnCount[fn] ?? 0) + 1;
  const eng = { id: engId, companyId: c.id, fields, verified: false };
  if (engId !== hashedId(seatId)) legacyKept++;
  const at = engIndex.get(eng.id);
  if (at === undefined) {
    engIndex.set(eng.id, seed.engagements.length);
    seed.engagements.push(eng);
    added++;
  } else if (JSON.stringify(seed.engagements[at]) !== JSON.stringify(eng)) {
    seed.engagements[at] = eng;
    updated++;
  } else unchanged++;
}

// Labels, places, and firms the file only shows as one together (several fractionals at one
// small company, or an About text that sells fractional leaders). The About texts are read, not stored.
const cleaned = cleanSeed(seed, { about: aboutHint });
seed.companies.sort((a, b) => (a.fields.name ?? "").toLowerCase().localeCompare((b.fields.name ?? "").toLowerCase()));
if (!dryRun) writeFileSync(seedPath, JSON.stringify(seed, null, 1));

const kept = added + updated + unchanged;
const left = new Set(seed.companies.map((c) => c.id));
const named = (x) => (x.reason === "named after its seat holder" ? "(named after its seat holder)" : x.name);
console.log(`${dryRun ? "DRY RUN, nothing written. " : ""}rows read: ${rows.length}`);
console.log(`by role type: ${top(typeCount)}`);
console.log(`kept: ${kept}`);
for (const [why, n] of Object.entries(dropped).sort((a, b) => b[1] - a[1])) console.log(`dropped (${why}): ${n}`);
console.log(`companies matched: ${matched.size} (${filledOnExisting} empty fields filled on them; by ${top(matchedBy)})`);
console.log(`companies created: ${created.size}`);
console.log(`seats added: ${added}, updated: ${updated}, unchanged: ${unchanged} (${legacyKept} keep the first batch's id)`);
console.log(`by function: ${top(fnCount)}`);
console.log(`outside GTM and below Director, top 15 titles: ${top(juniorTitles, 15)}`);
if (juniorOnFile.length) console.log(`first-batch seats on file below Director outside GTM (kept, a claim may point at them): ${juniorOnFile.length}`);
console.log(`seat holders' countries (counted, never stored), top 10: ${top(countryCount, 10)}`);
console.log(`new firms dropped at import: ${firmNames.size}: ${[...firmNames].map(([n, w]) => `${n} (${w})`).sort().join(" | ")}`);
console.log(`firms the cleanup removed: ${cleaned.removed.companies} companies, ${cleaned.removed.seats} seats (${cleaned.kept.length} kept for admin review)`);
if (cleaned.removed.names.length) console.log(`  removed: ${cleaned.removed.names.map((x) => `${named(x)} (${x.reason})`).join(" | ")}`);
const borderline = [...flagged].filter(([id]) => left.has(id)).map(([, n]) => n).sort();
console.log(`borderline (the file calls it a likely fractional provider, the rules keep it as a client): ${borderline.length}: ${borderline.join(" | ")}`);
console.log(`seed now: ${seed.companies.length} companies, ${seed.engagements.length} seats (${seed.engagements.filter((e) => e.fields.source === "Seat scan").length} from seat scans)`);
if (!dryRun && !noSeal && seedPath === "data/intel-seed.json") execFileSync(process.execPath, ["scripts/seal-intel-seed.mjs"], { stdio: "inherit" });
