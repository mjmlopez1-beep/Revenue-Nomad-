"use client";

/**
 * A source's on/off switch, the way Claude's connectors do it (Settings / Connections, Warm paths'
 * sources, the set-up's Who you know, Agent access): on is connected. Turning it on starts that
 * source's own connect flow; turning it off asks first (<OffAsk>), then runs the source's own
 * remove. While a connect flow is open it shows "Connecting"; if the member cancels or it fails,
 * the caller sets it back to off and says so.
 *
 * role="switch", a 44px target, pine when on.
 */
import "./connToggle.css";

export function ConnToggle({ name, on, pending, busy, disabled, onFlip }: { /** The source's name: the switch's label. */ name: string; on: boolean; /** Its connect flow is open. */ pending?: boolean; /** Turning off. */ busy?: boolean; disabled?: boolean; onFlip: () => void }) {
  const shown = on || !!pending;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={name}
      aria-busy={busy || pending || undefined}
      className={`ctg${shown ? " on" : ""}${pending ? " pending" : ""}`}
      disabled={disabled || busy}
      onClick={onFlip}
      data-toggle={name}
    >
      <span className="ctg-track" aria-hidden>
        <span />
      </span>
      <span className="ctg-w">{busy ? "Turning off" : pending ? "Connecting" : on ? "On" : "Off"}</span>
    </button>
  );
}

/** The question before a switch turns a source off, with its two answers. */
export function OffAsk({ ask, yes = "Turn off", busy, onYes, onNo }: { ask: string; yes?: string; busy?: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <div className="ctg-ask" role="group" aria-label="Please confirm">
      <span>{ask}</span>
      <span className="ctg-ask-acts">
        <button type="button" className="btn btn-sm ctg-red" disabled={busy} aria-busy={busy} onClick={onYes}>
          {busy ? "Turning off" : yes}
        </button>
        <button type="button" className="btn btn-sm btn-pine" autoFocus disabled={busy} onClick={onNo}>
          Keep it on
        </button>
      </span>
    </div>
  );
}
