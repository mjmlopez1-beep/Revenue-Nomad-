// Operator dashboard in the live revenuenomad.com layout (canvas L1 to L4).
// Same shared store as the buyer and admin flows.

import { useEffect, useState, type ReactNode } from "react";
import type { Operator, Project, State } from "../../lib/types";
import { CATEGORIES, buyerById, completeness, displayName, operatorById, photoUrl } from "../../lib/data";
import {
  DECLINE_REASONS,
  alertOf,
  allOpenRoles,
  askQuestion,
  bookTime,
  canEditResponse,
  companyRevealed,
  confirmAvailability,
  declineProject,
  inPortal,
  introOf,
  inviteOf,
  nowOf,
  operatorPortal,
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
  responsesFor,
  saveDraftResponse,
  setAlertPrefs,
  submitResponse,
  takeHome,
  takeHomeLine,
  updateResponse,
  useSession,
  useStore,
  viewProjectAsOperator,
  withdrawResponse,
  type OpStatus,
  type PortalItem,
} from "../../lib/store";
import { FIT_PARTS, seatCategory, type FitResult } from "../../lib/fit";
import { ago, hoursRange, isoDay, rateLabel, shortDate } from "../../lib/format";
import { Link, navigate, useLocation } from "../../lib/router";
import { attempt } from "../common";
import { useFitLifts, useNextMoves } from "./Work";

const DAY = 86400000;

function useMe(): { s: State; op: Operator } {
  const s = useStore();
  const sess = useSession();
  return { s, op: operatorById(sess.operatorId)! };
}

export function longDate(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const d = typeof v === "number" ? new Date(v) : new Date(String(v).length === 10 ? v + "T12:00:00Z" : v);
  return `${shortDate(d.getTime())}, ${d.getUTCFullYear()}`;
}

/** Fit shown as a ring, as on the live dashboard. */
export function Ring({ value, size = 56, label, testId }: { value: number; size?: number; label?: string; testId?: string }) {
  const r = 27;
  const c = 2 * Math.PI * r;
  return (
    <span className="lv-ring-wrap">
      <span className="lv-ring" style={{ width: size, height: size }} data-testid={testId}>
        <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
          <circle cx="32" cy="32" r={r} fill="none" stroke="var(--lv-ring-track)" strokeWidth="5" />
          <circle cx="32" cy="32" r={r} fill="none" stroke="var(--lv-ring)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 32 32)" />
        </svg>
        <b style={{ fontSize: Math.round(size * 0.29) }}>{value}</b>
      </span>
      {label && <small>{label}</small>}
    </span>
  );
}

export function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 7h10M8 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function Msg({ tone, children, testId }: { tone: "ok" | "warn" | "error"; children: ReactNode; testId?: string }) {
  return (
    <div className={`lv-msg lv-${tone}`} role={tone === "error" ? "alert" : "status"} data-testid={testId}>
      {children}
    </div>
  );
}

function sourceLabel(src: PortalItem["source"]) {
  return src === "invite" ? "Invited by client" : src === "rn_suggested" ? "Suggested by Revenue Nomad" : src === "admin" ? "Invited by Revenue Nomad" : src === "alert" ? "Open role alert" : "Open role";
}

/** Operator-facing status words on the live layout say "client", not "buyer". */
function statusWord(st: OpStatus | null): string | null {
  return st === "Buyer viewed" ? "Client viewed" : st === "Closed" ? "Not selected" : st;
}

function dueChip(s: State, p: Project): string | null {
  const now = nowOf(s);
  if (p.postedAt && now - p.postedAt < DAY) return "New";
  if (!p.respondBy || p.status !== "live") return null;
  const days = Math.ceil((p.respondBy - now) / DAY);
  if (days < 0) return null;
  return days === 0 ? "Closes today" : `Closes in ${days} day${days === 1 ? "" : "s"}`;
}

function metaLine(s: State, p: Project, opId: string, extra?: string) {
  return [projectCompanyLine(s, p, opId), `${hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax).replace("-", " to ")} hrs a month`, p.term, `Start ${shortDate(p.startTarget)}`, p.location.split(",")[0], extra]
    .filter(Boolean)
    .join(" · ");
}

// ---------------------------------------------------------------- shell

export function LiveShell({ children }: { children: ReactNode }) {
  const { s, op } = useMe();
  const { path } = useLocation();
  const [menu, setMenu] = useState(false);
  const invites = op ? operatorPortal(s, op.id).invited.length : 0;
  const nav: { to: string; label: string; badge?: number; match: (p: string) => boolean }[] = [
    { to: "/dashboard", label: "Overview", match: (p) => p === "/dashboard" },
    { to: "/dashboard/projects", label: "Projects", badge: invites, match: (p) => p.startsWith("/dashboard/projects") },
    { to: "/dashboard/jobs", label: "Jobs", match: (p) => p.startsWith("/dashboard/jobs") },
    { to: "/dashboard/prospects", label: "Prospects", match: (p) => p.startsWith("/dashboard/prospects") },
    { to: "/dashboard/intros", label: "Intros", match: (p) => p.startsWith("/dashboard/intros") },
    { to: `/operators/${op?.slug}`, label: "My Profile", match: (p) => !!op && p === `/operators/${op.slug}` },
  ];
  if (!op) return null;
  return (
    <div className="live">
      <header className="lv-head">
        <Link to="/dashboard" className="lv-logo" aria-label="Revenue Nomad home">
          <img src={logoUrl()} alt="Revenue Nomad" width={212} height={24} />
        </Link>
        <nav className="lv-nav" aria-label="Dashboard">
          {nav.map((n) => (
            <Link key={n.label} to={n.to} aria-current={n.match(path) ? "page" : undefined}>
              {n.label}
              {!!n.badge && (
                <span className="lv-badge" data-testid="projects-badge">
                  {n.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="lv-acct-wrap">
          <button type="button" className="lv-acct" aria-expanded={menu} onClick={() => setMenu(!menu)} data-testid="signed-in-as">
            <span className="lv-acct-av">{op.initials}</span>
            <span className="lv-acct-who">
              <b>{displayName(op)}</b>
              <small>{op.role}</small>
            </span>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
          {menu && (
            <div className="lv-menu" role="menu">
              <Link to="/dashboard/availability" role="menuitem" onClick={() => setMenu(false)}>
                Availability and alerts
              </Link>
              <Link to={`/operators/${op.slug}`} role="menuitem" onClick={() => setMenu(false)}>
                My profile
              </Link>
              <Link to="/operators" role="menuitem" onClick={() => setMenu(false)}>
                Browse operators
              </Link>
            </div>
          )}
        </div>
      </header>
      <main className="lv-main" id="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

let logoBase = "/rnp/";
export function configureLiveAssets(base: string) {
  logoBase = base;
}
function logoUrl() {
  return `${logoBase}rn-logo.png`;
}

// ---------------------------------------------------------------- L1 overview

export function LiveOverview() {
  const { s, op } = useMe();
  const portal = operatorPortal(s, op.id);
  const comp = completeness(op);
  const moves = useNextMoves(s, op);
  const { lifts, strongNow, total } = useFitLifts(s, op);
  const st = opState(s, op.id);
  const myIntros = s.intros.filter((i) => i.operatorId === op.id && i.status === "approved");
  const sent = portal.responded.length;
  const applied = Object.values(st.jobs || {}).filter((m) => m.status === "applied").length;
  const reached = Object.values(st.prospects || {}).filter((m) => m.status !== "dismissed");
  const replies = reached.filter((m) => m.status === "replied" || m.status === "meeting").length;
  const invites = new Map(portal.invited.map((it) => [`inv-${it.project.id}`, it]));
  return (
    <div className="lv-stack">
      <section className="lv-hello">
        <div>
          <h1>
            Welcome back, <span className="lv-green">{op.first}.</span>
          </h1>
          <p data-testid="hello-sub">
            {moves.length ? `${moves.length} thing${moves.length === 1 ? " needs" : "s need"} you.` : "You're all caught up."} {strongNow} of the {total} roles open right now are a strong fit for you.
          </p>
        </div>
        {comp.pct < 100 && (
          <Link to={`/operators/${op.slug}`} className="lv-hello-prof">
            <Ring value={comp.pct} size={44} />
            <span>
              <b>Finish your profile</b>
              <small>Complete profiles get invited first</small>
            </span>
          </Link>
        )}
      </section>

      <section className="lv-card" data-testid="next-moves">
        <div className="lv-card-head">
          <h2>Next up</h2>
          {portal.openRoles.length > 0 && (
            <Link to="/dashboard/projects?tab=open" className="lv-link">
              {portal.openRoles.length} open role{portal.openRoles.length === 1 ? "" : "s"} match you
            </Link>
          )}
        </div>
        {!moves.length && <div className="lv-empty">Nothing is waiting on you. New invites and follow-ups show up here the moment they're due.</div>}
        <div className="lv-list">
          {moves.map((m) => {
            const it = invites.get(m.key);
            if (it)
              return (
                <div key={m.key} className="lv-invite" data-testid="overview-invite" data-project={it.project.id}>
                  <div className="lv-invite-l">
                    <div className="lv-chips">
                      <span className="lv-chip lv-chip-inv">{sourceLabel(it.source)}</span>
                      {dueChip(s, it.project) && <span className="lv-chip lv-chip-due">{dueChip(s, it.project)}</span>}
                    </div>
                    <b className="lv-invite-t">{it.project.title}</b>
                    <span className="lv-muted">{metaLine(s, it.project, op.id)}</span>
                  </div>
                  <div className="lv-invite-r">
                    <Ring value={it.fit.fit} label="Your fit" />
                    <Link to={`/dashboard/projects/${it.project.id}`} className="lv-btn lv-btn-pri">
                      Respond <Arrow />
                    </Link>
                  </div>
                </div>
              );
            return (
              <div key={m.key} className="lv-move" data-testid="next-move">
                <span>{m.text}</span>
                {m.to ? (
                  <Link to={m.to} className="lv-btn lv-btn-sm">
                    {m.cta}
                  </Link>
                ) : (
                  <button type="button" className="lv-btn lv-btn-sm" onClick={m.onClick}>
                    {m.cta}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="lv-two">
        <div className="lv-card" data-testid="raise-fit">
          <div className="lv-card-head">
            <div>
              <h2>Raise your fit</h2>
              <p>Re-scored against every role open today. Each change is worth the roles shown.</p>
            </div>
          </div>
          {!lifts.length && <div className="lv-empty">Your profile already scores as well as it can on today's roles.</div>}
          <div className="lv-list">
            {lifts.map((l) => (
              <div key={l.key} className="lv-lift" data-testid="fit-lift">
                <span className="lv-lift-gain">+{l.gain}</span>
                <span className="grow">
                  <b>{l.text}</b>
                  <small>{l.sub}</small>
                </span>
                <Link to={l.to} className="lv-link">
                  {l.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
        <div className="lv-card" data-testid="your-pipeline">
          <div className="lv-card-head">
            <div>
              <h2>Your pipeline</h2>
              <p>Everything you mark trains your matches and reminders.</p>
            </div>
          </div>
          <div className="lv-pipe">
            <Link to="/dashboard/projects?tab=responded">
              <b data-testid="overview-invites">{sent}</b>
              <span>Project responses</span>
            </Link>
            <Link to="/dashboard/intros">
              <b data-testid="overview-intros">{myIntros.length}</b>
              <span>Client intros</span>
            </Link>
            <Link to="/dashboard/jobs">
              <b>{applied}</b>
              <span>Jobs applied</span>
            </Link>
            <Link to="/dashboard/prospects">
              <b>{reached.length}</b>
              <span>{reached.length ? `Prospects reached · ${replies} repl${replies === 1 ? "y" : "ies"}` : "Prospects reached"}</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- L2 projects

type Tab = "all" | "invited" | "open" | "responded" | "closed";

function AvailabilityWidget({ s, op }: { s: State; op: Operator }) {
  const st = opState(s, op.id);
  const off = st.availability === "unavailable";
  return (
    <div className="lv-availw" data-testid="availability-card">
      <span className={`lv-availw-dot ${off ? "off" : ""}`} aria-hidden="true" />
      <span className="lv-availw-t">
        <b>
          {off ? "Not available" : st.availability === "from" ? `Open from ${shortDate(st.availableFrom)}` : "Open"} · {st.hoursPerMonth ?? op.hrs} hrs a month
        </b>
        {st.lastConfirmedAt ? (
          <small data-testid="confirmed">Availability confirmed {shortDate(st.lastConfirmedAt)}</small>
        ) : (
          <small className="lv-warn-t" data-testid="not-confirmed">
            Not confirmed
          </small>
        )}
      </span>
      {!st.lastConfirmedAt && !off && (
        <button type="button" className="lv-btn lv-btn-sm" onClick={() => confirmAvailability(op.id, "open")} data-testid="still-available">
          Still available
        </button>
      )}
      <button type="button" className="lv-btn lv-btn-sm" onClick={() => navigate("/dashboard/availability")}>
        Update
      </button>
    </div>
  );
}

export function LiveProjects() {
  const { s, op } = useMe();
  const { query } = useLocation();
  const [tab, setTab] = useState<Tab>(((["all", "invited", "open", "responded", "closed"] as Tab[]).includes(query.get("tab") as Tab) ? query.get("tab") : "all") as Tab);
  const [q, setQ] = useState("");
  const [allRoles, setAllRoles] = useState(false);
  useEffect(() => {
    const t = query.get("tab") as Tab;
    if (t) setTab(t);
  }, [query]);
  const portal = operatorPortal(s, op.id);
  const openRoles: PortalItem[] = allRoles
    ? allOpenRoles(s)
        .filter((p) => !inPortal(s, p.id, op.id))
        .map((p) => ({ project: p, status: null, source: alertOf(s, p.id, op.id) ? "alert" : "browse", fit: projectFit(p, op), sub: "", when: p.postedAt || 0 }))
    : portal.openRoles;
  const groups: { key: Exclude<Tab, "all">; testId: string; items: PortalItem[] }[] = [
    { key: "invited", testId: "sec-invited", items: portal.invited },
    { key: "open", testId: "sec-roles", items: openRoles },
    { key: "responded", testId: "sec-responded", items: portal.responded },
    { key: "closed", testId: "sec-closed", items: portal.closed },
  ];
  const t = q.trim().toLowerCase();
  const match = (it: PortalItem) => !t || `${it.project.title} ${it.project.companyDescriptor} ${it.project.scope || ""} ${it.project.successIn90Days} ${it.project.mustHaves.join(" ")}`.toLowerCase().includes(t);
  const labels: Record<Tab, string> = { all: "All", invited: "Invited", open: "Open roles", responded: "Responded", closed: "Closed" };
  const count = (k: Tab) => (k === "all" ? groups.reduce((a, g) => a + g.items.length, 0) : groups.find((g) => g.key === k)!.items.length);
  const shown = groups.filter((g) => tab === "all" || g.key === tab);
  const total = shown.reduce((a, g) => a + g.items.filter(match).length, 0);
  return (
    <div className="lv-stack">
      <div className="lv-pagehead">
        <div>
          <h1>Projects</h1>
          <p>Engagements you were invited to, open roles that match you, and where each response stands.</p>
        </div>
        <AvailabilityWidget s={s} op={op} />
      </div>
      <div className="lv-toolbar">
        <div className="lv-tabs" role="group" aria-label="Filter projects">
          {(Object.keys(labels) as Tab[]).map((k) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => (setTab(k), navigate(k === "all" ? "/dashboard/projects" : `/dashboard/projects?tab=${k}`, { replace: true }))} data-testid={`lv-tab-${k}`}>
              {labels[k]} (<span data-testid={k === "open" ? "open-roles-count" : undefined}>{count(k)}</span>)
            </button>
          ))}
        </div>
        <label className="lv-search">
          <span className="sr-only">Search projects</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search role, industry, or scope" aria-label="Search projects" />
        </label>
      </div>
      {tab === "open" && (
        <label className="lv-check">
          <input type="checkbox" checked={allRoles} onChange={(e) => setAllRoles(e.target.checked)} /> Show every open role, not only ones matching my alert settings
        </label>
      )}
      {!total && <div className="lv-empty">{t ? `Nothing matches "${q.trim()}".` : tab === "open" ? "No open roles match right now." : "Nothing here yet."}</div>}
      {shown.map((g) => (
        <div key={g.key} className="lv-list" data-testid={g.testId}>
          {g.items.filter(match).map((it) => (
            <ProjectRow key={it.project.id} s={s} op={op} it={it} open={g.key === "open"} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ProjectRow({ s, op, it, open }: { s: State; op: Operator; it: PortalItem; open: boolean }) {
  const p = it.project;
  const r = responseOf(s, p.id, op.id);
  const status = open ? null : statusWord(it.status);
  const chipLabel = open ? sourceLabel(it.source) : status === "Invited" || status === "Draft saved" ? `${sourceLabel(it.source)}${status === "Draft saved" ? " · draft saved" : ""}` : status;
  const cls = status === "Intro requested" || status === "Selected" ? "lv-chip-intro" : status === "Not selected" || status === "Passed" ? "lv-chip-closed" : open ? "lv-chip-open" : status === "Responded" ? "lv-chip-sent" : "lv-chip-inv";
  const due = !open && (status === "Invited" || status === "Draft saved") ? dueChip(s, p) : null;
  const responded = r && r.submittedAt && !r.draft;
  const cta = open ? "View role" : responded ? (status === "Not selected" || status === "Passed" ? "View" : "View status") : "Respond";
  const primary = cta === "Respond" || status === "Intro requested" || status === "Selected";
  const meta = responded && r!.interest === "interested" ? metaLine(s, p, op.id, `${rateLabel(r!.rate)} · Responded ${shortDate(r!.submittedAt)}`) : metaLine(s, p, op.id);
  return (
    <article className="lv-proj" data-testid={open ? "open-role" : "portal-item"} data-project={p.id}>
      <div className="lv-proj-l">
        <div className="lv-chips">
          <span className={`lv-chip ${cls}`} data-testid={open ? undefined : "op-status"}>
            {chipLabel}
          </span>
          {due && <span className="lv-chip lv-chip-due">{due}</span>}
          {p.status === "paused" && <span className="lv-chip lv-chip-closed">Paused</span>}
        </div>
        <h3>
          <Link to={`/dashboard/projects/${p.id}`}>{p.title}</Link>
        </h3>
        <span className="lv-muted">
          {meta}
          {it.sub ? ` · ${it.sub}` : ""}
        </span>
        <div className="lv-scope">
          <small>GTM Problem / Scope</small>
          <span>{p.scope || p.successIn90Days}</span>
        </div>
      </div>
      <div className="lv-proj-r">
        <Ring value={it.fit.fit} label="Your fit" />
        <Link to={`/dashboard/projects/${p.id}`} className={`lv-btn ${primary ? "lv-btn-pri" : ""}`}>
          {cta} {primary && <Arrow />}
        </Link>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- L3 / L4 project

export function LiveProject({ id }: { id: string }) {
  const { s, op } = useMe();
  const { query } = useLocation();
  const p = projectById(s, id);
  useEffect(() => {
    if (p && p.status !== "draft") viewProjectAsOperator(id, op.id);
  }, [id, op.id, p?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const crumb = (title: string) => (
    <nav className="lv-crumb" aria-label="Breadcrumb">
      <Link to="/dashboard/projects">Projects</Link>
      <span aria-hidden="true">/</span>
      <span>{title}</span>
    </nav>
  );
  if (!p || p.status === "draft")
    return (
      <div className="lv-stack">
        {crumb("Not available")}
        <div className="lv-empty">This project is not available.</div>
      </div>
    );
  const inv = inviteOf(s, id, op.id);
  const al = alertOf(s, id, op.id);
  const r = responseOf(s, id, op.id);
  if (!inv && p.visibility !== "invites_plus_open" && !r)
    return (
      <div className="lv-stack">
        {crumb(p.title)}
        <div className="lv-empty">This project is invite only, and you were not invited.</div>
      </div>
    );
  const submitted = !!(r && r.submittedAt && !r.draft);
  const editing = submitted && query.get("edit") === "1" && canEditResponse(s, id, op.id);
  const fit = submitted && r!.interest === "interested" ? responseFit(p, r!) : projectFit(p, op);
  const src = inv ? (inv.source === "buyer" ? "Invited by client" : inv.source === "rn_suggested" ? "Suggested by Revenue Nomad" : "Invited by Revenue Nomad") : al ? "Open role alert" : "Open role";
  const status = statusWord(operatorStatus(s, p, op.id));
  const revealed = companyRevealed(s, p, op.id);
  const company = p.origin === "buyer" ? buyerById(p.ownerBuyerId)?.company : p.clientName;
  const showStatus = submitted && !editing;
  const due = !submitted ? dueChip(s, p) : null;
  return (
    <div className="lv-stack">
      {crumb(p.title)}
      <section className="lv-hero">
        <div className="lv-hero-top">
          <div className="lv-hero-l">
            <div className="lv-chips">
              <span className="lv-chip lv-chip-white" data-testid="op-source">
                {src}
              </span>
              {status && status !== "Invited" && (
                <span className={`lv-chip ${status === "Intro requested" || status === "Selected" ? "lv-chip-intro" : "lv-chip-white"}`} data-testid="op-project-status">
                  {status}
                </span>
              )}
              {due && <span className="lv-chip lv-chip-due">{p.respondBy ? `Closes ${shortDate(p.respondBy)}` : due}</span>}
              {!inPortal(s, id, op.id) && (
                <span className="lv-chip lv-chip-white" data-testid="not-in-portal">
                  Not in your projects until you respond
                </span>
              )}
            </div>
            <h1>
              {p.title}
              {revealed && p.hideCompanyUntilIntro ? <span data-testid="company-revealed"> at {company}</span> : null}
            </h1>
            <p>
              {revealed
                ? p.hideCompanyUntilIntro
                  ? "The client requested an intro, so their name is now visible to you"
                  : p.companyDescriptor
                : `${p.companyDescriptor} · The company name is shared when the client requests an intro`}
            </p>
          </div>
          <Ring value={fit.fit} size={96} label={showStatus ? "Final fit" : "Your fit"} testId="fit-ring" />
        </div>
        {showStatus && r!.interest === "interested" && !r!.withdrawn && <StepTracker s={s} p={p} op={op} />}
      </section>

      {showStatus ? (
        <StatusBody s={s} p={p} op={op} />
      ) : (
        <div className="lv-cols">
          <div className="lv-col-l">
            <EngagementCard p={p} />
            <WhyCard fit={fit} noRate={(submitted ? r!.rate : op.rate) == null} op={op} p={p} />
          </div>
          <div className="lv-col-r">
            <RespondCard s={s} p={p} op={op} editing={editing} />
            <QuestionsCard s={s} p={p} op={op} />
          </div>
        </div>
      )}
    </div>
  );
}

function EngagementCard({ p }: { p: Project }) {
  const th = takeHomeLine(p);
  const facts: [string, string, string?][] = [
    ["Role needed", seatRole(p)],
    ["Hours per month", hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax).replace("-", " to ")],
    ["Operator take-home", th || "Set by you", "rate-to-you"],
    ["Term", p.term],
    ["Start", longDate(p.startTarget)],
    ["Location", p.location],
  ];
  return (
    <section className="lv-card">
      <h2>The engagement</h2>
      <div className="lv-facts">
        {facts.map(([k, v, tid]) => (
          <div key={k}>
            <small>{k}</small>
            <b data-testid={tid}>{v}</b>
          </div>
        ))}
      </div>
      {p.scope && (
        <div className="lv-box">
          <small>GTM Problem / Scope</small>
          <span>{p.scope}</span>
        </div>
      )}
      <div className="lv-box">
        <small>Success in 90 days</small>
        <span>{p.successIn90Days}</span>
      </div>
      <div className="lv-tags">
        {p.mustHaves.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      {p.origin === "buyer" && <p className="lv-fine">Take-home is what you are paid per hour, after Revenue Nomad&apos;s fee. You set your own rate in your response.</p>}
    </section>
  );
}

function seatRole(p: Project): string {
  return p.title.replace(/^(Fractional|Interim)\s+/i, "") || seatCategory(p.title);
}

/** Fit reasons as operators may read them: never the client's budget (gap G17). */
export function operatorSafe(line: string, p: Project): string {
  return line
    .replace(/is over the \$\d+ budget/, p.origin === "revenue_nomad" ? `is above the ${takeHomeLine(p) || "set"} pay rate` : "is above the client's range")
    .replace(/is inside budget/, p.origin === "revenue_nomad" ? "fits the pay rate" : "is inside the client's range");
}

function WhyCard({ fit, noRate, op, p }: { fit: FitResult; noRate: boolean; op: Operator; p: Project }) {
  const plusN = fit.plus ? fit.plus.split(". ").length : 0;
  const lines = [fit.plus, fit.minus]
    .filter(Boolean)
    .flatMap((x) => x.split(". "))
    .map((l) => operatorSafe(l, p));
  const inds = (op.allIndustries || []).map((i) => i.toLowerCase());
  const wantsHealth = /health/i.test(`${p.companyDescriptor} ${p.mustHaves.join(" ")}`);
  return (
    <section className="lv-why" data-testid="why-card">
      <h2>Why you scored {fit.fit}</h2>
      <div className="lv-why-box">
        {lines.map((l, i) => (
          <span key={i} className={i < plusN ? "plus" : "minus"}>
            {l}
          </span>
        ))}
        {wantsHealth && !inds.includes("health care") && (
          <span className="minus">
            No healthcare engagement logged yet. <Link to={`/operators/${op.slug}`}>Add one</Link> to raise this score
          </span>
        )}
      </div>
      <div className="lv-parts">
        {FIT_PARTS.map((part, i) => (
          <div key={part.label}>
            <small>{part.label}</small>
            <b data-testid={`part-${i}`}>
              {fit.parts[i]}/{part.max}
            </b>
            <span className="lv-bar">
              <i style={{ width: `${(fit.parts[i] / part.max) * 100}%` }} />
            </span>
            {i === 2 && noRate && <em>No rate listed</em>}
          </div>
        ))}
      </div>
      <p>The client sees your fit score next to your response. Screening answers are not scored yet; the four parts above are the whole score.</p>
    </section>
  );
}

function RespondCard({ s, p, op, editing }: { s: State; p: Project; op: Operator; editing: boolean }) {
  const r = responseOf(s, p.id, op.id);
  const [mode, setMode] = useState<"interested" | "pass">("interested");
  const [rate, setRate] = useState<string>(r?.rate != null ? String(r.rate) : op.rate != null ? String(op.rate) : "");
  const [hours, setHours] = useState<string>(r?.hoursPerMonth != null ? String(r.hoursPerMonth) : String(Math.min(op.hrs || 0, p.hoursPerMonthMax) || ""));
  const [start, setStart] = useState<string>(r?.canStart || p.startTarget);
  const [answers, setAnswers] = useState<string[]>(p.screeningQuestions.map((_q, i) => r?.answers?.[i] || ""));
  const [note, setNote] = useState(r?.note || "");
  const [proof, setProof] = useState<string[]>(r?.proof || []);
  const [choosing, setChoosing] = useState(false);
  const [reason, setReason] = useState("");
  const [passNote, setPassNote] = useState("");
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const blocked = editing ? null : respondBlockedMessage(p);
  const hrsNum = Number(hours);
  const range = takeHome(p);
  const rateNum = Number(rate.replace(/[$,/hr ]/g, ""));
  const overRange = !!range && rate.trim() !== "" && rateNum > range[1];
  const overHours = hours !== "" && hrsNum > (op.hrs || 0);
  const engagements = op.profile?.details?.engagements || [];
  const input = () => ({
    rate: rate.trim() === "" ? null : Number(rate.replace(/[$,/hr ]/g, "")),
    hoursPerMonth: hours.trim() === "" ? null : Number(hours),
    canStart: start || null,
    answers,
    note,
    proof,
  });
  if (blocked)
    return (
      <section className="lv-card" data-testid="respond-blocked">
        <h2>Your response</h2>
        <Msg tone="warn">{blocked}</Msg>
        <button type="button" className="lv-btn lv-btn-pri" disabled>
          I&apos;m interested
        </button>
      </section>
    );
  const fe = (f: string) => (err?.field === f ? <span className="lv-err">{err.msg}</span> : null);
  return (
    <section className="lv-card" data-testid="respond-form">
      <div>
        <h2>{editing ? "Edit your response" : "Your response"}</h2>
        <p className="lv-muted">{editing ? "You can edit until the client opens it." : "About two minutes. The client only sees it once you submit."}</p>
      </div>
      {r?.draft && (
        <p className="lv-fine" data-testid="draft-note">
          Draft saved {ago(r.updatedAt, nowOf(s))}. The client never sees a draft.
        </p>
      )}
      {!editing && (
        <div className="lv-seg" role="group" aria-label="Your response">
          <button type="button" aria-pressed={mode === "interested"} onClick={() => setMode("interested")} data-testid="mode-interested">
            I&apos;m interested
          </button>
          <button type="button" aria-pressed={mode === "pass"} onClick={() => setMode("pass")} data-testid="mode-pass">
            Not for me
          </button>
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
          className="lv-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            attempt(
              () => {
                if (editing) {
                  updateResponse(p.id, op.id, input());
                  navigate(`/dashboard/projects/${p.id}`, { replace: true });
                  return;
                }
                const res = submitResponse(p.id, op.id, input());
                navigate(`/dashboard/projects/${p.id}${res.warning ? "?warn=hours" : ""}`, { replace: true });
              },
              (msg, field) => setErr({ msg, field }),
            );
          }}
        >
          <div className="lv-grid3">
            <label className="lv-field">
              <span>Your rate{op.rate == null ? " (required)" : ""}</span>
              <input inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="$185/hr" aria-invalid={err?.field === "rate"} data-testid="r-rate" />
              {fe("rate")}
            </label>
            <label className="lv-field">
              <span>Hours a month</span>
              <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} aria-invalid={err?.field === "hours"} data-testid="r-hours" />
              {fe("hours")}
            </label>
            <label className="lv-field">
              <span>Can start</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={err?.field === "canStart"} data-testid="r-start" />
              {fe("canStart")}
            </label>
          </div>
          {overRange ? (
            <div className="lv-rangewarn" data-testid="rate-warn">
              <span>
                ${rateNum} is above this client&apos;s range of {takeHomeLine(p)} take-home, so you&apos;ll show as over budget.
              </span>
              <button type="button" className="lv-btn lv-btn-sm" onClick={() => setRate(String(range![1]))} data-testid="rate-use-max">
                Use ${range![1]}
              </button>
            </div>
          ) : (
            <p className="lv-fine">Rate is your take-home. Prefilled from your profile.{takeHomeLine(p) ? ` This client's range is ${takeHomeLine(p)}.` : ""}</p>
          )}
          {overHours && (
            <Msg tone="warn" testId="hours-warning">
              {hrsNum} hrs a month is more than the {op.hrs} on your profile. That&apos;s fine, the fit score will use {hrsNum}.
            </Msg>
          )}
          {p.screeningQuestions.map((q, i) => (
            <label key={i} className="lv-field">
              <span>
                {i + 1}. {q}
              </span>
              <textarea rows={3} value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} aria-invalid={err?.field === `answer-${i}`} data-testid={`r-answer-${i}`} />
              {fe(`answer-${i}`)}
            </label>
          ))}
          <label className="lv-field">
            <span>
              Note to the client <em>optional</em>
            </span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="r-note" />
          </label>
          <div className="lv-proof">
            <div>
              <b>Attach proof</b>
              <small>{proof.length ? `Attached: ${proof.join(", ")}` : "Pick case studies from your profile to show the client first"}</small>
            </div>
            <button type="button" className="lv-btn lv-btn-sm" aria-expanded={choosing} onClick={() => setChoosing(!choosing)} data-testid="choose-proof" disabled={!engagements.length}>
              {engagements.length ? "Choose" : "None on profile"}
            </button>
          </div>
          {choosing && (
            <div className="lv-proof-list" role="group" aria-label="Case studies">
              {engagements.map((e) => (
                <label key={e.company + e.start} className="lv-check">
                  <input type="checkbox" checked={proof.includes(e.company)} onChange={(ev) => setProof(ev.target.checked ? [...proof, e.company] : proof.filter((x) => x !== e.company))} />
                  {e.company}, {e.role} · {e.months} months
                </label>
              ))}
            </div>
          )}
          <button type="submit" className="lv-btn lv-btn-pri lv-btn-block" data-testid="submit-response">
            {editing ? "Update response" : "Submit response"} <Arrow />
          </button>
          {editing ? (
            <button type="button" className="lv-btn lv-btn-block" onClick={() => navigate(`/dashboard/projects/${p.id}`)}>
              Cancel
            </button>
          ) : (
            <button
              type="button"
              className="lv-btn lv-btn-block"
              data-testid="save-draft"
              onClick={() => attempt(() => (saveDraftResponse(p.id, op.id, input()), setSaved("Draft saved. The client never sees a draft.")), (msg) => setErr({ msg }))}
            >
              Save draft and finish later
            </button>
          )}
        </form>
      ) : (
        <form
          className="lv-form"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            attempt(() => (declineProject(p.id, op.id, reason, passNote), navigate("/dashboard/projects")), (msg, field) => setErr({ msg, field }));
          }}
        >
          <div>
            <b>What made it a pass?</b>
            <p className="lv-fine">Only Revenue Nomad sees this. It tunes which projects we send you.</p>
          </div>
          <div className="lv-pills" role="group" aria-label="Reason">
            {DECLINE_REASONS.map((x) => (
              <button key={x} type="button" aria-pressed={reason === x} onClick={() => setReason(x)}>
                {x}
              </button>
            ))}
          </div>
          {fe("reason")}
          <label className="lv-field">
            <span>
              Anything else <em>optional</em>
            </span>
            <textarea rows={2} value={passNote} onChange={(e) => setPassNote(e.target.value)} data-testid="pass-note" />
          </label>
          <button type="submit" className="lv-btn lv-btn-pri lv-btn-block" data-testid="pass-project">
            Pass on this project
          </button>
          <p className="lv-fine">
            Not available right now? <Link to="/dashboard/availability">Update your availability</Link> so invites pause.
          </p>
        </form>
      )}
    </section>
  );
}

function StepTracker({ s, p, op }: { s: State; p: Project; op: Operator }) {
  const r = responseOf(s, p.id, op.id)!;
  const status = statusWord(operatorStatus(s, p, op.id));
  const lost = status === "Not selected";
  const rn = p.origin === "revenue_nomad";
  const order = rn ? ["Responded", "Under review", "Selected"] : ["Responded", "Client viewed", "Intro requested", "Selected"];
  const at = lost ? (r.viewedAt && !rn ? 1 : 0) : Math.max(0, order.indexOf(status || "Responded"));
  const subs = rn
    ? [shortDate(r.submittedAt), status === "Under review" || status === "Selected" ? "Shared with the client" : "Waiting", status === "Selected" ? `Selected ${shortDate(p.staffedAt)}` : "Agreement and kickoff"]
    : [
        shortDate(r.submittedAt),
        r.viewedAt ? shortDate(r.viewedAt) : "Waiting",
        r.decision === "intro_requested" || r.decision === "selected" ? shortDate(r.decisionAt) : "Waiting",
        status === "Selected" ? `Selected ${shortDate(p.staffedAt)}` : "Agreement and kickoff",
      ];
  return (
    <ol className="lv-steps" aria-label="Where your response stands">
      {order.map((label, i) => {
        const isLast = i === order.length - 1;
        if (lost && isLast)
          return (
            <li key={label} className="lost">
              <span className="dot">{i + 1}</span>
              <span>
                <b>Not selected</b>
                <small>Seat staffed {shortDate(p.staffedAt || p.closedAt)}</small>
              </span>
            </li>
          );
        const done = i < at || (i === at && status === "Selected");
        const now = i === at && !done;
        return (
          <li key={label} className={done ? "done" : now ? "now" : ""}>
            <span className="dot">{done ? "✓" : i + 1}</span>
            <span>
              <b>{label}</b>
              <small>{i <= at || isLast ? subs[i] : "Waiting"}</small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StatusBody({ s, p, op }: { s: State; p: Project; op: Operator }) {
  const r = responseOf(s, p.id, op.id)!;
  const status = statusWord(operatorStatus(s, p, op.id));
  const { query } = useLocation();
  const intro = introOf(s, p.id, op.id);
  const bookIdx = query.get("book");
  useEffect(() => {
    // One-tap booking from the intro email: ?book=<slot index>.
    if (bookIdx == null) return;
    const slot = intro?.slots?.[Number(bookIdx)];
    if (slot && !intro?.bookedSlot) attempt(() => bookTime(p.id, op.id, slot), () => undefined);
    navigate(`/dashboard/projects/${p.id}`, { replace: true });
  }, [bookIdx]); // eslint-disable-line react-hooks/exhaustive-deps
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const portal = operatorPortal(s, op.id);
  const buyer = buyerById(p.ownerBuyerId);
  const company = p.origin === "buyer" ? buyer?.company : p.clientName;
  if (r.interest === "declined" || r.withdrawn)
    return (
      <section className="lv-card" data-testid="status-view">
        <h2>{r.withdrawn ? "You withdrew your response" : "You passed on this project"}</h2>
        <p className="lv-muted">
          Reason: {r.declineReason}
          {r.declineNote ? ` · ${r.declineNote}` : ""}. The client never sees a response from you.
        </p>
        <Link to="/dashboard/projects" className="lv-btn">
          Back to projects
        </Link>
      </section>
    );
  const reviewing = responsesFor(s, p.id).length;
  const booked = intro?.bookedSlot || null;
  return (
    <div className="lv-cols">
      <div className="lv-col-l" data-testid="status-view">
        <span className="sr-only" data-testid="status-now">
          {status}
        </span>
        {query.get("warn") === "hours" && (
          <Msg tone="warn" testId="hours-warning">
            You offered {r.hoursPerMonth} hrs a month, more than the {op.hrs} on your profile. The fit score uses {r.hoursPerMonth}.
          </Msg>
        )}
        {msg && <Msg tone={msg.tone}>{msg.text}</Msg>}
        {status === "Responded" && (
          <section className="lv-card">
            <h2>Your response is with the client</h2>
            <p className="lv-muted">
              Most clients review responses within three business days. You will get an email the moment they open it or ask for an intro. You can still edit your answers until they view them.
            </p>
            {canEditResponse(s, p.id, op.id) && (
              <div>
                <Link to={`/dashboard/projects/${p.id}?edit=1`} className="lv-btn" data-testid="edit-response">
                  Edit response
                </Link>
              </div>
            )}
          </section>
        )}
        {status === "Under review" && (
          <section className="lv-card">
            <h2>Revenue Nomad shared you with the client</h2>
            <p className="lv-muted">You are on the shortlist. We will tell you the moment the client wants a call.</p>
          </section>
        )}
        {status === "Client viewed" && (
          <section className="lv-card">
            <h2>The client read your response</h2>
            <p className="lv-muted">
              You are one of {reviewing} operator{reviewing === 1 ? "" : "s"} they are reviewing for this seat. Profiles with recent reviews get more intro requests, so this is a good moment to ask a past client for one.
            </p>
            <div>
              <Link to={`/operators/${op.slug}`} className="lv-btn lv-btn-pri">
                Request a review <Arrow />
              </Link>
            </div>
          </section>
        )}
        {status === "Intro requested" && buyer && (
          <section className="lv-card" data-testid="intro-card">
            <h2>{buyer.company} wants to talk</h2>
            <div className="lv-person">
              <span className="lv-acct-av">
                {buyer.contactName
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
              </span>
              <span>
                <b data-testid="buyer-contact">{buyer.contactName}</b>
                <small>
                  {buyer.contactTitle}, {buyer.company} · {buyer.email}
                </small>
              </span>
            </div>
            {booked ? (
              <div className="lv-box lv-box-ok" data-testid="booked">
                <b>Call booked</b> {booked}. {buyer.contactName} has it.
              </div>
            ) : (
              <>
                <small className="lv-label">Pick a time for a 30 minute call</small>
                <div className="lv-pills" role="group" aria-label="Book a time">
                  {(intro?.slots || []).map((sl) => (
                    <button
                      key={sl}
                      type="button"
                      onClick={() => attempt(() => (bookTime(p.id, op.id, sl), setMsg({ tone: "ok", text: `Booked ${sl}. ${buyer.contactName} got an email.` })), (m) => setMsg({ tone: "error", text: m }))}
                      data-testid="book-slot"
                    >
                      Book {sl}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="lv-row-btns">
              <button type="button" className="lv-btn" onClick={() => setReplying(!replying)} aria-expanded={replying} data-testid="reply">
                Reply
              </button>
            </div>
            {replying && (
              <div className="lv-form">
                <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} aria-label={`Reply to ${buyer.contactName}`} data-testid="reply-text" />
                <button
                  type="button"
                  className="lv-btn lv-btn-pri"
                  data-testid="reply-send"
                  onClick={() => attempt(() => (replyToBuyer(p.id, op.id, reply), setReply(""), setReplying(false), setMsg({ tone: "ok", text: `Reply sent to ${buyer.contactName}.` })), (m) => setMsg({ tone: "error", text: m }))}
                >
                  Send reply
                </button>
              </div>
            )}
            <p className="lv-fine">Revenue Nomad is copied on the intro and handles the agreement once you are selected.</p>
          </section>
        )}
        {status === "Selected" && (
          <section className="lv-won">
            <h2>You&apos;re selected</h2>
            <p>
              {company} picked you for this seat. Revenue Nomad will send the agreement for signature, then set up kickoff.
            </p>
            <div className="lv-won-grid">
              <span>
                <small>Next</small>
                <b>Sign agreement</b>
              </span>
              <span>
                <small>Kickoff</small>
                <b>{longDate(p.startTarget)}</b>
              </span>
              <span>
                <small>Logged as</small>
                <b>Active engagement</b>
              </span>
            </div>
          </section>
        )}
        {status === "Not selected" && (
          <section className="lv-card">
            <h2>The client went another direction</h2>
            <p className="lv-muted">
              The seat is staffed. Your response stays on file, and Revenue Nomad uses it to put you forward for similar roles.{" "}
              {portal.invited.length ? `You have ${portal.invited.length} other invite${portal.invited.length === 1 ? "" : "s"} open.` : ""}
            </p>
            <div>
              <Link to="/dashboard/projects?tab=invited" className="lv-btn lv-btn-pri">
                See open invites <Arrow />
              </Link>
            </div>
          </section>
        )}
        <QuestionsCard s={s} p={p} op={op} />
      </div>
      <div className="lv-col-r">
        <section className="lv-card">
          <h2>What you sent</h2>
          <dl className="lv-dl">
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
            {!!r.proof?.length && (
              <div>
                <dt>Proof</dt>
                <dd>{r.proof.join(", ")}</dd>
              </div>
            )}
          </dl>
        </section>
        <section className="lv-card">
          <h2>How this works</h2>
          <p className="lv-muted">You hear from us at every step. If the client passes, we tell you once the seat is staffed rather than leaving you waiting.</p>
          {status !== "Selected" && status !== "Not selected" && (
            <button type="button" className="lv-btn lv-btn-danger" onClick={() => attempt(() => withdrawResponse(p.id, op.id), (m) => setMsg({ tone: "error", text: m }))} data-testid="withdraw">
              Withdraw response
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

function QuestionsCard({ s, p, op }: { s: State; p: Project; op: Operator }) {
  const mine = questionsFor(s, p.id).filter((q) => q.operatorId === op.id);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  return (
    <section className="lv-card" data-testid="op-questions">
      <h2>Question for the {p.origin === "buyer" ? "client" : "Revenue Nomad team"}</h2>
      <p className="lv-fine">Answers are shared with you only.</p>
      {mine.map((q) => (
        <div key={q.id} className="lv-box" data-testid="my-question">
          <span>{q.text}</span>
          {q.answer ? (
            <span className="lv-answer" data-testid="my-answer">
              <b>Answer</b> {q.answer}
            </span>
          ) : (
            <small>Waiting for an answer.</small>
          )}
        </div>
      ))}
      {err && <Msg tone="error">{err}</Msg>}
      {sent && <Msg tone="ok">Question sent.</Msg>}
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your question" placeholder="Ask about scope, team, tools" data-testid="ask-text" />
      <div>
        <button type="button" className="lv-btn" onClick={() => attempt(() => (askQuestion(p.id, op.id, text), setText(""), setSent(true), setErr(null)), setErr)} data-testid="ask-send">
          Ask a question
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- intro requests + availability

export function LiveIntros() {
  const { s, op } = useMe();
  const mine = s.intros.filter((i) => i.operatorId === op.id);
  return (
    <div className="lv-stack">
      <div className="lv-pagehead">
        <div>
          <h1>Intro Requests</h1>
          <p>Clients who asked to talk with you. Book a time from the project, or reply.</p>
        </div>
      </div>
      {!mine.length && <div className="lv-empty">No intro requests yet. When a client asks to talk, it shows here and in your email.</div>}
      <div className="lv-list">
        {mine.map((i) => {
          const p = projectById(s, i.projectId)!;
          return (
            <article key={i.id} className="lv-proj" data-testid="op-intro">
              <div className="lv-proj-l">
                <div className="lv-chips">
                  <span className={`lv-chip ${i.bookedSlot ? "lv-chip-intro" : "lv-chip-due"}`}>{i.status !== "approved" ? "Withdrawn" : i.bookedSlot ? "Call booked" : "Pick a time"}</span>
                </div>
                <h3>
                  <Link to={`/dashboard/projects/${p.id}`}>{p.title}</Link>
                </h3>
                <span className="lv-muted">
                  {projectCompanyLine(s, p, op.id)} · Requested {shortDate(i.createdAt)}
                  {i.bookedSlot ? ` · ${i.bookedSlot}` : ""}
                </span>
              </div>
              <div className="lv-proj-r">
                <Link to={`/dashboard/projects/${p.id}`} className="lv-btn lv-btn-pri">
                  Open <Arrow />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function LiveAvailability() {
  const { s, op } = useMe();
  const { query } = useLocation();
  const st = opState(s, op.id);
  const [from, setFrom] = useState(st.availableFrom ? String(st.availableFrom).slice(0, 10) : isoDay(nowOf(s) + 14 * DAY));
  const [hours, setHours] = useState(String(st.hoursPerMonth ?? op.hrs));
  const [msg, setMsg] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<string[]>(st.alertPrefs);
  const pulse = query.get("pulse");
  useEffect(() => {
    // One-tap pulse links from email confirm straight away.
    if (pulse === "open" || pulse === "unavailable") {
      confirmAvailability(op.id, pulse);
      setMsg(pulse === "open" ? "Thanks. You're confirmed as open." : "Thanks. You're marked not available. Invites and alerts pause until you change this.");
      navigate("/dashboard/availability", { replace: true });
    }
  }, [pulse, op.id]);
  return (
    <div className="lv-stack lv-narrow">
      <div className="lv-pagehead">
        <div>
          <h1>Availability</h1>
          <p>Clients see when you last confirmed. One tap keeps it current.</p>
        </div>
      </div>
      {msg && <Msg tone="ok">{msg}</Msg>}
      <section className="lv-card" data-testid="availability-page">
        <h2>Right now</h2>
        <p className="lv-muted">
          {st.availability === "unavailable" ? "Not available" : st.availability === "from" ? `Open from ${shortDate(st.availableFrom)}` : "Open"} ·{" "}
          {st.lastConfirmedAt ? <span data-testid="confirmed">Confirmed {shortDate(st.lastConfirmedAt)}</span> : <span data-testid="not-confirmed">Not confirmed</span>}
        </p>
        <div className="lv-grid3">
          <label className="lv-field">
            <span>Hours a month</span>
            <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} />
          </label>
          <label className="lv-field">
            <span>Or open from</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
        </div>
        <div className="lv-row-btns">
          <button type="button" className="lv-btn lv-btn-pri" onClick={() => (confirmAvailability(op.id, "open", { hours: Number(hours) || null }), setMsg("Confirmed as open."))} data-testid="confirm-open">
            I&apos;m open now
          </button>
          <button type="button" className="lv-btn" onClick={() => (confirmAvailability(op.id, "from", { from, hours: Number(hours) || null }), setMsg(`Confirmed as open from ${shortDate(from)}.`))}>
            Open from that date
          </button>
          <button type="button" className="lv-btn lv-btn-danger" onClick={() => (confirmAvailability(op.id, "unavailable"), setMsg("Marked not available."))}>
            Not available
          </button>
        </div>
      </section>
      <section className="lv-card" data-testid="alert-settings">
        <h2>Alert settings</h2>
        <p className="lv-muted">You get a new role alert when an open project matches one of these. At most one alert a day; the rest roll into a digest.</p>
        <div className="lv-pills" role="group" aria-label="Alert categories">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" aria-pressed={prefs.includes(c)} onClick={() => setPrefs(prefs.includes(c) ? prefs.filter((x) => x !== c) : [...prefs, c])}>
              {c}
            </button>
          ))}
        </div>
        <div>
          <button type="button" className="lv-btn lv-btn-pri" onClick={() => (setAlertPrefs(op.id, prefs), setMsg("Alert settings saved."))}>
            Save alert settings
          </button>
        </div>
      </section>
    </div>
  );
}

export { photoUrl };
