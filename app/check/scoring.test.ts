import assert from "node:assert/strict";
import { test } from "node:test";
import { pillars, type Pillar } from "./content";
import { levelForAnswer, score, totalScore, type Answers } from "./scoring";

const all = (level: 1 | 2 | 3 | 4): Answers => Object.fromEntries(pillars.map((p) => [p, level])) as Answers;

test("answer index maps Optimized first to level 4", () => {
  assert.equal(levelForAnswer(0), 4);
  assert.equal(levelForAnswer(3), 1);
});

test("total is 0 for all Ad Hoc and 100 for all Optimized", () => {
  assert.equal(totalScore(all(1)), 0);
  assert.equal(totalScore(all(4)), 100);
  assert.equal(totalScore(all(2)), 33);
});

test("fix first picks the two lowest pillars weighted by stage", () => {
  const answers = { ...all(3), revenue_insights: 1 as const, ai: 1 as const };
  // Early stage: AI weighs 0.7, Revenue Insights 0.9, so Insights ranks first; both outrank level-3 pillars.
  const early = score(answers, "1m_5m");
  assert.deepEqual(
    early.fixFirst.map((f) => f.pillar),
    ["revenue_insights", "ai"]
  );
  // Late stage: AI (1.3) edges ahead of Insights? No: Insights 1.5 > AI 1.3, so Insights stays first.
  const late = score(answers, "50m_plus");
  assert.deepEqual(
    late.fixFirst.map((f) => f.pillar),
    ["revenue_insights", "ai"]
  );
});

test("stage weight changes which equal-level pillar comes first", () => {
  const answers = { ...all(4), gtm_design: 2 as const, data_foundations: 2 as const };
  assert.deepEqual(score(answers, "under_1m").fixFirst.map((f) => f.pillar), ["gtm_design", "data_foundations"]);
  assert.deepEqual(score(answers, "20m_50m").fixFirst.map((f) => f.pillar), ["data_foundations", "gtm_design"]);
});

test("ties break by Diagnostic pillar order", () => {
  const r = score(all(2), "5m_20m");
  // Weights at $5M-$20M: data_foundations 1.3 and team_enablement 1.3 are the top pair.
  assert.deepEqual(r.fixFirst.map((f) => f.pillar), ["data_foundations", "team_enablement"]);
  assert.equal(r.pillars.length, 7);
  assert.ok(r.pillars.every((p: { pillar: Pillar }) => pillars.includes(p.pillar)));
});
