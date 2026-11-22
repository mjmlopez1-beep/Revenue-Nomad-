import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { limited } from "@/lib/rateLimit";
import { memberForToken } from "@/lib/table";
import { ProposalProblem } from "@/lib/proposals/store";
import { DOC_MAX_BYTES } from "@/lib/documents/files";
import { readContract } from "@/lib/documents/smart";
import { copyDocument, deleteDocument, getDocument, myDocLink, sendDocument, updateDocument, uploadDocument, voidDocument } from "@/lib/documents/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
 * The member's own documents to sign (lib/documents/store.ts). Signed in only. They list with the
 * proposals (GET /api/proposals, `documents`).
 *
 * GET ?id=ID                                   DocumentRec
 * POST ?op=upload&name=<file name>, the PDF as the body (up to RN_DOC_MAX_MB, 15 MB)   DocumentRec, a draft
 * POST { op: "update", id, title?, fields?, signers?, ordered?, companyId?, companyName?, message? }   drafts only
 * POST { op: "send", id, message?, linkDays? }   linkDays: 14, 30 (the default), 60, 90, or 0 for no end date            Trial and Pro (403 with `upgrade` on Free)
 * POST { op: "void" | "delete" | "copy" | "mylink", id }
 * POST { op: "read", id }                      Close: where the signature lines are, who signs, a title and a note
 *                                              (lib/documents/smart.ts). Nothing is saved; the app saves what the member keeps.
 */
export const GET = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) return err("You're signed out. Sign in again to see your documents.", 401);
  if (limited(`doc-get:${me.id}`, 120, 60_000)) return err(SLOW, 429);
  return answer(() => getDocument(token, req.nextUrl.searchParams.get("id") ?? "", origin(req)));
});

export const POST = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) return err("You're signed out. Sign in again to work on documents.", 401);
  if (limited(`doc-post:${me.id}`, 120, 60_000)) return err(SLOW, 429);
  const o = origin(req);
  if (req.nextUrl.searchParams.get("op") === "upload") {
    if (limited(`doc-up:${me.id}`, 30, 60 * 60_000)) return err("That's 30 uploads in an hour, which is the limit. Try again later.", 429);
    const big = `That PDF is over ${Math.round(DOC_MAX_BYTES / 1024 / 1024)} MB. Upload a smaller copy.`;
    if (Number(req.headers.get("content-length") ?? 0) > DOC_MAX_BYTES) return err(big, 413);
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.length > DOC_MAX_BYTES) return err(big, 413);
    return answer(() => uploadDocument(token, req.nextUrl.searchParams.get("name") ?? "", buf, o));
  }
  const text = await req.text();
  if (text.length > MAX_BODY) return err("That's too much to save at once.", 413);
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(text);
  } catch {
    return err("That didn't go through. Refresh the page and try again.");
  }
  if (!b || typeof b !== "object") return err("That didn't go through. Refresh the page and try again.");
  const id = typeof b.id === "string" ? b.id : "";
  switch (b.op) {
    case "update":
      return answer(() => updateDocument(token, id, { title: b.title, fields: b.fields, signers: b.signers, ordered: b.ordered, companyId: b.companyId, companyName: b.companyName, message: b.message }, o));
    case "send":
      if (limited(`doc-send:${me.id}`, 20, 60 * 60_000)) return err("That's 20 sends in an hour, which is the limit. Try again later.", 429);
      return answer(() => sendDocument(token, id, { message: b.message, linkDays: b.linkDays }, o));
    case "void":
      return answer(() => voidDocument(token, id, o));
    case "delete":
      return answer(async () => (await deleteDocument(token, id), { ok: true }));
    case "copy":
      return answer(() => copyDocument(token, id, o));
    case "read":
      if (limited(`doc-read:${me.id}`, 30, 60 * 60_000)) return err("That's a lot of contracts read in an hour. Try again later.", 429);
      return answer(() => readContract(token, id, o));
    case "mylink":
      return answer(() => myDocLink(token, id, o));
    default:
      return err("That didn't go through. Refresh the page and try again.");
  }
});
