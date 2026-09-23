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
  /** n reviews; v = CORE criterion averages (null when not published); overall = avg star rating. */
  core: { n: number; v: (number | null)[]; overall?: number };
  profile?: {
    reputationIndex: number;
    reputationLabel: string;
    engagements: number;
    wouldHireAgain: number;
    totalTags: number;
  };
  /** True for illustrative operators, false for data taken from a live profile. */
  sample?: boolean;
}

/** A client review as exported from the platform (CORE may be unpublished). */
export interface ReviewRecord {
  reviewer: string;
  role: string;
  company: string;
  date: string;
  overall: number;
  core: number[] | null;
  hireAgain: boolean;
  tags: string[];
}

export interface ProfileDoc {
  name: string;
  title: string;
  loc: string;
  desc: string;
  profile: NonNullable<SkillOperator["profile"]>;
  reviews: ReviewRecord[];
  /** Old tag names still on the live profile → their name in the current taxonomy. */
  legacyTagMap: Record<string, string>;
}

export interface ScoredTag extends OperatorTag {
  score: number;
  tier: Tier;
  axis: string;
  stage: string; // a buyer-journey stage name, or "foundation"
}

/** Aggregate for a group, stage or axis. */
export interface Aggregate {
  /** Average of the top three verified tag scores; the claimed score when
   *  every tag is claimed; null when there are no tags at all. */
  score: number | null;
  /** True when there are tags but every one is claimed (sits on the inner ring). */
  claimedOnly: boolean;
  tags: ScoredTag[];
}

export const AXES: string[] = scoring.radar_axes;
/** Lowest score a tag can have: a self-claimed tag with no reviews. */
export const SCORE_FLOOR: number = scoring.radar_floor;
export const CORE_CRITERIA: string[] = scoring.core.criteria;
export const CORE_SCALE: number[] = scoring.core.scale;
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

// Tag name → first placement in the taxonomy, for review data that carries
// tag names only. Case-insensitive, since the live site re-cases tag names.
const byName = new Map<string, { c: string; g: string }>();
for (const cat of taxonomy) {
  for (const grp of cat.groups) {
    for (const tag of grp.tags) {
      const key = tag.toLowerCase();
      if (!byName.has(key)) byName.set(key, { c: cat.category, g: grp.group });
    }
  }
}

/**
 * Build a scoring operator from real review records: every review confirms
 * its tags, so a tag's review count is the number of reviews that list it.
 */
export function operatorFromReviews(doc: ProfileDoc): SkillOperator {
  const tags = new Map<string, OperatorTag>();
  for (const review of doc.reviews) {
    for (const raw of review.tags) {
      const name = doc.legacyTagMap[raw] ?? raw;
      const place = byName.get(name.toLowerCase());
      if (!place) continue;
      const key = name.toLowerCase();
      const tag = tags.get(key) ?? { t: name, ...place, s: "claimed" as Tier, r: 0, e: [] };
      tag.r += 1;
      if (!tag.e.includes(review.company)) tag.e.push(review.company);
      tags.set(key, tag);
    }
  }
  const list = [...tags.values()].map((t) => ({ ...t, s: tierFor(tagScore(t.r)) }));
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const cores = doc.reviews.map((r) => r.core).filter((c): c is number[] => c != null);
  return {
    name: doc.name,
    title: doc.title,
    loc: doc.loc,
    desc: doc.desc,
    tags: list,
    core: {
      n: doc.reviews.length,
      v: CORE_CRITERIA.map((_, i) => avg(cores.map((c) => c[i]))),
      overall: avg(doc.reviews.map((r) => r.overall)) ?? undefined,
    },
    profile: doc.profile,
    sample: false,
  };
}

export function tagScore(reviews: number): number {
  const table = scoring.tag_score_by_review_count as Record<string, number>;
  if (reviews >= 10) return table["10+"];
  return table[String(Math.max(0, Math.floor(reviews)))] ?? SCORE_FLOOR;
}

export function tierFor(score: number): Tier {
  if (score <= SCORE_FLOOR) return "claimed";
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
    .filter((t) => t.tier !== "claimed")
    .map((t) => t.score)
    .sort((a, b) => b - a)
    .slice(0, 3);
  if (top.length) {
    return { score: Math.round(top.reduce((a, b) => a + b, 0) / top.length), claimedOnly: false, tags };
  }
  return { score: tags.length ? SCORE_FLOOR : null, claimedOnly: tags.length > 0, tags };
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
      const sorted = [...list].sort((a, b) => b.score - a.score);
      return { category, group, agg: aggregate(sorted) };
    })
    .sort((a, b) => (b.agg.score ?? 0) - (a.agg.score ?? 0) || b.agg.tags.length - a.agg.tags.length);

  return { tags, axes, stages, foundation, groups, fitPoints: fitTagPoints(tags) };
}

/** Reputation Index fit points: top 8 verified tags, expert 3 / verified 1.5, cap 18. */
export function fitTagPoints(tags: ScoredTag[]): number {
  const pts = tags
    .filter((t) => t.tier !== "claimed")
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .reduce((sum, t) => sum + (t.tier === "expert" ? 3 : 1.5), 0);
  return Math.min(18, pts);
}
