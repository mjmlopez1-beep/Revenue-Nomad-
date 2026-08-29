import { NextResponse } from "next/server";
import { loadDb, saveDb, uid } from "@/lib/store";
import { currentOperator } from "@/lib/session";
import { award, dealsThisWeek } from "@/lib/credits";
import { plausibleCycle } from "@/lib/aggregate";
import { isoWeek } from "@/lib/time";
import type { DealSource, RetainerBand, Stage } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Deal outcome log: won/lost, source, cycle, band. +15 (+5 for a one-line why), cap 2/week. */
export async function POST(req: Request) {
  const db = await loadDb();
  const op = await currentOperator(db);
  if (!op) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json()) as {
    outcome: "won" | "lost";
    source: DealSource;
    competitor?: string;
    cycleWeeks: number;
    retainerBand: RetainerBand;
    stage: Stage;
    why?: string;
  };
  const cfg = db.config.earn;
  if (dealsThisWeek(db, op.id) >= cfg.dealLogWeeklyCap)
    return NextResponse.json({ error: `Deal log cap (${cfg.dealLogWeeklyCap}/week) reached` }, { status: 400 });
  if (!["won", "lost"].includes(body.outcome) || !(body.cycleWeeks > 0))
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const held = !plausibleCycle(db, body.cycleWeeks);
  const now = new Date();
  const id = uid("dl");
  db.deals.push({
    id,
    operatorId: op.id,
    outcome: body.outcome,
    source: body.source,
    competitor: body.competitor?.slice(0, 80) || null,
    cycleWeeks: Math.round(body.cycleWeeks),
    retainerBand: body.retainerBand,
    func: op.func,
    stage: body.stage,
    why: body.why?.slice(0, 200) || null,
    week: isoWeek(now),
    at: now.toISOString(),
    verified: false, // RN-sourced deals are cross-checked by admin against RN records
    moderation: held ? "held" : "ok",
  });
  let awarded = 0;
  if (!held) {
    const bonus = body.why?.trim() ? cfg.dealLogWhy : 0;
    awarded = award(db, op.id, "deal_log", cfg.dealLog + bonus, id, `Deal logged (${body.outcome})`).amount;
  }
  await saveDb(db);
  return NextResponse.json({ ok: true, awarded, held });
}
