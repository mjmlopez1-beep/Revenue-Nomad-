/**
 * The read model Trading Post's API returns, and the actions it accepts.
 * Shared by server (lib/table.ts) and client (no Node imports).
 */
import type { Entity } from "./tableFields";

/**
 * What one field looks like to the viewer.
 * - empty: nobody has added it yet (adding it earns a credit)
 * - locked: someone added it; unlocking costs 1 credit. Never carries the value.
 * - value: visible. `mine` = the viewer added it; `ver` = confirmations by members (a fact
 *   from our own records or the scan with none has ver 0); `iv` = the viewer confirmed it;
 *   `system` = set by the system.
 * - `from` (on value and locked): where a fact nobody added by hand came from. "records" is
 *   Revenue Nomad's own records (the seed), "posting" is the job posting the weekly scan read.
 *   Left out on a fact a member added.
 * - reported: under review. Two members' reports hide a fact for everyone until an admin
 *   reviews it; one report hides it only for that reporter (`mine` is then false). A report
 *   by the seat holder on their own seat, and "This isn't me" on a name a member added, hide
 *   the fact for everyone at once.
 */
export type Cell =
  | { s: "empty" }
  | { s: "locked"; ver: number; from?: "records" | "posting" }
  | {
      s: "value";
      v: string;
      mine?: boolean;
      ver: number;
      iv?: boolean;
      system?: boolean;
      from?: "records" | "posting";
      /** Seat holder only: the name belongs to a Trading Post member (their title; `you` when it's the viewer). */
      member?: { title: string; you?: boolean };
    }
  | { s: "reported"; mine: boolean };

export interface PersonRec {
  id: string;
  /** Null for a person at the company level (e.g. a decision maker). */
  engagementId: string | null;
  source: string;
  /** Keyed by contact field: name, title, relationship, email, phone, linkedin. */
  cells: Record<string, Cell>;
}

export interface EngagementRec {
  id: string;
  source: string;
  /** Corroborated by the client company. */
  verified: boolean;
  /** Keyed by engagement field: function, role, type, status, operator, start, end, rate, hours, posting, revenue, employees. */
  cells: Record<string, Cell>;
  people: PersonRec[];
  /** ISO time of the newest fact on this engagement (for "new" badges). */
  updatedAt: string | null;
  /**
   * The viewer is the linked seat holder. Every fact on their own seat is visible to them
   * without credits, and they are the best person to fill in what's missing ("Your seats").
   */
  yours: boolean;
  /**
   * Open roles found by the weekly scan (and open roles from the seed): the day the posting
   * was first seen and the day it stopped being listed (ISO dates). Free to see and to filter on.
   * Both are left out on a seat that was never listed as an open role; `closed` is null while
   * the role is still open.
   */
  opened?: string | null;
  closed?: string | null;
}

export interface Friendly {
  /** 0 to 100. */
  score: number;
  tier: "High" | "Medium" | "Low" | null;
  /** Engagements of a fractional type (Fractional, Interim, Advisory, Project) or published by a member. */
  fractional: number;
  /** Open fractional roles (demand scans or status Open role). */
  open: number;
  /** Distinct GTM functions hired fractionally. */
  functions: string[];
  /** Members who worked there (any engagement or story). Good for intros. */
  operators: number;
  /** Fractional engagements that started in the last two years. */
  recent: number;
}

export interface CompanyRec {
  id: string;
  name: string;
  /**
   * The company has an active open role and the viewer hasn't unlocked it: `name` is
   * HIDDEN_COMPANY, website, LinkedIn and About come back locked, HQ is cut to its region and
   * there is no logo. Unlock with { type: "unlock", entity: "company", id, field: "identity" }.
   * That one credit also opens the role and the posting of each open role there.
   */
  hidden?: boolean;
  /** Domain to draw the logo from (Website, or a looked-up domain). */
  iconDomain: string | null;
  /** Keyed by company field: website, industry, employees, revenue, hq, linkedin, about. */
  cells: Record<string, Cell>;
  friendly: Friendly;
  engagements: EngagementRec[];
  /** Company-level people (decision makers). People tied to an engagement are under that engagement. */
  people: PersonRec[];
  following: boolean;
  /** Fact counts across the company, its engagements and people. */
  facts: { known: number; locked: number; missing: number };
  updatedAt: string | null;
  /** The viewer added something here. */
  mine: boolean;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  title: string;
  /** The viewer's GTM function (from onboarding or their title). */
  function: string | null;
  /** What they came for (onboarding). */
  goal: string | null;
  onboarded: boolean;
  credits: number;
  /** Credits earned in the last 24 hours, and the cap. */
  earned24h: number;
  earnCap: number;
  /** When earning reopens if at the cap (ISO), else null. */
  earnResetsAt: string | null;
  /** Bonus credits earned at the cap and waiting for room under it (paid automatically). */
  held: number;
  admin: boolean;
  /** Personal sign-in link token, and invite code for referrals. */
  token: string;
  inviteCode: string;
  /** Members who joined from my invite link. */
  invited: number;
  /** Invites that paid out (the invitee added a first fact). */
  invitesPaid: number;
  /** I joined from an invite and the bonus is still waiting for my first fact. */
  invitePending: boolean;
  /** Facts this member added, and unlocked. */
  added: number;
  unlocked: number;
  /** Weekly email of new open roles (on unless they turned it off). */
  digest: boolean;
  /** Asked to be told when Pro is ready. */
  proInterest: boolean;
  /** Rates this member shared for the benchmarks only. Never shown on a record or to anyone else. */
  benchRates: BenchRate[];
}

export interface BenchRate {
  id: string;
  /** The seat it is about, when shared from one of the member's own seats. */
  engagementId: string | null;
  function: string;
  kind: "monthly" | "hourly";
  /** Dollars a month or dollars an hour. */
  amount: number;
}

export interface LedgerRow {
  at: string;
  delta: number;
  reason: string;
  company: string;
  field: string;
}

/** One benchmark cell: values only once at least `min` rates are on file, so none can be traced back. */
export interface RateStat {
  n: number;
  /** Rates this group needs before it shows numbers: 5, or 20 when it includes Rate Index data. */
  min: number;
  p25?: number;
  median?: number;
  p75?: number;
}
export interface BenchmarkRow {
  function: string;
  /** Client revenue band at the time of the seat (RN_REVENUE), or "All". */
  revenue: string;
  /** The group includes points from Revenue Nomad's Rate Index (survey and contract data). */
  indexed: boolean;
  /** Monthly retainers, in dollars a month. */
  monthly: RateStat;
  /** Hourly rates, in dollars an hour. */
  hourly: RateStat;
}
export interface Benchmarks {
  /** The floor for a group with no Rate Index data (5). Each RateStat carries its own `min`. */
  minN: number;
  /** Rates on file that could be read as monthly or hourly. */
  total: number;
  rows: BenchmarkRow[];
}

export interface View {
  demo: boolean;
  me: Me | null;
  /** Signed out: companies come back with every gated cell locked and people names hidden. */
  companies: CompanyRec[];
  stats: {
    companies: number;
    engagements: number;
    people: number;
    fractionalFriendly: number;
    openRoles: number;
    members: number;
    facts: number;
    /** Credits a new member starts with. */
    starter: number;
  };
  ledger: LedgerRow[];
  /**
   * Admins: reported facts. A fact is hidden for everyone once two members report it; until
   * then only its reporter sees it as under review.
   */
  reported: {
    entity: Entity;
    id: string;
    field: string;
    record: string;
    label: string;
    value: string;
    /** The company the record is on (for "Open record"). */
    companyId: string;
    /** Who added the fact: a member's name, or "Seed data". */
    addedBy: string;
    /** Names of the members who reported it. */
    reporters: string[];
    /** ISO time of the latest report. */
    reportedAt: string | null;
  }[];
  /** Whether sign-in emails can be sent (an email provider is configured). */
  email: boolean;
  /** Rate benchmarks by function and client revenue band. Sent to signed-in members only. */
  benchmarks?: Benchmarks;
  /** The weekly scan of open fractional GTM roles. Sent to signed-in members only. */
  scan?: ScanSummary;
  /** Pilot metrics. Admins only. */
  admin?: AdminStats;
}

export interface ScanSummary {
  lastRunAt: string | null;
  /** Open roles on file now, opened in the last 7 days, and closed in the last 30. */
  openNow: number;
  opened7: number;
  closed30: number;
  /** Open roles in the viewer's function that opened in the last 7 days. */
  mine7: number;
  /** The weekly email goes out after a scan: email is set up and RN_DIGEST is not 0. */
  digest: boolean;
}

export interface AdminStats {
  members: { total: number; joined: number; onboarded: number; active7: number; active30: number };
  credits: { atZero: number; low: number; median: number };
  /** Facts added and unlocked, all time and in the last 7 days. */
  activity: { adds: number; unlocks: number; adds7: number; unlocks7: number };
  /** Members who hit zero credits while trying to unlock, and how many times. */
  walls: { members: number; hits: number };
  /** Pro waitlist: who asked, who saw the offer, and where they clicked. */
  pro: { interested: number; views: number; byWhere: Record<string, number> };
  topUnlocked: { field: string; n: number }[];
  topAdded: { field: string; n: number }[];
  scan: { lastRunAt: string | null; openNow: number; opened7: number; closed30: number; sources: { source: string; fetched: number; matched: number; error?: string }[] };
  digest: { enabled: boolean; lastSentAt: string | null; sent: number; optedOut: number };
  /** Members linked to a seat on file, and facts still missing on those seats. */
  seats: { linkedMembers: number; factsMissing: number };
  benchmarks: { memberRates: number; privateRates: number; indexRates: number };
}

export type Action =
  /** Add a missing fact to a company, engagement or person. */
  /** `memberId` (seat holder only): the member picked from the search, which links the seat to them. */
  | { type: "fill"; entity: Entity; id: string; field: string; value: string; memberId?: string }
  | { type: "unlock"; entity: Entity; id: string; field: string }
  /**
   * Unlock several facts in one go (e.g. a whole engagement). Costs 1 credit each. A hidden
   * company is one purchase with the role and posting of each open role there: asking for the
   * company (`identity`), such a role or such a posting buys all of them for 1 credit.
   */
  | { type: "unlockMany"; items: { entity: Entity; id: string; field: string }[] }
  /**
   * Add a company (one click from a URL) and optionally an engagement and people there.
   * A company is never duplicated: same website, else same name, is the same company.
   */
  | {
      type: "add";
      company: string;
      website?: string;
      companyFields?: Record<string, string>;
      /** Add the details to this engagement instead of matching one. */
      engagementId?: string;
      /** Force a new engagement under the company (unless an empty one is there to fill). */
      newEngagement?: boolean;
      engagementFields?: Record<string, string>;
      /** The member picked as the seat holder (with engagementFields.operator). */
      operatorMemberId?: string;
      people?: Record<string, string>[];
    }
  /** Add a person at a company, optionally tied to one engagement. */
  | { type: "addPerson"; companyId: string; engagementId?: string | null; person: Record<string, string> }
  | { type: "follow"; companyId: string; on: boolean }
  /** Onboarding answers. */
  | { type: "profile"; function?: string; goal?: string; title?: string }
  | { type: "report"; entity: Entity; id: string; field: string }
  /** Confirm a value you can see is correct (one confirmation per member per value). */
  | { type: "verify"; entity: Entity; id: string; field: string }
  | { type: "review"; entity: Entity; id: string; field: string; decision: "keep" | "remove" }
  /** Admins: remove a fact a member added, with no report needed. Credits go back the way a review removal does. */
  | { type: "adminRemove"; entity: Entity; id: string; field: string }
  /** Admins: remove every fact this member added (`memberId` is a public id), their benchmark-only rates and the empty records left behind. */
  | { type: "adminRemoveMember"; memberId: string }
  /**
   * Share a rate for the benchmarks only. It counts in the medians and is never shown on a
   * record or to another member. Earns 1 credit (inside the daily cap). One per seat.
   */
  | { type: "benchRate"; engagementId?: string; function?: string; pricing: "Monthly retainer" | "Hourly"; rate: string; revenue?: string }
  | { type: "benchRateRemove"; id: string }
  /** "This isn't me": unlink the viewer from a seat matched to them by name. */
  | { type: "notMine"; engagementId: string }
  /**
   * Product signals for the pilot: hitting zero credits on an unlock ("wall"), seeing the Pro
   * offer ("pro_view") and asking to hear about Pro ("pro_interest"). `where` names the place.
   */
  | { type: "signal"; name: "wall" | "pro_view" | "pro_interest"; where: string }
  | { type: "settings"; digest?: boolean }
  /** Admins: run the open-role scan now. */
  | { type: "scanNow" };

/**
 * What POST { action } returns. `cells` are the cells the action changed, as the actor now
 * sees them (ids are the public ids the view uses), and `me` is the actor's new counts, so
 * the client can update the screen without waiting for a full GET.
 */
export type ActionResult = {
  message: string;
  /** The record the action touched (a public id). */
  id?: string;
  capped?: boolean;
  cells?: { entity: Entity; id: string; field: string; cell: Cell }[];
  me?: Pick<Me, "credits" | "earned24h" | "earnResetsAt" | "held" | "added" | "unlocked">;
};

export const GOALS = [
  { key: "friendly", label: "Find fractional-friendly companies" },
  { key: "adjacent", label: "See who hired fractionals in other GTM functions" },
  { key: "intro", label: "Find a fractional who can share intel or an intro" },
] as const;
