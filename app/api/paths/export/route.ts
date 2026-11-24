/**
 * "Bring in your LinkedIn data export" (lib/linkedin), for the signed-in member only (the app's cookie).
 * The archive is read in the member's browser (lib/linkedin/read.ts); only the derived payload of
 * each use they ticked comes here, never a file of theirs other than Connections.csv.
 *
 * GET                                   ExportView: what came in, roles to confirm as seats, companies to follow, proof
 * POST { op: "import", payload }        the payload (lib/linkedin/types.ts ExportPayload), checked field by field
 * POST { op: "remove" }                 delete everything the export brought in
 * POST { op: "seat", key, do }          a role offered as a seat: "added" (after the member's own Add) or "no" (Not a seat)
 * POST { op: "proof", id }              remove one recommendation kept as proof
 *
 * Every answer is { view } or { error }. { on: false } with RN_PATHS off. Nothing here spends a credit.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { ActionError } from "@/lib/table";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { exportView, importExport, removeExport, removeProof, seatOfferDone } from "@/lib/linkedin";
import { LIX_LIMITS } from "@/lib/linkedin/types";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };
const SIGNED_OUT = "You're signed out. Sign in again.";
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });
const TOO_BIG = "That is more than an export's worth. Pick the export again.";

export const GET = guarded(async (req: NextRequest) => {
  const v = await exportView(req.cookies.get(COOKIE)?.value ?? null);
  if (!v) return fail(SIGNED_OUT, 401);
  return NextResponse.json({ view: v }, { headers: noStore });
});

export const POST = guarded(async (req: NextRequest) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== publicOrigin(req) && origin !== req.nextUrl.origin) return fail("That didn't come from Merlin.", 403);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (!token) return fail(SIGNED_OUT, 401);
  if (Number(req.headers.get("content-length") ?? 0) > LIX_LIMITS.bodyBytes) return fail(TOO_BIG, 413);
  const raw = await req.text();
  if (raw.length > LIX_LIMITS.bodyBytes) return fail(TOO_BIG, 413);
  let body: { op?: unknown; payload?: unknown; key?: unknown; do?: unknown; id?: unknown } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const key = token.slice(-16);
  try {
    switch (body?.op) {
      case "import": {
        if (limited(`paths-import:${key}`, 6, 60 * 60_000)) return fail("That's a lot of uploads at once. Give it a few minutes.", 429);
        const r = await importExport(token, body.payload);
        return NextResponse.json({ view: r.answer, message: r.message }, { headers: noStore });
      }
      case "remove":
        return NextResponse.json({ view: await removeExport(token), message: "Removed everything your export brought in." }, { headers: noStore });
      case "seat":
        if (limited(`paths-export:${key}`, 240, 60 * 60_000)) return fail("That's a lot at once. Give it a few minutes.", 429);
        return NextResponse.json({ view: await seatOfferDone(token, body.key, body.do) }, { headers: noStore });
      case "proof":
        if (limited(`paths-export:${key}`, 240, 60 * 60_000)) return fail("That's a lot at once. Give it a few minutes.", 429);
        return NextResponse.json({ view: await removeProof(token, body.id), message: "Removed from Evidence Bank." }, { headers: noStore });
      default:
        return fail("That didn't go through. Refresh the page and try again.");
    }
  } catch (e) {
    if (e instanceof ActionError) return fail(e.message, /signed out/i.test(e.message) ? 401 : 400);
    throw e;
  }
});
