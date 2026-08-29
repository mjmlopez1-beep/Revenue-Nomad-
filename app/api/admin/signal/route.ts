import { NextResponse } from "next/server";
import { loadDb, saveDb } from "@/lib/store";
import { isAdmin } from "@/lib/session";
import type { SignalStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: SignalStatus[] = ["new", "qualifying", "intro_made", "converted", "dead"];

/**
 * Signal CRM (spec §5): move signals through the pipeline. Marking a signal
 * converted records the $250 cash bounty as payable — the bounty is cash,
 * not credits, and is paid outside the app (Bill.com, like operator payouts).
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not admin" }, { status: 403 });
  const { id, status, bountyPaid, note } = (await req.json()) as {
    id: string;
    status?: SignalStatus;
    bountyPaid?: boolean;
    note?: string;
  };
  const db = await loadDb();
  const s = db.signals.find((x) => x.id === id);
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (status && STATUSES.includes(status) && status !== s.status) {
    s.status = status;
    s.statusLog.push({ status, at: new Date().toISOString(), note });
  }
  if (typeof bountyPaid === "boolean") s.bountyPaid = bountyPaid;
  await saveDb(db);
  return NextResponse.json({ ok: true });
}
