import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { key } = await req.json();
  const expected = process.env.NB_ADMIN_KEY || "dev-admin";
  if (key !== expected) return NextResponse.json({ error: "Wrong key" }, { status: 403 });
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, key, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return NextResponse.json({ ok: true });
}
