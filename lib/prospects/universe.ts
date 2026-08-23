import { promises as fs } from "fs";
import path from "path";
import type { OperatorProfile, TimingSignal } from "../types";
import { fetchWithTimeout } from "../crawler/fetch";

/**
 * Universal company dataset: the open Y Combinator company directory
 * (https://github.com/yc-oss/api — public JSON, no key). ~5k companies with
 * industry, tags, team size, batch, stage, description, website, and an
 * is-hiring flag. The operator's ICP (from their Revenue Nomad profile) is
 * cross-referenced against this universe to auto-discover target accounts —
 * no manual watchlist required. Additional universes can be added alongside.
 */

const UNIVERSE_URL = "https://yc-oss.github.io/api/companies/all.json";
const CACHE_TTL_MS = 24 * 3600 * 1000;

const DATA_DIR = process.env.RN_DATA_DIR ||
  (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "revenue-nomad")
    : path.join(process.cwd(), "data"));
const CACHE_PATH = path.join(DATA_DIR, "universe-yc.json");

export interface UniverseCompany {
  name: string;
  domain?: string;
  oneLiner: string;
  industry: string;
  tags: string[];
  teamSize: number | null;
  batch: string;
  stage: string;
  status: string;
  isHiring: boolean;
  url: string; // YC profile
}

interface YcRaw {
  name?: string;
  website?: string;
  one_liner?: string;
  long_description?: string;
  industry?: string;
  subindustry?: string;
  tags?: string[];
  team_size?: number | null;
  batch?: string;
  stage?: string;
  status?: string;
  isHiring?: boolean;
  is_hiring?: boolean;
  url?: string;
  slug?: string;
}

function toDomain(website?: string): string | undefined {
  if (!website) return undefined;
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export async function loadUniverse(): Promise<UniverseCompany[]> {
  // Serve from cache when fresh.
  try {
    const stat = await fs.stat(CACHE_PATH);
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
      const cached = JSON.parse(await fs.readFile(CACHE_PATH, "utf8"));
      if (Array.isArray(cached) && cached.length > 0) return cached;
    }
  } catch {
    /* no cache yet */
  }

  const res = await fetchWithTimeout(UNIVERSE_URL, {}, 30000);
  if (!res.ok) throw new Error(`universe fetch failed: HTTP ${res.status}`);
  const raw = (await res.json()) as YcRaw[];
  const companies: UniverseCompany[] = raw
    .filter((c) => c.name && (c.status || "").toLowerCase() === "active")
    .map((c) => ({
      name: c.name!,
      domain: toDomain(c.website),
      oneLiner: c.one_liner || (c.long_description || "").slice(0, 200),
      industry: [c.industry, c.subindustry].filter(Boolean).join(" · "),
      tags: c.tags || [],
      teamSize: typeof c.team_size === "number" ? c.team_size : null,
      batch: c.batch || "",
      stage: c.stage || "",
      status: c.status || "",
      isHiring: !!(c.isHiring ?? c.is_hiring),
      url: c.url || `https://www.ycombinator.com/companies/${c.slug || ""}`,
    }));

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(companies), "utf8").catch(() => {});
  return companies;
}

const SIZE_BUCKETS: Record<string, [number, number]> = {
  "1_10": [1, 10],
  "11_50": [11, 50],
  "51_200": [51, 200],
  "201_500": [201, 500],
  "501_1000": [501, 1000],
  "1001_plus": [1001, Infinity],
};

const EARLY_STAGES = new Set(["pre_seed", "seed", "series_a"]);
const LATE_STAGES = new Set(["series_b", "series_c_plus", "growth", "enterprise"]);

const MOTION_KEYWORDS: Record<string, RegExp> = {
  plg: /\b(product[\s-]?led|self[\s-]?serve|developer|api|bottom[\s-]?up|freemium)\b/i,
  plg_to_sales: /\b(product[\s-]?led|self[\s-]?serve|freemium)\b/i,
  enterprise_sales: /\b(enterprise|compliance|security|procurement)\b/i,
  inside_sales: /\b(smb|small business|mid[\s-]?market)\b/i,
  channel: /\b(partner|channel|reseller|integrat)\b/i,
};

/** Words too generic to indicate an industry on their own. */
const STOPWORDS = new Set(["and", "the", "of", "for", "tech", "care", "services", "service", "teams", "non", "food"]);

function industryTokens(industries: string[]): { label: string; tokens: string[] }[] {
  return industries.map((raw) => {
    const label = raw.trim();
    const tokens = label
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t));
    return { label, tokens };
  });
}

function batchYear(batch: string): number | null {
  const m = batch.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

export interface UniverseCandidate {
  company: UniverseCompany;
  fit: number;
  matched: string[];
  baseSignals: TimingSignal[];
}

/**
 * Score every company in the universe against the operator's deduced ICP and
 * return the strongest candidates.
 */
export function matchUniverse(
  profile: OperatorProfile,
  universe: UniverseCompany[],
  limit = 40
): UniverseCandidate[] {
  const inds = industryTokens(profile.industries);
  const wantsEarly = profile.stages.some((s) => EARLY_STAGES.has(s)) || profile.stages.length === 0;
  const wantsLate = profile.stages.some((s) => LATE_STAGES.has(s));
  const currentYear = new Date().getFullYear();

  const out: UniverseCandidate[] = [];
  for (const c of universe) {
    const text = `${c.industry} ${c.tags.join(" ")} ${c.oneLiner}`.toLowerCase();
    let fit = 0;
    const matched: string[] = [];

    // Industry: any profile industry whose tokens all appear in the company text.
    for (const { label, tokens } of inds) {
      if (tokens.length > 0 && tokens.every((t) => text.includes(t))) {
        matched.push(label);
        fit += 30;
      }
    }
    if (matched.length === 0 && inds.length > 0) {
      // Partial credit: any single strong token hit.
      for (const { label, tokens } of inds) {
        if (tokens.some((t) => text.includes(t))) {
          matched.push(`~${label}`);
          fit += 12;
          break;
        }
      }
    }

    // Team size vs preferred employee buckets.
    if (c.teamSize !== null && profile.employeeSizes.length > 0) {
      const inBucket = profile.employeeSizes.some((b) => {
        const range = SIZE_BUCKETS[b];
        return range && c.teamSize! >= range[0] && c.teamSize! <= range[1];
      });
      if (inBucket) {
        matched.push(`${c.teamSize} people`);
        fit += 20;
      }
    }

    // Stage: YC labels companies Early/Growth; refine with batch recency.
    const year = batchYear(c.batch);
    const isEarly = /early/i.test(c.stage) || (year !== null && currentYear - year <= 3);
    const isLate = /growth/i.test(c.stage) || (year !== null && currentYear - year > 5);
    if ((isEarly && wantsEarly) || (isLate && wantsLate)) {
      matched.push(c.batch || c.stage);
      fit += 15;
    }

    // Sales-motion keywords in the company description.
    for (const motion of profile.salesMotions) {
      const re = MOTION_KEYWORDS[motion];
      if (re && re.test(text)) {
        matched.push(motion.replace(/_/g, " "));
        fit += 8;
        break;
      }
    }

    // Free-form ICP keywords / fit tags.
    for (const kw of profile.keywords) {
      if (kw && text.includes(kw.toLowerCase())) {
        matched.push(kw);
        fit += 8;
      }
    }

    if (fit < 40) continue;

    const baseSignals: TimingSignal[] = [];
    if (c.isHiring) {
      baseSignals.push({
        type: "actively-hiring",
        label: "Actively hiring (YC directory)",
        detail: c.oneLiner.slice(0, 120),
        evidenceUrl: c.url,
      });
    }
    if (isEarly && year !== null && currentYear - year <= 2 && (c.teamSize ?? 0) >= 5) {
      baseSignals.push({
        type: "early-inflection",
        label: `${c.batch}: at the stage where GTM gets built`,
        detail: `Team of ${c.teamSize ?? "?"} — past founder-led sales, before a full GTM org.`,
        evidenceUrl: c.url,
      });
    }

    out.push({ company: c, fit: Math.min(100, fit), matched, baseSignals });
  }

  return out.sort((a, b) => b.fit - a.fit).slice(0, limit);
}
