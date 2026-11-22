/**
 * The AI usage pack ($10, once, on Pro + Close or the trial): what happens when its payment goes
 * through. For now a stub that records the event, once per payment ref, in State.billing.aiPacks.
 * At merge it hands the usage to the proposals branch's grantAiPack(memberKey, 4_700_000 micros, ref).
 * Pure: it changes the billing state it is given (the webhook calls it inside the table's write
 * queue, lib/billing/server.ts handleWebhook). No usage amount is said to members anywhere.
 */
import type { BillingState } from "./rules";

/**
 * An AI pack was paid for: `memberKey` (the member's id) and the payment's ref (the Checkout
 * session's). Idempotent on paymentRef: a repeat records nothing. True when it recorded.
 */
export function onAiPackPaid(b: BillingState, memberKey: string, paymentRef: string, nowMs = Date.now()): boolean {
  const list = (b.aiPacks ??= []);
  if (!memberKey || !paymentRef || list.some((x) => x.ref === paymentRef)) return false;
  list.push({ memberId: memberKey, ref: paymentRef, at: new Date(nowMs).toISOString() });
  return true;
}

/** AI packs a member bought so far. */
export const aiPacksBought = (b: BillingState | undefined, memberId: string) => (b?.aiPacks ?? []).filter((x) => x.memberId === memberId).length;
