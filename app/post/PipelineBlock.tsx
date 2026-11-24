"use client";

/**
 * The record's "Your pipeline" block, near the top of a company's record: where the member's deal
 * there stands as Merlin saw it ("Replied", "Detected from your Gmail on Nov 21"), who it went to,
 * the next step, the log and their private notes, with one-tap corrections and Move to (any
 * stage, by hand), and "Did they reply by email?" where Merlin can't see a reply. A won deal offers its
 * terms and Add it as your seat. Nothing shows at a company that isn't in their pipeline. The
 * member's alone: it comes from their own pipeline, never anyone else's.
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import { CHANNEL_WORDS, monthWords, rateWords } from "@/lib/pipeline";
import { IconPencil } from "../ui/shared";
import type { CoInfo } from "./model";
import { useUi } from "./ui";
import { usePipeline } from "./pipelineStore";
import { AskReply, FixMenu, LogList, MoveMenu, NoteBox, StageChip } from "./PipelineParts";
import "./pipeline.css";

const FollowUpSheet = dynamic(() => import("./FollowUpSheet").then((m) => m.FollowUpSheet), { ssr: false });
const WonSheet = dynamic(() => import("./WonSheet").then((m) => m.WonSheet), { ssr: false });

export function PipelineBlock({ i }: { i: CoInfo }) {
  const ui = useUi();
  const { view } = usePipeline();
  const [drafting, setDrafting] = useState(false);
  const [winning, setWinning] = useState(false);
  const all = (view?.entries ?? []).filter((e) => e.company === i.c.id);
  // The open deal there, else the latest.
  const rec = all.find((e) => ["reach", "sent", "replied", "meeting", "proposal"].includes(e.stage)) ?? all[0];
  if (!rec) return null;
  const due = view?.due.find((f) => f.id === rec.id) ?? null;
  return (
    <section className="tp-dsec pl-block" aria-labelledby="pl-block-h">
      <h3 className="tp-dsec-h" id="pl-block-h">
        Your pipeline <StageChip stage={rec.stage} />
      </h3>
      <p className="pl-block-who">
        To {rec.to.label} · {CHANNEL_WORDS[rec.channel]}
        {rec.how ? <span className="pl-how"> · {rec.how}</span> : null}
      </p>
      {rec.stage === "won" ? (
        <p className="pl-block-next">
          {rec.won ? `${rateWords(rec.won)}, about ${monthWords(rec.won.monthly)}.` : "Won."} {rec.seat ? "Your seat here is confirmed by this win." : null}
          {rec.intro ? ` Through ${rec.intro.by}'s intro.` : null}
          {rec.lead ? ` Referred to you by ${rec.lead.by}. They see it was won.` : null}
        </p>
      ) : rec.ask ? (
        <AskReply rec={rec} />
      ) : rec.next ? (
        <p className="pl-block-next">
          <b>Next:</b> {rec.next}
          {due ? `. ${due.line}` : ""}
        </p>
      ) : null}
      {(rec.lead || rec.team) && rec.stage !== "won" && (
        <p className="pl-peer">
          {rec.lead ? `Referred to you by ${rec.lead.by}` : ""}
          {rec.lead && rec.team ? " · " : ""}
          {rec.team ? `Teamed with ${rec.team.with}` : ""}
        </p>
      )}
      <div className="pl-block-acts">
        {due && (
          <button type="button" className="btn btn-pine btn-sm" onClick={() => setDrafting(true)}>
            <IconPencil size={13} /> Draft a follow-up
          </button>
        )}
        {rec.stage === "won" && (
          <button type="button" className={`btn btn-sm${rec.seat ? "" : " btn-pine"}`} onClick={() => setWinning(true)}>
            {rec.seat ? "The terms" : "Add it as your seat"}
          </button>
        )}
        <MoveMenu rec={rec} />
        <FixMenu rec={rec} />
        <button type="button" className="mv-link pl-block-all" onClick={() => ui.openPage("pipeline")}>
          Your whole pipeline
        </button>
      </div>
      <LogList rec={rec} max={3} />
      <NoteBox rec={rec} />
      {drafting && <FollowUpSheet f={due} rec={rec} me={ui.me} onClose={() => setDrafting(false)} />}
      {winning && <WonSheet rec={rec} onClose={() => setWinning(false)} />}
    </section>
  );
}
