/**
 * Career pages of companies already on Merlin, read from the public job feeds of the applicant
 * tracking systems they post on: Greenhouse, Lever, Ashby, Workable and SmartRecruiters.
 *
 * Discovery finds which feed a company posts on, a few companies a run (DISCOVER_PER_RUN), and the
 * scan keeps what it found, and what it didn't, in its state (lib/table.ts), so the work is spread
 * across runs and a company with no feed is tried again at most once a month (RETRY_MISS_DAYS):
 *  1. its own home page, and its careers page when the home page links one: a link to a board on
 *     one of the five systems names the board. Found this way, the board is the company's.
 *  2. else the board names a company would pick: its domain's name ("acme" for acme.com) and its
 *     squeezed name ("acmerobotics"). A guessed board counts only when the feed shows it is this
 *     company's: the board's own name matches (Greenhouse, Workable, SmartRecruiters), or a
 *     posting names the company or its domain (Lever, Ashby, which give no board name).
 *
 * Each feed's postings go through the scan's usual screen (lib/scan/collect.ts): fractional or
 * interim work, GTM at any level or Director and above outside GTM, posted in the last 60 days.
 * One source per system, so a system that is down is reported with its error and the others go on.
 * A feed that fails is skipped; a feed that answers 404 is reported back, so the company is
 * looked up again later. Nothing here is run by the tests: they pass a fetch of their own.
 */
import { fetchWithTimeout } from "../../crawler/fetch";
import { cleanCompany, plain, squeeze } from "../clean";
import type { ScanRawJob, ScanSource } from "../collect";

export type AtsKind = "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters";
export const ATS_KINDS: AtsKind[] = ["greenhouse", "lever", "ashby", "workable", "smartrecruiters"];

export interface AtsBoard {
  ats: AtsKind;
  slug: string;
}
/** What discovery knows about one company, keyed by its website domain. */
export interface AtsEntry {
  board?: AtsBoard;
  /** When discovery last looked (found or not). */
  at: string;
  /** How the board was found: a link on the company's site, or a guessed name the feed confirmed. */
  via?: "site" | "guess";
}
export type AtsCache = Record<string, AtsEntry>;
export interface AtsCompany {
  name: string;
  /** Website domain, "acme.com". */
  domain: string;
}

/** A GET that never throws: the status (0 on a network error or timeout) and the body. */
export type FeedFetch = (url: string) => Promise<{ status: number; text: string }>;

/** Companies looked up for the first time (or again) in one run. */
export const DISCOVER_PER_RUN = 30;
/** A company with no feed found is looked up again after this long. */
export const RETRY_MISS_DAYS = 30;
/** Feeds read in one run, at most. */
export const FEEDS_PER_RUN = 400;
const CONCURRENCY = 4;
const TIMEOUT_MS = 8_000;
/** Discovery stops starting new companies after this long in one run; the rest wait for the next. */
export const DISCOVER_BUDGET_MS = 90_000;
/** A page or feed larger than this is cut there (a home page, or a feed of thousands of jobs). */
const MAX_BYTES = 3_000_000;
const UA = "Mozilla/5.0 (compatible; JobFeedReader/1.0)";
const DAY = 86_400_000;

/** The real fetch: a generic User-Agent, an 8 second limit, redirects followed, never a throw. */
export const fetchFeed: FeedFetch = async (url) => {
  try {
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA, Accept: "application/json, text/html;q=0.9, */*;q=0.5" } }, TIMEOUT_MS);
    const text = (await res.text()).slice(0, MAX_BYTES);
    return { status: res.status, text };
  } catch {
    return { status: 0, text: "" };
  }
};

/** Run `work` on each item, at most `n` at a time. Past `until` (a time), no new item starts: its result stays undefined. */
export async function pool<T, R>(items: T[], n: number, work: (x: T) => Promise<R>, until = Infinity): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length && Date.now() < until) {
        const i = next++;
        out[i] = await work(items[i]);
      }
    })
  );
  return out;
}

const json = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/* ---------- boards from links ---------- */

const SLUG = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const RESERVED = new Set(["embed", "api", "v1", "jobs", "job", "careers", "search", "static", "assets", "j", "widget", "accounts", "en", "about", "privacy", "terms"]);

/** The board a link points at, on one of the five systems, or null. "https://jobs.lever.co/acme/123" -> lever "acme". */
export function boardFromUrl(raw: string): AtsBoard | null {
  let u: URL;
  try {
    u = new URL(String(raw).trim().replace(/^\/\//, "https://"));
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split("/").filter(Boolean);
  const pick = (ats: AtsKind, s: string | undefined | null): AtsBoard | null => {
    const slug = decodeURIComponent(String(s ?? "")).trim();
    return slug && SLUG.test(slug) && !RESERVED.has(slug.toLowerCase()) ? { ats, slug: slug.toLowerCase() } : null;
  };
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    if (host.startsWith("boards-api.")) return seg[0] === "v1" && seg[1] === "boards" ? pick("greenhouse", seg[2]) : null;
    if (seg[0] === "embed") return pick("greenhouse", u.searchParams.get("for"));
    return pick("greenhouse", seg[0]);
  }
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") return pick("lever", seg[0]);
  if (host === "api.lever.co") return seg[0] === "v0" && seg[1] === "postings" ? pick("lever", seg[2]) : null;
  if (host === "jobs.ashbyhq.com") return pick("ashby", seg[0]);
  if (host === "api.ashbyhq.com") return seg[0] === "posting-api" && seg[1] === "job-board" ? pick("ashby", seg[2]) : null;
  if (host === "apply.workable.com") return seg[0] === "api" ? (seg[3] === "accounts" ? pick("workable", seg[4]) : null) : pick("workable", seg[0]);
  if (/^[a-z0-9-]+\.workable\.com$/.test(host) && !["www", "apply", "jobs", "resources", "help"].includes(host.split(".")[0])) return pick("workable", host.split(".")[0]);
  if (host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") return pick("smartrecruiters", seg[0]);
  if (host === "api.smartrecruiters.com") return seg[0] === "v1" && seg[1] === "companies" ? pick("smartrecruiters", seg[2]) : null;
  return null;
}

/** Boards linked from a page, most-linked first. */
export function boardsInPage(html: string): AtsBoard[] {
  const count = new Map<string, { b: AtsBoard; n: number }>();
  for (const m of String(html).matchAll(/(?:href|src|data-url)\s*=\s*["']([^"'\s<>]+)["']/gi)) {
    const b = boardFromUrl(m[1].replace(/&amp;/g, "&"));
    if (!b) continue;
    const k = `${b.ats}:${b.slug}`;
    count.set(k, { b, n: (count.get(k)?.n ?? 0) + 1 });
  }
  return [...count.values()].sort((x, y) => y.n - x.n).map((x) => x.b);
}

/** The company's own careers page, when its home page links one on the same site. */
export function careersLink(html: string, domain: string): string | null {
  for (const m of String(html).matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'\s<>]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const href = m[1].replace(/&amp;/g, "&");
    const text = plain(m[2]).toLowerCase();
    if (!/\b(?:careers?|jobs|join us|join our team|we'?re hiring|open roles|work with us)\b/.test(`${text} ${href.toLowerCase()}`)) continue;
    let u: URL;
    try {
      u = new URL(href, `https://${domain}/`);
    } catch {
      continue;
    }
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if ((host === domain || host.endsWith("." + domain)) && /^https?:$/.test(u.protocol) && u.pathname.length > 1) return u.toString();
  }
  return null;
}

/* ---------- guessed boards ---------- */

/** "Acme Robotics, Inc." at acme.com -> ["acme", "acmerobotics", "acme-robotics"]: the board names a company would pick. At most 3. */
export function slugCandidates(c: AtsCompany): string[] {
  const label = c.domain.toLowerCase().replace(/^www\./, "").split(".")[0];
  const name = cleanCompany(c.name).replace(/^the\s+/i, "");
  const squeezed = squeeze(name);
  const hyphen = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return [...new Set([label, squeezed, hyphen])].filter((s) => s.length >= 2 && SLUG.test(s)).slice(0, 3);
}

/** Names of one company match: squeezed, with a trailing Inc, Labs, HQ and the like set aside, or the domain's name. */
function nameMatches(boardName: unknown, c: AtsCompany): boolean {
  const core = (s: string) => squeeze(cleanCompany(s).replace(/^the\s+/i, "").replace(/\s+(?:labs?|technolog(?:y|ies)|software|hq|app|ai|io|co|company|group)$/i, ""));
  const b = core(String(boardName ?? ""));
  if (b.length < 2) return false;
  const label = squeeze(c.domain.split(".")[0]);
  return b === core(c.name) || b === squeeze(c.name) || b === label;
}

/** A posting's text names the company or its domain. */
const mentions = (text: string, c: AtsCompany) => {
  const t = text.toLowerCase();
  const name = cleanCompany(c.name).toLowerCase();
  return (name.length >= 3 && t.includes(name)) || t.includes(c.domain.toLowerCase());
};

/* ---------- the feeds ---------- */

export function feedUrl(b: AtsBoard): string {
  const s = encodeURIComponent(b.slug);
  switch (b.ats) {
    case "greenhouse":
      return `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`;
    case "lever":
      return `https://api.lever.co/v0/postings/${s}?mode=json`;
    case "ashby":
      return `https://api.ashbyhq.com/posting-api/job-board/${s}`;
    case "workable":
      return `https://apply.workable.com/api/v1/widget/accounts/${s}?details=true`;
    case "smartrecruiters":
      return `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=100`;
  }
}

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string => (typeof x === "string" ? x : typeof x === "number" ? String(x) : "");
const date = (x: unknown): string | undefined => {
  const t = typeof x === "number" ? x : Date.parse(str(x));
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : undefined;
};
/** Greenhouse sends its HTML escaped ("&lt;p&gt;"). */
const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** The board's own name, where the feed gives one (Greenhouse's board, Workable's account, SmartRecruiters' company). */
export function boardName(b: AtsBoard, body: unknown): string | null {
  const o = obj(body);
  if (b.ats === "workable") return str(o.name) || null;
  if (b.ats === "smartrecruiters") return str(obj(obj(arr(o.content)[0]).company).name) || null;
  return null;
}

/**
 * One feed's postings as raw jobs for the screen, filed under the Merlin company (its name and
 * website), whatever the board calls itself. Null when the body is not that system's feed.
 */
export function parseFeed(b: AtsBoard, body: unknown, c: AtsCompany): ScanRawJob[] | null {
  const o = obj(body);
  const source = `careers:${b.ats}`;
  const base = { company: c.name, companyUrl: `https://${c.domain}`, source, kind: "listing" as const };
  const out: ScanRawJob[] = [];
  const push = (j: Partial<ScanRawJob> & { title: string; url: string }) => {
    if (!j.title.trim() || !/^https?:\/\//i.test(j.url)) return;
    out.push({ location: "Unspecified", ...base, ...j } as ScanRawJob);
  };
  switch (b.ats) {
    case "greenhouse": {
      if (!Array.isArray(o.jobs)) return null;
      for (const j of o.jobs.map(obj))
        push({ title: str(j.title), url: str(j.absolute_url), postedAt: date(j.first_published) ?? date(j.updated_at), description: unescape(str(j.content)), location: str(obj(j.location).name) || "Unspecified" });
      return out;
    }
    case "lever": {
      if (!Array.isArray(body)) return null;
      for (const j of body.map(obj)) {
        const cat = obj(j.categories);
        const lists = arr(j.lists).map((l) => `${str(obj(l).text)} ${str(obj(l).content)}`).join(" ");
        push({
          title: str(j.text),
          url: str(j.hostedUrl),
          postedAt: date(j.createdAt),
          description: [str(j.descriptionPlain) || str(j.description), lists, str(j.additionalPlain) || str(j.additional), str(cat.commitment)].filter(Boolean).join(" "),
          location: str(cat.location) || "Unspecified",
          functionHint: str(cat.team) || str(cat.department) || undefined,
        });
      }
      return out;
    }
    case "ashby": {
      if (!Array.isArray(o.jobs)) return null;
      for (const j of o.jobs.map(obj)) {
        if (j.isListed === false) continue;
        push({
          title: str(j.title),
          url: str(j.jobUrl),
          postedAt: date(j.publishedAt),
          description: str(j.descriptionPlain) || str(j.descriptionHtml),
          location: str(j.location) || "Unspecified",
          functionHint: str(j.department) || str(j.team) || undefined,
        });
      }
      return out;
    }
    case "workable": {
      if (!Array.isArray(o.jobs)) return null;
      for (const j of o.jobs.map(obj))
        push({
          title: str(j.title),
          url: str(j.url) || str(j.shortlink) || str(j.application_url),
          postedAt: date(j.published_on) ?? date(j.created_at),
          description: [str(j.description), str(j.employment_type)].filter(Boolean).join(" "),
          location: [str(j.city), str(j.state), str(j.country)].filter(Boolean).join(", ") || (j.telecommuting ? "Remote" : "Unspecified"),
          functionHint: str(j.function) || str(j.department) || undefined,
        });
      return out;
    }
    case "smartrecruiters": {
      if (!Array.isArray(o.content)) return null;
      for (const j of o.content.map(obj)) {
        const id = str(j.id);
        const company = str(obj(j.company).identifier) || b.slug;
        const loc = obj(j.location);
        push({
          title: str(j.name),
          url: id ? `https://jobs.smartrecruiters.com/${encodeURIComponent(company)}/${encodeURIComponent(id)}` : "",
          postedAt: date(j.releasedDate),
          description: [str(obj(j.typeOfEmployment).label), str(obj(j.experienceLevel).label)].filter(Boolean).join(". "),
          location: [str(loc.city), str(loc.region), str(loc.country)].filter(Boolean).join(", ") || "Unspecified",
          functionHint: str(obj(j.function).label) || str(obj(j.department).label) || undefined,
        });
      }
      return out;
    }
  }
}

/* ---------- discovery ---------- */

/** Whether a guessed board's feed shows it is this company's (see the file's note). */
async function confirmGuess(b: AtsBoard, c: AtsCompany, fetch: FeedFetch): Promise<boolean> {
  if (b.ats === "greenhouse") {
    const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.slug)}`);
    if (r.status !== 200) return false;
    return nameMatches(obj(json(r.text)).name, c);
  }
  const r = await fetch(feedUrl(b));
  if (r.status !== 200) return false;
  const body = json(r.text);
  const name = boardName(b, body);
  if (name !== null) return nameMatches(name, c);
  const jobs = parseFeed(b, body, c) ?? [];
  return jobs.some((j) => mentions(`${j.description ?? ""} ${j.url}`, c));
}

/** The feed answers as that system's feed (any number of postings). */
async function feedAnswers(b: AtsBoard, c: AtsCompany, fetch: FeedFetch): Promise<boolean> {
  const r = await fetch(feedUrl(b));
  return r.status === 200 && parseFeed(b, json(r.text), c) !== null;
}

/**
 * A page on the company's own site, read under lib/about/fetch.ts's rules (robots.txt, public
 * addresses only, 8 seconds, 512 KB). `null` for the home page.
 */
export const fetchSite: SiteFetch = async (domain, address) => {
  const about = await import("../../about/fetch");
  const page = address ? await about.fetchPageAt(address) : await about.fetchHomepage(domain);
  return page.ok ? { status: 200, text: page.html } : { status: 0, text: "" };
};
export type SiteFetch = (domain: string, address: string | null) => Promise<{ status: number; text: string }>;

/** Look one company up: its site's links first, then guessed board names. Null when none is found. */
export async function discoverOne(c: AtsCompany, fetch: FeedFetch, site: SiteFetch = fetchSite): Promise<{ board: AtsBoard; via: "site" | "guess" } | null> {
  const domain = c.domain.toLowerCase().replace(/^www\./, "");
  const home = await site(domain, null);
  let linked = home.status === 200 ? boardsInPage(home.text) : [];
  if (!linked.length && home.status === 200) {
    const careers = careersLink(home.text, domain);
    if (careers) {
      const page = await site(domain, careers);
      if (page.status === 200) linked = boardsInPage(page.text);
    }
  }
  for (const b of linked.slice(0, 2)) if (await feedAnswers(b, c, fetch)) return { board: b, via: "site" };
  for (const slug of slugCandidates(c).slice(0, 2))
    for (const ats of ATS_KINDS) {
      const b = { ats, slug };
      if (await confirmGuess(b, c, fetch)) return { board: b, via: "guess" };
    }
  return null;
}

/**
 * The companies to look up this run: never looked up first, then those whose last miss is over
 * RETRY_MISS_DAYS old, in the order given (the caller puts the likeliest hirers first), at most `max`.
 */
export function dueForDiscovery(companies: AtsCompany[], cache: AtsCache, now: number, max = DISCOVER_PER_RUN): AtsCompany[] {
  const fresh: AtsCompany[] = [];
  const retry: AtsCompany[] = [];
  const seen = new Set<string>();
  for (const c of companies) {
    const d = c.domain.toLowerCase();
    if (seen.has(d)) continue;
    seen.add(d);
    const e = cache[d];
    if (!e) fresh.push(c);
    else if (!e.board && now - Date.parse(e.at) >= RETRY_MISS_DAYS * DAY) retry.push(c);
  }
  return [...fresh, ...retry].slice(0, max);
}

/** Look up the due companies, CONCURRENCY at a time. Returns the cache entries to write (found or not). */
export async function discover(companies: AtsCompany[], cache: AtsCache, opts: { fetch?: FeedFetch; site?: SiteFetch; now?: number; max?: number; budgetMs?: number } = {}): Promise<AtsCache> {
  const now = opts.now ?? Date.now();
  const fetch = opts.fetch ?? fetchFeed;
  const due = dueForDiscovery(companies, cache, now, opts.max);
  const at = new Date(now).toISOString();
  const found = await pool(due, CONCURRENCY, (c) => discoverOne(c, fetch, opts.site ?? fetchSite).catch(() => null), Date.now() + (opts.budgetMs ?? DISCOVER_BUDGET_MS));
  const out: AtsCache = {};
  due.forEach((c, i) => {
    const f = found[i];
    if (f === undefined) return; // not reached in this run's time: tried next run
    out[c.domain.toLowerCase()] = f ? { board: f.board, at, via: f.via } : { at };
  });
  return out;
}

/* ---------- the sources ---------- */

/**
 * One scan source per system, over the boards found so far (at most FEEDS_PER_RUN in all). A
 * feed that fails is skipped (a system whose every feed failed reports an error); one that
 * answers 404 or 410 is passed to `gone`, so discovery looks the company up again.
 */
export function atsSources(boards: { board: AtsBoard; company: AtsCompany }[], opts: { fetch?: FeedFetch; gone?: (domain: string) => void } = {}): ScanSource[] {
  const fetch = opts.fetch ?? fetchFeed;
  const list = boards.slice(0, FEEDS_PER_RUN);
  return ATS_KINDS.filter((k) => list.some((x) => x.board.ats === k)).map((ats) => ({
    name: `careers:${ats}`,
    timeoutMs: 150_000,
    fetchJobs: async () => {
      const mine = list.filter((x) => x.board.ats === ats);
      let ok = 0;
      const jobs = await pool(mine, CONCURRENCY, async ({ board, company }) => {
        const r = await fetch(feedUrl(board));
        if (r.status === 404 || r.status === 410) opts.gone?.(company.domain.toLowerCase());
        if (r.status !== 200) return [];
        const parsed = parseFeed(board, json(r.text), company);
        if (parsed) ok++;
        return parsed ?? [];
      });
      if (!ok && mine.length) throw new Error(`No ${ats} feed answered (${mine.length} tried)`);
      return jobs.flatMap((x) => x ?? []);
    },
  }));
}
