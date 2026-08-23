import { NextRequest, NextResponse } from "next/server";
import { runCrawl } from "@/lib/crawler";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handleCrawl() {
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

export async function POST() {
  return handleCrawl();
}

// GET supports scheduled crawls (e.g. Vercel Cron, uptime pingers).
// If CRON_SECRET is set, the request must carry it as a bearer token —
// Vercel Cron does this automatically when the env var exists.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return handleCrawl();
}
