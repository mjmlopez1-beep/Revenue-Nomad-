"use client";

import { useMemo, useState } from "react";
import sampleOperators from "@/data/skills/sample-operators.json";
import mattLopez from "@/data/skills/matt-lopez.json";
import {
  AXES,
  CORE_CRITERIA,
  CORE_SCALE,
  SCORE_FLOOR,
  STAGES,
  buildSkillMap,
  operatorFromReviews,
  type Aggregate,
  type ProfileDoc,
  type ScoredTag,
  type SkillMap as SkillMapData,
  type SkillOperator,
} from "@/lib/skills/score";

// Matt Lopez comes from his live profile's reviews; the rest are illustrative.
const OPERATORS: SkillOperator[] = [
  operatorFromReviews(mattLopez as ProfileDoc),
  ...(sampleOperators as SkillOperator[]).map((o) => ({ ...o, sample: true })),
];

// Radar radius as a fraction of the outer ring. No score falls below the
// claimed floor (45), so the scale runs 45–100: a claimed-only axis sits on
// the inner ring and an axis with no tags at all stays at the centre.
const INNER_RING = 0.2;
const scoreRadius = (score: number) => INNER_RING + ((1 - INNER_RING) * (score - SCORE_FLOOR)) / (100 - SCORE_FLOOR);
function radius(agg: Aggregate): number {
  return agg.score == null ? 0 : scoreRadius(agg.score);
}
// Rings mark the tier thresholds: claimed 45, verified 50, expert 85, max 100.
const RINGS = [SCORE_FLOOR, 50, 85, 100];
const PREVIEW_ROWS = 7;

function Radar({ axes }: { axes: Record<string, Aggregate> }) {
  // Wide viewBox so the axis labels stay inside the SVG's own box.
  const size = 380;
  const c = size / 2;
  const R = 112;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length;
  const pt = (i: number, r: number) => [c + Math.cos(angle(i)) * R * r, c + Math.sin(angle(i)) * R * r];
  const ring = (r: number) => AXES.map((_, i) => pt(i, r).join(",")).join(" ");
  const shape = AXES.map((a, i) => pt(i, radius(axes[a])).join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="rn-radar" role="img" aria-label="Capability radar">
      {RINGS.map((score) => (
        <polygon
          key={score}
          points={ring(scoreRadius(score))}
          className={`radar-ring ${score === SCORE_FLOOR ? "radar-inner" : ""}`}
        />
      ))}
      {AXES.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} className="radar-spoke" />;
      })}
      <polygon points={shape} className="radar-shape" />
      {AXES.map((a, i) => {
        const [x, y] = pt(i, radius(axes[a]));
        return <circle key={a} cx={x} cy={y} r={3.5} className="radar-dot" />;
      })}
      {AXES.map((a, i) => {
        const [x, y] = pt(i, 1.24);
        const agg = axes[a];
        return (
          <text key={a} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="radar-label">
            <tspan x={x}>{a}</tspan>
            <tspan x={x} dy="1.25em" className={`radar-value ${agg.claimedOnly ? "claimed" : ""}`}>
              {agg.score == null ? "—" : agg.claimedOnly ? `${agg.score} claimed` : agg.score}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

type Focus = { name: string } | null;

// Revenue bowtie: the four pre-sale stages narrow into the knot (Commit) and
// the three post-sale stages widen back out. No numbers: each stage fills
// from the bottom up, and the fill is a deeper green, the higher its score.
// The foundation axes live on the radar, so they are not repeated here.
function fillLevel(agg: Aggregate): number {
  if (agg.score == null) return 0;
  return 0.12 + (0.88 * (agg.score - SCORE_FLOOR)) / (100 - SCORE_FLOOR);
}
function fillColor(agg: Aggregate): string {
  if (agg.score == null) return "transparent";
  if (agg.claimedOnly) return "#c9d1cc";
  const t = (agg.score - SCORE_FLOOR) / (100 - SCORE_FLOOR);
  return `rgba(9, 93, 66, ${(0.3 + 0.7 * t).toFixed(2)})`;
}

type Pt = [number, number];
interface Segment {
  name: string;
  id: string;
  pts: Pt[];
  label: Pt;
}

// Horizontal: stages run left to right; the height pinches to the knot.
const BT = { w: 560, h: 190, knot: 64, top: 26, gap: 3 };
function horizontalSegments(): Segment[] {
  const edge = (i: number) => i * 80; // Commit spans 240–320
  const height = (x: number) =>
    x <= 240 ? BT.h - ((BT.h - BT.knot) * x) / 240 : x >= 320 ? BT.knot + ((BT.h - BT.knot) * (x - 320)) / 240 : BT.knot;
  const cy = BT.top + BT.h / 2;
  return STAGES.map((st, i) => {
    const x0 = edge(i) + (i ? BT.gap / 2 : 0);
    const x1 = edge(i + 1) - (i < STAGES.length - 1 ? BT.gap / 2 : 0);
    const h0 = height(edge(i));
    const h1 = height(edge(i + 1));
    return {
      name: st.name,
      id: st.id,
      pts: [
        [x0, cy - h0 / 2],
        [x1, cy - h1 / 2],
        [x1, cy + h1 / 2],
        [x0, cy + h0 / 2],
      ],
      label: [(x0 + x1) / 2, cy + 4],
    };
  });
}

// Vertical (narrow columns): stages run top to bottom; the width pinches.
const BV = { w: 320, knot: 150, seg: 52, gap: 3, top: 22 };
function verticalSegments(): Segment[] {
  const width = (i: number) => (i <= 3 ? BV.w - ((BV.w - BV.knot) * i) / 3 : BV.knot + ((BV.w - BV.knot) * (i - 4)) / 3);
  const cx = BV.w / 2;
  return STAGES.map((st, i) => {
    const y0 = BV.top + i * BV.seg + (i ? BV.gap / 2 : 0);
    const y1 = BV.top + (i + 1) * BV.seg - BV.gap / 2;
    const w0 = width(i);
    const w1 = width(i + 1);
    return {
      name: st.name,
      id: st.id,
      pts: [
        [cx - w0 / 2, y0],
        [cx + w0 / 2, y0],
        [cx + w1 / 2, y1],
        [cx - w1 / 2, y1],
      ],
      label: [cx, (y0 + y1) / 2 + 4],
    };
  });
}

function Bowtie({
  map,
  focus,
  onPick,
  vertical = false,
}: {
  map: SkillMapData;
  focus: Focus;
  onPick: (name: string) => void;
  vertical?: boolean;
}) {
  const segs = vertical ? verticalSegments() : horizontalSegments();
  const clipBase = vertical ? "btv" : "bth";
  const height = vertical ? BV.top + STAGES.length * BV.seg + 4 : BT.top + BT.h + 4;
  const width = vertical ? BV.w : BT.w;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`rn-bowtie ${vertical ? "vertical" : ""}`}
      role="group"
      aria-label="Revenue bowtie"
    >
      {vertical ? (
        <>
          <text x={width / 2} y={12} textAnchor="middle" className="bt-side">
            Before the sale
          </text>
          <text x={width / 2 - BV.knot / 2 - 8} y={BV.top + 3.5 * BV.seg + 4} textAnchor="end" className="bt-side">
            Signed
          </text>
          <text x={width / 2 + BV.knot / 2 + 8} y={BV.top + 3.5 * BV.seg - 2} className="bt-side">
            <tspan>After</tspan>
            <tspan x={width / 2 + BV.knot / 2 + 8} dy="1.2em">
              the sale
            </tspan>
          </text>
        </>
      ) : (
        <>
          <text x={2} y={12} className="bt-side">
            Before the sale
          </text>
          <text x={width - 2} y={12} textAnchor="end" className="bt-side">
            After the sale
          </text>
          <text x={280} y={BT.top + BT.h / 2 - BT.knot / 2 - 8} textAnchor="middle" className="bt-side">
            Signed
          </text>
        </>
      )}
      {segs.map((seg) => {
        const agg = map.stages[seg.name];
        const points = seg.pts.map((p) => p.join(",")).join(" ");
        const ys = seg.pts.map((p) => p[1]);
        const xs = seg.pts.map((p) => p[0]);
        const top = Math.min(...ys);
        const bottom = Math.max(...ys);
        const level = fillLevel(agg);
        const active = focus?.name === seg.name;
        const clipId = `${clipBase}-${seg.id}`;
        return (
          <g
            key={seg.id}
            className={`bt-seg ${active ? "active" : ""} ${agg.score == null ? "empty" : ""}`}
            role="button"
            tabIndex={0}
            aria-pressed={active}
            aria-label={`${seg.name}: ${agg.score == null ? "no expertise tagged" : agg.claimedOnly ? "claimed only" : `score ${agg.score}`}`}
            onClick={() => onPick(seg.name)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick(seg.name)}
          >
            <clipPath id={clipId}>
              <polygon points={points} />
            </clipPath>
            <polygon points={points} className="bt-shell" />
            {level > 0 && (
              <rect
                x={Math.min(...xs)}
                y={bottom - (bottom - top) * level}
                width={Math.max(...xs) - Math.min(...xs)}
                height={(bottom - top) * level}
                fill={fillColor(agg)}
                clipPath={`url(#${clipId})`}
              />
            )}
            <polygon points={points} className="bt-outline" />
            <text x={seg.label[0]} y={seg.label[1]} textAnchor="middle" className="bt-name">
              {seg.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const TIER_LABEL = { expert: "Expert", verified: "Verified", claimed: "Claimed" } as const;

function TagRow({ tag }: { tag: ScoredTag }) {
  const title = [
    `${tag.c} › ${tag.g}`,
    tag.r ? `${tag.r} client review${tag.r === 1 ? "" : "s"}` : "Self-claimed, no reviews yet",
    ...tag.e.map((e) => `Confirmed by: ${e}`),
  ].join("\n");
  return (
    <div className="rn-tag-row" title={title}>
      <div className="rn-tag-head">
        <div className="rn-tag-name">
          <span>{tag.t}</span>
          <span className={`rn-badge tier-${tag.tier}`}>{TIER_LABEL[tag.tier]}</span>
        </div>
        <span className="rn-tag-score">{tag.score}</span>
      </div>
      <div className="rn-bar">
        <div className={`rn-bar-fill tier-${tag.tier}`} style={{ width: `${tag.score}%` }} />
      </div>
    </div>
  );
}

/** Drop-in replacement for the profile page's EXPERTISE section. */
function ExpertiseSection({ op, map }: { op: SkillOperator; map: SkillMapData }) {
  const [focus, setFocus] = useState<Focus>(null);
  const [showAll, setShowAll] = useState(false);

  const verified = map.tags.filter((t) => t.tier !== "claimed").length;
  const total = Math.max(op.profile?.totalTags ?? 0, map.tags.length);

  const stage = focus ? STAGES.find((s) => s.name === focus.name) : undefined;
  const focusAgg = stage ? map.stages[stage.name] : null;
  const pool = (focusAgg ? focusAgg.tags : map.tags).slice().sort((a, b) => b.score - a.score || b.r - a.r);
  const rows = showAll ? pool : pool.slice(0, PREVIEW_ROWS);

  const pick = (name: string) => {
    setFocus(focus?.name === name ? null : { name });
    setShowAll(false);
  };

  return (
    <section className="rn-card">
      <div className="rn-card-head">
        <h2>Expertise</h2>
        <span className="rn-head-meta">
          {verified} client-verified · {total} tags
        </span>
      </div>

      <Bowtie map={map} focus={focus} onPick={pick} />
      <Bowtie map={map} focus={focus} onPick={pick} vertical />

      <div className="rn-expertise-mid">
        <div className="rn-radar-wrap">
          <Radar axes={map.axes} />
        </div>
        <div className="rn-focus">
          {focusAgg ? (
            <>
              <div className="rn-focus-head">
                <strong>{focus?.name}</strong>
                <button className="rn-link" onClick={() => setFocus(null)}>
                  Show all expertise
                </button>
              </div>
              <p>{stage?.skilled}</p>
            </>
          ) : (
            <>
              <div className="rn-focus-head">
                <strong>Revenue lifecycle</strong>
              </div>
              <p>
                The fuller and deeper the green, the stronger the client-verified proof in that stage. Select a stage
                to see the expertise behind it.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="rn-tag-list">
        {rows.length ? (
          rows.map((t) => <TagRow key={`${t.g}-${t.t}`} tag={t} />)
        ) : (
          <p className="rn-muted">No expertise tagged here yet.</p>
        )}
      </div>

      {pool.length > PREVIEW_ROWS && (
        <button className="rn-view-all" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show fewer" : `View all ${pool.length} expertise tags`}
        </button>
      )}
    </section>
  );
}

function avg(xs: (number | null)[]): number | null {
  const n = xs.filter((x): x is number => x != null);
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
}

/** CLIENT REVIEWS sidebar card with the CORE breakdown added. */
function ClientReviewsCard({ op }: { op: SkillOperator }) {
  const coreMax = CORE_SCALE[1];
  const published = op.core.v.some((v) => v != null);
  const overall = op.core.overall ?? avg(op.core.v);
  return (
    <section className="rn-card rn-side">
      <h3>Client Reviews</h3>
      <div className="rn-stat-grid">
        <div className="rn-stat">
          <b>{op.core.n}</b>
          <span>Verified reviews</span>
        </div>
        <div className="rn-stat">
          <b>{overall != null ? overall.toFixed(1) : "—"}</b>
          <span>Avg rating</span>
        </div>
      </div>
      <div className="rn-core">
        <p className="rn-eyebrow">CORE ratings</p>
        {CORE_CRITERIA.map((label, i) => {
          const v = op.core.v[i];
          return (
            <div key={label} className="rn-core-row">
              <span className="rn-core-label">{label}</span>
              <div className="rn-bar small">
                <div className="rn-bar-fill tier-verified" style={{ width: v == null ? 0 : `${(v / coreMax) * 100}%` }} />
              </div>
              <span className="rn-core-value">{v == null ? "—" : v.toFixed(1)}</span>
            </div>
          );
        })}
        {!published && <p className="rn-note">Collected on every review but not yet published on the profile.</p>}
      </div>
      {op.profile && op.profile.wouldHireAgain > 0 && (
        <p className="rn-pill-note">{Math.round(op.profile.wouldHireAgain * 100)}% would hire again</p>
      )}
    </section>
  );
}

export default function SkillMap() {
  const [opIdx, setOpIdx] = useState(0);
  const op = OPERATORS[opIdx];
  const map = useMemo(() => buildSkillMap(op), [op]);
  const headline = map.tags
    .filter((t) => t.tier !== "claimed")
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return (
    <div className="rn-preview">
      <div className="op-switch">
        <span className="rn-muted">Preview</span>
        {OPERATORS.map((o, i) => (
          <button key={o.name} className={`chip ${i === opIdx ? "active" : ""}`} onClick={() => setOpIdx(i)}>
            {o.name}
            <small>{o.sample ? "sample" : "live"}</small>
          </button>
        ))}
      </div>

      <div className="rn-profile" key={op.name}>
        <section className="rn-card rn-hero">
          <h1>{op.name}</h1>
          <p className="rn-sub">
            {op.title} · {op.desc}
          </p>
          <div className="rn-chips">
            {headline.map((t) => (
              <span key={t.t} className="rn-chip">
                {t.t}
              </span>
            ))}
          </div>
        </section>

        <div className="rn-grid">
          <div className="rn-main">
            <section className="rn-card">
              <div className="rn-card-head">
                <h2>Operator Overview</h2>
              </div>
              <p className="rn-bio">{op.bio ?? op.desc}</p>
            </section>
            <ExpertiseSection op={op} map={map} />
            <section className="rn-card rn-unchanged">
              <span>Industries · Snapshot · Portfolio · Engagement History · Verified Reviews</span>
              <em>Unchanged</em>
            </section>
          </div>
          <aside className="rn-aside">
            {op.profile && (
              <section className="rn-card rn-rep">
                <p>Reputation Index Score</p>
                <b>{op.profile.reputationIndex}</b>
                <span>{op.profile.reputationLabel}</span>
                <div className="rn-rep-stats">
                  <div>
                    <strong>{op.core.n}</strong>
                    <small>Reviews</small>
                  </div>
                  <div>
                    <strong>{op.profile.engagements}</strong>
                    <small>Engagements</small>
                  </div>
                </div>
              </section>
            )}
            <ClientReviewsCard op={op} />
          </aside>
        </div>
      </div>
    </div>
  );
}
