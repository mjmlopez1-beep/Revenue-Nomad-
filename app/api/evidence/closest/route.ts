/**
 * Evidence Bank's closest cases (lib/evidenceWire.ts closestView), for the signed-in member only
 * (the app's cookie). Evidence Bank is a Close feature: off Close the answer is { on: false }.
 *
 * GET                    { on, ready, drafts, rows: {} }: how many of the member's cases are ready and in draft
 * GET ?ids=a,b,c         the same, with each company's closest case (public ids, 200 at most)
 *
 * Read only: nothing is stored and no credit is spent. A case's internal company id never leaves.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { memberForToken } from "@/lib/table";
import { limited } from "@/lib/rateLimit";
import { CLOSEST_MAX, closestView } from "@/lib/evidenceWire";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

export const GET = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) return fail("You're signed out. Sign in again.", 401);
  if (limited(`ev-closest:${me.id}`, 120, 60_000)) return fail("That's a lot in one minute. Give it a moment, then try again.", 429);
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^[A-Za-z0-9_-]{1,80}$/.test(x))
    .slice(0, CLOSEST_MAX);
  const v = await closestView(token, ids);
  if (!v) return fail("You're signed out. Sign in again.", 401);
  return NextResponse.json(v, { headers: noStore });
});
