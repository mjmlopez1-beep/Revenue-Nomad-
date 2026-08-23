import type { Engagement, JobFunction, RawJob } from "../types";

/**
 * Scores a raw item for relevance to fractional GTM work.
 *
 * A listing only reaches the board when it BOTH clears MIN_SCORE and carries a
 * genuine fractional signal: the word fractional/interim/advisory, a ≤4
 * days-per-week or ≤32 hours-per-week commitment, or an hourly rate. Plain
 * full-time roles — even GTM ones — are rejected, and full-time tells
 * (benefits language, 40h weeks, annual salaries) actively subtract points.
 */
export const MIN_SCORE = 40;

const ENGAGEMENT_PATTERNS: [Engagement, RegExp, number][] = [
  ["Fractional", /\bfractional\b/i, 45],
  ["Interim", /\binterim\b/i, 25],
  ["Advisory", /\badvisor(y|s)?\b/i, 15],
  ["Part-time", /\bpart[\s-]?time\b/i, 20],
  ["Contract", /\b(contract(or)?|freelance|consultant|consulting|1099|b2b contract)\b/i, 10],
];

const FUNCTION_PATTERNS: [JobFunction, RegExp][] = [
  ["GTM Leadership", /\b(gtm|go[\s-]?to[\s-]?market|chief revenue|cro\b|chief marketing|cmo\b|chief growth|cgo\b|revenue leader)/i],
  ["Sales", /\b(sales|account executive|ae\b|sdr|bdr|business development|quota|pipeline)\b/i],
  ["Marketing", /\b(marketing|demand gen(eration)?|content|brand|seo|paid media|product marketing|pmm\b|abm\b)\b/i],
  ["RevOps", /\b(revops|revenue operations|sales operations|sales ops|marketing operations|marketing ops|gtm ops|crm admin|hubspot|salesforce admin)\b/i],
  ["Growth", /\b(growth|plg\b|product[\s-]led|lifecycle|activation|retention|funnel)\b/i],
  ["Partnerships", /\b(partnership|alliances|channel|ecosystem|biz ?dev)\b/i],
  ["Customer Success", /\b(customer success|csm\b|account management|onboarding|renewals)\b/i],
];

const SENIORITY_PATTERNS: [string, RegExp, number][] = [
  ["C-level", /\b(cro|cmo|cgo|chief)\b/i, 15],
  ["VP", /\b(vp|vice president)\b/i, 12],
  ["Head", /\bhead of\b/i, 12],
  ["Director", /\bdirector\b/i, 8],
  ["Lead", /\blead\b/i, 5],
];

const GTM_CORE = /\b(gtm|go[\s-]?to[\s-]?market|revenue|pipeline|demand gen|sales strateg|growth strateg)\b/i;

// Structured extraction: commitment, hourly rate, contract term.
const DAYS_PER_WEEK = /\b([1-4])\s*(?:-\s*[1-4]\s*)?days?\s*(?:\/|per\s+|a\s+)(?:week|wk)\b/i;
const HOURS_PER_WEEK = /\b(\d{1,2})\s*(?:-\s*(\d{1,2})\s*)?(?:hours?|hrs?)\s*(?:\/|per\s+|a\s+)(?:week|wk)\b/i;
const HOURLY_RATE = /(?:[$€£]\s?\d{2,3}(?:\s*[-–]\s*[$€£]?\s?\d{2,3})?\s*(?:\/|per\s+)(?:hour|hr)|\b\d{2,3}\s*(?:\/|per\s+)(?:hour|hr)\b|\bhourly rate\b|\bpaid hourly\b)/i;
const CONTRACT_TERM = /\b(\d{1,2})\s*[-–]?\s*months?\s*(?:contract|engagement|term|project|retainer)?\b/i;

// Full-time tells. Any of these without a fractional signal disqualifies.
const FT_EXPLICIT = /\bfull[\s-]?time\b|\bfte\b/i;
const FT_BENEFITS = /\b(401k|401\(k\)|health insurance|dental|vision insurance|pto\b|paid time off|parental leave|equity package|stock options)\b/i;
const FT_ANNUAL_SALARY = /(?:[$€£]\s?\d{2,3}k?\s*[-–]\s*[$€£]?\s?\d{2,3}k)\s*(?:\/|per\s+)?(?:year|yr|annual)|\bannual salary\b|\bbase salary\b/i;

export interface ScoredTags {
  score: number;
  functions: JobFunction[];
  engagement: Engagement[];
  seniority?: string;
  commitment?: string; // e.g. "2 days/wk", "15 hrs/wk"
  rate?: string; // e.g. "$150/hr"
  term?: string; // e.g. "6-month"
  isFractional: boolean;
}

export function scoreJob(raw: RawJob): ScoredTags {
  const title = raw.title || "";
  const text = `${title} ${raw.description || ""}`;

  let score = 0;
  const engagement: Engagement[] = [];
  for (const [tag, re, pts] of ENGAGEMENT_PATTERNS) {
    // Title matches count full points; description-only matches count half.
    if (re.test(title)) {
      engagement.push(tag);
      score += pts;
    } else if (re.test(text)) {
      engagement.push(tag);
      score += Math.floor(pts / 2);
    }
  }

  // Structured fractional signals.
  let commitment: string | undefined;
  let rate: string | undefined;
  let term: string | undefined;
  let structuredFractional = false;

  const days = text.match(DAYS_PER_WEEK);
  if (days) {
    commitment = `${days[1]} days/wk`;
    structuredFractional = true;
    score += 30;
  }
  const hours = text.match(HOURS_PER_WEEK);
  if (hours) {
    const h = Number(hours[2] || hours[1]);
    if (!commitment) commitment = `${hours[2] ? `${hours[1]}–${hours[2]}` : hours[1]} hrs/wk`;
    if (h <= 32) {
      structuredFractional = true;
      score += 25;
    } else if (h >= 38) {
      score -= 25; // a 40-hour week is a full-time role whatever it's called
    }
  }
  const rateMatch = text.match(HOURLY_RATE);
  if (rateMatch) {
    rate = rateMatch[0].replace(/\s+/g, " ").replace(/per\s+/i, "/").trim();
    structuredFractional = true;
    score += 20;
  }
  const termMatch = text.match(CONTRACT_TERM);
  if (termMatch) {
    term = `${termMatch[1]}-month`;
    score += 10;
  }

  // The signals that make work genuinely fractional, per the operator's bar:
  // named engagement style, sub-5-day weeks, or hourly-rate pricing.
  const isFractional =
    engagement.includes("Fractional") ||
    engagement.includes("Interim") ||
    engagement.includes("Advisory") ||
    (engagement.includes("Part-time") && !FT_EXPLICIT.test(title)) ||
    structuredFractional;

  // Full-time tells subtract — and disqualify outright when nothing
  // fractional counterbalances them (enforced via isFractional below).
  if (FT_EXPLICIT.test(text) && !isFractional) score -= 30;
  if (FT_BENEFITS.test(text)) score -= 15;
  if (FT_ANNUAL_SALARY.test(text) && !rate) score -= 20;

  if (engagement.length === 0) engagement.push("Full-time");

  const functions: JobFunction[] = [];
  for (const [tag, re] of FUNCTION_PATTERNS) {
    if (re.test(text)) functions.push(tag);
  }
  if (functions.length > 0) score += 15;
  if (functions.includes("GTM Leadership")) score += 10;

  let seniority: string | undefined;
  for (const [label, re, pts] of SENIORITY_PATTERNS) {
    if (re.test(title)) {
      seniority = label;
      score += pts;
      break;
    }
  }

  if (GTM_CORE.test(title)) score += 15;
  else if (GTM_CORE.test(text)) score += 8;

  // A job with no GTM function match is noise regardless of engagement type.
  if (functions.length === 0) score = Math.min(score, 10);

  return {
    score: Math.max(0, Math.min(100, score)),
    functions,
    engagement,
    seniority,
    commitment,
    rate,
    term,
    isFractional,
  };
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerpt(text: string, max = 600): string {
  const clean = stripHtml(text);
  return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
}
