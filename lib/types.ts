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

export interface WatchlistEntry {
  company: string;
  domain?: string; // e.g. "acme.com" — enables content-gap / careers checks
}

export interface OperatorProfile {
  name: string;
  headline: string;
  role: OperatorRole;
  industries: string[]; // e.g. ["B2B SaaS", "fintech"]
  stages: string[]; // e.g. ["Seed", "Series A"]
  keywords: string[]; // free-form ICP keywords, e.g. ["PLG", "outbound"]
  watchlist: WatchlistEntry[]; // target accounts to monitor
}

export type SignalType =
  | "funding" // fresh capital → building GTM now
  | "leadership-gap" // hiring FT GTM leadership → pitch fractional/interim
  | "team-without-leader" // hiring reps/ICs with no leadership posting
  | "departure" // exec departure in the news
  | "ai-native" // leadership talking about becoming AI native
  | "content-gap" // missing or stale public marketing content
  | "hiring-role"; // hiring in the operator's function

export interface TimingSignal {
  type: SignalType;
  label: string; // short human-readable, e.g. "Raised Series A this month"
  detail?: string;
  evidenceUrl?: string;
}

export type ProspectStatus = "new" | "queued" | "contacted" | "dismissed";

export interface Prospect {
  id: string;
  company: string;
  domain?: string;
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
