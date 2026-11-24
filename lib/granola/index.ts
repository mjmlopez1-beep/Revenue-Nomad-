/**
 * Granola for one member (lib/granola/types.ts says what is kept and why): Connect Granola (the
 * sign-in, lib/granola/oauth.ts) or a personal API key, the status the page shows, Disconnect, the
 * recent calls with a company or a person, and one picked call's transcript for drafting
 * (granolaTranscript). A sign-in link asks Granola's MCP tools (lib/granola/mcp.ts); a key link
 * Granola's REST API (lib/granola/api.ts). The member sees one status and one Disconnect either way.
 *
 * Tokens and the key are sealed at rest and opened only here, right before a request to Granola.
 * They are never logged, never in an answer (only a key's last four characters) and never in the
 * admin export.
 * Nothing Granola returns is stored: calls are read when the member opens the picker and kept in
 * memory only, for 2 minutes per member and query (never on disk, gone at Disconnect), so opening,
 * picking and typing don't ask Granola again; a transcript is read when the member picks a call, for
 * that request alone. A note's title goes to the member only when they asked for titles, and never
 * into a log, an alert or a count.
 */
import { randomBytes } from "crypto";
import { loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "../table";
import { seal, unseal } from "../google/crypto";
import { domainOf } from "../google/types";
import { MAX_TRANSCRIPT } from "../proposals/extract";
import * as G from "./api";
import * as O from "./oauth";
import { McpClient, codeOfToolError, type ToolAnswer } from "./mcp";
import { nextCursor, readMeetings, readTranscriptPage, transcriptLines, type Meeting } from "./meetings";
import {
  CALLS_MAX, CALL_DAYS, GRANOLA_WORDS as W, KEY_SHAPE, MEETING_ID, NOTES_READ_MAX, NOTE_ID, granolaOn,
  type CallPerson, type CallsAnswer, type GranolaCall, type GranolaLink, type GranolaStatus, type GranolaTranscript,
} from "./types";

export { granolaOn } from "./types";
export type { CallsAnswer, GranolaCall, GranolaStatus, GranolaTranscript } from "./types";

const DAY = 86_400_000;
/** A refusal in the member's words, with the HTTP status the route answers. */
export class GranolaProblem extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "",
  ) {
    super(message);
  }
}

type GState = State & { granola?: Record<string, GranolaLink> };
const linksOf = (s: State) => ((s as GState).granola ??= {});
export const linkOf = (s: State, memberId: string): GranolaLink | undefined => (s as GState).granola?.[memberId];

async function who(token: string | null | undefined): Promise<{ seed: Seed; s: State; m: Member } | null> {
  if (!token) return null;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  return m ? { seed, s, m } : null;
}
async function signedIn(token: string | null | undefined) {
  if (!granolaOn()) throw new GranolaProblem(W.off, 404, "off");
  const w = await who(token);
  if (!w) throw new GranolaProblem("You're signed out. Sign in again.", 401, "signed_out");
  return w;
}

function statusOf(s: State, m: Member, nowMs = Date.now()): GranolaStatus {
  const l = linkOf(s, m.id);
  const canDraft = T.closeNow(s, m.id, nowMs);
  if (!granolaOn()) return { on: false, connected: false, canDraft };
  if (!l) return { on: true, connected: false, canDraft };
  if (l.via === "oauth") return { on: true, connected: true, via: "oauth", connectedAt: l.connectedAt, ...(l.badAt ? { broken: true } : {}), canDraft };
  return { on: true, connected: true, via: "key", last4: l.last4, connectedAt: l.connectedAt, ...(l.badAt ? { broken: true } : {}), canDraft };
}
/** The status, and for a member not connected whether Connect Granola can be offered (discovery and Merlin's client, cached a few hours). */
async function statusNow(s: State, m: Member, nowMs = Date.now()): Promise<GranolaStatus> {
  const st = statusOf(s, m, nowMs);
  if (st.on && !st.connected) st.oauth = await O.signInReady();
  return st;
}

/** GET status: what the Integrations card and the picker show. Null when signed out. */
export async function granolaStatus(token: string | null | undefined, nowMs = Date.now()): Promise<GranolaStatus | null> {
  const w = await who(token);
  return w ? statusNow(w.s, w.m, nowMs) : null;
}

/** Granola's refusal in the member's words. `transcript`: the request was for a transcript. `oauth`: the member connected with Granola's sign-in. */
function wordsFor(e: unknown, o: { connecting?: boolean; transcript?: boolean; oauth?: boolean } = {}): GranolaProblem {
  if (!(e instanceof G.GranolaError)) return new GranolaProblem(W.down, 424, "error");
  switch (e.code) {
    case "bad_key":
    case "bad_client":
      if (o.oauth) return new GranolaProblem(W.signInRevoked, 409, "bad_key");
      return new GranolaProblem(o.connecting ? W.badKey : W.revoked, o.connecting ? 400 : 409, "bad_key");
    case "pending":
      return new GranolaProblem(W.pending, 409, "pending");
    case "no_transcript":
      return new GranolaProblem(W.noTranscript, 404, "no_transcript");
    case "no_plan":
      return new GranolaProblem(W.noPlan, 403, "no_plan");
    case "suspended":
      return new GranolaProblem(W.suspended, 403, "suspended");
    case "ip":
      return new GranolaProblem(W.ip, 403, "ip");
    case "forbidden":
      return new GranolaProblem(o.transcript ? W.noTranscripts : W.scope, 403, o.transcript ? "no_transcripts" : "forbidden");
    case "not_found":
      return new GranolaProblem(W.notFound, 404, "not_found");
    case "busy":
      return new GranolaProblem(W.busy, 429, "busy");
    default:
      return new GranolaProblem(W.down, 424, e.code);
  }
}

/** The member's key, opened. A key that won't open (another server secret) is as good as none. */
function keyOf(l: GranolaLink): string {
  const key = unseal(l.key);
  if (!key) throw new GranolaProblem(W.revoked, 409, "bad_key");
  return key;
}

/** After a call: a refused key or sign-in is marked (the card says so), a working one dated (at most hourly, so reads don't write each time). */
async function noteOutcome(memberId: string, e: unknown, connectedAt: string, nowMs = Date.now()) {
  const bad = e instanceof G.GranolaError && (e.code === "bad_key" || e.code === "bad_client");
  const l = linkOf(await loadState(), memberId);
  if (!l || l.connectedAt !== connectedAt) return;
  if (bad && !l.badAt) await T.mutate((s) => void (linkOf(s, memberId)?.connectedAt === connectedAt && (linkOf(s, memberId)!.badAt = new Date(nowMs).toISOString())));
  if (!e && (l.badAt || !l.okAt || nowMs - Date.parse(l.okAt) > 3_600_000))
    await T.mutate((s) => {
      const x = linkOf(s, memberId);
      if (!x || x.connectedAt !== connectedAt) return;
      x.okAt = new Date(nowMs).toISOString();
      delete x.badAt;
    });
}

/* ---------- a sign-in link: Granola's MCP server, the tokens renewed as they run out ---------- */

/** A new access token from the refresh token, kept sealed (a rotated refresh token too). One at a time per member. */
function renewFor(memberId: string, connectedAt: string): Promise<string> {
  return O.renewOnce(memberId, async () => {
    const l = linkOf(await loadState(), memberId);
    if (!l || l.via !== "oauth" || l.connectedAt !== connectedAt) throw new GranolaProblem(W.notConnected, 409, "not_connected");
    const refresh = unseal(l.refresh);
    if (!refresh) throw new G.GranolaError("bad_key", 401);
    const p = await O.prepared().catch(() => {
      throw new G.GranolaError("unreachable");
    });
    // Tokens issued to an earlier registration don't refresh on the new one: connect again.
    if (l.client && l.client !== p.app.clientId) throw new G.GranolaError("bad_key", 401);
    let t: O.Tokens;
    try {
      t = await O.refreshGrant(p, refresh);
    } catch (e) {
      if (e instanceof G.GranolaError && e.code === "bad_client") await O.dropApp(p.app.clientId);
      throw e;
    }
    await T.mutate((s) => {
      const x = linkOf(s, memberId);
      if (!x || x.connectedAt !== connectedAt) return;
      x.access = seal(t.access);
      if (t.refresh) x.refresh = seal(t.refresh);
      if (t.expiresAt) x.expiresAt = t.expiresAt;
      else delete x.expiresAt;
    });
    return t.access;
  });
}

/**
 * One MCP client per member, kept while it is used (MCP_KEEP_MS since its last use), so a list and
 * the transcript after it share one session: no initialize before every call. A new connection
 * (another connectedAt), Disconnect, account closure or any failure starts a new one.
 */
const MCP_KEEP_MS = 4 * 60_000;
type McpSession = { c: McpClient; connectedAt: string; url: string; access: string; used: number };
const mcpSessions = new Map<string, McpSession>();
const dropMcp = (memberId: string) => void mcpSessions.delete(memberId);

async function mcpFor(memberId: string, l: GranolaLink): Promise<McpClient> {
  const p = await O.prepared().catch(() => {
    throw new G.GranolaError("unreachable");
  });
  let access = unseal(l.access);
  if (!access) throw new G.GranolaError("bad_key", 401);
  // Running out within a minute: renewed first.
  if (l.expiresAt && Date.parse(l.expiresAt) - Date.now() < 60_000 && l.refresh) access = await renewFor(memberId, l.connectedAt);
  const was = mcpSessions.get(memberId);
  if (was && was.connectedAt === l.connectedAt && was.url === p.d.mcpUrl && Date.now() - was.used < MCP_KEEP_MS) {
    // The token on file now (renewed by another request, perhaps), with the session kept.
    was.access = access;
    was.used = Date.now();
    return was.c;
  }
  const s = { connectedAt: l.connectedAt, url: p.d.mcpUrl, access, used: Date.now() } as McpSession;
  s.c = new McpClient(
    p.d.mcpUrl,
    () => s.access,
    async () => {
      if (!l.refresh) throw new G.GranolaError("bad_key", 401);
      s.access = await renewFor(memberId, l.connectedAt);
      return s.access;
    },
    G.keyId(`oauth:${memberId}`),
  );
  mcpSessions.set(memberId, s);
  if (mcpSessions.size > 2000) for (const [k, v] of mcpSessions) if (Date.now() - v.used >= MCP_KEEP_MS) mcpSessions.delete(k);
  return s.c;
}

/** A tool's answer, or its error as a GranolaError. */
async function tool(c: McpClient, name: string, args: Record<string, unknown>): Promise<ToolAnswer> {
  const a = await c.tool(name, args);
  if (a.isError) throw new G.GranolaError(codeOfToolError(a.text));
  return a;
}

/** Work with the member's connection, either kind: refusals in the member's words, the outcome noted on the link. */
async function withLink<T>(memberId: string, work: { key: (key: string) => Promise<T>; mcp: (c: McpClient) => Promise<T> }, o: { transcript?: boolean } = {}): Promise<T> {
  const l = linkOf(await loadState(), memberId);
  if (!l) throw new GranolaProblem(W.notConnected, 409, "not_connected");
  const oauth = l.via === "oauth";
  try {
    const out = oauth ? await work.mcp(await mcpFor(memberId, l)) : await work.key(keyOf(l));
    await noteOutcome(memberId, null, l.connectedAt).catch(() => {});
    return out;
  } catch (e) {
    if (oauth) dropMcp(memberId);
    if (e instanceof GranolaProblem) throw e;
    await noteOutcome(memberId, e, l.connectedAt).catch(() => {});
    console.error(`Granola: a request failed (${e instanceof G.GranolaError ? e.code : "error"}${oauth ? ", sign-in" : ""})`);
    throw wordsFor(e, { ...o, oauth });
  }
}

/* ---------- connect and disconnect ---------- */

/** POST connect { key }: check the key with one cheap call (one note), then keep it sealed. */
export async function connectGranola(token: string | null | undefined, rawKey: unknown, nowMs = Date.now()): Promise<{ status: GranolaStatus; message: string }> {
  const w = await signedIn(token);
  const key = String(rawKey ?? "").trim();
  if (!KEY_SHAPE.test(key)) throw new GranolaProblem(W.shape, 400, "shape");
  try {
    await G.listNotes(key, { pageSize: 1 });
  } catch (e) {
    console.error(`Granola connect: the key check failed (${e instanceof G.GranolaError ? e.code : "error"})`);
    throw wordsFor(e, { connecting: true });
  }
  const at = new Date(nowMs).toISOString();
  const link: GranolaLink = { key: seal(key), last4: key.slice(-4), connectedAt: at, okAt: at };
  let was: GranolaLink | undefined;
  const s = await T.mutate((d) => {
    was = linksOf(d)[w.m.id];
    linksOf(d)[w.m.id] = link;
    return d;
  });
  // A sign-in this key replaces: its tokens end at Granola too.
  if (was?.via === "oauth") void endAtGranola(was);
  return { status: statusOf(s, w.m, nowMs), message: "Granola is connected. Pick a call when you start a proposal." };
}

/* ---------- Connect Granola: the sign-in ---------- */

/** Where Granola sends the member back to: a path in the app only (never another site), else Settings at the Granola row. */
export function backPath(x: unknown): string {
  const v = typeof x === "string" ? x.trim() : "";
  if (!/^\/(?!\/)[^\s\\]{0,400}$/.test(v) || /^\/api\//.test(v)) return "/?p=settings&sec=conn&open=granola";
  try {
    const u = new URL(v, "https://merlin.invalid");
    if (u.origin !== "https://merlin.invalid") return "/?p=settings&sec=conn&open=granola";
    u.searchParams.delete("granola");
    return `${u.pathname}${u.search}`;
  } catch {
    return "/?p=settings&sec=conn&open=granola";
  }
}
/** The back path with the outcome on it (?granola=connected|denied|failed|unavailable), read once by the page. */
export const backWith = (back: string, outcome: SignInOutcome) => `${back}${back.includes("?") ? "&" : "?"}granola=${outcome}`;

export type SignInOutcome = "connected" | "denied" | "failed" | "unavailable";
export type StartAnswer = { ok: true; url: string; cookie: string } | { ok: false; why: "off" | "signed_out" | "unavailable"; back: string };

/**
 * GET start?back=<path>: the member's consent page at Granola. A state and a PKCE verifier go in
 * a sealed cookie bound to the member and this session (10 minutes, used once); Granola gets the
 * state, the S256 challenge, Merlin's client and the redirect address.
 */
export async function startSignIn(token: string | null | undefined, back: unknown, nowMs = Date.now()): Promise<StartAnswer> {
  const to = backPath(back);
  if (!granolaOn()) return { ok: false, why: "off", back: to };
  const w = await who(token);
  if (!w || !token) return { ok: false, why: "signed_out", back: to };
  let p: O.Prepared;
  try {
    p = await O.prepared();
  } catch {
    return { ok: false, why: "unavailable", back: to };
  }
  const { verifier, challenge } = O.pkce();
  const state = randomBytes(32).toString("base64url");
  const cookie = O.packState({ state, verifier, memberId: w.m.id, token, back: to, clientId: p.app.clientId, issuer: p.d.issuer }, nowMs);
  return { ok: true, url: O.authorizeUrl(p, state, challenge), cookie };
}

/**
 * GET callback: Granola's answer. The cookie's state must match, for this member and session,
 * once. Then the code is swapped (with the verifier) for tokens, kept sealed. A client Granola
 * no longer knows is dropped, so the next start registers Merlin again.
 */
export async function finishSignIn(
  token: string | null | undefined,
  q: { state: string | null; code: string | null; error: string | null },
  cookie: string | null | undefined,
  nowMs = Date.now(),
): Promise<{ outcome: SignInOutcome; back: string }> {
  const fallback = backPath(O.backOf(cookie));
  if (!granolaOn()) return { outcome: "failed", back: fallback };
  const w = await who(token);
  if (!w || !token) return { outcome: "failed", back: fallback };
  const st = O.openState(cookie, q.state, token, w.m.id, nowMs);
  if (!st) return { outcome: "failed", back: fallback };
  const back = backPath(st.back);
  if (q.error) {
    if (q.error === "invalid_client" || q.error === "unauthorized_client") await O.dropApp(st.clientId);
    return { outcome: q.error === "access_denied" ? "denied" : "failed", back };
  }
  const code = String(q.code ?? "");
  if (!code || code.length > 2000) return { outcome: "failed", back };
  let p: O.Prepared;
  try {
    p = await O.prepared();
  } catch {
    return { outcome: "unavailable", back };
  }
  if (p.app.clientId !== st.clientId || p.d.issuer !== st.issuer) return { outcome: "failed", back };
  let t: O.Tokens;
  try {
    t = await O.exchangeCode(p, code, st.verifier);
  } catch (e) {
    console.error(`Granola connect: the code exchange failed (${e instanceof G.GranolaError ? e.code : "error"})`);
    if (e instanceof G.GranolaError && e.code === "bad_client") await O.dropApp(p.app.clientId);
    return { outcome: "failed", back };
  }
  const at = new Date(nowMs).toISOString();
  const link: GranolaLink = { via: "oauth", access: seal(t.access), ...(t.refresh ? { refresh: seal(t.refresh) } : {}), ...(t.expiresAt ? { expiresAt: t.expiresAt } : {}), client: p.app.clientId, connectedAt: at, okAt: at };
  // Connected either way, once: a key on file before is replaced (and deleted).
  await T.mutate((d) => void (linksOf(d)[w.m.id] = link));
  return { outcome: "connected", back };
}

/** Ask Granola to end a sign-in's tokens, when it advertises a revocation endpoint. Best effort; never throws. */
async function endAtGranola(l: GranolaLink): Promise<boolean> {
  if (l.via !== "oauth") return false;
  try {
    const p = await O.prepared();
    if (!p.d.revoke) return false;
    const refresh = unseal(l.refresh);
    const access = unseal(l.access);
    const done = await Promise.all([refresh ? O.revokeToken(p, refresh, "refresh_token") : true, access ? O.revokeToken(p, access, "access_token") : true]);
    return done.every(Boolean);
  } catch {
    return false;
  }
}

/**
 * POST disconnect: delete the connection. A sign-in's tokens are revoked at Granola first when it
 * advertises a revocation endpoint; a key stays valid at Granola until the member revokes it there.
 */
export async function disconnectGranola(token: string | null | undefined, nowMs = Date.now()): Promise<{ status: GranolaStatus; message: string }> {
  const w = await who(token);
  if (!w) throw new GranolaProblem("You're signed out. Sign in again.", 401, "signed_out");
  const l = linkOf(w.s, w.m.id);
  const ended = l?.via === "oauth" ? await endAtGranola(l) : false;
  forgetInMemory(w.m.id);
  const s = await T.mutate((d) => {
    delete (d as GState).granola?.[w.m.id];
    return d;
  });
  const message =
    l?.via === "oauth"
      ? ended
        ? "Granola is disconnected. Merlin ended its access at Granola and deleted it here."
        : "Granola is disconnected. Merlin deleted its access. Granola may still list Merlin among your connected apps until you remove it there."
      : "Granola is disconnected. Merlin deleted your key. To turn it off in Granola too, revoke it under Settings, Connectors, API keys.";
  return { status: await statusNow(s, w.m, nowMs), message };
}

/** Account closure (lib/account.ts) and the 30-day delete (lib/table.ts purgeMember): the connection goes, inside the caller's mutate; a sign-in's tokens are revoked at Granola afterwards. */
export function forgetGranolaIn(s: State, memberId: string): void {
  const l = (s as GState).granola?.[memberId];
  delete (s as GState).granola?.[memberId];
  forgetInMemory(memberId);
  if (l?.via === "oauth") setTimeout(() => void endAtGranola(l), 0);
}

/** What Merlin holds in memory for a member's Granola (the kept calls, the MCP session): dropped. */
function forgetInMemory(memberId: string): void {
  dropMcp(memberId);
  kept.delete(memberId);
  for (const k of [...asking.keys()]) if (k.startsWith(`${memberId}|`)) asking.delete(k);
}

/* ---------- the calls ---------- */

const low = (x: unknown) => String(x ?? "").trim().toLowerCase();
const validIso = (x: unknown) => (typeof x === "string" && Number.isFinite(Date.parse(x)) ? x : null);

type Filter = { kind: "company"; domain: string } | { kind: "email"; email: string } | { kind: "recent" };
const matches = (f: Filter, email: string) =>
  f.kind === "recent" ? false : f.kind === "email" ? email === f.email : !!domainOf(email) && (domainOf(email) === f.domain || domainOf(email)!.endsWith(`.${f.domain}`));

/** One note as a call: who else was on it (attendees and invitees, without the member and the note's owner), when, how long. */
function callOf(n: G.Note, ref: G.NoteRef | undefined, own: Set<string>, f: Filter, titles: boolean): (GranolaCall & { hit: boolean }) | null {
  const people = new Map<string, CallPerson>();
  for (const a of n.attendees ?? []) {
    const email = low(a?.email);
    if (email && !people.has(email)) people.set(email, { name: String(a?.name ?? "").trim().slice(0, 80), email });
  }
  for (const i of n.calendar_event?.invitees ?? []) {
    const email = low(i?.email);
    if (email && !people.has(email)) people.set(email, { name: "", email });
  }
  for (const o of [...own, low(n.owner?.email ?? ref?.owner?.email)]) if (o) people.delete(o);
  const all = [...people.values()].filter((p) => domainOf(p.email));
  const hit = all.some((p) => matches(f, p.email));
  const sorted = [...all.filter((p) => matches(f, p.email)), ...all.filter((p) => !matches(f, p.email))];
  const start = validIso(n.calendar_event?.scheduled_start_time);
  const end = validIso(n.calendar_event?.scheduled_end_time);
  const when = start ?? validIso(ref?.meeting_at) ?? validIso(n.meeting_at) ?? validIso(n.created_at) ?? validIso(ref?.created_at);
  if (!when) return null;
  const mins = start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 60_000) : NaN;
  const title = String(n.title ?? ref?.title ?? "").trim();
  return { noteId: n.id, when, minutes: mins > 0 && mins <= 12 * 60 ? mins : null, with: sorted.slice(0, 8), more: Math.max(0, sorted.length - 8), ...(titles && title ? { title: title.slice(0, 200) } : {}), hit };
}

/** The member's own addresses, never counted as the other side of a call. */
const ownOf = (m: Member) => new Set([low(m.email)].filter(Boolean));

/** The company's domain as the member sees it on Merlin: refused while the company is locked for them. */
async function companyDomain(m: Member, companyId: string): Promise<string> {
  const { memberView } = await import("../mcp/view");
  const info = (await memberView(m)).byId.get(companyId);
  if (!info) throw new GranolaProblem(W.noCompany, 404, "no_company");
  if (info.c.hidden) throw new GranolaProblem(W.locked, 403, "locked");
  const d = String(info.domain ?? "").toLowerCase().replace(/^www\./, "");
  if (!d || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new GranolaProblem(W.noDomain, 409, "no_domain");
  return d;
}

/**
 * Recent calls (the last CALL_DAYS days) with anyone at a company's domain, with one email, or any
 * recent call (`recent`), newest first. Granola's search finds the meetings with that domain or
 * email on the invite; the newest notes are read too, since a note is searchable only a while
 * after its summary is written (today's call may not be there yet). Each candidate note is read
 * once, without its transcript, and checked here against its attendees.
 */
export async function callsFor(
  m: Member,
  a: { companyId?: unknown; email?: unknown; recent?: unknown; titles?: unknown },
  nowMs = Date.now(),
  o: { gate?: () => void } = {},
): Promise<CallsAnswer> {
  if (!granolaOn()) throw new GranolaProblem(W.off, 404, "off");
  let f: Filter;
  const email = low(a.email);
  if (typeof a.companyId === "string" && a.companyId) f = { kind: "company", domain: await companyDomain(m, a.companyId) };
  else if (email) {
    if (!domainOf(email) || email.length > 200) throw new GranolaProblem(W.email, 400, "email");
    f = { kind: "email", email };
  } else f = { kind: "recent" };
  const titles = a.titles === true || a.titles === "1";
  const fromMs = nowMs - CALL_DAYS * DAY;
  const own = ownOf(m);
  const l = linkOf(await loadState(), m.id);
  // The same question again within 2 minutes, or one already on its way: answered without Granola.
  const qk = `${l?.connectedAt ?? ""}|${f.kind}:${f.kind === "company" ? f.domain : f.kind === "email" ? f.email : ""}|${titles ? "t" : ""}`;
  if (l) {
    const hit = kept.get(m.id)?.get(qk);
    if (hit && nowMs - hit.at < CALLS_KEEP_MS && nowMs >= hit.at - 60_000) return copyOf(hit.a);
    const going = asking.get(`${m.id}|${qk}`);
    if (going) return going.then(copyOf);
  }
  // Only a question that goes to Granola counts against the member's limit (the route's gate).
  o.gate?.();
  const run = withLink(m.id, { key: (key) => callsByKey(key, f, own, titles, fromMs, nowMs), mcp: (c) => callsByMcp(c, f, own, titles, fromMs, nowMs) }).then((ans) => {
    if (l && asking.has(`${m.id}|${qk}`)) keep(m.id, qk, nowMs, ans);
    return ans;
  });
  if (!l) return run;
  const k = `${m.id}|${qk}`;
  asking.set(k, run);
  void run.catch(() => {}).finally(() => asking.get(k) === run && asking.delete(k));
  return run.then(copyOf);
}

/* ---------- the calls kept a moment: in memory only, per member and query ---------- */

const CALLS_KEEP_MS = 2 * 60_000;
const KEPT_PER_MEMBER = 20;
const kept = new Map<string, Map<string, { at: number; a: CallsAnswer }>>();
const asking = new Map<string, Promise<CallsAnswer>>();
const copyOf = (a: CallsAnswer): CallsAnswer => ({ ...a, calls: a.calls.map((c) => ({ ...c, with: c.with.slice() })) });
function keep(memberId: string, qk: string, at: number, a: CallsAnswer): void {
  let mine = kept.get(memberId);
  if (!mine) {
    if (kept.size >= 2000) kept.delete(kept.keys().next().value!);
    kept.set(memberId, (mine = new Map()));
  }
  mine.delete(qk);
  mine.set(qk, { at, a: copyOf(a) });
  while (mine.size > KEPT_PER_MEMBER) mine.delete(mine.keys().next().value!);
}
/** For the checks (scripts/test-granola.mts, test-call-picker.mts): forget every kept list, or one member's. */
export const _callsKept = {
  clear(memberId?: string) {
    if (memberId) forgetInMemory(memberId);
    else (kept.clear(), asking.clear(), mcpSessions.clear());
  },
  size: (memberId: string) => kept.get(memberId)?.size ?? 0,
};

/** By key (Granola's REST API): the search by domain or email, the newest notes, each read once without its transcript. */
async function callsByKey(key: string, f: Filter, own: Set<string>, titles: boolean, fromMs: number, nowMs: number): Promise<CallsAnswer> {
  const refs = new Map<string, G.NoteRef>();
  const add = (ns: G.NoteRef[]) => ns.forEach((n) => NOTE_ID.test(n.id) && !refs.has(n.id) && refs.set(n.id, n));
  if (f.kind === "recent") add((await G.listNotes(key, { createdAfterMs: fromMs })).notes);
  else {
    const participant = f.kind === "email" ? f.email : f.domain;
    const search = async (): Promise<G.NoteRef[]> => {
      try {
        const page = await G.searchNotes(key, { participant, fromMs });
        // A full first page is enough to fill the list: no second round trip.
        if (!page.cursor || page.notes.length >= CALLS_MAX) return page.notes;
        return [...page.notes, ...(await G.searchNotes(key, { participant, fromMs, cursor: page.cursor })).notes];
      } catch (e) {
        // A search Granola won't run (an odd domain): the newest notes alone still answer.
        if (!(e instanceof G.GranolaError) || e.code !== "invalid") throw e;
        return [];
      }
    };
    // The search and the newest notes at once (two round trips side by side, not one after the other).
    const [found, latest] = await Promise.all([search(), G.listNotes(key, { createdAfterMs: nowMs - 2 * DAY })]);
    add(found);
    add(latest.notes);
  }
  const newest = [...refs.values()]
    .map((r) => ({ r, at: Date.parse(r.meeting_at ?? r.created_at ?? "") || 0 }))
    .filter((x) => !x.at || x.at >= fromMs - DAY)
    .sort((x, y) => y.at - x.at)
    .slice(0, NOTES_READ_MAX);
  const notes = await Promise.all(
    newest.map(({ r }) =>
      G.getNote(key, r.id).catch((e) => {
        // A note deleted or not readable since the list: left out. Anything else stops the answer.
        if (e instanceof G.GranolaError && e.code === "not_found") return null;
        throw e;
      }),
    ),
  );
  const calls = notes
    .map((n, i) => (n && typeof n.id === "string" ? callOf(n, newest[i].r, own, f, titles) : null))
    .filter((c): c is GranolaCall & { hit: boolean } => !!c && Date.parse(c.when) >= fromMs && (f.kind === "recent" || c.hit))
    .sort((x, y) => y.when.localeCompare(x.when))
    .slice(0, CALLS_MAX)
    .map(({ hit: _hit, ...c }) => c); // eslint-disable-line @typescript-eslint/no-unused-vars
  return { calls, by: f, days: CALL_DAYS };
}

/** Who else was on a meeting: not the member, not the note's creator, only real addresses. */
const othersOf = (x: Meeting, own: Set<string>) => x.people.filter((p) => !own.has(p.email) && p.email !== x.creator && domainOf(p.email));

/** A meeting from Granola's MCP tools as a call: who else was on it (without the member and the note's creator), when, how long. */
function callOfMeeting(x: Meeting, own: Set<string>, f: Filter, titles: boolean): (GranolaCall & { hit: boolean }) | null {
  if (!x.when) return null;
  const people = othersOf(x, own);
  const sorted = [...people.filter((p) => matches(f, p.email)), ...people.filter((p) => !matches(f, p.email))];
  // Granola's search matched the participant itself: a meeting it lists without anyone else's email still counts.
  const hit = f.kind === "recent" || !people.length || people.some((p) => matches(f, p.email));
  return { noteId: x.id, when: x.when, minutes: x.minutes, with: sorted.slice(0, 8), more: Math.max(0, sorted.length - 8), ...(titles && x.title ? { title: x.title.slice(0, 200) } : {}), hit };
}

/**
 * By sign-in (Granola's MCP tools): search_meetings for the member's own meetings (attended_only)
 * in the last 30 days, with participant = the company's domain or the person's email (none for any
 * recent call), newest first, up to two pages. A meeting the search lists without anyone's email
 * is read with get_meetings (up to 10 at once) for its attendees. Nothing is kept.
 */
async function callsByMcp(c: McpClient, f: Filter, own: Set<string>, titles: boolean, fromMs: number, nowMs: number): Promise<CallsAnswer> {
  const found = new Map<string, Meeting>();
  const args: Record<string, unknown> = { from_date: new Date(fromMs).toISOString(), to_date: new Date(nowMs).toISOString(), limit: 20, attended_only: true, ...(f.kind === "company" ? { participant: f.domain } : f.kind === "email" ? { participant: f.email } : {}) };
  let cursor: string | null = null;
  for (let page = 0; page < 2; page++) {
    const a = await tool(c, "search_meetings", cursor ? { cursor } : args);
    for (const x of readMeetings(a)) if (MEETING_ID.test(x.id) && !found.has(x.id)) found.set(x.id, x);
    cursor = nextCursor(a);
    if (!cursor || found.size >= CALLS_MAX) break;
  }
  const bare = [...found.values()].filter((x) => !othersOf(x, own).length || !x.when).slice(0, 10);
  if (bare.length) {
    const a = await tool(c, "get_meetings", { meeting_ids: bare.map((x) => x.id), attachments: "none", max_participants: 20 });
    for (const x of readMeetings(a)) {
      const was = found.get(x.id);
      if (was) found.set(x.id, { ...was, when: was.when ?? x.when, minutes: was.minutes ?? x.minutes, title: was.title || x.title, people: x.people.length ? x.people : was.people, creator: was.creator ?? x.creator });
    }
  }
  const calls = [...found.values()]
    .map((x) => callOfMeeting(x, own, f, titles))
    .filter((x): x is GranolaCall & { hit: boolean } => !!x && Date.parse(x.when) >= fromMs && Date.parse(x.when) <= nowMs + 60_000 && x.hit)
    .sort((x, y) => y.when.localeCompare(x.when))
    .slice(0, CALLS_MAX)
    .map(({ hit: _hit, ...x }) => x); // eslint-disable-line @typescript-eslint/no-unused-vars
  return { calls, by: f, days: CALL_DAYS };
}

/** GET calls (the picker): the signed-in member's calls. */
export async function granolaCalls(token: string | null | undefined, a: Parameters<typeof callsFor>[1], nowMs = Date.now(), o: Parameters<typeof callsFor>[3] = {}): Promise<CallsAnswer> {
  const w = await signedIn(token);
  return callsFor(w.m, a, nowMs, o);
}

/* ---------- calls that ended, for the "A call ends" trigger (lib/calls) ---------- */

/** A call from Granola for the trigger: when it started and ended, who else was on it, its title for Merlin's rules only. */
export interface EndedGranolaCall {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string;
  /** Who else was on it (the member and the note's owner left out). */
  with: CallPerson[];
}
/** A call with no length on file is taken to have run this long (the note exists once it starts). */
const ASSUMED_MINUTES = 30;
const endOf = (when: string, minutes: number | null) => new Date(Date.parse(when) + (minutes ?? ASSUMED_MINUTES) * 60_000).toISOString();

/**
 * The member's calls that ended in [sinceMs, nowMs], newest first, at most `max`, read the way the
 * picker reads them (by sign-in: search_meetings over the window, then get_meetings for who was on
 * a meeting the list gives bare; by key: the newest notes, each read once without its transcript).
 * Nothing is kept: the scheduler's tick reads them and drops them. The title goes to Merlin's own
 * rules (what kind of call it was) and nowhere else.
 */
export async function endedCallsFor(memberId: string, sinceMs: number, nowMs: number, max: number): Promise<EndedGranolaCall[]> {
  if (!granolaOn()) throw new GranolaProblem(W.off, 404, "off");
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = T.memberIndex(seed, s).all.find((x) => x.id === memberId);
  if (!m) throw new GranolaProblem("You're signed out. Sign in again.", 401, "signed_out");
  const own = ownOf(m);
  // A meeting started up to 12 hours before the window can end inside it.
  const fromMs = sinceMs - 12 * 3_600_000;
  const keep = (x: { id: string; when: string; minutes: number | null; title: string; with: CallPerson[] }): EndedGranolaCall | null => {
    const endedAt = endOf(x.when, x.minutes);
    const e = Date.parse(endedAt);
    return e >= sinceMs && e <= nowMs ? { id: x.id, title: x.title, startedAt: x.when, endedAt, with: x.with } : null;
  };
  const done = (xs: (EndedGranolaCall | null)[]) =>
    xs
      .filter((x): x is EndedGranolaCall => !!x)
      .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
      .slice(0, max);
  return withLink(m.id, {
    key: async (key) => {
      const refs = (await G.listNotes(key, { createdAfterMs: fromMs })).notes.filter((n) => NOTE_ID.test(n.id)).slice(0, NOTES_READ_MAX);
      const notes = await Promise.all(refs.map((r) => G.getNote(key, r.id).catch((e) => (e instanceof G.GranolaError && e.code === "not_found" ? null : Promise.reject(e)))));
      return done(
        notes.map((n, i) => {
          const c = n ? callOf(n, refs[i], own, { kind: "recent" }, true) : null;
          return c ? keep({ id: c.noteId, when: c.when, minutes: c.minutes, title: c.title ?? "", with: c.with }) : null;
        }),
      );
    },
    mcp: async (c) => {
      const found = new Map<string, Meeting>();
      const a = await tool(c, "search_meetings", { from_date: new Date(fromMs).toISOString(), to_date: new Date(nowMs).toISOString(), limit: 20, attended_only: true });
      for (const x of readMeetings(a)) if (MEETING_ID.test(x.id) && !found.has(x.id)) found.set(x.id, x);
      const bare = [...found.values()].filter((x) => !othersOf(x, own).length || !x.when || x.minutes === null).slice(0, 10);
      if (bare.length) {
        const b = await tool(c, "get_meetings", { meeting_ids: bare.map((x) => x.id), attachments: "none", max_participants: 20 });
        for (const x of readMeetings(b)) {
          const was = found.get(x.id);
          if (was) found.set(x.id, { ...was, when: was.when ?? x.when, minutes: was.minutes ?? x.minutes, title: was.title || x.title, people: x.people.length ? x.people : was.people, creator: was.creator ?? x.creator });
        }
      }
      return done(
        [...found.values()].map((x) => {
          if (!x.when) return null;
          return keep({ id: x.id, when: x.when, minutes: x.minutes, title: x.title, with: othersOf(x, own) });
        }),
      );
    },
  });
}

/* ---------- one call's transcript, for drafting ---------- */

const MAX_PAGES = 80;

/** "Name: what they said", one speaker turn a line. The member's own lines carry their name, so the reader knows them. */
function linesOf(items: G.TranscriptItem[], meName: string, themName: string): string {
  const out: { who: string; text: string }[] = [];
  let size = 0;
  for (const it of items) {
    const text = String(it?.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const sp = it?.speaker ?? {};
    const who =
      String(sp.name ?? "").trim() ||
      (sp.attribution === "me" ? meName : sp.attribution === "them" ? themName : "") ||
      String(sp.diarization_label ?? "").trim() ||
      (sp.source === "microphone" ? meName : sp.source === "speaker" ? themName : "Speaker");
    const last = out[out.length - 1];
    if (last && last.who === who) last.text += ` ${text}`;
    else out.push({ who, text });
    size += text.length + who.length + 3;
    if (size > MAX_TRANSCRIPT) break;
  }
  return out
    .map((l) => `${l.who}: ${l.text}`)
    .join("\n")
    .slice(0, MAX_TRANSCRIPT);
}

function minutesOf(items: G.TranscriptItem[]): number | null {
  const starts = items.map((i) => Date.parse(i?.start_time ?? "")).filter(Number.isFinite);
  const ends = items.map((i) => Date.parse(i?.end_time ?? "")).filter(Number.isFinite);
  if (!starts.length || !ends.length) return null;
  const m = Math.round((Math.max(...ends) - Math.min(...starts)) / 60_000);
  return m > 0 && m <= 12 * 60 ? m : null;
}

/**
 * One call's transcript as text, with who was on it, for the drafting code (the picker's
 * transcript route, and the draft-from-call path given a Granola note id). Read from Granola now
 * and returned: nothing of it is kept here. The caller gates drafting (Close).
 */
export async function granolaTranscript(memberId: string, noteId: string, o: { titles?: boolean } = {}): Promise<GranolaTranscript> {
  if (!granolaOn()) throw new GranolaProblem(W.off, 404, "off");
  const id = String(noteId ?? "").trim();
  if (!MEETING_ID.test(id)) throw new GranolaProblem(W.notFound, 404, "not_found");
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = T.memberIndex(seed, s).all.find((x) => x.id === memberId);
  if (!m) throw new GranolaProblem("You're signed out. Sign in again.", 401, "signed_out");
  return withLink(
    m.id,
    {
      mcp: (c) => transcriptByMcp(c, m, id, !!o.titles),
      key: async (key) => {
        // The REST API knows its own note ids only.
        if (!NOTE_ID.test(id)) throw new G.GranolaError("not_found", 404);
        let note: G.Note;
        let items: G.TranscriptItem[] | null;
        try {
          note = await G.getNote(key, id, true);
          items = Array.isArray(note.transcript) ? note.transcript : null;
        } catch (e) {
          if (!(e instanceof G.GranolaError) || e.code !== "too_large") throw e;
          // Too long to come with the note: the note alone, then the transcript in pages.
          note = await G.getNote(key, id, false);
          items = [];
          let cursor: string | null = null;
          for (let i = 0; i < MAX_PAGES; i++) {
            const p = await G.transcriptPage(key, id, cursor);
            items.push(...p.items);
            if (!p.cursor) break;
            cursor = p.cursor;
          }
        }
        // No transcript with the note: either transcripts are off over the API for the workspace (the transcript route says 403), or there is none.
        if (items === null) {
          items = (await G.transcriptPage(key, id, null, 1)).items;
        }
        const call = callOf(note, undefined, ownOf(m), { kind: "recent" }, !!o.titles);
        const attendees = call?.with ?? [];
        const others = attendees.filter((p) => p.name);
        const text = linesOf(items ?? [], m.name || "Me", others.length === 1 ? others[0].name : "Them");
        if (!text.trim()) throw new GranolaProblem(W.noTranscript, 404, "no_transcript");
        return { noteId: note.id || id, when: call?.when ?? new Date().toISOString(), minutes: minutesOf(items ?? []) ?? call?.minutes ?? null, attendees, text, ...(call?.title ? { title: call.title } : {}) };
      },
    },
    { transcript: true },
  );
}

/** A transcript page's size from get_meeting_transcript: Granola's own default. */
const PAGE_CHARS = 40_000;

/**
 * By sign-in: get_meetings for who was on the call and when, then get_meeting_transcript paged
 * through next_offset until the end or Merlin's size cap (MAX_TRANSCRIPT). Returned, never kept.
 */
async function transcriptByMcp(c: McpClient, m: Member, id: string, titles: boolean): Promise<GranolaTranscript> {
  const meta = readMeetings(await tool(c, "get_meetings", { meeting_ids: [id], attachments: "none", max_participants: 20 })).find((x) => x.id === id);
  if (!meta) throw new G.GranolaError("not_found", 404);
  const call = callOfMeeting(meta, ownOf(m), { kind: "recent" }, titles);
  const attendees = call?.with ?? [];
  const named = attendees.filter((p) => p.name);
  let raw = "";
  let offset = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = readTranscriptPage(await tool(c, "get_meeting_transcript", { meeting_id: id, include_timestamps: true, max_chars: PAGE_CHARS, ...(offset ? { offset } : {}) }));
    if (page.unavailable && !raw) throw new G.GranolaError(page.unavailable === "transcript_pending" ? "pending" : "no_transcript", 404);
    // Offsets are into the whole text, so pages join as they are; a page that starts a new line of its own ("[10:04:12] Dana: ...") gets its line break back.
    raw += (raw && !raw.endsWith("\n") && /^\s*\[\d/.test(page.text) ? "\n" : "") + page.text;
    if (!page.next || page.next <= offset || raw.length >= MAX_TRANSCRIPT) break;
    offset = page.next;
  }
  const { text, minutes } = transcriptLines(raw, m.name || "Me", named.length === 1 ? named[0].name : "Them", MAX_TRANSCRIPT);
  if (!text.trim()) throw new GranolaProblem(W.noTranscript, 404, "no_transcript");
  return { noteId: id, when: call?.when ?? meta.when ?? new Date().toISOString(), minutes: minutes ?? meta.minutes ?? null, attendees, text, ...(call?.title ? { title: call.title } : {}) };
}

/** GET transcript (the picker): the signed-in member's picked call. Drafting from a call is Close (the trial counts). */
export async function transcriptForPicker(token: string | null | undefined, noteId: unknown, o: { titles?: unknown } = {}, nowMs = Date.now()): Promise<GranolaTranscript> {
  const w = await signedIn(token);
  if (!T.closeNow(w.s, w.m.id, nowMs)) throw new GranolaProblem(W.close, 403, "close");
  return granolaTranscript(w.m.id, String(noteId ?? ""), { titles: o.titles === true || o.titles === "1" });
}
