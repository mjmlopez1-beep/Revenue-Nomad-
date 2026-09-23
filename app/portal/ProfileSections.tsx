"use client";

import { useState, type ReactNode } from "react";
import type { EngagementRecord, ReviewRecord, SkillOperator } from "@/lib/skills/score";

// ---------- icons (inline, 1.6px stroke, inherit currentColor) ----------

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
export const VerifiedIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 3l2.4 1.8 3 .1.9 2.9 2.2 2-1 2.9.1 3-2.6 1.6-1.4 2.7-3-.4L12 21l-2.6-1.4-3 .4-1.4-2.7-2.6-1.6.1-3-1-2.9 2.2-2 .9-2.9 3-.1z" />
    <path d="M8.5 12.2l2.3 2.3 4.7-4.8" />
  </Icon>
);
const PinIcon = () => (
  <Icon>
    <path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0113 0c0 5.3-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Icon>
);
const CalendarIcon = () => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);
const ClockIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
const ShareIcon = () => (
  <Icon>
    <path d="M12 15V4M8 8l4-4 4 4" />
    <path d="M5 13v5.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V13" />
  </Icon>
);
const CompareIcon = () => (
  <Icon>
    <rect x="3.5" y="4" width="7" height="16" rx="1.5" />
    <rect x="13.5" y="4" width="7" height="16" rx="1.5" />
  </Icon>
);
const LockIcon = () => (
  <Icon size={14}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
  </Icon>
);

// ---------- helpers ----------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function Stars({ value }: { value: number }) {
  return (
    <span className="ep-stars" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8-4.3-4.1 5.9-.9z"
            fill={i <= Math.round(value) ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      ))}
    </span>
  );
}

// ---------- hero ----------

export function Hero({ op, headline }: { op: SkillOperator; headline: string[] }) {
  const d = op.details;
  const verifiedEngagements = d?.engagements.filter((e) => e.clientVerified).length ?? 0;
  const tenure = d?.engagements.length
    ? Math.round(d.engagements.reduce((a, e) => a + e.months, 0) / d.engagements.length)
    : null;
  const hireAgain = op.profile ? Math.round(op.profile.wouldHireAgain * 100) : null;

  return (
    <section className="ep-hero">
      <div className="ep-hero-main">
        <div className="ep-avatar">
          {d?.photo ? <img src={d.photo} alt={op.name} /> : <span>{initials(op.name)}</span>}
          {!op.sample && (
            <span className="ep-avatar-badge" title="Verified operator">
              <VerifiedIcon size={18} />
            </span>
          )}
        </div>
        <div className="ep-identity">
          <p className="ep-eyebrow">{op.sample ? "Sample operator" : "Fractional operator"}</p>
          <h1>{op.name}</h1>
          <p className="ep-title">{op.title}</p>
          <p className="ep-headline">{op.desc}</p>
          {d && (
            <ul className="ep-meta">
              <li>
                <PinIcon /> {d.timezone.replace("_", " ")}
              </li>
              <li>
                <CalendarIcon /> Available from {dayLabel(d.availability.startDate)}
              </li>
              <li>
                <ClockIcon /> {d.availability.hoursPerMonth} hrs / month
              </li>
            </ul>
          )}
          <div className="ep-tags">
            {headline.map((t) => (
              <span key={t} className="ep-tag">
                <VerifiedIcon size={13} />
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="ep-actions">
          <button className="ep-btn primary">Request intro</button>
          <button className="ep-btn">
            <CompareIcon /> Add to compare
          </button>
          <button className="ep-btn ghost">
            <ShareIcon /> Share with your team
          </button>
        </div>
      </div>

      {op.profile && (
        <dl className="ep-kpis">
          <div>
            <dt>Reputation Index</dt>
            <dd>
              {op.profile.reputationIndex}
              <small>{op.profile.reputationLabel}</small>
            </dd>
          </div>
          <div>
            <dt>Client rating</dt>
            <dd>
              {op.core.overall?.toFixed(1) ?? "—"}
              <small>
                {op.core.n} review{op.core.n === 1 ? "" : "s"}
              </small>
            </dd>
          </div>
          {hireAgain != null && (
            <div>
              <dt>Would hire again</dt>
              <dd>
                {hireAgain}%<small>of reviewers</small>
              </dd>
            </div>
          )}
          <div>
            <dt>Engagements</dt>
            <dd>
              {op.profile.engagements}
              <small>{verifiedEngagements} client-verified</small>
            </dd>
          </div>
          {tenure != null && (
            <div>
              <dt>Avg. engagement</dt>
              <dd>
                {tenure}
                <small>months</small>
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

// ---------- fit brief ----------

export function FitBrief({ op }: { op: SkillOperator }) {
  const d = op.details;
  if (!d) return null;
  const signature = d.engagements.find((e) => e.results?.length);
  return (
    <section className="ep-card" id="fit">
      <header className="ep-card-head">
        <div>
          <p className="ep-eyebrow">Fit</p>
          <h2>Who {op.name.split(" ")[0]} is right for</h2>
        </div>
      </header>
      <div className="ep-fit">
        <div>
          <h3>Best for</h3>
          <ul className="ep-checks">
            {d.bestFor.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Operating range</h3>
          <dl className="ep-facts">
            <div>
              <dt>Largest team led</dt>
              <dd>{d.snapshot.largestTeam}</dd>
            </div>
            <div>
              <dt>Largest annual quota</dt>
              <dd>{d.snapshot.largestQuota}</dd>
            </div>
            <div>
              <dt>Typical sales cycle</dt>
              <dd>{d.snapshot.salesCycle}</dd>
            </div>
            <div>
              <dt>Motions</dt>
              <dd>{d.snapshot.motions.join(" · ")}</dd>
            </div>
            <div>
              <dt>Methodologies</dt>
              <dd>{d.snapshot.methodologies.join(" · ")}</dd>
            </div>
          </dl>
        </div>
      </div>
      {signature && (
        <div className="ep-signature">
          <p className="ep-eyebrow">
            <VerifiedIcon size={14} /> Verified result · {signature.company}
          </p>
          <ul>
            {signature.results!.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="ep-industries">
        <h3>Industries</h3>
        <div className="ep-chip-row">
          {d.industries.map((i) => (
            <span key={i} className="ep-chip">
              {i}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- track record ----------

function EngagementItem({ e, review, open, onToggle }: {
  e: EngagementRecord;
  review?: ReviewRecord;
  open: boolean;
  onToggle: () => void;
}) {
  const hasDetail = Boolean(e.outcome || review);
  return (
    <li className={`ep-eng ${e.clientVerified ? "verified" : ""}`}>
      <span className="ep-eng-dot" aria-hidden="true" />
      <div className="ep-eng-body">
        <button className="ep-eng-head" onClick={onToggle} disabled={!hasDetail} aria-expanded={open}>
          <div>
            <p className="ep-eng-company">
              {e.company}
              {e.clientVerified ? (
                <span className="ep-verified">
                  <VerifiedIcon size={13} /> Client verified
                </span>
              ) : (
                <span className="ep-selfreported">Self-reported</span>
              )}
            </p>
            <p className="ep-eng-role">{e.role}</p>
          </div>
          <div className="ep-eng-when">
            <span>
              {monthLabel(e.start)} – {monthLabel(e.end)}
            </span>
            <span>
              {e.months} mo · {e.revenueBand} revenue
            </span>
          </div>
        </button>
        {open && hasDetail && (
          <div className="ep-eng-detail">
            {e.outcome && (
              <div className="ep-outcome">
                <p className="ep-eyebrow">Outcome</p>
                <p>{e.outcome}</p>
              </div>
            )}
            {review && (
              <figure className="ep-inline-review">
                <blockquote>“{review.quote}”</blockquote>
                <figcaption>
                  <span>
                    <strong>{review.reviewer}</strong>, {review.role} · {review.company}
                  </span>
                  <Stars value={review.overall} />
                </figcaption>
              </figure>
            )}
            {review && (
              <div className="ep-chip-row">
                {review.tags.map((t) => (
                  <span key={t} className="ep-chip verified">
                    <VerifiedIcon size={12} /> {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function TrackRecord({ op, openFirst = true }: { op: SkillOperator; openFirst?: boolean }) {
  const d = op.details;
  if (!d) return null;
  return (
    <section className="ep-card" id="track-record">
      <header className="ep-card-head">
        <div>
          <p className="ep-eyebrow">Track record</p>
          <h2>Engagement history</h2>
        </div>
        <span className="ep-head-meta">
          {d.engagements.length} engagements · {d.engagements.filter((e) => e.clientVerified).length} client-verified
        </span>
      </header>
      <TrackList engagements={d.engagements} reviews={op.reviews ?? []} openFirst={openFirst} />
    </section>
  );
}

function TrackList({ engagements, reviews, openFirst }: { engagements: EngagementRecord[]; reviews: ReviewRecord[]; openFirst: boolean }) {
  const [open, setOpen] = useState<string | null>(openFirst ? engagements[0]?.company ?? null : null);
  return (
    <ol className="ep-timeline">
      {engagements.map((e) => (
        <EngagementItem
          key={e.company}
          e={e}
          review={reviews.find((r) => r.company === e.company)}
          open={open === e.company}
          onToggle={() => setOpen(open === e.company ? null : e.company)}
        />
      ))}
    </ol>
  );
}

// ---------- reviews ----------

export function Reviews({ op }: { op: SkillOperator }) {
  const reviews = op.reviews ?? [];
  if (!reviews.length) return null;
  return (
    <section className="ep-card" id="reviews">
      <header className="ep-card-head">
        <div>
          <p className="ep-eyebrow">Client reviews</p>
          <h2>What clients say</h2>
        </div>
        <span className="ep-head-meta">
          {op.core.overall?.toFixed(1)} average · {reviews.length} verified
        </span>
      </header>
      <div className="ep-reviews">
        {reviews.map((r) => (
          <figure key={r.reviewer} className="ep-review">
            <div className="ep-review-head">
              <span className="ep-initials">{initials(r.reviewer)}</span>
              <div>
                <strong>{r.reviewer}</strong>
                <span>
                  {r.role} · {r.company}
                </span>
              </div>
            </div>
            <Stars value={r.overall} />
            <blockquote>“{r.quote}”</blockquote>
            <figcaption>
              <span className="ep-verified">
                <VerifiedIcon size={13} /> Verified client
              </span>
              {r.hireAgain && <span>Would hire again</span>}
              <span>{dayLabel(r.date)}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

// ---------- sidebar ----------

export function EngageCard({ op }: { op: SkillOperator }) {
  const d = op.details;
  if (!d) return null;
  return (
    <section className="ep-card ep-side">
      <p className="ep-eyebrow">Engage {op.name.split(" ")[0]}</p>
      <p className="ep-status">
        <span className="ep-status-dot" /> {d.availability.status}
      </p>
      <dl className="ep-facts compact">
        <div>
          <dt>Earliest start</dt>
          <dd>{dayLabel(d.availability.startDate)}</dd>
        </div>
        <div>
          <dt>Capacity</dt>
          <dd>{d.availability.hoursPerMonth} hrs / month</dd>
        </div>
        <div>
          <dt>Time zone</dt>
          <dd>{d.timezone.replace("_", " ")}</dd>
        </div>
        <div>
          <dt>Rate</dt>
          <dd className="ep-locked">
            <LockIcon /> Shown to signed-in clients
          </dd>
        </div>
      </dl>
      <button className="ep-btn primary block">Request intro</button>
      <p className="ep-fine">
        Scheduling, messaging and contracting run through Revenue Nomad. Intro requests have a 72-hour response window.
      </p>
    </section>
  );
}

export function ReputationCard({ op }: { op: SkillOperator }) {
  if (!op.profile) return null;
  const early = op.core.n < 5;
  return (
    <section className="ep-card ep-side ep-rep">
      <p className="ep-eyebrow">Reputation Index</p>
      <div className="ep-rep-score">
        <b>{op.profile.reputationIndex}</b>
        <span>/ 100</span>
      </div>
      <p className="ep-rep-label">{op.profile.reputationLabel}</p>
      <div className="ep-rep-meter" aria-hidden="true">
        <span style={{ width: `${op.profile.reputationIndex}%` }} />
      </div>
      {early && (
        <p className="ep-early">
          Early signal · based on {op.core.n} client review{op.core.n === 1 ? "" : "s"} and {op.profile.engagements}{" "}
          engagements
        </p>
      )}
      <details className="ep-how">
        <summary>How the index works</summary>
        <p>A single 0–100 score, the same for every buyer. It weighs:</p>
        <ul>
          <li>Client ratings, with recent reviews counting more</li>
          <li>Number of reviews</li>
          <li>Engagements completed</li>
          <li>Buyer interest in the last 90 days</li>
          <li>Profile completeness</li>
          <li>Share of reviews from on-platform engagements</li>
        </ul>
        <p>Every review is moderated before it counts, with at most two per client company.</p>
      </details>
    </section>
  );
}
