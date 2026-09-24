// Buyer company profile: the standard picklists that drive "company fit" on every
// operator the buyer sees. Every field is one tap and saves on its own.

import { useState } from "react";
import type { Operator } from "../../lib/types";
import { OPERATORS, buyerById, displayName } from "../../lib/data";
import { buyerProfileOf, saveBuyerProfile, useSession, useStore } from "../../lib/store";
import {
  ACV_BANDS,
  CRMS,
  EMPLOYEE_SIZES,
  INDUSTRIES,
  MOTIONS,
  REVENUE_SIZES,
  SALES_CYCLES,
  SEGMENTS,
  STAGES,
  companyFit,
  profileCompleteness,
  type BuyerProfile,
  type CompanyFit,
} from "../../lib/company";
import { Link } from "../../lib/router";
import { Avatar, Band } from "../common";

type Opt = [string, string];

function Pick({ label, hint, opts, value, onPick, testId }: { label: string; hint?: string; opts: Opt[]; value: string; onPick: (v: string) => void; testId: string }) {
  return (
    <fieldset className="field cp-field" data-testid={testId}>
      <legend>{label}</legend>
      {hint && <small className="muted">{hint}</small>}
      <div className="chips">
        {opts.map(([v, l]) => (
          <button key={v} type="button" className="chip chip-btn cp-chip" aria-pressed={value === v} onClick={() => onPick(value === v ? "" : v)}>
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function PickMany({ label, hint, opts, value, onPick, testId }: { label: string; hint?: string; opts: Opt[]; value: string[]; onPick: (v: string[]) => void; testId: string }) {
  return (
    <fieldset className="field cp-field" data-testid={testId}>
      <legend>{label}</legend>
      {hint && <small className="muted">{hint}</small>}
      <div className="chips">
        {opts.map(([v, l]) => {
          const on = value.includes(v);
          return (
            <button key={v} type="button" className="chip chip-btn cp-chip" aria-pressed={on} onClick={() => onPick(on ? value.filter((x) => x !== v) : [...value, v])}>
              {l}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Company fit against the signed-in buyer's profile, or null for anyone else. */
export function useBuyerFit(): (op: Operator) => CompanyFit | null {
  const s = useStore();
  const sess = useSession();
  const bp = sess.role === "buyer" ? buyerProfileOf(s, sess.buyerId) : null;
  return (op: Operator) => (bp ? companyFit(op, bp) : null);
}

export function CompanyFitChip({ fit, testId = "company-fit" }: { fit: CompanyFit | null; testId?: string }) {
  if (!fit || fit.level === "unknown") return null;
  const tip = [...fit.matched.map((m) => `✓ ${m}`), ...fit.missed.map((m) => `– ${m}`)].join("\n");
  return (
    <span className={`chip cf cf-${fit.level}`} title={tip} data-testid={testId} data-level={fit.level}>
      {fit.label}
      <span className="cf-n">
        {fit.matched.length}/{fit.known}
      </span>
    </span>
  );
}

export function BuyerCompany() {
  const s = useStore();
  const sess = useSession();
  const buyer = buyerById(sess.buyerId)!;
  const p = buyerProfileOf(s, sess.buyerId)!;
  const [showAll, setShowAll] = useState(false);
  const set = (patch: Partial<BuyerProfile>) => saveBuyerProfile(sess.buyerId, patch);
  const pct = profileCompleteness(p);
  const ranked = OPERATORS.map((o) => ({ o, f: companyFit(o, p) }))
    .filter((x) => x.f.level !== "unknown")
    .sort((a, b) => b.f.matched.length / b.f.known - a.f.matched.length / a.f.known || b.f.known - a.f.known || (a.o.reputation < b.o.reputation ? 1 : -1));
  const strong = ranked.filter((x) => x.f.level === "strong").length;
  const industries = showAll ? INDUSTRIES : INDUSTRIES.slice(0, 14);
  const indOpts: Opt[] = [...new Set([...p.industries, ...industries])].map((i) => [i, i]);
  return (
    <div className="page">
      <Band slim eyebrow={buyer.company} title="Company profile" sub="Tell us about your business once. Every operator you see gets a company fit, matched on the same picklists operators use." />
      <div className="split">
        <form className="card form-card cp-form" onSubmit={(e) => e.preventDefault()} data-testid="company-form">
          <div className="card-head">
            <h2>Your company</h2>
            <span className="head-meta" data-testid="cp-complete">
              {pct}% complete · saves as you tap
            </span>
          </div>
          <PickMany label="Industry" hint="Pick up to 3" opts={indOpts} value={p.industries} onPick={(v) => set({ industries: v.slice(-3) })} testId="cp-industry" />
          {!showAll && (
            <button type="button" className="link-btn" onClick={() => setShowAll(true)}>
              Show all {INDUSTRIES.length} industries
            </button>
          )}
          <Pick label="Company size" opts={EMPLOYEE_SIZES} value={p.employees} onPick={(v) => set({ employees: v })} testId="cp-size" />
          <Pick label="Annual revenue" opts={REVENUE_SIZES} value={p.revenue} onPick={(v) => set({ revenue: v })} testId="cp-revenue" />
          <Pick label="Stage" opts={STAGES} value={p.stage} onPick={(v) => set({ stage: v })} testId="cp-stage" />
          <Pick label="Average deal size (ACV)" opts={ACV_BANDS} value={p.acv} onPick={(v) => set({ acv: v })} testId="cp-acv" />
          <Pick label="Sales cycle" opts={SALES_CYCLES} value={p.salesCycle} onPick={(v) => set({ salesCycle: v })} testId="cp-cycle" />
          <PickMany label="GTM motion" opts={MOTIONS} value={p.motions} onPick={(v) => set({ motions: v })} testId="cp-motion" />
          <PickMany label="Customer segment" opts={SEGMENTS} value={p.segments} onPick={(v) => set({ segments: v })} testId="cp-segment" />
          <Pick label="CRM" opts={CRMS} value={p.crm} onPick={(v) => set({ crm: v })} testId="cp-crm" />
        </form>
        <aside className="stack">
          <section className="card" data-testid="cp-preview">
            <h3 className="mini-h">What this changes</h3>
            <p className="lm-big">
              <b data-testid="cp-strong">{strong}</b> operators are a strong company fit
            </p>
            <p className="small muted">
              Company fit compares your industry, deal size, sales cycle, stage and CRM with each operator's track record. It shows beside the fit score on responses, in the invite list and in the directory. Where an operator hasn't
              filled a field in, it doesn't count against them.
            </p>
            <ol className="lm-top">
              {ranked.slice(0, 5).map(({ o, f }) => (
                <li key={o.id}>
                  <div className="lm-who">
                    <Avatar op={o} size={28} />
                    <span>
                      <Link to={`/operators/${o.slug}`}>
                        <b>{displayName(o)}</b>
                      </Link>
                      <small>{f.matched.slice(0, 2).join(" · ")}</small>
                    </span>
                    <CompanyFitChip fit={f} testId="cp-top" />
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
