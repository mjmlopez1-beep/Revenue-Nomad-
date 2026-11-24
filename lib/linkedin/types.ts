/**
 * "Bring in your LinkedIn data export" (lib/linkedin): the member's own export, read in their
 * browser (lib/linkedin/read.ts), and only a small, derived payload for each use they tick is sent
 * (ExportPayload). The archive never leaves their device, and neither does any file Merlin doesn't
 * read (lib/linkedin/files.ts), the words of any message, a message's subject, a conversation's
 * title or an attachment.
 *
 * What is kept, for the member alone (State.paths[memberId].lix, beside their connections file, so
 * Remove and closing the account delete it with the rest), and nothing else: ExportStore. Never in
 * another member's view, an admin's panel, the export or the connector by name.
 *
 * Pure: no I/O.
 */
import type { VoiceStyle } from "../voice";

/** The uses the member ticks. Everything is on by default but voice and Evidence Bank (opt-in). */
export type UseKey = "know" | "seats" | "warm" | "vouch" | "follows" | "skills" | "voice" | "proof";
export const USE_KEYS: readonly UseKey[] = ["know", "seats", "warm", "vouch", "follows", "skills", "voice", "proof"];
export const USES_ON_BY_DEFAULT: readonly UseKey[] = ["know", "seats", "warm", "vouch", "follows", "skills"];

/** Each use in words, for the consent screen. */
export const USE_WORDS: Record<UseKey, { name: string; line: string }> = {
  know: { name: "Who you know", line: "Your connections, and the people you invited or who invited you (marked as invited, weaker than a connection)." },
  seats: { name: "Your seats", line: "Your own roles become a list of seats to confirm. Nothing is added until you confirm one." },
  warm: { name: "How warm", line: "For each person you message: how many messages each way, and the first and last day. Never the words." },
  vouch: { name: "Who vouched for you", line: "People who recommended or endorsed you, and the ones you did, count as strong ties." },
  follows: { name: "Companies you follow", line: "The companies you follow there that are on Merlin, to follow here too. You pick which." },
  skills: { name: "Skills", line: "Your skills and current title fill in your function and title, only where your profile has none." },
  voice: { name: "Your writing voice", line: "Your own posts are read on this device to set how Merlin writes as you. Only the style is kept, never a post." },
  proof: { name: "Recommendations as proof", line: "Use the recommendations you received as proof in Evidence Bank, by first name and company. Remove any of them." },
};

/* ---------- limits ---------- */

export const LIX_LIMITS = {
  /** People counted for warmth: the most messaged first. */
  warm: 3000,
  invites: 3000,
  positions: 60,
  recs: 200,
  endorsements: 3000,
  follows: 3000,
  /** Recommendation text kept as proof, at most, and the most kept. */
  proofChars: 1200,
  proof: 30,
  /** Posts read on the device for the voice. */
  posts: 50,
  postChars: 600,
  /** The whole request. The connections file is the most of it (at most 8 MB). */
  bodyBytes: 9 * 1024 * 1024,
} as const;

/* ---------- what the browser sends ---------- */

/** One person the member messaged: counts each way and the first and last day (YYYY-MM-DD). Nothing else. */
export interface WarmRow {
  profileSlug: string;
  sent: number;
  received: number;
  first: string;
  last: string;
}

/** A pending invitation: the other person's profile link and name, which way, and the day. Never the note. */
export interface InviteRow {
  u: string;
  n: string;
  out: boolean;
  d?: string;
}

/** One of the member's own roles: company, title, start and end month (YYYY-MM or YYYY; no end while current). */
export interface PositionRow {
  c: string;
  t: string;
  s?: string;
  e?: string;
}

/** A recommendation: who (first, last, company), which way, its day. The text only for a received one, only with the proof tick. */
export interface RecRow {
  f: string;
  l: string;
  c: string;
  k: "in" | "out";
  d?: string;
  text?: string;
}

/** An endorsement: the other person's profile link and which way. */
export interface EndorseRow {
  u: string;
  k: "in" | "out";
}

export interface ExportPayload {
  v: 1;
  uses: UseKey[];
  /** The files read (lib/linkedin/files.ts keys), for the record. */
  files: string[];
  /** Who you know: Connections.csv as LinkedIn wrote it (lib/paths/csv.ts parseConnections reads it again on the server). */
  connections?: string;
  invites?: InviteRow[];
  positions?: PositionRow[];
  warm?: WarmRow[];
  recs?: RecRow[];
  endorsements?: EndorseRow[];
  /** Company names, as the member's Company Follows.csv has them. */
  follows?: string[];
  /** The style conclusions worked out on the device (lib/linkedin/voice.ts); never a post. */
  voice?: VoiceStyle;
  /** A function guessed from the skills, and the current title: each fills the profile only where it is empty. */
  skills?: { fn?: string; title?: string };
}

/* ---------- what is kept ---------- */

/** Vouch flags on a profile link: r recommended you, R you recommended them, e endorsed you, E you endorsed them. */
export type VouchFlags = string;

export interface SeatOffer {
  /** A one-way key of the role (company, title, start): what Confirm and Not a seat name. */
  k: string;
  c: string;
  t: string;
  s?: string;
  e?: string;
  /** What the title reads as: fractional, interim, advisor, consulting, or null. */
  kind: "fractional" | "interim" | "advisor" | "consulting" | null;
  fn: string | null;
  done?: "added" | "no";
}

export interface ProofRec {
  id: string;
  /** The recommender's first name and company only, as the attribution. */
  first: string;
  company: string;
  text: string;
  d?: string;
}

export interface ExportStore {
  at: string;
  uses: UseKey[];
  files: string[];
  /** What each use brought in, as counts. */
  counts: Partial<Record<"connections" | "invites" | "warm" | "vouch" | "positions" | "follows" | "proof" | "voice" | "skills", number>>;
  invites?: InviteRow[];
  warm?: WarmRow[];
  vouch?: Record<string, VouchFlags>;
  seats?: SeatOffer[];
  /** Companies on Merlin matched by exact name from Company Follows.csv (internal ids). */
  follow?: string[];
  proof?: ProofRec[];
  /** The connections were brought in by the export (Remove deletes them too). */
  connections?: true;
  /** What Skills filled in on the profile. */
  filled?: ("function" | "title")[];
}

/* ---------- what the app gets ---------- */

export interface SeatOfferView {
  key: string;
  company: string;
  /** The company on Merlin (public id), when one has this exact name. */
  companyId: string | null;
  title: string;
  from: string | null;
  to: string | null;
  active: boolean;
  kind: SeatOffer["kind"];
  fn: string | null;
  /** A seat Revenue Nomad already found there that Confirm claims instead of adding one (public id). */
  claim: string | null;
  /** The company's first seat still waits to be confirmed: a new one earns when confirmed. */
  waits: boolean;
}

export interface FollowOfferView {
  /** Public id. */
  id: string;
  /** Null while the company is locked for the member: it is described by its facts. */
  name: string | null;
  facts: string;
  following: boolean;
}

export interface ExportInfo {
  at: string;
  uses: UseKey[];
  files: string[];
  counts: ExportStore["counts"];
}

export interface ExportView {
  on: true;
  info: ExportInfo | null;
  seats: SeatOfferView[];
  follows: FollowOfferView[];
  proof: { id: string; first: string; company: string; text: string; d: string | null }[];
  /** Evidence Bank is part of the member's plan (Close): the proof use can be ticked. */
  proofAllowed: boolean;
  /** The member has a saved voice: setting one from posts replaces it. */
  hasVoice: boolean;
  /** The profile's function and title are empty: Skills can fill them. */
  emptyProfile: { function: boolean; title: boolean };
  importsLeft: number;
}
export type ExportAnswer = ExportView | { on: false };

/* ---------- words ---------- */

/** Ask for the export early (in-app only). */
export const ASK_EARLY =
  "Request your export early. LinkedIn's exports from December 2026 leave out companies and titles; an export requested before then has them. It takes LinkedIn up to a day to send the full archive.";

export const EXPORT_HOW = [
  "On LinkedIn, open Settings, then Data privacy, then Get a copy of your data.",
  "Pick the larger archive (everything), and request it.",
  "LinkedIn emails you a link. Download the .zip and pick it here. It is read on this device.",
] as const;
