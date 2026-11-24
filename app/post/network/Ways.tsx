"use client";

/**
 * Your way into a company (lib/paths/ways.ts, estimated by lib/paths/rank.ts, planned by
 * lib/paths/plan.ts), wherever it shows:
 *
 *   - Your way into <company> (WayInPage): one recommended route first, its why line, the route
 *     drawn link by link (each line as thick as the link is warm) and what happens, numbered; the
 *     other routes below as cards to compare (picking one redraws the route above); Go with it, and
 *     it becomes a plan: one step at a time with the drafted note and the action, What happened?
 *     (made the intro, no reply yet, can't help), the decision with plan B, the log, Switch route.
 *   - Where you can get in (GetInPage): every company that fits the member, by its best route's Est.
 *     success and its odds of hiring. A map whose dots are buttons, a list view, and the list alone
 *     on a phone. A company opens its way in.
 *   - Home's move (RouteMove), the pipeline card's route line (RouteLine) and the record's Your ways
 *     in (RecordWays), where a chosen route leads and the others fold away.
 *
 * One number a route, Est. success, never a promise. Nothing is sent without the member's click:
 * the actions are the ones Merlin already has (Message on Merlin, Invite to connect, the drafted
 * note opened in Gmail, Follow, the usual unlock). A locked company is said by its facts and opens
 * with the usual unlock. Animation is CSS only (ways.css), still with reduced motion.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { CoInfo } from "../model";
import { useUi } from "../ui";
import { useCopy } from "../Credits";
import { InviteConnect } from "../Invite";
import { UnlockCompany } from "../Drawer";
import { CompanyLogo, useToast } from "../../ui/shared";
import { Chip, EmptyState, PageHead } from "../../ui/system";
import { Prop } from "../../ui/fractions/lazy";
import { gmailLink } from "@/lib/moveNote";
import { ZONES, ZONE_WORDS, betweenWords, estWords, type Zone } from "@/lib/paths/rank";
import type { GetInRow, GetInView, PlanLine, PlanView, RouteNote, RouteStepView, RouteView, WayInView } from "@/lib/paths/types";
import { lockedWaysWords } from "@/lib/paths/types";
import type { StepOp } from "@/lib/paths/plan";
import { openWay, useGetIn, usePlans, useWayIn, wayPost, type WayDo } from "./useWays";
import { SendLaunch, draftKey } from "../send/Send";
import "./ways.css";

const cx = (...p: (string | false | null | undefined)[]) => p.filter(Boolean).join(" ");
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

/* ---------- a route, drawn ---------- */

type NodeState = "done" | "now" | "next";
/** Where the plan stands on each person and each link (lib/paths/plan.ts steps: the ask, an intro a person, the meeting). */
function planStates(r: RouteView, p: { step: number; done: boolean }) {
  const last = r.nodes.length - 1;
  const node = (k: number): NodeState => (p.done ? "done" : k === last ? (p.step >= k ? "now" : "next") : k < p.step ? "done" : k === p.step ? "now" : "next");
  const link = (j: number): NodeState => (p.done || j < p.step - 1 ? "done" : j === p.step - 1 ? "now" : "next");
  return { node, link };
}

/**
 * The route: You, each person, the one who decides, and the links between, each as thick as it is
 * warm with its word under it. Drawn person by person (rn-pop) and link by link (rn-grow), top to
 * bottom on a phone (rn-growy). With a plan, the link it is waiting on flows and the person whose
 * move it is pulses.
 */
export function RouteDraw({ r, vertical = false, plan = null }: { r: RouteView; vertical?: boolean; plan?: { step: number; done: boolean } | null }) {
  const st = plan ? planStates(r, plan) : null;
  const items: ReactNode[] = [];
  r.nodes.forEach((n, k) => {
    const state = st && k > 0 ? st.node(k) : null;
    const dotCls = cx("wr-dot", k === 0 ? "wr-dot-you" : n.role === "target" && "wr-dot-target", !state && n.locked && "wr-dot-locked", state && `wr-dot-${state}`, state === "now" && "rn-pulse");
    items.push(
      <div key={`n${k}`} className={cx("wr-node", !plan && "rn-pop")} style={plan ? undefined : delay(k * 0.55)} data-node={n.role}>
        <span className={dotCls}>{state === "done" ? "✓" : n.initials}</span>
        <span className="wr-node-text">
          <span className={cx("wr-name", n.locked && "wr-name-locked")}>{n.label}</span>
          {n.sub ? <span className="wr-sub">{n.sub}</span> : null}
        </span>
      </div>,
    );
    if (k < r.links.length) {
      const l = r.links[k];
      const ls = st ? st.link(k) : null;
      const line = cx("wr-line", ls === "done" ? "wr-line-done" : ls === "now" ? (vertical ? "rn-flowy" : "rn-flow") : ls === "next" ? "wr-line-next" : `wr-${l.band.toLowerCase()}`, !plan && (vertical ? "rn-growy" : "rn-grow"));
      const lineEl = <span className={line} style={plan ? undefined : delay(k * 0.55 + 0.3)} data-band={l.band} />;
      items.push(
        <div key={`l${k}`} className="wr-link" aria-hidden>
          {vertical ? <span className="wr-rail">{lineEl}</span> : lineEl}
          <span className="wr-label">
            {l.band} · {l.words}
          </span>
        </div>,
      );
    }
  });
  const words = r.nodes.map((n, k) => (k < r.links.length ? `${n.label}, then a ${r.links[k].band.toLowerCase()} link to` : n.label)).join(" ");
  return (
    <div className={cx("wr", vertical && "wr-v")} role="img" aria-label={`${r.chain}. ${words}.`} data-route={r.id}>
      {items}
    </div>
  );
}

/* ---------- the recommendation ---------- */

function Hero({ r, label, phone, busy, onGo }: { r: RouteView; label: string; phone: boolean; busy: boolean; onGo: () => void }) {
  const [explain, setExplain] = useState(false);
  return (
    <section className="wy-hero" aria-labelledby="wy-hero-t">
      <div className="wy-hero-top">
        <div className="wy-hero-main">
          <span className="wy-eyebrow">{label}</span>
          <h2 className="wy-title" id="wy-hero-t">
            {r.title}
          </h2>
          <p className="wy-why">{r.why}</p>
        </div>
        <dl className="wy-facts">
          <div>
            <dt>Est. success</dt>
            <dd className="wy-est-n num">{r.est}%</dd>
          </div>
          <div>
            <dt>In between</dt>
            <dd>{betweenWords(r.between)}</dd>
          </div>
          <div>
            <dt>Time to a meeting</dt>
            <dd>{r.time}</dd>
          </div>
        </dl>
      </div>
      {/* Keyed by the route so a new pick draws again from You. */}
      <RouteDraw key={r.id} r={r} vertical={phone} />
      <ol className="wy-how" aria-label="What happens">
        {r.how.map((h, k) => (
          <li key={k}>
            <span className="wy-num num" aria-hidden>
              {k + 1}
            </span>
            <span>{h}</span>
          </li>
        ))}
      </ol>
      <div className="wy-acts">
        <button type="button" className="btn btn-pine btn-lg" onClick={onGo} disabled={busy} aria-busy={busy}>
          Go with {r.short}
        </button>
        <button type="button" className="btn btn-lg" aria-expanded={explain} onClick={() => setExplain(!explain)}>
          How Merlin estimates this
        </button>
        <span className="wy-small">Nothing is sent until you press send.</span>
      </div>
      {explain && <p className="wy-explain">{WAY_EXPLAIN}</p>}
    </section>
  );
}
const WAY_EXPLAIN = "Merlin's estimate from how well each person knows the next, how many hand-offs it takes, and whether the last person decides. It gets sharper as members record what worked.";

function Cards({ routes, picked, onPick }: { routes: RouteView[]; picked: string; onPick: (id: string) => void }) {
  return (
    <div className="wy-cards">
      {routes.map((r, k) => (
        <button key={r.id} type="button" className="wy-card" aria-pressed={r.id === picked} onClick={() => onPick(r.id)} data-card={r.id}>
          <span className="wy-card-top">
            <span className="wy-badge">{estWords(r.est)}</span>
            {k === 0 ? <span className="wy-tag">Recommended</span> : null}
          </span>
          <span className="wy-card-short">{r.short}</span>
          <span className="wy-card-chain">{r.chain}</span>
          <span className="wy-card-rows">
            <span>
              In between <strong>{betweenWords(r.between)}</strong>
            </span>
            <span>
              Time to a meeting <strong>{r.time}</strong>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function OtherRows({ routes, onPick }: { routes: RouteView[]; onPick: (id: string) => void }) {
  return (
    <>
      {routes.map((r) => (
        <button key={r.id} type="button" className="wy-other" onClick={() => onPick(r.id)} data-card={r.id}>
          <span className="wy-other-main">
            <span className="wy-badge">{estWords(r.est)}</span>
            <span className="wy-card-short">{r.short}</span>
            <span className="wy-small">
              {betweenWords(r.between)} in between · {r.time}
            </span>
          </span>
          <span aria-hidden className="wy-muted">
            ›
          </span>
        </button>
      ))}
    </>
  );
}

/* ---------- the plan ---------- */

function NoteBox({ note, edit, value, onEdit, title = "Drafted for you" }: { note: RouteNote; edit: boolean; value: string; onEdit: (v: string) => void; title?: string }) {
  return (
    <div className="wy-note">
      <span className="wy-note-h">
        {title} · to {note.to}
      </span>
      {edit ? <textarea aria-label={`The note to ${note.to}`} value={value} onChange={(e) => onEdit(e.target.value)} /> : <span className="wy-note-b">{value}</span>}
    </div>
  );
}

interface StepDo {
  /** Run an answer at this step. */
  answer: (op: StepOp) => Promise<void>;
  busy: boolean;
}

/** The step the member is on: its words, the drafted note and the buttons. */
function NowStep({ v, st, plan, i, run }: { v: WayInView; st: RouteStepView; plan: PlanView; i: CoInfo | null; run: StepDo }) {
  const ui = useUi();
  const copy = useCopy();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(st.note?.body ?? "");
  const [nudgeText, setNudgeText] = useState(st.nudge?.body ?? "");
  useEffect(() => {
    setText(st.note?.body ?? "");
    setNudgeText(st.nudge?.body ?? "");
    setEdit(false);
  }, [st.n, st.note?.body, st.nudge?.body]);
  const company = v.name ?? "";
  const sendNote = async (n: RouteNote, body: string, then: StepOp) => {
    const a = st.act;
    if (a?.kind === "message") {
      // Message on Merlin: the member's click sends the note they read (and edited) here.
      const r = await ui.act(a.conversation ? { type: "message.send", conversationId: a.conversation, text: body.trim() } : { type: "message.connect", memberId: a.member, text: body.trim() }, { quiet: true });
      if (!r.ok) return;
    } else {
      window.open(gmailLink(n.email, n.subject, body), "_blank", "noopener");
    }
    await run.answer(then);
  };
  const primary = async () => {
    if (st.kind === "ask") {
      if (st.note) return sendNote(st.note, text, "sent");
      return run.answer("sent");
    }
    if (st.kind === "wait") return run.answer("intro");
    return run.answer("booked");
  };
  const invite = st.kind === "ask" && st.act?.kind === "invite" ? i?.engs.find((e) => e.id === (st.act as { seat: string }).seat) : undefined;
  return (
    <div className="wy-step-more">
      <span className="wy-step-detail">{st.detail}</span>
      {st.note && st.kind === "ask" ? <NoteBox note={st.note} edit={edit} value={text} onEdit={setText} /> : null}
      {plan.nudge && st.nudge ? (
        <>
          <span className="wy-nudged" role="status">
            Got it. Merlin drafted a short nudge for you to send on {shortDay(plan.nudge)}, and reminds you then.
          </span>
          <NoteBox note={st.nudge} edit={edit} value={nudgeText} onEdit={setNudgeText} title="Your nudge" />
        </>
      ) : null}
      <div className="wy-step-acts">
        {/* Approve and send (lib/send, RN_SEND): the note goes from the member's Gmail, then the step is done as if they pressed it. */}
        {st.kind === "ask" && st.note && st.act?.kind !== "message" && !invite?.invite && !(plan.nudge && st.nudge) ? (
          <SendLaunch
            className="btn btn-pine btn-lg"
            title={`A note to ${st.note.to}`}
            d={() => ({
              key: draftKey(`way:${v.id}:${st.n}`, st.note!.email, st.note!.subject, text),
              kind: "intro",
              to: st.note!.email,
              toName: st.note!.to,
              subject: st.note!.subject,
              body: text,
              company: v.id,
              effect: { type: "pipeline.sent", companyId: v.id, from: "network", channel: "intro" },
            })}
            onSent={() => void run.answer("sent")}
          />
        ) : null}
        {plan.nudge && st.nudge ? (
          <SendLaunch
            className="btn btn-pine btn-lg"
            title={`A nudge to ${st.nudge.to}`}
            label="Approve and send the nudge"
            d={() => ({
              key: draftKey(`way:${v.id}:${st.n}:nudge`, st.nudge!.email, st.nudge!.subject, nudgeText),
              kind: "followup",
              to: st.nudge!.email,
              toName: st.nudge!.to,
              subject: st.nudge!.subject,
              body: nudgeText,
              company: v.id,
              followUp: true,
            })}
            onSent={() => void run.answer("nudged")}
          />
        ) : null}
        {invite?.invite ? (
          <>
            <InviteConnect e={invite} name={st.act!.first} company={company} />
            <button type="button" className="btn btn-lg" disabled={run.busy} onClick={() => void run.answer("sent")}>
              I sent the invite
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-pine btn-lg" disabled={run.busy} aria-busy={run.busy} onClick={() => void primary()}>
            {st.primary}
          </button>
        )}
        {plan.nudge && st.nudge ? (
          <button type="button" className="btn btn-lg" disabled={run.busy} onClick={() => void sendNote(st.nudge!, nudgeText, "nudged")}>
            Send the nudge
          </button>
        ) : st.alt === "No reply yet" ? (
          <button type="button" className="btn btn-lg" disabled={run.busy} onClick={() => void run.answer("noreply")}>
            No reply yet
          </button>
        ) : st.alt === "Edit the note" && st.note ? (
          <button type="button" className="btn btn-lg" aria-pressed={edit} onClick={() => setEdit(!edit)}>
            {edit ? "Done editing" : "Edit the note"}
          </button>
        ) : st.alt === "Open in Gmail" ? (
          <a className="btn btn-lg" href={gmailLink(null, `Time to meet: ${company}`, "")} target="_blank" rel="noreferrer">
            Open in Gmail
          </a>
        ) : null}
        {st.note && st.kind === "ask" && st.act?.kind !== "message" ? (
          <button type="button" className="btn btn-ghost btn-lg" onClick={() => void copy(text, "Note copied.").then(() => toast("Copied. Paste it where you write to them."))}>
            Copy
          </button>
        ) : null}
        {st.cant ? (
          <button type="button" className="wy-cant" disabled={run.busy} onClick={() => void run.answer("cant")}>
            {st.cant}
          </button>
        ) : null}
      </div>
    </div>
  );
}

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDay = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${SHORT[Number(m[2]) - 1]} ${Number(m[3])}` : d;
};

function stepState(n: number, plan: PlanView): NodeState {
  return plan.done || n < plan.step ? "done" : n === plan.step ? "now" : "next";
}

function PlanSteps({ v, plan, phone, i, run }: { v: WayInView; plan: PlanView; phone: boolean; i: CoInfo | null; run: StepDo }) {
  const r = plan.current!;
  if (phone)
    return (
      <ol className="wy-rail" aria-label="Your plan, step by step">
        {r.steps.map((st) => {
          const s = stepState(st.n, plan);
          const last = st.n === r.steps.length;
          return (
            <li key={st.n} className={cx(`wy-rail-${s}`, `wy-step-${s}`)} data-step={st.n} data-state={s}>
              <span className="wy-rail-l">
                <span className={cx("wy-mark num", s === "now" && "rn-pulse")}>{s === "done" ? "✓" : st.n}</span>
                {!last && <span className={cx("wy-rail-bar", s === "now" && "rn-flowy")} />}
              </span>
              <div className="wy-rail-body">
                <span className="wy-step-who">
                  <span className="wy-status">{s === "done" ? "Done" : s === "now" ? "Now" : "Next"}</span>
                  {st.who}
                </span>
                <span className="wy-step-t">{st.title}</span>
                {s === "now" && <NowStep v={v} st={st} plan={plan} i={i} run={run} />}
              </div>
            </li>
          );
        })}
      </ol>
    );
  return (
    <ol className="wy-steps" aria-label="Your plan, step by step">
      {r.steps.map((st) => {
        const s = stepState(st.n, plan);
        return (
          <li key={st.n} className={cx("wy-step", `wy-step-${s}`)} data-step={st.n} data-state={s}>
            <span className="wy-mark num" aria-hidden>
              {s === "done" ? "✓" : st.n}
            </span>
            <div className="wy-step-body">
              <span className="wy-step-who">
                <span className="wy-status">{s === "done" ? "Done" : s === "now" ? "Now" : "Next"}</span>
                {st.who}
              </span>
              <span className="wy-step-t">{st.title}</span>
              {s === "now" && <NowStep v={v} st={st} plan={plan} i={i} run={run} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Decision({ plan, onSwitch, onDrop, phone }: { plan: PlanView; onSwitch: () => void; onDrop: () => void; phone: boolean }) {
  return (
    <div className="wy-side" data-decision>
      <span className="wy-side-h">Your decision</span>
      <span className="wy-side-t">{plan.decision}</span>
      {plan.because ? <span className="wy-side-b">{plan.because}</span> : null}
      <div className="wy-side-split">
        <span className="wy-side-h">If it stalls</span>
        <span className="wy-side-b">{plan.planB ?? "Pick another route, or ask a peer who knows them."}</span>
      </div>
      <div className="wy-step-acts">
        {phone ? (
          <button type="button" className="btn" onClick={onSwitch}>
            Switch route
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={onDrop}>
          Drop this plan
        </button>
      </div>
    </div>
  );
}

function Log({ plan }: { plan: PlanView }) {
  return (
    <div className="wy-side" data-log>
      <span className="wy-side-h">What&apos;s happened</span>
      <ol className="wy-log">
        {plan.log.map((l, k) => (
          <li key={k}>
            <span className="wy-log-when">{l.when}</span>
            <span className="wy-log-what">{l.what}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------- the page ---------- */

/** The body of Your way into a company, for a view in hand (the page fetches it; the checks pass one). */
export function WayInBody({
  v,
  phone,
  i,
  mode,
  pickedId,
  onPick,
  onMode,
  onAct,
  busy,
  onBack,
}: {
  v: WayInView;
  phone: boolean;
  i: CoInfo | null;
  /** "choose": the recommendation and the routes to compare; "plan": the plan. */
  mode: "choose" | "plan";
  pickedId: string | null;
  onPick: (id: string) => void;
  onMode: (m: "choose" | "plan") => void;
  onAct: (op: WayDo) => Promise<void>;
  busy: boolean;
  onBack?: () => void;
}) {
  const ui = useUi();
  const name = v.name ?? "this company";
  const back = onBack ? { label: "Where you can get in", onClick: onBack } : undefined;
  const chips = (
    <div className="wy-chips">
      {v.decider ? <Chip>{v.decider}</Chip> : null}
      {v.hired ? <Chip>{v.hired}</Chip> : null}
      {v.openRole ? <Chip tone="ember">{v.openRole}</Chip> : null}
      {v.locked && v.facts ? <Chip>{v.facts}</Chip> : null}
    </div>
  );
  if (v.locked)
    return (
      <div className="wy" data-way={v.id}>
        <PageHead title="Your way into this company" lead="It's locked for you, so it's said by its facts until you open it." back={back} />
        {chips}
        <ol className="wy-steps">
          <li className="wy-step wy-step-now" data-step="open">
            <span className="wy-mark num">1</span>
            <div className="wy-step-body">
              <span className="wy-step-who">
                <span className="wy-status">Now</span>Your move
              </span>
              <span className="wy-step-t">Open this company to see your routes</span>
              <div className="wy-step-more">
                <span className="wy-step-detail">Opening it shows its name, who decides and the people who can get you in. Nothing is spent until you press Unlock.</span>
                <div className="wy-step-acts">
                  <UnlockCompany id={v.id} rate={false} roles={!!v.openRole} />
                </div>
              </div>
            </div>
          </li>
        </ol>
      </div>
    );
  const routes = v.routes;
  const plan = v.plan;
  const picked = routes.find((r) => r.id === (pickedId ?? (plan?.switchedWhy ? plan.route : null))) ?? routes[0] ?? null;
  if (!routes.length && !plan)
    return (
      <div className="wy" data-way={v.id}>
        <PageHead title={`Your way into ${name}`} back={back} />
        {chips}
        <EmptyState
          spot="noResults"
          title="No way in yet"
          action={{ label: v.following ? "Following" : `Follow ${name} for new routes`, onClick: () => void ui.act({ type: "follow", companyId: v.id, on: true } as never) }}
        >
          Nobody you know leads there yet.{" "}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => ui.openPage("network")}>
            Bring in who you know
          </button>{" "}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => ui.openPage("peers")}>
            Ask a fellow fractional
          </button>
        </EmptyState>
      </div>
    );

  if (mode === "plan" && plan?.current) {
    const r = plan.current;
    const t = r.nodes[r.nodes.length - 1];
    const tFirst = t.locked ? lc(t.label) : t.label.split(" ")[0];
    const title = r.between === 0 ? `${name}, writing to ${tFirst}` : `${name}, through ${r.nodes[1].label}`;
    const now = r.steps[Math.min(plan.step, plan.steps) - 1];
    const run: StepDo = { busy, answer: (op) => onAct({ do: "step", step: plan.step, answer: op }) };
    return (
      <div className="wy" data-way={v.id} data-mode="plan">
        <PageHead
          title={title}
          lead={plan.done ? `All ${plan.steps} steps done` : `Step ${plan.step} of ${plan.steps} · ${now?.title ?? ""}`}
          back={back}
          actions={
            phone ? undefined : (
              <button type="button" className="btn" onClick={() => onMode("choose")}>
                Switch route
              </button>
            )
          }
        />
        <section className="wy-progress" aria-label="Where your plan is">
          <RouteDraw r={r} vertical={phone} plan={{ step: plan.step, done: plan.done }} />
        </section>
        {plan.done && (
          <section className="wy-done" aria-label="Done">
            <span>
              <span className="wy-done-t">Meeting with {tFirst} booked</span>
              <br />
              <span className="wy-done-l">Your pipeline moves to Meeting when it&apos;s on your calendar. Next: the proposal.</span>
            </span>
            <button type="button" className="btn btn-lg" onClick={() => ui.openPage("proposals")}>
              Start the proposal
            </button>
          </section>
        )}
        <div className="wy-board">
          <div className="wy-steps-wrap" style={{ flex: "999 1 520px", minWidth: 0 }}>
            <PlanSteps v={v} plan={plan} phone={phone} i={i} run={run} />
          </div>
          <aside className="wy-aside" aria-label="Your decision and what has happened">
            <Decision plan={plan} onSwitch={() => onMode("choose")} onDrop={() => void onAct({ do: "drop" }).then(() => onMode("choose"))} phone={phone} />
            <Log plan={plan} />
          </aside>
        </div>
      </div>
    );
  }

  if (!picked) return null;
  const first = picked.id === routes[0]?.id;
  const others = routes.filter((r) => r.id !== picked.id);
  return (
    <div className="wy" data-way={v.id} data-mode="choose">
      <PageHead title={`Your way into ${name}`} back={back} />
      {chips}
      {plan?.switchedWhy ? (
        <div className="wy-banner" role="status">
          {plan.switchedWhy}
        </div>
      ) : plan && !plan.switchedWhy ? (
        <div className="wy-banner">
          You&apos;re on {plan.decision.split(" · ")[0]}.{" "}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onMode("plan")}>
            Back to your plan
          </button>
        </div>
      ) : null}
      <Hero r={picked} label={plan?.switchedWhy ? "Plan B" : first ? "Merlin recommends" : "Your pick"} phone={phone} busy={busy} onGo={() => void onAct({ do: "go", route: picked.id })} />
      <section className="wy-compare" aria-labelledby="wy-compare-h">
        <div className="wy-compare-h">
          <h2 className="wy-h2" id="wy-compare-h">
            {phone ? "Other routes" : "Compare the routes"}
          </h2>
          {!phone && <span className="wy-small">Pick one to see it above.</span>}
        </div>
        {phone ? <OtherRows routes={others} onPick={onPick} /> : <Cards routes={routes} picked={picked.id} onPick={onPick} />}
        <div className="wy-foot">
          {v.hidden ? <span>{v.hidden === 1 ? "1 weaker route hidden." : `${v.hidden} weaker routes hidden.`}</span> : null}
          {v.peers ? (
            <button type="button" className="btn btn-ghost" onClick={() => ui.openPage("peers")}>
              Ask {v.peers === 1 ? "a peer" : `${v.peers} peers`} who serve companies like this
            </button>
          ) : null}
          {!v.following ? (
            <button type="button" className="btn btn-ghost" onClick={() => void ui.act({ type: "follow", companyId: v.id, on: true } as never)}>
              Follow {name} for new routes
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

/** Your way into a company: fetches the view, keeps the pick, goes with a route and answers its steps. */
export function WayInPage({ company, phone, infos, onBack }: { company: string; phone: boolean; infos: CoInfo[]; onBack: () => void }) {
  const ui = useUi();
  const toast = useToast();
  const w = useWayIn(company);
  const [picked, setPicked] = useState<string | null>(null);
  const [mode, setMode] = useState<"choose" | "plan" | null>(null);
  const [busy, setBusy] = useState(false);
  const hidden = ui.isHidden(company);
  // Opened with the usual unlock: the routes come once the company is open.
  useEffect(() => {
    if (!hidden && w.data?.locked) void w.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);
  const i = useMemo(() => infos.find((x) => x.c.id === company) ?? null, [infos, company]);
  const v = w.data;
  const shownMode = mode ?? (v?.plan?.current && !v.plan.switchedWhy ? "plan" : "choose");
  const onAct = async (op: WayDo) => {
    setBusy(true);
    const r = await wayPost(company, op);
    setBusy(false);
    if (r.error) return void toast(r.error);
    if (r.view) w.set(r.view);
    if (r.message) toast(r.message);
    const p = r.view?.plan;
    if (op.do === "go") setMode("plan");
    else if (p?.switchedWhy) {
      // Plan B was picked for the member: back to the routes, plan B above them.
      setPicked(p.route);
      setMode("choose");
    }
  };
  return (
    <div className="page-wide">
      {!v ? (
        w.failed ? (
          <EmptyState spot="offline" title="Your routes didn't load" action={{ label: "Try again", onClick: () => void w.reload() }}>
            Check your connection and try again.
          </EmptyState>
        ) : w.off ? (
          <EmptyState spot="noResults" title="Your way in isn't on yet" action={{ label: "Back", onClick: onBack }}>
            It comes with Your network.
          </EmptyState>
        ) : (
          <p className="wy-small" role="status">
            Finding your routes…
          </p>
        )
      ) : (
        <WayInBody v={v} phone={phone} i={i} mode={shownMode} pickedId={picked} onPick={setPicked} onMode={setMode} onAct={onAct} busy={busy} onBack={onBack} />
      )}
    </div>
  );
}

/* ---------- Where you can get in ---------- */

const W = 760;
const H = 460;
const LABELS_MAX = 14;
const dotR = (fit: 1 | 2 | 3) => (fit === 3 ? 13 : fit === 2 ? 10 : 7);
const rowName = (r: GetInRow) => r.name ?? `A locked company, ${r.facts || "facts on its record"}`;
const dotLabel = (r: GetInRow) => `${rowName(r)}, ${ZONE_WORDS[r.zone].title}${r.best !== null ? `, ${estWords(r.best).toLowerCase()}` : ", no route yet"}, hiring odds ${r.odds}${r.hiringNow ? ", hiring now" : ""}`;

function GetInMap({ rows, focus, onFocus, onOpen }: { rows: GetInRow[]; focus: string | null; onFocus: (id: string) => void; onOpen: (id: string) => void }) {
  // Labels that fit: the one in focus first, then best first, never over another label, a dot or a zone's title.
  type Side = "l" | "r" | "t" | "b";
  const labelled = new Map<string, Side>();
  {
    const boxes: [number, number, number, number][] = [
      [0, 0, 150, 34],
      [W - 110, 0, W, 34],
      [0, H - 34, 90, H],
      [W - 120, H - 34, W, H],
    ];
    const dots = rows.map((r) => ({ x: (r.x / 100) * W, y: H - (r.y / 100) * H, rr: dotR(r.fit) + 5 }));
    const hits = (b: [number, number, number, number]) =>
      boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) || dots.some((d) => b[0] < d.x + d.rr && b[2] > d.x - d.rr && b[1] < d.y + d.rr && b[3] > d.y - d.rr);
    const order = [...rows].sort((a, b) => Number(b.id === focus) - Number(a.id === focus));
    for (const r of order.slice(0, LABELS_MAX + 1)) {
      const x = (r.x / 100) * W;
      const y = H - (r.y / 100) * H;
      const rr = dotR(r.fit);
      const w = (r.name ?? "Locked company").length * 6.2 + 4;
      const sides: Side[] = r.x > 70 ? ["l", "r", "b", "t"] : ["r", "l", "b", "t"];
      for (const side of sides) {
        const b: [number, number, number, number] =
          side === "l" ? [x - rr - 8 - w, y - 9, x - rr - 6, y + 9] : side === "r" ? [x + rr + 6, y - 9, x + rr + 8 + w, y + 9] : side === "b" ? [x - w / 2, y + rr + 6, x + w / 2, y + rr + 22] : [x - w / 2, y - rr - 22, x + w / 2, y - rr - 6];
        if (b[0] < 2 || b[2] > W - 2) continue;
        // A dot's own circle is under its label's edge: only the others count.
        const own = dots.findIndex((d) => d.x === x && d.y === y);
        const saved = own >= 0 ? dots.splice(own, 1)[0] : null;
        const ok = !hits(b);
        if (saved) dots.splice(own, 0, saved);
        if (ok) {
          boxes.push(b);
          labelled.set(r.id, side);
          break;
        }
      }
    }
  }
  return (
    <div className="gi-plot">
      <span className="gi-yaxis" aria-hidden>
        <span>How likely they hire soon</span>
      </span>
      <div className="gi-plot-main">
        <svg className="gi-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Companies by your best way in and how likely they hire soon">
          <rect x={0} y={0} width={W / 2} height={H / 2} className="gi-q gi-q-find" />
          <rect x={W / 2} y={0} width={W / 2} height={H / 2} className="gi-q gi-q-go" />
          <rect x={0} y={H / 2} width={W / 2} height={H / 2} className="gi-q gi-q-watch" />
          <rect x={W / 2} y={H / 2} width={W / 2} height={H / 2} className="gi-q gi-q-warm" />
          <line x1={W / 2} y1={0} x2={W / 2} y2={H} className="gi-mid" />
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} className="gi-mid" />
          <text x={W - 14} y={24} textAnchor="end" className="gi-zt gi-zt-go">
            Go now
          </text>
          <text x={14} y={24} className="gi-zt">
            Find a way in
          </text>
          <text x={W - 14} y={H - 14} textAnchor="end" className="gi-zt">
            Keep warm
          </text>
          <text x={14} y={H - 14} className="gi-zt gi-zt-watch">
            Watch
          </text>
          {rows.map((r) => {
            const x = (r.x / 100) * W;
            const y = H - (r.y / 100) * H;
            const rr = dotR(r.fit);
            const on = r.id === focus;
            const side = labelled.get(r.id) ?? "r";
            return (
              <g
                key={r.id}
                className={cx("gi-dot", `gi-dot-${r.zone}`, on && "on")}
                role="button"
                tabIndex={0}
                aria-label={dotLabel(r)}
                data-dot={r.id}
                onClick={() => onOpen(r.id)}
                onMouseEnter={() => onFocus(r.id)}
                onFocus={() => onFocus(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(r.id);
                  }
                }}
              >
                <title>{rowName(r)}</title>
                {on && <circle cx={x} cy={y} r={rr + 8} className="gi-halo" />}
                {r.hiringNow && <circle cx={x} cy={y} r={rr + 4.5} className="gi-hiring" />}
                <circle cx={x} cy={y} r={rr} className="gi-c" />
                <circle cx={x} cy={y} r={Math.max(rr + 8, 22)} className="gi-hit" />
                {labelled.has(r.id) && (
                  <text
                    x={side === "l" ? x - rr - 8 : side === "r" ? x + rr + 8 : x}
                    y={side === "b" ? y + rr + 18 : side === "t" ? y - rr - 10 : y + 4}
                    textAnchor={side === "l" ? "end" : side === "r" ? "start" : "middle"}
                    className={cx("gi-label", on && "on")}
                  >
                    {r.name ?? "Locked company"}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="gi-xaxis" aria-hidden>
          <span>No route</span>
          <span>Cold</span>
          <span className="gi-xaxis-t">Your best way in, by Est. success</span>
          <span>Warm</span>
          <span>85%</span>
        </div>
      </div>
    </div>
  );
}

function Segs({ n, of }: { n: number; of: number }) {
  return (
    <span className="gi-segs" aria-hidden>
      {Array.from({ length: of }, (_, k) => (
        <span key={k} className={k < n ? "on" : ""} />
      ))}
    </span>
  );
}

function ListRow({ r, info, open }: { r: GetInRow; info: CoInfo | undefined; open: (id: string) => void }) {
  const odds = r.odds === "High" ? 3 : r.odds === "Medium" ? 2 : 1;
  return (
    <button type="button" className="gi-row" onClick={() => open(r.id)} data-row={r.id} aria-label={`${dotLabel(r)}. Open your way in.`}>
      <span className="gi-row-top">
        <CompanyLogo name={r.name ?? ""} domain={r.name ? info?.c.iconDomain ?? info?.domain ?? null : null} hidden={!r.name} seed={r.id} />
        <span className="gi-row-main">
          <span className="gi-row-n">{rowName(r)}</span>
          <span className="gi-row-v">{r.locked ? "Open it to see your routes" : r.via ?? "No route yet"}</span>
        </span>
        {r.plan ? <Chip tone="pine">Your plan</Chip> : r.hiringNow ? <Chip>Hiring</Chip> : null}
      </span>
      <span className="gi-row-meta">
        <span>
          Way in: <strong>{r.best === null ? "None yet" : `${r.best}%`}</strong>
          <Segs n={r.best === null ? 0 : Math.max(1, Math.round(r.best / 85 * 4))} of={4} />
        </span>
        <span>
          Hiring odds: <strong>{r.odds}</strong>
          <Segs n={odds} of={3} />
        </span>
      </span>
    </button>
  );
}

function GetInList({ rows, byId, open, counts }: { rows: GetInRow[]; byId: Map<string, CoInfo>; open: (id: string) => void; counts: Record<Zone, number> }) {
  return (
    <div className="gi-list" aria-label="Companies by zone">
      {ZONES.map((z) => {
        const list = rows.filter((r) => r.zone === z);
        if (!list.length) return null;
        return (
          <section key={z} className="gi-group" aria-labelledby={`gi-g-${z}`}>
            <h2 className="wy-h2" id={`gi-g-${z}`}>
              {ZONE_WORDS[z].title} <span className="wy-muted">· {counts[z]}</span>
            </h2>
            <p className="wy-small" style={{ margin: "-4px 0 2px" }}>
              {ZONE_WORDS[z].hint}
            </p>
            {list.map((r) => (
              <ListRow key={r.id} r={r} info={byId.get(r.id)} open={open} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function Panel({ r, info, open, openCompany }: { r: GetInRow; info: CoInfo | undefined; open: (id: string) => void; openCompany: (id: string) => void }) {
  return (
    <aside className="gi-panel" aria-label="The company in focus" data-panel={r.id}>
      <div className="gi-panel-co">
        <CompanyLogo name={r.name ?? ""} domain={r.name ? info?.c.iconDomain ?? info?.domain ?? null : null} hidden={!r.name} seed={r.id} />
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span className="gi-panel-n">{rowName(r)}</span>
          <span className="wy-small">{[r.name ? r.facts : null, ...r.tags].filter(Boolean).join(" · ")}</span>
        </span>
      </div>
      <div className="wy-chips" style={{ marginTop: 0 }}>
        <Chip tone={r.zone === "go" ? "pine" : r.zone === "warm" ? "mint" : "outline"}>{ZONE_WORDS[r.zone].title}</Chip>
        <Chip>Hiring odds: {r.odds}</Chip>
        {r.hiringNow ? <Chip tone="ember">Open role</Chip> : null}
      </div>
      {r.why ? (
        <div className="gi-panel-why">
          <strong>Why now.</strong> {r.why}
        </div>
      ) : null}
      <div className="wx-route">
        <span className="wy-badge">{r.best === null ? "No route yet" : estWords(r.best)}</span>
        <span className="wy-card-chain">{r.locked ? "Open this company to see your routes." : r.via ?? "Nobody you know leads there yet."}</span>
      </div>
      <div className="wy-step-acts">
        <button type="button" className="btn btn-pine" onClick={() => open(r.id)}>
          {r.plan ? "Open your plan" : "See your way in"}
        </button>
        <button type="button" className="btn" onClick={() => openCompany(r.id)}>
          Open the record
        </button>
      </div>
    </aside>
  );
}

/** Where you can get in, for a view in hand (the page fetches it; the checks pass one). */
export function GetInBody({ view, infos, phone, openCompany }: { view: GetInView; infos: CoInfo[]; phone: boolean; openCompany: (id: string) => void }) {
  const ui = useUi();
  const byId = useMemo(() => new Map(infos.map((i) => [i.c.id, i])), [infos]);
  const [filter, setFilter] = useState<"all" | "ball" | string>("all");
  const [listView, setListView] = useState(false);
  const rows = view.rows.filter((r) => (filter === "all" ? true : filter === "ball" ? r.tags.includes("In your Crystal Ball") : r.tags.includes(`Saved view: ${filter}`)));
  const [focus, setFocus] = useState<string | null>(null);
  const focused = rows.find((r) => r.id === focus) ?? rows[0] ?? null;
  const chip = (key: string, label: string) => (
    <button key={key} type="button" className={cx("chip", filter === key && "chip-on")} aria-pressed={filter === key} onClick={() => setFilter(key)}>
      {label}
    </button>
  );
  return (
    <div className="wy" data-getin>
      <PageHead
        title="Where you can get in"
        lead={`The companies that fit your profile, placed by how good your best way in is and how likely they are to hire a fractional ${view.fn ?? "leader"} soon.`}
        art={phone ? undefined : <Prop name="trailWinding" height={72} on="bg" />}
      />
      <div className="gi-filters" role="group" aria-label="Which companies">
        {chip("all", `All fits · ${view.total}`)}
        {view.ball ? chip("ball", `Crystal Ball · ${view.ball}`) : null}
        {view.views.map((x) => chip(x.name, `Saved view: ${x.name} · ${x.n}`))}
      </div>
      {lockedWaysWords(view.lockedWays ?? 0) && (
        <p className="nw-muted gi-locked" role="note">
          {lockedWaysWords(view.lockedWays ?? 0)} Each one names its company and the person once it is open.
        </p>
      )}
      {!view.rows.length ? (
        <EmptyState spot="noResults" title="No companies fit yet">
          They show here, by your best way in, once Merlin knows what fits you.{" "}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => ui.openPage("radar" as never)}>
            Open your Crystal Ball
          </button>{" "}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => ui.openPage("network")}>
            Bring in who you know
          </button>
        </EmptyState>
      ) : (
        <>
          <div className="gi-stats">
            {ZONES.map((z) => (
              <div key={z} className="gi-stat">
                <span className="gi-stat-t">{ZONE_WORDS[z].title}</span>
                {/* The dots on the map, and how many fit in all when the map shows fewer. */}
                <span className="gi-stat-n num">{view.counts[z]}</span>
                {view.countsAll && view.countsAll[z] > view.counts[z] ? <span className="gi-stat-h">of {view.countsAll[z]} that fit</span> : null}
                <span className="gi-stat-h">{ZONE_WORDS[z].hint}</span>
              </div>
            ))}
          </div>
          {!phone && (
            <div className="gi-view" role="group" aria-label="View" style={{ maxWidth: 260 }}>
              <button type="button" aria-pressed={!listView} onClick={() => setListView(false)}>
                Map
              </button>
              <button type="button" aria-pressed={listView} onClick={() => setListView(true)}>
                List
              </button>
            </div>
          )}
          {phone || listView ? (
            <GetInList rows={rows} byId={byId} open={openWay} counts={view.counts} />
          ) : (
            <div className="gi-body">
              <section className="gi-mapcard" aria-label="The map">
                <div className="gi-legend">
                  <span>
                    <span className="gi-legend-dot" aria-hidden /> Bigger dot, better fit
                  </span>
                  <span>
                    <span className="gi-legend-ring" aria-hidden /> Hiring now
                  </span>
                  <span className="gi-legend-tap">Pick a company to see your way in</span>
                </div>
                <GetInMap rows={rows} focus={focused?.id ?? null} onFocus={setFocus} onOpen={openWay} />
              </section>
              {focused && <Panel r={focused} info={byId.get(focused.id)} open={openWay} openCompany={openCompany} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function GetInPage({ infos, phone, openCompany }: { infos: CoInfo[]; phone: boolean; openCompany: (id: string) => void }) {
  const g = useGetIn();
  return (
    <div className="page-wide">
      {g.data ? (
        <GetInBody view={g.data} infos={infos} phone={phone} openCompany={openCompany} />
      ) : g.failed ? (
        <EmptyState spot="offline" title="The map didn't load" action={{ label: "Try again", onClick: () => void g.reload() }}>
          Check your connection and try again.
        </EmptyState>
      ) : g.off ? (
        <EmptyState spot="noResults" title="Where you can get in isn't on yet">
          It comes with Your network.
        </EmptyState>
      ) : (
        <p className="wy-small" role="status">
          Placing your companies…
        </p>
      )}
    </div>
  );
}

/* ---------- Home's move ---------- */

function Track({ p }: { p: PlanLine }) {
  return (
    <div className="wm-track" aria-hidden>
      <span className="wm-track-dot you" />
      {p.marks.map((m, k) => (
        <span key={k} style={{ display: "contents" }}>
          <span className={cx("wm-track-line", m !== "next" && "done")} />
          <span className={cx("wm-track-dot", m, k === p.marks.length - 1 && "last")} />
        </span>
      ))}
    </div>
  );
}

/** One plan as Home's move, for a plan in hand. */
export function RouteMoveCard({ p, onAnswer, busy }: { p: PlanLine; onAnswer: (op: StepOp) => void; busy: boolean }) {
  const st = p.now;
  const waiting = st?.kind === "wait";
  const who = st?.who.replace(/^Waiting on /, "") ?? "";
  return (
    <article className="card wm" aria-labelledby={`wm-${p.company}`} data-move={p.company}>
      <span className="wm-top">
        <span className="wm-step">{p.done ? "Done" : `Step ${p.step} of ${p.steps}`}</span>
        <span>
          {p.name} · {p.short}
        </span>
      </span>
      <span className="wm-t" id={`wm-${p.company}`}>
        {p.move}
      </span>
      <span className="wm-l">{p.line}</span>
      <Track p={p} />
      <div className="wm-acts">
        {waiting && p.nudgeDue && st?.nudge ? (
          <a className="btn btn-pine" href={gmailLink(st.nudge.email, st.nudge.subject, st.nudge.body)} target="_blank" rel="noreferrer" onClick={() => onAnswer("nudged")}>
            Send the nudge
          </a>
        ) : (
          <button type="button" className="btn btn-pine" onClick={() => openWay(p.company)}>
            {p.done ? "See how you got in" : "Open the plan"}
          </button>
        )}
        {waiting ? (
          <button type="button" className="btn" disabled={busy} onClick={() => onAnswer("intro")}>
            {who} replied
          </button>
        ) : null}
      </div>
    </article>
  );
}

/** Home: today's move on the member's way in, the plan most in need of them. Nothing without a plan. */
export function RouteMove() {
  const plans = usePlans();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const p = plans?.find((x) => !x.done) ?? null;
  if (!p) return null;
  const onAnswer = async (op: StepOp) => {
    setBusy(true);
    const r = await wayPost(p.company, { do: "step", step: p.step, answer: op });
    setBusy(false);
    if (r.error) toast(r.error);
    else if (r.message) toast(r.message);
  };
  return (
    <section className="hm-sec" aria-label="Your way in, today's move">
      <RouteMoveCard p={p} onAnswer={(op) => void onAnswer(op)} busy={busy} />
    </section>
  );
}

/* ---------- the pipeline card ---------- */

/** The deal card's route line, for a plan in hand. */
export function RouteLineBox({ p }: { p: PlanLine }) {
  return (
    <button type="button" className="wl-route" onClick={() => openWay(p.company)} aria-label={`Route ${p.via}. ${p.since}. Open the plan.`} data-route-line={p.company} style={{ border: 0, textAlign: "left", font: "inherit", cursor: "pointer", minHeight: 44 }}>
      <span className="wl-route-t">
        <strong>Route:</strong> {p.via}
      </span>
      <span className="wl-bars" aria-hidden>
        {Array.from({ length: p.steps }, (_, k) => (
          <span key={k} className={p.done || k + 1 < p.step ? "done" : k + 1 === p.step ? "now" : ""} />
        ))}
      </span>
      <span className="wl-route-s">{p.since}</span>
      <span className="wl-route-n">{p.next}</span>
    </button>
  );
}

/** The pipeline card's route line: the route the member went with there, and its step. */
export function RouteLine({ company }: { company: string }) {
  const plans = usePlans();
  const p = plans?.find((x) => x.company === company);
  return p ? <RouteLineBox p={p} /> : null;
}

/* ---------- the record ---------- */

/** Your ways in, for a view in hand: the plan first when there is one, else the recommended route; the others folded. */
export function RecordWaysBody({ v }: { v: WayInView }) {
  const [open, setOpen] = useState(false);
  if (v.locked || (!v.routes.length && !v.plan)) return null;
  const plan = v.plan?.current ? v.plan : null;
  const lead = plan?.current ?? v.routes[0];
  const others = v.routes.filter((r) => r.id !== lead.id);
  return (
    <section className="tp-dsec" aria-labelledby="wx-h" data-record-ways>
      <h3 className="tp-dsec-h" id="wx-h">
        Your ways in
      </h3>
      {plan ? (
        <article className="wx-plan">
          <span className="wx-plan-h">Your plan · {lead.short}</span>
          <ol className="wx-steps">
            {lead.steps.map((st) => {
              const s = stepState(st.n, plan);
              return (
                <li key={st.n} className={s} data-state={s}>
                  <span className="wx-mark num" aria-hidden>
                    {s === "done" ? "✓" : st.n}
                  </span>
                  <span>
                    {st.title}
                    <span className="sr-only">, {s === "done" ? "done" : s === "now" ? "now" : "next"}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="wx-acts">
            <button type="button" className="btn btn-pine" onClick={() => openWay(v.id)}>
              Open the plan
            </button>
            <button type="button" className="btn" onClick={() => openWay(v.id)}>
              Switch route
            </button>
          </div>
        </article>
      ) : (
        <article className="wx-route">
          <span className="wy-card-top">
            <span className="wy-badge">{estWords(lead.est)}</span>
            <span className="wy-tag">Merlin recommends</span>
          </span>
          <span className="wy-card-short">{lead.short}</span>
          <span className="wy-card-chain">{lead.chain}</span>
          <div className="wx-acts">
            <button type="button" className="btn btn-pine" onClick={() => openWay(v.id)}>
              See your way in
            </button>
          </div>
        </article>
      )}
      {others.length ? (
        <>
          <button type="button" className="nw-link" aria-expanded={open} onClick={() => setOpen(!open)} style={{ minHeight: 44 }}>
            {others.length === 1 ? "1 other route" : `${others.length} other routes`}
          </button>
          {open &&
            others.map((r) => (
              <button key={r.id} type="button" className="wy-other" onClick={() => openWay(v.id)}>
                <span className="wy-other-main">
                  <span className="wy-badge">{estWords(r.est)}</span>
                  <span className="wy-card-short">{r.short}</span>
                  <span className="wy-small">{r.chain}</span>
                </span>
              </button>
            ))}
        </>
      ) : null}
    </section>
  );
}

/** The record's Your ways in. `fallback` (Smart ways in) shows while there is no route to lead with. */
export function RecordWays({ i, fallback }: { i: CoInfo; fallback?: ReactNode }) {
  const w = useWayIn(i.c.hidden ? null : i.c.id);
  if (!w.data || w.data.locked || (!w.data.routes.length && !w.data.plan)) return <>{fallback ?? null}</>;
  return <RecordWaysBody v={w.data} />;
}
