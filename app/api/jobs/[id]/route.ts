import { NextRequest, NextResponse } from "next/server";
import { updateJobStatus } from "@/lib/store";
import type { JobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID: JobStatus[] = ["new", "saved", "applied", "hidden"];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const status = body?.status as JobStatus | undefined;
  if (!status || !VALID.includes(status)) {
    return NextResponse.json({ error: "status must be one of " + VALID.join(", ") }, { status: 400 });
  }
  const job = await updateJobStatus(id, status);
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
  return NextResponse.json({ job });
}
