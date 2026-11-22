/**
 * The AI usage pack ($10, once, on Pro + Close or the trial): what happens when its payment goes
 * through. It records the event, once per payment ref, in State.billing.aiPacks, and grants the
 * member the pack's Claude usage (lib/proposals/aiUsage.ts grantAiPack: PACK_MICROS, 4,700,000
 * micro-dollars, once per ref). Pure: it changes the billing state (and the usage state) it is given (the webhook calls it inside the table's write
 * queue, lib/billing/server.ts handleWebhook). No usage amount is said to members anywhere.
 */
import type { BillingState } from "./rules";
import type { State } from "../table";
import { PACK_MICROS, grantAiPackIn } from "../proposals/aiUsage";

/**
 * An AI pack was paid for: `memberKey` (the member's id) and the payment's ref (the Checkout
 * session's). Idempotent on paymentRef: a repeat records and grants nothing. True when it recorded.
 * `usage`: the state that holds the members' AI usage (the webhook passes the whole state), where
 * grantAiPack's PACK_MICROS go, once per paymentRef.
 */
export function onAiPackPaid(b: BillingState, memberKey: string, paymentRef: string, nowMs = Date.now(), usage?: State): boolean {
  const list = (b.aiPacks ??= []);
  if (!memberKey || !paymentRef || list.some((x) => x.ref === paymentRef)) return false;
  list.push({ memberId: memberKey, ref: paymentRef, at: new Date(nowMs).toISOString() });
  if (usage) grantAiPackIn(usage, memberKey, PACK_MICROS, paymentRef, nowMs);
  return true;
}

/** AI packs a member bought so far. */
export const aiPacksBought = (b: BillingState | undefined, memberId: string) => (b?.aiPacks ?? []).filter((x) => x.memberId === memberId).length;
