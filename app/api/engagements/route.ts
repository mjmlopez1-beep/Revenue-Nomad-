import { NextResponse } from "next/server";
import { loadDb, saveDb, uid } from "@/lib/store";
import { currentOperator } from "@/lib/session";
import { award, pastEngagementCount, inLaunchWindow } from "@/lib/credits";
import { plausibleActuals } from "@/lib/aggregate";
import { daysFromNow } from "@/lib/time";
import type { ClientEngagement, EngagementActuals } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Per-client census: add one engagement (active or past) with actuals.
 * Each client pays once (+20 active / +15 past); refreshes pay on their own
 * clock via /api/engagements/[id]/refresh.
 */
export async function POST(req: Request) {
  const db = await loadDb();
  const op = await currentOperator(db);
  if (!op) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json();
  const { clientName, past, endedOutcome, endedReason } = body as {
    clientName: string;
    past?: boolean;
    endedOutcome?: "renewed" | "expanded" | "completed" | "churned";
    endedReason?: string;
  };
  const actuals = body.actuals as EngagementActuals;
  if (!clientName?.trim() || !actuals || !(actuals.actualMonthly > 0) || !(actuals.hoursPerMonth > 0))
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const cfg = db.config.earn;
  if (past && pastEngagementCount(db, op.id) >= cfg.pastEngagementCap)
    return NextResponse.json({ error: `Past engagement cap (${cfg.pastEngagementCap}) reached` }, { status: 400 });

  // Plausibility (spec §6): out-of-band retainers route to moderation, credits held.
  const held = !plausibleActuals(db, actuals.actualMonthly);

  const now = new Date();
  const c: ClientEngagement = {
    id: uid("cl"),
    operatorId: op.id,
    clientName: clientName.trim().slice(0, 80),
    rnPlaced: false,
    status: past ? "past" : "active",
    prefill: null,
    actuals,
    confirmedAt: now.toISOString(),
    verified: false, // off-platform actuals are self-reported and marked as such
    startedAt: body.startedAt || now.toISOString(),
    endedAt: past ? body.endedAt || now.toISOString() : null,
    endReason: past ? (endedOutcome ?? null) : null,
    debrief: past && endedOutcome ? { outcome: endedOutcome, reason: endedReason ?? "", at: now.toISOString() } : null,
    refreshDueAt: daysFromNow(91, now).toISOString(),
    lastRefreshedAt: null,
    moderation: held ? "held" : "ok",
  };
  db.clients.push(c);

  let awarded = 0;
  let note = "";
  if (held) {
    note = "Routed to moderation — credits held until an admin clears the entry.";
  } else if (past) {
    const bonus = inLaunchWindow(db, now) ? cfg.pastEngagementLaunchBonus : 0;
    const res = award(db, op.id, "past_engagement", cfg.pastEngagement + bonus, c.id, `Past engagement — ${c.clientName}${bonus ? ` (launch bonus +${bonus})` : ""}`);
    awarded = res.amount;
  } else {
    const res = award(db, op.id, "engagement_actuals", cfg.engagementActuals, c.id, `Engagement actuals — ${c.clientName}`);
    awarded = res.amount;
  }
  await saveDb(db);
  return NextResponse.json({ ok: true, id: c.id, awarded, held, note });
}
