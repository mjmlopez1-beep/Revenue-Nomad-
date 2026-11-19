/**
 * GET ?m=<public member id>&s=<signature>&w=email|slack&to=<path>: a link in the radar's email or
 * Slack post. Counts radar_clicked for the member it was signed for, then sends them to `to`, a
 * path in the app (the day's companies, "/?p=table&sig=2026-11-19"). Any other `to` goes to the app's home: never
 * another site.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { clientIp, limited } from "@/lib/rateLimit";
import { publicOrigin } from "@/lib/mcp/http";
import { radarClicked } from "@/lib/radar";

export const dynamic = "force-dynamic";

export const GET = guarded(
  async (req: NextRequest) => {
    const q = req.nextUrl.searchParams;
    const to = limited(`radar-go:${clientIp(req)}`, 60, 60_000) ? null : await radarClicked(q.get("m"), q.get("s"), q.get("w"), q.get("to"));
    return NextResponse.redirect(`${publicOrigin(req)}${to ?? "/"}`, { status: 302, headers: { "cache-control": "no-store" } });
  },
  () => new NextResponse(null, { status: 302, headers: { location: "/" } }),
);
