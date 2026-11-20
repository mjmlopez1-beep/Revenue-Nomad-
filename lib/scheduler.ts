/**
 * The timer that starts due background jobs without waiting for traffic. instrumentation.ts
 * starts it once per server process (never during `next build`, never on a test server unless
 * the test sets RN_SCHEDULER=1, off with RN_SCHEDULER=0; lib/schedule.ts schedulerShouldStart).
 *
 * Every TICK_MS it asks this same server, over loopback, to run each job's due check
 * (POST /api/jobs with the x-merlin-tick header, app/api/jobs/route.ts -> lib/jobs.ts runDueJobs).
 * Going through the server keeps the checks in the app's own copy of lib/table.ts, whose state is
 * in memory: the timer's own module copy never loads or writes the state. The header carries a
 * random key made here and kept on globalThis, so only this process's timer gets in. A check
 * costs little: each job's due check reads the state in memory and returns when nothing is due.
 * The page-load checks stay as a backup.
 */
import { randomBytes } from "node:crypto";
import { TICK_MS, jobsRuntime } from "./schedule";

const g = globalThis as { __merlinSchedulerTimers?: ReturnType<typeof setTimeout>[] };

/** The address this server listens on, from this process. */
function selfUrl(): string {
  const port = process.env.PORT || "3000";
  const h = process.env.HOSTNAME;
  const host = !h || h === "0.0.0.0" || h === "::" || h === "[::]" || h === "localhost" ? "127.0.0.1" : h.includes(":") && !h.startsWith("[") ? `[${h}]` : h;
  return `http://${host}:${port}/api/jobs`;
}

/** One look: ask the server to run whatever is due. Never throws. */
export async function selfTick(): Promise<boolean> {
  try {
    const res = await fetch(selfUrl(), { method: "POST", headers: { "x-merlin-tick": jobsRuntime.key ?? "" }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) console.error(`scheduler: the due check answered ${res.status}`);
    return res.ok;
  } catch (e) {
    console.error("scheduler: the due check failed", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Start the timer, once per process: false when it was already started. The first look comes
 * `firstMs` after the start, so the server is listening by then. `tick` is for tests.
 */
export function startScheduler(o: { everyMs?: number; firstMs?: number; tick?: () => Promise<unknown> } = {}): boolean {
  if (jobsRuntime.started) return false;
  jobsRuntime.started = true;
  jobsRuntime.key ??= randomBytes(24).toString("base64url");
  const tick = o.tick ?? selfTick;
  let busy = false;
  const look = async () => {
    if (busy) return;
    busy = true;
    try {
      await tick();
    } finally {
      busy = false;
    }
  };
  const first = setTimeout(() => void look(), o.firstMs ?? 60_000);
  const every = setInterval(() => void look(), o.everyMs ?? TICK_MS);
  first.unref?.();
  every.unref?.();
  g.__merlinSchedulerTimers = [first, every];
  console.log(`scheduler: on, looking for due jobs every ${Math.round((o.everyMs ?? TICK_MS) / 60_000)} minutes`);
  return true;
}

/** Stop the timer (tests). */
export function stopScheduler(): void {
  for (const t of g.__merlinSchedulerTimers ?? []) clearTimeout(t);
  g.__merlinSchedulerTimers = [];
  jobsRuntime.started = false;
}
