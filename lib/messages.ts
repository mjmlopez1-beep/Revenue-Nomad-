/**
 * Messages between members. After a member unlocks who held a seat (or it was free to see),
 * they can write to that seat holder inside Merlin, as long as the seat holder is a
 * member who has signed in. The conversation is about that seat. Replies are open inside it.
 *
 * Two more ways a conversation starts (StoredConversation.kind): Connect on Referral partners
 * (message.connect, about no seat), and by itself when a seat holder claims their seat through a
 * member's invite link (lib/table.ts connectInvite, Invite to connect). That one opens with the
 * inviter's note, and the inviter hears about it as they would about a message (afterConnect).
 *
 * Limits: 5 new conversations per member in any 24 hours, 30 open at once, 2,000 characters a
 * message, 60 messages sent in any 24 hours. A member can close a conversation ("Not now"),
 * block the other member (they can no longer start one with them), and report a message (it
 * goes to the admins' review list, alone: admins never read the rest).
 *
 * Neither side's email or phone ever leaves the server here. With email on, the other side
 * gets one email per conversation per hour at most, unless they turned message emails off.
 */
import { publicBase } from "./links";
import { randomBytes } from "crypto";
import { ActionError, isAdmin, loadSeed, loadState, memberByToken, tableInternals as T, type Member, type Seed, type State } from "./table";
import { HIDDEN_COMPANY, functionOf } from "./tableFields";
import { MAIL, emailEnabled, escHtml, footerNote, mailButton, mailH, mailP, mailQuote, mailShell, mailSmall, oneLine, sendEmail } from "./email";
import { sideOf, unreadCount, unreadIn, type StoredConversation } from "./messageState";
import { addSignIn } from "./signin";
import { NOTIFICATIONS_PATH, emailLinker } from "./emailIn";
import type { Action, ActionResult, ConversationRec, MessageRec } from "./tableTypes";
import { emptyPipeline, openEntry } from "./pipeline";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const MESSAGE_LIMITS = { newPerDay: 5, open: 30, chars: 2000, sentPerDay: 60, emailEvery: HOUR } as const;

const SIGNED_OUT = "You're signed out. Sign in again to send a message.";
const GONE = "That conversation isn't there anymore. Open Messages again.";
const NOT_TAKING = "They're not taking intros right now.";

type MessageAction = Action;

const newId = (p: string) => `${p}${randomBytes(8).toString("hex")}`;

/**
 * Your pipeline (lib/pipeline.ts): a message the member started about a seat went out on Merlin,
 * so the seat's company is in their pipeline at Sent (a later one is a follow-up there). The other
 * side's reply in this conversation moves it to Replied when Merlin next reads the pipeline.
 */
function pipelineSent(s: State, meId: string, c: StoredConversation, holder: Member, role: string | null, nowMs: number) {
  if (!c.about.companyId || c.a !== meId) return;
  openEntry(((s.pipeline ??= {})[meId] ??= emptyPipeline()), {
    id: newId("pl"),
    companyId: c.about.companyId,
    channel: "merlin",
    to: { memberId: holder.id, name: T.memberNameFor(s, holder, meId), ...(role ? { role } : {}), ...(c.about.engagementId ? { seatId: c.about.engagementId } : {}) },
    source: "message",
    via: "message",
    nowMs,
    conversationId: c.id,
  });
}

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
export function conversationRec(seed: Seed, s: State, me: Member, c: StoredConversation): ConversationRec {
  return recFor(seed, s, me, c);
}
function recFor(seed: Seed, s: State, me: Member, c: StoredConversation): ConversationRec {
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const tracks = T.tracksOf(seed, s);
  const otherId = c.a === me.id ? c.b : c.a;
  const other = idx.byId.get(otherId);
  // Named the way they chose to show to other members (lib/memberName.ts), never in full unless they said so.
  const name = other ? T.memberNameFor(s, other, me.id) : "A former member";
  const e = g.engagements.get(c.about.engagementId);
  // Connect on Referral partners is about no seat: no company, no seat.
  const hidden = !!c.about.companyId && T.identityHidden(g, s, idx, tracks, me, c.about.companyId);
  // The seat holder sees their own seat free. The member who started it sees what they unlocked.
  const free = me.id === c.b;
  const seen = (key: string) => {
    if (!e) return null;
    const cell = T.cellOf(s, me, e, "engagement", key, idx, free);
    return cell.s === "value" ? cell.v : null;
  };
  const seat = e ? seen("role") ?? T.live(e, s, "function") ?? functionOf(T.live(e, s, "role")) ?? null : null;
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
    ...(c.kind ? { kind: c.kind } : {}),
    ...(c.teamId ? { teamId: c.teamId } : {}),
    with: { ...(other ? { id: T.pubId(otherId) } : {}), name, first: T.firstName(name), title: (other && s.profiles[otherId]?.title) || (other?.title === "Member" ? "" : other?.title) || "" },
    about: {
      companyId: c.about.companyId ? T.pubId(c.about.companyId) : "",
      engagementId: c.about.engagementId ? T.pubId(c.about.engagementId) : "",
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
 * "Ana sent you a message on Merlin about your seat at Acme": the first 200 characters
 * and a link. Never either member's email address. `holder`: the reader held the seat.
 */
export function messageEmail(o: { from: string; company: string; holder: boolean; text: string; link: string; about?: string; settingsUrl?: string }) {
  const first = oneLine(o.from).slice(0, 40) || "A member";
  const company = oneLine(o.company).slice(0, 80) || "a company";
  // A conversation from Referral partners is about no seat: `about` says what it is about instead.
  const about = o.about ?? (o.holder ? `your seat at ${company}` : `the seat at ${company}`);
  const flat = oneLine(o.text);
  const snippet = [...flat].length > 200 ? `${[...flat].slice(0, 200).join("").trimEnd()}…` : flat;
  const link = oneLine(o.link);
  const subject = `${first} sent you a message on Merlin about ${about}`;
  const why = "You get at most one of these an hour for each conversation. Turn them off in Notifications on Merlin.";
  const settings = oneLine(o.settingsUrl);
  const noReply = "Replies to this email don't reach them. Reply on Merlin.";
  const from = "Merlin is a data exchange for fractional operators, from Revenue Nomad.";
  const note = footerNote();
  const text = [
    `${first} sent you a message about ${about}.`,
    "",
    snippet,
    "",
    `Read it and reply on Merlin with this link. It signs you in once and works for 7 days.`,
    link,
    "",
    noReply,
    "",
    "--",
    why,
    ...(settings ? ["Notifications", settings] : []),
    from,
    ...(note ? [note] : []),
  ].join("\n");
  const body = [
    mailH(`${escHtml(first)} sent you a message`),
    mailP(`About ${escHtml(about)}.`, "margin-bottom:24px;"),
    mailQuote(escHtml(snippet)),
    mailButton(link, "Read and reply", "margin:0 0 16px"),
    mailSmall(escHtml(noReply), "margin:0;"),
  ].join("\n");
  const html = mailShell({ title: subject, preheader: snippet.slice(0, 120), body, link, art: "letter", footer: [escHtml(why), settingsLink(settings), escHtml(from), note ? escHtml(note) : ""] });
  return { subject, text, html };
}

/**
 * To the inviter, when a fractional they invited to connect claimed their seat through the link:
 * "Ana claimed her seat on Merlin through your invite". Their note is the conversation's first
 * message, so the email says that and links to it. Never an email address.
 */
export function connectEmail(o: { partner: string; company: string; link: string; settingsUrl?: string }) {
  const first = oneLine(o.partner).slice(0, 40) || "A fractional";
  const company = oneLine(o.company).slice(0, 80) || "their company";
  const subject = `${first} claimed their seat at ${company} through your invite`;
  const lead = `You're connected as referral partners on Merlin. Your note is the first message in your conversation, so say hello.`;
  const why = "You get at most one of these an hour for each conversation. Turn them off in Notifications on Merlin.";
  const from = "Merlin is a data exchange for fractional operators, from Revenue Nomad.";
  const note = footerNote();
  const link = oneLine(o.link);
  const settings = oneLine(o.settingsUrl);
  const text = [
    `${first} claimed their seat at ${company} through your invite.`,
    "",
    lead,
    "",
    "Open the conversation with this link. It signs you in once and works for 7 days.",
    link,
    "",
    "--",
    why,
    ...(settings ? ["Notifications", settings] : []),
    from,
    ...(note ? [note] : []),
  ].join("\n");
  const body = [
    mailH(`${escHtml(first)} is on Merlin`),
    mailP(`${escHtml(first)} claimed their seat at ${escHtml(company)} through your invite.`, "margin-bottom:16px;"),
    mailP(escHtml(lead), "margin-bottom:24px;"),
    mailButton(link, "Open the conversation", "margin:0 0 16px"),
  ].join("\n");
  const html = mailShell({ title: subject, preheader: lead.slice(0, 120), body, link, art: "letter", footer: [escHtml(why), settingsLink(settings), escHtml(from), note ? escHtml(note) : ""] });
  return { subject, text, html };
}

/** The footer's Notifications link (signed in, lib/emailIn.ts), or nothing. */
export const settingsLink = (url: string) => (/^https?:\/\//i.test(url) ? `<a href="${escHtml(url)}" style="color:${MAIL.muted};text-decoration:underline">Notifications</a>` : "");

/**
 * After an invite's conversation opened (lib/table.ts connectInvite): the inviter hears that the
 * partner is in, the way they hear about a message. An email (email on, message emails on, at most
 * one an hour for the conversation) and an alert in Slack or a webhook (lib/notify).
 */
export async function afterConnect(conversationId: string, origin?: string): Promise<void> {
  const s0 = await loadState();
  const c0 = (s0.conversations ?? []).find((x) => x.id === conversationId);
  if (!c0 || c0.kind !== "invite") return;
  // Slack or a webhook, if the inviter connected one (lib/notify).
  void import("./notify/events").then((n) => n.afterConnectAlert(conversationId)).catch((e) => console.error("connect alert failed", e));
  if (!emailEnabled()) return;
  const base = (publicBase() || origin || "").replace(/\/$/, "");
  const mail = await T.mutate((s, seed) => {
    const c = (s.conversations ?? []).find((x) => x.id === conversationId);
    if (!c) return null;
    const idx = T.memberIndex(seed, s);
    const inviter = idx.byId.get(c.a);
    const partner = idx.byId.get(c.b);
    const nowMs = Date.now();
    const last = Date.parse(c.notifiedAt?.a ?? "");
    if (!inviter?.email || !partner || s.profiles[inviter.id]?.messageEmailOff || (Number.isFinite(last) && nowMs - last < MESSAGE_LIMITS.emailEvery)) return null;
    const g = T.graph(seed, s);
    const hidden = T.identityHidden(g, s, idx, T.tracksOf(seed, s), inviter, c.about.companyId);
    const company = hidden ? "a company that is hiring" : g.companies.get(c.about.companyId)?.name ?? "";
    c.notifiedAt = { ...(c.notifiedAt ?? {}), a: new Date(nowMs).toISOString() };
    // The button signs them in once (7 days) and opens this conversation, as a message email's does.
    const { token: once } = addSignIn(s, inviter.id, "message", nowMs);
    const settingsUrl = emailLinker(seed, s, inviter.id, base, nowMs)(NOTIFICATIONS_PATH);
    return { to: inviter.email, ...connectEmail({ partner: T.firstName(partner.name), company, link: `${base}/?k=${encodeURIComponent(once)}&p=messages&m=${encodeURIComponent(c.id)}`, settingsUrl }) };
  });
  if (mail) void sendEmail(mail.to, mail.subject, mail.text, mail.html).catch((e) => console.error("connect email failed", e));
}

/* ---------- the actions ---------- */

type Outcome = { message: string; convId?: string; notify?: { to: string; subject: string; text: string; html: string } };

export async function performMessage(token: string | null, a: MessageAction, origin?: string): Promise<ActionResult> {
  const base = (publicBase() || origin || "").replace(/\/$/, "");
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
    /**
     * Room for one more new conversation: 5 started in any 24 hours, 30 open at once. An invite's
     * conversation opened when the partner claimed their seat, so it isn't one the inviter started today.
     */
    const roomForOne = () => {
      const started = convs.filter((c) => c.a === me.id && c.kind !== "invite" && nowMs - Date.parse(c.createdAt) < DAY).length;
      if (started >= MESSAGE_LIMITS.newPerDay) throw new ActionError("You can start 5 conversations a day. Reply in the ones you have, or start this one tomorrow.");
      const open = convs.filter((c) => c.status === "open" && (c.a === me.id || c.b === me.id)).length;
      if (open >= MESSAGE_LIMITS.open) throw new ActionError("You have 30 open conversations, which is the limit. Close one with Not now first.");
    };
    /** Write one message from me into `c`, with the limits and the email to the other side. */
    const write = (c: StoredConversation, raw: unknown): Outcome => {
      const text = cleanText(raw);
      if (sentToday() >= MESSAGE_LIMITS.sentPerDay) throw new ActionError("That's 60 messages today, which is the limit. Send more tomorrow.");
      const side = sideOf(c, me.id)!;
      const otherId = side === "a" ? c.b : c.a;
      if (!idx.byId.has(otherId)) throw new ActionError("This member isn't on Merlin anymore.");
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
        // The button signs them in once (7 days) and opens this conversation, as a sign-in email's link does.
        const { token: once } = addSignIn(s, otherId, "message", nowMs);
        const mail = messageEmail({
          from: T.firstName(me.name),
          company,
          holder: otherId === c.b,
          text,
          link: `${base}/?k=${encodeURIComponent(once)}&p=messages&m=${encodeURIComponent(c.id)}`,
          settingsUrl: emailLinker(seed, s, otherId, base, nowMs)(NOTIFICATIONS_PATH),
          ...(c.kind === "partners" ? { about: "working together as peers" } : c.kind === "team" ? { about: `teaming up on ${company}` } : {}),
        });
        notify = { to: other.email, ...mail };
      }
      return { message: "Sent.", convId: c.id, notify };
    };

    const run = (): Outcome => {
      switch (a.type) {
        case "message.start": {
          const engId = [...g.engagements.keys()].find((id) => T.pubId(id) === String(a.engagementId ?? ""));
          const e = engId ? g.engagements.get(engId) : undefined;
          if (!e) throw new ActionError("That seat isn't on Merlin anymore.");
          const holder = T.seatHolder(s, idx, e.id, T.valueOf(e, s, "operator"));
          if (!holder) throw new ActionError("Nobody on Merlin is linked to this seat, so there's no one to write to here.");
          if (holder.id === me.id) throw new ActionError("That's your own seat.");
          if (T.holderNameHidden(s, e, me.id, idx)) throw new ActionError("This fractional keeps their name private, so there's no one to write to here.");
          if (T.cellOf(s, me, e, "engagement", "operator", idx).s !== "value") throw new ActionError("Unlock who held this seat first. Then you can write to them.");
          const name = T.firstName(holder.name);
          if (!T.signedIn(s, idx, holder.id)) throw new ActionError(`${name} hasn't signed in to Merlin yet, so a message here wouldn't reach them. Try LinkedIn instead.`);
          if ((s.blocks?.[holder.id] ?? []).includes(me.id)) throw new ActionError(NOT_TAKING);
          if ((s.blocks?.[me.id] ?? []).includes(holder.id)) throw new ActionError(`You blocked ${name}. Unblock them in Messages to write again.`);
          // One conversation per pair and seat: writing again goes into the one there is.
          const existing = convs.find((c) => c.about.engagementId === e.id && ((c.a === me.id && c.b === holder.id) || (c.a === holder.id && c.b === me.id)));
          const seatRole = T.live(e, s, "role");
          if (existing) {
            const r0 = write(existing, a.text);
            pipelineSent(s, me.id, existing, holder, seatRole ? String(seatRole) : null, nowMs);
            return r0;
          }
          roomForOne();
          const c: StoredConversation = { id: newId("cv"), a: me.id, b: holder.id, about: { companyId: e.companyId, engagementId: e.id }, messages: [], readAt: {}, status: "open", createdAt: now };
          convs.push(c);
          const r = write(c, a.text);
          pipelineSent(s, me.id, c, holder, seatRole ? String(seatRole) : null, nowMs);
          // A conversation opened: in a Close trial's last days it runs a week longer, once (lib/billing).
          T.valueMoment(s, me.id, nowMs);
          return { ...r, message: `Sent. ${name} will see it in Messages.` };
        }
        case "message.connect": {
          // Message from Fractionals (Connect on Referral partners before it): a member in the directory, in a conversation about no seat. One per pair.
          const them = idx.all.find((m) => T.pubId(m.id) === String(a.memberId ?? ""));
          if (!them) throw new ActionError("That member isn't on Merlin anymore.");
          if (them.id === me.id) throw new ActionError("That's you.");
          const name = T.firstName(them.name);
          if (!T.signedIn(s, idx, them.id)) throw new ActionError(`${name} hasn't signed in to Merlin yet, so a message here wouldn't reach them.`);
          if ((s.blocks?.[them.id] ?? []).includes(me.id)) throw new ActionError(NOT_TAKING);
          if ((s.blocks?.[me.id] ?? []).includes(them.id)) throw new ActionError(`You blocked ${name}. Unblock them in Messages to write again.`);
          const pair = (c: StoredConversation) => (c.a === me.id && c.b === them.id) || (c.a === them.id && c.b === me.id);
          const existing = convs.find((c) => c.kind === "partners" && pair(c));
          if (existing) return write(existing, a.text);
          if (s.profiles[them.id]?.partnersOff || s.profiles[them.id]?.fractionals === false) throw new ActionError(`${name} isn't in the Fractionals directory right now.`);
          roomForOne();
          const c: StoredConversation = { id: newId("cv"), a: me.id, b: them.id, about: { companyId: "", engagementId: "" }, kind: "partners", messages: [], readAt: {}, status: "open", createdAt: now };
          convs.push(c);
          const r = write(c, a.text);
          // A conversation opened: in a Close trial's last days it runs a week longer, once (lib/billing).
          T.valueMoment(s, me.id, nowMs);
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
  // Alerts in Slack for the other side (lib/notify), when a message was written.
  if (out.convId && (a.type === "message.start" || a.type === "message.send" || a.type === "message.connect")) {
    const id = out.convId;
    void import("./notify/events").then((n) => n.afterMessage(id)).catch((e) => console.error("message alert failed", e));
  }
  // A reply in a conversation the other member started: their pipeline moves to Replied (lib/pipelineActions.ts).
  if (out.convId && a.type === "message.send") {
    const id = out.convId;
    void (async () => {
      const c = (await loadState()).conversations?.find((x) => x.id === id);
      if (c) await (await import("./pipelineActions")).detectNow(c.a);
    })().catch((e) => console.error("pipeline detect failed", e));
  }
  return { message: out.message, ...(out.convId ? { id: out.convId } : {}), ...(out.rec ? { conversation: out.rec } : {}), unread: out.unread };
}
