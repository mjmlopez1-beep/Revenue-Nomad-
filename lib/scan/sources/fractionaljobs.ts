/**
 * fractionaljobs.io for the weekly scan. The board only lists fractional work and has no public
 * API, so this reads the job cards on the home page. Each card carries the company, the role,
 * hours a week, the rate, the board's own function label, the posting date and, for a named
 * company, a link to its website.
 *
 * The older reader in lib/crawler/sources/fractionaljobs.ts takes the job link's text, which is
 * empty on the live site, so the scan uses this one. If the markup changes and no card parses,
 * the source reports 0 rather than failing.
 */
import { fetchText } from "../../crawler/fetch";
import { plain } from "../clean";
import type { ScanRawJob } from "../collect";

export const name = "fractionaljobs";

const BASE = "https://www.fractionaljobs.io";
/** A card starts at an element whose class list has the whole word "job-item" ("job-item_flex" is a part inside it). */
const CARD_START = /<[a-z0-9]+\b[^>]*\bclass="(?:[^"]*\s)?job-item(?:\s[^"]*)?"[^>]*>/gi;

export async function fetchJobs(): Promise<ScanRawJob[]> {
  return parseFractionalJobs(await fetchText(BASE + "/"));
}

/** "15 - 20 hrs" -> 18, "16 hrs" -> 16. Hours a week, as the board states them. */
export function hoursFromText(text: string): number | null {
  const m = text.match(/(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?\s*\+?\s*(?:hrs?|hours?)\b/i);
  if (!m) return null;
  const n = m[2] ? Math.round((Number(m[1]) + Number(m[2])) / 2) : Number(m[1]);
  return n >= 1 && n <= 80 ? n : null;
}

const titleCase = (slug: string) => slug.split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export function parseFractionalJobs(html: string): ScanRawJob[] {
  const starts = [...html.matchAll(CARD_START)].map((m) => m.index);
  const out: ScanRawJob[] = [];
  const seen = new Set<string>();

  starts.forEach((start, i) => {
    // One card, cut off at the next one. The cap keeps the last card from reading on into the rest of the page.
    const card = html.slice(start, Math.min(starts[i + 1] ?? html.length, start + 8000));

    const link = card.match(/href="((?:https?:\/\/(?:www\.)?fractionaljobs\.io)?\/jobs?\/([^"#?/]+))\/?"/i);
    if (!link || seen.has(link[2])) return;
    seen.add(link[2]);

    // The headline is "Company - Role" in separate heading tags, with the dash in its own tag.
    const heads = [...card.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)].map((m) => plain(m[1])).filter((t) => /[\p{L}\p{N}]/u.test(t));
    let company = heads[0] ?? "";
    let title = heads[1] ?? "";
    if (!title) {
      // No headline to read. The link is "/jobs/<role>-at-<company>".
      const at = link[2].lastIndexOf("-at-");
      if (at <= 0) return;
      title = titleCase(link[2].slice(0, at));
      company = company || titleCase(link[2].slice(at + 4));
    }

    // The company's own website. On a card for an unnamed company the link is hidden and points nowhere.
    const site = card.match(/<a\b[^>]*\bjob-item_company-link\b[^>]*>/i)?.[0] ?? "";
    const siteHref = /w-condition-invisible/.test(site) ? "" : (site.match(/\bhref="([^"]+)"/i)?.[1] ?? "");
    const companyUrl = /^https?:\/\/(?!(?:www\.)?fractionaljobs\.io)[^#\s]+\.[a-z]{2,}/i.test(siteHref) ? siteHref : undefined;

    // The facts line: hours a week, the rate and where, in any order.
    const facts = card.match(/job-item_more-info[\s\S]*?(?=class="hide"|job-item_date|$)/i)?.[0] ?? "";
    const parts = [...facts.matchAll(/<div\b[^>]*>([^<]*)<\/div>/gi)].map((m) => plain(m[1])).filter((t) => /[\p{L}\p{N}]/u.test(t));
    const hoursText = parts.find((t) => /\b(?:hrs?|hours?)\b/i.test(t) && !/[$€£]/.test(t));
    const rate = parts.find((t) => /[$€£]\s?\d/.test(t));
    const location = parts.find((t) => t !== hoursText && t !== rate);
    const hoursPerWeek = hoursText ? hoursFromText(hoursText) : null;

    const fn = plain(card.match(/fs-cmsfilter-field="function"[^>]*>([^<]*)</i)?.[1] ?? "");
    const dateText = plain(card.match(/class="date"[^>]*>([^<]*)</i)?.[1] ?? "");
    const posted = dateText ? Date.parse(`${dateText} UTC`) : NaN;

    out.push({
      title,
      company,
      location: location || "Remote",
      url: BASE + "/jobs/" + link[2],
      source: name,
      kind: "listing",
      postedAt: Number.isNaN(posted) ? undefined : new Date(posted).toISOString(),
      // What the scorer reads. The company and the place stay out, so a name like "Pipeline Health"
      // can't make a finance seat look like a sales one.
      description: [
        "Fractional role listed on Fractional Jobs.",
        fn ? `Function: ${fn}.` : "",
        hoursPerWeek ? `${hoursPerWeek} hrs per week.` : "",
      ].filter(Boolean).join(" "),
      fractionalBoard: true,
      companyUrl,
      rate: rate || undefined,
      hoursPerWeek: hoursPerWeek ?? undefined,
      functionHint: fn || undefined,
    });
  });
  return out;
}
