/**
 * Own sites (lib/ownsites): read fractionals' own firm websites for the email they publish, in the
 * background.
 *
 *  - The daily job (maybeOwnSites, only with RN_OWNSITES=1): DAILY_BATCH people a day, on the
 *    schedule (lib/schedule.ts, "ownsites"). What it finds is usable: the seat holder's record shows
 *    it, locked, "From their website" (lib/table.ts ownSitePeople).
 *  - The start-up dry run (maybeOwnSitesDry, RN_OWNSITES_DRYRUN=N): once per distinct N (marked in
 *    the state, so a restart doesn't repeat it), up to N people, those with a known site first. It
 *    stores what it finds as pending (never usable) and logs counts only, every 100 and at the end.
 *  - "Dry run" and "Run now" in Automatic jobs (the admin).
 *
 * Four people at a time, one request per host at a time, a pause between a worker's people.
 * Results are saved in batches, so a restart carries on. One run at a time per process.
 * Logs carry counts only: never an email, a name or a domain.
 */
import { hostGates } from "../about/run";
import { isDue, settingOf } from "../schedule";
import { loadState } from "../table";
import { readOwnSite, type ReadOpts, type ReadOutcome } from "./read";
import { claimDry, clientSites, ownTargets, saveOwn } from "./store";
import { DAILY_BATCH, dryRunCount, emptyRun, ownSitesEnabled, ownSitesProgress, runWords, type OwnRunSummary } from "./types";

export const CONCURRENCY = 4;
export const DELAY_MS = 500;
const BATCH = 20;
const SAVE_EVERY_MS = 15_000;
/** How often the log says how far a run has got. */
export const LOG_EVERY = 100;

export interface RunOpts {
  dry?: boolean;
  limit?: number;
  concurrency?: number;
  delayMs?: number;
  read?: ReadOpts;
  now?: () => string;
  /** The words before the counts in the log ("ownsites dry run (RN_OWNSITES_DRYRUN=632)"). */
  label?: string;
  /** Where the log lines go (tests capture them). */
  log?: (line: string) => void;
  /** A progress line every this many people (LOG_EVERY). */
  logEvery?: number;
}

const flight = globalThis as { __merlinOwnSitesFlight?: Promise<OwnRunSummary> | null };
export const ownSitesRunning = () => ownSitesProgress.running;

function tally(run: OwnRunSummary, x: ReadOutcome) {
  run.tried++;
  run.pages += x.pages;
  switch (x.s) {
    case "found":
      run.accepted++;
      run.byHow[x.how]++;
      break;
    case "no site found":
      run.noSite++;
      break;
    case "site unreachable":
      run.unreachable++;
      break;
    case "robots":
      run.robots++;
      break;
    case "no email":
      run.noEmail++;
      break;
    case "email not theirs":
      run.notTheirs++;
      break;
  }
}

/** One run. A second call while one runs gets the same run. */
export function runOwnSites(o: RunOpts = {}): Promise<OwnRunSummary> {
  flight.__merlinOwnSitesFlight ??= (async () => {
    const now = o.now ?? (() => new Date().toISOString());
    const dry = !!o.dry;
    const log = o.log ?? ((l: string) => console.log(l));
    const label = o.label ?? (dry ? "ownsites dry run" : "ownsites");
    const t0 = Date.now();
    const run = emptyRun(now(), dry);
    ownSitesProgress.running = true;
    ownSitesProgress.run = run;
    try {
      const targets = (await ownTargets({ nowIso: run.startedAt, dry })).slice(0, Math.max(0, o.limit ?? DAILY_BATCH));
      run.total = targets.length;
      const taken = o.read?.taken ?? (await clientSites());
      const gate = o.read?.fetch?.hostGate ?? hostGates();
      const read: ReadOpts = { ...o.read, taken, fetch: { ...o.read?.fetch, hostGate: gate }, find: { ...o.read?.find, fetch: { ...o.read?.find?.fetch, hostGate: gate } } };
      const delay = o.delayMs ?? DELAY_MS;
      const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
      let pending: ReadOutcome[] = [];
      let lastSave = Date.now();
      let saving: Promise<void> = Promise.resolve();
      const save = () => {
        if (!pending.length) return saving;
        const batch = pending;
        pending = [];
        lastSave = Date.now();
        saving = saving.then(() => saveOwn(batch, dry, now(), { ...run }).catch((e) => console.error("ownsites: saving a batch failed", e instanceof Error ? e.message : "error")));
        return saving;
      };
      let next = 0;
      const worker = async () => {
        while (next < targets.length) {
          const t = targets[next++];
          const out = await readOwnSite(t, { ...read, delayMs: o.read?.delayMs });
          tally(run, out);
          pending.push(out);
          if (run.tried % (o.logEvery ?? LOG_EVERY) === 0 && run.tried < run.total) log(`${label}: ${runWords(run)}; ${secs()}s so far`);
          if (pending.length >= BATCH || Date.now() - lastSave >= SAVE_EVERY_MS) void save();
          if (delay > 0 && next < targets.length) await new Promise((r) => setTimeout(r, delay));
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, Math.min(o.concurrency ?? CONCURRENCY, targets.length || 1)) }, worker));
      run.endedAt = now();
      await save();
      await saving;
      await saveOwn([], dry, now(), run).catch((e) => console.error("ownsites: saving the run failed", e instanceof Error ? e.message : "error"));
      log(`${label} done: ${runWords(run)}; ${run.pages} pages read; ${secs()}s${dry ? "; nothing made usable" : ""}`);
      return { ...run };
    } finally {
      ownSitesProgress.running = false;
      flight.__merlinOwnSitesFlight = null;
    }
  })();
  return flight.__merlinOwnSitesFlight;
}

let triedAt = 0;

/** The daily job: on its schedule, only with RN_OWNSITES=1. Cheap to call: at most one look every 10 minutes. */
export async function maybeOwnSites(o: { nowMs?: number; run?: RunOpts } = {}): Promise<boolean> {
  const nowMs = o.nowMs ?? Date.now();
  if (!ownSitesEnabled() || flight.__merlinOwnSitesFlight || nowMs - triedAt < 10 * 60_000) return false;
  const s = await loadState();
  if (!isDue(settingOf(s.schedule, "ownsites"), Date.parse(s.ownSitesJob?.lastRun?.startedAt ?? ""), nowMs)) return false;
  triedAt = nowMs;
  void runOwnSites({ limit: DAILY_BATCH, ...o.run, dry: false }).catch((e) => console.error("ownsites scheduled run failed", e instanceof Error ? e.message : "error"));
  return true;
}

/**
 * The start-up dry run (RN_OWNSITES_DRYRUN=N): once per distinct N, in the background. Started by the
 * first job check after the server starts (the scheduler's timer, or the first page load). Returns
 * whether it started. `run` is for tests.
 */
export async function maybeOwnSitesDry(o: { run?: RunOpts; env?: Record<string, string | undefined> } = {}): Promise<boolean> {
  const n = dryRunCount(o.env);
  if (!n || flight.__merlinOwnSitesFlight) return false;
  const s = await loadState();
  if (s.ownSitesJob?.dryDone?.includes(n)) return false;
  if (!(await claimDry(n))) return false;
  void runOwnSites({ ...o.run, dry: true, limit: n, label: `ownsites dry run (RN_OWNSITES_DRYRUN=${n})` }).catch((e) => console.error("ownsites dry run failed", e instanceof Error ? e.message : "error"));
  return true;
}

/** Tests: forget the last look. */
export const resetOwnSitesLook = () => void (triedAt = 0);
