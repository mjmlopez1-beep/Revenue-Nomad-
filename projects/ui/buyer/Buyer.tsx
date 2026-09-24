import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Operator, Project, Response, State } from "../../lib/types";
import { CATEGORIES, OPERATORS, buyerById, displayName, matchesQuery, operatorById, stableSort } from "../../lib/data";
import {
  ActionError,
  alertMatches,
  closeUnfilled,
  createBuyerDraft,
  deleteDraft,
  inviteOf,
  inviteOperator,
  isEnded,
  markNotAFit,
  markViewed,
  noResponses72,
  nowOf,
  opState,
  passAllWeak,
  postProject,
  projectById,
  projectCounts,
  projectFit,
  questionsFor,
  answerQuestion,
  introOf,
  setNotAFitReason,
  requestIntro,
  responseFit,
  responseOf,
  responseSourceLabel,
  responsesFor,
  selectOperator,
  setProjectStatus,
  setWantsSuggestions,
  trackSignals,
  undoDecision,
  uninviteOperator,
  updateDraft,
  useSearchImpressions,
  useSession,
  useStore,
  validateBrief,
  widenVisibility,
  type BriefErrors,
} from "../../lib/store";
import { ago, daysBetween, hoursRange, plural, shortDate } from "../../lib/format";
import { Link, navigate, useLocation } from "../../lib/router";
import { allInLabel, seatOf } from "../../lib/fit";
import {
  Arrow,
  Avatar,
  Back,
  Band,
  Check,
  Empty,
  FieldError,
  FitParts,
  FitScore,
  FitWhy,
  Gap,
  Notice,
  SeatFlags,
  Stat,
  StatusPill,
  attempt,
  seatFlags,
} from "../common";
import { CompanyFitChip, useBuyerFit } from "./Company";
import { INDUSTRIES, MOTIONS } from "../../lib/company";
import { BriefFields, LiveMatch, TemplatePicker, type BriefDraft } from "../BriefForm";
import { TEMPLATES } from "../../lib/templates";

function visLabel(p: Project) {
  return p.visibility === "invite_only" ? "Invite only" : "Invites plus open to all";
}

function useBuyerProject(id: string): { s: State; p: Project | undefined; mine: boolean } {
  const s = useStore();
  const sess = useSession();
  const p = projectById(s, id);
  return { s, p, mine: !!p && p.origin === "buyer" && p.ownerBuyerId === sess.buyerId };
}

function NotYours() {
  return (
    <div className="page">
      <Empty>
        This project is not in your account. Buyers can only open their own projects. <Link to="/buyer/projects">Back to your projects</Link>
      </Empty>
    </div>
  );
}

// ---------------------------------------------------------------- B1

export function BuyerDashboard() {
  const s = useStore();
  const sess = useSession();
  const [tab, setTab] = useState<"all" | "draft" | "progress" | "staffed">("all");
  const buyer = buyerById(sess.buyerId)!;
  const mine = s.projects.filter((p) => p.origin === "buyer" && p.ownerBuyerId === sess.buyerId).sort((a, b) => b.updatedAt - a.updatedAt);
  const groups = {
    all: mine,
    draft: mine.filter((p) => p.status === "draft"),
    progress: mine.filter((p) => !["draft", "staffed", "closed_unfilled"].includes(p.status)),
    staffed: mine.filter((p) => isEnded(p)),
  };
  const shown = groups[tab];
  const benchSize = new Set(s.responses.filter((r) => mine.some((p) => p.id === r.projectId) && (r.decision === "intro_requested" || r.decision === "selected")).map((r) => r.operatorId)).size;
  return (
    <div className="page">
      <Band
        slim
        title="Projects"
        sub={
          benchSize
            ? `${plural(benchSize, "operator")} on your bench from past projects. Invite them again in one click.`
            : "Post a role, invite who you like, and responses land here ranked by fit."
        }
        eyebrow={`${buyer.contactName}, ${buyer.company}`}
        right={
          <button type="button" className="btn band-btn" onClick={() => navigate(`/buyer/projects/${createBuyerDraft(sess.buyerId)}/edit`)} data-testid="new-project">
            + Post a project
          </button>
        }
      />
      <div className="seg" role="group" aria-label="Filter projects">
        {(
          [
            ["all", "All"],
            ["draft", "Drafts"],
            ["progress", "In progress"],
            ["staffed", "Staffed or closed"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {l} ({groups[k].length})
          </button>
        ))}
      </div>
      {!shown.length && <Empty>No projects here yet.</Empty>}
      {shown.map((p) => (
        <ProjectCard key={p.id} s={s} p={p} />
      ))}
    </div>
  );
}

function ProjectCard({ s, p }: { s: State; p: Project }) {
  const c = projectCounts(s, p);
  const now = nowOf(s);
  if (p.status === "draft")
    return (
      <div className="card pcard" data-testid="project-card" data-project={p.id}>
        <div className="pcard-head">
          <div>
            <StatusPill status="draft" />
            <h2 className="pcard-title">{p.title || "Untitled project"}</h2>
            <p className="muted">
              {hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax)} hrs a month · {p.term} · Edited {ago(p.updatedAt, now)}
              {(p.draftInvites || []).length ? ` · ${plural((p.draftInvites || []).length, "operator")} picked to invite` : ""}
            </p>
          </div>
          <Link className="btn primary" to={`/buyer/projects/${p.id}/edit`}>
            Finish and post
          </Link>
        </div>
      </div>
    );
  const selected = p.selectedOperatorId ? operatorById(p.selectedOperatorId) : null;
  const toReview = responsesFor(s, p.id).filter((r) => r.decision === "none").length;
  return (
    <Link to={`/buyer/projects/${p.id}`} className="card pcard pcard-live" data-testid="project-card" data-project={p.id}>
      <div className="pcard-head">
        <div>
          <div className="row">
            <StatusPill status={p.status} />
            <span className="pill pill-tint">
              {plural(c.responses, "response")}, {plural(c.strong, "strong fit")}
            </span>
            {toReview > 0 && !isEnded(p) && (
              <span className="pill pill-strong" data-testid="card-to-review">
                {toReview} to review
              </span>
            )}
          </div>
          <h2 className="pcard-title">{p.title}</h2>
          <p className="muted">
            {visLabel(p)} · {hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax)} hrs a month · {p.term} · Start {shortDate(p.startTarget)}
            {selected && p.staffedAt && p.postedAt ? ` · Staffed with ${displayName(selected)} in ${daysBetween(p.postedAt, p.staffedAt)} days` : ""}
          </p>
        </div>
        <span className="link-strong">
          Review responses <Arrow />
        </span>
      </div>
      <div className="stats">
        <Stat label="Invited" value={c.invited} testId="card-invited" />
        <Stat label="Responses" value={c.responses} testId="card-responses" />
        <Stat label="Strong fit, 85+" value={c.strong} testId="card-strong" />
        <Stat label="Intros requested" value={c.intros} accent testId="card-intros" />
      </div>
      {noResponses72(s, p, now) && <Notice tone="warn">No responses in 72 hours. Widen visibility or turn on Revenue Nomad suggestions.</Notice>}
    </Link>
  );
}

// ---------------------------------------------------------------- B2

export function BuyerBrief({ id }: { id: string }) {
  const { s, p, mine } = useBuyerProject(id);
  const [draft, setDraft] = useState<BriefDraft | null>(p ? { ...p } : null);
  const [errors, setErrors] = useState<BriefErrors>({});
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (p && !draft) setDraft({ ...p });
  }, [p, draft]);
  if (!p) return <NotYours />;
  if (!mine) return <NotYours />;
  if (p.status !== "draft")
    return (
      <div className="page">
        <Notice>This project is posted. The brief is locked so every responder saw the same seat.</Notice>
        <Link to={`/buyer/projects/${id}?tab=brief`}>View the brief</Link>
      </div>
    );
  if (!draft) return null;
  const set = (patch: Partial<Project>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (Object.keys(errors).length) setErrors(validateBrief(next));
  };
  const save = () => updateDraft(id, stripDraft(draft));
  const valid = () => {
    const errs = validateBrief(draft);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFlash("Fix the highlighted fields to continue.");
      return false;
    }
    return true;
  };
  const next = () => {
    if (!valid()) return;
    save();
    navigate(`/buyer/projects/${id}/invite`);
  };
  // Fastest path: post straight from the brief, open to every matching operator.
  const postNow = () => {
    if (!valid()) return;
    updateDraft(id, { ...stripDraft(draft), visibility: "invites_plus_open", wantsRnSuggestions: draft.wantsRnSuggestions });
    if (attempt(() => postProject(id), (m) => setFlash(m))) navigate(`/buyer/projects/${id}?posted=1`);
  };
  const pickTemplate = (key: string) => {
    const t = TEMPLATES.find((x) => x.key === key)!;
    set({ ...t.brief, category: seatOf(t.brief), mustHaves: [...t.brief.mustHaves], screeningQuestions: [...t.brief.screeningQuestions] });
    setErrors({});
  };
  return (
    <div className="page">
      <Steps at={1} />
      <h1 className="page-h">Post a project</h1>
      {flash && Object.keys(errors).length > 0 && <Notice tone="error">{flash}</Notice>}
      <div className="split">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
          noValidate
        >
          {!p.title && <TemplatePicker onPick={pickTemplate} active={draft.title} />}
          <BriefFields draft={draft} set={set} errors={errors} />
          <section className="card form-card" aria-labelledby="conf-h">
            <h2 id="conf-h">Confidentiality</h2>
            <label className="field">
              <span>How operators see you until you request an intro</span>
              <input value={draft.companyDescriptor} onChange={(e) => set({ companyDescriptor: e.target.value })} aria-invalid={!!errors.companyDescriptor} />
              <FieldError msg={errors.companyDescriptor} />
            </label>
            <label className="check">
              <input type="checkbox" checked={draft.hideCompanyUntilIntro} onChange={(e) => set({ hideCompanyUntilIntro: e.target.checked })} />
              Hide my company name until I request an intro
            </label>
          </section>
          <div className="actions-row">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (!draft.title && !draft.successIn90Days) deleteDraft(id);
                navigate("/buyer/projects");
              }}
            >
              Cancel
            </button>
            <button type="button" className="btn" onClick={() => (save(), setFlash(null), navigate("/buyer/projects"))}>
              Save draft
            </button>
            <button type="submit" className="btn" data-testid="continue">
              Pick operators to invite first
            </button>
            <button type="button" className="btn primary" onClick={postNow} data-testid="post-now">
              Post now, open to all <Arrow />
            </button>
          </div>
          <label className="toggle post-sug">
            <input type="checkbox" checked={draft.wantsRnSuggestions} onChange={(e) => set({ wantsRnSuggestions: e.target.checked })} data-testid="brief-suggestions" />
            <span>
              <b>Let Revenue Nomad add up to 3 operators we know fit</b>
              <small>Sent as invites. Posting goes live at once and sends a role alert to every matching operator.</small>
            </span>
          </label>
        </form>
        <div className="stack">
          <LiveMatch s={s} draft={draft} />
          <section className="card">
            <h3 className="mini-h">What happens next</h3>
            <ol className="steps-list">
              <li>Post now and every matching operator gets a role alert. Or pick specific people to invite first</li>
              <li>Responses land ranked by fit score. Pass on the weak ones and request intros in bulk</li>
              <li>Each intro offers three of your times. The operator taps one and the call is booked</li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function stripDraft(d: BriefDraft): Partial<Project> {
  const {
    title,
    category,
    successIn90Days,
    scope,
    hoursPerMonthMin,
    hoursPerMonthMax,
    term,
    startTarget,
    location,
    budgetMin,
    budgetMax,
    mustHaves,
    screeningQuestions,
    companyDescriptor,
    hideCompanyUntilIntro,
    clientName,
    billRate,
    operatorRate,
    revealClientOnShortlist,
  } = d;
  return {
    title,
    category: category ?? null,
    successIn90Days,
    scope,
    hoursPerMonthMin: Number(hoursPerMonthMin),
    hoursPerMonthMax: Number(hoursPerMonthMax),
    term,
    startTarget,
    location,
    budgetMin,
    budgetMax,
    mustHaves,
    screeningQuestions,
    companyDescriptor,
    hideCompanyUntilIntro,
    clientName,
    billRate,
    operatorRate,
    revealClientOnShortlist,
  };
}
export { stripDraft };

function Steps({ at }: { at: number }) {
  return (
    <ol className="stepper" aria-label="Steps">
      {["The seat", "Invite, optional", "Post"].map((l, i) => (
        <li key={l} aria-current={at === i + 1 ? "step" : undefined} className={at > i + 1 ? "done" : ""}>
          <span>{i + 1}</span>
          {l}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- B3

interface InviteFilters {
  cat: string;
  avail: string;
  industry: string;
  motion: string;
  rate: string;
  hours: number;
  rep: number;
}
const NO_FILTERS: InviteFilters = { cat: "", avail: "", industry: "", motion: "", rate: "", hours: 0, rep: 0 };

const MOTION_TAGS: Record<string, RegExp> = {
  plg: /\bplg\b|product.led/i,
  plg_to_sales: /plg\s*(→|->|to)\s*sales|founder-led sales exit/i,
  inside_sales: /inside|inbound|outbound|\bsdr\b/i,
  enterprise_sales: /enterprise/i,
  channel: /channel|reseller/i,
};

function passesFilters(s: State, o: Operator, f: InviteFilters, budgetMax?: number | null): boolean {
  if (f.cat && o.cat !== f.cat) return false;
  if (f.avail) {
    const st = opState(s, o.id);
    if (st.availability === "unavailable") return false;
    if (f.avail === "now" && !(st.availability === "open" || (!st.availability && /now/i.test(o.avail)))) return false;
    if (f.avail === "2w" && /2\+ weeks/i.test(o.avail) && st.availability !== "open") return false;
    if (f.avail === "confirmed" && !st.lastConfirmedAt) return false;
  }
  if (f.industry && !(o.allIndustries || []).includes(f.industry)) return false;
  if (f.motion && !MOTION_TAGS[f.motion].test((o.allTags || []).join(" | "))) return false;
  if (f.rate === "listed" && o.rate == null) return false;
  if (f.rate && f.rate !== "listed") {
    if (o.rate == null) return false;
    const cap = f.rate === "budget" ? budgetMax ?? Infinity : Number(f.rate);
    if (o.rate > cap) return false;
  }
  if (f.hours && (o.hrs || 0) < f.hours) return false;
  if (f.rep && (o.reputation || 0) < f.rep) return false;
  return true;
}

/** Operators this buyer already liked on earlier projects: intros requested or hired. */
export function benchOf(s: State, p: Project): string[] {
  const mine = new Set(s.projects.filter((x) => x.origin === "buyer" && x.ownerBuyerId === p.ownerBuyerId && x.id !== p.id).map((x) => x.id));
  return [...new Set(s.responses.filter((r) => mine.has(r.projectId) && (r.decision === "intro_requested" || r.decision === "selected")).map((r) => r.operatorId))];
}

export function InvitePicker({
  s,
  p,
  invited,
  onInvite,
  onUninvite,
  resend,
  pageSize = 10,
}: {
  s: State;
  p: Project;
  invited: Set<string>;
  onInvite: (opId: string) => void;
  onUninvite?: (opId: string) => void;
  resend?: boolean;
  pageSize?: number;
}) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(pageSize);
  const bench = useMemo(() => new Set(p.origin === "buyer" ? benchOf(s, p) : []), [s, p]);
  const buyerFit = useBuyerFit();
  const scored = useMemo(() => stableSort(OPERATORS.map((o) => ({ id: o.id, o, f: projectFit(p, o) })), (x) => x.f.fit + (bench.has(x.id) ? 1000 : 0)), [p, bench]);
  const [fl, setFl] = useState<InviteFilters>(NO_FILTERS);
  const active = Object.entries(fl).filter(([k, v]) => v !== NO_FILTERS[k as keyof InviteFilters]).length;
  const list = scored.filter((x) => (!q.trim() || matchesQuery(x.o, q)) && passesFilters(s, x.o, fl, p.origin === "revenue_nomad" ? p.operatorRate : p.budgetMax));
  const shown = list.slice(0, limit);
  useSearchImpressions(q, shown.map((x) => x.o.id), "invite");
  return (
    <div className="picker">
      <label className="search">
        <span className="sr-only">Search operators</span>
        <input value={q} onChange={(e) => (setQ(e.target.value), setLimit(pageSize))} placeholder={`Search ${OPERATORS.length} operators by name, role, skill or industry`} data-testid="invite-search" />
      </label>
      <div className="pick-filters" role="group" aria-label="Filters" data-testid="invite-filters">
        <select value={fl.cat} onChange={(e) => (setFl({ ...fl, cat: e.target.value }), setLimit(pageSize))} aria-label="Role category" data-testid="flt-cat">
          <option value="">Any role category</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={fl.avail} onChange={(e) => (setFl({ ...fl, avail: e.target.value }), setLimit(pageSize))} aria-label="Availability" data-testid="flt-avail">
          <option value="">Any availability</option>
          <option value="now">Available now</option>
          <option value="2w">Within 2 weeks</option>
          <option value="confirmed">Confirmed recently</option>
        </select>
        <select value={fl.industry} onChange={(e) => (setFl({ ...fl, industry: e.target.value }), setLimit(pageSize))} aria-label="Industry" data-testid="flt-industry">
          <option value="">Any industry</option>
          {INDUSTRIES.slice(0, 30).map((i) => (
            <option key={i}>{i}</option>
          ))}
        </select>
        <select value={fl.motion} onChange={(e) => (setFl({ ...fl, motion: e.target.value }), setLimit(pageSize))} aria-label="GTM motion" data-testid="flt-motion">
          <option value="">Any GTM motion</option>
          {MOTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select value={fl.rate} onChange={(e) => (setFl({ ...fl, rate: e.target.value }), setLimit(pageSize))} aria-label="Hourly rate" data-testid="flt-rate">
          <option value="">Any rate</option>
          {p.budgetMax ? <option value="budget">Inside my budget</option> : null}
          <option value="150">Up to $150/hr</option>
          <option value="200">Up to $200/hr</option>
          <option value="250">Up to $250/hr</option>
          <option value="listed">Rate listed</option>
        </select>
        <select value={fl.hours} onChange={(e) => (setFl({ ...fl, hours: Number(e.target.value) }), setLimit(pageSize))} aria-label="Hours a month" data-testid="flt-hours">
          <option value={0}>Any hours</option>
          {[20, 40, 60, 80].map((h) => (
            <option key={h} value={h}>
              {h}+ hrs a month
            </option>
          ))}
        </select>
        <select value={fl.rep} onChange={(e) => (setFl({ ...fl, rep: Number(e.target.value) }), setLimit(pageSize))} aria-label="Reputation Index" data-testid="flt-rep">
          <option value={0}>Any Reputation Index</option>
          {[50, 60, 70].map((r) => (
            <option key={r} value={r}>
              Reputation {r}+
            </option>
          ))}
        </select>
        {active > 0 && (
          <button type="button" className="btn ghost btn-sm" onClick={() => setFl(NO_FILTERS)} data-testid="flt-clear">
            Clear {active}
          </button>
        )}
      </div>
      <p className="muted" data-testid="invite-matchline">
        {q.trim() || active ? `${list.length} of ${OPERATORS.length} match${q.trim() ? ` "${q.trim()}"` : ""}${active ? ` with ${active} filter${active === 1 ? "" : "s"}` : ""}` : `All ${OPERATORS.length} live profiles from revenuenomad.com, best fit first`}
      </p>
      {!list.length && (
        <Empty>
          <span data-testid="invite-empty">No operators match "{q.trim()}". Try a role, a skill like HubSpot, or an industry.</span>
        </Empty>
      )}
      <ul className="op-list">
        {shown.map(({ o, f }) => {
          const on = invited.has(o.id);
          return (
            <li key={o.id} className={`op-row ${on ? "on" : ""}`} data-testid="invite-row" data-op={displayName(o)}>
              <FitScore fit={f} size="sm" />
              <Avatar op={o} size={36} />
              <div className="op-who">
                <Link to={`/operators/${o.slug}${q.trim() ? `?q=${encodeURIComponent(q.trim().toLowerCase())}` : ""}`}>{displayName(o)}</Link>
                <small>
                  {o.role} · {allInLabel(o.rate)} · {o.hrs} hrs a month
                </small>
              </div>
              <div className="op-flags">
                {bench.has(o.id) && (
                  <span className="chip chip-v" data-testid="bench-chip">
                    Your bench
                  </span>
                )}
                <CompanyFitChip fit={buyerFit(o)} />
                <SeatFlags flags={seatFlags(o, p)} />
              </div>
              {on ? (
                <span className="row">
                  <span className="pill pill-tint">Invited</span>
                  {resend ? (
                    <button type="button" className="btn btn-sm" onClick={() => onInvite(o.id)} aria-label={`Resend invite to ${displayName(o)}`}>
                      Resend
                    </button>
                  ) : (
                    onUninvite && (
                      <button type="button" className="btn ghost btn-sm" onClick={() => onUninvite(o.id)} aria-label={`Remove ${displayName(o)}`}>
                        Remove
                      </button>
                    )
                  )}
                </span>
              ) : (
                <button type="button" className="btn btn-sm" onClick={() => onInvite(o.id)} aria-label={`Invite ${displayName(o)}`}>
                  Invite
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {list.length > shown.length && (
        <button type="button" className="btn block" onClick={() => setLimit(limit + pageSize)}>
          Show {Math.min(pageSize, list.length - shown.length)} more of {list.length - shown.length}
        </button>
      )}
    </div>
  );
}

export function BuyerInvite({ id }: { id: string }) {
  const { s, p, mine } = useBuyerProject(id);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  if (!p || !mine) return <NotYours />;
  const isDraft = p.status === "draft";
  const invited = new Set(isDraft ? p.draftInvites || [] : s.invites.filter((i) => i.projectId === id).map((i) => i.operatorId));
  const alertReach = OPERATORS.filter((o) => !invited.has(o.id) && alertMatches(s, p, o.id)).length;
  const cat = seatOf(p);
  const post = () => {
    if (attempt(() => postProject(id), (m) => setErr(m))) navigate(`/buyer/projects/${id}?posted=1`);
  };
  return (
    <div className="page">
      {isDraft ? (
        <>
          <Link to={`/buyer/projects/${id}/edit`} className="back">
            <Back /> The seat
          </Link>
          <Steps at={2} />
          <h1 className="page-h">Invite operators and set visibility</h1>
        </>
      ) : (
        <>
          <Link to={`/buyer/projects/${id}`} className="back">
            <Back /> {p.title}
          </Link>
          <h1 className="page-h">Invite more operators</h1>
        </>
      )}
      {err && <Notice tone="error">{err}</Notice>}
      {ok && <Notice tone="ok">{ok}</Notice>}
      <div className="split">
        <div className="stack">
          <section className="card" aria-labelledby="vis-h">
            <h2 id="vis-h">Visibility</h2>
            <div className="choice-grid" role="group" aria-label="Visibility">
              <button
                type="button"
                className="choice"
                aria-pressed={p.visibility === "invite_only"}
                disabled={!isDraft}
                onClick={() => updateDraft(id, { visibility: "invite_only" })}
                data-testid="vis-invite-only"
              >
                <b>Invite only</b>
                <span>Only operators you invite, plus any Revenue Nomad suggests if you turn that on, can see and respond.</span>
              </button>
              <button
                type="button"
                className="choice"
                aria-pressed={p.visibility === "invites_plus_open"}
                onClick={() => (isDraft ? updateDraft(id, { visibility: "invites_plus_open" }) : (widenVisibility(id), setOk("Opened to all operators. Matching operators got a new role alert.")))}
                disabled={!isDraft && p.visibility === "invites_plus_open"}
                data-testid="vis-open"
              >
                <b>Invites plus open to all</b>
                <span>Your invites go out as invites. Every other operator gets a new role alert and can respond.</span>
              </button>
            </div>
          </section>
          <section className="card" aria-labelledby="inv-h">
            <div className="card-head">
              <h2 id="inv-h">Invite operators</h2>
              <span className="head-meta" data-testid="invited-count">
                {invited.size} invited
              </span>
            </div>
            {(() => {
              const top = stableSort(OPERATORS.map((o) => ({ id: o.id, f: projectFit(p, o).fit })), (x) => x.f)
                .filter((x) => !invited.has(x.id))
                .slice(0, 5);
              const bench = benchOf(s, p).filter((x) => !invited.has(x));
              return top.length || bench.length ? (
                <div className="row quick-invite">
                  {top.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm top5"
                      data-testid="invite-top5"
                      onClick={() => attempt(() => (top.forEach((x) => inviteOperator(id, x.id)), setOk(`Invited the ${top.length} best matches.`)), setErr)}
                    >
                      Invite the top {top.length} matches
                    </button>
                  )}
                  {bench.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm top5"
                      data-testid="invite-bench"
                      title={bench.map((x) => displayName(operatorById(x)!)).join(", ")}
                      onClick={() => attempt(() => (bench.forEach((x) => inviteOperator(id, x)), setOk(`Invited ${plural(bench.length, "operator")} from your bench.`)), setErr)}
                    >
                      Invite your bench ({bench.length})
                    </button>
                  )}
                </div>
              ) : null;
            })()}
            <InvitePicker
              s={s}
              p={p}
              invited={invited}
              resend={!isDraft}
              onInvite={(opId) => attempt(() => (inviteOperator(id, opId), !isDraft && setOk(`Invite sent to ${displayName(operatorById(opId)!)}.`)), setErr)}
              onUninvite={isDraft ? (opId) => uninviteOperator(id, opId) : undefined}
            />
          </section>
          <section className="card">
            <label className="toggle">
              <input type="checkbox" checked={p.wantsRnSuggestions} onChange={(e) => setWantsSuggestions(id, e.target.checked)} data-testid="wants-suggestions" />
              <span>
                <b>Add Revenue Nomad suggestions</b>
                <small>Our team adds up to 3 more operators we know fit, sent as invites. They show in your responses as Suggested by Revenue Nomad.</small>
              </span>
            </label>
          </section>
          {isDraft && (
            <div className="actions-row">
              <Link to={`/buyer/projects/${id}/edit`} className="btn ghost">
                Back
              </Link>
              <span className="muted">Goes live as soon as you post</span>
              <button type="button" className="btn primary" onClick={post} data-testid="post-project">
                Post project
              </button>
            </div>
          )}
        </div>
        <aside className="stack">
          <section className="card">
            <h3 className="mini-h">What operators receive</h3>
            <div className="preview">
              <div className="preview-tag">Invited, {plural(invited.size, "operator")}</div>
              <div className="mail-mock">
                <small>Invite</small>
                <b>You're invited to apply, {p.title || "your role"}</b>
                <p>
                  A {p.companyDescriptor} invited you to apply. {hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax)} hrs a month, {p.term}, {p.location.split(",")[0].toLowerCase()}, start{" "}
                  {shortDate(p.startTarget)}.
                </p>
                <span className="btn primary btn-sm">View and respond</span>
                <small>Added to their dashboard automatically</small>
              </div>
            </div>
            <div className="preview">
              <div className="preview-tag" data-testid="alert-reach">
                Everyone else, {p.visibility === "invites_plus_open" ? `${plural(alertReach, "operator")} in ${cat} get an alert` : "no alert, invite only"}
              </div>
              <div className={`mail-mock ${p.visibility === "invite_only" ? "off" : ""}`}>
                <small>Role alert</small>
                <b>New fractional role posted, {p.title || "your role"}</b>
                <p>
                  A new role that may fit your profile. {hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax)} hrs a month, {p.term}, {p.location.split(",")[0].toLowerCase()}.
                </p>
                <span className="btn btn-sm">See the role</span>
                <small>Not added to their dashboard until they respond. Only operators whose alert settings match {cat} get it, one alert a day at most.</small>
              </div>
            </div>
            <p className="muted">
              {p.hideCompanyUntilIntro ? "Your company name stays hidden until you request an intro. " : ""}Operators see their own rate, not your budget.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- B4

type Sort = "fit" | "rate" | "start" | "newest";
type View = "review" | "intro" | "notfit" | "all";

const NOT_A_FIT_REASONS = ["Not the right fit", "Rate is too high", "Not enough relevant experience", "Hours don't fit", "Start date doesn't work", "Weak fit", "Other"];

export function BuyerProject({ id }: { id: string }) {
  const { s, p, mine } = useBuyerProject(id);
  const { query } = useLocation();
  const [tab, setTab] = useState<"responses" | "questions" | "brief">((query.get("tab") as "questions") || "responses");
  const [msg, setMsg] = useState<Msg>(
    query.get("posted")
      ? { tone: "ok", text: p?.visibility === "invite_only" ? "Posted and live. Your invites went out; responses land here ranked by fit." : "Posted and live. Matching operators got your role; responses land here ranked by fit." }
      : null,
  );
  useEffect(() => {
    const t = query.get("tab");
    if (t === "questions" || t === "brief" || t === "responses") setTab(t);
  }, [query]);
  if (!p || !mine) return <NotYours />;
  if (p.status === "draft")
    return (
      <div className="page">
        <Notice>This project is a draft.</Notice>
        <Link to={`/buyer/projects/${id}/edit`}>Finish and post</Link>
      </div>
    );
  const c = projectCounts(s, p);
  const now = nowOf(s);
  const qs = questionsFor(s, id);
  const open = qs.filter((q) => !q.answer).length;
  const run = (fn: () => void, okText?: string) => attempt(() => (fn(), okText && setMsg({ tone: "ok", text: okText })), (m) => setMsg({ tone: "error", text: m }));
  const selected = p.selectedOperatorId ? operatorById(p.selectedOperatorId) : null;
  return (
    <div className="page">
      <Link to="/buyer/projects" className="back">
        <Back /> Projects
      </Link>
      <Band
        eyebrow={
          <>
            <StatusPill status={p.status} /> <span className="band-tag">{visLabel(p)}</span>
          </>
        }
        title={p.title}
        sub={`${hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax)} hrs a month · ${p.term} · ${p.location} · Budget $${p.budgetMin}-$${p.budgetMax} / hr · Posted ${ago(p.postedAt, now)}`}
      >
        <div className="band-actions">
          <button type="button" className="btn band-ghost" onClick={() => setTab("brief")}>
            View brief
          </button>
          {!isEnded(p) && (
            <>
              {p.status === "closed_to_responses" ? (
                <button type="button" className="btn band-ghost" onClick={() => run(() => setProjectStatus(id, "live", "buyer"), "Reopened to new responses.")}>
                  Reopen to responses
                </button>
              ) : (
                <button type="button" className="btn band-ghost" onClick={() => run(() => setProjectStatus(id, "closed_to_responses", "buyer"), "Closed to new responses. You can still review and select.")} data-testid="close-responses">
                  Close to new responses
                </button>
              )}
              {p.status === "paused" ? (
                <button type="button" className="btn band-ghost" onClick={() => run(() => setProjectStatus(id, "live", "buyer"), "Resumed. The project is live again.")} data-testid="resume">
                  Resume
                </button>
              ) : (
                <button type="button" className="btn band-ghost" onClick={() => run(() => setProjectStatus(id, "paused", "buyer"), "Paused. It is hidden from open roles and not taking responses.")} data-testid="pause">
                  Pause
                </button>
              )}
              <Link to={`/buyer/projects/${id}/invite`} className="btn band-btn">
                Invite more operators
              </Link>
            </>
          )}
        </div>
      </Band>
      {msg && (
        <Notice tone={msg.tone} testId="project-msg">
          <span>{msg.text}</span>
          {msg.undo && (
            <button type="button" className="btn btn-sm" onClick={() => (msg.undo!(), setMsg({ tone: "ok", text: "Undone." }))} data-testid="msg-undo">
              Undo
            </button>
          )}
        </Notice>
      )}
      {p.status === "staffed" && selected && (
        <Notice tone="ok" testId="staffed-banner">
          Staffed with <b>{displayName(selected)}</b> on {shortDate(p.staffedAt!)}. Everyone else who responded got one polite close email. New responses are closed.
        </Notice>
      )}
      {p.status === "closed_unfilled" && <Notice tone="warn">Closed without a hire on {shortDate(p.closedAt!)}. Everyone who responded got one close email.</Notice>}
      {p.status === "paused" && <Notice tone="warn">Paused. Hidden from open roles and not taking new responses. Existing responders keep their status.</Notice>}
      {noResponses72(s, p, now) && (
        <Notice tone="warn" testId="nudge-widen">
          No responses in 72 hours.{" "}
          {p.visibility === "invite_only" && (
            <button type="button" className="btn btn-sm" onClick={() => run(() => widenVisibility(id), "Opened to all operators.")}>
              Open to all operators
            </button>
          )}{" "}
          {!p.wantsRnSuggestions && (
            <button type="button" className="btn btn-sm" onClick={() => run(() => setWantsSuggestions(id, true), "Revenue Nomad will add up to 3 suggestions.")}>
              Turn on Revenue Nomad suggestions
            </button>
          )}
        </Notice>
      )}
      <div className="tabs" role="tablist" aria-label="Project sections">
        <button role="tab" type="button" aria-selected={tab === "responses"} onClick={() => setTab("responses")} data-testid="tab-responses">
          Responses ({c.responses})
        </button>
        <button role="tab" type="button" aria-selected={tab === "questions"} onClick={() => setTab("questions")} data-testid="tab-questions">
          Questions ({qs.length}){open ? <span className="dot-count">{open}</span> : null}
        </button>
        <button role="tab" type="button" aria-selected={tab === "brief"} onClick={() => setTab("brief")} data-testid="tab-brief">
          Brief
        </button>
      </div>
      {tab === "responses" && <Responses s={s} p={p} setMsg={setMsg} />}
      {tab === "questions" && <QuestionsInbox s={s} p={p} role="buyer" />}
      {tab === "brief" && <BriefView p={p} audience="buyer" />}
      {!isEnded(p) && (
        <div className="danger-zone">
          <button
            type="button"
            className="btn ghost btn-sm"
            onClick={() => {
              if (typeof window === "undefined" || window.confirm("Close this project without hiring? Everyone who responded gets one close email.")) run(() => closeUnfilled(id), "Closed without a hire.");
            }}
          >
            Close without hiring
          </button>
        </div>
      )}
    </div>
  );
}

type Msg = { tone: "ok" | "error" | "warn"; text: string; undo?: () => void } | null;

function Responses({ s, p, setMsg }: { s: State; p: Project; setMsg: (m: Msg) => void }) {
  const { query } = useLocation();
  const [sort, setSort] = useState<Sort>("fit");
  const [view, setView] = useState<View>((query.get("view") as View) || "review");
  const [tier, setTier] = useState<"all" | "strong" | "possible" | "weak">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [comparing, setComparing] = useState(false);
  const rows = responsesFor(s, p.id).map((r) => ({ r, f: responseFit(p, r), op: operatorById(r.operatorId)! }));
  const counts = { strong: 0, possible: 0, weak: 0 };
  rows.forEach((x) => counts[x.f.tier]++);
  const inView = rows.filter((x) =>
    view === "review" ? x.r.decision === "none" : view === "intro" ? x.r.decision === "intro_requested" || x.r.decision === "selected" : view === "notfit" ? x.r.decision === "not_a_fit" : true,
  );
  const filtered = inView.filter((x) => tier === "all" || x.f.tier === tier);
  const sorted = [...filtered].sort((a, b) => {
    let d = 0;
    if (sort === "fit") d = b.f.fit - a.f.fit;
    else if (sort === "rate") {
      // Operators with no rate sort last, not first (QA B-08).
      if (a.r.rate == null && b.r.rate == null) d = 0;
      else if (a.r.rate == null) d = 1;
      else if (b.r.rate == null) d = -1;
      else d = a.r.rate - b.r.rate;
    } else if (sort === "start") d = (a.r.canStart || "9999").localeCompare(b.r.canStart || "9999");
    else d = (b.r.submittedAt || 0) - (a.r.submittedAt || 0);
    return d || b.f.fit - a.f.fit || (a.op.id < b.op.id ? -1 : 1);
  });
  const open = rows.filter((x) => x.r.decision === "none");
  const weakOpen = open.filter((x) => x.f.tier === "weak").length;
  const strongOpen = open.filter((x) => x.f.tier === "strong").map((x) => x.op.id);
  const ended = isEnded(p);
  const pickable = sorted.filter((x) => x.r.decision === "none").map((x) => x.op.id);
  const chosen = [...picked].filter((id) => pickable.includes(id));
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const bulk = (fn: () => void, text: string, undoIds?: string[]) =>
    attempt(
      () => {
        fn();
        setPicked(new Set());
        setMsg({ tone: "ok", text, undo: undoIds ? () => undoIds.forEach((id) => attempt(() => undoDecision(p.id, id), () => undefined)) : undefined });
      },
      (m) => setMsg({ tone: "error", text: m }),
    );
  return (
    <div className="resp-wrap">
      <div className="stack">
        <div className="tiers" role="group" aria-label="Filter by fit tier">
          {(
            [
              ["strong", "Strong fit", "85+"],
              ["possible", "Possible fit", "70-84"],
              ["weak", "Weak fit", "under 70"],
            ] as const
          ).map(([k, label, range]) => (
            <button key={k} type="button" className={`tier-tile tt-${k}`} aria-pressed={tier === k} onClick={() => setTier(tier === k ? "all" : k)} data-testid={`tier-${k}`}>
              <span>{label}</span>
              <b>{counts[k]}</b>
              <small>{range}</small>
            </button>
          ))}
        </div>
        {!ended && (strongOpen.length > 0 || weakOpen > 0) && (
          <div className="quick-actions" role="group" aria-label="Quick actions">
            <button
              type="button"
              className="btn primary btn-sm"
              disabled={!strongOpen.length}
              data-testid="intro-strong"
              onClick={() => bulk(() => requestIntro(p.id, strongOpen), `Intro requested with ${plural(strongOpen.length, "strong fit")}. Each got three of your times to book with one tap.`, strongOpen)}
            >
              Request intros with all strong fits ({strongOpen.length})
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!weakOpen}
              data-testid="pass-weak"
              onClick={() => {
                const ids = open.filter((x) => x.f.tier === "weak").map((x) => x.op.id);
                const n = passAllWeak(p.id);
                setMsg({ tone: "ok", text: `Passed on ${plural(n, "weak fit")}. They hear once the seat is staffed, not now.`, undo: () => ids.forEach((id) => attempt(() => undoDecision(p.id, id), () => undefined)) });
              }}
            >
              Pass on all weak fits ({weakOpen})
            </button>
          </div>
        )}
        <div className="toolbar">
          <div className="seg" role="group" aria-label="View">
            {(
              [
                ["review", "To review", open.length],
                ["intro", "Intro requested", rows.filter((x) => x.r.decision === "intro_requested" || x.r.decision === "selected").length],
                ["notfit", "Not a fit", rows.filter((x) => x.r.decision === "not_a_fit").length],
                ["all", "All", rows.length],
              ] as const
            ).map(([k, l, n]) => (
              <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} data-testid={`view-${k}`}>
                {l} ({n})
              </button>
            ))}
          </div>
          <details className="how-scores">
            <summary>How scores work</summary>
            <div className="how-pop">
              <p>
                <b>Fit is out of 100:</b> skills and role 35, experience 30, budget 15, hours 20, from your brief and the operator's live profile using the rate and hours in their response. Screening answers aren't scored. Nobody screens responses before you see them.
              </p>
              <p>
                <b>Passing</b> sends one polite close email when the seat is staffed, not the moment you pass. <b>Intros</b> offer three of your times; the operator taps one.
              </p>
            </div>
          </details>
          <label className="sort-select">
            <span className="muted">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort responses" data-testid="sort">
              <option value="fit">Best fit</option>
              <option value="rate">Lowest rate</option>
              <option value="start">Earliest start</option>
              <option value="newest">Newest</option>
            </select>
          </label>
        </div>
        {!ended && pickable.length > 0 && (
          <div className={`bulk-bar ${chosen.length ? "on" : ""}`} data-testid="bulk-bar">
            <label className="check">
              <input
                type="checkbox"
                checked={chosen.length > 0 && chosen.length === pickable.length}
                ref={(el) => {
                  if (el) el.indeterminate = chosen.length > 0 && chosen.length < pickable.length;
                }}
                onChange={(e) => setPicked(new Set(e.target.checked ? pickable : []))}
                data-testid="pick-all"
              />
              {chosen.length ? `${chosen.length} selected` : "Select all"}
            </label>
            {chosen.length > 0 && (
              <>
                {chosen.length >= 2 && (
                  <button type="button" className="btn btn-sm" data-testid="compare" onClick={() => setComparing(true)} disabled={chosen.length > 3} title={chosen.length > 3 ? "Compare up to 3 at a time" : undefined}>
                    Compare ({Math.min(chosen.length, 3)})
                  </button>
                )}
                <button type="button" className="btn primary btn-sm" data-testid="bulk-intro" onClick={() => bulk(() => requestIntro(p.id, chosen), `Intro requested with ${plural(chosen.length, "operator")}.`, chosen)}>
                  Request intros ({chosen.length})
                </button>
                <button type="button" className="btn btn-sm" data-testid="bulk-pass" onClick={() => bulk(() => markNotAFit(p.id, chosen, "Not the right fit"), `Passed on ${plural(chosen.length, "operator")}. They hear once the seat is staffed.`, chosen)}>
                  Pass ({chosen.length})
                </button>
              </>
            )}
          </div>
        )}
        {!sorted.length && <Empty>{rows.length ? "Nobody in this view." : "No responses yet. Matching operators got your role, and responses land here ranked by fit."}</Empty>}
        {comparing && chosen.length >= 2 && (
          <Compare
            s={s}
            p={p}
            ids={chosen.slice(0, 3)}
            onClose={() => setComparing(false)}
            act={(fn, text) => (bulk(fn, text), setComparing(false))}
          />
        )}
        <ul className="resp-list">
          {sorted.map(({ r, f }) => (
            <ResponseRow key={r.id} s={s} p={p} r={r} f={f} setMsg={setMsg} picked={picked.has(r.operatorId)} onPick={() => toggle(r.operatorId)} />
          ))}
        </ul>
      </div>
    </div>
  );
}

/** What a buyer weighs besides fit: reviews, recent availability, engagements. */
function Trust({ s, op, p, r }: { s: State; op: Operator; p: Project; r: Response }) {
  const st = opState(s, op.id);
  const reviews = op.profile?.reviews || [];
  const avg = reviews.length ? reviews.reduce((a, r) => a + (r.overall || 0), 0) / reviews.length : 0;
  const items = [
    reviews.length ? `★ ${avg ? avg.toFixed(1) : "5.0"} · ${plural(reviews.length, "review")}` : op.rev ? plural(op.rev, "review") : null,
    op.eng ? plural(op.eng, "past engagement") : null,
    st.lastConfirmedAt ? `Available, confirmed ${shortDate(st.lastConfirmedAt)}` : null,
  ].filter(Boolean) as string[];
  const cf = useBuyerFit()(op);
  return (
    <p className="resp-trust" data-testid="resp-trust">
      {items.map((x) => (
        <span key={x}>{x}</span>
      ))}
      <CompanyFitChip fit={cf} />
      <SeatFlags flags={seatFlags(op, p, r)} />
    </p>
  );
}

function ResponseRow({ s, p, r, f, setMsg, picked, onPick }: { s: State; p: Project; r: Response; f: ReturnType<typeof responseFit>; setMsg: (m: Msg) => void; picked: boolean; onPick: () => void }) {
  const op = operatorById(r.operatorId)!;
  const [open, setOpen] = useState(false);
  const now = nowOf(s);
  const run = (fn: () => void, ok?: string, undo?: () => void) => attempt(() => (fn(), ok && setMsg({ tone: "ok", text: ok, undo })), (m) => setMsg({ tone: "error", text: m }));
  const src = responseSourceLabel(s, r);
  const ended = isEnded(p);
  const intro = introOf(s, p.id, op.id);
  const toggle = () => {
    setOpen(!open);
    markViewed(p.id, op.id);
  };
  return (
    <li className={`resp card tier-edge-${f.tier} ${picked ? "picked" : ""} ${open ? "is-open" : ""}`} data-testid="response-row" data-op={displayName(op)} data-decision={r.decision}>
      <div className="resp-top">
        {r.decision === "none" && !ended ? (
          <label className="pick">
            <input type="checkbox" checked={picked} onChange={onPick} aria-label={`Select ${displayName(op)}`} data-testid="pick" />
          </label>
        ) : (
          <span className="pick" />
        )}
        <FitScore fit={f} />
        <Avatar op={op} size={44} />
        <div className="resp-who">
          <div className="row">
            <Link to={`/operators/${op.slug}?from=${p.id}`} onClick={() => markViewed(p.id, op.id)} className="resp-name">
              {displayName(op)}
            </Link>
            <span className={`src ${src.startsWith("Suggested") ? "src-rn" : ""}`} data-testid="response-source">
              {src}
            </span>
            {r.simulated && <span className="chip chip-warn">Simulated</span>}
          </div>
          <p className="resp-meta">
            <span data-testid="resp-rate" title="Includes Revenue Nomad's fee">{allInLabel(r.rate)}</span> · {r.hoursPerMonth} hrs · Start {shortDate(r.canStart)} · {ago(r.submittedAt, now)} · <span className="muted">{op.role}</span>
          </p>
          <Trust s={s} op={op} p={p} r={r} />
          {!!r.proof?.length && (
            <p className="resp-meta" data-testid="resp-proof">
              Case studies attached: {r.proof.join(", ")}
            </p>
          )}
          <p className="resp-why">
            {f.plus && (
              <span className="why-plus">
                <Check /> {f.plus.split(". ")[0]}
              </span>
            )}
            {f.minus && (
              <span className="why-minus">
                <Gap /> {f.minus.split(". ")[0]}
              </span>
            )}
          </p>
        </div>
        <div className="resp-side">
          {r.decision === "none" && !ended && (
            <>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => run(() => markNotAFit(p.id, [op.id], "Not the right fit"), `Passed on ${op.first}. They hear once the seat is staffed.`, () => attempt(() => undoDecision(p.id, op.id), () => undefined))}
                data-testid="not-a-fit"
              >
                Pass
              </button>
              <button
                type="button"
                className="btn btn-sm btn-intro"
                onClick={() => run(() => requestIntro(p.id, op.id), `Intro requested. ${op.first} got three of your times to book with one tap.`, () => attempt(() => undoDecision(p.id, op.id), () => undefined))}
                data-testid="request-intro"
              >
                Request intro
              </button>
            </>
          )}
          {r.decision === "intro_requested" && (
            <>
              <span className="pill pill-tint">Intro requested</span>
              <button type="button" className="btn ghost btn-sm" onClick={() => run(() => undoDecision(p.id, op.id), "Intro request undone.")} data-testid="undo">
                Undo
              </button>
            </>
          )}
          {r.decision === "not_a_fit" && (
            <>
              <label className="reason-pick">
                <span className="sr-only">Reason, optional</span>
                <select value={r.notAFitReason || "Not the right fit"} onChange={(e) => setNotAFitReason(p.id, op.id, e.target.value)} aria-label="Not a fit reason, optional" disabled={ended} data-testid="nf-reason">
                  {NOT_A_FIT_REASONS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn ghost btn-sm" onClick={() => run(() => undoDecision(p.id, op.id), "Moved back to To review.")} data-testid="undo">
                Undo
              </button>
            </>
          )}
          {r.decision === "selected" && <span className="pill pill-strong">Selected</span>}
          {(r.decision === "none" || r.decision === "intro_requested") && !ended && (
            <button type="button" className="btn primary btn-sm" onClick={() => navigate(`/buyer/projects/${p.id}/select/${op.id}`)} data-testid="select">
              Select
            </button>
          )}
        </div>
      </div>
      {r.decision === "intro_requested" && intro && (
        <div className={`call ${intro.bookedSlot ? "call-booked" : ""}`} data-testid="call-status">
          {intro.bookedSlot ? (
            <>
              <b>Call booked</b> {intro.bookedSlot} with {op.first}
            </>
          ) : (
            <>
              <b>Waiting for {op.first} to pick a time.</b> Offered {(intro.slots || []).join(" · ")}
            </>
          )}
        </div>
      )}
      <button type="button" className="resp-toggle" aria-expanded={open} onClick={toggle} data-testid="view-response">
        {open ? "Hide answers and score" : "Answers and score"}
      </button>
      {open && (
        <div className="resp-open">
          <FitParts fit={f} noRate={r.rate == null} />
          <FitWhy fit={f} />
          <div className="resp-answers" data-testid="response-detail">
            {p.screeningQuestions.map((q, i) => (
              <div key={i}>
                <b>
                  {i + 1}. {q}
                </b>
                <p>{r.answers[i] || <span className="muted">No answer</span>}</p>
              </div>
            ))}
            {r.note && (
              <div>
                <b>Note</b>
                <p>{r.note}</p>
              </div>
            )}
          </div>
          <Link to={`/operators/${op.slug}?from=${p.id}`} onClick={() => markViewed(p.id, op.id)} className="btn ghost btn-sm">
            View full profile
          </Link>
        </div>
      )}
    </li>
  );
}

/** Two or three responses side by side: the numbers, then every answer, question by question. */
function Compare({ s, p, ids, onClose, act }: { s: State; p: Project; ids: string[]; onClose: () => void; act: (fn: () => void, text: string) => void }) {
  const cols = ids.map((id) => {
    const op = operatorById(id)!;
    const r = responseOf(s, p.id, id)!;
    return { op, r, f: responseFit(p, r) };
  });
  const sess = useSession();
  useEffect(() => {
    ids.forEach((id) => markViewed(p.id, id));
    trackSignals(ids.map((id) => ({ type: "compared" as const, operatorId: id, projectId: p.id, source: "compare" })), sess.role, sess.buyerId);
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const bestFit = Math.max(...cols.map((c) => c.f.fit));
  const fitFor = useBuyerFit();
  const rates = cols.map((c) => c.r.rate).filter((x): x is number => x != null);
  const low = rates.length ? Math.min(...rates) : null;
  const rowsFacts: [string, (c: (typeof cols)[number]) => ReactNode, (c: (typeof cols)[number]) => boolean][] = [
    ["Fit", (c) => <FitScore fit={c.f} size="sm" />, (c) => c.f.fit === bestFit],
    ["Rate, all-in", (c) => allInLabel(c.r.rate).replace(" all-in", ""), (c) => low != null && c.r.rate === low],
    ["Hours a month", (c) => c.r.hoursPerMonth, () => false],
    ["Can start", (c) => shortDate(c.r.canStart), () => false],
    ["Company fit", (c) => (fitFor(c.op) && fitFor(c.op)!.level !== "unknown" ? <CompanyFitChip fit={fitFor(c.op)} /> : "—"), () => false],
    ["Flags", (c) => (seatFlags(c.op, p, c.r).map((x) => x.text).join(" · ") || "None"), () => false],
    ["Reviews", (c) => (c.op.profile?.reviews || []).length || c.op.rev || "None yet", () => false],
    ["Engagements", (c) => c.op.eng || "None listed", () => false],
    ["Strength", (c) => c.f.plus.split(". ")[0], () => false],
    ["Gap", (c) => c.f.minus.split(". ")[0] || "None", () => false],
  ];
  return (
    <section className="card compare" data-testid="compare-panel" aria-label="Compare responses">
      <div className="compare-head">
        <h2>Side by side</h2>
        <button type="button" className="btn ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="compare-scroll">
        <table>
          <thead>
            <tr>
              <th />
              {cols.map((c) => (
                <th key={c.op.id} scope="col">
                  <span className="compare-who">
                    <Avatar op={c.op} size={36} />
                    <b>{displayName(c.op)}</b>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsFacts.map(([label, val, best]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {cols.map((c) => (
                  <td key={c.op.id} className={best(c) ? "best" : ""}>
                    {val(c)}
                  </td>
                ))}
              </tr>
            ))}
            {p.screeningQuestions.map((q, i) => (
              <tr key={q} className="compare-q">
                <th scope="row">{q}</th>
                {cols.map((c) => (
                  <td key={c.op.id}>{c.r.answers[i] || <span className="muted">No answer</span>}</td>
                ))}
              </tr>
            ))}
            <tr>
              <th />
              {cols.map((c) => (
                <td key={c.op.id}>
                  {c.r.decision === "none" && !isEnded(p) ? (
                    <button type="button" className="btn primary btn-sm" onClick={() => act(() => requestIntro(p.id, c.op.id), `Intro requested. ${c.op.first} got three of your times to book with one tap.`)} data-testid="compare-intro">
                      Request intro
                    </button>
                  ) : (
                    <span className="pill pill-tint">{c.r.decision === "intro_requested" ? "Intro requested" : c.r.decision === "not_a_fit" ? "Passed" : "Selected"}</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function QuestionsInbox({ s, p, role }: { s: State; p: Project; role: "buyer" | "admin" }) {
  const qs = questionsFor(s, p.id).sort((a, b) => b.askedAt - a.askedAt);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const canAnswer = role === "buyer" ? p.origin === "buyer" : p.origin === "revenue_nomad";
  return (
    <section className="card" aria-label="Questions from operators" data-testid="questions">
      <h2>Questions from operators</h2>
      <p className="muted">Answers go to the operator who asked, by email and on their project page.{!canAnswer && " The buyer answers questions on their own project."}</p>
      {err && <Notice tone="error">{err}</Notice>}
      {!qs.length && <Empty>No questions yet.</Empty>}
      <ul className="q-list">
        {qs.map((q) => {
          const op = operatorById(q.operatorId)!;
          return (
            <li key={q.id} className="q" data-testid="question">
              <div className="row">
                <Avatar op={op} size={28} />
                <b>{displayName(op)}</b>
                <span className="muted">{ago(q.askedAt, nowOf(s))}</span>
              </div>
              <p className="q-text">{q.text}</p>
              {q.answer ? (
                <p className="q-answer">
                  <b>Answer</b> {q.answer}
                </p>
              ) : canAnswer ? (
                <div className="inline-form">
                  <label className="grow">
                    <span className="sr-only">Answer</span>
                    <textarea rows={2} value={drafts[q.id] || ""} onChange={(e) => setDrafts({ ...drafts, [q.id]: e.target.value })} aria-label={`Answer ${displayName(op)}`} data-testid="answer-input" />
                  </label>
                  <button type="button" className="btn primary btn-sm" onClick={() => attempt(() => answerQuestion(q.id, drafts[q.id] || "", role), setErr)} data-testid="answer-send">
                    Send answer
                  </button>
                </div>
              ) : (
                <p className="muted">Waiting on the buyer.</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function BriefView({ p, audience }: { p: Project; audience: "buyer" | "operator" | "admin" }) {
  return (
    <section className="card" aria-label="The brief" data-testid="brief-view">
      <h2>The brief</h2>
      <dl className="facts facts-wide">
        <div>
          <dt>Role</dt>
          <dd>{p.title}</dd>
        </div>
        <div>
          <dt>Hours</dt>
          <dd>{hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax)} a month</dd>
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
        {audience !== "operator" && p.origin === "buyer" && (
          <div>
            <dt>Budget</dt>
            <dd>
              ${p.budgetMin}-${p.budgetMax} / hr
            </dd>
          </div>
        )}
        <div>
          <dt>Visibility</dt>
          <dd>{visLabel(p)}</dd>
        </div>
      </dl>
      <h3 className="mini-h">Success in 90 days</h3>
      <p>{p.successIn90Days}</p>
      <h3 className="mini-h">Must-haves</h3>
      <div className="chips">
        {p.mustHaves.map((m) => (
          <span key={m} className="chip chip-v">
            {m}
          </span>
        ))}
      </div>
      <h3 className="mini-h">Screening questions</h3>
      <ol className="plain-ol">
        {p.screeningQuestions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------- B6

export function BuyerSelect({ id, opId }: { id: string; opId: string }) {
  const { s, p, mine } = useBuyerProject(id);
  const [err, setErr] = useState<string | null>(null);
  if (!p || !mine) return <NotYours />;
  const op = operatorById(opId);
  const r = responsesFor(s, id).find((x) => x.operatorId === opId);
  if (!op || !r) return <Empty>That operator has not responded to this project.</Empty>;
  const f = responseFit(p, r);
  const others = responsesFor(s, id).filter((x) => x.operatorId !== opId).length;
  return (
    <div className="page narrow">
      <Link to={`/buyer/projects/${id}`} className="back">
        <Back /> {p.title}
      </Link>
      <h1 className="page-h">Select {displayName(op)}?</h1>
      {err && <Notice tone="error">{err}</Notice>}
      <section className="card select-card" data-testid="select-confirm">
        <div className="row">
          <Avatar op={op} size={56} />
          <div>
            <b className="big-name">{displayName(op)}</b>
            <p className="muted">{op.role}</p>
          </div>
          <FitScore fit={f} />
        </div>
        <dl className="facts">
          <div>
            <dt>Rate, all-in</dt>
            <dd>{allInLabel(r.rate).replace(" all-in", "")}</dd>
          </div>
          <div>
            <dt>Hours a month</dt>
            <dd>{r.hoursPerMonth}</dd>
          </div>
          <div>
            <dt>Can start</dt>
            <dd>{shortDate(r.canStart)}</dd>
          </div>
          <div>
            <dt>Revenue Nomad fee</dt>
            <dd>Included in the all-in rate</dd>
          </div>
        </dl>
        <h3 className="mini-h">What happens when you confirm</h3>
        <ul className="plain-ul">
          <li>The project is marked staffed and closes to new responses.</li>
          <li>{op.first} gets a selected email and Revenue Nomad sends the agreement.</li>
          <li>{others ? `${plural(others, "other responder")} each get one polite close email.` : "Nobody else responded, so no close emails go out."} Operators who never responded get nothing.</li>
          <li>Decisions become final. You can't undo intro requests or passes after this.</li>
        </ul>
        <p className="note-box">No charge until you select. Billing and the agreement are placeholders in this prototype.</p>
        <div className="actions-row">
          <Link to={`/buyer/projects/${id}`} className="btn ghost">
            Cancel
          </Link>
          <button
            type="button"
            className="btn primary"
            data-testid="confirm-select"
            onClick={() => {
              if (attempt(() => selectOperator(id, opId), setErr)) navigate(`/buyer/projects/${id}`);
            }}
          >
            Confirm and select {op.first}
          </button>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Intro requests page

export function BuyerIntros() {
  const s = useStore();
  const sess = useSession();
  const rows = s.intros.filter((i) => {
    const p = projectById(s, i.projectId);
    return p && p.ownerBuyerId === sess.buyerId;
  });
  return (
    <div className="page">
      <Band title="Intro requests" sub="Every intro you requested and whether the call is booked. Operators pick from three of your times with one tap." />
      {!rows.length && <Empty>No intro requests yet. Request one from a response on any project.</Empty>}
      <ul className="stack" data-testid="intro-list">
        {rows.map((i) => {
          const op = operatorById(i.operatorId)!;
          const p = projectById(s, i.projectId)!;
          return (
            <li key={i.id} className="card row-card" data-testid="intro-row">
              <Avatar op={op} size={40} />
              <div className="grow">
                <b>{displayName(op)}</b>
                <p className="muted">
                  {op.role} · <Link to={`/buyer/projects/${p.id}`}>{p.title}</Link> · {shortDate(i.createdAt)}
                </p>
              </div>
              {i.status !== "approved" ? (
                <span className="pill pill-muted">Withdrawn</span>
              ) : i.bookedSlot ? (
                <span className="pill pill-strong" data-testid="intro-booked">
                  Call booked {i.bookedSlot}
                </span>
              ) : (
                <span className="pill pill-tint">Waiting for a time</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { ActionError, inviteOf };
