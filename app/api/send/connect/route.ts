/**
 * GET /api/send/connect?d=<note id>&back=<path>: the first Approve and send asks Google for the one
 * extra permission, gmail.send (lib/send startGrant): a one-time state (10 minutes) in memory and as
 * an httpOnly cookie on /api/integrations/google, where Google sends the member back (the same
 * callback as Connect Google). Then back to the page the note was approved on, and it sends.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { SEND_STATE_COOKIE, cleanBack, sendOn, startGrant } from "@/lib/send";
import { STATE_COOKIE_PATH } from "@/lib/google/config";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };

export const GET = guarded(async (req: NextRequest) => {
  const origin = publicOrigin(req);
  const back = cleanBack(req.nextUrl.searchParams.get("back"));
  if (!sendOn()) return NextResponse.redirect(`${origin}/`, { status: 303, headers: noStore });
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (!token) return NextResponse.redirect(`${origin}/`, { status: 303, headers: noStore });
  if (limited(`send-connect:${token.slice(-16)}`, 10, 10 * 60_000)) return NextResponse.redirect(`${origin}${back}#rn-send=failed`, { status: 303, headers: noStore });
  try {
    const out = await startGrant(token, req.nextUrl.searchParams.get("d"), back, origin);
    const res = NextResponse.redirect(out.url, { status: 302, headers: noStore });
    res.cookies.set(SEND_STATE_COOKIE, out.state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"), path: STATE_COOKIE_PATH, maxAge: 600 });
    return res;
  } catch {
    return NextResponse.redirect(`${origin}${back}#rn-send=failed`, { status: 303, headers: noStore });
  }
});
