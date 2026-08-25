import { promises as fs } from "fs";
import path from "path";
import type { OperatorProfile, TimingSignal } from "../types";
import { fetchWithTimeout } from "../crawler/fetch";
import { TEAM_SWEETSPOT } from "./config";

/**
 * Universal company dataset: the open Y Combinator company directory
 * (https://github.com/yc-oss/api — public JSON, no key). ~5k companies with
 * industry, tags, team size, batch, stage, description, website, and an
 * is-hiring flag. The operator's ICP (from their Revenue Nomad profile) is
 * cross-referenced against this universe to auto-discover target accounts —
 * no manual watchlist required. Additional universes can be added alongside.
 */

const UNIVERSE_URL = "https://yc-oss.github.io/api/companies/all.json";
// Smaller fallback (same schema) if the full directory fetch fails/times out.
const FALLBACK_URL = "https://yc-oss.github.io/api/companies/hiring.json";
const CACHE_TTL_MS = 24 * 3600 * 1000;

const DATA_DIR = process.env.RN_DATA_DIR ||
  (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "revenue-nomad")
    : path.join(process.cwd(), "data"));
const CACHE_PATH = path.join(DATA_DIR, "universe-yc.json");

export interface UniverseCompany {
  name: string;
  domain?: string;
  logo?: string;
  oneLiner: string;
  industry: string;
  tags: string[];
  teamSize: number | null;
  batch: string;
  stage: string;
  status: string;
  isHiring: boolean;
  url: string; // profile / evidence link
  source: "yc" | "crunchbase";
  /* Crunchbase-grade firmographics (spec Phase 2) — optional per record. */
  employeeBuckets?: string[]; // RN buckets, straddles allowed
  revenueBands?: string[]; // RN revenue buckets, straddles allowed
  fundingStage?: string; // pre_seed | seed | series_a | series_b | series_c_plus | growth
  lastFundingDate?: string;
  lastFundingType?: string;
  lastFundingAmount?: number;
  growthCategory?: string; // Growing | Steady | Declining
  leadershipHiredOn?: string; // last leadership hire date
  layoffMentionOn?: string;
  /* People-graph lite (spec Phase 3): GTM functions seen on the roster. */
  rolesPresent?: string[]; // sl | mk | ops | cs | en | pt | ai
  rolesDeparted?: string[]; // same keys, seen among past employees
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
  small_logo_thumb_url?: string;
}

function toDomain(website?: string): string | undefined {
  if (!website) return undefined;
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/** Compact Crunchbase-shaped record as bundled in data/universe-crunchbase.json. */
interface CbRaw {
  n: string; d?: string; o?: string; i?: string;
  eb?: string; ts?: number; rv?: string; st?: string; fy?: number;
  fd?: string; ft?: string; fa?: number; h?: boolean; gc?: string;
  lh?: string; ll?: string; li?: string; rp?: string; rd?: string;
}

const CB_PATH = path.join(process.cwd(), "data", "universe-crunchbase.json");

async function loadCrunchbase(): Promise<UniverseCompany[]> {
  try {
    // Direct import bundles the dataset into the serverless build — no
    // file-tracing dependence. Filesystem read is the dev/CLI fallback.
    let raw: CbRaw[];
    try {
      raw = (await import("../../data/universe-crunchbase.json")).default as unknown as CbRaw[];
    } catch {
      raw = JSON.parse(await fs.readFile(CB_PATH, "utf8")) as CbRaw[];
    }
    return raw.map((c) => ({
      name: c.n,
      domain: c.d,
      oneLiner: c.o || "",
      industry: c.i || "",
      tags: [],
      teamSize: c.ts ?? null,
      batch: c.fy ? String(c.fy) : "",
      stage: "",
      status: "Active",
      isHiring: !!c.h,
      url: c.li || (c.d ? `https://${c.d}` : ""),
      source: "crunchbase" as const,
      employeeBuckets: c.eb ? c.eb.split("|") : undefined,
      revenueBands: c.rv ? c.rv.split("|") : undefined,
      fundingStage: c.st,
      lastFundingDate: c.fd,
      lastFundingType: c.ft,
      lastFundingAmount: c.fa,
      growthCategory: c.gc,
      leadershipHiredOn: c.lh,
      layoffMentionOn: c.ll,
      rolesPresent: c.rp ? c.rp.split(",") : [],
      rolesDeparted: c.rd ? c.rd.split(",") : [],
    }));
  } catch {
    return []; // dataset not bundled — YC-only universe
  }
}

export async function loadUniverse(): Promise<UniverseCompany[]> {
  const [yc, cb] = await Promise.all([loadYcUniverse().catch(() => [] as UniverseCompany[]), loadCrunchbase()]);
  // Dedupe by domain (then name): YC wins the identity (logo, hiring flag),
  // Crunchbase enriches it with firmographics and people-graph fields.
  const byKey = new Map<string, UniverseCompany>();
  for (const c of yc) byKey.set(c.domain || c.name.toLowerCase(), c);
  for (const c of cb) {
    const key = c.domain || c.name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      Object.assign(existing, {
        employeeBuckets: c.employeeBuckets,
        revenueBands: c.revenueBands,
        fundingStage: c.fundingStage,
        lastFundingDate: c.lastFundingDate,
        lastFundingType: c.lastFundingType,
        lastFundingAmount: c.lastFundingAmount,
        growthCategory: c.growthCategory,
        leadershipHiredOn: c.leadershipHiredOn,
        layoffMentionOn: c.layoffMentionOn,
        rolesPresent: c.rolesPresent,
        rolesDeparted: c.rolesDeparted,
      });
    } else {
      byKey.set(key, c);
    }
  }
  return [...byKey.values()];
}

async function loadYcUniverse(): Promise<UniverseCompany[]> {
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

  let raw: YcRaw[];
  try {
    const res = await fetchWithTimeout(UNIVERSE_URL, {}, 45000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = (await res.json()) as YcRaw[];
  } catch (err) {
    // The full directory is ~6k records; fall back to the hiring subset
    // rather than losing the universe entirely.
    const res = await fetchWithTimeout(FALLBACK_URL, {}, 20000);
    if (!res.ok) {
      throw new Error(
        `universe fetch failed (${err instanceof Error ? err.message : err}; fallback HTTP ${res.status})`
      );
    }
    raw = (await res.json()) as YcRaw[];
  }
  const companies: UniverseCompany[] = raw
    .filter((c) => c.name && (c.status || "").toLowerCase() === "active")
    .map((c) => ({
      name: c.name!,
      domain: toDomain(c.website),
      logo: c.small_logo_thumb_url || undefined,
      oneLiner: c.one_liner || (c.long_description || "").slice(0, 200),
      industry: [c.industry, c.subindustry].filter(Boolean).join(" · "),
      tags: c.tags || [],
      teamSize: typeof c.team_size === "number" ? c.team_size : null,
      batch: c.batch || "",
      stage: c.stage || "",
      status: c.status || "",
      isHiring: !!(c.isHiring ?? c.is_hiring),
      url: c.url || `https://www.ycombinator.com/companies/${c.slug || ""}`,
      source: "yc" as const,
    }));

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(companies), "utf8").catch(() => {});
  return companies;
}

/* ---------- daily diff events (spec §2.1: signals are diffs, not states) ---------- */

const CHANGES_URL = "https://yc-oss.github.io/api/changes/latest.json";
const EVENTS_PATH = path.join(DATA_DIR, "universe-events.json");
const EVENT_RETENTION_DAYS = 90;

interface StoredEvent {
  company: string;
  signal: TimingSignal;
}

interface ChangeRecord {
  name?: string;
  url?: string;
  changed_fields?: string[];
  changes?: Record<string, { before?: unknown; after?: unknown }>;
  team_size?: number | null;
  one_liner?: string;
}

function parseGeneratedAt(v: unknown): string {
  if (typeof v === "number") {
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Pull the universe's daily change feed and fold it into a persistent event
 * log. The feed only covers the latest day, so the log accumulates history
 * across scans; events older than EVENT_RETENTION_DAYS are pruned (decay has
 * flattened them by then anyway).
 */
export async function loadUniverseEvents(): Promise<Map<string, TimingSignal[]>> {
  let log: StoredEvent[] = [];
  try {
    const parsed = JSON.parse(await fs.readFile(EVENTS_PATH, "utf8"));
    if (Array.isArray(parsed)) log = parsed;
  } catch {
    /* no log yet */
  }

  try {
    const res = await fetchWithTimeout(CHANGES_URL, {}, 20000);
    if (res.ok) {
      const data = (await res.json()) as {
        generated_at?: unknown;
        added?: ChangeRecord[];
        updated?: ChangeRecord[];
      };
      const detectedOn = parseGeneratedAt(data.generated_at);
      const day = detectedOn.slice(0, 10);
      const seen = new Set(
        log.map((e) => `${e.company.toLowerCase()}|${e.signal.type}|${(e.signal.detectedOn || "").slice(0, 10)}`)
      );
      const push = (company: string | undefined, signal: TimingSignal) => {
        if (!company) return;
        const k = `${company.toLowerCase()}|${signal.type}|${day}`;
        if (seen.has(k)) return;
        seen.add(k);
        log.push({ company, signal });
      };

      for (const u of data.updated || []) {
        const ch = u.changes || {};
        if (ch.isHiring && ch.isHiring.after === true) {
          push(u.name, {
            type: "started-hiring",
            label: "Flipped to actively hiring",
            detail: "Hiring flag turned on in the company directory.",
            evidenceUrl: u.url,
            detectedOn,
          });
        }
        const ts = ch.team_size;
        if (ts && typeof ts.before === "number" && typeof ts.after === "number" && ts.after > ts.before) {
          const growth = (ts.after - ts.before) / Math.max(1, ts.before);
          if (growth >= 0.2 && ts.after - ts.before >= 3) {
            push(u.name, {
              type: "headcount-jump",
              label: `Team grew ${ts.before} → ${ts.after}`,
              detail: "Headcount jump — growth is outrunning the GTM org.",
              evidenceUrl: u.url,
              detectedOn,
            });
          }
        }
        const fields = u.changed_fields || [];
        if (fields.includes("one_liner") || fields.includes("long_description")) {
          push(u.name, {
            type: "positioning-shift",
            label: "Company description changed",
            detail: "Positioning shift — repositioning needs messaging and GTM work.",
            evidenceUrl: u.url,
            detectedOn,
          });
        }
      }
      for (const a of data.added || []) {
        push(a.name, {
          type: "newly-launched",
          label: "Just added to the directory",
          detail: a.one_liner ? a.one_liner.slice(0, 120) : undefined,
          evidenceUrl: a.url,
          detectedOn,
        });
      }

      const cutoff = Date.now() - EVENT_RETENTION_DAYS * 86400000;
      log = log.filter((e) => {
        const t = e.signal.detectedOn ? new Date(e.signal.detectedOn).getTime() : 0;
        return t >= cutoff;
      });
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(EVENTS_PATH, JSON.stringify(log), "utf8").catch(() => {});
    }
  } catch {
    // Feed unavailable — serve whatever the log already holds.
  }

  const map = new Map<string, TimingSignal[]>();
  for (const e of log) {
    const k = e.company.toLowerCase();
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e.signal);
  }
  return map;
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

/** YC batches come as "W25"/"S09"/"F24"/"X25" (or spelled out, "Winter 2025"). */
function batchYear(batch: string): number | null {
  const full = batch.match(/(\d{4})/);
  if (full) return Number(full[1]);
  const short = batch.match(/^[A-Z]{1,2}(\d{2})$/i);
  if (short) return 2000 + Number(short[1]);
  return null;
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
  limit = 40,
  events?: Map<string, TimingSignal[]>
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

    // Team size vs preferred employee buckets — exact bands when the record
    // carries them (Crunchbase), midpoint estimate otherwise.
    if (profile.employeeSizes.length > 0) {
      if (c.employeeBuckets?.length) {
        if (c.employeeBuckets.some((b) => profile.employeeSizes.includes(b))) {
          matched.push(`~${c.teamSize} people`);
          fit += 20;
        }
      } else if (c.teamSize !== null) {
        const inBucket = profile.employeeSizes.some((b) => {
          const range = SIZE_BUCKETS[b];
          return range && c.teamSize! >= range[0] && c.teamSize! <= range[1];
        });
        if (inBucket) {
          matched.push(`${c.teamSize} people`);
          fit += 20;
        }
      }
    }

    // Revenue band overlap (Crunchbase estimated revenue → RN buckets). Soft
    // per spec §1.1: modeled data, never a hard gate.
    if (c.revenueBands?.length && profile.revenueSizes.length > 0) {
      if (c.revenueBands.some((b) => profile.revenueSizes.includes(b))) {
        matched.push("revenue band");
        fit += 15;
      }
    }

    // Role-specific buyability window: the team size where companies actually
    // buy THIS role. Orders candidates differently per role category.
    const sweet = TEAM_SWEETSPOT[profile.role];
    if (c.teamSize !== null && sweet && c.teamSize >= sweet[0] && c.teamSize <= sweet[1]) {
      matched.push(`${profile.role} window`);
      fit += 10;
    }

    // Stage: real funding stage when the record has one (Crunchbase); the
    // YC Early/Growth label + batch recency proxy otherwise.
    const year = batchYear(c.batch);
    if (c.fundingStage) {
      const order = ["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "growth"];
      const ci = order.indexOf(c.fundingStage);
      const best = Math.min(
        ...profile.stages.map((st) => {
          const pi = order.indexOf(st);
          return pi >= 0 && ci >= 0 ? Math.abs(pi - ci) : 99;
        }),
        99
      );
      if (best === 0) {
        matched.push(c.fundingStage.replace(/_/g, " "));
        fit += 15;
      } else if (best === 1) {
        matched.push(`near ${c.fundingStage.replace(/_/g, " ")}`);
        fit += 8;
      }
    } else {
      const isEarly = /early/i.test(c.stage) || (year !== null && currentYear - year <= 3);
      const isLate = /growth/i.test(c.stage) || (year !== null && currentYear - year > 5);
      if ((isEarly && wantsEarly) || (isLate && wantsLate)) {
        matched.push(c.batch || c.stage);
        fit += 15;
      }
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

    // Diff-derived events for this company — the queue movers. Being early
    // stage or generically "hiring" is ICP context, not a why-now: stage
    // lives in the fit score, and hiring only matters when its COMPOSITION
    // indicates the operator's role (library detectors read the board).
    const baseSignals: TimingSignal[] = [...(events?.get(c.name.toLowerCase()) || [])];
    baseSignals.push(...firmographicSignals(profile, c));

    out.push({ company: c, fit: Math.min(100, fit), matched, baseSignals });
  }

  return out.sort((a, b) => b.fit - a.fit).slice(0, limit);
}

/* ---------- dated + roster signals from firmographic records ---------- */

const ROLE_KEY: Record<string, string> = {
  "Sales Leadership": "sl",
  Marketing: "mk",
  "Revenue Operations": "ops",
  "Customer Success": "cs",
  "Sales Enablement": "en",
  Partnerships: "pt",
  "AI GTM": "ai",
  Sellers: "sl",
};

const ROLE_FN_LABEL: Record<string, string> = {
  sl: "sales leadership",
  mk: "marketing leadership",
  ops: "revenue operations",
  cs: "customer success",
  en: "sales enablement",
  pt: "partnerships",
  ai: "AI engineering",
};

/** Minimum headcount at which the role's function "should" exist. */
const ROSTER_GAP_FLOOR: Record<string, number> = {
  sl: 15, mk: 25, ops: 40, cs: 30, en: 40, pt: 50,
};

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/**
 * Timing signals carried by the firmographic record itself (Crunchbase-grade
 * data): dated funding, leadership hires, layoff mentions, and people-graph
 * lite reads — a departed function leader with no current one (spec S1), and
 * size-based roster gaps.
 */
function firmographicSignals(profile: OperatorProfile, c: UniverseCompany): TimingSignal[] {
  const out: TimingSignal[] = [];
  const key = ROLE_KEY[profile.role];
  const fn = ROLE_FN_LABEL[key];

  if (c.lastFundingDate && daysAgo(c.lastFundingDate) >= 0 && daysAgo(c.lastFundingDate) <= 150) {
    const amt = c.lastFundingAmount ? ` ($${Math.round(c.lastFundingAmount / 1e6)}M)` : "";
    out.push({
      type: "funding",
      label: `Raised ${c.lastFundingType || "a round"}${amt}`,
      detail: "Fresh capital in the deploy window — GTM build-out pressure is on.",
      evidenceUrl: c.url,
      detectedOn: c.lastFundingDate,
    });
  }
  if (c.leadershipHiredOn && daysAgo(c.leadershipHiredOn) >= 0 && daysAgo(c.leadershipHiredOn) <= 120) {
    out.push({
      type: "leader-appointed",
      label: "Leadership hire landed recently",
      detail: "New leaders rebuild their function's systems in the first quarter.",
      evidenceUrl: c.url,
      detectedOn: c.leadershipHiredOn,
    });
  }
  if (c.layoffMentionOn && daysAgo(c.layoffMentionOn) >= 0 && daysAgo(c.layoffMentionOn) <= 180) {
    out.push({
      type: "restructuring",
      label: "Layoff mention on record",
      detail: "Headcount is frozen but the outcomes aren't — senior output without the FTE is the pitch.",
      evidenceUrl: c.url,
      detectedOn: c.layoffMentionOn,
    });
  }

  // People-graph lite (only meaningful when the record carries roster data).
  if (c.rolesPresent && key && key !== "ai") {
    const present = c.rolesPresent.includes(key);
    const departed = (c.rolesDeparted || []).includes(key);
    if (departed && !present) {
      out.push({
        type: "departure",
        label: `Past ${fn} leader on record — seat now empty`,
        detail: "Someone held this seat and left; nobody currently visible in it.",
        evidenceUrl: c.url,
        weight: 0.7,
        halfLifeDays: null,
      });
    } else if (!present && (c.teamSize ?? 0) >= (ROSTER_GAP_FLOOR[key] ?? 999)) {
      const growing = c.growthCategory === "Growing" ? " while headcount grows" : "";
      out.push({
        type: "function-gap",
        label: `No ${fn} visible on the roster at ~${c.teamSize} people${growing}`,
        detail: "The function a company this size needs has no visible owner.",
        evidenceUrl: c.url,
        weight: c.growthCategory === "Growing" ? 0.6 : 0.5,
        halfLifeDays: null,
      });
    }
  }
  return out;
}
