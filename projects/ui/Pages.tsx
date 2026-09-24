import { useEffect, useMemo, useState } from "react";
import { OPERATORS, displayName, explorerUrl, matchesQuery, operatorBySlug, stableSort } from "../lib/data";
import { clientAskQuestion, clientRequestCall, markViewed, trackSignals, useSearchImpressions, nowOf, projectById, responseFit, responseOf, useSession, useStore } from "../lib/store";
import { rateLabel, shortDate } from "../lib/format";
import { allInLabel } from "../lib/fit";
import { Link, useLocation } from "../lib/router";
import { CompanyFitChip, useBuyerFit } from "./buyer/Company";
import { attempt, Availability, Avatar, Back, CheckHours, Completeness, Empty, FitScore, FitWhy, Notice } from "./common";

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
  // Anyone but the operator themselves opening the profile counts as a profile view.
  const term = query.get("q") || "";
  const buyerFit = useBuyerFit();
  useEffect(() => {
    if (!op || (sess.role === "operator" && sess.operatorId === op.id)) return;
    trackSignals([{ type: "profile_viewed", operatorId: op.id, term, source: from ? "response" : term ? "search" : "direct", projectId: from || undefined }], sess.role, sess.role === "buyer" ? sess.buyerId : undefined);
  }, [op?.id, sess.role, term, from]); // eslint-disable-line react-hooks/exhaustive-deps
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
              <li>{sess.role === "operator" ? `${rateLabel(op.rate)} to you` : allInLabel(op.rate)}</li>
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
            <section className="card resp-card" data-testid="their-response">
              <h2>Their response</h2>
              <dl className="resp-facts">
                <div>
                  <dt>Rate, all-in</dt>
                  <dd title="Includes Revenue Nomad's fee">{allInLabel(r.rate).replace(" all-in", "")}</dd>
                </div>
                <div>
                  <dt>Hours a month</dt>
                  <dd>{r.hoursPerMonth}</dd>
                </div>
                <div>
                  <dt>Can start</dt>
                  <dd>{shortDate(r.canStart)}</dd>
                </div>
              </dl>
              <FitWhy fit={fit} />
              <ol className="resp-qa">
                {p.screeningQuestions.map((q, i) => (
                  <li key={i}>
                    <b>{q}</b>
                    <p>{r.answers[i] || <span className="muted">No answer</span>}</p>
                  </li>
                ))}
              </ol>
              {!!r.proof?.length && <p className="small muted">Case studies attached: {r.proof.join(", ")}</p>}
              {r.note && <p className="resp-note">“{r.note}”</p>}
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
            {sess.role === "buyer" ? (
              (() => {
                const cf = buyerFit(op);
                return cf && cf.level !== "unknown" ? (
                  <div className="cf-detail" data-testid="profile-company-fit">
                    <CompanyFitChip fit={cf} />
                    <ul>
                      {cf.matched.map((m) => (
                        <li key={m} className="ok">
                          {m}
                        </li>
                      ))}
                      {cf.missed.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </div>
                ) : null;
              })()
            ) : (
              <div className="row">
                <Completeness op={op} />
                <CheckHours op={op} />
              </div>
            )}
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
  const sess = useSession();
  const buyerFit = useBuyerFit();
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(24);
  const list = stableSort(
    OPERATORS.filter((o) => !q.trim() || matchesQuery(o, q)),
    (o) => o.reputation || 0,
  );
  useSearchImpressions(q, list.slice(0, limit).map((o) => o.id), "directory");
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
            <Link to={`/operators/${o.slug}${q.trim() ? `?q=${encodeURIComponent(q.trim().toLowerCase())}` : ""}`} className="card dir-card">
              <Avatar op={o} size={48} />
              <b>{displayName(o)}</b>
              <small>{o.role}</small>
              <small className="muted">{sess.role === "operator" ? rateLabel(o.rate) : allInLabel(o.rate)}</small>
              <CompanyFitChip fit={buyerFit(o)} />
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
