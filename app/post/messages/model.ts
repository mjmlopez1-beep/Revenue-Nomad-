/**
 * Messages in the new look (Messages.dc.html), the words and the sorting: what kind of
 * conversation each one is, the filters with their counts, the search, and the lines the list,
 * the header and the conversation say. Pure: no React, no I/O.
 *
 * The kind is read from what Merlin already has, never stored:
 *   Intro request   a conversation about a seat with an intro logged on it (Your pipeline's intros)
 *   Question        a conversation about a seat with no intro logged
 *   Referral        a conversation between fellow fractionals that a company was referred in (Peers' referrals)
 *   Team up         a team's shared thread
 *   Fellow fractional  a conversation about no seat (from the Fractionals directory)
 *   Invite claimed  opened by itself when a fractional claimed their seat through the member's invite
 * A company is named only as the server sent it: a locked one reads as its free facts, never a guess.
 */
import type { ConversationRec } from "@/lib/tableTypes";
import type { LeadRec } from "@/lib/peersCore";
import type { IntroRec } from "@/lib/pipeline";
import type { ReplyKind } from "@/lib/messagesDraft";
import { HIDDEN_COMPANY } from "@/lib/tableFields";

export type Kind = ReplyKind;

export const KINDS: Record<Kind, { label: string; tint: string }> = {
  intro: { label: "Intro request", tint: "#E8F3EE" },
  lead: { label: "Referral", tint: "#FFE7A8" },
  q: { label: "Question", tint: "#E3E8F7" },
  team: { label: "Team up", tint: "#F3E8F5" },
  peer: { label: "Fellow fractional", tint: "#DDF0F7" },
  invite: { label: "Invite claimed", tint: "#FBE3D6" },
};

/** What the list knows about each conversation beyond the conversation itself. */
export interface ThreadCtx {
  /** Intros logged, by conversation id (Your pipeline). */
  intros: Map<string, IntroRec>;
  /** The latest lead passed in each conversation, by conversation id (Peers). */
  leads: Map<string, LeadRec>;
  /** Conversations with a draft kept in this browser (the composer's). */
  drafts: Set<string>;
}

export const emptyCtx = (): ThreadCtx => ({ intros: new Map(), leads: new Map(), drafts: new Set() });

/** Intros by the conversation they were asked in. */
export function introsByConversation(intros: readonly IntroRec[] | null | undefined): Map<string, IntroRec> {
  const m = new Map<string, IntroRec>();
  for (const i of intros ?? []) if (i.conversation && !m.has(i.conversation)) m.set(i.conversation, i);
  return m;
}
/** The newest lead in each conversation, either way. */
export function leadsByConversation(leads: readonly LeadRec[] | null | undefined): Map<string, LeadRec> {
  const m = new Map<string, LeadRec>();
  for (const l of leads ?? []) {
    if (!l.conversationId) continue;
    const had = m.get(l.conversationId);
    if (!had || had.at < l.at) m.set(l.conversationId, l);
  }
  return m;
}

export function kindOf(c: ConversationRec, x: Pick<ThreadCtx, "intros" | "leads">): Kind {
  if (c.kind === "team") return "team";
  if (c.kind === "invite") return "invite";
  if (c.kind === "partners") return x.leads.has(c.id) ? "lead" : "peer";
  return x.intros.has(c.id) ? "intro" : "q";
}

/** The conversation is closed for now: blocked, or Not now from either side. */
export const isClosed = (c: ConversationRec) => !!c.blocked || c.status === "closed";

export type FilterKey = "all" | "unread" | "intro" | "lead" | "q" | "team" | "peer" | "draft" | "closed";
export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "intro", label: "Intros" },
  { key: "lead", label: "Referrals" },
  { key: "q", label: "Questions" },
  { key: "team", label: "Teams" },
  { key: "peer", label: "Peers" },
  { key: "draft", label: "Drafts" },
  { key: "closed", label: "Closed" },
];

export function inFilter(f: FilterKey, c: ConversationRec, x: ThreadCtx): boolean {
  const k = kindOf(c, x);
  switch (f) {
    case "all":
      return true;
    case "unread":
      return c.unread > 0;
    case "peer":
      return k === "peer" || k === "invite";
    case "draft":
      return x.drafts.has(c.id);
    case "closed":
      return isClosed(c);
    default:
      return k === f;
  }
}

/** Each filter's count over the whole list. */
export function filterCounts(list: readonly ConversationRec[], x: ThreadCtx): Record<FilterKey, number> {
  const out = Object.fromEntries(FILTERS.map((f) => [f.key, 0])) as Record<FilterKey, number>;
  for (const c of list) for (const f of FILTERS) if (inFilter(f.key, c, x)) out[f.key]++;
  return out;
}

/** The company as the member sees it: its name, else the lead's free facts, else "A locked company". */
export function companyWords(c: ConversationRec, lead?: LeadRec | null): string {
  if (lead) return lead.name ?? (lead.kind ? `A locked ${lead.kind}` : "A locked company");
  if (!c.about.companyId) return "";
  return c.about.company && c.about.company !== HIDDEN_COMPANY ? c.about.company : "A locked company";
}
const lower = (s: string) => (/^A /.test(s) ? `a ${s.slice(2)}` : s);

/** A name or a company typed in the search box. */
export function matches(q: string, c: ConversationRec, lead?: LeadRec | null): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [c.with.name, companyWords(c, lead), c.about.seat ?? ""].join(" ").toLowerCase().includes(t);
}

/** The list row's second line: the company and the seat, or what it is about. */
export function rowAbout(c: ConversationRec, k: Kind, lead?: LeadRec | null): string {
  if (k === "lead") return companyWords(c, lead);
  if (k === "peer") return "No seat in question";
  const co = companyWords(c);
  return [co, k === "team" ? "your team" : c.about.seat].filter(Boolean).join(" · ") || "No seat in question";
}

/** The list row's last line: the newest message, or the draft kept here. */
export function lastLine(c: ConversationRec, draft?: string | null): string {
  if (draft?.trim()) return `Draft: ${draft.trim()}`;
  const m = c.messages[c.messages.length - 1];
  if (!m) return "";
  return `${m.mine ? "You: " : ""}${m.removed ? "An admin removed this message." : m.text}`;
}

const seatAt = (c: ConversationRec) => `${c.about.seat ? `${c.about.seat} ` : ""}seat at ${lower(companyWords(c) || "a company")}${c.about.years ? `, ${c.about.years}` : ""}`;

/** The header's line under the name: what the conversation is about. */
export function aboutLine(c: ConversationRec, k: Kind, lead?: LeadRec | null): string {
  const first = c.with.first;
  if (k === "peer") return "Fellow fractionals on Merlin. No seat in question.";
  if (k === "team") return `Your team thread on ${lower(companyWords(c) || "a company")}.`;
  if (k === "lead" && lead) return lead.side === "to-you" ? `Referred to you by ${first}: ${lower(companyWords(c, lead))}.` : `Referred to ${first}: ${lower(companyWords(c, lead))}.`;
  if (k === "invite") return `Their seat at ${lower(companyWords(c) || "a company")}.`;
  return `${c.started ? "About their" : "About your"} ${seatAt(c)}.`;
}

/** The line above the first message: why this conversation exists. */
export function contextLine(c: ConversationRec, k: Kind, lead?: LeadRec | null): string {
  const first = c.with.first;
  const co = lower(companyWords(c) || "a company");
  switch (k) {
    case "peer":
      return c.started ? `You found ${first} in the Fractionals directory.` : `${first} found you in the Fractionals directory and wants to connect.`;
    case "invite":
      return c.started ? `${first} claimed their seat at ${co} through your invite. You are connected as referral partners.` : `You claimed your seat at ${co} through ${first}'s invite. You are connected as referral partners.`;
    case "team":
      return c.started ? `You asked ${first} to team up on ${co}. This is your shared thread.` : `${first} asked you to team up on ${co}. This is your shared thread.`;
    case "lead":
      if (!lead) return `You and ${first} are fellow fractionals on Merlin.`;
      return lead.side === "to-you" ? `${first} referred a company to you. ${companyWords(c, lead)} is open for you, free, and for nobody else.` : `You referred ${lower(companyWords(c, lead))} to ${first}. It opened free for them alone.`;
    default:
      return c.started ? `You wrote to ${first} about their ${seatAt(c)}.` : `${first} unlocked your ${seatAt(c)} and wants to talk.`;
  }
}

/** Why the reply box is gone, said plainly, and whether to offer other ways in. */
export function closedNote(c: ConversationRec): { text: string; alt: boolean } | null {
  const first = c.with.first;
  if (c.blocked) return { text: `You blocked ${first}. They cannot start a conversation with you or write here.`, alt: false };
  if (c.status !== "closed") return null;
  if (c.closedBy === "you") return { text: `You said not now. ${first} sees that you are not taking intros right now. Write again any time to reopen it.`, alt: false };
  return c.started ? { text: `${first} is not taking intros right now. Nothing is wrong with your note.`, alt: !!c.about.companyId } : { text: `${first} closed this conversation.`, alt: false };
}

/** The list's heading: "8 conversations · 2 unread". */
export function listHead(list: readonly ConversationRec[]): string {
  if (!list.length) return "No conversations yet";
  const unread = list.filter((c) => c.unread > 0).length;
  return `${list.length} ${list.length === 1 ? "conversation" : "conversations"} · ${unread} unread`;
}

/** What a referral says it stands at, for the Referrals tab. */
export function leadStatus(l: LeadRec): string {
  if (l.status === "declined") return l.side === "to-you" ? "You turned it down" : "Turned down";
  if (l.status === "taken") return l.won ? "Taken, then won" : l.side === "to-you" ? "In your pipeline" : "Taken";
  return l.side === "to-you" ? "Waiting for you" : "Waiting for an answer";
}

/**
 * Example rows for a first visit: what lands here, labelled Example. They are never sent to the
 * server, never counted and never a conversation: picking one opens the same kind of draft.
 */
export interface ExampleRow {
  example: true;
  reason: "intro" | "lead" | "q";
  kind: Kind;
  about: string;
  last: string;
}
export const EXAMPLE_ROWS: readonly ExampleRow[] = [
  { example: true, reason: "intro", kind: "intro", about: "A software company · Fractional CRO", last: "Happy to introduce you. What should I say about you?" },
  { example: true, reason: "lead", kind: "lead", about: "A fintech company · you referred it", last: "Taking it. Thank you. You earned 5 credits." },
  { example: true, reason: "q", kind: "q", about: "A SaaS company · Fractional CMO", last: "You: What did the CEO care about most in your first 90 days?" },
];

/* ---------- a filter that leaves things out (owner review M1, L1) ---------- */

/** What the filter and the search cover, in words: "Unread", "your search", "Unread and your search". */
export function scopeWords(label: string, f: FilterKey, q: string): string {
  const searched = !!q.trim();
  if (!searched) return label;
  return f === "all" ? "your search" : `${label} and your search`;
}

/** The heading of a filtered list with no match: it names the filter, so it never reads as an empty inbox. */
export function noneHead(label: string, f: FilterKey, q: string): string {
  if (q.trim() && f === "all") return "No conversation matches your search";
  if (q.trim()) return `Nothing in ${label} matches your search`;
  return `No conversations in ${label}`;
}

/** The line read out (aria-live) when the filter or the search changes the list. */
export function matchCountLine(shown: number, total: number, label: string, f: FilterKey, q: string): string {
  const noun = (n: number) => (n === 1 ? "conversation" : "conversations");
  if (f === "all" && !q.trim()) return `${total} ${noun(total)}`;
  return `${shown} of ${total} ${noun(total)} in ${scopeWords(label, f, q)}`;
}

/**
 * The conversation picked earlier is drawn only while the list shows it. One the filter or the
 * search leaves out is "outside": the panel beside the list is cleared, so no reply can be written
 * to someone the member can't see in the list. The pick is kept, so Show all brings it back.
 */
export function pickState(sel: string | null, shownIds: readonly string[]): "none" | "shown" | "outside" {
  if (!sel) return "none";
  return shownIds.includes(sel) ? "shown" : "outside";
}
