import { NextResponse } from "next/server";
import { loadDb, saveDb, uid } from "@/lib/store";
import { currentOperator } from "@/lib/session";
import { award } from "@/lib/credits";
import { computeIndexSnapshot } from "@/lib/aggregate";
import { isoWeek } from "@/lib/time";
import type { PulseBand } from "@/lib/types";

export const dynamic = "force-dynamic";

const BANDS: PulseBand[] = ["0", "1_2", "3_5", "6_plus"];

/** The weekly pipeline pulse: one question, one tap, +5, feeds the Demand Index. */
export async function POST(req: Request) {
  const db = await loadDb();
  const op = await currentOperator(db);
  if (!op) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { band } = (await req.json()) as { band: PulseBand };
  if (!BANDS.includes(band)) return NextResponse.json({ error: "Bad band" }, { status: 400 });
  const week = isoWeek();
  if (db.pulseResponses.some((p) => p.operatorId === op.id && p.week === week))
    return NextResponse.json({ error: "Already answered this week" }, { status: 409 });
  db.pulseResponses.push({ id: uid("pl"), operatorId: op.id, week, band, via: "app", at: new Date().toISOString() });
  const res = award(db, op.id, "weekly_pulse", db.config.earn.weeklyPulse, week, `Weekly pipeline pulse (${week})`);
  // Refresh the live snapshot so the index the operator just unlocked is current.
  const snap = computeIndexSnapshot(db, week);
  const i = db.demandIndexSnapshots.findIndex((s) => s.week === week);
  if (i >= 0) db.demandIndexSnapshots[i] = snap;
  else db.demandIndexSnapshots.push(snap);
  await saveDb(db);
  return NextResponse.json({ ok: true, awarded: res.amount, index: snap });
}
