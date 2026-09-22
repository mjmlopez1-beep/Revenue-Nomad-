"use client";

import { useMemo, useState } from "react";
import sampleOperators from "@/data/skills/sample-operators.json";
import {
  AXES,
  FOUNDATION,
  STAGES,
  buildSkillMap,
  type Aggregate,
  type ScoredTag,
  type SkillOperator,
} from "@/lib/skills/score";

const OPERATORS = sampleOperators as SkillOperator[];

// Radar radius as a fraction of the outer ring. Scores run 50–100, so a
// claimed-only axis sits on a small inner ring well inside the lowest score.
const INNER_RING = 0.2;
function radius(agg: Aggregate): number {
  if (agg.score != null) return agg.score / 100;
  return agg.claimedOnly ? INNER_RING : 0;
}

function Radar({ axes }: { axes: Record<string, Aggregate> }) {
  const size = 320;
  const c = size / 2;
  const R = 110;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length;
  const pt = (i: number, r: number) => [c + Math.cos(angle(i)) * R * r, c + Math.sin(angle(i)) * R * r];
  const ring = (r: number) => AXES.map((_, i) => pt(i, r).join(",")).join(" ");
  const shape = AXES.map((a, i) => pt(i, radius(axes[a])).join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="skill-radar" role="img" aria-label="Capability radar">
      {[1, 0.75, 0.5].map((r) => (
        <polygon key={r} points={ring(r)} className="radar-ring" />
      ))}
      <polygon points={ring(INNER_RING)} className="radar-ring radar-inner" />
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
        const [x, y] = pt(i, 1.22);
        const agg = axes[a];
        return (
          <text key={a} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="radar-label">
            <tspan x={x}>{a}</tspan>
            <tspan x={x} dy="1.2em" className="radar-value">
              {agg.score ?? (agg.claimedOnly ? "claimed" : "—")}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

function ScoreBadge({ agg }: { agg: Aggregate }) {
  if (agg.score != null) return <span className="skill-score">{agg.score}</span>;
  return <span className="skill-score muted">{agg.claimedOnly ? "claimed" : "—"}</span>;
}

function TagChip({ tag }: { tag: ScoredTag }) {
  const title = [
    `${tag.c} › ${tag.g}`,
    tag.r ? `${tag.r} review${tag.r === 1 ? "" : "s"} · score ${tag.score}` : "No reviews yet",
    ...tag.e.map((e) => `Evidence: ${e}`),
  ].join("\n");
  return (
    <span className={`tag-chip tier-${tag.tier}`} title={title}>
      {tag.t}
      {tag.score != null && <b>{tag.score}</b>}
    </span>
  );
}

type Selection = { kind: "stage"; name: string } | { kind: "foundation"; name: string } | null;

export default function SkillMap() {
  const [opIdx, setOpIdx] = useState(0);
  const [sel, setSel] = useState<Selection>({ kind: "stage", name: STAGES[0].name });
  const op = OPERATORS[opIdx];
  const map = useMemo(() => buildSkillMap(op), [op]);

  const counts = { expert: 0, verified: 0, claimed: 0 };
  for (const t of map.tags) counts[t.tier]++;
  const coreAvg = op.core.v.length ? op.core.v.reduce((a, b) => a + b, 0) / op.core.v.length : null;

  const selStage = sel?.kind === "stage" ? STAGES.find((s) => s.name === sel.name) : undefined;
  const selFoundation = sel?.kind === "foundation" ? FOUNDATION.find((f) => f.name === sel.name) : undefined;
  const selAgg = selStage ? map.stages[selStage.name] : selFoundation ? map.foundation[selFoundation.name] : null;
  const selTags = selAgg ? [...selAgg.tags].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)) : [];

  const tile = (kind: "stage" | "foundation", name: string, agg: Aggregate, side?: string) => (
    <button
      key={name}
      className={`stage-tile ${side ?? ""} ${sel?.name === name ? "active" : ""} ${agg.score == null ? "empty" : ""}`}
      onClick={() => setSel({ kind, name })}
    >
      <span className="stage-name">{name}</span>
      <ScoreBadge agg={agg} />
      <span className="stage-count">
        {agg.tags.length} tag{agg.tags.length === 1 ? "" : "s"}
      </span>
    </button>
  );

  return (
    <div className="skill-map">
      <div className="card skill-head">
        <div className="op-switch">
          {OPERATORS.map((o, i) => (
            <button key={o.name} className={`chip ${i === opIdx ? "active" : ""}`} onClick={() => setOpIdx(i)}>
              {o.name}
            </button>
          ))}
          <span className="sample-note">Sample operators</span>
        </div>
        <div className="op-summary">
          <div>
            <h2>{op.name}</h2>
            <p className="dim">
              {op.title} · {op.loc}
            </p>
            <p>{op.desc}</p>
          </div>
          <div className="op-stats">
            <div>
              <b>{counts.expert}</b>
              <span>expert</span>
            </div>
            <div>
              <b>{counts.verified}</b>
              <span>verified</span>
            </div>
            <div>
              <b>{counts.claimed}</b>
              <span>claimed</span>
            </div>
            <div>
              <b>{map.fitPoints}</b>
              <span>fit pts / 18</span>
            </div>
            <div>
              <b>{coreAvg != null ? coreAvg.toFixed(1) : "—"}</b>
              <span>{op.core.n} reviews</span>
            </div>
          </div>
        </div>
      </div>

      <div className="skill-grid">
        <div className="card">
          <h3>Capability radar</h3>
          <p className="dim small">Average of the three best verified tags on each axis. Inner ring = claimed only.</p>
          <Radar axes={map.axes} />
        </div>

        <div className="card">
          <h3>Buyer journey</h3>
          <p className="dim small">Where in the customer lifecycle this operator has proof.</p>
          <div className="journey">
            <div className="journey-side">
              <span className="side-label">Before the sale</span>
              <div className="stage-row">
                {STAGES.filter((s) => s.side === "before").map((s) => tile("stage", s.name, map.stages[s.name], "before"))}
              </div>
            </div>
            <div className="journey-side">
              <span className="side-label">After the sale</span>
              <div className="stage-row">
                {STAGES.filter((s) => s.side === "after").map((s) => tile("stage", s.name, map.stages[s.name], "after"))}
              </div>
            </div>
            <div className="journey-side">
              <span className="side-label">Foundation</span>
              <div className="stage-row">
                {FOUNDATION.map((f) => tile("foundation", f.name, map.foundation[f.name], "foundation"))}
              </div>
            </div>
          </div>

          {selAgg && (
            <div className="stage-detail">
              <h4>
                {sel?.name} <ScoreBadge agg={selAgg} />
              </h4>
              {selStage && (
                <>
                  <p>
                    <b>Buyer:</b> {selStage.buyer}
                  </p>
                  <p>
                    <b>The work:</b> {selStage.what}
                  </p>
                  <p className="dim">{selStage.skilled}</p>
                </>
              )}
              {selFoundation && <p>{selFoundation.what}</p>}
              <div className="tag-list">
                {selTags.length ? selTags.map((t) => <TagChip key={`${t.g}-${t.t}`} tag={t} />) : <span className="dim">No tags here yet.</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Skill groups</h3>
        <div className="group-list">
          {map.groups.map(({ category, group, agg }) => (
            <div key={`${category}-${group}`} className="group-row">
              <div className="group-name">
                <span>{group}</span>
                <span className="dim small">{category}</span>
              </div>
              <ScoreBadge agg={agg} />
              <div className="tag-list">
                {agg.tags.map((t) => (
                  <TagChip key={t.t} tag={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="dim small legend">
          <span className="tag-chip tier-expert">expert</span> 85–100 (5+ reviews)
          <span className="tag-chip tier-verified">verified</span> 50–80 (1–4 reviews)
          <span className="tag-chip tier-claimed">claimed</span> no reviews
        </p>
      </div>
    </div>
  );
}
