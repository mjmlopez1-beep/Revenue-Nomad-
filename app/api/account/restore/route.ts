import { NextRequest, NextResponse } from "next/server";
import { limited } from "@/lib/rateLimit";
import { restoreByLink } from "@/lib/account";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOKIE = "rn_table";

/**
 * GET /api/account/restore?k=...: the restore link from the closure email (lib/account.ts). Within
 * its 30 days it brings the account back and signs this browser in, then opens Merlin. Otherwise it
 * opens the home page with a short note (?restore=gone).
 */
export async function GET(req: NextRequest) {
  const base = process.env.RN_PUBLIC_URL?.replace(/\/$/, "") || req.nextUrl.origin;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(`restore:${ip}`, 20, 60 * 60_000)) return NextResponse.redirect(`${base}/?restore=gone`, 303);
  const m = await restoreByLink(req.nextUrl.searchParams.get("k"));
  if (!m) return NextResponse.redirect(`${base}/?restore=gone`, 303);
  const res = NextResponse.redirect(`${base}/?restored=1`, 303);
  res.cookies.set(COOKIE, m.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
