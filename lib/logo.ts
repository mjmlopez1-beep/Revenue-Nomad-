/**
 * GET /api/logo/<public company id>: a company's logo, fetched here and sent as image bytes, so a
 * page can show the logo of a company that is locked for the member without its domain in the
 * page (an icon service's address carries the domain). The company is looked up by its public id
 * (lib/table.ts logoDomain), its icon read from the same sources, in the same order, as the app's
 * CompanyLogo uses for a company it can name: Google's favicon service at 64px, then DuckDuckGo's.
 *
 * Only the image goes out: never a redirect, none of the icon service's headers, no name, no
 * domain. An unknown id, a company with no domain, an icon service that fails or sends only its
 * blank 16px stand-in: 404, and the page draws a plain tile. Answers are kept in memory (up to
 * CACHE_BYTES), misses for less time, and browsers keep an image for a day. No sign-in (it is only
 * an image), but LOGO_PER_MINUTE a minute per address, like the other routes.
 */
import { clientIp, limited } from "./rateLimit";
import { logoDomain } from "./table";

/** Logos one address may ask for in a minute: a long Companies list loads a few hundred. */
export const LOGO_PER_MINUTE = 600;
/** The largest icon kept or sent. A favicon is a few KB. */
const MAX_BYTES = 100 * 1024;
/** What the memory cache holds at most, and how many domains. */
const CACHE_BYTES = 8 * 1024 * 1024;
const CACHE_ENTRIES = 5000;
const HOUR = 60 * 60 * 1000;
/** How long a found icon and a miss are kept before the icon service is asked again. */
const HIT_MS = 24 * HOUR;
const MISS_MS = 6 * HOUR;
const TIMEOUT_MS = 4000;
/** Image types sent on. No SVG: it can carry script, and this answers from our own origin. */
const TYPES: Record<string, string> = {
  "image/png": "image/png",
  "image/x-icon": "image/x-icon",
  "image/vnd.microsoft.icon": "image/x-icon",
  "image/ico": "image/x-icon",
  "image/gif": "image/gif",
  "image/jpeg": "image/jpeg",
  "image/webp": "image/webp",
};

type Img = { body: ArrayBuffer; type: string };
const cache = new Map<string, { at: number; img: Img | null }>();
let cacheBytes = 0;
const inFlight = new Map<string, Promise<Img | null>>();

/** The icon services, in the order the app's CompanyLogo tries them. */
export const logoSources = (domain: string) => [
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
  `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
];

/** An image's width when its header says it (PNG, ICO, GIF), else null. */
export function imageWidth(b: Uint8Array): number | null {
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0;
  if (b.length >= 8 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return b[6] || 256;
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return b[6] | (b[7] << 8);
  return null;
}

/** One icon service's answer as an image we can send, or null (an error, not an image, too big, empty). */
async function fetchIcon(url: string): Promise<Img | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // The service may redirect to its own image host: followed here, never passed on to the page.
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { accept: "image/png,image/*;q=0.8" } });
    if (!r.ok) return null;
    const type = TYPES[(r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()];
    if (!type || Number(r.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
    const body = await r.arrayBuffer();
    if (!body.byteLength || body.byteLength > MAX_BYTES) return null;
    return { body, type };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function keep(domain: string, img: Img | null) {
  const old = cache.get(domain);
  if (old) {
    cacheBytes -= old.img?.body.byteLength ?? 0;
    cache.delete(domain);
  }
  cache.set(domain, { at: Date.now(), img });
  cacheBytes += img?.body.byteLength ?? 0;
  // Oldest first (a Map keeps the order things went in).
  for (const [k, v] of cache) {
    if (cacheBytes <= CACHE_BYTES && cache.size <= CACHE_ENTRIES) break;
    cache.delete(k);
    cacheBytes -= v.img?.body.byteLength ?? 0;
  }
}

/** A domain's icon: the first service's that is a real one (wider than the 16px blank stand-in), from memory when fresh. */
export async function logoImage(domain: string): Promise<Img | null> {
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < (hit.img ? HIT_MS : MISS_MS)) return hit.img;
  const running = inFlight.get(domain);
  if (running) return running;
  const p = (async () => {
    let img: Img | null = null;
    for (const url of logoSources(domain)) {
      const got = await fetchIcon(url);
      if (got && (imageWidth(new Uint8Array(got.body)) ?? 64) > 16) {
        img = got;
        break;
      }
    }
    keep(domain, img);
    return img;
  })().finally(() => inFlight.delete(domain));
  inFlight.set(domain, p);
  return p;
}

const NOT_FOUND = () => new Response(null, { status: 404, headers: { "cache-control": "public, max-age=3600" } });

/** The answer to GET /api/logo/<id>: the image, a 404, or a 429 past the per-address limit. */
export async function logoResponse(req: Request, publicId: string): Promise<Response> {
  if (limited(`logo:${clientIp(req)}`, LOGO_PER_MINUTE, 60_000)) return new Response(null, { status: 429, headers: { "retry-after": "60", "cache-control": "no-store" } });
  const domain = await logoDomain(publicId);
  const img = domain ? await logoImage(domain) : null;
  if (!img) return NOT_FOUND();
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
