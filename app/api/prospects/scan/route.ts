import { NextRequest, NextResponse } from "next/server";
import { runProspectScan } from "@/lib/prospects/engine";
import { loadProspects, normalizeProfile, saveProfile } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handleScan(profileFromClient?: unknown) {
  try {
    // Serverless instances don't share /tmp, so the client passes its copy of
    // the profile with each scan — the scanning instance saves it first.
    if (profileFromClient && typeof profileFromClient === "object") {
      await saveProfile(normalizeProfile(profileFromClient as Record<string, unknown>));
    }
    const scan = await runProspectScan();
    const db = await loadProspects();
    // Return the prospects in the same response: a follow-up GET can land on
    // a different instance whose /tmp has never seen this scan.
    return NextResponse.json({ scan, prospects: db.prospects });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "scan failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return handleScan(body?.profile);
}

// GET supports browser-based debugging and scheduled refreshes.
export async function GET() {
  return handleScan();
}
