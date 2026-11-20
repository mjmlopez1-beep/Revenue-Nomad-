/**
 * The read model Merlin's API returns, and the actions it accepts.
 * Shared by server (lib/table.ts) and client (no Node imports).
 */
import type { Entity } from "./tableFields";
import type { RadarStats } from "./radar/types";
import type { CompanyLeads, LeadersRunSummary } from "./leaders/types";
import type { FundingAdminStats } from "./funding/types";

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
 *   the fact for everyone at once. `byMe`: the viewer is one of the members who reported it
 *   (so the screen can say "You reported this"). Left out otherwise.
 */
export type Cell =
  | { s: "empty" }
  | { s: "locked"; ver: number; from?: "records" | "posting" | "research" }
  | {
      s: "value";
      v: string;
      mine?: boolean;
      ver: number;
      iv?: boolean;
      system?: boolean;
      /**
       * Where a fact came from when no member added it: our records, the job posting, Revenue Nomad research (a company the weekly scan
       * added, filled from our records), or the company's own website (an About text read from its homepage, lib/about: "Company website").
       */
      from?: "records" | "posting" | "research" | "website";
      /** The viewer spent a credit to see this value (it counts in their Unlocked list). Free values never carry it. */
      paid?: boolean;
      /** Seat holder only: the viewer claimed this seat from the seat scan (claimSeat), so it reads "You claimed this". */
      claimed?: boolean;
      /**
       * Seat holder only: a name from public profiles that nobody has verified yet (the person
       * didn't claim the seat, two members didn't confirm it and no admin did). The app shows a
       * Verify button beside it. Sent only on a value, so only to a viewer who can see the name.
       */
      unverified?: boolean;
      /**
       * Seat holder only: the name belongs to a Merlin member who has signed in (their
       * title; `you` when it's the viewer). Left out for a member who never signed in, the same
       * test the seat holder picker uses, so "Member" always means someone on Merlin now.
       */
      member?: { title: string; you?: boolean };
      /**
       * Company About only: the company has an About the viewer can see, but the table leaves its
       * text out (`v` is ""). GET /api/table?about=<companyId> returns the cell whole, as the
       * table used to carry it (lib/table.ts aboutCells, which server-side readers call too).
       */
      lazy?: true;
    }
  | { s: "reported"; mine: boolean; byMe?: boolean };

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
   * A seat Revenue Nomad found (source "Seat scan") that no member has claimed: nobody is named on
   * it, or the name on it came from public profiles and is unverified (Cell.unverified). Its
   * fractional is not on Merlin yet. The seat holder cell is empty ("Not on Merlin yet") or locked
   * like any named seat's, and is never added to. A member who held it claims it ("claimSeat").
   * Left out on every other seat.
   */
  claimable?: boolean;
  /** The viewer said this seat is theirs ("This is me") and the name on it isn't theirs: an admin is checking. */
  claimWaiting?: boolean;
  /**
   * The seat's title reads below Lead: a Manager or Staff title ("Fractional Finance Manager",
   * "Fractional Content Engineer", isBelowLead in lib/seniority.ts). The server reads the stored
   * title, whether or not the viewer can see it, and sends only this flag, never the title.
   * "Recently hired" and everything built on it count leadership seats only (isLeaderHire in
   * app/post/model.ts). The seat still counts as a hire everywhere else (isHire). Left out on every
   * other seat.
   */
  belowLead?: boolean;
  /**
   * The viewer can "Invite to connect" this seat's holder: they see the name, and the holder is not
   * a member who has signed in (a name from public profiles, or a member who never signed in), so
   * the seat's claim link is how they get on Merlin and connect. `path` is that link with the
   * viewer's invite code ("/claim/<token>?ref=<code>", lib/claimToken.ts). `at`: when the viewer
   * sent it (one record per member and seat). Left out on every other seat, and on a server
   * without the seed key (no claim links).
   */
  invite?: { path: string; at?: string };
  /**
   * Open roles found by the weekly scan (and open roles from the seed): the day the posting
   * was first seen and the day it stopped being listed (ISO dates). Free to see and to filter on.
   * Both are left out on a seat that was never listed as an open role; `closed` is null while
   * the role is still open.
   */
  opened?: string | null;
  closed?: string | null;
  /**
   * The same two moments as full ISO times, to show in the viewer's own time zone. `opened` is
   * the day the scan first saw the posting, which is not the day it was posted.
   */
  openedAt?: string | null;
  closedAt?: string | null;
  /** The ISO day the job board says the role was posted, when it gives one. */
  posted?: string | null;
  /** ISO time a scan last saw the posting listed. */
  lastSeen?: string | null;
  /**
   * Still open on file, but a clean scan of its board has run since it was last seen and did
   * not list it ("Not seen in the last scan"). Left out of ScanSummary.openNow.
   */
  unseen?: boolean;
}

export interface Friendly {
  /** 0 to 100. */
  score: number;
  tier: "High" | "Medium" | "Low" | null;
  /**
   * Seats held fractionally: a fractional type (Fractional, Interim, Advisory, Project), a seat a
   * member published, or a seat a member added with no type. Open roles and postings that came
   * down with no seat holder named are not hires and are not counted.
   */
  fractional: number;
  /** Open fractional roles (demand scans or status Open role). */
  open: number;
  /** Distinct GTM functions hired fractionally (the seats counted in `fractional`). */
  functions: string[];
  /** Members who worked there (any engagement or story). Good for intros. */
  operators: number;
  /** Fractional engagements that started in the last two years. */
  recent: number;
  /**
   * GTM functions of the open roles there now. An open role is a posting, not a hire, so its
   * function is here and not in `functions` (show these as "Hiring now"). A posting that closed
   * with nobody named as its seat holder counts in neither list. Empty when nothing is open.
   */
  hiring?: string[];
}

export interface CompanyRec {
  id: string;
  name: string;
  /**
   * The company has an active open role and the viewer hasn't unlocked it: `name` is
   * HIDDEN_COMPANY, website and LinkedIn come back locked, the About's text (GET ?about=) comes
   * without the company's name, web address, links and emails (lib/scan/clean.ts aboutWithout),
   * HQ is cut to its region and `iconDomain` is null: the page draws the logo from GET
   * /api/logo/<id> (lib/logo.ts), which never names the domain. Unlock with { type: "unlock", entity: "company", id, field: "identity" }.
   * That one credit also opens the role, the posting and the posted rate of each open role there.
   */
  hidden?: boolean;
  /** Domain to draw the logo from (Website, or a looked-up domain). */
  iconDomain: string | null;
  /** Keyed by company field: website, industry, employees, revenue, hq, linkedin, about. */
  cells: Record<string, Cell>;
  /**
   * The country the HQ names ("United States", "United Kingdom"), read from the HQ however it
   * was typed (lib/geo.ts normalizeHq). Null when there is no HQ or it names no place. Sent for a
   * hidden company too (the HQ cell keeps only its region there).
   */
  country?: string | null;
  /** The US state ("California") or the region or province ("Ontario", "England") the HQ names, else null. */
  region?: string | null;
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
  /**
   * The viewer created this company (added it to Merlin). Its pick lists earn without the
   * daily limit of 5 (Me.sellEarnLeft), as on a company where they hold a seat. Left out otherwise.
   */
  added?: boolean;
  /**
   * The viewer paid to see this company while it was hidden (Unlock company, or the role or the
   * posting of its open role, which is the same purchase). Left out otherwise, also for a company
   * the viewer sees because they added to it or held a seat there.
   */
  unlocked?: boolean;
  /**
   * Named for one answer only: the viewer looked this company up by its exact name or website
   * (GET ?find=), and the tables still lock it. The page shows it in that search and in the record
   * opened from it, never in a table. Unlock company keeps it named there.
   */
  found?: true;
  /**
   * Who leads each function, read from the company's own website (lib/leaders): the function,
   * level, full-time or fractional, since when, and the page (left out at a hidden company). Never
   * a name. Free, as the company's basics are. Left out when nothing is on file.
   */
  leads?: CompanyLeads;
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
  /** Never negative. When the ledger is below zero (a fact was removed after its credit was spent) the shortfall is in `owed`. */
  credits: number;
  /** Credits owed when the ledger is below zero, else 0. Earning pays it off first. */
  owed?: number;
  /**
   * Unlocks left today under the daily limit: 100 in any 24 hours, 25 in an account's first 24
   * hours (null = no limit in play). Lower than `credits` means the limit binds before the balance.
   */
  unlocksLeft?: number | null;
  /**
   * Company pick-list answers (industry, employees, revenue and the four under "How they sell")
   * that can still earn a credit today: 5 a day. Not counted on a company the member added or
   * holds a seat at.
   */
  sellEarnLeft?: number;
  /** Credits earned in the last 24 hours, and the cap. */
  earned24h: number;
  earnCap: number;
  /** When earning reopens if at the cap (ISO), else null. */
  earnResetsAt: string | null;
  /** Bonus credits earned at the cap and waiting for room under it (paid automatically). */
  held: number;
  /** An admin (RN_ADMIN_EMAILS). False while an admin sees the table as a member (`asMember`). */
  admin: boolean;
  /**
   * An admin who switched on "See it as a member": this view was built as if they were not an
   * admin (hidden companies hidden, no review list, no pilot metrics). Their actions still run
   * as the admin. Set with the cookie rn_as_member=1 or GET /api/table?as=member; ignored for
   * anyone who is not an admin.
   */
  asMember?: boolean;
  /** Personal sign-in link token, and invite code for referrals. */
  token: string;
  inviteCode: string;
  /** Members who joined from my invite link. */
  invited: number;
  /** Invites that paid out (the invitee added a first fact). */
  invitesPaid: number;
  /** I joined from an invite and the bonus is still waiting for my first fact. */
  invitePending: boolean;
  /**
   * The invite loop, for the invitee: who invited them, while their invite bonus waits for their
   * first fact (onboarding's first step says so). `both`: the inviter gets REFERRAL_BONUS too (they
   * are under REFERRAL_LIMIT), else only the invitee does. Left out otherwise.
   */
  invitedBy?: { first: string; both: boolean };
  /**
   * The invite loop, for the inviter: fractionals who joined from their invite and that the app
   * hasn't shown them yet (newest last, the last 30 days). `id` is the invitee's public id, for
   * the joinedSeen action. `both`: they both get REFERRAL_BONUS when the invitee adds a first fact
   * (the invitee's bonus is still waiting and the inviter is under REFERRAL_LIMIT). A first name
   * only, never an email.
   */
  joined?: { id: string; first: string; at: string; both: boolean }[];
  /** Facts this member added, and unlocked. */
  added: number;
  unlocked: number;
  /** Seat holders (who held a seat) and hidden companies this member paid to see, for Get started. */
  holdersUnlocked?: number;
  companiesUnlocked?: number;
  /** Weekly email of new open roles (on unless they turned it off). */
  digest: boolean;
  /** Asked to be told when Pro is ready. */
  proInterest: boolean;
  /** Rates this member shared for the benchmarks only. Never shown on a record or to anyone else. */
  benchRates: BenchRate[];
  /** Conversations with a message the member hasn't read yet (Messages). */
  unread?: number;
  /** An email when a member messages them (on unless they turned it off). Sent only while email is on. */
  messageEmail?: boolean;
  /** Listed for other members in Referral partners (on unless they turned it off in Your profile). */
  partners?: boolean;
  /** The next-client radar by email and Slack (on unless they turned it off in Your profile or with the radar email's link). */
  radar?: boolean;
  /** Who they hunt (onboarding, and the Ideal Fractional Profile pill over the table). Null until they say. */
  icp?: Icp | null;
  /**
   * Their saved views and saved searches, newest last. One list with the Claude connector's
   * alerts (lib/mcp/alerts.ts): a view saved in the app shows there, and one saved there shows here.
   */
  savedViews?: SavedViewRec[];
  /**
   * The fractional functions this member says usually get hired before them (onboarding's "Which
   * fractional usually gets hired before you?", and Your profile), up to 3 (BEFORE_MAX). `[]` is
   * "Not sure". Left out when they were never asked (members from before the question). Only the
   * member reads it as a list: anyone else only ever sees counts, once 20 members of a function answered.
   */
  before?: string[];
  /**
   * The member's first view: the saved view onboarding made ("Your first view"). The table opens on
   * it when the address names no place, while it is still saved. Null otherwise.
   */
  firstView?: string | null;
  /** Onboarding answers so far, while the member hasn't finished it, so another tab or device picks up there. Null otherwise. */
  draft?: OnboardDraft | null;
  /** Onboarding's "How many clients do you have now?" (CLIENT_COUNTS), and "Are you looking for a new client?". Null when not answered. */
  clientCount?: string | null;
  looking?: boolean | null;
  /** Their plan, only while billing is live (RN_BILLING=1 with Stripe set up). Left out otherwise: nothing is gated. */
  plan?: PlanView;
}

/** Onboarding's answers to "How many clients do you have now?". */
export const CLIENT_COUNTS = ["0", "1", "2", "3", "4+"] as const;

/**
 * A member's plan as the app shows it (lib/billing). Dates are ISO. Prices and the plans show on
 * any plan, the trial included: Pro can be bought at any point in it.
 */
export interface PlanView {
  name: "free" | "trial" | "pro";
  /** The trial: when it ends, whole days left (1 on the last day), and whether it was extended. */
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  trialExtended: boolean;
  /** A trial ran (it may be over). */
  hadTrial: boolean;
  /** In the trial's last 3 days: the banner and the trial-ending pitch. */
  ending: boolean;
  /** Paid Pro: paid to this date, monthly or yearly, set to end (cancelAt), paused. */
  proUntil: string | null;
  interval: "month" | "year" | null;
  cancelAt: string | null;
  /** "now": paused (Free, no charge) until pausedUntil. "booked": the pause starts at pausedFrom. */
  pause: "now" | "booked" | null;
  pausedFrom: string | null;
  pausedUntil: string | null;
  /** A paid subscription is running (cancel, pause and the portal apply). */
  subscribed: boolean;
  /** The member has a Stripe customer: the portal shows invoices and the card. */
  portal: boolean;
  /**
   * Buying Pro now, on the trial with more than 48 hours left: the first charge lands on this date
   * (the trial's end) and the days left are kept. Null: charged at checkout.
   */
  firstChargeAt: string | null;
  /** Bought during the trial: paid Pro starts on this date with its first charge. Nothing is charged before it. */
  proStartsAt: string | null;
  /** The top-up can be bought (its price is set up). */
  topup: boolean;
  /** "Not now" to "Are you looking for a new client?": the softer pitch, never a hard sell. */
  notLooking: boolean;
  /** The annual plan framed by their own rate ("Less than an hour of your time a month."), when they have a rate. */
  annualLine: string | null;
  prices: { month: number; year: number; topup: number; topupCredits: number; proCredits: number };
  /** What Free allows now (null: no limit, on Pro). */
  limits: { savedViews: number | null; claudePerDay: number | null };
}

/** The most functions "Which fractional usually gets hired before you?" takes. */
export const BEFORE_MAX = 3;

/**
 * Onboarding's answers so far (the onboardDraft action), saved after each step. `before` null is
 * not answered yet, `[]` is "Not sure". `views`: the saved views the first view step made (the
 * first view, then the open roles one), and `saved` what they were saved as, so going back and
 * saving again replaces them. `at`: when the browser that saved it did (its own clock).
 */
export interface OnboardDraft {
  step: number;
  function: string | null;
  title: string;
  icp: Icp | null;
  before: string[] | null;
  /** "Also show open <function> roles" on the first view step. */
  roles: boolean;
  /** "Email me new ones each week" on the first view step. */
  email: boolean;
  /** "How many clients do you have now?" (CLIENT_COUNTS) and "Are you looking for a new client?" on step 1, null until answered. */
  clientCount?: string | null;
  looking?: boolean | null;
  /** Clients typed on Find your seats: a company's public id, or "name:" and a name we don't have. */
  clients: string[];
  views: string[];
  saved: string | null;
  at: string;
}

/**
 * A member's Ideal Fractional Profile (IFP): the companies they want as clients. Each list is "any of these", and an empty list means any. Values are
 * the pick lists' spelling (RN_INDUSTRIES, RN_EMPLOYEES, RN_REVENUE); countries as the company
 * records spell them ("United States"). An empty `countries` is "Anywhere".
 */
export interface Icp {
  industries: string[];
  employees: string[];
  revenue: string[];
  countries: string[];
}

/** What a saved view matches in the weekly email: open roles by their free facts only, or new hires for a view that follows them. */
export interface SavedViewCriteria {
  function?: string;
  functions?: string[];
  industry?: string[];
  employees?: string[];
  revenue?: string[];
  hq?: string;
  country?: string[];
  fractionalFriendly?: boolean;
  /**
   * "Recently hired" (Filters.hiredFn and .hiredWithin, lib/hired.ts): the view follows hires in
   * these functions (none: any) with a start in the last `hiredWithin` months (0: any time). The
   * weekly email and alerts then list companies that newly match, never open roles.
   */
  hiredFn?: string[];
  hiredWithin?: number;
}

/** One saved view (Save this view) or saved search (the connector's alerts). */
export interface SavedViewRec {
  id: string;
  name: string;
  /** The table's place as an address query ("v=hiring&f=fn:Sales"), or null for a search saved in Claude. */
  place: string | null;
  criteria: SavedViewCriteria;
  /** Email me new matches each week. */
  email: boolean;
  createdAt: string;
}

/* ---------- messages between members ---------- */

/** One message in a conversation. `mine`: the viewer wrote it. Never carries an email address or a member id. */
export interface MessageRec {
  id: string;
  mine: boolean;
  at: string;
  text: string;
  /** The viewer reported this message (it goes to the admins' review list). */
  reported?: boolean;
  /** An admin removed it after a report. `text` is then empty. */
  removed?: boolean;
}

/**
 * A conversation between two members about one seat. GET /api/table?messages=1 returns the
 * viewer's own, newest first. `started`: the viewer started it (they unlocked the seat holder);
 * otherwise the viewer is the seat holder it was about. Ids are public ids.
 */
export interface ConversationRec {
  id: string;
  started: boolean;
  /**
   * partners: started from Referral partners, about no seat (`about` has empty ids). invite: opened
   * by itself when a seat holder claimed their seat through the other member's invite (Invite to
   * connect); `started` is the inviter. Left out on a conversation about a seat a member unlocked.
   */
  kind?: "partners" | "invite";
  /** The other member: name, title and public id. Never their email or phone. */
  with: { id?: string; name: string; first: string; title: string };
  about: {
    companyId: string;
    engagementId: string;
    /** The company as the viewer sees it (HIDDEN_COMPANY, "Locked company", while it is locked for them). */
    company: string;
    /** The seat as the viewer can see it: its role, else its function, else null. */
    seat: string | null;
    /** "2023 to 2024", "2023 to now", or null. */
    years: string | null;
  };
  messages: MessageRec[];
  /** Messages from the other member the viewer hasn't read. */
  unread: number;
  status: "open" | "closed";
  /** Who closed it ("Not now", or a block). */
  closedBy?: "you" | "them";
  /** The viewer blocked the other member. */
  blocked?: boolean;
  /** The viewer can send a message here now. */
  canSend: boolean;
  updatedAt: string;
}

/** Admins: a reported message. Only that one message, never the rest of its conversation. */
export interface ReportedMessage {
  id: string;
  text: string;
  /** Who wrote it and who reported it (names). */
  from: string;
  reporter: string;
  at: string;
  reportedAt: string;
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

/**
 * One benchmark figure. It counts people, not rows: a member counts once per group however many
 * rates they have in it (with the middle of them), a Rate Index row counts once, and so does a
 * record of ours. Amounts are rounded: dollars a month to the nearest 250 and dollars an hour to
 * the nearest 5, or to the nearest 1,000 and 25 while the figure has fewer than
 * `Benchmarks.rangeN` contributors.
 *
 * Only contributors who count are in a figure at all: seed members, our records, Rate Index rows,
 * and joined accounts that proved their email or had a fact confirmed by two members. A viewer's
 * own rates are left out of the figures that viewer sees (`withoutYours`).
 */
export interface RateStat {
  /**
   * Different contributors. When `median` is sent: everyone in the figure. Below the floor:
   * the contributors counted toward `min`, for the progress line ("3 of 5"), so `min - n` more
   * are needed. Rates shared privately and rates on records are counted apart (the larger count
   * is sent): a private rate joins a figure only with 5 private ones in it.
   */
  n: number;
  /** Trusted contributors this figure needs before it shows numbers: 5, or 20 when it counts Rate Index data. */
  min: number;
  /**
   * This figure includes Rate Index data (when shown), or is counting toward the 20 (when not).
   * False when it is, or will be, made from member rates and our own records alone.
   */
  indexed?: boolean;
  /**
   * The middle half. Sent only when the figure has at least `Benchmarks.rangeN` trusted
   * contributors (and 10 private ones, when it includes private rates). Check for it, not for `n`.
   */
  p25?: number;
  median?: number;
  p75?: number;
  /**
   * The viewer has a rate in this group, and it is left out of what they see here (n included),
   * so nothing they share can move a number they can read. Other members' figures include it.
   */
  withoutYours?: boolean;
}
export interface BenchmarkRow {
  function: string;
  /** Client revenue band at the time of the seat (RN_REVENUE), or "All". */
  revenue: string;
  /** Either figure on the row is `indexed` (see RateStat). A group with a few survey rows and no figure counting them is not. */
  indexed: boolean;
  /** Monthly retainers, in dollars a month. */
  monthly: RateStat;
  /** Hourly rates, in dollars an hour. */
  hourly: RateStat;
}
export interface Benchmarks {
  /** The floor for a group with no Rate Index data (5). Each RateStat carries its own `min`. */
  minN: number;
  /** Trusted contributors a figure needs before its range (p25 to p75) is sent: 10. Below it, the median alone. */
  rangeN?: number;
  /** Rates on file that could be read as monthly or hourly. */
  total: number;
  rows: BenchmarkRow[];
  /** Free while billing is live: medians by function only, no ranges and no client-size rows (Pro has them). */
  limited?: boolean;
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
    /** Open roles first seen in the last 7 days (the landing page's live line). Older servers leave it out. */
    openedWeek?: number;
    members: number;
    facts: number;
    /** Credits a new member starts with. */
    starter: number;
  };
  ledger: LedgerRow[];
  /**
   * Admins: reported facts. A fact is hidden for everyone once two members report it; until
   * then only its reporter sees it as under review. A seat holder's report on their own seat, and
   * "This isn't me" on a name a member added, hide the fact at once and are listed here too.
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
    /**
     * Hidden from every member until an admin decides: two reports, a seat holder's report on
     * their own seat, or "This isn't me" on a name a member added. False while it is hidden only
     * for its reporters (one report, or a posting that is still listed).
     */
    hidden?: boolean;
    /** ISO time of the latest report. */
    reportedAt: string | null;
  }[];
  /** Whether sign-in emails can be sent (an email provider is configured). */
  email: boolean;
  /**
   * Where a person can write to Revenue Nomad, read from RN_SUPPORT_EMAIL and RN_INTRO_EMAIL at
   * run time (never baked into a build). `support`: sign-in help, questions and feedback.
   * `intro`: asking for an intro to a seat holder. Null when not set. Sent signed out too, for
   * the sign-in screens.
   */
  contact?: { support: string | null; intro: string | null };
  /** Rate benchmarks by function and client revenue band. Sent to signed-in members only. */
  benchmarks?: Benchmarks;
  /** The weekly scan of open fractional GTM roles. Sent to signed-in members only. */
  scan?: ScanSummary;
  /** Pilot metrics. Admins only. */
  admin?: AdminStats;
  /** Admins: messages members reported, waiting for a decision. */
  reportedMessages?: ReportedMessage[];
  /**
   * The table's version when this view was built, "<boot>:<commits>" (viewVersion in lib/table.ts).
   * An action's answer carries the version after it, so the page can tell whether other members
   * changed the table since (more than one commit later, or a restart). Older servers leave it out.
   */
  version?: string;
}

export interface ScanSummary {
  lastRunAt: string | null;
  /** The last run in which at least one job board answered cleanly. This is the "last scan" members see. */
  lastOkAt?: string | null;
  /**
   * Open roles on file now (not counting those a clean scan no longer saw), opened in the last
   * 7 days (first seen this week, and posted in the last 14 days when the board gives a date),
   * and closed in the last 30.
   */
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
  /**
   * The 20 members with the most facts added in the last 7 days, most first. Counts facts on
   * records that still stand (a removed fact drops out). `privateRates` is how many
   * benchmark-only rates the member has on file, never an amount. `memberId` is a public id.
   */
  recentAdds?: { memberId: string; name: string; adds24h: number; adds7: number; privateRates: number; lastAt: string | null }[];
  /**
   * Members who picked themselves as the seat holder of an open role in the last 30 days, newest
   * first. `closed`: the claim closed the role for everyone (the account counts: a seed member,
   * a proven email, or a fact two members confirmed). Otherwise the name was kept and the role
   * stayed open. `standing`: the name is still on the seat. `company` is the real name (admins
   * see every company). `memberId` and `engagementId` are public ids.
   */
  roleClaims?: { memberId: string; name: string; company: string; engagementId: string; at: string; closed: boolean; standing: boolean }[];
  /**
   * Seats from the seat scan a member claimed as theirs in the last 30 days, newest first.
   * `standing`: their name is still on the seat (not released or removed). Public ids.
   */
  seatClaims?: { memberId: string; name: string; company: string; engagementId: string; at: string; standing: boolean }[];
  /**
   * Seat-holder names from public profiles. `shown`: unverified names show now (the switch is on and
   * the table has fewer than `limit` seats, past and current, not open roles). `on`: the admins'
   * switch. Counts are seats: names still on seats (`onFile`, of which `unverified`), names members
   * claimed, and names taken off. `claims`: "This is me" from members whose own name doesn't match,
   * waiting for an admin, oldest first, with the name on file. Public ids.
   */
  names?: {
    shown: boolean;
    on: boolean;
    limit: number;
    seats: number;
    onFile: number;
    unverified: number;
    claimed: number;
    removed: number;
    claims: { memberId: string; member: string; engagementId: string; company: string; seat: string | null; onFile: string; at: string }[];
  };
  /** Members who hit zero credits while trying to unlock, and how many times. */
  /**
   * Fractional firms, agencies or marketplaces still on the table because a member holds a seat
   * there (lib/firmRemoval.ts). Every other firm is removed. `companyId` is a public id.
   */
  firmReview?: { companyId: string; company: string; reason: string; at: string }[];
  walls: { members: number; hits: number };
  /** Pro waitlist: who asked, who saw the offer, and where they clicked. */
  pro: { interested: number; views: number; byWhere: Record<string, number> };
  /**
   * Billing, while it is live: members on the trial, on Pro (paused counts as Free), on Free;
   * trials that ended and how many of those paid; monthly recurring revenue in cents (a yearly plan
   * counts a twelfth); subscriptions that ended this calendar month; top-ups (all time and this
   * month). Counts and money only.
   */
  /**
   * Lookups by exact name (the action "find"), the last 24 hours: companies looked up (new ones,
   * counted toward the limit), members who looked any up, members at their limit, lookups that
   * matched nothing, and members at that limit.
   */
  finds?: { today: number; members: number; atCap: number; misses: number; missCap: number };
  billing?: {
    trial: number;
    pro: number;
    free: number;
    paused: number;
    trialsEnded: number;
    trialsPaid: number;
    mrrCents: number;
    churnMonth: number;
    topups: number;
    topupCents: number;
    topupsMonth: number;
    paidMonthCents: number;
  };
  topUnlocked: { field: string; n: number }[];
  topAdded: { field: string; n: number }[];
  scan: { lastRunAt: string | null; openNow: number; opened7: number; closed30: number; sources: { source: string; fetched: number; matched: number; error?: string }[] };
  /**
   * Each job board the scan reads. `healthy` is false when its last run failed, matched nothing,
   * or matched under half of `baseline` (its last healthy count). Roles from a board that is not
   * healthy are never closed on its word.
   */
  boards?: { source: string; healthy: boolean; lastOkAt: string | null; baseline: number }[];
  digest: { enabled: boolean; lastSentAt: string | null; sent: number; optedOut: number };
  /** Members linked to a seat on file, and facts still missing on those seats. */
  seats: { linkedMembers: number; factsMissing: number };
  benchmarks: { memberRates: number; privateRates: number; indexRates: number };
  /** Messages between members, counts only (admins never read conversations). */
  messages?: { started: number; replied3d: number; closed: number; blocked: number; reported: number };
  /** The next-client radar (lib/radar), counts only: members with it on, sent today and this week, opens and clicks. */
  radar?: RadarStats;
  /** Crystal Ball's model: observed transitions and the new facts, counts only. */
  radarModel?: NonNullable<RadarStats["model"]>;
  /** Alerts in Slack and webhooks (lib/notify), counts only. */
  integrations?: { slackConnected: number; webhookConnected: number; broken: number; sent: { roles: number; message: number; seat: number; radar: number; test: number }; failed: number };
  /**
   * About texts read from company websites (lib/about). `enabled`: RN_ABOUT=1. `run`: the run under
   * way, else the last one (null before the first). `onFile`: each company's last try. `waiting`:
   * companies with a website and no About that were never tried. `withAbout`: companies with an
   * About from any source, out of `companies`. `reasons`: the most common reasons for a skip or failure.
   */
  about?: {
    enabled: boolean;
    running: boolean;
    run: { startedAt: string; endedAt: string | null; total: number; done: number; filled: number; unchanged: number; skipped: number; failed: number } | null;
    onFile: { filled: number; skipped: number; failed: number };
    waiting: number;
    withAbout: number;
    companies: number;
    reasons: { why: string; n: number }[];
  };
  /**
   * Who leads each function, read from company websites (lib/leaders). `enabled`: RN_LEADERS=1.
   * `run`: the run under way, else the last one. `onFile`: what the state holds, counted per
   * company (companies read, pages read, with a team page, with a press page, none found, failed,
   * left alone by robots.txt, skipped) and per function (found, fractional or interim, full-time).
   * `due`: companies a run would read now. `reasons`: the most common reasons for a skip or failure.
   */
  leaders?: {
    enabled: boolean;
    running: boolean;
    run: LeadersRunSummary | null;
    onFile: { companies: number; read: number; pages: number; team: number; press: number; functions: number; fractional: number; fullTime: number; none: number; failed: number; robots: number; skipped: number };
    due: number;
    /**
     * Coverage: companies with a site of their own to read, read OK in the last 90 days, with a
     * team page read then, the last read, members' reports of a full-time leader, the daily
     * background batch, how many days it takes to read every company due at that batch, and the
     * UTC day it last ran.
     */
    coverage?: { sites: number; known: number; withTeam: number; lastReadAt: string | null; reports: number; dailyBatch: number; daysToCover: number; lastDaily: string | null };
    reasons: { why: string; n: number }[];
  };
  /** Funding events from SEC Form D filings (lib/funding), counts only: the last run, all runs, events in the last 30 days. `enabled`: RN_FUNDING=1. */
  funding?: FundingAdminStats;
}

export type Action =
  /** Add a missing fact to a company, engagement or person. */
  /** `memberId` (seat holder only): the member picked from the search, which links the seat to them. */
  | { type: "fill"; entity: Entity; id: string; field: string; value: string; memberId?: string }
  | { type: "unlock"; entity: Entity; id: string; field: string }
  /**
   * Unlock several facts in one go (e.g. a whole engagement). Costs 1 credit each. A hidden
   * company is one purchase with the role, posting and rate of each open role there: asking for
   * the company (`identity`), or such a role, posting or rate, buys all of them for 1 credit. At a
   * company the member can see, an open role's role, posting and rate are one purchase too.
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
  /**
   * Find a company by its exact name or website (lib/table.ts exactMatches). A match opens the
   * company for the member at no cost, for good (within REVEAL_DAILY_FREE / REVEAL_DAILY_PRO new
   * ones a day); anything else opens nothing. The answer's `found`: "new", "again" or "none".
   */
  | { type: "find"; text: string }
  /** Add a person at a company, optionally tied to one engagement. */
  | { type: "addPerson"; companyId: string; engagementId?: string | null; person: Record<string, string> }
  | { type: "follow"; companyId: string; on: boolean }
  /**
   * "They have a full-time Sales leader": a member's fact about who leads a function at a company
   * they can see, with a title from the pick list (lib/leaders/types.ts memberRoles). It earns 1
   * credit like any fact, and Crystal Ball stops pointing at that function there for everyone.
   * `from`: the Crystal Ball page or the record.
   */
  | { type: "leaderReport"; companyId: string; fn: string; role: string; from?: "radar" | "record" }
  /**
   * Onboarding answers, and Your profile. `before`: up to BEFORE_MAX functions, `[]` for "Not
   * sure" (left out: unchanged). `firstView`: the id of the saved view onboarding made (null takes
   * it off). It marks the member onboarded and drops their onboarding draft.
   */
  | { type: "profile"; function?: string; goal?: string; title?: string; icp?: Icp | null; before?: string[]; firstView?: string | null; clientCount?: string | null; looking?: boolean | null }
  /** Onboarding's answers so far, after each step (null drops them). Nothing changes once the member is onboarded. */
  | { type: "onboardDraft"; draft: OnboardDraft | null }
  /**
   * Saved views, in the same store as the connector's alerts. save: `place` and `criteria` from
   * the table, `name` (else one made from the criteria), `email` (on unless false). A view the
   * member already has (the same place, or for a search saved in Claude the same criteria: see
   * sameView in lib/hunt.ts) is not saved again: the answer says "You saved this view already, as
   * …" and carries that view's `id`. rename: `id` and `name`, cleaned as save cleans it. delete:
   * `id`. restore: put a view just removed back (Undo): `view` as Me.savedViews had it and `at`,
   * its place in the list; it keeps its id. email: turn the weekly email for `id` on or off
   * (`on`). At most 20.
   */
  | {
      type: "savedView";
      op: "save" | "rename" | "delete" | "restore" | "email";
      id?: string;
      name?: string;
      place?: string;
      criteria?: SavedViewCriteria;
      email?: boolean;
      on?: boolean;
      view?: SavedViewRec;
      at?: number;
    }
  | { type: "report"; entity: Entity; id: string; field: string }
  /** Confirm a value you can see is correct (one confirmation per member per value). */
  | { type: "verify"; entity: Entity; id: string; field: string }
  | { type: "review"; entity: Entity; id: string; field: string; decision: "keep" | "remove" }
  /** Admins: remove a fact a member added, with no report needed. Credits go back the way a review removal does. */
  | { type: "adminRemove"; entity: Entity; id: string; field: string }
  /** Admins: remove every fact this member added (`memberId` is a public id), their benchmark-only rates and the empty records left behind. */
  | { type: "adminRemoveMember"; memberId: string }
  /**
   * Share a rate for the benchmarks only. It counts in the medians and is never shown with the
   * member's name or the seat. Earns 1 credit (inside the daily cap). One per seat, at most 3
   * that aren't tied to a seat the member holds, and at most 5 saved in any 24 hours.
   */
  | { type: "benchRate"; engagementId?: string; function?: string; pricing: "Monthly retainer" | "Hourly"; rate: string; revenue?: string }
  | { type: "benchRateRemove"; id: string }
  /**
   * "Is this your seat? Claim it": a seat Revenue Nomad found (EngagementRec.claimable) becomes the
   * viewer's. Their name goes on it (behind the usual lock), it shows on Your seats, and the facts
   * they add there earn as usual. The claim earns nothing. 3 per rolling 24 hours. "This isn't me"
   * gives it back.
   */
  /**
   * Claim a seat from the seat scan. `preview`: claim nothing, return what the seat says (its
   * title, function and dates, as `claim`) so the member can check it is theirs first.
   */
  | { type: "claimSeat"; engagementId: string; preview?: boolean }
  /** "This isn't me": unlink the viewer from a seat matched to them by name. */
  | { type: "notMine"; engagementId: string }
  /**
   * Take back a fact the viewer added (the Undo on the toast, or reopening an answer on Your
   * seats). Allowed while no other member has unlocked or confirmed it: the field opens again and
   * the credit it earned comes off the balance (ledger row "Took back the HQ"). A fact that paid
   * the invite bonus stays (edit it instead), and so does a correction of our records on the
   * viewer's own seat (it earned nothing).
   */
  | { type: "retract"; entity: Entity; id: string; field: string }
  /**
   * Product signals for the pilot: hitting zero credits on an unlock ("wall"), seeing the Pro
   * offer ("pro_view") and asking to hear about Pro ("pro_interest"). `where` names the place.
   */
  | { type: "signal"; name: "wall" | "pro_view" | "pro_interest" | "radar_opened" | "radar_clicked"; where: string }
  /** `partners`: listed in Referral partners for other members (Your profile, "Show me in Referral partners"). */
  | { type: "settings"; digest?: boolean; messageEmail?: boolean; partners?: boolean; radar?: boolean }
  /** The invite loop: the inviter closed the line saying these fractionals joined from their invite (Me.joined ids). It doesn't come back. */
  | { type: "joinedSeen"; ids: string[] }
  /**
   * Invite to connect (EngagementRec.invite): the member sent the seat holder a note with the seat's
   * claim link. One record per member and seat ("Invited Nov 18"): sending again keeps the first date
   * and the latest note. When the holder claims the seat through the link, both get the invite bonus
   * where it applies and a conversation opens with the note as its first message.
   */
  | { type: "invite"; engagementId: string; note?: string }
  /**
   * Messages between members (lib/messages.ts). Start one with the holder of a seat the viewer
   * can see (unlocked, or free) who has signed in. `engagementId` and `conversationId` are public ids.
   */
  | { type: "message.start"; engagementId: string; text: string }
  /** Connect with a member listed in Referral partners (PartnersView.members): a conversation about no seat. `memberId` is a public id. */
  | { type: "message.connect"; memberId: string; text: string }
  | { type: "message.send"; conversationId: string; text: string }
  /** "Not now": closes it. The other side sees that they aren't taking intros right now. */
  | { type: "message.close"; conversationId: string }
  /** Block (or unblock) the other member: they can't start a conversation with the viewer, and this one closes. */
  | { type: "message.block"; conversationId: string; on?: boolean }
  | { type: "message.report"; conversationId: string; messageId: string }
  | { type: "message.read"; conversationId: string }
  /** Admins: decide on a reported message. */
  | { type: "message.review"; reportId: string; decision: "keep" | "remove" }
  /**
   * Admins, seat-holder names from public profiles (Pilot metrics). show: the switch "Show names
   * from public profiles until we reach N seats" (`on`). approve or decline: a member's claim
   * waiting on a seat (`memberId`). verify: the name on file is right. remove: take it off (whoever
   * paid to see it gets the credit back). Ids are public ids.
   */
  | { type: "names"; op: "show"; on: boolean }
  | { type: "names"; op: "approve" | "decline"; engagementId: string; memberId: string }
  | { type: "names"; op: "verify" | "remove"; engagementId: string }
  /** Admins: run the open-role scan now. */
  | { type: "scanNow" }
  /** Admins: fill About texts from company websites now (lib/about; only with RN_ABOUT=1). Runs in the background. */
  | { type: "aboutNow" }
  /** Admins: read who leads each function from company websites (lib/leaders; only with RN_LEADERS=1), the next 200 companies or all of them. Runs in the background. */
  | { type: "leadersNow"; scope?: "next" | "all" };

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
  me?: Pick<Me, "credits" | "earned24h" | "earnResetsAt" | "held" | "added" | "unlocked" | "holdersUnlocked" | "companiesUnlocked" | "owed" | "unlocksLeft" | "sellEarnLeft"> & Partial<Me>;
  /** Message actions: the conversation as the viewer now sees it, and their unread count. */
  conversation?: ConversationRec;
  unread?: number;
  /** find: "new" (opened now), "again" (open for them already) or "none" (no exact match); `ids`: every company it matched; `findsLeft`: new finds left today. */
  found?: "new" | "again" | "none";
  ids?: string[];
  findsLeft?: number;
  /** claimSeat with `preview`: what the unclaimed seat says, for "Is this you?". */
  claim?: { role: string | null; function: string | null; start: string | null; end: string | null; status: string | null };
  /**
   * What the action changed, as the actor now sees it, so the page needn't download the table
   * again (app/api/table/route.ts adds these to the answer of POST { action }). `companies`: the
   * records of the companies it touched, built as the full view builds them. `me` is then the
   * whole Me. `ledgerNew`: credit history rows the action wrote, newest first. `benchmarks` and
   * `scan` when they may have moved, `reported` for an admin. `partial`: some of what it changed
   * isn't here (too many companies, or a record that is gone), so the page loads the table again
   * soon. `version`: the table's version after the action (see View.version).
   */
  companies?: CompanyRec[];
  ledgerNew?: LedgerRow[];
  benchmarks?: Benchmarks;
  scan?: ScanSummary;
  reported?: View["reported"];
  partial?: boolean;
  version?: string;
};

/**
 * GET /api/table?partners=1: the Referral partners page's server half (lib/table.ts partnersView).
 * Counts only where it is about other members, and never an email. The page's "Partners at your
 * kind of clients" comes from the member's own view of the table, with its locks.
 */
export interface PartnersView {
  /** The function the order is about: the viewer's, or null when they haven't named one. */
  fn: string | null;
  /**
   * Lines backed by at least `min` companies: at that many companies, the first fractional `fn`
   * seat there started `when` (before or after) the first fractional seat in the viewer's function.
   * Dated seats only. Most companies first.
   */
  order: { fn: string; when: "before" | "after"; companies: number }[];
  /** Companies with a dated fractional seat in the viewer's function and one in another function. */
  companies: number;
  /** Companies a line needs, and members' answers the counts need (20 each). */
  min: number;
  /**
   * Members in the viewer's function who said which fractionals usually get hired before them
   * (`n`, "Not sure" included), and how many named each function. Null below `min` answers.
   */
  answers: { n: number; fns: { fn: string; n: number }[] } | null;
  /** Members listed as referral partners (not the viewer), most relevant first: first name, title, function, ideal clients. */
  members: { id: string; first: string; title: string; fn: string | null; icp: Icp | null; conversationId?: string }[];
  /** Listed members in all (`members` holds the first of them). */
  total: number;
  /** The viewer is listed for other members. */
  listed: boolean;
  /**
   * "Partners at your kind of clients" leads with the seat's title while who held it is locked
   * (lib/table.ts partnerTitles). Seat public id -> its title, cut of the company's name and never
   * holding the holder's name, an email or a link. Only this page: elsewhere the role still sells
   * with who held it (SEAT_BUNDLE).
   */
  titles?: Record<string, string>;
}

/**
 * What a member came for (Me.goal): onboarding's first question until it ended on a first view.
 * Members who answered it keep their answer, and the table still opens on it for them. New
 * members get one from their answers: "adjacent" (no fractional in their function yet), or
 * "friendly" when their function is a catch-all (app/onboard/firstView.ts goalFor).
 */
export const GOALS = [
  { key: "roles", label: "Open fractional roles" },
  { key: "friendly", label: "Companies that hire fractionals again" },
  { key: "adjacent", label: "Companies that have not hired my function yet" },
  { key: "intro", label: "A fractional who held the seat and can tell me about it" },
] as const;
