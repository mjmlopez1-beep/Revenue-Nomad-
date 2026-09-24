"use client";

// Revenue Nomad Projects, operator side, inside the Operator Portal. Same shared store as the
// buyer and admin flows (projects/lib/store.ts); styled with the portal's own classes.

import { useEffect, useState, type ReactNode } from "react";
import type { Operator, Project, State } from "../../../projects/lib/types";
import { CATEGORIES, buyerById, completeness, displayName, operatorById } from "../../../projects/lib/data";
import {
  DECLINE_REASONS,
  alertOf,
  allOpenRoles,
  askQuestion,
  bookTime,
  companyRevealed,
  confirmAvailability,
  declineProject,
  inPortal,
  introOf,
  inviteOf,
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
} from "../../../projects/lib/store";
import { FIT_PARTS, TIER_LABEL, type FitResult } from "../../../projects/lib/fit";
import { ago, hoursRange, isoDay, rateLabel, shortDate } from "../../../projects/lib/format";
import { navigate, useLocation } from "../../../projects/lib/router";
import { attempt } from "../../../projects/ui/common";

function go(q: Record<string, string | undefined>, replace = false) {
  const params = new URLSearchParams({ view: "projects" });
  for (const [k, v] of Object.entries(q)) if (v) params.set(k, v);
  navigate(`/portal?${params.toString()}`, { replace });
}

function useMe(): { s: State; op: Operator } {
  const s = useStore();
  const sess = useSession();
  return { s, op: operatorById(sess.operatorId)! };
}

function scoreClass(fit: number) {
  return fit >= 85 ? "score" : fit >= 70 ? "score mid" : "score low";
}

function sourceLabel(src: PortalItem["source"]) {
  return src === "invite" ? "Invited by buyer" : src === "rn_suggested" ? "Suggested by Revenue Nomad" : src === "admin" ? "Invited by Revenue Nomad" : src === "alert" ? "Open role alert" : "Open role";
}

function Msg({ tone, children, testId }: { tone: "ok" | "warn" | "error"; children: ReactNode; testId?: string }) {
  return (
    <div className={`opp-msg opp-${tone}`} role={tone === "error" ? "alert" : "status"} data-testid={testId}>
      {children}
    </div>
  );
}

function AvailabilityLine({ s, op }: { s: State; op: Operator }) {
  const st = opState(s, op.id);
  const label =
    st.availability === "unavailable" ? "Not available" : st.availability === "from" ? `Available from ${shortDate(st.availableFrom)}` : st.availability === "open" ? "Available now" : op.avail;
  return (
    <span className="opp-avail">
      {label}
      {st.lastConfirmedAt ? (
        <span className="pill engagement" data-testid="confirmed">
          Confirmed {shortDate(st.lastConfirmedAt)}
        </span>
      ) : (
        <span className="pill salary" data-testid="not-confirmed">
          Not confirmed
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- router

export default function OperatorProjects() {
  const { query } = useLocation();
  const { s, op } = useMe();
  const project = query.get("project");
  const tab = query.get("tab");
  if (!op) return null;
  if (project) return <ProjectDetail key={project + op.id} id={project} />;
  if (tab === "availability") return <AvailabilityView />;
  return <ProjectsHome s={s} op={op} showAllRoles={tab === "roles"} />;
}

export function projectsBadge(s: State, opId: string): number {
  return operatorPortal(s, opId).invited.length;
}

// ---------------------------------------------------------------- list

function ProjectsHome({ s, op, showAllRoles }: { s: State; op: Operator; showAllRoles: boolean }) {
  const portal = operatorPortal(s, op.id);
  const [allRoles, setAllRoles] = useState(showAllRoles);
  const roles: PortalItem[] = allRoles
    ? allOpenRoles(s)
        .filter((p) => !inPortal(s, p.id, op.id))
        .map((p) => ({ project: p, status: null, source: alertOf(s, p.id, op.id) ? "alert" : "browse", fit: projectFit(p, op), sub: "", when: p.postedAt || 0 }))
    : portal.openRoles;
  const st = opState(s, op.id);
  const comp = completeness(op);
  const intros = portal.responded.filter((x) => x.status === "Intro requested").length;
  return (
    <>
      <div className="portal-head">
        <div>
          <h1>Projects</h1>
          <div className="sub">Engagements you were invited to or responded to, plus open roles that match you. Buyers never see your drafts.</div>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="label">Waiting on you</div>
          <div className="value">{portal.invited.length}</div>
        </div>
        <div className="stat">
          <div className="label">Responded</div>
          <div className="value">{portal.responded.length}</div>
        </div>
        <div className="stat">
          <div className="label">Intros requested</div>
          <div className="value">{intros}</div>
        </div>
        <div className="stat">
          <div className="label">Open roles for you</div>
          <div className="value" data-testid="open-roles-count">
            {portal.openRoles.length}
          </div>
        </div>
      </div>

      <div className="opp-avail-bar" data-testid="availability-card">
        <div>
          <div className="why-label">Your availability</div>
          <div className="opp-avail-line">
            <span>
              <b>{st.availability === "unavailable" ? "Not available" : "Open"}</b>, {st.hoursPerMonth ?? op.hrs} hrs a month ·
            </span>
            <AvailabilityLine s={s} op={op} />
          </div>
        </div>
        <div className="job-actions opp-no-mt">
          <button type="button" className="action primary" onClick={() => confirmAvailability(op.id, "open")} data-testid="still-available">
            Still available
          </button>
          <button type="button" className="action" onClick={() => go({ tab: "availability" })}>
            Update or alert settings
          </button>
        </div>
      </div>

      <Section title="Waiting on you" items={portal.invited} testId="sec-invited" s={s} op={op} cta="Respond" empty="No invites waiting. Invites land here the moment a buyer sends one." />
      <Section title="Responded" items={portal.responded} testId="sec-responded" s={s} op={op} cta="View status" empty="Nothing yet." />

      <section className="opp-section" data-testid="sec-roles">
        <div className="opp-section-head">
          <h2>Open roles for you</h2>
          <label className="check opp-check">
            <input type="checkbox" checked={allRoles} onChange={(e) => setAllRoles(e.target.checked)} /> Show every open role
          </label>
        </div>
        <p className="opp-hint">Open to every operator. You were not invited, but you can respond, and responding moves it into your projects.</p>
        {!roles.length && <div className="opp-empty">No open roles match right now.</div>}
        <div className="job-list opp-list">
          {roles.map((it) => (
            <ProjectCard key={it.project.id} s={s} op={op} it={it} cta="See the role" testId="open-role" />
          ))}
        </div>
      </section>

      <Section title="Closed" items={portal.closed} testId="sec-closed" s={s} op={op} cta="View" empty="Nothing closed yet." />

      <div className="opp-foot">
        Profile strength <b data-testid="profile-strength">{comp.pct}%</b>
        {comp.missing.length > 0 && <> · Add {comp.missing.slice(0, 2).join(" and ")} to score higher on fit.</>}
      </div>
    </>
  );
}

function Section({ title, items, testId, s, op, cta, empty }: { title: string; items: PortalItem[]; testId: string; s: State; op: Operator; cta: string; empty: string }) {
  return (
    <section className="opp-section" data-testid={testId}>
      <div className="opp-section-head">
        <h2>
          {title} <span className="count">{items.length}</span>
        </h2>
      </div>
      {!items.length && <div className="opp-empty">{empty}</div>}
      <div className="job-list opp-list">
        {items.map((it) => (
          <ProjectCard key={it.project.id} s={s} op={op} it={it} cta={cta} testId="portal-item" />
        ))}
      </div>
    </section>
  );
}

function ProjectCard({ s, op, it, cta, testId }: { s: State; op: Operator; it: PortalItem; cta: string; testId: string }) {
  const p = it.project;
  const rate = operatorRateLine(p);
  return (
    <div className="job-card opp-card" data-testid={testId} data-project={p.id}>
      <div className="job-top">
        <div>
          <div className="job-title">
            {it.source === "invite" || it.source === "rn_suggested" || it.source === "admin" ? <span className="new-badge">Invite</span> : null}
            <a
              href={`/portal?view=projects&project=${p.id}`}
              onClick={(e) => {
                e.preventDefault();
                go({ project: p.id });
              }}
            >
              {p.title}
            </a>
          </div>
          <div className="job-company">
            {projectCompanyLine(s, p, op.id)}
            {it.sub ? ` · ${it.sub}` : ""}
          </div>
        </div>
        <span className={scoreClass(it.fit.fit)} title={`Your fit, ${TIER_LABEL[it.fit.tier]}`}>
          {it.fit.fit}
        </span>
      </div>
      <div className="job-meta">
        <span className={`pill ${it.source === "rn_suggested" || it.source === "admin" ? "lead" : "engagement"}`}>{sourceLabel(it.source)}</span>
        {it.status && (
          <span className="pill fractional" data-testid="op-status">
            {it.status}
          </span>
        )}
        {p.status === "paused" && <span className="pill salary">Paused</span>}
        <span className="pill">{hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax)} hrs / mo</span>
        <span className="pill">{p.term}</span>
        <span className="pill">Start {shortDate(p.startTarget)}</span>
        {rate && <span className="pill salary">{rate} to you</span>}
      </div>
      <div className="job-actions">
        <button type="button" className="action primary" onClick={() => go({ project: p.id })}>
          {cta}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- detail

function ScoreBreakdown({ fit, noRate }: { fit: FitResult; noRate: boolean }) {
  return (
    <div className="opp-parts">
      {FIT_PARTS.map((part, i) => (
        <div key={part.label} className="opp-part">
          <span>{part.label}</span>
          <b data-testid={`part-${i}`}>
            {fit.parts[i]}/{part.max}
          </b>
          <span className="meter" aria-hidden="true">
            <span className="meter-fill" style={{ width: `${(fit.parts[i] / part.max) * 100}%`, display: "block", height: "100%" }} />
          </span>
          {i === 2 && noRate && <small>No rate listed</small>}
        </div>
      ))}
    </div>
  );
}

function ProjectDetail({ id }: { id: string }) {
  const { s, op } = useMe();
  const p = projectById(s, id);
  useEffect(() => {
    if (p && p.status !== "draft") viewProjectAsOperator(id, op.id);
  }, [id, op.id, p?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const back = (
    <button type="button" className="opp-back" onClick={() => go({})}>
      ← All projects
    </button>
  );
  if (!p || p.status === "draft")
    return (
      <>
        {back}
        <div className="opp-empty">This project is not available.</div>
      </>
    );
  const inv = inviteOf(s, id, op.id);
  const al = alertOf(s, id, op.id);
  const r = responseOf(s, id, op.id);
  if (!inv && p.visibility !== "invites_plus_open" && !r)
    return (
      <>
        {back}
        <div className="opp-empty">This project is invite only, and you were not invited.</div>
      </>
    );
  const submitted = !!(r && r.submittedAt && !r.draft);
  const fit = submitted && r!.interest === "interested" ? responseFit(p, r!) : projectFit(p, op);
  const src = inv ? (inv.source === "buyer" ? "Invited by buyer" : inv.source === "rn_suggested" ? "Suggested by Revenue Nomad" : "Invited by Revenue Nomad") : al ? "Open role alert" : "Open role";
  const status = operatorStatus(s, p, op.id);
  const revealed = companyRevealed(s, p, op.id);
  const rateLine = operatorRateLine(p);
  const company = p.origin === "buyer" ? buyerById(p.ownerBuyerId)?.company : p.clientName;
  return (
    <>
      {back}
      <div className="job-card opp-hero">
        <div className="job-top">
          <div>
            <div className="job-meta opp-no-mt">
              <span className="pill engagement" data-testid="op-source">
                {src}
              </span>
              <span className="pill">Posted {shortDate(p.postedAt)}</span>
              {status && (
                <span className="pill fractional" data-testid="op-project-status">
                  {status}
                </span>
              )}
              {!inPortal(s, id, op.id) && (
                <span className="pill salary" data-testid="not-in-portal">
                  Not in your projects until you respond
                </span>
              )}
            </div>
            <h1 className="opp-title">
              {p.title}
              {revealed && p.hideCompanyUntilIntro ? <span data-testid="company-revealed"> at {company}</span> : null}
            </h1>
            <div className="job-company">
              {revealed ? (p.hideCompanyUntilIntro ? "Company name revealed when they requested an intro" : p.companyDescriptor) : `${p.companyDescriptor} · name shared if they request an intro`}
            </div>
          </div>
          <div className="opp-fit">
            <span className={scoreClass(fit.fit)}>{fit.fit}</span>
            <small>{TIER_LABEL[fit.tier]}</small>
          </div>
        </div>
        <div className="job-meta">
          <span className="pill">{hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax)} hrs / mo</span>
          <span className="pill">{p.term}</span>
          <span className="pill">Start {shortDate(p.startTarget)}</span>
          <span className="pill">{p.location}</span>
          {rateLine && (
            <span className="pill salary" data-testid="rate-to-you">
              {rateLine}
            </span>
          )}
        </div>
        <div className="why-now">
          <div className="why-label">Success in 90 days</div>
          <div className="opp-body">{p.successIn90Days}</div>
          <div className="job-meta opp-mt">
            {p.mustHaves.map((m) => (
              <span key={m} className="pill engagement">
                {m}
              </span>
            ))}
          </div>
        </div>
        <div className="why-now">
          <div className="why-label">Why you {fit.tier === "strong" ? "are a strong fit" : fit.tier === "possible" ? "could fit" : "may not fit"}</div>
          {fit.plus && <div className="opp-body">✓ {fit.plus}</div>}
          {fit.minus && <div className="opp-body opp-dim">! {fit.minus}</div>}
          <ScoreBreakdown fit={fit} noRate={(submitted ? r!.rate : op.rate) == null} />
          <div className="opp-hint">Screening answers are not scored yet. The four parts above are the whole score.</div>
        </div>
      </div>

      {submitted ? <StatusView s={s} p={p} op={op} /> : <RespondForm s={s} p={p} op={op} />}
      <QuestionsBox s={s} p={p} op={op} />
    </>
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
      <div className="job-card opp-block" data-testid="respond-blocked">
        <h2 className="opp-h2">Your response</h2>
        <Msg tone="warn">{blocked}</Msg>
        <button type="button" className="btn" disabled>
          I&apos;m interested
        </button>
      </div>
    );
  const fieldErr = (f: string) => (err?.field === f ? <span className="opp-err">{err.msg}</span> : null);
  return (
    <div className="job-card opp-block" data-testid="respond-form">
      <div className="opp-row-between">
        <h2 className="opp-h2">Your response</h2>
        <div className="job-actions opp-no-mt" role="group" aria-label="Your response">
          <button type="button" className={`action ${mode === "interested" ? "active" : ""}`} aria-pressed={mode === "interested"} onClick={() => setMode("interested")} data-testid="mode-interested">
            I&apos;m interested
          </button>
          <button type="button" className={`action ${mode === "pass" ? "active" : ""}`} aria-pressed={mode === "pass"} onClick={() => setMode("pass")} data-testid="mode-pass">
            Not for me
          </button>
        </div>
      </div>
      {r?.draft && (
        <div className="opp-hint" data-testid="draft-note">
          Draft saved {ago(r.updatedAt, nowOf(s))}. The buyer never sees a draft.
        </div>
      )}
      {err && (
        <Msg tone="error" testId="respond-error">
          {err.msg}
        </Msg>
      )}
      {saved && <Msg tone="ok">{saved}</Msg>}
      {mode === "interested" ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            attempt(
              () => {
                const res = submitResponse(p.id, op.id, input());
                go({ project: p.id, warn: res.warning ? "hours" : undefined }, true);
              },
              (msg, field) => setErr({ msg, field }),
            );
          }}
        >
          <div className="profile-grid opp-grid">
            <label className="field">
              <span>Your rate, $/hr{op.rate == null ? " (required)" : ""}</span>
              <input inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="200" aria-invalid={err?.field === "rate"} data-testid="r-rate" />
              {fieldErr("rate")}
              {p.origin === "revenue_nomad" && <small className="opp-hint">This seat pays {operatorRateLine(p)}.</small>}
            </label>
            <label className="field">
              <span>Hours / month</span>
              <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} aria-invalid={err?.field === "hours"} data-testid="r-hours" />
              {fieldErr("hours")}
            </label>
            <label className="field">
              <span>Can start</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={err?.field === "canStart"} data-testid="r-start" />
              {fieldErr("canStart")}
            </label>
            {overHours && (
              <div className="field full">
                <Msg tone="warn" testId="hours-warning">
                  {hrsNum} hrs a month is more than the {op.hrs} on your profile. That&apos;s fine, the fit score will use {hrsNum}.
                </Msg>
              </div>
            )}
            {p.screeningQuestions.map((q, i) => (
              <label key={i} className="field full">
                <span>
                  {i + 1}. {q}
                </span>
                <textarea rows={3} value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} aria-invalid={err?.field === `answer-${i}`} data-testid={`r-answer-${i}`} />
                {fieldErr(`answer-${i}`)}
              </label>
            ))}
            <label className="field full">
              <span>Note to the buyer, optional</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="r-note" />
            </label>
          </div>
          <div className="opp-actions">
            <span className="opp-hint">Rate, hours and start are filled from your profile. Save and finish later if you like.</span>
            <button
              type="button"
              className="btn btn-ghost"
              data-testid="save-draft"
              onClick={() => attempt(() => (saveDraftResponse(p.id, op.id, input()), setSaved("Draft saved. The buyer never sees a draft.")), (msg) => setErr({ msg }))}
            >
              Save draft
            </button>
            <button type="submit" className="btn" data-testid="submit-response">
              Submit response
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            attempt(() => (declineProject(p.id, op.id, reason), go({}, true)), (msg, field) => setErr({ msg, field }));
          }}
        >
          <div className="why-label opp-mt">What made it a pass? Only Revenue Nomad sees this.</div>
          <div className="stage-checks" role="radiogroup" aria-label="Reason">
            {DECLINE_REASONS.map((x) => (
              <label key={x} className="check">
                <input type="radio" name="reason" value={x} checked={reason === x} onChange={() => setReason(x)} />
                {x}
              </label>
            ))}
          </div>
          {fieldErr("reason")}
          <div className="opp-actions">
            <button type="submit" className="btn" data-testid="pass-project">
              Pass on this project
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function StatusView({ s, p, op }: { s: State; p: Project; op: Operator }) {
  const r = responseOf(s, p.id, op.id)!;
  const status = operatorStatus(s, p, op.id);
  const { query } = useLocation();
  const intro = introOf(s, p.id, op.id);
  const booked = intro?.bookedSlot || null;
  const bookIdx = query.get("book");
  useEffect(() => {
    // One-tap booking from the intro email: ?book=<slot index>.
    if (bookIdx == null) return;
    const slot = intro?.slots?.[Number(bookIdx)];
    if (slot && !intro?.bookedSlot) attempt(() => bookTime(p.id, op.id, slot), () => undefined);
    go({ project: p.id }, true);
  }, [bookIdx]); // eslint-disable-line react-hooks/exhaustive-deps
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  if (r.interest === "declined" || r.withdrawn)
    return (
      <div className="job-card opp-block" data-testid="status-view">
        <h2 className="opp-h2">You passed on this project</h2>
        <div className="opp-hint">Reason: {r.declineReason}. The buyer never sees a response from you.</div>
      </div>
    );
  const buyer = buyerById(p.ownerBuyerId);
  const steps =
    p.origin === "buyer"
      ? [
          { label: "Responded", sub: shortDate(r.submittedAt), done: true },
          { label: "Buyer viewed", sub: r.viewedAt ? shortDate(r.viewedAt) : "Not yet", done: !!r.viewedAt },
          { label: "Intro requested", sub: r.decision === "intro_requested" || r.decision === "selected" ? shortDate(r.decisionAt) : "Not yet", done: r.decision === "intro_requested" || r.decision === "selected" },
          { label: status === "Closed" ? "Closed" : "Selected", sub: status === "Selected" ? shortDate(p.staffedAt) : status === "Closed" ? "Went another direction" : "Not yet", done: status === "Selected" || status === "Closed" },
        ]
      : [
          { label: "Responded", sub: shortDate(r.submittedAt), done: true },
          { label: "Revenue Nomad review", sub: status === "Under review" || status === "Selected" ? "Shared with the client" : "Not yet", done: status === "Under review" || status === "Selected" },
          { label: status === "Closed" ? "Closed" : "Selected", sub: status === "Selected" ? shortDate(p.staffedAt) : status === "Closed" ? "Went another direction" : "Not yet", done: status === "Selected" || status === "Closed" },
        ];
  const introOn = p.origin === "buyer" && (r.decision === "intro_requested" || r.decision === "selected");
  return (
    <>
      {query.get("warn") === "hours" && (
        <Msg tone="warn" testId="hours-warning">
          You offered {r.hoursPerMonth} hrs a month, more than the {op.hrs} on your profile. The fit score uses {r.hoursPerMonth}.
        </Msg>
      )}
      {introOn && buyer && (
        <div className="job-card opp-block opp-intro" data-testid="intro-card">
          <h2 className="opp-h2">{buyer.company} wants to talk</h2>
          <div className="company-head">
            <span className="avatar avatar-letter">
              {buyer.contactName
                .split(" ")
                .map((w) => w[0])
                .join("")}
            </span>
            <div>
              <div className="job-title" data-testid="buyer-contact">
                {buyer.contactName}
              </div>
              <div className="job-company">
                {buyer.contactTitle}, {buyer.company} · {buyer.email}
              </div>
            </div>
          </div>
          {msg && <Msg tone={msg.tone}>{msg.text}</Msg>}
          {booked ? (
            <div className="pitch opp-mt" data-testid="booked">
              <b>Call booked</b> {booked}. {buyer.contactName} has it.
            </div>
          ) : (
            <>
              <div className="why-label opp-mt">Pick a time for a 30 minute call</div>
              <div className="job-actions opp-no-mt" role="group" aria-label="Book a time">
                {(intro?.slots || []).map((sl) => (
                  <button
                    key={sl}
                    type="button"
                    className="action primary"
                    onClick={() => attempt(() => (bookTime(p.id, op.id, sl), setMsg({ tone: "ok", text: `Booked ${sl}. ${buyer.contactName} got an email.` })), (m) => setMsg({ tone: "error", text: m }))}
                    data-testid="book-slot"
                  >
                    Book {sl}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="job-actions">
            <button type="button" className="action" onClick={() => setReplying(!replying)} aria-expanded={replying} data-testid="reply">
              Reply
            </button>
            {status !== "Selected" && (
              <button type="button" className="action danger" onClick={() => attempt(() => withdrawResponse(p.id, op.id), (m) => setMsg({ tone: "error", text: m }))}>
                Withdraw
              </button>
            )}
          </div>
          {replying && (
            <div className="field opp-mt">
              <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} aria-label={`Reply to ${buyer.contactName}`} data-testid="reply-text" />
              <div className="opp-actions">
                <button
                  type="button"
                  className="btn"
                  data-testid="reply-send"
                  onClick={() => attempt(() => (replyToBuyer(p.id, op.id, reply), setReply(""), setReplying(false), setMsg({ tone: "ok", text: `Reply sent to ${buyer.contactName}.` })), (m) => setMsg({ tone: "error", text: m }))}
                >
                  Send reply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="job-card opp-block" data-testid="status-view">
        <div className="opp-row-between">
          <h2 className="opp-h2">Status</h2>
          <span className="pill fractional" data-testid="status-now">
            {status}
          </span>
        </div>
        <ol className="opp-timeline">
          {steps.map((st) => (
            <li key={st.label} className={st.done ? "done" : ""}>
              <b>{st.label}</b>
              <small>{st.sub}</small>
            </li>
          ))}
        </ol>
        {status === "Selected" && <Msg tone="ok">You were selected. Revenue Nomad will send the agreement next.</Msg>}
        {status === "Closed" && <Msg tone="warn">The seat went another direction. Thanks for responding. You&apos;ll keep getting matched to new roles.</Msg>}
        <div className="job-meta opp-mt">
          <span className="pill">You sent {rateLabel(r.rate)}</span>
          <span className="pill">{r.hoursPerMonth} hrs / mo</span>
          <span className="pill">Start {shortDate(r.canStart)}</span>
          <span className="pill">
            {r.answers.filter((a) => a.trim()).length} of {p.screeningQuestions.length} answers
          </span>
        </div>
        <div className="opp-hint opp-mt">If the buyer passes, you hear once the seat is staffed, not before.</div>
      </div>
    </>
  );
}

function QuestionsBox({ s, p, op }: { s: State; p: Project; op: Operator }) {
  const mine = questionsFor(s, p.id).filter((q) => q.operatorId === op.id);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  return (
    <div className="job-card opp-block" data-testid="op-questions">
      <h2 className="opp-h2">Question for the {p.origin === "buyer" ? "buyer" : "Revenue Nomad team"}</h2>
      <div className="opp-hint">Answers are shared with you only.</div>
      {mine.map((q) => (
        <div key={q.id} className="why-now" data-testid="my-question">
          <div className="opp-body">{q.text}</div>
          {q.answer ? (
            <div className="pitch opp-mt" data-testid="my-answer">
              <b>Answer</b> {q.answer}
            </div>
          ) : (
            <div className="opp-hint">Waiting for an answer.</div>
          )}
        </div>
      ))}
      {err && <Msg tone="error">{err}</Msg>}
      {sent && <Msg tone="ok">Question sent.</Msg>}
      <div className="field opp-mt">
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your question" placeholder="Ask about scope, team, tools…" data-testid="ask-text" />
      </div>
      <div className="job-actions">
        <button type="button" className="action primary" onClick={() => attempt(() => (askQuestion(p.id, op.id, text), setText(""), setSent(true), setErr(null)), setErr)} data-testid="ask-send">
          Ask a question
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- availability + alert settings

function AvailabilityView() {
  const { s, op } = useMe();
  const { query } = useLocation();
  const st = opState(s, op.id);
  const [from, setFrom] = useState(st.availableFrom ? String(st.availableFrom).slice(0, 10) : isoDay(nowOf(s) + 14 * 86400000));
  const [hours, setHours] = useState(String(st.hoursPerMonth ?? op.hrs));
  const [msg, setMsg] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<string[]>(st.alertPrefs);
  const pulse = query.get("pulse");
  useEffect(() => {
    // One-tap pulse links from the outbox confirm straight away.
    if (pulse === "open" || pulse === "unavailable") {
      confirmAvailability(op.id, pulse);
      setMsg(pulse === "open" ? "Thanks. You're confirmed as open." : "Thanks. You're marked not available. You won't get role alerts until you change this.");
      go({ tab: "availability" }, true);
    }
  }, [pulse, op.id]);
  return (
    <>
      <button type="button" className="opp-back" onClick={() => go({})}>
        ← All projects
      </button>
      <div className="portal-head">
        <div>
          <h1>Availability</h1>
          <div className="sub">Buyers see when you last confirmed. One tap keeps it current.</div>
        </div>
      </div>
      {msg && <Msg tone="ok">{msg}</Msg>}
      <div className="job-card opp-block" data-testid="availability-page">
        <div className="opp-avail-line">
          <AvailabilityLine s={s} op={op} />
        </div>
        <div className="profile-grid opp-grid">
          <label className="field">
            <span>Hours a month you can give</span>
            <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} />
          </label>
          <label className="field">
            <span>Or open from</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
        </div>
        <div className="job-actions">
          <button type="button" className="action primary" onClick={() => (confirmAvailability(op.id, "open", { hours: Number(hours) || null }), setMsg("Confirmed as open."))} data-testid="confirm-open">
            I&apos;m open now
          </button>
          <button type="button" className="action" onClick={() => (confirmAvailability(op.id, "from", { from, hours: Number(hours) || null }), setMsg(`Confirmed as open from ${shortDate(from)}.`))}>
            Open from that date
          </button>
          <button type="button" className="action danger" onClick={() => (confirmAvailability(op.id, "unavailable"), setMsg("Marked not available."))}>
            Not available
          </button>
        </div>
      </div>
      <div className="job-card opp-block" data-testid="alert-settings">
        <h2 className="opp-h2">Alert settings</h2>
        <div className="opp-hint">You get a new role alert when an open project matches one of these. At most one alert a day; the rest roll into a digest.</div>
        <div className="stage-checks">
          {CATEGORIES.map((c) => (
            <label key={c} className="check">
              <input type="checkbox" checked={prefs.includes(c)} onChange={(e) => setPrefs(e.target.checked ? [...prefs, c] : prefs.filter((x) => x !== c))} />
              {c}
            </label>
          ))}
        </div>
        <div className="job-actions">
          <button type="button" className="action primary" onClick={() => (setAlertPrefs(op.id, prefs), setMsg("Alert settings saved."))}>
            Save alert settings
          </button>
        </div>
      </div>
    </>
  );
}

export function SignedInChip() {
  const sess = useSession();
  const op = operatorById(sess.operatorId);
  if (!op) return null;
  return (
    <span className="opp-me" data-testid="signed-in-as">
      <span className="opp-me-dot">{op.initials}</span>
      {displayName(op)}
    </span>
  );
}
