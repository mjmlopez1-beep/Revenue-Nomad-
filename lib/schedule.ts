/**
 * Automatic jobs: when each background job runs, and the words Pilot metrics shows for it.
 * Pure: no Node imports and nothing from lib/table.ts, so the table, each job's maybe* check,
 * the scheduler (lib/scheduler.ts) and the tests can all use it.
 *
 * Each job has a cadence the owner sets in Pilot metrics (State.schedule): every day, twice a
 * week (Monday and Thursday), once a week (Monday) or off, at an hour (UTC). A job is due when:
 *   - its hour has passed today (nothing starts before the hour, so a missed day never runs at night),
 *   - the latest run day of its cadence whose hour has passed has had no run since 00:00 UTC that
 *     day (a missed Monday runs on Tuesday at the hour), and
 *   - for the weekly cadences, no run came shortly before that run day's hour: a run started by
 *     hand within 2 days before a weekly one (1 day before a twice-a-week one) stands for it, so a
 *     scan pressed on Sunday doesn't bring another on Monday. Nothing ever starts at an odd hour:
 *     a job starts at its hour, or later only when the server missed it (a missed Monday runs on
 *     Tuesday at the hour).
 * The env switches still win: a job whose switch is off never runs on its own (envOff).
 */

export const JOBS = ["scan", "radar", "leaders", "funding", "about"] as const;
export type JobId = (typeof JOBS)[number];

export const CADENCES = ["daily", "twice-weekly", "weekly", "off"] as const;
export type Cadence = (typeof CADENCES)[number];

export interface JobSetting {
  every: Cadence;
  /** The hour (UTC, 0 to 23) the job starts at, on its run days. */
  hourUtc: number;
}
/** State.schedule: only the jobs the owner changed. The rest follow JOB_DEFAULTS. */
export type ScheduleState = Partial<Record<JobId, JobSetting>>;

/**
 * As the jobs ran before they had a schedule: the scan once a week, Crystal Ball each day from
 * 13:00 UTC (RADAR_HOUR_UTC), the leadership pages and the funding filings each day from 06:00
 * UTC (DAILY_HOUR_UTC, FUNDING_HOUR_UTC), and the About texts each day at 09:00, clear of the others.
 */
export const JOB_DEFAULTS: Record<JobId, JobSetting> = {
  scan: { every: "weekly", hourUtc: 12 },
  radar: { every: "daily", hourUtc: 13 },
  leaders: { every: "daily", hourUtc: 6 },
  funding: { every: "daily", hourUtc: 6 },
  about: { every: "daily", hourUtc: 9 },
};

/** The names and the few words Pilot metrics shows for each job. */
export const JOB_WORDS: Record<JobId, { name: string; what: string }> = {
  scan: { name: "Open roles scan", what: "Reads the job boards for open fractional roles, then sends the weekly email." },
  radar: { name: "Crystal Ball", what: "Sends each member the companies likely to hire them next." },
  leaders: { name: "Leadership pages", what: "Reads company websites for who leads each function." },
  funding: { name: "Funding filings", what: "Reads the day's SEC Form D filings for new raises." },
  about: { name: "About texts", what: "Reads the homepage of companies with no About yet, or an old one." },
};

/** The words for each cadence: the select's, and in a sentence ("runs every day at 9:00 AM"). */
export const CADENCE_WORDS: Record<Cadence, string> = {
  daily: "Every day",
  "twice-weekly": "Mon and Thu",
  weekly: "Mondays",
  off: "Off",
};
export const CADENCE_PHRASE: Record<Exclude<Cadence, "off">, string> = {
  daily: "every day",
  "twice-weekly": "on Mondays and Thursdays",
  weekly: "on Mondays",
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Run days, by UTC weekday (0 Sunday). */
const RUN_DAYS: Record<Exclude<Cadence, "off">, number[]> = { daily: [0, 1, 2, 3, 4, 5, 6], "twice-weekly": [1, 4], weekly: [1] };
/** A run this soon before a run day's hour stands for that day's run. */
const COVERS: Record<Exclude<Cadence, "off">, number> = { daily: 0, "twice-weekly": DAY, weekly: 2 * DAY };

/** A job's setting: the owner's, else the default. A stored value that is not valid reads as the default. */
export function settingOf(s: ScheduleState | null | undefined, job: JobId): JobSetting {
  const x = s?.[job];
  const ok = !!x && (CADENCES as readonly string[]).includes(x.every) && Number.isInteger(x.hourUtc) && x.hourUtc >= 0 && x.hourUtc <= 23;
  return ok ? { every: x.every, hourUtc: x.hourUtc } : { ...JOB_DEFAULTS[job] };
}

const dayStart = (ms: number) => Math.floor(ms / DAY) * DAY;

/** 00:00 UTC of the latest run day at or before `nowMs` whose hour has passed, or null (off). */
function lastRunDay(st: JobSetting, nowMs: number): number | null {
  if (st.every === "off") return null;
  const days = RUN_DAYS[st.every];
  for (let k = 0; k < 8; k++) {
    const d = dayStart(nowMs) - k * DAY;
    if (days.includes(new Date(d).getUTCDay()) && d + st.hourUtc * HOUR <= nowMs) return d;
  }
  return null;
}

/** Whether the job should start at `nowMs`, its last run at `lastMs` (NaN or null: never). */
export function isDue(st: JobSetting, lastMs: number | null | undefined, nowMs: number): boolean {
  if (st.every === "off") return false;
  if (new Date(nowMs).getUTCHours() < st.hourUtc) return false;
  const day = lastRunDay(st, nowMs);
  if (day === null) return false;
  const last = typeof lastMs === "number" && Number.isFinite(lastMs) ? lastMs : -Infinity;
  return last < day && day + st.hourUtc * HOUR - last >= COVERS[st.every];
}

/**
 * When the job starts next: `nowMs` when it is due now, else the first time it will be (the
 * scheduler looks every few minutes, so it starts within a few minutes of that). Null when off.
 */
export function nextRunAt(st: JobSetting, lastMs: number | null | undefined, nowMs: number): number | null {
  if (st.every === "off") return null;
  if (isDue(st, lastMs, nowMs)) return nowMs;
  // Due-ness only turns on at a day's hour.
  for (let k = 0; k <= 15; k++) {
    const t = dayStart(nowMs) + k * DAY + st.hourUtc * HOUR;
    if (t > nowMs && isDue(st, lastMs, t)) return t;
  }
  return null;
}

/**
 * Why the job can't run on its own, from the server's env switches, or null when it can. These
 * win over the schedule: a job that is off here shows as off and can't be scheduled.
 */
export function envOff(job: JobId, env: Record<string, string | undefined> = process.env): string | null {
  switch (job) {
    case "scan":
      return env.RN_SCAN === "1" ? null : "Off: set RN_SCAN=1 in Railway";
    case "radar":
      return env.RN_RADAR === "0" ? "Off: remove RN_RADAR=0 in Railway" : null;
    case "leaders":
      if (env.RN_LEADERS !== "1") return "Off: set RN_LEADERS=1 in Railway";
      return env.RN_LEADERS_DAILY === "0" ? "Off: remove RN_LEADERS_DAILY=0 in Railway" : null;
    case "funding":
      return env.RN_FUNDING === "1" ? null : "Off: set RN_FUNDING=1 in Railway";
    case "about":
      return env.RN_ABOUT === "1" ? null : "Off: set RN_ABOUT=1 in Railway";
  }
}

export const isJob = (x: unknown): x is JobId => typeof x === "string" && (JOBS as readonly string[]).includes(x);

/** A cadence change as the admin sent it, checked: the job and its new setting, or why not (words to show). */
export function parseSetting(job: unknown, every: unknown, hourUtc: unknown): { job: JobId; setting: JobSetting } | { error: string } {
  if (!isJob(job)) return { error: "That job isn't one Merlin runs. Refresh the page and try again." };
  if (typeof every !== "string" || !(CADENCES as readonly string[]).includes(every)) return { error: "Pick every day, twice a week, once a week or off." };
  const hour = hourUtc === undefined || hourUtc === null ? settingOf(null, job).hourUtc : hourUtc;
  if (typeof hour !== "number" || !Number.isInteger(hour) || hour < 0 || hour > 23) return { error: "Pick an hour from 0 to 23 (UTC)." };
  return { job, setting: { every: every as Cadence, hourUtc: hour } };
}

/**
 * Whether this server process should start the scheduler's timer. Never while `next build` runs,
 * never with RN_SCHEDULER=0, never on a test server (RN_SCAN_TEST=1) or in development unless the
 * test or developer opts in with RN_SCHEDULER=1. On in production otherwise.
 */
export function schedulerShouldStart(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NEXT_PHASE === "phase-production-build") return false;
  if (env.RN_SCHEDULER === "0") return false;
  if (env.RN_SCHEDULER === "1") return true;
  if (env.RN_SCAN_TEST === "1") return false;
  return env.NODE_ENV === "production";
}

/** Pilot metrics: one job's row in the Automatic jobs card. Counts only. */
export interface JobRow {
  id: JobId;
  name: string;
  what: string;
  every: Cadence;
  hourUtc: number;
  /** The env switch that keeps it from running on its own ("Off: set RN_SCAN=1 in Railway"), or null. */
  off: string | null;
  running: boolean;
  /** Whether "Run now" can start it on this server. */
  canRun: boolean;
  /** Why "Run now" can't, when it can't. */
  cantRun?: string;
  lastAt: string | null;
  /** How the last run went, in a few words ("412 companies read"), or null. */
  lastNote: string | null;
  lastFailed: boolean;
  /** When it starts next (ISO), or null: off, or running now. */
  nextAt: string | null;
}

export interface JobsPanel {
  jobs: JobRow[];
  /** The timer that starts due jobs without waiting for a page load: on, and when it last looked. */
  timer: { on: boolean; checkedAt: string | null; everyMin: number };
}

/** What every process shares (globalThis, so each copy of a module sees the same): the timer, its key and when it last looked. */
export interface JobsRuntime {
  started: boolean;
  /** Proves a tick request came from this process's own timer. */
  key: string | null;
  checkedAt: number | null;
}
export const jobsRuntime: JobsRuntime = ((globalThis as { __merlinJobs?: JobsRuntime }).__merlinJobs ??= { started: false, key: null, checkedAt: null });

/** How often the timer looks for due jobs. */
export const TICK_MS = 5 * 60_000;
