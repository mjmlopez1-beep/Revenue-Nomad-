import type { EngagePage } from "./types";
import fractional from "./fractional";
import fullTime from "./full-time";
import interim from "./interim";

/** The three "How we engage" pages, keyed by the slug under /how-we-engage (see app/home/content/links.ts). */
export const pages = {
  fractional,
  interim,
  "full-time": fullTime,
} satisfies Record<EngagePage["slug"], EngagePage>;

export type EngageSlug = keyof typeof pages;

export const engagePaths = Object.keys(pages) as EngageSlug[];

export const engageBySlug = (slug: string): EngagePage | undefined => (slug in pages ? pages[slug as EngageSlug] : undefined);
