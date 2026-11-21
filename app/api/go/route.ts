/**
 * GET ?m=<public member id>&x=<expiry>&t=<grant>&to=<path>: a link in the weekly email, or an
 * email footer's Notifications link. Signs the member in once and opens `to`, a path in the app
 * (lib/emailIn.ts). Any other `to` goes to the app's home: never another site.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { clientIp, limited } from "@/lib/rateLimit";
import { publicOrigin } from "@/lib/mcp/http";
import { emailLanding } from "@/lib/emailIn";

export const dynamic = "force-dynamic";

export const GET = guarded(
  async (req: NextRequest) => {
    const q = req.nextUrl.searchParams;
    const to = limited(`email-go:${clientIp(req)}`, 60, 60_000)
      ? null
      : await emailLanding({ m: q.get("m"), x: q.get("x"), t: q.get("t"), to: q.get("to") }, req.cookies.get("rn_table")?.value ?? null);
    return NextResponse.redirect(`${publicOrigin(req)}${to ?? "/"}`, { status: 302, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  },
  () => new NextResponse(null, { status: 302, headers: { location: "/" } }),
);
