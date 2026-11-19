import type { NextRequest } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { logoResponse } from "@/lib/logo";

export const dynamic = "force-dynamic";

/**
 * GET /api/logo/<public company id>: the company's logo as image bytes, or 404 (lib/logo.ts).
 * It names nothing: the page shows a locked company's logo without its domain in the page.
 */
export const GET = guarded(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => logoResponse(req, (await ctx.params).id));
