/**
 * The invite loop: telling a member that a fractional joined Merlin from their invite, once per
 * invitee (lib/table.ts announceJoin decides when). It goes out the way Invite to connect's claim
 * notice does (lib/messages.ts afterConnect): the app shows the line (Me.joined), an email goes when
 * email is on and the member's message emails are on, and Slack or a webhook gets it as a message
 * alert. Every one of them names the invitee by first name only, never their email.
 */
import { loadState, tableInternals as T, type JoinNews } from "../table";
import { REFERRAL_BONUS } from "../tableFields";
import { emailEnabled, escHtml, footerNote, mailButton, mailH, mailP, mailShell, oneLine, sendEmail } from "../email";
import { addSignIn } from "../signin";
import { NOTIFICATIONS_PATH, emailLinker } from "../emailIn";
import { joinedHeadline } from "./format";
import { baseOf, deliver } from "./index";

/**
 * To the inviter: "Sam joined Merlin from your invite". `both`: they both get REFERRAL_BONUS when
 * Sam adds a first fact (left out past REFERRAL_LIMIT). The button signs them in once and opens
 * Merlin, as a message email's does. Never an email address.
 */
export function joinedEmail(o: { first: string; both: boolean; bonus: number; link: string; settingsUrl?: string }) {
  const first = oneLine(o.first).slice(0, 40) || "A fractional";
  const subject = joinedHeadline(first);
  const lead = o.both ? `You both get ${o.bonus} credits when ${first} adds a first fact.` : `Thanks for bringing ${first} in.`;
  const why = "We tell you once for each fractional who joins from your invite. Turn these off with message emails in Notifications on Merlin.";
  const from = "Merlin is a data exchange for fractional operators, from Revenue Nomad.";
  const note = footerNote();
  const link = oneLine(o.link);
  const settings = oneLine(o.settingsUrl);
  const text = [`${subject}.`, "", lead, "", "Open Merlin with this link. It signs you in once and works for 7 days.", link, "", "--", why, ...(settings ? ["Notifications", settings] : []), from, ...(note ? [note] : [])].join("\n");
  const body = [
    mailH(`${escHtml(first)} is on Merlin`),
    mailP(`${escHtml(first)} joined from your invite.`, "margin-bottom:16px;"),
    mailP(escHtml(lead), "margin-bottom:24px;"),
    mailButton(link, "Open Merlin", "margin:0 0 16px"),
  ].join("\n");
  const html = mailShell({ title: subject, preheader: lead.slice(0, 120), body, link, footer: [escHtml(why), /^https?:\/\//i.test(settings) ? `<a href="${escHtml(settings)}" style="color:#5B6661;text-decoration:underline">Notifications</a>` : "", escHtml(from), note ? escHtml(note) : ""] });
  return { subject, text, html };
}

/** Tell the inviter, once (announceJoin has marked it told): the alert in Slack or a webhook, and the email. */
export async function afterJoin(news: JoinNews): Promise<void> {
  const bonus = news.both ? REFERRAL_BONUS : 0;
  void deliver(news.inviterId, {
    kind: "message",
    at: news.at,
    conversationId: "",
    from: news.first,
    company: "",
    holder: false,
    snippet: "",
    about: "joined",
    ...(bonus ? { bonus } : {}),
  });
  if (!emailEnabled()) return;
  const base = baseOf(await loadState());
  const mail = await T.mutate((s, seed) => {
    const inviter = T.memberIndex(seed, s).byId.get(news.inviterId);
    if (!inviter?.email || s.profiles[inviter.id]?.messageEmailOff) return null;
    const { token: once } = addSignIn(s, inviter.id, "message");
    const settingsUrl = emailLinker(seed, s, inviter.id, base, Date.now())(NOTIFICATIONS_PATH);
    return { to: inviter.email, ...joinedEmail({ first: news.first, both: news.both, bonus: REFERRAL_BONUS, link: `${base}/?k=${encodeURIComponent(once)}`, settingsUrl }) };
  });
  if (mail) await sendEmail(mail.to, mail.subject, mail.text, mail.html).catch((e) => console.error("join email failed", e));
}
