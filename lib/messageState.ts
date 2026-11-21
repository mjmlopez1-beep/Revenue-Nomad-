/**
 * What the state keeps for messages between members and for one-time sign-in links, and the
 * small counts the table view needs from them. No imports from lib/table.ts, so both it and
 * lib/messages.ts / lib/signin.ts can use this file.
 */
import type { ReportedMessage } from "./tableTypes";

/** One message. `by` is a member id. `removed`: an admin removed it after a report (the text is gone). */
export interface StoredMessage {
  id: string;
  by: string;
  at: string;
  text: string;
  removed?: boolean;
}

/**
 * A conversation about one seat. `a` started it (they unlocked who held the seat), `b` is the
 * seat holder. Internal ids only: the client gets public ids.
 *
 * `kind` partners: `a` connected with `b` from Referral partners, about no seat (`about` holds
 * empty ids). `kind` invite: it opened by itself when `b` claimed their seat through `a`'s invite
 * (Invite to connect). Its first message is `a`'s note, and it counts as unread for `a` too until
 * they open it, so the inviter sees that the partner is in.
 */
export interface StoredConversation {
  id: string;
  a: string;
  b: string;
  about: { companyId: string; engagementId: string };
  kind?: "partners" | "invite";
  messages: StoredMessage[];
  /** When each side last read it. */
  readAt: { a?: string; b?: string };
  status: "open" | "closed";
  /** The member who closed it ("Not now", or a block). */
  closedBy?: string;
  /** The member who blocked the other from this conversation. */
  blockedBy?: string;
  /** It was blocked at some point (pilot metrics count these, unblocked or not). */
  everBlocked?: boolean;
  createdAt: string;
  /** The last time each side got an email about it (at most one an hour). */
  notifiedAt?: { a?: string; b?: string };
}

export interface StoredMessageReport {
  id: string;
  conversationId: string;
  messageId: string;
  by: string;
  at: string;
  status: "open" | "kept" | "removed";
}

/**
 * A one-time sign-in link and its code. Only hashes are kept: `id` is the SHA-256 of the link's
 * token, `code` an HMAC of the 6 digits. Deleted when used, after 5 wrong codes, and once expired.
 * `purpose` join: the link finishes joining and proves the address (State.members[].proven).
 */
export interface StoredSignIn {
  id: string;
  memberId: string;
  code: string;
  /** "message": the link in a message email. It signs in once and opens the conversation (7 days, no code). */
  /** "email": made when a member opens a link in the Crystal Ball or weekly email (lib/emailIn.ts): 20 minutes, no code. */
  purpose: "signin" | "join" | "message" | "email";
  exp: string;
  tries: number;
  /** "email": the hash of the email link it was made for. Using it spends that link (State.emailGrants). */
  grant?: string;
  /** "email": when that email link stops working. */
  grantExp?: string;
}

/** The state fields this feature adds (all optional, so an older state file loads as it is). */
export interface MessagingState {
  conversations?: StoredConversation[];
  /** Members each member blocked, by member id. */
  blocks?: Record<string, string[]>;
  messageReports?: StoredMessageReport[];
  signins?: StoredSignIn[];
  /** A seed member's personal sign-in token after "Sign out on other devices" (the seed's own stops working). */
  tokens?: Record<string, string>;
  /** Email links already used to sign in (lib/emailIn.ts): the link's hash, and when it would have expired. */
  emailGrants?: Record<string, string>;
}

/** The viewer's side of a conversation. */
export const sideOf = (c: StoredConversation, memberId: string): "a" | "b" | null => (c.a === memberId ? "a" : c.b === memberId ? "b" : null);

/** Messages from the other member after the viewer last read the conversation. */
export function unreadIn(c: StoredConversation, memberId: string): number {
  const side = sideOf(c, memberId);
  if (!side) return 0;
  const read = c.readAt[side] ?? "";
  let n = 0;
  for (const m of c.messages) if (m.by !== memberId && m.at > read) n++;
  // An invite's conversation is news for the inviter too (the partner claimed their seat), until they open it.
  if (c.kind === "invite" && side === "a" && !read && !n) n = 1;
  return n;
}

/** Conversations with something the member hasn't read (the badge on the avatar and the menu). */
export function unreadCount(s: MessagingState, memberId: string): number {
  let n = 0;
  for (const c of s.conversations ?? []) if ((c.a === memberId || c.b === memberId) && unreadIn(c, memberId) > 0) n++;
  return n;
}

const DAY = 24 * 60 * 60 * 1000;

/** Pilot metrics, counts only. Replied: the seat holder answered within 3 days of the first message. */
export function messageStats(s: MessagingState): { started: number; replied3d: number; closed: number; blocked: number; reported: number } {
  const all = s.conversations ?? [];
  let replied3d = 0;
  for (const c of all) {
    const start = Date.parse(c.createdAt);
    if (c.messages.some((m) => m.by === c.b && Date.parse(m.at) - start <= 3 * DAY)) replied3d++;
  }
  return {
    started: all.length,
    replied3d,
    closed: all.filter((c) => c.status === "closed").length,
    blocked: all.filter((c) => c.everBlocked).length,
    reported: (s.messageReports ?? []).length,
  };
}

/**
 * Admins: the open reports, each with the one message it is about and nothing else from its
 * conversation. Newest report first. `nameOf` turns a member id into a name.
 */
export function reportedMessages(s: MessagingState, nameOf: (memberId: string) => string): ReportedMessage[] {
  const byId = new Map((s.conversations ?? []).map((c) => [c.id, c]));
  const out: ReportedMessage[] = [];
  for (const r of s.messageReports ?? []) {
    if (r.status !== "open") continue;
    const m = byId.get(r.conversationId)?.messages.find((x) => x.id === r.messageId);
    if (!m || m.removed) continue;
    out.push({ id: r.id, text: m.text, from: nameOf(m.by), reporter: nameOf(r.by), at: m.at, reportedAt: r.at });
  }
  return out.sort((x, y) => y.reportedAt.localeCompare(x.reportedAt));
}
