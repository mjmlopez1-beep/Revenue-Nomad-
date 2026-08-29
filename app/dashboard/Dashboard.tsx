"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Brand from "../Brand";
import type { State } from "./state";
import { timeAgo } from "./state";
import { Tape } from "./bits";
import TodayTab from "./TodayTab";
import TapeTab from "./TapeTab";
import EditionTab from "./EditionTab";
import ContributeTab from "./ContributeTab";

type TabKey = "today" | "tape" | "edition" | "contribute";

export default function Dashboard() {
  const [state, setState] = useState<State | null>(null);
  const [tab, setTab] = useState<TabKey>("today");
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (res.ok) setState(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = useCallback(
    (msg: string) => {
      setToast(msg);
      refresh();
    },
    [refresh]
  );

  async function signOut() {
    await fetch("/api/session", { method: "DELETE" });
    router.push("/");
  }

  if (!state || !state.operator) {
    return (
      <div className="container" style={{ padding: 60 }}>
        <p className="muted">Loading the Benchmark…</p>
      </div>
    );
  }

  const s = state;
  const operator = state.operator;
  const tierLabel =
    s.status.tier === "founding_50" ? "Founding 50" : s.status.tier === "insider" ? "Insider" : "Contributor";
  const pendingConfirms = s.contribute.clients.filter((c) => c.rnPlaced && !c.confirmed).length;
  const contributeBadge =
    pendingConfirms + (s.weekly.pulse.answered ? 0 : 1) + s.contribute.clients.filter((c) => c.refreshDue).length;

  return (
    <>
      <Tape rows={s.daily.tape.length ? s.daily.tape : s.weekly.tape} />
      <div className="container">
        <nav className="nav">
          <Brand />
          <div className="nav-right">
            <span className={`chip ${s.status.tier === "founding_50" ? "violet" : ""}`}>{tierLabel}</span>
            {s.credits.multiplierActive && <span className="chip amber">×{s.credits.multiplier} streak live</span>}
            <span className="chip">{s.credits.balance} credits</span>
            <span>{operator.name}</span>
            <button className="btn-ghost btn-sm" onClick={signOut}>Sign out</button>
          </div>
        </nav>

        <div className="tabs" role="tablist">
          <button className={`tab ${tab === "today" ? "active" : ""}`} onClick={() => setTab("today")}>
            Today
          </button>
          <button className={`tab ${tab === "tape" ? "active" : ""}`} onClick={() => setTab("tape")}>
            Tape Drop <span className="count">{s.weekly.week}</span>
          </button>
          <button className={`tab ${tab === "edition" ? "active" : ""}`} onClick={() => setTab("edition")}>
            Edition <span className="count">{s.monthly.edition}</span>
          </button>
          <button className={`tab ${tab === "contribute" ? "active" : ""}`} onClick={() => setTab("contribute")}>
            Contribute {contributeBadge > 0 && <span className="count">({contributeBadge})</span>}
          </button>
        </div>

        <div className="statline">
          <span className="stat">
            <span>Streak</span>
            <b>
              {s.credits.streakWeeks}w{" "}
              <span className="tiny">
                {s.credits.streakWeeks >= s.credits.streakNeeded
                  ? `×${s.credits.multiplier} active`
                  : `${s.credits.streakNeeded - s.credits.streakWeeks} more for ×${s.credits.multiplier}`}
              </span>
            </b>
          </span>
          <span className="stat">
            <span>Credits</span>
            <b>{s.credits.balance}</b>
          </span>
          <span className="stat">
            <span>This quarter</span>
            <b>
              {s.status.contributionsThisQuarter}{" "}
              <span className="tiny">
                {s.status.contributionsThisQuarter >= s.status.insiderThreshold
                  ? "Insider status earned"
                  : `${s.status.insiderThreshold - s.status.contributionsThisQuarter} more to Insider`}
              </span>
            </b>
          </span>
          <span className="stat">
            <span>Demand Feed</span>
            <b>
              {s.gates.feedActive ? "Active" : "Locked"}{" "}
              {s.gates.lastContributionAt && (
                <span className="tiny">last contribution {timeAgo(s.gates.lastContributionAt)}</span>
              )}
            </b>
          </span>
        </div>

        {tab === "today" && <TodayTab s={s} notify={notify} goContribute={() => setTab("contribute")} />}
        {tab === "tape" && <TapeTab s={s} notify={notify} />}
        {tab === "edition" && <EditionTab s={s} notify={notify} goContribute={() => setTab("contribute")} />}
        {tab === "contribute" && <ContributeTab s={s} notify={notify} />}

        <footer className="footer">
          Individual data is never shown. Aggregates are medians over cells of 5+ operators; verified rows weight 2×.
          Credits never affect buyer matching.
        </footer>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
