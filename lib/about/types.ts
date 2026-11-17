/**
 * About texts from company websites: what the state keeps (State.about) and the live progress
 * of a run. No imports, so lib/table.ts and lib/about/run.ts can both use it.
 */

/** Who an About text from a company's website is written by (FieldValue.by). A system value like "seed" and "scan": nobody earns a credit for it. */
export const ABOUT_BY = "website";
/** How the record names that source. */
export const ABOUT_SOURCE = "Company website";

/** A company is tried again this long after a skip or a failure. */
export const RETRY_DAYS = 30;
/** A filled About text is read again after this long, and replaced only if the site's text changed. */
export const REFRESH_DAYS = 90;

/** One company's last try. `why`: the reason for a skip or failure. `hash`: of the text read (to tell a change). `host`: where the page was read. */
export interface AboutStatus {
  s: "filled" | "skipped" | "failed";
  why?: string;
  at: string;
  hash?: string;
  host?: string;
}

export interface AboutRunSummary {
  startedAt: string;
  endedAt: string | null;
  total: number;
  done: number;
  filled: number;
  /** Refreshed and still the same text (no change written). */
  unchanged: number;
  skipped: number;
  failed: number;
}

/** State.about. */
export interface AboutState {
  /** By internal company id. */
  companies: Record<string, AboutStatus>;
  lastRun: AboutRunSummary | null;
}

/** A company to read: internal id, name, website host, and its last status if any. */
export interface AboutTarget {
  companyId: string;
  name: string;
  domain: string;
  prev: AboutStatus | null;
}

/** What one company's try came to. `text` only when filled. */
export interface AboutOutcome {
  companyId: string;
  s: AboutStatus["s"];
  why?: string;
  text?: string;
  hash?: string;
  host?: string;
}

/** The run under way in this process (one at a time), for Pilot metrics. */
export const aboutProgress: { running: boolean; run: AboutRunSummary | null } = ((globalThis as { __merlinAbout?: { running: boolean; run: AboutRunSummary | null } }).__merlinAbout ??= {
  running: false,
  run: null,
});

/** On when RN_ABOUT=1: the admin button works and a run follows each weekly scan. */
export const aboutEnabled = () => process.env.RN_ABOUT === "1";
