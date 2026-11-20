/**
 * GET /api/integrations/google/start[?gmail=1][&from=onboard]: "Connect Google" (lib/google).
 *
 * For the signed-in member only: a one-time state (10 minutes) in memory and as an httpOnly cookie
 * on /api/integrations/google, then Google's consent page. Calendar and Contacts read-only, or, with
 * gmail=1 and only for a member on RN_GOOGLE_GMAIL_TESTERS, Gmail headers (gmail.metadata) added
 * to the same grant (include_granted_scopes). Off, signed out or not set up: back to the page.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { startConnect } from "@/lib/google";
import { STATE_COOKIE, STATE_COOKIE_PATH } from "@/lib/google/config";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };

export const GET = guarded(async (req: NextRequest) => {
  const origin = publicOrigin(req);
  const back = (q: string) => NextResponse.redirect(`${origin}/?p=network${q}`, { status: 303, headers: noStore });
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (!token) return NextResponse.redirect(`${origin}/`, { status: 303, headers: noStore });
  if (limited(`google-start:${token.slice(-16)}`, 10, 10 * 60_000)) return back("&google=failed");
  const kind = req.nextUrl.searchParams.get("gmail") === "1" ? "gmail" : "google";
  const out = await startConnect(token, origin, kind, req.nextUrl.searchParams.get("from") ?? "");
  if (!out.ok) return out.why === "off" ? NextResponse.redirect(`${origin}/`, { status: 303, headers: noStore }) : back(out.why === "signed_out" || out.why === "not_configured" ? "" : "&google=failed");
  const res = NextResponse.redirect(out.url, { status: 302, headers: noStore });
  res.cookies.set(STATE_COOKIE, out.state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"), path: STATE_COOKIE_PATH, maxAge: 600 });
  return res;
});
