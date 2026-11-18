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
  url: string;
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
  /**
   * The list the headline counts, in the app: Hiring now in the member's function with the
   * profile off, newest first (every function when the headline counts every new role).
   */
  rolesUrl?: string;
  /** Up to 5 of the roles the headline counts, newest first, in free facts only (DigestRole). */
  roles?: DigestRole[];
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
