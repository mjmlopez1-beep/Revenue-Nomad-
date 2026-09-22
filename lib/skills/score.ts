// Operator skill scoring: tag scores, tiers, and the group / stage / axis
// aggregates that drive the capability radar and buyer-journey map.
// Rules live in data/skills/scoring.json; this module implements them.

import taxonomy from "@/data/skills/taxonomy.json";
import stagesDoc from "@/data/skills/stages.json";
import scoring from "@/data/skills/scoring.json";

export type Tier = "claimed" | "verified" | "expert";

export interface OperatorTag {
  t: string; // tag name
  c: string; // category
  g: string; // group
  s: Tier; // tier as stored on the profile
  r: number; // client reviews backing this tag
  e: string[]; // evidence: named engagements
}

export interface SkillOperator {
  name: string;
  title: string;
  loc: string;
  desc: string;
  tags: OperatorTag[];
  core: { n: number; v: number[] };
}

export interface ScoredTag extends OperatorTag {
  score: number | null;
  tier: Tier;
  axis: string;
  stage: string; // a buyer-journey stage name, or "foundation"
}

/** Aggregate for a group, stage or axis. */
export interface Aggregate {
  /** Average of the top three verified tag scores; null when none verified. */
  score: number | null;
  /** True when there are tags but every one is claimed (drawn on the inner ring). */
  claimedOnly: boolean;
  tags: ScoredTag[];
}

export const AXES: string[] = scoring.radar_axes;
export const STAGES = stagesDoc.stages;
export const FOUNDATION = stagesDoc.foundation;

// (category, group) → placement. Tag names repeat across groups, so the
// operator's own category + group is the key, never the tag name alone.
const placement = new Map<string, { axis: string; stage: string }>();
for (const cat of taxonomy) {
  for (const grp of cat.groups) {
    placement.set(`${cat.category}::${grp.group}`, { axis: grp.axis, stage: grp.stage });
  }
}

export function tagScore(reviews: number): number | null {
  const table = scoring.tag_score_by_review_count as Record<string, number | null>;
  if (reviews >= 10) return table["10+"];
  return table[String(Math.max(0, Math.floor(reviews)))] ?? null;
}

export function tierFor(score: number | null): Tier {
  if (score == null) return "claimed";
  return score >= 85 ? "expert" : "verified";
}

export function scoreTags(op: SkillOperator): ScoredTag[] {
  return op.tags.map((tag) => {
    const score = tagScore(tag.r);
    const place = placement.get(`${tag.c}::${tag.g}`) ?? { axis: "", stage: "" };
    return { ...tag, score, tier: tierFor(score), ...place };
  });
}

export function aggregate(tags: ScoredTag[]): Aggregate {
  const top = tags
    .map((t) => t.score)
    .filter((s): s is number => s != null)
    .sort((a, b) => b - a)
    .slice(0, 3);
  const score = top.length ? Math.round(top.reduce((a, b) => a + b, 0) / top.length) : null;
  return { score, claimedOnly: score == null && tags.length > 0, tags };
}

export interface SkillMap {
  tags: ScoredTag[];
  axes: Record<string, Aggregate>;
  stages: Record<string, Aggregate>;
  /** Foundation tiles: foundation-stage tags split by their axis. */
  foundation: Record<string, Aggregate>;
  groups: { category: string; group: string; agg: Aggregate }[];
  fitPoints: number;
}

export function buildSkillMap(op: SkillOperator): SkillMap {
  const tags = scoreTags(op);
  const axes: Record<string, Aggregate> = {};
  for (const axis of AXES) axes[axis] = aggregate(tags.filter((t) => t.axis === axis));
  const stages: Record<string, Aggregate> = {};
  for (const st of STAGES) stages[st.name] = aggregate(tags.filter((t) => t.stage === st.name));
  const foundation: Record<string, Aggregate> = {};
  for (const f of FOUNDATION) {
    foundation[f.name] = aggregate(tags.filter((t) => t.stage === "foundation" && t.axis === f.name));
  }

  const byGroup = new Map<string, ScoredTag[]>();
  for (const t of tags) {
    const key = `${t.c}::${t.g}`;
    byGroup.set(key, [...(byGroup.get(key) ?? []), t]);
  }
  const groups = [...byGroup.entries()]
    .map(([key, list]) => {
      const [category, group] = key.split("::");
      const sorted = [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      return { category, group, agg: aggregate(sorted) };
    })
    .sort((a, b) => (b.agg.score ?? 0) - (a.agg.score ?? 0) || b.agg.tags.length - a.agg.tags.length);

  return { tags, axes, stages, foundation, groups, fitPoints: fitTagPoints(tags) };
}

/** Reputation Index fit points: top 8 verified tags, expert 3 / verified 1.5, cap 18. */
export function fitTagPoints(tags: ScoredTag[]): number {
  const pts = tags
    .filter((t) => t.tier !== "claimed")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 8)
    .reduce((sum, t) => sum + (t.tier === "expert" ? 3 : 1.5), 0);
  return Math.min(18, pts);
}
