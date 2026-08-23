import { createHash } from "crypto";
import type { CrawlRun, Database, Job, RawJob, SourceResult } from "../types";
import { loadDb, saveDb } from "../store";
import { excerpt, MIN_SCORE, scoreJob } from "./score";
import * as remotive from "./sources/remotive";
import * as remoteok from "./sources/remoteok";
import * as weworkremotely from "./sources/weworkremotely";
import * as greenhouse from "./sources/greenhouse";
import * as hackernews from "./sources/hackernews";
import * as reddit from "./sources/reddit";
import * as fractionaljobs from "./sources/fractionaljobs";

const SOURCES = [remotive, remoteok, weworkremotely, greenhouse, hackernews, reddit, fractionaljobs];

const REMOTE_RE = /\b(remote|anywhere|worldwide|global)\b/i;
const STALE_DAYS = 60;

function jobId(raw: RawJob): string {
  // Discussions are keyed by URL (one lead per thread/comment); listings by
  // company+title so the same role found on two boards dedupes.
  const key =
    raw.kind === "discussion"
      ? raw.url
      : `${raw.company}::${raw.title}`.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha1").update(key).digest("hex").slice(0, 16);
}

function toIso(date: string | undefined, fallback: string): string {
  if (!date) return fallback;
  const d = new Date(date);
  return isNaN(d.getTime()) ? fallback : d.toISOString();
}

export async function runCrawl(): Promise<CrawlRun> {
  const now = new Date().toISOString();
  const results: SourceResult[] = [];
  const matched: Job[] = [];

  const settled = await Promise.allSettled(
    SOURCES.map(async (src) => ({ name: src.name, jobs: await src.fetchJobs() }))
  );

  settled.forEach((res, i) => {
    const sourceName = SOURCES[i].name;
    if (res.status === "rejected") {
      results.push({
        source: sourceName,
        fetched: 0,
        matched: 0,
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      });
      return;
    }
    const raws = res.value.jobs;
    let kept = 0;
    for (const raw of raws) {
      const tags = scoreJob(raw);
      // The bar: relevant score AND a genuine fractional signal (fractional/
      // interim/advisory wording, ≤4 days per week, ≤32 hrs/week, or hourly
      // pricing). Full-time GTM roles never reach the board.
      if (tags.score < MIN_SCORE || !tags.isFractional) continue;
      kept++;
      const location = raw.location || "Remote";
      matched.push({
        id: jobId(raw),
        kind: raw.kind || "listing",
        title: raw.title,
        company: raw.company,
        location,
        remote: REMOTE_RE.test(`${location} ${raw.title}`),
        url: raw.url,
        source: raw.source,
        postedAt: toIso(raw.postedAt, now),
        description: excerpt(raw.description || ""),
        salary: raw.salary,
        functions: tags.functions,
        engagement: tags.engagement,
        seniority: tags.seniority,
        commitment: tags.commitment,
        rate: tags.rate,
        term: tags.term,
        score: tags.score,
        status: "new",
        firstSeenAt: now,
        lastSeenAt: now,
      });
    }
    results.push({ source: sourceName, fetched: raws.length, matched: kept });
  });

  const db = await loadDb();
  const byId = new Map(db.jobs.map((j) => [j.id, j]));
  let added = 0;
  let updated = 0;
  for (const job of matched) {
    const existing = byId.get(job.id);
    if (existing) {
      // Keep operator state (status, firstSeenAt); refresh listing data.
      existing.lastSeenAt = now;
      existing.title = job.title;
      existing.url = job.url;
      existing.description = job.description || existing.description;
      existing.salary = job.salary ?? existing.salary;
      existing.score = job.score;
      existing.functions = job.functions;
      existing.engagement = job.engagement;
      existing.seniority = job.seniority;
      existing.kind = job.kind;
      existing.commitment = job.commitment;
      existing.rate = job.rate;
      existing.term = job.term;
      updated++;
    } else {
      byId.set(job.id, job);
      added++;
    }
  }

  // Drop listings not seen in STALE_DAYS unless the operator saved/applied them.
  const cutoff = Date.now() - STALE_DAYS * 24 * 3600 * 1000;
  let jobs = [...byId.values()].filter(
    (j) => j.status === "saved" || j.status === "applied" || new Date(j.lastSeenAt).getTime() >= cutoff
  );

  // Re-score everything already stored against the current bar, so jobs
  // admitted under older, looser rules (e.g. full-time roles) are swept out
  // on the next crawl instead of lingering until they age out.
  jobs = jobs.filter((j) => {
    if (j.status === "saved" || j.status === "applied" || j.source === "sample") return true;
    const re = scoreJob({
      title: j.title,
      company: j.company,
      url: j.url,
      source: j.source,
      kind: j.kind,
      description: j.description,
    });
    return re.isFractional && re.score >= MIN_SCORE;
  });

  // Once real listings exist, retire the bundled sample listings for good.
  if (jobs.some((j) => j.source !== "sample")) {
    jobs = jobs.filter((j) => j.source !== "sample");
  }

  const run: CrawlRun = { at: now, results, added, updated };
  const next: Database = { jobs, lastCrawl: run };
  await saveDb(next);
  return run;
}
