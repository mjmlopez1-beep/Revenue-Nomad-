import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { limited } from "@/lib/rateLimit";
import { memberForToken } from "@/lib/table";
import { MineProblem, uploadTemplate } from "@/lib/proposals/mine";
import { TEMPLATE_MAX_BYTES } from "@/lib/proposals/templateParse";

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
