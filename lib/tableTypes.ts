/**
 * The read model Trading Post's API returns, and the actions it accepts.
 * Shared by server (lib/table.ts) and client (no Node imports).
 */
import type { Entity } from "./tableFields";

/**
 * What one field looks like to the viewer.
 * - empty: nobody has added it yet (adding it earns a credit)
 * - locked: someone added it; unlocking costs 1 credit. Never carries the value.
 * - value: visible. `mine` = the viewer added it; `ver` = confirmations (our own
 *   records count as one); `iv` = the viewer confirmed it; `system` = set by the system.
 * - reported: under review. Two members' reports hide a fact for everyone until an admin
 *   reviews it; one report hides it only for that reporter (`mine` is then false).
 */
export type Cell =
  | { s: "empty" }
  | { s: "locked"; ver: number }
  | {
      s: "value";
      v: string;
      mine?: boolean;
      ver: number;
      iv?: boolean;
      system?: boolean;
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
}

export interface LedgerRow {
  at: string;
  delta: number;
  reason: string;
  company: string;
  field: string;
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
}

export type Action =
  /** Add a missing fact to a company, engagement or person. */
  /** `memberId` (seat holder only): the member picked from the search, which links the seat to them. */
  | { type: "fill"; entity: Entity; id: string; field: string; value: string; memberId?: string }
  | { type: "unlock"; entity: Entity; id: string; field: string }
  /** Unlock several facts in one go (e.g. a whole engagement). Costs 1 credit each. */
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
  | { type: "review"; entity: Entity; id: string; field: string; decision: "keep" | "remove" };

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
