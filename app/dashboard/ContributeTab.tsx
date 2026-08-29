"use client";

import { useState } from "react";
import type { State, ClientRow } from "./state";
import { post, fmtMoney } from "./state";
import { PulseAsk } from "./TodayTab";

const STAGES: [string, string][] = [
  ["pre_seed", "Pre-seed"],
  ["seed", "Seed"],
  ["series_a", "Series A"],
  ["series_b", "Series B"],
  ["series_c_plus", "Series C+"],
];
const INDUSTRIES: [string, string][] = [
  ["b2b_saas", "B2B SaaS"],
  ["fintech", "Fintech"],
  ["healthtech", "Healthtech"],
  ["devtools", "DevTools"],
  ["cybersecurity", "Cybersecurity"],
  ["ai_ml", "AI/ML"],
  ["ecommerce", "E-commerce"],
  ["services", "Services"],
];
const SCOPES: [string, string][] = [
  ["full_gtm", "Full GTM"],
  ["sales_leadership", "Sales leadership"],
  ["marketing_leadership", "Marketing leadership"],
  ["pipeline_gen", "Pipeline generation"],
  ["revops_systems", "RevOps & systems"],
  ["pricing_packaging", "Pricing & packaging"],
  ["hiring_enablement", "Hiring & enablement"],
];
const SOURCES: [string, string][] = [
  ["referral", "Referral"],
  ["inbound", "Inbound"],
  ["outbound", "Outbound"],
  ["community", "Community"],
  ["past_client", "Past client"],
  ["rn", "Revenue Nomad"],
];
const PRICING: [string, string][] = [
  ["monthly_retainer", "Monthly retainer"],
  ["day_rate", "Day rate"],
  ["hourly", "Hourly"],
  ["project", "Project"],
  ["retainer_plus_equity", "Retainer + equity"],
];
const BANDS: [string, string][] = [
  ["under_3k", "<$3k"],
  ["3k_6k", "$3–6k"],
  ["6k_10k", "$6–10k"],
  ["10k_15k", "$10–15k"],
  ["15k_plus", "$15k+"],
];

function Sel({ label, value, set, options }: { label: string; value: string; set: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => set(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}

function Num({ label, value, set, placeholder }: { label: string; value: string; set: (v: string) => void; placeholder?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="number" value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} min={0} />
    </div>
  );
}

/** The per-client census + every other contribution flow. */
export default function ContributeTab({ s, notify }: { s: State; notify: (m: string) => void }) {
  const c = s.contribute;
  const pending = c.clients.filter((x) => x.rnPlaced && !x.confirmed);
  const entered = c.clients.filter((x) => x.confirmed);

  return (
    <div>
      {pending.length > 0 && (
        <div className="card" style={{ borderColor: "var(--green-pale-border)", background: "var(--green-pale)" }}>
          <div className="card-title">
            <h2>Your RN engagements are pre-filled</h2>
            <span className="meta">from Bill.com records</span>
          </div>
          <p className="card-sub">
            We already carry our side of the data. Confirm each one in one tap — +{c.earn.confirmPrefill} credits,
            instantly verified.
          </p>
          {pending.map((row) => (
            <PrefillRow key={row.id} row={row} credits={c.earn.confirmPrefill} notify={notify} />
          ))}
        </div>
      )}

      {!s.weekly.pulse.answered && (
        <div className="card">
          <div className="card-title">
            <h2>Weekly pipeline pulse</h2>
            <span className="earn-tag">+{s.weekly.pulse.credits}</span>
          </div>
          <PulseAsk notify={notify} />
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <h2>Your engagement census</h2>
          <span className="meta">{entered.length} entered · refreshes quarterly</span>
        </div>
        {entered.length === 0 && <p className="muted">No engagements entered yet.</p>}
        {entered.map((row) => (
          <ClientLine key={row.id} row={row} earn={c.earn} notify={notify} />
        ))}
        <AddClientForm s={s} notify={notify} />
      </div>

      <div className="grid2 section-gap">
        <DealForm s={s} notify={notify} />
        <SignalForm s={s} notify={notify} />
      </div>
      <div className="grid2 section-gap">
        <CapacityForm s={s} notify={notify} />
        <ToolForm s={s} notify={notify} />
      </div>
    </div>
  );
}

/* ---------- pre-fill confirmation (the one-tap moment) ---------- */

function PrefillRow({ row, credits, notify }: { row: ClientRow; credits: number; notify: (m: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(row.prefill?.actualMonthly ?? ""));
  const p = row.prefill!;

  async function confirm(adjusted: boolean) {
    const res = await post(`/api/engagements/${row.id}`, {
      action: "confirm",
      actuals: adjusted ? { actualMonthly: parseFloat(amount) || p.actualMonthly } : {},
    });
    notify(
      res.ok
        ? `Confirmed. +${res.awarded} credits${res.verified ? " — verified against Bill.com" : " — reverifies at next reconciliation"}.`
        : (res.error as string) ?? "Couldn't confirm"
    );
  }

  return (
    <div className="wizard-row" style={{ background: "#fff" }}>
      <div className="info">
        <b>{row.clientName}</b> <span className="chip" style={{ fontSize: 10, padding: "1px 7px" }}>RN-placed</span>
        <div className="sub">
          {fmtMoney(p.actualMonthly)}/mo · {p.hoursPerMonth}h/mo · billed via Bill.com
        </div>
      </div>
      {editing ? (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <Num label="Actual $/mo" value={amount} set={setAmount} />
          <button className="btn btn-sm" onClick={() => confirm(true)}>Save & confirm</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="earn-tag">+{credits}</span>
          <button className="btn btn-sm" onClick={() => confirm(false)}>Looks right — confirm</button>
          <button className="btn-ghost btn-sm" onClick={() => setEditing(true)}>Adjust</button>
        </div>
      )}
    </div>
  );
}

/* ---------- entered client line: refresh + debrief ---------- */

function ClientLine({ row, earn, notify }: { row: ClientRow; earn: Record<string, number>; notify: (m: string) => void }) {
  const [debriefing, setDebriefing] = useState(false);
  const [outcome, setOutcome] = useState("renewed");
  const [reason, setReason] = useState("");

  async function refresh() {
    const res = await post(`/api/engagements/${row.id}`, { action: "refresh", actuals: {} });
    notify(res.ok ? `Refreshed. +${res.awarded} credits.` : (res.error as string) ?? "Couldn't refresh");
  }

  async function debrief() {
    const res = await post(`/api/engagements/${row.id}`, { action: "debrief", outcome, reason });
    notify(res.ok ? `Debrief logged. +${res.awarded} credits.` : (res.error as string) ?? "Couldn't save");
    setDebriefing(false);
  }

  return (
    <div className="wizard-row">
      <div className="info">
        <b>{row.clientName}</b>{" "}
        {row.verified && <span className="badge-verified">✓ verified</span>}
        {row.moderation === "held" && <span className="chip amber" style={{ fontSize: 10, padding: "1px 7px" }}>in moderation</span>}
        <div className="sub">
          {row.actuals ? `${fmtMoney(row.actuals.actualMonthly)}/mo · ${row.actuals.hoursPerMonth}h/mo` : ""} ·{" "}
          {row.status === "active" ? "active" : row.status}
          {row.debriefed ? " · debriefed" : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {row.refreshDue && (
          <button className="btn btn-sm" onClick={refresh}>
            Quarterly refresh — still accurate (+{earn.quarterlyRefresh})
          </button>
        )}
        {row.status === "active" && !row.debriefed && (
          <button className="btn-ghost btn-sm" onClick={() => setDebriefing(!debriefing)}>
            It ended / renewed? (+{earn.debrief})
          </button>
        )}
      </div>
      {debriefing && (
        <div style={{ width: "100%", display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Sel
            label="What happened"
            value={outcome}
            set={setOutcome}
            options={[
              ["renewed", "Renewed"],
              ["expanded", "Expanded"],
              ["completed", "Completed as planned"],
              ["churned", "Churned"],
            ]}
          />
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label>Why (one line, +{earn.debriefBonus} bonus)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional but valuable" />
          </div>
          <button className="btn btn-sm" onClick={debrief}>Save debrief</button>
        </div>
      )}
    </div>
  );
}

/* ---------- add client (active or past) ---------- */

function AddClientForm({ s, notify }: { s: State; notify: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [past, setPast] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [hours, setHours] = useState("");
  const [stage, setStage] = useState("series_a");
  const [industry, setIndustry] = useState("b2b_saas");
  const [scope, setScope] = useState("full_gtm");
  const [source, setSource] = useState("referral");
  const [pricing, setPricing] = useState("monthly_retainer");
  const [endedOutcome, setEndedOutcome] = useState("completed");
  const [endedReason, setEndedReason] = useState("");
  const c = s.contribute;
  const pastFull = c.pastCount >= c.pastCap;

  const list = s.operator!.listMonthlyRate;
  const amt = parseFloat(amount) || 0;
  const vsList = amt && list ? (amt < list * 0.97 ? "below_list" : amt > list * 1.03 ? "above_list" : "at_list") : "at_list";

  async function submit() {
    const res = await post("/api/engagements", {
      clientName: name,
      past,
      endedOutcome: past ? endedOutcome : undefined,
      endedReason: past ? endedReason : undefined,
      actuals: {
        actualMonthly: amt,
        hoursPerMonth: parseFloat(hours) || 0,
        stage,
        industry,
        scopeArea: scope,
        source,
        pricingModel: pricing,
        vsList,
      },
    });
    if (res.ok) {
      notify(
        res.held
          ? "Entered — routed to moderation (amount outside the plausible band); credits held."
          : `Entered. +${res.awarded} credits.`
      );
      setOpen(false);
      setName("");
      setAmount("");
      setHours("");
    } else notify((res.error as string) ?? "Couldn't save");
  }

  if (!open)
    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn-ghost" onClick={() => { setPast(false); setOpen(true); }}>
          + Add an active client (+{c.earn.engagementActuals})
        </button>
        <button className="btn-ghost" onClick={() => { setPast(true); setOpen(true); }} disabled={pastFull}>
          + Past engagement, last 12 mo (+{c.earn.pastEngagement}
          {c.launchBonusActive ? `+${c.earn.pastEngagementLaunchBonus} launch bonus` : ""}) — {c.pastCount}/{c.pastCap}
        </button>
      </div>
    );

  return (
    <div style={{ background: "var(--card-nested)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>
        {past ? "Past engagement (last 12 months)" : "Active client engagement"}
      </p>
      <p className="tiny">
        Your list rate ({fmtMoney(list)}/mo) comes from your RN profile — we never ask for it again. This entry is
        what you actually bill{amt > 0 && ` (${vsList === "at_list" ? "at list" : vsList === "below_list" ? "below list" : "above list"})`}.
      </p>
      <div className="formgrid">
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label>Client (never shown to anyone)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc" />
        </div>
        <Num label="Actual monthly billed ($)" value={amount} set={setAmount} placeholder="8500" />
        <Num label="Hours / month" value={hours} set={setHours} placeholder="40" />
        <Sel label="Stage" value={stage} set={setStage} options={STAGES} />
        <Sel label="Industry" value={industry} set={setIndustry} options={INDUSTRIES} />
        <Sel label="Scope" value={scope} set={setScope} options={SCOPES} />
        <Sel label="How sourced" value={source} set={setSource} options={SOURCES} />
        <Sel label="Pricing model" value={pricing} set={setPricing} options={PRICING} />
        {past && (
          <>
            <Sel
              label="How it ended"
              value={endedOutcome}
              set={setEndedOutcome}
              options={[
                ["completed", "Completed as planned"],
                ["churned", "Churned"],
                ["renewed", "Renewed (then ended)"],
                ["expanded", "Expanded (then ended)"],
              ]}
            />
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label>Why it ended</label>
              <input value={endedReason} onChange={(e) => setEndedReason(e.target.value)} />
            </div>
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-sm" onClick={submit} disabled={!name.trim() || !(amt > 0) || !(parseFloat(hours) > 0)}>
          Save engagement
        </button>
        <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

/* ---------- deal log ---------- */

function DealForm({ s, notify }: { s: State; notify: (m: string) => void }) {
  const c = s.contribute;
  const [outcome, setOutcome] = useState("won");
  const [source, setSource] = useState("referral");
  const [band, setBand] = useState("6k_10k");
  const [stage, setStage] = useState("series_a");
  const [cycle, setCycle] = useState("4");
  const [why, setWhy] = useState("");
  const capped = c.dealsThisWeek >= c.dealsWeeklyCap;

  async function submit() {
    const res = await post("/api/deals", {
      outcome,
      source,
      retainerBand: band,
      stage,
      cycleWeeks: parseFloat(cycle),
      why,
    });
    notify(res.ok ? `Deal logged. +${res.awarded} credits — it's on the tape.` : (res.error as string) ?? "Couldn't log");
    if (res.ok) setWhy("");
  }

  return (
    <div className="card">
      <div className="card-title">
        <h2>Log a deal outcome</h2>
        <span className="earn-tag">+{c.earn.dealLog} (+{c.earn.dealLogWhy} why) · {c.dealsThisWeek}/{c.dealsWeeklyCap} this week</span>
      </div>
      <div className="formgrid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Sel label="Outcome" value={outcome} set={setOutcome} options={[["won", "Won"], ["lost", "Lost"]]} />
        <Sel label="Source" value={source} set={setSource} options={SOURCES} />
        <Sel label="Retainer band" value={band} set={setBand} options={BANDS} />
        <Sel label="Stage" value={stage} set={setStage} options={STAGES} />
        <Num label="Cycle (weeks)" value={cycle} set={setCycle} />
        <div className="field">
          <label>Why, in one line (+{c.earn.dealLogWhy})</label>
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <button className="btn btn-sm" onClick={submit} disabled={capped}>
        {capped ? "Weekly cap reached" : "Log deal"}
      </button>
    </div>
  );
}

/* ---------- buyer signal ---------- */

function SignalForm({ s, notify }: { s: State; notify: (m: string) => void }) {
  const c = s.contribute;
  const [type, setType] = useState("hiring_intent");
  const [timing, setTiming] = useState("this_quarter");
  const [strength, setStrength] = useState("medium");
  const [industry, setIndustry] = useState("b2b_saas");
  const [stage, setStage] = useState("series_a");
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const capped = c.signalsThisMonth >= c.signalsMonthlyCap;

  async function submit() {
    const res = await post("/api/signals", {
      signalType: type,
      timing,
      strength,
      segment: { industry, stage },
      companyName: company || null,
      note,
    });
    notify(
      res.ok
        ? `Signal logged. +${res.awarded} credits — $${c.signalCashBounty} cash if it converts.`
        : (res.error as string) ?? "Couldn't log"
    );
    if (res.ok) {
      setCompany("");
      setNote("");
    }
  }

  return (
    <div className="card">
      <div className="card-title">
        <h2>Log a buyer signal</h2>
        <span className="earn-tag">
          +{c.earn.buyerSignal} (+{c.earn.buyerSignalNamed} named) · {c.signalsThisMonth}/{c.signalsMonthlyCap} this month
        </span>
      </div>
      <p className="card-sub">Someone might buy fractional GTM help. ${c.signalCashBounty} cash bounty if RN converts it.</p>
      <div className="formgrid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Sel
          label="Signal"
          value={type}
          set={setType}
          options={[
            ["hiring_intent", "Hiring intent"],
            ["budget_opened", "Budget opened"],
            ["exec_departure", "GTM exec departure"],
            ["asked_for_intro", "Asked me for an intro"],
            ["expansion", "Expansion"],
            ["other", "Other"],
          ]}
        />
        <Sel label="Timing" value={timing} set={setTiming} options={[["now", "Buying now"], ["this_quarter", "This quarter"], ["exploring", "Exploring"]]} />
        <Sel label="Strength" value={strength} set={setStrength} options={[["strong", "Strong"], ["medium", "Medium"], ["weak", "Weak"]]} />
        <Sel label="Industry" value={industry} set={setIndustry} options={INDUSTRIES} />
        <Sel label="Stage" value={stage} set={setStage} options={STAGES} />
        <div className="field">
          <label>Company (admin-only, +{c.earn.buyerSignalNamed})</label>
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Optional" />
        </div>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label>What you heard</label>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-sm" onClick={submit} disabled={capped || !note.trim()}>
        {capped ? "Monthly cap reached" : "Log signal"}
      </button>
    </div>
  );
}

/* ---------- monthly capacity ---------- */

function CapacityForm({ s, notify }: { s: State; notify: (m: string) => void }) {
  const [hours, setHours] = useState("");
  const [taking, setTaking] = useState("yes");
  const [capacity, setCapacity] = useState(String(s.operator!.statedCapacityHours ?? ""));
  const answered = s.contribute.capacityAnswered;

  async function submit() {
    const res = await post("/api/capacity", {
      hoursFree: parseFloat(hours) || 0,
      takingClients: taking === "yes",
      statedCapacityHours: parseFloat(capacity) || undefined,
    });
    notify(res.ok ? `Capacity updated. +${res.awarded} credits.` : (res.error as string) ?? "Couldn't save");
  }

  return (
    <div className="card">
      <div className="card-title">
        <h2>Monthly capacity pulse</h2>
        <span className="earn-tag">+{s.contribute.earn.capacityPulse}/month</span>
      </div>
      {answered ? (
        <p className="muted">Done for this month. Feeds utilization and keeps your matching profile fresh.</p>
      ) : (
        <>
          <div className="formgrid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <Num label="Hours free / month" value={hours} set={setHours} placeholder="20" />
            <Sel label="Taking clients?" value={taking} set={setTaking} options={[["yes", "Yes"], ["no", "No"]]} />
            <Num label="Total capacity (h/mo)" value={capacity} set={setCapacity} placeholder="100" />
          </div>
          <button className="btn btn-sm" onClick={submit} disabled={hours === ""}>Save</button>
        </>
      )}
    </div>
  );
}

/* ---------- tool review ---------- */

function ToolForm({ s, notify }: { s: State; notify: (m: string) => void }) {
  const c = s.contribute;
  const [tool, setTool] = useState("");
  const [rating, setRating] = useState("4");
  const [spendAmt, setSpendAmt] = useState("");
  const capped = c.toolReviewCount >= c.toolReviewCap;

  async function submit() {
    const res = await post("/api/tools", {
      tool,
      rating: parseFloat(rating),
      monthlySpend: parseFloat(spendAmt) || undefined,
    });
    notify(res.ok ? `Review saved. +${res.awarded} credits.` : (res.error as string) ?? "Couldn't save");
    if (res.ok) setTool("");
  }

  return (
    <div className="card">
      <div className="card-title">
        <h2>GTM tool review</h2>
        <span className="earn-tag">
          +{c.earn.toolReview} (+{c.earn.toolReviewSpend} w/ spend) · {c.toolReviewCount}/{c.toolReviewCap}
        </span>
      </div>
      <div className="formgrid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div className="field">
          <label>Tool</label>
          <input value={tool} onChange={(e) => setTool(e.target.value)} placeholder="Clay, Apollo…" />
        </div>
        <Sel label="Rating" value={rating} set={setRating} options={[["5", "5 — essential"], ["4", "4"], ["3", "3"], ["2", "2"], ["1", "1 — dropped it"]]} />
        <Num label="Monthly spend ($)" value={spendAmt} set={setSpendAmt} placeholder="Optional" />
      </div>
      <button className="btn btn-sm" onClick={submit} disabled={capped || !tool.trim()}>
        {capped ? "Cap reached" : "Save review"}
      </button>
    </div>
  );
}
