import { useMemo, useState } from "react";
import { OPERATORS, displayName, explorerUrl, matchesQuery, operatorBySlug, stableSort } from "../lib/data";
import { clientAskQuestion, clientRequestCall, markViewed, nowOf, projectById, responseFit, responseOf, useSession, useStore } from "../lib/store";
import { rateLabel, shortDate } from "../lib/format";
import { Link, useLocation } from "../lib/router";
import { attempt, Availability, Avatar, Back, CheckHours, Completeness, Empty, FitParts, FitScore, FitWhy, Notice } from "./common";

// ---------------------------------------------------------------- B5 operator profile

export function OperatorProfile({ slug }: { slug: string }) {
  const s = useStore();
  const sess = useSession();
  const { query } = useLocation();
  const op = operatorBySlug(slug);
  const from = query.get("from");
  const p = from ? projectById(s, from) : undefined;
  const r = p && op ? responseOf(s, p.id, op.id) : undefined;
  useMemo(() => {
    if (p && op && sess.role === "buyer") markViewed(p.id, op.id);
  }, [p?.id, op?.id, sess.role]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!op)
    return (
      <div className="page">
        <Empty>No operator with that link.</Empty>
      </div>
    );
  const engagements = op.profile?.details?.engagements || [];
  const reviews = op.profile?.reviews || [];
  const fit = p && r && r.submittedAt ? responseFit(p, r) : null;
  return (
    <div className="page" data-testid="profile-page">
      {p ? (
        <Link to={sess.role === "admin" ? `/admin/projects/${p.id}` : `/buyer/projects/${p.id}`} className="back">
          <Back /> {p.title}
        </Link>
      ) : (
        <Link to="/operators" className="back">
          <Back /> Operators
        </Link>
      )}
      <section className="band band-profile">
        <div className="who">
          <Avatar op={op} size={112} />
          <div>
            <span className="avail-pill">
              <i aria-hidden="true" />
              <Availability s={s} op={op} />
            </span>
            <h1 data-testid="profile-name">{displayName(op)}</h1>
            <p className="band-role">{op.role}</p>
            <p className="band-headline">{op.headline}</p>
            <ul className="band-meta">
              <li>{op.loc || "Location not provided"}</li>
              <li>Time zone {op.timezone || "Not provided"}</li>
              <li>{rateLabel(op.rate)}</li>
              <li>{op.hrs} hrs a month</li>
            </ul>
            <div className="hero-skills">
              {(op.tags || []).slice(0, 6).map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </div>
        </div>
        {fit && (
          <div className="band-fit">
            <FitScore fit={fit} size="lg" />
            <small>Fit on {p!.title}</small>
          </div>
        )}
      </section>
      <div className="split">
        <div className="stack">
          {fit && p && r && (
            <section className="card">
              <h2>Their response</h2>
              <FitParts fit={fit} noRate={r.rate == null} />
              <FitWhy fit={fit} />
              <p className="small muted">
                {rateLabel(r.rate)} · {r.hoursPerMonth} hrs a month · Can start {shortDate(r.canStart)}
              </p>
              {p.screeningQuestions.map((q, i) => (
                <div key={i}>
                  <b>
                    {i + 1}. {q}
                  </b>
                  <p>{r.answers[i]}</p>
                </div>
              ))}
            </section>
          )}
          <section className="card">
            <h2>About</h2>
            <p>{op.profile?.bio || op.headline}</p>
            <h3 className="mini-h">Skills</h3>
            <div className="chips">
              {(op.allTags || []).map((t) => (
                <span key={t} className={`chip ${(op.verifiedTags || []).includes(t) ? "chip-v" : ""}`}>
                  {t}
                </span>
              ))}
            </div>
            <h3 className="mini-h">Industries</h3>
            <div className="chips">
              {(op.allIndustries || op.industries || []).map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
            </div>
          </section>
          {engagements.length > 0 && (
            <section className="card">
              <h2>Engagements</h2>
              <ul className="plain-ul">
                {engagements.map((e, i) => (
                  <li key={i}>
                    <b>{e.company}</b>, {e.role} · {e.start} to {e.end || "now"}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {reviews.length > 0 && (
            <section className="card">
              <h2>Reviews</h2>
              {reviews.map((rv, i) => (
                <blockquote key={i} className="review">
                  “{rv.quote}”
                  <footer>
                    {rv.reviewer}, {rv.role} at {rv.company}
                  </footer>
                </blockquote>
              ))}
            </section>
          )}
        </div>
        <aside className="stack">
          <section className="card">
            <h3 className="mini-h">Profile</h3>
            <div className="row">
              <Completeness op={op} />
              <CheckHours op={op} />
            </div>
            <dl className="facts">
              <div>
                <dt>Reputation index</dt>
                <dd>{op.reputation}</dd>
              </div>
              <div>
                <dt>Skill tags</dt>
                <dd>{(op.allTags || []).length}</dd>
              </div>
              <div>
                <dt>Verified tags</dt>
                <dd>{(op.verifiedTags || []).length}</dd>
              </div>
              <div>
                <dt>Engagements</dt>
                <dd>{op.eng}</dd>
              </div>
              <div>
                <dt>Reviews</dt>
                <dd>{op.rev}</dd>
              </div>
            </dl>
            <a className="btn block" href={explorerUrl(op)} target="_blank" rel="noreferrer">
              Open full profile explorer
            </a>
            <a className="btn ghost block" href={op.profileUrl} target="_blank" rel="noreferrer">
              View on revenuenomad.com
            </a>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function OperatorDirectory() {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(24);
  const list = stableSort(
    OPERATORS.filter((o) => !q.trim() || matchesQuery(o, q)),
    (o) => o.reputation || 0,
  );
  return (
    <div className="page">
      <section className="band">
        <div className="band-l">
          <h1>Find an operator</h1>
          <p className="band-sub">100 live profiles from revenuenomad.com. Post a project to get responses ranked by fit.</p>
        </div>
      </section>
      <label className="search">
        <span className="sr-only">Search operators</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, role, skill or industry" />
      </label>
      {!list.length && <Empty>No operators match "{q}".</Empty>}
      <ul className="dir-grid">
        {list.slice(0, limit).map((o) => (
          <li key={o.id}>
            <Link to={`/operators/${o.slug}`} className="card dir-card">
              <Avatar op={o} size={48} />
              <b>{displayName(o)}</b>
              <small>{o.role}</small>
              <small className="muted">{rateLabel(o.rate)}</small>
            </Link>
          </li>
        ))}
      </ul>
      {list.length > limit && (
        <button type="button" className="btn block" onClick={() => setLimit(limit + 24)}>
          Show more
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- client shortlist (A-08)

export function ClientShortlist({ id }: { id: string }) {
  const s = useStore();
  const p = projectById(s, id);
  const [asking, setAsking] = useState(false);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const lists = s.shortlists.filter((x) => x.projectId === id);
  const last = lists[lists.length - 1];
  if (!p || p.origin !== "revenue_nomad") return <Empty>No shortlist here.</Empty>;
  const showRate = last ? last.showRate !== false : false;
  const called = new Set(s.events.filter((e) => e.projectId === id && e.type === "client_requested_call").map((e) => e.operatorId));
  return (
    <div className="page narrow" data-testid="client-shortlist">
      <section className="band">
        <div className="band-l">
          <div className="band-eyebrow">
            <span className="band-tag">Shortlist from Revenue Nomad</span>
          </div>
          <h1>{p.title}</h1>
          <p className="band-sub">
            Prepared for {p.clientName} by Matt Lopez{showRate ? ` · $${p.billRate}/hr` : ""} · Sent {last ? shortDate(last.sentAt) : "not yet"}
          </p>
        </div>
      </section>
      {!last && <Notice>Revenue Nomad has not sent a shortlist yet.</Notice>}
      {last?.note && (
        <section className="card" data-testid="shortlist-note">
          <p>{last.note}</p>
          <p className="muted small">Matt Lopez, Revenue Nomad</p>
        </section>
      )}
      {msg && (
        <div className={`notice ${msg.ok ? "notice-ok" : "notice-error"}`} role={msg.ok ? "status" : "alert"} data-testid="client-msg">
          {msg.text}
        </div>
      )}
      <ul className="stack">
        {last?.operators.map((o) => {
          const op = OPERATORS.find((x) => x.id === o.operatorId);
          return (
            <li key={o.operatorId} className="card" data-testid="shortlist-op">
              <div className="row-card">
                {op && <Avatar op={op} size={44} />}
                <div className="grow">
                  <b>{o.name}</b>
                  <p className="muted small">
                    {o.role}
                    {o.hours ? ` · ${o.hours} hrs/mo available` : ""}
                  </p>
                </div>
                <span className="pill pill-tint">Fit {o.fit}</span>
                {showRate && o.billRate != null && <span className="pill">${o.billRate}/hr</span>}
              </div>
              {o.why && <p className="small" data-testid="shortlist-why">{o.why}</p>}
              <div className="chips" style={{ marginTop: 10 }}>
                {op && (
                  <Link to={`/operators/${op.slug}`} className="btn btn-sm">
                    View profile
                  </Link>
                )}
                {called.has(o.operatorId) ? (
                  <span className="pill pill-tint">Call requested</span>
                ) : (
                  <button type="button" className="btn btn-sm primary" onClick={() => attempt(() => (clientRequestCall(id, o.operatorId), setMsg({ ok: true, text: `Revenue Nomad will set up your call with ${o.name}.` })), (m) => setMsg({ ok: false, text: m }))} data-testid="client-call">
                    Request intro call
                  </button>
                )}
                <button type="button" className="btn btn-sm" onClick={() => setAsking(true)}>
                  Ask a question
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {last && (
        <section className="card">
          {asking ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (attempt(() => clientAskQuestion(id, q), (m) => setMsg({ ok: false, text: m }))) {
                  setQ("");
                  setAsking(false);
                  setMsg({ ok: true, text: "Question sent. Matt will reply by email." });
                }
              }}
            >
              <label className="field">
                <span>Your question for Revenue Nomad</span>
                <textarea rows={3} value={q} onChange={(e) => setQ(e.target.value)} data-testid="client-question" />
              </label>
              <div className="chips" style={{ marginTop: 10 }}>
                <button type="submit" className="btn btn-sm primary" data-testid="client-ask">
                  Send question
                </button>
                <button type="button" className="btn btn-sm ghost" onClick={() => setAsking(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn btn-sm" onClick={() => setAsking(true)}>
              Ask Revenue Nomad a question
            </button>
          )}
        </section>
      )}
      <p className="small muted">You see only the operators Revenue Nomad chose to send. Clock {shortDate(nowOf(s))}.</p>
    </div>
  );
}
