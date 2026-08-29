import { NextResponse } from "next/server";
import { loadDb } from "@/lib/store";
import { isAdmin } from "@/lib/session";
import { isoWeek, lastWeeks, monthKey } from "@/lib/time";
import { verifiedShare, eligibleEngagements } from "@/lib/aggregate";
import { FUNC_LABELS } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not admin" }, { status: 403 });
  const db = await loadDb();
  const now = new Date();
  const week = isoWeek(now);
  const month = monthKey(now);

  /* §8 metrics against kill criteria */
  const totalOps = db.operators.length;
  const pulseRateByWeek = lastWeeks(8, now).map((wk) => ({
    week: wk,
    responses: db.pulseResponses.filter((p) => p.week === wk).length,
    rate: Math.round((db.pulseResponses.filter((p) => p.week === wk).length / totalOps) * 100),
  }));
  const opsWithTwoEntries = new Set(
    db.operators
      .filter((o) => db.clients.filter((c) => c.operatorId === o.id && c.actuals).length >= 2)
      .map((o) => o.id)
  ).size;
  const signalsThisMonth = db.signals.filter((s) => monthKey(new Date(s.at)) === month).length;
  const converted = db.signals.filter((s) => s.status === "converted").length;
  const signalConversion = db.signals.length ? Math.round((converted / db.signals.length) * 100) : 0;

  const opName = (id: string) => db.operators.find((o) => o.id === id)?.name ?? id;

  return NextResponse.json({
    config: db.config,
    metrics: {
      operators: totalOps,
      pulseRateByWeek,
      pulseRateThisWeek: pulseRateByWeek[pulseRateByWeek.length - 1]?.rate ?? 0,
      engagementCoverage: Math.round((opsWithTwoEntries / totalOps) * 100),
      engagementRows: eligibleEngagements(db).length,
      verifiedShare: verifiedShare(db),
      signalsThisMonth,
      signalConversion,
    },
    signals: db.signals
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .map((s) => ({
        id: s.id,
        operator: opName(s.operatorId),
        companyName: s.companyName, // admin-only surface for names
        segment: s.segment,
        signalType: s.signalType,
        timing: s.timing,
        strength: s.strength,
        note: s.note,
        status: s.status,
        bountyPaid: s.bountyPaid,
        at: s.at,
      })),
    moderation: [
      ...db.clients
        .filter((c) => c.moderation === "held")
        .map((c) => ({
          kind: "client" as const,
          id: c.id,
          operator: opName(c.operatorId),
          summary: `${c.clientName}: $${c.actuals?.actualMonthly}/mo, ${c.actuals?.hoursPerMonth}h`,
          at: c.confirmedAt,
        })),
      ...db.deals
        .filter((d) => d.moderation === "held")
        .map((d) => ({
          kind: "deal" as const,
          id: d.id,
          operator: opName(d.operatorId),
          summary: `${d.outcome} · ${d.cycleWeeks}w cycle · ${d.retainerBand}`,
          at: d.at,
        })),
    ],
    reconciliations: db.billcomReconciliations.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1)),
    questions: db.questions.sort((a, b) => (a.week < b.week ? 1 : -1)).slice(0, 8),
    week,
    funcs: FUNC_LABELS,
  });
}
