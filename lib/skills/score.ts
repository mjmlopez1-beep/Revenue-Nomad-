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
  /** Operator Overview paragraph from the profile. */
  bio?: string;
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
  reviews?: ReviewRecord[];
  details?: ProfileDetails;
}

export interface EngagementRecord {
  company: string;
  role: string;
  start: string; // YYYY-MM
  end: string; // YYYY-MM
  months: number;
  revenueBand: string;
  clientVerified: boolean;
  /** Outcome as written on the engagement, and short result lines drawn from it. */
  outcome?: string;
  results?: string[];
}

/** Profile facts beyond skills: identity, fit, engagement history. */
export interface ProfileDetails {
  photo?: string;
  timezone: string;
  availability: { status: string; startDate: string; hoursPerMonth: number };
  industries: string[];
  snapshot: {
    largestTeam: string;
    largestQuota: string;
    motions: string[];
    salesCycle: string;
    methodologies: string[];
  };
  bestFor: string[];
  engagements: EngagementRecord[];
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
  quote?: string;
}

export interface ProfileDoc {
  name: string;
  title: string;
  loc: string;
  desc: string;
  bio?: string;
  profile: NonNullable<SkillOperator["profile"]>;
  reviews: ReviewRecord[];
  /** Every tag on the profile with the qualifying reviews that confirm it. */
  tags: { name: string; reviews: number }[];
  /** Profile tag names missing from the taxonomy → the taxonomy tag whose group places them. */
  placementAlias: Record<string, string>;
  details?: ProfileDetails;
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

// Tag name → first placement in the taxonomy, for profile data that carries
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

// Compare tag names loosely: the live site re-cases names and drops hyphens.
const norm = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Build a scoring operator from a live profile: its tag list carries each
 * tag's review count, and the reviews supply which clients confirmed it.
 */
export function operatorFromProfile(doc: ProfileDoc): SkillOperator {
  const tags: OperatorTag[] = [];
  for (const { name, reviews } of doc.tags) {
    const place = byName.get((doc.placementAlias[name] ?? name).toLowerCase());
    if (!place) continue;
    const confirmedBy = doc.reviews.filter((r) => r.tags.some((t) => norm(t) === norm(name))).map((r) => r.company);
    tags.push({ t: name, ...place, s: tierFor(tagScore(reviews)), r: reviews, e: confirmedBy });
  }
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const cores = doc.reviews.map((r) => r.core).filter((c): c is number[] => c != null);
  return {
    name: doc.name,
    title: doc.title,
    loc: doc.loc,
    desc: doc.desc,
    bio: doc.bio,
    tags,
    core: {
      n: doc.reviews.length,
      v: CORE_CRITERIA.map((_, i) => avg(cores.map((c) => c[i]))),
      overall: avg(doc.reviews.map((r) => r.overall)) ?? undefined,
    },
    profile: doc.profile,
    sample: false,
    reviews: doc.reviews,
    details: doc.details,
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
