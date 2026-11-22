/**
 * Plan and billing, for the signed-in member (the app's cookie). Only while billing is live
 * (RN_BILLING=1 with Stripe set up); otherwise every call answers that plans aren't open.
 *
 * POST { op: "checkout", interval: "month" | "year", tier?: "pro" | "close", code? }  { url } of Stripe Checkout for Pro or Close
 * POST { op: "tier", tier: "pro" | "close" }                 move the subscription between Pro and Close (prorated)
 * POST { op: "topup" }                                        { url } of Stripe Checkout for 50 credits
 * POST { op: "aipack" }                                       { url } of Stripe Checkout for the AI usage pack (also POST /api/billing/ai-pack)
 * POST { op: "portal" }                                       { url } of the Stripe Customer Portal
 * POST { op: "cancel" | "keep" }                              cancel at the period's end, or take it back
 * POST { op: "pause" | "resume" }                             pause Pro for a month, or end the pause
 * Every answer is { url } or { message }, or { error }.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { ActionError } from "@/lib/table";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { billingAction, type BillingOp } from "@/lib/billing/server";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };
const OPS = new Set<BillingOp>(["checkout", "topup", "portal", "cancel", "keep", "pause", "resume", "tier", "aipack"]);
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

export const POST = guarded(async (req: NextRequest) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== publicOrigin(req) && origin !== req.nextUrl.origin) return fail("That didn't come from Merlin.", 403);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (!token) return fail("You're signed out. Sign in again to manage your plan.", 401);
  const raw = await req.text();
  if (raw.length > 2048) return fail("That's too much to send.", 413);
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    body = null;
  }
  const op = body && typeof body.op === "string" ? (body.op as BillingOp) : null;
  if (!op || !OPS.has(op)) return fail("That didn't go through. Refresh the page and try again.");
  if (limited(`billing:${token.slice(-16)}`, 20, 10 * 60_000)) return fail("That's a lot of tries in a few minutes. Give it a moment, then try again.", 429);
  try {
    return NextResponse.json(await billingAction(token, op, { interval: body!.interval, code: body!.code, tier: body!.tier }, publicOrigin(req)), { headers: noStore });
  } catch (e) {
    if (e instanceof ActionError) return fail(e.message);
    throw e;
  }
});
