"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Prospect, ProspectScan, ProspectStatus } from "@/lib/types";
import { ALLOWED_SIGNALS, SIGNAL_CONFIG, SIGNAL_LABELS } from "@/lib/prospects/config";
import { roleSignalDocs } from "@/lib/prospects/signalLibrary";
import type { OperatorRole, TimingSignal } from "@/lib/types";

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
  "function-gap": "#c2564a",
  "leader-appointed": "#3d7ea6",
};

function useOperatorRole(): OperatorRole {
  const [role, setRole] = useState<OperatorRole>("Sales Leadership");
  useEffect(() => {
    try {
      const raw = localStorage.getItem("rn-profile");
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.role) setRole(p.role);
      }
    } catch {
      /* default */
    }
  }, []);
  return role;
}

function signalAge(iso?: string): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (isNaN(days) || days < 0) return null;
  if (days === 0) return "detected today";
  return `detected ${days}d ago`;
}

/**
 * A signal's live contribution to the timing score: weight × decay, using the
 * same math as the engine (embedded tuning first, type config as fallback).
 */
function signalStrength(s: TimingSignal, role: OperatorRole): { pct: number; halfLife: number | null } {
  const cfg = SIGNAL_CONFIG[s.type];
  const w = s.weight ?? cfg?.roleWeights?.[role] ?? cfg?.weight ?? 0.5;
  const halfLife = s.halfLifeDays !== undefined ? s.halfLifeDays : (cfg?.halfLifeDays ?? null);
  let decay = 1;
  if (halfLife !== null && s.detectedOn) {
    const days = Math.max(0, (Date.now() - new Date(s.detectedOn).getTime()) / 86400000);
    decay = Math.pow(0.5, days / halfLife);
  }
  return { pct: Math.round(w * decay * 100), halfLife };
}

/** Single-hue magnitude meter: value label + thin track/fill bar. */
function Meter({ value, label }: { value: number; label?: string }) {
  return (
    <div className="meter-wrap" title={label}>
      <div className="meter">
        <div className="meter-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="meter-value">{value}</span>
    </div>
  );
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
  const operatorRole = useOperatorRole();
  const signalDocs = useMemo(
    () => roleSignalDocs(operatorRole, ALLOWED_SIGNALS[operatorRole] || []),
    [operatorRole]
  );
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
          <details className="signal-docs">
            <summary>
              Scanning {signalDocs.length} signals for {operatorRole}
            </summary>
            <ul>
              {signalDocs.map((d) => (
                <li key={d.label}>{d.question}</li>
              ))}
            </ul>
          </details>
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
                      {p.matchedIcp.length > 0 ? <>Matches {p.matchedIcp.join(", ")}</> : "ICP candidate"}
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

              <div className="score-breakdown">
                <div className="score-item">
                  <span className="score-label">ICP fit</span>
                  <Meter value={p.icpFit} label="Structured match against your profile ICP" />
                </div>
                <div className="score-item">
                  <span className="score-label">Timing</span>
                  <Meter value={p.timing} label="Noisy-OR of the signals below, decayed to today" />
                </div>
                <span className="score-formula">priority = fit<sup>1.5</sup> × timing</span>
              </div>

              <div className="why-now">
                <div className="why-head">
                  <span className="why-label">Why now</span>
                  <span className="why-col-label">Signal strength today</span>
                </div>
                {[...p.signals]
                  .map((s) => ({ s, strength: signalStrength(s, operatorRole) }))
                  .sort((a, b) => b.strength.pct - a.strength.pct)
                  .map(({ s, strength }, i) => (
                    <div key={i} className="signal-row">
                      <span className="sig-chip">
                        <span
                          className="sig-dot"
                          style={{ background: DOT_COLORS[s.type] || "#6d7a70" }}
                        />
                        {SIGNAL_LABELS[s.type] || s.type}
                      </span>
                      <span className="sig-body">
                        <span className="sig-title">{s.label}</span>
                        {s.detail && <span className="sig-detail">{s.detail}</span>}
                        <span className="sig-meta">
                          {signalAge(s.detectedOn) || "Standing condition"}
                          {strength.halfLife !== null
                            ? ` · ${strength.halfLife}-day half-life`
                            : " · does not decay"}
                          {s.evidenceUrl && (
                            <>
                              {" · "}
                              <a href={s.evidenceUrl} target="_blank" rel="noopener noreferrer">
                                View evidence
                              </a>
                            </>
                          )}
                        </span>
                      </span>
                      <span className="sig-strength">
                        <span className="meter sig-meter">
                          <span className="meter-fill" style={{ width: `${strength.pct}%` }} />
                        </span>
                        <span className="meter-value">{strength.pct}%</span>
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
