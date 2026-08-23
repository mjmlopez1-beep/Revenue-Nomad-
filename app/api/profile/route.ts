import { NextRequest, NextResponse } from "next/server";
import { loadProfile, normalizeProfile, saveProfile } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ profile: await loadProfile() });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const profile = normalizeProfile(body);
  await saveProfile(profile);
  return NextResponse.json({ profile });
}
