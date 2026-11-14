"use client";

/**
 * Static product visuals for the landing page, drawn in HTML and CSS with the app's own
 * pills and chips. Every company here is fictional; none of it is member data.
 */
import { IconCheck, IconCoin, IconLock, IconUsers } from "../ui/shared";

/** A locked fact as the app draws it, not clickable. */
function Lock({ label }: { label?: string }) {
  return (
    <span className="lock">
      <IconLock /> {label ? <>{label} </> : null}
      <span className="lock-cost">1</span>
    </span>
  );
}

/** Five-segment fit bar, filled to `score`. */
export function FitBar({ score }: { score: number }) {
  const on = Math.max(1, Math.round(score / 20));
  return (
    <span className="lp-fitbar" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} className={i < on ? "on" : ""} />
      ))}
    </span>
  );
}

function Mark({ text, hue }: { text: string; hue: number }) {
  return (
    <span className="lp-mark" style={{ background: `hsl(${hue} 50% 92%)`, color: `hsl(${hue} 45% 26%)` }}>
      {text}
    </span>
  );
}

/** Hero visual: one company record with open firmographics and locked intel, plus the credits meter. */
export function HeroRecord() {
  return (
    <figure className="lp-visual" aria-label="Example record on Trading Post">
      <div className="lp-rec">
        <div className="lp-rec-head">
          <Mark text="NH" hue={200} />
          <div className="lp-rec-id">
            <div className="lp-rec-name">
              Northwind Health <span className="chip chip-ember lp-chip-xs">Hiring now</span>
            </div>
            <div className="lp-rec-meta mono">
              <span>Health Care</span>
              <span>51–200</span>
              <span>$5M–$20M</span>
            </div>
          </div>
          <div className="lp-fit">
            <span className="lp-fit-k">Fit</span>
            <span className="lp-fit-v mono">82</span>
            <FitBar score={82} />
          </div>
        </div>

        <div className="lp-rec-sec">
          <div className="lp-rec-k">Functions hired</div>
          <div className="lp-chiprow">
            <span className="chip">
              Sales <span className="mono lp-n">2</span>
            </span>
            <span className="chip">
              RevOps <span className="mono lp-n">1</span>
            </span>
          </div>
        </div>

        <div className="lp-rec-sec">
          <div className="lp-rec-k">
            Engagement <span className="mono lp-rec-sub">Sales · Fractional · since Mar 2025</span>
          </div>
          <dl className="lp-rows">
            <div>
              <dt>Role</dt>
              <dd>
                <Lock label="Unlock" />
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <Lock />
              </dd>
            </div>
            <div>
              <dt>Rate</dt>
              <dd>
                <span className="lp-ver mono" title="Confirmed by 3 members">
                  <IconCheck size={11} />3
                </span>
                <Lock />
              </dd>
            </div>
            <div>
              <dt>Who held the seat</dt>
              <dd>
                <Lock />
              </dd>
            </div>
            <div>
              <dt>Hours per week</dt>
              <dd>
                <span className="add">
                  + Add <span className="plus1">+1</span>
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <div className="lp-rec-sec">
          <div className="lp-rec-k">Decision maker</div>
          <div className="lp-person">
            <span className="lp-avatar" aria-hidden>
              <IconUsers size={13} />
            </span>
            <span className="lp-person-title">Chief Revenue Officer</span>
            <Lock label="Name" />
          </div>
        </div>

        <div className="lp-rec-foot">
          <span className="btn btn-pine btn-sm lp-static">
            Unlock all<span className="mono lp-unlock-n"> · 5 credits</span>
          </span>
        </div>
      </div>

      <div className="lp-meter">
        <div className="lp-meter-top">
          <span className="lp-meter-coin">
            <IconCoin size={14} />
          </span>
          <span className="mono lp-meter-num">50</span>
          <span className="lp-meter-unit">credits</span>
          <span className="lp-plus mono">+1</span>
        </div>
        <div className="lp-meter-bar">
          <i style={{ width: "28%" }} />
        </div>
        <div className="lp-meter-cap mono">7 of 25 earned today</div>
      </div>
    </figure>
  );
}

/* ---------- how it works: one small before and after per step ---------- */

export function StepDemoAdd() {
  return (
    <div className="lp-demo" aria-hidden>
      <span className="lp-demo-k">Rate</span>
      <span className="add">
        + Add <span className="plus1">+1</span>
      </span>
      <span className="lp-demo-arrow">→</span>
      <span className="mono lp-demo-v">$9k/mo</span>
      <span className="lp-plus mono">+1</span>
    </div>
  );
}

export function StepDemoUnlock() {
  return (
    <div className="lp-demo" aria-hidden>
      <span className="lp-demo-k">Role</span>
      <Lock label="Unlock" />
      <span className="lp-demo-arrow">→</span>
      <span className="mono lp-demo-v">Fractional VP Sales</span>
    </div>
  );
}

export function StepDemoConfirm() {
  return (
    <div className="lp-demo" aria-hidden>
      <span className="lp-demo-k">Rate</span>
      <span className="mono lp-demo-v">$9k/mo</span>
      <span className="lp-ver mono">
        <IconCheck size={11} />3
      </span>
      <span className="lp-demo-btn">Confirm</span>
      <span className="lp-demo-btn lp-demo-btn-quiet">Report</span>
    </div>
  );
}

/* ---------- use cases ---------- */

export function UseFriendly() {
  const rows: [string, string, number, number][] = [
    ["Northwind Health", "NH", 200, 82],
    ["Juniper Freight", "JF", 25, 64],
    ["Alder Labs", "AL", 152, 41],
  ];
  return (
    <div className="lp-uv" aria-hidden>
      {rows.map(([name, mark, h, score]) => (
        <div key={name} className="lp-uv-row">
          <Mark text={mark} hue={h} />
          <span className="lp-uv-name">{name}</span>
          <span className="mono lp-uv-score">{score}</span>
          <FitBar score={score} />
        </div>
      ))}
    </div>
  );
}

export function UseAdjacent() {
  return (
    <div className="lp-uv" aria-hidden>
      <div className="lp-uv-k">Hired fractionally</div>
      <div className="lp-chiprow">
        <span className="chip">Marketing</span>
        <span className="chip">RevOps</span>
        <span className="chip chip-outline">Sales not yet</span>
      </div>
      <div className="lp-uv-note mono">Your seat is the gap</div>
    </div>
  );
}

export function UseIntro() {
  return (
    <div className="lp-uv" aria-hidden>
      <div className="lp-uv-row">
        <span className="lp-uv-name">Who held the seat</span>
        <Lock label="Unlock" />
      </div>
      <div className="lp-uv-row">
        <span className="lp-uv-name">Reported to</span>
        <Lock />
      </div>
      <div className="lp-uv-note mono">2 members worked here</div>
    </div>
  );
}
