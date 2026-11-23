/**
 * Suggested additions from your connections (the owner's decision, 2026-11-23), behind RN_SUGGEST
 * (off unless set to "on"): after a member brings in their LinkedIn connections file or a contacts
 * CSV, Merlin lists the people in it who look like a decision maker or a leader at a company on
 * Merlin that has nobody like that on file. The member ticks who to add; each one added is a
 * member add like any other (lib/table.ts "suggestAdd"): the name, the title and the relationship
 * (Decision maker) only, never an email, a phone or any other field from the file, 1 credit each
 * inside the daily earning cap. Nothing is added without the tick.
 *
 * Who is never suggested:
 *   - anyone from Google: Google's contacts and calendar stay private to the member (Limited Use);
 *     only the two files feed this;
 *   - anyone at a company outside the United States (names show only on US companies);
 *   - anyone in California. The two files carry no location of the person, so Merlin can't read
 *     the person's own location: it leaves out every company based in California as well, so no
 *     Californian can come in through here;
 *   - a name that isn't a person's (one word, initials only, a greeting or a page's words,
 *     lib/personName.ts), the member themself, another member, anyone whose title is not a
 *     leader's (C-level, VP, Head of, founder, owner, president, managing director or partner,
 *     general manager; never a fractional, interim, advisor or consultant title);
 *   - anyone at a company that already has a decision maker or a leader on file, or the same name
 *     already there, or who asked to be removed there (Remove my name, /remove);
 *   - anyone the member said no to (State.paths[memberId].suggest.skip).
 * A match at a company still locked for the member is counted only (the locked-match rule): the
 * company and the person are named once the member opens it.
 *
 * Kept: the member's own "no" and "added" keys (one-way hashes of the company and the name, never
 * the name), inside State.paths[memberId], so they leave with the member's files: never in the admin
 * export, deleted when the account's personal data is (purgeMember deletes State.paths[memberId]).
 */
import { createHash } from "node:crypto";
import { ActionError, perform, tableInternals as T, type Member, type Seed, type State } from "../table";
import { EARN_CAP } from "../tableFields";
import { matchDomain, matchOrg } from "../google/compute";
import { workDomain } from "../google/types";
import { cleanPersonName } from "../personName";
import { neverAName } from "../nameWords";
import { seniorityOf } from "../seniority";
import { directoryOf, worldOf } from "./world";
import { personKey } from "./match";
import { pathsOn, who } from "./index";
import type { MemberPaths, SuggestRow, SuggestView } from "./types";

/** The switch: off unless RN_SUGGEST=on (the owner turns it on after a legal check). */
export const suggestOn = () => pathsOn() && ["on", "1", "true"].includes(String(process.env.RN_SUGGEST ?? "").trim().toLowerCase());
const OFF = "Suggested additions aren't on for Merlin yet.";

/** At most this many people a list, and in one add. */
export const SUGGEST_MAX = 50;
export const SUGGEST_ADD_MAX = 25;
/** The member's "no" and "added" keys, each list at most this long. */
export const SUGGEST_KEEP_MAX = 3000;

/** The relationship every suggested person is added with. */
export const SUGGEST_REL = "Decision maker" as const;

type WithSuggest = State & { paths?: Record<string, MemberPaths> };
const mine = (s: State, memberId: string) => (s as WithSuggest).paths?.[memberId]?.suggest;

/** A title that reads as one of the company's own leaders, never a fractional's or an adviser's. */
const NOT_THEIRS = /\b(fractional|interim|advis[eo]r|consultant|consulting|freelance|contractor|part[\s-]time|coach|mentor|board member|investor|student|intern|assistant|former|ex-)\b/i;
const LEADER_WORDS = /\b(founder|co-?founder|owner|president|managing (director|partner)|general manager|partner)\b/i;
export function leaderTitle(title: unknown): boolean {
  const t = String(title ?? "").trim();
  if (!t || t.length > 120 || NOT_THEIRS.test(t)) return false;
  const lv = seniorityOf(t);
  return lv === "C-level" || lv === "VP" || lv === "Head" || LEADER_WORDS.test(t);
}

/** A row's one-way key: the member, the company and the person's name key. Never the name. */
export const suggestKey = (memberId: string, companyId: string, name: string) => `s${createHash("sha256").update(`${memberId}|${companyId}|${personKey(name)}`).digest("base64url").slice(0, 16)}`;

/** Someone of that name, or a decision maker or a leader, is on file at the company (any record, any lock). */
function leaderOnFile(s: State, g: ReturnType<typeof T.graph>, companyId: string, nameK: string): { leader: boolean; same: boolean } {
  let leader = false;
  let same = false;
  for (const p of g.contacts.values()) {
    if (p.companyId !== companyId) continue;
    const n = T.valueOf(p, s, "name");
    const name = n?.status === "live" ? n.value : T.live(p, s, "name");
    if (!name) continue;
    if (personKey(name) === nameK) same = true;
    const rel = T.live(p, s, "relationship");
    if (rel === SUGGEST_REL || leaderTitle(T.live(p, s, "title"))) leader = true;
  }
  return { leader, same };
}

interface Candidate extends SuggestRow {
  /** The internal company id, for the add. */
  internal: string;
}

/**
 * Everyone the member's own two files suggest, as of this state: the rows at companies the member
 * can see, and a count of the rest (locked). Pure over the state; the page and the add both use it,
 * so the add never trusts a name from the page.
 */
export function candidatesIn(seed: Seed, s: State, m: Member): { rows: Candidate[]; locked: number } {
  const files = (s as WithSuggest).paths?.[m.id];
  if (!files?.linkedin && !files?.csv) return { rows: [], locked: 0 };
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const tracks = T.tracksOf(seed, s);
  const dir = directoryOf(seed, s);
  const w = worldOf(seed, s, Date.now());
  const skip = new Set([...(mine(s, m.id)?.skip ?? []), ...(mine(s, m.id)?.added ?? [])]);
  const own = new Set<string>();
  const myDomain = (m.email.split("@")[1] ?? "").toLowerCase();
  if (myDomain && workDomain(m.email, new Set())) own.add(myDomain);
  const meKey = personKey(m.name);
  const raw: { name: string; title: string; company: string | null; email: string | null; from: "linkedin" | "csv" }[] = [
    ...(files.linkedin?.rows ?? []).map((r) => ({ name: `${r.f} ${r.l}`, title: r.p ?? "", company: r.c ?? null, email: r.e ?? null, from: "linkedin" as const })),
    ...(files.csv?.rows ?? []).map((r) => ({ name: r.n, title: r.t ?? "", company: r.c ?? null, email: r.e ?? null, from: "csv" as const })),
  ];
  const out: Candidate[] = [];
  const seen = new Set<string>();
  let locked = 0;
  const lockedSeen = new Set<string>();
  for (const r of raw) {
    if (!leaderTitle(r.title)) continue;
    const clean = cleanPersonName(r.name);
    if ("skip" in clean || neverAName(clean.name)) continue;
    const nameK = personKey(clean.name);
    if (!nameK || nameK === meKey) continue;
    // Another member is no company leader to add, and their own account is theirs to fill.
    if (r.email && w.memberByEmail.has(r.email.toLowerCase())) continue;
    const dom = r.email ? workDomain(r.email, own) : null;
    const companyId = (dom ? matchDomain(dir, dom) : null) ?? (r.company ? matchOrg(dir, r.company) : null);
    if (!companyId) continue;
    const c = g.companies.get(companyId);
    if (!c) continue;
    const geo = T.geoOf(c, s);
    if (geo.country !== "United States" || geo.region === "California") continue;
    const key = suggestKey(m.id, companyId, clean.name);
    if (skip.has(key) || seen.has(key)) continue;
    if (T.leaderOff(s, companyId, clean.name)) continue;
    const on = leaderOnFile(s, g, companyId, nameK);
    if (on.leader || on.same) continue;
    seen.add(key);
    if (T.identityHidden(g, s, idx, tracks, m, companyId)) {
      if (!lockedSeen.has(companyId)) lockedSeen.add(companyId), locked++;
      continue;
    }
    out.push({ key, name: clean.name, title: r.title.trim().slice(0, 80), rel: SUGGEST_REL, company: c.name, companyId: T.pubId(companyId), internal: companyId, from: r.from });
  }
  // One a company: the most senior first (C-level, then founders and owners, then VP and Head).
  const rank = (t: string) => (seniorityOf(t) === "C-level" ? 0 : LEADER_WORDS.test(t) ? 1 : seniorityOf(t) === "VP" ? 2 : 3);
  out.sort((a, b) => a.company.localeCompare(b.company) || rank(a.title) - rank(b.title) || a.name.localeCompare(b.name));
  const one: Candidate[] = [];
  const at = new Set<string>();
  for (const x of out) if (!at.has(x.internal)) at.add(x.internal), one.push(x);
  return { rows: one.slice(0, SUGGEST_MAX), locked };
}

const strip = (r: Candidate): SuggestRow => ({ key: r.key, name: r.name, title: r.title, rel: r.rel, company: r.company, companyId: r.companyId, from: r.from });

/** GET /api/paths?suggest=1. Off: { on: false } with nothing in it. */
export async function suggestView(token: string | null): Promise<SuggestView | null> {
  if (!suggestOn()) return { on: false, rows: [], locked: 0, earnLeft: 0 };
  const w = await who(token);
  if (!w) return null;
  const c = candidatesIn(w.seed, w.s, w.m);
  return { on: true, rows: c.rows.map(strip), locked: c.locked, earnLeft: Math.max(0, EARN_CAP - T.earning(w.s, w.m.id, Date.now()).earned) };
}

const keysOf = (raw: unknown) => (Array.isArray(raw) ? [...new Set(raw.filter((k): k is string => typeof k === "string" && /^s[A-Za-z0-9_-]{16}$/.test(k)))] : []);

/** Add the ticked people (their keys): one member add each, 1 credit each inside the day's cap. */
export async function suggestAdd(token: string | null, keysRaw: unknown): Promise<{ view: SuggestView; message: string; added: number; earned: number }> {
  if (!suggestOn()) throw new ActionError(OFF);
  const keys = keysOf(keysRaw);
  if (!keys.length) throw new ActionError("Tick the people to add first.");
  if (keys.length > SUGGEST_ADD_MAX) throw new ActionError(`Add up to ${SUGGEST_ADD_MAX} at a time.`);
  const r = (await perform(token, { type: "suggestAdd", keys } as never)) as { message: string; added?: number; earned?: number };
  const view = (await suggestView(token))!;
  return { view, message: r.message, added: r.added ?? 0, earned: r.earned ?? 0 };
}

/** Never suggest these again (the member's own "no"). */
export async function suggestSkip(token: string | null, keysRaw: unknown): Promise<SuggestView> {
  if (!suggestOn()) throw new ActionError(OFF);
  const w = await who(token);
  if (!w) throw new ActionError("You're signed out. Sign in again.");
  const keys = keysOf(keysRaw).slice(0, SUGGEST_MAX);
  await T.mutate((s) => {
    const p = (((s as WithSuggest).paths ??= {})[w.m.id] ??= {});
    const sg = (p.suggest ??= { skip: [], added: [] });
    sg.skip = [...new Set([...sg.skip, ...keys])].slice(-SUGGEST_KEEP_MAX);
  });
  return (await suggestView(token))!;
}
