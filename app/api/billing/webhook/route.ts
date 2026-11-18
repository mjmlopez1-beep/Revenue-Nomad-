/**
 * Stripe's webhook: POST /api/billing/webhook. Point the Stripe endpoint here with the events
 * checkout.session.completed, invoice.paid, customer.subscription.updated and
 * customer.subscription.deleted. The body is read raw: the Stripe-Signature header is checked
 * against it (STRIPE_WEBHOOK_SECRET) before anything is parsed. 400 for a bad or old signature,
 * 200 once the event is handled (or was already). Nothing about the event is logged.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { publicOrigin } from "@/lib/mcp/http";
import { handleWebhook } from "@/lib/billing/server";

export const dynamic = "force-dynamic";
/** Stripe's events are small. Anything this big isn't one. */
const MAX_BODY = 512 * 1024;

export const POST = guarded(async (req: NextRequest) => {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ received: false, error: "Too large." }, { status: 413 });
  const out = await handleWebhook(raw, req.headers.get("stripe-signature"), publicOrigin(req));
  return NextResponse.json(out.body, { status: out.status, headers: { "cache-control": "no-store" } });
});
