#!/usr/bin/env node
/**
 * Merge a seat scan (people whose current title is a fractional role, one row per seat) into the
 * private seed, data/intel-seed.json, then re-seal data/intel-seed.enc.
 *
 *   node scripts/add-seat-scan.mjs <seats.csv>
 *   node scripts/add-seat-scan.mjs <seats.csv> --seed <intel-seed.json> --no-seal     (tests)
 *
 * Columns read: seat_id, person_name, seat_title, company_name, company_linkedin_url, function,
 * start_month_est, company_website, company_industry, company_employee_range,
 * company_employee_count, company_rn_revenue_bucket. Nothing else from the file reaches the seed
 * (no profile ids, locations, countries, search queries or tenure).
 *
 * Each kept row is one seat: source "Seat scan", type Fractional, status Active, end Ongoing, with
 * its title, start and function. The seat holder is NOT stored: these people did not share this
 * with us, so the seat has no holder until a member claims it as theirs ("claimSeat" in
 * lib/table.ts). The name is read only to tell the person's own firm from a client.
 * Engagement ids come from seat_id, so a re-run updates a seat instead of adding it twice (a
 * claim lives in the state, so a re-run never undoes one).
 * Companies match the way Add matches them (same website host, else same name key); a new
 * company gets what the row says, an existing one only gets the fields it does not have.
 *
 * Rows dropped: the fractional's own firm rather than a client (a one-person company, a stand-in
 * like Self-employed or Stealth, or a company named after the person), and rows with no company. Prints counts only, never a name.
 */
import { execFileSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";

// The same matching keys as Add (lib/scan/clean.ts, lib/tableFields.ts) are TypeScript, so this
// runs under tsx: started with plain node, it starts itself again with tsx loaded.
if (!process.env.RN_SEAT_SCAN_TSX) {
  const r = spawnSync(process.execPath, ["--import", "tsx", ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, RN_SEAT_SCAN_TSX: "1" } });
  process.exit(r.status ?? 1);
}
const { companyKey, textKey } = await import("../lib/scan/clean.ts");
const { siteKey, FUNCTIONS, RN_INDUSTRIES, RN_REVENUE } = await import("../lib/tableFields.ts");

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
const csvPath = args.filter((a) => a !== "--no-seal")[0];
if (!csvPath) {
  console.error("Usage: node scripts/add-seat-scan.mjs <seats.csv> [--seed data/intel-seed.json] [--no-seal]");
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

/* ---------- mappings (the same as scripts/build-intel-seed.py) ---------- */

/** The file's function labels, as Trading Post's functions. */
const FUNCTION_MAP = {
  Marketing: "Marketing", Growth: "Growth", Sales: "Sales", "Revenue Leadership": "Sales", "Sales Leadership": "Sales",
  Partnerships: "Partnerships", "Customer Success": "Customer Success", "AI GTM": "AI GTM", "Revenue Operations": "RevOps", RevOps: "RevOps",
  "Sales Enablement": "Enablement", Enablement: "Enablement", Technology: "Technology", Finance: "Finance", Operations: "Operations",
  "People/HR": "People", People: "People", Product: "Product", Executive: "Executive", Legal: "Legal", Other: "Other",
};
const INDUSTRY_RULES = [
  [/health, wellness|fitness|wellness/, "Wellness & Fitness"],
  [/hospital|health ?care|medical|pharma|biotech|life science|mental health|dental|veterinary/, "Health Care"],
  [/bank|financial|insurance|capital market|investment|venture capital|credit|fintech|funds/, "Financial Services"],
  [/accounting/, "Finance"],
  [/computer hardware|networking|semiconductor|telecommunications equipment|electronics manufacturing|wireless|appliances/, "Hardware & Networking"],
  [/software|it services|information technology|technology, information|internet|computer and network security|data infrastructure|it system/, "Software & IT Services"],
  [/retail|e-commerce|online and mail order/, "Retail"],
  [/consumer|food|beverage|cosmetic|personal care|apparel|luxury|furniture|sporting goods|tobacco|wine/, "Consumer Goods"],
  [/construction|building|civil engineering|contractors/, "Construction"],
  [/real estate|leasing/, "Real Estate"],
  [/manufactur|machinery|automotive|aviation|aerospace|defense|chemical|plastics|packaging|industrial|mechanical|electrical equipment/, "Manufacturing"],
  [/transport|logistics|freight|shipping|truck|warehous|maritime|airlines|railroad|delivery/, "Transportation & Logistics"],
  [/education|e-learning|higher ed|school|training/, "Education"],
  [/advertising|marketing|media|publishing|broadcast|newspaper|public relations|telecommunications|online audio|writing|journalism/, "Media & Communications"],
  [/entertainment|games|gaming|music|movies|film|animation|sports|spectator/, "Entertainment"],
  [/non-?profit|civic|philanthrop|fundraising|religious/, "Nonprofit"],
  [/law|legal/, "Legal"],
  [/oil|gas|mining|energy|utilities|renewable|solar|electric power/, "Energy & Mining"],
  [/hospitality|travel|leisure|hotel|recreation|restaurants|events/, "Recreation & Travel"],
  [/staffing|recruiting|human resources|outsourc|business consulting|consulting|executive search|professional services|management consulting|facilities/, "Corporate Services"],
  [/design|architecture/, "Design"],
  [/farming|agricultur|ranching|fisheries/, "Agriculture"],
  [/government|public policy|legislative|armed forces/, "Public Administration"],
  [/public safety|law enforcement|security and investigations/, "Public Safety"],
  [/arts|museums|fine art|performing/, "Arts"],
];
/** A LinkedIn industry as one of RN_INDUSTRIES, or null when no rule is sure. "Software Development" is Software (there is no description to tell SaaS apart). */
function rnIndustry(raw) {
  const s = String(raw ?? "").toLowerCase();
  if (!s) return null;
  for (const [re, tag] of INDUSTRY_RULES) {
    if (!re.test(s)) continue;
    const out = tag === "Software & IT Services" && s.includes("software development") ? "Software" : tag;
    return RN_INDUSTRIES.includes(out) ? out : null;
  }
  return null;
}
const SIZE = { "2-10": "1–10", "11-50": "11–50", "51-200": "51–200", "201-500": "201–500", "501-1000": "501–1,000", "501-1,000": "501–1,000" };
function rnEmployees(count, range) {
  const n = Number(String(count ?? "").replace(/,/g, ""));
  if (Number.isFinite(n) && n > 0)
    return n <= 10 ? "1–10" : n <= 50 ? "11–50" : n <= 200 ? "51–200" : n <= 500 ? "201–500" : n <= 1000 ? "501–1,000" : "1,001+";
  const r = String(range ?? "").trim();
  if (SIZE[r]) return SIZE[r];
  return /^\d/.test(r) && Number(r.split(/[-+]/)[0].replace(/,/g, "")) > 1000 ? "1,001+" : null;
}
/** "$1M-$5M" -> "$1M–$5M", only when it is one of RN_REVENUE. */
function rnRevenue(raw) {
  const v = String(raw ?? "").trim().replace(/\s*-\s*/g, "–");
  return RN_REVENUE.includes(v) ? v : null;
}
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
  if (STAND_INS.has(key) || STAND_IN_START.test(name.trim())) return "stand-in name (self-employed, stealth, freelance, confidential)";
  // "Jane Doe, MBA" or "Jane Doe (she/her)": the name before any credentials or note.
  const person = words(String(r.person_name ?? "").split(/[,(|]/)[0]);
  const surname = person[person.length - 1] ?? "";
  const full = person.join("");
  const coWords = words(name);
  if ((full.length >= 5 && key.includes(full)) || (surname.length >= 2 && coWords.includes(surname)) || (surname.length >= 5 && key.includes(surname)))
    return "company named after the person";
  return null;
}

/* ---------- merge ---------- */

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const rows = parseCsv(readFileSync(csvPath, "utf8"));
const dropped = {};
const drop = (why) => (dropped[why] = (dropped[why] ?? 0) + 1);

const bySite = new Map();
const byName = new Map();
const ids = new Set(seed.companies.map((c) => c.id));
const index = (c) => {
  const sk = siteKey(c.fields.website);
  if (sk && !bySite.has(sk)) bySite.set(sk, c);
  const nk = companyKey(c.fields.name ?? "");
  if (nk && !byName.has(nk)) byName.set(nk, c);
};
for (const c of seed.companies) index(c);
const companyById = new Map(seed.companies.map((c) => [c.id, c]));
const engIndex = new Map(seed.engagements.map((e, i) => [e.id, i]));

const matched = new Set();
const created = new Set();
let added = 0;
let updated = 0;
let unchanged = 0;
let filledOnExisting = 0;
const seen = new Set();
const fnCount = {};

for (const r of rows) {
  const seatId = String(r.seat_id ?? "").trim();
  const name = String(r.person_name ?? "").trim().replace(/\s+/g, " ");
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
  if (!company || !companyKey(company)) {
    drop("no company");
    continue;
  }
  const why = ownFirm(r);
  if (why) {
    drop(why);
    continue;
  }
  const fn = FUNCTION_MAP[String(r.function ?? "").trim()] ?? FUNCTION_MAP[String(r.role_category ?? "").trim()] ?? null;
  if (fn && !FUNCTIONS.includes(fn)) throw new Error(`function ${fn} is not in FUNCTIONS`);

  // The company: same website host, else the same name key (as Add matches).
  const site = host(r.company_website);
  const want = {
    website: site,
    linkedin: /linkedin\.com\//i.test(r.company_linkedin_url ?? "") ? cleanUrl(r.company_linkedin_url) : null,
    industry: rnIndustry(r.company_industry),
    employees: rnEmployees(r.company_employee_count, r.company_employee_range),
    revenue: rnRevenue(r.company_rn_revenue_bucket),
  };
  const engId = `e_ss_${seatId.replace(/[^A-Za-z0-9]/g, "")}`;
  // A seat already on file stays at its company, so a re-run moves nothing.
  const before = engIndex.has(engId) ? companyById.get(seed.engagements[engIndex.get(engId)].companyId) : undefined;
  let c = before || (site && bySite.get(siteKey(site))) || byName.get(companyKey(company));
  if (c) {
    if (!created.has(c.id)) matched.add(c.id);
    // Never overwrite: an existing company only gets the fields it does not have.
    for (const [k, v] of Object.entries(want)) {
      if (v && !c.fields[k]) {
        c.fields[k] = v;
        if (!created.has(c.id)) filledOnExisting++;
      }
    }
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

  const fields = { source: "Seat scan", role: String(r.seat_title ?? "").trim().replace(/\s+/g, " ").slice(0, 120), type: "Fractional", status: "Active", end: "Ongoing" };
  if (!fields.role) delete fields.role;
  const start = month(r.start_month_est);
  if (start) fields.start = start;
  if (fn) fields.function = fn;
  if (fn) fnCount[fn] = (fnCount[fn] ?? 0) + 1;
  const eng = { id: engId, companyId: c.id, fields, verified: false };
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

seed.companies.sort((a, b) => (a.fields.name ?? "").toLowerCase().localeCompare((b.fields.name ?? "").toLowerCase()));
writeFileSync(seedPath, JSON.stringify(seed, null, 1));

const kept = added + updated + unchanged;
console.log(`rows read: ${rows.length}`);
console.log(`kept: ${kept}`);
for (const [why, n] of Object.entries(dropped).sort((a, b) => b[1] - a[1])) console.log(`dropped (${why}): ${n}`);
console.log(`companies matched: ${matched.size} (${filledOnExisting} empty fields filled on them)`);
console.log(`companies created: ${created.size}`);
console.log(`seats added: ${added}, updated: ${updated}, unchanged: ${unchanged}`);
console.log(`by function: ${Object.entries(fnCount).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(", ")}`);
console.log(`seed now: ${seed.companies.length} companies, ${seed.engagements.length} seats`);
if (!noSeal && seedPath === "data/intel-seed.json") execFileSync(process.execPath, ["scripts/seal-intel-seed.mjs"], { stdio: "inherit" });
