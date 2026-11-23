import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { limited } from "@/lib/rateLimit";
import { memberForToken } from "@/lib/table";
import { EvidenceProblem, agreeToCaseAi, draftFromSeat, listEvidence, matchEvidence, removeCase, saveCase, setCard, suggestFor, tagPicker, toProof, writeCase } from "@/lib/evidence/store";

export const dynamic = "force-dynamic";

const COOKIE = "rn_table";
const MAX_BODY = 64 * 1024;
const NO_STORE = { "cache-control": "no-store" };
const SLOW = "That's a lot in one minute. Give it a moment, then try again.";
const origin = (req: NextRequest) =>
  process.env.RN_PUBLIC_URL?.replace(/\/$/, "") ||
  `${req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}`;
const err = (message: string, status = 400, upgrade?: string) => NextResponse.json({ error: message, ...(upgrade ? { upgrade } : {}) }, { status, headers: NO_STORE });

async function answer(work: () => Promise<unknown>) {
  try {
    return NextResponse.json(await work(), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof EvidenceProblem) return err(e.message, e.status, e.upgrade);
    throw e;
  }
}

/**
 * Evidence Bank (lib/evidence/store.ts): the member's own cases. Signed in only. Close for every
 * write, match and proof (the trial counts): on Free and Pro those answer 403 with `upgrade`, the
 * link the page turns into its upgrade screen. Nothing here costs a credit.
 *
 * GET                      EvidenceList: their cases, newest first, the fit tags, problems and motions,
 *                          whether Merlin's AI can write. Without Close: { canUse: false, plan, upgrade, kept }.
 * GET ?reveal=1            The same, with each client's name for the member's own eye (the eye button).
 * GET ?tags=1              The fit tag picker: categories with their groups and tags.
 * POST { op: "list", reveal? }                       As GET.
 * POST { op: "save", id?, ...fields }               A new case (no id) or changes: CaseView. Fields: title, clientNamed,
 *                          clientName, clientLabel, role, fn, start, end, hours, size, revenue, motion, industry, soldTo,
 *                          problems, workType, outcomes, workedWith, answers { problem, did, numbers }, text, showOnCard, status.
 * POST { op: "remove", id }
 * POST { op: "draftFromSeat", seatId }               A draft from a seat they held (its public id): CaseView.
 * POST { op: "match", companyId } | { op: "match", companyIds: [] }   MatchView, or { rows } for a list (up to 200).
 * POST { op: "toProof", companyId? | caseIds?, proposalId? }   { items }: hidden-client-safe, for a proposal's Proof part.
 * POST { op: "card", id?, on }                       Show a case on their Fractionals card, or not: { card }.
 * POST { op: "suggestTags", text }                   { tags }: the fit tags the words name (Merlin's rules, no AI).
 * POST { op: "write", id, paste?, agree? }           Merlin's AI writes the case (switch on, Close, agreed, AI usage left):
 *                          { case, kept }. 409 when off, 428 to agree first, 402 when the usage is used up.
 * POST { op: "agree_ai" }
 */
export const GET = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) return err("You're signed out. Sign in again to see your Evidence Bank.", 401);
  if (limited(`ev-get:${me.id}`, 120, 60_000)) return err(SLOW, 429);
  if (req.nextUrl.searchParams.get("tags") === "1") return answer(() => tagPicker(token, { origin: origin(req) }));
  return answer(() => listEvidence(token, { reveal: req.nextUrl.searchParams.get("reveal") === "1", origin: origin(req) }));
});

export const POST = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) return err("You're signed out. Sign in again to work on your Evidence Bank.", 401);
  if (limited(`ev-post:${me.id}`, 120, 60_000)) return err(SLOW, 429);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return err("That's too much to save at once. Shorten it, then try again.", 413);
  const text = await req.text();
  if (text.length > MAX_BODY) return err("That's too much to save at once. Shorten it, then try again.", 413);
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(text);
  } catch {
    return err("That didn't go through. Refresh the page and try again.");
  }
  if (!b || typeof b !== "object" || Array.isArray(b)) return err("That didn't go through. Refresh the page and try again.");
  const o = { origin: origin(req) };
  switch (b.op) {
    case "list":
      return answer(() => listEvidence(token, { reveal: b.reveal === true, ...o }));
    case "save":
      return answer(() => saveCase(token, b, o));
    case "remove":
      return answer(() => removeCase(token, b.id, o));
    case "draftFromSeat":
      return answer(() => draftFromSeat(token, b.seatId, o));
    case "match":
      return answer(() => matchEvidence(token, { companyId: b.companyId, companyIds: b.companyIds }, o));
    case "toProof":
      return answer(() => toProof(token, { companyId: b.companyId, caseIds: b.caseIds, proposalId: b.proposalId }, o));
    case "card":
      return answer(() => setCard(token, b.id, b.on, o));
    case "suggestTags":
      return answer(() => suggestFor(token, b.text, o));
    case "write":
      if (limited(`ev-write:${me.id}`, 12, 60 * 60_000)) return err("That's a lot of cases written at once. Give it a few minutes, then try again.", 429);
      return answer(() => writeCase(token, b.id, { paste: b.paste, agree: b.agree }, o));
    case "agree_ai":
      return answer(() => agreeToCaseAi(token));
    default:
      return err("That didn't go through. Refresh the page and try again.");
  }
});
