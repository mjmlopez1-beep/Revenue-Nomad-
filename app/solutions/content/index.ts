import type { RolePage } from "./types";
import aiGtm from "./fractional-ai-gtm";
import cmo from "./fractional-cmo";
import revops from "./fractional-revops";
import vpSales from "./fractional-vp-of-sales";

/** The four role pages, keyed by the flat route under the site root (see app/home/content/links.ts). */
export const pages = {
  "fractional-vp-of-sales": vpSales,
  "fractional-cmo": cmo,
  "fractional-revops": revops,
  "fractional-ai-gtm": aiGtm,
} satisfies Record<string, RolePage>;

export type RoleSlug = keyof typeof pages;

export const rolePaths = Object.keys(pages) as RoleSlug[];

export const roleBySlug = (slug: string): RolePage | undefined => (slug in pages ? pages[slug as RoleSlug] : undefined);
