/**
 * Smart ways in, on the server (lib/paths/types.ts says what is kept and why): the member's
 * LinkedIn import and its deletion, the member's own people merged across their LinkedIn, Google
 * network and messages, and their ways in (lib/paths/find.ts) for the page, a record and the
 * connector.
 *
 * Every read here is for the signed-in member's own entry. Nothing builds anything for another
 * member or an admin; the connector gets counts only (pathsLine, accountPathsLine).
 *
 * Switched on with Your network (RN_GOOGLE=1): it lives on that page, and with it off every answer
 * is { on: false } and nothing shows.
 */
import { ActionError, loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "../table";
import { companiesOf, selfTest } from "../google";
import { ownSeatTest } from "../google/odds";
import { matchDomain, matchOrg } from "../google/compute";
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
import { parseConnections, CSV_PROBLEM_WORDS } from "./csv";
import { findAll, type Contact, type ContactTarget, type Me } from "./find";
import { firstWord, personKey } from "./match";
import { cleanPersonName } from "../personName";
import { directoryOf, worldOf } from "./world";
import {
  FILE_MAX_BYTES, IMPORTS_DAILY, TARGETS_MAX, waysWords,
  type CompanyPathsView, type LinkedInRow, type MemberPaths, type PathsAnswer, type PathsState, type PathView, type TargetView,
} from "./types";

const DAY = 86_400_000;
const SIGNED_OUT = "You're signed out. Sign in again.";

type WithPaths = State & { paths?: PathsState; network?: Record<string, MemberNetwork>; voice?: Record<string, VoiceProfile> };
const pathsOf = (s: State, id: string): MemberPaths | undefined => (s as WithPaths).paths?.[id];
const allPaths = (s: State) => ((s as WithPaths).paths ??= {});

async function who(token: string | null): Promise<{ seed: Seed; s: State; m: Member } | null> {
  if (!token) return null;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  return m ? { seed, s, m } : null;
}

const importsToday = (p: MemberPaths | undefined, nowMs: number) => (p?.imports ?? []).filter((at) => nowMs - Date.parse(at) < DAY).length;

/* ---------- the import ---------- */

/**
 * The member's own Connections.csv: read, cleaned (lib/paths/csv.ts) and kept for them alone. A
 * new file replaces the last one. IMPORTS_DAILY uploads in any rolling 24 hours.
 */
export async function importConnections(token: string | null, text: unknown, nowMs = Date.now()): Promise<{ answer: PathsAnswer; message: string }> {
  if (!networkOn()) throw new ActionError("Your network isn't on for Merlin yet.");
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
    p.linkedin = { at, rows: r.rows, skipped: r.skipped };
  });
  const answer = (await pathsView(token, nowMs))!;
  const n = r.rows.length;
  return { answer, message: `Added ${n.toLocaleString("en-US")} ${n === 1 ? "connection" : "connections"}. Only you see them.` };
}

/** Delete the import and everything worked out from it. The daily upload count stays (it is not from the file). */
export async function deleteConnections(token: string | null): Promise<PathsAnswer> {
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  await T.mutate((s) => {
    const all = allPaths(s);
    const p = all[w.m.id];
    if (!p) return;
    delete p.linkedin;
    if (!(p.imports ?? []).length) delete all[w.m.id];
  });
  return (await pathsView(token))!;
}

/* ---------- the member's own people ---------- */

/** A name as it reads: pronouns, nicknames and credentials out ("Pat Sample, CPA" is Pat Sample). */
const shownName = (raw: string) => {
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
export function contactsOf(seed: Seed, s: State, m: Member, nowMs = Date.now()): { contacts: Contact[]; matched: number } {
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
  const rows: LinkedInRow[] = pathsOf(s, m.id)?.linkedin?.rows ?? [];
  let matched = 0;
  for (const r of rows) {
    const name = shownName(`${r.f} ${r.l}`);
    const email = r.e ?? null;
    const dom = email ? workDomain(email, own) : null;
    const companyId = (dom ? matchDomain(dir, dom) : null) ?? matchOrg(dir, r.c);
    if (companyId) matched++;
    const member = email ? (w.memberByEmail.get(email) ?? null) : null;
    // Someone at no company on Merlin and not a member is no way in: kept in the file, left out here.
    if (!companyId && !member) continue;
    put({
      key: `l:${r.u ?? `${name}|${r.c ?? ""}`}`, name, first: firstWord(name), nameKey: personKey(name), title: r.p ?? null, companyId, email, slug: r.u ?? null,
      linkedin: r.u ? linkedinUrl(r.u) : null, src: ["linkedin"], warmth: null, why: r.d ? `LinkedIn connection since ${r.d.slice(0, 4)}` : "LinkedIn connection", met: false,
      connected: r.d ?? null, member,
    });
  }
  return { contacts: [...out.values()], matched };
}

/* ---------- the member's ways in ---------- */

interface Found {
  byCompany: Map<string, { paths: PathView[]; n: number; first: number }>;
  /** Contact key -> the companies they are a way into, best first (the specific ask, introPlansOf). */
  byContact: Map<string, ContactTarget[]>;
  contacts: Map<string, Contact>;
  matched: number;
  me: Me;
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
function foundFor(seed: Seed, s: State, m: Member, nowMs: number): Found {
  let per = found.get(s);
  if (!per) found.set(s, (per = new Map()));
  const k = `${m.id}:${new Date(nowMs).toISOString().slice(0, 10)}`;
  let hit = per.get(k);
  if (!hit) {
    const { contacts, matched } = contactsOf(seed, s, m, nowMs);
    const me = meOf(seed, s, m, nowMs);
    const all = findAll(worldOf(seed, s, nowMs), me, contacts);
    hit = { byCompany: all.byCompany, byContact: all.byContact, contacts: new Map(contacts.map((c) => [c.key, c])), matched, me };
    if (per.size > 2000) per.clear();
    per.set(k, hit);
  }
  return hit;
}

/** Saved views a company matches by free facts: an open role or a seat there in the view's function, the company's facts in its lists. */
function viewsMatching(seed: Seed, s: State, views: SavedSearch[], companyId: string): string | null {
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

const factsOf = (seed: Seed, s: State, id: string) => {
  const c = T.graph(seed, s).companies.get(id);
  return [T.live(c, s, "industry"), T.live(c, s, "employees")].filter(Boolean).join(" · ");
};

/* ---------- the specific ask: who someone can introduce the member to ---------- */

const ROLE_HEAD = /^\s*(new open role|open role)\s*:\s*/i;
/** A Crystal Ball row's line as a clause after the company: "hired a fractional CMO 1 month ago", "posted an open VP Sales role". */
function nowClause(row: RadarSentRow | undefined): string | null {
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
    if (!vis("operator")) return { name: null, role: null };
    return { name: shownName(T.live(e, s, "operator") ?? "") || null, role: vis("role") ? (T.live(e, s, "role") ?? null) : null };
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
        kind: p.kind as IntroFacts["kind"], degree: t.degree, first: c.first, title: c.title, company: named, bridge: p.bridge ?? null, bridgeNote: p.bridgeNote ?? p.bridge ?? null,
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

/** GET /api/paths: the import, the counts by company, and "Your hidden paths". { on: false } with Your network off. */
export async function pathsView(token: string | null, nowMs = Date.now()): Promise<PathsAnswer | null> {
  if (!networkOn()) return { on: false };
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
    linkedin: p?.linkedin ? { at: p.linkedin.at, rows: p.linkedin.rows.length, matched: f.matched, skipped: p.linkedin.skipped } : null,
    importsLeft: Math.max(0, IMPORTS_DAILY - importsToday(p, nowMs)),
    targets: targets.slice(0, TARGETS_MAX).map(({ r: _r, ...t }) => t), // eslint-disable-line @typescript-eslint/no-unused-vars
    counts,
    people: introPlansOf(seed, s, m, f, nowMs),
  };
}

/** GET /api/paths?company=: one company's ways in (its public id), best first. */
export async function companyPaths(token: string | null, companyPub: unknown, nowMs = Date.now()): Promise<CompanyPathsView | { on: false } | null> {
  if (!networkOn()) return { on: false };
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
  if (!networkOn()) return {};
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const f = foundFor(seed, s, member, nowMs);
  for (const [id, x] of f.byCompany)
    if (T.pubId(id) === companyPub && x.n > 0) return { ways_in_through_people_you_know: `You have ${waysWords(x.n)}. Open the company in Merlin to see who and how.` };
  return {};
}

/** my_account's one line: how many companies the member has a way into through people they know. Counts only. */
export async function accountPathsLine(member: Member, nowMs = Date.now()): Promise<{ smart_ways_in?: string }> {
  if (!networkOn()) return {};
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const f = foundFor(seed, s, member, nowMs);
  const k = f.byCompany.size;
  if (!k) return {};
  return { smart_ways_in: `Ways in through people you know at ${k} ${k === 1 ? "company" : "companies"}. Your hidden paths on Your network in Merlin lists them with who to ask.` };
}
