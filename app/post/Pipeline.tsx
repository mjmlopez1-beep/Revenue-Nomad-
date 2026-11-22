"use client";

/**
 * Your pipeline (?p=pipeline, under Yours): every company the member reached out to, by stage, as
 * Merlin moved it, and first the leads peers passed them and the routes in they went with, at To reach out until their note goes out. Stages are columns on a wide screen and a grouped list on a phone, each with its
 * count, then the closed ones (Went quiet, Lost, Not now), the intros, and the month's value of
 * what they won. Each card says how Merlin knows ("Detected from your Gmail on Nov 21",
 * "From your calendar", "You marked it"), carries its one-tap corrections and Move to (any stage,
 * by hand, on every plan), and asks "Did they reply by email?" where Merlin can't see a reply. The
 * page says what Merlin can see for this member, and what connecting Gmail would add.
 */
import { useMemo, useState } from "react";
import { RouteLine } from "./network/Ways";
import dynamic from "next/dynamic";
import { CHANNEL_WORDS, LINE, STAGE_WORDS, monthWords, shortDay, type IntroRec, type PipelineRec, type PipelineView, type Stage } from "@/lib/pipeline";
import { CompanyLogo, IconPencil, LockedName, useToast } from "../ui/shared";
import { EmptyState, PageHead, Stat } from "../ui/system";
import type { CoInfo } from "./model";
import { useUi } from "./ui";
import { pipelineAct, usePipeline } from "./pipelineStore";
import { AskReply, FixMenu, MoveMenu, StageChip } from "./PipelineParts";
import { WonMoment } from "../ui/WonMoment";
import { PassButton } from "./PeerSheets";
import "./pipeline.css";

const FollowUpSheet = dynamic(() => import("./FollowUpSheet").then((m) => m.FollowUpSheet), { ssr: false });
const WonSheet = dynamic(() => import("./WonSheet").then((m) => m.WonSheet), { ssr: false });

const CLOSED: Stage[] = ["quiet", "lost", "notnow"];
const EMPTY_WORDS: Partial<Record<Stage, string>> = {
  reach: "When a peer passes you a lead, or you go with a route in.",
  sent: "Mark a note sent and it lands here.",
  replied: "Merlin moves a deal here when they write back.",
  meeting: "From your calendar, when you meet.",
  proposal: "When your proposal goes out.",
  won: "When it's signed, or you add your seat there.",
};

export function PipelinePage({ infos, openCompany, onIntegrations }: { infos: CoInfo[]; openCompany: (id: string) => void; onIntegrations: () => void }) {
  const ui = useUi();
  const { view, failed } = usePipeline();
  const byId = useMemo(() => new Map(infos.map((x) => [x.c.id, x])), [infos]);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [winning, setWinning] = useState<string | null>(null);
  const byStage = useMemo(() => {
    const m = new Map<Stage, PipelineRec[]>();
    for (const e of view?.entries ?? []) m.set(e.stage, [...(m.get(e.stage) ?? []), e]);
    return m;
  }, [view]);
  const open = (["reach", "sent", "replied", "meeting", "proposal"] as Stage[]).reduce((n, s) => n + (view?.counts[s] ?? 0), 0);
  const closed = CLOSED.flatMap((s) => byStage.get(s) ?? []);
  const rec = (id: string | null) => (id ? view?.entries.find((e) => e.id === id) ?? null : null);
  const drafted = rec(drafting);
  const won = rec(winning);
  return (
    <div className="page-wide pl-page">
      <PageHead title="Your pipeline" lead="Merlin moves each deal where it can see what happened: a peer's lead or a route you go with waits at To reach out, then Sent when your note goes out, Replied when they write back, Meeting from your calendar. Anything it can't see, move yourself: Move to on any card." />
      {view && <Sees v={view} onIntegrations={onIntegrations} />}
      {!view ? (
        failed ? (
          <EmptyState spot="offline" title="Your pipeline didn't load" role="alert">
            Reload the page to try again.
          </EmptyState>
        ) : (
          <p className="pl-empty">Loading your pipeline</p>
        )
      ) : (
        <>
          <div className="stats pl-stats">
            <Stat n={open} label="open" />
            {(view.counts.reach ?? 0) > 0 && <Stat n={view.counts.reach} label="to reach out" />}
            <Stat n={view.due.length} label={view.due.length === 1 ? "follow-up due" : "follow-ups due"} />
            <Stat n={view.counts.won} label={`won${view.wonMonthly > 0 ? `, ${monthWords(view.wonMonthly)}` : ""}`} />
          </div>
          {!view.entries.length && (
            <EmptyState spot="noFollows" title="No deals yet" framed={false}>
              Use a drafted note on Home and the company lands here at Sent.
            </EmptyState>
          )}
          <div className="pl-board">
            {LINE.map((s) => {
              const list = byStage.get(s) ?? [];
              return (
                <section key={s} className={`pl-col${list.length ? "" : " pl-col-empty"}`} aria-labelledby={`pl-col-${s}`}>
                  <h2 className="pl-col-h" id={`pl-col-${s}`}>
                    {STAGE_WORDS[s]} <span className="pl-col-n num">{list.length}</span>
                  </h2>
                  {s === "won" && list[0] ? <WonMoment rec={list[0]} compact /> : null}
                  {list.length ? (
                    <ul className="pl-cards">
                      {list.map((e) => (
                        <Card key={e.id} e={e} i={byId.get(e.company)} due={view.due.some((f) => f.id === e.id)} onOpen={() => openCompany(e.company)} onDraft={() => setDrafting(e.id)} onWon={() => setWinning(e.id)} />
                      ))}
                    </ul>
                  ) : (
                    <p className="pl-col-none">{EMPTY_WORDS[s]}</p>
                  )}
                </section>
              );
            })}
          </div>
          {closed.length > 0 && (
            <section className="pl-closed" aria-labelledby="pl-closed-h">
              <h2 className="pl-col-h" id="pl-closed-h">
                Closed <span className="pl-col-n num">{closed.length}</span>
              </h2>
              <ul className="pl-cards pl-cards-closed">
                {closed.map((e) => (
                  <Card key={e.id} e={e} i={byId.get(e.company)} due={false} onOpen={() => openCompany(e.company)} onDraft={() => {}} onWon={() => {}} />
                ))}
              </ul>
            </section>
          )}
          <Intros list={view.intros} onOpen={openCompany} />
        </>
      )}
      {drafted && <FollowUpSheet f={view?.due.find((f) => f.id === drafted.id) ?? null} rec={drafted} me={ui.me} onClose={() => setDrafting(null)} />}
      {won && <WonSheet rec={won} onClose={() => setWinning(null)} />}
    </div>
  );
}

/** What Merlin can see for this member, and what connecting more would add. */
function Sees({ v, onIntegrations }: { v: PipelineView; onIntegrations: () => void }) {
  const s = v.sees;
  if (!s.google) return <p className="pl-sees">Merlin sees your notes and messages on Merlin.</p>;
  if (s.gmail) return <p className="pl-sees">Merlin sees your notes and messages on Merlin, your calendar and who you email, from the From, To and Date lines only. Never what an email or a meeting says.</p>;
  return (
    <p className="pl-sees">
      {s.calendar ? "Merlin sees your notes and messages on Merlin, and meetings on your calendar (who and when, never the title). " : "Merlin sees your notes and messages on Merlin. "}
      {s.gmailOffered ? (
        <>
          <button type="button" className="mv-link" onClick={onIntegrations}>
            {s.calendar ? "Add Gmail" : "Connect Google"}
          </button>{" "}
          and it sees replies by email too, from the From, To and Date lines only.
        </>
      ) : s.calendar ? (
        "Replies by email show once you can add Gmail. Until then, a reply on Merlin or a meeting moves a deal."
      ) : (
        <>
          <button type="button" className="mv-link" onClick={onIntegrations}>
            Connect Google
          </button>{" "}
          and meetings on your calendar move your deals too.
        </>
      )}
    </p>
  );
}

function Card({ e, i, due, onOpen, onDraft, onWon }: { e: PipelineRec; i: CoInfo | undefined; due: boolean; onOpen: () => void; onDraft: () => void; onWon: () => void }) {
  return (
    <li className="pl-card">
      <button type="button" className="pl-card-co" onClick={onOpen}>
        <CompanyLogo name={e.name ?? ""} domain={e.name ? i?.c.iconDomain ?? i?.domain ?? null : null} hidden={!e.name} seed={e.company} />
        <span className="pl-card-n">{e.name ?? <LockedName seed={e.company} />}</span>
      </button>
      <span className="pl-card-to">{e.stage === "reach" ? (e.lead ? "A lead a peer passed you. Nothing sent yet." : "Nothing sent yet.") : `To ${e.to.label} · ${CHANNEL_WORDS[e.channel]}`}</span>
      {(CLOSED as string[]).includes(e.stage) ? <StageChip stage={e.stage} /> : null}
      {e.how && e.stage !== "reach" && <span className="pl-how">{e.how}</span>}
      {/* Your way in (network/Ways.tsx): the route the member went with here, and its step. */}
      {e.route && <RouteLine company={e.company} />}
      {(e.lead || e.team) && (
        <span className="pl-peer">
          {e.lead ? `Passed to you by ${e.lead.by.split(" ")[0]}` : ""}
          {e.lead && e.team ? " · " : ""}
          {e.team ? `Teamed with ${e.team.with}` : ""}
        </span>
      )}
      {e.stage === "won" ? (
        <span className="pl-card-next">{e.won ? monthWords(e.won.monthly) : e.seat ? "Your seat here is confirmed" : "Add the terms and your seat"}</span>
      ) : e.ask ? (
        <AskReply rec={e} />
      ) : e.next && e.stage !== "reach" ? (
        <span className={`pl-card-next${due ? " pl-due" : ""}`}>{e.next}</span>
      ) : null}
      <div className="pl-card-acts">
        {e.stage === "reach" && !e.route && (
          <button type="button" className="btn btn-sm btn-pine" onClick={onOpen} data-reach>
            <IconPencil size={13} /> Write your note
          </button>
        )}
        {due && (
          <button type="button" className="btn btn-sm btn-pine" onClick={onDraft}>
            <IconPencil size={13} /> Follow up
          </button>
        )}
        {e.stage === "won" && !e.seat && (
          <button type="button" className="btn btn-sm btn-pine" onClick={onWon}>
            Add it as your seat
          </button>
        )}
        {e.name && (e.stage === "sent" || e.stage === "quiet" || e.stage === "notnow") && <PassButton company={e.company} from="deal" />}
        <MoveMenu rec={e} />
        <FixMenu rec={e} />
      </div>
    </li>
  );
}

/** The intros the member asked for, and the ones other members asked of them, with made or declined. */
function Intros({ list, onOpen }: { list: IntroRec[]; onOpen: (id: string) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!list.length) return null;
  const mark = async (i: IntroRec, status: "made" | "declined") => {
    setBusy(i.id);
    const r = await pipelineAct({ type: "pipeline.introMark", id: i.id, status });
    setBusy(null);
    toast(r.message, !r.ok);
  };
  const where = (i: IntroRec) =>
    i.company ? (
      <button type="button" className="mv-link" onClick={() => onOpen(i.company!)}>
        {i.name ?? <LockedName seed={i.company} />}
      </button>
    ) : (
      "the companies they know"
    );
  return (
    <section className="pl-intros" aria-labelledby="pl-intros-h">
      <h2 className="pl-col-h" id="pl-intros-h">
        Intros <span className="pl-col-n num">{list.length}</span>
      </h2>
      <ul className="pl-intro-list">
        {list.map((i) => (
          <li key={i.id} className="pl-intro">
            <span className="pl-intro-t">
              {i.side === "asked" ? (
                <>
                  You asked {i.who} for an intro at {where(i)}
                </>
              ) : (
                <>
                  {i.who} asked you for an intro at {where(i)}
                </>
              )}
            </span>
            <span className="pl-how">
              {i.status === "made" ? `Made ${shortDay((i.madeAt ?? i.askedAt).slice(0, 10))}` : i.status === "declined" ? "Declined" : `Asked ${shortDay(i.askedAt.slice(0, 10))}`}
              {i.won ? " · Led to a win" : ""}
            </span>
            {i.status === "asked" && (
              <span className="pl-intro-acts">
                <button type="button" className="btn btn-sm" disabled={busy === i.id} onClick={() => void mark(i, "made")}>
                  {i.side === "of-you" ? "I made it" : "Made"}
                </button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={busy === i.id} onClick={() => void mark(i, "declined")}>
                  {i.side === "of-you" ? "Can't help" : "Declined"}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
