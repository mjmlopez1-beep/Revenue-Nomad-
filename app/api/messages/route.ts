import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { limited } from "@/lib/rateLimit";
import { memberForToken } from "@/lib/table";
import { MessageAiProblem, agreeMessageAi, draftReply, messageAiView } from "@/lib/messagesAi";

export const dynamic = "force-dynamic";

const COOKIE = "rn_table";
const MAX_BODY = 8 * 1024;
const NO_STORE = { "cache-control": "no-store" };
const SLOW = "That's a lot in one minute. Give it a moment, then try again.";
const err = (message: string, status = 400, link?: string) => NextResponse.json({ error: message, ...(link ? { link } : {}) }, { status, headers: NO_STORE });

async function answer(work: () => Promise<unknown>) {
  try {
    return NextResponse.json(await work(), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof MessageAiProblem) return err(e.message, e.status, e.link);
    throw e;
  }
}

/**
 * Drafting a message with Merlin's AI (lib/messagesAi.ts). Everything else about messages is an
 * action on /api/table (lib/messages.ts). Signed in only. Nothing here costs a credit; a draft
 * written by the AI counts against the member's AI usage, as a proposal's does.
 *
 * GET                                          MessageAiView: off, plan or on; agreed; used up.
 * POST { op: "agree" }                         They agree once: MessageAiView.
 * POST { op: "draft", conversationId, short?, agree? }   { text, ai }: a reply for their composer, never stored.
 *                                              409 off, 403 off Close, 428 agree first, 402 used up (with `link`).
 */
export const GET = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) return err("You're signed out. Sign in again.", 401);
  if (limited(`msai-get:${me.id}`, 60, 60_000)) return err(SLOW, 429);
  return answer(() => messageAiView(token));
});

export const POST = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) return err("You're signed out. Sign in again to draft a message.", 401);
  if (limited(`msai-post:${me.id}`, 20, 60_000)) return err(SLOW, 429);
  const text = await req.text();
  if (text.length > MAX_BODY) return err("That didn't go through. Refresh the page and try again.", 413);
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(text);
  } catch {
    return err("That didn't go through. Refresh the page and try again.");
  }
  if (!b || typeof b !== "object" || Array.isArray(b)) return err("That didn't go through. Refresh the page and try again.");
  if (b.op === "agree") return answer(() => agreeMessageAi(token));
  if (b.op === "draft") return answer(() => draftReply(token, { conversationId: b.conversationId, short: b.short, agree: b.agree }));
  return err("That didn't go through. Refresh the page and try again.");
});
