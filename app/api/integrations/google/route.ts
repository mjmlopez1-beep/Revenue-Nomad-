/**
 * Your network (lib/google), for the signed-in member only (the app's cookie).
 *
 * GET                     NetworkView: the member's own network, or { on: false } with RN_GOOGLE off.
 * GET ?stats=1            admins: counts only (members connected, companies matched). No names, no emails.
 * POST { op: "sync" }     read Calendar and Contacts again now
 * POST { op: "disconnect" }   revoke at Google and delete everything (Gmail via Claude too)
 * POST { op: "drop-gmail" }   drop just Gmail and what it derived
 * POST { op: "forget-claude" } delete what the member's Claude saved
 * POST { op: "seen-found" }    the member saw the result of their first read (the connect moment shows once)
 * POST { op: "not-a-seat", company }  dismiss one seat guess for good (a company's public id)
 * POST { op: "mark", company | person, as }  "Not a relationship" (as: vendor, recruiter, oneoff, own,
 *                         other), "It is a relationship" (as: rel) on what Merlin set aside, or undo
 * Every answer is { view } or { error }. Tokens never leave the server.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { ActionError } from "@/lib/table";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { disconnectAll, dropGmail, forgetClaude, markNetwork, networkCounts, networkView, notASeat, refreshDue, sawFound, syncNow } from "@/lib/google";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };
const SIGNED_OUT = "You're signed out. Sign in again.";
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

export const GET = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (req.nextUrl.searchParams.get("stats")) {
    const counts = await networkCounts(token);
    return counts ? NextResponse.json({ counts }, { headers: noStore }) : fail("Only admins can see this.", 403);
  }
  const view = await networkView(token);
  if (!view) return fail(SIGNED_OUT, 401);
  // The daily sync for connected members rides on members' visits, in the background.
  if (view.on) void refreshDue().catch(() => {});
  return NextResponse.json({ view }, { headers: noStore });
});

export const POST = guarded(async (req: NextRequest) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== publicOrigin(req) && origin !== req.nextUrl.origin) return fail("That didn't come from Merlin.", 403);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (!token) return fail(SIGNED_OUT, 401);
  const raw = await req.text();
  if (raw.length > 1024) return fail("That's too much to send.", 413);
  let body: { op?: unknown; company?: unknown; person?: unknown; as?: unknown } | null = null;
  try {
    body = JSON.parse(raw) as { op?: unknown; company?: unknown; person?: unknown; as?: unknown };
  } catch {
    body = null;
  }
  const key = token.slice(-16);
  try {
    switch (body?.op) {
      case "sync":
        if (limited(`google-sync:${key}`, 3, 60 * 60_000)) return fail("It's reading your calendar already. Give it a few minutes.", 429);
        return NextResponse.json({ view: await syncNow(token) }, { headers: noStore });
      case "disconnect":
        return NextResponse.json({ view: await disconnectAll(token), message: "Disconnected. Everything Merlin kept about your network is deleted." }, { headers: noStore });
      case "drop-gmail":
        return NextResponse.json({ view: await dropGmail(token), message: "Gmail is off. What it found is deleted." }, { headers: noStore });
      case "forget-claude":
        return NextResponse.json({ view: await forgetClaude(token), message: "Deleted what Claude saved." }, { headers: noStore });
      case "seen-found":
        return NextResponse.json({ view: await sawFound(token) }, { headers: noStore });
      case "not-a-seat":
        return NextResponse.json({ view: await notASeat(token, body.company), message: "Got it. We won't suggest that one again." }, { headers: noStore });
      case "mark": {
        if (limited(`google-mark:${key}`, 120, 60 * 60_000)) return fail("That's a lot of changes at once. Give it a few minutes.", 429);
        const as = String(body.as ?? "");
        const message = as === "undo" ? "Undone." : as === "rel" ? "Got it. It stays with your relationships." : "Got it. It stays set aside, and Merlin remembers it on every read.";
        return NextResponse.json({ view: await markNetwork(token, body), message }, { headers: noStore });
      }
      default:
        return fail("That didn't go through. Refresh the page and try again.");
    }
  } catch (e) {
    if (e instanceof ActionError) return fail(e.message, /signed out/i.test(e.message) ? 401 : 400);
    throw e;
  }
});
