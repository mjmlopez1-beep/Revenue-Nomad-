/**
 * GET /api/integrations/slack/callback: where Slack sends the member back after "Add to Slack".
 *
 * Checks the state (one time, 10 minutes, same browser, same member signed in), handles "Cancel"
 * (error=access_denied), swaps the code for the incoming webhook at oauth.v2.access, and saves it
 * like a pasted webhook, after a test message "Merlin is connected to #channel". Then back to
 * Integrations with ?slack=connected, denied or failed. The code, the webhook URL and the client
 * secret are never logged or sent to the browser. The bot token Slack returns is dropped.
 *
 * Owner setup, once (the Slack app "Merlin Alerts", owned by Revenue Nomad):
 *   1. api.slack.com/apps -> Merlin Alerts -> OAuth & Permissions:
 *      Redirect URLs: add https://table-pilot.up.railway.app/api/integrations/slack/callback, Save URLs.
 *      Scopes -> Bot Token Scopes: incoming-webhook only (remove anything else). No User Token Scopes.
 *   2. Manage Distribution: work through the checklist (Remove Hard Coded Information: tick it,
 *      nothing is hard coded; Use HTTPS For Your Redirect URLs: the URL above is https; the
 *      scope and redirect sections show done), then Activate Public Distribution. Without it only
 *      the owner's own workspace can install the app.
 *   3. Basic Information -> App Credentials: copy Client ID and Client Secret into Railway
 *      (the service's Variables) as SLACK_CLIENT_ID and SLACK_CLIENT_SECRET, and redeploy.
 *      Optional SLACK_REDIRECT_URL, when the public address isn't RN_PUBLIC_URL + this path.
 *   Without both variables the "Add to Slack" button doesn't show and pasting a webhook still works.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { publicOrigin } from "@/lib/mcp/http";
import { finishSlackApp } from "@/lib/notify";
import { STATE_COOKIE, STATE_COOKIE_PATH } from "@/lib/notify/slackApp";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };

export const GET = guarded(async (req: NextRequest) => {
  const origin = publicOrigin(req);
  const q = req.nextUrl.searchParams;
  const outcome = await finishSlackApp(
    req.cookies.get(COOKIE)?.value ?? null,
    { state: q.get("state"), code: q.get("code"), error: q.get("error") },
    req.cookies.get(STATE_COOKIE)?.value ?? null,
    origin,
  );
  const res = NextResponse.redirect(`${origin}/?p=integrations&slack=${outcome}`, { status: 303, headers: { ...noStore, "referrer-policy": "no-referrer" } });
  res.cookies.set(STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"), path: STATE_COOKIE_PATH, maxAge: 0 });
  return res;
});
