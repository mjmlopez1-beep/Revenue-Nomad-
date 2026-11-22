/**
 * "When to follow up", by rules, pure: what the reading says, in plain words, with a one-line why
 * and a short email to start from. No model is called: the same facts always give the same advice.
 *
 * In order (the first that holds wins):
 *   signed, declined, expired      the link's own end
 *   options / pricing              they read the pricing in PRICING_VISITS visits or more (options: and
 *                                  looked at two of them): they're weighing it, follow up within a day
 *   new_reader                     someone new opened it in the last NEW_READER_DAYS days
 *   quiet                          opened, then nothing for QUIET_DAYS days
 *   opened_not_signed              first opened OPENED_DAYS days ago or more, not signed
 *   not_opened                     sent NOT_OPENED_DAYS days ago, never opened (the day 2 reminder covers it while it's on)
 *   wait                           nothing to do yet
 * `engaged` marks the ones worth an alert (lib/close/server.ts sends at most one per item every 6 hours).
 */
import { agoWords, andList, addonsOn, firstName, lastActivity, minSentence, optionsLooked, ordinal, pricingVisits, totalVisits } from "./activity";
import type { ItemActivity, Suggestion } from "./types";

const DAY = 86_400_000;
export const RULES = { PRICING_VISITS: 2, NEW_READER_DAYS: 3, QUIET_DAYS: 5, OPENED_DAYS: 3, NOT_OPENED_DAYS: 2, ENGAGED_EVERY_MS: 6 * 3_600_000 } as const;
/** The rules an engaged alert goes out for (a new reader has its own alert). */
export const ENGAGED_KEYS = ["options", "pricing", "quiet", "opened_not_signed"] as const;

export interface RuleInput {
  a: ItemActivity | null | undefined;
  status: "draft" | "sent" | "viewed" | "signed" | "declined" | "void" | "expired";
  sentAt: string | null;
  signer: string | null;
  company: string;
  /** The day 2 reminder is on and hasn't gone yet. */
  reminderComing: boolean;
  declineReason?: string | null;
  nowMs: number;
}

const days = (from: string | null, nowMs: number) => Math.floor((nowMs - Date.parse(from ?? "")) / DAY);

export function suggest(x: RuleInput): Suggestion | null {
  const first = firstName(x.signer) || "there";
  const a = x.a ?? null;
  if (x.status === "draft" || x.status === "void") return null;
  if (x.status === "signed") return null;
  if (x.status === "declined")
    return {
      key: "declined",
      when: "Ask what would work",
      headline: "They declined",
      points: x.declineReason ? [`Their reason: ${x.declineReason}`] : [],
      why: "A no to this version is often a yes to a smaller scope or a later start.",
      draft: `Hi ${first}, thanks for letting me know. Is there a version of this that would work, a smaller scope or a later start?`,
      engaged: false,
    };
  if (x.status === "expired")
    return { key: "expired", when: "Send it again", headline: "The link expired", points: [], why: "It wasn't signed before the link closed. Send it again for a new link.", draft: null, engaged: false };

  const readers = a?.readers ?? [];
  const opened = readers.length > 0;
  const others = readers.filter((r) => !r.signer);
  const lastAt = a ? lastActivity(a) : null;
  const visits = a ? totalVisits(a) : 0;
  const pv = a ? pricingVisits(a) : { n: 0, lastAt: null, lastMs: 0, label: "Pricing", lastN: 0 };
  const looked = a ? optionsLooked(a) : [];
  const adds = a ? addonsOn(a) : [];
  const newest = [...others].sort((p, q) => q.firstAt.localeCompare(p.firstAt))[0];
  const readerLine = newest ? `${others.length === 1 ? "A second person" : `${others.length} more people`} opened it ${agoWords(newest.firstAt, x.nowMs)}` : null;

  // They keep coming back to the price.
  if (a && pv.n >= RULES.PRICING_VISITS && pv.lastAt && x.nowMs - Date.parse(pv.lastAt) < 7 * DAY) {
    const soon = x.nowMs - Date.parse(pv.lastAt) < 12 * 3_600_000;
    const when = soon ? "Follow up tomorrow morning" : "Follow up today";
    const nth = ordinal(pv.lastN || visits);
    const visitLine = `${nth[0].toUpperCase()}${nth.slice(1)} visit ${agoWords(pv.lastAt, x.nowMs)}, ${minSentence(pv.lastMs)} on ${pv.label}`;
    if (looked.length >= 2) {
      const [o1, o2] = looked;
      const picks = looked.filter((o) => o.picks > 0);
      const pickLine = picks.length >= 2 ? `Picked ${andList(picks.slice(0, 3).map((o) => `${o.label} ${o.picks === 1 ? "once" : o.picks === 2 ? "twice" : `${o.picks} times`}`))}` : `Compared ${o1.label} and ${o2.label}`;
      return {
        key: "options",
        when,
        headline: `They're deciding between ${o1.label} and ${o2.label}`,
        points: [visitLine, `${pickLine}${adds.length ? `, and added ${andList(adds)}` : ""}`, ...(readerLine ? [readerLine] : [])],
        why: "They're weighing scope, not saying no.",
        draft: `Hi ${first}, happy to walk through ${o1.label} and ${o2.label} in 15 minutes so you can pick the one that fits. Would a short call this week help?`,
        engaged: true,
      };
    }
    return {
      key: "pricing",
      when,
      headline: pv.n === 2 ? `They read the ${pv.label.toLowerCase()} twice` : "They're back on pricing",
      points: [visitLine, ...(adds.length ? [`Added ${andList(adds)}`] : []), ...(readerLine ? [readerLine] : [])],
      why: "Coming back to the price usually means they're working out the budget, not saying no.",
      draft: `Hi ${first}, happy to walk through the pricing and scope in 15 minutes. Would a short call this week help?`,
      engaged: true,
    };
  }
  // Someone new: probably forwarded to whoever else decides.
  if (newest && x.nowMs - Date.parse(newest.firstAt) < RULES.NEW_READER_DAYS * DAY) {
    return {
      key: "new_reader",
      when: "Follow up today",
      headline: "Someone new is reading it",
      points: [readerLine!, ...(visits > 1 ? [`${visits} visits in all`] : [])],
      why: `${first === "there" ? "They" : first} may have shared it with someone who has a say.`,
      draft: `Hi ${first}, glad this is moving. Happy to walk you and anyone else involved through it in 15 minutes. Would this week work?`,
      engaged: false,
    };
  }
  if (opened && lastAt && days(lastAt, x.nowMs) >= RULES.QUIET_DAYS) {
    const n = days(lastAt, x.nowMs);
    return {
      key: "quiet",
      when: "Check in today",
      headline: "It's gone quiet",
      points: [`Last opened ${agoWords(lastAt, x.nowMs)}`, `${visits} ${visits === 1 ? "visit" : "visits"} in all`],
      why: `No one has opened it in ${n} days.`,
      draft: `Hi ${first}, checking in on the proposal. Is this still a priority? If the timing has moved, tell me and I'll adjust the start date.`,
      engaged: true,
    };
  }
  const firstOpen = readers.map((r) => r.firstAt).sort()[0] ?? null;
  if (opened && firstOpen && days(firstOpen, x.nowMs) >= RULES.OPENED_DAYS) {
    const n = days(firstOpen, x.nowMs);
    return {
      key: "opened_not_signed",
      when: "Follow up today",
      headline: "They opened it but haven't signed",
      points: [`First opened ${n} days ago`, `Last opened ${agoWords(lastAt, x.nowMs)}`],
      why: `Opened ${n} days ago and not signed yet. A short note now keeps it moving.`,
      draft: `Hi ${first}, checking in on the proposal. Is there anything you'd like changed before you sign? Happy to talk it through.`,
      engaged: true,
    };
  }
  if (!opened && x.sentAt && days(x.sentAt, x.nowMs) >= RULES.NOT_OPENED_DAYS) {
    if (x.reminderComing)
      return { key: "not_opened", when: "No need yet", headline: "Not opened yet", points: [`Sent ${agoWords(x.sentAt, x.nowMs)}`], why: "Merlin reminds them today.", draft: null, engaged: false };
    return {
      key: "not_opened",
      when: "Follow up today",
      headline: "They haven't opened it",
      points: [`Sent ${agoWords(x.sentAt, x.nowMs)}`],
      why: `Sent ${days(x.sentAt, x.nowMs)} days ago and not opened. It may be in their spam.`,
      draft: `Hi ${first}, I sent the proposal over a few days ago. Could you check it reached you? It may have landed in spam.`,
      engaged: false,
    };
  }
  return opened
    ? { key: "wait", when: "No need to follow up yet", headline: "They're reading it", points: [`Opened ${agoWords(firstOpen, x.nowMs)}`], why: "Give them a day or two before you follow up.", draft: null, engaged: false }
    : { key: "wait", when: "No need to follow up yet", headline: "Sent, not opened yet", points: x.sentAt ? [`Sent ${agoWords(x.sentAt, x.nowMs)}`] : [], why: "Most people open it within a day.", draft: null, engaged: false };
}

/**
 * Should an engaged alert go out now for this suggestion? `wait` when it should but the last one
 * was under 6 hours ago. A rule already told goes out again only after a new visit.
 */
export function engagedDue(a: ItemActivity, s: Suggestion | null, nowMs: number): "send" | "wait" | null {
  if (!s?.engaged || !(ENGAGED_KEYS as readonly string[]).includes(s.key)) return null;
  const visits = totalVisits(a);
  if (a.alerts.engagedKey === s.key && (a.alerts.engagedVisits ?? 0) >= visits) return null;
  const last = Date.parse(a.alerts.engagedAt ?? "");
  if (Number.isFinite(last) && nowMs - last < RULES.ENGAGED_EVERY_MS) return "wait";
  return "send";
}
