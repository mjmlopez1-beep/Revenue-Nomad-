/**
 * Proposals on the server: a member's own drafts, sending one to the client who signs, and the
 * client's side (read, confirm the email with a code, sign or decline), with the audit trail.
 * Every change goes through lib/table.ts mutate (one writer, in order). Merlin calls no model
 * here: what a member's own Claude extracted from a call arrives as fields through the connector.
 *
 * Privacy: a proposal is its member's alone (no other member, no admin, not the export). The
 * client gets the frozen copy of the version sent to them (FrozenDoc) and nothing else.
 *
 * The signing link is signed and expires: /sign/<send id>.<expiry>.<HMAC>, good for SIGN_DAYS,
 * and only while that send is the live one (a change after sending makes a new version and
 * voids the old link; the member can void it too). The signed copy's link is
 * /signed/<send id>.<HMAC>, kept for both sides.
 *
 * What makes a signature hold up (ESIGN Act / UETA): consent to sign electronically, shown and
 * kept word for word with its version; the signer's intent (their typed full name and a click on
 * Sign); attribution (a 6-digit code sent to the signer's email, confirmed before signing, with
 * the IP address and browser of each step); the signature tied to the record (the SHA-256 of the
 * exact document shown, checked again at signing and kept with the signature, the content frozen
 * from then on); and a copy both sides keep (emailed, printable, with the audit trail).
 */
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { ActionError, loadSeed, loadState, memberByToken, perform, viewPatch, tableInternals as T, type Member, type Seed, type State } from "../table";
import { emailEnabled, sendEmail } from "../email";
import { FIND_MIN, functionOf } from "../tableFields";
import { PRICES } from "../billing/rules";
import { upgradeUrl } from "../plan";
import { publicBase } from "../links";
import { TEMPLATES, blanksInWords, blanksOf, blockDef, docFields, fieldDefaults, rendered, templateBlocks, templateDef } from "./library";
export { docFields };
import { codeEmail, declinedEmail, proposalEmail, signedEmail } from "./emails";
import { CLOSE_BUILD, blocksOfMine, isMineId, templatesOf } from "./mine";
import { aiConfigured } from "./aiConfig";
import { AI_PACK_LINK, PACK_PRICE_USD, budgetOf, usedUpWords } from "./aiUsage";
import { pipelineEvent } from "./pipelineHook";
import {
  CONSENT_VERSION,
  consentText,
  type AuditEvent,
  type FrozenDoc,
  type ProposalBlock,
  type ProposalRec,
  type ProposalSendRec,
  type ProposalStatus,
  type ProposalsView,
  type SignedCopy,
  type SignerInfo,
  type SignerView,
  type StoredProposal,
  type StoredSend,
} from "./types";

const DAY = 86_400_000;
/** How long a signing link works. */
export const SIGN_DAYS = 30;
/** How long a code works, wrong tries before a new one is needed, and codes a send can have in an hour. */
export const CODE_TTL_MS = 15 * 60_000;
export const CODE_TRIES = 5;
export const CODES_PER_HOUR = 5;
export const LIMITS = { proposals: 200, blocks: 40, title: 160, body: 8000, fields: 300, fieldKey: 60, fieldValue: 3000, notes: 300, note: 400, reason: 1000, message: 600 } as const;
/**
 * Building proposals in Merlin is Close (lib/billing/rules.ts canClose, closeNow here): the
 * trial is Close, so during it a member builds, saves My templates and sends. Once it ends, without
 * Close: no new proposal (blank, from Merlin's templates or their own), no edits, no saved
 * template added, no kit for their Claude. What they made stays stored, never deleted, and comes
 * back when they upgrade. Sending for signature and Claude drafting are Close too.
 */
export { CLOSE_BUILD };
export const PRO_SEND = `Sending for signature is on Close: $${PRICES.closeMonth} a month, or $${PRICES.closeYear} a year.`;
export const EMAIL_OFF = "Email isn't set up on Merlin yet, so a proposal can't go out for signature.";

/** A problem to tell the member or the client in a sentence. `status` for the route. */
export class ProposalProblem extends Error {
  constructor(
    message: string,
    public status = 400,
    public upgrade?: string,
  ) {
    super(message);
  }
}

const newId = (p: string) => `${p}${randomBytes(9).toString("base64url")}`;
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const mac = (what: string) => createHmac("sha256", T.ID_KEY).update(what).digest("base64url").slice(0, 32);
const base = (origin?: string) => (publicBase() ?? origin ?? "").replace(/\/$/, "");

/* ---------- links ---------- */

export const signToken = (sendId: string, expMs: number) => `${sendId}.${expMs.toString(36)}.${mac(`rn-sign:${sendId}:${expMs}`)}`;
export const copyToken = (sendId: string) => `${sendId}.${mac(`rn-signed:${sendId}`)}`;
export const signLink = (origin: string | undefined, x: StoredSend) => `${base(origin)}/sign/${signToken(x.id, Date.parse(x.expiresAt))}`;
export const copyLink = (origin: string | undefined, x: StoredSend) => `${base(origin)}/signed/${copyToken(x.id)}`;

/** A signing link's send id and expiry, when its HMAC holds. */
export function readSignToken(raw: unknown): { sendId: string; expMs: number } | null {
  const m = String(raw ?? "").match(/^(s_[A-Za-z0-9_-]{12})\.([0-9a-z]{1,12})\.([A-Za-z0-9_-]{32})$/);
  if (!m) return null;
  const expMs = parseInt(m[2], 36);
  if (!Number.isFinite(expMs) || !same(m[3], mac(`rn-sign:${m[1]}:${expMs}`))) return null;
  return { sendId: m[1], expMs };
}
export function readCopyToken(raw: unknown): string | null {
  const m = String(raw ?? "").match(/^(s_[A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{32})$/);
  return m && same(m[2], mac(`rn-signed:${m[1]}`)) ? m[1] : null;
}

/* ---------- the document and its hash ---------- */

const sortKeys = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(sortKeys) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys((x as Record<string, unknown>)[k])])) : x;
/** The SHA-256 of the document's canonical JSON (keys sorted), hex. */
export const hashDoc = (d: FrozenDoc) => createHash("sha256").update(JSON.stringify(sortKeys(d))).digest("hex");

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

function freeze(p: StoredProposal, signer: SignerInfo, now: string): FrozenDoc {
  const f = docFields({ ...p, signer });
  return {
    title: p.title,
    version: p.version,
    company: p.companyName,
    from: { name: f["provider.name"] || "", title: f["provider.title"] || "" },
    to: { name: signer.name, title: signer.title ?? "", email: signer.email },
    blocks: rendered(p.blocks, f),
    preparedAt: now,
  };
}

/* ---------- status ---------- */

function sendStatus(x: StoredSend, nowMs: number): Exclude<ProposalStatus, "draft"> {
  if (x.signed) return "signed";
  if (x.declined) return "declined";
  if (x.voided) return "void";
  if (nowMs > Date.parse(x.expiresAt)) return "expired";
  return x.viewedAt ? "viewed" : "sent";
}
/** The send of the proposal's current version (the newest), if it has one. */
const currentSend = (p: StoredProposal) => [...p.sends].reverse().find((x) => x.version === p.version) ?? null;
const live = (x: StoredSend | null, nowMs: number): x is StoredSend => !!x && (sendStatus(x, nowMs) === "sent" || sendStatus(x, nowMs) === "viewed");
export const statusOf = (p: StoredProposal, nowMs = Date.now()): ProposalStatus => {
  const x = currentSend(p);
  return x ? sendStatus(x, nowMs) : "draft";
};
const isSigned = (p: StoredProposal) => p.sends.some((x) => !!x.signed);

function sendRec(x: StoredSend, nowMs: number, origin?: string): ProposalSendRec {
  const st = sendStatus(x, nowMs);
  return {
    id: x.id,
    version: x.version,
    signer: { ...x.signer },
    status: st,
    sentAt: x.sentAt,
    expiresAt: x.expiresAt,
    viewedAt: x.viewedAt ?? null,
    codeVerifiedAt: x.codeVerifiedAt ?? null,
    signedAt: x.signed?.at ?? null,
    signedName: x.signed?.name ?? null,
    declinedAt: x.declined?.at ?? null,
    declineReason: x.declined?.reason ?? null,
    voidedAt: x.voided?.at ?? null,
    hash: x.hash,
    copyUrl: x.signed ? copyLink(origin, x) : null,
    events: x.events.map((e) => ({ ...e })),
  };
}

export function recOf(p: StoredProposal, nowMs = Date.now(), origin?: string): ProposalRec {
  const cur = currentSend(p);
  return {
    id: p.id,
    title: p.title,
    company: { id: p.companyPub, name: p.companyName },
    templateId: p.templateId,
    blocks: p.blocks.map((b) => ({ ...b })),
    fields: { ...p.fields },
    sources: { ...p.sources },
    notes: p.notes.map((n) => ({ ...n })),
    signerOnCall: p.signerOnCall,
    signer: p.signer ? { ...p.signer } : null,
    version: p.version,
    status: statusOf(p, nowMs),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    send: cur ? sendRec(cur, nowMs, origin) : null,
    history: p.sends
      .filter((x) => x !== cur)
      .reverse()
      .map((x) => sendRec(x, nowMs, origin)),
  };
}

/* ---------- the member's side ---------- */

const memberOf = (seed: Seed, s: State, token: string | null): Member => {
  const me = memberByToken(seed, token, s);
  if (!me) throw new ProposalProblem("You're signed out. Sign in again to see your proposals.", 401);
  return me;
};
const titleOf = (s: State, me: Member) => s.profiles[me.id]?.title || (me.title === "Member" ? "" : me.title) || "";
const fnOf = (s: State, me: Member) => s.profiles[me.id]?.function ?? functionOf(me.title) ?? null;
/** Not on Close now (Free and Pro alike, after the trial): proposals are read only. The one gate is canClose. */
const onFree = (s: State, memberId: string, nowMs: number) => !T.closeNow(s, memberId, nowMs);
/** Building (a new proposal, an edit, a copy, a saved template, the kit) needs Close: else the upgrade prompt. */
export function buildGate(s: State, memberId: string, nowMs: number, origin?: string): void {
  if (onFree(s, memberId, nowMs)) throw new ProposalProblem(CLOSE_BUILD, 403, upgradeUrl(base(origin), "proposals"));
}
const mine = (s: State, me: Member, id: unknown): StoredProposal => {
  const p = (s.proposals ?? []).find((x) => x.id === id && x.memberId === me.id);
  if (!p) throw new ProposalProblem("That proposal isn't there anymore. Open Proposals again.", 404);
  return p;
};

export async function listProposals(token: string | null, origin?: string, nowMs = Date.now()): Promise<ProposalsView> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberOf(seed, s, token);
  const free = onFree(s, me.id, nowMs);
  const { docRecsOf } = await import("../documents/store");
  const { templateChoices } = await import("./kit");
  return {
    proposals: (s.proposals ?? [])
      .filter((p) => p.memberId === me.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((p) => recOf(p, nowMs, origin)),
    documents: docRecsOf(s, me.id, nowMs, origin),
    templates: templateChoices(s, me.id, free),
    ai: !aiConfigured() ? "off" : free ? "plan" : "on",
    aiAgreed: !!s.aiDrafts?.[me.id],
    // The AI usage all used: the words the draft gives (no numbers), and the pack's button and link.
    ...(aiConfigured() && !free && !budgetOf(s, me.id, nowMs).open ? { aiUsedUp: { words: usedUpWords(nowMs, budgetOf(s, me.id, nowMs).trial), pack: AI_PACK_LINK, button: `Add a $${PACK_PRICE_USD} usage pack` } } : {}),
    canSend: !free,
    canBuild: !free,
    templatesOpen: free ? [] : TEMPLATES.map((t) => t.id),
    email: emailEnabled(),
    me: { name: me.name, title: titleOf(s, me), function: fnOf(s, me), email: me.email },
  };
}

export async function getProposal(token: string | null, id: string, origin?: string, nowMs = Date.now()): Promise<ProposalRec> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  return recOf(mine(s, memberOf(seed, s, token), id), nowMs, origin);
}

/* ---------- cleaning what comes in ---------- */

/**
 * Control characters, and the invisible ones that can reorder or hide what a reader sees: bidi
 * embeddings and overrides (U+202A to U+202E), isolates (U+2066 to U+2069), zero-width spaces,
 * joiners and marks (U+200B to U+200F) and the BOM (U+FEFF). A title like "\u202Egnp.exe.pdf"
 * would otherwise read as something else. Proposals and documents (their text and titles) alike.
 */
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const cleanText = (raw: unknown, max: number) =>
  String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(CTRL, "")
    .slice(0, max);
const cleanLine = (raw: unknown, max: number) => cleanText(raw, max * 2).replace(/\s+/g, " ").trim().slice(0, max);
const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i;

function cleanBlocks(raw: unknown): ProposalBlock[] {
  if (!Array.isArray(raw)) throw new ProposalProblem("The blocks didn't come through. Refresh and try again.");
  if (raw.length > LIMITS.blocks) throw new ProposalProblem(`Keep it to ${LIMITS.blocks} blocks.`);
  const ids = new Set<string>();
  return raw.map((b, i) => {
    const o = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
    let id = cleanLine(o.id, 40).replace(/[^A-Za-z0-9_-]/g, "") || `b${i}${Date.now().toString(36)}`;
    while (ids.has(id)) id += "x";
    ids.add(id);
    const blockId = blockDef(String(o.blockId ?? "")) ? String(o.blockId) : "custom";
    const title = cleanLine(o.title, 120) || blockDef(blockId)?.title || "Section";
    const body = cleanText(o.body, LIMITS.body + 1);
    if (body.length > LIMITS.body) throw new ProposalProblem(`Keep each block under ${LIMITS.body.toLocaleString("en-US")} characters. "${title}" is longer.`);
    return { id, blockId, title, body };
  });
}
function cleanFields(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ProposalProblem("The fields didn't come through. Refresh and try again.");
  const out: Record<string, string> = {};
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > LIMITS.fields) throw new ProposalProblem(`That's more than ${LIMITS.fields} fields.`);
  for (const [k, v] of entries) {
    if (!/^[A-Za-z0-9_.]{1,60}$/.test(k)) continue;
    const t = cleanText(v, LIMITS.fieldValue).trim();
    if (t) out[k] = t;
  }
  return out;
}
function cleanNotes(raw: unknown, now: string) {
  if (!Array.isArray(raw)) throw new ProposalProblem("The notes didn't come through. Refresh and try again.");
  return raw.slice(0, LIMITS.notes).flatMap((n) => {
    const o = (n && typeof n === "object" ? n : {}) as Record<string, unknown>;
    const text = cleanLine(o.text, LIMITS.note);
    const key = cleanLine(o.key, 40).replace(/[^A-Za-z0-9_.]/g, "") || "pains";
    return text ? [{ key, text, at: typeof o.at === "string" && !Number.isNaN(Date.parse(o.at)) ? o.at : now }] : [];
  });
}
export function cleanSigner(raw: unknown): SignerInfo {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = cleanLine(o.name, 100);
  const email = cleanLine(o.email, 160).toLowerCase();
  const title = cleanLine(o.title, 100);
  if (!name) throw new ProposalProblem("Type the name of the person who signs.");
  if (!EMAIL.test(email)) throw new ProposalProblem("Type the email of the person who signs.");
  return { name, email, ...(title ? { title } : {}) };
}

/** What a change may carry. Each part is optional. */
export interface ProposalPatch {
  title?: unknown;
  blocks?: unknown;
  fields?: unknown;
  /** Fields to set or clear one at a time ("" clears), on top of the rest. */
  setFields?: unknown;
  notes?: unknown;
  signerOnCall?: unknown;
  signer?: unknown;
  companyName?: unknown;
  /** The company on Merlin to link it to (its public id), when it isn't linked yet (linkProposal). */
  companyId?: unknown;
  /** Where fields set here came from (claude, discovery, rate, manual). */
  source?: string;
}

/** The document's parts, to tell whether a change touches what the client reads. */
const docPart = (p: StoredProposal) => JSON.stringify([p.title, p.blocks, p.fields, p.signer, p.companyName]);

function applyPatch(p: StoredProposal, a: ProposalPatch, now: string, nowMs: number): void {
  if (isSigned(p)) throw new ProposalProblem("It's signed, so it can't change. Duplicate it to start a new one.");
  const before = docPart(p);
  if (a.title !== undefined) p.title = cleanLine(a.title, LIMITS.title) || p.title;
  if (a.blocks !== undefined) p.blocks = cleanBlocks(a.blocks);
  const src = a.source && /^[a-z_]{1,20}$/.test(a.source) ? a.source : "manual";
  if (a.fields !== undefined) {
    const f = cleanFields(a.fields);
    for (const k of Object.keys(f)) if (f[k] !== p.fields[k]) p.sources[k] = src;
    for (const k of Object.keys(p.sources)) if (!(k in f)) delete p.sources[k];
    p.fields = f;
  }
  if (a.setFields !== undefined) {
    if (!a.setFields || typeof a.setFields !== "object" || Array.isArray(a.setFields)) throw new ProposalProblem("The fields didn't come through.");
    for (const [k, v] of Object.entries(a.setFields as Record<string, unknown>)) {
      if (!/^[A-Za-z0-9_.]{1,60}$/.test(k)) continue;
      const t = cleanText(v, LIMITS.fieldValue).trim();
      if (t) (p.fields[k] = t), (p.sources[k] = src);
      else delete p.fields[k], delete p.sources[k];
    }
    if (Object.keys(p.fields).length > LIMITS.fields) throw new ProposalProblem(`That's more than ${LIMITS.fields} fields.`);
  }
  if (a.notes !== undefined) p.notes = cleanNotes(a.notes, now);
  if (a.signerOnCall !== undefined) p.signerOnCall = a.signerOnCall === true ? true : a.signerOnCall === false ? false : null;
  if (a.signer !== undefined) p.signer = a.signer === null ? null : cleanSigner(a.signer);
  if (a.companyName !== undefined && !p.companyId) p.companyName = cleanLine(a.companyName, 120);
  p.updatedAt = now;
  // A change to what the client reads, after this version went out: a new version, and the old link stops.
  if (docPart(p) !== before && p.sends.some((x) => x.version === p.version)) {
    for (const x of p.sends) if (live(x, nowMs)) (x.voided = { at: now, why: "changed" }), x.events.push({ kind: "voided", at: now, note: "A new version replaced it" });
    p.version++;
  }
}

/** The member's view of a company on Merlin (as their table shows it), with its internal id. */
export async function companyFor(token: string, pub: string): Promise<{ internal: string; name: string; hidden: boolean; facts: Record<string, string> } | null> {
  const patch = await viewPatch(token, [pub], { asMember: true });
  const c = patch?.companies?.find((x) => x.id === pub);
  if (!c) return null;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const g = T.graph(seed, s);
  let internal = "";
  for (const id of g.companies.keys()) if (T.pubId(id) === pub) (internal = id);
  if (!internal) return null;
  const v = (k: string) => (c.cells[k]?.s === "value" ? String((c.cells[k] as { v: unknown }).v ?? "") : "");
  const facts: Record<string, string> = {};
  for (const [k, f] of [["company.industry", "industry"], ["company.revenue", "revenue"], ["company.employees", "employees"], ["company.hq", "hq"]] as const) if (v(f)) facts[k] = v(f);
  return { internal, name: c.hidden ? "" : c.name, hidden: !!c.hidden, facts };
}

/**
 * A company typed by name or website, looked up as find_company looks it up (the action "find":
 * its exact full name or its website, locked companies too, with find's daily limits). One match is
 * its public id; none, several or a refusal is null, and the proposal stays unlinked.
 */
export async function lookUpCompany(token: string | null, typed: string, origin?: string): Promise<string | null> {
  const text = String(typed ?? "").trim();
  if (!token || text.length < FIND_MIN) return null;
  try {
    const r = await perform(token, { type: "find", text }, origin, { asMember: true });
    return r.found !== "none" && r.ids?.length === 1 ? r.ids[0] : null;
  } catch (e) {
    if (e instanceof ActionError) return null;
    throw e;
  }
}

/** What NOT_LINKED says: the proposal names no company on Merlin, so the pipeline can't move. */
export const NOT_LINKED = "Not linked to a company yet. Your pipeline won't move when they sign.";

/**
 * Link a proposal to its company on Merlin: a company the member picked (its public id), or the
 * name or website they typed, found as find_company finds it. What the client reads doesn't
 * change (the company's name on the proposal stays as typed), so no new version. A proposal out
 * for signature, or signed, moves the pipeline as it would have: Proposal, or Won.
 */
export async function linkProposal(token: string | null, id: string, a: { companyId?: unknown; name?: unknown }, origin?: string, nowMs = Date.now()): Promise<ProposalRec> {
  const [seed, s0] = await Promise.all([loadSeed(), loadState()]);
  const me0 = memberOf(seed, s0, token);
  const p0 = mine(s0, me0, id);
  const pub = typeof a.companyId === "string" && a.companyId ? a.companyId : await lookUpCompany(token, String(a.name ?? p0.companyName ?? ""), origin);
  if (!pub) throw new ProposalProblem("Merlin didn't find one company by that exact name or website. Type its full name or its website, or pick it from the list.");
  const co = await companyFor(token!, pub);
  if (!co) throw new ProposalProblem("That company isn't on Merlin. Type its full name or its website.");
  const now = new Date(nowMs).toISOString();
  return T.mutate((s) => {
    const me = memberOf(seed, s, token);
    const p = mine(s, me, id);
    if (p.companyId === co.internal) return recOf(p, nowMs, origin);
    p.companyId = co.internal;
    p.companyPub = pub;
    if (!p.companyName) p.companyName = co.name || cleanLine(a.name, 120);
    p.updatedAt = now;
    // Already out, or signed: the pipeline catches up, as if it had been linked from the start.
    const signed = p.sends.find((x) => x.signed);
    const out = currentSend(p);
    if (signed?.signed) pipelineEvent(s, me.id, p.companyId, "signed", signed.signed.at);
    else if (live(out, nowMs)) pipelineEvent(s, me.id, p.companyId, "proposal_sent", out.sentAt);
    return recOf(p, nowMs, origin);
  });
}

/** A new proposal from a template (or blank), for a company on Merlin or one typed in. */
export async function createProposal(
  token: string | null,
  a: { templateId?: unknown; companyId?: unknown; companyName?: unknown; title?: unknown; signer?: unknown; fields?: unknown; blocks?: unknown; notes?: unknown; signerOnCall?: unknown; source?: string },
  origin?: string,
  nowMs = Date.now(),
): Promise<ProposalRec> {
  const [seed, s0] = await Promise.all([loadSeed(), loadState()]);
  const me0 = memberOf(seed, s0, token);
  // A new proposal, blank, from Merlin's templates or from their own: Close (the trial is Close).
  buildGate(s0, me0.id, nowMs, origin);
  const templateId = a.templateId === null || a.templateId === undefined || a.templateId === "" || a.templateId === "blank" ? null : String(a.templateId);
  // One of the member's own templates (My templates): its sections.
  const mineT = isMineId(templateId) ? templatesOf(s0, me0.id).find((t) => t.id === templateId) : undefined;
  if (isMineId(templateId) && !mineT) throw new ProposalProblem("That template of yours isn't there anymore.", 404);
  if (templateId && !mineT && !templateDef(templateId)) throw new ProposalProblem("That template isn't in the library.");
  const picked = typeof a.companyId === "string" && a.companyId ? a.companyId : null;
  const typed = cleanLine(a.companyName, 120);
  // A company typed, not picked: its exact name or website links it, locked ones too (as find_company finds one), so the pipeline moves when it's signed.
  const pub = picked ?? (typed ? await lookUpCompany(token, typed, origin) : null);
  const co = pub ? await companyFor(token!, pub) : null;
  if (picked && !co) throw new ProposalProblem("That company isn't on Merlin. Type its name instead.");
  const name = co ? co.name || typed : typed;
  const now = new Date(nowMs).toISOString();
  return T.mutate((s) => {
    const me = memberOf(seed, s, token);
    const list = (s.proposals ??= []);
    if (list.filter((p) => p.memberId === me.id).length >= LIMITS.proposals) throw new ProposalProblem(`You have ${LIMITS.proposals} proposals, which is the most. Delete an old draft first.`);
    const blocks = mineT ? blocksOfMine(mineT) : templateBlocks(templateId);
    const fields: Record<string, string> = { ...fieldDefaults(blocks), ...(co?.facts ?? {}) };
    const sources: Record<string, string> = Object.fromEntries(Object.keys(fields).map((k) => [k, k.startsWith("company.") ? "record" : "manual"]));
    const set = (k: string, v: string, src: string) => v && ((fields[k] = v), (sources[k] = src));
    set("provider.name", me.name, "profile");
    set("provider.signerName", me.name, "profile");
    set("provider.title", titleOf(s, me), "profile");
    set("client.companyName", name, co ? "record" : "manual");
    // Who it goes to, from the member's own deal at this company (as they typed it; never a name that came from Google).
    const deal = co ? [...(s.pipeline?.[me.id]?.entries ?? [])].filter((e) => e.companyId === co.internal).sort((x, y) => (y.updatedAt ?? "").localeCompare(x.updatedAt ?? ""))[0] : undefined;
    if (deal?.to && !deal.to.google) {
      set("client.signerName", cleanLine(deal.to.name, 100), "pipeline");
      set("client.signerTitle", cleanLine(deal.to.role, 100), "pipeline");
    }
    set("proposal.date", fmtDay(nowMs), "manual");
    const t = templateDef(templateId);
    const p: StoredProposal = {
      id: newId("pr_"),
      memberId: me.id,
      companyId: co?.internal ?? null,
      companyPub: co ? pub! : null,
      companyName: name,
      templateId,
      title: cleanLine(a.title, LIMITS.title) || `${t ? t.title.split(":")[0] : mineT ? mineT.title : "Proposal"}${name ? ` for ${name}` : ""}`.slice(0, LIMITS.title),
      blocks,
      fields,
      sources,
      notes: [],
      signerOnCall: null,
      signer: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      sends: [],
    };
    // What the member's own Claude brought (create_or_update_proposal): applied as a change, so it is checked the same way.
    applyPatch(p, { blocks: a.blocks, signer: a.signer, notes: a.notes, signerOnCall: a.signerOnCall, setFields: a.fields, source: a.source }, now, nowMs);
    list.push(p);
    return recOf(p, nowMs, origin);
  });
}

export async function updateProposal(token: string | null, id: string, a: ProposalPatch, origin?: string, nowMs = Date.now()): Promise<ProposalRec> {
  const seed = await loadSeed();
  const now = new Date(nowMs).toISOString();
  const rec = await T.mutate((s) => {
    const me = memberOf(seed, s, token);
    buildGate(s, me.id, nowMs, origin);
    const p = mine(s, me, id);
    applyPatch(p, a, now, nowMs);
    return recOf(p, nowMs, origin);
  });
  // A company picked or typed for a proposal not linked yet: linked (linkProposal), quietly when a typed name matches nothing.
  const want = typeof a.companyId === "string" && a.companyId ? a.companyId : null;
  if (rec.company.id || (!want && a.companyName === undefined) || (!want && !rec.company.name)) return rec;
  try {
    return await linkProposal(token, id, want ? { companyId: want } : { name: rec.company.name }, origin, nowMs);
  } catch (e) {
    if (e instanceof ProposalProblem && !want) return rec;
    throw e;
  }
}

export async function duplicateProposal(token: string | null, id: string, origin?: string, nowMs = Date.now()): Promise<ProposalRec> {
  const seed = await loadSeed();
  const now = new Date(nowMs).toISOString();
  return T.mutate((s) => {
    const me = memberOf(seed, s, token);
    buildGate(s, me.id, nowMs, origin);
    const p = mine(s, me, id);
    if ((s.proposals ?? []).filter((x) => x.memberId === me.id).length >= LIMITS.proposals) throw new ProposalProblem(`You have ${LIMITS.proposals} proposals, which is the most. Delete an old draft first.`);
    const copy: StoredProposal = { ...structuredClone(p), id: newId("pr_"), title: `${p.title} (copy)`.slice(0, LIMITS.title), version: 1, sends: [], createdAt: now, updatedAt: now };
    s.proposals!.push(copy);
    return recOf(copy, nowMs, origin);
  });
}

export async function deleteProposal(token: string | null, id: string): Promise<void> {
  const seed = await loadSeed();
  await T.mutate((s) => {
    const p = mine(s, memberOf(seed, s, token), id);
    if (isSigned(p)) throw new ProposalProblem("A signed proposal is kept as the record of what was agreed.");
    s.proposals = (s.proposals ?? []).filter((x) => x !== p);
  });
}

/** Void the live link: the client can't open or sign it any more. */
export async function voidProposal(token: string | null, id: string, origin?: string, nowMs = Date.now()): Promise<ProposalRec> {
  const seed = await loadSeed();
  const now = new Date(nowMs).toISOString();
  return T.mutate((s) => {
    const p = mine(s, memberOf(seed, s, token), id);
    const x = currentSend(p);
    if (!live(x, nowMs)) throw new ProposalProblem(isSigned(p) ? "It's signed already, so it can't be voided." : "There's no sent link to void.");
    x.voided = { at: now, why: "member" };
    x.events.push({ kind: "voided", at: now, note: "Voided by the sender" });
    p.updatedAt = now;
    return recOf(p, nowMs, origin);
  });
}

/** Send the current version to the client who signs: a signed link by email, good for SIGN_DAYS. */
export async function sendProposal(
  token: string | null,
  id: string,
  a: { signer?: unknown; message?: unknown },
  origin?: string,
  nowMs = Date.now(),
): Promise<{ proposal: ProposalRec; message: string }> {
  const seed = await loadSeed();
  const s0 = await loadState();
  const me0 = memberOf(seed, s0, token);
  if (onFree(s0, me0.id, nowMs)) throw new ProposalProblem(PRO_SEND, 403, upgradeUrl(base(origin), "proposals"));
  if (!emailEnabled()) throw new ProposalProblem(EMAIL_OFF);
  const now = new Date(nowMs).toISOString();
  const note = cleanLine(a.message, LIMITS.message);
  const out = await T.mutate((s) => {
    const me = memberOf(seed, s, token);
    const p = mine(s, me, id);
    if (isSigned(p)) throw new ProposalProblem("It's signed already.");
    const signer = a.signer !== undefined ? cleanSigner(a.signer) : p.signer;
    if (!signer) throw new ProposalProblem("Type the name and email of the person who signs.");
    const cur = currentSend(p);
    if (live(cur, nowMs)) throw new ProposalProblem("This version is out for signature already. Void it, or change it to send a new version.");
    if (signer.email === me.email.toLowerCase()) throw new ProposalProblem("Send it to the person who signs for the client, not to yourself.");
    p.signer = signer;
    // This version went out before (voided, declined or expired): the new send is a new version.
    if (cur) p.version++;
    const blanks = blanksOf(p.blocks, docFields(p));
    if (blanks.length) throw new ProposalProblem(`Fill the ${blanks.length === 1 ? "last blank" : `${blanks.length} blanks`} first: ${blanksInWords(blanks, 5)}.`);
    const doc = freeze(p, signer, now);
    const x: StoredSend = {
      id: `s_${randomBytes(9).toString("base64url")}`,
      version: p.version,
      signer,
      doc,
      hash: hashDoc(doc),
      sentAt: now,
      expiresAt: new Date(nowMs + SIGN_DAYS * DAY).toISOString(),
      events: [{ kind: "sent", at: now, note: signer.email }],
    };
    p.sends.push(x);
    p.updatedAt = now;
    pipelineEvent(s, me.id, p.companyId, "proposal_sent", now);
    return { p, x: structuredClone(x), me, title: titleOf(s, me) };
  });
  const mail = proposalEmail({ signer: out.x.signer.name, member: out.me.name, memberTitle: out.title, title: out.x.doc.title, company: out.x.doc.company, link: signLink(origin, out.x), expiresAt: out.x.expiresAt, note });
  const ok = await sendEmail(out.x.signer.email, mail.subject, mail.text, mail.html, { replyTo: out.me.email });
  if (!ok) {
    // It never reached them: the send is taken back, so the member can try again.
    await T.mutate((s) => {
      const p = (s.proposals ?? []).find((y) => y.id === id);
      const x = p?.sends.find((y) => y.id === out.x.id);
      if (x && !x.voided) (x.voided = { at: now, why: "member" }), x.events.push({ kind: "voided", at: now, note: "The email didn't go out" });
    });
    throw new ProposalProblem("The email didn't go out. Try again in a moment.", 502);
  }
  return { proposal: await getProposal(token, id, origin, nowMs), message: `Sent to ${out.x.signer.name} at ${out.x.signer.email}. The link works for ${SIGN_DAYS} days.` };
}

/* ---------- the client's side ---------- */

type Found = { p: StoredProposal; x: StoredSend };
function findSend(s: State, sendId: string): Found | null {
  for (const p of s.proposals ?? []) {
    const x = p.sends.find((y) => y.id === sendId);
    if (x) return { p, x };
  }
  return null;
}
const GONE = "This link doesn't work. Ask the sender for a new one.";
function resolve(s: State, raw: unknown): Found {
  const t = readSignToken(raw);
  const f = t ? findSend(s, t.sendId) : null;
  if (!t || !f || Date.parse(f.x.expiresAt) !== t.expMs) throw new ProposalProblem(GONE, 404);
  return f;
}
function signerStatus(f: Found, nowMs: number): SignerView["status"] {
  const { x } = f;
  if (x.signed) return "signed";
  if (x.declined) return "declined";
  if (x.voided) return x.voided.why === "changed" ? "changed" : "void";
  if (nowMs > Date.parse(x.expiresAt)) return "expired";
  return "open";
}
const emailHint = (e: string) => {
  const [u, d] = e.split("@");
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(6, u.length - 2)))}@${d}`;
};
const ev = (x: StoredSend, kind: AuditEvent["kind"], at: string, meta: { ip?: string; ua?: string; note?: string } = {}) =>
  x.events.push({ kind, at, ...(meta.ip ? { ip: meta.ip.slice(0, 64) } : {}), ...(meta.ua ? { ua: meta.ua.slice(0, 300) } : {}), ...(meta.note ? { note: meta.note } : {}) });

function viewOf(f: Found, nowMs: number, origin?: string): SignerView {
  const { x } = f;
  return {
    status: signerStatus(f, nowMs),
    doc: structuredClone(x.doc),
    hash: x.hash,
    emailHint: emailHint(x.signer.email),
    codeVerified: !!x.codeVerifiedAt,
    codeSent: !!x.code && nowMs - Date.parse(x.code.at) < CODE_TTL_MS,
    consent: consentText(x.doc.from.name || "the sender"),
    consentVersion: CONSENT_VERSION,
    signedAt: x.signed?.at ?? null,
    signedName: x.signed?.name ?? null,
    declinedAt: x.declined?.at ?? null,
    expiresAt: x.expiresAt,
    copyUrl: x.signed ? copyLink(origin, x) : null,
  };
}

export interface Client {
  ip: string;
  ua: string;
}

/** The signing page: the document as sent, read-only. The first open goes on the audit trail. */
export async function signerView(token: unknown, who: Client, origin?: string, nowMs = Date.now()): Promise<SignerView> {
  const s = await loadState();
  const f0 = resolve(s, token);
  if (signerStatus(f0, nowMs) === "open" && f0.x.viewedAt) return viewOf(f0, nowMs, origin);
  const now = new Date(nowMs).toISOString();
  return T.mutate((d) => {
    const f = resolve(d, token);
    const st = signerStatus(f, nowMs);
    if (st === "open" && !f.x.viewedAt) (f.x.viewedAt = now), ev(f.x, "viewed", now, who);
    if (st === "expired" && !f.x.events.some((e) => e.kind === "expired_open")) ev(f.x, "expired_open", now, who);
    return viewOf(f, nowMs, origin);
  });
}

const notOpen = (st: SignerView["status"]) =>
  st === "signed"
    ? "It's signed already. Your copy is in your email."
    : st === "declined"
      ? "You declined this proposal. Ask the sender for a new one if you've changed your mind."
      : st === "changed"
        ? "The sender changed this proposal, so this version can't be signed. They'll send you the new one."
        : st === "void"
          ? "The sender withdrew this proposal, so it can't be signed."
          : "This link has expired. Ask the sender for a new one.";

/** Email the signer a 6-digit code (15 minutes, CODE_TRIES tries), to confirm the address is theirs. */
export async function requestCode(token: unknown, who: Client, nowMs = Date.now()): Promise<{ sent: true; emailHint: string }> {
  if (!emailEnabled()) throw new ProposalProblem("Email isn't working on our side right now. Try again later.", 503);
  const now = new Date(nowMs).toISOString();
  const out = await T.mutate((s) => {
    const f = resolve(s, token);
    const st = signerStatus(f, nowMs);
    if (st !== "open") throw new ProposalProblem(notOpen(st), 409);
    const recent = (f.x.codesSent ?? []).filter((t) => nowMs - Date.parse(t) < 3_600_000);
    if (recent.length >= CODES_PER_HOUR) throw new ProposalProblem(`That's ${CODES_PER_HOUR} codes in an hour, which is the limit. Use the newest one, or try again in an hour.`, 429);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    f.x.code = { hash: mac(`rn-pcode:${f.x.id}:${code}`), at: now, tries: 0 };
    f.x.codesSent = [...recent, now];
    ev(f.x, "code_sent", now, { ...who, note: emailHint(f.x.signer.email) });
    return { code, email: f.x.signer.email, member: f.x.doc.from.name, title: f.x.doc.title };
  });
  const mail = codeEmail({ member: out.member, title: out.title, code: out.code });
  if (!(await sendEmail(out.email, mail.subject, mail.text, mail.html))) throw new ProposalProblem("The code didn't go out. Try again in a moment.", 502);
  return { sent: true, emailHint: emailHint(out.email) };
}

export async function verifyCode(token: unknown, raw: unknown, who: Client, origin?: string, nowMs = Date.now()): Promise<SignerView> {
  const code = String(raw ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) throw new ProposalProblem("Type the 6 digits from the email.");
  const now = new Date(nowMs).toISOString();
  const r = await T.mutate((s) => {
    const f = resolve(s, token);
    const st = signerStatus(f, nowMs);
    if (st !== "open") throw new ProposalProblem(notOpen(st), 409);
    const c = f.x.code;
    if (!c || nowMs - Date.parse(c.at) > CODE_TTL_MS) return { error: "That code has expired. Ask for a new one." };
    if (c.tries >= CODE_TRIES) return { error: "That's too many wrong tries. Ask for a new code." };
    if (!same(c.hash, mac(`rn-pcode:${f.x.id}:${code}`))) {
      c.tries++;
      ev(f.x, "code_failed", now, who);
      return { error: c.tries >= CODE_TRIES ? "That code didn't match, and that was the last try. Ask for a new code." : "That code didn't match. Check the newest email and try again." };
    }
    delete f.x.code;
    f.x.codeVerifiedAt = now;
    ev(f.x, "code_verified", now, { ...who, note: f.x.signer.email });
    return { view: viewOf(f, nowMs, origin) };
  });
  // A wrong try is kept (it counts), and then told.
  if ("error" in r) throw new ProposalProblem(r.error!, 401);
  return r.view;
}

/** A full name as typed: two words or more, letters, at most 100 characters. */
const NAME = /^\p{L}[\p{L}'’.-]*(?: +\p{L}[\p{L}'’.-]*)+$/u;

export async function signProposal(token: unknown, a: { name?: unknown; consent?: unknown; hash?: unknown }, who: Client, origin?: string, nowMs = Date.now()): Promise<SignerView> {
  const name = cleanLine(a.name, 100);
  if (!NAME.test(name)) throw new ProposalProblem("Type your full name, first and last, as your signature.");
  if (a.consent !== true) throw new ProposalProblem("Tick the box to agree to sign electronically.");
  const now = new Date(nowMs).toISOString();
  const out = await T.mutate((s) => {
    const f = resolve(s, token);
    const st = signerStatus(f, nowMs);
    if (st !== "open") throw new ProposalProblem(notOpen(st), 409);
    if (!f.x.codeVerifiedAt) throw new ProposalProblem("Confirm your email with the code first.", 401);
    // The document shown is the one signed: the hash the page showed must be this send's, and the content must still hash to it.
    if (typeof a.hash !== "string" || !same(a.hash, f.x.hash) || hashDoc(f.x.doc) !== f.x.hash) throw new ProposalProblem("This page is out of date. Reload it to read the proposal again before you sign.", 409);
    const consent = consentText(f.x.doc.from.name || "the sender");
    f.x.signed = { name, at: now, ip: who.ip.slice(0, 64), ua: who.ua.slice(0, 300), consent, consentVersion: CONSENT_VERSION, hash: f.x.hash, email: f.x.signer.email };
    ev(f.x, "signed", now, { ...who, note: `typed name "${name}"` });
    f.p.updatedAt = now;
    pipelineEvent(s, f.p.memberId, f.p.companyId, "signed", now);
    return { x: structuredClone(f.x), memberId: f.p.memberId, proposalId: f.p.id, view: viewOf(f, nowMs, origin) };
  });
  // The signed copy to both sides.
  const seed = await loadSeed();
  const m = await memberFor(seed, out.memberId);
  const copy = copyLink(origin, out.x);
  const sent: string[] = [];
  for (const to of [{ k: "signer" as const, email: out.x.signer.email, name: out.x.signer.name }, ...(m?.email ? [{ k: "member" as const, email: m.email, name: m.name }] : [])]) {
    const mail = signedEmail({ to: to.k, name: to.name, member: out.x.doc.from.name, signer: out.x.signed!.name, title: out.x.doc.title, signedAt: out.x.signed!.at, copy, hash: out.x.hash });
    if (await sendEmail(to.email, mail.subject, mail.text, mail.html, to.k === "signer" && m?.email ? { replyTo: m.email } : {})) sent.push(to.k === "signer" ? "the signer" : "the sender");
  }
  if (sent.length)
    await T.mutate((s) => {
      const f = findSend(s, out.x.id);
      if (f) ev(f.x, "copy_sent", new Date().toISOString(), { note: `to ${sent.join(" and ")}` });
    });
  return out.view;
}

export async function declineProposal(token: unknown, a: { reason?: unknown }, who: Client, origin?: string, nowMs = Date.now()): Promise<SignerView> {
  const reason = cleanLine(a.reason, LIMITS.reason);
  const now = new Date(nowMs).toISOString();
  const out = await T.mutate((s) => {
    const f = resolve(s, token);
    const st = signerStatus(f, nowMs);
    if (st !== "open") throw new ProposalProblem(notOpen(st), 409);
    f.x.declined = { at: now, reason, ip: who.ip.slice(0, 64), ua: who.ua.slice(0, 300) };
    ev(f.x, "declined", now, { ...who, ...(reason ? { note: reason } : {}) });
    f.p.updatedAt = now;
    pipelineEvent(s, f.p.memberId, f.p.companyId, "declined", now);
    return { memberId: f.p.memberId, signer: f.x.signer.name, title: f.x.doc.title, view: viewOf(f, nowMs, origin) };
  });
  const m = await memberFor(await loadSeed(), out.memberId);
  if (m?.email) {
    const mail = declinedEmail({ member: m.name, signer: out.signer, title: out.title, reason, app: `${base(origin)}/?p=proposals` });
    await sendEmail(m.email, mail.subject, mail.text, mail.html);
  }
  return out.view;
}

/** The signed copy, from its own link: the document, the signature and the audit trail. Null: no such signed copy. */
export async function signedCopy(raw: unknown): Promise<SignedCopy | null> {
  const id = readCopyToken(raw);
  if (!id) return null;
  const f = findSend(await loadState(), id);
  if (!f?.x.signed) return null;
  return { doc: structuredClone(f.x.doc), hash: f.x.hash, hashNow: hashDoc(f.x.doc), signed: { ...f.x.signed }, events: f.x.events.map((e) => ({ ...e })), sentAt: f.x.sentAt, sendId: f.x.id };
}

/* ---------- helpers ---------- */

async function memberFor(seed: Seed, id: string): Promise<{ name: string; email: string } | null> {
  const s = await loadState();
  const m = seed.members.find((x) => x.id === id) ?? s.members.find((x) => x.id === id);
  return m ? { name: m.name, email: m.email } : null;
}

/** What lib/documents shares with proposals: the same links' keys, checks and clean-up. */
export const proposalInternals = { mac, same, cleanLine, cleanText, cleanSigner, emailHint, base, onFree, buildGate, titleOf, memberOf, memberFor, EMAIL, NAME };
