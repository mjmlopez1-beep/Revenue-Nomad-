"use client";

/**
 * Home's follow-ups, above the three moves: the deals in the member's pipeline whose follow-up is
 * due ("Follow up with the CEO at Larkfield Robotics", "Sent 3 days ago by email."), with Draft a
 * follow-up, Snooze 3 days and Not now. Merlin moves the stages itself, so there is no stage button
 * here but Not now. A deal Merlin saw won lately, with no seat for it yet, asks once to become the
 * member's seat. Nothing shows when nothing is due.
 */
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Me } from "@/lib/tableTypes";
import type { FollowUpRec, PipelineRec } from "@/lib/pipeline";
import { CompanyLogo, LockedName, IconPencil, useToast } from "../ui/shared";
import type { CoInfo } from "./model";
import { useUi } from "./ui";
import { pipelineAct, usePipeline } from "./pipelineStore";
import { WonMoment } from "../ui/WonMoment";
import "./pipeline.css";

const FollowUpSheet = dynamic(() => import("./FollowUpSheet").then((m) => m.FollowUpSheet), { ssr: false });
const WonSheet = dynamic(() => import("./WonSheet").then((m) => m.WonSheet), { ssr: false });

/** How many show on Home; the rest are a link to the pipeline. */
const SHOWN = 3;
/** A win asks to become a seat for this long after Merlin saw it. */
const WON_ASK_DAYS = 14;

export function FollowUps({ me, byId, openCompany }: { me: Me; byId: Map<string, CoInfo>; openCompany: (id: string) => void }) {
  const ui = useUi();
  const toast = useToast();
  const { view } = usePipeline();
  const [busy, setBusy] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [winning, setWinning] = useState<string | null>(null);
  const due = view?.due ?? [];
  const recs = useMemo(() => new Map((view?.entries ?? []).map((e) => [e.id, e])), [view]);
  const wins = useMemo(
    () => (view?.entries ?? []).filter((e) => e.stage === "won" && !e.seat && !!e.dates.won && Date.now() - Date.parse(e.dates.won) < WON_ASK_DAYS * 86_400_000).slice(0, 1),
    [view],
  );
  if (!due.length && !wins.length) return null;

  const run = async (id: string, act: Parameters<typeof pipelineAct>[0]) => {
    if (busy) return;
    setBusy(id);
    const r = await pipelineAct(act);
    setBusy(null);
    toast(r.message, !r.ok);
  };
  const drafted = drafting ? recs.get(drafting) : null;
  const won = winning ? recs.get(winning) : null;
  return (
    <section className="hm-sec pl-fu" aria-labelledby="pl-fu-h">
      <div className="mv-head">
        <h2 className="hm-h2" id="pl-fu-h">
          {due.length ? (due.length === 1 ? "A follow-up due" : `${due.length} follow-ups due`) : "You won one"}
        </h2>
        <span className="mv-head-s">From your pipeline. Merlin moves each deal when they reply.</span>
        <span className="mv-sp" />
        <button type="button" className="mv-link hm-more" onClick={() => ui.openPage("pipeline")}>
          Your pipeline
        </button>
      </div>
      <ul className="pl-fu-list">
        {wins.map((e) => (
          <li key={e.id}>
            <WonMoment rec={e} onSeat={() => setWinning(e.id)} />
          </li>
        ))}
        {due.slice(0, SHOWN).map((f) => (
          <FollowUpCard key={f.id} f={f} byId={byId} busy={busy === f.id} onOpen={() => openCompany(f.company)} onDraft={() => setDrafting(f.id)} onSnooze={() => void run(f.id, { type: "pipeline.snooze", id: f.id })} onNotNow={() => void run(f.id, { type: "pipeline.close", id: f.id, stage: "notnow" })} />
        ))}
      </ul>
      {due.length > SHOWN && (
        <button type="button" className="mv-link pl-fu-more" onClick={() => ui.openPage("pipeline")}>
          {due.length - SHOWN} more in your pipeline
        </button>
      )}
      {drafted && <FollowUpSheet key={drafted.id} f={due.find((x) => x.id === drafted.id) ?? null} rec={drafted} me={me} onClose={() => setDrafting(null)} />}
      {won && <WonSheet key={won.id} rec={won} onClose={() => setWinning(null)} />}
    </section>
  );
}

function Co({ e, byId, onOpen }: { e: Pick<PipelineRec, "company" | "name">; byId: Map<string, CoInfo>; onOpen: () => void }) {
  const i = byId.get(e.company);
  return (
    <button type="button" className="pl-fu-co" onClick={onOpen} aria-label={e.name ? `Open ${e.name}` : "Open this company"}>
      <CompanyLogo name={e.name ?? ""} domain={e.name ? i?.c.iconDomain ?? i?.domain ?? null : null} hidden={!e.name} seed={e.company} />
    </button>
  );
}

function FollowUpCard({ f, byId, busy, onOpen, onDraft, onSnooze, onNotNow }: { f: FollowUpRec; byId: Map<string, CoInfo>; busy: boolean; onOpen: () => void; onDraft: () => void; onSnooze: () => void; onNotNow: () => void }) {
  return (
    <li className="pl-fu-card">
      <Co e={f} byId={byId} onOpen={onOpen} />
      <div className="pl-fu-t">
        <span className="pl-fu-title">{f.name ? f.title : <>{f.title.replace(/ at a company in your pipeline$/, "")} at <LockedName seed={f.company} /></>}</span>
        <span className="pl-fu-line">{f.line}</span>
      </div>
      <div className="pl-fu-acts">
        <button type="button" className="btn btn-pine" disabled={busy} onClick={onDraft}>
          <IconPencil size={14} /> Draft a follow-up
        </button>
        <span className="mv-later">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onSnooze}>
            Snooze 3 days
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onNotNow} aria-label={`Not now: ${f.name ?? "this company"}`}>
            Not now
          </button>
        </span>
      </div>
    </li>
  );
}
