/**
 * One company's website, found (lib/websites): its likely domains (candidates.ts), cheap checks
 * first, then its homepage read and checked against its name (verify.ts).
 *
 *  1. DNS: does the domain resolve at all? Four at a time, 3 seconds each. A name that resolves to
 *     a private, loopback, link-local or otherwise reserved address is never fetched, whatever
 *     else it resolves to (lib/about/fetch.ts addressAllowed).
 *  2. One homepage read for a domain that resolves, under lib/about/fetch.ts's rules: robots.txt
 *     first, https (http only when https can't connect), every redirect hop checked (scheme, port,
 *     public host, addresses; at most 3), 8 seconds, 256 KB, html only. At most MAX_PAGES a company.
 *  3. The first page that passes verify() wins. A domain already on file for another company is
 *     passed over.
 *
 * DNS and the homepage read come in as functions, so tests use a fake DNS and HTTP layer.
 */
import { Resolver } from "node:dns/promises";
import { addressAllowed, fetchHomepage, type FetchOpts, type Page } from "../about/fetch";
import { siteKey } from "../tableFields";
import { candidates, type Candidate } from "./candidates";
import { verify } from "./verify";
import type { WebsiteOutcome, WebsiteTarget } from "./types";

/** Homepages read per company, at most. */
export const MAX_PAGES = 6;
/** One DNS lookup, at most. */
export const DNS_TIMEOUT_MS = 3_000;
/** Lookups at once, within one company. */
const DNS_AT_ONCE = 4;
/** A homepage read is cut at this size: the parts verify() reads are near the top. */
export const PAGE_MAX_BYTES = 256 * 1024;

export type Resolve = (host: string) => Promise<string[]>;
export type FetchPage = (domain: string, o: FetchOpts) => Promise<Page>;

export interface FindOpts {
  /** Name to addresses (throws ENOTFOUND for none). Defaults to a DNS resolver of its own (c-ares). Also used by the homepage read, so the address checked is the one connected to. */
  resolve?: Resolve;
  /** Replaces the homepage read (tests). Defaults to lib/about/fetch.ts fetchHomepage. */
  fetchPage?: FetchPage;
  /** Options for the homepage read (a host gate, tests' loopback allowance). */
  fetch?: FetchOpts;
  /** Website keys (lib/tableFields.ts siteKey) on file for other companies: never found for this one. */
  taken?: Set<string>;
  maxPages?: number;
  dnsTimeoutMs?: number;
}

/**
 * The DNS resolver (c-ares, not the system's getaddrinfo: a run makes thousands of lookups, and
 * getaddrinfo would hold the threadpool the server's file writes need). Its own timeout and two
 * tries. A and AAAA both, so an IPv6-only site counts and every address is checked.
 */
let resolver: Resolver | null = null;
const systemResolve: Resolve = async (host) => {
  resolver ??= new Resolver({ timeout: 2_500, tries: 2 });
  const [a, b] = await Promise.allSettled([resolver.resolve4(host), resolver.resolve6(host)]);
  const addrs = [...(a.status === "fulfilled" ? a.value : []), ...(b.status === "fulfilled" ? b.value : [])];
  if (addrs.length) return addrs;
  // No address: "no such name" when either says so, else the first error (a timeout, a server failure).
  const errs = [a, b].map((x) => (x.status === "rejected" ? (x.reason as NodeJS.ErrnoException) : null)).filter((x): x is NodeJS.ErrnoException => !!x);
  throw errs.find((e) => e.code === "ENOTFOUND") ?? errs.find((e) => e.code !== "ENODATA") ?? errs[0] ?? Object.assign(new Error("no address"), { code: "ENODATA" });
};

type Dns = { s: "ok"; addrs: string[] } | { s: "nx" } | { s: "private" } | { s: "error"; why: string };

/** Whether `host` resolves, and only to public addresses. */
export async function checkDns(host: string, resolve: Resolve, timeoutMs = DNS_TIMEOUT_MS, loopback = false): Promise<Dns> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addrs = await Promise.race([
      resolve(host),
      new Promise<never>((_, no) => {
        timer = setTimeout(() => no(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), timeoutMs);
      }),
    ]);
    if (!addrs.length) return { s: "nx" };
    if (addrs.some((a) => !addressAllowed(a, loopback))) return { s: "private" };
    return { s: "ok", addrs };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code ?? "";
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN" || code === "ESERVFAIL" || code === "EBADNAME") return { s: "nx" };
    return { s: "error", why: code === "ETIMEOUT" ? "dns timeout" : "dns error" };
  } finally {
    clearTimeout(timer);
  }
}

/** Find `t`'s website: the outcome to store, with how many domains were looked up and pages read. Never throws. */
export async function findWebsite(t: WebsiteTarget, o: FindOpts = {}): Promise<WebsiteOutcome> {
  const resolve = o.resolve ?? systemResolve;
  const fetchPage = o.fetchPage ?? fetchHomepage;
  const maxPages = o.maxPages ?? MAX_PAGES;
  const loopback = !!o.fetch?.allow?.loopback;
  const list: Candidate[] = candidates(t.name, { country: t.country });
  const base = { companyId: t.companyId, tried: 0, read: 0 };
  if (!list.length) return { ...base, s: "none", why: "no candidates" };
  let dnsErrors = 0;
  let answered = 0;
  let lastWhy = "nothing resolves";
  const readOpts: FetchOpts = { maxBytes: PAGE_MAX_BYTES, ...o.fetch, resolve: o.fetch?.resolve ?? resolve };
  for (let i = 0; i < list.length && base.read < maxPages; i += DNS_AT_ONCE) {
    const chunk = list.slice(i, i + DNS_AT_ONCE);
    const dns = await Promise.all(chunk.map((c) => checkDns(c.domain, resolve, o.dnsTimeoutMs ?? DNS_TIMEOUT_MS, loopback)));
    base.tried += chunk.length;
    for (let k = 0; k < chunk.length && base.read < maxPages; k++) {
      const c = chunk[k];
      const d = dns[k];
      if (d.s === "error") {
        dnsErrors++;
        continue;
      }
      answered++;
      if (d.s === "nx") continue;
      if (d.s === "private") {
        lastWhy = "private address";
        continue;
      }
      if (o.taken?.has(siteKey(c.domain) ?? c.domain)) {
        lastWhy = "on file for another company";
        continue;
      }
      base.read++;
      let page: Page;
      try {
        page = await fetchPage(c.domain, readOpts);
      } catch (e) {
        lastWhy = e instanceof Error ? e.message.slice(0, 60) : "error";
        continue;
      }
      if (!page.ok) {
        lastWhy = page.reason;
        continue;
      }
      const v = verify({ name: t.name, cand: c, finalUrl: page.url, html: page.html, country: t.country });
      if (!v.ok) {
        lastWhy = v.why;
        continue;
      }
      if (o.taken?.has(siteKey(v.domain) ?? v.domain)) {
        lastWhy = "on file for another company";
        continue;
      }
      return { ...base, s: "found", domain: v.domain, confidence: v.confidence, ...(v.linkedin ? { linkedin: v.linkedin } : {}) };
    }
  }
  // No DNS answer at all: the trouble is ours or the resolver's, so it is tried again soon.
  if (!answered && dnsErrors) return { ...base, s: "failed", why: "dns unavailable" };
  return { ...base, s: "none", why: lastWhy };
}
