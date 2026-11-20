/**
 * Matching a Form D issuer to a company already on Merlin, conservatively. Pure.
 *
 * Form D gives a legal name and a principal place of business, never a website, and it lists
 * related persons. So a filing matches only when all of these hold:
 *   1. the name, normalised, is exactly one company's on Merlin: fundingKey drops legal suffixes
 *      (Inc, LLC, Corp, Ltd, PBC, LP and the like, via lib/scan/clean.ts companyKey), then
 *      Holdings, Holding Co, Co and Company, EDGAR's state tags ("/DE/") and a "d/b/a" tail, then
 *      case, accents and punctuation (textKey). No partial or fuzzy match, ever;
 *   2. the name isn't generic (isGenericName): at least 4 letters or digits, not a placeholder,
 *      and not made only of common words ("Summit", "Digital Solutions", "Capital Partners");
 *   3. no other company on Merlin has the same key (else it is ambiguous);
 *   4. the place agrees when both sides know it: the same country, and for US companies the same
 *      state. A one-word name needs at least the same country on both sides, and 5 letters or more;
 *   5. the filing's industry group doesn't clearly contradict the company's industry (a real
 *      estate, oil and gas, banking or fund filing against, say, a SaaS company).
 * The filing's own facts are checked in lib/funding/run.ts (amendments, funds, mergers, nothing
 * sold, an old first sale). Companies are never created from a filing.
 */
import { cleanCompany, companyKey, isPlaceholderCompany, plain } from "../scan/clean";
import { normalizeHq } from "../geo";
import type { FundingSkip } from "./types";

/** A company on Merlin, as matching reads it. `id` is internal. */
export interface FundingTarget {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  industry: string | null;
}

/** "/DE/", "/NY", "/ADR/": EDGAR's tags after a conformed name. */
const EDGAR_TAG = /\s*\/[a-z]{2,4}\/?\s*$/i;
/** A trade name after the legal one ("Acme Labs Inc d/b/a Acme"): the legal name is what matches. */
const DBA = /\s+(?:d\/?b\/?a|f\/?k\/?a|a\/?k\/?a|doing business as)\b.*$/i;
/** Words after a name that don't change which company it is. Legal suffixes are cleanCompany's. */
const EXTRA_SUFFIX = /(?:,\s*|\s+)(?:holdings?(?:\s+co(?:mpany)?)?|holding\s+co(?:mpany)?|co|company|&\s*co|and\s+co)\.?$/i;

/** The key a Form D issuer and a Merlin company share when they are one company. Empty for no name. */
export function fundingKey(name: unknown): string {
  let s = plain(name).replace(EDGAR_TAG, "").replace(DBA, "");
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = cleanCompany(s).replace(EXTRA_SUFFIX, "").trim();
    if (s === before) break;
  }
  return companyKey(s);
}

/**
 * Words too common to tell companies apart on their own. A name made only of these (after the
 * suffixes go) is generic: "Summit", "Apex Group", "Digital Solutions", "Global Capital Partners".
 */
const COMMON = new Set(
  (
    "a an the and of for to in on at by & " +
    "global international national american united north south east west new first one prime premier pro true " +
    "digital data tech technology technologies software systems solutions services service labs lab group partners partner " +
    "capital ventures venture holdings investments investment management consulting advisors advisory associates enterprises " +
    "industries company companies corporation co media marketing health healthcare medical care energy financial finance " +
    "network networks cloud ai analytics consulting creative design studio studios agency brands brand products " +
    "apex summit atlas nova pulse vertex horizon pinnacle catalyst elevate ignite beacon compass anchor harbor bridge keystone " +
    "cornerstone frontier legacy liberty eagle phoenix titan orion zenith spark bloom evolve insight fusion momentum velocity " +
    "quantum matrix nexus vector echo aurora lumen core edge peak alpha omega delta sigma vista summit north star bright " +
    "blue red green black white gold silver smart next future modern simple clear rapid swift true trust secure"
  ).split(/\s+/)
);

/** The name tells too little to match on: short, a placeholder, or only common words. */
export function isGenericName(name: unknown): boolean {
  const n = cleanCompany(plain(name).replace(EDGAR_TAG, "").replace(DBA, ""));
  const key = fundingKey(n);
  if (key.length < 4) return true;
  if (isPlaceholderCompany(n)) return true;
  const words = n.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.length > 0 && words.every((w) => COMMON.has(w));
}

/** One word left once the suffixes go ("Clari", "Acme"): such a name needs the place to agree. */
const oneWord = (name: string) => fundingKey(name).length > 0 && cleanCompany(plain(name).replace(EDGAR_TAG, "").replace(DBA, "")).replace(EXTRA_SUFFIX, "").trim().split(/\s+/).length === 1;

/* ---------- the index of companies ---------- */

export type FundingIndex = Map<string, FundingTarget[]>;

/** Companies by fundingKey. Placeholder names never go in. */
export function fundingIndex(companies: FundingTarget[]): FundingIndex {
  const idx: FundingIndex = new Map();
  for (const c of companies) {
    if (!c.name || isPlaceholderCompany(c.name)) continue;
    const k = fundingKey(c.name);
    if (!k) continue;
    const list = idx.get(k);
    if (list) list.push(c);
    else idx.set(k, [c]);
  }
  return idx;
}

/**
 * The first test, on a listing's name alone (before the filing is fetched): the one company on
 * Merlin it could be, or why not. Most filings stop here as "no-company".
 */
export function candidateFor(name: string, idx: FundingIndex): { company: FundingTarget } | { skip: FundingSkip } {
  const list = idx.get(fundingKey(name));
  if (!list?.length) return { skip: "no-company" };
  if (isGenericName(name) || list.some((c) => isGenericName(c.name))) return { skip: "generic-name" };
  if (list.length > 1) return { skip: "ambiguous" };
  return { company: list[0] };
}

/** The filing's place: "CALIFORNIA" -> United States, California; "UNITED KINGDOM" -> United Kingdom. */
export function filingPlace(stateName: string | null | undefined): { country: string | null; region: string | null } {
  if (!stateName) return { country: null, region: null };
  const g = normalizeHq(stateName);
  return { country: g.country, region: g.region };
}

/** Whether the places agree: false when they clearly differ; null when either side doesn't know. */
export function placeAgrees(a: { country: string | null; region: string | null }, b: { country: string | null; region: string | null }): boolean | null {
  if (!a.country || !b.country) return null;
  if (a.country !== b.country) return false;
  if (a.region && b.region) return a.region === b.region;
  return a.country === "United States" ? null : true;
}

/** Form D industry groups that name a business unlike most on Merlin, and the company industries they fit. */
const INDUSTRY_FAMILIES: [RegExp, RegExp][] = [
  [/^(?:commercial|construction|reits and finance|reits & finance|residential|other real estate)$/i, /real estate|property|construction|contractor|builder|storage|coworking|rental|architecture/i],
  [/^(?:oil and gas|oil & gas|coal mining)$/i, /oil|gas|energy|utilit/i],
  [/^(?:commercial banking|insurance|investing|investment banking|pooled investment fund)$/i, /bank|fintech|insurance|wealth|equity|venture|lending|mortgage|payment|accounting|financ/i],
];

/** The filing's industry group clearly contradicts the company's industry. Unknown on either side is no clash. */
export function industryClash(group: string | null | undefined, industry: string | null | undefined): boolean {
  if (!group || !industry) return false;
  const g = group.replace(/\s+/g, " ").trim();
  for (const [form, fits] of INDUSTRY_FAMILIES) if (form.test(g)) return !fits.test(industry);
  return false;
}

/**
 * The checks once the filing is read: its place and industry against the company's. Null when it
 * matches, else why not.
 */
export function confirmMatch(c: FundingTarget, f: { name: string; stateName: string | null; industry: string | null }): FundingSkip | null {
  if (fundingKey(f.name) !== fundingKey(c.name)) return "no-company";
  const agrees = placeAgrees(filingPlace(f.stateName), { country: c.country, region: c.region });
  if (agrees === false) return "place";
  // A one-word name: the same country on both sides at least (the state too when both know it), and 5 letters or more.
  if (agrees === null && oneWord(c.name)) {
    const p = filingPlace(f.stateName);
    if (!p.country || p.country !== c.country || fundingKey(c.name).length < 5) return "place";
  }
  if (industryClash(f.industry, c.industry)) return "industry";
  return null;
}
