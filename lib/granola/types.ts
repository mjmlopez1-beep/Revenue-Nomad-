/**
 * Granola, connected one of two ways:
 *  - "Connect Granola" (the main way in): Granola's MCP server (https://mcp.granola.ai/mcp,
 *    RN_GRANOLA_MCP_URL) signs the member in with OAuth 2.1, the way Claude and other MCP clients
 *    connect to it (lib/granola/oauth.ts: discovery, one client registration per Merlin, PKCE).
 *    Merlin then asks Granola's MCP tools (lib/granola/mcp.ts) for the calls and one transcript.
 *  - A personal API key pasted by the member (Granola's public REST API,
 *    https://public-api.granola.ai/v1; a Business or Enterprise plan): the fallback, shown when
 *    the sign-in isn't available (discovery or registration failed).
 *
 * What Merlin keeps per member: the access and refresh tokens (or the key) sealed at rest
 * (lib/google/crypto.ts, AES-256-GCM), the key's last four characters, when it was connected and
 * last worked. Nothing else: no note, title, attendee, summary or transcript is stored. Calls are
 * listed when the member opens the picker, and a transcript is read only when the member picks a
 * call, for that request alone.
 *
 * Off unless RN_GRANOLA=1: no card, no picker, no tool, no calls to Granola.
 */
export const granolaOn = (): boolean => process.env.RN_GRANOLA === "1";

/** Tests only: with RN_SCAN_TEST=1, RN_GRANOLA_API_TEST replaces Granola's host (a fake server). */
export function granolaBase(): string {
  const t = process.env.RN_SCAN_TEST === "1" ? process.env.RN_GRANOLA_API_TEST?.trim().replace(/\/+$/, "") : undefined;
  return t || "https://public-api.granola.ai";
}

/**
 * Granola's MCP server: RN_GRANOLA_MCP_URL, else https://mcp.granola.ai/mcp. It must be https;
 * plain http only in tests (RN_SCAN_TEST=1, a fake server on 127.0.0.1).
 */
export function granolaMcpUrl(): string | null {
  const raw = (process.env.RN_GRANOLA_MCP_URL?.trim() || "https://mcp.granola.ai/mcp").replace(/\/+$/, "");
  try {
    const u = new URL(raw);
    if (u.protocol === "https:" || (u.protocol === "http:" && process.env.RN_SCAN_TEST === "1")) return u.toString().replace(/\/+$/, "");
  } catch {}
  return null;
}
/** A URL Granola's discovery documents name: https, or http in tests only. */
export const safeUrl = (x: unknown): string | null => {
  if (typeof x !== "string" || x.length > 2000) return null;
  try {
    const u = new URL(x);
    return u.protocol === "https:" || (u.protocol === "http:" && process.env.RN_SCAN_TEST === "1") ? u.toString() : null;
  } catch {
    return null;
  }
};

/**
 * State.granola[memberId]. A key link has no `via` (it came first); a sign-in link says "oauth".
 * Either way every secret in it is sealed (lib/google/crypto.ts seal), opened only on the server
 * right before a call to Granola, never logged, never in an answer or the export.
 */
export interface GranolaLink {
  via?: "oauth";
  /** The API key, sealed. Key links only. */
  key?: string;
  /** The key's last four characters, for "key ending ••••abcd". Key links only. */
  last4?: string;
  /** The access token from Granola's sign-in, sealed. */
  access?: string;
  /** The refresh token, sealed, when Granola gave one. */
  refresh?: string;
  /** When the access token runs out (ISO), when Granola said. */
  expiresAt?: string;
  /** The client id the tokens were issued to (Merlin's registration then). */
  client?: string;
  connectedAt: string;
  /** The last time a call to Granola with this key went through. */
  okAt?: string;
  /** Granola refused the key (revoked, or the plan ended): when that was found. The member connects a new one. */
  badAt?: string;
}

/**
 * State.granolaApp: Merlin's own client at Granola's sign-in, registered once per deployment
 * (RFC 7591) and kept for the issuer and the redirect address it was made for. The secret sealed.
 */
export interface GranolaApp {
  issuer: string;
  redirectUri: string;
  clientId: string;
  secret?: string;
  /** How the token endpoint wants the client to prove itself: client_secret_basic, client_secret_post or none. */
  auth: "client_secret_basic" | "client_secret_post" | "none";
  registeredAt: string;
  /** When Granola said the secret runs out (ISO). */
  secretExpiresAt?: string;
}

/** What the page and the picker get. Never a key or a token. */
export interface GranolaStatus {
  on: boolean;
  connected: boolean;
  /** How the member connected: "oauth" (Connect Granola) or "key" (a pasted API key). */
  via?: "oauth" | "key";
  /** "Connect Granola" can be offered: Granola's sign-in was found and Merlin is registered with it. Else the key form is the way in. */
  oauth?: boolean;
  /** "abcd", for "Connected · key ending ••••abcd". */
  last4?: string;
  connectedAt?: string;
  /** Granola refused the key the last time Merlin tried it. */
  broken?: boolean;
  /** Drafting a proposal from a call is a Close feature (lib/billing/rules.ts canClose; the trial counts). */
  canDraft: boolean;
}

export interface CallPerson {
  name: string;
  email: string;
}

/** One call in the picker. The note's title only when the member asked for it (`titles`). */
export interface GranolaCall {
  /** Granola's note id (not_...). */
  noteId: string;
  /** When the meeting started (the calendar event's start, else the note's creation), ISO. */
  when: string;
  /** The meeting's length in minutes from its calendar event, when it had one. */
  minutes: number | null;
  /** Who else was on it (the member and the note's owner left out), the matching ones first. */
  with: CallPerson[];
  /** More attendees than `with` lists. */
  more: number;
  title?: string;
}

export interface CallsAnswer {
  calls: GranolaCall[];
  /** What was matched: a company's domain, an email, or every recent call. */
  by: { kind: "company"; domain: string } | { kind: "email"; email: string } | { kind: "recent" };
  days: number;
}

/** The transcript of one picked call, for drafting. Used for that request and not kept. */
export interface GranolaTranscript {
  noteId: string;
  when: string;
  /** From the transcript's own timings, else the calendar event's. */
  minutes: number | null;
  attendees: CallPerson[];
  /** "Name: what they said" lines, one speaker turn a line. */
  text: string;
  /** Only when asked for (the member's own note). */
  title?: string;
}

/** How far back the picker looks. */
export const CALL_DAYS = 30;
/** The most calls a picker shows, and the most notes it reads to find them. */
export const CALLS_MAX = 10;
export const NOTES_READ_MAX = 12;

export const NOTE_ID = /^not_[A-Za-z0-9]{14}$/i;
/** A meeting id from Granola's MCP tools: a public note id or a UUID (never an upcoming evt_ one). */
export const MEETING_ID = /^(?:not_[A-Za-z0-9]{14}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
/** A personal API key as Granola makes them: grn_ then letters, digits and a few marks. */
export const KEY_SHAPE = /^grn_[A-Za-z0-9_\-.]{8,200}$/;

/** The words members read when something goes wrong, by what Granola said. */
export const GRANOLA_WORDS = {
  off: "Granola isn't switched on for Merlin yet.",
  notConnected: "Connect Granola first, in Settings, Connections.",
  shape: "That doesn't look like a Granola API key. It starts with grn_. Copy it again from Granola, Settings, Connectors, API keys.",
  badKey: "Granola didn't accept that key. Check you copied all of it, or make a new one in Granola under Settings, Connectors, API keys.",
  revoked: "Granola stopped accepting your key. It may have been revoked. Make a new key in Granola and connect it again in Integrations.",
  signInRevoked: "Granola stopped letting Merlin read your calls. Its access may have been removed in Granola. Connect Granola again in Settings, Connections.",
  noSignIn: "Connecting with Granola isn't available right now. Paste a Granola API key instead, or try again later.",
  denied: "Nothing was connected. You said no at Granola. Connect whenever you like.",
  failed: "We couldn't connect Granola, so nothing was saved. Try again in a moment.",
  pending: "Granola is still writing this call's transcript. Try again in a few minutes, or paste your notes instead.",
  scope: "Granola didn't let this key read your notes. Make a key with Personal notes ticked, then connect it again.",
  noPlan: "Granola says your workspace's plan doesn't include its API. Personal API keys need a Granola Business or Enterprise plan.",
  suspended: "Granola says the account that made this key is suspended.",
  ip: "Your Granola workspace only lets its API be used from certain networks, and Merlin isn't on that list. Ask your Granola admin.",
  noTranscripts: "Your Granola workspace doesn't let apps read transcripts. Ask your Granola admin to turn on transcript access for the API, or paste the transcript instead.",
  noTranscript: "Granola has no transcript for this call. Paste your notes instead.",
  notFound: "Granola couldn't find that call. It may have been deleted, or your key can't read it.",
  busy: "Granola is busy right now. Try again in a minute.",
  down: "We couldn't reach Granola. Try again in a minute.",
  close: "Drafting a proposal from a call is on Close. Connecting Granola works on every plan.",
  locked: "Open this company on Merlin first, then pick a call with them.",
  noCompany: "That company isn't on Merlin.",
  noDomain: "Merlin doesn't have this company's website, so it can't match calls to it. Search by the person's email instead.",
  email: "Type the whole email address, like dana@cedarpine.example.",
} as const;
