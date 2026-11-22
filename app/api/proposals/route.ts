import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { limited } from "@/lib/rateLimit";
import { memberForToken } from "@/lib/table";
import { ProposalProblem, createProposal, deleteProposal, duplicateProposal, getProposal, linkProposal, listProposals, sendProposal, updateProposal, voidProposal } from "@/lib/proposals/store";
import { agreeToAi, draftWithClaude } from "@/lib/proposals/draft";
import { MineProblem, deleteTemplate, renameTemplate } from "@/lib/proposals/mine";
import { acceptChange, proposeChange, restoreVersion, versionsOf } from "@/lib/proposals/change";
import { addCompanyFor, siteName } from "@/lib/proposals/addCompany";

export const dynamic = "force-dynamic";

const COOKIE = "rn_table";
const MAX_BODY = 256 * 1024;
/** A draft from a call carries the transcript (lib/proposals/extract.ts MAX_TRANSCRIPT, about three hours of talk). */
const MAX_DRAFT_BODY = 900 * 1024;
const NO_STORE = { "cache-control": "no-store" };
const origin = (req: NextRequest) =>
  process.env.RN_PUBLIC_URL?.replace(/\/$/, "") ||
  `${req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}`;
const err = (message: string, status = 400, upgrade?: string) => NextResponse.json({ error: message, ...(upgrade ? { upgrade } : {}) }, { status, headers: NO_STORE });
const SLOW = "That's a lot in one minute. Give it a moment, then try again.";

async function answer(work: () => Promise<unknown>) {
  try {
    return NextResponse.json(await work(), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ProposalProblem) return err(e.message, e.status, e.upgrade);
    if (e instanceof MineProblem) return err(e.message, e.status, e.upgrade);
    throw e;
  }
}

/**
 * The member's own proposals (lib/proposals/store.ts). Signed in only.
 *
 * GET              ProposalsView: every proposal of theirs, newest first, and what their plan allows.
 * GET ?id=ID       ProposalRec: one of theirs.
 * POST { op: "create", templateId?, companyId?, companyName?, title?, fields?, notes?, signerOnCall?, signer? }
 *                  templateId: a library template, one of theirs ("mt_..."), or none. fields and notes: what the
 *                  member kept from a call read in their browser (lib/proposals/extract.ts), never the transcript.
 * POST { op: "draft", templateId?, companyId?, companyName?, transcript, callDate?, callWith?, agree? }
 *                  Draft the whole proposal with Claude (lib/proposals/draft.ts, RN_AI_DRAFTS). The transcript is
 *                  used for this request only and never kept. { proposal, toFix }. Metered against the member's AI
 *                  budget (lib/proposals/aiUsage.ts); with none left, 402 with the words and `upgrade` (the pack's link).
 * POST { op: "agree_ai" }   They agree a transcript may go to Anthropic's API to write a draft.
 * POST { op: "template_rename", id, title } | { op: "template_delete", id }   My templates (uploads: /api/proposals/template).
 * POST { op: "update", id, title?, blocks?, fields?, setFields?, notes?, signerOnCall?, signer?, companyName? }
 *                  A change to what the client reads, after a version went out, makes a new version and voids the old link.
 * POST { op: "change", id, instruction, agree? }   Change it by talking (lib/proposals/change.ts): Claude's proposed
 *                  sections, fields and the numbers check. Nothing is saved. Close, metered like a draft; 409 when it's off.
 * POST { op: "change_accept", id, changes, fields?, instruction? }   Saved as a new version; the one before is kept.
 * POST { op: "versions", id }  The kept versions' text, to compare.  { op: "version_restore", id, version }
 * POST { op: "site_name", website }   { website, name }: the website as its host, and the name its homepage gives (a short read).
 * POST { op: "add_company", id?, name, website }   A client not on Merlin yet: added through Add a company (its rules and
 *                  credits), or the one already there by that website or name, and the proposal linked to it.
 * POST { op: "duplicate" | "delete" | "void", id }
 * POST { op: "send", id, signer: { name, email, title? }, message? }   Trial and Pro (403 with `upgrade` on Free).
 */
export const GET = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) return err("You're signed out. Sign in again to see your proposals.", 401);
  if (limited(`prop-get:${me.id}`, 120, 60_000)) return err(SLOW, 429);
  const id = req.nextUrl.searchParams.get("id");
  return answer(() => (id ? getProposal(token, id, origin(req)) : listProposals(token, origin(req))));
});

export const POST = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) return err("You're signed out. Sign in again to work on proposals.", 401);
  if (limited(`prop-post:${me.id}`, 120, 60_000)) return err(SLOW, 429);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_DRAFT_BODY) return err("That's too much to send at once. Paste the part of the call about their business.", 413);
  const text = await req.text();
  if (text.length > MAX_DRAFT_BODY) return err("That's too much to send at once. Paste the part of the call about their business.", 413);
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(text);
  } catch {
    return err("That didn't go through. Refresh the page and try again.");
  }
  if (!b || typeof b !== "object") return err("That didn't go through. Refresh the page and try again.");
  const id = typeof b.id === "string" ? b.id : "";
  const o = origin(req);
  if (b.op !== "draft" && text.length > MAX_BODY) return err("That's too much to save at once. Shorten it, then try again.", 413);
  switch (b.op) {
    case "create":
      return answer(() =>
        createProposal(
          token,
          { templateId: b.templateId, companyId: b.companyId, companyName: b.companyName, title: b.title, fields: b.fields, notes: b.notes, signerOnCall: b.signerOnCall, ...(b.signer ? { signer: b.signer } : {}), ...(b.fields || b.notes ? { source: "discovery" } : {}) },
          o,
        ),
      );
    case "draft":
      // What a member may draft is their AI budget (lib/proposals/aiUsage.ts, in draftWithClaude). This only slows a burst of tries.
      if (limited(`prop-draft:${me.id}`, 12, 60 * 60_000)) return err("That's a lot of drafts at once. Give it a few minutes, then try again.", 429);
      return answer(() => draftWithClaude(token, { templateId: b.templateId, companyId: b.companyId, companyName: b.companyName, transcript: b.transcript, callDate: b.callDate, callWith: b.callWith, agree: b.agree }, o));
    case "change":
      if (limited(`prop-change:${me.id}`, 30, 60 * 60_000)) return err("That's a lot of changes at once. Give it a few minutes, then try again.", 429);
      return answer(() => proposeChange(token, id, { instruction: b.instruction, agree: b.agree }, o));
    case "change_accept":
      return answer(() => acceptChange(token, id, { changes: b.changes, fields: b.fields, instruction: b.instruction }, o));
    case "versions":
      return answer(() => versionsOf(token, id, o));
    case "version_restore":
      return answer(() => restoreVersion(token, id, b.version, o));
    case "site_name":
      if (limited(`prop-site:${me.id}`, 30, 60 * 60_000)) return err("That's a lot of websites in an hour. Type the name yourself.", 429);
      return answer(() => siteName(b.website));
    case "add_company":
      if (limited(`prop-addco:${me.id}`, 20, 60 * 60_000)) return err("That's a lot of companies added in an hour. Try again later.", 429);
      return answer(() => addCompanyFor(token, { proposalId: id || undefined, name: b.name, website: b.website }, o));
    case "agree_ai":
      return answer(async () => (await agreeToAi(token), { ok: true }));
    case "template_rename":
      return answer(() => renameTemplate(token, id, b.title));
    case "template_delete":
      return answer(async () => (await deleteTemplate(token, id), { ok: true }));
    case "update":
      return answer(() => updateProposal(token, id, { title: b.title, blocks: b.blocks, fields: b.fields, setFields: b.setFields, notes: b.notes, signerOnCall: b.signerOnCall, signer: b.signer, companyName: b.companyName, source: typeof b.source === "string" ? b.source : undefined }, o));
    case "link":
      // Not linked to a company yet: the one picked (companyId), or its exact name or website (name), as find_company finds it.
      return answer(() => linkProposal(token, id, { companyId: b.companyId, name: b.name }, o));
    case "duplicate":
      return answer(() => duplicateProposal(token, id, o));
    case "delete":
      return answer(async () => (await deleteProposal(token, id), { ok: true }));
    case "void":
      return answer(() => voidProposal(token, id, o));
    case "send":
      if (limited(`prop-send:${me.id}`, 20, 60 * 60_000)) return err("That's 20 sends in an hour, which is the limit. Try again later.", 429);
      return answer(() => sendProposal(token, id, { signer: b.signer, message: b.message }, o));
    default:
      return err("That didn't go through. Refresh the page and try again.");
  }
});
