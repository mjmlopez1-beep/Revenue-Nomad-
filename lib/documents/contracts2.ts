/**
 * Contracts, rebuilt the Dropbox Sign way (RN_CONTRACTS2, off by default; off, nothing here is
 * reachable and every other path is as before). The server already did almost all of it
 * (lib/documents/store.ts, lib/proposals/store.ts, lib/close): this file adds what the new page needs.
 *
 *   signingList   one list of everything sent for signature: the member's contracts (drafts too) and
 *                 their sent proposals, each with one status (Draft, Awaiting <names>, Awaiting you,
 *                 Completed, Declined, Expired, Canceled) and one action (Continue, Remind, Sign now,
 *                 Download, Send again), plus what the send flow starts from (saved contracts, the
 *                 member's proposals, people from their pipeline and proposals)
 *   remindNow     email whoever's turn it is again, at most once a day per signer, on the audit trail
 *   signerLink    the current signer's own link for the member (it still asks for the email code)
 *   cancelItem    void it and send one short email to each signer who had a link
 *
 * Just me and "Send a copy to" live in sendDocument and finish (store.ts), under the same switch.
 */
import { loadSeed, loadState, tableInternals as T, type State } from "../table";
import { emailEnabled, sendEmail } from "../email";
import { ProposalProblem, companyFor, recOf, signLink, statusOf, voidProposal, proposalInternals as PI } from "../proposals/store";
import { proposalEmail } from "../proposals/emails";
import type { StoredProposal, StoredSend } from "../proposals/types";
import { contracts2On, docStatus, documentInternals as DI, mineDoc, turnOf, voidDocument } from "./store";
import { REMIND_NOTE, docCanceledEmail, docInviteEmail } from "./emails";
import { listSaved, type SavedContract } from "./templates";
import type { StoredDocument } from "./types";

const DAY = 86_400_000;
export const OFF = "That isn't switched on.";
export const REMIND_GAP_MS = DAY;

export type RowStatus = "draft" | "awaiting" | "you" | "completed" | "declined" | "expired" | "canceled";
export type RowAction = "continue" | "remind" | "sign" | "download" | "again";
export const ACTION_SAY: Record<RowAction, string> = { continue: "Continue", remind: "Remind", sign: "Sign now", download: "Download", again: "Send again" };

export interface SignRow {
  id: string;
  kind: "contract" | "proposal";
  title: string;
  /** The other side's names, "Mei Tan and Leo Park". */
  with: string;
  company: string;
  status: RowStatus;
  /** "Awaiting Dana", "Awaiting you", "Completed". */
  words: string;
  action: RowAction;
  /** The date the row shows: completed, else sent, else last changed. */
  at: string;
  sentAt: string | null;
  /** Download of the signed PDF, once complete. */
  download: string | null;
  /** Where a proposal opens (Proposals), or null for a contract (its detail here). */
  href: string | null;
}

export interface Contracts2View {
  on: true;
  rows: SignRow[];
  me: { name: string; email: string; title: string };
  /** Sending for signature: Trial and Pro and Close (as today). */
  canSend: boolean;
  /** Merlin reads and places the fields, and the automatic reminders: Close (the trial included). */
  canClose: boolean;
  email: boolean;
  saved: SavedContract[];
  /** The member's proposals not out for signature, to start from. */
  proposals: { id: string; title: string; company: string; signer: { name: string; email: string; title: string } | null; status: string }[];
  /** People from their pipeline and proposals, for one-tap signer rows. */
  people: { name: string; email: string; title: string; company: string }[];
}

const first = (s: string) => s.trim().split(/\s+/)[0] || s;
const names = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const currentSend = (p: StoredProposal): StoredSend | null => [...p.sends].reverse().find((x) => x.version === p.version) ?? null;

function docRow(d: StoredDocument, nowMs: number): SignRow {
  const st = docStatus(d, nowMs);
  const others = d.signers.filter((x) => !x.sender);
  const base = { id: d.id, kind: "contract" as const, title: d.title, with: names(others.map((x) => x.name)), company: d.companyName, sentAt: d.sentAt ?? null, download: null as string | null, href: null };
  if (st === "signed") return { ...base, status: "completed", words: "Completed", action: "download", at: d.completed?.at ?? d.updatedAt, download: `/api/documents/file?id=${encodeURIComponent(d.id)}&final=1&download=1` };
  if (st === "declined") return { ...base, status: "declined", words: "Declined", action: "again", at: d.updatedAt };
  if (st === "void") return { ...base, status: "canceled", words: "Canceled", action: "again", at: d.voided?.at ?? d.updatedAt };
  if (st === "expired") return { ...base, status: "expired", words: "Expired", action: "again", at: d.expiresAt ?? d.updatedAt };
  if (st === "draft") return { ...base, status: "draft", words: "Draft", action: "continue", at: d.updatedAt };
  const turn = turnOf(d);
  if (turn.some((x) => x.sender)) return { ...base, status: "you", words: "Awaiting you", action: "sign", at: d.sentAt ?? d.updatedAt };
  return { ...base, status: "awaiting", words: `Awaiting ${names(turn.map((x) => first(x.name)))}`, action: "remind", at: d.sentAt ?? d.updatedAt };
}

function proposalRow(p: StoredProposal, nowMs: number, origin?: string): SignRow | null {
  const x = currentSend(p) ?? p.sends[p.sends.length - 1];
  if (!x) return null;
  const st = statusOf(p, nowMs);
  const rec = recOf(p, nowMs, origin);
  const href = `/?p=proposals&pr=${encodeURIComponent(p.id)}`;
  const base = { id: p.id, kind: "proposal" as const, title: p.title || x.doc.title, with: x.signer.name, company: p.companyName, sentAt: x.sentAt, download: null as string | null, href };
  switch (st) {
    case "signed":
      return { ...base, status: "completed", words: "Completed", action: "download", at: x.member?.at ?? x.signed?.at ?? x.sentAt, download: rec.send?.sealed?.pdf ?? rec.send?.copyUrl ?? null };
    case "client_signed":
      return { ...base, status: "you", words: "Awaiting you", action: "sign", at: x.signed?.at ?? x.sentAt };
    case "declined":
      return { ...base, status: "declined", words: "Declined", action: "again", at: x.declined?.at ?? x.sentAt };
    case "void":
      return { ...base, status: "canceled", words: "Canceled", action: "again", at: x.voided?.at ?? x.sentAt };
    case "expired":
      return { ...base, status: "expired", words: "Expired", action: "again", at: x.expiresAt ?? x.sentAt };
    case "draft":
      // A new version not sent yet: the proposal is Proposals' to finish.
      return { ...base, status: "draft", words: "Draft", action: "continue", at: p.updatedAt };
    default:
      return { ...base, status: "awaiting", words: `Awaiting ${first(x.signer.name)}`, action: "remind", at: x.sentAt };
  }
}

/** Every row, newest first. */
export function rowsOf(s: State, memberId: string, nowMs = Date.now(), origin?: string): SignRow[] {
  const docs = (s.documents ?? []).filter((d) => d.memberId === memberId && !d.saved).map((d) => docRow(d, nowMs));
  const props = (s.proposals ?? []).filter((p) => p.memberId === memberId && p.sends.length).flatMap((p) => proposalRow(p, nowMs, origin) ?? []);
  return [...docs, ...props].sort((a, b) => b.at.localeCompare(a.at));
}

const need = () => {
  if (!contracts2On()) throw new ProposalProblem(OFF, 404);
};

export async function signingList(token: string | null, origin?: string, nowMs = Date.now()): Promise<Contracts2View> {
  need();
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = PI.memberOf(seed, s, token);
  const people: Contracts2View["people"] = [];
  const seen = new Set<string>();
  // People with an email first: the member's own proposals' signers.
  for (const p of [...(s.proposals ?? [])].filter((x) => x.memberId === me.id && x.signer?.email).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const k = p.signer!.email.toLowerCase();
    if (seen.has(k) || people.length >= 6) continue;
    seen.add(k);
    people.push({ name: p.signer!.name, email: p.signer!.email, title: p.signer!.title ?? "", company: p.companyName });
  }
  // Then whoever a pipeline deal is with (no email on file there): a name to finish. Never a Google contact, never a locked company's name.
  for (const e of [...(s.pipeline?.[me.id]?.entries ?? [])].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))) {
    if (people.length >= 6) break;
    const nm = e.to?.name?.trim();
    if (!nm || e.to?.google || people.some((x) => x.name === nm)) continue;
    const co = token ? await companyFor(token, T.pubId(e.companyId)).catch(() => null) : null;
    people.push({ name: nm, email: "", title: e.to?.role ?? "", company: co && !co.hidden ? co.name : "" });
  }
  const free = PI.onFree(s, me.id, nowMs);
  return {
    on: true,
    rows: rowsOf(s, me.id, nowMs, origin),
    me: { name: me.name, email: me.email, title: PI.titleOf(s, me) },
    canSend: !free,
    canClose: T.closeNow(s, me.id, nowMs),
    email: emailEnabled(),
    saved: await listSaved(token),
    proposals: (s.proposals ?? [])
      .filter((p) => p.memberId === me.id && !["sent", "viewed", "client_signed", "signed"].includes(statusOf(p, nowMs)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 12)
      .map((p) => ({ id: p.id, title: p.title, company: p.companyName, signer: p.signer ? { name: p.signer.name, email: p.signer.email, title: p.signer.title ?? "" } : null, status: statusOf(p, nowMs) })),
    people,
  };
}

/**
 * Remind now: whoever's turn it is gets the signing email again with one line on top. At most once
 * a day for each signer; the member can't remind themselves (it's their turn: Sign now).
 */
export async function remindNow(token: string | null, id: string, origin?: string, nowMs = Date.now()): Promise<{ message: string; reminded: string[] }> {
  need();
  if (!emailEnabled()) throw new ProposalProblem("Email isn't set up on this server, so a reminder can't go out.");
  const [seed, s0] = await Promise.all([loadSeed(), loadState()]);
  const me = PI.memberOf(seed, s0, token);
  const now = new Date(nowMs).toISOString();
  const soon = (at: string | undefined) => !!at && nowMs - Date.parse(at) < REMIND_GAP_MS;
  const memberTitle = PI.titleOf(s0, me);
  const p0 = (s0.proposals ?? []).find((x) => x.id === id && x.memberId === me.id);
  if (p0) {
    const x0 = currentSend(p0);
    const st = statusOf(p0, nowMs);
    if (!x0 || (st !== "sent" && st !== "viewed")) throw new ProposalProblem(st === "client_signed" ? "They signed. It's your turn: Sign now." : "It isn't waiting for anyone.");
    if (soon(x0.remindedAt)) throw new ProposalProblem(`You reminded ${first(x0.signer.name)} today. You can again tomorrow.`, 429);
    const mail = proposalEmail({ signer: x0.signer.name, member: me.name, memberTitle, title: x0.doc.title, company: x0.doc.company, link: signLink(origin, x0), expiresAt: x0.expiresAt, note: REMIND_NOTE });
    if (!(await sendEmail(x0.signer.email, `Reminder: ${mail.subject}`, mail.text, mail.html, me.email ? { replyTo: me.email } : {}))) throw new ProposalProblem("The reminder didn't go out. Try again in a moment.", 502);
    await T.mutate((s) => {
      const x = (s.proposals ?? []).find((p) => p.id === id)?.sends.find((y) => y.id === x0.id);
      if (x) (x.remindedAt = now), x.events.push({ kind: "reminded", at: now, note: `Reminder sent to ${x.signer.email}` });
    });
    return { message: `Reminded ${first(x0.signer.name)}.`, reminded: [x0.signer.name] };
  }
  const d0 = mineDoc(s0, me.id, id);
  if (!DI.live(d0, nowMs)) throw new ProposalProblem(docStatus(d0, nowMs) === "signed" ? "Everyone signed it." : "It isn't waiting for anyone.");
  const turn = turnOf(d0);
  const theirs = turn.filter((x) => !x.sender);
  if (!theirs.length) throw new ProposalProblem("It's your turn. Sign now.");
  const due = theirs.filter((x) => !soon(d0.reminded?.[x.id]));
  if (!due.length) throw new ProposalProblem(`You reminded ${names(theirs.map((x) => first(x.name)))} today. You can again tomorrow.`, 429);
  const ok: string[] = [];
  for (const x of due) {
    const mail = docInviteEmail({ signer: x.name, member: me.name, memberTitle, title: d0.title, link: DI.signLinkOf(origin, d0, x), expiresAt: d0.expiresAt ?? null, note: REMIND_NOTE });
    if (await sendEmail(x.email, `Reminder: ${mail.subject}`, mail.text, mail.html, me.email ? { replyTo: me.email } : {})) ok.push(x.id);
  }
  if (!ok.length) throw new ProposalProblem("The reminder didn't go out. Try again in a moment.", 502);
  await T.mutate((s) => {
    const d = (s.documents ?? []).find((y) => y.id === id);
    if (!d) return;
    for (const x of d.signers.filter((y) => ok.includes(y.id))) {
      d.reminded = { ...(d.reminded ?? {}), [x.id]: now };
      DI.ev(d, "reminded", now, { who: x.email, note: "Reminder sent by the sender" });
    }
  });
  const who = d0.signers.filter((x) => ok.includes(x.id)).map((x) => first(x.name));
  return { message: `Reminded ${names(who)}.`, reminded: who };
}

/** The current signer's own link, for the member to pass on. It still asks for the code emailed to that signer. */
export async function signerLink(token: string | null, id: string, signer?: unknown, origin?: string, nowMs = Date.now()): Promise<{ link: string; name: string }> {
  need();
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = PI.memberOf(seed, s, token);
  const p = (s.proposals ?? []).find((x) => x.id === id && x.memberId === me.id);
  if (p) {
    const x = currentSend(p);
    const st = statusOf(p, nowMs);
    if (!x || (st !== "sent" && st !== "viewed")) throw new ProposalProblem("There's no live link to copy.");
    return { link: signLink(origin, x), name: x.signer.name };
  }
  const d = mineDoc(s, me.id, id);
  if (!DI.live(d, nowMs)) throw new ProposalProblem("There's no live link to copy.");
  const turn = turnOf(d).filter((x) => !x.sender);
  const x = typeof signer === "string" && signer ? turn.find((y) => y.id === signer) : turn[0];
  if (!x) throw new ProposalProblem(turnOf(d).some((y) => y.sender) ? "It's your turn. Sign now." : "It isn't their turn yet.");
  return { link: DI.signLinkOf(origin, d, x), name: x.name };
}

/** Cancel: the links stop working, and each signer who had one gets a short email saying so. */
export async function cancelItem(token: string | null, id: string, origin?: string, nowMs = Date.now()): Promise<{ message: string; told: number }> {
  need();
  const [seed, s0] = await Promise.all([loadSeed(), loadState()]);
  const me = PI.memberOf(seed, s0, token);
  const p0 = (s0.proposals ?? []).find((x) => x.id === id && x.memberId === me.id);
  let to: { name: string; email: string }[];
  let title: string;
  if (p0) {
    const x = currentSend(p0)!;
    await voidProposal(token, id, origin, nowMs);
    to = x ? [{ name: x.signer.name, email: x.signer.email }] : [];
    title = x?.doc.title ?? p0.title;
  } else {
    const d0 = mineDoc(s0, me.id, id);
    await voidDocument(token, id, origin, nowMs);
    to = d0.signers.filter((x) => !x.sender && x.notifiedAt).map((x) => ({ name: x.name, email: x.email }));
    title = d0.title;
  }
  const sent: string[] = [];
  if (emailEnabled())
    for (const r of to) {
      const mail = docCanceledEmail({ signer: r.name, member: me.name, title });
      if (await sendEmail(r.email, mail.subject, mail.text, mail.html, me.email ? { replyTo: me.email } : {})) sent.push(r.email);
    }
  if (sent.length) {
    const at = new Date(nowMs).toISOString();
    await T.mutate((s) => {
      const p = (s.proposals ?? []).find((x) => x.id === id);
      const x = p ? currentSend(p) : null;
      if (x) x.events.push({ kind: "cancel_sent", at, note: `Told ${sent.join(", ")}` });
      const d = (s.documents ?? []).find((y) => y.id === id);
      if (d) DI.ev(d, "cancel_sent", at, { note: `Told ${sent.join(", ")}` });
    });
  }
  return { message: sent.length ? `Canceled. We told ${names(to.filter((r) => sent.includes(r.email)).map((r) => first(r.name)))}.` : "Canceled. The links stopped working.", told: sent.length };
}
