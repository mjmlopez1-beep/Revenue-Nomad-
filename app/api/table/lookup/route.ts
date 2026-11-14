import { NextRequest, NextResponse } from "next/server";
import { lookupCompany, normalizeDomain } from "@/lib/companyLookup";
import { existingCompany, memberForToken } from "@/lib/table";

export const dynamic = "force-dynamic";

/** GET ?url=acme.com — prefill for the Add record form (signed-in members only). */
export async function GET(req: NextRequest) {
  if (!(await memberForToken(req.cookies.get("rn_table")?.value))) {
    return NextResponse.json({ error: "Sign in or join to add records." }, { status: 401 });
  }
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const domain = normalizeDomain(url);
  if (!domain) return NextResponse.json({ error: "That doesn't look like a website." }, { status: 400 });
  const found = await lookupCompany(url);
  const existing = await existingCompany(domain, found?.name ?? null);
  return NextResponse.json({ domain, name: found?.name ?? null, industry: found?.industry ?? null, description: found?.description ?? null, existing });
}
