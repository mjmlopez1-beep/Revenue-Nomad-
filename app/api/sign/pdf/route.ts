import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { clientIp, limited } from "@/lib/rateLimit";
import { sealedPdf } from "@/lib/proposals/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const origin = (req: NextRequest) =>
  process.env.RN_PUBLIC_URL?.replace(/\/$/, "") ||
  `${req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}`;

/**
 * A signed proposal's sealed PDF (Close; lib/proposals/pdf.ts), with the signed copy's key:
 * GET ?c=<copy token>. Both sides got the link by email. Private: never cached or indexed.
 */
export const GET = guarded(async (req: NextRequest) => {
  if (limited(`sign-pdf:${clientIp(req)}`, 30, 60_000)) return NextResponse.json({ error: "That's a lot in one minute. Give it a moment, then try again." }, { status: 429 });
  const f = await sealedPdf(String(req.nextUrl.searchParams.get("c") ?? "").slice(0, 120), origin(req));
  if (!f) return NextResponse.json({ error: "This link doesn't work. Ask the sender for the signed copy." }, { status: 404, headers: { "cache-control": "no-store" } });
  return new NextResponse(new Uint8Array(f.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(f.bytes.length),
      "content-disposition": `attachment; filename="${f.name.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "")}"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
});
