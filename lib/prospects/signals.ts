import type { OperatorProfile, SourceResult, TimingSignal } from "../types";
import { fetchJson, fetchText, fetchWithTimeout } from "../crawler/fetch";
import { stripHtml } from "../crawler/score";
import * as remotive from "../crawler/sources/remotive";
import * as remoteok from "../crawler/sources/remoteok";
import * as weworkremotely from "../crawler/sources/weworkremotely";

/** One piece of evidence about one company, before grouping/scoring. */
export interface RawSignal {
  company: string;
  domain?: string;
  context: string; // text used for ICP matching + card summary
  signal: TimingSignal;
  /** Set for universe-derived candidates: structured ICP fit, precomputed. */
  fit?: number;
  matched?: string[];
  logo?: string;
}

interface Gathered {
  signals: RawSignal[];
  results: SourceResult[];
}

function rssItems(xml: string): { title: string; link: string; description: string; pubDate: string }[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  return items.map((item) => {
    const tag = (name: string) => {
      const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
      return m ? m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim() : "";
    };
    return { title: tag("title"), link: tag("link"), description: tag("description"), pubDate: tag("pubDate") };
  });
}

/** "Acme raises $12M Series A to..." → "Acme" */
function companyFromHeadline(title: string): string | null {
  const clean = stripHtml(title).replace(/\s+-\s+[^-]+$/, ""); // strip "- TechCrunch"
  const m = clean.match(
    /^(.{2,50}?)(?:,\s+a\s+\S+\s+startup)?\s+(?:raises|lands|secures|closes|nabs|banks|announces|gets)\s/i
  );
  if (!m) return null;
  const name = m[1].replace(/^[“"']|[”"']$/g, "").trim();
  if (name.length < 2 || name.length > 50 || /^(the|this|a|an|it|why|how|what)$/i.test(name)) return null;
  return name;
}

/** Fresh funding = budget + urgency to build GTM. Applies to every role. */
async function fundingNews(profile: OperatorProfile): Promise<RawSignal[]> {
  const industryTerms = profile.industries.slice(0, 3);
  const stageTerms = profile.stages.length ? profile.stages.slice(0, 3) : ["seed", "Series A"];
  const queries = stageTerms.flatMap((stage) =>
    industryTerms.map((ind) => `"${stage}" funding "${ind}" raises`)
  );
  const out: RawSignal[] = [];
  const settled = await Promise.allSettled(
    queries.slice(0, 6).map((q) =>
      fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:30d")}&hl=en-US&gl=US&ceid=US:en`)
    )
  );
  for (const res of settled) {
    if (res.status !== "fulfilled") continue;
    for (const item of rssItems(res.value)) {
      const company = companyFromHeadline(item.title);
      if (!company) continue;
      out.push({
        company,
        context: stripHtml(`${item.title} ${item.description}`),
        signal: {
          type: "funding",
          label: "Raised funding in the last 30 days",
          detail: stripHtml(item.title).slice(0, 140),
          evidenceUrl: item.link,
          detectedOn: !isNaN(new Date(item.pubDate).getTime()) ? new Date(item.pubDate).toISOString() : undefined,
        },
      });
    }
  }
  return out;
}

/** Exec departures reported in the news — the seat is empty right now. */
async function departureNews(profile: OperatorProfile): Promise<RawSignal[]> {
  const titlesByRole: Record<string, string[]> = {
    "Sales Leadership": ['"VP of Sales"', '"Chief Revenue Officer"', '"CRO"'],
    Marketing: ['"CMO"', '"VP of Marketing"'],
    "Revenue Operations": ['"Head of Revenue Operations"', '"VP of Revenue Operations"'],
    "Customer Success": ['"VP of Customer Success"'],
    Partnerships: ['"VP of Partnerships"'],
    "AI GTM": ['"CMO"', '"Chief Revenue Officer"'],
    "Sales Enablement": ['"VP of Sales"'],
    Sellers: ['"VP of Sales"'],
  };
  const titles = titlesByRole[profile.role] || ['"Chief Revenue Officer"'];
  const queries = titles.map((t) => `${t} ("steps down" OR departs OR "has left")`);
  const out: RawSignal[] = [];
  const settled = await Promise.allSettled(
    queries.map((q) =>
      fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:60d")}&hl=en-US&gl=US&ceid=US:en`)
    )
  );
  for (const res of settled) {
    if (res.status !== "fulfilled") continue;
    for (const item of rssItems(res.value)) {
      const clean = stripHtml(item.title).replace(/\s+-\s+[^-]+$/, "");
      // "Acme CRO Jane Doe steps down" / "Jane Doe departs Acme"
      const m =
        clean.match(/^(.{2,40}?)(?:'s)?\s+(?:CRO|CMO|VP|Chief|Head)\b/i) ||
        clean.match(/\b(?:departs|leaves|exits)\s+(.{2,40}?)(?:\s|$)/i);
      const company = m ? m[1].trim() : null;
      if (!company || company.split(" ").length > 4) continue;
      out.push({
        company,
        context: `${clean} ${stripHtml(item.description)}`,
        signal: {
          type: "departure",
          label: "GTM leader recently departed",
          detail: clean.slice(0, 140),
          evidenceUrl: item.link,
          detectedOn: !isNaN(new Date(item.pubDate).getTime()) ? new Date(item.pubDate).toISOString() : undefined,
        },
      });
    }
  }
  return out;
}

/** Founders/execs publicly talking about becoming AI native (AI GTM angle). */
async function aiNativeChatter(): Promise<RawSignal[]> {
  const since = Math.floor(Date.now() / 1000) - 60 * 24 * 3600;
  const queries = ['"AI native" go-to-market', '"AI-native" sales team', '"becoming AI native"'];
  const out: RawSignal[] = [];
  const settled = await Promise.allSettled(
    queries.map((q) =>
      fetchJson<{ hits: { objectID: string; author: string; title?: string; story_title?: string; comment_text?: string; story_text?: string }[] }>(
        `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=(story,comment)&hitsPerPage=25&numericFilters=created_at_i>${since}`
      )
    )
  );
  for (const res of settled) {
    if (res.status !== "fulfilled") continue;
    for (const hit of res.value.hits || []) {
      const text = stripHtml(hit.comment_text || hit.story_text || hit.title || "");
      if (!text) continue;
      out.push({
        company: `${hit.author} (HN)`,
        context: `${hit.title || hit.story_title || ""} ${text}`.slice(0, 400),
        signal: {
          type: "ai-native",
          label: "Publicly discussing becoming AI native",
          detail: text.slice(0, 140),
          evidenceUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        },
      });
    }
  }
  return out;
}

const LEADERSHIP_TITLE = /\b(vp|vice president|head of|director|chief|cro|cmo|cgo)\b/i;
const IC_GTM_TITLE = /\b(account executive|sdr|bdr|sales development|demand gen|growth marketer|marketing manager|content marketer)\b/i;

/**
 * Mine full-time GTM postings from the job boards: a company hiring FT GTM
 * leadership can be pitched fractional/interim while the search runs; a
 * company hiring GTM ICs with no leader posted needs a leader.
 */
async function hiringSignals(profile: OperatorProfile): Promise<RawSignal[]> {
  const settled = await Promise.allSettled([
    remotive.fetchJobs(),
    remoteok.fetchJobs(),
    weworkremotely.fetchJobs(),
  ]);
  const all = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  // Sources overlap across their internal search queries — dedupe by URL.
  const seenUrls = new Set<string>();
  const jobs = all.filter((j) => (seenUrls.has(j.url) ? false : (seenUrls.add(j.url), true)));

  const byCompany = new Map<string, typeof jobs>();
  for (const j of jobs) {
    const key = j.company.toLowerCase().trim();
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(j);
  }

  const roleRe: Record<string, RegExp> = {
    "Sales Leadership": /\b(vp.{0,8}sales|head of sales|sales director|cro|chief revenue)\b/i,
    Marketing: /\b(vp.{0,8}marketing|head of marketing|marketing director|cmo|chief marketing)\b/i,
    "Revenue Operations": /\b(revops|revenue operations|sales operations|marketing operations)\b/i,
    "Customer Success": /\b(customer success)\b/i,
    Partnerships: /\b(partnerships?|alliances|channel)\b/i,
    "AI GTM": /\b(ai|gtm engineer)\b/i,
    "Sales Enablement": /\b(sales enablement|revenue enablement)\b/i,
    Sellers: /\b(account executive|enterprise sales)\b/i,
  };
  const relevant = roleRe[profile.role] || roleRe["Sales Leadership"];

  // ICs whose hiring implies a need for THIS role's leadership.
  const icByRole: Partial<Record<string, RegExp>> = {
    "Sales Leadership": /\b(account executive|sdr|bdr|sales development)\b/i,
    Sellers: /\b(account executive|sdr|bdr|sales development)\b/i,
    "Sales Enablement": /\b(account executive|sdr|bdr|sales development)\b/i,
    Marketing: /\b(demand gen|growth marketer|marketing manager|content marketer)\b/i,
  };
  const icRelevant = icByRole[profile.role] || IC_GTM_TITLE;

  const out: RawSignal[] = [];
  for (const [, companyJobs] of byCompany) {
    const company = companyJobs[0].company;
    const context = companyJobs.map((j) => `${j.title} ${(j.description || "").slice(0, 300)}`).join(" ");
    const leadership = companyJobs.filter((j) => LEADERSHIP_TITLE.test(j.title) && relevant.test(j.title));
    const ics = companyJobs.filter((j) => icRelevant.test(j.title));

    if (leadership.length > 0) {
      out.push({
        company,
        context,
        signal: {
          type: "leadership-gap",
          label: `Hiring full-time: ${leadership[0].title}`,
          detail: "Searches for FT leaders run 4–6 months — pitch fractional/interim coverage now.",
          evidenceUrl: leadership[0].url,
          detectedOn: leadership[0].postedAt && !isNaN(new Date(leadership[0].postedAt).getTime()) ? new Date(leadership[0].postedAt).toISOString() : undefined,
        },
      });
    } else if (ics.length >= 2) {
      out.push({
        company,
        context,
        signal: {
          type: "team-without-leader",
          label: `Hiring ${ics.length} GTM ICs with no leadership posting`,
          detail: `Open: ${ics.slice(0, 3).map((j) => j.title).join("; ")}`,
          evidenceUrl: ics[0].url,
        },
      });
    }
  }
  return out;
}

/**
 * Per-company enrichment for auto-discovered target accounts: check for
 * missing/stale public marketing content (blog/RSS) — a content-gap signal —
 * and for open GTM roles on a guessed Greenhouse board.
 */
export async function enrichCompany(company: string, domain: string): Promise<TimingSignal[]> {
  const out: TimingSignal[] = [];

  // Content gap: look for an RSS/Atom feed and how fresh it is.
  let freshest: number | null = null;
  let feedFound = false;
  for (const path of ["/feed", "/blog/rss.xml"]) {
    try {
      const res = await fetchWithTimeout(`https://${domain}${path}`, {}, 6000);
      if (!res.ok) continue;
      const xml = await res.text();
      if (!/<(rss|feed)[\s>]/i.test(xml)) continue;
      feedFound = true;
      for (const item of rssItems(xml).slice(0, 5)) {
        const t = new Date(item.pubDate).getTime();
        if (!isNaN(t)) freshest = Math.max(freshest ?? 0, t);
      }
      break;
    } catch {
      /* keep trying */
    }
  }
  const staleDays = freshest ? Math.floor((Date.now() - freshest) / 86400000) : null;
  if (!feedFound) {
    out.push({
      type: "content-gap",
      label: "No discoverable blog/RSS feed",
      detail: "No public content engine found — opening for a content/marketing pitch.",
      evidenceUrl: `https://${domain}`,
      detectedOn: new Date().toISOString(),
    });
  } else if (staleDays !== null && staleDays > 60) {
    out.push({
      type: "content-gap",
      label: `Blog silent for ${staleDays} days`,
      detail: "Public content has gone quiet — the engine exists but nobody is running it.",
      evidenceUrl: `https://${domain}`,
      detectedOn: new Date().toISOString(),
    });
  }

  // Careers: guessed Greenhouse board.
  const slug = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  try {
    const gh = await fetchJson<{ jobs: { title: string; absolute_url: string }[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`
    );
    const gtm = (gh.jobs || []).filter((j) => LEADERSHIP_TITLE.test(j.title) || IC_GTM_TITLE.test(j.title));
    if (gtm.length > 0) {
      out.push({
        type: "hiring-role",
        label: `${gtm.length} open GTM role(s) on their careers page`,
        detail: gtm.slice(0, 3).map((j) => j.title).join("; "),
        evidenceUrl: gtm[0].absolute_url,
        detectedOn: new Date().toISOString(),
      });
    }
  } catch {
    /* board doesn't exist under that slug — fine */
  }
  return out;
}

/**
 * ICP × universe cross-reference: match the operator's deduced ICP against
 * the universal company dataset, then enrich the strongest candidates with
 * live timing checks (content gap, careers-page GTM roles).
 */
async function universeCandidates(profile: OperatorProfile): Promise<RawSignal[]> {
  const { loadUniverse, loadUniverseEvents, matchUniverse } = await import("./universe");
  const [universe, events] = await Promise.all([loadUniverse(), loadUniverseEvents()]);
  const candidates = matchUniverse(profile, universe, 40, events);

  // Live enrichment is network-heavy — only the top candidates with domains.
  const toEnrich = candidates.filter((c) => c.company.domain).slice(0, 10);
  const enriched = new Map<string, TimingSignal[]>();
  await Promise.allSettled(
    toEnrich.map(async (c) => {
      enriched.set(c.company.name, await enrichCompany(c.company.name, c.company.domain!));
    })
  );

  const out: RawSignal[] = [];
  for (const c of candidates) {
    const signals = [...c.baseSignals, ...(enriched.get(c.company.name) || [])];
    // No timing signal → not a "reach out now" account; skip until one appears.
    if (signals.length === 0) continue;
    const context = `${c.company.name} — ${c.company.oneLiner} (${c.company.industry}; ${c.company.batch})`;
    for (const signal of signals) {
      out.push({
        company: c.company.name,
        domain: c.company.domain,
        logo: c.company.logo,
        context,
        signal,
        fit: c.fit,
        matched: c.matched,
      });
    }
  }
  return out;
}

export async function gatherSignals(profile: OperatorProfile): Promise<Gathered> {
  const tasks: [string, Promise<RawSignal[]>][] = [
    ["funding-news", fundingNews(profile)],
    ["departure-news", departureNews(profile)],
    ["hiring-patterns", hiringSignals(profile)],
    ["icp-universe", universeCandidates(profile)],
  ];
  if (profile.role === "AI GTM") tasks.push(["ai-native-chatter", aiNativeChatter()]);

  const settled = await Promise.allSettled(tasks.map(([, p]) => p));
  const signals: RawSignal[] = [];
  const results: SourceResult[] = [];
  settled.forEach((res, i) => {
    const source = tasks[i][0];
    if (res.status === "fulfilled") {
      signals.push(...res.value);
      results.push({ source, fetched: res.value.length, matched: res.value.length });
    } else {
      results.push({
        source,
        fetched: 0,
        matched: 0,
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      });
    }
  });
  return { signals, results };
}
