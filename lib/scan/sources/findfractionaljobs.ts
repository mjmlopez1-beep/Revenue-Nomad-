/**
 * findfractionaljobs.com for the weekly scan, through its public RSS feed of job listings
 * (WordPress Job Manager, /?feed=job_feed). The board lists only fractional work, and its
 * robots.txt allows every agent. Each item carries the title, the link, the posting date, the
 * body, and the board's own fields: the company, the job type, the category and the place. An
 * item with no company is left for the screen to drop (no real company). If the feed changes and
 * no item parses, the source reports 0 rather than failing.
 */
import { fetchText } from "../../crawler/fetch";
import { plain } from "../clean";
import type { ScanRawJob } from "../collect";

export const name = "findfractionaljobs";

const FEED = "https://findfractionaljobs.com/?feed=job_feed";

export async function fetchJobs(): Promise<ScanRawJob[]> {
  return parseJobFeed(await fetchText(FEED));
}

/** The text of one tag, CDATA or not. Empty when it is missing. */
function tag(item: string, name: string): string {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = item.match(new RegExp(`<${esc}\\b[^>]*>([\\s\\S]*?)<\\/${esc}>`, "i"));
  if (!m) return "";
  const cdata = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata ? cdata[1] : m[1];
}

export function parseJobFeed(xml: string): ScanRawJob[] {
  const out: ScanRawJob[] = [];
  const seen = new Set<string>();
  for (const m of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const item = m[1];
    const url = plain(tag(item, "link"));
    const title = plain(tag(item, "title"));
    if (!/^https?:\/\//i.test(url) || !title || seen.has(url)) continue;
    seen.add(url);
    const posted = Date.parse(plain(tag(item, "pubDate")));
    const category = plain(tag(item, "job_listing:job_category"));
    const type = plain(tag(item, "job_listing:job_type"));
    const body = tag(item, "content:encoded") || tag(item, "description");
    out.push({
      title,
      company: plain(tag(item, "job_listing:company")),
      location: plain(tag(item, "job_listing:location")) || "Remote",
      url,
      source: name,
      kind: "listing",
      postedAt: Number.isNaN(posted) ? undefined : new Date(posted).toISOString(),
      description: [body, type ? `<p>Job type: ${type}.</p>` : ""].filter(Boolean).join(" "),
      fractionalBoard: true,
      // "Accounting / Finance, Executive": the first is the board's function for it.
      functionHint: category.split(",")[0]?.trim() || undefined,
    });
  }
  return out;
}
