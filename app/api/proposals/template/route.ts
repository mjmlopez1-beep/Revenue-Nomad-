import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { limited } from "@/lib/rateLimit";
import { memberForToken } from "@/lib/table";
import { MineProblem, uploadTemplate } from "@/lib/proposals/mine";
import { TEMPLATE_MAX_BYTES } from "@/lib/proposals/templateParse";
import { LEARN_MAX_BYTES, learnTemplate } from "@/lib/proposals/learn";
import { proposals2On } from "@/lib/proposals/flag";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOKIE = "rn_table";
const NO_STORE = { "cache-control": "no-store" };
const err = (message: string, status = 400, upgrade?: string) => NextResponse.json({ error: message, ...(upgrade ? { upgrade } : {}) }, { status, headers: NO_STORE });

/**
 * POST /api/proposals/template?name=<file name>, the file as the body: one of the member's own
 * past proposals or SOWs (.docx, .pdf, .md, .txt, up to 5 MB), read into sections and kept as
 * theirs (lib/proposals/mine.ts). The file itself isn't kept. Answers the MyTemplate.
 */
export const POST = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) return err("You're signed out. Sign in again to add a template.", 401);
  if (limited(`prop-tpl:${me.id}`, 20, 60 * 60_000)) return err("That's 20 uploads in an hour, which is the limit. Try again later.", 429);
  // ?learn=1 (RN_PROPOSALS2): "Make a template from a proposal I've used". JSON { files: [{ name, data (base64) }], agree? }:
  // the proposal and an optional agreement, read by Merlin's AI into a preview. Nothing is saved here.
  if (req.nextUrl.searchParams.get("learn") === "1") {
    if (!proposals2On()) return err("That didn't go through. Refresh the page and try again.");
    if (limited(`prop-learn:${me.id}`, 10, 60 * 60_000)) return err("That's a lot of files in an hour. Try again later.", 429);
    if (Number(req.headers.get("content-length") ?? 0) > LEARN_MAX_BYTES * 2.8) return err("Those files are over 20 MB each. Upload smaller copies.", 413);
    let b: { files?: { name?: unknown; data?: unknown }[]; agree?: unknown };
    try {
      b = JSON.parse(await req.text());
    } catch {
      return err("That didn't go through. Try again.");
    }
    const files = (Array.isArray(b.files) ? b.files : []).slice(0, 2).map((f) => ({ name: String(f?.name ?? "").slice(0, 160), bytes: Buffer.from(String(f?.data ?? ""), "base64") }));
    try {
      return NextResponse.json(await learnTemplate(token, files, { agree: b.agree === true }), { headers: NO_STORE });
    } catch (e) {
      if (e instanceof MineProblem) return err(e.message, e.status, e.upgrade);
      throw e;
    }
  }
  if (Number(req.headers.get("content-length") ?? 0) > TEMPLATE_MAX_BYTES) return err("That file is over 5 MB. Upload a smaller copy, or just the text.", 413);
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > TEMPLATE_MAX_BYTES) return err("That file is over 5 MB. Upload a smaller copy, or just the text.", 413);
  if (!buf.length) return err("That file is empty.");
  try {
    return NextResponse.json(await uploadTemplate(token, req.nextUrl.searchParams.get("name") ?? "", buf), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof MineProblem) return err(e.message, e.status, e.upgrade);
    throw e;
  }
});
