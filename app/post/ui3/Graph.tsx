"use client";

/**
 * The relationship graph (Warm Paths and the company view's "How you get in"): you, each person on
 * the way, and who decides (or the company). Drawn from Merlin's real routes (GET /api/paths?way=):
 * each link's weight is its relationship band (Strong, Good, Fading, Cold: never a score), its words
 * are what it rests on, and its tooltip where Merlin knows it from. The second route, when there is
 * one, branches below; hover a person to see their route, click the other route's person to switch.
 */
import { useEffect, useRef, useState } from "react";
import type { RouteNode, RouteView } from "@/lib/paths/types";
import { tintOf } from "./model";

const SW: Record<string, number> = { Strong: 7, Good: 4.5, Fading: 2.4, Cold: 1.8 };
const key = (n: RouteNode) => `${n.role}:${n.label}`;

export function Graph({ routes, act, onPick, compact, youInitials, youSub }: { routes: RouteView[]; act: number; onPick?: (i: number) => void; compact?: boolean; youInitials: string; youSub: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  const [hover, setHover] = useState<number | "all" | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; t: string; s: string } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = () => setW(Math.max(280, Math.round(el.clientWidth) || 900));
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const paths = routes.slice(0, 2);
  if (!paths.length) return null;
  const a = Math.min(act, paths.length - 1);
  const vert = W < (compact ? 560 : 620);
  const main = paths[a].nodes;
  const pos = new Map<string, { x: number; y: number; n: RouteNode }>();
  let H: number;
  if (!vert) {
    H = compact ? (paths.length > 1 ? 290 : 170) : paths.length > 1 ? 360 : 280;
    const pad = compact ? 64 : 100;
    const y0 = compact ? 70 : 140;
    main.forEach((n, i) => pos.set(key(n), { x: pad + (i * (W - 2 * pad)) / Math.max(1, main.length - 1), y: y0, n }));
    const other = paths[1 - a];
    if (other) {
      const ex = other.nodes.filter((n) => !pos.has(key(n)));
      ex.forEach((n, i) => pos.set(key(n), { x: pad + ((i + 1) * (W - 2 * pad)) / (ex.length + 1), y: compact ? 200 : 280, n }));
    }
  } else {
    const step = compact ? 110 : 130;
    H = 70 + (main.length - 1) * step + 50;
    main.forEach((n, i) => pos.set(key(n), { x: 48, y: 46 + i * step, n }));
    const other = paths[1 - a];
    if (other) {
      const ex = other.nodes.filter((n) => !pos.has(key(n)));
      ex.forEach((n, i) => pos.set(key(n), { x: W - 56, y: 46 + ((i + 1) * ((main.length - 1) * step)) / (ex.length + 1), n }));
    }
  }
  const curve = (p: { x: number; y: number }, q: { x: number; y: number }) =>
    vert ? `M${p.x} ${p.y} C${p.x} ${p.y + (q.y - p.y) / 2} ${q.x} ${q.y - (q.y - p.y) / 2} ${q.x} ${q.y}` : `M${p.x} ${p.y} C${p.x + (q.x - p.x) / 2} ${p.y} ${q.x - (q.x - p.x) / 2} ${q.y} ${q.x} ${q.y}`;
  const inPaths = (k: string) => paths.map((p, i) => (p.nodes.some((n) => key(n) === k) ? i : -1)).filter((i) => i >= 0);
  const show = (e: React.SyntheticEvent, t: string, s: string) => {
    const b = box.current!.getBoundingClientRect();
    const r = (e.target as Element).getBoundingClientRect();
    setTip({ x: r.left - b.left + r.width / 2, y: r.top - b.top, t, s });
  };
  const hov = hover === null ? undefined : String(hover);
  return (
    <div className="gr-wrap" ref={box} style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="gr" data-act-path={a} data-hover={hov} role="img" aria-label={`Ways in: ${paths.map((p) => p.chain).join("; or ")}`}>
        {paths.map((p, pi) =>
          p.links.map((l, li) => {
            const s = pos.get(key(p.nodes[li]));
            const t = pos.get(key(p.nodes[li + 1]));
            if (!s || !t) return null;
            const mx = (s.x + t.x) / 2;
            const my = (s.y + t.y) / 2;
            return (
              <g key={`${pi}-${li}`}>
                <path
                  className={`gr-e p${pi}${l.band === "Cold" ? " inf" : ""}`}
                  d={curve(s, t)}
                  style={{ strokeWidth: SW[l.band] ?? 2.4 }}
                  onMouseEnter={(e) => show(e, `${l.band} link`, [l.words, l.from].filter(Boolean).join(" · "))}
                  onMouseLeave={() => setTip(null)}
                >
                  <title>{`${l.band}. ${l.words}${l.from ? `. From ${l.from}` : ""}`}</title>
                </path>
                {!compact && l.words && (
                  <text className={`gr-l p${pi}`} x={(vert ? mx + 18 : mx).toFixed(1)} y={(vert ? my + 4 : my - 14).toFixed(1)} textAnchor={vert ? undefined : "middle"}>
                    {l.words.length > 34 ? `${l.words.slice(0, 33)}…` : l.words}
                  </text>
                )}
              </g>
            );
          }),
        )}
        {[...pos.entries()].map(([k, q]) => {
          const n = q.n;
          const you = n.role === "you";
          const target = n.role === "target";
          const r = you || target ? 26 : 22;
          const ps = inPaths(k);
          const alt = !you && ps.length === 1 && ps[0] !== a && !!onPick;
          const name = you ? "You" : n.label;
          const sub = you ? youSub : n.sub ?? "";
          const fill = you ? "#2f7a5f" : n.locked ? "var(--m-line-2)" : tintOf(n.label);
          return (
            <g
              key={k}
              className={`gr-n${alt ? " alt" : ""}`}
              tabIndex={0}
              role={alt ? "button" : "img"}
              aria-label={alt ? `Use the route through ${name}` : `${name}${sub ? `, ${sub}` : ""}`}
              onMouseEnter={(e) => (setHover(ps.length > 1 ? "all" : ps[0] ?? null), show(e, name, sub))}
              onMouseLeave={() => (setHover(null), setTip(null))}
              onFocus={() => setHover(ps.length > 1 ? "all" : ps[0] ?? null)}
              onBlur={() => setHover(null)}
              onClick={() => alt && onPick!(ps[0])}
              onKeyDown={(e) => alt && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick!(ps[0]))}
            >
              {alt && <circle cx={q.x} cy={q.y} r={r + 6} className="gr-alt" />}
              {target && n.sub && /decid/i.test(n.sub) && <circle cx={q.x} cy={q.y} r={r + 6} className="gr-dm" />}
              <circle cx={q.x} cy={q.y} r={r} fill={fill} className="gr-c" />
              <text className={`gr-i${you ? " you" : ""}`} x={q.x} y={q.y + 5} textAnchor="middle">
                {you ? youInitials : n.locked ? "?" : n.initials}
              </text>
              {vert ? (
                <text className="gr-nm" x={q.x < W / 2 ? q.x + r + 12 : q.x - r - 10} y={q.y + 5} textAnchor={q.x < W / 2 ? undefined : "end"}>
                  {q.x < W / 2 ? name : name.split(" ")[0]}
                </text>
              ) : (
                <>
                  <text className="gr-nm" x={q.x} y={q.y + r + 20} textAnchor="middle">
                    {name.length > 22 ? `${name.slice(0, 21)}…` : name}
                  </text>
                  {sub && (
                    <text className="gr-rl" x={q.x} y={q.y + r + 37} textAnchor="middle">
                      {sub.length > 26 ? `${sub.slice(0, 25)}…` : sub}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="m-tip" style={{ left: tip.x, top: tip.y, transform: "translate(-50%, calc(-100% - 10px))" }}>
          <b>{tip.t}</b>
          {tip.s && <small>{tip.s}</small>}
        </div>
      )}
    </div>
  );
}

/** The legend: the four bands, as the links draw them. */
export function GraphLegend({ hint }: { hint?: string }) {
  return (
    <ul className="gr-leg">
      <li>
        <i style={{ height: 7 }} />
        Strong
      </li>
      <li>
        <i style={{ height: 4.5 }} />
        Good
      </li>
      <li>
        <i style={{ height: 2.4 }} />
        Fading
      </li>
      <li>
        <i className="inf" />
        Cold
      </li>
      {hint && <li className="m-small">{hint}</li>}
    </ul>
  );
}
