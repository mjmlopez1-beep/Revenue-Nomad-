/**
 * Smart ways in (lib/paths): the member's best ways into a company through people they already know,
 * found across their own LinkedIn connections (the Connections.csv they upload), their own Google
 * network (lib/google) and the Revenue Nomad members they have messaged, paired with what Merlin
 * knows about seats, leaders and members.
 *
 * Pure: no I/O, relative imports only, so the server, the app and the checks all read it.
 *
 * What is kept (State.paths[memberId]), and nothing else:
 *  - the member's LinkedIn connections as they uploaded them: name, company, position, the day
 *    they connected, the profile's address and the email when LinkedIn gave one;
 *  - when they uploaded a file (the last few times, for the daily limit).
 * Everything else (the matches, the paths, the counts) is worked out when it is asked for and never
 * stored, so deleting the import deletes all of it. It is the member's alone, at the same level as
 * their Google network: never shown to another member or an admin, never in the export, never used
 * for anyone else's results, and never sent through the connector by name.
 */
import type { Warmth } from "../google/types";

/* ---------- what is kept ---------- */

/**
 * One LinkedIn connection as kept: f first name, l last name, c company, p position, d the day
 * connected (YYYY-MM-DD), u the profile's slug (linkedin.com/in/<u>), e an email. Short keys: a
 * member can have 30,000 of these.
 */
export interface LinkedInRow {
  f: string;
  l: string;
  c?: string;
  p?: string;
  d?: string;
  u?: string;
  e?: string;
}

export interface LinkedInStore {
  /** When the file was read (ISO). */
  at: string;
  rows: LinkedInRow[];
  /** Rows the file had that were not kept (no name, a duplicate, over the limit). A count only. */
  skipped: number;
}

export interface MemberPaths {
  linkedin?: LinkedInStore;
  /** When the member uploaded a file (ISO), the last IMPORTS_DAILY: the daily limit. Not derived from any file. */
  imports?: string[];
}

/** State.paths: member id -> what they uploaded. Nobody else's answer ever reads another member's entry. */
export type PathsState = Record<string, MemberPaths>;

/* ---------- limits ---------- */

/** LinkedIn's own cap on connections. */
export const ROWS_MAX = 30_000;
/** The file, as uploaded. A full 30,000-row export is about 4 MB. */
export const FILE_MAX_BYTES = 8 * 1024 * 1024;
/** Uploads a member can make in any rolling 24 hours. */
export const IMPORTS_DAILY = 3;
/** Targets "Your hidden paths" lists. */
export const TARGETS_MAX = 20;
/** Paths a company's record shows. */
export const COMPANY_PATHS_MAX = 8;

/* ---------- what the app gets ---------- */

/** Where Merlin knows the person from: the member's own LinkedIn, their own Google network, a member they messaged. */
export type PathSource = "linkedin" | "google" | "messages";

/**
 * The kinds of way in, strongest first.
 *  1st degree, someone you know:
 *   leads    is a leader at the company now (their title reads like one who hires or signs);
 *   hired    hired (or managed) a fractional there, as Merlin has them on a seat;
 *   seat     holds, or held, a fractional seat there;
 *   works    works there now.
 *  2nd degree, someone you know who knows someone there:
 *   overlap  held a seat at another company at the same time as someone who holds or held one here;
 *   colleague works now where someone who holds or held a seat here also holds one now;
 *   prevco   works now where someone who holds or held a seat here (or one of its leaders) worked before;
 *   client   a member in the Fractionals directory who serves the company, and you both worked with one client.
 */
export type PathKind = "leads" | "hired" | "seat" | "works" | "overlap" | "colleague" | "prevco" | "client";
export const FIRST_DEGREE: readonly PathKind[] = ["leads", "hired", "seat", "works"];

/** The person the path goes through, as the member's own list has them. */
export interface PathVia {
  name: string;
  first: string;
  title: string | null;
  src: PathSource[];
  /** Their warmth from the member's own Google network or messages; null for a LinkedIn connection alone. */
  warmth: Warmth | null;
  /** Why, in words: "4 meetings, last in March", "LinkedIn connection since 2021". */
  why: string;
  email: string | null;
  /** Their LinkedIn profile (the address the member's own file gave). */
  linkedin: string | null;
  /** A Revenue Nomad member: the note can go on Merlin. */
  member: boolean;
}

export interface PathView {
  /** Stable within one answer, for the page's keys. */
  key: string;
  kind: PathKind;
  degree: 1 | 2;
  /** 1 to 100: every 1st degree path scores above every 2nd degree one. */
  score: number;
  strength: "Strong" | "Good" | "Worth a try";
  /** The one plain sentence: "Dana Reyes (your LinkedIn connection) worked with Acme's fractional RevOps lead at Brightloop in 2023." */
  line: string;
  /** The next action: "Ask Dana for an intro." */
  action: string;
  via: PathVia;
  /** A note in the member's own voice, to send themselves. */
  note: { subject: string; body: string };
}

/** One company the member has a way into, for "Your hidden paths". */
export interface TargetView {
  /** The company's public id. */
  id: string;
  /** Its name, when the member can see it; null for a company still locked for them. */
  name: string | null;
  /** Its free facts: "SaaS · 51–200". */
  facts: string;
  /** In their Crystal Ball, and the saved view it matches (its name), when it does. */
  ball: boolean;
  view: string | null;
  best: PathView;
  /** Ways in there, the best included. */
  count: number;
  /** How many of them go through someone the member knows directly. */
  first: number;
}

export interface LinkedInInfo {
  at: string;
  /** Connections kept, and how many work at a company on Merlin. */
  rows: number;
  matched: number;
  skipped: number;
}

export interface PathsView {
  on: true;
  linkedin: LinkedInInfo | null;
  /** Uploads left in the rolling day. */
  importsLeft: number;
  /** The best targets first (Crystal Ball and saved views), at most TARGETS_MAX. */
  targets: TargetView[];
  /** Public company id -> ways in there, every company with one, and how many are 1st degree. */
  counts: Record<string, { n: number; first: number }>;
}
export type PathsAnswer = PathsView | { on: false };

/** GET /api/paths?company=: one company's ways in, best first. */
export interface CompanyPathsView {
  id: string;
  paths: PathView[];
}

/* ---------- words the app shares ---------- */

/** "2 ways in through people you know": Crystal Ball's chip. */
export const waysWords = (n: number) => `${n} ${n === 1 ? "way" : "ways"} in through people you know`;

/** The three steps to LinkedIn's own export. */
export const EXPORT_STEPS = [
  "On LinkedIn, open Settings, then Data privacy.",
  "Pick Get a copy of your data, tick Connections, and request the archive.",
  "LinkedIn emails you a link, usually within minutes. Download it and pick Connections.csv here.",
] as const;
