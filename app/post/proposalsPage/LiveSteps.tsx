"use client";

/**
 * Merlin drafting a proposal, step by step (ProposalEditor.dc.html's drafting card), in the new
 * look's start panel: a bar that moves with each real step, each step with Done or Now and its
 * line, the steps still to come as Next, a clock that counts the seconds so it never looks frozen,
 * and the section being written as it is written. The steps are the server's own (Live.tsx reads
 * them); nothing here is invented. If the connection drops, Live.tsx picks the job up again from
 * its last step. Cancel stops it, and nothing is saved.
 */
import { useEffect, useState } from "react";
import type { LiveState } from "../Live";
import { DocText } from "../../sign/doc";
import { fieldLabel } from "@/lib/proposals/library";
import { IconCheck } from "../../ui/shared";

/** The steps a draft takes, in order, for the ones not reached yet (lib/proposals/draft.ts says each as it happens). */
const AHEAD: { key: string; label: string }[] = [
  { key: "read", label: "Reading the call" },
  { key: "rates", label: "Working out pricing from Rate benchmarks" },
  { key: "write", label: "Writing the draft" },
  { key: "ready", label: "Checking every blank is labelled" },
];

export function LiveSteps({ state, source, onCancel }: { state: LiveState; source: string; onCancel: () => void }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const t = window.setInterval(() => setSecs(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, []);
  const steps = state.items.filter((x) => x.kind === "step");
  const sections = state.items.filter((x) => x.kind === "section");
  const seen = new Set(steps.map((x) => x.key));
  const ahead = AHEAD.filter((a) => !seen.has(a.key) && !(a.key === "read" && steps.length));
  const done = steps.filter((x) => x.state === "done").length;
  const total = Math.max(done + ahead.length + (steps.some((x) => x.state === "active") ? 1 : 0), 1);
  const writing = [...sections].reverse().find((x) => x.text) ?? null;
  const written = sections.filter((x) => x.state === "done").length;
  return (
    <div className="pz-live" aria-live="polite">
      <span className="pz-live-h">
        <strong>Merlin is drafting your proposal</strong>
        <span>
          From {source}. Most drafts take under a minute. {secs > 2 ? `Working for ${secs} seconds.` : ""}
        </span>
      </span>
      <span className="pz-prog" role="progressbar" aria-label="Drafting progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <span style={{ width: `${Math.round(((done + 0.5) / (total + 0.5)) * 100)}%` }} />
      </span>
      <ol className="pz-steps">
        {steps.map((x) => (
          <li key={x.key} data-state={x.state}>
            <span className="pz-mark" aria-hidden>
              {x.state === "done" ? <IconCheck size={12} /> : null}
            </span>
            <span className="pz-step-t">{x.label}</span>
            <span className="pz-step-tag">{x.state === "done" ? "Done" : "Now"}</span>
          </li>
        ))}
        {!steps.length && (
          <li data-state="active">
            <span className="pz-mark" aria-hidden />
            <span className="pz-step-t">Starting</span>
            <span className="pz-step-tag">Now</span>
          </li>
        )}
        {ahead.map((a) => (
          <li key={a.key} data-state="next">
            <span className="pz-mark" aria-hidden />
            <span className="pz-step-t">{a.label}</span>
            <span className="pz-step-tag">Next</span>
          </li>
        ))}
      </ol>
      {writing && (
        <div className="pz-live-sec sg-text">
          <span className="pz-k">{written ? `${written} ${written === 1 ? "section" : "sections"} written · now ${writing.label}` : `Writing ${writing.label}`}</span>
          <DocText text={writing.text ?? ""} blanks label={fieldLabel} />
        </div>
      )}
      <span className="pz-live-foot">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <span className="pz-note">If your connection drops, Merlin carries on and picks up where it was. Cancel stops it, and nothing is saved.</span>
      </span>
    </div>
  );
}
