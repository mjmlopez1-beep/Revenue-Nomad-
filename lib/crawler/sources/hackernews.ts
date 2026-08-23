import type { RawJob } from "../../types";
import { fetchJson } from "../fetch";

/**
 * Hacker News via the Algolia search API (public, no key). Searches stories
 * AND comments, which catches the monthly "Ask HN: Who is hiring?" threads
 * and organic chatter from founders looking for fractional GTM help.
 */
export const name = "hackernews";

const QUERIES = [
  '"fractional cmo"',
  '"fractional cro"',
  '"fractional gtm"',
  '"fractional marketing"',
  '"fractional sales"',
  '"fractional head of"',
  '"interim cmo"',
  '"interim vp sales"',
];

const WINDOW_DAYS = 90;

interface AlgoliaHit {
  objectID: string;
  author: string;
  created_at_i: number;
  title?: string; // stories
  url?: string; // stories with external link
  story_title?: string; // comments
  story_text?: string;
  comment_text?: string;
}

interface AlgoliaResponse {
  hits: AlgoliaHit[];
}

// Only surface items where someone plausibly wants to hire, not think-pieces.
const HIRING_INTENT =
  /\b(hiring|looking for|seeking|we need|need a|need an|open role|engagement|help us|part[\s-]?time|contract|hire|paid)\b/i;

export async function fetchJobs(): Promise<RawJob[]> {
  const since = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 24 * 3600;
  const responses = await Promise.all(
    QUERIES.map((q) =>
      fetchJson<AlgoliaResponse>(
        `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=(story,comment)&hitsPerPage=50&numericFilters=created_at_i>${since}`
      )
    )
  );

  const out: RawJob[] = [];
  const seen = new Set<string>();
  for (const res of responses) {
    for (const hit of res.hits || []) {
      if (seen.has(hit.objectID)) continue;
      seen.add(hit.objectID);
      const body = hit.comment_text || hit.story_text || "";
      const isComment = !!hit.comment_text;
      const context = hit.title || hit.story_title || "";
      if (!HIRING_INTENT.test(`${context} ${body}`)) continue;
      out.push({
        title: isComment ? `${context || "HN thread"} — comment by ${hit.author}` : context,
        company: hit.author,
        location: "See thread",
        url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        source: name,
        kind: "discussion",
        postedAt: new Date(hit.created_at_i * 1000).toISOString(),
        description: body || context,
      });
    }
  }
  return out;
}
