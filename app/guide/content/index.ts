import type { Chapter } from "./types";
import { chapters } from "./guide";

/** Loads a chapter's content module by slug. Returns null when the slug is unknown or the file is missing. */
export async function loadChapter(slug: string): Promise<Chapter | null> {
  if (!chapters.some((c) => c.slug === slug)) return null;
  try {
    const mod = (await import(`./${slug}.ts`)) as { default: Chapter };
    return mod.default;
  } catch {
    return null;
  }
}
