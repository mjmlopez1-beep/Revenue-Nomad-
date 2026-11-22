import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { clientIp, limited } from "@/lib/rateLimit";
import { ProposalProblem } from "@/lib/proposals/store";
import { copyFile, ownerFile, signerFile } from "@/lib/documents/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOKIE = "rn_table";
const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
const pdf = (bytes: Buffer, name: string, download: boolean) =>
  new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(bytes.length),
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${name.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "")}"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });

/**
 * A document's PDF, private (lib/documents/files.ts). One of three keys:
 *
 *   ?id=ID[&final=1]   its member, signed in: the uploaded file, or the final one once everyone signed
 *   ?s=<sign token>    a signer, with their own signing link: the uploaded file, to read and sign
 *   ?c=<copy token>    anyone with the finished document's link (both sides got it): the final file
 */
export const GET = guarded(async (req: NextRequest) => {
  const ip = clientIp(req);
  if (limited(`doc-file:${ip}`, 60, 60_000)) return err("That's a lot in one minute. Give it a moment, then try again.", 429);
  const q = req.nextUrl.searchParams;
  const download = q.get("download") === "1";
  try {
    if (q.get("c")) {
      const f = await copyFile(q.get("c")!.slice(0, 120));
      return f ? pdf(f.bytes, f.name, true) : err("This link doesn't work. Ask the sender for the signed copy.", 404);
    }
    if (q.get("s")) return pdf(await signerFile(q.get("s")!.slice(0, 120)), "document.pdf", false);
    const token = req.cookies.get(COOKIE)?.value ?? null;
    if (!token) return err("You're signed out. Sign in again to open it.", 401);
    const f = await ownerFile(token, q.get("id") ?? "", q.get("final") === "1");
    return pdf(f.bytes, f.name, download);
  } catch (e) {
    if (e instanceof ProposalProblem) return err(e.message, e.status);
    throw e;
  }
});
