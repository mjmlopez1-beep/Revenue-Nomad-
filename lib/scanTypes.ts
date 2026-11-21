/**
 * The weekly scan of open fractional GTM roles, and the weekly digest email.
 * Shared shapes for lib/scan/collect.ts (find the roles), lib/table.ts (store them, open and
 * close them with dates) and lib/digest.ts (write the email). No Node imports.
 */

/** One open fractional GTM role found on a job board. */
export interface ScanRole {
  /** Stable key for the posting: company and title, lowercased and squeezed. The same role on two boards shares it. */
  key: string;
  company: string;
  /** The company's website domain when the posting gives one. */
  domain: string | null;
  /** Role title as posted. */
  title: string;
  /** One of FUNCTIONS (lib/tableFields.ts), or null when unclear. */
  function: string | null;
  /** One of ENGAGEMENT_TYPES ("Fractional", "Interim", "Advisory", "Project"), or null. */
  type: string | null;
  /** The link to show: of every listing of this role, the company's own site or ATS first (bestPosting in lib/scan/clean.ts). */
  url: string;
  /** Every posting link this role was found under, `url` included, when there is more than one (the same role on two boards). */
  urls?: string[];
  /** Board or source name. */
  source: string;
  /** ISO date the posting went up, when known. */
  postedAt: string | null;
  /** Rate as posted ("$150/hr", "$8k/mo"), when stated. */
  rate: string | null;
  hoursPerWeek: number | null;
}

export interface ScanSourceResult {
  source: string;
  fetched: number;
  matched: number;
  error?: string;
}

/** A listing a board answered with, left out because the work is not fractional, interim, freelance or contract. */
export interface ScanScreenedOut {
  key: string;
  url: string;
  source: string;
}

export interface ScanCollectResult {
  roles: ScanRole[];
  sources: ScanSourceResult[];
  /**
   * Listings left out because the work is not fractional. A role the scan added earlier that one
   * of these matches is removed (it was let in by an older, looser screen). Optional: a result
   * without it removes nothing.
   */
  screenedOut?: ScanScreenedOut[];
}

/** What applying a scan changed. */
export interface ScanApplyResult {
  at: string;
  opened: number;
  stillOpen: number;
  closed: number;
  reopened: number;
  companiesAdded: number;
  /** Roles left out because the company posting them is a fractional firm, agency or marketplace (lib/firms.ts), not a client. */
  firms?: number;
  /** New roles left for a later run because this one had already opened its limit. */
  overCap?: number;
  /** Unlocks paid back: on a role that had closed (made after it was last seen listed), and every one on a removed role. */
  refunded?: number;
  /**
   * Roles the scan had added that a board still lists but that are not fractional work by the
   * current screen. They are taken off the table (not closed), and their unlocks paid back.
   */
  removed?: number;
  /** Of `removed`, open roles taken off because they are outside GTM and below Director (lib/seniority.ts). */
  removedBelowBar?: number;
  /** New roles left out because they are outside GTM and below Director (lib/seniority.ts). */
  belowBar?: number;
  /** Open roles merged into another listing of the same role (lib/scan/clean.ts sameRoleTitle), and credits paid back for a role bought twice. */
  merged?: number;
  mergeRefunds?: number;
  /** Open roles the posting check after the scan closed (every posting clearly closed). Set by runScan. */
  postingClosed?: number;
}

/** What the posting check after a scan did (checkOpenPostings in lib/table.ts). */
export interface PostingCheckResult {
  /** Open roles whose postings were fetched, and how many fetches that took. */
  roles: number;
  fetches: number;
  /** Roles closed because every posting of theirs was clearly closed. */
  closed: number;
  /** Unlocks paid back on those roles. */
  refunded: number;
}

/** Everything one member's weekly email needs. No other member's data. */
export interface DigestData {
  name: string;
  email: string;
  /** The member's GTM function, or null. */
  function: string | null;
  /** Open roles first seen in the last 7 days: all functions, the member's function, and how many of those sit at a hidden company. */
  newRoles: number;
  newRolesMine: number;
  newRolesMineHidden: number;
  /** Functions with new roles this week, most first. */
  byFunction: { function: string; n: number }[];
  /** Open roles that closed in the last 7 days. */
  closedRoles: number;
  /** Facts still missing on the member's own seats (each earns 1 credit). */
  seatFactsMissing: number;
  credits: number;
  /**
   * The member's saved searches (set up through the Claude connector) with new roles this week:
   * the search's name and how many of this week's new roles match it. Only searches with a match.
   */
  alerts?: { name: string; n: number }[];
  appUrl: string;
  unsubscribeUrl: string;
  /** Notifications in the app, signed in (lib/emailIn.ts): the footer's link. */
  settingsUrl?: string;
  /** Your seats, signed in: the "still missing on your seats" line's link. */
  seatsUrl?: string;
  /** Your credits, signed in: the low-credits line's link. */
  creditsUrl?: string;
  /**
   * How a locked company opens for the member, so the email says it as their plan does: "pro"
   * (Trial and Pro: the first company each day free, and any Crystal Ball company free), "free" (the
   * Free plan: 2 credits), "day" (billing off: the first company each day free, then 2 credits).
   * Absent: 2 credits.
   */
  unlock?: "pro" | "free" | "day";
  /**
   * The list the headline counts, in the app: Hiring now in the member's function with the
   * profile off, newest first (every function when the headline counts every new role).
   */
  rolesUrl?: string;
  /** Up to 5 of the roles the headline counts, newest first, in free facts only (DigestRole). */
  roles?: DigestRole[];
  /**
   * The member's saved views that follow hires ("Recently hired"), each with the companies that
   * newly match it this week: a matching seat added to the table since their last email (at most a
   * week). Only views with a match. Never a seat holder's name.
   */
  hires?: DigestHires[];
}

/** One saved view that follows hires, and what newly matches it. Free facts only. */
export interface DigestHires {
  /** The view's name, as the member saved it. */
  name: string;
  /** Companies that newly match. */
  n: number;
  /** The functions the view follows (empty: any function). */
  functions: string[];
  /** The view narrows to the member's Ideal Fractional Profile ("in your profile"). */
  inProfile: boolean;
  /** The saved view in the app (the button). */
  url: string;
  /** Up to 5, the most recent hire first. */
  rows: DigestHireRow[];
}

/** One company that newly matches: its name only when it isn't locked for the member, the hire's function and start month. */
export interface DigestHireRow {
  /** Null while the company is locked (it has an open role the member hasn't unlocked). */
  company: string | null;
  function: string | null;
  /** "2026-03", or a year alone. */
  start: string | null;
  /** The company's record in the app, over the saved view. */
  url: string;
}

/** One new open role in the weekly email: free facts only, never the company or a locked fact. */
export interface DigestRole {
  /** The open role's title (free while it is open), with the company's name and site taken out. */
  title: string;
  function: string | null;
  industry: string | null;
  employees: string | null;
  /** The HQ's region and country ("Texas, US"), never the city. Null when not on file. */
  region: string | null;
  /** The ISO day it was first listed. */
  listed: string | null;
  /** Its company's record in the app, over the list the headline counts. */
  url: string;
}
