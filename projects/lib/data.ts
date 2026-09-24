import operatorsSeed from "../seed/operators.json";
import buyersSeed from "../seed/buyers.json";
import projectsSeed from "../seed/projects.json";
import type { Buyer, Operator, OperatorState } from "./types";
import { titleCase } from "./format";

export const OPERATORS: Operator[] = operatorsSeed as unknown as Operator[];
export const BUYERS: Buyer[] = buyersSeed as Buyer[];
export const SEED_PROJECTS = projectsSeed as unknown as Record<string, unknown>[];

export const ADMIN = { id: "admin-matt", name: "Matt Lopez", email: "matt@revenuenomad.com" };
export const DEFAULT_OPERATOR_NAME = "Tim Evans";

const byId = new Map(OPERATORS.map((o) => [o.id, o]));
const bySlug = new Map(OPERATORS.map((o) => [o.slug, o]));

export function operatorById(id: string): Operator | undefined {
  return byId.get(id);
}
export function operatorBySlug(slug: string): Operator | undefined {
  return bySlug.get(slug) || byId.get(slug);
}
export function buyerById(id: string | undefined): Buyer | undefined {
  return BUYERS.find((b) => b.id === id);
}
export function defaultOperatorId(): string {
  return (OPERATORS.find((o) => o.name === DEFAULT_OPERATOR_NAME) || OPERATORS[0]).id;
}

/** Map every category label variant to one enum (gap G10). */
export function normalizeCategory(cat: string): string {
  if (/customer success/i.test(cat)) return "Customer Success & Growth";
  return cat;
}

export const CATEGORIES = [
  "Sales Leadership",
  "Sellers",
  "Customer Success & Growth",
  "Revenue Operations",
  "Sales Enablement",
  "AI GTM",
  "Marketing",
  "Partnerships",
];

export function displayName(o: { name: string }): string {
  return titleCase(o.name);
}

export function operatorEmail(o: Operator): string {
  return `${o.name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@operators.example`;
}

let assetBase = "/rnp/";
let explorerMode: "local" | "artifact" = "local";
export function configureAssets(base: string, mode: "local" | "artifact") {
  assetBase = base;
  explorerMode = mode;
}
export function photoUrl(o: Operator): string | null {
  if (!o.photo) return null;
  return assetBase + o.photo;
}
export function explorerUrl(o: Operator): string {
  return explorerMode === "local" ? `${assetBase}explorer.html#${o.slug}` : o.explorerUrl;
}

export function defaultOperatorState(o: Operator): OperatorState {
  return {
    lastConfirmedAt: o.lastConfirmedAt ?? null,
    alertPrefs: [normalizeCategory(o.cat)],
    availability: null,
    availableFrom: o.availableFrom ?? null,
    hoursPerMonth: null,
  };
}

/** Profile completeness (gap G7): so a low score on a thin profile reads differently from a poor fit. */
export function completeness(o: Operator): { pct: number; missing: string[] } {
  const checks: [boolean, string][] = [
    [!!o.photo, "a photo"],
    [o.rate != null, "an hourly rate"],
    [(o.allTags || []).length > 6, "more than 6 skills"],
    [(o.eng || 0) > 0, "an engagement"],
    [(o.rev || 0) > 0, "a client review"],
    [!!o.timezone, "a time zone"],
    [(o.verifiedTags || []).length > 0, "a verified skill"],
  ];
  const done = checks.filter((c) => c[0]).length;
  return { pct: Math.round((done / checks.length) * 100), missing: checks.filter((c) => !c[0]).map((c) => c[1]) };
}

export function searchHaystack(o: Operator): string {
  return [o.name, o.role, o.cat, normalizeCategory(o.cat), o.headline, o.loc, ...(o.allTags || []), ...(o.allIndustries || []), ...(o.industries || [])]
    .join(" | ")
    .toLowerCase();
}

/** Every whitespace-separated token must appear somewhere on the profile. */
export function matchesQuery(o: Operator, q: string): boolean {
  const hay = searchHaystack(o);
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  return toks.every((t) => hay.includes(t));
}

/** Stable order for every operator list: score then id (gap G1). */
export function stableSort<T extends { id: string }>(arr: T[], score: (x: T) => number): T[] {
  return [...arr].sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export const CHECK_HOURS_AT = 120;
