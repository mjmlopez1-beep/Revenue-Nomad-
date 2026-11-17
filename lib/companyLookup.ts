/**
 * Company lookup for "Add record": paste a URL, get back what we can prefill.
 *
 * - domain: normalized from the URL (also drives the favicon on the page)
 * - name:   the site's own og:site_name / application-name / <title>
 * - industry: a suggested Revenue Nomad industry tag, from keywords in the
 *   site's title and description (the member confirms or changes it)
 *
 * Revenue stage and employee count are NOT guessed: there's no free, reliable
 * public source for them, so the member picks from the standard lists.
 * Everything returned is a suggestion; the member can edit each field before saving.
 */
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import type { IncomingMessage } from "node:http";
import { request } from "node:https";
import { isIP } from "node:net";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { industryOf } from "./industryMap";

export interface LookupResult {
  domain: string;
  name: string | null;
  industry: string | null;
  description: string | null;
}

/**
 * The public host in a pasted URL, or null. IP literals and internal names are refused, so
 * the lookup can't be pointed at the server's own network (guardedLookup covers names that
 * resolve to internal addresses).
 */
export function normalizeDomain(raw: string): string | null {
  let s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split(/[/?#]/)[0];
  // IPv6 literals ("[::1]") and anything with more than a port after a colon.
  if (s.startsWith("[") || (s.match(/:/g) ?? []).length > 1) return null;
  s = s.split(":")[0].replace(/\.$/, "").replace(/^www\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  if (/^\d+(\.\d+){3}$/.test(s) || s.includes(":")) return null;
  if (/\.(local|internal|localhost|lan)$/.test(s)) return null;
  // A numeric or hex last label ("127.1", "0x7f.1") is an address, not a name.
  if (/^(\d+|0x[0-9a-f]+)$/.test(s.slice(s.lastIndexOf(".") + 1))) return null;
  return s;
}

/* ---------- address guard ---------- */

const v4 = (a: string) => a.split(".").reduce((n, x) => n * 256 + Number(x), 0);
/** [network, prefix length]. 224.0.0.0/3 covers multicast (224/4) and everything above it. */
const V4_BLOCKED: [number, number][] = (
  [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
    ["172.16.0.0", 12], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
  ] as [string, number][]
).map(([a, bits]) => [v4(a), bits]);

const blockedV4 = (n: number) => V4_BLOCKED.some(([base, bits]) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(base / 2 ** (32 - bits)));

/** The eight 16-bit groups of an IPv6 address (dotted tails included), or null. */
function v6Groups(addr: string): number[] | null {
  let a = addr.toLowerCase().split("%")[0];
  const dotted = a.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const n = v4(dotted[1]);
    a = `${a.slice(0, -dotted[1].length)}${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const parts = a.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 ? (parts[1] ? parts[1].split(":") : []) : null;
  const groups = tail === null ? head : [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/** True for loopback, private, link-local, shared (CGNAT), benchmark, multicast and reserved addresses. */
export function isBlockedAddress(addr: string): boolean {
  const kind = isIP(addr);
  if (kind === 4) return blockedV4(v4(addr));
  if (kind !== 6) return true;
  const g = v6Groups(addr);
  if (!g) return true;
  const embedded = () => blockedV4(g[6] * 65536 + g[7]);
  const zero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (zero(0, 8)) return true; // ::
  if (zero(0, 7) && g[7] === 1) return true; // ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (zero(0, 5) && (g[5] === 0xffff || g[5] === 0)) return embedded(); // ::ffff:a.b.c.d (and the old ::a.b.c.d)
  if (g[0] === 0x64 && g[1] === 0xff9b && zero(2, 6)) return embedded(); // NAT64
  return false;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
/**
 * dns.lookup that refuses internal addresses. It is the socket's `lookup`, so the check runs
 * on the address actually connected to, which also defeats DNS rebinding.
 */
function guardedLookup(hostname: string, options: LookupOptions, cb: LookupCb): void {
  dnsLookup(hostname, { ...options }, (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => {
    if (err) return cb(err, address, family);
    const list = Array.isArray(address) ? address.map((x) => x.address) : [address];
    if (!list.length || list.some(isBlockedAddress)) {
      return cb(Object.assign(new Error(`Refusing to connect to an internal address for ${hostname}`), { code: "EBLOCKED" }), address, family);
    }
    cb(null, address, family);
  });
}

/** Keyword → Revenue Nomad industry tag. First match wins, most specific first. */
const INDUSTRY_RULES: [RegExp, string][] = [
  [/\bsaas\b|software[- ]as[- ]a[- ]service/i, "SaaS"],
  [/\b(fintech|payments?|banking|lending|insurance|insurtech|wealth|accounting software)\b/i, "Financial Services"],
  [/\b(health ?care|healthtech|clinical|patient|medical|hospital|pharma|biotech|life sciences)\b/i, "Health Care"],
  [/\b(wellness|fitness|nutrition|supplements?)\b/i, "Wellness & Fitness"],
  [/\b(edtech|education|learning|school|university|students?)\b/i, "Education"],
  [/\b(real estate|proptech|property management|residential|commercial property)\b/i, "Real Estate"],
  [/\b(construction|contractor|builders?|remodel|architecture firm)\b/i, "Construction"],
  [/\b(manufactur|industrial|factory|components|semiconductor)\w*/i, "Manufacturing"],
  [/\b(logistics|freight|shipping|fleet|transportation|supply chain|trucking)\b/i, "Transportation & Logistics"],
  [/\b(e-?commerce|retail|shop|store|apparel|fashion)\b/i, "Retail"],
  [/\b(consumer goods|cpg|beverage|food brand)\b/i, "Consumer Goods"],
  [/\b(media|publishing|news|podcast|broadcast|marketing agency|advertising)\b/i, "Media & Communications"],
  [/\b(entertainment|games?|gaming|film|music|studio)\b/i, "Entertainment"],
  [/\b(nonprofit|non-profit|charity|foundation)\b/i, "Nonprofit"],
  [/\b(law firm|legal|attorneys?)\b/i, "Legal"],
  [/\b(energy|solar|oil|gas|mining|utilities)\b/i, "Energy & Mining"],
  [/\b(travel|hospitality|hotels?|recreation|tourism)\b/i, "Recreation & Travel"],
  [/\b(networking|hardware|devices?|iot|data center)\b/i, "Hardware & Networking"],
  [/\b(consulting|staffing|recruiting|outsourc|professional services|agency)\w*/i, "Corporate Services"],
  [/\b(software|platform|cloud|api|ai\b|developer|app)\b/i, "Software & IT Services"],
];

export function suggestIndustry(text: string): string | null {
  // Each rule names one of our earlier tags: the site's own words pick today's closest value (lib/industryMap.ts).
  for (const [re, tag] of INDUSTRY_RULES) if (re.test(text)) return industryOf(tag, text, true);
  return null;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

function meta(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content) : null;
}

/** "Acme — The best widgets | Home" → "Acme" */
function cleanTitle(t: string, domain: string): string {
  const parts = t.split(/\s+[|–—:·-]\s+/).map((p) => p.trim()).filter(Boolean);
  const root = domain.split(".")[0].replace(/[^a-z0-9]/g, "");
  // Prefer the part that looks like the brand (matches the domain), else the shortest.
  const brand = parts.find((p) => p.toLowerCase().replace(/[^a-z0-9]/g, "").includes(root));
  const pick = brand ?? [...parts].sort((a, b) => a.length - b.length)[0] ?? t;
  return pick.slice(0, 80);
}

const MAX_HTML = 300_000;
const MAX_HOPS = 3;
const TIMEOUT_MS = 6000;

/** One GET through the guarded lookup. Resolves with the response, or null on any error. */
function get(url: URL, deadline: number): Promise<IncomingMessage | null> {
  return new Promise((resolve) => {
    const left = deadline - Date.now();
    if (left <= 0) return resolve(null);
    const req = request(
      {
        protocol: "https:",
        hostname: url.hostname,
        port: 443,
        path: `${url.pathname || "/"}${url.search}`,
        method: "GET",
        agent: false,
        lookup: guardedLookup as unknown as typeof dnsLookup,
        timeout: left,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; RevenueNomadTable/1.0)",
          accept: "text/html",
          "accept-encoding": "gzip, deflate, br",
        },
      },
      resolve,
    );
    const timer = setTimeout(() => req.destroy(new Error("timeout")), left);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => resolve(null));
    req.on("close", () => clearTimeout(timer));
    req.end();
  });
}

/** Read up to MAX_HTML characters of the decompressed body, then drop the connection. */
function readBody(res: IncomingMessage, deadline: number): Promise<string> {
  return new Promise((resolve) => {
    const enc = String(res.headers["content-encoding"] ?? "").trim().toLowerCase();
    const stream: Readable =
      enc === "gzip" ? res.pipe(createGunzip()) : enc === "deflate" ? res.pipe(createInflate()) : enc === "br" ? res.pipe(createBrotliDecompress()) : res;
    let out = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      res.destroy();
      if (stream !== res) stream.destroy();
      resolve(out.slice(0, MAX_HTML));
    };
    const timer = setTimeout(finish, Math.max(0, deadline - Date.now()));
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      out += chunk;
      if (out.length >= MAX_HTML) finish();
    });
    stream.on("end", finish);
    stream.on("error", finish);
    res.on("error", finish);
    res.on("aborted", finish);
  });
}

/**
 * The site's home page as HTML ("" when unreachable). https only, default port only, at most
 * MAX_HOPS redirects, each re-checked with normalizeDomain and the guarded lookup.
 */
async function fetchHome(domain: string): Promise<string> {
  const deadline = Date.now() + TIMEOUT_MS;
  let url = new URL(`https://${domain}/`);
  for (let hop = 0; ; hop++) {
    const res = await get(url, deadline);
    if (!res) return "";
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.destroy();
      if (hop >= MAX_HOPS) return "";
      let next: URL;
      try {
        next = new URL(res.headers.location, url);
      } catch {
        return "";
      }
      if (next.protocol !== "https:" || next.port !== "" || next.username || next.password || !normalizeDomain(next.hostname)) return "";
      url = next;
      continue;
    }
    if (status < 200 || status >= 300 || !String(res.headers["content-type"] ?? "").includes("html")) {
      res.destroy();
      return "";
    }
    return readBody(res, deadline);
  }
}

export async function lookupCompany(rawUrl: string): Promise<LookupResult | null> {
  const domain = normalizeDomain(rawUrl);
  if (!domain) return null;
  let html = "";
  try {
    html = await fetchHome(domain);
  } catch {
    /* site unreachable: still return the domain so the favicon and manual entry work */
  }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const name =
    meta(html, "og:site_name") ?? meta(html, "application-name") ?? (title ? cleanTitle(decode(title), domain) : null);
  const description = meta(html, "og:description") ?? meta(html, "description");
  const industry = suggestIndustry(`${title ?? ""} ${description ?? ""}`);
  // Site unreachable or untitled: fall back to the domain's name ("acme-robotics.com" -> "Acme Robotics").
  const fromDomain = domain.split(".")[0].split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return { domain, name: name || fromDomain, industry, description: description ? description.slice(0, 240) : null };
}
