import { useEffect, useMemo, useState } from "react";
import type { Project, RnStage, State } from "../../lib/types";
import { OPERATORS, buyerById, displayName, matchesQuery, operatorById, stableSort } from "../../lib/data";
import {
  MAX_SUGGESTIONS,
  STAGES,
  addSuggestion,
  alertsFor,
  createRnDraft,
  declinesFor,
  inviteOf,
  inviteOperator,
  invitesFor,
  isEnded,
  moveStage,
  nowOf,
  nudgeBuyer,
  pipelineOf,
  projectById,
  projectCounts,
  projectFit,
  projectFlags,
  publishRnProject,
  reports,
  responseFit,
  responseOf,
  responseSourceLabel,
  responsesFor,
  sendPulse,
  sendShortlist,
  setAdminNote,
  setPipelineNote,
  setProjectStatus,
  simulateResponse,
  suggestionsUsed,
  uninviteOperator,
  updateDraft,
  useStore,
  validateBrief,
  ownerName,
  type BriefErrors,
} from "../../lib/store";
import { ago, daysBetween, durationLabel, hoursRange, money, plural, rateLabel, shortDate, timeLabel } from "../../lib/format";
import { Link, navigate, useLocation } from "../../lib/router";
import { Arrow, Availability, Avatar, Back, Band, CheckHours, Completeness, Empty, FieldError, FitScore, Notice, Stat, StatusPill, attempt } from "../common";
import { BriefFields, LiveMatch, type BriefDraft } from "../BriefForm";
import { InvitePicker, QuestionsInbox, stripDraft } from "../buyer/Buyer";

// ---------------------------------------------------------------- A1

export function AdminProjects() {
  const s = useStore();
  const [tab, setTab] = useState<"all" | "buyer" | "revenue_nomad" | "attention">("all");
  const posted = s.projects.filter((p) => p.status !== "draft");
  const k = {
    live: s.projects.filter((p) => p.status === "live").length,
    invites: s.invites.length,
    alerts: s.alerts.length,
    responses: s.responses.filter((r) => r.submittedAt && !r.draft && r.interest === "interested" && !r.withdrawn).length,
    intros: s.intros.filter((i) => i.status === "approved").length,
    staffed: s.projects.filter((p) => p.status === "staffed").length,
  };
  const reached = new Set([...s.invites.map((i) => i.projectId + i.operatorId), ...s.alerts.map((a) => a.projectId + a.operatorId)]).size;
  const rate = reached ? Math.round((k.responses / reached) * 100) : 0;
  const rows = [...s.projects].sort((a, b) => (b.postedAt || b.updatedAt) - (a.postedAt || a.updatedAt));
  const shown = rows.filter((p) => (tab === "all" ? true : tab === "attention" ? projectFlags(s, p).length > 0 : p.origin === tab));
  const now = nowOf(s);
  return (
    <div className="page">
      <Band
        title="Projects"
        sub="Every project on the platform, buyer posted and Revenue Nomad originated."
        right={
          <button type="button" className="btn band-btn" onClick={() => navigate(`/admin/projects/${createRnDraft()}/setup`)} data-testid="new-rn-project">
            + New Revenue Nomad project
          </button>
        }
      />
      <div className="kpis" data-testid="kpis">
        <Stat label="Live projects" value={k.live} sub={`${posted.length} posted in total`} testId="kpi-live" />
        <Stat label="Invites sent" value={k.invites} testId="kpi-invites" />
        <Stat label="Alerts sent" value={k.alerts} testId="kpi-alerts" />
        <Stat label="Responses" value={k.responses} sub={`${rate}% of ${reached} reached`} testId="kpi-responses" />
        <Stat label="Intros requested" value={k.intros} testId="kpi-intros" />
        <Stat label="Staffed" value={k.staffed} testId="kpi-staffed" />
      </div>
      <div className="seg" role="group" aria-label="Filter">
        {(
          [
            ["all", "All"],
            ["buyer", "Buyer posted"],
            ["revenue_nomad", "Revenue Nomad"],
            ["attention", "Needs attention"],
          ] as const
        ).map(([key, l]) => (
          <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>
            {l} ({rows.filter((p) => (key === "all" ? true : key === "attention" ? projectFlags(s, p).length > 0 : p.origin === key)).length})
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="table" data-testid="admin-projects">
          <thead>
            <tr>
              <th>Project</th>
              <th>Origin</th>
              <th>Visibility</th>
              <th className="num">Invited</th>
              <th className="num">Responses</th>
              <th className="num">Strong</th>
              <th className="num">Intros</th>
              <th>Status</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const c = projectCounts(s, p);
              const flags = projectFlags(s, p);
              const href = p.origin === "revenue_nomad" && p.status === "draft" ? `/admin/projects/${p.id}/setup` : `/admin/projects/${p.id}`;
              return (
                <tr key={p.id} data-testid="admin-row" data-project={p.id}>
                  <td data-label="Project">
                    <Link to={href}>
                      <b>{p.title || "Untitled"}</b>
                    </Link>
                    <small className="muted block">
                      {ownerName(p)} · {p.postedAt ? `day ${daysBetween(p.postedAt, now) + 1}` : "not posted"}
                    </small>
                  </td>
                  <td data-label="Origin">{p.origin === "buyer" ? "Buyer" : "Revenue Nomad"}</td>
                  <td data-label="Visibility">{p.visibility === "invite_only" ? "Invite only" : "Invites + open"}</td>
                  <td data-label="Invited" className="num" data-testid="row-invited">
                    {c.invited}
                  </td>
                  <td data-label="Responses" className="num" data-testid="row-responses">
                    {c.responses}
                  </td>
                  <td data-label="Strong" className="num">
                    {c.strong}
                  </td>
                  <td data-label="Intros" className="num">
                    {c.intros}
                  </td>
                  <td data-label="Status">
                    <StatusPill status={p.status} />
                  </td>
                  <td data-label="Flag">
                    {flags.map((f) => (
                      <span key={f} className="flag" data-testid="flag">
                        {f}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!shown.length && <Empty>Nothing needs attention.</Empty>}
    </div>
  );
}

// ---------------------------------------------------------------- A2 / A4 dispatcher

export function AdminProject({ id }: { id: string }) {
  const s = useStore();
  const p = projectById(s, id);
  if (!p) return <Empty>That project does not exist.</Empty>;
  if (p.origin === "revenue_nomad") return p.status === "draft" ? <AdminRnSetup id={id} /> : <AdminPipeline s={s} p={p} />;
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

export function AdminRnSetup({ id }: { id: string }) {
  const s = useStore();
  const p = projectById(s, id);
  const [draft, setDraft] = useState<BriefDraft | null>(p ? { ...p } : null);
  const [errors, setErrors] = useState<BriefErrors>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (p && !draft) setDraft({ ...p });
  }, [p, draft]);
  if (!p || p.origin !== "revenue_nomad") return <Empty>That is not a Revenue Nomad project.</Empty>;
  if (p.status !== "draft") return <AdminPipeline s={s} p={p} />;
  if (!draft) return null;
  const set = (patch: Partial<Project>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (Object.keys(errors).length) setErrors(validateBrief(next));
  };
  const bill = draft.billRate ?? 0;
  const opr = draft.operatorRate ?? 0;
  const spread = bill - opr;
  const margin = bill ? Math.round((spread / bill) * 100) : 0;
  const midHours = Math.round(((Number(draft.hoursPerMonthMin) || 0) + (Number(draft.hoursPerMonthMax) || 0)) / 2);
  const invited = new Set(p.draftInvites || []);
  const publish = () => {
    const errs = validateBrief(draft);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setErr("Fix the highlighted fields to publish.");
      return;
    }
    updateDraft(id, stripDraft(draft), "admin");
    if (attempt(() => publishRnProject(id), setErr)) navigate(`/admin/projects/${id}`);
  };
  return (
    <div className="page">
      <Link to="/admin/projects" className="back">
        <Back /> Projects
      </Link>
      <h1 className="page-h">New Revenue Nomad project</h1>
      <p className="muted">For seats you source for your own clients. Same invites and fit scores as buyers get, plus client economics and your own pipeline.</p>
      {err && <Notice tone="error">{err}</Notice>}
      <div className="split">
        <div className="stack">
          <section className="card form-card">
            <h2>Client</h2>
            <label className="field">
              <span>Client, admins only</span>
              <input value={draft.clientName || ""} onChange={(e) => set({ clientName: e.target.value })} aria-invalid={!!errors.clientName} data-testid="rn-client" />
              <FieldError msg={errors.clientName} />
            </label>
            <label className="field">
              <span>What operators see</span>
              <input value={draft.companyDescriptor} onChange={(e) => set({ companyDescriptor: e.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={!!draft.revealClientOnShortlist} onChange={(e) => set({ revealClientOnShortlist: e.target.checked })} />
              Reveal client name to operators once shortlisted
            </label>
          </section>
          <BriefFields draft={draft} set={set} errors={errors} showBudget={false} />
          <section className="card form-card" data-testid="economics">
            <h2>Economics</h2>
            <div className="grid-fields">
              <label className="field">
                <span>Bill rate to client, $ per hour</span>
                <input type="number" value={draft.billRate ?? ""} onChange={(e) => set({ billRate: e.target.value === "" ? null : Number(e.target.value) })} aria-invalid={!!errors.billRate} data-testid="rn-bill" />
                <FieldError msg={errors.billRate} />
              </label>
              <label className="field">
                <span>Rate to operator, $ per hour</span>
                <input type="number" value={draft.operatorRate ?? ""} onChange={(e) => set({ operatorRate: e.target.value === "" ? null : Number(e.target.value) })} aria-invalid={!!errors.operatorRate} data-testid="rn-oprate" />
                <FieldError msg={errors.operatorRate} />
              </label>
            </div>
            <div className="stats">
              <Stat label="Spread" value={`$${spread}/hr`} testId="rn-spread" />
              <Stat label="Margin" value={`${margin}%`} testId="rn-margin" />
              <Stat label={`Per month at ${midHours} hrs`} value={money(spread * midHours)} testId="rn-month" />
            </div>
            <p className="small muted">Operators only ever see the rate to operator. The client only sees the bill rate.</p>
          </section>
          <section className="card">
            <h2>Visibility</h2>
            <div className="choice-grid" role="group" aria-label="Visibility">
              <button type="button" className="choice" aria-pressed={draft.visibility === "invite_only"} onClick={() => set({ visibility: "invite_only" })}>
                <b>Invite only</b>
                <span>Only operators you invite can see and respond.</span>
              </button>
              <button type="button" className="choice" aria-pressed={draft.visibility === "invites_plus_open"} onClick={() => set({ visibility: "invites_plus_open" })}>
                <b>Invites plus open to all</b>
                <span>Every other matching operator gets a new role alert.</span>
              </button>
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Invite operators</h2>
              <span className="head-meta" data-testid="invited-count">
                {invited.size} invited
              </span>
            </div>
            <p className="small muted">Search the full pool, any availability.</p>
            <InvitePicker s={s} p={{ ...p, ...draft }} invited={invited} onInvite={(op) => inviteOperator(id, op, "admin")} onUninvite={(op) => uninviteOperator(id, op, "admin")} />
          </section>
          <div className="actions-row">
            <span className="muted">Owner Matt Lopez</span>
            <button type="button" className="btn" onClick={() => (updateDraft(id, stripDraft(draft), "admin"), setErr(null), navigate("/admin/projects"))}>
              Save as draft
            </button>
            <button type="button" className="btn primary" onClick={publish} data-testid="rn-publish">
              Publish and send {plural(invited.size, "invite")}
            </button>
          </div>
        </div>
        <div className="stack">
          <LiveMatch s={s} draft={draft} rn />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- A4

function AdminPipeline({ s, p }: { s: State; p: Project }) {
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [inviting, setInviting] = useState(false);
  const run = (fn: () => void, ok: string) => attempt(() => (fn(), setMsg({ tone: "ok", text: ok })), (m) => setMsg({ tone: "error", text: m }));
  const entries = s.pipeline.filter((e) => e.projectId === p.id);
  const now = nowOf(s);
  const spread = (p.billRate ?? 0) - (p.operatorRate ?? 0);
  const margin = p.billRate ? Math.round((spread / p.billRate) * 100) : 0;
  const invited = new Set(invitesFor(s, p.id).map((i) => i.operatorId));
  const lastShortlist = [...s.shortlists].reverse().find((x) => x.projectId === p.id);
  return (
    <div className="page">
      <Link to="/admin/projects" className="back">
        <Back /> Projects
      </Link>
      <Band
        eyebrow={
          <>
            <span className="band-tag">Revenue Nomad</span> <span className="band-tag">{p.visibility === "invite_only" ? "Invite only" : "Invites + open"}</span>
            <span className="band-tag" data-testid="rn-econ">
              ${p.billRate} bill · ${p.operatorRate} to operator · {margin}%
            </span>
            <StatusPill status={p.status} />
          </>
        }
        title={p.title}
        sub={`${p.clientName} · Operators see ${p.companyDescriptor} · Day ${p.postedAt ? daysBetween(p.postedAt, now) + 1 : 0} · Owner Matt Lopez`}
      >
        {!isEnded(p) && (
          <div className="band-actions">
            <button type="button" className="btn band-ghost" onClick={() => setInviting(!inviting)} aria-expanded={inviting}>
              Invite more
            </button>
            <button type="button" className="btn band-btn" onClick={() => run(() => sendShortlist(p.id), "Shortlist sent to the client.")} data-testid="send-shortlist">
              Send shortlist to client
            </button>
          </div>
        )}
      </Band>
      {msg && <Notice tone={msg.tone} testId="admin-msg">{msg.text}</Notice>}
      {p.status === "staffed" && p.selectedOperatorId && (
        <Notice tone="ok" testId="staffed-banner">
          Staffed with {displayName(operatorById(p.selectedOperatorId)!)} on {shortDate(p.staffedAt)}. Everyone else who responded got one close email.
        </Notice>
      )}
      {lastShortlist && (
        <Notice>
          Last shortlist sent {shortDate(lastShortlist.sentAt)} with {plural(lastShortlist.operators.length, "operator")}. <Link to={`/client/projects/${p.id}`}>See what the client sees</Link>
        </Notice>
      )}
      {inviting && (
        <section className="card">
          <InvitePicker s={s} p={p} invited={invited} resend onInvite={(op) => run(() => inviteOperator(p.id, op, "admin"), `Invite sent to ${displayName(operatorById(op)!)}.`)} />
        </section>
      )}
      <div className="board" data-testid="pipeline">
        {STAGES.map((st) => {
          const col = entries
            .filter((e) => e.stage === st.key)
            .map((e) => {
              const op = operatorById(e.operatorId)!;
              const r = responseOf(s, p.id, op.id);
              const f = r && r.submittedAt && r.interest === "interested" ? responseFit(p, r) : projectFit(p, op);
              return { e, op, r, f };
            })
            .sort((a, b) => b.f.fit - a.f.fit || (a.op.id < b.op.id ? -1 : 1));
          return (
            <section key={st.key} className="col" aria-label={st.label} data-testid={`col-${st.key}`}>
              <h3>
                {st.label} <span>{col.length}</span>
              </h3>
              {col.map(({ e, op, r, f }) => (
                <PipelineCard key={op.id} p={p} e={e} op={op} r={r} f={f} onMove={(to) => run(() => moveStage(p.id, op.id, to), `${displayName(op)} moved to ${STAGES.find((x) => x.key === to)!.label}.`)} />
              ))}
            </section>
          );
        })}
      </div>
      <p className="small muted">Moving someone to Selected closes the project, notifies everyone who responded, and starts the agreement. The client only ever sees who you send in the shortlist.</p>
      <div className="split">
        <QuestionsInbox s={s} p={p} role="admin" />
        <ActivityLog s={s} p={p} />
      </div>
    </div>
  );
}

function PipelineCard({
  p,
  e,
  op,
  r,
  f,
  onMove,
}: {
  p: Project;
  e: { stage: RnStage; note: string };
  op: NonNullable<ReturnType<typeof operatorById>>;
  r: ReturnType<typeof responseOf>;
  f: ReturnType<typeof projectFit>;
  onMove: (to: RnStage) => void;
}) {
  const idx = STAGES.findIndex((x) => x.key === e.stage);
  const next = STAGES[idx + 1];
  const [note, setNote] = useState(e.note);
  const ended = isEnded(p);
  return (
    <article className="kcard" data-testid="pipeline-card" data-op={displayName(op)}>
      <div className="row">
        <Avatar op={op} size={28} />
        <b className="grow">{displayName(op)}</b>
        <FitScore fit={f} size="sm" />
      </div>
      <small className="muted">
        {op.role} · {r?.submittedAt ? `${rateLabel(r.rate)} · ${r.hoursPerMonth} hrs` : "No response yet"}
      </small>
      <CheckHours op={op} />
      {!ended && (
        <>
          <label className="sr-only" htmlFor={`note-${op.id}`}>
            Note on {displayName(op)}
          </label>
          <input id={`note-${op.id}`} className="knote" value={note} placeholder="Admin note" onChange={(ev) => setNote(ev.target.value)} onBlur={() => note !== e.note && setPipelineNote(p.id, op.id, note)} />
          <div className="row">
            {next && next.key !== "not_selected" && (
              <button type="button" className="btn btn-sm" onClick={() => onMove(next.key)} data-testid="move-next" aria-label={`Move ${displayName(op)} to ${next.label}`}>
                Move to {next.label}
              </button>
            )}
            <select aria-label={`Move ${displayName(op)} to stage`} value="" onChange={(ev) => ev.target.value && onMove(ev.target.value as RnStage)} data-testid="move-any">
              <option value="">Move to…</option>
              {STAGES.filter((x) => x.key !== e.stage).map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </article>
  );
}

// ---------------------------------------------------------------- A5 reports

export function AdminReports() {
  const s = useStore();
  const r = reports(s);
  const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
  return (
    <div className="page">
      <Band title="Reports" sub="Computed from the event log, every state change with actor and time." />
      <section className="card" data-testid="reports">
        <h2>By project</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Project</th>
                <th className="num">Reached</th>
                <th className="num">Responded</th>
                <th className="num">Response rate</th>
                <th>Time to first response</th>
                <th className="num">Intros</th>
                <th className="num">Intro rate</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.project.id} data-testid="report-row" data-project={x.project.id}>
                  <td data-label="Project">{x.project.title}</td>
                  <td data-label="Reached" className="num" data-testid="rep-reached">
                    {x.reached}
                  </td>
                  <td data-label="Responded" className="num" data-testid="rep-responders">
                    {x.responders}
                  </td>
                  <td data-label="Response rate" className="num" data-testid="rep-rate">
                    {pct(x.responseRate)}
                  </td>
                  <td data-label="Time to first response" data-testid="rep-first">
                    {x.timeToFirst == null ? "—" : durationLabel(x.timeToFirst)}
                  </td>
                  <td data-label="Intros" className="num" data-testid="rep-intros">
                    {x.intros}
                  </td>
                  <td data-label="Intro rate" className="num" data-testid="rep-intro-rate">
                    {pct(x.introRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!r.rows.length && <Empty>No posted projects yet.</Empty>}
      </section>
      <div className="split even">
        <section className="card" data-testid="rep-declines">
          <h2>Decline reasons</h2>
          {!Object.keys(r.declineReasons).length && <p className="muted">No passes yet.</p>}
          <ul className="bars">
            {Object.entries(r.declineReasons)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <li key={k} data-testid="decline-reason" data-reason={k}>
                  <span>{k}</span>
                  <b>{v}</b>
                </li>
              ))}
          </ul>
        </section>
        <section className="card" data-testid="rep-alerts">
          <h2>Alerts sent by role</h2>
          {!Object.keys(r.alertsByRole).length && <p className="muted">No alerts yet.</p>}
          <ul className="bars">
            {Object.entries(r.alertsByRole).map(([k, v]) => (
              <li key={k} data-testid="alerts-role" data-role={k}>
                <span>{k}</span>
                <b>{v}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- operators directory (A-09, A-10, A-12)

export function AdminOperators() {
  const s = useStore();
  const { query } = useLocation();
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const page = Math.max(1, Number(query.get("page")) || 1);
  const size = 10;
  const sorted = stableSort(OPERATORS, (o) => o.reputation || 0);
  const list = q.trim() ? sorted.filter((o) => matchesQuery(o, q)) : sorted;
  const pages = Math.max(1, Math.ceil(list.length / size));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * size, cur * size);
  const go = (n: number) => navigate(`/admin/operators?page=${n}`);
  return (
    <div className="page">
      <Band title="Operators" sub="All 100 seeded profiles, sorted by reputation then id so the order never shifts between pages." />
      {msg && <Notice tone="ok">{msg}</Notice>}
      <div className="toolbar">
        <label className="search grow">
          <span className="sr-only">Search operators</span>
          <input value={q} onChange={(e) => (setQ(e.target.value), cur !== 1 && go(1))} placeholder="Search by name, role, skill or industry" data-testid="ops-search" />
        </label>
        <button type="button" className="btn btn-sm" onClick={() => (sendPulse(shown.map((o) => o.id)), setMsg(`Availability pulse sent to ${plural(shown.length, "operator")} on this page.`))}>
          Send availability pulse to this page
        </button>
      </div>
      <p className="muted" data-testid="ops-count">
        {list.length} operator{list.length === 1 ? "" : "s"} · page {cur} of {pages}
      </p>
      <ul className="stack" data-testid="ops-list">
        {shown.map((o) => (
          <li key={o.id} className="card row-card op-dir" data-testid="op-dir-row" data-id={o.id}>
            <Avatar op={o} size={40} />
            <div className="grow">
              <Link to={`/operators/${o.slug}`}>
                <b>{displayName(o)}</b>
              </Link>
              <p className="muted small">
                {o.role} · {o.cat} · {rateLabel(o.rate)} · {o.hrs} hrs a month · Reputation {o.reputation}
              </p>
              <p className="small">
                <Availability s={s} op={o} />
              </p>
            </div>
            <div className="op-flags">
              <Completeness op={o} />
              <CheckHours op={o} />
            </div>
            <button type="button" className="btn btn-sm" onClick={() => (sendPulse([o.id]), setMsg(`Availability pulse sent to ${displayName(o)}.`))} data-testid="send-pulse" aria-label={`Send availability pulse to ${displayName(o)}`}>
              Send pulse
            </button>
          </li>
        ))}
      </ul>
      {!list.length && <Empty>No operators match "{q}".</Empty>}
      <nav className="pager" aria-label="Pages">
        <button type="button" className="btn btn-sm" disabled={cur <= 1} onClick={() => go(cur - 1)} data-testid="page-prev">
          Previous
        </button>
        <span>
          Page {cur} of {pages}
        </span>
        <button type="button" className="btn btn-sm" disabled={cur >= pages} onClick={() => go(cur + 1)} data-testid="page-next">
          Next
        </button>
      </nav>
    </div>
  );
}

export function AdminIntros() {
  const s = useStore();
  return (
    <div className="page">
      <Band title="Intro requests" sub="Intros requested from projects are approved automatically (gap G14) and logged here for Revenue Nomad." />
      {!s.intros.length && <Empty>No intro requests yet.</Empty>}
      <div className="table-wrap">
        <table className="table" data-testid="admin-intros">
          <thead>
            <tr>
              <th>Operator</th>
              <th>Project</th>
              <th>Buyer</th>
              <th>Requested</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {s.intros.map((i) => {
              const op = operatorById(i.operatorId)!;
              const p = projectById(s, i.projectId)!;
              return (
                <tr key={i.id}>
                  <td data-label="Operator">{displayName(op)}</td>
                  <td data-label="Project">
                    <Link to={`/admin/projects/${p.id}`}>{p.title}</Link>
                  </td>
                  <td data-label="Buyer">{buyerById(i.buyerId || undefined)?.company || "—"}</td>
                  <td data-label="Requested">{shortDate(i.createdAt)}</td>
                  <td data-label="Status">{i.status === "approved" ? "Approved automatically" : "Withdrawn"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { ago, hoursRange, Arrow };
