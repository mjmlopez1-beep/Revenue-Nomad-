/**
 * Granola, connected by the member's own personal API key (Granola's public REST API,
 * https://public-api.granola.ai/v1). There is no OAuth for third-party apps, so the member makes a
 * key in Granola (Settings, Connectors, API keys; a Business or Enterprise plan) and pastes it.
 *
 * What Merlin keeps: the key sealed at rest (lib/google/crypto.ts, AES-256-GCM), its last four
 * characters to show, and when it was connected and last worked. Nothing else: no note, title,
 * attendee, summary or transcript is stored. Calls are listed when the member opens the picker,
 * and a transcript is read only when the member picks a call, for that request alone.
 *
 * Off unless RN_GRANOLA=1: no card, no picker, no tool, no calls to Granola.
 */
export const granolaOn = (): boolean => process.env.RN_GRANOLA === "1";

/** Tests only: with RN_SCAN_TEST=1, RN_GRANOLA_API_TEST replaces Granola's host (a fake server). */
export function granolaBase(): string {
  const t = process.env.RN_SCAN_TEST === "1" ? process.env.RN_GRANOLA_API_TEST?.trim().replace(/\/+$/, "") : undefined;
  return t || "https://public-api.granola.ai";
}

/** State.granola[memberId]. */
export interface GranolaLink {
  /** The API key, sealed (lib/google/crypto.ts seal). Opened only on the server, right before a call to Granola. */
  key: string;
  /** The key's last four characters, for "key ending ••••abcd". */
  last4: string;
  connectedAt: string;
  /** The last time a call to Granola with this key went through. */
  okAt?: string;
  /** Granola refused the key (revoked, or the plan ended): when that was found. The member connects a new one. */
  badAt?: string;
}

/** What the page and the picker get. Never the key. */
export interface GranolaStatus {
  on: boolean;
  connected: boolean;
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
/** A personal API key as Granola makes them: grn_ then letters, digits and a few marks. */
export const KEY_SHAPE = /^grn_[A-Za-z0-9_\-.]{8,200}$/;

/** The words members read when something goes wrong, by what Granola said. */
export const GRANOLA_WORDS = {
  off: "Granola isn't switched on for Merlin yet.",
  notConnected: "Connect Granola first, in Integrations.",
  shape: "That doesn't look like a Granola API key. It starts with grn_. Copy it again from Granola, Settings, Connectors, API keys.",
  badKey: "Granola didn't accept that key. Check you copied all of it, or make a new one in Granola under Settings, Connectors, API keys.",
  revoked: "Granola stopped accepting your key. It may have been revoked. Make a new key in Granola and connect it again in Integrations.",
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
