/**
 * Fill each company's About text from its own website, in the background.
 *
 * Every company with a website and no About on file (in the seed or the state) is read once:
 * its homepage (lib/about/fetch.ts, with every safety check there) and a description out of it
 * (lib/about/extract.ts). Four at a time, at most one request per host at a time, with a short
 * pause between a worker's companies. Results are saved in batches (lib/table.ts saveAbout), each
 * company with its status, so a restart carries on where the last run stopped. Skips and failures
 * are tried again after 30 days; a filled text is read again after 90 days and replaced only when
 * the site's text changed. One run at a time per process: a second call joins the first.
 *
 * Started on its schedule (maybeAbout: at most DAILY_LIMIT companies, each day by default), by
 * "Run now" in Pilot metrics (action "aboutNow") and after each weekly scan, all only with
 * RN_ABOUT=1. scripts/about-run.mts runs it once against a data folder.
 */
import { createHash } from "node:crypto";
import { saveAbout, aboutTargets, loadState, type AboutSaved } from "../table";
import { extractAbout } from "./extract";
import { fetchHomepage, type FetchOpts, type Page } from "./fetch";
import { aboutEnabled, aboutProgress, type AboutOutcome, type AboutRunSummary, type AboutTarget } from "./types";
import { isDue, settingOf } from "../schedule";

export const CONCURRENCY = 4;
/** Pause between one worker's companies. */
export const DELAY_MS = 300;
/** Results saved together (one state write each). */
const BATCH = 20;
/** Saved at least this often while a run goes on. */
const SAVE_EVERY_MS = 15_000;

export const hashText = (t: string) => createHash("sha256").update(t).digest("base64url").slice(0, 22);

/** One company: read its homepage and find its About text, or why not. */
export async function aboutOne(t: AboutTarget, opts: FetchOpts = {}, fetchPage: (domain: string, o: FetchOpts) => Promise<Page> = fetchHomepage): Promise<AboutOutcome> {
  let page: Page;
  try {
    page = await fetchPage(t.domain, opts);
  } catch (e) {
    return { companyId: t.companyId, s: "failed", why: e instanceof Error ? e.message.slice(0, 80) : "error" };
  }
  if (!page.ok) return { companyId: t.companyId, s: page.kind, why: page.reason };
  const got = extractAbout(page.html, t.name);
  if (!got.ok) return { companyId: t.companyId, s: "skipped", why: got.reason, host: page.host };
  return { companyId: t.companyId, s: "filled", text: got.text, hash: hashText(got.text), host: page.host };
}

/** At most one request per host at a time: each caller waits for the one before it on that host. */
export function hostGates(): (host: string) => Promise<() => void> {
  const tail = new Map<string, Promise<void>>();
  return async (host: string) => {
    const key = host.toLowerCase();
    const before = tail.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    const chained = before.then(() => mine);
    tail.set(key, chained);
    await before;
    return () => {
      release();
      if (tail.get(key) === chained) tail.delete(key);
    };
  };
}

export interface RunOpts {
  fetch?: FetchOpts;
  /** Read at most this many companies (the CLI's --limit). */
  limit?: number;
  delayMs?: number;
  concurrency?: number;
  /** The run's clock (tests). */
  now?: () => string;
  /** Replaces the homepage read (tests). */
  fetchPage?: (domain: string, o: FetchOpts) => Promise<Page>;
  /** Called after each saved batch. */
  onBatch?: (run: AboutRunSummary) => void;
}

const flight = globalThis as { __merlinAboutFlight?: Promise<AboutRunSummary> | null };

/** Run once over every company that is due. A second call while one runs gets the same run. */
export function runAbout(o: RunOpts = {}): Promise<AboutRunSummary> {
  flight.__merlinAboutFlight ??= (async () => {
    const now = o.now ?? (() => new Date().toISOString());
    const t0 = Date.now();
    const run: AboutRunSummary = { startedAt: now(), endedAt: null, total: 0, done: 0, filled: 0, unchanged: 0, skipped: 0, failed: 0 };
    aboutProgress.running = true;
    aboutProgress.run = run;
    try {
      let targets = await aboutTargets(run.startedAt);
      if (o.limit !== undefined) targets = targets.slice(0, Math.max(0, o.limit));
      run.total = targets.length;
      const gate = hostGates();
      const fetchOpts: FetchOpts = { ...o.fetch, hostGate: o.fetch?.hostGate ?? gate };
      const delay = o.delayMs ?? DELAY_MS;
      let pending: AboutOutcome[] = [];
      let lastSave = Date.now();
      let saving: Promise<void> = Promise.resolve();
      const save = (force: boolean) => {
        if (!pending.length && !force) return saving;
        const batch = pending;
        pending = [];
        lastSave = Date.now();
        saving = saving.then(async () => {
          let saved: AboutSaved[];
          try {
            saved = await saveAbout(batch, { ...run, done: run.done + batch.length }, now());
          } catch (e) {
            console.error("about: saving a batch failed", e);
            saved = batch.map(() => "failed" as const);
          }
          for (const x of saved) {
            run.done++;
            if (x === "filled") run.filled++;
            else if (x === "unchanged") run.unchanged++;
            else if (x === "failed") run.failed++;
            else run.skipped++;
          }
          o.onBatch?.({ ...run });
        });
        return saving;
      };
      let next = 0;
      const worker = async () => {
        while (next < targets.length) {
          const t = targets[next++];
          pending.push(await aboutOne(t, fetchOpts, o.fetchPage));
          if (pending.length >= BATCH || Date.now() - lastSave >= SAVE_EVERY_MS) void save(false);
          if (delay > 0 && next < targets.length) await new Promise((r) => setTimeout(r, delay));
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, Math.min(o.concurrency ?? CONCURRENCY, targets.length || 1)) }, worker));
      await save(false);
      run.endedAt = now();
      await saveAbout([], run, run.endedAt).catch((e) => console.error("about: saving the run failed", e));
      console.log(
        `about: ${run.total} companies, filled ${run.filled}, unchanged ${run.unchanged}, skipped ${run.skipped}, failed ${run.failed}, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      return { ...run };
    } finally {
      aboutProgress.running = false;
      flight.__merlinAboutFlight = null;
    }
  })();
  return flight.__merlinAboutFlight;
}

/* ---------- the scheduled read ---------- */

/** Companies one scheduled run reads at most: the never-read first, then the longest ago (aboutTargets). */
export const DAILY_LIMIT = 500;
let dailyTriedAt = 0;

/**
 * Start a run of at most DAILY_LIMIT companies in the background when the schedule says so
 * (lib/schedule.ts: each UTC day from 09:00 UTC by default): companies with no About yet, and
 * those whose last read is old (aboutTargets: skips and failures after RETRY_DAYS, filled texts
 * after REFRESH_DAYS). Only with RN_ABOUT=1. Called by the scheduler and on page loads, so it
 * stays cheap: at most one look every 10 minutes, nothing while a run goes on. `run` is for tests.
 */
export async function maybeAbout(o: { nowMs?: number; run?: RunOpts } = {}): Promise<boolean> {
  const nowMs = o.nowMs ?? Date.now();
  if (!aboutEnabled() || flight.__merlinAboutFlight || nowMs - dailyTriedAt < 10 * 60_000) return false;
  const s = await loadState();
  if (!isDue(settingOf(s.schedule, "about"), Date.parse(s.about?.lastRun?.startedAt ?? ""), nowMs)) return false;
  dailyTriedAt = nowMs;
  void runAbout({ limit: DAILY_LIMIT, ...o.run }).catch((e) => console.error("about scheduled run failed", e));
  return true;
}
