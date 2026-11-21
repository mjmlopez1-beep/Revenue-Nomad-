/**
 * The website finder (lib/websites): what the state keeps (State.websites) and the live progress
 * of a run. No imports, so lib/table.ts, lib/schedule.ts's neighbours and lib/websites/run.ts can
 * all use it.
 *
 * Everything here is for admins only. A member sees a found website as the company's website,
 * like any other, and never how it was found: no mark, no source, no confidence, no job.
 */

/**
 * Who a website (and a LinkedIn page) Merlin found is by (FieldValue.by). A system value, like
 * "seed" and "scan": nobody earns a credit for it, and it is never a member's fact.
 */
export const WEBSITE_FOUND_BY = "found";
/** How the admin's lists name that source. Never shown to members. */
export const WEBSITE_FOUND_SOURCE = "Found by Merlin";

/** A company with no website found is tried again this long after. */
export const RETRY_DAYS = 60;
/** A company whose every check failed for network trouble (no answer from DNS at all) is tried again on the next run after this long. */
export const FAILED_RETRY_DAYS = 2;
/** Companies one run reads at most (Run now and the schedule alike). */
export const RUN_LIMIT = 300;

export type Confidence = "high" | "medium";

/**
 * One company's last try, by internal company id.
 *  - found: its website was set (domain), with the confidence, and its LinkedIn page when the homepage linked one and it had none;
 *  - none: no candidate passed (tried again after RETRY_DAYS);
 *  - failed: network trouble on every candidate (tried again after FAILED_RETRY_DAYS);
 *  - kept: it had a website by the time the result came (someone added one), nothing written;
 *  - undone: an admin took the find back (never tried again on its own).
 */
export interface WebsiteStatus {
  s: "found" | "none" | "failed" | "kept" | "undone";
  at: string;
  domain?: string;
  confidence?: Confidence;
  /** The LinkedIn page Merlin set with it (linkedin.com/company/...), so Undo takes it back too. */
  linkedin?: string;
  /** Why not, for none and failed (the last candidate's reason, or "no candidates"). */
  why?: string;
  /** Domains checked (DNS) and homepages read, for the counts. */
  tried?: number;
  read?: number;
  /** Who took it back, and when (undone). */
  undoneBy?: string;
}

export interface WebsitesRunSummary {
  startedAt: string;
  endedAt: string | null;
  /** True for a dry run: read and checked, nothing written. */
  dry: boolean;
  total: number;
  done: number;
  found: number;
  high: number;
  medium: number;
  none: number;
  failed: number;
  /** Had a website by the time the result came (nothing written). */
  kept: number;
  /** Candidate domains looked up, and homepages read, in all. */
  lookups: number;
  pages: number;
}

/** State.websites. */
export interface WebsitesState {
  /** By internal company id. */
  companies: Record<string, WebsiteStatus>;
  /** The last real run (a dry run is never stored). */
  lastRun: WebsitesRunSummary | null;
}

/** A company to read: internal id, name, the country of its HQ (lib/geo.ts) and its last status. `queued`: a member added it lately. */
export interface WebsiteTarget {
  companyId: string;
  name: string;
  country: string | null;
  prev: WebsiteStatus | null;
  queued: boolean;
}

/** What one company's try came to. */
export interface WebsiteOutcome {
  companyId: string;
  s: "found" | "none" | "failed";
  domain?: string;
  confidence?: Confidence;
  linkedin?: string;
  why?: string;
  tried: number;
  read: number;
}

/** A find a dry run made, kept in memory for the admin's list (never written). */
export interface DryFind {
  companyId: string;
  name: string;
  domain: string;
  confidence: Confidence;
}

/** The run under way in this process (one at a time), and the last dry run's result, for the admin's card. */
export interface WebsitesProgress {
  running: boolean;
  run: WebsitesRunSummary | null;
  dry: { run: WebsitesRunSummary; finds: DryFind[] } | null;
}
export const websitesProgress: WebsitesProgress = ((globalThis as { __merlinWebsites?: WebsitesProgress }).__merlinWebsites ??= { running: false, run: null, dry: null });

/** On when RN_WEBSITES=1: the schedule runs it and Run now writes. A dry run works either way. */
export const websitesEnabled = () => process.env.RN_WEBSITES === "1";

/** "300 read, 190 found (140 high, 50 medium), 0 failed": a run's counts, for the log line and the card. */
export function runWords(r: Pick<WebsitesRunSummary, "done" | "found" | "high" | "medium" | "failed" | "kept">): string {
  const n = (x: number) => x.toLocaleString("en-US");
  return `${n(r.done)} read, ${n(r.found)} found (${n(r.high)} high, ${n(r.medium)} medium), ${n(r.failed)} failed${r.kept ? `, ${n(r.kept)} had one by then` : ""}`;
}
