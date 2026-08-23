import { NextResponse } from "next/server";
import { loadProspects } from "@/lib/store";
import { runProspectScan } from "@/lib/prospects/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Serverless instances don't share /tmp: an instance that never saw a scan
// has zero prospects even if one just ran elsewhere. Self-heal like the jobs
// API — scan inline when this instance is empty or stale, with a retry guard
// so failing sources can't slow every request.
const STALE_MS = 6 * 3600 * 1000;
const RETRY_MS = 10 * 60 * 1000;

export async function GET() {
  let db = await loadProspects();
  const lastAttempt = db.lastScan ? new Date(db.lastScan.at).getTime() : 0;
  const stale = Date.now() - lastAttempt > STALE_MS;
  if ((db.prospects.length === 0 || stale) && Date.now() - lastAttempt > RETRY_MS) {
    try {
      await runProspectScan();
      db = await loadProspects();
    } catch {
      // keep serving whatever we have
    }
  }
  return NextResponse.json({
    prospects: db.prospects,
    lastScan: db.lastScan,
    total: db.prospects.length,
  });
}
