import { createHash } from "crypto";
import type { CrawlRun, Database, Job, RawJob, SourceResult } from "../types";
import { loadDb, saveDb } from "../store";
import { excerpt, MIN_SCORE, scoreJob } from "./score";
import * as remotive from "./sources/remotive";
import * as remoteok from "./sources/remoteok";
import * as weworkremotely from "./sources/weworkremotely";
import * as greenhouse from "./sources/greenhouse";

const SOURCES = [remotive, remoteok, weworkremotely, greenhouse];

const REMOTE_RE = /\b(remote|anywhere|worldwide|global)\b/i;
const STALE_DAYS = 60;

function jobId(raw: RawJob): string {
  const key = `${raw.company}::${raw.title}`.toLowerCase().replace(/\s+/g, " ").trim();
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
      if (tags.score < MIN_SCORE) continue;
      kept++;
      const location = raw.location || "Remote";
      matched.push({
        id: jobId(raw),
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
      updated++;
    } else {
      byId.set(job.id, job);
      added++;
    }
  }

  // Drop listings not seen in STALE_DAYS unless the operator saved/applied them.
  const cutoff = Date.now() - STALE_DAYS * 24 * 3600 * 1000;
  const jobs = [...byId.values()].filter(
    (j) => j.status === "saved" || j.status === "applied" || new Date(j.lastSeenAt).getTime() >= cutoff
  );

  const run: CrawlRun = { at: now, results, added, updated };
  const next: Database = { jobs, lastCrawl: run };
  await saveDb(next);
  return run;
}
