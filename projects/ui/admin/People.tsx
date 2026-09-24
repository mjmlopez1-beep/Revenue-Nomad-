// Admin views on people and the marketplace: one operator's visibility, pipeline and
// activity, and platform-wide search, discovery and adoption.

import { useMemo, useState } from "react";
import type { AppEvent, State } from "../../lib/types";
import { OPERATORS, buyerById, completeness, displayName, operatorById, operatorBySlug } from "../../lib/data";
import { nowOf, nudgeProfiles, operatorStatus, opState, projectById, projectFit, responseOf, sendPulse, useStore } from "../../lib/store";
import { METRICS, changeLabel, operatorInsights, platformInsights, type Insights } from "../../lib/insights";
import { clientRate } from "../../lib/fit";
import { ago, plural, shortDate, timeLabel } from "../../lib/format";
import { Link } from "../../lib/router";
import { TermsList, WeekChart } from "../live/Insights";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

function RangePick({ value, set }: { value: Range; set: (r: Range) => void }) {
  return (
    <div className="adm-seg" role="group" aria-label="Date range">
      {RANGES.map((r) => (
        <button key={r} type="button" aria-pressed={value === r} onClick={() => set(r)} data-testid={`adm-range-${r}`}>
          {r} days
        </button>
      ))}
    </div>
  );
}

function Kpis({ ins, range }: { ins: Insights; range: number }) {
  const rate = ins.totals.impressions ? Math.round((ins.totals.views / ins.totals.impressions) * 100) : 0;
  return (
    <div className="adm-kpis">
      {METRICS.map((m) => {
        const ch = changeLabel(ins.totals[m.key], ins.prev[m.key]);
        return (
          <div key={m.key} className="card adm-kpi" data-testid={`adm-kpi-${m.key}`}>
            <span>{m.label}</span>
            <b className="num">{ins.totals[m.key].toLocaleString("en-US")}</b>
            <small className={ch.up === null ? "" : ch.up ? "adm-up" : "adm-down"}>
              {ch.text} vs previous {range} days
            </small>
          </div>
        );
      })}
      <div className="card adm-kpi">
        <span>View rate</span>
        <b className="num">{rate}%</b>
        <small>Search appearances that became a profile view</small>
      </div>
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  invite_sent: "Invited to a project",
  invite_resent: "Invite resent",
  alert_sent: "Got a role alert",
  project_viewed: "Opened a project",
  response_draft_saved: "Saved a draft response",
  response_submitted: "Responded to a project",
  response_edited: "Edited a response",
  response_declined: "Passed on a project",
  response_withdrawn: "Withdrew a response",
  response_viewed: "Client opened their response",
  intro_requested: "Client requested an intro",
  intro_call_booked: "Booked an intro call",
  selected: "Hired",
  close_email_sent: "Got a close email",
  question_asked: "Asked a question",
  availability_confirmed: "Confirmed availability",
  alert_prefs_updated: "Changed alert settings",
  pulse_sent: "Sent an availability pulse",
  profile_nudged: "Sent a profile nudge",
  operator_nudged: "Nudged on an invite",
  operator_messaged: "Messaged by Revenue Nomad",
  stage_moved: "Moved in a pipeline",
  profile_viewed: "Profile viewed",
  search_impression: "Showed up in a search",
  compared: "Compared by a client",
  job_saved: "Saved a job",
  job_applied: "Applied to a job",
  job_dismissed: "Dismissed a job",
  prospect_sent: "Emailed a prospect",
  prospect_replied: "Prospect replied",
  prospect_meeting: "Booked a prospect meeting",
  prospect_dismissed: "Dismissed a prospect",
  followed_up: "Followed up",
};

function eventLine(s: State, e: AppEvent): string {
  const label = EVENT_LABEL[e.type] || e.type.replace(/_/g, " ");
  const p = e.projectId ? projectById(s, e.projectId) : null;
  const term = e.meta?.term ? ` for “${String(e.meta.term)}”` : "";
  return `${label}${term}${p ? `, ${p.title || "Untitled"}` : ""}`;
}

// ---------------------------------------------------------------- operator detail

export function AdminOperatorDetail({ id }: { id: string }) {
  const s = useStore();
  const op = operatorById(id) || operatorBySlug(id);
  const [range, setRange] = useState<Range>(30);
  const [msg, setMsg] = useState<string | null>(null);
  const ins = useMemo(() => (op ? operatorInsights(s, op, range) : null), [s, op, range]);
  if (!op || !ins) return <div className="adm-empty">No operator with that id.</div>;
  const now = nowOf(s);
  const st = opState(s, op.id);
  const c = completeness(op);
  const mine = s.events.filter((e) => e.operatorId === op.id || e.actorId === op.id).filter((e) => e.type !== "search_impression" && e.type !== "alert_sent");
  const lastActive = [...s.events].reverse().find((e) => e.actorId === op.id);
  const projects = s.projects.filter((p) => p.status !== "draft" && operatorStatus(s, p, op.id));
  const funnel = {
    reached: s.events.filter((e) => e.operatorId === op.id && (e.type === "invite_sent" || e.type === "alert_sent")).length,
    opened: new Set(s.events.filter((e) => e.operatorId === op.id && e.type === "project_viewed").map((e) => e.projectId)).size,
    responded: s.responses.filter((r) => r.operatorId === op.id && r.submittedAt && !r.draft && r.interest === "interested").length,
    intros: s.intros.filter((i) => i.operatorId === op.id).length,
    hired: s.projects.filter((p) => p.selectedOperatorId === op.id).length,
  };
  const jobs = Object.values(st.jobs || {});
  const prospects = Object.values(st.prospects || {});
  return (
    <div className="adm-page" data-testid="operator-detail">
      <div className="adm-pagehead">
        <div>
          <div className="adm-row">
            <span className="chip c-gray">{op.cat}</span>
            {st.availability === "unavailable" ? <span className="chip c-red">Not available</span> : st.lastConfirmedAt ? <span className="chip c-green">Available, confirmed {shortDate(st.lastConfirmedAt)}</span> : <span className="chip c-gray">{op.avail}, not confirmed</span>}
            <span className={`chip ${c.pct < 60 ? "c-amber" : "c-green"}`}>Profile {c.pct}%</span>
          </div>
          <h1 className="serif">{displayName(op)}</h1>
          <p>
            {op.role} · {op.loc || "Location not listed"} · {op.rate != null ? `$${op.rate}/hr pay, $${clientRate(op.rate)} all-in` : "No rate listed"} · {op.hrs} hrs a month · Reputation {op.reputation} · Last active {lastActive ? ago(lastActive.at, now) : "not in this prototype yet"}
          </p>
        </div>
        <Link to={`/operators/${op.slug}`} className="adm-btn">
          Public profile
        </Link>
        <button type="button" className="adm-btn" onClick={() => (sendPulse([op.id]), setMsg(`Availability pulse sent to ${displayName(op)}.`))}>
          Send pulse
        </button>
        {c.pct < 100 && (
          <button type="button" className="adm-btn" onClick={() => (nudgeProfiles([op.id]), setMsg(`Profile nudge sent to ${displayName(op)}.`))}>
            Nudge profile
          </button>
        )}
      </div>
      {msg && <div className="adm-alert ok">{msg}</div>}

      <div className="adm-row adm-sechead">
        <h2>Visibility</h2>
        <RangePick value={range} set={setRange} />
      </div>
      <Kpis ins={ins} range={range} />
      <section className="card adm-pad">
        <div className="lv-multiples">
          {METRICS.map((m) => (
            <WeekChart key={m.key} ins={ins} metric={m.key} label={m.label} unit={m.unit} />
          ))}
        </div>
      </section>
      <div className="adm-split">
        <section className="card adm-pad" data-testid="op-terms">
          <div className="adm-card-h">
            <h2>Searches that led to their profile</h2>
            <span className="muted">Last {range} days</span>
          </div>
          {ins.terms.length ? <TermsList terms={ins.terms} /> : <p className="adm-empty">No profile views from search yet.</p>}
        </section>
        <div className="adm-col">
          <section className="card adm-pad" data-testid="op-funnel">
            <div className="adm-card-h">
              <h2>Projects funnel</h2>
            </div>
            <dl className="kv">
              <dt>Reached by invite or alert</dt>
              <dd className="num">{funnel.reached}</dd>
              <dt>Opened the project</dt>
              <dd className="num">{funnel.opened}</dd>
              <dt>Responded</dt>
              <dd className="num">{funnel.responded}</dd>
              <dt>Intros from clients</dt>
              <dd className="num">{funnel.intros}</dd>
              <dt>Hired</dt>
              <dd className="num">{funnel.hired}</dd>
            </dl>
          </section>
          <section className="card adm-pad" data-testid="op-adoption">
            <div className="adm-card-h">
              <h2>Using the dashboard</h2>
            </div>
            <dl className="kv">
              <dt>Jobs saved or applied</dt>
              <dd className="num">
                {jobs.filter((j) => j.status === "saved").length} saved · {jobs.filter((j) => j.status === "applied").length} applied
              </dd>
              <dt>Prospects emailed</dt>
              <dd className="num">
                {prospects.filter((p) => p.status !== "dismissed").length} · {prospects.filter((p) => p.status === "replied" || p.status === "meeting").length} replied
              </dd>
              <dt>Alert settings</dt>
              <dd>{st.alertPrefs.join(", ") || "None"}</dd>
            </dl>
          </section>
        </div>
      </div>
      {projects.length > 0 && (
        <section className="card adm-table-wrap" data-testid="op-projects">
          <div className="adm-card-h">
            <h2>Projects</h2>
          </div>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Status</th>
                <th className="num">Fit</th>
                <th>Their rate</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const r = responseOf(s, p.id, op.id);
                return (
                  <tr key={p.id}>
                    <td data-label="Project">
                      <Link to={`/admin/projects/${p.id}`} className="rowlink">
                        {p.title}
                      </Link>
                    </td>
                    <td data-label="Client">{p.origin === "buyer" ? buyerById(p.ownerBuyerId)?.company : p.clientName}</td>
                    <td data-label="Status">{operatorStatus(s, p, op.id)}</td>
                    <td data-label="Fit" className="num">
                      {projectFit(p, op).fit}
                    </td>
                    <td data-label="Their rate">{r?.rate != null ? `$${r.rate} pay · $${clientRate(r.rate)} all-in` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      <section className="card adm-pad" data-testid="op-activity">
        <div className="adm-card-h">
          <h2>Activity</h2>
          <span className="muted">Newest first, from the event log</span>
        </div>
        {!mine.length && <p className="adm-empty">No activity since the prototype started.</p>}
        <ul className="adm-activity">
          {[...mine]
            .reverse()
            .slice(0, 40)
            .map((e) => (
              <li key={e.id}>
                <span>
                  {eventLine(s, e)} <small className="muted">{e.actorId === op.id ? "by them" : `by ${e.actorName}`}</small>
                </span>
                <small className="muted">
                  {shortDate(e.at)} {timeLabel(e.at)}
                </small>
              </li>
            ))}
        </ul>
      </section>
      <p className="muted small">Visibility weeks before {shortDate(ins.sampleUntil)} use sample history for this prototype.</p>
    </div>
  );
}

// ---------------------------------------------------------------- marketplace analytics

const SOURCE: Record<string, string> = { directory: "Browse talent search", invite: "Invite search", search: "Search result link", response: "From a response", direct: "Direct link", compare: "Compare" };

export function MarketplaceDiscovery() {
  const s = useStore();
  const [range, setRange] = useState<Range>(30);
  const ins = useMemo(() => platformInsights(s, OPERATORS, range), [s, range]);
  const now = nowOf(s);
  const since = now - range * 86400000;
  const live = s.events.filter((e) => e.at >= since && (e.type === "profile_viewed" || e.type === "search_impression" || e.type === "compared"));
  const bySource = new Map<string, number>();
  for (const e of live.filter((x) => x.type === "profile_viewed")) {
    const k = String(e.meta?.source || "direct");
    bySource.set(k, (bySource.get(k) || 0) + 1);
  }
  const searches = new Set(live.filter((e) => e.type === "search_impression").map((e) => `${e.actorId}|${String(e.meta?.term)}|${Math.floor(e.at / 86400000)}|${String(e.meta?.source)}`));
  const searchSources = new Map<string, number>();
  for (const k of searches) {
    const src = k.split("|")[3];
    searchSources.set(src, (searchSources.get(src) || 0) + 1);
  }
  return (
    <div className="adm-page" data-testid="discovery">
      <div className="adm-row adm-sechead">
        <p className="muted">How buyers find operators: what they search, what they open and compare, across the whole marketplace.</p>
        <RangePick value={range} set={setRange} />
      </div>
      <Kpis ins={ins} range={range} />
      <section className="card adm-pad">
        <div className="lv-multiples">
          {METRICS.map((m) => (
            <WeekChart key={m.key} ins={ins} metric={m.key} label={m.label} unit={m.unit} />
          ))}
        </div>
      </section>
      <div className="adm-split">
        <section className="card adm-pad" data-testid="market-terms">
          <div className="adm-card-h">
            <h2>Top searches that end in a profile view</h2>
            <span className="muted">Last {range} days</span>
          </div>
          <TermsList terms={ins.terms} />
        </section>
        <section className="card adm-table-wrap" data-testid="most-viewed">
          <div className="adm-card-h">
            <h2>Most viewed operators</h2>
          </div>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Operator</th>
                <th className="num">Views</th>
                <th>Top search</th>
              </tr>
            </thead>
            <tbody>
              {ins.topOperators.map((x) => (
                <tr key={x.op.id}>
                  <td data-label="Operator">
                    <Link to={`/admin/operators/${x.op.id}`} className="rowlink">
                      {displayName(x.op)}
                    </Link>
                    <small className="block muted">{x.op.role}</small>
                  </td>
                  <td data-label="Views" className="num">
                    {x.views}
                  </td>
                  <td data-label="Top search">{x.topTerm ? `“${x.topTerm}”` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <section className="card adm-pad" data-testid="discovery-sources">
        <div className="adm-card-h">
          <h2>Where searches and views happen</h2>
          <span className="muted">Live activity in the app, last {range} days</span>
        </div>
        <div className="adm-grid2">
          <div>
            <h3>Searches by place</h3>
            <ul className="adm-bars">
              {[...searchSources.entries()].map(([k, v]) => (
                <li key={k}>
                  <span>{SOURCE[k] || k}</span>
                  <b className="num">{v}</b>
                </li>
              ))}
              {!searchSources.size && <li className="muted">No searches yet. Search Browse talent or the invite list as a buyer.</li>}
            </ul>
          </div>
          <div>
            <h3>Profile views by how they got there</h3>
            <ul className="adm-bars">
              {[...bySource.entries()].map(([k, v]) => (
                <li key={k} data-testid="view-source" data-source={k}>
                  <span>{SOURCE[k] || k}</span>
                  <b className="num">{v}</b>
                </li>
              ))}
              {!bySource.size && <li className="muted">No profile views yet.</li>}
            </ul>
          </div>
        </div>
      </section>
      <p className="muted small">Weeks before {shortDate(ins.sampleUntil)} use sample history for this prototype. The live breakdowns count only what happened in the app.</p>
    </div>
  );
}

const FEATURES: { label: string; role: string; types: string[] }[] = [
  { label: "Post a project", role: "Buyers", types: ["project_posted"] },
  { label: "Search operators", role: "Buyers", types: ["search_impression"] },
  { label: "Open operator profiles", role: "Buyers", types: ["profile_viewed"] },
  { label: "Compare responses", role: "Buyers", types: ["compared"] },
  { label: "Request intros", role: "Buyers", types: ["intro_requested"] },
  { label: "Company profile", role: "Buyers", types: ["buyer_profile_updated"] },
  { label: "Respond to projects", role: "Operators", types: ["response_submitted"] },
  { label: "Confirm availability", role: "Operators", types: ["availability_confirmed"] },
  { label: "Jobs: save or apply", role: "Operators", types: ["job_saved", "job_applied"] },
  { label: "Prospects: email or track", role: "Operators", types: ["prospect_sent", "prospect_replied", "prospect_meeting"] },
  { label: "Book intro calls", role: "Operators", types: ["intro_call_booked"] },
];

export function MarketplaceAdoption() {
  const s = useStore();
  const now = nowOf(s);
  const weekAgo = now - 7 * 86400000;
  const active = (role: string, from: number) => new Set(s.events.filter((e) => e.actorRole === role && e.at >= from && e.type !== "search_impression").map((e) => e.actorId)).size;
  const rows = FEATURES.map((f) => {
    const ev = s.events.filter((e) => f.types.includes(e.type));
    return { ...f, actions: f.types.includes("search_impression") ? new Set(ev.map((e) => `${e.actorId}|${String(e.meta?.term)}|${Math.floor(e.at / 86400000)}`)).size : ev.length, users: new Set(ev.map((e) => e.actorId)).size, last: ev.length ? ev[ev.length - 1].at : null };
  });
  return (
    <div className="adm-page" data-testid="adoption">
      <p className="muted">Who is using what, from the event log since the prototype started. Every action a person takes is logged with who did it and when.</p>
      <div className="adm-kpis">
        <div className="card adm-kpi">
          <span>Active buyers, 7 days</span>
          <b className="num" data-testid="active-buyers">
            {active("buyer", weekAgo)}
          </b>
          <small>of {plural(2, "buyer account")}</small>
        </div>
        <div className="card adm-kpi">
          <span>Active operators, 7 days</span>
          <b className="num" data-testid="active-operators">
            {active("operator", weekAgo)}
          </b>
          <small>of {OPERATORS.length}</small>
        </div>
        <div className="card adm-kpi">
          <span>Clients active, 7 days</span>
          <b className="num">{active("client", weekAgo)}</b>
          <small>Shortlist viewers</small>
        </div>
        <div className="card adm-kpi">
          <span>Admin actions, 7 days</span>
          <b className="num">{s.events.filter((e) => e.actorRole === "admin" && e.at >= weekAgo).length}</b>
          <small>By the Revenue Nomad team</small>
        </div>
      </div>
      <section className="card adm-table-wrap" data-testid="feature-usage">
        <div className="adm-card-h">
          <h2>Feature usage</h2>
        </div>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Used by</th>
              <th className="num">People</th>
              <th className="num">Actions</th>
              <th>Last used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} data-testid="feature-row" data-feature={r.label}>
                <td data-label="Feature">{r.label}</td>
                <td data-label="Used by">{r.role}</td>
                <td data-label="People" className="num">
                  {r.users}
                </td>
                <td data-label="Actions" className="num">
                  {r.actions}
                </td>
                <td data-label="Last used">{r.last ? ago(r.last, now) : <span className="muted">Not yet</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

