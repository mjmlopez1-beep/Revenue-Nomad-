/**
 * The path finder: from the people a member knows (Contact, their own) and what Merlin knows
 * (World: seats with their dates and the person each belongs to, leaders on file, members), every
 * company the member has a way into and how, ranked. Pure: the server builds both inputs
 * (lib/paths/world.ts, lib/paths/index.ts), the checks build them by hand.
 *
 * A Contact is matched to a person on Merlin only by something precise (lib/paths/match.ts): the
 * same email as a member, a member they have messaged, the same LinkedIn profile as a leader on
 * file, or the same name at the same company. A person on Merlin is the same across companies only
 * through Merlin's own links (a member's seats, the private person key of a seat holder's seats,
 * the same LinkedIn profile on two leader records), never by a name.
 *
 * Ranking: every 1st degree path (someone you know is there, led it, hired for it or held a seat
 * there) scores above every 2nd degree one (51 to 100, and 1 to 49). Within each, the kind of
 * path, then how warm the member is with the person (Hot, Warm, Fading, a LinkedIn connection
 * alone), then how recent it is.
 */
import type { Warmth } from "../google/types";
import type { VoiceStyle } from "../voice";
import { nameCo } from "./match";
import { COMPANY_PATHS_MAX, fromFile, lockedMatchesHidden, type PathKind, type PathSource, type PathView } from "./types";
import { actionOf, lineOf, noteOf, type MeWords, type Parts, type Who } from "./words";

/* ---------- the inputs ---------- */

/** A month as a number: year * 12 + month - 1. */
export const monthIdx = (ym: string | null | undefined): number | null => {
  const m = /^(\d{4})-(\d{2})/.exec(ym ?? "");
  if (!m) {
    const y = /^(\d{4})$/.exec(ym ?? "");
    return y ? Number(y[1]) * 12 : null;
  }
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? Number(m[1]) * 12 + mo - 1 : null;
};
const yearOf = (idx: number | null) => (idx === null ? null : Math.floor(idx / 12));

export interface WSeat {
  id: string;
  companyId: string;
  fn: string | null;
  /** Start and end months (monthIdx); `to` is now for a seat still going, the start for a seat with no end on file. */
  from: number | null;
  to: number | null;
  active: boolean;
  /** The person (WPerson.key) who holds it. */
  person: string;
}
export interface WPerson {
  key: string;
  /** The member it is, when it is one. */
  member: string | null;
  seats: string[];
  /** Their full name when they show in the Fractionals directory (free to every member), else null. */
  shown: string | null;
}
export interface WLeader {
  id: string;
  companyId: string;
  nameKey: string | null;
  slug: string | null;
  /** The relationship on file (free): Decision maker, Hiring for the seat, Reported to... */
  rel: string | null;
  /** The seat it is on, for Hiring for the seat and Reported to. */
  seat: string | null;
}
export interface WCompany {
  id: string;
  name: string;
  /** The kind of company, for a bridge the member can't see: "SaaS". */
  kind: string | null;
}
export interface World {
  nowIdx: number;
  companies: Map<string, WCompany>;
  seats: Map<string, WSeat>;
  seatsAt: Map<string, WSeat[]>;
  persons: Map<string, WPerson>;
  /** nameCo(name key, company) -> people whose seat there carries that name. Two or more: no match. */
  personByNameCo: Map<string, string[]>;
  personOfMember: Map<string, string>;
  /** Lowercase email -> member id. */
  memberByEmail: Map<string, string>;
  /** A member's own LinkedIn profile slug (lib/paths/operators.ts) -> member id; one member a slug, never a Californian. */
  memberBySlug: Map<string, string>;
  leadersAt: Map<string, WLeader[]>;
  /** Profile slug -> the person records on file with that LinkedIn profile, never one in California by their own location. */
  leadersBySlug: Map<string, WLeader[]>;
  leaderByNameCo: Map<string, WLeader[]>;
  /** Profile slugs of people in California by their own location (lib/california.ts): nobody is ever matched by them. */
  caSlugs: Set<string>;
}

/** Someone the member knows, merged across their own sources. */
export interface Contact {
  key: string;
  name: string;
  first: string;
  nameKey: string | null;
  title: string | null;
  /** The company on Merlin they are at now (internal id), from their own entry, or null. */
  companyId: string | null;
  email: string | null;
  slug: string | null;
  linkedin: string | null;
  src: PathSource[];
  /** From the member's Google network or messages (or their LinkedIn export's messages and vouches); null for a LinkedIn connection alone. Orders ways in. */
  warmth: Warmth | null;
  /**
   * The warmth Merlin may SHOW as a relationship band: only from mail and calendar recency (Google,
   * with meetings or emails and the day of the last one) or messages on Merlin. Never from a
   * LinkedIn export, a vouch, a contacts file or a Claude note (owner, 2026-11-25).
   */
  shown?: Warmth | null;
  why: string;
  /** Met (meetings or mail) through Google, not only a saved contact. */
  met: boolean;
  /** The day they connected on LinkedIn (YYYY-MM-DD). */
  connected: string | null;
  /** The member they are, when they are one (by email, or a member the member messaged). */
  member: string | null;
  /** From the member's own Google network, for how strong the relationship is: meetings, emails, both ways, first and last touch (YYYY-MM-DD). */
  meetings?: number;
  emails?: number;
  both?: boolean;
  firstMet?: string | null;
  lastMet?: string | null;
  /** The other keys this person was merged from (their LinkedIn row, their Google contact): the page finds them by any of them. */
  aliases?: string[];
  /** Seats (internal ids) Your network matched this contact to as their holder ("You know this person"). */
  seats?: string[];
  /** A member the member wrote to on Merlin (or who wrote to them): how many messages, the last one's day, and the conversation (the member's own). */
  msgCount?: number;
  msgLast?: string | null;
  conv?: string | null;
  /** From the member's own LinkedIn data export (lib/linkedin): messages each way and the first and last day, never the words. */
  liMsg?: { sent: number; received: number; first: string; last: string };
  /** Vouch flags from the export: r recommended you, R you recommended them, e endorsed you, E you endorsed them. */
  vouch?: string;
  /** A pending LinkedIn invitation, not a connection: weaker than one (out: the member sent it). */
  invited?: { out: boolean };
}

export interface Me {
  memberId: string;
  nameKey: string | null;
  /** The member's own person on Merlin (their seats). */
  person: string | null;
  /** Companies where the member holds a seat now: no way in is needed there. */
  clients: Set<string>;
  /** The member can see this company's name. */
  visible: (companyId: string) => boolean;
  words: Omit<MeWords, "voice">;
  voice: VoiceStyle | null;
  nowMs: number;
}

/* ---------- scoring ---------- */

const BASE: Record<string, number> = {
  hired: 1,
  leads: 0.95,
  "seat-now": 0.92,
  works: 0.8,
  "seat-past": 0.75,
  "overlap-now": 0.95,
  "overlap-past": 0.78,
  "colleague-now": 0.86,
  "colleague-past": 0.62,
  "prevco-now": 0.7,
  "prevco-past": 0.5,
  "prevco-leader": 0.55,
  "client-now": 0.5,
  "client-past": 0.4,
};
const WARMTH_MULT: Record<Warmth, number> = { Hot: 1, Warm: 0.88, Fading: 0.74, Cold: 0.6 };
const YEAR_MS = 365.25 * 86_400_000;

/** How much the member's tie to the person counts: their warmth, else a LinkedIn connection by how long ago. */
export function tieOf(c: Contact, nowMs: number): number {
  if (c.warmth) return WARMTH_MULT[c.warmth];
  // An invitation still pending on LinkedIn: weaker than a connection.
  if (c.invited) return 0.5;
  const d = c.connected ? Date.parse(`${c.connected}T12:00:00Z`) : NaN;
  return Number.isFinite(d) && nowMs - d < 3 * YEAR_MS ? 0.74 : 0.66;
}
/** Recent over old: 1 for now, 8% less a year since, never under 0.55. */
const recency = (yearsAgo: number) => Math.max(0.55, 1 - 0.08 * Math.max(0, yearsAgo));

export function scoreOf(degree: 1 | 2, q: number): number {
  const x = Math.max(0, Math.min(1, q));
  return degree === 1 ? 51 + Math.round(49 * x) : 1 + Math.round(48 * x);
}
/** Strong and Good for someone you know (75 and up is Strong); Good and Worth a try through someone (22 and up is Good). */
const strengthOf = (degree: 1 | 2, score: number): PathView["strength"] => (degree === 1 ? (score >= 75 ? "Strong" : "Good") : score >= 22 ? "Good" : "Worth a try");

/* ---------- finding ---------- */

interface Raw {
  target: string;
  degree: 1 | 2;
  q: number;
  parts: Omit<Parts, "who" | "target">;
  via: Contact | { directory: WPerson; name: string };
}

/** The person on Merlin a contact is, matched precisely, or null. */
export function personOfContact(w: World, c: Contact): string | null {
  if (c.member) return w.personOfMember.get(c.member) ?? null;
  // Their own contact matched to a seat holder they can see by name (lib/google seatMatchesOf): that seat's person.
  for (const id of c.seats ?? []) {
    const p = w.seats.get(id)?.person;
    if (p) return p;
  }
  if (c.nameKey && c.companyId) {
    const hit = w.personByNameCo.get(nameCo(c.nameKey, c.companyId)) ?? [];
    if (new Set(hit).size === 1) return hit[0];
  }
  return null;
}

/** The leader records on Merlin a contact is: the same LinkedIn profile anywhere, or the same name at the same company (one record only). */
export function leadersOfContact(w: World, c: Contact): WLeader[] {
  const out = new Map<string, WLeader>();
  if (c.slug) for (const l of w.leadersBySlug.get(c.slug) ?? []) out.set(l.id, l);
  if (c.nameKey && c.companyId) {
    const hit = w.leaderByNameCo.get(nameCo(c.nameKey, c.companyId)) ?? [];
    if (hit.length === 1) out.set(hit[0].id, hit[0]);
  }
  return [...out.values()];
}

const overlaps = (a: WSeat, b: WSeat) => a.from !== null && b.from !== null && a.to !== null && b.to !== null && a.from <= b.to && b.from <= a.to;

/**
 * Every way in the member has, by company (internal id), best first, at most COMPANY_PATHS_MAX a
 * company; and how many there are in all at each.
 */
export function findPaths(w: World, me: Me, contacts: Contact[]): Map<string, { paths: PathView[]; n: number; first: number }> {
  return findAll(w, me, contacts).byCompany;
}

/** One company a contact is a way into: the best way through them there (lib/paths/intro.ts reads it). */
export interface ContactTarget {
  target: string;
  degree: 1 | 2;
  /** How strong the way in is, 0 to 1 (the kind, the tie, how recent), before the degree's bands (score). */
  q: number;
  score: number;
  strength: PathView["strength"];
  parts: Omit<Parts, "who" | "target">;
}

/**
 * Every way in, both ways round: by company (findPaths), and by the person the member knows, each
 * company they are a way into with the best way through them there, best first (the specific ask
 * for an introduction, lib/paths/intro.ts). Contact keys only: a Fractionals directory member reached
 * through a shared client is in byCompany alone.
 */
export function findAll(w: World, me: Me, contacts: Contact[]): { byCompany: Map<string, { paths: PathView[]; n: number; first: number }>; byContact: Map<string, ContactTarget[]> } {
  const raws: Raw[] = [];
  const nowIdx = w.nowIdx;
  const yearsAgo = (idx: number | null) => (idx === null ? 3 : Math.max(0, (nowIdx - idx) / 12));
  const skipTarget = (t: string) => me.clients.has(t) || !w.companies.has(t);
  const myPerson = me.person;

  for (const c of contacts) {
    if (c.nameKey && c.nameKey === me.nameKey) continue;
    if (c.member && c.member === me.memberId) continue;
    const tie = tieOf(c, me.nowMs);
    const pc = personOfContact(w, c);
    if (pc && pc === myPerson) continue;
    const add = (target: string, degree: 1 | 2, base: number, rec: number, parts: Raw["parts"]) => {
      if (skipTarget(target)) return;
      raws.push({ target, degree, q: base * tie * rec, parts, via: c });
    };

    /* 1st degree: where they are now, the seats they held, the seats they hired for. */
    const leaders = leadersOfContact(w, c);
    if (c.companyId) {
      const dmHere = leaders.some((l) => l.companyId === c.companyId && l.rel === "Decision maker");
      if (c.title && DM_TITLE.test(c.title) && !NOT_DM.test(c.title)) add(c.companyId, 1, BASE.leads, 1, { kind: "leads" });
      else if (dmHere) add(c.companyId, 1, BASE.leads * 0.97, 1, { kind: "leads" });
      else add(c.companyId, 1, BASE.works, 1, { kind: "works" });
    }
    for (const l of leaders) {
      if (l.seat && (l.rel === "Hiring for the seat" || l.rel === "Reported to")) {
        const s = w.seats.get(l.seat);
        add(l.companyId, 1, BASE.hired, recency(s?.active ? 0 : yearsAgo(s?.to ?? s?.from ?? null)), { kind: "hired", fn: s?.fn ?? null, rel: l.rel, year: s?.active ? null : yearOf(s?.from ?? null), ownSeat: l.seat, active: !!s?.active, ...(l.companyId !== c.companyId ? { elsewhere: true } : {}) });
      } else if (l.rel === "Decision maker" && l.companyId !== c.companyId) add(l.companyId, 1, BASE.leads * 0.9, 0.9, { kind: "leads", elsewhere: true });
    }
    const mySeats = pc ? (w.persons.get(pc)?.seats ?? []).map((id) => w.seats.get(id)!).filter(Boolean) : [];
    for (const s of mySeats)
      add(s.companyId, 1, s.active ? BASE["seat-now"] : BASE["seat-past"], s.active ? 1 : recency(yearsAgo(s.to)), { kind: "seat", fn: s.fn, active: s.active, year: yearOf(s.from), ownSeat: s.id });

    /* 2nd degree through the seats someone else holds or held at the target. */
    const bridgeWords = (b: string) => {
      const co = w.companies.get(b);
      if (!co) return "another company";
      // Where they work, as the member's own list has it: but a locked company matched from their file stays unnamed (types.ts fromFile).
      return me.visible(b) || (b === c.companyId && !(lockedMatchesHidden() && fromFile(c.src))) ? co.name : co.kind ? `${/^[aeiou]/i.test(co.kind) ? "an" : "a"} ${co.kind} company` : "another company";
    };
    /** Each other seat X holds at a company other than the bridge: the path's other side. */
    const across = (x: WSeat, b: string, fn: (t: WSeat) => void) => {
      if (x.person === pc || x.person === myPerson) return;
      for (const id of w.persons.get(x.person)?.seats ?? []) {
        const t = w.seats.get(id);
        if (t && t.companyId !== b && t.companyId !== c.companyId) fn(t);
      }
    };
    // They held a seat at B at the same time as someone who holds or held one at the target.
    for (const s of mySeats)
      for (const x of w.seatsAt.get(s.companyId) ?? [])
        if (x.id !== s.id && overlaps(s, x))
          across(x, s.companyId, (t) => {
            const both = s.active && x.active;
            const end = Math.min(s.to!, x.to!);
            // As recent as the time they shared, and as the tie on the other side to the company.
            add(t.companyId, 2, t.active ? BASE["overlap-now"] : BASE["overlap-past"], recency(both ? 0 : yearsAgo(end)) * (t.active ? 1 : recency(yearsAgo(t.to))), {
              kind: "overlap",
              bridge: bridgeWords(s.companyId),
              // They held a seat there, so to them it is a client they had.
              bridgeNote: s.companyId === c.companyId || me.visible(s.companyId) ? bridgeWords(s.companyId) : "one of your past clients",
              fn: t.fn,
              active: t.active,
              year: both ? null : yearOf(Math.max(s.from!, x.from!)),
              togetherEnd: both ? null : yearOf(end),
              tYear: yearOf(t.from),
              otherSeat: t.id,
              bridgeId: s.companyId,
            });
          });
    // They work now where someone who holds or held a seat at the target holds one now (colleague) or held one before (prevco).
    if (c.companyId) {
      const b = c.companyId;
      for (const x of w.seatsAt.get(b) ?? [])
        across(x, b, (t) => {
          if (x.active)
            add(t.companyId, 2, t.active ? BASE["colleague-now"] : BASE["colleague-past"], t.active ? 1 : recency(yearsAgo(t.to)), { kind: "colleague", bridge: bridgeWords(b), fn: t.fn, active: t.active, tYear: yearOf(t.from), otherSeat: t.id, bridgeId: b });
          else
            add(t.companyId, 2, t.active ? BASE["prevco-now"] : BASE["prevco-past"], recency(yearsAgo(x.to)) * (t.active ? 1 : recency(yearsAgo(t.to))), { kind: "prevco", bridge: bridgeWords(b), fn: t.fn, active: t.active, year: yearOf(x.from), tYear: yearOf(t.from), otherSeat: t.id, bridgeId: b });
        });
      // ...or where one of the target's leaders on Merlin also worked (the same LinkedIn profile on both records).
      for (const l of w.leadersAt.get(b) ?? []) {
        if (!l.slug || l.slug === c.slug) continue;
        for (const o of w.leadersBySlug.get(l.slug) ?? []) if (o.companyId !== b) add(o.companyId, 2, BASE["prevco-leader"], 0.9, { kind: "prevco", bridge: bridgeWords(b), leader: true, leaderId: o.id, bridgeId: b });
      }
    }
  }

  /* 2nd degree through a shared client: a member in the Fractionals directory who serves the target. */
  const mine = myPerson ? (w.persons.get(myPerson)?.seats ?? []).map((id) => w.seats.get(id)!).filter(Boolean) : [];
  for (const s of mine)
    for (const x of w.seatsAt.get(s.companyId) ?? []) {
      if (x.person === myPerson) continue;
      const d = w.persons.get(x.person);
      if (!d?.member || !d.shown) continue;
      for (const id of d.seats) {
        const t = w.seats.get(id);
        if (!t || t.companyId === s.companyId || skipTarget(t.companyId)) continue;
        const shared = me.visible(s.companyId) ? (w.companies.get(s.companyId)?.name ?? "a client") : "a client";
        raws.push({ target: t.companyId, degree: 2, q: (t.active ? BASE["client-now"] : BASE["client-past"]) * 0.8 * (t.active ? 1 : recency(yearsAgo(t.to))), parts: { kind: "client", shared, fn: t.fn, active: t.active, year: yearOf(t.from), ownSeat: t.id, bridgeId: s.companyId }, via: { directory: d, name: d.shown } });
      }
    }

  /* The best way through each person at each company, best first. */
  const byTarget = new Map<string, Map<string, Raw>>();
  const viaKey = (r: Raw) => ("key" in r.via ? r.via.key : `d:${r.via.directory.key}`);
  for (const r of raws) {
    let m = byTarget.get(r.target);
    if (!m) byTarget.set(r.target, (m = new Map()));
    const k = viaKey(r);
    const was = m.get(k);
    if (!was || r.degree < was.degree || (r.degree === was.degree && r.q > was.q)) m.set(k, r);
  }
  const out = new Map<string, { paths: PathView[]; n: number; first: number }>();
  const byContact = new Map<string, ContactTarget[]>();
  for (const [target, m] of byTarget) {
    const list = [...m.values()].sort((a, b) => a.degree - b.degree || b.q - a.q || viaKey(a).localeCompare(viaKey(b)));
    const name = me.visible(target) ? (w.companies.get(target)?.name ?? null) : null;
    const paths = list.slice(0, COMPANY_PATHS_MAX).map((r, i) => viewOf(r, name, me, `${i}`));
    out.set(target, { paths, n: list.length, first: list.filter((r) => r.degree === 1).length });
    for (const r of list) {
      if (!("key" in r.via)) continue;
      const score = scoreOf(r.degree, r.q);
      const l = byContact.get(r.via.key);
      const t: ContactTarget = { target, degree: r.degree, q: r.q, score, strength: strengthOf(r.degree, score), parts: r.parts };
      if (l) l.push(t);
      else byContact.set(r.via.key, [t]);
    }
  }
  for (const l of byContact.values()) l.sort((a, b) => b.score - a.score || a.target.localeCompare(b.target));
  return { byCompany: out, byContact };
}

const DM_TITLE =
  /\b(ceo|cfo|coo|cro|cmo|cto|cpo|cio|chief|founder|co-?founder|owner|president|managing (director|partner)|general manager|vp|svp|evp|vice president|head of)\b/i;
const NOT_DM = /\b(assistant|intern|fractional|interim|advisor|adviser|consultant)\b/i;

/**
 * What a way in was found from, by its view (never in an answer: internal ids): the server's
 * ratings (lib/paths/ways.ts) read the seats and the person on each side from it.
 */
export interface PathRaw {
  target: string;
  degree: 1 | 2;
  q: number;
  parts: Raw["parts"];
  contact: Contact | null;
  directory: WPerson | null;
}
export const PATH_RAW = new WeakMap<PathView, PathRaw>();

function viewOf(r: Raw, target: string | null, me: Me, key: string): PathView {
  const c = "key" in r.via ? r.via : null;
  const d = "directory" in r.via ? r.via : null;
  const name = c?.name ?? d!.name;
  const first = c?.first ?? name.trim().split(/\s+/)[0];
  // Their title from the member's own file is their title at the company the file has them at: said only where that is the target.
  const title = r.parts.elsewhere ? null : c?.title ?? null;
  const who: Who = { name, first, title, src: c?.src ?? ["messages"], met: c?.met ?? false };
  if (d) who.src = [];
  const parts: Parts = { ...r.parts, who, target };
  const score = scoreOf(r.degree, r.q);
  const view: PathView = {
    key: `${key}:${r.parts.kind}`,
    kind: r.parts.kind as PathKind,
    degree: r.degree,
    score,
    strength: strengthOf(r.degree, score),
    line: lineOf(parts),
    action: actionOf(parts),
    via: {
      key: c?.key ?? null,
      name,
      first,
      title,
      src: c?.src ?? [],
      warmth: c?.warmth ?? null,
      why: c?.why ?? "In the Fractionals directory",
      email: c?.email ?? null,
      linkedin: c?.linkedin ?? null,
      member: !!(c?.member || d),
    },
    note: noteOf(parts, { ...me.words, voice: me.voice }),
  };
  PATH_RAW.set(view, { target: r.target, degree: r.degree, q: r.q, parts: r.parts, contact: c, directory: d?.directory ?? null });
  return view;
}
