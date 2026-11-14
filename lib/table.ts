/**
 * The Table — one record table. Enrich to earn credits, spend credits to ungate.
 *
 * A record is a fractional engagement joined to the company that used the
 * fractional and the contacts who hired or worked with them. Underneath, the
 * three are separate linked entities (company 1→n engagements 1→n contacts) so
 * shared data is entered once: fill a company's website on one row and every
 * row for that company shows it; unlock it once and it's unlocked everywhere.
 *
 * Rows = one per contact on an engagement, or one row for an engagement that
 * has no contact yet (its contact cells are open to fill).
 *
 * Storage:
 *  - intel-seed.json (private, git-ignored, scripts/build-intel-seed.py):
 *    members (for sign-in), seed companies and engagements.
 *  - intel.json (runtime): added entities, field values, unlocks, credit ledger.
 */
import { promises as fs } from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { ALL_FIELDS, cleanValue, fieldDef, type Entity } from "./tableFields";

/** Credits every member starts with. Set RN_STARTER_CREDITS (e.g. 50 for a pilot). */
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
  engagementId: string;
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
  status: "live" | "reported" | "removed";
  reportedBy?: string;
}
export interface LedgerEntry {
  memberId: string;
  delta: number;
  reason: "fill" | "unlock" | "refund" | "reversal";
  ref: string;
  at: string;
}
export interface State {
  companies: (Added & { name: string })[];
  engagements: (Added & { companyId: string })[];
  contacts: (Added & { engagementId: string })[];
  values: Record<string, FieldValue>; // `${entityId}.${field}`
  unlocks: Record<string, string[]>; // `${entityId}.${field}` -> member ids
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
  companies: [
    { id: "c_acme", fields: { name: "Acme Robotics (sample)", website: "acme.example", industry: "Robotics" } },
    { id: "c_globex", fields: { name: "Globex Health (sample)" } },
  ],
  engagements: [
    { id: "e_acme1", companyId: "c_acme", fields: { role: "Fractional VP Sales", operator: "Sample Operator", start: "2025-03" }, verified: true },
    { id: "e_globex1", companyId: "c_globex", fields: { operator: "Another Operator" } },
  ],
  contacts: [
    { id: "p_jane", engagementId: "e_acme1", fields: { name: "Jane Sample", title: "CEO", relationship: "Hired the fractional", email: "jane@acme.example" } },
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
  // Hosted deploys can carry the private seed as a variable (gzip + base64) instead of a file,
  // so member data never has to go through git: RN_INTEL_SEED_B64.
  if (!seed && process.env.RN_INTEL_SEED_B64) {
    try {
      const json = gunzipSync(Buffer.from(process.env.RN_INTEL_SEED_B64, "base64")).toString("utf8");
      const s = JSON.parse(json) as Seed;
      if (Array.isArray(s.members) && Array.isArray(s.engagements)) seed = s;
    } catch {
      console.error("RN_INTEL_SEED_B64 is set but could not be decoded; falling back to demo data.");
    }
  }
  seedCache = { seed: seed ?? DEMO_SEED, at: Date.now() };
  return seedCache.seed;
}

export async function loadState(): Promise<State> {
  const s = await readJson<Partial<State>>(STATE_PATH);
  return { companies: [], engagements: [], contacts: [], values: {}, unlocks: {}, ledger: [], ...(s ?? {}) };
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

/* ---------- graph ---------- */

interface Node {
  id: string;
  seedFields: Record<string, string>;
}
interface Graph {
  companies: Map<string, Node & { name: string }>;
  engagements: Map<string, Node & { companyId: string; verified: boolean }>;
  contacts: Map<string, Node & { engagementId: string }>;
}

function graph(seed: Seed, s: State): Graph {
  const g: Graph = { companies: new Map(), engagements: new Map(), contacts: new Map() };
  for (const c of seed.companies) g.companies.set(c.id, { id: c.id, seedFields: c.fields, name: c.fields.name ?? "" });
  for (const c of s.companies) if (!g.companies.has(c.id)) g.companies.set(c.id, { id: c.id, seedFields: { name: c.name }, name: c.name });
  for (const e of seed.engagements) g.engagements.set(e.id, { id: e.id, seedFields: e.fields, companyId: e.companyId, verified: !!e.verified });
  for (const e of s.engagements) if (!g.engagements.has(e.id)) g.engagements.set(e.id, { id: e.id, seedFields: {}, companyId: e.companyId, verified: false });
  for (const p of seed.contacts ?? []) g.contacts.set(p.id, { id: p.id, seedFields: p.fields, engagementId: p.engagementId });
  for (const p of s.contacts) if (!g.contacts.has(p.id)) g.contacts.set(p.id, { id: p.id, seedFields: {}, engagementId: p.engagementId });
  return g;
}

/* ---------- helpers ---------- */

export const memberByToken = (seed: Seed, token: string | null | undefined) =>
  (token && seed.members.find((m) => m.token === token)) || null;

export function isAdmin(m: Member | null): boolean {
  const admins = (process.env.RN_ADMIN_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return !!m?.email && admins.includes(m.email.toLowerCase());
}

const fkey = (id: string, field: string) => `${id}.${field}`;
const slug = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "");
const newId = (p: string, name = "") => `${p}_${slug(name).slice(0, 20)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function balance(s: State, memberId: string): number {
  let b = STARTER_CREDITS;
  for (const e of s.ledger) if (e.memberId === memberId) b += e.delta;
  return b;
}

/** Effective value: a runtime value wins over the seed value. */
function valueOf(node: Node | undefined, s: State, field: string): FieldValue | null {
  if (!node) return null;
  const v = s.values[fkey(node.id, field)];
  if (v) return v.status === "removed" ? null : v;
  const sv = node.seedFields[field];
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
  companyId: string;
  engagementId: string;
  contactId: string | null;
  company: string;
  verified: boolean;
  filled: number;
  /** Keyed `${entity}.${field}`. */
  cells: Record<string, Cell>;
}

export interface View {
  demo: boolean;
  me: { name: string; title: string; credits: number; admin: boolean } | null;
  rows: Row[];
  companies: string[];
  stats: { companies: number; engagements: number; contacts: number };
  reported: { entity: Entity; id: string; field: string; record: string; label: string; value: string }[];
}

export async function buildView(token: string | null): Promise<View> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token);
  const g = graph(seed, s);

  const contactsByEng = new Map<string, string[]>();
  for (const p of g.contacts.values()) contactsByEng.set(p.engagementId, [...(contactsByEng.get(p.engagementId) ?? []), p.id]);

  const cell = (node: Node | undefined, f: NonNullable<ReturnType<typeof fieldDef>>): Cell => {
    const v = valueOf(node, s, f.key);
    if (!v) return { s: "empty" };
    const mine = !!me && v.by === me.id;
    if (v.status === "reported") return { s: "reported", mine };
    if (!f.gated || mine || (me && (s.unlocks[fkey(node!.id, f.key)] ?? []).includes(me.id))) return { s: "value", v: v.value, mine };
    return { s: "locked" };
  };

  const rows: Row[] = [];
  for (const e of g.engagements.values()) {
    const c = g.companies.get(e.companyId);
    if (!c) continue;
    const contactIds = contactsByEng.get(e.id) ?? [];
    for (const pid of contactIds.length ? contactIds : [null]) {
      const p = pid ? g.contacts.get(pid) : undefined;
      const nodes: Record<Entity, Node | undefined> = { company: c, engagement: e, contact: p };
      const cells: Record<string, Cell> = {};
      let filled = 0;
      for (const { entity, f, col } of ALL_FIELDS) {
        if (f.identity) continue;
        cells[col] = cell(nodes[entity], f);
        if (cells[col].s !== "empty") filled++;
      }
      rows.push({ id: pid ?? e.id, companyId: c.id, engagementId: e.id, contactId: pid, company: c.name, verified: e.verified, filled, cells });
    }
  }
  rows.sort((a, b) => a.company.localeCompare(b.company) || a.engagementId.localeCompare(b.engagementId));

  const reported: View["reported"] = [];
  if (isAdmin(me)) {
    for (const [k, v] of Object.entries(s.values)) {
      if (v.status !== "reported") continue;
      const [id, field] = k.split(".");
      const entity: Entity = g.companies.has(id) ? "company" : g.engagements.has(id) ? "engagement" : "contact";
      const f = fieldDef(entity, field);
      const companyId =
        entity === "company" ? id : entity === "engagement" ? g.engagements.get(id)?.companyId : g.engagements.get(g.contacts.get(id)?.engagementId ?? "")?.companyId;
      if (f) reported.push({ entity, id, field, record: g.companies.get(companyId ?? "")?.name ?? "?", label: f.label, value: v.value });
    }
  }

  return {
    demo: !!seed.demo,
    me: me ? { name: me.name, title: me.title, credits: balance(s, me.id), admin: isAdmin(me) } : null,
    rows,
    companies: [...g.companies.values()].map((c) => c.name).sort((a, b) => a.localeCompare(b)),
    stats: { companies: g.companies.size, engagements: g.engagements.size, contacts: g.contacts.size },
    reported,
  };
}

/* ---------- actions ---------- */

export class ActionError extends Error {}

export type Action =
  /** Fill a cell on a row. For a contact field on a row with no contact yet, the contact is created. */
  | { type: "fill"; engagementId: string; contactId?: string | null; entity: Entity; field: string; value: string }
  | { type: "unlock"; entity: Entity; id: string; field: string }
  /** New record: a fractional engagement at a company (existing or new). */
  | { type: "add"; company: string; role?: string }
  /** Another contact on the same engagement (a new row). */
  | { type: "addContact"; engagementId: string }
  | { type: "report"; entity: Entity; id: string; field: string }
  | { type: "review"; entity: Entity; id: string; field: string; decision: "keep" | "remove" };

export async function perform(token: string | null, a: Action): Promise<{ message: string; rowId?: string }> {
  return mutate((s, seed) => {
    const me = memberByToken(seed, token);
    if (!me) throw new ActionError("Open The Table from your personal link to enrich and unlock.");
    const now = new Date().toISOString();
    const g = graph(seed, s);
    const nodeOf = (entity: Entity, id: string): Node => {
      const n = (entity === "company" ? g.companies : entity === "engagement" ? g.engagements : g.contacts).get(id);
      if (!n) throw new ActionError("Record not found.");
      return n;
    };
    const fieldOf = (entity: Entity, key: string) => {
      const f = fieldDef(entity, key);
      if (!f || f.identity) throw new ActionError("That field can't be filled.");
      return f;
    };
    const setValue = (node: Node, entity: Entity, key: string, raw: unknown) => {
      const f = fieldOf(entity, key);
      const { value, error } = cleanValue(f, raw);
      if (error) throw new ActionError(error);
      const cur = valueOf(node, s, key);
      if (cur && cur.by !== me.id) throw new ActionError("Someone already filled this field.");
      s.values[fkey(node.id, key)] = { value: value!, by: me.id, at: now, status: "live" };
      if (cur) return false; // editing your own value earns nothing extra
      s.ledger.push({ memberId: me.id, delta: 1, reason: "fill", ref: fkey(node.id, key), at: now });
      return true;
    };

    switch (a?.type) {
      case "fill": {
        const e = g.engagements.get(a.engagementId);
        if (!e) throw new ActionError("Record not found.");
        let node: Node;
        let rowId: string | undefined;
        if (a.entity === "company") node = nodeOf("company", e.companyId);
        else if (a.entity === "engagement") node = e;
        else if (a.entity === "contact") {
          if (a.contactId) {
            const p = g.contacts.get(a.contactId);
            if (!p || p.engagementId !== e.id) throw new ActionError("Record not found.");
            node = p;
          } else {
            fieldOf("contact", a.field); // validate before creating anything
            const { error } = cleanValue(fieldDef("contact", a.field)!, a.value);
            if (error) throw new ActionError(error);
            const id = newId("p");
            s.contacts.push({ id, engagementId: e.id, by: me.id, at: now });
            node = { id, seedFields: {} };
            rowId = id;
          }
        } else throw new ActionError("Unknown field.");
        const f = fieldOf(a.entity, a.field);
        const earned = setValue(node, a.entity, a.field, a.value);
        const shared = a.entity === "company" ? " (shows on every row for this company)" : a.entity === "engagement" ? " (shows on every contact for this engagement)" : "";
        return { message: earned ? `+1 credit for ${f.label}${shared}.` : "Updated.", rowId };
      }
      case "unlock": {
        const node = nodeOf(a.entity, a.id);
        const f = fieldOf(a.entity, a.field);
        const k = fkey(node.id, f.key);
        const cur = valueOf(node, s, f.key);
        if (!cur || cur.status !== "live") throw new ActionError("Nothing to unlock here.");
        if (!f.gated || cur.by === me.id || (s.unlocks[k] ?? []).includes(me.id)) return { message: "Already visible." };
        if (balance(s, me.id) < 1) throw new ActionError("Out of credits. Fill an empty field to earn one.");
        s.ledger.push({ memberId: me.id, delta: -1, reason: "unlock", ref: k, at: now });
        s.unlocks[k] = [...(s.unlocks[k] ?? []), me.id];
        return { message: `Unlocked ${f.label}. −1 credit.` };
      }
      case "add": {
        const name = String(a.company ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
        if (name.length < 2) throw new ActionError("Which company used the fractional?");
        let company = [...g.companies.values()].find((c) => slug(c.name) === slug(name));
        if (!company) {
          const id = newId("c", name);
          s.companies.push({ id, name, by: me.id, at: now });
          company = { id, name, seedFields: { name } };
        }
        const id = newId("e", name);
        s.engagements.push({ id, companyId: company.id, by: me.id, at: now });
        let msg = `Added an engagement at ${company.name}.`;
        if (a.role && String(a.role).trim()) {
          setValue({ id, seedFields: {} }, "engagement", "role", a.role);
          msg += " +1 credit for Role.";
        }
        return { message: `${msg} Fill the rest to earn more.`, rowId: id };
      }
      case "addContact": {
        const e = g.engagements.get(a.engagementId);
        if (!e) throw new ActionError("Record not found.");
        // Reuse a blank contact on this engagement instead of stacking empty rows.
        const blank = [...g.contacts.values()].find(
          (p) => p.engagementId === e.id && !Object.keys(p.seedFields).length && !Object.keys(s.values).some((k) => k.startsWith(p.id + ".")),
        );
        if (blank) return { message: "Fill in the new contact row.", rowId: blank.id };
        // An engagement with no contacts already shows an open contact row.
        if (![...g.contacts.values()].some((p) => p.engagementId === e.id)) return { message: "Fill in the contact on this row.", rowId: e.id };
        const id = newId("p");
        s.contacts.push({ id, engagementId: e.id, by: me.id, at: now });
        return { message: "New contact row added. Fill it to earn credits.", rowId: id };
      }
      case "report": {
        const node = nodeOf(a.entity, a.id);
        const f = fieldOf(a.entity, a.field);
        const k = fkey(node.id, f.key);
        const cur = valueOf(node, s, f.key);
        const canSee = !f.gated || (s.unlocks[k] ?? []).includes(me.id);
        if (!cur || cur.status !== "live" || !canSee) throw new ActionError("Nothing to report here.");
        if (cur.by === me.id) throw new ActionError("That's your own value — just edit it.");
        s.values[k] = { ...cur, status: "reported", reportedBy: me.id };
        return { message: "Reported. It's hidden until it's reviewed." };
      }
      case "review": {
        if (!isAdmin(me)) throw new ActionError("Admins only.");
        const k = fkey(a.id, a.field);
        const cur = s.values[k];
        if (!cur || cur.status !== "reported") throw new ActionError("Nothing to review.");
        if (a.decision === "keep") {
          cur.status = "live";
          return { message: "Kept." };
        }
        // Wrong data: field reopens, the filler loses the credit, unlockers get theirs back.
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
