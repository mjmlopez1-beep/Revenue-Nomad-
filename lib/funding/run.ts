/**
 * The daily funding run (server only): SEC Form D filings matched to companies on Merlin, kept as
 * funding events for Crystal Ball (lib/radar/sources/funding.ts reads them back).
 *
 * When it runs: with RN_FUNDING=1, once a UTC day, on the first page load after FUNDING_HOUR_UTC
 * (maybeFunding, called where the weekly scan's maybeScan and the radar's maybeRadar are), before
 * the radar's morning run at 13:00 UTC. A run that stopped on an error is tried again after 6 hours.
 *
 * What a run does:
 *   1. the filing days of the last FUNDING_LOOKBACK_DAYS not read yet: each day's EDGAR daily form
 *      index (one request), or EDGAR full-text search when the index can't be read. A day with no
 *      index is done when it is a weekend or over 3 days old (a holiday), else tried next run;
 *   2. each Form D's name against the companies on Merlin (lib/funding/match.ts candidateFor):
 *      only a filing whose name is exactly one company's is fetched (its primary_doc.xml), at most
 *      MAX_DOCS_PER_RUN a run;
 *   3. the filing's own facts: a new filing (not a D/A), not a fund, not a merger, something sold,
 *      a first sale within a year, then the place and industry (confirmMatch);
 *   4. one event per company and filing (never twice, nor twice for one first sale), with the
 *      counts for Pilot metrics. Nothing about a person is read or kept.
 * Tests (RN_SCAN_TEST=1) never reach EDGAR: they pass a fetch of their own.
 */
import { loadSeed, loadState, tableInternals as T, type Seed, type State } from "../table";
import { isPlaceholderCompany } from "../scan/clean";
import {
  FUNDING_HOUR_UTC, FUNDING_KEEP_DAYS, FUNDING_LOOKBACK_DAYS, FUNDING_SOURCE, emptyFunding, fundingEnabled, fundingNote,
  type FundingRecord, type FundingRunCounts, type FundingSkip, type FundingState,
} from "./types";
import { aboutAmount, amountBand, dayIndexUrl, eftsUrl, parseEfts, parseFormD, parseFormIndex, primaryDocUrl, roundOf, secFetcher, SecRefused, type FormDListing, type SecFetch } from "./sec";
import { candidateFor, confirmMatch, fundingIndex, type FundingTarget } from "./match";

const DAY = 86_400_000;
/** Filing documents fetched in one run, at most (a few a day is normal: most names match nothing). */
export const MAX_DOCS_PER_RUN = 200;
/** Full-text search pages read for one day, at most (100 a page). */
const MAX_EFTS_PAGES = 10;
/** A first sale longer ago than this before the filing is old news. */
const OLD_SALE_DAYS = 365;
/** Two filings for one company within this many days with one first sale are one raise. */
const SAME_RAISE_DAYS = 120;

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The companies on Merlin as matching reads them: no firm kept for review, no placeholder name. */
export function fundingTargets(seed: Seed, s: State): FundingTarget[] {
  const g = T.graph(seed, s);
  const firms = T.firmsInReview(seed, s);
  const out: FundingTarget[] = [];
  for (const c of g.companies.values()) {
    if (firms.has(c.id) || !c.name || isPlaceholderCompany(c.name)) continue;
    const geo = T.geoOf(c, s);
    out.push({ id: c.id, name: c.name, country: geo.country, region: geo.region, industry: T.live(c, s, "industry") });
  }
  return out;
}

/** The filing days to read now: the last FUNDING_LOOKBACK_DAYS before today, oldest first, minus those done. */
export function dueDays(f: FundingState, nowMs: number, lookback = FUNDING_LOOKBACK_DAYS): string[] {
  const out: string[] = [];
  for (let i = lookback; i >= 1; i--) {
    const d = dayOf(nowMs - i * DAY);
    if (!f.days[d]) out.push(d);
  }
  return out;
}

const weekend = (day: string) => [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());

/** One day's Form D listings: the daily index, else full-text search. `done` false: try the day again next run. */
async function listDay(day: string, fetch: SecFetch, nowMs: number): Promise<{ listings: FormDListing[]; done: boolean; failed: boolean }> {
  const idx = await fetch(dayIndexUrl(day));
  if (idx.status === 200) return { listings: parseFormIndex(idx.text), done: true, failed: false };
  // No index (yet): a weekend or a holiday has none; a recent weekday may not be posted yet.
  if (idx.status === 404) {
    const done = weekend(day) || nowMs - Date.parse(`${day}T12:00:00Z`) > 3 * DAY;
    return { listings: [], done, failed: false };
  }
  // The index couldn't be read: full-text search for the day instead.
  const listings: FormDListing[] = [];
  for (let page = 0; page < MAX_EFTS_PAGES; page++) {
    const r = await fetch(eftsUrl(day, page * 100));
    let body: unknown = null;
    try {
      body = r.status === 200 ? JSON.parse(r.text) : null;
    } catch {
      body = null;
    }
    const parsed = parseEfts(body);
    if (!parsed) return { listings: [], done: false, failed: true };
    listings.push(...parsed.listings);
    if ((page + 1) * 100 >= parsed.total || !parsed.listings.length) break;
  }
  return { listings, done: true, failed: false };
}

export interface FundingRun {
  ran: boolean;
  counts: FundingRunCounts | null;
  events: FundingRecord[];
}

let flight: Promise<FundingRun> | null = null;
let triedAt = 0;

/**
 * One run (see the file's note). `fetch` and `now` are for tests and the dry run; `dryRun` keeps
 * nothing (it returns what it would keep). One at a time: a second call joins the first.
 */
export function runFunding(opts: { fetch?: SecFetch; now?: string; dryRun?: boolean; lookback?: number } = {}): Promise<FundingRun> {
  flight ??= (async () => {
    try {
      return await run(opts);
    } finally {
      flight = null;
    }
  })();
  return flight;
}

async function run(opts: { fetch?: SecFetch; now?: string; dryRun?: boolean; lookback?: number }): Promise<FundingRun> {
  const nowMs = Date.parse(opts.now ?? "") || Date.now();
  const nowIso = new Date(nowMs).toISOString();
  // Tests never reach EDGAR.
  if (!opts.fetch && process.env.RN_SCAN_TEST === "1") return { ran: false, counts: null, events: [] };
  const fetch = opts.fetch ?? secFetcher();
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const f0 = s.funding ?? emptyFunding();
  const idx = fundingIndex(fundingTargets(seed, s));
  const counts: FundingRunCounts = { at: nowIso, days: [], filings: 0, read: 0, matched: 0, unmatched: {}, failed: 0 };
  const skip = (why: FundingSkip) => void (counts.unmatched[why] = (counts.unmatched[why] ?? 0) + 1);
  const events: FundingRecord[] = [];
  const doneDays: string[] = [];
  const known = [...f0.events];
  const seenAcc = new Set(known.map((e) => `${e.companyId}:${e.accession}`));
  let docs = 0;

  try {
    for (const day of dueDays(f0, nowMs, opts.lookback)) {
      const listed = await listDay(day, fetch, nowMs);
      if (listed.failed) counts.failed++;
      if (listed.done) doneDays.push(day);
      if (!listed.listings.length) continue;
      counts.days.push(day);
      // One filing can list several issuers, and full-text search repeats none: one line per issuer and filing.
      const lines = [...new Map(listed.listings.map((l) => [`${l.accession}:${l.cik}`, l])).values()];
      for (const l of lines) {
        counts.filings++;
        if (l.form !== "D") {
          skip("amendment");
          continue;
        }
        const cand = candidateFor(l.name, idx);
        if ("skip" in cand) {
          skip(cand.skip);
          continue;
        }
        const c = cand.company;
        if (seenAcc.has(`${c.id}:${l.accession}`)) {
          skip("duplicate");
          continue;
        }
        if (docs >= MAX_DOCS_PER_RUN) {
          // Past this run's limit: the day is read again next run.
          const i = doneDays.indexOf(day);
          if (i >= 0) doneDays.splice(i, 1);
          break;
        }
        docs++;
        const r = await fetch(primaryDocUrl(l.cik, l.accession));
        const form = r.status === 200 ? parseFormD(r.text) : null;
        if (!form) {
          counts.failed += r.status === 200 ? 0 : 1;
          skip("unreadable");
          continue;
        }
        counts.read++;
        if (form.amendment) {
          skip("amendment");
          continue;
        }
        if (form.isFund) {
          skip("fund");
          continue;
        }
        if (form.combination) {
          skip("business-combination");
          continue;
        }
        const sold = form.sold ?? 0;
        if (!(sold > 0)) {
          skip("no-amount");
          continue;
        }
        if (form.firstSale && Date.parse(`${l.filed}T12:00:00Z`) - Date.parse(`${form.firstSale}T12:00:00Z`) > OLD_SALE_DAYS * DAY) {
          skip("old-sale");
          continue;
        }
        const why = confirmMatch(c, form);
        if (why) {
          skip(why);
          continue;
        }
        // One raise, filed twice (a correction filed as a new D): the same first sale lately.
        const same = known.find((e) => e.companyId === c.id && ((form.firstSale && e.firstSale === form.firstSale) || e.accession === l.accession) && nowMs - Date.parse(e.at) <= SAME_RAISE_DAYS * DAY);
        if (same) {
          skip("duplicate");
          continue;
        }
        const rec: FundingRecord = { companyId: c.id, at: nowIso, filed: l.filed, firstSale: form.firstSale, band: amountBand(sold), about: aboutAmount(sold), round: roundOf(form), source: FUNDING_SOURCE, accession: l.accession };
        events.push(rec);
        known.push(rec);
        seenAcc.add(`${c.id}:${l.accession}`);
        counts.matched++;
      }
    }
  } catch (e) {
    counts.error = e instanceof SecRefused ? e.message : `stopped: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
  }
  if (!counts.error && counts.failed && !doneDays.length && !counts.filings) counts.error = "no filing listing could be read";

  if (!opts.dryRun) {
    await T.mutate((d) => {
      const f = (d.funding ??= emptyFunding());
      f.lastRunAt = nowIso;
      f.lastRunDay = dayOf(nowMs);
      for (const day of doneDays) f.days[day] = nowIso;
      for (const k of Object.keys(f.days)) if (nowMs - Date.parse(`${k}T12:00:00Z`) > 30 * DAY) delete f.days[k];
      const have = new Set(f.events.map((e) => `${e.companyId}:${e.accession}`));
      for (const e of events) if (!have.has(`${e.companyId}:${e.accession}`)) f.events.push(e);
      f.events = f.events.filter((e) => nowMs - Date.parse(e.at) <= FUNDING_KEEP_DAYS * DAY);
      f.last = counts;
      f.totals.filings += counts.filings;
      f.totals.read += counts.read;
      f.totals.matched += counts.matched;
      for (const [k, n] of Object.entries(counts.unmatched)) f.totals.unmatched[k as FundingSkip] = (f.totals.unmatched[k as FundingSkip] ?? 0) + (n ?? 0);
    });
  }
  console.log(
    `funding: ${counts.days.length} filing days, ${counts.filings} Form D filings, ${counts.read} read, ${counts.matched} matched, ` +
      `unmatched ${Object.entries(counts.unmatched).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}, ${counts.failed} failed${counts.error ? `, ${counts.error}` : ""}`,
  );
  return { ran: true, counts, events };
}

/**
 * Start the daily run in the background when it is due: RN_FUNDING=1, after FUNDING_HOUR_UTC,
 * not run yet today (or the last run stopped on an error over 6 hours ago). Called on page loads:
 * at most one try an hour.
 */
export async function maybeFunding(): Promise<void> {
  if (!fundingEnabled() || flight || Date.now() - triedAt < 60 * 60_000) return;
  const now = new Date();
  if (now.getUTCHours() < FUNDING_HOUR_UTC) return;
  const f = (await loadState()).funding;
  const today = now.toISOString().slice(0, 10);
  if (f?.lastRunDay === today && !(f.last?.error && Date.now() - Date.parse(f.lastRunAt ?? "") > 6 * 60 * 60_000)) return;
  triedAt = Date.now();
  void runFunding().catch((e) => console.error("funding run failed", e));
}

/**
 * The events recorded after `sinceMs` and by `nowMs`, at these companies, as the radar's funding
 * source gives them (lib/radar/sources/funding.ts). `amount` is "about $5M", `note` "SEC filing, Nov 2026".
 */
export async function storedFundingEvents(opts: { sinceMs: number; nowMs: number; companies: { id: string }[] }): Promise<{ companyId: string; at: string; round: string | null; amount: string | null; source: string; note: string }[]> {
  const f = (await loadState()).funding;
  if (!f?.events.length) return [];
  const ids = new Set(opts.companies.map((c) => c.id));
  return f.events
    .filter((e) => ids.has(e.companyId) && Date.parse(e.at) > opts.sinceMs && Date.parse(e.at) <= opts.nowMs)
    .map((e) => ({ companyId: e.companyId, at: e.at, round: e.round, amount: e.about, source: e.source, note: fundingNote(e.filed) }));
}
