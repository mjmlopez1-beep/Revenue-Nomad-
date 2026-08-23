import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_PROFILE, loadProfile, saveProfile } from "@/lib/store";
import type { OperatorProfile, OperatorRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: OperatorRole[] = [
  "Sales Leadership",
  "Marketing",
  "Revenue Operations",
  "Sales Enablement",
  "Customer Success",
  "AI GTM",
  "Partnerships",
  "Sellers",
];

export async function GET() {
  return NextResponse.json({ profile: await loadProfile() });
}

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean).slice(0, 30) : [];

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const profile: OperatorProfile = {
    name: String(body.name ?? "").slice(0, 100),
    headline: String(body.headline ?? DEFAULT_PROFILE.headline).slice(0, 200),
    role: ROLES.includes(body.role) ? body.role : DEFAULT_PROFILE.role,
    industries: asStrings(body.industries),
    stages: asStrings(body.stages),
    keywords: asStrings(body.keywords),
    watchlist: Array.isArray(body.watchlist)
      ? body.watchlist
          .map((w: { company?: unknown; domain?: unknown }) => ({
            company: String(w?.company ?? "").trim().slice(0, 100),
            domain: w?.domain
              ? String(w.domain).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
              : undefined,
          }))
          .filter((w: { company: string }) => w.company)
          .slice(0, 50)
      : [],
  };
  await saveProfile(profile);
  return NextResponse.json({ profile });
}
