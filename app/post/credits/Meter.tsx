"use client";

/**
 * The credits meter (Me.meter, lib/creditsMeter.ts), the way Claude shows usage: a thin bar and
 * "N% of your credits left" with the count. Shown on Agent access, Credits and usage's Overview and
 * the header's credits popover. Low (20% or less left, or none): a pine Top up or Upgrade button,
 * never volt (volt is for earning). Nothing here asks a member to use less.
 */
import { useState } from "react";
import type { Me } from "@/lib/tableTypes";
import { leftWords, type CreditsMeter } from "@/lib/creditsMeter";
import { buyTopup, openPlans, type PlansFrom } from "../Billing";
import "./meter.css";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The meter's small line: "38 credits · 25 spent since Nov 5" and, on a plan that renews, "Next 100 on Dec 5". */
export function meterSub(m: CreditsMeter, proCredits?: number): string {
  const n = `${m.balance} credit${m.balance === 1 ? "" : "s"}`;
  const spent = m.spent ? ` · ${m.spent} spent since ${day(m.since)}` : ` · nothing spent since ${day(m.since)}`;
  const next = m.nextGrantAt && proCredits ? ` · next ${proCredits} on ${day(m.nextGrantAt)}` : "";
  return `${n}${spent}${next}`;
}

/** The low moment in words: how to keep going on this plan. Never a word asking them to use less. */
export function lowWords(me: Me, m: CreditsMeter): { head: string; rest: string } {
  const head = m.balance <= 0 ? "You've used this month's credits." : "Running low.";
  const plan = me.plan;
  if (!plan) return { head, rest: "Add what you know and each fact earns a credit." };
  if (plan.name === "pro") return { head, rest: plan.topup ? "Top up and keep going." : "See your plan for more." };
  return { head, rest: `${plan.topup ? "Top up and keep going, or upgrade" : "Upgrade"} for ${plan.prices.proCredits} credits a month.` };
}

/** The title text for the header pill: "62% of your credits left this month". */
export const meterTip = (m: CreditsMeter, plan?: Me["plan"]) => `${leftWords(m)} this month.${m.low && plan ? (plan.name === "pro" ? " Top up any time." : " Top up or upgrade any time.") : ""}`;

/** The low moment's buttons: Top up (when it is set up) and Upgrade off Pro, both pine. Billing off: Ways to earn. */
export function MeterBuy({ me, from, onEarn, small = true }: { me: Me; from: PlansFrom; onEarn?: () => void; small?: boolean }) {
  const plan = me.plan;
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const sm = small ? " btn-sm" : "";
  if (!plan)
    return onEarn ? (
      <span className="cm-buy">
        <button type="button" className={`btn${sm}`} onClick={onEarn}>
          Ways to earn more
        </button>
      </span>
    ) : null;
  const up = plan.name !== "pro";
  return (
    <span className="cm-buy" role="group" aria-label="Get more credits">
      {plan.topup && (
        <button
          type="button"
          className={`btn${sm} btn-pine`}
          disabled={busy}
          aria-busy={busy}
          onClick={() => {
            setBusy(true);
            void buyTopup().then((m) => (setBusy(false), setSaid(m)));
          }}
        >
          {busy ? "Opening checkout" : `Top up ${plan.prices.topupCredits} credits for $${plan.prices.topup}`}
        </button>
      )}
      {(up || !plan.topup) && (
        <button type="button" className={`btn${sm}${plan.topup ? "" : " btn-pine"}`} onClick={() => openPlans(from)}>
          {up ? `Upgrade for ${plan.prices.proCredits} a month` : "See your plan"}
        </button>
      )}
      {said && (
        <span className="cm-said" role="status">
          {said}
        </span>
      )}
    </span>
  );
}

/**
 * The meter. `variant`: "card" (a page's band, with its own words), "pop" (the credits popover).
 * `lead`: the line under the head on a card ("Your agents use the same credits you do.").
 */
export function CreditsMeterBar({ me, variant = "card", lead, from = "credits", onEarn, children }: { me: Me; variant?: "card" | "pop"; lead?: string; from?: PlansFrom; onEarn?: () => void; children?: React.ReactNode }) {
  const m = me.meter;
  if (!m) return null;
  const low = m.low;
  return (
    <div className={`cm cm-${variant}${low ? " cm-low" : ""}`} data-left={m.leftPct}>
      <div className="cm-head">
        <strong className="cm-pct">
          <span className="num">{m.leftPct}%</span> of your credits left
        </strong>
        <span className="cm-sub num">{meterSub(m, me.plan?.prices.proCredits)}</span>
      </div>
      <span className="cm-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={m.leftPct} aria-label={`${leftWords(m)}: ${m.balance} credits`}>
        <span style={{ width: `${m.leftPct}%` }} />
      </span>
      {lead && <p className="cm-lead">{lead}</p>}
      {low && (
        <p className="cm-lead cm-low-t">
          <strong>{lowWords(me, m).head}</strong> {lowWords(me, m).rest}
        </p>
      )}
      {low && <MeterBuy me={me} from={from} onEarn={onEarn} />}
      {children}
    </div>
  );
}
