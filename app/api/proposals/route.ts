import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { limited } from "@/lib/rateLimit";
import { memberForToken } from "@/lib/table";
import { ProposalProblem, createProposal, deleteProposal, duplicateProposal, getProposal, listProposals, sendProposal, updateProposal, voidProposal } from "@/lib/proposals/store";

export const dynamic = "force-dynamic";

const COOKIE = "rn_table";
const MAX_BODY = 256 * 1024;
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
    throw e;
  }
}

/**
 * The member's own proposals (lib/proposals/store.ts). Signed in only.
 *
 * GET              ProposalsView: every proposal of theirs, newest first, and what their plan allows.
 * GET ?id=ID       ProposalRec: one of theirs.
 * POST { op: "create", templateId?, companyId?, companyName?, title? }
 * POST { op: "update", id, title?, blocks?, fields?, setFields?, notes?, signerOnCall?, signer?, companyName? }
 *                  A change to what the client reads, after a version went out, makes a new version and voids the old link.
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
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return err("That's too much to save at once. Shorten it, then try again.", 413);
  const text = await req.text();
  if (text.length > MAX_BODY) return err("That's too much to save at once. Shorten it, then try again.", 413);
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(text);
  } catch {
    return err("That didn't go through. Refresh the page and try again.");
  }
  if (!b || typeof b !== "object") return err("That didn't go through. Refresh the page and try again.");
  const id = typeof b.id === "string" ? b.id : "";
  const o = origin(req);
  switch (b.op) {
    case "create":
      return answer(() => createProposal(token, { templateId: b.templateId, companyId: b.companyId, companyName: b.companyName, title: b.title }, o));
    case "update":
      return answer(() => updateProposal(token, id, { title: b.title, blocks: b.blocks, fields: b.fields, setFields: b.setFields, notes: b.notes, signerOnCall: b.signerOnCall, signer: b.signer, companyName: b.companyName, source: typeof b.source === "string" ? b.source : undefined }, o));
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
