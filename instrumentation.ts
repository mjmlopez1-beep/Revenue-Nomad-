/**
 * Runs once when the server starts (Next.js instrumentation). Starts the timer that runs the
 * background jobs when they are due (lib/scheduler.ts), in the Node.js server only, never while
 * `next build` runs, never on a test server unless it opts in (lib/schedule.ts schedulerShouldStart).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { schedulerShouldStart } = await import("./lib/schedule");
  if (!schedulerShouldStart(process.env)) return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
