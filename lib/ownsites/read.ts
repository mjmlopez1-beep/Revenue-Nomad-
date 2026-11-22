/**
 * Own sites (lib/ownsites): one person's firm website read for their email.
 *
 * For a firm known by name only (how "current company"), its site is found first with the website
 * finder (lib/websites/find.ts), and kept only when its homepage names the person's last name or
 * the firm's name and it is no client company's site on file.
 *
 * Then at most PAGE_CAP pages of the site's own registrable domain: the homepage, a contact page,
 * an about page, a team page (linked from the homepage, else the common path), and one more linked
 * page whose address says contact, about or team. Then, past the cap, at most BIO_PAGES more: links
 * on the pages read that look like the person's own bio page (the address carries their name, or
 * the link's words name them), the same rules for each. robots.txt first (a site that refuses "/" is
 * left alone), and every page's own path checked against it; every request through
 * lib/about/fetch.ts with all its safety checks (public addresses only, each redirect hop checked,
 * 8 seconds, a size cap, html only, the plain User-Agent), one request per host at a time, a short
 * pause between pages. A page that redirects off the site is not read.
 *
 * Which address is theirs: lib/ownsites/extract.ts decide.
 */
import { pageJunk } from "../about/extract";
import { fetchHomepage, fetchPageAt, fetchRobotsTxt, registrable, robotsAllowsPath, testAllowance, type FetchOpts, type Page } from "../about/fetch";
import { findWebsite, type FindOpts } from "../websites/find";
import { bioLinks, decide, nameWords, namesPerson, pageLinks, visibleText, type PageKind, type SitePage } from "./extract";
import { BIO_PAGES, PAGE_CAP, type OwnHow, type OwnStatus } from "./types";

/** A page read is cut at this size: contact details sit in the page, not deep in a script. */
export const PAGE_MAX_BYTES = 384 * 1024;
export const DELAY_MS = 300;

export interface ReadTarget {
  /** The person key (never sent anywhere, never logged). */
  key: string;
  /** The seat holder's name, for matching. */
  name: string;
  site?: string;
  firm?: string;
}

export type ReadOutcome =
  | { key: string; s: "found"; email: string; page: string; how: OwnHow; site: string; pages: number; lookedUp?: string; invitesOnly?: true }
  | { key: string; s: Exclude<OwnStatus, "found">; pages: number; site?: string; why?: string };


export interface ReadOpts {
  fetch?: FetchOpts;
  delayMs?: number;
  /** Replaces the homepage read (tests). */
  fetchHome?: (domain: string, o: FetchOpts) => Promise<Page>;
  /** The website finder's options, for a firm known by name only (tests pass a fake DNS and HTTP layer). */
  find?: FindOpts;
  /** Website keys on file for client companies: a firm's site found by name is never one of them. */
  taken?: Set<string>;
}

const COMMON: { path: string; kind: PageKind }[] = [
  { path: "/contact", kind: "contact" },
  { path: "/about", kind: "about" },
  { path: "/team", kind: "team" },
];

/** A firm's name as words worth finding on a page ("Smith Advisory LLC" is "smith advisory"). */
function firmWords(firm: string): string[] {
  return nameWords(firm.replace(/\b(llc|inc|ltd|co|corp|group|partners|consulting|advisory|advisors|solutions|services|the|and)\b\.?/gi, " ")).filter((w) => w.length >= 3);
}

/** One person: their firm's site found (when only its name is known), then read. Never throws. */
export async function readOwnSite(t: ReadTarget, o: ReadOpts = {}): Promise<ReadOutcome> {
  const opts: FetchOpts = { maxBytes: PAGE_MAX_BYTES, ...o.fetch, allow: o.fetch?.allow ?? testAllowance() };
  const pause = () => ((o.delayMs ?? DELAY_MS) > 0 ? new Promise((r) => setTimeout(r, o.delayMs ?? DELAY_MS)) : Promise.resolve());
  const base = { key: t.key, pages: 0 };
  let domain = t.site?.trim().toLowerCase() || "";
  let lookedUp: string | undefined;
  if (!domain) {
    if (!t.firm) return { ...base, s: "no site found" };
    try {
      const f = await findWebsite({ companyId: t.key, name: t.firm, country: "United States", prev: null, queued: false }, { ...o.find, taken: o.taken, fetch: { ...opts, ...o.find?.fetch } });
      if (f.s !== "found" || !f.domain) return { ...base, s: "no site found", why: f.why };
      domain = lookedUp = f.domain;
    } catch {
      return { ...base, s: "no site found", why: "lookup failed" };
    }
  }
  let home: Page;
  try {
    home = await (o.fetchHome ?? fetchHomepage)(domain, opts);
  } catch (e) {
    return { ...base, s: "site unreachable", site: lookedUp, why: e instanceof Error ? e.message.slice(0, 60) : "error" };
  }
  if (!home.ok) return { ...base, s: home.reason === "robots.txt disallows" ? "robots" : "site unreachable", site: lookedUp, why: home.reason };
  base.pages++;
  if (pageJunk(home.html)) return { ...base, s: "site unreachable", site: lookedUp, why: "parked or blocked" };
  const site = registrable(home.host);
  const ownSite = registrable(domain.replace(/^www\./, ""));
  // A firm's site found by name must name the person or the firm: else it may be another company's.
  if (lookedUp) {
    const text = visibleText(home.html).toLowerCase();
    const last = nameWords(t.name).slice(-1)[0] ?? "";
    const fw = firmWords(t.firm ?? "");
    const ok = (last.length >= 3 && new RegExp(`\\b${last}\\b`).test(text)) || namesPerson(text, t.name) || (fw.length > 0 && fw.every((w) => text.includes(w)));
    if (!ok) return { ...base, s: "no site found", why: "the site names neither the person nor the firm" };
  }
  const sameSite = (u: URL) => (u.protocol === "http:" || u.protocol === "https:") && (registrable(u.hostname) === site || registrable(u.hostname) === ownSite);

  const robots = new Map<string, Promise<string | null>>();
  const robotsCheck = async (u: URL) => {
    const k = `${u.protocol}//${u.host}`;
    let p = robots.get(k);
    if (!p) robots.set(k, (p = fetchRobotsTxt(new URL(k), opts).catch(() => null)));
    const txt = await p;
    return !txt || robotsAllowsPath(txt, `${u.pathname}${u.search}`);
  };
  const pageOpts: FetchOpts = { ...opts, robotsCheck };

  const pages: SitePage[] = [{ url: home.url, html: home.html }];
  const seen = new Set<string>([key(new URL(home.url))]);
  // The pages to read, in order: a linked contact, about and team page (else the common path), then one more linked page of those kinds.
  const links = pageLinks(home.html, home.url, sameSite);
  const plan: string[] = [];
  for (const c of COMMON) {
    const linked = links.find((l) => l.kind === c.kind && !plan.includes(l.url));
    plan.push(linked ? linked.url : new URL(c.path, home.url).href);
  }
  const extra = links.find((l) => !plan.includes(l.url));
  if (extra) plan.push(extra.url);
  let blocked = 0;
  try {
    for (const url of plan) {
      if (pages.length >= PAGE_CAP) break;
      const k = key(new URL(url));
      if (seen.has(k)) continue;
      seen.add(k);
      await pause();
      const p = await fetchPageAt(url, pageOpts);
      if (!p.ok) {
        if (p.reason === "robots.txt disallows") blocked++;
        continue;
      }
      if (!sameSite(new URL(p.url))) continue;
      const k2 = key(new URL(p.url));
      if (k2 !== k && seen.has(k2)) continue;
      seen.add(k2);
      pages.push({ url: p.url, html: p.html });
      base.pages++;
      // A contact page that links another contact or about page: it may take the place of a common path that isn't there.
      for (const l of pageLinks(p.html, p.url, sameSite)) {
        if (plan.length >= PAGE_CAP + 2) break;
        if (!plan.includes(l.url) && !seen.has(key(new URL(l.url)))) plan.push(l.url);
      }
    }
    // The person's own bio page, when a page read links one: at most BIO_PAGES more pages, the same checks for each.
    const bios: string[] = [];
    for (const p of pages) for (const u of bioLinks(p.html, p.url, sameSite, t.name)) if (!bios.includes(u) && !seen.has(key(new URL(u)))) bios.push(u);
    let extraRead = 0;
    for (const url of bios) {
      if (extraRead >= BIO_PAGES) break;
      const k = key(new URL(url));
      if (seen.has(k)) continue;
      seen.add(k);
      await pause();
      extraRead++;
      const p = await fetchPageAt(url, pageOpts);
      if (!p.ok) {
        if (p.reason === "robots.txt disallows") blocked++;
        continue;
      }
      if (!sameSite(new URL(p.url))) continue;
      const k2 = key(new URL(p.url));
      if (k2 !== k && seen.has(k2)) continue;
      seen.add(k2);
      pages.push({ url: p.url, html: p.html });
      base.pages++;
    }
  } catch {
    /* what was read is decided on */
  }
  const d = decide(pages, home.host, t.name);
  if (d.ok) return { ...base, s: "found", email: d.email, page: d.page, how: d.how, site: home.host.replace(/^www\./, ""), ...(lookedUp ? { lookedUp } : {}), ...(d.invitesOnly ? { invitesOnly: true as const } : {}) };
  // Nothing at all, and robots.txt kept us off every page past the homepage: say so.
  if (d.s === "no email" && blocked && pages.length === 1) return { ...base, s: "robots", site: lookedUp };
  return { ...base, s: d.s, site: lookedUp, ...(d.s === "email not theirs" ? { why: d.why } : {}) };
}

const key = (u: URL) => `${u.host.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "") || "/"}${u.search}`;
