/** Small in-memory fixed-window rate limiter (one server instance). */
const hits = new Map<string, { n: number; reset: number }>();

export function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return false;
  }
  h.n++;
  return h.n > max;
}

let loggedIpHeaders = 0;

/**
 * The client's address, as the host's proxy saw it. The client controls the start of
 * X-Forwarded-For (proxies append the address they saw), so it is read from the right:
 * RN_TRUSTED_PROXY_HOPS (default 1) entries from the end. When the host overwrites a
 * header with the real address (e.g. true-client-ip or cf-connecting-ip), name it in
 * RN_CLIENT_IP_HEADER and that header wins.
 *
 * To find out which header the platform controls, set RN_LOG_IP_HEADERS=1, send one
 * request with a forged "X-Forwarded-For: 1.2.3.4", and read the log (first 20 requests).
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  if (process.env.RN_LOG_IP_HEADERS === "1" && loggedIpHeaders < 20) {
    loggedIpHeaders++;
    console.log(
      "ip headers",
      JSON.stringify({
        "x-forwarded-for": h.get("x-forwarded-for"),
        "x-real-ip": h.get("x-real-ip"),
        "true-client-ip": h.get("true-client-ip"),
        "cf-connecting-ip": h.get("cf-connecting-ip"),
      }),
    );
  }
  const named = process.env.RN_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (named) {
    const v = h.get(named)?.split(",")[0].trim();
    if (v) return v;
  }
  const xff = (h.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (xff.length) {
    const hops = Math.max(1, Number(process.env.RN_TRUSTED_PROXY_HOPS ?? 1) || 1);
    return xff[Math.max(0, xff.length - hops)];
  }
  return h.get("x-real-ip")?.trim() || "local";
}
