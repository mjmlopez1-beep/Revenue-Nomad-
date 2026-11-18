/**
 * freehire.me for the weekly scan, through its public JSON API (it asks bots to use the API, not
 * the pages, in its robots.txt and llms.txt). freehire aggregates company career boards, and each
 * posting's `url` is the employer's own application page, so a role it shares with another board
 * keeps the company's link (bestPosting in lib/scan/clean.ts).
 *
 * freehire's terms let anyone read the API for personal use, but showing its postings in a product
 * for others needs one of its API plans. So this source runs only when RN_FREEHIRE_KEY holds the
 * plan's key (sent as a Bearer token); without it the scan leaves freehire out (see scanSources in
 * lib/scan/collect.ts). Searches stay well under its limits: a few requests a run.
 */
import { fetchWithTimeout } from "../../crawler/fetch";
import type { ScanRawJob } from "../collect";

export const name = "freehire";

const BASE = "https://freehire.me/api/v1/agent/jobs/search";
const SEARCHES = ["fractional", "interim"];
const UA = "job-scan/1.0";

/** Whether the key is set: the source runs only then. */
export const configured = () => !!process.env.RN_FREEHIRE_KEY?.trim();

export async function fetchJobs(): Promise<ScanRawJob[]> {
  const key = process.env.RN_FREEHIRE_KEY?.trim();
  if (!key) return [];
  const out: ScanRawJob[] = [];
  for (const q of SEARCHES) {
    const url = `${BASE}?q=${encodeURIComponent(q)}&limit=100&posted_within_days=60&description_format=text`;
    const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${key}`, "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} from freehire.me`);
    out.push(...parseFreehire(await res.json()));
  }
  return out;
}

type Obj = Record<string, unknown>;
const str = (x: unknown) => (typeof x === "string" ? x : "");

/** One search answer ({ data: [...] }) as raw jobs. Closed postings and ones a recruiter posts for a client are left out. */
export function parseFreehire(body: unknown): ScanRawJob[] {
  const data = (body && typeof body === "object" ? (body as Obj).data : null) as unknown;
  if (!Array.isArray(data)) return [];
  const out: ScanRawJob[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const j = raw as Obj;
    if (j.closed_at || j.via_recruiter === true) continue;
    const slug = str(j.public_slug);
    const url = /^https?:\/\//i.test(str(j.url)) ? str(j.url) : slug ? `https://freehire.me/jobs/${encodeURIComponent(slug)}` : "";
    const title = str(j.title);
    if (!url || !title) continue;
    const enrich = (j.enrichment && typeof j.enrichment === "object" ? j.enrichment : {}) as Obj;
    const posted = Date.parse(str(j.posted_at) || str(j.first_seen_at) || str(j.created_at));
    out.push({
      title,
      company: str(j.company),
      location: str(j.location) || (str(j.work_mode) === "remote" ? "Remote" : "Unspecified"),
      url,
      source: name,
      kind: "listing",
      postedAt: Number.isNaN(posted) ? undefined : new Date(posted).toISOString(),
      description: [str(j.description), str(enrich.summary), str(enrich.employment_type)].filter(Boolean).join(" "),
      companyUrl: str(j.company_website) || str(j.company_url) || undefined,
      functionHint: str(j.team) || undefined,
    });
  }
  return out;
}
