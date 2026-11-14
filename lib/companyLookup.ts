/**
 * Company lookup for "Add record": paste a URL, get back what we can prefill.
 *
 * - domain: normalized from the URL (also drives the favicon on the page)
 * - name:   the site's own og:site_name / application-name / <title>
 * - industry: a suggested Revenue Nomad industry tag, from keywords in the
 *   site's title and description (the member confirms or changes it)
 *
 * Revenue stage and employee count are NOT guessed: there's no free, reliable
 * public source for them, so the member picks from the standard lists.
 * Everything returned is a suggestion; the member can edit each field before saving.
 */
import { RN_INDUSTRIES } from "./tableFields";

export interface LookupResult {
  domain: string;
  name: string | null;
  industry: string | null;
  description: string | null;
}

export function normalizeDomain(raw: string): string | null {
  let s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0].split(":")[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : null;
}

/** Keyword → Revenue Nomad industry tag. First match wins, most specific first. */
const INDUSTRY_RULES: [RegExp, string][] = [
  [/\bsaas\b|software[- ]as[- ]a[- ]service/i, "SaaS"],
  [/\b(fintech|payments?|banking|lending|insurance|insurtech|wealth|accounting software)\b/i, "Financial Services"],
  [/\b(health ?care|healthtech|clinical|patient|medical|hospital|pharma|biotech|life sciences)\b/i, "Health Care"],
  [/\b(wellness|fitness|nutrition|supplements?)\b/i, "Wellness & Fitness"],
  [/\b(edtech|education|learning|school|university|students?)\b/i, "Education"],
  [/\b(real estate|proptech|property management|residential|commercial property)\b/i, "Real Estate"],
  [/\b(construction|contractor|builders?|remodel|architecture firm)\b/i, "Construction"],
  [/\b(manufactur|industrial|factory|components|semiconductor)\w*/i, "Manufacturing"],
  [/\b(logistics|freight|shipping|fleet|transportation|supply chain|trucking)\b/i, "Transportation & Logistics"],
  [/\b(e-?commerce|retail|shop|store|apparel|fashion)\b/i, "Retail"],
  [/\b(consumer goods|cpg|beverage|food brand)\b/i, "Consumer Goods"],
  [/\b(media|publishing|news|podcast|broadcast|marketing agency|advertising)\b/i, "Media & Communications"],
  [/\b(entertainment|games?|gaming|film|music|studio)\b/i, "Entertainment"],
  [/\b(nonprofit|non-profit|charity|foundation)\b/i, "Nonprofit"],
  [/\b(law firm|legal|attorneys?)\b/i, "Legal"],
  [/\b(energy|solar|oil|gas|mining|utilities)\b/i, "Energy & Mining"],
  [/\b(travel|hospitality|hotels?|recreation|tourism)\b/i, "Recreation & Travel"],
  [/\b(networking|hardware|devices?|iot|data center)\b/i, "Hardware & Networking"],
  [/\b(consulting|staffing|recruiting|outsourc|professional services|agency)\w*/i, "Corporate Services"],
  [/\b(software|platform|cloud|api|ai\b|developer|app)\b/i, "Software & IT Services"],
];

export function suggestIndustry(text: string): string | null {
  for (const [re, tag] of INDUSTRY_RULES) if (re.test(text) && RN_INDUSTRIES.includes(tag)) return tag;
  return null;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

function meta(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content) : null;
}

/** "Acme — The best widgets | Home" → "Acme" */
function cleanTitle(t: string, domain: string): string {
  const parts = t.split(/\s+[|–—:·-]\s+/).map((p) => p.trim()).filter(Boolean);
  const root = domain.split(".")[0].replace(/[^a-z0-9]/g, "");
  // Prefer the part that looks like the brand (matches the domain), else the shortest.
  const brand = parts.find((p) => p.toLowerCase().replace(/[^a-z0-9]/g, "").includes(root));
  const pick = brand ?? [...parts].sort((a, b) => a.length - b.length)[0] ?? t;
  return pick.slice(0, 80);
}

export async function lookupCompany(rawUrl: string): Promise<LookupResult | null> {
  const domain = normalizeDomain(rawUrl);
  if (!domain) return null;
  let html = "";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(`https://${domain}`, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; RevenueNomadTable/1.0)", accept: "text/html" },
    });
    if (r.ok && (r.headers.get("content-type") ?? "").includes("html")) html = (await r.text()).slice(0, 300_000);
  } catch {
    /* site unreachable: still return the domain so the favicon and manual entry work */
  } finally {
    clearTimeout(t);
  }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const name =
    meta(html, "og:site_name") ?? meta(html, "application-name") ?? (title ? cleanTitle(decode(title), domain) : null);
  const description = meta(html, "og:description") ?? meta(html, "description");
  const industry = suggestIndustry(`${title ?? ""} ${description ?? ""}`);
  return { domain, name: name || null, industry, description: description ? description.slice(0, 240) : null };
}
