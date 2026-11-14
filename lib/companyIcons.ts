/**
 * Company icons for The Table.
 *
 * An icon needs a domain. A company's filled-in Website is always used first.
 * For companies with no website yet, the server looks the domain up from the
 * company name (Clearbit's free autocomplete endpoint) in the background and
 * caches the answer, so the icon appears on a later load.
 *
 * A looked-up domain is used ONLY to draw the icon. It never fills the Website
 * field (no unverified data, no credits), and it is only accepted when the
 * returned company name matches ours, so ambiguous names ("Water") stay as
 * initials instead of borrowing a stranger's logo.
 *
 * Set RN_LOGO_LOOKUP=off to disable lookups (icons from websites still show).
 */
import { promises as fs } from "fs";
import path from "path";

interface CacheEntry {
  domain: string | null;
  at: string;
}

const SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR =
  process.env.RN_DATA_DIR ||
  (SERVERLESS ? path.join("/tmp", "revenue-nomad") : path.join(process.cwd(), "data"));
const CACHE_PATH = path.join(DATA_DIR, "company-domains.json");
const MISS_RETRY_MS = 7 * 24 * 3600 * 1000; // re-try unmatched names weekly
const PER_PASS = 12; // lookups started per page load
const TIMEOUT_MS = 4000;

let cache: Record<string, CacheEntry> | null = null;
const inFlight = new Set<string>();

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/^the\s+/, "")
    .replace(/[,.]?\s+(inc|llc|ltd|limited|corp|corporation|co|company|group|gmbh|plc)\.?$/g, "")
    .replace(/[^a-z0-9]+/g, "");

async function loadCache(): Promise<Record<string, CacheEntry>> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(CACHE_PATH, "utf8"));
  } catch {
    cache = {};
  }
  return cache!;
}

async function saveCache() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(CACHE_PATH + ".tmp", JSON.stringify(cache), "utf8");
    await fs.rename(CACHE_PATH + ".tmp", CACHE_PATH);
  } catch {
    /* cache is best-effort */
  }
}

/** Ask the lookup service for a domain; accept only a name match. */
async function lookup(name: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(name)}`, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!r.ok) return null;
    const list = (await r.json()) as { name?: string; domain?: string }[];
    const want = norm(name);
    if (want.length < 3) return null;
    const hit = list.find((c) => c.domain && c.name && norm(c.name) === want);
    return hit?.domain?.toLowerCase() ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Domains for icons, keyed by company id. Returns what's known now and starts
 * background lookups for the rest (never blocks the page).
 */
export async function iconDomains(companies: { id: string; name: string; website?: string | null }[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const c = await loadCache();
  const todo: { id: string; name: string }[] = [];
  for (const co of companies) {
    if (co.website) {
      out[co.id] = co.website.replace(/^www\./, "").split("/")[0];
      continue;
    }
    const hit = c[co.id];
    if (hit?.domain) out[co.id] = hit.domain;
    else if (!hit || Date.now() - Date.parse(hit.at) > MISS_RETRY_MS) todo.push(co);
  }
  if (process.env.RN_LOGO_LOOKUP !== "off" && todo.length) {
    const batch = todo.filter((t) => !inFlight.has(t.id)).slice(0, PER_PASS);
    batch.forEach((t) => inFlight.add(t.id));
    void (async () => {
      for (const t of batch) {
        c[t.id] = { domain: await lookup(t.name), at: new Date().toISOString() };
        inFlight.delete(t.id);
      }
      await saveCache();
    })();
  }
  return out;
}
