"use client";

import { useState } from "react";
import type { IndexSnap } from "./state";

/**
 * Demand Index 12-week trend. Single series (no legend needed — the title
 * names it), 2px line, hover crosshair + tooltip, recessive grid, endpoint
 * direct-labeled.
 */
export default function IndexChart({ trend }: { trend: IndexSnap[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 170;
  const PAD = { l: 34, r: 46, t: 14, b: 22 };
  const data = trend.filter((s) => s.respondents > 0);
  if (data.length < 2) return <p className="muted">Trend appears once two weeks of pulses exist.</p>;
  const max = Math.max(...data.map((d) => d.total)) * 1.12;
  const x = (i: number) => PAD.l + (i / (data.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.total).toFixed(1)}`).join(" ");
  const area = `${path} L${x(data.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const last = data[data.length - 1];
  const gridVals = [Math.round(max * 0.33), Math.round(max * 0.66)];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    data.forEach((_, i) => {
      const d = Math.abs(x(i) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  }

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Nomad Demand Index, last ${data.length} weeks, currently ${last.total}`}
      >
        {gridVals.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#e5e9e2" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(v) + 3.5} fontSize={10} fill="#97a29a" textAnchor="end">{v}</text>
          </g>
        ))}
        <path d={area} fill="#2f7d4f" opacity={0.09} />
        <path d={path} fill="none" stroke="#2f7d4f" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#d8dfd4" strokeWidth={1} />
        )}
        {data.map((d, i) => (
          <circle
            key={d.week}
            cx={x(i)}
            cy={y(d.total)}
            r={hover === i ? 4.5 : i === data.length - 1 ? 3.5 : 0}
            fill="#2f7d4f"
            stroke="#fff"
            strokeWidth={2}
          />
        ))}
        {/* endpoint direct label */}
        <text x={x(data.length - 1) + 8} y={y(last.total) + 4} fontSize={12} fontWeight={700} fill="#182119">
          {last.total}
        </text>
        <text x={PAD.l} y={H - 6} fontSize={10} fill="#97a29a">{data[0].week}</text>
        <text x={W - PAD.r} y={H - 6} fontSize={10} fill="#97a29a" textAnchor="end">{last.week}</text>
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(data[hover].total) / H) * 100}%` }}>
          {data[hover].week}: <b>{data[hover].total}</b> <span className="dim">({data[hover].respondents} pulses)</span>
        </div>
      )}
    </div>
  );
}
