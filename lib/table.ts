/**
 * The Table — a give-to-get company intelligence table for members.
 *
 * One rule: give one, get one. Sharing a note about a company earns a credit;
 * unlocking a company's notes or asking the members who know it costs one.
 *
 * Two files back it:
 *  - intel-seed.json  (private, built by scripts/build-intel-seed.py, never
 *    committed): members, companies, and which member is linked to which
 *    company, pulled from their signup success stories and engagements.
 *  - intel.json       (runtime state): notes, asks, unlocks, confirmations and
 *    the credit ledger.
 *
 * Privacy: the API never returns another member's name or email. Rows only
 * say how many members know a company and their titles.
 */
import { promises as fs } from "fs";
import path from "path";

export const CATEGORIES = [
  "Open to fractionals",
  "Planning to hire",
  "Who decides",
  "Problems",
  "How to pitch them",
  "Needs a specialist",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const STARTER_CREDITS = 3;
/** An ask nobody answers within this many days refunds its credit. */
export const ASK_REFUND_DAYS = 14;

export interface Member {
  id: string;
  name: string;
  email: string;
  title: string;
  based: string;
  token: string;
}
export interface Company {
  id: string;
  name: string;
}
export interface Link {
  memberId: string;
  companyId: string;
  relationship: "success_story" | "engagement" | "self_added";
  source: string;
  evidence: string;
  verified: boolean;
  date: string | null;
  status: "identified" | "confirmed";
}
export interface Seed {
  builtAt: string;
  members: Member[];
  companies: Company[];
  links: Link[];
  demo?: boolean;
}

export interface Note {
  id: string;
  companyId: string;
  authorId: string;
  category: Category;
  text: string;
  asOf: string; // YYYY-MM: when the author knew this to be true
  createdAt: string;
  status: "live" | "flagged" | "removed";
  flaggedBy?: string;
  flagReason?: string;
}
export interface Ask {
  id: string;
  companyId: string;
  askerId: string;
  question: string;
  createdAt: string;
  answeredBy: string[]; // note ids
}
export interface LedgerEntry {
  memberId: string;
  delta: number;
  reason: "give" | "unlock" | "ask";
  ref: string;
  at: string;
}
export interface State {
  notes: Note[];
  asks: Ask[];
  unlocks: Record<string, string[]>; // companyId -> memberIds
  linkStatus: Record<string, "confirmed" | "removed">; // `${memberId}|${companyId}`
  addedLinks: Link[];
  addedCompanies: Company[];
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

/** Used only when no private seed is present, so the page still works. */
const DEMO_SEED: Seed = {
  builtAt: new Date(0).toISOString(),
  demo: true,
  members: [
    { id: "d1", name: "Demo Member", email: "", title: "VP Sales", based: "", token: "demo" },
    { id: "d2", name: "Sample A", email: "", title: "VP RevOps", based: "", token: "demo-a" },
    { id: "d3", name: "Sample B", email: "", title: "VP Growth", based: "", token: "demo-b" },
  ],
  companies: [
    { id: "acmerobotics", name: "Acme Robotics (sample)" },
    { id: "globexhealth", name: "Globex Health (sample)" },
    { id: "initechcloud", name: "Initech Cloud (sample)" },
  ],
  links: [
    { memberId: "d1", companyId: "initechcloud", relationship: "success_story", source: "signup", evidence: "Initech Cloud - built the first outbound team", verified: false, date: "2025-03", status: "identified" },
    { memberId: "d2", companyId: "acmerobotics", relationship: "engagement", source: "engagement", evidence: "Published engagement: Acme Robotics", verified: true, date: "2026-05", status: "identified" },
    { memberId: "d3", companyId: "acmerobotics", relationship: "success_story", source: "signup", evidence: "Acme Robotics - scaled SDR team", verified: false, date: "2024-11", status: "identified" },
    { memberId: "d3", companyId: "globexhealth", relationship: "success_story", source: "signup", evidence: "Globex Health - rebuilt the pipeline", verified: false, date: "2025-08", status: "identified" },
  ],
};

let seedCache: { seed: Seed; at: number } | null = null;
export async function loadSeed(): Promise<Seed> {
  if (seedCache && Date.now() - seedCache.at < 60_000) return seedCache.seed;
  let seed: Seed | null = null;
  for (const p of SEED_CANDIDATES) {
    seed = await readJson<Seed>(p);
    if (seed && Array.isArray(seed.members)) break;
    seed = null;
  }
  seedCache = { seed: seed ?? DEMO_SEED, at: Date.now() };
  return seedCache.seed;
}

const EMPTY_STATE = (): State => ({
  notes: [],
  asks: [],
  unlocks: {},
  linkStatus: {},
  addedLinks: [],
  addedCompanies: [],
  ledger: [],
});

export async function loadState(): Promise<State> {
  const s = await readJson<State>(STATE_PATH);
  return { ...EMPTY_STATE(), ...(s ?? {}) };
}

let writeLock: Promise<void> = Promise.resolve();
/** Serialize read-modify-write cycles so concurrent requests don't clobber each other. */
export function mutate<T>(fn: (s: State, seed: Seed) => T | Promise<T>): Promise<T> {
  const run = async () => {
    const [state, seed] = await Promise.all([loadState(), loadSeed()]);
    const out = await fn(state, seed);
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = STATE_PATH + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(state, null, 1), "utf8");
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

export const companyKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\.(com|io|ai|co)$/, "")
    .replace(/[^a-z0-9]+/g, "");

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const linkKey = (m: string, c: string) => `${m}|${c}`;

export function memberByToken(seed: Seed, token: string | undefined | null): Member | null {
  if (!token) return null;
  return seed.members.find((m) => m.token === token) ?? null;
}

export function isAdmin(m: Member | null): boolean {
  if (!m) return false;
  const admins = (process.env.RN_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!m.email && admins.includes(m.email.toLowerCase());
}

/** All links that are still live (seed + self-added, minus ones members removed). */
function liveLinks(seed: Seed, s: State): Link[] {
  return [...seed.links, ...s.addedLinks]
    .filter((l) => s.linkStatus[linkKey(l.memberId, l.companyId)] !== "removed")
    .map((l) =>
      s.linkStatus[linkKey(l.memberId, l.companyId)] === "confirmed" ? { ...l, status: "confirmed" as const } : l,
    );
}

function allCompanies(seed: Seed, s: State): Company[] {
  const seen = new Set(seed.companies.map((c) => c.id));
  return [...seed.companies, ...s.addedCompanies.filter((c) => !seen.has(c.id))];
}

function askIsRefunded(a: Ask, now = Date.now()): boolean {
  return a.answeredBy.length === 0 && now - Date.parse(a.createdAt) > ASK_REFUND_DAYS * 864e5;
}

export function balance(s: State, memberId: string): number {
  let b = STARTER_CREDITS;
  for (const e of s.ledger) if (e.memberId === memberId) b += e.delta;
  for (const a of s.asks) if (a.askerId === memberId && askIsRefunded(a)) b += 1;
  return b;
}

const hasAccess = (s: State, memberId: string, companyId: string) =>
  (s.unlocks[companyId] ?? []).includes(memberId);

/* ---------- read model ---------- */

export interface Row {
  id: string;
  name: string;
  knownBy: number;
  titles: string[];
  verified: boolean;
  confirmed: number;
  youKnow: boolean;
  notes: number;
  categories: string[];
  freshest: string | null;
  openAsks: number;
  unlocked: boolean;
}

export interface View {
  demo: boolean;
  me: { id: string; name: string; title: string; credits: number; admin: boolean } | null;
  rows: Row[];
  /** Notes the viewer can read, keyed by company. */
  notes: Record<string, { id: string; category: string; text: string; asOf: string; mine: boolean; status: string }[]>;
  /** Asks routed to the viewer because they're linked to the company. */
  questionsForYou: { id: string; companyId: string; company: string; question: string; createdAt: string }[];
  myAsks: { id: string; company: string; question: string; createdAt: string; answered: boolean; refunded: boolean }[];
  /** The viewer's identified-but-unconfirmed company links, for one-tap confirm. */
  toConfirm: { companyId: string; company: string; evidence: string }[];
  flagged: { id: string; company: string; text: string; reason: string }[];
  stats: { members: number; companies: number; notes: number; asks: number };
}

export async function buildView(token: string | null): Promise<View> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token);
  const members = new Map(seed.members.map((m) => [m.id, m]));
  const companies = allCompanies(seed, s);
  const cname = new Map(companies.map((c) => [c.id, c.name]));
  const links = liveLinks(seed, s);

  const byCo = new Map<string, Link[]>();
  for (const l of links) byCo.set(l.companyId, [...(byCo.get(l.companyId) ?? []), l]);
  const liveNotes = s.notes.filter((n) => n.status === "live");
  const notesByCo = new Map<string, Note[]>();
  for (const n of liveNotes) notesByCo.set(n.companyId, [...(notesByCo.get(n.companyId) ?? []), n]);
  const openAsks = s.asks.filter((a) => a.answeredBy.length === 0 && !askIsRefunded(a));

  const rows: Row[] = [];
  for (const c of companies) {
    const ls = byCo.get(c.id) ?? [];
    const ns = notesByCo.get(c.id) ?? [];
    if (!ls.length && !ns.length && !openAsks.some((a) => a.companyId === c.id)) continue;
    const memberIds = new Set(ls.map((l) => l.memberId));
    const titles = [...new Set([...memberIds].map((id) => members.get(id)?.title || "Operator"))];
    const dates = [...ns.map((n) => n.asOf), ...ls.map((l) => l.date ?? "")].filter(Boolean).sort();
    rows.push({
      id: c.id,
      name: c.name,
      knownBy: memberIds.size,
      titles: titles.slice(0, 3),
      verified: ls.some((l) => l.verified),
      confirmed: new Set(ls.filter((l) => l.status === "confirmed").map((l) => l.memberId)).size,
      youKnow: !!me && memberIds.has(me.id),
      notes: ns.length,
      categories: [...new Set(ns.map((n) => n.category))],
      freshest: dates.at(-1) ?? null,
      openAsks: openAsks.filter((a) => a.companyId === c.id).length,
      unlocked: !!me && (hasAccess(s, me.id, c.id) || ns.every((n) => n.authorId === me.id)),
    });
  }
  rows.sort(
    (a, b) =>
      b.notes - a.notes || b.openAsks - a.openAsks || b.knownBy - a.knownBy || a.name.localeCompare(b.name),
  );

  const notes: View["notes"] = {};
  if (me) {
    for (const n of s.notes) {
      const mine = n.authorId === me.id;
      if (n.status === "removed") continue;
      if (n.status === "flagged" && !mine) continue;
      if (!mine && !hasAccess(s, me.id, n.companyId)) continue;
      (notes[n.companyId] ??= []).push({
        id: n.id,
        category: n.category,
        text: n.text,
        asOf: n.asOf,
        mine,
        status: n.status,
      });
    }
  }

  const myCompanies = new Set(me ? links.filter((l) => l.memberId === me.id).map((l) => l.companyId) : []);
  return {
    demo: !!seed.demo,
    me: me
      ? { id: me.id, name: me.name, title: me.title, credits: balance(s, me.id), admin: isAdmin(me) }
      : null,
    rows,
    notes,
    questionsForYou: me
      ? openAsks
          .filter((a) => a.askerId !== me.id && myCompanies.has(a.companyId))
          .map((a) => ({ id: a.id, companyId: a.companyId, company: cname.get(a.companyId) ?? a.companyId, question: a.question, createdAt: a.createdAt }))
      : [],
    myAsks: me
      ? s.asks
          .filter((a) => a.askerId === me.id)
          .map((a) => ({
            id: a.id,
            company: cname.get(a.companyId) ?? a.companyId,
            question: a.question,
            createdAt: a.createdAt,
            answered: a.answeredBy.length > 0,
            refunded: askIsRefunded(a),
          }))
          .reverse()
      : [],
    toConfirm: me
      ? links
          .filter((l) => l.memberId === me.id && l.status === "identified")
          .map((l) => ({ companyId: l.companyId, company: cname.get(l.companyId) ?? l.companyId, evidence: l.evidence }))
      : [],
    flagged:
      me && isAdmin(me)
        ? s.notes
            .filter((n) => n.status === "flagged")
            .map((n) => ({ id: n.id, company: cname.get(n.companyId) ?? n.companyId, text: n.text, reason: n.flagReason ?? "" }))
        : [],
    stats: { members: seed.members.length, companies: rows.length, notes: liveNotes.length, asks: s.asks.length },
  };
}

/* ---------- actions ---------- */

export class ActionError extends Error {}

export type Action =
  | { type: "give"; company: string; category: string; text: string; asOf: string; permission: boolean }
  | { type: "unlock"; companyId: string }
  | { type: "ask"; companyId: string; question: string }
  | { type: "confirm"; companyId: string }
  | { type: "remove"; companyId: string }
  | { type: "withdraw"; noteId: string }
  | { type: "flag"; noteId: string; reason: string }
  | { type: "review"; noteId: string; decision: "restore" | "remove" };

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export async function perform(token: string | null, a: Action): Promise<{ message: string }> {
  return mutate((s, seed) => {
    const me = memberByToken(seed, token);
    if (!me) throw new ActionError("Open The Table from your personal link to give and get.");
    const now = new Date().toISOString();
    const companies = allCompanies(seed, s);
    const exists = (id: string) => companies.some((c) => c.id === id);
    const spend = (reason: LedgerEntry["reason"], ref: string) => {
      if (balance(s, me.id) < 1) throw new ActionError("You're out of credits. Give one to get one.");
      s.ledger.push({ memberId: me.id, delta: -1, reason, ref, at: now });
    };
    const mineLink = (companyId: string) =>
      liveLinks(seed, s).some((l) => l.memberId === me.id && l.companyId === companyId);

    switch (a.type) {
      case "give": {
        const name = str(a.company, 80);
        const text = str(a.text, 280);
        const asOf = str(a.asOf, 7);
        if (!name) throw new ActionError("Which company?");
        if (!CATEGORIES.includes(a.category as Category)) throw new ActionError("Pick a category.");
        if (text.length < 15) throw new ActionError("Add a specific line — at least a short sentence.");
        if (!/^\d{4}-\d{2}$/.test(asOf)) throw new ActionError("When was this true? (month)");
        if (!a.permission) throw new ActionError("Confirm you're allowed to share this.");
        const id = companyKey(name);
        if (!id) throw new ActionError("Which company?");
        if (!exists(id)) s.addedCompanies.push({ id, name });
        if (!mineLink(id)) {
          s.addedLinks.push({
            memberId: me.id, companyId: id, relationship: "self_added", source: "give",
            evidence: "Shared a note", verified: false, date: asOf, status: "confirmed",
          });
        }
        s.linkStatus[linkKey(me.id, id)] = "confirmed";
        const note: Note = {
          id: newId("n"), companyId: id, authorId: me.id, category: a.category as Category,
          text, asOf, createdAt: now, status: "live",
        };
        s.notes.push(note);
        s.ledger.push({ memberId: me.id, delta: 1, reason: "give", ref: note.id, at: now });
        // A give answers every open ask on that company: askers get the notes.
        let answered = 0;
        for (const ask of s.asks) {
          if (ask.companyId === id && ask.askerId !== me.id && ask.answeredBy.length === 0 && !askIsRefunded(ask)) {
            ask.answeredBy.push(note.id);
            s.unlocks[id] = [...new Set([...(s.unlocks[id] ?? []), ask.askerId])];
            answered++;
          }
        }
        return { message: answered ? `+1 credit. Your note answered ${answered} open ask${answered > 1 ? "s" : ""}.` : "+1 credit. Thanks for giving." };
      }
      case "unlock": {
        if (!exists(a.companyId)) throw new ActionError("Unknown company.");
        if (hasAccess(s, me.id, a.companyId)) return { message: "Already unlocked." };
        const others = s.notes.filter((n) => n.companyId === a.companyId && n.status === "live" && n.authorId !== me.id);
        if (!others.length) throw new ActionError("No notes yet — ask the members who know it instead.");
        spend("unlock", a.companyId);
        s.unlocks[a.companyId] = [...(s.unlocks[a.companyId] ?? []), me.id];
        return { message: "Unlocked. −1 credit." };
      }
      case "ask": {
        const q = str(a.question, 200);
        if (!exists(a.companyId)) throw new ActionError("Unknown company.");
        if (q.length < 10) throw new ActionError("What do you want to know?");
        if (s.asks.some((x) => x.companyId === a.companyId && x.askerId === me.id && x.answeredBy.length === 0 && !askIsRefunded(x)))
          throw new ActionError("You already have an open ask on this company.");
        const ask: Ask = { id: newId("a"), companyId: a.companyId, askerId: me.id, question: q, createdAt: now, answeredBy: [] };
        spend("ask", ask.id);
        s.asks.push(ask);
        // Seeing every note on the company comes with the ask.
        s.unlocks[a.companyId] = [...new Set([...(s.unlocks[a.companyId] ?? []), me.id])];
        return { message: `Asked. −1 credit, refunded if nobody answers in ${ASK_REFUND_DAYS} days.` };
      }
      case "confirm":
      case "remove": {
        if (!mineLink(a.companyId)) throw new ActionError("You're not listed on that company.");
        s.linkStatus[linkKey(me.id, a.companyId)] = a.type === "confirm" ? "confirmed" : "removed";
        return { message: a.type === "confirm" ? "Confirmed. Members can now route asks to you." : "Removed. You won't get asks about it." };
      }
      case "withdraw": {
        const n = s.notes.find((x) => x.id === a.noteId && x.authorId === me.id);
        if (!n) throw new ActionError("Note not found.");
        n.status = "removed";
        return { message: "Withdrawn." };
      }
      case "flag": {
        const n = s.notes.find((x) => x.id === a.noteId && x.status === "live");
        if (!n) throw new ActionError("Note not found.");
        if (n.authorId !== me.id && !hasAccess(s, me.id, n.companyId)) throw new ActionError("Note not found.");
        n.status = "flagged";
        n.flaggedBy = me.id;
        n.flagReason = str(a.reason, 200) || "No reason given";
        return { message: "Flagged. It's hidden until it's reviewed." };
      }
      case "review": {
        if (!isAdmin(me)) throw new ActionError("Admins only.");
        const n = s.notes.find((x) => x.id === a.noteId);
        if (!n) throw new ActionError("Note not found.");
        n.status = a.decision === "restore" ? "live" : "removed";
        return { message: a.decision === "restore" ? "Restored." : "Removed." };
      }
      default:
        throw new ActionError("Unknown action.");
    }
  });
}
