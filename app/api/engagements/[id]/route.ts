import { NextResponse } from "next/server";
import { loadDb, saveDb } from "@/lib/store";
import { currentOperator } from "@/lib/session";
import { award } from "@/lib/credits";
import { plausibleActuals } from "@/lib/aggregate";
import { daysFromNow } from "@/lib/time";
import type { EngagementActuals, Debrief } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Actions on one engagement:
 *  - confirm  — one-tap confirmation of an RN-placed pre-fill (+10, instantly verified)
 *  - refresh  — quarterly refresh of actuals (+10, resets the refresh clock)
 *  - debrief  — how it ended (+20, +5 with a reason)
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = await loadDb();
  const op = await currentOperator(db);
  if (!op) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const c = db.clients.find((x) => x.id === id && x.operatorId === op.id);
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const cfg = db.config.earn;
  const now = new Date();

  if (body.action === "confirm") {
    if (!c.prefill || c.actuals)
      return NextResponse.json({ error: "Nothing to confirm" }, { status: 400 });
    // The operator may adjust the pre-filled numbers before confirming.
    const actuals: EngagementActuals = { ...c.prefill, ...(body.actuals ?? {}) };
    c.actuals = actuals;
    c.confirmedAt = now.toISOString();
    // Pre-filled RN engagements are verified at confirmation (spec §6) —
    // unless the operator changed the billed amount, which re-verifies at
    // the next Bill.com reconciliation.
    c.verified = actuals.actualMonthly === c.prefill.actualMonthly;
    c.refreshDueAt = daysFromNow(91, now).toISOString();
    const res = award(db, op.id, "engagement_confirm_prefill", cfg.confirmPrefill, c.id, `Confirmed ${c.clientName} (RN-placed${c.verified ? ", verified" : ""})`);
    await saveDb(db);
    return NextResponse.json({ ok: true, awarded: res.amount, verified: c.verified });
  }

  if (body.action === "refresh") {
    if (!c.actuals || c.status !== "active")
      return NextResponse.json({ error: "Not refreshable" }, { status: 400 });
    if (new Date(c.refreshDueAt) > now)
      return NextResponse.json({ error: "Refresh not due yet" }, { status: 400 });
    const actuals: EngagementActuals = { ...c.actuals, ...(body.actuals ?? {}) };
    if (!plausibleActuals(db, actuals.actualMonthly))
      return NextResponse.json({ error: "Amount out of plausible range — contact RN" }, { status: 400 });
    c.actuals = actuals;
    c.lastRefreshedAt = now.toISOString();
    c.refreshDueAt = daysFromNow(91, now).toISOString();
    if (!c.rnPlaced) c.verified = false; // self-reported until next reconciliation
    const res = award(db, op.id, "engagement_refresh", cfg.quarterlyRefresh, c.id, `Quarterly refresh — ${c.clientName}`);
    await saveDb(db);
    return NextResponse.json({ ok: true, awarded: res.amount });
  }

  if (body.action === "debrief") {
    if (c.debrief) return NextResponse.json({ error: "Already debriefed" }, { status: 400 });
    const { outcome, reason } = body as { outcome: Debrief["outcome"]; reason?: string };
    if (!["renewed", "expanded", "completed", "churned"].includes(outcome))
      return NextResponse.json({ error: "Bad outcome" }, { status: 400 });
    c.debrief = { outcome, reason: (reason ?? "").slice(0, 300), at: now.toISOString() };
    if (outcome === "completed" || outcome === "churned") {
      c.status = "ended";
      c.endedAt = now.toISOString();
      c.endReason = outcome;
    }
    const bonus = reason?.trim() ? cfg.debriefBonus : 0;
    const res = award(db, op.id, "debrief", cfg.debrief + bonus, c.id, `Engagement debrief — ${c.clientName} (${outcome})`);
    await saveDb(db);
    return NextResponse.json({ ok: true, awarded: res.amount });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
