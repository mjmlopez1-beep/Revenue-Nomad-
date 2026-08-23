export type JobStatus = "new" | "saved" | "applied" | "hidden";

export type JobFunction =
  | "GTM Leadership"
  | "Sales"
  | "Marketing"
  | "RevOps"
  | "Growth"
  | "Partnerships"
  | "Customer Success";

export type Engagement =
  | "Fractional"
  | "Interim"
  | "Contract"
  | "Part-time"
  | "Advisory"
  | "Full-time";

/**
 * "listing" — a structured job post on a board or ATS.
 * "discussion" — a community lead: someone talking about / asking for
 * fractional GTM help (HN thread, Reddit post, forum chatter).
 */
export type JobKind = "listing" | "discussion";

export interface Job {
  id: string;
  kind: JobKind;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  url: string;
  source: string;
  postedAt: string; // ISO date
  description: string; // plain-text excerpt
  salary?: string;
  functions: JobFunction[];
  engagement: Engagement[];
  seniority?: string;
  commitment?: string; // e.g. "2 days/wk", "15 hrs/wk"
  rate?: string; // e.g. "$150/hr"
  term?: string; // e.g. "6-month"
  score: number; // 0-100 relevance to "fractional GTM"
  status: JobStatus;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface SourceResult {
  source: string;
  fetched: number;
  matched: number;
  error?: string;
}

export interface CrawlRun {
  at: string;
  results: SourceResult[];
  added: number;
  updated: number;
}

export interface Database {
  jobs: Job[];
  lastCrawl: CrawlRun | null;
}

/** Roles offered on Revenue Nomad operator profiles. */
export type OperatorRole =
  | "Sales Leadership"
  | "Marketing"
  | "Revenue Operations"
  | "Sales Enablement"
  | "Customer Success"
  | "AI GTM"
  | "Partnerships"
  | "Sellers";

/**
 * Mirrors the Revenue Nomad operator-profile schema (Operator_Entry template):
 * role category, up to 7 industries, up to 3 company stages, employee/revenue
 * size buckets, segment fit, and sales motions. The prospect engine deduces
 * the operator's ICP from these fields — no manual account list required.
 */
export interface OperatorProfile {
  name: string;
  headline: string;
  role: OperatorRole;
  industries: string[]; // display names or slugs, e.g. ["B2B SaaS", "fintech"]
  stages: string[]; // pre_seed | seed | series_a | series_b | series_c_plus | growth
  employeeSizes: string[]; // 1_10 | 11_50 | 51_200 | 201_500 | 501_1000 | 1001_plus
  revenueSizes: string[]; // pre_revenue | under_1m | 1m_5m | 5m_20m | 20m_50m | 50m_plus
  segmentFit: string[]; // smb | mid_market | enterprise | all
  salesMotions: string[]; // plg | channel | inside_sales | enterprise_sales | plg_to_sales | all
  keywords: string[]; // free-form ICP keywords / fit tags, e.g. ["PLG", "outbound"]
}

export type SignalType =
  | "funding" // fresh capital → building GTM now
  | "leadership-gap" // hiring FT GTM leadership → pitch fractional/interim
  | "team-without-leader" // hiring reps/ICs with no leadership posting
  | "departure" // exec departure in the news
  | "ai-native" // leadership talking about becoming AI native
  | "content-gap" // missing or stale public marketing content
  | "hiring-role" // hiring in the operator's function
  | "actively-hiring" // flagged as hiring in the company directory
  | "early-inflection" // young company at the stage where GTM gets built
  // Event signals from the daily universe diff (spec §2.1: signals are diffs)
  | "started-hiring" // hiring flag flipped on
  | "headcount-jump" // team size jumped materially
  | "positioning-shift" // one-liner / description changed (pivot tell)
  | "newly-launched"; // company just appeared in the directory

export interface TimingSignal {
  type: SignalType;
  label: string; // short human-readable, e.g. "Raised Series A this month"
  detail?: string;
  evidenceUrl?: string;
  detectedOn?: string; // ISO date of the underlying observation; drives decay
}

export type ProspectStatus = "new" | "queued" | "contacted" | "dismissed";

export interface Prospect {
  id: string;
  company: string;
  domain?: string;
  logo?: string; // company logo URL (directory-provided)
  summary: string; // what we know about them, for the card
  icpFit: number; // 0-100 similarity to the operator's ICP
  matchedIcp: string[]; // which ICP attributes matched
  timing: number; // 0-100 "why now" strength for the operator's role
  signals: TimingSignal[];
  overall: number; // blended priority
  suggestedPitch: string;
  status: ProspectStatus;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ProspectScan {
  at: string;
  results: SourceResult[];
  added: number;
  updated: number;
  engineVersion?: string;
}

export interface ProspectDb {
  prospects: Prospect[];
  lastScan: ProspectScan | null;
}

export interface RawJob {
  title: string;
  company: string;
  location?: string;
  url: string;
  source: string;
  kind?: JobKind; // defaults to "listing"
  postedAt?: string;
  description?: string;
  salary?: string;
}
