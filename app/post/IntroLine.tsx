"use client";

/**
 * One line under a conversation's header in Messages, about an intro at the seat's company: the
 * member who started it can log that they asked for one ("Asked Dana for an intro? Log it"), and
 * then either side marks it made or declined. A made intro puts the company in the asker's pipeline,
 * and a win from it is credited to the intro. Nothing shows in a conversation about no company.
 */
import { useState } from "react";
import type { ConversationRec } from "@/lib/tableTypes";
import { HIDDEN_COMPANY } from "@/lib/tableFields";
import { useToast } from "../ui/shared";
import { pipelineAct, usePipeline } from "./pipelineStore";
import "./pipeline.css";

export function IntroLine({ c }: { c: ConversationRec }) {
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
