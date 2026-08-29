import { NextResponse } from "next/server";
import { loadDb, saveDb, uid } from "@/lib/store";
import { currentOperator } from "@/lib/session";
import { award } from "@/lib/credits";
import { monthKey } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Monthly capacity pulse: hours free + taking clients. Feeds utilization and matching freshness. */
export async function POST(req: Request) {
  const db = await loadDb();
  const op = await currentOperator(db);
  if (!op) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { hoursFree, takingClients, statedCapacityHours } = (await req.json()) as {
    hoursFree: number;
    takingClients: boolean;
    statedCapacityHours?: number;
  };
  const month = monthKey();
  if (db.capacityPulses.some((c) => c.operatorId === op.id && c.month === month))
    return NextResponse.json({ error: "Already answered this month" }, { status: 409 });
  if (!(hoursFree >= 0)) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  db.capacityPulses.push({
    id: uid("cap"),
    operatorId: op.id,
    month,
    hoursFree: Math.round(hoursFree),
    takingClients: !!takingClients,
    at: new Date().toISOString(),
  });
  op.takingClients = !!takingClients;
  if (statedCapacityHours && statedCapacityHours > 0) op.statedCapacityHours = Math.round(statedCapacityHours);
  const res = award(db, op.id, "capacity_pulse", db.config.earn.capacityPulse, month, `Monthly capacity pulse (${month})`);
  await saveDb(db);
  return NextResponse.json({ ok: true, awarded: res.amount });
}
