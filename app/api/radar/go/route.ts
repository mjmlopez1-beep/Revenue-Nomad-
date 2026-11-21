/**
 * GET ?m=<public member id>&s=<signature>&w=email|slack&to=<path>[&x=<expiry>&t=<grant>]: a link
 * in the radar's email or Slack post. Counts radar_clicked for the member it was signed for, then
 * sends them to `to`, a path in the app (a company's record, "/?c=…&p=radar&sig=2026-11-19", or the
 * day's companies, "/?p=radar&sig=2026-11-19"). Any other `to` goes to the app's home: never another
 * site. The email's links carry a grant too (lib/emailIn.ts): opening one signs the member in, once.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { clientIp, limited } from "@/lib/rateLimit";
import { publicOrigin } from "@/lib/mcp/http";
import { radarClicked } from "@/lib/radar";
import { emailLanding } from "@/lib/emailIn";

export const dynamic = "force-dynamic";

export const GET = guarded(
  async (req: NextRequest) => {
    const q = req.nextUrl.searchParams;
    const path = limited(`radar-go:${clientIp(req)}`, 60, 60_000) ? null : await radarClicked(q.get("m"), q.get("s"), q.get("w"), q.get("to"));
    const to = path ? await emailLanding({ m: q.get("m"), x: q.get("x"), t: q.get("t"), to: path }, req.cookies.get("rn_table")?.value ?? null) : null;
    return NextResponse.redirect(`${publicOrigin(req)}${to ?? "/"}`, { status: 302, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  },
  () => new NextResponse(null, { status: 302, headers: { location: "/" } }),
);
