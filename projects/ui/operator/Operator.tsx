import { useEffect, useState } from "react";
import type { Operator, Project, State } from "../../lib/types";
import { CATEGORIES, buyerById, completeness, displayName, operatorById } from "../../lib/data";
import {
  DECLINE_REASONS,
  acceptsResponses,
  allOpenRoles,
  askQuestion,
  bookTime,
  companyRevealed,
  confirmAvailability,
  declineProject,
  inPortal,
  inviteOf,
  alertOf,
  nowOf,
  operatorPortal,
  operatorRateLine,
  operatorStatus,
  opState,
  projectById,
  projectCompanyLine,
  projectFit,
  questionsFor,
  replyToBuyer,
  respondBlockedMessage,
  responseFit,
  responseOf,
  saveDraftResponse,
  setAlertPrefs,
  submitResponse,
  useSession,
  useStore,
  viewProjectAsOperator,
  withdrawResponse,
  type PortalItem,
} from "../../lib/store";
import { ago, hoursRange, isoDay, plural, rateLabel, shortDate } from "../../lib/format";
import { Link, navigate, useLocation } from "../../lib/router";
import { Arrow, Availability, Back, Band, Check, Empty, FieldError, FitParts, FitScore, FitWhy, Gap, Notice, attempt } from "../common";

function useMe(): { s: State; op: Operator } {
  const s = useStore();
  const sess = useSession();
  return { s, op: operatorById(sess.operatorId)! };
}

function sourceLabel(src: PortalItem["source"]) {
  return src === "invite" ? "Invited by buyer" : src === "rn_suggested" ? "Suggested by Revenue Nomad" : src === "admin" ? "Invited by Revenue Nomad" : src === "alert" ? "Open role alert" : "Open role";
}

// ---------------------------------------------------------------- O2

export function OperatorPortal() {
  const { s, op } = useMe();
  const portal = operatorPortal(s, op.id);
  const st = opState(s, op.id);
  const comp = completeness(op);
  return (
    <div className="page">
      <Band title="Your projects" sub="Everything you were invited to or responded to, in one place." eyebrow={`Signed in as ${displayName(op)}`} />
      <div className="split">
        <div className="stack">
          <PortalSection title="Invited, waiting on you" items={portal.invited} testId="sec-invited" s={s} op={op} cta="Respond" />
          <PortalSection title="Responded" items={portal.responded} testId="sec-responded" s={s} op={op} cta="Status" />
          <PortalSection title="Closed" items={portal.closed} testId="sec-closed" s={s} op={op} cta="View" muted />
        </div>
        <aside className="stack">
          <section className="card" data-testid="availability-card">
            <h3 className="mini-h">Your availability</h3>
            <p className="big-line">
              {st.availability === "unavailable" ? "Not available" : "Open"}, {st.hoursPerMonth ?? op.hrs} hrs a month
            </p>
            <p>
              <Availability s={s} op={op} />
            </p>
            <p className="small muted">Open operators show up in buyer searches and get invites.</p>
            <Link to="/operator/availability" className="btn btn-sm">
              Update
            </Link>
          </section>
          <section className="card" data-testid="open-roles-card">
            <h3 className="mini-h">Open roles for you</h3>
            <p className="big-line">
              <b data-testid="open-roles-count">{portal.openRoles.length}</b> open {portal.openRoles.length === 1 ? "project matches" : "projects match"} your alert settings
            </p>
            <p className="small muted">You were not invited, but you can respond to any of them.</p>
            <Link to="/operator/roles" className="btn btn-sm">
              Browse open roles
            </Link>
          </section>
          <section className="card">
            <h3 className="mini-h">Profile strength</h3>
            <p className="big-line" data-testid="profile-strength">
              {comp.pct}%
            </p>
            <div className="meter" aria-hidden="true">
              <i style={{ width: `${comp.pct}%` }} />
            </div>
            {comp.missing.length > 0 && <p className="small muted">Add {comp.missing.slice(0, 2).join(" and ")}. Complete profiles score higher on fit, and buyers sort by fit.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function PortalSection({ title, items, testId, s, op, cta, muted }: { title: string; items: PortalItem[]; testId: string; s: State; op: Operator; cta: string; muted?: boolean }) {
  return (
    <section className="card" data-testid={testId} aria-labelledby={`${testId}-h`}>
      <div className="card-head">
        <h2 id={`${testId}-h`}>{title}</h2>
        <span className="head-meta">{items.length}</span>
      </div>
      {!items.length && <p className="muted">Nothing here.</p>}
      <ul className="portal-list">
        {items.map((it) => (
          <li key={it.project.id}>
            <Link to={`/operator/projects/${it.project.id}`} className={`portal-item ${muted ? "muted-item" : ""}`} data-testid="portal-item" data-project={it.project.id}>
              <div className="grow">
                <div className="row">
                  <span className={`src ${it.source === "rn_suggested" ? "src-rn" : ""}`}>{sourceLabel(it.source)}</span>
                  {it.status && <span className="pill pill-tint" data-testid="op-status">{it.status}</span>}
                  {it.project.status === "paused" && <span className="pill pill-muted">Paused</span>}
                </div>
                <b className="portal-title">{it.project.title}</b>
                <span className="muted small">
                  {projectCompanyLine(s, it.project, op.id)} · {hoursRange(it.project.hoursPerMonthMin, it.project.hoursPerMonthMax)} hrs a month · Start {shortDate(it.project.startTarget)}
                  {it.sub ? ` · ${it.sub}` : ""}
                </span>
              </div>
              <FitScore fit={it.fit} size="sm" />
              <span className="link-strong">
                {cta} <Arrow />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- Open roles

export function OperatorRoles() {
  const { s, op } = useMe();
  const [all, setAll] = useState(false);
  const portal = operatorPortal(s, op.id);
  const list: Project[] = all ? allOpenRoles(s).filter((p) => !inPortal(s, p.id, op.id)) : portal.openRoles.map((x) => x.project);
  return (
    <div className="page">
      <Band title="Open roles" sub="Projects open to every operator. You were not invited, but you can respond. Responding moves it into your projects." />
      <label className="toggle-inline">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show every open role, not only ones matching my alert settings
      </label>
      {!list.length && <Empty>No open roles match right now.</Empty>}
      <ul className="stack">
        {list.map((p) => {
          const f = projectFit(p, op);
          return (
            <li key={p.id}>
              <Link to={`/operator/projects/${p.id}`} className="card portal-item" data-testid="open-role" data-project={p.id}>
                <div className="grow">
                  <span className="src">{alertOf(s, p.id, op.id) ? "Open role alert" : "Open role"}</span>
                  <b className="portal-title">{p.title}</b>
                  <span className="muted small">
                    {projectCompanyLine(s, p, op.id)} · {hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax)} hrs a month · {p.term} · Start {shortDate(p.startTarget)}
                  </span>
                </div>
                <FitScore fit={f} size="sm" />
                <span className="link-strong">
                  See the role <Arrow />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- O3 / O4

export function OperatorProject({ id }: { id: string }) {
  const { s, op } = useMe();
  const p = projectById(s, id);
  useEffect(() => {
    if (p && p.status !== "draft") viewProjectAsOperator(id, op.id);
  }, [id, op.id, p?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p || p.status === "draft")
    return (
      <div className="page">
        <Empty>This project is not available.</Empty>
      </div>
    );
  const inv = inviteOf(s, id, op.id);
  const al = alertOf(s, id, op.id);
  const openToAll = p.visibility === "invites_plus_open";
  if (!inv && !openToAll && !responseOf(s, id, op.id))
    return (
      <div className="page">
        <Empty>This project is invite only, and you were not invited.</Empty>
      </div>
    );
  const r = responseOf(s, id, op.id);
  const submitted = !!(r && r.submittedAt && !r.draft);
  const fit = submitted && r!.interest === "interested" ? responseFit(p, r!) : projectFit(p, op);
  const src = inv ? (inv.source === "buyer" ? "Invited by buyer" : inv.source === "rn_suggested" ? "Suggested by Revenue Nomad" : "Invited by Revenue Nomad") : al ? "Open role alert" : "Open role";
  const status = operatorStatus(s, p, op.id);
  const revealed = companyRevealed(s, p, op.id);
  const rateLine = operatorRateLine(p);
  return (
    <div className="page">
      <Link to="/operator/projects" className="back">
        <Back /> Projects
      </Link>
      <Band
        eyebrow={
          <>
            <span className="band-tag" data-testid="op-source">
              {src}
            </span>
            <span className="band-tag">Posted {shortDate(p.postedAt)}</span>
            {status && (
              <span className="band-tag band-tag-strong" data-testid="op-project-status">
                {status}
              </span>
            )}
            {!inPortal(s, id, op.id) && (
              <span className="band-tag" data-testid="not-in-portal">
                Not in your projects until you respond
              </span>
            )}
          </>
        }
        title={
          <>
            {p.title}
            {revealed && p.hideCompanyUntilIntro ? <span data-testid="company-revealed"> at {p.origin === "buyer" ? buyerById(p.ownerBuyerId)?.company : p.clientName}</span> : null}
          </>
        }
        sub={revealed ? (p.hideCompanyUntilIntro ? "Company name revealed when they requested an intro" : p.companyDescriptor) : `${p.companyDescriptor} · name shared if they request an intro`}
        right={
          <div className="band-fit">
            <FitScore fit={fit} size="lg" />
            <small>Your fit</small>
          </div>
        }
      />
      <div className="split">
        <div className="stack">
          {submitted ? <StatusView s={s} p={p} op={op} /> : <RespondForm s={s} p={p} op={op} />}
          <QuestionsBox s={s} p={p} op={op} />
        </div>
        <aside className="stack">
          <section className="card">
            <h3 className="mini-h">The engagement</h3>
            <dl className="facts">
              <div>
                <dt>Hours</dt>
                <dd>{hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax)} / mo</dd>
              </div>
              <div>
                <dt>Term</dt>
                <dd>{p.term}</dd>
              </div>
              <div>
                <dt>Start</dt>
                <dd>{shortDate(p.startTarget)}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{p.location}</dd>
              </div>
              {rateLine && (
                <div>
                  <dt>Rate to you</dt>
                  <dd data-testid="rate-to-you">{rateLine}</dd>
                </div>
              )}
            </dl>
            <h3 className="mini-h">Success in 90 days</h3>
            <p>{p.successIn90Days}</p>
            <div className="chips">
              {p.mustHaves.map((m) => (
                <span key={m} className="chip chip-v">
                  {m}
                </span>
              ))}
            </div>
          </section>
          <section className="card">
            <h3 className="mini-h">Why you {fit.tier === "strong" ? "are a strong fit" : fit.tier === "possible" ? "could fit" : "may not fit"}</h3>
            <FitWhy fit={fit} />
            <FitParts fit={fit} noRate={(submitted ? r!.rate : op.rate) == null} />
            <p className="small muted">Screening answers are not scored yet. The four parts above are the whole score.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function RespondForm({ s, p, op }: { s: State; p: Project; op: Operator }) {
  const r = responseOf(s, p.id, op.id);
  const [mode, setMode] = useState<"interested" | "pass">("interested");
  const [rate, setRate] = useState<string>(r?.rate != null ? String(r.rate) : op.rate != null ? String(op.rate) : "");
  const [hours, setHours] = useState<string>(r?.hoursPerMonth != null ? String(r.hoursPerMonth) : String(Math.min(op.hrs || 0, p.hoursPerMonthMax) || ""));
  const [start, setStart] = useState<string>(r?.canStart || p.startTarget);
  const [answers, setAnswers] = useState<string[]>(p.screeningQuestions.map((_q, i) => r?.answers?.[i] || ""));
  const [note, setNote] = useState(r?.note || "");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const blocked = respondBlockedMessage(p);
  const hrsNum = Number(hours);
  const overHours = hours !== "" && hrsNum > (op.hrs || 0);
  const input = () => ({
    rate: rate.trim() === "" ? null : Number(rate.replace(/[$,]/g, "")),
    hoursPerMonth: hours.trim() === "" ? null : Number(hours),
    canStart: start || null,
    answers,
    note,
  });
  if (blocked)
    return (
      <section className="card" data-testid="respond-blocked">
        <h2>Your response</h2>
        <Notice tone="warn">{blocked}</Notice>
        <button type="button" className="btn primary" disabled>
          I'm interested
        </button>
      </section>
    );
  return (
    <section className="card form-card" aria-labelledby="resp-h" data-testid="respond-form">
      <h2 id="resp-h">Your response</h2>
      {r?.draft && <p className="muted small" data-testid="draft-note">Draft saved {ago(r.updatedAt, nowOf(s))}. The buyer never sees a draft.</p>}
      <div className="seg seg-lg" role="group" aria-label="Your response">
        <button type="button" aria-pressed={mode === "interested"} onClick={() => setMode("interested")} data-testid="mode-interested">
          I'm interested
        </button>
        <button type="button" aria-pressed={mode === "pass"} onClick={() => setMode("pass")} data-testid="mode-pass">
          Not for me
        </button>
      </div>
      {err && <Notice tone="error" testId="respond-error">{err.msg}</Notice>}
      {saved && <Notice tone="ok">{saved}</Notice>}
      {mode === "interested" ? (
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            attempt(
              () => {
                const res = submitResponse(p.id, op.id, input());
                navigate(`/operator/projects/${p.id}${res.warning ? "?warn=hours" : ""}`, { replace: true });
              },
              (msg, field) => setErr({ msg, field }),
            );
          }}
        >
          <div className="grid-fields g3">
            <label className="field">
              <span>Your rate, $ per hour{op.rate == null ? " (required, your profile has no rate)" : ""}</span>
              <input inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="200" aria-invalid={err?.field === "rate"} data-testid="r-rate" required />
              <FieldError msg={err?.field === "rate" ? err.msg : undefined} />
              {p.origin === "revenue_nomad" && <small className="muted">This seat pays {operatorRateLine(p)}.</small>}
            </label>
            <label className="field">
              <span>Hours / mo</span>
              <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} aria-invalid={err?.field === "hours"} data-testid="r-hours" />
              <FieldError msg={err?.field === "hours" ? err.msg : undefined} />
            </label>
            <label className="field">
              <span>Can start</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={err?.field === "canStart"} data-testid="r-start" />
              <FieldError msg={err?.field === "canStart" ? err.msg : undefined} />
            </label>
          </div>
          {overHours && (
            <Notice tone="warn" testId="hours-warning">
              {hrsNum} hrs a month is more than the {op.hrs} on your profile. That's fine, the fit score will use {hrsNum}.
            </Notice>
          )}
          {p.screeningQuestions.map((q, i) => (
            <label key={i} className="field">
              <span>
                {i + 1}. {q}
              </span>
              <textarea rows={3} value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} aria-invalid={err?.field === `answer-${i}`} data-testid={`r-answer-${i}`} />
              <FieldError msg={err?.field === `answer-${i}` ? err.msg : undefined} />
            </label>
          ))}
          <label className="field">
            <span>Note to the buyer, optional</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="r-note" />
          </label>
          <div className="actions-row">
            <button
              type="button"
              className="btn"
              data-testid="save-draft"
              onClick={() => attempt(() => (saveDraftResponse(p.id, op.id, input()), setSaved("Draft saved. The buyer never sees a draft.")), (msg) => setErr({ msg }))}
            >
              Save draft
            </button>
            <button type="submit" className="btn primary" data-testid="submit-response">
              Submit response
            </button>
          </div>
          <p className="small muted">You can save and finish later. The buyer never sees a draft.</p>
        </form>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            attempt(() => (declineProject(p.id, op.id, reason), navigate("/operator/projects")), (msg, field) => setErr({ msg, field }));
          }}
        >
          <fieldset className="field">
            <legend>What made it a pass? Only Revenue Nomad sees this.</legend>
            <div className="chips" role="radiogroup" aria-label="Reason">
              {DECLINE_REASONS.map((x) => (
                <label key={x} className={`chip chip-radio ${reason === x ? "chip-v" : ""}`}>
                  <input type="radio" name="reason" value={x} checked={reason === x} onChange={() => setReason(x)} />
                  {x}
                </label>
              ))}
            </div>
            <FieldError msg={err?.field === "reason" ? err.msg : undefined} />
          </fieldset>
          <div className="actions-row">
            <button type="submit" className="btn primary" data-testid="pass-project">
              Pass on this project
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

const SLOTS = ["Tue, 10:00 am ET", "Wed, 1:30 pm ET", "Thu, 4:00 pm ET"];

function StatusView({ s, p, op }: { s: State; p: Project; op: Operator }) {
  const r = responseOf(s, p.id, op.id)!;
  const status = operatorStatus(s, p, op.id);
  const { query } = useLocation();
  const [booked, setBooked] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  if (r.interest === "declined" || r.withdrawn)
    return (
      <section className="card" data-testid="status-view">
        <h2>You passed on this project</h2>
        <p className="muted">Reason: {r.declineReason}. The buyer never sees a response from you.</p>
      </section>
    );
  const buyer = buyerById(p.ownerBuyerId);
  const steps: { key: string; label: string; sub: string; done: boolean }[] =
    p.origin === "buyer"
      ? [
          { key: "Responded", label: "Responded", sub: shortDate(r.submittedAt), done: true },
          { key: "Buyer viewed", label: "Buyer viewed", sub: r.viewedAt ? shortDate(r.viewedAt) : "Not yet", done: !!r.viewedAt },
          { key: "Intro requested", label: "Intro requested", sub: r.decision === "intro_requested" || r.decision === "selected" ? shortDate(r.decisionAt) : "Not yet", done: r.decision === "intro_requested" || r.decision === "selected" },
          { key: "Selected", label: status === "Closed" ? "Closed" : "Selected", sub: status === "Selected" ? shortDate(p.staffedAt) : status === "Closed" ? "Went another direction" : "Not yet", done: status === "Selected" || status === "Closed" },
        ]
      : [
          { key: "Responded", label: "Responded", sub: shortDate(r.submittedAt), done: true },
          { key: "Under review", label: "Revenue Nomad review", sub: status === "Under review" || status === "Selected" ? "Shared with the client" : "Not yet", done: status === "Under review" || status === "Selected" },
          { key: "Selected", label: status === "Closed" ? "Closed" : "Selected", sub: status === "Selected" ? shortDate(p.staffedAt) : status === "Closed" ? "Went another direction" : "Not yet", done: status === "Selected" || status === "Closed" },
        ];
  const introOn = p.origin === "buyer" && (r.decision === "intro_requested" || r.decision === "selected");
  return (
    <>
      {query.get("warn") === "hours" && (
        <Notice tone="warn" testId="hours-warning">
          You offered {r.hoursPerMonth} hrs a month, more than the {op.hrs} on your profile. The fit score uses {r.hoursPerMonth}.
        </Notice>
      )}
      <section className="card" data-testid="status-view">
        <div className="card-head">
          <h2>Status</h2>
          <span className="pill pill-tint" data-testid="status-now">
            {status}
          </span>
        </div>
        <ol className="timeline">
          {steps.map((st) => (
            <li key={st.key} className={st.done ? "done" : ""}>
              <span className="tl-mark" aria-hidden="true">
                {st.done ? <Check /> : null}
              </span>
              <b>{st.label}</b>
              <small>{st.sub}</small>
            </li>
          ))}
        </ol>
        {status === "Selected" && <Notice tone="ok">You were selected. Revenue Nomad will send the agreement next.</Notice>}
        {status === "Closed" && <Notice>The seat went another direction. Thanks for responding. You'll keep getting matched to new roles.</Notice>}
      </section>
      {introOn && buyer && (
        <section className="card intro-card" data-testid="intro-card">
          <h2>{buyer.company} wants to talk</h2>
          <div className="row">
            <span className="avatar initials" style={{ width: 40, height: 40, fontSize: 14 }}>
              {buyer.contactName
                .split(" ")
                .map((w) => w[0])
                .join("")}
            </span>
            <div>
              <b data-testid="buyer-contact">{buyer.contactName}</b>
              <p className="muted small">
                {buyer.contactTitle}, {buyer.company} · {buyer.email}
              </p>
            </div>
          </div>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <div className="actions-row">
            <div className="seg" role="group" aria-label="Book a time">
              {SLOTS.map((sl) => (
                <button
                  key={sl}
                  type="button"
                  aria-pressed={booked === sl}
                  onClick={() => attempt(() => (bookTime(p.id, op.id, sl), setBooked(sl), setMsg({ tone: "ok", text: `Booked ${sl}. ${buyer.contactName} got an email.` })), (m) => setMsg({ tone: "error", text: m }))}
                  data-testid="book-slot"
                >
                  Book {sl}
                </button>
              ))}
            </div>
            <button type="button" className="btn" onClick={() => setReplying(!replying)} aria-expanded={replying} data-testid="reply">
              Reply
            </button>
            {status !== "Selected" && (
              <button type="button" className="btn ghost" onClick={() => attempt(() => withdrawResponse(p.id, op.id), (m) => setMsg({ tone: "error", text: m }))}>
                Withdraw
              </button>
            )}
          </div>
          {replying && (
            <div className="inline-form">
              <label className="grow">
                <span className="sr-only">Reply to {buyer.contactName}</span>
                <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} aria-label={`Reply to ${buyer.contactName}`} data-testid="reply-text" />
              </label>
              <button
                type="button"
                className="btn primary btn-sm"
                data-testid="reply-send"
                onClick={() => attempt(() => (replyToBuyer(p.id, op.id, reply), setReply(""), setReplying(false), setMsg({ tone: "ok", text: `Reply sent to ${buyer.contactName}.` })), (m) => setMsg({ tone: "error", text: m }))}
              >
                Send reply
              </button>
            </div>
          )}
        </section>
      )}
      <section className="card">
        <h3 className="mini-h">What you sent</h3>
        <dl className="facts">
          <div>
            <dt>Rate</dt>
            <dd>{rateLabel(r.rate)}</dd>
          </div>
          <div>
            <dt>Hours</dt>
            <dd>{r.hoursPerMonth} a month</dd>
          </div>
          <div>
            <dt>Start</dt>
            <dd>{shortDate(r.canStart)}</dd>
          </div>
          <div>
            <dt>Answers</dt>
            <dd>
              {r.answers.filter((a) => a.trim()).length} of {p.screeningQuestions.length}
            </dd>
          </div>
        </dl>
        <p className="small muted">Responded, then Buyer viewed, then Intro requested, then Selected. If the buyer passes, you hear once the seat is staffed, not before.</p>
      </section>
    </>
  );
}

function QuestionsBox({ s, p, op }: { s: State; p: Project; op: Operator }) {
  const mine = questionsFor(s, p.id).filter((q) => q.operatorId === op.id);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  return (
    <section className="card" aria-labelledby="q-h" data-testid="op-questions">
      <h2 id="q-h">Question for the {p.origin === "buyer" ? "buyer" : "Revenue Nomad team"}</h2>
      <p className="small muted">Answers are shared with you only. Your name stays with the question.</p>
      {mine.map((q) => (
        <div key={q.id} className="q" data-testid="my-question">
          <p className="q-text">{q.text}</p>
          {q.answer ? (
            <p className="q-answer" data-testid="my-answer">
              <b>Answer</b> {q.answer}
            </p>
          ) : (
            <p className="muted small">Waiting for an answer.</p>
          )}
        </div>
      ))}
      {err && <Notice tone="error">{err}</Notice>}
      {sent && <Notice tone="ok">Question sent.</Notice>}
      <div className="inline-form">
        <label className="grow">
          <span className="sr-only">Your question</span>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your question" data-testid="ask-text" />
        </label>
        <button type="button" className="btn btn-sm" onClick={() => attempt(() => (askQuestion(p.id, op.id, text), setText(""), setSent(true), setErr(null)), setErr)} data-testid="ask-send">
          Ask a question
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- O5 availability + alert settings

export function OperatorAvailability() {
  const { s, op } = useMe();
  const { query } = useLocation();
  const st = opState(s, op.id);
  const [from, setFrom] = useState(st.availableFrom ? String(st.availableFrom).slice(0, 10) : isoDay(nowOf(s) + 14 * 86400000));
  const [hours, setHours] = useState(String(st.hoursPerMonth ?? op.hrs));
  const [msg, setMsg] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<string[]>(st.alertPrefs);
  const pulse = query.get("pulse");
  useEffect(() => {
    // One-tap pulse links from the outbox confirm straight away (phase one spec).
    if (pulse === "open" || pulse === "unavailable") {
      confirmAvailability(op.id, pulse);
      setMsg(pulse === "open" ? "Thanks. You're confirmed as open." : "Thanks. You're marked not available. You won't get role alerts until you change this.");
      navigate("/operator/availability", { replace: true });
    }
  }, [pulse, op.id]);
  return (
    <div className="page narrow">
      <Band title="Availability" sub="Buyers see when you last confirmed. One tap keeps it current." />
      {msg && <Notice tone="ok">{msg}</Notice>}
      <section className="card" data-testid="availability-page">
        <h2>Right now</h2>
        <p>
          <Availability s={s} op={op} />
        </p>
        <label className="field">
          <span>Hours a month you can give</span>
          <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
        <div className="actions-row">
          <button type="button" className="btn primary" onClick={() => (confirmAvailability(op.id, "open", { hours: Number(hours) || null }), setMsg("Confirmed as open."))} data-testid="confirm-open">
            I'm open now
          </button>
          <span className="row">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Open from" />
            <button type="button" className="btn" onClick={() => (confirmAvailability(op.id, "from", { from, hours: Number(hours) || null }), setMsg(`Confirmed as open from ${shortDate(from)}.`))}>
              Open from this date
            </button>
          </span>
          <button type="button" className="btn ghost" onClick={() => (confirmAvailability(op.id, "unavailable"), setMsg("Marked not available."))}>
            Not available
          </button>
        </div>
      </section>
      <section className="card" data-testid="alert-settings">
        <h2>Alert settings</h2>
        <p className="muted">You get a new role alert when an open project matches one of these. At most one alert a day, the rest roll into a digest.</p>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <label key={c} className={`chip chip-radio ${prefs.includes(c) ? "chip-v" : ""}`}>
              <input type="checkbox" checked={prefs.includes(c)} onChange={(e) => setPrefs(e.target.checked ? [...prefs, c] : prefs.filter((x) => x !== c))} />
              {c}
            </label>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => (setAlertPrefs(op.id, prefs), setMsg("Alert settings saved."))}>
          Save alert settings
        </button>
      </section>
    </div>
  );
}

export { Gap, plural };
