import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { applyScan, runScan } from "@/lib/table";
import { guarded, isDown } from "@/lib/apiGuard";

export const dynamic = "force-dynamic";
/** A scan reads several job boards. Give it room on hosts that cap request time. */
export const maxDuration = 300;

const origin = (req: NextRequest) =>
  process.env.RN_PUBLIC_URL?.replace(/\/$/, "") ||
  `${req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}`;

/**
 * POST with header x-cron-secret: RN_CRON_SECRET. Runs the weekly scan of open fractional GTM
 * roles now, waits for it, and returns what changed. Point a weekly cron at it. Without
 * RN_CRON_SECRET the endpoint is off.
 *
 * Tests only (RN_SCAN_TEST=1 on the server): a body of { roles, sources, now } is stored as
 * if a scan had found it, at the time `now`, and no job board is read.
 */
export const POST = guarded(async (req: NextRequest) => {
  const secret = process.env.RN_CRON_SECRET ?? "";
  const got = Buffer.from(req.headers.get("x-cron-secret") ?? "");
  const want = Buffer.from(secret);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (process.env.RN_SCAN_TEST === "1") {
    const body = await req.json().catch(() => null);
    if (body && typeof body === "object" && Array.isArray(body.roles)) {
      const result = await applyScan({ roles: body.roles, sources: Array.isArray(body.sources) ? body.sources : [] }, typeof body.now === "string" ? body.now : undefined);
      return NextResponse.json({ result, test: true });
    }
  }
  try {
    return NextResponse.json(await runScan(origin(req)));
  } catch (e) {
    if (isDown(e)) throw e; // answered 503 by guarded()
    console.error("scan failed", e);
    return NextResponse.json({ error: "The scan failed. See the server log." }, { status: 500 });
  }
});
