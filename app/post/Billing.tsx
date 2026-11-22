"use client";

/**
 * Plans, only while billing is live (Me.plan is set; lib/billing). With billing off none of this
 * renders and the app is as it was.
 *
 *   BillingPage   Plan and billing (the account menu, Settings): the plan, trial days left, renew,
 *                 cancel, pause, the top-up, and invoices and the card in Stripe's portal.
 *   PlansHost     the plans sheet, opened with openPlans(from): the top bar's Upgrade, the account
 *                 menu, the trial, a second saved view, the full benchmarks, Slack and Claude limits,
 *                 out of credits. Free against Pro in plain words, yearly first.
 *   PlanPill      the top bar's way in: "Pro trial · 12 days left" with Upgrade, or Upgrade to Pro.
 *   TrialBanner   the trial's last 3 days, over the table.
 *   UpgradeNote   one calm line where Free stops (with a lock), or, in the trial, where Pro is in use.
 *   ProTag, ProLock, ProRow   a Pro feature marked where it sits: on Free locked, with a lock and
 *                 "Pro" that opens the plans; in the trial "Pro · in your trial"; nothing on Pro.
 *
 * Prices and the plans show on every plan, the trial included: Pro can be bought any day of it, and
 * with more than 48 hours left nothing is charged until it ends (PlanView.firstChargeAt).
 * A member who said they aren't looking for a client hears the soft form: Free is a fine answer.
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Me, PlanView, View } from "@/lib/tableTypes";
import { IconCheck, IconChevron, IconLock, IconX, useToast } from "../ui/shared";
import { Sheet, useUi } from "./ui";
import { sendSignal } from "./ProOffer";
import { FEATURE_NAME } from "@/lib/radar/types";
import { PLANS, PLAN_ROWS } from "@/lib/billing/compare";
import { AI_PACK_LINE, CLOSE_AI_LINE, PRICES, PRO_STORY } from "@/lib/billing/rules";
import { EARN_ONE, PRO_COMPANIES_FREE, topupWords, useMarkTrialShowing, useTrialShowing } from "./nudges";
import "./billing.css";
import { NomadArt, Prop, Scene } from "../ui/fractions/lazy";

/** Where the plans were opened from: an upgrade moment. */
export type PlansFrom = "trial" | "views" | "bench" | "credits" | "slack" | "claude" | "radar" | "crystal" | "proposals" | "billing";
type Ask = { from: PlansFrom; caught?: number };

let asked: Ask | null = null;
const subs = new Set<() => void>();
const setAsk = (a: Ask | null) => {
  asked = a;
  subs.forEach((f) => f());
};
/** Open the plans sheet. `caught`: a second saved view's new roles in the last 30 days. */
export function openPlans(from: PlansFrom, extra: { caught?: number } = {}) {
  setAsk({ from, ...extra });
  sendSignal("pro_view", `plans_${from}`);
}

const CODE_KEY = "tp_code";
/** A code that came in the address (?code=RN-SURVEY10), kept in this browser (Root keeps it from the landing page on) so checkout can apply it. */
function codeNow(): string {
  try {
    const q = new URLSearchParams(window.location.search).get("code");
    if (q) localStorage.setItem(CODE_KEY, q.slice(0, 40));
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** "November 18", with the year when it isn't this one. */
const day = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) });
};
/** The same day words, for the Pro tags' lines elsewhere ("December 3"). */
export const planDay = day;
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** POST /api/billing. A Stripe address opens in this tab; anything else comes back as words. */
async function billing(op: string, extra: Record<string, unknown> = {}): Promise<{ url?: string; message?: string; error?: string }> {
  try {
    const r = await fetch("/api/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...extra }) });
    return (await r.json().catch(() => ({ error: "That didn't go through. Try again in a moment." }))) as { url?: string; message?: string; error?: string };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}
function useBilling() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (op: string, extra: Record<string, unknown> = {}, after?: () => Promise<void> | void) => {
    setBusy(op + String(extra.interval ?? ""));
    const r = await billing(op, extra);
    if (r.url) {
      window.location.assign(r.url);
      return;
    }
    setBusy(null);
    if (r.error) toast(r.error, true);
    else {
      if (r.message) toast(r.message);
      await after?.();
    }
  };
  return { busy, run };
}

/* ---------- Free against Pro ---------- */

/** Free, Pro and Pro + Close, row by row (lib/billing/compare.ts, shared with the landing page's pricing). */
export const ROWS = PLAN_ROWS;

export function CompareTable({ current }: { current?: "free" | "pro" | "close" }) {
  return (
    <table className="bl-compare bl-compare-3">
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">What you get</span>
          </th>
          {PLANS.map((p) => (
            <th key={p.key} scope="col" className={current === p.key ? "on" : ""}>
              {p.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROWS.map(([what, free, pro, close]) => (
          <tr key={what}>
            <th scope="row">{what}</th>
            <td data-cap="Free">{free}</td>
            <td data-cap="Pro" className="bl-pro">
              {pro}
            </td>
            <td data-cap="Pro + Close" className="bl-pro bl-close">
              {close}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------- the Pro welcome on Home ---------- */

/**
 * Once, on Home, right after the plan became Pro (PlanView.proWelcome): The keep (Fractions, the
 * quiet register on white, the only violet in the app), "You're on Pro. Everything here is yours."
 * and what opened up, in the plans' own words. "Got it" puts it away for good (the noticeSeen
 * action, kept with the plan's notices like the trial-ended card). The plans sheet keeps its own.
 */
export function ProWelcome({ plan, onSeen }: { plan: PlanView; onSeen: () => void }) {
  // What their tier adds over Free, from the comparison's own rows (the ones that differ). Close: its own column.
  const close = plan.tier === "close";
  const opened = ROWS.map(([what, free, pro, cl]) => [what, free, close ? cl : pro] as const).filter(([, free, got]) => free !== got);
  return (
    <section className="bl-hello" aria-labelledby="bl-hello-h">
      <Scene kind="castle" pro on="white" className="bl-hello-art" />
      <div className="bl-hello-t">
        <p className="bl-hello-h" id="bl-hello-h">
          {plan.proStartsAt
            ? `You're on ${close ? "Pro + Close" : "Pro"}. It starts with its first charge on ${day(plan.proStartsAt)}, when your trial ends.`
            : `You're on ${close ? "Pro + Close" : "Pro"}. Everything here is yours.`}
        </p>
        {/* Pro sold as winning clients, in the plans' own words. */}
        <p className="bl-hello-story">{PRO_STORY}</p>
        <ul className="bl-hello-list">
          {opened.map(([what, , pro]) => (
            <li key={what}>
              <b>{what}.</b> {pro}
            </li>
          ))}
        </ul>
        <div className="bl-hello-acts">
          <button type="button" className="btn btn-pine" onClick={onSeen}>
            Got it
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------- the plans sheet ---------- */

const TITLE: Record<PlansFrom, string> = {
  trial: "Keep Pro",
  views: "Watch a second market",
  bench: "See the full benchmarks",
  credits: "More credits",
  slack: "Every alert in Slack",
  claude: "Claude without the daily cap",
  radar: `${FEATURE_NAME} as it happens`,
  crystal: `Every ${FEATURE_NAME} company open`,
  proposals: "Send it and get it signed",
  billing: "Merlin Pro",
};
export const VALUE_LINE = PRO_STORY;

function leadFor(plan: PlanView, a: Ask): string {
  if (plan.name === "trial") {
    const when = plan.trialDaysLeft === 1 ? "tomorrow" : `on ${day(plan.trialEndsAt)}`;
    if (plan.notLooking) return `Your Pro trial ends ${when}. Nothing to do: you stay on Free, with no charge. Pro is here for when you want it, and it pauses any month your book is full.`;
    if (a.from === "trial" || a.from === "billing") return `All of Pro is yours until your trial ends ${when}. Keep it now and it carries straight on after, with nothing to do that day.`;
    if (a.from === "credits") return `Pro adds ${plan.prices.proCredits} credits each paid month, on top of what you earn. They start with your first paid month.`;
    return `${leadFor({ ...plan, name: "free", notLooking: false }, a)} It's yours in the trial until ${day(plan.trialEndsAt)}.`;
  }
  if (plan.notLooking) return "Not looking for a client right now? Free is a fine plan. Pro is here for when you are, and it pauses any month your book is full.";
  if (a.from === "views")
    return a.caught
      ? `A second view here would have caught ${a.caught} new ${a.caught === 1 ? "role" : "roles"} in the last 30 days. Free keeps one view; Pro keeps one for every market you work, with alerts as roles open.`
      : "Free keeps one saved view. Pro keeps one for every market you work, with alerts as roles open.";
  if (a.from === "bench") return "Free shows the median for each function. Pro shows the range, by function and by client size.";
  if (a.from === "credits") return `Buy ${plan.prices.topupCredits} credits once, or get Pro: ${plan.prices.proCredits} credits each paid month, on top of what you earn.`;
  if (a.from === "slack") return "Free posts the weekly roles to Slack. Pro posts every alert: messages, your seats, and new roles as they open.";
  if (a.from === "claude") return "Free gives Claude 20 requests a day. Pro has no daily cap.";
  if (a.from === "radar") return `Everyone gets every ${FEATURE_NAME} signal each morning, and Free opens one of its companies a day, fully. Pro opens every company in your ${FEATURE_NAME} free, and posts signals to Slack as they happen.`;
  if (a.from === "crystal") return `Free opens one ${FEATURE_NAME} company a day, with everything on it. Pro opens every company in your ${FEATURE_NAME} free.`;
  if (a.from === "proposals")
    return plan.hadTrial || plan.name !== "free"
      ? "Free and Pro build and preview proposals. Pro + Close drafts them from your call, opens your own templates and contracts, and sends them for e-signature, so the client signs where they read it."
      : "Free and Pro build and preview proposals. Your 21-day trial is Pro + Close: draft from your call, send, and get it signed.";
  return VALUE_LINE;
}

/**
 * The three plans side by side, yearly or monthly: Free, Pro and Pro + Close, each with its price and
 * one line on what you get. Buying starts Checkout; a member already paying moves between Pro and
 * Pro + Close on the same subscription (the tier op, prorated). From a Close moment (proposals) Pro +
 * Close leads.
 */
export function PlanCards({ plan, from, onDone }: { plan: PlanView; from: PlansFrom; onDone?: () => void }) {
  const { busy, run } = useBilling();
  const [code, setCode] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [interval, setBilled] = useState<"year" | "month">(plan.interval ?? "year");
  // The code they arrived with: the one the server kept for them (PlanView.code), else this browser's.
  useEffect(() => setCode(plan.code?.code ?? codeNow()), [plan.code?.code]);
  const buy = (tier: "pro" | "close") => run("checkout", { interval, tier, code: code.trim() || undefined, from }, onDone);
  const move = (tier: "pro" | "close") => run("tier", { tier }, onDone);
  const applied = !!plan.code && code.trim().toUpperCase() === plan.code.code;
  // Paying now (not in the trial): the other paid tier is a move on the same subscription.
  const paying = plan.subscribed && plan.name === "pro";
  const lead: "pro" | "close" = from === "proposals" || plan.name === "trial" || plan.tier === "pro" ? "close" : "pro";
  const yearly = interval === "year";
  const priceOf = (p: (typeof PLANS)[number]) => (yearly ? p.year : p.month);
  return (
    <>
      <div className="bl-interval" role="radiogroup" aria-label="Billed">
        {(["year", "month"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={interval === k} className={`chip${interval === k ? " chip-on" : ""}`} onClick={() => setBilled(k)}>
            {k === "year" ? "Yearly, 2 months free" : "Monthly"}
          </button>
        ))}
      </div>
      <div className="bl-plans bl-plans-3">
        {PLANS.map((p) => {
          const mine = p.key === "free" ? plan.name === "free" : paying && (plan.tier === p.key || (p.key === "pro" && plan.tier !== "close"));
          const paid = p.key !== "free";
          const offered = p.key !== "close" || plan.closeOpen;
          const label =
            p.key === "free"
              ? null
              : mine
                ? "Your plan"
                : paying
                  ? p.key === "close"
                    ? "Upgrade to Pro + Close"
                    : "Switch to Pro"
                  : `Choose ${p.name}`;
          const op = `${paying ? "tier" : "checkout"}${paying ? "" : interval}`;
          return (
            <div key={p.key} className={`bl-plan bl-plan-${p.key}${paid && p.key === lead ? " bl-plan-lead" : ""}${mine ? " mine" : ""}`} data-plan-card={p.key}>
              {paid && p.key === lead && !mine ? <span className="bl-plan-tag">{p.key === "close" ? "Wins the client" : "Most chosen"}</span> : null}
              <p className="bl-plan-h">{p.name}</p>
              <p className="bl-plan-price num">
                {usd(priceOf(p))}
                {p.key !== "free" && <span> {yearly ? "a year" : "a month"}</span>}
              </p>
              <p className="bl-plan-sub">{p.line}</p>
              {p.key === "close" && (
                <>
                  <p className="bl-plan-ai" data-close-ai>
                    {CLOSE_AI_LINE}
                  </p>
                  <p className="bl-plan-note bl-plan-pack" data-ai-pack>
                    {AI_PACK_LINE}
                  </p>
                </>
              )}
              {label && offered ? (
                <button
                  type="button"
                  className={`btn bl-plan-btn${p.key === lead && !mine ? " btn-pine" : ""}`}
                  disabled={!!busy || mine}
                  aria-busy={busy === op}
                  aria-label={mine ? `${p.name} is your plan` : `${label}: ${p.line}`}
                  onClick={() => (paying ? move(p.key as "pro" | "close") : buy(p.key as "pro" | "close"))}
                >
                  {busy === op ? (paying ? "Changing" : "Opening checkout") : label}
                </button>
              ) : p.key === "free" ? (
                <p className="bl-plan-note">{plan.name === "free" ? "Your plan" : "Where a plan ends"}</p>
              ) : (
                <p className="bl-plan-note">Opens soon</p>
              )}
            </div>
          );
        })}
      </div>
      {yearly && plan.annualLine ? <p className="bl-charge">{plan.annualLine}</p> : null}
      {plan.name === "trial" && (
        <p className="bl-charge" role="note">
          <IconCheck size={14} />
          {plan.firstChargeAt
            ? `Your trial is Pro + Close. You won't be charged until it ends on ${day(plan.firstChargeAt)}, and you keep every day of it.`
            : "Your trial ends within two days, so the first charge is today. Your plan carries on without a break."}
        </p>
      )}
      <div className="bl-code">
        {applied ? (
          <p className="bl-code-on" role="status">
            <IconCheck size={14} /> {plan.code!.code} applied: {plan.code!.off}
          </p>
        ) : codeOpen || code ? (
          <label className="bl-code-l">
            <span>Code</span>
            <input className="input bl-code-in" value={code} maxLength={40} autoComplete="off" onChange={(e) => setCode(e.target.value)} placeholder="RN-SURVEY10" />
            <span className="bl-code-hint">Applied at checkout. You can also type it there.</span>
          </label>
        ) : (
          <button type="button" className="tp-flink" onClick={() => setCodeOpen(true)}>
            Have a code?
          </button>
        )}
      </div>
    </>
  );
}

/**
 * The AI usage pack: $10, once (POST /api/billing/ai-pack). On Pro + Close and the trial a button;
 * anyone else is shown the Close upgrade instead. Nothing until its price is set up. No amount or limit is said.
 */
export function AiPackLine({ plan }: { plan: PlanView }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!plan.aiPack) return null;
  const buy = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/billing/ai-pack", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (j.url) return window.location.assign(j.url);
      toast(j.error ?? "That didn't go through. Try again in a moment.", true);
    } catch {
      toast("We couldn't reach Merlin. Check your connection and try again.", true);
    }
    setBusy(false);
  };
  return (
    <div className="bl-topup" data-ai-pack-buy>
      <p className="bl-topup-t">
        <strong>{CLOSE_AI_LINE}.</strong> {plan.canClose ? AI_PACK_LINE : "On Pro + Close."}
      </p>
      {plan.canClose ? (
        <button type="button" className="btn btn-sm" disabled={busy} aria-busy={busy} onClick={() => void buy()}>
          {busy ? "Opening checkout" : `Add a pack for ${usd(PRICES.aiPack)}`}
        </button>
      ) : (
        <button type="button" className="btn btn-sm btn-pine" onClick={() => openPlans("proposals")}>
          See Pro + Close
        </button>
      )}
    </div>
  );
}

function TopupLine({ plan, emphasis }: { plan: PlanView; emphasis?: boolean }) {
  const { busy, run } = useBilling();
  if (!plan.topup) return null;
  return (
    <div className={`bl-topup${emphasis ? " on" : ""}`}>
      <p className="bl-topup-t">
        <strong>
          {plan.prices.topupCredits} credits for {usd(plan.prices.topup)}.
        </strong>{" "}
        Once, on any plan. They don&apos;t expire.
      </p>
      <button type="button" className={`btn btn-sm${emphasis ? " btn-pine" : ""}`} disabled={!!busy} aria-busy={busy === "topup"} onClick={() => run("topup")}>
        {busy === "topup" ? "Opening checkout" : `Buy ${plan.prices.topupCredits} credits`}
      </button>
    </div>
  );
}

function PricingSheet({ plan, a, onClose }: { plan: PlanView; a: Ask; onClose: () => void }) {
  // The plans show on the trial too, any day of it: bought then, nothing is charged until it ends (PlanView.firstChargeAt).
  const onPro = plan.name === "pro";
  // On Pro (not Close): Pro + Close is still there to move to.
  const canMove = onPro && plan.tier === "pro" && !plan.proStartsAt;
  const trial = plan.name === "trial";
  // "Your trial ends soon" only in the trial's last 3 days: on day 1 it would read as a countdown.
  const title = plan.notLooking && a.from === "trial" ? (plan.ending ? "Your trial ends soon" : "Merlin Pro") : trial && a.from === "billing" ? "Keep Pro" : TITLE[a.from];
  return (
    <Sheet title={title} onClose={onClose} dialog className="bl-sheet">
      <div className="bl-sheet-in">
        {/* The Pro welcome: The keep (Fractions, quiet, on its white field), the trail ending at its door, violets on the hill. The scene's one home, and the only violet in the app. */}
        {onPro ? <Scene kind="castle" pro on="white" className="bl-welcome-art" /> : null}
        <p className="bl-lead">
          {onPro
            ? plan.proStartsAt
              ? `You're on ${plan.tier === "close" ? "Pro + Close" : "Pro"}. It starts with its first charge on ${day(plan.proStartsAt)}, when your trial ends.`
              : plan.tier === "close"
                ? "You're on Pro + Close. Everything here is yours."
                : `You're on Pro. Pro + Close adds proposals drafted from your call, sent and signed${plan.closeUntil ? `, and it's yours until ${day(plan.closeUntil)}` : ""}.`
            : leadFor(plan, a)}
        </p>
        {!plan.notLooking && !onPro && a.from !== "billing" && a.from !== "trial" && <p className="bl-value">{VALUE_LINE}</p>}
        {!onPro && a.from === "credits" && <TopupLine plan={plan} emphasis />}
        {(!onPro || canMove) && <PlanCards plan={plan} from={a.from} onDone={onClose} />}
        <CompareTable current={plan.tier} />
        {!onPro && a.from !== "credits" && <TopupLine plan={plan} />}
        <div className="bl-sheet-foot">
          <p className="tp-small muted">
            {trial && plan.firstChargeAt
              ? `Cancel before ${day(plan.firstChargeAt)} and nothing is charged. After that, Pro cancels or pauses any month.`
              : "Pro cancels or pauses any month, and Free stays free."}
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {plan.name === "free" ? "Stay on Free" : "Close"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** The plans sheet, mounted once by the app. Opens with openPlans(). */
export function PlansHost({ me }: { me: Me }) {
  const a = useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => asked,
    () => null,
  );
  // ?plans=1 in the address (an email's or the radar's link): the plans open once.
  useEffect(() => {
    if (!me.plan) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("plans") === "1") {
      const from = q.get("from") ?? "";
      openPlans((["trial", "views", "bench", "credits", "slack", "claude", "radar", "crystal", "proposals"] as string[]).includes(from) ? (from as PlansFrom) : me.plan.name === "trial" ? "trial" : "billing");
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete("plans");
        u.searchParams.delete("from");
        window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!a || !me.plan) return null;
  return <PricingSheet plan={me.plan} a={a} onClose={() => setAsk(null)} />;
}

/* ---------- the top bar's way in ---------- */

/**
 * Always one tap from Pro, in the top bar next to the credits: on the trial "Pro trial · 12 days
 * left" with Upgrade (stronger in its last 3 days), on Free "Upgrade to Pro", nothing on Pro.
 * Phones get a short "Upgrade" chip. Nothing while billing is off. Mounted in the top bar (TopBar.tsx).
 */
export function PlanPill({ plan, phone }: { plan?: PlanView; phone?: boolean }) {
  // One nudge at a time: while the trial's own line is on screen (the trial nudge or banner), it carries Keep Pro and the pill steps back.
  const trialLine = useTrialShowing();
  if (!plan) return null;
  // Pro members have nothing to upgrade to: the pill isn't there.
  if (plan.name === "pro") return null;
  if (plan.name === "trial" && trialLine) return null;
  if (plan.name === "trial") {
    const left = plan.trialDaysLeft === 1 ? "last day" : `${plan.trialDaysLeft} days left`;
    const cls = `tp-plan tp-plan-trial${plan.ending ? " end" : ""}`;
    const label = `Pro trial, ${left}. Upgrade to Pro`;
    if (phone)
      return (
        <button type="button" className={`${cls} tp-plan-phone`} onClick={() => openPlans("trial")} aria-label={label} title={`Pro trial, ${left}`}>
          <PhoneWords />
        </button>
      );
    return (
      <button type="button" className={cls} onClick={() => openPlans("trial")} aria-label={label} title={`Your Pro trial ends ${day(plan.trialEndsAt)}`}>
        <span className="tp-plan-t">
          Pro trial · <span className="num">{left}</span>
        </span>
        <span className="tp-plan-go">Upgrade</span>
      </button>
    );
  }
  return (
    <button type="button" className={`tp-plan tp-plan-free${phone ? " tp-plan-phone" : ""}`} onClick={() => openPlans("billing")} aria-label="Upgrade to Pro">
      {phone ? <PhoneWords /> : "Upgrade to Pro"}
    </button>
  );
}
/** The phone chip's words: "Upgrade", "Go Pro" on narrower phones (billing.css). Under 370px the chip gives way; the menu's first item is Upgrade to Pro. */
const PhoneWords = () => (
  <>
    <span className="tp-plan-long">Upgrade</span>
    <span className="tp-plan-short">Go Pro</span>
  </>
);

/* ---------- the trial banner ---------- */

const BANNER_KEY = "tp_trial_banner";
/** "12 unlocks used and 3 conversations opened": the receipt's lines in one sentence. */
const receiptWords = (lines: string[]) => (lines.length > 1 ? `${lines.slice(0, -1).join(", ")} and ${lines[lines.length - 1]}` : lines[0] ?? "");
/**
 * The trial's last 3 days (from day 18 of 21), over the table: the value receipt, what the trial
 * gave them so far, with Keep Pro. Closed with the X, it stays closed for that trial (one time).
 */
export function TrialBanner({ plan }: { plan?: PlanView }) {
  const end = plan?.trialEndsAt ?? "";
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    try {
      setClosed(localStorage.getItem(BANNER_KEY) === end || sessionStorage.getItem(BANNER_KEY) === end);
    } catch {}
  }, [end]);
  useMarkTrialShowing(!!plan?.ending && !closed);
  if (!plan || !plan.ending || closed) return null;
  const close = () => {
    setClosed(true);
    try {
      localStorage.setItem(BANNER_KEY, end);
    } catch {}
  };
  const when = plan.trialDaysLeft === 1 ? "ends tomorrow" : `ends in ${plan.trialDaysLeft} days`;
  // The loss in plain terms when the server has it (PlanView.summary), else what it gave so far.
  const got = plan.summary ? ` ${[plan.summary.used, plan.summary.locks].filter(Boolean).join(" ")}` : plan.receipt?.length ? ` So far: ${receiptWords(plan.receipt)}.` : "";
  return (
    <div className="tp-strip bl-banner" role="status">
      <span className="bl-banner-tag" aria-hidden>
        Pro trial
      </span>
      <span className="tp-strip-t">
        {plan.notLooking ? (
          <>Your Pro trial {when}. Nothing to do: you stay on Free, with no charge.</>
        ) : plan.summary ? (
          <>
            Your Pro trial {when}.{got}
          </>
        ) : (
          <>
            Your Pro trial {when}.{got} Then you&apos;re on Free, unless you keep Pro.
          </>
        )}
      </span>
      <span className="tp-strip-acts">
        <button type="button" className={`btn btn-sm${plan.notLooking ? "" : " btn-pine"}`} onClick={() => openPlans("trial")}>
          {plan.notLooking ? "See plans" : "Keep Pro"}
        </button>
      </span>
      <button type="button" className="tp-iconbtn tp-iconbtn-dark tp-iconbtn-sm" aria-label="Dismiss" onClick={close}>
        <IconX size={14} />
      </button>
    </div>
  );
}

/**
 * Home, in the trial's last 4 days (PlanView.summary): the trial's end as a loss in plain terms.
 * "So far: You opened 16 companies free and sent 3 notes; 1 proposal is out." then what locks,
 * and Keep Pro. A member who said they aren't looking gets nothing here (the soft form elsewhere).
 */
export function TrialSummaryCard({ plan }: { plan?: PlanView }) {
  const on = !!plan && plan.name === "trial" && !!plan.summary && !plan.notLooking;
  useMarkTrialShowing(on);
  if (!on || !plan?.summary) return null;
  const when = plan.trialDaysLeft === 1 ? "ends tomorrow" : `ends in ${plan.trialDaysLeft} days`;
  return (
    <section className="bl-sum" aria-labelledby="bl-sum-h" data-trial-summary>
      <div className="bl-sum-t">
        <p className="bl-sum-h" id="bl-sum-h">
          Your Pro trial {when}.
        </p>
        {plan.summary.used && (
          <p className="bl-sum-p">
            <strong>So far:</strong> {plan.summary.used}
          </p>
        )}
        <p className="bl-sum-p">{plan.summary.locks}</p>
      </div>
      <button type="button" className="btn btn-sm btn-pine" onClick={() => openPlans("trial")}>
        Keep Pro
      </button>
    </section>
  );
}

/* ---------- out of credits: three ways to get them ---------- */

/** Start the top-up's checkout (Stripe opens in this tab). Words back on a refusal. */
export async function buyTopup(): Promise<string | null> {
  const r = await billing("topup");
  if (r.url) {
    window.location.assign(r.url);
    return null;
  }
  return r.error ?? r.message ?? null;
}

/**
 * Out of credits, in one line: "Earn one: add a fact" · "50 for $19" · "Pro: companies free". The
 * top-up shows only when it is set up and Pro only off Pro; with billing off, only earning does.
 * `onEarn`: where earning one goes (the member's seats, or Add what you know); left out at today's
 * earning cap, where earning can't help.
 */
export function GetCredits({ plan, onEarn, className }: { plan?: PlanView; onEarn?: () => void; className?: string }) {
  const { busy, run } = useBilling();
  return (
    <div className={`bl-get${className ? ` ${className}` : ""}`} role="group" aria-label="Ways to get credits">
      {onEarn && (
        <button type="button" className="btn btn-sm btn-primary" onClick={onEarn}>
          {EARN_ONE}
        </button>
      )}
      {plan?.topup && (
        <button type="button" className="btn btn-sm" disabled={!!busy} aria-busy={busy === "topup"} onClick={() => run("topup")}>
          {busy === "topup" ? "Opening checkout" : topupWords(plan)}
        </button>
      )}
      {plan && plan.name !== "pro" && (
        <button type="button" className="btn btn-sm btn-pine" onClick={() => openPlans("credits")}>
          {PRO_COMPANIES_FREE}
        </button>
      )}
    </div>
  );
}

/* ---------- one line at a limit ---------- */

/** "Pro · in your trial", with the day it ends for a title. */
const trialTitle = (plan: PlanView) => `Pro. Yours in the trial until ${day(plan.trialEndsAt)}.`;

/**
 * A calm line where Free stops: what Pro adds there, with a lock, and a way to see it. In the trial
 * the same spot says Pro is in use there ("Pro · in your trial", `trial` for its words) and offers
 * Keep Pro. `inTrial` false: the trial doesn't include it (the monthly credits), so the tag is "Pro".
 * Nothing while billing is off or on Pro.
 */
export function UpgradeNote({ from, children, trial, inTrial = true }: { from: PlansFrom; children?: ReactNode; trial?: ReactNode; inTrial?: boolean }) {
  const ui = useUi();
  const plan = ui.me.plan;
  if (!plan || plan.name === "pro") return null;
  // In the trial, where Pro is in use: a quiet "Pro" tag, its end day in the title. No box and no Keep Pro (one nudge at a time).
  if (plan.name === "trial" && inTrial)
    return (
      <p className="bl-quiet" data-upgrade={from} data-plan="trial">
        <ProTag plan={plan} />
      </p>
    );
  if (plan.name === "trial")
    return (
      <div className="bl-note bl-note-trial" data-upgrade={from} data-plan="trial">
        <span className="bl-tag bl-tag-trial" title={inTrial ? trialTitle(plan) : undefined}>
          {inTrial ? "Pro · in your trial" : "Pro"}
        </span>
        <p className="bl-note-t">{trial ?? `This is Pro, yours in the trial until ${day(plan.trialEndsAt)}.`}</p>
        <button type="button" className="btn btn-sm" onClick={() => openPlans(from)}>
          {plan.notLooking ? "See plans" : "Keep Pro"}
        </button>
      </div>
    );
  return (
    <div className="bl-note" data-upgrade={from} data-plan="free">
      <span className="bl-note-tag bl-tag-lock" aria-hidden>
        <IconLock size={11} />
        Pro
      </span>
      <p className="bl-note-t">{children}</p>
      <button type="button" className="btn btn-sm" onClick={() => openPlans(from)}>
        See Pro
      </button>
    </div>
  );
}

/** A Pro feature's mark where it sits: on Free a lock and "Pro", in the trial "Pro · in your trial". Nothing on Pro or with billing off. */
export function ProTag({ plan }: { plan?: PlanView }) {
  if (!plan || plan.name === "pro") return null;
  if (plan.name === "trial")
    return (
      <span className="bl-tag bl-tag-trial" title={trialTitle(plan)}>
        Pro
      </span>
    );
  return (
    <span className="bl-tag bl-tag-lock">
      <IconLock size={11} />
      Pro
    </span>
  );
}

/** In place of a Pro control on Free: a lock and "Pro" that opens the plans at that feature. */
export function ProLock({ from, what }: { from: PlansFrom; what: string }) {
  return (
    <button type="button" className="bl-lock" onClick={() => openPlans(from)} aria-label={`${what}: Pro. See Pro`} title="Part of Pro. See Pro">
      <IconLock size={12} />
      Pro
    </button>
  );
}

/**
 * One Pro feature as a row where it lives: its name and what it does, then on Free a lock (the
 * plans open there), in the trial "Pro · in your trial" with Keep Pro. Nothing on Pro (it's simply
 * theirs) or while billing is off.
 */
export function ProRow({ from, title, desc, free }: { from: PlansFrom; title: string; desc: ReactNode; free?: ReactNode }) {
  const plan = useUi().me.plan;
  if (!plan || plan.name === "pro") return null;
  const onFree = plan.name === "free";
  return (
    <div className={`bl-row${onFree ? " locked" : ""}`} data-upgrade={from} data-plan={plan.name}>
      <div className="bl-row-t">
        <span className="bl-row-h">
          {/* On Free the lock at the end says Pro; the title carries the tag only in the trial. */}
          {title} {!onFree && <ProTag plan={plan} />}
        </span>
        <span className="bl-row-d">{onFree && free ? free : desc}</span>
      </div>
      {onFree ? <ProLock from={from} what={title} /> : null}
    </div>
  );
}

/** Out of credits, with billing live: the top-up first, then Pro. Shown in the zero-credits popover. */
export function CreditsWall({ plan }: { plan: PlanView }) {
  const { busy, run } = useBilling();
  return (
    <div className="bl-wall">
      {plan.topup && (
        <button type="button" className="btn btn-sm btn-pine" disabled={!!busy} aria-busy={busy === "topup"} onClick={() => run("topup")}>
          {busy === "topup" ? "Opening checkout" : `Buy ${plan.prices.topupCredits} credits for ${usd(plan.prices.topup)}`}
        </button>
      )}
      {plan.name !== "pro" && (
        <button type="button" className="tp-flink" onClick={() => openPlans("credits")}>
          Or {plan.name === "trial" ? "keep Pro" : "Pro"}: {plan.prices.proCredits} credits each paid month
        </button>
      )}
    </div>
  );
}

/* ---------- Plan and billing ---------- */

/** Where "Add an AI usage pack, $10" posts (the billing branch builds it: lib/proposals/aiUsage.ts AI_PACK_ROUTE). */
const AI_PACK_ROUTE = "/api/billing/ai-pack";

/**
 * AI usage this month (PlanView.ai, lib/proposals/aiUsage.ts aiMeter): a percentage and the day it
 * resets, never dollars or tokens. On paid Pro, the usage pack.
 */
export function AiUsageCard({ ai }: { ai: NonNullable<PlanView["ai"]> }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const reset = ai.resetsOn ? new Date(`${ai.resetsOn}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null;
  const line = ai.trial ? `${ai.percent}% of your trial's AI usage used` : `${ai.percent}% used${reset ? `, resets ${reset}` : ""}`;
  const buy = async () => {
    setBusy(true);
    setSaid(null);
    try {
      const r = await fetch(AI_PACK_ROUTE, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (r.ok && j.url) return void (window.location.href = j.url);
      setSaid(r.status === 404 ? "Usage packs aren't on sale yet." : j.error ?? "That didn't go through. Try again.");
    } catch {
      setSaid("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="tp-card bl-ai" aria-labelledby="bl-ai-h">
      <h2 className="tp-card-h" id="bl-ai-h">
        {ai.trial ? "AI usage on your trial" : "AI usage this month"}
      </h2>
      <div className="bl-ai-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ai.percent} aria-label={line}>
        <span style={{ width: `${ai.percent}%` }} />
      </div>
      <p className="cr-note bl-ai-line">{line}</p>
      {ai.usedUp ? (
        <p className="cr-note">You&apos;ve used it all. Build it in Claude still works, free.</p>
      ) : ai.onPack ? (
        <p className="cr-note">This month&apos;s is used: your usage pack keeps you drafting.</p>
      ) : null}
      {ai.canAddPack && (
        <div className="bl-acts">
          <button type="button" className="btn" disabled={busy} aria-busy={busy} onClick={() => void buy()}>
            Add an AI usage pack, $10
          </button>
          <span className="tp-small muted" role="status">
            {said}
          </span>
        </div>
      )}
    </section>
  );
}

function Status({ plan }: { plan: PlanView }) {
  if (plan.name === "trial")
    return (
      <>
        <p className="bl-status-h">
          Pro trial <span className="bl-days num">{plan.trialDaysLeft === 1 ? "last day" : `${plan.trialDaysLeft} days left`}</span>
        </p>
        <p className="bl-status-p">
          Your trial is Pro + Close, proposals included. It ends on {day(plan.trialEndsAt)}. Nothing to do: when it ends you&apos;re on Free, and no card is asked.
          {plan.trialExtended ? " We added a week because you were in the middle of something." : ""}
          {plan.firstChargeAt && !plan.notLooking ? ` Keep Pro now and nothing is charged until ${day(plan.firstChargeAt)}.` : ""}
        </p>
        {/* The value receipt before the decision (the trial's last 3 days): what it gave them so far. */}
        {!!plan.receipt?.length && (
          <>
            <p className="bl-status-p">
              <strong>What your trial gave you so far:</strong>
            </p>
            <ul className="bl-receipt">
              {plan.receipt.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </>
        )}
        {/* The trial's last 4 days: the loss in plain terms (PlanView.summary). */}
        {plan.summary && !plan.notLooking && (
          <p className="bl-status-p bl-status-sum" data-trial-summary>
            {plan.summary.used ? <>{plan.summary.used} </> : null}
            <strong>{plan.summary.locks}</strong>
          </p>
        )}
      </>
    );
  if (plan.name === "pro") {
    const kind = plan.interval === "year" ? "yearly" : "monthly";
    return (
      <>
        <p className="bl-status-h">{plan.proStartsAt ? `${plan.tier === "close" ? "Pro + Close" : "Pro"} starts ${day(plan.proStartsAt)}, ${kind}` : `${plan.tier === "close" ? "Pro + Close" : "Pro"}, ${kind}`}</p>
        {plan.closeUntil && <p className="bl-status-p">Pro + Close is yours until {day(plan.closeUntil)}, your next renewal. Then you&apos;re on Pro, unless you move to Pro + Close.</p>}
        <p className="bl-status-p">
          {plan.proStartsAt
            ? plan.cancelAt
              ? `Cancelled before it started. Nothing is charged. You keep Pro until ${day(plan.proStartsAt)}, then you're on Free.`
              : `Your trial runs to ${day(plan.proStartsAt)}, and Pro carries straight on. The first charge comes that day, with your first ${plan.prices.proCredits} credits.`
            : plan.cancelAt
            ? `Cancelled. You keep Pro until ${day(plan.proUntil)}, then you're on Free. Nothing more is charged.`
            : plan.pause === "booked"
              ? `Paused from ${day(plan.pausedFrom)} to ${day(plan.pausedUntil)}: Free with no charge, then Pro comes back.`
              : `Renews on ${day(plan.proUntil)}. ${plan.prices.proCredits} credits come with each paid month.`}
        </p>
      </>
    );
  }
  if (plan.pause === "now")
    return (
      <>
        <p className="bl-status-h">Paused</p>
        <p className="bl-status-p">You&apos;re on Free until {day(plan.pausedUntil)}, with no charge. Then Pro comes back on its own.</p>
      </>
    );
  return (
    <>
      <p className="bl-status-h">Free</p>
      <p className="bl-status-p">
        {plan.hadTrial ? "Your trial is over. " : ""}You earn a credit for each fact you add, keep 1 saved view with the weekly email, see the median rates, and open one {FEATURE_NAME} company a day, fully.
      </p>
    </>
  );
}

export function BillingPage({ view, refresh, onBack }: { view: View; refresh: () => Promise<void>; onBack: () => void }) {
  const toast = useToast();
  const plan = view.me?.plan;
  const { busy, run } = useBilling();
  const [confirm, setConfirm] = useState(false);
  // Back from Stripe: say what happened, once, and take the flag out of the address.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const paid = q.get("paid") === "1";
    const top = q.get("topup") === "1";
    if (!paid && !top) return;
    toast(paid ? (plan?.firstChargeAt ? `Thanks. Pro is yours. Nothing is charged until ${day(plan.firstChargeAt)}.` : "Thanks. Pro is yours.") : "Thanks. Your credits are on the way.");
    void refresh();
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("paid");
      u.searchParams.delete("topup");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!plan) return null;
  const paidPlan = plan.subscribed && (plan.name === "pro" || plan.pause === "now");
  return (
    <div className="tp-page bl-page">
      {/* Pro is the door with the saffron lining; a trial is its calendar. */}
      {plan.name === "pro" ? <Prop name="doorOpen" pro height={62} on="bg" className="tp-page-art" /> : plan.name === "trial" ? <Prop name="calendar" height={58} on="bg" ember={!plan.ending} className="tp-page-art" /> : <Prop name="doorAjar" pro height={60} on="bg" className="tp-page-art" />}
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">Plan and billing</h1>

      <section className={`tp-card bl-status bl-status-${plan.name}`} aria-label="Your plan">
        <div className="bl-status-t">
          <Status plan={plan} />
        </div>
        <div className="bl-status-acts">
          {/* The trial's last days: the Nomad knocks. It holds the page's ember, so the calendar above is drawn calm. */}
          {plan.name === "trial" && plan.ending ? <NomadArt pose="knock" height={52} className="bl-status-art" /> : null}
          {plan.name === "free" && plan.pause !== "now" && (
            <button type="button" className={`btn${plan.notLooking ? "" : " btn-pine"}`} onClick={() => openPlans("billing")}>
              See Pro
            </button>
          )}
          {plan.name === "trial" && (
            <button type="button" className={`btn${plan.notLooking ? "" : " btn-pine"}`} onClick={() => openPlans("trial")}>
              {plan.notLooking ? "See plans" : "Keep Pro"}
            </button>
          )}
          {plan.cancelAt && plan.subscribed && (
            <button type="button" className="btn btn-pine" disabled={!!busy} aria-busy={busy === "keep"} onClick={() => run("keep", {}, refresh)}>
              Keep Pro
            </button>
          )}
          {plan.pause && plan.subscribed && (
            <button type="button" className="btn" disabled={!!busy} aria-busy={busy === "resume"} onClick={() => run("resume", {}, refresh)}>
              End the pause
            </button>
          )}
        </div>
      </section>

      {plan.ai && <AiUsageCard ai={plan.ai} />}

      {paidPlan && plan.proStartsAt && !plan.cancelAt && (
        <section className="tp-card bl-manage" aria-labelledby="bl-manage-h">
          <h2 className="tp-card-h" id="bl-manage-h">
            Changed your mind?
          </h2>
          <p className="cr-note">Cancel before {day(plan.proStartsAt)} and nothing is charged. You keep Pro until then, then you&apos;re on Free.</p>
          <div className="bl-acts">
            <button type="button" className="btn btn-ghost" disabled={!!busy} aria-busy={busy === "cancel"} onClick={() => run("cancel", {}, refresh)}>
              Cancel Pro
            </button>
          </div>
        </section>
      )}

      {paidPlan && !plan.proStartsAt && !plan.cancelAt && !plan.pause && (
        <section className="tp-card bl-manage" aria-labelledby="bl-manage-h">
          <h2 className="tp-card-h" id="bl-manage-h">
            Book full?
          </h2>
          {confirm ? (
            <>
              <p className="cr-note">
                Pause instead of cancelling: you keep Pro until {day(plan.proUntil)}, then a month on Free with no charge, then Pro comes back. Or cancel: Pro runs to{" "}
                {day(plan.proUntil)}, then Free.
              </p>
              <div className="bl-acts">
                <button type="button" className="btn btn-pine" disabled={!!busy} aria-busy={busy === "pause"} onClick={() => run("pause", {}, async () => (setConfirm(false), await refresh()))}>
                  Pause for a month
                </button>
                <button type="button" className="btn" disabled={!!busy} aria-busy={busy === "cancel"} onClick={() => run("cancel", {}, async () => (setConfirm(false), await refresh()))}>
                  Cancel at {day(plan.proUntil)}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>
                  Keep Pro
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="cr-note">Pause Pro for a month when you have no room for a new client. No charge, Free meanwhile, and it comes back on its own.</p>
              <div className="bl-acts">
                <button type="button" className="btn" disabled={!!busy} aria-busy={busy === "pause"} onClick={() => run("pause", {}, refresh)}>
                  Pause for a month
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirm(true)}>
                  Cancel Pro
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {plan.aiPack && (
        <section className="tp-card" aria-labelledby="bl-ai-h">
          <h2 className="tp-card-h" id="bl-ai-h">
            AI usage
          </h2>
          <AiPackLine plan={plan} />
        </section>
      )}

      {plan.topup && (
        <section className="tp-card" aria-labelledby="bl-topup-h">
          <h2 className="tp-card-h" id="bl-topup-h">
            Need more credits?
          </h2>
          <TopupLine plan={plan} />
        </section>
      )}

      {plan.portal && (
        <section className="tp-card bl-portal" aria-labelledby="bl-portal-h">
          <h2 className="tp-card-h" id="bl-portal-h">
            Card and invoices
          </h2>
          <p className="cr-note">Change your card, download invoices, or switch between monthly and yearly. It opens Stripe, where your payments are kept. Merlin never sees your card.</p>
          <div className="bl-acts">
            <button type="button" className="btn" disabled={!!busy} aria-busy={busy === "portal"} onClick={() => run("portal")}>
              {busy === "portal" ? "Opening" : "Manage billing"}
            </button>
          </div>
        </section>
      )}

      <section className="tp-card bl-what" aria-labelledby="bl-what-h">
        <h2 className="tp-card-h" id="bl-what-h">
          Free, Pro and Pro + Close
        </h2>
        {!plan.notLooking && <p className="cr-note">{VALUE_LINE}</p>}
        {/* Paying now: move between Pro and Pro + Close here, on the same subscription. */}
        {plan.subscribed && plan.name === "pro" && !plan.proStartsAt && !plan.cancelAt && <PlanCards plan={plan} from="billing" onDone={refresh} />}
        <CompareTable current={plan.tier} />
        {plan.name === "pro" && (
          <p className="tp-small muted bl-check">
            <IconCheck size={13} /> Everything in the {plan.tier === "close" ? "Pro + Close" : "Pro"} column is yours.
          </p>
        )}
      </section>
    </div>
  );
}
