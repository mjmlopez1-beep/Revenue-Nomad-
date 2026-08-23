import { NextResponse } from "next/server";
import { loadProspects } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await loadProspects();
  return NextResponse.json({
    prospects: db.prospects,
    lastScan: db.lastScan,
    total: db.prospects.length,
  });
}
