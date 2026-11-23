/**
 * Fit tags ("type of work") for Evidence Bank cases. The owner's full taxonomy is private and
 * never in the public repo as plain text. It is loaded, in order, from:
 *   1. RN_FIT_TAGS: a path to the plain JSON on the host (never committed);
 *   2. data/fit-tags.enc: the same JSON sealed with RN_INTEL_SEED_KEY, the format of
 *      data/intel-seed.enc (base64 of iv[12] + authTag[16] + AES-256-GCM of gzip(JSON)), written by
 *      scripts/seal-fit-tags.mjs;
 *   3. the category names alone (FIT_CATEGORIES), when neither is there.
 *
 * The plain JSON: { sources: [...], categories: [{ name, slug, roles, roles_doc_summary,
 * roles_doc_section, groups: [{ name, source, tags: [...] }] }] }. Only the categories' names and
 * slugs and the groups' names and tags are kept here: `sources`, `roles` and `roles_doc_*` are
 * dropped as it loads, so they never reach a page.
 *
 * A member may also type a tag of their own (cleanTags): free text, filed under no category.
 */
import { createDecipheriv } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { EVIDENCE_LIMITS } from "./types";

/** The eight categories of the owner's taxonomy, then the two more functions cases come from. */
export const FIT_CATEGORIES = ["Sales Leadership", "Marketing", "Revenue Operations", "Sales Enablement", "Customer Success and Growth", "AI go-to-market", "Partnerships", "Sellers"] as const;
export const EXTRA_CATEGORIES = ["Finance", "Technology"] as const;

export interface FitGroup {
  name: string;
  tags: string[];
}
export interface FitCategory {
  name: string;
  slug: string;
  groups: FitGroup[];
}
export interface FitTags {
  categories: FitCategory[];
  /** Where it came from: the plain file, the sealed one, or the names only. Never shown to members. */
  from: "file" | "sealed" | "names";
}

const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const str = (x: unknown, max = 120) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The categories' names only, as the fallback. */
export const namesOnly = (): FitTags => ({ categories: [...FIT_CATEGORIES, ...EXTRA_CATEGORIES].map((name) => ({ name, slug: slugOf(name), groups: [] })), from: "names" });

/**
 * The taxonomy's JSON, read down to what pages may see: each category's name and slug, and its
 * groups' names and tags. Anything else in it is dropped. Null when it has no category.
 */
export function readTaxonomy(raw: unknown, from: FitTags["from"]): FitTags | null {
  const cats = raw && typeof raw === "object" ? (raw as { categories?: unknown }).categories : null;
  if (!Array.isArray(cats)) return null;
  const out: FitCategory[] = [];
  for (const c of cats.slice(0, 40)) {
    const name = str((c as { name?: unknown })?.name);
    if (!name) continue;
    const groups: FitGroup[] = [];
    const gs = (c as { groups?: unknown }).groups;
    for (const g of Array.isArray(gs) ? gs.slice(0, 100) : []) {
      const gname = str((g as { name?: unknown })?.name);
      const tags = (Array.isArray((g as { tags?: unknown })?.tags) ? ((g as { tags: unknown[] }).tags) : []).map((t) => str(t, EVIDENCE_LIMITS.tag)).filter(Boolean);
      if (gname || tags.length) groups.push({ name: gname, tags: [...new Set(tags)].slice(0, 400) });
    }
    out.push({ name, slug: str((c as { slug?: unknown }).slug, 60) || slugOf(name), groups });
  }
  if (!out.length) return null;
  // Finance and Technology cases are filed too, when the taxonomy doesn't have them.
  for (const extra of EXTRA_CATEGORIES) if (!out.some((c) => c.name.toLowerCase() === extra.toLowerCase())) out.push({ name: extra, slug: slugOf(extra), groups: [] });
  return { categories: out, from };
}

/** Open a sealed taxonomy (data/fit-tags.enc's format) with a base64 key. Throws when it doesn't open. */
export function openSealed(text: string, keyB64: string): unknown {
  const raw = Buffer.from(text.trim(), "base64");
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("bad key");
  const d = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(gunzipSync(Buffer.concat([d.update(raw.subarray(28)), d.final()])).toString("utf8"));
}

/** Where the taxonomy is read from, in order (the defaults: RN_FIT_TAGS, data/fit-tags.enc and RN_INTEL_SEED_KEY). */
export interface TaxonomySources {
  plainPath?: string | null;
  sealedPath?: string | null;
  key?: string | null;
}

/** Load the taxonomy from these sources, in order; the names only when none opens. Logs no content and no path. */
export function loadFitTags(src: TaxonomySources): FitTags {
  if (src.plainPath) {
    try {
      const t = readTaxonomy(JSON.parse(readFileSync(src.plainPath, "utf8")), "file");
      if (t) return t;
    } catch {
      console.error("RN_FIT_TAGS is set but the file could not be read; trying the sealed list.");
    }
  }
  if (src.sealedPath && src.key) {
    let text: string | null = null;
    try {
      text = readFileSync(src.sealedPath, "utf8");
    } catch {
      text = null;
    }
    if (text !== null)
      try {
        const t = readTaxonomy(openSealed(text, src.key), "sealed");
        if (t) return t;
      } catch {
        console.error("data/fit-tags.enc is there but could not be opened with RN_INTEL_SEED_KEY; using the category names.");
      }
  }
  return namesOnly();
}

let cache: { t: FitTags; index: Map<string, string> } | null = null;

const keyOf = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
function indexOf(t: FitTags): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of t.categories) {
    m.set(keyOf(c.name), c.name);
    for (const g of c.groups) for (const tag of g.tags) if (!m.has(keyOf(tag))) m.set(keyOf(tag), c.name);
  }
  return m;
}
function loaded() {
  if (!cache) {
    const t = loadFitTags({ plainPath: process.env.RN_FIT_TAGS?.trim() || null, sealedPath: path.join(process.cwd(), "data", "fit-tags.enc"), key: process.env.RN_INTEL_SEED_KEY || null });
    cache = { t, index: indexOf(t) };
  }
  return cache;
}

/** The taxonomy, loaded once: categories, each with its groups' names and tags. Tags only, never sources or role documents. */
export function fitTags(): { categories: { name: string; slug: string; groups: { name: string; tags: string[] }[] }[] } {
  return { categories: loaded().t.categories };
}
/** For tests and a reload after the file changes. */
export function resetFitTags(t?: FitTags): void {
  cache = t ? { t, index: indexOf(t) } : null;
}
/** Where the list came from (for the owner's checks, never a member's page). */
export const fitTagsFrom = (): FitTags["from"] => loaded().t.from;

/** The category a tag is filed under, or null for a tag a member typed. A category's own name is filed under itself. */
export function categoryOf(tag: string): string | null {
  return loaded().index.get(keyOf(tag)) ?? null;
}

/** Every known tag with its category, flat (the picker's search). */
export function allTags(): { name: string; category: string }[] {
  const out: { name: string; category: string }[] = [];
  for (const c of loaded().t.categories) for (const g of c.groups) for (const name of g.tags) out.push({ name, category: c.name });
  return out;
}

/**
 * Tags as kept: trimmed, control characters out, at most EVIDENCE_LIMITS.tags of up to
 * EVIDENCE_LIMITS.tag characters, no repeats (ignoring case). A known tag takes the list's spelling.
 */
export function cleanTags(raw: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const idx = loaded().t;
  const spelled = new Map<string, string>();
  for (const c of idx.categories) {
    spelled.set(keyOf(c.name), c.name);
    for (const g of c.groups) for (const t of g.tags) spelled.set(keyOf(t), t);
  }
  for (const x of Array.isArray(raw) ? raw : []) {
    // eslint-disable-next-line no-control-regex
    const t = str(typeof x === "string" ? x.replace(/[\u0000-\u001f\u007f]/g, "") : "", EVIDENCE_LIMITS.tag);
    if (!t) continue;
    const k = keyOf(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(spelled.get(k) ?? t);
    if (out.length >= EVIDENCE_LIMITS.tags) break;
  }
  return out;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Tags a case's "What did you do?" answer names, by Merlin's rules (no AI): every known tag whose
 * words appear in it, longest first, at most `max`. Deterministic: the same text gives the same tags.
 */
export function suggestTags(text: string, max = 6): { name: string; category: string }[] {
  const t = ` ${String(text ?? "").toLowerCase().replace(/\s+/g, " ")} `;
  if (t.trim().length < 3) return [];
  const hits = allTags()
    .filter((x) => x.name.length >= 3 && new RegExp(`(^|[^a-z0-9])${esc(x.name.toLowerCase())}($|[^a-z0-9])`).test(t))
    .sort((a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name));
  const out: { name: string; category: string }[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    if (seen.has(keyOf(h.name))) continue;
    seen.add(keyOf(h.name));
    out.push(h);
    if (out.length >= max) break;
  }
  return out;
}
