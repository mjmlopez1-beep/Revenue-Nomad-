/**
 * Approve, then send (lib/send), for the signed-in member's own taps in the app only.
 *
 * GET                               SendView: their outbox, whether Google said yes to sending, the day's count
 * POST { op: "approve", draft }     Approve and send: queued for 30 seconds (Undo), a follow-up scheduled, or
 *                                   { grant } first: the URL that asks Google for the permission to send
 * POST { op: "cancel", id }         Undo, or Cancel a scheduled follow-up, a held note or an agent's draft
 * POST { op: "dismiss", id }        clear a closed note from the list
 * POST { op: "revoke" }             stop sending from their Gmail: the permission goes, here and at Google
 *
 * With RN_SEND off: GET answers { view: null } and every POST 404, so nothing changes anywhere. A request with a bearer token (the connector, any
 * agent) is refused: approving and sending are a signed-in tap in the app, never a tool. A POST must
 * come from Merlin's own pages (its Origin) with the app's header.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { ActionError } from "@/lib/table";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { approve, cancel, dismiss, sendOn, sendView, stopSending } from "@/lib/send";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };
const SIGNED_OUT = "You're signed out. Sign in again.";
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

export const GET = guarded(async (req: NextRequest) => {
  // Off: an empty answer (not a 404, so no page logs an error), and every page draws as before.
  if (!sendOn()) return NextResponse.json({ view: null }, { headers: noStore });
  if (req.headers.get("authorization")) return fail("Sending is in the Merlin app only.", 403);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (!token) return fail(SIGNED_OUT, 401);
  try {
    return NextResponse.json({ view: await sendView(token) }, { headers: noStore });
  } catch (e) {
    if (e instanceof ActionError) return fail(e.message, e.message === SIGNED_OUT ? 401 : 400);
    throw e;
  }
});

export const POST = guarded(async (req: NextRequest) => {
  if (!sendOn()) return fail("Not found.", 404);
  // An agent's bearer token never approves or sends: only the member, signed in, in the app.
  if (req.headers.get("authorization")) return fail("Sending is in the Merlin app only. Open Merlin and tap Approve and send.", 403);
  const origin = req.headers.get("origin");
  if (!origin || (origin !== publicOrigin(req) && origin !== req.nextUrl.origin)) return fail("That didn't come from Merlin.", 403);
  if (req.headers.get("x-rn-tap") !== "1") return fail("That didn't come from Merlin.", 403);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (!token) return fail(SIGNED_OUT, 401);
  const raw = await req.text();
  if (raw.length > 16_384) return fail("That note is too long to send.", 413);
  let body: { op?: unknown; id?: unknown; draft?: unknown } | null = null;
  try {
    body = JSON.parse(raw) as { op?: unknown; id?: unknown; draft?: unknown };
  } catch {
    body = null;
  }
  const key = token.slice(-16);
  try {
    switch (body?.op) {
      case "approve":
        if (limited(`send-approve:${key}`, 20, 60_000)) return fail("That's a lot of notes at once. Give it a minute.", 429);
        return NextResponse.json(await approve(token, body.draft as never), { headers: noStore });
      case "cancel":
        return NextResponse.json(await cancel(token, body.id), { headers: noStore });
      case "dismiss":
        return NextResponse.json({ view: await dismiss(token, body.id) }, { headers: noStore });
      case "revoke":
        return NextResponse.json(await stopSending(token), { headers: noStore });
      default:
        return fail("Unknown request.");
    }
  } catch (e) {
    if (e instanceof ActionError) return fail(e.message, e.message === SIGNED_OUT ? 401 : 400);
    throw e;
  }
});
