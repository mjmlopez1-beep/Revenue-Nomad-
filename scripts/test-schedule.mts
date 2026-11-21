/**
 * Checks of the automatic jobs (lib/schedule.ts, lib/scheduler.ts, lib/jobs.ts, app/api/table/jobs,
 * instrumentation.ts): when each cadence is due and when it runs next, across day and week
 * boundaries; env switches that keep a job off; a job running is never started twice; cadence
 * changes only by an admin, checked on the server; the timer never starts during a build or on a
 * test server. In process, on a made-up seed in a temporary data folder, with fetch replaced and
 * every homepage read replaced: nothing leaves the machine.
 *
 *   npx tsx scripts/test-schedule.mts      exits 1 on any failure
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-schedule-"));
const seed = {
  builtAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  members: [
    { id: "m_ada", name: "Ada Admin", email: "admin-schedule@example.com", title: "Founder", token: "tok-ada-sched" },
    { id: "m_sal", name: "Sal Sales", email: "sal-schedule@example.com", title: "Fractional VP Sales", token: "tok-sal-sched" },
  ],
  companies: [
    { id: "c_one", fields: { name: "Schedule One Co", website: "one.example", industry: "SaaS" } },
    { id: "c_two", fields: { name: "Schedule Two Co", website: "two.example", industry: "SaaS" } },
    { id: "c_three", fields: { name: "Schedule Three Co", website: "three.example", industry: "Fintech" } },
  ],
  engagements: [],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(path.join(dir, "intel.json"), JSON.stringify({ ledger: [], values: {}, unlocks: {}, profiles: {} }));
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-schedule@example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RN_FREE_COMPANY: "off",
});
const SWITCHES = ["RN_SCAN", "RN_RADAR", "RN_LEADERS", "RN_LEADERS_DAILY", "RN_FUNDING", "RN_ABOUT", "RN_WEBSITES", "RN_SCHEDULER"];
for (const k of [...SWITCHES, "RN_BILLING", "STRIPE_SECRET_KEY", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RESEND_API_KEY", "RN_EMAIL_FROM", "RN_PUBLIC_URL", "NEXT_PHASE"]) delete process.env[k];
globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** A UTC time: utc("2026-11-16T13:00") (2026-11-16 is a Monday). */
const utc = (s: string) => Date.parse(`${s}:00.000Z`);
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString().slice(0, 16));
const waitFor = async (ok: () => boolean, ms = 5000) => {
  for (let t = 0; t < ms && !ok(); t += 20) await new Promise((r) => setTimeout(r, 20));
  return ok();
};

async function main() {
  const S = await import("../lib/schedule");
  const { isDue, nextRunAt, settingOf, parseSetting, envOff, schedulerShouldStart, JOB_DEFAULTS, JOBS } = S;
  const { RADAR_HOUR_UTC } = await import("../lib/radar/types");
  const { FUNDING_HOUR_UTC } = await import("../lib/funding/types");

  /* ---------- defaults ---------- */
  console.log("\nDefaults: as the jobs ran before");
  eq("scan once a week", settingOf(null, "scan"), { every: "weekly", hourUtc: 12 });
  eq("Crystal Ball each day from its hour (13:00 UTC)", settingOf(null, "radar"), { every: "daily", hourUtc: RADAR_HOUR_UTC });
  eq("leadership pages each day from 06:00 UTC", settingOf(undefined, "leaders"), { every: "daily", hourUtc: 6 });
  eq("funding filings each day from their hour", settingOf({}, "funding"), { every: "daily", hourUtc: FUNDING_HOUR_UTC });
  eq("About texts each day at 09:00 UTC, an hour no other job starts at", settingOf({}, "about"), { every: "daily", hourUtc: 9 });
  check("About's hour is no other job's", JOBS.filter((j) => j !== "about").every((j) => JOB_DEFAULTS[j].hourUtc !== JOB_DEFAULTS.about.hourUtc));
  eq("the website finder each day at 03:00 UTC, off-peak and an hour no other job starts at", settingOf({}, "websites"), { every: "daily", hourUtc: 3 });
  eq("a stored setting that isn't valid reads as the default", settingOf({ radar: { every: "hourly" as never, hourUtc: 3 }, scan: { every: "daily", hourUtc: 25 } }, "radar"), JOB_DEFAULTS.radar);
  eq("  (an hour out of range too)", settingOf({ scan: { every: "daily", hourUtc: 25 } }, "scan"), JOB_DEFAULTS.scan);
  eq("an owner's setting is read", settingOf({ about: { every: "twice-weekly", hourUtc: 22 } }, "about"), { every: "twice-weekly", hourUtc: 22 });

  /* ---------- due and next, every cadence ---------- */
  console.log("\nEvery day");
  const daily = { every: "daily" as const, hourUtc: 13 };
  check("never run, before the hour: not due", !isDue(daily, NaN, utc("2026-11-18T12:59")));
  check("never run, at the hour: due", isDue(daily, NaN, utc("2026-11-18T13:00")));
  eq("  and next is now", iso(nextRunAt(daily, null, utc("2026-11-18T13:00"))), "2026-11-18T13:00");
  check("run today at 13:02: not due again tonight", !isDue(daily, utc("2026-11-18T13:02"), utc("2026-11-18T23:59")));
  eq("  next is tomorrow at 13:00", iso(nextRunAt(daily, utc("2026-11-18T13:02"), utc("2026-11-18T23:59"))), "2026-11-19T13:00");
  check("run by hand at 02:00 today: today's run is done (as Crystal Ball's once a UTC day)", !isDue(daily, utc("2026-11-18T02:00"), utc("2026-11-18T14:00")));
  check("a missed day never runs at night: yesterday's not run, 01:00 today, not due", !isDue(daily, utc("2026-11-16T13:00"), utc("2026-11-18T01:00")));
  eq("  next is today at 13:00", iso(nextRunAt(daily, utc("2026-11-16T13:00"), utc("2026-11-18T01:00"))), "2026-11-18T13:00");
  eq("across the month and the year: Dec 31 after its run, next is Jan 1", iso(nextRunAt(daily, utc("2026-12-31T13:01"), utc("2026-12-31T18:00"))), "2027-01-01T13:00");
  eq("across a month: Nov 30 after its run, next is Dec 1", iso(nextRunAt(daily, utc("2026-11-30T13:05"), utc("2026-11-30T13:06"))), "2026-12-01T13:00");
  const midnight = { every: "daily" as const, hourUtc: 0 };
  eq("hour 0: next is midnight UTC", iso(nextRunAt(midnight, utc("2026-11-18T00:03"), utc("2026-11-18T23:00"))), "2026-11-19T00:00");
  const late = { every: "daily" as const, hourUtc: 23 };
  check("hour 23: not due at 22:59", !isDue(late, null, utc("2026-11-18T22:59")));
  check("hour 23: due at 23:30", isDue(late, null, utc("2026-11-18T23:30")));

  console.log("\nOnce a week (Monday)");
  const weekly = { every: "weekly" as const, hourUtc: 12 };
  check("Monday at 12:00, last run a week ago: due", isDue(weekly, utc("2026-11-09T12:03"), utc("2026-11-16T12:00")));
  check("Monday at 11:59: not due yet", !isDue(weekly, utc("2026-11-09T12:03"), utc("2026-11-16T11:59")));
  eq("run Monday, Wednesday: next is the Monday after (across the week)", iso(nextRunAt(weekly, utc("2026-11-16T12:04"), utc("2026-11-18T09:00"))), "2026-11-23T12:00");
  eq("run Monday, Sunday night: next is the next morning's Monday", iso(nextRunAt(weekly, utc("2026-11-16T12:04"), utc("2026-11-22T23:00"))), "2026-11-23T12:00");
  check("a missed Monday runs on Tuesday at the hour", isDue(weekly, utc("2026-11-09T12:03"), utc("2026-11-17T12:30")));
  check("  never before the hour on Tuesday", !isDue(weekly, utc("2026-11-09T12:03"), utc("2026-11-17T03:00")));
  eq("  next from Tuesday 03:00 is Tuesday 12:00", iso(nextRunAt(weekly, utc("2026-11-09T12:03"), utc("2026-11-17T03:00"))), "2026-11-17T12:00");
  check("a run by hand on Sunday: no weekly one on Monday", !isDue(weekly, utc("2026-11-15T10:00"), utc("2026-11-16T12:00")));
  eq("  it stands for Monday's: next is the Monday after", iso(nextRunAt(weekly, utc("2026-11-15T10:00"), utc("2026-11-16T12:00"))), "2026-11-23T12:00");
  check("a run by hand on Friday: Monday's still runs", isDue(weekly, utc("2026-11-13T15:00"), utc("2026-11-16T12:00")));
  eq("across the year: run Mon Dec 28, next is Mon Jan 4", iso(nextRunAt(weekly, utc("2026-12-28T12:01"), utc("2026-12-30T00:00"))), "2027-01-04T12:00");
  eq("never run, on a Thursday: due at once (the Monday's run is missed)", iso(nextRunAt(weekly, null, utc("2026-11-19T15:00"))), "2026-11-19T15:00");

  console.log("\nTwice a week (Monday and Thursday)");
  const twice = { every: "twice-weekly" as const, hourUtc: 6 };
  eq("run Monday, Tuesday: next is Thursday", iso(nextRunAt(twice, utc("2026-11-16T06:01"), utc("2026-11-17T10:00"))), "2026-11-19T06:00");
  eq("run Thursday, Friday: next is Monday (across the week)", iso(nextRunAt(twice, utc("2026-11-19T06:01"), utc("2026-11-20T10:00"))), "2026-11-23T06:00");
  check("Thursday at 06:00 after Monday's run: due", isDue(twice, utc("2026-11-16T06:01"), utc("2026-11-19T06:00")));
  check("Wednesday: not a run day, not due", !isDue(twice, utc("2026-11-16T06:01"), utc("2026-11-18T12:00")));
  check("a run by hand Wednesday night stands for Thursday's", !isDue(twice, utc("2026-11-18T22:00"), utc("2026-11-19T06:00")));
  eq("  next is Monday at the hour, never an odd hour", iso(nextRunAt(twice, utc("2026-11-18T22:00"), utc("2026-11-19T06:00"))), "2026-11-23T06:00");
  check("a run by hand Tuesday: Thursday's still runs", isDue(twice, utc("2026-11-17T10:00"), utc("2026-11-19T06:00")));

  console.log("\nOff");
  const off = { every: "off" as const, hourUtc: 6 };
  check("off: never due", [0, 1, 2, 3, 4, 5, 6].every((k) => !isDue(off, null, utc("2026-11-16T12:00") + k * DAY)));
  eq("off: no next run", nextRunAt(off, null, utc("2026-11-16T12:00")), null);

  // Every next run is due at that moment and at no half hour before it.
  {
    let bad: unknown = null;
    let rnd = 7;
    const r = () => (rnd = (rnd * 48271) % 2147483647) / 2147483647;
    for (let k = 0; k < 400 && !bad; k++) {
      const st = { every: (["daily", "twice-weekly", "weekly"] as const)[k % 3], hourUtc: Math.floor(r() * 24) };
      const now = utc("2026-11-01T00:00") + Math.floor(r() * 60 * DAY);
      const last = r() < 0.15 ? null : now - Math.floor(r() * 10 * DAY);
      const next = nextRunAt(st, last, now);
      if (next === null || !isDue(st, last, next)) bad = { st, now: iso(now), last: iso(last), next: iso(next) };
      else for (let t = now; t < next && !bad; t += 30 * 60_000) if (isDue(st, last, t)) bad = { st, now: iso(now), last: iso(last), next: iso(next), dueAt: iso(t) };
    }
    check("every next run is due then, and not before (400 cases)", !bad, bad);
  }

  /* ---------- the env switches ---------- */
  console.log("\nEnv switches win");
  eq("nothing set: scan, leaders, funding, About, website finder off; Crystal Ball on", JOBS.map((j) => envOff(j, {})), ["Off: set RN_SCAN=1 in Railway", null, "Off: set RN_LEADERS=1 in Railway", "Off: set RN_FUNDING=1 in Railway", "Off: set RN_ABOUT=1 in Railway", "Off: set RN_WEBSITES=1 in Railway"]);
  eq("all on", JOBS.map((j) => envOff(j, { RN_SCAN: "1", RN_LEADERS: "1", RN_FUNDING: "1", RN_ABOUT: "1", RN_WEBSITES: "1" })), [null, null, null, null, null, null]);
  eq("RN_RADAR=0 keeps Crystal Ball off", envOff("radar", { RN_RADAR: "0" }), "Off: remove RN_RADAR=0 in Railway");
  eq("RN_LEADERS_DAILY=0 keeps the daily read off", envOff("leaders", { RN_LEADERS: "1", RN_LEADERS_DAILY: "0" }), "Off: remove RN_LEADERS_DAILY=0 in Railway");

  /* ---------- checking a change ---------- */
  console.log("\nA cadence change is checked");
  eq("a valid change", parseSetting("radar", "weekly", 8), { job: "radar", setting: { every: "weekly", hourUtc: 8 } });
  eq("no hour keeps the job's default hour", parseSetting("about", "daily", undefined), { job: "about", setting: { every: "daily", hourUtc: 9 } });
  for (const [why, args] of [
    ["an unknown job", ["digest", "daily", 6]],
    ["an unknown cadence", ["radar", "hourly", 6]],
    ["hour 24", ["radar", "daily", 24]],
    ["a negative hour", ["radar", "daily", -1]],
    ["a fractional hour", ["radar", "daily", 3.5]],
    ["an hour as text", ["radar", "daily", "6"]],
    ["no cadence", ["radar", undefined, 6]],
  ] as [string, [unknown, unknown, unknown]][])
    check(`refused: ${why}`, "error" in parseSetting(...args), parseSetting(...args));

  /* ---------- the timer: never in a build or a test ---------- */
  console.log("\nThe timer");
  check("not during next build", !schedulerShouldStart({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }));
  check("not during next build, even with RN_SCHEDULER=1", !schedulerShouldStart({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build", RN_SCHEDULER: "1" }));
  check("not with RN_SCHEDULER=0", !schedulerShouldStart({ NODE_ENV: "production", RN_SCHEDULER: "0" }));
  check("not on a test server (RN_SCAN_TEST=1)", !schedulerShouldStart({ NODE_ENV: "production", RN_SCAN_TEST: "1" }));
  check("a test that opts in (RN_SCHEDULER=1) gets it", schedulerShouldStart({ NODE_ENV: "production", RN_SCAN_TEST: "1", RN_SCHEDULER: "1" }));
  check("not in development", !schedulerShouldStart({ NODE_ENV: "development" }));
  check("on in production by default", schedulerShouldStart({ NODE_ENV: "production" }));

  const { register } = await import("../instrumentation");
  const { jobsRuntime } = S;
  const { startScheduler, stopScheduler } = await import("../lib/scheduler");
  const env0 = { ...process.env };
  const tryRegister = async (env: Record<string, string | undefined>) => {
    for (const k of ["NEXT_RUNTIME", "NEXT_PHASE", "RN_SCHEDULER", "RN_SCAN_TEST"]) delete process.env[k];
    Object.assign(process.env, env);
    await register();
    const started = jobsRuntime.started;
    stopScheduler();
    for (const k of ["NEXT_RUNTIME", "NEXT_PHASE", "RN_SCHEDULER", "RN_SCAN_TEST"]) env0[k] === undefined ? delete process.env[k] : (process.env[k] = env0[k]);
    return started;
  };
  check("register(): not in the edge runtime", !(await tryRegister({ NEXT_RUNTIME: "edge", RN_SCHEDULER: "1" })));
  check("register(): not during next build", !(await tryRegister({ NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-build" })));
  check("register(): not on a test server", !(await tryRegister({ NEXT_RUNTIME: "nodejs", RN_SCAN_TEST: "1" })));
  check("register(): starts when a test opts in", await tryRegister({ NEXT_RUNTIME: "nodejs", RN_SCAN_TEST: "1", RN_SCHEDULER: "1" }));
  let ticks = 0;
  let slowTick: (() => void) | null = null;
  const tick = () => {
    ticks++;
    return new Promise<void>((r) => (slowTick = r));
  };
  check("startScheduler: starts once", startScheduler({ tick, everyMs: 30, firstMs: 5 }));
  check("  a second start in the same process does nothing", !startScheduler({ tick, everyMs: 30, firstMs: 5 }));
  await new Promise((r) => setTimeout(r, 150));
  eq("  a look still going is never joined by another", ticks, 1);
  (slowTick as (() => void) | null)?.();
  await waitFor(() => ticks >= 2, 1000);
  check("  the next look comes once it ended", ticks >= 2, ticks);
  stopScheduler();
  check("  a key was made for its own requests", typeof jobsRuntime.key === "string" && jobsRuntime.key.length >= 20);

  /* ---------- the jobs on the server ---------- */
  console.log("\nThe jobs");
  const t = await import("../lib/table");
  const jobs = await import("../lib/jobs");
  const { maybeAbout, DAILY_LIMIT } = await import("../lib/about/run");
  const { aboutProgress } = await import("../lib/about/types");
  const stateOnDisk = () => JSON.parse(readFileSync(path.join(dir, "intel.json"), "utf8"));
  const real = Date.now();
  const at = (ms: number) => () => new Date(ms).toISOString();

  process.env.RN_RADAR = "0";
  const started = await jobs.runDueJobs("https://post.example.com", real);
  eq("every switch off: nothing starts, whatever is due", started, { scan: false, radar: false, leaders: false, funding: false, about: false, websites: false });
  await new Promise((r) => setTimeout(r, 200));
  const s0 = await t.loadState();
  check("  and nothing ran", !s0.scan.lastRunAt && !s0.radar?.lastRunAt && !s0.about?.lastRun && !s0.funding?.lastRunAt && !s0.leadersDaily, { scan: s0.scan.lastRunAt, radar: s0.radar?.lastRunAt });
  delete process.env.RN_RADAR;

  // About texts: on, every homepage read replaced, slow, so the run is still going when the next check comes.
  process.env.RN_ABOUT = "1";
  const reads: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const fetchPage = async (domain: string) => {
    reads.push(domain);
    await gate;
    return { ok: true as const, url: `https://${domain}/`, host: domain, html: `<html><head><meta name="description" content="${domain} makes scheduling software for teams that run on fractional leaders and their weekly cadence."></head></html>` };
  };
  const mon9 = utc("2026-11-16T09:00");
  check("About, before 09:00 UTC: not due", !(await maybeAbout({ nowMs: utc("2026-11-16T08:59"), run: { fetchPage: fetchPage as never, delayMs: 0, now: at(mon9) } })));
  check("About at 09:00 UTC: starts", await maybeAbout({ nowMs: mon9, run: { fetchPage: fetchPage as never, delayMs: 0, now: at(mon9) } }));
  check("  it is running", aboutProgress.running);
  check("  a check while it runs starts nothing (its in-flight guard)", !(await maybeAbout({ nowMs: mon9 + 20 * 60_000, run: { fetchPage: fetchPage as never, delayMs: 0, now: at(mon9 + 20 * 60_000) } })));
  check("  nor does the scheduler's look", !(await jobs.runDueJobs(undefined, mon9 + 40 * 60_000)).about);
  const row1 = await jobs.jobsPanel(mon9 + 40 * 60_000);
  check("  the card says it is running, no next run", row1.jobs.find((j) => j.id === "about")!.running && row1.jobs.find((j) => j.id === "about")!.nextAt === null);
  release();
  await waitFor(() => !aboutProgress.running);
  eq("  each company was read once", reads.sort(), ["one.example", "three.example", "two.example"]);
  check("  at most DAILY_LIMIT a run", DAILY_LIMIT > 0 && (aboutProgress.run?.total ?? 0) <= DAILY_LIMIT);
  check("  the texts were filled", stateOnDisk().about.lastRun.filled === 3, stateOnDisk().about.lastRun);
  check("later the same day: not again", !(await maybeAbout({ nowMs: mon9 + 5 * HOUR, run: { fetchPage: fetchPage as never, delayMs: 0, now: at(mon9 + 5 * HOUR) } })));
  const aboutRow = (await jobs.jobsPanel(mon9 + 5 * HOUR)).jobs.find((j) => j.id === "about")!;
  eq("  the card: next run tomorrow at 09:00 UTC", aboutRow.nextAt?.slice(0, 16), "2026-11-17T09:00");
  eq("  and the last run's outcome, counts only", aboutRow.lastNote, "3 companies read, 3 filled");
  reads.length = 0;
  check("the next day at 09:00: it runs again (nothing is due, so it reads no site)", await maybeAbout({ nowMs: mon9 + DAY, run: { fetchPage: fetchPage as never, delayMs: 0, now: at(mon9 + DAY) } }));
  await waitFor(() => !aboutProgress.running);
  eq("  every text is fresh: no site read", reads, []);

  // The scan: on (RN_SCAN=1; RN_SCAN_TEST=1 here, so no job board is read).
  process.env.RN_SCAN = "1";
  let finish!: () => void;
  const slow = t.runScan(undefined, { collect: () => new Promise((r) => (finish = () => r({ roles: [], all: [], sources: [{ source: "Board A", fetched: 4, matched: 2 }], seenKeys: [] } as never))) });
  check("a scan is running", t.scanRunning());
  check("  a due check while it runs starts nothing", !(await t.maybeScan(undefined, real)));
  finish();
  await slow;
  check("  it ended", !t.scanRunning());
  const scanRow = (await jobs.jobsPanel(real)).jobs.find((j) => j.id === "scan")!;
  eq("  the card's last run, counts only", scanRow.lastNote, "2 roles from 1 job board");
  check("  next run: a Monday at 12:00 UTC", !!scanRow.nextAt && new Date(scanRow.nextAt).getUTCDay() === 1 && scanRow.nextAt.slice(11, 16) === "12:00", scanRow.nextAt);
  delete process.env.RN_SCAN;
  const offRow = (await jobs.jobsPanel(real)).jobs.find((j) => j.id === "scan")!;
  check("RN_SCAN off: the card says how to turn it on, and no next run", offRow.off === "Off: set RN_SCAN=1 in Railway" && offRow.nextAt === null, offRow);
  check("  Run now still works for the scan (as before)", offRow.canRun);

  // The owner turns About off: it never runs on its own.
  await t.tableInternals.mutate((d) => void (d.schedule = { about: { every: "off", hourUtc: 9 } }));
  check("About off in the schedule: not on its day and hour", !(await maybeAbout({ nowMs: mon9 + 3 * DAY, run: { fetchPage: fetchPage as never, delayMs: 0, now: at(mon9 + 3 * DAY) } })));
  delete process.env.RN_ABOUT;
  check("RN_ABOUT off: never", !(await maybeAbout({ nowMs: mon9 + 4 * DAY })));

  /* ---------- the admin's changes, through the route ---------- */
  console.log("\nChanges only by an admin, through /api/table/jobs");
  const { NextRequest } = await import("next/server");
  const route = await import("../app/api/table/jobs/route");
  const req = (method: "GET" | "POST", token: string | null, body?: unknown, headers: Record<string, string> = {}) =>
    new NextRequest("https://post.example.com/api/table/jobs", {
      method,
      headers: { "content-type": "application/json", ...(token ? { cookie: `rn_table=${token}` } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const call = async (r: InstanceType<typeof NextRequest>) => {
    const res = r.method === "GET" ? await route.GET(r) : await route.POST(r);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const cadence = (job: unknown, every: unknown, hourUtc?: unknown) => ({ op: "cadence", job, every, hourUtc });
  const before = JSON.stringify((await t.loadState()).schedule);
  eq("signed out: 401", (await call(req("POST", null, cadence("radar", "weekly", 8)))).status, 401);
  eq("a member: 403", (await call(req("POST", "tok-sal-sched", cadence("radar", "weekly", 8)))).status, 403);
  eq("a member can't read the card", (await call(req("GET", "tok-sal-sched"))).status, 403);
  eq("  nothing changed", JSON.stringify((await t.loadState()).schedule), before);
  for (const [why, body] of [
    ["an unknown cadence", cadence("radar", "hourly", 8)],
    ["hour 24", cadence("radar", "daily", 24)],
    ["an unknown job", cadence("digest", "daily", 8)],
    ["an unknown op", { op: "drop", job: "radar" }],
  ] as [string, unknown][]) {
    const r = await call(req("POST", "tok-ada-sched", body));
    check(`an admin, ${why}: 400 with words`, r.status === 400 && typeof r.body.error === "string", r);
  }
  const scanOff = await call(req("POST", "tok-ada-sched", cadence("scan", "daily", 8)));
  check("a job its switch keeps off can't be scheduled: says which switch", scanOff.status === 400 && String(scanOff.body.error).includes("RN_SCAN=1"), scanOff);
  eq("  nothing changed", JSON.stringify((await t.loadState()).schedule), before);
  const ok = await call(req("POST", "tok-ada-sched", cadence("radar", "twice-weekly", 8)));
  check("an admin's valid change: saved", ok.status === 200 && (await t.loadState()).schedule?.radar?.every === "twice-weekly" && (await t.loadState()).schedule?.radar?.hourUtc === 8, ok);
  check("  kept on disk", stateOnDisk().schedule?.radar?.every === "twice-weekly");
  check("  the owner's other changes stay", stateOnDisk().schedule?.about?.every === "off");
  check("  the answer is the job's new row", (ok.body.job as { every?: string })?.every === "twice-weekly");
  const foreign = await call(req("POST", "tok-ada-sched", cadence("radar", "daily", 13), { origin: "https://elsewhere.example" }));
  eq("from another site: 403", foreign.status, 403);
  const panel = await call(req("GET", "tok-ada-sched"));
  const rows = (panel.body.jobs as { id: string; every: string; hourUtc: number }[]) ?? [];
  eq("the admin's card: a row per job, in order", rows.map((r) => r.id), [...JOBS]);
  eq("  with each cadence", rows.map((r) => `${r.every} ${r.hourUtc}`), ["weekly 12", "twice-weekly 8", "daily 6", "daily 6", "off 9", "daily 3"]);
  const fundOff = await call(req("POST", "tok-ada-sched", { op: "run", job: "funding" }));
  check("Run now for the funding filings: refused with RN_FUNDING off", fundOff.status === 400 && String(fundOff.body.error).includes("RN_FUNDING=1"), fundOff);
  eq("a member can't run it", (await call(req("POST", "tok-sal-sched", { op: "run", job: "funding" }))).status, 403);

  console.log("\nThe timer's own request");
  eq("a tick with the wrong key: 404", (await call(req("POST", null, undefined, { "x-merlin-tick": "not-the-key" }))).status, 404);
  const key = jobsRuntime.key!;
  process.env.RN_RADAR = "0";
  const tickRes = await call(req("POST", null, undefined, { "x-merlin-tick": key }));
  check("a tick with this process's key runs the due checks", tickRes.status === 200 && typeof tickRes.body.started === "object", tickRes);
  check("  and the card says when it last looked", typeof (await jobs.jobsPanel()).timer.checkedAt === "string");
}

main()
  .catch((e) => {
    failures++;
    console.error(e);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${failures ? "FAILED" : "passed"}: ${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
