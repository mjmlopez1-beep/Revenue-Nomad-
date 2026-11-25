/**
 * Approve, then send, the server's half (lib/send/types.ts says what is kept and why).
 *
 *   sendView        GET /api/send: the member's own outbox, whether Google said yes to sending
 *   approve         POST /api/send op approve: the member's tap. Checks the address, the daily cap
 *                   and the draft's key (one send per draft), then queues it for UNDO_MS, schedules
 *                   a follow-up, or waits on Google's permission (startGrant, the consent page)
 *   cancel          Undo, or Cancel on a scheduled follow-up
 *   sendDue         hands every due note to Gmail (a timer per note, the scheduler's tick, and each
 *                   GET), then does what a sent note does in Merlin (the pipeline's rules)
 *   queueFromAgent  the connector's queue_note: a draft waiting for the member's tap, nothing more
 *
 * Only a signed-in member's tap in the app approves (app/api/send checks the cookie and the
 * origin, and refuses a bearer token). Nothing here is reachable from lib/mcp but queueFromAgent.
 * Every send is the member's own: an item is found in their own outbox or refused. Admins get
 * counts only (sendCounts).
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { ActionError, loadSeed, loadState, memberByToken, perform, tableInternals as T, MOVE_NOT_IN, type Member, type Seed, type State } from "../table";
import type { Action } from "../tableTypes";
import { clientFor, googleConfigured, redirectUri, SCOPE_GMAIL, bases } from "../google/config";
import { GoogleError, exchangeCode, refreshAccess, revoke } from "../google/api";
import { seal, unseal } from "../google/crypto";
import type { GoogleLink, MemberNetwork } from "../google/types";
import { californian } from "../california";
import { pushInbox } from "../inbox";
import { gmailMessageId, gmailReplied, gmailSend } from "./gmail";
import { newMessageId, rawOf } from "./mime";
import {
  BODY_MAX, DAILY_CAP, GRANT_WAIT_MS, KEEP_SENT_DAYS, OPEN_STATUSES, OUTBOX_MAX, SCOPE_SEND, SEND_ENV, SUBJECT_MAX, UNDO_MS, WORDS, cleanAddress, firstOf,
  type ApproveInput, type SendEffect, type SendItemView, type SendKind, type SendStatus, type SendView,
} from "./types";

const DAY = 86_400_000;
const SIGNED_OUT = "You're signed out. Sign in again.";
const GONE = "That note isn't in your outbox anymore.";

/** On with RN_SEND=1 and Google's OAuth client set up. Off: no route answers, no tool, no button. */
export const sendOn = () => process.env[SEND_ENV] === "1" && googleConfigured();

/* ---------- what is kept ---------- */

export interface OutboxItem {
  id: string;
  key: string;
  status: SendStatus;
  to: string;
  toName: string | null;
  subject: string | null;
  body: string | null;
  kind: SendKind;
  /** Internal company id. */
  companyId: string | null;
  pipelineId: string | null;
  effect: SendEffect | null;
  createdAt: string;
  approvedAt: string | null;
  sendAt: string | null;
  sentAt: string | null;
  /** A scheduled follow-up waits for no reply. */
  ifNoReply?: boolean;
  /** The pipeline deal's stage when the member approved it: a move to a later one since is a reply. */
  stageAt?: string | null;
  /** Gmail's ids once sent. */
  gmailId?: string | null;
  threadId?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  refs?: string[];
  byAgent?: boolean;
  /** A workflow's note: its tap's time limit (ISO). Past it, a tap is refused: the workflow takes Expired. */
  expiresAt?: string | null;
  note?: string | null;
  tries?: number;
}
export interface MemberOutbox {
  grant?: GoogleLink;
  items: OutboxItem[];
  /** When each note went (ISO), the last day's worth: the cap. */
  sent: string[];
}
type WithOutbox = State & { outbox?: Record<string, MemberOutbox> };
const boxes = (s: State) => ((s as WithOutbox).outbox ??= {});
const boxOf = (s: State, id: string): MemberOutbox | undefined => (s as WithOutbox).outbox?.[id];
const ensureBox = (s: State, id: string): MemberOutbox => (boxes(s)[id] ??= { items: [], sent: [] });
const netOf = (s: State, id: string): MemberNetwork | undefined => s.network?.[id];

const newId = () => `sd${randomBytes(9).toString("hex")}`;
const iso = (ms: number) => new Date(ms).toISOString();
const sentToday = (b: MemberOutbox | undefined, nowMs: number) => (b?.sent ?? []).filter((t) => nowMs - Date.parse(t) < DAY).length;
const grantOk = (b: MemberOutbox | undefined) => !!b?.grant && b.grant.status !== "reconnect" && b.grant.scopes.includes(SCOPE_SEND);

/** Old closed records go, the newest OUTBOX_MAX stay; a sent record's subject goes with it after KEEP_SENT_DAYS. */
function trim(b: MemberOutbox, nowMs: number) {
  b.sent = b.sent.filter((t) => nowMs - Date.parse(t) < DAY);
  b.items = b.items.filter((x) => OPEN_STATUSES.includes(x.status) || nowMs - Date.parse(x.sentAt ?? x.createdAt) < KEEP_SENT_DAYS * DAY);
  if (b.items.length > OUTBOX_MAX) {
    const closed = b.items.filter((x) => !OPEN_STATUSES.includes(x.status)).sort((a, c) => Date.parse(a.createdAt) - Date.parse(c.createdAt));
    const drop = new Set(closed.slice(0, b.items.length - OUTBOX_MAX).map((x) => x.id));
    b.items = b.items.filter((x) => !drop.has(x.id));
  }
}
/** A closed note keeps no text: the subject stays on a sent one only (a follow-up's thread). */
function close(x: OutboxItem, status: SendStatus, note: string | null = null) {
  x.status = status;
  x.body = null;
  if (status !== "sent") x.subject = null;
  x.note = note;
}

/* ---------- the member ---------- */

async function who(token: string | null): Promise<{ seed: Seed; s: State; m: Member }> {
  if (!token) throw new ActionError(SIGNED_OUT);
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  if (!m) throw new ActionError(SIGNED_OUT);
  return { seed, s, m };
}
/** The token a member signs in with now (to do what a sent note does, as the member). */
function tokenOf(seed: Seed, s: State, memberId: string): string | null {
  const sm = seed.members.find((x) => x.id === memberId);
  if (sm) return s.tokens?.[memberId] ?? sm.token;
  return s.members.find((x) => x.id === memberId)?.token ?? null;
}
function memberOf(seed: Seed, s: State, memberId: string): Member | null {
  const t = tokenOf(seed, s, memberId);
  return t ? memberByToken(seed, t, s) : null;
}
const companyIdOf = (seed: Seed, s: State, pub: unknown): string | null => {
  const p = String(pub ?? "");
  if (!p) return null;
  for (const id of T.graph(seed, s).companies.keys()) if (T.pubId(id) === p) return id;
  return null;
};

/* ---------- who a note may go to ---------- */

/** Merlin's records by email: the people whose address is on file (seed, members' additions, leaders' likely emails, own sites). */
const peopleByEmail = new WeakMap<State, Map<string, unknown[]>>();
function recordsAt(seed: Seed, s: State, email: string): { node: unknown; fields: Record<string, string> }[] {
  let idx = peopleByEmail.get(s);
  if (!idx) {
    idx = new Map();
    for (const p of T.graph(seed, s).contacts.values()) {
      const e = String(T.live(p as never, s, "email") ?? "").trim().toLowerCase();
      if (!e) continue;
      let l = idx.get(e);
      if (!l) idx.set(e, (l = []));
      l.push(p);
    }
    peopleByEmail.set(s, idx);
  }
  return (idx.get(email) ?? []).map((node) => ({ node, fields: (node as { seedFields?: Record<string, string> }).seedFields ?? {} }));
}

/** The addresses in the member's own imports: their Google account (Calendar, Contacts, Gmail) and their own LinkedIn and contacts files. */
function ownAddresses(s: State, memberId: string): Set<string> {
  const out = new Set<string>();
  const add = (e: unknown) => {
    const c = cleanAddress(e);
    if (c) out.add(c);
  };
  const n = netOf(s, memberId);
  for (const src of [n?.cal, n?.con, n?.gm, n?.claude]) {
    if (!src) continue;
    for (const c of Object.values(src.companies ?? {})) for (const p of c.people ?? []) add(p.email);
    for (const p of src.loose ?? []) add(p.email);
  }
  const files = (s as State & { paths?: Record<string, { linkedin?: { rows?: { e?: string }[] }; csv?: { rows?: { e?: string }[] } }> }).paths?.[memberId];
  for (const r of files?.linkedin?.rows ?? []) add(r.e);
  for (const r of files?.csv?.rows ?? []) add(r.e);
  return out;
}

/**
 * Whether the member may send to this address: an address they can see (one they unlocked, from
 * their own Google or LinkedIn import) or one they typed that is on no record of Merlin's they
 * can't see. Never a person whose name and email the California rule hides, and never one whose
 * email on Merlin is still locked for them. Null when it may go; else the words why not.
 */
export function addressProblem(seed: Seed, s: State, me: Member, raw: unknown): string | null {
  const email = cleanAddress(raw);
  if (!email) return String(raw ?? "").trim() ? WORDS.badAddress : WORDS.noAddress;
  const recs = recordsAt(seed, s, email);
  if (recs.some((r) => californian({ location: r.fields.location, california: r.fields.california === "true" || r.fields.california === "yes" }))) return WORDS.hidden;
  if (ownAddresses(s, me.id).has(email)) return null;
  if (!recs.length) return null;
  const idx = T.memberIndex(seed, s);
  const seen = recs.some((r) => T.cellOf(s, me, r.node as never, "contact", "email", idx).s === "value");
  return seen ? null : WORDS.locked;
}

/* ---------- Google: the permission to send ---------- */

const access = new Map<string, { access: string; exp: number; sealed: string }>();
async function accessWith(key: string, link: GoogleLink, kind: "google" | "gmail", own: boolean): Promise<string> {
  const hit = access.get(key);
  if (hit && hit.sealed === link.token && hit.exp > Date.now() + 60_000) return hit.access;
  const refresh = unseal(link.token);
  if (!refresh) throw new GoogleError("invalid_grant");
  const t = await refreshAccess(kind, refresh, own);
  access.set(key, { access: t.access, exp: t.expiresAt, sealed: link.token });
  return t.access;
}
const sendAccess = (memberId: string, g: GoogleLink) => accessWith(`${memberId}:send`, g, "google", false);
/** Gmail headers (gmail.metadata): the send grant when it carries them (the same grant), else the Gmail connection. */
function metaLink(s: State, memberId: string): { key: string; link: GoogleLink; kind: "google" | "gmail"; own: boolean } | null {
  const b = boxOf(s, memberId);
  if (grantOk(b) && b!.grant!.scopes.includes(SCOPE_GMAIL)) return { key: `${memberId}:send`, link: b!.grant!, kind: "google", own: false };
  const gm = netOf(s, memberId)?.gmail;
  if (gm && gm.status !== "reconnect") return { key: `${memberId}:meta`, link: gm, kind: "gmail", own: !!gm.ownClient };
  return null;
}

const hashOf = (v: string) => createHash("sha256").update(`rn-send-state:${v}`).digest("hex");
const states = new Map<string, { memberId: string; itemId: string; back: string; exp: number }>();
export const SEND_STATE_COOKIE = "rn_send_state";
/** Back from Google: the outcome and the note's id ("send.sd..."), read once by the app (SendHost). Never a token. */
export const SEND_BACK_COOKIE = "rn_send_back";
const STATE_TTL_MS = 10 * 60_000;
/** Back to a page of the app only: a path on this site, never another host. */
export const cleanBack = (v: unknown) => {
  const b = String(v ?? "");
  return /^\/(?![/\\])[^\s]{0,600}$/.test(b) && !/^\/api\//.test(b) ? b.split("#")[0] : "/?p=messages";
};

/**
 * The consent page for the extra permission (gmail.send), on the main OAuth client with the grant
 * Merlin already has kept (include_granted_scopes). For the note `itemId`, waiting at "grant".
 */
export async function startGrant(token: string | null, itemId: unknown, back: unknown, origin: string): Promise<{ url: string; state: string }> {
  if (!sendOn()) throw new ActionError("Sending isn't on.");
  const { s, m } = await who(token);
  const it = boxOf(s, m.id)?.items.find((x) => x.id === String(itemId ?? ""));
  if (!it || it.status !== "grant") throw new ActionError(GONE);
  const now = Date.now();
  for (const [k, v] of states) if (v.exp <= now) states.delete(k);
  while (states.size >= 2000) states.delete(states.keys().next().value as string);
  const state = randomBytes(32).toString("base64url");
  states.set(hashOf(state), { memberId: m.id, itemId: it.id, back: cleanBack(back), exp: now + STATE_TTL_MS });
  const hint = boxOf(s, m.id)?.grant?.email || netOf(s, m.id)?.google?.email || m.email;
  const q = new URLSearchParams({
    client_id: clientFor("google").id,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: ["openid", "email", SCOPE_SEND].join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    ...(hint ? { login_hint: hint } : {}),
  });
  return { url: `${bases().auth}/o/oauth2/v2/auth?${q}`, state };
}

/** Is this callback's state one of Approve and send's? (The callback serves Google connect too.) */
export const isSendState = (state: unknown) => {
  const raw = String(state ?? "");
  return !!raw && raw.length <= 200 && states.has(hashOf(raw));
};

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export type GrantOutcome = "send" | "senddenied" | "sendfailed";
/**
 * Google sent the member back. The state must be known, unexpired, this browser's (the cookie) and
 * the signed-in member's; then the code is swapped, the refresh token sealed and kept, and the note
 * that waited goes into the 30 seconds to undo. Back to the page it was approved on.
 */
export async function finishGrant(
  token: string | null,
  q: { state: string | null; code: string | null; error: string | null },
  cookie: string | null,
  origin: string,
): Promise<{ outcome: GrantOutcome; back: string; id: string | null }> {
  const raw = String(q.state ?? "");
  const got = raw && raw.length <= 200 ? states.get(hashOf(raw)) : undefined;
  if (raw) states.delete(hashOf(raw));
  if (!got || got.exp <= Date.now() || !cookie || !same(cookie, raw) || !sendOn()) return { outcome: "sendfailed", back: got?.back ?? "/?p=messages", id: null };
  const base = { back: got.back, id: got.itemId };
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = token ? memberByToken(seed, token, s) : null;
  if (!m || m.id !== got.memberId) return { outcome: "sendfailed", ...base };
  if (q.error) return { outcome: q.error === "access_denied" ? "senddenied" : "sendfailed", ...base };
  const code = String(q.code ?? "");
  if (!code || code.length > 1000) return { outcome: "sendfailed", ...base };
  let t;
  try {
    t = await exchangeCode("google", code, origin, false);
  } catch (e) {
    console.error(`Send permission: the code exchange failed (${e instanceof GoogleError ? e.code : "error"})`);
    return { outcome: "sendfailed", ...base };
  }
  // Without the send scope (unticked on the consent page) nothing is kept: the grant before stays as it was.
  if (!t.scopes.includes(SCOPE_SEND)) return { outcome: "senddenied", ...base };
  if (!t.refresh) {
    console.error("Send permission: no refresh token came back");
    return { outcome: "sendfailed", ...base };
  }
  const nowMs = Date.now();
  const link: GoogleLink = { token: seal(t.refresh), email: t.email ?? "", scopes: t.scopes.filter((x) => x.startsWith("https://")), connectedAt: iso(nowMs), status: "ok" };
  const armed: { member: string; id: string; at: number }[] = [];
  await T.mutate((d) => {
    const b = ensureBox(d, m.id);
    b.grant = link;
    // Every note that waited on the permission (approved by the member's tap) now gets its 30 seconds to undo.
    for (const x of b.items) {
      if (x.status !== "grant") continue;
      if (nowMs - Date.parse(x.approvedAt ?? x.createdAt) > GRANT_WAIT_MS) {
        close(x, "cancelled", "Google's permission took too long, so it wasn't sent.");
        continue;
      }
      x.status = x.ifNoReply && x.sendAt && Date.parse(x.sendAt) > nowMs + UNDO_MS ? "scheduled" : "queued";
      if (x.status === "queued") x.sendAt = iso(nowMs + UNDO_MS);
      armed.push({ member: m.id, id: x.id, at: Date.parse(x.sendAt!) });
    }
  });
  access.set(`${m.id}:send`, { access: t.access, exp: t.expiresAt, sealed: link.token });
  for (const a of armed) arm(a.member, a.id, a.at);
  return { outcome: "send", ...base };
}

/* ---------- the member's tap ---------- */

const KINDS: readonly SendKind[] = ["move", "network", "record", "followup", "workflow", "agent", "intro", "other"];
const flat = (v: unknown, max: number) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
const cleanTo = (v: unknown) => {
  if (!v || typeof v !== "object") return undefined;
  const o = v as { name?: unknown; role?: unknown; google?: unknown };
  return { name: o.name == null ? null : flat(o.name, 120), role: o.role == null ? null : flat(o.role, 120), ...(o.google === true ? { google: true } : {}) };
};
/** Only what a sent note does by hand: a move sent, a note used at a company, a follow-up used. Anything else is dropped. */
export function cleanEffect(v: unknown): SendEffect | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  const channel = e.channel === "intro" ? "intro" : "email";
  if (e.type === "move" && e.op === "sent" && typeof e.id === "string") return { type: "move", id: e.id.slice(0, 80), op: "sent", channel, to: cleanTo(e.to), ...(e.intro === true ? { intro: true } : {}) };
  if (e.type === "pipeline.sent" && typeof e.companyId === "string")
    return { type: "pipeline.sent", companyId: e.companyId.slice(0, 80), channel, to: cleanTo(e.to), from: e.from === "network" ? "network" : "record", ...(e.intro === true ? { intro: true } : {}) };
  if (e.type === "pipeline.followed" && typeof e.id === "string") return { type: "pipeline.followed", id: e.id.slice(0, 80) };
  return null;
}
const bareSubject = (v: string | null | undefined) => String(v ?? "").replace(/^\s*((re|fwd?)\s*:\s*)+/i, "").trim().toLowerCase();

export interface ApproveAnswer {
  item: SendItemView;
  /** Google's permission is needed first: open this (GET, it sets the state and goes to Google). */
  grant: string | null;
  /** The same draft was approved before: nothing new was queued. */
  again: boolean;
  view: SendView;
}

export async function approve(token: string | null, raw: ApproveInput, nowMs = Date.now()): Promise<ApproveAnswer> {
  if (!sendOn()) throw new ActionError("Sending isn't on.");
  const { seed, s, m } = await who(token);
  const a = (raw && typeof raw === "object" ? raw : {}) as Partial<ApproveInput>;
  const key = flat(a.key, 160);
  if (!key) throw new ActionError("That draft has no key. Open it again.");
  const subject = flat(a.subject, SUBJECT_MAX + 1);
  const body = String(a.body ?? "").replace(/\r\n?/g, "\n").trim();
  if (!subject) throw new ActionError("Add a subject.");
  if (subject.length > SUBJECT_MAX) throw new ActionError(`Keep the subject under ${SUBJECT_MAX} characters.`);
  if (!body) throw new ActionError("The note is empty.");
  if ([...body].length > BODY_MAX) throw new ActionError(`Keep the note under ${BODY_MAX.toLocaleString("en-US")} characters.`);
  const problem = addressProblem(seed, s, m, a.to);
  if (problem) throw new ActionError(problem);
  const to = cleanAddress(a.to)!;
  const kind: SendKind = KINDS.includes(a.kind as SendKind) ? (a.kind as SendKind) : "other";
  const companyId = companyIdOf(seed, s, a.company);
  let at: number | null = null;
  if (a.at) {
    at = Date.parse(String(a.at));
    if (!Number.isFinite(at) || at < nowMs + UNDO_MS || at > nowMs + 30 * DAY) throw new ActionError("Pick a time in the next 30 days.");
  }
  const effect = cleanEffect(a.effect);
  const toName = a.toName == null ? null : flat(a.toName, 120) || null;
  const pipelineId = a.pipelineId ? flat(a.pipelineId, 80) : null;

  const out = await T.mutate((d) => {
    const b = ensureBox(d, m.id);
    trim(b, nowMs);
    // One send per draft: the same key again (a double tap, a second tab) is the same note.
    const had = b.items.find((x) => x.key === key && x.status !== "cancelled" && x.status !== "failed" && x.status !== "draft" && nowMs - Date.parse(x.createdAt) < KEEP_SENT_DAYS * DAY);
    // A held note (the cap, the permission gone, no way to check for a reply), or one still waiting on Google's
    // permission (the member said no there, or came back), goes again on the member's new tap, as it reads now.
    if (had && had.status !== "held" && had.status !== "grant") return { it: had, again: true };
    if (a.id) {
      const q = b.items.find((x) => x.id === String(a.id));
      if (!q || q.status !== "draft") throw new ActionError(GONE);
    }
    // A workflow's note past its time limit: refused here, whether or not the scheduler has cancelled it yet.
    if (b.items.some((x) => x.status === "draft" && (x.id === String(a.id ?? "") || x.key === key) && x.expiresAt && Date.parse(x.expiresAt) <= nowMs)) throw new ActionError(WORDS.expired);
    const waiting = b.items.filter((x) => x.status === "queued" || x.status === "sending" || x.status === "grant").length;
    if (!at && sentToday(b, nowMs) + waiting >= DAILY_CAP) throw new ActionError(WORDS.cap);
    // A note in the thread of one Merlin sent before: the same person, the same subject (with Re:).
    const prev = b.items
      .filter((x) => x.status === "sent" && x.to === to && x.threadId && x.subject && (!companyId || x.companyId === companyId) && bareSubject(x.subject) === bareSubject(subject))
      .sort((x, y) => Date.parse(y.sentAt ?? "") - Date.parse(x.sentAt ?? ""))[0];
    const base = had ?? (a.id ? b.items.find((x) => x.id === String(a.id))! : null);
    const it: OutboxItem = base ?? {
      id: newId(), key, status: "queued", to, toName, subject, body, kind, companyId, pipelineId, effect, createdAt: iso(nowMs), approvedAt: null, sendAt: null, sentAt: null,
    };
    Object.assign(it, { key, to, toName, subject, body, kind: base?.byAgent ? "agent" : kind, companyId: companyId ?? it.companyId, pipelineId: pipelineId ?? it.pipelineId, effect: effect ?? it.effect, approvedAt: iso(nowMs), note: null });
    if (prev) Object.assign(it, { threadId: prev.threadId, inReplyTo: prev.messageId ?? null, refs: [...(prev.refs ?? []), ...(prev.messageId ? [prev.messageId] : [])].slice(-10) });
    it.ifNoReply = !!at;
    it.stageAt = pipelineId ? d.pipeline?.[m.id]?.entries.find((x) => x.id === pipelineId)?.stage ?? null : null;
    it.sendAt = iso(at ?? nowMs + UNDO_MS);
    it.status = !grantOk(b) ? "grant" : at ? "scheduled" : "queued";
    if (!base) b.items.push(it);
    return { it, again: false };
  });
  if (out.it.status === "queued" || out.it.status === "scheduled") arm(m.id, out.it.id, Date.parse(out.it.sendAt!));
  const view = await sendViewFor(m.id);
  const item = view.items.find((x) => x.id === out.it.id) ?? viewOf(await loadSeed(), await loadState(), m, out.it);
  return { item, grant: out.it.status === "grant" ? `/api/send/connect?d=${encodeURIComponent(out.it.id)}` : null, again: out.again, view };
}

/** Undo (in the 30 seconds), or Cancel a scheduled follow-up, a held one or an agent's draft. Never once Gmail has it. */
export async function cancel(token: string | null, id: unknown, nowMs = Date.now()): Promise<{ message: string; view: SendView }> {
  if (!sendOn()) throw new ActionError("Sending isn't on.");
  const { m } = await who(token);
  const message = await T.mutate((d) => {
    const it = boxOf(d, m.id)?.items.find((x) => x.id === String(id ?? ""));
    if (!it) throw new ActionError(GONE);
    if (it.status === "sending" || it.status === "sent") throw new ActionError("It went already. It's in your Gmail Sent folder.");
    if (it.status === "cancelled" || it.status === "replied" || it.status === "failed") return "That one isn't going out.";
    const was = it.status;
    close(it, "cancelled", null);
    it.sendAt = null;
    void nowMs;
    return was === "draft" ? "Removed." : was === "scheduled" ? "Cancelled. That follow-up won't go." : WORDS.undone;
  });
  disarm(String(id ?? ""));
  return { message, view: await sendViewFor(m.id) };
}

/** Clear a closed note from the list (sent, cancelled, replied, failed). */
export async function dismiss(token: string | null, id: unknown): Promise<SendView> {
  const { m } = await who(token);
  await T.mutate((d) => {
    const b = boxOf(d, m.id);
    if (!b) return;
    b.items = b.items.filter((x) => x.id !== String(id ?? "") || OPEN_STATUSES.includes(x.status));
  });
  return sendViewFor(m.id);
}

/* ---------- the agent's queue (lib/mcp queue_note): a draft for the member's tap, nothing more ---------- */

export const AGENT_DRAFTS_DAILY = 50;
export async function queueFromAgent(member: Member, a: { to?: unknown; to_name?: unknown; subject?: unknown; body?: unknown; company_id?: unknown }, nowMs = Date.now()): Promise<SendItemView> {
  if (!sendOn()) throw new ActionError("Sending isn't on.");
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberOf(seed, s, member.id);
  if (!m) throw new ActionError(SIGNED_OUT);
  const subject = flat(a.subject, SUBJECT_MAX);
  const body = String(a.body ?? "").replace(/\r\n?/g, "\n").trim().slice(0, BODY_MAX);
  if (!subject || !body) throw new ActionError("Pass the note's subject and body.");
  const to = a.to ? cleanAddress(a.to) : null;
  if (a.to && !to) throw new ActionError(WORDS.badAddress);
  if (to) {
    const p = addressProblem(seed, s, m, to);
    if (p) throw new ActionError(p);
  }
  const companyId = companyIdOf(seed, s, a.company_id);
  const it = await T.mutate((d) => {
    const b = ensureBox(d, m.id);
    trim(b, nowMs);
    if (b.items.filter((x) => x.byAgent && nowMs - Date.parse(x.createdAt) < DAY).length >= AGENT_DRAFTS_DAILY) throw new ActionError(`An agent can queue ${AGENT_DRAFTS_DAILY} notes a day. The member can approve the ones waiting first.`);
    const x: OutboxItem = {
      id: newId(), key: `agent:${randomBytes(6).toString("hex")}`, status: "draft", to: to ?? "", toName: a.to_name ? flat(a.to_name, 120) : null, subject, body, kind: "agent", companyId, pipelineId: null,
      effect: companyId ? { type: "pipeline.sent", companyId: T.pubId(companyId), channel: "email", from: "record" } : null, createdAt: iso(nowMs), approvedAt: null, sendAt: null, sentAt: null, byAgent: true,
    };
    b.items.push(x);
    return x;
  });
  return viewOf(seed, await loadState(), m, it);
}

/* ---------- a workflow's note (lib/workflows/graphRun.ts, RN_WORKFLOWS_V2): a draft for the member's tap, nothing more ---------- */

/**
 * "Approve, then send" in a workflow: the note waits in the member's outbox as a draft, exactly as
 * an agent's does. Only the member's tap (approve) sends it. The address is checked now and again
 * on the tap. Returns the draft's id.
 */
export async function queueFromWorkflow(memberId: string, a: { key: string; to: string; toName?: string | null; subject: string; body: string; companyPub?: string | null; expiresAt?: string | null }, nowMs = Date.now()): Promise<string> {
  if (!sendOn()) throw new ActionError("Sending isn't on.");
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberOf(seed, s, memberId);
  if (!m) throw new ActionError(SIGNED_OUT);
  const subject = flat(a.subject, SUBJECT_MAX);
  const body = String(a.body ?? "").replace(/\r\n?/g, "\n").trim().slice(0, BODY_MAX);
  if (!subject || !body) throw new ActionError("The note needs a subject and a body.");
  const to = cleanAddress(a.to);
  if (!to) throw new ActionError(WORDS.badAddress);
  const p = addressProblem(seed, s, m, to);
  if (p) throw new ActionError(p);
  const companyId = companyIdOf(seed, s, a.companyPub);
  const key = flat(a.key, 160);
  const expiresAt = a.expiresAt && Number.isFinite(Date.parse(a.expiresAt)) ? iso(Date.parse(a.expiresAt)) : null;
  return T.mutate((d) => {
    const b = ensureBox(d, m.id);
    trim(b, nowMs);
    // One note per key, whatever became of it: a retried run finds the note it queued (a draft, approved, queued, sent,
    // skipped), never a second message.
    const had = b.items.find((x) => x.key === key);
    if (had) return had.id;
    const x: OutboxItem = {
      id: newId(), key, status: "draft", to, toName: a.toName ? flat(a.toName, 120) : null, subject, body, kind: "workflow", companyId, pipelineId: null,
      effect: companyId ? { type: "pipeline.sent", companyId: T.pubId(companyId), channel: "email", from: "record" } : null, createdAt: iso(nowMs), approvedAt: null, sendAt: null, sentAt: null,
      ...(expiresAt ? { expiresAt } : {}),
    };
    b.items.push(x);
    return x.id;
  });
}
/** Where a workflow's note is now: its status, or null when it is gone from the outbox. */
export function workflowNoteStatus(s: State, memberId: string, id: string): { status: SendStatus; key: string; to: string; subject: string | null; body: string | null } | null {
  const x = boxOf(s, memberId)?.items.find((i) => i.id === id);
  return x ? { status: x.status, key: x.key, to: x.to, subject: x.subject, body: x.body } : null;
}
/** A workflow's note the member skipped, or that waited too long: it goes, unsent. Never once it was approved. */
export async function dropWorkflowNote(memberId: string, id: string): Promise<void> {
  await T.mutate((d) => {
    const b = boxOf(d, memberId);
    const x = b?.items.find((i) => i.id === id);
    if (x && x.status === "draft") close(x, "cancelled", "Skipped in a workflow");
  });
}

/* ---------- sending ---------- */

const timers = new Map<string, ReturnType<typeof setTimeout>>();
function arm(memberId: string, id: string, atMs: number) {
  const wait = atMs - Date.now();
  if (wait > 6 * 3_600_000) return; // further out: the scheduler's tick takes it
  disarm(id);
  const t = setTimeout(() => {
    timers.delete(id);
    void sendDue(Date.now(), memberId).catch((e) => console.error("send: due check failed", e instanceof Error ? e.message : "error"));
  }, Math.max(0, wait) + 300);
  (t as { unref?: () => void }).unref?.();
  timers.set(id, t);
}
function disarm(id: string) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
}

/** Has the person written back since the note this follow-up follows (or since it was approved)? Null: Merlin can't tell. */
async function repliedSince(s: State, memberId: string, it: OutboxItem, mine: Set<string>): Promise<boolean | null> {
  // What Your pipeline already saw (a reply on Merlin, Gmail headers, a meeting): the deal moved past Sent.
  const e = it.pipelineId ? s.pipeline?.[memberId]?.entries.find((x) => x.id === it.pipelineId) : null;
  const since = Date.parse(it.approvedAt ?? it.createdAt);
  const LATER = ["replied", "meeting", "proposal", "won"];
  if (e && e.stage !== it.stageAt && LATER.includes(e.stage) && LATER.indexOf(e.stage) > LATER.indexOf(String(it.stageAt ?? ""))) return true;
  if (e?.dates?.replied && Date.parse(e.dates.replied) > since) return true;
  const ml = metaLink(s, memberId);
  // No thread from Merlin to look in: Gmail headers (Your pipeline's own detection, above) are the check when connected.
  if (!it.threadId || !ml) return ml || netOf(s, memberId)?.gm ? false : null;
  const prevSent = boxOf(s, memberId)?.items.find((x) => x.threadId === it.threadId && x.status === "sent" && x.messageId === it.inReplyTo);
  const after = Date.parse(prevSent?.sentAt ?? it.approvedAt ?? it.createdAt);
  const acc = await accessWith(ml.key, ml.link, ml.kind, ml.own);
  return gmailReplied(acc, it.threadId, after - 1000, mine);
}

/** Do what the same note used by hand does: the move sent, the company in the pipeline, the follow-up counted. */
async function applyEffect(token: string, it: OutboxItem) {
  const e = it.effect;
  if (!e) return;
  try {
    await perform(token, e as Action);
  } catch (err) {
    // A move that left the Crystal Ball since: the note still went, so the company goes into the pipeline as a note used at a record.
    if (e.type === "move" && err instanceof ActionError && err.message === MOVE_NOT_IN) {
      await perform(token, { type: "pipeline.sent", companyId: e.id, channel: e.channel ?? "email", to: e.to, from: "record", intro: e.intro } as Action).catch(() => {});
    }
  }
}

let ticking = false;
/**
 * Hand every due note to Gmail: a queued note whose 30 seconds are up, a scheduled follow-up at its
 * time (held back if the person replied). `only`: one member's. Each note is claimed in one write
 * first (queued -> sending), so it goes once whatever calls this at the same moment. Returns how
 * many went.
 */
export async function sendDue(nowMs = Date.now(), only?: string): Promise<number> {
  if (!sendOn()) return 0;
  const s0 = await loadState();
  const all = (s0 as WithOutbox).outbox;
  if (!all) return 0;
  const due = (x: OutboxItem) => (x.status === "queued" || x.status === "scheduled") && !!x.sendAt && Date.parse(x.sendAt) <= nowMs;
  if (!Object.entries(all).some(([id, b]) => (!only || id === only) && b.items.some(due))) return 0;
  if (ticking && !only) return 0;
  if (!only) ticking = true;
  try {
    const claimed = await T.mutate((d) => {
      const out: { member: string; id: string }[] = [];
      for (const [mid, b] of Object.entries((d as WithOutbox).outbox ?? {})) {
        if (only && mid !== only) continue;
        for (const x of b.items) if (due(x)) {
          x.status = "sending";
          out.push({ member: mid, id: x.id });
        }
      }
      return out;
    });
    let n = 0;
    for (const c of claimed) if (await sendOne(c.member, c.id, nowMs)) n++;
    return n;
  } finally {
    if (!only) ticking = false;
  }
}

async function sendOne(memberId: string, id: string, nowMs: number): Promise<boolean> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const b = boxOf(s, memberId);
  const it = b?.items.find((x) => x.id === id);
  if (!b || !it || it.status !== "sending") return false;
  const settle = (status: SendStatus, note: string | null, patch: Partial<OutboxItem> = {}) =>
    T.mutate((d) => {
      const x = boxOf(d, memberId)?.items.find((y) => y.id === id);
      if (!x) return;
      Object.assign(x, patch);
      if (status === "queued") {
        x.status = "queued";
        x.note = note;
      } else close(x, status, note);
      if (status === "sent") ensureBox(d, memberId).sent.push(iso(nowMs));
    });
  const m = memberOf(seed, s, memberId);
  if (!m) return void (await settle("cancelled", "Your account is closed, so it wasn't sent.")), false;
  if (!grantOk(b)) return void (await settle("held", "Google's permission to send is gone. Tap Approve and send to give it again.", { status: "held" })), false;
  if (sentToday(b, nowMs) >= DAILY_CAP) return void (await T.mutate((d) => {
    const x = boxOf(d, memberId)?.items.find((y) => y.id === id);
    if (x) Object.assign(x, { status: "held", note: WORDS.cap });
  })), false;
  const problem = addressProblem(seed, s, m, it.to);
  if (problem) return void (await settle("cancelled", problem)), false;
  const mine = new Set([m.email, b.grant!.email, netOf(s, memberId)?.google?.email, netOf(s, memberId)?.gmail?.email].map((x) => String(x ?? "").toLowerCase()).filter(Boolean));
  if (it.ifNoReply) {
    let r: boolean | null;
    try {
      r = await repliedSince(s, memberId, it, mine);
    } catch (e) {
      r = e instanceof GoogleError && e.code === "invalid_grant" ? null : null;
    }
    if (r === null) {
      await T.mutate((d) => {
        const x = boxOf(d, memberId)?.items.find((y) => y.id === id);
        if (x) Object.assign(x, { status: "held", note: "Merlin couldn't check for a reply, so it held your follow-up. Send it now or cancel it." });
      });
      return false;
    }
    if (r) {
      const first = firstOf(it.toName, it.to);
      await settle("replied", WORDS.replied(first));
      await T.mutate((d) => {
        pushInbox(d as never, memberId, [{ id: `send:replied:${id}`, at: iso(nowMs), kind: "workflow", line: WORDS.replied(first), sub: "Your follow-up was cancelled.", href: "/?p=messages" }]);
      }).catch(() => {});
      console.log("send: a follow-up was cancelled on a reply");
      return false;
    }
  }
  const messageId = newMessageId();
  const raw = rawOf({ to: it.to, toName: it.toName, from: b.grant!.email || null, fromName: m.name, subject: it.subject ?? "", body: it.body ?? "", messageId, inReplyTo: it.inReplyTo ?? null, references: it.refs ?? [] });
  let res: { id: string; threadId: string | null };
  try {
    try {
      res = await gmailSend(await sendAccess(memberId, b.grant!), raw, it.threadId);
    } catch (e) {
      if (!(e instanceof GoogleError) || e.status !== 401) throw e;
      access.delete(`${memberId}:send`);
      res = await gmailSend(await sendAccess(memberId, b.grant!), raw, it.threadId);
    }
  } catch (e) {
    const code = e instanceof GoogleError ? e.code : "error";
    console.error(`send: Gmail refused a note (${code})`);
    if (e instanceof GoogleError && e.code === "invalid_grant") {
      await T.mutate((d) => {
        const bb = boxOf(d, memberId);
        if (bb?.grant) bb.grant.status = "reconnect";
        const x = bb?.items.find((y) => y.id === id);
        if (x) Object.assign(x, { status: "held", note: "Google's permission to send is gone. Tap Approve and send to give it again." });
      });
      return false;
    }
    // Google busy (5xx, 429): try again in a minute, twice. A timeout may have sent it: never tried again, the member checks.
    const tries = (it.tries ?? 0) + 1;
    if (e instanceof GoogleError && (e.status >= 500 || e.status === 429) && tries < 3) {
      await settle("queued", "Gmail was busy. Merlin tries again in a minute.", { tries, sendAt: iso(nowMs + 60_000) });
      arm(memberId, id, nowMs + 60_000);
      return false;
    }
    await settle("failed", e instanceof GoogleError && (e.code === "timeout" || e.code === "unreachable") ? "Gmail didn't answer. Check your Sent folder before you send it again." : "Gmail didn't take it. Send it from your own mail.", { tries });
    return false;
  }
  // The Message-ID Gmail kept, so a follow-up can name it (headers only, when Merlin has them).
  let kept: string | null = null;
  const ml = metaLink(s, memberId);
  if (ml) kept = await accessWith(ml.key, ml.link, ml.kind, ml.own).then((acc) => gmailMessageId(acc, res.id)).catch(() => null);
  await settle("sent", null, { sentAt: iso(nowMs), gmailId: res.id, threadId: res.threadId ?? it.threadId ?? null, messageId: kept ?? messageId });
  console.log("send: 1 note sent from a member's Gmail");
  const t = tokenOf(seed, await loadState(), memberId);
  if (t) await applyEffect(t, it);
  return true;
}

/* ---------- the member's view ---------- */

function viewOf(seed: Seed, s: State, m: Member, x: OutboxItem): SendItemView {
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const visible = x.companyId && g.companies.has(x.companyId) && !T.identityHidden(g, s, idx, T.tracksOf(seed, s), m, x.companyId);
  return {
    id: x.id, key: x.key, status: x.status, to: x.to, toName: x.toName, subject: x.subject, body: x.body, kind: x.kind,
    company: x.companyId ? T.pubId(x.companyId) : null, companyName: visible ? g.companies.get(x.companyId!)!.name : null, pipelineId: x.pipelineId,
    createdAt: x.createdAt, sendAt: x.sendAt, sentAt: x.sentAt, threaded: !!x.threadId && !!x.inReplyTo, byAgent: !!x.byAgent, note: x.note ?? null,
  };
}

export async function sendViewFor(memberId: string, nowMs = Date.now()): Promise<SendView> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberOf(seed, s, memberId);
  if (!m) throw new ActionError(SIGNED_OUT);
  const b = boxOf(s, memberId);
  const items = [...(b?.items ?? [])].sort((x, y) => Date.parse(y.approvedAt ?? y.createdAt) - Date.parse(x.approvedAt ?? x.createdAt)).slice(0, 60);
  const threads: SendView["threads"] = {};
  for (const x of [...(b?.items ?? [])].sort((p, q) => Date.parse(p.sentAt ?? "") - Date.parse(q.sentAt ?? ""))) {
    if (x.status === "sent" && x.companyId && x.subject && x.threadId) threads[T.pubId(x.companyId)] = { to: x.to, toName: x.toName, subject: x.subject };
  }
  return {
    on: true,
    granted: grantOk(b),
    from: grantOk(b) ? b!.grant!.email || null : null,
    today: sentToday(b, nowMs),
    cap: DAILY_CAP,
    replyCheck: !!metaLink(s, memberId) || !!netOf(s, memberId)?.gm,
    items: items.map((x) => viewOf(seed, s, m, x)),
    threads,
  };
}

export async function sendView(token: string | null): Promise<SendView> {
  const { m } = await who(token);
  // Due notes go on page loads too (the scheduler's timer is the other way, and each note's own timer).
  void sendDue(Date.now(), m.id).catch(() => {});
  return sendViewFor(m.id);
}

/* ---------- the rest of Merlin ---------- */

/** The scheduler's tick (lib/jobs.ts runDueJobs). Cheap when nothing is due. */
export async function sendTick(nowMs = Date.now()): Promise<number> {
  if (!sendOn()) return 0;
  return sendDue(nowMs);
}

/** Disconnect Google (lib/google forgetIn): the permission to send goes with it. */
export function forgetGrant(s: State, memberId: string): string | null {
  const b = boxOf(s, memberId);
  const t = b?.grant ? unseal(b.grant.token) : null;
  if (b) delete b.grant;
  access.delete(`${memberId}:send`);
  return t;
}
/** The send grant's refresh token, unsealed, so Disconnect Google can revoke it at Google too. */
export function sendGrantToken(s: State, memberId: string): string | null {
  const g = boxOf(s, memberId)?.grant;
  return g ? unseal(g.token) : null;
}

/**
 * The member's own "Stop sending from my Gmail": the permission goes here and at Google. Notes that
 * wait (the 30 seconds, a scheduled follow-up) are held, never sent without it.
 */
export async function stopSending(token: string | null): Promise<{ message: string; view: SendView }> {
  if (!sendOn()) throw new ActionError("Sending isn't on.");
  const { m } = await who(token);
  const t = await T.mutate((d) => {
    const b = boxOf(d, m.id);
    for (const x of b?.items ?? []) {
      if (x.status === "queued" || x.status === "scheduled" || x.status === "grant") {
        x.status = "held";
        x.note = "You stopped Merlin sending from your Gmail, so this one waits. Approve it again to give the permission back.";
        disarm(x.id);
      }
    }
    return forgetGrant(d, m.id);
  });
  if (t) await revoke(t).catch(() => false);
  return { message: "Done. Merlin can't send from your Gmail now. Your notes stay here as drafts.", view: await sendViewFor(m.id) };
}

/** Account closure's delete (lib/table.ts purgeMember): the whole outbox, the grant and every record. */
export function forgetOutbox(s: State, memberId: string) {
  const all = (s as WithOutbox).outbox;
  if (all) delete all[memberId];
  access.delete(`${memberId}:send`);
}

/** Pilot metrics: counts only, never who, to whom or what. */
export function sendCounts(s: State, nowMs = Date.now()): { members: number; sent7: number; sent30: number; undone30: number; replied30: number; held: number; failed30: number; granted: number } {
  const out = { members: 0, sent7: 0, sent30: 0, undone30: 0, replied30: 0, held: 0, failed30: 0, granted: 0 };
  for (const b of Object.values((s as WithOutbox).outbox ?? {})) {
    let used = false;
    if (grantOk(b)) out.granted++;
    for (const x of b.items) {
      const age = nowMs - Date.parse(x.sentAt ?? x.approvedAt ?? x.createdAt);
      if (x.status === "sent") {
        used = true;
        if (age < 7 * DAY) out.sent7++;
        if (age < 30 * DAY) out.sent30++;
      } else if (x.status === "cancelled" && x.approvedAt && age < 30 * DAY) out.undone30++;
      else if (x.status === "replied" && age < 30 * DAY) out.replied30++;
      else if (x.status === "held") out.held++;
      else if (x.status === "failed" && age < 30 * DAY) out.failed30++;
    }
    if (used) out.members++;
  }
  return out;
}
