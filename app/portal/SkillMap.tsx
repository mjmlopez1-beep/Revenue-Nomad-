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
  operatorFromProfile,
  type Aggregate,
  type ProfileDoc,
  type ScoredTag,
  type SkillMap as SkillMapData,
  type SkillOperator,
} from "@/lib/skills/score";
import { EngageCard, FitBrief, Hero, ReputationCard, Reviews, TrackRecord } from "./ProfileSections";

// Matt Lopez comes from his live profile; the rest are illustrative.
const OPERATORS: SkillOperator[] = [
  operatorFromProfile(mattLopez as ProfileDoc),
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
// the three post-sale stages widen back out. No numbers: every stage is
// filled solid, in a deeper green the higher its score. The foundation axes
// live on the radar, so they are not repeated here.
function stageShade(agg: Aggregate): { fill: string; dark: boolean } {
  if (agg.score == null) return { fill: "#ffffff", dark: false };
  if (agg.claimedOnly) return { fill: "#e3e7e4", dark: false };
  const t = (agg.score - SCORE_FLOOR) / (100 - SCORE_FLOOR);
  // Light mint at a first review (50) through to the deepest brand green at 100.
  const from = [214, 236, 219];
  const to = [6, 63, 47];
  const mix = from.map((c, i) => Math.round(c + (to[i] - c) * Math.min(1, t * 1.1)));
  return { fill: `rgb(${mix.join(", ")})`, dark: t > 0.4 };
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
        const shade = stageShade(agg);
        const active = focus?.name === seg.name;
        return (
          <g
            key={seg.id}
            className={`bt-seg ${active ? "active" : ""} ${agg.score == null ? "empty" : ""} ${shade.dark ? "dark" : ""}`}
            role="button"
            tabIndex={0}
            aria-pressed={active}
            aria-label={`${seg.name}: ${agg.score == null ? "no expertise tagged" : agg.claimedOnly ? "self-claimed only" : `score ${agg.score}`}`}
            onClick={() => onPick(seg.name)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick(seg.name)}
          >
            <polygon points={points} fill={shade.fill} className="bt-shape" />
            <text x={seg.label[0]} y={seg.label[1]} textAnchor="middle" className="bt-name">
              {seg.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const TIER_LABEL = { expert: "Expert", verified: "Verified", claimed: "Self-claimed" } as const;

function TagRow({ tag }: { tag: ScoredTag }) {
  return (
    <div className="rn-tag-row" title={`${tag.c} › ${tag.g}`}>
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
      {tag.e.length > 0 && (
        <p className="rn-evidence">
          Confirmed by {tag.e.join(", ")} · {tag.r} client review{tag.r === 1 ? "" : "s"}
        </p>
      )}
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
  const scope = (focusAgg ? focusAgg.tags : map.tags).slice().sort((a, b) => b.score - a.score || b.r - a.r);
  // Evidence leads: verified tags get full rows, self-claimed ones a compact list.
  const pool = scope.filter((t) => t.tier !== "claimed");
  const claimed = scope.filter((t) => t.tier === "claimed");
  const rows = showAll ? pool : pool.slice(0, PREVIEW_ROWS);

  const pick = (name: string) => {
    setFocus(focus?.name === name ? null : { name });
    setShowAll(false);
  };

  return (
    <section className="rn-card" id="expertise">
      <div className="rn-card-head">
        <div>
          <p className="ep-eyebrow">Expertise</p>
          <h2>Where the proof is</h2>
        </div>
        <span className="rn-head-meta">
          {verified} client-verified of {total}
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
                The deeper the green, the stronger the client-verified proof in that stage. Grey is self-claimed only.
                Select a stage to see the expertise behind it.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="rn-tag-list">
        {rows.length ? (
          rows.map((t) => <TagRow key={`${t.g}-${t.t}`} tag={t} />)
        ) : (
          <p className="rn-muted">No client-verified expertise here yet.</p>
        )}
      </div>

      {pool.length > PREVIEW_ROWS && (
        <button className="rn-view-all" onClick={() => setShowAll(!showAll)}>
          {showAll ? `Show top ${PREVIEW_ROWS}` : `View all ${pool.length} verified tags`}
        </button>
      )}

      {claimed.length > 0 && (
        <details className="rn-claimed">
          <summary>
            Also claims {claimed.length} skill{claimed.length === 1 ? "" : "s"} <span>not yet verified by a client</span>
          </summary>
          <div className="rn-claimed-list">
            {claimed.map((t) => (
              <span key={`${t.g}-${t.t}`}>{t.t}</span>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function avg(xs: (number | null)[]): number | null {
  const n = xs.filter((x): x is number => x != null);
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
}

/** CORE ratings, shown only once they are published. */
function CoreCard({ op }: { op: SkillOperator }) {
  const coreMax = CORE_SCALE[1];
  if (!op.core.v.some((v) => v != null)) return null;
  return (
    <section className="ep-card ep-side">
      <p className="ep-eyebrow">CORE ratings</p>
      <div className="rn-core">
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
      </div>
      <p className="ep-fine">Average across {op.core.n} reviews, each scored 1–5.</p>
    </section>
  );
}

const SECTIONS: [string, string][] = [
  ["fit", "Fit"],
  ["expertise", "Expertise"],
  ["track-record", "Track record"],
  ["reviews", "Reviews"],
  ["about", "About"],
];

export default function SkillMap() {
  const [opIdx, setOpIdx] = useState(0);
  const op = OPERATORS[opIdx];
  const map = useMemo(() => buildSkillMap(op), [op]);
  const headline = map.tags
    .filter((t) => t.tier !== "claimed")
    .sort((a, b) => b.score - a.score || b.r - a.r)
    .slice(0, 5)
    .map((t) => t.t);
  const sections = SECTIONS.filter(([id]) => op.details || id === "expertise" || id === "about");

  return (
    <div className="ep-page">
      <div className="ep-proto">
        <span>Prototype</span>
        {OPERATORS.map((o, i) => (
          <button key={o.name} className={i === opIdx ? "active" : ""} onClick={() => setOpIdx(i)}>
            {o.name}
            <small>{o.sample ? "sample" : "live data"}</small>
          </button>
        ))}
      </div>

      <div className="ep-profile" key={op.name}>
        <Hero op={op} headline={headline} />

        <nav className="ep-subnav" aria-label="Profile sections">
          {sections.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>

        <div className="ep-grid">
          <div className="ep-main">
            <FitBrief op={op} />
            <ExpertiseSection op={op} map={map} />
            <TrackRecord op={op} />
            <Reviews op={op} />
            <section className="ep-card" id="about">
              <header className="ep-card-head">
                <div>
                  <p className="ep-eyebrow">About</p>
                  <h2>In {op.name.split(" ")[0]}’s words</h2>
                </div>
              </header>
              <p className="ep-bio">{op.bio ?? op.desc}</p>
            </section>
          </div>
          <aside className="ep-aside">
            <EngageCard op={op} />
            <ReputationCard op={op} />
            <CoreCard op={op} />
          </aside>
        </div>
      </div>
    </div>
  );
}
