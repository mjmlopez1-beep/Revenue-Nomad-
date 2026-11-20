/**
 * Who leads each function at a company, read from its own website, in the background.
 *
 * For each company with a website of its own (lib/table.ts leadersTargets): its homepage, then at
 * most PAGE_CAP more pages on the same registrable domain, chosen in this order: a leadership or
 * team page, else an about page (which often links the team page), a press or news page, and the
 * press releases linked from it whose words name an appointment. Pages come from the homepage's
 * links, then sitemap.xml, then a few common paths (/leadership, /team, /about, /about-us,
 * /company, /press, /news). robots.txt is read once per host and every page's own path is
 * checked against it. Every request goes through lib/about/fetch.ts with all its safety checks
 * (public addresses only, redirects checked, 8 seconds, 512 KB, html only, the plain User-Agent).
 *
 * Four companies at a time, one request per host at a time, a 300 ms pause between requests on
 * one company and between a worker's companies. Results are saved in batches (lib/table.ts
 * saveLeaders), each company with its record, so a restart carries on where the last run stopped.
 * A company is read again after 30 days when nothing was found or it failed, after 90 days when
 * leaders are on file. One run at a time per process: a second call joins the first.
 *
 * Off unless RN_LEADERS=1: started by the admin button in Pilot metrics (action "leadersNow", the
 * next 200 companies or all), and once a UTC day in the background (maybeLeaders: DAILY_BATCH
 * companies, Crystal Ball's first). Not part of the weekly scan.
 *
 * A page counts as a team page by its address and words (a leadership or team page), or by what
 * it holds: two or more name-and-title cards (an About page holding the team grid). Crystal Ball
 * says "nobody leads Sales there" only from a team page read in the last KNOWN_DAYS.
 */
import { hostGates } from "../about/run";
import { pageJunk } from "../about/extract";
import { fetchHomepage, fetchPageAt, fetchRobotsTxt, fetchXmlAt, registrable, robotsAllowsPath, startUrl, testAllowance, Refused, type FetchOpts, type Page } from "../about/fetch";
import { claimLeadersDay, leadersTargets, saveLeaders } from "../table";
import { extractLeaders, linkKind, linksOf, nameTokens, normUrl, sitemapLocs, type Candidate, type LinkKind } from "./extract";
import { pickFunctions } from "./pick";
import { DAILY_BATCH, leadersEnabled, leadersProgress, NEXT_BATCH, type LeaderFn, type LeadersOutcome, type LeadersRunSummary, type LeadersTarget } from "./types";

export const CONCURRENCY = 4;
/** Pause between requests on one company, and between a worker's companies. */
export const DELAY_MS = 300;
/** Pages read per company besides the homepage. */
export const PAGE_CAP = 5;
const BATCH = 20;
const SAVE_EVERY_MS = 15_000;

/**
 * Common paths tried when no link or sitemap entry leads to that kind of page, each with its
 * place in the order. They rank below the pages the site links to, so a guess that misses never
 * takes the place of a press release the site names.
 */
const GUESSES: { path: string; kind: Exclude<LinkKind, "release">; p: number }[] = [
  { path: "/leadership", kind: "team", p: 45 },
  { path: "/team", kind: "team", p: 44 },
  { path: "/our-team", kind: "team", p: 43 },
  { path: "/about", kind: "about", p: 35 },
  { path: "/press", kind: "press", p: 33 },
  { path: "/about-us", kind: "about", p: 25 },
  { path: "/news", kind: "press", p: 23 },
  { path: "/company", kind: "about", p: 20 },
];

interface Item {
  url: string;
  kind: LinkKind;
  from: "link" | "sitemap" | "guess";
  /** A guess's place in the order. */
  p?: number;
}

/**
 * What to read next: a team or leadership page; else an about page (it often links the team
 * page); a press release whose words name an appointment; a press page. Once a team page was read,
 * about pages and more guesses wait; once a press page was read, more press pages do. Anything
 * under MIN_PRIORITY is not read at all.
 */
function priority(it: Item, st: { team: boolean; press: boolean }): number {
  if (it.from === "guess") return (it.kind === "team" || it.kind === "about") && st.team ? 0 : it.kind === "press" && st.press ? 0 : it.p ?? 0;
  const base = it.kind === "team" ? (st.team ? 20 : 100) : it.kind === "release" ? 70 : it.kind === "about" ? (st.team ? 5 : 60) : st.press ? 5 : 50;
  return base - (it.from === "sitemap" ? 5 : 0);
}
const MIN_PRIORITY = 15;

export interface OneOpts {
  fetch?: FetchOpts;
  delayMs?: number;
  /** When the read happens (stored as each leader's seenAt). */
  now?: string;
  /** Replaces the homepage read (tests). */
  fetchHome?: (domain: string, o: FetchOpts) => Promise<Page>;
}

/** One company: its homepage and up to PAGE_CAP pages more, and the leaders on them. Never a name. */
export async function leadersOne(t: LeadersTarget, o: OneOpts = {}): Promise<LeadersOutcome> {
  const opts: FetchOpts = { ...o.fetch, allow: o.fetch?.allow ?? testAllowance() };
  const pause = () => (o.delayMs ?? DELAY_MS) > 0 ? new Promise((r) => setTimeout(r, o.delayMs ?? DELAY_MS)) : Promise.resolve();
  const res: LeadersOutcome = { companyId: t.companyId, status: "none", functions: {}, pages: 0, team: false, press: false, robots: 0 };
  let home: Page;
  try {
    home = await (o.fetchHome ?? fetchHomepage)(t.domain, opts);
  } catch (e) {
    return { ...res, status: "failed", why: e instanceof Error ? e.message.slice(0, 80) : "error" };
  }
  if (!home.ok) return { ...res, status: home.kind, why: home.reason, robots: home.reason === "robots.txt disallows" ? 1 : 0 };
  const own = startUrl(t.domain, opts.allow);
  const site = registrable(home.host);
  // A homepage that ends up on another company's site (an acquirer, a parked page) is not this company's.
  if (!own || registrable(own.hostname) !== site) return { ...res, status: "skipped", why: "redirects to another site" };
  // A parked domain, a bot wall or a login page holds no leaders (lib/about/extract.ts pageJunk).
  const junk = pageJunk(home.html);
  if (junk) return { ...res, status: "skipped", why: junk };
  const sameSite = (u: URL) => registrable(u.hostname) === site && (u.protocol === "http:" || u.protocol === "https:");

  // robots.txt once per host, each page's own path checked against it.
  const robots = new Map<string, Promise<string | null>>();
  const robotsCheck = async (u: URL) => {
    const key = `${u.protocol}//${u.host}`;
    let p = robots.get(key);
    if (!p) robots.set(key, (p = fetchRobotsTxt(new URL(key), opts)));
    const txt = await p;
    return !txt || robotsAllowsPath(txt, `${u.pathname}${u.search}`);
  };
  const pageOpts: FetchOpts = { ...opts, robotsCheck };

  // Names seen on the pages, only to keep them out of the addresses stored (a press release's address often spells one).
  const names = new Set<string>();
  // Two or more name-and-title cards on one page make it a team page, whatever its address says (an About page holding the team grid).
  const TEAM_CARDS = 2;
  const homeCards = { cards: 0 };
  const cands: Candidate[] = [...extractLeaders(home.html, home.url, false, names, homeCards)];
  if (homeCards.cards >= TEAM_CARDS) res.team = true;
  /** Each page found, by the page it was found on. */
  const via = new Map<string, string>();
  const seen = new Set<string>([normUrl(new URL(home.url))]);
  const queue: Item[] = [];
  const push = (url: string, kind: LinkKind, from: Item["from"], p?: number, on = home.url) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return;
    }
    if (!sameSite(u)) return;
    const key = normUrl(u);
    if (seen.has(key)) return;
    seen.add(key);
    via.set(key, on);
    queue.push({ url: u.href, kind, from, ...(p !== undefined ? { p } : {}) });
  };
  for (const l of linksOf(home.html, home.url, sameSite)) push(l.url, l.kind, "link");

  try {
    // No team page linked from the homepage: the sitemap may list one (it is not a page read).
    if (!queue.some((q) => q.kind === "team")) {
      const sm = await fetchXmlAt(new URL("/sitemap.xml", home.url).href, pageOpts);
      if (!sm.ok && sm.reason === "robots.txt disallows") res.robots++;
      if (sm.ok)
        for (const loc of sitemapLocs(sm.body)) {
          let u: URL;
          try {
            u = new URL(loc, home.url);
          } catch {
            continue;
          }
          const kind = linkKind(u, "");
          if (kind) push(u.href, kind, "sitemap");
          if (queue.length > 60) break;
        }
      await pause();
    }
    const linked = new Set(queue.map((q) => q.kind));
    for (const g of GUESSES) if (!linked.has(g.kind)) push(new URL(g.path, home.url).href, g.kind, "guess", g.p);

    let budget = PAGE_CAP;
    const st = { team: res.team, press: false };
    while (budget > 0 && queue.length) {
      queue.sort((a, b) => priority(b, st) - priority(a, st));
      if (priority(queue[0], st) < MIN_PRIORITY) break;
      const it = queue.shift()!;
      const page = await fetchPageAt(it.url, pageOpts);
      if (!page.ok && page.reason === "robots.txt disallows") {
        // Nothing was requested: it costs no page.
        res.robots++;
        continue;
      }
      budget--;
      await pause();
      if (!page.ok) continue;
      // A page that redirected off the company's own site is not read.
      if (!sameSite(new URL(page.url))) continue;
      res.pages++;
      if (it.kind === "team") st.team = res.team = true;
      if (it.kind === "press" || it.kind === "release") st.press = res.press = true;
      if (normUrl(new URL(page.url)) !== normUrl(new URL(it.url))) via.set(normUrl(new URL(page.url)), via.get(normUrl(new URL(it.url))) ?? home.url);
      const cards = { cards: 0 };
      cands.push(...extractLeaders(page.html, page.url, it.kind === "release", names, cards));
      if (cards.cards >= TEAM_CARDS && it.kind !== "release") st.team = res.team = true;
      for (const l of linksOf(page.html, page.url, sameSite)) push(l.url, l.kind, "link", undefined, page.url);
    }
  } catch (e) {
    if (e instanceof Refused) return { ...res, status: "skipped", why: e.message };
    return { ...res, status: "failed", why: e instanceof Error ? e.message.slice(0, 80) : "error" };
  }
  // An address that spells a name is never kept: the page that linked to it is (a press index, the homepage).
  const spellsName = (u: string) => {
    let path = new URL(u).pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      /* as it is */
    }
    return nameTokens(path.replace(/[-_/.+]+/g, " ")).some((w) => names.has(w));
  };
  const safeUrl = (u: string) => {
    let cur = u;
    for (let k = 0; k < 8 && spellsName(cur); k++) cur = via.get(normUrl(new URL(cur))) ?? new URL("/", home.url).href;
    return spellsName(cur) ? new URL("/", home.url).href : cur;
  };
  res.functions = pickFunctions(
    cands.map((c) => ({ ...c, url: safeUrl(c.url) })),
    o.now ?? new Date().toISOString(),
  );
  res.status = Object.keys(res.functions).length ? "found" : "none";
  if (res.status === "none") res.why = "no leaders found";
  return res;
}

export interface RunOpts {
  fetch?: FetchOpts;
  /** "next": the next NEXT_BATCH companies (the default), "all": every company due. */
  scope?: "next" | "all";
  /** Read at most this many (overrides the scope's count; tests). */
  limit?: number;
  delayMs?: number;
  concurrency?: number;
  now?: () => string;
  fetchHome?: (domain: string, o: FetchOpts) => Promise<Page>;
  onBatch?: (run: LeadersRunSummary) => void;
}

const flight = globalThis as { __merlinLeadersFlight?: Promise<LeadersRunSummary> | null };

const kindCounts = (fns: Record<string, LeaderFn>) => {
  const all = Object.values(fns);
  return { functions: all.length, fractional: all.filter((l) => l.kind === "fractional" || l.kind === "interim").length, fullTime: all.filter((l) => l.kind === "full-time").length };
};

/* ---------- the daily background read ---------- */

/** The daily read starts on the first page load after this hour (UTC), apart from the radar's 13:00. */
export const DAILY_HOUR_UTC = 6;
let dailyTriedAt = 0;

/**
 * Read DAILY_BATCH companies a UTC day in the background, the most useful first (lib/table.ts
 * leadersTargets: a company on a member's Crystal Ball, one members said has a full-time leader,
 * one in a member's Ideal Fractional Profile, then the rest, never read before ahead of read
 * longest ago), each re-read after REFRESH_DAYS. The same polite reading as the admin's run
 * (four at a time, one request per host, the pauses, robots.txt, every fetch check). Called on
 * page loads, so it stays cheap: at most one look every 10 minutes. Only with RN_LEADERS=1;
 * RN_LEADERS_DAILY=0 keeps the admin button and turns the schedule off.
 */
export async function maybeLeaders(nowMs = Date.now()): Promise<boolean> {
  if (!leadersEnabled() || process.env.RN_LEADERS_DAILY === "0" || flight.__merlinLeadersFlight || nowMs - dailyTriedAt < 10 * 60_000) return false;
  const now = new Date(nowMs);
  if (now.getUTCHours() < DAILY_HOUR_UTC) return false;
  dailyTriedAt = nowMs;
  if (!(await claimLeadersDay(now.toISOString()))) return false;
  void runLeaders({ scope: "next", limit: DAILY_BATCH }).catch((e) => console.error("leaders daily run failed", e));
  return true;
}

/** Run once over the companies that are due. A second call while one runs gets the same run. */
export function runLeaders(o: RunOpts = {}): Promise<LeadersRunSummary> {
  flight.__merlinLeadersFlight ??= (async () => {
    const now = o.now ?? (() => new Date().toISOString());
    const t0 = Date.now();
    const scope = o.scope ?? "next";
    const run: LeadersRunSummary = { startedAt: now(), endedAt: null, scope, total: 0, done: 0, read: 0, found: 0, none: 0, skipped: 0, failed: 0, robots: 0, pages: 0, team: 0, press: 0, functions: 0, fractional: 0, fullTime: 0 };
    leadersProgress.running = true;
    leadersProgress.run = run;
    try {
      let targets = await leadersTargets(run.startedAt);
      const cap = o.limit ?? (scope === "next" ? NEXT_BATCH : undefined);
      if (cap !== undefined) targets = targets.slice(0, Math.max(0, cap));
      run.total = targets.length;
      const gate = hostGates();
      const fetchOpts: FetchOpts = { ...o.fetch, hostGate: o.fetch?.hostGate ?? gate };
      const delay = o.delayMs ?? DELAY_MS;
      let pending: LeadersOutcome[] = [];
      let lastSave = Date.now();
      let saving: Promise<void> = Promise.resolve();
      const save = () => {
        if (!pending.length) return saving;
        const batch = pending;
        pending = [];
        lastSave = Date.now();
        saving = saving.then(async () => {
          let saved: LeadersOutcome[] = batch;
          try {
            // The run's counts are only moved on once a batch is stored.
            await saveLeaders(batch, null, now());
          } catch (e) {
            console.error("leaders: saving a batch failed", e);
            saved = batch.map((x) => ({ ...x, status: "failed" as const, functions: {} }));
          }
          for (const x of saved) {
            run.done++;
            run[x.status]++;
            if (x.status === "found" || x.status === "none") run.read++;
            run.robots += x.robots && x.why === "robots.txt disallows" ? 1 : 0;
            run.pages += x.pages;
            run.team += x.team ? 1 : 0;
            run.press += x.press ? 1 : 0;
            const k = kindCounts(x.functions);
            run.functions += k.functions;
            run.fractional += k.fractional;
            run.fullTime += k.fullTime;
          }
          await saveLeaders([], run, now()).catch((e) => console.error("leaders: saving the run failed", e));
          o.onBatch?.({ ...run });
        });
        return saving;
      };
      let next = 0;
      const worker = async () => {
        while (next < targets.length) {
          const t = targets[next++];
          pending.push(await leadersOne(t, { fetch: fetchOpts, delayMs: delay, now: now(), fetchHome: o.fetchHome }));
          if (pending.length >= BATCH || Date.now() - lastSave >= SAVE_EVERY_MS) void save();
          if (delay > 0 && next < targets.length) await new Promise((r) => setTimeout(r, delay));
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, Math.min(o.concurrency ?? CONCURRENCY, targets.length || 1)) }, worker));
      await save();
      await saving;
      run.endedAt = now();
      await saveLeaders([], run, run.endedAt).catch((e) => console.error("leaders: saving the run failed", e));
      console.log(
        `leaders: ${run.total} companies, read ${run.read}, found ${run.found}, ${run.functions} functions (${run.fractional} fractional or interim, ${run.fullTime} full-time), skipped ${run.skipped}, failed ${run.failed}, ${run.pages} pages, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      return { ...run };
    } finally {
      leadersProgress.running = false;
      flight.__merlinLeadersFlight = null;
    }
  })();
  return flight.__merlinLeadersFlight;
}
