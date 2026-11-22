"use client";

/**
 * The parts of a pipeline entry that the Your pipeline page and the record's block share: its
 * stage, how Merlin knows it, the one-tap corrections ("Not right?"), Move to (any stage, by hand,
 * on every plan), the "Did they reply by email?" question, and its log and notes.
 */
import { useState } from "react";
import { MOVE_STAGES, STAGE_WORDS, shortDay, type MoveStage, type PipelineRec } from "@/lib/pipeline";
import { useToast } from "../ui/shared";
import { Chip, STATUS_TONE, type ChipTone } from "../ui/system";
import { pipelineAct } from "./pipelineStore";

/** A deal's stage on the status scale (app/ui/system.tsx): Won pine, moving (Replied, Meeting, Proposal) mint, the rest outline. */
const STAGE_TONE: Record<PipelineRec["stage"], ChipTone> = { reach: "outline", sent: STATUS_TONE.Sent, replied: STATUS_TONE.Viewed, meeting: STATUS_TONE.Viewed, proposal: STATUS_TONE.Viewed, won: STATUS_TONE.Won, lost: STATUS_TONE.Lost, quiet: "outline", notnow: "outline" };
export function StageChip({ stage }: { stage: PipelineRec["stage"] }) {
  return (
    <Chip tone={STAGE_TONE[stage]} className="pl-stage">
      {STAGE_WORDS[stage]}
    </Chip>
  );
}

const FIX_WORDS: Record<PipelineRec["fix"][number], string> = {
  notReply: "That wasn't a reply",
  notMeeting: "That wasn't a meeting about this",
  notWon: "Not a win",
  lost: "Lost",
  notnow: "Not now",
  reopen: "Reopen it",
  remove: "Not a deal. Take it out",
};

/** "Not right?": the corrections that make sense now, each one tap. Lost and Not now are in Move to. */
export function FixMenu({ rec, label }: { rec: PipelineRec; label?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const fix = rec.fix.filter((f) => f !== "lost" && f !== "notnow");
  if (!fix.length) return null;
  const run = async (f: PipelineRec["fix"][number]) => {
    if (busy) return;
    setBusy(true);
    const r = await pipelineAct(
      f === "notReply" || f === "notMeeting" || f === "notWon"
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
      <summary className="pl-fix-s">{label ?? (fix.some((f) => f === "notReply" || f === "notMeeting" || f === "notWon") ? "Not right?" : fix.includes("reopen") ? "Reopen?" : "Not a deal?")}</summary>
      <div className="pl-fix-m" role="group" aria-label={`Change ${rec.name ?? "this deal"}`}>
        {fix.map((f) => (
          <button key={f} type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void run(f)}>
            {FIX_WORDS[f]}
          </button>
        ))}
      </div>
    </details>
  );
}

/** "Move to...": the member moves the deal to any stage by hand (recorded as "You marked it"). Every plan, desktop and phone. */
export function MoveMenu({ rec }: { rec: PipelineRec }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (stage: MoveStage, el: HTMLElement) => {
    if (busy) return;
    setBusy(true);
    const r = await pipelineAct({ type: "pipeline.move", id: rec.id, stage });
    setBusy(false);
    el.closest("details")?.removeAttribute("open");
    toast(r.message, !r.ok);
  };
  return (
    <details className="pl-fix pl-move">
      <summary className="pl-fix-s" aria-label={`Move ${rec.name ?? "this deal"} to another stage`}>
        Move to…
      </summary>
      <div className="pl-fix-m pl-move-m" role="group" aria-label={`Move ${rec.name ?? "this deal"} to`}>
        {MOVE_STAGES.filter((s) => s !== rec.stage).map((s) => (
          <button key={s} type="button" className="btn btn-sm btn-ghost" data-move={s} disabled={busy} onClick={(e) => void run(s, e.currentTarget)}>
            {STAGE_WORDS[s]}
          </button>
        ))}
      </div>
    </details>
  );
}

/** "No reply seen. Did they reply by email?": a deal Merlin can't see a reply on (no Gmail), at its follow-up. One tap moves it. */
export function AskReply({ rec }: { rec: PipelineRec }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!rec.ask) return null;
  const run = async (stage: "replied" | "meeting") => {
    if (busy) return;
    setBusy(true);
    const r = await pipelineAct({ type: "pipeline.move", id: rec.id, stage });
    setBusy(false);
    toast(r.message, !r.ok);
  };
  return (
    <div className="pl-ask" role="group" aria-label={rec.next ?? "Did they reply?"}>
      <span className="pl-ask-q">{rec.next}</span>
      <span className="pl-ask-acts">
        <button type="button" className="btn btn-sm" data-ask="replied" disabled={busy} onClick={() => void run("replied")}>
          Replied
        </button>
        <button type="button" className="btn btn-sm" data-ask="meeting" disabled={busy} onClick={() => void run("meeting")}>
          Meeting
        </button>
      </span>
    </div>
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
