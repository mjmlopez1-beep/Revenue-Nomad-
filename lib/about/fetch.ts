/**
 * Read a company's homepage safely, for its About text (lib/about/run.ts).
 *
 * The address comes from data members and job boards typed in, so every request is treated as
 * untrusted (SSRF):
 *  - http and https only, on ports 80 and 443;
 *  - the name is resolved here and every address checked before connecting: private, loopback,
 *    link-local (the cloud metadata address 169.254.169.254 among them), CGNAT, multicast,
 *    reserved and documentation ranges are refused, IPv6 and IPv4-in-IPv6 forms too. The
 *    connection then goes to the address that was checked (no second lookup to rebind);
 *  - every redirect hop is checked the same way, at most 3 of them, and only to the same
 *    registrable domain (www and the like), or to another public host name;
 *  - 8 seconds per request, at most 512 KB read (after decompression), text/html only;
 *  - a plain User-Agent with no personal data, and robots.txt is read first: a Disallow of "/"
 *    for our agent (or for *) means the site is left alone.
 *
 * Tests only: with RN_SCAN_TEST=1 and RN_ABOUT_TEST_PORT=<port>, homepages are read over http on
 * that port and loopback addresses are allowed (a local mock server). Without RN_SCAN_TEST=1
 * the variable is never read. Tests can also pass `resolve` to map names to addresses.
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import zlib from "node:zlib";
import type { LookupFunction } from "node:net";
import { pageJunk } from "./extract";

export const ABOUT_UA = "Merlin-About/1.0 (+https://revenuenomad.com)";
/** The agent name robots.txt groups are matched against. */
const UA_TOKEN = "merlin-about";
export const TIMEOUT_MS = 8_000;
export const MAX_BYTES = 512 * 1024;
const ROBOTS_MAX = 64 * 1024;
export const MAX_REDIRECTS = 3;
const CHALLENGE_STATUS = new Set([403, 429, 503]);

export interface FetchOpts {
  timeoutMs?: number;
  maxBytes?: number;
  /** Name to addresses. Defaults to the system resolver (every address it returns). */
  resolve?: (host: string) => Promise<string[]>;
  /** Tests: allow loopback addresses, and this port besides 80 and 443 (homepages are then read over http on it). */
  allow?: { loopback?: boolean; port?: number };
  /** Held around each request: at most one request per host at a time (lib/about/run.ts). */
  hostGate?: (host: string) => Promise<() => void>;
  /**
   * fetchPageAt and fetchXmlAt: whether robots.txt lets us read this address, in place of the
   * check of "/" alone. lib/leaders reads robots.txt once per site and checks each page's own path
   * (robotsAllowsPath), which is stricter: a Disallow of "/" still refuses every page.
   */
  robotsCheck?: (url: URL) => Promise<boolean>;
  /** Refuse a redirect to another registrable domain (lib/logo.ts: a company's icon comes from its own site only). */
  sameSite?: boolean;
}

/** A refusal for safety (a private address, a bad port or scheme, a redirect elsewhere): never retried sooner than any other failure. */
export class Refused extends Error {}

export type Page =
  | { ok: true; url: string; host: string; status: number; html: string; truncated: boolean }
  | { ok: false; kind: "skipped" | "failed"; reason: string };

/** RN_ABOUT_TEST_PORT, read only on a test server (RN_SCAN_TEST=1). */
export function testAllowance(): FetchOpts["allow"] | undefined {
  if (process.env.RN_SCAN_TEST !== "1") return undefined;
  const port = Number.parseInt(process.env.RN_ABOUT_TEST_PORT ?? "", 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? { loopback: true, port } : undefined;
}

/* ---------- addresses ---------- */

function v4Parts(ip: string): number[] | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  const n = p.map((x) => (/^\d{1,3}$/.test(x) ? Number(x) : NaN));
  return n.every((x) => x >= 0 && x <= 255) ? n : null;
}
const inV4 = (n: number[], base: string, bits: number) => {
  const b = v4Parts(base)!;
  const a = ((n[0] << 24) | (n[1] << 16) | (n[2] << 8) | n[3]) >>> 0;
  const c = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (a & mask) === (c & mask);
};
/** IPv4 ranges never fetched: this network, private, CGNAT, loopback, link-local (metadata), IETF, test nets, benchmarking, multicast, reserved, broadcast. */
const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
];

/** Eight 16-bit groups of an IPv6 address (with an IPv4 tail read in), or null. */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const n = v4Parts(v4[1]);
    if (!n) return null;
    s = s.slice(0, -v4[1].length) + `${((n[0] << 8) | n[1]).toString(16)}:${((n[2] << 8) | n[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array(fill).fill("0"), ...tail];
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

/** Whether an address may be fetched. `loopback` (tests only) lets 127.0.0.0/8 and ::1 through. */
export function addressAllowed(ip: string, loopback = false): boolean {
  const n4 = v4Parts(ip);
  if (n4) {
    if (loopback && n4[0] === 127) return true;
    return !V4_BLOCKED.some(([b, bits]) => inV4(n4, b, bits));
  }
  const g = v6Groups(ip);
  if (!g) return false;
  const zeroTo = (k: number) => g.slice(0, k).every((x) => x === 0);
  const embedded = () => [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
  if (zeroTo(7) && g[7] === 1) return loopback; // ::1
  if (zeroTo(8)) return false; // ::
  if (zeroTo(5) && g[5] === 0xffff) return addressAllowed(embedded().join("."), loopback); // ::ffff:a.b.c.d
  if (zeroTo(6)) return false; // ::a.b.c.d (deprecated IPv4-compatible)
  if (g[0] === 0x64 && g[1] === 0xff9b) return addressAllowed(embedded().join("."), loopback); // NAT64
  if (g[0] === 0x2002) return addressAllowed([g[1] >> 8, g[1] & 255, g[2] >> 8, g[2] & 255].join("."), loopback); // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return false; // link-local, old site-local
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x0100 && zeroTo(4)) return false; // discard
  if (g[0] === 0x2001 && g[1] < 0x200) return false; // 2001::/23 IETF (Teredo and others)
  return true;
}

/* ---------- host names ---------- */

const TWO_PART = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "ltd.uk", "plc.uk", "me.uk", "com.au", "net.au", "org.au", "co.nz", "org.nz", "co.jp", "ne.jp", "or.jp",
  "com.br", "com.mx", "com.ar", "com.co", "com.sg", "com.hk", "com.tw", "com.cn", "co.in", "co.za", "co.il", "co.kr", "com.tr", "com.my",
  "com.ph", "com.pk", "com.ng", "com.eg", "com.sa", "co.id", "co.th", "com.vn", "com.ua", "com.pl", "co.at", "com.es", "com.pe", "com.ec",
]);
/** The registrable part of a host name ("www.shop.acme.co.uk" is "acme.co.uk"). */
export function registrable(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const last2 = parts.slice(-2).join(".");
  return TWO_PART.has(last2) ? parts.slice(-3).join(".") : last2;
}
const PRIVATE_SUFFIX = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa|arpa|invalid|onion)$/i;
/** A name on the public internet: letters in the last label, not an address, not a local or internal name. */
export function publicName(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h.includes(".") || net.isIP(h.replace(/^\[|\]$/g, ""))) return false;
  if (PRIVATE_SUFFIX.test(h)) return false;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z][a-z0-9-]*[a-z0-9]$/.test(h) || /\.xn--[a-z0-9-]+$/.test(h);
}

/* ---------- one request ---------- */

interface Raw {
  status: number;
  type: string;
  location: string | null;
  body: string;
  /** The body's bytes as read (decompressed), for an image (fetchImageAt). */
  bytes: Buffer;
  truncated: boolean;
}

/** A lookup that resolves through `resolve`, refuses the name if any address is not allowed, and connects to one it checked. */
function safeLookup(resolve: (host: string) => Promise<string[]>, loopback: boolean): LookupFunction {
  return ((hostname: string, options: { all?: boolean; family?: number }, cb: (err: Error | null, a?: unknown, f?: number) => void) => {
    resolve(hostname).then(
      (addrs) => {
        if (!addrs.length) return cb(Object.assign(new Error(`no address for ${hostname}`), { code: "ENOTFOUND" }));
        const bad = addrs.find((a) => !addressAllowed(a, loopback));
        if (bad) return cb(new Refused("private address"));
        const list = addrs.map((address) => ({ address, family: net.isIPv6(address) ? 6 : 4 }));
        if (options?.all) cb(null, list);
        else cb(null, list[0].address, list[0].family);
      },
      (e) => cb(e instanceof Error ? e : new Error(String(e))),
    );
  }) as unknown as LookupFunction;
}

const systemResolve = async (host: string) => (await dnsLookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** The charset a response says it is in (header, else a <meta> near the top). */
function charsetOf(type: string, head: Buffer): string {
  const h = /charset\s*=\s*["']?([\w-]+)/i.exec(type)?.[1] ?? /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head.toString("latin1"))?.[1] ?? "utf-8";
  try {
    new TextDecoder(h);
    return h;
  } catch {
    return "utf-8";
  }
}

/** One GET of `url` (already checked): status, type and at most `max` bytes of the body, decompressed. */
function getOnce(url: URL, o: Required<Pick<FetchOpts, "timeoutMs">> & FetchOpts, max: number, wantBody: (status: number, type: string) => boolean): Promise<Raw> {
  const resolve = o.resolve ?? systemResolve;
  const lib = url.protocol === "https:" ? https : http;
  return new Promise<Raw>((done, fail) => {
    let settled = false;
    const finish = (err: Error | null, raw?: Raw) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) fail(err);
      else done(raw!);
    };
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: safeLookup(resolve, !!o.allow?.loopback),
        headers: {
          "User-Agent": ABOUT_UA,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en;q=1, *;q=0.5",
        },
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const type = String(res.headers["content-type"] ?? "").toLowerCase();
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        if (!wantBody(status, type)) {
          res.destroy();
          req.destroy();
          return finish(null, { status, type, location, body: "", bytes: Buffer.alloc(0), truncated: false });
        }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase().trim();
        let stream: NodeJS.ReadableStream = res;
        if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        const end = () => {
          const buf = Buffer.concat(chunks).subarray(0, max);
          let body: string;
          try {
            body = new TextDecoder(charsetOf(type, buf.subarray(0, 4096))).decode(buf);
          } catch {
            body = buf.toString("utf8");
          }
          finish(null, { status, type, location, body, bytes: buf, truncated });
        };
        stream.on("data", (c: Buffer) => {
          if (settled) return;
          chunks.push(c);
          size += c.length;
          if (size >= max) {
            truncated = true;
            end();
            res.destroy();
            req.destroy();
          }
        });
        stream.on("end", end);
        stream.on("error", (e: Error) => (chunks.length ? end() : finish(e)));
        res.on("error", (e: Error) => (chunks.length ? end() : finish(e)));
      },
    );
    const timer = setTimeout(() => {
      finish(new Error("timeout"));
      req.destroy();
    }, o.timeoutMs);
    req.on("error", (e) => finish(e));
    req.end();
  });
}

const portOk = (u: URL, allow: FetchOpts["allow"]) => {
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  return port === 80 || port === 443 || (!!allow?.port && port === allow.port);
};

/** Why a URL may not be fetched, or null. Literal addresses are checked here (no lookup runs for them). */
function urlProblem(u: URL, allow: FetchOpts["allow"]): string | null {
  if (u.protocol !== "http:" && u.protocol !== "https:") return "not http";
  if (u.username || u.password) return "credentials in link";
  if (!portOk(u, allow)) return "port not allowed";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !addressAllowed(host, !!allow?.loopback)) return "private address";
  if (!net.isIP(host) && !allow?.loopback && !publicName(host)) return "not a public host";
  return null;
}

/** "timeout", "tls", "dns" or "connection" for a network error. */
function netReason(e: unknown): string {
  if (e instanceof Refused) return e.message;
  const code = (e as NodeJS.ErrnoException)?.code ?? "";
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "timeout") return "timeout";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") return "no such host";
  if (/CERT|SSL|TLS|self.signed|unable to verify/i.test(code + msg)) return "tls error";
  if (code === "ECONNREFUSED") return "connection refused";
  if (code === "ECONNRESET" || code === "EPIPE") return "connection reset";
  return "connection failed";
}

/**
 * GET `start` and follow up to MAX_REDIRECTS redirects, each hop checked (scheme, port, host,
 * addresses). Cross-site hops only go to a public host name. Returns the last response.
 */
async function follow(start: URL, o: FetchOpts, max: number, kind: "html" | "robots" | "image"): Promise<{ raw: Raw; url: URL }> {
  const opts = { timeoutMs: o.timeoutMs ?? TIMEOUT_MS, ...o };
  let url = start;
  const site = registrable(start.hostname);
  for (let hop = 0; ; hop++) {
    const problem = urlProblem(url, o.allow);
    if (problem) throw new Refused(problem);
    const release = o.hostGate ? await o.hostGate(url.hostname) : () => {};
    let raw: Raw;
    try {
      raw = await getOnce(url, opts, max, (status, type) =>
        // A bot wall answers 403 or 503 with a page: read it, to tell a challenge from a plain refusal.
        ((status >= 200 && status < 300) || (kind === "html" && CHALLENGE_STATUS.has(status))) &&
        (kind === "robots" || (kind === "image" ? IMAGE_TYPE.test(type) : /text\/html|application\/xhtml\+xml/.test(type))),
      );
    } finally {
      release();
    }
    if (raw.status >= 300 && raw.status < 400 && raw.location) {
      if (hop >= MAX_REDIRECTS) throw new Refused("too many redirects");
      let next: URL;
      try {
        next = new URL(raw.location, url);
      } catch {
        throw new Refused("bad redirect");
      }
      next.hash = "";
      const bad = urlProblem(next, o.allow);
      if (bad) throw new Refused(bad);
      if (o.sameSite && registrable(next.hostname) !== site) throw new Refused("redirect to another site");
      if (registrable(next.hostname) !== site && !publicName(next.hostname) && !(o.allow?.loopback && !net.isIP(next.hostname))) throw new Refused("redirect to a non-public host");
      url = next;
      continue;
    }
    return { raw, url };
  }
}

/** Whether robots.txt lets our agent fetch "/": the group for merlin-about if there is one, else the one for *. */
export function robotsAllowsRoot(txt: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const line of txt.split(/\r?\n/)) {
    const m = /^\s*([a-z-]+)\s*:\s*(.*?)\s*(#.*)?$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2];
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "disallow" || key === "allow") cur.rules.push({ allow: key === "allow", path: val });
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && UA_TOKEN.startsWith(a.replace(/\/.*$/, ""))));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  // The longest rule that matches "/" wins; Allow wins a tie. An empty Disallow allows everything.
  const matches = (p: string) => p === "/" || p === "/*" || p === "/$" || p === "*";
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    if (!r.path || !matches(r.path)) continue;
    if (!best || r.path.length > best.len || (r.path.length === best.len && r.allow)) best = { allow: r.allow, len: r.path.length };
  }
  return !best || best.allow;
}

/** The rules of the robots.txt group for our agent: the one for merlin-about if there is one, else the one for * (as robotsAllowsRoot reads them). */
function robotsRules(txt: string): { allow: boolean; path: string }[] {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const line of txt.split(/\r?\n/)) {
    const m = /^\s*([a-z-]+)\s*:\s*(.*?)\s*(#.*)?$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2];
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "disallow" || key === "allow") cur.rules.push({ allow: key === "allow", path: val });
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && UA_TOKEN.startsWith(a.replace(/\/.*$/, ""))));
  return (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
}

/**
 * Whether robots.txt lets our agent fetch `path` (with its query): the longest rule that matches
 * the start of the path wins, Allow wins a tie, "*" matches anything and a final "$" the end. An
 * empty Disallow allows everything. A Disallow of "/" refuses every path no Allow names.
 */
export function robotsAllowsPath(txt: string, path: string): boolean {
  const p = path.startsWith("/") ? path : `/${path}`;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of robotsRules(txt)) {
    if (!r.path) continue;
    const end = r.path.endsWith("$");
    const body = (end ? r.path.slice(0, -1) : r.path)
      .split("*")
      .map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    if (!new RegExp(`^${body}${end ? "$" : ""}`).test(p)) continue;
    if (!best || r.path.length > best.len || (r.path.length === best.len && r.allow)) best = { allow: r.allow, len: r.path.length };
  }
  return !best || best.allow;
}

/**
 * A site's robots.txt, read once (lib/leaders checks each page's path against it). Null when there
 * is none or it can't be read, which allows everything, as robotsAllows does. A safety refusal (a
 * private address, a redirect elsewhere) is thrown.
 */
export async function fetchRobotsTxt(origin: URL, o: FetchOpts): Promise<string | null> {
  try {
    const { raw } = await follow(new URL("/robots.txt", origin), { ...o, timeoutMs: Math.min(o.timeoutMs ?? TIMEOUT_MS, TIMEOUT_MS) }, ROBOTS_MAX, "robots");
    if (raw.status < 200 || raw.status >= 300 || /text\/html/.test(raw.type)) return null;
    return raw.body;
  } catch (e) {
    if (e instanceof Refused) throw e;
    return null;
  }
}

/** Whether the site's robots.txt lets us read its homepage. A robots.txt that can't be read allows it. */
export async function robotsAllows(origin: URL, o: FetchOpts): Promise<boolean> {
  try {
    const { raw } = await follow(new URL("/robots.txt", origin), { ...o, timeoutMs: Math.min(o.timeoutMs ?? TIMEOUT_MS, TIMEOUT_MS) }, ROBOTS_MAX, "robots");
    if (raw.status < 200 || raw.status >= 300 || /text\/html/.test(raw.type)) return true;
    return robotsAllowsRoot(raw.body);
  } catch (e) {
    if (e instanceof Refused) throw e;
    return true;
  }
}

/** The address to start at for a website value: its host, over https (http on the test port). */
export function startUrl(domain: string, allow: FetchOpts["allow"]): URL | null {
  const host = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
  if (!host || /[^a-z0-9.-]/.test(host)) return null;
  try {
    return allow?.port ? new URL(`http://${host}:${allow.port}/`) : new URL(`https://${host}/`);
  } catch {
    return null;
  }
}

/**
 * One page by its full address (a company's careers page, lib/scan/sources/ats.ts), under the same
 * rules as fetchHomepage: robots.txt first, every hop checked, 8 seconds, 512 KB, html only.
 */
export async function fetchPageAt(address: string, opts: FetchOpts = {}): Promise<Page> {
  const o: FetchOpts = { ...opts, allow: opts.allow ?? testAllowance() };
  let start: URL;
  try {
    start = new URL(address);
  } catch {
    return { ok: false, kind: "skipped", reason: "bad address" };
  }
  start.hash = "";
  try {
    if (!(await (o.robotsCheck ? o.robotsCheck(start) : robotsAllows(start, o)))) return { ok: false, kind: "skipped", reason: "robots.txt disallows" };
    const { raw, url } = await follow(start, o, o.maxBytes ?? MAX_BYTES, "html");
    if (raw.status < 200 || raw.status >= 300) return { ok: false, kind: "failed", reason: `http ${raw.status}` };
    if (!/text\/html|application\/xhtml\+xml/.test(raw.type)) return { ok: false, kind: "skipped", reason: "not html" };
    return { ok: true, url: url.href, host: url.hostname, status: raw.status, html: raw.body, truncated: raw.truncated };
  } catch (e) {
    if (e instanceof Refused) return { ok: false, kind: "skipped", reason: e.message };
    return { ok: false, kind: "failed", reason: netReason(e) };
  }
}

/**
 * An XML file by its full address (a site's sitemap.xml, lib/leaders), under the same rules as
 * fetchPageAt: robots.txt first, every hop checked, 8 seconds, 512 KB. XML or plain text only.
 */
export async function fetchXmlAt(address: string, opts: FetchOpts = {}): Promise<{ ok: true; url: string; host: string; body: string } | { ok: false; kind: "skipped" | "failed"; reason: string }> {
  const o: FetchOpts = { ...opts, allow: opts.allow ?? testAllowance() };
  let start: URL;
  try {
    start = new URL(address);
  } catch {
    return { ok: false, kind: "skipped", reason: "bad address" };
  }
  start.hash = "";
  try {
    if (!(await (o.robotsCheck ? o.robotsCheck(start) : robotsAllows(start, o)))) return { ok: false, kind: "skipped", reason: "robots.txt disallows" };
    const { raw, url } = await follow(start, o, o.maxBytes ?? MAX_BYTES, "robots");
    if (raw.status < 200 || raw.status >= 300) return { ok: false, kind: "failed", reason: `http ${raw.status}` };
    if (!/xml|text\/plain/.test(raw.type)) return { ok: false, kind: "skipped", reason: "not xml" };
    return { ok: true, url: url.href, host: url.hostname, body: raw.body };
  } catch (e) {
    if (e instanceof Refused) return { ok: false, kind: "skipped", reason: e.message };
    return { ok: false, kind: "failed", reason: netReason(e) };
  }
}

/**
 * A small JSON file by its full address (a site's web app manifest, lib/logo.ts), under the same
 * rules as fetchXmlAt: robots.txt first (or the caller's robotsCheck), every hop checked, the
 * timeout, at most `maxBytes` (64 KB unless given). JSON, a manifest or plain text only; the body
 * is parsed here and anything that isn't JSON is a skip.
 */
export async function fetchJsonAt(address: string, opts: FetchOpts = {}): Promise<{ ok: true; url: string; json: unknown } | { ok: false; kind: "skipped" | "failed"; reason: string }> {
  const o: FetchOpts = { ...opts, allow: opts.allow ?? testAllowance() };
  let start: URL;
  try {
    start = new URL(address);
  } catch {
    return { ok: false, kind: "skipped", reason: "bad address" };
  }
  start.hash = "";
  try {
    if (!(await (o.robotsCheck ? o.robotsCheck(start) : robotsAllows(start, o)))) return { ok: false, kind: "skipped", reason: "robots.txt disallows" };
    const { raw, url } = await follow(start, o, o.maxBytes ?? ROBOTS_MAX, "robots");
    if (raw.status < 200 || raw.status >= 300) return { ok: false, kind: "failed", reason: `http ${raw.status}` };
    if (!/json|text\/plain/.test(raw.type) || raw.truncated) return { ok: false, kind: "skipped", reason: "not json" };
    try {
      return { ok: true, url: url.href, json: JSON.parse(raw.body.replace(/^﻿/, "")) };
    } catch {
      return { ok: false, kind: "skipped", reason: "not json" };
    }
  } catch (e) {
    if (e instanceof Refused) return { ok: false, kind: "skipped", reason: e.message };
    return { ok: false, kind: "failed", reason: netReason(e) };
  }
}

/** Raster image types fetchImageAt reads. No SVG: it can carry script. */
const IMAGE_TYPE = /^\s*image\/(png|x-icon|vnd\.microsoft\.icon|ico|gif|jpeg|webp)\s*(;|$)/;

/**
 * An image by its full address (a company's icon, lib/logo.ts), under the same rules as
 * fetchPageAt: every hop checked, the timeout, at most `maxBytes`. Raster images only (PNG, ICO,
 * GIF, JPEG, WebP); a larger body is refused, never cut. robots.txt is the caller's to check
 * (robotsCheck), since it reads it once for the site.
 */
export async function fetchImageAt(address: string, opts: FetchOpts = {}): Promise<{ ok: true; url: string; type: string; bytes: Buffer } | { ok: false; kind: "skipped" | "failed"; reason: string }> {
  const o: FetchOpts = { ...opts, allow: opts.allow ?? testAllowance() };
  const max = o.maxBytes ?? 100 * 1024;
  let start: URL;
  try {
    start = new URL(address);
  } catch {
    return { ok: false, kind: "skipped", reason: "bad address" };
  }
  start.hash = "";
  try {
    if (o.robotsCheck && !(await o.robotsCheck(start))) return { ok: false, kind: "skipped", reason: "robots.txt disallows" };
    // One byte past the cap tells a body that is too big from one that is exactly the cap.
    const { raw, url } = await follow(start, o, max + 1, "image");
    if (raw.status < 200 || raw.status >= 300) return { ok: false, kind: "failed", reason: `http ${raw.status}` };
    if (!IMAGE_TYPE.test(raw.type)) return { ok: false, kind: "skipped", reason: "not an image" };
    if (raw.truncated || raw.bytes.length > max) return { ok: false, kind: "skipped", reason: "too big" };
    if (!raw.bytes.length) return { ok: false, kind: "skipped", reason: "empty" };
    return { ok: true, url: url.href, type: raw.type.split(";")[0].trim(), bytes: raw.bytes };
  } catch (e) {
    if (e instanceof Refused) return { ok: false, kind: "skipped", reason: e.message };
    return { ok: false, kind: "failed", reason: netReason(e) };
  }
}

/**
 * The homepage of `domain`: robots.txt first, then the page, https first and plain http when
 * https can't connect. Safety refusals and robots are skips; network trouble and server errors
 * are failures (retried later).
 */
export async function fetchHomepage(domain: string, opts: FetchOpts = {}): Promise<Page> {
  const o: FetchOpts = { ...opts, allow: opts.allow ?? testAllowance() };
  const max = o.maxBytes ?? MAX_BYTES;
  const first = startUrl(domain, o.allow);
  if (!first) return { ok: false, kind: "skipped", reason: "bad website" };
  const tries = o.allow?.port ? [first] : [first, new URL(`http://${first.hostname}/`)];
  let lastErr: unknown = null;
  for (const start of tries) {
    try {
      if (!(await robotsAllows(start, o))) return { ok: false, kind: "skipped", reason: "robots.txt disallows" };
      const { raw, url } = await follow(start, o, max, "html");
      if (CHALLENGE_STATUS.has(raw.status) && raw.body && pageJunk(raw.body) === "bot challenge") return { ok: false, kind: "skipped", reason: "bot challenge" };
      if (raw.status === 401 || raw.status === 403) return { ok: false, kind: "skipped", reason: "access denied" };
      if (raw.status === 404 || raw.status === 410) return { ok: false, kind: "skipped", reason: "not found" };
      if (raw.status >= 300 && raw.status < 400) return { ok: false, kind: "skipped", reason: "redirect without a location" };
      if (raw.status < 200 || raw.status >= 300) return { ok: false, kind: "failed", reason: `http ${raw.status}` };
      if (!/text\/html|application\/xhtml\+xml/.test(raw.type)) return { ok: false, kind: "skipped", reason: "not html" };
      return { ok: true, url: url.href, host: url.hostname, status: raw.status, html: raw.body, truncated: raw.truncated };
    } catch (e) {
      if (e instanceof Refused) return { ok: false, kind: "skipped", reason: e.message };
      lastErr = e;
      // Plain http is only worth a try when https could not connect at all.
      const why = netReason(e);
      if (why === "timeout" || why === "no such host") break;
    }
  }
  return { ok: false, kind: "failed", reason: netReason(lastErr) };
}
