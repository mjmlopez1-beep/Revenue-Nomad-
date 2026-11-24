/**
 * Fathom (lib/calls/fathom.ts), a call recorder for the "A call ends" trigger, for the signed-in
 * member only (the app's cookie). Off (404) unless RN_FATHOM=1, except status, which says { on: false }.
 *
 * GET  status              FathomStatus: connected or not, the key's last four characters. Never the key.
 * POST connect { key }     check a pasted API key with one call to Fathom, then keep it sealed
 * POST disconnect          delete the key
 *
 * Every answer is JSON with no-store. Errors are { error, code } in the member's words.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { FathomProblem, connectFathom, disconnectFathom, fathomOn, fathomStatus } from "@/lib/calls/fathom";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };
const SIGNED_OUT = "You're signed out. Sign in again.";
const fail = (error: string, status = 400, code = "") => NextResponse.json({ error, ...(code ? { code } : {}) }, { status, headers: noStore });
type Ctx = { params: Promise<{ op: string }> };

async function answer(work: () => Promise<unknown>) {
  try {
    return NextResponse.json(await work(), { headers: noStore });
  } catch (e) {
    if (e instanceof FathomProblem) return fail(e.message, e.status, e.code);
    throw e;
  }
}

export const GET = guarded(async (req: NextRequest, ctx: Ctx) => {
  const { op } = await ctx.params;
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (op !== "status") return fail("Nothing here.", 404);
  const status = await fathomStatus(token);
  return status ? NextResponse.json({ status }, { headers: noStore }) : fail(SIGNED_OUT, 401, "signed_out");
});

export const POST = guarded(async (req: NextRequest, ctx: Ctx) => {
  const { op } = await ctx.params;
  if (!fathomOn()) return fail("Fathom isn't switched on for Merlin yet.", 404, "off");
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
    if (limited(`fathom-connect:${key}`, 8, 10 * 60_000)) return fail("That's a lot of tries in a few minutes. Give it a moment, then try again.", 429, "slow");
    return answer(() => connectFathom(token, body?.key));
  }
  if (op === "disconnect") return answer(() => disconnectFathom(token));
  return fail("Nothing here.", 404);
});
