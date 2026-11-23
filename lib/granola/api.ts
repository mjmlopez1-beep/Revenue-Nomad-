/**
 * Talking to Granola's public API with fetch (no SDK), with the member's own key as a Bearer
 * token. Read-only calls: list notes, search notes, get a note (with its transcript only when a
 * member picked that call) and get a transcript in pages.
 *
 * Nothing here logs a key, a title, a name or a response body: only short codes ("bad_key",
 * "http_500"). Each request has a timeout. Granola allows a burst of 25 requests and 5 a second
 * per user, so each key gets a small bucket (10, refilled 4 a second) and waits its turn; a 429
 * is retried with backoff (Retry-After when Granola sends one), at most 3 times.
 */
import { createHash } from "crypto";
import { granolaBase } from "./types";

const TIMEOUT_MS = 15_000;
const RETRIES = 3;
const BUCKET = 10;
const REFILL_PER_S = 4;
/** The longest one request waits for its turn before giving up (busy). */
const WAIT_MAX_MS = 8_000;

export type GranolaCode =
  | "bad_key" // 401: unknown, revoked or expired key, or none
  | "no_plan" // 403 SUBSCRIPTION_INACTIVE
  | "suspended" // 403 ACCOUNT_SUSPENDED
  | "ip" // 403 IP_ALLOWLIST_DENIED
  | "forbidden" // 403 FORBIDDEN: e.g. transcripts turned off over the API
  | "not_found" // 404
  | "too_large" // 413 TRANSCRIPT_TOO_LARGE
  | "invalid" // 400
  | "busy" // 429 after the retries
  | "server" // 5xx
  | "timeout"
  | "unreachable"
  | "bad_answer"
  // Granola's sign-in and MCP server (lib/granola/oauth.ts, mcp.ts):
  | "bad_client" // the token endpoint no longer knows Merlin's client: registered again next time
  | "no_sign_in" // discovery or registration failed: Connect Granola isn't offered
  | "pending" // the transcript isn't written yet
  | "no_transcript"; // Granola has none for this meeting

export class GranolaError extends Error {
  constructor(
    public code: GranolaCode,
    public status = 0,
  ) {
    super(`granola: ${code}`);
  }
}

/* ---------- pacing, per key ---------- */

const buckets = new Map<string, { tokens: number; at: number }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const keyId = (key: string) => createHash("sha256").update(`rn-granola-bucket:${key}`).digest("hex").slice(0, 24);

export async function turn(id: string): Promise<void> {
  const started = Date.now();
  for (;;) {
    const now = Date.now();
    const b = buckets.get(id) ?? { tokens: BUCKET, at: now };
    b.tokens = Math.min(BUCKET, b.tokens + ((now - b.at) / 1000) * REFILL_PER_S);
    b.at = now;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      buckets.set(id, b);
      if (buckets.size > 2000) buckets.delete(buckets.keys().next().value as string);
      return;
    }
    buckets.set(id, b);
    if (now - started > WAIT_MAX_MS) throw new GranolaError("busy", 429);
    await sleep(Math.ceil(((1 - b.tokens) / REFILL_PER_S) * 1000));
  }
}

/** Tests: a fresh bucket for every key, and the backoff's base in ms. */
export const _pace = { reset: () => buckets.clear(), backoffMs: 400 };

function codeOf(status: number, code: string): GranolaCode {
  if (status === 401) return "bad_key";
  if (status === 403) return code === "SUBSCRIPTION_INACTIVE" ? "no_plan" : code === "ACCOUNT_SUSPENDED" ? "suspended" : code === "IP_ALLOWLIST_DENIED" ? "ip" : "forbidden";
  if (status === 404) return "not_found";
  if (status === 413) return "too_large";
  if (status === 429) return "busy";
  if (status === 400) return "invalid";
  if (status >= 500) return "server";
  return "bad_answer";
}

/** Retry-After in ms (seconds or an HTTP date), capped. */
export function retryAfter(h: string | null): number | null {
  if (!h) return null;
  const n = Number(h);
  if (Number.isFinite(n) && n >= 0) return Math.min(n * 1000, 10_000);
  const t = Date.parse(h);
  return Number.isFinite(t) ? Math.min(Math.max(0, t - Date.now()), 10_000) : null;
}

async function call<T>(key: string, path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const id = keyId(key);
  for (let attempt = 0; ; attempt++) {
    await turn(id);
    let r: Response;
    try {
      r = await fetch(`${granolaBase()}/v1${path}`, {
        method: init.method ?? "GET",
        headers: { authorization: `Bearer ${key}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      const timeout = (e as { name?: string })?.name === "TimeoutError";
      if (attempt < 1 && !timeout) continue;
      throw new GranolaError(timeout ? "timeout" : "unreachable");
    }
    if (r.ok) {
      const j = (await r.json().catch(() => null)) as T | null;
      if (j === null || typeof j !== "object") throw new GranolaError("bad_answer", r.status);
      return j;
    }
    const j = (await r.json().catch(() => null)) as { code?: unknown } | null;
    const code = codeOf(r.status, typeof j?.code === "string" ? j.code : "");
    // Too many requests: wait (Retry-After, else doubling with a little jitter) and try again. A server error: once more.
    if ((code === "busy" && attempt < RETRIES) || (code === "server" && attempt < 1)) {
      const wait = retryAfter(r.headers.get("retry-after")) ?? _pace.backoffMs * 2 ** attempt + Math.floor(Math.random() * 100);
      await sleep(wait);
      continue;
    }
    throw new GranolaError(code, r.status);
  }
}

/* ---------- the endpoints ---------- */

export interface Owner {
  name?: string | null;
  email?: string | null;
}
export interface NoteRef {
  id: string;
  title?: string | null;
  owner?: Owner | null;
  created_at?: string | null;
  meeting_at?: string | null;
}
export interface TranscriptItem {
  speaker?: { source?: string; attribution?: "me" | "them"; diarization_label?: string; name?: string } | null;
  text?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}
export interface Note extends NoteRef {
  attendees?: { name?: string | null; email?: string | null }[] | null;
  calendar_event?: { invitees?: { email?: string | null }[] | null; organiser?: string | null; scheduled_start_time?: string | null; scheduled_end_time?: string | null } | null;
  transcript?: TranscriptItem[] | null;
}
interface Page<T> {
  notes?: T[];
  hasMore?: boolean;
  cursor?: string | null;
  completion_status?: string;
}

const ymd = (ms: number) => new Date(ms).toISOString();

/** GET /v1/notes: notes created after a time, newest first as Granola sends them. One page. */
export async function listNotes(key: string, o: { createdAfterMs?: number; cursor?: string | null; pageSize?: number } = {}): Promise<{ notes: NoteRef[]; cursor: string | null }> {
  const q = new URLSearchParams({ page_size: String(Math.min(30, Math.max(1, o.pageSize ?? 30))) });
  if (o.createdAfterMs) q.set("created_after", ymd(o.createdAfterMs));
  if (o.cursor) q.set("cursor", o.cursor);
  const j = await call<Page<NoteRef>>(key, `/notes?${q}`);
  return { notes: (j.notes ?? []).filter((n) => typeof n?.id === "string"), cursor: j.hasMore && j.cursor ? j.cursor : null };
}

/** POST /v1/notes/search: meetings with this person or company on the invite (a domain or an email), from a time. One page. */
export async function searchNotes(key: string, o: { participant: string; fromMs: number; cursor?: string | null }): Promise<{ notes: NoteRef[]; cursor: string | null }> {
  const body = o.cursor ? { cursor: o.cursor, page_size: 30 } : { participant: o.participant, from_date: ymd(o.fromMs), page_size: 30 };
  const j = await call<Page<NoteRef>>(key, "/notes/search", { method: "POST", body });
  return { notes: (j.notes ?? []).filter((n) => typeof n?.id === "string"), cursor: j.hasMore && j.cursor ? j.cursor : null };
}

/** GET /v1/notes/{id}, with the transcript only when asked (a member picked this call). */
export async function getNote(key: string, id: string, withTranscript = false): Promise<Note> {
  return call<Note>(key, `/notes/${encodeURIComponent(id)}${withTranscript ? "?include=transcript" : ""}`);
}

/** GET /v1/notes/{id}/transcript: one page of a transcript (for one too large to come with the note). */
export async function transcriptPage(key: string, id: string, cursor: string | null, pageSize = 100): Promise<{ items: TranscriptItem[]; cursor: string | null }> {
  const q = new URLSearchParams({ page_size: String(pageSize) });
  if (cursor) q.set("cursor", cursor);
  const j = await call<{ transcript?: TranscriptItem[]; hasMore?: boolean; cursor?: string | null }>(key, `/notes/${encodeURIComponent(id)}/transcript?${q}`);
  return { items: Array.isArray(j.transcript) ? j.transcript : [], cursor: j.hasMore && j.cursor ? j.cursor : null };
}
