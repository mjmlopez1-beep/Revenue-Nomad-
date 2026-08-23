"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CrawlRun, Job, JobStatus } from "@/lib/types";

const FUNCTIONS = [
  "GTM Leadership",
  "Sales",
  "Marketing",
  "RevOps",
  "Growth",
  "Partnerships",
  "Customer Success",
];
const ENGAGEMENTS = ["Fractional", "Interim", "Contract", "Part-time", "Advisory", "Full-time"];

type Tab = "board" | "saved" | "applied" | "hidden";

interface ApiResponse {
  jobs: Job[];
  lastCrawl: CrawlRun | null;
  total: number;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function scoreClass(score: number): string {
  if (score >= 70) return "score";
  if (score >= 45) return "score mid";
  return "score low";
}

export default function JobBoard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [lastCrawl, setLastCrawl] = useState<CrawlRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [crawlMsg, setCrawlMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("board");
  const [q, setQ] = useState("");
  const [fn, setFn] = useState("");
  const [engagement, setEngagement] = useState("");
  const [source, setSource] = useState("");
  const [kind, setKind] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [remoteOnly, setRemoteOnly] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/jobs", { cache: "no-store" });
    const data: ApiResponse = await res.json();
    setJobs(data.jobs);
    setLastCrawl(data.lastCrawl);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runCrawl = async () => {
    setCrawling(true);
    setCrawlMsg(null);
    try {
      const res = await fetch("/api/crawl", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "crawl failed");
      const run: CrawlRun = data.run;
      const errors = run.results.filter((r) => r.error);
      const ok = run.results.filter((r) => !r.error);
      setCrawlMsg(
        `Crawled ${ok.length}/${run.results.length} sources — ${run.added} new, ${run.updated} refreshed` +
          (errors.length ? ` (failed: ${errors.map((e) => e.source).join(", ")})` : "")
      );
      await load();
    } catch (err) {
      setCrawlMsg(`Crawl failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCrawling(false);
    }
  };

  const setStatus = async (id: string, status: JobStatus) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status } : j)));
    await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  const sources = useMemo(() => [...new Set(jobs.map((j) => j.source))].sort(), [jobs]);

  const counts = useMemo(
    () => ({
      board: jobs.filter((j) => j.status !== "hidden").length,
      saved: jobs.filter((j) => j.status === "saved").length,
      applied: jobs.filter((j) => j.status === "applied").length,
      hidden: jobs.filter((j) => j.status === "hidden").length,
    }),
    [jobs]
  );

  const visible = useMemo(() => {
    let list = jobs;
    if (tab === "board") list = list.filter((j) => j.status !== "hidden");
    else list = list.filter((j) => j.status === tab);
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter(
        (j) =>
          j.title.toLowerCase().includes(needle) ||
          j.company.toLowerCase().includes(needle) ||
          j.description.toLowerCase().includes(needle)
      );
    }
    if (fn) list = list.filter((j) => (j.functions as string[]).includes(fn));
    if (engagement) list = list.filter((j) => (j.engagement as string[]).includes(engagement));
    if (source) list = list.filter((j) => j.source === source);
    if (kind) list = list.filter((j) => (j.kind || "listing") === kind);
    if (minScore) list = list.filter((j) => j.score >= minScore);
    if (remoteOnly) list = list.filter((j) => j.remote);
    return [...list].sort(
      (a, b) => b.score - a.score || new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
    );
  }, [jobs, tab, q, fn, engagement, source, kind, minScore, remoteOnly]);

  const fractionalCount = jobs.filter(
    (j) => j.status !== "hidden" && (j.engagement as string[]).includes("Fractional")
  ).length;
  const leadCount = jobs.filter((j) => j.status !== "hidden" && j.kind === "discussion").length;
  const onlySample = jobs.length > 0 && jobs.every((j) => j.source === "sample");

  return (
    <>
      <div className="portal-head">
        <div>
          <h1>Operator Portal</h1>
          <div className="sub">
            Open fractional &amp; GTM roles, aggregated from across the web.
            {lastCrawl && <> Last crawl: {timeAgo(lastCrawl.at)}.</>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {crawlMsg && <span className="crawl-status">{crawlMsg}</span>}
          <button className="btn" onClick={runCrawl} disabled={crawling}>
            {crawling ? "Crawling…" : "Run crawl"}
          </button>
        </div>
      </div>

      {onlySample && (
        <div className="notice">
          Showing sample listings. Hit <strong>Run crawl</strong> to pull live roles from Remotive,
          RemoteOK, We Work Remotely, and configured Greenhouse boards.
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <div className="label">Open roles</div>
          <div className="value">{counts.board}</div>
        </div>
        <div className="stat">
          <div className="label">Fractional</div>
          <div className="value">{fractionalCount}</div>
        </div>
        <div className="stat">
          <div className="label">Saved</div>
          <div className="value">{counts.saved}</div>
        </div>
        <div className="stat">
          <div className="label">Community leads</div>
          <div className="value">{leadCount}</div>
        </div>
      </div>

      <div className="filters">
        <input
          type="search"
          placeholder="Search title, company, description…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={fn} onChange={(e) => setFn(e.target.value)}>
          <option value="">All functions</option>
          {FUNCTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select value={engagement} onChange={(e) => setEngagement(e.target.value)}>
          <option value="">All engagement types</option>
          {ENGAGEMENTS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Listings + leads</option>
          <option value="listing">Job listings</option>
          <option value="discussion">Community leads</option>
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}>
          <option value={0}>Any score</option>
          <option value={45}>Score ≥ 45</option>
          <option value={70}>Score ≥ 70</option>
          <option value={85}>Score ≥ 85</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={(e) => setRemoteOnly(e.target.checked)}
          />
          Remote only
        </label>
      </div>

      <div className="tabs">
        {(
          [
            ["board", "Board"],
            ["saved", "Saved"],
            ["applied", "Applied"],
            ["hidden", "Hidden"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`tab ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
            <span className="count">{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="job-list">
        {loading ? (
          <div className="empty">Loading roles…</div>
        ) : visible.length === 0 ? (
          <div className="empty">
            No roles match. Try clearing filters{tab === "board" ? " or running a crawl" : ""}.
          </div>
        ) : (
          visible.map((job) => (
            <article key={job.id} className="job-card">
              <div className="job-top">
                <div className="company-head">
                  <span className="avatar avatar-letter">{job.company.charAt(0).toUpperCase()}</span>
                  <div>
                    <div className="job-title">
                      <a href={job.url} target="_blank" rel="noopener noreferrer">
                        {job.title}
                      </a>
                    </div>
                    <div className="job-company">
                      {job.company} · {job.location} · posted {timeAgo(job.postedAt)}
                    </div>
                  </div>
                </div>
                <span className={scoreClass(job.score)} title="Fractional-GTM fit score">
                  {job.score}
                </span>
              </div>
              {job.description && <p className="job-desc">{job.description}</p>}
              <div className="job-meta">
                {job.kind === "discussion" && <span className="pill lead">Community lead</span>}
                {job.engagement.map((e) => (
                  <span
                    key={e}
                    className={`pill engagement ${e === "Fractional" ? "fractional" : ""}`}
                  >
                    {e}
                  </span>
                ))}
                {job.commitment && <span className="pill salary">{job.commitment}</span>}
                {job.rate && <span className="pill salary">{job.rate}</span>}
                {job.term && <span className="pill salary">{job.term}</span>}
                {job.functions.map((f) => (
                  <span key={f} className="pill">
                    {f}
                  </span>
                ))}
                {job.seniority && <span className="pill">{job.seniority}</span>}
                {job.salary && <span className="pill salary">{job.salary}</span>}
                <span className="pill source">{job.source}</span>
              </div>
              <div className="job-actions">
                {job.status !== "saved" ? (
                  <button className="action primary" onClick={() => setStatus(job.id, "saved")}>
                    Save
                  </button>
                ) : (
                  <button className="action active" onClick={() => setStatus(job.id, "new")}>
                    Saved
                  </button>
                )}
                {job.status !== "applied" ? (
                  <button className="action" onClick={() => setStatus(job.id, "applied")}>
                    Mark applied
                  </button>
                ) : (
                  <button className="action active" onClick={() => setStatus(job.id, "new")}>
                    Applied
                  </button>
                )}
                {job.status !== "hidden" ? (
                  <button className="action danger" onClick={() => setStatus(job.id, "hidden")}>
                    Hide
                  </button>
                ) : (
                  <button className="action" onClick={() => setStatus(job.id, "new")}>
                    Restore
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </>
  );
}
