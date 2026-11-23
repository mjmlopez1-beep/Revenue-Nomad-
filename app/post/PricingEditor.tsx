"use client";

/**
 * Options the client picks from (Close), in the proposal builder: 1 to 3 options, each with a
 * name, a price, how it is billed, what's included and one marked recommended, and add-ons with
 * their price. Without any, the proposal has one price in its own words, as before. The client's
 * page shows 3 side by side (stacked on a phone), 2, or one price (app/sign/ProposalView.tsx).
 *
 * Self-contained: the editor (Proposals.tsx) passes the pricing and saves what comes back the way
 * it saves every change. The server cleans it (lib/proposals/pricing.ts cleanPricing).
 */
import { useEffect, useRef, useState } from "react";
import { PRICING_LIMITS, priced } from "@/lib/proposals/pricing";
import type { Billing, Pricing } from "@/lib/proposals/types";
import "./pricing.css";

type OptDraft = { id: string; name: string; price: string; billing: Billing; note: string; about: string; included: string; recommended: boolean };
type AddDraft = { id: string; name: string; price: string; billing: Billing; about: string };
const rid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;

const toDraft = (v: Pricing | null) => ({
  options: (v?.options ?? []).map((o): OptDraft => ({ id: o.id, name: o.name, price: String(o.price || ""), billing: o.billing, note: o.note ?? "", about: o.about ?? "", included: o.included.join("\n"), recommended: !!o.recommended })),
  addOns: (v?.addOns ?? []).map((a): AddDraft => ({ id: a.id, name: a.name, price: String(a.price || ""), billing: a.billing, about: a.about ?? "" })),
});
const num = (s: string) => Math.max(0, Math.round(Number(s.replace(/[$,\s]/g, "")) || 0));
const fromDraft = (d: ReturnType<typeof toDraft>): Pricing | null =>
  d.options.length || d.addOns.length
    ? {
        options: d.options.map((o) => ({ id: o.id, name: o.name, price: num(o.price), billing: o.billing, ...(o.note.trim() ? { note: o.note } : {}), ...(o.about.trim() ? { about: o.about } : {}), included: o.included.split("\n").map((t) => t.trim()).filter(Boolean), ...(o.recommended ? { recommended: true } : {}) })),
        addOns: d.addOns.map((a) => ({ id: a.id, name: a.name, price: num(a.price), billing: a.billing, ...(a.about.trim() ? { about: a.about } : {}) })),
      }
    : null;

export function PricingEditor({ value, readOnly, onChange, compact = false }: { value: Pricing | null; readOnly: boolean; onChange: (p: Pricing | null) => void; /** The editor's Pricing tab (the new look): each option's name, price and billing, its other lines behind Edit. */ compact?: boolean }) {
  const [d, setD] = useState(() => toDraft(value));
  // Compact: the option opened for its other lines.
  const [openOpt, setOpenOpt] = useState<string | null>(null);
  const mine = useRef(JSON.stringify(value ?? null));
  // A change from elsewhere (a new version loaded, Claude's edit): start from it.
  useEffect(() => {
    const k = JSON.stringify(value ?? null);
    if (k !== mine.current) (mine.current = k), setD(toDraft(value));
  }, [value]);
  const put = (next: ReturnType<typeof toDraft>) => {
    setD(next);
    const p = fromDraft(next);
    mine.current = JSON.stringify(p);
    onChange(p);
  };
  const setOpt = (i: number, patch: Partial<OptDraft>) => put({ ...d, options: d.options.map((o, k) => (k === i ? { ...o, ...patch } : patch.recommended ? { ...o, recommended: false } : o)) });
  const setAdd = (i: number, patch: Partial<AddDraft>) => put({ ...d, addOns: d.addOns.map((a, k) => (k === i ? { ...a, ...patch } : a)) });
  const n = d.options.length;

  return (
    <section className="pe" aria-labelledby="pe-h" data-section="pricing-editor">
      <div className="pe-head">
        <h2 className="pe-h" id="pe-h">
          Options to pick from
        </h2>
        <p className="pe-s">
          {n
            ? n === 1
              ? "One price, shown with its total. Add a second or third option for them to pick from."
              : `${n} options, side by side. They pick one and any add-ons, see the total, and sign that choice.`
            : "One price, in your own words in the investment section. Or give them up to 3 options to pick from, with add-ons."}
        </p>
      </div>
      {d.options.map((o, i) => (
        <fieldset key={o.id} className="pe-card" disabled={readOnly}>
          <legend className="pe-legend">Option {i + 1}</legend>
          <div className="pe-row">
            <label className="pe-f pe-grow">
              <span>Name</span>
              <input className="input" value={o.name} maxLength={PRICING_LIMITS.name} placeholder="e.g. Assessment + Fractional CRO" onChange={(e) => setOpt(i, { name: e.target.value })} />
            </label>
            <label className="pe-f pe-price">
              <span>Price, $</span>
              <input className="input" inputMode="numeric" value={o.price} placeholder="e.g. 15000" onChange={(e) => setOpt(i, { price: e.target.value.replace(/[^\d,]/g, "") })} />
            </label>
            <label className="pe-f pe-bill">
              <span>Billed</span>
              <select className="input" value={o.billing} onChange={(e) => setOpt(i, { billing: e.target.value as Billing })}>
                <option value="month">a month</option>
                <option value="once">once</option>
              </select>
            </label>
          </div>
          {compact && (
            <div className="pe-row pe-foot">
              {n > 1 && (
                <label className="pe-check">
                  <input type="radio" name="pe-rec" checked={o.recommended} onChange={() => setOpt(i, { recommended: true })} />
                  <span>Recommend this one</span>
                </label>
              )}
              <button type="button" className="tp-flink" aria-expanded={openOpt === o.id} onClick={() => setOpenOpt(openOpt === o.id ? null : o.id)}>
                {openOpt === o.id ? "Less" : `${o.included.split("\n").filter((t) => t.trim()).length} ${o.included.split("\n").filter((t) => t.trim()).length === 1 ? "line" : "lines"} included · Edit`}
              </button>
            </div>
          )}
          {(!compact || openOpt === o.id) && (
          <>
          <label className="pe-f">
            <span>A line under the price (optional)</span>
            <input className="input" value={o.note} maxLength={PRICING_LIMITS.note} placeholder="e.g. Months 1 to 3, then $11,000 a month" onChange={(e) => setOpt(i, { note: e.target.value })} />
          </label>
          <label className="pe-f">
            <span>What it is, in a sentence (optional)</span>
            <input className="input" value={o.about} maxLength={PRICING_LIMITS.about} onChange={(e) => setOpt(i, { about: e.target.value })} />
          </label>
          <label className="pe-f">
            <span>What&#39;s included, one a line</span>
            <textarea className="input pe-area" rows={3} value={o.included} onChange={(e) => setOpt(i, { included: e.target.value })} />
          </label>
          <div className="pe-row pe-foot">
            {n > 1 && !compact && (
              <label className="pe-check">
                <input type="radio" name="pe-rec" checked={o.recommended} onChange={() => setOpt(i, { recommended: true })} />
                <span>Recommend this one</span>
              </label>
            )}
            <button type="button" className="btn btn-sm" onClick={() => put({ ...d, options: d.options.filter((_, k) => k !== i), addOns: n === 1 ? [] : d.addOns })}>
              {compact ? "Remove this option" : "Remove"}
            </button>
          </div>
          </>
          )}
        </fieldset>
      ))}
      {d.addOns.map((a, i) => (
        <fieldset key={a.id} className="pe-card pe-add" disabled={readOnly}>
          <legend className="pe-legend">Add-on {i + 1}</legend>
          <div className="pe-row">
            <label className="pe-f pe-grow">
              <span>Name</span>
              <input className="input" value={a.name} maxLength={PRICING_LIMITS.name} placeholder="e.g. Sales hiring support" onChange={(e) => setAdd(i, { name: e.target.value })} />
            </label>
            <label className="pe-f pe-price">
              <span>Price, $</span>
              <input className="input" inputMode="numeric" value={a.price} placeholder="e.g. 3000" onChange={(e) => setAdd(i, { price: e.target.value.replace(/[^\d,]/g, "") })} />
            </label>
            <label className="pe-f pe-bill">
              <span>Billed</span>
              <select className="input" value={a.billing} onChange={(e) => setAdd(i, { billing: e.target.value as Billing })}>
                <option value="month">a month</option>
                <option value="once">once</option>
              </select>
            </label>
          </div>
          <label className="pe-f">
            <span>What it is (optional)</span>
            <input className="input" value={a.about} maxLength={PRICING_LIMITS.about} onChange={(e) => setAdd(i, { about: e.target.value })} />
          </label>
          <div className="pe-row pe-foot">
            <span className="pe-s">{num(a.price) ? priced(num(a.price), a.billing) : "No price yet"}</span>
            <button type="button" className="btn btn-sm" onClick={() => put({ ...d, addOns: d.addOns.filter((_, k) => k !== i) })}>
              Remove
            </button>
          </div>
        </fieldset>
      ))}
      {!readOnly && (
        <div className="pe-row">
          {compact && <span className="pe-s">{n} of {PRICING_LIMITS.options} options · {d.addOns.length} of {PRICING_LIMITS.addOns} add-ons</span>}
          {n < PRICING_LIMITS.options && (
            <button type="button" className="btn btn-sm" onClick={() => put({ ...d, options: [...d.options, { id: rid("o"), name: "", price: "", billing: "month", note: "", about: "", included: "", recommended: false }] })}>
              Add an option
            </button>
          )}
          {n > 0 && d.addOns.length < PRICING_LIMITS.addOns && (
            <button type="button" className="btn btn-sm" onClick={() => put({ ...d, addOns: [...d.addOns, { id: rid("a"), name: "", price: "", billing: "month", about: "" }] })}>
              Add an add-on
            </button>
          )}
        </div>
      )}
    </section>
  );
}
