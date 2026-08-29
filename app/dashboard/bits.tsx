"use client";

import type { Cell, TapeRow } from "./state";
import { fmtMoney } from "./state";

/** Locked-panel veil: blurred fake content + the unlock action. */
export function Veil({
  cost,
  label,
  onUnlock,
  balance,
  hint,
  cta,
}: {
  cost?: number;
  label: string;
  onUnlock?: () => void;
  balance?: number;
  hint?: string;
  cta?: string;
}) {
  return (
    <div className="veil">
      <div className="veil-ghost" aria-hidden>
        {[92, 74, 61, 48, 37].map((w, i) => (
          <div key={i} className="barrow">
            <span className="lbl">■■■■■■■■</span>
            <span className="bar-wrap"><span className="bar" style={{ width: `${w}%` }} /></span>
            <span className="val">■■■</span>
          </div>
        ))}
      </div>
      <div className="veil-cover">
        <span className="lock">🔒</span>
        <p>{hint ?? `${label} is gated.`}</p>
        {onUnlock && cost !== undefined && (
          <button className="btn btn-sm" onClick={onUnlock} disabled={balance !== undefined && balance < cost}>
            {cta ?? `Unlock — ${cost} credits`}
          </button>
        )}
        {balance !== undefined && cost !== undefined && balance < cost && (
          <span className="tiny">You have {balance} credits. Contribute to earn more.</span>
        )}
      </div>
    </div>
  );
}

/**
 * Magnitude panel: horizontal bar rows, single hue, medians direct-labeled,
 * IQR whisker (p25–p75) overlaid. Labels/values in ink, never series color.
 */
export function BarRows({ cells, money, suffix }: { cells: Cell[]; money?: boolean; suffix?: string }) {
  if (!cells?.length) return <p className="muted">Not enough data yet — cells need 5+ operators.</p>;
  const max = Math.max(...cells.map((c) => c.p75 ?? c.median)) * 1.05;
  return (
    <div>
      {cells.map((c) => (
        <div key={c.key} className="barrow" title={`p25 ${Math.round(c.p25)} · median ${Math.round(c.median)} · p75 ${Math.round(c.p75)} · n=${c.n}`}>
          <span className="lbl">
            {c.label}
            <span className="n">n={c.n}</span>
          </span>
          <span className="bar-wrap">
            <span className="bar" style={{ width: `${(c.median / max) * 100}%` }} />
            <span className="iqr" style={{ left: `${(c.p25 / max) * 100}%`, width: `${((c.p75 - c.p25) / max) * 100}%` }} />
          </span>
          <span className="val">
            {money ? fmtMoney(c.median) : `${Math.round(c.median)}${suffix ?? ""}`}
          </span>
        </div>
      ))}
      <p className="tiny" style={{ marginTop: 6 }}>
        Bars = median; thin whisker = p25–p75. Verified rows weight 2×. Cells under 5 operators suppressed.
      </p>
    </div>
  );
}

/** The always-running anonymized tape. */
export function Tape({ rows }: { rows: TapeRow[] }) {
  if (!rows?.length) return null;
  const doubled = [...rows, ...rows]; // seamless loop
  return (
    <div className="tape" aria-label="Live network tape">
      <div className="tape-track">
        {doubled.map((r, i) => (
          <span key={i} className="tape-item">
            <span className={`tape-dot ${r.outcome}`} />
            <b>{r.outcome === "won" ? "WON" : "LOST"}</b> {r.func} · {r.stage} · {r.band}
            <span className="dim">
              {r.source} · {r.cycleWeeks}w{r.verified ? " · ✓" : ""}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
