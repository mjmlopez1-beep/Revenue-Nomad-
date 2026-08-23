import { NextResponse } from "next/server";
import { runCrawl } from "@/lib/crawler";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  try {
    const run = await runCrawl();
    return NextResponse.json({ run });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "crawl failed" },
      { status: 500 }
    );
  }
}
