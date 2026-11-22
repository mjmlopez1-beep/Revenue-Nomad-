/**
 * After a proposal or document goes out, on the server (lib/close): the signing page's beacons,
 * the member's activity view, the alerts (in Merlin, by email through Resend, in Slack through
 * lib/notify), the reminders to the signer and the renewal reminder to the member. Every change
 * goes through lib/table.ts mutate. Close only (canClose; the trial counts): for anyone else
 * nothing is recorded, sent or shown but the upgrade prompt.
 *
 * Readers: the signing page sends beacons with the link's token (POST /api/sign/activity). A
 * browser is told apart from another by a random id in a cookie (READER_COOKIE), kept here only as
 * an HMAC: never by IP address, never by fingerprinting. The member who sent it, signed in, is
 * never counted as a reader. Nothing is counted once the link is signed, declined, withdrawn or
 * expired.
 *
 * Alerts: first open (at once), a new reader (once their first visit settles, READER_SETTLE_MS),
 * engaged (lib/close/rules.ts, at most one per item every 6 hours), signed or declined (from the
 * sign route), and the renewal (30 days before the term ends). Each kind can be switched per
 * channel in Notifications: on by default, Slack only when Slack is connected. The signed copy
 * and a decline already come by email (lib/proposals/emails.ts), so those two never email twice.
 *
 * The job scheduler's tick (lib/jobs.ts) runs closeTick: due reminders, engaged alerts that waited
 * for their window or are about time (quiet, opened but not signed), new readers, renewals.
 */
import { createHmac, randomBytes } from "crypto";
import { loadSeed, loadState, memberByToken, tableInternals as T, type Seed, type State } from "../table";
import { emailEnabled, sendEmail } from "../email";
import { upgradeUrl } from "../plan";
import { NOTIFICATIONS_PATH, emailLinker } from "../emailIn";
import { baseOf, connectedFor, postNow, track } from "../notify/index";
import { LIMITS, ProposalProblem, awaitingMember, buildGate, copyLink, fullySignedAt, proposalInternals as PI, readCopyToken, readSignToken, recOf, signLink, statusOf, type ClientQuestionEvent, type HandOffEvent, type SignedEvent } from "../proposals/store";
import { docCopyLink, docSignToken, docStatus, readDocCopyToken, readDocSignToken, turnOf } from "../documents/store";
import { proposalEmail } from "../proposals/emails";
import { docInviteEmail } from "../documents/emails";
import { docFields } from "../proposals/library";
import { pipelineEvent } from "../proposals/pipelineHook";
import { CLOSE_BUILD } from "../proposals/mine";
import type { ProposalRec, StoredProposal, StoredSend } from "../proposals/types";
import type { DocSigner, StoredDocument } from "../documents/types";
import { addonsOn, applyBeacon, emptyActivity, firstName, lastActivity, minWords, normalize, optionNow, optionsLooked, ordinal, parseBeacon, pricingVisits, timesWords, totalMs, totalVisits } from "./activity";
import { alertWords, reminderInbox, type AlertFacts } from "./alerts";
import { REMINDER_SAY, dueReminders, reminderNote, reminderRows, type LinkInfo } from "./reminders";
import { daysTo, dayOfText, renewalDue, renewalFields, shortDay, termEndOf, termsLine } from "./renewal";
import { engagedDue, suggest } from "./rules";
import {
  CAPS, CHANNELS, CLOSE_ALERT_KINDS, DISCLOSURE, READER_COOKIE, deviceOf, emptyClose, linkEnd, linkExpired, prefOn,
  type ActivityView, type AlertPrefs, type Channel, type CloseAlertKind, type CloseInboxView, type CloseState, type InboxItem, type ItemActivity, type ReminderKey,
} from "./types";

export { READER_COOKIE };
const DAY = 86_400_000;
/** A new reader is told about once their first visit has been quiet this long, so the alert can say what they read. */
export const READER_SETTLE_MS = 10 * 60_000;
const GONE = "This link doesn't work. Ask the sender for a new one.";
const { memberOf, memberFor, titleOf } = PI;

const closeOf = (s: State): CloseState => {
  s.close ??= emptyClose();
  s.close.items ??= {};
  s.close.inbox ??= {};
  s.close.prefs ??= {};
  return s.close;
};
const itemOf = (s: State, id: string, kind: ItemActivity["kind"], memberId: string): ItemActivity => {
  const c = closeOf(s);
  return normalize((c.items[id] ??= emptyActivity(kind, memberId)));
};
const peek = (s: State, id: string): ItemActivity | null => (s.close?.items?.[id] ? normalize(s.close.items[id]) : null);
/**
 * When the renewal clock starts: the signature, or, for a proposal the member countersigns, the
 * countersignature (fully signed). Null while it waits for the countersignature.
 */
const signedSend = (p: StoredProposal) => [...p.sends].reverse().find((x) => x.signed) ?? null;
const signedBase = (_it: ItemActivity | null | undefined, p: StoredProposal): string | null => {
  const x = signedSend(p);
  return x ? fullySignedAt(x) : null;
};
/** The client signed and the member's countersignature is still to come (lib/proposals/store.ts signingState "client_signed"). */
const waitsForMember = (p: StoredProposal | null | undefined): boolean => {
  const x = p ? signedSend(p) : null;
  return !!x && awaitingMember(x);
};
const devOf = (cookie: string) => createHmac("sha256", T.ID_KEY).update(`rn-reader:${cookie}`).digest("base64url").slice(0, 22);
const COOKIE_RE = /^[A-Za-z0-9_-]{22,43}$/;
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, CAPS.id);

/* ---------- what a signing link points at ---------- */

type Target =
  | { kind: "proposal"; itemId: string; memberId: string; link: string; open: boolean; p: StoredProposal; x: StoredSend }
  | { kind: "document"; itemId: string; memberId: string; link: string; open: boolean; d: StoredDocument; x: DocSigner };

/**
 * What a signed copy's link points at (/signed/<token>: a proposal's send, or a completed
 * document), or a signing link whose own signature is in. Only a download of the signed PDF is
 * counted through these: nothing is read once it is signed.
 */
function signedTarget(s: State, raw: unknown, nowMs: number): { kind: "proposal" | "document"; itemId: string; memberId: string; link: string } | null {
  const t = target(s, raw, nowMs);
  if (t) return t.kind === "proposal" ? (t.x.signed ? { kind: t.kind, itemId: t.itemId, memberId: t.memberId, link: t.link } : null) : t.x.signed ? { kind: t.kind, itemId: t.itemId, memberId: t.memberId, link: t.link } : null;
  const sendId = readCopyToken(raw);
  if (sendId) {
    for (const p of s.proposals ?? []) {
      const x = p.sends.find((y) => y.id === sendId);
      if (x) return x.signed ? { kind: "proposal", itemId: p.id, memberId: p.memberId, link: x.id } : null;
    }
    return null;
  }
  const docId = readDocCopyToken(raw);
  const d = docId ? (s.documents ?? []).find((y) => y.id === docId) : null;
  return d && d.completed ? { kind: "document", itemId: d.id, memberId: d.memberId, link: d.id } : null;
}

const currentSend = (p: StoredProposal) => [...p.sends].reverse().find((x) => x.version === p.version) ?? null;
const sendOpen = (x: StoredSend, nowMs: number) => !x.signed && !x.declined && !x.voided && !linkExpired(x.expiresAt, nowMs);
/**
 * A signing token's expiry part matches the link's: its end in ms, or NO_END_TOKEN_MS for a link
 * with no end date (closeC3). The one place that ties a token to a send's expiry.
 */
export const NO_END_TOKEN_MS = 0;
const sameEnd = (expiresAt: string | null | undefined, expMs: number) => (linkEnd(expiresAt) ?? NO_END_TOKEN_MS) === expMs;
const docOpen = (d: StoredDocument, x: DocSigner, nowMs: number) => ["sent", "viewed"].includes(docStatus(d, nowMs)) && !x.signed && !x.declined;

function target(s: State, raw: unknown, nowMs: number): Target | null {
  const pt = readSignToken(raw);
  if (pt) {
    for (const p of s.proposals ?? []) {
      const x = p.sends.find((y) => y.id === pt.sendId);
      if (x) return sameEnd(x.expiresAt, pt.expMs) ? { kind: "proposal", itemId: p.id, memberId: p.memberId, link: x.id, open: sendOpen(x, nowMs), p, x } : null;
    }
    return null;
  }
  const dt = readDocSignToken(raw);
  if (dt) {
    for (const d of s.documents ?? []) {
      const x = d.signers.find((y) => y.id === dt.signerId);
      if (x) return d.sentAt && sameEnd(d.expiresAt, dt.expMs) ? { kind: "document", itemId: d.id, memberId: d.memberId, link: x.id, open: docOpen(d, x, nowMs), d, x } : null;
    }
  }
  return null;
}

/** A section's or option's label as the member reads it: from the document itself when it can be. */
function labeller(t: Target) {
  return (kind: "sec" | "opt" | "addon", id: string, fromPage: string | undefined): string | null => {
    if (t.kind === "document") {
      const m = kind === "sec" ? id.match(/^p(\d{1,4})$/) : null;
      return m && +m[1] < t.d.pages.length ? `Page ${+m[1] + 1}` : null;
    }
    if (kind === "sec") {
      const blocks = t.x.doc.blocks;
      const m = id.match(/^b(\d{1,3})$/);
      if (m) return blocks[+m[1]]?.title?.slice(0, CAPS.label) ?? null;
      const hit = blocks.find((b) => slug(b.title) === id);
      if (hit) return hit.title.slice(0, CAPS.label);
    }
    // An option or add-on the proposal itself offers (lib/proposals/pricing.ts): its own name, whatever the page said.
    const pr = t.x.doc.pricing;
    const own = kind === "opt" ? pr?.options.find((o) => o.id === id)?.name : kind === "addon" ? pr?.addOns.find((o) => o.id === id)?.name : undefined;
    if (own) return own.slice(0, CAPS.label);
    return fromPage ?? null;
  };
}

/* ---------- the beacon ---------- */

export interface BeaconAnswer {
  status: number;
  body: Record<string, unknown>;
  /** A new reader cookie to set. */
  cookie?: string;
}

/**
 * One beacon from a signing page. Signed out: the link's token is the only key, and it must be a
 * live one. Refused in words when the body or the token doesn't check out; answered `off` (and
 * nothing kept) when the link is no longer open, the sender is reading their own, or the sender
 * isn't on Close.
 */
export async function recordBeacon(a: { token: unknown; events: unknown; cookie: string | null; ua: string; memberToken: string | null }, nowMs = Date.now()): Promise<BeaconAnswer> {
  const parsed = parseBeacon(a.events);
  if (!parsed) return { status: 400, body: { error: "That didn't go through." } };
  const [seed, s0] = await Promise.all([loadSeed(), loadState()]);
  const t0 = target(s0, a.token, nowMs);
  if (!t0 || !t0.open) {
    // Signed: a download of the signed PDF is still told to the sender (from the signing page, or the signed copy's own link). Nothing else.
    const d0 = signedTarget(s0, a.token, nowMs);
    if (!d0) return t0 ? { status: 200, body: { ok: true, off: true } } : { status: 404, body: { error: GONE } };
    const mine = a.memberToken ? memberByToken(seed, a.memberToken, s0) : null;
    if (!parsed.events.some((e) => e.t === "dl") || mine?.id === d0.memberId || !T.closeNow(s0, d0.memberId, nowMs)) return { status: 200, body: { ok: true, off: true } };
    const fresh = !a.cookie || !COOKIE_RE.test(a.cookie);
    const cookie = fresh ? randomBytes(16).toString("base64url") : a.cookie!;
    await T.mutate((s) => {
      const d = signedTarget(s, a.token, nowMs);
      if (!d) return;
      const it = itemOf(s, d.itemId, d.kind, d.memberId);
      const at = new Date(nowMs).toISOString();
      // Told apart only when this browser read it before; a download makes no new reader.
      const r = it.readers.find((y) => y.dev === devOf(cookie))?.id ?? "";
      // One a minute from one browser is one download.
      if (it.downloads.some((y) => y.r === r && nowMs - Date.parse(y.at) < 60_000)) return;
      it.downloads.push({ r, at });
      if (it.downloads.length > CAPS.downloads) it.downloads.splice(0, it.downloads.length - CAPS.downloads);
      it.raw.push({ at, r, t: "dl" });
      if (it.raw.length > CAPS.raw) it.raw.splice(0, it.raw.length - CAPS.raw);
    });
    return { status: 200, body: { ok: true }, ...(fresh ? { cookie } : {}) };
  }
  const me = a.memberToken ? memberByToken(seed, a.memberToken, s0) : null;
  if (me && me.id === t0.memberId) return { status: 200, body: { ok: true, off: true } };
  if (!T.closeNow(s0, t0.memberId, nowMs)) return { status: 200, body: { ok: true, off: true } };
  const fresh = !a.cookie || !COOKIE_RE.test(a.cookie);
  const cookie = fresh ? randomBytes(16).toString("base64url") : a.cookie!;
  if (!parsed.events.length) {
    if (parsed.bad)
      await T.mutate((s) => {
        const it = s.close?.items?.[t0.itemId];
        if (it) it.dropped = (it.dropped ?? 0) + parsed.bad;
      });
    return { status: 200, body: { ok: true }, ...(fresh ? { cookie } : {}) };
  }
  const device = deviceOf(a.ua);
  const out = await T.mutate((s) => {
    const t = target(s, a.token, nowMs);
    if (!t || !t.open) return null;
    const it = itemOf(s, t.itemId, t.kind, t.memberId);
    const r = applyBeacon(it, { dev: devOf(cookie), link: t.link, device, label: labeller(t) }, parsed.events, nowMs);
    it.dropped += parsed.bad;
    if (!r) return { facts: [] as AlertFacts[] };
    const facts: AlertFacts[] = [];
    if (r.firstOnLink && !it.alerts.opened.includes(t.link)) {
      it.alerts.opened.push(t.link);
      it.alerts.readers.push(r.reader.id);
      const sentAt = t.kind === "proposal" ? t.x.sentAt : t.x.notifiedAt ?? t.d.sentAt ?? null;
      facts.push({ ...baseFacts(s, t), kind: "open", device: r.reader.device, ...(sentAt ? { afterMs: Math.max(0, nowMs - Date.parse(sentAt)) } : {}) });
    }
    const e = engagedFacts(s, t, it, nowMs);
    if (e) facts.push(e);
    return { facts };
  });
  for (const f of out?.facts ?? []) void dispatch(t0.memberId, f, nowMs);
  return { status: 200, body: { ok: true }, ...(fresh ? { cookie } : {}) };
}

/* ---------- the facts an alert says ---------- */

const appPath = (t: { kind: "proposal" | "document"; itemId: string }, extra = "") => `/?p=proposals&${t.kind === "proposal" ? "pr" : "dc"}=${encodeURIComponent(t.itemId)}${extra}`;

function baseFacts(s: State, t: Target): Omit<AlertFacts, "kind"> {
  return t.kind === "proposal"
    ? { item: t.itemId, what: "proposal", title: t.x.doc.title, company: t.x.doc.company || t.p.companyName, signer: t.x.signer.name, url: appPath(t) }
    : { item: t.itemId, what: "document", title: t.d.title, company: t.d.companyName, signer: t.x.name, url: appPath(t) };
}

/** What the rules read for an item. */
function ruleInputOf(s: State, it: ItemActivity | null, kind: "proposal" | "document", id: string, nowMs: number) {
  if (kind === "proposal") {
    const p = (s.proposals ?? []).find((x) => x.id === id);
    const x = p ? currentSend(p) : null;
    if (!p || !x) return null;
    const d2 = !it?.reminders.off.d2 && !it?.reminders.sent[`${x.id}:d2`] && !x.viewedAt;
    const st = statusOf(p, nowMs);
    // A link with no end date never expires, whatever an older status function says.
    return { a: it, status: st === "expired" && linkEnd(x.expiresAt) === null ? (x.viewedAt ? "viewed" : "sent") : st, sentAt: x.sentAt, signer: x.signer.name, company: p.companyName, reminderComing: d2, declineReason: x.declined?.reason ?? null, nowMs };
  }
  const d = (s.documents ?? []).find((x) => x.id === id);
  if (!d) return null;
  const who = d.signers.find((x) => !x.sender) ?? d.signers[0];
  const d2 = !!who && !it?.reminders.off.d2 && !it?.reminders.sent[`${who.id}:d2`] && !who.viewedAt;
  return { a: it, status: docStatus(d, nowMs), sentAt: d.sentAt ?? null, signer: who?.name ?? null, company: d.companyName || d.title, reminderComing: d2, declineReason: d.signers.find((x) => x.declined)?.declined?.reason ?? null, nowMs };
}

/** An engaged alert, when the rules say one is due now (marks it told), or null (marks it waiting when the 6 hours aren't up). */
function engagedFacts(s: State, t: Pick<Target, "kind" | "itemId"> & Partial<Target>, it: ItemActivity, nowMs: number): AlertFacts | null {
  const inp = ruleInputOf(s, it, t.kind, t.itemId, nowMs);
  if (!inp) return null;
  const sug = suggest(inp);
  const due = engagedDue(it, sug, nowMs);
  if (due === "wait") it.alerts.engagedWaiting = true;
  if (due !== "send" || !sug) return null;
  it.alerts.engagedAt = new Date(nowMs).toISOString();
  it.alerts.engagedKey = sug.key;
  it.alerts.engagedVisits = totalVisits(it);
  it.alerts.engagedWaiting = false;
  const pv = pricingVisits(it);
  const b = factsOfItem(s, t.kind, t.itemId);
  if (!b) return null;
  return {
    ...b,
    kind: "engaged",
    url: appPath(t, "&draft=1"),
    suggestion: sug,
    visits: pv.lastN || totalVisits(it),
    ...(pv.n ? { pricing: { label: pv.label, ms: pv.lastMs } } : {}),
    looked: optionsLooked(it).map((o) => o.label),
    adds: addonsOn(it),
    opens: totalVisits(it),
    totalMs: totalMs(it),
    mostRead: topSection(it),
    skipped: skippedSections(s, t.kind, t.itemId, it),
  };
}

function factsOfItem(s: State, kind: "proposal" | "document", id: string): Omit<AlertFacts, "kind"> | null {
  if (kind === "proposal") {
    const p = (s.proposals ?? []).find((x) => x.id === id);
    const x = p ? currentSend(p) : null;
    return p && x ? { item: id, what: "proposal", title: x.doc.title, company: x.doc.company || p.companyName, signer: x.signer.name, url: appPath({ kind, itemId: id }) } : null;
  }
  const d = (s.documents ?? []).find((x) => x.id === id);
  const who = d ? d.signers.find((x) => !x.sender) ?? d.signers[0] : null;
  return d ? { item: id, what: "document", title: d.title, company: d.companyName, signer: who?.name ?? "", url: appPath({ kind, itemId: id }) } : null;
}

const topSection = (it: ItemActivity) => Object.values(it.sections).sort((a, b) => b.ms - a.ms)[0]?.label ?? null;
function skippedSections(s: State, kind: "proposal" | "document", id: string, it: ItemActivity): string[] {
  if (kind !== "proposal") return [];
  const p = (s.proposals ?? []).find((x) => x.id === id);
  const x = p ? currentSend(p) : null;
  if (!x || !Object.keys(it.sections).length) return [];
  const read = new Set(Object.values(it.sections).filter((v) => v.ms >= 5_000).map((v) => v.label));
  return x.doc.blocks.map((b) => b.title).filter((t) => !read.has(t.slice(0, CAPS.label)));
}

/* ---------- sending an alert ---------- */

/** Sends started and not done yet, for tests and a clean exit. */
export const closeSettled = async () => {
  const { settled } = await import("../notify/index");
  await settled();
};

/** The member's switches, with the defaults. */
export function prefsOf(p: AlertPrefs | undefined): Record<CloseAlertKind, Record<Channel, boolean>> {
  return Object.fromEntries(CLOSE_ALERT_KINDS.map((k) => [k, Object.fromEntries(CHANNELS.map((c) => [c, prefOn(p, k, c)]))])) as Record<CloseAlertKind, Record<Channel, boolean>>;
}

const pushInbox = (s: State, memberId: string, x: Omit<InboxItem, "id" | "at">, at: string) => {
  const list = (closeOf(s).inbox[memberId] ??= []);
  list.push({ ...x, id: `n_${randomBytes(6).toString("base64url")}`, at });
  if (list.length > CAPS.inbox) list.splice(0, list.length - CAPS.inbox);
};

/** One alert to the member, on each channel they keep on. Never throws. */
export function dispatch(memberId: string, f: AlertFacts, nowMs = Date.now()): Promise<void> {
  return track(
    (async () => {
      const [seed, s] = await Promise.all([loadSeed(), loadState()]);
      if (!T.closeNow(s, memberId, nowMs)) return;
      const prefs = s.close?.prefs?.[memberId];
      const base = baseOf(s);
      const link = emailLinker(seed, s, memberId, base, nowMs);
      const plain = alertWords({ ...f, url: `${base}${f.url}` }, `${base}${NOTIFICATIONS_PATH}`);
      if (prefOn(prefs, f.kind, "app")) await T.mutate((d) => pushInbox(d, memberId, plain.inbox, new Date(nowMs).toISOString()));
      if (prefOn(prefs, f.kind, "email") && emailEnabled()) {
        const mailed = alertWords({ ...f, url: link(f.url) }, link(NOTIFICATIONS_PATH)).email;
        const m = await memberFor(seed, memberId);
        if (mailed && m?.email) await sendEmail(m.email, mailed.subject, mailed.text, mailed.html);
      }
      if (prefOn(prefs, f.kind, "slack") && connectedFor(s, memberId)) await postNow(memberId, plain.slack);
    })().catch((e) => console.error("proposal alert failed", f.kind, e instanceof Error ? e.message : "error")),
  );
}

/* ---------- signed and declined (from the sign route) ---------- */

/** After a signer signed or declined (POST /api/sign): the alert, once a link. Never throws. */
export async function afterSignerStep(token: unknown, origin?: string, nowMs = Date.now()): Promise<void> {
  try {
    const s0 = await loadState();
    const t0 = target(s0, token, nowMs);
    if (!t0 || !T.closeNow(s0, t0.memberId, nowMs)) return;
    const f = await T.mutate((s): AlertFacts | null => {
      const t = target(s, token, nowMs);
      if (!t) return null;
      const it = itemOf(s, t.itemId, t.kind, t.memberId);
      const b = baseFacts(s, t);
      if (t.kind === "proposal") {
        if (!t.x.signed && !t.x.declined) return null;
        // Waiting for the member's countersignature: afterClientSigned told them, afterFullySigned tells the rest.
        if (t.x.signed && (awaitingMember(t.x) || (it.countersign && !it.countersign.fullAt))) return null;
        if (it.alerts.done.includes(t.link)) return null;
        it.alerts.done.push(t.link);
        if (t.x.declined) return { ...b, kind: "signed", declined: { reason: t.x.declined.reason } };
        const fee = String(docFields(t.p)["pricing.monthlyFee"] ?? "").trim() || null;
        return { ...b, kind: "signed", adds: addonsOn(it), signed: { option: optionNow(it), fee, won: !!t.p.companyId, copyUrl: copyLink(origin, t.x) } };
      }
      const st = docStatus(t.d, nowMs);
      if (t.x.declined && !it.alerts.done.includes(t.link)) {
        it.alerts.done.push(t.link);
        return { ...b, kind: "signed", signer: t.x.name, declined: { reason: t.x.declined.reason } };
      }
      if (st === "signed" && !it.alerts.done.includes(t.d.id)) {
        it.alerts.done.push(t.d.id);
        return { ...b, kind: "signed", signed: { option: null, fee: null, won: !!t.d.companyId, copyUrl: docCopyLink(origin, t.d) } };
      }
      return null;
    });
    if (f) await dispatch(t0.memberId, f, nowMs);
  } catch (e) {
    console.error("after signing: the alert failed", e instanceof Error ? e.message : "error");
  }
}

/* ---------- closeC3's events: a question, passed on, signed and countersigned ---------- */

/** A proposal's or document's member and kind, by its id. */
function itemById(s: State, itemId: string): { kind: "proposal" | "document"; memberId: string; p: StoredProposal | null; d: StoredDocument | null } | null {
  const p = (s.proposals ?? []).find((x) => x.id === itemId) ?? null;
  if (p) return { kind: "proposal", memberId: p.memberId, p, d: null };
  const d = (s.documents ?? []).find((x) => x.id === itemId) ?? null;
  return d ? { kind: "document", memberId: d.memberId, p: null, d } : null;
}

/** Record something on an item and send its alert, Close only. `make` returns the facts, or null for nothing to say. Never throws. */
async function itemEvent(itemId: string, nowMs: number, make: (s: State, it: ItemActivity, t: NonNullable<ReturnType<typeof itemById>>, b: Omit<AlertFacts, "kind">) => AlertFacts | null): Promise<boolean> {
  try {
    const s0 = await loadState();
    const t0 = itemById(s0, itemId);
    if (!t0 || !T.closeNow(s0, t0.memberId, nowMs)) return false;
    const f = await T.mutate((s) => {
      const t = itemById(s, itemId);
      const b = t ? factsOfItem(s, t.kind, itemId) : null;
      if (!t || !b) return null;
      return make(s, itemOf(s, itemId, t.kind, t.memberId), t, b);
    });
    if (f) await dispatch(t0.memberId, f, nowMs);
    return !!f;
  } catch (e) {
    console.error("proposal event: the alert failed", e instanceof Error ? e.message : "error");
    return false;
  }
}

/**
 * The client asked a question on the proposal (closeC3). "Dana Whitfield asked a question about
 * <proposal>": in Merlin and Slack; email off by default, because the question itself already
 * comes by email. `text` is quoted in Slack and Merlin's email (cut to 280 characters).
 */
export function afterClientAsked(itemId: string, a: { by?: string | null; text?: string | null }, nowMs = Date.now()): Promise<boolean> {
  return itemEvent(itemId, nowMs, (_s, _it, _t, b) => ({ ...b, kind: "question", question: { by: a.by || b.signer, text: String(a.text ?? "") } }));
}

/** The client passed it to someone else to sign (closeC3): "Dana Whitfield passed <proposal> to Sam Lee to sign". */
export function afterPassedOn(itemId: string, a: { by?: string | null; to: string }, nowMs = Date.now()): Promise<boolean> {
  return itemEvent(itemId, nowMs, (_s, _it, _t, b) => (a.to ? { ...b, kind: "passed", passed: { by: a.by || b.signer, to: a.to } } : null));
}

/**
 * The client signed a proposal the member countersigns (closeC3): "Dana Whitfield signed.
 * Countersign to finish." No Won and no renewal clock yet: those wait for afterFullySigned. Once an item.
 */
export function afterClientSigned(itemId: string, a: { by?: string | null } = {}, nowMs = Date.now()): Promise<boolean> {
  return itemEvent(itemId, nowMs, (_s, it, _t, b) => {
    if (it.countersign) return null;
    const by = a.by || b.signer;
    it.countersign = { clientAt: new Date(nowMs).toISOString(), by };
    return { ...b, kind: "countersign", countersign: { by } };
  });
}

/**
 * Fully signed (the last signature, a countersignature included): the "Signed" alert (Moved to Won
 * when it names a company), and the renewal clock starts now for a countersigned proposal. With
 * `movePipeline`, the pipeline moves to Won here (for a flow whose signing step didn't move it).
 * Once a link: the sign route's afterSignerStep and this never both tell it.
 */
export function afterFullySigned(itemId: string, o: { origin?: string; movePipeline?: boolean } = {}, nowMs = Date.now()): Promise<boolean> {
  return itemEvent(itemId, nowMs, (s, it, t, b) => {
    const at = new Date(nowMs).toISOString();
    if (it.countersign && !it.countersign.fullAt) it.countersign.fullAt = at;
    if (t.p) {
      const x = [...t.p.sends].reverse().find((y) => y.signed) ?? currentSend(t.p);
      if (!x || it.alerts.done.includes(x.id)) return null;
      it.alerts.done.push(x.id);
      if (o.movePipeline) pipelineEvent(s, t.memberId, t.p.companyId, "signed", at);
      const fee = String(docFields(t.p)["pricing.monthlyFee"] ?? "").trim() || null;
      return { ...b, kind: "signed", adds: addonsOn(it), signed: { option: optionNow(it), fee, won: !!t.p.companyId, copyUrl: copyLink(o.origin, x) } };
    }
    const d = t.d!;
    if (it.alerts.done.includes(d.id)) return null;
    it.alerts.done.push(d.id);
    if (o.movePipeline) pipelineEvent(s, t.memberId, d.companyId, "signed", at, { document: { to: null } });
    return { ...b, kind: "signed", signed: { option: null, fee: null, won: !!d.companyId, copyUrl: docCopyLink(o.origin, d) } };
  });
}

/**
 * The proposal store's events as the sender's alerts (lib/proposals/store.ts setProposalHooks; these
 * are its defaults): a question, passed on, and a signature. The client's signature with the
 * member's still to come says "countersign to finish"; the last signature says "Signed". The store
 * itself moves the pipeline to Won, once, when the send is fully signed (signProposal for a send the
 * member doesn't countersign, countersignProposal for one they do), so nothing moves it here.
 */
export const closeHooks = {
  onClientQuestion: (e: ClientQuestionEvent) => afterClientAsked(e.proposalId, { by: e.signer.name, text: e.text }, Date.parse(e.at) || Date.now()),
  onHandOff: (e: HandOffEvent) => afterPassedOn(e.proposalId, { by: e.from.name, to: e.to.name }, Date.parse(e.at) || Date.now()),
  onSigned: (e: SignedEvent) =>
    e.state === "client_signed" ? afterClientSigned(e.proposalId, { by: e.by }, Date.parse(e.at) || Date.now()) : afterFullySigned(e.proposalId, { origin: e.origin }, Date.parse(e.at) || Date.now()),
};

/* ---------- the tick: reminders, waiting and timed alerts, new readers, renewals ---------- */

function proposalLinks(p: StoredProposal, nowMs: number): LinkInfo[] {
  const x = currentSend(p);
  if (!x) return [];
  const done = x.signed ? "signed" : x.declined ? "declined" : x.voided ? "void" : linkExpired(x.expiresAt, nowMs) ? "expired" : null;
  return [{ link: x.id, name: x.signer.name, email: x.signer.email, base: x.sentAt, viewedAt: x.viewedAt ?? null, expiresAt: linkEnd(x.expiresAt) === null ? null : x.expiresAt, done }];
}
function documentLinks(d: StoredDocument, nowMs: number): LinkInfo[] {
  if (!d.sentAt) return [];
  const st = docStatus(d, nowMs);
  const done = st === "signed" ? "signed" : st === "declined" ? "declined" : st === "void" ? "void" : st === "expired" ? "expired" : null;
  const turn = new Set(turnOf(d).map((x) => x.id));
  return d.signers
    .filter((x) => !x.sender && x.notifiedAt)
    .map((x) => ({ link: x.id, name: x.name, email: x.email, base: x.notifiedAt!, viewedAt: x.viewedAt ?? null, expiresAt: linkEnd(d.expiresAt) === null ? null : d.expiresAt!, done: x.signed ? "signed" : done ?? (turn.has(x.id) ? null : "signed") }));
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Run what is due. Cheap when nothing is. Never throws. */
export async function closeTick(origin?: string, nowMs = Date.now()): Promise<{ reminders: number; alerts: number; renewals: number }> {
  const out = { reminders: 0, alerts: 0, renewals: 0 };
  try {
    const s0 = await loadState();
    if (!(s0.proposals ?? []).some((p) => p.sends.length) && !(s0.documents ?? []).some((d) => d.sentAt)) return out;
    const seed = await loadSeed();
    type Rem = { kind: "proposal" | "document"; itemId: string; memberId: string; link: LinkInfo; key: ReminderKey };
    const work = await T.mutate((s) => {
      const rems: Rem[] = [];
      const facts: { memberId: string; f: AlertFacts }[] = [];
      const c = closeOf(s);
      const consider = (kind: "proposal" | "document", itemId: string, memberId: string, links: LinkInfo[], live: boolean) => {
        if (!T.closeNow(s, memberId, nowMs)) return;
        const it = peek(s, itemId);
        if (live && emailEnabled())
          for (const r of dueReminders(links, it, nowMs)) {
            const a = itemOf(s, itemId, kind, memberId);
            const k = `${r.link.link}:${r.key}`;
            if ((a.reminders.failed?.[k] ?? 0) >= 3) continue;
            a.reminders.sent[k] = new Date(nowMs).toISOString();
            rems.push({ kind, itemId, memberId, link: r.link, key: r.key });
          }
        if (!it || !live) return;
        // A new reader, once their first visit has settled: what they read goes in the alert.
        for (const r of it.readers) {
          if (r.signer || it.alerts.readers.includes(r.id) || nowMs - Date.parse(r.lastAt) < READER_SETTLE_MS) continue;
          it.alerts.readers.push(r.id);
          const b = factsOfItem(s, kind, itemId);
          if (!b) continue;
          const read = Object.values(it.sections)
            .filter((x) => (x.by[r.id] ?? 0) >= 10_000)
            .sort((x, y) => (y.by[r.id] ?? 0) - (x.by[r.id] ?? 0))
            .map((x) => x.label);
          facts.push({ memberId, f: { ...b, kind: "reader", readerN: it.readers.filter((x) => x.firstAt <= r.firstAt).length, read, device: r.device } });
        }
        const e = engagedFacts(s, { kind, itemId }, it, nowMs);
        if (e) facts.push({ memberId, f: e });
      };
      for (const p of s.proposals ?? []) {
        if (!p.sends.length) continue;
        const links = proposalLinks(p, nowMs);
        consider("proposal", p.id, p.memberId, links, links.some((l) => !l.done));
        // The renewal: 30 days before a signed engagement's term ends.
        const signed = p.sends.find((x) => x.signed);
        const from = signedBase(peek(s, p.id), p);
        if (signed?.signed && from && T.closeNow(s, p.memberId, nowMs)) {
          const it = peek(s, p.id);
          const end = it?.renewal?.end ?? termEndOf(docFields(p), from);
          if (end && renewalDue(end, nowMs) && !it?.renewal?.remindedAt && !it?.renewal?.startedId && !it?.renewal?.ending) {
            const a = itemOf(s, p.id, "proposal", p.memberId);
            a.renewal = { ...(a.renewal ?? {}), remindedAt: new Date(nowMs).toISOString() };
            facts.push({
              memberId: p.memberId,
              f: {
                item: p.id,
                what: "proposal",
                title: signed.doc.title,
                company: signed.doc.company || p.companyName,
                signer: signed.signer.name,
                kind: "renewal",
                url: appPath({ kind: "proposal", itemId: p.id }, "&renew=1"),
                renewal: { end, endWords: shortDay(end), days: Math.max(0, daysTo(end, nowMs)), terms: termsLine(docFields(p), a ? optionNow(a) : null) },
              },
            });
          }
        }
      }
      for (const d of s.documents ?? []) {
        if (!d.sentAt) continue;
        const links = documentLinks(d, nowMs);
        consider("document", d.id, d.memberId, links, ["sent", "viewed"].includes(docStatus(d, nowMs)));
      }
      // Records of proposals and documents deleted since.
      const ids = new Set([...(s.proposals ?? []).map((p) => p.id), ...(s.documents ?? []).map((d) => d.id)]);
      for (const k of Object.keys(c.items)) if (!ids.has(k)) delete c.items[k];
      return { rems, facts };
    });
    for (const x of work.facts) {
      await dispatch(x.memberId, x.f, nowMs);
      out.alerts++;
      if (x.f.kind === "renewal") out.renewals++;
    }
    for (const r of work.rems) if (await sendReminder(seed, r, origin, nowMs)) out.reminders++;
  } catch (e) {
    console.error("proposal follow-ups check failed", e instanceof Error ? e.message : "error");
  }
  return out;
}

/** One reminder email to the signer, with the proposal's or document's own email. Marked sent before; unmarked if it didn't go. */
async function sendReminder(seed: Seed, r: { kind: "proposal" | "document"; itemId: string; memberId: string; link: LinkInfo; key: ReminderKey }, origin: string | undefined, nowMs: number): Promise<boolean> {
  const s = await loadState();
  const m = await memberFor(seed, r.memberId);
  const member = m?.name ?? "Your contact";
  const memberTitle = titleOf(s, { id: r.memberId, title: "" } as Parameters<typeof titleOf>[1]);
  const note = reminderNote(r.key, r.link.expiresAt ? fmtDay(r.link.expiresAt) : "");
  let mail: { subject: string; text: string; html: string } | null = null;
  if (r.kind === "proposal") {
    const p = (s.proposals ?? []).find((x) => x.id === r.itemId);
    const x = p?.sends.find((y) => y.id === r.link.link);
    if (x && sendOpen(x, nowMs)) mail = proposalEmail({ signer: x.signer.name, member, memberTitle, title: x.doc.title, company: x.doc.company, link: signLink(origin, x), expiresAt: x.expiresAt, note });
  } else {
    const d = (s.documents ?? []).find((x) => x.id === r.itemId);
    const x = d?.signers.find((y) => y.id === r.link.link);
    if (d && x && docOpen(d, x, nowMs))
      mail = docInviteEmail({ signer: x.name, member, memberTitle, title: d.title, link: `${(PI.base(origin) || "").replace(/\/$/, "")}/sign/${docSignToken(x.id, linkEnd(d.expiresAt) ?? NO_END_TOKEN_MS)}`, expiresAt: d.expiresAt!, note, after: null });
  }
  const k = `${r.link.link}:${r.key}`;
  const ok = !!mail && (await sendEmail(r.link.email, `Reminder: ${mail.subject}`, mail.text, mail.html, m?.email ? { replyTo: m.email } : {}));
  await T.mutate((d) => {
    const it = d.close?.items?.[r.itemId];
    if (!it) return;
    if (ok) pushInbox(d, r.memberId, reminderInbox(r.itemId, r.link.name, REMINDER_SAY[r.key].short), new Date(nowMs).toISOString());
    else {
      delete it.reminders.sent[k];
      it.reminders.failed = { ...(it.reminders.failed ?? {}), [k]: (it.reminders.failed?.[k] ?? 0) + 1 };
    }
  });
  return ok;
}

/* ---------- the member's side ---------- */

const NOT_YOURS = "That isn't there anymore. Open Proposals again.";

async function mineOf(token: string | null, id: string) {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberOf(seed, s, token);
  const p = (s.proposals ?? []).find((x) => x.id === id && x.memberId === me.id);
  const d = p ? null : (s.documents ?? []).find((x) => x.id === id && x.memberId === me.id);
  if (!p && !d) throw new ProposalProblem(NOT_YOURS, 404);
  return { seed, s, me, p: p ?? null, d: d ?? null };
}

const STATUS_WORDS: Record<string, string> = { draft: "Draft", sent: "Sent · not opened", viewed: "Viewed · not signed", signed: "Signed", declined: "Declined", void: "Withdrawn", expired: "Expired" };

/** The activity view of one proposal or document of the member's (the Insights page). */
export async function activityView(token: string | null, id: string, origin?: string, nowMs = Date.now()): Promise<ActivityView> {
  const { s, me, p, d } = await mineOf(token, id);
  const open = T.closeNow(s, me.id, nowMs);
  const it = peek(s, id);
  const x = p ? currentSend(p) : null;
  const status = p ? statusOf(p, nowMs) : docStatus(d!, nowMs);
  const who = p ? x?.signer ?? p.signer : d!.signers.find((y) => !y.sender) ?? d!.signers[0] ?? null;
  const base: ActivityView = {
    id,
    kind: p ? "proposal" : "document",
    open,
    ...(open ? {} : { upgrade: upgradeUrl(PI.base(origin), "proposals") }),
    title: p ? p.title : d!.title,
    company: p ? p.companyName : d!.companyName,
    status,
    // Opened is opened: the beacon counts it even when the page's own first look didn't.
    statusWords: status === "sent" && it?.readers.some((r) => (p ? r.link === x?.id : true)) ? STATUS_WORDS.viewed : STATUS_WORDS[status] ?? status,
    signer: who ? { name: who.name, title: who.title ?? "", email: who.email } : null,
    sentAt: p ? x?.sentAt ?? null : d!.sentAt ?? null,
    expiresAt: linkEnd(p ? x?.expiresAt : d!.expiresAt) === null ? null : (p ? x!.expiresAt : d!.expiresAt!),
    stats: { opens: 0, readers: 0, ms: 0, option: null, mostRead: null },
    sections: [],
    options: [],
    addons: [],
    timeline: [],
    suggestion: null,
    reminders: [],
    remindersOn: { d2: !it?.reminders.off.d2, d7: !it?.reminders.off.d7, expiry: !it?.reminders.off.expiry },
    renewal: null,
    gmail: null,
    disclosure: DISCLOSURE,
  };
  if (!open) return base;
  const links = p ? proposalLinks(p, nowMs) : documentLinks(d!, nowMs);
  const linkName = (link: string) => (p ? p.sends.find((y) => y.id === link)?.signer.name : d!.signers.find((y) => y.id === link)?.name) ?? "";
  const a = it ?? emptyActivity(base.kind, me.id);
  const others = a.readers.filter((r) => !r.signer);
  const nameOf = (rid: string) => {
    const r = a.readers.find((y) => y.id === rid);
    if (!r) return "Someone";
    if (r.signer) return firstName(linkName(r.link)) || "They";
    const k = others.indexOf(r);
    return `The ${ordinal(k + 2)} reader`;
  };
  // The sections in the document's order, read or not.
  const order: string[] = p && x ? x.doc.blocks.map((b) => b.title.slice(0, CAPS.label)) : (d?.pages ?? []).map((_, i) => `Page ${i + 1}`);
  const rows = new Map<string, { id: string; label: string; ms: number }>();
  for (const [sid, v] of Object.entries(a.sections)) {
    const k = v.label;
    const had = rows.get(k);
    rows.set(k, { id: had?.id ?? sid, label: k, ms: (had?.ms ?? 0) + v.ms });
  }
  const sections = [...order.filter((l) => !rows.has(l)).map((l, i) => ({ id: `x${i}`, label: l, ms: 0 })), ...rows.values()].sort((m, n) => {
    const i = order.indexOf(m.label);
    const j = order.indexOf(n.label);
    return (i < 0 ? 999 : i) - (j < 0 ? 999 : j);
  });
  const max = Math.max(0, ...sections.map((v) => v.ms));
  base.sections = (d && !Object.keys(a.sections).length ? [] : sections).map((v) => ({ ...v, top: max > 0 && v.ms === max }));
  base.options = Object.entries(a.options).map(([oid, o]) => ({ id: oid, label: o.label, ms: o.ms, picks: o.picks, words: o.picks ? `picked ${timesWords(o.picks)}` : o.ms >= 15_000 ? `read ${minWords(o.ms)}` : "glanced" }));
  base.addons = Object.values(a.addons).map((o) => ({ label: o.label, on: o.now }));
  base.stats = {
    opens: a.readers.filter((r) => r.signer).reduce((n, r) => n + r.visits, 0),
    readers: a.readers.length,
    ms: totalMs(a),
    option: optionNow(a),
    mostRead: topSection(a),
  };
  // The timeline, newest first.
  const tl: ActivityView["timeline"] = [];
  const DEV = { phone: ", on a phone", tablet: ", on a tablet", computer: ", on a computer" } as const;
  for (const v of a.visits) {
    const r = a.readers.find((y) => y.id === v.r);
    const dev = r?.device ? DEV[r.device] : "";
    if (v.n === 1) tl.push(r?.signer ? { at: v.at, text: `${nameOf(v.r)} opened it${dev}` } : { at: v.at, text: `Someone new opened it${dev}` });
    else tl.push({ at: v.at, strong: nameOf(v.r), text: `, ${ordinal(v.n)} visit${v.ms >= 30_000 ? `, ${minWords(v.ms)}` : ""}` });
  }
  for (const [k, at] of Object.entries(a.reminders.sent)) if (!k.includes(":") || links.length) tl.push({ at, text: "Reminder sent automatically" });
  // A download after the signature is the signed PDF (the only thing counted once it is signed).
  const signedAtMs = Date.parse((p ? signedSend(p)?.signed?.at : d?.completed?.at) ?? "");
  for (const dl of a.downloads) tl.push({ at: dl.at, text: `${nameOf(dl.r)} downloaded ${Number.isFinite(signedAtMs) && Date.parse(dl.at) >= signedAtMs ? "the signed PDF" : "it"}` });
  if (p && x) {
    tl.push({ at: x.sentAt, text: "You sent it" });
    if (x.signed) tl.push({ at: x.signed.at, strong: firstName(x.signed.name), text: " signed it" });
    if (x.declined) tl.push({ at: x.declined.at, text: `${firstName(x.signer.name)} declined it` });
    if (x.voided?.why === "member") tl.push({ at: x.voided.at, text: "You withdrew it" });
  } else if (d) {
    if (d.sentAt) tl.push({ at: d.sentAt, text: "You sent it" });
    for (const y of d.signers) {
      if (y.signed) tl.push({ at: y.signed.at, strong: firstName(y.name), text: " signed it" });
      if (y.declined) tl.push({ at: y.declined.at, text: `${firstName(y.name)} declined it` });
    }
    if (d.voided) tl.push({ at: d.voided.at, text: "You withdrew it" });
  }
  base.timeline = tl.sort((m, n) => n.at.localeCompare(m.at)).slice(0, 40);
  const inp = ruleInputOf(s, it, base.kind, id, nowMs);
  base.suggestion = inp ? suggest(inp) : null;
  const remRows = status === "draft" ? [] : reminderRows(links, it, nowMs);
  // Signed, declined or withdrawn with none sent: nothing to list.
  base.reminders = remRows.every((r) => r.state === "stopped") ? [] : remRows;
  if (base.suggestion?.draft && base.signer?.email) {
    const q = new URLSearchParams({ view: "cm", fs: "1", to: base.signer.email, su: `Re: ${base.title}`, body: base.suggestion.draft });
    base.gmail = `https://mail.google.com/mail/?${q.toString()}`;
  }
  const from = p ? signedBase(it, p) : null;
  if (waitsForMember(p)) base.statusWords = `Signed by ${firstName(it?.countersign?.by ?? signedSend(p!)?.signed?.name ?? "") || "them"} · countersign to finish`;
  if (p && status === "signed" && from) {
    const end = it?.renewal?.end ?? termEndOf(docFields(p), from);
    base.renewal = {
      end: end ?? null,
      ask: !end && !it?.renewal?.skipped,
      due: renewalDue(end, nowMs),
      remindedAt: it?.renewal?.remindedAt ?? null,
      startedId: it?.renewal?.startedId && (s.proposals ?? []).some((y) => y.id === it.renewal!.startedId) ? it.renewal.startedId : null,
      ending: !!it?.renewal?.ending,
    };
  }
  return base;
}

/** Notifications in Merlin, renewals due, and the switches: for Home and Notifications. */
export async function inboxView(token: string | null, nowMs = Date.now()): Promise<CloseInboxView> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberOf(seed, s, token);
  const open = T.closeNow(s, me.id, nowMs);
  const items = [...(s.close?.inbox?.[me.id] ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  const renewals: CloseInboxView["renewals"] = [];
  if (open)
    for (const p of s.proposals ?? []) {
      if (p.memberId !== me.id) continue;
      const signed = p.sends.find((x) => x.signed);
      const it = peek(s, p.id);
      const from = signedBase(it, p);
      if (!signed?.signed || !from) continue;
      const end = it?.renewal?.end ?? termEndOf(docFields(p), from);
      if (!end || !renewalDue(end, nowMs) || it?.renewal?.ending || (it?.renewal?.startedId && (s.proposals ?? []).some((y) => y.id === it.renewal!.startedId))) continue;
      const days = daysTo(end, nowMs);
      renewals.push({
        id: p.id,
        title: p.title,
        company: signed.doc.company || p.companyName,
        end,
        days,
        line: days > 0 ? `ends ${shortDay(end)}` : "ended",
        terms: termsLine(docFields(p), it ? optionNow(it) : null),
      });
    }
  return {
    open,
    items: open ? items : [],
    unread: open ? items.filter((x) => !x.read).length : 0,
    renewals,
    prefs: prefsOf(s.close?.prefs?.[me.id]),
    slack: connectedFor(s, me.id),
    email: emailEnabled(),
  };
}

/** Mark notifications read: these ids, or every one. Kept per member in the state, so it holds on every device. */
export async function markRead(token: string | null, ids?: unknown): Promise<{ ok: true }> {
  const seed = await loadSeed();
  const only = Array.isArray(ids) ? new Set(ids.filter((x): x is string => typeof x === "string").slice(0, 100)) : null;
  await T.mutate((s) => {
    const me = memberOf(seed, s, token);
    for (const x of s.close?.inbox?.[me.id] ?? []) if (!only || only.has(x.id)) x.read = true;
  });
  return { ok: true };
}

/** Switch one alert on one channel. The signed copy's and a decline's own emails stay on whatever is picked here. */
export async function setPref(token: string | null, kind: unknown, channel: unknown, on: unknown): Promise<CloseInboxView["prefs"]> {
  if (!CLOSE_ALERT_KINDS.includes(kind as CloseAlertKind) || !CHANNELS.includes(channel as Channel) || typeof on !== "boolean") throw new ProposalProblem("That setting didn't come through. Refresh and try again.");
  const seed = await loadSeed();
  return T.mutate((s) => {
    const me = memberOf(seed, s, token);
    const c = closeOf(s);
    const p = (c.prefs[me.id] ??= {});
    p[kind as CloseAlertKind] = { ...(p[kind as CloseAlertKind] ?? {}), [channel as Channel]: on };
    return prefsOf(p);
  });
}

/** Turn this proposal's reminders on or off, each kind on its own (`{ d2: false }`). Works on a draft too, before it's sent. */
export async function setReminders(token: string | null, id: string, patch: unknown, origin?: string, nowMs = Date.now()): Promise<ActivityView> {
  const o = (patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {}) as Record<string, unknown>;
  const { s: s0, me } = await mineOf(token, id);
  if (!T.closeNow(s0, me.id, nowMs)) throw new ProposalProblem(CLOSE_BUILD, 403, upgradeUrl(PI.base(origin), "proposals"));
  await T.mutate((s) => {
    const p = (s.proposals ?? []).find((x) => x.id === id && x.memberId === me.id);
    const d = (s.documents ?? []).find((x) => x.id === id && x.memberId === me.id);
    if (!p && !d) throw new ProposalProblem(NOT_YOURS, 404);
    const it = itemOf(s, id, p ? "proposal" : "document", me.id);
    for (const k of ["d2", "d7", "expiry"] as const) if (typeof o[k] === "boolean") it.reminders.off[k] = !o[k];
  });
  return activityView(token, id, origin, nowMs);
}

/**
 * The renewal on a signed proposal: the term's end when Merlin couldn't read it (asked once), "Not
 * sure" (skip: not asked again), or "It's ending" (no renewal reminder).
 */
export async function setRenewal(token: string | null, id: string, a: { end?: unknown; skip?: unknown; ending?: unknown }, origin?: string, nowMs = Date.now()): Promise<ActivityView> {
  const { s: s0, me, p: p0 } = await mineOf(token, id);
  if (!p0 || !p0.sends.some((x) => x.signed)) throw new ProposalProblem("Only a signed proposal has a renewal.");
  if (!T.closeNow(s0, me.id, nowMs)) throw new ProposalProblem(CLOSE_BUILD, 403, upgradeUrl(PI.base(origin), "proposals"));
  const end = a.end === undefined || a.end === null || a.end === "" ? null : dayOfText(String(a.end));
  if (a.end !== undefined && a.end !== null && a.end !== "" && !end) throw new ProposalProblem("Type the date it ends, like June 30, 2027.");
  await T.mutate((s) => {
    const it = itemOf(s, id, "proposal", me.id);
    const r = (it.renewal ??= {});
    if (end) (r.end = end), (r.asked = true), delete r.remindedAt;
    if (a.skip === true) (r.skipped = true), (r.asked = true);
    if (a.ending === true) r.ending = new Date(nowMs).toISOString();
    if (a.ending === false) delete r.ending;
  });
  return activityView(token, id, origin, nowMs);
}

/**
 * "Start the renewal": the signed proposal copied as a new draft, its dates moved on by one term
 * (lib/close/renewal.ts renewalFields), titled "... (renewal)". Close only, like any new proposal.
 */
export async function startRenewal(token: string | null, id: string, origin?: string, nowMs = Date.now()): Promise<ProposalRec> {
  const { seed } = await mineOf(token, id);
  const now = new Date(nowMs).toISOString();
  return T.mutate((s) => {
    const me = memberOf(seed, s, token);
    buildGate(s, me.id, nowMs, origin);
    const p = (s.proposals ?? []).find((x) => x.id === id && x.memberId === me.id);
    const signed = p?.sends.find((x) => x.signed);
    if (!p || !signed?.signed) throw new ProposalProblem("Only a signed proposal can be renewed.");
    const it = itemOf(s, id, "proposal", me.id);
    const had = it.renewal?.startedId ? (s.proposals ?? []).find((x) => x.id === it.renewal!.startedId) : null;
    if (had) return recOf(had, nowMs, origin);
    if ((s.proposals ?? []).filter((x) => x.memberId === me.id).length >= LIMITS.proposals) throw new ProposalProblem(`You have ${LIMITS.proposals} proposals, which is the most. Delete an old draft first.`);
    const from = signedBase(it, p);
    if (!from) throw new ProposalProblem("It isn't fully signed yet. Countersign it first.");
    const end = it.renewal?.end ?? termEndOf(docFields(p), from) ?? new Date(nowMs).toISOString().slice(0, 10);
    const copy: StoredProposal = {
      ...structuredClone(p),
      id: `pr_${randomBytes(9).toString("base64url")}`,
      title: `${p.title.replace(/\s*\((copy|renewal)\)$/i, "")} (renewal)`.slice(0, LIMITS.title),
      fields: renewalFields(p.fields, end, nowMs),
      version: 1,
      sends: [],
      createdAt: now,
      updatedAt: now,
    };
    for (const k of Object.keys(copy.fields)) if (copy.fields[k] !== p.fields[k]) copy.sources[k] = "renewal";
    s.proposals!.push(copy);
    it.renewal = { ...(it.renewal ?? {}), startedId: copy.id };
    return recOf(copy, nowMs, origin);
  });
}

/** For tests: the raw record of an item. */
export const closeInternals = { target, devOf, lastActivity, DAY };
