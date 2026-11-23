"use client";

/** Small parts every set-up screen uses (Setup.tsx and its screens): a switch, a screen's head. */
import type { ReactNode } from "react";

export function Switch({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`su-switch${on ? " on" : ""}`} onClick={() => onChange(!on)} disabled={disabled}>
      <span className="su-switch-track" aria-hidden>
        <span className="su-switch-knob" />
      </span>
      <span className="su-switch-text">
        <strong>{label}</strong>
        {hint ? <span>{hint}</span> : null}
      </span>
    </button>
  );
}
export function Head({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="su-head">
      <span className="su-eyebrow">{eyebrow}</span>
      <h1 className="su-h1" tabIndex={-1} data-step-h>
        {title}
      </h1>
      {children ? <p className="su-lead">{children}</p> : null}
    </div>
  );
}
