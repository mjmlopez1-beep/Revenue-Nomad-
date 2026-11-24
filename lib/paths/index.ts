/**
 * Smart ways in, on the server (lib/paths/types.ts says what is kept and why): the member's
 * LinkedIn import and its deletion, the member's own people merged across their LinkedIn, Google
 * network and messages, and their ways in (lib/paths/find.ts) for the page, a record and the
 * connector.
 *
 * Every read here is for the signed-in member's own entry. Nothing builds anything for another
 * member or an admin; the connector gets counts only (pathsLine, accountPathsLine).
 *
 * The sources are independent (the owner's decision): the LinkedIn connections file and a contacts
 * CSV work without Google, and Google without them; each alone gives people you know and ways in,
 * and together they merge (contactsOf). Google's part still needs Your network (RN_GOOGLE=1). The
 * whole of it switches off with RN_PATHS=off: then every answer is { on: false } and nothing shows.
 */
import { ActionError, loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "../table";
import { companiesOf, selfTest } from "../google";
import { ownSeatTest } from "../google/odds";
import { matchDomain, matchOrg } from "../google/compute";
import { googleConfigured } from "../google/config";
import { networkOn, whenWords, workDomain, type MemberNetwork, type Warmth } from "../google/types";
import { crystalCompanyIds, crystalRowsOf } from "../radar";
import type { RadarSentRow } from "../radar/types";
import { companyFacts } from "../radar/signals";
import { icpIsEmpty, inIcp } from "../radar/match";
import { fnKnow } from "../leaders/types";
import { COMPANY_PRICE_SAY } from "../tableFields";
import { STRENGTH_WORDS, strengthLine } from "../google/types";
import { FIT_WEIGHT, INTRO_NOTE_MAX, INTRO_TARGETS_MAX, askPerson, askTo, fitWords, howThey, howYou, whyLine, type IntroAskLine, type IntroFacts, type IntroPlanView, type IntroTargetView, type ListFit } from "./intro";
import { alertMatches, type SavedSearch } from "../mcp/alerts";
import { clientKinds, myWords } from "../partners";
import { styleOf, type VoiceProfile } from "../voice";
import { parseConnections, parseContacts, CSV_PROBLEM_WORDS, CONTACTS_PROBLEM_WORDS } from "./csv";
import { findAll, leadersOfContact, type Contact, type ContactTarget, type Me, type World } from "./find";
import { firstWord, personKey } from "./match";
import { cleanPersonName } from "../personName";
import { directoryOf, worldOf } from "./world";
import { tieWarmth, tieWords, vouchKey } from "../linkedin/warmth";
import { forgetSource } from "./plan";
import {
  AWAY_MAX, FILE_MAX_BYTES, IMPORTS_DAILY, TARGETS_MAX, fromFile, lockedMatchesHidden, lockedWaysWords, namesOnlyWords, waysWords,
  type CompanyPathsView, type ContactRow, type KnownPersonView, type KnownView, type LinkedInRow, type MemberPaths, type PathsAnswer, type PathsState, type PathView, type TargetView,
} from "./types";

/**
 * People you know and ways in are on (RN_PATHS, on unless set to "off"). They need no Google: the
 * member's LinkedIn file and contacts CSV are sources of their own. Google's part is Your network's
 * (networkOn, RN_GOOGLE=1).
 */
export const pathsOn = () => process.env.RN_PATHS !== "off";
const OFF = "Ways in aren't on for Merlin yet.";

const DAY = 86_400_000;
const SIGNED_OUT = "You're signed out. Sign in again.";

type WithPaths = State & { paths?: PathsState; network?: Record<string, MemberNetwork>; voice?: Record<string, VoiceProfile> };
const pathsOf = (s: State, id: string): MemberPaths | undefined => (s as WithPaths).paths?.[id];
const allPaths = (s: State) => ((s as WithPaths).paths ??= {});

export async function who(token: string | null): Promise<{ seed: Seed; s: State; m: Member } | null> {
  if (!token) return null;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  return m ? { seed, s, m } : null;
}

const importsToday = (p: MemberPaths | undefined, nowMs: number) => (p?.imports ?? []).filter((at) => nowMs - Date.parse(at) < DAY).length;

/* ---------- the import ---------- */

/** The older file's company, title, email and day for each profile link also in the new file (by link only, never by name). */
export function carryOver(next: LinkedInRow[], old: LinkedInRow[]): LinkedInRow[] {
  const was = new Map<string, LinkedInRow>();
  for (const o of old) if (o.u && (o.c || o.e || o.p)) was.set(o.u, o);
  return next.map((x) => {
    const o = x.u ? was.get(x.u) : undefined;
    if (!o) return x;
    return { ...x, ...(o.c && !x.c ? { c: o.c } : {}), ...(o.p && !x.p ? { p: o.p } : {}), ...(o.e && !x.e ? { e: o.e } : {}), ...(o.d && !x.d ? { d: o.d } : {}) };
  });
}

/**
 * The member's own Connections.csv: read, cleaned (lib/paths/csv.ts) and kept for them alone. A
 * new file replaces the last one; a names-only file keeps what the last one said about the same profile
 * links (carryOver). IMPORTS_DAILY uploads in any rolling 24 hours.
 */
export async function importConnections(token: string | null, text: unknown, nowMs = Date.now()): Promise<{ answer: PathsAnswer; message: string }> {
  if (!pathsOn()) throw new ActionError(OFF);
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  if (typeof text !== "string" || !text) throw new ActionError(CSV_PROBLEM_WORDS.empty);
  if (text.length > FILE_MAX_BYTES) throw new ActionError("That file is larger than LinkedIn's Connections.csv can be. Pick Connections.csv from the export.");
  if (importsToday(pathsOf(w.s, w.m.id), nowMs) >= IMPORTS_DAILY) throw new ActionError(`That's ${IMPORTS_DAILY} uploads today, the most in a day. Try again tomorrow.`);
  const r = parseConnections(text);
  if (!r.ok) throw new ActionError(CSV_PROBLEM_WORDS[r.problem]);
  const at = new Date(nowMs).toISOString();
  await T.mutate((s) => {
    const all = allPaths(s);
    const p = (all[w.m.id] ??= {});
    if (importsToday(p, nowMs) >= IMPORTS_DAILY) throw new ActionError(`That's ${IMPORTS_DAILY} uploads today, the most in a day. Try again tomorrow.`);
    p.imports = [...(p.imports ?? []).filter((x) => nowMs - Date.parse(x) < DAY), at];
    // A names-only file (LinkedIn's from December 2026) over an older file: keep what the older file said about
    // the same profile (company, title, email, connected on), so a new upload never loses what Merlin already had.
    const rows = r.namesOnly && p.linkedin?.rows.length ? carryOver(r.rows, p.linkedin.rows) : r.rows;
    const keptNames = !!r.namesOnly && rows.every((x) => !x.c && !x.e);
    p.linkedin = { at, rows, skipped: r.skipped, ...(keptNames ? { namesOnly: true as const } : {}) };
  });
  const answer = (await pathsView(token, nowMs))!;
  const n = r.rows.length;
  const added = `Added ${n.toLocaleString("en-US")} ${n === 1 ? "connection" : "connections"}. Only you see them.`;
  // A names-only file (LinkedIn's from December 2026): said plainly, with how many its profile links placed.
  const li = answer.on ? answer.linkedin : null;
  return { answer, message: r.namesOnly ? `${added} ${namesOnlyWords(li?.byLink ?? 0, networkOn() && googleConfigured())}` : added };
}

/**
 * The member's own contacts CSV: only the columns they picked (the page sends the file
 * lib/paths/csv.ts pickColumns wrote), read and cleaned (parseContacts) and kept for them alone. A
 * new file replaces the last one. It shares the daily upload limit with the LinkedIn file.
 */
export async function importContacts(token: string | null, text: unknown, nowMs = Date.now()): Promise<{ answer: PathsAnswer; message: string }> {
  if (!pathsOn()) throw new ActionError(OFF);
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  if (typeof text !== "string" || !text) throw new ActionError(CONTACTS_PROBLEM_WORDS.empty);
  if (text.length > FILE_MAX_BYTES) throw new ActionError("That file is too large. Pick a CSV under 8 MB, or split it in two.");
  const limit = `That's ${IMPORTS_DAILY} uploads today, the most in a day. Try again tomorrow.`;
  if (importsToday(pathsOf(w.s, w.m.id), nowMs) >= IMPORTS_DAILY) throw new ActionError(limit);
  const r = parseContacts(text);
  if (!r.ok) throw new ActionError(CONTACTS_PROBLEM_WORDS[r.problem]);
  const at = new Date(nowMs).toISOString();
  await T.mutate((s) => {
    const p = (allPaths(s)[w.m.id] ??= {});
    if (importsToday(p, nowMs) >= IMPORTS_DAILY) throw new ActionError(limit);
    p.imports = [...(p.imports ?? []).filter((x) => nowMs - Date.parse(x) < DAY), at];
    p.csv = { at, rows: r.rows, skipped: r.skipped };
  });
  const answer = (await pathsView(token, nowMs))!;
  const n = r.rows.length;
  return { answer, message: `Added ${n.toLocaleString("en-US")} ${n === 1 ? "contact" : "contacts"}. Only you see them.` };
}

/** Delete the contacts CSV and everything worked out from it (its ways in, plans through it). */
export async function deleteContacts(token: string | null): Promise<PathsAnswer> {
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  await T.mutate((s) => {
    const all = allPaths(s);
    forgetSource(s.routes, w.m.id, "csv");
    const p = all[w.m.id];
    if (!p) return;
    delete p.csv;
    if (!p.linkedin && !p.lix && !(p.imports ?? []).length && !(p.away ?? []).length) delete all[w.m.id];
  });
  return (await pathsView(token))!;
}

/**
 * "Not a relationship" on someone the member knows (their own key, KnownPersonView.key), or its
 * Undo. Remembered across reads; the person leaves the member's ways in. Nothing else changes.
 */
export async function setAway(token: string | null, key: unknown, on: boolean): Promise<KnownView | { on: false }> {
  if (!pathsOn()) throw new ActionError(OFF);
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  const k = typeof key === "string" ? key.slice(0, 300) : "";
  const all = contactsOf(w.seed, w.s, w.m).contacts;
  const hit = all.find((c) => c.key === k || (c.aliases ?? []).includes(k));
  if (!hit) throw new ActionError("That person isn't in what you brought in any more. Refresh the page.");
  const keys = [hit.key, ...(hit.aliases ?? [])];
  await T.mutate((s) => {
    const p = (allPaths(s)[w.m.id] ??= {});
    const rest = (p.away ?? []).filter((x) => !keys.includes(x));
    p.away = on ? [...rest, hit.key].slice(-AWAY_MAX) : rest;
    if (!p.away.length) delete p.away;
  });
  return (await knownView(token))!;
}

/** Delete the import and everything worked out from it. The daily upload count stays (it is not from the file). */
export async function deleteConnections(token: string | null): Promise<PathsAnswer> {
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  await T.mutate((s) => {
    const all = allPaths(s);
    const p = all[w.m.id];
    // Your way in (lib/paths/plan.ts): a plan whose route went through a LinkedIn connection goes with the file.
    forgetSource(s.routes, w.m.id, "linkedin");
    if (!p) return;
    delete p.linkedin;
    if (!p.csv && !p.lix && !(p.imports ?? []).length && !(p.away ?? []).length) delete all[w.m.id];
  });
  return (await pathsView(token))!;
}

/* ---------- the member's own people ---------- */

/** A name as it reads: pronouns, nicknames and credentials out ("Pat Sample, CPA" is Pat Sample). */
export const shownName = (raw: string) => {
  const c = cleanPersonName(raw);
  return "name" in c ? c.name : raw.replace(/\s+/g, " ").trim();
};
const linkedinUrl = (slug: string) => `https://www.linkedin.com/in/${encodeURIComponent(slug)}`;
const lastWords = (iso: string | undefined, nowMs: number) => (iso ? whenWords(iso.slice(0, 10), nowMs) : null);

/** A member the member wrote to on Merlin: how warm, by the last message either way. */
function messageWarmth(lastIso: string, nowMs: number): Warmth {
  const days = (nowMs - Date.parse(lastIso)) / DAY;
  return days <= 60 ? "Hot" : days <= 270 ? "Warm" : "Fading";
}

/** LinkedIn connections and Google contacts at companies on Merlin, plus the members the member has messaged. One entry a person. */
export function contactsOf(seed: Seed, s: State, m: Member, nowMs = Date.now()): { contacts: Contact[]; matched: number; csvMatched: number; byLink: number } {
  const w = worldOf(seed, s, nowMs);
  const dir = directoryOf(seed, s);
  const own = new Set<string>();
  const myDomain = (m.email.split("@")[1] ?? "").toLowerCase();
  if (myDomain && workDomain(m.email, new Set())) own.add(myDomain);
  const idx = T.memberIndex(seed, s);
  const out = new Map<string, Contact>();
  const byNameCo = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const put = (c: Contact) => {
    const nk = c.nameKey && c.companyId ? `${c.nameKey}|${c.companyId}` : null;
    const hitKey = (c.email && byEmail.get(c.email)) || (nk && byNameCo.get(nk)) || (c.member && out.has(`m:${c.member}`) ? `m:${c.member}` : null);
    const was = hitKey ? out.get(hitKey) : undefined;
    if (was) {
      if (c.key !== was.key && !(was.aliases ??= []).includes(c.key)) was.aliases.push(c.key);
      was.meetings ??= c.meetings;
      was.emails ??= c.emails;
      was.both ??= c.both;
      was.firstMet ??= c.firstMet;
      if (c.seats?.length) was.seats = [...new Set([...(was.seats ?? []), ...c.seats])];
      was.lastMet ??= c.lastMet;
      for (const x of c.src) if (!was.src.includes(x)) was.src.push(x);
      // Google's warmth is from real meetings and mail; a member's messages say the same of Merlin.
      if (c.warmth && (!was.warmth || ["Hot", "Warm", "Fading", "Cold"].indexOf(c.warmth) < ["Hot", "Warm", "Fading", "Cold"].indexOf(was.warmth))) {
        was.warmth = c.warmth;
        was.why = c.why;
      }
      was.met ||= c.met;
      was.title ??= c.title;
      was.companyId ??= c.companyId;
      was.email ??= c.email;
      was.slug ??= c.slug;
      was.linkedin ??= c.linkedin;
      was.connected ??= c.connected;
      was.member ??= c.member;
      was.nameKey ??= c.nameKey;
      was.msgCount ??= c.msgCount;
      was.msgLast ??= c.msgLast;
      was.conv ??= c.conv;
      was.liMsg ??= c.liMsg;
      was.vouch ??= c.vouch;
      if (was.invited && !c.invited) delete was.invited;
      return;
    }
    out.set(c.key, c);
    if (nk) byNameCo.set(nk, c.key);
    if (c.email) byEmail.set(c.email, c.key);
  };

  // Members the member has written to on Merlin, or who wrote to them (both ways, not blocked).
  for (const cv of s.conversations ?? []) {
    if (cv.a !== m.id && cv.b !== m.id) continue;
    if (cv.blockedBy || !cv.messages.some((x) => !x.removed)) continue;
    const other = cv.a === m.id ? cv.b : cv.a;
    const om = idx.byId.get(other);
    if (!om) continue;
    const last = cv.messages[cv.messages.length - 1]?.at ?? cv.createdAt;
    const warmth = messageWarmth(last, nowMs);
    const c: Contact = {
      key: `m:${other}`, name: om.name, first: firstWord(om.name), nameKey: personKey(om.name), title: null, companyId: null, email: om.email?.toLowerCase() ?? null,
      slug: null, linkedin: null, src: ["messages"], warmth, why: `Messages on Merlin, last ${lastWords(last, nowMs) ?? "a while ago"}`, met: true, connected: null, member: other,
      msgCount: cv.messages.filter((x) => !x.removed).length, msgLast: last.slice(0, 10), conv: cv.id,
    };
    const was = out.get(c.key);
    if (!was || ["Hot", "Warm", "Fading"].indexOf(warmth) < ["Hot", "Warm", "Fading"].indexOf(was.warmth ?? "Fading")) {
      out.set(c.key, c);
      if (c.email) byEmail.set(c.email, c.key);
    }
  }

  // The member's own Google network: people at companies on Merlin, not set aside, not hidden, never the member themself.
  const n = (s as WithPaths).network?.[m.id];
  const self = selfTest(m, n);
  const g0 = T.graph(seed, s);
  const seatIdOf = (companyId: string, pub: string) => [...g0.engagements.values()].find((e) => e.companyId === companyId && T.pubId(e.id) === pub)?.id ?? null;
  if (networkOn() && n)
    // With the member: their own contacts who hold a seat they can see by name are placed at those companies ("You know this person").
    for (const co of companiesOf(seed, s, n, nowMs, m)) {
      if (co.set) continue;
      for (const p of co.people) {
        if (p.hidden || !p.name || self(p)) continue;
        const email = p.email?.toLowerCase() ?? null;
        // Someone placed here only as the seat holder they are ("You know this person"): the seat, not a job here.
        const seat = p.seat ? seatIdOf(co.internal, p.seat.id) : null;
        put({
          key: `g:${p.key}`, name: p.name, first: firstWord(p.name), nameKey: personKey(p.name), title: p.title, companyId: seat ? null : co.internal, email, slug: null, linkedin: null,
          ...(seat ? { seats: [seat] } : {}),
          src: ["google"], warmth: p.warmth, why: p.why, met: p.meetings > 0 || p.emails > 0, connected: null, member: email ? (w.memberByEmail.get(email) ?? null) : null,
          meetings: p.meetings, emails: p.emails, both: p.both, firstMet: p.first, lastMet: p.last,
        });
      }
    }

  // The member's LinkedIn connections. The company by the email's website first, else its exact name.
  // A row with neither (LinkedIn's files from December 2026 have names and profile links only) is
  // placed by its profile link alone, never by its name (linkMatch).
  const rows: LinkedInRow[] = pathsOf(s, m.id)?.linkedin?.rows ?? [];
  // The member's own LinkedIn data export (lib/linkedin): messages each way and vouches, by profile link (a vouch by exact name and company).
  const lix = pathsOf(s, m.id)?.lix;
  const warmBy = new Map((lix?.warm ?? []).map((x) => [x.profileSlug, x]));
  const vouchOf = (r: { u?: string; f: string; l: string; c?: string }) => lix?.vouch?.[vouchKey(r)];
  let matched = 0;
  let byLink = 0;
  for (const r of rows) {
    const name = shownName(`${r.f} ${r.l}`);
    const email = r.e ?? null;
    const dom = email ? workDomain(email, own) : null;
    let companyId = (dom ? matchDomain(dir, dom) : null) ?? matchOrg(dir, r.c);
    let member = email ? (w.memberByEmail.get(email) ?? null) : null;
    const link = !r.c && !email && r.u ? linkMatch(w, r.u, m.id) : null;
    if (link) {
      companyId = link.companyId;
      member = link.member;
      byLink++;
    }
    if (companyId) matched++;
    // Someone at no company on Merlin and not a member is no way in: kept in the file, left out here.
    // One matched by their profile link to people on file at more than one company stays in: their records give the ways in.
    if (!companyId && !member && !link) continue;
    const lw = r.u ? warmBy.get(r.u) : undefined;
    const vf = vouchOf(r);
    const tie = tieWords(lw, vf, nowMs);
    put({
      key: `l:${r.u ?? `${name}|${r.c ?? ""}`}`, name, first: firstWord(name), nameKey: personKey(name), title: r.p ?? null, companyId, email, slug: r.u ?? null,
      linkedin: r.u ? linkedinUrl(r.u) : null, src: ["linkedin"], warmth: tieWarmth(lw, vf, nowMs), why: tie ?? (r.d ? `LinkedIn connection since ${r.d.slice(0, 4)}` : "LinkedIn connection"), met: false,
      connected: r.d ?? null, member,
      ...(lw ? { liMsg: { sent: lw.sent, received: lw.received, first: lw.first, last: lw.last } } : {}),
      ...(vf ? { vouch: vf } : {}),
    });
  }

  // Pending invitations from the export: weaker ties than connections, placed by their profile link alone (linkMatch), never by a name.
  const connected = new Set(rows.map((r) => r.u).filter(Boolean));
  for (const inv of lix?.invites ?? []) {
    if (connected.has(inv.u)) continue;
    const link = linkMatch(w, inv.u, m.id);
    if (!link) continue;
    const name = shownName(inv.n);
    const lw = warmBy.get(inv.u);
    const vf = lix?.vouch?.[inv.u];
    const tie = tieWords(lw, vf, nowMs);
    put({
      key: `i:${inv.u}`, name, first: firstWord(name), nameKey: personKey(name), title: null, companyId: link.companyId, email: null, slug: inv.u, linkedin: linkedinUrl(inv.u),
      src: ["linkedin"], warmth: tieWarmth(lw, vf, nowMs), why: [inv.out ? "You invited them on LinkedIn, not connected yet" : "Invited you on LinkedIn, not connected yet", tie].filter(Boolean).join(" · "), met: false,
      connected: null, member: link.member, invited: { out: inv.out },
      ...(lw ? { liMsg: { sent: lw.sent, received: lw.received, first: lw.first, last: lw.last } } : {}),
      ...(vf ? { vouch: vf } : {}),
    });
  }

  // The member's own contacts CSV: the company by the email's website first, else its exact name. No Google needed.
  const crows: ContactRow[] = pathsOf(s, m.id)?.csv?.rows ?? [];
  let csvMatched = 0;
  for (const r of crows) {
    const name = shownName(r.n);
    const email = r.e ?? null;
    const dom = email ? workDomain(email, own) : null;
    const companyId = (dom ? matchDomain(dir, dom) : null) ?? (r.c ? matchOrg(dir, r.c) : null);
    if (companyId) csvMatched++;
    const member = email ? (w.memberByEmail.get(email) ?? null) : null;
    if (!companyId && !member) continue;
    put({
      key: `c:${email ?? `${name.toLowerCase()}|${(r.c ?? "").toLowerCase()}`}`, name, first: firstWord(name), nameKey: personKey(name), title: r.t ?? null, companyId, email, slug: null,
      linkedin: null, src: ["csv"], warmth: null, why: "In your contacts file", met: false, connected: null, member,
    });
  }
  return { contacts: [...out.values()], matched, csvMatched, byLink };
}

/**
 * Where a connection with no company and no email is, by their profile link alone (never their
 * name): the same LinkedIn profile as person records on file (a leader, a decision maker, who hired
 * for a seat) or as a member's own profile. Their company when those records are at exactly one
 * company, else none (the records still give their ways in, lib/paths/find.ts leadersOfContact);
 * the member when the profile is a member's. Nobody in California by their own location (the
 * world leaves their links out), never the member themself. Only the place is taken from the
 * records: their name, title, email and LinkedIn cells keep their own locks, and the contact keeps
 * the member's own words (the name in their file, and no title).
 */
export function linkMatch(w: World, slug: string, selfId: string): { companyId: string | null; member: string | null } | null {
  if (w.caSlugs.has(slug)) return null;
  const recs = w.leadersBySlug.get(slug) ?? [];
  const mem = w.memberBySlug.get(slug) ?? null;
  const member = mem && mem !== selfId ? mem : null;
  if (!recs.length && !member) return null;
  const at = new Set(recs.map((l) => l.companyId));
  return { companyId: at.size === 1 ? [...at][0] : null, member };
}

/** The member's "Not a relationship" keys. */
const awayOf = (s: State, memberId: string) => new Set(pathsOf(s, memberId)?.away ?? []);
const isAway = (c: Contact, away: Set<string>) => away.has(c.key) || (c.aliases ?? []).some((k) => away.has(k));

/* ---------- the member's ways in ---------- */

export interface Found {
  byCompany: Map<string, { paths: PathView[]; n: number; first: number }>;
  /** Contact key -> the companies they are a way into, best first (the specific ask, introPlansOf). */
  byContact: Map<string, ContactTarget[]>;
  contacts: Map<string, Contact>;
  matched: number;
  csvMatched: number;
  /** LinkedIn connections placed by their profile link alone (linkMatch). A count only. */
  byLink: number;
  me: Me;
  /** Locked companies (internal ids) whose ways in from the member's own files are held back (types.ts fromFile): counted, never shown. */
  lockedWays: Set<string>;
}
const found = new WeakMap<State, Map<string, Found>>();

function meOf(seed: Seed, s: State, m: Member, nowMs: number): Me {
  const w = worldOf(seed, s, nowMs);
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const tracks = T.tracksOf(seed, s);
  const person = w.personOfMember.get(m.id) ?? null;
  const clients = new Set<string>();
  for (const id of person ? (w.persons.get(person)?.seats ?? []) : []) {
    const seat = w.seats.get(id);
    if (seat?.active) clients.add(seat.companyId);
  }
  const prof = s.profiles[m.id] ?? {};
  const fn = prof.function && prof.function !== "Other" && prof.function !== "Executive" ? prof.function : null;
  const seen = new Map<string, boolean>();
  return {
    memberId: m.id,
    nameKey: personKey(m.name),
    person,
    clients,
    visible: (id) => {
      let v = seen.get(id);
      if (v === undefined) seen.set(id, (v = !T.identityHidden(g, s, idx, tracks, m, id)));
      return v;
    },
    words: { name: m.name, as: myWords(prof.title || (m.title === "Member" ? "" : m.title), prof.function), clients: clientKinds(prof.icp), fn },
    voice: (s as WithPaths).voice?.[m.id] ? styleOf((s as WithPaths).voice![m.id]) : null,
    nowMs,
  };
}

/** The member's ways in, once per state and day. */
export function foundFor(seed: Seed, s: State, m: Member, nowMs: number): Found {
  let per = found.get(s);
  if (!per) found.set(s, (per = new Map()));
  // Google's part comes and goes with Your network (RN_GOOGLE): the answer is kept per switch too.
  const hide = lockedMatchesHidden();
  const k = `${m.id}:${new Date(nowMs).toISOString().slice(0, 10)}:${networkOn() ? "g" : "-"}:${hide ? "h" : "s"}`;
  let hit = per.get(k);
  if (!hit) {
    const got = contactsOf(seed, s, m, nowMs);
    // Someone the member said is not a relationship is no way in.
    const away = awayOf(s, m.id);
    const contacts = got.contacts.filter((c) => !isAway(c, away));
    const me = meOf(seed, s, m, nowMs);
    const world = worldOf(seed, s, nowMs);
    const all = findAll(world, me, contacts);
    // A locked company keeps only the ways in that come from Google, messages or the directory; those
    // through someone from the member's own files wait until it is opened, and are only counted.
    const files = new Set(hide ? contacts.filter((c) => fromFile(c.src)).map((c) => c.key) : []);
    const lockedWays = new Set<string>();
    for (const [k, l] of all.byContact) if (files.has(k)) for (const t of l) if (!me.visible(t.target)) lockedWays.add(t.target);
    for (const [id, x] of all.byCompany) if (!lockedWays.has(id) && !me.visible(id) && x.paths.some((p) => !!p.via.key && files.has(p.via.key))) lockedWays.add(id);
    let byCompany = all.byCompany;
    if (lockedWays.size) {
      const rest = findAll(world, me, contacts.filter((c) => !files.has(c.key))).byCompany;
      byCompany = new Map();
      for (const [id, x] of all.byCompany) {
        if (!lockedWays.has(id)) byCompany.set(id, x);
        else if (rest.has(id)) byCompany.set(id, rest.get(id)!);
      }
    }
    const byContact = new Map<string, ContactTarget[]>();
    for (const [k, l] of all.byContact) {
      const keep = files.has(k) ? l.filter((t) => me.visible(t.target)) : l;
      if (keep.length) byContact.set(k, keep);
    }
    hit = { byCompany, byContact, contacts: new Map(contacts.map((c) => [c.key, c])), matched: got.matched, csvMatched: got.csvMatched, byLink: got.byLink, me, lockedWays };
    if (per.size > 2000) per.clear();
    per.set(k, hit);
  }
  return hit;
}

/** Saved views a company matches by free facts: an open role or a seat there in the view's function, the company's facts in its lists. */
export function viewsMatching(seed: Seed, s: State, views: SavedSearch[], companyId: string): string | null {
  if (!views.length) return null;
  const g = T.graph(seed, s);
  const c = g.companies.get(companyId);
  if (!c) return null;
  const engs = [...g.engagements.values()].filter((e) => e.companyId === companyId);
  const facts = { industry: T.live(c, s, "industry"), employees: T.live(c, s, "employees"), revenue: T.live(c, s, "revenue"), hq: T.live(c, s, "hq"), ...T.geoOf(c, s) };
  const past = engs.filter((e) => !!T.live(e, s, "operator")).length;
  for (const v of views) {
    const { hiredFn, hiredWithin: _w, ...rest } = v; // eslint-disable-line @typescript-eslint/no-unused-vars
    const plain: SavedSearch = { ...rest, ...(hiredFn?.length ? { functions: hiredFn } : {}) };
    const fns = engs.length ? engs.map((e) => T.fnOf(e, s)) : [null];
    if (fns.some((fn) => alertMatches(plain, { function: fn, ...facts, pastHires: past }))) return v.name;
  }
  return null;
}

export const factsOf = (seed: Seed, s: State, id: string) => {
  const c = T.graph(seed, s).companies.get(id);
  return [T.live(c, s, "industry"), T.live(c, s, "employees")].filter(Boolean).join(" · ");
};

/* ---------- the specific ask: who someone can introduce the member to ---------- */

const ROLE_HEAD = /^\s*(new open role|open role)\s*:\s*/i;
/** A Crystal Ball row's line as a clause after the company: "hired a fractional CMO 1 month ago", "posted an open VP Sales role". */
export function nowClause(row: RadarSentRow | undefined): string | null {
  const head = (row?.l ?? "").split(" · ")[0].trim();
  if (!row || !head) return null;
  if (row.kind === "role") {
    const t = head.replace(ROLE_HEAD, "").replace(/\s*[([{].*$/, "").trim();
    return t && !/\d{2,}|[$€£]/.test(t) ? `posted an open ${t} role` : "posted an open fractional role";
  }
  if (row.kind === "funding") return "just raised a round";
  return /^[A-Z][a-z]/.test(head) ? head.charAt(0).toLowerCase() + head.slice(1) : head;
}
/** The way in's strength line: from the member's own Google counts, their messages, or their LinkedIn file. */
function strengthOf(c: Contact, nowMs: number): string {
  if (c.warmth && ((c.meetings ?? 0) > 0 || (c.emails ?? 0) > 0)) return strengthLine({ meetings: c.meetings, emails: c.emails, both: c.both, first: c.firstMet, last: c.lastMet, warmth: c.warmth }, nowMs);
  if (c.warmth) return `${c.why} · ${STRENGTH_WORDS[c.warmth]}`;
  return `${c.why} · Not met yet`;
}

/**
 * For each person the member knows, the companies in the member's own list (their Crystal Ball,
 * a saved view, their Ideal Fractional Profile) that person can introduce them to, ranked by how
 * strong the way in is (the path's score, which carries the relationship's warmth) times how well
 * the company fits (Crystal Ball's band, then a saved view, then the profile). Names only what the
 * member may see: a locked company by its facts with what opening it costs, the person on the
 * other side only when the member can see their name. Never a person key or an internal id.
 */
export function introPlansOf(seed: Seed, s: State, m: Member, f: Found, nowMs = Date.now()): IntroPlanView[] {
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  let rows = new Map<string, RadarSentRow>();
  try {
    rows = crystalRowsOf(seed, s, m, nowMs);
  } catch {
    /* no Crystal Ball yet */
  }
  const views = (s.connector?.alerts?.[m.id] ?? []) as SavedSearch[];
  const prof = s.profiles[m.id] ?? {};
  const icp = prof.icp && !icpIsEmpty(prof.icp) ? prof.icp : null;
  const fn = f.me.words.fn;
  const crystal = T.crystalOf(s, m.id, nowMs);
  const fits = new Map<string, ListFit | null>();
  const fitOf = (id: string): ListFit | null => {
    if (fits.has(id)) return fits.get(id)!;
    const row = rows.get(id);
    let x: ListFit | null = row ? { kind: "ball", band: row.b ?? "Medium" } : null;
    if (!x) {
      const v = viewsMatching(seed, s, views, id);
      if (v) x = { kind: "view", name: v };
    }
    if (!x && icp) {
      const cf = companyFacts(g, s, id);
      if (cf && inIcp(icp, cf)) x = { kind: "profile" };
    }
    fits.set(id, x);
    return x;
  };
  const opener = (id: string) => (rows.has(id) && (crystal === "all" || crystal === "one") ? "Open it free from your Crystal Ball" : `Open it for ${COMPANY_PRICE_SAY}`);
  /** A seat holder's name and role on the other side, only when the member can see them. */
  const holder = (seatId: string | undefined): { name: string | null; role: string | null } => {
    const e = seatId ? g.engagements.get(seatId) : undefined;
    if (!e || !f.me.visible(e.companyId)) return { name: null, role: null };
    const vis = (k: string) => T.cellOf(s, m, e, "engagement", k, idx).s === "value";
    const op = T.cellOf(s, m, e, "engagement", "operator", idx);
    if (op.s !== "value") return { name: null, role: null };
    // A holder who hides their name on their seats is never named here.
    if (T.holderNameHidden(s, e)) return { name: null, role: vis("role") ? (T.live(e, s, "role") ?? null) : null };
    // The name as the seat shows it to this member: a member on Merlin the way they chose (lib/memberName.ts).
    return { name: shownName(op.v) || null, role: vis("role") ? (T.live(e, s, "role") ?? null) : null };
  };
  const leaderName = (pid: string | undefined): string | null => {
    const p = pid ? g.contacts.get(pid) : undefined;
    if (!p || !f.me.visible(p.companyId)) return null;
    return T.cellOf(s, m, p, "contact", "name", idx).s === "value" ? shownName(T.live(p, s, "name") ?? "") || null : null;
  };
  const noLeader = (id: string) => !!fn && fnKnow(s.leaders?.[id], s.leaderReports?.[id]?.[fn], fn, nowMs).s === "none";
  // Companies where the member holds or held a seat: their own clients, never an opening to be introduced to.
  const own = ownSeatTest(seed, s, m);
  const held = new Set([...g.engagements.values()].filter(own).map((e) => e.companyId));

  const out: (IntroPlanView & { r: number })[] = [];
  for (const [key, list] of f.byContact) {
    const c = f.contacts.get(key);
    if (!c) continue;
    const mine: { t: ContactTarget; fit: ListFit; r: number }[] = [];
    for (const t of list) {
      if (held.has(t.target)) continue;
      const fit = fitOf(t.target);
      // How strong the way in is (its kind, the tie, how recent) times how well the company fits: a likely company through someone two steps away can lead.
      if (fit) mine.push({ t, fit, r: t.q * FIT_WEIGHT(fit) });
    }
    if (!mine.length) continue;
    mine.sort((a, b) => b.r - a.r || a.t.target.localeCompare(b.t.target));
    const targets: IntroTargetView[] = [];
    const lines: IntroAskLine[] = [];
    let locked = 0;
    for (const { t, fit, r } of mine) {
      const named = f.me.visible(t.target) ? (g.companies.get(t.target)?.name ?? null) : null;
      if (!named) locked++;
      if (targets.length >= INTRO_TARGETS_MAX) continue;
      const p = t.parts;
      const other = p.leader ? { name: leaderName(p.leaderId), role: null } : holder(p.otherSeat);
      const facts: IntroFacts = {
        kind: p.kind as IntroFacts["kind"], degree: t.degree, first: c.first, title: p.elsewhere ? null : c.title, company: named, bridge: p.bridge ?? null, bridgeNote: p.bridgeNote ?? p.bridge ?? null,
        fn: p.fn ?? null, active: !!p.active, other: other.name, otherRole: other.role, rel: p.rel ?? null, leader: !!p.leader,
      };
      const why = nowClause(rows.get(t.target));
      const gap = noLeader(t.target) ? `has no ${fn} leader yet` : null;
      const fresh = why && !/\bago$/.test(why) && !/^just /.test(why) ? `just ${why}` : why;
      const nowWords = [why ? why.charAt(0).toUpperCase() + why.slice(1) : null, gap ? `No ${fn} leader on their team page` : null].filter(Boolean).join(" · ") || null;
      targets.push({ id: T.pubId(t.target), name: named, facts: factsOf(seed, s, t.target), inWords: fitWords(fit), now: nowWords, how: howThey(facts), degree: t.degree, score: Math.max(1, Math.round(r * 100)), open: named ? null : opener(t.target) });
      if (named && lines.length < INTRO_NOTE_MAX) lines.push({ company: named, you: howYou({ ...facts, company: named }), now: [fresh, gap].filter(Boolean).join(" and ") || null, person: askPerson(facts), to: askTo(facts, fn) });
    }
    const strength = strengthOf(c, nowMs);
    out.push({
      keys: [c.key, ...(c.aliases ?? [])],
      name: c.name,
      first: c.first,
      strength,
      why: whyLine(strength, mine.length),
      targets,
      count: mine.length,
      locked,
      ask: lines.length ? { lines, locked } : null,
      r: mine[0].r,
    });
  }
  return out
    .sort((a, b) => b.r - a.r || a.name.localeCompare(b.name))
    .slice(0, INTRO_PLANS_MAX)
    .map(({ r: _r, ...x }) => x); // eslint-disable-line @typescript-eslint/no-unused-vars
}
/** People the page carries a plan for (the strongest first). */
export const INTRO_PLANS_MAX = 300;

/** GET /api/paths: the imports, the counts by company, and "Your hidden paths". { on: false } with RN_PATHS off. */
export async function pathsView(token: string | null, nowMs = Date.now()): Promise<PathsAnswer | null> {
  if (!pathsOn()) return { on: false };
  const w = await who(token);
  if (!w) return null;
  const { seed, s, m } = w;
  const p = pathsOf(s, m.id);
  const f = foundFor(seed, s, m, nowMs);
  let ball = new Set<string>();
  try {
    ball = crystalCompanyIds(seed, s, m, nowMs);
  } catch {
    /* no Crystal Ball yet */
  }
  const views = (s.connector?.alerts?.[m.id] ?? []) as SavedSearch[];
  const counts: Record<string, { n: number; first: number }> = {};
  const targets: (TargetView & { r: number })[] = [];
  for (const [id, x] of f.byCompany) {
    const pub = T.pubId(id);
    counts[pub] = { n: x.n, first: x.first };
    const inBall = ball.has(id);
    const view = inBall ? null : viewsMatching(seed, s, views, id);
    if (!inBall && !view) continue;
    targets.push({ id: pub, name: f.me.visible(id) ? (T.graph(seed, s).companies.get(id)?.name ?? null) : null, facts: factsOf(seed, s, id), ball: inBall, view, best: x.paths[0], count: x.n, first: x.first, r: x.paths[0].score });
  }
  targets.sort((a, b) => b.r - a.r || Number(b.ball) - Number(a.ball) || b.count - a.count || a.id.localeCompare(b.id));
  return {
    on: true,
    linkedin: p?.linkedin ? { at: p.linkedin.at, rows: p.linkedin.rows.length, matched: f.matched, skipped: p.linkedin.skipped, namesOnly: !!p.linkedin.namesOnly, byLink: f.byLink } : null,
    csv: p?.csv ? { at: p.csv.at, rows: p.csv.rows.length, matched: f.csvMatched, skipped: p.csv.skipped } : null,
    googleOn: networkOn(),
    importsLeft: Math.max(0, IMPORTS_DAILY - importsToday(p, nowMs)),
    targets: targets.slice(0, TARGETS_MAX).map(({ r: _r, ...t }) => t), // eslint-disable-line @typescript-eslint/no-unused-vars
    counts,
    people: introPlansOf(seed, s, m, f, nowMs),
    lockedWays: f.lockedWays.size,
  };
}

/** GET /api/paths?company=: one company's ways in (its public id), best first. */
export async function companyPaths(token: string | null, companyPub: unknown, nowMs = Date.now()): Promise<CompanyPathsView | { on: false } | null> {
  if (!pathsOn()) return { on: false };
  const w = await who(token);
  if (!w) return null;
  const pub = typeof companyPub === "string" ? companyPub.slice(0, 80) : "";
  const f = foundFor(w.seed, w.s, w.m, nowMs);
  for (const [id, x] of f.byCompany) if (T.pubId(id) === pub) return { id: pub, paths: x.paths };
  return { id: pub, paths: [] };
}

/* ---------- the connector: counts only, never who ---------- */

/** get_company's one line: "You have 2 ways in through people you know. Open Merlin to see them." Never a name. */
export async function pathsLine(member: Member, companyPub: string, nowMs = Date.now()): Promise<{ ways_in_through_people_you_know?: string }> {
  if (!pathsOn()) return {};
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const f = foundFor(seed, s, member, nowMs);
  for (const [id, x] of f.byCompany)
    if (T.pubId(id) === companyPub && x.n > 0) return { ways_in_through_people_you_know: `You have ${waysWords(x.n)}. Open the company in Merlin to see who and how.` };
  return {};
}

/** my_account's one line: how many companies the member has a way into through people they know. Counts only. */
export async function accountPathsLine(member: Member, nowMs = Date.now()): Promise<{ smart_ways_in?: string }> {
  if (!pathsOn()) return {};
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const f = foundFor(seed, s, member, nowMs);
  const k = f.byCompany.size;
  const held = lockedWaysWords(f.lockedWays.size);
  if (!k && !held) return {};
  const line = k ? `Ways in through people you know at ${k} ${k === 1 ? "company" : "companies"}. Your hidden paths on Your network in Merlin lists them with who to ask.` : "";
  return { smart_ways_in: [line, held].filter(Boolean).join(" ") };
}

/* ---------- People I know (the People page, the person bubble) ---------- */

/** Who the member knows at companies on Merlin, at most this many (the strongest first). */
export const KNOWN_MAX = 3000;
const WARM_ORDER = ["Hot", "Warm", "Fading", "Cold"];

/**
 * GET /api/paths?known=1: everyone the member knows at a company on Merlin, from each of their own
 * sources merged (contactsOf), strongest first. Their own words only (the name, title and email from
 * their own file, contacts or messages). `record` names which person record on file this is, only
 * where the match is precise (the same public profile, or the one record with the same name at the
 * same company: lib/paths/find.ts leadersOfContact) and only at a company the member can see, so a
 * locked company's people stay as locked as they are. The record's own cells keep their locks: the
 * page reads them from the table, never from here.
 */
export async function knownView(token: string | null, nowMs = Date.now()): Promise<KnownView | { on: false } | null> {
  if (!pathsOn()) return { on: false };
  const w = await who(token);
  if (!w) return null;
  const { seed, s, m } = w;
  const { contacts } = contactsOf(seed, s, m, nowMs);
  const world = worldOf(seed, s, nowMs);
  const me = meOf(seed, s, m, nowMs);
  const away = awayOf(s, m.id);
  const p = pathsOf(s, m.id);
  const hide = lockedMatchesHidden();
  const people: (KnownPersonView & { r: number })[] = [];
  let messages = 0;
  const locked = new Set<string>();
  for (const c of contacts) {
    if (c.src.includes("messages")) messages++;
    // The member themself is never someone they know.
    if (c.member === m.id || (c.nameKey && c.nameKey === me.nameKey)) continue;
    if (!c.companyId && !c.member) continue;
    const seen = !!c.companyId && me.visible(c.companyId);
    // Someone from the member's own files at a company still locked for them: counted, never which (types.ts fromFile).
    // A member they know stays listed, at no company.
    const held = hide && !!c.companyId && !seen && fromFile(c.src);
    if (held) {
      locked.add(c.companyId!);
      if (!c.member) continue;
    }
    const recs = seen ? leadersOfContact(world, c).filter((l) => l.companyId === c.companyId) : [];
    const lastMet = c.lastMet ?? null;
    // A message on Merlin, or one on LinkedIn from the member's own export (its day only).
    const msg = [c.msgLast ?? null, c.liMsg?.last ?? null].filter((x): x is string => !!x).sort().pop() ?? null;
    const last = lastMet && (!msg || lastMet >= msg) ? lastMet : msg;
    const lastKind = !last ? null : last === lastMet && lastMet ? ((c.meetings ?? 0) > 0 ? "Meeting" : "Email") : "Message";
    people.push({
      key: c.key,
      name: c.name,
      title: c.title,
      company: c.companyId && !held ? T.pubId(c.companyId) : null,
      src: c.src,
      warmth: c.warmth,
      why: c.why,
      last,
      lastKind,
      email: c.email,
      profile: c.linkedin,
      record: recs.length === 1 ? T.pubId(recs[0].id) : null,
      member: c.member ? T.pubId(c.member) : null,
      away: isAway(c, away),
      r: (c.warmth ? 10 - WARM_ORDER.indexOf(c.warmth) : 0) * 1e9 + (last ? Date.parse(`${last}T12:00:00Z`) / 1e3 : 0),
    });
  }
  people.sort((a, b) => b.r - a.r || a.name.localeCompare(b.name));
  return {
    people: people.slice(0, KNOWN_MAX).map(({ r: _r, ...x }) => x), // eslint-disable-line @typescript-eslint/no-unused-vars
    locked: locked.size,
    sources: { google: networkOn() && !!(s as WithPaths).network?.[m.id]?.google, linkedin: p?.linkedin ? p.linkedin.rows.length : null, csv: p?.csv ? p.csv.rows.length : null, messages },
  };
}
