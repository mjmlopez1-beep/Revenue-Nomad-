import type { RawJob } from "../../types";
import { fetchText } from "../fetch";

export const name = "weworkremotely";

const FEEDS = [
  "https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss",
  "https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss",
];

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return "";
  return m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

export async function fetchJobs(): Promise<RawJob[]> {
  const out: RawJob[] = [];
  const feeds = await Promise.all(FEEDS.map((feed) => fetchText(feed)));
  for (const xml of feeds) {
    const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
    for (const item of items) {
      const rawTitle = tag(item, "title");
      // WWR titles look like "Company: Job Title"
      const sep = rawTitle.indexOf(":");
      const company = sep > 0 ? rawTitle.slice(0, sep).trim() : "Unknown";
      const title = sep > 0 ? rawTitle.slice(sep + 1).trim() : rawTitle;
      const url = tag(item, "link");
      if (!title || !url) continue;
      out.push({
        title,
        company,
        location: tag(item, "region") || "Remote",
        url,
        source: name,
        postedAt: tag(item, "pubDate"),
        description: tag(item, "description"),
      });
    }
  }
  return out;
}
