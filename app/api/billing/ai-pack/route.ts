/**
 * The AI usage pack: $10, once, for the signed-in member on Pro + Close or an active trial
 * (lib/billing/rules.ts canClose). The same checkout as the top-up.
 *
 * POST {}   { url } of Stripe Checkout for the pack, or { error, upgrade } with the Close upgrade's
 *           address (the plans, opened at proposals) for anyone else.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { ActionError } from "@/lib/table";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { AI_PACK_CLOSE, billingAction, upgradeLink } from "@/lib/billing/server";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };
const fail = (error: string, status = 400, upgrade?: string) => NextResponse.json({ error, ...(upgrade ? { upgrade } : {}) }, { status, headers: noStore });

export const POST = guarded(async (req: NextRequest) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== publicOrigin(req) && origin !== req.nextUrl.origin) return fail("That didn't come from Merlin.", 403);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (!token) return fail("You're signed out. Sign in again to manage your plan.", 401);
  if (limited(`billing:${token.slice(-16)}`, 20, 10 * 60_000)) return fail("That's a lot of tries in a few minutes. Give it a moment, then try again.", 429);
  try {
    return NextResponse.json(await billingAction(token, "aipack", {}, publicOrigin(req)), { headers: noStore });
  } catch (e) {
    if (e instanceof ActionError) return e.message === AI_PACK_CLOSE ? fail(e.message, 403, upgradeLink("proposals", publicOrigin(req))) : fail(e.message);
    throw e;
  }
});
