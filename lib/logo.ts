/**
 * GET /api/logo/<public company id>: a company's icon, fetched by our server from the company's
 * own website and sent from our own origin. No third-party icon or lookup service is asked, so no
 * outside service learns which companies a member looks at: the browser only ever talks to Merlin.
 *
 * Where the icon comes from, all on the company's own site (its website's host, the same
 * registrable domain; a redirect to another site is refused, and so is any address elsewhere):
 *  1. its homepage's <link rel="apple-touch-icon"> and <link rel="icon"> by their declared sizes,
 *  2. its web app manifest's icons[] (the manifest the homepage links, else /site.webmanifest or
 *     /manifest.json), read only when no link says GOOD_PX or more,
 *  3. the schema.org Organization "logo" in the homepage's JSON-LD,
 *  4. /apple-touch-icon.png when nothing large is on offer, and always /favicon.ico last.
 * Candidates from GOOD_PX to 256px come first, largest first. The first raster icon of at least
 * GOOD_PX is used; else the largest one read (at least 16px). A wordmark wider than MAX_ASPECT is
 * passed over (it would be squashed in a square tile). rel="mask-icon" is always SVG, so never read.
 * robots.txt is read first and every path checked against it. The homepage, the manifest and each
 * image are read under lib/about/fetch.ts's rules (public addresses only, every hop checked, a
 * timeout per request). Raster images only (PNG, ICO, GIF, JPEG, WebP; never SVG, which can carry
 * script), at most MAX_BYTES. At most ICON_TRIES images a company.
 *
 * The id is a company's public id (the app), or a landing page logo id ("lp_" and the preview
 * row's seed, lib/preview.ts previewLogoDomain), which names only a company the landing page may
 * name: never a kept-back open-role company or a blurred row's.
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
import { fetchHomepage, fetchImageAt, fetchJsonAt, fetchRobotsTxt, registrable, robotsAllowsPath, testAllowance, type FetchOpts } from "./about/fetch";
import { decodeEntities } from "./about/extract";
import { clientIp, limited } from "./rateLimit";
import { DATA_DIR, logoDomain } from "./table";

/** The landing page's logo ids start with this (lib/preview.ts PREVIEW_LOGO_PREFIX, kept here so the route needn't load the preview to tell). */
const PREVIEW_LOGO_PREFIX = "lp_";

/** Logos one address may ask for in a minute: a long Companies list loads a few hundred. */
export const LOGO_PER_MINUTE = 600;
/** The largest icon kept or sent. A favicon is a few KB; an apple-touch-icon tens. */
export const MAX_BYTES = 100 * 1024;
/** The homepage is read only for its <head>: this much is plenty. */
const PAGE_BYTES = 256 * 1024;
/** Images tried a company, at most (the best candidates found, then /favicon.ico). */
export const ICON_TRIES = 4;
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
/** The version of where icons are looked for: a miss kept under an older one is asked again (readDisk). 2: manifests, JSON-LD and /apple-touch-icon.png. */
const ICON_RULES = 2;
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

/** An image's width and height when its header says them (PNG, ICO, GIF, JPEG, WebP), else null. An ICO's largest entry. */
export function imageSize(b: Uint8Array): { w: number; h: number } | null {
  const u16 = (i: number) => b[i] | (b[i + 1] << 8);
  const be16 = (i: number) => (b[i] << 8) | b[i + 1];
  const be32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { w: be32(16), h: be32(20) };
  if (b.length >= 22 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) {
    // Every entry in the directory: an .ico often holds 16, 32 and 48 together.
    const n = Math.min(u16(4), 64);
    let best: { w: number; h: number } | null = null;
    for (let k = 0; k < n && 6 + 16 * k + 1 < b.length; k++) {
      const w = b[6 + 16 * k] || 256;
      const h = b[7 + 16 * k] || 256;
      if (!best || w > best.w) best = { w, h };
    }
    return best;
  }
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { w: u16(6), h: u16(8) };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    // JPEG: the first start-of-frame marker holds the size.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        i += 2;
        continue;
      }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: be16(i + 7), h: be16(i + 5) };
      i += 2 + be16(i + 2);
    }
    return null;
  }
  if (b.length >= 30 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") {
    const kind = String.fromCharCode(...b.subarray(12, 16));
    if (kind === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { w: u16(26) & 0x3fff, h: u16(28) & 0x3fff };
    if (kind === "VP8L" && b[20] === 0x2f) {
      const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
      return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (kind === "VP8X") return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  }
  return null;
}

/** An image's width when its header says it, else null (imageSize). */
export function imageWidth(b: Uint8Array): number | null {
  return imageSize(b)?.w ?? null;
}

/** An icon we could ask for: where, its declared size (0 when not said) and what said it. */
export type IconCandidate = { url: string; size: number; from: "touch" | "icon" | "manifest" | "ld" | "guess" | "favicon" };

/** The smallest icon worth stopping at: anything smaller, and the next candidate is tried too. */
export const GOOD_PX = 64;
/** A logo this much wider than tall (or taller than wide) is a wordmark, not an icon: it would be squashed in a square tile. */
const MAX_ASPECT = 1.5;

const attrOf = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? "").trim() : "";
};
/** The largest of a sizes list ("16x16 32x32", "any"): "any" (a vector) counts as 0 here, since a raster must say its size. */
const largest = (sizes: string) => Math.max(0, ...sizes.split(/\s+/).map((x) => Number.parseInt(x, 10) || 0));
/** An address that is plainly SVG or inline data: never an icon we send (SVG can carry script). */
const notRaster = (href: string, type = "") => !href || /^data:/i.test(href) || type.toLowerCase().includes("svg") || /\.svgz?(\?|#|$)/i.test(href);
const absolute = (href: string, base: string) => {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
};

/**
 * The icon <link>s in a homepage's markup, with their declared sizes: apple-touch-icon (180px when
 * it doesn't say) and rel="icon" in page order. SVG links (and rel="mask-icon", always SVG) are
 * left out, and so is inline data.
 */
export function iconCandidates(html: string, pageUrl: string): IconCandidate[] {
  const head = html.slice(0, PAGE_BYTES);
  const out: IconCandidate[] = [];
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = attrOf(tag, "rel").toLowerCase().split(/\s+/);
    const touch = rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed");
    if (!touch && !rel.includes("icon")) continue;
    const href = attrOf(tag, "href");
    if (notRaster(href, attrOf(tag, "type"))) continue;
    const url = absolute(href, pageUrl);
    if (!url) continue;
    const size = largest(attrOf(tag, "sizes"));
    out.push({ url, size: touch && !size ? 180 : size, from: touch ? "touch" : "icon" });
  }
  return out;
}

/**
 * The icon links in a homepage's markup, best first: apple-touch-icon (usually 180px), then icons
 * by their largest declared size, then the rest in page order. SVG links are left out.
 */
export function iconLinks(html: string, pageUrl: string): string[] {
  const found = iconCandidates(html, pageUrl).map((c, order) => ({ url: c.url, score: (c.from === "touch" ? 10_000 : 0) + c.size, order }));
  found.sort((a, b) => b.score - a.score || a.order - b.order);
  return [...new Set(found.map((x) => x.url))];
}

/** The web app manifest a homepage links (<link rel="manifest">), as a full address, else null. */
export function manifestLink(html: string, pageUrl: string): string | null {
  for (const m of html.slice(0, PAGE_BYTES).matchAll(/<link\b[^>]*>/gi)) {
    if (!attrOf(m[0], "rel").toLowerCase().split(/\s+/).includes("manifest")) continue;
    const href = attrOf(m[0], "href");
    if (href && !/^data:/i.test(href)) return absolute(href, pageUrl);
  }
  return null;
}

/**
 * A web app manifest's raster icons (icons[] with src, sizes, type, purpose), addresses resolved
 * against the manifest's own. SVG and "monochrome" icons (a one-color mask) are left out, and a
 * maskable-only icon counts a little smaller (it has padding round the mark).
 */
export function manifestIcons(json: unknown, manifestUrl: string): IconCandidate[] {
  const icons = json && typeof json === "object" ? (json as { icons?: unknown }).icons : null;
  if (!Array.isArray(icons)) return [];
  const out: IconCandidate[] = [];
  for (const x of icons.slice(0, 40)) {
    if (!x || typeof x !== "object") continue;
    const { src, sizes, type, purpose } = x as Record<string, unknown>;
    if (typeof src !== "string" || notRaster(src.trim(), typeof type === "string" ? type : "")) continue;
    const p = typeof purpose === "string" ? purpose.toLowerCase().split(/\s+/) : ["any"];
    if (!p.includes("any") && !p.includes("maskable")) continue;
    const url = absolute(src.trim(), manifestUrl);
    if (!url) continue;
    const size = largest(typeof sizes === "string" ? sizes : "");
    out.push({ url, size: p.includes("any") ? size : Math.floor(size * 0.8), from: "manifest" });
  }
  return out;
}

/**
 * The schema.org logo in a homepage's JSON-LD (<script type="application/ld+json">): an
 * Organization's (or a Corporation's, a business's, a brand's) "logo", a URL or an ImageObject's
 * url. SVG is left out; whether it is our own site's is checked by the caller.
 */
export function ldLogos(html: string, pageUrl: string): IconCandidate[] {
  const out: IconCandidate[] = [];
  const page = html.slice(0, 2 * PAGE_BYTES);
  const isOrg = (t: unknown): boolean => (Array.isArray(t) ? t.some(isOrg) : typeof t === "string" && /organization|corporation|business|brand|company/i.test(t));
  const urlOf = (v: unknown): string | null => {
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) return v.map(urlOf).find(Boolean) ?? null;
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return urlOf(o.url ?? o.contentUrl ?? null);
    }
    return null;
  };
  let seen = 0;
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== "object" || depth > 6 || ++seen > 400) return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    const o = v as Record<string, unknown>;
    if (isOrg(o["@type"]) && o.logo) {
      const href = urlOf(o.logo);
      const url = href && !notRaster(href) ? absolute(href, pageUrl) : null;
      if (url) out.push({ url, size: 0, from: "ld" });
    }
    for (const k of ["@graph", "publisher", "brand", "parentOrganization", "author", "mainEntity", "isPartOf", "about"]) if (k in o) walk(o[k], depth + 1);
  };
  for (const m of page.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()), 0);
    } catch {
      /* a broken block is no logo */
    }
  }
  return out;
}

/**
 * How good a candidate looks before it is read: declared sizes from GOOD_PX to 256 first (largest
 * first), then larger ones (they may be over MAX_BYTES), then the JSON-LD logo, then smaller and
 * unsized ones. The guesses and /favicon.ico come last.
 */
function rank(c: IconCandidate): number {
  if (c.from === "favicon") return -2;
  if (c.from === "guess") return -1;
  if (c.size >= GOOD_PX && c.size <= 256) return 3000 + c.size;
  if (c.size > 256) return 2000 + Math.max(0, 1000 - c.size / 10);
  if (c.from === "ld") return 1500;
  return c.size;
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

/** The biggest manifest read, and the manifests asked for when the homepage links none. */
const MANIFEST_BYTES = 64 * 1024;
const MANIFEST_GUESSES = ["/site.webmanifest", "/manifest.json"];

/**
 * Read the icon from the company's own website (see the file's note). Null when there is none we may use.
 * The first raster icon of at least GOOD_PX wins; else the largest one found of at least 16px.
 */
export async function fetchSiteIcon(domain: string, opts: FetchOpts = iconTest.opts ?? {}): Promise<Img | null> {
  const o: FetchOpts = { timeoutMs: TIMEOUT_MS, ...opts, allow: opts.allow ?? testAllowance(), sameSite: true };
  const page = await fetchHomepage(domain, { ...o, maxBytes: PAGE_BYTES });
  // robots.txt said no, or the site refused us for safety: leave it alone.
  if (!page.ok && page.reason === "robots.txt disallows") return null;
  const base = page.ok ? page.url : null;
  const origin = base ? new URL(base).origin : o.allow?.port ? `http://${domain}:${o.allow.port}` : `https://${domain}`;
  // robots.txt once per site, every path checked against it.
  const robots = new Map<string, Promise<string | null>>();
  const robotsCheck = async (u: URL) => {
    if (!robots.has(u.origin)) robots.set(u.origin, fetchRobotsTxt(u, o).catch(() => "User-agent: *\nDisallow: /"));
    const txt = await robots.get(u.origin)!;
    return txt == null || robotsAllowsPath(txt, `${u.pathname}${u.search}`);
  };
  const mine = (c: IconCandidate) => ownSite(c.url, domain);
  const found: IconCandidate[] = page.ok ? [...iconCandidates(page.html, page.url), ...ldLogos(page.html, page.url)].filter(mine) : [];
  // No link that says GOOD_PX or more: the site's web app manifest (the one it links, else the usual names).
  if (!found.some((c) => c.size >= GOOD_PX)) {
    const linked = page.ok ? manifestLink(page.html, page.url) : null;
    const manifests = linked ? [linked].filter((u) => ownSite(u, domain)) : MANIFEST_GUESSES.map((p) => `${origin}${p}`);
    for (const m of manifests) {
      const r = await fetchJsonAt(m, { ...o, maxBytes: MANIFEST_BYTES, robotsCheck });
      if (!r.ok) continue;
      found.push(...manifestIcons(r.json, r.url).filter(mine));
      break;
    }
  }
  const ordered = found.map((c, order) => ({ c, order })).sort((a, b) => rank(b.c) - rank(a.c) || a.order - b.order).map((x) => x.c);
  // Nothing large on offer: the address iOS asks every site for, then /favicon.ico, which is always tried.
  if (!ordered.some((c) => c.size >= GOOD_PX)) ordered.push({ url: `${origin}/apple-touch-icon.png`, size: 0, from: "guess" });
  const favicon = `${origin}/favicon.ico`;
  const urls = [...new Set(ordered.map((c) => c.url))].filter((u) => u !== favicon);
  const tries = [...urls.slice(0, ICON_TRIES - 1), favicon];
  let best: { img: Img; w: number } | null = null;
  for (const url of tries) {
    const r = await fetchImageAt(url, { ...o, maxBytes: MAX_BYTES, robotsCheck });
    if (!r.ok) continue;
    const type = TYPES[r.type.toLowerCase()];
    if (!type) continue;
    const size = imageSize(r.bytes);
    // A 1px spacer or a broken header is no icon, and a wide wordmark is no icon for a square tile.
    if (size && (size.w < 16 || size.h < 16)) continue;
    if (size && Math.max(size.w / size.h, size.h / size.w) > MAX_ASPECT) continue;
    const body = r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer;
    const w = size?.w ?? 16;
    if (w >= GOOD_PX) return { body, type };
    if (!best || w > best.w) best = { img: { body, type }, w };
  }
  return best?.img ?? null;
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
    const j = JSON.parse(await fs.readFile(fileOf(domain), "utf8")) as { domain?: string; at?: string; type?: string; b64?: string; rules?: number };
    if (j.domain !== domain || !j.at) return null;
    const at = Date.parse(j.at);
    if (!Number.isFinite(at)) return null;
    // A miss found under older rules is asked again now (the newer rules look in more places); a found icon stays.
    if (!j.b64 || !j.type || !Object.values(TYPES).includes(j.type)) return { at: (j.rules ?? 1) < ICON_RULES ? 0 : at, img: null };
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
    const json = JSON.stringify({ domain, at: new Date(kept.at).toISOString(), rules: ICON_RULES, ...(kept.img ? { type: kept.img.type, b64: Buffer.from(kept.img.body).toString("base64") } : {}) });
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
  const domain = publicId.startsWith(PREVIEW_LOGO_PREFIX) ? await (await import("./preview")).previewLogoDomain(publicId) : await logoDomain(publicId);
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
