"use client";

import type { State } from "./state";
import { post } from "./state";
import { Veil } from "./bits";
import IndexChart from "./IndexChart";
import { PulseAsk } from "./TodayTab";

/** WEEKLY — the Tuesday ritual: Demand Index, tape, question of the week. */
export default function TapeTab({ s, notify }: { s: State; notify: (m: string) => void }) {
  const idx = s.weekly.index;
  const prev = idx.trend && idx.trend.length >= 2 ? idx.trend[idx.trend.length - 2] : null;
  const delta = idx.current && prev ? idx.current.total - prev.total : null;

  async function unlockTrend() {
    const res = await post("/api/unlock", { asset: "index_trend" });
    notify(res.ok ? "12-week trend unlocked for this edition." : (res.error as string) ?? "Couldn't unlock");
  }

  async function answerQuestion(option: number) {
    if (!s.weekly.question) return;
    const res = await post("/api/question", { questionId: s.weekly.question.id, option });
    notify(res.ok ? `+${res.awarded} credits (they expire — spend them on the edition).` : (res.error as string) ?? "Couldn't answer");
  }

  return (
    <div>
      <div className="grid2">
        <div className="card">
          <div className="card-title">
            <h2>Nomad Demand Index</h2>
            <span className="meta">{s.weekly.week}</span>
          </div>
          <p className="card-sub">Active buyer conversations across the network. The leading indicator of the fractional GTM market — it exists nowhere else.</p>
          {idx.currentLocked ? (
            <div>
              <Veil label="Demand Index" hint="You can't read the index without being in it. Answer this week's 10-second pulse to unlock the current number." />
              <div className="section-gap">
                <PulseAsk notify={notify} />
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                <span className="hero-num">{idx.current!.total}</span>
                {delta !== null && (
                  <span className={`hero-delta ${delta >= 0 ? "up" : "down"}`}>
                    {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} vs last week
                  </span>
                )}
              </div>
              <p className="tiny" style={{ marginBottom: 12 }}>
                {idx.current!.respondents} operators pulsed this week · band midpoints summed
              </p>
              {idx.trendLocked ? (
                <Veil
                  label="12-week trend"
                  hint="The historical trend is a per-edition unlock."
                  cost={idx.trendCost}
                  balance={s.credits.balance}
                  onUnlock={unlockTrend}
                />
              ) : (
                <IndexChart trend={idx.trend!} />
              )}
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <div className="card-title">
              <h2>Question of the week</h2>
              {s.weekly.question && <span className="meta">+{s.weekly.question.credits} expiring credits</span>}
            </div>
            {s.weekly.question ? (
              s.weekly.question.answered ? (
                <p className="muted">Answered — result lands in next week&apos;s Tape Drop.</p>
              ) : (
                <div>
                  <p style={{ fontWeight: 650, fontSize: 14.5, marginBottom: 10 }}>{s.weekly.question.question}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {s.weekly.question.options.map((opt, i) => (
                      <button key={i} className="btn-ghost" onClick={() => answerQuestion(i)}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <p className="muted">No question posted this week.</p>
            )}
          </div>

          {s.weekly.lastWeekQuestion && (
            <div className="card">
              <div className="card-title">
                <h2>Last week&apos;s result</h2>
              </div>
              <p className="card-sub">{s.weekly.lastWeekQuestion.question}</p>
              {s.weekly.lastWeekQuestion.result ? (
                s.weekly.lastWeekQuestion.result.map((r) => (
                  <div key={r.label} className="barrow">
                    <span className="lbl">{r.label}</span>
                    <span className="bar-wrap">
                      <span className="bar" style={{ width: `${r.share}%` }} />
                    </span>
                    <span className="val">{r.share}%</span>
                  </div>
                ))
              ) : (
                <p className="muted">Not enough answers to publish (5-operator minimum).</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card section-gap">
        <div className="card-title">
          <h2>Closed this week on the tape</h2>
          <span className="meta">anonymized · {s.weekly.tape.length} deals</span>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Outcome</th>
                <th>Function</th>
                <th>Stage</th>
                <th>Retainer band</th>
                <th>Source</th>
                <th className="num">Cycle</th>
                <th>Verified</th>
              </tr>
            </thead>
            <tbody>
              {s.weekly.tape.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700, color: r.outcome === "won" ? "var(--green)" : "var(--red)" }}>
                    {r.outcome === "won" ? "Won" : "Lost"}
                  </td>
                  <td>{r.func}</td>
                  <td>{r.stage}</td>
                  <td>{r.band}</td>
                  <td>{r.source}</td>
                  <td className="num">{r.cycleWeeks}w</td>
                  <td>{r.verified ? <span className="badge-verified">✓ RN</span> : <span className="tiny">self-reported</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
