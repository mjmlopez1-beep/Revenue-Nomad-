"use client";

import type { State, Cell } from "./state";
import { post } from "./state";
import { Veil, BarRows } from "./bits";

interface WinRateRow {
  source: string;
  label: string;
  n: number;
  winRate: number;
  medianCycleWeeks: number;
}
interface ShareRow {
  key: string;
  label: string;
  share: number;
  n: number;
}

/** MONTHLY — money. "Am I priced right, am I utilized right." Credit-gated per edition. */
export default function EditionTab({
  s,
  notify,
  goContribute,
}: {
  s: State;
  notify: (m: string) => void;
  goContribute: () => void;
}) {
  const p = s.monthly.panels;

  async function unlock(asset: string) {
    const res = await post("/api/unlock", { asset });
    notify(res.ok ? "Unlocked for this edition." : (res.error as string) ?? "Couldn't unlock");
  }

  const panelCard = (
    asset: string,
    sub: string,
    render: (data: unknown) => React.ReactNode,
    freeHint?: string
  ) => {
    const panel = p[asset];
    if (!panel) return null;
    return (
      <div className="card">
        <div className="card-title">
          <h2>{panel.label}</h2>
          <span className="meta">{panel.unlocked ? "unlocked" : panel.cost > 0 ? `${panel.cost} credits` : "free"}</span>
        </div>
        <p className="card-sub">{sub}</p>
        {panel.unlocked ? (
          render(panel.data)
        ) : (
          <Veil
            label={panel.label}
            cost={panel.cost}
            balance={s.credits.balance}
            onUnlock={panel.cost > 0 ? () => unlock(asset) : goContribute}
            hint={
              freeHint ??
              `Unlocks for the ${s.monthly.edition} edition only — unlocks expire when the edition closes.`
            }
            cta={panel.cost > 0 ? undefined : "Contribute to unlock →"}
          />
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="statline">
        <span className="stat">
          <span>Edition</span>
          <b>{s.monthly.edition}</b>
        </span>
        <span className="stat">
          <span>Verified against invoices</span>
          <b>{s.monthly.verifiedShare}% of rows</b>
        </span>
        <span className="stat">
          <span>Full edition</span>
          <b>
            {s.monthly.fullEditionUnlocked || s.operator!.insider ? (
              "Unlocked"
            ) : (
              <button className="btn-ghost btn-sm" onClick={() => unlock("full_edition")}>
                Unlock everything — {s.monthly.fullEditionCost} credits
              </button>
            )}{" "}
            {s.operator!.insider && <span className="tiny">included with Insider</span>}
          </b>
        </span>
      </div>

      {s.percentile && (
        <div className="percentile-card" style={{ marginBottom: 16 }}>
          <div className="p-big">P{s.percentile.percentile}</div>
          <div className="p-sub">
            Your realized rate is <b>{s.percentile.yourRealization}% of list</b> — better than{" "}
            {s.percentile.percentile}% of {s.percentile.funcLabel}s
            {s.percentile.stageLabel ? ` at ${s.percentile.stageLabel}` : ""} ({s.percentile.cohortN} operators).
          </div>
          <div className="p-note">Private to you. Nobody else ever sees your row.</div>
        </div>
      )}

      <div className="grid2">
        {panelCard(
          "realization_rate",
          "Actual billed vs list rate. Only RN can compute this — it holds both sides of the number.",
          (data) => {
            const d = data as { byFunc: Cell[]; byStage: Cell[] };
            return (
              <div>
                <BarRows cells={d.byFunc} suffix="%" />
                <hr className="divider" />
                <p className="muted" style={{ marginBottom: 6 }}>By stage</p>
                <BarRows cells={d.byStage} suffix="%" />
              </div>
            );
          }
        )}
        {panelCard(
          "retainers_by_function",
          "Actual monthly billed retainers from engagement actuals — not list rates, not survey guesses.",
          (data) => <BarRows cells={data as Cell[]} money />,
          "The flagship panel is free with any contribution this edition cycle."
        )}
        {panelCard("retainers_by_stage", "Where the money is by company stage.", (data) => (
          <BarRows cells={data as Cell[]} money />
        ))}
        {panelCard("retainers_by_industry", "Actual retainers by client industry.", (data) => (
          <BarRows cells={data as Cell[]} money />
        ))}
        {panelCard("win_rate_by_source", "Which channels actually close, from the network's deal logs.", (data) => {
          const rows = data as WinRateRow[];
          return rows.length ? (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th className="num">Win rate</th>
                    <th className="num">Median cycle</th>
                    <th className="num">n</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.source}>
                      <td>{r.label}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{r.winRate}%</td>
                      <td className="num">{r.medianCycleWeeks}w</td>
                      <td className="num">{r.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Not enough deal logs yet.</p>
          );
        })}
        {panelCard("pricing_models", "How the network structures and discounts its pricing.", (data) => {
          const d = data as { models: ShareRow[]; discounting: ShareRow[] };
          return (
            <div>
              {d.models.map((r) => (
                <div key={r.key} className="barrow">
                  <span className="lbl">
                    {r.label}
                    <span className="n">n={r.n}</span>
                  </span>
                  <span className="bar-wrap">
                    <span className="bar" style={{ width: `${r.share}%` }} />
                  </span>
                  <span className="val">{r.share}%</span>
                </div>
              ))}
              <hr className="divider" />
              <p className="muted" style={{ marginBottom: 6 }}>Versus list</p>
              {d.discounting.map((r) => (
                <div key={r.key} className="barrow">
                  <span className="lbl">
                    {r.label}
                    <span className="n">n={r.n}</span>
                  </span>
                  <span className="bar-wrap">
                    <span className="bar" style={{ width: `${r.share}%` }} />
                  </span>
                  <span className="val">{r.share}%</span>
                </div>
              ))}
            </div>
          );
        })}
        {panelCard("utilization_renewal", "Billed hours vs stated capacity; how engagements end.", (data) => {
          const d = data as {
            medianUtilization: number | null;
            n: number;
            renewalOutcomes: ShareRow[];
            churnReasons: string[];
            medianEngagementMonths: number | null;
          };
          return (
            <div>
              <div className="grid2" style={{ gap: 10 }}>
                <div className="tile">
                  <div className="tile-label">Median utilization</div>
                  <div className="hero-num" style={{ fontSize: 30 }}>
                    {d.medianUtilization !== null ? `${d.medianUtilization}%` : "—"}
                  </div>
                </div>
                <div className="tile">
                  <div className="tile-label">Median engagement length</div>
                  <div className="hero-num" style={{ fontSize: 30 }}>
                    {d.medianEngagementMonths !== null ? `${d.medianEngagementMonths} mo` : "—"}
                  </div>
                </div>
              </div>
              <hr className="divider" />
              {d.renewalOutcomes.map((r) => (
                <div key={r.key} className="barrow">
                  <span className="lbl">
                    {r.label}
                    <span className="n">n={r.n}</span>
                  </span>
                  <span className="bar-wrap">
                    <span className="bar" style={{ width: `${r.share}%` }} />
                  </span>
                  <span className="val">{r.share}%</span>
                </div>
              ))}
              {d.churnReasons.length > 0 && (
                <>
                  <hr className="divider" />
                  <p className="muted" style={{ marginBottom: 6 }}>Why engagements churned (anonymous)</p>
                  <ul style={{ paddingLeft: 18, fontSize: 13, color: "var(--text-dim)" }}>
                    {d.churnReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
