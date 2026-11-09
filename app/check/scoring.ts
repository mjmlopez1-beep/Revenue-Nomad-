import { fixFirstLine, pillarLabel, pillars, stageWeights, type Level, type Pillar, type RevenueRange } from "./content";

export type Answers = Record<Pillar, Level>;

export type PillarResult = { pillar: Pillar; label: string; level: Level; priority: number };

export type CheckResult = {
  total: number; // 0 to 100
  pillars: PillarResult[]; // in Diagnostic order
  fixFirst: Array<PillarResult & { line: string }>; // two pillars
};

/** Answer index 0..3 (Optimized first) to maturity level 4..1. */
export const levelForAnswer = (index: number): Level => (4 - index) as Level;

/** Mean level rescaled to 0..100: (mean - 1) / 3 * 100, rounded. */
export function totalScore(answers: Answers): number {
  const mean = pillars.reduce((sum, p) => sum + answers[p], 0) / pillars.length;
  return Math.round(((mean - 1) / 3) * 100);
}

/**
 * Fix-first priority per pillar = (4 - level) * stage weight. The two highest win; ties break by the
 * Diagnostic's pillar order (the order of `pillars`). Employee range is context only in v1.
 */
export function score(answers: Answers, revenue: RevenueRange): CheckResult {
  const results: PillarResult[] = pillars.map((p) => ({
    pillar: p,
    label: pillarLabel[p],
    level: answers[p],
    priority: (4 - answers[p]) * stageWeights[p][revenue],
  }));
  const ranked = results
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.priority - a.r.priority || a.i - b.i)
    .map(({ r }) => r);
  const fixFirst = ranked.slice(0, 2).map((r) => ({ ...r, line: fixFirstLine[r.pillar] }));
  return { total: totalScore(answers), pillars: results, fixFirst };
}
