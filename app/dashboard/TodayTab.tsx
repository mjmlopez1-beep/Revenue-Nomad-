"use client";

import type { State } from "./state";
import { timeAgo } from "./state";
import { Veil } from "./bits";

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  hiring_intent: "Hiring intent",
  budget_opened: "Budget opened",
  exec_departure: "GTM exec departure",
  asked_for_intro: "Asked for an intro",
  expansion: "Expansion",
  other: "Signal",
};

const TIMING_LABELS: Record<string, string> = { now: "buying now", this_quarter: "this quarter", exploring: "exploring" };

/** DAILY — demand. "Who might buy, right now." Gated by recency, not credits. */
export default function TodayTab({
  s,
  notify,
  goContribute,
}: {
  s: State;
  notify: (m: string) => void;
  goContribute: () => void;
}) {
  const feed = s.daily.feed;
  return (
    <div className="grid2">
      <div>
        <div className="card">
          <div className="card-title">
            <h2>Demand Feed</h2>
            <span className="meta">buyer signals · last 14 days</span>
          </div>
          {feed ? (
            feed.signals.length ? (
              <div>
                {feed.signals.map((sig, i) => (
                  <div key={i} className="feed-row">
                    <span className={`strength ${sig.strength}`} title={`${sig.strength} signal`} />
                    <span>
                      <span className="seg">{sig.segment}</span>
                      <br />
                      <span className="muted">
                        {SIGNAL_TYPE_LABELS[sig.type] ?? sig.type} · {TIMING_LABELS[sig.timing] ?? sig.timing}
                        {sig.named ? " · named buyer" : ""}
                      </span>
                    </span>
                    <span className="when">{timeAgo(sig.at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Quiet right now. New signals land here the moment operators log them.</p>
            )
          ) : (
            <Veil
              label="Demand Feed"
              hint={`The feed is fresh-for-fresh: contribute anything in the last ${s.gates.feedRecencyDays} days and the full detail opens. Headlines stay visible below.`}
              onUnlock={goContribute}
              cost={0}
              cta="Contribute something →"
            />
          )}
          {!feed && (
            <div className="section-gap">
              {s.daily.teasers.map((t) => (
                <div key={t} className="teaser">{t}</div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">
            <h2>RN intake</h2>
            <span className="meta">entering the pipeline, pre-posting</span>
          </div>
          {feed ? (
            feed.intake.length ? (
              feed.intake.map((row, i) => (
                <div key={i} className="feed-row">
                  <span>
                    <span className="seg">{row.segment}</span>
                    <br />
                    <span className="muted">{row.status === "intro_made" ? "Intro made — engagement forming" : "Qualifying"}</span>
                  </span>
                  <span className="when">{timeAgo(row.at)}</span>
                </div>
              ))
            ) : (
              <p className="muted">Nothing moving through intake this week.</p>
            )
          ) : (
            <p className="muted">Visible with an active Demand Feed.</p>
          )}
        </div>
      </div>

      <div>
        {!s.weekly.pulse.answered && (
          <div className="card" style={{ borderColor: "var(--green-pale-border)", background: "var(--green-pale)" }}>
            <div className="card-title">
              <h2>10 seconds, +{s.weekly.pulse.credits} credits</h2>
            </div>
            <p className="card-sub">
              This week&apos;s pulse is open — answering it also unlocks the current Demand Index.
            </p>
            <PulseAsk notify={notify} />
          </div>
        )}
        <div className="card">
          <div className="card-title">
            <h2>Followed segments</h2>
            <span className="meta">max 1 alert/day</span>
          </div>
          {s.operator!.follows.length ? (
            <p className="muted">{s.operator!.follows.join(" · ")}</p>
          ) : (
            <p className="muted">You&apos;re not following any segments yet — signal alerts stay off until you do.</p>
          )}
        </div>
        <div className="card">
          <div className="card-title">
            <h2>Your signals</h2>
            <span className="meta">${s.contribute.signalCashBounty} cash on conversion</span>
          </div>
          {s.mySignals.length ? (
            s.mySignals.map((sig) => (
              <div key={sig.id} className="feed-row">
                <span>
                  <span className="seg">{sig.segment}</span>
                  <br />
                  <span className="muted">
                    {sig.status === "converted"
                      ? sig.bountyPaid
                        ? "Converted — bounty paid 🎉"
                        : "Converted — bounty on the way"
                      : sig.status.replace("_", " ")}
                  </span>
                </span>
                <span className="when">{timeAgo(sig.at)}</span>
              </div>
            ))
          ) : (
            <p className="muted">
              Hear a founder ask &quot;who does fractional GTM?&quot; — log it under Contribute. +
              {s.contribute.earn.buyerSignal} credits now, ${s.contribute.signalCashBounty} cash if it converts.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function PulseAsk({ notify }: { notify: (m: string) => void }) {
  async function answer(band: string) {
    const res = await fetch("/api/pulse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ band }),
    });
    const json = await res.json().catch(() => ({}));
    notify(res.ok ? `Counted. +${json.awarded} credits — index unlocked.` : json.error ?? "Something went wrong");
  }
  return (
    <>
      <p style={{ fontWeight: 650, fontSize: 14.5 }}>How many active buyer conversations do you have right now?</p>
      <div className="pulse-opts">
        {[
          ["0", "0", "none live"],
          ["1_2", "1–2", "warming"],
          ["3_5", "3–5", "healthy"],
          ["6_plus", "6+", "on fire"],
        ].map(([band, big, small]) => (
          <button key={band} className="pulse-opt" onClick={() => answer(band)}>
            {big}
            <small>{small}</small>
          </button>
        ))}
      </div>
    </>
  );
}
