/**
 * Funding events from SEC Form D filings (lib/funding): what the state keeps, the counts Pilot
 * metrics shows, and the switch. Pure types and functions, no Node imports, so lib/table.ts, the
 * radar and the admin page can all use this file.
 *
 * A Form D is the notice a US company files within 15 days of first selling securities in a
 * private round (Regulation D). EDGAR publishes every one, free. The daily run (lib/funding/run.ts,
 * RN_FUNDING=1) reads the filings of the last few days, matches each issuer to a company already
 * on Merlin, conservatively (lib/funding/match.ts), and keeps one event per company and filing:
 * the date, the amount as a band, the kind of security when the filing says, and the source.
 * Nothing else: Form D lists the issuer's executives and directors, and no name of a person is
 * ever read into the state. Companies are never created from a filing.
 */

/** The source every event names, on the card and in the record. */
export const FUNDING_SOURCE = "SEC filing";

/** On when RN_FUNDING=1: the daily run reads EDGAR and Crystal Ball shows its events. Off, nothing reads EDGAR. */
export const fundingEnabled = (): boolean => process.env.RN_FUNDING === "1";

/** The daily run starts on the first page load after this hour (UTC), once EDGAR has published the previous day. */
export const FUNDING_HOUR_UTC = 6;
/** Days of filings a run looks back over (each day is read once). */
export const FUNDING_LOOKBACK_DAYS = 5;
/** Events kept, by the day they were recorded. */
export const FUNDING_KEEP_DAYS = 400;

/**
 * Why a filing became no event. Counted per run and in all, for Pilot metrics.
 *   amendment             a D/A: the same raise again, already counted when it was new
 *   no-company            no company on Merlin has the issuer's name (most filings)
 *   ambiguous             two or more companies on Merlin share the name
 *   generic-name          the name is too common to tell one company from another ("Summit", "Digital Solutions")
 *   fund                  a pooled investment fund (VC, PE, hedge, real estate fund), not an operating company
 *   business-combination  a merger or acquisition, not a raise
 *   no-amount             nothing sold yet, or no amount given
 *   old-sale              the first sale was over a year before the filing
 *   place                 the issuer's state or country is not the company's HQ (or a one-word name with no HQ on file)
 *   industry              the filing's industry and the company's clearly differ (a real estate LLC named like a software company)
 *   duplicate             an event for this company and filing, or this first sale, is on file
 *   unreadable            the filing's document could not be read
 */
export type FundingSkip =
  | "amendment"
  | "no-company"
  | "ambiguous"
  | "generic-name"
  | "fund"
  | "business-combination"
  | "no-amount"
  | "old-sale"
  | "place"
  | "industry"
  | "duplicate"
  | "unreadable";

export const FUNDING_SKIP_WORDS: Record<FundingSkip, string> = {
  amendment: "an amendment (D/A)",
  "no-company": "no company on Merlin by that name",
  ambiguous: "more than one company by that name",
  "generic-name": "a name too common to match",
  fund: "an investment fund",
  "business-combination": "a merger or acquisition",
  "no-amount": "nothing sold yet",
  "old-sale": "a first sale over a year old",
  place: "a different state or country",
  industry: "a different industry",
  duplicate: "already on file",
  unreadable: "the filing could not be read",
};

/** One event, matched to a company on Merlin (State.funding.events). Never a person's name. */
export interface FundingRecord {
  /** Internal company id. */
  companyId: string;
  /** When Merlin recorded it (ISO): the radar's window reads this. */
  at: string;
  /** The filing date (YYYY-MM-DD). */
  filed: string;
  /** The date of first sale, when the filing gives one (YYYY-MM-DD). */
  firstSale: string | null;
  /** The amount sold, as a band ("$1M–$5M"). */
  band: string;
  /** The amount sold, rounded for a card ("about $2.5M"). */
  about: string;
  /** "equity", "SAFE", "convertible note", "debt", or null when the filing doesn't make it clear. */
  round: string | null;
  source: typeof FUNDING_SOURCE;
  /** EDGAR's accession number, for "never twice". */
  accession: string;
}

/** One run's counts. `filings`: Form D and D/A filings listed for the days read. `read`: filing documents fetched and read. */
export interface FundingRunCounts {
  at: string;
  /** The filing days read in this run (YYYY-MM-DD). */
  days: string[];
  filings: number;
  read: number;
  matched: number;
  unmatched: Partial<Record<FundingSkip, number>>;
  /** Requests that failed after retries (a day left for the next run, or a document). */
  failed: number;
  /** Why the run stopped early, when it did (EDGAR refused us, or no listing could be read). */
  error?: string;
}

export interface FundingTotals {
  filings: number;
  read: number;
  matched: number;
  unmatched: Partial<Record<FundingSkip, number>>;
}

/** State.funding. */
export interface FundingState {
  lastRunAt: string | null;
  /** The UTC day of the last run. */
  lastRunDay: string | null;
  /** Filing days read in full (YYYY-MM-DD -> when), the last 30 days. */
  days: Record<string, string>;
  /** Newest last, FUNDING_KEEP_DAYS kept. */
  events: FundingRecord[];
  last: FundingRunCounts | null;
  totals: FundingTotals;
}

export const emptyFunding = (): FundingState => ({ lastRunAt: null, lastRunDay: null, days: {}, events: [], last: null, totals: { filings: 0, read: 0, matched: 0, unmatched: {} } });

/** Pilot metrics: counts only, never a company or a person. */
export interface FundingAdminStats {
  enabled: boolean;
  lastRunAt: string | null;
  last: FundingRunCounts | null;
  totals: FundingTotals;
  /** Events recorded in the last 30 days, and the companies they are at. */
  events30: number;
  companies30: number;
}

export function fundingAdminStats(f: FundingState | undefined, nowMs: number): FundingAdminStats {
  const x = f ?? emptyFunding();
  const recent = x.events.filter((e) => nowMs - Date.parse(e.at) <= 30 * 86_400_000);
  return {
    enabled: fundingEnabled(),
    lastRunAt: x.lastRunAt,
    last: x.last,
    totals: x.totals,
    events30: recent.length,
    companies30: new Set(recent.map((e) => e.companyId)).size,
  };
}

/** "SEC filing, Oct 2026": the source and the filing month, as the card shows it. */
export function fundingNote(filed: string): string {
  const t = Date.parse(`${filed.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(t)) return FUNDING_SOURCE;
  return `${FUNDING_SOURCE}, ${new Date(t).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}`;
}
