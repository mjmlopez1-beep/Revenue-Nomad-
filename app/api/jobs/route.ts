import { NextRequest, NextResponse } from "next/server";
import { loadDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = await loadDb();
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
