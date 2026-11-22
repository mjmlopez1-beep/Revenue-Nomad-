"use client";

/**
 * A page that could not show what it should: the two halves come apart (the Fractions "offline"
 * spot, 128px), a 24/30 title that says what happened, one plain sentence, and the two ways out:
 * a pine button (try again) and a plain one (reload the page). The render error page, Merlin did
 * not load, and too many requests all use it, so a member meets one shape for "this didn't work".
 *
 * PineBar is the bar such a page keeps when it is outside the app (an error page, a link that
 * leads nowhere): pine, 56px, the white lockup.
 */
import type { ReactNode } from "react";
import "./fractions/fractions.css";
import { Spot } from "./fractions/lazy";
import { Logo } from "./Logo";

export function Problem({ title, children, onRetry, retryLabel = "Try again", reload = true, on = "bg" }: { title: ReactNode; children?: ReactNode; onRetry?: () => void; retryLabel?: string; reload?: boolean; on?: "bg" | "white" }) {
  return (
    <div className="problem" role="alert">
      <Spot name="offline" size={128} on={on} ember />
      <h1 className="problem-h">{title}</h1>
      {children ? <p className="problem-p">{children}</p> : null}
      <div className="problem-acts">
        {onRetry ? (
          <button type="button" className="btn btn-pine" onClick={onRetry}>
            {retryLabel}
          </button>
        ) : null}
        {reload ? (
          <button type="button" className={`btn${onRetry ? "" : " btn-pine"}`} onClick={() => window.location.reload()}>
            Reload the page
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The pine bar with the white lockup, for pages outside the app. `home` makes the lockup a link to Merlin. */
export function PineBar({ home }: { home?: boolean }) {
  const logo = <Logo tone="white" height={30} />;
  return (
    <div className="pine-bar">
      {home ? (
        <a href="/" className="pine-bar-home" aria-label="Merlin home">
          {logo}
        </a>
      ) : (
        logo
      )}
    </div>
  );
}
