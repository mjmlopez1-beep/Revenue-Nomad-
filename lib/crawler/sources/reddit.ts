import type { RawJob } from "../../types";
import { fetchJson } from "../fetch";

/**
 * Reddit search via the public JSON endpoints (no key). Surfaces posts where
 * founders and operators talk about hiring fractional GTM help. Reddit
 * throttles some cloud IPs — this source degrades gracefully when it 403s.
 */
export const name = "reddit";

const QUERIES = [
  '"fractional cmo"',
  '"fractional cro"',
  '"fractional gtm"',
  '"fractional marketing" hiring',
  '"fractional sales" hiring',
  '"interim cmo"',
];

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    author: string;
    subreddit: string;
    permalink: string;
    created_utc: number;
  };
}

interface RedditResponse {
  data: { children: RedditPost[] };
}

export async function fetchJobs(): Promise<RawJob[]> {
  const responses = await Promise.all(
    QUERIES.map((q) =>
      fetchJson<RedditResponse>(
        `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&t=month&limit=50&raw_json=1`
      )
    )
  );

  const out: RawJob[] = [];
  const seen = new Set<string>();
  for (const res of responses) {
    for (const post of res.data?.children || []) {
      const p = post.data;
      if (!p?.id || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({
        title: p.title,
        company: `u/${p.author} · r/${p.subreddit}`,
        location: "See thread",
        url: `https://www.reddit.com${p.permalink}`,
        source: name,
        kind: "discussion",
        postedAt: new Date(p.created_utc * 1000).toISOString(),
        description: p.selftext || p.title,
      });
    }
  }
  return out;
}
