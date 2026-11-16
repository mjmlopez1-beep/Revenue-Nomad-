/**
 * Messages between members. After a member unlocks who held a seat (or it was free to see),
 * they can write to that seat holder inside Trading Post, as long as the seat holder is a
 * member who has signed in. The conversation is about that seat. Replies are open inside it.
 *
 * Limits: 5 new conversations per member in any 24 hours, 30 open at once, 2,000 characters a
 * message, 60 messages sent in any 24 hours. A member can close a conversation ("Not now"),
 * block the other member (they can no longer start one with them), and report a message (it
 * goes to the admins' review list, alone: admins never read the rest).
 *
 * Neither side's email or phone ever leaves the server here. With email on, the other side
 * gets one email per conversation per hour at most, unless they turned message emails off.
 */
import { randomBytes } from "crypto";
import { ActionError, isAdmin, loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "./table";
import { HIDDEN_COMPANY, functionOf } from "./tableFields";
import { MAIL, emailEnabled, escHtml, footerNote, mailButton, mailH, mailP, mailShell, oneLine, sendEmail } from "./email";
import { sideOf, unreadCount, unreadIn, type StoredConversation } from "./messageState";
import type { Action, ActionResult, ConversationRec, MessageRec } from "./tableTypes";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const MESSAGE_LIMITS = { newPerDay: 5, open: 30, chars: 2000, sentPerDay: 60, emailEvery: HOUR } as const;

const SIGNED_OUT = "You're signed out. Sign in again to send a message.";
const GONE = "That conversation isn't there anymore. Open Messages again.";
const NOT_TAKING = "They're not taking intros right now.";

type MessageAction = Action;

const newId = (p: string) => `${p}${randomBytes(8).toString("hex")}`;

/** The text of a message, checked: something to say, and at most 2,000 characters. */
function cleanText(raw: unknown): string {
  const text = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (!text) throw new ActionError("Write a message first.");
  if ([...text].length > MESSAGE_LIMITS.chars) throw new ActionError(`Keep it to 2,000 characters. This one is ${[...text].length.toLocaleString("en-US")}.`);
  return text;
}

const lastAt = (c: StoredConversation) => c.messages[c.messages.length - 1]?.at ?? c.createdAt;
const year = (v: string | null | undefined) => (v && /^\d{4}/.test(v) ? v.slice(0, 4) : null);

/** The conversation as `me` sees it. Public ids only, no email addresses, no member ids. */
function recFor(seed: Seed, s: State, me: Member, c: StoredConversation): ConversationRec {
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const tracks = T.tracksOf(seed, s);
  const otherId = c.a === me.id ? c.b : c.a;
  const other = idx.byId.get(otherId);
  const name = other?.name ?? "A former member";
  const e = g.engagements.get(c.about.engagementId);
  const hidden = T.identityHidden(g, s, idx, tracks, me, c.about.companyId);
  // The seat holder sees their own seat free. The member who started it sees what they unlocked.
  const free = me.id === c.b;
  const seen = (key: string) => {
    if (!e) return null;
    const cell = T.cellOf(s, me, e, "engagement", key, idx, free);
    return cell.s === "value" ? cell.v : null;
  };
  const seat = seen("role") ?? T.live(e, s, "function") ?? functionOf(T.live(e, s, "role")) ?? null;
  const from = year(seen("start"));
  const to = year(seen("end")) ?? (seen("status") === "Active" ? "now" : null);
  const reportedByMe = new Set((s.messageReports ?? []).filter((r) => r.by === me.id && r.conversationId === c.id).map((r) => r.messageId));
  const iBlocked = (s.blocks?.[me.id] ?? []).includes(otherId);
  const messages: MessageRec[] = c.messages.map((m) => ({
    id: m.id,
    mine: m.by === me.id,
    at: m.at,
    text: m.removed ? "" : m.text,
    ...(reportedByMe.has(m.id) ? { reported: true } : {}),
    ...(m.removed ? { removed: true } : {}),
  }));
  const canSend = !!other && !c.blockedBy && !iBlocked && (c.status === "open" || c.closedBy === me.id);
  return {
    id: c.id,
    started: c.a === me.id,
    with: { name, first: T.firstName(name), title: (other && s.profiles[otherId]?.title) || other?.title || "" },
    about: {
      companyId: T.pubId(c.about.companyId),
      engagementId: T.pubId(c.about.engagementId),
      company: hidden ? HIDDEN_COMPANY : g.companies.get(c.about.companyId)?.name ?? "",
      seat,
      years: from ? (to && to !== from ? `${from} to ${to}` : from) : null,
    },
    messages,
    unread: unreadIn(c, me.id),
    status: c.status,
    ...(c.closedBy ? { closedBy: c.closedBy === me.id ? ("you" as const) : ("them" as const) } : {}),
    ...(iBlocked ? { blocked: true } : {}),
    canSend,
    updatedAt: lastAt(c),
  };
}

/** GET /api/table?messages=1: the viewer's conversations, newest first. */
export async function listConversations(token: string | null): Promise<{ conversations: ConversationRec[]; unread: number } | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) return null;
  const mine = (s.conversations ?? []).filter((c) => c.a === me.id || c.b === me.id).sort((x, y) => lastAt(y).localeCompare(lastAt(x)));
  return { conversations: mine.map((c) => recFor(seed, s, me, c)), unread: unreadCount(s, me.id) };
}

/** GET /api/table?unread=1: just the count, for the badge. */
export async function unreadFor(token: string | null): Promise<number | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  return me ? unreadCount(s, me.id) : null;
}

/* ---------- the email ---------- */

/**
 * "Ana sent you a message on Trading Post about your seat at Acme": the first 200 characters
 * and a link. Never either member's email address. `holder`: the reader held the seat.
 */
export function messageEmail(o: { from: string; company: string; holder: boolean; text: string; link: string }) {
  const first = oneLine(o.from).slice(0, 40) || "A member";
  const company = oneLine(o.company).slice(0, 80) || "a company";
  const about = o.holder ? `your seat at ${company}` : `the seat at ${company}`;
  const flat = oneLine(o.text);
  const snippet = [...flat].length > 200 ? `${[...flat].slice(0, 200).join("").trimEnd()}…` : flat;
  const link = oneLine(o.link);
  const subject = `${first} sent you a message on Trading Post about ${about}`;
  const why = "You get at most one of these an hour for each conversation. Turn them off in Your credits on Trading Post.";
  const from = "Trading Post is a free pilot from Revenue Nomad.";
  const note = footerNote();
  const text = [
    `${first} sent you a message about ${about}.`,
    "",
    snippet,
    "",
    `Read it and reply on Trading Post: ${link}`,
    "",
    "--",
    why,
    from,
    ...(note ? [note] : []),
  ].join("\n");
  const body = [
    mailH(`${escHtml(first)} sent you a message`),
    mailP(`About ${escHtml(about)}.`, "margin-bottom:24px;"),
    `<p style="margin:0 0 24px;padding:12px 16px;border-left:3px solid ${MAIL.volt};background:${MAIL.page};font-family:${MAIL.font};font-size:16px;line-height:24px;color:${MAIL.ink}">${escHtml(snippet)}</p>`,
    mailButton(link, "Read and reply", "margin:0 0 8px"),
  ].join("\n");
  const html = mailShell({ title: subject, preheader: snippet.slice(0, 120), body, footer: [escHtml(why), escHtml(from), note ? escHtml(note) : ""] });
  return { subject, text, html };
}

/* ---------- the actions ---------- */

type Outcome = { message: string; convId?: string; notify?: { to: string; subject: string; text: string; html: string } };

export async function performMessage(token: string | null, a: MessageAction, origin?: string): Promise<ActionResult> {
  const base = (process.env.RN_PUBLIC_URL?.replace(/\/$/, "") || origin || "").replace(/\/$/, "");
  const out = await T.mutate((s, seed): Outcome & { rec?: ConversationRec; unread: number } => {
    const me = memberByToken(seed, token, s);
    if (!me) throw new ActionError(SIGNED_OUT);
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    s.conversations ??= [];
    const convs = s.conversations;
    const idx = T.memberIndex(seed, s);
    const g = T.graph(seed, s);
    const first = (id: string) => T.firstName(idx.byId.get(id)?.name ?? "They");
    const mineConv = (id: unknown) => {
      const c = convs.find((x) => x.id === String(id ?? ""));
      if (!c || !sideOf(c, me.id)) throw new ActionError(GONE);
      return c;
    };
    const sentToday = () => {
      let n = 0;
      for (const c of convs) for (const m of c.messages) if (m.by === me.id && nowMs - Date.parse(m.at) < DAY) n++;
      return n;
    };
    /** Write one message from me into `c`, with the limits and the email to the other side. */
    const write = (c: StoredConversation, raw: unknown): Outcome => {
      const text = cleanText(raw);
      if (sentToday() >= MESSAGE_LIMITS.sentPerDay) throw new ActionError("That's 60 messages today, which is the limit. Send more tomorrow.");
      const side = sideOf(c, me.id)!;
      const otherId = side === "a" ? c.b : c.a;
      if (!idx.byId.has(otherId)) throw new ActionError("This member isn't on Trading Post anymore.");
      if ((s.blocks?.[me.id] ?? []).includes(otherId)) throw new ActionError(`You blocked ${first(otherId)}. Unblock them to write again.`);
      if (c.blockedBy && c.blockedBy !== me.id) throw new ActionError(NOT_TAKING);
      if (c.status === "closed") {
        // The side that said "Not now" can change their mind by writing. The other side can't.
        if (c.closedBy !== me.id) throw new ActionError(NOT_TAKING);
        c.status = "open";
        delete c.closedBy;
      }
      c.messages.push({ id: newId("m"), by: me.id, at: now, text });
      c.readAt[side] = now;
      // The email to the other side: one per conversation per hour, never with an address in it.
      let notify: Outcome["notify"];
      const otherSide = side === "a" ? "b" : "a";
      const other = idx.byId.get(otherId)!;
      const last = Date.parse(c.notifiedAt?.[otherSide] ?? "");
      if (emailEnabled() && other.email && !s.profiles[otherId]?.messageEmailOff && !(Number.isFinite(last) && nowMs - last < MESSAGE_LIMITS.emailEvery)) {
        c.notifiedAt = { ...(c.notifiedAt ?? {}), [otherSide]: now };
        const tracks = T.tracksOf(seed, s);
        const hidden = T.identityHidden(g, s, idx, tracks, other, c.about.companyId);
        const company = hidden ? "a company that is hiring" : g.companies.get(c.about.companyId)?.name ?? "";
        const mail = messageEmail({ from: T.firstName(me.name), company, holder: otherId === c.b, text, link: `${base}/?p=messages&m=${encodeURIComponent(c.id)}` });
        notify = { to: other.email, ...mail };
      }
      return { message: "Sent.", convId: c.id, notify };
    };

    const run = (): Outcome => {
      switch (a.type) {
        case "message.start": {
          const engId = [...g.engagements.keys()].find((id) => T.pubId(id) === String(a.engagementId ?? ""));
          const e = engId ? g.engagements.get(engId) : undefined;
          if (!e) throw new ActionError("That seat isn't on Trading Post anymore.");
          const holder = T.seatHolder(s, idx, e.id, T.valueOf(e, s, "operator"));
          if (!holder) throw new ActionError("Nobody on Trading Post is linked to this seat, so there's no one to write to here.");
          if (holder.id === me.id) throw new ActionError("That's your own seat.");
          if (T.cellOf(s, me, e, "engagement", "operator", idx).s !== "value") throw new ActionError("Unlock who held this seat first. Then you can write to them.");
          const name = T.firstName(holder.name);
          if (!T.signedIn(s, idx, holder.id)) throw new ActionError(`${name} hasn't signed in to Trading Post yet, so a message here wouldn't reach them. Try LinkedIn instead.`);
          if ((s.blocks?.[holder.id] ?? []).includes(me.id)) throw new ActionError(NOT_TAKING);
          if ((s.blocks?.[me.id] ?? []).includes(holder.id)) throw new ActionError(`You blocked ${name}. Unblock them in Messages to write again.`);
          // One conversation per pair and seat: writing again goes into the one there is.
          const existing = convs.find((c) => c.about.engagementId === e.id && ((c.a === me.id && c.b === holder.id) || (c.a === holder.id && c.b === me.id)));
          if (existing) return write(existing, a.text);
          const started = convs.filter((c) => c.a === me.id && nowMs - Date.parse(c.createdAt) < DAY).length;
          if (started >= MESSAGE_LIMITS.newPerDay) throw new ActionError("You can start 5 conversations a day. Reply in the ones you have, or start this one tomorrow.");
          const open = convs.filter((c) => c.status === "open" && (c.a === me.id || c.b === me.id)).length;
          if (open >= MESSAGE_LIMITS.open) throw new ActionError("You have 30 open conversations, which is the limit. Close one with Not now first.");
          const c: StoredConversation = { id: newId("cv"), a: me.id, b: holder.id, about: { companyId: e.companyId, engagementId: e.id }, messages: [], readAt: {}, status: "open", createdAt: now };
          convs.push(c);
          const r = write(c, a.text);
          return { ...r, message: `Sent. ${name} will see it in Messages.` };
        }
        case "message.send":
          return write(mineConv(a.conversationId), a.text);
        case "message.close": {
          const c = mineConv(a.conversationId);
          if (c.status === "closed") return { message: "This conversation is already closed.", convId: c.id };
          c.status = "closed";
          c.closedBy = me.id;
          c.readAt[sideOf(c, me.id)!] = now;
          return { message: `Closed. ${first(c.a === me.id ? c.b : c.a)} will see you're not taking intros right now.`, convId: c.id };
        }
        case "message.block": {
          const c = mineConv(a.conversationId);
          const otherId = c.a === me.id ? c.b : c.a;
          s.blocks ??= {};
          const list = new Set(s.blocks[me.id] ?? []);
          const name = first(otherId);
          if (a.on === false) {
            list.delete(otherId);
            for (const x of convs) if (x.blockedBy === me.id && (x.a === otherId || x.b === otherId)) delete x.blockedBy;
            s.blocks[me.id] = [...list];
            return { message: `Unblocked ${name}.`, convId: c.id };
          }
          list.add(otherId);
          s.blocks[me.id] = [...list];
          // Every open conversation with them closes. They see that you're not taking intros.
          for (const x of convs) {
            if (!((x.a === me.id && x.b === otherId) || (x.b === me.id && x.a === otherId))) continue;
            x.blockedBy = me.id;
            x.everBlocked = true;
            if (x.status === "open") {
              x.status = "closed";
              x.closedBy = me.id;
            }
          }
          return { message: `Blocked ${name}. They can't start a conversation with you anymore.`, convId: c.id };
        }
        case "message.report": {
          const c = mineConv(a.conversationId);
          const m = c.messages.find((x) => x.id === String(a.messageId ?? ""));
          if (!m) throw new ActionError("That message isn't there anymore.");
          if (m.by === me.id) throw new ActionError("You can report a message someone else sent, not your own.");
          s.messageReports ??= [];
          if (s.messageReports.some((r) => r.messageId === m.id && r.by === me.id)) return { message: "You already reported this message.", convId: c.id };
          s.messageReports.push({ id: newId("mr"), conversationId: c.id, messageId: m.id, by: me.id, at: now, status: "open" });
          return { message: "Reported. An admin will read this one message, and nothing else in the conversation.", convId: c.id };
        }
        case "message.read": {
          const c = mineConv(a.conversationId);
          c.readAt[sideOf(c, me.id)!] = now;
          return { message: "", convId: c.id };
        }
        case "message.review": {
          if (!isAdmin(me)) throw new ActionError("Only admins can review reported messages.");
          const r = (s.messageReports ?? []).find((x) => x.id === String(a.reportId ?? ""));
          if (!r || r.status !== "open") throw new ActionError("That report was already handled.");
          const m = convs.find((c) => c.id === r.conversationId)?.messages.find((x) => x.id === r.messageId);
          const decision = a.decision === "remove" ? "removed" : "kept";
          for (const x of s.messageReports ?? []) if (x.messageId === r.messageId && x.status === "open") x.status = decision;
          if (decision === "removed" && m) {
            m.removed = true;
            m.text = "";
            return { message: "Removed. Both members now see that an admin took this message down." };
          }
          return { message: "Kept. The message stays as it was." };
        }
        default:
          throw new ActionError("That didn't go through. Refresh the page and try again.");
      }
    };
    const res = run();
    const c = res.convId ? convs.find((x) => x.id === res.convId) : undefined;
    return { ...res, rec: c && sideOf(c, me.id) ? recFor(seed, s, me, c) : undefined, unread: unreadCount(s, me.id) };
  });
  if (out.notify) {
    const n = out.notify;
    void sendEmail(n.to, n.subject, n.text, n.html).catch((e) => console.error("message email failed", e));
  }
  return { message: out.message, ...(out.convId ? { id: out.convId } : {}), ...(out.rec ? { conversation: out.rec } : {}), unread: out.unread };
}
