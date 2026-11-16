import { NextRequest, NextResponse } from "next/server";
import { lookupCompany, normalizeDomain } from "@/lib/companyLookup";
import { limited } from "@/lib/rateLimit";
import { existingCompany, memberForToken } from "@/lib/table";
import { guarded } from "@/lib/apiGuard";

export const dynamic = "force-dynamic";

/** GET ?url=acme.com — prefill for the Add record form (signed-in members only). */
export const GET = guarded(async (req: NextRequest) => {
  const token = req.cookies.get("rn_table")?.value ?? null;
  if (!(await memberForToken(token))) {
    return NextResponse.json({ error: "You're signed out. Sign in again to add a company." }, { status: 401 });
  }
  if (limited(`lookup:${token}`, 30, 60_000)) return NextResponse.json({ error: "That's 30 lookups in a minute, which is the limit. Give it a moment, then try again." }, { status: 429 });
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const domain = normalizeDomain(url);
  if (!domain) return NextResponse.json({ error: "That doesn't look like a web address. Paste the whole thing, like acme.com." }, { status: 400 });
  const found = await lookupCompany(url);
  const existing = await existingCompany(domain, found?.name ?? null);
  return NextResponse.json({ domain, name: found?.name ?? null, industry: found?.industry ?? null, description: found?.description ?? null, existing });
});
