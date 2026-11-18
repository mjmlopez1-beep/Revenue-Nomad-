/**
 * GET ?m=<public member id>&s=<signature>: the radar email's 1 by 1 image. Counts radar_opened
 * (once a member a day) for the member it was signed for, and answers a transparent GIF whatever
 * happens, so a mail app never shows a broken image.
 */
import { NextRequest, NextResponse } from "next/server";
import { clientIp, limited } from "@/lib/rateLimit";
import { radarOpened } from "@/lib/radar";

export const dynamic = "force-dynamic";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const gif = () => new NextResponse(GIF, { status: 200, headers: { "content-type": "image/gif", "cache-control": "no-store, private" } });

export async function GET(req: NextRequest) {
  try {
    if (!limited(`radar-open:${clientIp(req)}`, 60, 60_000)) await radarOpened(req.nextUrl.searchParams.get("m"), req.nextUrl.searchParams.get("s"));
  } catch {
    /* the image answers anyway */
  }
  return gif();
}
