import { NextResponse } from "next/server";
import { health } from "@/lib/table";

export const dynamic = "force-dynamic";

/**
 * GET /api/health: 200 with { ok: true } only when the real member seed loaded, the state loaded
 * and the data folder takes writes. Anything else is 503, with which part failed (no member data).
 * The host's health check points here (railway.json), so a deploy with a missing seed key, a
 * damaged state file or a volume that is not mounted never goes live. No rate limit, and it
 * never writes the state.
 */
export async function GET() {
  const h = await health().catch(() => ({ ok: false as const, seed: "missing" as const, state: "down" as const, disk: "failed" as const }));
  return NextResponse.json(h, { status: h.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
