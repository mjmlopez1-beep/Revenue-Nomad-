/**
 * Trading Post: a give-to-get intel table for fractional GTM work.
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
 * Hidden companies: a company with an open role the scan follows (or one from our records)
 * keeps its name, website, LinkedIn, logo and About behind "Unlock company" (1 credit); see
 * identityHidden() and hidesCompany(). The same credit opens the role, the posting and the posted
 * rate of each open role there, whichever of them was asked for (hours a week are free). Where
 * the company is not hidden, the role, the posting and the rate of an open role are still one
 * purchase (BUNDLE_FIELDS).
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
import { promises as fs } from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { iconDomains } from "./companyIcons";
import { readRate } from "./rates";
import { BACKUP_FILE, holdUploads, snapshot } from "./backup";
import { emailEnabled, sendEmail } from "./email";
import { renderDigest } from "./digest";
import { MAX_ROLES, collectOpenRoles } from "./scan/collect";
import { companyKey, textKey } from "./scan/clean";
import {
  ALL_FIELDS, EARN_CAP, ENGAGEMENT_TYPES, FILLABLE, FRACTIONAL_TYPES, FUNCTIONS, REFERRAL_BONUS, REFERRAL_LIMIT, cleanValue, fieldDef, functionOf,
  stripInvisible, tidy, HIDDEN_COMPANY, LEGACY_VALUES, RN_REVENUE, siteKey, type Entity,
} from "./tableFields";
import type {
  Action, ActionResult, AdminStats, BenchRate, BenchmarkRow, Benchmarks, Cell, RateStat, CompanyRec, EngagementRec, Friendly, LedgerRow, Me, PersonRec,
  ScanSummary, View,
} from "./tableTypes";
import type { DigestData, ScanApplyResult, ScanCollectResult, ScanSourceResult } from "./scanTypes";

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
interface SeedCompany {
  id: string;
  fields: Record<string, string>;
}
interface SeedEngagement {
  id: string;
  companyId: string;
  fields: Record<string, string>;
  verified?: boolean;
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
}

interface Added {
  id: string;
  by: string;
  at: string;
}
export interface FieldValue {
  value: string;
  by: string; // member id, "seed", or "scan" (the weekly scan; treated like seed)
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
}
export interface LedgerEntry {
  memberId: string;
  delta: number;
  /** adjust: a one-time balance correction (ref "starter.floor"). */
  reason: "fill" | "unlock" | "refund" | "reversal" | "referral" | "confirm" | "adjust";
  ref: string;
  at: string;
  /**
   * closed (refunds): the scan found the role had closed, and this unlock was made after its
   * posting was last seen. retract (reversals): the member took back a fact they had added.
   */
  why?: "closed" | "retract";
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
  /** Asked to hear about Pro. */
  proInterest?: boolean;
}
/** One open role the weekly scan follows: when it was first and last listed, and when it closed. */
interface RoleTrack {
  engagementId: string;
  companyId: string;
  firstSeen: string;
  lastSeen: string;
  closedAt: string | null;
  /** scan: the posting came down. filled: a member named the seat holder (a later scan won't reopen it). */
  closedBy?: "scan" | "filled";
  url: string;
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
export interface State {
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
  /** Each member's last visit (written at most once per 6 hours). */
  seen: Record<string, string>;
  scan: ScanState;
  /** Weekly email: last run, emails sent in all, and each member's last one. */
  digest: { lastSentAt: string | null; sent: number; members: Record<string, string> };
  /** One-time changes already applied. starterFloor: the starter balance the floor was last applied at. */
  flags: { starterFloor?: number };
}

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
 * Trading Post cannot serve right now: the state file is damaged and no backup could be read
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
  for (const r of [...out.companies, ...out.engagements]) {
    for (const [k, map] of Object.entries(LEGACY_VALUES)) if (r.fields[k] && map[r.fields[k]]) r.fields[k] = map[r.fields[k]];
  }
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

/** Enough of a shape check to tell a state file from one that is cut short, emptied or not ours. */
function isState(x: unknown): x is Partial<State> {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  // Every state Trading Post has written holds a ledger and the values. A file without them ("{}",
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
    return isState(x) ? { kind: "ok", state: x } : { kind: "damaged", why: "does not hold a Trading Post state" };
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
    `${what}, and no backup could be read. Nothing was changed. Trading Post answers 503 and writes nothing until a good intel.json is put back ` +
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
    for (const [k, v] of Object.entries(s.values)) {
      const map = LEGACY_VALUES[k.slice(k.lastIndexOf(".") + 1)];
      if (map?.[v.value]) v.value = map[v.value];
    }
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
}
type CompanyNode = Node & { name: string };
type EngNode = Node & { companyId: string; verified: boolean; source: string };
type PersonNode = Node & { companyId: string; engagementId: string | null; source: string };
interface Graph {
  companies: Map<string, CompanyNode>;
  engagements: Map<string, EngNode>;
  contacts: Map<string, PersonNode>;
}

function graph(seed: Seed, s: State): Graph {
  const g: Graph = { companies: new Map(), engagements: new Map(), contacts: new Map() };
  for (const c of seed.companies) g.companies.set(c.id, { id: c.id, seedFields: c.fields, name: c.fields.name ?? "" });
  for (const c of s.companies) if (!g.companies.has(c.id)) g.companies.set(c.id, { id: c.id, seedFields: { name: c.name }, name: c.name });
  for (const e of seed.engagements)
    g.engagements.set(e.id, { id: e.id, seedFields: e.fields, companyId: e.companyId, verified: !!e.verified, source: e.fields.source ?? "Member added" });
  for (const e of s.engagements)
    if (!g.engagements.has(e.id))
      g.engagements.set(e.id, { id: e.id, seedFields: e.source ? { source: e.source } : {}, companyId: e.companyId, verified: false, source: e.source ?? "Member added" });
  const companyOfEng = (eid: string | null | undefined) => (eid ? g.engagements.get(eid)?.companyId : undefined);
  for (const p of seed.contacts ?? []) {
    const companyId = p.companyId ?? companyOfEng(p.engagementId);
    if (companyId) g.contacts.set(p.id, { id: p.id, seedFields: p.fields, companyId, engagementId: p.engagementId ?? null, source: p.source ?? "Demand scan" });
  }
  for (const p of s.contacts) {
    const companyId = p.companyId ?? companyOfEng(p.engagementId);
    if (companyId && !g.contacts.has(p.id)) g.contacts.set(p.id, { id: p.id, seedFields: {}, companyId, engagementId: p.engagementId ?? null, source: "Member added" });
  }
  return g;
}

/* ---------- helpers ---------- */

export const memberByToken = (seed: Seed, token: string | null | undefined, s?: State): Member | null =>
  (token && (seed.members.find((m) => m.token === token) ?? s?.members.find((m) => m.token === token))) || null;

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
  return seed.members.find((m) => m.email && inboxKey(m.email) === inbox) ?? s.members.find((m) => inboxKey(m.email) === inbox) ?? null;
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

/* ---------- limits beside the daily earning cap ---------- */

/**
 * A company's pick lists: industry, employees, revenue and the four "How they sell" lists. One
 * click each and easy to guess, so they share their own limits. On a company the member added,
 * or where they hold a seat, they are not limited (see pickExempt).
 */
const SELL_FIELDS = new Set(["businessModel", "motion", "dealSize", "salesCycle", "industry", "employees", "revenue"]);
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
  for (const l of s.ledger) if (l.memberId === memberId && l.reason === "unlock" && nowMs - Date.parse(l.at) < DAY) used++;
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
  return sv ? { value: sv, by: "seed", at: "", status: "live" } : null;
}
/** Values from our own records (the seed) or the weekly scan: nobody earned a credit for them. */
const isSystem = (by: string) => by === "seed" || by === "scan";
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
): Member | null {
  const m = seatHolder(s, idx, engId, v);
  if (!m || !v) return null;
  if (isSystem(v.by) || v.by !== m.id || createdBy === m.id) return m;
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
function missingOnSeat(e: Node, s: State): number {
  let n = 0;
  for (const k of ENG_FILLABLE) {
    if (valueOf(e, s, k)) continue;
    // Function shows as filled when the role gives it away.
    if (k === "function" && functionOf(live(e, s, "role"))) continue;
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
 * seat, or the posting of a role the weekly scan closed (see postingFree).
 */
function cellOf(s: State, me: Member | null, node: Node | undefined, entity: Entity, key: string, idx?: MemberIndex, free = false): Cell {
  const f = fieldDef(entity, key)!;
  const v = valueOf(node, s, f.key);
  if (!v) return { s: "empty" };
  if (f.system) return { s: "value", v: v.value, ver: 0, system: true };
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
  const from = v.by === "seed" ? ({ from: "records" } as const) : fromScan ? ({ from: "posting" } as const) : {};
  if (!f.gated || mine || free || (me && (s.unlocks[k] ?? []).includes(me.id))) {
    const out: Cell = { s: "value", v: v.value, mine, ver, iv: !!me && vers.includes(me.id), ...from };
    if (key === "operator" && idx) {
      // "Member" only for someone on Trading Post now: a seed member we invited who never signed in is just a name.
      const m = seatHolder(s, idx, node!.id, v);
      if (m && (m.id === me?.id || signedIn(s, idx, m.id))) out.member = { title: m.title ?? "", you: !!me && m.id === me.id };
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
      if (emailEnabled()) return { ...(seedMember ?? joined)!, existing: true }; // route emails them their link
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
      id: newId("j", name), name, email, title: "Member", token: randomBytes(12).toString("base64url"), at: new Date().toISOString(), ipHash,
      ...(referrer && !sameNetwork ? { referredBy: referrer.id } : {}),
      // With email on, the sign-in link goes only to this address: whoever uses it owns the address (see trustOf).
      ...(emailEnabled() ? { proven: true } : {}),
    };
    s.members.push(m);
    keepIp(s, m.id, ipHash);
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

/** For the add form: is a company with this website (or name) already on Trading Post? */
export async function existingCompany(domain: string | null, name: string | null) {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const g = graph(seed, s);
  const d = siteKey(domain);
  const key = name ? keyOfCompany(name) : "";
  const c =
    (d && [...g.companies.values()].find((c) => siteKey(live(c, s, "website")) === d)) ||
    (key && [...g.companies.values()].find((c) => keyOfCompany(c.name) === key)) ||
    null;
  if (!c) return null;
  return { id: pubId(c.id), name: c.name, website: live(c, s, "website"), industry: live(c, s, "industry") };
}

/** Sources whose seats are fractional work whatever their type. A "Member added" seat is too, while it has no type (see friendliness). */
const SOURCE_FRACTIONAL = new Set(["Published engagement", "Demand scan"]);

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
 * An open role that hides its company: one the scan follows, or one from our records. A member
 * who marks a seat Open role shows it as an open role, and hides nothing until a scan lists it.
 */
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

/** Company facts that would give a hidden company away. HQ is cut to its region instead. */
const IDENTITY_FIELDS = new Set(["website", "linkedin", "about"]);
/** The last part of an HQ ("Austin, TX" -> "TX"), so a hidden company keeps a region. */
const hqRegion = (hq: string) => hq.split(",").map((x) => x.trim()).filter(Boolean).pop() ?? "";
/** One company cell as a member sees it while the company is hidden: identity facts locked, HQ cut to its region. */
const hideIdentity = (key: string, c: Cell): Cell =>
  c.s !== "value" ? c : IDENTITY_FIELDS.has(key) ? { s: "locked", ver: 0 } : key === "hq" ? { ...c, v: hqRegion(c.v) } : c;
/**
 * One purchase on an open role: its role, its job posting and its posted rate. "Unlock company"
 * opens all three on each open role at a hidden company for the same credit. (Hours a week are
 * free, so they need no unlock.)
 */
const BUNDLE_FIELDS = ["role", "posting", "rate"];
/** The posting of a role the scan closed (the listing came down) is free to see: the link no longer leads to a job. */
const postingFree = (t: RoleTrack | undefined) => !!t?.closedAt && t.closedBy !== "filled";

/**
 * Whether a company's identity is hidden from this member. A company with an active open role
 * is gated: its name, website, LinkedIn, logo and About cost 1 credit ("Unlock company"),
 * because the name alone is enough to find the role. It stays visible to admins, to members
 * who unlocked it or added anything there, and to the member who held a seat there.
 */
function identityHidden(g: Graph, s: State, idx: MemberIndex, tracks: Tracks, me: Member | null, companyId: string): boolean {
  if (!me || isAdmin(me)) return false;
  const engs = [...g.engagements.values()].filter((e) => e.companyId === companyId);
  if (!engs.some((e) => hidesCompany(e, s, tracks))) return false;
  // Paid for an open role's title, posting or rate there already (say while the role was closed): the company came with it.
  if (engs.some((e) => isOpenRole(e, s, tracks) && holdsOpenRole(s, me, e))) return false;
  if ((s.unlocks[fkey(companyId, "identity")] ?? []).includes(me.id)) return false;
  if (s.companies.some((c) => c.id === companyId && c.by === me.id)) return false;
  const ids = new Set<string>([companyId, ...engs.map((e) => e.id)]);
  for (const p of g.contacts.values()) if (p.companyId === companyId) ids.add(p.id);
  for (const [k, v] of Object.entries(s.values)) if (v.by === me.id && ids.has(k.slice(0, k.lastIndexOf(".")))) return false;
  for (const e of engs) if (seatHolder(s, idx, e.id, valueOf(e, s, "operator"))?.id === me.id) return false;
  return true;
}

/**
 * How fractional-friendly a company is, from its seats. Only a hire counts as one: an open role is
 * a posting, so its function goes in `hiring` and not in `functions`, and a posting that came down
 * with nobody named as its seat holder counts in neither (it still shows they went looking, which
 * scores like an open role). A seat a member added counts as fractional unless its type says
 * otherwise.
 */
function friendliness(g: Graph, s: State, tracks: Tracks, companyId: string, engs: EngNode[], operators: Set<string>): Friendly {
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
    const bySource = SOURCE_FRACTIONAL.has(e.source) || (e.source === "Member added" && !type);
    if (bySource || (!!type && FRACTIONAL_TYPES.includes(type))) {
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
  return { score, tier, fractional, open, functions: [...functions], hiring: [...hiring], operators: operators.size, recent };
}

/**
 * Signed-out views only need the counts: kept until the state or the seed changes (both are
 * replaced, never changed in place, so comparing the objects is enough). Signed-out visitors
 * who arrive while the counts are being rebuilt wait for that one build.
 */
let statsCache: { s: State; seed: Seed; stats: View["stats"]; at: number } | null = null;
/** "Opened this week" moves with the clock, so the cached counts are rebuilt at least hourly. */
const STATS_FRESH = 60 * 60 * 1000;
let anonBuild: { s: State; seed: Seed; p: Promise<View> } | null = null;

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
 */
export async function buildView(token: string | null, opts: { asMember?: boolean } = {}): Promise<View> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (me) return fullView(seed, s, me, !!opts.asMember && isAdmin(me));
  if (statsCache && statsCache.s === s && statsCache.seed === seed && Date.now() - statsCache.at < STATS_FRESH)
    return { demo: !!seed.demo, me: null, companies: [], stats: statsCache.stats, ledger: [], reported: [], email: emailEnabled(), contact: contactInfo() };
  if (!anonBuild || anonBuild.s !== s || anonBuild.seed !== seed) {
    const p = fullView(seed, s, null);
    anonBuild = { s, seed, p };
    p.finally(() => anonBuild?.p === p && (anonBuild = null)).catch(() => {});
  }
  return anonBuild.p;
}

async function fullView(seed: Seed, s: State, me: Member | null, asMember = false): Promise<View> {
  const g = graph(seed, s);
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
    [...g.companies.values()].map((c) => ({ id: c.id, name: c.name, website: live(c, s, "website") })),
  );

  const companies: CompanyRec[] = [];
  const hiddenIds = new Set<string>();
  /** Companies the viewer created (the same test as exemptPick in perform). */
  const addedByMe = new Set(me ? s.companies.filter((x) => x.by === me.id).map((x) => x.id) : []);
  let peopleCount = 0;
  for (const c of g.companies.values()) {
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
    const engs = engsByCompany.get(c.id) ?? [];
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
      const yours = !!me && seatOwner(s, idx, trusted, tracks, e.id, op, madeBy.get(e.id))?.id === me.id;
      const track = tracks.get(e.id);
      if (yours) ownSeatAt.add(c.id);
      if (yours || (!!me && seatHolder(s, idx, e.id, op)?.id === me.id)) holdsSeat = true;
      for (const f of ENG_F) cells[f.key] = cell(e, "engagement", f.key, yours);
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
    // Same rule as identityHidden(), from what this loop already knows (that one scans every value).
    const hidden =
      !!me &&
      !admin &&
      engs.some((e) => hidesCompany(e, s, tracks)) &&
      !engs.some((e) => isOpenRole(e, s, tracks) && holdsOpenRole(s, me, e)) &&
      !mine &&
      !(s.unlocks[fkey(c.id, "identity")] ?? []).includes(me.id) &&
      !addedByMe.has(c.id) &&
      !holdsSeat;
    if (hidden) {
      hiddenIds.add(c.id);
      for (const k of [...IDENTITY_FIELDS, "hq"]) if (cells[k]) cells[k] = hideIdentity(k, cells[k]);
    } else {
      for (const x of closedPostings) {
        x.cells.posting = cell(x.e, "engagement", "posting", true);
        facts.locked--;
        facts.known++;
      }
    }
    companies.push({
      id: pubId(c.id),
      name: hidden ? HIDDEN_COMPANY : c.name,
      hidden,
      iconDomain: hidden ? null : icons[c.id] ?? null,
      cells,
      friendly: friendliness(g, s, tracks, c.id, engs, operators),
      engagements: engRecs,
      people: coPeople,
      following: following.has(c.id),
      facts,
      updatedAt,
      mine,
      // Paid to see it while it was hidden (Unlock company, or its open role's title or posting: one purchase, recorded on the company).
      ...(me && (s.unlocks[fkey(c.id, "identity")] ?? []).includes(me.id) ? { unlocked: true } : {}),
      ...(addedByMe.has(c.id) ? { added: true } : {}),
    });
  }
  companies.sort((a, b) => b.friendly.score - a.friendly.score || a.name.localeCompare(b.name));

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
    return hiddenIds.has(cid) ? HIDDEN_COMPANY : g.companies.get(cid)?.name ?? "";
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
        addedBy: v.by === "seed" ? "Revenue Nomad records" : v.by === "scan" ? "Weekly scan" : memberName(v.by),
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
    for (const l of s.ledger) {
      if (l.memberId !== me.id) continue;
      if (l.reason === "fill" && !l.undone) added++;
      if (l.reason === "unlock") unlocked++;
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
      // The one-time lift to 0 when starter credits went down.
      if (l.reason === "adjust") {
        ledger.push({ at: l.at, delta: l.delta, reason: "Topped up to 0 when starter credits changed", company: "", field: "" });
        continue;
      }
      // A credit back for an unlock on a role that had already closed (applyScan).
      if (l.reason === "refund" && l.why === "closed") {
        ledger.push({ at: l.at, delta: l.delta, reason: CLOSED_REFUND, company: companyNameOf(id), field: "" });
        continue;
      }
      // A fact the member took back (retract): "Took back the HQ", then "at Acme".
      if (l.reason === "reversal" && l.why === "retract") {
        ledger.push({ at: l.at, delta: l.delta, reason: `Took back ${say(entityOf(id), field)}`, company: companyNameOf(id), field: "" });
        continue;
      }
      ledger.push({ at: l.at, delta: l.delta, reason: l.reason, company: companyNameOf(id), field: ledgerLabel(entityOf(id), field) });
    }
    ledger.reverse();
    const prof = s.profiles[me.id] ?? {};
    const { earned, resetsAt } = earning(s, me.id, nowMs);
    const joinedMe = joinedById.get(me.id);
    meRec = {
      id: me.id,
      name: me.name,
      email: me.email,
      title: prof.title || me.title,
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
      added,
      unlocked,
      digest: !prof.digestOff,
      proInterest: !!prof.proInterest,
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
  statsCache = { s, seed, stats, at: nowMs };
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
    ...(me && scan ? { benchmarks: benchmarks(seed, g, s, me.id), scan } : {}),
    ...(me && scan && admin ? { admin: adminStats(seed, s, g, idx, nowMs, scan, entityOf) } : {}),
  };
}

/** How a ledger row or a stats line names a field. */
const BENCH_LABEL = "Private rate";
/** The ledger line for an unlock paid back because the role had closed. The company follows it ("… at Acme"). */
const CLOSED_REFUND = "Refund for a role that had closed";
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
    walls: { members: walled.size, hits },
    pro: { interested: Object.values(s.profiles).filter((p) => p.proInterest).length, views, byWhere },
    topUnlocked: top("unlock"),
    topAdded: top("fill"),
    scan: { lastRunAt: scan.lastRunAt, openNow: scan.openNow, opened7: scan.opened7, closed30: scan.closed30, sources: s.scan.sources },
    boards: scanBoards(s.scan),
    digest: { enabled: digestOn(), lastSentAt: s.digest.lastSentAt, sent: s.digest.sent, optedOut: Object.values(s.profiles).filter((p) => p.digestOff).length },
    seats: { linkedMembers: linked.size, factsMissing },
    benchmarks: { memberRates, privateRates: s.benchRates.length, indexRates: seed.rateIndex?.length ?? 0 },
  };
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

/** Signals one member can send in 24 hours. More are dropped without a word. */
const SIGNAL_DAILY_MAX = 200;
const SIGNAL_KEEP = 20_000;
const SIGNAL_NAMES = new Set(["wall", "pro_view", "pro_interest"]);
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

export async function perform(token: string | null, a: Action, origin?: string): Promise<ActionResult> {
  if (a?.type === "scanNow") {
    if (!isAdmin(await memberForToken(token))) throw new ActionError("Only admins can start a scan.");
    // In the background: a scan reads several job boards and can take a while.
    void runScan(origin).catch((e) => console.error("scan failed", e));
    return { message: "Scan started. It reads several job boards, so give it a few minutes." };
  }
  const out = await mutate((s, seed): ActionResult & { refused?: string } => {
    const me = memberByToken(seed, token, s);
    if (!me) throw new ActionError("You're signed out. Sign in again to add, confirm or unlock.");
    const now = new Date().toISOString();
    const nowMs = Date.parse(now);
    // Bonuses held at the cap are paid first, as the rolling window frees room.
    releaseHeld(s, me.id, now);
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
    const hiddenFor = (companyId: string) => identityHidden(g, s, idx0, tracks(), me, companyId);
    /** Accounts that count (trustOf), worked out once per action. */
    let trustNow: ((memberId: string) => boolean) | null = null;
    const trusted = (memberId: string) => (trustNow ??= trustOf(seed, s))(memberId);
    /** The seat-holder name on this seat resolves to the viewer (and they haven't said it isn't theirs). */
    const linkedSeat = (engId: string) => seatHolder(s, memberIndex(seed, s), engId, valueOf(g.engagements.get(engId), s, "operator"))?.id === me.id;
    /**
     * The viewer holds this seat as its owner, read from the state as it is now (so a seat made or
     * claimed earlier in this action counts): the only member who adds facts about it.
     */
    const holdsSeat = (node: Node) =>
      seatOwner(s, memberIndex(seed, s), trusted, tracks(), node.id, valueOf(node, s, "operator"), s.engagements.find((x) => x.id === node.id)?.by)?.id === me.id;
    /** The viewer holds this seat as its owner: they see it free, correct it and hide a fact on it at once (see seatOwner). */
    const ownSeat = (engId: string) =>
      seatOwner(s, memberIndex(seed, s), trusted, tracks(), engId, valueOf(g.engagements.get(engId), s, "operator"), s.engagements.find((x) => x.id === engId)?.by)?.id === me.id;
    /** Companies whose pick lists this member fills without the daily limits: one they added, or one where they hold a seat. */
    const pickFree = new Map<string, boolean>();
    const exemptPick = (companyId: string) => {
      if (!pickFree.has(companyId))
        pickFree.set(companyId, s.companies.some((c) => c.id === companyId && c.by === me.id) || [...g.engagements.values()].some((e) => e.companyId === companyId && ownSeat(e.id)));
      return pickFree.get(companyId)!;
    };
    /** Gated facts this member sees without an unlock: their own seat, and the posting of a role the scan closed (unless its company is hidden). */
    const freeFor = (entity: Entity, id: string, field: string) =>
      entity === "engagement" && ((field === "posting" && postingFree(tracks().get(id)) && !hiddenFor(companyOf("engagement", id))) || ownSeat(id));
    /** Adding facts by clicking into a hidden company would reveal it for free. Typing its name in Add still works. */
    const mustSee = (companyId: string) => {
      if (hiddenFor(companyId)) throw new ActionError("This company is hidden. Unlock it for 1 credit, then add what you know.");
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
      const hide = entity === "company" && cell.s === "value" && (IDENTITY_FIELDS.has(field) || field === "hq") && hiddenFor(node.id);
      return { entity, id: outId(entity, node.id), field, cell: hide ? hideIdentity(field, cell) : cell };
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
        if ((paidUnlocks.get(pk) ?? 0) <= 0) continue;
        s.ledger.push({ memberId: m, delta: 1, reason: "refund", ref: k, at: now });
        paidUnlocks.set(pk, paidUnlocks.get(pk)! - 1);
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
      if (!m) throw new ActionError("That member isn't on Trading Post. Type the seat holder's first and last name instead.");
      return m;
    };
    let capped = false;
    /** A claim on an open role was saved, and the role stays open (the account does not count yet, see trustOf). */
    let claimKept = false;
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
      const joined = s.members.find((m) => m.id === me.id);
      if (!joined?.referredBy || s.referralPaid.includes(me.id)) return 0;
      s.referralPaid.push(me.id);
      const inviter = joined.referredBy;
      // Count invitees, not rows: a bonus split by the daily cap leaves a ledger row and a held
      // row, and later releases add more. The inviter's own row for having been invited is not an invite.
      const ownReferrer = s.members.find((m) => m.id === inviter)?.referredBy;
      const firstPaid = new Map<string, number>();
      const note = (ref: string, at: string) => {
        const invitee = refRecord(ref);
        if (!ref.endsWith(".referral") || invitee === ownReferrer) return;
        firstPaid.set(invitee, Math.min(firstPaid.get(invitee) ?? Infinity, Date.parse(at)));
      };
      for (const l of s.ledger) if (l.memberId === inviter && l.reason === "referral" && l.delta > 0) note(l.ref, l.at);
      for (const h of s.held) if (h.memberId === inviter && h.reason === "referral") note(h.ref, h.at);
      const recent = [...firstPaid.values()].filter((t) => nowMs - t < 30 * DAY).length;
      if (recent < REFERRAL_LIMIT) grant(s, inviter, REFERRAL_BONUS, "referral", `${me.id}.referral`, now);
      return grant(s, me.id, REFERRAL_BONUS, "referral", `${inviter}.referral`, now);
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
        if (key === "reason" || key === "sourced") throw new ActionError(OPEN_NO_HIRE);
      }
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
    const setValue = (node: Node, entity: Entity, key: string, raw: unknown, member: Member | null = null, pending: Record<string, string> = {}): number => {
      const f = fieldOf(entity, key);
      const linked = key === "operator" ? member : null;
      // Only the seat holder adds facts about a seat, and the only seat holder a member can name is
      // themselves (a seat they held, or an open role they took). Admins too: they review and remove.
      if (entity === "engagement") {
        if (key === "operator" ? linked?.id !== me.id : !holdsSeat(node)) throw new ActionError(key === "operator" ? SEAT_SELF_ONLY : SEAT_HOLDER_ONLY);
      }
      // Picking yourself writes your own name. One on file under a single word takes the first and last name typed instead.
      let { value, error } = cleanValue(f, linked ? linked.name : raw);
      if (error && linked && linked.id === me.id && typeof raw === "string" && raw.trim()) ({ value, error } = cleanValue(f, raw));
      if (error) throw new ActionError(`${f.label}. ${error}`);
      const cur = valueOf(node, s, key);
      // A seat holder can correct what our records or the scan say about their own seat.
      // What another member added still needs a report.
      const correction = !!cur && isSystem(cur.by) && entity === "engagement" && ownSeat(node.id);
      // An open role the scan follows keeps the posting's status while it is listed: its holder
      // can't close it for everyone by editing it (taking the role, or the posting coming down, does).
      if (correction && key === "status" && tracks().get(node.id) && !tracks().get(node.id)!.closedAt) throw new ActionError(LISTED_STATUS);
      if (cur && cur.by !== me.id && !correction)
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
      if (claimsRole && !fillsRole) claimKept = true;
      s.values[k] = { value: value!, by: me.id, at: now, status: "live", ...(linked ? { memberId: linked.id } : {}) };
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
    const bonusNote = (n: number) => (n ? ` Your invite bonus added ${n} more.` : "");
    /** Said when a claim on an open role was saved and the role stays open (claimKept). */
    const claimNote = () =>
      claimKept ? " Others still see the role as open until its posting comes down. Once two members confirm a fact you added, a claim like this closes the role at once." : "";

    const run = (): ActionResult => {
      switch (a?.type) {
        case "fill": {
          const node = nodeOf(a.entity, a.id);
          mustSee(companyOf(a.entity, node.id));
          const f = fieldOf(a.entity, a.field);
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
            message: `${wasMine ? "Updated" : "Added"} ${say(a.entity, f.key)}.${credits(earned)}${bonusNote(bonus)}${capNote()}${claimNote()}`,
            id: outId(a.entity, node.id),
            capped,
            cells,
          };
        }
        case "unlock":
        case "unlockMany": {
          const items = a.type === "unlock" ? [a] : (a.items ?? []).slice(0, 60);
          const todo: { k: string; node: Node; entity: Entity; field: string; pair?: boolean }[] = [];
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
          const free: { node: Node; field: string }[] = [];
          for (const it of items) {
            const node = nodeOf(it.entity, it.id);
            if (it.entity === "company" && (it.field === "identity" || IDENTITY_FIELDS.has(it.field))) {
              if (hiddenNow(node.id)) bundle(node);
              continue;
            }
            const f = fieldOf(it.entity, it.field);
            const k = fkey(node.id, f.key);
            const cur = valueOf(node, s, f.key);
            if (!cur || cur.status !== "live") continue;
            if (!f.gated || cur.by === me.id || (s.unlocks[k] ?? []).includes(me.id) || todo.some((t) => t.k === k)) continue;
            if (freeFor(it.entity, node.id, f.key)) continue; // your own seat, or the posting of a closed role: already visible
            const eng = it.entity === "engagement" && BUNDLE_FIELDS.includes(f.key) ? g.engagements.get(node.id) : undefined;
            if (eng && isOpenRole(eng, s, tracks())) {
              if (hiddenNow(eng.companyId)) {
                bundle(g.companies.get(eng.companyId)!);
                continue;
              }
              if (pairs.has(eng.id)) continue;
              pairs.add(eng.id);
              if (BUNDLE_FIELDS.some((x) => x !== f.key && has(eng, x))) free.push({ node, field: f.key });
              else todo.push({ k, node, entity: it.entity, field: f.key, pair: true });
              continue;
            }
            todo.push({ k, node, entity: it.entity, field: f.key });
          }
          if (!todo.length && !free.length) {
            if (a.type === "unlock") throw new ActionError("Nothing here is locked, so no credit was spent.");
            return { message: "You can already see all of these, so no credits were spent." };
          }
          // What this unlock costs: 1 credit per fact, with each company and each open role one purchase.
          const need = todo.length;
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
                    ? `New accounts can unlock ${NEW_MEMBER_UNLOCK_MAX} facts on day one. Your ${bal} credit${bal === 1 ? " is" : "s are"} here tomorrow.`
                    : `You've reached today's unlock limit. ${limit}`,
              );
            }
          }
          for (const t of todo) {
            s.ledger.push({ memberId: me.id, delta: -1, reason: "unlock", ref: t.k, at: now });
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
          for (const t of paired) for (const other of BUNDLE_FIELDS) if (other !== t.field && give(t.node, other)) came.push({ node: t.node, field: other });
          for (const x of free) for (const field of BUNDLE_FIELDS) if (!has(x.node, field) && give(x.node, field)) came.push({ node: x.node, field });
          const others = todo.length - companies.length - paired.length;
          // "for 1 credit", or nothing when the member had already paid for part of an open role.
          const price = need ? ` for ${need} credit${need > 1 ? "s" : ""}` : "";
          const noCharge = need ? "" : " You had already paid for this open role, so no credit was spent.";
          const companyName = (t: { node: Node }) => g.companies.get(t.node.id)?.name ?? "the company";
          let message = todo.length === 1 ? `Unlocked ${say(todo[0].entity, todo[0].field)}${price}.` : `Unlocked ${need} facts${price}.`;
          if (paired.length || free.length || (companies.length && came.length)) {
            // Name what the credit bought: "Acme, the role, the posting and the posted rate".
            const opened = new Set([...paired, ...came].filter((x) => BUNDLE_FIELDS.includes(x.field)).map((x) => `${x.node.id}.${x.field}`));
            const n = (field: string, one: string, many: string) => {
              const c = [...opened].filter((k) => k.endsWith(`.${field}`)).length;
              return c === 1 ? [`the ${one}`] : c ? [`${c} ${many}`] : [];
            };
            const parts = [...(companies.length ? [companies.length === 1 ? companyName(companies[0]) : `${companies.length} companies`] : []), ...n("role", "role", "roles"), ...n("posting", "posting", "postings"), ...n("rate", "posted rate", "posted rates")];
            const bought = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? `${need} facts`;
            message = `Unlocked ${bought}${others ? `, plus ${others} more fact${others > 1 ? "s" : ""},` : ""}${price}.${noCharge}`;
          } else if (todo.length === 1 && companies.length) message = `Unlocked ${companyName(todo[0])}${price}.`;
          return {
            message,
            cells: [
              ...todo.filter((t) => t.field !== "identity").map((t) => changed(t.entity, t.node, t.field)),
              ...came.map((x) => changed("engagement", x.node, x.field)),
              ...companies.flatMap((t) => [...IDENTITY_FIELDS, "hq"].map((field) => changed("company", t.node, field))),
            ],
          };
        }
        case "add": {
          const name = tidy(a.company, 80);
          if (name.length < 2) throw new ActionError("What's the company called?");
          if (!keyOfCompany(name)) throw new ActionError("That doesn't read as a company name. Type the name the company goes by.");
          if (name.toLowerCase() === HIDDEN_COMPANY.toLowerCase()) throw new ActionError("That's our placeholder for a company you haven't unlocked. Type the real name.");
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
            const existing = wantEng
              ? atCompany.find((e) => e.id === wantEng)
              : (a.newEngagement ? atCompany.find((e) => isBlank(e) && mayMerge(e)) : atCompany.find((e) => madeByMe(e) && mayMerge(e))) ??
                (roleKey ? atCompany.find((e) => !isOpenRole(e, s, tracks()) && textKey(live(e, s, "role") ?? "") === roleKey && mayMerge(e)) : undefined);
            // A new seat (or a blank one) has to say what the work was: a name alone is not a seat.
            if ((!existing || isBlank(existing)) && !engFields.some(([k]) => k === "function" || k === "role")) throw new ActionError(SEAT_NEEDS_WHAT);
            let eng: Node;
            if (existing) {
              eid = existing.id;
              eng = existing;
              // What this Add saves, checked together (an end before the start, a start on an open role): see seatCheck.
              const pending = Object.fromEntries(engFields.filter(([k]) => !valueOf(existing, s, k)));
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
          for (const p of people) {
            const pid = newId("p");
            s.contacts.push({ id: pid, engagementId: eid, companyId: company.id, by: me.id, at: now });
            const node: Node = { id: pid, seedFields: {} };
            for (const [k, v] of p) earned += setValue(node, "contact", k, v);
          }
          const bonus = earned || capped || movedRate ? payReferral() : 0;
          const savedSome = !!(earned || capped || movedRate || people.length);
          // Nothing new went in: say so plainly (the old wording said a seat was added).
          const nothing = !isNew && !engNew && !savedSome;
          const where = isNew
            ? `Added ${companyName}`
            : engNew
              ? `Added a seat at ${companyName}`
              : savedSome
                ? `${companyName} was already on Trading Post, so we added what you know to it`
                : seatOnFile
                  ? `That seat at ${companyName} is already on file. ${NOTHING_NEW.slice(0, -1)}`
                  : `${companyName} is already on Trading Post. ${NOTHING_NEW.slice(0, -1)}`;
          const skipped =
            kept && !(nothing && seatOnFile) ? (kept > 1 ? ` ${kept} facts were already there, so we left them as they were.` : " 1 fact was already there, so we left it as it was.") : "";
          const leftOut = picksLeftOut
            ? ` You've added ${SELL_SAVE_MAX} answers today for ${PICKS}, so ${picksLeftOut === 1 ? "one of those wasn't" : `${picksLeftOut} of those weren't`} saved. Add ${picksLeftOut === 1 ? "it" : "them"} tomorrow.`
            : "";
          return {
            message: `${where}.${credits(earned)}${bonusNote(bonus)}${skipped}${leftOut}${capNote(earned > 0)}${claimNote()}`,
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
          const pid = newId("p");
          s.contacts.push({ id: pid, engagementId: e?.id ?? null, companyId: c.id, by: me.id, at: now });
          let earned = 0;
          for (const [k, v] of clean) earned += setValue({ id: pid, seedFields: {} }, "contact", k, v);
          const bonus = earned || capped ? payReferral() : 0;
          return {
            message: `Added ${clean.find(([k]) => k === "name")![1]} at ${c.name}.${credits(earned)}${bonusNote(bonus)}${capNote(earned > 0)}`,
            id: pubId(pid),
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
          p.onboarded = true;
          s.profiles[me.id] = p;
          return { message: "Saved." };
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
          const paid = (s.unlocks[k] ?? []).includes(me.id);
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
              ? "Reported. It's hidden for you now, and an admin will review it. Others still see it while the posting is listed."
              : own
                ? "Reported. It's hidden for everyone until an admin reviews it."
                : "Reported. It's hidden for you now, and an admin will review it.",
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
          const list = s.verifications[k] ?? [];
          if (list.includes(me.id)) return { message: "You already confirmed this." };
          s.verifications[k] = [...list, me.id];
          trustNow = null; // a confirmation can make the fact's author count (trustOf)
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
        case "notMine": {
          // "This isn't me": a seat matched to this member by name that they never held.
          const e = g.engagements.get(inId("engagement", a.engagementId));
          if (!e || !linkedSeat(e.id)) throw new ActionError("That seat isn't linked to you.");
          s.notMine[me.id] = [...(s.notMine[me.id] ?? []), e.id];
          // A name a member put on the seat is hidden for everyone until an admin decides. A name
          // from our own records may be another person with that name, so it only unlinks.
          const k = fkey(e.id, "operator");
          const cur = valueOf(e, s, "operator");
          const wasClosed = !!tracks().get(e.id)?.closedAt;
          // Their own claim on an open role the scan follows: taking it back clears the name, as an
          // admin removal would (the credit it earned goes back), so the seat is free for whoever took it.
          const ownClaim = !!cur && cur.by === me.id && cur.memberId === me.id && tracks().has(e.id);
          const hide = !!cur && !isSystem(cur.by) && !ownClaim;
          let reopened = false;
          if (cur && ownClaim) {
            removeFact(k, cur);
            reopened = wasClosed && !tracks().get(e.id)?.closedAt;
          } else if (cur && hide) {
            s.values[k] = { ...cur, status: "reported", reporters: [...new Set([...(cur.reporters ?? []), me.id])], reportedBy: me.id };
            s.reportLog.push({ memberId: me.id, ref: k, at: now });
            // Whatever else the same member put on that seat behind a lock (a rate, an end date) goes to review with the name.
            for (const field of ENG_GATED) {
              const fk = fkey(e.id, field);
              const fv = s.values[fk];
              if (field === "operator" || !fv || fv.status !== "live" || fv.by !== cur.by) continue;
              s.values[fk] = { ...fv, status: "reported", reporters: [...new Set([...(fv.reporters ?? []), me.id])], reportedBy: me.id };
            }
            // If naming them closed an open role, it is open again.
            reopened = reopenFilled(s, e.id, now);
            if (reopened) tracksNow = null;
          }
          return {
            message: `Got it. That seat is no longer linked to you.${ownClaim ? " Your name is off it." : hide ? " The name on that seat is hidden for everyone until an admin reviews it." : ""}${reopened ? " The role is open again." : ""}`,
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
          if ((s.unlocks[k] ?? []).some((m) => m !== me.id)) throw new ActionError("Someone already unlocked this, so it stays. You can still edit it.");
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
          return { message: "Saved." };
        }
        default:
          throw new ActionError(UNKNOWN_ACTION);
      }
    };

    const out = run();
    if (movedRate && out.message) out.message += " This rate replaces the one you shared privately, which already earned its credit.";
    if (refusal.message) return { message: "", refused: refusal.message };
    // The actor's new counts, so the client can update the top bar at once.
    let added = 0;
    let unlocked = 0;
    for (const l of s.ledger) {
      if (l.memberId !== me.id) continue;
      if (l.reason === "fill" && !l.undone) added++;
      else if (l.reason === "unlock") unlocked++;
    }
    const { earned, resetsAt } = earning(s, me.id, nowMs);
    return {
      ...out,
      me: {
        ...shownBalance(balance(s, me.id)), earned24h: earned, earnResetsAt: resetsAt, held: heldFor(s, me.id), added, unlocked,
        unlocksLeft: unlockRoom(s, me.id, nowMs).left, sellEarnLeft: Math.max(0, SELL_EARN_MAX - sellToday(s, me.id, nowMs, exemptPick).earned),
      },
    };
  });
  if (out.refused) throw new ActionError(out.refused);
  return out;
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
  return { ...s, ledger: s.ledger.map((l) => (l.ref.startsWith("bench.") ? { ...l, ref: "bench" } : l)), benchRates };
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
  if (!due && !newIp) return;
  if (due) seenAt.set(me.id, now);
  if (newIp) ipWriting.add(key);
  try {
    await mutate((d) => {
      if (due) d.seen[me.id] = new Date(now).toISOString();
      if (hash) keepIp(d, me.id, hash);
    });
  } finally {
    if (newIp) ipWriting.delete(key);
  }
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
      if (r.url) keyOfUrl.set(urlKey(r.url), k);
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
      if (company.length < 2 || title.length < 2 || !coKey || !titleKey || company.toLowerCase() === HIDDEN_COMPANY.toLowerCase()) continue;
      // A link too long to store whole loses its query string (tracking codes) rather than its end.
      const url = cleanValue(def("posting"), String(raw.url ?? "").trim()).value ?? "";
      const source = squeeze(raw.source, 60) || "scan";
      const key = squeeze(raw.key, 200) || `${coKey}:${titleKey}`;
      // A board's link to a host many companies share (a LinkedIn page) names no company by its host.
      const domain = siteKey(raw.domain) === hostOf(raw.domain) ? hostOf(raw.domain) : null;
      let co = (domain ? byHost.get(domain) : undefined) ?? byName.get(coKey);

      // The same posting: by its key, by its link, or the same title on a followed role at that company.
      let k = roles[key] ? key : url ? keyOfUrl.get(urlKey(url)) : undefined;
      if (!k && co) k = (engsAt.get(co.id) ?? []).filter((e) => keyOfEng.has(e.id) && roleSlug(e) === titleKey).map((e) => keyOfEng.get(e.id))[0];
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

      // New to us. Only these are capped: the newest come first, the rest wait for a later run.
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
      fill("function", raw.function && FUNCTIONS.includes(raw.function) ? raw.function : functionOf(title));
      fill("type", raw.type && ENGAGEMENT_TYPES.includes(raw.type) ? raw.type : /\binterim\b/i.test(title) ? "Interim" : /\bfractional\b/i.test(title) ? "Fractional" : null);
      if (adopted) put(eng.id, "status", "Open role");
      else fill("status", "Open role");
      fill("posting", url);
      fill("rate", raw.rate);
      const hours = Math.round(Number(raw.hoursPerWeek));
      if (hours >= 1 && hours <= 80) fill("hours", String(hours));
      roles[key] = { engagementId: eng.id, companyId: co.id, firstSeen: now, lastSeen: now, closedAt: null, url, source, postedAt: raw.postedAt ? iso(raw.postedAt, "") || null : null };
      keyOfEng.set(eng.id, key);
      if (url) keyOfUrl.set(urlKey(url), key);
      seen.add(key);
      res.opened++;
    }

    const sources: ScanSourceResult[] = (Array.isArray(found?.sources) ? found.sources : []).slice(0, 50).map((x) => ({
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

    if (closedNow.length) {
      // An unlock made after the posting was last seen paid for a role that was already gone.
      const since = new Map<string, string>(); // ledger ref -> unlocks later than this are paid back
      for (const r of closedNow) {
        since.set(fkey(r.engagementId, "role"), r.lastSeen);
        since.set(fkey(r.engagementId, "posting"), r.lastSeen);
        since.set(fkey(r.engagementId, "rate"), r.lastSeen);
        // The company too, when this left it with no open role. It was last known to be hiring when any of its roles was last seen.
        if ((engsAt.get(r.companyId) ?? []).some(openNow)) continue;
        const last = Object.values(roles).filter((x) => x.companyId === r.companyId).map((x) => x.lastSeen).sort().pop();
        since.set(fkey(r.companyId, "identity"), last ?? r.lastSeen);
      }
      for (const l of [...s.ledger]) {
        const from = l.reason === "unlock" ? since.get(l.ref) : undefined;
        if (from === undefined || l.at <= from || l.delta >= 0) continue;
        if (s.ledger.some((x) => x.reason === "refund" && x.memberId === l.memberId && x.ref === l.ref && x.at >= l.at)) continue; // already paid back
        s.ledger.push({ memberId: l.memberId, delta: -l.delta, reason: "refund", ref: l.ref, at: now, why: "closed" });
        refunded++;
      }
    }

    s.scan.lastRunAt = now;
    s.scan.lastOkAt = clean.size ? now : okBefore;
    s.scan.sources = sources;
    return { ...res, overCap, refunded };
  });
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
export function runScan(origin?: string, from: { collect?: () => ReturnType<typeof collectOpenRoles>; now?: string } = {}): Promise<ScanRun> {
  scanFlight ??= (async () => {
    const t0 = Date.now();
    scanTriedAt = t0;
    try {
      // Tests never reach a job board.
      const found = from.collect ? await from.collect() : process.env.RN_SCAN_TEST === "1" ? { roles: [], all: [], sources: [] } : await collectOpenRoles();
      // Every role that passed the screen, not the capped list: a role still posted must be seen to stay open.
      const result = await applyScan({ roles: found.all, sources: found.sources }, from.now);
      const digests = await sendDigests(result.at, origin).catch((e) => (console.error("digest failed", e), 0));
      const failed = found.sources.filter((x) => x.error).length;
      console.log(
        `scan: ${found.all.length} roles from ${found.sources.length} sources (${failed} failed), opened ${result.opened}, still open ${result.stillOpen}, ` +
          `closed ${result.closed}, reopened ${result.reopened}, companies added ${result.companiesAdded}, left for a later run ${result.overCap ?? 0}, ` +
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
  if (!fresh.length) return [];
  const count = new Map<string, number>();
  for (const e of fresh) {
    const fn = fnOf(e, s) ?? "Other";
    count.set(fn, (count.get(fn) ?? 0) + 1);
  }
  const byFunction = [...count].map(([fn, n]) => ({ function: fn, n })).sort((a, b) => b.n - a.n || a.function.localeCompare(b.function));

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
    const fn = prof.function ?? functionOf(prof.title || m.title);
    const mine = fn ? fresh.filter((e) => fnOf(e, s) === fn) : [];
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
        appUrl: base,
        unsubscribeUrl: `${base}/api/table/unsubscribe?m=${pubId(m.id)}&s=${unsubSig(m.id)}`,
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
  const base = (process.env.RN_PUBLIC_URL || origin || "").replace(/\/$/, "");
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
