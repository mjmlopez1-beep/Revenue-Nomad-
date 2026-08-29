import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { loadDb } from "@/lib/store";
import { OP_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Demo operator switcher (v1 internal). Production: magic-link auth. */
export async function POST(req: Request) {
  const { operatorId } = await req.json();
  const db = await loadDb();
  const op = db.operators.find((o) => o.id === operatorId);
  if (!op) return NextResponse.json({ error: "Unknown operator" }, { status: 404 });
  const jar = await cookies();
  jar.set(OP_COOKIE, op.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(OP_COOKIE);
  return NextResponse.json({ ok: true });
}
