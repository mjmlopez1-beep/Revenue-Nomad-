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
import { emailEnabled, sendEmail, setMailBlock } from "./email";
import { renderDigest } from "./digest";
import { MAX_ROLES, collectOpenRoles, scanSources, type ScanSource } from "./scan/collect";
import { removeScreenedOut } from "./scan/remove";
import { isBelowLead, keepsNonGtm } from "./seniority";
import { aboutWithout, bestPosting, companyKey, companyNameFlag, isPlaceholderCompany, postingRank, sameRoleTitle, textKey, titleWithout, type CompanyNameFlag } from "./scan/clean";
import { checkPostings, fetchPosting, type PostingFetch } from "./scan/posting";
import { atsSources, discover, fetchFeed, type AtsCache, type AtsCompany, type FeedFetch, type SiteFetch } from "./scan/sources/ats";
import {
  ALL_FIELDS, EARN_CAP, INTRO_FIELD, ENGAGEMENT_TYPES, FILLABLE, FRACTIONAL_TYPES, FUNCTIONS, GTM_FUNCTIONS, REFERRAL_BONUS, REFERRAL_LIMIT, cleanValue, fieldDef, functionOf,
  stripInvisible, tidy, HIDDEN_COMPANY, FIND_MIN, FIND_HINT, FIND_NONE, RN_REVENUE, currentValue, standardIndustries, standardList, siteKey, PERSON_BUNDLE, PERSON_DETAILS, SEAT_BUNDLE,
  SEAT_SCAN_ROLE_FREE, COMPANY_PRICE, COMPANY_PRICE_SAY, PRO_OPENS_DAILY, PRO_OPENS_USED, PEERS_FREE, NAME_HIDDEN, OPENS_RULE, type Entity,
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
import { followsHires, hireMonth, startMs } from "./hired";
import { messageStats, reportedMessages, unreadCount, type MessagingState } from "./messageState";
import { emptyConnector, type ConnectorState } from "./mcp/types";
import { alertMatches } from "./mcp/alerts";
import { HuntError, cleanIcp, savedViewAction, savedViewsOut } from "./hunt";
import { pillPlace } from "../app/onboard/place";
import { nameKey, sameName } from "./personName";
import { neverAName } from "./nameWords";
import { claimToken, seatForToken } from "./claimToken";
import { cleanNote, connectText, notePitch } from "./partners";
import type { Icp } from "./tableTypes";
import { integrationStats, type IntegrationsState } from "./notify/types";
import { billingLive, gated, hasPro, planOf, trialDaysLeft, type PlanRecord } from "./plan";
import { healthStats } from "./health";
import {
  ENDING_DAYS, SUMMARY_DAYS, canClose, keepTier, type CloseUse, grandfatherClose, tierNow, tierPrice, FREE_MCP_PER_DAY, FREE_SAVED_VIEWS, PRICES, PRO_CREDITS, TOPUP_CREDITS, annualLine, dueGrantRef, emptyBilling, extendTrial, hourlyOf, keepTrialEnd, pauseState, proStartsLater, startTrial, trialEnding,
  type BillingState,
} from "./billing/rules";
import { aiPackReady, closeReady, surveyCode } from "./billing/stripe";
import { trialSummary, valueCounts, valueLines } from "./billing/emails";
import { CRYSTAL_USED_LINE, FEATURE_NAME, YOUR_FEATURE, radarPrefs, radarStats, type RadarEmail, type RadarState, type RadarStats } from "./radar/types";
import { countTransitions, isStage, type SeatPoint } from "./radar/predict";
import { ABOUT_BY, ABOUT_SOURCE, REFRESH_DAYS, RETRY_DAYS, aboutEnabled, aboutProgress, type AboutOutcome, type AboutRunSummary, type AboutState, type AboutStatus, type AboutTarget } from "./about/types";
import { WEBSITE_FOUND_BY, WEBSITE_FOUND_SOURCE, type WebsitesState } from "./websites/types";
// Own sites: emails fractionals publish on their own firm's website (lib/ownsites), shown only with RN_OWNSITES=1.
import { OWNSITE_RELATIONSHIP, OWNSITE_SOURCE, ownInvitesOnly, ownSitesEnabled, type OwnEmail, type OwnProspect, type OwnSiteLink, type OwnSitesState } from "./ownsites/types";
import {
  REFRESH_DAYS as LEADERS_REFRESH_DAYS, RETRY_DAYS as LEADERS_RETRY_DAYS, KNOWN_DAYS as LEADERS_KNOWN_DAYS, DAILY_BATCH as LEADERS_DAILY_BATCH, READER_VERSION as LEADERS_READER_VERSION, leadersEnabled, leadersProgress, fnKnow, memberRoles, reportsOf, teamReadAt, CONFIRM_MEMBERS,
  type CompanyLeads, type LeadLine, type LeaderReport, type LeadersOutcome, type LeadersRecord, type LeadersRunSummary, type LeadersTarget,
  LEADERS_SOURCE, LEADER_RELATIONSHIP, type LeaderFn, type LeaderHow, type LeaderTop,
} from "./leaders/types";
import { mergeFunctions, mergeTop } from "./leaders/pick";
import { likelyEmail } from "./leaders/likely";
import { fundingAdminStats, type FundingState } from "./funding/types";
import { inSlot } from "./viewQueue";
import { isDue, settingOf, type ScheduleState } from "./schedule";
// [google network] companies a member knows someone at are named for them free (lib/google/types.ts).
import { networkKnown, networkOn, type NetworkState } from "./google/types";
// Your three moves today, and the voice its notes are written in: each member's own (lib/moves.ts, lib/voice.ts).
import { SNOOZE_DAYS, emptyMoveLog, logMove, movesHidden, movesThisMonth, type MoveLog } from "./moves";
// Your pipeline (lib/pipeline.ts): each member's own deals, moved by what Merlin sees. A move's note used opens its entry.
import { addIntro, cleanTo, emptyPipeline, entryAt, isChannel, migrateLeadsToReach, openEntry, pipelineHidden, type PipelineLog } from "./pipeline";
import { VoiceProblem, cleanVoice, type VoiceProfile } from "./voice";
import { forgetMember as forgetRoutes, type RouteStats, type RoutesState } from "./paths/plan";
// Fractionals: one record per fractional (lib/fractionalsCore.ts, lib/fractionals.ts).
import { ACTIVATE_INVITERS_PAID, groupSeats, type SeatLink } from "./fractionalsCore";
// Peers: leads passed, teams and circles (lib/peersCore.ts, lib/peers.ts).
import type { PeersState } from "./peersCore";

import type { MyTemplate, SavedSignature, StoredProposal } from "./proposals/types";
import { aiMeter, budgetOf as aiBudgetOf, noticeSeenIn as aiNoticeSeenIn, type AiUsageRec } from "./proposals/aiUsage";
import { aiConfigured } from "./proposals/aiConfig";
import type { StoredDocument } from "./documents/types";
// The proposals tell the pipeline (lib/proposals/pipelineHook.ts): sent moves the member's deal there to Proposal, signed to Won, declined to Lost,
// inside the same change that sends, signs or declines. Registered once, when the server loads this module.
import { proposalToPipeline, setPipelineHook } from "./proposals/pipelineHook";
setPipelineHook(proposalToPipeline);
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
  /**
   * A private import mark (scripts/add-past-seats.mjs): which match gave the company its facts and
   * which fields it filled, so a wrong best-guess match can be found and undone. Server only: never
   * copied into the graph, a view or an export.
   */
  enrichedBy?: { by: string; match: string; fields: string[]; also?: string[] };
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
  /**
   * The seat holder's one-way person key ("p_" + 20 hex, an HMAC of their profile id under the seed
   * key, scripts/seat-import.mjs personKey): the same on each of one person's seats, current and past.
   * Server only, for grouping one fractional's seats: never copied into the graph, a view or an export.
   */
  holderKey?: string;
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
  /**
   * Each named United States seat holder's own firm (scripts/add-own-sites.mjs), by person key
   * (SeedEngagement.holderKey): its website, or its name for the job to find. Never California.
   * Server only, for lib/ownsites: never in the graph, a view or an export.
   */
  ownSites?: Record<string, OwnSiteLink>;
  /**
   * Prospects (scripts/add-own-sites.mjs): United States fractionals outside California with no
   * named seat and a known own-firm website, by person key, with their name (to match their email and
   * greet them). Outreach only: lib/ownsites reads their site, the admin's sample and the outreach
   * file's join list carry them, and nothing else ever does (no graph, view, export or connector).
   */
  ownSiteProspects?: Record<string, OwnProspect>;
}

interface Added {
  id: string;
  by: string;
  at: string;
}
export interface FieldValue {
  value: string;
  by: string; // member id, "seed", "scan" (the weekly scan; treated like seed), "website" (an About text read from the company's site, lib/about; treated like seed), or "found" (a website Merlin found, lib/websites; treated like seed, never marked for members)
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
  /** peer: a peer took a lead the member passed them (lib/peers.ts), PASS_CREDIT credits within the daily earning cap. */
  reason: "fill" | "unlock" | "refund" | "reversal" | "referral" | "confirm" | "adjust" | "plan" | "topup" | "peer";
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
   * leader (refunds): the member said a company they had just unlocked has a full-time leader, and its website then showed one (payLeaderBack).
   * free (company unlocks): the member's free company of the day (delta 0, see freeCompanyLeft). It
   * counts as COMPANY_PRICE toward the day's unlock limit like a paid one. crystal (company unlocks):
   * Trial or Pro opened a company in their Crystal Ball, free (delta 0, see crystalOf). crystalFull
   * (company unlocks): Free's one Crystal Ball company a UTC day, opened in full (delta 0; every fact
   * there is in State.unlocks with no line of its own). Neither counts toward the day's unlock limit. pending (fills): a fact
   * the member added at a company where their own new seat waits to be confirmed (pendingSeats):
   * it earns 0 until then, and is paid when the seat is confirmed (confirmSeat).
   */
  why?: "closed" | "removed" | "offbar" | "ongoing" | "retract" | "name" | "duplicate" | "leader" | "free" | "crystal" | "crystalFull" | "pending";
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
  /** Turned off the email when a peer passes them a lead or asks them to team up (lib/peers.ts). */
  peerEmailOff?: boolean;
  /** Asked to hear about Pro. */
  proInterest?: boolean;
  /** A seed member's discount code from the address (?code=), for checkout. Joined members keep theirs on their member record. */
  promo?: string;
  /** Who they hunt: their ideal client (lib/hunt.ts). */
  icp?: Icp | null;
  /** Turned off "Show me in Referral partners" (Your profile): other members don't see them listed there. Fractionals reads it as hidden too. */
  partnersOff?: boolean;
  /** "Hide my name on my seats": who held their seats reads NAME_HIDDEN to everyone else, the connector included (State.namesHidden lists them). */
  nameHidden?: boolean;
  /**
   * "Show me in the Fractionals directory": true shows their full name, their seats and the clients
   * they serve to every member, free; false takes them out of the directory. Absent: not chosen yet
   * (Home asks once), and they show by first name and last initial.
   */
  fractionals?: boolean;
  /**
   * Before Notifications: turned Crystal Ball off by email and Slack both (Your profile, or the radar
   * email's unsubscribe link). Read through radarPrefs (lib/radar/types.ts); changing either part
   * on Notifications replaces it with the two below.
   */
  radarOff?: boolean;
  /** How often the Crystal Ball email comes (Notifications, the unsubscribe page): absent is daily. */
  radarEmail?: RadarEmail;
  /** Turned Crystal Ball in Slack off (Notifications). The email is set apart. */
  radarSlackOff?: boolean;
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
  /** Members who hide their name on their seats (Profile.nameHidden), kept apart so reading a cell costs nothing when nobody does. */
  namesHidden?: string[];
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
  /** `promo`: the discount code they arrived with (?code=), applied at checkout (lib/billing). */
  members: (Member & { at: string; referredBy?: string; ipHash?: string; proven?: boolean; promo?: string })[];
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
  held: { memberId: string; delta: number; reason: "referral" | "confirm" | "fill" | "peer"; ref: string; at: string }[];
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
  /**
   * Seats a member added as their own at a company that wasn't on file (a new company, or one whose
   * own first seat still waits). What the member adds at that company earns 0 for now (ledger why
   * "pending") and is paid once the seat is confirmed (confirmSeat): another member confirms a fact
   * on it, or an admin does. Confirmed seats leave the list.
   */
  pendingSeats?: { memberId: string; engagementId: string; companyId: string; at: string }[];
  /**
   * Locked companies a member opened (a locked company's record, or its card expanded), once per
   * member, company and UTC day, for Pilot metrics' demand counts. Admins only ever see counts.
   * The newest LOCKED_VIEWS_KEEP.
   */
  lockedViews?: { memberId: string; companyId: string; day: string }[];
  /** Each member's last visit (written at most once per 6 hours). */
  seen: Record<string, string>;
  scan: ScanState;
  /** Weekly email: last run, emails sent in all, and each member's last one. */
  digest: { lastSentAt: string | null; sent: number; members: Record<string, string> };
  /** One-time changes already applied. starterFloor: the starter balance the floor was last applied at. */
  flags: { starterFloor?: number; closeTier?: boolean; reachStage?: boolean };
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
  /** The website finder (lib/websites): each company's last try (found, with its confidence; none; undone), and the last run. Admins only. The websites are values by "found". */
  websites?: WebsitesState;
  /**
   * Emails fractionals publish on their own firm's website (lib/ownsites), by person key: the
   * address, the page, when, how it was accepted, the site; `pending` from a dry run (never usable).
   * Shown only with RN_OWNSITES=1, as an unlockable email on the seat holder's record (ownSitePeople).
   */
  ownEmails?: Record<string, OwnEmail>;
  /** The own-sites job (lib/ownsites): each person's last try, the last run and dry run, the start-up dry runs done. Admins only. */
  ownSitesJob?: OwnSitesState;
  /**
   * Who leads each function, read from each company's own website (lib/leaders), by internal
   * company id: the function, level, full-time or fractional, since when and the page, and for
   * each function's leader and the top leader the name and title the page prints, kept only at a
   * company with a United States HQ (saveLeaders). They show as decision makers (leaderPeople).
   */
  leaders?: Record<string, LeadersRecord>;
  /**
   * People who asked to be removed (Remove my name) at a company, by internal company id: one-way
   * keys of their name (leaderKey), never the name. A leader read from the website under one of
   * them is never kept or shown there again.
   */
  leadersRemoved?: Record<string, string[]>;
  /** The last run that read leadership pages (lib/leaders/run.ts). */
  leadersRun?: LeadersRunSummary | null;
  /** The daily background read (lib/leaders/run.ts maybeLeaders): the UTC day it last started. */
  leadersDaily?: { day: string; at: string } | null;
  /**
   * Members saying a company has a full-time leader in a function, by internal company id, then
   * function: who said it, the title they picked, when (lib/leaders/types.ts LeaderReport). A fact
   * like any other (it earns 1 credit), never a name. It cuts Crystal Ball's signal there for everyone.
   */
  leaderReports?: Record<string, Record<string, LeaderReport[]>>;
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
  /**
   * A leader the company's own website didn't show for a function before and shows now, read OK
   * both times with a team page both times (lib/table.ts saveLeaders). Crystal Ball's "arrival"
   * signal. Newest last, 180 days kept. No names: the function, level, kind and since when.
   */
  leaderArrivals?: { companyId: string; fn: string; kind: string; level: string; since?: string; at: string }[];
  /**
   * Full-time hires a company's career feed lists in functions besides sales (TEAM_FUNCTIONS in
   * lib/radar/predict.ts: marketing, engineering, finance, people, customer success), by internal
   * company id and function, kept as State.salesBuild is (noteTeamHires). Counts only.
   */
  teamBuild?: Record<string, Record<string, SalesBuildRecord>>;
  /** Each company's employee band as it changed (oldest first), so a crossing of 25 or 50 can be read later. */
  headcount?: Record<string, { band: string; at: string }[]>;
  /** Funding events from SEC Form D filings, matched to companies on file, and each run's counts (lib/funding). No person's name. */
  funding?: FundingState;
  /** [google network] Each member's own network (lib/google/types.ts): private to them, never exported or counted for others. */
  network?: NetworkState;
  /**
   * Your three moves today (lib/moves.ts): what each member did with theirs (done, snoozed, a count
   * a month), by member id. Private to them: never in another member's view, the shared table or the export.
   */
  moves?: Record<string, MoveLog>;
  /**
   * Your pipeline (lib/pipeline.ts): each member's own deals and the intros they asked for, by
   * member id. Private to them: never in another member's view, the shared table or the export.
   */
  pipeline?: Record<string, PipelineLog>;
  /**
   * Each member's writing voice (lib/voice.ts): style conclusions only, never text from a message.
   * Private to them: never in another member's view, the shared table, the export or an admin's panel.
   */
  voice?: Record<string, VoiceProfile>;
  /**
   * Your way in (lib/paths/plan.ts): each member's chosen route at a company, its step, plan B, log
   * and outcomes, by member id then company id. Hop ids only, never a name. Private to them: never
   * in another member's view, the shared table or the export; account closure deletes it.
   */
  routes?: RoutesState;
  /** The outcomes of plans' steps, counted by the step's shape only (lib/paths/plan.ts statKey): no member, company or person. For calibrating Est. success. */
  routeStats?: RouteStats;
  /** Automatic jobs (lib/schedule.ts): the cadences the owner changed in Pilot metrics. The rest follow JOB_DEFAULTS. */
  schedule?: ScheduleState;
  /** Proposals (lib/proposals): each member's own, with their sends and audit trails. Private to them: never in another member's view, the shared table, the export or an admin's panel. */
  proposals?: StoredProposal[];
  /** Documents to sign (lib/documents): each member's own uploads, their fields, signers and audit trails. The PDFs are files on the volume, never here. Private like proposals. */
  documents?: StoredDocument[];
  /** Each member's saved signature (lib/proposals/memberSig.ts), by member id: typed words, or a drawn one's fingerprint (the PNG is a file on the volume). Private like proposals. */
  memberSignatures?: Record<string, SavedSignature>;
  /** "My templates" (lib/proposals/mine.ts): each member's own past proposals, read into sections, by member id. Private like proposals. */
  myTemplates?: Record<string, MyTemplate[]>;
  /** When each member agreed that a transcript may go to Anthropic's API to write a draft (lib/proposals/draft.ts), by member id. */
  aiDrafts?: Record<string, string>;
  /** Each member's Claude usage on Merlin's server, metered in micro-dollars, with their packs and notices (lib/proposals/aiUsage.ts), by member id. Numbers only. Theirs alone: never in another member's view or the export. */
  aiUsage?: Record<string, AiUsageRec>;
  /**
   * Peers (lib/peersCore.ts, lib/peers.ts): leads passed between members, teams pursuing a company
   * together, circles and their monthly threads, mutes. The text in them (a pass's note, a team's
   * draft, a circle post) is members' writing: it leaves the export without it, as messages do.
   */
  peers?: PeersState;
  /**
   * Accounts their member (or an admin) closed (lib/account.ts), by member id: closed at once
   * (signed out, out of Peers and the directory, no email), restorable until purgeAt, then their
   * personal data is deleted (purgeMember) and only this row is left, with purgedAt. `restore` is
   * the SHA-256 of the restore link's key and `mail` of their inbox key (no address is kept here).
   */
  closures?: Record<string, AccountClosure>;
}

/** State.closures[memberId]. */
export interface AccountClosure {
  at: string;
  /** When the scheduled job deletes their personal data (CLOSURE_DAYS after `at`). */
  purgeAt: string;
  by: "member" | "admin";
  /** SHA-256 (hex) of the restore link's key, emailed at closure. Gone once restored or purged. */
  restore?: string;
  /** SHA-256 (hex) of their inbox key: no email goes to that address while the account is closed. */
  mail?: string;
  /** Their personal data was deleted on this date: the account can't come back. */
  purgedAt?: string;
}
/** Days from closing an account to deleting its personal data. Until then the owner, an admin or the member's restore link brings it back. */
export const CLOSURE_DAYS = 30;
/** Who a fact or record is attributed to after its member's account was deleted: nobody (no member has this id). */
export const FORMER_MEMBER = "m_former";
/** An inbox key's hash, for State.closures' mail guard. */
export const mailHashOf = (email: string) => createHash("sha256").update(`rn-closed-mail:${inboxKey(email)}`).digest("hex");

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

let seedCache: { seed: Seed; at: number; fp: string } | null = null;
/** RN_REQUIRE_SEED=1 (set in the Dockerfile): refuse to run on the demo seed. A deploy with a missing or wrong seed key then fails its health check instead of serving sample data. */
const REQUIRE_SEED = process.env.RN_REQUIRE_SEED === "1";
let seedDown: { error: Unavailable; until: number } | null = null;
let seedNoted = false;
export async function loadSeed(): Promise<Seed> {
  if (seedCache && Date.now() - seedCache.at < 60_000) return seedCache.seed;
  if (seedDown && Date.now() < seedDown.until) throw seedDown.error;
  /*
   * The seed is read again each minute, and kept as the same object while what was read is the
   * same (SeedCache.fp): everything worked out from it (the graph, the member index, the shared
   * table) stays worked out, and it isn't parsed again for nothing.
   */
  const same = (fp: string) => {
    if (seedCache?.fp !== fp) return false;
    seedCache.at = Date.now();
    seedDown = null;
    return true;
  };
  const fpOf = (where: string, text: string) => `${where}:${text.length}:${createHash("sha1").update(text).digest("base64")}`;
  let seed: Seed | null = null;
  let fp = "demo";
  for (const p of SEED_CANDIDATES) {
    const text = await fs.readFile(p, "utf8").catch(() => null);
    if (text === null) continue;
    const at = fpOf(p, text);
    if (same(at)) return seedCache!.seed;
    try {
      seed = JSON.parse(text) as Seed;
    } catch {
      seed = null;
    }
    if (seed && Array.isArray(seed.members) && Array.isArray(seed.engagements)) {
      fp = at;
      break;
    }
    seed = null;
  }
  // Hosted deploys: the encrypted seed that ships with the code (data/intel-seed.enc),
  // opened with RN_INTEL_SEED_KEY. See scripts/seal-intel-seed.mjs.
  if (!seed && process.env.RN_INTEL_SEED_KEY) {
    try {
      const text = await fs.readFile(path.join(process.cwd(), "data", "intel-seed.enc"), "utf8");
      const at = fpOf("enc", text);
      if (same(at)) return seedCache!.seed;
      const raw = Buffer.from(text, "base64");
      const decipher = createDecipheriv("aes-256-gcm", Buffer.from(process.env.RN_INTEL_SEED_KEY, "base64"), raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
      const s = JSON.parse(gunzipSync(plain).toString("utf8")) as Seed;
      if (Array.isArray(s.members) && Array.isArray(s.engagements)) {
        seed = s;
        fp = at;
      }
    } catch {
      console.error("RN_INTEL_SEED_KEY is set but data/intel-seed.enc could not be opened; trying other sources.");
    }
  }
  // Older option: the seed as gzip+base64 variables, split across RN_INTEL_SEED_B64, _2, _3 …
  const b64 = [process.env.RN_INTEL_SEED_B64 ?? "", ...[2, 3, 4, 5, 6, 7, 8, 9].map((i) => process.env[`RN_INTEL_SEED_B64_${i}`] ?? "")].join("");
  if (!seed && b64) {
    const at = fpOf("b64", b64);
    if (same(at)) return seedCache!.seed;
    try {
      const s = JSON.parse(gunzipSync(Buffer.from(b64, "base64")).toString("utf8")) as Seed;
      if (Array.isArray(s.members) && Array.isArray(s.engagements)) {
        seed = s;
        fp = at;
      }
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
  if (!seed && same("demo")) return seedCache!.seed;
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
  seedCache = { seed: out, at: Date.now(), fp };
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
    // Close arrived: anyone already on paid Pro stays on Pro, with Close until their next renewal (grandfatherClose). Once.
    if (!s.flags.closeTier) {
      const n = s.billing ? grandfatherClose(s.billing, Date.now()) : 0;
      if (n) console.log(`Kept ${n} paid Pro member${n === 1 ? "" : "s"} on Pro, with Close until their next renewal.`);
      s.flags.closeTier = true;
    }
    // To reach out arrived (lib/pipeline.ts): peers' leads stored at Sent though nothing went out from the member yet move there. Once; every other deal stays.
    if (!s.flags.reachStage) {
      let n = 0;
      for (const log of Object.values(s.pipeline ?? {})) n += migrateLeadsToReach(log);
      if (n) console.log(`Moved ${n} lead${n === 1 ? "" : "s"} a peer passed, not written to yet, to To reach out.`);
      s.flags.reachStage = true;
    }
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
        warmShared();
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
/**
 * `site`: a leader read from the company's own website (source LEADERS_SOURCE, lib/leaders), built
 * from State.leaders by leaderPeople: the page (`url` never spells a name, `page` is where the
 * person was read), when, and how. `likely`: their email is a likely one from the pattern of the
 * emails members added at the company's domain (seedFields.email), this many on file.
 */
type PersonNode = Node & {
  companyId: string;
  engagementId: string | null;
  source: string;
  site?: { url: string; page?: string; at: string; how: LeaderHow };
  likely?: number;
  /**
   * The seat holder, with the email they publish on their own firm's website (ownSitePeople,
   * lib/ownsites): their seat (the name shows as its seat holder does), and the ids of this person's
   * records on their other seats (an email paid for on one is theirs on every one).
   */
  own?: { seat: EngNode; peers: string[] };
};
interface Graph {
  companies: Map<string, CompanyNode>;
  engagements: Map<string, EngNode>;
  contacts: Map<string, PersonNode>;
}
/** Everyone on file at a person's company (graph() fills it, putPerson adds to it): one list a company, the person included. */
const personPeers = new WeakMap<Node, PersonNode[]>();

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
/** Names that are a greeting or a page's words (lib/nameWords.ts neverAName), remembered: the graph is built on every view and action. */
const pageWordNames = new Map<string, boolean>();
function pageWordsName(name: string): boolean {
  let v = pageWordNames.get(name);
  if (v === undefined) {
    v = neverAName(name);
    if (pageWordNames.size > 50_000) pageWordNames.clear();
    pageWordNames.set(name, v);
  }
  return v;
}
/** The fields without one key (a copy; the seed's own object is never changed). */
function withoutKey<T extends object>(o: T, k: string): T {
  const copy = { ...o } as Record<string, unknown>;
  delete copy[k];
  return copy as T;
}
/** Companies with a placeholder name kept because a member holds a seat there, for an admin to review. */
function placeholdersInReview(g: Graph): { companyId: string; name: string }[] {
  return [...g.companies.values()].filter((c) => placeholderName(c.name)).map((c) => ({ companyId: c.id, name: c.name }));
}

/** Companies whose name reads oddly (companyNameFlag, lib/scan/clean.ts), for an admin to review. They stay in the table. */
function oddNamesInReview(g: Graph): { companyId: string; name: string; flag: CompanyNameFlag }[] {
  const out: { companyId: string; name: string; flag: CompanyNameFlag }[] = [];
  for (const c of g.companies.values()) {
    const flag = companyNameFlag(c.name);
    if (flag && !placeholderName(c.name)) out.push({ companyId: c.id, name: c.name, flag });
  }
  return out;
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
  // A name on the seed that is a greeting or a page's words ("Welcome Read", lib/nameWords.ts) shows as nobody named, and a
  // person's as no name (scripts/clean-bad-names.mjs takes them off the seed). A member's own name always stays.
  let members: Set<string> | null = null;
  const badName = (n: string | undefined) => {
    if (!n || !pageWordsName(n)) return false;
    members ??= new Set([...seed.members, ...s.members].map((m) => nameKey(m.name)).filter(Boolean));
    return !members.has(nameKey(n));
  };
  for (const e of seed.engagements)
    if (!out.has(e.companyId)) {
      const bad = badName(e.fields.operator);
      const pub = !bad && e.holderFrom === PUBLIC_PROFILE && !!e.fields.operator;
      if (pub) publicNames++;
      const seedFields = bad ? withoutKey(e.fields, "operator") : e.fields;
      g.engagements.set(e.id, { id: e.id, seedFields, companyId: e.companyId, verified: !!e.verified, source: e.fields.source ?? "Member added", ...(pub ? { holderFrom: PUBLIC_PROFILE } : {}) });
    }
  for (const e of s.engagements)
    if (!g.engagements.has(e.id) && !out.has(e.companyId))
      g.engagements.set(e.id, { id: e.id, seedFields: e.source ? { source: e.source } : {}, companyId: e.companyId, verified: false, source: e.source ?? "Member added" });
  const companyOfEng = (eid: string | null | undefined) => (eid ? g.engagements.get(eid)?.companyId : undefined);
  for (const p of seed.contacts ?? []) {
    const companyId = p.companyId ?? companyOfEng(p.engagementId);
    if (companyId && !out.has(companyId)) g.contacts.set(p.id, { id: p.id, seedFields: badName(p.fields.name) ? withoutKey(p.fields, "name") : p.fields, companyId, engagementId: p.engagementId ?? null, source: p.source ?? "Demand scan" });
  }
  for (const p of s.contacts) {
    const companyId = p.companyId ?? companyOfEng(p.engagementId);
    if (companyId && !out.has(companyId) && !g.contacts.has(p.id)) g.contacts.set(p.id, { id: p.id, seedFields: {}, companyId, engagementId: p.engagementId ?? null, source: "Member added" });
  }
  // Leaders named on each company's own website: decision makers on the record, like any other person there.
  if (s.leaders) leaderPeople(seed, s, g);
  // Everyone on file at each company, for the same person on two records there (samePersonHeld).
  const atCompany = new Map<string, PersonNode[]>();
  for (const p of g.contacts.values()) {
    let list = atCompany.get(p.companyId);
    if (!list) atCompany.set(p.companyId, (list = []));
    list.push(p);
    personPeers.set(p, list);
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
  // The seat holder's email from their own firm's website, only with RN_OWNSITES=1 (lib/ownsites).
  if (s.ownEmails && ownSitesEnabled()) ownSitePeople(seed, s, g);
  // Fractionals: each seat knows its graph, so a cell can find the fractional it belongs to (personIndex).
  graphSeeds.set(g, seed);
  for (const e of g.engagements.values()) engGraphs.set(e, g);
  return g;
}

/* ---------- one record per fractional (Fractionals, lib/fractionals.ts) ---------- */

/** The seed and the graph each seat was built in, for personIndex (a cell is read from its node alone). */
const graphSeeds = new WeakMap<Graph, Seed>();
const engGraphs = new WeakMap<Node, Graph>();
/** Each seat's one-way person key (SeedEngagement.holderKey), read defensively: only "p_" and hex. Never sent anywhere. */
const holderKeyIndex = new WeakMap<Seed, Map<string, string>>();
function seedHolderKeys(seed: Seed): Map<string, string> {
  let m = holderKeyIndex.get(seed);
  if (!m) {
    m = new Map();
    for (const e of seed.engagements) {
      const k = (e as { holderKey?: unknown }).holderKey;
      if (typeof k === "string" && /^[A-Za-z0-9_-]{4,80}$/.test(k)) m.set(e.id, k);
    }
    holderKeyIndex.set(seed, m);
  }
  return m;
}
/**
 * The fractionals on file: named seats (a live seat-holder name, not an open role, not a
 * full-time job) grouped into one record per person by lib/fractionalsCore.ts groupSeats: a
 * member's seats together, then seats sharing a holderKey, else each seat on its own. `member`:
 * the member the record is (their seats resolve to them). `rid`: the record's public id.
 */
interface PersonGroup {
  seats: string[];
  member: string | null;
  rid: string;
}
interface PersonIdx {
  groups: PersonGroup[];
  groupOf: Map<string, number>;
  byRid: Map<string, number>;
}
const personIdxs = new WeakMap<Graph, PersonIdx>();
/** A record's public id: an HMAC of the member's id, or of its first seat's id. Never the person key. */
const recordId = (member: string | null, seats: string[]) =>
  `f_${createHmac("sha256", ID_KEY).update(member ? `fractional:m:${member}` : `fractional:s:${[...seats].sort()[0]}`).digest("base64url").slice(0, 12)}`;
function personIndex(g: Graph, s: State): PersonIdx {
  const hit = personIdxs.get(g);
  if (hit) return hit;
  const seed = graphSeeds.get(g)!;
  const idx = memberIndex(seed, s);
  const keys = seedHolderKeys(seed);
  const links: SeatLink[] = [];
  const memberOf = new Map<string, string>();
  for (const e of g.engagements.values()) {
    const op = valueOf(e, s, "operator");
    if (!op || op.status !== "live" || !op.value.trim()) continue;
    if (openByStatus(e, s)) continue;
    const type = live(e, s, "type");
    if (type && !FRACTIONAL_TYPES.includes(type)) continue;
    const m = seatHolder(s, idx, e.id, op);
    if (m) memberOf.set(e.id, m.id);
    links.push({ id: e.id, member: m?.id ?? null, key: keys.get(e.id) ?? null });
  }
  const { groups, groupOf } = groupSeats(links, (m, id) => (s.notMine[m] ?? []).includes(id));
  const out: PersonIdx = { groups: [], groupOf, byRid: new Map() };
  for (const seats of groups) {
    const member = seats.map((id) => memberOf.get(id)).find(Boolean) ?? null;
    const rid = recordId(member, seats);
    out.byRid.set(rid, out.groups.length);
    out.groups.push({ seats, member, rid });
  }
  personIdxs.set(g, out);
  return out;
}
/** The fractional a seat belongs to, read from the graph its node was built in. */
function personOf(s: State, node: Node | undefined): { p: PersonIdx; gr: PersonGroup; g: Graph } | null {
  const g = node ? engGraphs.get(node) : undefined;
  if (!g || !graphSeeds.has(g)) return null;
  const p = personIndex(g, s);
  const gi = p.groupOf.get(node!.id);
  return gi === undefined ? null : { p, gr: p.groups[gi], g };
}
/** The purchase of a fractional (one of their seats' "who held it", either half, or the person from Fractionals) is the member's. */
function boughtSeat(s: State, memberId: string, g: Graph, engId: string): boolean {
  if ((s.unlocks[fkey(engId, "operator")] ?? []).includes(memberId) || (s.unlocks[fkey(engId, "person")] ?? []).includes(memberId)) return true;
  return (s.unlocks[fkey(engId, "role")] ?? []).includes(memberId) && seatBundled(g.engagements.get(engId), s);
}
/**
 * The member bought this fractional (FRACTIONAL_BUNDLE): who held one of their seats (or its role,
 * the other half of that one purchase), or the person on Fractionals. Then who held each of their
 * seats, and each seat's role with it (SEAT_BUNDLE: holding the name half opens the role), shows
 * to them at no charge. True on a seat of that fractional.
 */
function personHeld(s: State, me: Member | null, node: Node | undefined): boolean {
  if (!me || !node) return false;
  const at = personOf(s, node);
  if (!at) return false;
  return at.gr.seats.some((id) => boughtSeat(s, me.id, at.g, id));
}
/**
 * A member who said "Show me in the Fractionals directory" (Profile.fractionals true) and has signed
 * in: who held each of their seats, and the role, are free to every member (never signed out).
 */
function personShown(s: State, node: Node | undefined): boolean {
  const at = personOf(s, node);
  if (!at?.gr.member) return false;
  const p = s.profiles[at.gr.member];
  return p?.fractionals === true && !p.partnersOff;
}
/** The other free ways to see who held a seat and its role: the fractional bought, or shown in the directory. */
function personFree(s: State, me: Member | null, node: Node | undefined, entity: Entity, key: string): boolean {
  if (!me || !node || entity !== "engagement" || (key !== "operator" && key !== "role")) return false;
  if (key === "role" && !seatBundled(node, s)) return false;
  return personShown(s, node) || personHeld(s, me, node);
}
/**
 * A member who keeps out of the Fractionals directory (they said no, or turned Referral partners
 * off): their privacy choice, so who held their seats keeps its price for others.
 */
function peerPrivate(s: State, node: Node | undefined): boolean {
  const at = personOf(s, node);
  if (!at?.gr.member) return false;
  const p = s.profiles[at.gr.member];
  return p?.fractionals === false || (p?.fractionals === undefined && !!p?.partnersOff);
}
/**
 * The member who holds this seat and hides their name on their seats (Profile.nameHidden), or null.
 * Free when nobody hides theirs. `idx` finds a holder the person index leaves out (an open role claimed).
 */
function hiddenHolder(s: State, node: Node | undefined, idx?: MemberIndex): string | null {
  if (!s.namesHidden?.length || !node) return null;
  let m = personOf(s, node)?.gr.member ?? null;
  if (!m && idx) m = seatHolder(s, idx, node.id, valueOf(node, s, "operator"))?.id ?? null;
  return m && s.namesHidden.includes(m) ? m : null;
}
/** Who held this seat is a member who hides their name (for anyone but them): never name them, in any view. */
export function holderNameHidden(s: State, node: Node | undefined, viewer?: string | null, idx?: MemberIndex): boolean {
  const h = hiddenHolder(s, node, idx);
  return !!h && h !== viewer;
}
/** The company of a seat is open to the member (identityHidden reads the state the seat was built in). */
function seatCompanySeen(s: State, me: Member, node: Node): boolean {
  const g = engGraphs.get(node);
  const seed = g ? graphSeeds.get(g) : undefined;
  if (!g || !seed) return false;
  // identityHidden reads no tracks.
  return !identityHidden(g, s, memberIndex(seed, s), null as unknown as Tracks, me, (node as EngNode).companyId);
}
/**
 * Fellow fractionals are free to see (PEERS_FREE): who held a seat and the role they held (a seat
 * whose holder is on file) open at no charge to a signed-in member once the company is open to
 * them (`visible`, else read from the state). Not for a member who keeps out of the directory
 * (peerPrivate). Names that Remove my name took off, the US-only names rule and
 * RN_UNVERIFIED_NAMES_UNTIL already leave no name on the seat to show.
 */
function peerFree(s: State, me: Member | null, node: Node | undefined, entity: Entity, key: string, visible?: boolean): boolean {
  if (!PEERS_FREE || !me || !node || entity !== "engagement") return false;
  if (key !== "operator" && !(key === "role" && seatBundled(node, s))) return false;
  const op = valueOf(node, s, "operator");
  if (!op || op.status !== "live" || peerPrivate(s, node)) return false;
  return visible ?? seatCompanySeen(s, me, node);
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
  // A fractional bought on Fractionals through this seat ("<seat>.person") bought this name too: it comes back the same way.
  const back = refundPaid(s, k, now, "name") + refundPaid(s, fkey(engId, "person"), now, "name");
  (s.names ??= emptyNames()).removed[engId] = { at: now, how };
  // Their email from their own website goes with the name, on every seat of theirs, and is never read again.
  if (seedCache) ownEmailOff(s, seedCache.seed, engId, now);
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
  const m = memberByTokenRaw(seed, token, s);
  // A closed account (State.closures) is signed out everywhere at once, until it is restored.
  return m && s?.closures?.[m.id] ? null : m;
};
const memberByTokenRaw = (seed: Seed, token: string | null | undefined, s?: State): Member | null => {
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
const EARNING = new Set(["fill", "referral", "confirm", "peer"]);
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
function grant(s: State, memberId: string, delta: number, reason: "referral" | "confirm" | "peer", ref: string, now: string): number {
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
    // A fact's own credit (a confirmed seat's, held at the cap) goes on its own 0 row, so the fact counts once.
    if (pay > 0 && h.reason === "fill") payFillRow(s, memberId, h.ref, pay, now);
    else if (pay > 0) s.ledger.push({ memberId, delta: pay, reason: h.reason, ref: h.ref, at: now });
    if (h.delta > pay) keep.push({ ...h, delta: h.delta - pay });
  }
  s.held = keep;
}

/** Pay a fact's credit onto the 0 row it earned at first (dated now, so it counts in today's 25). */
function payFillRow(s: State, memberId: string, ref: string, delta: number, now: string): void {
  const i = s.ledger.findIndex((l) => l.memberId === memberId && l.reason === "fill" && l.ref === ref && l.delta === 0 && !l.undone);
  if (i < 0) {
    s.ledger.push({ memberId, delta, reason: "fill", ref, at: now });
    return;
  }
  const [row] = s.ledger.splice(i, 1);
  delete row.why;
  s.ledger.push({ ...row, delta, at: now });
}

/** The record a ledger ref is about belongs to this company (a company, a seat or a person there). */
function refCompany(s: State, g: Graph, ref: string): string | null {
  const id = refRecord(ref);
  if (g.companies.has(id)) return id;
  const e = g.engagements.get(id)?.companyId ?? s.engagements.find((x) => x.id === id)?.companyId;
  if (e) return e;
  const p = g.contacts.get(id);
  return p?.companyId ?? g.engagements.get(p?.engagementId ?? "")?.companyId ?? s.contacts.find((x) => x.id === id)?.companyId ?? null;
}

/** Facts waiting on a seat of theirs to be confirmed, still standing: what "+N when confirmed" counts. */
function pendingFor(s: State, memberId: string): number {
  let n = 0;
  for (const l of s.ledger) if (l.memberId === memberId && l.reason === "fill" && l.why === "pending" && !l.undone && s.values[l.ref]?.status === "live" && s.values[l.ref].by === memberId) n++;
  return n;
}

/**
 * A member's own seat at a company that wasn't on file is confirmed (another member confirmed a
 * fact on it, or an admin did): every fact they added at that company while it waited is paid now,
 * within the daily cap (the rest is held and paid as room frees). Returns the credits it earned.
 */
function confirmSeat(s: State, g: Graph, engId: string, now: string): number {
  const p = (s.pendingSeats ?? []).find((x) => x.engagementId === engId);
  if (!p) return 0;
  // Every seat of theirs waiting at that company counts as confirmed with it.
  s.pendingSeats = (s.pendingSeats ?? []).filter((x) => !(x.memberId === p.memberId && x.companyId === p.companyId));
  let n = 0;
  for (const l of [...s.ledger]) {
    if (l.memberId !== p.memberId || l.reason !== "fill" || l.why !== "pending" || l.undone) continue;
    if (refCompany(s, g, l.ref) !== p.companyId) continue;
    const v = s.values[l.ref];
    if (!v || v.status !== "live" || v.by !== p.memberId) {
      delete l.why; // taken back or removed while it waited: nothing to pay
      continue;
    }
    const room = Math.max(0, EARN_CAP - earning(s, p.memberId, Date.parse(now)).earned);
    if (room > 0) payFillRow(s, p.memberId, l.ref, 1, now);
    else {
      delete l.why;
      s.held.push({ memberId: p.memberId, delta: 1, reason: "fill", ref: l.ref, at: now });
    }
    n++;
  }
  return n;
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
  const paidForName =
    (s.unlocks[fkey(engId, "operator")] ?? []).includes(inviterId) || (s.unlocks[fkey(engId, "role")] ?? []).includes(inviterId) || personHeld(s, idx.byId.get(inviterId) ?? null, g.engagements.get(engId));
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
  // The free company of the day counts the same as a paid one. A company opened free from Crystal Ball doesn't count (the member's own Crystal Ball bounds those),
  // and nor do Pro's free opens (PRO_OPENS_DAILY bounds those).
  const pro = proOpens(s, memberId, nowMs);
  for (const l of s.ledger)
    if (l.memberId === memberId && l.reason === "unlock" && nowMs - Date.parse(l.at) < DAY && !CRYSTAL_WHY.has(l.why ?? "") && !(pro && l.why === "free")) used += l.why === "free" ? COMPANY_PRICE : Math.max(1, -l.delta);
  const joinedAt = s.members.find((m) => m.id === memberId)?.at;
  const firstDay = !!joinedAt && nowMs - Date.parse(joinedAt) < DAY;
  return { left: Math.max(0, (firstDay ? NEW_MEMBER_UNLOCK_MAX : UNLOCK_DAILY_MAX) - used), firstDay };
}

/**
 * The free company of the day: a Trial or Pro member (and every member while billing is off)
 * unlocks one company a UTC day for no credits, anywhere. It makes the company theirs like a paid
 * unlock and counts toward the day's unlock limits (unlockRoom). It doesn't roll over. True while
 * today's is still left. Never on Free while billing is live: there the free one a day is Crystal
 * Ball's, opened in full from Crystal Ball only (crystalOf).
 */
function freeCompanyLeft(s: State, memberId: string, nowMs: number): boolean {
  return freeCompaniesLeft(s, memberId, nowMs) > 0;
}
/**
 * Free company opens left today (UTC day). Trial and Pro (billing live): PRO_OPENS_DAILY a day, any
 * company, fair use (Crystal Ball's stay free and don't count). Billing off: the one free company
 * of the day, as before. Free while billing is live: none (its free one is Crystal Ball's).
 */
function freeCompaniesLeft(s: State, memberId: string, nowMs: number): number {
  // A test server only (RN_SCAN_TEST=1): RN_FREE_COMPANY=off leaves it out, for the suites that check what paid unlocks cost.
  if (process.env.RN_SCAN_TEST === "1" && process.env.RN_FREE_COMPANY === "off") return 0;
  if (gated(planRec(s, memberId), nowMs)) return 0;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const used = s.ledger.filter((l) => l.memberId === memberId && l.reason === "unlock" && l.why === "free" && l.at.slice(0, 10) === today).length;
  return Math.max(0, (proOpens(s, memberId, nowMs) ? PRO_OPENS_DAILY : 1) - used);
}
/** Pro and the trial with billing live: companies open free, up to PRO_OPENS_DAILY a UTC day (freeCompaniesLeft). */
const proOpens = (s: State, memberId: string, nowMs: number) => billingLive() && hasPro(planRec(s, memberId), nowMs);

/** Me's plan counts: Pro's free company opens left today. (Free has no earning taper: it earns up to EARN_CAP a day like every plan.) */
function planCounts(s: State, _g: Graph, _idx: MemberIndex, memberId: string, nowMs: number): Pick<Me, "proOpens"> {
  const out: Pick<Me, "proOpens"> = {};
  if (proOpens(s, memberId, nowMs)) out.proOpens = { left: freeCompaniesLeft(s, memberId, nowMs), of: PRO_OPENS_DAILY };
  return out;
}
/** Get started's last two steps (Me.started): a first note out (a deal at Sent, an invite or a conversation), and Google or LinkedIn connections in. */
function startedOf(s: State, memberId: string): NonNullable<Me["started"]> {
  const note =
    (s.pipeline?.[memberId]?.entries ?? []).some((e) => !!e.dates?.sent) || (s.seatInvites ?? []).some((x) => x.by === memberId) || (s.conversations ?? []).some((c) => c.a === memberId);
  const net = s.network?.[memberId];
  const network = !!net?.google || !!net?.gmail || !!(s as State & { paths?: Record<string, { linkedin?: unknown }> }).paths?.[memberId]?.linkedin;
  return { note, network, ...(networkOn() ? {} : { networkOff: true }) };
}
/** Company unlocks from Crystal Ball (LedgerEntry.why): they cost nothing and the day's limit doesn't count them. */
const CRYSTAL_WHY = new Set(["crystal", "crystalFull"]);
/**
 * How a company in the member's Crystal Ball opens from Crystal Ball and the Today card (Me.crystal):
 * "all" on Trial and Pro (every one free, as radar names them: lib/radar isPro), "one" or "used" on
 * Free while billing is live (one a UTC day, opened in full: the day boundary the free company of
 * the day uses), null while billing is off (the 2-credit unlock and the free company of the day, as anywhere).
 */
function crystalOf(s: State, memberId: string, nowMs: number): "all" | "one" | "used" | null {
  const rec = planRec(s, memberId);
  if (hasPro(rec, nowMs)) return "all";
  if (!gated(rec, nowMs)) return null;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  return s.ledger.some((l) => l.memberId === memberId && l.reason === "unlock" && l.why === "crystalFull" && l.at.slice(0, 10) === today) ? "used" : "one";
}
/** The credit history's words for it (LedgerRow.reason). */
export const FREE_COMPANY_LINE = "Free company of the day";
/** The same on Trial and Pro, where companies open free up to PRO_OPENS_DAILY a day. */
export const PRO_OPEN_LINE = "Opened free on Pro";
/** The credit history's words for a company opened free from Crystal Ball (Trial and Pro), and for Free's one a day. */
export const CRYSTAL_LINE = `Opened free from ${FEATURE_NAME}`;
export const CRYSTAL_FULL_LINE = `Free ${FEATURE_NAME} company of the day`;
/** Free, after today's Crystal Ball company: the refusal, and the line Crystal Ball shows. */
export const CRYSTAL_USED = CRYSTAL_USED_LINE;
/** A request to open free a company that isn't in the member's Crystal Ball. */
export const CRYSTAL_NOT_IN = `That company isn't in your ${FEATURE_NAME}, so it doesn't open free. Unlock it for ${COMPANY_PRICE_SAY}.`;
/** Said after the unlock that used it. */
export const FREE_COMPANY_USED = "That was your free company today, so it cost no credits. The next one is free tomorrow.";
/** Fractionals: a fellow fractional's name and work history cost nothing (PEERS_FREE). */
export const FRACTIONALS_FREE = "Fellow fractionals are free to see on Merlin, so nothing was spent.";
/** Trial and Pro: said after a company opened free (PRO_OPENS_DAILY a day), with how many are left today. */
export const PRO_OPEN_FREE = "It opened free.";
export const proOpenLine = (left: number) =>
  // The day's first free open says the rule (OPENS_RULE); the rest count down.
  left === PRO_OPENS_DAILY - 1
    ? `${PRO_OPEN_FREE} ${OPENS_RULE}`
    : left > 0
      ? `${PRO_OPEN_FREE} ${left} of today's ${PRO_OPENS_DAILY} free opens left.`
      : `${PRO_OPEN_FREE} That was the last of today's ${PRO_OPENS_DAILY}. More open free tomorrow.`;

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

/**
 * The committed state's values, confirmations and unlocks by record, then field: what
 * s.values[fkey(id, field)] reads, without making that key for every read (a view reads a few
 * million). The committed state is never changed in place (stateCache); a draft inside mutate()
 * is, so it is read by its keys (byField). Kept for the latest state only.
 */
type ByRecord<T> = Map<string, Map<string, T>>;
type Keyed = "values" | "verifications" | "unlocks";
let recordIndex: { s: State; values?: ByRecord<FieldValue>; verifications?: ByRecord<string[]>; unlocks?: ByRecord<string[]> } | null = null;
function byRecord<K extends Keyed>(s: State, which: K): ByRecord<State[K][string]> {
  if (recordIndex?.s !== s) recordIndex = { s };
  const kept = recordIndex[which] as ByRecord<State[K][string]> | undefined;
  if (kept) return kept;
  const all = s[which] as Record<string, State[K][string]>;
  const out: ByRecord<State[K][string]> = new Map();
  for (const k in all) {
    // A field's key has no dot, so the last dot of a key is the one between the record and the field.
    const dot = k.lastIndexOf(".");
    if (dot < 0) continue;
    const id = k.slice(0, dot);
    let m = out.get(id);
    if (!m) out.set(id, (m = new Map()));
    m.set(k.slice(dot + 1), all[k]);
  }
  (recordIndex as Record<string, unknown>)[which] = out;
  return out;
}
/** For the checks (scripts/test-viewcache.mts): while `f` runs, every read is by its key, as a draft is read. */
let readByKey = false;
export async function readingByKey<T>(f: () => Promise<T>): Promise<T> {
  readByKey = true;
  try {
    return await f();
  } finally {
    readByKey = false;
  }
}
/** s[which][fkey(id, field)], read through byRecord on the committed state. */
function byField<K extends Keyed>(s: State, which: K, id: string, field: string): State[K][string] | undefined {
  if (s === stateCache && !readByKey && !field.includes(".")) return byRecord(s, which).get(id)?.get(field);
  return (s[which] as Record<string, State[K][string]>)[fkey(id, field)];
}
/** Effective value: a runtime value wins over the seed value. */
function valueOf(node: Node | undefined, s: State, field: string): FieldValue | null {
  if (!node) return null;
  const v = byField(s, "values", node.id, field);
  if (v) return v.status === "removed" ? null : v;
  const sv = node.seedFields[field];
  if (!sv) return null;
  // A seat holder named from public profiles says so (FieldValue.pub).
  return field === "operator" && (node as EngNode).holderFrom === PUBLIC_PROFILE ? { value: sv, by: "seed", at: "", status: "live", pub: true } : { value: sv, by: "seed", at: "", status: "live" };
}
/** Values from our own records (the seed) or the weekly scan: nobody earned a credit for them. */
const isSystem = (by: string) => by === "seed" || by === "scan" || by === ABOUT_BY || by === WEBSITE_FOUND_BY;
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
  // A closed account is nobody on Merlin while it is closed: out of Peers, the directory, every list and every email (State.closures).
  const all = [...seed.members, ...s.members].filter((m) => m.name?.trim() && !s.closures?.[m.id]);
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
/** A person's paid facts: name and title, then LinkedIn, email and phone. */
const CONTACT_GATED = ALL_FIELDS.filter((x) => x.entity === "contact" && x.f.gated).map((x) => x.f.key);
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
 * of a seat Revenue Nomad found that nobody is named on (scanRoleFree). With PEERS_FREE, who held a
 * seat and the role they held are free to a signed-in member at a company they can see (peerFree):
 * `peer` says whether they see it, else it is read from the state.
 */
function cellOf(s: State, me: Member | null, node: Node | undefined, entity: Entity, key: string, idx?: MemberIndex, free = false, peer?: boolean): Cell {
  // A seat holder's record from their own website (ownSitePeople): their name is who held the seat and their title its role,
  // shown and sold with the seat (SEAT_BUNDLE), never apart.
  const own = entity === "contact" ? (node as PersonNode | undefined)?.own : undefined;
  if (own && (key === "name" || key === "title")) {
    const c = cellOf(s, me, own.seat, "engagement", key === "name" ? "operator" : "role", idx, false, peer);
    if (c.s === "value") return { s: "value", v: c.v, ver: c.ver, from: "research" };
    if (c.s === "locked") return { s: "locked", ver: c.ver, from: "research" };
    return c.s === "reported" ? { s: "locked", ver: 0, from: "research" } : c;
  }
  if (entity === "engagement" && ((key === "end" && endFree(node, s)) || (key === "role" && scanRoleFree(node, s)))) free = true;
  // A holder who hides their name on their seats: the seat says NAME_HIDDEN to everyone else (nothing to sell), and its role
  // opens with the company as a fellow fractional's does. Their own view keeps their name.
  if (entity === "engagement" && (key === "operator" || key === "role") && holderNameHidden(s, node, me?.id, idx)) {
    if (key === "operator") return valueOf(node, s, "operator")?.status === "live" ? { s: "value", v: NAME_HIDDEN, ver: 0 } : { s: "empty" };
    if (!free && me && seatBundled(node, s) && seatCompanySeen(s, me, node!)) free = true;
  }
  // Fractionals: a member shown in the directory has who held their seats, and the roles, free to every member.
  if (!free && me && entity === "engagement" && (key === "operator" || (key === "role" && seatBundled(node, s))) && personShown(s, node)) free = true;
  // Fellow fractionals: who held a seat, with the role, free once the member sees the company.
  if (!free && peerFree(s, me, node, entity, key, peer)) free = true;
  const f = fieldDef(entity, key)!;
  const v = valueOf(node, s, f.key);
  if (!v) return { s: "empty" };
  if (f.system) return { s: "value", v: v.value, ver: 0, system: true, ...(v.by === ABOUT_BY ? { from: "website" as const } : {}) };
  const mine = !!me && v.by === me.id;
  const byMe = !!me && !!v.reporters?.includes(me.id);
  if (v.status === "reported") return { s: "reported", mine, ...(byMe ? { byMe } : {}) };
  // One report hides a fact only for the member who reported it.
  if (byMe) return { s: "reported", mine: false, byMe };
  const vers = byField(s, "verifications", node!.id, f.key) ?? [];
  // Only members' confirmations count. A fact from our own records or the scan says where it came from instead.
  const ver = vers.length;
  // (The "Active" a member's claim puts on an open role is written as the scan's, but no posting said it.)
  const fromScan = v.by === "scan" && !(key === "status" && v.value === "Active");
  // A seat holder named from public profiles reads as Revenue Nomad research, the seat's own source.
  // A leader read from the company's website says so, and a likely email says how many emails on file it was read from.
  const site = entity === "contact" && v.by === "seed" ? (node as PersonNode).site : undefined;
  const likely = site && key === "email" && (node as PersonNode).likely ? (node as PersonNode).likely! : 0;
  // The seat holder's email read from their own firm's website (lib/ownsites): "From their website".
  const ownEmail = !!own && key === "email" && v.by === "seed";
  const from = ownEmail
    ? ({ from: "ownsite" } as const)
    : likely
    ? ({ from: "pattern", likely } as const)
    : site
      ? ({ from: "website" } as const)
      : v.by === "seed"
        ? ({ from: node!.research?.has(key) || v.pub ? "research" : "records" } as const)
        : fromScan
          ? ({ from: "posting" } as const)
          : {};
  // A person's title comes with their name, and the name with the title (PERSON_BUNDLE). A seat's role comes with who held it, and the other way round (SEAT_BUNDLE).
  const paid =
    !!me &&
    !mine &&
    !!f.gated &&
    ((byField(s, "unlocks", node!.id, f.key) ?? []).includes(me.id) ||
      holdsPersonPartner(s, me, node, entity, key) ||
      holdsSeatPartner(s, me, node, entity, key) ||
      samePersonHeld(s, me, node, entity, key) ||
      ownEmailHeld(s, me, node, entity, key) ||
      // Fractionals: the member bought this fractional (one of their seats, or the person): every seat of theirs shows who held it, with the role.
      (entity === "engagement" && (key === "operator" || (key === "role" && seatBundled(node, s))) && personHeld(s, me, node)));
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
  nameRaw: unknown, emailRaw: unknown, ref?: unknown, ip = "local", operatorSecret?: string | null, promoRaw?: unknown,
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
      const closed = s.closures?.[(seedMember ?? joined)!.id];
      if (closed && !closed.purgedAt) throw new ActionError(ACCOUNT_CLOSED_JOIN);
      // A member back through the survey link: their code waits for checkout too.
      if (emailEnabled() && cleanPromo(promoRaw)) setPromo(s, (seedMember ?? joined)!.id, cleanPromo(promoRaw));
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
      // The discount code from the landing page (?code=), kept so checkout applies it later.
      ...(cleanPromo(promoRaw) ? { promo: cleanPromo(promoRaw) } : {}),
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
/** The member paid for this person's name and title (either half): an add of their own does not count here. */
const paidForName = (s: State, me: Member, q: Node) =>
  (s.unlocks[fkey(q.id, "name")] ?? []).includes(me.id) || (!!valueOf(q, s, "title") && (s.unlocks[fkey(q.id, "title")] ?? []).includes(me.id));
/** A contact detail as two records are compared: an email or a LinkedIn address in any case, a phone by its digits. */
const detailKey = (key: string, v: string) =>
  key === "phone"
    ? v.replace(/\D/g, "")
    : key === "linkedin"
      ? v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#]+$/, "")
      : v.trim().toLowerCase();
/**
 * The same person on two records at one company (a person is kept per company or per seat, so one
 * decision maker can be on file twice). Two records are the same person when they are at the same
 * company and their names match by sameName (lib/personName.ts). Once a member has paid for one
 * record's name and title, every same-person record there shows its name and title to them at no
 * charge. A contact detail (LinkedIn, email, phone) comes over only when the other record's value
 * is the one the member paid for on the first. A name that doesn't match leaves the record locked
 * as it was. Read from the names on file now, for this member's own purchases only, so it covers
 * unlocks made before this rule and never reaches another member. True when `me` sees `key` on
 * `node` this way.
 */
function samePersonHeld(s: State, me: Member | null, node: Node | undefined, entity: Entity, key: string): boolean {
  if (!me || !node || entity !== "contact") return false;
  const bundle = PERSON_BUNDLE.includes(key);
  if (!bundle && !PERSON_DETAILS.includes(key)) return false;
  const peers = personPeers.get(node);
  if (!peers || peers.length < 2) return false;
  const p = node as PersonNode;
  const name = valueOf(p, s, "name");
  if (!name || name.status !== "live") return false;
  const own = bundle ? null : valueOf(p, s, key);
  if (!bundle && (!own || own.status !== "live" || !detailKey(key, own.value))) return false;
  for (const q of peers) {
    if (q === p || q.companyId !== p.companyId) continue;
    const qn = valueOf(q, s, "name");
    if (!qn || qn.status !== "live" || qn.reporters?.includes(me.id) || !paidForName(s, me, q) || !sameName(name.value, qn.value)) continue;
    if (bundle) return true;
    const qv = valueOf(q, s, key);
    if (qv && qv.status === "live" && !qv.reporters?.includes(me.id) && (s.unlocks[fkey(q.id, key)] ?? []).includes(me.id) && detailKey(key, qv.value) === detailKey(key, own!.value)) return true;
  }
  return false;
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
  // A fractional bought on Fractionals (".person") names nobody's company: it opens no company.
  for (const k in s.unlocks) if (s.unlocks[k].includes(me.id) && !k.endsWith(".person")) add(nodeOfKey(k));
  for (const b of s.benchRates) if (b.by === me.id) add(b.engagementId);
  for (const c of s.names?.claims ?? []) if (c.memberId === me.id && c.status === "approved") add(c.engagementId);
  for (const e of g.engagements.values()) if (!out.has(e.companyId) && seatHolder(s, idx, e.id, valueOf(e, s, "operator"))?.id === me.id) out.add(e.companyId);
  // [google network] someone they really know there (Calendar, Contacts, Gmail, or saved from their own Claude). RN_GOOGLE=1 only.
  for (const id of networkKnown(s, me.id)) if (g.companies.has(id)) out.add(id);
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
  if (networkKnown(s, me.id).has(companyId)) return true; // [google network]
  const engs = [...g.engagements.values()].filter((e) => e.companyId === companyId);
  const ids = new Set<string>([companyId, ...engs.map((e) => e.id)]);
  for (const p of g.contacts.values()) if (p.companyId === companyId) ids.add(p.id);
  const at = (k: string) => ids.has(k.slice(0, k.lastIndexOf(".")));
  for (const k in s.values) if (at(k) && s.values[k].by === me.id) return true;
  for (const k in s.unlocks) if (at(k) && !k.endsWith(".person") && s.unlocks[k].includes(me.id)) return true;
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
      // A recent seat started in the last two years and hasn't ended. A start with only a year reads as its December (lib/hired.ts startMs), as in the app.
      const started = startMs(live(e, s, "start"));
      if (Number.isFinite(started) && now - started < 2 * 365 * DAY && live(e, s, "status") !== "Ended") recent++;
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
export async function buildView(token: string | null, opts: { asMember?: boolean; fresh?: boolean } = {}): Promise<View> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  // A member's table from the shared part and their own companies (sharedView). Admins, and `fresh` (the checks compare the two), build it whole.
  if (me && !opts.fresh && !isAdmin(me)) return memberView(seed, s, me);
  if (me) return fullView(seed, s, me, !!opts.asMember && isAdmin(me));
  if (statsCache && statsCache.seed === seed && Date.now() - statsCache.at < ANON_FRESH)
    return { demo: !!seed.demo, me: null, companies: [], stats: statsCache.stats, ledger: [], reported: [], email: emailEnabled(), contact: contactInfo(), version: viewVersion(statsCache.s) };
  return anonView(seed, s);
}

/* ---------- a member's table: the shared part, and their own companies ---------- */

/**
 * Nobody: a member with nothing on file, who added, paid for, confirmed, reported, follows and
 * holds nothing, and whose name is no seat holder's. Every company reads the same to every member
 * who has nothing to do with it, and that is how it reads to Nobody, so the shared part of every
 * member's table is built once, for Nobody. It never goes out as anyone's Me.
 */
const NOBODY: Member = { id: "\u0000nobody", name: "\u0000", email: "", title: "", token: "\u0000" };
/**
 * How long the shared part serves after it was built whole: a few of its values move with the
 * clock (when a role was last seen, a leaders' read), so it is built whole again after this, and
 * on a new UTC day. Until then a change to the state builds again only the companies it reached
 * (nobodyChanges), or the whole part when it reached more than facts and confirmations.
 */
export const SHARED_KEEP_MS = 5 * 60_000;
interface SharedPart {
  seed: Seed;
  s: State;
  /** When it was last built whole: built from the one before, it keeps that time, so it is built whole again SHARED_KEEP_MS after. */
  at: number;
  day: string;
  /** Nobody's record of each company, by internal id, in the graph's order (fullView's before it sorts). */
  recs: Map<string, CompanyRec>;
  /** Nobody's stats (their facts count every company's known and locked facts). */
  stats: View["stats"];
}
let shared: { seed: Seed; s: State; at: number; day: string; p: Promise<SharedPart> } | null = null;
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
let sharedBuilds = 0;
let sharedPatches = 0;
/** For the checks: how many times the shared part was built whole, and from the one before. */
export const sharedViewStats = () => ({ builds: sharedBuilds, patches: sharedPatches });

/** When a member's table last read the shared part: warming it after a change is worth it only while members load tables. */
let sharedAskedAt = 0;
/** After a change, the shared part is built again in the background once the state has been quiet this long... */
const WARM_AFTER_MS = 750;
/** ...while a member's table was built in the last this long. */
const WARM_WHILE_MS = 10 * 60_000;
let warmTimer: ReturnType<typeof setTimeout> | null = null;
/** A change was committed: build the shared part for it in the background (in the view queue), so the next member's table is ready sooner. */
function warmShared() {
  if (warmTimer) clearTimeout(warmTimer);
  warmTimer = null;
  if (!sharedAskedAt || Date.now() - sharedAskedAt > WARM_WHILE_MS) return;
  warmTimer = setTimeout(() => {
    warmTimer = null;
    void inSlot(async () => {
      const [seed, s] = await Promise.all([loadSeed(), loadState()]);
      await sharedPart(seed, s);
    }).catch(() => {});
  }, WARM_AFTER_MS);
  warmTimer.unref?.();
}

/*
 * What a change can do to Nobody's records. Most of the state never reaches them: Nobody paid for,
 * follows, confirmed, claimed and invited nothing, has no credits, plan, saved views or messages,
 * and the counts by member never show. Those parts (NOBODY_BLIND) can change at will. A fact or a
 * confirmation changes the records of its own company only. Who has signed in matters only by who
 * (a seat holder on Merlin reads as a member). Anything else that changed, and any part of the
 * state this list doesn't know, builds the shared part whole again.
 */
const NOBODY_BLIND = new Set([
  "ledger", "held", "unlocks", "follows", "referralPaid", "reportLog", "signals", "lockedViews", "digest", "connector", "integrations", "radar", "inviteJoins",
  "billing", "found", "findMisses", "seatInvites", "seatPrivate", "benchRates", "n", "at", "firstAt", "hist",
  // A member's moves and writing voice are theirs alone: Nobody has neither, and no record reads them.
  "moves", "voice",
  // Each member's pipeline is theirs alone too.
  "pipeline",
]);
/** Per fact or confirmation: these change the records of the company they are at. */
const BY_RECORD = new Set(["values", "verifications"]);
/** Only who is in them matters, together (signedIn): a timestamp moving, or a member who had signed in already, changes nothing Nobody sees. */
const BY_WHO = new Set(["seen", "profiles", "ips"]);
const sameJson = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
/** Two facts the same, field by field (a fact is a small flat record; its reporters a list). */
const sameFact = (a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    const x = a[k];
    const y = b[k];
    if (x === y) continue;
    if (Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((v, i) => v === y[i])) continue;
    if (x && y && typeof x === "object" && typeof y === "object" && sameJson(x, y)) continue;
    return false;
  }
  return true;
};
/** Everyone signedIn counts as signed in, as it reads them: a member who joined, or has a seen time, a profile or an address on file. */
const signedInIds = (s: State) => {
  const ids = new Set(s.members.map((m) => m.id));
  for (const [k, v] of Object.entries(s.seen ?? {})) if (v) ids.add(k);
  for (const [k, v] of Object.entries(s.profiles ?? {})) if (v) ids.add(k);
  for (const [k, v] of Object.entries(s.ips ?? {})) if (v?.length) ids.add(k);
  return [...ids].sort().join("\u0000");
};
/**
 * The companies whose Nobody record may read differently on `b` than on `a`, both committed
 * states with the same seed: the companies of the facts and confirmations that changed. Null when
 * anything else changed that Nobody can see, or the companies themselves changed: build it whole.
 */
function nobodyChanges(a: State, b: State, ga: Graph, gb: Graph): Set<string> | null {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = new Set<string>();
  const coOf = (nodeId: string) => {
    for (const g of [gb, ga]) {
      const c = g.companies.has(nodeId) ? nodeId : (g.engagements.get(nodeId)?.companyId ?? g.contacts.get(nodeId)?.companyId);
      if (c) return c;
    }
    return null;
  };
  // Fractionals: a seat's holder free to every member hangs on their whole record (personShown), so a
  // change on one seat, or in "Show me in the Fractionals directory", reaches every seat of theirs.
  const recordCos = (engId: string) => {
    for (const [g, s] of [[ga, a], [gb, b]] as const) {
      if (!graphSeeds.has(g)) continue;
      const p = personIndex(g, s);
      const gi = p.groupOf.get(engId);
      if (gi !== undefined) for (const id of p.groups[gi].seats) out.add(g.engagements.get(id)!.companyId);
    }
  };
  const showOf = (p: Profile | undefined) => `${p?.fractionals ?? ""}|${!!p?.partnersOff}`;
  for (const id of new Set([...Object.keys(a.profiles ?? {}), ...Object.keys(b.profiles ?? {})])) {
    if (showOf(a.profiles?.[id]) === showOf(b.profiles?.[id])) continue;
    for (const [g, s] of [[ga, a], [gb, b]] as const) {
      if (!graphSeeds.has(g)) continue;
      for (const gr of personIndex(g, s).groups) if (gr.member === id) for (const e of gr.seats) out.add(g.engagements.get(e)!.companyId);
    }
  }
  for (const key of keys) {
    if (NOBODY_BLIND.has(key)) continue;
    const x = (a as unknown as Record<string, unknown>)[key];
    const y = (b as unknown as Record<string, unknown>)[key];
    if (BY_WHO.has(key)) continue;
    if (BY_RECORD.has(key)) {
      const xa = (x ?? {}) as Record<string, Record<string, unknown> | string[]>;
      const ya = (y ?? {}) as Record<string, Record<string, unknown> | string[]>;
      for (const k of new Set([...Object.keys(xa), ...Object.keys(ya)])) {
        const u = xa[k];
        const v = ya[k];
        const same = Array.isArray(u) || Array.isArray(v) ? Array.isArray(u) && Array.isArray(v) && u.length === v.length && u.every((m, i) => m === v[i]) : sameFact(u as Record<string, unknown>, v as Record<string, unknown>);
        if (same) continue;
        const c = coOf(k.slice(0, k.lastIndexOf(".")));
        if (!c) return null;
        out.add(c);
        if (key === "values" && k.endsWith(".operator")) recordCos(k.slice(0, k.lastIndexOf(".")));
      }
      continue;
    }
    if (!sameJson(x, y)) return null;
  }
  if (signedInIds(a) !== signedInIds(b)) return null;
  // The same companies, seats and people in both, in the same order (the table's order breaks ties by it).
  if (ga.companies.size !== gb.companies.size || ga.engagements.size !== gb.engagements.size || ga.contacts.size !== gb.contacts.size) return null;
  const ia = ga.companies.keys();
  for (const id of gb.companies.keys()) if (ia.next().value !== id) return null;
  // And each seat and person still at the company it was at.
  for (const e of gb.engagements.values()) if (ga.engagements.get(e.id)?.companyId !== e.companyId) return null;
  for (const c of gb.contacts.values()) if (ga.contacts.get(c.id)?.companyId !== c.companyId || ga.contacts.get(c.id)?.engagementId !== c.engagementId) return null;
  return out;
}
/** Past this many companies to build again, building the shared part whole is about as quick. */
const NOBODY_PATCH_MAX = 400;

/** The shared part for this state, built once however many members ask for it at the same time. */
function sharedPart(seed: Seed, s: State): Promise<SharedPart> {
  const nowMs = Date.now();
  const day = utcDay(nowMs);
  if (shared && shared.seed === seed && shared.s === s && shared.day === day && nowMs - shared.at < SHARED_KEEP_MS) return shared.p;
  // The one before, still fresh by the clock: build only the companies a change reached (nobodyChanges).
  const before = shared && shared.seed === seed && shared.day === day && nowMs - shared.at < SHARED_KEEP_MS ? shared : null;
  const p = (async (): Promise<SharedPart> => {
    const g = viewGraph(seed, s);
    const prev = before ? await before.p.catch(() => null) : null;
    const changed = prev && prev.s !== s ? nobodyChanges(prev.s, s, viewGraph(seed, prev.s), g) : null;
    if (prev && changed && changed.size <= NOBODY_PATCH_MAX) {
      sharedPatches++;
      const v = await fullView(seed, s, NOBODY, false, changed, false);
      const fresh = new Map(v.companies.map((c) => [c.id, c]));
      const recs = new Map<string, CompanyRec>();
      let people = 0;
      let friendly = 0;
      let open = 0;
      let facts = 0;
      for (const id of g.companies.keys()) {
        const rec = changed.has(id) ? fresh.get(pubId(id)) : prev.recs.get(id);
        if (!rec) continue;
        recs.set(id, rec);
        if (rec.friendly.tier === "High" || rec.friendly.tier === "Medium") friendly++;
        open += rec.friendly.open;
        facts += rec.facts.known + rec.facts.locked;
      }
      for (const c of g.contacts.values()) if (g.companies.has(c.companyId)) people++;
      // fullView's stats for a few companies count those only: the whole table's are worked out here, as fullView counts them.
      return { seed, s, at: prev.at, day, recs, stats: { ...v.stats, people, fractionalFriendly: friendly, openRoles: open, facts } };
    }
    sharedBuilds++;
    const v = await fullView(seed, s, NOBODY, false, null, false);
    const byPub = new Map(v.companies.map((c) => [c.id, c]));
    const recs = new Map<string, CompanyRec>();
    for (const id of g.companies.keys()) {
      const rec = byPub.get(pubId(id));
      if (rec) recs.set(id, rec);
    }
    return { seed, s, at: nowMs, day, recs, stats: v.stats };
  })();
  // Only the committed state is kept (a draft inside mutate() changes in place), and a build that failed is not.
  if (s === stateCache) {
    // Built from the one before, it is as old as that one was (SharedPart.at) once it is done.
    const entry = { seed, s, at: before ? before.at : nowMs, day, p };
    shared = entry;
    p.then((part) => shared === entry && (entry.at = part.at), () => shared === entry && (shared = null));
  }
  return p;
}

/**
 * The companies whose record reads differently for `me` than for Nobody: any they know
 * (knownCompanies: added to, paid for, held a seat at, know through their network), follow, have
 * confirmed or reported a fact at, asked to claim a seat at, invited a seat holder from, wrote a
 * seat's "Who introduced you" at, said who leads a function at, or have a line in their credit
 * history about. More than that is only slower: each one is built for `me` alone, exactly as
 * their whole table would build it.
 */
function ownCompanies(g: Graph, s: State, idx: MemberIndex, me: Member): Set<string> {
  const out = new Set(knownCompanies(g, s, idx, me));
  const coOf = (nodeId: string) => (g.companies.has(nodeId) ? nodeId : (g.engagements.get(nodeId)?.companyId ?? g.contacts.get(nodeId)?.companyId));
  const add = (nodeId: string | null | undefined) => {
    const c = nodeId ? coOf(nodeId) : undefined;
    if (c) out.add(c);
  };
  const nodeOfKey = (k: string) => (k.includes(".") ? k.slice(0, k.lastIndexOf(".")) : k);
  for (const id of s.follows[me.id] ?? []) add(id);
  for (const k in s.values) {
    const v = s.values[k];
    if (v.by === me.id || v.reportedBy === me.id || v.reporters?.includes(me.id)) add(nodeOfKey(k));
  }
  for (const k in s.verifications) if (s.verifications[k].includes(me.id)) add(nodeOfKey(k));
  for (const k in s.unlocks) if (s.unlocks[k].includes(me.id)) add(nodeOfKey(k));
  // Fractionals: a fractional they bought shows who held each of their seats, at every company those seats are at.
  if (g.engagements.size && graphSeeds.has(g)) {
    const p = personIndex(g, s);
    for (const gr of p.groups) if (gr.seats.length > 1 && gr.seats.some((id) => boughtSeat(s, me.id, g, id))) for (const id of gr.seats) add(id);
  }
  for (const c of s.names?.claims ?? []) if (c.memberId === me.id) add(c.engagementId);
  for (const x of s.seatInvites ?? []) if (x.by === me.id) add(x.engagementId);
  for (const [engId, note] of Object.entries(s.seatPrivate ?? {})) if (note.by === me.id) add(engId);
  for (const [co, byFn] of Object.entries(s.leaderReports ?? {})) if (Object.values(byFn).some((list) => (list ?? []).some((x) => x.by === me.id))) add(co);
  for (const r of s.reportLog) if (r.memberId === me.id) add(nodeOfKey(r.ref));
  for (const l of s.ledger) if (l.memberId === me.id) add(nodeOfKey(l.ref));
  for (const e of s.engagements) if (e.by === me.id) add(e.id);
  for (const c of s.companies) if (c.by === me.id) out.add(c.id);
  for (const b of s.benchRates) if (b.by === me.id) add(b.engagementId);
  return out;
}

/**
 * A member's table (not an admin's): Nobody's record of every company they have nothing to do
 * with (sharedPart), and their own companies (ownCompanies) built for them, with their Me,
 * credit history, benchmarks and scan summary, in the table's order. The counts that depend on
 * the viewer (facts) are Nobody's with their own companies' swapped in. The same view fullView
 * builds whole: scripts/test-viewcache.mts compares the two for every member it can.
 */
async function memberView(seed: Seed, s: State, me: Member): Promise<View> {
  sharedAskedAt = Date.now();
  const part = await sharedPart(seed, s);
  const g = viewGraph(seed, s);
  const own = ownCompanies(g, s, memberIndex(seed, s), me);
  const v = await fullView(seed, s, me, false, own);
  const mine = new Map(v.companies.map((c) => [c.id, c]));
  const companies: CompanyRec[] = [];
  let facts = part.stats.facts;
  for (const [id, rec] of part.recs) {
    const r = own.has(id) ? mine.get(pubId(id)) : undefined;
    if (!r) {
      companies.push(rec);
      continue;
    }
    facts += r.facts.known + r.facts.locked - rec.facts.known - rec.facts.locked;
    companies.push(r);
  }
  companies.sort(companyOrder);
  // fullView's facts for `only` count its companies and the facts hidden only for this viewer (they reported them): the latter stay.
  const hiddenForMe = v.stats.facts - v.companies.reduce((n, c) => n + c.facts.known + c.facts.locked, 0);
  return { ...v, companies, stats: { ...part.stats, facts: facts + hiddenForMe, openedWeek: v.stats.openedWeek } };
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
 * host, nothing else (the icon is read from the company's own site).
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
  return site && !site.includes("/") ? site : null;
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
  opts: { asMember?: boolean; since?: string; benchmarks?: boolean; found?: boolean; /** The most companies built (PATCH_MAX unless given: today's moves look at more). */ max?: number } = {},
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
  const many = cos.size > (opts.max ?? PATCH_MAX);
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

/** Someone already on file at a company under a name (onFileAt). */
export interface OnFile {
  /** The member added that name there themselves: an Add of it is refused ("You already added"). */
  mine: boolean;
  /** The member already confirmed the name (an earlier Add of it). */
  confirmed: boolean;
  /** The facts an Add sends (a title, how they relate to the seat) that are still empty on that record: each earns 1 credit. */
  empty: ("title" | "relationship")[];
}
/**
 * Who is on file at a company under a name, as the member's Add of that name there would find them
 * (putPerson's own match: the same name, or a leader read from the company's website by first and
 * last name), for the suggestions on Your network's "Your seat" card (lib/google): what an Add would
 * do before the member taps it. The name is the member's own contact's, and the answer says no more
 * than the Add's own answer would ("already on file"). Null: nobody of that name is on file there.
 */
export function onFileAt(seed: Seed, s: State, memberId: string, companyId: string): (name: string) => OnFile | null {
  const g = viewGraph(seed, s);
  const here = [...g.contacts.values()].filter((p) => p.companyId === companyId);
  return (typed) => {
    const key = normName(typed ?? "");
    if (!key || !here.length) return null;
    const same = here.filter((p) => {
      const n = valueOf(p, s, "name")?.value ?? "";
      return normName(n) === key || (!!p.site && sameName(n, typed));
    });
    if (!same.length) return null;
    if (same.some((p) => valueOf(p, s, "name")?.by === memberId)) return { mine: true, confirmed: true, empty: [] };
    const into = same.find((p) => valueOf(p, s, "name")?.status === "live");
    if (!into) return null;
    const confirmed = (s.verifications[fkey(into.id, "name")] ?? []).includes(memberId);
    const empty = (["title", "relationship"] as const).filter((k) => !valueOf(into, s, k));
    return { mine: false, confirmed, empty };
  };
}

/**
 * The member's own move log, as today's moves read it (lib/movesView.ts): the companies hidden
 * from their moves right now (done lately or snoozed), by public id, and how many moves they
 * marked done this calendar month. Null when the token is nobody's.
 */
export async function moveState(token: string | null, nowMs = Date.now()): Promise<{ hidden: Set<string>; month: number } | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) return null;
  const log = s.moves?.[me.id];
  // A company in their pipeline (lib/pipeline.ts pipelineHidden) lives there, not in today's moves.
  const hidden = new Set([...movesHidden(log, nowMs), ...pipelineHidden(s.pipeline?.[me.id], nowMs)]);
  return { hidden: new Set([...hidden].map((id) => pubId(id))), month: movesThisMonth(log, nowMs) };
}

/**
 * save_my_voice (the connector): the style conclusions the member's own Claude summarised from
 * their sent mail, checked like the app's own save (lib/voice.ts cleanVoice: one value from each
 * list, no other field, short clean phrases), kept for that member alone. Throws VoiceProblem.
 */
export async function saveVoice(memberId: string, raw: unknown, by: VoiceProfile["by"] = "claude"): Promise<VoiceProfile> {
  const style = cleanVoice(raw);
  return mutate((s) => {
    const v: VoiceProfile = { ...style, at: new Date().toISOString(), by };
    (s.voice ??= {})[memberId] = v;
    return v;
  });
}
/** A member's saved voice, or null. Only ever asked for the member themself. */
export async function voiceOf(memberId: string): Promise<VoiceProfile | null> {
  const s = await loadState();
  const v = s.voice?.[memberId];
  return v ? { ...v, phrases: [...(v.phrases ?? [])] } : null;
}

/**
 * GET /api/table?today=1&since=ISO: what changed for the member since `sinceIso` (their previous
 * visit), as Today's "Since Tuesday" line counts it, without the full view. `roles`: open roles
 * first seen since then, in `fn` when they have one (as the scan summary counts them: not one a
 * clean scan no longer saw, not one below the seniority bar). `follows`: companies they follow
 * with a fact newer than then (the table's updatedAt, as "since your last visit" reads it). Counts
 * only, nothing that names a company. Null when the token is nobody's.
 */
export async function todayCounts(token: string | null, sinceIso: string, fn: string | null): Promise<{ roles: number; follows: number } | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) return null;
  const g = viewGraph(seed, s);
  const tracks = tracksOf(seed, s);
  const madeBy = new Map(s.engagements.map((e) => [e.id, e.by]));
  let roles = 0;
  for (const e of g.engagements.values()) {
    const t = tracks.get(e.id);
    if (!t || t.closedAt || isUnseen(t) || t.firstSeen <= sinceIso || !isOpenRole(e, s, tracks)) continue;
    if (offBarRole(e, s, tracks, madeBy.get(e.id) === "scan") || (fn && fnOf(e, s) !== fn)) continue;
    roles++;
  }
  // Each followed company, its seats (as the table lists them) and its people: the records whose facts date the company.
  const followed = new Set((s.follows[me.id] ?? []).filter((id) => g.companies.has(id)));
  const coOfNode = new Map<string, string>();
  for (const c of followed) coOfNode.set(c, c);
  for (const e of g.engagements.values()) if (followed.has(e.companyId) && !offBarRole(e, s, tracks, madeBy.get(e.id) === "scan")) coOfNode.set(e.id, e.companyId);
  for (const p of g.contacts.values()) if (followed.has(p.companyId)) coOfNode.set(p.id, p.companyId);
  const changed = new Set<string>();
  if (coOfNode.size)
    for (const k in s.values) {
      const v = s.values[k];
      if (v.status !== "live" || v.at <= sinceIso) continue;
      const dot = k.indexOf(".");
      const co = coOfNode.get(k.slice(0, dot));
      if (co && FIELD_KEYS.has(k.slice(dot + 1))) changed.add(co);
    }
  return { roles, follows: changed.size };
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
 * The table's order: the friendliest first; locked companies after the named ones of the same
 * score, in the order of their public ids (an order by the real name, or the seed's, which is
 * close to it, would say where each name falls); named ones by name.
 */
const companyOrder = (a: CompanyRec, b: CompanyRec) =>
  b.friendly.score - a.friendly.score || Number(!!a.hidden) - Number(!!b.hidden) || (a.hidden && b.hidden ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.name.localeCompare(b.name));

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
  /** The company being built is open to the viewer (known, or named in this answer): its seat holders show free (peerFree). */
  let peerVis = false;
  const cell = (node: Node | undefined, entity: Entity, key: string, free = false): Cell => {
    const c = cellOf(s, me, node, entity, key, idx, free, peerVis);
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
    peerVis = !!me && (admin || !!known?.has(c.id) || !!found?.has(c.id));
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
      // A leader from the company's website: the page they were read on goes out only to a viewer who sees their name (its address may spell it).
      const site = p.site ? { at: p.site.at, url: cells.name?.s === "value" ? p.site.page ?? p.site.url : p.site.url } : undefined;
      return { id: pubId(p.id), engagementId: p.engagementId ? pubId(p.engagementId) : null, source: p.source, cells, ...(site ? { site } : {}) };
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
      // A leader's page on the company's own site would name the company.
      for (const p of coPeople) if (p.site) delete p.site.url;
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
    const leads = leadsOf(s, c.id, hidden, me?.id);
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
  companies.sort(companyOrder);

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
        addedBy: v.by === "seed" ? "Revenue Nomad records" : v.by === "scan" ? "Weekly scan" : v.by === ABOUT_BY ? ABOUT_SOURCE : v.by === WEBSITE_FOUND_BY ? WEBSITE_FOUND_SOURCE : memberName(v.by),
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
        if (l.ref.endsWith(".operator") || l.ref.endsWith(".person")) holdersUnlocked++;
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
      // A peer took a lead the member passed them (lib/peers.ts).
      if (l.reason === "peer") {
        ledger.push({ at: l.at, delta: l.delta, reason: "A peer took the lead you passed", company: "", field: "" });
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
      // Credits back for a full-time leader the member told us about, that the company's website then showed (payLeaderBack).
      if (l.reason === "refund" && l.why === "leader") {
        ledger.push({ at: l.at, delta: l.delta, reason: LEADER_REFUND, company: companyNameOf(id), field: "" });
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
      // The free company of the day: "Free company of the day", then the company (theirs now).
      if (l.reason === "unlock" && l.why === "free") {
        ledger.push({ at: l.at, delta: l.delta, reason: proOpens(s, me.id, nowMs) ? PRO_OPEN_LINE : FREE_COMPANY_LINE, company: companyNameOf(id), field: "" });
        continue;
      }
      // Opened free from Crystal Ball (Trial and Pro), or Free's one Crystal Ball company of the day, then the company (theirs now).
      if (l.reason === "unlock" && (l.why === "crystal" || l.why === "crystalFull")) {
        ledger.push({ at: l.at, delta: l.delta, reason: l.why === "crystal" ? CRYSTAL_LINE : CRYSTAL_FULL_LINE, company: companyNameOf(id), field: "" });
        continue;
      }
      // A fractional bought on Fractionals: no company to name (it opened none).
      if ((l.reason === "unlock" || l.reason === "refund") && field === "person" && !l.why) {
        ledger.push({ at: l.at, delta: l.delta, reason: l.reason, company: "", field: FRACTIONAL_LABEL });
        continue;
      }
      // A fact the member took back (retract): "Took back the HQ", then "at Acme".
      if (l.reason === "reversal" && l.why === "retract") {
        ledger.push({ at: l.at, delta: l.delta, reason: `Took back ${say(entityOf(id), field)}`, company: companyNameOf(id), field: "" });
        continue;
      }
      ledger.push({ at: l.at, delta: l.delta, reason: l.reason, company: companyNameOf(id), field: l.reason === "unlock" || l.reason === "refund" ? boughtLabel(entityOf(id), id, field) : ledgerLabel(entityOf(id), field), ...(l.why === "pending" ? { pending: true as const } : {}) });
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
      freeCompany: freeCompanyLeft(s, me.id, nowMs),
      ...((c) => (c ? { crystal: c } : {}))(crystalOf(s, me.id, nowMs)),
      ...planCounts(s, g, idx, me.id, nowMs),
      started: startedOf(s, me.id),
      sellEarnLeft: Math.max(0, SELL_EARN_MAX - sellToday(s, me.id, nowMs, pickExempt(s, me.id, ownSeatAt)).earned),
      earned24h: earned,
      earnCap: EARN_CAP,
      earnResetsAt: resetsAt,
      held: heldFor(s, me.id),
      pending: pendingFor(s, me.id),
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
      peerEmail: !prof.peerEmailOff,
      partners: !prof.partnersOff,
      // Fractionals: "Show me in the Fractionals directory" (null: not chosen yet). Referral partners' old switch off reads as out.
      fractionals: prof.fractionals ?? (prof.partnersOff ? false : null),
      // "Hide my name on my seats".
      nameHidden: !!prof.nameHidden,
      radar: ((x) => x.email !== "off" || x.slack)(radarPrefs(prof)),
      // Notifications: how often the Crystal Ball email comes, and whether it posts to Slack.
      radarEmail: radarPrefs(prof).email,
      radarSlack: radarPrefs(prof).slack,
      proInterest: !!prof.proInterest,
      // Who they hunt, and their saved views (one list with the connector's saved searches).
      icp: prof.icp ?? null,
      savedViews: savedViewsOut(s.connector?.alerts?.[me.id]),
      // Who usually gets hired before them (left out when never asked), their first view while it is
      // saved, and onboarding's answers so far while they are still in it. Only ever their own.
      ...(Array.isArray(prof.before) ? { before: [...prof.before] } : {}),
      firstView: prof.firstView && (s.connector?.alerts?.[me.id] ?? []).some((x) => x.id === prof.firstView && x.place) ? prof.firstView : null,
      draft: !prof.onboarded && prof.draft ? { ...prof.draft } : null,
      // Their own writing voice (lib/voice.ts), when they saved one.
      ...(s.voice?.[me.id] ? { voice: { ...s.voice[me.id], phrases: [...(s.voice[me.id].phrases ?? [])] } } : {}),
      clientCount: prof.clientCount ?? null,
      looking: typeof prof.looking === "boolean" ? prof.looking : null,
      // Their plan, only while billing is live (lib/billing). Without it nothing is gated.
      ...(billingLive() ? { plan: planView(s, me.id, nowMs, { tracks, fnOfEng: (engId) => { const e = g.engagements.get(engId); return e ? fnOf(e, s) : null; } }) } : {}),
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
/** Credits back for a full-time leader a member told us about, which the company's website then showed (payLeaderBack). */
const LEADER_REFUND = "You were right: credits back";
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
/** A fractional bought on Fractionals: who held each of their seats, with the roles. */
export const FRACTIONAL_LABEL = "A fractional's name and roles";
const fieldLabel = (entity: Entity, field: string) =>
  entity === "engagement" && field === "person"
    ? FRACTIONAL_LABEL
    : entity === "company" && field === "identity"
    ? HIDDEN_COMPANY
    : entity === "company" && field.startsWith(FT_LEADER_REF)
      ? `Full-time ${field.slice(FT_LEADER_REF.length)} leader`
      : fieldDef(entity, field)?.label ?? field;
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

/**
 * Demand for locked companies (State.lockedViews), as counts: views in the last 7 and 30 days,
 * the members behind them, and how many of those views the same member went on to unlock (a
 * company unlock of theirs on the view's day or after). Never which company or which member.
 */
function lockedViewStats(s: State, nowMs: number): NonNullable<AdminStats["lockedViews"]> {
  const bought = new Map<string, string>(); // `${member} ${company}` -> first unlock day
  for (const l of s.ledger) {
    if (l.reason !== "unlock" || !l.ref.endsWith(".identity")) continue;
    const k = `${l.memberId} ${refRecord(l.ref)}`;
    const d = l.at.slice(0, 10);
    if (!bought.has(k) || d < bought.get(k)!) bought.set(k, d);
  }
  const count = (days: number) => {
    const from = new Date(nowMs - days * DAY).toISOString().slice(0, 10);
    const rows = (s.lockedViews ?? []).filter((v) => v.day > from);
    // An unlock on or after a view's day: bought after looking (a later unlock of a company opened on two days counts once a view).
    const unlocked = rows.filter((v) => (bought.get(`${v.memberId} ${v.companyId}`) ?? "") >= v.day).length;
    return { views: rows.length, members: new Set(rows.map((v) => v.memberId)).size, unlocked };
  };
  const w = count(7);
  const m = count(30);
  return { views7: w.views, members7: w.members, unlocked7: w.unlocked, views30: m.views, members30: m.members, unlocked30: m.unlocked };
}

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
      .concat(placeholdersInReview(g).map((r) => ({ companyId: pubId(r.companyId), company: r.name, reason: "placeholder name", at: "" })))
      // A name that may be real but reads oddly (a bare domain, digits only, 1 or 2 characters): listed, never left out.
      .concat(oddNamesInReview(g).map((r) => ({ companyId: pubId(r.companyId), company: r.name, reason: `name is ${r.flag}`, at: "" }))),
    walls: { members: walled.size, hits },
    lockedViews: lockedViewStats(s, nowMs),
    pendingSeats: (s.pendingSeats ?? [])
      .filter((p) => idx.byId.has(p.memberId) && g.engagements.has(p.engagementId))
      .map((p) => ({
        memberId: pubId(p.memberId),
        name: idx.byId.get(p.memberId)!.name,
        company: g.companies.get(p.companyId)?.name ?? "",
        engagementId: pubId(p.engagementId),
        at: p.at,
        credits: s.ledger.filter((l) => l.memberId === p.memberId && l.reason === "fill" && l.why === "pending" && !l.undone && refCompany(s, g, l.ref) === p.companyId && s.values[l.ref]?.status === "live").length,
      })),
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
    // Health (lib/health.ts): the funnel, retention, facts, credits, invites and plans, counts only.
    health: healthStats({
      s,
      nowMs,
      starter: STARTER_CREDITS,
      entityOf,
      isMember: (id) => idx.byId.has(id),
      billing: billingLive(),
      seatImports: seed.engagements.filter((e) => e.addedAt).map((e) => ({ at: e.addedAt!, facts: Object.values(e.fields).filter(Boolean).length })),
    }),
    radar: radarStats(
      s.radar,
      s.signals,
      s.profiles,
      // Members whose radar is on (its email, or Slack with Slack connected) and can match something: signed in, a function, an Ideal Fractional Profile.
      idx.all.filter((m) => {
        const p = s.profiles[m.id];
        const fn = p?.function ?? functionOf(p?.title || m.title);
        const icp = p?.icp;
        return signedIn(s, idx, m.id) && ((x) => x.email !== "off" || (x.slack && [s.integrations?.members[m.id]?.slack, s.integrations?.members[m.id]?.webhook].some((d) => !!d && !d.broken)))(radarPrefs(p)) && !!fn && fn !== "Other" && !!icp && !!(icp.industries.length || icp.employees.length || icp.revenue.length || icp.countries.length);
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
/** Locked companies counted as viewed per member per UTC day (State.lockedViews), and how many rows are kept. */
const LOCKED_VIEWS_DAILY_MAX = 200;
const LOCKED_VIEWS_KEEP = 50_000;
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

/** How long an unlock that spent credits can be taken back from its toast (the page's Undo, UNDO_MS). */
export const UNLOCK_UNDO_MS = 10_000;
/** A little more on the server, for the trip there. */
const UNLOCK_UNDO_GRACE_MS = 3_000;
/**
 * Unlocks that spent credits in the last moments, by `${memberId}|${at}`: what each opened for the
 * member (every unlock key it added them to, the free parts of a bundle included), so Undo locks
 * exactly that again. Kept in memory only: after a restart the window has long passed.
 */
const recentUnlocks = new Map<string, { keys: string[]; at: number }>();
export const UNDO_TOO_LATE = "It's too late to undo that unlock, so it stays yours.";
export const UNDO_AFTER = "You've done more since that unlock, so it stays yours.";
/** Said when a move names a company that isn't in the member's Crystal Ball. */
export const MOVE_NOT_IN = `That company isn't in your ${FEATURE_NAME} any more, so it has no move. Refresh Home for today's.`;
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

/** Why a seat's credits wait (pendingSeats): said after "+4 when confirmed". */
export const PENDING_WHY = "A seat at a company new to Merlin earns once another member confirms a fact on it, or an admin checks it.";
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
/** Adding to a seat holder's record from their own website (ownSitePeople): it is built from the seat. */
export const OWN_RECORD_NO_ADD = "This record comes from the seat. Add what you know as a new person on the seat.";
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
 * Seats Revenue Nomad found at a company (the seat scan) that a member's own seat with these facts
 * would claim instead of adding a second one, best match first: unclaimed (nobody named, or a name
 * from public profiles that is the member's own), not one they said wasn't theirs, the same title or
 * function, starts at most SAME_SEAT_MONTHS apart (or one blank), and not ended well before this one
 * started. The Add claims the first (lib/table.ts "add"); a seat guess offers the same one (lib/google
 * seatGuessesOf), so what the card promises is what the Add does.
 */
export function claimableSeats(atCompany: readonly EngNode[], s: State, me: Pick<Member, "id" | "name">, fields: Record<string, string>): EngNode[] {
  const sent = (k: string) => (fields[k] ?? "").trim() || null;
  const role = sent("role");
  const roleKey = role ? textKey(role) : "";
  const sentFn = sent("function") ?? functionOf(role);
  return atCompany
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
    .sort((x, y) => x.score - y.score)
    .map((x) => x.e);
}

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
  // Your pipeline lives in lib/pipelineActions.ts, loaded the same way.
  if (typeof a?.type === "string" && a.type.startsWith("pipeline.")) return (await import("./pipelineActions")).performPipeline(token, a);
  // Peers (lib/peers.ts): pass a lead, team up, circles, mute. Loaded the same way.
  if (typeof a?.type === "string" && a.type.startsWith("peer.")) return (await import("./peers")).performPeer(token, a, origin);
  // From Crystal Ball (an unlock with from "crystal"): its companies are read in the action, from the action's own state (lib/radar, loaded here so the two files don't import each other at start).
  const crystalMod = (a?.type === "unlock" || a?.type === "unlockMany") && a.from === "crystal" ? await import("./radar") : null;
  // A move is at a company in the member's own Crystal Ball: read the same way.
  const movesMod = a?.type === "move" ? await import("./radar") : null;
  const out = await mutate((s, seed): ActionResult & { refused?: string; connected?: string; connectedAll?: string[] } => {
    const me = memberByToken(seed, token, s);
    if (!me) throw new ActionError("You're signed out. Sign in again to add, confirm or unlock.");
    const now = new Date().toISOString();
    const nowMs = Date.parse(now);
    // Bonuses held at the cap are paid first, as the rolling window frees room.
    releaseHeld(s, me.id, now);
    const balBefore = balance(s, me.id);
    const ledgerAt = s.ledger.length;
    // An unlock: what the member could open before it (each key's list as it was), so Undo knows exactly what it opened.
    const unlocksBefore = a?.type === "unlock" || a?.type === "unlockMany" ? { ...s.unlocks } : null;
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
      (entity === "contact" &&
        (holdsPersonPartner(s, me, g.contacts.get(id), entity, field) || samePersonHeld(s, me, g.contacts.get(id), entity, field) || ownEmailHeld(s, me, g.contacts.get(id), entity, field))) ||
      (entity === "engagement" &&
        ((field === "posting" && postingFree(tracks().get(id)) && !hiddenFor(companyOf("engagement", id))) ||
          (field === "role" && (roleFree(g.engagements.get(id), s, tracks()) || scanRoleFree(g.engagements.get(id), s))) ||
          (field === "end" && endFree(g.engagements.get(id), s)) ||
          holdsSeatPartner(s, me, g.engagements.get(id), entity, field) ||
          // Fractionals: a fractional they bought, or one shown in the directory (who held each seat, with the role).
          personFree(s, me, g.engagements.get(id), entity, field) ||
          // Fellow fractionals: free once the company is open to the member.
          peerFree(s, me, g.engagements.get(id), entity, field, !hiddenFor(companyOf("engagement", id))) ||
          ownSeat(id)));
    /**
     * The member can see who this person is: their name and title, where on file, are the member's
     * own, paid for, or come with the other half. Until then the person's LinkedIn, email and phone
     * can't be unlocked, and nothing can be added about them but a relationship (PERSON_DETAILS).
     * A half under review (two reports hide it for everyone) holds nothing back: nobody can unlock
     * it, and the screen shows no lock for it (the same test as personUnseen in app/post/model.ts).
     */
    const knowsPerson = (node: Node) =>
      // A seat holder's record from their own website: they know who it is once the seat shows who held it.
      (node as PersonNode).own ? ownNameSeen(s, me, node) : PERSON_BUNDLE.every((f) => {
        const v = valueOf(node, s, f);
        return (
          !v ||
          v.status !== "live" ||
          v.by === me.id ||
          (s.unlocks[fkey(node.id, f)] ?? []).includes(me.id) ||
          holdsPersonPartner(s, me, node, "contact", f) ||
          samePersonHeld(s, me, node, "contact", f)
        );
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
        personIdxs.delete(g);
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
    /** Activate your fractional profile: the seats of their own record are claimed together, past the daily claim limit (see the activate action). */
    let activating = false;
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
     * Companies where the member's own new seat waits to be confirmed (State.pendingSeats), and the
     * one this Add makes with their seat in it (`pendingCo`): their facts there earn when it is.
     */
    let pendingCo: string | null = null;
    const waitsAt = (ref: string) => {
      const co = refCompany(s, g, ref);
      return !!co && (co === pendingCo || (s.pendingSeats ?? []).some((p) => p.memberId === me.id && p.companyId === co));
    };
    /** Facts this action saved that wait for a seat to be confirmed. */
    let pendingNow = 0;
    /** The member joined at (seed members: never, so every company was there before them). */
    const joinedAt = s.members.find((m) => m.id === me.id)?.at ?? "";
    /**
     * The invite bonus waits for a first fact on a company that was on Merlin before the invitee
     * joined, and not on a seat they made themselves: a client they add with their own seat is not it.
     */
    let referralOk = false;
    const noteReferral = (ref: string) => {
      if (referralOk) return;
      const rec = refRecord(ref);
      const co = refCompany(s, g, ref);
      if (!co || s.engagements.some((e) => e.id === rec && e.by === me.id)) return;
      const made = s.companies.find((c) => c.id === co);
      if (!made || (!!joinedAt && made.at < joinedAt)) referralOk = true;
    };
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
      // At a company where the member's own new seat waits to be confirmed: no credit yet, paid when it is (confirmSeat).
      if (!ref.startsWith("bench.") && waitsAt(ref)) {
        s.ledger.push({ memberId: me.id, delta: 0, reason: "fill", ref, at: now, why: "pending" });
        pendingNow++;
        return 0;
      }
      const d = earns && EARN_CAP - earning(s, me.id, nowMs).earned > 0 ? 1 : 0;
      s.ledger.push({ memberId: me.id, delta: d, reason: "fill", ref, at: now });
      if (!ref.startsWith("bench.")) noteReferral(ref);
      return d;
    };
    /**
     * The invite bonus, to both once the invitee adds a first fact to a record (a benchmark-only
     * rate is not on a record, so the bonus waits). It counts toward the cap; any excess is held.
     * The inviter is paid for REFERRAL_LIMIT different invitees per 30 days.
     */
    const payReferral = () => {
      if (a?.type === "benchRate" || !referralOk) return 0;
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
      // A likely email (from the pattern of the emails on file) is no fact: the member who knows the real one adds it, and earns for it.
      const guess = entity === "contact" && key === "email" && likelyGuess(node, s);
      if (guess) delete s.verifications[fkey(node.id, key)];
      const cur = guess ? null : valueOf(node, s, key);
      // Claiming a seat from the seat scan: once, by its own fractional, a few a day, and for no credit (see claimSeat).
      const scanClaim = entity === "engagement" && key === "operator" && isScanSeat(node.id) && cur?.by !== me.id;
      // A name from public profiles on it gives way to the member whose own name it is (first and last name match): the claim verifies it.
      const pubClaim = scanClaim && !!cur?.pub && linked?.id === me.id && sameName(cur.value, me.name);
      if (scanClaim) {
        if (cur && !pubClaim) throw new ActionError(SEAT_TAKEN);
        if (!activating && claimsToday(s, me.id, nowMs) >= SEAT_CLAIM_DAILY_MAX) throw new ActionError(`You can claim ${SEAT_CLAIM_DAILY_MAX} seats in 24 hours. Claim the next one tomorrow.`);
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
      // Who holds a seat changed: the fractionals are read again (personIndex) for the rest of this action.
      if (key === "operator") personIdxs.delete(g);
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
      if (entity === "engagement" && key === "rate" && movePrivateRate(node.id, k)) return noteReferral(k), 0; // already paid as a benchmark-only rate
      const waited = pendingNow;
      const d = awardFill(k);
      // No credit because it waits for the seat to be confirmed is not the daily cap.
      if (!d && pendingNow === waited) capped = true;
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
    const credits = (n: number) => (n ? ` You earned ${n} credit${n > 1 ? "s" : ""}.` : "") + pendingNote();
    /** "+4 when confirmed": what waits for the member's seat at a company new to Merlin. */
    const pendingNote = () => (pendingNow ? ` +${pendingNow} when confirmed. ${PENDING_WHY}` : "");
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
      // A leader read from the company's website is the same person by first and last name ("Jane Q. Doe" is Jane Doe there).
      const same = key
        ? [...g.contacts.values()].filter((p) => p.companyId === companyId && (normName(valueOf(p, s, "name")?.value ?? "") === key || (!!p.site && sameName(valueOf(p, s, "name")?.value ?? "", typed))))
        : [];
      if (same.some((p) => valueOf(p, s, "name")!.by === me.id)) throw new ActionError(`You already added ${typed} here.`);
      const into = same.find((p) => valueOf(p, s, "name")!.status === "live");
      let earned = 0;
      if (!into) {
        const pid = newId("p");
        s.contacts.push({ id: pid, engagementId, companyId, by: me.id, at: now });
        const node: PersonNode = { id: pid, seedFields: {}, companyId, engagementId, source: "Member added" };
        g.contacts.set(pid, node); // a second person with this name in the same Add is a repeat
        const peers = [...g.contacts.values()].map((x) => personPeers.get(x)).find((l) => l?.[0]?.companyId === companyId);
        if (peers) peers.push(node);
        personPeers.set(node, peers ?? [node]);
        for (const [k, v] of fields) earned += setValue(node, "contact", k, v);
        return { node: node as Node, earned, merged: false, kept: 0, typed };
      }
      let kept = 0;
      typedName.add(into.id);
      for (const [k, v] of fields) {
        if (k === "name") continue;
        if (valueOf(into, s, k) && !(k === "email" && likelyGuess(into, s))) kept++;
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

    const run = (): ActionResult & { connected?: string; connectedAll?: string[] } => {
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
          // A seat holder's record from their own website is Merlin's, built from the seat: what members know goes on the seat, or as a person of their own.
          if (a.entity === "contact" && (node as PersonNode).own) throw new ActionError(OWN_RECORD_NO_ADD);
          // A person's title, email, phone and LinkedIn come only from a member who can see who the
          // person is: nobody knows the email of someone they can't name. Seeing the name means having
          // added it, paid for it, or paid for the title that comes with it (PERSON_BUNDLE).
          if (a.entity === "contact" && FILL_NEEDS_NAME.includes(f.key)) {
            const nv = valueOf(node, s, "name");
            if (!nv) throw new ActionError(FILL_NO_NAME);
            // A seat holder's record from their own website: seeing who held the seat is seeing the name.
            const seesName = (node as PersonNode).own
              ? ownNameSeen(s, me, node)
              : nv.status === "live" &&
                !nv.reporters?.includes(me.id) &&
                (nv.by === me.id ||
                  (s.unlocks[fkey(node.id, "name")] ?? []).includes(me.id) ||
                  holdsPersonPartner(s, me, node, "contact", "name") ||
                  samePersonHeld(s, me, node, "contact", "name"));
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
        case "undoUnlock": {
          /*
           * Take back an unlock made a moment ago (its toast's Undo): its credits come back and what it
           * opened locks again, as if it never happened (its ledger lines go, so the day's counts and free
           * opens come back too). Only within UNLOCK_UNDO_MS, and only while nothing came after it that
           * could have used what it showed: any later credit line of the member's, a message or an invite.
           */
          const at = String(a.at ?? "");
          const key = `${me.id}|${at}`;
          const rec = recentUnlocks.get(key);
          const t0 = Date.parse(at);
          if (!rec || !Number.isFinite(t0) || nowMs - t0 > UNLOCK_UNDO_MS + UNLOCK_UNDO_GRACE_MS) throw new ActionError(UNDO_TOO_LATE);
          const lines: number[] = [];
          s.ledger.forEach((l, i) => l.memberId === me.id && l.reason === "unlock" && l.at === at && lines.push(i));
          if (!lines.length) throw new ActionError(UNDO_TOO_LATE);
          const last = Math.max(...lines);
          const since = (x: string | undefined) => !!x && Date.parse(x) >= t0;
          if (
            s.ledger.slice(last + 1).some((l) => l.memberId === me.id) ||
            (s.seatInvites ?? []).some((x) => x.by === me.id && since(x.at)) ||
            (s.conversations ?? []).some((c) => (c.a === me.id || c.b === me.id) && c.messages.some((m) => m.by === me.id && since(m.at)))
          )
            throw new ActionError(UNDO_AFTER);
          const back = -lines.reduce((n, i) => n + Math.min(0, s.ledger[i].delta), 0);
          for (const i of [...lines].sort((x, y) => y - x)) s.ledger.splice(i, 1);
          const cells: ReturnType<typeof changed>[] = [];
          for (const k of rec.keys) {
            const left = (s.unlocks[k] ?? []).filter((m) => m !== me.id);
            if (left.length) s.unlocks[k] = left;
            else delete s.unlocks[k];
            const dot = k.lastIndexOf(".");
            const id = k.slice(0, dot);
            const field = k.slice(dot + 1);
            const co = g.companies.get(id);
            const eng = g.engagements.get(id);
            const person = g.contacts.get(id);
            if (co && field === "identity") cells.push(...[...IDENTITY_FIELDS, "hq"].map((f) => changed("company", co, f)));
            else if (co) cells.push(changed("company", co, field));
            // The other half of a bundle shows through it: both halves lock again.
            else if (eng) for (const f of SEAT_BUNDLE.includes(field) ? SEAT_BUNDLE : [field]) cells.push(changed("engagement", eng, f));
            else if (person) for (const f of PERSON_BUNDLE.includes(field) ? PERSON_BUNDLE : [field]) cells.push(changed("contact", person, f));
          }
          recentUnlocks.delete(key);
          return { message: back ? `Undone. Your ${back === 1 ? "credit is" : `${back} credits are`} back, and it's locked again.` : "Undone. It's locked again.", cells };
        }
        case "unlock":
        case "unlockMany": {
          // Only plain objects: a list with null, a number or a string in it (a broken or hostile client) is read without them, never a server error.
          const items = a.type === "unlock" ? [a] : (Array.isArray(a.items) ? a.items : []).filter((it) => !!it && typeof it === "object" && !Array.isArray(it)).slice(0, 60);
          /**
           * Free's one Crystal Ball company a UTC day, opened in full: the company, and every fact on
           * file there the member doesn't see yet (who held each seat and the role, people's names and
           * titles and their LinkedIn, email and phone, rates, end months, postings), for 0 credits.
           * Theirs for good, like paid unlocks, and nothing already paid comes back. One ledger line
           * (the company's, why crystalFull) marks the day's; a company with nothing left to open doesn't use it.
           */
          const crystalFull = (co: CompanyNode, mode: "one" | "used"): ActionResult => {
            if (mode === "used") throw new ActionError(CRYSTAL_USED);
            const coLocked = lockedFor(co.id);
            const sees = (entity: Entity, node: Node, field: string) => {
              const v = valueOf(node, s, field);
              // Who held a seat, with the role, is free once the company opens (PEERS_FREE): nothing to give there.
              return !v || v.status !== "live" || v.by === me.id || (s.unlocks[fkey(node.id, field)] ?? []).includes(me.id) || freeFor(entity, node.id, field) || peerFree(s, me, node, entity, field, true);
            };
            const open: { entity: Entity; node: Node; field: string }[] = [];
            for (const e of g.engagements.values()) if (e.companyId === co.id) for (const f of ENG_GATED) if (!sees("engagement", e, f)) open.push({ entity: "engagement", node: e, field: f });
            for (const p of g.contacts.values()) if (p.companyId === co.id) for (const f of CONTACT_GATED) if (!sees("contact", p, f)) open.push({ entity: "contact", node: p, field: f });
            if (!coLocked && !open.length) throw new ActionError(`You already see everything at ${co.name}, so your free ${FEATURE_NAME} company for today is still left.`);
            const idK = fkey(co.id, "identity");
            s.ledger.push({ memberId: me.id, delta: 0, reason: "unlock", ref: idK, at: now, why: "crystalFull" });
            const give = (k: string) => {
              if (!(s.unlocks[k] ?? []).includes(me.id)) s.unlocks[k] = [...(s.unlocks[k] ?? []), me.id];
            };
            if (coLocked) give(idK);
            for (const x of open) give(fkey(x.node.id, x.field));
            return {
              message: `Opened ${co.name} with everything on it, free: your ${FEATURE_NAME} company for today. Pro opens every company in your ${FEATURE_NAME}.`,
              cells: [
                ...open.map((x) => changed(x.entity, x.node, x.field)),
                ...(coLocked ? [...IDENTITY_FIELDS, "hq"].map((field) => changed("company", co, field)) : []),
                // Who held each seat there, with the role, shows free now that the company is open.
                ...(PEERS_FREE && coLocked ? [...g.engagements.values()].filter((e) => e.companyId === co.id && valueOf(e, s, "operator")?.status === "live").flatMap((e) => ["operator", "role"].map((field) => changed("engagement", e, field))) : []),
              ],
            };
          };
          /**
           * From Crystal Ball (from "crystal", lib/radar crystalCompanyIds: the companies the member's
           * own Crystal Ball lists, never what the client says). Trial and Pro: each company in it opens
           * for 0 credits (crystalFree), its people and seat holders cost what they cost, and the free
           * company of the day stays. Free: one a UTC day opens in full (crystalFull, above). Billing off: an ordinary unlock.
           */
          const crystalMode = crystalMod ? crystalOf(s, me.id, nowMs) : null;
          const crystalFree = new Set<string>();
          if (crystalMod && crystalMode) {
            const ball = crystalMod.crystalCompanyIds(seed, s, me, nowMs);
            if (a.type === "unlock") {
              if (a.entity !== "company" || a.field !== "identity") throw new ActionError(`Only a company opens from your ${FEATURE_NAME}.`);
              const co = nodeOf("company", a.id);
              if (!ball.has(co.id)) throw new ActionError(CRYSTAL_NOT_IN);
              if (crystalMode !== "all") return crystalFull(co as CompanyNode, crystalMode);
              crystalFree.add(co.id);
            } else if (crystalMode === "all")
              for (const it of items) {
                if (it.entity !== "company") continue;
                const id = fromPub.get(String(it.id ?? ""));
                if (id && ball.has(id)) crystalFree.add(id);
              }
          }
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
          /** Fractionals (personIndex records) this purchase already covers: their other seats come with them. */
          const fractionalsBought = new Set<string>();
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
            // A seat holder's record from their own website: its name and title are who held the seat and its role, one purchase on the seat.
            const ownRec = it.entity === "contact" ? (node as PersonNode).own : undefined;
            if (ownRec && PERSON_BUNDLE.includes(it.field)) {
              take({ ...it, entity: "engagement", id: pubId(ownRec.seat.id), field: "operator" } as (typeof items)[number], ownRec.seat, last);
              return;
            }
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
              // Fellow fractionals: free once the company opens, and this request opens it.
              if (peerFree(s, me, node, "engagement", f.key, true) && todo.some((t) => t.k === fkey(companyOf("engagement", node.id), "identity"))) return;
              if (seatsBought.has(node.id)) return;
              seatsBought.add(node.id);
              // Fractionals: two seats of one fractional in one request are one purchase (the first opens the rest, personHeld).
              const who = personOf(s, node)?.gr.rid;
              if (who && fractionalsBought.has(who)) return;
              if (who) fractionalsBought.add(who);
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
          // A company opened from Crystal Ball on Trial or Pro (crystalFree) costs nothing and isn't counted toward the day's limit.
          const fromBall = (t: { field: string; node: Node }) => t.field === "identity" && crystalFree.has(t.node.id);
          // Free opens (freeCompaniesLeft): on Trial and Pro the first PRO_OPENS_DAILY other companies of the UTC day, which
          // don't count toward the day's limit; with billing off the first one, which still does.
          const pro = proOpens(s, me.id, nowMs);
          const opensLeft = freeCompaniesLeft(s, me.id, nowMs);
          const freeKs = new Set(todo.filter((t) => t.field === "identity" && !fromBall(t)).slice(0, opensLeft).map((t) => t.k));
          const freeK = freeKs.size ? [...freeKs][0] : null;
          const units = (t: { field: string; node: Node }) => (fromBall(t) ? 0 : t.field === "identity" ? COMPANY_PRICE : 1);
          const cost = (t: { k: string; field: string; node: Node }) => (freeKs.has(t.k) ? 0 : units(t));
          const need = todo.reduce((n, t) => n + cost(t), 0);
          const room = todo.reduce((n, t) => n + (pro && freeKs.has(t.k) ? 0 : units(t)), 0);
          // Past today's free opens on Pro, a company is COMPANY_PRICE again: a company in this request that pays says so.
          const proPast = pro && todo.some((t) => t.field === "identity" && !fromBall(t) && !freeKs.has(t.k));
          if (room) {
            // Accounts in their first 24 hours get a lower daily limit (unlockRoom).
            const { left, firstDay } = unlockRoom(s, me.id, nowMs);
            const bal = balance(s, me.id);
            // Out of credits (0, or owing after a removal) is the wall whatever the daily limit says.
            // Short of credits comes first too, unless the limit binds as tightly (earning more wouldn't help then).
            if (need && (bal <= 0 || (bal < need && bal < left))) {
              const msg = bal > 0 ? `That needs ${need} credits and you have ${bal}. Add a missing fact to earn more.` : "You're out of credits. Add a missing fact to earn one.";
              // The wall: counted for the pilot, so the refusal is returned (a throw would drop the count).
              if (!addSignal(s, me.id, "wall", "server", now)) throw new ActionError(msg);
              refusal.message = msg;
              return { message: "" };
            }
            if (room > left) {
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
            s.ledger.push({ memberId: me.id, delta: cost(t) ? -cost(t) : 0, reason: "unlock", ref: t.k, at: now, ...(freeKs.has(t.k) ? { why: "free" as const } : fromBall(t) ? { why: "crystal" as const } : {}) });
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
          const ballOpened = todo.filter(fromBall).length;
          const noCharge = need || freeK || ballOpened ? "" : " You had already paid for this open role, so no credit was spent.";
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
          // The free company of the day: no credits for it, and it is said so. So is a company opened from Crystal Ball.
          // Trial and Pro: free up to PRO_OPENS_DAILY a day, then said once the day's are used.
          if (freeK && pro) message += ` ${proOpenLine(opensLeft - freeKs.size)}`;
          else if (freeK) message += ` ${FREE_COMPANY_USED}`;
          if (proPast) message += ` ${PRO_OPENS_USED}`;
          if (ballOpened) message += ` ${ballOpened === 1 ? "The company" : `${ballOpened} companies`} opened free from your ${FEATURE_NAME}.`;
          return {
            message,
            cells: [
              ...todo.filter((t) => t.field !== "identity").map((t) => changed(t.entity, t.node, t.field)),
              ...came.map((x) => changed("engagement", x.node, x.field)),
              ...personAlso.map((x) => changed("contact", x.node, x.field)),
              ...seatAlso.map((x) => changed("engagement", x.node, x.field)),
              // Fractionals: the fractional's other seats, their name and role open with this one.
              ...todo
                .filter((t) => t.seat)
                .flatMap((t) => (personOf(s, t.node)?.gr.seats ?? []).filter((id) => id !== t.node.id).map((id) => g.engagements.get(id)!))
                .filter(Boolean)
                .flatMap((e) => ["operator", "role"].map((field) => changed("engagement", e, field))),
              ...companies.flatMap((t) => [...IDENTITY_FIELDS, "hq"].map((field) => changed("company", t.node, field))),
              // Fellow fractionals: who held each seat there, with the role, shows now that the company is open.
              ...(PEERS_FREE
                ? companies.flatMap((t) =>
                    [...g.engagements.values()].filter((e) => e.companyId === t.node.id && valueOf(e, s, "operator")?.status === "live").flatMap((e) => ["operator", "role"].map((field) => changed("engagement", e, field))),
                  )
                : []),
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
          // The member's own seat at a company that wasn't on file (new here, or one whose own first seat still
          // waits): what they add there waits for the seat to be confirmed (pendingSeats), so a made-up client earns nothing.
          const selfSeatSent = seatPick?.id === me.id && engFields.some(([k]) => k === "operator");
          if (selfSeatSent && (isNew || (s.pendingSeats ?? []).some((p) => p.companyId === company!.id))) pendingCo = company.id;
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
            // A seat the Add names (Confirm on a seat guess: the claimable seat the server offered), claimed
            // by the same rules when it is still claimable; any other seat named is filled in as before (its own checks: only the seat holder adds to a seat).
            const named = wantEng ? atCompany.find((e) => e.id === wantEng) : undefined;
            const pinned = named && selfSeat ? claimableSeats(atCompany, s, me, Object.fromEntries(engFields)).find((e) => e.id === named.id) : undefined;
            const ownMatch = wantEng
              ? (pinned ?? named)
              : (a.newEngagement ? atCompany.find((e) => isBlank(e) && mayMerge(e)) : atCompany.find((e) => madeByMe(e) && mayMerge(e))) ??
                (roleKey ? atCompany.find((e) => !isOpenRole(e, s, tracks()) && textKey(live(e, s, "role") ?? "") === roleKey && mayMerge(e)) : undefined);
            // "Add a seat you held" where Revenue Nomad already found that seat (a seat-scan seat nobody
            // has claimed): it is claimed instead of added again, so one seat is never two hires. Same
            // title, or the same function, and starts at most SAME_SEAT_MONTHS apart (or one of them
            // blank). The claim pays nothing, like claimSeat: only the empty facts it fills in earn.
            const sent = (k: string) => engFields.find(([x]) => x === k)?.[1] ?? null;
            const scanSeat =
              (ownMatch && !pinned) || !selfSeat || (sent("type") && !FRACTIONAL_TYPES.includes(sent("type")!)) || sent("status") === "Open role"
                ? undefined
                : (pinned ?? claimableSeats(atCompany, s, me, Object.fromEntries(engFields))[0]);
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
            // Their seat at a company that wasn't on file waits to be confirmed.
            if (pendingCo && eid && !(s.pendingSeats ?? []).some((p) => p.engagementId === eid))
              (s.pendingSeats ??= []).push({ memberId: me.id, engagementId: eid, companyId: pendingCo, at: now });
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
        case "leaderReport": {
          // "They have a full-time Sales leader": a fact like any other (1 credit, the daily limits), at a company the member can see.
          const c = g.companies.get(fromPub.get(String(a.companyId)) ?? "");
          if (!c) throw new ActionError(gone("company"));
          mustSee(c.id);
          const fn = String(a.fn ?? "");
          if (!FUNCTIONS.includes(fn) || fn === "Other" || fn === "Executive") throw new ActionError("Pick the function they have a full-time leader in.");
          const role = String(a.role ?? "");
          if (!memberRoles(fn).includes(role)) throw new ActionError(`Pick their title: ${memberRoles(fn).join(", ")}.`);
          const site = s.leaders?.[c.id]?.functions[fn];
          if (site?.kind === "full-time") return { message: `Their website already shows a full-time ${fn} leader. Nothing to add.` };
          const byCo = ((s.leaderReports ??= {})[c.id] ??= {});
          const list = (byCo[fn] ??= []);
          const had = list.find((r) => r.by === me.id);
          if (had) {
            had.role = role;
            return { message: `Updated. Crystal Ball shows ${fn} there as led by a full-time ${role === "Other" ? `${fn} leader` : role}.` };
          }
          // Credits back later (payLeaderBack) only when the member unlocked this company in the last LEADER_BACK_DAYS, from a Crystal Ball card.
          const recent = (iso: string) => nowMs - Date.parse(iso) <= LEADER_BACK_DAYS * DAY_MS;
          const unlockedLately = s.ledger.some((l) => l.memberId === me.id && l.reason === "unlock" && l.ref === `${c.id}.identity` && recent(l.at));
          const onCard = Object.entries(s.radar?.members?.[me.id]?.days ?? {}).some(([day, rows]) => recent(`${day}T23:59:59.000Z`) && rows.some((x) => x.c === c.id));
          list.push({ by: me.id, role, at: now, ...(unlockedLately && onCard ? { backDue: true as const } : {}) });
          const earned = awardFill(`${c.id}.${FT_LEADER_REF}${fn}`);
          const confirmed = reportsOf(list).length >= CONFIRM_MEMBERS;
          return {
            message: `Thanks. Crystal Ball stops pointing at ${fn} there for everyone${confirmed ? ", and it's confirmed: another member said the same" : ""}.${credits(earned)}${capNote()}${
              unlockedLately && onCard ? ` If their website shows it too, you get ${LEADER_BACK} credits back.` : ""
            }`,
            capped,
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
            (a.entity === "contact" && (holdsPersonPartner(s, me, node, a.entity, f.key) || samePersonHeld(s, me, node, a.entity, f.key))) ||
            (a.entity === "engagement" && holdsSeatPartner(s, me, node, a.entity, f.key)) ||
            // Fellow fractionals are free (PEERS_FREE): who held a seat, with the role, counts as paid for by whoever paid for the company.
            (a.entity === "engagement" &&
              SEAT_BUNDLE.includes(f.key) &&
              peerFree(s, me, node, a.entity, f.key, !hiddenFor((node as EngNode).companyId)) &&
              (s.unlocks[fkey((node as EngNode).companyId, "identity")] ?? []).includes(me.id));
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
          // Another member confirming a fact on a seat that waits to be confirmed confirms the seat: its holder's credits are paid.
          if (a.entity === "engagement" && (s.pendingSeats ?? []).some((p) => p.engagementId === node.id && p.memberId !== me.id)) confirmSeat(s, g, node.id, now);
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
        case "confirmSeat": {
          // Pilot metrics: an admin confirms a member's own seat at a company that was new to Merlin, and its credits are paid.
          if (!isAdmin(me)) throw new ActionError("Only admins can confirm a seat.");
          const id = inId("engagement", a.engagementId);
          const p = (s.pendingSeats ?? []).find((x) => x.engagementId === id);
          if (!p) throw new ActionError("That seat isn't waiting any more. It may already be confirmed.");
          const paid = confirmSeat(s, g, id, now);
          const who = memberIndex(seed, s).byId.get(p.memberId);
          return { message: `Confirmed.${who ? ` ${firstName(who.name)}` : " The member"} gets ${paid} ${paid === 1 ? "credit" : "credits"} for it${paid ? "" : " (nothing was still standing)"}.` };
        }
        case "lockedView": {
          // A locked company's record opened (or its card expanded): counted once per member, company and UTC day, for Pilot metrics.
          const id = fromPub.get(String(a.companyId ?? "")) ?? "";
          if (!g.companies.has(id) || !lockedFor(id)) return { message: "" };
          const day = now.slice(0, 10);
          const list = (s.lockedViews ??= []);
          if (list.some((x) => x.memberId === me.id && x.companyId === id && x.day === day)) return { message: "" };
          if (list.filter((x) => x.memberId === me.id && x.day === day).length >= LOCKED_VIEWS_DAILY_MAX) return { message: "" };
          list.push({ memberId: me.id, companyId: id, day });
          if (list.length > LOCKED_VIEWS_KEEP) list.splice(0, list.length - LOCKED_VIEWS_KEEP);
          return { message: "" };
        }
        case "promoCode": {
          // A code from the address (?code=RN-SURVEY10) the member arrived with: kept with them for checkout (billing live only).
          if (!billingLive()) return { message: "" };
          const code = cleanPromo(a.code);
          if (!code) return { message: "" };
          setPromo(s, me.id, code);
          return { message: "" };
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
              // Shown in the Fractionals directory, their name is free on their seats (personShown); otherwise behind the usual lock.
              (s.profiles[me.id]?.fractionals === true
                ? `It's yours.${theirs ? " Your name matches the one on file, so it's verified now." : ""} You're in the Fractionals directory, so other members see your name on it, free. Fill in what you know on Your seats.`
                : theirs
                  ? "It's yours. Your name matches the one on file, so it's verified now. Other members who can see the company see it. Fill in what you know on Your seats."
                  : "It's yours. Other members who can see the company see your name on it. Fill in what you know on Your seats.") + connectedNote(link),
            id: pubId(e.id),
            cells: ENG_KEYS.map((f) => changed("engagement", e, f)),
            ...(link?.conversationId ? { connected: link.conversationId } : {}),
          };
        }
        case "notMine": {
          personIdxs.delete(g); // who holds the seat is about to change: read the fractionals again after it
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
          if (typeof a.peerEmail === "boolean") {
            const p = { ...(s.profiles[me.id] ?? {}) };
            if (a.peerEmail) delete p.peerEmailOff;
            else p.peerEmailOff = true;
            s.profiles[me.id] = p;
            return { message: a.peerEmail ? "We'll email you when a peer passes you a lead or asks you to team up." : "Peer emails are off. Leads and team-ups still show on Home and in Peers." };
          }
          if (typeof a.messageEmail === "boolean") {
            const p = { ...(s.profiles[me.id] ?? {}) };
            if (a.messageEmail) delete p.messageEmailOff;
            else p.messageEmailOff = true;
            s.profiles[me.id] = p;
            return { message: a.messageEmail ? "We'll email you when a member messages you." : "Message emails are off. New messages still show in Messages." };
          }
          // Notifications: Crystal Ball's email (how often, or off) and its Slack posts, each on its own.
          if (typeof a.radarEmail === "string" || typeof a.radarSlack === "boolean") {
            const choice = typeof a.radarEmail === "string" ? a.radarEmail : null;
            if (choice !== null && !(["daily", "twice", "weekly", "off"] as string[]).includes(choice)) throw new ActionError("That didn't go through. Refresh the page and try again.");
            const p = { ...(s.profiles[me.id] ?? {}) };
            const was = radarPrefs(p);
            // The switch before Notifications turned both off: each part keeps what it was.
            delete p.radarOff;
            p.radarEmail = was.email;
            if (!was.slack) p.radarSlackOff = true;
            if (choice) {
              if (choice === "off" && was.email !== "off") addSignal(s, me.id, "radar_off", "notifications", now);
              p.radarEmail = choice as RadarEmail;
            }
            if (typeof a.radarSlack === "boolean") {
              if (a.radarSlack) delete p.radarSlackOff;
              else p.radarSlackOff = true;
            }
            if (p.radarEmail === "daily") delete p.radarEmail;
            s.profiles[me.id] = p;
            if (typeof a.radarSlack === "boolean")
              return { message: a.radarSlack ? `${YOUR_FEATURE} posts to Slack again.` : `${YOUR_FEATURE} won't post to Slack. The email is set apart.` };
            return {
              message:
                choice === "off"
                  ? `The ${FEATURE_NAME} email is off. ${FEATURE_NAME} in the app still lists what's new.`
                  : `The ${FEATURE_NAME} email comes ${choice === "daily" ? "on mornings when something moved" : choice === "twice" ? "twice a week, Monday and Thursday" : "once a week, on Mondays"}.`,
            };
          }
          if (typeof a.radar === "boolean") {
            const p = { ...(s.profiles[me.id] ?? {}) };
            if (a.radar) {
              delete p.radarOff;
              delete p.radarEmail;
              delete p.radarSlackOff;
            } else if (!p.radarOff) {
              p.radarOff = true;
              addSignal(s, me.id, "radar_off", "profile", now);
            }
            s.profiles[me.id] = p;
            return {
              message: a.radar
                ? `${YOUR_FEATURE} is on. When a company like your clients moves, you hear about it the next morning.`
                : `${YOUR_FEATURE} is off. We won't send it by email or Slack. ${FEATURE_NAME} in the app still lists what's new.`,
            };
          }
          // "Hide my name on my seats": NAME_HIDDEN on every seat of theirs, to everyone else, the connector included.
          if (typeof a.nameHidden === "boolean") {
            const p = { ...(s.profiles[me.id] ?? {}) };
            if (a.nameHidden) p.nameHidden = true;
            else delete p.nameHidden;
            s.profiles[me.id] = p;
            const rest = (s.namesHidden ?? []).filter((id) => id !== me.id);
            s.namesHidden = a.nameHidden ? [...rest, me.id] : rest;
            if (!s.namesHidden.length) delete s.namesHidden;
            return {
              message: a.nameHidden
                ? `Your name is hidden on your seats. Everyone else sees "${NAME_HIDDEN}", and your seats and roles still count.`
                : "Your name shows on your seats again.",
            };
          }
          // "Show me in the Fractionals directory" (Referral partners' switch, `partners`, is the same one now).
          const show = typeof a.fractionals === "boolean" ? a.fractionals : typeof a.partners === "boolean" ? a.partners : null;
          if (show !== null) {
            const p = { ...(s.profiles[me.id] ?? {}) };
            p.fractionals = show;
            if (show) delete p.partnersOff;
            else p.partnersOff = true;
            s.profiles[me.id] = p;
            return {
              message: show
                ? "You're in the Fractionals directory. Members see your name, your seats and the clients you serve, free. Never your email."
                : "You're out of the Fractionals directory. Members you already talk to can still write to you.",
            };
          }
          return { message: "Saved." };
        }
        case "noticeSeen": { // [ux ws1] Today's one-time trial-ended card, closed: kept with the plan's notices.
          const rec = s.billing?.members?.[me.id];
          if (rec && a.kind === "trialEnded") (rec.notices ??= {}).trialEndedSeen = now; // [ux ws1]
          // Home's one-time Pro welcome, closed.
          if (rec && a.kind === "proWelcome") (rec.notices ??= {}).proWelcomeSeen = now;
          // Home's one-time card when the trial started, closed.
          if (rec && a.kind === "trialStarted") (rec.notices ??= {}).trialStartedSeen = now;
          // The AI usage notice (50%, 75%, 90%), seen: each fires once a month (lib/proposals/aiUsage.ts).
          if (a.kind === "aiUsage") aiNoticeSeenIn(s, me.id);
          return { message: "" }; // [ux ws1]
        } // [ux ws1]
        case "move": {
          // Your three moves today: done (it leaves the list and counts), snoozed (hidden for a week), or taken back. The member's own log, nothing else.
          // "sent" (Mark as sent, or the note used): done, and the company goes into their pipeline at Sent (lib/pipeline.ts).
          const op = a.op === "done" || a.op === "snooze" || a.op === "undo" || a.op === "sent" ? a.op : null;
          if (!op) throw new ActionError(UNKNOWN_ACTION);
          const co = g.companies.get(inId("company", a.id));
          if (!co) throw new ActionError(gone("company"));
          const all = (s.moves ??= {});
          const had = all[me.id];
          // Only a company in their own Crystal Ball has a move (never what the client says), or one already in their log (to take it back).
          const known = !!had && (!!had.done[co.id] || !!had.snoozed[co.id]);
          if (!known && !movesMod!.crystalCompanyIds(seed, s, me, nowMs).has(co.id)) throw new ActionError(MOVE_NOT_IN);
          const log = (all[me.id] ??= emptyMoveLog());
          logMove(log, co.id, op === "sent" ? "done" : op, nowMs);
          const n = movesThisMonth(log, nowMs);
          const pl = ((s.pipeline ??= {})[me.id] ??= emptyPipeline());
          if (op === "sent" && a.op === "sent") {
            const channel = a.intro ? "intro" : isChannel(a.channel) ? a.channel : "email";
            const to = cleanTo(a.to);
            // "Ask Dana for an intro": the ask is recorded as an intro too, and a win from it is credited to it.
            const introId = a.intro
              ? addIntro(pl, { id: `pl${randomBytes(8).toString("hex")}`, companyId: co.id, introducer: { name: to.name ?? null, role: to.role ?? null, ...(to.google ? { google: true } : {}) }, nowMs }).intro.id
              : undefined;
            const { entry } = openEntry(pl, { id: `pl${randomBytes(8).toString("hex")}`, companyId: co.id, channel, to, source: "move", via: "note", nowMs, introId });
            if (introId) pl.intros.find((x) => x.id === introId)!.entryId ??= entry.id;
            return { message: "In your pipeline. Merlin moves it when they reply, and nudges you to follow up in 3 business days." };
          }
          // Undo of a send just made: the entry it opened goes too, while nothing else happened to it.
          if (op === "undo") {
            const e = entryAt(pl, co.id);
            if (e && e.source === "move" && e.stage === "sent" && !e.follow && !e.notes.length && nowMs - Date.parse(e.createdAt) < 24 * 3_600_000) {
              pl.entries.splice(pl.entries.indexOf(e), 1);
              pl.intros = pl.intros.filter((x) => !(x.entryId === e.id && x.status === "asked"));
            }
          }
          return {
            message:
              op === "done"
                ? `Done. ${n === 1 ? "That's your first move this month." : `That's ${n} moves this month.`}`
                : op === "snooze"
                  ? `Snoozed for ${SNOOZE_DAYS} days.`
                  : "Back in your moves.",
          };
        }
        case "voice": {
          // Your writing voice, typed in Your profile: style conclusions only, each one a value from its list (lib/voice.ts).
          const all = (s.voice ??= {});
          if (a.remove) {
            delete all[me.id];
            return { message: "Your writing voice is removed. Notes go back to the plain template." };
          }
          let style;
          try {
            style = cleanVoice(a.voice);
          } catch (e) {
            if (e instanceof VoiceProblem) throw new ActionError(e.message);
            throw e;
          }
          all[me.id] = { ...style, at: now, by: "you" };
          return { message: "Saved. Your notes are drafted in this voice." };
        }
        case "joinedSeen": {
          // The invite loop: the inviter closed the line saying who joined from their invite. It doesn't come back.
          const ids = new Set((Array.isArray(a.ids) ? a.ids : []).slice(0, 50).map((x) => String(x)));
          for (const j of s.inviteJoins ?? []) if (j.by === me.id && j.told && !j.seen && ids.has(pubId(j.invitee))) j.seen = now;
          return { message: "" };
        }
        case "activate": {
          /*
           * Activate your fractional profile (the claim link of a fractional with more than one seat,
           * app/claim/Claim.tsx): every seat of their record they left ticked becomes theirs at once
           * (a seat whose name on file is theirs; another name waits for an admin, as claimSeat), then
           * they are connected with every member who invited them before now, and the invite bonus:
           *  - the new member gets REFERRAL_BONUS once (referralBonus: from the inviter whose link
           *    they joined with, else the first inviter), within the daily earning cap;
           *  - each inviter gets REFERRAL_BONUS, at most ACTIVATE_INVITERS_PAID inviters for one
           *    activation, each within their own REFERRAL_LIMIT a 30 days and daily cap, and none from
           *    a network the new member joined from (the invite rule). Only a member who joined now
           *    earns these: someone already on Merlin connects, with no bonus.
           * `show`: "Show me in the Fractionals directory", ticked unless they untick it.
           */
          if (!opts.claimLink) throw new ActionError(UNKNOWN_ACTION);
          const link = g.engagements.get(inId("engagement", a.engagementId));
          if (!link) throw new ActionError(gone("engagement"));
          const p = personIndex(g, s);
          const gi = p.groupOf.get(link.id);
          const all = gi === undefined ? [link.id] : p.groups[gi].seats;
          const skip = new Set((Array.isArray(a.skip) ? a.skip : []).slice(0, 200).map((x) => String(x)));
          const want = all.filter((id) => !skip.has(pubId(id)));
          if (!want.length) throw new ActionError("Tick at least one seat that's yours, or use This isn't me.");
          const idxNow = () => memberIndex(seed, s);
          // Who invited them before now: each member's first standing invite on any of these seats, and whoever sent this link.
          const via = opts.ref ? memberByInviteCode(seed, s, opts.ref) : null;
          const inviters: { by: string; engId: string }[] = [];
          for (const x of [...(s.seatInvites ?? [])].sort((u, v) => u.at.localeCompare(v.at)))
            if (all.includes(x.engagementId) && !x.claimedBy && x.by !== me.id && !inviters.some((i) => i.by === x.by)) inviters.push({ by: x.by, engId: x.engagementId });
          if (via && via.id !== me.id) {
            const at = inviters.findIndex((i) => i.by === via.id);
            const it = at >= 0 ? inviters.splice(at, 1)[0] : { by: via.id, engId: link.id };
            inviters.unshift(it);
          }
          let claimed = 0;
          let waits = 0;
          let taken = 0;
          activating = true;
          try {
            for (const id of want) {
              const e = g.engagements.get(id)!;
              const op = valueOf(e, s, "operator");
              if (seatHolder(s, idxNow(), e.id, op)?.id === me.id) {
                claimed++;
                continue;
              }
              const pub = publicName(e, s);
              if (e.source !== SEAT_SCAN || (op && !pub)) {
                taken++;
                continue;
              }
              if (pub && !sameName(pub.value, me.name)) {
                // Someone else's name: an admin checks it first (claimSeat's rule), a few a day.
                if (nameVerified(s, e.id) || claimsToday(s, me.id, nowMs) >= SEAT_CLAIM_DAILY_MAX) {
                  taken++;
                  continue;
                }
                if (!pendingClaimers(s, e.id).includes(me.id)) {
                  const names = (s.names ??= emptyNames());
                  names.claims.push({ memberId: me.id, engagementId: e.id, at: now, status: "pending", ...(via && via.id !== me.id ? { via: via.id } : {}) });
                }
                waits++;
                continue;
              }
              setValue(e, "engagement", "operator", me.name, me);
              claimed++;
            }
          } finally {
            activating = false;
          }
          if (!claimed && !waits) throw new ActionError("None of these seats can be yours now. Another member holds them.");
          // The invite bonus: only someone who joined Merlin now (a joined account, not paid an invite bonus before).
          const joined = s.members.find((m) => m.id === me.id);
          const fresh = !!joined && !s.referralPaid.includes(me.id);
          let mine = 0;
          const paidInviters = new Set<string>();
          if (fresh && claimed) {
            if (joined!.referredBy) {
              const r = referralBonus(s, seed, me.id, now);
              mine = r.paid;
              if (r.inviter) paidInviters.add(joined!.referredBy);
              else paidInviters.add(`skip:${joined!.referredBy}`);
            } else if (inviters.length) {
              s.referralPaid.push(me.id);
              mine = grant(s, me.id, REFERRAL_BONUS, "referral", `${inviters[0].by}.referral`, now);
            }
            for (const inv of inviters) {
              if (paidInviters.has(inv.by) || paidInviters.has(`skip:${inv.by}`)) continue;
              if ([...paidInviters].filter((x) => !x.startsWith("skip:")).length >= ACTIVATE_INVITERS_PAID) break;
              if (joined!.ipHash && networksOf(s, inv.by).has(joined!.ipHash)) continue;
              if (inviteesPaid(s, inv.by, nowMs) >= REFERRAL_LIMIT) continue;
              grant(s, inv.by, REFERRAL_BONUS, "referral", `${me.id}.referral`, now);
              paidInviters.add(inv.by);
            }
          }
          // A conversation with each of them (connectInvite: once, its first message their note), no bonus there: it is paid above.
          let first: string | null = null;
          const firsts: string[] = [];
          const opened: string[] = [];
          for (const inv of inviters) {
            const c = connectInvite(s, seed, g, me, inv.engId, inv.by, now, false);
            if (c?.conversationId && !first) first = c.conversationId;
            if (c?.conversationId) opened.push(c.conversationId);
            if (c) firsts.push(c.inviter);
          }
          // "Show me in the Fractionals directory": ticked unless they untick it.
          const prof = { ...(s.profiles[me.id] ?? {}) };
          prof.fractionals = a.show !== false;
          if (prof.fractionals) delete prof.partnersOff;
          else prof.partnersOff = true;
          s.profiles[me.id] = prof;
          personIdxs.delete(g);
          const who = firsts.length ? ` You're connected with ${firsts.length === 1 ? firsts[0] : `${firsts.slice(0, -1).join(", ")} and ${firsts[firsts.length - 1]}`} in Messages.` : "";
          const bonus = mine ? ` You got ${REFERRAL_BONUS} credits for joining${paidInviters.size ? ", and so did whoever invited you" : ""}.` : "";
          return {
            message:
              `${claimed ? `${claimed === 1 ? "Your seat is" : `Your ${claimed} seats are`} on your profile now.` : ""}${waits ? ` ${waits === 1 ? "One seat waits" : `${waits} seats wait`} for an admin, because the name on file isn't yours.` : ""}${who}${bonus}`.trim(),
            id: recordId(me.id, []),
            ...(first ? { connected: first, connectedAll: opened } : {}),
          };
        }
        case "unlockFractional": {
          /*
           * Fractionals: "Unlock · 1 credit" on someone not on Merlin yet. The same purchase as who held
           * one of their seats (SEAT_BUNDLE), recorded on a seat of theirs at a company the member can
           * see ("<seat>.operator", exactly as the seat's own unlock records it), else on one of their
           * seats as "<seat>.person", which opens no company. Either way every seat of theirs shows who
           * held it, with the role (personHeld), and a seat of theirs bought before opens this for free.
           */
          const p = personIndex(g, s);
          const gi = p.byRid.get(String(a.id ?? ""));
          if (gi === undefined) throw new ActionError("We couldn't find that fractional. Refresh the page and try again.");
          const gr = p.groups[gi];
          if (gr.member === me.id) throw new ActionError("That's you, so there's nothing to unlock.");
          // Fellow fractionals are free (PEERS_FREE): the directory shows their name and seats to every member, so nothing is spent.
          if (PEERS_FREE) return { message: FRACTIONALS_FREE, id: gr.rid };
          const seats = gr.seats.map((id) => g.engagements.get(id)).filter((e): e is EngNode => !!e);
          const idxNow = memberIndex(seed, s);
          const cellNow = (e: EngNode) => cellOf(s, me, e, "engagement", "operator", idxNow, freeFor("engagement", e.id, "operator"));
          if (seats.some((e) => cellNow(e).s === "value")) throw new ActionError("You can already see who this is, so no credit was spent.");
          const lockedSeats = seats.filter((e) => cellNow(e).s === "locked");
          if (!lockedSeats.length) throw new ActionError("Nothing here is locked, so no credit was spent.");
          const anchor = lockedSeats.find((e) => !hiddenFor(e.companyId));
          const k = anchor ? fkey(anchor.id, "operator") : fkey(lockedSeats[0].id, "person");
          const { left, firstDay } = unlockRoom(s, me.id, nowMs);
          const bal = balance(s, me.id);
          if (bal <= 0) {
            const msg = "You're out of credits. Add a missing fact to earn one.";
            if (!addSignal(s, me.id, "wall", "server", now)) throw new ActionError(msg);
            refusal.message = msg;
            return { message: "" };
          }
          if (left < 1)
            throw new ActionError(
              firstDay
                ? `You've unlocked ${NEW_MEMBER_UNLOCK_MAX} facts today, the day-one limit. Your ${bal} credit${bal === 1 ? " is" : "s are"} here tomorrow.`
                : `You've reached today's unlock limit. The limit is ${UNLOCK_DAILY_MAX} unlocks in 24 hours.`,
            );
          s.ledger.push({ memberId: me.id, delta: -1, reason: "unlock", ref: k, at: now });
          s.unlocks[k] = [...(s.unlocks[k] ?? []), me.id];
          const name = live(lockedSeats[0], s, "operator") ?? "them";
          return {
            message: `Unlocked ${name} for 1 credit. Their name and role show on each of their seats now.`,
            id: gr.rid,
            cells: seats.flatMap((e) => ["operator", "role"].map((f) => changed("engagement", e, f))),
          };
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
          // An invite went out: the company is in their pipeline at Sent (lib/pipeline.ts), with the seat holder it went to.
          const holderName = live(e, s, "operator");
          const holderRole = live(e, s, "role");
          openEntry(((s.pipeline ??= {})[me.id] ??= emptyPipeline()), {
            id: `pl${randomBytes(8).toString("hex")}`,
            companyId: e.companyId,
            channel: "email",
            to: { seatId: e.id, ...(holderRole ? { role: String(holderRole) } : {}), ...(holderName ? { name: String(holderName) } : {}) },
            source: "record",
            via: "note",
            nowMs,
          });
          return { message: "", id: pubId(e.id) };
        }
        default:
          throw new ActionError(UNKNOWN_ACTION);
      }
    };

    const out = run();
    // An unlock that spent credits can be taken back for a moment (undoUnlock): remember what it opened.
    if (unlocksBefore && !opts.dryRun && !refusal.message && s.ledger.slice(ledgerAt).some((l) => l.memberId === me.id && l.reason === "unlock" && l.delta < 0)) {
      const keys = Object.keys(s.unlocks).filter((k) => s.unlocks[k] !== unlocksBefore[k] && s.unlocks[k].includes(me.id) && !(unlocksBefore[k] ?? []).includes(me.id));
      for (const [k, v] of recentUnlocks) if (nowMs - v.at > UNLOCK_UNDO_MS + UNLOCK_UNDO_GRACE_MS) recentUnlocks.delete(k);
      recentUnlocks.set(`${me.id}|${now}`, { keys, at: nowMs });
      out.undo = now;
    }
    // Value in the trial's last days (a warm path unlocked: who held a seat or a person's name; an invite sent) extends it once.
    if (billingLive() && (a.type === "invite" || s.ledger.slice(ledgerAt).some((l) => l.memberId === me.id && l.reason === "unlock" && (l.ref.endsWith(".operator") || l.ref.endsWith(".person") || (l.ref.startsWith("p_") && l.ref.endsWith(".name"))))))
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
        if (l.ref.endsWith(".operator") || l.ref.endsWith(".person")) holdersUnlocked++;
        else if (l.ref.endsWith(".identity")) companiesUnlocked++;
      }
    }
    const { earned, resetsAt } = earning(s, me.id, nowMs);
    return {
      ...out,
      me: {
        ...shownBalance(balance(s, me.id)), earned24h: earned, earnResetsAt: resetsAt, held: heldFor(s, me.id), pending: pendingFor(s, me.id), added, unlocked, holdersUnlocked, companiesUnlocked,
        unlocksLeft: unlockRoom(s, me.id, nowMs).left, freeCompany: freeCompanyLeft(s, me.id, nowMs), ...((c) => (c ? { crystal: c } : {}))(crystalOf(s, me.id, nowMs)), ...planCounts(s, g, memberIndex(seed, s), me.id, nowMs), started: startedOf(s, me.id), sellEarnLeft: Math.max(0, SELL_EARN_MAX - sellToday(s, me.id, nowMs, exemptPick).earned),
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
  // Activate your fractional profile: every conversation it opened (one with each inviter) is announced too.
  const all = (out as { connectedAll?: string[] }).connectedAll;
  if (all?.length && !opts.dryRun)
    for (const id of all.slice(1)) void import("./messages").then((m) => m.afterConnect(id, origin)).catch((e) => console.error("connect notice failed", e));
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
  // [google network] a member's network (and its sealed Google tokens) is theirs alone: never in the export.
  // A member's writing voice and what they did with their moves are theirs alone too, and so are their LinkedIn connections (lib/paths).
  // Each member's pipeline (their deals, notes and intros) is theirs alone as well, and so are their plans for a way in (routes; the anonymous routeStats counts go).
  // Proposals are a member's own and a client's signature: never in the export. Documents to sign and a member's own templates neither, nor a member's AI usage.
  const { signins: _signins, emailGrants: _emailGrants, network: _network, voice: _voice, moves: _moves, paths: _paths, routes: _routes, pipeline: _pipeline, proposals: _proposals, documents: _documents, myTemplates: _myTemplates, memberSignatures: _memberSignatures, aiDrafts: _aiDrafts, aiUsage: _aiUsage, peers: _peers, ...rest } = s as State & { paths?: unknown }; // eslint-disable-line @typescript-eslint/no-unused-vars
  // Peers: who passed what to whom, teams and circles stay; what members wrote in them (a pass's note, a team's draft, a circle post) does not.
  const peers = s.peers && {
    ...s.peers,
    passes: s.peers.passes.map((p) => ({ ...p, note: "" })),
    teams: s.peers.teams.map((t) => ({ ...t, draft: null })),
    circles: s.peers.circles.map((c) => ({ ...c, posts: c.posts.map((x) => ({ ...x, text: "" })) })),
  };
  const conversations = s.conversations?.map((c) => ({ ...c, messages: c.messages.map((m) => ({ ...m, text: "" })) }));
  // A generic inbox on a one-person site (lib/ownsites ownInvitesOnly) may carry an invite to Merlin and nothing else: never exported.
  const ownEmails = s.ownEmails && Object.fromEntries(Object.entries(s.ownEmails).filter(([, e]) => !ownInvitesOnly(e)));
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
    ...(ownEmails ? { ownEmails } : {}),
    ...(seatInvites ? { seatInvites } : {}),
    ...(peers ? { peers } : {}),
    ...(integrations ? { integrations } : {}),
    ledger: s.ledger.map((l) => (l.ref.startsWith("bench.") ? { ...l, ref: "bench" } : l)),
    benchRates,
  };
}

/* ---------- a closed account's personal data, deleted (lib/account.ts) ---------- */

/** Said to someone who joins or signs in with a closed account's address. */
export const ACCOUNT_CLOSED_JOIN = "This account was closed. Use the restore link we emailed when it closed, or write to us to restore it within 30 days.";

/**
 * CLOSURE_DAYS after an account closed (lib/account.ts purgeDue, on the job scheduler's tick):
 * delete the member's personal data, in the draft (inside mutate). Gone: their profile and account
 * record, their Google connection and what it read (Your network), their LinkedIn connections
 * import (State.paths), their messages (what they wrote; a conversation left with nothing goes),
 * their peers' notes, posts, teams and circle places, proposals and documents (with the documents'
 * files: their ids are returned for the caller to remove), My templates, the AI usage log and
 * agreement, saved views and connected apps, their pipeline, moves, voice, Slack and webhooks,
 * Crystal Ball, credits and unlock history, sign-in links and networks. Facts and records they
 * added to companies stay, attributed to nobody (FORMER_MEMBER), and so do benchmark rates.
 * Returns the sealed Google tokens (for the caller to revoke) and the document ids.
 */
function purgeMember(s: State, seed: Seed, id: string, nowIso: string): { memberId: string; googleTokens: string[]; documentIds: string[]; sendIds: string[] } {
  const net = s.network?.[id] as { google?: { token?: string }; gmail?: { token?: string } } | undefined;
  const googleTokens = [net?.google?.token, net?.gmail?.token].filter((x): x is string => !!x);
  const documentIds = (s.documents ?? []).filter((d) => d.memberId === id).map((d) => d.id);
  // Their proposals' sealed PDFs (lib/proposals/files.ts), removed by the caller.
  const sendIds = (s.proposals ?? []).filter((p) => p.memberId === id).flatMap((p) => p.sends.filter((x) => x.seal).map((x) => x.id));
  const del = <T>(rec: Record<string, T> | undefined) => {
    if (rec) delete rec[id];
  };
  // Their profile, account record and sign-in.
  del(s.profiles);
  s.members = s.members.filter((m) => m.id !== id);
  // A seed member's seed token never works again: a random one stands in its place.
  if (seed.members.some((m) => m.id === id)) s.tokens = { ...(s.tokens ?? {}), [id]: randomBytes(18).toString("base64url") };
  else del(s.tokens);
  if (s.signins) s.signins = s.signins.filter((x) => x.memberId !== id);
  del(s.ips);
  del(s.seen);
  del(s.follows);
  del(s.notMine);
  del(s.found);
  del(s.findMisses);
  del(s.digest?.members);
  // Google, LinkedIn, the network, and everything private to them.
  del(s.network);
  del((s as State & { paths?: Record<string, unknown> }).paths);
  del(s.moves);
  del(s.pipeline);
  // Your way in (lib/paths/plan.ts): every plan of theirs. State.routeStats stays: it counts outcomes by a step's shape only, no member in it.
  forgetRoutes(s.routes, id);
  del(s.voice);
  del(s.myTemplates);
  del(s.aiDrafts);
  del(s.aiUsage);
  del(s.integrations?.members);
  del(s.radar?.members);
  del(s.billing?.members);
  if (s.connector) {
    del(s.connector.alerts);
    s.connector.grants = s.connector.grants.filter((x) => x.memberId !== id);
  }
  s.proposals = (s.proposals ?? []).filter((p) => p.memberId !== id);
  s.documents = (s.documents ?? []).filter((d) => d.memberId !== id);
  // Their credits and what they bought: their own history only.
  s.ledger = s.ledger.filter((l) => l.memberId !== id);
  s.held = s.held.filter((h) => h.memberId !== id);
  for (const k of Object.keys(s.unlocks)) if (s.unlocks[k].includes(id)) s.unlocks[k] = s.unlocks[k].filter((x) => x !== id);
  for (const k of Object.keys(s.verifications)) if (s.verifications[k].includes(id)) s.verifications[k] = s.verifications[k].filter((x) => x !== id);
  s.reportLog = s.reportLog.filter((r) => r.memberId !== id);
  s.signals = s.signals.filter((x) => x.memberId !== id);
  s.referralPaid = s.referralPaid.filter((x) => x !== id);
  if (s.roleClaims) s.roleClaims = s.roleClaims.filter((x) => x.memberId !== id);
  if (s.seatClaims) s.seatClaims = s.seatClaims.filter((x) => x.memberId !== id);
  if (s.pendingSeats) s.pendingSeats = s.pendingSeats.filter((x) => x.memberId !== id);
  if (s.lockedViews) s.lockedViews = s.lockedViews.filter((x) => x.memberId !== id);
  if (s.seatInvites) s.seatInvites = s.seatInvites.filter((x) => x.by !== id);
  if (s.inviteJoins) s.inviteJoins = s.inviteJoins.filter((x) => x.by !== id && x.invitee !== id);
  if (s.seatPrivate) for (const [k, v] of Object.entries(s.seatPrivate)) if (v.by === id) delete s.seatPrivate[k];
  // Messages they wrote go; a conversation left with nothing goes too. Their blocks and reports go.
  if (s.conversations) {
    for (const c of s.conversations) if (c.a === id || c.b === id) c.messages = c.messages.filter((m) => m.by !== id);
    s.conversations = s.conversations.filter((c) => !((c.a === id || c.b === id) && c.messages.length === 0));
  }
  del(s.blocks);
  if (s.messageReports) s.messageReports = s.messageReports.filter((r) => (r as { by?: string }).by !== id);
  // Peers: what they wrote (a pass's note, a circle post), their teams and circle places, mutes.
  if (s.peers) {
    for (const q of s.peers.passes) if (q.by === id) q.note = "";
    s.peers.teams = s.peers.teams.filter((t) => t.by !== id && t.with !== id);
    for (const c of s.peers.circles) {
      c.members = c.members.filter((m) => m.id !== id);
      c.posts = c.posts.filter((x) => x.by !== id);
    }
    del(s.peers.mutes);
    del(s.peers.seen);
  }
  // Facts and records they added to companies stay, attributed to nobody.
  for (const v of Object.values(s.values)) {
    if (v.by === id) v.by = FORMER_MEMBER;
    if ((v as { memberId?: string }).memberId === id) delete (v as { memberId?: string }).memberId;
  }
  for (const list of [s.companies, s.engagements, s.contacts] as { by: string }[][]) for (const x of list) if (x.by === id) x.by = FORMER_MEMBER;
  for (const b of s.benchRates) if (b.by === id) b.by = FORMER_MEMBER;
  const c = s.closures?.[id];
  if (c) {
    c.purgedAt = nowIso;
    delete c.restore;
    delete c.mail;
  }
  memberIndexCache = null;
  // Their saved signature (its PNG file is removed by the caller).
  if (s.memberSignatures) delete s.memberSignatures[id];
  return { memberId: id, googleTokens, documentIds, sendIds };
}

/** A closed account's inbox hash is blocked: Merlin sends it nothing (lib/email.ts setMailBlock). */
setMailBlock((to) => {
  const cl = stateCache?.closures;
  if (!cl) return false;
  const h = mailHashOf(to);
  return Object.values(cl).some((c) => c.mail === h && !c.purgedAt);
});

/**
 * Peers (lib/peers.ts): a lead a peer passed opens its company for the member it went to, free and
 * outside the daily limits, as Unlock company would (its name, website and the postings and posted
 * rates of its open roles). Nothing goes on their credit history, so nothing is ever refunded for it.
 * Only `memberId` gains; another member's locks are untouched.
 */
function giftCompany(g: Graph, s: State, tracks: Tracks, memberId: string, companyId: string): void {
  const add = (k: string) => {
    const l = s.unlocks[k] ?? [];
    if (!l.includes(memberId)) s.unlocks[k] = [...l, memberId];
  };
  add(fkey(companyId, "identity"));
  for (const e of g.engagements.values()) {
    if (e.companyId !== companyId || !isOpenRole(e, s, tracks)) continue;
    for (const f of BUNDLE_FIELDS) {
      const v = valueOf(e, s, f);
      if (v && v.status === "live" && v.by !== memberId) add(fkey(e.id, f));
    }
  }
}

/**
 * The parts of this file that lib/messages.ts and lib/signin.ts build on. They change the state
 * only through `mutate` (one writer, in order), and read it through the same helpers the view uses.
 */
export const tableInternals = {
  // The committed state's graph is built once and shared, as the views share it (viewGraph); a draft's is its own. Read it, never change it.
  mutate, graph: viewGraph, memberIndex, seatHolder, signedIn, valueOf, live, cellOf, identityHidden, tracksOf, pubId, inboxKey, firstName, ID_KEY,
  // Your network's "Your seat" card: who is already on file at the member's own seat company; the seat a seat guess's Confirm claims.
  onFileAt, claimableSeats,
  // Alerts (lib/notify/events.ts) match new open roles the way the weekly email does.
  fnOf, hqRegion, isOpenRole, friendliness,
  // A role's country and region (lib/geo.ts), and the firms kept for review, as digestList reads them.
  geoOf, firmsInReview,
  // Plans (lib/billing): the value moment that extends a trial, the saved views Free alerts on, Free's limits, the member's opaque billing ref.
  valueMoment, alertViewsOf, freeNow, closeNow, closeUseOf, keepOf, billingRef, balance, grantPlanCredits,
  // The next-client radar (lib/radar) reads hires and open roles the way the table does, and records its product signals.
  belowLead, offBarRole, isUnseen, addSignal,
  // How a Crystal Ball company opens for the member today (its email's buttons say the same).
  crystalOf,
  // Own sites (lib/ownsites): Undo takes every found email back, with refunds; members whose own choice keeps them out of view are never read.
  refundOwnEmails, privateMemberKeys,
  // Peers (lib/peers.ts): a passed lead's company opens for the peer free; the passer's credits go within the daily earning cap.
  giftCompany, grant, knownCompanies, releaseHeld,
  // Closing an account (lib/account.ts): its personal data deleted after CLOSURE_DAYS; the member index rebuilt after a restore.
  purgeMember,
  memberIndexReset: () => void (memberIndexCache = null),
  // "Hide my name on my seats": who held a seat is never named where it applies.
  holderNameHidden,
};

/** What Fractionals (lib/fractionals.ts) reads: the fractionals on file, and who bought or shows which. */
export const fractionalInternals = { viewGraph, personIndex, boughtSeat, personShown, invitable, knownCompanies, openByStatus, stateNow: () => stateCache };

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
  /** `ended`: the seat's status is Ended, and `end` its end month or year when on file (the page reads "2023 to 2025", not "since 2023"). */
  seat: { role: string | null; fn: string | null; company: string | null; start: string | null; end?: string | null; ended?: boolean; named: boolean } | null;
  me: { first: string } | null;
  /** Sign-in links go by email (an email provider is set up). */
  email: boolean;
  /** The first name of the member whose invite code came with the link (?ref=), or null. */
  inviter: string | null;
  /**
   * Activate your fractional profile: the link's seat is one of several seats of one fractional
   * (personIndex), still open to claim. Each seat that looks like theirs: its public id, role,
   * function, dates, whether it's current, and its company's free facts ("Fintech · 51–200 · MA").
   * The company's name only on the link's own seat, as the one-seat page names it: whoever holds a
   * link sees no company an inviter hasn't seen. `inviter`: the member whose link this is (else the
   * first to invite them), with their title, when they joined and their note without its link.
   * `others`: how many more members invited them (a count, never who). Never the fractional's name.
   */
  person?: {
    seats: { id: string; role: string | null; fn: string | null; start: string | null; end: string | null; now: boolean; company: string | null; facts: string; link: boolean }[];
    inviter: { name: string; title: string; since: string | null; note: string | null } | null;
    others: number;
  };
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
      ...(live(e, s, "status") === "Ended" ? { ended: true, end: hireMonth(live(e, s, "end")) ? live(e, s, "end") : null } : {}),
      named: !!publicName(e, s) || !!seedPublicName(seed, s, e.id),
    },
    ...(status === "open" ? personPage(seed, s, g, e, locked, ref) : {}),
  };
}

/** The seats of the link's fractional still open to claim (a found seat, unclaimed), the link's own first: one seat is the one-seat page. */
function activationSeats(s: State, g: Graph, e: EngNode): EngNode[] {
  const at = personOf(s, e);
  if (!at) return [e];
  const open = at.gr.seats.map((id) => g.engagements.get(id)!).filter((x) => x && x.source === SEAT_SCAN && !!publicName(x, s));
  return [e, ...open.filter((x) => x.id !== e.id)];
}
/** ClaimPage.person, for a fractional with more than one seat to claim. */
function personPage(seed: Seed, s: State, g: Graph, e: EngNode, locked: boolean, ref: unknown): Pick<ClaimPage, "person"> {
  const seats = activationSeats(s, g, e);
  if (seats.length < 2) return {};
  const idx = memberIndex(seed, s);
  const facts = (x: EngNode) => {
    const c = g.companies.get(x.companyId);
    const geo = geoOf(c, s);
    return [live(c, s, "industry"), live(c, s, "employees"), geo.region ?? geo.country].filter(Boolean).join(" · ");
  };
  const ids = new Set(seats.map((x) => x.id));
  const invites = (s.seatInvites ?? []).filter((x) => ids.has(x.engagementId) && !x.claimedBy).sort((a, b) => a.at.localeCompare(b.at));
  const via = memberByInviteCode(seed, s, ref);
  const firstBy = via?.id ?? invites[0]?.by ?? null;
  const who = firstBy ? idx.byId.get(firstBy) ?? null : null;
  const others = new Set(invites.map((x) => x.by).filter((b) => b !== firstBy)).size;
  const note = firstBy ? invites.find((x) => x.by === firstBy)?.note ?? null : null;
  const prof = who ? s.profiles[who.id] ?? {} : {};
  return {
    person: {
      seats: seats.map((x) => {
        const end = live(x, s, "end");
        const status = live(x, s, "status");
        return {
          id: pubId(x.id),
          role: live(x, s, "role"),
          fn: fnOf(x, s),
          start: live(x, s, "start"),
          end: end && end !== "Ongoing" ? end : null,
          now: status !== "Ended" && (status === "Active" || !end || end === "Ongoing"),
          company: x.id === e.id && !locked ? g.companies.get(x.companyId)?.name ?? null : null,
          facts: facts(x),
          link: x.id === e.id,
        };
      }),
      inviter: who
        ? {
            name: who.name,
            title: (prof.title || (who.title === "Member" ? "" : who.title) || "").trim(),
            since: s.members.find((m) => m.id === who.id)?.at ?? null,
            // Their note as they wrote it, without the claim link in it.
            note: note ? tidy(note.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " "), 400) || null : null,
          }
        : null,
      others,
    },
  };
}

/**
 * Activate your fractional profile on a claim link (POST /api/table/names, op "activate"): the
 * signed-in member claims every seat of the link's fractional they left ticked (perform's
 * "activate"). The answer names the conversation it opened with the first inviter, and their record.
 */
export async function activateByToken(
  memberToken: string | null,
  token: unknown,
  opts: { origin?: string; ref?: unknown; skip?: unknown; show?: boolean } = {},
): Promise<ActionResult & { conversationId: string | null }> {
  const id = await seatOfToken(token);
  if (!id) throw new ActionError("That claim link didn't work. It may be cut short. Open the whole link from the message.");
  const code = typeof opts.ref === "string" ? opts.ref.trim().slice(0, 40) : "";
  const skip = Array.isArray(opts.skip) ? opts.skip.map((x) => String(x)).slice(0, 200) : [];
  const out = await perform(memberToken, { type: "activate", engagementId: pubId(id), skip, show: opts.show !== false }, opts.origin, { claimLink: true, ...(code ? { ref: code } : {}) });
  const carried = out as { connectedAll?: string[] };
  return { ...out, conversationId: carried.connectedAll?.[0] ?? null };
}

/** The name on a claim link's seat, for joining from Activate your fractional profile (never sent to the page). */
export async function seatNameForJoin(token: unknown): Promise<string | null> {
  const id = await seatOfToken(token);
  if (!id) return null;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  return seedPublicName(seed, s, id);
}

/**
 * "Not mine" on one seat of the activation page: a name from public profiles on that seat, which must
 * be one of the link's fractional's seats, comes off at once (takeNameOff, "notme"), with refunds.
 */
export async function nameOffSeat(token: unknown, seatPubId: unknown): Promise<{ done: boolean; why?: "invalid" | "held" | "unnamed" }> {
  const id = await seatOfToken(token);
  if (!id) return { done: false, why: "invalid" };
  return mutate((s, seed) => {
    const g = graph(seed, s);
    const e = g.engagements.get(id);
    if (!e) return { done: false, why: "invalid" as const };
    const target = activationSeats(s, g, e).find((x) => pubId(x.id) === String(seatPubId ?? ""));
    if (!target) return { done: false, why: "invalid" as const };
    if (!seedPublicName(seed, s, target.id)) return { done: false, why: "held" as const };
    takeNameOff(s, target.id, "notme", new Date().toISOString());
    return { done: true };
  });
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
    // The link's fractional with more seats (Activate your fractional profile): "This isn't me" and
    // "Remove my name" are about the person, so every seat of theirs still named from public profiles goes too.
    const g = graph(seed, s);
    const e = g.engagements.get(id);
    const more = e ? activationSeats(s, g, e).filter((x) => x.id !== id && !!seedPublicName(seed, s, x.id)) : [];
    takeNameOff(s, id, how, now);
    for (const x of more) takeNameOff(s, x.id, how, now);
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
    // A prospect (outreach only, no seat): their own firm by name or website. Their email goes, and their site is never read again.
    let n = ownProspectOff(s, seed, name, key, site, now);
    if (!at.size) return n;
    for (const e of seed.engagements) {
      if (!at.has(e.companyId) || nameVerified(s, e.id)) continue;
      const onFile = seedPublicName(seed, s, e.id);
      if (!onFile || !sameName(onFile, name)) continue;
      takeNameOff(s, e.id, "public", now);
      n++;
    }
    for (const cid of at) n += leaderNameOff(s, g, cid, name, now);
    return n;
  });
}

/**
 * Remove my name for a leader read from the company's website: their name and title come off the
 * company's record (State.leaders) and stay off on every later read (State.leadersRemoved holds a
 * one-way key, never the name), their record there goes, and whoever paid to see anything on it
 * gets the credit back. The mark is kept even when no one of that name is on file, so a later read
 * never keeps them. Returns 1 when someone of that name came off.
 */
function leaderNameOff(s: State, g: Graph, companyId: string, name: string, now: string): number {
  const key = leaderKey(companyId, name);
  if (!key) return 0;
  const marks = ((s.leadersRemoved ??= {})[companyId] ??= []);
  if (!marks.includes(key)) marks.push(key);
  if (marks.length > 200) marks.splice(0, marks.length - 200);
  const rec = s.leaders?.[companyId];
  let off = 0;
  if (rec) {
    for (const [fn, l] of Object.entries(rec.functions)) {
      if (!l.name || !sameName(l.name, name)) continue;
      const { name: _n, title: _t, page: _p, ...rest } = l; // eslint-disable-line @typescript-eslint/no-unused-vars
      rec.functions[fn] = rest;
      off = 1;
    }
    if (rec.top && sameName(rec.top.name, name)) {
      delete rec.top;
      off = 1;
    }
  }
  // Their record on Merlin: what members added to it and paid for goes with it, the credit back.
  const pid = leaderPersonId(companyId, name);
  if (g.contacts.get(pid)?.site || Object.keys(s.unlocks).some((k) => k.startsWith(`${pid}.`)) || Object.keys(s.values).some((k) => k.startsWith(`${pid}.`))) {
    for (const f of ["name", "title", "relationship", "email", "phone", "linkedin"]) {
      const k = fkey(pid, f);
      refundPaid(s, k, now, "name");
      delete s.values[k];
      delete s.verifications[k];
    }
    off = 1;
  }
  return off;
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
    // The seat itself shows its title already: fellow fractionals are free at a company the member sees (PEERS_FREE).
    if (peerFree(s, me, e, "engagement", "role", !identityHidden(g, s, idx, tracks, me, e.companyId))) continue;
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
/** A discount code as kept: letters, digits, - and _, upper case, at most 40. "" when nothing is left. */
export const cleanPromo = (raw: unknown) =>
  String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
/** The discount code a member arrived with (?code=), or "". */
export const promoOf = (s: State, memberId: string): string => s.members.find((m) => m.id === memberId)?.promo ?? s.profiles[memberId]?.promo ?? "";
/** Keep a member's discount code (the newest one wins). */
function setPromo(s: State, memberId: string, code: string) {
  const joined = s.members.find((m) => m.id === memberId);
  if (joined) joined.promo = code;
  else s.profiles[memberId] = { ...(s.profiles[memberId] ?? {}), promo: code };
}
/**
 * The survey code on the plans sheet: "RN-SURVEY10 applied: 10% off" when the member's code is
 * the survey code (RN_SURVEY_CODE) and Stripe applies it for them (STRIPE_PROMO_SURVEY). The
 * percent is read from the code's last digits. Null otherwise.
 */
function promoView(code: string): PlanView["code"] {
  if (!code || !surveyCode(code) || !process.env.STRIPE_PROMO_SURVEY?.trim()) return null;
  const pct = /(\d{1,2})$/.exec(code)?.[1];
  return { code, off: pct ? `${Number(pct)}% off` : "a discount" };
}
/** Free's limits apply to this member now. Never while billing isn't live: then nothing is gated. */
function freeNow(s: State, memberId: string, nowMs = Date.now()): boolean {
  return gated(planRec(s, memberId), nowMs);
}
/** Close features (proposals sent for signature, your own templates, Claude drafting) are open to this member now: lib/billing/rules.ts canClose. */
function closeNow(s: State, memberId: string, nowMs = Date.now()): boolean {
  return canClose(planRec(s, memberId), nowMs);
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
/** Home's Pro welcome shows for this long after Pro was first paid for (a member who was on Pro long before the card existed never gets it). */
export const PRO_WELCOME_DAYS = 30;
/**
 * Home's one-time Pro welcome is due: the member is on paid Pro (bought now, or bought in the trial
 * and waiting for its first charge), it started in the last PRO_WELCOME_DAYS, and they haven't
 * closed the card (PlanRecord.notices.proWelcomeSeen).
 */
const proWelcomeDue = (rec: PlanRecord | undefined, name: PlanView["name"], nowMs: number): boolean => {
  if (name !== "pro" || !rec || rec.notices?.proWelcomeSeen) return false;
  if (rec.paidSince) return nowMs - Date.parse(rec.paidSince) < PRO_WELCOME_DAYS * DAY_MS;
  return !!rec.proStartsAt;
};
/** Home's one-time trial card shows for this long after the trial started (a member mid-trial when the card came gets none). */
export const TRIAL_CARD_DAYS = 3;
/** Home's one-time trial card is due: on the trial, started in the last TRIAL_CARD_DAYS, and not closed (PlanRecord.notices.trialStartedSeen). */
const trialCardDue = (rec: PlanRecord | undefined, name: PlanView["name"], nowMs: number): boolean =>
  name === "trial" && !!rec?.trialStartedAt && !rec.notices?.trialStartedSeen && nowMs - Date.parse(rec.trialStartedAt) < TRIAL_CARD_DAYS * DAY_MS;
/**
 * What a member did with Close features since `sinceIso` (lib/billing/rules.ts CloseUse), counts
 * only: proposals and documents made, Claude drafts (each metered call), and sends for signature.
 */
function closeUseOf(s: State, memberId: string, sinceIso: string): CloseUse {
  let made = 0;
  let sent = 0;
  for (const p of s.proposals ?? []) {
    if (p.memberId !== memberId) continue;
    if (p.createdAt >= sinceIso) made++;
    sent += p.sends.filter((x) => x.sentAt >= sinceIso).length;
  }
  for (const d of s.documents ?? []) {
    if (d.memberId !== memberId) continue;
    if (d.createdAt >= sinceIso) made++;
    if (d.sentAt && d.sentAt >= sinceIso) sent++;
  }
  const drafted = (s.aiUsage?.[memberId]?.log ?? []).filter((l) => l.at >= sinceIso).length;
  return { made, drafted, sent };
}
/** The plan the trial nudges toward (PlanView.keep): Close for an active Close user in their trial, else Pro. */
function keepOf(s: State, memberId: string): "pro" | "close" {
  const rec = planRec(s, memberId);
  return keepTier(closeUseOf(s, memberId, rec?.trialStartedAt ?? "1970-01-01T00:00:00.000Z"));
}
/** Me.plan: what the Plan and billing page, the banner and the upgrade moments read. */
function planView(s: State, memberId: string, nowMs: number, roles?: { tracks: Tracks; fnOfEng: (engId: string) => string | null }): PlanView {
  const rec = planRec(s, memberId);
  const name = planOf(rec, nowMs);
  const prof = s.profiles[memberId] ?? {};
  const ending = trialEnding(rec, nowMs);
  const free = name === "free";
  const pause = pauseState(rec, nowMs);
  // The value receipt before the decision: in the trial's last 3 days, what it gave them so far (the same counts as its email).
  const receipt = ending && rec?.trialStartedAt ? valueLines(valueCounts(s, roles?.tracks ?? null, roles?.fnOfEng ?? null, memberId, rec.trialStartedAt, new Date(nowMs + 1).toISOString())) : null;
  // The trial's end as a loss in plain terms, in its last SUMMARY_DAYS: what they used, and what locks (Home's banner, Plan and billing, the same as the day-18 email).
  const daysLeft = trialDaysLeft(rec, nowMs);
  const summary =
    name === "trial" && rec?.trialStartedAt && daysLeft !== null && daysLeft <= SUMMARY_DAYS
      ? trialSummary(valueCounts(s, null, null, memberId, rec.trialStartedAt, new Date(nowMs + 1).toISOString()), daysLeft)
      : null;
  return {
    code: promoView(promoOf(s, memberId)),
    ...(receipt ? { receipt } : {}),
    ...(summary ? { summary } : {}),
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
    prices: { month: PRICES.month, year: PRICES.year, closeMonth: PRICES.closeMonth, closeYear: PRICES.closeYear, topup: PRICES.topup, topupCredits: TOPUP_CREDITS, proCredits: PRO_CREDITS },
    // Pro or Close (the trial is Close), whether Close features are open now, and whether Close can be bought.
    tier: tierNow(rec, nowMs),
    keep: keepOf(s, memberId),
    canClose: canClose(rec, nowMs),
    ...(rec?.closeUntil && Date.parse(rec.closeUntil) > nowMs && rec.tier !== "close" ? { closeUntil: rec.closeUntil } : {}),
    closeOpen: closeReady(),
    aiPack: aiPackReady(),
    limits: { savedViews: free ? FREE_SAVED_VIEWS : null, claudePerDay: free ? FREE_MCP_PER_DAY : null },
    ...(free && rec?.trialStartedAt && !rec.paidSince && !rec.notices?.trialEndedSeen ? { trialEnded: true } : {}), // [ux ws1] Today's one-time trial-ended card
    ...(proWelcomeDue(rec, name, nowMs) ? { proWelcome: true } : {}),
    ...(trialCardDue(rec, name, nowMs) ? { trialStarted: true } : {}),
    ...(aiConfigured() && canClose(rec, nowMs) ? { ai: aiMeter(s, memberId, nowMs) } : {}),
    // A pack paid for after drafting closed for them (paid after the trial ended): kept for Close.
    ...(aiConfigured() && !canClose(rec, nowMs) && aiBudgetOf(s, memberId, nowMs).pack > 0 ? { aiPackKept: true as const } : {}),
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
      const cents = rec.cents || tierPrice(rec.tier ?? "pro", rec.interval === "year" ? "year" : "month") * 100;
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
  let rises = 0;
  for (const [domain, n] of byDomain) {
    const id = ids.get(domain);
    if (!id) continue;
    const r = noteHireCount(all[id], n, at, 1);
    all[id] = r.rec;
    if (r.rose) rises++;
  }
  return rises;
}

/**
 * One company's count of full-time hires in a function, read again: the record, and whether the
 * count rose the way Crystal Ball reads a build. The first read is the baseline, never a rise. A
 * rise: from none to `firstAt` or more, or two or more over the lowest count of the last 30 days,
 * at most one in 30 days.
 */
function noteHireCount(r: SalesBuildRecord | undefined, n: number, at: string, firstAt: number): { rec: SalesBuildRecord; rose: boolean } {
  if (!r) return { rec: { n, at, ...(n > 0 ? { firstAt: at } : {}), hist: [{ n, at }] }, rose: false };
  const atMs = Date.parse(at);
  const recent = r.hist.filter((x) => atMs - Date.parse(x.at) <= SALES_JUMP_DAYS * DAY_MS);
  const low = Math.min(r.n, ...recent.map((x) => x.n));
  const last = r.rises?.[r.rises.length - 1];
  const lately = !!last && atMs - Date.parse(last.at) <= SALES_JUMP_DAYS * DAY_MS;
  let rose = false;
  if (!lately && ((r.n === 0 && n >= firstAt) || n - low >= 2)) {
    (r.rises ??= []).push({ at, from: r.n === 0 ? 0 : low, to: n });
    if (r.rises.length > 6) r.rises.splice(0, r.rises.length - 6);
    rose = true;
  }
  if (n > 0 && !r.firstAt) r.firstAt = at;
  if (n !== r.n) {
    r.hist.push({ n, at });
    if (r.hist.length > SALES_HIST_MAX) r.hist.splice(0, r.hist.length - SALES_HIST_MAX);
  }
  r.n = n;
  r.at = at;
  return { rec: r, rose };
}

/**
 * Full-time hires each career feed listed this run in the functions besides sales (by domain, then
 * function: lib/scan/sources/ats.ts teamHireCounts), kept per company and function
 * (State.teamBuild) as noteSalesHires keeps sales. A team build reads as a burst: from none to two
 * or more, or two or more more than the lowest count of the last 30 days. Counts and dates only.
 */
export function noteTeamHires(d: State, seed: Seed, byDomain: Map<string, Record<string, number>>, at: string): number {
  const g = graph(seed, d);
  const ids = new Map<string, string>();
  for (const c of g.companies.values()) {
    const host = hostOf(live(c, d, "website"));
    if (host && !ids.has(host)) ids.set(host, c.id);
  }
  const all = (d.teamBuild ??= {});
  let rises = 0;
  for (const [domain, counts] of byDomain) {
    const id = ids.get(domain);
    if (!id) continue;
    const mine = (all[id] ??= {});
    for (const [fn, n] of Object.entries(counts)) {
      const r = noteHireCount(mine[fn], n, at, 2);
      mine[fn] = r.rec;
      if (r.rose) rises++;
    }
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
  const teams = new Map<string, Record<string, number>>();
  const sources = atsSources(boards, { fetch: opts.feed ?? fetchFeed, gone: (d) => gone.add(d), salesCount: (d, n) => sales.set(d, n), teamCount: (d, c) => teams.set(d, c) });
  const save = () =>
    mutate((d, seedD) => {
      const at = new Date(now).toISOString();
      const ats = (d.scan.ats ??= {});
      Object.assign(ats, fresh);
      for (const x of gone) ats[x] = { at };
      if (sales.size) noteSalesHires(d, seedD, sales, at);
      if (teams.size) noteTeamHires(d, seedD, teams, at);
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
      if (aboutEnabled() && settingOf((await loadState().catch(() => null))?.schedule, "about").every !== "off") void import("./about/run").then((m) => m.runAbout()).catch((e) => console.error("about run failed", e));
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

/** Whether a scan is running in this process (Pilot metrics' Automatic jobs). */
export const scanRunning = () => scanFlight !== null;

/**
 * Start a scan in the background when one is due: RN_SCAN=1, and its schedule says so
 * (lib/schedule.ts: once a week by default). A run where every board failed is tried again after
 * 6 hours. Called by the scheduler and on page loads, so it must stay cheap: at most one try an hour.
 */
export async function maybeScan(origin?: string, nowMs = Date.now()): Promise<boolean> {
  if (process.env.RN_SCAN !== "1" || scanFlight || nowMs - scanTriedAt < 60 * 60_000) return false;
  const s = await loadState();
  const st = settingOf(s.schedule, "scan");
  const last = Date.parse(s.scan.lastRunAt ?? "");
  const allFailed = s.scan.sources.length > 0 && !s.scan.sources.some((x) => !x.error && x.fetched > 0);
  const retry = st.every !== "off" && allFailed && nowMs - last >= 6 * 60 * 60_000;
  if (!retry && !isDue(st, last, nowMs)) return false;
  scanTriedAt = nowMs;
  void runScan(origin).catch((e) => console.error("scan failed", e));
  return true;
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

  // Every link in it signs the member in, once (lib/emailIn.ts), loaded here so the two files don't import each other at start.
  const emailIn = await import("./emailIn");
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
    // Each link to the app, signed in for this member (a path the links can't carry stays as it was).
    const linker = emailIn.emailLinker(seed, s, m.id, base, nowMs);
    const signed = (u: string) => {
      const path = u.startsWith(base) ? u.slice(base.length) || "/" : null;
      return path !== null && emailIn.safePath(path) ? linker(path) : u;
    };
    // How a locked company opens for them (the email says it as their plan does).
    const rec = planRec(s, m.id);
    const freeDay = !(process.env.RN_SCAN_TEST === "1" && process.env.RN_FREE_COMPANY === "off");
    const unlock = hasPro(rec, nowMs) ? "pro" : gated(rec, nowMs) ? "free" : freeDay ? "day" : undefined;
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
        appUrl: signed(`${base}/`),
        unsubscribeUrl: `${base}/api/table/unsubscribe?m=${pubId(m.id)}&s=${unsubSig(m.id)}`,
        settingsUrl: linker("/?p=notifications"),
        seatsUrl: linker("/?p=seats"),
        creditsUrl: linker("/?p=credits"),
        ...(unlock ? { unlock: unlock as "pro" | "free" | "day" } : {}),
        rolesUrl: signed(listed.url),
        roles: listed.roles.map((r) => ({ ...r, url: signed(r.url) })),
        ...(hires.length ? { hires: hires.map((h) => ({ ...h, url: signed(h.url), rows: h.rows.map((r) => ({ ...r, url: signed(r.url) })) })) } : {}),
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

/* ---------- leaders named on the company's website: decision makers on the record ---------- */

/**
 * The owner's rule, as for seat-holder names from public profiles (scripts/add-seat-names.mjs):
 * names only for a company whose HQ is in the United States. An HQ we can't place is not.
 */
const LEADER_NAMES_COUNTRY = "United States";
const namesAllowedAt = (c: Node | undefined, s: State) => !!c && geoOf(c, s).country === LEADER_NAMES_COUNTRY;
/** A person at a company as a one-way key of their first and last name (nameKey): the record's id and Remove my name's mark. Never the name. */
function leaderKey(companyId: string, name: string): string {
  const k = nameKey(name);
  return k ? createHmac("sha256", ID_KEY).update(`leader:${companyId}:${k}`).digest("base64url").slice(0, 20) : "";
}
/** The record id of a leader from the website: built from the company and the person's key, so it holds no name. */
const leaderPersonId = (companyId: string, name: string) => `p_site_${leaderKey(companyId, name)}`;
/** They asked to be removed at this company (Remove my name, State.leadersRemoved). */
const leaderOff = (s: State, companyId: string, name: string) => {
  const k = leaderKey(companyId, name);
  return !k || (s.leadersRemoved?.[companyId] ?? []).includes(k);
};
/**
 * Members whose profile keeps them out of view (Profile.fractionals false, or Referral partners
 * off, which Fractionals reads as hidden too), as name keys: a leader of that name read from a
 * website isn't shown, so a fractional who is a member keeps their own choice.
 */
function privateMemberKeys(seed: Seed, s: State): Set<string> {
  const out = new Set<string>();
  for (const m of [...seed.members, ...s.members]) {
    const p = s.profiles[m.id];
    // A closed account keeps out of view like a member who said no (State.closures).
    if (s.closures?.[m.id] || (p && (p.fractionals === false || p.partnersOff))) {
      const k = nameKey(m.name);
      if (k) out.add(k);
    }
  }
  return out;
}
/** The named leaders of a record: the top leader first, then each function's in the order functions are listed. */
function namedLeaders(rec: Pick<LeadersRecord, "functions" | "top">): (LeaderFn & { name: string; title: string })[] {
  const out: (LeaderFn & { name: string; title: string })[] = [];
  const add = (l: LeaderFn | undefined) => {
    if (l?.name && l.title && !out.some((x) => sameName(x.name, l.name!))) out.push(l as LeaderFn & { name: string; title: string });
  };
  add(rec.top);
  for (const fn of FUNCTIONS) add(rec.functions[fn]);
  return out;
}
/**
 * A record's names where they may stay: at a United States company, never for someone who asked
 * to be removed there, never for a member whose profile keeps them out of view. Elsewhere the
 * function's leader stays without a name, and the top leader (kept only for the name) goes.
 * Returns how many distinct people stayed named.
 */
function keepNamesWhereAllowed(s: State, seed: Seed, node: Node | undefined, companyId: string, rec: Pick<LeadersRecord, "functions" | "top">, priv?: Set<string>): number {
  const allowed = namesAllowedAt(node, s);
  const hidden = priv ?? privateMemberKeys(seed, s);
  const ok = (name: string) => allowed && !leaderOff(s, companyId, name) && !hidden.has(nameKey(name));
  for (const [fn, l] of Object.entries(rec.functions)) {
    if (!l.name || ok(l.name)) continue;
    const { name: _n, title: _t, page: _p, ...rest } = l; // eslint-disable-line @typescript-eslint/no-unused-vars
    rec.functions[fn] = rest;
  }
  if (rec.top && !ok(rec.top.name)) delete rec.top;
  return namedLeaders(rec).length;
}
/* ---------- the seat holder's email from their own website (lib/ownsites) ---------- */

/** The record of a seat holder's email from their own website, on one seat: one per seat, so the seat's own record shows it. */
const ownPersonId = (seatId: string) => `p_own_${seatId}`;
/** Each person key's seats on the seed (SeedEngagement.holderKey), built once per seed. */
const seatsByKeyIndex = new WeakMap<Seed, Map<string, string[]>>();
function seatsByKey(seed: Seed): Map<string, string[]> {
  let m = seatsByKeyIndex.get(seed);
  if (!m) {
    m = new Map();
    for (const [seatId, k] of seedHolderKeys(seed)) {
      const l = m.get(k);
      if (l) l.push(seatId);
      else m.set(k, [seatId]);
    }
    seatsByKeyIndex.set(seed, m);
  }
  return m;
}

/**
 * The seat holder's email from their own firm's website (State.ownEmails, lib/ownsites), as a
 * person on each of their seats: the seat holder, their name as the seat shows it (it opens with
 * who held the seat, never apart), and the email, 1 credit once the name shows, like anyone's. Only
 * with RN_OWNSITES=1 (graph() calls this only then), never a dry run's find (pending), only for a
 * person the import linked (Seed.ownSites: the United States, never California), only on a seat
 * whose name from public profiles still stands (not claimed by a member, not taken off with Remove
 * my name), and never for a member whose own choice keeps them out of view. Never an invites-only
 * address (a generic inbox on a one-person site, ownInvitesOnly): that one may carry an invite to
 * Merlin and nothing else, so it is never a member's view of their email, the export or the connector.
 */
function ownSitePeople(seed: Seed, s: State, g: Graph) {
  const links = seed.ownSites;
  if (!links) return;
  let priv: Set<string> | null = null;
  const bySeat = seatsByKey(seed);
  for (const [k, em] of Object.entries(s.ownEmails ?? {})) {
    if (!em?.email || em.pending || em.prospect || ownInvitesOnly(em) || !links[k]) continue;
    const peers: string[] = [];
    for (const seatId of bySeat.get(k) ?? []) {
      const e = g.engagements.get(seatId);
      const v = valueOf(e, s, "operator");
      if (!e || !v?.pub || v.status !== "live") continue;
      priv ??= privateMemberKeys(seed, s);
      if (priv.has(nameKey(v.value))) continue;
      const id = ownPersonId(seatId);
      if (g.contacts.has(id)) continue;
      peers.push(id);
      g.contacts.set(id, {
        id,
        seedFields: { name: v.value, relationship: OWNSITE_RELATIONSHIP, email: em.email },
        companyId: e.companyId,
        engagementId: e.id,
        source: OWNSITE_SOURCE,
        own: { seat: e, peers },
      });
    }
  }
}

/** Whether `me` sees the seat holder this own-site record is (the seat's holder cell shows them the name). */
function ownNameSeen(s: State, me: Member | null, node: Node | undefined): boolean {
  const own = (node as PersonNode | undefined)?.own;
  return !!own && cellOf(s, me, own.seat, "engagement", "operator").s === "value";
}
/** The member paid for this seat holder's email on another of their seats: it is theirs on this one too. */
function ownEmailHeld(s: State, me: Member | null, node: Node | undefined, entity: Entity, key: string): boolean {
  const own = (node as PersonNode | undefined)?.own;
  if (!me || !own || entity !== "contact" || key !== "email") return false;
  return own.peers.some((id) => id !== node!.id && (s.unlocks[fkey(id, "email")] ?? []).includes(me.id));
}

/** Remove my name for a prospect (Seed.ownSiteProspects): the same person at their own firm, by its name or website. Returns how many came off. */
function ownProspectOff(s: State, seed: Seed, name: string, companyKey: string | null, site: string | null, now: string): number {
  let n = 0;
  for (const [k, p] of Object.entries(seed.ownSiteProspects ?? {})) {
    if (!p?.name || !sameName(p.name, name)) continue;
    const firmMatch = !!companyKey && !!p.firm && keyOfCompany(p.firm) === companyKey;
    const siteMatch = !!site && siteKey(p.site) === site;
    if (!firmMatch && !siteMatch) continue;
    if (s.ownEmails) delete s.ownEmails[k];
    const job = (s.ownSitesJob ??= { people: {}, lastRun: null, lastDry: null, dryDone: [] });
    if (job.people[k]?.s !== "removed") n++;
    job.people[k] = { s: "removed", at: now };
  }
  return n;
}

/** Every unlock of a seat holder's email from their website (on these seats, or all), refunded and forgotten. Returns how many members got a credit back. */
function refundOwnEmails(s: State, now: string, seatIds?: string[], why: LedgerEntry["why"] | null = "name"): number {
  const only = seatIds ? new Set(seatIds.map((x) => fkey(ownPersonId(x), "email"))) : null;
  let n = 0;
  for (const k of Object.keys(s.unlocks)) {
    if (!k.startsWith("p_own_") || !k.endsWith(".email") || (only && !only.has(k))) continue;
    n += refundPaid(s, k, now, why ?? undefined);
  }
  return n;
}

/**
 * Remove my name (and "Not me", "This is wrong", an admin taking a name off): the person's email
 * from their website goes too, on every seat of theirs, with refunds, and the job never reads their
 * site again (State.ownSitesJob marks them removed).
 */
function ownEmailOff(s: State, seed: Seed, engId: string, now: string) {
  const k = seedHolderKeys(seed).get(engId);
  if (!k || (!s.ownEmails?.[k] && !seed.ownSites?.[k])) return;
  if (s.ownEmails) delete s.ownEmails[k];
  const job = (s.ownSitesJob ??= { people: {}, lastRun: null, lastDry: null, dryDone: [] });
  job.people[k] = { s: "removed", at: now };
  refundOwnEmails(s, now, seatsByKey(seed).get(k) ?? [engId]);
}

/** The email on file is a likely one built from the pattern (lib/leaders/likely.ts), not a fact anyone added. */
const likelyGuess = (node: Node, s: State) => !!(node as PersonNode).likely && !byField(s, "values", node.id, "email");

/**
 * Leaders named on each company's own website (State.leaders) as people on the record: decision
 * makers at the company level, with the name and title the page prints (seedFields, by "seed" like
 * our records: 1 credit opens both, their LinkedIn, email and phone after, as for anyone). Only
 * where names may show (namesAllowedAt, Remove my name, a member's own choice). Someone already on
 * file there under the same first and last name (sameName) is the same person: the leader isn't
 * added again. Then a likely email for each leader with none, from the pattern of the emails
 * members added at the company's domain (lib/leaders/likely.ts).
 */
function leaderPeople(seed: Seed, s: State, g: Graph) {
  let priv: Set<string> | null = null;
  let byCompany: Map<string, PersonNode[]> | null = null;
  const added: PersonNode[] = [];
  for (const [cid, rec] of Object.entries(s.leaders ?? {})) {
    if (!rec.top && !Object.values(rec.functions).some((l) => l.name)) continue;
    const c = g.companies.get(cid);
    if (!c || !namesAllowedAt(c, s)) continue;
    priv ??= privateMemberKeys(seed, s);
    if (!byCompany) {
      byCompany = new Map();
      for (const p of g.contacts.values()) {
        let list = byCompany.get(p.companyId);
        if (!list) byCompany.set(p.companyId, (list = []));
        list.push(p);
      }
    }
    const here = byCompany.get(cid) ?? [];
    for (const l of namedLeaders(rec)) {
      if (leaderOff(s, cid, l.name) || priv.has(nameKey(l.name))) continue;
      if (here.some((p) => !p.site && sameName(valueOf(p, s, "name")?.value ?? "", l.name))) continue;
      const id = leaderPersonId(cid, l.name);
      if (g.contacts.has(id)) continue;
      const node: PersonNode = {
        id,
        seedFields: { name: l.name, title: l.title, relationship: LEADER_RELATIONSHIP },
        companyId: cid,
        engagementId: null,
        source: LEADERS_SOURCE,
        site: { url: l.url, ...(l.page ? { page: l.page } : {}), at: l.seenAt, how: l.how },
      };
      g.contacts.set(id, node);
      here.push(node);
      byCompany.set(cid, here);
      added.push(node);
    }
  }
  // A likely email: at least LIKELY_MIN emails members added at the company's own domain, all one pattern.
  for (const node of added) {
    if (byField(s, "values", node.id, "email")) continue;
    const domain = siteKey(live(g.companies.get(node.companyId), s, "website"));
    if (!domain || domain.includes("/")) continue;
    const onFile: { name: string; email: string }[] = [];
    for (const p of byCompany!.get(node.companyId) ?? []) {
      const ev = byField(s, "values", p.id, "email");
      const nv = valueOf(p, s, "name");
      if (ev && ev.status === "live" && !isSystem(ev.by) && nv?.status === "live") onFile.push({ name: nv.value, email: ev.value });
    }
    const guess = likelyEmail(node.seedFields.name, domain, onFile);
    if (!guess) continue;
    node.seedFields.email = guess.email;
    node.likely = guess.n;
  }
}

/** Whether a company is due a read of its leadership pages, and its record if any. */
function leadersDue(s: State, node: CompanyNode, nowMs: number): { domain: string; prev: LeadersRecord | null } | null {
  const domain = siteKey(live(node, s, "website"));
  // No website, or one on a shared host (a profile or job board page): no site of the company's own to read.
  if (!domain || domain.includes("/")) return null;
  const prev = s.leaders?.[node.id] ?? null;
  if (!prev) return { domain, prev };
  // Read by an older reader (lib/leaders/types.ts READER_VERSION): due again now, whatever its age.
  if ((prev.v ?? 1) < LEADERS_READER_VERSION) return { domain, prev };
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
  // Crystal Ball first: a company on a member's Crystal Ball (the days kept, LEADERS_CB_WEIGHT), one members said has a
  // full-time leader (the read confirms it), then one in a member's Ideal Fractional Profile (LEADERS_ICP_WEIGHT).
  for (const m of Object.values(s.radar?.members ?? {})) for (const rows of Object.values(m.days ?? {})) for (const x of rows) bump(x.c, LEADERS_CB_WEIGHT);
  for (const id of Object.keys(s.leaderReports ?? {})) bump(id, LEADERS_CB_WEIGHT);
  const icps = Object.values(s.profiles)
    .map((p) => p.icp)
    .filter((x): x is Icp => !!x && !!(x.industries?.length || x.employees?.length || x.revenue?.length || x.countries?.length));
  if (icps.length)
    for (const node of g.companies.values()) {
      const geo = geoOf(node, s);
      const facts = { industry: live(node, s, "industry"), employees: live(node, s, "employees"), revenue: live(node, s, "revenue"), country: geo.country };
      if (icps.some((icp) => icpFits(icp, facts))) bump(node.id, LEADERS_ICP_WEIGHT);
    }
  return w;
}

/** Weights for the order the leadership reader goes in: a company on a member's Crystal Ball, and one in a member's Ideal Fractional Profile. */
const LEADERS_CB_WEIGHT = 6;
const LEADERS_ICP_WEIGHT = 3;
/** The profile's rule (lib/radar/match.ts inIcp) on a company's free facts: nothing on file conflicts, and one asked part matches. */
function icpFits(icp: Icp, co: { industry: string | null; employees: string | null; revenue: string | null; country: string | null }): boolean {
  const key = (v: string) => v.trim().toLowerCase();
  const parts = [
    icp.industries?.length ? (co.industry ? icp.industries.map(key).includes(key(co.industry)) : null) : undefined,
    icp.employees?.length ? (co.employees ? icp.employees.includes(co.employees) : null) : undefined,
    icp.revenue?.length ? (co.revenue ? icp.revenue.includes(co.revenue) : null) : undefined,
    icp.countries?.length ? (co.country ? icp.countries.map(key).includes(key(co.country)) : null) : undefined,
  ].filter((x) => x !== undefined);
  return !parts.includes(false) && parts.includes(true);
}

/**
 * Companies due a read of their leadership pages, the most useful first: a company read by an
 * older reader (READER_VERSION), then companies on a member's Crystal Ball, with members' reports,
 * an open role, member activity or in a member's profile (the heaviest first), then the rest;
 * inside each, never read before ahead of read longest ago.
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
  const oldRead = (t: LeadersTarget) => !!t.prev && (t.prev.v ?? 1) < LEADERS_READER_VERSION;
  out.sort(
    (a, b) =>
      // Read by an older reader first (a better reader re-reads what the old one read, in the first daily batch), then by weight.
      Number(oldRead(b)) - Number(oldRead(a)) ||
      Number(b.w > 0) - Number(a.w > 0) ||
      b.w - a.w ||
      Number(!!a.prev) - Number(!!b.prev) ||
      (a.prev?.checkedAt ?? "").localeCompare(b.prev?.checkedAt ?? "") ||
      a.companyId.localeCompare(b.companyId),
  );
  return out.map(({ w: _w, ...t }) => t);
}

/** The daily leadership read claims its UTC day (State.leadersDaily): true once a day, false when today's has started. */
export function claimLeadersDay(nowIso: string): Promise<boolean> {
  return mutate((s) => {
    const day = nowIso.slice(0, 10);
    if (s.leadersDaily?.day === day) return false;
    s.leadersDaily = { day, at: nowIso };
    return true;
  });
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
 * tries again later. The names and titles read stay only where they may (keepNamesWhereAllowed: a
 * United States company, nobody who asked to be removed, a member's own choice), and each outcome
 * says how many people stayed named (LeadersOutcome.named). `run` is the run so far. Returns how many were stored.
 */
export function saveLeaders(outcomes: LeadersOutcome[], run: LeadersRunSummary | null, nowIso?: string): Promise<number> {
  return mutate((s, seed) => {
    const now = nowIso ?? new Date().toISOString();
    const all = (s.leaders ??= {});
    const g = graph(seed, s);
    const priv = privateMemberKeys(seed, s);
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
        // A leader on file now that wasn't before: only when both reads reached the site and a team page both times (a
        // team page read for the first time lists everyone as new), and not one the page says has been there for over a year.
        if (prev && leadersReadOk(prev) && prev.team && o.team) {
          s.leaderArrivals = (s.leaderArrivals ?? []).filter((x) => nowMs - Date.parse(x.at) < 180 * DAY_MS);
          for (const [fn, l] of Object.entries(o.functions)) {
            if (prev.functions[fn] || !FUNCTIONS.includes(fn) || fn === "Other") continue;
            const since = /^\d{4}(-\d{2})?$/.test(l.since ?? "") ? l.since! : undefined;
            const sinceMs = since ? Date.UTC(Number(since.slice(0, 4)), since.length > 4 ? Number(since.slice(5, 7)) - 1 : 11, 1) : NaN;
            if (Number.isFinite(sinceMs) && nowMs - sinceMs > 365 * DAY_MS) continue;
            s.leaderArrivals.push({ companyId: o.companyId, fn, kind: l.kind, level: l.level, ...(since ? { since } : {}), at: now });
          }
        }
        const teamAt = o.team ? now : prev?.teamAt;
        // Names stay only where they may (a United States company, nobody who asked to be removed, a member's own choice).
        const named: Pick<LeadersRecord, "functions" | "top"> = { functions, top: mergeTop(prev?.top, o.top) };
        o.named = keepNamesWhereAllowed(s, seed, g.companies.get(o.companyId), o.companyId, named, priv);
        all[o.companyId] = {
          status: found ? "found" : "none", checkedAt: now, ok: true, v: LEADERS_READER_VERSION, hash: leadersHash(functions), functions, ...(found ? {} : { why: o.why ?? "no leaders found" }), ...counts, readAt: now, ...(teamAt ? { teamAt } : {}),
          ...(named.top ? { top: named.top } : {}),
        };
        payLeaderBack(s, o.companyId, functions, now);
      } else {
        // The site could not be read this time: what is on file stays, and when it was last read.
        const functions = { ...(prev?.functions ?? {}) };
        const kept = Object.keys(functions).length > 0;
        // A record from before readAt and teamAt were kept: its own read stands for them.
        const wasOk = !!prev && leadersReadOk(prev);
        const readAt = prev?.readAt ?? (wasOk ? prev!.checkedAt : undefined);
        const teamAt = prev?.teamAt ?? (wasOk && prev!.team ? prev!.checkedAt : undefined);
        // The names on file stay only where they still may; this read kept none of its own.
        const named: Pick<LeadersRecord, "functions" | "top"> = { functions, ...(prev?.top ? { top: prev.top } : {}) };
        keepNamesWhereAllowed(s, seed, g.companies.get(o.companyId), o.companyId, named, priv);
        o.named = 0;
        all[o.companyId] = {
          status: kept ? "found" : o.status, checkedAt: now, ok: false, v: LEADERS_READER_VERSION, ...(kept && prev?.hash ? { hash: prev.hash } : {}), functions, ...(o.why ? { why: o.why } : {}), ...counts,
          ...(readAt ? { readAt } : {}), ...(teamAt ? { teamAt } : {}), ...(named.top ? { top: named.top } : {}),
        };
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
function leadsOf(s: State, companyId: string, hidden: boolean, viewer?: string, nowMs = Date.now()): CompanyLeads | undefined {
  const r = s.leaders?.[companyId];
  const said = s.leaderReports?.[companyId] ?? {};
  const fns = FUNCTIONS.flatMap((fn): LeadLine[] => {
    const l = r?.functions[fn];
    if (l) return [{ fn, level: l.level, kind: l.kind, ...(l.since ? { since: l.since } : {}), how: l.how, ...(hidden ? {} : { url: l.url }) }];
    // Members say a full-time leader is in place there (the website names nobody in the function): "Members say: full-time CRO".
    const k = fnKnow(r, said[fn], fn, nowMs);
    if (k.s !== "full-time" || k.how !== "members") return [];
    const mine = !!viewer && reportsOf(said[fn]).some((x) => x.by === viewer);
    return [{ fn, level: k.level, kind: "full-time", how: "members", role: k.role, confirmed: k.confirmed, ...(mine ? { mine: true } : {}) }];
  });
  const teamAt = teamReadAt(r, nowMs);
  if (!fns.length && !teamAt) return undefined;
  return { checkedAt: r?.checkedAt ?? "", fns, ...(teamAt ? { teamAt } : {}) };
}

/** A members' leader report's ledger ref: "<companyId>.ftLeader:Sales" (the credit history reads "Full-time Sales leader"). */
const FT_LEADER_REF = "ftLeader:";
/**
 * Credits back for a members' report, the rule kept simple so it can't be farmed: the member
 * unlocked the company (2 credits) in the LEADER_BACK_DAYS before saying it, the company was on
 * their Crystal Ball in those days, and the company's own website later shows a full-time leader
 * in that function (the reader, not another member, confirms it). Then LEADER_BACK once, ever,
 * per member and company. Never at the time of the report, and never for a report nobody checks.
 */
const LEADER_BACK = 2;
const LEADER_BACK_DAYS = 7;
/**
 * A read that found a full-time leader in a function members had reported: each report that was
 * due credits back (backDue: the member had unlocked the company in the 7 days before saying it)
 * gets LEADER_BACK once ("You were right: credits back"). Once per member and company, ever.
 */
function payLeaderBack(s: State, companyId: string, functions: LeadersRecord["functions"], now: string) {
  const said = s.leaderReports?.[companyId];
  if (!said) return;
  const ref = `${companyId}.leader`;
  for (const [fn, list] of Object.entries(said)) {
    if (functions[fn]?.kind !== "full-time") continue;
    for (const r of list) {
      if (!r.backDue || r.paidBack) continue;
      r.paidBack = now;
      if (s.ledger.some((l) => l.memberId === r.by && l.ref === ref && l.why === "leader")) continue;
      s.ledger.push({ memberId: r.by, delta: LEADER_BACK, reason: "refund", ref, at: now, why: "leader" });
    }
  }
}

/** Pilot metrics: the run under way (or the last one), and what is on file. */
function leadersStats(s: State, g: Graph, nowMs: number): NonNullable<AdminStats["leaders"]> {
  const onFile = { companies: 0, read: 0, pages: 0, team: 0, press: 0, functions: 0, fractional: 0, fullTime: 0, none: 0, failed: 0, robots: 0, skipped: 0, named: 0 };
  const reasons = new Map<string, number>();
  for (const [id, r] of Object.entries(s.leaders ?? {})) {
    if (!g.companies.has(id)) continue;
    onFile.companies++;
    onFile.named += namedLeaders(r).length;
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
  // Coverage: companies with a site of their own to read, read OK in the last KNOWN_DAYS, with a team page read then, and the last read.
  const coverage = { sites: 0, known: 0, withTeam: 0, lastReadAt: null as string | null, reports: 0 };
  for (const node of g.companies.values()) {
    const domain = siteKey(live(node, s, "website"));
    if (!domain || domain.includes("/") || isFirmNode(node, s)) continue;
    coverage.sites++;
    if (leadersDue(s, node, nowMs)) due++;
    const r = s.leaders?.[node.id];
    if (!r) continue;
    const readAt = r.readAt ?? (leadersReadOk(r) ? r.checkedAt : undefined);
    if (readAt && nowMs - Date.parse(readAt) <= LEADERS_KNOWN_DAYS * DAY) coverage.known++;
    if (teamReadAt(r, nowMs)) coverage.withTeam++;
    if (readAt && (!coverage.lastReadAt || readAt > coverage.lastReadAt)) coverage.lastReadAt = readAt;
  }
  for (const [id, byFn] of Object.entries(s.leaderReports ?? {})) if (g.companies.has(id)) for (const list of Object.values(byFn)) coverage.reports += reportsOf(list).length;
  return {
    enabled: leadersEnabled(),
    running: leadersProgress.running,
    run: leadersProgress.run ?? s.leadersRun ?? null,
    onFile,
    due,
    coverage: { ...coverage, dailyBatch: LEADERS_DAILY_BATCH, daysToCover: Math.ceil(due / LEADERS_DAILY_BATCH), lastDaily: s.leadersDaily?.day ?? null },
    reasons: [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([why, n]) => ({ why, n })),
  };
}
