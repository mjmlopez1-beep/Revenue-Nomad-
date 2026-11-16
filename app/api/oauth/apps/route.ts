/**
 * Connected apps, for Your credits (signed in with the app's cookie).
 * GET               { apps: [{ id, name, connectedAt, lastUsedAt }] }
 * POST { revoke }   disconnect one: its tokens stop working at once.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { memberForToken } from "@/lib/table";
import { publicOrigin } from "@/lib/mcp/http";
import { connectedApps, disconnectApp } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };
const SIGNED_OUT = "You're signed out. Sign in again to see your connected apps.";

export const GET = guarded(async (req: NextRequest) => {
  const me = await memberForToken(req.cookies.get("rn_table")?.value);
  if (!me) return NextResponse.json({ error: SIGNED_OUT }, { status: 401, headers: noStore });
  return NextResponse.json({ apps: await connectedApps(me.id) }, { headers: noStore });
});

export const POST = guarded(async (req: NextRequest) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== publicOrigin(req) && origin !== req.nextUrl.origin) return NextResponse.json({ error: "That didn't come from Trading Post." }, { status: 403, headers: noStore });
  const me = await memberForToken(req.cookies.get("rn_table")?.value);
  if (!me) return NextResponse.json({ error: SIGNED_OUT }, { status: 401, headers: noStore });
  const body = (await req.json().catch(() => null)) as { revoke?: unknown } | null;
  const ok = await disconnectApp(me.id, String(body?.revoke ?? ""));
  if (!ok) return NextResponse.json({ error: "That app isn't connected any more." }, { status: 404, headers: noStore });
  return NextResponse.json({ ok: true, apps: await connectedApps(me.id) }, { headers: noStore });
});
