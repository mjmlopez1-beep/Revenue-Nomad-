/**
 * The posting check: after each scan, the scan fetches the postings of the open roles it follows
 * and closes a role at once when every posting of it is clearly closed (checkOpenPostings in
 * lib/table.ts). Pure decisions here, with the fetch passed in, so tests never reach the network.
 *
 * Clearly closed:
 *  - the posting answers 404 or 410;
 *  - it redirects to a generic jobs or careers index instead of the posting ("/careers", a board's
 *    front page, Greenhouse's "?error=true");
 *  - its page says so in words (CLOSED_PHRASES), outside scripts and styles;
 *  - on Greenhouse, Lever, Ashby, Workable and SmartRecruiters, the system's own public API says
 *    the job is gone (404 for the job, or a board that answers without it). Those links are
 *    checked through the API only, since their pages are scripts that carry no words to read.
 * fractionaljobs.io puts its "This Role is Closed" block in the markup of every posting, open or
 * not (the page shows or hides it in the browser), so its words are never read. A posting there
 * links the employer's application page, and that link is checked in its place.
 *
 * Everything else changes nothing: a network error or timeout, 401, 403, 429, any 5xx, a redirect
 * elsewhere, a page with none of the words.
 */

export type Verdict = "closed" | "open" | "unknown";
export interface Checked {
  verdict: Verdict;
  /** Why, for the log: "404", "redirect to index", "page says closed", "api: gone". */
  why: string;
}
/** One GET, redirects followed: the final status and address, and the body (cut short is fine). Status 0 is a network error or timeout. */
export interface Fetched {
  status: number;
  url: string;
  text: string;
}
export type PostingFetch = (url: string) => Promise<Fetched>;

/** At most this many fetches a run, this many at once, each this long. */
export const MAX_CHECKS = 300;
export const CHECK_CONCURRENCY = 4;
export const CHECK_TIMEOUT_MS = 8_000;
/** No new role is checked after this long in one run; the rest are first in line next run. */
export const CHECK_BUDGET_MS = 150_000;
const MAX_BYTES = 1_000_000;
const UA = "Mozilla/5.0 (compatible; JobPostingCheck/1.0)";

/**
 * Words that say a posting is closed. Each is read on the page's text, lowercased, with tags,
 * scripts and styles taken out. They name the posting itself, so a page about something else
 * ("we have no open roles in Sales right now") does not match.
 */
export const CLOSED_PHRASES: RegExp[] = [
  /\bno longer accepting applications\b/,
  /\b(?:is )?no longer accepting (?:new )?applicants\b/,
  /\bthis (?:job|position|role|posting|job posting|job listing|listing|opening|vacancy|requisition) (?:is|has been) no longer (?:available|active|open|posted|listed)\b/,
  /\b(?:job|position|role|posting|opening|vacancy) (?:is )?no longer available\b/,
  /\bthe (?:job|position|page) you (?:are|were|'re) looking for (?:is|has been) no longer\b/,
  /\b(?:this |the )?(?:position|role|job|vacancy) has (?:already )?been filled\b/,
  /\b(?:this |the )?(?:job|posting|job posting|listing|job listing|vacancy|position|advert) has expired\b/,
  /\bthis (?:job )?(?:posting|listing|position|job|role|opening|vacancy|requisition) (?:is|has been) closed\b/,
  /\bapplications for this (?:job|role|position|posting) (?:are|have) (?:now )?closed\b/,
  /\bsorry,? this job has (?:expired|been removed|closed)\b/,
];

/** Page text as the phrases read it: scripts, styles, templates and tags out, entities in, lowercase. */
export function pageText(html: string): string {
  return String(html)
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;|&#x27;|&apos;|&rsquo;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export const saysClosed = (html: string) => {
  const t = pageText(html);
  return CLOSED_PHRASES.some((re) => re.test(t));
};

const hostOf = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, "");
const parse = (raw: string): URL | null => {
  try {
    const u = new URL(raw);
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch {
    return null;
  }
};
const segs = (u: URL) => u.pathname.split("/").filter(Boolean);
const lastTwo = (h: string) => h.split(".").slice(-2).join(".");

/** A jobs or careers index, not one posting: "/careers", "/en/jobs/", a board's front page on an ATS. */
const INDEX_PATH = /^(?:[a-z]{2}(?:[-_][a-z]{2})?\/)?(?:careers?|jobs?|join(?:-us)?|work-with-us|positions|openings|opportunities|vacancies|open-positions|open-roles|current-openings)(?:\/(?:jobs?|search|openings|positions|all))?$/i;

/**
 * The final address is a generic index instead of the posting asked for: the same site (or the
 * same ATS board), a shorter path that is the site's root, a careers or jobs index, or a board's
 * front page, or Greenhouse's "?error=true".
 */
export function isIndexRedirect(asked: string, final: string): boolean {
  const a = parse(asked);
  const f = parse(final);
  if (!a || !f) return false;
  const fa = hostOf(f);
  if (/(^|\.)greenhouse\.io$/.test(fa) && f.searchParams.get("error") === "true") return true;
  const pathA = segs(a).join("/").toLowerCase();
  const pathF = segs(f).join("/").toLowerCase();
  if (pathA === pathF) return false; // http to https, a trailing slash, a tracking code
  if (lastTwo(hostOf(a)) !== lastTwo(fa)) return false; // another site altogether: not ours to judge
  const sf = segs(f);
  if (sf.length === 0) return true;
  if (INDEX_PATH.test(pathF)) return true;
  // An ATS board's front page: jobs.lever.co/acme, jobs.ashbyhq.com/acme, boards.greenhouse.io/acme, apply.workable.com/acme.
  if (/^(?:jobs\.(?:eu\.)?lever\.co|jobs\.ashbyhq\.com|(?:job-)?boards\.greenhouse\.io|apply\.workable\.com|jobs\.smartrecruiters\.com)$/.test(fa) && sf.length === 1 && segs(a).length > 1) return true;
  return false;
}

/** What one fetched page says, by status, redirect and words. `readWords` is off where the words can't be trusted (fractionaljobs.io). */
export function classifyPage(asked: string, res: Fetched, readWords = true): Checked {
  if (res.status === 404 || res.status === 410) return { verdict: "closed", why: String(res.status) };
  if (!res.status) return { verdict: "unknown", why: "network" };
  if (res.status < 200 || res.status >= 300) return { verdict: "unknown", why: String(res.status) };
  if (res.url && isIndexRedirect(asked, res.url)) return { verdict: "closed", why: "redirect to index" };
  if (readWords && saysClosed(res.text)) return { verdict: "closed", why: "page says closed" };
  return { verdict: "open", why: "listed" };
}

type Obj = Record<string, unknown>;
const json = (t: string): Obj | unknown[] | null => {
  try {
    const x = JSON.parse(t);
    return x && typeof x === "object" ? x : null;
  } catch {
    return null;
  }
};

/**
 * For a posting on one of the five systems, the API address that answers for it and how to read
 * the answer. Null for any other link.
 */
export function apiCheck(raw: string): { api: string; read: (r: Fetched) => Checked } | null {
  const u = parse(raw);
  if (!u) return null;
  const h = hostOf(u);
  const s = segs(u);
  const gone = (r: Fetched): Checked | null => (r.status === 404 || r.status === 410 ? { verdict: "closed", why: `api: ${r.status}` } : null);
  const byStatus = (r: Fetched): Checked => gone(r) ?? (r.status === 200 ? { verdict: "open", why: "api: listed" } : { verdict: "unknown", why: `api: ${r.status || "network"}` });
  /** A board's whole list: closed when the board answers and the job is not on it. A board that is gone tells nothing about one job. */
  const inList = (list: (body: unknown) => unknown[] | null, has: (job: Obj) => boolean) => (r: Fetched): Checked => {
    if (r.status !== 200) return { verdict: "unknown", why: `api: ${r.status || "network"}` };
    const jobs = list(json(r.text));
    if (!jobs) return { verdict: "unknown", why: "api: unreadable" };
    return jobs.some((j) => j && typeof j === "object" && has(j as Obj)) ? { verdict: "open", why: "api: listed" } : { verdict: "closed", why: "api: not on the board" };
  };
  const enc = encodeURIComponent;

  if (/(^|\.)greenhouse\.io$/.test(h)) {
    // boards.greenhouse.io/acme/jobs/123, job-boards.greenhouse.io/acme/jobs/123, boards.greenhouse.io/embed/job_app?for=acme&token=123
    const board = s[0] === "embed" ? u.searchParams.get("for") : s[0];
    const id = s[0] === "embed" ? u.searchParams.get("token") : s[1] === "jobs" ? s[2] : null;
    if (!board || !id || !/^\d+$/.test(id)) return null;
    return { api: `https://boards-api.greenhouse.io/v1/boards/${enc(board)}/jobs/${id}`, read: byStatus };
  }
  if (h === "jobs.lever.co" || h === "jobs.eu.lever.co") {
    if (s.length < 2 || !/^[0-9a-f-]{20,}$/i.test(s[1])) return null;
    const api = h === "jobs.eu.lever.co" ? "api.eu.lever.co" : "api.lever.co";
    return { api: `https://${api}/v0/postings/${enc(s[0])}/${enc(s[1])}`, read: byStatus };
  }
  if (h === "jobs.ashbyhq.com") {
    if (s.length < 2 || !/^[0-9a-f-]{20,}$/i.test(s[1])) return null;
    const id = s[1].toLowerCase();
    return {
      api: `https://api.ashbyhq.com/posting-api/job-board/${enc(s[0])}`,
      read: inList(
        (b) => (b && typeof b === "object" && Array.isArray((b as Obj).jobs) ? ((b as Obj).jobs as unknown[]) : null),
        (j) => String(j.id ?? "").toLowerCase() === id || String(j.jobUrl ?? "").toLowerCase().includes(id),
      ),
    };
  }
  if (h === "apply.workable.com") {
    const j = s.indexOf("j");
    if (j !== 1 || !s[2]) return null;
    const code = s[2].toUpperCase();
    return {
      api: `https://apply.workable.com/api/v1/widget/accounts/${enc(s[0])}`,
      read: inList(
        (b) => (b && typeof b === "object" && Array.isArray((b as Obj).jobs) ? ((b as Obj).jobs as unknown[]) : null),
        (x) => String(x.shortcode ?? "").toUpperCase() === code || String(x.url ?? "").toUpperCase().includes(`/J/${code}`),
      ),
    };
  }
  if (h === "jobs.smartrecruiters.com" || h === "careers.smartrecruiters.com") {
    const id = s[1]?.match(/^(\d{6,})/)?.[1];
    if (!s[0] || !id) return null;
    return { api: `https://api.smartrecruiters.com/v1/companies/${enc(s[0])}/postings/${id}`, read: byStatus };
  }
  return null;
}

/** The employer's application link on a fractionaljobs.io posting ("View Application"), when it leads off the board. */
export function applyLinkOf(html: string): string | null {
  for (const m of String(html).matchAll(/<a\b[^>]*>/gi)) {
    const a = m[0];
    if (!/\bchecked-cookie-btn\b/.test(a)) continue;
    const href = a.match(/\bhref\s*=\s*"([^"]+)"/i)?.[1]?.replace(/&amp;/g, "&");
    const u = href ? parse(href) : null;
    if (u && !/(^|\.)fractionaljobs\.io$/.test(hostOf(u))) return u.toString();
  }
  return null;
}

/**
 * Check one posting link. Returns the verdict and how many fetches it took (an apply link
 * followed from fractionaljobs.io is a second one).
 */
export async function checkPosting(url: string, fetch: PostingFetch): Promise<Checked & { fetches: number }> {
  const api = apiCheck(url);
  if (api) {
    const r = await fetch(api.api).catch((): Fetched => ({ status: 0, url: api.api, text: "" }));
    return { ...api.read(r), fetches: 1 };
  }
  const u = parse(url);
  if (!u) return { verdict: "unknown", why: "bad link", fetches: 0 };
  const board = /(^|\.)fractionaljobs\.io$/.test(hostOf(u));
  const r = await fetch(url).catch((): Fetched => ({ status: 0, url, text: "" }));
  const page = classifyPage(url, r, !board);
  if (!board || page.verdict !== "open") return { ...page, fetches: 1 };
  // fractionaljobs.io's words can't be read: its employer's own application page decides.
  const apply = applyLinkOf(r.text);
  if (!apply) return { verdict: "unknown", why: "board page", fetches: 1 };
  const next = await checkPosting(apply, fetch);
  return { verdict: next.verdict === "closed" ? "closed" : "unknown", why: `apply link: ${next.why}`, fetches: 1 + next.fetches };
}

export interface CheckItem {
  key: string;
  urls: string[];
}
export interface CheckOutcome {
  key: string;
  /** closed only when every link was clearly closed. */
  verdict: Verdict;
  why: string;
  fetches: number;
}

/**
 * Check roles in the order given (the caller puts the longest unchecked first), at most
 * `concurrency` fetches at once and about `max` fetches in all: a role that would go past the
 * budget waits for the next run. A role is closed only when every one of its links is.
 */
export async function checkPostings(items: CheckItem[], opts: { fetch: PostingFetch; max?: number; concurrency?: number; budgetMs?: number }): Promise<CheckOutcome[]> {
  const max = opts.max ?? MAX_CHECKS;
  const until = Date.now() + (opts.budgetMs ?? CHECK_BUDGET_MS);
  const queue: CheckItem[] = [];
  let budget = 0;
  for (const it of items) {
    const urls = [...new Set(it.urls.filter((u) => !!parse(u)))].slice(0, 4);
    if (!urls.length) continue;
    // A fractionaljobs.io link can take two fetches.
    const cost = urls.reduce((n, u) => n + (/fractionaljobs\.io/i.test(u) ? 2 : 1), 0);
    if (budget + cost > max) break;
    budget += cost;
    queue.push({ key: it.key, urls });
  }
  const out: CheckOutcome[] = [];
  let next = 0;
  // `concurrency` workers, each checking one link at a time.
  const workers = Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? CHECK_CONCURRENCY, CHECK_CONCURRENCY)) }, async () => {
    while (next < queue.length && Date.now() < until) {
      const it = queue[next++];
      let fetches = 0;
      let closed = true;
      const whys: string[] = [];
      for (const u of it.urls) {
        const c = await checkPosting(u, opts.fetch);
        fetches += c.fetches;
        whys.push(c.why);
        if (c.verdict !== "closed") {
          closed = false;
          break; // one link still up (or unclear) is enough: the role stays as it is
        }
      }
      out.push({ key: it.key, verdict: closed ? "closed" : "open", why: whys.join("; "), fetches });
    }
  });
  await Promise.all(workers);
  return out;
}

/** The real fetch: a generic User-Agent, CHECK_TIMEOUT_MS, redirects followed, at most MAX_BYTES read, never a throw. */
export const fetchPosting: PostingFetch = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "User-Agent": UA, Accept: "text/html,application/json;q=0.9,*/*;q=0.5" } });
    let text = "";
    if (res.body && res.status >= 200 && res.status < 300) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (text.length < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
      }
      await reader.cancel().catch(() => {});
    } else await res.body?.cancel().catch(() => {});
    return { status: res.status, url: res.url || url, text };
  } catch {
    return { status: 0, url, text: "" };
  } finally {
    clearTimeout(timer);
  }
};
