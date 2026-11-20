/**
 * Merlin: a give-to-get data exchange for fractional operators.
 *
 * Three linked records:
 *   company 1→n engagements (fractional seats at that company)
 *   company 1→n people (decision makers), engagement 1→n people (who the fractional
 *   reported to, worked with, or who is hiring for the seat)
 * A value is stored once on its record and shows everywhere it applies.
 *
 * Credits: adding a missing fact earns 1. A member can earn at most EARN_CAP credits in any
 * rolling 24 hours, counting fills, invite bonuses and confirmation bonuses alike. A bonus
 * that doesn't fit under the cap is held (State.held) and paid as room opens, never lost;
 * unlocking a locked fact someone else added costs 1. Members can confirm or report facts;
 * a fact two members report is hidden until an admin reviews it. An admin review can
 * remove a bad fact, which takes the credit back from whoever added it and refunds
 * everyone who unlocked it.
 *
 * Ids: every id is built from names (c_{company}, e_{company}_{seatholder}_{role},
 * p_{company}_{person}), so none leaves the server. The client sees pubId(id), an opaque
 * HMAC, and perform() maps it back.
 *
 Locked companies: every company keeps its name, website and LinkedIn behind "Unlock company"
 * (COMPANY_PRICE, 2 credits) for a member until they know it (they added to it, held a seat
 * there, or paid for anything there); see identityHidden() and knownCompanies(). The free facts
 * (industry, size, revenue, HQ region, which functions it hired and when, open roles' titles and
 * hours) show on every row. Its logo shows through GET /api/logo/<id> (logoDomain, lib/logo.ts),
 * never with its domain in the page, and its About without its name, web address, links and
 * emails (hideIdentity, aboutWithout). The same purchase opens the posting and the posted rate of
 * each open role there, whichever of them was asked for. Where the company is not locked, the
 * posting and the rate of an open role are still one purchase (BUNDLE_FIELDS). The people and seat
 * holders of a locked company open only after the company does (COMPANY_FIRST).
 *
 * Bundles and prices: a person's name and title are one purchase (holdsPersonPartner), and their
 * LinkedIn, email and phone open only after it (knowsPerson in perform). On a seat whose holder is
 * on file, who held it and their role are one purchase (holdsSeatPartner). An end month that says
 * no more than the free status ("Ongoing", or any end on an Active seat or an open role) is free
 * (endFree), and what members paid for one reading "Ongoing" was given back (refundOngoingEnds).
 *
 * Your seats: the member a seat-holder name resolves to can say "this isn't me"; see
 * seatHolder(). When the name is good evidence (our records, another member, the seat's maker,
 * a confirmation) they also see their own seat free, can correct what the seed or the scan say
 * about it, and their report on a fact there hides it for everyone at once; see seatOwner(). An
 * open role closes only when a member picks themselves as its seat holder on an account that
 * counts (trustOf), and reopens if that name comes off; see reopenIfUnheld().
 *
 * Weekly scan: open roles come in from job boards with the day they were first seen, close
 * (with the date) when a clean scan stops listing them, and reopen if listed again, unless a
 * member has taken the seat as their own (selfHeld()); see applyScan(). Their facts are owned
 * by "scan" and behave like seed facts. After a scan, sendDigests() emails the week's new roles.
 *
 * Benchmark-only rates (State.benchRates) count in the rate benchmarks and are never sent to
 * anyone but the member who shared them, admins included.
 *
 * Storage:
 *  - intel-seed.json (private, git-ignored, scripts/build-intel-seed.py): members (for
 *    sign-in), seed companies, engagements and people. Shipped encrypted as
 *    data/intel-seed.enc and opened with RN_INTEL_SEED_KEY.
 *  - intel.json (runtime, on the data volume): everything members do. Written by a group
 *    commit (one write per batch of actions) and snapshotted daily (lib/backup.ts).
 */
import { publicBase } from "./links";
import { promises as fs } from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { iconDomains } from "./companyIcons";
import { readRate } from "./rates";
import { BACKUP_FILE, holdUploads, snapshot } from "./backup";
import { emailEnabled, sendEmail } from "./email";
import { renderDigest } from "./digest";
import { MAX_ROLES, collectOpenRoles, scanSources, type ScanSource } from "./scan/collect";
import { removeScreenedOut } from "./scan/remove";
import { isBelowLead, keepsNonGtm } from "./seniority";
import { aboutWithout, bestPosting, companyKey, isPlaceholderCompany, postingRank, sameRoleTitle, textKey, titleWithout } from "./scan/clean";
import { checkPostings, fetchPosting, type PostingFetch } from "./scan/posting";
import { atsSources, discover, fetchFeed, type AtsCache, type AtsCompany, type FeedFetch, type SiteFetch } from "./scan/sources/ats";
import {
  ALL_FIELDS, EARN_CAP, INTRO_FIELD, ENGAGEMENT_TYPES, FILLABLE, FRACTIONAL_TYPES, FUNCTIONS, GTM_FUNCTIONS, REFERRAL_BONUS, REFERRAL_LIMIT, cleanValue, fieldDef, functionOf,
  stripInvisible, tidy, HIDDEN_COMPANY, FIND_MIN, FIND_HINT, FIND_NONE, RN_REVENUE, currentValue, standardIndustries, standardList, siteKey, PERSON_BUNDLE, PERSON_DETAILS, SEAT_BUNDLE,
  SEAT_SCAN_ROLE_FREE, COMPANY_PRICE, type Entity,
} from "./tableFields";
import { normalizeHq, type Geo } from "./geo";
import { STANDARD_FIELDS, toStandard } from "./industryMap";
import { companyFirm, memberHoldsSeat, purgeFirms, seedFirmIds, type FirmReview, type RemovedFirms } from "./firmRemoval";
import type {
  Action, ActionResult, AdminStats, BenchRate, BenchmarkRow, Benchmarks, Cell, RateStat, CompanyRec, EngagementRec, Friendly, LedgerRow, Me, OnboardDraft, PartnersView, PersonRec,
  ScanSummary, View,
} from "./tableTypes";
import { BEFORE_MAX, CLIENT_COUNTS, type PlanView } from "./tableTypes";
import type { DigestData, DigestHires, PostingCheckResult, ScanApplyResult, ScanCollectResult, ScanSourceResult } from "./scanTypes";
import { followsHires } from "./hired";
import { messageStats, reportedMessages, unreadCount, type MessagingState } from "./messageState";
import { emptyConnector, type ConnectorState } from "./mcp/types";
import { alertMatches } from "./mcp/alerts";
import { HuntError, cleanIcp, savedViewAction, savedViewsOut } from "./hunt";
import { pillPlace } from "../app/onboard/place";
import { sameName } from "./personName";
import { claimToken, seatForToken } from "./claimToken";
import { cleanNote, connectText, notePitch } from "./partners";
import type { Icp } from "./tableTypes";
import { integrationStats, type IntegrationsState } from "./notify/types";
import { billingLive, gated, hasPro, planOf, trialDaysLeft, type PlanRecord } from "./plan";
import {
  ENDING_DAYS, FREE_MCP_PER_DAY, FREE_SAVED_VIEWS, PRICES, PRO_CREDITS, TOPUP_CREDITS, annualLine, dueGrantRef, emptyBilling, extendTrial, hourlyOf, keepTrialEnd, pauseState, proStartsLater, startTrial, trialEnding,
  type BillingState,
} from "./billing/rules";
import { FEATURE_NAME, YOUR_FEATURE, radarStats, type RadarState, type RadarStats } from "./radar/types";
import { countTransitions, isStage, type SeatPoint } from "./radar/predict";
import { ABOUT_BY, ABOUT_SOURCE, REFRESH_DAYS, RETRY_DAYS, aboutEnabled, aboutProgress, type AboutOutcome, type AboutRunSummary, type AboutState, type AboutStatus, type AboutTarget } from "./about/types";
import {
  REFRESH_DAYS as LEADERS_REFRESH_DAYS, RETRY_DAYS as LEADERS_RETRY_DAYS, leadersEnabled, leadersProgress,
  type CompanyLeads, type LeadersOutcome, type LeadersRecord, type LeadersRunSummary, type LeadersTarget,
} from "./leaders/types";
import { mergeFunctions } from "./leaders/pick";
import { fundingAdminStats, type FundingState } from "./funding/types";

export type { Action, ActionResult, View } from "./tableTypes";

/** Credits every member starts with (25 unless RN_STARTER_CREDITS says otherwise). */
const starterEnv = Number.parseInt(process.env.RN_STARTER_CREDITS ?? "", 10);
export const STARTER_CREDITS = Number.isFinite(starterEnv) && starterEnv >= 0 ? starterEnv : 25;

export interface Member {
  id: string;
  name: string;
  email: string;
  title: string;
  token: string;
}
export interface SeedCompany {
  id: string;
  fields: Record<string, string>;
}
interface SeedEngagement {
  id: string;
  companyId: string;
  fields: Record<string, string>;
  verified?: boolean;
  /**
   * Where the seat holder's name (fields.operator) came from when it was not from the person:
   * PUBLIC_PROFILE, a name scripts/add-seat-names.mjs read from public profiles. Such a name is
   * unverified until its fractional claims the seat, two members confirm it or an admin does
   * (see publicName below).
   */
  holderFrom?: string;
  /**
   * When the seat came into the table (ISO), for "new hires this week" (lib/hireAlerts.ts).
   * scripts/add-seat-scan.mjs stamps it on the seats it adds. Seats from before carry none and are
   * never counted as new.
   */
  addedAt?: string;
}
interface SeedContact {
  id: string;
  /** Company-level people have a companyId and no engagementId. */
  companyId?: string;
  engagementId?: string | null;
  source?: string;
  fields: Record<string, string>;
}
export interface Seed {
  builtAt: string;
  members: Member[];
  companies: SeedCompany[];
  engagements: SeedEngagement[];
  contacts?: SeedContact[];
  /**
   * Revenue Nomad's Rate Index (survey and contract rates), for the benchmarks only. `hours` is
   * hours per MONTH (or null), `revenue` an RN_REVENUE label (or null). Never shown one by one.
   */
  rateIndex?: { fn: string; hourly: number; hours: number | null; revenue: string | null }[];
  demo?: boolean;
  /** Fractional firms the seed cleanup dropped (lib/firmRemoval.ts): what a running table still holds about them is removed on load. */
  removedFirms?: RemovedFirms;
  /** Firms the cleanup kept because a member published a seat or a story there, for an admin to review. */
  firmReview?: FirmReview[];
}

interface Added {
  id: string;
  by: string;
  at: string;
}
export interface FieldValue {
  value: string;
  by: string; // member id, "seed", "scan" (the weekly scan; treated like seed), or "website" (an About text read from the company's site, lib/about; treated like seed)
  at: string;
  /** reported: hidden for everyone (two or more members reported it) until an admin reviews it. */
  status: "live" | "reported" | "removed";
  /** Members who reported this value. One report hides it only for that member. */
  reporters?: string[];
  reportedBy?: string;
  /** Members whose report an admin turned down by keeping the fact. They can't report this value again. */
  kept?: string[];
  /** Seat holder only: the member this name was linked to when it was added. */
  memberId?: string;
  /** Company HQ only: the country and region it was read as when it was added (lib/geo.ts). The value stays as typed. */
  geo?: Geo;
  /**
   * A seat holder's correction of what our records, the scan or another member said about their
   * seat: the value it replaced. It goes back if they give the seat up ("Not my seat").
   */
  prev?: { value: string; by: string; at: string };
  /**
   * Seat holder only, on a value read from the seed: a name from public profiles (the seat's
   * holderFrom is PUBLIC_PROFILE). It never links to a member by name (seatMember), and it is
   * unverified until claimed, confirmed by two members or approved by an admin (nameVerified).
   */
  pub?: true;
}
export interface LedgerEntry {
  memberId: string;
  delta: number;
  /**
   * adjust: a one-time balance correction (ref "starter.floor"). plan: Pro's credits for a paid
   * month (ref "plan.<invoice>.<month>"). topup: a top-up bought (ref "topup.<checkout session>").
   */
  reason: "fill" | "unlock" | "refund" | "reversal" | "referral" | "confirm" | "adjust" | "plan" | "topup";
  ref: string;
  at: string;
  /**
   * closed (refunds): the scan found the role had closed, and this unlock was made after its
   * posting was last seen. removed (refunds): the scan took the role off the table, a full-time
   * job an older screen had let in (lib/scan/remove.ts). offbar (refunds): the scan took the role
   * off the table because it is outside GTM and below Director (lib/seniority.ts). ongoing
   * (refunds): the end month it bought reads "Ongoing", which is free now (refundOngoingEnds).
   * retract (reversals): the member took back a fact they had added. name (refunds): the seat
   * holder's name from public profiles it bought came off the seat (This is wrong, Remove my name).
   * duplicate (refunds): the member had bought two listings of one role, merged into one (mergeDuplicateRoles).
   */
  why?: "closed" | "removed" | "offbar" | "ongoing" | "retract" | "name" | "duplicate";
  /** A fill the member took back (retract). It no longer counts as earned today, or as a fact they added. */
  undone?: true;
}
interface Profile {
  function?: string;
  goal?: string;
  title?: string;
  onboarded?: boolean;
  /** Turned the weekly email off (Your credits, or the unsubscribe link). */
  digestOff?: boolean;
  /** Turned off the email that says a member sent them a message. */
  messageEmailOff?: boolean;
  /** Asked to hear about Pro. */
  proInterest?: boolean;
  /** Who they hunt: their ideal client (lib/hunt.ts). */
  icp?: Icp | null;
  /** Turned off "Show me in Referral partners" (Your profile): other members don't see them listed there. */
  partnersOff?: boolean;
  /** Turned off the next-client radar (Your profile, or the radar email's own unsubscribe link). See lib/radar. */
  radarOff?: boolean;
  /**
   * The fractional functions they say usually get hired before them (Me.before): up to
   * BEFORE_MAX, [] for "Not sure", absent when never asked. Private to the member: anything
   * shown to others reads it only as counts.
   */
  before?: string[];
  /** The id of the saved view onboarding made, their first view (Me.firstView). */
  firstView?: string;
  /** Onboarding answers so far, while not onboarded (the onboardDraft action). The profile action drops it. */
  draft?: OnboardDraft;
  /** Onboarding's "How many clients do you have now?" (CLIENT_COUNTS) and "Are you looking for a new client?". */
  clientCount?: string;
  looking?: boolean;
}
/** One open role the weekly scan follows: when it was first and last listed, and when it closed. */
interface RoleTrack {
  engagementId: string;
  companyId: string;
  firstSeen: string;
  lastSeen: string;
  closedAt: string | null;
  /**
   * scan: the posting came down (its board stopped listing it). posting-closed: the posting check
   * found every posting of it clearly closed (checkOpenPostings). filled: a member named the seat
   * holder (a later scan won't reopen it).
   */
  closedBy?: "scan" | "filled" | "posting-closed";
  url: string;
  /** Every posting link it was listed under, `url` included, when there is more than one (the same role on two boards). */
  urls?: string[];
  /** When the posting check last fetched its postings. */
  checkedAt?: string;
  /** The board that last listed it, or "seed" for open roles that came with the seed. */
  source: string;
  postedAt?: string | null;
  /** Clean scans of its board that did not list it since it was last seen (at most one counted per 12 hours), and when the last was counted. */
  misses?: number;
  missAt?: string;
  /** Its board answered with listings since it was last seen and did not list it (clean run or not). It is not counted as open while this stands. */
  absentAt?: string;
}
/** One job board, as the scan has known it. */
interface BoardHealth {
  /** Roles it matched on its last healthy run. A run that matches under half of this is not trusted. */
  baseline: number;
  lastOkAt: string | null;
  /** Its last run was clean: it answered, matched something, and at least half its baseline. */
  healthy: boolean;
  /** Listings it answered with on its last healthy run. A board that lists a role or two is clean at 0 matches when it answers with about as many. */
  fetched?: number;
  /** Since when it has matched something, but under half its baseline, on every run. */
  lowSince?: string;
  /** The last run that named it. */
  at?: string;
}
interface ScanState {
  lastRunAt: string | null;
  /** Per-source results of the last run. */
  sources: ScanSourceResult[];
  /** Keyed by the posting's key (company and title). */
  roles: Record<string, RoleTrack>;
  /** The last run in which at least one board answered cleanly. */
  lastOkAt?: string | null;
  boards?: Record<string, BoardHealth>;
  /** Career feeds of companies on Merlin, by website domain: the board found, or when none was (lib/scan/sources/ats.ts). */
  ats?: AtsCache;
}
interface StoredBenchRate {
  id: string;
  by: string;
  engagementId: string | null;
  fn: string;
  kind: "monthly" | "hourly";
  amount: number;
  revenue: string | null;
  at: string;
}
/** Messages between members, one-time sign-in links and rotated tokens: see lib/messageState.ts. */
export interface State extends MessagingState {
  /** `by` is a member id, or "scan" for a company the weekly scan added. */
  companies: (Added & { name: string })[];
  /** `source` is set for engagements the weekly scan added ("Demand scan"). */
  engagements: (Added & { companyId: string; source?: string })[];
  contacts: (Added & { engagementId: string | null; companyId?: string })[];
  values: Record<string, FieldValue>; // `${entityId}.${field}`
  unlocks: Record<string, string[]>; // `${entityId}.${field}` -> member ids
  /** Members who confirmed a value is correct, keyed like values. */
  verifications: Record<string, string[]>;
  /** People who joined from the landing page (seed members sign in with their link). */
  /** proven: joined while sign-in links went by email, so the link proved the address (see trustOf). */
  members: (Member & { at: string; referredBy?: string; ipHash?: string; proven?: boolean })[];
  /**
   * Each member's recent networks as hashes (never the address), newest last, at most IP_KEEP.
   * Seed members too. Written at sign-in and on visits. An invite that joins from one of the
   * inviter's networks earns no bonus.
   */
  ips?: Record<string, string[]>;
  ledger: LedgerEntry[];
  profiles: Record<string, Profile>;
  follows: Record<string, string[]>;
  /** Referred members whose referral bonus has been paid. */
  referralPaid: string[];
  /** Every report, for the daily report limit and the admin review list. */
  reportLog: { memberId: string; ref: string; at: string }[];
  /** Bonus credits earned while at the daily cap, paid as the rolling window frees room. */
  held: { memberId: string; delta: number; reason: "referral" | "confirm"; ref: string; at: string }[];
  /** Rates shared for the benchmarks only. Never sent to anyone but the member who shared them. */
  benchRates: StoredBenchRate[];
  /** Product signals for the pilot (walls hit, Pro offer seen, Pro interest). Newest 20,000. */
  signals: { memberId: string; name: string; where: string; at: string }[];
  /** "This isn't me": engagement ids a member said they never held, by member id. */
  notMine: Record<string, string[]>;
  /**
   * Open roles a member picked themselves on as the seat holder, for the limit of one per rolling
   * 24 hours and the admin's list. closed: the claim closed the role (the account counts, see
   * trustOf). Rows older than 30 days are dropped.
   */
  roleClaims?: { memberId: string; engagementId: string; at: string; closed?: boolean }[];
  /**
   * Seats from the seat scan (source "Seat scan") a member claimed as theirs ("claimSeat"), for
   * the limit of SEAT_CLAIM_DAILY_MAX per rolling 24 hours and the admin's list. A released claim
   * still counts toward the limit. Rows older than 30 days are dropped.
   */
  seatClaims?: { memberId: string; engagementId: string; at: string }[];
  /** Each member's last visit (written at most once per 6 hours). */
  seen: Record<string, string>;
  scan: ScanState;
  /** Weekly email: last run, emails sent in all, and each member's last one. */
  digest: { lastSentAt: string | null; sent: number; members: Record<string, string> };
  /** One-time changes already applied. starterFloor: the starter balance the floor was last applied at. */
  flags: { starterFloor?: number };
  /** The Claude connector: connected apps (token hashes only) and saved searches. See lib/mcp. */
  connector?: ConnectorState;
  /** Fractional firms kept because a member holds a seat there (lib/firmRemoval.ts), for an admin to review. */
  firmReview?: FirmReview[];
  /** Alerts in Slack and webhooks: each member's URLs (secret) and switches. See lib/notify. */
  integrations?: IntegrationsState;
  /** The next-client radar: the last daily run, and the signals each member was sent (never twice). See lib/radar. */
  radar?: RadarState;
  /** About texts read from company websites (lib/about): each company's last try, and the last run. The texts are values by "website". */
  about?: AboutState;
  /**
   * Who leads each function, read from each company's own website (lib/leaders), by internal
   * company id: the function, level, full-time or fractional, since when and the page. Never a name.
   */
  leaders?: Record<string, LeadersRecord>;
  /** The last run that read leadership pages (lib/leaders/run.ts). */
  leadersRun?: LeadersRunSummary | null;
  /** Seat-holder names from public profiles: claims waiting for an admin, names an admin verified, names taken off, the switch. See publicName. */
  names?: NamesState;
  /** Invite to connect: which member sent which seat's holder their claim link, and what came of it. See connectInvite. */
  seatInvites?: SeatInvite[];
  /** The invite loop: who joined through whose invite, and when the inviter was told. See announceJoin. */
  inviteJoins?: InviteJoin[];
  /** Plans and payments (lib/billing): each member's PlanRecord, Stripe events handled, money in. Only while billing is live. */
  billing?: BillingState;
  /**
   * Companies a member looked up by their exact name or website (the action "find"), by member id,
   * with when. The record opened from that search names the company; the tables never do (it stays
   * locked there, knownCompanies leaves these out). For DAY_MS after a lookup the company opens
   * again from search without counting again, and the record's actions (its About, a posting or
   * a holder at the usual prices, adding a fact) work on it. Older rows are dropped as new ones come.
   */
  found?: Record<string, { id: string; at: string }[]>;
  /** Exact-name lookups that matched nothing, by member id (times, the last 24 hours), for their own daily limit. */
  findMisses?: Record<string, string[]>;
  /**
   * "Who introduced you", by internal seat id: the seat holder's own note (INTRO_FIELD). Never in a
   * table, an export or the connector's answers; sent to the seat holder alone, and counted in Pilot metrics.
   */
  seatPrivate?: Record<string, { by: string; introducedBy: string; at: string }>;
  /**
   * Full-time sales hires a company's career feed lists (Account Executive, SDR, BDR), by internal
   * company id: the count now, when the feed was last read, when a sales role was first seen, the
   * last counts (newest last), and each time the count rose the way Crystal Ball reads as a sales
   * build (lib/radar/signals.ts "sales-build"). Counts only, never a role or a link.
   */
  salesBuild?: Record<string, SalesBuildRecord>;
  /**
   * A leader the company's own website showed for a function is gone from it, read OK both times
   * (lib/table.ts saveLeaders). Crystal Ball's "departure" signal. Newest last, 180 days kept. No names.
   */
  leaderDepartures?: { companyId: string; fn: string; kind: string; level: string; at: string }[];
  /** Each company's employee band as it changed (oldest first), so a crossing of 25 or 50 can be read later. */
  headcount?: Record<string, { band: string; at: string }[]>;
  /** Funding events from SEC Form D filings, matched to companies on file, and each run's counts (lib/funding). No person's name. */
  funding?: FundingState;
}

/** State.salesBuild[companyId]. */
export interface SalesBuildRecord {
  n: number;
  at: string;
  firstAt?: string;
  hist: { n: number; at: string }[];
  rises?: { at: string; from: number; to: number }[];
}

/**
 * The invite loop: `invitee` joined through `by`'s invite (Member.referredBy, from ?ref= on the
 * homepage or a claim link). One per invitee, made when they join. `in`: when they were first
 * signed in (their first visit). `told`: when the inviter was told, once (the app, the email when
 * email is on, Slack or a webhook). `seen`: the inviter closed the line in the app. `skip`: the
 * inviter is not told this way: "connect" when the invitee claimed their seat through the
 * inviter's claim link, which tells them already (connectInvite), "gone" when the invite no longer
 * stands (either account is gone).
 */
export interface InviteJoin {
  by: string;
  invitee: string;
  at: string;
  in?: string;
  told?: string;
  seen?: string;
  skip?: "connect" | "gone";
}

/**
 * Invite to connect: `by` sent the holder of `engagementId` a note with the seat's claim link
 * (/claim/<token>?ref=<by's invite code>). One per member and seat: sending again keeps `at` and
 * takes the newest `note`. When the holder claims the seat through the link, `claimedBy` and
 * `claimedAt` say who and when, and `conversationId` is the conversation it opened (connectInvite).
 */
export interface SeatInvite {
  by: string;
  engagementId: string;
  at: string;
  note?: string;
  claimedBy?: string;
  claimedAt?: string;
  conversationId?: string;
}

/**
 * What members and admins did with the seat-holder names from public profiles. A name taken off
 * a seat is also a removed value in State.values (so the seat reads as unnamed); `removed` keeps
 * how, for the counts.
 */
export interface NamesState {
  /**
   * "This is me" on a name that isn't the member's own: an admin decides. Newest last. `via`: the
   * claim came through another member's invite link (their id), so approving it connects them.
   */
  claims: { memberId: string; engagementId: string; at: string; status: "pending" | "approved" | "declined"; decidedAt?: string; via?: string }[];
  /** Names an admin marked as right, by engagement id (ISO time). */
  verified: Record<string, string>;
  /** Names taken off, by engagement id: when, and how (This is wrong, Not me or Remove my name on a claim link, the public Remove my name page, an admin). */
  removed: Record<string, { at: string; how: "wrong" | "notme" | "remove" | "public" | "admin" }>;
  /** The Pilot metrics switch "Show names from public profiles until we reach N seats" is off. */
  hide?: boolean;
}
const emptyNames = (): NamesState => ({ claims: [], verified: {}, removed: {} });

/* ---------- storage ---------- */

const SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
export const DATA_DIR =
  process.env.RN_DATA_DIR || (SERVERLESS ? path.join("/tmp", "revenue-nomad") : path.join(process.cwd(), "data"));
const STATE_PATH = path.join(DATA_DIR, "intel.json");
const SEED_CANDIDATES = [
  process.env.RN_INTEL_SEED,
  path.join(DATA_DIR, "intel-seed.json"),
  path.join(process.cwd(), "data", "intel-seed.json"),
].filter(Boolean) as string[];

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Merlin cannot serve right now: the state file is damaged and no backup could be read
 * ("state"), or RN_REQUIRE_SEED=1 and the member seed did not load ("seed"). Every route answers
 * 503 (lib/apiGuard.ts) and nothing is written while it stands. The message is for the log.
 */
export class Unavailable extends Error {
  readonly unavailable = true;
  constructor(readonly why: "state" | "seed", detail: string) {
    super(detail);
    this.name = "Unavailable";
  }
}
/** How long a failed load of the seed or the state stands before the files are read again. */
const DOWN_RETRY_MS = 10_000;
const errCode = (e: unknown) => (e as NodeJS.ErrnoException)?.code ?? String(e);

/** Used only when no private seed is present, so the page still runs. */
const DEMO_SEED: Seed = {
  builtAt: new Date(0).toISOString(),
  demo: true,
  members: [
    { id: "d1", name: "Demo Member", email: "", title: "VP Sales", token: "demo" },
    { id: "d2", name: "Demo Member 2", email: "", title: "VP RevOps", token: "demo2" },
  ],
  companies: [
    { id: "c_acme", fields: { name: "Acme Robotics (sample)", website: "acme.example", industry: "Manufacturing", employees: "51–200", revenue: "$5M–$20M" } },
    { id: "c_globex", fields: { name: "Globex Health (sample)", industry: "Health Care" } },
  ],
  engagements: [
    { id: "e_acme1", companyId: "c_acme", fields: { source: "Published engagement", function: "Sales", type: "Fractional", role: "Fractional VP Sales", operator: "Sample Operator", start: "2025-03", status: "Active", end: "Ongoing" }, verified: true },
    { id: "e_globex1", companyId: "c_globex", fields: { source: "Member success story", operator: "Another Operator", function: "Marketing" } },
  ],
  contacts: [
    { id: "p_jane", companyId: "c_acme", engagementId: "e_acme1", fields: { name: "Jane Sample", title: "CEO", relationship: "Reported to", email: "jane@acme.example" } },
  ],
};

let seedCache: { seed: Seed; at: number } | null = null;
/** RN_REQUIRE_SEED=1 (set in the Dockerfile): refuse to run on the demo seed. A deploy with a missing or wrong seed key then fails its health check instead of serving sample data. */
const REQUIRE_SEED = process.env.RN_REQUIRE_SEED === "1";
let seedDown: { error: Unavailable; until: number } | null = null;
let seedNoted = false;
export async function loadSeed(): Promise<Seed> {
  if (seedCache && Date.now() - seedCache.at < 60_000) return seedCache.seed;
  if (seedDown && Date.now() < seedDown.until) throw seedDown.error;
  let seed: Seed | null = null;
  for (const p of SEED_CANDIDATES) {
    seed = await readJson<Seed>(p);
    if (seed && Array.isArray(seed.members) && Array.isArray(seed.engagements)) break;
    seed = null;
  }
  // Hosted deploys: the encrypted seed that ships with the code (data/intel-seed.enc),
  // opened with RN_INTEL_SEED_KEY. See scripts/seal-intel-seed.mjs.
  if (!seed && process.env.RN_INTEL_SEED_KEY) {
    try {
      const raw = Buffer.from(await fs.readFile(path.join(process.cwd(), "data", "intel-seed.enc"), "utf8"), "base64");
      const decipher = createDecipheriv("aes-256-gcm", Buffer.from(process.env.RN_INTEL_SEED_KEY, "base64"), raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
      const s = JSON.parse(gunzipSync(plain).toString("utf8")) as Seed;
      if (Array.isArray(s.members) && Array.isArray(s.engagements)) seed = s;
    } catch {
      console.error("RN_INTEL_SEED_KEY is set but data/intel-seed.enc could not be opened; trying other sources.");
    }
  }
  // Older option: the seed as gzip+base64 variables, split across RN_INTEL_SEED_B64, _2, _3 …
  const b64 = [process.env.RN_INTEL_SEED_B64 ?? "", ...[2, 3, 4, 5, 6, 7, 8, 9].map((i) => process.env[`RN_INTEL_SEED_B64_${i}`] ?? "")].join("");
  if (!seed && b64) {
    try {
      const s = JSON.parse(gunzipSync(Buffer.from(b64, "base64")).toString("utf8")) as Seed;
      if (Array.isArray(s.members) && Array.isArray(s.engagements)) seed = s;
    } catch {
      console.error("RN_INTEL_SEED_B64 is set but could not be decoded; falling back to demo data.");
    }
  }
  if (!seed && REQUIRE_SEED) {
    const error = new Unavailable("seed", "RN_REQUIRE_SEED=1 and the member seed did not load. Check RN_INTEL_SEED_KEY and data/intel-seed.enc.");
    if (!seedDown) console.error(`SEED MISSING: ${error.message} Every route answers 503 until it loads.`);
    seedDown = { error, until: Date.now() + DOWN_RETRY_MS };
    throw error;
  }
  seedDown = null;
  if (seed && !seedNoted) {
    seedNoted = true;
    // Public ids and unsubscribe links are signed with RN_ID_SECRET. Without it they fall back to
    // the key that opens the seed (or, with neither, to a constant anyone can read in this file).
    if (!process.env.RN_ID_SECRET)
      console.warn(
        "RN_ID_SECRET is not set. Public ids and unsubscribe links are signed with the seed key instead (or a public default when there is none). " +
          "Give RN_ID_SECRET the seed key's current value, so no id or link already sent changes, and keep it when the seed key is replaced.",
      );
  }
  const out = seed ?? DEMO_SEED;
  // Industry, employees and revenue are always one of the standard values (lib/industryMap.ts): the
  // closest one, or none when nothing fits ("< $1M" is Under $1M, "51-200" is 51–200).
  for (const r of [...out.companies, ...out.engagements]) {
    for (const k of STANDARD_FIELDS) {
      if (!r.fields[k]) continue;
      const v = toStandard(k, r.fields[k], `${r.fields.name ?? ""} ${r.fields.about ?? ""}`);
      if (v) r.fields[k] = v;
      else delete r.fields[k];
    }
  }
  for (const x of out.rateIndex ?? []) if (x.revenue) x.revenue = currentValue("revenue", x.revenue);
  seedCache = { seed: out, at: Date.now() };
  return seedCache.seed;
}

const EMPTY_STATE = (): State => ({
  companies: [], engagements: [], contacts: [], values: {}, unlocks: {}, verifications: {}, members: [], ledger: [],
  profiles: {}, follows: {}, referralPaid: [], reportLog: [], held: [],
  benchRates: [], signals: [], notMine: {}, seen: {}, scan: { lastRunAt: null, sources: [], roles: {} },
  digest: { lastSentAt: null, sent: 0, members: {} }, flags: {},
});

/**
 * The runtime state lives in memory (one server process) and is written to disk on every
 * change, so reads never touch the disk and writes don't re-read it. stateCache is replaced
 * (never changed in place) on every write, so a reader can tell whether it is current.
 */
let stateCache: State | null = null;
let stateLoading: Promise<State> | null = null;

const BACKUP_DIR = path.join(DATA_DIR, "backups");
/** Where the state in memory came from: the state file, a first start, or a backup (named) after the file was damaged or lost. */
let stateFrom: { origin: "file" | "new" | "backup"; backup?: string } | null = null;
let stateDown: { error: Unavailable; until: number } | null = null;
/** Writes that reached the disk since this process started. A reader can tell whether a view it began is still current. */
let commits = 0;
export const stateVersion = () => commits;
/** This process, for the table version: a restart starts the count again, so a version from before it never reads as current. */
const BOOT = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
/** The commit each committed state came from (0 for the state as loaded). */
const stateVersions = new WeakMap<object, number>();
/**
 * The table's version as the page sees it, "<boot>:<commits>": of the state `s`, else of the
 * state now. An action's answer carries it, so the page can tell whether other members changed
 * the table since it last downloaded it (more than its own action's one commit).
 */
export const viewVersion = (s?: object) => `${BOOT}:${s ? stateVersions.get(s) ?? 0 : commits}`;

/** Enough of a shape check to tell a state file from one that is cut short, emptied or not ours. */
function isState(x: unknown): x is Partial<State> {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  // Every state Merlin has written holds a ledger and the values. A file without them ("{}",
  // or another app's JSON put back by mistake) is not ours, and booting it would start an empty table.
  if (!Array.isArray(o.ledger) || !o.values || typeof o.values !== "object" || Array.isArray(o.values)) return false;
  for (const k of ["companies", "engagements", "contacts", "members", "ledger"]) if (o[k] !== undefined && !Array.isArray(o[k])) return false;
  for (const k of ["values", "unlocks", "profiles", "scan", "digest", "flags"])
    if (o[k] !== undefined && (!o[k] || typeof o[k] !== "object" || Array.isArray(o[k]))) return false;
  return true;
}

type StateRead = { kind: "ok"; state: Partial<State> } | { kind: "missing" } | { kind: "damaged"; why: string; unread?: boolean };
async function readState(file: string): Promise<StateRead> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (e) {
    return errCode(e) === "ENOENT" ? { kind: "missing" } : { kind: "damaged", why: `could not be read (${errCode(e)})`, unread: true };
  }
  try {
    const x: unknown = JSON.parse(text);
    return isState(x) ? { kind: "ok", state: x } : { kind: "damaged", why: "does not hold a Merlin state" };
  } catch {
    return { kind: "damaged", why: `is not valid JSON (${text.length} characters, it may be cut short)` };
  }
}

/**
 * Read the state file. Only a missing file with no backups next to it is a first start. When
 * the file cannot be read or parsed, the newest backup that parses is loaded in its place and
 * the damaged file is kept as intel.json.corrupt-<time>. The same backup is used when the file
 * is gone but backups exist. With no usable backup this throws Unavailable and touches nothing:
 * an empty table must never take the place of a damaged one, because the first write would then
 * erase what members added.
 */
async function readStateOrRecover(): Promise<Partial<State>> {
  let r = await readState(STATE_PATH);
  if (r.kind === "damaged" && r.unread) {
    // A read error can pass (too many open files). Look once more before calling the file damaged.
    await new Promise((done) => setTimeout(done, 200));
    r = await readState(STATE_PATH);
  }
  if (r.kind === "ok") {
    stateFrom = { origin: "file" };
    return r.state;
  }
  const backups = (await fs.readdir(BACKUP_DIR).catch(() => [] as string[])).filter((f) => BACKUP_FILE.test(f)).sort().reverse();
  if (r.kind === "missing" && !backups.length) {
    stateFrom = { origin: "new" };
    holdUploads(); // an empty start (a volume that is not mounted looks the same) never replaces today's off-site copy
    return {};
  }
  const what = r.kind === "damaged" ? `${STATE_PATH} ${r.why}` : `${STATE_PATH} is gone but ${BACKUP_DIR} has backups, so this is not a first start`;
  for (const f of backups) {
    const b = await readState(path.join(BACKUP_DIR, f));
    if (b.kind !== "ok") {
      // Said once, not on every retry while the state is down.
      if (!stateDown) console.error(`backups/${f} ${b.kind === "damaged" ? b.why : "is gone"}. Trying an older one.`);
      continue;
    }
    // The damaged file steps aside only now that a backup takes its place. While nothing can, it
    // stays where it is, so a restart finds it again and never mistakes this for a first start.
    if (r.kind === "damaged") {
      const aside = `${STATE_PATH}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      try {
        await fs.rename(STATE_PATH, aside);
      } catch (e) {
        throw new Unavailable("state", `${what} and could not be moved aside (${errCode(e)}). Nothing was changed.`);
      }
      console.error(`STATE DAMAGED: ${what}. It is kept as ${aside}.`);
    } else console.error(`STATE MISSING: ${what}.`);
    console.error(`STATE RESTORED from backups/${f}. Anything members did after that backup was written is not in it. Off-site uploads wait until tomorrow, so today's copy is kept.`);
    stateFrom = { origin: "backup", backup: f };
    holdUploads();
    return b.state;
  }
  throw new Unavailable(
    "state",
    `${what}, and no backup could be read. Nothing was changed. Merlin answers 503 and writes nothing until a good intel.json is put back ` +
      `(to start empty on purpose, remove the damaged file and the backups folder).`,
  );
}

/** A failed load stands for a short while, then the files are read again: someone may have put a good one back. */
function stateFailed(e: unknown): never {
  stateLoading = null;
  const error = e instanceof Unavailable ? e : new Unavailable("state", `the state could not be loaded (${e instanceof Error ? e.message : String(e)})`);
  if (!stateDown) console.error(`STATE DOWN: ${error.message}`);
  stateDown = { error, until: Date.now() + DOWN_RETRY_MS };
  throw error;
}

export async function loadState(): Promise<State> {
  if (stateCache) return stateCache;
  if (stateDown && Date.now() < stateDown.until) throw stateDown.error;
  stateLoading ??= (async () => {
    const s: State = { ...EMPTY_STATE(), ...(await readStateOrRecover()) };
    // One-time repair, safe to leave in place (it only touches 0 rows): a capped invite or
    // confirmation bonus used to be recorded as 0 and never paid. Hold it instead, so it is
    // paid as the member's daily room opens.
    s.held ??= [];
    // Values saved under an older label (e.g. revenue "< $1M") take the current one.
    // Industry, employees and revenue saved under another spelling take the standard value. One nothing maps leaves the table (as if removed).
    const seedNow = await loadSeed().catch(() => null);
    const seedCo = new Map((seedNow?.companies ?? []).map((c) => [c.id, c.fields]));
    const stateCo = new Map(s.companies.map((c) => [c.id, c.name]));
    /** A company's own words (name and About), which pick between close industries. */
    const wordsOf = (id: string) => `${seedCo.get(id)?.name ?? stateCo.get(id) ?? ""} ${seedCo.get(id)?.about ?? s.values[`${id}.about`]?.value ?? ""}`;
    for (const [k, v] of Object.entries(s.values)) {
      const field = k.slice(k.lastIndexOf(".") + 1);
      if (!STANDARD_FIELDS.has(field)) continue;
      const std = toStandard(field, v.value, field === "industry" ? wordsOf(k.slice(0, k.lastIndexOf("."))) : "");
      if (std) v.value = std;
      else v.status = "removed";
    }
    // Saved searches and benchmark-only rates too: an alert for "SaaS" companies matches Software ones.
    for (const list of Object.values(s.connector?.alerts ?? {}))
      for (const a of list) {
        // An old "Software" reads as every Software industry (INDUSTRY_GROUPS).
        if (a.industry) {
          const std = standardIndustries(a.industry);
          a.industry = std.length ? std : [...new Set(a.industry.map((x) => currentValue("industry", x)))];
        }
        if (a.revenue) a.revenue = [...new Set(a.revenue.map((x) => currentValue("revenue", x)))];
        if (a.employees) a.employees = [...new Set(a.employees.map((x) => currentValue("employees", x)))];
      }
    // Ideal clients saved under an older label ("Software", "< $1M") take the standard value. One nothing maps drops out.
    for (const p of Object.values(s.profiles)) {
      if (!p.icp) continue;
      p.icp = { ...p.icp, industries: standardIndustries(p.icp.industries), employees: standardList("employees", p.icp.employees), revenue: standardList("revenue", p.icp.revenue) };
    }
    // The saved view onboarding made spelled the profile out as hard filters and opened empty. One
    // that still matches that form for its member's profile opens with the profile pill on now.
    for (const [memberId, list] of Object.entries(s.connector?.alerts ?? {})) {
      const p = s.profiles[memberId];
      for (const a of p?.icp ? list : []) {
        const next = pillPlace(a.place, p.function ?? null, p.icp ?? null);
        if (next) a.place = next;
      }
    }
    for (const b of s.benchRates ?? []) if (b.revenue) b.revenue = currentValue("revenue", b.revenue);
    for (const l of s.ledger) {
      if (l.delta !== 0 || (l.reason !== "referral" && l.reason !== "confirm")) continue;
      if (!s.held.some((h) => h.memberId === l.memberId && h.ref === l.ref && h.reason === l.reason))
        s.held.push({ memberId: l.memberId, delta: l.reason === "referral" ? REFERRAL_BONUS : 1, reason: l.reason, ref: l.ref, at: l.at });
    }
    // Starter credits went down (50 to 25): nobody starts in debt. Anyone the lower starter
    // would leave below 0 gets one row lifting them to 0. Runs once per lowering.
    if (s.flags.starterFloor === undefined || STARTER_CREDITS < s.flags.starterFloor) {
      const sums = new Map<string, number>();
      for (const l of s.ledger) sums.set(l.memberId, (sums.get(l.memberId) ?? 0) + l.delta);
      const at = new Date().toISOString();
      for (const [memberId, sum] of sums)
        if (STARTER_CREDITS + sum < 0) s.ledger.push({ memberId, delta: -(STARTER_CREDITS + sum), reason: "adjust", ref: "starter.floor", at });
    }
    s.flags.starterFloor = STARTER_CREDITS;
    // An ongoing seat's end month is free now. Whoever paid to see one gets that credit back, once.
    if (seedNow) {
      const back = refundOngoingEnds(s, seedNow);
      if (back) console.log(`Gave back ${back} credit${back === 1 ? "" : "s"} spent on end months that read Ongoing, which are free now.`);
    }
    // Fractional firms, agencies and marketplaces are not clients: what the state holds about one goes (lib/firmRemoval.ts).
    try {
      const seed = await loadSeed();
      const p = purgeFirms(seed, s, new Date().toISOString());
      if (p.companies || p.seats || p.people || p.facts || p.refunds || p.reviewed)
        console.log(`Fractional firms removed on load: ${p.companies} companies, ${p.seats} seats, ${p.people} people, ${p.facts} facts, ${p.refunds} unlocks refunded, ${p.reviewed} kept for admin review.`);
    } catch (e) {
      if (e instanceof Unavailable) throw e;
      console.error(`Fractional firm cleanup skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Open roles filed as Executive or with no function, before the scan knew the functions outside GTM, take the one their title names.
    if (seedNow) {
      const remapped = remapScanFunctions(s, seedNow);
      if (remapped) console.log(`Open roles given the function their title names: ${remapped}.`);
      // The same role listed on two boards, filed twice before the scan matched them: one role, with both links.
      const m = mergeDuplicateRoles(s, seedNow, new Date().toISOString());
      if (m.merged) console.log(`Open roles listed twice, merged into one: ${m.merged} (credits paid back for a role bought twice: ${m.refunded}).`);
    }
    stateCache = s;
    stateDown = null;
    return s;
  })().catch(stateFailed);
  return stateLoading;
}

let diskProbe: { ok: boolean; at: number } | null = null;
/** The disk check under way, shared by every health call that arrives while it runs. */
let diskProbing: Promise<void> | null = null;
let probeN = 0;
/**
 * For GET /api/health: the real seed loaded, the state loaded (from its file, a first start, or
 * a backup) and the data folder takes writes. It never writes the state. The disk check writes
 * one small probe file and removes it, at most once in 15 seconds. Calls that come together
 * wait for the same check (each with its own file, so two can never trip over one another).
 */
export async function health(): Promise<{ ok: boolean; seed: "ok" | "demo" | "missing"; state: "ok" | "restored" | "down"; disk: "ok" | "failed" }> {
  const seed = await loadSeed().then((x) => (x.demo ? ("demo" as const) : ("ok" as const)), () => "missing" as const);
  const state = await loadState().then(() => (stateFrom?.origin === "backup" ? ("restored" as const) : ("ok" as const)), () => "down" as const);
  if (!diskProbe || Date.now() - diskProbe.at > 15_000) {
    diskProbing ??= (async () => {
      const probe = path.join(DATA_DIR, `.health-${process.pid}-${++probeN}`);
      const ok = await fs
        .mkdir(DATA_DIR, { recursive: true })
        .then(() => fs.writeFile(probe, "ok"))
        .then(() => fs.unlink(probe))
        .then(() => true, () => false);
      diskProbe = { ok, at: Date.now() };
      diskProbing = null;
    })();
    await diskProbing;
  }
  const disk = diskProbe?.ok ? ("ok" as const) : ("failed" as const);
  return { ok: seed === "ok" && state !== "down" && disk === "ok", seed, state, disk };
}

/**
 * Group commit. Changes queue up; each batch (up to BATCH jobs) runs in order on one draft
 * cloned from the committed state, then the draft is written once and becomes the committed
 * state. A change that throws leaves the state untouched (the draft is rebuilt without it).
 * A failed write rejects the whole batch and keeps the committed state as it was.
 */
interface Job {
  fn: (s: State, seed: Seed) => unknown;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}
const BATCH = 50;
const queue: Job[] = [];
let flushing = false;
let dirReady = false;

/**
 * Engagements dropped from the seed (scripts/build-intel-seed.py NOT_COMPANIES: a street
 * address or a project filed as a company). Unlocks on them are refunded with the first write
 * after a start; once refunded they are gone, so this runs at most once per record.
 */
const RETIRED_PREFIXES = ["e_301wosborn_", "e_trianglegrandavenue_", "e_greensburgkansasrebuild_"];
let retiredChecked = false;
function refundRetired(s: State, seed: Seed) {
  if (seed.demo) return; // without the real seed every record would look retired
  const ids = new Set([...seed.engagements.map((e) => e.id), ...s.engagements.map((e) => e.id)]);
  const now = new Date().toISOString();
  for (const k of Object.keys(s.unlocks)) {
    const id = k.slice(0, k.indexOf("."));
    if (ids.has(id) || !RETIRED_PREFIXES.some((p) => id.startsWith(p))) continue;
    for (const m of s.unlocks[k]) s.ledger.push({ memberId: m, delta: 1, reason: "refund", ref: k, at: now });
    delete s.unlocks[k];
  }
}

/**
 * An end month that reads "Ongoing" is free to see now (endFree). Each member who paid a credit to
 * see one gets it back, with the ledger line "Gave back 1 credit: an ongoing seat's end month is
 * free now." Their unlock goes with it, so this changes nothing the second time it runs (it runs on
 * every load of the state). An end that only became "Ongoing" later is given back on the next load.
 * Returns the credits given back.
 */
function refundOngoingEnds(s: State, seed: Seed, now = new Date().toISOString()): number {
  const seedEnd = new Map<string, string>();
  for (const e of seed.engagements) if (e.fields.end) seedEnd.set(e.id, e.fields.end);
  let paid: Map<string, number> | null = null;
  let back = 0;
  for (const k of Object.keys(s.unlocks)) {
    const dot = k.lastIndexOf(".");
    if (k.slice(dot + 1) !== "end") continue;
    const v = s.values[k];
    // A value in the state wins over the seed's (one removed hides the seed's), as in valueOf.
    const value = v ? (v.status === "live" ? v.value : null) : seedEnd.get(k.slice(0, dot)) ?? null;
    if (value !== "Ongoing") continue;
    if (!paid) {
      paid = new Map();
      for (const l of s.ledger) {
        if ((l.reason !== "unlock" && l.reason !== "refund") || !l.ref.endsWith(".end")) continue;
        const pk = `${l.memberId} ${l.ref}`;
        paid.set(pk, (paid.get(pk) ?? 0) - l.delta);
      }
    }
    for (const m of s.unlocks[k]) {
      if ((paid.get(`${m} ${k}`) ?? 0) <= 0) continue;
      s.ledger.push({ memberId: m, delta: 1, reason: "refund", ref: k, at: now, why: "ongoing" });
      back++;
    }
    delete s.unlocks[k];
  }
  return back;
}

function mutate<T>(fn: (s: State, seed: Seed) => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ fn, resolve: resolve as (v: unknown) => void, reject });
    if (!flushing) void flush();
  });
}

async function flush(): Promise<void> {
  flushing = true;
  try {
    while (queue.length) {
      const batch = queue.splice(0, BATCH);
      if (!retiredChecked) {
        retiredChecked = true;
        batch.unshift({ fn: refundRetired, resolve: () => {}, reject: (e) => console.error("refunding retired records failed", e) });
      }
      let committed: State;
      let seed: Seed;
      try {
        [committed, seed] = await Promise.all([loadState(), loadSeed()]);
      } catch (e) {
        for (const j of batch) j.reject(e);
        continue;
      }
      /** Run jobs on a fresh draft; a job that throws is rejected and the rest re-run without it. */
      const replay = (jobs: Job[]) => {
        for (;;) {
          const d = structuredClone(committed);
          const outs: unknown[] = [];
          let failed = -1;
          for (let i = 0; i < jobs.length; i++) {
            try {
              outs.push(jobs[i].fn(d, seed));
            } catch (e) {
              jobs[i].reject(e);
              failed = i;
              break;
            }
          }
          if (failed < 0) return { draft: d, done: jobs.map((job, i) => ({ job, out: outs[i] })) };
          jobs = jobs.filter((_, i) => i !== failed);
        }
      };
      let draft = structuredClone(committed);
      let done: { job: Job; out: unknown }[] = [];
      // A change that threw may have written part of itself into the draft (bonuses held at the
      // cap are paid before the action is checked). The draft is rebuilt without it, but only
      // when something still depends on it: the next change in the batch, or the write.
      let spoiled = false;
      const rebuild = () => {
        ({ draft, done } = replay(done.map((d) => d.job)));
        spoiled = false;
      };
      for (const job of batch) {
        if (spoiled) rebuild();
        try {
          done.push({ job, out: job.fn(draft, seed) });
        } catch (e) {
          job.reject(e);
          spoiled = true;
        }
      }
      if (!done.length) continue;
      if (spoiled) rebuild();
      try {
        if (!dirReady) {
          await fs.mkdir(DATA_DIR, { recursive: true });
          dirReady = true;
        }
        const json = JSON.stringify(draft);
        const tmp = STATE_PATH + ".tmp";
        // On the disk before the rename, so a host crash leaves the old file or the new one, never a cut one.
        const fh = await fs.open(tmp, "w");
        try {
          await fh.writeFile(json, "utf8");
          await fh.sync();
        } finally {
          await fh.close();
        }
        await fs.rename(tmp, STATE_PATH);
        stateCache = draft;
        commits++;
        stateVersions.set(draft, commits);
        await snapshot(DATA_DIR, json);
      } catch (e) {
        dirReady = false;
        for (const d of done) d.job.reject(e);
        continue;
      }
      for (const d of done) d.job.resolve(d.out);
    }
  } finally {
    flushing = false;
    if (queue.length) void flush();
  }
}

/* ---------- graph ---------- */

interface Node {
  id: string;
  seedFields: Record<string, string>;
  /** Fields in seedFields that came from Revenue Nomad research rather than this record (see researchFill). Shown as "research". */
  research?: Set<string>;
}
type CompanyNode = Node & { name: string };
/** `holderFrom`: the seed's seat-holder name came from public profiles (PUBLIC_PROFILE), and it is on this node. */
type EngNode = Node & { companyId: string; verified: boolean; source: string; holderFrom?: string };
type PersonNode = Node & { companyId: string; engagementId: string | null; source: string };
interface Graph {
  companies: Map<string, CompanyNode>;
  engagements: Map<string, EngNode>;
  contacts: Map<string, PersonNode>;
}

/** Placeholder company names (isPlaceholderCompany), remembered by name: the graph is built on every view and action. */
const placeholderNames = new Map<string, boolean>();
function placeholderName(name: string): boolean {
  let v = placeholderNames.get(name);
  if (v === undefined) {
    v = isPlaceholderCompany(name);
    if (placeholderNames.size > 50_000) placeholderNames.clear();
    placeholderNames.set(name, v);
  }
  return v;
}
/** Companies with a placeholder name kept because a member holds a seat there, for an admin to review. */
function placeholdersInReview(g: Graph): { companyId: string; name: string }[] {
  return [...g.companies.values()].filter((c) => placeholderName(c.name)).map((c) => ({ companyId: c.id, name: c.name }));
}

function graph(seed: Seed, s: State): Graph {
  const g: Graph = { companies: new Map(), engagements: new Map(), contacts: new Map() };
  // A firm in the seed (an admin added its name after the seed was built) is left out, unless a member holds a seat there.
  const firms = seedFirmIds(seed);
  const out = new Set<string>();
  for (const [id, f] of firms) if (!memberHoldsSeat(s, [...f.engagements, ...s.engagements.filter((e) => e.companyId === id).map((e) => e.id)])) out.add(id);
  // A placeholder name ("Private Company", "Stealth Startup", "N/A") is no company: left out, unless a member holds a seat there
  // (then it stays, listed for an admin to review with the firms). Nothing about it is deleted.
  const placeholderOut = (id: string, name: string) => {
    if (!placeholderName(name)) return false;
    const seats = [...seed.engagements.filter((e) => e.companyId === id), ...s.engagements.filter((e) => e.companyId === id)].map((e) => e.id);
    return !memberHoldsSeat(s, seats);
  };
  for (const c of seed.companies) if (!out.has(c.id) && placeholderOut(c.id, c.fields.name ?? "")) out.add(c.id);
  for (const c of s.companies) if (!out.has(c.id) && placeholderOut(c.id, c.name)) out.add(c.id);
  for (const c of seed.companies) if (!out.has(c.id)) g.companies.set(c.id, { id: c.id, seedFields: c.fields, name: c.fields.name ?? "" });
  for (const c of s.companies) {
    if (g.companies.has(c.id) || out.has(c.id)) continue;
    const node: CompanyNode = { id: c.id, seedFields: { name: c.name }, name: c.name };
    if (c.by === "scan") researchFill(seed, s, node);
    g.companies.set(c.id, node);
  }
  let publicNames = 0;
  for (const e of seed.engagements)
    if (!out.has(e.companyId)) {
      const pub = e.holderFrom === PUBLIC_PROFILE && !!e.fields.operator;
      if (pub) publicNames++;
      g.engagements.set(e.id, { id: e.id, seedFields: e.fields, companyId: e.companyId, verified: !!e.verified, source: e.fields.source ?? "Member added", ...(pub ? { holderFrom: PUBLIC_PROFILE } : {}) });
    }
  for (const e of s.engagements)
    if (!g.engagements.has(e.id) && !out.has(e.companyId))
      g.engagements.set(e.id, { id: e.id, seedFields: e.source ? { source: e.source } : {}, companyId: e.companyId, verified: false, source: e.source ?? "Member added" });
  const companyOfEng = (eid: string | null | undefined) => (eid ? g.engagements.get(eid)?.companyId : undefined);
  for (const p of seed.contacts ?? []) {
    const companyId = p.companyId ?? companyOfEng(p.engagementId);
    if (companyId && !out.has(companyId)) g.contacts.set(p.id, { id: p.id, seedFields: p.fields, companyId, engagementId: p.engagementId ?? null, source: p.source ?? "Demand scan" });
  }
  for (const p of s.contacts) {
    const companyId = p.companyId ?? companyOfEng(p.engagementId);
    if (companyId && !out.has(companyId) && !g.contacts.has(p.id)) g.contacts.set(p.id, { id: p.id, seedFields: {}, companyId, engagementId: p.engagementId ?? null, source: "Member added" });
  }
  // The switch: unverified names from public profiles show only while the table is under the
  // threshold and the admins' switch is on. Off, those seats read as unnamed everywhere (their role
  // is free again, and they can be claimed as unnamed seats). Verified and claimed names stay.
  if (publicNames && !publicNamesOn(seed, s, g)) {
    for (const e of g.engagements.values()) {
      if (e.holderFrom !== PUBLIC_PROFILE || s.values[fkey(e.id, "operator")] || nameVerified(s, e.id)) continue;
      const { operator: _name, ...rest } = e.seedFields; // eslint-disable-line @typescript-eslint/no-unused-vars
      e.seedFields = rest;
      delete e.holderFrom;
    }
  }
  return g;
}

/* ---------- seat-holder names from public profiles ---------- */

/** EngagementRec's and the seed's mark for a seat-holder name read from public profiles (scripts/add-seat-names.mjs). */
export const PUBLIC_PROFILE = "public profile";
/** Unverified names show while the table has fewer seats than this (RN_UNVERIFIED_NAMES_UNTIL, 10,000 unless set). */
export function namesUntil(): number {
  const n = Number.parseInt(process.env.RN_UNVERIFIED_NAMES_UNTIL ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 10_000;
}
/** Seats on the table for the switch: past and current seats, not open roles (and not a posting that came down with nobody named). */
function seatCount(seed: Seed, s: State, g: Graph): number {
  const tracks = buildTracks(seed, s);
  let n = 0;
  for (const e of g.engagements.values()) {
    if (isOpenRole(e, s, tracks)) continue;
    if (e.source === "Demand scan" && !valueOf(e, s, "operator")) continue;
    n++;
  }
  return n;
}
/** Unverified names from public profiles show: the admins' switch is on and the table is under namesUntil() seats. */
function publicNamesOn(seed: Seed, s: State, g: Graph): boolean {
  if (s.names?.hide) return false;
  return seatCount(seed, s, g) < namesUntil();
}
/** The members whose "This is me" on this seat waits for an admin. */
const pendingClaimers = (s: State, engId: string) => (s.names?.claims ?? []).filter((c) => c.engagementId === engId && c.status === "pending").map((c) => c.memberId);
/**
 * A name from public profiles is verified once an admin says so or two members confirmed it
 * (the confirm action), not counting a member who says the seat is theirs. A member's claim
 * replaces the name, so it is verified by the claim itself.
 */
function nameVerified(s: State, engId: string): boolean {
  if (s.names?.verified?.[engId]) return true;
  const claimers = new Set(pendingClaimers(s, engId));
  return (s.verifications[fkey(engId, "operator")] ?? []).filter((m) => !claimers.has(m)).length >= 2;
}
/** The seat's holder is a name from public profiles that nobody claimed or took off. */
function publicName(e: Node | undefined, s: State): FieldValue | null {
  const v = valueOf(e, s, "operator");
  return v?.pub && v.status === "live" ? v : null;
}
/** The same, and not verified yet: it shows with a Verify button, and its seat is unclaimed. */
const unverifiedName = (e: Node | undefined, s: State) => !!e && !!publicName(e, s) && !nameVerified(s, e.id);
/** Unclaimed (contract 2): a seat Revenue Nomad found with no holder, or with an unverified name from public profiles. */
const unclaimedSeat = (e: EngNode, s: State) => e.source === SEAT_SCAN && (!valueOf(e, s, "operator") || unverifiedName(e, s));
/** A seed name from public profiles no member has claimed or taken off, read from the seed itself (it is there even while the switch hides it). */
function seedPublicName(seed: Seed, s: State, engId: string): string | null {
  if (s.values[fkey(engId, "operator")]) return null;
  const e = seed.engagements.find((x) => x.id === engId);
  return e?.holderFrom === PUBLIC_PROFILE && e.fields.operator ? e.fields.operator : null;
}
/** Seat claims (claimSeat, an Add that claims a found seat, and claims waiting for an admin) a member made in the 24 hours before `nowMs`. */
const claimsToday = (s: State, memberId: string, nowMs: number) =>
  (s.seatClaims ?? []).filter((c) => c.memberId === memberId && nowMs - Date.parse(c.at) < DAY).length +
  (s.names?.claims ?? []).filter((c) => c.memberId === memberId && nowMs - Date.parse(c.at) < DAY).length;
/**
 * Give what they paid back to every member who paid to see this fact and hasn't had it back, and forget
 * their unlock (the same rule as a removal on review). `why` names the refund in the credit history.
 */
function refundPaid(s: State, k: string, now: string, why?: LedgerEntry["why"]): number {
  const net = new Map<string, number>();
  for (const l of s.ledger) {
    if (l.ref !== k || (l.reason !== "unlock" && l.reason !== "refund")) continue;
    net.set(l.memberId, (net.get(l.memberId) ?? 0) - l.delta);
  }
  let n = 0;
  for (const m of new Set(s.unlocks[k] ?? [])) {
    const paid = net.get(m) ?? 0;
    if (paid <= 0) continue;
    // All of it: 1 credit for a fact, COMPANY_PRICE for a company.
    s.ledger.push({ memberId: m, delta: paid, reason: "refund", ref: k, at: now, ...(why ? { why } : {}) });
    n++;
  }
  delete s.unlocks[k];
  return n;
}
/**
 * Take a name from public profiles off a seat, for everyone, at once: the seat reads as unnamed
 * (its role is free again and it can be claimed), whoever paid to see the name gets the credit back
 * once, and its confirmations go. Claims waiting on it stay for an admin.
 */
function takeNameOff(s: State, engId: string, how: NamesState["removed"][string]["how"], now: string): number {
  const k = fkey(engId, "operator");
  // The removed value keeps the seed's name off the seat. It holds no text: the name isn't kept anywhere it wasn't.
  s.values[k] = { value: "", by: "seed", at: now, status: "removed" };
  delete s.verifications[k];
  const back = refundPaid(s, k, now, "name");
  (s.names ??= emptyNames()).removed[engId] = { at: now, how };
  return back;
}

/**
 * The graph of a committed state, built once for every view and patch that reads that state
 * (views only read it). A draft inside mutate() changes in place, so it always gets its own.
 */
const viewGraphs = new WeakMap<State, { seed: Seed; g: Graph }>();
function viewGraph(seed: Seed, s: State): Graph {
  if (s !== stateCache) return graph(seed, s);
  const hit = viewGraphs.get(s);
  if (hit && hit.seed === seed) return hit.g;
  const g = graph(seed, s);
  viewGraphs.set(s, { seed, g });
  return g;
}
/** Public id of every company, seat and person in a graph -> the internal id of its company. */
const companyByPub = new WeakMap<Graph, Map<string, string>>();
/**
 * Every public id an index has held -> its company. A seat or a person never moves to another
 * company, so this still names the company of a record an action took off the table, and the
 * action's answer can carry that company without it.
 */
const companyOfPub = new Map<string, string>();
function companyIndex(g: Graph): Map<string, string> {
  let ix = companyByPub.get(g);
  if (!ix) {
    ix = new Map();
    for (const c of g.companies.values()) ix.set(pubId(c.id), c.id);
    for (const e of g.engagements.values()) ix.set(pubId(e.id), e.companyId);
    for (const p of g.contacts.values()) ix.set(pubId(p.id), p.companyId);
    for (const [pub, co] of ix) companyOfPub.set(pub, co);
    companyByPub.set(g, ix);
  }
  return ix;
}

/* ---------- company facts from research: firmographics and place ---------- */

/**
 * The free facts a company the weekly scan added can take from Revenue Nomad's own records:
 * what it does, how big it is, its revenue and where it is. Never its name, website, LinkedIn
 * or About, which would give a locked company away.
 */
export const RESEARCH_FIELDS = ["industry", "employees", "revenue", "hq"] as const;
/** The seed's companies by website and by name key, built once per seed. */
const researchIndex = new WeakMap<Seed, { bySite: Map<string, SeedCompany>; byName: Map<string, SeedCompany> }>();
function researchOf(seed: Seed) {
  let ix = researchIndex.get(seed);
  if (!ix) {
    ix = { bySite: new Map(), byName: new Map() };
    for (const c of seed.companies) {
      if (!RESEARCH_FIELDS.some((f) => c.fields[f])) continue;
      const site = siteKey(c.fields.website);
      if (site && !ix.bySite.has(site)) ix.bySite.set(site, c);
      const nk = keyOfCompany(c.fields.name ?? "");
      if (nk && !ix.byName.has(nk)) ix.byName.set(nk, c);
    }
    researchIndex.set(seed, ix);
  }
  return ix;
}
/**
 * A company the weekly scan added starts with a name and maybe a website. When Revenue Nomad's
 * records have the same company (same website, else the same name), its industry, size,
 * revenue and HQ fill the gaps, as free facts from "Revenue Nomad research" (Cell.from
 * "research"). They show while the company is locked: they are what a member decides on.
 * Anything a member or the scan wrote stays ahead of them. Returns the fields filled.
 */
function researchFill(seed: Seed, s: State, node: CompanyNode): string[] {
  const ix = researchOf(seed);
  const site = siteKey(s.values[fkey(node.id, "website")]?.value);
  const match = (site && ix.bySite.get(site)) || ix.byName.get(keyOfCompany(node.name));
  if (!match || match.id === node.id) return [];
  const filled: string[] = [];
  for (const f of RESEARCH_FIELDS) {
    const v = match.fields[f];
    if (!v || node.seedFields[f]) continue;
    node.seedFields[f] = v;
    filled.push(f);
  }
  if (filled.includes("hq") && match.fields.country) {
    node.seedFields.country = match.fields.country;
    if (match.fields.region) node.seedFields.region = match.fields.region;
  }
  if (filled.length) node.research = new Set(filled);
  return filled;
}

const geoCache = new Map<string, Geo>();
const NOWHERE: Geo = { country: null, region: null };
/**
 * Where a company is: the country and region its HQ names (lib/geo.ts), whichever way the HQ
 * was typed. Read from what was stored with the HQ when there is one (a member's fill, the
 * seed's cleanup), else from the HQ text itself.
 */
function geoOf(c: Node | undefined, s: State): Geo {
  const v = valueOf(c, s, "hq");
  if (!v || v.status !== "live") return NOWHERE;
  if (v.geo) return v.geo;
  if (v.by === "seed" && c!.seedFields.country && c!.seedFields.hq === v.value) return { country: c!.seedFields.country, region: c!.seedFields.region || null };
  let geo = geoCache.get(v.value);
  if (!geo) {
    geo = normalizeHq(v.value);
    if (geoCache.size > 20_000) geoCache.clear();
    geoCache.set(v.value, geo);
  }
  return geo;
}

/** Firms kept on the table only because a member holds a seat there, waiting for an admin (lib/firmRemoval.ts). */
const firmsInReview = (seed: Seed, s: State) => new Set([...(seed.firmReview ?? []), ...(s.firmReview ?? [])].map((r) => r.companyId));

/* ---------- helpers ---------- */

/**
 * The member a personal sign-in token belongs to. A seed member who chose "Sign out on other
 * devices" has a new token in State.tokens, and the seed's one stops working. The member comes
 * back with the token that works now.
 */
export const memberByToken = (seed: Seed, token: string | null | undefined, s?: State): Member | null => {
  if (!token) return null;
  const over = s?.tokens;
  if (over) {
    for (const m of seed.members) {
      const t = over[m.id];
      if (t ? t === token : m.token === token) return t ? { ...m, token: t } : m;
    }
  } else {
    const m = seed.members.find((x) => x.token === token);
    if (m) return m;
  }
  return s?.members.find((m) => m.token === token) ?? null;
};
/** A seed member with the token that works now (see memberByToken). */
const withToken = (m: Member, s: State): Member => (s.tokens?.[m.id] ? { ...m, token: s.tokens[m.id] } : m);

export async function memberForToken(token: string | null | undefined): Promise<Member | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  return memberByToken(seed, token, s);
}

export async function memberByEmail(emailRaw: string): Promise<Member | null> {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!email) return null;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  // One inbox is one account, as at join: another spelling of a member's Gmail address finds that member.
  const inbox = inboxKey(email);
  const seeded = seed.members.find((m) => m.email && inboxKey(m.email) === inbox);
  return (seeded ? withToken(seeded, s) : null) ?? s.members.find((m) => inboxKey(m.email) === inbox) ?? null;
}

const inviteCodes = new Map<string, string>();
export const inviteCode = (memberId: string) => {
  let c = inviteCodes.get(memberId);
  if (c === undefined) {
    c = createHash("sha256").update(`rn-invite:${memberId}`).digest("base64url").slice(0, 8);
    inviteCodes.set(memberId, c);
  }
  return c;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** The first name of the member whose invite code this is (the landing names the inviter), or null. */
export async function inviterName(codeRaw: unknown): Promise<string | null> {
  const code = String(codeRaw ?? "").trim();
  if (!code) return null;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = seed.members.find((x) => inviteCode(x.id) === code) ?? s.members.find((x) => inviteCode(x.id) === code);
  return m ? firstName(m.name) : null;
}

/**
 * Public ids. Engagement and person ids carry the seat holder's or the person's name, so the
 * client only ever sees this opaque HMAC of them (same first letter: e_ or p_).
 */
const ID_KEY = process.env.RN_ID_SECRET || process.env.RN_INTEL_SEED_KEY || "rn-dev-ids";
const pubIds = new Map<string, string>();
const pubId = (id: string) => {
  let p = pubIds.get(id);
  if (p === undefined) {
    p = `${id[0]}_${createHmac("sha256", ID_KEY).update(id).digest("base64url").slice(0, 12)}`;
    pubIds.set(id, p);
  }
  return p;
};
/** The id the client sees for a record: company ids as they are, the rest as pubId. */
const outId = (_entity: Entity, id: string) => pubId(id);

const fkey = (id: string, field: string) => `${id}.${field}`;
const slug = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "");
const newId = (p: string, name = "") => `${p}_${slug(name).slice(0, 20)}${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const DAY = 24 * 60 * 60 * 1000;
/** Label in running text: "role", but "HQ" and "LinkedIn" keep their capitals. */
const lower = (label: string) => (/[A-Z]/.test(label.slice(1)) ? label : label.toLowerCase());
/** A field inside a sentence, with its article: "the role", "a person's email". */
const say = (entity: Entity, key: string) => {
  const f = fieldDef(entity, key);
  return f ? f.say ?? `the ${lower(f.label)}` : "that fact";
};
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** An id that points at nothing (the record was removed, or the page is out of date). */
const gone = (entity: Entity) =>
  `We couldn't find that ${entity === "company" ? "company" : entity === "engagement" ? "seat" : "person"}. It may have been removed. Refresh the page and try again.`;
/** Ledger reasons that count toward the daily earning cap: everything a member earns. */
const EARNING = new Set(["fill", "referral", "confirm"]);
/** Max facts a member can unlock per rolling 24 hours (stops scraping). */
const UNLOCK_DAILY_MAX = 100;
/**
 * The same limit in an account's first 24 hours (throwaway accounts). Never under the starter
 * credits, so a new member can always spend what they were given on day one.
 */
const NEW_MEMBER_UNLOCK_MAX = Math.max(25, STARTER_CREDITS);
/** Reports a member can make per rolling 24 hours. */
const REPORT_DAILY_MAX = 10;
/** How long a claim on an open role stays on file (State.roleClaims): the limit needs 24 hours, the admin's list 30 days. */
const CLAIM_KEEP = 30 * DAY;
/** Field keys any record can have (values under other keys are ignored). */
const FIELD_KEYS = new Set(ALL_FIELDS.map((x) => x.f.key));

export function balance(s: State, memberId: string): number {
  let b = STARTER_CREDITS;
  for (const e of s.ledger) if (e.memberId === memberId) b += e.delta;
  return b;
}

/** Credits earned in the rolling 24 hours before `nowMs`, and when earning reopens if at the cap. */
function earning(s: State, memberId: string, nowMs: number): { earned: number; resetsAt: string | null } {
  const recent = s.ledger
    .filter((l) => l.memberId === memberId && l.delta > 0 && EARNING.has(l.reason) && !l.undone && nowMs - Date.parse(l.at) < DAY)
    .sort((a, b) => a.at.localeCompare(b.at));
  const earned = recent.reduce((n, l) => n + l.delta, 0);
  if (earned < EARN_CAP) return { earned, resetsAt: null };
  let left = earned;
  for (const l of recent) {
    left -= l.delta;
    if (left < EARN_CAP) return { earned, resetsAt: new Date(Date.parse(l.at) + DAY).toISOString() };
  }
  return { earned, resetsAt: null };
}

/**
 * Pay a bonus within the member's daily room. Whatever doesn't fit is held and paid later
 * by releaseHeld. Returns what was paid now.
 */
function grant(s: State, memberId: string, delta: number, reason: "referral" | "confirm", ref: string, now: string): number {
  const room = Math.max(0, EARN_CAP - earning(s, memberId, Date.parse(now)).earned);
  const pay = Math.min(delta, room);
  if (pay > 0) s.ledger.push({ memberId, delta: pay, reason, ref, at: now });
  if (delta > pay) s.held.push({ memberId, delta: delta - pay, reason, ref, at: now });
  return pay;
}

/** Pay held bonuses, oldest first, as far as the member's daily room allows. */
function releaseHeld(s: State, memberId: string, now: string): void {
  if (!s.held.some((h) => h.memberId === memberId)) return;
  const keep: State["held"] = [];
  for (const h of s.held) {
    if (h.memberId !== memberId) {
      keep.push(h);
      continue;
    }
    const room = Math.max(0, EARN_CAP - earning(s, memberId, Date.parse(now)).earned);
    const pay = Math.min(h.delta, room);
    if (pay > 0) s.ledger.push({ memberId, delta: pay, reason: h.reason, ref: h.ref, at: now });
    if (h.delta > pay) keep.push({ ...h, delta: h.delta - pay });
  }
  s.held = keep;
}

const heldFor = (s: State, memberId: string) => s.held.reduce((n, h) => n + (h.memberId === memberId ? h.delta : 0), 0);

/**
 * How many different invitees paid `inviter` the invite bonus in the 30 days before `nowMs`: the
 * inviter is paid for REFERRAL_LIMIT of them (referralBonus), and the invite loop's lines promise
 * the inviter a bonus only under it. Invitees, not rows: a bonus split by the daily cap leaves a
 * ledger row and a held row, and later releases add more. The inviter's own row for having been
 * invited is not an invite.
 */
function inviteesPaid(s: State, inviter: string, nowMs: number): number {
  const ownReferrer = s.members.find((m) => m.id === inviter)?.referredBy;
  const firstPaid = new Map<string, number>();
  const note = (ref: string, at: string) => {
    const invitee = refRecord(ref);
    if (!ref.endsWith(".referral") || invitee === ownReferrer) return;
    firstPaid.set(invitee, Math.min(firstPaid.get(invitee) ?? Infinity, Date.parse(at)));
  };
  for (const l of s.ledger) if (l.memberId === inviter && l.reason === "referral" && l.delta > 0) note(l.ref, l.at);
  for (const h of s.held) if (h.memberId === inviter && h.reason === "referral") note(h.ref, h.at);
  return [...firstPaid.values()].filter((t) => nowMs - t < 30 * DAY).length;
}

/**
 * The invite bonus, once per invitee: REFERRAL_BONUS to a member who joined through a fellow
 * member's invite code (referredBy), and the same to that inviter for up to REFERRAL_LIMIT
 * different invitees in 30 days. Both within the daily earning cap, the rest held (grant). It is
 * due when the invitee adds a first fact to a record, or claims their seat through the inviter's
 * claim link (connectInvite). `due`: it was due now (paid or held). `paid`: what the invitee got at
 * once. `inviter`: the inviter's first name when they got theirs too.
 */
function referralBonus(s: State, seed: Seed, inviteeId: string, now: string): { due: boolean; paid: number; inviter: string | null } {
  const joined = s.members.find((m) => m.id === inviteeId);
  if (!joined?.referredBy || s.referralPaid.includes(inviteeId)) return { due: false, paid: 0, inviter: null };
  s.referralPaid.push(inviteeId);
  const inviter = joined.referredBy;
  let inviterFirst: string | null = null;
  if (inviteesPaid(s, inviter, Date.parse(now)) < REFERRAL_LIMIT) {
    grant(s, inviter, REFERRAL_BONUS, "referral", `${inviteeId}.referral`, now);
    const who = s.members.find((m) => m.id === inviter) ?? seed.members.find((m) => m.id === inviter);
    if (who) inviterFirst = firstName(who.name);
  }
  return { due: true, paid: grant(s, inviteeId, REFERRAL_BONUS, "referral", `${inviter}.referral`, now), inviter: inviterFirst };
}

/** The member whose invite code this is (?ref= on a link), or null. */
function memberByInviteCode(seed: Seed, s: State, codeRaw: unknown): Member | null {
  const code = String(codeRaw ?? "").trim().slice(0, 40);
  if (!code) return null;
  return seed.members.find((m) => inviteCode(m.id) === code) ?? s.members.find((m) => inviteCode(m.id) === code) ?? null;
}

/**
 * Invite to connect is offered on this seat to `me`: they see who held it (`sees`: the seat holder
 * cell is a value for them, and the company is not locked), it isn't their own, and its holder is
 * not a member who has signed in (those get Message instead). The holder must be someone the seat's
 * claim link can bring in: a name from public profiles on a seat Revenue Nomad found (they claim
 * it, lib/claimToken.ts), or a member who has never signed in (they sign in on the claim page). A
 * name that resolves to nobody on Merlin and isn't from public profiles can't use the link, so it
 * gets no invite. Needs the seed key (no key, no claim links).
 */
function invitable(s: State, idx: MemberIndex, me: Member, e: EngNode, sees: boolean): boolean {
  if (!sees) return false;
  const op = valueOf(e, s, "operator");
  if (!op || op.status !== "live") return false;
  const holder = seatHolder(s, idx, e.id, op);
  if (holder?.id === me.id || (holder && signedIn(s, idx, holder.id))) return false;
  if (!holder && !(e.source === SEAT_SCAN && op.pub)) return false;
  return !!claimToken(e.id);
}

/** What connectInvite did: the conversation it opened (or found), and the invite bonus. */
interface Connected {
  conversationId: string | null;
  /** The inviter's first name. */
  inviter: string;
  /** The invite bonus was due: the invitee gets REFERRAL_BONUS (now, or held under the daily cap). */
  bonus: boolean;
  /** The inviter got it too (under REFERRAL_LIMIT). */
  inviterBonus: boolean;
}

/**
 * Invite to connect, the claim: `invitee` claimed seat `engId` through `inviterId`'s claim link
 * (or an admin approved that claim, or the seat was already theirs and they signed in through the
 * link). Once per invite, and only for an invite that stands: the inviter sent it (a SeatInvite)
 * or paid to see who held the seat (a link from the connector has no record), and the name they
 * saw was not taken off the seat after they sent it. Never between a member and themselves. At once:
 *  - the invite bonus for both (referralBonus), the claim counting as the invitee's first fact:
 *    when `bonus` is on and the invitee joined through this inviter's invite code. Once per
 *    invitee, REFERRAL_LIMIT for the inviter, the daily cap for both.
 *  - a conversation between them about the seat, its first message from the inviter (their note,
 *    connectText), unless they have one about this seat already, and none while either blocked the
 *    other. It counts as unread for both until each opens it (lib/messageState.ts).
 * Null when the invite doesn't stand.
 */
function connectInvite(s: State, seed: Seed, g: Graph, invitee: Member, engId: string, inviterId: string, now: string, bonus = true): Connected | null {
  if (!inviterId || inviterId === invitee.id) return null;
  const idx = memberIndex(seed, s);
  const inviter = idx.byId.get(inviterId);
  const e = g.engagements.get(engId);
  if (!inviter || !e) return null;
  s.seatInvites ??= [];
  let inv = s.seatInvites.find((x) => x.by === inviterId && x.engagementId === engId);
  const paidForName = (s.unlocks[fkey(engId, "operator")] ?? []).includes(inviterId) || (s.unlocks[fkey(engId, "role")] ?? []).includes(inviterId);
  if (!inv && !paidForName) return null;
  if (inv?.claimedBy) return null;
  // The name they invited came off the seat since (This is wrong, Remove my name): that invite no longer stands.
  const off = s.names?.removed?.[engId];
  if (inv && off && off.at > inv.at) return null;
  if (!inv) {
    inv = { by: inviterId, engagementId: engId, at: now };
    s.seatInvites.push(inv);
  }
  inv.claimedBy = invitee.id;
  inv.claimedAt = now;
  const joined = s.members.find((m) => m.id === invitee.id);
  const paid = bonus && joined?.referredBy === inviterId ? referralBonus(s, seed, invitee.id, now) : null;
  s.conversations ??= [];
  const blocked = (s.blocks?.[inviterId] ?? []).includes(invitee.id) || (s.blocks?.[invitee.id] ?? []).includes(inviterId);
  let conv = s.conversations.find((c) => c.about.engagementId === engId && ((c.a === inviterId && c.b === invitee.id) || (c.a === invitee.id && c.b === inviterId)));
  if (!conv && !blocked) {
    // The note they sent, else (a link from the connector) the note the app would have written.
    const ip = s.profiles[inviterId] ?? {};
    const note =
      inv.note ??
      notePitch({
        first: firstName(invitee.name),
        role: live(e, s, "role"),
        fn: fnOf(e, s),
        company: g.companies.get(e.companyId)?.name ?? "the company",
        myTitle: ip.title || inviter.title,
        myFn: ip.function ?? functionOf(ip.title || inviter.title),
        icp: ip.icp ?? null,
      });
    conv = {
      id: `cv${randomBytes(8).toString("hex")}`,
      a: inviterId,
      b: invitee.id,
      about: { companyId: e.companyId, engagementId: engId },
      kind: "invite",
      messages: [{ id: `m${randomBytes(8).toString("hex")}`, by: inviterId, at: now, text: connectText(firstName(inviter.name), note) }],
      readAt: {},
      status: "open",
      createdAt: now,
    };
    s.conversations.push(conv);
  }
  if (conv) inv.conversationId = conv.id;
  return { conversationId: conv?.id ?? null, inviter: firstName(inviter.name), bonus: !!paid?.due, inviterBonus: !!paid?.inviter };
}

/** What the claim's answer adds when it came through an invite: the conversation, and the bonus. */
function connectedNote(c: Connected | null): string {
  if (!c) return "";
  const thread = c.conversationId ? ` ${c.inviter} invited you to connect as referral partners, and your conversation is open in Messages.` : "";
  const bonus = c.bonus ? (c.inviterBonus ? ` You and ${c.inviter} each get ${REFERRAL_BONUS} credits.` : ` You get ${REFERRAL_BONUS} credits for joining through ${c.inviter}'s invite.`) : "";
  return `${thread}${bonus}`;
}

/* ---------- limits beside the daily earning cap ---------- */

/**
 * A company's pick lists: industry, employees, revenue and the four "How they sell" lists. One
 * click each and easy to guess, so they share their own limits. On a company the member added,
 * or where they hold a seat, they are not limited (see pickExempt).
 */
const SELL_FIELDS = new Set(["businessModel", "motion", "dealSize", "salesCycle", "industry", "employees", "revenue", "ownership"]);
/** A ledger ref for a company pick-list answer (engagements have a revenue and employees "at the time" too; those are not counted). */
const isPickRef = (ref: string) => ref.startsWith("c_") && SELL_FIELDS.has(refField(ref));
/** Pick-list answers that earn a credit, per member per rolling 24 hours. More still save, for no credit. */
const SELL_EARN_MAX = 5;
/** Pick-list answers a member can save per rolling 24 hours. */
const SELL_SAVE_MAX = 20;
/** What the pick-list limits are about, in running text. */
const PICKS = "a company's industry, size, revenue or how they sell";
/** Facts a member can add to records per rolling 24 hours, not counting their own seats (a backstop against a flood). */
const FILL_DAILY_MAX = 150;
/** What still earns once the pick-list answers have stopped. */
const SELL_STILL_EARNS = "An HQ, a website, a person or a fact on your own seat still earns.";
/** The refusal past SELL_SAVE_MAX pick-list answers in a day. */
const SELL_FULL = `You've added ${SELL_SAVE_MAX} answers today for ${PICKS}. Add more tomorrow. An HQ, a website, a person or a fact on your own seat can go in now.`;

const refField = (ref: string) => ref.slice(ref.lastIndexOf(".") + 1);
const refRecord = (ref: string) => ref.slice(0, Math.max(0, ref.lastIndexOf(".")));

/** A member's fills on records in the rolling 24 hours before `nowMs` (benchmark-only rates are not on a record). */
const fillsToday = (s: State, memberId: string, nowMs: number) =>
  s.ledger.filter((l) => l.memberId === memberId && l.reason === "fill" && !l.ref.startsWith("bench.") && nowMs - Date.parse(l.at) < DAY);

/** Company pick-list answers a member saved, and was paid for, in the rolling 24 hours before `nowMs`, leaving out companies `exempt` names. */
function sellToday(s: State, memberId: string, nowMs: number, exempt: (companyId: string) => boolean = () => false): { saved: number; earned: number } {
  let saved = 0;
  let earned = 0;
  for (const l of fillsToday(s, memberId, nowMs)) {
    if (!isPickRef(l.ref) || exempt(refRecord(l.ref))) continue;
    // A taken-back answer still counts as saved (the backstop), but frees its earning place.
    saved++;
    if (l.delta > 0 && !l.undone) earned++;
  }
  return { saved, earned };
}

/** Companies whose pick lists a member fills without the daily limits: ones they added, and ones where they hold a seat (`seatAt`). */
function pickExempt(s: State, memberId: string, seatAt: Set<string>): (companyId: string) => boolean {
  const added = new Set(s.companies.filter((c) => c.by === memberId).map((c) => c.id));
  return (companyId) => added.has(companyId) || seatAt.has(companyId);
}

/**
 * Unlocks a member has left today: UNLOCK_DAILY_MAX in any rolling 24 hours, and
 * NEW_MEMBER_UNLOCK_MAX while the account is in its first 24 hours (seed members have no join time).
 */
function unlockRoom(s: State, memberId: string, nowMs: number): { left: number; firstDay: boolean } {
  let used = 0;
  // Counted in credits: a company (COMPANY_PRICE) counts as that many unlocks, so day one's limit stays the starter credits.
  for (const l of s.ledger) if (l.memberId === memberId && l.reason === "unlock" && nowMs - Date.parse(l.at) < DAY) used += Math.max(1, -l.delta);
  const joinedAt = s.members.find((m) => m.id === memberId)?.at;
  const firstDay = !!joinedAt && nowMs - Date.parse(joinedAt) < DAY;
  return { left: Math.max(0, (firstDay ? NEW_MEMBER_UNLOCK_MAX : UNLOCK_DAILY_MAX) - used), firstDay };
}

/** What a member sees of their balance: never a negative number. A shortfall is shown as credits owed. */
const shownBalance = (bal: number) => ({ credits: Math.max(0, bal), owed: Math.max(0, -bal) });

/* ---------- a member's networks (for the invite rule) ---------- */

/** How many recent networks are kept per member. */
const IP_KEEP = 5;
/** A network as it is stored: a hash, never the address. */
const ipHashOf = (ip: string) => createHash("sha256").update("rn-ip:" + ip).digest("hex").slice(0, 16);
/** Remember a network for a member: newest last, at most IP_KEEP. */
function keepIp(s: State, memberId: string, hash: string): void {
  const all = (s.ips ??= {});
  all[memberId] = [...(all[memberId] ?? []).filter((h) => h !== hash), hash].slice(-IP_KEEP);
}
/** Every network on file for a member: the recent list, and the one a joined account signed up from. */
const networksOf = (s: State, memberId: string) =>
  new Set([...(s.ips?.[memberId] ?? []), ...s.members.filter((m) => m.id === memberId && m.ipHash).map((m) => m.ipHash!)]);

/** Gmail delivers a.b+tag@gmail.com and ab@googlemail.com to one inbox, so they compare as one address. Other addresses compare as typed. */
function inboxKey(emailRaw: string): string {
  const email = emailRaw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  const domain = email.slice(at + 1);
  if (at < 1 || (domain !== "gmail.com" && domain !== "googlemail.com")) return email;
  return `${email.slice(0, at).split("+")[0].replace(/\./g, "")}@gmail.com`;
}

/** Effective value: a runtime value wins over the seed value. */
function valueOf(node: Node | undefined, s: State, field: string): FieldValue | null {
  if (!node) return null;
  const v = s.values[fkey(node.id, field)];
  if (v) return v.status === "removed" ? null : v;
  const sv = node.seedFields[field];
  if (!sv) return null;
  // A seat holder named from public profiles says so (FieldValue.pub).
  return field === "operator" && (node as EngNode).holderFrom === PUBLIC_PROFILE ? { value: sv, by: "seed", at: "", status: "live", pub: true } : { value: sv, by: "seed", at: "", status: "live" };
}
/** Values from our own records (the seed) or the weekly scan: nobody earned a credit for them. */
const isSystem = (by: string) => by === "seed" || by === "scan" || by === ABOUT_BY;
const live = (node: Node | undefined, s: State, field: string) => {
  const v = valueOf(node, s, field);
  return v && v.status === "live" ? v.value : null;
};

/* ---------- members as seat holders ---------- */

/** Names compare without case, accents, punctuation or extra spaces. */
export const normName = (n: string) =>
  n.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z\s'-]/g, " ").replace(/\s+/g, " ").trim();

interface MemberIndex {
  byId: Map<string, Member>;
  byName: Map<string, Member[]>;
  all: Member[];
  /** Seed members, and when each joined account joined, for two members who share a name (see seatMember). */
  seedIds: Set<string>;
  joinedAt: Map<string, string>;
}
let memberIndexCache: { seed: Seed; s: State; idx: MemberIndex } | null = null;
/** Every member (seed and joined), by id and by normalized name. Rebuilt when the state changes. */
function memberIndex(seed: Seed, s: State): MemberIndex {
  if (memberIndexCache && memberIndexCache.seed === seed && memberIndexCache.s === s) return memberIndexCache.idx;
  const all = [...seed.members, ...s.members].filter((m) => m.name?.trim());
  const byId = new Map(all.map((m) => [m.id, m]));
  const byName = new Map<string, Member[]>();
  for (const m of all) {
    const k = normName(m.name);
    byName.set(k, [...(byName.get(k) ?? []), m]);
  }
  const idx = { byId, byName, all, seedIds: new Set(seed.members.map((m) => m.id)), joinedAt: new Map(s.members.map((m) => [m.id, m.at])) };
  memberIndexCache = { seed, s, idx };
  return idx;
}

/**
 * The member a seat-holder value points to: the one picked when it was added, else the member
 * whose name matches exactly. A later account with the same name never takes the match from the
 * member who had it (joining asks only for a name): a seed member wins, two seed members with one
 * name match neither, and among joined accounts the one that joined first.
 */
function seatMember(idx: MemberIndex, v: FieldValue): Member | null {
  // A name from public profiles is nobody on Merlin until they claim the seat: a member who shares the name is not them.
  if (v.pub) return null;
  if (v.memberId) return idx.byId.get(v.memberId) ?? null;
  const key = normName(v.value);
  if (!key) return null;
  const same = idx.byName.get(key) ?? [];
  if (same.length <= 1) return same[0] ?? null;
  const seeded = same.filter((m) => idx.seedIds.has(m.id));
  if (seeded.length) return seeded.length === 1 ? seeded[0] : null;
  return [...same].sort((a, b) => (idx.joinedAt.get(a.id) ?? "").localeCompare(idx.joinedAt.get(b.id) ?? ""))[0];
}

/**
 * The member who holds this seat: the live seat-holder value resolves to them and they have
 * not said "this isn't me" (State.notMine). Their own seat is free for them to see and fix.
 */
function seatHolder(s: State, idx: MemberIndex, engId: string, v: FieldValue | null): Member | null {
  if (!v || v.status !== "live") return null;
  const m = seatMember(idx, v);
  return m && !(s.notMine[m.id] ?? []).includes(engId) ? m : null;
}

/**
 * Accounts whose say-so counts where one account could otherwise change what everyone sees: a
 * claim that closes an open role, and a rate toward a benchmark. Joining takes only a name and
 * an address, and an account's age proves nothing, so a joined account counts only once
 * something vouches for it. It joined while sign-in links went by email (the link proved the
 * address), or two members who count confirmed a fact it added. Seed members always count.
 */
let trustCache: { seed: Seed; s: State; f: (memberId: string) => boolean } | null = null;
function trustOf(seed: Seed, s: State): (memberId: string) => boolean {
  if (trustCache && trustCache.seed === seed && trustCache.s === s) return trustCache.f;
  const base = new Set<string>(seed.members.map((m) => m.id));
  for (const m of s.members) if (m.proven) base.add(m.id);
  const vouched = new Set<string>();
  for (const [k, list] of Object.entries(s.verifications)) {
    if (list.length < 2) continue;
    const v = s.values[k];
    if (!v || v.status !== "live" || isSystem(v.by) || base.has(v.by) || vouched.has(v.by)) continue;
    if (list.filter((x) => x !== v.by && base.has(x)).length >= 2) vouched.add(v.by);
  }
  const f = (memberId: string) => base.has(memberId) || vouched.has(memberId);
  // A draft inside mutate() changes in place, so only the committed state is kept.
  if (s === stateCache) trustCache = { seed, s, f };
  return f;
}

/**
 * The seat holder who sees their seat free, can correct it and can hide a fact on it at once.
 * Being named is not enough when a member named themselves on a seat somebody else made (that
 * would hand them its rate and the power to hide it). One of these must hold: our records or the
 * scan name them, another member named them, they made the seat, another member confirmed the
 * name, or the seat is an open role the scan follows and they took it on an account that counts.
 */
function seatOwner(
  s: State, idx: MemberIndex, trusted: (memberId: string) => boolean, tracks: Tracks, engId: string, v: FieldValue | null, createdBy: string | undefined,
  scanSeat = false,
): Member | null {
  const m = seatHolder(s, idx, engId, v);
  if (!m || !v) return null;
  if (isSystem(v.by) || v.by !== m.id || createdBy === m.id) return m;
  // A seat from the seat scan has nobody on it until its fractional claims it (claimSeat): the claim makes it theirs.
  if (scanSeat && v.memberId === m.id) return m;
  if ((s.verifications[fkey(engId, "operator")] ?? []).some((x) => x !== m.id)) return m;
  return trusted(m.id) && tracks.has(engId) ? m : null;
}

/**
 * Reopen a role that closed because a member took it: no close date, status back to "Open role".
 * Returns whether it did. A role whose posting has been gone a long while does not come back as
 * open: it was last listed more than CLOSE_AFTER ago and its board has scanned cleanly since (a
 * seed role, SEED_ROLE_LIFE ago and any clean scan since). That one closes as the scan would
 * have closed it, while the claim kept it filled.
 */
function reopenFilled(s: State, engId: string, now: string): boolean {
  const nowMs = Date.parse(now);
  let done = false;
  let gone = false;
  for (const r of Object.values(s.scan.roles)) {
    if (r.engagementId !== engId || !r.closedAt || r.closedBy !== "filled") continue;
    const unseen = nowMs - Date.parse(r.lastSeen);
    const cleanSince = r.source === "seed" ? s.scan.lastOkAt ?? null : s.scan.boards?.[r.source]?.lastOkAt ?? null;
    if (cleanSince && cleanSince > r.lastSeen && unseen > (r.source === "seed" ? SEED_ROLE_LIFE : CLOSE_AFTER)) {
      r.closedBy = "scan";
      r.closedAt = now;
      gone = true;
      continue;
    }
    r.closedAt = null;
    delete r.closedBy;
    done = true;
  }
  const sk = fkey(engId, "status");
  if (gone && !done) {
    delete s.verifications[sk];
    s.values[sk] = { value: "Closed", by: "scan", at: now, status: "live" };
  }
  if (!done) return false;
  delete s.verifications[sk];
  s.values[sk] = { value: "Open role", by: "scan", at: now, status: "live" };
  return true;
}

/**
 * A role closes when a member picks themselves as its seat holder, and that close can be
 * undone. It reopens once nobody holds the seat: the name was removed (in review or by an
 * admin), or the member it was linked to said "this isn't me". A name that is only waiting for
 * review keeps the role closed. The weekly scan can call this for a filled role it still sees
 * listed. Returns whether the role reopened.
 */
export function reopenIfUnheld(s: State, engId: string, now = new Date().toISOString()): boolean {
  const v = s.values[fkey(engId, "operator")];
  const held = !!v && v.status !== "removed" && !(v.memberId && (s.notMine[v.memberId] ?? []).includes(engId));
  return held ? false : reopenFilled(s, engId, now);
}

/**
 * A member says this seat is their own: they picked themselves as its seat holder, and the name
 * still stands (not removed, and they have not said "this isn't me"). It is the one claim that
 * closes an open role, and the weekly scan gives it the same weight on a role whose posting had
 * come down: listed again, that role stays closed. Any other name on the seat does not outweigh
 * a posting that is listed.
 */
function selfHeld(s: State, engId: string): boolean {
  const v = s.values[fkey(engId, "operator")];
  return !!v && v.status !== "removed" && !!v.memberId && v.memberId === v.by && !(s.notMine[v.memberId] ?? []).includes(engId);
}

/** Empty fillable facts on an engagement (each earns its seat holder a credit). */
const ENG_FILLABLE = FILLABLE.filter((x) => x.entity === "engagement").map((x) => x.f.key);
const ENG_GATED = ALL_FIELDS.filter((x) => x.entity === "engagement" && x.f.gated).map((x) => x.f.key);
/** Every engagement field a member sees on a seat. */
const ENG_KEYS = ALL_FIELDS.filter((x) => x.entity === "engagement" && !x.f.identity).map((x) => x.f.key);
function missingOnSeat(e: Node, s: State): number {
  let n = 0;
  for (const k of ENG_FILLABLE) {
    if (valueOf(e, s, k)) continue;
    // Function shows as filled when the role gives it away.
    if (k === "function" && functionOf(live(e, s, "role"))) continue;
    // Why it ended is asked only once the seat has.
    if (k === "endReason" && live(e, s, "status") !== "Ended" && !/^\d{4}/.test(live(e, s, "end") ?? "")) continue;
    n++;
  }
  return n;
}

/**
 * A member who has signed in at least once: a joined account (joining signs you in), a visit, an
 * onboarding answer or a network on file. A seed member we only invited has none of these. The
 * seat holder picker lists only these members, and only these get the "Member" tag on a seat.
 */
const signedIn = (s: State, idx: MemberIndex, id: string) => idx.joinedAt.has(id) || !!s.seen[id] || !!s.profiles[id] || !!s.ips?.[id]?.length;

/**
 * Members whose name matches a search, for the seat-holder picker. Signed-in members only, and
 * it lists only members who have signed in themselves (a visit, a profile, or a joined
 * account) plus the searcher, so the picker is not a directory of everyone we invited. A seat
 * still links to someone who has not signed in when their exact full name is typed (seatMember).
 */
export async function searchMembers(token: string | null, q: string): Promise<{ id: string; name: string; title: string; you: boolean }[]> {
  const seed = await loadSeed();
  const s = await loadState();
  const me = memberByToken(seed, token, s);
  if (!me) return [];
  const words = normName(String(q ?? "").slice(0, 60)).split(" ").filter(Boolean);
  if (!words.length || words.join("").length < 2) return [];
  const idx = memberIndex(seed, s);
  const hits: { m: Member; score: number }[] = [];
  for (const m of idx.all) {
    if (m.id !== me.id && !signedIn(s, idx, m.id)) continue;
    const parts = normName(m.name).split(" ");
    // Every typed word must start one of the name's words ("jan sm" finds Jane Smith).
    if (!words.every((w) => parts.some((p) => p.startsWith(w)))) continue;
    const exact = normName(m.name) === words.join(" ");
    hits.push({ m, score: (exact ? 0 : 1) * 10 + (parts[0].startsWith(words[0]) ? 0 : 1) });
  }
  hits.sort((a, b) => a.score - b.score || a.m.name.localeCompare(b.m.name));
  return hits.slice(0, 8).map(({ m }) => ({ id: pubId(m.id), name: m.name, title: m.title ?? "", you: m.id === me.id }));
}

/**
 * One field as `me` sees it. `free` shows a gated fact without an unlock: a seat holder's own
 * seat, or the posting of a role the weekly scan closed (see postingFree). An end month that says
 * no more than the status (endFree) is always free, and so, with SEAT_SCAN_ROLE_FREE, is the role
 * of a seat Revenue Nomad found that nobody is named on (scanRoleFree).
 */
function cellOf(s: State, me: Member | null, node: Node | undefined, entity: Entity, key: string, idx?: MemberIndex, free = false): Cell {
  if (entity === "engagement" && ((key === "end" && endFree(node, s)) || (key === "role" && scanRoleFree(node, s)))) free = true;
  const f = fieldDef(entity, key)!;
  const v = valueOf(node, s, f.key);
  if (!v) return { s: "empty" };
  if (f.system) return { s: "value", v: v.value, ver: 0, system: true, ...(v.by === ABOUT_BY ? { from: "website" as const } : {}) };
  const mine = !!me && v.by === me.id;
  const byMe = !!me && !!v.reporters?.includes(me.id);
  if (v.status === "reported") return { s: "reported", mine, ...(byMe ? { byMe } : {}) };
  // One report hides a fact only for the member who reported it.
  if (byMe) return { s: "reported", mine: false, byMe };
  const k = fkey(node!.id, f.key);
  const vers = s.verifications[k] ?? [];
  // Only members' confirmations count. A fact from our own records or the scan says where it came from instead.
  const ver = vers.length;
  // (The "Active" a member's claim puts on an open role is written as the scan's, but no posting said it.)
  const fromScan = v.by === "scan" && !(key === "status" && v.value === "Active");
  // A seat holder named from public profiles reads as Revenue Nomad research, the seat's own source.
  const from = v.by === "seed" ? ({ from: node!.research?.has(key) || v.pub ? "research" : "records" } as const) : fromScan ? ({ from: "posting" } as const) : {};
  // A person's title comes with their name, and the name with the title (PERSON_BUNDLE). A seat's role comes with who held it, and the other way round (SEAT_BUNDLE).
  const paid =
    !!me && !mine && !!f.gated && ((s.unlocks[k] ?? []).includes(me.id) || holdsPersonPartner(s, me, node, entity, key) || holdsSeatPartner(s, me, node, entity, key));
  if (!f.gated || mine || free || paid) {
    const out: Cell = { s: "value", v: v.value, mine, ver, iv: !!me && vers.includes(me.id), ...from, ...(paid ? { paid: true } : {}) };
    // Only to a viewer who sees the name: it is from public profiles and nobody has verified it yet (the Verify button).
    if (key === "operator" && entity === "engagement" && v.pub && !nameVerified(s, node!.id)) out.unverified = true;
    if (key === "operator" && idx) {
      // "Member" only for someone on Merlin now: a seed member we invited who never signed in is just a name.
      const m = seatHolder(s, idx, node!.id, v);
      if (m && (m.id === me?.id || signedIn(s, idx, m.id))) out.member = { title: m.title ?? "", you: !!me && m.id === me.id };
      if (mine && entity === "engagement" && (node as EngNode).source === SEAT_SCAN) out.claimed = true;
    }
    return out;
  }
  return { s: "locked", ver, ...from };
}

export function isAdmin(m: Member | null): boolean {
  const admins = (process.env.RN_ADMIN_EMAILS || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
  return !!m?.email && admins.includes(m.email.toLowerCase());
}

/* ---------- joining ---------- */

/** A first and last name: two or more words of letters (' - . allowed), no digits, emoji or email. PERSON_NAME_RE without its 60-character cap. */
const JOIN_NAME_RE = /^\p{L}[\p{L}'’.-]*(?: \p{L}[\p{L}'’.-]*)+$/u;

/**
 * Join with a name and email. An email that already belongs to a member can't be claimed
 * (they sign in with their link, or ask for one by email), so nobody can take over an
 * account by typing someone's email. The answer is the same for a seed member's address and
 * a joined member's, so it doesn't say which kind of member they are. It does say the address
 * is taken: while email sign-in is off, a new address is signed in on the spot and a member's
 * is refused, so anyone who knows a person's exact address can tell they are a member (the
 * route allows 10 joins an hour per network). With email sign-in on, both get the same answer
 * and an email.
 *
 * Gmail addresses compare without dots and plus tags (inboxKey), so one inbox is one account.
 *
 * An address in RN_ADMIN_EMAILS that is not a member yet can't join while email sign-in is
 * off: admin rights follow the address, and nothing would prove who typed it. With email on,
 * the emailed link proves it. `operatorSecret` (the x-cron-secret header) equal to
 * RN_CRON_SECRET also lets it through, so whoever runs the server can create the first admin.
 *
 * `ref` is an invite code from a fellow member. An invite that joins from a network the
 * inviter has used (their recent sign-ins and visits, seed members included) earns no bonus:
 * it is most likely the same person with a second email.
 */
export async function joinMember(
  nameRaw: unknown, emailRaw: unknown, ref?: unknown, ip = "local", operatorSecret?: string | null,
): Promise<Member & { existing?: boolean }> {
  const ipHash = createHash("sha256").update("rn-ip:" + ip).digest("hex").slice(0, 16);
  return mutate((s, seed) => {
    const name = stripInvisible(nameRaw).trim().replace(/\s+/g, " ").slice(0, 80);
    const email = stripInvisible(emailRaw).trim().toLowerCase().slice(0, 120);
    // The shape a seat holder's name must have (PERSON_NAME_RE, up to the 80 characters a name keeps), so the member can be matched to the seats they held.
    if (name.length < 3 || !JOIN_NAME_RE.test(name)) throw new ActionError("Add your first and last name.");
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) throw new ActionError("That doesn't look like an email address. Check it for a typo.");
    const inbox = inboxKey(email);
    const seedMember = seed.members.find((m) => m.email && inboxKey(m.email) === inbox);
    const joined = s.members.find((m) => inboxKey(m.email) === inbox);
    if (seedMember || joined) {
      if (emailEnabled()) return { ...(seedMember ? withToken(seedMember, s) : joined)!, existing: true }; // route emails them a sign-in link
      throw new ActionError("That email already belongs to a member. Sign in with your personal link.");
    }
    // An admin address nobody holds yet: typing it must not hand out admin rights.
    const adminAddress = (process.env.RN_ADMIN_EMAILS || "").split(",").some((x) => x.trim() && inboxKey(x) === inbox);
    if (adminAddress && !emailEnabled()) {
      const want = Buffer.from(process.env.RN_CRON_SECRET ?? "");
      const got = Buffer.from(String(operatorSecret ?? ""));
      if (!want.length || got.length !== want.length || !timingSafeEqual(got, want)) throw new ActionError("That email already belongs to a member. Sign in with your personal link.");
    }
    const code = String(ref ?? "").trim();
    const referrer = code ? seed.members.find((m) => inviteCode(m.id) === code) ?? s.members.find((m) => inviteCode(m.id) === code) : undefined;
    const sameNetwork = !!referrer && networksOf(s, referrer.id).has(ipHash);
    const m = {
      // No title until they give one: "Member" is only a display fallback, never a stored title.
      id: newId("j", name), name, email, title: "", token: randomBytes(12).toString("base64url"), at: new Date().toISOString(), ipHash,
      ...(referrer && !sameNetwork ? { referredBy: referrer.id } : {}),
      // With email on, the one-time link to finish joining goes only to this address: using it
      // proves the address and sets `proven` (lib/signin.ts, see trustOf).
    };
    s.members.push(m);
    keepIp(s, m.id, ipHash);
    // The invite loop: the inviter hears about it once the invitee is in (announceJoin).
    if (m.referredBy) (s.inviteJoins ??= []).push({ by: m.referredBy, invitee: m.id, at: m.at });
    memberIndexCache = null; // the draft changed in place: later jobs in this batch must see the new member
    return m;
  });
}

/* ---------- read model ---------- */

/**
 * The key a company is matched by, never shown and never part of an id: see companyKey() in
 * lib/scan/clean.ts. "Acme, Inc.", "ACME (YC W24)" and "The Acme" are one company, a name in
 * another script keeps a key of its own, and an empty key (no letter or digit) matches nothing.
 */
const companyKeys = new Map<string, string>();
const keyOfCompany = (name: string) => {
  let k = companyKeys.get(name);
  if (k === undefined) {
    k = companyKey(name);
    if (companyKeys.size > 20_000) companyKeys.clear();
    companyKeys.set(name, k);
  }
  return k;
};

/* ---------- finding a company by its exact name or website ---------- */

/**
 * A member who types a company's exact name or website sees it named in that search, at no cost:
 * the record opened from it shows what Unlock company would (its name, logo, website, LinkedIn,
 * About and the free facts), with postings, holders and contacts at the usual prices. The tables
 * keep it locked (State.found is not a reason knownCompanies counts). Exact means the matching key every
 * Add uses: case, punctuation, spaces, a leading "The" and legal suffixes aside (companyKey), or
 * the website's host (siteKey: scheme, www and path aside). A part of a name opens nothing and
 * never says how many companies start with it. New finds are limited per rolling 24 hours, and
 * lookups that match nothing have a limit of their own.
 */
export const REVEAL_DAILY_FREE = 25;
export const REVEAL_DAILY_PRO = 100;
export const FIND_MISS_DAILY = 50;
export { FIND_MIN, FIND_HINT, FIND_NONE };
export const revealCapWords = (n: number) => `You've looked up ${n} companies by name today. More tomorrow, or unlock one from the table.`;
export const FIND_MISS_CAP = `You've looked up ${FIND_MISS_DAILY} names with no match today. More tomorrow, or unlock one from the table.`;
const DAY_MS = 24 * 3600_000;

/** The companies whose name or website is exactly this text (as Add matches companies), at most 3. */
function exactMatches(g: Graph, s: State, raw: unknown): Node[] {
  const t = tidy(raw, 200);
  if (t.length < FIND_MIN) return [];
  const key = keyOfCompany(t);
  const site = /\s/.test(t) ? null : siteKey(t);
  if (!key && !site) return [];
  const out: Node[] = [];
  for (const c of g.companies.values()) {
    if ((key && keyOfCompany(c.name) === key) || (site && siteKey(live(c, s, "website")) === site)) out.push(c);
    if (out.length >= 3) break;
  }
  return out;
}
/** New finds a member has left in the rolling 24 hours: REVEAL_DAILY_PRO on Pro or a trial (billing live), else REVEAL_DAILY_FREE. */
const revealCap = (s: State, memberId: string, nowMs: number) => (billingLive() && hasPro(planRec(s, memberId), nowMs) ? REVEAL_DAILY_PRO : REVEAL_DAILY_FREE);
const foundRecent = (s: State, memberId: string, nowMs: number) => (s.found?.[memberId] ?? []).filter((r) => nowMs - Date.parse(r.at) < DAY_MS);
const revealsToday = (s: State, memberId: string, nowMs: number) => foundRecent(s, memberId, nowMs).length;
/** The companies this member looked up by exact name in the last DAY_MS (internal ids). */
const foundIds = (s: State, memberId: string, nowMs: number) => new Set(foundRecent(s, memberId, nowMs).map((r) => r.id));
/**
 * Note a lookup of these companies (the ones still locked for the member and not looked up in the
 * last DAY_MS). Returns how many it counted, or "cap" when that would go past the day's limit
 * (nothing is noted then).
 */
function revealFor(s: State, memberId: string, ids: string[], locked: (id: string) => boolean, nowMs: number): number | "cap" {
  const seen = foundIds(s, memberId, nowMs);
  const todo = [...new Set(ids)].filter((id) => locked(id) && !seen.has(id));
  if (!todo.length) return 0;
  if (seen.size + todo.length > revealCap(s, memberId, nowMs)) return "cap";
  const at = new Date(nowMs).toISOString();
  const list = foundRecent(s, memberId, nowMs);
  for (const id of todo) list.push({ id, at });
  (s.found ??= {})[memberId] = list;
  return todo.length;
}
/** A lookup that matched nothing, counted (the rolling 24 hours). False when the member is past FIND_MISS_DAILY already. */
function missFor(s: State, memberId: string, nowMs: number): boolean {
  const list = ((s.findMisses ??= {})[memberId] ??= []).filter((at) => nowMs - Date.parse(at) < DAY_MS);
  s.findMisses[memberId] = list;
  if (list.length >= FIND_MISS_DAILY) return false;
  list.push(new Date(nowMs).toISOString());
  return true;
}
/** Pilot metrics: new finds in the last 24 hours, members who found any, and members at their limit. */
function findStats(s: State, nowMs: number) {
  let today = 0;
  let members = 0;
  let atCap = 0;
  for (const id in s.found ?? {}) {
    const n = revealsToday(s, id, nowMs);
    if (!n) continue;
    today += n;
    members++;
    if (n >= revealCap(s, id, nowMs)) atCap++;
  }
  let misses = 0;
  let missCap = 0;
  for (const id in s.findMisses ?? {}) {
    const n = s.findMisses![id].filter((at) => nowMs - Date.parse(at) < DAY_MS).length;
    misses += n;
    if (n >= FIND_MISS_DAILY) missCap++;
  }
  return { today, members, atCap, misses, missCap };
}

/** For the add form: is a company with this website (or name) already on Merlin? */
export async function existingCompany(domain: string | null, name: string | null, token?: string | null) {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const g = viewGraph(seed, s);
  const me = token ? memberByToken(seed, token, s) : null;
  const d = siteKey(domain);
  const key = name ? keyOfCompany(name) : "";
  const c =
    (d && [...g.companies.values()].find((c) => siteKey(live(c, s, "website")) === d)) ||
    (key && [...g.companies.values()].find((c) => keyOfCompany(c.name) === key)) ||
    null;
  if (!c) return null;
  // A company still locked for this member: the website they pasted is exact, so it opens the company as a lookup by
  // website does (find, within its daily limit). A match by the name read off that website is not something they
  // typed, so it opens nothing. Locked, the Add form treats it as new, and the server files what they add under the
  // company on file (perform's add).
  if (me && identityHidden(g, s, memberIndex(seed, s), tracksOf(seed, s), me, c.id)) {
    if (!d || siteKey(live(c, s, "website")) !== d) return null;
    const r = await perform(token!, { type: "find", text: d }).catch((e) => {
      if (e instanceof ActionError) return null;
      throw e;
    });
    if (!r || r.id !== pubId(c.id)) return null;
  }
  return { id: pubId(c.id), name: c.name, website: live(c, s, "website"), industry: live(c, s, "industry") };
}

/**
 * Current fractional seats Revenue Nomad found (scripts/add-seat-scan.mjs). They come with no
 * seat holder: the people did not share them with us, so no name is stored. A member claims one
 * as theirs (claimSeat), and from then on it is their seat like any other.
 */
const SEAT_SCAN = "Seat scan";
/** What a member hears when they Add a fractional firm, agency or marketplace (lib/firms.ts). */
export const FIRM_REFUSED = "That looks like a fractional firm or marketplace, not a client. Add the company you worked for.";
/** Seat-scan seats a member can claim in any rolling 24 hours. */
const SEAT_CLAIM_DAILY_MAX = 3;
/** Unclaimed seats a member can check ("Is this you?") in any rolling 24 hours. Kept in memory: a restart resets it. */
const CLAIM_PREVIEW_DAILY_MAX = 40;
const claimPreviews = new Map<string, number[]>();
/** Sources whose seats are fractional work whatever their type. A "Member added" seat is too, while it has no type (see friendliness). */

/* ---------- open roles the weekly scan follows ---------- */

type Tracks = Map<string, RoleTrack & { key: string }>;
const iso = (raw: string | null | undefined, fallback: string) => {
  const t = Date.parse(String(raw ?? ""));
  return Number.isFinite(t) ? new Date(t).toISOString() : fallback;
};
/** Open roles that came with the seed and are not in State.scan.roles yet, as tracks dated from the seed's build. */
function seedTracks(seed: Seed, s: State): (RoleTrack & { key: string })[] {
  const known = new Set(Object.values(s.scan.roles).map((r) => r.engagementId));
  const built = iso(seed.builtAt, new Date(0).toISOString());
  const out: (RoleTrack & { key: string })[] = [];
  for (const e of seed.engagements) {
    if (e.fields.source !== "Demand scan" || known.has(e.id) || (e.fields.status ?? "Open role") !== "Open role") continue;
    out.push({ key: `seed:${e.id}`, engagementId: e.id, companyId: e.companyId, firstSeen: built, lastSeen: built, closedAt: null, url: e.fields.posting ?? "", source: "seed" });
  }
  return out;
}
/** Every followed role by engagement id, seed roles included. */
function buildTracks(seed: Seed, s: State): Tracks {
  const t: Tracks = new Map();
  for (const [key, r] of Object.entries(s.scan.roles)) t.set(r.engagementId, { ...r, key });
  for (const r of seedTracks(seed, s)) t.set(r.engagementId, r);
  return t;
}
let tracksCache: { seed: Seed; s: State; t: Tracks } | null = null;
/** buildTracks, kept for the committed state (a draft inside mutate() changes in place, so it is never cached). */
function tracksOf(seed: Seed, s: State): Tracks {
  if (s !== stateCache) return buildTracks(seed, s);
  if (!tracksCache || tracksCache.s !== s || tracksCache.seed !== seed) tracksCache = { seed, s, t: buildTracks(seed, s) };
  return tracksCache.t;
}
/** Write the seed's open roles into State.scan.roles (first scan, or the first change to one). */
function keepSeedTracks(seed: Seed, s: State): void {
  for (const { key, ...r } of seedTracks(seed, s)) s.scan.roles[key] = r;
}

/**
 * Still open on file, but its own board answered cleanly since it was last seen and did not
 * list it. Seed roles have no board the scan reads, so they are never unseen.
 */
const isUnseen = (t: RoleTrack) => !t.closedAt && t.source !== "seed" && ((t.misses ?? 0) > 0 || !!t.absentAt);
/** What the scan knows about a role's dates, as full times (the day forms `opened` and `closed` stay as they were). */
const roleTimes = (t: RoleTrack) => ({
  openedAt: t.firstSeen,
  closedAt: t.closedAt,
  posted: t.postedAt ? t.postedAt.slice(0, 10) : null,
  lastSeen: t.lastSeen,
  unseen: isUnseen(t),
});
/** A posting this old was not new when the scan first saw it. */
const NEW_POSTED_WITHIN = 14 * DAY;
/** New this week: first seen in the last 7 days and, when the board gives a date, posted in the last 14. */
const newThisWeek = (t: RoleTrack, nowMs: number) => {
  if (nowMs - Date.parse(t.firstSeen) >= 7 * DAY) return false;
  const posted = Date.parse(t.postedAt ?? "");
  return !Number.isFinite(posted) || nowMs - posted <= NEW_POSTED_WITHIN;
};

/**
 * An open fractional seat right now. A role the scan follows is open until its track closes (the
 * posting came down, or a member took the seat): its status says so, but a member who wrote a
 * status on it before the scan found it does not decide. Any other seat is open when its status
 * is Open role (or it is a scanned posting with no status).
 */
function isOpenRole(e: EngNode, s: State, tracks: Tracks): boolean {
  const t = tracks.get(e.id);
  if (t) return !t.closedAt;
  const status = live(e, s, "status");
  return status ? status === "Open role" : e.source === "Demand scan";
}
/**
 * An open role the scan added that fails the seniority bar (lib/seniority.ts): outside GTM and
 * below Director. The next scan takes it off the table (lib/scan/remove.ts, the same test); until
 * then the view leaves it out. Roles from our records and a seat a member took stay.
 */
function offBarRole(e: EngNode, s: State, tracks: Tracks, byScan: boolean): boolean {
  const t = tracks.get(e.id);
  if (!byScan || !t || t.source === "seed" || t.closedAt || selfHeld(s, e.id)) return false;
  return !keepsNonGtm(live(e, s, "role"), live(e, s, "function"));
}
function hidesCompany(e: EngNode, s: State, tracks: Tracks): boolean {
  if (!isOpenRole(e, s, tracks)) return false;
  return tracks.has(e.id) || isSystem(valueOf(e, s, "status")?.by ?? "seed");
}
/** The member holds the role, the posting or the rate of this open role (paid for it, or added it): it was bought once, with whatever else that purchase opens. */
function holdsOpenRole(s: State, me: Member, e: Node): boolean {
  return BUNDLE_FIELDS.some((field) => {
    const v = valueOf(e, s, field);
    return !!v && v.status === "live" && (v.by === me.id || (s.unlocks[fkey(e.id, field)] ?? []).includes(me.id));
  });
}

/**
 * A company About the viewer can see, as the table carries it: the cell without its text (GET
 * /api/table?about= returns it whole). About is a system fact, so it never counts in the facts.
 */
const ABOUT_LATER = (): Cell => ({ s: "value", v: "", ver: 0, system: true, lazy: true });
/**
 * Company facts that would give a hidden company away. HQ is cut to its region instead, and the
 * About shows without the company's name, web address, links and emails (aboutWithout).
 */
const IDENTITY_FIELDS = new Set(["website", "linkedin", "about"]);
/** The last part of an HQ ("Austin, TX" -> "TX"), so a hidden company keeps a region. */
const hqRegion = (hq: string) => hq.split(",").map((x) => x.trim()).filter(Boolean).pop() ?? "";
/** An About that was only a link (nothing left once it goes) is no About. */
const aboutOrEmpty = (c: Cell & { s: "value" }, v: string): Cell => (/[\p{L}\p{N}]/u.test(v) ? { ...c, v } : { s: "empty" });
/**
 * One company cell as a member sees it while the company is hidden: website and LinkedIn locked,
 * HQ cut to its region, the About's text without the giveaways in it. `co`: the company's name, its
 * website and its logo's domain, which the About is read without, and the names of its people and
 * seat holders (paid facts: a sentence with one goes).
 */
const hideIdentity = (key: string, c: Cell, co: { name: string; sites: (string | null | undefined)[]; people?: (string | null | undefined)[] }): Cell =>
  c.s !== "value"
    ? c
    : key === "about"
      ? c.v
        ? aboutOrEmpty(c, aboutWithout(c.v, co.name, co.sites, co.people))
        : c
      : IDENTITY_FIELDS.has(key)
        ? { s: "locked", ver: 0 }
        : key === "hq"
          ? { ...c, v: hqRegion(c.v) }
          : c;
/**
 * One purchase on an open role: its job posting and its posted rate. "Unlock company" opens both
 * on each open role at a locked company for the same credit. An open role's title is free (see
 * roleFree), so members can tell whether a role is worth a credit. (Hours a week are free too.)
 */
const BUNDLE_FIELDS = ["posting", "rate"];
/**
 * A person's name and title are one purchase (PERSON_BUNDLE): 1 credit opens both, and a member
 * who holds one of them sees the other at no charge, a title added later included. Holding means
 * paying for either, or having added the name (whoever added a person knows who they are). Adding
 * only the title does not open the name, or adding a title would buy a name and earn a credit at
 * once. Their email, phone and LinkedIn stay 1 credit each, and open only once the member can see
 * the name and title (PERSON_DETAILS, knowsPerson in perform). True when `me` holds the other half.
 */
function holdsPersonPartner(s: State, me: Member | null, node: Node | undefined, entity: Entity, key: string): boolean {
  if (!me || !node || entity !== "contact" || !PERSON_BUNDLE.includes(key)) return false;
  const other = key === "name" ? "title" : "name";
  const v = valueOf(node, s, other);
  if (!v || v.status === "removed") return false;
  return (s.unlocks[fkey(node.id, other)] ?? []).includes(me.id) || (other === "name" && v.by === me.id);
}
/**
 * An open role, read from its status (what cellOf can tell without the scan's tracks; the scan
 * keeps the status of the roles it follows in step): "Open role", or a scanned posting with none.
 */
function openByStatus(e: Node, s: State): boolean {
  const status = live(e, s, "status");
  return status ? status === "Open role" : (e as EngNode).source === "Demand scan";
}
/**
 * An end month that says no more than the free status: "Ongoing", or any end on an Active seat or
 * an open role (an active seat can't hold a dated end, see ACTIVE_NO_END). It is free to see and
 * never costs a credit. Only a dated end on a seat that ended or closed is a paid fact.
 */
function endFree(e: Node | undefined, s: State): boolean {
  if (!e) return false;
  if (live(e, s, "end") === "Ongoing") return true;
  return live(e, s, "status") === "Active" || openByStatus(e, s);
}
/** SEAT_SCAN_ROLE_FREE: the role of a seat Revenue Nomad found that nobody is named on (no seat holder value at all) is a free fact. */
const scanRoleFree = (e: Node | undefined, s: State) => SEAT_SCAN_ROLE_FREE && !!e && (e as EngNode).source === SEAT_SCAN && !valueOf(e, s, "operator");
/**
 * Who held a seat and the role they held are one purchase (SEAT_BUNDLE) on a seat whose holder is
 * on file (a live name) and that is not an open role (whose title is free anyway). 1 credit opens
 * both, whichever is asked for, and the purchase is recorded on the seat holder.
 */
function seatBundled(e: Node | undefined, s: State): boolean {
  if (!e) return false;
  const op = valueOf(e, s, "operator");
  return !!op && op.status === "live" && !openByStatus(e, s);
}
/**
 * The member paid for the other half of a seat's holder and role (SEAT_BUNDLE), so this half is
 * free to them, a role or a name added later included. Only a paid unlock counts: adding a half
 * opens nothing (the seat's own holder sees all of it anyway). True when `me` holds the other half.
 */
function holdsSeatPartner(s: State, me: Member | null, node: Node | undefined, entity: Entity, key: string): boolean {
  if (!me || !node || entity !== "engagement" || !SEAT_BUNDLE.includes(key) || !seatBundled(node, s)) return false;
  const other = key === "operator" ? "role" : "operator";
  return !!valueOf(node, s, other) && (s.unlocks[fkey(node.id, other)] ?? []).includes(me.id);
}
/**
 * An open role's title is free to see while the role is open. Once it closes or is filled, it
 * follows the usual rule again (locked, like any past seat's role). At a locked company the
 * title is shown without the company's name or domain in it (titleWithout).
 */
const roleFree = (e: EngNode | undefined, s: State, tracks: Tracks) => !!e && isOpenRole(e, s, tracks);
/** The posting of a role the scan closed (the listing came down) is free to see: the link no longer leads to a job. */
const postingFree = (t: RoleTrack | undefined) => !!t?.closedAt && t.closedBy !== "filled";

/**
 * Whether a company's identity is hidden from this member. Every company is locked for a member
 * until they unlock it: its name, website, LinkedIn, logo and About cost COMPANY_PRICE credits
 * ("Unlock company"), because the name alone is enough to look the rest up. Its free facts
 * (industry, size, revenue, HQ region, which functions it hired and when, its open roles' titles)
 * say whether it is worth it. It stays visible to admins (not while they see it as a member), and
 * to a member who already knows it (knownCompanies).
 */
function identityHidden(g: Graph, s: State, idx: MemberIndex, _tracks: Tracks, me: Member | null, companyId: string, asMember = false): boolean {
  if (!me || (isAdmin(me) && !asMember)) return false;
  // The committed state never changes, so its answer is kept. A draft inside mutate() changes in place: asked one company at a time.
  if (s === stateCache) return !knownCompanies(g, s, idx, me).has(companyId);
  return !knowsCompany(g, s, idx, me, companyId);
}

/** knownCompanies for the committed state, by member (a new state starts a new map). */
let knownCache: { s: State; byMember: Map<string, Set<string>> } | null = null;
/**
 * The companies a member already knows, so their identity is never locked for them:
 *  - one they added to Merlin, or a seat, a person or a fact they added at it;
 *  - a seat there whose holder name is theirs, or one they claimed and an admin approved (a claim
 *    still waiting opens nothing: anyone can ask for any seat);
 *  - anything they paid for there: Unlock company, an open role's posting or rate, a person, who
 *    held a seat (any purchase at a company owns it, the unlocks made under the old rules included);
 *  - a rate they shared for the benchmarks about a seat there.
 * Confirming or reporting a free fact does not count (either can be done on a locked company's free
 * facts, so it would open the company for nothing), and nor does following: neither was a purchase. Onboarding's typed clients are not either:
 * they are the page's word, so a company there is known once the member adds their seat at it.
 */
function knownCompanies(g: Graph, s: State, idx: MemberIndex, me: Member): Set<string> {
  if (s === stateCache && knownCache?.s === s) {
    const hit = knownCache.byMember.get(me.id);
    if (hit) return hit;
  }
  const out = new Set<string>();
  const coOf = (nodeId: string) => (g.companies.has(nodeId) ? nodeId : (g.engagements.get(nodeId)?.companyId ?? g.contacts.get(nodeId)?.companyId));
  const add = (nodeId: string | null | undefined) => {
    const c = nodeId ? coOf(nodeId) : undefined;
    if (c) out.add(c);
  };
  const nodeOfKey = (k: string) => k.slice(0, k.lastIndexOf("."));
  for (const c of s.companies) if (c.by === me.id) out.add(c.id);
  for (const e of s.engagements) if (e.by === me.id) out.add(e.companyId);
  for (const k in s.values) if (s.values[k].by === me.id) add(nodeOfKey(k));
  for (const k in s.unlocks) if (s.unlocks[k].includes(me.id)) add(nodeOfKey(k));
  for (const b of s.benchRates) if (b.by === me.id) add(b.engagementId);
  for (const c of s.names?.claims ?? []) if (c.memberId === me.id && c.status === "approved") add(c.engagementId);
  for (const e of g.engagements.values()) if (!out.has(e.companyId) && seatHolder(s, idx, e.id, valueOf(e, s, "operator"))?.id === me.id) out.add(e.companyId);
  if (s === stateCache) {
    if (knownCache?.s !== s) knownCache = { s, byMember: new Map() };
    if (knownCache.byMember.size > 5000) knownCache.byMember.clear();
    knownCache.byMember.set(me.id, out);
  }
  return out;
}

/** knownCompanies for one company, read from the state as it is now (a draft inside mutate()). */
function knowsCompany(g: Graph, s: State, idx: MemberIndex, me: Member, companyId: string): boolean {
  if (s.companies.some((c) => c.id === companyId && c.by === me.id)) return true;
  if (s.engagements.some((e) => e.companyId === companyId && e.by === me.id)) return true;
  const engs = [...g.engagements.values()].filter((e) => e.companyId === companyId);
  const ids = new Set<string>([companyId, ...engs.map((e) => e.id)]);
  for (const p of g.contacts.values()) if (p.companyId === companyId) ids.add(p.id);
  const at = (k: string) => ids.has(k.slice(0, k.lastIndexOf(".")));
  for (const k in s.values) if (at(k) && s.values[k].by === me.id) return true;
  for (const k in s.unlocks) if (at(k) && s.unlocks[k].includes(me.id)) return true;
  if (s.benchRates.some((b) => b.by === me.id && !!b.engagementId && ids.has(b.engagementId))) return true;
  if ((s.names?.claims ?? []).some((c) => c.memberId === me.id && c.status === "approved" && ids.has(c.engagementId))) return true;
  return engs.some((e) => seatHolder(s, idx, e.id, valueOf(e, s, "operator"))?.id === me.id);
}

/**
 * How fractional-friendly a company is, from its seats. Only a hire counts as one: an open role is
 * a posting, so its function goes in `hiring` and not in `functions`, and a posting that came down
 * with nobody named as its seat holder counts in neither (it still shows they went looking, which
 * scores like an open role). A seat a member added counts as fractional unless its type says
 * otherwise.
 */
function friendliness(g: Graph, s: State, tracks: Tracks, companyId: string, engs: EngNode[], operators: Set<string>, firm = false): Friendly {
  let fractional = 0;
  let open = 0;
  let recent = 0;
  let stories = 0;
  let postings = 0;
  const functions = new Set<string>();
  const hiring = new Set<string>();
  const now = Date.now();
  for (const e of engs) {
    const type = live(e, s, "type");
    const fn = live(e, s, "function") ?? functionOf(live(e, s, "role"));
    if (isOpenRole(e, s, tracks)) {
      open++;
      if (fn) hiring.add(fn);
      continue;
    }
    if (e.source === "Demand scan" && !live(e, s, "operator")) {
      postings++;
      continue;
    }
    // Every seat counts the same whatever its source (a member's story, a published engagement, a
    // seat Revenue Nomad found), unless its type says it wasn't fractional (a full-time hire).
    if (!type || FRACTIONAL_TYPES.includes(type)) {
      fractional++;
      if (fn) functions.add(fn);
      const start = live(e, s, "start");
      if (start && now - Date.parse(`${start}-01`) < 2 * 365 * DAY) recent++;
    } else stories++;
  }
  // An open role is the strongest signal there is: on its own it makes a company Medium. So does a
  // posting that came down (they went looking for a fractional), though neither is a hire.
  const score = Math.min(
    100,
    Math.min(40, fractional * 20) + Math.min(20, functions.size * 10) + (fractional >= 2 ? 15 : 0) + (recent ? 15 : 0) + (open || postings ? 30 : 0) + (stories && !fractional && !open && !postings ? 5 : 0),
  );
  const tier = score >= 60 ? "High" : score >= 30 ? "Medium" : score > 0 ? "Low" : null;
  // A fractional firm kept for admin review (a member holds a seat there, see lib/firmRemoval.ts) is not a client: no score, no hires.
  if (firm) return { score: 0, tier: null, fractional: 0, open, functions: [], hiring: [...hiring], operators: operators.size, recent: 0 };
  return { score, tier, fractional, open, functions: [...functions], hiring: [...hiring], operators: operators.size, recent };
}

/**
 * Signed-out views only need the counts, which are marketing numbers: kept for ANON_FRESH
 * whatever members change meanwhile (every member's view refreshes them too), and rebuilt when
 * the seed changes. Signed-out visitors who arrive while the counts are being rebuilt wait for
 * that one build.
 */
let statsCache: { s: State; seed: Seed; stats: View["stats"]; at: number } | null = null;
/** How long the signed-out counts and the landing preview's companies are kept, whatever changes meanwhile. */
const ANON_FRESH = 5 * 60 * 1000;
let anonBuild: { s: State; seed: Seed; p: Promise<View> } | null = null;
/**
 * The signed-out build (the counts and the landing preview's companies), one at a time: everyone
 * who asks while one runs waits for it, even when members changed the state meanwhile.
 */
function anonView(seed: Seed, s: State): Promise<View> {
  if (!anonBuild || anonBuild.seed !== seed) {
    const p = fullView(seed, s, null);
    anonBuild = { s, seed, p };
    p.finally(() => anonBuild?.p === p && (anonBuild = null)).catch(() => {});
  }
  return anonBuild.p;
}

/**
 * One company for the landing page's "Try it" preview (lib/preview.ts): the record as a
 * signed-out visitor's build has it. `name` and `site` scrub role titles when the preview keeps
 * an open role's company back (past its PREVIEW_OPEN_NAMED named ones). `seed` is an opaque HMAC
 * of the internal id (not the public id), a stable key for the page. `rnHolders`: public ids of
 * the seats whose holder is a Revenue Nomad member (a seed member), never who they are.
 */
export interface PreviewCompany {
  rec: CompanyRec;
  name: string;
  site: string | null;
  seed: string;
  rnHolders: Set<string>;
}
/** The companies of the latest signed-out build, kept with the state and seed they came from. */
let anonCompanies: { s: State; seed: Seed; list: PreviewCompany[]; at: number } | null = null;
const previewSeed = (id: string) => createHmac("sha256", ID_KEY).update(`landing-preview:${id}`).digest("base64url").slice(0, 14);

/**
 * The companies the landing preview reads, from the signed-out build: kept for ANON_FRESH like
 * the signed-out counts, whatever members change meanwhile, and rebuilt when the seed changes.
 * Server side only.
 */
export async function previewCompanies(): Promise<{ list: PreviewCompany[]; version: object }> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const fresh = !!anonCompanies && anonCompanies.seed === seed && Date.now() - anonCompanies.at < ANON_FRESH;
  if (!fresh) await anonView(seed, s);
  const hit = anonCompanies;
  return hit ? { list: hit.list, version: hit } : { list: [], version: {} };
}

/** One address from the environment, or null when it is not set or is not an email address. */
const addressIn = (raw: string | undefined) => {
  const v = String(raw ?? "").trim();
  return /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(v) ? v : null;
};
/** View.contact: read at run time, so a build never drops the addresses and a change needs only a restart. */
export const contactInfo = (): NonNullable<View["contact"]> => ({ support: addressIn(process.env.RN_SUPPORT_EMAIL), intro: addressIn(process.env.RN_INTRO_EMAIL) });

/**
 * The table as `token`'s member sees it. `asMember`: an admin asked to see it the way members do
 * ("See it as a member"): hidden companies stay hidden, and there is no review list or pilot
 * metrics. It changes nothing for anyone who is not an admin. Actions still run as the admin.
 * Company About texts are left out (ABOUT_LATER): aboutCells reads them, a few companies at a time.
 */
export async function buildView(token: string | null, opts: { asMember?: boolean } = {}): Promise<View> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (me) return fullView(seed, s, me, !!opts.asMember && isAdmin(me));
  if (statsCache && statsCache.seed === seed && Date.now() - statsCache.at < ANON_FRESH)
    return { demo: !!seed.demo, me: null, companies: [], stats: statsCache.stats, ledger: [], reported: [], email: emailEnabled(), contact: contactInfo(), version: viewVersion(statsCache.s) };
  return anonView(seed, s);
}

/** The most companies one GET /api/table?about= answers for. */
export const ABOUT_MAX = 50;
/**
 * GET /api/table?about=: the About cell of each company `ids` names (public company ids, up to
 * ABOUT_MAX), exactly as the table carried it before the text left the table. fullView builds
 * just those companies, so a locked company's About comes without its name, web address, links
 * and emails (hideIdentity), and nothing comes back that the member's table would not have shown.
 * `found`: the record asking is one opened from a lookup by exact name (CompanyRec.found, GET
 * ?about=...&found=1), which shows the whole About while the lookup lasts; without it a company
 * only looked up reads as locked, as the tables show it. Ids that name no company are left out.
 * Null when the token is nobody's.
 */
export async function aboutCells(token: string | null, ids: string[], opts: { asMember?: boolean; found?: boolean } = {}): Promise<{ about: Record<string, Cell> } | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) return null;
  const g = viewGraph(seed, s);
  const ix = companyIndex(g);
  const cos = new Set<string>();
  for (const id of ids.slice(0, ABOUT_MAX)) {
    const c = ix.get(id);
    // A company's own id only (the index also takes a seat's or a person's to its company).
    if (c && g.companies.has(c) && pubId(c) === id) cos.add(c);
  }
  const about: Record<string, Cell> = {};
  if (!cos.size) return { about };
  // A record opened from a lookup by exact name shows its whole About (State.found).
  const v = await fullView(seed, s, me, !!opts.asMember && isAdmin(me), cos, false, true, opts.found ? foundIds(s, me.id, Date.now()) : null);
  for (const c of v.companies) about[c.id] = c.cells.about ?? { s: "empty" };
  return { about };
}

/**
 * The domain a company's logo is drawn from, for GET /api/logo/<id> (lib/logo.ts): its website's
 * host, else a domain looked up from its name earlier (lib/companyIcons.ts; this starts no lookup).
 * `publicId` is a company's own public id. Null for anything else, a company with neither, or a
 * website on a shared host (a LinkedIn page, a job board), whose icon is not the company's. Server
 * side only: the domain never goes to the page of a member the company is locked for.
 */
export async function logoDomain(publicId: string): Promise<string | null> {
  const id = String(publicId ?? "");
  if (!/^c_[\w-]{6,40}$/.test(id)) return null;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const g = viewGraph(seed, s);
  const cid = companyIndex(g).get(id);
  const node = cid ? g.companies.get(cid) : undefined;
  if (!node || pubId(node.id) !== id) return null;
  const site = siteKey(live(node, s, "website"));
  if (site) return site.includes("/") ? null : site;
  const icon = (await iconDomains([{ id: node.id, name: node.name, website: null }], { lookup: false }))[node.id];
  const host = siteKey(icon);
  return host && !host.includes("/") ? host : null;
}

/** The most companies an action's answer carries (an Unlock all on one record touches one). Past it, the page loads the table again. */
const PATCH_MAX = 8;
/**
 * What an action changed, as `token`'s member now sees it, for the action's answer: the records
 * of the companies `ids` name (public ids of companies, seats or people), built exactly as the
 * full view builds them, the whole Me, the credit history rows written since `since` (an ISO
 * time, newest first), the scan summary, the benchmarks when asked for, and an admin's review
 * list. `partial` when some of it could not be built here: more than PATCH_MAX companies, or an
 * id that names nothing any more (a record that went). Null when the token is nobody's.
 */
export async function viewPatch(
  token: string | null,
  ids: string[],
  opts: { asMember?: boolean; since?: string; benchmarks?: boolean; found?: boolean } = {},
): Promise<(Pick<ActionResult, "companies" | "ledgerNew" | "benchmarks" | "scan" | "reported" | "partial" | "version"> & { me: Me }) | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) return null;
  const g = viewGraph(seed, s);
  const ix = companyIndex(g);
  const cos = new Set<string>();
  let missing = false;
  for (const id of new Set(ids.filter((x) => typeof x === "string" && x))) {
    // A record the action took off the table: its company, when that is still there.
    const c = ix.get(id) ?? companyOfPub.get(id);
    if (c && g.companies.has(c)) cos.add(c);
    else missing = true;
  }
  const many = cos.size > PATCH_MAX;
  // found: the answer to a lookup by exact name, its companies named for that answer only (CompanyRec.found).
  const v = await fullView(seed, s, me, !!opts.asMember && isAdmin(me), many ? new Set() : cos, !!opts.benchmarks, false, opts.found ? foundIds(s, me.id, Date.now()) : null);
  const since = opts.since ?? "";
  return {
    companies: v.companies,
    me: v.me!,
    ledgerNew: v.ledger.filter((l) => l.at >= since),
    scan: v.scan,
    ...(opts.benchmarks ? { benchmarks: v.benchmarks } : {}),
    ...(v.me?.admin ? { reported: v.reported } : {}),
    ...(many || missing ? { partial: true } : {}),
    version: v.version,
  };
}

/**
 * Seat titles that read below Lead (isBelowLead in lib/seniority.ts), remembered by title: every
 * view build and the Referral partners page read every seat's, and titles rarely change.
 */
const belowLeadTitles = new Map<string, boolean>();
function belowLead(title: string | null): boolean {
  if (!title) return false;
  let v = belowLeadTitles.get(title);
  if (v === undefined) {
    v = isBelowLead(title);
    if (belowLeadTitles.size > 50_000) belowLeadTitles.clear();
    belowLeadTitles.set(title, v);
  }
  return v;
}

/**
 * The table as `me` sees it. `only`: build just these companies (internal ids), for an action's
 * answer (viewPatch). The member's own numbers, credit history, benchmarks and scan summary come
 * whole, the counts in `stats` cover only those companies, and nothing is cached from it.
 * `bench` false leaves the benchmarks out. `withAbout` keeps the company About texts in; without
 * it an About the viewer can see is ABOUT_LATER (the page loads the text when the record opens).
 */
/**
 * `found`: companies the member looked up by exact name, built named for this answer only
 * (CompanyRec.found): the answer to a lookup, and the About of a record opened from it.
 */
async function fullView(
  seed: Seed,
  s: State,
  me: Member | null,
  asMember = false,
  only: Set<string> | null = null,
  bench = true,
  withAbout = false,
  found: Set<string> | null = null,
): Promise<View> {
  const g = viewGraph(seed, s);
  /** The viewer is an admin and sees the admin's view (not "See it as a member"). */
  const admin = isAdmin(me) && !asMember;
  const nowMs = Date.now();

  /** Live facts hidden only for this viewer (they reported them): still facts for the stats. */
  let hiddenForMe = 0;
  const idx = memberIndex(seed, s);
  const tracks = tracksOf(seed, s);
  const cell = (node: Node | undefined, entity: Entity, key: string, free = false): Cell => {
    const c = cellOf(s, me, node, entity, key, idx, free);
    if (c.s === "reported" && !c.mine && me && valueOf(node, s, key)?.status === "live") hiddenForMe++;
    return c;
  };
  const fieldsOf = (entity: Entity) => ALL_FIELDS.filter((x) => x.entity === entity && !x.f.identity).map((x) => x.f);
  const COMPANY_F = fieldsOf("company");
  const ENG_F = fieldsOf("engagement");
  const PERSON_F = fieldsOf("contact");

  // Newest live fact per record, in one pass over the values.
  const latestById = new Map<string, string>();
  for (const k in s.values) {
    const v = s.values[k];
    if (v.status !== "live") continue;
    const dot = k.indexOf(".");
    if (!FIELD_KEYS.has(k.slice(dot + 1))) continue;
    const id = k.slice(0, dot);
    const cur = latestById.get(id);
    if (!cur || v.at > cur) latestById.set(id, v.at);
  }
  const touched = (id: string) => latestById.get(id) ?? null;
  const maxIso = (...xs: (string | null)[]) => xs.filter(Boolean).sort().pop() ?? null;

  const engsByCompany = new Map<string, EngNode[]>();
  for (const e of g.engagements.values()) engsByCompany.set(e.companyId, [...(engsByCompany.get(e.companyId) ?? []), e]);
  const peopleByCompany = new Map<string, PersonNode[]>();
  for (const p of g.contacts.values()) peopleByCompany.set(p.companyId, [...(peopleByCompany.get(p.companyId) ?? []), p]);
  const myAdds = new Set<string>();
  if (me) for (const [k, v] of Object.entries(s.values)) if (v.by === me.id) myAdds.add(k.split(".")[0]);
  const following = new Set(me ? s.follows[me.id] ?? [] : []);
  const trusted = trustOf(seed, s);
  const madeBy = new Map(s.engagements.map((e) => [e.id, e.by]));
  /** Companies where the viewer holds a seat as its owner (their company pick lists are not limited, see pickExempt). */
  const ownSeatAt = new Set<string>();

  const icons = await iconDomains(
    [...g.companies.values()].filter((c) => !only || only.has(c.id)).map((c) => ({ id: c.id, name: c.name, website: live(c, s, "website") })),
  );

  const companies: CompanyRec[] = [];
  const reviewFirms = firmsInReview(seed, s);
  const hiddenIds = new Set<string>();
  /** Companies this build made a record for. */
  const builtIds = new Set<string>();
  /** Invite to connect: the seats the viewer invited (when), and their invite code for the claim links. */
  const myInvites = new Map(me ? (s.seatInvites ?? []).filter((x) => x.by === me.id).map((x) => [x.engagementId, x.at] as const) : []);
  const myCode = me ? inviteCode(me.id) : "";
  /** Companies the viewer created (the same test as exemptPick in perform). */
  const addedByMe = new Set(me ? s.companies.filter((x) => x.by === me.id).map((x) => x.id) : []);
  /** Companies whose identity the viewer sees (identityHidden). Null for admins and signed out: nothing is locked. */
  const known = me && !admin ? knownCompanies(g, s, idx, me) : null;
  let peopleCount = 0;
  /** Signed out: every company with its name and site, for the landing preview (never sent). */
  const forPreview: PreviewCompany[] | null = me ? null : [];
  for (const c of g.companies.values()) {
    if (only && !only.has(c.id)) continue;
    builtIds.add(c.id);
    const facts = { known: 0, locked: 0, missing: 0 };
    /** `addable`: an empty fact here is one the viewer can add (a seat's facts are its holder's alone). */
    const count = (cells: Record<string, Cell>, defs: typeof COMPANY_F, addable = true) => {
      for (const f of defs) {
        if (f.system) continue;
        const x = cells[f.key];
        if (x.s === "value") facts.known++;
        else if (x.s === "locked") facts.locked++;
        else if (x.s === "empty" && addable) facts.missing++;
      }
    };
    const toPerson = (p: PersonNode): PersonRec => {
      const cells: Record<string, Cell> = {};
      for (const f of PERSON_F) cells[f.key] = cell(p, "contact", f.key);
      count(cells, PERSON_F);
      return { id: pubId(p.id), engagementId: p.engagementId ? pubId(p.engagementId) : null, source: p.source, cells };
    };
    // An open role below the seniority bar is left out until the next scan removes it (offBarRole).
    const engs = (engsByCompany.get(c.id) ?? []).filter((e) => !offBarRole(e, s, tracks, madeBy.get(e.id) === "scan"));
    const people = peopleByCompany.get(c.id) ?? [];
    peopleCount += people.length;
    const operators = new Set<string>();
    let updatedAt = touched(c.id);
    let mine = myAdds.has(c.id);
    let holdsSeat = false;
    /** Locked postings of roles the scan closed. They open below, unless the company is hidden (the link would name it). */
    const closedPostings: { e: EngNode; cells: Record<string, Cell> }[] = [];
    const engRecs: EngagementRec[] = engs.map((e) => {
      const cells: Record<string, Cell> = {};
      // The seat holder sees their own seat free (see seatOwner for who counts as its holder).
      const op = valueOf(e, s, "operator");
      const yours = !!me && seatOwner(s, idx, trusted, tracks, e.id, op, madeBy.get(e.id), e.source === SEAT_SCAN)?.id === me.id;
      const track = tracks.get(e.id);
      if (yours) ownSeatAt.add(c.id);
      if (yours || (!!me && seatHolder(s, idx, e.id, op)?.id === me.id)) holdsSeat = true;
      const openTitle = roleFree(e, s, tracks);
      for (const f of ENG_F) cells[f.key] = cell(e, "engagement", f.key, yours || (f.key === "role" && openTitle));
      // "Who introduced you" (INTRO_FIELD): the seat holder's own note, to them alone. Every other viewer's seat has no such cell.
      if (yours) {
        const note = s.seatPrivate?.[e.id];
        cells[INTRO_FIELD.key] = note && note.by === me!.id ? { s: "value", v: note.introducedBy, ver: 0, mine: true } : { s: "empty" };
      }
      if (postingFree(track) && cells.posting.s === "locked") closedPostings.push({ e, cells });
      // Function is free; derive it from the role when nobody set it.
      if (cells.function.s === "empty") {
        const fn = functionOf(live(e, s, "role"));
        if (fn) cells.function = { s: "value", v: fn, ver: 0, system: true };
      }
      // Only the seat holder adds facts about a seat, so its empty facts are missing for them alone.
      count(cells, ENG_F, yours);
      const opName = live(e, s, "operator");
      if (opName) operators.add(opName.toLowerCase());
      const ePeopleNodes = people.filter((p) => p.engagementId === e.id);
      const ePeople = ePeopleNodes.map(toPerson);
      const eu = maxIso(touched(e.id), ...ePeopleNodes.map((p) => touched(p.id)));
      updatedAt = maxIso(updatedAt, eu);
      if (myAdds.has(e.id) || ePeopleNodes.some((p) => myAdds.has(p.id))) mine = true;
      return {
        id: pubId(e.id), source: e.source, verified: e.verified, cells, people: ePeople, updatedAt: eu, yours,
        // A seat from the seat scan nobody claimed (no name, or an unverified one from public profiles): its holder is not on Merlin yet, and they can claim it.
        ...(unclaimedSeat(e, s) ? { claimable: true } : {}),
        // The viewer's own "This is me" on it waits for an admin.
        ...(me && pendingClaimers(s, e.id).includes(me.id) ? { claimWaiting: true } : {}),
        // Recently hired counts leadership seats only. The stored title decides, whether or not this
        // viewer can see it (SEAT_BUNDLE locks the role of a seat whose holder is on file), and only
        // the flag goes out, never the title.
        ...(belowLead(live(e, s, "role")) ? { belowLead: true } : {}),
        ...(track ? { opened: track.firstSeen.slice(0, 10), closed: track.closedAt ? track.closedAt.slice(0, 10) : null, ...roleTimes(track) } : {}),
      };
    });
    const coPeopleNodes = people.filter((p) => !p.engagementId || !g.engagements.has(p.engagementId));
    const coPeople = coPeopleNodes.map(toPerson);
    for (const p of coPeopleNodes) {
      updatedAt = maxIso(updatedAt, touched(p.id));
      if (myAdds.has(p.id)) mine = true;
    }
    const cells: Record<string, Cell> = {};
    for (const f of COMPANY_F) cells[f.key] = cell(c, "company", f.key);
    count(cells, COMPANY_F);
    // The place the viewer can see: none while the viewer's own report hides the HQ from them.
    const geo = cells.hq?.s === "value" ? geoOf(c, s) : NOWHERE;
    // The rule of identityHidden(): every company is locked for a member until they know it (knownCompanies).
    const locked = !!me && !admin && !known!.has(c.id) && !mine && !addedByMe.has(c.id) && !holdsSeat;
    // Looked up by its exact name: named in this answer, as Unlock company would show it, and still locked in the tables.
    const foundNow = locked && !!found?.has(c.id);
    const hidden = locked && !foundNow;
    // An open role's posted hours are part of what its posting says: they show with the posting and
    // the posted rate (one purchase, or Unlock company at a hidden company), never before.
    engs.forEach((e, n) => {
      const er = engRecs[n];
      const h = er.cells.hours;
      if (er.yours || h?.s !== "value" || !isOpenRole(e, s, tracks)) return;
      if (!hidden && er.cells.posting?.s !== "locked" && er.cells.rate?.s !== "locked") return;
      er.cells.hours = { s: "locked", ver: h.ver, ...(h.from && h.from !== "website" ? { from: h.from } : {}) };
      facts.known--;
      facts.locked++;
    });
    if (hidden) {
      hiddenIds.add(c.id);
      // An open role's free title never names the locked company.
      const site = live(c, s, "website") ?? icons[c.id] ?? null;
      for (const er of engRecs) {
        const rc = er.cells.role;
        if (rc?.s !== "value" || rc.system) continue;
        const fn = er.cells.function?.s === "value" ? er.cells.function.v : null;
        er.cells.role = { ...rc, v: titleWithout(rc.v, c.name, site, fn ? `Fractional ${fn} role` : "Fractional role") };
      }
      // The About is read without the giveaways only where its text goes out (withAbout); the table carries a marker for it (ABOUT_LATER).
      for (const k of [...IDENTITY_FIELDS, "hq"]) if (cells[k] && (k !== "about" || withAbout)) cells[k] = hideIdentity(k, cells[k], { name: c.name, sites: [live(c, s, "website"), icons[c.id]], people: k === "about" ? [...people.map((p) => live(p, s, "name")), ...engs.map((e) => live(e, s, "operator"))] : [] });
    } else {
      for (const x of closedPostings) {
        x.cells.posting = cell(x.e, "engagement", "posting", true);
        facts.locked--;
        facts.known++;
      }
      // Invite to connect: the viewer sees who held a seat here, and its holder isn't on Merlin yet (invitable).
      if (me)
        engs.forEach((e, n) => {
          const er = engRecs[n];
          const op = er.cells.operator;
          if (er.yours || op?.s !== "value" || op.member || !invitable(s, idx, me, e, true)) return;
          const at = myInvites.get(e.id);
          er.invite = { path: `/claim/${claimToken(e.id)}?ref=${encodeURIComponent(myCode)}`, ...(at ? { at } : {}) };
        });
    }
    // The About is the longest text on a record and only an open record shows it: the table carries a marker, GET ?about= the text.
    if (!withAbout && cells.about?.s === "value") cells.about = ABOUT_LATER();
    const leads = leadsOf(s, c.id, hidden);
    const rec: CompanyRec = {
      id: pubId(c.id),
      name: hidden ? HIDDEN_COMPANY : c.name,
      hidden,
      iconDomain: hidden ? null : icons[c.id] ?? null,
      cells,
      friendly: friendliness(g, s, tracks, c.id, engs, operators, reviewFirms.has(c.id)),
      country: geo.country,
      region: geo.region,
      engagements: engRecs,
      people: coPeople,
      following: following.has(c.id),
      facts,
      updatedAt,
      mine,
      // Paid to see it while it was hidden (Unlock company, or its open role's title or posting: one purchase, recorded on the company).
      ...(me && (s.unlocks[fkey(c.id, "identity")] ?? []).includes(me.id) ? { unlocked: true } : {}),
      ...(addedByMe.has(c.id) ? { added: true } : {}),
      ...(foundNow ? { found: true as const } : {}),
      // Who leads each function, from the company's own website: about roles, not people, so free wherever the company's basics show.
      ...(leads ? { leads } : {}),
    };
    companies.push(rec);
    if (forPreview)
      forPreview.push({
        rec,
        name: c.name,
        site: live(c, s, "website") ?? icons[c.id] ?? null,
        seed: previewSeed(c.id),
        rnHolders: new Set(engs.filter((e) => seatHolder(s, idx, e.id, valueOf(e, s, "operator"))).map((e) => pubId(e.id))),
      });
  }
  // Locked companies after the named ones of the same score, in the order of their public ids: an
  // order by the real name (or the seed's, which is close to it) would say where each name falls.
  companies.sort(
    (a, b) => b.friendly.score - a.friendly.score || Number(!!a.hidden) - Number(!!b.hidden) || (a.hidden && b.hidden ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.name.localeCompare(b.name)),
  );

  const nameOf = new Map<string, string>();
  for (const m of seed.members) nameOf.set(m.id, m.name);
  for (const m of s.members) nameOf.set(m.id, m.name);
  const memberName = (id: string) => nameOf.get(id) ?? "A former member";

  const reported: View["reported"] = [];
  const entityOf = (id: string): Entity =>
    g.companies.has(id) ? "company" : g.engagements.has(id) ? "engagement" : g.contacts.has(id) ? "contact" : id.startsWith("e_") ? "engagement" : id.startsWith("c_") ? "company" : "contact";
  const companyIdOf = (id: string) => (g.companies.has(id) ? id : g.engagements.get(id)?.companyId ?? g.contacts.get(id)?.companyId ?? "");
  const companyNameOf = (id: string) => {
    const cid = companyIdOf(id);
    // A company this build left out (an action's answer builds only what it touched) follows the same rule.
    const locked = hiddenIds.has(cid) || (!!known && !builtIds.has(cid) && !known.has(cid));
    return locked ? HIDDEN_COMPANY : g.companies.get(cid)?.name ?? "";
  };
  /** What an unlock (or its refund) bought, for the credit history: one half of a pair names the pair ("Person name and title"). */
  const boughtLabel = (entity: Entity, id: string, field: string) => {
    if (entity === "contact" && PERSON_BUNDLE.includes(field)) {
      const p = g.contacts.get(id);
      if (p && PERSON_BUNDLE.every((f) => valueOf(p, s, f))) return PERSON_PAIR_LABEL;
    }
    if (entity === "engagement" && SEAT_BUNDLE.includes(field)) {
      const e = g.engagements.get(id);
      if (e && seatBundled(e, s) && valueOf(e, s, "role")) return SEAT_PAIR_LABEL;
    }
    return ledgerLabel(entity, field);
  };
  if (admin) {
    const lastReport = new Map<string, string>();
    for (const r of s.reportLog) if (r.at > (lastReport.get(r.ref) ?? "")) lastReport.set(r.ref, r.at);
    for (const [k, v] of Object.entries(s.values)) {
      if (v.status === "removed" || (v.status !== "reported" && !v.reporters?.length)) continue;
      const dot = k.indexOf(".");
      const id = k.slice(0, dot);
      const field = k.slice(dot + 1);
      const entity = entityOf(id);
      const f = fieldDef(entity, field);
      if (!f) continue;
      reported.push({
        entity,
        id: outId(entity, id),
        field,
        record: companyNameOf(id) || "Unknown company",
        label: f.label,
        value: v.value,
        companyId: pubId(companyIdOf(id)),
        addedBy: v.by === "seed" ? "Revenue Nomad records" : v.by === "scan" ? "Weekly scan" : v.by === ABOUT_BY ? ABOUT_SOURCE : memberName(v.by),
        reporters: (v.reporters ?? (v.reportedBy ? [v.reportedBy] : [])).map(memberName),
        reportedAt: lastReport.get(k) ?? null,
        hidden: v.status === "reported",
      });
    }
    // Hidden from everyone first, then the most reported, then the newest.
    reported.sort((a, b) => Number(!!b.hidden) - Number(!!a.hidden) || b.reporters.length - a.reporters.length || (b.reportedAt ?? "").localeCompare(a.reportedAt ?? ""));
  }

  const ledger: LedgerRow[] = [];
  let meRec: Me | null = null;
  if (me) {
    const joinedById = new Map(s.members.map((m) => [m.id, m]));
    let added = 0;
    let unlocked = 0;
    // Invitees whose first fact earned me the bonus (paid, or held under the cap).
    const paidInvitees = new Set<string>();
    const inviteeOf = (ref: string) => {
      const id = ref.slice(0, Math.max(0, ref.indexOf(".")));
      return joinedById.get(id)?.referredBy === me.id ? id : null;
    };
    for (const h of s.held) if (h.memberId === me.id && h.reason === "referral" && inviteeOf(h.ref)) paidInvitees.add(inviteeOf(h.ref)!);
    let holdersUnlocked = 0;
    let companiesUnlocked = 0;
    for (const l of s.ledger) {
      if (l.memberId !== me.id) continue;
      if (l.reason === "fill" && !l.undone) added++;
      if (l.reason === "unlock") {
        unlocked++;
        if (l.ref.endsWith(".operator")) holdersUnlocked++;
        else if (l.ref.endsWith(".identity")) companiesUnlocked++;
      }
      const dot = l.ref.indexOf(".");
      const id = dot < 0 ? l.ref : l.ref.slice(0, dot);
      const field = dot < 0 ? "" : l.ref.slice(dot + 1);
      if (l.reason === "referral") {
        // The ref names the other member: the invitee on the inviter's row, and the other way round.
        if (l.delta > 0 && inviteeOf(l.ref)) paidInvitees.add(id);
        ledger.push({ at: l.at, delta: l.delta, reason: l.reason, company: nameOf.has(id) ? firstName(nameOf.get(id)!) : "", field: "Invite bonus" });
        continue;
      }
      // A rate shared for the benchmarks only: no record to name. Taking it back reads "Removed".
      if (id === "bench") {
        ledger.push({ at: l.at, delta: l.delta, reason: l.reason === "reversal" ? "Removed" : l.reason, company: "", field: BENCH_LABEL });
        continue;
      }
      // Pro's credits for a paid month, and a top-up bought (lib/billing).
      if (l.reason === "plan" || l.reason === "topup") {
        ledger.push({ at: l.at, delta: l.delta, reason: l.reason === "plan" ? "Pro credits for the month" : `Bought ${TOPUP_CREDITS} credits`, company: "", field: "" });
        continue;
      }
      // The one-time lift to 0 when starter credits went down.
      if (l.reason === "adjust") {
        ledger.push({ at: l.at, delta: l.delta, reason: "Topped up to 0 when starter credits changed", company: "", field: "" });
        continue;
      }
      // A credit back for an end month that read "Ongoing", free now (refundOngoingEnds). The line says it all.
      if (l.reason === "refund" && l.why === "ongoing") {
        ledger.push({ at: l.at, delta: l.delta, reason: ONGOING_REFUND, company: "", field: "" });
        continue;
      }
      // A credit back for a seat holder's name from public profiles that came off the seat (takeNameOff), then "at Acme".
      if (l.reason === "refund" && l.why === "name") {
        ledger.push({ at: l.at, delta: l.delta, reason: NAME_REFUND, company: companyNameOf(id), field: "" });
        continue;
      }
      // A credit back for one of two listings of the same role the member had both bought (mergeDuplicateRoles).
      if (l.reason === "refund" && l.why === "duplicate") {
        ledger.push({ at: l.at, delta: l.delta, reason: DUPLICATE_REFUND, company: companyNameOf(id), field: "" });
        continue;
      }
      // A credit back for an unlock on a role that had already closed (applyScan).
      if (l.reason === "refund" && (l.why === "closed" || l.why === "removed" || l.why === "offbar")) {
        ledger.push({ at: l.at, delta: l.delta, reason: l.why === "closed" ? CLOSED_REFUND : l.why === "offbar" ? OFFBAR_REFUND : REMOVED_REFUND, company: companyNameOf(id), field: "" });
        continue;
      }
      // A fact the member took back (retract): "Took back the HQ", then "at Acme".
      if (l.reason === "reversal" && l.why === "retract") {
        ledger.push({ at: l.at, delta: l.delta, reason: `Took back ${say(entityOf(id), field)}`, company: companyNameOf(id), field: "" });
        continue;
      }
      ledger.push({ at: l.at, delta: l.delta, reason: l.reason, company: companyNameOf(id), field: l.reason === "unlock" || l.reason === "refund" ? boughtLabel(entityOf(id), id, field) : ledgerLabel(entityOf(id), field) });
    }
    ledger.reverse();
    const prof = s.profiles[me.id] ?? {};
    const { earned, resetsAt } = earning(s, me.id, nowMs);
    const joinedMe = joinedById.get(me.id);
    meRec = {
      id: me.id,
      name: me.name,
      email: me.email,
      // Accounts that joined before titles started empty were stored as "Member": that is no title.
      title: prof.title || (me.title === "Member" ? "" : me.title),
      function: prof.function ?? functionOf(me.title),
      goal: prof.goal ?? null,
      onboarded: !!prof.onboarded,
      ...shownBalance(balance(s, me.id)),
      unlocksLeft: unlockRoom(s, me.id, nowMs).left,
      sellEarnLeft: Math.max(0, SELL_EARN_MAX - sellToday(s, me.id, nowMs, pickExempt(s, me.id, ownSeatAt)).earned),
      earned24h: earned,
      earnCap: EARN_CAP,
      earnResetsAt: resetsAt,
      held: heldFor(s, me.id),
      admin,
      ...(asMember ? { asMember: true } : {}),
      token: me.token,
      inviteCode: inviteCode(me.id),
      invited: s.members.filter((m) => m.referredBy === me.id).length,
      invitesPaid: paidInvitees.size,
      invitePending: !!joinedMe?.referredBy && !s.referralPaid.includes(me.id),
      // The invite loop: who invited them (onboarding says so), and who joined from their invite. First names only.
      ...inviteLoopFor(s, idx, me, nowMs),
      added,
      unlocked,
      holdersUnlocked,
      companiesUnlocked,
      digest: !prof.digestOff,
      unread: unreadCount(s, me.id),
      messageEmail: !prof.messageEmailOff,
      partners: !prof.partnersOff,
      radar: !prof.radarOff,
      proInterest: !!prof.proInterest,
      // Who they hunt, and their saved views (one list with the connector's saved searches).
      icp: prof.icp ?? null,
      savedViews: savedViewsOut(s.connector?.alerts?.[me.id]),
      // Who usually gets hired before them (left out when never asked), their first view while it is
      // saved, and onboarding's answers so far while they are still in it. Only ever their own.
      ...(Array.isArray(prof.before) ? { before: [...prof.before] } : {}),
      firstView: prof.firstView && (s.connector?.alerts?.[me.id] ?? []).some((x) => x.id === prof.firstView && x.place) ? prof.firstView : null,
      draft: !prof.onboarded && prof.draft ? { ...prof.draft } : null,
      clientCount: prof.clientCount ?? null,
      looking: typeof prof.looking === "boolean" ? prof.looking : null,
      // Their plan, only while billing is live (lib/billing). Without it nothing is gated.
      ...(billingLive() ? { plan: planView(s, me.id, nowMs) } : {}),
      // Only the viewer's own. Nobody else's private rate ever leaves the server.
      benchRates: s.benchRates
        .filter((b) => b.by === me.id)
        .map((b): BenchRate => ({ id: b.id, engagementId: b.engagementId ? pubId(b.engagementId) : null, function: b.fn, kind: b.kind, amount: b.amount })),
    };
  }

  let facts = hiddenForMe;
  for (const c of companies) facts += c.facts.known + c.facts.locked;
  const stats: View["stats"] = {
    companies: g.companies.size,
    engagements: g.engagements.size,
    people: peopleCount,
    fractionalFriendly: companies.filter((c) => c.friendly.tier === "High" || c.friendly.tier === "Medium").length,
    openRoles: companies.reduce((n, c) => n + c.friendly.open, 0),
    openedWeek: 0,
    members: seed.members.length + s.members.length,
    facts,
    starter: STARTER_CREDITS,
  };
  // Counted for everyone: the landing page says how many roles opened this week.
  const scanAll = scanSummary(g, s, tracks, nowMs, meRec?.function ?? null);
  stats.openedWeek = scanAll.opened7;
  // A build of a few companies counts only those: it never stands in for the signed-out counts.
  if (!only) statsCache = { s, seed, stats, at: nowMs };
  if (forPreview && !only) anonCompanies = { s, seed, list: forPreview, at: nowMs };
  const scan = me ? scanAll : null;
  return {
    demo: !!seed.demo,
    me: meRec,
    // Signed out: no records (sign up to see them), only the counts for the landing page.
    companies: me ? companies : [],
    stats,
    ledger,
    reported,
    email: emailEnabled(),
    contact: contactInfo(),
    ...(me && scan ? { ...(bench ? { benchmarks: freeNow(s, me.id, nowMs) ? freeBenchmarks(benchmarks(seed, g, s, me.id)) : benchmarks(seed, g, s, me.id) } : {}), scan } : {}),
    ...(me && scan && admin && !only
      ? {
          admin: {
            ...adminStats(seed, s, g, idx, nowMs, scan, entityOf),
            messages: messageStats(s),
            integrations: integrationStats(s.integrations),
            finds: findStats(s, nowMs),
            ...(billingLive() ? { billing: billingStats(s, idx, nowMs) } : {}),
          },
          reportedMessages: reportedMessages(s, memberName),
        }
      : {}),
    version: viewVersion(s),
  };
}

/** How a ledger row or a stats line names a field. */
const BENCH_LABEL = "Private rate";
/** The ledger line for an unlock paid back because the role had closed. The company follows it ("… at Acme"). */
const CLOSED_REFUND = "Refund for a role that had closed";
/** The ledger line for a credit back when a member had bought two listings of one role (mergeDuplicateRoles). */
const DUPLICATE_REFUND = "Refund for the same role listed twice";
/** A role the scan took off the table: a full-time job an older screen had let in (lib/scan/remove.ts). */
const REMOVED_REFUND = "Refund for a full-time job we took off the list";
/** A role the scan took off the table because it is outside GTM and below Director (lib/seniority.ts). */
const OFFBAR_REFUND = "Refund for a role we took off the list";
/** The credit back for an end month that read "Ongoing" (refundOngoingEnds). The owner's words. */
const ONGOING_REFUND = "Gave back 1 credit: an ongoing seat's end month is free now.";
/** The credit back for a seat holder's name from public profiles that came off its seat (takeNameOff). The company follows it. */
const NAME_REFUND = "Refund for a seat holder's name that came off";
/** A person's name and title, and who held a seat with their role, as the credit history names the purchase (app/post/ledger.ts reads these). */
const PERSON_PAIR_LABEL = "Person name and title";
const SEAT_PAIR_LABEL = "Seat holder and role";
const fieldLabel = (entity: Entity, field: string) =>
  entity === "company" && field === "identity" ? HIDDEN_COMPANY : fieldDef(entity, field)?.label ?? field;
/** The same for a row in the credit history. A person's fields say so: "Person email", not "Email". */
const ledgerLabel = (entity: Entity, field: string) => (entity === "contact" ? `Person ${lower(fieldLabel(entity, field))}` : fieldLabel(entity, field));

/* ---------- the weekly scan, as numbers ---------- */

const WEEK = 7 * DAY;

/** The function an engagement counts under. */
const fnOf = (e: Node, s: State) => live(e, s, "function") ?? functionOf(live(e, s, "role"));

function scanSummary(g: Graph, s: State, tracks: Tracks, nowMs: number, myFunction: string | null): ScanSummary {
  let openNow = 0;
  let opened7 = 0;
  let closed30 = 0;
  let mine7 = 0;
  for (const e of g.engagements.values()) {
    const t = tracks.get(e.id);
    // A role a clean scan no longer saw is not counted as open, or as new.
    const open = isOpenRole(e, s, tracks) && !(t && isUnseen(t));
    if (open) openNow++;
    if (!t) continue;
    if (t.closedAt) {
      if (nowMs - Date.parse(t.closedAt) < 30 * DAY) closed30++;
    } else if (open && newThisWeek(t, nowMs)) {
      opened7++;
      if (myFunction && fnOf(e, s) === myFunction) mine7++;
    }
  }
  return { lastRunAt: s.scan.lastRunAt, lastOkAt: lastOkOf(s.scan), openNow, opened7, closed30, mine7, digest: digestOn() };
}

/** A board read cleanly on a run when it answered with listings and some of them matched (the rule before baselines were kept). */
const answeredClean = (x: ScanSourceResult) => !x.error && x.fetched > 0 && x.matched > 0;
/** The last run in which at least one board answered cleanly. States written before this was kept get it from their last run. */
const lastOkOf = (scan: ScanState): string | null =>
  scan.lastOkAt !== undefined ? scan.lastOkAt : scan.lastRunAt && scan.sources.some(answeredClean) ? scan.lastRunAt : null;
/** Each board the scan has read, for Pilot metrics. */
const scanBoards = (scan: ScanState): NonNullable<AdminStats["boards"]> =>
  Object.entries(scan.boards ?? {})
    .map(([source, b]) => ({ source, healthy: b.healthy, lastOkAt: b.lastOkAt, baseline: b.baseline }))
    .sort((a, b) => a.source.localeCompare(b.source));

/** The weekly email is on: an email provider is set up and RN_DIGEST is not 0. */
function digestOn() {
  return emailEnabled() && process.env.RN_DIGEST !== "0";
}

/* ---------- pilot metrics (admins) ---------- */

function adminStats(seed: Seed, s: State, g: Graph, idx: MemberIndex, nowMs: number, scan: ScanSummary, entityOf: (id: string) => Entity): AdminStats {
  // Balances of everyone who has shown up: joined, signed in, onboarded or in the ledger.
  const sums = new Map<string, number>();
  for (const l of s.ledger) sums.set(l.memberId, (sums.get(l.memberId) ?? 0) + l.delta);
  const active = new Set<string>([...sums.keys(), ...Object.keys(s.seen), ...Object.keys(s.profiles), ...s.members.map((m) => m.id)]);
  const balances = [...active].filter((id) => idx.byId.has(id)).map((id) => STARTER_CREDITS + (sums.get(id) ?? 0)).sort((a, b) => a - b);
  const median = balances.length ? balances[Math.floor((balances.length - 1) / 2)] : STARTER_CREDITS;
  const seenWithin = (ms: number) => Object.values(s.seen).filter((at) => nowMs - Date.parse(at) < ms).length;

  const top = (reason: "fill" | "unlock") => {
    const n = new Map<string, number>();
    for (const l of s.ledger) {
      if (l.reason !== reason || l.undone) continue;
      const dot = l.ref.indexOf(".");
      const id = l.ref.slice(0, dot);
      const field = l.ref.slice(dot + 1);
      const entity = entityOf(id);
      const label = id === "bench" ? BENCH_LABEL : entity === "contact" ? `Person ${lower(fieldLabel(entity, field))}` : fieldLabel(entity, field);
      n.set(label, (n.get(label) ?? 0) + 1);
    }
    return [...n].map(([field, count]) => ({ field, n: count })).sort((a, b) => b.n - a.n || a.field.localeCompare(b.field)).slice(0, 8);
  };
  let adds = 0;
  let unlocks = 0;
  let adds7 = 0;
  let unlocks7 = 0;
  for (const l of s.ledger) {
    const recent = nowMs - Date.parse(l.at) < WEEK;
    if (l.reason === "fill" && !l.undone) (adds++, recent && adds7++);
    else if (l.reason === "unlock") (unlocks++, recent && unlocks7++);
  }

  // Who added the most this week, so a flood of guesses is easy to spot. Only facts on records
  // that still stand count (the newest fill of each), so a member whose facts were removed drops out.
  const addsBy = new Map<string, { adds24h: number; adds7: number; lastAt: string | null }>();
  const counted = new Set<string>();
  for (let i = s.ledger.length - 1; i >= 0; i--) {
    const l = s.ledger[i];
    if (l.reason !== "fill" || l.ref.startsWith("bench.") || counted.has(l.ref)) continue;
    const v = s.values[l.ref];
    if (!v || v.by !== l.memberId || v.status === "removed") continue;
    counted.add(l.ref);
    const age = nowMs - Date.parse(l.at);
    if (age >= WEEK) continue;
    const r = addsBy.get(l.memberId) ?? { adds24h: 0, adds7: 0, lastAt: null };
    r.adds7++;
    if (age < DAY) r.adds24h++;
    if (!r.lastAt || l.at > r.lastAt) r.lastAt = l.at;
    addsBy.set(l.memberId, r);
  }
  const privateBy = benchRateCounts(s);
  const recentAdds = [...addsBy]
    .filter(([id]) => idx.byId.has(id))
    .sort(([, a], [, b]) => b.adds7 - a.adds7 || b.adds24h - a.adds24h || (b.lastAt ?? "").localeCompare(a.lastAt ?? ""))
    .slice(0, 20)
    .map(([id, r]) => ({ memberId: pubId(id), name: idx.byId.get(id)!.name, adds24h: r.adds24h, adds7: r.adds7, privateRates: privateBy.get(id) ?? 0, lastAt: r.lastAt }));

  const walled = new Set<string>();
  let hits = 0;
  let views = 0;
  const byWhere: Record<string, number> = {};
  for (const x of s.signals) {
    if (x.name === "wall") {
      hits++;
      walled.add(x.memberId);
    } else if (x.name === "pro_view") views++;
    else if (x.name === "pro_interest") byWhere[x.where] = (byWhere[x.where] ?? 0) + 1;
  }

  const linked = new Set<string>();
  let factsMissing = 0;
  let memberRates = 0;
  for (const e of g.engagements.values()) {
    const holder = seatHolder(s, idx, e.id, valueOf(e, s, "operator"));
    if (holder) {
      linked.add(holder.id);
      factsMissing += missingOnSeat(e, s);
    }
    const rate = live(e, s, "rate");
    if (rate && readRate(rate, live(e, s, "pricing"))) memberRates++;
  }
  return {
    members: {
      total: seed.members.length + s.members.length,
      joined: s.members.length,
      onboarded: Object.values(s.profiles).filter((p) => p.onboarded).length,
      active7: seenWithin(WEEK),
      active30: seenWithin(30 * DAY),
    },
    credits: { atZero: balances.filter((b) => b <= 0).length, low: balances.filter((b) => b >= 1 && b <= 3).length, median },
    activity: { adds, unlocks, adds7, unlocks7 },
    recentAdds,
    roleClaims: (s.roleClaims ?? [])
      .filter((c) => nowMs - Date.parse(c.at) < CLAIM_KEEP && idx.byId.has(c.memberId) && g.engagements.has(c.engagementId))
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((c) => {
        const op = s.values[fkey(c.engagementId, "operator")];
        return {
          memberId: pubId(c.memberId),
          name: idx.byId.get(c.memberId)!.name,
          company: g.companies.get(g.engagements.get(c.engagementId)!.companyId)?.name ?? "",
          engagementId: pubId(c.engagementId),
          at: c.at,
          closed: c.closed !== false,
          standing: !!op && op.status !== "removed" && op.by === c.memberId && op.memberId === c.memberId,
        };
      }),
    seatClaims: (s.seatClaims ?? [])
      .filter((c) => nowMs - Date.parse(c.at) < CLAIM_KEEP && idx.byId.has(c.memberId) && g.engagements.has(c.engagementId))
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((c) => {
        const op = s.values[fkey(c.engagementId, "operator")];
        return {
          memberId: pubId(c.memberId),
          name: idx.byId.get(c.memberId)!.name,
          company: g.companies.get(g.engagements.get(c.engagementId)!.companyId)?.name ?? "",
          engagementId: pubId(c.engagementId),
          at: c.at,
          standing: !!op && op.status === "live" && op.by === c.memberId && op.memberId === c.memberId,
        };
      }),
    firmReview: [...(seed.firmReview ?? []), ...(s.firmReview ?? [])]
      .filter((r, i, all) => g.companies.has(r.companyId) && all.findIndex((x) => x.companyId === r.companyId) === i)
      .map((r) => ({ companyId: pubId(r.companyId), company: r.name, reason: r.reason, at: r.at }))
      // A placeholder name kept only because a member holds a seat there (see graph).
      .concat(placeholdersInReview(g).map((r) => ({ companyId: pubId(r.companyId), company: r.name, reason: "placeholder name", at: "" }))),
    walls: { members: walled.size, hits },
    pro: { interested: Object.values(s.profiles).filter((p) => p.proInterest).length, views, byWhere },
    topUnlocked: top("unlock"),
    topAdded: top("fill"),
    scan: { lastRunAt: scan.lastRunAt, openNow: scan.openNow, opened7: scan.opened7, closed30: scan.closed30, sources: s.scan.sources },
    boards: scanBoards(s.scan),
    digest: { enabled: digestOn(), lastSentAt: s.digest.lastSentAt, sent: s.digest.sent, optedOut: Object.values(s.profiles).filter((p) => p.digestOff).length },
    seats: { linkedMembers: linked.size, factsMissing },
    benchmarks: { memberRates, privateRates: s.benchRates.length, indexRates: seed.rateIndex?.length ?? 0 },
    about: aboutStats(s, g, nowMs),
    leaders: leadersStats(s, g, nowMs),
    funding: fundingAdminStats(s.funding, nowMs),
    radar: radarStats(
      s.radar,
      s.signals,
      s.profiles,
      // Members whose radar is on and can match something: signed in, a function, an Ideal Fractional Profile.
      idx.all.filter((m) => {
        const p = s.profiles[m.id];
        const fn = p?.function ?? functionOf(p?.title || m.title);
        const icp = p?.icp;
        return signedIn(s, idx, m.id) && !p?.radarOff && !!fn && fn !== "Other" && !!icp && !!(icp.industries.length || icp.employees.length || icp.revenue.length || icp.countries.length);
      }).length,
      nowMs,
    ),
    radarModel: crystalModelStats(seed, s, g, nowMs),
    ...(seed.engagements.some((e) => e.holderFrom === PUBLIC_PROFILE) || s.names ? { names: namesStats(seed, s, g, idx) } : {}),
  };
}

/** Pilot metrics: the names from public profiles, the switch, and the claims waiting for an admin (namesStats is read from the seed, so the counts hold while the switch hides the names). */
function namesStats(seed: Seed, s: State, g: Graph, idx: MemberIndex): NonNullable<AdminStats["names"]> {
  let onFile = 0;
  let unverified = 0;
  let claimed = 0;
  let removed = 0;
  for (const e of seed.engagements) {
    if (e.holderFrom !== PUBLIC_PROFILE || !e.fields.operator || !g.engagements.has(e.id)) continue;
    const v = s.values[fkey(e.id, "operator")];
    if (v?.status === "removed") removed++;
    else if (v?.memberId) claimed++;
    else {
      onFile++;
      if (!nameVerified(s, e.id)) unverified++;
    }
  }
  const claims = (s.names?.claims ?? [])
    .filter((c) => c.status === "pending" && idx.byId.has(c.memberId) && g.engagements.has(c.engagementId))
    .map((c) => {
      const e = g.engagements.get(c.engagementId)!;
      return {
        memberId: pubId(c.memberId),
        member: idx.byId.get(c.memberId)!.name,
        engagementId: pubId(e.id),
        company: g.companies.get(e.companyId)?.name ?? "",
        seat: live(e, s, "role") ?? fnOf(e, s),
        onFile: publicName(e, s)?.value ?? seedPublicName(seed, s, e.id) ?? "",
        at: c.at,
      };
    });
  return { shown: publicNamesOn(seed, s, g), on: !s.names?.hide, limit: namesUntil(), seats: seatCount(seed, s, g), onFile, unverified, claimed, removed, claims };
}

/* ---------- rate benchmarks ---------- */

/** A group shows numbers only with rates from at least this many contributors. */
export const BENCHMARK_MIN_N = 5;
/** A figure that includes Rate Index data needs this many (the survey promised groups of 20). */
export const BENCHMARK_INDEX_MIN_N = 20;
/** The range (p25 to p75) is sent only at this many contributors. Below it, the median alone. */
export const BENCHMARK_RANGE_N = 10;
/** What leaves the server is rounded: dollars a month to the nearest 250, dollars an hour to the nearest 5 ... */
const BENCH_ROUND = { monthly: 250, hourly: 5 } as const;
/** ... and wider while a figure has fewer than BENCHMARK_RANGE_N contributors, where one person moves it most. */
const BENCH_ROUND_WIDE = { monthly: 1000, hourly: 25 } as const;

/** Benchmark-only rates on file per member (a count, never an amount), for the admin's list of recent adds. */
export function benchRateCounts(s: State): Map<string, number> {
  const n = new Map<string, number>();
  for (const b of s.benchRates) n.set(b.by, (n.get(b.by) ?? 0) + 1);
  return n;
}

/**
 * One rate. `who` is its contributor: "m:<member id>" for a rate a member shared or put on a
 * record, "r:<engagement id>" for a rate from our own records, "x:<row>" for a Rate Index row.
 * `index` marks a point from the Rate Index. `priv` marks a rate shared for the benchmarks only
 * (a rate on a record is not private: any member can unlock it for a credit).
 */
type RatePoint = { fn: string; revenue: string | null; kind: "monthly" | "hourly"; amount: number; index: boolean; who: string; priv: boolean };

const quantile = (sorted: number[], p: number) => {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
};

/**
 * One benchmark figure, counted in people and not in rows. Each contributor counts once, with
 * the middle of their rates in the group, so one account can never fill a group or pad it. Only
 * contributors who count are in it at all (see benchPoints()).
 *
 * A figure is the first of these that holds:
 *  - with Rate Index data, when the Rate Index rows and the contributors together reach 20 (the
 *    survey promised groups of 20)
 *  - from member rates and our own records, when 5 members shared a rate privately. The survey
 *    rows are left out, so survey data never shows in a group under 20.
 *  - from rates on records alone, when those come from 5 contributors.
 * A rate on a record is no cover for a private one, because any member can unlock it for a
 * credit and take it out of the sum. So private rates and survey rows join a figure only as a
 * crowd of 5 of their own (a median over 4 unlocked rates and 1 private one would give the
 * private one away), and the range needs 10 of them. Until then they wait.
 * Below the floor, `n` and `min` describe the nearest floor ("3 of 5").
 */
function rateStat(pts: RatePoint[], kind: "monthly" | "hourly"): RateStat {
  const by = new Map<string, { amounts: number[]; index: boolean; priv: boolean }>();
  for (const p of pts) {
    const c = by.get(p.who);
    if (c) c.amounts.push(p.amount), (c.priv ||= p.priv);
    else by.set(p.who, { amounts: [p.amount], index: p.index, priv: p.priv });
  }
  const all = [...by.values()].map((c) => ({ ...c, amount: quantile(c.amounts.sort((a, b) => a - b), 0.5) }));
  const own = all.filter((c) => !c.index);
  const open = own.filter((c) => !c.priv);
  const survey = all.length - own.length;
  const openN = open.length;
  const privN = own.length - openN;
  const indexed = survey > 0 && survey + privN + openN >= BENCHMARK_INDEX_MIN_N && survey + privN >= BENCHMARK_MIN_N;
  const used = indexed ? all : privN >= BENCHMARK_MIN_N ? own : openN >= BENCHMARK_MIN_N ? open : null;
  if (!used) {
    const viaIndex = survey > 0 && BENCHMARK_INDEX_MIN_N - survey <= BENCHMARK_MIN_N;
    return viaIndex ? { n: survey + privN + openN, min: BENCHMARK_INDEX_MIN_N, indexed: true } : { n: Math.max(privN, openN), min: BENCHMARK_MIN_N, indexed: false };
  }
  const xs = used.map((c) => c.amount).sort((a, b) => a - b);
  const n = xs.length;
  const unit = (n < BENCHMARK_RANGE_N ? BENCH_ROUND_WIDE : BENCH_ROUND)[kind];
  const q = (p: number) => Math.round(quantile(xs, p) / unit) * unit;
  const stat: RateStat = { n, min: indexed ? BENCHMARK_INDEX_MIN_N : BENCHMARK_MIN_N, indexed, median: q(0.5) };
  // The private rates and survey rows in the figure (none when it is made of rates on records alone).
  const hidden = used === open ? 0 : privN + (indexed ? survey : 0);
  if (n >= BENCHMARK_RANGE_N && (hidden === 0 || hidden >= BENCHMARK_RANGE_N)) (stat.p25 = q(0.25)), (stat.p75 = q(0.75));
  return stat;
}

/** Weeks in a month, for turning hours a week into a monthly figure. */
const WEEKS_A_MONTH = 52 / 12;
const inRange = (kind: "monthly" | "hourly", amount: number) => (kind === "hourly" ? amount >= 25 && amount <= 1500 : amount >= 1000 && amount <= 150_000);

/** Every rate point that counts, with the number of rates on file, kept until the state or the seed changes. */
let benchPointsCache: { seed: Seed; s: State; pts: RatePoint[]; total: number } | null = null;
/** The benchmarks as a member with no rate of their own sees them (the same for all of them). */
let benchCache: { seed: Seed; s: State; b: Benchmarks } | null = null;

/**
 * The rate points the benchmarks are made of, from three places: every live rate on a record
 * (whoever unlocked it), rates members shared for the benchmarks only, and Revenue Nomad's Rate
 * Index. A member's rate is a point only when the member counts (trustOf): joining takes only an
 * email, and four throwaway accounts around one honest rate would otherwise make a group of five
 * whose median is that rate. `total` counts every rate on file, theirs included.
 */
function benchPoints(seed: Seed, g: Graph, s: State): { pts: RatePoint[]; total: number } {
  if (benchPointsCache && benchPointsCache.s === s && benchPointsCache.seed === seed) return benchPointsCache;
  const pts: RatePoint[] = [];
  let total = 0;
  const trusted = trustOf(seed, s);
  /** One rate: its own point, and the other kind too when the hours a month are known. */
  const add = (fnRaw: string | null, revenueRaw: string | null, r: { kind: "monthly" | "hourly"; amount: number }, hoursMonth: number | null, index: boolean, who: string, counts: boolean, priv = false) => {
    total++;
    if (!counts) return;
    const fn = fnRaw && FUNCTIONS.includes(fnRaw) ? fnRaw : functionOf(fnRaw) ?? "Other";
    const revenue = revenueRaw && RN_REVENUE.includes(revenueRaw) ? revenueRaw : null;
    pts.push({ fn, revenue, kind: r.kind, amount: r.amount, index, who, priv });
    if (!hoursMonth || hoursMonth <= 0) return;
    const other = r.kind === "hourly" ? ("monthly" as const) : ("hourly" as const);
    const amount = Math.round(r.kind === "hourly" ? r.amount * hoursMonth : r.amount / hoursMonth);
    if (inRange(other, amount)) pts.push({ fn, revenue, kind: other, amount, index, who, priv });
  };
  const hoursMonthOf = (e: Node) => {
    const h = Number(live(e, s, "hours"));
    return Number.isFinite(h) && h > 0 ? h * WEEKS_A_MONTH : null;
  };
  /**
   * Hours for a rate shared for the benchmarks only: the member's own figure, or ours. Hours
   * someone else put on the seat are left out. Anyone can fill and then edit that fact, so it
   * would let them slide the member's point along the other kind's figure and read the rate off it.
   */
  const ownHoursMonth = (e: Node, by: string) => {
    const v = valueOf(e, s, "hours");
    const h = v && (v.by === by || isSystem(v.by)) ? Number(v.value) : NaN;
    return Number.isFinite(h) && h > 0 ? h * WEEKS_A_MONTH : null;
  };
  const revenueOf = (e: EngNode) => live(e, s, "revenue") ?? live(g.companies.get(e.companyId), s, "revenue");

  const publicBy = new Map<string, string>(); // engagement id -> who added its live public rate
  for (const e of g.engagements.values()) {
    const v = valueOf(e, s, "rate");
    if (!v || v.status !== "live") continue;
    // A budget posted on a job board is what a client offered, not what a fractional was paid.
    if (isSystem(v.by) && e.source === "Demand scan") continue;
    const r = readRate(v.value, live(e, s, "pricing"));
    if (!r) continue;
    publicBy.set(e.id, v.by);
    // The contributor is whoever put the rate there: a member, or the record itself when it is ours.
    const ours = isSystem(v.by);
    add(fnOf(e, s), revenueOf(e), r, hoursMonthOf(e), false, ours ? `r:${e.id}` : `m:${v.by}`, ours || trusted(v.by));
  }
  for (const b of s.benchRates) {
    const e = b.engagementId ? g.engagements.get(b.engagementId) : undefined;
    // The same member's rate is already on the record: count it once.
    if (e && publicBy.get(e.id) === b.by) continue;
    add(b.fn, b.revenue, { kind: b.kind, amount: b.amount }, e ? ownHoursMonth(e, b.by) : null, false, `m:${b.by}`, trusted(b.by), true);
  }
  for (const [i, x] of (seed.rateIndex ?? []).entries()) {
    const hourly = Number(x?.hourly);
    if (!inRange("hourly", hourly)) continue;
    const hours = Number(x.hours);
    add(String(x.fn ?? ""), x.revenue ?? null, { kind: "hourly", amount: Math.round(hourly) }, Number.isFinite(hours) && hours > 0 ? hours : null, true, `x:${i}`, true);
  }
  const out = { seed, s, pts, total };
  if (s === stateCache) benchPointsCache = out;
  return out;
}

/**
 * Benchmarks by function and client revenue band. Only medians and ranges leave the server,
 * counted in people (see rateStat) and rounded.
 *
 * A member's own rates are left out of what that member sees (`withoutYours` marks those
 * figures). Otherwise one account could share a low rate, read the median, swap it for a high
 * one and read it again, and the two medians together give away the rates next to the middle.
 * With its own rate left out, nothing it shares moves a number it can see.
 */
function benchmarks(seed: Seed, g: Graph, s: State, viewerId?: string): Benchmarks {
  const { pts, total } = benchPoints(seed, g, s);
  const who = viewerId ? `m:${viewerId}` : "";
  const mine = who ? pts.filter((p) => p.who === who) : [];
  if (!mine.length && benchCache && benchCache.s === s && benchCache.seed === seed) return benchCache.b;
  const use = mine.length ? pts.filter((p) => p.who !== who) : pts;
  const rows: BenchmarkRow[] = [];
  for (const fn of FUNCTIONS) {
    const inFn = use.filter((p) => p.fn === fn);
    const myFn = mine.filter((p) => p.fn === fn);
    const row = (revenue: string, xs: RatePoint[], my: RatePoint[]): BenchmarkRow => {
      const stat = (kind: "monthly" | "hourly") => {
        const st = rateStat(xs.filter((p) => p.kind === kind), kind);
        return my.some((p) => p.kind === kind) ? { ...st, withoutYours: true } : st;
      };
      const monthly = stat("monthly");
      const hourly = stat("hourly");
      // Marked Rate Index only when a figure shows survey data or is counting toward the 20.
      return { function: fn, revenue, indexed: !!(monthly.indexed || hourly.indexed), monthly, hourly };
    };
    rows.push(row("All", inFn, myFn));
    for (const revenue of RN_REVENUE) rows.push(row(revenue, inFn.filter((p) => p.revenue === revenue), myFn.filter((p) => p.revenue === revenue)));
  }
  const b = { minN: BENCHMARK_MIN_N, rangeN: BENCHMARK_RANGE_N, total, rows };
  if (!mine.length && s === stateCache) benchCache = { seed, s, b };
  return b;
}

/* ---------- actions ---------- */

export class ActionError extends Error {}

/* ---------- onboarding: "who gets hired before you", and the answers so far ---------- */

/**
 * "Which fractional usually gets hired before you?" from loose input: functions on the list, each
 * once, in the order given, at most BEFORE_MAX. `[]` is "Not sure". `strict` (the profile action):
 * anything but a list, or more than BEFORE_MAX, is refused with a message the member can act on.
 */
function cleanBefore(raw: unknown, { strict = false }: { strict?: boolean } = {}): string[] {
  if (!Array.isArray(raw)) {
    if (strict) throw new ActionError("Pick the functions from the list, or Not sure.");
    return [];
  }
  const out = [...new Set(raw.slice(0, 40).map((x) => String(x ?? "").trim()).filter((x) => FUNCTIONS.includes(x)))];
  if (strict && out.length > BEFORE_MAX) throw new ActionError(`Pick up to ${BEFORE_MAX} functions.`);
  return out.slice(0, BEFORE_MAX);
}

/** A public id or a typed client name ("name:Acme"), as Find your seats keeps them: plain text, short. */
const draftText = (raw: unknown, max: number) => tidy(String(raw ?? "").replace(/[\u0000-\u001f<>]/g, ""), max);

/**
 * Onboarding's answers so far, cleaned (OnboardDraft). Every part is optional: what is missing or
 * not on its list comes back empty. Saved views are kept only when they are the member's own.
 */
function cleanDraft(raw: unknown, alerts: { id: string }[], now: string): OnboardDraft {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const step = Math.round(Number(r.step));
  let icp: Icp | null = null;
  try {
    icp = r.icp && typeof r.icp === "object" ? cleanIcp(r.icp) : null;
  } catch {
    icp = null;
  }
  const own = new Set(alerts.map((x) => x.id));
  const at = typeof r.at === "string" && Number.isFinite(Date.parse(r.at)) ? new Date(Date.parse(r.at)).toISOString() : now;
  return {
    step: Number.isFinite(step) ? Math.min(6, Math.max(1, step)) : 1,
    function: typeof r.function === "string" && FUNCTIONS.includes(r.function) ? r.function : null,
    title: draftText(r.title, 80),
    icp,
    before: Array.isArray(r.before) ? cleanBefore(r.before) : null,
    roles: r.roles !== false,
    email: r.email !== false,
    clientCount: typeof r.clientCount === "string" && (CLIENT_COUNTS as readonly string[]).includes(r.clientCount) ? r.clientCount : null,
    looking: typeof r.looking === "boolean" ? r.looking : null,
    clients: [...new Set((Array.isArray(r.clients) ? r.clients : []).slice(0, 20).map((x) => draftText(x, 90)).filter(Boolean))],
    views: [...new Set((Array.isArray(r.views) ? r.views : []).map((x) => String(x ?? "")).filter((x) => own.has(x)))].slice(0, 2),
    saved: typeof r.saved === "string" && r.saved ? r.saved.slice(0, 3000) : null,
    at,
  };
}

/** Signals one member can send in 24 hours. More are dropped without a word. */
const SIGNAL_DAILY_MAX = 200;
const SIGNAL_KEEP = 20_000;
/** radar_opened and radar_clicked come from the app's Radar page; the server records radar_sent and radar_off itself (lib/radar). */
const SIGNAL_NAMES = new Set(["wall", "pro_view", "pro_interest", "radar_opened", "radar_clicked"]);
/** Record a product signal, inside the member's daily limit. Returns whether it was kept. */
function addSignal(s: State, memberId: string, name: string, where: string, now: string): boolean {
  const nowMs = Date.parse(now);
  let today = 0;
  for (let i = s.signals.length - 1; i >= 0 && nowMs - Date.parse(s.signals[i].at) < DAY; i--) if (s.signals[i].memberId === memberId) today++;
  if (today >= SIGNAL_DAILY_MAX) return false;
  s.signals.push({ memberId, name, where, at: now });
  if (s.signals.length > SIGNAL_KEEP) s.signals.splice(0, s.signals.length - SIGNAL_KEEP);
  return true;
}

/** Private rates not tied to a seat that one member can share. */
const BENCH_UNATTACHED_MAX = 3;
/** Private rates one member can save per rolling 24 hours, counting ones removed since (each save can move a median). */
const BENCH_DAILY_MAX = 5;
const RATE_HELP = "Use a rate like $8k/mo or $150/hr.";
/** A request the server doesn't know (an old tab after a release, most likely). */
const UNKNOWN_ACTION = "That didn't go through. Refresh the page and try again.";
/** A fact an admin took off the table (review, or adminRemove): what happened to the credits. */
const REMOVED = "Removed. Anyone who unlocked it got their credit back, and it can be added again.";

/* What a seat can't say at once (see seatCheck in perform). */
const OPEN_NO_DATES = "This role is still open, so it has no start or end yet.";
const OPEN_NO_HIRE = "This role is still open, so nobody has been hired for it yet.";
const OPEN_NO_END = "This role is still open, so it has no end yet.";
const END_BEFORE_START = "The end month can't be before the start.";
const NOT_ENDED_YET = "This seat hasn't ended yet. Add why it ended once it has.";
const ACTIVE_NO_END = "An active seat has no end month yet. Pick Ongoing, or change the status to Ended.";
const ENDED_NOT_ACTIVE = "This seat has an end month, so it isn't active. Pick Ended, or change the end month.";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** The refusal for an end before the month the scan first saw the role ("Nov 2026"). */
const endBeforeListed = (firstSeen: string) =>
  `The end month can't be before ${MONTH_NAMES[Number(firstSeen.slice(5, 7)) - 1] ?? ""} ${firstSeen.slice(0, 4)}, when the role was first listed.`.replace("  ", " ");
/** Month `a` ("2025-03", or a year alone) ends before month `b` starts. A year alone compares by year. */
const monthBefore = (a: string, b: string) => (a.length === 4 || b.length === 4 ? a.slice(0, 4) < b.slice(0, 4) : a < b);

/** An Add that found everything it sent already on file. */
const NOTHING_NEW = "Nothing new was added.";
/** A seat needs to say what the work was. A name alone is not a seat. */
const SEAT_NEEDS_WHAT = "Add the seat's function or its role too, so members can tell what the work was.";
/** A fact about a seat from anyone but its holder (see holdsSeat in perform). */
export const SEAT_HOLDER_ONLY = "Only the person who held this seat can add this.";
/** A status edit on an open role the scan still lists. */
const LISTED_STATUS = "This role is still listed, so its status comes from the posting.";
/** A seat added, or a seat holder named, for anyone but the member themselves. */
export const SEAT_SELF_ONLY = "You can add seats you held. Pick yourself as the seat holder.";
/** Claiming a seat-scan seat that a member already claimed. */
const SEAT_TAKEN = "Another member already claimed this seat. If it's yours, report the seat holder and an admin will look at it.";
/** "This is me" on a seat whose name from public profiles isn't the member's own name: it waits for an admin. */
const CLAIM_QUEUED = "Thanks. The name on this seat doesn't match yours, so an admin checks your claim first. Until then the seat keeps the name it has.";
/** The same member asking again while that claim waits. */
const CLAIM_WAITING = "You said this seat is yours, and an admin is checking it. Your name goes on it once they agree.";
/** Unlocking a person's LinkedIn, email or phone before the member can see who they are (PERSON_DETAILS). */
export const NAME_FIRST = "Unlock their name and title first.";
/** Adding a person's details or title while their name is locked to the member. */
export const NAME_FIRST_ADD = "Unlock their name and title first. Then you can add what you know about them.";
/** Unlocking a person or a seat holder at a company that is still locked to the member. */
export const COMPANY_FIRST = "Unlock the company first.";
/** Adding a fact by clicking into a locked company would open it for nothing (typing its name in Add still works). */
export const COMPANY_LOCKED_ADD = `This company is locked. Unlock it for ${COMPANY_PRICE} credits, then add what you know.`;
/** Add with a name people try a form with, or copy from an example ("Acme", "Test", "Your client"): see isPlaceholderCompany. */
export const PLACEHOLDER_REFUSED = "That reads like an example name, not a real company. Type the name the company goes by.";
/** A person's title, email, phone or LinkedIn from a member who can't see who the person is (the same words as NAME_FIRST_ADD). */
export const FILL_NAME_FIRST = NAME_FIRST_ADD;
/** The same, on a person with no name on file. */
const FILL_NO_NAME = "Add their name first. Then you can add what you know about them.";
/** A person's facts that only someone who can see who they are can add (the fill action). */
const FILL_NEEDS_NAME = ["title", "email", "phone", "linkedin"];
/** How far apart two starts can be and still be one seat, in months (a self-seat add that claims a seat-scan seat). */
const SAME_SEAT_MONTHS = 3;
/** A start month as the months it can mean: "2024-03" is one month, "2024" all twelve. Null when blank. */
const monthSpan = (v: string | null | undefined): [number, number] | null => {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(String(v ?? ""));
  if (!m) return null;
  const y = Number(m[1]) * 12;
  return m[2] ? [y + Number(m[2]) - 1, y + Number(m[2]) - 1] : [y, y + 11];
};
/** Months between two starts (0 when they overlap, as a year and a month in it do), or null when either is blank. */
const monthsApart = (a: string | null | undefined, b: string | null | undefined): number | null => {
  const x = monthSpan(a);
  const y = monthSpan(b);
  if (!x || !y) return null;
  return Math.max(0, Math.max(x[0], y[0]) - Math.min(x[1], y[1]));
};

/**
 * `dryRun` (the connector's "what would this cost"): the action runs on a copy of the state and
 * nothing is kept. The answer says what it would do, and `spent` the credits it would take. A
 * refusal is thrown as it would be. `claimLink`: a claimSeat that came through the seat's own
 * claim link (/claim/<token>, claimByToken), so it works at a company locked by an open role too
 * (claiming the seat shows the member that company, as a seat holder there). `ref`: the invite code
 * that came with that link (?ref=), so the claim connects the claimer with whoever sent it
 * (connectInvite), or, when the claim waits for an admin, approving it does.
 */
export async function perform(
  token: string | null,
  a: Action,
  origin?: string,
  opts: { dryRun?: boolean; asMember?: boolean; claimLink?: boolean; ref?: string } = {},
): Promise<ActionResult & { spent?: number }> {
  if (a?.type === "scanNow") {
    if (opts.dryRun) throw new ActionError(UNKNOWN_ACTION);
    if (!isAdmin(await memberForToken(token))) throw new ActionError("Only admins can start a scan.");
    // In the background: a scan reads several job boards and can take a while.
    void runScan(origin).catch((e) => console.error("scan failed", e));
    return { message: "Scan started. It reads several job boards, so give it a few minutes." };
  }
  if (a?.type === "aboutNow") {
    if (opts.dryRun) throw new ActionError(UNKNOWN_ACTION);
    if (!isAdmin(await memberForToken(token))) throw new ActionError("Only admins can start this.");
    if (!aboutEnabled()) throw new ActionError("Filling About texts is off. Set RN_ABOUT=1 on the server to turn it on.");
    const run = aboutProgress.run;
    if (aboutProgress.running && run) return { message: `Already running: ${run.done} of ${run.total} companies done.` };
    void import("./about/run").then((m) => m.runAbout()).catch((e) => console.error("about run failed", e));
    return { message: "Started. It reads each company's website, four at a time, so it takes a while." };
  }
  if (a?.type === "leadersNow") {
    if (opts.dryRun) throw new ActionError(UNKNOWN_ACTION);
    if (!isAdmin(await memberForToken(token))) throw new ActionError("Only admins can start this.");
    if (!leadersEnabled()) throw new ActionError("Reading leadership pages is off. Set RN_LEADERS=1 on the server to turn it on.");
    const run = leadersProgress.run;
    if (leadersProgress.running && run) return { message: `Already running: ${run.done} of ${run.total} companies done.` };
    const scope = a.scope === "all" ? "all" : "next";
    void import("./leaders/run").then((m) => m.runLeaders({ scope })).catch((e) => console.error("leaders run failed", e));
    return { message: `Started on ${scope === "all" ? "every company due" : "the next 200 companies"}. It reads each company's site, four at a time, so it takes a while.` };
  }
  // Messages between members live in lib/messages.ts (loaded here, so the two files don't import each other at start).
  if (typeof a?.type === "string" && a.type.startsWith("message.")) return (await import("./messages")).performMessage(token, a, origin);
  const out = await mutate((s, seed): ActionResult & { refused?: string; connected?: string } => {
    const me = memberByToken(seed, token, s);
    if (!me) throw new ActionError("You're signed out. Sign in again to add, confirm or unlock.");
    const now = new Date().toISOString();
    const nowMs = Date.parse(now);
    // Bonuses held at the cap are paid first, as the rolling window frees room.
    releaseHeld(s, me.id, now);
    const balBefore = balance(s, me.id);
    const ledgerAt = s.ledger.length;
    const g = graph(seed, s);
    // Followed roles, rebuilt after a change to them (the draft changes in place).
    let tracksNow: Tracks | null = null;
    const tracks = () => (tracksNow ??= buildTracks(seed, s));
    /** A refusal that still keeps what it recorded (a throw would drop the whole change). */
    const refusal: { message: string | null } = { message: null };
    // Public id -> internal id, for every engagement and person.
    const fromPub = new Map<string, string>();
    for (const id of g.engagements.keys()) fromPub.set(pubId(id), id);
    for (const id of g.contacts.keys()) fromPub.set(pubId(id), id);
    for (const id of g.companies.keys()) fromPub.set(pubId(id), id);
    /** The internal id for a public id the client sent. */
    const inId = (entity: Entity, raw: unknown): string => {
      const internal = fromPub.get(String(raw ?? ""));
      if (!internal) throw new ActionError(gone(entity));
      return internal;
    };
    const idx0 = memberIndex(seed, s);
    const companyOf = (entity: Entity, id: string) =>
      entity === "company" ? id : entity === "engagement" ? g.engagements.get(id)?.companyId ?? "" : g.contacts.get(id)?.companyId ?? "";
    // An admin seeing the table as a member (asMember) unlocks by the same rule the page shows them.
    /** Locked in the member's tables: what Unlock company buys. */
    const lockedFor = (companyId: string) => identityHidden(g, s, idx0, tracks(), me, companyId, !!opts.asMember);
    /**
     * Locked for this action: a company the member looked up by its exact name (State.found, the
     * last DAY_MS) is not, so the record opened from that search works as a named company's does.
     */
    const hiddenFor = (companyId: string) =>
      lockedFor(companyId) && !(s.found?.[me.id] ?? []).some((r) => r.id === companyId && nowMs - Date.parse(r.at) < DAY_MS);
    /** Accounts that count (trustOf), worked out once per action. */
    let trustNow: ((memberId: string) => boolean) | null = null;
    const trusted = (memberId: string) => (trustNow ??= trustOf(seed, s))(memberId);
    /** A seat from the seat scan: nobody holds it until its fractional claims it. */
    const isScanSeat = (engId: string) => g.engagements.get(engId)?.source === SEAT_SCAN;
    /** The seat-holder name on this seat resolves to the viewer (and they haven't said it isn't theirs). */
    const linkedSeat = (engId: string) => seatHolder(s, memberIndex(seed, s), engId, valueOf(g.engagements.get(engId), s, "operator"))?.id === me.id;
    /**
     * The viewer holds this seat as its owner, read from the state as it is now (so a seat made or
     * claimed earlier in this action counts): the only member who adds facts about it.
     */
    const holdsSeat = (node: Node) =>
      seatOwner(s, memberIndex(seed, s), trusted, tracks(), node.id, valueOf(node, s, "operator"), s.engagements.find((x) => x.id === node.id)?.by, isScanSeat(node.id))?.id === me.id;
    /** The viewer holds this seat as its owner: they see it free, correct it and hide a fact on it at once (see seatOwner). */
    const ownSeat = (engId: string) =>
      seatOwner(s, memberIndex(seed, s), trusted, tracks(), engId, valueOf(g.engagements.get(engId), s, "operator"), s.engagements.find((x) => x.id === engId)?.by, isScanSeat(engId))?.id === me.id;
    /** Companies whose pick lists this member fills without the daily limits: one they added, or one where they hold a seat. */
    const pickFree = new Map<string, boolean>();
    const exemptPick = (companyId: string) => {
      if (!pickFree.has(companyId))
        pickFree.set(companyId, s.companies.some((c) => c.id === companyId && c.by === me.id) || [...g.engagements.values()].some((e) => e.companyId === companyId && ownSeat(e.id)));
      return pickFree.get(companyId)!;
    };
    /**
     * Gated facts this member sees without an unlock: their own seat, an open role's title, an end
     * month that says no more than the status, the posting of a role the scan closed (unless its
     * company is hidden), the other half of a person's name and title or of a seat's holder and
     * role they hold, and (SEAT_SCAN_ROLE_FREE) the role of a found seat nobody is named on.
     */
    const freeFor = (entity: Entity, id: string, field: string) =>
      (entity === "contact" && holdsPersonPartner(s, me, g.contacts.get(id), entity, field)) ||
      (entity === "engagement" &&
        ((field === "posting" && postingFree(tracks().get(id)) && !hiddenFor(companyOf("engagement", id))) ||
          (field === "role" && (roleFree(g.engagements.get(id), s, tracks()) || scanRoleFree(g.engagements.get(id), s))) ||
          (field === "end" && endFree(g.engagements.get(id), s)) ||
          holdsSeatPartner(s, me, g.engagements.get(id), entity, field) ||
          ownSeat(id)));
    /**
     * The member can see who this person is: their name and title, where on file, are the member's
     * own, paid for, or come with the other half. Until then the person's LinkedIn, email and phone
     * can't be unlocked, and nothing can be added about them but a relationship (PERSON_DETAILS).
     * A half under review (two reports hide it for everyone) holds nothing back: nobody can unlock
     * it, and the screen shows no lock for it (the same test as personUnseen in app/post/model.ts).
     */
    const knowsPerson = (node: Node) =>
      PERSON_BUNDLE.every((f) => {
        const v = valueOf(node, s, f);
        return !v || v.status !== "live" || v.by === me.id || (s.unlocks[fkey(node.id, f)] ?? []).includes(me.id) || holdsPersonPartner(s, me, node, "contact", f);
      });
    /** Adding facts by clicking into a hidden company would reveal it for free. Typing its name in Add still works. */
    const mustSee = (companyId: string) => {
      if (hiddenFor(companyId)) throw new ActionError(COMPANY_LOCKED_ADD);
    };
    const nodeOf = (entity: Entity, raw: unknown): Node => {
      const id = inId(entity, raw);
      const n = (entity === "company" ? g.companies : entity === "engagement" ? g.engagements : g.contacts).get(id);
      if (!n) throw new ActionError(gone(entity));
      return n;
    };
    const fieldOf = (entity: Entity, key: string) => {
      const f = fieldDef(entity, key);
      if (!f || f.identity || f.system) throw new ActionError("Members can't change that field.");
      return f;
    };
    /** A changed cell for the result, as the actor now sees it. A hidden company's cells come back as the view shows them. */
    const changed = (entity: Entity, node: Node, field: string) => {
      const cell = cellOf(s, me, node, entity, field, memberIndex(seed, s), freeFor(entity, node.id, field));
      // The tables' lock: an action's cells go into the tables, where a company looked up by name stays locked.
      const hide = entity === "company" && cell.s === "value" && (IDENTITY_FIELDS.has(field) || field === "hq") && lockedFor(node.id);
      if (entity === "engagement" && field === "role" && cell.s === "value" && !cell.system) {
        const co = g.companies.get(companyOf("engagement", node.id));
        if (co && lockedFor(co.id)) {
          const fn = live(node, s, "function") ?? functionOf(cell.v);
          return { entity, id: outId(entity, node.id), field, cell: { ...cell, v: titleWithout(cell.v, co.name, live(co, s, "website") ?? null, fn ? `Fractional ${fn} role` : "Fractional role") } };
        }
      }
      return { entity, id: outId(entity, node.id), field, cell: hide ? hideIdentity(field, cell, { name: (node as CompanyNode).name, sites: [live(node, s, "website")] }) : cell };
    };
    /** Each member's paid unlocks that have not been refunded, by `${memberId} ${ref}` (built when first needed). */
    let paidUnlocks: Map<string, number> | null = null;
    /** Give the credit back to everyone who paid to see a fact. Unlocks that came free with "Unlock company" have nothing to refund. */
    const refundUnlockers = (k: string) => {
      if (!paidUnlocks) {
        paidUnlocks = new Map();
        for (const l of s.ledger) {
          if (l.reason !== "unlock" && l.reason !== "refund") continue;
          const pk = `${l.memberId} ${l.ref}`;
          paidUnlocks.set(pk, (paidUnlocks.get(pk) ?? 0) - l.delta);
        }
      }
      for (const m of s.unlocks[k] ?? []) {
        const pk = `${m} ${k}`;
        // What they paid for it, all of it: 1 credit for a fact, COMPANY_PRICE for a company.
        const paid = paidUnlocks.get(pk) ?? 0;
        if (paid <= 0) continue;
        s.ledger.push({ memberId: m, delta: paid, reason: "refund", ref: k, at: now });
        paidUnlocks.set(pk, 0);
      }
      delete s.unlocks[k];
    };
    /**
     * Take a fact off the table: the field reopens, whoever added it loses what it earned and
     * everyone who paid to see it gets the credit back. A role that closed because a member
     * took it reopens when that member's name is the fact removed.
     */
    const removeFact = (k: string, cur: FieldValue, why?: "retract"): number => {
      s.values[k] = { ...cur, status: "removed" };
      delete s.values[k].reporters;
      delete s.verifications[k];
      let taken = 0;
      if (!isSystem(cur.by)) {
        const paid = s.ledger.filter((l) => l.memberId === cur.by && l.ref === k && (l.reason === "fill" || l.reason === "confirm")).reduce((n, l) => n + l.delta, 0);
        const back = s.ledger.filter((l) => l.memberId === cur.by && l.ref === k && l.reason === "reversal").reduce((n, l) => n + l.delta, 0);
        taken = Math.max(0, paid + back);
        if (taken > 0) s.ledger.push({ memberId: cur.by, delta: -taken, reason: "reversal", ref: k, at: now, ...(why ? { why } : {}) });
        s.held = s.held.filter((h) => !(h.reason === "confirm" && h.ref === k));
      }
      refundUnlockers(k);
      const dot = k.lastIndexOf(".");
      if (k.slice(dot + 1) === "operator") {
        reopenIfUnheld(s, k.slice(0, dot), now);
        tracksNow = null; // it may have reopened, or closed for good when its posting was long gone
      }
      return taken;
    };
    /** A rate this member shared for the benchmarks only on this seat moves to the record when they add it there. It was paid once. */
    let movedRate = false;
    const movePrivateRate = (engId: string, k: string) => {
      const i = s.benchRates.findIndex((b) => b.by === me.id && b.engagementId === engId);
      if (i < 0) return false;
      const ref = `bench.${s.benchRates[i].id}`;
      s.benchRates.splice(i, 1);
      // The credit it earned now belongs to the rate on the record, so removing that rate takes it back.
      for (const l of s.ledger) if (l.memberId === me.id && l.ref === ref) l.ref = k;
      movedRate = true;
      return true;
    };
    /** The member a picker choice names (a public member id, or "me" for the viewer), or null. */
    const pickedMember = (raw: unknown): Member | null => {
      if (raw === undefined || raw === null || raw === "") return null;
      const wanted = String(raw);
      if (wanted === "me") return me;
      const m = memberIndex(seed, s).all.find((x) => pubId(x.id) === wanted);
      if (!m) throw new ActionError("That member isn't on Merlin. Type the seat holder's first and last name instead.");
      return m;
    };
    let capped = false;
    /** A claim on an open role was saved, and the role stays open (the account does not count yet, see trustOf). */
    let claimKept = false;
    /** This change is the member saying they took an open role ("I took this role"). */
    let claimed = false;
    /** The inviter's first name, when this change paid them their invite bonus too. */
    let inviterPaid: string | null = null;
    /** Cells a fill changed besides its own (a filled open role's status). */
    const alsoChanged: { entity: Entity; node: Node; field: string }[] = [];
    /** A fill saved for no credit because it was a "How they sell" answer past the ones that earn today. */
    let sellCapped = false;
    /**
     * Pay a fill, within the rolling 24 hour cap. Records a 0 entry when it earns nothing (so a
     * later reversal knows). Two limits sit beside the cap, and a fill past either hard limit is
     * refused (the throw drops the whole action, so nothing half-saved stays):
     *  - a company's pick-list answers: SELL_EARN_MAX earn a day, SELL_SAVE_MAX save a day.
     *  - FILL_DAILY_MAX facts a day on records, not counting the member's own seats.
     */
    const awardFill = (ref: string) => {
      let earns = true;
      if (!ref.startsWith("bench.")) {
        if (isPickRef(ref) && !exemptPick(refRecord(ref))) {
          const sell = sellToday(s, me.id, nowMs, exemptPick);
          if (sell.saved >= SELL_SAVE_MAX) throw new ActionError(SELL_FULL);
          if (sell.earned >= SELL_EARN_MAX) (earns = false), (sellCapped = true);
        }
        const today = fillsToday(s, me.id, nowMs);
        if (today.length >= FILL_DAILY_MAX && !ownSeat(refRecord(ref)) && today.filter((l) => !ownSeat(refRecord(l.ref))).length >= FILL_DAILY_MAX)
          throw new ActionError(`You've added ${FILL_DAILY_MAX} facts today, and that's the daily limit. Add more tomorrow. You can still fill in the seats you hold.`);
      }
      const d = earns && EARN_CAP - earning(s, me.id, nowMs).earned > 0 ? 1 : 0;
      s.ledger.push({ memberId: me.id, delta: d, reason: "fill", ref, at: now });
      return d;
    };
    /**
     * The invite bonus, to both once the invitee adds a first fact to a record (a benchmark-only
     * rate is not on a record, so the bonus waits). It counts toward the cap; any excess is held.
     * The inviter is paid for REFERRAL_LIMIT different invitees per 30 days.
     */
    const payReferral = () => {
      if (a?.type === "benchRate") return 0;
      const r = referralBonus(s, seed, me.id, now);
      if (r.inviter) inviterPaid = r.inviter;
      return r.paid;
    };
    /**
     * What a seat can't say at once (FIRST-4, DESK-10). An open role nobody holds has no start,
     * end, reason or sourcing yet. An end can't come before the start, or before the role was
     * first listed, and an active seat has no dated end. `pending` holds the other fields the same
     * action saves. A locked end the member can't see is never compared against, so a refusal
     * gives nothing away about it.
     */
    const seatCheck = (node: Node, key: string, value: string, pending: Record<string, string>) => {
      const track = tracks().get(node.id);
      const val = (k: string) => (k === key ? value : pending[k] ?? live(node, s, k));
      const status = val("status");
      const open = track ? !track.closedAt : status === "Open role" || (!status && g.engagements.get(node.id)?.source === "Demand scan");
      if (open && !val("operator")) {
        if (key === "start" || key === "end") throw new ActionError(OPEN_NO_DATES);
        if (key === "reason" || key === "sourced" || key === "whyNow") throw new ActionError(OPEN_NO_HIRE);
      }
      // Why it ended: only once it has (an Ended seat, or one with an end month).
      if (key === "endReason" && (open || status === "Active" || (status !== "Ended" && !(val("end") && val("end") !== "Ongoing")))) throw new ActionError(NOT_ENDED_YET);
      const dated = (v: string | null): v is string => !!v && v !== "Ongoing";
      if (key === "end" && dated(value)) {
        if (open) throw new ActionError(OPEN_NO_END);
        if (status === "Active") throw new ActionError(ACTIVE_NO_END);
        const start = val("start");
        if (start && monthBefore(value, start)) throw new ActionError(END_BEFORE_START);
        if (track && monthBefore(value, track.firstSeen.slice(0, 7))) throw new ActionError(endBeforeListed(track.firstSeen));
      }
      if (key !== "start" && !(key === "status" && value === "Active")) return;
      const end = val("end");
      if (!dated(end)) return;
      const ev = valueOf(node, s, "end");
      const seesEnd =
        pending.end !== undefined || !fieldDef("engagement", "end")!.gated || (!!ev && (ev.by === me.id || (s.unlocks[fkey(node.id, "end")] ?? []).includes(me.id))) || freeFor("engagement", node.id, "end");
      if (!seesEnd) return;
      if (key === "start" && monthBefore(end, value)) throw new ActionError(END_BEFORE_START);
      // An end saved in the same action is checked on its own turn ("An active seat has no end month yet").
      if (key === "status" && pending.end === undefined) throw new ActionError(ENDED_NOT_ACTIVE);
    };

    /**
     * Set a value. Returns credits earned (0 when editing your own value or at the daily cap).
     * `member` (seat holder only) links it to a member, whose name becomes the value. `pending`:
     * the other engagement fields the same action saves (see seatCheck).
     */
    /**
     * People whose name the member typed in this action and who were already on file under it
     * (putPerson's merge): they know who the person is, so what they add about them goes in. The
     * name and title stay locked to them all the same.
     */
    const typedName = new Set<string>();
    const setValue = (node: Node, entity: Entity, key: string, raw: unknown, member: Member | null = null, pending: Record<string, string> = {}): number => {
      const f = fieldOf(entity, key);
      const linked = key === "operator" ? member : null;
      // Only the seat holder adds facts about a seat, and the only seat holder a member can name is
      // themselves (a seat they held, or an open role they took). Admins too: they review and remove.
      if (entity === "engagement") {
        if (key === "operator" ? linked?.id !== me.id : !holdsSeat(node)) throw new ActionError(key === "operator" ? SEAT_SELF_ONLY : SEAT_HOLDER_ONLY);
      }
      // A person's contact details and title come from a member who can see who the person is (a new person's adder always can).
      if (entity === "contact" && (PERSON_DETAILS.includes(key) || key === "title") && !knowsPerson(node) && !typedName.has(node.id)) throw new ActionError(NAME_FIRST_ADD);
      // Picking yourself writes your own name. One on file under a single word takes the first and last name typed instead.
      let { value, error } = cleanValue(f, linked ? linked.name : raw);
      if (error && linked && linked.id === me.id && typeof raw === "string" && raw.trim()) ({ value, error } = cleanValue(f, raw));
      if (error) throw new ActionError(`${f.label}. ${error}`);
      const cur = valueOf(node, s, key);
      // Claiming a seat from the seat scan: once, by its own fractional, a few a day, and for no credit (see claimSeat).
      const scanClaim = entity === "engagement" && key === "operator" && isScanSeat(node.id) && cur?.by !== me.id;
      // A name from public profiles on it gives way to the member whose own name it is (first and last name match): the claim verifies it.
      const pubClaim = scanClaim && !!cur?.pub && linked?.id === me.id && sameName(cur.value, me.name);
      if (scanClaim) {
        if (cur && !pubClaim) throw new ActionError(SEAT_TAKEN);
        if (claimsToday(s, me.id, nowMs) >= SEAT_CLAIM_DAILY_MAX) throw new ActionError(`You can claim ${SEAT_CLAIM_DAILY_MAX} seats in 24 hours. Claim the next one tomorrow.`);
      }
      // A seat holder can correct what our records or the scan say about their own seat.
      // What another member added still needs a report.
      // Its function is the holder's to fix whoever set it (a wrong function skews their benchmarks).
      const correction = !!cur && entity === "engagement" && (isSystem(cur.by) || key === "function") && ownSeat(node.id);
      // An open role the scan follows keeps the posting's status while it is listed: its holder
      // can't close it for everyone by editing it (taking the role, or the posting coming down, does).
      if (correction && key === "status" && tracks().get(node.id) && !tracks().get(node.id)!.closedAt) throw new ActionError(LISTED_STATUS);
      if (cur && cur.by !== me.id && !correction && !pubClaim)
        throw new ActionError(`${capital(say(entity, key))} is already there. Confirm it if it's right, or report it if it's wrong.`);
      if (entity === "engagement") seatCheck(node, key, value!, pending);
      // Picking yourself takes back an earlier "This isn't me" on this seat.
      const relink = key === "operator" && linked?.id === me.id && (s.notMine[me.id] ?? []).includes(node.id);
      // The same seat holder again changes nothing: say so rather than "Updated".
      if (key === "operator" && cur && cur.status === "live" && cur.value === value && cur.memberId === linked?.id && !relink)
        throw new ActionError(linked?.id === me.id ? "You're already the seat holder here." : "That's already the seat holder here.");
      if (relink) s.notMine[me.id] = s.notMine[me.id].filter((id) => id !== node.id);
      if (cur && cur.value === value && (correction || cur.memberId === linked?.id)) return 0; // unchanged (and any reports on it stand)
      const k = fkey(node.id, key);
      if (cur && cur.value !== value) delete s.verifications[k]; // confirmations were for the old value
      const eng = entity === "engagement" ? g.engagements.get(node.id) : undefined;
      // An open role our records or the scan posted. Only the member who took it can name its
      // seat holder: any other name would close the role for everyone on one member's say-so.
      const openPosted = !!eng && key === "operator" && hidesCompany(eng, s, tracks());
      if (openPosted && linked?.id !== me.id) throw new ActionError("This role is still open. If you took it, pick yourself as the seat holder.");
      // A role a member took stays in that member's name. Renaming the seat holder would leave it closed under someone else's.
      if (eng && key === "operator" && cur && linked?.id !== me.id && tracks().get(eng.id)?.closedBy === "filled")
        throw new ActionError("You took this open role, so the seat holder is you. If that's wrong, use This isn't me on Your seats.");
      // Picking yourself on it fills it, once per rolling 24 hours (reopenIfUnheld is the way back).
      // Only an account that counts (trustOf) closes the role. Anyone else's name is kept, and
      // the role stays open for everyone until the scan sees its posting come down.
      const claimsRole = openPosted && !cur;
      if (claimsRole && (s.roleClaims ?? []).some((c) => c.memberId === me.id && nowMs - Date.parse(c.at) < DAY))
        throw new ActionError("You marked an open role as yours in the last 24 hours. You can do that once a day.");
      const fillsRole = claimsRole && trusted(me.id);
      if (claimsRole) claimed = true;
      if (claimsRole && !fillsRole) claimKept = true;
      s.values[k] = {
        value: value!,
        by: me.id,
        at: now,
        status: "live",
        ...(linked ? { memberId: linked.id } : {}),
        // An HQ is kept as typed ("Austin, TX") with the place it names stored beside it.
        ...(entity === "company" && key === "hq" ? { geo: normalizeHq(value) } : {}),
        // A correction keeps what it replaced, so "Not my seat" can put it back. Editing it again keeps the first one's.
        ...(cur?.by === me.id ? (cur.prev ? { prev: cur.prev } : {}) : correction && cur ? { prev: { value: cur.value, by: cur.by, at: cur.at } } : {}),
      };
      if (scanClaim) {
        s.seatClaims = [...(s.seatClaims ?? []).filter((c) => nowMs - Date.parse(c.at) < CLAIM_KEEP), { memberId: me.id, engagementId: node.id, at: now }];
        // Claims other members made on the name it replaced are settled: the seat is its named fractional's.
        if (pubClaim) for (const c of s.names?.claims ?? []) if (c.engagementId === node.id && c.status === "pending") (c.status = "declined"), (c.decidedAt = now);
        return 0; // a claim earns nothing by itself; the facts added after it earn as usual
      }
      if (claimsRole)
        s.roleClaims = [...(s.roleClaims ?? []).filter((c) => nowMs - Date.parse(c.at) < CLAIM_KEEP), { memberId: me.id, engagementId: node.id, at: now, closed: fillsRole }];
      if (fillsRole) {
        keepSeedTracks(seed, s);
        const sk = fkey(node.id, "status");
        delete s.verifications[sk];
        s.values[sk] = { value: "Active", by: "scan", at: now, status: "live" };
        for (const r of Object.values(s.scan.roles)) if (r.engagementId === node.id && !r.closedAt) (r.closedAt = now), (r.closedBy = "filled");
        tracksNow = null;
        alsoChanged.push({ entity, node, field: "status" });
      }
      // Auto-fill the free Function from a new role.
      if (entity === "engagement" && key === "role" && !valueOf(node, s, "function")) {
        const fn = functionOf(value);
        if (fn) s.values[fkey(node.id, "function")] = { value: fn, by: me.id, at: now, status: "live" };
      }
      // A dated end means the seat ended. With no status given, it says so (no extra credit: it is the same answer).
      if (entity === "engagement" && key === "end" && value !== "Ongoing" && !valueOf(node, s, "status") && pending.status === undefined) {
        s.values[fkey(node.id, "status")] = { value: "Ended", by: me.id, at: now, status: "live" };
        alsoChanged.push({ entity, node, field: "status" });
      }
      if (cur) return 0; // editing your own value, or correcting your seat, earns nothing extra
      if (entity === "engagement" && key === "rate" && movePrivateRate(node.id, k)) return 0; // already paid as a benchmark-only rate
      const d = awardFill(k);
      if (!d) capped = true;
      return d;
    };
    /** What to say when the daily limit stopped a credit. `some`: part of this change did earn. */
    const capNote = (some = false) => {
      if (!capped) return "";
      // Under the daily cap, so the reason was the pick-list limit: say that, and what still earns.
      if (sellCapped && earning(s, me.id, nowMs).earned < EARN_CAP)
        return ` Only ${SELL_EARN_MAX} answers for ${PICKS} earn a credit each day, so this one didn't earn. ${SELL_STILL_EARNS}`;
      // The limit has one name everywhere ("earned today"). The client adds when earning opens again (Me.earnResetsAt), in the member's own time zone.
      return ` No credit ${some ? "for the rest" : "this time"}, because you've earned today's ${EARN_CAP}.`;
    };
    const credits = (n: number) => (n ? ` You earned ${n} credit${n > 1 ? "s" : ""}.` : "");
    const bonusNote = (n: number) => (n ? ` Your invite bonus added ${n} more.${inviterPaid ? ` ${inviterPaid} got ${REFERRAL_BONUS} too.` : ""}` : "");
    /** Said when a claim on an open role was saved and the role stays open (claimKept). */
    const claimNote = () =>
      claimKept ? " Others still see the role as open until your claim is confirmed." : "";

    /**
     * Put a person on file at a company (Add, and Add a person), or add to the one already there
     * under that name: names compare by normName, so case, accents and spacing don't make a second
     * person. The member who added that name can't add it again. Anyone else fills only what is
     * empty on the person, earning for those, and their add counts as a confirmation of the name
     * (the confirm rule: once two members confirm it, the author earns 1). `fields` are cleaned and
     * hold a name. The person is not told which of their details matched: those stay locked.
     */
    const putPerson = (companyId: string, engagementId: string | null, fields: readonly (readonly [string, string])[]) => {
      const typed = fields.find(([k]) => k === "name")![1];
      const key = normName(typed);
      const same = key ? [...g.contacts.values()].filter((p) => p.companyId === companyId && normName(valueOf(p, s, "name")?.value ?? "") === key) : [];
      if (same.some((p) => valueOf(p, s, "name")!.by === me.id)) throw new ActionError(`You already added ${typed} here.`);
      const into = same.find((p) => valueOf(p, s, "name")!.status === "live");
      let earned = 0;
      if (!into) {
        const pid = newId("p");
        s.contacts.push({ id: pid, engagementId, companyId, by: me.id, at: now });
        const node: PersonNode = { id: pid, seedFields: {}, companyId, engagementId, source: "Member added" };
        g.contacts.set(pid, node); // a second person with this name in the same Add is a repeat
        for (const [k, v] of fields) earned += setValue(node, "contact", k, v);
        return { node: node as Node, earned, merged: false, kept: 0, typed };
      }
      let kept = 0;
      typedName.add(into.id);
      for (const [k, v] of fields) {
        if (k === "name") continue;
        if (valueOf(into, s, k)) kept++;
        else earned += setValue(into, "contact", k, v);
      }
      const nk = fkey(into.id, "name");
      const nv = valueOf(into, s, "name")!;
      const list = s.verifications[nk] ?? [];
      if (!list.includes(me.id)) {
        s.verifications[nk] = [...list, me.id];
        trustNow = null; // a confirmation can make the name's author count (trustOf)
        if (!isSystem(nv.by) && list.length + 1 >= 2 && !s.ledger.some((l) => l.reason === "confirm" && l.ref === nk) && !s.held.some((h) => h.reason === "confirm" && h.ref === nk))
          grant(s, nv.by, 1, "confirm", nk, now);
      }
      return { node: into as Node, earned, merged: true, kept, typed };
    };

    const run = (): ActionResult & { connected?: string } => {
      switch (a?.type) {
        case "fill": {
          const node = nodeOf(a.entity, a.id);
          mustSee(companyOf(a.entity, node.id));
          // "Who introduced you": the seat holder's own note, kept apart from the table (State.seatPrivate). No credit: nobody else ever sees it.
          if (a.entity === "engagement" && a.field === INTRO_FIELD.key) {
            if (!holdsSeat(node)) throw new ActionError(SEAT_HOLDER_ONLY);
            const raw = String(a.value ?? "").trim();
            const all = (s.seatPrivate ??= {});
            if (!raw) {
              delete all[node.id];
              return { message: "Taken off. Only you ever saw it.", id: outId("engagement", node.id), cells: [] };
            }
            const { value, error } = cleanValue(INTRO_FIELD, raw);
            if (error) throw new ActionError(`${INTRO_FIELD.label}. ${error}`);
            const had = !!all[node.id];
            all[node.id] = { by: me.id, introducedBy: value!, at: now };
            return {
              message: `${had ? "Updated" : "Saved"}. Only you see who introduced you. Merlin only counts it.`,
              id: outId("engagement", node.id),
              cells: [{ entity: "engagement" as const, id: outId("engagement", node.id), field: INTRO_FIELD.key, cell: { s: "value" as const, v: value!, ver: 0, mine: true } }],
            };
          }
          const f = fieldOf(a.entity, a.field);
          // A person's title, email, phone and LinkedIn come only from a member who can see who the
          // person is: nobody knows the email of someone they can't name. Seeing the name means having
          // added it, paid for it, or paid for the title that comes with it (PERSON_BUNDLE).
          if (a.entity === "contact" && FILL_NEEDS_NAME.includes(f.key)) {
            const nv = valueOf(node, s, "name");
            if (!nv) throw new ActionError(FILL_NO_NAME);
            const seesName =
              nv.status === "live" &&
              !nv.reporters?.includes(me.id) &&
              (nv.by === me.id || (s.unlocks[fkey(node.id, "name")] ?? []).includes(me.id) || holdsPersonPartner(s, me, node, "contact", "name"));
            if (!seesName) throw new ActionError(FILL_NAME_FIRST);
          }
          const hadFunction = a.entity === "engagement" && !!valueOf(node, s, "function");
          // Already filled means an edit of your own fact or a correction on your own seat (anything else is refused).
          const wasMine = !!valueOf(node, s, f.key);
          const earned = setValue(node, a.entity, f.key, a.value, f.key === "operator" ? pickedMember(a.memberId) : null);
          // (A private rate moved onto the record is a first fact on a record too, though it was paid before.)
          const bonus = earned || capped || movedRate ? payReferral() : 0;
          const cells = [changed(a.entity, node, f.key)];
          if (a.entity === "engagement" && f.key === "role" && !hadFunction && valueOf(node, s, "function")) cells.push(changed(a.entity, node, "function"));
          for (const c of alsoChanged) cells.push(changed(c.entity, c.node, c.field));
          return {
            message: `${claimed ? "Claimed. It's on Your seats." : `${wasMine ? "Updated" : "Added"} ${say(a.entity, f.key)}.`}${credits(earned)}${bonusNote(bonus)}${capNote()}${claimNote()}`,
            id: outId(a.entity, node.id),
            capped,
            cells,
          };
        }
        case "unlock":
        case "unlockMany": {
          const items = a.type === "unlock" ? [a] : (a.items ?? []).slice(0, 60);
          /** `pair`: an open role's posting and rate. `seat`: who held a seat, with their role (SEAT_BUNDLE). */
          const todo: { k: string; node: Node; entity: Entity; field: string; pair?: boolean; seat?: boolean }[] = [];
          const hid = new Map<string, boolean>();
          const hiddenNow = (companyId: string) => {
            if (!hid.has(companyId)) hid.set(companyId, hiddenFor(companyId));
            return hid.get(companyId)!;
          };
          /**
           * Unlock company: one purchase for the name, website, LinkedIn, logo and About of a
           * hidden company, and the role, posting and rate of each open role there. Asking for
           * any part of it buys the whole, once.
           */
          const bundle = (company: Node) => {
            const k = fkey(company.id, "identity");
            if (!todo.some((t) => t.k === k)) todo.push({ k, node: company, entity: "company", field: "identity" });
          };
          /** This member sees this fact already: they added it or paid for it. */
          const has = (node: Node, field: string) => {
            const v = valueOf(node, s, field);
            return !!v && v.status === "live" && (v.by === me.id || (s.unlocks[fkey(node.id, field)] ?? []).includes(me.id));
          };
          /**
           * An open role at a company the member can see: its role, its posting and its rate are one
           * purchase as well, whoever the member is. One credit buys all three, and a member who
           * already holds one of them gets the rest at no charge.
           */
          const pairs = new Set<string>();
          /** People whose name and title this purchase already covers. */
          const persons = new Set<string>();
          /** Seats whose holder and role this purchase already covers. */
          const seatsBought = new Set<string>();
          const free: { node: Node; field: string }[] = [];
          /**
           * What opens a fact comes first: a person's name and title before their LinkedIn, email and
           * phone, and a locked company before anything paid there (its people, who held its seats, a
           * past seat's rate or end): any purchase at a company owns it (knownCompanies), so none can
           * come before Unlock company. An open role's posting and rate buy the company itself. The
           * same request may buy that first (Unlock all does), so such a fact waits for the rest of
           * the request. Asked again at the end, it is refused, and nothing is spent.
           */
          const waitsFor = (entity: Entity, node: Node, field: string): string | null => {
            const companyId = companyOf(entity, node.id);
            const eng = entity === "engagement" ? g.engagements.get(node.id) : undefined;
            const buysCompany = !!eng && BUNDLE_FIELDS.includes(field) && isOpenRole(eng, s, tracks());
            if (!buysCompany && hiddenNow(companyId) && !todo.some((t) => t.k === fkey(companyId, "identity"))) return COMPANY_FIRST;
            if (entity === "contact" && PERSON_DETAILS.includes(field) && !persons.has(node.id) && !knowsPerson(node)) return NAME_FIRST;
            return null;
          };
          const waiting: { it: (typeof items)[number]; node: Node }[] = [];
          const take = (it: (typeof items)[number], node: Node, last: boolean) => {
            if (it.entity === "company" && (it.field === "identity" || IDENTITY_FIELDS.has(it.field))) {
              // Unlock company keeps it named in the tables, so it is for sale while the tables lock it (a lookup by name included).
              if (lockedFor(node.id)) bundle(node);
              return;
            }
            let itField = it.field;
            // An open role's posted hours show with its posting and posted rate (lockedHours in fullView): asking for them buys that purchase.
            if (it.entity === "engagement" && itField === "hours") {
              const eng = g.engagements.get(node.id);
              if (eng && isOpenRole(eng, s, tracks())) {
                if (hiddenNow(eng.companyId)) {
                  bundle(g.companies.get(eng.companyId)!);
                  return;
                }
                const lead = BUNDLE_FIELDS.find((x) => valueOf(eng, s, x)?.status === "live");
                if (!lead) return;
                itField = lead;
              }
            }
            const f = fieldOf(it.entity, itField);
            const k = fkey(node.id, f.key);
            const cur = valueOf(node, s, f.key);
            if (!cur || cur.status !== "live") return;
            if (!f.gated || cur.by === me.id || (s.unlocks[k] ?? []).includes(me.id) || todo.some((t) => t.k === k)) return;
            if (freeFor(it.entity, node.id, f.key)) return; // your own seat, an ongoing end, the posting of a closed role, the other half of a pair: already visible
            const wait = waitsFor(it.entity, node, f.key);
            if (wait) {
              if (last) throw new ActionError(wait);
              waiting.push({ it, node });
              return;
            }
            // A person's name and title: one purchase, whichever was asked for (the other is free after, see freeFor).
            if (it.entity === "contact" && PERSON_BUNDLE.includes(f.key)) {
              if (persons.has(node.id)) return;
              persons.add(node.id);
            }
            // Who held a seat and their role: one purchase, whichever was asked for, recorded on the seat holder
            // (unless the name is the member's own), so it counts as a seat holder unlocked.
            if (it.entity === "engagement" && SEAT_BUNDLE.includes(f.key) && seatBundled(node, s)) {
              if (seatsBought.has(node.id)) return;
              seatsBought.add(node.id);
              const lead = valueOf(node, s, "operator")?.by === me.id ? f.key : "operator";
              todo.push({ k: fkey(node.id, lead), node, entity: "engagement", field: lead, seat: true });
              return;
            }
            const eng = it.entity === "engagement" && BUNDLE_FIELDS.includes(f.key) ? g.engagements.get(node.id) : undefined;
            if (eng && isOpenRole(eng, s, tracks())) {
              if (hiddenNow(eng.companyId)) {
                bundle(g.companies.get(eng.companyId)!);
                return;
              }
              if (pairs.has(eng.id)) return;
              pairs.add(eng.id);
              if (BUNDLE_FIELDS.some((x) => x !== f.key && has(eng, x))) free.push({ node, field: f.key });
              else todo.push({ k, node, entity: it.entity, field: f.key, pair: true });
              return;
            }
            todo.push({ k, node, entity: it.entity, field: f.key });
          };
          for (const it of items) take(it, nodeOf(it.entity, it.id), false);
          // What waited: the rest of the request may have bought what opens it (a company, then a person's name there, then their email).
          while (waiting.length) {
            const before = waiting.length;
            for (const w of waiting.splice(0)) take(w.it, w.node, false);
            // Nothing more opened: what still waits is refused (this throws), and nothing is spent.
            if (waiting.length === before) take(waiting[0].it, waiting[0].node, true);
          }
          if (!todo.length && !free.length) {
            if (a.type === "unlock") throw new ActionError("Nothing here is locked, so no credit was spent.");
            return { message: "You can already see all of these, so no credits were spent." };
          }
          // What this unlock costs: 1 credit per fact, with each open role one purchase, and COMPANY_PRICE for each company.
          const cost = (t: { field: string }) => (t.field === "identity" ? COMPANY_PRICE : 1);
          const need = todo.reduce((n, t) => n + cost(t), 0);
          if (need) {
            // Accounts in their first 24 hours get a lower daily limit (unlockRoom).
            const { left, firstDay } = unlockRoom(s, me.id, nowMs);
            const bal = balance(s, me.id);
            // Out of credits (0, or owing after a removal) is the wall whatever the daily limit says.
            // Short of credits comes first too, unless the limit binds as tightly (earning more wouldn't help then).
            if (bal <= 0 || (bal < need && bal < left)) {
              const msg = bal > 0 ? `That needs ${need} credits and you have ${bal}. Add a missing fact to earn more.` : "You're out of credits. Add a missing fact to earn one.";
              // The wall: counted for the pilot, so the refusal is returned (a throw would drop the count).
              if (!addSignal(s, me.id, "wall", "server", now)) throw new ActionError(msg);
              refusal.message = msg;
              return { message: "" };
            }
            if (need > left) {
              const limit = firstDay
                ? `New accounts can unlock ${NEW_MEMBER_UNLOCK_MAX} facts in their first 24 hours, then ${UNLOCK_DAILY_MAX} a day.`
                : `The limit is ${UNLOCK_DAILY_MAX} unlocks in 24 hours.`;
              throw new ActionError(
                left > 0
                  ? `You can unlock ${left} more today. ${limit}`
                  : firstDay
                    ? `You've unlocked ${NEW_MEMBER_UNLOCK_MAX} facts today, the day-one limit. Your ${bal} credit${bal === 1 ? " is" : "s are"} here tomorrow.`
                    : `You've reached today's unlock limit. ${limit}`,
              );
            }
          }
          for (const t of todo) {
            s.ledger.push({ memberId: me.id, delta: -cost(t), reason: "unlock", ref: t.k, at: now });
            s.unlocks[t.k] = [...(s.unlocks[t.k] ?? []), me.id];
          }
          /** Open a fact at no further charge. False when there is nothing there. */
          const give = (node: Node, field: string) => {
            const k = fkey(node.id, field);
            const cur = valueOf(node, s, field);
            if (!cur || cur.status !== "live") return false;
            if (cur.by !== me.id && !(s.unlocks[k] ?? []).includes(me.id)) s.unlocks[k] = [...(s.unlocks[k] ?? []), me.id];
            return true;
          };
          // What came with each purchase: a company's open roles (role, posting and rate), the rest of an open role, and open roles already paid for.
          const companies = todo.filter((t) => t.field === "identity");
          const came: { node: Node; field: string }[] = [];
          for (const t of companies) {
            for (const e of g.engagements.values()) {
              if (e.companyId !== t.node.id || !isOpenRole(e, s, tracks())) continue;
              for (const field of BUNDLE_FIELDS) if (give(e, field)) came.push({ node: e, field });
            }
          }
          const paired = todo.filter((t) => t.pair);
          // The other half of each person's name and title this bought. It shows through PERSON_BUNDLE: nothing more is recorded or charged.
          const personAlso = todo
            .filter((t) => t.entity === "contact" && PERSON_BUNDLE.includes(t.field))
            .map((t) => ({ node: t.node, field: t.field === "name" ? "title" : "name" }))
            .filter((x) => valueOf(x.node, s, x.field)?.status === "live");
          // The other half of each seat's holder and role this bought. It shows through SEAT_BUNDLE: nothing more is recorded or charged.
          const seatAlso = todo
            .filter((t) => t.seat)
            .map((t) => ({ node: t.node, field: t.field === "operator" ? "role" : "operator" }))
            .filter((x) => valueOf(x.node, s, x.field)?.status === "live");
          for (const t of paired) for (const other of BUNDLE_FIELDS) if (other !== t.field && give(t.node, other)) came.push({ node: t.node, field: other });
          for (const x of free) for (const field of BUNDLE_FIELDS) if (!has(x.node, field) && give(x.node, field)) came.push({ node: x.node, field });
          const others = todo.length - companies.length - paired.length;
          // "for 1 credit", or nothing when the member had already paid for part of an open role.
          const price = need ? ` for ${need} credit${need > 1 ? "s" : ""}` : "";
          const noCharge = need ? "" : " You had already paid for this open role, so no credit was spent.";
          const companyName = (t: { node: Node }) => g.companies.get(t.node.id)?.name ?? "the company";
          // Each purchase is one fact: a person's name and title count once, and so do who held a seat and their role.
          let message =
            todo.length === 1 && personAlso.length === 1
              ? `Unlocked a person's name and title${price}.`
              : todo.length === 1 && seatAlso.length === 1
                ? `Unlocked the seat holder and their role${price}.`
                : todo.length === 1
                  ? `Unlocked ${say(todo[0].entity, todo[0].field)}${price}.`
                  : `Unlocked ${todo.length} facts${price}.`;
          if (paired.length || free.length || (companies.length && came.length)) {
            // Name what the credit bought: "Acme, the role, the posting and the posted rate".
            const opened = new Set([...paired, ...came].filter((x) => BUNDLE_FIELDS.includes(x.field)).map((x) => `${x.node.id}.${x.field}`));
            const n = (field: string, one: string, many: string) => {
              const c = [...opened].filter((k) => k.endsWith(`.${field}`)).length;
              return c === 1 ? [`the ${one}`] : c ? [`${c} ${many}`] : [];
            };
            const parts = [...(companies.length ? [companies.length === 1 ? companyName(companies[0]) : `${companies.length} companies`] : []), ...n("role", "role", "roles"), ...n("posting", "posting", "postings"), ...n("rate", "posted rate", "posted rates")];
            const bought = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? `${todo.length} facts`;
            message = `Unlocked ${bought}${others ? `, plus ${others} more fact${others > 1 ? "s" : ""},` : ""}${price}.${noCharge}`;
          } else if (todo.length === 1 && companies.length) message = `Unlocked ${companyName(todo[0])}${price}.`;
          return {
            message,
            cells: [
              ...todo.filter((t) => t.field !== "identity").map((t) => changed(t.entity, t.node, t.field)),
              ...came.map((x) => changed("engagement", x.node, x.field)),
              ...personAlso.map((x) => changed("contact", x.node, x.field)),
              ...seatAlso.map((x) => changed("engagement", x.node, x.field)),
              ...companies.flatMap((t) => [...IDENTITY_FIELDS, "hq"].map((field) => changed("company", t.node, field))),
            ],
          };
        }
        case "add": {
          const name = tidy(a.company, 80);
          if (name.length < 2) throw new ActionError("What's the company called?");
          if (!keyOfCompany(name)) throw new ActionError("That doesn't read as a company name. Type the name the company goes by.");
          if (name.toLowerCase() === HIDDEN_COMPANY.toLowerCase() || name.toLowerCase() === "hidden company") throw new ActionError("That's our placeholder for a company you haven't unlocked. Type the real name.");
          // Validate everything up front so a bad field never leaves a half-made record.
          const pick = (entity: Entity, raw: Record<string, string> | undefined) =>
            Object.entries(raw ?? {})
              .filter(([, v]) => String(v ?? "").trim())
              .map(([k, v]) => {
                const f = fieldOf(entity, k);
                const { value, error } = cleanValue(f, v);
                if (error) throw new ActionError(`${f.label}. ${error}`);
                return [k, value!] as const;
              });
          const site = a.website && String(a.website).trim() ? pick("company", { website: a.website })[0][1] : null;
          const coFields = pick("company", a.companyFields).filter(([k]) => k !== "website");
          // The seat holder goes in first: the seat's other facts are theirs to add (see setValue).
          const engFields = pick("engagement", a.engagementFields).sort(([x], [y]) => Number(y === "operator") - Number(x === "operator"));
          const seatPick = engFields.some(([k]) => k === "operator") ? pickedMember(a.operatorMemberId) : null;
          const people = (a.people ?? []).slice(0, 10).map((p) => pick("contact", p)).filter((p) => p.length);
          for (const p of people) if (!p.some(([k]) => k === "name")) throw new ActionError("Each person needs a name.");
          const wantEng = a.engagementId ? inId("engagement", a.engagementId) : null;

          // Same company = same website (the host, whatever its case or path, or on a host many
          // companies share, the host and the path), else same name (legal suffixes, bracketed
          // notes, accents and case aside).
          const siteHost = siteKey(site);
          const nameKey = keyOfCompany(name);
          let company: Node | undefined =
            (siteHost && [...g.companies.values()].find((c) => siteKey(live(c, s, "website")) === siteHost)) ||
            [...g.companies.values()].find((c) => keyOfCompany(c.name) === nameKey);
          // A fractional firm, agency or marketplace is not a client (lib/firms.ts). One kept for an admin's review (a member holds a seat there) still takes facts.
          if (companyFirm(company ? g.companies.get(company.id)?.name ?? name : name) && !(company && firmsInReview(seed, s).has(company.id))) throw new ActionError(FIRM_REFUSED);
          // "Acme", "Test", "Your client": the name of no real company, whether it is new or one kept for an admin's review.
          if (placeholderName(company ? g.companies.get(company.id)?.name ?? name : name)) throw new ActionError(PLACEHOLDER_REFUSED);
          // Typing a company's exact name or website is a lookup by name (find), within the same daily limit: the answer names it.
          const revealed = company ? revealFor(s, me.id, [company.id], lockedFor, nowMs) : 0;
          const isNew = !company;
          if (!company) {
            const id = newId("c", name);
            s.companies.push({ id, name, by: me.id, at: now });
            company = { id, seedFields: { name } };
            g.companies.set(id, { ...company, name });
          }
          const companyName = g.companies.get(company.id)!.name;
          let earned = 0;
          // A pick-list answer past the day's limit is left out, and the rest of the form still goes in.
          let picksLeftOut = 0;
          // Company fields only fill gaps; the company record is shared.
          for (const [k, v] of site ? [["website", site] as const, ...coFields] : coFields) {
            if (valueOf(company, s, k)) continue;
            if (isPickRef(fkey(company.id, k)) && !exemptPick(company.id) && sellToday(s, me.id, nowMs, exemptPick).saved >= SELL_SAVE_MAX) {
              picksLeftOut++;
              continue;
            }
            earned += setValue(company, "company", k, v);
          }

          // An engagement is only made when there's engagement detail (or "+ engagement").
          // Not duplicated: the member's own engagement there, or one with the same role, or an
          // empty one, gets the details; filled fields stay as they are.
          let eid: string | null = null;
          let kept = 0;
          let engNew = false;
          let seatOnFile = false;
          /** The member's own seat was on file from the seat scan, so this Add claimed it. */
          let claimedScan = false;
          /** On a claimed seat: answers that corrected what the scan said (they earn nothing). */
          let answered = 0;
          if (wantEng || a.newEngagement || engFields.length) {
            const role = engFields.find(([k]) => k === "role")?.[1];
            const atCompany = [...g.engagements.values()].filter((e) => e.companyId === company!.id);
            const isBlank = (e: EngNode) =>
              Object.keys(e.seedFields).every((k) => k === "source") && !Object.keys(s.values).some((k) => k.startsWith(e.id + "."));
            const madeByMe = (e: EngNode) => s.engagements.some((x) => x.id === e.id && x.by === me.id);
            // The member's own seat ("Add a seat you held", operatorMemberId "me") is never merged into a
            // seat somebody else holds, or one nobody is named on: it goes in as their own record, so it is
            // theirs at once (Your seats, a private rate). Only a seat already linked to them, or a blank one
            // they made, takes it in.
            const selfSeat = !!seatPick && seatPick.id === me.id;
            const mayMerge = (e: EngNode) => !selfSeat || linkedSeat(e.id) || (isBlank(e) && madeByMe(e));
            // An open role is never matched by its title: a past seat with the same title is its own record.
            // Titles compare by textKey (any script, accents aside). An empty key matches nothing.
            const roleKey = role ? textKey(role) : "";
            const ownMatch = wantEng
              ? atCompany.find((e) => e.id === wantEng)
              : (a.newEngagement ? atCompany.find((e) => isBlank(e) && mayMerge(e)) : atCompany.find((e) => madeByMe(e) && mayMerge(e))) ??
                (roleKey ? atCompany.find((e) => !isOpenRole(e, s, tracks()) && textKey(live(e, s, "role") ?? "") === roleKey && mayMerge(e)) : undefined);
            // "Add a seat you held" where Revenue Nomad already found that seat (a seat-scan seat nobody
            // has claimed): it is claimed instead of added again, so one seat is never two hires. Same
            // title, or the same function, and starts at most SAME_SEAT_MONTHS apart (or one of them
            // blank). The claim pays nothing, like claimSeat: only the empty facts it fills in earn.
            const sent = (k: string) => engFields.find(([x]) => x === k)?.[1] ?? null;
            const sentFn = sent("function") ?? functionOf(role ?? null);
            const scanSeat =
              ownMatch || !selfSeat || (sent("type") && !FRACTIONAL_TYPES.includes(sent("type")!)) || sent("status") === "Open role"
                ? undefined
                : atCompany
                    // Unclaimed: nobody named, or a name from public profiles that is the member's own (someone else's name means it is another seat).
                    .filter((e) => {
                      if (e.source !== SEAT_SCAN || (s.notMine[me.id] ?? []).includes(e.id)) return false;
                      const pn = publicName(e, s);
                      return pn ? sameName(pn.value, me.name) : !valueOf(e, s, "operator");
                    })
                    .map((e) => {
                      const theirRole = live(e, s, "role");
                      const theirStart = live(e, s, "start");
                      const sameRole = !!roleKey && textKey(theirRole ?? "") === roleKey;
                      const sameFn = !!sentFn && (live(e, s, "function") ?? functionOf(theirRole)) === sentFn;
                      const apart = monthsApart(sent("start"), theirStart);
                      // A seat that ended well before this one started is another seat, whatever its start.
                      const ended = monthSpan(sent("end") === "Ongoing" ? null : sent("end"));
                      const began = monthSpan(theirStart);
                      const before = !!ended && !!began && ended[1] < began[0] - SAME_SEAT_MONTHS;
                      return { e, ok: (sameRole || sameFn) && (apart === null || apart <= SAME_SEAT_MONTHS) && !before, score: (sameRole ? 0 : 100) + (apart ?? 50) };
                    })
                    .filter((x) => x.ok)
                    .sort((x, y) => x.score - y.score)[0]?.e;
            if (scanSeat && claimsToday(s, me.id, nowMs) >= SEAT_CLAIM_DAILY_MAX)
              throw new ActionError(`We have this seat on file already, so adding it claims it. You can claim ${SEAT_CLAIM_DAILY_MAX} seats in 24 hours, so add it tomorrow.`);
            const existing = ownMatch ?? scanSeat;
            claimedScan = !!scanSeat;
            // A new seat (or a blank one) has to say what the work was: a name alone is not a seat.
            if ((!existing || isBlank(existing)) && !engFields.some(([k]) => k === "function" || k === "role")) throw new ActionError(SEAT_NEEDS_WHAT);
            let eng: Node;
            if (existing) {
              eid = existing.id;
              eng = existing;
              // What this Add saves, checked together (an end before the start, a start on an open role): see seatCheck.
              const pending = Object.fromEntries(engFields.filter(([k]) => !valueOf(existing, s, k)));
              if (claimedScan) {
                // Their seat now: the seat holder goes in first, as a claim (sorted so above), and what they
                // say about the rest is theirs to say. An answer that differs from the scan's corrects it
                // (for no credit, as on Your seats). A dated end with no status means it ended.
                const sentEnd = sent("end");
                const ends = !!sentEnd && sentEnd !== "Ongoing" && !sent("status");
                if (ends) engFields.push(["status", "Ended"]);
                Object.assign(pending, Object.fromEntries(engFields));
                for (const [k, v] of engFields) {
                  const had = valueOf(eng, s, k);
                  // A year alone ("2024") says the same as the month on file in that year ("2024-03"): the month stays.
                  // The seat holder is always written: on a seat named from public profiles, the member's own name is the claim.
                  if (k !== "operator" && (had?.value === v || ((k === "start" || k === "end") && /^\d{4}$/.test(v) && !!had?.value.startsWith(`${v}-`)))) kept += k === "status" && ends ? 0 : 1;
                  else {
                    if (had) answered++;
                    earned += setValue(eng, "engagement", k, v, seatPick, pending);
                  }
                }
              } else
                for (const [k, v] of engFields) {
                  if (valueOf(eng, s, k)) kept++;
                  else earned += setValue(eng, "engagement", k, v, seatPick, pending);
                }
            } else {
              // A new seat is one the member held: they name themselves as its holder.
              if (seatPick?.id !== me.id || !engFields.some(([k]) => k === "operator")) throw new ActionError(SEAT_SELF_ONLY);
              eid = newId("e", name);
              engNew = true;
              s.engagements.push({ id: eid, companyId: company.id, by: me.id, at: now });
              eng = { id: eid, seedFields: {} };
              const pending = Object.fromEntries(engFields);
              for (const [k, v] of engFields) earned += setValue(eng, "engagement", k, v, seatPick, pending);
            }
            // Everything sent about the seat was on file already.
            seatOnFile = !engNew && engFields.length > 0 && kept === engFields.length;
          }
          // People: one already on file under the same name gets what's new instead of a second record (putPerson).
          const onFile: string[] = [];
          for (const p of people) {
            const put = putPerson(company.id, eid, p);
            earned += put.earned;
            if (put.merged) onFile.push(put.typed);
          }
          const bonus = earned || capped || movedRate ? payReferral() : 0;
          const savedSome = !!(earned || capped || movedRate || people.length);
          // Nothing new went in: say so plainly (the old wording said a seat was added).
          const nothing = !isNew && !engNew && !savedSome && !claimedScan;
          // A locked company stays locked for a member who added nothing to it: the answer never
          // names it (the name on file may not be the one they typed) or hands over its id, so Add
          // can't be used to look companies up. Adding a fact or a seat there opens it (knownCompanies),
          // and that counts toward the day's limits like any other fact.
          if (!isNew && hiddenFor(company.id))
            return {
              message: (nothing
                ? seatOnFile
                  ? `That seat is already on file. ${NOTHING_NEW}`
                  : `${NOTHING_NEW} Add a seat you held there and the company opens for you.`
                : `Saved.${credits(earned)}${bonusNote(bonus)}${capNote(earned > 0)}`) + (revealed === "cap" ? ` ${revealCapWords(revealCap(s, me.id, nowMs))}` : ""),
              capped,
            };
          const where = isNew
            ? `Added ${companyName}`
            : engNew
              ? `Added a seat at ${companyName}`
              : claimedScan
                ? `Your seat at ${companyName} was already on file, so we put your name on it${earned || capped || answered ? " and added your answers" : ""}`
                : savedSome
                  ? `${companyName} was already on Merlin, so we added what you know to it`
                  : seatOnFile
                    ? `That seat at ${companyName} is already on file. ${NOTHING_NEW.slice(0, -1)}`
                    : `${companyName} is already on Merlin. ${NOTHING_NEW.slice(0, -1)}`;
          const merged = onFile.length ? ` ${onFile.join(" and ")} ${onFile.length === 1 ? "was" : "were"} already on file there, so we added what you know to ${onFile.length === 1 ? "that record" : "those records"}.` : "";
          const skipped =
            kept && !(nothing && seatOnFile) ? (kept > 1 ? ` ${kept} facts were already there, so we left them as they were.` : " 1 fact was already there, so we left it as it was.") : "";
          const leftOut = picksLeftOut
            ? ` You've added ${SELL_SAVE_MAX} answers today for ${PICKS}, so ${picksLeftOut === 1 ? "one of those wasn't" : `${picksLeftOut} of those weren't`} saved. Add ${picksLeftOut === 1 ? "it" : "them"} tomorrow.`
            : "";
          return {
            message: `${where}.${credits(earned)}${bonusNote(bonus)}${skipped}${merged}${leftOut}${capNote(earned > 0)}${claimNote()}`,
            id: eid ? pubId(eid) : pubId(company.id),
            capped,
          };
        }
        case "addPerson": {
          const c = g.companies.get(fromPub.get(String(a.companyId)) ?? "");
          if (!c) throw new ActionError(gone("company"));
          mustSee(c.id);
          const e = a.engagementId ? g.engagements.get(fromPub.get(String(a.engagementId)) ?? "") : null;
          if (a.engagementId && (!e || e.companyId !== c.id)) throw new ActionError(gone("engagement"));
          const fields = Object.entries(a.person ?? {}).filter(([, v]) => String(v ?? "").trim());
          if (!fields.some(([k]) => k === "name")) throw new ActionError("Add the person's name.");
          const clean: [string, string][] = [];
          for (const [k, v] of fields) {
            const f = fieldOf("contact", k);
            const { value, error } = cleanValue(f, v);
            if (error) throw new ActionError(`${f.label}. ${error}`);
            clean.push([k, value!]);
          }
          // Someone already on file here under this name gets what's new, not a second record (putPerson).
          const put = putPerson(c.id, e?.id ?? null, clean);
          const earned = put.earned;
          const bonus = earned || capped ? payReferral() : 0;
          const keptNote = put.kept ? (put.kept === 1 ? " 1 detail was already there, so we left it as it was." : ` ${put.kept} details were already there, so we left them as they were.`) : "";
          return {
            message: put.merged
              ? earned || capped
                ? `${put.typed} was already on file at ${c.name}, so we added what you know to that record. It counts as a confirmation too.${credits(earned)}${bonusNote(bonus)}${keptNote}${capNote(earned > 0)}`
                : `${put.typed} is already on file at ${c.name}. ${NOTHING_NEW} It counts as a confirmation of their name.`
              : `Added ${put.typed} at ${c.name}.${credits(earned)}${bonusNote(bonus)}${capNote(earned > 0)}`,
            id: pubId(put.node.id),
            capped,
          };
        }
        case "find": {
          // A company's exact name or website names it in this answer (State.found); anything else opens nothing and says nothing more.
          const text = tidy(a.text, 200);
          if (text.length < FIND_MIN) throw new ActionError(FIND_HINT);
          if ((s.findMisses?.[me.id] ?? []).filter((at) => nowMs - Date.parse(at) < DAY_MS).length >= FIND_MISS_DAILY) throw new ActionError(FIND_MISS_CAP);
          const hits = exactMatches(g, s, text);
          if (!hits.length) {
            missFor(s, me.id, nowMs);
            return { message: FIND_NONE, found: "none" };
          }
          const opened = revealFor(s, me.id, hits.map((c) => c.id), lockedFor, nowMs);
          if (opened === "cap") throw new ActionError(revealCapWords(revealCap(s, me.id, nowMs)));
          const names = hits.map((c) => g.companies.get(c.id)?.name ?? "").filter(Boolean);
          return {
            message: `Found ${names.length > 1 ? `${names.length} companies by that exact name: ${names.join(", ")}` : names[0]}.`,
            id: pubId(hits[0].id),
            ids: hits.map((c) => pubId(c.id)),
            found: opened ? "new" : "again",
            findsLeft: Math.max(0, revealCap(s, me.id, nowMs) - revealsToday(s, me.id, nowMs)),
          };
        }
        case "follow": {
          const c = g.companies.get(fromPub.get(String(a.companyId)) ?? "");
          if (!c) throw new ActionError(gone("company"));
          const label = hiddenFor(c.id) ? "this company" : c.name;
          const list = new Set(s.follows[me.id] ?? []);
          if (a.on) list.add(c.id);
          else list.delete(c.id);
          s.follows[me.id] = [...list];
          return { message: a.on ? `Following ${label}.` : `Stopped following ${label}.` };
        }
        case "profile": {
          const p = { ...(s.profiles[me.id] ?? {}) };
          if (a.function !== undefined) {
            if (a.function && !FUNCTIONS.includes(a.function)) throw new ActionError("Pick a function from the list.");
            p.function = a.function || undefined;
          }
          if (a.goal !== undefined) p.goal = String(a.goal).slice(0, 40) || undefined;
          if (a.title !== undefined) p.title = stripInvisible(a.title).trim().slice(0, 80) || undefined;
          if (a.icp !== undefined) {
            try {
              p.icp = cleanIcp(a.icp);
            } catch (e) {
              throw e instanceof HuntError ? new ActionError(e.message) : e;
            }
          }
          // "Which fractional usually gets hired before you?": up to BEFORE_MAX functions, [] for Not sure.
          if (a.before !== undefined) p.before = cleanBefore(a.before, { strict: true });
          // The first view: a saved view of this member's own, with a place in the table.
          if (a.firstView !== undefined) {
            if (a.firstView === null) delete p.firstView;
            else {
              const id = String(a.firstView);
              if (!(s.connector?.alerts?.[me.id] ?? []).some((x) => x.id === id && x.place)) throw new ActionError("That saved view is gone already.");
              p.firstView = id;
            }
          }
          // Onboarding step 1: how many clients now, and whether they are looking for a new one. Both optional.
          if (a.clientCount !== undefined) {
            if (a.clientCount === null || a.clientCount === "") delete p.clientCount;
            else if ((CLIENT_COUNTS as readonly string[]).includes(String(a.clientCount))) p.clientCount = String(a.clientCount);
            else throw new ActionError("Pick how many clients you have from the list.");
          }
          if (a.looking !== undefined) {
            if (typeof a.looking === "boolean") p.looking = a.looking;
            else delete p.looking;
          }
          p.onboarded = true;
          delete p.draft;
          s.profiles[me.id] = p;
          // The reverse trial starts when onboarding is done (lib/billing), once.
          startTrialIn(s, me.id, nowMs);
          return { message: "Saved." };
        }
        case "onboardDraft": {
          // Onboarding's answers so far, so another tab or device picks up at the same step. Done is done.
          const p = { ...(s.profiles[me.id] ?? {}) };
          if (p.onboarded) return { message: "" };
          if (a.draft === null) delete p.draft;
          else p.draft = cleanDraft(a.draft, s.connector?.alerts?.[me.id] ?? [], now);
          s.profiles[me.id] = p;
          return { message: "" };
        }
        case "savedView": {
          // Save this view: the same list as the connector's saved searches (lib/hunt.ts).
          s.connector ??= emptyConnector();
          s.connector.alerts ??= {};
          try {
            const had = (s.connector.alerts[me.id] ?? []).length;
            const r = savedViewAction(s.connector.alerts[me.id] ?? [], a, () => `al_${randomBytes(6).toString("base64url")}`, now);
            // Free keeps one saved view (onboarding's own views aside). A view they saved already still comes back as that view.
            if (r.list.length > had && r.list.length > FREE_SAVED_VIEWS && s.profiles[me.id]?.onboarded && freeNow(s, me.id, nowMs)) throw new ActionError(SAVED_VIEW_FREE);
            s.connector.alerts[me.id] = r.list;
            return { message: r.message, ...(r.id ? { id: r.id } : {}) };
          } catch (e) {
            throw e instanceof HuntError ? new ActionError(e.message) : e;
          }
        }
        case "report": {
          // One report hides the fact for the reporter; a second member's report hides it for
          // everyone until an admin reviews it. A free fact can be reported by members who have
          // added a fact to a record; a fact you paid to see, or one on your own seat, always.
          const node = nodeOf(a.entity, a.id);
          const f = fieldOf(a.entity, a.field);
          const k = fkey(node.id, f.key);
          const cur = valueOf(node, s, f.key);
          // A hidden company's website, LinkedIn and full HQ are not on show to this member.
          if (a.entity === "company" && (IDENTITY_FIELDS.has(f.key) || f.key === "hq") && hiddenFor(node.id)) throw new ActionError("There's nothing here to report. You can only report a fact you can see.");
          // An open role's free title counts as paid for by whoever paid for that open role (its posting or rate, or its company).
          const paidRole =
            a.entity === "engagement" &&
            f.key === "role" &&
            roleFree(node as EngNode, s, tracks()) &&
            (holdsOpenRole(s, me, node) || (s.unlocks[fkey((node as EngNode).companyId, "identity")] ?? []).includes(me.id));
          // A person's name or title counts as paid for by whoever paid for the other half (PERSON_BUNDLE), and so does a seat's holder or role (SEAT_BUNDLE).
          const paid =
            (s.unlocks[k] ?? []).includes(me.id) ||
            paidRole ||
            (a.entity === "contact" && holdsPersonPartner(s, me, node, a.entity, f.key)) ||
            (a.entity === "engagement" && holdsSeatPartner(s, me, node, a.entity, f.key));
          const own = a.entity === "engagement" && ownSeat(node.id);
          const canSee = !f.gated || paid || freeFor(a.entity, node.id, f.key);
          if (!cur || cur.status !== "live" || !canSee) throw new ActionError("There's nothing here to report. You can only report a fact you can see.");
          if (cur.by === me.id) throw new ActionError("You added this one. Edit it instead of reporting it.");
          if (cur.kept?.includes(me.id)) throw new ActionError("An admin reviewed this fact and kept it, so you can't report it again.");
          // A rate shared for the benchmarks only is not a fact on a record, so it doesn't count here.
          if (!paid && !own && !s.ledger.some((l) => l.memberId === me.id && l.reason === "fill" && l.delta > 0 && !l.undone && !l.ref.startsWith("bench.")))
            throw new ActionError("Reporting opens once you've added a fact of your own. Add one first.");
          if (s.reportLog.filter((r) => r.memberId === me.id && nowMs - Date.parse(r.at) < DAY).length >= REPORT_DAILY_MAX)
            throw new ActionError(`You've reported ${REPORT_DAILY_MAX} facts in 24 hours, which is the limit. Try again tomorrow.`);
          if ((cur.reporters ?? []).includes(me.id)) return { message: "You already reported this." };
          // "This is wrong" on an unverified name from public profiles: one report is enough. It comes off for everyone at once,
          // whoever paid to see it gets the credit back, and the seat reads as unnamed (its role is free again).
          if (a.entity === "engagement" && f.key === "operator" && cur.pub && !nameVerified(s, node.id)) {
            const back = takeNameOff(s, node.id, "wrong", now);
            s.reportLog.push({ memberId: me.id, ref: k, at: now });
            return {
              message: `Thanks. That name is off the seat for everyone now.${back ? " Anyone who paid to see it got the credit back." : ""}`,
              cells: ENG_KEYS.map((field) => changed("engagement", node, field)),
            };
          }
          const reporters = [...(cur.reporters ?? []), me.id];
          // What the posting says about a role that is still listed stays up for everyone else: reports
          // send it to an admin, but two members can't blank the title or the link of a live opening.
          const track = a.entity === "engagement" ? tracks().get(node.id) : undefined;
          const listed = isSystem(cur.by) && !!track && !track.closedAt;
          // The seat holder's report on their own seat hides the fact for everyone at once.
          s.values[k] = { ...cur, reporters, status: !listed && (own || reporters.length >= 2) ? "reported" : "live", reportedBy: me.id };
          s.reportLog.push({ memberId: me.id, ref: k, at: now });
          return {
            message: listed
              ? "Reported. You won't see it now, and an admin will review it. Others still see it while the posting is listed."
              : own
                ? "Reported. Members won't see it until an admin reviews it."
                : "Reported. You won't see it now, and an admin will review it.",
            cells: [changed(a.entity, node, f.key)],
          };
        }
        case "verify": {
          const node = nodeOf(a.entity, a.id);
          const f = fieldOf(a.entity, a.field);
          const k = fkey(node.id, f.key);
          const cur = valueOf(node, s, f.key);
          // A hidden company's website, LinkedIn and full HQ are not on show to this member (the answer would hand them over).
          if (a.entity === "company" && (IDENTITY_FIELDS.has(f.key) || f.key === "hq") && hiddenFor(node.id)) throw new ActionError("There's nothing here to confirm. You can only confirm a fact you can see.");
          const canSee = !f.gated || (s.unlocks[k] ?? []).includes(me.id) || freeFor(a.entity, node.id, f.key);
          if (!cur || cur.status !== "live" || !canSee || cur.reporters?.includes(me.id)) throw new ActionError("There's nothing here to confirm. You can only confirm a fact you can see.");
          if (cur.by === me.id) throw new ActionError("You added this one, so another member has to confirm it.");
          // "I know this is right" on a name from public profiles: from a member who says the seat is theirs it would be their own word twice.
          const pubName = a.entity === "engagement" && f.key === "operator" && !!cur.pub;
          if (pubName && pendingClaimers(s, node.id).includes(me.id)) throw new ActionError("You said this seat is yours, so the name on it needs other members to confirm it.");
          const wasVerified = pubName && nameVerified(s, node.id);
          const list = s.verifications[k] ?? [];
          if (list.includes(me.id)) return { message: "You already confirmed this." };
          s.verifications[k] = [...list, me.id];
          trustNow = null; // a confirmation can make the fact's author count (trustOf)
          // Two members confirming a name from public profiles verify it. Confirming earns nothing (it came from our research, not a member).
          if (pubName && !wasVerified)
            return {
              message: nameVerified(s, node.id) ? "Confirmed the seat holder. Two members have confirmed this name now, so it's verified." : "Confirmed the seat holder. Once one more member confirms it, it's verified.",
              cells: [changed(a.entity, node, f.key)],
            };
          // The real count: members who confirmed it. Our own records and the scan are not confirmations.
          const n = list.length + 1;
          // The member who added a fact earns +1 once two other members confirm it (once per fact;
          // it counts toward the daily cap and is held if the author is at it).
          if (!isSystem(cur.by) && list.length + 1 >= 2 && !s.ledger.some((l) => l.reason === "confirm" && l.ref === k) && !s.held.some((h) => h.reason === "confirm" && h.ref === k))
            grant(s, cur.by, 1, "confirm", k, now);
          return { message: `Confirmed ${say(a.entity, f.key)}. That makes ${n} confirmation${n > 1 ? "s" : ""}.`, cells: [changed(a.entity, node, f.key)] };
        }
        case "review": {
          if (!isAdmin(me)) throw new ActionError("Only admins can review reports.");
          const k = fkey(inId(a.entity, a.id), String(a.field));
          const cur = s.values[k];
          if (!cur || cur.status === "removed" || (cur.status !== "reported" && !cur.reporters?.length)) throw new ActionError("There's nothing to review on this one. It may already be settled.");
          if (a.decision === "keep") {
            // The members whose report was turned down can't report this value again.
            const kept = [...new Set([...(cur.kept ?? []), ...(cur.reporters ?? []), ...(cur.reportedBy ? [cur.reportedBy] : [])])];
            s.values[k] = { ...cur, status: "live", ...(kept.length ? { kept } : {}) };
            delete s.values[k].reporters;
            delete s.values[k].reportedBy;
            return { message: "Kept. It shows for everyone again." };
          }
          // Wrong data: the field reopens, the filler loses what it earned, unlockers get theirs back.
          removeFact(k, cur);
          return { message: REMOVED };
        }
        case "adminRemove": {
          // An admin takes one member-added fact off the table. No report is needed.
          if (!isAdmin(me)) throw new ActionError("Only admins can remove a fact.");
          const node = nodeOf(a.entity, a.id);
          const f = fieldDef(a.entity, String(a.field));
          const k = fkey(node.id, String(a.field));
          const cur = s.values[k];
          if (!f || !cur || cur.status === "removed") throw new ActionError("There's nothing to remove on this one. It may already be gone.");
          if (isSystem(cur.by)) throw new ActionError("That fact came from our records or the scan. Only a fact a member added can be removed this way.");
          removeFact(k, cur);
          return { message: REMOVED, id: outId(a.entity, node.id), cells: [changed(a.entity, node, f.key)] };
        }
        case "adminRemoveMember": {
          // An admin takes everything one member added off the table, with the credits it earned.
          if (!isAdmin(me)) throw new ActionError("Only admins can remove a member's facts.");
          const wanted = String(a.memberId ?? "");
          const target = memberIndex(seed, s).all.find((m) => pubId(m.id) === wanted);
          if (!target) throw new ActionError("We couldn't find that member. Refresh the page and try again.");
          let facts = 0;
          for (const k of Object.keys(s.values)) {
            const v = s.values[k]; // read now: removing a seat holder can rewrite the status beside it
            if (v.by !== target.id || v.status === "removed") continue;
            removeFact(k, v);
            facts++;
          }
          // Their benchmark-only rates too, each with the credit it earned.
          let rates = 0;
          s.benchRates = s.benchRates.filter((b) => {
            if (b.by !== target.id) return true;
            const ref = `bench.${b.id}`;
            const paid = s.ledger.filter((l) => l.memberId === target.id && l.ref === ref).reduce((n, l) => n + l.delta, 0);
            if (paid > 0) s.ledger.push({ memberId: target.id, delta: -paid, reason: "reversal", ref, at: now });
            rates++;
            return false;
          });
          // Records they made that now hold nothing go too: people first, then seats, then
          // companies. One that anybody else added to, or that the scan follows, stays.
          const inUse = new Set<string>();
          for (const [k, v] of Object.entries(s.values)) if (v.status !== "removed") inUse.add(k.slice(0, k.lastIndexOf(".")));
          for (const r of Object.values(s.scan.roles)) inUse.add(r.engagementId);
          for (const b of s.benchRates) if (b.engagementId) inUse.add(b.engagementId);
          let records = 0;
          const gone = new Set<string>();
          const dropEmpty = <T extends Added>(list: T[], ids?: Set<string>): T[] =>
            list.filter((x) => {
              if (x.by !== target.id || inUse.has(x.id)) return true;
              records++;
              ids?.add(x.id);
              return false;
            });
          s.contacts = dropEmpty(s.contacts);
          for (const p of s.contacts) {
            if (p.engagementId) inUse.add(p.engagementId);
            inUse.add(p.companyId ?? g.engagements.get(p.engagementId ?? "")?.companyId ?? "");
          }
          s.engagements = dropEmpty(s.engagements);
          for (const e of s.engagements) inUse.add(e.companyId);
          s.companies = dropEmpty(s.companies, gone);
          for (const id of gone) refundUnlockers(fkey(id, "identity"));
          if (gone.size) for (const [m, list] of Object.entries(s.follows)) s.follows[m] = list.filter((id) => !gone.has(id));
          if (!facts && !rates && !records) return { message: `${target.name} has nothing on the table to remove.` };
          const count = (n: number, one: string, many: string) => (n ? [`${n} ${n === 1 ? one : many}`] : []);
          const parts = [...count(facts, "fact", "facts"), ...count(rates, "private rate", "private rates"), ...count(records, "empty record", "empty records")];
          const what = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
          return { message: `Removed ${what} that ${target.name} added. The credits they earned came off their balance, and anyone who unlocked them got their credit back.` };
        }
        case "names": {
          // Seat-holder names from public profiles, in Pilot metrics: the switch, the claims waiting, and a name an admin checked.
          if (!isAdmin(me)) throw new ActionError("Only admins can do this.");
          const names = (s.names ??= emptyNames());
          if (a.op === "show") {
            if (a.on) delete names.hide;
            else names.hide = true;
            return {
              message: a.on
                ? `Names from public profiles show while the table has fewer than ${namesUntil().toLocaleString("en-US")} seats.`
                : "Names from public profiles are hidden now. Their seats read as unnamed, and claims still work.",
            };
          }
          const e = g.engagements.get(inId("engagement", a.engagementId));
          if (!e) throw new ActionError(gone("engagement"));
          const k = fkey(e.id, "operator");
          const settle = (status: "approved" | "declined", except?: (typeof names.claims)[number]) => {
            for (const c of names.claims) if (c !== except && c.engagementId === e.id && c.status === "pending") (c.status = status), (c.decidedAt = now);
          };
          if (a.op === "approve" || a.op === "decline") {
            const who = memberIndex(seed, s).all.find((m) => pubId(m.id) === String(a.memberId ?? ""));
            const c = who ? names.claims.find((x) => x.engagementId === e.id && x.memberId === who.id && x.status === "pending") : undefined;
            if (!who || !c) throw new ActionError("That claim isn't waiting any more. It may already be settled.");
            if (a.op === "decline") {
              c.status = "declined";
              c.decidedAt = now;
              return { message: "Declined. The name on the seat stays as it was." };
            }
            const cur = s.values[k];
            if (cur && cur.status === "live" && cur.memberId) throw new ActionError("A member already claimed this seat, so this claim can't go through.");
            // The claim goes through as the member's own: their name on the seat, and it is on their Your seats.
            s.values[k] = { value: who.name, by: who.id, memberId: who.id, at: now, status: "live" };
            delete s.verifications[k];
            c.status = "approved";
            c.decidedAt = now;
            settle("declined", c);
            s.seatClaims = [...(s.seatClaims ?? []).filter((x) => nowMs - Date.parse(x.at) < CLAIM_KEEP), { memberId: who.id, engagementId: e.id, at: now }];
            // The claim came through a member's invite link: now that it stands, it connects them (bonus and conversation).
            const link = c.via ? connectInvite(s, seed, g, who, e.id, c.via, now) : null;
            return {
              message: `Done. The seat is ${firstName(who.name)}'s now, and it's on their Your seats.${link?.conversationId ? ` They came through ${link.inviter}'s invite, so a conversation between them is open.` : ""}`,
              cells: [changed("engagement", e, "operator")],
              ...(link?.conversationId ? { connected: link.conversationId } : {}),
            };
          }
          const onFile = publicName(e, s)?.value ?? seedPublicName(seed, s, e.id);
          if (!onFile) throw new ActionError("There's no name from public profiles on this seat any more.");
          if (a.op === "verify") {
            names.verified[e.id] = now;
            settle("declined");
            return { message: "Verified. The name stays on the seat, and its Verify button is gone.", cells: [changed("engagement", e, "operator")] };
          }
          const back = takeNameOff(s, e.id, "admin", now);
          return { message: `Removed the name.${back ? " Anyone who paid to see it got the credit back." : ""}`, cells: ENG_KEYS.map((f) => changed("engagement", e, f)) };
        }
        case "benchRate": {
          // A rate for the benchmarks only: it counts in the medians and is never on a record.
          const r = readRate(stripInvisible(a.rate).trim().slice(0, 60), a.pricing === "Hourly" || a.pricing === "Monthly retainer" ? a.pricing : null);
          if (!r) throw new ActionError(RATE_HELP);
          const mine = s.benchRates.filter((b) => b.by === me.id);
          // Every save writes a "fill" row for bench.<id>, paid or not, and removing the rate keeps it.
          const savedToday = s.ledger.filter((l) => l.memberId === me.id && l.reason === "fill" && l.ref.startsWith("bench.") && nowMs - Date.parse(l.at) < DAY).length;
          if (savedToday >= BENCH_DAILY_MAX) throw new ActionError(`You can share ${BENCH_DAILY_MAX} rates for the benchmarks a day. Share the next one tomorrow.`);
          /**
           * Tied to a seat: one the member holds, or one they added that has a role and names
           * them as its seat holder. A blank seat they made up doesn't count.
           */
          const tied = (engId: string | null) => {
            if (!engId) return false;
            // A seat from our records or the scan that they hold. One they made themselves needs a role too (a blank one is a throwaway).
            const madeIt = s.engagements.some((x) => x.id === engId && x.by === me.id);
            if (!madeIt && ownSeat(engId)) return true;
            const e = g.engagements.get(engId);
            if (!e || !s.engagements.some((x) => x.id === engId && x.by === me.id) || !live(e, s, "role")) return false;
            if ((s.notMine[me.id] ?? []).includes(engId)) return false;
            const op = valueOf(e, s, "operator");
            return !!op && op.status === "live" && (op.memberId ? op.memberId === me.id : normName(op.value) === normName(me.name));
          };
          let engagementId: string | null = null;
          let fn: string | null;
          let revenue: string | null;
          const given = (list: string[], raw: unknown, error: string) => {
            if (raw === undefined || raw === null || raw === "") return null;
            if (!list.includes(String(raw))) throw new ActionError(error);
            return String(raw);
          };
          const askedFn = given(FUNCTIONS, a.function, "Pick a function from the list.");
          const askedRevenue = given(RN_REVENUE, a.revenue, "Pick a revenue range from the list.");
          const myFn = s.profiles[me.id]?.function ?? functionOf(s.profiles[me.id]?.title || me.title);
          if (a.engagementId) {
            const e = g.engagements.get(inId("engagement", a.engagementId));
            if (!e) throw new ActionError(gone("engagement"));
            // Named on it is enough to share a rate there. It counts as tied to the seat only when the seat is theirs (tied()).
            if (!linkedSeat(e.id) && !s.engagements.some((x) => x.id === e.id && x.by === me.id)) throw new ActionError("You can only share a rate for a seat you held or added.");
            if (valueOf(e, s, "rate")?.by === me.id) throw new ActionError("Your rate is already on this seat, so it already counts in the benchmarks.");
            if (mine.some((b) => b.engagementId === e.id)) throw new ActionError("You already shared a rate for this seat. Remove it first to share a different one.");
            engagementId = e.id;
            fn = fnOf(e, s) ?? askedFn ?? myFn ?? "Other";
            revenue = live(e, s, "revenue") ?? live(g.companies.get(e.companyId), s, "revenue") ?? askedRevenue;
          } else {
            fn = askedFn ?? myFn;
            if (!fn) throw new ActionError("Pick a function from the list.");
            revenue = askedRevenue;
          }
          if (!tied(engagementId) && mine.filter((b) => !tied(b.engagementId)).length >= BENCH_UNATTACHED_MAX)
            throw new ActionError(
              engagementId
                ? `You can share ${BENCH_UNATTACHED_MAX} rates that aren't tied to a seat you held. This seat counts as yours once it has a role and names you as the seat holder.`
                : `You can share ${BENCH_UNATTACHED_MAX} rates that aren't tied to a seat. Remove one to share another.`,
            );
          const id = `b_${randomBytes(9).toString("base64url")}`;
          s.benchRates.push({ id, by: me.id, engagementId, fn, kind: r.kind, amount: r.amount, revenue: revenue && RN_REVENUE.includes(revenue) ? revenue : null, at: now });
          const earned = awardFill(`bench.${id}`);
          if (!earned) capped = true;
          const bonus = payReferral();
          // A new account's rate can't help a group reach its floor (see benchTrust), so say when it starts to.
          // A rate from an account that does not count yet is in no figure (see benchPoints), so say when it will be.
          const young = trusted(me.id) ? "" : " Your rate counts in the benchmarks once two members confirm a fact you added.";
          return { message: `Added to the benchmarks. Your rate is never shown with your name or the seat.${credits(earned)}${bonusNote(bonus)}${capNote()}${young}`, id, capped };
        }
        case "benchRateRemove": {
          const i = s.benchRates.findIndex((b) => b.id === String(a.id) && b.by === me.id);
          if (i < 0) throw new ActionError("We couldn't find that rate. It may already be removed.");
          const ref = `bench.${s.benchRates[i].id}`;
          s.benchRates.splice(i, 1);
          // Take back the credit it earned.
          const paid = s.ledger.filter((l) => l.memberId === me.id && l.ref === ref).reduce((n, l) => n + l.delta, 0);
          if (paid > 0) s.ledger.push({ memberId: me.id, delta: -paid, reason: "reversal", ref, at: now });
          return { message: `Removed your rate from the benchmarks.${paid > 0 ? ` The ${paid === 1 ? "credit" : `${paid} credits`} it earned came off your balance.` : ""}` };
        }
        case "claimSeat": {
          // "Is this your seat? Claim it" (and "This is me"): a seat from the seat scan that no member has claimed becomes the viewer's.
          const e = g.engagements.get(inId("engagement", a.engagementId));
          if (!e) throw new ActionError(gone("engagement"));
          if (e.source !== SEAT_SCAN) throw new ActionError("Only seats Revenue Nomad found can be claimed. To add a seat you held, use Add.");
          if (!opts.claimLink || a.preview) mustSee(e.companyId);
          // A name from public profiles on it: the seat is unclaimed while it is unverified, and the member it names can always claim it.
          const pub = publicName(e, s);
          const theirs = !!pub && sameName(pub.value, me.name);
          const waiting = pendingClaimers(s, e.id).includes(me.id);
          if (a.preview) {
            // "Is this you?": the seat's title and dates, so the member checks it before claiming. Only an unclaimed seat, a few dozen a day.
            if (valueOf(e, s, "operator") && !(pub && (theirs || !nameVerified(s, e.id)))) throw new ActionError(SEAT_TAKEN);
            if (waiting) throw new ActionError(CLAIM_WAITING);
            const seen = (claimPreviews.get(me.id) ?? []).filter((t) => nowMs - t < DAY);
            if (seen.length >= CLAIM_PREVIEW_DAILY_MAX) throw new ActionError("You've checked a lot of seats today. Try again tomorrow, or add the seat you held.");
            claimPreviews.set(me.id, [...seen, nowMs]);
            // On a named seat the role sells with the name (SEAT_BUNDLE): only the member it names sees it here.
            return {
              message: "",
              id: pubId(e.id),
              claim: { role: !pub || theirs ? live(e, s, "role") : null, function: live(e, s, "function"), start: live(e, s, "start"), end: live(e, s, "end"), status: live(e, s, "status") },
            };
          }
          // Through a member's invite link (/claim/<token>?ref=<code>): who sent it, so the claim connects them (connectInvite).
          const via = opts.claimLink && opts.ref ? memberByInviteCode(seed, s, opts.ref) : null;
          if (pub && !theirs) {
            // Someone else's name is on it. Verified: it is theirs. Unverified: an admin checks the claim, and the name stays until then.
            if (nameVerified(s, e.id)) throw new ActionError(SEAT_TAKEN);
            if (waiting) return { message: CLAIM_WAITING, id: pubId(e.id) };
            if (claimsToday(s, me.id, nowMs) >= SEAT_CLAIM_DAILY_MAX) throw new ActionError(`You can claim ${SEAT_CLAIM_DAILY_MAX} seats in 24 hours. Claim the next one tomorrow.`);
            const names = (s.names ??= emptyNames());
            names.claims = [
              ...names.claims.filter((c) => c.status === "pending" || nowMs - Date.parse(c.decidedAt ?? c.at) < CLAIM_KEEP),
              // The invite connects them once an admin approves the claim.
              { memberId: me.id, engagementId: e.id, at: now, status: "pending", ...(via && via.id !== me.id ? { via: via.id } : {}) },
            ];
            return { message: CLAIM_QUEUED, id: pubId(e.id), cells: [changed("engagement", e, "operator")] };
          }
          setValue(e, "engagement", "operator", me.name, me);
          const link = via ? connectInvite(s, seed, g, me, e.id, via.id, now) : null;
          return {
            message:
              (theirs
                ? "It's yours. Your name matches the one on file, so it's verified now. Other members see it behind a 1 credit lock. Fill in what you know on Your seats."
                : "It's yours. Other members see your name on it behind a 1 credit lock. Fill in what you know on Your seats.") + connectedNote(link),
            id: pubId(e.id),
            cells: ENG_KEYS.map((f) => changed("engagement", e, f)),
            ...(link?.conversationId ? { connected: link.conversationId } : {}),
          };
        }
        case "notMine": {
          // "This isn't me": a seat matched to this member by name that they never held. On a seat
          // they put their own name on (one they claimed, an open role they took, one they added) the
          // app says "Not my seat" or "Remove this seat" (their own name, below).
          const e = g.engagements.get(inId("engagement", a.engagementId));
          // "Not me" on a seat the seat scan found that nobody has claimed ("Is this you?"): it is not
          // theirs, so an Add of theirs never claims it (the add action). Claiming it still can.
          // The same on one named from public profiles that nobody claimed: the name is someone else's, and their claim on it (if any) is withdrawn.
          if (e && e.source === SEAT_SCAN && (!valueOf(e, s, "operator") || publicName(e, s))) {
            if (!(s.notMine[me.id] ?? []).includes(e.id)) s.notMine[me.id] = [...(s.notMine[me.id] ?? []), e.id];
            if (s.names) s.names.claims = s.names.claims.filter((c) => !(c.memberId === me.id && c.engagementId === e.id && c.status === "pending"));
            return { message: "Got it. That seat isn't yours, so we'll leave it for whoever held it.", id: pubId(e.id) };
          }
          if (!e || !linkedSeat(e.id)) throw new ActionError("That seat isn't linked to you.");
          // A name a member put on the seat is hidden for everyone until an admin decides. So is a
          // name from our own records: we matched it by name, so it may be someone else's, and
          // nobody can unlock it (or buy it) while an admin checks. Removing it refunds whoever had.
          const k = fkey(e.id, "operator");
          const cur = valueOf(e, s, "operator");
          const wasClosed = !!tracks().get(e.id)?.closedAt;
          let reopened = false;
          // Their own name on it: a seat-scan seat they claimed, an open role they took, a seat they
          // added. Giving it up puts the seat back as it was: their name comes off (the credit it
          // earned goes back, and whoever paid to see it gets theirs), so does every fact they added
          // there (as a take-back would: the credits back, the unlocks refunded), and their private
          // rate for it. What a correction of theirs replaced comes back. A seat they made, empty
          // after that, goes, and so does a company they made for it that holds nothing else.
          if (cur && cur.by === me.id) {
            let facts = 0;
            let taken = 0;
            const undo = (fk: string) => {
              for (const l of s.ledger) if (l.memberId === me.id && l.ref === fk && l.reason === "fill") l.undone = true;
            };
            for (const field of ENG_KEYS) {
              const fk = fkey(e.id, field);
              const fv = s.values[fk];
              if (field === "operator" || !fv || fv.status === "removed" || fv.by !== me.id) continue;
              facts++;
              // A correction earned nothing: what it replaced goes back (its confirmations were for the correction).
              if (!s.ledger.some((l) => l.memberId === me.id && l.ref === fk && l.reason === "fill") && (fv.prev || e.seedFields[field])) {
                delete s.verifications[fk];
                if (fv.prev && !(fv.prev.by === "seed" && e.seedFields[field] === fv.prev.value)) s.values[fk] = { value: fv.prev.value, by: fv.prev.by, at: fv.prev.at, status: "live" };
                else delete s.values[fk];
                continue;
              }
              taken += removeFact(fk, fv, "retract");
              undo(fk);
            }
            taken += removeFact(k, cur, "retract");
            undo(k);
            reopened = wasClosed && !tracks().get(e.id)?.closedAt;
            s.benchRates = s.benchRates.filter((b) => {
              if (b.by !== me.id || b.engagementId !== e.id) return true;
              const ref = `bench.${b.id}`;
              const paid = s.ledger.filter((l) => l.memberId === me.id && l.ref === ref).reduce((n, l) => n + l.delta, 0);
              if (paid > 0) s.ledger.push({ memberId: me.id, delta: -paid, reason: "reversal", ref, at: now });
              taken += Math.max(0, paid);
              facts++;
              return false;
            });
            const owns = (key: string, id: string) => key.slice(0, key.lastIndexOf(".")) === id;
            // People they put on the seat stay, on the company: who works there is still true.
            for (const p of s.contacts) if (p.engagementId === e.id && p.by === me.id) (p.companyId ??= e.companyId), (p.engagementId = null);
            const made = s.engagements.some((x) => x.id === e.id && x.by === me.id);
            const holds = Object.entries(s.values).some(([vk, v]) => v.status !== "removed" && owns(vk, e.id)) || Object.values(s.scan.roles).some((r) => r.engagementId === e.id);
            let removedSeat = false;
            if (made && !holds) {
              removedSeat = true;
              s.engagements = s.engagements.filter((x) => x.id !== e.id);
              for (const bag of [s.values, s.unlocks, s.verifications] as Record<string, unknown>[]) for (const vk of Object.keys(bag)) if (owns(vk, e.id)) delete bag[vk];
              // People on it stay, on the company. So does another member's private rate for it.
              for (const p of s.contacts) if (p.engagementId === e.id) (p.companyId ??= e.companyId), (p.engagementId = null);
              for (const b of s.benchRates) if (b.engagementId === e.id) b.engagementId = null;
              if (s.roleClaims) s.roleClaims = s.roleClaims.filter((c) => c.engagementId !== e.id);
              for (const [m, ids] of Object.entries(s.notMine)) if (ids.includes(e.id)) s.notMine[m] = ids.filter((id) => id !== e.id);
              const co = e.companyId;
              const coLeft =
                [...g.engagements.values()].some((x) => x.companyId === co && x.id !== e.id) ||
                [...g.contacts.values()].some((p) => p.companyId === co) ||
                s.contacts.some((p) => p.companyId === co) ||
                Object.entries(s.values).some(([vk, v]) => v.status !== "removed" && owns(vk, co));
              if (s.companies.some((c) => c.id === co && c.by === me.id) && !coLeft) {
                refundUnlockers(fkey(co, "identity"));
                s.companies = s.companies.filter((c) => c.id !== co);
                for (const bag of [s.values, s.unlocks, s.verifications] as Record<string, unknown>[]) for (const vk of Object.keys(bag)) if (owns(vk, co)) delete bag[vk];
                for (const [m, ids] of Object.entries(s.follows)) if (ids.includes(co)) s.follows[m] = ids.filter((id) => id !== co);
              }
            } else s.notMine[me.id] = [...(s.notMine[me.id] ?? []), e.id];
            const earned = taken ? ` The ${taken === 1 ? "credit" : `${taken} credits`} it earned came off your balance.` : "";
            const back = facts ? ` What you added to it came off too.${earned}` : earned;
            return {
              message: removedSeat ? `Removed that seat.${back}` : `Got it. That seat is no longer linked to you. Your name is off it.${back}${reopened ? " The role is open again." : ""}`,
              id: pubId(e.id),
              ...(removedSeat ? {} : { cells: ENG_KEYS.map((f) => changed("engagement", e, f)) }),
            };
          }
          s.notMine[me.id] = [...(s.notMine[me.id] ?? []), e.id];
          const fromRecords = !!cur && cur.by === "seed";
          const hide = !!cur && (!isSystem(cur.by) || fromRecords);
          if (cur && hide) {
            s.values[k] = { ...cur, status: "reported", reporters: [...new Set([...(cur.reporters ?? []), me.id])], reportedBy: me.id };
            s.reportLog.push({ memberId: me.id, ref: k, at: now });
            // Nobody can see the name now, so whoever paid to see it gets the credit back at once.
            if (fromRecords) refundUnlockers(k);
            // Whatever else the same member put on that seat behind a lock (a rate, an end date) goes to review with the name.
            // (What our records say about the seat itself stays: only the name may be someone else's.)
            for (const field of ENG_GATED) {
              const fk = fkey(e.id, field);
              const fv = s.values[fk];
              if (field === "operator" || !fv || fv.status !== "live" || fv.by !== cur.by || isSystem(fv.by)) continue;
              s.values[fk] = { ...fv, status: "reported", reporters: [...new Set([...(fv.reporters ?? []), me.id])], reportedBy: me.id };
            }
            // If naming them closed an open role, it is open again.
            reopened = reopenFilled(s, e.id, now);
            if (reopened) tracksNow = null;
          }
          return {
            message: fromRecords
              ? `Got it. Your name is off that seat. We'll check our records.${reopened ? " The role is open again." : ""}`
              : `Got it. That seat is no longer linked to you.${hide ? " Members won't see the name on that seat until an admin reviews it." : ""}${reopened ? " The role is open again." : ""}`,
            id: pubId(e.id),
            cells: [...ENG_GATED, "status"].map((f) => changed("engagement", e, f)),
          };
        }
        case "retract": {
          // Undo: the member takes back a fact they added, while nobody else has paid for it or vouched for it.
          const node = nodeOf(a.entity, a.id);
          const f = fieldOf(a.entity, a.field);
          const k = fkey(node.id, f.key);
          const cur = valueOf(node, s, f.key);
          if (!cur || cur.by !== me.id) throw new ActionError("There's nothing of yours here to take back.");
          // The fill that added it. A correction of our records on their own seat, or a value filled in from another answer, has none.
          const row = s.ledger.findLast((l) => l.memberId === me.id && l.ref === k && l.reason === "fill" && !l.undone);
          if (!row) throw new ActionError("You can only take back a fact you added. Edit this one instead.");
          // Half of a pair another member bought (a person's name and title, who held a seat and their role) was part of what they paid for.
          const partner =
            a.entity === "contact" && PERSON_BUNDLE.includes(f.key)
              ? f.key === "name" ? "title" : "name"
              : a.entity === "engagement" && SEAT_BUNDLE.includes(f.key) && seatBundled(node, s)
                ? f.key === "operator" ? "role" : "operator"
                : null;
          if ((s.unlocks[k] ?? []).some((m) => m !== me.id) || (partner && (s.unlocks[fkey(node.id, partner)] ?? []).some((m) => m !== me.id)))
            throw new ActionError("Someone already unlocked this, so it stays. You can still edit it.");
          if ((s.verifications[k] ?? []).length) throw new ActionError("Someone already confirmed this, so it stays. You can still edit it.");
          // The invite bonus paid on this fact (it pays with the first fact on a record, in the same change).
          const paidInvite =
            s.referralPaid.includes(me.id) &&
            (s.ledger.some((l) => l.memberId === me.id && l.reason === "referral" && l.at === row.at) || s.held.some((h) => h.memberId === me.id && h.reason === "referral" && h.at === row.at));
          if (paidInvite) throw new ActionError("This fact paid your invite bonus, so it stays. You can still edit it.");
          const statusBefore = a.entity === "engagement" ? live(node, s, "status") : null;
          const taken = removeFact(k, cur, "retract");
          row.undone = true;
          const cells = [changed(a.entity, node, f.key)];
          // What this fact filled in on its own goes with it: the function read from a role, the status "Ended" a dated end set.
          const derived = a.entity === "engagement" ? (f.key === "role" ? "function" : f.key === "end" ? "status" : null) : null;
          if (derived) {
            const dk = fkey(node.id, derived);
            const dv = s.values[dk];
            if (dv && dv.by === me.id && dv.status !== "removed" && dv.at === cur.at && !s.ledger.some((l) => l.memberId === me.id && l.ref === dk && l.reason === "fill")) {
              s.values[dk] = { ...dv, status: "removed" };
              delete s.verifications[dk];
              cells.push(changed(a.entity, node, derived));
            }
          }
          // Taking back your own name on an open role you took reopens it.
          const reopened = f.key === "operator" && statusBefore !== "Open role" && live(node, s, "status") === "Open role";
          if (f.key === "operator") cells.push(changed(a.entity, node, "status"));
          return {
            message: `Took back ${say(a.entity, f.key)}.${taken ? ` The ${taken === 1 ? "credit" : `${taken} credits`} it earned came off your balance.` : ""}${reopened ? " The role is open again." : ""}`,
            id: outId(a.entity, node.id),
            cells,
          };
        }
        case "signal": {
          const name = String(a.name);
          if (!SIGNAL_NAMES.has(name)) throw new ActionError(UNKNOWN_ACTION);
          const where = String(a.where ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "unknown";
          if (name === "pro_interest") {
            // Once per member.
            if (!s.profiles[me.id]?.proInterest) {
              s.profiles[me.id] = { ...(s.profiles[me.id] ?? {}), proInterest: true };
              addSignal(s, me.id, name, where, now);
            }
            return { message: "You're on the list." };
          }
          // The server already counted a refused unlock. The app's own "wall" for the same
          // moment would count it twice, so it is dropped (a wall the app shows without
          // asking the server is kept).
          const counted =
            name === "wall" && s.signals.some((x) => x.memberId === me.id && x.name === "wall" && x.where === "server" && nowMs - Date.parse(x.at) < 10_000);
          if (!counted) addSignal(s, me.id, name, where, now);
          return { message: "" };
        }
        case "settings": {
          if (typeof a.digest === "boolean") {
            const p = { ...(s.profiles[me.id] ?? {}) };
            if (a.digest) delete p.digestOff;
            else p.digestOff = true;
            s.profiles[me.id] = p;
            return { message: a.digest ? "The weekly email is on. It goes out when new roles open." : "The weekly email is off. We won't send another one." };
          }
          if (typeof a.messageEmail === "boolean") {
            const p = { ...(s.profiles[me.id] ?? {}) };
            if (a.messageEmail) delete p.messageEmailOff;
            else p.messageEmailOff = true;
            s.profiles[me.id] = p;
            return { message: a.messageEmail ? "We'll email you when a member messages you." : "Message emails are off. New messages still show in Messages." };
          }
          if (typeof a.radar === "boolean") {
            const p = { ...(s.profiles[me.id] ?? {}) };
            if (a.radar) delete p.radarOff;
            else if (!p.radarOff) {
              p.radarOff = true;
              addSignal(s, me.id, "radar_off", "profile", now);
            }
            s.profiles[me.id] = p;
            return {
              message: a.radar
                ? `${YOUR_FEATURE} is on. When a company like your clients moves, you hear about it the next morning.`
                : `${YOUR_FEATURE} is off. We won't send it by email or Slack. ${FEATURE_NAME} in the menu still lists what's new.`,
            };
          }
          if (typeof a.partners === "boolean") {
            const p = { ...(s.profiles[me.id] ?? {}) };
            if (a.partners) delete p.partnersOff;
            else p.partnersOff = true;
            s.profiles[me.id] = p;
            return {
              message: a.partners
                ? "You're listed in Referral partners. Members see your first name, title, function and the kind of clients you want, never your email."
                : "You're hidden from Referral partners. Members you already talk to can still write to you.",
            };
          }
          return { message: "Saved." };
        }
        case "joinedSeen": {
          // The invite loop: the inviter closed the line saying who joined from their invite. It doesn't come back.
          const ids = new Set((Array.isArray(a.ids) ? a.ids : []).slice(0, 50).map((x) => String(x)));
          for (const j of s.inviteJoins ?? []) if (j.by === me.id && j.told && !j.seen && ids.has(pubId(j.invitee))) j.seen = now;
          return { message: "" };
        }
        case "invite": {
          // Invite to connect: the member sent this seat's holder their note and claim link. One record per member and seat.
          const e = g.engagements.get(inId("engagement", a.engagementId));
          if (!e) throw new ActionError(gone("engagement"));
          const sees =
            !hiddenFor(e.companyId) && cellOf(s, me, e, "engagement", "operator", memberIndex(seed, s), freeFor("engagement", e.id, "operator")).s === "value";
          if (!invitable(s, memberIndex(seed, s), me, e, sees)) {
            const op = valueOf(e, s, "operator");
            const holder = op ? seatHolder(s, memberIndex(seed, s), e.id, op) : null;
            throw new ActionError(
              !sees
                ? "Unlock who held this seat first. Then you can invite them."
                : holder?.id === me.id
                  ? "That's your own seat."
                  : holder
                    ? `${firstName(holder.name)} is on Merlin already. Message them from the record instead.`
                    : "This seat has no link to invite its holder with. Find them on LinkedIn instead.",
            );
          }
          const note = cleanNote(a.note);
          s.seatInvites ??= [];
          const cur = s.seatInvites.find((x) => x.by === me.id && x.engagementId === e.id);
          // No second record: the first date stays, and the newest note is what their conversation opens with.
          if (cur) {
            if (note && !cur.claimedBy) cur.note = note;
          } else s.seatInvites.push({ by: me.id, engagementId: e.id, at: now, ...(note ? { note } : {}) });
          return { message: "", id: pubId(e.id) };
        }
        default:
          throw new ActionError(UNKNOWN_ACTION);
      }
    };

    const out = run();
    // Value in the trial's last days (a warm path unlocked: who held a seat or a person's name; an invite sent) extends it once.
    if (billingLive() && (a.type === "invite" || s.ledger.slice(ledgerAt).some((l) => l.memberId === me.id && l.reason === "unlock" && (l.ref.endsWith(".operator") || (l.ref.startsWith("p_") && l.ref.endsWith(".name"))))))
      valueMoment(s, me.id, nowMs);
    if (movedRate && out.message) out.message += " This rate replaces the one you shared privately, which already earned its credit.";
    // A dry run throws, so the batch keeps nothing it wrote (see flush).
    if (opts.dryRun) throw refusal.message ? new ActionError(refusal.message) : new DryRun({ ...out, spent: balBefore - balance(s, me.id) });
    if (refusal.message) return { message: "", refused: refusal.message };
    // The actor's new counts, so the client can update the top bar at once.
    let added = 0;
    let unlocked = 0;
    let holdersUnlocked = 0;
    let companiesUnlocked = 0;
    for (const l of s.ledger) {
      if (l.memberId !== me.id) continue;
      if (l.reason === "fill" && !l.undone) added++;
      else if (l.reason === "unlock") {
        unlocked++;
        if (l.ref.endsWith(".operator")) holdersUnlocked++;
        else if (l.ref.endsWith(".identity")) companiesUnlocked++;
      }
    }
    const { earned, resetsAt } = earning(s, me.id, nowMs);
    return {
      ...out,
      me: {
        ...shownBalance(balance(s, me.id)), earned24h: earned, earnResetsAt: resetsAt, held: heldFor(s, me.id), added, unlocked, holdersUnlocked, companiesUnlocked,
        unlocksLeft: unlockRoom(s, me.id, nowMs).left, sellEarnLeft: Math.max(0, SELL_EARN_MAX - sellToday(s, me.id, nowMs, exemptPick).earned),
      },
    };
  }).catch((e) => {
    if (e instanceof DryRun) return e.result;
    throw e;
  });
  if (out.refused) throw new ActionError(out.refused);
  // A claim through an invite opened a conversation: the inviter hears about it the way they hear about a message (lib/messages.ts).
  const carried = out as { connected?: string };
  if (carried.connected) {
    const id = carried.connected;
    delete carried.connected;
    if (!opts.dryRun) void import("./messages").then((m) => m.afterConnect(id, origin)).catch((e) => console.error("connect notice failed", e));
  }
  // Alerts in Slack: another member unlocked who held a seat, or facts on it.
  if (!opts.dryRun && (a?.type === "unlock" || a?.type === "unlockMany") && out.cells?.length) {
    const cells = out.cells;
    void import("./notify/events").then((n) => n.afterUnlock(token, cells)).catch((e) => console.error("unlock alerts failed", e));
  }
  // The next-client radar: a seat added, an end recorded, a role filled can make a signal Pro members hear about at once.
  if (!opts.dryRun && (a?.type === "fill" || a?.type === "add" || a?.type === "claimSeat"))
    void import("./radar").then((r) => r.afterRadarChange()).catch((e) => console.error("radar instant failed", e));
  return out;
}
/** What a dry run would have done (perform with dryRun). Thrown so the change is dropped. */
class DryRun extends Error {
  constructor(readonly result: ActionResult & { spent: number; refused?: string }) {
    super("dry run");
  }
}

/**
 * Admin export of the runtime state (for backups and audits). Rates shared for the benchmarks
 * only go out without who shared them or which seat they are about: no admin view shows a
 * member's private rate. (The daily snapshots on the data volume keep the full state.)
 *
 * Two more things would link a rate back to its member, so both go: the rows leave in a fixed
 * order (by function, kind and amount, not the order they were shared in, which the ledger
 * mirrors), and the ledger rows for those rates lose the rate's id (their ref reads "bench").
 * Sign-in tokens and emails stay: this file is the only copy off the volume, and a restored
 * member with no token could not get back in. Treat the file like a password list.
 */
export async function exportState(): Promise<Omit<State, "benchRates"> & { benchRates: Pick<StoredBenchRate, "fn" | "kind" | "amount" | "revenue">[] }> {
  const s = await loadState();
  const benchRates = s.benchRates
    .map(({ fn, kind, amount, revenue }) => ({ fn, kind, amount, revenue }))
    .sort((a, b) => a.fn.localeCompare(b.fn) || a.kind.localeCompare(b.kind) || a.amount - b.amount || (a.revenue ?? "").localeCompare(b.revenue ?? ""));
  // Admins never read members' conversations: they leave without their texts (the volume's daily
  // snapshots keep them). One-time sign-in links are short-lived and stay behind.
  const { signins: _signins, ...rest } = s; // eslint-disable-line @typescript-eslint/no-unused-vars
  const conversations = s.conversations?.map((c) => ({ ...c, messages: c.messages.map((m) => ({ ...m, text: "" })) }));
  // An invite's note is a message a member wrote: it leaves without its text too.
  const seatInvites = s.seatInvites?.map(({ note: _note, ...x }) => x); // eslint-disable-line @typescript-eslint/no-unused-vars
  // Webhook URLs are secrets (anyone with one can post to that Slack channel): they leave as "connected" only, with no alerts waiting.
  const integrations = s.integrations && {
    ...s.integrations,
    members: Object.fromEntries(
      Object.entries(s.integrations.members).map(([id, m]) => [id, { ...m, pending: {}, ...(m.slack ? { slack: { ...m.slack, url: "" } } : {}), ...(m.webhook ? { webhook: { ...m.webhook, url: "" } } : {}) }]),
    ),
  };
  return {
    ...rest,
    ...(conversations ? { conversations } : {}),
    ...(seatInvites ? { seatInvites } : {}),
    ...(integrations ? { integrations } : {}),
    ledger: s.ledger.map((l) => (l.ref.startsWith("bench.") ? { ...l, ref: "bench" } : l)),
    benchRates,
  };
}

/**
 * The parts of this file that lib/messages.ts and lib/signin.ts build on. They change the state
 * only through `mutate` (one writer, in order), and read it through the same helpers the view uses.
 */
export const tableInternals = {
  mutate, graph, memberIndex, seatHolder, signedIn, valueOf, live, cellOf, identityHidden, tracksOf, pubId, inboxKey, firstName, ID_KEY,
  // Alerts (lib/notify/events.ts) match new open roles the way the weekly email does.
  fnOf, hqRegion, isOpenRole, friendliness,
  // A role's country and region (lib/geo.ts), and the firms kept for review, as digestList reads them.
  geoOf, firmsInReview,
  // Plans (lib/billing): the value moment that extends a trial, the saved views Free alerts on, Free's limits, the member's opaque billing ref.
  valueMoment, alertViewsOf, freeNow, billingRef, balance, grantPlanCredits,
  // The next-client radar (lib/radar) reads hires and open roles the way the table does, and records its product signals.
  belowLead, offBarRole, isUnseen, addSignal,
};

/* ---------- claim links (/claim/<token>) and Remove my name ---------- */

/** A graph's seat ids, kept with it, so seatForToken builds its index once per graph. */
const seatIdLists = new WeakMap<Graph, string[]>();
function seatIdsOf(g: Graph): string[] {
  let l = seatIdLists.get(g);
  if (!l) seatIdLists.set(g, (l = [...g.engagements.keys()]));
  return l;
}
/** The internal id of the seat a claim token names, or null. */
async function seatOfToken(token: unknown): Promise<string | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  return seatForToken(token, seatIdsOf(viewGraph(seed, s)));
}
/** A seat's claim link path (/claim/<token>), from its public id, or null without the seed key. For pages and tools that offer the link (Invite to connect). */
export async function claimPathFor(engagementPubId: string): Promise<string | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const id = [...viewGraph(seed, s).engagements.keys()].find((x) => pubId(x) === engagementPubId);
  const t = id ? claimToken(id) : "";
  return t ? `/claim/${t}` : null;
}

/**
 * What a claim link's page shows. `status`: invalid (no seat has this token), open (a seat
 * Revenue Nomad found that no member claimed: nobody named, or a name from public profiles),
 * held (a member holds it, or a name that isn't from public profiles is on it), yours (the
 * signed-in member holds it), waiting (their claim on it waits for an admin), signin (a member
 * holds it who has never signed in, and the visitor is signed out: the page asks them to sign in,
 * which is how a member invited to connect gets in). `seat` is free facts only: the role (it is the
 * person's own seat), the function, the start month and the company, which is null while it is
 * locked by an open role. `named`: a name from public profiles is on it (Remove my name applies).
 * Never a person's name.
 */
export interface ClaimPage {
  status: "invalid" | "open" | "held" | "yours" | "waiting" | "signin";
  seat: { role: string | null; fn: string | null; company: string | null; start: string | null; named: boolean } | null;
  me: { first: string } | null;
  /** Sign-in links go by email (an email provider is set up). */
  email: boolean;
  /** The first name of the member whose invite code came with the link (?ref=), or null. */
  inviter: string | null;
}
export async function claimPage(token: unknown, memberToken: string | null, ref?: unknown): Promise<ClaimPage> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, memberToken, s);
  const g = viewGraph(seed, s);
  const id = seatForToken(token, seatIdsOf(g));
  const e = id ? g.engagements.get(id) : undefined;
  const base = { me: me ? { first: firstName(me.name) } : null, email: emailEnabled(), inviter: await inviterName(ref).catch(() => null) };
  if (!e) return { ...base, status: "invalid", seat: null };
  const idx = memberIndex(seed, s);
  const tracks = tracksOf(seed, s);
  const op = valueOf(e, s, "operator");
  const holder = seatHolder(s, idx, e.id, op);
  const status: ClaimPage["status"] =
    me && holder?.id === me.id
      ? "yours"
      : me && pendingClaimers(s, e.id).includes(me.id)
        ? "waiting"
        : e.source === SEAT_SCAN && (!op || publicName(e, s))
          ? "open"
          : !me && holder && !signedIn(s, idx, holder.id)
            ? "signin"
            : "held";
  // A signed-in member sees the company only when it isn't locked for them (identityHidden: every company is, until they know it).
  // A visitor with the link (the seat's holder, in the main) sees it unless it has an open role.
  const locked = me ? identityHidden(g, s, idx, tracks, me, e.companyId) : [...g.engagements.values()].some((x) => x.companyId === e.companyId && hidesCompany(x, s, tracks));
  const mine = status !== "held";
  return {
    ...base,
    status,
    seat: {
      role: mine ? live(e, s, "role") : null,
      fn: fnOf(e, s),
      company: locked ? null : g.companies.get(e.companyId)?.name ?? null,
      start: live(e, s, "start"),
      named: !!publicName(e, s) || !!seedPublicName(seed, s, e.id),
    },
  };
}

/**
 * "Claim it" on a claim link: the signed-in member claims the seat it names (claimSeat, with the name rule), at a locked company too.
 * `waiting`: the name on the seat isn't theirs, so the claim waits for an admin and the seat isn't theirs yet.
 * `ref`: the invite code that came with the link. A claim through it connects the member with whoever
 * sent it (connectInvite: the invite bonus and a conversation). A seat that is theirs already (they
 * claimed it before, or it was on file under their name and they just signed in through the link)
 * has nothing to claim, and the link still connects them, with no bonus: the claim didn't come through it.
 */
export async function claimByToken(memberToken: string | null, token: unknown, origin?: string, ref?: unknown): Promise<ActionResult & { waiting: boolean }> {
  const id = await seatOfToken(token);
  if (!id) throw new ActionError("That claim link didn't work. It may be cut short. Open the whole link from the message.");
  const code = typeof ref === "string" ? ref.trim().slice(0, 40) : "";
  {
    const [seed, s] = await Promise.all([loadSeed(), loadState()]);
    const me = memberByToken(seed, memberToken, s);
    const g = viewGraph(seed, s);
    if (me && seatHolder(s, memberIndex(seed, s), id, valueOf(g.engagements.get(id), s, "operator"))?.id === me.id) {
      const link = code
        ? await mutate((d, sd) => {
            const who = memberByToken(sd, memberToken, d);
            const inviter = memberByInviteCode(sd, d, code);
            return who && inviter ? connectInvite(d, sd, graph(sd, d), who, id, inviter.id, new Date().toISOString(), false) : null;
          })
        : null;
      if (link?.conversationId) {
        const cid = link.conversationId;
        void import("./messages").then((m) => m.afterConnect(cid)).catch((e) => console.error("connect notice failed", e));
      }
      return { message: `This seat is yours already.${connectedNote(link)}`, id: pubId(id), waiting: false };
    }
  }
  const out = await perform(memberToken, { type: "claimSeat", engagementId: pubId(id) }, origin, { claimLink: true, ...(code ? { ref: code } : {}) });
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, memberToken, s);
  return { ...out, waiting: !!me && pendingClaimers(s, id).includes(me.id) };
}

/**
 * "Not me" or "Remove my name" on a claim link, no account needed: a name from public profiles on
 * that seat comes off at once, for everyone, and whoever paid to see it gets the credit back. A
 * signed-in member's "Not me" is kept too (an Add of theirs never claims the seat). The answer says
 * what happened: done, or why not (the seat is claimed, there is no name on it, the link is wrong).
 */
export async function nameOffByToken(token: unknown, how: "notme" | "remove", memberToken?: string | null): Promise<{ done: boolean; why?: "invalid" | "held" | "unnamed" }> {
  const id = await seatOfToken(token);
  if (!id) return { done: false, why: "invalid" };
  return mutate((s, seed) => {
    const now = new Date().toISOString();
    const me = memberToken ? memberByToken(seed, memberToken, s) : null;
    if (me && how === "notme" && !(s.notMine[me.id] ?? []).includes(id)) s.notMine[me.id] = [...(s.notMine[me.id] ?? []), id];
    const name = seedPublicName(seed, s, id);
    if (!name) {
      const v = s.values[fkey(id, "operator")];
      return { done: false, why: v && v.status !== "removed" ? ("held" as const) : ("unnamed" as const) };
    }
    takeNameOff(s, id, how, now);
    return { done: true };
  });
}

/**
 * The public Remove my name page: a name and a company. Every name from public profiles on a seat
 * at that company (matched by its name or website, as Add matches companies) that is the same
 * person (sameName) and nobody has verified or claimed comes off at once, with refunds. Returns how
 * many came off. The page answers the same whatever this returns, so it can't be used to look up names.
 */
export async function nameOffByName(nameRaw: unknown, companyRaw: unknown): Promise<number> {
  const name = tidy(nameRaw, 80);
  const company = tidy(companyRaw, 120);
  if (name.length < 3 || company.length < 2) return 0;
  return mutate((s, seed) => {
    const now = new Date().toISOString();
    const g = graph(seed, s);
    const site = siteKey(company);
    const key = keyOfCompany(company);
    const at = new Set([...g.companies.values()].filter((c) => (key && keyOfCompany(c.name) === key) || (site && siteKey(live(c, s, "website")) === site)).map((c) => c.id));
    if (!at.size) return 0;
    let n = 0;
    for (const e of seed.engagements) {
      if (!at.has(e.companyId) || nameVerified(s, e.id)) continue;
      const onFile = seedPublicName(seed, s, e.id);
      if (!onFile || !sameName(onFile, name)) continue;
      takeNameOff(s, e.id, "public", now);
      n++;
    }
    return n;
  });
}

/* ---------- Referral partners (app/post/Partners.tsx) ---------- */

/** A line on Referral partners needs this many companies behind it, and members' answers this many members. */
export const PARTNERS_MIN = 20;
/** Members the page lists at most (most relevant first). */
const PARTNER_MEMBERS_MAX = 60;
/** A start month as "YYYY-MM": a year alone counts as that year's December. Null when it isn't a date. */
const startMonth = (v: string | null) => (v && /^\d{4}-\d{2}$/.test(v) ? v : v && /^\d{4}$/.test(v) ? `${v}-12` : null);
/** A function a member works in, for these counts: "Other" names none. */
const workFn = (f: string | null | undefined) => (f && f !== "Other" ? f : null);
/**
 * What the member said usually gets hired before them (Member profile field `before`, contract 3,
 * stored by onboarding and Your profile): up to 3 functions, [] for "Not sure", null when never asked.
 */
function beforeOf(p: Profile | undefined): string[] | null {
  const b = (p as { before?: unknown } | undefined)?.before;
  return Array.isArray(b) ? b.filter((x): x is string => typeof x === "string" && FUNCTIONS.includes(x)).slice(0, 3) : null;
}

/**
 * GET /api/table?partners=1, for a signed-in member (null otherwise). Three parts:
 *  - order: at each company, the first dated fractional seat in the member's function against the
 *    first in every other function (leadership hires only, as Recently hired counts them: not open
 *    roles, not Full-time, not a posting that came down with nobody named, not a seat whose title
 *    reads below Lead; a year-only start is its December). A line shows once PARTNERS_MIN
 *    companies back it.
 *  - answers: members in the member's function who said which fractional usually gets hired before
 *    them (`before`), as counts, once PARTNERS_MIN of them answered.
 *  - members: everyone signed in who hasn't turned "Show me in Referral partners" off, but the
 *    member and anyone either of them blocked. First name, title, function and ideal clients, never
 *    an email. Other functions first, then the most overlap with the member's ideal clients, then
 *    the most recently seen.
 */
export async function partnersView(token: string | null): Promise<PartnersView | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) return null;
  const g = viewGraph(seed, s);
  const idx = memberIndex(seed, s);
  const tracks = tracksOf(seed, s);
  const fnFor = (m: Member) => workFn(s.profiles[m.id]?.function ?? functionOf(s.profiles[m.id]?.title || m.title));
  const fn = fnFor(me);

  // The order: each company's first dated fractional seat in each function.
  const firms = firmsInReview(seed, s);
  const firsts = new Map<string, Map<string, string>>();
  for (const e of g.engagements.values()) {
    if (firms.has(e.companyId) || isOpenRole(e, s, tracks)) continue;
    if (e.source === "Demand scan" && !live(e, s, "operator")) continue;
    const type = live(e, s, "type");
    if (type && !FRACTIONAL_TYPES.includes(type)) continue;
    // A Finance Manager or a Content Engineer is no fractional leader: not a hire before or after anyone here.
    if (belowLead(live(e, s, "role"))) continue;
    const f = workFn(fnOf(e, s));
    const m = startMonth(live(e, s, "start"));
    if (!f || !m) continue;
    const at = firsts.get(e.companyId) ?? new Map<string, string>();
    if (!at.has(f) || at.get(f)! > m) at.set(f, m);
    firsts.set(e.companyId, at);
  }
  const before = new Map<string, number>();
  const after = new Map<string, number>();
  let companies = 0;
  if (fn)
    for (const at of firsts.values()) {
      const mine = at.get(fn);
      if (!mine || at.size < 2) continue;
      companies++;
      for (const [f, m] of at) {
        if (f === fn) continue;
        if (m < mine) before.set(f, (before.get(f) ?? 0) + 1);
        else if (m > mine) after.set(f, (after.get(f) ?? 0) + 1);
      }
    }
  const order: PartnersView["order"] = [
    ...[...before].map(([f, n]) => ({ fn: f, when: "before" as const, companies: n })),
    ...[...after].map(([f, n]) => ({ fn: f, when: "after" as const, companies: n })),
  ]
    .filter((x) => x.companies >= PARTNERS_MIN)
    .sort((a, b) => b.companies - a.companies || a.fn.localeCompare(b.fn));

  // Members' answers, counts only.
  let answered = 0;
  const named = new Map<string, number>();
  if (fn)
    for (const m of idx.all) {
      const b = beforeOf(s.profiles[m.id]);
      if (!b || fnFor(m) !== fn) continue;
      answered++;
      for (const f of new Set(b)) if (f !== fn) named.set(f, (named.get(f) ?? 0) + 1);
    }
  const answers =
    answered >= PARTNERS_MIN ? { n: answered, fns: [...named].map(([f, n]) => ({ fn: f, n })).sort((a, b) => b.n - a.n || a.fn.localeCompare(b.fn)) } : null;

  // The members.
  const blocks = (a: string, b: string) => (s.blocks?.[a] ?? []).includes(b);
  const lastWith = new Map<string, { id: string; at: string }>();
  for (const c of s.conversations ?? []) {
    const other = c.a === me.id ? c.b : c.b === me.id ? c.a : null;
    if (!other) continue;
    const at = c.messages[c.messages.length - 1]?.at ?? c.createdAt;
    if (!lastWith.has(other) || lastWith.get(other)!.at < at) lastWith.set(other, { id: c.id, at });
  }
  const mine = s.profiles[me.id]?.icp ?? null;
  const overlap = (icp: Icp | null | undefined) => {
    if (!icp || !mine) return 0;
    const both = (x: string[], y: string[]) => x.filter((v) => y.includes(v)).length;
    return both(icp.industries, mine.industries) * 3 + both(icp.employees, mine.employees) * 2 + both(icp.revenue, mine.revenue) + both(icp.countries, mine.countries);
  };
  const listed = idx.all
    .filter((m) => m.id !== me.id && signedIn(s, idx, m.id) && !s.profiles[m.id]?.partnersOff && !blocks(m.id, me.id) && !blocks(me.id, m.id))
    .map((m) => ({ m, fn: fnFor(m), icp: s.profiles[m.id]?.icp ?? null }))
    .sort(
      (a, b) =>
        Number(!!fn && a.fn === fn) - Number(!!fn && b.fn === fn) ||
        overlap(b.icp) - overlap(a.icp) ||
        (s.seen[b.m.id] ?? "").localeCompare(s.seen[a.m.id] ?? "") ||
        a.m.name.localeCompare(b.m.name),
    );
  const members = listed.slice(0, PARTNER_MEMBERS_MAX).map(({ m, fn: f, icp }) => {
    const title = (s.profiles[m.id]?.title || (m.title === "Member" ? "" : m.title) || "").trim();
    const conv = lastWith.get(m.id);
    return { id: pubId(m.id), first: firstName(m.name), title, fn: f, icp, ...(conv ? { conversationId: conv.id } : {}) };
  });
  return { fn, order, companies, min: PARTNERS_MIN, answers, members, total: listed.length, listed: !s.profiles[me.id]?.partnersOff, titles: partnerTitles(g, s, tracks, idx, me, fn, mine) };
}

/**
 * "Partners at your kind of clients" reads people first: each card leads with the title of the
 * seat while the name stays locked. In the table, the record and the connector a seat's role
 * still sells with who held it (SEAT_BUNDLE); only this page shows it ahead of the unlock, and
 * only the title: never the name, the company, an email or a link (partnerTitle). Seats are the
 * ones the page can list: a named holder, not an open role, not Full-time, outside the viewer's
 * function, at companies the viewer's Ideal Fractional Profile doesn't rule out (a known part
 * that conflicts), and not already open to the viewer (they paid, or it is their seat). Keyed by
 * the seat's public id.
 */
function partnerTitles(g: Graph, s: State, tracks: Tracks, idx: MemberIndex, me: Member, fn: string | null, icp: Icp | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!icp || !(icp.industries.length || icp.employees.length || icp.revenue.length || icp.countries.length)) return out;
  // The table's own test (icpTest in app/post/model.ts) on what is on file, kept loose: only a known part that conflicts rules a company out.
  const lower = (v: string) => v.trim().toLowerCase();
  const country = (v: string) => {
    const k = lower(v).replace(/\./g, "");
    return k === "us" || k === "usa" || k === "united states of america" ? "united states" : k === "uk" ? "united kingdom" : k;
  };
  const conflicts = (want: string[], have: string | null, key: (v: string) => string) => !!want.length && !!have && !want.some((w) => key(w) === key(have));
  const fitsAt = new Map<string, boolean>();
  const fits = (c: Node) => {
    let ok = fitsAt.get(c.id);
    if (ok === undefined) {
      ok =
        !conflicts(icp.industries, live(c, s, "industry"), lower) &&
        !conflicts(icp.employees, live(c, s, "employees"), (v) => v) &&
        !conflicts(icp.revenue, live(c, s, "revenue"), (v) => v) &&
        !conflicts(icp.countries, geoOf(c, s).country, country);
      fitsAt.set(c.id, ok);
    }
    return ok;
  };
  for (const e of g.engagements.values()) {
    if (!seatBundled(e, s) || isOpenRole(e, s, tracks)) continue;
    if (live(e, s, "type") === "Full-time") continue;
    const f = workFn(fnOf(e, s));
    if (!f || f === fn) continue;
    const c = g.companies.get(e.companyId);
    if (!c || !fits(c)) continue;
    const rv = valueOf(e, s, "role");
    if (!rv || rv.status !== "live" || rv.reporters?.includes(me.id)) continue;
    const opv = valueOf(e, s, "operator")!;
    if (seatHolder(s, idx, e.id, opv)?.id === me.id) continue;
    if (SEAT_BUNDLE.some((k) => (s.unlocks[fkey(e.id, k)] ?? []).includes(me.id))) continue;
    const t = partnerTitle(rv.value, opv.value, c.name, live(c, s, "website") ?? null);
    if (t) out[pubId(e.id)] = t;
  }
  return out;
}

/**
 * A seat's title fit to show before its holder is unlocked: without the company's name or site
 * (titleWithout), and nothing at all when it holds any part of the holder's name, an email, a
 * link or a handle (the card then reads "Fractional <function> leader"). Null when nothing is left.
 */
export function partnerTitle(role: string, holder: string, company: string, site: string | null): string | null {
  const t = titleWithout(role, company, site, "").trim();
  if (!t || t.length > 80) return null;
  if (/@|https?:|www\.|\.(?:com|io|co|net|org|ai)\b|linkedin|\/in\//i.test(t)) return null;
  const words = holder
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 2);
  const tw = new Set(t.toLowerCase().split(/[^\p{L}\p{N}]+/u));
  if (words.some((w) => tw.has(w))) return null;
  // A name typed without spaces ("JaneSmith") or run into the title.
  const flat = t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  if (words.some((w) => w.length >= 4 && flat.includes(w))) return null;
  return t;
}

/* ---------- last seen ---------- */

const SEEN_EVERY = 6 * 60 * 60 * 1000;
const seenAt = new Map<string, number>();

/** Networks being written right now (member id and hash), so a burst of requests queues one write. */
const ipWriting = new Set<string>();

/**
 * Record a member's visit (for the pilot's active counts) and the network it came from (for
 * the invite rule, see State.ips). The visit is written at most once per 6 hours per member.
 * A network that is not on the member's list yet is written at once; one already there moves
 * to the newest place with the next visit write.
 */
export async function touch(token: string | null | undefined, ip?: string): Promise<void> {
  if (!token) return;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) return;
  const now = Date.now();
  const last = seenAt.get(me.id) ?? Date.parse(s.seen[me.id] ?? "");
  const due = !(Number.isFinite(last) && now - last < SEEN_EVERY);
  const hash = ip ? ipHashOf(ip) : null;
  const key = `${me.id}:${hash}`;
  const newIp = !!hash && !(s.ips?.[me.id] ?? []).includes(hash) && !ipWriting.has(key);
  // The invite loop: an invitee's first time signed in starts the short wait before their inviter is told (announceJoin).
  const firstIn = !!s.inviteJoins?.some((x) => x.invitee === me.id && !x.in && !x.told && !x.skip);
  if (!due && !newIp && !firstIn) return scheduleJoins(s, me.id);
  if (due) seenAt.set(me.id, now);
  if (newIp) ipWriting.add(key);
  try {
    await mutate((d) => {
      if (due) d.seen[me.id] = new Date(now).toISOString();
      if (hash) keepIp(d, me.id, hash);
      const j = firstIn ? d.inviteJoins?.find((x) => x.invitee === me.id && !x.in) : undefined;
      if (j) j.in = new Date(now).toISOString();
    });
  } finally {
    if (newIp) ipWriting.delete(key);
  }
  scheduleJoins(await loadState(), me.id);
}

/* ---------- plans and payments (lib/plan.ts, lib/billing) ---------- */

/** A member's plan record, as stored (undefined: Free, or billing never ran). */
const planRec = (s: State, memberId: string): PlanRecord | undefined => s.billing?.members[memberId];
/** Free's limits apply to this member now. Never while billing isn't live: then nothing is gated. */
function freeNow(s: State, memberId: string, nowMs = Date.now()): boolean {
  return gated(planRec(s, memberId), nowMs);
}
/** Start the reverse trial for an onboarded member who has had none (and never paid). Changes the draft; true when it started. */
function startTrialIn(s: State, memberId: string, nowMs: number): boolean {
  if (!billingLive() || !s.profiles[memberId]?.onboarded) return false;
  const t = startTrial(planRec(s, memberId), nowMs);
  if (!t) return false;
  s.billing ??= emptyBilling();
  s.billing.members[memberId] = t;
  return true;
}
/** Value happened: a conversation opened, a warm path unlocked, an invite sent. In the trial's last 4 days it runs 7 longer, once. */
function valueMoment(s: State, memberId: string, nowMs: number): boolean {
  return billingLive() && extendTrial(planRec(s, memberId), nowMs);
}
/** The saved views a member's alerts and weekly email use: on Free the first one only (the rest stay saved and open in the app). */
function alertViewsOf<T>(s: State, memberId: string, list: T[], nowMs = Date.now()): T[] {
  return list.length > FREE_SAVED_VIEWS && freeNow(s, memberId, nowMs) ? list.slice(0, FREE_SAVED_VIEWS) : list;
}
/** Said when Free's one saved view is taken. The app opens the plans instead of sending it; this is the server's word. */
export const SAVED_VIEW_FREE = "On Free you keep 1 saved view. Pro watches as many markets as you want, with alerts as soon as roles open.";
/** The benchmarks on Free: the median by function, no middle half and no client-size rows. */
function freeBenchmarks(b: Benchmarks): Benchmarks {
  const median = ({ p25: _p25, p75: _p75, ...rest }: RateStat): RateStat => rest;
  return { ...b, limited: true, rows: b.rows.filter((r) => r.revenue === "All").map((r) => ({ ...r, monthly: median(r.monthly), hourly: median(r.hourly) })) };
}
/** The member's own rate for the annual line: their newest rate shared for the benchmarks, else one they put on a record. */
function ownRate(s: State, memberId: string): { kind: "monthly" | "hourly"; amount: number } | null {
  const mine = s.benchRates.filter((b) => b.by === memberId).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (mine) return { kind: mine.kind, amount: mine.amount };
  for (const [k, v] of Object.entries(s.values)) {
    if (v.by !== memberId || v.status !== "live" || !k.endsWith(".rate")) continue;
    const r = readRate(v.value, s.values[`${k.slice(0, -5)}.pricing`]?.value ?? null);
    if (r) return r;
  }
  return null;
}
/** Me.plan: what the Plan and billing page, the banner and the upgrade moments read. */
function planView(s: State, memberId: string, nowMs: number): PlanView {
  const rec = planRec(s, memberId);
  const name = planOf(rec, nowMs);
  const prof = s.profiles[memberId] ?? {};
  const ending = trialEnding(rec, nowMs);
  const free = name === "free";
  const pause = pauseState(rec, nowMs);
  return {
    name,
    trialEndsAt: rec?.trialEndsAt ?? null,
    trialDaysLeft: trialDaysLeft(rec, nowMs),
    trialExtended: !!rec?.trialExtended,
    hadTrial: !!rec?.trialStartedAt,
    ending,
    proUntil: rec?.proUntil ?? null,
    interval: rec?.interval ?? null,
    cancelAt: rec?.cancelAt ?? null,
    pause,
    pausedFrom: pause ? rec?.pausedFrom ?? null : null,
    pausedUntil: pause ? rec?.pausedUntil ?? null : null,
    subscribed: !!rec?.subscriptionId,
    portal: !!rec?.customerId,
    // Pro can be bought any time in the trial; with more than 48 hours left the first charge waits for its end.
    firstChargeAt: keepTrialEnd(rec, nowMs) ? rec!.trialEndsAt! : null,
    proStartsAt: proStartsLater(rec, nowMs) ? rec!.proStartsAt! : null,
    topup: !!process.env.STRIPE_PRICE_TOPUP?.trim(),
    notLooking: prof.looking === false,
    annualLine: annualLine(hourlyOf(ownRate(s, memberId))),
    prices: { month: PRICES.month, year: PRICES.year, topup: PRICES.topup, topupCredits: TOPUP_CREDITS, proCredits: PRO_CREDITS },
    limits: { savedViews: free ? FREE_SAVED_VIEWS : null, claudePerDay: free ? FREE_MCP_PER_DAY : null },
  };
}

/** Pilot metrics' billing panel: counts and money only, never a name. */
function billingStats(s: State, idx: MemberIndex, nowMs: number): NonNullable<AdminStats["billing"]> {
  const recs = s.billing?.members ?? {};
  const month = new Date(nowMs).toISOString().slice(0, 7);
  let trial = 0;
  let pro = 0;
  let paused = 0;
  let trialsEnded = 0;
  let trialsPaid = 0;
  let mrrCents = 0;
  for (const [id, rec] of Object.entries(recs)) {
    if (!idx.byId.has(id)) continue;
    const plan = planOf(rec, nowMs);
    if (plan === "trial") trial++;
    else if (plan === "pro") pro++;
    if (pauseState(rec, nowMs) === "now") paused++;
    // A trial that ended (or that a payment cut short), and whether it turned into a paid plan.
    if (rec.trialEndsAt && (Date.parse(rec.trialEndsAt) <= nowMs || rec.paidSince)) {
      trialsEnded++;
      if (rec.paidSince) trialsPaid++;
    }
    // Recurring revenue from plans that will renew: not set to end, not paused now.
    if (plan === "pro" && rec.subscriptionId && !rec.cancelAt) {
      const cents = rec.cents || (rec.interval === "year" ? PRICES.year : PRICES.month) * 100;
      mrrCents += rec.interval === "year" ? Math.round(cents / 12) : cents;
    }
  }
  const pays = s.billing?.payments ?? [];
  const topups = pays.filter((x) => x.kind === "topup");
  const onboarded = idx.all.filter((m) => s.profiles[m.id]?.onboarded).length;
  return {
    trial,
    pro,
    paused,
    free: Math.max(0, onboarded - trial - pro),
    trialsEnded,
    trialsPaid,
    mrrCents,
    churnMonth: new Set((s.billing?.ended ?? []).filter((x) => x.at.startsWith(month)).map((x) => x.memberId)).size,
    topups: topups.length,
    topupCents: topups.reduce((n, x) => n + x.cents, 0),
    topupsMonth: topups.filter((x) => x.at.startsWith(month)).length,
    paidMonthCents: pays.filter((x) => x.at.startsWith(month)).reduce((n, x) => n + x.cents, 0),
  };
}

/** The member's opaque reference at Stripe: never their id or name, and nothing that leads back without the server's key. */
function billingRef(memberId: string): string {
  return `rn_${createHmac("sha256", ID_KEY).update(`billing:${memberId}`).digest("base64url").slice(0, 24)}`;
}

/** Pro credits for a paid month (one grant per month, each ref once). Changes the draft; returns the credits granted. */
function grantPlanCredits(s: State, memberId: string, nowMs: number): number {
  const ref = dueGrantRef(planRec(s, memberId), nowMs);
  if (!ref || s.ledger.some((l) => l.reason === "plan" && l.ref === ref)) return 0;
  s.ledger.push({ memberId, delta: PRO_CREDITS, reason: "plan", ref, at: new Date(nowMs).toISOString() });
  return PRO_CREDITS;
}
/** Plan credit refs already on the ledger (a read-side shortcut, so a visit doesn't scan the ledger each time). */
const grantedRefs = new Set<string>();
let sweepAt = 0;

/**
 * A visit while billing is live: an onboarded member with no trial yet gets theirs (members who
 * finished onboarding before billing was switched on start it here, on their next visit), and a
 * yearly Pro member gets the month's credits. Writes only when one of those is due. Once an hour
 * at most it also sends the trial notices that are due, in the background (lib/billing/server.ts).
 */
export async function billingVisit(token: string | null | undefined, origin?: string): Promise<void> {
  if (!token || !billingLive()) return;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (me) {
    const nowMs = Date.now();
    const rec = planRec(s, me.id);
    const trial = !!s.profiles[me.id]?.onboarded && !!startTrial(rec, nowMs);
    const ref = dueGrantRef(rec, nowMs);
    let grant = false;
    if (ref && !grantedRefs.has(ref)) {
      if (s.ledger.some((l) => l.reason === "plan" && l.ref === ref)) grantedRefs.add(ref);
      else grant = true;
    }
    if (trial || grant)
      await mutate((d) => {
        startTrialIn(d, me.id, Date.now());
        grantPlanCredits(d, me.id, Date.now());
      });
  }
  if (Date.now() - sweepAt > 60 * 60_000) {
    sweepAt = Date.now();
    void import("./billing/server").then((m) => m.sweep(undefined, origin)).catch((e) => console.error("billing notices failed", e));
  }
}

/** Free's saved views are full: a new one would be one too many (the connector's saved searches ask this). */
export async function savedViewsFull(memberId: string, have: number): Promise<boolean> {
  const s = await loadState();
  return have >= FREE_SAVED_VIEWS && !!s.profiles[memberId]?.onboarded && freeNow(s, memberId);
}
/** The Claude connector's requests a day on this member's plan: FREE_MCP_PER_DAY on Free, null for no extra limit. */
export async function claudePerDay(memberId: string): Promise<number | null> {
  return freeNow(await loadState(), memberId) ? FREE_MCP_PER_DAY : null;
}
/** Slack and webhooks: Free gets the weekly roles post only. Message and seat alerts are Pro's. */
export function alertKindOpen(s: State, memberId: string, kind: string): boolean {
  return kind === "roles" || !freeNow(s, memberId);
}
/** A member's plan by internal id, for lib/radar and anything else that reads a member by id: the record, Pro now, and Free's limits in play. */
export async function planFor(memberId: string): Promise<{ rec: PlanRecord | undefined; pro: boolean; gated: boolean }> {
  const s = await loadState();
  const rec = planRec(s, memberId);
  const nowMs = Date.now();
  return { rec, pro: hasPro(rec, nowMs), gated: gated(rec, nowMs) };
}

/* ---------- the invite loop: a friend joined from your invite ---------- */

/**
 * How long after an invitee is first signed in their inviter is told. From a claim link they sign
 * in first and claim the seat right after, and a claim through the inviter's link tells the
 * inviter already (connectInvite): the wait lets that claim land, so the inviter hears once.
 */
export const JOIN_SETTLE_MS = 15_000;
/** Joins waiting their turn in this process, by invitee: the timer, and when it fires on the process clock (performance.now). */
const joinTimers = new Map<string, { t: ReturnType<typeof setTimeout>; fires: number }>();

/**
 * Give each join on this member (as invitee or as inviter) that is in and not told yet its turn,
 * JOIN_SETTLE_MS after the invitee was first signed in. A restart loses the timers: the next visit
 * of either one sets them again, from the state.
 */
function scheduleJoins(s: State, memberId: string): void {
  for (const j of s.inviteJoins ?? []) {
    if (j.told || j.skip || !j.in || (j.invitee !== memberId && j.by !== memberId)) continue;
    const wait = Math.max(0, Date.parse(j.in) + JOIN_SETTLE_MS - Date.now()) + 200;
    const fires = performance.now() + wait;
    const cur = joinTimers.get(j.invitee);
    if (cur && cur.fires <= fires) continue;
    if (cur) clearTimeout(cur.t);
    const t = setTimeout(() => {
      joinTimers.delete(j.invitee);
      void announceJoin(j.invitee).catch((e) => console.error("join notice failed", e));
    }, wait);
    t.unref?.();
    joinTimers.set(j.invitee, { t, fires });
  }
}

/** What the inviter is told when a fractional joined from their invite (lib/notify/joined.ts). A first name only. */
export interface JoinNews {
  inviterId: string;
  /** The invitee's first name. */
  first: string;
  /** They both get REFERRAL_BONUS when the invitee adds a first fact (the inviter is under REFERRAL_LIMIT). */
  both: boolean;
  at: string;
}

/** Whether a join can be told now: in, settled, not told and not skipped. Read only. */
const joinReady = (j: InviteJoin | undefined, nowMs: number): j is InviteJoin & { in: string } =>
  !!j && !j.told && !j.skip && !!j.in && nowMs - Date.parse(j.in) >= JOIN_SETTLE_MS;

/**
 * Tell the inviter, once, that `inviteeId` joined from their invite: in the app (Me.joined), by
 * email when email is on, and in Slack or a webhook. Only once the invitee is in and
 * JOIN_SETTLE_MS has gone by, and not when they claimed their seat through this inviter's claim
 * link, since Invite to connect told the inviter then. The bonus is promised only while the
 * invitee's is still waiting and the inviter is under REFERRAL_LIMIT. Never the invitee's email.
 */
export async function announceJoin(inviteeId: string): Promise<JoinNews | null> {
  if (!joinReady((await loadState()).inviteJoins?.find((x) => x.invitee === inviteeId), Date.now())) return null;
  const news = await mutate((s, seed): JoinNews | null => {
    const j = (s.inviteJoins ?? []).find((x) => x.invitee === inviteeId);
    const nowMs = Date.now();
    if (!joinReady(j, nowMs)) return null;
    const invitee = s.members.find((m) => m.id === inviteeId);
    const inviter = memberIndex(seed, s).byId.get(j.by);
    if (!invitee || !inviter || invitee.referredBy !== j.by) {
      j.skip = "gone";
      return null;
    }
    if ((s.seatInvites ?? []).some((x) => x.by === j.by && x.claimedBy === inviteeId)) {
      j.skip = "connect";
      return null;
    }
    j.told = new Date(nowMs).toISOString();
    return { inviterId: j.by, first: firstName(invitee.name), both: !s.referralPaid.includes(inviteeId) && inviteesPaid(s, j.by, nowMs) < REFERRAL_LIMIT, at: j.told };
  });
  if (news) await import("./notify/joined").then((n) => n.afterJoin(news)).catch((e) => console.error("join notice failed", e));
  return news;
}

/**
 * The invite loop on a member's own view. `invitedBy`: who invited them, while their invite bonus
 * waits (onboarding's first step says so). `joined`: fractionals who joined from their invite that
 * they haven't closed yet (the last 30 days). First names only.
 */
function inviteLoopFor(s: State, idx: MemberIndex, me: Member, nowMs: number): Pick<Me, "invitedBy" | "joined"> {
  const out: Pick<Me, "invitedBy" | "joined"> = {};
  const self = s.members.find((m) => m.id === me.id);
  const inviter = self?.referredBy && !s.referralPaid.includes(me.id) ? idx.byId.get(self.referredBy) : undefined;
  if (inviter) out.invitedBy = { first: firstName(inviter.name), both: inviteesPaid(s, inviter.id, nowMs) < REFERRAL_LIMIT };
  const mine = (s.inviteJoins ?? []).filter((x) => x.by === me.id && x.told && !x.seen && nowMs - Date.parse(x.told) < 30 * DAY);
  if (mine.length) {
    const under = inviteesPaid(s, me.id, nowMs) < REFERRAL_LIMIT;
    out.joined = mine.flatMap((x) => {
      const m = s.members.find((y) => y.id === x.invitee);
      return m ? [{ id: pubId(m.id), first: firstName(m.name), at: x.told!, both: under && !s.referralPaid.includes(m.id) }] : [];
    });
  }
  return out;
}

/* ---------- the weekly scan: open roles, opened and closed with dates ---------- */

/** A followed role can close once its posting has not been seen for this long … */
const CLOSE_AFTER = 10 * DAY;
/** … and this many clean scans of its own board have missed it. */
const CLOSE_MISSES = 2;
/** Scans closer together than this count as one miss, so running the scan twice in a day closes nothing. */
const MISS_GAP = 12 * 60 * 60 * 1000;
/** Open roles that came with the seed close this long after the seed was built, unless a scan sees them. */
const SEED_ROLE_LIFE = 35 * DAY;
/** Whatever the board's health, nothing stays open this long unseen (as long as some board answered cleanly). */
const STALE_AFTER = 60 * DAY;
/** A board whose clean runs match this many roles or fewer can scan clean at 0 matches (see applyScan). */
const SMALL_BOARD = 2;
/** A board that matched something, but under half its baseline, on every run for this long takes the new count as its baseline. */
const BASELINE_RESET_AFTER = 21 * DAY;
/** A board no run has named for this long is forgotten. */
const BOARD_FORGET_AFTER = 90 * DAY;
const SCAN_MAX_ROLES = 2000;

const squeeze = (raw: unknown, max: number) => tidy(raw, max);
/** "https://www.Acme.com/jobs" -> "acme.com", or null. */
const hostOf = (raw: unknown) => {
  const h = String(raw ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  return /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}$/.test(h) ? h : null;
};
const urlKey = (u: string) => u.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#]+$/, "");

/**
 * The function of a role the scan stores: the board's own label when it is one of the table's
 * functions (FUNCTIONS), else the one its title names (functionOf). A board's Executive or Other
 * gives way to a title that names a function: a Fractional CFO is Finance.
 */
function scanFunction(title: string, boardFn: unknown): string | null {
  const fromTitle = functionOf(title);
  const board = typeof boardFn === "string" && FUNCTIONS.includes(boardFn) ? boardFn : null;
  if (board && !((board === "Executive" || board === "Other") && fromTitle && fromTitle !== board)) return board;
  return fromTitle;
}

/**
 * Open roles the scan filed before it knew the functions outside GTM: a Fractional CFO under
 * Executive, a Fractional Controller or CTO with no function. Each open role the scan follows
 * whose function is empty or Executive, and whose title now names a function outside GTM
 * (Finance, Technology, Operations, People, Legal, Product), gets that one. Only a function from
 * the scan or our records changes (or a gap is filled): one a member set stays. The fact is dated
 * with the role, so the record doesn't read as just updated. Runs on every load of the state and
 * changes nothing the second time. Returns how many roles it changed.
 */
export function remapScanFunctions(s: State, seed: Seed): number {
  const seedEng = new Map(seed.engagements.map((e) => [e.id, e.fields]));
  /** A field as the record reads: a state value wins (a removed one hides the seed's), else the seed's. */
  const read = (id: string, field: string) => {
    const v = s.values[fkey(id, field)];
    if (v) return v.status === "live" ? { value: v.value, by: v.by, at: v.at } : null;
    const sv = seedEng.get(id)?.[field];
    return sv ? { value: sv, by: "seed", at: "" } : null;
  };
  let changed = 0;
  for (const t of buildTracks(seed, s).values()) {
    if (t.closedAt) continue;
    const k = fkey(t.engagementId, "function");
    // A function under review (reported) or removed is left alone.
    if (s.values[k] && s.values[k].status !== "live") continue;
    const cur = read(t.engagementId, "function");
    if (cur && (cur.value !== "Executive" || !isSystem(cur.by))) continue;
    const role = read(t.engagementId, "role");
    const fn = functionOf(role?.value);
    // A GTM title already read as its function (the view fills an empty one from the title): only the functions outside GTM were missing.
    if (!fn || fn === "Executive" || GTM_FUNCTIONS.includes(fn)) continue;
    s.values[k] = { value: fn, by: "scan", at: role?.at || t.firstSeen, status: "live" };
    delete s.verifications[k];
    changed++;
  }
  return changed;
}

/**
 * Store one scan. `found.roles` is every posting that passed the screen, newest first, not only
 * the ones that fit under a cap: a posting seen again stays open (and a closed one reopens)
 * however many there are, and only roles opened for the first time are capped, at `maxNew` a run.
 * A new one gets its company (matched by website, then by name, else added) and an engagement
 * whose facts belong to "scan".
 *
 * Closing takes more than one quiet scan. A board counts as clean on a run only when it answered,
 * matched at least one role, and matched at least half of what it matched on its last clean run
 * (its baseline, which a run that is not clean never changes). An open role closes when its own
 * board has been clean and missed it on 2 scans at least 12 hours apart and it was last listed
 * more than 10 days ago. So an outage, a board that reads but matches nothing, and two scans on
 * one day all close nothing. When a role closes, unlocks of its role, posting and rate (and of its
 * company, if no open role is left there) made after it was last listed are paid back.
 * `nowIso` is the scan's time (tests pass one to move the clock).
 */
export async function applyScan(found: ScanCollectResult, nowIso?: string, maxNew: number = MAX_ROLES): Promise<ScanApplyResult> {
  const res = await storeScan(found, nowIso, maxNew);
  // Alerts in Slack for the roles this scan opened, and the week's new hires for saved views that follow them, so this
  // runs after every scan (lib/notify, loaded here so the files don't import each other at start). Nothing is sent when neither has news.
  void import("./notify/events").then((n) => n.afterScan(res.at)).catch((e) => console.error("scan alerts failed", e));
  // The next-client radar: Pro members get the signals this scan made in the next alert batch (nothing while billing is off).
  void import("./radar").then((r) => r.afterRadarChange()).catch((e) => console.error("radar instant failed", e));
  return res;
}
function storeScan(found: ScanCollectResult, nowIso: string | undefined, maxNew: number): Promise<ScanApplyResult> {
  return mutate((s, seed): ScanApplyResult => {
    const now = iso(nowIso, new Date().toISOString());
    const nowMs = Date.parse(now);
    const g = graph(seed, s);
    keepSeedTracks(seed, s);
    const roles = s.scan.roles;
    const okBefore = lastOkOf(s.scan);
    const res: ScanApplyResult = { at: now, opened: 0, stillOpen: 0, closed: 0, reopened: 0, companiesAdded: 0 };
    let overCap = 0;
    let refunded = 0;

    const keyOfEng = new Map<string, string>();
    const keyOfUrl = new Map<string, string>();
    for (const [k, r] of Object.entries(roles)) {
      keyOfEng.set(r.engagementId, k);
      for (const u of [r.url, ...(r.urls ?? [])]) if (u && !keyOfUrl.has(urlKey(u))) keyOfUrl.set(urlKey(u), k);
    }
    const byHost = new Map<string, CompanyNode>();
    const byName = new Map<string, CompanyNode>();
    for (const c of g.companies.values()) {
      const h = siteKey(live(c, s, "website"));
      if (h && !byHost.has(h)) byHost.set(h, c);
      const nk = keyOfCompany(c.name);
      if (nk && !byName.has(nk)) byName.set(nk, c);
    }
    const engsAt = new Map<string, EngNode[]>();
    for (const e of g.engagements.values()) engsAt.set(e.companyId, [...(engsAt.get(e.companyId) ?? []), e]);

    const def = (k: string) => fieldDef("engagement", k)!;
    const put = (id: string, field: string, value: string) => {
      const k = fkey(id, field);
      if (s.values[k]?.value !== value) delete s.verifications[k]; // confirmations were for the old value
      s.values[k] = { value, by: "scan", at: now, status: "live" };
    };
    const roleSlug = (e: Node) => textKey(live(e, s, "role") ?? "");
    const openNow = (e: EngNode) => {
      const k = keyOfEng.get(e.id);
      if (k) return !roles[k].closedAt; // a followed role: its track decides (see isOpenRole)
      const status = live(e, s, "status");
      return status ? status === "Open role" : e.source === "Demand scan";
    };
    const trusted = trustOf(seed, s);
    /** The seat is taken by a claim that counts: a member picked themselves, on an account that counts. */
    const claimed = (engId: string) => selfHeld(s, engId) && trusted(s.values[fkey(engId, "operator")].memberId!);

    const seen = new Set<string>();
    for (const raw of (Array.isArray(found?.roles) ? found.roles : []).slice(0, SCAN_MAX_ROLES)) {
      const company = squeeze(raw?.company, 80);
      const title = squeeze(raw?.title, 120);
      // Compared by key. A name or a title with no letter or digit has an empty key, which would match every other one.
      const coKey = keyOfCompany(company);
      const titleKey = textKey(title);
      if (company.length < 2 || title.length < 2 || !coKey || !titleKey || company.toLowerCase() === HIDDEN_COMPANY.toLowerCase() || placeholderName(company)) continue;
      // A link too long to store whole loses its query string (tracking codes) rather than its end.
      const cleanUrl = (u: unknown) => cleanValue(def("posting"), String(u ?? "").trim()).value ?? "";
      /** Every link this role was listed under (the same role on two boards, see dedupeRoles), the shown one first. */
      const links = keepLinks([raw.url, ...(Array.isArray(raw.urls) ? raw.urls.slice(0, 8) : [])].map(cleanUrl));
      let url = links[0] ?? "";
      const source = squeeze(raw.source, 60) || "scan";
      const key = squeeze(raw.key, 200) || `${coKey}:${titleKey}`;
      // A board's link to a host many companies share (a LinkedIn page) names no company by its host.
      const domain = siteKey(raw.domain) === hostOf(raw.domain) ? hostOf(raw.domain) : null;
      let co = (domain ? byHost.get(domain) : undefined) ?? byName.get(coKey);
      // A fractional firm, agency or marketplace posting a role is not a client (lib/firms.ts): the scan leaves it out.
      if (companyFirm(company)) {
        res.firms = (res.firms ?? 0) + 1;
        continue;
      }
      // The link to show: the company's own site or ATS before a board that copied it.
      const site = domain ?? (co ? hostOf(live(co, s, "website")) : null);
      url = bestPosting(links, site) ?? url;

      // The same posting: by its key, by any of its links, or the same title on a followed role at that company:
      // the same once arrangement words and tails are set aside (sameRoleTitle), in the same function, an open one first.
      let k = roles[key] ? key : links.map((u) => keyOfUrl.get(urlKey(u))).find(Boolean);
      if (!k && co) {
        const fn = scanFunction(title, raw.function);
        const followed = (engsAt.get(co.id) ?? []).filter((e) => keyOfEng.has(e.id));
        const same =
          followed.find((e) => roleSlug(e) === titleKey) ??
          followed
            .filter((e) => sameRoleTitle(live(e, s, "role"), title) && (!fn || !live(e, s, "function") || live(e, s, "function") === fn))
            .sort((a, b) => Number(!!roles[keyOfEng.get(a.id)!].closedAt) - Number(!!roles[keyOfEng.get(b.id)!].closedAt))[0];
        if (same) k = keyOfEng.get(same.id);
      }
      if (k && !g.engagements.has(roles[k].engagementId)) {
        delete roles[k]; // its record is gone (the seed was rebuilt)
        k = undefined;
      }
      if (k) {
        if (seen.has(k)) continue; // the same role on two boards
        seen.add(k);
        const r = roles[k];
        r.lastSeen = now;
        r.source = source;
        if (url) r.url = url;
        const all = keepLinks([r.url, ...(r.urls ?? []), ...links]);
        if (all.length > 1) r.urls = all;
        for (const u of all) if (!keyOfUrl.has(urlKey(u))) keyOfUrl.set(urlKey(u), k);
        // The Job posting link moves to the company's own site or ATS when a listing gives one and the link on file is a board's.
        const posting = valueOf(g.engagements.get(r.engagementId), s, "posting");
        if (posting && posting.status === "live" && isSystem(posting.by)) {
          const better = bestPosting([posting.value, ...all], site);
          if (better && postingRank(better, site) < postingRank(posting.value, site)) put(r.engagementId, "posting", better);
        }
        delete r.misses;
        delete r.missAt;
        delete r.absentAt;
        if (!r.postedAt && raw.postedAt) r.postedAt = iso(raw.postedAt, "") || null;
        if (!r.closedAt) {
          res.stillOpen++;
          // A listed role is an open role, whatever status a member wrote on it.
          const st = valueOf(g.engagements.get(r.engagementId), s, "status");
          if (!st || st.value !== "Open role" || !isSystem(st.by)) put(r.engagementId, "status", "Open role");
        } else if (r.closedBy === "filled") {
          // A role a member took stays filled while its posting lingers. It reopens when nobody
          // holds the seat any more (the same rule a removal or "This isn't me" follows), or when
          // the claim came from an account that does not count (see trustOf).
          if (reopenIfUnheld(s, r.engagementId, now) || (!claimed(r.engagementId) && reopenFilled(s, r.engagementId, now))) res.reopened++;
        } else if (!claimed(r.engagementId)) {
          // Listed again after its posting had come down: reopen, unless a member has since
          // taken the seat as their own (a posting that lingers, or one a board bumped).
          r.closedAt = null;
          delete r.closedBy;
          put(r.engagementId, "status", "Open role");
          res.reopened++;
        }
        continue;
      }

      // New to us. Outside GTM, only Director and above (lib/seniority.ts): a role below that is left out.
      if (!keepsNonGtm(title, typeof raw.function === "string" ? raw.function : null)) {
        res.belowBar = (res.belowBar ?? 0) + 1;
        continue;
      }
      // Only new roles are capped: the newest come first, the rest wait for a later run.
      if (res.opened >= maxNew) {
        overCap++;
        continue;
      }
      if (!co) {
        const id = newId("c", company);
        s.companies.push({ id, name: company, by: "scan", at: now });
        co = { id, seedFields: { name: company }, name: company };
        g.companies.set(id, co);
        byName.set(coKey, co);
        res.companiesAdded++;
      }
      if (domain && !valueOf(co, s, "website")) {
        put(co.id, "website", domain);
        if (!byHost.has(domain)) byHost.set(domain, co);
      }
      // An open role a member already added under this title becomes the followed one. Its status is
      // the scan's from now on (below), so the member who added it can't close it by editing that.
      let e = (engsAt.get(co.id) ?? []).find((x) => !keyOfEng.has(x.id) && openNow(x) && roleSlug(x) === titleKey);
      const adopted = !!e;
      if (!e) {
        const id = newId("e", company);
        s.engagements.push({ id, companyId: co.id, by: "scan", at: now, source: "Demand scan" });
        e = { id, seedFields: { source: "Demand scan" }, companyId: co.id, verified: false, source: "Demand scan" };
        g.engagements.set(id, e);
        engsAt.set(co.id, [...(engsAt.get(co.id) ?? []), e]);
      }
      const eng = e;
      /** Fill a gap with what the posting says. Whatever is already on the record stays. */
      const fill = (field: string, value: unknown) => {
        if (value === null || value === undefined || value === "" || valueOf(eng, s, field)) return;
        const clean = cleanValue(def(field), value).value;
        if (clean) put(eng.id, field, clean);
      };
      fill("role", title);
      fill("function", scanFunction(title, raw.function));
      fill("type", raw.type && ENGAGEMENT_TYPES.includes(raw.type) ? raw.type : /\binterim\b/i.test(title) ? "Interim" : /\bfractional\b/i.test(title) ? "Fractional" : null);
      if (adopted) put(eng.id, "status", "Open role");
      else fill("status", "Open role");
      fill("posting", url);
      fill("rate", raw.rate);
      const hours = Math.round(Number(raw.hoursPerWeek));
      if (hours >= 1 && hours <= 80) fill("hours", String(hours));
      roles[key] = { engagementId: eng.id, companyId: co.id, firstSeen: now, lastSeen: now, closedAt: null, url, source, postedAt: raw.postedAt ? iso(raw.postedAt, "") || null : null };
      if (links.length > 1) roles[key].urls = keepLinks([url, ...links]);
      keyOfEng.set(eng.id, key);
      for (const u of [url, ...links]) if (u && !keyOfUrl.has(urlKey(u))) keyOfUrl.set(urlKey(u), key);
      seen.add(key);
      res.opened++;
    }

    // A role the scan added that a board still lists but the screen now leaves out (not fractional
    // work) is taken off the table, not closed, and its unlocks are paid back (lib/scan/remove.ts).
    // So is an open role the scan added that is outside GTM and below Director (the seniority bar).
    const { removed, belowBar, refunded: refundedOnRemove } = removeScreenedOut(s, found?.screenedOut, {
      seen,
      keyOfUrl: (u) => keyOfUrl.get(urlKey(cleanValue(def("posting"), u.trim()).value ?? "")),
      engagementCompany: g.engagements,
      contactCompany: g.contacts,
      seedCompanies: new Set(seed.companies.map((c) => c.id)),
      isOpen: (id) => !!g.engagements.get(id) && openNow(g.engagements.get(id)!),
      offBar: (id) => {
        const e = g.engagements.get(id);
        return !!e && !keepsNonGtm(live(e, s, "role"), live(e, s, "function"));
      },
      now,
    });
    refunded += refundedOnRemove;
    for (const id of removed) {
      const co = g.engagements.get(id)?.companyId ?? "";
      engsAt.set(co, (engsAt.get(co) ?? []).filter((e) => e.id !== id));
      keyOfEng.delete(id);
      g.engagements.delete(id);
    }

    const sources: ScanSourceResult[] =(Array.isArray(found?.sources) ? found.sources : []).slice(0, 50).map((x) => ({
      source: squeeze(x?.source, 60) || "unknown",
      fetched: Math.max(0, Math.round(Number(x?.fetched) || 0)),
      matched: Math.max(0, Math.round(Number(x?.matched) || 0)),
      ...(x?.error ? { error: squeeze(x.error, 200) } : {}),
    }));
    // Boards that answered cleanly on this run. Only their own roles can be counted as missed.
    const boards = (s.scan.boards ??= {});
    const clean = new Set<string>();
    /** Boards that answered with listings on this run, clean or not. A role of theirs they did not list is not counted as open. */
    const answeredNow = new Set<string>();
    for (const x of sources) {
      const b = (boards[x.source] ??= { baseline: 0, lastOkAt: null, healthy: false });
      b.at = now;
      const answered = !x.error && x.fetched > 0;
      if (answered) answeredNow.add(x.source);
      b.healthy = answered && x.matched > 0 && x.matched * 2 >= b.baseline;
      // A board that only ever lists a role or two matches none when its one posting comes down.
      // That run is clean when it answered with about as many listings as on its last clean run.
      const quiet = !b.healthy && answered && x.matched === 0 && b.baseline > 0 && b.baseline <= SMALL_BOARD && !!b.fetched && x.fetched * 2 >= b.fetched;
      if (b.healthy) {
        b.baseline = x.matched;
        b.fetched = x.fetched;
        b.lastOkAt = now;
        delete b.lowSince;
        clean.add(x.source);
      } else if (quiet) {
        b.healthy = true;
        b.lastOkAt = now;
        clean.add(x.source);
      } else if (answered && x.matched > 0) {
        // Fewer than half, but not none. If that holds on every run for three weeks, the board got smaller.
        b.lowSince ??= now;
        if (nowMs - Date.parse(b.lowSince) >= BASELINE_RESET_AFTER) {
          b.baseline = x.matched;
          delete b.lowSince;
        }
      } else if (answered) delete b.lowSince; // listings but no match at all: a reader that broke, not a smaller board
    }
    for (const [name, b] of Object.entries(boards)) if (nowMs - Date.parse(b.at ?? now) > BOARD_FORGET_AFTER) delete boards[name];

    const closedNow: RoleTrack[] = [];
    for (const [k, r] of Object.entries(roles)) {
      if (r.closedAt || seen.has(k)) continue;
      const e = g.engagements.get(r.engagementId);
      if (!e) continue;
      if (r.source !== "seed" && answeredNow.has(r.source)) r.absentAt ??= now;
      const unseen = nowMs - Date.parse(r.lastSeen);
      let due = clean.size > 0 && unseen > (r.source === "seed" ? SEED_ROLE_LIFE : STALE_AFTER);
      if (r.source !== "seed" && clean.has(r.source)) {
        if (!r.missAt || nowMs - Date.parse(r.missAt) >= MISS_GAP) {
          r.misses = (r.misses ?? 0) + 1;
          r.missAt = now;
        }
        if ((r.misses ?? 0) >= CLOSE_MISSES && unseen > CLOSE_AFTER) due = true;
      }
      if (!due) continue;
      r.closedAt = now;
      r.closedBy = "scan";
      const status = live(e, s, "status");
      if (!status || status === "Open role") put(e.id, "status", "Closed");
      res.closed++;
      closedNow.push(r);
    }

    refunded += refundClosed(s, closedNow, (companyId) => (engsAt.get(companyId) ?? []).some(openNow), now);

    // Two followed roles that are one role listed twice (filed before the scan matched them) become one.
    const merge = mergeDuplicateRoles(s, seed, now);

    s.scan.lastRunAt = now;
    s.scan.lastOkAt = clean.size ? now : okBefore;
    s.scan.sources = sources;
    return { ...res, overCap, refunded, removed: removed.size, removedBelowBar: belowBar, ...(merge.merged ? { merged: merge.merged, mergeRefunds: merge.refunded } : {}) };
  });
}

/** Posting links, each once (by urlKey), at most 6, in the order given. */
function keepLinks(urls: (string | null | undefined)[]): string[] {
  const out = new Map<string, string>();
  for (const u of urls) if (u && !out.has(urlKey(u))) out.set(urlKey(u), u);
  return [...out.values()].slice(0, 6);
}

/**
 * Pay back unlocks on roles that just closed: an unlock of a role's title, posting or rate made
 * after its posting was last seen paid for a role that was already gone, and so did one of its
 * company when no open role is left there (`companyStillOpen`), in full (COMPANY_PRICE). Each once.
 * Returns how many.
 */
function refundClosed(s: State, closedNow: RoleTrack[], companyStillOpen: (companyId: string) => boolean, now: string): number {
  if (!closedNow.length) return 0;
  const since = new Map<string, string>(); // ledger ref -> unlocks later than this are paid back
  for (const r of closedNow) {
    since.set(fkey(r.engagementId, "role"), r.lastSeen);
    since.set(fkey(r.engagementId, "posting"), r.lastSeen);
    since.set(fkey(r.engagementId, "rate"), r.lastSeen);
    // The company too, when this left it with no open role: it was bought while it looked like it was
    // hiring, and it wasn't. All of it comes back (COMPANY_PRICE), and the member still sees the company.
    if (companyStillOpen(r.companyId)) continue;
    const last = Object.values(s.scan.roles).filter((x) => x.companyId === r.companyId).map((x) => x.lastSeen).sort().pop();
    since.set(fkey(r.companyId, "identity"), last ?? r.lastSeen);
  }
  // A member who had bought both listings of one role was paid one back when they merged (mergeDuplicateRoles): that purchase is settled.
  const settled = new Map<string, number>();
  for (const x of s.ledger) if (x.reason === "refund" && x.why === "duplicate") settled.set(`${x.memberId}|${x.ref}`, (settled.get(`${x.memberId}|${x.ref}`) ?? 0) + x.delta);
  let refunded = 0;
  for (const l of [...s.ledger]) {
    const from = l.reason === "unlock" ? since.get(l.ref) : undefined;
    if (from === undefined || l.at <= from || l.delta >= 0) continue;
    if (s.ledger.some((x) => x.reason === "refund" && x.why !== "duplicate" && x.memberId === l.memberId && x.ref === l.ref && x.at >= l.at)) continue; // already paid back
    const left = settled.get(`${l.memberId}|${l.ref}`) ?? 0;
    if (left >= -l.delta) {
      settled.set(`${l.memberId}|${l.ref}`, left + l.delta);
      continue;
    }
    s.ledger.push({ memberId: l.memberId, delta: -l.delta, reason: "refund", ref: l.ref, at: now, why: "closed" });
    refunded++;
  }
  return refunded;
}

/**
 * Open roles the scan added that are one role listed twice: the same company record, the same
 * function (a role with none matches any), and titles that match once brackets, tails and
 * arrangement words are set aside (sameRoleTitle in lib/scan/clean.ts). "Founding Commercial Lead"
 * from one board and "Founding Commercial Lead (Fractional to Full Time), WMS / Supply Chain
 * Software" from another are one role. Each group becomes one:
 *  - the survivor is the one first seen earliest (it keeps that date), and takes every posting
 *    link, the latest sighting, and any fact it lacks (rate, hours, type); its Job posting link is
 *    the company's own site or ATS when one of the links is (bestPosting);
 *  - every member who unlocked either copy holds the survivor's unlock, and a paid unlock of only
 *    the copy now counts as one of the survivor, so a later close pays it back the same way;
 *  - a member who paid for both gets the copy's credits back, once, with its own ledger line
 *    (why "duplicate": "Refund for the same role listed twice");
 *  - the copy's record goes; a person on it moves to the survivor.
 * Only roles the scan itself added and that are still open, and never a copy a member wrote a
 * fact on. Runs on every load of the state and after every scan, and changes nothing the second
 * time. Returns how many copies it merged and how many refunds it wrote.
 */
export function mergeDuplicateRoles(s: State, seed: Seed, now: string): { merged: number; refunded: number } {
  const byScan = new Set(s.engagements.filter((e) => e.by === "scan").map((e) => e.id));
  const val = (id: string, field: string) => {
    const v = s.values[fkey(id, field)];
    return v && v.status === "live" ? v.value : null;
  };
  /** A fact on the copy that a member wrote: such a copy stays as it is. */
  const memberWrote = (id: string) => Object.entries(s.values).some(([k, v]) => k.startsWith(`${id}.`) && !isSystem(v.by));
  const open = Object.entries(s.scan.roles).filter(([, r]) => !r.closedAt && r.source !== "seed" && byScan.has(r.engagementId) && val(r.engagementId, "role"));
  if (open.length < 2) return { merged: 0, refunded: 0 };
  const seedCo = new Map(seed.companies.map((c) => [c.id, c.fields]));
  const stateCo = new Map(s.companies.map((c) => [c.id, c.name]));
  const sites = new Map<string, string | null>();
  const names = new Map<string, string>();
  const siteOf = (id: string) => {
    if (!sites.has(id)) {
      const v = s.values[fkey(id, "website")];
      sites.set(id, hostOf(v ? (v.status === "live" ? v.value : null) : seedCo.get(id)?.website));
    }
    return sites.get(id)!;
  };
  const nameKey = (id: string) => {
    if (!names.has(id)) names.set(id, companyKey(stateCo.get(id) ?? seedCo.get(id)?.name ?? ""));
    return names.get(id)!;
  };
  /** The same company: one record, or the same website domain, or (when one has no website) the same cleaned name. */
  const sameCo = (a: string, b: string) => {
    if (a === b) return true;
    const [x, y] = [siteOf(a), siteOf(b)];
    if (x && y) return x === y;
    const k = nameKey(a);
    return !!k && k === nameKey(b);
  };
  // Oldest first: the first one a group meets is its survivor.
  open.sort(([, a], [, b]) => a.firstSeen.localeCompare(b.firstSeen) || a.engagementId.localeCompare(b.engagementId));
  const done = new Set<string>();
  const emptied = new Map<string, string>(); // a copy's company -> the survivor's, when they are two records
  let merged = 0;
  let refunded = 0;
  for (let i = 0; i < open.length; i++) {
    const [, surv] = open[i];
    if (done.has(surv.engagementId)) continue;
    for (let j = i + 1; j < open.length; j++) {
      const [dupKey, dup] = open[j];
      if (done.has(dup.engagementId) || !sameCo(surv.companyId, dup.companyId)) continue;
      const fa = val(surv.engagementId, "function");
      const fb = val(dup.engagementId, "function");
      if (fa && fb && fa !== fb) continue;
      if (!sameRoleTitle(val(surv.engagementId, "role"), val(dup.engagementId, "role")) || memberWrote(dup.engagementId)) continue;
      done.add(dup.engagementId);
      refunded += mergeInto(s, surv, dup, siteOf(surv.companyId), now);
      delete s.scan.roles[dupKey];
      if (dup.companyId !== surv.companyId) emptied.set(dup.companyId, surv.companyId);
      merged++;
    }
  }
  // A copy filed under a second record of the company: that record goes when the scan added it and nothing else is on it.
  for (const [from, to] of emptied) refunded += foldCompany(s, seed, from, to, now);
  return { merged, refunded };
}

/**
 * A company record the scan added, left with nothing once its role was merged into the same
 * role at another record of the company: it goes, and whoever unlocked it holds the survivor's
 * company. A member who paid for both companies gets the copy's credit back (why "duplicate").
 * A record with anything else on it (a seat, a person, a fact a member wrote) stays.
 */
function foldCompany(s: State, seed: Seed, from: string, to: string, now: string): number {
  if (seed.companies.some((c) => c.id === from) || !s.companies.some((c) => c.id === from && c.by === "scan")) return 0;
  if (s.engagements.some((e) => e.companyId === from) || seed.engagements.some((e) => e.companyId === from)) return 0;
  if (s.contacts.some((p) => p.companyId === from) || (seed.contacts ?? []).some((p) => p.companyId === from)) return 0;
  if (Object.entries(s.values).some(([k, v]) => k.startsWith(`${from}.`) && !isSystem(v.by))) return 0;
  const F = fkey(from, "identity");
  const T = fkey(to, "identity");
  if (s.unlocks[F]?.length) s.unlocks[T] = [...new Set([...(s.unlocks[T] ?? []), ...s.unlocks[F]])];
  const paid = (ref: string) => (l: LedgerEntry) =>
    l.reason === "unlock" && l.delta < 0 && l.ref === ref && !s.ledger.some((x) => x.reason === "refund" && x.why !== "duplicate" && x.memberId === l.memberId && x.ref === l.ref && x.at >= l.at);
  const paidTo = new Set(s.ledger.filter(paid(T)).map((l) => l.memberId));
  const back = new Map<string, number>();
  for (const l of s.ledger.filter(paid(F))) {
    if (paidTo.has(l.memberId)) back.set(l.memberId, (back.get(l.memberId) ?? 0) - l.delta);
    l.ref = T;
  }
  for (const l of s.ledger) if (l.reason === "refund" && l.ref === F) l.ref = T;
  for (const [memberId, n] of back) s.ledger.push({ memberId, delta: n, reason: "refund", ref: T, at: now, why: "duplicate" });
  s.companies = s.companies.filter((c) => c.id !== from);
  for (const bag of [s.values, s.unlocks, s.verifications] as Record<string, unknown>[]) for (const k of Object.keys(bag)) if (k.startsWith(`${from}.`)) delete bag[k];
  for (const [m, ids] of Object.entries(s.follows)) if (ids.includes(from)) s.follows[m] = [...new Set(ids.map((x) => (x === from ? to : x)))];
  return back.size;
}

/** Fold one copy of a role into its survivor (see mergeDuplicateRoles). Returns the refunds written. */
function mergeInto(s: State, surv: RoleTrack, dup: RoleTrack, site: string | null, now: string): number {
  const S = surv.engagementId;
  const D = dup.engagementId;
  // The track: every link, the latest sighting.
  const links = keepLinks([surv.url, ...(surv.urls ?? []), dup.url, ...(dup.urls ?? [])]);
  if (links.length > 1) surv.urls = links;
  if (dup.lastSeen > surv.lastSeen) {
    surv.lastSeen = dup.lastSeen;
    surv.source = dup.source;
    surv.url = dup.url || surv.url;
    if (dup.misses === undefined) delete surv.misses;
    else surv.misses = dup.misses;
    if (dup.missAt === undefined) delete surv.missAt;
    else surv.missAt = dup.missAt;
    if (dup.absentAt === undefined) delete surv.absentAt;
    else surv.absentAt = dup.absentAt;
  }
  if (!surv.postedAt && dup.postedAt) surv.postedAt = dup.postedAt;
  if (dup.checkedAt && (!surv.checkedAt || dup.checkedAt < surv.checkedAt)) surv.checkedAt = dup.checkedAt;
  // Facts: the company's own link, and any gap filled from the copy.
  const sp = s.values[fkey(S, "posting")];
  const best = bestPosting([sp?.status === "live" ? sp.value : null, ...links], site);
  if (best && (!sp || (sp.status === "live" && isSystem(sp.by) && postingRank(best, site) < postingRank(sp.value, site)))) {
    s.values[fkey(S, "posting")] = { value: best, by: "scan", at: sp?.at ?? now, status: "live" };
    delete s.verifications[fkey(S, "posting")];
  }
  for (const f of ["rate", "hours", "type", "function"]) {
    const dv = s.values[fkey(D, f)];
    if (!s.values[fkey(S, f)] && dv && dv.status === "live") s.values[fkey(S, f)] = { ...dv };
  }
  // Unlocks: whoever unlocked either copy holds the survivor's.
  for (const [k, ids] of Object.entries(s.unlocks)) {
    if (!k.startsWith(`${D}.`)) continue;
    const sk = `${S}.${k.slice(D.length + 1)}`;
    s.unlocks[sk] = [...new Set([...(s.unlocks[sk] ?? []), ...ids])];
  }
  // Paid unlocks of the copy count as purchases of the survivor from now on (so a later close pays them back as usual), and a
  // member who had bought both gets the copy's credits back, once. refundClosed counts that refund as settling one purchase.
  const paid = (id: string) => (l: LedgerEntry) =>
    l.reason === "unlock" && l.delta < 0 && l.ref.startsWith(`${id}.`) && !s.ledger.some((x) => x.reason === "refund" && x.why !== "duplicate" && x.memberId === l.memberId && x.ref === l.ref && x.at >= l.at);
  const paidSurv = new Set(s.ledger.filter(paid(S)).map((l) => l.memberId));
  const back = new Map<string, { n: number; ref: string }>();
  for (const l of s.ledger.filter(paid(D))) {
    const sref = `${S}.${l.ref.slice(D.length + 1)}`;
    if (paidSurv.has(l.memberId)) {
      const b = back.get(l.memberId) ?? { n: 0, ref: sref };
      b.n += -l.delta;
      back.set(l.memberId, b);
    }
    l.ref = sref;
  }
  // A refund the copy already had (a role that closed and reopened) moves with its purchase.
  for (const l of s.ledger) if (l.reason === "refund" && l.ref.startsWith(`${D}.`)) l.ref = `${S}.${l.ref.slice(D.length + 1)}`;
  for (const [memberId, b] of back) s.ledger.push({ memberId, delta: b.n, reason: "refund", ref: b.ref, at: now, why: "duplicate" });
  // The copy's record and facts go. A person on it, a benchmark rate, a claim or "This isn't me" moves to the survivor.
  s.engagements = s.engagements.filter((e) => e.id !== D);
  for (const bag of [s.values, s.unlocks, s.verifications] as Record<string, unknown>[]) for (const k of Object.keys(bag)) if (k.startsWith(`${D}.`)) delete bag[k];
  for (const p of s.contacts) if (p.engagementId === D) p.engagementId = S;
  for (const b of s.benchRates) if (b.engagementId === D) b.engagementId = S;
  for (const c of s.roleClaims ?? []) if (c.engagementId === D) c.engagementId = S;
  for (const [m, ids] of Object.entries(s.notMine)) if (ids.includes(D)) s.notMine[m] = [...new Set(ids.map((x) => (x === D ? S : x)))];
  return back.size;
}

/**
 * The posting check, run after each scan (runScan): for the open roles the scan itself added
 * (never one from our records or one a member added), the postings are fetched, the longest
 * unchecked first, at most MAX_CHECKS fetches, 4 at a time, 8 seconds each (lib/scan/posting.ts).
 * A role whose every posting is clearly closed closes now, closedBy "posting-closed", and its
 * unlocks made after it was last listed are paid back as on any close (refundClosed). A role the
 * scan saw listed at `skipSeenSince` or later is left for the next run: its board still lists it.
 * Anything unclear changes nothing but the date it was checked.
 */
export async function checkOpenPostings(opts: { fetch: PostingFetch; now?: string; skipSeenSince?: string; max?: number }): Promise<PostingCheckResult> {
  const [, s] = await Promise.all([loadSeed(), loadState()]);
  const byScan = new Set(s.engagements.filter((e) => e.by === "scan").map((e) => e.id));
  const targets = Object.entries(s.scan.roles)
    .filter(([, r]) => !r.closedAt && r.source !== "seed" && byScan.has(r.engagementId) && !(opts.skipSeenSince && r.lastSeen >= opts.skipSeenSince))
    .sort(([, a], [, b]) => (a.checkedAt ?? "").localeCompare(b.checkedAt ?? "") || a.lastSeen.localeCompare(b.lastSeen))
    // Links are stored without their scheme ("acme.com/jobs/1"): they are fetched over https.
    .map(([key, r]) => ({ key, urls: (r.urls?.length ? r.urls : [r.url]).filter(Boolean).map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`)), lastSeen: r.lastSeen }));
  const out = await checkPostings(targets, { fetch: opts.fetch, max: opts.max });
  const fetches = out.reduce((n, o) => n + o.fetches, 0);
  if (!out.length) return { roles: 0, fetches, closed: 0, refunded: 0 };
  const lastSeenOf = new Map(targets.map((t) => [t.key, t.lastSeen]));
  return mutate((d, seedD): PostingCheckResult => {
    const now = iso(opts.now, new Date().toISOString());
    const closedNow: RoleTrack[] = [];
    for (const o of out) {
      const r = d.scan.roles[o.key];
      // Seen again, closed or gone while the postings were fetched: what the scan knows now stands.
      if (!r || r.closedAt || r.lastSeen !== lastSeenOf.get(o.key)) continue;
      r.checkedAt = now;
      if (o.verdict !== "closed" || !d.engagements.some((e) => e.id === r.engagementId)) continue;
      r.closedAt = now;
      r.closedBy = "posting-closed";
      const sk = fkey(r.engagementId, "status");
      const st = d.values[sk];
      if (!st || st.status !== "live" || st.value === "Open role") {
        delete d.verifications[sk];
        d.values[sk] = { value: "Closed", by: "scan", at: now, status: "live" };
      }
      closedNow.push(r);
    }
    const g = graph(seedD, d);
    const tracks = buildTracks(seedD, d);
    const stillOpen = (companyId: string) => [...g.engagements.values()].some((e) => e.companyId === companyId && isOpenRole(e, d, tracks));
    const refunded = refundClosed(d, closedNow, stillOpen, now);
    return { roles: out.length, fetches, closed: closedNow.length, refunded };
  });
}

/** Companies on Merlin with a website of their own, for career feed discovery: the most seats on file first. Never a firm or a placeholder. */
function careerCompanies(seed: Seed, s: State): AtsCompany[] {
  const g = graph(seed, s);
  const seats = new Map<string, number>();
  for (const e of g.engagements.values()) seats.set(e.companyId, (seats.get(e.companyId) ?? 0) + 1);
  const out: { c: AtsCompany; n: number }[] = [];
  for (const c of g.companies.values()) {
    const site = live(c, s, "website");
    const host = hostOf(site);
    // A host many companies share (a LinkedIn page) is no company's own site.
    if (!host || siteKey(site) !== host || !c.name || companyFirm(c.name)) continue;
    out.push({ c: { name: c.name, domain: host }, n: seats.get(c.id) ?? 0 });
  }
  return out.sort((a, b) => b.n - a.n || a.c.name.localeCompare(b.c.name)).map((x) => x.c);
}

/** Sales-build rises within this many days of each other count as one jump. */
const SALES_JUMP_DAYS = 30;
/** Counts kept per company (newest last). */
const SALES_HIST_MAX = 12;

/**
 * Full-time sales hires each career feed listed this run (by domain), kept per company
 * (State.salesBuild): counts and dates only. A rise Crystal Ball reads as a sales build is
 * recorded once: from none to one or more, or two or more more than the lowest count of the last
 * 30 days. The first read of a company is its baseline, never a rise.
 */
export function noteSalesHires(d: State, seed: Seed, byDomain: Map<string, number>, at: string): number {
  const g = graph(seed, d);
  const ids = new Map<string, string>();
  for (const c of g.companies.values()) {
    const host = hostOf(live(c, d, "website"));
    if (host && !ids.has(host)) ids.set(host, c.id);
  }
  const all = (d.salesBuild ??= {});
  const atMs = Date.parse(at);
  let rises = 0;
  for (const [domain, n] of byDomain) {
    const id = ids.get(domain);
    if (!id) continue;
    const r = all[id];
    if (!r) {
      all[id] = { n, at, ...(n > 0 ? { firstAt: at } : {}), hist: [{ n, at }] };
      continue;
    }
    const recent = r.hist.filter((x) => atMs - Date.parse(x.at) <= SALES_JUMP_DAYS * DAY_MS);
    const low = Math.min(r.n, ...recent.map((x) => x.n));
    const last = r.rises?.[r.rises.length - 1];
    const lately = !!last && atMs - Date.parse(last.at) <= SALES_JUMP_DAYS * DAY_MS;
    if (!lately && ((r.n === 0 && n >= 1) || n - low >= 2)) {
      (r.rises ??= []).push({ at, from: r.n === 0 ? 0 : low, to: n });
      if (r.rises.length > 6) r.rises.splice(0, r.rises.length - 6);
      rises++;
    }
    if (n > 0 && !r.firstAt) r.firstAt = at;
    if (n !== r.n) {
      r.hist.push({ n, at });
      if (r.hist.length > SALES_HIST_MAX) r.hist.splice(0, r.hist.length - SALES_HIST_MAX);
    }
    r.n = n;
    r.at = at;
  }
  return rises;
}

/**
 * Career-page sources for this run (lib/scan/sources/ats.ts): discovery for the companies that are
 * due, then one source per applicant tracking system over every board found so far. `save` keeps
 * what discovery learned, and marks a board whose feed answered 404 for another look, in the
 * state. Tests pass their own fetches.
 */
export async function careerSources(opts: { feed?: FeedFetch; site?: SiteFetch; now?: number; max?: number } = {}): Promise<{ sources: ScanSource[]; save: () => Promise<{ found: number; tried: number; gone: number }> }> {
  const now = opts.now ?? Date.now();
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const companies = careerCompanies(seed, s);
  const cache = s.scan.ats ?? {};
  const fresh = await discover(companies, cache, { fetch: opts.feed ?? fetchFeed, site: opts.site, now, max: opts.max });
  const all = { ...cache, ...fresh };
  const byDomain = new Map(companies.map((c) => [c.domain.toLowerCase(), c]));
  const boards = Object.entries(all).flatMap(([d, e]) => (e.board && byDomain.has(d) ? [{ board: e.board, company: byDomain.get(d)! }] : []));
  const gone = new Set<string>();
  const sales = new Map<string, number>();
  const sources = atsSources(boards, { fetch: opts.feed ?? fetchFeed, gone: (d) => gone.add(d), salesCount: (d, n) => sales.set(d, n) });
  const save = () =>
    mutate((d, seedD) => {
      const at = new Date(now).toISOString();
      const ats = (d.scan.ats ??= {});
      Object.assign(ats, fresh);
      for (const x of gone) ats[x] = { at };
      if (sales.size) noteSalesHires(d, seedD, sales, at);
      return { found: Object.values(fresh).filter((e) => e.board).length, tried: Object.keys(fresh).length, gone: gone.size };
    });
  return { sources, save };
}

export interface ScanRun {
  result: ScanApplyResult;
  sources: ScanSourceResult[];
  /** Weekly emails sent after this scan. */
  digests: number;
}
let scanFlight: Promise<ScanRun> | null = null;
let scanTriedAt = 0;

/**
 * Scan the job boards, store what was found, then send the weekly email. One at a time: a second call joins the first.
 * `from` is for tests: boards to read in place of the real ones, and the scan's time.
 */
export function runScan(
  origin?: string,
  from: { collect?: () => ReturnType<typeof collectOpenRoles>; now?: string; fetchPosting?: PostingFetch } = {},
): Promise<ScanRun> {
  scanFlight ??= (async () => {
    const t0 = Date.now();
    scanTriedAt = t0;
    try {
      // Tests never reach a job board, a career feed or a posting.
      const test = process.env.RN_SCAN_TEST === "1";
      let found: Awaited<ReturnType<typeof collectOpenRoles>>;
      if (from.collect) found = await from.collect();
      else if (test) found = { roles: [], all: [], sources: [], seenKeys: [] };
      else {
        // The boards, and the career pages of companies on Merlin (discovered a few a run). A discovery that fails costs only those sources.
        const careers = await careerSources().catch((e) => (console.error("career feed discovery failed", e), null));
        try {
          found = await collectOpenRoles({ sources: [...scanSources(), ...(careers?.sources ?? [])] });
        } finally {
          if (careers) await careers.save().then((c) => c.tried && console.log(`career feeds: looked up ${c.tried} companies, found ${c.found}, ${c.gone} feeds gone`)).catch((e) => console.error("career feed cache not saved", e));
        }
      }
      // Every role that passed the screen, not the capped list: a role still posted must be seen to stay open.
      const result = await applyScan({ roles: found.all, sources: found.sources, screenedOut: "screenedOut" in found ? found.screenedOut : [] }, from.now);
      // The posting check: open roles whose every posting is clearly closed close now, before the weekly email counts them.
      const postingFetch = from.fetchPosting ?? (test ? null : fetchPosting);
      const posting = postingFetch
        ? await checkOpenPostings({ fetch: postingFetch, now: from.now, skipSeenSince: result.at }).catch((e) => (console.error("posting check failed", e), null))
        : null;
      if (posting) result.postingClosed = posting.closed;
      if (posting?.refunded) result.refunded = (result.refunded ?? 0) + posting.refunded;
      const digests = await sendDigests(result.at, origin).catch((e) => (console.error("digest failed", e), 0));
      // About texts for the companies without one, from their own websites (RN_ABOUT=1), in the background.
      if (aboutEnabled()) void import("./about/run").then((m) => m.runAbout()).catch((e) => console.error("about run failed", e));
      const failed = found.sources.filter((x) => x.error).length;
      console.log(
        `scan: ${found.all.length} roles from ${found.sources.length} sources (${failed} failed), opened ${result.opened}, still open ${result.stillOpen}, ` +
          `closed ${result.closed} (${result.postingClosed ?? 0} by the posting check of ${posting?.roles ?? 0} roles, ${posting?.fetches ?? 0} fetches), merged ${result.merged ?? 0}, reopened ${result.reopened}, removed ${result.removed ?? 0} (${result.removedBelowBar ?? 0} below Director outside GTM), left out below Director ${result.belowBar ?? 0}, companies added ${result.companiesAdded}, left for a later run ${result.overCap ?? 0}, ` +
          `unlocks paid back ${result.refunded ?? 0}, emails ${digests}, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      return { result, sources: found.sources, digests };
    } finally {
      scanFlight = null;
    }
  })();
  return scanFlight;
}

/**
 * Start a scan in the background when one is due: RN_SCAN=1, and the last run is more than 7
 * days old (or there is none). A run where every board failed is tried again after 6 hours.
 * Called on page loads, so it must stay cheap: at most one try an hour.
 */
export async function maybeScan(origin?: string): Promise<void> {
  if (process.env.RN_SCAN !== "1" || scanFlight || Date.now() - scanTriedAt < 60 * 60_000) return;
  const s = await loadState();
  const age = Date.now() - Date.parse(s.scan.lastRunAt ?? "");
  const allFailed = s.scan.sources.length > 0 && !s.scan.sources.some((x) => !x.error && x.fetched > 0);
  if (Number.isFinite(age) && age < (allFailed ? 6 * 60 * 60_000 : WEEK)) return;
  scanTriedAt = Date.now();
  void runScan(origin).catch((e) => console.error("scan failed", e));
}

/* ---------- the weekly email ---------- */

const unsubSig = (memberId: string) => createHmac("sha256", ID_KEY).update(`unsubscribe:${memberId}`).digest("base64url").slice(0, 22);

/** The unsubscribe link sets digestOff for the member it was signed for. False when the link isn't valid. */
export async function unsubscribe(m: unknown, sig: unknown): Promise<boolean> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const member = memberIndex(seed, s).all.find((x) => pubId(x.id) === String(m ?? ""));
  if (!member) return false;
  const want = Buffer.from(unsubSig(member.id));
  const got = Buffer.from(String(sig ?? ""));
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  await mutate((d) => {
    d.profiles[member.id] = { ...(d.profiles[member.id] ?? {}), digestOff: true };
  });
  return true;
}

let digestRunning = false;

/**
 * What each member's weekly email would say right now: one entry per member with an email
 * who has signed in (or everyone on file with RN_DIGEST_ALL=1), hasn't turned it off and
 * hasn't had one in the last 6 days. Empty in a week with no new
 * open roles. Server-side only (it holds every member's email).
 */
export async function digestList(nowIso: string | undefined, base: string): Promise<{ memberId: string; data: DigestData }[]> {
  const now = iso(nowIso, new Date().toISOString());
  const nowMs = Date.parse(now);
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const g = graph(seed, s);
  const idx = memberIndex(seed, s);
  const tracks = tracksOf(seed, s);

  const fresh: EngNode[] = [];
  let closedRoles = 0;
  const missing = new Map<string, number>();
  for (const e of g.engagements.values()) {
    const holder = seatHolder(s, idx, e.id, valueOf(e, s, "operator"));
    if (holder) missing.set(holder.id, (missing.get(holder.id) ?? 0) + missingOnSeat(e, s));
    const t = tracks.get(e.id);
    if (!t) continue;
    if (t.closedAt) {
      if (nowMs - Date.parse(t.closedAt) < WEEK) closedRoles++;
    } else if (newThisWeek(t, nowMs) && isOpenRole(e, s, tracks) && !isUnseen(t)) fresh.push(e);
  }
  // Saved views that follow hires ("Recently hired"): their new matches go in the email too, in a week with no new roles as well.
  const alertsOf = s.connector?.alerts ?? {};
  const hireViewsOf = (id: string) => alertViewsOf(s, id, alertsOf[id] ?? [], nowMs).filter((a) => a.email !== false && followsHires(a));
  const anyHireViews = Object.keys(alertsOf).some((id) => hireViewsOf(id).length > 0);
  if (!fresh.length && !anyHireViews) return [];
  const hireMod = anyHireViews ? await import("./hireAlerts") : null;
  const added = hireMod ? hireMod.seatAddedTimes(seed, s) : null;
  const count = new Map<string, number>();
  for (const e of fresh) {
    const fn = fnOf(e, s) ?? "Other";
    count.set(fn, (count.get(fn) ?? 0) + 1);
  }
  const byFunction = [...count].map(([fn, n]) => ({ function: fn, n })).sort((a, b) => b.n - a.n || a.function.localeCompare(b.function));
  // Saved searches (the connector's alerts) match the new roles by free facts only. The HQ a member
  // matches on is the one they see: a hidden company's region.
  const roleFacts = fresh.map((e) => {
    const c = g.companies.get(e.companyId);
    const engs = [...g.engagements.values()].filter((x) => x.companyId === e.companyId);
    return {
      e,
      facts: {
        function: fnOf(e, s),
        industry: live(c, s, "industry"),
        employees: live(c, s, "employees"),
        revenue: live(c, s, "revenue"),
        hq: live(c, s, "hq"),
        pastHires: friendliness(g, s, tracks, e.companyId, engs, new Set(), firmsInReview(seed, s).has(e.companyId)).fractional,
        ...geoOf(c, s),
      },
    };
  });
  const alertCounts = (m: Member) =>
    alertViewsOf(s, m.id, alertsOf[m.id] ?? [], nowMs)
      // A saved view whose weekly email the member turned off stays saved, out of the email.
      .filter((a) => a.email !== false)
      .map((a) => ({
        name: a.name,
        n: roleFacts.filter(({ e, facts }) =>
          alertMatches(a, a.hq && facts.hq && identityHidden(g, s, idx, tracks, m, e.companyId) ? { ...facts, hq: hqRegion(facts.hq) } : facts),
        ).length,
      }))
      .filter((x) => x.n > 0);

  // The roles the email lists and the list its button opens (lib/digest.ts): the ones the headline
  // counts, newest first, in free facts only. Never the company: the title loses its name and site.
  type Listed = NonNullable<DigestData["roles"]>[number];
  const rolesFor = new Map<string, { url: string; roles: Listed[] }>();
  const listFor = (fn: string | null, mine: EngNode[]) => {
    const own = !!fn && fn !== "Other" && mine.length > 0;
    const key = own ? fn! : "";
    const hit = rolesFor.get(key);
    if (hit) return hit;
    const url = `${base}/?${new URLSearchParams(own ? { v: "hiring", t: "seats", f: `fn:${fn}` } : { v: "hiring", t: "seats", af: "1", f: "-" })}`;
    const seen = (e: EngNode) => tracks.get(e.id)?.firstSeen ?? "";
    const roles = [...(own ? mine : fresh)]
      .sort((a, b) => seen(b).localeCompare(seen(a)))
      .slice(0, 5)
      .map((e): Listed => {
        const c = g.companies.get(e.companyId);
        const rfn = fnOf(e, s);
        const fallback = rfn ? `Fractional ${rfn} role` : "Fractional role";
        const raw = live(e, s, "role");
        const title = raw ? titleWithout(raw, c?.name ?? "", live(c, s, "website") ?? null, fallback).trim() : fallback;
        const geo = geoOf(c, s);
        const country = geo.country ? ({ "United States": "US", "United Kingdom": "UK" } as Record<string, string>)[geo.country] ?? geo.country : null;
        const hq = live(c, s, "hq");
        return {
          title: !title || title.length > 90 || /https?:|www\.|@/i.test(title) ? fallback : title,
          function: rfn,
          industry: live(c, s, "industry"),
          employees: live(c, s, "employees"),
          // The region and country, never the city: what a hidden company shows.
          region: geo.country ? [geo.region, country].filter(Boolean).join(", ") : hq ? hqRegion(hq) || null : null,
          listed: seen(e).slice(0, 10) || null,
          url: `${url}&c=${encodeURIComponent(pubId(e.companyId))}`,
        };
      });
    const out = { url, roles };
    rolesFor.set(key, out);
    return out;
  };

  // Only members who have signed in get it, unless RN_DIGEST_ALL=1 sends it to everyone on file.
  const everyone = process.env.RN_DIGEST_ALL === "1";
  const joined = new Set(s.members.map((m) => m.id));
  const out: { memberId: string; data: DigestData }[] = [];
  for (const m of idx.all) {
    if (!m.email || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(m.email)) continue;
    if (!everyone && !s.seen[m.id] && !s.profiles[m.id] && !joined.has(m.id)) continue;
    const prof = s.profiles[m.id] ?? {};
    if (prof.digestOff) continue;
    const last = Date.parse(s.digest.members[m.id] ?? "");
    if (Number.isFinite(last) && nowMs - last < 6 * DAY) continue;
    // The member's views that follow hires: companies that newly match each one, since their last email (a week at most).
    let hires: DigestHires[] = [];
    const hireViews = hireMod && added ? hireViewsOf(m.id) : [];
    if (hireMod && added && hireViews.length) {
      try {
        const since = Math.max(Number.isFinite(last) ? last : 0, nowMs - WEEK);
        const viewUrl = (place: string | null) => (place ? `${base}/?${place}` : `${base}/`);
        hires = (await hireMod.newHires(m, hireViews, since, nowMs, added)).map((h) => ({
          name: h.name,
          n: h.n,
          functions: h.functions,
          inProfile: h.inProfile,
          url: viewUrl(h.place),
          rows: h.rows.map((r) => ({ company: r.company, function: r.function, start: r.start, url: `${viewUrl(h.place)}${h.place ? "&" : "?"}c=${encodeURIComponent(r.companyId)}` })),
        }));
      } catch (e) {
        console.error("weekly email: new hires failed for one member", e);
      }
    }
    // A week with no new roles: only members with new hires for a saved view get one.
    if (!fresh.length && !hires.length) continue;
    const fn = prof.function ?? functionOf(prof.title || m.title);
    const mine = fn ? fresh.filter((e) => fnOf(e, s) === fn) : [];
    const listed = listFor(fn, mine);
    out.push({
      memberId: m.id,
      data: {
        name: m.name,
        email: m.email,
        function: fn,
        newRoles: fresh.length,
        newRolesMine: mine.length,
        newRolesMineHidden: mine.filter((e) => identityHidden(g, s, idx, tracks, m, e.companyId)).length,
        byFunction,
        closedRoles,
        seatFactsMissing: missing.get(m.id) ?? 0,
        credits: Math.max(0, balance(s, m.id)), // as the app shows it: never below zero (see Me.owed)
        alerts: alertCounts(m),
        appUrl: base,
        unsubscribeUrl: `${base}/api/table/unsubscribe?m=${pubId(m.id)}&s=${unsubSig(m.id)}`,
        rolesUrl: listed.url,
        roles: listed.roles,
        ...(hires.length ? { hires } : {}),
      },
    });
  }
  return out;
}

/**
 * Email every member who wants it the week's new open roles. Dormant until email is set up
 * (and off with RN_DIGEST=0). Nothing goes out in a week with no new roles, and nobody gets
 * two inside 6 days. One at a time; a failed send is logged and the rest go on.
 * Returns how many were sent.
 */
export async function sendDigests(nowIso?: string, origin?: string): Promise<number> {
  if (!digestOn() || digestRunning) return 0;
  const base = (publicBase() || origin || "").replace(/\/$/, "");
  if (!base) {
    console.error("weekly email not sent: set RN_PUBLIC_URL so it can link back");
    return 0;
  }
  digestRunning = true;
  try {
    const now = iso(nowIso, new Date().toISOString());
    let sent = 0;
    for (const { memberId, data } of await digestList(now, base)) {
      try {
        // Someone may have unsubscribed while the run was going.
        if ((await loadState()).profiles[memberId]?.digestOff) continue;
        const mail = renderDigest(data);
        if (!(await sendEmail(data.email, mail.subject, mail.text, mail.html, { unsubscribeUrl: data.unsubscribeUrl }))) continue;
        sent++;
        await mutate((draft) => {
          draft.digest.members[memberId] = now;
          draft.digest.sent++;
          draft.digest.lastSentAt = now;
        });
      } catch (e) {
        console.error("weekly email failed for one member", e);
      }
    }
    return sent;
  } finally {
    digestRunning = false;
  }
}

/* ---------- the Claude connector (lib/mcp) ---------- */

/** The connector's part of the state, as it is now. Read only: change it with updateConnector. */
export async function connectorState(): Promise<ConnectorState> {
  return (await loadState()).connector ?? emptyConnector();
}
/** Change the connector's part of the state, through the same write queue as every action. */
export function updateConnector<T>(fn: (c: ConnectorState, s: State) => T): Promise<T> {
  return mutate((s) => {
    s.connector ??= emptyConnector();
    s.connector.clients ??= [];
    s.connector.grants ??= [];
    s.connector.alerts ??= {};
    return fn(s.connector, s);
  });
}
/** A member by internal id (seed or joined), or null. The connector's tokens name a member this way. */
export async function memberById(id: string): Promise<Member | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  return memberIndex(seed, s).byId.get(id) ?? null;
}
/** Whether the weekly email can go out at all (email set up and RN_DIGEST not 0). */
export const digestEnabled = () => digestOn();

/* ---------- About texts from company websites (lib/about) ---------- */

/** Whether a company is due a read of its website, and why not. `cur` is its About value if any. */
function aboutDue(s: State, node: CompanyNode, nowMs: number): { domain: string; prev: AboutStatus | null } | null {
  const domain = siteKey(live(node, s, "website"));
  // No website, or one on a shared host (a LinkedIn or job board page): nothing of the company's own to read.
  if (!domain || domain.includes("/")) return null;
  if (node.seedFields.about) return null;
  const stored = s.values[fkey(node.id, "about")];
  // An About from anyone else stays. One of ours an admin removed (or that is under review) is not put back.
  if (stored && (stored.by !== ABOUT_BY || stored.status !== "live")) return null;
  const prev = s.about?.companies[node.id] ?? null;
  if (!prev) return { domain, prev };
  const age = nowMs - Date.parse(prev.at);
  if (!Number.isFinite(age)) return { domain, prev };
  if (stored) return age >= REFRESH_DAYS * DAY ? { domain, prev } : null;
  return prev.s === "filled" || age >= RETRY_DAYS * DAY ? { domain, prev } : null;
}

/** Companies whose website is due a read for an About text: never tried first, then the longest ago. */
export async function aboutTargets(nowIso?: string): Promise<AboutTarget[]> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
  const out: AboutTarget[] = [];
  for (const node of graph(seed, s).companies.values()) {
    const due = aboutDue(s, node, nowMs);
    if (due) out.push({ companyId: node.id, name: node.name, domain: due.domain, prev: due.prev });
  }
  return out.sort((a, b) => Number(!!a.prev) - Number(!!b.prev) || (a.prev?.at ?? "").localeCompare(b.prev?.at ?? ""));
}

/** What saveAbout did with each outcome: wrote it, found the same text, kept an About someone else set since, or recorded a skip or failure. */
export type AboutSaved = "filled" | "unchanged" | "kept" | "skipped" | "failed";

/**
 * Store a batch of website reads. A text goes in as a live system value by "website" (no credit
 * to anyone, never a member's fact) only where the company still has no About, or has one of ours:
 * an About from our records, a member or an admin is never replaced. A refresh replaces ours only
 * when the site's text changed. Every company gets its status (filled, skipped or failed, with the
 * reason and time) so a restart carries on where this stopped. `run` is the run so far.
 */
export function saveAbout(outcomes: AboutOutcome[], run: AboutRunSummary | null, nowIso?: string): Promise<AboutSaved[]> {
  return mutate((s, seed) => {
    const now = nowIso ?? new Date().toISOString();
    const about = (s.about ??= { companies: {}, lastRun: null });
    const g = graph(seed, s);
    const out: AboutSaved[] = [];
    for (const o of outcomes) {
      const node = g.companies.get(o.companyId);
      const prev = about.companies[o.companyId];
      if (!node) {
        out.push("kept");
        continue;
      }
      const k = fkey(node.id, "about");
      const stored = s.values[k];
      const ours = !!stored && stored.by === ABOUT_BY && stored.status === "live";
      if (o.s !== "filled" || !o.text) {
        // A refresh that could not read the site keeps the text it has, and tries again after REFRESH_DAYS.
        if (ours && prev?.s === "filled") about.companies[o.companyId] = { ...prev, at: now, why: o.why };
        else about.companies[o.companyId] = { s: o.s === "filled" ? "skipped" : o.s, ...(o.why ? { why: o.why } : {}), at: now, ...(o.host ? { host: o.host } : {}) };
        out.push(o.s === "failed" ? "failed" : "skipped");
        continue;
      }
      if (node.seedFields.about || (stored && !ours)) {
        about.companies[o.companyId] = { s: "skipped", why: "about already on file", at: now };
        out.push("kept");
        continue;
      }
      const status: AboutStatus = { s: "filled", at: now, ...(o.hash ? { hash: o.hash } : {}), ...(o.host ? { host: o.host } : {}) };
      if (ours && (stored.value === o.text || (o.hash && prev?.hash === o.hash))) {
        about.companies[o.companyId] = status;
        out.push("unchanged");
        continue;
      }
      s.values[k] = { value: o.text, by: ABOUT_BY, at: now, status: "live" };
      about.companies[o.companyId] = status;
      out.push("filled");
    }
    if (run) about.lastRun = { ...run };
    return out;
  });
}

/** Pilot metrics: the run under way (or the last one), and every company's status on file. */
/**
 * Pilot metrics: Crystal Ball's model. Merlin's observed transitions between fractional leadership
 * seats (counted as lib/radar/predict.ts countTransitions counts them, the same seats the radar
 * reads), the new seat and company facts on file, the sales builds and the departures. Counts
 * only: no company, no person, and "who introduced you" only as how many seats have one.
 */
function crystalModelStats(seed: Seed, s: State, g: Graph, nowMs: number): NonNullable<RadarStats["model"]> {
  const tracks = tracksOf(seed, s);
  const firms = firmsInReview(seed, s);
  const points: SeatPoint[] = [];
  const facts = { ownership: 0, whyNow: 0, endReason: 0, introducedBy: 0, revenueThen: 0, employeesThen: 0 };
  for (const e of g.engagements.values()) {
    if (live(e, s, "whyNow")) facts.whyNow++;
    if (live(e, s, "endReason")) facts.endReason++;
    if (live(e, s, "revenue")) facts.revenueThen++;
    if (live(e, s, "employees")) facts.employeesThen++;
    if (firms.has(e.companyId) || isOpenRole(e, s, tracks) || (e.source === "Demand scan" && !live(e, s, "operator"))) continue;
    const type = live(e, s, "type");
    if (type && !FRACTIONAL_TYPES.includes(type)) continue;
    if (belowLead(live(e, s, "role"))) continue;
    const fn = fnOf(e, s);
    const start = live(e, s, "start");
    if (!fn || fn === "Other" || !start || !/^\d{4}(-\d{2})?$/.test(start)) continue;
    const then = live(e, s, "revenue");
    const now = live(g.companies.get(e.companyId), s, "revenue");
    points.push({ companyId: e.companyId, fn, ym: start, stage: (isStage(then) ? then : isStage(now) ? now : null) as SeatPoint["stage"] });
  }
  for (const c of g.companies.values()) if (live(c, s, "ownership")) facts.ownership++;
  facts.introducedBy = Object.keys(s.seatPrivate ?? {}).filter((id) => g.engagements.has(id)).length;
  const counts = countTransitions(points);
  const pairs: { from: string; to: string; n: number }[] = [];
  for (const [from, row] of Object.entries(counts.byStage.all ?? {})) for (const [to, n] of Object.entries(row)) pairs.push({ from, to, n });
  pairs.sort((a, b) => b.n - a.n || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  const sum = (stage: string) => Object.values(counts.byStage[stage] ?? {}).reduce((n, row) => n + Object.values(row).reduce((a, b) => a + b, 0), 0);
  const builds = Object.entries(s.salesBuild ?? {}).filter(([id]) => g.companies.has(id));
  return {
    transitions: counts.total,
    companies: counts.companies,
    byStage: RN_REVENUE.map((stage) => ({ stage, n: sum(stage) })),
    top: pairs.slice(0, 8),
    facts,
    salesBuild: { companies: builds.length, rises: builds.reduce((n, [, r]) => n + (r.rises?.length ?? 0), 0) },
    departures: (s.leaderDepartures ?? []).filter((x) => nowMs - Date.parse(x.at) < 180 * DAY_MS).length,
  };
}

function aboutStats(s: State, g: Graph, nowMs: number): NonNullable<AdminStats["about"]> {
  const onFile = { filled: 0, skipped: 0, failed: 0 };
  const reasons = new Map<string, number>();
  for (const [id, st] of Object.entries(s.about?.companies ?? {})) {
    if (!g.companies.has(id)) continue;
    onFile[st.s]++;
    if (st.s !== "filled" && st.why) reasons.set(st.why, (reasons.get(st.why) ?? 0) + 1);
  }
  let waiting = 0;
  let withAbout = 0;
  for (const node of g.companies.values()) {
    if (valueOf(node, s, "about")) withAbout++;
    else if (!s.about?.companies[node.id] && aboutDue(s, node, nowMs)) waiting++;
  }
  return {
    enabled: aboutEnabled(),
    running: aboutProgress.running,
    run: aboutProgress.run ?? s.about?.lastRun ?? null,
    onFile,
    waiting,
    withAbout,
    companies: g.companies.size,
    reasons: [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([why, n]) => ({ why, n })),
  };
}

/* ---------- who leads each function, from company websites (lib/leaders) ---------- */

/** A fractional firm or agency (lib/firmRemoval.ts): its team page lists the fractionals it places, not its own leaders. */
const isFirmNode = (node: CompanyNode, s: State) => !!companyFirm(node.name, live(node, s, "about"), live(node, s, "website"));

/** Whether a company is due a read of its leadership pages, and its record if any. */
function leadersDue(s: State, node: CompanyNode, nowMs: number): { domain: string; prev: LeadersRecord | null } | null {
  const domain = siteKey(live(node, s, "website"));
  // No website, or one on a shared host (a profile or job board page): no site of the company's own to read.
  if (!domain || domain.includes("/")) return null;
  const prev = s.leaders?.[node.id] ?? null;
  if (!prev) return { domain, prev };
  const age = nowMs - Date.parse(prev.checkedAt);
  if (!Number.isFinite(age)) return { domain, prev };
  return age >= (prev.status === "found" ? LEADERS_REFRESH_DAYS : LEADERS_RETRY_DAYS) * DAY ? { domain, prev } : null;
}

/** Per company: an open role there now (2), and what members did there (1 each: a follow, an unlock, a fact a member added, a seat a member added). */
function leadersWeights(seed: Seed, s: State, g: Graph): Map<string, number> {
  const w = new Map<string, number>();
  const bump = (id: string | undefined, n: number) => {
    if (id && g.companies.has(id)) w.set(id, (w.get(id) ?? 0) + n);
  };
  const companyOf = (id: string) => (g.companies.has(id) ? id : g.engagements.get(id)?.companyId ?? g.contacts.get(id)?.companyId);
  const tracks = tracksOf(seed, s);
  const open = new Set<string>();
  for (const e of g.engagements.values()) {
    if (!open.has(e.companyId) && isOpenRole(e, s, tracks)) {
      open.add(e.companyId);
      bump(e.companyId, 2);
    }
  }
  for (const e of s.engagements) if (!isSystem(e.by)) bump(e.companyId, 1);
  for (const list of Object.values(s.follows)) for (const id of list) bump(id, 1);
  for (const [k, who] of Object.entries(s.unlocks)) if (who.length) bump(companyOf(k.slice(0, k.lastIndexOf("."))), 1);
  for (const [k, v] of Object.entries(s.values)) if (!isSystem(v.by)) bump(companyOf(k.slice(0, k.lastIndexOf("."))), 1);
  return w;
}

/**
 * Companies due a read of their leadership pages, the most useful first: companies with an open
 * role or member activity (the busiest first), then the rest; inside each, never read before
 * ahead of read longest ago.
 */
export async function leadersTargets(nowIso?: string): Promise<LeadersTarget[]> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
  const g = graph(seed, s);
  const w = leadersWeights(seed, s, g);
  const out: (LeadersTarget & { w: number })[] = [];
  for (const node of g.companies.values()) {
    const due = leadersDue(s, node, nowMs);
    if (due && !isFirmNode(node, s)) out.push({ companyId: node.id, name: node.name, domain: due.domain, prev: due.prev, w: w.get(node.id) ?? 0 });
  }
  out.sort(
    (a, b) =>
      Number(b.w > 0) - Number(a.w > 0) ||
      b.w - a.w ||
      Number(!!a.prev) - Number(!!b.prev) ||
      (a.prev?.checkedAt ?? "").localeCompare(b.prev?.checkedAt ?? "") ||
      a.companyId.localeCompare(b.companyId),
  );
  return out.map(({ w: _w, ...t }) => t);
}

const leadersHash = (fns: LeadersRecord["functions"]) =>
  createHash("sha256")
    .update(JSON.stringify(Object.keys(fns).sort().map((k) => [k, fns[k].level, fns[k].kind, fns[k].since ?? ""])))
    .digest("base64url")
    .slice(0, 22);

/**
 * Store a batch of leadership reads, each company's record whole (State.leaders): its status, when
 * it was read, the functions found (merged with what was on file, lib/leaders/pick.ts) and the
 * counts for Pilot metrics. A read that could not reach the site keeps the leaders on file and
 * tries again later. Nothing here holds a name. `run` is the run so far. Returns how many were stored.
 */
export function saveLeaders(outcomes: LeadersOutcome[], run: LeadersRunSummary | null, nowIso?: string): Promise<number> {
  return mutate((s, seed) => {
    const now = nowIso ?? new Date().toISOString();
    const all = (s.leaders ??= {});
    const g = graph(seed, s);
    let n = 0;
    const nowMs = Date.parse(now);
    // Departures older than this are let go.
    s.leaderDepartures = (s.leaderDepartures ?? []).filter((x) => nowMs - Date.parse(x.at) < 180 * DAY_MS);
    for (const o of outcomes) {
      if (!g.companies.has(o.companyId)) continue;
      const prev = all[o.companyId];
      const counts = { pages: o.pages, ...(o.team ? { team: true } : {}), ...(o.press ? { press: true } : {}), ...(o.robots ? { robots: o.robots } : {}) };
      if (o.status === "found" || o.status === "none") {
        const functions = mergeFunctions(prev?.functions, o.functions);
        const found = Object.keys(functions).length > 0;
        // A leader on file is gone: only when the last read and this one both read the site (a
        // failure keeps what was on file), and a team page read before was read again.
        if (prev && leadersReadOk(prev) && (!prev.team || o.team))
          for (const [fn, l] of Object.entries(prev.functions))
            if (!functions[fn] && FUNCTIONS.includes(fn) && fn !== "Other") s.leaderDepartures.push({ companyId: o.companyId, fn, kind: l.kind, level: l.level, at: now });
        all[o.companyId] = { status: found ? "found" : "none", checkedAt: now, ok: true, hash: leadersHash(functions), functions, ...(found ? {} : { why: o.why ?? "no leaders found" }), ...counts };
      } else {
        // The site could not be read this time: what is on file stays.
        const functions = prev?.functions ?? {};
        const kept = Object.keys(functions).length > 0;
        all[o.companyId] = { status: kept ? "found" : o.status, checkedAt: now, ok: false, ...(kept && prev?.hash ? { hash: prev.hash } : {}), functions, ...(o.why ? { why: o.why } : {}), ...counts };
      }
      n++;
    }
    if (run) s.leadersRun = { ...run };
    return n;
  });
}

/**
 * The record's last read reached the site and its pages (found or none). A record from before `ok`
 * was kept reads the same from its status and reason: a failure stores its reason, a read never does.
 */
const leadersReadOk = (r: LeadersRecord) => r.ok ?? ((r.status === "found" || r.status === "none") && (!r.why || r.why === "no leaders found"));

/** CompanyRec.leads: the functions with a leader on file, in the order functions are listed. The page's address stays out at a hidden company. */
function leadsOf(s: State, companyId: string, hidden: boolean): CompanyLeads | undefined {
  const r = s.leaders?.[companyId];
  if (!r) return undefined;
  const fns = FUNCTIONS.filter((f) => r.functions[f]).map((fn) => {
    const l = r.functions[fn];
    return { fn, level: l.level, kind: l.kind, ...(l.since ? { since: l.since } : {}), how: l.how, ...(hidden ? {} : { url: l.url }) };
  });
  return fns.length ? { checkedAt: r.checkedAt, fns } : undefined;
}

/** Pilot metrics: the run under way (or the last one), and what is on file. */
function leadersStats(s: State, g: Graph, nowMs: number): NonNullable<AdminStats["leaders"]> {
  const onFile = { companies: 0, read: 0, pages: 0, team: 0, press: 0, functions: 0, fractional: 0, fullTime: 0, none: 0, failed: 0, robots: 0, skipped: 0 };
  const reasons = new Map<string, number>();
  for (const [id, r] of Object.entries(s.leaders ?? {})) {
    if (!g.companies.has(id)) continue;
    onFile.companies++;
    if (r.status === "found" || r.status === "none") onFile.read++;
    if (r.status === "none") onFile.none++;
    if (r.status === "failed") onFile.failed++;
    if (r.status === "skipped") {
      if (r.why === "robots.txt disallows") onFile.robots++;
      else onFile.skipped++;
    }
    if (r.status !== "found" && r.why && r.why !== "no leaders found") reasons.set(r.why, (reasons.get(r.why) ?? 0) + 1);
    onFile.pages += r.pages ?? 0;
    if (r.team) onFile.team++;
    if (r.press) onFile.press++;
    for (const l of Object.values(r.functions)) {
      onFile.functions++;
      if (l.kind === "fractional" || l.kind === "interim") onFile.fractional++;
      if (l.kind === "full-time") onFile.fullTime++;
    }
  }
  let due = 0;
  for (const node of g.companies.values()) if (leadersDue(s, node, nowMs) && !isFirmNode(node, s)) due++;
  return {
    enabled: leadersEnabled(),
    running: leadersProgress.running,
    run: leadersProgress.run ?? s.leadersRun ?? null,
    onFile,
    due,
    reasons: [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([why, n]) => ({ why, n })),
  };
}
