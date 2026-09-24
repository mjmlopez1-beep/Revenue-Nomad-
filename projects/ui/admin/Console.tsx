// Revenue Nomad admin console (canvas A1 to A5): sidebar shell, Today, Projects,
// New project wizard, pipeline board and Send shortlist. Same shared store.

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { Operator, Project, RnStage, State } from "../../lib/types";
import { BUYERS, CATEGORIES, OPERATORS, buyerById, completeness, displayName, matchesQuery, normalizeCategory, operatorById, stableSort } from "../../lib/data";
import {
  ActionError,
  STAGES,
  STANDARD_MARGIN,
  audienceSegment,
  checkIn,
  createRnDraft,
  inviteOperator,
  invitesFor,
  isEnded,
  messageOperator,
  moveStage,
  noResponses72,
  nowOf,
  nudgeProfiles,
  profileNudgeTargets,
  PROFILE_NUDGE_COOLDOWN_DAYS,
  nudgeOperator,
  opState,
  ownerName,
  pipelineOf,
  projectById,
  projectCounts,
  projectFit,
  projectFlags,
  publishRnProject,
  questionsFor,
  reports,
  responseFit,
  responseOf,
  responsesFor,
  sendPulse,
  sendShortlist,
  setPipelineNote,
  suggestionsUsed,
  updateDraft,
  useStore,
  validateBrief,
  type BriefErrors,
} from "../../lib/store";
import { briefFromProject, fitScore, seatCategory, type FitResult } from "../../lib/fit";
import { ago, dayLabel, daysBetween, durationLabel, hoursRange, money, plural, shortDate, timeLabel } from "../../lib/format";
import { Link, navigate, useLocation } from "../../lib/router";
import { attempt } from "../common";
import { InvitePicker, QuestionsInbox } from "../buyer/Buyer";
import { MarketplaceAdoption, MarketplaceDiscovery } from "./People";

const DAY = 86400000;

// ---------------------------------------------------------------- shell

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function AdminShell({ crumb, children }: { crumb: ReactNode; children: ReactNode }) {
  const s = useStore();
  const { path } = useLocation();
  const needs = needsYou(s).length;
  const openProjects = s.projects.filter((p) => p.status !== "draft" && !isEnded(p)).length;
  const pendingIntros = s.intros.filter((i) => i.status === "approved" && !i.bookedSlot).length;
  const clients = clientList(s).length;
  const reviews = OPERATORS.reduce((a, o) => a + (o.profile?.reviews?.length || 0), 0);
  const staffed = s.projects.filter((p) => p.status === "staffed").length;
  const nav: { grp: string; items: { to: string; label: string; icon: string; ct?: number; hot?: boolean; match: (p: string) => boolean }[] }[] = [
    {
      grp: "Work",
      items: [
        { to: "/admin/today", label: "Today", icon: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z", ct: needs, hot: needs > 0, match: (p) => p === "/admin/today" },
        { to: "/admin/projects", label: "Projects", icon: "M3 4h18v16H3zM9 4v16M15 4v11", ct: openProjects, match: (p) => p.startsWith("/admin/projects") },
        { to: "/admin/intros", label: "Intro requests", icon: "M7 17 17 7M8 7h9v9", ct: pendingIntros, match: (p) => p === "/admin/intros" },
      ],
    },
    {
      grp: "Network",
      items: [
        { to: "/admin/operators", label: "Operators", icon: "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2c2.1.7 3.5 2.8 3.5 5.8", ct: OPERATORS.length, match: (p) => p === "/admin/operators" },
        { to: "/admin/clients", label: "Clients", icon: "M4 3h16v18H4zM9 7h1M14 7h1M9 11h1M14 11h1M10 21v-4h4v4", ct: clients, match: (p) => p === "/admin/clients" },
        { to: "/admin/reviews", label: "Reviews", icon: "m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z", ct: reviews, match: (p) => p === "/admin/reviews" },
        { to: "/admin/engagements", label: "Engagements", icon: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6", ct: staffed || undefined, match: (p) => p === "/admin/engagements" },
      ],
    },
    {
      grp: "Insights",
      items: [
        { to: "/admin/pulse", label: "Availability pulse", icon: "M3 12h4l3-7 4 14 3-7h4", match: (p) => p === "/admin/pulse" },
        { to: "/admin/reports", label: "Analytics", icon: "M5 20V11M11 20V5M17 20v-6M3 20h18", match: (p) => p === "/admin/reports" },
        { to: "/admin/audit", label: "Audit log", icon: "M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01", match: (p) => p === "/admin/audit" },
      ],
    },
  ];
  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="adm-brand">
          <span className="adm-rn">RN</span>
          <span>
            <b>Revenue Nomad</b>
            <small>Admin</small>
          </span>
        </div>
        <nav className="adm-nav" aria-label="Admin">
          {nav.map((g) => (
            <div key={g.grp} className="adm-grp-wrap">
              <div className="adm-grp">{g.grp}</div>
              {g.items.map((n) => (
                <Link key={n.label} to={n.to} className={n.match(path) ? "on" : ""} aria-current={n.match(path) ? "page" : undefined}>
                  <Icon d={n.icon} />
                  <span>{n.label}</span>
                  {n.ct != null && <span className={`ct ${n.hot ? "hot" : ""}`}>{n.ct}</span>}
                </Link>
              ))}
            </div>
          ))}
          <div className="adm-grp">Setup</div>
          <span className="adm-nav-off" title="Not part of this prototype">
            <Icon d="M3 12V4h8l10 10-8 8zM7.5 8.5h.01" />
            <span>Catalog</span>
          </span>
          <div className="adm-sub">Tags, suggestions, roles, industries, picklists. Not in this prototype.</div>
        </nav>
        <div className="adm-me">
          <span className="adm-me-av">ML</span>
          <span>
            <b>Matt Lopez</b>
            <small>
              <i aria-hidden="true" /> Prototype data
            </small>
          </span>
        </div>
      </aside>
      <div className="adm-body">
        <header className="adm-top">
          <div className="adm-crumb">{crumb}</div>
          <GlobalSearch s={s} />
          <Link to="/admin/today" className="adm-btn adm-btn-sm" aria-label={`${needs} things need you`} data-testid="needs-count">
            {needs}
          </Link>
        </header>
        <main className="adm-main" id="main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

function GlobalSearch({ s }: { s: State }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const t = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (t.length < 2) return [];
    const projects = s.projects.filter((p) => `${p.title} ${ownerName(p)}`.toLowerCase().includes(t)).map((p) => ({ label: p.title || "Untitled", sub: `Project · ${ownerName(p)}`, to: `/admin/projects/${p.id}` }));
    const ops = OPERATORS.filter((o) => matchesQuery(o, q)).slice(0, 5).map((o) => ({ label: displayName(o), sub: `Operator · ${o.role}`, to: `/operators/${o.slug}` }));
    const clients = clientList(s).filter((c) => c.name.toLowerCase().includes(t)).map((c) => ({ label: c.name, sub: "Client", to: "/admin/clients" }));
    return [...projects, ...clients, ...ops].slice(0, 8);
  }, [s, q, t]);
  return (
    <div className="adm-search">
      <label>
        <span className="sr-only">Search</span>
        <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5" />
        <input type="search" value={q} onChange={(e) => (setQ(e.target.value), setOpen(true))} onBlur={() => setTimeout(() => setOpen(false), 150)} onFocus={() => setOpen(true)} placeholder="Search operators, clients, projects" aria-label="Search operators, clients, projects" />
      </label>
      {open && results.length > 0 && (
        <ul className="adm-search-res" role="listbox">
          {results.map((r, i) => (
            <li key={i}>
              <Link to={r.to} onClick={() => (setQ(""), setOpen(false))}>
                <b>{r.label}</b>
                <small>{r.sub}</small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function clientList(s: State): { name: string; kind: "Buyer account" | "Revenue Nomad client"; projects: Project[]; contact?: string }[] {
  const out: { name: string; kind: "Buyer account" | "Revenue Nomad client"; projects: Project[]; contact?: string }[] = BUYERS.map((b) => ({
    name: b.company,
    kind: "Buyer account" as const,
    projects: s.projects.filter((p) => p.ownerBuyerId === b.id),
    contact: `${b.contactName}, ${b.contactTitle}`,
  }));
  const rn = new Map<string, Project[]>();
  for (const p of s.projects) if (p.origin === "revenue_nomad" && p.clientName) rn.set(p.clientName, [...(rn.get(p.clientName) || []), p]);
  for (const [name, projects] of rn) out.push({ name, kind: "Revenue Nomad client", projects });
  return out;
}

function Chip({ tone, children }: { tone: "green" | "amber" | "gray" | "red" | "blue"; children: ReactNode }) {
  return <span className={`chip c-${tone}`}>{children}</span>;
}
function fitTone(f: number): "green" | "amber" | "gray" {
  return f >= 75 ? "green" : f >= 65 ? "amber" : "gray";
}

// ---------------------------------------------------------------- needs you (A1)

export interface NeedItem {
  key: string;
  kind: "Project" | "Question" | "Client" | "Intro" | "Buyer";
  tone: "green" | "amber" | "blue" | "gray";
  title: string;
  sub: string;
  action: string;
  to: string;
  at: number;
}

export function needsYou(s: State): NeedItem[] {
  const out: NeedItem[] = [];
  const now = nowOf(s);
  for (const p of s.projects) {
    if (p.status === "draft" || isEnded(p)) continue;
    if (p.origin === "revenue_nomad") {
      for (const e of s.pipeline.filter((x) => x.projectId === p.id && x.stage === "responded")) {
        const r = responseOf(s, p.id, e.operatorId);
        if (!r?.submittedAt) continue;
        out.push({ key: `resp-${p.id}-${e.operatorId}`, kind: "Project", tone: "green", title: `${displayName(operatorById(e.operatorId)!)} answered the screening questions`, sub: `${p.title} · ${p.clientName}`, action: "Review", to: `/admin/projects/${p.id}?op=${e.operatorId}`, at: r.submittedAt });
      }
      const shortlisted = s.pipeline.filter((x) => x.projectId === p.id && x.stage === "shortlisted").length;
      if (shortlisted)
        out.push({ key: `sl-${p.id}`, kind: "Project", tone: "green", title: `${plural(shortlisted, "shortlisted operator")} ready to send to the client`, sub: `${p.clientName} ${s.shortlists.some((x) => x.projectId === p.id) ? "has an earlier shortlist" : "has not seen a shortlist yet"}`, action: "Send shortlist", to: `/admin/projects/${p.id}/shortlist`, at: p.postedAt || 0 });
      for (const q of questionsFor(s, p.id).filter((x) => !x.answer))
        out.push({ key: `q-${q.id}`, kind: "Question", tone: "amber", title: `${displayName(operatorById(q.operatorId)!)} asked a question on the invite`, sub: `${p.title} · ${ago(q.askedAt, now)} waiting`, action: "Reply", to: `/admin/projects/${p.id}?tab=messages`, at: q.askedAt });
      for (const ev of s.events.filter((x) => x.projectId === p.id && x.type === "client_requested_call"))
        out.push({ key: `call-${ev.id}`, kind: "Client", tone: "blue", title: `${p.clientName} wants a call with ${displayName(operatorById(ev.operatorId!)!)}`, sub: `${p.title} · asked ${ago(ev.at, now)}`, action: "Book call", to: `/admin/projects/${p.id}?op=${ev.operatorId}`, at: ev.at });
    } else {
      const b = buyerById(p.ownerBuyerId);
      if (p.wantsRnSuggestions && suggestionsUsed(s, p.id) < 3)
        out.push({ key: `sug-${p.id}`, kind: "Buyer", tone: "blue", title: `${b?.company} asked for Revenue Nomad suggestions`, sub: `${p.title} · ${suggestionsUsed(s, p.id)} of 3 sent`, action: "Suggest", to: `/admin/projects/${p.id}`, at: p.postedAt || 0 });
      if (noResponses72(s, p, now)) out.push({ key: `quiet-${p.id}`, kind: "Buyer", tone: "amber", title: `No responses in 72 hrs on ${p.title}`, sub: `${b?.company} · posted ${ago(p.postedAt, now)}`, action: "Nudge", to: `/admin/projects/${p.id}`, at: p.postedAt || 0 });
    }
  }
  for (const i of s.intros.filter((x) => x.status === "approved" && !x.bookedSlot && now - x.createdAt >= 2 * DAY)) {
    const p = projectById(s, i.projectId)!;
    out.push({ key: `intro-${i.id}`, kind: "Intro", tone: "blue", title: `Intro to ${displayName(operatorById(i.operatorId)!)} not booked yet`, sub: `${ownerName(p)} · requested ${shortDate(i.createdAt)}`, action: "Review", to: "/admin/intros", at: i.createdAt });
  }
  return out.sort((a, b) => a.at - b.at);
}

function useSnoozed(): [Set<string>, (k: string) => void] {
  const [set, setSet] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem("rnp:snoozed") || "[]"));
    } catch {
      return new Set();
    }
  });
  const add = (k: string) => {
    const next = new Set(set);
    next.add(k);
    setSet(next);
    try {
      sessionStorage.setItem("rnp:snoozed", JSON.stringify([...next]));
    } catch {
      /* per-viewer convenience only */
    }
  };
  return [set, add];
}

export function AdminToday() {
  const s = useStore();
  const now = nowOf(s);
  const [snoozed, snooze] = useSnoozed();
  const [msg, setMsg] = useState<string | null>(null);
  const all = needsYou(s);
  const items = all.filter((x) => !snoozed.has(x.key));
  const open = s.projects.filter((p) => p.status !== "draft" && !isEnded(p));
  const inPlay = s.pipeline.filter((e) => e.stage !== "not_selected" && e.stage !== "selected" && !isEnded(projectById(s, e.projectId)!));
  const awaiting = inPlay.filter((e) => e.stage === "responded").length + s.projects.filter((p) => p.origin === "buyer" && !isEnded(p)).reduce((a, p) => a + responsesFor(s, p.id).filter((r) => r.decision === "none").length, 0);
  const placed = s.projects.filter((p) => p.status === "staffed");
  const pending = s.intros.filter((i) => i.status === "approved" && !i.bookedSlot);
  const oldest = pending.length ? Math.max(...pending.map((i) => daysBetween(i.createdAt, now))) : 0;
  const lowRep = OPERATORS.filter((o) => (o.reputation || 0) < 50);
  const thin = OPERATORS.filter((o) => completeness(o).pct < 60);
  const nudgeable = profileNudgeTargets(s);
  const [confirmNudge, setConfirmNudge] = useState(false);
  const unconfirmed = OPERATORS.filter((o) => !opState(s, o.id).lastConfirmedAt);
  const hour = new Date(now).getUTCHours();
  return (
    <div className="adm-page">
      <div className="adm-pagehead">
        <div>
          <h1 className="serif">Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, Matt</h1>
          <p>
            {dayLabel(now)} · {plural(items.length, "thing needs you", "things need you")}, {plural(open.length, "project is", "projects are")} moving
          </p>
        </div>
        <button type="button" className="adm-btn" onClick={() => navigate(`/admin/projects/${createRnDraft()}/setup`)} data-testid="new-rn-project">
          + New project
        </button>
      </div>
      {msg && <div className="adm-toast-inline">{msg}</div>}
      <WeekHealth s={s} />
      <div className="adm-kpis" data-testid="today-kpis">
        <Link to="/admin/projects" className="card adm-kpi">
          <span>Open projects</span>
          <b className="num" data-testid="today-open">
            {open.length}
          </b>
          <small>{plural(open.filter((p) => p.origin === "revenue_nomad").length, "Revenue Nomad project")}</small>
        </Link>
        <Link to="/admin/projects" className="card adm-kpi">
          <span>Operators in play</span>
          <b className="num">{inPlay.length + s.projects.filter((p) => p.origin === "buyer" && !isEnded(p)).reduce((a, p) => a + responsesFor(s, p.id).filter((r) => r.decision !== "not_a_fit").length, 0)}</b>
          <small>{awaiting} responded, awaiting a move</small>
        </Link>
        <Link to="/admin/engagements" className="card adm-kpi">
          <span>Placements live</span>
          <b className="num">{placed.length}</b>
          <small>{placed.length ? placed.map(ownerName).join(", ") : "None yet"}</small>
        </Link>
        <Link to="/admin/intros" className="card adm-kpi">
          <span>Pending intros</span>
          <b className="num">{pending.length}</b>
          <small>{pending.length ? `Oldest is ${plural(oldest, "day")}` : "All booked"}</small>
        </Link>
      </div>
      <div className="adm-split">
        <section className="card" data-testid="needs-you">
          <div className="adm-card-h">
            <div>
              <h2>Needs you</h2>
              <span className="muted">Deal work only, oldest first</span>
            </div>
          </div>
          {!items.length && <div className="adm-empty">Nothing needs you right now.</div>}
          {items.map((it) => (
            <div key={it.key} className="adm-need" data-testid="need-item">
              <Chip tone={it.tone}>{it.kind}</Chip>
              <div className="grow">
                <b>{it.title}</b>
                <small>{it.sub}</small>
              </div>
              <Link to={it.to} className="adm-btn adm-btn-sm">
                {it.action}
              </Link>
              <button type="button" className="adm-btn adm-btn-sm ghost" onClick={() => snooze(it.key)} aria-label={`Snooze: ${it.title}`}>
                Snooze
              </button>
            </div>
          ))}
          {snoozed.size > 0 && all.length > items.length && <div className="adm-foot">{plural(all.length - items.length, "item")} snoozed for this session.</div>}
        </section>
        <div className="adm-col">
          <section className="card adm-pad">
            <div className="adm-card-h">
              <h2>Profile hygiene</h2>
              <Chip tone="gray">System tasks</Chip>
            </div>
            <p className="muted small">System tasks live here, not in your queue.</p>
            <div className="adm-hyg">
              <span>Reputation Index below 50</span>
              <b className="num">{lowRep.length}</b>
            </div>
            <div className="adm-hyg">
              <span>Incomplete profiles</span>
              <b className="num">{thin.length}</b>
              {nudgeable.length > 0 && !confirmNudge && (
                <button type="button" className="adm-btn adm-btn-sm" onClick={() => setConfirmNudge(true)} data-testid="nudge-profiles">
                  Nudge…
                </button>
              )}
            </div>
            {confirmNudge && (
              <div className="adm-confirm" data-testid="nudge-confirm">
                <p>
                  Email {plural(nudgeable.length, "operator")} under 60% complete with a one-tap link to finish their profile? Anyone nudged in the last {PROFILE_NUDGE_COOLDOWN_DAYS} days is skipped.
                </p>
                <div className="adm-row">
                  <button
                    type="button"
                    className="adm-btn adm-btn-sm pri"
                    onClick={() => (nudgeProfiles(nudgeable.map((o) => o.id)), setConfirmNudge(false), setMsg(`Profile nudge sent to ${plural(nudgeable.length, "operator")}.`))}
                    data-testid="nudge-send"
                  >
                    Send {nudgeable.length} nudges
                  </button>
                  <button type="button" className="adm-btn adm-btn-sm ghost" onClick={() => setConfirmNudge(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="adm-hyg">
              <span>Availability not confirmed</span>
              <b className="num">{unconfirmed.length}</b>
              <Link to="/admin/pulse" className="adm-btn adm-btn-sm">
                Pulse
              </Link>
            </div>
          </section>
          <section className="card adm-pad">
            <div className="adm-card-h">
              <h2>Active projects</h2>
              <Link to="/admin/projects" className="small">
                All projects
              </Link>
            </div>
            {!open.length && <div className="adm-empty">No live projects.</div>}
            {open.map((p) => {
              const st = stageCounts(s, p);
              return (
                <Link key={p.id} to={`/admin/projects/${p.id}`} className="adm-active">
                  <b>{p.title}</b>
                  <small>
                    {ownerName(p)} · Day {p.postedAt ? daysBetween(p.postedAt, now) + 1 : 0} · {st.total} in pipeline
                  </small>
                  <MiniPipe s={s} p={p} />
                </Link>
              );
            })}
          </section>
        </div>
      </div>
    </div>
  );
}

/** This week against the week before, from the event log. */
function weekWindow(s: State) {
  const now = nowOf(s);
  const inWin = (at: number, back: number) => at > now - (back + 7) * DAY && at <= now - back * DAY;
  const count = (type: string, back: number) => s.events.filter((e) => e.type === type && inWin(e.at, back)).length;
  const firstResponse = (back: number) => {
    const ms: number[] = [];
    for (const p of s.projects) {
      if (!p.postedAt || !inWin(p.postedAt, back)) continue;
      const first = s.events.filter((e) => e.projectId === p.id && e.type === "response_submitted").map((e) => e.at);
      if (first.length) ms.push(Math.min(...first) - p.postedAt);
    }
    ms.sort((a, b) => a - b);
    return ms.length ? ms[Math.floor(ms.length / 2)] : null;
  };
  return [0, 7].map((back) => ({
    posted: count("project_posted", back),
    responses: count("response_submitted", back),
    intros: count("intro_requested", back),
    placed: s.projects.filter((p) => p.staffedAt && inWin(p.staffedAt, back)).length,
    first: firstResponse(back),
  }));
}

function WeekHealth({ s }: { s: State }) {
  const [cur, prev] = weekWindow(s);
  const delta = (a: number, b: number) => (a === b ? "Same as last week" : `${a > b ? "+" : "−"}${Math.abs(a - b)} vs last week`);
  const tiles: { k: string; label: string; v: ReactNode; d: string; up?: boolean }[] = [
    { k: "posted", label: "Projects posted", v: cur.posted, d: delta(cur.posted, prev.posted), up: cur.posted >= prev.posted },
    { k: "responses", label: "Responses", v: cur.responses, d: delta(cur.responses, prev.responses), up: cur.responses >= prev.responses },
    { k: "intros", label: "Intros requested", v: cur.intros, d: delta(cur.intros, prev.intros), up: cur.intros >= prev.intros },
    {
      k: "first",
      label: "Median first response",
      v: cur.first == null ? "—" : durationLabel(cur.first),
      d: cur.first == null || prev.first == null ? "Needs a response this week and last" : cur.first <= prev.first ? `Faster than last week (${durationLabel(prev.first)})` : `Slower than last week (${durationLabel(prev.first)})`,
      up: cur.first != null && (prev.first == null || cur.first <= prev.first),
    },
  ];
  return (
    <section className="card adm-totals" data-testid="week-health">
      <div className="adm-card-h">
        <h2>This week</h2>
        <Link to="/admin/reports" className="small">
          Analytics
        </Link>
      </div>
      <div className="adm-tot">
        {tiles.map((t) => (
          <div key={t.k} data-testid={`week-${t.k}`}>
            <span>{t.label}</span>
            <b className="num">{t.v}</b>
            <small className={t.up ? "adm-up" : "adm-down"}>{t.d}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function stageCounts(s: State, p: Project) {
  if (p.origin === "revenue_nomad") {
    const es = s.pipeline.filter((e) => e.projectId === p.id);
    const n = (k: RnStage) => es.filter((e) => e.stage === k).length;
    return { invited: n("invited"), responded: n("responded"), shortlisted: n("shortlisted"), client: n("with_client"), total: es.filter((e) => e.stage !== "not_selected").length };
  }
  const c = projectCounts(s, p);
  const resp = responsesFor(s, p.id);
  return { invited: c.invited + c.alerted, responded: resp.filter((r) => r.decision === "none").length, shortlisted: 0, client: c.intros, total: c.responses };
}

function MiniPipe({ s, p }: { s: State; p: Project }) {
  const st = stageCounts(s, p);
  const labels = p.origin === "revenue_nomad" ? ["Invited", "Responded", "Shortlisted", "With client"] : ["Reached", "To review", "", "Intros"];
  const vals = [st.invited, st.responded, st.shortlisted, st.client];
  return (
    <span className="adm-mini" aria-label={labels.map((l, i) => (l ? `${l} ${vals[i]}` : "")).filter(Boolean).join(", ")}>
      {vals.map((v, i) =>
        labels[i] ? (
          <span key={i} title={labels[i]}>
            <i className="num">{v}</i>
            <small>{labels[i]}</small>
          </span>
        ) : null,
      )}
    </span>
  );
}

// ---------------------------------------------------------------- projects list (A2)

function stageOf(s: State, p: Project): string {
  if (p.status === "draft") return "Brief";
  if (p.status === "staffed") return "Placed";
  if (p.status === "closed_unfilled") return "Closed";
  if (p.status === "paused") return "Paused";
  if (p.origin === "revenue_nomad") {
    const st = stageCounts(s, p);
    if (st.client) return "With client";
    if (st.shortlisted) return "Shortlisted";
    if (st.responded) return "Responses";
    return invitesFor(s, p.id).length ? "Invited" : "Sourcing";
  }
  const c = projectCounts(s, p);
  if (c.intros) return "Intros";
  return c.responses ? "Responses" : "Live";
}

function nextStep(s: State, p: Project): string {
  if (p.status === "draft") return "Finish the brief and launch";
  if (isEnded(p)) return p.status === "staffed" ? "Check in with the operator" : "None";
  if (p.origin === "revenue_nomad") {
    const st = stageCounts(s, p);
    if (st.shortlisted) return "Send shortlist to client";
    if (st.responded) return `Review ${plural(st.responded, "response")}`;
    if (!st.total) return "Invite from the bench";
    return "Wait for responses";
  }
  const flags = projectFlags(s, p);
  if (flags.length) return flags[0];
  return "Buyer is reviewing";
}

function csv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function AdminProjectsList() {
  const s = useStore();
  const [tab, setTab] = useState<"open" | "drafts" | "placed" | "closed">("open");
  const now = nowOf(s);
  const groups = {
    open: s.projects.filter((p) => p.status !== "draft" && !isEnded(p)),
    drafts: s.projects.filter((p) => p.status === "draft"),
    placed: s.projects.filter((p) => p.status === "staffed"),
    closed: s.projects.filter((p) => p.status === "closed_unfilled"),
  };
  const rows = [...groups[tab]].sort((a, b) => (b.postedAt || b.updatedAt) - (a.postedAt || a.updatedAt));
  const k = {
    live: s.projects.filter((p) => p.status === "live").length,
    invites: s.invites.length,
    alerts: s.alerts.length,
    responses: s.responses.filter((r) => r.submittedAt && !r.draft && r.interest === "interested" && !r.withdrawn).length,
    intros: s.intros.filter((i) => i.status === "approved").length,
    staffed: s.projects.filter((p) => p.status === "staffed").length,
  };
  const exportCsv = () => {
    const data = csv([
      ["Project", "Client", "Origin", "Stage", "Status", "Invited", "Responses", "Bill", "Pay", "Margin", "Next step"],
      ...s.projects.map((p) => {
        const c = projectCounts(s, p);
        const m = p.billRate && p.operatorRate ? Math.round(((p.billRate - p.operatorRate) / p.billRate) * 100) : "";
        return [p.title, ownerName(p), p.origin, stageOf(s, p), p.status, c.invited, c.responses, p.billRate ?? "", p.operatorRate ?? "", m, nextStep(s, p)];
      }),
    ]);
    try {
      const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "revenue-nomad-projects.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      /* downloads can be blocked in embedded viewers */
    }
  };
  return (
    <div className="adm-page">
      <div className="adm-pagehead">
        <div>
          <h1 className="serif">Projects</h1>
          <p>Every need, from brief to placed operator: buyer posted and Revenue Nomad originated.</p>
        </div>
        <button type="button" className="adm-btn" onClick={exportCsv}>
          Export CSV
        </button>
        <button type="button" className="adm-btn pri" onClick={() => navigate(`/admin/projects/${createRnDraft()}/setup`)} data-testid="new-rn-project">
          + New project
        </button>
      </div>
      <div className="adm-kpis adm-kpis-6" data-testid="kpis">
        <div className="card adm-kpi" data-testid="kpi-live">
          <span>Live projects</span>
          <b className="num stat-v">{k.live}</b>
        </div>
        <div className="card adm-kpi" data-testid="kpi-invites">
          <span>Invites sent</span>
          <b className="num stat-v">{k.invites}</b>
        </div>
        <div className="card adm-kpi" data-testid="kpi-alerts">
          <span>Alerts sent</span>
          <b className="num stat-v">{k.alerts}</b>
        </div>
        <div className="card adm-kpi" data-testid="kpi-responses">
          <span>Responses</span>
          <b className="num stat-v">{k.responses}</b>
        </div>
        <div className="card adm-kpi" data-testid="kpi-intros">
          <span>Intros requested</span>
          <b className="num stat-v">{k.intros}</b>
        </div>
        <div className="card adm-kpi" data-testid="kpi-staffed">
          <span>Placed</span>
          <b className="num stat-v">{k.staffed}</b>
        </div>
      </div>
      <div className="adm-tabs" role="group" aria-label="Filter projects">
        {(
          [
            ["open", "Open"],
            ["drafts", "Drafts"],
            ["placed", "Placed"],
            ["closed", "Closed"],
          ] as const
        ).map(([key, l]) => (
          <button key={key} type="button" className={tab === key ? "on" : ""} aria-pressed={tab === key} onClick={() => setTab(key)} data-testid={`adm-tab-${key}`}>
            {l} <span className="num">{groups[key].length}</span>
          </button>
        ))}
      </div>
      <section className="card adm-table-wrap">
        <table className="adm-table" data-testid="admin-projects">
          <thead>
            <tr>
              <th>Project</th>
              <th>Stage</th>
              <th>Pipeline</th>
              <th className="num">Invited</th>
              <th className="num">Responses</th>
              <th>Day</th>
              <th>Bill / pay</th>
              <th>Next step</th>
              <th>Flags</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const c = projectCounts(s, p);
              const flags = projectFlags(s, p);
              const href = p.status === "draft" && p.origin === "revenue_nomad" ? `/admin/projects/${p.id}/setup` : `/admin/projects/${p.id}`;
              const m = p.billRate && p.operatorRate ? Math.round(((p.billRate - p.operatorRate) / p.billRate) * 100) : null;
              return (
                <tr key={p.id} data-testid="admin-row" data-project={p.id}>
                  <td data-label="Project">
                    <Link to={href} className="rowlink">
                      {p.title || "Untitled"}
                    </Link>
                    <small className="block muted">
                      {ownerName(p)} · {p.origin === "buyer" ? "Buyer posted" : "Revenue Nomad"} · {p.visibility === "invite_only" ? "Invite only" : "Invites + open"}
                    </small>
                  </td>
                  <td data-label="Stage">
                    <Chip tone={p.status === "staffed" ? "green" : p.status === "draft" ? "gray" : p.status === "paused" ? "amber" : "blue"}>{stageOf(s, p)}</Chip>
                  </td>
                  <td data-label="Pipeline">{p.status === "draft" ? <span className="muted">Not launched</span> : <MiniPipe s={s} p={p} />}</td>
                  <td data-label="Invited" className="num" data-testid="row-invited">
                    {c.invited}
                  </td>
                  <td data-label="Responses" className="num" data-testid="row-responses">
                    {c.responses}
                  </td>
                  <td data-label="Day" className="num">
                    {p.postedAt ? daysBetween(p.postedAt, now) + 1 : "—"}
                  </td>
                  <td data-label="Bill / pay" className="num">
                    {p.origin === "revenue_nomad" ? (
                      <>
                        ${p.billRate ?? "?"} / ${p.operatorRate ?? "?"}
                        {m != null && <small className="block muted">{m}% margin</small>}
                      </>
                    ) : (
                      <span className="muted">Buyer budget</span>
                    )}
                  </td>
                  <td data-label="Next step">{nextStep(s, p)}</td>
                  <td data-label="Flags">
                    {flags.map((f) => (
                      <span key={f} className="chip c-red flag" data-testid="flag">
                        {f}
                      </span>
                    ))}
                  </td>
                  <td>
                    <Link to={href} className="adm-btn adm-btn-sm">
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="adm-empty">Nothing here.</div>}
      </section>
      {groups.placed.length > 0 && (
        <section className="card adm-table-wrap">
          <div className="adm-card-h">
            <h2>Recently placed</h2>
          </div>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Operator</th>
                <th>Start</th>
                <th>Agreement</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groups.placed.map((p) => {
                const op = p.selectedOperatorId ? operatorById(p.selectedOperatorId) : null;
                return (
                  <tr key={p.id}>
                    <td data-label="Project">
                      <Link to={`/admin/projects/${p.id}`} className="rowlink">
                        {p.title}
                      </Link>
                      <small className="block muted">{ownerName(p)}</small>
                    </td>
                    <td data-label="Operator">{op ? displayName(op) : "—"}</td>
                    <td data-label="Start">{shortDate(p.startTarget)}</td>
                    <td data-label="Agreement">
                      <Chip tone="amber">Sent for signature</Chip>
                    </td>
                    <td>
                      <button type="button" className="adm-btn adm-btn-sm" onClick={() => attempt(() => checkIn(p.id), () => undefined)}>
                        Check in
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- new project wizard (A3)

const SIGNALS: [string, string, RegExp][] = [
  ["Industry", "Logistics", /\b(3pl|logistics|freight|fulfillment|warehous)/i],
  ["Industry", "Healthcare", /\b(health|medical|clinic|pharma)/i],
  ["Industry", "SaaS", /\b(saas|software)\b/i],
  ["Industry", "Marketing agency", /\bagency\b/i],
  ["Tool", "Salesforce", /salesforce/i],
  ["Tool", "HubSpot", /hubspot/i],
  ["Need", "Sales hiring", /\b(hire|hiring|recruit|first (two |2 )?aes?)\b/i],
  ["Need", "Sales playbook", /\b(playbook|sales process|repeatable)\b/i],
  ["Need", "Forecasting", /forecast/i],
  ["Need", "Outbound", /\b(outbound|pipeline gen|prospecting)\b/i],
  ["Need", "Territory design", /territor/i],
  ["Need", "CRM migration", /migrat/i],
];
const FILTER_TAGS = ["RevOps", "Salesforce", "HubSpot", "Forecasting", "Logistics", "Sales Playbook"];

interface Candidate {
  op: Operator;
  fit: FitResult;
  why: string[];
}

function scoreCandidates(p: Project, text: string): { cands: Candidate[]; parsed: { k: string; v: string }[]; textCat: string | null } {
  const textCat = text.trim() ? seatCategory(text) : null;
  const catTitle = textCat && textCat !== seatCategory(p.title) ? `Fractional ${textCat}` : p.title;
  const hrs = text.match(/(\d{2,3})\s*(?:-|to)\s*(\d{2,3})\s*(?:hrs|hours)/i);
  const probe: Project = { ...p, title: catTitle, hoursPerMonthMin: hrs ? Number(hrs[1]) : p.hoursPerMonthMin, hoursPerMonthMax: hrs ? Number(hrs[2]) : p.hoursPerMonthMax };
  const brief = briefFromProject(probe);
  const sigs = SIGNALS.filter((x) => x[2].test(`${text} ${p.successIn90Days} ${p.scope || ""} ${p.companyDescriptor}`));
  const parsed = [{ k: "Role", v: brief.cat }, ...sigs.map((x) => ({ k: x[0], v: x[1] }))];
  if (hrs) parsed.push({ k: "Hours", v: `${hrs[1]} to ${hrs[2]} a month` });
  const rate = text.match(/\$\s?(\d{2,3})/);
  if (rate) parsed.push({ k: "Rate", v: `$${rate[1]}/hr` });
  const pay = p.operatorRate ?? 0;
  const cands = OPERATORS.map((op) => {
    const fit = fitScore(op, brief);
    const why = [fit.plus, fit.minus].filter(Boolean).flatMap((x) => x.split(". "));
    const tl = (op.allTags || []).concat(op.allIndustries || []).join(" | ").toLowerCase();
    const hit = sigs.filter((x) => tl.includes(x[1].toLowerCase().split(" ")[0]));
    if (hit.length) why.push(`Matches ${hit.map((x) => x[1]).join(", ")} from the brief`);
    if (op.rate != null && pay) why.push(op.rate <= pay ? `Listed rate $${op.rate} fits the $${pay} pay rate` : `Listed rate is $${op.rate - pay} above the $${pay} pay rate`);
    why.push(`Reputation Index ${op.reputation}`);
    return { op, fit, why };
  }).sort((a, b) => b.fit.fit - a.fit.fit || (b.op.reputation || 0) - (a.op.reputation || 0) || (a.op.id < b.op.id ? -1 : 1));
  return { cands, parsed, textCat };
}

export function AdminWizard({ id }: { id: string }) {
  const s = useStore();
  const p = projectById(s, id);
  const [step, setStep] = useState(1);
  const [d, setD] = useState<Project | null>(p ? { ...p } : null);
  const [margin, setMargin] = useState<number>(() => (p?.billRate && p?.operatorRate ? Math.round(((p.billRate - p.operatorRate) / p.billRate) * 100) : STANDARD_MARGIN));
  const [newClient, setNewClient] = useState(false);
  const [errors, setErrors] = useState<BriefErrors>({});
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"ai" | "search">("ai");
  const [query, setQuery] = useState("");
  const [ran, setRan] = useState(false);
  const [thr, setThr] = useState(60);
  const [f, setF] = useState({ kw: "", avail: "any", rep: 0, rate: "any", tags: [] as string[], industry: "any" });
  const [chInvite, setChInvite] = useState(true);
  const [chOff, setChOff] = useState(false);
  const [emails, setEmails] = useState("");
  const [launched, setLaunched] = useState(false);
  useEffect(() => {
    if (p && !d) setD({ ...p });
  }, [p, d]);
  if (!p || p.origin !== "revenue_nomad") return <div className="adm-empty">That is not a Revenue Nomad project.</div>;
  if (!d) return null;
  if (p.status !== "draft" && !launched) return <AdminPipeline id={id} />;
  const bill = d.billRate ?? 0;
  const pay = Math.round(bill * (1 - Math.max(0, Math.min(60, margin)) / 100));
  const take = bill - pay;
  const mid = Math.round((Number(d.hoursPerMonthMin) + Number(d.hoursPerMonthMax)) / 2);
  const set = (patch: Partial<Project>) => {
    const next = { ...d, ...patch };
    setD(next);
    if (Object.keys(errors).length) setErrors(validateBrief({ ...next, operatorRate: pay }));
  };
  const picks = d.draftInvites || [];
  const togglePick = (opId: string) => set({ draftInvites: picks.includes(opId) ? picks.filter((x) => x !== opId) : [...picks, opId] });
  const persist = (extra: Partial<Project> = {}) => {
    const validEmails = emails.split(/[\s,;]+/).filter((e) => /.+@.+\..+/.test(e));
    updateDraft(
      id,
      {
        ...d,
        ...extra,
        operatorRate: pay,
        offPlatformEmails: chOff ? validEmails : [],
        draftInvites: chInvite ? picks : [],
        audience: d.audience ? { ...d.audience } : null,
      },
      "admin",
    );
  };
  const clients = [...new Set(s.projects.filter((x) => x.origin === "revenue_nomad" && x.clientName && x.id !== id).map((x) => x.clientName!))];
  const go = (n: number) => {
    if (n > 1 && step === 1) {
      const e = validateBrief({ ...d, operatorRate: pay });
      setErrors(e);
      if (Object.keys(e).length) {
        setErr("Fix the highlighted fields to continue.");
        return;
      }
    }
    setErr(null);
    persist();
    setStep(n);
  };
  const launch = () => {
    persist();
    if (attempt(() => publishRnProject(id), setErr)) setLaunched(true);
  };
  const { cands, parsed, textCat } = scoreCandidates({ ...d, operatorRate: pay }, query);
  const aiRows = cands.filter((c) => c.fit.fit >= thr);
  const searchRows = stableSort(
    cands
      .filter(({ op }) => {
        if (f.kw.trim() && !matchesQuery(op, f.kw)) return false;
        if (f.avail !== "any" && !op.avail.toLowerCase().includes(f.avail)) return false;
        if ((op.reputation || 0) < f.rep) return false;
        if (f.rate === "pay" && !(op.rate != null && op.rate <= pay)) return false;
        if (f.rate === "250" && !(op.rate == null || op.rate < 250)) return false;
        const tl = (op.allTags || []).join(" | ").toLowerCase() + " " + (op.cat === "Revenue Operations" ? "revops" : "");
        if (!f.tags.every((t) => tl.includes(t.toLowerCase()))) return false;
        if (f.industry !== "any" && !(op.allIndustries || []).some((i) => i.toLowerCase().includes(f.industry))) return false;
        return true;
      })
      .map((c) => ({ ...c, id: c.op.id })),
    (c) => c.fit.fit,
  );
  const audience = d.audience || { on: false, category: seatCategory(d.title), availability: "soon" as const, minReputation: 0 };
  const segment = audienceSegment(s, { ...d, audience: { ...audience, on: true } });
  const validEmails = emails.split(/[\s,;]+/).filter((e) => /.+@.+\..+/.test(e));
  const stepLabels = ["Brief", "Find candidates", "Audience", "Review and launch"];

  if (launched)
    return (
      <div className="adm-page adm-narrow">
        <section className="card adm-pad adm-live" data-testid="launched">
          <h1 className="serif">Project live</h1>
          <p>Invites are out. Responses flow into the pipeline as they come in.</p>
          <div className="adm-row">
            <button type="button" className="adm-btn pri" onClick={() => navigate(`/admin/projects/${id}`)} data-testid="open-pipeline">
              Open pipeline
            </button>
          </div>
        </section>
      </div>
    );

  return (
    <div className="adm-page">
      <div className="adm-pagehead">
        <div>
          <h1 className="serif">New project</h1>
          <p>Brief it, find the right people, and choose who hears about it.</p>
        </div>
        <button type="button" className="adm-btn ghost" onClick={() => (persist(), navigate("/admin/projects"))}>
          Save draft and exit
        </button>
      </div>
      <ol className="adm-steps" aria-label="Steps">
        {stepLabels.map((l, i) => (
          <li key={l}>
            <button type="button" className={step === i + 1 ? "on" : step > i + 1 ? "done" : ""} aria-current={step === i + 1 ? "step" : undefined} onClick={() => go(i + 1)} data-testid={`wiz-step-${i + 1}`}>
              <span className="num">{i + 1}</span> {l}
            </button>
          </li>
        ))}
      </ol>
      {err && (
        <div className="adm-alert" role="alert">
          {err}
        </div>
      )}

      {step === 1 && (
        <div className="adm-split">
          <section className="card adm-pad adm-form">
            <div className="fld">
              <span>Where did this come from</span>
              <div className="adm-seg" role="group" aria-label="Source">
                {(
                  [
                    ["direct", "Came to RN directly"],
                    ["intro", "From an intro request"],
                    ["referral", "Referral or partner"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={(d.source || "direct") === k} onClick={() => set({ source: k })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="adm-grid2">
              <label className="fld">
                <span>Client</span>
                {newClient || !clients.length ? (
                  <input value={d.clientName || ""} onChange={(e) => set({ clientName: e.target.value })} aria-invalid={!!errors.clientName} data-testid="rn-client" placeholder="Company name" />
                ) : (
                  <select
                    value={d.clientName || ""}
                    onChange={(e) => (e.target.value === "__new" ? (setNewClient(true), set({ clientName: "" })) : set({ clientName: e.target.value }))}
                    data-testid="rn-client"
                  >
                    {!d.clientName && <option value="">Pick a client</option>}
                    {[...new Set([d.clientName, ...clients].filter(Boolean))].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                    <option value="__new">+ New client</option>
                  </select>
                )}
                {errors.clientName && <em className="err">{errors.clientName}</em>}
              </label>
              <label className="fld">
                <span>What operators see</span>
                <input value={d.companyDescriptor} onChange={(e) => set({ companyDescriptor: e.target.value })} />
                <label className="adm-check">
                  <input type="checkbox" checked={!d.hideCompanyUntilIntro} onChange={(e) => set({ hideCompanyUntilIntro: !e.target.checked })} /> Client name shown to operators
                </label>
              </label>
            </div>
            <div className="adm-grid2">
              <label className="fld">
                <span>Role title</span>
                <input value={d.title} onChange={(e) => set({ title: e.target.value })} aria-invalid={!!errors.title} data-testid="f-title" />
                <small className="muted">Category: {seatCategory(d.title)}</small>
                {errors.title && <em className="err">{errors.title}</em>}
              </label>
              <label className="fld">
                <span>Target start</span>
                <input type="date" value={d.startTarget} onChange={(e) => set({ startTarget: e.target.value })} />
              </label>
            </div>
            <div className="fld">
              <span>Hours per month</span>
              <div className="adm-seg" role="group" aria-label="Hours per month">
                {(
                  [
                    [20, 40],
                    [40, 50],
                    [40, 80],
                    [80, 120],
                  ] as const
                ).map(([a, b]) => (
                  <button key={`${a}-${b}`} type="button" aria-pressed={d.hoursPerMonthMin === a && d.hoursPerMonthMax === b} onClick={() => set({ hoursPerMonthMin: a, hoursPerMonthMax: b })}>
                    {a}-{b}
                  </button>
                ))}
              </div>
            </div>
            <div className="adm-grid2">
              <label className="fld">
                <span>Term</span>
                <input value={d.term} onChange={(e) => set({ term: e.target.value })} />
              </label>
              <div className="fld">
                <span>Access</span>
                <div className="adm-seg" role="group" aria-label="Access">
                  <button type="button" aria-pressed={d.visibility === "invite_only" && !audience.on} onClick={() => set({ visibility: "invite_only", audience: { ...audience, on: false } })}>
                    Invite only
                  </button>
                  <button type="button" aria-pressed={d.visibility === "invites_plus_open" || audience.on} onClick={() => set({ visibility: "invites_plus_open", audience: { ...audience, on: true } })}>
                    Open to apply
                  </button>
                </div>
              </div>
            </div>
            <label className="fld">
              <span>Brief, success in 90 days</span>
              <textarea rows={3} value={d.successIn90Days} onChange={(e) => set({ successIn90Days: e.target.value })} aria-invalid={!!errors.successIn90Days} placeholder="What the client needs, in plain words. This also feeds the match." />
              {errors.successIn90Days && <em className="err">{errors.successIn90Days}</em>}
            </label>
            <label className="fld">
              <span>GTM problem or scope</span>
              <textarea rows={2} value={d.scope || ""} onChange={(e) => set({ scope: e.target.value })} />
            </label>
            {errors.screeningQuestions && <em className="err">{errors.screeningQuestions}</em>}
            <p className="muted small">
              {d.mustHaves.length ? `Must-haves: ${d.mustHaves.join(", ")}` : "No must-haves"} · {plural(d.screeningQuestions.length, "screening question")}
            </p>
          </section>
          <section className="card adm-pad adm-econ" data-testid="economics">
            <h2>Economics</h2>
            <label className="fld">
              <span>Client bill rate, $ per hour</span>
              <input type="number" value={d.billRate ?? ""} onChange={(e) => set({ billRate: e.target.value === "" ? null : Number(e.target.value) })} aria-invalid={!!errors.billRate} data-testid="rn-bill" />
              {errors.billRate && <em className="err">{errors.billRate}</em>}
            </label>
            <label className="fld">
              <span>Margin for this project, %</span>
              <input type="number" value={margin} onChange={(e) => setMargin(Number(e.target.value) || 0)} data-testid="rn-margin-input" />
            </label>
            {margin !== STANDARD_MARGIN && (
              <button type="button" className="adm-btn adm-btn-sm" onClick={() => setMargin(STANDARD_MARGIN)}>
                Reset to {STANDARD_MARGIN}%
              </button>
            )}
            <dl className="kv">
              <dt>Client pays</dt>
              <dd className="num">${bill}/hr</dd>
              <dt>Operator gets</dt>
              <dd className="num" data-testid="rn-oprate">
                ${pay}/hr
              </dd>
            </dl>
            <div className="adm-econ-tiles">
              <div data-testid="rn-spread">
                <span>Spread</span>
                <b className="num stat-v">${take}/hr</b>
              </div>
              <div data-testid="rn-margin">
                <span>Margin</span>
                <b className="num stat-v">{bill ? Math.round((take / bill) * 100) : 0}%</b>
              </div>
              <div data-testid="rn-month">
                <span>Per month at {mid} hrs</span>
                <b className="num stat-v">{money(take * mid)}</b>
              </div>
            </div>
            <p className="muted small">Standard is {STANDARD_MARGIN}%. Operators see only the pay rate on the invite; the client only sees the bill rate. Operators listed above the pay rate are flagged on their card, not hidden.</p>
          </section>
        </div>
      )}

      {step === 2 && (
        <section className="card adm-pad" data-testid="find-candidates">
          <div className="adm-card-h">
            <div className="adm-seg" role="group" aria-label="How to find candidates">
              <button type="button" aria-pressed={mode === "ai"} onClick={() => setMode("ai")} data-testid="mode-ai">
                Assistant match
              </button>
              <button type="button" aria-pressed={mode === "search"} onClick={() => setMode("search")} data-testid="mode-search">
                Search and filter
              </button>
            </div>
            <b data-testid="pick-count">{plural(picks.length, "operator")} picked to invite</b>
          </div>
          {mode === "ai" ? (
            <>
              <label className="fld">
                <span>Describe who you need</span>
                <textarea rows={3} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. RevOps lead for a 3PL moving from HubSpot to Salesforce, 40-60 hrs a month, October start, about $200 an hour" data-testid="ai-query" />
              </label>
              <div className="adm-row">
                <label className="fld adm-inline">
                  <span>Show fit score above</span>
                  <select value={thr} onChange={(e) => setThr(Number(e.target.value))}>
                    {[60, 70, 80].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="adm-btn pri" onClick={() => setRan(true)} data-testid="find-matches">
                  Find matches
                </button>
              </div>
              {ran ? (
                <>
                  <div className="adm-parsed">
                    <span className="muted small">What the assistant read from your brief</span>
                    <div className="adm-row">
                      {parsed.map((x) => (
                        <Chip key={x.k + x.v} tone="gray">
                          {x.k} · {x.v}
                        </Chip>
                      ))}
                    </div>
                    {textCat && textCat !== seatCategory(d.title) && (
                      <p className="small">
                        Your text asks for {textCat} but the role title reads as {seatCategory(d.title)}. Matching on {textCat}.
                      </p>
                    )}
                  </div>
                  <p className="muted small" data-testid="ai-count">
                    {aiRows.length} of {OPERATORS.length} operators scored {thr} or more. Ranked by fit, then Reputation Index.
                  </p>
                  <ul className="adm-cands">
                    {aiRows.map((c) => (
                      <CandRow key={c.op.id} c={c} on={picks.includes(c.op.id)} toggle={() => togglePick(c.op.id)} pay={pay} why />
                    ))}
                  </ul>
                </>
              ) : (
                <p className="adm-empty">Describe the role and hit Find matches. The assistant scores every profile against the brief and says why.</p>
              )}
            </>
          ) : (
            <>
              <div className="adm-filters">
                <label className="fld">
                  <span>Keyword</span>
                  <input type="search" value={f.kw} onChange={(e) => setF({ ...f, kw: e.target.value })} placeholder="Name, title or tag" data-testid="cand-search" />
                </label>
                <label className="fld">
                  <span>Availability</span>
                  <select value={f.avail} onChange={(e) => setF({ ...f, avail: e.target.value })}>
                    <option value="any">Any</option>
                    <option value="now">Available now</option>
                    <option value="2 weeks">In 2 weeks</option>
                  </select>
                </label>
                <label className="fld">
                  <span>Reputation Index</span>
                  <select value={f.rep} onChange={(e) => setF({ ...f, rep: Number(e.target.value) })}>
                    {[0, 50, 60, 70].map((r) => (
                      <option key={r} value={r}>
                        {r ? `${r}+` : "Any"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="fld">
                  <span>Max listed rate</span>
                  <select value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })}>
                    <option value="any">Any</option>
                    <option value="pay">At or under ${pay} pay</option>
                    <option value="250">Under $250 or none listed</option>
                  </select>
                </label>
                <label className="fld">
                  <span>Industry</span>
                  <select value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })}>
                    <option value="any">Any</option>
                    <option value="logistics">Logistics</option>
                    <option value="saas">SaaS</option>
                    <option value="health">Healthcare</option>
                  </select>
                </label>
              </div>
              <div className="adm-row" role="group" aria-label="Fit tags">
                <span className="muted small">Fit tags</span>
                {FILTER_TAGS.map((t) => (
                  <button key={t} type="button" className="adm-tagbtn" aria-pressed={f.tags.includes(t)} onClick={() => setF({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] })}>
                    {t}
                  </button>
                ))}
              </div>
              <p className="muted small" data-testid="search-count">
                {plural(searchRows.length, "result")}
              </p>
              {!searchRows.length && <p className="adm-empty">No operators match. Loosen a filter.</p>}
              <ul className="adm-cands">
                {searchRows.slice(0, 40).map((c) => (
                  <CandRow key={c.op.id} c={c} on={picks.includes(c.op.id)} toggle={() => togglePick(c.op.id)} pay={pay} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {step === 3 && (
        <div className="adm-split">
          <section className="card adm-pad adm-form" data-testid="audience">
            <label className="adm-check adm-big">
              <input type="checkbox" checked={chInvite} onChange={(e) => setChInvite(e.target.checked)} />
              <span>
                <b>Invite the operators you picked</b>
                <small>{picks.length ? picks.map((x) => displayName(operatorById(x)!)).join(", ") : "Nobody picked yet. Go back to Find candidates."}</small>
              </span>
            </label>
            <label className="adm-check adm-big">
              <input type="checkbox" checked={audience.on} onChange={(e) => set({ audience: { ...audience, on: e.target.checked }, visibility: e.target.checked ? "invites_plus_open" : "invite_only" })} data-testid="aud-on" />
              <span>
                <b>Post to an audience on the platform</b>
                <small>Matching operators get it in their dashboard and by email, and can apply.</small>
              </span>
            </label>
            {audience.on && (
              <div className="adm-filters">
                <label className="fld">
                  <span>Role category</span>
                  <select value={audience.category} onChange={(e) => set({ audience: { ...audience, category: e.target.value } })}>
                    {[...CATEGORIES, "Any"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="fld">
                  <span>Availability</span>
                  <select value={audience.availability} onChange={(e) => set({ audience: { ...audience, availability: e.target.value as "any" | "soon" } })}>
                    <option value="soon">Available now or in 2 weeks</option>
                    <option value="any">Any</option>
                  </select>
                </label>
                <label className="fld">
                  <span>Reputation Index</span>
                  <select value={audience.minReputation} onChange={(e) => set({ audience: { ...audience, minReputation: Number(e.target.value) } })}>
                    {[0, 50, 60, 70].map((r) => (
                      <option key={r} value={r}>
                        {r ? `${r}+` : "Any"}
                      </option>
                    ))}
                  </select>
                </label>
                <b className="adm-seg-count" data-testid="aud-count">
                  {plural(segment.length, "operator")} in this segment
                </b>
              </div>
            )}
            <label className="adm-check adm-big">
              <input type="checkbox" checked={chOff} onChange={(e) => setChOff(e.target.checked)} data-testid="off-on" />
              <span>
                <b>Invite people who are not on Revenue Nomad yet</b>
                <small>They get a link to sign up, build a profile and apply to this role in one flow.</small>
              </span>
            </label>
            {chOff && (
              <>
                <label className="fld">
                  <span>Emails, comma or one per line</span>
                  <textarea rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="name@company.com" data-testid="off-emails" />
                </label>
                <div className="adm-row">
                  <span className="muted small">{plural(validEmails.length, "valid email")}</span>
                  <label className="adm-btn adm-btn-sm">
                    Upload CSV
                    <input
                      type="file"
                      accept=".csv,text/csv,text/plain"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) file.text().then((t) => setEmails((emails ? emails + "\n" : "") + t));
                      }}
                    />
                  </label>
                </div>
              </>
            )}
          </section>
          <section className="card adm-pad adm-preview">
            <span className="muted small">Invite preview</span>
            <div className="adm-mail">
              <b>New role: {d.title}</b>
              <p>
                A {d.companyDescriptor} needs a {d.title} for {hoursRange(d.hoursPerMonthMin, d.hoursPerMonthMax)} hours a month. Pay is ${pay}/hr.
              </p>
              <p className="muted">{(d.scope || d.successIn90Days).split(". ").slice(0, 2).join(". ")}</p>
              <div className="adm-row">
                <span className="adm-btn adm-btn-sm pri">I am interested</span>
                <span className="adm-btn adm-btn-sm">Not for me</span>
              </div>
            </div>
            <p className="muted small">Operators who click Interested land in Responded on the pipeline.</p>
          </section>
        </div>
      )}

      {step === 4 && (
        <section className="card adm-pad adm-narrow" data-testid="review-launch">
          <h2>Ready to launch</h2>
          <dl className="kv">
            <dt>Role</dt>
            <dd>{d.title}</dd>
            <dt>Client</dt>
            <dd>
              {d.clientName} · operators see &quot;{d.companyDescriptor}&quot;
            </dd>
            <dt>Source</dt>
            <dd>{{ direct: "Came to RN directly", intro: "From an intro request", referral: "Referral or partner" }[d.source || "direct"]}</dd>
            <dt>Economics</dt>
            <dd className="num">
              ${bill} bill · ${pay} to operator · {bill ? Math.round((take / bill) * 100) : 0}%
            </dd>
            <dt>Direct invites</dt>
            <dd>{chInvite && picks.length ? picks.map((x) => displayName(operatorById(x)!)).join(", ") : "None"}</dd>
            <dt>Platform audience</dt>
            <dd>{audience.on ? `${plural(segment.length, "operator")} in ${audience.category}` : "Off"}</dd>
            <dt>Off-platform invites</dt>
            <dd>{chOff && validEmails.length ? plural(validEmails.length, "email") : "None"}</dd>
          </dl>
          <div className="adm-row">
            <button type="button" className="adm-btn pri" onClick={launch} data-testid="rn-publish">
              Launch project
            </button>
          </div>
        </section>
      )}

      <div className="adm-wiz-foot">
        {step > 1 && (
          <button type="button" className="adm-btn" onClick={() => go(step - 1)}>
            Back
          </button>
        )}
        {step < 4 && (
          <button type="button" className="adm-btn pri" onClick={() => go(step + 1)} data-testid="wiz-next">
            Next: {stepLabels[step]}
          </button>
        )}
      </div>
    </div>
  );
}

function CandRow({ c, on, toggle, pay, why }: { c: Candidate; on: boolean; toggle: () => void; pay: number; why?: boolean }) {
  const op = c.op;
  return (
    <li className={`adm-cand ${on ? "on" : ""}`} data-testid="cand-row" data-op={displayName(op)}>
      <input type="checkbox" checked={on} onChange={toggle} aria-label={`Pick ${displayName(op)}`} />
      <div className="grow">
        <b>{displayName(op)}</b>
        <small className="muted">
          {op.role} · {op.avail} · {op.hrs} hrs/mo · {op.rate != null ? `$${op.rate}/hr listed` : "No rate listed"}
          {op.rate != null && op.rate > pay ? ` · $${op.rate - pay} above pay` : ""}
        </small>
        {why && (
          <ul className="adm-why">
            {c.why.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>
      <Chip tone={fitTone(c.fit.fit)}>
        <span className="num">{c.fit.fit}</span>&nbsp;fit
      </Chip>
    </li>
  );
}

// ---------------------------------------------------------------- pipeline (A4)

const OP_SEES: Record<RnStage, string> = { invited: "Pending", responded: "Interested", shortlisted: "RN qualified", with_client: "Introduced", selected: "Hired", not_selected: "Closed" };

export function AdminPipeline({ id }: { id: string }) {
  const s = useStore();
  const p = projectById(s, id)!;
  const { query } = useLocation();
  const [tab, setTab] = useState<"pipeline" | "brief" | "messages" | "agreement" | "activity">((query.get("tab") as "messages") || "pipeline");
  const [open, setOpen] = useState<string | null>(query.get("op"));
  const [confirm, setConfirm] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<RnStage | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(query.get("sent") ? { tone: "ok", text: `Shortlist sent to ${p.clientName}.` } : null);
  const [inviting, setInviting] = useState(false);
  const now = nowOf(s);
  const pay = p.operatorRate ?? 0;
  const entries = s.pipeline.filter((e) => e.projectId === id);
  const ended = isEnded(p);
  const run = (fn: () => void, ok: string) => attempt(() => (fn(), setMsg({ tone: "ok", text: ok })), (m) => setMsg({ tone: "error", text: m }));
  const move = (opId: string, to: RnStage) => {
    if (to === "selected") {
      setConfirm(opId);
      return;
    }
    run(() => moveStage(id, opId, to), `${displayName(operatorById(opId)!)} moved to ${STAGES.find((x) => x.key === to)!.label}.`);
  };
  const viewed = new Set(s.events.filter((e) => e.projectId === id && e.type === "project_viewed").map((e) => e.operatorId));
  const cardNote = (opId: string, stage: RnStage) => {
    const r = responseOf(s, id, opId);
    const q = questionsFor(s, id).find((x) => x.operatorId === opId && !x.answer);
    if (q) return { text: `Asked a question, ${ago(q.askedAt, now)}`, flag: true };
    if (r?.interest === "declined") return { text: `Declined, ${(r.declineReason || "").toLowerCase()}`, flag: false };
    if (r?.submittedAt && !r.draft) return { text: stage === "responded" ? `Answers in ${shortDate(r.submittedAt)}, needs your review` : `Responded ${shortDate(r.submittedAt)}`, flag: stage === "responded" };
    if (s.events.some((e) => e.projectId === id && e.operatorId === opId && e.type === "operator_nudged")) return { text: "Nudged", flag: false };
    return viewed.has(opId) ? { text: "Opened the invite", flag: false } : { text: "Not opened", flag: false, unopened: true };
  };
  const stats = {
    total: entries.length,
    opened: entries.filter((e) => viewed.has(e.operatorId)).length,
    engaged: entries.filter((e) => ["responded", "shortlisted", "with_client", "selected"].includes(e.stage)).length,
    over: entries.filter((e) => {
      const o = operatorById(e.operatorId)!;
      return o.rate != null && o.rate > pay;
    }).length,
  };
  const margin = p.billRate ? Math.round((((p.billRate ?? 0) - pay) / p.billRate) * 100) : 0;
  const cf = confirm ? operatorById(confirm) : null;
  const others = entries.filter((e) => e.operatorId !== confirm && e.stage !== "not_selected" && e.stage !== "invited").length;
  const openOp = open ? operatorById(open) : null;
  const selected = p.selectedOperatorId ? operatorById(p.selectedOperatorId) : null;
  const qCount = questionsFor(s, id).filter((q) => !q.answer).length;
  return (
    <div className="adm-page">
      <div className="adm-pagehead">
        <div>
          <div className="adm-row">
            <Chip tone="green">Revenue Nomad</Chip>
            <Chip tone="gray">{p.visibility === "invite_only" ? "Invite only" : "Invites + open"}</Chip>
            <span className="chip c-gray num" data-testid="rn-econ">
              ${p.billRate} bill · ${pay} to operator · {margin}%
            </span>
            {ended && <Chip tone="green">{p.status === "staffed" ? "Staffed" : "Closed"}</Chip>}
          </div>
          <h1 className="serif">{p.title}</h1>
          <p>
            {p.clientName} · Operators see &quot;{p.companyDescriptor}&quot; · Day {p.postedAt ? daysBetween(p.postedAt, now) + 1 : 0} · Owner Matt Lopez
          </p>
        </div>
        {!ended && (
          <>
            <button type="button" className="adm-btn" onClick={() => setInviting(!inviting)} aria-expanded={inviting}>
              Invite more
            </button>
            <Link to={`/admin/projects/${id}/shortlist`} className="adm-btn pri" data-testid="send-shortlist">
              Send shortlist to client
            </Link>
          </>
        )}
      </div>
      {msg && (
        <div className={`adm-alert ${msg.tone === "ok" ? "ok" : ""}`} role={msg.tone === "error" ? "alert" : "status"} data-testid="admin-msg">
          {msg.text}
        </div>
      )}
      {p.status === "staffed" && selected && (
        <div className="adm-alert ok" data-testid="staffed-banner">
          {displayName(selected)} selected. Project closed, everyone else who responded was notified, agreement drafted.{" "}
          <button type="button" className="adm-btn adm-btn-sm" onClick={() => setTab("agreement")}>
            Open agreement
          </button>
        </div>
      )}
      {inviting && (
        <section className="card adm-pad">
          <InvitePicker s={s} p={p} invited={new Set(invitesFor(s, id).map((i) => i.operatorId))} resend onInvite={(opId) => run(() => inviteOperator(id, opId, "admin"), `Invite sent to ${displayName(operatorById(opId)!)}.`)} />
        </section>
      )}
      <div className="adm-tabs" role="tablist" aria-label="Project">
        {(
          [
            ["pipeline", "Pipeline"],
            ["brief", "Brief"],
            ["messages", `Messages${qCount ? ` ${qCount}` : ""}`],
            ["agreement", "Agreement"],
            ["activity", "Activity"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" type="button" className={tab === k ? "on" : ""} aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "pipeline" && (
        <>
          <div className="adm-stats num" data-testid="pipe-stats">
            <span>
              <b>{stats.total}</b> invited
            </span>
            <span>
              <b>{stats.opened}</b> opened
            </span>
            <span>
              <b>{stats.engaged}</b> engaged
            </span>
            <span>
              <b>{stats.over}</b> above pay rate
            </span>
          </div>
          <div className="adm-board" data-testid="pipeline">
            {STAGES.map((st) => {
              const col = entries
                .filter((e) => e.stage === st.key)
                .map((e) => {
                  const op = operatorById(e.operatorId)!;
                  const r = responseOf(s, id, op.id);
                  const f = r && r.submittedAt && r.interest === "interested" ? responseFit(p, r) : projectFit(p, op);
                  return { e, op, f };
                })
                .sort((a, b) => b.f.fit - a.f.fit || (a.op.id < b.op.id ? -1 : 1));
              const valid = !!dragging && pipelineOf(s, id, dragging)?.stage !== st.key;
              // End stages stay narrow until someone lands there, so the live stages get the room.
              const slim = !col.length && (st.key === "selected" || st.key === "not_selected") && !dragging;
              return (
                <section
                  key={st.key}
                  className={`adm-col-stage ${valid ? "valid" : ""} ${over === st.key && valid ? "over" : ""} ${slim ? "slim" : ""}`}
                  aria-label={st.label}
                  data-testid={`col-${st.key}`}
                  onDragOver={(ev: DragEvent) => {
                    if (!dragging || ended) return;
                    ev.preventDefault();
                    if (over !== st.key) setOver(st.key);
                  }}
                  onDragLeave={() => over === st.key && setOver(null)}
                  onDrop={(ev: DragEvent) => {
                    ev.preventDefault();
                    const who = dragging;
                    setDragging(null);
                    setOver(null);
                    if (who && pipelineOf(s, id, who)?.stage !== st.key) move(who, st.key);
                  }}
                >
                  <h3>
                    {st.label} <span className="num">{col.length}</span>
                  </h3>
                  <small className="muted">Operator sees {OP_SEES[st.key]}</small>
                  {!col.length && <p className="adm-col-hint">{st.key === "selected" ? "Moving someone here closes the project and starts the agreement." : st.key === "not_selected" ? "Declines and passes land here with a reason." : "Nobody here yet."}</p>}
                  {col.map(({ e, op, f }) => {
                    const note = cardNote(op.id, e.stage);
                    const gap = op.rate != null && op.rate > pay ? op.rate - pay : 0;
                    const idx = STAGES.findIndex((x) => x.key === e.stage);
                    const next = STAGES[idx + 1];
                    return (
                      <article
                        key={op.id}
                        className={`adm-kcard ${open === op.id ? "open" : ""} ${e.stage === "not_selected" ? "out" : ""}`}
                        draggable={!ended}
                        onDragStart={(ev: DragEvent) => {
                          try {
                            ev.dataTransfer.setData("text/plain", op.id);
                            ev.dataTransfer.effectAllowed = "move";
                          } catch {
                            /* ignore */
                          }
                          setDragging(op.id);
                        }}
                        onDragEnd={() => (setDragging(null), setOver(null))}
                        data-testid="pipeline-card"
                        data-op={displayName(op)}
                      >
                        <button type="button" className="rowbtn" onClick={() => setOpen(op.id)} aria-label={`Open ${displayName(op)}`}>
                          {displayName(op)}
                        </button>
                        <Chip tone={fitTone(f.fit)}>
                          <span className="num">{f.fit}</span>
                        </Chip>
                        <small className="muted">
                          {op.rate != null ? `$${op.rate} listed` : "No rate listed"} · {op.hrs} hrs/mo
                        </small>
                        {gap > 0 && <small className="adm-gap">${gap} over the ${pay} pay rate</small>}
                        <small className={note.flag ? "adm-flagtxt" : "muted"}>{note.text}</small>
                        {!ended && (
                          <div className="adm-row">
                            {e.stage === "invited" && (
                              <button type="button" className="adm-btn adm-btn-sm" onClick={() => run(() => nudgeOperator(id, op.id), `Nudged ${displayName(op)}.`)} data-testid="nudge-op">
                                Nudge
                              </button>
                            )}
                            {next && next.key !== "not_selected" && e.stage !== "invited" && (
                              <button type="button" className="adm-btn adm-btn-sm" onClick={() => move(op.id, next.key)} data-testid="move-next" aria-label={`Move ${displayName(op)} to ${next.label}`}>
                                Move to {next.label}
                              </button>
                            )}
                            <select className="sel" aria-label={`Move ${displayName(op)} to stage`} value="" onChange={(ev) => ev.target.value && move(op.id, ev.target.value as RnStage)} data-testid="move-any">
                              <option value="">Move to…</option>
                              {STAGES.filter((x) => x.key !== e.stage).map((x) => (
                                <option key={x.key} value={x.key}>
                                  {x.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
          <p className="muted small">Drag a card or use Move. Moving someone to Selected closes the project, notifies everyone who responded, and starts the agreement. The client only ever sees who you send in the shortlist.</p>
        </>
      )}
      {tab === "brief" && (
        <section className="card adm-pad adm-narrow">
          <dl className="kv">
            <dt>Role</dt>
            <dd>{p.title}</dd>
            <dt>Hours</dt>
            <dd>{hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax)} a month</dd>
            <dt>Term</dt>
            <dd>{p.term}</dd>
            <dt>Start</dt>
            <dd>{shortDate(p.startTarget)}</dd>
            <dt>Scope</dt>
            <dd>{p.scope || "—"}</dd>
            <dt>Success in 90 days</dt>
            <dd>{p.successIn90Days}</dd>
            <dt>Must-haves</dt>
            <dd>{p.mustHaves.join(", ")}</dd>
            <dt>Screening</dt>
            <dd>{p.screeningQuestions.join(" · ")}</dd>
          </dl>
        </section>
      )}
      {tab === "messages" && <QuestionsInbox s={s} p={p} role="admin" />}
      {tab === "agreement" && (
        <section className="card adm-pad adm-narrow" data-testid="agreement">
          {selected ? (
            <>
              <h2>Agreement, draft</h2>
              <dl className="kv">
                <dt>Client</dt>
                <dd>{p.clientName}</dd>
                <dt>Operator</dt>
                <dd>{displayName(selected)}</dd>
                <dt>Bill rate</dt>
                <dd className="num">${p.billRate}/hr</dd>
                <dt>Operator rate</dt>
                <dd className="num">${pay}/hr</dd>
                <dt>Start</dt>
                <dd>{shortDate(p.startTarget)}</dd>
                <dt>Status</dt>
                <dd>
                  <Chip tone="amber">Sent for signature</Chip>
                </dd>
              </dl>
              <p className="muted small">Signing and billing are placeholders in this prototype.</p>
            </>
          ) : (
            <p className="adm-empty">The agreement is drafted when you move someone to Selected.</p>
          )}
        </section>
      )}
      {tab === "activity" && <ActivityList s={s} p={p} />}

      {openOp && <OpDrawer s={s} p={p} op={openOp} onClose={() => setOpen(null)} move={move} run={run} />}
      {cf && (
        <div className="adm-scrim" role="dialog" aria-modal="true" aria-label={`Select ${displayName(cf)}`}>
          <div className="adm-modal">
            <h2>Select {displayName(cf)}?</h2>
            <p>
              This closes the project, notifies the {plural(others, "other")} still in the pipeline, and starts the agreement.
            </p>
            <div className="adm-row adm-end">
              <button type="button" className="adm-btn" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="adm-btn pri"
                data-testid="confirm-select-op"
                onClick={() => {
                  const who = confirm!;
                  setConfirm(null);
                  setOpen(null);
                  run(() => moveStage(id, who, "selected"), `${displayName(cf)} selected.`);
                }}
              >
                Select and close project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OpDrawer({ s, p, op, onClose, move, run }: { s: State; p: Project; op: Operator; onClose: () => void; move: (id: string, to: RnStage) => void; run: (fn: () => void, ok: string) => boolean }) {
  const e = pipelineOf(s, p.id, op.id);
  const r = responseOf(s, p.id, op.id);
  const [note, setNote] = useState(e?.note || "");
  const [text, setText] = useState("");
  const [messaging, setMessaging] = useState(false);
  const pay = p.operatorRate ?? 0;
  const gap = op.rate != null && op.rate > pay ? op.rate - pay : 0;
  const idx = STAGES.findIndex((x) => x.key === e?.stage);
  const next = STAGES[idx + 1];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const k = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const events = s.events.filter((x) => x.projectId === p.id && x.operatorId === op.id).reverse();
  const ended = isEnded(p);
  return (
    <div className="adm-drawer-scrim" onClick={onClose}>
      <aside className="adm-drawer" role="dialog" aria-label={displayName(op)} tabIndex={-1} ref={ref} onClick={(ev) => ev.stopPropagation()} data-testid="op-drawer">
        <div className="adm-drawer-h">
          <span className="adm-me-av">{op.initials}</span>
          <div className="grow">
            <b>{displayName(op)}</b>
            <small className="muted">
              {e ? STAGES.find((x) => x.key === e.stage)?.label : "Not in pipeline"} · {p.title}
            </small>
          </div>
          <button type="button" className="adm-btn adm-btn-sm ghost" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <dl className="kv">
          <dt>Reputation Index</dt>
          <dd className="num">{op.reputation}</dd>
          <dt>Availability</dt>
          <dd>
            {op.avail} · {op.hrs} hrs/mo
          </dd>
          <dt>Listed rate</dt>
          <dd className="num">{op.rate != null ? `$${op.rate}` : "None"}</dd>
          <dt>Project pays</dt>
          <dd className="num">${pay}</dd>
          {r?.submittedAt && r.interest === "interested" && (
            <>
              <dt>Their response</dt>
              <dd className="num">
                ${r.rate}/hr · {r.hoursPerMonth} hrs · start {shortDate(r.canStart)}
              </dd>
            </>
          )}
        </dl>
        {gap > 0 && (
          <div className="adm-alert">
            ${gap} over the ${pay} pay rate. Confirm they will take ${pay} before shortlisting.
          </div>
        )}
        <h3>Screening answers</h3>
        {r?.submittedAt && r.interest === "interested" ? (
          p.screeningQuestions.map((q, i) => (
            <div key={i} className="adm-answer">
              <b>
                {i + 1}. {q}
              </b>
              <p>{r.answers[i]}</p>
            </div>
          ))
        ) : (
          <p className="muted small">{r?.interest === "declined" ? `Declined: ${r.declineReason}${r.declineNote ? `. ${r.declineNote}` : ""}` : "No answers yet."}</p>
        )}
        <h3>Activity</h3>
        <ul className="adm-activity">
          {events.slice(0, 8).map((x) => (
            <li key={x.id}>
              <span>{x.type.replace(/_/g, " ")}</span>
              <small className="muted">
                {shortDate(x.at)} {timeLabel(x.at)}
              </small>
            </li>
          ))}
        </ul>
        <label className="fld">
          <span>Admin note</span>
          <textarea rows={3} value={note} onChange={(ev) => setNote(ev.target.value)} onBlur={() => e && note !== e.note && setPipelineNote(p.id, op.id, note)} placeholder="Private to admins" />
        </label>
        {messaging && (
          <div className="fld">
            <textarea rows={3} value={text} onChange={(ev) => setText(ev.target.value)} aria-label={`Message ${displayName(op)}`} />
            <button type="button" className="adm-btn adm-btn-sm pri" onClick={() => run(() => (messageOperator(p.id, op.id, text), setText(""), setMessaging(false)), `Message sent to ${displayName(op)}.`)}>
              Send message
            </button>
          </div>
        )}
        {!ended && e && (
          <div className="adm-row">
            {next && next.key !== "not_selected" && e.stage !== "invited" && (
              <button type="button" className="adm-btn pri" onClick={() => move(op.id, next.key)}>
                Move to {next.label}
              </button>
            )}
            <button type="button" className="adm-btn" onClick={() => setMessaging(!messaging)}>
              Message
            </button>
            {e.stage !== "not_selected" && (
              <button type="button" className="adm-btn danger" onClick={() => move(op.id, "not_selected")}>
                Not selected
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function ActivityList({ s, p }: { s: State; p: Project }) {
  const ev = s.events.filter((e) => e.projectId === p.id && e.type !== "alert_sent").reverse();
  return (
    <section className="card adm-pad" data-testid="activity">
      <ul className="adm-activity">
        {ev.map((e) => (
          <li key={e.id}>
            <span>
              {e.type.replace(/_/g, " ")}
              {e.operatorId ? `, ${displayName(operatorById(e.operatorId)!)}` : ""} <small className="muted">by {e.actorName}</small>
            </span>
            <small className="muted">
              {shortDate(e.at)} {timeLabel(e.at)}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- send shortlist (A5)

export function AdminShortlist({ id }: { id: string }) {
  const s = useStore();
  const p = projectById(s, id);
  const candidates = p
    ? s.pipeline
        .filter((e) => e.projectId === id && ["responded", "shortlisted", "with_client"].includes(e.stage))
        .map((e) => {
          const op = operatorById(e.operatorId)!;
          const r = responseOf(s, id, op.id);
          return { e, op, fit: r && r.submittedAt ? responseFit(p, r).fit : projectFit(p, op).fit, hrs: r?.hoursPerMonth ?? op.hrs };
        })
        .sort((a, b) => b.fit - a.fit)
    : [];
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(candidates.map((c) => [c.op.id, c.e.stage !== "responded"])));
  const [why, setWhy] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [showRate, setShowRate] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  if (!p || p.origin !== "revenue_nomad") return <div className="adm-empty">No shortlist for this project.</div>;
  const picked = candidates.filter((c) => on[c.op.id]);
  const label: Record<string, string> = { responded: "Responded", shortlisted: "Shortlisted", with_client: "With client" };
  return (
    <div className="adm-page">
      <div className="adm-split">
        <section className="card adm-pad adm-form" data-testid="shortlist-builder">
          <h1 className="serif">Send shortlist to {p.clientName}</h1>
          <p className="muted">Pick who the client sees. Everyone else stays private to you. Candidates from Responded, Shortlisted and With client.</p>
          {err && (
            <div className="adm-alert" role="alert">
              {err}
            </div>
          )}
          {!candidates.length && <p className="adm-empty">Nobody has responded yet.</p>}
          <ul className="adm-cands">
            {candidates.map((c) => (
              <li key={c.op.id} className={`adm-cand ${on[c.op.id] ? "on" : ""}`} data-testid="sl-cand" data-op={displayName(c.op)}>
                <input type="checkbox" checked={!!on[c.op.id]} onChange={(ev) => setOn({ ...on, [c.op.id]: ev.target.checked })} aria-label={`Include ${displayName(c.op)}`} />
                <div className="grow">
                  <b>{displayName(c.op)}</b>
                  <small className="muted">
                    {label[c.e.stage]} · {c.op.rate != null ? `$${c.op.rate} listed` : "No rate listed"} · {c.hrs} hrs
                  </small>
                  <input className="adm-why-in" value={why[c.op.id] || ""} onChange={(ev) => setWhy({ ...why, [c.op.id]: ev.target.value })} placeholder="Why we picked them, one line the client will read" aria-label={`Why we picked ${displayName(c.op)}`} />
                </div>
                <Chip tone={fitTone(c.fit)}>
                  <span className="num">{c.fit}</span>
                </Chip>
              </li>
            ))}
          </ul>
          <label className="fld">
            <span>Note to the client</span>
            <textarea rows={3} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Short cover note from Matt" data-testid="sl-note" />
          </label>
          <label className="adm-check">
            <input type="checkbox" checked={showRate} onChange={(ev) => setShowRate(ev.target.checked)} /> Show the client rate (${p.billRate}/hr) on each profile
          </label>
          <p className="muted small">Operator pay (${p.operatorRate}) and listed rates are never shown to the client.</p>
          <div className="adm-row">
            <Link to={`/admin/projects/${id}`} className="adm-btn">
              Back to pipeline
            </Link>
            <button
              type="button"
              className="adm-btn pri"
              disabled={!picked.length}
              data-testid="sl-send"
              onClick={() => {
                if (attempt(() => sendShortlist(id, { operatorIds: picked.map((c) => c.op.id), why, note, showRate }), setErr)) navigate(`/admin/projects/${id}?sent=1`);
              }}
            >
              Send {plural(picked.length, "profile")} to {p.clientName}
            </button>
          </div>
        </section>
        <section className="card adm-pad adm-preview" data-testid="sl-preview">
          <span className="muted small">What the client sees</span>
          <div className="adm-client">
            <small>Revenue Nomad shortlist</small>
            <b className="serif">{p.title}</b>
            <small className="muted">Prepared for {p.clientName} by Matt Lopez</small>
            {note && <p>{note}</p>}
            {!picked.length && <p className="adm-empty">Select at least one operator.</p>}
            {picked.map((c) => (
              <div key={c.op.id} className="adm-client-card">
                <span className="adm-me-av">{c.op.initials}</span>
                <div className="grow">
                  <b>{displayName(c.op)}</b>
                  <small className="muted">
                    {c.hrs} hrs/mo available{showRate ? ` · $${p.billRate}/hr` : ""}
                  </small>
                  <p>{why[c.op.id] || <span className="muted">Why we picked them</span>}</p>
                  <div className="adm-row">
                    <span className="adm-btn adm-btn-sm">View profile</span>
                    <span className="adm-btn adm-btn-sm pri">Request intro call</span>
                    <span className="adm-btn adm-btn-sm">Ask a question</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- network + insights

export function AdminClients() {
  const s = useStore();
  const list = clientList(s);
  return (
    <div className="adm-page">
      <div className="adm-pagehead">
        <div>
          <h1 className="serif">Clients</h1>
          <p>Buyer accounts that post their own projects, and Revenue Nomad clients we source for.</p>
        </div>
      </div>
      <section className="card adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Type</th>
              <th>Contact</th>
              <th className="num">Projects</th>
              <th>Latest</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const latest = [...c.projects].sort((a, b) => b.updatedAt - a.updatedAt)[0];
              return (
                <tr key={c.name}>
                  <td data-label="Client">
                    <b>{c.name}</b>
                  </td>
                  <td data-label="Type">
                    <Chip tone={c.kind === "Buyer account" ? "blue" : "green"}>{c.kind}</Chip>
                  </td>
                  <td data-label="Contact">{c.contact || "—"}</td>
                  <td data-label="Projects" className="num">
                    {c.projects.length}
                  </td>
                  <td data-label="Latest">{latest ? <Link to={`/admin/projects/${latest.id}`}>{latest.title || "Untitled"}</Link> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function AdminReviews() {
  const rows = OPERATORS.flatMap((o) => (o.profile?.reviews || []).map((r) => ({ o, r }))).sort((a, b) => (b.r.date || "").localeCompare(a.r.date || ""));
  return (
    <div className="adm-page">
      <div className="adm-pagehead">
        <div>
          <h1 className="serif">Reviews</h1>
          <p>Client reviews on operator profiles, newest first.</p>
        </div>
      </div>
      <section className="card adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Operator</th>
              <th>Reviewer</th>
              <th>Date</th>
              <th>Quote</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ o, r }, i) => (
              <tr key={i}>
                <td data-label="Operator">
                  <Link to={`/operators/${o.slug}`}>{displayName(o)}</Link>
                </td>
                <td data-label="Reviewer">
                  {r.reviewer}, {r.company}
                </td>
                <td data-label="Date">{shortDate(r.date)}</td>
                <td data-label="Quote" className="adm-quote">
                  {r.quote}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function AdminEngagements() {
  const s = useStore();
  const placed = s.projects.filter((p) => p.status === "staffed");
  return (
    <div className="adm-page">
      <div className="adm-pagehead">
        <div>
          <h1 className="serif">Engagements</h1>
          <p>Seats filled through projects. Agreements and billing are placeholders in this prototype.</p>
        </div>
      </div>
      {!placed.length && <div className="adm-empty">No placements yet. Select someone on a project to create one.</div>}
      {placed.length > 0 && (
        <section className="card adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Operator</th>
                <th>Start</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {placed.map((p) => {
                const op = p.selectedOperatorId ? operatorById(p.selectedOperatorId) : null;
                const r = op ? responseOf(s, p.id, op.id) : null;
                return (
                  <tr key={p.id}>
                    <td data-label="Project">
                      <Link to={`/admin/projects/${p.id}`}>{p.title}</Link>
                    </td>
                    <td data-label="Client">{ownerName(p)}</td>
                    <td data-label="Operator">{op ? displayName(op) : "—"}</td>
                    <td data-label="Start">{shortDate(p.startTarget)}</td>
                    <td data-label="Rate" className="num">
                      {p.origin === "revenue_nomad" ? `$${p.billRate} / $${p.operatorRate}` : r?.rate ? `$${r.rate}/hr` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

export function AdminPulse() {
  const s = useStore();
  const [msg, setMsg] = useState<string | null>(null);
  const rows = OPERATORS.map((o) => ({ o, st: opState(s, o.id) }));
  const confirmed = rows.filter((x) => x.st.lastConfirmedAt);
  const unconfirmed = rows.filter((x) => !x.st.lastConfirmedAt);
  const off = rows.filter((x) => x.st.availability === "unavailable");
  return (
    <div className="adm-page">
      <div className="adm-pagehead">
        <div>
          <h1 className="serif">Availability pulse</h1>
          <p>One-tap emails that keep availability current. Buyers see when each operator last confirmed.</p>
        </div>
        <button type="button" className="adm-btn pri" onClick={() => (sendPulse(unconfirmed.map((x) => x.o.id)), setMsg(`Pulse sent to ${plural(unconfirmed.length, "operator")}.`))} data-testid="pulse-all">
          Send pulse to {plural(unconfirmed.length, "unconfirmed operator")}
        </button>
      </div>
      {msg && <div className="adm-alert ok">{msg}</div>}
      <div className="adm-kpis">
        <div className="card adm-kpi">
          <span>Confirmed</span>
          <b className="num">{confirmed.length}</b>
        </div>
        <div className="card adm-kpi">
          <span>Not confirmed</span>
          <b className="num">{unconfirmed.length}</b>
        </div>
        <div className="card adm-kpi">
          <span>Not available</span>
          <b className="num">{off.length}</b>
        </div>
        <div className="card adm-kpi">
          <span>Pulses sent</span>
          <b className="num">{s.outbox.filter((m) => m.kind === "pulse").length}</b>
        </div>
      </div>
      <p className="muted small">
        Send a pulse to one operator from <Link to="/admin/operators">Operators</Link>.
      </p>
    </div>
  );
}

export function AdminAudit() {
  const s = useStore();
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const ev = [...s.events].reverse().filter((e) => !t || `${e.type} ${e.actorName} ${e.operatorId ? displayName(operatorById(e.operatorId)!) : ""} ${e.projectId ? projectById(s, e.projectId)?.title : ""}`.toLowerCase().includes(t));
  return (
    <div className="adm-page">
      <div className="adm-pagehead">
        <div>
          <h1 className="serif">Audit log</h1>
          <p>Every state change, with who did it and when. Reports read from this log.</p>
        </div>
        <label className="fld adm-inline">
          <span className="sr-only">Filter</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by event, person or project" aria-label="Filter audit log" />
        </label>
      </div>
      <section className="card adm-table-wrap">
        <table className="adm-table" data-testid="audit">
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>By</th>
              <th>Project</th>
              <th>Operator</th>
            </tr>
          </thead>
          <tbody>
            {ev.slice(0, 300).map((e) => (
              <tr key={e.id}>
                <td data-label="When" className="num">
                  {shortDate(e.at)} {timeLabel(e.at)}
                </td>
                <td data-label="Event">{e.type.replace(/_/g, " ")}</td>
                <td data-label="By">{e.actorName}</td>
                <td data-label="Project">{e.projectId ? projectById(s, e.projectId)?.title : "—"}</td>
                <td data-label="Operator">{e.operatorId ? displayName(operatorById(e.operatorId)!) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!ev.length && <div className="adm-empty">No events yet.</div>}
      </section>
    </div>
  );
}

export { ActionError, normalizeCategory };

// ---------------------------------------------------------------- analytics

const SOURCE_LABEL: Record<string, string> = { invite: "Buyer invite", rn_suggested: "Revenue Nomad suggestion", admin: "Revenue Nomad invite", alert: "Role alert", browse: "Found it browsing" };

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

export function AdminAnalytics() {
  const s = useStore();
  const [tab, setTab] = useState<"projects" | "discovery" | "adoption">("projects");
  const r = reports(s);
  const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
  const posted = s.projects.filter((p) => p.status !== "draft");
  const reached = r.rows.reduce((a, x) => a + x.reached, 0);
  // Anyone who responded opened the role, even through a simulated response.
  const viewed = new Set([...s.events.filter((e) => e.type === "project_viewed" || e.type === "response_submitted").map((e) => `${e.projectId}:${e.operatorId}`)]).size;
  const responders = r.rows.reduce((a, x) => a + x.responders, 0);
  const intros = r.rows.reduce((a, x) => a + x.intros, 0);
  const hires = posted.filter((p) => p.status === "staffed").length;
  const firsts = r.rows.map((x) => x.timeToFirst).filter((x): x is number => x != null);
  const fills = posted.filter((p) => p.staffedAt && p.postedAt).map((p) => p.staffedAt! - p.postedAt!);
  const spread = posted
    .filter((p) => p.status === "staffed" && p.origin === "revenue_nomad" && p.billRate && p.operatorRate)
    .reduce((a, p) => a + (p.billRate! - p.operatorRate!) * Math.round((p.hoursPerMonthMin + p.hoursPerMonthMax) / 2), 0);
  const funnel: [string, number][] = [
    ["Reached", reached],
    ["Opened the role", viewed],
    ["Responded", responders],
    ["Intro requested", intros],
    ["Hired", hires],
  ];
  const top = Math.max(1, reached);
  // Where responses, intros and hires come from.
  const bySource = new Map<string, { responses: number; intros: number; hires: number }>();
  for (const resp of s.responses.filter((x) => x.submittedAt && !x.draft && x.interest === "interested")) {
    const k = resp.viaSource || "browse";
    const v = bySource.get(k) || { responses: 0, intros: 0, hires: 0 };
    v.responses++;
    if (s.intros.some((i) => i.projectId === resp.projectId && i.operatorId === resp.operatorId)) v.intros++;
    if (projectById(s, resp.projectId)?.selectedOperatorId === resp.operatorId) v.hires++;
    bySource.set(k, v);
  }
  for (const e of s.pipeline) {
    const p = projectById(s, e.projectId);
    if (!p || p.selectedOperatorId !== e.operatorId || s.responses.some((x) => x.projectId === p.id && x.operatorId === e.operatorId)) continue;
    const v = bySource.get("admin") || { responses: 0, intros: 0, hires: 0 };
    v.hires++;
    bySource.set("admin", v);
  }
  const signups = s.outbox.filter((m) => m.kind === "signup").length;
  return (
    <div className="adm-page">
      <div className="adm-pagehead">
        <div>
          <h1 className="serif">Analytics</h1>
          <p>Every number comes from the event log, so it matches what people actually did.</p>
        </div>
      </div>
      <div className="adm-tabs" role="tablist" aria-label="Analytics">
        {(
          [
            ["projects", "Projects"],
            ["discovery", "Search and discovery"],
            ["adoption", "Usage and adoption"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" className={tab === k ? "on" : ""} aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`an-tab-${k}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === "discovery" && <MarketplaceDiscovery />}
      {tab === "adoption" && <MarketplaceAdoption />}
      {tab === "projects" && (
        <>
      <div className="adm-kpis adm-kpis-6" data-testid="analytics-kpis">
        <div className="card adm-kpi">
          <span>Response rate</span>
          <b className="num">{pct(reached ? responders / reached : null)}</b>
          <small>
            {responders} of {reached} reached
          </small>
        </div>
        <div className="card adm-kpi">
          <span>Intro rate</span>
          <b className="num">{pct(responders ? intros / responders : null)}</b>
          <small>{plural(intros, "intro")}</small>
        </div>
        <div className="card adm-kpi">
          <span>Hires</span>
          <b className="num" data-testid="an-hires">
            {hires}
          </b>
          <small>{plural(posted.length, "posted project")}</small>
        </div>
        <div className="card adm-kpi">
          <span>Median first response</span>
          <b className="num">{median(firsts) == null ? "—" : durationLabel(median(firsts)!)}</b>
          <small>After posting</small>
        </div>
        <div className="card adm-kpi">
          <span>Median time to fill</span>
          <b className="num">{median(fills) == null ? "—" : durationLabel(median(fills)!)}</b>
          <small>Posted to hired</small>
        </div>
        <div className="card adm-kpi">
          <span>Placed spread</span>
          <b className="num" data-testid="an-spread">
            {money(spread)}
          </b>
          <small>A month, Revenue Nomad projects</small>
        </div>
      </div>
      <div className="adm-split">
        <section className="card adm-pad" data-testid="funnel-chart">
          <div className="adm-card-h">
            <h2>Funnel</h2>
            <span className="muted">All posted projects</span>
          </div>
          <ol className="adm-funnel">
            {funnel.map(([label, n], i) => (
              <li key={label}>
                <span className="adm-funnel-l">{label}</span>
                <span className="adm-funnel-bar" aria-hidden="true">
                  <i style={{ width: `${Math.max(n ? 2 : 0, (n / top) * 100)}%` }} />
                </span>
                <b className="num">{n}</b>
                <small className="num">{i === 0 ? "" : funnel[i - 1][1] ? `${Math.round((n / funnel[i - 1][1]) * 100)}%` : "—"}</small>
              </li>
            ))}
          </ol>
        </section>
        <section className="card adm-table-wrap" data-testid="by-source">
          <div className="adm-card-h">
            <h2>Where hires come from</h2>
          </div>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Source</th>
                <th className="num">Responses</th>
                <th className="num">Intros</th>
                <th className="num">Hires</th>
              </tr>
            </thead>
            <tbody>
              {[...bySource.entries()]
                .sort((a, b) => b[1].hires - a[1].hires || b[1].intros - a[1].intros || b[1].responses - a[1].responses)
                .map(([k, v]) => (
                  <tr key={k} data-testid="source-row" data-source={k}>
                    <td data-label="Source">{SOURCE_LABEL[k] || k}</td>
                    <td data-label="Responses" className="num">
                      {v.responses}
                    </td>
                    <td data-label="Intros" className="num">
                      {v.intros}
                    </td>
                    <td data-label="Hires" className="num">
                      {v.hires}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!bySource.size && <div className="adm-empty">No responses yet.</div>}
          {signups > 0 && <div className="adm-foot">{plural(signups, "off-platform sign-up invite")} sent.</div>}
        </section>
      </div>
      <section className="card adm-table-wrap" data-testid="reports">
        <div className="adm-card-h">
          <h2>By project</h2>
        </div>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Project</th>
              <th className="num">Reached</th>
              <th className="num">Responded</th>
              <th className="num">Response rate</th>
              <th>First response</th>
              <th className="num">Intros</th>
              <th className="num">Intro rate</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((x) => (
              <tr key={x.project.id} data-testid="report-row" data-project={x.project.id}>
                <td data-label="Project">
                  <Link to={`/admin/projects/${x.project.id}`} className="rowlink">
                    {x.project.title}
                  </Link>
                  <small className="block muted">{ownerName(x.project)}</small>
                </td>
                <td data-label="Reached" className="num" data-testid="rep-reached">
                  {x.reached}
                </td>
                <td data-label="Responded" className="num" data-testid="rep-responders">
                  {x.responders}
                </td>
                <td data-label="Response rate" className="num" data-testid="rep-rate">
                  {pct(x.responseRate)}
                </td>
                <td data-label="First response" data-testid="rep-first">
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
        {!r.rows.length && <div className="adm-empty">No posted projects yet.</div>}
      </section>
      <div className="adm-grid2">
        <section className="card adm-pad" data-testid="rep-declines">
          <div className="adm-card-h">
            <h2>Why operators pass</h2>
          </div>
          {!Object.keys(r.declineReasons).length && <p className="muted">No passes yet.</p>}
          <ul className="adm-bars">
            {Object.entries(r.declineReasons)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <li key={k} data-testid="decline-reason" data-reason={k}>
                  <span>{k}</span>
                  <b className="num">{v}</b>
                </li>
              ))}
          </ul>
        </section>
        <section className="card adm-pad" data-testid="rep-alerts">
          <div className="adm-card-h">
            <h2>Role alerts sent</h2>
          </div>
          {!Object.keys(r.alertsByRole).length && <p className="muted">No alerts yet.</p>}
          <ul className="adm-bars">
            {Object.entries(r.alertsByRole).map(([k, v]) => (
              <li key={k} data-testid="alerts-role" data-role={k}>
                <span>{k}</span>
                <b className="num">{v}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- operators (A-09, A-10, A-12)

export function AdminOperatorsList() {
  const s = useStore();
  const { query } = useLocation();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("any");
  const [avail, setAvail] = useState<"any" | "confirmed" | "unconfirmed" | "off">("any");
  const [rep, setRep] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const page = Math.max(1, Number(query.get("page")) || 1);
  const size = 10;
  const sorted = stableSort(OPERATORS, (o) => o.reputation || 0);
  const list = sorted.filter((o) => {
    if (q.trim() && !matchesQuery(o, q)) return false;
    if (cat !== "any" && o.cat !== cat) return false;
    if ((o.reputation || 0) < rep) return false;
    const st = opState(s, o.id);
    if (avail === "confirmed" && !st.lastConfirmedAt) return false;
    if (avail === "unconfirmed" && st.lastConfirmedAt) return false;
    if (avail === "off" && st.availability !== "unavailable") return false;
    return true;
  });
  const pages = Math.max(1, Math.ceil(list.length / size));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * size, cur * size);
  const go = (n: number) => navigate(`/admin/operators?page=${n}`);
  const reset = () => cur !== 1 && go(1);
  return (
    <div className="adm-page">
      <div className="adm-pagehead">
        <div>
          <h1 className="serif">Operators</h1>
          <p>Sorted by Reputation Index, then id, so pages never shift.</p>
        </div>
        <button type="button" className="adm-btn" onClick={() => (sendPulse(shown.map((o) => o.id)), setMsg(`Availability pulse sent to ${plural(shown.length, "operator")} on this page.`))}>
          Pulse this page
        </button>
      </div>
      {msg && <div className="adm-alert ok">{msg}</div>}
      <div className="adm-filters adm-opfilters">
        <label className="fld">
          <span>Search</span>
          <input type="search" value={q} onChange={(e) => (setQ(e.target.value), reset())} placeholder="Name, role, skill or industry" data-testid="ops-search" />
        </label>
        <label className="fld">
          <span>Role category</span>
          <select value={cat} onChange={(e) => (setCat(e.target.value), reset())} data-testid="ops-cat">
            <option value="any">Any</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="fld">
          <span>Availability</span>
          <select value={avail} onChange={(e) => (setAvail(e.target.value as typeof avail), reset())} data-testid="ops-avail">
            <option value="any">Any</option>
            <option value="confirmed">Confirmed</option>
            <option value="unconfirmed">Not confirmed</option>
            <option value="off">Not available</option>
          </select>
        </label>
        <label className="fld">
          <span>Reputation Index</span>
          <select value={rep} onChange={(e) => (setRep(Number(e.target.value)), reset())}>
            {[0, 50, 60, 70].map((r) => (
              <option key={r} value={r}>
                {r ? `${r}+` : "Any"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small" data-testid="ops-count">
        {list.length} operator{list.length === 1 ? "" : "s"} · page {cur} of {pages}
      </p>
      <section className="card adm-table-wrap">
        <table className="adm-table" data-testid="ops-list">
          <thead>
            <tr>
              <th>Operator</th>
              <th>Rate</th>
              <th className="num">Hrs/mo</th>
              <th className="num">Reputation</th>
              <th>Availability</th>
              <th>Profile</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => {
              const st = opState(s, o.id);
              const c = completeness(o);
              return (
                <tr key={o.id} data-testid="op-dir-row" data-id={o.id}>
                  <td data-label="Operator">
                    <Link to={`/admin/operators/${o.id}`} className="rowlink" data-testid="op-detail-link">
                      {displayName(o)}
                    </Link>
                    <small className="block muted">
                      {o.role} · {o.cat}
                    </small>
                  </td>
                  <td data-label="Rate" className="num">
                    {o.rate != null ? `$${o.rate}` : <span className="muted">None</span>}
                  </td>
                  <td data-label="Hrs/mo" className="num">
                    {o.hrs}
                    {(o.hrs || 0) >= 120 && (
                      <span className="chip c-amber adm-ml" data-testid="check-hours" title={`${o.hrs} hrs a month is full time. The number may be mis-entered.`}>
                        Check hours
                      </span>
                    )}
                  </td>
                  <td data-label="Reputation" className="num">
                    {o.reputation}
                  </td>
                  <td data-label="Availability">
                    {st.availability === "unavailable" ? (
                      <Chip tone="red">Not available</Chip>
                    ) : st.lastConfirmedAt ? (
                      <Chip tone="green">Confirmed {shortDate(st.lastConfirmedAt)}</Chip>
                    ) : (
                      <Chip tone="gray">{o.avail}, not confirmed</Chip>
                    )}
                  </td>
                  <td data-label="Profile">
                    <Chip tone={c.pct < 60 ? "amber" : "green"}>{c.pct}%</Chip>
                  </td>
                  <td>
                    <button type="button" className="adm-btn adm-btn-sm" onClick={() => (sendPulse([o.id]), setMsg(`Availability pulse sent to ${displayName(o)}.`))} data-testid="send-pulse" aria-label={`Send availability pulse to ${displayName(o)}`}>
                      Pulse
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length && <div className="adm-empty">No operators match. Loosen a filter.</div>}
      </section>
      <nav className="adm-row adm-end" aria-label="Pages">
        <button type="button" className="adm-btn adm-btn-sm" disabled={cur <= 1} onClick={() => go(cur - 1)} data-testid="page-prev">
          Previous
        </button>
        <span className="muted small">
          Page {cur} of {pages}
        </span>
        <button type="button" className="adm-btn adm-btn-sm" disabled={cur >= pages} onClick={() => go(cur + 1)} data-testid="page-next">
          Next
        </button>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------- intro requests

export function AdminIntrosList() {
  const s = useStore();
  const now = nowOf(s);
  const rows = [...s.intros].sort((a, b) => Number(!!a.bookedSlot) - Number(!!b.bookedSlot) || a.createdAt - b.createdAt);
  return (
    <div className="adm-page">
      <div className="adm-pagehead">
        <div>
          <h1 className="serif">Intro requests</h1>
          <p>Intros are approved automatically. Unbooked ones are listed first, oldest first.</p>
        </div>
      </div>
      {!rows.length && <div className="adm-empty">No intro requests yet.</div>}
      {rows.length > 0 && (
        <section className="card adm-table-wrap">
          <table className="adm-table" data-testid="admin-intros">
            <thead>
              <tr>
                <th>Operator</th>
                <th>Project</th>
                <th>Requested</th>
                <th>Call</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const op = operatorById(i.operatorId)!;
                const p = projectById(s, i.projectId)!;
                const waiting = daysBetween(i.createdAt, now);
                return (
                  <tr key={i.id}>
                    <td data-label="Operator">
                      <Link to={`/operators/${op.slug}`} className="rowlink">
                        {displayName(op)}
                      </Link>
                    </td>
                    <td data-label="Project">
                      <Link to={`/admin/projects/${p.id}`}>{p.title}</Link>
                      <small className="block muted">{ownerName(p)}</small>
                    </td>
                    <td data-label="Requested">{shortDate(i.createdAt)}</td>
                    <td data-label="Call">
                      {i.status !== "approved" ? (
                        <Chip tone="gray">Withdrawn</Chip>
                      ) : i.bookedSlot ? (
                        <Chip tone="green">Booked {i.bookedSlot}</Chip>
                      ) : (
                        <Chip tone={waiting >= 2 ? "amber" : "blue"}>{waiting ? `Not booked, ${plural(waiting, "day")}` : "Not booked yet"}</Chip>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
