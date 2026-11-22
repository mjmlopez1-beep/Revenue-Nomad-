import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { clientIp, limited } from "@/lib/rateLimit";
import { CHECK_MAX_BYTES, checkCopy, sealPublicKey } from "@/lib/seal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: NO_STORE });

/**
 * Check a copy (/check, public, no account): POST the PDF's bytes as the body. The file is hashed
 * in memory and answered: "match" with who signed and when (nothing else), "changed" (it carries a
 * Merlin seal but was changed after), or "unknown". It is never stored, logged or sent anywhere.
 *
 * GET: Merlin's public seal key (PEM), for anyone who wants to check a record's signature.
 */
export const POST = guarded(async (req: NextRequest) => {
  if (limited(`check:${clientIp(req)}`, 20, 60_000)) return err("That's a lot of checks in one minute. Give it a moment, then try again.", 429);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > CHECK_MAX_BYTES) return err("That file is bigger than any PDF Merlin seals.", 413);
  // Read up to the cap and no further, whatever the request claims about its length.
  const parts: Uint8Array[] = [];
  let size = 0;
  const reader = req.body?.getReader();
  for (;;) {
    const r = reader ? await reader.read() : { done: true as const, value: undefined };
    if (r.done) break;
    size += r.value.length;
    if (size > CHECK_MAX_BYTES) {
      await reader!.cancel().catch(() => {});
      return err("That file is bigger than any PDF Merlin seals.", 413);
    }
    parts.push(r.value);
  }
  const bytes = new Uint8Array(Buffer.concat(parts));
  if (!bytes.length) return err("Drop a PDF to check it.");
  if (Buffer.from(bytes.subarray(0, 1024)).toString("latin1").indexOf("%PDF-") < 0) return err("That file isn't a PDF. Merlin seals PDFs only.");
  return NextResponse.json(await checkCopy(bytes), { headers: NO_STORE });
});

export const GET = guarded(async () => new NextResponse(sealPublicKey(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } }));
