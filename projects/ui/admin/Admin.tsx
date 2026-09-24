import { useMemo, useState } from "react";
import type { Project, State } from "../../lib/types";
import { OPERATORS, buyerById, displayName, operatorById, stableSort } from "../../lib/data";
import {
  MAX_SUGGESTIONS,
  addSuggestion,
  alertsFor,
  declinesFor,
  inviteOf,
  invitesFor,
  isEnded,
  nowOf,
  nudgeBuyer,
  projectById,
  projectCounts,
  projectFit,
  projectFlags,
  responseFit,
  responseOf,
  responseSourceLabel,
  responsesFor,
  setAdminNote,
  setProjectStatus,
  simulateResponse,
  suggestionsUsed,
  useStore,
} from "../../lib/store";
import { ago, daysBetween, hoursRange, plural, rateLabel, shortDate, timeLabel } from "../../lib/format";
import { Link, useLocation } from "../../lib/router";
import { Arrow, Back, Band, CheckHours, Empty, FitScore, Notice, Stat, StatusPill, attempt } from "../common";
import { QuestionsInbox } from "../buyer/Buyer";

// ---------------------------------------------------------------- buyer project, admin view (A1)

export function AdminProject({ id }: { id: string }) {
  const s = useStore();
  const p = projectById(s, id);
  if (!p) return <Empty>That project does not exist.</Empty>;
  return <AdminBuyerProject s={s} p={p} />;
}

function Funnel({ s, p }: { s: State; p: Project }) {
  const c = projectCounts(s, p);
  return (
    <div className="kpis" data-testid="funnel">
      <Stat label="Invited" value={c.invited} testId="f-invited" />
      <Stat label="Alerted" value={c.alerted} testId="f-alerted" />
      <Stat label="Viewed project" value={c.viewed} testId="f-viewed" />
      <Stat label="Responded" value={c.responses} testId="f-responded" />
      <Stat label="Passed" value={c.declined} testId="f-declined" />
      <Stat label="Intros" value={c.intros} accent testId="f-intros" />
    </div>
  );
}

function ActivityLog({ s, p }: { s: State; p: Project }) {
  const LABEL: Record<string, string> = {
    project_created: "Draft created",
    project_posted: "Posted, live immediately",
    invite_sent: "Invite sent",
    invite_resent: "Invite resent",
    alert_sent: "Role alert sent",
    project_viewed: "Viewed the project",
    response_submitted: "Responded",
    response_declined: "Passed",
    response_withdrawn: "Withdrew",
    response_viewed: "Buyer viewed a response",
    intro_requested: "Intro requested, approved automatically",
    not_a_fit: "Marked not a fit",
    decision_undone: "Buyer undid a decision",
    selected: "Selected",
    project_staffed: "Project staffed",
    project_closed_unfilled: "Closed without a hire",
    close_email_sent: "Close email sent",
    question_asked: "Question asked",
    question_answered: "Question answered",
    paused: "Paused",
    resumed: "Resumed",
    closed_to_responses: "Closed to new responses",
    reopened: "Reopened to responses",
    nudge_sent: "Buyer nudged",
    suggestion_added: "Revenue Nomad suggestion added",
    suggestions_toggled: "Suggestions setting changed",
    visibility_widened: "Opened to all operators",
    stage_moved: "Pipeline stage moved",
    shortlist_sent: "Shortlist sent to client",
    intro_call_booked: "Intro call booked",
    operator_replied: "Operator replied",
  };
  const [all, setAll] = useState(false);
  const ev = s.events.filter((e) => e.projectId === p.id && e.type !== "alert_sent").reverse();
  const alerts = s.events.filter((e) => e.projectId === p.id && e.type === "alert_sent").length;
  const shown = all ? ev : ev.slice(0, 12);
  return (
    <section className="card" data-testid="activity">
      <h3 className="mini-h">Activity</h3>
      {alerts > 0 && <p className="small muted">{plural(alerts, "role alert")} sent, not listed one by one.</p>}
      <ol className="log">
        {shown.map((e) => {
          const op = e.operatorId ? operatorById(e.operatorId) : null;
          const meta = e.type === "response_declined" ? ` (${e.meta?.reason})` : e.type === "stage_moved" ? ` to ${e.meta?.to}` : e.type === "not_a_fit" ? ` (${e.meta?.reason})` : "";
          return (
            <li key={e.id} data-testid="log-item">
              <small>
                {shortDate(e.at)} {timeLabel(e.at)}
              </small>
              <span>
                {LABEL[e.type] || e.type}
                {op ? `, ${displayName(op)}` : ""}
                {meta} <span className="muted">by {e.actorName}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {ev.length > 12 && (
        <button type="button" className="btn ghost btn-sm" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${ev.length}`}
        </button>
      )}
    </section>
  );
}

const ACTION_LABEL: Record<string, string> = { none: "To review", intro_requested: "Intro requested", not_a_fit: "Not a fit", selected: "Selected" };

function AdminBuyerProject({ s, p }: { s: State; p: Project }) {
  const { query } = useLocation();
  const b = buyerById(p.ownerBuyerId)!;
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [nudge, setNudge] = useState("");
  const [showNudge, setShowNudge] = useState(false);
  const [note, setNote] = useState(p.adminNote || "");
  const [simOp, setSimOp] = useState("");
  const run = (fn: () => void, ok: string) => attempt(() => (fn(), setMsg({ tone: "ok", text: ok })), (m) => setMsg({ tone: "error", text: m }));
  const now = nowOf(s);
  const rows = responsesFor(s, p.id)
    .map((r) => ({ r, f: responseFit(p, r), op: operatorById(r.operatorId)! }))
    .sort((a, b2) => b2.f.fit - a.f.fit || (a.op.id < b2.op.id ? -1 : 1));
  const used = suggestionsUsed(s, p.id);
  const candidates = useMemo(
    () => stableSort(OPERATORS.filter((o) => !inviteOf(s, p.id, o.id)).map((o) => ({ id: o.id, o, f: projectFit(p, o) })), (x) => x.f.fit).slice(0, 8),
    [s, p],
  );
  const suggested = s.invites.filter((i) => i.projectId === p.id && i.source === "rn_suggested");
  const declines = declinesFor(s, p.id);
  const reachable = [...invitesFor(s, p.id).map((i) => i.operatorId), ...alertsFor(s, p.id).map((a) => a.operatorId)].filter((id, i, arr) => arr.indexOf(id) === i && !responseOf(s, p.id, id)?.submittedAt);
  return (
    <div className="page">
      <Link to="/admin/projects" className="back">
        <Back /> Projects
      </Link>
      <Band
        eyebrow={
          <>
            <span className="band-tag">Buyer posted</span> <span className="band-tag">{p.visibility === "invite_only" ? "Invite only" : "Invites + open to all"}</span> <StatusPill status={p.status} />
            {p.postedAt && <span className="band-tag">Day {daysBetween(p.postedAt, now) + 1}</span>}
          </>
        }
        title={p.title}
        sub={`${b.company} · ${b.contactName}, ${b.contactTitle} · Budget $${p.budgetMin}-$${p.budgetMax}/hr · Read only, the buyer runs this project`}
      >
        <div className="band-actions">
          <button type="button" className="btn band-ghost" onClick={() => setShowNudge(!showNudge)} data-testid="nudge-open">
            Nudge buyer
          </button>
          {!isEnded(p) && p.status !== "draft" && (
            <button
              type="button"
              className="btn band-ghost"
              data-testid="admin-pause"
              onClick={() => (p.status === "paused" ? run(() => setProjectStatus(p.id, "live", "admin"), "Resumed.") : run(() => setProjectStatus(p.id, "paused", "admin"), "Paused. Hidden from open roles."))}
            >
              {p.status === "paused" ? "Resume" : "Pause"}
            </button>
          )}
        </div>
      </Band>
      {msg && <Notice tone={msg.tone} testId="admin-msg">{msg.text}</Notice>}
      {showNudge && (
        <section className="card inline-form">
          <label className="grow">
            <span>Message to {b.contactName}</span>
            <textarea rows={2} value={nudge} onChange={(e) => setNudge(e.target.value)} placeholder="Optional. A default nudge suggests widening visibility or turning on suggestions." data-testid="nudge-text" />
          </label>
          <button type="button" className="btn primary btn-sm" onClick={() => (run(() => nudgeBuyer(p.id, nudge), `Nudge sent to ${b.contactName}.`), setShowNudge(false), setNudge(""))} data-testid="nudge-send">
            Send nudge
          </button>
        </section>
      )}
      {projectFlags(s, p).length > 0 && (
        <div className="row">
          {projectFlags(s, p).map((f) => (
            <span key={f} className="flag" data-testid="flag">
              {f}
            </span>
          ))}
        </div>
      )}
      <Funnel s={s} p={p} />
      <div className="split">
        <div className="stack">
          <section className="card" data-testid="admin-responses">
            <div className="card-head">
              <h2>Responses and buyer actions</h2>
              <span className="head-meta">Sorted by fit · read only</span>
            </div>
            {!rows.length && <p className="muted">No responses yet.</p>}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="num">Fit</th>
                    <th>Operator</th>
                    <th>Rate</th>
                    <th>Source</th>
                    <th>Buyer action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ r, f, op }) => (
                    <tr key={r.id} data-testid="admin-response-row">
                      <td className="num" data-label="Fit">
                        <FitScore fit={f} size="sm" />
                      </td>
                      <td data-label="Operator">
                        <Link to={`/operators/${op.slug}`}>{displayName(op)}</Link> <CheckHours op={op} />
                        {r.simulated && <span className="chip chip-warn">Simulated</span>}
                      </td>
                      <td data-label="Rate">{rateLabel(r.rate)}</td>
                      <td data-label="Source">{responseSourceLabel(s, r)}</td>
                      <td data-label="Buyer action" data-testid="buyer-action">
                        {ACTION_LABEL[r.decision]}
                        {r.notAFitReason ? `, ${r.notAFitReason}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">Revenue Nomad never screens or approves a buyer's responses. The buyer makes every decision here.</p>
          </section>
          {declines.length > 0 && (
            <section className="card" data-testid="decline-reasons">
              <h3 className="mini-h">Operators who passed</h3>
              <ul className="plain-ul">
                {declines.map((r) => (
                  <li key={r.id}>
                    {displayName(operatorById(r.operatorId)!)}: <b>{r.declineReason}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <QuestionsInbox s={s} p={p} role="admin" />
          <section className="card test-tool">
            <h3 className="mini-h">Test tool, simulate a response</h3>
            <p className="small muted">Clearly labeled prototype tool. Submits a response on an operator's behalf using their profile rate and hours. Real responses come from the operator flow.</p>
            <div className="inline-form">
              <select value={simOp} onChange={(e) => setSimOp(e.target.value)} aria-label="Operator to simulate" data-testid="sim-op">
                <option value="">Pick an invited or alerted operator ({reachable.length})</option>
                {reachable.map((id) => {
                  const o = operatorById(id)!;
                  return (
                    <option key={id} value={id}>
                      {displayName(o)}, fit {projectFit(p, o).fit}
                    </option>
                  );
                })}
              </select>
              <button type="button" className="btn btn-sm" disabled={!simOp} onClick={() => (run(() => simulateResponse(p.id, simOp), "Simulated response added."), setSimOp(""))} data-testid="sim-send">
                Simulate response
              </button>
            </div>
          </section>
        </div>
        <aside className="stack">
          <section className="card" data-testid="suggestions">
            <div className="card-head">
              <h3 className="mini-h">Revenue Nomad suggestions</h3>
              <span className="head-meta" data-testid="suggestions-used">
                {used} of {MAX_SUGGESTIONS} used
              </span>
            </div>
            {!p.wantsRnSuggestions ? (
              <p className="small muted">The buyer has not asked for suggestions. Revenue Nomad only suggests when the buyer turns it on.</p>
            ) : (
              <>
                <p className="small muted">The buyer turned suggestions on. Each one goes out as an invite labeled Suggested by Revenue Nomad.</p>
                {suggested.map((i) => (
                  <p key={i.id} className="row small">
                    <b>{displayName(operatorById(i.operatorId)!)}</b> <span className="pill pill-tint">Suggested</span>
                  </p>
                ))}
                <ul className="op-list compact">
                  {candidates.map(({ o, f }) => (
                    <li key={o.id} className="op-row">
                      <FitScore fit={f} size="sm" />
                      <div className="op-who">
                        <span>{displayName(o)}</span>
                        <small>
                          {o.role} · {rateLabel(o.rate)}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => run(() => addSuggestion(p.id, o.id), `Suggested ${displayName(o)}. Invite sent.`)}
                        data-testid="add-suggestion"
                        aria-label={`Suggest ${displayName(o)}`}
                      >
                        Suggest
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <ActivityLog s={s} p={p} />
          <section className="card note-card">
            <h3 className="mini-h">Internal note, admins only</h3>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Internal note" />
            <button type="button" className="btn btn-sm" onClick={() => (setAdminNote(p.id, note), setMsg({ tone: "ok", text: "Note saved." }))}>
              Save note
            </button>
          </section>
        </aside>
      </div>
      {query.get("tab") === "questions" && <span className="sr-only">Questions are listed above.</span>}
    </div>
  );
}

// ---------------------------------------------------------------- A3

export { ago, hoursRange, Arrow };
