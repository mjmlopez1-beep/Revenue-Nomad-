// Jobs and Prospects inside the operator dashboard, plus the overview's
// "next moves" and "raise your fit" insights. Everything the operator marks is
// theirs alone and feeds back into what the dashboard shows them.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Operator, State, WorkMark } from "../../lib/types";
import { operatorById } from "../../lib/data";
import { briefFromProject, fitScore } from "../../lib/fit";
import {
  allOpenRoles,
  followedUp,
  markJob,
  markProspect,
  nowOf,
  operatorPortal,
  opState,
  seeJobs,
  useSession,
  useStore,
} from "../../lib/store";
import { ago, shortDate } from "../../lib/format";
import { Link } from "../../lib/router";
import {
  contactFor,
  draftFor,
  jobFit,
  linkedinSearch,
  prospectRole,
  prospectTier,
  useJobs,
  useProspects,
  whyNow,
  type JobFit,
  type WorkJob,
  type WorkProspect,
} from "../../lib/work";
import { Ring } from "./Live";

const DAY = 86400000;

function useMe(): { s: State; op: Operator } {
  const s = useStore();
  const sess = useSession();
  return { s, op: operatorById(sess.operatorId)! };
}

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const I = {
  save: "M6 3h12v18l-6-4-6 4z",
  x: "M6 6l12 12M18 6L6 18",
  out: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
};

function dueLabel(m: WorkMark | undefined, now: number): { text: string; due: boolean } | null {
  if (!m?.followUpAt) return null;
  const days = Math.ceil((m.followUpAt - now) / DAY);
  return days <= 0 ? { text: "Follow up today", due: true } : { text: `Follow up ${shortDate(m.followUpAt)}`, due: false };
}

function Segs<T extends string>({ value, set, items, label }: { value: T; set: (v: T) => void; items: [T, string, number?][]; label: string }) {
  return (
    <div className="lv-tabs" role="group" aria-label={label}>
      {items.map(([k, l, n]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => set(k)} data-testid={`seg-${k}`}>
          {l}
          {n != null && <span className="lv-count">{n}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- jobs

type JobTab = "foryou" | "saved" | "applied";

interface JobRowData {
  j: WorkJob;
  f: JobFit;
  mark?: WorkMark;
  ageDays: number;
  isNew: boolean;
}

function jobRows(jobs: WorkJob[], op: Operator, s: State, seenAt: number | undefined): JobRowData[] {
  const now = nowOf(s);
  const marks = opState(s, op.id).jobs || {};
  return jobs.map((j) => {
    const ageDays = Math.max(0, Math.floor((now - new Date(j.postedAt).getTime()) / DAY));
    return { j, f: jobFit(j, op), mark: marks[j.id], ageDays, isNew: !!seenAt && new Date(j.postedAt).getTime() > seenAt };
  });
}

/** Fit first, but a month-old role gives way to a fresh one a few points lower. */
function jobRank(r: JobRowData): number {
  return r.f.fit - Math.min(20, Math.max(0, r.ageDays - 7) * 0.5);
}

export function LiveJobs() {
  const { s, op } = useMe();
  const feed = useJobs();
  const now = nowOf(s);
  const [seenAt] = useState(() => opState(s, op.id).jobsSeenAt);
  const [tab, setTab] = useState<JobTab>("foryou");
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    seeJobs(op.id);
  }, [op.id]);
  const rows = useMemo(() => jobRows(feed.items, op, s, seenAt), [feed.items, op, s, seenAt]);
  const t = q.trim().toLowerCase();
  const matches = (r: JobRowData) => (!t || `${r.j.title} ${r.j.company} ${r.j.description}`.toLowerCase().includes(t)) && (!remote || r.j.remote);
  const saved = rows.filter((r) => r.mark?.status === "saved");
  const applied = rows.filter((r) => r.mark?.status === "applied");
  const hidden = rows.filter((r) => r.mark?.status === "dismissed");
  const forYou = rows.filter((r) => !r.mark || r.mark.status === "saved");
  const list = (tab === "foryou" ? forYou : tab === "saved" ? saved : applied).filter(matches).sort((a, b) => jobRank(b) - jobRank(a));
  const fresh = rows.filter((r) => r.isNew && !r.mark).length;
  const strong = forYou.filter((r) => r.f.fit >= 70).length;
  const best = forYou.reduce((m, r) => Math.max(m, r.f.fit), 0);
  return (
    <div className="lv-stack">
      <div className="lv-pagehead">
        <div>
          <h1>Jobs</h1>
          <p data-testid="jobs-sub">
            Fractional GTM roles from across the web, scored against your profile.{" "}
            {feed.sample ? "Showing sample roles." : feed.updatedAt ? `Updated ${ago(new Date(feed.updatedAt).getTime(), Date.now())}.` : ""}
          </p>
        </div>
        <div className="lv-headline-stat" data-testid="jobs-summary">
          <b>{fresh ? `${fresh} new` : strong || best}</b>
          <span>{fresh ? "since your last visit" : strong ? `strong fit${strong === 1 ? "" : "s"} for you` : "your best match today"}</span>
        </div>
      </div>
      <div className="lv-toolbar">
        <Segs<JobTab>
          label="Jobs"
          value={tab}
          set={setTab}
          items={[
            ["foryou", "For you", forYou.length],
            ["saved", "Saved", saved.length],
            ["applied", "Applied", applied.length],
          ]}
        />
        <div className="lv-toolbar-r">
          <button type="button" className="lv-toggle" aria-pressed={remote} onClick={() => setRemote(!remote)}>
            Remote only
          </button>
          <label className="lv-search">
            <span className="sr-only">Search jobs</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, company or skill" aria-label="Search jobs" data-testid="jobs-search" />
          </label>
        </div>
      </div>
      {feed.loading && !rows.length && <div className="lv-empty">Loading roles…</div>}
      {!list.length && !feed.loading && (
        <div className="lv-empty">{t || remote ? "Nothing matches. Clear the search or Remote only." : tab === "saved" ? "Save a role with the bookmark and it waits here." : tab === "applied" ? "Mark a role as applied and we'll remind you to follow up." : "You've been through every role. New ones land daily."}</div>
      )}
      <div className="lv-wlist" data-testid="jobs-list">
        {list.map((r) => (
          <JobRow key={r.j.id} r={r} op={op} now={now} open={open === r.j.id} toggle={() => setOpen(open === r.j.id ? null : r.j.id)} />
        ))}
      </div>
      {tab === "foryou" && hidden.length > 0 && (
        <div className="lv-hiddenbar">
          <button type="button" className="lv-link" onClick={() => setShowHidden(!showHidden)} aria-expanded={showHidden}>
            {hidden.length} dismissed {showHidden ? "· hide" : "· show"}
          </button>
          {showHidden && (
            <div className="lv-wlist">
              {hidden.map((r) => (
                <div key={r.j.id} className="lv-wrow lv-wrow-min">
                  <span className="grow">{r.j.title}</span>
                  <button type="button" className="lv-link" onClick={() => markJob(op.id, r.j.id, null)}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JobRow({ r, op, now, open, toggle }: { r: JobRowData; op: Operator; now: number; open: boolean; toggle: () => void }) {
  const { j, f, mark } = r;
  const due = dueLabel(mark, now);
  const facts = [f.rate ? (f.rate[0] === f.rate[1] ? `$${f.rate[0]}/hr` : `$${f.rate[0]}–${f.rate[1]}/hr`) : null, j.commitment || (f.hours ? `~${f.hours} hrs/mo` : null), j.term, j.remote ? "Remote" : j.location].filter(Boolean) as string[];
  const reason = (f.fit >= 70 ? f.plus : f.minus || f.plus).split(". ")[0];
  return (
    <article className={`lv-wrow ${mark?.status === "saved" ? "is-saved" : ""}`} data-testid="job-row" data-job={j.id}>
      <Ring value={f.fit} size={46} />
      <div className="lv-wrow-main">
        <div className="lv-wrow-top">
          <a href={j.url} target="_blank" rel="noopener noreferrer" className="lv-wrow-t">
            {j.title}
          </a>
          {r.isNew && !mark && <span className="lv-chip lv-chip-open">New</span>}
          {j.kind === "discussion" && <span className="lv-chip lv-chip-inv">Community lead</span>}
        </div>
        <span className="lv-muted">
          {j.company} · {r.ageDays <= 0 ? "posted today" : `posted ${r.ageDays} day${r.ageDays === 1 ? "" : "s"} ago`}
          {r.ageDays > 45 && <span className="lv-stale"> · may already be filled</span>}
        </span>
        <div className="lv-facts-line">
          {facts.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
        <button type="button" className="lv-why-line" onClick={toggle} aria-expanded={open}>
          <span className={f.fit >= 70 ? "lv-ok-t" : "lv-warn-t"}>{f.fit >= 70 ? "✓" : "!"}</span> {reason}
          <span className="lv-more">{open ? "Less" : "More"}</span>
        </button>
        {open && (
          <div className="lv-wdetail">
            <p>{j.description}</p>
            {f.minus && f.fit >= 70 && <p className="lv-muted">Watch out: {f.minus}.</p>}
          </div>
        )}
        {mark?.status === "applied" && (
          <div className="lv-wstate">
            <span className={`lv-chip ${due?.due ? "lv-chip-due" : "lv-chip-sent"}`}>
              Applied {shortDate(mark.at)}
              {due ? ` · ${due.text}` : ""}
            </span>
            {due?.due && (
              <button type="button" className="lv-btn lv-btn-sm" onClick={() => followedUp(op.id, "jobs", j.id)}>
                I followed up
              </button>
            )}
          </div>
        )}
      </div>
      <div className="lv-wrow-act">
        {mark?.status !== "applied" ? (
          <>
            <button
              type="button"
              className={`lv-ibtn ${mark?.status === "saved" ? "on" : ""}`}
              aria-pressed={mark?.status === "saved"}
              aria-label={mark?.status === "saved" ? `Unsave ${j.title}` : `Save ${j.title}`}
              title={mark?.status === "saved" ? "Saved" : "Save"}
              onClick={() => markJob(op.id, j.id, mark?.status === "saved" ? null : "saved", j.title)}
              data-testid="job-save"
            >
              <Icon d={I.save} />
            </button>
            <button type="button" className="lv-btn lv-btn-sm" onClick={() => markJob(op.id, j.id, "applied", j.title)} data-testid="job-applied">
              I applied
            </button>
            <button type="button" className="lv-ibtn" aria-label={`Dismiss ${j.title}`} title="Not for me" onClick={() => markJob(op.id, j.id, "dismissed", j.title)} data-testid="job-dismiss">
              <Icon d={I.x} />
            </button>
          </>
        ) : (
          <button type="button" className="lv-link" onClick={() => markJob(op.id, j.id, null)}>
            Undo
          </button>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- prospects

type ProspectTab = "todo" | "active" | "meetings";

export function LiveProspects() {
  const { s, op } = useMe();
  const feed = useProspects(op);
  const now = nowOf(s);
  const marks = opState(s, op.id).prospects || {};
  const [tab, setTab] = useState<ProspectTab>("todo");
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const ranked = [...feed.items].sort((a, b) => b.overall - a.overall);
  const todo = ranked.filter((p) => !marks[p.id]);
  const active = ranked.filter((p) => marks[p.id] && (marks[p.id].status === "sent" || marks[p.id].status === "replied"));
  const meetings = ranked.filter((p) => marks[p.id]?.status === "meeting");
  const list = tab === "todo" ? todo : tab === "active" ? active : meetings;
  const role = prospectRole(op);

  const sentAll = Object.values(marks).filter((m) => m.status === "sent" || m.status === "replied" || m.status === "meeting");
  const replied = sentAll.filter((m) => m.status !== "sent");
  const bySignal = new Map<string, { sent: number; won: number }>();
  for (const m of sentAll) {
    const k = m.signal || "other";
    const v = bySignal.get(k) || { sent: 0, won: 0 };
    v.sent++;
    if (m.status !== "sent") v.won++;
    bySignal.set(k, v);
  }
  const best = [...bySignal.entries()].filter(([, v]) => v.won).sort((a, b) => b[1].won / b[1].sent - a[1].won / a[1].sent)[0];

  const copy = async (p: WorkProspect) => {
    const d = draftFor(p, op);
    const text = `Subject: ${d.subject}\n\n${d.body}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard can be blocked; the draft stays on screen to select by hand */
    }
    markProspect(op.id, p.id, "sent", { signal: p.signals[0]?.type, title: p.company });
    setCopied(p.id);
    setDraft(null);
  };

  return (
    <div className="lv-stack">
      <div className="lv-pagehead">
        <div>
          <h1>Prospects</h1>
          <p>
            Companies likely to need a fractional {role.toLowerCase()} lead now, before they post a role. Matched on your profile
            {(op.allIndustries || []).length ? `: ${(op.allIndustries || []).slice(0, 3).join(", ")}` : ""}.{" "}
            <Link to={`/operators/${op.slug}`} className="lv-link">
              Sharpen it
            </Link>
          </p>
        </div>
        <div className="lv-headline-stat" data-testid="prospects-summary">
          <b>{sentAll.length ? `${Math.round((replied.length / sentAll.length) * 100)}%` : todo.length}</b>
          <span>{sentAll.length ? `reply rate on ${sentAll.length} sent` : "companies to reach"}</span>
        </div>
      </div>
      {best && (
        <div className="lv-insight" data-testid="prospect-insight">
          <Icon d={I.check} />
          <span>
            Your replies come from <b>{best[0].replace(/-/g, " ")}</b> signals ({best[1].won} of {best[1].sent}). We rank those first for you.
          </span>
        </div>
      )}
      <div className="lv-toolbar">
        <Segs<ProspectTab>
          label="Prospects"
          value={tab}
          set={setTab}
          items={[
            ["todo", "To reach", todo.length],
            ["active", "In conversation", active.length],
            ["meetings", "Meetings", meetings.length],
          ]}
        />
        {feed.sample && <span className="lv-muted lv-small">Sample companies</span>}
      </div>
      {!list.length && (
        <div className="lv-empty">
          {tab === "todo" ? "You've reached every company on your list. New ones arrive as signals fire." : tab === "active" ? "Copy a draft to a company and it moves here, with a follow-up reminder." : "Mark a conversation as a meeting when one is booked."}
        </div>
      )}
      <div className="lv-wlist" data-testid="prospects-list">
        {(best ? [...list].sort((a, b) => Number(b.signals[0]?.type === best[0]) - Number(a.signals[0]?.type === best[0])) : list).map((p) => {
          const rank = ranked.indexOf(p);
          return (
            <ProspectRow
              key={p.id}
              p={p}
              op={op}
              mark={marks[p.id]}
              now={now}
              tier={prospectTier(rank, ranked.length)}
              drafting={draft === p.id}
              copied={copied === p.id}
              onDraft={() => setDraft(draft === p.id ? null : p.id)}
              onCopy={() => copy(p)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ProspectRow({ p, op, mark, now, tier, drafting, copied, onDraft, onCopy }: { p: WorkProspect; op: Operator; mark?: WorkMark; now: number; tier: "top" | "good" | null; drafting: boolean; copied: boolean; onDraft: () => void; onCopy: () => void }) {
  const c = contactFor(p);
  const due = dueLabel(mark, now);
  const d = drafting ? draftFor(p, op) : null;
  const ev = p.signals.find((x) => x.evidenceUrl)?.evidenceUrl;
  return (
    <article className="lv-wrow" data-testid="prospect-row" data-company={p.company}>
      <span className="lv-logo-l" aria-hidden="true">
        {p.company.charAt(0)}
      </span>
      <div className="lv-wrow-main">
        <div className="lv-wrow-top">
          {p.domain ? (
            <a href={`https://${p.domain}`} target="_blank" rel="noopener noreferrer" className="lv-wrow-t">
              {p.company}
            </a>
          ) : (
            <b className="lv-wrow-t">{p.company}</b>
          )}
          {tier === "top" && !mark && <span className="lv-chip lv-chip-intro">Top pick</span>}
        </div>
        <span className="lv-why-now">
          {whyNow(p)}
          {ev && (
            <>
              {" "}
              <a href={ev} target="_blank" rel="noopener noreferrer" className="lv-link lv-small">
                Evidence
              </a>
            </>
          )}
        </span>
        <span className="lv-muted lv-small">
          Reach {c.title}. {c.why}.{" "}
          <a href={linkedinSearch(p, c.title)} target="_blank" rel="noopener noreferrer" className="lv-link" data-testid="find-contact">
            Find on LinkedIn
          </a>
        </span>
        {mark && mark.status !== "dismissed" && (
          <div className="lv-wstate">
            <span className={`lv-chip ${due?.due ? "lv-chip-due" : mark.status === "meeting" ? "lv-chip-intro" : "lv-chip-sent"}`} data-testid="prospect-state">
              {mark.status === "sent" ? `Sent ${shortDate(mark.at)}` : mark.status === "replied" ? `Replied ${shortDate(mark.at)}` : `Meeting booked ${shortDate(mark.at)}`}
              {due && mark.status !== "meeting" ? ` · ${due.text}` : ""}
            </span>
            {mark.status === "sent" && (
              <button type="button" className="lv-btn lv-btn-sm" onClick={() => markProspect(op.id, p.id, "replied", { signal: mark.signal, title: p.company })} data-testid="prospect-replied">
                They replied
              </button>
            )}
            {(mark.status === "sent" || mark.status === "replied") && (
              <button type="button" className="lv-btn lv-btn-sm" onClick={() => markProspect(op.id, p.id, "meeting", { signal: mark.signal, title: p.company })} data-testid="prospect-meeting">
                Meeting booked
              </button>
            )}
            {due?.due && (
              <button type="button" className="lv-link" onClick={() => followedUp(op.id, "prospects", p.id)}>
                I followed up
              </button>
            )}
          </div>
        )}
        {copied && <span className="lv-ok-t lv-small">Copied. Paste it into your email and add their first name.</span>}
        {d && (
          <div className="lv-draft" data-testid="prospect-draft">
            <b>{d.subject}</b>
            <pre>{d.body}</pre>
            <div className="lv-row-btns">
              <button type="button" className="lv-btn lv-btn-pri lv-btn-sm" onClick={onCopy} data-testid="prospect-copy">
                Copy and mark sent
              </button>
              <button type="button" className="lv-link" onClick={onDraft}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="lv-wrow-act">
        {!mark && (
          <>
            <button type="button" className={`lv-btn lv-btn-sm ${drafting ? "" : "lv-btn-pri"}`} onClick={onDraft} aria-expanded={drafting} data-testid="prospect-draft-btn">
              Draft email
            </button>
            <button type="button" className="lv-ibtn" aria-label={`Dismiss ${p.company}`} title="Not a fit" onClick={() => markProspect(op.id, p.id, "dismissed", { title: p.company })} data-testid="prospect-dismiss">
              <Icon d={I.x} />
            </button>
          </>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- overview insights

export interface NextMove {
  key: string;
  text: ReactNode;
  cta: string;
  to?: string;
  href?: string;
  onClick?: () => void;
}

/** Everything that is waiting on the operator, soonest first. One tap each. */
export function useNextMoves(s: State, op: Operator): NextMove[] {
  const jobs = useJobs();
  const prospects = useProspects(op);
  const now = nowOf(s);
  const st = opState(s, op.id);
  const portal = operatorPortal(s, op.id);
  const out: NextMove[] = [];
  for (const it of portal.invited)
    out.push({ key: `inv-${it.project.id}`, text: <>Respond to <b>{it.project.title}</b>. You're a {it.fit.fit} fit.</>, cta: "Respond", to: `/dashboard/projects/${it.project.id}` });
  for (const i of s.intros.filter((x) => x.operatorId === op.id && x.status === "approved" && !x.bookedSlot))
    out.push({ key: `intro-${i.id}`, text: <>A client wants to talk. Pick a time.</>, cta: "Pick a time", to: `/dashboard/projects/${i.projectId}` });
  const jobTitle = (id: string) => jobs.items.find((j) => j.id === id)?.title;
  for (const [id, m] of Object.entries(st.jobs || {}))
    if (m.status === "applied" && m.followUpAt && m.followUpAt <= now)
      out.push({ key: `job-${id}`, text: <>Follow up on <b>{m.title || jobTitle(id) || "a role you applied to"}</b>, applied {shortDate(m.at)}.</>, cta: "Done", onClick: () => followedUp(op.id, "jobs", id) });
  for (const [id, m] of Object.entries(st.prospects || {}))
    if ((m.status === "sent" || m.status === "replied") && m.followUpAt && m.followUpAt <= now)
      out.push({ key: `pr-${id}`, text: <>Follow up with <b>{m.title || prospects.items.find((p) => p.id === id)?.company || "a prospect"}</b>.</>, cta: "Follow up", to: "/dashboard/prospects" });
  if (!st.lastConfirmedAt || now - new Date(st.lastConfirmedAt + "T12:00:00Z").getTime() > 30 * DAY)
    out.push({ key: "avail", text: <>Confirm you're still available. Clients see when you last did.</>, cta: "Confirm", to: "/dashboard/availability" });
  return out;
}

const SKILL_WORDS = /salesforce|hubspot|outbound|forecast|abm|plg|pipeline|playbook|revops|onboarding|coaching|enablement|demand gen|seo|lifecycle|partnerships|meddic/g;

export interface FitLift {
  key: string;
  text: string;
  gain: number;
  sub: string;
  to: string;
  cta: string;
}

/** What one profile change would do to the roles open right now: re-scored, not guessed. */
export function useFitLifts(s: State, op: Operator): { lifts: FitLift[]; strongNow: number; total: number } {
  const jobs = useJobs();
  return useMemo(() => {
    const projects = [...new Map([...allOpenRoles(s), ...operatorPortal(s, op.id).invited.map((i) => i.project)].map((p) => [p.id, p])).values()];
    const scorers: ((o: Operator) => number)[] = [...projects.map((p) => (o: Operator) => fitScore(o, briefFromProject(p)).fit), ...jobs.items.map((j) => (o: Operator) => jobFit(j, o).fit)];
    const baseFits = scorers.map((f) => f(op));
    const strongNow = baseFits.filter((f) => f >= 70).length;
    // Effect of a change: roles that cross into a strong fit, else roles that gain 5+ points.
    const effect = (o: Operator) => {
      const fits = scorers.map((f) => f(o));
      const crossed = fits.filter((f, i) => f >= 70 && baseFits[i] < 70).length;
      const lifted = fits.filter((f, i) => f - baseFits[i] >= 5).length;
      return { crossed, lifted };
    };
    const describe = (e: { crossed: number; lifted: number }) =>
      e.crossed ? { gain: e.crossed, sub: `${e.crossed} more role${e.crossed === 1 ? "" : "s"} reach a strong fit (70+)` } : { gain: e.lifted, sub: `${e.lifted} role${e.lifted === 1 ? "" : "s"} score 5+ points higher` };
    const score = (e: { crossed: number; lifted: number }) => e.crossed * 10 + e.lifted;
    const lifts: (FitLift & { w: number })[] = [];
    // Skills that open roles
    const kws = new Map<string, number>();
    const texts = [...jobs.items.map((j) => `${j.title} ${j.description}`), ...projects.map((p) => `${p.title} ${p.mustHaves.join(" ")} ${p.successIn90Days}`)];
    for (const t of texts) for (const k of new Set(t.toLowerCase().match(SKILL_WORDS) || [])) kws.set(k, (kws.get(k) || 0) + 1);
    const have = (op.allTags || []).join(" | ").toLowerCase();
    let bestKw: { k: string; e: { crossed: number; lifted: number } } | null = null;
    for (const [k] of [...kws.entries()].filter(([k]) => !have.includes(k)).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      const e = effect({ ...op, allTags: [...(op.allTags || []), k] });
      if (score(e) > 0 && (!bestKw || score(e) > score(bestKw.e))) bestKw = { k, e };
    }
    if (bestKw) lifts.push({ key: "kw", text: `Add “${bestKw.k}” to your skills, if you have it`, ...describe(bestKw.e), w: score(bestKw.e), to: `/operators/${op.slug}`, cta: "Edit profile" });
    // Rate
    const rates = op.rate == null ? [175] : [op.rate - 25, op.rate - 50, op.rate - 75].filter((x) => x >= 100);
    for (const r of rates) {
      const e = effect({ ...op, rate: r });
      if (score(e) > 0) {
        lifts.push({ key: "rate", text: op.rate == null ? "List an hourly rate, so clients can see you fit their budget" : `A listed rate of $${r}/hr instead of $${op.rate}`, ...describe(e), w: score(e), to: `/operators/${op.slug}`, cta: op.rate == null ? "Add rate" : "Review rate" });
        break;
      }
    }
    // Hours
    const hrs = opState(s, op.id).hoursPerMonth ?? op.hrs;
    for (const h of [hrs + 20, hrs + 40]) {
      const e = effect({ ...op, hrs: h });
      if (score(e) > 0) {
        lifts.push({ key: "hrs", text: `Open ${h} hours a month instead of ${hrs}`, ...describe(e), w: score(e), to: "/dashboard/availability", cta: "Update hours" });
        break;
      }
    }
    return { lifts: lifts.sort((a, b) => b.w - a.w).slice(0, 3), strongNow, total: scorers.length };
  }, [s, op, jobs.items]);
}
