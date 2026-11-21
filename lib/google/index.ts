/**
 * Your network (lib/google/types.ts says what is kept and why): connecting Google, the daily
 * sync, what the member's own Claude saves, the member's own view, and deleting it all.
 *
 * Every read here is for the signed-in member's own entry in State.network. Nothing in this file
 * builds anything for another member, an admin (Pilot metrics get counts only, networkCounts), the
 * radar's shared model or the weekly email.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { ActionError, isAdmin, loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "../table";
import { functionOf, siteKey } from "../tableFields";
import {
  CLAUDE_ENTRIES_MAX, CLAUDE_NEW_DAILY, CLAUDE_SAVES_DAILY, NOT_SEATS_MAX, SEAT_MEETINGS, SEAT_MONTHS, SEAT_SURE_MEETINGS, SEAT_SURE_MONTHS, companyScore, isDecisionMaker, isFreeMail, mergeCompany, networkIds,
  networkOn, warmthOf, warmthScore, WARMTH_RANK, domainOf,
  type GoogleLink, type LinkView, type MemberNetwork, type NetCompany, type NetCompanyView, type NetPerson, type NetworkAnswer, type NetworkView, type SeatGuessView, type SourceData, type SyncStage,
} from "./types";
import {
  MAIN_SCOPES, SCOPE_GMAIL, gmailOwnClient, gmailTester, googleConfigured, hasCalendar, hasCalendarList, hasContacts, hasGmail, hasOtherContacts,
} from "./config";
import { seal, unseal } from "./crypto";
import * as G from "./api";
import { CLAUDE_FIELDS, RELATIONSHIPS, calendarSource, cleanDate, contactsSource, gmailSource, looksLikeText, makeDirectory, matchDomain, matchOrg, type Directory } from "./compute";

const DAY = 86_400_000;
export const WINDOW_MONTHS = 24;
export const AHEAD_DAYS = 30;
const STATE_TTL_MS = 10 * 60_000;

type Kind = "google" | "gmail";

/* ---------- the member ---------- */

async function who(token: string | null): Promise<{ seed: Seed; s: State; m: Member } | null> {
  if (!token) return null;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  return m ? { seed, s, m } : null;
}

const netOf = (s: State, id: string): MemberNetwork | undefined => (s as State & { network?: Record<string, MemberNetwork> }).network?.[id];
const netsOf = (s: State) => ((s as State & { network?: Record<string, MemberNetwork> }).network ??= {});

/** The member's own domains (their Merlin and Google emails), never matched to a company. Free mail isn't one. */
function ownDomains(m: Member, n: MemberNetwork | undefined): Set<string> {
  const out = new Set<string>();
  for (const e of [m.email, n?.google?.email, n?.gmail?.email]) {
    const d = domainOf(e);
    if (d && !isFreeMail(d)) out.add(d);
  }
  return out;
}

/* ---------- the companies on Merlin (kept per state) ---------- */

const graphs = new WeakMap<State, ReturnType<typeof T.graph>>();
function graphOf(seed: Seed, s: State) {
  let g = graphs.get(s);
  if (!g) graphs.set(s, (g = T.graph(seed, s)));
  return g;
}
const dirs = new WeakMap<State, Directory>();
function directory(seed: Seed, s: State): Directory {
  let d = dirs.get(s);
  if (!d) {
    const g = graphOf(seed, s);
    d = makeDirectory([...g.companies.values()].map((c) => ({ id: c.id, website: T.live(c, s, "website"), name: c.name })));
    dirs.set(s, d);
  }
  return d;
}

/* ---------- the OAuth state (one time, 10 minutes, same browser, same member) ---------- */

const hashOf = (v: string) => createHash("sha256").update(`rn-google-state:${v}`).digest("hex");
const states = new Map<string, { memberId: string; kind: Kind; from: string; exp: number }>();
function sweep() {
  const now = Date.now();
  for (const [k, v] of states) if (v.exp <= now) states.delete(k);
  while (states.size >= 5000) states.delete(states.keys().next().value as string);
}

export type StartResult = { ok: true; url: string; state: string } | { ok: false; why: "off" | "signed_out" | "not_configured" | "not_allowed" };

/** GET /api/integrations/google/start: the consent page for Calendar and Contacts, or (kind gmail) for Gmail headers. */
export async function startConnect(token: string | null, origin: string, kind: Kind = "google", from = ""): Promise<StartResult> {
  if (!networkOn()) return { ok: false, why: "off" };
  if (!googleConfigured()) return { ok: false, why: "not_configured" };
  const w = await who(token);
  if (!w) return { ok: false, why: "signed_out" };
  const n = netOf(w.s, w.m.id);
  if (kind === "gmail" && (!gmailTester(w.m.email, n?.google?.email) || !n?.google)) return { ok: false, why: "not_allowed" };
  sweep();
  const state = randomBytes(32).toString("base64url");
  states.set(hashOf(state), { memberId: w.m.id, kind, from: from === "onboard" ? "onboard" : "", exp: Date.now() + STATE_TTL_MS });
  const scopes = kind === "gmail" ? (gmailOwnClient() ? ["openid", "email", SCOPE_GMAIL] : [SCOPE_GMAIL]) : MAIN_SCOPES;
  return { ok: true, url: G.authorizeUrl(kind, scopes, state, origin, kind === "gmail" ? n?.google?.email : undefined), state };
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export type Outcome = "connected" | "gmail" | "denied" | "scopes" | "failed";

/**
 * GET /api/integrations/google/callback. The state must be known, unexpired, the browser's own
 * (the cookie) and the signed-in member's. Then the code is swapped for tokens, the refresh token
 * sealed and kept, and the first sync starts in the background.
 */
export async function finishConnect(
  token: string | null,
  q: { state: string | null; code: string | null; error: string | null },
  cookie: string | null,
  origin: string,
): Promise<{ outcome: Outcome; from: string }> {
  const raw = String(q.state ?? "");
  const got = raw && raw.length <= 200 ? states.get(hashOf(raw)) : undefined;
  if (raw) states.delete(hashOf(raw));
  if (!got || got.exp <= Date.now() || !cookie || !same(cookie, raw) || !networkOn() || !googleConfigured()) return { outcome: "failed", from: "" };
  const w = await who(token);
  if (!w || w.m.id !== got.memberId) return { outcome: "failed", from: got.from };
  if (q.error) return { outcome: q.error === "access_denied" ? "denied" : "failed", from: got.from };
  const code = String(q.code ?? "");
  if (!code || code.length > 1000) return { outcome: "failed", from: got.from };
  let t: G.Tokens;
  try {
    t = await G.exchangeCode(got.kind, code, origin);
  } catch (e) {
    console.error(`Google connect: the code exchange failed (${e instanceof G.GoogleError ? e.code : "error"})`);
    return { outcome: "failed", from: got.from };
  }
  if (!t.refresh) {
    console.error("Google connect: no refresh token came back");
    return { outcome: "failed", from: got.from };
  }
  const now = new Date().toISOString();
  if (got.kind === "google") {
    if (!hasCalendar(t.scopes) && !hasContacts(t.scopes)) {
      void G.revoke(t.refresh);
      return { outcome: "scopes", from: got.from };
    }
    const link: GoogleLink = { token: seal(t.refresh), email: t.email ?? "", scopes: t.scopes.filter((x) => x.startsWith("https://")), connectedAt: now, status: "ok" };
    await T.mutate((s) => {
      const nets = netsOf(s);
      nets[w.m.id] = { ...nets[w.m.id], google: link };
    });
    access.set(`${w.m.id}:google`, { access: t.access, exp: t.expiresAt, sealed: link.token });
  } else {
    if (!hasGmail(t.scopes)) {
      if (gmailOwnClient()) void G.revoke(t.refresh);
      return { outcome: "scopes", from: got.from };
    }
    let email = t.email ?? "";
    try {
      email = (await G.gmailProfile(t.access)).email ?? email;
    } catch {
      /* the profile is only for the member's own domain */
    }
    const link: GoogleLink = { token: seal(t.refresh), email, scopes: [SCOPE_GMAIL], connectedAt: now, status: "ok", ...(gmailOwnClient() ? { ownClient: true } : {}) };
    await T.mutate((s) => {
      const nets = netsOf(s);
      if (!nets[w.m.id]?.google) throw new ActionError("Connect Calendar and Contacts first.");
      nets[w.m.id].gmail = link;
    }).catch(() => null);
    access.set(`${w.m.id}:gmail`, { access: t.access, exp: t.expiresAt, sealed: link.token });
  }
  void syncMember(w.m.id).catch((e) => console.error(`Google sync failed (${e instanceof G.GoogleError ? e.code : "error"})`));
  return { outcome: got.kind === "gmail" ? "gmail" : "connected", from: got.from };
}

/* ---------- access tokens (memory only) ---------- */

const access = new Map<string, { access: string; exp: number; sealed: string }>();

async function accessFor(memberId: string, kind: Kind, link: GoogleLink): Promise<string> {
  const k = `${memberId}:${kind}`;
  const hit = access.get(k);
  if (hit && hit.sealed === link.token && hit.exp > Date.now() + 60_000) return hit.access;
  const refresh = unseal(link.token);
  if (!refresh) throw new G.GoogleError("invalid_grant");
  const t = await G.refreshAccess(kind, refresh);
  access.set(k, { access: t.access, exp: t.expiresAt, sealed: link.token });
  return t.access;
}

/** Run with an access token; when Google says it is no good any more (401), refresh once and try again. */
async function withAccess<T>(memberId: string, kind: Kind, link: GoogleLink, fn: (access: string) => Promise<T>): Promise<T> {
  try {
    return await fn(await accessFor(memberId, kind, link));
  } catch (e) {
    if (!(e instanceof G.GoogleError) || e.status !== 401) throw e;
    access.delete(`${memberId}:${kind}`);
    return fn(await accessFor(memberId, kind, link));
  }
}

/* ---------- the sync ---------- */

const syncing = new Set<string>();
export const isSyncing = (memberId: string) => syncing.has(memberId);
/** What a running read is on (memory only): the connect moment's progress says it as it is. */
const stages = new Map<string, SyncStage>();
/**
 * Tests only (RN_SCAN_TEST=1): RN_GOOGLE_SYNC_SLOW_MS holds each part of a read this long, so the
 * progress state can be looked at against the fake Google. Nothing on a real server.
 */
const slow = async () => {
  const ms = process.env.RN_SCAN_TEST === "1" ? Number(process.env.RN_GOOGLE_SYNC_SLOW_MS) || 0 : 0;
  if (ms > 0) await new Promise((r) => setTimeout(r, Math.min(ms, 60_000)));
};

async function markGone(memberId: string, kind: Kind, connectedAt: string) {
  await T.mutate((s) => {
    const l = netOf(s, memberId)?.[kind];
    if (l && l.connectedAt === connectedAt) l.status = "reconnect";
  });
}

/**
 * Read the member's Calendar (the past WINDOW_MONTHS and the next AHEAD_DAYS, primary and other
 * owned calendars), Contacts (saved, and other contacts when granted) and, for a Gmail test member,
 * Gmail headers, and keep only the per-company conclusions. A source that fails keeps what it had.
 */
export async function syncMember(memberId: string, nowMs = Date.now()): Promise<{ ok: boolean; error?: string }> {
  if (!networkOn() || syncing.has(memberId)) return { ok: false, error: "busy" };
  syncing.add(memberId);
  try {
    const [seed, s] = await Promise.all([loadSeed(), loadState()]);
    const m = T.memberIndex(seed, s).byId.get(memberId);
    const n = netOf(s, memberId);
    if (!m || !n) return { ok: false, error: "gone" };
    const own = ownDomains(m, n);
    const dir = directory(seed, s);
    const from = nowMs - WINDOW_MONTHS * 30.44 * DAY;
    const out: { cal?: SourceData; con?: SourceData; gm?: SourceData; google?: { at?: string; error?: string }; gmail?: { at?: string; error?: string } } = {};
    let error: string | undefined;
    const g = n.google;
    if (g && g.status !== "reconnect") {
      try {
        await withAccess(memberId, "google", g, async (acc) => {
          if (hasCalendar(g.scopes)) {
            stages.set(memberId, "calendar");
            await slow();
            const cals = await G.ownedCalendars(acc, hasCalendarList(g.scopes));
            const events = (await Promise.all(cals.map((c) => G.calendarEvents(acc, c, from, nowMs + AHEAD_DAYS * DAY)))).flat();
            out.cal = calendarSource(events, dir, own, nowMs);
          }
          if (hasContacts(g.scopes)) {
            stages.set(memberId, "contacts");
            await slow();
            const saved = await G.contacts(acc, false);
            const other = hasOtherContacts(g.scopes) ? await G.contacts(acc, true).catch((e) => (G.isDenied(e) ? [] : Promise.reject(e))) : [];
            out.con = contactsSource(saved, other, dir, own, nowMs);
          }
        });
        out.google = { at: new Date(nowMs).toISOString() };
      } catch (e) {
        if (G.isGone(e)) await markGone(memberId, "google", g.connectedAt);
        error = e instanceof G.GoogleError ? e.code : "error";
        out.google = { error };
      }
    }
    const gl = n.gmail;
    if (gl && gl.status !== "reconnect" && gmailTester(m.email, g?.email)) {
      try {
        stages.set(memberId, "gmail");
        const self = new Set([m.email.toLowerCase(), g?.email, gl.email].filter((x): x is string => !!x));
        out.gm = gmailSource(await withAccess(memberId, "gmail", gl, (acc) => G.gmailHeaders(acc, from)), self, dir, own, nowMs);
        out.gmail = { at: new Date(nowMs).toISOString() };
      } catch (e) {
        if (G.isGone(e)) await markGone(memberId, "gmail", gl.connectedAt);
        error ??= e instanceof G.GoogleError ? e.code : "error";
        out.gmail = { error: e instanceof G.GoogleError ? e.code : "error" };
      }
    }
    stages.set(memberId, "matching");
    await slow();
    await T.mutate((d) => {
      const cur = netOf(d, memberId);
      if (!cur) return;
      // Only what the same connection read: one made again (or removed) while this ran wins.
      if (cur.google && g && cur.google.connectedAt === g.connectedAt) {
        if (out.cal) cur.cal = out.cal;
        if (out.con) cur.con = out.con;
        if (out.google?.at) {
          // The first read of this connection: how long it took, by the clock (the connect moment says it only when measured).
          if (!cur.google.syncedAt && cur.google.firstMs === undefined) {
            const took = Date.now() - Date.parse(cur.google.connectedAt);
            if (Number.isFinite(took) && took >= 0 && took < 60 * 60_000) cur.google.firstMs = took;
          }
          cur.google.syncedAt = out.google.at;
          delete cur.google.error;
        } else if (out.google?.error) cur.google.error = out.google.error;
      }
      if (cur.gmail && gl && cur.gmail.connectedAt === gl.connectedAt) {
        if (out.gm) cur.gm = out.gm;
        if (out.gmail?.at) {
          cur.gmail.syncedAt = out.gmail.at;
          delete cur.gmail.error;
        } else if (out.gmail?.error) cur.gmail.error = out.gmail.error;
      }
    });
    return error ? { ok: false, error } : { ok: true };
  } finally {
    syncing.delete(memberId);
    stages.delete(memberId);
  }
}

/** Members due their daily sync, one at a time, at most once every 10 minutes per process. */
let refreshAt = 0;
let refreshing = false;
export async function refreshDue(nowMs = Date.now()): Promise<number> {
  if (!networkOn() || refreshing || nowMs - refreshAt < 10 * 60_000) return 0;
  refreshAt = nowMs;
  refreshing = true;
  try {
    const s = await loadState();
    const due = Object.entries((s as State & { network?: Record<string, MemberNetwork> }).network ?? {})
      .filter(([, n]) =>
        [n.google, n.gmail].some((l) => l && l.status !== "reconnect" && nowMs - (Date.parse(l.syncedAt ?? l.connectedAt) || 0) > DAY - 30 * 60_000),
      )
      .map(([id]) => id);
    for (const id of due) await syncMember(id, nowMs).catch(() => null);
    return due.length;
  } finally {
    refreshing = false;
  }
}

/* ---------- the member's own view ---------- */

const linkView = (l: GoogleLink | undefined): LinkView | null =>
  l
    ? {
        email: l.email,
        status: l.status === "reconnect" ? "reconnect" : "ok",
        syncedAt: l.syncedAt ?? null,
        connectedAt: l.connectedAt,
        calendar: hasCalendar(l.scopes),
        contacts: hasContacts(l.scopes),
        error: l.error ?? null,
      }
    : null;

const savesToday = (n: MemberNetwork | undefined, nowMs: number) => (n?.claude?.saves ?? []).filter((at) => nowMs - Date.parse(at) < DAY).length;

/** The merged, matched companies of one member, warmest first. Names come from the table (the member knows them now). */
export function companiesOf(seed: Seed, s: State, n: MemberNetwork | undefined, nowMs = Date.now()): (NetCompanyView & { internal: string })[] {
  if (!n) return [];
  const g = graphOf(seed, s);
  const out: (NetCompanyView & { internal: string })[] = [];
  for (const id of networkIds(n)) {
    const node = g.companies.get(id);
    const c = node ? mergeCompany(n, id) : null;
    if (!node || !c) continue;
    const score = companyScore(c, nowMs);
    const people = c.people
      .map((p) => ({ p, sc: warmthScore(p, nowMs) }))
      .sort((a, b) => b.sc - a.sc || (b.p.last ?? "").localeCompare(a.p.last ?? ""))
      .map(({ p, sc }) => ({
        name: p.name ?? null,
        title: p.title ?? null,
        email: p.email ?? null,
        warmth: warmthOf(sc),
        last: p.last ?? null,
        next: p.next ?? null,
        meetings: p.meetings ?? 0,
        emails: p.emails ?? 0,
        both: !!p.both,
        dm: isDecisionMaker(p.title),
        rel: p.rel ?? null,
        src: p.src,
      }));
    const months = c.months ?? [];
    out.push({
      id: T.pubId(id),
      internal: id,
      name: node.name,
      site: siteKey(T.live(node, s, "website")),
      warmth: warmthOf(score),
      score,
      last: c.last ?? people.map((p) => p.last).filter(Boolean).sort().pop() ?? null,
      next: c.next ?? null,
      meetings: c.meetings ?? 0,
      upcoming: c.upcoming ?? 0,
      emails: c.emails ?? people.reduce((a, p) => a + p.emails, 0),
      contacts: c.contacts ?? 0,
      src: [...new Set(people.flatMap((p) => p.src))],
      people,
      more: c.more ?? 0,
      seat: months.length >= SEAT_MONTHS && (c.meetings ?? 0) >= SEAT_MEETINGS ? { from: months[0], to: months[months.length - 1] } : null,
    });
  }
  return out.sort((a, b) => WARMTH_RANK[a.warmth] - WARMTH_RANK[b.warmth] || b.score - a.score || a.name.localeCompare(b.name));
}

/** YYYY-MM of the month before `nowMs` (UTC). */
const lastMonth = (nowMs: number) => {
  const d = new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 15)).toISOString().slice(0, 7);
};
const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
};

/**
 * "We think you held these seats": the member's own companies with months of meetings
 * (NetCompanyView.seat), less the ones where a seat is already theirs or carries their name, and
 * the ones they said were "Not a seat". Most meetings first. It reads only the member's own
 * network and their own seats, and adds nothing: Confirm is the member's own Add (lib/table.ts).
 */
export function seatGuessesOf(seed: Seed, s: State, m: Member, list: (NetCompanyView & { internal: string })[], n: MemberNetwork | undefined, nowMs = Date.now()): SeatGuessView[] {
  const no = new Set(n?.notSeats ?? []);
  const maybe = list.filter((c) => c.seat && !no.has(c.internal));
  if (!maybe.length) return [];
  const want = new Set(maybe.map((c) => c.internal));
  const g = graphOf(seed, s);
  const idx = T.memberIndex(seed, s);
  // A seat there that is theirs, or that they put their name on (still waiting to be confirmed).
  const held = new Set<string>();
  for (const e of g.engagements.values()) {
    if (!want.has(e.companyId) || held.has(e.companyId)) continue;
    const v = T.valueOf(e, s, "operator");
    if (!v || v.status !== "live") continue;
    if (v.memberId === m.id || T.seatHolder(s, idx, e.id, v)?.id === m.id) held.add(e.companyId);
  }
  const prof = s.profiles[m.id] ?? {};
  const title = (prof.title || (m.title === "Member" ? "" : m.title) || "").trim();
  const fn = prof.function ?? functionOf(title) ?? null;
  const recent = lastMonth(nowMs);
  const waiting = new Set((s.pendingSeats ?? []).map((p) => p.companyId));
  return maybe
    .filter((c) => !held.has(c.internal))
    .map((c): SeatGuessView => {
      const months = monthsBetween(c.seat!.from, c.seat!.to);
      return {
        id: c.id,
        name: c.name,
        site: c.site,
        from: c.seat!.from,
        to: c.seat!.to,
        meetings: c.meetings,
        months,
        sure: months >= SEAT_SURE_MONTHS && c.meetings >= SEAT_SURE_MEETINGS,
        with: c.people
          .filter((p) => !!p.name && p.meetings > 0)
          .sort((a, b) => b.meetings - a.meetings)
          .slice(0, 2)
          .map((p) => ({ name: p.name!, title: p.title })),
        function: fn,
        role: title || null,
        active: c.seat!.to >= recent || c.upcoming > 0,
        waits: waiting.has(c.internal),
      };
    })
    .sort((a, b) => Number(b.sure) - Number(a.sure) || b.meetings - a.meetings || a.name.localeCompare(b.name));
}

/** GET /api/integrations/google: the member's own network. { on: false } when RN_GOOGLE is off. */
export async function networkView(token: string | null, nowMs = Date.now()): Promise<NetworkAnswer | null> {
  if (!networkOn()) return { on: false };
  const w = await who(token);
  if (!w) return null;
  const n = netOf(w.s, w.m.id);
  const all = companiesOf(w.seed, w.s, n, nowMs);
  const companies = all.map(({ internal: _i, ...c }) => c); // eslint-disable-line @typescript-eslint/no-unused-vars
  const srcs = [n?.cal, n?.con, n?.gm, n?.claude];
  const view: NetworkView = {
    on: true,
    configured: googleConfigured(),
    google: linkView(n?.google),
    gmail: linkView(n?.gmail),
    gmailOffered: !!n?.google && gmailTester(w.m.email, n.google.email),
    gmailOwnClient: gmailOwnClient(),
    claude: n?.claude ? { at: n.claude.at, companies: Object.keys(n.claude.companies).length } : null,
    claudeLeft: Math.max(0, CLAUDE_SAVES_DAILY - savesToday(n, nowMs)),
    syncing: syncing.has(w.m.id),
    stage: syncing.has(w.m.id) ? stages.get(w.m.id) ?? null : null,
    first: n?.google ? { ms: n.google.syncedAt ? n.google.firstMs ?? null : null, seen: !!n.found } : null,
    companies,
    seats: seatGuessesOf(w.seed, w.s, w.m, all, n, nowMs),
    stats: { unmatched: srcs.reduce((a, x) => a + (x?.unmatched ?? 0), 0), real: Math.max(n?.cal?.real ?? 0, n?.gm?.real ?? 0) },
  };
  return view;
}

/* ---------- the member's buttons ---------- */

const SIGNED_OUT = "You're signed out. Sign in again.";

/** Sync now (rate limited by the route). */
export async function syncNow(token: string | null): Promise<NetworkAnswer> {
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  if (!netOf(w.s, w.m.id)?.google) throw new ActionError("Connect Google first.");
  void syncMember(w.m.id).catch(() => null);
  return (await networkView(token))!;
}

/** The member saw the result of their first read: the connect moment doesn't open by itself again. */
export async function sawFound(token: string | null): Promise<NetworkAnswer> {
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  if (netOf(w.s, w.m.id)?.google && !netOf(w.s, w.m.id)?.found)
    await T.mutate((s) => {
      const n = netOf(s, w.m.id);
      if (n?.google && !n.found) n.found = new Date().toISOString();
    });
  return (await networkView(token))!;
}

/**
 * "Not a seat" on a seat guess: remembered for this member, so it never comes back. `companyId` is
 * the company's public id, and only a company in their own network counts. Nothing else changes:
 * no seat, no credit, nothing any other member sees.
 */
export async function notASeat(token: string | null, companyId: unknown): Promise<NetworkAnswer> {
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  if (!networkOn()) throw new ActionError("Your network isn't on for Merlin yet.");
  const pub = typeof companyId === "string" ? companyId.slice(0, 80) : "";
  const hit = pub ? companiesOf(w.seed, w.s, netOf(w.s, w.m.id)).find((c) => c.id === pub) : undefined;
  if (!hit) throw new ActionError("That company isn't in your network any more. Refresh the page.");
  await T.mutate((s) => {
    const n = netOf(s, w.m.id);
    if (!n) return;
    const list = (n.notSeats ?? []).filter((x) => x !== hit.internal);
    n.notSeats = [...list, hit.internal].slice(-NOT_SEATS_MAX);
  });
  return (await networkView(token))!;
}

/** Disconnect and delete everything: revoke at Google, then erase the member's whole section (Gmail via Claude too). */
export async function disconnectAll(token: string | null): Promise<NetworkAnswer> {
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  const n = netOf(w.s, w.m.id);
  const tokens = [n?.google?.token, n?.gmail?.token].map((x) => unseal(x)).filter((x): x is string => !!x);
  await T.mutate((s) => {
    delete netsOf(s)[w.m.id];
  });
  access.delete(`${w.m.id}:google`);
  access.delete(`${w.m.id}:gmail`);
  await Promise.all(tokens.map((t) => G.revoke(t)));
  return (await networkView(token))!;
}

/** Drop just Gmail: its token and what it derived. With its own client it is revoked at Google too. */
export async function dropGmail(token: string | null): Promise<NetworkAnswer> {
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  const l = netOf(w.s, w.m.id)?.gmail;
  await T.mutate((s) => {
    const n = netOf(s, w.m.id);
    if (!n) return;
    delete n.gmail;
    delete n.gm;
  });
  access.delete(`${w.m.id}:gmail`);
  // On the main client the Gmail grant is the same grant as Calendar and Contacts: revoking it would stop those too.
  const t = l?.ownClient ? unseal(l.token) : null;
  if (t) await G.revoke(t);
  return (await networkView(token))!;
}

/** Delete what the member's Claude saved. Calendar and Contacts stay. */
export async function forgetClaude(token: string | null): Promise<NetworkAnswer> {
  const w = await who(token);
  if (!w) throw new ActionError(SIGNED_OUT);
  await T.mutate((s) => {
    const n = netOf(s, w.m.id);
    if (!n) return;
    delete n.claude;
    if (!n.google && !n.gmail && !n.cal && !n.con && !n.gm) delete netsOf(s)[w.m.id];
  });
  return (await networkView(token))!;
}

/* ---------- Pilot metrics: counts only ---------- */

export async function networkCounts(token: string | null): Promise<{ connected: number; gmail: number; claude: number; reconnect: number; companies: number; matched: number } | null> {
  if (!networkOn()) return null;
  const w = await who(token);
  if (!w || !isAdmin(w.m)) return null;
  const nets = (w.s as State & { network?: Record<string, MemberNetwork> }).network ?? {};
  let connected = 0;
  let gmail = 0;
  let claude = 0;
  let reconnect = 0;
  let matched = 0;
  const all = new Set<string>();
  for (const n of Object.values(nets)) {
    if (n.google) connected++;
    if (n.gmail) gmail++;
    if (n.claude) claude++;
    if (n.google?.status === "reconnect" || n.gmail?.status === "reconnect") reconnect++;
    const ids = networkIds(n);
    matched += ids.size;
    for (const id of ids) all.add(id);
  }
  return { connected, gmail, claude, reconnect, companies: all.size, matched };
}

/* ---------- through the member's own Claude (save_my_network, my_network) ---------- */

export class NetworkProblem extends Error {}

/**
 * save_my_network: conclusions the member chose to share from their own inbox, read by their own
 * Claude. Only CLAUDE_FIELDS are taken; an entry with anything else (a subject, a body, a
 * snippet) refuses the whole call and nothing is saved. No credits either way, never shared.
 */
export async function saveFromClaude(member: Member, entriesRaw: unknown, nowMs = Date.now()) {
  if (!networkOn()) throw new NetworkProblem("Your network isn't on for Merlin yet.");
  if (!Array.isArray(entriesRaw) || !entriesRaw.length) throw new NetworkProblem("Send at least one entry: a company website (or exact name), and what you know about the people there.");
  if (entriesRaw.length > CLAUDE_ENTRIES_MAX) throw new NetworkProblem(`At most ${CLAUDE_ENTRIES_MAX} entries a call. Nothing was saved. Send the warmest ${CLAUDE_ENTRIES_MAX} first.`);
  const allowed = new Set<string>(CLAUDE_FIELDS);
  for (const e of entriesRaw) {
    if (!e || typeof e !== "object" || Array.isArray(e)) throw new NetworkProblem("Each entry is an object with a company and what you know. Nothing was saved.");
    const extra = Object.keys(e).filter((k) => !allowed.has(k));
    if (extra.length)
      throw new NetworkProblem(
        `Merlin keeps conclusions only, never email text. This call had ${extra.slice(0, 3).join(", ")}, so nothing was saved. Send only: ${CLAUDE_FIELDS.join(", ")}.`,
      );
    const x = e as Record<string, unknown>;
    for (const [k, max] of [["company", 200], ["person_name", 80], ["person_title", 100]] as const)
      if (x[k] !== undefined && (typeof x[k] !== "string" || looksLikeText(x[k] as string, max)))
        throw new NetworkProblem(`${k} reads like email text, not a ${k === "company" ? "website or name" : k === "person_name" ? "name" : "title"}. Nothing was saved. Send conclusions only.`);
  }
  const [seed, s0] = await Promise.all([loadSeed(), loadState()]);
  if (savesToday(netOf(s0, member.id), nowMs) >= CLAUDE_SAVES_DAILY) throw new NetworkProblem(`That's ${CLAUDE_SAVES_DAILY} saves today, the most in a day. Save the rest tomorrow.`);
  const dir = directory(seed, s0);
  const own = ownDomains(member, netOf(s0, member.id));
  const incoming = new Map<string, NetCompany>();
  let notOnMerlin = 0;
  const skipped = { not_a_company: 0, your_own_or_personal_email: 0, over_todays_limit: 0 };
  for (const e of entriesRaw as Record<string, unknown>[]) {
    const raw = String(e.company ?? "").trim();
    if (!raw) {
      skipped.not_a_company++;
      continue;
    }
    const host = raw.includes("@") ? domainOf(raw) : !/\s/.test(raw) ? siteKey(raw) : null;
    let id: string | null = null;
    if (host) {
      if (isFreeMail(host) || [...own].some((o) => host === o || host.endsWith(`.${o}`))) {
        skipped.your_own_or_personal_email++;
        continue;
      }
      id = matchDomain(dir, host);
    } else id = matchOrg(dir, raw);
    if (!id) {
      notOnMerlin++;
      continue;
    }
    const emails = Number.isFinite(Number(e.emails)) ? Math.max(0, Math.min(100_000, Math.round(Number(e.emails)))) : 0;
    const last = cleanDate(e.last_contact, nowMs);
    const first = cleanDate(e.first_contact, nowMs);
    const rel = typeof e.relationship === "string" && (RELATIONSHIPS as readonly string[]).includes(e.relationship.toLowerCase()) ? e.relationship.toLowerCase() : undefined;
    const name = typeof e.person_name === "string" ? e.person_name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    const title = typeof e.person_title === "string" ? e.person_title.replace(/\s+/g, " ").trim().slice(0, 100) : "";
    const c = incoming.get(id) ?? { people: [], ...(host ? { domain: host } : {}) };
    c.emails = (c.emails ?? 0) + emails;
    if (last && (!c.last || last > c.last)) c.last = last;
    if (first && (!c.first || first < c.first)) c.first = first;
    if (name && c.people.length < 50) {
      const p: NetPerson = { key: `n:${name.toLowerCase()}`, name, src: ["claude"], ...(title ? { title } : {}), ...(emails ? { emails } : {}), ...(e.both_ways === true ? { both: true } : {}) };
      if (last) p.last = last;
      if (first) p.first = first;
      if (rel) p.rel = rel;
      const at = c.people.findIndex((x) => x.key === p.key);
      if (at >= 0) c.people[at] = p;
      else c.people.push(p);
    } else if (!name) c.people.push({ key: `n:@${id}`, src: ["claude"], ...(emails ? { emails } : {}), ...(e.both_ways === true ? { both: true } : {}), ...(last ? { last } : {}), ...(rel ? { rel } : {}) });
    incoming.set(id, c);
  }
  const at = new Date(nowMs).toISOString();
  const matched = await T.mutate((s) => {
    const nets = netsOf(s);
    const n = (nets[member.id] ??= {});
    if (savesToday(n, nowMs) >= CLAUDE_SAVES_DAILY) throw new NetworkProblem(`That's ${CLAUDE_SAVES_DAILY} saves today, the most in a day. Save the rest tomorrow.`);
    const known = networkIds(n);
    const cl = (n.claude ??= { at, companies: {}, unmatched: 0, real: 0, saves: [], named: [] });
    cl.saves = [...cl.saves.filter((x) => nowMs - Date.parse(x) < DAY), at];
    cl.named = cl.named.filter((x) => nowMs - Date.parse(x.at) < DAY);
    let ok = 0;
    for (const [id, c] of incoming) {
      if (!known.has(id)) {
        if (cl.named.length >= CLAUDE_NEW_DAILY) {
          skipped.over_todays_limit++;
          continue;
        }
        cl.named.push({ id, at });
      }
      const was = cl.companies[id];
      if (was) {
        const people = new Map(was.people.map((p) => [p.key, p]));
        for (const p of c.people) people.set(p.key, p);
        c.people = [...people.values()].slice(0, 50);
      }
      c.people = c.people.slice(0, 8);
      cl.companies[id] = c;
      ok++;
    }
    cl.at = at;
    cl.unmatched = notOnMerlin;
    cl.real = Object.values(cl.companies).reduce((a, x) => a + x.people.filter((p) => p.both).length, 0);
    return ok;
  });
  const s = await loadState();
  const top = companiesOf(seed, s, netOf(s, member.id), nowMs)
    .slice(0, 10)
    .map((c) => ({ company_id: c.id, company: c.name, warmth: c.warmth, last_contact: c.last, people: c.people.length, sources: c.src }));
  return {
    matched,
    not_on_merlin: notOnMerlin,
    skipped,
    saves_left_today: Math.max(0, CLAUDE_SAVES_DAILY - savesToday(netOf(s, member.id), nowMs)),
    top_warm_matches: top,
    note: "Saved for the member only. Other members never see it, it earns and costs no credits, and they can delete it on Your network in Merlin.",
  };
}

/** my_network: the member's own network on Merlin, companies with warmth. Never the people's names or emails. */
export async function myNetworkForClaude(member: Member, nowMs = Date.now()) {
  if (!networkOn()) throw new NetworkProblem("Your network isn't on for Merlin yet.");
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const n = netOf(s, member.id);
  const list = companiesOf(seed, s, n, nowMs);
  return {
    companies_you_know_people_at: list.length,
    google: n?.google ? (n.google.status === "reconnect" ? "Needs reconnecting on Merlin" : "Connected") : "Not connected",
    companies: list.slice(0, 100).map((c) => ({
      company_id: c.id,
      company: c.name,
      website: c.site,
      warmth: c.warmth,
      last_contact: c.last,
      ...(c.next ? { next_meeting: c.next } : {}),
      people: c.people.length + c.more,
      decision_makers: c.people.filter((p) => p.dm).length,
      sources: c.src,
    })),
    note: "Only the member's own network. Named for them free, like a company they own; seat holders and people there still cost their usual unlocks.",
  };
}

/** [google network] my_account's one line, or nothing. */
export async function accountLine(memberId: string): Promise<{ your_network?: string }> {
  if (!networkOn()) return {};
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const n = netOf(s, memberId);
  if (!n) return {};
  const k = companiesOf(seed, s, n).length;
  const where = n.google ? (n.google.status === "reconnect" ? "Google needs reconnecting on Merlin" : "Google connected") : "Saved from your Gmail via Claude";
  return { your_network: `${where}: ${k} ${k === 1 ? "company" : "companies"} you know people at` };
}
