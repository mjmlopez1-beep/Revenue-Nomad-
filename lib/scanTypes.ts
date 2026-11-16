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

export interface ScanCollectResult {
  roles: ScanRole[];
  sources: ScanSourceResult[];
}

/** What applying a scan changed. */
export interface ScanApplyResult {
  at: string;
  opened: number;
  stillOpen: number;
  closed: number;
  reopened: number;
  companiesAdded: number;
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
  appUrl: string;
  unsubscribeUrl: string;
}
