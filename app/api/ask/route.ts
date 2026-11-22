/**
 * Ask Merlin's server side (BUILD_PLAN F4).
 *
 *   GET   { ui2, ai }: RN_UI2 as set ("off" by default, "optin", "on"), and whether the AI path is on
 *         (RN_AI_DRAFTS=1). The rules path needs nothing from here: it runs in the browser (lib/ask.ts).
 *   POST  the AI path. Not built in Stage 1: it answers { off: true } and the app keeps the rules'
 *         plan. When built, it reads the member's consent (State.aiDrafts) and allowance
 *         (lib/proposals/aiUsage.ts), and returns its plan through cleanAskPlan, as the rules do.
 *
 * Nothing here reads or writes member data.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ui2 = () => {
  const v = String(process.env.RN_UI2 ?? "off").trim().toLowerCase();
  return v === "on" || v === "optin" ? v : "off";
};

export async function GET() {
  return NextResponse.json({ ui2: ui2(), ai: process.env.RN_AI_DRAFTS === "1" }, { headers: { "cache-control": "no-store" } });
}

export async function POST() {
  return NextResponse.json({ off: true }, { headers: { "cache-control": "no-store" } });
}
