import { NextResponse } from "next/server";
import { loadDb, saveDb, uid } from "@/lib/store";
import { currentOperator } from "@/lib/session";
import { award, signalsThisMonth } from "@/lib/credits";
import type { BuyerSignal } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Buyer signal: +40 (+10 named), cap 3/month, $250 cash bounty on conversion
 * to an RN engagement (paid by admin via the Signal CRM, outside credits).
 */
export async function POST(req: Request) {
  const db = await loadDb();
  const op = await currentOperator(db);
  if (!op) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json()) as Partial<BuyerSignal>;
  const cfg = db.config.earn;
  if (signalsThisMonth(db, op.id) >= cfg.buyerSignalMonthlyCap)
    return NextResponse.json({ error: `Signal cap (${cfg.buyerSignalMonthlyCap}/month) reached` }, { status: 400 });
  if (!body.signalType || !body.timing || !body.strength || !body.note?.trim())
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const now = new Date().toISOString();
  const named = !!body.companyName?.trim();
  const id = uid("sg");
  db.signals.push({
    id,
    operatorId: op.id,
    segment: body.segment ?? {},
    signalType: body.signalType,
    timing: body.timing,
    strength: body.strength,
    companyName: named ? body.companyName!.trim().slice(0, 80) : null,
    note: body.note.trim().slice(0, 500),
    status: "new",
    bountyPaid: false,
    at: now,
    statusLog: [{ status: "new", at: now }],
  });
  const res = award(db, op.id, "buyer_signal", cfg.buyerSignal + (named ? cfg.buyerSignalNamed : 0), id, `Buyer signal${named ? " (named)" : ""}`);
  await saveDb(db);
  return NextResponse.json({ ok: true, awarded: res.amount, bounty: cfg.signalCashBounty });
}
