/**
 * Alerts in Slack and other tools, for the Integrations page (signed in with the app's cookie).
 *
 * GET                                        IntegrationsView (lib/notify/types.ts). Never a full webhook URL.
 * POST { op: "connect", field, url }         check the URL, send a test message, save it
 * POST { op: "test", field }                 send a test message to the URL on file
 * POST { op: "alerts", roles?, message?, seat? }  turn alerts on or off
 * POST { op: "remove", field }               forget the URL
 * `field` is "slack" or "webhook". Every answer is { message?, view } or { error }.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { ActionError } from "@/lib/table";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { connect, integrationsView, rememberOrigin, removeDest, sendTest, setAlerts, type Field } from "@/lib/notify";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };
const SIGNED_OUT = "You're signed out. Sign in again to set up alerts.";
const SLOW = "That's a lot of tries in a few minutes. Give it a moment, then try again.";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

export const GET = guarded(async (req: NextRequest) => {
  const view = await integrationsView(req.cookies.get(COOKIE)?.value ?? null);
  if (!view) return fail(SIGNED_OUT, 401);
  void rememberOrigin(publicOrigin(req)).catch(() => {});
  return NextResponse.json({ view }, { headers: noStore });
});

export const POST = guarded(async (req: NextRequest) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== publicOrigin(req) && origin !== req.nextUrl.origin) return fail("That didn't come from Merlin.", 403);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (!token) return fail(SIGNED_OUT, 401);
  const raw = await req.text();
  if (raw.length > 4096) return fail("That's too much to send.", 413);
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object") return fail("That didn't go through. Refresh the page and try again.");
  const field: Field = body.field === "webhook" ? "webhook" : "slack";
  // Each connect and test posts to another service: a few a minute per member is plenty.
  const key = token.slice(-16);
  try {
    void rememberOrigin(publicOrigin(req)).catch(() => {});
    switch (body.op) {
      case "connect":
        if (limited(`integ-connect:${key}`, 8, 10 * 60_000)) return fail(SLOW, 429);
        return NextResponse.json(await connect(token, field, body.url), { headers: noStore });
      case "test":
        if (limited(`integ-test:${key}`, 5, 10 * 60_000)) return fail(SLOW, 429);
        return NextResponse.json(await sendTest(token, field), { headers: noStore });
      case "alerts":
        return NextResponse.json(await setAlerts(token, { roles: body.roles, message: body.message, seat: body.seat }), { headers: noStore });
      case "remove":
        return NextResponse.json(await removeDest(token, field), { headers: noStore });
      default:
        return fail("That didn't go through. Refresh the page and try again.");
    }
  } catch (e) {
    if (e instanceof ActionError) return fail(e.message, /signed out/i.test(e.message) ? 401 : 400);
    throw e;
  }
});
