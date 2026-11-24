/**
 * GET /api/logo/svc/<key>: the icon of a service Merlin connects to (Google, Slack, Claude,
 * ChatGPT, Cursor, Granola, LinkedIn, Stripe), fetched by our server from that service's own
 * website and sent from our own origin, exactly as a company's logo is (lib/logo.ts). No
 * third-party icon service is asked, and the browser only ever talks to Merlin.
 *
 * Only the keys in SERVICE_SITES are served, each from its fixed list of the service's own
 * domains, tried in order (Claude: claude.ai, then anthropic.com). Nothing in the request picks a
 * domain: any other key, a webhook or a contacts file included, is a 204 with no body, and the page
 * draws its own glyph (app/ui/ServiceIcon.tsx). The site is read under lib/logo.ts's rules
 * (fetchSiteIcon: robots.txt, the same registrable domain only, every redirect checked, raster only,
 * at most MAX_BYTES, apple-touch-icon and manifest icons preferred), kept on the data volume and in
 * memory with company logos (one cache a domain), and RN_LOGO_LOOKUP=off stops new reads here too.
 *
 * Tests only: on a test server (RN_SCAN_TEST=1) with RN_SVC_ICON_TEST=loopback and
 * RN_ABOUT_TEST_PORT=<port>, every service's domain is read from 127.0.0.1 on that port, over http:
 * a fake site that answers by the Host header (the QA screenshots). Without RN_SCAN_TEST=1 neither
 * variable is read.
 */
import { testAllowance, type FetchOpts } from "./about/fetch";
import { BUSY, LOGO_PER_MINUTE, NO_LOGO, iconResponse, logoImage } from "./logo";
import { clientIp, limited } from "./rateLimit";

/** Every service with an icon, and the service's own domains its icon is read from, in order. */
export const SERVICE_SITES = {
  google: ["google.com"],
  slack: ["slack.com"],
  claude: ["claude.ai", "anthropic.com"],
  "claude-code": ["claude.ai", "anthropic.com"],
  chatgpt: ["chatgpt.com", "openai.com"],
  cursor: ["cursor.com"],
  granola: ["granola.ai"],
  linkedin: ["linkedin.com"],
  stripe: ["stripe.com"],
} as const satisfies Record<string, readonly string[]>;
export type ServiceKey = keyof typeof SERVICE_SITES;
export const SERVICE_KEYS = Object.keys(SERVICE_SITES) as ServiceKey[];
export const isServiceKey = (k: string): k is ServiceKey => Object.prototype.hasOwnProperty.call(SERVICE_SITES, k);

/** How a service's site is read: the system resolver, or on a test server (see the file's note) the fake site on loopback. */
export function serviceFetchOpts(): FetchOpts | undefined {
  if (process.env.RN_SCAN_TEST !== "1" || process.env.RN_SVC_ICON_TEST !== "loopback") return undefined;
  const allow = testAllowance();
  return allow ? { resolve: async () => ["127.0.0.1"], allow } : undefined;
}

/** A service's icon from the first of its domains that has one. Null when none does; BUSY when the queue was full. */
export async function serviceIcon(key: ServiceKey, opts = serviceFetchOpts()) {
  let busy = false;
  for (const domain of SERVICE_SITES[key]) {
    const img = await logoImage(domain, Date.now(), opts);
    if (img === BUSY) busy = true;
    else if (img) return img;
  }
  return busy ? BUSY : null;
}

/** The answer to GET /api/logo/svc/<key>: the image, a 204 for no icon (or an unknown key), or a 429 past the per-address limit. */
export async function serviceIconResponse(req: Request, key: string): Promise<Response> {
  if (limited(`svclogo:${clientIp(req)}`, LOGO_PER_MINUTE, 60_000)) return new Response(null, { status: 429, headers: { "retry-after": "60", "cache-control": "no-store" } });
  if (!isServiceKey(key)) return NO_LOGO(true);
  const img = await serviceIcon(key);
  if (img === BUSY) return NO_LOGO(false);
  if (!img) return NO_LOGO(true);
  return iconResponse(img);
}
