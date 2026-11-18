/**
 * The next-client radar: what the runtime state keeps, the shapes the app, the email and Slack
 * read, and the pilot metrics' counts. Pure types and functions, no Node imports, so lib/table.ts,
 * the API routes and the page can all use this file.
 *
 * A signal is something that happened at a company in the member's Ideal Fractional Profile that
 * makes it a likely next client:
 *   adjacent  it just got a fractional leadership hire in a function that usually comes before theirs
 *   role      an open role in their function, new since the last radar
 *   seat      a seat in their function just ended (the end was recorded since the last radar)
 *   funding   it raised money (no source yet: lib/radar/sources/funding.ts returns nothing)
 *
 * What a member is sent is a RadarCard: already cut to what their plan shows. A free card (and
 * every card while billing is off) carries no company, no person and no record id: size band,
 * industry, region, the function hired or the role title, and the revenue band. A Pro card names
 * the company only when the member's own table shows it, and links to its record.
 */

export type RadarKind = "adjacent" | "role" | "seat" | "funding";
export const RADAR_KINDS: RadarKind[] = ["role", "seat", "adjacent", "funding"];

/** One signal as a member is sent it. Safe to store in an alert batch and to send to the browser. */
export interface RadarCard {
  /** Opaque, per member: never a record's public id (a free member could look the company up by it). */
  id: string;
  kind: RadarKind;
  /** One line. Free: no company. Pro: the company when the member can see it. */
  headline: string;
  /** "51–200 people", "Software", "Texas, US", "$5M–$20M revenue": the facts that are on file. */
  facts: string[];
  /** Why it is for them: "Marketing usually comes before Sales", "In your function". */
  why: string;
  /** Pro only, and only when the member's table shows it. Null otherwise. */
  company: string | null;
  /** Pro: the company is locked for the member (it has an open role they haven't unlocked). The link opens the record, where they unlock it. */
  locked?: boolean;
  /** Where the card leads. Pro: the company's record in the app (the warm path). Free: the upgrade link. A path ("/?c=…") or an absolute URL. */
  url: string;
  /** When it happened (ISO). */
  at: string;
}

/** One member's radar for one delivery: every card for Pro, one greyed card and a count for Free. */
export interface RadarDay {
  pro: boolean;
  /** The cards shown: all of them for Pro, the first one for Free. */
  cards: RadarCard[];
  /** Signals not shown (Free's "N more today"). 0 for Pro. */
  more: number;
  total: number;
  /** "See who": the upgrade link (Free), or the radar page (Pro). */
  seeWho: string;
  /** daily: the morning ping. instant: Pro, sent in the batch after the scan or change that found it. */
  mode: "daily" | "instant";
}

/** The alert batch item lib/notify carries for the radar (Slack and webhooks). */
export interface RadarItem {
  kind: "radar";
  at: string;
  day: RadarDay;
}

/** GET /api/table?radar=1: the in-app Radar page. */
export interface RadarView {
  /** The member's radar is on (Your profile). */
  on: boolean;
  /** They named a function and an Ideal Fractional Profile, which the radar needs. */
  ready: boolean;
  function: string | null;
  /** The functions it watches for adjacent hires, and whether they came from the member's own answer. */
  before: string[];
  beforeFromMember: boolean;
  /** Billing is on (RN_BILLING=1). Off, every member gets the free view. */
  billing: boolean;
  /** Today's radar (the last 24 hours), or null when nothing matched. */
  day: RadarDay | null;
  /** Email or Slack would carry it: what the page says about delivery. */
  email: boolean;
  slack: boolean;
}

/** Per member: what was sent, so a signal never goes twice. */
export interface RadarMember {
  /** Signal key -> when it was sent (ISO). Keys are kept 120 days. */
  sent: Record<string, string>;
  lastAt?: string;
  /** Signals in the last delivery, and how it went out. */
  lastCount?: number;
  lastVia?: string;
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

/** Pilot metrics: the radar panel. Counts only. */
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
