/**
 * Types of the job-board readers in lib/crawler, which the weekly scan (lib/scan/collect.ts)
 * builds on. The table's own types are in lib/tableTypes.ts and lib/scanTypes.ts.
 */

/** The crawler's GTM tags for a posting (lib/crawler/score.ts). The scan maps them to the table's functions. */
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
 * fractional GTM help (HN thread, Reddit post, forum chatter). The scan uses listings only.
 */
export type JobKind = "listing" | "discussion";

/** One posting as a board reader returns it. */
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
