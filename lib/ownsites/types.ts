/**
 * Own sites (lib/ownsites): the email addresses fractionals publish on their own firm's website.
 * What the seed links (scripts/add-own-sites.mjs: Seed.ownSites), what the state keeps
 * (State.ownEmails, State.ownSitesJob), the switches and the live progress of a run. No imports,
 * so lib/table.ts, lib/schedule.ts and the import script can all use it.
 *
 * Everything here is private. A member sees a found email only as an unlockable email on the seat
 * holder's record, "From their website", and only while RN_OWNSITES=1 (lib/table.ts ownSitePeople).
 * Logs carry counts only: never an email, a name or a domain.
 */

/** A person's own firm, as the import linked it (Seed.ownSites, by person key). */
export interface OwnSiteLink {
  /** The firm's website (a host, "theirfirm.com"), when the files gave one. */
  site?: string;
  /** The firm's name, when only that is known (the job finds its site). */
  firm?: string;
  how: "known site" | "current company";
}

/** Why an email was accepted. */
export type OwnHow = "name match" | "only address on a one-person site" | "generic on a one-person site";
export const OWN_HOWS: OwnHow[] = ["name match", "only address on a one-person site", "generic on a one-person site"];

/** One found email (State.ownEmails, by person key). `pending`: a dry run found it; it is never usable. */
export interface OwnEmail {
  email: string;
  /** The page it was read on. */
  page: string;
  at: string;
  how: OwnHow;
  /** The site read (its host). */
  site: string;
  pending?: true;
}

/** How a person's last try ended. */
export type OwnStatus = "found" | "no site found" | "site unreachable" | "robots" | "no email" | "email not theirs";
export const OWN_MISSES: Exclude<OwnStatus, "found">[] = ["no site found", "site unreachable", "robots", "no email", "email not theirs"];

/** A person's last try (State.ownSitesJob.people). removed: Remove my name; undone: an admin's Undo. Neither is tried again. */
export interface OwnAttempt {
  s: OwnStatus | "removed" | "undone";
  at: string;
  /** The site the job found for a firm name (how "current company"), so it isn't looked up again. */
  site?: string;
  /** Pages read. */
  pages?: number;
  /** A dry run's try: it doesn't hold the person back from the next real run. */
  dry?: true;
}

export interface OwnRunSummary {
  startedAt: string;
  endedAt: string | null;
  dry: boolean;
  total: number;
  tried: number;
  accepted: number;
  byHow: Record<OwnHow, number>;
  noSite: number;
  unreachable: number;
  robots: number;
  noEmail: number;
  notTheirs: number;
  pages: number;
}
export const emptyRun = (startedAt: string, dry: boolean): OwnRunSummary => ({
  startedAt, endedAt: null, dry, total: 0, tried: 0, accepted: 0, byHow: { "name match": 0, "only address on a one-person site": 0, "generic on a one-person site": 0 },
  noSite: 0, unreachable: 0, robots: 0, noEmail: 0, notTheirs: 0, pages: 0,
});

/** State.ownSitesJob. */
export interface OwnSitesState {
  people: Record<string, OwnAttempt>;
  /** The last real run. */
  lastRun: OwnRunSummary | null;
  /** The last dry run (counts only). */
  lastDry: OwnRunSummary | null;
  /** RN_OWNSITES_DRYRUN values whose start-up dry run already ran, so a restart doesn't repeat one. */
  dryDone: number[];
}
export const emptyOwnSites = (): OwnSitesState => ({ people: {}, lastRun: null, lastDry: null, dryDone: [] });

/** A person not found is tried again this long after. */
export const RETRY_DAYS = 60;
/** People the daily job reads. */
export const DAILY_BATCH = 200;
/** Pages read on a site, the homepage included. */
export const PAGE_CAP = 5;

/** Who an own-site email's person is on the seat (PersonRec.source), and the relationship on their record. */
export const OWNSITE_SOURCE = "Their website";
export const OWNSITE_RELATIONSHIP = "Seat holder";
/** How a member reads where the email came from. */
export const OWNSITE_SAY = "From their website";

/** On with RN_OWNSITES=1: the daily job runs, and found emails are usable. Off by default. */
export const ownSitesEnabled = (env: Record<string, string | undefined> = process.env) => env.RN_OWNSITES === "1";
/** RN_OWNSITES_DRYRUN=N: a dry run over up to N people with a known site, once, in the background after start. Null when unset. */
export function dryRunCount(env: Record<string, string | undefined> = process.env): number | null {
  const n = Number.parseInt(env.RN_OWNSITES_DRYRUN ?? "", 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 100_000) : null;
}

export interface OwnSitesProgress {
  running: boolean;
  run: OwnRunSummary | null;
}
export const ownSitesProgress: OwnSitesProgress = ((globalThis as { __merlinOwnSites?: OwnSitesProgress }).__merlinOwnSites ??= { running: false, run: null });

/**
 * A run's counts in one line, for the log and the admin's card. Counts only.
 * "100 of 632 tried: 12 site unreachable, 3 blocked by robots, 40 no email on site, 30 accepted (25 name match, ...), 15 rejected (not theirs)".
 */
export function runWords(r: OwnRunSummary): string {
  const n = (x: number) => x.toLocaleString("en-US");
  return (
    `${n(r.tried)} of ${n(r.total)} tried: ${n(r.noSite)} no site found, ${n(r.unreachable)} site unreachable, ${n(r.robots)} blocked by robots, ${n(r.noEmail)} no email on site, ` +
    `${n(r.accepted)} accepted (${n(r.byHow["name match"])} name match, ${n(r.byHow["only address on a one-person site"])} only address on a one-person site, ${n(r.byHow["generic on a one-person site"])} generic on a one-person site), ` +
    `${n(r.notTheirs)} rejected (not theirs)`
  );
}

/**
 * Whether a LinkedIn-style location reads as California: the state by name or ", CA", or one of its
 * metro areas and larger cities. Read at import as a yes or no; the location itself is never stored.
 */
const CA_PLACES =
  /\b(california|san francisco|bay area|silicon valley|los angeles|san diego|sacramento|san jose|oakland|fresno|santa barbara|san luis obispo|bakersfield|modesto|stockton|riverside|inland empire|oxnard|santa rosa|salinas|santa cruz|monterey|redding|chico|visalia|merced|palo alto|irvine|pasadena|santa clara|sunnyvale|mountain view|berkeley|anaheim|santa monica|napa|sonoma)\b|,\s*ca\b/i;
export const inCalifornia = (location: unknown) => CA_PLACES.test(String(location ?? ""));
