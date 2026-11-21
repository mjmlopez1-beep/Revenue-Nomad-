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
import { companiesOf } from "../google";
import { matchDomain, matchOrg } from "../google/compute";
import { networkOn, whenWords, workDomain, type MemberNetwork, type Warmth } from "../google/types";
import { crystalCompanyIds } from "../radar";
import { alertMatches, type SavedSearch } from "../mcp/alerts";
import { clientKinds, myWords } from "../partners";
import { styleOf, type VoiceProfile } from "../voice";
import { parseConnections, CSV_PROBLEM_WORDS } from "./csv";
import { findPaths, type Contact, type Me } from "./find";
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

  // The member's own Google network: people at companies on Merlin, not set aside, not hidden.
  const n = (s as WithPaths).network?.[m.id];
  if (networkOn() && n)
    for (const co of companiesOf(seed, s, n, nowMs)) {
      if (co.set) continue;
      for (const p of co.people) {
        if (p.hidden || !p.name) continue;
        const email = p.email?.toLowerCase() ?? null;
        put({
          key: `g:${p.key}`, name: p.name, first: firstWord(p.name), nameKey: personKey(p.name), title: p.title, companyId: co.internal, email, slug: null, linkedin: null,
          src: ["google"], warmth: p.warmth, why: p.why, met: p.meetings > 0 || p.emails > 0, connected: null, member: email ? (w.memberByEmail.get(email) ?? null) : null,
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
    hit = { byCompany: findPaths(worldOf(seed, s, nowMs), me, contacts), matched, me };
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
