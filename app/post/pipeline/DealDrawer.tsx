"use client";

/**
 * A deal's drawer on the Pipeline board (Pipeline.dc.html): where it stands (the stages, each one
 * tap, as Move to always was), how Merlin knows and "Not right?", the next move with its due date
 * and the follow-ups, what it is worth a month and the seat pitched (the member's own words), the
 * proposal or contract and what happened to it, the way in, private notes and the log, then Mark
 * won, Lost and Refer it to a peer. The Example drawer says what an example is and takes the examples away.
 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { LINE, STAGE_WORDS, isOpen, type FollowUpRec, type MoveStage, type PipelineRec, type PipelineView } from "@/lib/pipeline";
import { COMPANY_PRICE } from "@/lib/tableFields";
import { CompanyLogo, IconX, LockedName, useToast } from "../../ui/shared";
import { useUi } from "../ui";
import type { CoInfo } from "../model";
import { useApp } from "../shell/pages";
import { pipelineAct } from "../pipelineStore";
import { AskReply, FixMenu, LogList, NoteBox } from "../PipelineParts";
import { PassButton } from "../PeerSheets";
import { openWay, useWayIn } from "../network/useWays";
import type { Example } from "../examples";
import { money, nextOf, shownMonthly, toWords, wayOf, type ExampleCard, type RouteHint } from "./model";
import { benchHint } from "./AddDeal";
import { openItem } from "../Activity";
import { openContract } from "../contracts/open";
import { proposalFor } from "../WriteProposal";

const FollowUpSheet = dynamic(() => import("../FollowUpSheet").then((m) => m.FollowUpSheet), { ssr: false });

export function DealDrawer({
  r,
  i,
  today,
  route,
  sees,
  due,
  onClose,
  onMove,
  onWin,
  onUnlock,
}: {
  r: PipelineRec;
  i: CoInfo | undefined;
  today: string;
  route: RouteHint | null;
  sees: PipelineView["sees"];
  /** Its follow-up when one is due (Home's words for it: "Sent 3 days ago by email."). */
  due: FollowUpRec | null;
  onClose: () => void;
  onMove: (s: MoveStage) => void;
  onWin: () => void;
  onUnlock: () => void;
}) {
  const c = useApp();
  const ui = useUi();
  const toast = useToast();
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = r.name === null;
  const label = r.name ?? "the locked company";
  const n = nextOf(r, today);
  const at = LINE.indexOf(r.stage);
  const open = isOpen(r.stage);
  const way = wayOf(r, route);
  const best = useWayIn(!lock && !way ? r.company : null);
  const run = async (a: Parameters<typeof pipelineAct>[0]) => {
    if (busy) return;
    setBusy(true);
    const res = await pipelineAct(a);
    setBusy(false);
    toast(res.message, !res.ok);
  };
  const followable = open && r.stage !== "reach";
  // The deal's proposal opens in the editor, its contract on Contracts (both at that one), else Proposals to start one.
  const openPaper = () => (r.paper?.kind === "contract" ? openContract(c, r.paper.id) : r.paper ? openItem(c, { pr: r.paper.id }) : proposalFor(c, r.company));
  // The next move's own button: write the note (the record drafts it), draft a follow-up, sign, the terms.
  const act =
    lock
      ? { t: `Open the company · ${ui.me.proOpens && ui.me.proOpens.left > 0 ? "free" : `${COMPANY_PRICE} credits`}`, go: onUnlock }
      : r.stage === "reach"
        ? { t: "Write your note", go: () => c.openCompany(r.company) }
        : r.stage === "won"
          ? { t: r.seat ? "See the terms" : "Add the terms and your seat", go: onWin, volt: !r.seat }
          : r.paper?.tone === "you"
            ? { t: r.paper.kind === "contract" ? "Sign the contract" : "Countersign it", go: openPaper }
            : r.stage === "meeting" && !r.paper
              ? { t: "Start a proposal", go: openPaper }
              : followable
                ? { t: "Draft a follow-up", go: () => setDrafting(true) }
                : null;
  return (
    <aside className="pl2-drawer" aria-label={lock ? "Locked company" : `The deal with ${label}`}>
      <div className="pl2-dr-head">
        <CompanyLogo name={r.name ?? ""} domain={r.name ? i?.c.iconDomain ?? i?.domain ?? null : null} hidden={lock} seed={r.company} />
        <span className="pl2-dr-t">
          {lock ? (
            <strong>
              <LockedName seed={r.company} />
            </strong>
          ) : (
            <button type="button" className="pl2-dr-name" onClick={() => c.openCompany(r.company)}>
              {r.name}
            </button>
          )}
          <span className="pl2-dr-sub">
            {lock ? i?.teaser || "Locked company" : r.pitch ?? "Seat not set yet"}
            {shownMonthly(r) ? ` · ${money(r.monthly)} a month` : ""}
          </span>
        </span>
        <button type="button" className="pl2-x" aria-label="Close" onClick={onClose}>
          <IconX size={16} />
        </button>
      </div>
      <div className="pl2-dr-body">
        <div className="pl2-steps" role="group" aria-label="Move to a stage">
          {LINE.map((s, k) => (
            <button key={s} type="button" aria-pressed={s === r.stage} className={s === r.stage ? "on" : at >= 0 && k < at ? "past" : ""} disabled={busy} onClick={() => (s === "won" ? onWin() : onMove(s as MoveStage))}>
              {STAGE_WORDS[s]}
            </button>
          ))}
        </div>
        <div className="pl2-how">
          <span>
            <strong>How Merlin knows.</strong> {r.how ?? "You added it."}
            {r.stage === "lost" || r.stage === "notnow" || r.stage === "quiet" ? ` It is closed: ${STAGE_WORDS[r.stage].toLowerCase()}.` : ""}
          </span>
          <FixMenu rec={r} />
        </div>

        <section className="pl2-nextbox" aria-label="Next move">
          <span className="pl2-kicker">Next move</span>
          <span className="pl2-next">
            <span aria-hidden className={`pl2-dot${n.hot ? " due" : ""}`} />
            <span className="pl2-next-t">
              <strong>{n.title}</strong>
              {n.due && <span className={n.hot ? "pl2-due-hot" : "pl2-due"}>{n.due}</span>}
            </span>
          </span>
          {r.ask && <AskReply rec={r} />}
          <div className="pl2-acts">
            {act && (
              <button type="button" className={`pl2-big ${act.volt ? "pl2-volt" : "pl2-pine"}`} onClick={act.go} disabled={busy}>
                {act.t}
              </button>
            )}
            {followable && r.due && (
              <button type="button" className="pl2-mini" disabled={busy} onClick={() => void run({ type: "pipeline.snooze", id: r.id })}>
                Snooze 3 days
              </button>
            )}
            {open && (
              <button type="button" className="pl2-mini" disabled={busy} onClick={() => void run({ type: "pipeline.close", id: r.id, stage: "notnow" })}>
                Not now
              </button>
            )}
            {!open && r.fix.includes("reopen") && (
              <button type="button" className="pl2-mini" disabled={busy} onClick={() => void run({ type: "pipeline.reopen", id: r.id })}>
                Reopen it
              </button>
            )}
          </div>
          {r.stage === "sent" && (
            <span className="pl2-small">
              {r.follow ? `You followed up ${r.follow === 1 ? "once" : `${r.follow} times`}. ` : ""}Merlin nudges you 3 business days after each note.{" "}
              {sees.gmail || r.channel === "merlin" ? "After 2 follow-ups with no reply, the deal goes quiet." : "It can't see email replies yet, so it asks you instead of guessing."}
            </span>
          )}
        </section>

        <ValueBox r={r} i={i} />

        <section className="pl2-sec" aria-label="Proposal and contract">
          <h3>Proposal and contract</h3>
          {r.paper ? (
            <>
              <span className={`pl2-pill ${r.paper.tone === "you" ? "pine" : r.paper.tone === "closed" ? "plain" : "mint"} pl2-self`}>
                {r.paper.kind === "contract" ? "Contract" : "Proposal"}: {r.paper.state}
              </span>
              <span className="pl2-small">{r.paper.title}</span>
              <ol className="pl2-log">
                {r.paper.log.map((x, k) => (
                  <li key={`${x.at}${k}`}>
                    <span className="num">{shortAt(x.at)}</span>
                    <span>{x.text}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <span className="pl2-small">None yet. Merlin drafts one from your call notes or a template, then tells you when the client opens it.</span>
          )}
          <button type="button" className="pl2-link" onClick={openPaper}>
            {r.paper ? `Open the ${r.paper.kind}` : "Start a proposal"}
          </button>
        </section>

        <section className="pl2-sec" aria-label="Your way in">
          <h3>Your way in</h3>
          <span className="pl2-small">
            {way ?? (lock ? "Open the company to see your routes in." : best.data?.routes[0] ? `${best.data.routes[0].title}. ${best.data.routes[0].why}` : "No route chosen yet.")}
            {toWords(r) ? ` ${toWords(r)}.` : ""}
          </span>
          {!lock && (
            <button type="button" className="pl2-link" onClick={() => openWay(r.company)}>
              See the route
            </button>
          )}
        </section>

        <section className="pl2-sec" aria-label="Notes and activity">
          <h3>Notes and activity</h3>
          <NoteBox rec={r} />
          <LogList rec={r} max={5} />
        </section>

        <div className="pl2-dr-foot">
          {open && (
            <button type="button" className="pl2-big pl2-line" disabled={busy} onClick={onWin}>
              Mark won
            </button>
          )}
          {open && (
            <button type="button" className="pl2-big pl2-quiet" disabled={busy} onClick={() => void run({ type: "pipeline.close", id: r.id, stage: "lost" })}>
              Lost
            </button>
          )}
          {r.name && r.stage !== "won" && <PassButton company={r.company} from="deal" className="pl2-big pl2-quiet" />}
        </div>
      </div>
      {drafting && <FollowUpSheet f={due} rec={r} me={ui.me} onClose={() => setDrafting(false)} />}
    </aside>
  );
}
const shortAt = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1]} ${Number(m[3])}` : "";
};

/** What the deal is worth a month and the seat pitched: the member's own words, saved on the card (pipeline.value). */
function ValueBox({ r, i }: { r: PipelineRec; i: CoInfo | undefined }) {
  const c = useApp();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(r.value ? String(r.value) : "");
  const [pitch, setPitch] = useState(r.pitch ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setVal(r.value ? String(r.value) : "");
    setPitch(r.pitch ?? "");
    setEdit(false);
    setErr(null);
  }, [r.id, r.value, r.pitch]);
  const hint = benchHint(c.view.benchmarks, c.me.function ?? null, i);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await pipelineAct({ type: "pipeline.value", id: r.id, value: val.trim() || null, pitch: pitch.trim() || null } as never);
    setBusy(false);
    if (!res.ok) return setErr(res.message);
    toast(res.message);
    setEdit(false);
  };
  const won = r.stage === "won" && r.won;
  return (
    <section className="pl2-sec" aria-label="Value and seat">
      <h3>Value and seat</h3>
      {!edit ? (
        <>
          <span className="pl2-small">
            {won ? `Won at ${money(r.won!.monthly)} a month, from the terms. ` : r.stage === "won" ? "Won, with no terms yet. Add the terms and the totals count it. " : r.value ? `${money(r.value)} a month, as you typed it. ` : "No value yet. Type what it is worth a month and the totals count it. "}
            {r.pitch ? `You pitch ${r.pitch}.` : "No seat set yet."}
          </span>
          <button type="button" className="pl2-link" onClick={() => setEdit(true)}>
            {r.value || r.pitch ? "Change the value or the seat" : "Add the value and the seat"}
          </button>
        </>
      ) : (
        <form
          className="pl2-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="pl2-lab" htmlFor={`pl2-v-${r.id}`}>
            Value a month, in dollars
          </label>
          <input id={`pl2-v-${r.id}`} className="pl2-in" inputMode="numeric" autoComplete="off" value={val} placeholder="9000" onChange={(e) => setVal(e.target.value)} />
          {hint && <span className="pl2-small">{hint}</span>}
          <label className="pl2-lab" htmlFor={`pl2-p-${r.id}`}>
            Seat you are pitching
          </label>
          <input id={`pl2-p-${r.id}`} className="pl2-in" autoComplete="off" maxLength={60} value={pitch} placeholder="Fractional VP Sales" onChange={(e) => setPitch(e.target.value)} />
          {err && (
            <span className="pl2-err" role="alert">
              {err}
            </span>
          )}
          <span className="pl2-acts">
            <button type="submit" className="pl2-big pl2-pine" disabled={busy} aria-busy={busy}>
              Save
            </button>
            <button type="button" className="pl2-mini" onClick={() => setEdit(false)}>
              Cancel
            </button>
          </span>
        </form>
      )}
    </section>
  );
}

/** The Example drawer: the same parts with the example's words, never a deal. */
export function ExampleDrawer({ x, onClose, onRemove, onAdd }: { x: Example<ExampleCard>; onClose: () => void; onRemove: () => void; onAdd: () => void }) {
  const v = x.value;
  return (
    <aside className="pl2-drawer" aria-label={`Example deal with ${v.company}`}>
      <div className="pl2-dr-head">
        <CompanyLogo name={v.company} domain={null} seed={v.company} />
        <span className="pl2-dr-t">
          <strong>{v.company}</strong>
          <span className="pl2-dr-sub">
            {v.pitch} · {money(v.monthly)} a month
          </span>
        </span>
        <button type="button" className="pl2-x" aria-label="Close" onClick={onClose}>
          <IconX size={16} />
        </button>
      </div>
      <div className="pl2-dr-body">
        <div className="pl2-exnote">
          <span>
            <strong>{x.label}.</strong> An example deal, so you can see a card and this panel. It does not count in your totals and nothing here is sent.
          </span>
          <button type="button" className="pl2-mini" onClick={onRemove}>
            Remove the examples
          </button>
        </div>
        <div className="pl2-steps" aria-hidden>
          {LINE.map((s) => (
            <span key={s} className={s === v.stage ? "on" : ""}>
              {STAGE_WORDS[s]}
            </span>
          ))}
        </div>
        <span className="pl2-small">
          <strong>How Merlin knows.</strong> {v.how}.
        </span>
        <section className="pl2-nextbox" aria-label="Next move">
          <span className="pl2-kicker">Next move</span>
          <span className="pl2-next">
            <span aria-hidden className="pl2-dot" />
            <span className="pl2-next-t">
              <strong>{v.next}</strong>
              <span className="pl2-due">{v.due}</span>
            </span>
          </span>
          <ol className="pl2-log">
            {v.log.map((l) => (
              <li key={l.d + l.t}>
                <span>{l.d}</span>
                <span>{l.t}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="pl2-sec">
          <h3>Proposal and contract</h3>
          <span className="pl2-small">{v.paper ? `Proposal: ${v.paper}.` : "None yet. Merlin drafts one from your call notes or a template, then tells you when the client opens it."}</span>
        </section>
        <section className="pl2-sec">
          <h3>Your way in</h3>
          <span className="pl2-small">
            {v.way}. {v.to}.
          </span>
        </section>
        <div className="pl2-dr-foot">
          <button type="button" className="pl2-big pl2-pine" onClick={onAdd}>
            Add your own deal
          </button>
        </div>
      </div>
    </aside>
  );
}
