/**
 * Billing's emails: the value receipt 3 days before the trial ends (day 18 of 21, with Keep Pro, in place of a countdown), the last-day note, the value receipt when the
 * trial ends (with the annual plan first), and the value receipt at each renewal. Counts only:
 * never another member's name, never a company the member hasn't unlocked.
 *
 * A member who said "Not now" to "Are you looking for a new client?" gets the soft form: staying
 * on Free is a fine answer, a pause is there, and nothing pushes.
 */
import { MAIL, escHtml, footerNote, mailButton, mailH, mailList, mailP, mailShell, oneLine } from "../email";
import { PRICES, PRO_STORY, TOPUP_CREDITS } from "./rules";
import { COMPANY_PRICE_SAY, functionOf } from "../tableFields";
import { FEATURE_NAME } from "../radar/types";

/** What a member got in a period, as counts. */
export interface ValueCounts {
  conversations: number;
  invites: number;
  unlocks: number;
  /** New open roles in their function while they were on Pro. */
  roles: number;
  function: string | null;
  /** Companies they opened for no credits (Pro's free opens, Crystal Ball's, the free one of the day). */
  companiesFree?: number;
  /** Notes that went out: deals that reached Sent in their pipeline. */
  notes?: number;
  /** Proposals of theirs out for signature now (sent, not signed, declined, voided or expired). */
  proposalsOut?: number;
  /** Their saved views now (the second and later stop emailing on Free). */
  savedViews?: number;
}

/** The parts of the state the counts read (lib/table.ts State). */
interface CountState {
  profiles: Record<string, { function?: string; title?: string }>;
  conversations?: { a: string; createdAt: string }[];
  seatInvites?: { by: string; at: string }[];
  ledger: { memberId: string; reason: string; at: string; ref?: string; delta?: number }[];
  pipeline?: Record<string, { entries: { dates: { sent?: string } }[] }>;
  proposals?: { memberId: string; sends: { sentAt: string; expiresAt: string; signed?: unknown; declined?: unknown; voided?: unknown }[] }[];
  connector?: { alerts?: Record<string, unknown[]> };
}

/** What a member got between two times: conversations they opened, intros they sent, unlocks, new roles in their function. */
export function valueCounts(s: CountState, seedTracks: Map<string, { firstSeen: string; engagementId: string }> | null, fnOfEng: ((engId: string) => string | null) | null, memberId: string, fromIso: string, toIso: string): ValueCounts {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const inside = (iso?: string | null) => {
    const t = Date.parse(iso ?? "");
    return Number.isFinite(t) && t >= from && t < to;
  };
  const prof = s.profiles[memberId] ?? {};
  const fn = prof.function ?? functionOf(prof.title ?? "") ?? null;
  let roles = 0;
  if (seedTracks && fnOfEng && fn)
    for (const t of seedTracks.values()) if (inside(t.firstSeen) && fnOfEng(t.engagementId) === fn) roles++;
  return {
    conversations: (s.conversations ?? []).filter((c) => c.a === memberId && inside(c.createdAt)).length,
    invites: (s.seatInvites ?? []).filter((x) => x.by === memberId && inside(x.at)).length,
    unlocks: s.ledger.filter((l) => l.memberId === memberId && l.reason === "unlock" && inside(l.at)).length,
    roles,
    function: fn,
    companiesFree: s.ledger.filter((l) => l.memberId === memberId && l.reason === "unlock" && l.delta === 0 && !!l.ref?.endsWith(".identity") && inside(l.at)).length,
    notes: (s.pipeline?.[memberId]?.entries ?? []).filter((e) => inside(e.dates?.sent)).length,
    proposalsOut: (s.proposals ?? []).filter((p) => {
      if (p.memberId !== memberId) return false;
      const x = p.sends[p.sends.length - 1];
      return !!x && !x.signed && !x.declined && !x.voided && Date.parse(x.expiresAt) > to;
    }).length,
    savedViews: (s.connector?.alerts?.[memberId] ?? []).length,
  };
}

/**
 * The trial's end as a loss in plain terms: what they used in it, and what locks when it ends.
 * `days`: whole days left (1: it ends tomorrow). "You opened 16 companies free and sent 3 notes;
 * 1 proposal is out." and "Tomorrow companies cost 2 credits again and your second saved view stops emailing."
 */
export function trialSummary(v: ValueCounts, days: number): { used: string | null; locks: string } {
  const did: string[] = [];
  if (v.companiesFree) did.push(`opened ${plural(v.companiesFree, "company", "companies")} free`);
  if (v.notes) did.push(`sent ${plural(v.notes, "note")}`);
  const out = v.proposalsOut ? `${plural(v.proposalsOut, "proposal")} ${v.proposalsOut === 1 ? "is" : "are"} out` : "";
  const used = did.length ? `You ${did.join(" and ")}${out ? `; ${out}` : ""}.` : out ? `${out.charAt(0).toUpperCase()}${out.slice(1)}.` : null;
  const when = days <= 1 ? "Tomorrow" : `In ${days} days`;
  const views = (v.savedViews ?? 0) >= 2 ? ` and your ${v.savedViews === 2 ? "second saved view stops" : "saved views after the first stop"} emailing` : "";
  return { used, locks: `${when} companies cost ${COMPANY_PRICE_SAY} again${views}.` };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The receipt's lines, only the ones with something in them. */
export function valueLines(v: ValueCounts): string[] {
  const out: string[] = [];
  if (v.roles) out.push(`${plural(v.roles, `new open ${v.function ? `${v.function} ` : ""}role`)} as they opened`);
  if (v.unlocks) out.push(`${plural(v.unlocks, "unlock")} used`);
  if (v.conversations) out.push(`${plural(v.conversations, "conversation")} opened`);
  if (v.invites) out.push(`${plural(v.invites, "intro")} sent`);
  return out;
}

const listHtml = (lines: string[]) => mailList(lines);

const WHY = "You get this because you're a Merlin member with a plan. Merlin is a data exchange for fractional operators, from Revenue Nomad.";

function shell(subject: string, lead: string, bodyParts: string[], link: string) {
  const note = footerNote();
  return mailShell({ title: subject, preheader: lead.slice(0, 120), body: bodyParts.join("\n"), link, art: "plan", footer: [escHtml(WHY), note ? escHtml(note) : ""] });
}

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
/** Pro framed by return, as the landing page says it. */
export const ONE_CLIENT = "One client pays for years of Pro.";

/** The annual line first, then monthly. `rateLine`: "Less than an hour of your time a month." when their rate says so. */
const priceWords = (rateLine: string | null) =>
  `Pro is $${PRICES.year} a year, which is 2 months free, or $${PRICES.month} a month. Pro + Close, with proposals sent and signed, is $${PRICES.closeYear} a year or $${PRICES.closeMonth} a month.${rateLine ? ` ${rateLine}` : ""}`;

/** The trial ends in `days` days (3, or 1 on the last day). */
export function trialEndingEmail(o: { first: string; days: number; notLooking: boolean; rateLine: string | null; link: string }) {
  const first = oneLine(o.first).slice(0, 40) || "there";
  const when = o.days <= 1 ? "tomorrow" : `in ${o.days} days`;
  const subject = o.days <= 1 ? "Your Pro trial ends tomorrow" : `Your Pro trial ends in ${o.days} days`;
  const link = oneLine(o.link);
  const lead = o.notLooking
    ? `Nothing to do: when it ends you stay on Free, with your saved view and the weekly email. No card, no charge.`
    : `After that you're on Free, unless you keep Pro. Pro is how you win the client: ${lowerFirst(PRO_STORY)}`;
  const offer = o.notLooking ? `If your book fills up again later, Pro is a click away.` : `${priceWords(o.rateLine)} ${ONE_CLIENT}`;
  const text = [`Hi ${first},`, "", `Your Merlin Pro trial ends ${when}.`, "", lead, "", offer, "", link, "", "--", WHY].join("\n");
  const html = shell(subject, lead, [mailP(`Hi ${escHtml(first)},`), mailH(escHtml(subject)), mailP(escHtml(lead)), mailP(escHtml(offer), "margin-bottom:24px;"), mailButton(link, o.notLooking ? "Open Merlin" : "Keep Pro", "margin:0 0 8px")], link);
  return { subject, text, html };
}

/**
 * The value receipt before the decision: 3 days before the trial ends (day 18 of 21), what it gave
 * them so far, then Keep Pro. It takes the place of the 3-day note, so there is one email, not two.
 */
export function trialReceiptEmail(o: { first: string; days: number; counts: ValueCounts; rateLine: string | null; link: string }) {
  const first = oneLine(o.first).slice(0, 40) || "there";
  const lines = valueLines(o.counts);
  const subject = `Your Pro trial ends in ${o.days} days`;
  const link = oneLine(o.link);
  const lead = lines.length ? "Here's what your trial gave you so far:" : `Your trial is still yours for a few days. ${PRO_STORY}`;
  // The loss in plain terms: what they used, and what locks when it ends.
  const sum = trialSummary(o.counts, o.days);
  const loss = [sum.used, sum.locks].filter(Boolean).join(" ");
  const after = `After it ends you're on Free, unless you keep Pro. Pro is how you win the client: ${lowerFirst(PRO_STORY)} ${priceWords(o.rateLine)} ${ONE_CLIENT}`;
  const text = [`Hi ${first},`, "", lead, ...(lines.length ? lines.map((l) => `- ${l}`) : []), "", loss, "", after, "", link, "", "--", WHY].join("\n");
  const html = shell(
    subject,
    lead,
    [
      mailP(`Hi ${escHtml(first)},`),
      mailH(escHtml(subject)),
      mailP(escHtml(lead), lines.length ? "margin-bottom:8px;" : ""),
      ...(lines.length ? [listHtml(lines)] : []),
      mailP(escHtml(loss), "font-weight:700;"),
      mailP(escHtml(after), "margin-bottom:24px;"),
      mailButton(link, "Keep Pro", "margin:0 0 8px"),
    ],
    link,
  );
  return { subject, text, html };
}

/** The trial ended: what it gave them, then the annual plan first (or, not looking, nothing to push). */
export function trialEndedEmail(o: { first: string; counts: ValueCounts; notLooking: boolean; rateLine: string | null; link: string }) {
  const first = oneLine(o.first).slice(0, 40) || "there";
  const lines = valueLines(o.counts);
  const subject = "Your Pro trial is over";
  const link = oneLine(o.link);
  const lead = `You're on Free now. Your credits, your saved view and the weekly email stay, and one ${FEATURE_NAME} company a day opens free, with everything on it. Nothing was charged.`;
  const got = lines.length ? "In your trial:" : null;
  const offer = o.notLooking
    ? "Not looking for a client right now? Free is the right plan. Pro is here when you are."
    : `Pro is how you win the client: ${lowerFirst(PRO_STORY)} ${priceWords(o.rateLine)} ${ONE_CLIENT} Credits run out? ${TOPUP_CREDITS} more are $${PRICES.topup}, once.`;
  const text = [`Hi ${first},`, "", lead, "", ...(got ? [got, ...lines.map((l) => `- ${l}`), ""] : []), offer, "", link, "", "--", WHY].join("\n");
  const html = shell(
    subject,
    lead,
    [mailP(`Hi ${escHtml(first)},`), mailH(subject), mailP(escHtml(lead)), ...(got ? [mailP(escHtml(got), "margin-bottom:8px;font-weight:700;"), listHtml(lines)] : []), mailP(escHtml(offer), "margin-bottom:24px;"), mailButton(link, o.notLooking ? "Open Merlin" : "See the yearly plan", "margin:0 0 8px")],
    link,
  );
  return { subject, text, html };
}

/** A renewal: what the last period gave them. */
export function renewalEmail(o: { first: string; counts: ValueCounts; interval: "month" | "year"; link: string }) {
  const first = oneLine(o.first).slice(0, 40) || "there";
  const lines = valueLines(o.counts);
  const subject = o.interval === "year" ? "Your year on Merlin Pro" : "Your month on Merlin Pro";
  const link = oneLine(o.link);
  const lead = `Pro renewed. Here's what the last ${o.interval} gave you.`;
  const none = "A quiet stretch. Pro keeps watching your markets, and a pause is there in Plan and billing if your book is full.";
  const text = [`Hi ${first},`, "", lead, "", ...(lines.length ? lines.map((l) => `- ${l}`) : [none]), "", link, "", "--", WHY].join("\n");
  const html = shell(subject, lead, [mailP(`Hi ${escHtml(first)},`), mailH(subject), mailP(escHtml(lead)), lines.length ? listHtml(lines) : mailP(escHtml(none)), mailButton(link, "Open Merlin", "margin:0 0 8px")], link);
  return { subject, text, html };
}
