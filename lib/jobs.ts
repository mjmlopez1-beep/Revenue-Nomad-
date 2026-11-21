/**
 * Automatic jobs, server side: run each job's due check (runDueJobs, for the scheduler's timer
 * and page loads), the Automatic jobs card in Pilot metrics (jobsPanel), and the owner's changes
 * to a cadence (setCadence). The due-time rules are in lib/schedule.ts.
 *
 * Each job keeps its own check and its own in-flight guard (maybeScan, maybeRadar, maybeLeaders,
 * maybeFunding, maybeAbout, maybeWebsites): a job that is running is never started twice, and a check with
 * nothing due only reads the state in memory. Counts only here: never a company or a person.
 */
import { loadState, maybeScan, scanRunning, tableInternals as T, type State } from "./table";
import { maybeRadar, radarRunning } from "./radar";
import { fundingRunning, maybeFunding } from "./funding/run";
import { fundingEnabled } from "./funding/types";
import { aboutEnabled, aboutProgress } from "./about/types";
import { leadersEnabled, leadersProgress } from "./leaders/types";
import { runWords, websitesEnabled, websitesProgress } from "./websites/types";
import { JOBS, JOB_WORDS, TICK_MS, envOff, jobsRuntime, nextRunAt, settingOf, type JobId, type JobRow, type JobSetting, type JobsPanel } from "./schedule";

const HOUR = 60 * 60 * 1000;
const n0 = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many: string) => `${n0(n)} ${n === 1 ? one : many}`;

/**
 * Run every job's due check once. Each check returns at once when its job is off, running, tried
 * lately or not due. `origin` is the app's address for links when RN_PUBLIC_URL isn't set (the
 * scheduler passes the one saved from members' visits). Never throws.
 */
export async function runDueJobs(origin?: string, nowMs = Date.now()): Promise<Record<JobId, boolean>> {
  const checks: Record<JobId, () => Promise<boolean> | boolean> = {
    scan: () => maybeScan(origin, nowMs),
    radar: () => maybeRadar(origin, nowMs),
    leaders: () => (leadersEnabled() ? import("./leaders/run").then((m) => m.maybeLeaders(nowMs)) : false),
    funding: () => maybeFunding(nowMs),
    about: () => (aboutEnabled() ? import("./about/run").then((m) => m.maybeAbout({ nowMs })) : false),
    websites: () => (websitesEnabled() ? import("./websites/run").then((m) => m.maybeWebsites({ nowMs })) : false),
  };
  const out = {} as Record<JobId, boolean>;
  await Promise.all(
    JOBS.map(async (job) => {
      try {
        out[job] = await checks[job]();
      } catch (e) {
        console.error(`${job} check failed`, e);
        out[job] = false;
      }
    }),
  );
  return out;
}

/** The scheduler's look (POST /api/table/jobs from its own timer): run the due checks, with the address saved from members' visits. */
export async function schedulerTick(nowMs = Date.now()): Promise<Record<JobId, boolean>> {
  jobsRuntime.checkedAt = nowMs;
  const s = await loadState();
  return runDueJobs(s.integrations?.origin ?? undefined, nowMs);
}

/** When each job last started, as its due check reads it (ms, NaN for never). */
function dueFrom(s: State, job: JobId): number {
  switch (job) {
    case "scan":
      return Date.parse(s.scan.lastRunAt ?? "");
    case "radar":
      return Date.parse(s.radar?.lastRunAt ?? "");
    case "leaders":
      return Date.parse(s.leadersDaily?.at ?? "");
    case "funding":
      return Date.parse(s.funding?.lastRunAt ?? "");
    case "about":
      return Date.parse(s.about?.lastRun?.startedAt ?? "");
    case "websites":
      return Date.parse(s.websites?.lastRun?.startedAt ?? "");
  }
}

/** The last run, started by the schedule or by hand: when, and how it went in a few words. */
function lastOf(s: State, job: JobId): { at: string | null; note: string | null; failed: boolean } {
  switch (job) {
    case "scan": {
      const at = s.scan.lastRunAt;
      if (!at) return { at: null, note: null, failed: false };
      const src = s.scan.sources;
      const failed = src.filter((x) => x.error).length;
      if (src.length && failed === src.length) return { at, note: "Every job board failed", failed: true };
      const kept = src.reduce((n, x) => n + (x.matched || 0), 0);
      return { at, note: `${plural(kept, "role", "roles")} from ${plural(src.length, "job board", "job boards")}${failed ? `, ${n0(failed)} failed` : ""}`, failed: false };
    }
    case "radar": {
      const at = s.radar?.lastRunAt ?? null;
      if (!at) return { at: null, note: null, failed: false };
      const sent = Object.values(s.radar?.members ?? {}).filter((m) => m.lastAt === at).length;
      return { at, note: `Sent to ${plural(sent, "member", "members")}`, failed: false };
    }
    case "leaders": {
      const r = s.leadersRun;
      if (!r) return { at: s.leadersDaily?.at ?? null, note: null, failed: false };
      if (!r.endedAt && !leadersProgress.running) return { at: r.startedAt, note: `Stopped before the end, ${n0(r.done)} of ${n0(r.total)} read`, failed: true };
      return { at: r.startedAt, note: `${plural(r.read, "company", "companies")} read`, failed: false };
    }
    case "funding": {
      const f = s.funding;
      if (!f?.lastRunAt) return { at: null, note: null, failed: false };
      if (f.last?.error) return { at: f.lastRunAt, note: `Stopped: ${f.last.error}`, failed: true };
      return { at: f.lastRunAt, note: f.last ? `${plural(f.last.filings, "filing", "filings")} read, ${n0(f.last.matched)} matched` : null, failed: false };
    }
    case "about": {
      const r = s.about?.lastRun;
      if (!r) return { at: null, note: null, failed: false };
      if (!r.endedAt && !aboutProgress.running) return { at: r.startedAt, note: `Stopped before the end, ${n0(r.done)} of ${n0(r.total)} read`, failed: true };
      return { at: r.startedAt, note: `${plural(r.done, "company", "companies")} read, ${n0(r.filled)} filled`, failed: false };
    }
    case "websites": {
      const r = s.websites?.lastRun;
      if (!r) return { at: null, note: null, failed: false };
      if (!r.endedAt && !websitesProgress.running) return { at: r.startedAt, note: `Stopped before the end, ${n0(r.done)} of ${n0(r.total)} read`, failed: true };
      return { at: r.startedAt, note: runWords(r), failed: false };
    }
  }
}

const runningNow: Record<JobId, () => boolean> = {
  scan: scanRunning,
  radar: radarRunning,
  leaders: () => leadersProgress.running,
  funding: fundingRunning,
  about: () => aboutProgress.running,
  websites: () => websitesProgress.running,
};

/** Whether "Run now" can start the job on this server (the scan and Crystal Ball always can; the rest need their switch). */
const canRun: Record<JobId, () => string | null> = {
  scan: () => null,
  radar: () => null,
  leaders: () => (leadersEnabled() ? null : "Set RN_LEADERS=1 in Railway first."),
  funding: () => (fundingEnabled() ? null : "Set RN_FUNDING=1 in Railway first."),
  about: () => (aboutEnabled() ? null : "Set RN_ABOUT=1 in Railway first."),
  websites: () => (websitesEnabled() ? null : "Set RN_WEBSITES=1 in Railway first. Dry run works now: it writes nothing."),
};

/** The website finder's last dry run, in this process: its counts, or how far it has got. */
function dryNote(): string | null {
  const live = websitesProgress.running && websitesProgress.run?.dry ? websitesProgress.run : null;
  if (live) return `Dry run going: ${n0(live.done)} of ${n0(live.total)} read, ${n0(live.found)} found so far`;
  const d = websitesProgress.dry?.run;
  if (!d) return null;
  const hit = d.done ? Math.round((100 * d.found) / d.done) : 0;
  return `Dry run ${d.startedAt.slice(0, 10)}: ${runWords(d)} (${hit}% found). Nothing was saved.`;
}

/** One row of the Automatic jobs card. Pure apart from the env switches and what is running in this process. */
export function jobRow(s: State, job: JobId, nowMs: number): JobRow {
  const st = settingOf(s.schedule, job);
  const off = envOff(job);
  const running = runningNow[job]();
  const last = lastOf(s, job);
  const from = dueFrom(s, job);
  let next = off || running ? null : nextRunAt(st, from, nowMs);
  // A run that failed is tried again after 6 hours (the scan when every board failed, the funding run on an error).
  if (next !== null && last.failed && (job === "scan" || job === "funding")) {
    const again = Math.max(nowMs, from + 6 * HOUR);
    if (job === "scan" || new Date(again).getUTCHours() >= st.hourUtc) next = Math.min(next, again);
  }
  const cant = canRun[job]();
  return {
    id: job,
    ...JOB_WORDS[job],
    every: st.every,
    hourUtc: st.hourUtc,
    off,
    running,
    canRun: !cant && !running,
    ...(cant ? { cantRun: cant } : {}),
    lastAt: last.at,
    lastNote: last.note,
    lastFailed: last.failed,
    nextAt: next === null ? null : new Date(next).toISOString(),
    ...(job === "websites" ? { canDry: !running, dryNote: dryNote() } : {}),
  };
}

/** The Automatic jobs card. */
export async function jobsPanel(nowMs = Date.now()): Promise<JobsPanel> {
  const s = await loadState();
  return {
    jobs: JOBS.map((job) => jobRow(s, job, nowMs)),
    timer: { on: jobsRuntime.started, checkedAt: jobsRuntime.checkedAt ? new Date(jobsRuntime.checkedAt).toISOString() : null, everyMin: Math.round(TICK_MS / 60_000) },
  };
}

/**
 * The owner's change to a job's cadence, checked by the caller (lib/schedule.ts parseSetting, admins only).
 * A job its env switch keeps off can't be scheduled: the answer says which switch.
 */
export async function setCadence(job: JobId, setting: JobSetting): Promise<{ ok: true; row: JobRow } | { ok: false; error: string }> {
  const off = envOff(job);
  if (off) return { ok: false, error: `${JOB_WORDS[job].name} is ${off[0].toLowerCase()}${off.slice(1)}.` };
  await T.mutate((d) => {
    d.schedule = { ...(d.schedule ?? {}), [job]: { every: setting.every, hourUtc: setting.hourUtc } };
  });
  return { ok: true, row: jobRow(await loadState(), job, Date.now()) };
}
