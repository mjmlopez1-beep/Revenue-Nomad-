/**
 * The radar (members read it as FEATURE_NAME, below): what the runtime state keeps, the shapes
 * the app, the email and Slack read, and the pilot metrics' counts. Pure types and functions, no
 * Node imports, so lib/table.ts, the API routes and the page can all use this file.
 *
 * A signal is something that happened at a company in the member's Ideal Fractional Profile that
 * makes it a likely next client:
 *   adjacent  it just got a fractional leadership hire in a function that usually comes before theirs
 *   role      an open role in their function, new since the last radar
 *   seat      a seat in their function just ended (the end was recorded since the last radar)
 *   funding   it raised money (no source yet: lib/radar/sources/funding.ts returns nothing)
 *
 * Every member sees every signal. A company's name is locked for everyone until they unlock it
 * (Unlock company, COMPANY_PRICE credits) or already know it, so a card names the company only
 * when the member's own table does, and never a person. Pro adds delivery: instant, in Slack.
 * Every link opens that day's companies in the app (radarPath), each one a click from unlocked.
 */

/**
 * What members call the feature, everywhere they read it: the menu, the page, the email, Slack,
 * Your profile, the unsubscribe page and Pilot metrics. Renaming it is this one line. Code,
 * routes and env vars (RN_RADAR) keep "radar".
 */
export const FEATURE_NAME = "Crystal Ball";
/** "Your Crystal Ball": headings and subjects. */
export const YOUR_FEATURE = `Your ${FEATURE_NAME}`;
/** "your Crystal Ball": in running text. */
export const yourFeature = `your ${FEATURE_NAME}`;

export type RadarKind = "adjacent" | "role" | "seat" | "funding";
export const RADAR_KINDS: RadarKind[] = ["role", "seat", "adjacent", "funding"];

/** One signal as a member is sent it. Safe to store in an alert batch and to send to the browser. */
export interface RadarCard {
  /** Opaque, per member: never a record's public id. */
  id: string;
  /** Opaque, per member: the same for two signals at one company, so a merged post counts companies. */
  co: string;
  kind: RadarKind;
  /** One line, naming the company only when the member's table does. */
  headline: string;
  /** "51–200 people", "Software", "Texas, US", "$5M–$20M revenue": the facts that are on file. */
  facts: string[];
  /** Why it is for them: "Marketing usually comes before Sales", "An open Sales role, at a company in your profile". */
  why: string;
  /** The company's name when the member's table shows it. Null otherwise. */
  company: string | null;
  /** The company is locked for the member: the day's companies are where they unlock it. */
  locked?: boolean;
  /** Where the card leads: the day's companies in the app (radarPath). A path, or absolute once tracked. */
  url: string;
  /** When it happened (ISO). */
  at: string;
}

/** One member's radar for one delivery: every signal, and the day's companies to open. */
export interface RadarDay {
  cards: RadarCard[];
  /** Signals in it (cards.length) and the companies they are at. */
  total: number;
  companies: number;
  /** The UTC day it went out ("2026-11-19"), the view's ?sig=. */
  day: string;
  /** The day's companies in the app (radarPath(day)). A path, or absolute once tracked. */
  url: string;
  /** daily: the morning ping. instant: Pro, sent in the batch after the scan or change that found it. */
  mode: "daily" | "instant";
}

/** The alert batch item lib/notify carries for the radar (Slack and webhooks). */
export interface RadarItem {
  kind: "radar";
  at: string;
  day: RadarDay;
}

/** A UTC day as ?sig= carries it. */
export const SIG_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** The app's address for one day's companies: the email's, Slack's and the page's link. */
export const radarPath = (day: string) => `/?p=table&sig=${day}`;

/** One company in a day's view: its public id (as the member's table has it) and what happened there. */
export interface RadarRow {
  id: string;
  kinds: RadarKind[];
  /** A line for each signal, never naming the company: "Hired a fractional Finance leader · Finance usually comes before Sales". */
  lines: string[];
}

/** GET /api/table?radar=1[&day=YYYY-MM-DD]: one day's companies, for the list in the app. */
export interface RadarView {
  /** The member's radar is on (Your profile). */
  on: boolean;
  /** They named a function and an Ideal Fractional Profile, which the radar needs. */
  ready: boolean;
  function: string | null;
  /** The functions it watches for adjacent hires, and whether they came from the member's own answer. */
  before: string[];
  beforeFromMember: boolean;
  /** The day shown, and today (UTC). */
  day: string;
  today: string;
  /** The day asked for is older than what is kept (or not a day): `day` is the latest instead. */
  expired?: boolean;
  /** The last RADAR_VIEW_DAYS days, today first, with how many companies each has (the day switcher). */
  days: { day: string; companies: number }[];
  /** The day's companies. */
  rows: RadarRow[];
  /** Email or Slack would carry it: what the page says about delivery. */
  email: boolean;
  slack: boolean;
}

/** A company in one delivery, kept for that day's view: the signal's key, the internal company id, its kind and line. */
export interface RadarSentRow {
  k: string;
  c: string;
  kind: RadarKind;
  l: string;
}

/** Per member: what was sent, so a signal never goes twice, and each day's companies. */
export interface RadarMember {
  /** Signal key -> when it was sent (ISO). Keys are kept 120 days. */
  sent: Record<string, string>;
  lastAt?: string;
  /** Signals in the last delivery, and how it went out. */
  lastCount?: number;
  lastVia?: string;
  /** What went out each UTC day ("2026-11-19"), for that day's view. Kept RADAR_KEEP_VIEW_DAYS days. */
  days?: Record<string, RadarSentRow[]>;
}

export interface RadarState {
  /** The last daily run (ISO) and its UTC day ("2026-11-18"). */
  lastRunAt: string | null;
  lastRunDay: string | null;
  /** The last instant check for Pro members (ISO). */
  instantAt?: string | null;
  members: Record<string, RadarMember>;
  /** Counts only. */
  stats: { runs: number; sent: number; emails: number; slack: number; instant: number };
}

export const emptyRadar = (): RadarState => ({ lastRunAt: null, lastRunDay: null, members: {}, stats: { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 } });

/** The product signals the radar records (State.signals). */
export const RADAR_SIGNALS = ["radar_sent", "radar_opened", "radar_clicked", "radar_off"] as const;
export type RadarSignal = (typeof RADAR_SIGNALS)[number];

/** The daily run goes out on the first page load after this hour (UTC). */
export const RADAR_HOUR_UTC = 13;
/** How long a sent signal is remembered (it never goes twice inside this). */
export const RADAR_KEEP_DAYS = 120;
/** A daily run looks back to the last run, at most this far. */
export const RADAR_MAX_WINDOW_DAYS = 7;
/** The day switcher lists this many days, today first. */
export const RADAR_VIEW_DAYS = 7;
/** A delivery's companies are kept this long, so an older email's link still opens its day. */
export const RADAR_KEEP_VIEW_DAYS = 14;

/** Pilot metrics: the radar's panel. Counts only. */
export interface RadarStats {
  /** Members whose radar is on and can match something (a function and an Ideal Fractional Profile). */
  on: number;
  /** Members who turned it off. */
  off: number;
  sentToday: number;
  sent7: number;
  opens7: number;
  clicks7: number;
  clicks: number;
  lastRunAt: string | null;
}

/** The radar panel's counts, from the state's parts. Pure. `eligible`: members with the radar on and a function and IFP. */
export function radarStats(
  r: RadarState | undefined,
  signals: { name: string; at: string }[],
  profiles: Record<string, { radarOff?: boolean }>,
  eligible: number,
  nowMs: number,
): RadarStats {
  const DAY = 24 * 60 * 60 * 1000;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const out: RadarStats = { on: eligible, off: 0, sentToday: 0, sent7: 0, opens7: 0, clicks7: 0, clicks: 0, lastRunAt: r?.lastRunAt ?? null };
  for (const p of Object.values(profiles)) if (p?.radarOff) out.off++;
  for (const x of signals) {
    if (!x.name.startsWith("radar_")) continue;
    const age = nowMs - Date.parse(x.at);
    const week = age < 7 * DAY;
    if (x.name === "radar_sent") {
      if (x.at.slice(0, 10) === today) out.sentToday++;
      if (week) out.sent7++;
    } else if (x.name === "radar_opened" && week) out.opens7++;
    else if (x.name === "radar_clicked") {
      out.clicks++;
      if (week) out.clicks7++;
    }
  }
  return out;
}
