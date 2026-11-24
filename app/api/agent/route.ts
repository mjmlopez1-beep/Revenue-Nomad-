/**
 * Agent access (app/post/agent/AgentAccess.tsx), signed in with the app's cookie.
 *
 * GET                  AgentView (lib/mcp/agentTools.ts): connected agents with today's requests and
 *                      credits, the tools in four groups with their switches and use in 30 days, the
 *                      daily spend limit and what was spent today, and the log (no arguments in it).
 * POST { key, on }     switch a tool, an unlock kind ("unlock:person") or a group ("g:spend") on or off.
 * POST { limit }       the daily spend limit for all the member's agents: 5, 10, 25, 50, or null for none.
 *
 * Disconnecting an agent stays on /api/oauth/apps.
 */
import { sendOn } from "@/lib/send";
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { claudePerDay, loadState, memberForToken } from "@/lib/table";
import { publicOrigin } from "@/lib/mcp/http";
import { connectedApps } from "@/lib/mcp/oauth";
import { AgentPrefsProblem, agentViewIn, setPrefs } from "@/lib/mcp/log";
import { networkOn } from "@/lib/google/types";
import { pathsOn } from "@/lib/paths";
import { granolaOn } from "@/lib/granola/types";
import { callTriggersOn } from "@/lib/calls";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };
const SIGNED_OUT = "You're signed out. Sign in again to see your agents.";

async function viewFor(memberId: string) {
  const [s, apps, cap] = await Promise.all([loadState(), connectedApps(memberId), claudePerDay(memberId).catch(() => null)]);
  return agentViewIn(s, memberId, apps, { network: networkOn(), paths: pathsOn(), granola: granolaOn(), calls: callTriggersOn(), send: sendOn() }, cap);
}

export const GET = guarded(async (req: NextRequest) => {
  const me = await memberForToken(req.cookies.get("rn_table")?.value);
  if (!me) return NextResponse.json({ error: SIGNED_OUT }, { status: 401, headers: noStore });
  return NextResponse.json({ view: await viewFor(me.id) }, { headers: noStore });
});

export const POST = guarded(async (req: NextRequest) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== publicOrigin(req) && origin !== req.nextUrl.origin) return NextResponse.json({ error: "That didn't come from Merlin." }, { status: 403, headers: noStore });
  const me = await memberForToken(req.cookies.get("rn_table")?.value);
  if (!me) return NextResponse.json({ error: SIGNED_OUT }, { status: 401, headers: noStore });
  const body = (await req.json().catch(() => null)) as { key?: unknown; on?: unknown; limit?: unknown } | null;
  if (!body || (body.key === undefined && body.limit === undefined)) return NextResponse.json({ error: "Say which switch, or the limit." }, { status: 400, headers: noStore });
  try {
    await setPrefs(me.id, {
      ...(body.key !== undefined ? { key: String(body.key), on: body.on as boolean } : {}),
      ...(body.limit !== undefined ? { limit: body.limit === null ? null : Number(body.limit) } : {}),
    });
  } catch (e) {
    if (e instanceof AgentPrefsProblem) return NextResponse.json({ error: e.message }, { status: 400, headers: noStore });
    throw e;
  }
  return NextResponse.json({ ok: true, view: await viewFor(me.id) }, { headers: noStore });
});
