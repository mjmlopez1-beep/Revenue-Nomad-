import type { NextRequest } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { serviceIconResponse } from "@/lib/serviceIcon";

export const dynamic = "force-dynamic";

/**
 * GET /api/logo/svc/<service key>: a service's icon (Google, Slack, Claude and the others in
 * lib/serviceIcon.ts SERVICE_SITES) as image bytes, read from that service's own site, or 204 with
 * no body for an unknown key or no icon. Public on purpose: it names only a service Merlin connects to.
 */
export const GET = guarded(async (req: NextRequest, ctx: { params: Promise<{ key: string }> }) => serviceIconResponse(req, (await ctx.params).key));
