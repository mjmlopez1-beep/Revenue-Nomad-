/**
 * Fathom, a call recorder (behind RN_FATHOM, off by default): the member pastes a Fathom API key
 * (Fathom, Settings, API Access), Merlin checks it with one cheap call, keeps it sealed at rest
 * (lib/google/crypto.ts, AES-256-GCM) with its last four characters, and reads, for the "A call
 * ends" trigger only, the member's meetings that ended and one meeting's transcript.
 *
 * Fathom's API: https://api.fathom.ai/external/v1, the key in the X-Api-Key header.
 *   GET /meetings?created_after=<ISO>&cursor=<c>     { items: [meeting], next_cursor }
 *   GET /recordings/<recording_id>/transcript        { transcript: [{ speaker: { display_name, matched_calendar_invitee_email }, text, timestamp }] }
 * A meeting: recording_id, title or meeting_title, created_at, scheduled_start_time and _end_time,
 * recording_start_time and _end_time, calendar_invitees [{ name, email, email_domain, is_external }],
 * recorded_by { email }. Read tolerantly: a field missing is left out, never guessed. Built against
 * a fake server (scripts/test-call-triggers.mts): the live answer's shape needs checking once.
 *
 * Kept per member (State.fathom[memberId]): the key sealed, its last four, when it was connected,
 * last worked or was refused. Never a meeting, a title, an invitee or a transcript. Never logged,
 * never in an answer (only the last four), never in the export; account closure deletes it.
 */
import { loadSeed, loadState, memberByToken, tableInternals as T, type State } from "../table";
import { seal, unseal } from "../google/crypto";
import { domainOf } from "../google/types";

export const fathomOn = (): boolean => process.env.RN_FATHOM === "1";
/** Tests only: with RN_SCAN_TEST=1, RN_FATHOM_API_TEST replaces Fathom's host (a fake server). */
export function fathomBase(): string {
  const t = process.env.RN_SCAN_TEST === "1" ? process.env.RN_FATHOM_API_TEST?.trim().replace(/\/+$/, "") : undefined;
  return t || "https://api.fathom.ai/external/v1";
}

export interface FathomLink {
  key: string;
  last4: string;
  connectedAt: string;
  okAt?: string;
  badAt?: string;
}
export interface FathomStatus {
  on: boolean;
  connected: boolean;
  last4?: string;
  connectedAt?: string;
  broken?: boolean;
}

export const FATHOM_WORDS = {
  off: "Fathom isn't switched on for Merlin yet.",
  shape: "That doesn't look like a Fathom API key. Copy it again from Fathom, Settings, API Access.",
  badKey: "Fathom didn't accept that key. Check you copied all of it, or make a new one in Fathom under Settings, API Access.",
  revoked: "Fathom stopped accepting your key. Make a new key in Fathom and connect it again in Settings, Connections.",
  notConnected: "Connect Fathom first, in Settings, Connections.",
  busy: "Fathom is busy right now. Try again in a minute.",
  down: "We couldn't reach Fathom. Try again in a minute.",
  noTranscript: "Fathom has no transcript for this call yet.",
} as const;

export class FathomProblem extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "",
  ) {
    super(message);
  }
}
type FCode = "bad_key" | "busy" | "server" | "unreachable" | "not_found" | "bad_answer";
export class FathomError extends Error {
  constructor(public code: FCode) {
    super(`fathom: ${code}`);
  }
}

type FState = State & { fathom?: Record<string, FathomLink> };
export const fathomLinkOf = (s: unknown, memberId: string): FathomLink | undefined => (s as FState).fathom?.[memberId];
const KEY_SHAPE = /^[A-Za-z0-9_\-.=+/]{16,300}$/;
const TIMEOUT_MS = 15_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One GET to Fathom with the member's key. Retries a 429 or a server error once. */
async function get<T>(key: string, path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let r: Response;
    try {
      r = await fetch(`${fathomBase()}${path}`, { headers: { "X-Api-Key": key, accept: "application/json" }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      if (attempt < 1) continue;
      throw new FathomError("unreachable");
    }
    if (r.status === 401 || r.status === 403) {
      await r.body?.cancel().catch(() => {});
      throw new FathomError("bad_key");
    }
    if (r.status === 404) {
      await r.body?.cancel().catch(() => {});
      throw new FathomError("not_found");
    }
    if (r.status === 429 || r.status >= 500) {
      await r.body?.cancel().catch(() => {});
      if (attempt < 1) {
        await sleep(r.status === 429 ? 1000 : 300);
        continue;
      }
      throw new FathomError(r.status === 429 ? "busy" : "server");
    }
    if (!r.ok) throw new FathomError("bad_answer");
    try {
      return (await r.json()) as T;
    } catch {
      throw new FathomError("bad_answer");
    }
  }
}

/* ---------- reading Fathom's answers ---------- */

const iso = (x: unknown) => (typeof x === "string" && x.length < 60 && Number.isFinite(Date.parse(x)) ? new Date(Date.parse(x)).toISOString() : null);
const str = (x: unknown) => (typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "");
export interface FathomMeeting {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string;
  invitees: { name: string; email: string; external: boolean | null }[];
  recordedBy: string | null;
}
/** One meeting from GET /meetings, or null when it lacks an id or its times. */
export function meetingOf(o: Record<string, unknown>): FathomMeeting | null {
  const id = str(o.recording_id ?? o.id);
  const start = iso(o.recording_start_time) ?? iso(o.scheduled_start_time) ?? iso(o.created_at);
  const end = iso(o.recording_end_time) ?? iso(o.scheduled_end_time);
  if (!id || !/^[A-Za-z0-9_-]{1,80}$/.test(id) || !start || !end) return null;
  const invitees = (Array.isArray(o.calendar_invitees) ? o.calendar_invitees : [])
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({ name: str(x.name).slice(0, 80), email: str(x.email).toLowerCase(), external: typeof x.is_external === "boolean" ? x.is_external : null }))
    .filter((x) => !!domainOf(x.email));
  const by = o.recorded_by as Record<string, unknown> | undefined;
  return { id, title: str(o.title ?? o.meeting_title).slice(0, 200), startedAt: start, endedAt: end, invitees, recordedBy: by ? str(by.email).toLowerCase() || null : null };
}
/** A transcript answer as "Name: what they said" lines, one speaker turn a line. */
export function transcriptOf(j: unknown, max: number): string {
  const items = Array.isArray((j as { transcript?: unknown })?.transcript) ? ((j as { transcript: unknown[] }).transcript as Record<string, unknown>[]) : Array.isArray(j) ? (j as Record<string, unknown>[]) : [];
  const out: { who: string; text: string }[] = [];
  let size = 0;
  for (const it of items) {
    const text = str(it?.text).replace(/\s+/g, " ");
    if (!text) continue;
    const sp = (it?.speaker ?? {}) as Record<string, unknown>;
    const who = str(sp.display_name).slice(0, 60) || "Speaker";
    const last = out[out.length - 1];
    if (last && last.who === who) last.text += ` ${text}`;
    else out.push({ who, text });
    size += text.length + who.length + 3;
    if (size > max) break;
  }
  return out
    .map((l) => `${l.who}: ${l.text}`)
    .join("\n")
    .slice(0, max);
}

/* ---------- the member's connection ---------- */

async function noteOutcome(memberId: string, bad: boolean, nowMs = Date.now()) {
  await T.mutate((d) => {
    const l = fathomLinkOf(d, memberId);
    if (!l) return;
    if (bad) l.badAt = new Date(nowMs).toISOString();
    else {
      delete l.badAt;
      if (!l.okAt || nowMs - Date.parse(l.okAt) > 3_600_000) l.okAt = new Date(nowMs).toISOString();
    }
  });
}
/** Work with the member's key: a refused key is marked (the row says so). */
async function withKey<R>(memberId: string, work: (key: string) => Promise<R>): Promise<R> {
  if (!fathomOn()) throw new FathomProblem(FATHOM_WORDS.off, 404, "off");
  const l = fathomLinkOf(await loadState(), memberId);
  if (!l) throw new FathomProblem(FATHOM_WORDS.notConnected, 409, "not_connected");
  const key = unseal(l.key);
  if (!key) throw new FathomProblem(FATHOM_WORDS.revoked, 409, "bad_key");
  try {
    const out = await work(key);
    if (l.badAt || !l.okAt || Date.now() - Date.parse(l.okAt) > 3_600_000) await noteOutcome(memberId, false).catch(() => {});
    return out;
  } catch (e) {
    if (e instanceof FathomError) {
      console.error(`Fathom: a request failed (${e.code})`);
      if (e.code === "bad_key") {
        await noteOutcome(memberId, true).catch(() => {});
        throw new FathomProblem(FATHOM_WORDS.revoked, 409, "bad_key");
      }
      if (e.code === "not_found") throw new FathomProblem(FATHOM_WORDS.noTranscript, 404, "not_found");
      throw new FathomProblem(e.code === "busy" ? FATHOM_WORDS.busy : FATHOM_WORDS.down, e.code === "busy" ? 429 : 424, e.code);
    }
    throw e;
  }
}

function statusOf(s: State, memberId: string): FathomStatus {
  if (!fathomOn()) return { on: false, connected: false };
  const l = fathomLinkOf(s, memberId);
  return l ? { on: true, connected: true, last4: l.last4, connectedAt: l.connectedAt, ...(l.badAt ? { broken: true } : {}) } : { on: true, connected: false };
}
async function who(token: string | null | undefined) {
  if (!token) return null;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  return m ? { s, m } : null;
}

/** GET status. Null when signed out. */
export async function fathomStatus(token: string | null | undefined): Promise<FathomStatus | null> {
  const w = await who(token);
  return w ? statusOf(w.s, w.m.id) : null;
}

/** POST connect { key }: one cheap call (one meeting) to check it, then keep it sealed. */
export async function connectFathom(token: string | null | undefined, rawKey: unknown, nowMs = Date.now()): Promise<{ status: FathomStatus; message: string }> {
  if (!fathomOn()) throw new FathomProblem(FATHOM_WORDS.off, 404, "off");
  const w = await who(token);
  if (!w) throw new FathomProblem("You're signed out. Sign in again.", 401, "signed_out");
  const key = String(rawKey ?? "").trim();
  if (!KEY_SHAPE.test(key)) throw new FathomProblem(FATHOM_WORDS.shape, 400, "shape");
  try {
    await get(key, "/meetings?limit=1");
  } catch (e) {
    if (e instanceof FathomError && e.code === "bad_key") throw new FathomProblem(FATHOM_WORDS.badKey, 400, "bad_key");
    throw new FathomProblem(e instanceof FathomError && e.code === "busy" ? FATHOM_WORDS.busy : FATHOM_WORDS.down, 424, "down");
  }
  const at = new Date(nowMs).toISOString();
  await T.mutate((d) => {
    ((d as FState).fathom ??= {})[w.m.id] = { key: seal(key), last4: key.slice(-4), connectedAt: at, okAt: at };
  });
  return { status: statusOf(await loadState(), w.m.id), message: "Fathom is connected. After a call ends, your workflows can build what was agreed." };
}

/** POST disconnect: the key is deleted. */
export async function disconnectFathom(token: string | null | undefined): Promise<{ status: FathomStatus; message: string }> {
  const w = await who(token);
  if (!w) throw new FathomProblem("You're signed out. Sign in again.", 401, "signed_out");
  await T.mutate((d) => void delete (d as FState).fathom?.[w.m.id]);
  return { status: statusOf(await loadState(), w.m.id), message: "Fathom is disconnected. Merlin deleted your key." };
}
/** Account closure (lib/account.ts): the key goes at once. */
export function forgetFathomIn(s: State, memberId: string): void {
  delete (s as FState).fathom?.[memberId];
}

/* ---------- what the trigger reads ---------- */

/** Meetings that ended in [sinceMs, nowMs], newest first, at most `max` (two pages at most). Who else was on each: invitees not the member. */
export async function fathomEnded(member: { id: string; email: string }, sinceMs: number, nowMs: number, max: number): Promise<(FathomMeeting & { others: { name: string; email: string }[] })[]> {
  return withKey(member.id, async (key) => {
    const own = String(member.email ?? "").toLowerCase();
    const out: (FathomMeeting & { others: { name: string; email: string }[] })[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 2; page++) {
      const q: URLSearchParams = new URLSearchParams({ created_after: new Date(sinceMs - 12 * 3_600_000).toISOString(), ...(cursor ? { cursor } : {}) });
      const j: { items?: unknown[]; next_cursor?: unknown } = await get<{ items?: unknown[]; next_cursor?: unknown }>(key, `/meetings?${q}`);
      for (const raw of Array.isArray(j?.items) ? j.items : []) {
        const m = raw && typeof raw === "object" ? meetingOf(raw as Record<string, unknown>) : null;
        if (!m) continue;
        const e = Date.parse(m.endedAt);
        if (e < sinceMs || e > nowMs) continue;
        // Who else was on it: not the member, not whoever recorded it. Whether they are outside the member's company is the trigger's to say (lib/calls work domains).
        const others = m.invitees.filter((x) => x.email !== own && x.email !== m.recordedBy).map(({ name, email }) => ({ name, email }));
        out.push({ ...m, others });
      }
      cursor = typeof j?.next_cursor === "string" && j.next_cursor ? j.next_cursor : null;
      if (!cursor || out.length >= max) break;
    }
    return out.sort((a, b) => b.endedAt.localeCompare(a.endedAt)).slice(0, max);
  });
}

/** One meeting's transcript, as text. Fathom gives it whole: one page. */
export async function fathomTranscript(memberId: string, recordingId: string, max: number): Promise<string> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(recordingId)) throw new FathomProblem(FATHOM_WORDS.noTranscript, 404, "not_found");
  return withKey(memberId, async (key) => transcriptOf(await get(key, `/recordings/${encodeURIComponent(recordingId)}/transcript`), max));
}
