/**
 * GET /api/integrations/slack/start: the "Add to Slack" button (lib/notify/slackApp.ts).
 *
 * For the signed-in member only: makes a one-time state (10 minutes), sets it as an httpOnly
 * cookie on /api/integrations/slack, and sends the browser to Slack's authorize page with the
 * `incoming-webhook` scope. Signed out, not set up, or not on the plan: back to Integrations.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { STATE_COOKIE, STATE_COOKIE_PATH, STATE_TTL_MS, startSlackApp } from "@/lib/notify/slackApp";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };

export const GET = guarded(async (req: NextRequest) => {
  const origin = publicOrigin(req);
  const back = (q: string) => NextResponse.redirect(`${origin}/?p=integrations${q}`, { status: 303, headers: noStore });
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (!token) return back("");
  if (limited(`slack-start:${token.slice(-16)}`, 10, 10 * 60_000)) return back("&slack=failed");
  const out = await startSlackApp(token, origin);
  if (!out.ok) return back(out.why === "signed_out" || out.why === "not_configured" ? "" : "&slack=failed");
  const res = NextResponse.redirect(out.url, { status: 302, headers: noStore });
  res.cookies.set(STATE_COOKIE, out.state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: STATE_COOKIE_PATH,
    maxAge: Math.floor(STATE_TTL_MS / 1000),
  });
  return res;
});
