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
