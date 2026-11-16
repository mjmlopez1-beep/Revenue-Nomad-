import type { Engagement, JobFunction, RawJob } from "../types";

/**
 * Scores a raw item for relevance to fractional GTM work.
 *
 * A listing only reaches the board when it BOTH clears MIN_SCORE and the work itself is
 * fractional, interim, freelance or contract (workSignal): the title says so, or a sentence in
 * the body says the role itself is. Remote, "advisor", "consultative", part-time, days or hours a
 * week and hourly rates are not enough on their own, and "contract" about customers ("close
 * contracts") does not count. Full-time tells (benefits language, 40h weeks, annual salaries)
 * subtract points, and keep out a role whose only signal is in the body.
 */
export const MIN_SCORE = 40;

const ENGAGEMENT_PATTERNS: [Engagement, RegExp, number][] = [
  ["Fractional", /\bfractional\b/i, 45],
  ["Interim", /\binterim\b/i, 35],
  ["Advisory", /\badvisor(y|s)?\b/i, 15],
  ["Part-time", /\bpart[\s-]?time\b/i, 20],
  ["Contract", /\b(contract(or)?|freelance(r)?|1099)\b/i, 30],
];
/** Tags only the title can give: in a body these words describe the job, not the engagement ("trusted advisor", "part-time option", "customer contracts"). */
const TITLE_ONLY_TAGS = new Set<Engagement>(["Advisory", "Part-time", "Contract"]);

/* ---------- the work itself: fractional, interim, freelance or contract ---------- */

export type WorkType = "Fractional" | "Interim" | "Project" | "Advisory";
export interface WorkSignal {
  type: WorkType;
  /** title: the title says so. body: a sentence in the body says the role itself is. */
  where: "title" | "body";
}

/**
 * "Contract" in a title, unless it names work on contracts ("Contract Manager", "Contract
 * Negotiation Lead"). "(Contract)", "Contractor", "Contract-to-hire" and "1099" count.
 */
const TITLE_CONTRACT =
  /\bcontract(?:or)?\b(?![\s-]*(?:manag|negotiat|admin|renewal|specialist|analyst|lifecycle|review|value|compliance|law|attorney|counsel|coordinat|desk|ops\b|operations))|\b1099\b/i;
const TITLE_FREELANCE = /\bfreelance(?:r)?\b/i;
/** An advisor seat: the title starts with Advisor, or a GTM word comes right before it ("GTM Advisor"). "Sales Advisor" is a store job. */
const TITLE_ADVISOR = /^\W*advis(?:or|er|ory)\b|\b(?:gtm|go[\s-]to[\s-]market|revenue|growth|board|strategic|startup)\s+advis(?:or|er|ory)\b/i;

const TITLE_WORK: [WorkType, RegExp][] = [
  ["Fractional", /\bfractional\b/i],
  ["Interim", /\binterim\b/i],
  ["Project", TITLE_FREELANCE],
  ["Project", TITLE_CONTRACT],
  ["Advisory", TITLE_ADVISOR],
];

/**
 * Sentences that say the role itself is fractional, interim, freelance or contract. Each is
 * tried on one sentence at a time, and a match right after words that point at someone or
 * something else ("our fractional CFO", "manage contractors", "customer contract") is ignored.
 */
const SEAT =
  "role|position|engagement|basis|capacity|opportunity|contract|assignment|gig|project|hire|leader|leadership|executive|exec|c[a-z]o|chief|vp|vice president|head|director|advisor|consultant|marketer|seller|lead|manager|specialist|strategist|partner";
const BODY_WORK: [WorkType | "word", RegExp][] = [
  // "a fractional engagement", "interim VP of Sales", "a freelance growth marketer"
  ["word", new RegExp(`\\b(fractional|interim|freelance)\\s+(?:[\\w-]+\\s+){0,2}?(?:${SEAT})\\b`, "gi")],
  // "contract position", "contract marketing role", "1099 contractor", "contract-to-hire"
  ["Project", /\b(contract(?:or)?|1099)\s+(?:[\w-]+\s+)?(?:role|position|engagement|basis|opportunity|assignment|gig|hire|project|contractor|to[\s-]hire)\b/gi],
  // "a 6-month contract", "a 3-6 month engagement"
  ["Project", /\b(\d{1,2})(?:\s*(?:-|–|to)\s*\d{1,2})?[\s-]*months?\s+(?:fractional\s+|interim\s+|freelance\s+)?(?:contract|engagement|assignment)\b(?![\s-]*(?:value|length|term|renewal|size))/gi],
  // "this is a fractional role", "the role is a contract", "this position is a part-time contract"
  ["word", /\b(?:this|the)\s+(?:is|role is|position is|job is|opportunity is|engagement is|seat is)\s+(?:an?\s+)?(?:[\w-]+\s+){0,2}?(fractional|interim|freelance|contract(?:or)?|1099)\b/gi],
  // "we're hiring a fractional ...", "looking for an independent contractor"
  ["word", /\b(?:seeking|hiring|looking for|searching for|in search of|needs?|wants?)\s+an?\s+(?:[\w-]+\s+){0,2}?(fractional|interim|freelance|contractor)\b/gi],
  // "as an independent contractor", "paid as a 1099"
  ["Project", /\b(?:as|is|be|hire|engage)\s+an?\s+(independent contractor|1099|contractor)\b(?!s)/gi],
  ["Project", /\b(independent contractor)\b(?!s)/gi],
];
/** Words right before the match that make it about someone or something else. */
const NOT_THIS_ROLE =
  /\b(?:our|their|your|its|with|alongside|reports?|reporting|partner(?:ing)?|manag(?:e|es|ing)|oversee(?:s|ing)?|support(?:s|ing)?|coordinat\w*|direct(?:s|ing)?|other|existing|current|former|previous|past|customer|customers|client|clients|annual|multi-year|enterprise|signed|sign|close|closing|negotiat\w*|renew\w*|vs)\s+(?:[\w-]+\s+)?(?:(?:the|a|an)\s+)?$/i;
/** "Our first fractional CMO" is this role. */
const OUR_NEXT = /\b(?:our|their)\s+(?:first|next|new|first-ever)\s+$/i;
const typeOfWord = (w: string): WorkType => (/^fractional/i.test(w) ? "Fractional" : /^interim/i.test(w) ? "Interim" : "Project");

/** Sentences of a posting: block tags and sentence ends split it, tags and entities go. */
export function sentencesOf(raw: string): string[] {
  const text = stripHtml(String(raw ?? "").replace(/<\/?(?:p|li|br|div|h[1-6]|ul|ol|tr|td|section)\b[^>]*>/gi, " . "));
  return text.split(/(?<=[.!?;:])\s+|\s+[•·▪]\s+/).map((x) => x.trim()).filter(Boolean);
}

/** The first sentence that says the role itself is fractional, interim, freelance or contract, as its type. */
export function bodyWork(raw: string): WorkType | null {
  for (const sentence of sentencesOf(raw)) {
    for (const [type, re] of BODY_WORK) {
      for (const m of sentence.matchAll(re)) {
        const before = sentence.slice(Math.max(0, m.index! - 60), m.index!);
        if (NOT_THIS_ROLE.test(before) && !OUR_NEXT.test(before)) continue;
        return type === "word" ? typeOfWord(m[1]) : type;
      }
    }
  }
  return null;
}

/** The title says the work is fractional, interim, freelance or contract, or names an advisor seat. */
export function titleWork(title: string): WorkType | null {
  for (const [type, re] of TITLE_WORK) if (re.test(title)) return type;
  return null;
}

/**
 * Full-time tells. With one of these, only the title can say the work is fractional. "Not
 * full-time" and "non-full-time" are not tells.
 */
export const FULL_TIME_TELLS =
  /(?<!\bnot\s(?:an?\s)?)(?<!\bnon[\s-]?)\bfull[\s-]?time\b|\bftes?\b|\b(?:401k|401\(k\)|403b|health insurance|dental and vision|vision insurance|paid time off|parental leave|equity package|stock options|rsus?|annual salary|base salary|salary range|salary band|benefits package|(?:full|comprehensive|competitive|great) benefits|w-?2 (?:employee|position|role)|on[\s-]target earnings|ote)\b|\bpto\b|(?:[$€£]\s?\d{2,3}(?:,\d{3})?k?\s*[-–]\s*[$€£]?\s?\d{2,3}(?:,\d{3})?k?)\s*(?:\/|per\s+|a\s+)?(?:year|yr|annum|annually)\b|\b(?:3[89]|4\d|50)\s*\+?\s*(?:hours?|hrs?)\s*(?:\/|per\s+|a\s+)(?:week|wk)\b/i;

/**
 * Whether the work itself is fractional, interim, freelance or contract, and which. The title
 * decides first. A body sentence counts only when the posting has no full-time tell. Remote,
 * advisor wording, consulting, part-time, hours or days a week and hourly rates never count.
 */
export function workSignal(title: string, description: string): WorkSignal | null {
  const fromTitle = titleWork(title || "");
  if (fromTitle) return { type: fromTitle, where: "title" };
  if (FULL_TIME_TELLS.test(`${title} ${stripHtml(description || "")}`)) return null;
  const fromBody = bodyWork(description || "");
  return fromBody ? { type: fromBody, where: "body" } : null;
}

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
  /** The work itself is fractional, interim, freelance or contract, and where the posting says so (workSignal). */
  work: WorkSignal | null;
}

export function scoreJob(raw: RawJob): ScoredTags {
  const title = raw.title || "";
  const text = `${title} ${raw.description || ""}`;
  const work = workSignal(title, raw.description || "");

  let score = 0;
  const engagement: Engagement[] = [];
  const inTitle: Partial<Record<Engagement, RegExp>> = { Contract: new RegExp(`${TITLE_CONTRACT.source}|${TITLE_FREELANCE.source}`, "i"), Advisory: TITLE_ADVISOR };
  for (const [tag, re, pts] of ENGAGEMENT_PATTERNS) {
    // Title matches count full points; description-only matches count half.
    if ((inTitle[tag] ?? re).test(title)) {
      engagement.push(tag);
      score += pts;
    } else if (!TITLE_ONLY_TAGS.has(tag) && re.test(text)) {
      engagement.push(tag);
      score += Math.floor(pts / 2);
    }
  }
  if (work?.type === "Project" && !engagement.includes("Contract")) engagement.push("Contract");

  // Structured facts: commitment, hourly rate, contract term. They describe the work and add
  // points, but none of them makes a job fractional ("3 days a week in our office").
  let commitment: string | undefined;
  let rate: string | undefined;
  let term: string | undefined;

  const days = text.match(DAYS_PER_WEEK);
  if (days) {
    commitment = `${days[1]} days/wk`;
    score += 30;
  }
  const hours = text.match(HOURS_PER_WEEK);
  if (hours) {
    const h = Number(hours[2] || hours[1]);
    if (!commitment) commitment = `${hours[2] ? `${hours[1]}–${hours[2]}` : hours[1]} hrs/wk`;
    if (h <= 32) {
      score += 25;
    } else if (h >= 38) {
      score -= 25; // a 40-hour week is a full-time role whatever it's called
    }
  }
  const rateMatch = text.match(HOURLY_RATE);
  if (rateMatch) {
    rate = rateMatch[0].replace(/\s+/g, " ").replace(/per\s+/i, "/").trim();
    score += 20;
  }
  const termMatch = text.match(CONTRACT_TERM);
  if (termMatch) {
    term = `${termMatch[1]}-month`;
    score += 10;
  }

  // The bar the owner set: the work itself is fractional, interim, freelance or contract.
  const isFractional = !!work;

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
    work,
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
