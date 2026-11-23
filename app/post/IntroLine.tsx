"use client";

/**
 * One line under a conversation's header in Messages, about an intro at the seat's company: the
 * member who started it can log that they asked for one ("Asked Dana for an intro? Log it"), and
 * then either side marks it made or declined. A made intro puts the company in the asker's pipeline,
 * and a win from it is credited to the intro. Nothing shows in a conversation about no company.
 *
 * `bar`: the new look's line under the header (Messages.dc.html): the intro's icon, the words and
 * its buttons, mint once it is made.
 */
import { useState } from "react";
import type { ConversationRec } from "@/lib/tableTypes";
import { HIDDEN_COMPANY } from "@/lib/tableFields";
import { useToast } from "../ui/shared";
import { pipelineAct, usePipeline } from "./pipelineStore";
import "./pipeline.css";

const IntroIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 18a2 2 0 1 0 0-4a2 2 0 0 0 0 4zM19 10a2 2 0 1 0 0-4a2 2 0 0 0 0 4zM7 16c4 0 6-8 10-8" />
  </svg>
);

export function IntroLine({ c, bar }: { c: ConversationRec; bar?: boolean }) {
  const toast = useToast();
  const { view } = usePipeline();
  const [busy, setBusy] = useState(false);
  if (c.kind === "partners" || !c.about.companyId || !view) return null;
  const intro = view.intros.find((i) => i.conversation === c.id);
  const co = c.about.company && c.about.company !== HIDDEN_COMPANY ? c.about.company : "the company";
  const run = async (act: Parameters<typeof pipelineAct>[0]) => {
    if (busy) return;
    setBusy(true);
    const r = await pipelineAct(act);
    setBusy(false);
    toast(r.message, !r.ok);
  };
  if (bar) {
    if (!intro && !c.started) return null;
    const asked = intro?.side === "asked";
    const head = !intro
      ? `Asked ${c.with.first} for an intro at ${co}? Log it, so a win there is credited to the intro.`
      : asked
        ? `You asked ${c.with.first} for an intro at ${co}.`
        : `${c.with.first} asked you for an intro at ${co}.`;
    const tail = !intro
      ? ""
      : intro.status === "made"
        ? asked
          ? ` Made. ${co.charAt(0).toUpperCase() + co.slice(1)} is in your pipeline, and a win there is credited to this intro.${intro.won ? " It led to a win." : ""}`
          : ` You made it.${intro.won ? " It led to a win." : " If it leads to a win, it shows here."}`
        : intro.status === "declined"
          ? asked
            ? " Declined."
            : " You said you cannot help."
          : asked
            ? " Mark it when you know."
            : "";
    return (
      <div className={`ms2-intro${intro?.status === "made" ? " made" : ""}`}>
        <IntroIcon />
        <span className="ms2-intro-t">
          {head}
          {tail}
        </span>
        {!intro ? (
          <button type="button" className="ms2-btn" disabled={busy} onClick={() => void run({ type: "pipeline.intro", conversationId: c.id })}>
            Log it
          </button>
        ) : (
          intro.status === "asked" && (
            <>
              <button type="button" className="ms2-btn ms2-btn-pine" disabled={busy} onClick={() => void run({ type: "pipeline.introMark", id: intro.id, status: "made" })}>
                {asked ? "Made" : "I made it"}
              </button>
              <button type="button" className="ms2-btn" disabled={busy} onClick={() => void run({ type: "pipeline.introMark", id: intro.id, status: "declined" })}>
                {asked ? "Declined" : "Cannot help"}
              </button>
            </>
          )
        )}
      </div>
    );
  }
  if (!intro) {
    if (!c.started) return null;
    return (
      <p className="pl-intro-line">
        <button type="button" className="mv-link" disabled={busy} onClick={() => void run({ type: "pipeline.intro", conversationId: c.id })}>
          Asked {c.with.first} for an intro at {co}? Log it
        </button>
      </p>
    );
  }
  const asked = intro.side === "asked";
  return (
    <p className="pl-intro-line">
      <span>
        {asked ? `You asked ${c.with.first} for an intro at ${co}.` : `${c.with.first} asked you for an intro at ${co}.`}{" "}
        {intro.status === "made" ? "Made." : intro.status === "declined" ? "Declined." : ""}
        {intro.won ? " It led to a win." : ""}
      </span>
      {intro.status === "asked" && (
        <span className="pl-intro-acts">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run({ type: "pipeline.introMark", id: intro.id, status: "made" })}>
            {asked ? "Made" : "I made it"}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void run({ type: "pipeline.introMark", id: intro.id, status: "declined" })}>
            {asked ? "Declined" : "Can't help"}
          </button>
        </span>
      )}
    </p>
  );
}
