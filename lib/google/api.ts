/**
 * Talking to Google with fetch (no SDK). Read-only calls, plus the token endpoints. Nothing here
 * logs a token, a code or a response body: only short codes ("invalid_grant", "http_500").
 *
 * Calendar events are asked for with a `fields` mask that leaves out the title (summary),
 * description, location and attachments: they never reach Merlin. Gmail is read with
 * format=metadata and only the From, To, Cc, Date and bulk headers.
 */
import { bases, clientFor, redirectUri } from "./config";
import type { CalEvent, GContact, GmailMeta } from "./compute";

const TIMEOUT_MS = 15_000;

export class GoogleError extends Error {
  constructor(
    public code: string,
    public status = 0,
  ) {
    super(`google: ${code}`);
  }
}
/** The refresh token is gone (revoked, expired after 7 days in Testing, or the password changed). */
export const isGone = (e: unknown) => e instanceof GoogleError && e.code === "invalid_grant";
/** A scope the member didn't grant. */
export const isDenied = (e: unknown) => e instanceof GoogleError && e.status === 403;

async function call(url: string, init: RequestInit = {}): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(url, { ...init, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new GoogleError((e as { name?: string })?.name === "TimeoutError" ? "timeout" : "unreachable");
  }
  const j = (await r.json().catch(() => null)) as { error?: unknown } | null;
  if (!r.ok) {
    const err = typeof j?.error === "string" ? j.error : typeof (j?.error as { status?: unknown })?.status === "string" ? String((j!.error as { status: string }).status) : "";
    throw new GoogleError(/^[A-Za-z_]{2,40}$/.test(err) ? err : `http_${r.status}`, r.status);
  }
  return j;
}
const get = (url: string, access: string) => call(url, { headers: { authorization: `Bearer ${access}`, accept: "application/json" } });
const form = (url: string, body: Record<string, string>) =>
  call(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams(body).toString() });

/* ---------- OAuth ---------- */

export function authorizeUrl(kind: "google" | "gmail", scopes: string[], state: string, origin: string, hint?: string, own?: boolean): string {
  const q = new URLSearchParams({
    client_id: clientFor(kind, own).id,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    // A refresh token every time (Google only sends one on consent).
    prompt: "consent",
    // Incremental: Gmail on the main client joins the main grant. Gmail on its own client is a grant of its own.
    ...(kind === "gmail" && own ? {} : { include_granted_scopes: "true" }),
    state,
    ...(hint ? { login_hint: hint } : {}),
  });
  return `${bases().auth}/o/oauth2/v2/auth?${q}`;
}

export interface Tokens {
  access: string;
  expiresAt: number;
  refresh: string | null;
  scopes: string[];
  email: string | null;
}

/** The email in the ID token Google returned on the same TLS call (no signature check needed there). */
function emailOf(idToken: unknown): string | null {
  try {
    const part = String(idToken ?? "").split(".")[1];
    const j = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { email?: unknown; email_verified?: unknown };
    return typeof j.email === "string" && j.email_verified !== false ? j.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

function tokensOf(j: unknown, nowMs: number): Tokens {
  const t = j as { access_token?: unknown; expires_in?: unknown; refresh_token?: unknown; scope?: unknown; id_token?: unknown };
  if (typeof t?.access_token !== "string") throw new GoogleError("no_token");
  return {
    access: t.access_token,
    expiresAt: nowMs + (Number(t.expires_in) || 3600) * 1000,
    refresh: typeof t.refresh_token === "string" ? t.refresh_token : null,
    scopes: typeof t.scope === "string" ? t.scope.split(/\s+/).filter(Boolean) : [],
    email: emailOf(t.id_token),
  };
}

export async function exchangeCode(kind: "google" | "gmail", code: string, origin: string, own?: boolean): Promise<Tokens> {
  const c = clientFor(kind, own);
  return tokensOf(await form(`${bases().token}/token`, { code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri(origin), grant_type: "authorization_code" }), Date.now());
}

export async function refreshAccess(kind: "google" | "gmail", refresh: string, own?: boolean): Promise<Tokens> {
  const c = clientFor(kind, own);
  return tokensOf(await form(`${bases().token}/token`, { refresh_token: refresh, client_id: c.id, client_secret: c.secret, grant_type: "refresh_token" }), Date.now());
}

/** Revoke at Google. True when Google took it (or it was already gone). */
export async function revoke(token: string): Promise<boolean> {
  try {
    await form(`${bases().token}/revoke`, { token });
    return true;
  } catch (e) {
    return e instanceof GoogleError && (e.code === "invalid_token" || e.status === 400);
  }
}

/* ---------- Calendar ---------- */

const PAGES_MAX = 20;
const CALENDARS_MAX = 10;
const EVENT_FIELDS = "nextPageToken,items(status,eventType,start,attendees(email,displayName,self,resource,responseStatus,organizer))";

/** The member's own calendars: the primary, and others they own (with the calendar list scope). */
export async function ownedCalendars(access: string, withList: boolean): Promise<string[]> {
  if (!withList) return ["primary"];
  try {
    const j = (await get(`${bases().calendar}/calendar/v3/users/me/calendarList?minAccessRole=owner&maxResults=50&fields=items(id,primary,accessRole,deleted)`, access)) as {
      items?: { id?: string; primary?: boolean; accessRole?: string; deleted?: boolean }[];
    };
    const ids = (j.items ?? []).filter((c) => c.id && c.accessRole === "owner" && !c.deleted && !/@(group\.v\.calendar|import\.calendar)\.google\.com$|#holiday@|#contacts@/.test(c.id!));
    const out = ["primary", ...ids.filter((c) => !c.primary).map((c) => c.id!)];
    return out.slice(0, CALENDARS_MAX);
  } catch (e) {
    if (isDenied(e)) return ["primary"];
    throw e;
  }
}

export async function calendarEvents(access: string, calendarId: string, fromMs: number, toMs: number): Promise<CalEvent[]> {
  const out: CalEvent[] = [];
  let page: string | undefined;
  for (let i = 0; i < PAGES_MAX; i++) {
    const q = new URLSearchParams({
      timeMin: new Date(fromMs).toISOString(),
      timeMax: new Date(toMs).toISOString(),
      singleEvents: "true",
      maxResults: "2500",
      showDeleted: "false",
      fields: EVENT_FIELDS,
      ...(page ? { pageToken: page } : {}),
    });
    const j = (await get(`${bases().calendar}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${q}`, access)) as { items?: CalEvent[]; nextPageToken?: string };
    for (const ev of j.items ?? []) out.push({ status: ev.status, eventType: ev.eventType, start: ev.start, attendees: ev.attendees });
    page = j.nextPageToken;
    if (!page) break;
  }
  return out;
}

/* ---------- Contacts ---------- */

export async function contacts(access: string, other: boolean): Promise<GContact[]> {
  const out: GContact[] = [];
  let page: string | undefined;
  for (let i = 0; i < PAGES_MAX; i++) {
    const q = new URLSearchParams(
      other ? { readMask: "names,emailAddresses", pageSize: "1000", ...(page ? { pageToken: page } : {}) } : { personFields: "names,emailAddresses,organizations", pageSize: "1000", ...(page ? { pageToken: page } : {}) },
    );
    const url = other ? `${bases().people}/v1/otherContacts?${q}` : `${bases().people}/v1/people/me/connections?${q}`;
    const j = (await get(url, access)) as { connections?: GContact[]; otherContacts?: GContact[]; nextPageToken?: string };
    for (const c of (other ? j.otherContacts : j.connections) ?? [])
      out.push({ names: c.names?.slice(0, 1).map((n) => ({ displayName: n.displayName })), emailAddresses: c.emailAddresses?.slice(0, 5).map((e) => ({ value: e.value })), organizations: c.organizations?.slice(0, 1).map((o) => ({ name: o.name, title: o.title })) });
    page = j.nextPageToken;
    if (!page) break;
  }
  return out;
}

/* ---------- Gmail (headers only) ---------- */

/** At most this many messages a sync, newest first, back to the start of the window. */
export const GMAIL_MAX = 4000;
const GMAIL_PARALLEL = 8;
const HEADERS = ["From", "To", "Cc", "Date", "List-Unsubscribe", "List-Id", "Precedence", "Auto-Submitted"];

export async function gmailProfile(access: string): Promise<{ email: string | null; historyId: string | null }> {
  const j = (await get(`${bases().gmail}/gmail/v1/users/me/profile`, access)) as { emailAddress?: string; historyId?: string };
  return { email: j.emailAddress?.toLowerCase() ?? null, historyId: j.historyId ?? null };
}

/**
 * Message headers from the newest back to `fromMs`. gmail.metadata allows no search query, so the
 * list is read page by page (newest first) and each message's headers fetched, a few at a time,
 * until the window or GMAIL_MAX is reached.
 */
export async function gmailHeaders(access: string, fromMs: number, max = GMAIL_MAX): Promise<GmailMeta[]> {
  const out: GmailMeta[] = [];
  let page: string | undefined;
  const hq = HEADERS.map((h) => `metadataHeaders=${encodeURIComponent(h)}`).join("&");
  for (let i = 0; i < 40 && out.length < max; i++) {
    const q = new URLSearchParams({ maxResults: "500", includeSpamTrash: "false", ...(page ? { pageToken: page } : {}) });
    const j = (await get(`${bases().gmail}/gmail/v1/users/me/messages?${q}`, access)) as { messages?: { id: string }[]; nextPageToken?: string };
    const ids = (j.messages ?? []).map((m) => m.id).filter((x) => /^[\w-]{1,64}$/.test(x));
    let older = 0;
    for (let k = 0; k < ids.length && out.length < max; k += GMAIL_PARALLEL) {
      const got = await Promise.all(
        ids.slice(k, k + GMAIL_PARALLEL).map(async (id) => {
          const m = (await get(`${bases().gmail}/gmail/v1/users/me/messages/${id}?format=metadata&${hq}&fields=internalDate,labelIds,payload/headers`, access)) as {
            internalDate?: string;
            labelIds?: string[];
            payload?: { headers?: { name?: string; value?: string }[] };
          };
          const headers: Record<string, string> = {};
          for (const h of m.payload?.headers ?? []) {
            const n = String(h.name ?? "").toLowerCase();
            if (HEADERS.some((x) => x.toLowerCase() === n)) headers[n] = String(h.value ?? "").slice(0, 2000);
          }
          return { internalDate: m.internalDate, labelIds: m.labelIds, headers } as GmailMeta;
        }),
      );
      for (const m of got) {
        if (Number(m.internalDate) < fromMs) older++;
        else out.push(m);
      }
    }
    page = j.nextPageToken;
    // A whole page older than the window: nothing newer is left.
    if (!page || (ids.length && older === ids.length)) break;
  }
  return out;
}
