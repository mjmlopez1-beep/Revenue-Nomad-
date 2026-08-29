import { NextResponse } from "next/server";
import { loadDb, saveDb } from "@/lib/store";
import { currentOperator } from "@/lib/session";
import {
  balance,
  streakWeeks,
  multiplierActive,
  contributionsThisQuarter,
  dealsThisWeek,
  signalsThisMonth,
  pastEngagementCount,
  toolReviewCount,
  inLaunchWindow,
  grantInsiderMonthly,
} from "@/lib/credits";
import { feedActive, pulsedThisWeek, lastContributionAt, hasUnlock, contributedThisEdition } from "@/lib/gates";
import {
  publicTeasers,
  indexTrend,
  tapeRows,
  retainerPanel,
  realizationPanel,
  winRatePanel,
  pricingModelPanel,
  utilizationPanel,
  verifiedShare,
  percentileCard,
  currentEdition,
} from "@/lib/aggregate";
import { isoWeek, lastWeeks, weeksAgo, monthKey } from "@/lib/time";
import { FUNC_LABELS, STAGE_LABELS, INDUSTRY_LABELS, ASSET_LABELS } from "@/lib/config";
import type { EditionAsset, Segment } from "@/lib/types";

export const dynamic = "force-dynamic";

function segmentLabel(s: Segment): string {
  const parts = [
    s.func ? FUNC_LABELS[s.func] : null,
    s.industry ? INDUSTRY_LABELS[s.industry] : null,
    s.stage ? STAGE_LABELS[s.stage] : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All segments";
}

export async function GET() {
  const db = await loadDb();
  const op = await currentOperator(db);
  const now = new Date();
  const week = isoWeek(now);
  const edition = currentEdition(now);

  if (!op) {
    return NextResponse.json({
      operator: null,
      teasers: publicTeasers(db, now),
      operators: db.operators.slice(0, 300).map((o) => ({ id: o.id, name: o.name, funcLabel: FUNC_LABELS[o.func], foundingFifty: o.foundingFifty })),
    });
  }

  grantInsiderMonthly(db, op, now);
  const trend = indexTrend(db, 12, now); // also freezes/refreshes snapshots
  await saveDb(db);

  const active = feedActive(db, op.id, now);
  const pulsed = pulsedThisWeek(db, op.id, now);
  const cfg = db.config;

  /* ---------- daily: demand feed ---------- */
  const recentSignals = db.signals
    .filter((s) => now.getTime() - new Date(s.at).getTime() <= 14 * 86400000 && s.status !== "dead")
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  const feed = active
    ? {
        signals: recentSignals.map((s) => ({
          segment: segmentLabel(s.segment),
          type: s.signalType,
          timing: s.timing,
          strength: s.strength,
          at: s.at,
          // Names are admin-only. Followers of the segment see "named" flag only.
          named: !!s.companyName,
        })),
        // RN intake: signals progressing through the RN pipeline before formal posting.
        intake: recentSignals
          .filter((s) => s.status === "qualifying" || s.status === "intro_made")
          .map((s) => ({ segment: segmentLabel(s.segment), stage: s.segment.stage ? STAGE_LABELS[s.segment.stage] : "—", status: s.status, at: s.at })),
      }
    : null;

  /* ---------- weekly: tape drop ---------- */
  const q = db.questions.find((x) => x.week === week) ?? null;
  const lastQ = db.questions.find((x) => x.week === isoWeek(weeksAgo(1, now))) ?? null;
  const lastQAnswers = lastQ ? db.questionAnswers.filter((a) => a.questionId === lastQ.id) : [];
  const lastQResult =
    lastQ && lastQAnswers.length >= cfg.verification.minCellOperators
      ? lastQ.options.map((label, i) => ({
          label,
          share: Math.round((lastQAnswers.filter((a) => a.option === i).length / lastQAnswers.length) * 100),
        }))
      : null;
  const myPulse = db.pulseResponses.find((p) => p.operatorId === op.id && p.week === week) ?? null;
  const currentSnap = trend[trend.length - 1];
  const trendUnlocked = op.insider || hasUnlock(db, op.id, edition, "index_trend");

  /* ---------- monthly: the edition ---------- */
  const panelData: Record<string, unknown> = {
    retainers_by_function: () => retainerPanel(db, "func"),
    retainers_by_stage: () => retainerPanel(db, "stage"),
    retainers_by_industry: () => retainerPanel(db, "industry"),
    realization_rate: () => ({ byFunc: realizationPanel(db, "func"), byStage: realizationPanel(db, "stage") }),
    win_rate_by_source: () => winRatePanel(db),
    pricing_models: () => pricingModelPanel(db),
    utilization_renewal: () => utilizationPanel(db),
  };
  const panels: Record<string, { unlocked: boolean; cost: number; label: string; data: unknown }> = {};
  for (const asset of Object.keys(panelData) as EditionAsset[]) {
    const unlocked = hasUnlock(db, op.id, edition, asset);
    panels[asset] = {
      unlocked,
      cost: cfg.spend[asset],
      label: ASSET_LABELS[asset],
      data: unlocked ? (panelData[asset] as () => unknown)() : null,
    };
  }

  /* ---------- contribute ---------- */
  const myClients = db.clients
    .filter((c) => c.operatorId === op.id)
    .map((c) => ({
      id: c.id,
      clientName: c.clientName,
      rnPlaced: c.rnPlaced,
      status: c.status,
      confirmed: !!c.actuals,
      verified: c.verified,
      prefill: c.prefill,
      actuals: c.actuals,
      refreshDue: !!c.actuals && c.status === "active" && new Date(c.refreshDueAt) <= now,
      debriefed: !!c.debrief,
      moderation: c.moderation,
    }));
  const capacityAnswered = db.capacityPulses.some((cp) => cp.operatorId === op.id && cp.month === monthKey(now));
  const myAnswerForQ = q ? db.questionAnswers.some((a) => a.operatorId === op.id && a.questionId === q.id) : false;

  const contribs = contributionsThisQuarter(db, op.id, now);
  const tier = op.foundingFifty
    ? "founding_50"
    : op.insider || contribs >= cfg.status.insiderContributionsPerQuarter
      ? "insider"
      : "contributor";

  return NextResponse.json({
    operator: {
      id: op.id,
      name: op.name,
      func: op.func,
      funcLabel: FUNC_LABELS[op.func],
      listMonthlyRate: op.listMonthlyRate,
      foundingFifty: op.foundingFifty,
      insider: op.insider,
      follows: op.follows.map(segmentLabel),
      statedCapacityHours: op.statedCapacityHours,
    },
    credits: {
      balance: balance(db, op.id, now),
      streakWeeks: streakWeeks(db, op.id, now),
      streakNeeded: cfg.streak.weeks,
      multiplierActive: multiplierActive(db, op.id, now),
      multiplier: cfg.streak.multiplier,
      recent: db.credits
        .filter((e) => e.operatorId === op.id)
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .slice(0, 12)
        .map((e) => ({ amount: e.amount, note: e.note, at: e.at })),
    },
    status: { tier, contributionsThisQuarter: contribs, insiderThreshold: cfg.status.insiderContributionsPerQuarter },
    gates: {
      feedActive: active,
      feedRecencyDays: cfg.gates.feedRecencyDays,
      lastContributionAt: lastContributionAt(db, op.id),
      pulsedThisWeek: pulsed,
    },
    daily: { teasers: publicTeasers(db, now), feed, tape: tapeRows(db, lastWeeks(2, now)).slice(0, 14) },
    weekly: {
      week,
      pulse: { answered: !!myPulse, band: myPulse?.band ?? null, credits: cfg.earn.weeklyPulse },
      index: {
        current: pulsed ? currentSnap : null,
        currentLocked: !pulsed,
        trend: trendUnlocked ? trend : null,
        trendLocked: !trendUnlocked,
        trendCost: cfg.spend.index_trend,
      },
      tape: tapeRows(db, [week, isoWeek(weeksAgo(1, now))]).slice(0, 30),
      question: q
        ? { id: q.id, question: q.question, options: q.options, credits: q.credits, answered: myAnswerForQ }
        : null,
      lastWeekQuestion: lastQ ? { question: lastQ.question, result: lastQResult } : null,
    },
    monthly: {
      edition,
      verifiedShare: verifiedShare(db),
      flagshipFree: cfg.gates.flagshipFreeWithContribution,
      contributedThisEdition: contributedThisEdition(db, op.id, edition),
      panels,
      fullEditionCost: cfg.spend.full_edition,
      fullEditionUnlocked: hasUnlock(db, op.id, edition, "full_edition"),
    },
    contribute: {
      clients: myClients,
      earn: cfg.earn,
      pastCount: pastEngagementCount(db, op.id),
      pastCap: cfg.earn.pastEngagementCap,
      dealsThisWeek: dealsThisWeek(db, op.id, now),
      dealsWeeklyCap: cfg.earn.dealLogWeeklyCap,
      signalsThisMonth: signalsThisMonth(db, op.id, now),
      signalsMonthlyCap: cfg.earn.buyerSignalMonthlyCap,
      capacityAnswered,
      toolReviewCount: toolReviewCount(db, op.id),
      toolReviewCap: cfg.earn.toolReviewCap,
      launchBonusActive: inLaunchWindow(db, now),
      signalCashBounty: cfg.earn.signalCashBounty,
    },
    percentile: percentileCard(db, op.id),
    mySignals: db.signals
      .filter((s) => s.operatorId === op.id)
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .map((s) => ({ id: s.id, segment: segmentLabel(s.segment), status: s.status, bountyPaid: s.bountyPaid, at: s.at })),
  });
}
