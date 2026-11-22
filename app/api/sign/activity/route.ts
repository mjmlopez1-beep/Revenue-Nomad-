import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { clientIp, limited } from "@/lib/rateLimit";
import { READER_COOKIE, recordBeacon } from "@/lib/close/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const MAX_BODY = 8 * 1024;
const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: NO_STORE });
const SLOW = "That's a lot in one minute.";

/**
 * The signing page's reading beacons (lib/close/server.ts recordBeacon), signed out: the link's
 * token is the only key, and only a valid, live one is counted.
 *
 * POST { token, events: [{ t: "open" } | { t: "sec", id, label?, ms } | { t: "opt", id, label?, ms } | { t: "pick", id, label? } | { t: "addon", id, label?, on } | { t: "dl" }] }
 *
 * The reader is told apart by a random id in the READER_COOKIE cookie, set here (HttpOnly, only
 * sent to this path), never by IP address. The IP is used for the rate limits only, and not kept.
 * The body may come as text (navigator.sendBeacon) or JSON.
 */
export const POST = guarded(async (req: NextRequest) => {
  const ip = clientIp(req);
  if (limited(`act-ip:${ip}`, 120, 60_000)) return err(SLOW, 429);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return err("That's too much to send at once.", 413);
  const text = await req.text();
  if (text.length > MAX_BODY) return err("That's too much to send at once.", 413);
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(text);
  } catch {
    return err("That didn't go through.");
  }
  if (!b || typeof b !== "object" || Array.isArray(b)) return err("That didn't go through.");
  const token = typeof b.token === "string" ? b.token.slice(0, 120) : "";
  if (!token) return err("That didn't go through.");
  if (limited(`act-link:${token}`, 60, 60_000)) return err(SLOW, 429);
  const cookie = req.cookies.get(READER_COOKIE)?.value ?? null;
  if (cookie && limited(`act-dev:${cookie.slice(0, 43)}`, 40, 60_000)) return err(SLOW, 429);
  const r = await recordBeacon({ token, events: b.events, cookie, ua: (req.headers.get("user-agent") ?? "").slice(0, 300), memberToken: req.cookies.get("rn_table")?.value ?? null });
  const res = NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
  if (r.cookie)
    res.cookies.set(READER_COOKIE, r.cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
      path: "/api/sign/activity",
      maxAge: 180 * 86_400,
    });
  return res;
});
