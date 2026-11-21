/**
 * What the seed importers share: scripts/add-seat-scan.mjs (current seats), add-seat-names.mjs
 * (their holders' names) and add-past-seats.mjs (ended seats). Reading the sheet's CSV, the seed
 * key, the rules that tell a client from the fractional's own firm or a firm, the seniority bar
 * outside GTM, matching a company on file, names for United States seats only, and the seed
 * cleanup the importers run last.
 *
 * TypeScript from lib/ is imported here, so a script loads this only once it runs under tsx (each
 * script starts itself again with tsx loaded, then imports this module).
 */
import { createHmac } from "crypto";
import { existsSync, readFileSync } from "fs";

const { companyKey, isPlaceholderCompany, textKey } = await import("../lib/scan/clean.ts");
const { siteKey } = await import("../lib/tableFields.ts");
const { normalizeHq } = await import("../lib/geo.ts");
const { employeeBand } = await import("../lib/industryMap.ts");
const { cleanSeed } = await import("../lib/firmRemoval.ts");
const { cleanPersonName } = await import("../lib/personName.ts");

/* ---------- CSV ---------- */

/** The sheet's rows as objects (RFC 4180 quoting, a byte-order mark allowed). */
export function parseCsv(text) {
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

/** A cell's value, or "" for a blank or a spreadsheet error ("#VALUE!", "#N/A"). */
export const real = (v) => {
  const s = String(v ?? "").trim();
  return s && !/^#[A-Z/0]+[!?]?$/.test(s) ? s : "";
};
export const isTrue = (v) => /^true$/i.test(String(v ?? "").trim());

/* ---------- the seed key ---------- */

/** The seed key (RN_INTEL_SEED_KEY, else data/intel-seed.key) as bytes. Without one the script stops with `why`. */
export function seedKey(why) {
  const keyB64 = process.env.RN_INTEL_SEED_KEY || (existsSync("data/intel-seed.key") ? readFileSync("data/intel-seed.key", "utf8").trim() : "");
  if (!keyB64) {
    console.error(`No seed key: set RN_INTEL_SEED_KEY or put it in data/intel-seed.key. ${why}`);
    process.exit(1);
  }
  return Buffer.from(keyB64, "base64");
}

/**
 * The seat holder's one-way person key: "p_" + the first 20 hex of HMAC-SHA256(seed key,
 * "person:" + person_sales_nav_id), or null when the row has no person id. The same person has the
 * same key on every seat, current and past, so their seats can be grouped (two people who share a
 * name don't collide), and the profile id itself never reaches the seed. Stored on the seed's seat
 * record as `holderKey` (never in its fields), so it never reaches a view, an export or the connector.
 */
export function personKey(key, personId) {
  const id = String(personId ?? "").trim();
  return id ? `p_${createHmac("sha256", key).update(`person:${id}`).digest("hex").slice(0, 20)}` : null;
}

/* ---------- seat-scan seat ids ---------- */

/** A seat-scan seat's id: "e_ss_" + the first 20 hex of HMAC-SHA256(seed key, "seat-scan:" + its key). */
export const scanSeatId = (key, seatKeyText) => `e_ss_${createHmac("sha256", key).update(`seat-scan:${seatKeyText}`).digest("hex").slice(0, 20)}`;
/** The id the first batch gave a seat (the seat_id's letters and digits). Kept for the seats it added. */
export const scanLegacyId = (seatId) => `e_ss_${seatId.replace(/[^A-Za-z0-9]/g, "")}`;
/** The company a seat-scan row names, as its seat key reads it: the file's company id, else its name. */
const rowCompany = (r) => String(r.company_sales_nav_id ?? "").trim() || `name:${companyKey(companyName(r.company_name))}`;

/**
 * Each seat-scan row's seat id. The file's seat_id is one per person, not per seat, so a person
 * with seats at two clients has two rows under one seat_id. One row of a seat_id keeps the id the
 * seat_id gives (HMAC of "seat-scan:" + seat_id, or the first batch's legacy id): the row whose
 * company is the seat's on the seed, if one is (so a claim on it never moves), else the first. Each
 * other row at another company gets its own: the HMAC of "seat-scan:" + seat_id + ":" + the company's
 * key (company_sales_nav_id, else "name:" + its name); another title at a company the person already
 * has a row at adds ":" + the title. The same person, company and title twice is one seat (`dup`).
 * Returns, per row object: { hashed, legacy } (legacy null for a further seat), or { dup: true }.
 */
export function seatScanIds(rows, seed, key) {
  const engs = new Map(seed.engagements.map((e) => [e.id, e]));
  const cos = new Map(seed.companies.map((c) => [c.id, c]));
  const groups = new Map();
  for (const r of rows) {
    const sid = String(r.seat_id ?? "").trim();
    if (!sid) continue;
    if (!groups.has(sid)) groups.set(sid, []);
    groups.get(sid).push(r);
  }
  const plan = new Map();
  for (const [sid, rs] of groups) {
    const base = { hashed: scanSeatId(key, sid), legacy: scanLegacyId(sid) };
    if (rs.length === 1) {
      plan.set(rs[0], base);
      continue;
    }
    // The row the seat on the seed came from: its company by name, LinkedIn page or website, else its title.
    const onSeed = engs.get(base.legacy) ?? engs.get(base.hashed);
    const c = onSeed ? cos.get(onSeed.companyId) : null;
    const sameCo = (r) =>
      !!c &&
      (companyKey(companyName(r.company_name)) === companyKey(c.fields.name ?? "") ||
        (!!linkedinKey(r.company_linkedin_url) && linkedinKey(r.company_linkedin_url) === linkedinKey(c.fields.linkedin)) ||
        (!!host(r.company_website) && siteKey(host(r.company_website)) === siteKey(c.fields.website)));
    const keeper = (onSeed && (rs.find(sameCo) ?? rs.find((r) => textKey(r.seat_title ?? "") === textKey(onSeed.fields.role ?? "")))) || rs[0];
    const seen = new Set([`${rowCompany(keeper)}|${textKey(keeper.seat_title ?? "")}`]);
    const companiesUsed = new Set([rowCompany(keeper)]);
    plan.set(keeper, base);
    for (const r of rs) {
      if (r === keeper) continue;
      const co = rowCompany(r);
      const t = textKey(r.seat_title ?? "");
      if (seen.has(`${co}|${t}`)) {
        plan.set(r, { dup: true });
        continue;
      }
      seen.add(`${co}|${t}`);
      const k = companiesUsed.has(co) ? `${sid}:${co}:${t}` : `${sid}:${co}`;
      companiesUsed.add(co);
      plan.set(r, { hashed: scanSeatId(key, k), legacy: null, further: true });
    }
  }
  return plan;
}

/* ---------- mappings ---------- */

/** The file's function labels, as Merlin's functions. */
export const FUNCTION_MAP = {
  Marketing: "Marketing", Growth: "Growth", Sales: "Sales", "Revenue Leadership": "Sales", "Sales Leadership": "Sales",
  Partnerships: "Partnerships", "Customer Success": "Customer Success", "AI GTM": "AI GTM", "Revenue Operations": "RevOps", RevOps: "RevOps",
  "Sales Enablement": "Enablement", Enablement: "Enablement", Technology: "Technology", Finance: "Finance", Operations: "Operations",
  "People/HR": "People", People: "People", Product: "Product", Executive: "Executive", Legal: "Legal", Other: "Other",
};
/** An employee count or range as Revenue Nomad's standard band (lib/industryMap.ts), the count first, or null. */
export const rnEmployees = (count, range) => employeeBand(count) ?? employeeBand(range);
/** A website's host ("https://www.acme.com/x" is acme.com), or null when it isn't one. */
export const host = (u) => {
  const s = String(u ?? "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const h = s.split(/[/?#]/)[0].toLowerCase();
  return /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}$/.test(h) ? h : null;
};
export const cleanUrl = (u) => String(u ?? "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").slice(0, 200);
/** A LinkedIn company page as matched: its id or slug ("linkedin.com/company/12345" is 12345). */
export const linkedinKey = (u) => {
  const m = String(u ?? "").match(/linkedin\.com\/company\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
};
/** A company name as the row gives it: a handle or a web address ("@acme.ai", "www.acme.com") reads as the name without its "@" or "www.". */
export const companyName = (raw) => String(raw ?? "").trim().replace(/\s+/g, " ").replace(/^(https?:\/\/)?(www\.)?@*/i, "").trim().slice(0, 80);

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
/** A two-letter country code as the country Merlin reads it (lib/geo.ts), or null. */
export function hqCountry(code) {
  const c = real(code).toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return null;
  let name = null;
  try {
    name = regionNames.of(c);
  } catch {
    name = null;
  }
  return (name && normalizeHq(name).country) || normalizeHq(c).country || null;
}

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
export const words = (s) =>
  String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Why a row is the fractional's own firm, or null when the company reads as a client. */
export function ownFirm(r) {
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

/** True when an About line names one of these seat holders: the whole name, or a word of it after the first of 3+ letters. */
export function aboutNamesHolder(about, holders) {
  const aw = words(about);
  const set = new Set(aw);
  const flat = aw.join("");
  for (const n of holders ?? []) {
    const person = words(String(n).split(/[,(|]/)[0]);
    if (!person.length) continue;
    if (person.length >= 2 && flat.includes(person.join(""))) return true;
    if (person.slice(1).some((w) => w.length >= 3 && set.has(w))) return true;
    if (person.length === 1 && person[0].length >= 3 && set.has(person[0])) return true;
  }
  return false;
}

/* ---------- fractional work only ---------- */

/** Role types that are fractional work (blank counts: the file is a search for fractional titles). */
const WORK_TYPES = /^(|fractional|interim|freelance|contract|contractor|advisory|advisor|project|part[- ]?time|consultant|consulting)$/i;
/** Why the row is not fractional work, or null. */
export function notFractional(r) {
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
export const seniorTitle = (title) => SENIOR.test(String(title ?? "").replace(NOT_SENIOR_PHRASE, " "));

/* ---------- companies on file ---------- */

/**
 * The seed's companies by website host, name and LinkedIn page (the first one each), as Add
 * matches them, and `domainOwner`: the company a website's own name is, when that is another
 * company on file and not this one (the "Lang" -> mangopay.com fix in build-intel-seed.py).
 */
export function companyIndex(companies) {
  const bySite = new Map();
  const byName = new Map();
  const byLinkedin = new Map();
  const index = (c) => {
    const sk = siteKey(c.fields.website);
    if (sk && !bySite.has(sk)) bySite.set(sk, c);
    const nk = companyKey(c.fields.name ?? "");
    if (nk && !byName.has(nk)) byName.set(nk, c);
    const lk = linkedinKey(c.fields.linkedin);
    if (lk && !byLinkedin.has(lk)) byLinkedin.set(lk, c);
  };
  for (const c of companies) index(c);
  const domainOwner = (site, company) => {
    if (!site) return null;
    const stem = companyKey(site.split(".")[0]);
    if (!stem || stem.length < 4 || companyKey(company).includes(stem)) return null;
    const owner = byName.get(stem);
    // An owner with another website is a different company that only shares the name.
    return owner && (!owner.fields.website || siteKey(owner.fields.website) === siteKey(site)) ? owner : null;
  };
  return { bySite, byName, byLinkedin, index, domainOwner };
}

/** A new company's id from its name ("c_acmerobotics", "c_acmerobotics_2" when that is taken). Adds it to `ids`. */
export function newCompanyId(name, ids) {
  const base = `c_${companyKey(name).replace(/[^a-z0-9]/g, "").slice(0, 40) || "co"}`;
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base}_${n}`;
  ids.add(id);
  return id;
}

/**
 * The seed cleanup (lib/firmRemoval.ts cleanSeed) after an import: labels, places, and firms the
 * file only shows as one together. `about` holds About texts read for the firm check, not stored.
 * The cleanup reads an earlier tag with the company's About to pick the closest value: an About this
 * run filled in must not change a value a company on file already had (never overwrite), so those
 * go back. `created`: the ids of the companies this run made. Returns the cleanup's stats and how
 * many values went back.
 */
export function cleanKeeping(seed, created, about) {
  const hadStd = new Map(seed.companies.filter((c) => !created.has(c.id)).map((c) => [c.id, { industry: c.fields.industry, employees: c.fields.employees, revenue: c.fields.revenue }]));
  const cleaned = cleanSeed(seed, { about });
  let stdKept = 0;
  for (const c of seed.companies) {
    const was = hadStd.get(c.id);
    if (!was) continue;
    for (const [k, v] of Object.entries(was)) if (v && c.fields[k] !== v) (c.fields[k] = v), stdKept++;
  }
  seed.companies.sort((a, b) => (a.fields.name ?? "").toLowerCase().localeCompare((b.fields.name ?? "").toLowerCase()));
  return { cleaned, stdKept };
}

/* ---------- seat holders' names: United States only ---------- */

/** The seed's mark on a seat holder's name read from public profiles (lib/table.ts PUBLIC_PROFILE): unverified until claimed or confirmed. */
export const PUBLIC_PROFILE = "public profile";
/** The owner's rule: a name only for a row whose country is exactly "United States". */
export const inUs = (r) => String(r.country ?? "").trim() === "United States";

/**
 * Put the row's name on a seat as its holder, cleaned (lib/personName.ts) and marked as from public
 * profiles. A seat that has a holder keeps it. Returns "kept", "named", or the reason it was skipped.
 */
export function nameSeat(e, rawName) {
  if (e.fields.operator) return { kept: true };
  const clean = cleanPersonName(rawName);
  if ("skip" in clean) return { skip: clean.skip };
  e.fields.operator = clean.name;
  e.holderFrom = PUBLIC_PROFILE;
  return { named: true };
}

/**
 * A seat named from public profiles whose row puts the holder outside the United States loses the
 * name (they moved, or an older file said otherwise). A member's claim lives in the state and is
 * not touched. Then counts the seats outside the United States that still carry a name, which must
 * be 0 before anything is written. `seatOf(row)`: the row's seat on the seed, if any;
 * `ours(seat)`: a seat whose name only this kind of import could have put there.
 */
export function outsideUsNames(rows, seatOf, ours) {
  let takenOff = 0;
  for (const r of rows) {
    if (inUs(r)) continue;
    const e = seatOf(r);
    if (e && e.holderFrom === PUBLIC_PROFILE) {
      delete e.fields.operator;
      delete e.holderFrom;
      takenOff++;
    }
  }
  const namedOutsideUs = rows.filter((r) => {
    if (inUs(r)) return false;
    const e = seatOf(r);
    return !!e && (e.holderFrom === PUBLIC_PROFILE || (ours(e) && !!e.fields?.operator));
  }).length;
  return { takenOff, namedOutsideUs };
}
