/**
 * Find the websites of companies that have none, in the background (lib/websites).
 *
 * A run reads at most RUN_LIMIT companies (websiteTargets: those members added lately first, then
 * the rest never tried, then those due again), four at a time, at most one request per host at a
 * time, with a short pause between a worker's companies. Each company: find.ts. Results are saved
 * in batches (store.ts saveWebsites), each company with its status, so a restart carries on where
 * the last run stopped. A company with nothing found is tried again after 60 days. One run at a
 * time per process: a second call joins the first.
 *
 * A dry run reads and checks the same way and writes nothing: its counts and finds stay in this
 * process (websitesProgress.dry) for the admin's card, and the next real run reads the same companies.
 *
 * Started on its schedule (maybeWebsites, each day at 03:00 UTC by default, only with
 * RN_WEBSITES=1), by "Run now" in Automatic jobs (RN_WEBSITES=1), and by "Dry run" there (always).
 * The log line and the card say "300 read, 190 found (140 high, 50 medium), 0 failed".
 */
import { hostGates } from "../about/run";
import { isDue, settingOf } from "../schedule";
import { loadState } from "../table";
import { findWebsite, type FindOpts } from "./find";
import { saveWebsites, takenSites, websiteTargets, type WebsiteSaved } from "./store";
import { RUN_LIMIT, runWords, websitesEnabled, websitesProgress, type DryFind, type WebsiteOutcome, type WebsitesRunSummary } from "./types";

export const CONCURRENCY = 4;
/** Pause between one worker's companies. */
export const DELAY_MS = 500;
const BATCH = 20;
const SAVE_EVERY_MS = 15_000;
/** Finds a dry run keeps for the admin's list. */
const DRY_KEEP = 300;

export interface RunOpts {
  dry?: boolean;
  limit?: number;
  concurrency?: number;
  delayMs?: number;
  find?: FindOpts;
  now?: () => string;
  onBatch?: (run: WebsitesRunSummary) => void;
}

const flight = globalThis as { __merlinWebsitesFlight?: Promise<WebsitesRunSummary> | null };
export const websitesRunning = () => websitesProgress.running;

const count = (run: WebsitesRunSummary, x: WebsiteSaved) => {
  run.done++;
  if (x === "high" || x === "medium") {
    run.found++;
    run[x]++;
  } else run[x]++;
};

/** One run. A second call while one runs gets the same run (whichever kind it is). */
export function runWebsites(o: RunOpts = {}): Promise<WebsitesRunSummary> {
  flight.__merlinWebsitesFlight ??= (async () => {
    const now = o.now ?? (() => new Date().toISOString());
    const dry = !!o.dry;
    const t0 = Date.now();
    const run: WebsitesRunSummary = { startedAt: now(), endedAt: null, dry, total: 0, done: 0, found: 0, high: 0, medium: 0, none: 0, failed: 0, kept: 0, lookups: 0, pages: 0 };
    const finds: DryFind[] = [];
    websitesProgress.running = true;
    websitesProgress.run = run;
    try {
      const targets = (await websiteTargets(run.startedAt)).slice(0, Math.max(0, o.limit ?? RUN_LIMIT));
      run.total = targets.length;
      const names = new Map(targets.map((t) => [t.companyId, t.name]));
      const taken = await takenSites();
      const find: FindOpts = { ...o.find, taken, fetch: { ...o.find?.fetch, hostGate: o.find?.fetch?.hostGate ?? hostGates() } };
      const delay = o.delayMs ?? DELAY_MS;
      let pending: WebsiteOutcome[] = [];
      let lastSave = Date.now();
      let saving: Promise<void> = Promise.resolve();
      const save = () => {
        if (!pending.length) return saving;
        const batch = pending;
        pending = [];
        lastSave = Date.now();
        saving = saving.then(async () => {
          let saved: WebsiteSaved[];
          if (dry) {
            saved = batch.map((x) => (x.s === "found" ? x.confidence! : x.s));
            for (const x of batch) if (x.s === "found" && finds.length < DRY_KEEP) finds.push({ companyId: x.companyId, name: names.get(x.companyId) ?? "", domain: x.domain!, confidence: x.confidence! });
          } else {
            try {
              saved = await saveWebsites(batch, { ...run, done: run.done + batch.length }, now());
            } catch (e) {
              console.error("websites: saving a batch failed", e);
              saved = batch.map(() => "failed" as const);
            }
          }
          for (const x of saved) count(run, x);
          o.onBatch?.({ ...run });
        });
        return saving;
      };
      let next = 0;
      const worker = async () => {
        while (next < targets.length) {
          const t = targets[next++];
          const out = await findWebsite(t, find);
          run.lookups += out.tried;
          run.pages += out.read;
          // A dry run doesn't write, so it keeps its own finds off the next company's list here.
          if (out.s === "found" && out.domain) taken.add(out.domain);
          pending.push(out);
          if (pending.length >= BATCH || Date.now() - lastSave >= SAVE_EVERY_MS) void save();
          if (delay > 0 && next < targets.length) await new Promise((r) => setTimeout(r, delay));
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, Math.min(o.concurrency ?? CONCURRENCY, targets.length || 1)) }, worker));
      await save();
      run.endedAt = now();
      if (dry) websitesProgress.dry = { run: { ...run }, finds };
      else await saveWebsites([], run, run.endedAt).catch((e) => console.error("websites: saving the run failed", e));
      console.log(`websites${dry ? " (dry run, nothing written)" : ""}: ${runWords(run)}; ${run.lookups} domains looked up, ${run.pages} homepages read, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      return { ...run };
    } finally {
      websitesProgress.running = false;
      flight.__merlinWebsitesFlight = null;
    }
  })();
  return flight.__merlinWebsitesFlight;
}

let triedAt = 0;

/**
 * Start a run in the background when the schedule says so (lib/schedule.ts: each day at 03:00 UTC
 * by default). Only with RN_WEBSITES=1. Called by the scheduler and on page loads, so it stays
 * cheap: at most one look every 10 minutes, nothing while a run goes on. `run` is for tests.
 */
export async function maybeWebsites(o: { nowMs?: number; run?: RunOpts } = {}): Promise<boolean> {
  const nowMs = o.nowMs ?? Date.now();
  if (!websitesEnabled() || flight.__merlinWebsitesFlight || nowMs - triedAt < 10 * 60_000) return false;
  const s = await loadState();
  if (!isDue(settingOf(s.schedule, "websites"), Date.parse(s.websites?.lastRun?.startedAt ?? ""), nowMs)) return false;
  triedAt = nowMs;
  void runWebsites({ ...o.run, dry: false }).catch((e) => console.error("websites scheduled run failed", e));
  return true;
}

/** Tests: forget the last look, so the next due check reads the state again. */
export const resetWebsitesLook = () => void (triedAt = 0);
