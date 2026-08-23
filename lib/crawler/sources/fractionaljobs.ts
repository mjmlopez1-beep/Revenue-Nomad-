import type { RawJob } from "../../types";
import { fetchText } from "../fetch";

/**
 * fractionaljobs.io — a board dedicated to fractional roles. No public API,
 * so this parses listing links out of the HTML. Deliberately tolerant: if the
 * markup changes and nothing matches, the source reports 0 rather than erroring.
 */
export const name = "fractionaljobs";

const BASE = "https://www.fractionaljobs.io";

export async function fetchJobs(): Promise<RawJob[]> {
  const html = await fetchText(BASE + "/");
  const out: RawJob[] = [];
  const seen = new Set<string>();

  // Listing links look like <a href="/jobs/<slug>" ...> with the role title
  // (and usually the company) somewhere in the anchor's text content.
  const linkRe = /<a[^>]+href="(\/jobs?\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const path = m[1];
    if (seen.has(path)) continue;
    seen.add(path);
    const text = m[2]
      .replace(/<[^>]+>/g, " | ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    // Anchor text is pipe-separated fragments: first meaningful one is the
    // title; a fragment after "at" or the second fragment is the company.
    const parts = text.split("|").map((s) => s.trim()).filter((s) => s.length > 1);
    if (parts.length === 0) continue;
    const title = parts[0];
    if (title.length < 5 || /^(jobs?|post|apply|learn more|view)$/i.test(title)) continue;
    const atMatch = title.match(/^(.*?)\s+at\s+(.+)$/i);
    out.push({
      title: atMatch ? atMatch[1] : title,
      company: atMatch ? atMatch[2] : parts[1] || "See listing",
      location: "Remote",
      url: BASE + path,
      source: name,
      kind: "listing",
      // Board is fractional-only; make sure the scorer sees the signal even
      // when the anchor text is just a bare title.
      description: `Fractional role listed on fractionaljobs.io: ${text}`,
    });
  }
  return out;
}
