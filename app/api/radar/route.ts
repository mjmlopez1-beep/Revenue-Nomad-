/**
 * The next-client radar, admins' part (signed in with the app's cookie).
 *
 * POST { op: "send" }   admins: "Send radar now" on Pilot metrics. Runs the daily radar at once,
 *                       today's run done or not (lib/radar runRadar with force). A signal still
 *                       never goes twice to a member, and a free member gets one radar a day.
 *                       Answers { message, run }.
 * The Radar page reads GET /api/table?radar=1.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { isAdmin, memberForToken } from "@/lib/table";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { runRadar } from "@/lib/radar";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

export const POST = guarded(async (req: NextRequest) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== publicOrigin(req) && origin !== req.nextUrl.origin) return fail("That didn't come from Merlin.", 403);
  const me = await memberForToken(req.cookies.get(COOKIE)?.value ?? null);
  if (!me) return fail("You're signed out. Sign in again.", 401);
  if (!isAdmin(me)) return fail("Only admins can send the radar.", 403);
  const body = (await req.json().catch(() => null)) as { op?: unknown } | null;
  if (body?.op !== "send") return fail("That didn't go through. Refresh the page and try again.");
  if (limited(`radar-send:${me.id}`, 5, 10 * 60_000)) return fail("That's a lot of sends in a few minutes. Give it a moment.", 429);
  const run = await runRadar({ force: true, origin: publicOrigin(req) });
  const message = !run.signals
    ? "Nothing new since the last radar, so nothing went out."
    : run.members
      ? `Sent to ${run.members} ${run.members === 1 ? "member" : "members"} (${run.emails} by email, ${run.slack} in Slack).`
      : `${run.signals} new ${run.signals === 1 ? "signal" : "signals"}, but no member with email or Slack matched one they hadn't had.`;
  return NextResponse.json({ message, run }, { headers: noStore });
});
