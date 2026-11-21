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
 *   funding   it raised money (SEC Form D filings with RN_FUNDING=1: lib/funding, lib/radar/sources/funding.ts)
 *   sales-build  its career feed posted its first full-time sales hires (AE, SDR, BDR), or a jump in them
 *   departure    a leader its own website listed for the member's function is gone from it
 *   tenure       a fractional seat in their function reached the months seats like it usually last (typical tenure)
 *   rehire       it ended a fractional seat 3 to 24 months ago (it has hired fractionals before)
 *   arrival      a new full-time leader on its own website, in a function whose arrival tends to bring theirs
 *   team-build   its career feed posted a burst of full-time hires in their function (marketing, engineering…)
 *   headcount    its size band rose to where the research puts the next fractional seat (People)
 *   gap          its own team page shows no leader in their function, at a stage where one is usual (a state)
 *
 * Besides these events, a member's day can be filled with standing states (still true, not new:
 * "Still a good time: …") when fewer than two fresh events reach them (lib/radar/match.ts pickDaily).
 *
 * Each signal for a member is scored (lib/radar/match.ts scoreFor, lib/radar/predict.ts): how
 * likely the company is to hire a fractional in their function next, times how well the timing
 * fits, times how well it fits their profile. Cards are ranked by that score and carry a plain
 * band (High, Medium, Low) and a why-now line, never a percentage. Low stays off the email and
 * Slack (it is still on the page).
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

/**
 * Opening a company from Crystal Ball (and the Today card, which shows its top row), by plan
 * (Me.crystal, lib/table.ts crystalOf). Trial and Pro: every company in it opens free, "Open". Free
 * (trial over): one a UTC day opens with everything on it, then "Upgrade to open more" and the line.
 */
export const CRYSTAL_OPEN_ONE = "Open free · 1 left today";
export const CRYSTAL_UPGRADE = "Upgrade to open more";
/** Get started's hint and the balance's line on Free while today's is left (the free company of the day is Crystal Ball's there). */
export const CRYSTAL_FREE_TODAY = `1 free in ${FEATURE_NAME} today`;
export const CRYSTAL_USED_LINE = `Your free ${FEATURE_NAME} company for today is used. Pro opens every company in your ${FEATURE_NAME}.`;

export type RadarKind = "adjacent" | "role" | "seat" | "funding" | "sales-build" | "departure" | "tenure" | "rehire" | "arrival" | "team-build" | "headcount" | "gap";
export const RADAR_KINDS: RadarKind[] = ["role", "seat", "departure", "adjacent", "arrival", "sales-build", "team-build", "funding", "rehire", "tenure", "headcount", "gap"];
/** How likely, in a word: never a percentage. */
export type RadarBand = "High" | "Medium" | "Low";

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
  /** How likely, in a word. */
  band?: RadarBand;
  /** Why now, from the rule: "Fractional CMO hired 5 months ago · Sales usually follows in 4–9 months". */
  whyNow?: string;
  /** The company's name when the member's table shows it. Null otherwise. */
  company: string | null;
  /** The company is locked for the member: the day's companies are where they unlock it. */
  locked?: boolean;
  /** Where the card leads: the day's companies in the app (radarPath). A path, or absolute once tracked. */
  url: string;
  /** When it happened (ISO). */
  at: string;
  /**
   * For a post laid out one company a block (Slack): who, in words ("Acme Robotics", or "A SaaS
   * company" for one locked for the member), and what happened, without the company ("No longer
   * lists a Sales leader"). Cards kept from before these were added have neither: read `headline`.
   */
  subject?: string;
  signal?: string;
  /** The free facts on file, each by name (`facts` has the same values, unlabeled). */
  about?: { industry?: string; size?: string; hq?: string; revenue?: string };
  /** Only when the card names the company: its record in the app ("/?c=<public id>"). A path, or absolute once tracked. */
  place?: string;
  /**
   * The email's link for this card: the company's record opened from that day's Crystal Ball
   * (radarOpenPath), so it opens there as it would from the page (free on Trial and Pro, today's
   * one on Free). Locked or not: the record of a locked company stays locked and unnamed.
   */
  open?: string;
  /** The member's own table shows the company (a known company: Open), not only a name on the card (Trial and Pro). */
  known?: boolean;
  /**
   * A company the member doesn't know yet, and how it opens from their Crystal Ball: "free" (Trial
   * and Pro: Open, no credits), "one" (Free: one company a day opens in full, free). Absent: the
   * 2-credit unlock, as anywhere (billing off).
   */
  opens?: "free" | "one";
  /** Only for a known company: a public https image of its logo (the icon service the app draws from). Never for a locked one. */
  logo?: string;
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
/**
 * One company's record, opened from one day's Crystal Ball (the email's card links): the app
 * opens the record over that day's companies, so its Open is the one Crystal Ball gives, and
 * closing it shows the day. `id` is the company's public id, as the member's table has it.
 */
export const radarOpenPath = (day: string, id: string) => `/?sig=${day}&c=${encodeURIComponent(id)}`;

/* ---------- how often the email comes, per member ---------- */

/** How often the Crystal Ball email comes (Notifications). Daily unless the member picked another. */
export const RADAR_EVERY = ["daily", "twice", "weekly"] as const;
export type RadarEvery = (typeof RADAR_EVERY)[number];
export type RadarEmail = RadarEvery | "off";
/** The choices' words (Notifications, the unsubscribe page). */
export const RADAR_EVERY_WORDS: Record<RadarEmail, string> = { daily: "Every morning", twice: "Twice a week", weekly: "Once a week", off: "Off" };
/** When each choice goes: twice a week on Monday and Thursday mornings, once a week on Monday's, with what is new since the last one. */
export const RADAR_EVERY_WHEN: Record<RadarEvery, string> = {
  daily: "On mornings when a company in your profile moves.",
  twice: "Monday and Thursday mornings, with what moved since the last one.",
  weekly: "Monday mornings, with what moved that week.",
};
/** What the member chose, from their profile. `radarOff` (before Notifications): both off. */
export interface RadarPrefsStored {
  radarOff?: boolean;
  radarEmail?: RadarEmail;
  radarSlackOff?: boolean;
}
/** The email's choice and whether Crystal Ball posts to Slack, as the profile says. */
export function radarPrefs(p: RadarPrefsStored | undefined): { email: RadarEmail; slack: boolean } {
  if (p?.radarOff) return { email: "off", slack: false };
  const email = p?.radarEmail && (RADAR_EVERY as readonly string[]).includes(p.radarEmail) ? p.radarEmail : p?.radarEmail === "off" ? "off" : "daily";
  return { email, slack: !p?.radarSlackOff };
}

/** Run days by UTC weekday (0 Sunday): twice a week Monday and Thursday, once a week Monday (as Pilot metrics' own cadences). */
const EVERY_DAYS: Record<RadarEvery, number[]> = { daily: [0, 1, 2, 3, 4, 5, 6], twice: [1, 4], weekly: [1] };
/**
 * The member's email is due on this run: daily always; otherwise when no Crystal Ball email went
 * to them since the start of the latest run day of their choice that has come (a run missed on a
 * Monday goes on Tuesday). Pure.
 */
export function radarEmailDue(every: RadarEvery, lastMailIso: string | null | undefined, nowMs: number): boolean {
  if (every === "daily") return true;
  const last = Date.parse(lastMailIso ?? "");
  if (!Number.isFinite(last)) return true;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const today = Date.parse(`${new Date(nowMs).toISOString().slice(0, 10)}T00:00:00.000Z`);
  for (let back = 0; back < 7; back++) {
    const d = today - back * DAY_MS;
    if (EVERY_DAYS[every].includes(new Date(d).getUTCDay())) return last < d;
  }
  return true;
}

/**
 * The page's ranges (the switcher): Today, the last 7 days and the last 30 days, each counting back
 * from today (UTC). A range lists each company once, at its most recent day in it.
 */
export type RadarRange = "today" | "7d" | "30d";
export const RADAR_RANGES: { range: RadarRange; days: number; label: string }[] = [
  { range: "today", days: 1, label: "Today" },
  { range: "7d", days: 7, label: "Last 7 days" },
  { range: "30d", days: 30, label: "Last 30 days" },
];
/** A range as ?range= carries it (the page's address and GET ?radar=1&range=), or null. */
export const radarRangeOf = (x: unknown): RadarRange | null => RADAR_RANGES.find((r) => r.range === x)?.range ?? null;
/** "Today", "Last 7 days", "Last 30 days". */
export const rangeLabel = (r: RadarRange) => RADAR_RANGES.find((x) => x.range === r)!.label;

/** One company in a day's view: its public id (as the member's table has it) and what happened there. */
export interface RadarRow {
  id: string;
  /** In a range: the UTC day its lines are from, the most recent day it appeared in the range. */
  day?: string;
  kinds: RadarKind[];
  /** A line for each signal, never naming the company: "Hired a fractional Finance leader · Finance usually comes before Sales". */
  lines: string[];
  /** Beside each line: its band and why-now ("High · Fractional CRO hired 2 months ago · RevOps usually follows in 1–4 months"). */
  notes?: string[];
  /** The best band of the company's signals. */
  band?: RadarBand;
  /**
   * Trial and Pro only: the company's name, free on this view while the member's table still has
   * it locked. Naming it doesn't make the company theirs; its Open here does, for 0 credits
   * (Me.crystal "all"). Its people and seat holders keep their own unlocks.
   */
  name?: string;
}

/**
 * GET /api/table?radar=1[&day=YYYY-MM-DD]: one day's companies (the latest day with any, with no
 * day), what Home, Today's moves and the connect moment read. With &range= (the page): a range of
 * days (`range`, `ranges`), or the day asked for when it is kept (an email's or Slack's link).
 */
export interface RadarView {
  /** The member's radar is on (Your profile). */
  on: boolean;
  /** They named a function, which the page needs. */
  ready: boolean;
  /** [ux ws3] Ready with no Ideal Fractional Profile: the page lists any company, and nothing goes by email or Slack until they set one. */
  anyCompany?: boolean;
  function: string | null;
  /** The functions it watches for adjacent hires, and whether they came from the member's own answer. */
  before: string[];
  beforeFromMember: boolean;
  /** The day shown (a range: today), and today (UTC). */
  day: string;
  today: string;
  /** The day asked for is older than what is kept (or not a day): `day` is the latest instead (with &range=, the range that opens by default). */
  expired?: boolean;
  /**
   * The last RADAR_VIEW_DAYS days, today first, with how many companies each has: what counts
   * what is new since the member last looked (Home's "Since your last visit", the menu's count).
   */
  days: { day: string; companies: number }[];
  /** With &range= only: the range shown, or null for one day (a day's link that is still kept). */
  range?: RadarRange | null;
  /** With &range= only: each range with how many companies it lists (the switcher), Today first. */
  ranges?: { range: RadarRange; companies: number }[];
  /** The day's companies, or the range's, most likely first. */
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
  /** Band and why-now (rows kept before Crystal Ball scored have neither). */
  b?: RadarBand;
  w?: string;
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
  /** Internal company id -> when a company was last sent to them, kept RADAR_COMPANY_QUIET_DAYS: a calendar signal or a standing state never repeats a company inside it. */
  shown?: Record<string, string>;
  /** The last Crystal Ball email (ISO): when a twice-a-week or weekly email is next due (radarEmailDue). */
  lastMailAt?: string;
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
/** A member's day: at most this many companies, and when fewer fresh events reach them, standing states fill it to RADAR_DAY_MIN. */
export const RADAR_DAY_MAX = 5;
export const RADAR_DAY_MIN = 2;
/** At most this many companies in one delivery, by how often the member's email comes: a roll-up carries more than one morning's. */
export const RADAR_ROLLUP_MAX: Record<RadarEvery, number> = { daily: RADAR_DAY_MAX, twice: 8, weekly: 10 };
/** How a standing state's why-now starts (lib/radar/match.ts): still true, nothing new happened there today. */
export const RADAR_STILL = "Still a good time:";
/** A company sent to a member is not sent again inside this many days unless something new happened there. */
export const RADAR_COMPANY_QUIET_DAYS = 30;
/** A High or Medium event the day's cap held back stays eligible this long (the run looks back this far for unsent events). */
export const RADAR_CARRY_DAYS = 7;
/** The day switcher lists this many days, today first. */
export const RADAR_VIEW_DAYS = 7;
/** A delivery's companies are kept this long, so Last 30 days lists them and an older email's link still opens its day. */
export const RADAR_KEEP_VIEW_DAYS = 31;

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
  /** Crystal Ball's model: Merlin's observed transitions between fractional leadership seats (A then B at one company), counts only. */
  model?: {
    transitions: number;
    companies: number;
    /** Transitions by the stage when the next seat started (seats with no stage on file are only in the total). */
    byStage: { stage: string; n: number }[];
    /** The most common pairs: function to function, counts. */
    top: { from: string; to: string; n: number }[];
    /** The new seat and company facts on file: counts only ("who introduced you" is counted, never shown). */
    facts: { ownership: number; whyNow: number; endReason: number; introducedBy: number; revenueThen: number; employeesThen: number };
    /** Companies whose career feed sales hires are counted, and the rises read as a sales build. */
    salesBuild: { companies: number; rises: number };
    /** Leaders gone from a company's website (the last 180 days). */
    departures: number;
  };
}

/** The radar panel's counts, from the state's parts. Pure. `eligible`: members with the radar on and a function and IFP. */
export function radarStats(
  r: RadarState | undefined,
  signals: { name: string; at: string }[],
  profiles: Record<string, RadarPrefsStored>,
  eligible: number,
  nowMs: number,
): RadarStats {
  const DAY = 24 * 60 * 60 * 1000;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const out: RadarStats = { on: eligible, off: 0, sentToday: 0, sent7: 0, opens7: 0, clicks7: 0, clicks: 0, lastRunAt: r?.lastRunAt ?? null };
  // Off: the email is off (Slack can still be on: Notifications sets the two apart).
  for (const p of Object.values(profiles)) if (radarPrefs(p).email === "off") out.off++;
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
