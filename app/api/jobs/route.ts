import { NextRequest, NextResponse } from "next/server";
import { loadDb } from "@/lib/store";
import { runCrawl } from "@/lib/crawler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// On serverless hosts each instance has its own /tmp database, so a fresh
// instance starts from seed data even after a crawl ran elsewhere. Self-heal:
// crawl inline when this instance has no live listings (or stale ones), but
// never more than once per RETRY window so failing sources can't slow every
// request.
const STALE_MS = 6 * 3600 * 1000;
const RETRY_MS = 10 * 60 * 1000;

async function freshDb() {
  let db = await loadDb();
  const hasLive = db.jobs.some((j) => j.source !== "sample");
  const lastAttempt = db.lastCrawl ? new Date(db.lastCrawl.at).getTime() : 0;
  const stale = Date.now() - lastAttempt > STALE_MS;
  if ((!hasLive || stale) && Date.now() - lastAttempt > RETRY_MS) {
    try {
      await runCrawl();
      db = await loadDb();
    } catch {
      // keep serving whatever we have
    }
  }
  return db;
}

export async function GET(req: NextRequest) {
  const db = await freshDb();
  const params = req.nextUrl.searchParams;
  const q = (params.get("q") || "").toLowerCase();
  const fn = params.get("function");
  const engagement = params.get("engagement");
  const source = params.get("source");
  const status = params.get("status");
  const minScore = Number(params.get("minScore") || 0);
  const remoteOnly = params.get("remote") === "true";

  let jobs = db.jobs;
  if (status) jobs = jobs.filter((j) => j.status === status);
  else jobs = jobs.filter((j) => j.status !== "hidden");
  if (q)
    jobs = jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        j.description.toLowerCase().includes(q)
    );
  if (fn) jobs = jobs.filter((j) => j.functions.includes(fn as never));
  if (engagement) jobs = jobs.filter((j) => j.engagement.includes(engagement as never));
  if (source) jobs = jobs.filter((j) => j.source === source);
  if (minScore) jobs = jobs.filter((j) => j.score >= minScore);
  if (remoteOnly) jobs = jobs.filter((j) => j.remote);

  jobs = [...jobs].sort(
    (a, b) => b.score - a.score || new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
  );

  return NextResponse.json({ jobs, lastCrawl: db.lastCrawl, total: jobs.length });
}
