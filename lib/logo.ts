/**
 * GET /api/logo/<public company id>: a company's icon, fetched by our server from the company's
 * own website and sent from our own origin. No third-party icon or lookup service is asked, so no
 * outside service learns which companies a member looks at: the browser only ever talks to Merlin.
 *
 * Where the icon comes from, in order, all on the company's own site (its website's host, the same
 * registrable domain; a redirect to another site is refused):
 *  1. its homepage's <link rel="apple-touch-icon">, then <link rel="icon"> (largest size first),
 *  2. else /favicon.ico.
 * robots.txt is read first and every path checked against it. The homepage and each image are read
 * under lib/about/fetch.ts's rules (public addresses only, every hop checked, a timeout per
 * request). Raster images only (PNG, ICO, GIF, JPEG, WebP; never SVG, which can carry script), at
 * most MAX_BYTES. At most ICON_TRIES images a company.
 *
 * The answer is kept on the data volume (RN_DATA_DIR/icons, one small JSON file a domain, the image
 * base64) and in memory: a found icon for HIT_MS, a miss for MISS_MS, then the site is asked again.
 * At most FETCH_AT_ONCE companies' sites are read at a time; past QUEUE_MAX waiting, the answer is a
 * 204 (no logo) that is not kept, so the next page load tries again.
 *
 * RN_LOGO_LOOKUP=off: nothing is fetched. Icons already on the volume still show; everything else
 * is a 204 (no logo) and the page draws its lettered tile (the test servers run this way).
 *
 * Only the image goes out: never a redirect, none of the site's headers, no name, no domain. An
 * unknown id, a company with no website of its own (or one on a shared host such as a job board):
 * 204 (no logo, no body). No sign-in (it is only an image), but LOGO_PER_MINUTE a minute per address.
 */
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { fetchHomepage, fetchImageAt, fetchRobotsTxt, registrable, robotsAllowsPath, testAllowance, type FetchOpts } from "./about/fetch";
import { decodeEntities } from "./about/extract";
import { clientIp, limited } from "./rateLimit";
import { DATA_DIR, logoDomain } from "./table";

/** Logos one address may ask for in a minute: a long Companies list loads a few hundred. */
export const LOGO_PER_MINUTE = 600;
/** The largest icon kept or sent. A favicon is a few KB; an apple-touch-icon tens. */
export const MAX_BYTES = 100 * 1024;
/** The homepage is read only for its <head>: this much is plenty. */
const PAGE_BYTES = 256 * 1024;
/** Images tried a company, at most (the links found, then /favicon.ico). */
export const ICON_TRIES = 3;
/** Each request's time limit. */
const TIMEOUT_MS = 5000;
/** Companies whose sites are read at once, and how many may wait. */
const FETCH_AT_ONCE = 6;
const QUEUE_MAX = 60;
/** What the memory cache holds at most, and how many domains. */
const CACHE_BYTES = 8 * 1024 * 1024;
const CACHE_ENTRIES = 5000;
const DAY = 24 * 60 * 60 * 1000;
/** How long a found icon and a miss are kept before the site is asked again. */
export const HIT_MS = 30 * DAY;
export const MISS_MS = 7 * DAY;
/** Image types sent on, by what the site said. */
const TYPES: Record<string, string> = {
  "image/png": "image/png",
  "image/x-icon": "image/x-icon",
  "image/vnd.microsoft.icon": "image/x-icon",
  "image/ico": "image/x-icon",
  "image/gif": "image/gif",
  "image/jpeg": "image/jpeg",
  "image/webp": "image/webp",
};

export type Img = { body: ArrayBuffer; type: string };
type Kept = { at: number; img: Img | null };

/**
 * Tests: options for every site read (a fake resolver, loopback and a test port), and the folder
 * the icons are kept in. Without them, the system resolver and RN_DATA_DIR/icons.
 */
export const iconTest: { opts?: FetchOpts; dir?: string } = {};

const iconDir = () => iconTest.dir ?? path.join(DATA_DIR, "icons");
const fileOf = (domain: string) => path.join(iconDir(), `${createHash("sha256").update(domain).digest("hex").slice(0, 32)}.json`);
const lookupOff = () => process.env.RN_LOGO_LOOKUP === "off";

const memory = new Map<string, Kept>();
let memoryBytes = 0;
const inFlight = new Map<string, Promise<Img | null>>();
let running = 0;
const waiting: (() => void)[] = [];

/** An image's width when its header says it (PNG, ICO, GIF), else null. */
export function imageWidth(b: Uint8Array): number | null {
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0;
  if (b.length >= 8 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return b[6] || 256;
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return b[6] | (b[7] << 8);
  return null;
}

/**
 * The icon links in a homepage's markup, best first: apple-touch-icon (usually 180px), then icons
 * by their largest declared size, then the rest in page order. SVG links are left out.
 */
export function iconLinks(html: string, pageUrl: string): string[] {
  const head = html.slice(0, PAGE_BYTES);
  const found: { url: string; score: number; order: number }[] = [];
  const attr = (tag: string, name: string) => {
    const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
    return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? "").trim() : "";
  };
  let order = 0;
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = attr(tag, "rel").toLowerCase().split(/\s+/);
    const touch = rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed");
    if (!touch && !rel.includes("icon")) continue;
    const href = attr(tag, "href");
    const type = attr(tag, "type").toLowerCase();
    if (!href || /^data:/i.test(href) || type.includes("svg") || /\.svg(\?|#|$)/i.test(href)) continue;
    let url: string;
    try {
      url = new URL(href, pageUrl).href;
    } catch {
      continue;
    }
    const size = Math.max(0, ...attr(tag, "sizes").split(/\s+/).map((x) => Number.parseInt(x, 10) || 0));
    found.push({ url, score: (touch ? 10_000 : 0) + size, order: order++ });
  }
  found.sort((a, b) => b.score - a.score || a.order - b.order);
  return [...new Set(found.map((x) => x.url))];
}

/** The company's own site only: the same registrable domain as its website. */
const ownSite = (url: string, domain: string) => {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && registrable(u.hostname) === registrable(domain);
  } catch {
    return false;
  }
};

/** Read the icon from the company's own website (see the file's note). Null when there is none we may use. */
export async function fetchSiteIcon(domain: string, opts: FetchOpts = iconTest.opts ?? {}): Promise<Img | null> {
  const o: FetchOpts = { timeoutMs: TIMEOUT_MS, ...opts, allow: opts.allow ?? testAllowance(), sameSite: true };
  const page = await fetchHomepage(domain, { ...o, maxBytes: PAGE_BYTES });
  // robots.txt said no, or the site refused us for safety: leave it alone.
  if (!page.ok && page.reason === "robots.txt disallows") return null;
  const base = page.ok ? page.url : null;
  const origin = base ? new URL(base).origin : null;
  const links = page.ok ? iconLinks(page.html, page.url).filter((u) => ownSite(u, domain)) : [];
  // /favicon.ico on the site the homepage ended on, else on the domain itself.
  const fallback = origin ? `${origin}/favicon.ico` : o.allow?.port ? `http://${domain}:${o.allow.port}/favicon.ico` : `https://${domain}/favicon.ico`;
  const tries = [...new Set([...links, fallback])].slice(0, ICON_TRIES);
  // robots.txt once per site, every image path checked against it.
  const robots = new Map<string, Promise<string | null>>();
  const robotsCheck = async (u: URL) => {
    if (!robots.has(u.origin)) robots.set(u.origin, fetchRobotsTxt(u, o).catch(() => "User-agent: *\nDisallow: /"));
    const txt = await robots.get(u.origin)!;
    return txt == null || robotsAllowsPath(txt, `${u.pathname}${u.search}`);
  };
  for (const url of tries) {
    const r = await fetchImageAt(url, { ...o, maxBytes: MAX_BYTES, robotsCheck });
    if (!r.ok) continue;
    const type = TYPES[r.type.toLowerCase()];
    if (!type) continue;
    const width = imageWidth(r.bytes);
    // A 1px spacer or a broken header is no icon.
    if (width !== null && width < 16) continue;
    const body = r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer;
    return { body, type };
  }
  return null;
}

function remember(domain: string, kept: Kept) {
  const old = memory.get(domain);
  if (old) {
    memoryBytes -= old.img?.body.byteLength ?? 0;
    memory.delete(domain);
  }
  memory.set(domain, kept);
  memoryBytes += kept.img?.body.byteLength ?? 0;
  // Oldest first (a Map keeps the order things went in).
  for (const [k, v] of memory) {
    if (memoryBytes <= CACHE_BYTES && memory.size <= CACHE_ENTRIES) break;
    memory.delete(k);
    memoryBytes -= v.img?.body.byteLength ?? 0;
  }
}

async function readDisk(domain: string): Promise<Kept | null> {
  try {
    const j = JSON.parse(await fs.readFile(fileOf(domain), "utf8")) as { domain?: string; at?: string; type?: string; b64?: string };
    if (j.domain !== domain || !j.at) return null;
    const at = Date.parse(j.at);
    if (!Number.isFinite(at)) return null;
    if (!j.b64 || !j.type || !Object.values(TYPES).includes(j.type)) return { at, img: null };
    const buf = Buffer.from(j.b64, "base64");
    if (!buf.length || buf.length > MAX_BYTES) return { at, img: null };
    return { at, img: { body: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, type: j.type } };
  } catch {
    return null;
  }
}

async function writeDisk(domain: string, kept: Kept): Promise<void> {
  try {
    await fs.mkdir(iconDir(), { recursive: true });
    const file = fileOf(domain);
    const json = JSON.stringify({ domain, at: new Date(kept.at).toISOString(), ...(kept.img ? { type: kept.img.type, b64: Buffer.from(kept.img.body).toString("base64") } : {}) });
    await fs.writeFile(`${file}.tmp`, json, "utf8");
    await fs.rename(`${file}.tmp`, file);
  } catch {
    /* the cache is best-effort */
  }
}

const fresh = (k: Kept, nowMs: number) => nowMs - k.at < (k.img ? HIT_MS : MISS_MS);

/** Wait for one of the FETCH_AT_ONCE places. False when too many are waiting already. */
function slot(): Promise<boolean> {
  if (running < FETCH_AT_ONCE) {
    running++;
    return Promise.resolve(true);
  }
  if (waiting.length >= QUEUE_MAX) return Promise.resolve(false);
  return new Promise((done) => waiting.push(() => (running++, done(true))));
}
function release() {
  running--;
  waiting.shift()?.();
}

/** The answer when the queue was full: not kept, so it is tried again later. */
const BUSY = Symbol("busy");

/**
 * A domain's icon: from memory, else the data volume, else the company's own site (unless
 * RN_LOGO_LOOKUP=off), kept either way. An old answer is still used when the site can't be asked.
 */
export async function logoImage(domain: string, nowMs = Date.now()): Promise<Img | null | typeof BUSY> {
  const hit = memory.get(domain);
  if (hit && fresh(hit, nowMs)) return hit.img;
  const running0 = inFlight.get(domain);
  if (running0) return running0;
  const disk = hit ?? (await readDisk(domain));
  if (disk && (fresh(disk, nowMs) || lookupOff())) {
    remember(domain, disk);
    return disk.img;
  }
  if (lookupOff()) return null;
  if (!(await slot())) return disk?.img ?? BUSY;
  const p = (async () => {
    try {
      const img = await fetchSiteIcon(domain);
      // A site that sends nothing this time keeps the icon it had.
      const kept: Kept = { at: Date.now(), img: img ?? disk?.img ?? null };
      remember(domain, kept);
      await writeDisk(domain, kept);
      return kept.img;
    } finally {
      release();
    }
  })().finally(() => inFlight.delete(domain));
  inFlight.set(domain, p);
  return p;
}

/** Tests: forget what memory holds (the volume's copies stay). */
export function forgetIcons(): void {
  memory.clear();
  memoryBytes = 0;
}

/**
 * No logo: 204, no body. Most companies have none, and a 404 for each one fills the browser's
 * console with errors; the page draws the company's tile instead (CompanyLogo, app/ui/shared.tsx).
 * `keep`: the answer is final for an hour (a busy moment is not).
 */
const NO_LOGO = (keep: boolean) => new Response(null, { status: 204, headers: { "cache-control": keep ? "public, max-age=3600" : "no-store" } });

/** The answer to GET /api/logo/<id>: the image, a 204 for no logo, or a 429 past the per-address limit. */
export async function logoResponse(req: Request, publicId: string): Promise<Response> {
  if (limited(`logo:${clientIp(req)}`, LOGO_PER_MINUTE, 60_000)) return new Response(null, { status: 429, headers: { "retry-after": "60", "cache-control": "no-store" } });
  const domain = await logoDomain(publicId);
  const img = domain ? await logoImage(domain) : null;
  if (img === BUSY) return NO_LOGO(false);
  if (!img) return NO_LOGO(true);
  return new Response(img.body.slice(0), {
    status: 200,
    headers: {
      "content-type": img.type,
      "content-length": String(img.body.byteLength),
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
    },
  });
}
