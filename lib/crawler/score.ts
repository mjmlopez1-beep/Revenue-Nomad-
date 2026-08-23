import type { Engagement, JobFunction, RawJob } from "../types";

/**
 * Scores a raw job for relevance to fractional / GTM work and tags it.
 * A job must clear MIN_SCORE to make it onto the board.
 */
export const MIN_SCORE = 30;

const ENGAGEMENT_PATTERNS: [Engagement, RegExp, number][] = [
  ["Fractional", /\bfractional\b/i, 45],
  ["Interim", /\binterim\b/i, 25],
  ["Advisory", /\badvisor(y|s)?\b/i, 15],
  ["Part-time", /\bpart[\s-]?time\b/i, 20],
  ["Contract", /\b(contract(or)?|freelance|consultant|consulting|1099|b2b contract)\b/i, 20],
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

export interface ScoredTags {
  score: number;
  functions: JobFunction[];
  engagement: Engagement[];
  seniority?: string;
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

  return { score: Math.min(100, score), functions, engagement, seniority };
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
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerpt(text: string, max = 600): string {
  const clean = stripHtml(text);
  return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
}
