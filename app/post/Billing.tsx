"use client";

/**
 * Plans, only while billing is live (Me.plan is set; lib/billing). With billing off none of this
 * renders and the app is as it was.
 *
 *   BillingPage   Plan and billing (the account menu, Settings): the plan, trial days left, renew,
 *                 cancel, pause, the top-up, and invoices and the card in Stripe's portal.
 *   PlansHost     the plans sheet, opened from an upgrade moment with openPlans(from): the trial
 *                 ending, a second saved view, the full benchmarks, Slack and Claude limits, out of
 *                 credits. Free against Pro in plain words, yearly first.
 *   TrialBanner   the trial's last 3 days, over the table.
 *   UpgradeNote   one calm line at a limit, with a way to see Pro.
 *
 * No price shows before the trial's last days (PlanView.showPrices), except at a wall the member hit.
 * A member who said they aren't looking for a client hears the soft form: Free is a fine answer.
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Me, PlanView, View } from "@/lib/tableTypes";
import { IconCheck, IconChevron, IconX, useToast } from "../ui/shared";
import { Sheet, useUi } from "./ui";
import { sendSignal } from "./ProOffer";
import { FEATURE_NAME } from "@/lib/radar/types";
import "./billing.css";

/** Where the plans were opened from: an upgrade moment. */
export type PlansFrom = "trial" | "views" | "bench" | "credits" | "slack" | "claude" | "radar" | "billing";
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
/** A code that came in the address (?code=RN-SURVEY10), kept for this tab so checkout can apply it. */
function codeNow(): string {
  try {
    const q = new URLSearchParams(window.location.search).get("code");
    if (q) sessionStorage.setItem(CODE_KEY, q.slice(0, 40));
    return sessionStorage.getItem(CODE_KEY) ?? "";
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

const ROWS: [string, string, string][] = [
  ["Open roles", "In your weekly email", "As soon as they open"],
  ["Saved views", "1, with the weekly email", "As many as you want, with alerts"],
  [FEATURE_NAME, "Every signal, each morning", "Every signal, in Slack as it happens"],
  ["Rate benchmarks", "Medians by function", "Ranges by function and client size"],
  ["Slack", "The weekly roles post", "Every alert"],
  ["Claude", "20 requests a day", "No daily cap"],
  ["Credits", "1 for each fact you add", "Plus 100 each paid month"],
  ["Referral partners, messages, Recently hired", "Included", "Included"],
];

export function CompareTable({ current }: { current?: "free" | "pro" }) {
  return (
    <table className="bl-compare">
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">What you get</span>
          </th>
          <th scope="col" className={current === "free" ? "on" : ""}>
            Free
          </th>
          <th scope="col" className={current === "pro" ? "on" : ""}>
            Pro
          </th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map(([what, free, pro]) => (
          <tr key={what}>
            <th scope="row">{what}</th>
            <td data-cap="Free">{free}</td>
            <td data-cap="Pro" className="bl-pro">
              {pro}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
  billing: "Merlin Pro",
};
export const VALUE_LINE = "See who's hiring before it's posted, the hiring exec and the warm path, instantly.";

function leadFor(plan: PlanView, a: Ask): string {
  if (plan.notLooking) return "Not looking for a client right now? Free is a fine plan. Pro is here for when you are, and it pauses any month your book is full.";
  if (a.from === "views")
    return a.caught
      ? `A second view here would have caught ${a.caught} new ${a.caught === 1 ? "role" : "roles"} in the last 30 days. Free keeps one view; Pro keeps one for every market you work, with alerts as roles open.`
      : "Free keeps one saved view. Pro keeps one for every market you work, with alerts as roles open.";
  if (a.from === "bench") return "Free shows the median for each function. Pro shows the range, by function and by client size.";
  if (a.from === "credits") return `Buy ${plan.prices.topupCredits} credits once, or get Pro: ${plan.prices.proCredits} credits each paid month, on top of what you earn.`;
  if (a.from === "slack") return "Free posts the weekly roles to Slack. Pro posts every alert: messages, your seats, and new roles as they open.";
  if (a.from === "claude") return "Free gives Claude 20 requests a day. Pro has no daily cap.";
  if (a.from === "trial" && plan.trialDaysLeft) return `Your Pro trial ends ${plan.trialDaysLeft === 1 ? "tomorrow" : `in ${plan.trialDaysLeft} days`}. After that you're on Free, with no charge.`;
  return VALUE_LINE;
}

function PlanCards({ plan, from, onDone }: { plan: PlanView; from: PlansFrom; onDone?: () => void }) {
  const { busy, run } = useBilling();
  const [code, setCode] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  useEffect(() => setCode(codeNow()), []);
  const go = (interval: "month" | "year") => run("checkout", { interval, code: code.trim() || undefined, from }, onDone);
  return (
    <>
      <div className="bl-plans">
        <div className="bl-plan bl-plan-year">
          <span className="bl-plan-tag">2 months free</span>
          <p className="bl-plan-h">Yearly</p>
          <p className="bl-plan-price num">
            {usd(plan.prices.year)}
            <span> a year</span>
          </p>
          <p className="bl-plan-sub">{plan.annualLine ?? `${usd(Math.round(plan.prices.year / 12))} a month, paid once a year.`}</p>
          <button type="button" className="btn btn-primary bl-plan-btn" disabled={!!busy} aria-busy={busy === "checkoutyear"} onClick={() => go("year")}>
            {busy === "checkoutyear" ? "Opening checkout" : "Choose yearly"}
          </button>
        </div>
        <div className="bl-plan">
          <p className="bl-plan-h">Monthly</p>
          <p className="bl-plan-price num">
            {usd(plan.prices.month)}
            <span> a month</span>
          </p>
          <p className="bl-plan-sub">Cancel or pause any month.</p>
          <button type="button" className="btn bl-plan-btn" disabled={!!busy} aria-busy={busy === "checkoutmonth"} onClick={() => go("month")}>
            {busy === "checkoutmonth" ? "Opening checkout" : "Choose monthly"}
          </button>
        </div>
      </div>
      <div className="bl-code">
        {codeOpen || code ? (
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
  // In the trial before its last days, Pro is already theirs: no price, just what they have.
  const early = plan.name === "trial" && !plan.ending;
  const onPro = plan.name === "pro";
  const title = plan.notLooking && a.from === "trial" ? "Your trial ends soon" : TITLE[a.from];
  return (
    <Sheet title={title} onClose={onClose} dialog className="bl-sheet">
      <div className="bl-sheet-in">
        <p className="bl-lead">{onPro ? "You're on Pro. Everything here is yours." : early ? `You're on the Pro trial: all of this is yours until ${day(plan.trialEndsAt)}.` : leadFor(plan, a)}</p>
        {!plan.notLooking && !onPro && !early && a.from !== "billing" && <p className="bl-value">{VALUE_LINE}</p>}
        {!early && !onPro && a.from === "credits" && <TopupLine plan={plan} emphasis />}
        {!early && !onPro && <PlanCards plan={plan} from={a.from} onDone={onClose} />}
        <CompareTable current={onPro || plan.name === "trial" ? "pro" : "free"} />
        {!early && !onPro && a.from !== "credits" && <TopupLine plan={plan} />}
        <div className="bl-sheet-foot">
          <p className="tp-small muted">No card for the trial. Pro cancels or pauses any month, and Free stays free.</p>
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
      openPlans((["trial", "views", "bench", "credits", "slack", "claude", "radar"] as string[]).includes(from) ? (from as PlansFrom) : me.plan.ending ? "trial" : "billing");
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

/* ---------- the trial banner ---------- */

const BANNER_KEY = "tp_trial_banner";
/** The trial's last 3 days, over the table. Closed for this tab with the X. */
export function TrialBanner({ plan }: { plan?: PlanView }) {
  const end = plan?.trialEndsAt ?? "";
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    try {
      setClosed(sessionStorage.getItem(BANNER_KEY) === end);
    } catch {}
  }, [end]);
  if (!plan || !plan.ending || closed) return null;
  const close = () => {
    setClosed(true);
    try {
      sessionStorage.setItem(BANNER_KEY, end);
    } catch {}
  };
  const when = plan.trialDaysLeft === 1 ? "ends tomorrow" : `ends in ${plan.trialDaysLeft} days`;
  return (
    <div className="tp-strip bl-banner" role="status">
      <span className="bl-banner-tag" aria-hidden>
        Pro trial
      </span>
      <span className="tp-strip-t">
        {plan.notLooking ? (
          <>Your Pro trial {when}. Nothing to do: you stay on Free, with no charge.</>
        ) : (
          <>
            Your Pro trial {when}. Then you&apos;re on Free, unless you keep Pro.
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

/* ---------- one line at a limit ---------- */

/** A calm line where Free stops: what Pro adds there, and a way to see it. Nothing while billing is off or on Pro. */
export function UpgradeNote({ from, children }: { from: PlansFrom; children: ReactNode }) {
  const ui = useUi();
  const plan = ui.me.plan;
  if (!plan || plan.name !== "free") return null;
  return (
    <div className="bl-note" data-upgrade={from}>
      <span className="bl-note-tag" aria-hidden>
        Pro
      </span>
      <p className="bl-note-t">{children}</p>
      <button type="button" className="btn btn-sm" onClick={() => openPlans(from)}>
        See Pro
      </button>
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
      {plan.name === "free" && (
        <button type="button" className="tp-flink" onClick={() => openPlans("credits")}>
          Or Pro: {plan.prices.proCredits} credits each month
        </button>
      )}
    </div>
  );
}

/* ---------- Plan and billing ---------- */

function Status({ plan }: { plan: PlanView }) {
  if (plan.name === "trial")
    return (
      <>
        <p className="bl-status-h">
          Pro trial <span className="bl-days num">{plan.trialDaysLeft === 1 ? "last day" : `${plan.trialDaysLeft} days left`}</span>
        </p>
        <p className="bl-status-p">
          It ends on {day(plan.trialEndsAt)}. Nothing to do: when it ends you&apos;re on Free, and no card is asked.
          {plan.trialExtended ? " We added a week because you were in the middle of something." : ""}
        </p>
      </>
    );
  if (plan.name === "pro") {
    const kind = plan.interval === "year" ? "yearly" : "monthly";
    return (
      <>
        <p className="bl-status-h">Pro, {kind}</p>
        <p className="bl-status-p">
          {plan.cancelAt
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
        {plan.hadTrial ? "Your trial is over. " : ""}You earn a credit for each fact you add, keep 1 saved view with the weekly email, and see the median rates.
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
    toast(paid ? "Thanks. Pro is yours." : "Thanks. Your credits are on the way.");
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
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">Plan and billing</h1>

      <section className={`tp-card bl-status bl-status-${plan.name}`} aria-label="Your plan">
        <div className="bl-status-t">
          <Status plan={plan} />
        </div>
        <div className="bl-status-acts">
          {plan.name === "free" && plan.pause !== "now" && (
            <button type="button" className={`btn${plan.notLooking ? "" : " btn-pine"}`} onClick={() => openPlans("billing")}>
              See Pro
            </button>
          )}
          {plan.name === "trial" && plan.ending && (
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

      {paidPlan && !plan.cancelAt && !plan.pause && (
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

      {plan.showPrices && plan.topup && (
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
          Free and Pro
        </h2>
        {!plan.notLooking && <p className="cr-note">{VALUE_LINE}</p>}
        <CompareTable current={plan.name === "free" ? "free" : "pro"} />
        {plan.name === "pro" && (
          <p className="tp-small muted bl-check">
            <IconCheck size={13} /> Everything in the Pro column is yours.
          </p>
        )}
      </section>
    </div>
  );
}
