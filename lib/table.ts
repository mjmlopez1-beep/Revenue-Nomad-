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
import { createDecipheriv, createHash, createHmac, randomBytes } from "crypto";
import { iconDomains } from "./companyIcons";
import { snapshot } from "./backup";
import { emailEnabled } from "./email";
import {
  ALL_FIELDS, EARN_CAP, FRACTIONAL_TYPES, FUNCTIONS, REFERRAL_BONUS, REFERRAL_LIMIT, cleanValue, fieldDef, functionOf, stripInvisible,
  HIDDEN_COMPANY, type Entity,
} from "./tableFields";
import type { Action, ActionResult, Cell, CompanyRec, EngagementRec, Friendly, LedgerRow, Me, PersonRec, View } from "./tableTypes";

export type { Action, ActionResult, View } from "./tableTypes";

/** Credits every member starts with. Set RN_STARTER_CREDITS (50 for the pilot). */
export const STARTER_CREDITS = Math.max(0, Number.parseInt(process.env.RN_STARTER_CREDITS ?? "", 10) || 5);

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
  demo?: boolean;
}

interface Added {
  id: string;
  by: string;
  at: string;
}
export interface FieldValue {
  value: string;
  by: string; // member id, or "seed"
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
  reason: "fill" | "unlock" | "refund" | "reversal" | "referral" | "confirm";
  ref: string;
  at: string;
}
interface Profile {
  function?: string;
  goal?: string;
  title?: string;
  onboarded?: boolean;
}
export interface State {
  companies: (Added & { name: string })[];
  engagements: (Added & { companyId: string })[];
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
  seedCache = { seed: seed ?? DEMO_SEED, at: Date.now() };
  return seedCache.seed;
}

const EMPTY_STATE = (): State => ({
  companies: [], engagements: [], contacts: [], values: {}, unlocks: {}, verifications: {}, members: [], ledger: [],
  profiles: {}, follows: {}, referralPaid: [], reportLog: [], held: [],
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
    for (const l of s.ledger) {
      if (l.delta !== 0 || (l.reason !== "referral" && l.reason !== "confirm")) continue;
      if (!s.held.some((h) => h.memberId === l.memberId && h.ref === l.ref && h.reason === l.reason))
        s.held.push({ memberId: l.memberId, delta: l.reason === "referral" ? REFERRAL_BONUS : 1, reason: l.reason, ref: l.ref, at: l.at });
    }
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
    if (!g.engagements.has(e.id)) g.engagements.set(e.id, { id: e.id, seedFields: {}, companyId: e.companyId, verified: false, source: "Member added" });
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
const live = (node: Node | undefined, s: State, field: string) => {
  const v = valueOf(node, s, field);
  return v && v.status === "live" ? v.value : null;
};

/** One field as `me` sees it. */
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

function cellOf(s: State, me: Member | null, node: Node | undefined, entity: Entity, key: string, idx?: MemberIndex): Cell {
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
  const ver = vers.length + (v.by === "seed" ? 1 : 0);
  if (!f.gated || mine || (me && (s.unlocks[k] ?? []).includes(me.id))) {
    const out: Cell = { s: "value", v: v.value, mine, ver, iv: !!me && vers.includes(me.id) };
    if (key === "operator" && idx) {
      const m = seatMember(idx, v);
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

/** An open fractional seat right now: status Open role, or a scanned posting nobody has marked filled. */
function isOpenRole(e: EngNode, s: State): boolean {
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
function identityHidden(g: Graph, s: State, idx: MemberIndex, me: Member | null, companyId: string): boolean {
  if (!me || isAdmin(me)) return false;
  const engs = [...g.engagements.values()].filter((e) => e.companyId === companyId);
  if (!engs.some((e) => isOpenRole(e, s))) return false;
  if ((s.unlocks[fkey(companyId, "identity")] ?? []).includes(me.id)) return false;
  if (s.companies.some((c) => c.id === companyId && c.by === me.id)) return false;
  const ids = new Set<string>([companyId, ...engs.map((e) => e.id)]);
  for (const p of g.contacts.values()) if (p.companyId === companyId) ids.add(p.id);
  for (const [k, v] of Object.entries(s.values)) if (v.by === me.id && ids.has(k.slice(0, k.lastIndexOf(".")))) return false;
  for (const e of engs) {
    const v = valueOf(e, s, "operator");
    if (v && v.status === "live" && seatMember(idx, v)?.id === me.id) return false;
  }
  return true;
}

function friendliness(g: Graph, s: State, companyId: string, engs: EngNode[], operators: Set<string>): Friendly {
  let fractional = 0;
  let open = 0;
  let recent = 0;
  let stories = 0;
  const functions = new Set<string>();
  const now = Date.now();
  for (const e of engs) {
    const type = live(e, s, "type");
    const status = live(e, s, "status");
    const isOpen = isOpenRole(e, s);
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
  const cell = (node: Node | undefined, entity: Entity, key: string): Cell => {
    const c = cellOf(s, me, node, entity, key, idx);
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
    const engRecs: EngagementRec[] = engs.map((e) => {
      const cells: Record<string, Cell> = {};
      for (const f of ENG_F) cells[f.key] = cell(e, "engagement", f.key);
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
      return { id: pubId(e.id), source: e.source, verified: e.verified, cells, people: ePeople, updatedAt: eu };
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
    const hidden = identityHidden(g, s, idx, me, c.id);
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
      friendly: friendliness(g, s, c.id, engs, operators),
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
        addedBy: v.by === "seed" ? "Seed data" : memberName(v.by),
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
      ledger.push({ at: l.at, delta: l.delta, reason: l.reason, company: companyNameOf(id), field: fieldDef(entityOf(id), field)?.label ?? field });
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
  return {
    demo: !!seed.demo,
    me: meRec,
    // Signed out: no records (sign up to see them), only the counts for the landing page.
    companies: me ? companies : [],
    stats,
    ledger,
    reported,
    email: emailEnabled(),
  };
}

/* ---------- actions ---------- */

export class ActionError extends Error {}

export async function perform(token: string | null, a: Action): Promise<ActionResult> {
  return mutate((s, seed): ActionResult => {
    const me = memberByToken(seed, token, s);
    if (!me) throw new ActionError("Join or sign in to add, confirm and unlock.");
    const now = new Date().toISOString();
    const nowMs = Date.parse(now);
    // Bonuses held at the cap are paid first, as the rolling window frees room.
    releaseHeld(s, me.id, now);
    const g = graph(seed, s);
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
    const hiddenFor = (companyId: string) => identityHidden(g, s, idx0, me, companyId);
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
    const changed = (entity: Entity, node: Node, field: string) => ({ entity, id: outId(entity, node.id), field, cell: cellOf(s, me, node, entity, field, memberIndex(seed, s)) });
    /** The member a picker choice names (a public member id), or null. */
    const pickedMember = (raw: unknown): Member | null => {
      if (raw === undefined || raw === null || raw === "") return null;
      const wanted = String(raw);
      const m = memberIndex(seed, s).all.find((x) => pubId(x.id) === wanted);
      if (!m) throw new ActionError("That member isn't on Trading Post.");
      return m;
    };
    let capped = false;
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
      if (cur && cur.by !== me.id) throw new ActionError(`${f.label} is already filled. Confirm or report it instead.`);
      if (cur && cur.value === value && cur.memberId === linked?.id) return 0; // unchanged (and any reports on it stand)
      const k = fkey(node.id, key);
      if (cur && cur.value !== value) delete s.verifications[k]; // confirmations were for the old value
      s.values[k] = { value: value!, by: me.id, at: now, status: "live", ...(linked ? { memberId: linked.id } : {}) };
      // Auto-fill the free Function from a new role.
      if (entity === "engagement" && key === "role" && !valueOf(node, s, "function")) {
        const fn = functionOf(value);
        if (fn) s.values[fkey(node.id, "function")] = { value: fn, by: me.id, at: now, status: "live" };
      }
      if (cur) return 0; // editing your own value earns nothing extra
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
          const wasMine = valueOf(node, s, f.key)?.by === me.id;
          const earned = setValue(node, a.entity, f.key, a.value, f.key === "operator" ? pickedMember(a.memberId) : null);
          const bonus = earned || capped ? payReferral() : 0;
          const cells = [changed(a.entity, node, f.key)];
          if (a.entity === "engagement" && f.key === "role" && !hadFunction && valueOf(node, s, "function")) cells.push(changed(a.entity, node, "function"));
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
          if (bal < todo.length && bal < left)
            throw new ActionError(
              bal ? `That needs ${todo.length} credits and you have ${bal}. Add a missing fact to earn more.` : "You're out of credits. Add a missing fact to earn one.",
            );
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
          const seatHolder = engFields.some(([k]) => k === "operator") ? pickedMember(a.operatorMemberId) : null;
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
                else earned += setValue(eng, "engagement", k, v, seatHolder);
              }
            } else {
              eid = newId("e", name);
              engNew = true;
              s.engagements.push({ id: eid, companyId: company.id, by: me.id, at: now });
              eng = { id: eid, seedFields: {} };
              for (const [k, v] of engFields) earned += setValue(eng, "engagement", k, v, seatHolder);
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
          const canSee = !f.gated || (s.unlocks[k] ?? []).includes(me.id);
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
          const canSee = !f.gated || (s.unlocks[k] ?? []).includes(me.id);
          if (!cur || cur.status !== "live" || !canSee || cur.reporters?.includes(me.id)) throw new ActionError("Nothing to confirm here.");
          if (cur.by === me.id) throw new ActionError("You can't confirm your own fact.");
          const list = s.verifications[k] ?? [];
          if (list.includes(me.id)) return { message: "You already confirmed this." };
          s.verifications[k] = [...list, me.id];
          const n = list.length + 1 + (cur.by === "seed" ? 1 : 0);
          // The member who added a fact earns +1 once two other members confirm it (once per fact;
          // it counts toward the daily cap and is held if the author is at it).
          if (cur.by !== "seed" && list.length + 1 >= 2 && !s.ledger.some((l) => l.reason === "confirm" && l.ref === k) && !s.held.some((h) => h.reason === "confirm" && h.ref === k))
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
          if (cur.by !== "seed") {
            const paid = s.ledger.filter((l) => l.memberId === cur.by && l.ref === k && (l.reason === "fill" || l.reason === "confirm")).reduce((n, l) => n + l.delta, 0);
            const back = s.ledger.filter((l) => l.memberId === cur.by && l.ref === k && l.reason === "reversal").reduce((n, l) => n + l.delta, 0);
            if (paid + back > 0) s.ledger.push({ memberId: cur.by, delta: -(paid + back), reason: "reversal", ref: k, at: now });
            s.held = s.held.filter((h) => !(h.reason === "confirm" && h.ref === k));
          }
          for (const m of s.unlocks[k] ?? []) s.ledger.push({ memberId: m, delta: 1, reason: "refund", ref: k, at: now });
          delete s.unlocks[k];
          return { message: "Removed. The field is open to fill again." };
        }
        default:
          throw new ActionError("Unknown action.");
      }
    };

    const out = run();
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
}

/** Admin export of the runtime state (for backups and audits). */
export async function exportState(): Promise<State> {
  return loadState();
}
