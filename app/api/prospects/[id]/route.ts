import { NextRequest, NextResponse } from "next/server";
import { updateProspectStatus } from "@/lib/store";
import type { ProspectStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID: ProspectStatus[] = ["new", "queued", "contacted", "dismissed"];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const status = body?.status as ProspectStatus | undefined;
  if (!status || !VALID.includes(status)) {
    return NextResponse.json({ error: "status must be one of " + VALID.join(", ") }, { status: 400 });
  }
  const prospect = await updateProspectStatus(id, status);
  if (!prospect) return NextResponse.json({ error: "prospect not found" }, { status: 404 });
  return NextResponse.json({ prospect });
}
