/**
 * Someone you know changed jobs, the server's half (lib/notify/known.ts has the rules and the words):
 * where its people and its new leaders come from, shared by the watch pass (lib/notify/events.ts,
 * the alert) and by Home and Warm paths (`knownFor`, GET /api/table?known=1, the same lines as moves).
 *
 * The people are the member's own LinkedIn connections file and their own contacts CSV
 * (State.paths[memberId]), nothing else. Google (Calendar, Contacts, Gmail) and what the member's own
 * agent saved to their network never feed it: Google stays private to the member (its Limited Use
 * rules), as with Suggested additions (lib/paths/suggest.ts).
 *
 * The new leaders are a leader a company's own website shows now (with the name kept) and a person a
 * member added. A Californian by their own location is never named; at a company the member hasn't
 * opened nobody is named and the company is described by its industry and size only. Server side only.
 */
import { loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "../table";
import { personKey } from "../paths/match";
import { shownName } from "../paths";
import type { MemberPaths } from "../paths/types";
import { coKey, knownLine, knownMoves, type KnownPerson, type NewLeader } from "./known";

type G = ReturnType<typeof T.graph>;

/** How far back Home and Warm paths look for a move (the alert tells each as it happens). */
export const KNOWN_DAYS = 30;
/** The most lines Home and Warm paths carry. */
export const KNOWN_MAX = 5;

const filesOf = (s: State, memberId: string): MemberPaths | undefined => (s as State & { paths?: Record<string, MemberPaths> }).paths?.[memberId];

/** The member has a source Someone you know reads: their LinkedIn connections file or their contacts CSV. */
export const hasKnownSources = (s: State, memberId: string): boolean => {
  const p = filesOf(s, memberId);
  return !!(p?.linkedin?.rows.length || p?.csv?.rows.length);
};

/** The member's own people, from their LinkedIn connections file and their contacts CSV only (never Google). */
export function knownPeopleOf(s: State, m: Pick<Member, "id">): KnownPerson[] {
  const out: KnownPerson[] = [];
  const p = filesOf(s, m.id);
  // "Not a relationship" on Warm paths keeps a person out of this too: their key as Warm paths makes it
  // (lib/paths/index.ts contactsOf), and every other row under the same name with them.
  const away = new Set(p?.away ?? []);
  const awayNames = new Set<string>();
  for (const r of p?.linkedin?.rows ?? []) {
    const name = `${r.f} ${r.l}`.trim();
    const nk = personKey(name);
    if (nk && away.has(`l:${r.u ?? `${shownName(name)}|${r.c ?? ""}`}`)) awayNames.add(nk);
    if (nk) out.push({ name, nameKey: nk, companyId: null, company: r.c ?? null, src: "linkedin" });
  }
  for (const r of p?.csv?.rows ?? []) {
    const nk = personKey(r.n);
    const sn = shownName(r.n);
    if (nk && away.has(`c:${r.e ?? `${sn.toLowerCase()}|${(r.c ?? "").toLowerCase()}`}`)) awayNames.add(nk);
    if (nk) out.push({ name: r.n, nameKey: nk, companyId: null, company: r.c ?? null, src: "csv" });
  }
  return awayNames.size ? out.filter((x) => !awayNames.has(x.nameKey)) : out;
}

/** New leaders whose time `inWin` takes: a leader a company's website shows now (its name kept), or a person a member added. */
export function newLeadersIn(s: State, g: G, inWin: (iso: string | null | undefined) => boolean): NewLeader[] {
  const leaders: NewLeader[] = [];
  for (const x of s.leaderArrivals ?? []) {
    if (!inWin(x.at) || !g.companies.has(x.companyId)) continue;
    const fnRec = s.leaders?.[x.companyId]?.functions?.[x.fn];
    const nk = personKey(fnRec?.name);
    if (!fnRec?.name || !nk) continue;
    leaders.push({ key: `lead:${T.pubId(x.companyId)}:${x.fn}:${x.at.slice(0, 10)}`, companyId: x.companyId, companyName: g.companies.get(x.companyId)?.name ?? "", nameKey: nk, fn: x.fn, at: x.at, californian: fnRec.california === true });
  }
  for (const c of s.contacts) {
    if (!inWin(c.at)) continue;
    const name = s.values[`${c.id}.name`];
    const coId = c.companyId ?? (c.engagementId ? g.engagements.get(c.engagementId)?.companyId : undefined);
    const nk = personKey(name?.status === "live" ? name.value : null);
    if (!coId || !nk || !g.companies.has(coId)) continue;
    leaders.push({ key: `added:${T.pubId(c.id)}`, companyId: coId, companyName: g.companies.get(coId)?.name ?? "", nameKey: nk, fn: null, at: c.at, californian: false });
  }
  return leaders;
}

/** A company's name on Merlin, as coKey reads it, to its id: a source's words that name exactly one company read as it. */
export function companyByName(g: G): (k: string) => string | null {
  const byName = new Map<string, string>();
  for (const [id, c] of g.companies) {
    const k = coKey(c.name);
    if (k) byName.set(k, byName.has(k) ? "" : id);
  }
  return (k) => byName.get(k) || null;
}

/** What a company the member hasn't opened reads as: "a locked SaaS company with 51-200 employees". Never its name. */
export function lockedWords(g: G, s: State, companyId: string): string {
  const c = g.companies.get(companyId);
  const ind = T.live(c, s, "industry");
  const emp = T.live(c, s, "employees");
  return `a locked ${ind ? `${ind} ` : ""}company${emp ? ` with ${emp} employees` : ""}`;
}

/** One move as Home and Warm paths draw it. */
export interface KnownMoveWire {
  /** The event's key (the alert tells each once by it). */
  id: string;
  /** The company's public id. */
  company: string;
  /** The member can see the company's name. False: the line names nobody and describes the company. */
  named: boolean;
  /** knownLine's words. */
  line: string;
  fn: string | null;
  at: string;
}

/** GET /api/table?known=1. `sources`: the member brought in a LinkedIn file or a contacts CSV. */
export interface KnownView {
  sources: boolean;
  list: KnownMoveWire[];
}

/** The member's moves of the last `days`, newest first, at most KNOWN_MAX. Null when the token is nobody's. */
export async function knownFor(token: string | null, nowMs = Date.now(), days = KNOWN_DAYS): Promise<KnownView | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  if (!m) return null;
  return knownOf(seed, s, m, nowMs, days);
}

/** knownFor for a member in hand (the tests call it with a state of their own). */
export function knownOf(seed: Seed, s: State, m: Member, nowMs = Date.now(), days = KNOWN_DAYS): KnownView {
  if (!hasKnownSources(s, m.id)) return { sources: false, list: [] };
  const sinceMs = nowMs - days * 86_400_000;
  const inWin = (iso: string | null | undefined) => {
    const ms = Date.parse(iso ?? "");
    return Number.isFinite(ms) && ms > sinceMs && ms <= nowMs;
  };
  const g = T.graph(seed, s);
  const leaders = newLeadersIn(s, g, inWin);
  if (!leaders.length) return { sources: true, list: [] };
  const idx = T.memberIndex(seed, s);
  const tracks = T.tracksOf(seed, s);
  const named = (companyId: string) => (T.identityHidden(g, s, idx, tracks, m, companyId) ? null : g.companies.get(companyId)?.name || null);
  const list = knownMoves(knownPeopleOf(s, m), leaders, personKey(m.name), companyByName(g))
    .sort((a, b) => (a.leader.at < b.leader.at ? 1 : a.leader.at > b.leader.at ? -1 : 0))
    .slice(0, KNOWN_MAX)
    .map((mv): KnownMoveWire => {
      const name = named(mv.leader.companyId);
      return { id: mv.leader.key, company: T.pubId(mv.leader.companyId), named: !!name, line: knownLine(mv, name, name ? null : lockedWords(g, s, mv.leader.companyId)), fn: mv.leader.fn, at: mv.leader.at };
    });
  return { sources: true, list };
}
