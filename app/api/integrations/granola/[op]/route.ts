/**
 * Granola (lib/granola), for the signed-in member only (the app's cookie). Off (404) unless RN_GRANOLA=1,
 * except status, which says { on: false }.
 *
 * GET  status                       GranolaStatus: connected or not, the key's last four characters, canDraft. Never the key.
 * POST connect { key }              check the key with one call to Granola, then keep it sealed
 * POST disconnect                   delete the key
 * GET  calls?company=<id>           recent calls (last 30 days) with anyone at that company's domain, newest first
 * GET  calls?email=<addr>           ... with that person
 * GET  calls?recent=1               ... any recent call
 *      &titles=1                    with each note's title (the member asked to see them)
 * GET  transcript?note=<not_id>     the picked call's transcript and attendees, for drafting (Close; the trial counts)
 *
 * Every answer is JSON with no-store. Errors are { error, code } in the member's words.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { GranolaProblem, connectGranola, disconnectGranola, granolaCalls, granolaStatus, transcriptForPicker } from "@/lib/granola";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };
const SIGNED_OUT = "You're signed out. Sign in again.";
const SLOW = "That's a lot of tries in a few minutes. Give it a moment, then try again.";
const fail = (error: string, status = 400, code = "") => NextResponse.json({ error, ...(code ? { code } : {}) }, { status, headers: noStore });
type Ctx = { params: Promise<{ op: string }> };

async function answer(work: () => Promise<unknown>) {
  try {
    return NextResponse.json(await work(), { headers: noStore });
  } catch (e) {
    if (e instanceof GranolaProblem) return fail(e.message, e.status, e.code);
    throw e;
  }
}

export const GET = guarded(async (req: NextRequest, ctx: Ctx) => {
  const { op } = await ctx.params;
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const q = req.nextUrl.searchParams;
  if (op === "status") {
    const status = await granolaStatus(token);
    return status ? NextResponse.json({ status }, { headers: noStore }) : fail(SIGNED_OUT, 401, "signed_out");
  }
  if (!token) return fail(SIGNED_OUT, 401, "signed_out");
  const key = token.slice(-16);
  if (op === "calls") {
    if (limited(`granola-calls:${key}`, 30, 10 * 60_000)) return fail(SLOW, 429, "slow");
    return answer(() => granolaCalls(token, { companyId: q.get("company") ?? undefined, email: q.get("email") ?? undefined, recent: q.get("recent") ?? undefined, titles: q.get("titles") ?? undefined }));
  }
  if (op === "transcript") {
    if (limited(`granola-transcript:${key}`, 20, 10 * 60_000)) return fail(SLOW, 429, "slow");
    return answer(() => transcriptForPicker(token, q.get("note"), { titles: q.get("titles") ?? undefined }));
  }
  return fail("Nothing here.", 404);
});

export const POST = guarded(async (req: NextRequest, ctx: Ctx) => {
  const { op } = await ctx.params;
  const origin = req.headers.get("origin");
  if (origin && origin !== publicOrigin(req) && origin !== req.nextUrl.origin) return fail("That didn't come from Merlin.", 403);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (!token) return fail(SIGNED_OUT, 401, "signed_out");
  const raw = await req.text();
  if (raw.length > 2048) return fail("That's too much to send.", 413);
  let body: { key?: unknown } = {};
  try {
    body = raw ? (JSON.parse(raw) as { key?: unknown }) : {};
  } catch {
    return fail("That didn't go through. Refresh the page and try again.");
  }
  const key = token.slice(-16);
  if (op === "connect") {
    if (limited(`granola-connect:${key}`, 8, 10 * 60_000)) return fail(SLOW, 429, "slow");
    return answer(() => connectGranola(token, body?.key));
  }
  if (op === "disconnect") return answer(() => disconnectGranola(token));
  return fail("Nothing here.", 404);
});
