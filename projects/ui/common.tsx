import { useState, type ReactNode } from "react";
import type { Operator, State } from "../lib/types";
import { FIT_PARTS, TIER_LABEL, clientRate, type FitResult } from "../lib/fit";
import { CHECK_HOURS_AT, completeness, displayName, photoUrl } from "../lib/data";
import { opState } from "../lib/store";
import { shortDate } from "../lib/format";
import { Link } from "../lib/router";

export function Avatar({ op, size = 40 }: { op: Operator; size?: number }) {
  const [broken, setBroken] = useState(false);
  const src = photoUrl(op);
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) };
  if (!src || broken)
    return (
      <span className={`avatar initials tpl-${op.cat.toLowerCase().replace(/&/g, "").replace(/[^a-z]+/g, "-").replace(/-+$/, "")}`} style={style} role="img" aria-label={displayName(op)} data-testid="avatar-initials">
        {op.initials || displayName(op).split(" ").map((w) => w[0]).join("").slice(0, 2)}
      </span>
    );
  return <img className="avatar" style={style} src={src} alt={displayName(op)} onError={() => setBroken(true)} loading="lazy" />;
}

export function FitScore({ fit, size = "md" }: { fit: FitResult; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`fit fit-${fit.tier} fit-${size}`} data-testid="fit-score" title={`${fit.fit}, ${TIER_LABEL[fit.tier]}`}>
      <b>{fit.fit}</b>
      {size !== "sm" && <small>{TIER_LABEL[fit.tier]}</small>}
    </span>
  );
}

export function TierChip({ tier }: { tier: "strong" | "possible" | "weak" }) {
  return <span className={`tier tier-${tier}`}>{TIER_LABEL[tier]}</span>;
}

export function FitParts({ fit, noRate }: { fit: FitResult; noRate?: boolean }) {
  return (
    <div className="parts" data-testid="fit-parts">
      {FIT_PARTS.map((p, i) => (
        <div key={p.label} className="part">
          <span className="part-l">{p.label}</span>
          <span className="part-bar" aria-hidden="true">
            <i style={{ width: `${(fit.parts[i] / p.max) * 100}%` }} />
          </span>
          <span className="part-v" data-testid={`part-${i}`}>
            {fit.parts[i]}/{p.max}
          </span>
          {i === 2 && noRate && <span className="part-note">No rate listed</span>}
        </div>
      ))}
    </div>
  );
}

export function FitWhy({ fit }: { fit: FitResult }) {
  return (
    <div className="why">
      {fit.plus && (
        <p className="why-plus">
          <Check /> {fit.plus}
        </p>
      )}
      {fit.minus && (
        <p className="why-minus">
          <Gap /> {fit.minus}
        </p>
      )}
    </div>
  );
}

export function Completeness({ op }: { op: Operator }) {
  const c = completeness(op);
  return (
    <span className={`chip ${c.pct < 60 ? "chip-thin" : "chip-v"}`} title={c.missing.length ? `Missing ${c.missing.join(", ")}` : "Complete profile"} data-testid="completeness">
      Profile {c.pct}% complete
    </span>
  );
}

const CITY_STATE: Record<string, RegExp> = {
  austin: /austin|texas|\btx\b/i,
  "new york": /new york|\bny\b|brooklyn|jersey/i,
  "san francisco": /san francisco|bay area|oakland|california|\bca\b/i,
  boston: /boston|massachusetts|\bma\b/i,
  chicago: /chicago|illinois|\bil\b/i,
};

/**
 * Where an operator doesn't line up with the seat: hours, rate and location.
 * Uses the numbers in their response when there is one, else their profile.
 */
export function seatFlags(op: Operator, p: { hoursPerMonthMin: number; hoursPerMonthMax: number; budgetMin?: number | null; budgetMax?: number | null; location: string; origin?: string; operatorRate?: number | null }, r?: { rate: number | null; hoursPerMonth: number | null } | null): { key: string; text: string; tone: "warn" | "info" }[] {
  const out: { key: string; text: string; tone: "warn" | "info" }[] = [];
  const hrs = r?.hoursPerMonth ?? op.hrs ?? 0;
  const rate = r ? r.rate : op.rate;
  if (hrs >= CHECK_HOURS_AT) out.push({ key: "hours-high", text: `${hrs} hrs a month, check hours`, tone: "warn" });
  else if (hrs < p.hoursPerMonthMin) out.push({ key: "hours", text: `${hrs} hrs a month, seat needs ${p.hoursPerMonthMin}+`, tone: "warn" });
  // Buyers compare in client dollars (all-in); Revenue Nomad seats compare pay with the set pay rate.
  const rn = p.origin === "revenue_nomad";
  const max = rn ? p.operatorRate : p.budgetMax;
  const shown = rate == null ? null : rn ? rate : clientRate(rate)!;
  if (shown == null) out.push({ key: "rate", text: "No rate listed", tone: "info" });
  else if (max != null && shown > max) out.push({ key: "rate", text: `$${shown - max}/hr over budget`, tone: "warn" });
  const site = p.location.match(/on[ -]?site in ([A-Za-z .]+)/i)?.[1]?.trim();
  if (site) {
    const re = CITY_STATE[site.toLowerCase()] || new RegExp(site, "i");
    if (op.loc && !re.test(op.loc)) out.push({ key: "location", text: `Based in ${op.loc.split(",")[0]}, on site in ${site}`, tone: "info" });
    else if (!op.loc) out.push({ key: "location", text: `Location not listed, on site in ${site}`, tone: "info" });
  } else if (!/remote/i.test(p.location) && op.loc && !new RegExp(p.location.split(",")[0], "i").test(op.loc)) {
    out.push({ key: "location", text: `Based in ${op.loc.split(",")[0]}, role is in ${p.location}`, tone: "info" });
  }
  return out;
}

export function SeatFlags({ flags }: { flags: ReturnType<typeof seatFlags> }) {
  return (
    <>
      {flags.map((f) => (
        <span key={f.key} className={`chip ${f.tone === "warn" ? "chip-warn" : "chip-thin"}`} data-testid={f.key === "hours-high" ? "check-hours" : `flag-${f.key}`}>
          {f.text}
        </span>
      ))}
    </>
  );
}

export function CheckHours({ op }: { op: Operator }) {
  if ((op.hrs || 0) < CHECK_HOURS_AT) return null;
  return (
    <span className="chip chip-warn" title={`${op.hrs} hrs a month is full time. The number may be mis-entered.`} data-testid="check-hours">
      Check hours
    </span>
  );
}

export function Availability({ s, op }: { s: State; op: Operator }) {
  const st = opState(s, op.id);
  const label =
    st.availability === "unavailable"
      ? "Not available"
      : st.availability === "from"
        ? `Available from ${shortDate(st.availableFrom)}`
        : st.availability === "open"
          ? "Available now"
          : op.avail;
  return (
    <span className="availability">
      {label}
      {st.lastConfirmedAt ? (
        <span className="confirmed" data-testid="confirmed">
          Confirmed {shortDate(st.lastConfirmedAt)}
        </span>
      ) : (
        <span className="unconfirmed" data-testid="not-confirmed">
          Not confirmed
        </span>
      )}
    </span>
  );
}

export function OpLink({ op, children }: { op: Operator; children?: ReactNode }) {
  return <Link to={`/operators/${op.slug}`}>{children ?? displayName(op)}</Link>;
}

export function Band({ eyebrow, title, sub, children, right, slim }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; children?: ReactNode; right?: ReactNode; slim?: boolean }) {
  return (
    <section className={`band ${slim ? "band-slim" : ""}`}>
      <div className="band-l">
        {eyebrow && <div className="band-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p className="band-sub">{sub}</p>}
        {children}
      </div>
      {right && <div className="band-r">{right}</div>}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty" role="status">
      {children}
    </div>
  );
}

export function Notice({ tone = "info", children, testId }: { tone?: "info" | "warn" | "ok" | "error"; children: ReactNode; testId?: string }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"} data-testid={testId}>
      {children}
    </div>
  );
}

export function FieldError({ msg, id }: { msg?: string; id?: string }) {
  if (!msg) return null;
  return (
    <p className="field-error" id={id} role="alert">
      {msg}
    </p>
  );
}

export function Stat({ label, value, sub, accent, testId }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean; testId?: string }) {
  return (
    <div className={`stat ${accent ? "stat-accent" : ""}`} data-testid={testId}>
      <span className="stat-l">{label}</span>
      <span className="stat-v">{value}</span>
      {sub && <span className="stat-s">{sub}</span>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "Draft",
    live: "Live",
    paused: "Paused",
    closed_to_responses: "Closed to new responses",
    staffed: "Staffed",
    closed_unfilled: "Closed, unfilled",
  };
  return <span className={`pill pill-${status}`}>{map[status] || status}</span>;
}

export function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className="ico-check">
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}
export function Gap() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="ico-gap">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.5M8 11h.01" />
    </svg>
  );
}
export function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 2l5 5-5 5" />
    </svg>
  );
}
export function Back() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 2L4 7l5 5" />
    </svg>
  );
}

export function useFlash(): [string | null, (m: string | null) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  return [msg, setMsg];
}

/** Run an action; show ActionError text instead of throwing. */
export function attempt(fn: () => void, onError: (m: string, field?: string) => void): boolean {
  try {
    fn();
    return true;
  } catch (e) {
    const err = e as Error & { field?: string };
    onError(err.message, err.field);
    return false;
  }
}
