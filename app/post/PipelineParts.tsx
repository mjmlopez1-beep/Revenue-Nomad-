"use client";

/**
 * The parts of a pipeline entry that the Your pipeline page and the record's block share: its
 * stage, how Merlin knows it, the one-tap corrections ("Not right?"), and its log and notes.
 * Merlin moves the stages itself; the member only ever corrects one, or says Lost or Not now.
 */
import { useState } from "react";
import { STAGE_WORDS, shortDay, type PipelineRec } from "@/lib/pipeline";
import { useToast } from "../ui/shared";
import { pipelineAct } from "./pipelineStore";

export function StageChip({ stage }: { stage: PipelineRec["stage"] }) {
  return <span className={`pl-stage pl-stage-${stage}`}>{STAGE_WORDS[stage]}</span>;
}

const FIX_WORDS: Record<PipelineRec["fix"][number], string> = {
  notReply: "That wasn't a reply",
  notMeeting: "That wasn't a meeting about this",
  lost: "Lost",
  notnow: "Not now",
  reopen: "Reopen it",
  remove: "Not a deal. Take it out",
};

/** "Not right?": the corrections that make sense now, each one tap. */
export function FixMenu({ rec, label }: { rec: PipelineRec; label?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!rec.fix.length) return null;
  const run = async (f: PipelineRec["fix"][number]) => {
    if (busy) return;
    setBusy(true);
    const r = await pipelineAct(
      f === "notReply" || f === "notMeeting"
        ? { type: "pipeline.correct", id: rec.id }
        : f === "lost" || f === "notnow"
          ? { type: "pipeline.close", id: rec.id, stage: f }
          : f === "reopen"
            ? { type: "pipeline.reopen", id: rec.id }
            : { type: "pipeline.remove", id: rec.id },
    );
    setBusy(false);
    toast(r.message, !r.ok);
  };
  return (
    <details className="pl-fix">
      <summary className="pl-fix-s">{label ?? (rec.fix.some((f) => f === "notReply" || f === "notMeeting") ? "Not right?" : rec.fix.includes("reopen") ? "Reopen?" : "Lost or not now?")}</summary>
      <div className="pl-fix-m" role="group" aria-label={`Change ${rec.name ?? "this deal"}`}>
        {rec.fix.map((f) => (
          <button key={f} type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void run(f)}>
            {FIX_WORDS[f]}
          </button>
        ))}
      </div>
    </details>
  );
}

/** The entry's notes and log, newest first, merged; the first few, then all. */
export function LogList({ rec, max = 4 }: { rec: PipelineRec; max?: number }) {
  const [all, setAll] = useState(false);
  const items = [...rec.notes.map((n) => ({ ...n, note: true })), ...rec.log.map((n) => ({ ...n, note: false }))].sort((a, b) => b.at.localeCompare(a.at));
  const shown = all ? items : items.slice(0, max);
  return (
    <>
      <ol className="pl-log">
        {shown.map((x, k) => (
          <li key={`${x.at}${k}`} className={x.note ? "pl-log-note" : undefined}>
            <span className="pl-log-d num">{shortDay(x.at.slice(0, 10))}</span>
            <span className="pl-log-t">{x.note ? <b>Note. </b> : null}{x.text}</span>
          </li>
        ))}
      </ol>
      {items.length > max && (
        <button type="button" className="mv-link pl-log-more" onClick={() => setAll(!all)}>
          {all ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </>
  );
}

/** A private note, added in place. */
export function NoteBox({ rec }: { rec: PipelineRec }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const r = await pipelineAct({ type: "pipeline.note", id: rec.id, text });
    setBusy(false);
    toast(r.message, !r.ok);
    if (r.ok) setText("");
  };
  return (
    <form
      className="pl-note"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="sr-only" htmlFor={`pl-note-${rec.id}`}>
        A private note
      </label>
      <input id={`pl-note-${rec.id}`} className="input" value={text} maxLength={1000} placeholder="A private note, only you see it" onChange={(e) => setText(e.target.value)} />
      <button type="submit" className="btn btn-sm" disabled={busy || !text.trim()}>
        Save
      </button>
    </form>
  );
}
