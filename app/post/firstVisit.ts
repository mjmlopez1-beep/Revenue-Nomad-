/**
 * First visits in the new look (BUILD_PLAN F6), as pure data so scripts/test-firstvisit.mts checks
 * them with no browser: for each page, whether the member has none of their own data for it yet,
 * the one line that says what the page is for (the dismissible strip, shell/PageStrip.tsx), and
 * the Getting started step it moves them toward.
 *
 * A page is on its first visit while the member has nothing of their own there (own === 0). What
 * counts as their own comes from Me and the view (ownOf below), or from the page itself where only
 * it knows (a page passes its own count). Unknown (null) is never a first visit: a strip never
 * shows on a guess. Dismissed strips are Profile.stripsOff (lib/ui2.ts), so a second device agrees.
 */
import type { Me, View } from "@/lib/tableTypes";
import { planName } from "@/lib/billing/rules";

/**
 * Home's first visit names the member's plan as it is: the trial with its days left, or the paid
 * plan by name (Pro or Close), never "Your trial is on" for a member who pays. Billing off: nothing.
 */
export function planLine(plan: Me["plan"]): string {
  if (!plan) return "";
  if (plan.name === "trial") return `Your trial is on${plan.trialDaysLeft ? ` for ${plan.trialDaysLeft} more ${plan.trialDaysLeft === 1 ? "day" : "days"}` : ""}. `;
  if (plan.name === "pro") return `You're on ${planName(plan)}. `;
  return "";
}
import type { SixKey } from "./getStarted";
import { icpEmpty } from "./model";

/** Each page's strip: what it is for and the two or three things you do there, and its step. */
export const STRIPS: Record<string, { text: string; step?: SixKey }> = {
  home: { text: "Your day starts here. Work through what is due and open your lists. Until you have deals of your own, Getting started is your list for today.", step: "icp" },
  find: { text: "Look across every company, person, seat and open role Merlin holds. Pick filters, see the count, and save what you find as a list.", step: "alert" },
  companies: { text: "Your table of companies that hire fractionals. Open one to see its name, add columns such as who decides, and save the list so Merlin watches it.", step: "open" },
  people: { text: "The decision makers and leaders at the companies Merlin holds. A name and title open together for 1 credit, once the company is open.", step: "network" },
  seats: { text: "Every fractional seat on file: who held it, when, and what it paid. Add the seats you held and earn credits for each fact Merlin does not have.", step: "seat" },
  radar: { text: "Companies likely to hire a fractional like you soon, ranked by their signals. On the trial any company here opens free.", step: "open" },
  hiring: { text: "Fractional roles open right now, newest first. Open one to see the posting and the rate when it was posted, or refer it to a peer who fits.", step: "alert" },
  warm: { text: "Who can get you into which company, from the people you know and the seats you held. Merlin reads names and companies, never message text.", step: "network" },
  pipeline: { text: "Your deals, from target to won. Merlin moves a deal when it sees a reply or a meeting, and tells you who needs a follow-up.", step: "open" },
  proposals: { text: "Proposals drafted from a call or a template, sent for signature, with alerts when the client opens one.", step: "open" },
  contracts: { text: "Send any agreement for signature. Drop a PDF, Merlin places the fields, and you see who signed and when.", step: "open" },
  fractionals: { text: "The fractional directory, free on every plan. Message a fractional, refer a company to a peer, or team up on a client.", step: "seat" },
  messages: { text: "Your conversations with other fractionals. Referrals for you and team-up asks show here too.", step: "network" },
  alerts: { text: "Every email and Slack alert Merlin sends you, and how often. Save a list with an alert and Merlin watches it for you.", step: "alert" },
  agent: { text: "Use Merlin from your own agent, such as Claude, through the Merlin connector. Your agent sees what you see and asks before it spends.", step: "network" },
  rates: { text: "What fractionals charge, by function and company size, from rates members shared. Add your own privately to see where you sit.", step: "seat" },
  credits: { text: "Your balance and every credit in and out. You earn a credit for each fact Merlin does not have, up to 25 a day.", step: "seat" },
  settings: { text: "Your connections, your ideal client, notifications and your data, in one place.", step: "icp" },
};

/** What a page holds of the member's own, as far as Me and the view say (null: only the page knows). */
export function ownOf(page: string, me: Me, view?: Pick<View, "ledger">, extra: { seats?: number; pipeline?: number | null } = {}): number | null {
  switch (page) {
    case "home":
      return me.added + me.unlocked;
    case "companies":
    case "radar":
    case "hiring":
      return (me.companiesUnlocked ?? 0) + (me.holdersUnlocked ?? 0);
    case "find":
      return (me.savedViews ?? []).length;
    case "seats":
      return extra.seats ?? null;
    case "warm":
    case "people":
      return me.started?.network ? 1 : 0;
    case "pipeline":
      return extra.pipeline ?? null;
    case "alerts":
      return (me.savedViews ?? []).filter((v) => v.email).length;
    case "rates":
      return (me.benchRates ?? []).length;
    case "credits":
      return view ? view.ledger.length : null;
    case "settings":
      return icpEmpty(me.icp) ? 0 : 1;
    default:
      return null;
  }
}

export interface FirstOf {
  /** None of the member's own data here yet. */
  first: boolean;
  /** The strip's line, while it shows (first visit, not dismissed); else null. */
  strip: string | null;
  /** The Getting started step this page moves them toward. */
  step: SixKey | null;
}

/** A page's first visit: `own` is what it holds of theirs (null unknown), `off` the strips they dismissed. */
export function firstOf(page: string, own: number | null, off: readonly string[] = []): FirstOf {
  const s = STRIPS[page];
  const first = own === 0;
  return { first, strip: first && s && !off.includes(page) ? s.text : null, step: s?.step ?? null };
}
