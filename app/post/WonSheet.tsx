"use client";

/**
 * After Merlin sees a deal won (a signed proposal, or the member's own seat added there): the
 * terms, if the member wants to give them (rate hourly or monthly, hours a week, start month,
 * expected length, and "Did this come through Merlin?", checked for a deal that began with a move,
 * a Crystal Ball company or an intro), then "Add it as your seat": the usual add-seat form, filled
 * in from the terms, which earns credits by its own rules. The seat it becomes is confirmed by the
 * win. All of it is optional and the member's alone; the admin sees sums and counts only.
 */
import { useState } from "react";
import type { PipelineRec } from "@/lib/pipeline";
import { monthWords, monthlyValue, wonSeatFields } from "@/lib/pipeline";
import { useToast } from "../ui/shared";
import { Sheet, useUi } from "./ui";
import { pipelineAct } from "./pipelineStore";
import { ClientPicks } from "./ClientPicks";
import "./pipeline.css";

export function WonSheet({ rec, onClose }: { rec: PipelineRec; onClose: () => void }) {
  const ui = useUi();
  const toast = useToast();
  const w = rec.won;
  const [pricing, setPricing] = useState<"monthly" | "hourly">(w?.pricing ?? "monthly");
  const [rate, setRate] = useState(w ? String(w.rate) : "");
  const [hours, setHours] = useState(w?.hours ? String(w.hours) : "");
  const [start, setStart] = useState(w?.start ?? new Date().toISOString().slice(0, 7));
  const [months, setMonths] = useState(w?.months ? String(w.months) : "");
  const [merlin, setMerlin] = useState(w ? w.merlin : rec.merlinDefault);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(!!w);
  const num = (v: string) => Number(v.replace(/[$,\s]/g, ""));
  const value = rate ? monthlyValue({ pricing, rate: num(rate) || 0, hours: hours ? num(hours) : null }) : 0;
  const save = async () => {
    if (busy) return false;
    setBusy(true);
    setErr(null);
    const r = await pipelineAct({ type: "pipeline.won", id: rec.id, pricing, rate, hours: hours || null, start: start || null, months: months || null, merlin });
    setBusy(false);
    if (!r.ok) return setErr(r.message), false;
    setSaved(true);
    toast(r.message);
    return true;
  };
  const addSeat = async () => {
    if (rate && !(await save())) return;
    const fields = wonSeatFields({ pricing, rate: num(rate) || 0, hours: hours ? num(hours) : null, start: start || null }, ui.me.function ?? null, Date.now());
    if (!rate) (delete fields.rate, delete fields.pricing);
    onClose();
    ui.openAdd({ companyId: rec.company, mine: true, seat: fields, won: rec.id });
  };
  return (
    <Sheet
      title={`You won ${rec.name ?? "it"}`}
      onClose={onClose}
      dialog
      className="pl-won-sheet"
      footer={
        <div className="pl-won-foot">
          {!rec.seat && (
            <button type="button" className="btn btn-volt" disabled={busy} onClick={() => void addSeat()}>
              Add it as your seat
            </button>
          )}
          <button type="button" className={`btn${rec.seat ? " btn-volt" : ""}`} disabled={busy || !rate} aria-busy={busy} onClick={() => void save().then((ok) => ok && rec.seat && onClose())}>
            {saved ? "Save the terms" : "Save the terms only"}
          </button>
        </div>
      }
    >
      <div className="pl-won">
        <p className="pl-won-lead">{rec.how ? `${rec.how}.` : "Merlin saw it won."} The terms are yours alone. They count, without your name, in how members do on Merlin.</p>
        <fieldset className="pl-won-row">
          <legend className="mn-k">Rate</legend>
          <div className="pl-seg" role="radiogroup" aria-label="Rate">
            {(["monthly", "hourly"] as const).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={pricing === p} className={`chip${pricing === p ? " chip-on" : ""}`} onClick={() => setPricing(p)}>
                {p === "monthly" ? "Monthly" : "Hourly"}
              </button>
            ))}
          </div>
          <label className="pl-won-f">
            <span>{pricing === "monthly" ? "Dollars a month" : "Dollars an hour"}</span>
            <input className="input" inputMode="decimal" value={rate} placeholder={pricing === "monthly" ? "9000" : "175"} onChange={(e) => setRate(e.target.value)} />
          </label>
        </fieldset>
        <div className="pl-won-grid">
          <label className="pl-won-f">
            <span>Hours a week</span>
            <input className="input" inputMode="numeric" value={hours} placeholder="15" onChange={(e) => setHours(e.target.value)} />
          </label>
          <label className="pl-won-f">
            <span>Start month</span>
            <input className="input" type="month" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="pl-won-f">
            <span>Expected length, months</span>
            <input className="input" inputMode="numeric" value={months} placeholder="6" onChange={(e) => setMonths(e.target.value)} />
          </label>
        </div>
        <label className="pl-won-check">
          <input type="checkbox" checked={merlin} onChange={(e) => setMerlin(e.target.checked)} />
          <span>Did this come through Merlin?</span>
        </label>
        {rec.intro && <p className="pl-won-intro">Through {rec.intro.by}&apos;s intro.</p>}
        {rec.lead && <p className="pl-won-intro">Referred to you by {rec.lead.by}. It counts as their win too.</p>}
        {rec.team && <p className="pl-won-intro">Won with {rec.team.with}, your teammate here.</p>}
        {value > 0 && <p className="pl-won-v num">About {monthWords(value)}{months ? `, ${monthWords(value * num(months)).replace(" a month", "")} in all` : ""}.</p>}
        {err && (
          <p className="mn-warn" role="alert">
            {err}
          </p>
        )}
        <ClientPicks companyId={rec.company} name={rec.name ?? null} />
        {rec.seat && <p className="pl-won-seat">Your seat here is confirmed by this win.</p>}
      </div>
    </Sheet>
  );
}
