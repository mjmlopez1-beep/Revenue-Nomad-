/**
 * Credits and usage (credits/CreditsUsage.tsx, Credits.dc.html), as pure functions: which tab an
 * address opens, each ledger line's kind (what earned or spent it) and tone, earned and spent by
 * kind and by week, the running balance, the ledger's filters, and the ways to earn. No React and
 * no browser, so scripts/test-credits-page.mts checks it on ledgers shaped as the server sends them.
 *
 * Nothing here is made up: every number is the member's own ledger (View.ledger, newest first),
 * their Me, and the rules in lib/tableFields.ts. A reason this file does not know is "Other", never
 * a guess. Workflows (lib/workflows, Beta) write unlock lines that carry the workflow's name
 * (`wf`), or a reason that starts "Workflow": both read as the Workflows kind.
 */
import type { LedgerRow, Me } from "@/lib/tableTypes";
import { COMPANY_PRICE, EARN_CAP, HIDDEN_COMPANY, PRO_OPENS_DAILY, REFERRAL_BONUS, REFERRAL_LIMIT } from "@/lib/tableFields";
import { FEATURE_NAME } from "@/lib/radar/types";
import { PASS_CREDIT } from "@/lib/peersCore";

/* ---------- tabs and old addresses ---------- */

export const CREDIT_TABS = ["overview", "ledger", "earn", "plans"] as const;
export type CreditTab = (typeof CREDIT_TABS)[number];
export const CREDIT_TAB_LABEL: Record<CreditTab, string> = { overview: "Overview", ledger: "Ledger", earn: "Ways to earn", plans: "Plans" };

/**
 * The tab an address opens. ?p=billing (Plan and billing: every email and Stripe's way back,
 * ?plans=1, ?topup=1, ?paid=1, ?aipack=1) opens Plans; ?p=credits opens Overview. `tab=` names one
 * outright (?p=credits&tab=ledger). Without billing live there is no Plans tab: Overview.
 */
export function creditTabOf(page: string, search: string, billing: boolean): CreditTab {
  const q = new URLSearchParams(search);
  const named = q.get("tab");
  const alias: Record<string, CreditTab> = { history: "ledger", ways: "earn", plan: "plans", billing: "plans" };
  const t = (CREDIT_TABS as readonly string[]).includes(named ?? "") ? (named as CreditTab) : named && alias[named] ? alias[named] : null;
  const want: CreditTab = t ?? (page === "billing" || q.get("plans") === "1" || q.get("aipack") === "1" ? "plans" : "overview");
  return want === "plans" && !billing ? "overview" : want;
}

/* ---------- what each line is ---------- */

export const KINDS = ["opens", "facts", "added", "rates", "invites", "leads", "plan", "refunds", "takenBack", "workflows", "other"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = {
  opens: "Company opens",
  facts: "Facts you unlocked",
  added: "Facts you added",
  rates: "Rates you shared",
  invites: "Invite bonuses",
  leads: "Leads you passed",
  plan: "Plan credits and top-ups",
  refunds: "Refunds",
  takenBack: "Taken back",
  workflows: "Workflows",
  other: "Other",
};

/** A ledger line, with the workflow that spent it when there was one (lib/workflows writes `wf`). */
export type Line = LedgerRow & { wf?: string };

const PRIVATE_RATE = "Private rate";
const FREE_OPEN = /^(Opened free (on|in your|from) |Free company of the day|Free .* company of the day)/;
const REFUND_WORDS = /^(Refund for |You were right|Gave back )/;
const PLAN_WORDS = /( credits for the month| credits for month \d+ of your year|^Bought \d+ credits|^Topped up to 0)/;

/** What a line is, from its reason and field as the server sends them (lib/table.ts fullView). Unknown: Other. */
export function kindOf(l: Line): Kind {
  if (l.wf || /^\s*workflow\b/i.test(l.reason)) return "workflows";
  if (FREE_OPEN.test(l.reason)) return "opens";
  if (l.field === PRIVATE_RATE || l.reason === "Removed") return "rates";
  switch (l.reason) {
    case "unlock":
      return l.field === HIDDEN_COMPANY ? "opens" : "facts";
    case "fill":
    case "confirm":
      return "added";
    case "referral":
      return "invites";
    case "refund":
      return "refunds";
    case "reversal":
    case "retract":
      return "takenBack";
    case "A peer took the lead you passed":
      return "leads";
  }
  if (REFUND_WORDS.test(l.reason)) return "refunds";
  if (/^Took back /.test(l.reason)) return "takenBack";
  if (PLAN_WORDS.test(l.reason)) return "plan";
  return "other";
}

/** Earned (in), spent (out), or free (a company opened for no credits, a fact added past the day's cap). */
export type Tone = "earned" | "spent" | "free";
export const toneOf = (l: LedgerRow): Tone => (l.delta > 0 ? "earned" : l.delta < 0 ? "spent" : "free");

/** "+2", "−1", "Free" (a 0 line). */
export const deltaWords = (l: LedgerRow) => (l.delta > 0 ? `+${l.delta}` : l.delta < 0 ? `−${-l.delta}` : "Free");

/* ---------- running balance ---------- */

/**
 * The balance after each line, newest first, worked back from today's (below 0 while credits are
 * owed), and the balance before the oldest line (the starting credits when nothing is missing).
 */
export function withBalance<T extends LedgerRow>(ledger: T[], credits: number, owed = 0): { rows: { l: T; after: number }[]; opening: number } {
  let bal = credits - owed;
  const rows = ledger.map((l) => {
    const after = bal;
    bal -= l.delta;
    return { l, after };
  });
  return { rows, opening: bal };
}

/* ---------- earned and spent ---------- */

export interface KindSum {
  kind: Kind;
  label: string;
  earned: number;
  spent: number;
  /** Lines of this kind, a free one included. */
  lines: number;
  /** Lines that moved no credits (companies opened free). */
  free: number;
}

/** Earned and spent by kind, the kinds with a line only, most credits moved first; Other last. */
export function byKind(ledger: Line[]): KindSum[] {
  const m = new Map<Kind, KindSum>();
  for (const l of ledger) {
    const k = kindOf(l);
    const s = m.get(k) ?? { kind: k, label: KIND_LABEL[k], earned: 0, spent: 0, lines: 0, free: 0 };
    if (l.delta > 0) s.earned += l.delta;
    else if (l.delta < 0) s.spent -= l.delta;
    else s.free++;
    s.lines++;
    m.set(k, s);
  }
  return [...m.values()].sort((a, b) => (a.kind === "other" ? 1 : b.kind === "other" ? -1 : b.earned + b.spent - (a.earned + a.spent) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind)));
}

/** Totals over lines: earned, spent, and companies opened free. */
export function totals(ledger: LedgerRow[]): { earned: number; spent: number; free: number } {
  let earned = 0;
  let spent = 0;
  let free = 0;
  for (const l of ledger) {
    if (l.delta > 0) earned += l.delta;
    else if (l.delta < 0) spent -= l.delta;
    else free++;
  }
  return { earned, spent, free };
}

const DAY = 86_400_000;
/** Monday 00:00 (local) of the week a time falls in. */
const weekStart = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 6) % 7;
  return d.getTime() - back * DAY;
};

export interface Bucket {
  /** "This week", "Nov 9" (the week's Monday), "Today", "Tue 17". */
  label: string;
  from: number;
  earned: number;
  spent: number;
  /** The balance at the end of it (now, for the current one). */
  bal: number;
}

/**
 * Earned and spent over the last `n` weeks (or days), oldest first, from the ledger alone, with the
 * balance at the end of each. Buckets before the member's first line are left out, so a new member
 * sees only this week.
 */
export function buckets(ledger: LedgerRow[], credits: number, owed: number, nowMs: number, by: "week" | "day" = "week", n = by === "week" ? 5 : 7): Bucket[] {
  const startOf = by === "week" ? weekStart : (ms: number) => new Date(new Date(ms).setHours(0, 0, 0, 0)).getTime();
  const step = by === "week" ? 7 * DAY : DAY;
  const cur = startOf(nowMs);
  const first = ledger.length ? startOf(Math.min(...ledger.map((l) => Date.parse(l.at)))) : cur;
  const out: Bucket[] = [];
  let bal = credits - owed;
  for (let k = 0; k < n; k++) {
    const from = cur - k * step;
    // Day lengths move with daylight saving: a day bucket ends at the next day's midnight.
    const to = k === 0 ? Infinity : by === "day" ? startOf(from + step + 3 * 3_600_000) : from + step;
    const inIt = ledger.filter((l) => {
      const t = Date.parse(l.at);
      return t >= from && t < to;
    });
    const t = totals(inIt);
    const d = new Date(from);
    const label = k === 0 ? (by === "week" ? "This week" : "Today") : by === "week" ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
    out.push({ label, from, earned: t.earned, spent: t.spent, bal });
    bal -= t.earned - t.spent;
    if (from <= first) break;
  }
  return out.reverse();
}

/* ---------- the ledger's filters ---------- */

export type LedgerFilter = "all" | Tone;
export function filterLedger<T extends LedgerRow>(rows: { l: T; after: number; text: string }[], filter: LedgerFilter, q: string) {
  const want = q.trim().toLowerCase();
  return rows.filter((r) => (filter === "all" || toneOf(r.l) === filter) && (!want || `${r.text} ${r.l.company}`.toLowerCase().includes(want)));
}

/* ---------- the rules, in three lines and in full ---------- */

/** The three lines: start, spend to see, earn by adding. From Me and the plan. */
export function threeLines(me: Pick<Me, "earnCap" | "proOpens" | "crystal">, starter: number): { n: string; t: string; s: string }[] {
  const opens = me.proOpens
    ? ` Companies open free, up to ${PRO_OPENS_DAILY} a day, on your plan.`
    : me.crystal === "one" || me.crystal === "used"
      ? ` On Free, one ${FEATURE_NAME} company a day opens free.`
      : "";
  return [
    { n: String(starter), t: `You start with ${starter} credits.`, s: "They are yours and they do not expire." },
    { n: "−", t: "You spend to see.", s: `A company is ${COMPANY_PRICE} credits and a fact is 1.${opens}` },
    { n: "+1", t: "You earn by adding.", s: `Each fact Merlin does not have earns 1 credit, up to ${me.earnCap} a day.` },
  ];
}

/* ---------- ways to earn ---------- */

export interface Way {
  id: "seatRates" | "seat" | "fact" | "rate" | "invite" | "confirm" | "lead" | "plan" | "topup";
  title: string;
  /** "+1 each", "+10 each". */
  reward: string;
  /** Earned by doing (volt), or bought (quiet). */
  earns: boolean;
  what: string;
  /** Where the member stands on it, from their own numbers. */
  status: string;
  go: string;
}

/**
 * Every way to earn, each with its credit, from the rules (lib/tableFields.ts, lib/peersCore.ts)
 * and where the member stands from their own Me. `seatsNoRate`: their seats with no rate yet.
 * The paid ways (a plan's monthly credits, the top-up) only while billing is live and set up.
 */
export function waysToEarn(
  me: Pick<Me, "earned24h" | "earnCap" | "added" | "invited" | "invitesPaid" | "benchRates" | "plan">,
  o: { seatsNoRate: number; seats: number },
): Way[] {
  const room = Math.max(0, me.earnCap - me.earned24h);
  const today = room ? `${room} of ${me.earnCap} left to earn today` : `You have earned ${me.earnCap} today. You can earn again tomorrow`;
  const ways: Way[] = [];
  if (o.seatsNoRate > 0)
    ways.push({
      id: "seatRates",
      title: `Add the rate to ${o.seatsNoRate === 1 ? "your seat" : `${o.seatsNoRate} of your seats`}`,
      reward: o.seatsNoRate === 1 ? "+1" : `+${o.seatsNoRate}`,
      earns: true,
      what: "A seat of yours has no rate yet. A rate on your seat earns 1 credit, and a member spends 1 to see it.",
      status: today,
      go: "Add the rates",
    });
  ways.push(
    { id: "seat", title: "Add a seat you have held", reward: "+1 an answer", earns: true, what: "Each answer on a seat you held earns 1 credit: the role, the dates, the hours, the rate. The seat also becomes a way in.", status: o.seats ? `${o.seats} ${o.seats === 1 ? "seat" : "seats"} of yours on file` : "No seat of yours on file yet", go: "Add a seat" },
    { id: "fact", title: "Add a fact Merlin does not have", reward: "+1 each", earns: true, what: "A company's size, its HQ, a hiring contact. Only 5 answers a day about industry, size, revenue or how they sell earn a credit.", status: `${me.added.toLocaleString("en-US")} ${me.added === 1 ? "fact" : "facts"} added so far · ${today}`, go: "Add what you know" },
    { id: "rate", title: "Share a rate privately", reward: "+1", earns: true, what: "A rate for the benchmarks only. It is never shown with your name or the seat, and it places you on the chart.", status: me.benchRates.length ? `${me.benchRates.length} shared so far` : "None shared yet", go: "Rate benchmarks" },
    {
      id: "invite",
      title: "Invite a fractional you would vouch for",
      reward: `+${REFERRAL_BONUS} each`,
      earns: true,
      what: `You both get ${REFERRAL_BONUS} credits when they add their first fact to a company or a seat. Up to ${REFERRAL_LIMIT} invite bonuses every 30 days.`,
      status: me.invited ? `${me.invited} joined from your link${me.invitesPaid ? `, ${me.invitesPaid} added a first fact` : ""}` : "Nobody invited yet",
      go: "Copy invite link",
    },
    { id: "confirm", title: "Get a fact confirmed", reward: "+1", earns: true, what: "When two other members confirm a fact you added, you earn 1 more.", status: me.added ? "Starts as members confirm what you added" : "Starts once you have added a fact", go: "See your seats" },
    { id: "lead", title: "Pass a lead you cannot take", reward: `+${PASS_CREDIT}`, earns: true, what: "Send a company to a fractional who fits. You earn when they pick it up.", status: "On a company's record or from Fractionals", go: "Find a fractional" },
  );
  const plan = me.plan;
  if (plan) {
    ways.push({ id: "plan", title: `Pro and Close add ${plan.prices.proCredits} credits a month`, reward: `${plan.prices.proCredits} a month`, earns: false, what: "They arrive with each paid month, on top of what you earn.", status: plan.name === "pro" ? "Yours with each paid month" : plan.name === "trial" ? "Not part of the trial. They start with your first paid month" : "On Pro and Close", go: "See the plans" });
    if (plan.topup) ways.push({ id: "topup", title: `Buy ${plan.prices.topupCredits} credits`, reward: `$${plan.prices.topup}, once`, earns: false, what: "On any plan. They do not expire.", status: "Checkout opens on Stripe, where your card is kept. Merlin never sees it", go: `Buy ${plan.prices.topupCredits} credits` });
  }
  return ways;
}

/** "Up to 25 a day, bonuses included": the cap that holds every way that earns. */
export const CAP_LINE = `You can earn up to ${EARN_CAP} credits in any 24 hours, bonuses included. A bonus past that is held and paid as soon as you have room. What you add past the limit still saves.`;
