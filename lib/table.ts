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
 * Hidden companies: a company with an active open role keeps its name, website, LinkedIn,
 * logo and About behind "Unlock company" (1 credit); see identityHidden().
 *
 * Your seats: the member a seat-holder name resolves to sees their own seat free, can correct
 * what the seed or the scan say about it, and can say "this isn't me"; see seatHolder().
 *
 * Weekly scan: open roles come in from job boards with the day they were first seen, close
 * (with the date) when a clean scan stops listing them, and reopen if listed again; see
 * applyScan(). Their facts are owned by "scan" and behave like seed facts. After a scan,
 * sendDigests() emails the week's new roles.
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
import { snapshot } from "./backup";
import { emailEnabled, sendEmail } from "./email";
import { renderDigest } from "./digest";
import { collectOpenRoles } from "./scan/collect";
import {
  ALL_FIELDS, EARN_CAP, ENGAGEMENT_TYPES, FILLABLE, FRACTIONAL_TYPES, FUNCTIONS, REFERRAL_BONUS, REFERRAL_LIMIT, cleanValue, fieldDef, functionOf,
  stripInvisible, HIDDEN_COMPANY, LEGACY_VALUES, RN_REVENUE, type Entity,
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
}
interface Profile {
  function?: string;
  goal?: string;
  title?: string;
  onboarded?: boolean;
  /** Turned the weekly email off (My credits, or the unsubscribe link). */
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
}
interface ScanState {
  lastRunAt: string | null;
  /** Per-source results of the last run. */
  sources: ScanSourceResult[];
  /** Keyed by the posting's key (company and title). */
  roles: Record<string, RoleTrack>;
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
  members: (Member & { at: string; referredBy?: string; ipHash?: string })[];
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
export async function loadSeed(): Promise<Seed> {
  if (seedCache && Date.now() - seedCache.at < 60_000) return seedCache.seed;
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
export async function loadState(): Promise<State> {
  if (stateCache) return stateCache;
  stateLoading ??= (async () => {
    const s: State = { ...EMPTY_STATE(), ...((await readJson<Partial<State>>(STATE_PATH)) ?? {}) };
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
    return s;
  })();
  return stateLoading;
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
      for (const job of batch) {
        try {
          done.push({ job, out: job.fn(draft, seed) });
        } catch (e) {
          job.reject(e);
          // The failed change may have written part of itself into the draft: rebuild it.
          ({ draft, done } = replay(done.map((d) => d.job)));
        }
      }
      if (!done.length) continue;
      try {
        if (!dirReady) {
          await fs.mkdir(DATA_DIR, { recursive: true });
          dirReady = true;
        }
        const json = JSON.stringify(draft);
        const tmp = STATE_PATH + ".tmp";
        await fs.writeFile(tmp, json, "utf8");
        await fs.rename(tmp, STATE_PATH);
        stateCache = draft;
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
  return seed.members.find((m) => m.email && m.email.toLowerCase() === email) ?? s.members.find((m) => m.email === email) ?? null;
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
/** Ledger reasons that count toward the daily earning cap: everything a member earns. */
const EARNING = new Set(["fill", "referral", "confirm"]);
/** Max facts a member can unlock per rolling 24 hours (stops scraping). */
const UNLOCK_DAILY_MAX = 100;
/** The same limit in an account's first 24 hours (throwaway accounts). */
const NEW_MEMBER_UNLOCK_MAX = 20;
/** Reports a member can make per rolling 24 hours. */
const REPORT_DAILY_MAX = 10;
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
    .filter((l) => l.memberId === memberId && l.delta > 0 && EARNING.has(l.reason) && nowMs - Date.parse(l.at) < DAY)
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
  const idx = { byId, byName, all };
  memberIndexCache = { seed, s, idx };
  return idx;
}

/**
 * The member a seat-holder value points to: the one picked when it was added, else the one
 * member whose name matches exactly (two members with the same name match neither).
 */
function seatMember(idx: MemberIndex, v: FieldValue): Member | null {
  if (v.memberId) return idx.byId.get(v.memberId) ?? null;
  const same = idx.byName.get(normName(v.value)) ?? [];
  return same.length === 1 ? same[0] : null;
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

/** Members whose name matches a search, for the seat-holder picker. Signed-in members only. */
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
 * seat, or the status of a role the weekly scan follows (its dates already say it).
 */
function cellOf(s: State, me: Member | null, node: Node | undefined, entity: Entity, key: string, idx?: MemberIndex, free = false): Cell {
  const f = fieldDef(entity, key)!;
  const v = valueOf(node, s, f.key);
  if (!v) return { s: "empty" };
  if (f.system) return { s: "value", v: v.value, ver: 0, system: true };
  const mine = !!me && v.by === me.id;
  if (v.status === "reported") return { s: "reported", mine };
  // One report hides a fact only for the member who reported it.
  if (me && v.reporters?.includes(me.id)) return { s: "reported", mine: false };
  const k = fkey(node!.id, f.key);
  const vers = s.verifications[k] ?? [];
  const ver = vers.length + (isSystem(v.by) ? 1 : 0);
  if (!f.gated || mine || free || (me && (s.unlocks[k] ?? []).includes(me.id))) {
    const out: Cell = { s: "value", v: v.value, mine, ver, iv: !!me && vers.includes(me.id) };
    if (key === "operator" && idx) {
      const m = seatHolder(s, idx, node!.id, v);
      if (m) out.member = { title: m.title ?? "", you: !!me && m.id === me.id };
    }
    return out;
  }
  return { s: "locked", ver };
}

export function isAdmin(m: Member | null): boolean {
  const admins = (process.env.RN_ADMIN_EMAILS || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
  return !!m?.email && admins.includes(m.email.toLowerCase());
}

/* ---------- joining ---------- */

/**
 * Join with a name and email. An email that already belongs to a member can't be claimed
 * (they sign in with their link, or ask for one by email), so nobody can take over an
 * account by typing someone's email; the answer is the same for seed and joined members, so
 * it doesn't tell anyone who is a member. `ref` is an invite code from a fellow member. An
 * invite from an account that joined from the same network earns no bonus (it is most
 * likely the same person with a second email).
 */
export async function joinMember(nameRaw: unknown, emailRaw: unknown, ref?: unknown, ip = "local"): Promise<Member & { existing?: boolean }> {
  const ipHash = createHash("sha256").update("rn-ip:" + ip).digest("hex").slice(0, 16);
  return mutate((s, seed) => {
    const name = stripInvisible(nameRaw).trim().replace(/\s+/g, " ").slice(0, 80);
    const email = stripInvisible(emailRaw).trim().toLowerCase().slice(0, 120);
    if (name.length < 2) throw new ActionError("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) throw new ActionError("Enter a valid work email.");
    const seedMember = seed.members.find((m) => m.email && m.email.toLowerCase() === email);
    const joined = s.members.find((m) => m.email === email);
    if (seedMember || joined) {
      if (emailEnabled()) return { ...(seedMember ?? joined)!, existing: true }; // route emails them their link
      throw new ActionError("That email is already in use. Sign in with your link.");
    }
    const code = String(ref ?? "").trim();
    const referrer = code ? seed.members.find((m) => inviteCode(m.id) === code) ?? s.members.find((m) => inviteCode(m.id) === code) : undefined;
    const sameNetwork = !!referrer && s.members.some((m) => m.id === referrer.id && m.ipHash === ipHash);
    const m = {
      id: newId("j", name), name, email, title: "Member", token: randomBytes(12).toString("base64url"), at: new Date().toISOString(), ipHash,
      ...(referrer && !sameNetwork ? { referredBy: referrer.id } : {}),
    };
    s.members.push(m);
    memberIndexCache = null; // the draft changed in place: later jobs in this batch must see the new member
    return m;
  });
}

/* ---------- read model ---------- */

/** For the add form: is a company with this website (or name) already on Trading Post? */
export async function existingCompany(domain: string | null, name: string | null) {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const g = graph(seed, s);
  const d = domain?.replace(/^www\./, "");
  const c =
    (d && [...g.companies.values()].find((c) => live(c, s, "website")?.replace(/^www\./, "") === d)) ||
    (name && [...g.companies.values()].find((c) => slug(c.name) === slug(name))) ||
    null;
  if (!c) return null;
  return { id: pubId(c.id), name: c.name, website: live(c, s, "website"), industry: live(c, s, "industry") };
}

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
 * An open fractional seat right now: status Open role, or a scanned posting nobody has marked
 * filled. A followed role that closed (the posting came down, or the seat was filled) is not open.
 */
function isOpenRole(e: EngNode, s: State, tracks: Tracks): boolean {
  if (tracks.get(e.id)?.closedAt) return false;
  const status = live(e, s, "status");
  return status ? status === "Open role" : e.source === "Demand scan";
}

/** Company facts that would give a hidden company away. HQ is cut to its region instead. */
const IDENTITY_FIELDS = new Set(["website", "linkedin", "about"]);
/** The last part of an HQ ("Austin, TX" -> "TX"), so a hidden company keeps a region. */
const hqRegion = (hq: string) => hq.split(",").map((x) => x.trim()).filter(Boolean).pop() ?? "";

/**
 * Whether a company's identity is hidden from this member. A company with an active open role
 * is gated: its name, website, LinkedIn, logo and About cost 1 credit ("Unlock company"),
 * because the name alone is enough to find the role. It stays visible to admins, to members
 * who unlocked it or added anything there, and to the member who held a seat there.
 */
function identityHidden(g: Graph, s: State, idx: MemberIndex, tracks: Tracks, me: Member | null, companyId: string): boolean {
  if (!me || isAdmin(me)) return false;
  const engs = [...g.engagements.values()].filter((e) => e.companyId === companyId);
  if (!engs.some((e) => isOpenRole(e, s, tracks))) return false;
  if ((s.unlocks[fkey(companyId, "identity")] ?? []).includes(me.id)) return false;
  if (s.companies.some((c) => c.id === companyId && c.by === me.id)) return false;
  const ids = new Set<string>([companyId, ...engs.map((e) => e.id)]);
  for (const p of g.contacts.values()) if (p.companyId === companyId) ids.add(p.id);
  for (const [k, v] of Object.entries(s.values)) if (v.by === me.id && ids.has(k.slice(0, k.lastIndexOf(".")))) return false;
  for (const e of engs) if (seatHolder(s, idx, e.id, valueOf(e, s, "operator"))?.id === me.id) return false;
  return true;
}

function friendliness(g: Graph, s: State, tracks: Tracks, companyId: string, engs: EngNode[], operators: Set<string>): Friendly {
  let fractional = 0;
  let open = 0;
  let recent = 0;
  let stories = 0;
  const functions = new Set<string>();
  const now = Date.now();
  for (const e of engs) {
    const type = live(e, s, "type");
    const isOpen = isOpenRole(e, s, tracks);
    const isFractional = isOpen || SOURCE_FRACTIONAL.has(e.source) || (!!type && FRACTIONAL_TYPES.includes(type));
    if (isOpen) open++;
    if (isFractional) {
      if (!isOpen) fractional++;
      const fn = live(e, s, "function") ?? functionOf(live(e, s, "role"));
      if (fn) functions.add(fn);
      const start = live(e, s, "start");
      if (start && now - Date.parse(`${start}-01`) < 2 * 365 * DAY) recent++;
    } else stories++;
  }
  // An open role is the strongest signal there is: on its own it makes a company Medium.
  const score = Math.min(
    100,
    Math.min(40, fractional * 20) + Math.min(20, functions.size * 10) + (fractional >= 2 ? 15 : 0) + (recent ? 15 : 0) + (open ? 30 : 0) + (stories && !fractional && !open ? 5 : 0),
  );
  const tier = score >= 60 ? "High" : score >= 30 ? "Medium" : score > 0 ? "Low" : null;
  return { score, tier, fractional, open, functions: [...functions], operators: operators.size, recent };
}

/**
 * Signed-out views only need the counts: kept until the state or the seed changes (both are
 * replaced, never changed in place, so comparing the objects is enough). Signed-out visitors
 * who arrive while the counts are being rebuilt wait for that one build.
 */
let statsCache: { s: State; seed: Seed; stats: View["stats"] } | null = null;
let anonBuild: { s: State; seed: Seed; p: Promise<View> } | null = null;

export async function buildView(token: string | null): Promise<View> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (me) return fullView(seed, s, me);
  if (statsCache && statsCache.s === s && statsCache.seed === seed)
    return { demo: !!seed.demo, me: null, companies: [], stats: statsCache.stats, ledger: [], reported: [], email: emailEnabled() };
  if (!anonBuild || anonBuild.s !== s || anonBuild.seed !== seed) {
    const p = fullView(seed, s, null);
    anonBuild = { s, seed, p };
    p.finally(() => anonBuild?.p === p && (anonBuild = null)).catch(() => {});
  }
  return anonBuild.p;
}

async function fullView(seed: Seed, s: State, me: Member | null): Promise<View> {
  const g = graph(seed, s);
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

  const icons = await iconDomains(
    [...g.companies.values()].map((c) => ({ id: c.id, name: c.name, website: live(c, s, "website") })),
  );

  const companies: CompanyRec[] = [];
  const hiddenIds = new Set<string>();
  let peopleCount = 0;
  for (const c of g.companies.values()) {
    const facts = { known: 0, locked: 0, missing: 0 };
    const count = (cells: Record<string, Cell>, defs: typeof COMPANY_F) => {
      for (const f of defs) {
        if (f.system) continue;
        const x = cells[f.key];
        if (x.s === "value") facts.known++;
        else if (x.s === "locked") facts.locked++;
        else if (x.s === "empty") facts.missing++;
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
    const engRecs: EngagementRec[] = engs.map((e) => {
      const cells: Record<string, Cell> = {};
      // The seat holder sees their own seat free. A followed role's status is free for everyone.
      const yours = !!me && seatHolder(s, idx, e.id, valueOf(e, s, "operator"))?.id === me.id;
      const track = tracks.get(e.id);
      if (yours) holdsSeat = true;
      for (const f of ENG_F) cells[f.key] = cell(e, "engagement", f.key, yours || (!!track && f.key === "status"));
      // Function is free; derive it from the role when nobody set it.
      if (cells.function.s === "empty") {
        const fn = functionOf(live(e, s, "role"));
        if (fn) cells.function = { s: "value", v: fn, ver: 0, system: true };
      }
      count(cells, ENG_F);
      const op = live(e, s, "operator");
      if (op) operators.add(op.toLowerCase());
      const ePeopleNodes = people.filter((p) => p.engagementId === e.id);
      const ePeople = ePeopleNodes.map(toPerson);
      const eu = maxIso(touched(e.id), ...ePeopleNodes.map((p) => touched(p.id)));
      updatedAt = maxIso(updatedAt, eu);
      if (myAdds.has(e.id) || ePeopleNodes.some((p) => myAdds.has(p.id))) mine = true;
      return {
        id: pubId(e.id), source: e.source, verified: e.verified, cells, people: ePeople, updatedAt: eu, yours,
        ...(track ? { opened: track.firstSeen.slice(0, 10), closed: track.closedAt ? track.closedAt.slice(0, 10) : null } : {}),
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
      !isAdmin(me) &&
      engs.some((e) => isOpenRole(e, s, tracks)) &&
      !mine &&
      !(s.unlocks[fkey(c.id, "identity")] ?? []).includes(me.id) &&
      !s.companies.some((x) => x.id === c.id && x.by === me.id) &&
      !holdsSeat;
    if (hidden) {
      hiddenIds.add(c.id);
      for (const k of IDENTITY_FIELDS) if (cells[k]?.s === "value") cells[k] = { s: "locked", ver: 0 };
      const hq = cells.hq;
      if (hq?.s === "value") cells.hq = { ...hq, v: hqRegion(hq.v) };
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
  if (isAdmin(me)) {
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
        record: companyNameOf(id) || "?",
        label: f.label,
        value: v.value,
        companyId: pubId(companyIdOf(id)),
        addedBy: v.by === "seed" ? "Seed data" : v.by === "scan" ? "Weekly scan" : memberName(v.by),
        reporters: (v.reporters ?? (v.reportedBy ? [v.reportedBy] : [])).map(memberName),
        reportedAt: lastReport.get(k) ?? null,
      });
    }
    // Hidden ones (two or more reports) first, then the newest.
    reported.sort((a, b) => b.reporters.length - a.reporters.length || (b.reportedAt ?? "").localeCompare(a.reportedAt ?? ""));
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
      if (l.reason === "fill") added++;
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
        ledger.push({ at: l.at, delta: l.delta, reason: "Balance reset to zero", company: "", field: "" });
        continue;
      }
      ledger.push({ at: l.at, delta: l.delta, reason: l.reason, company: companyNameOf(id), field: fieldLabel(entityOf(id), field) });
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
      credits: balance(s, me.id),
      earned24h: earned,
      earnCap: EARN_CAP,
      earnResetsAt: resetsAt,
      held: heldFor(s, me.id),
      admin: isAdmin(me),
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
    members: seed.members.length + s.members.length,
    facts,
    starter: STARTER_CREDITS,
  };
  statsCache = { s, seed, stats };
  const scan = me ? scanSummary(g, s, tracks, nowMs, meRec?.function ?? null) : null;
  return {
    demo: !!seed.demo,
    me: meRec,
    // Signed out: no records (sign up to see them), only the counts for the landing page.
    companies: me ? companies : [],
    stats,
    ledger,
    reported,
    email: emailEnabled(),
    ...(me && scan ? { benchmarks: benchmarks(seed, g, s), scan } : {}),
    ...(me && scan && isAdmin(me) ? { admin: adminStats(seed, s, g, idx, nowMs, scan, entityOf) } : {}),
  };
}

/** How a ledger row or a stats line names a field. */
const BENCH_LABEL = "Rate (benchmarks only)";
const fieldLabel = (entity: Entity, field: string) =>
  entity === "company" && field === "identity" ? HIDDEN_COMPANY : fieldDef(entity, field)?.label ?? field;

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
    if (isOpenRole(e, s, tracks)) openNow++;
    const t = tracks.get(e.id);
    if (!t) continue;
    if (t.closedAt) {
      if (nowMs - Date.parse(t.closedAt) < 30 * DAY) closed30++;
    } else if (nowMs - Date.parse(t.firstSeen) < WEEK && isOpenRole(e, s, tracks)) {
      opened7++;
      if (myFunction && fnOf(e, s) === myFunction) mine7++;
    }
  }
  return { lastRunAt: s.scan.lastRunAt, openNow, opened7, closed30, mine7, digest: digestOn() };
}

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
      if (l.reason !== reason) continue;
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
    if (l.reason === "fill") (adds++, recent && adds7++);
    else if (l.reason === "unlock") (unlocks++, recent && unlocks7++);
  }

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
    walls: { members: walled.size, hits },
    pro: { interested: Object.values(s.profiles).filter((p) => p.proInterest).length, views, byWhere },
    topUnlocked: top("unlock"),
    topAdded: top("fill"),
    scan: { lastRunAt: scan.lastRunAt, openNow: scan.openNow, opened7: scan.opened7, closed30: scan.closed30, sources: s.scan.sources },
    digest: { enabled: digestOn(), lastSentAt: s.digest.lastSentAt, sent: s.digest.sent, optedOut: Object.values(s.profiles).filter((p) => p.digestOff).length },
    seats: { linkedMembers: linked.size, factsMissing },
    benchmarks: { memberRates, privateRates: s.benchRates.length, indexRates: seed.rateIndex?.length ?? 0 },
  };
}

/* ---------- rate benchmarks ---------- */

/** A group shows numbers only with rates from at least this many trusted contributors. */
export const BENCHMARK_MIN_N = 5;
/** A figure that includes Rate Index data needs this many (the survey promised groups of 20). */
export const BENCHMARK_INDEX_MIN_N = 20;
/** The range (p25 to p75) is sent only at this many trusted contributors. Below it, the median alone. */
export const BENCHMARK_RANGE_N = 10;
/** A joined account's rates count toward a group's floor once the account is this old. */
const BENCH_TRUST_AGE = 7 * DAY;
/** What leaves the server is rounded: dollars a month to the nearest 250, dollars an hour to the nearest 5. */
const BENCH_ROUND = { monthly: 250, hourly: 5 } as const;

/**
 * Whose rates count toward a group's floor: seed members, and joined accounts at least 7 days
 * old. Joining takes only an email, so a new account's rate can't help a group reach its floor.
 */
function benchTrust(seed: Seed, s: State, nowMs: number): (memberId: string) => boolean {
  const seedIds = new Set(seed.members.map((m) => m.id));
  const joinedAt = new Map(s.members.map((m) => [m.id, Date.parse(m.at)]));
  return (id) => seedIds.has(id) || nowMs - (joinedAt.get(id) ?? Infinity) >= BENCH_TRUST_AGE;
}

/** Benchmark-only rates on file per member (a count, never an amount), for the admin's list of recent adds. */
export function benchRateCounts(s: State): Map<string, number> {
  const n = new Map<string, number>();
  for (const b of s.benchRates) n.set(b.by, (n.get(b.by) ?? 0) + 1);
  return n;
}

/**
 * One rate. `who` is its contributor: "m:<member id>" for a rate a member shared or put on a
 * record, "r:<engagement id>" for a rate from our own records, "x:<row>" for a Rate Index row.
 * `index` marks a point from the Rate Index. `trusted` contributors count toward the floor.
 * `priv` marks a rate shared for the benchmarks only (a rate on a record is not private: any
 * member can unlock it for a credit).
 */
type RatePoint = { fn: string; revenue: string | null; kind: "monthly" | "hourly"; amount: number; index: boolean; who: string; trusted: boolean; priv: boolean };

const quantile = (sorted: number[], p: number) => {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
};

/**
 * One benchmark figure, counted in people and not in rows. Each contributor counts once, with
 * the middle of their rates in the group, so one account can never fill a group or pad it.
 *
 * A figure is the first of these that holds:
 *  - with Rate Index data, when the Rate Index rows and the trusted contributors together
 *    reach 20 (the survey promised groups of 20)
 *  - from member rates and our own records, when 5 trusted members shared a rate privately.
 *    The survey rows are left out, so survey data never shows in a group under 20.
 *  - from rates on records alone, when those come from 5 trusted contributors.
 * A rate on a record is no cover for a private one, because any member can unlock it for a
 * credit and take it out of the sum. So private rates and survey rows join a figure only as a
 * crowd of 5 of their own (a median over 4 unlocked rates and 1 private one would give the
 * private one away), and the range needs 10 of them. Until then they wait.
 *
 * Rates from accounts that are not trusted yet join a figure only once it shows without them,
 * and all of them together weigh as one contributor (the middle of their rates). So any number
 * of throwaway accounts moves a figure no further than one member can.
 * Below the floor, `n` and `min` describe the nearest floor ("3 of 5").
 */
function rateStat(pts: RatePoint[], kind: "monthly" | "hourly"): RateStat {
  const by = new Map<string, { amounts: number[]; index: boolean; trusted: boolean; priv: boolean }>();
  for (const p of pts) {
    const c = by.get(p.who);
    if (c) c.amounts.push(p.amount), (c.priv ||= p.priv);
    else by.set(p.who, { amounts: [p.amount], index: p.index, trusted: p.trusted, priv: p.priv });
  }
  const all = [...by.values()].map((c) => ({ ...c, amount: quantile(c.amounts.sort((a, b) => a - b), 0.5) }));
  const own = all.filter((c) => !c.index);
  const open = own.filter((c) => !c.priv);
  const trustedIn = (xs: typeof all) => xs.filter((c) => c.trusted).length;
  const survey = all.length - own.length;
  const openT = trustedIn(open);
  const privT = trustedIn(own) - openT;
  const indexed = survey > 0 && survey + privT + openT >= BENCHMARK_INDEX_MIN_N && survey + privT >= BENCHMARK_MIN_N;
  const used = indexed ? all : privT >= BENCHMARK_MIN_N ? own : openT >= BENCHMARK_MIN_N ? open : null;
  if (!used) {
    const viaIndex = survey > 0 && BENCHMARK_INDEX_MIN_N - survey <= BENCHMARK_MIN_N;
    return viaIndex ? { n: survey + privT + openT, min: BENCHMARK_INDEX_MIN_N, indexed: true } : { n: Math.max(privT, openT), min: BENCHMARK_MIN_N, indexed: false };
  }
  const s = used.filter((c) => c.trusted).map((c) => c.amount);
  const trusted = s.length;
  const fresh = used.filter((c) => !c.trusted).map((c) => c.amount).sort((a, b) => a - b);
  if (fresh.length) s.push(quantile(fresh, 0.5));
  s.sort((a, b) => a - b);
  const unit = BENCH_ROUND[kind];
  const q = (p: number) => Math.round(quantile(s, p) / unit) * unit;
  const stat: RateStat = { n: trusted + fresh.length, min: indexed ? BENCHMARK_INDEX_MIN_N : BENCHMARK_MIN_N, indexed, median: q(0.5) };
  // The private rates and survey rows in the figure (none when it is made of rates on records alone).
  const hidden = used === open ? 0 : privT + (indexed ? survey : 0);
  if (trusted >= BENCHMARK_RANGE_N && (hidden === 0 || hidden >= BENCHMARK_RANGE_N)) (stat.p25 = q(0.25)), (stat.p75 = q(0.75));
  return stat;
}

/** Weeks in a month, for turning hours a week into a monthly figure. */
const WEEKS_A_MONTH = 52 / 12;
const inRange = (kind: "monthly" | "hourly", amount: number) => (kind === "hourly" ? amount >= 25 && amount <= 1500 : amount >= 1000 && amount <= 150_000);

/** `at`: an account turns trusted with time alone, so the kept result is rebuilt every 10 minutes. */
let benchCache: { seed: Seed; s: State; b: Benchmarks; at: number } | null = null;

/**
 * Benchmarks by function and client revenue band, from three places: every live rate on a
 * record (whoever unlocked it), rates members shared for the benchmarks only, and Revenue
 * Nomad's Rate Index. Only medians and ranges leave the server, counted in people (see
 * rateStat) and rounded. The same for every viewer, so it is kept until the state or the seed
 * changes.
 */
function benchmarks(seed: Seed, g: Graph, s: State): Benchmarks {
  const nowMs = Date.now();
  if (benchCache && benchCache.s === s && benchCache.seed === seed && nowMs - benchCache.at < 10 * 60 * 1000) return benchCache.b;
  const pts: RatePoint[] = [];
  let total = 0;
  const trustedMember = benchTrust(seed, s, nowMs);
  /** One rate: its own point, and the other kind too when the hours a month are known. */
  const add = (fnRaw: string | null, revenueRaw: string | null, r: { kind: "monthly" | "hourly"; amount: number }, hoursMonth: number | null, index: boolean, who: string, trusted: boolean, priv = false) => {
    const fn = fnRaw && FUNCTIONS.includes(fnRaw) ? fnRaw : functionOf(fnRaw) ?? "Other";
    const revenue = revenueRaw && RN_REVENUE.includes(revenueRaw) ? revenueRaw : null;
    total++;
    pts.push({ fn, revenue, kind: r.kind, amount: r.amount, index, who, trusted, priv });
    if (!hoursMonth || hoursMonth <= 0) return;
    const other = r.kind === "hourly" ? ("monthly" as const) : ("hourly" as const);
    const amount = Math.round(r.kind === "hourly" ? r.amount * hoursMonth : r.amount / hoursMonth);
    if (inRange(other, amount)) pts.push({ fn, revenue, kind: other, amount, index, who, trusted, priv });
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
    add(fnOf(e, s), revenueOf(e), r, hoursMonthOf(e), false, ours ? `r:${e.id}` : `m:${v.by}`, ours || trustedMember(v.by));
  }
  for (const b of s.benchRates) {
    const e = b.engagementId ? g.engagements.get(b.engagementId) : undefined;
    // The same member's rate is already on the record: count it once.
    if (e && publicBy.get(e.id) === b.by) continue;
    add(b.fn, b.revenue, { kind: b.kind, amount: b.amount }, e ? ownHoursMonth(e, b.by) : null, false, `m:${b.by}`, trustedMember(b.by), true);
  }
  for (const [i, x] of (seed.rateIndex ?? []).entries()) {
    const hourly = Number(x?.hourly);
    if (!inRange("hourly", hourly)) continue;
    const hours = Number(x.hours);
    add(String(x.fn ?? ""), x.revenue ?? null, { kind: "hourly", amount: Math.round(hourly) }, Number.isFinite(hours) && hours > 0 ? hours : null, true, `x:${i}`, true);
  }

  const rows: BenchmarkRow[] = [];
  for (const fn of FUNCTIONS) {
    const mine = pts.filter((p) => p.fn === fn);
    const row = (revenue: string, xs: RatePoint[]): BenchmarkRow => {
      const monthly = rateStat(xs.filter((p) => p.kind === "monthly"), "monthly");
      const hourly = rateStat(xs.filter((p) => p.kind === "hourly"), "hourly");
      // Marked Rate Index only when a figure shows survey data or is counting toward the 20.
      return { function: fn, revenue, indexed: !!(monthly.indexed || hourly.indexed), monthly, hourly };
    };
    rows.push(row("All", mine));
    for (const revenue of RN_REVENUE) rows.push(row(revenue, mine.filter((p) => p.revenue === revenue)));
  }
  const b = { minN: BENCHMARK_MIN_N, rangeN: BENCHMARK_RANGE_N, total, rows };
  if (s === stateCache) benchCache = { seed, s, b, at: nowMs };
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

export async function perform(token: string | null, a: Action, origin?: string): Promise<ActionResult> {
  if (a?.type === "scanNow") {
    if (!isAdmin(await memberForToken(token))) throw new ActionError("Admins only.");
    // In the background: a scan reads several job boards and can take a while.
    void runScan(origin).catch((e) => console.error("scan failed", e));
    return { message: "Scan started." };
  }
  const out = await mutate((s, seed): ActionResult & { refused?: string } => {
    const me = memberByToken(seed, token, s);
    if (!me) throw new ActionError("Join or sign in to add, confirm and unlock.");
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
    const inId = (_entity: Entity, raw: unknown): string => {
      const internal = fromPub.get(String(raw ?? ""));
      if (!internal) throw new ActionError("Record not found.");
      return internal;
    };
    const idx0 = memberIndex(seed, s);
    const companyOf = (entity: Entity, id: string) =>
      entity === "company" ? id : entity === "engagement" ? g.engagements.get(id)?.companyId ?? "" : g.contacts.get(id)?.companyId ?? "";
    const hiddenFor = (companyId: string) => identityHidden(g, s, idx0, tracks(), me, companyId);
    /** The viewer holds this seat (and hasn't said it isn't theirs). */
    const ownSeat = (engId: string) => seatHolder(s, memberIndex(seed, s), engId, valueOf(g.engagements.get(engId), s, "operator"))?.id === me.id;
    /** Gated facts this member sees without an unlock: their own seat, and a followed role's status. */
    const freeFor = (entity: Entity, id: string, field: string) =>
      entity === "engagement" && ((field === "status" && tracks().has(id)) || ownSeat(id));
    /** Adding facts by clicking into a hidden company would reveal it for free. Typing its name in Add still works. */
    const mustSee = (companyId: string) => {
      if (hiddenFor(companyId)) throw new ActionError("Unlock this company first (1 credit) to add facts here.");
    };
    const nodeOf = (entity: Entity, raw: unknown): Node => {
      const id = inId(entity, raw);
      const n = (entity === "company" ? g.companies : entity === "engagement" ? g.engagements : g.contacts).get(id);
      if (!n) throw new ActionError("Record not found.");
      return n;
    };
    const fieldOf = (entity: Entity, key: string) => {
      const f = fieldDef(entity, key);
      if (!f || f.identity || f.system) throw new ActionError("That field can't be filled.");
      return f;
    };
    /** A changed cell for the result, as the actor now sees it. */
    const changed = (entity: Entity, node: Node, field: string) => ({
      entity, id: outId(entity, node.id), field, cell: cellOf(s, me, node, entity, field, memberIndex(seed, s), freeFor(entity, node.id, field)),
    });
    /** The member a picker choice names (a public member id, or "me" for the viewer), or null. */
    const pickedMember = (raw: unknown): Member | null => {
      if (raw === undefined || raw === null || raw === "") return null;
      const wanted = String(raw);
      if (wanted === "me") return me;
      const m = memberIndex(seed, s).all.find((x) => pubId(x.id) === wanted);
      if (!m) throw new ActionError("That member isn't on Trading Post.");
      return m;
    };
    let capped = false;
    /** Cells a fill changed besides its own (a filled open role's status). */
    const alsoChanged: { entity: Entity; node: Node; field: string }[] = [];
    /** Pay a fill, within the rolling 24 hour cap. Records a 0 entry when capped (so a later reversal knows). */
    const awardFill = (ref: string) => {
      const d = EARN_CAP - earning(s, me.id, nowMs).earned > 0 ? 1 : 0;
      s.ledger.push({ memberId: me.id, delta: d, reason: "fill", ref, at: now });
      return d;
    };
    /** The invite bonus, to both once the invitee adds a first fact. It counts toward the cap; any excess is held. */
    const payReferral = () => {
      const joined = s.members.find((m) => m.id === me.id);
      if (!joined?.referredBy || s.referralPaid.includes(me.id)) return 0;
      s.referralPaid.push(me.id);
      const recent = s.ledger.filter(
        (l) => l.memberId === joined.referredBy && l.reason === "referral" && l.delta > 0 && nowMs - Date.parse(l.at) < 30 * DAY,
      ).length;
      const held = (id: string) => s.held.filter((h) => h.memberId === id && h.reason === "referral" && nowMs - Date.parse(h.at) < 30 * DAY).length;
      if (recent + held(joined.referredBy) < REFERRAL_LIMIT) grant(s, joined.referredBy, REFERRAL_BONUS, "referral", `${me.id}.referral`, now);
      return grant(s, me.id, REFERRAL_BONUS, "referral", `${joined.referredBy}.referral`, now);
    };
    /** Set a value. Returns credits earned (0 when editing your own value or at the daily cap). */
    /** Set a value. `member` (seat holder only) links it to a member, whose name becomes the value. */
    const setValue = (node: Node, entity: Entity, key: string, raw: unknown, member: Member | null = null): number => {
      const f = fieldOf(entity, key);
      const linked = key === "operator" ? member : null;
      const { value, error } = cleanValue(f, linked ? linked.name : raw);
      if (error) throw new ActionError(`${f.label}. ${error}`);
      const cur = valueOf(node, s, key);
      // A seat holder can correct what our records or the scan say about their own seat.
      // What another member added still needs a report.
      const correction = !!cur && isSystem(cur.by) && entity === "engagement" && ownSeat(node.id);
      if (cur && cur.by !== me.id && !correction) throw new ActionError(`${f.label} is already filled. Confirm or report it instead.`);
      if (cur && cur.value === value && (correction || cur.memberId === linked?.id)) return 0; // unchanged (and any reports on it stand)
      const k = fkey(node.id, key);
      if (cur && cur.value !== value) delete s.verifications[k]; // confirmations were for the old value
      const eng = entity === "engagement" ? g.engagements.get(node.id) : undefined;
      // Naming who took an open role our records or the scan posted fills it.
      const fillsRole = !!eng && key === "operator" && !cur && isOpenRole(eng, s, tracks()) && isSystem(valueOf(eng, s, "status")?.by ?? "seed");
      s.values[k] = { value: value!, by: me.id, at: now, status: "live", ...(linked ? { memberId: linked.id } : {}) };
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
      if (cur) return 0; // editing your own value, or correcting your seat, earns nothing extra
      const d = awardFill(k);
      if (!d) capped = true;
      return d;
    };
    const capNote = () => {
      if (!capped) return "";
      const r = earning(s, me.id, nowMs).resetsAt;
      const hrs = r ? Math.max(1, Math.ceil((Date.parse(r) - nowMs) / 3_600_000)) : 24;
      return ` You've hit today's max of ${EARN_CAP} earned credits, so this one didn't earn. Earning reopens in about ${hrs} hour${hrs === 1 ? "" : "s"}.`;
    };
    const credits = (n: number) => (n ? ` +${n} credit${n > 1 ? "s" : ""}.` : "");

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
          const bonus = earned || capped ? payReferral() : 0;
          const cells = [changed(a.entity, node, f.key)];
          if (a.entity === "engagement" && f.key === "role" && !hadFunction && valueOf(node, s, "function")) cells.push(changed(a.entity, node, "function"));
          for (const c of alsoChanged) cells.push(changed(c.entity, c.node, c.field));
          return {
            message: `${wasMine ? "Updated" : "Added"} ${lower(f.label)}.${credits(earned)}${bonus ? ` Invite bonus +${bonus}.` : ""}${capNote()}`,
            id: outId(a.entity, node.id),
            capped,
            cells,
          };
        }
        case "unlock":
        case "unlockMany": {
          const items = a.type === "unlock" ? [a] : (a.items ?? []).slice(0, 60);
          const todo: { k: string; node: Node; entity: Entity; field: string }[] = [];
          for (const it of items) {
            const node = nodeOf(it.entity, it.id);
            // Unlock company: the name, website, LinkedIn, logo and About of a hidden company.
            if (it.entity === "company" && (it.field === "identity" || IDENTITY_FIELDS.has(it.field))) {
              const k = fkey(node.id, "identity");
              if (hiddenFor(node.id) && !todo.some((t) => t.k === k)) todo.push({ k, node, entity: "company", field: "identity" });
              continue;
            }
            const f = fieldOf(it.entity, it.field);
            const k = fkey(node.id, f.key);
            const cur = valueOf(node, s, f.key);
            if (!cur || cur.status !== "live") continue;
            if (!f.gated || cur.by === me.id || (s.unlocks[k] ?? []).includes(me.id) || todo.some((t) => t.k === k)) continue;
            if (freeFor(it.entity, node.id, f.key)) continue; // your own seat, or a followed role's status: already visible
            todo.push({ k, node, entity: it.entity, field: f.key });
          }
          if (!todo.length) {
            if (a.type === "unlock") throw new ActionError("Nothing to unlock here.");
            return { message: "Already visible." };
          }
          const unlockedToday = s.ledger.filter((l) => l.memberId === me.id && l.reason === "unlock" && nowMs - Date.parse(l.at) < DAY).length;
          // Accounts in their first 24 hours get a lower limit. Seed members have no join time.
          const joinedAt = s.members.find((m) => m.id === me.id)?.at;
          const max = joinedAt && nowMs - Date.parse(joinedAt) < DAY ? NEW_MEMBER_UNLOCK_MAX : UNLOCK_DAILY_MAX;
          const left = Math.max(0, max - unlockedToday);
          const bal = balance(s, me.id);
          // Credits first, unless the daily limit binds as tightly (earning more wouldn't help then).
          if (bal < todo.length && bal < left) {
            const msg = bal ? `That needs ${todo.length} credits and you have ${bal}. Add a missing fact to earn more.` : "You're out of credits. Add a missing fact to earn one.";
            // The wall: counted for the pilot, so the refusal is returned (a throw would drop the count).
            if (!addSignal(s, me.id, "wall", "server", now)) throw new ActionError(msg);
            refusal.message = msg;
            return { message: "" };
          }
          if (todo.length > left) throw new ActionError(left > 0 ? `You can unlock ${left} more today.` : "You hit today's unlock limit. It resets within 24 hours.");
          for (const t of todo) {
            s.ledger.push({ memberId: me.id, delta: -1, reason: "unlock", ref: t.k, at: now });
            s.unlocks[t.k] = [...(s.unlocks[t.k] ?? []), me.id];
          }
          return {
            message:
              todo.length === 1 && todo[0].field === "identity"
                ? `Unlocked ${g.companies.get(todo[0].node.id)?.name ?? "the company"}. −1 credit.`
                : `Unlocked ${todo.length} fact${todo.length > 1 ? "s" : ""}. −${todo.length} credit${todo.length > 1 ? "s" : ""}.`,
            cells: todo.filter((t) => t.field !== "identity").map((t) => changed(t.entity, t.node, t.field)),
          };
        }
        case "add": {
          const name = stripInvisible(a.company).trim().replace(/\s+/g, " ").slice(0, 80);
          if (name.length < 2) throw new ActionError("What's the company called?");
          if (name.toLowerCase() === HIDDEN_COMPANY.toLowerCase()) throw new ActionError("Type the company's real name.");
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
          const engFields = pick("engagement", a.engagementFields);
          const seatPick = engFields.some(([k]) => k === "operator") ? pickedMember(a.operatorMemberId) : null;
          const people = (a.people ?? []).slice(0, 10).map((p) => pick("contact", p)).filter((p) => p.length);
          for (const p of people) if (!p.some(([k]) => k === "name")) throw new ActionError("Each person needs a name.");
          const wantEng = a.engagementId ? inId("engagement", a.engagementId) : null;

          // Same company = same website, else same name.
          const siteOf = (c: Node) => live(c, s, "website")?.replace(/^www\./, "");
          let company: Node | undefined =
            (site && [...g.companies.values()].find((c) => siteOf(c) === site.replace(/^www\./, ""))) ||
            [...g.companies.values()].find((c) => slug(c.name) === slug(name));
          const isNew = !company;
          if (!company) {
            const id = newId("c", name);
            s.companies.push({ id, name, by: me.id, at: now });
            company = { id, seedFields: { name } };
            g.companies.set(id, { ...company, name });
          }
          const companyName = g.companies.get(company.id)!.name;
          let earned = 0;
          // Company fields only fill gaps; the company record is shared.
          for (const [k, v] of site ? [["website", site] as const, ...coFields] : coFields)
            if (!valueOf(company, s, k)) earned += setValue(company, "company", k, v);

          // An engagement is only made when there's engagement detail (or "+ engagement").
          // Not duplicated: the member's own engagement there, or one with the same role, or an
          // empty one, gets the details; filled fields stay as they are.
          let eid: string | null = null;
          let kept = 0;
          let engNew = false;
          if (wantEng || a.newEngagement || engFields.length) {
            const role = engFields.find(([k]) => k === "role")?.[1];
            const atCompany = [...g.engagements.values()].filter((e) => e.companyId === company!.id);
            const isBlank = (e: EngNode) =>
              Object.keys(e.seedFields).every((k) => k === "source") && !Object.keys(s.values).some((k) => k.startsWith(e.id + "."));
            const existing = wantEng
              ? atCompany.find((e) => e.id === wantEng)
              : (a.newEngagement ? atCompany.find(isBlank) : atCompany.find((e) => s.engagements.some((x) => x.id === e.id && x.by === me.id))) ??
                (role ? atCompany.find((e) => slug(live(e, s, "role") ?? "") === slug(role)) : undefined);
            let eng: Node;
            if (existing) {
              eid = existing.id;
              eng = existing;
              for (const [k, v] of engFields) {
                if (valueOf(eng, s, k)) kept++;
                else earned += setValue(eng, "engagement", k, v, seatPick);
              }
            } else {
              eid = newId("e", name);
              engNew = true;
              s.engagements.push({ id: eid, companyId: company.id, by: me.id, at: now });
              eng = { id: eid, seedFields: {} };
              for (const [k, v] of engFields) earned += setValue(eng, "engagement", k, v, seatPick);
            }
          }
          for (const p of people) {
            const pid = newId("p");
            s.contacts.push({ id: pid, engagementId: eid, companyId: company.id, by: me.id, at: now });
            const node: Node = { id: pid, seedFields: {} };
            for (const [k, v] of p) earned += setValue(node, "contact", k, v);
          }
          const bonus = earned || capped ? payReferral() : 0;
          const where = isNew
            ? `Added ${companyName}`
            : engNew
              ? `Added a new engagement at ${companyName}`
              : eid || earned || people.length
                ? `${companyName} is already on Trading Post. Your details went into its record`
                : `${companyName} is already on Trading Post`;
          const skipped = kept ? ` ${kept} field${kept > 1 ? "s were" : " was"} already filled and left as is.` : "";
          return {
            message: `${where}.${credits(earned)}${bonus ? ` Invite bonus +${bonus}.` : ""}${skipped}${capNote()}`,
            id: eid ? pubId(eid) : pubId(company.id),
            capped,
          };
        }
        case "addPerson": {
          const c = g.companies.get(fromPub.get(String(a.companyId)) ?? "");
          if (!c) throw new ActionError("Company not found.");
          mustSee(c.id);
          const e = a.engagementId ? g.engagements.get(fromPub.get(String(a.engagementId)) ?? "") : null;
          if (a.engagementId && (!e || e.companyId !== c.id)) throw new ActionError("Engagement not found.");
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
            message: `Added ${clean.find(([k]) => k === "name")![1]} at ${c.name}.${credits(earned)}${bonus ? ` Invite bonus +${bonus}.` : ""}${capNote()}`,
            id: pubId(pid),
            capped,
          };
        }
        case "follow": {
          const c = g.companies.get(fromPub.get(String(a.companyId)) ?? "");
          if (!c) throw new ActionError("Company not found.");
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
          // everyone until an admin reviews it. Only members who have added a fact can report.
          const node = nodeOf(a.entity, a.id);
          const f = fieldOf(a.entity, a.field);
          const k = fkey(node.id, f.key);
          const cur = valueOf(node, s, f.key);
          const canSee = !f.gated || (s.unlocks[k] ?? []).includes(me.id) || freeFor(a.entity, node.id, f.key);
          if (!cur || cur.status !== "live" || !canSee) throw new ActionError("Nothing to report here.");
          if (cur.by === me.id) throw new ActionError("That's your own fact. Edit it instead.");
          if (!s.ledger.some((l) => l.memberId === me.id && l.reason === "fill" && l.delta > 0)) throw new ActionError("Add a fact before you report one.");
          if (s.reportLog.filter((r) => r.memberId === me.id && nowMs - Date.parse(r.at) < DAY).length >= REPORT_DAILY_MAX)
            throw new ActionError(`You can report ${REPORT_DAILY_MAX} facts a day.`);
          if ((cur.reporters ?? []).includes(me.id)) return { message: "You already reported this." };
          const reporters = [...(cur.reporters ?? []), me.id];
          s.values[k] = { ...cur, reporters, status: reporters.length >= 2 ? "reported" : "live", reportedBy: me.id };
          s.reportLog.push({ memberId: me.id, ref: k, at: now });
          return { message: "Reported. An admin will review it.", cells: [changed(a.entity, node, f.key)] };
        }
        case "verify": {
          const node = nodeOf(a.entity, a.id);
          const f = fieldOf(a.entity, a.field);
          const k = fkey(node.id, f.key);
          const cur = valueOf(node, s, f.key);
          const canSee = !f.gated || (s.unlocks[k] ?? []).includes(me.id) || freeFor(a.entity, node.id, f.key);
          if (!cur || cur.status !== "live" || !canSee || cur.reporters?.includes(me.id)) throw new ActionError("Nothing to confirm here.");
          if (cur.by === me.id) throw new ActionError("You can't confirm your own fact.");
          const list = s.verifications[k] ?? [];
          if (list.includes(me.id)) return { message: "You already confirmed this." };
          s.verifications[k] = [...list, me.id];
          const n = list.length + 1 + (isSystem(cur.by) ? 1 : 0);
          // The member who added a fact earns +1 once two other members confirm it (once per fact;
          // it counts toward the daily cap and is held if the author is at it).
          if (!isSystem(cur.by) && list.length + 1 >= 2 && !s.ledger.some((l) => l.reason === "confirm" && l.ref === k) && !s.held.some((h) => h.reason === "confirm" && h.ref === k))
            grant(s, cur.by, 1, "confirm", k, now);
          return { message: `Confirmed ${lower(f.label)}. ${n} confirmation${n > 1 ? "s" : ""} now.`, cells: [changed(a.entity, node, f.key)] };
        }
        case "review": {
          if (!isAdmin(me)) throw new ActionError("Admins only.");
          const k = fkey(inId(a.entity, a.id), String(a.field));
          const cur = s.values[k];
          if (!cur || cur.status === "removed" || (cur.status !== "reported" && !cur.reporters?.length)) throw new ActionError("Nothing to review.");
          if (a.decision === "keep") {
            s.values[k] = { ...cur, status: "live" };
            delete s.values[k].reporters;
            delete s.values[k].reportedBy;
            return { message: "Kept." };
          }
          // Wrong data: the field reopens, the filler loses what it earned, unlockers get theirs back.
          s.values[k] = { ...cur, status: "removed" };
          delete s.values[k].reporters;
          delete s.verifications[k];
          if (!isSystem(cur.by)) {
            const paid = s.ledger.filter((l) => l.memberId === cur.by && l.ref === k && (l.reason === "fill" || l.reason === "confirm")).reduce((n, l) => n + l.delta, 0);
            const back = s.ledger.filter((l) => l.memberId === cur.by && l.ref === k && l.reason === "reversal").reduce((n, l) => n + l.delta, 0);
            if (paid + back > 0) s.ledger.push({ memberId: cur.by, delta: -(paid + back), reason: "reversal", ref: k, at: now });
            s.held = s.held.filter((h) => !(h.reason === "confirm" && h.ref === k));
          }
          for (const m of s.unlocks[k] ?? []) s.ledger.push({ memberId: m, delta: 1, reason: "refund", ref: k, at: now });
          delete s.unlocks[k];
          return { message: "Removed. The field is open to fill again." };
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
            if (ownSeat(engId)) return true;
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
            if (!e) throw new ActionError("Record not found.");
            if (!ownSeat(e.id) && !s.engagements.some((x) => x.id === e.id && x.by === me.id)) throw new ActionError("You can share a rate for a seat you held or added.");
            if (valueOf(e, s, "rate")?.by === me.id) throw new ActionError("Your rate is already on this seat, so it already counts in the benchmarks.");
            if (mine.some((b) => b.engagementId === e.id)) throw new ActionError("You already shared a rate for this seat.");
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
          const young = benchTrust(seed, s, nowMs)(me.id) ? "" : " Until your account is 7 days old it counts only in groups that already show numbers.";
          return { message: `Added to the benchmarks. Your rate is never shown with your name or the seat.${credits(earned)}${bonus ? ` Invite bonus +${bonus}.` : ""}${capNote()}${young}`, id, capped };
        }
        case "benchRateRemove": {
          const i = s.benchRates.findIndex((b) => b.id === String(a.id) && b.by === me.id);
          if (i < 0) throw new ActionError("Rate not found.");
          const ref = `bench.${s.benchRates[i].id}`;
          s.benchRates.splice(i, 1);
          // Take back the credit it earned.
          const paid = s.ledger.filter((l) => l.memberId === me.id && l.ref === ref).reduce((n, l) => n + l.delta, 0);
          if (paid > 0) s.ledger.push({ memberId: me.id, delta: -paid, reason: "reversal", ref, at: now });
          return { message: `Removed your rate from the benchmarks.${paid > 0 ? ` −${paid} credit.` : ""}` };
        }
        case "notMine": {
          // "This isn't me": a seat matched to this member by name that they never held.
          const e = g.engagements.get(inId("engagement", a.engagementId));
          if (!e || !ownSeat(e.id)) throw new ActionError("That seat isn't linked to you.");
          s.notMine[me.id] = [...(s.notMine[me.id] ?? []), e.id];
          return { message: "Got it. That seat is no longer linked to you.", id: pubId(e.id), cells: ENG_GATED.map((k) => changed("engagement", e, k)) };
        }
        case "signal": {
          const name = String(a.name);
          if (!SIGNAL_NAMES.has(name)) throw new ActionError("Unknown action.");
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
            return { message: a.digest ? "Weekly email is on." : "Weekly email is off." };
          }
          return { message: "Saved." };
        }
        default:
          throw new ActionError("Unknown action.");
      }
    };

    const out = run();
    if (refusal.message) return { message: "", refused: refusal.message };
    // The actor's new counts, so the client can update the top bar at once.
    let added = 0;
    let unlocked = 0;
    for (const l of s.ledger) {
      if (l.memberId !== me.id) continue;
      if (l.reason === "fill") added++;
      else if (l.reason === "unlock") unlocked++;
    }
    const { earned, resetsAt } = earning(s, me.id, nowMs);
    return { ...out, me: { credits: balance(s, me.id), earned24h: earned, earnResetsAt: resetsAt, held: heldFor(s, me.id), added, unlocked } };
  });
  if (out.refused) throw new ActionError(out.refused);
  return out;
}

/**
 * Admin export of the runtime state (for backups and audits). Rates shared for the benchmarks
 * only go out without who shared them or which seat they are about: no admin view shows a
 * member's private rate. (The daily snapshots on the data volume keep the full state.)
 */
export async function exportState(): Promise<Omit<State, "benchRates"> & { benchRates: Pick<StoredBenchRate, "fn" | "kind" | "amount" | "revenue">[] }> {
  const s = await loadState();
  return { ...s, benchRates: s.benchRates.map(({ fn, kind, amount, revenue }) => ({ fn, kind, amount, revenue })) };
}

/* ---------- last seen ---------- */

const SEEN_EVERY = 6 * 60 * 60 * 1000;
const seenAt = new Map<string, number>();

/** Record a member's visit (for the pilot's active counts). Written at most once per 6 hours per member. */
export async function touch(token: string | null | undefined): Promise<void> {
  if (!token) return;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) return;
  const now = Date.now();
  const last = seenAt.get(me.id) ?? Date.parse(s.seen[me.id] ?? "");
  if (Number.isFinite(last) && now - last < SEEN_EVERY) return;
  seenAt.set(me.id, now);
  await mutate((d) => {
    d.seen[me.id] = new Date(now).toISOString();
  });
}

/* ---------- the weekly scan: open roles, opened and closed with dates ---------- */

/** A followed role closes when a clean scan of its board hasn't listed it for this long. */
const CLOSE_AFTER = 10 * DAY;
/** Open roles that came with the seed close this long after the seed was built, unless a scan sees them. */
const SEED_ROLE_LIFE = 35 * DAY;
/** Whatever the board's health, nothing stays open this long unseen (as long as some board answered). */
const STALE_AFTER = 60 * DAY;
const SCAN_MAX_ROLES = 2000;

const squeeze = (raw: unknown, max: number) => stripInvisible(raw).trim().replace(/\s+/g, " ").slice(0, max);
/** "https://www.Acme.com/jobs" -> "acme.com", or null. */
const hostOf = (raw: unknown) => {
  const h = String(raw ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  return /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}$/.test(h) ? h : null;
};
const urlKey = (u: string) => u.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#]+$/, "");

/**
 * Store one scan. A posting seen again stays open; a closed one seen again reopens; a new one
 * gets its company (matched by website, then by name, else added) and an engagement whose
 * facts belong to "scan". An open role the scan did not see closes once its board has answered
 * cleanly and it was last listed more than 10 days ago, so a board outage closes nothing.
 * `nowIso` is the scan's time (tests pass one to move the clock).
 */
export async function applyScan(found: ScanCollectResult, nowIso?: string): Promise<ScanApplyResult> {
  return mutate((s, seed): ScanApplyResult => {
    const now = iso(nowIso, new Date().toISOString());
    const nowMs = Date.parse(now);
    const g = graph(seed, s);
    keepSeedTracks(seed, s);
    const roles = s.scan.roles;
    const res: ScanApplyResult = { at: now, opened: 0, stillOpen: 0, closed: 0, reopened: 0, companiesAdded: 0 };

    const keyOfEng = new Map<string, string>();
    const keyOfUrl = new Map<string, string>();
    for (const [k, r] of Object.entries(roles)) {
      keyOfEng.set(r.engagementId, k);
      if (r.url) keyOfUrl.set(urlKey(r.url), k);
    }
    const byHost = new Map<string, CompanyNode>();
    const byName = new Map<string, CompanyNode>();
    for (const c of g.companies.values()) {
      const h = hostOf(live(c, s, "website"));
      if (h && !byHost.has(h)) byHost.set(h, c);
      if (!byName.has(slug(c.name))) byName.set(slug(c.name), c);
    }
    const engsAt = new Map<string, EngNode[]>();
    for (const e of g.engagements.values()) engsAt.set(e.companyId, [...(engsAt.get(e.companyId) ?? []), e]);

    const def = (k: string) => fieldDef("engagement", k)!;
    const put = (id: string, field: string, value: string) => {
      const k = fkey(id, field);
      if (s.values[k]?.value !== value) delete s.verifications[k]; // confirmations were for the old value
      s.values[k] = { value, by: "scan", at: now, status: "live" };
    };
    const roleSlug = (e: Node) => slug(live(e, s, "role") ?? "");
    const openNow = (e: EngNode) => {
      const k = keyOfEng.get(e.id);
      if (k && roles[k].closedAt) return false;
      const status = live(e, s, "status");
      return status ? status === "Open role" : e.source === "Demand scan";
    };

    const seen = new Set<string>();
    for (const raw of (Array.isArray(found?.roles) ? found.roles : []).slice(0, SCAN_MAX_ROLES)) {
      const company = squeeze(raw?.company, 80);
      const title = squeeze(raw?.title, 120);
      if (company.length < 2 || title.length < 2 || company.toLowerCase() === HIDDEN_COMPANY.toLowerCase()) continue;
      // A link too long to store whole loses its query string (tracking codes) rather than its end.
      const link = String(raw.url ?? "").trim();
      const url = cleanValue(def("posting"), link.length > 200 ? link.split(/[?#]/)[0] : link).value ?? "";
      const source = squeeze(raw.source, 60) || "scan";
      const key = squeeze(raw.key, 200) || `${slug(company)}:${slug(title)}`;
      const domain = hostOf(raw.domain);
      let co = (domain ? byHost.get(domain) : undefined) ?? byName.get(slug(company));

      // The same posting: by its key, by its link, or the same title on a followed role at that company.
      let k = roles[key] ? key : url ? keyOfUrl.get(urlKey(url)) : undefined;
      if (!k && co) k = (engsAt.get(co.id) ?? []).filter((e) => keyOfEng.has(e.id) && roleSlug(e) === slug(title)).map((e) => keyOfEng.get(e.id))[0];
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
        if (!r.closedAt) res.stillOpen++;
        else if (r.closedBy !== "filled") {
          // Listed again: reopen. (A role a member filled stays filled while the posting lingers.)
          r.closedAt = null;
          delete r.closedBy;
          put(r.engagementId, "status", "Open role");
          res.reopened++;
        }
        continue;
      }

      if (!co) {
        const id = newId("c", company);
        s.companies.push({ id, name: company, by: "scan", at: now });
        co = { id, seedFields: { name: company }, name: company };
        g.companies.set(id, co);
        byName.set(slug(company), co);
        res.companiesAdded++;
      }
      if (domain && !valueOf(co, s, "website")) {
        put(co.id, "website", domain);
        if (!byHost.has(domain)) byHost.set(domain, co);
      }
      // An open role a member already added under this title becomes the followed one.
      let e = (engsAt.get(co.id) ?? []).find((x) => !keyOfEng.has(x.id) && openNow(x) && roleSlug(x) === slug(title));
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
      fill("status", "Open role");
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
    // Boards that answered with listings. Only their roles can close on the 10-day rule.
    const clean = new Set(sources.filter((x) => !x.error && x.fetched > 0).map((x) => x.source));
    for (const [k, r] of Object.entries(roles)) {
      if (r.closedAt || seen.has(k)) continue;
      const e = g.engagements.get(r.engagementId);
      if (!e) continue;
      const unseen = nowMs - Date.parse(r.lastSeen);
      const due =
        r.source === "seed" ? clean.size > 0 && unseen > SEED_ROLE_LIFE : (clean.has(r.source) && unseen > CLOSE_AFTER) || (clean.size > 0 && unseen > STALE_AFTER);
      if (!due) continue;
      r.closedAt = now;
      r.closedBy = "scan";
      const status = live(e, s, "status");
      if (!status || status === "Open role") put(e.id, "status", "Closed");
      res.closed++;
    }
    s.scan.lastRunAt = now;
    s.scan.sources = sources;
    return res;
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

/** Scan the job boards, store what was found, then send the weekly email. One at a time: a second call joins the first. */
export function runScan(origin?: string): Promise<ScanRun> {
  scanFlight ??= (async () => {
    const t0 = Date.now();
    scanTriedAt = t0;
    try {
      // Tests never reach a job board.
      const found = process.env.RN_SCAN_TEST === "1" ? { roles: [], sources: [] } : await collectOpenRoles();
      const result = await applyScan(found);
      const digests = await sendDigests(result.at, origin).catch((e) => (console.error("digest failed", e), 0));
      const failed = found.sources.filter((x) => x.error).length;
      console.log(
        `scan: ${found.roles.length} roles from ${found.sources.length} sources (${failed} failed), opened ${result.opened}, still open ${result.stillOpen}, ` +
          `closed ${result.closed}, reopened ${result.reopened}, companies added ${result.companiesAdded}, emails ${digests}, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
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
    } else if (nowMs - Date.parse(t.firstSeen) < WEEK && isOpenRole(e, s, tracks)) fresh.push(e);
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
        credits: balance(s, m.id),
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
        if (!(await sendEmail(data.email, mail.subject, mail.text, mail.html))) continue;
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
