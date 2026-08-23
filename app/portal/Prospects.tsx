"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Prospect, ProspectScan, ProspectStatus } from "@/lib/types";
import { SIGNAL_LABELS } from "@/lib/prospects/config";

interface ApiResponse {
  prospects: Prospect[];
  lastScan: ProspectScan | null;
}

type Tab = "new" | "queued" | "contacted" | "dismissed";

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function scoreClass(score: number): string {
  if (score >= 70) return "score";
  if (score >= 45) return "score mid";
  return "score low";
}

const DOT_COLORS: Record<string, string> = {
  departure: "#c2564a",
  "leadership-gap": "#1e6b42",
  "team-without-leader": "#2f7d4f",
  funding: "#b98a1d",
  "hiring-role": "#3d7ea6",
  "content-gap": "#8a6db0",
  "ai-native": "#5c6ac0",
  "actively-hiring": "#4fa06a",
  "early-inflection": "#6d9b4f",
  "started-hiring": "#1e6b42",
  "headcount-jump": "#2f7d4f",
  "positioning-shift": "#8a6db0",
  "newly-launched": "#3d7ea6",
};

function signalAge(iso?: string): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (isNaN(days) || days < 0) return null;
  if (days === 0) return "today";
  return `${days}d ago`;
}

function CompanyLogo({ prospect }: { prospect: Prospect }) {
  const sources = useMemo(
    () =>
      [
        prospect.logo,
        prospect.domain
          ? `https://www.google.com/s2/favicons?domain=${prospect.domain}&sz=64`
          : undefined,
      ].filter(Boolean) as string[],
    [prospect.logo, prospect.domain]
  );
  const [idx, setIdx] = useState(0);
  if (idx >= sources.length) {
    return <span className="avatar avatar-letter">{prospect.company.charAt(0).toUpperCase()}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="avatar"
      src={sources[idx]}
      alt=""
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

export default function Prospects() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [lastScan, setLastScan] = useState<ProspectScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("new");

  const load = useCallback(async () => {
    const res = await fetch("/api/prospects", { cache: "no-store" });
    const data: ApiResponse = await res.json();
    setProspects(data.prospects);
    setLastScan(data.lastScan);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runScan = async () => {
    setScanning(true);
    setScanMsg(null);
    try {
      // Send the locally saved profile with the scan: serverless instances
      // don't share storage, so the scanning instance may never have seen it.
      let profile: unknown;
      try {
        const raw = localStorage.getItem("rn-profile");
        if (raw) profile = JSON.parse(raw);
      } catch {
        /* no local profile */
      }
      const res = await fetch("/api/prospects/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile ? { profile } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "scan failed");
      const scan: ProspectScan = data.scan;
      const errors = scan.results.filter((r) => r.error);
      setScanMsg(
        `${scan.engineVersion ? `Engine ${scan.engineVersion} · ` : ""}Scanned ${scan.results.length - errors.length}/${scan.results.length} signal sources — ${scan.added} new, ${scan.updated} refreshed` +
          (errors.length
            ? ` — failed: ${errors.map((e) => `${e.source} (${e.error})`).join("; ")}`
            : "")
      );
      // Use the prospects returned by the scanning instance directly — a
      // re-fetch could land on an instance that never saw this scan.
      if (Array.isArray(data.prospects)) {
        setProspects(data.prospects);
        setLastScan(scan);
      } else {
        await load();
      }
    } catch (err) {
      setScanMsg(`Scan failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setScanning(false);
    }
  };

  const setStatus = async (id: string, status: ProspectStatus) => {
    setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    await fetch(`/api/prospects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  const counts = useMemo(
    () => ({
      new: prospects.filter((p) => p.status === "new").length,
      queued: prospects.filter((p) => p.status === "queued").length,
      contacted: prospects.filter((p) => p.status === "contacted").length,
      dismissed: prospects.filter((p) => p.status === "dismissed").length,
    }),
    [prospects]
  );

  const visible = useMemo(
    () => prospects.filter((p) => p.status === tab).sort((a, b) => b.overall - a.overall),
    [prospects, tab]
  );

  const hotCount = prospects.filter((p) => p.status !== "dismissed" && p.overall >= 70).length;

  return (
    <>
      <div className="portal-head">
        <div>
          <h1>Prospects</h1>
          <div className="sub">
            Companies matching your ICP with timing signals suggesting they need you <em>now</em>.
            {lastScan && <> Last scan: {timeAgo(lastScan.at)}.</>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {scanMsg && <span className="crawl-status">{scanMsg}</span>}
          <button className="btn" onClick={runScan} disabled={scanning}>
            {scanning ? "Scanning…" : "Scan for signals"}
          </button>
        </div>
      </div>

      {prospects.length === 0 && !loading && (
        <div className="notice">
          No prospects yet. Set your ICP and watchlist in the <strong>Profile</strong> tab, then hit{" "}
          <strong>Scan for signals</strong>.
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <div className="label">To review</div>
          <div className="value">{counts.new}</div>
        </div>
        <div className="stat">
          <div className="label">Hot (70+)</div>
          <div className="value">{hotCount}</div>
        </div>
        <div className="stat">
          <div className="label">Queued</div>
          <div className="value">{counts.queued}</div>
        </div>
        <div className="stat">
          <div className="label">Contacted</div>
          <div className="value">{counts.contacted}</div>
        </div>
      </div>

      <div className="tabs">
        {(
          [
            ["new", "To review"],
            ["queued", "Queued"],
            ["contacted", "Contacted"],
            ["dismissed", "Dismissed"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
            {label}
            <span className="count">{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="job-list">
        {loading ? (
          <div className="empty">Loading prospects…</div>
        ) : visible.length === 0 ? (
          <div className="empty">Nothing here yet.</div>
        ) : (
          visible.map((p) => (
            <article key={p.id} className="job-card">
              <div className="job-top">
                <div className="company-head">
                  <CompanyLogo prospect={p} />
                  <div>
                    <div className="job-title">
                      {p.domain ? (
                        <a href={`https://${p.domain}`} target="_blank" rel="noopener noreferrer">
                          {p.company}
                        </a>
                      ) : (
                        p.company
                      )}
                    </div>
                    <div className="job-company">
                      {p.firstSeenAt === p.lastSeenAt && <span className="new-badge">New</span>}
                      ICP fit {p.icpFit} · timing {p.timing}
                      {p.matchedIcp.length > 0 && <> · matches {p.matchedIcp.join(", ")}</>}
                    </div>
                  </div>
                </div>
                <span
                  className={scoreClass(p.overall)}
                  title="Composite priority: (ICP fit)^1.5 × timing"
                >
                  {p.overall}
                </span>
              </div>

              <div className="why-now">
                <div className="why-label">Why now</div>
                {p.signals.map((s, i) => (
                  <div key={i} className="signal-row">
                    <span className="sig-chip">
                      <span
                        className="sig-dot"
                        style={{ background: DOT_COLORS[s.type] || "#6d7a70" }}
                      />
                      {SIGNAL_LABELS[s.type] || s.type}
                    </span>
                    <span>
                      <strong>{s.label}</strong>
                      {signalAge(s.detectedOn) && (
                        <span className="signal-detail"> · {signalAge(s.detectedOn)}</span>
                      )}
                      {s.detail && <span className="signal-detail"> — {s.detail}</span>}{" "}
                      {s.evidenceUrl && (
                        <a href={s.evidenceUrl} target="_blank" rel="noopener noreferrer">
                          View source
                        </a>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pitch">
                <div className="why-label">Suggested angle</div>
                {p.suggestedPitch}
              </div>

              <div className="job-actions">
                {p.status !== "queued" && (
                  <button className="action primary" onClick={() => setStatus(p.id, "queued")}>
                    Queue outreach
                  </button>
                )}
                {p.status !== "contacted" && (
                  <button className="action" onClick={() => setStatus(p.id, "contacted")}>
                    Mark contacted
                  </button>
                )}
                {p.status !== "dismissed" ? (
                  <button className="action danger" onClick={() => setStatus(p.id, "dismissed")}>
                    Dismiss
                  </button>
                ) : (
                  <button className="action" onClick={() => setStatus(p.id, "new")}>
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
