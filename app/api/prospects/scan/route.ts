import { NextResponse } from "next/server";
import { runProspectScan } from "@/lib/prospects/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  try {
    const scan = await runProspectScan();
    return NextResponse.json({ scan });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "scan failed" },
      { status: 500 }
    );
  }
}
