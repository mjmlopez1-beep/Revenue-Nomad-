/**
 * The Table — enrich records, earn credits, spend credits to ungate fields.
 *
 * Three record types (companies, people, fractional history; see
 * tableFields.ts). Filling an empty field earns 1 credit. Ungating a gated
 * field someone else filled costs 1 credit. That's the whole model.
 *
 * Storage:
 *  - intel-seed.json (private, git-ignored, built by
 *    scripts/build-intel-seed.py): members (for sign-in) and seed records.
 *  - intel.json (runtime): added records, field values, unlocks, credit ledger.
 */
import { promises as fs } from "fs";
import path from "path";
import { cleanValue, typeDef, TYPES, type RecordType } from "./tableFields";

export const STARTER_CREDITS = 5;

export interface Member {
  id: string;
  name: string;
  email: string;
  title: string;
  token: string;
}
export interface SeedRecord {
  id: string;
  type: RecordType;
  fields: Record<string, string>;
  verified?: boolean;
}
export interface Seed {
  builtAt: string;
  members: Member[];
  records: SeedRecord[];
  demo?: boolean;
}

export interface FieldValue {
  value: string;
  by: string; // member id, or "seed"
  at: string;
  status: "live" | "reported" | "removed";
  reportedBy?: string;
}
export interface AddedRecord {
  id: string;
  type: RecordType;
  name: string;
  by: string;
  at: string;
}
export interface LedgerEntry {
  memberId: string;
  delta: number;
  reason: "fill" | "unlock" | "refund" | "reversal";
  ref: string;
  at: string;
}
export interface State {
  records: AddedRecord[];
  values: Record<string, FieldValue>; // `${recordId}.${field}`
  unlocks: Record<string, string[]>; // `${recordId}.${field}` -> member ids
  ledger: LedgerEntry[];
}

/* ---------- storage ---------- */

const SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR =
  process.env.RN_DATA_DIR ||
  (SERVERLESS ? path.join("/tmp", "revenue-nomad") : path.join(process.cwd(), "data"));
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
  records: [
    { id: "c_acme", type: "company", fields: { name: "Acme Robotics (sample)", website: "acme.example", usesFractionals: "Has before" } },
    { id: "c_globex", type: "company", fields: { name: "Globex Health (sample)" } },
    { id: "p_jane", type: "person", fields: { name: "Jane Sample", title: "CEO", company: "Acme Robotics (sample)", email: "jane@acme.example" } },
    { id: "h_acme", type: "history", fields: { company: "Acme Robotics (sample)", role: "Fractional VP Sales", operator: "Sample Operator" }, verified: true },
  ],
};

let seedCache: { seed: Seed; at: number } | null = null;
export async function loadSeed(): Promise<Seed> {
  if (seedCache && Date.now() - seedCache.at < 60_000) return seedCache.seed;
  let seed: Seed | null = null;
  for (const p of SEED_CANDIDATES) {
    seed = await readJson<Seed>(p);
    if (seed && Array.isArray(seed.members) && Array.isArray(seed.records)) break;
    seed = null;
  }
  seedCache = { seed: seed ?? DEMO_SEED, at: Date.now() };
  return seedCache.seed;
}

export async function loadState(): Promise<State> {
  const s = await readJson<Partial<State>>(STATE_PATH);
  return { records: [], values: {}, unlocks: {}, ledger: [], ...(s ?? {}) };
}

let writeLock: Promise<void> = Promise.resolve();
/** Serialize read-modify-write cycles so concurrent requests don't clobber each other. */
function mutate<T>(fn: (s: State, seed: Seed) => T): Promise<T> {
  const run = async () => {
    const [state, seed] = await Promise.all([loadState(), loadSeed()]);
    const out = fn(state, seed);
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = STATE_PATH + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(state), "utf8");
    await fs.rename(tmp, STATE_PATH);
    return out;
  };
  const p = writeLock.then(run, run);
  writeLock = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}

/* ---------- helpers ---------- */

export const memberByToken = (seed: Seed, token: string | null | undefined) =>
  (token && seed.members.find((m) => m.token === token)) || null;

export function isAdmin(m: Member | null): boolean {
  const admins = (process.env.RN_ADMIN_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return !!m?.email && admins.includes(m.email.toLowerCase());
}

const fkey = (recordId: string, field: string) => `${recordId}.${field}`;
const slug = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "");

export function balance(s: State, memberId: string): number {
  let b = STARTER_CREDITS;
  for (const e of s.ledger) if (e.memberId === memberId) b += e.delta;
  return b;
}

/** Effective value of a field: a runtime value wins over the seed value. */
function fieldValue(seed: SeedRecord | undefined, s: State, recordId: string, field: string): FieldValue | null {
  const v = s.values[fkey(recordId, field)];
  if (v) return v.status === "removed" ? null : v;
  const sv = seed?.fields[field];
  return sv ? { value: sv, by: "seed", at: "", status: "live" } : null;
}

/* ---------- read model ---------- */

/** What one cell looks like to the viewer. */
export type Cell =
  | { s: "empty" }
  | { s: "locked" }
  | { s: "value"; v: string; mine?: boolean }
  | { s: "reported"; mine: boolean };

export interface Row {
  id: string;
  name: string;
  verified: boolean;
  filled: number;
  cells: Record<string, Cell>;
}

export interface View {
  demo: boolean;
  type: RecordType;
  me: { name: string; title: string; credits: number; admin: boolean } | null;
  rows: Row[];
  counts: Record<RecordType, number>;
  reported: { recordId: string; field: string; record: string; label: string; value: string }[];
}

function allRecords(seed: Seed, s: State) {
  const seedById = new Map(seed.records.map((r) => [r.id, r]));
  const list: { id: string; type: RecordType; seed?: SeedRecord; name: string }[] = seed.records.map((r) => ({
    id: r.id,
    type: r.type,
    seed: r,
    name: r.fields[typeDef(r.type)!.identity.key] ?? "",
  }));
  for (const r of s.records) if (!seedById.has(r.id)) list.push({ id: r.id, type: r.type, name: r.name });
  return list;
}

export async function buildView(token: string | null, type: RecordType): Promise<View> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token);
  const def = typeDef(type)!;
  const records = allRecords(seed, s);

  const rows: Row[] = records
    .filter((r) => r.type === type)
    .map((r) => {
      const cells: Record<string, Cell> = {};
      let filled = 0;
      for (const f of def.fields) {
        const v = fieldValue(r.seed, s, r.id, f.key);
        if (!v) {
          cells[f.key] = { s: "empty" };
          continue;
        }
        filled++;
        const mine = !!me && v.by === me.id;
        if (v.status === "reported") cells[f.key] = { s: "reported", mine };
        else if (!f.gated || mine || (me && (s.unlocks[fkey(r.id, f.key)] ?? []).includes(me.id)))
          cells[f.key] = { s: "value", v: v.value, mine };
        else cells[f.key] = { s: "locked" };
      }
      return { id: r.id, name: r.name, verified: !!r.seed?.verified, filled, cells };
    });

  const counts = Object.fromEntries(TYPES.map((t) => [t.type, records.filter((r) => r.type === t.type).length])) as Record<RecordType, number>;
  const byId = new Map(records.map((r) => [r.id, r]));
  const reported: View["reported"] = [];
  if (isAdmin(me)) {
    for (const [k, v] of Object.entries(s.values)) {
      if (v.status !== "reported") continue;
      const [recordId, field] = k.split(".");
      const r = byId.get(recordId);
      const f = r && typeDef(r.type)!.fields.find((x) => x.key === field);
      if (r && f) reported.push({ recordId, field, record: r.name, label: f.label, value: v.value });
    }
  }

  return {
    demo: !!seed.demo,
    type,
    me: me ? { name: me.name, title: me.title, credits: balance(s, me.id), admin: isAdmin(me) } : null,
    rows,
    counts,
    reported,
  };
}

/* ---------- actions ---------- */

export class ActionError extends Error {}

export type Action =
  | { type: "fill"; recordId: string; field: string; value: string }
  | { type: "unlock"; recordId: string; field: string }
  | { type: "add"; recordType: RecordType; name: string }
  | { type: "report"; recordId: string; field: string }
  | { type: "review"; recordId: string; field: string; decision: "keep" | "remove" };

export async function perform(token: string | null, a: Action): Promise<{ message: string; recordId?: string }> {
  return mutate((s, seed) => {
    const me = memberByToken(seed, token);
    if (!me) throw new ActionError("Open The Table from your personal link to enrich and unlock.");
    const now = new Date().toISOString();
    const records = allRecords(seed, s);
    const find = (id: string) => {
      const r = records.find((x) => x.id === id);
      if (!r) throw new ActionError("Record not found.");
      return r;
    };
    const fieldOf = (r: { type: RecordType }, key: string) => {
      const f = typeDef(r.type)!.fields.find((x) => x.key === key);
      if (!f) throw new ActionError("Unknown field.");
      return f;
    };

    switch (a?.type) {
      case "fill": {
        const r = find(a.recordId);
        const f = fieldOf(r, a.field);
        const { value, error } = cleanValue(f, a.value);
        if (error) throw new ActionError(error);
        const k = fkey(r.id, f.key);
        const cur = fieldValue(r.seed, s, r.id, f.key);
        if (cur && cur.by !== me.id) throw new ActionError("Someone already filled this field.");
        s.values[k] = { value: value!, by: me.id, at: now, status: "live" };
        if (cur) return { message: "Updated." }; // editing your own value earns nothing extra
        s.ledger.push({ memberId: me.id, delta: 1, reason: "fill", ref: k, at: now });
        return { message: `+1 credit for ${f.label}.` };
      }
      case "unlock": {
        const r = find(a.recordId);
        const f = fieldOf(r, a.field);
        const k = fkey(r.id, f.key);
        const cur = fieldValue(r.seed, s, r.id, f.key);
        if (!cur || cur.status !== "live") throw new ActionError("Nothing to unlock here.");
        if (!f.gated || cur.by === me.id || (s.unlocks[k] ?? []).includes(me.id)) return { message: "Already visible." };
        if (balance(s, me.id) < 1) throw new ActionError("Out of credits. Fill an empty field to earn one.");
        s.ledger.push({ memberId: me.id, delta: -1, reason: "unlock", ref: k, at: now });
        s.unlocks[k] = [...(s.unlocks[k] ?? []), me.id];
        return { message: `Unlocked ${f.label}. −1 credit.` };
      }
      case "add": {
        const def = typeDef(a.recordType);
        if (!def) throw new ActionError("Unknown table.");
        const name = String(a.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
        if (name.length < 2) throw new ActionError(`Enter the ${def.identity.label.toLowerCase()}.`);
        const prefix = { company: "c", person: "p", history: "h" }[def.type];
        if (def.type === "company") {
          const dupe = records.find((r) => r.type === "company" && slug(r.name) === slug(name));
          if (dupe) return { message: `${dupe.name} is already on the table.`, recordId: dupe.id };
        }
        const id = `${prefix}_${slug(name).slice(0, 24)}_${Date.now().toString(36)}`;
        s.records.push({ id, type: def.type, name, by: me.id, at: now });
        return { message: `Added ${name}. Fill its fields to earn credits.`, recordId: id };
      }
      case "report": {
        const r = find(a.recordId);
        const f = fieldOf(r, a.field);
        const k = fkey(r.id, f.key);
        const cur = fieldValue(r.seed, s, r.id, f.key);
        const canSee = !f.gated || (s.unlocks[k] ?? []).includes(me.id);
        if (!cur || cur.status !== "live" || !canSee) throw new ActionError("Nothing to report here.");
        if (cur.by === me.id) throw new ActionError("That's your own value — just edit it.");
        s.values[k] = { ...cur, status: "reported", reportedBy: me.id };
        return { message: "Reported. It's hidden until it's reviewed." };
      }
      case "review": {
        if (!isAdmin(me)) throw new ActionError("Admins only.");
        const k = fkey(a.recordId, a.field);
        const cur = s.values[k];
        if (!cur || cur.status !== "reported") throw new ActionError("Nothing to review.");
        if (a.decision === "keep") {
          cur.status = "live";
          return { message: "Kept." };
        }
        // Wrong data: field goes back to empty, the filler loses the credit,
        // and everyone who paid to see it gets theirs back.
        s.values[k] = { ...cur, status: "removed" };
        if (cur.by !== "seed") s.ledger.push({ memberId: cur.by, delta: -1, reason: "reversal", ref: k, at: now });
        for (const m of s.unlocks[k] ?? []) s.ledger.push({ memberId: m, delta: 1, reason: "refund", ref: k, at: now });
        delete s.unlocks[k];
        return { message: "Removed. Field is open to fill again." };
      }
      default:
        throw new ActionError("Unknown action.");
    }
  });
}
