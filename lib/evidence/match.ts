/**
 * How close one Evidence Bank case is to one company, by Merlin's rules: pure and deterministic,
 * words only, never a percentage. The company side is its free facts (industry, size band,
 * revenue band, how it sells) and its signals on file (founder-led, why it hired fractionals, a
 * seat that ended, an open role), all of which every member sees free, so a locked company
 * matches as well as an open one and is never named here.
 *
 * Each fact both sides have counts 2 when it is the same, 1 when it is close, 0 when not; a
 * signal that fits the case adds 2. What it reads as:
 *   Same       4 out of 5 of what could count, or more, with industry and size not both far off;
 *   Close      just under half of it, or more;
 *   Different  less, or too little on file to compare.
 */
import { RN_EMPLOYEES, RN_REVENUE } from "../tableFields";
import type { CaseMatch, EvidenceCase, MatchLabel, RankedCase } from "./types";

/** The case's side. */
export type CaseFacts = Pick<EvidenceCase, "industry" | "size" | "revenue" | "motion" | "fn" | "problems" | "workType">;

/** The company's side: free facts and signals only. */
export interface CompanyFacts {
  industry: string;
  /** Employee band (RN_EMPLOYEES). */
  size: string;
  revenue: string;
  /** The company's sales motion as on file (RN_MOTIONS: PLG, PLG to sales, Inside sales, Enterprise sales, Channel). */
  motion: string;
  /** A seat there was hired to move off founder-led sales, or named the founder-led ceiling as why now. */
  founderLed: boolean;
  /** Why it hired fractionals before (seats' "Why they hired"). */
  reasons: string[];
  /** Functions with an open fractional role now. */
  openFns: string[];
  /** Functions where a fractional seat ended. */
  endedFns: string[];
}

/** Industries close enough to read as related. Each industry in at most one family. */
const FAMILIES: string[][] = [
  ["Health Care", "Healthcare Providers & Health Systems", "Insurance & Health Plans", "Pharma & Biotech", "Medical Devices & Diagnostics", "Senior Living & Assisted Living", "Home Care & Aging Services", "Veterinary & Animal Health", "Fitness & Wellness"],
  ["SaaS", "Enterprise Software", "SMB Software", "Developer Tools", "Cybersecurity", "Data & Analytics", "Deep Tech / AI", "IT Services", "Data Centers & Colocation", "Telecommunications & Connectivity"],
  ["Fintech", "Banking & Credit Unions", "Wealth Management & Advisory", "Private Equity & Venture Capital", "Mortgage & Lending", "Accounting & Tax", "Payments & Fintech Infrastructure"],
  ["Education", "EdTech", "K-12 Schools & Districts", "Higher Education", "Corporate Learning & Training", "Childcare & Early Education"],
  ["E-Commerce", "E-Commerce & D2C", "Marketplace", "Brick & Mortar Retail", "Consumer Goods & CPG (Non-Food)", "Luxury & Premium Brands", "Food & Beverage CPG", "Pet Industry"],
  ["Freight & Trucking", "Warehousing & Fulfillment", "Procurement & Supply Chain Leaders", "Maritime & Aviation Logistics", "Food Distribution & Supply", "Industrial Distribution", "General & Specialty Wholesale", "Fleet & Vehicle Management"],
  ["Hardware / IoT", "Precision & Contract Manufacturing", "Industrial Manufacturing", "Electronics & Semiconductor", "Industrial Automation & IoT", "Packaging", "Aerospace & Defense", "Automotive", "Building Materials & Supply"],
  ["Commercial Real Estate", "Residential Real Estate", "Property Management", "Self-Storage", "Coworking & Flexible Workspace", "General Contractors & Builders", "Specialty Trades & Subcontractors", "Architecture, Engineering & Design"],
  ["Media & Content", "Digital Media & Publishing", "Advertising & Media Agencies", "Creator Economy & Social", "Gaming & Interactive Entertainment", "Sports, Events & Live Entertainment"],
  ["Professional Services", "Consulting & Advisory", "Staffing & Recruiting", "Law Firms & Legal Departments", "Marketing Teams & CMOs", "Sales Organizations & CROs", "Customer Success & Support", "Research, Data & Information Services"],
  ["Climate / Clean Tech", "Oil & Gas", "Utilities (Electric, Gas, Water)", "Renewable Energy & Cleantech", "Environmental Services"],
  ["Restaurants", "Catering & Institutional Food Service", "Hotels & Resorts", "Vacation Rentals & Short-Term Rental", "Travel & Tourism", "Theme Parks & Attractions", "Gaming & Casinos"],
];
const familyOf = new Map<string, number>();
FAMILIES.forEach((f, i) => f.forEach((x) => familyOf.set(x.toLowerCase(), i)));

/** A company's sales motion on file as the case motions read it. */
export function caseMotionOf(raw: string): string {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return "";
  if (v === "plg" || v === "plg to sales" || v === "product-led") return "Product-led";
  if (v === "inside sales" || v === "enterprise sales" || v === "sales-led") return "Sales-led";
  if (v === "channel") return "Channel";
  if (v === "founder-led") return "Founder-led";
  return "";
}

const bandAt = (list: readonly string[], v: string) => list.indexOf(String(v ?? "").trim());
const low = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const FOUNDER = /founder/i;

interface Scored {
  match: CaseMatch;
  points: number;
  max: number;
}

/** One case against one company, with its points for ranking (never shown). */
export function scoreCase(c: CaseFacts, co: CompanyFacts): Scored {
  const same: string[] = [];
  const diff: string[] = [];
  let points = 0;
  let max = 0;
  let farIndustry = false;
  let farSize = false;

  // Industry.
  const ci = String(c.industry ?? "").trim();
  const ki = String(co.industry ?? "").trim();
  if (ci && ki) {
    max += 2;
    if (ci.toLowerCase() === ki.toLowerCase()) (points += 2), same.push("Same industry");
    else {
      const a = familyOf.get(ci.toLowerCase());
      const b = familyOf.get(ki.toLowerCase());
      if (a !== undefined && a === b) (points += 1), same.push("A related industry");
      else (farIndustry = true), diff.push("A different industry");
    }
  }
  // Size, by employee band.
  const cs = bandAt(RN_EMPLOYEES, c.size);
  const ks = bandAt(RN_EMPLOYEES, co.size);
  if (cs >= 0 && ks >= 0) {
    max += 2;
    const d = cs - ks;
    if (d === 0) (points += 2), same.push("Same size");
    else if (Math.abs(d) === 1) (points += 1), same.push("Similar size");
    else {
      farSize = true;
      diff.push(d > 0 ? (d >= 3 ? "A much larger client" : "A larger client") : d <= -3 ? "A much smaller client" : "A smaller client");
    }
  }
  // Revenue band.
  const cr = bandAt(RN_REVENUE, c.revenue);
  const kr = bandAt(RN_REVENUE, co.revenue);
  if (cr >= 0 && kr >= 0) {
    max += 2;
    const d = cr - kr;
    if (d === 0) (points += 2), same.push("Same revenue");
    else if (Math.abs(d) === 1) (points += 1), same.push("Similar revenue");
    else diff.push(d > 0 ? "A client with more revenue" : "A client with less revenue");
  }
  // How it sells. A company that hired to move off founder-led sales reads as founder-led too.
  const cm = String(c.motion ?? "").trim();
  const kms = new Set([caseMotionOf(co.motion), co.founderLed ? "Founder-led" : ""].filter(Boolean));
  if (cm && kms.size) {
    max += 2;
    if (kms.has(cm)) (points += 2), same.push(cm);
    else if (co.motion.trim().toLowerCase() === "plg to sales" && (cm === "Sales-led" || cm === "Product-led")) (points += 1), same.push("Moving from product-led to sales");
    else diff.push(`${cm}, not ${low([...kms][0])}`);
  }
  // Signals that fit the case: each adds 2.
  const probs = new Set((c.problems ?? []).map((p) => p.trim().toLowerCase()));
  const shared = (co.reasons ?? []).find((r) => probs.has(r.trim().toLowerCase()));
  const founderCase = cm === "Founder-led" || [...probs].some((p) => FOUNDER.test(p)) || (c.workType ?? []).some((t) => FOUNDER.test(t));
  if (shared) (points += 2), (max += 2), same.push("Same problem");
  else if (founderCase && co.founderLed && !same.includes("Founder-led")) (points += 2), (max += 2), same.push("Same problem: founder-led sales");
  const fn = String(c.fn ?? "").trim();
  if (fn && (co.openFns ?? []).includes(fn)) (points += 2), (max += 2), same.push(`Hiring ${fn} now`);
  else if (fn && (co.endedFns ?? []).includes(fn)) (points += 2), (max += 2), same.push(`A ${fn} seat there ended`);

  let label: MatchLabel;
  if (max === 0) {
    label = "Different";
    diff.push("Too little on file to compare");
  } else {
    const r = points / max;
    label = r >= 0.8 && !(farIndustry && farSize) ? "Same" : r >= 0.45 ? "Close" : "Different";
  }
  return { match: { label, same, diff }, points, max };
}

/** One case against one company, in words. */
export const matchCase = (c: CaseFacts, co: CompanyFacts): CaseMatch => scoreCase(c, co).match;

const ORDER: Record<MatchLabel, number> = { Same: 0, Close: 1, Different: 2 };

/**
 * Cases ranked for one company, closest first: by label, then by how much counted, then newest,
 * then id, so the same cases and facts always give the same order. The first is `closest` unless
 * it reads Different.
 */
export function rankCases(cases: (CaseFacts & Pick<EvidenceCase, "id" | "title" | "updatedAt">)[], co: CompanyFacts): RankedCase[] {
  const scored = cases.map((c) => ({ c, s: scoreCase(c, co) }));
  scored.sort(
    (a, b) =>
      ORDER[a.s.match.label] - ORDER[b.s.match.label] ||
      (b.s.max ? b.s.points / b.s.max : 0) - (a.s.max ? a.s.points / a.s.max : 0) ||
      b.s.points - a.s.points ||
      (b.c.updatedAt > a.c.updatedAt ? 1 : b.c.updatedAt < a.c.updatedAt ? -1 : 0) ||
      (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0),
  );
  return scored.map(({ c, s }, i) => ({ caseId: c.id, title: c.title, ...s.match, closest: i === 0 && s.match.label !== "Different" }));
}
