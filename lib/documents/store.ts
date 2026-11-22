/**
 * Documents to sign on the server: a member uploads a PDF they wrote outside Merlin, places fields
 * on its pages for each signer (Signature, Initials, Date signed, Full name, Text, Checkbox), and
 * sends it. Each signer gets a signed, expiring link in turn (or everyone at once), confirms their
 * email with a 6-digit code, agrees to sign electronically (the same consent and version as a
 * proposal), adopts a typed or drawn signature and fills their own fields. When the last one signs,
 * Merlin stamps every value into the PDF, adds an audit trail page (lib/documents/pdf.ts) and
 * emails everyone the final file.
 *
 * Every change goes through lib/table.ts mutate. The PDFs are files on the data volume
 * (lib/documents/files.ts), private to the member and the document's signers, capped at
 * DOC_MAX_BYTES. Sending is Trial and Pro, like a proposal. A company attached moves the member's
 * pipeline on send, on the last signature and on a decline (lib/proposals/pipelineHook.ts).
 *
 * Links: /sign/<signer id>.<expiry>.<HMAC> (the signer's own, good until the document expires,
 * only while it is live and their turn), and /signed/<document id>.<HMAC> for the finished file.
 */
import { randomBytes, randomInt } from "crypto";
import { loadSeed, loadState, memberByToken, tableInternals as T, type State } from "../table";
import { emailEnabled, sendEmail, MAX_ATTACHMENT_BYTES } from "../email";
import { upgradeUrl } from "../plan";
import { PRO_SEND, EMAIL_OFF, ProposalProblem, expMsOf, expiredAt, expiryFor, linkDaysOf, CODE_TTL_MS, CODE_TRIES, CODES_PER_HOUR, companyFor, dropItemRecords, proposalInternals as PI, type Client } from "../proposals/store";
import { pipelineEvent } from "../proposals/pipelineHook";
import { CONSENT_VERSION, consentText } from "../proposals/types";
import { DOC_MAX_BYTES, SIG_MAX_BYTES, commitSignature, dropSignature, readFinal, readOriginal, readSignature, removeFiles, saveFinal, saveOriginal, stageSignature } from "./files";
import { PdfProblem, buildFinal, checkPng, inspectPdf, sha256, shown } from "./pdf";
import { docCodeEmail, docDeclinedEmail, docDoneEmail, docInviteEmail } from "./emails";
import { FIELD_KINDS, type DocCopy, type DocEvent, type DocField, type DocSigner, type DocSignerRec, type DocSignerView, type DocStatus, type DocumentRec, type StoredDocument } from "./types";

export const DOC_LIMITS = { documents: 200, signers: 10, fields: 300, title: 160, label: 60, text: 200, message: 600, reason: 1000 } as const;

const newId = (p: string) => `${p}${randomBytes(9).toString("base64url")}`;
const { mac, same, cleanLine, cleanSigner, emailHint, base, onFree, titleOf, memberOf, memberFor, NAME } = PI;

/* ---------- links ---------- */

export const docSignToken = (signerId: string, expMs: number) => `${signerId}.${expMs.toString(36)}.${mac(`rn-dsign:${signerId}:${expMs}`)}`;
export const docCopyToken = (docId: string) => `${docId}.${mac(`rn-dsigned:${docId}`)}`;
const signLinkOf = (origin: string | undefined, d: StoredDocument, x: DocSigner) => `${base(origin)}/sign/${docSignToken(x.id, expMsOf(d.expiresAt))}`;
export const docCopyLink = (origin: string | undefined, d: { id: string }) => `${base(origin)}/signed/${docCopyToken(d.id)}`;
export const docDownloadLink = (origin: string | undefined, d: { id: string }) => `${base(origin)}/api/documents/file?c=${encodeURIComponent(docCopyToken(d.id))}`;

/** Is this a document's signing link (not a proposal's)? */
export const isDocToken = (raw: unknown) => /^ds_/.test(String(raw ?? ""));
export function readDocSignToken(raw: unknown): { signerId: string; expMs: number } | null {
  const m = String(raw ?? "").match(/^(ds_[A-Za-z0-9_-]{12})\.([0-9a-z]{1,12})\.([A-Za-z0-9_-]{32})$/);
  if (!m) return null;
  const expMs = parseInt(m[2], 36);
  if (!Number.isFinite(expMs) || !same(m[3], mac(`rn-dsign:${m[1]}:${expMs}`))) return null;
  return { signerId: m[1], expMs };
}
export const isDocCopyToken = (raw: unknown) => /^dc_/.test(String(raw ?? ""));
export function readDocCopyToken(raw: unknown): string | null {
  const m = String(raw ?? "").match(/^(dc_[A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{32})$/);
  return m && same(m[2], mac(`rn-dsigned:${m[1]}`)) ? m[1] : null;
}

/* ---------- status ---------- */

const allSigned = (d: StoredDocument) => d.signers.length > 0 && d.signers.every((x) => !!x.signed);
export function docStatus(d: StoredDocument, nowMs = Date.now()): DocStatus {
  if (allSigned(d)) return "signed";
  if (d.signers.some((x) => x.declined)) return "declined";
  if (d.voided) return "void";
  if (!d.sentAt) return "draft";
  if (expiredAt(d.expiresAt, nowMs)) return "expired";
  return d.signers.some((x) => x.viewedAt) ? "viewed" : "sent";
}
const live = (d: StoredDocument, nowMs: number) => ["sent", "viewed"].includes(docStatus(d, nowMs));
/** Whose turn it is: in order, the first who hasn't signed; at once, everyone who hasn't. */
export const turnOf = (d: StoredDocument): DocSigner[] => {
  const left = d.signers.filter((x) => !x.signed);
  return d.ordered ? left.slice(0, 1) : left;
};

function signerRec(x: DocSigner): DocSignerRec {
  return {
    id: x.id,
    name: x.name,
    email: x.email,
    title: x.title ?? null,
    sender: !!x.sender,
    status: x.signed ? "signed" : x.declined ? "declined" : x.viewedAt ? "viewed" : x.notifiedAt ? "sent" : "waiting",
    notifiedAt: x.notifiedAt ?? null,
    viewedAt: x.viewedAt ?? null,
    signedAt: x.signed?.at ?? null,
    declinedAt: x.declined?.at ?? null,
    declineReason: x.declined?.reason ?? null,
  };
}

export function docRec(d: StoredDocument, nowMs = Date.now(), origin?: string): DocumentRec {
  return {
    id: d.id,
    kind: "document",
    title: d.title,
    fileName: d.fileName,
    company: { id: d.companyPub, name: d.companyName },
    pages: d.pages.map(shown),
    size: d.size,
    sha256: d.sha256,
    fields: d.fields.map((f) => ({ ...f })),
    signers: d.signers.map((x) => signerRec(x)),
    ordered: d.ordered,
    status: docStatus(d, nowMs),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    sentAt: d.sentAt ?? null,
    expiresAt: d.expiresAt ?? null,
    completedAt: d.completed?.at ?? null,
    finalSha256: d.completed?.sha256 ?? null,
    copyUrl: d.completed ? docCopyLink(origin, d) : null,
    events: d.events.map((e) => ({ ...e })),
  };
}

/** The member's own documents, newest first (Proposals lists them with the proposals). */
export const docRecsOf = (s: State, memberId: string, nowMs = Date.now(), origin?: string): DocumentRec[] =>
  (s.documents ?? [])
    .filter((d) => d.memberId === memberId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((d) => docRec(d, nowMs, origin));

const ev = (d: StoredDocument, kind: DocEvent["kind"], at: string, meta: { who?: string; ip?: string; ua?: string; note?: string } = {}) =>
  d.events.push({ kind, at, ...(meta.who ? { who: meta.who } : {}), ...(meta.ip ? { ip: meta.ip.slice(0, 64) } : {}), ...(meta.ua ? { ua: meta.ua.slice(0, 300) } : {}), ...(meta.note ? { note: meta.note.slice(0, 300) } : {}) });

/* ---------- the member's side ---------- */

const mineDoc = (s: State, memberId: string, id: unknown): StoredDocument => {
  const d = (s.documents ?? []).find((x) => x.id === id && x.memberId === memberId);
  if (!d) throw new ProposalProblem("That document isn't there anymore. Open Proposals again.", 404);
  return d;
};

export async function getDocument(token: string | null, id: string, origin?: string, nowMs = Date.now()): Promise<DocumentRec> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  return docRec(mineDoc(s, memberOf(seed, s, token).id, id), nowMs, origin);
}

/** A PDF the member uploads: checked, kept on the volume, a draft with no fields yet. */
export async function uploadDocument(token: string | null, fileName: unknown, bytes: Uint8Array, origin?: string, nowMs = Date.now()): Promise<DocumentRec> {
  const [seed, s0] = await Promise.all([loadSeed(), loadState()]);
  const me0 = memberOf(seed, s0, token);
  const name = cleanLine(fileName, 160).replace(/[/\\]/g, "-") || "document.pdf";
  if (/\.(docx?|pages|odt|rtf)$/i.test(name)) throw new ProposalProblem("Upload a PDF. In Word or Google Docs: File, then Save as or Download, then PDF.");
  if (!bytes.length) throw new ProposalProblem("That file is empty.");
  if (bytes.length > DOC_MAX_BYTES) throw new ProposalProblem(`That PDF is over ${Math.round(DOC_MAX_BYTES / 1024 / 1024)} MB. Upload a smaller copy.`, 413);
  if ((s0.documents ?? []).filter((d) => d.memberId === me0.id).length >= DOC_LIMITS.documents) throw new ProposalProblem(`You have ${DOC_LIMITS.documents} documents, which is the most. Delete an old draft first.`);
  let pages: StoredDocument["pages"];
  try {
    pages = (await inspectPdf(bytes)).pages;
  } catch (e) {
    if (e instanceof PdfProblem) throw new ProposalProblem(e.message);
    throw e;
  }
  const now = new Date(nowMs).toISOString();
  const id = newId("dc_");
  await saveOriginal(id, bytes);
  try {
    return await T.mutate((s) => {
      const me = memberOf(seed, s, token);
      const d: StoredDocument = {
        id,
        memberId: me.id,
        companyId: null,
        companyPub: null,
        companyName: "",
        title: name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").slice(0, DOC_LIMITS.title) || "Document",
        fileName: name,
        size: bytes.length,
        pages,
        sha256: sha256(bytes),
        fields: [],
        signers: [],
        ordered: true,
        createdAt: now,
        updatedAt: now,
        events: [{ kind: "uploaded", at: now, note: `${pages.length} ${pages.length === 1 ? "page" : "pages"}` }],
      };
      (s.documents ??= []).push(d);
      return docRec(d, nowMs, origin);
    });
  } catch (e) {
    await removeFiles(id).catch(() => {});
    throw e;
  }
}

const num = (v: unknown, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};

/**
 * The signers as sent. A new one comes with an id of the app's own ("new_..."): Merlin gives it a
 * signer id of its own, and `ids` maps the app's id to it, so fields placed for it in the same
 * change keep their signer.
 */
function cleanSigners(raw: unknown, had: DocSigner[], me: { email: string }, ids: Map<string, string>): DocSigner[] {
  if (!Array.isArray(raw)) throw new ProposalProblem("The signers didn't come through. Refresh and try again.");
  if (raw.length > DOC_LIMITS.signers) throw new ProposalProblem(`Up to ${DOC_LIMITS.signers} signers.`);
  const seen = new Set<string>();
  return raw.map((r) => {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const info = cleanSigner(o);
    if (seen.has(info.email)) throw new ProposalProblem(`${info.email} is on the list twice.`);
    seen.add(info.email);
    const old = had.find((x) => x.id === o.id) ?? had.find((x) => x.email === info.email);
    const x: DocSigner = { id: old?.id ?? newId("ds_"), name: info.name, email: info.email, ...(info.title ? { title: info.title } : {}) };
    if (typeof o.id === "string" && o.id) ids.set(o.id.slice(0, 40), x.id);
    if (info.email === me.email.toLowerCase()) x.sender = true;
    return x;
  });
}

function cleanFields(raw: unknown, d: StoredDocument, signers: DocSigner[], ids: Map<string, string>): DocField[] {
  if (!Array.isArray(raw)) throw new ProposalProblem("The fields didn't come through. Refresh and try again.");
  if (raw.length > DOC_LIMITS.fields) throw new ProposalProblem(`Up to ${DOC_LIMITS.fields} fields.`);
  const used = new Set<string>();
  return raw.flatMap((r, i) => {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const kind = FIELD_KINDS.find((k) => k === o.kind);
    const sid = typeof o.signer === "string" ? ids.get(o.signer) ?? o.signer : "";
    const signer = signers.find((x) => x.id === sid);
    const page = Math.floor(Number(o.page));
    if (!kind || !signer || !Number.isInteger(page) || page < 0 || page >= d.pages.length) return [];
    let id = String(o.id ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || `f${i}${Date.now().toString(36)}`;
    while (used.has(id)) id += "x";
    used.add(id);
    const w = num(o.w, 0.01, 1);
    const h = num(o.h, 0.008, 1);
    const label = cleanLine(o.label, DOC_LIMITS.label);
    const prefill = kind === "text" ? cleanLine(o.prefill, DOC_LIMITS.text) : "";
    return [{ id, page, kind, signer: signer.id, x: num(o.x, 0, 1 - w), y: num(o.y, 0, 1 - h), w, h, required: o.required !== false, ...(label ? { label } : {}), ...(prefill ? { prefill } : {}) }];
  });
}

/** What a change to a draft may carry. Each part is optional. */
export interface DocPatch {
  title?: unknown;
  fields?: unknown;
  signers?: unknown;
  ordered?: unknown;
  companyId?: unknown;
  companyName?: unknown;
  message?: unknown;
}

export async function updateDocument(token: string | null, id: string, a: DocPatch, origin?: string, nowMs = Date.now()): Promise<DocumentRec> {
  const seed = await loadSeed();
  // A company on Merlin, read as the member's table shows it (its name stays hidden while it is locked).
  const pub = typeof a.companyId === "string" && a.companyId ? a.companyId : null;
  const co = pub ? await companyFor(token!, pub) : null;
  if (pub && !co) throw new ProposalProblem("That company isn't on Merlin. Type its name instead.");
  const now = new Date(nowMs).toISOString();
  return T.mutate((s) => {
    const me = memberOf(seed, s, token);
    const d = mineDoc(s, me.id, id);
    if (d.sentAt) throw new ProposalProblem("It went out for signature, so it can't change. Copy it to make a new one.");
    if (a.title !== undefined) d.title = cleanLine(a.title, DOC_LIMITS.title) || d.title;
    if (a.ordered !== undefined) d.ordered = a.ordered !== false;
    if (a.message !== undefined) d.message = cleanLine(a.message, DOC_LIMITS.message);
    const ids = new Map<string, string>();
    if (a.signers !== undefined) {
      d.signers = cleanSigners(a.signers, d.signers, me, ids);
      d.fields = d.fields.filter((f) => d.signers.some((x) => x.id === f.signer));
    }
    if (a.fields !== undefined) d.fields = cleanFields(a.fields, d, d.signers, ids);
    if (a.companyId !== undefined) {
      d.companyId = co?.internal ?? null;
      d.companyPub = co ? pub : null;
      d.companyName = co ? co.name || cleanLine(a.companyName, 120) : cleanLine(a.companyName, 120);
    } else if (a.companyName !== undefined && !d.companyId) d.companyName = cleanLine(a.companyName, 120);
    d.updatedAt = now;
    return docRec(d, nowMs, origin);
  });
}

export async function deleteDocument(token: string | null, id: string, nowMs = Date.now()): Promise<void> {
  const seed = await loadSeed();
  await T.mutate((s) => {
    const d = mineDoc(s, memberOf(seed, s, token).id, id);
    const st = docStatus(d, nowMs);
    if (st === "signed") throw new ProposalProblem("A signed document is kept as the record of what was agreed.");
    if (st === "sent" || st === "viewed") throw new ProposalProblem("It's out for signature. Void it first.");
    s.documents = (s.documents ?? []).filter((x) => x !== d);
    dropItemRecords(s, d.memberId, d.id);
  });
  await removeFiles(id).catch(() => {});
}

/** A new draft from the same PDF, with the same fields and signers, for one that went out. */
export async function copyDocument(token: string | null, id: string, origin?: string, nowMs = Date.now()): Promise<DocumentRec> {
  const [seed, s0] = await Promise.all([loadSeed(), loadState()]);
  const src = mineDoc(s0, memberOf(seed, s0, token).id, id);
  const bytes = await readOriginal(src.id);
  if (!bytes) throw new ProposalProblem("The file isn't there anymore. Upload it again.", 410);
  const nid = newId("dc_");
  await saveOriginal(nid, bytes);
  const now = new Date(nowMs).toISOString();
  return T.mutate((s) => {
    const me = memberOf(seed, s, token);
    const d = mineDoc(s, me.id, id);
    const ids = new Map(d.signers.map((x) => [x.id, newId("ds_")]));
    const copy: StoredDocument = {
      ...structuredClone(d),
      id: nid,
      title: `${d.title} (copy)`.slice(0, DOC_LIMITS.title),
      signers: d.signers.map((x) => ({ id: ids.get(x.id)!, name: x.name, email: x.email, ...(x.title ? { title: x.title } : {}), ...(x.sender ? { sender: true } : {}) })),
      fields: d.fields.map((f) => ({ ...f, signer: ids.get(f.signer)! })),
      createdAt: now,
      updatedAt: now,
      events: [{ kind: "uploaded", at: now, note: `A copy of ${d.id}` }],
    };
    delete copy.sentAt, delete copy.expiresAt, delete copy.voided, delete copy.completed;
    (s.documents ??= []).push(copy);
    return docRec(copy, nowMs, origin);
  });
}

export async function voidDocument(token: string | null, id: string, origin?: string, nowMs = Date.now()): Promise<DocumentRec> {
  const seed = await loadSeed();
  const now = new Date(nowMs).toISOString();
  return T.mutate((s) => {
    const d = mineDoc(s, memberOf(seed, s, token).id, id);
    if (!live(d, nowMs)) throw new ProposalProblem(docStatus(d, nowMs) === "signed" ? "Everyone signed it, so it can't be voided." : "It isn't out for signature.");
    d.voided = { at: now };
    ev(d, "voided", now, { note: "Voided by the sender" });
    d.updatedAt = now;
    return docRec(d, nowMs, origin);
  });
}

/** Why a draft can't go out yet, or null. */
export function notReady(d: StoredDocument): string | null {
  if (!d.signers.length) return "Add who signs first.";
  for (const x of d.signers) {
    const mineF = d.fields.filter((f) => f.signer === x.id);
    if (!mineF.some((f) => f.kind === "signature")) return `Place a Signature field for ${x.name}.`;
  }
  return null;
}

/** Why one of the member's drafts can't go out yet, or null (the connector asks before it sends). */
export async function notReadyOf(token: string | null, id: string): Promise<string | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  return notReady(mineDoc(s, memberOf(seed, s, token).id, id));
}

/** Email the link to each signer whose turn it is and who hasn't had it. Returns how many went out. */
async function notify(docId: string, origin: string | undefined, nowMs: number): Promise<number> {
  const s = await loadState();
  const d = (s.documents ?? []).find((x) => x.id === docId);
  if (!d || !live(d, nowMs)) return 0;
  const m = await memberFor(await loadSeed(), d.memberId);
  const prev = [...d.signers].reverse().find((x) => x.signed)?.name ?? null;
  const want = turnOf(d).filter((x) => !x.notifiedAt);
  const ok: string[] = [];
  const title = titleOf(s, { id: d.memberId, title: "" } as Parameters<typeof titleOf>[1]);
  for (const x of want) {
    const mail = docInviteEmail({ signer: x.name, member: m?.name ?? "Your contact", memberTitle: title, title: d.title, link: signLinkOf(origin, d, x), expiresAt: d.expiresAt ?? null, note: d.message, after: d.ordered ? prev : null, self: !!x.sender });
    if (await sendEmail(x.email, mail.subject, mail.text, mail.html, m?.email && !x.sender ? { replyTo: m.email } : {})) ok.push(x.id);
  }
  if (ok.length) {
    const at = new Date(nowMs).toISOString();
    await T.mutate((st) => {
      const dd = (st.documents ?? []).find((y) => y.id === docId);
      for (const x of dd?.signers ?? []) if (ok.includes(x.id) && !x.notifiedAt) (x.notifiedAt = at), ev(dd!, "notified", at, { who: x.email });
    });
  }
  return ok.length;
}

/** Send it: the signers' links by email, in turn. Trial and Pro. */
export async function sendDocument(token: string | null, id: string, a: { message?: unknown; linkDays?: unknown } = {}, origin?: string, nowMs = Date.now()): Promise<{ document: DocumentRec; message: string }> {
  const days = linkDaysOf(a.linkDays);
  const seed = await loadSeed();
  const s0 = await loadState();
  const me0 = memberOf(seed, s0, token);
  if (onFree(s0, me0.id, nowMs)) throw new ProposalProblem(PRO_SEND.replace("Sending for signature", "Sending documents for signature"), 403, upgradeUrl(base(origin), "proposals"));
  if (!emailEnabled()) throw new ProposalProblem(EMAIL_OFF.replace("a proposal", "a document"));
  const now = new Date(nowMs).toISOString();
  await T.mutate((s) => {
    const me = memberOf(seed, s, token);
    const d = mineDoc(s, me.id, id);
    if (d.sentAt) throw new ProposalProblem(live(d, nowMs) ? "It's out for signature already." : "It went out already. Copy it to send again.");
    const why = notReady(d);
    if (why) throw new ProposalProblem(why);
    if (a.message !== undefined) d.message = cleanLine(a.message, DOC_LIMITS.message);
    d.sentAt = now;
    d.expiresAt = expiryFor(days, nowMs);
    d.updatedAt = now;
    ev(d, "sent", now, { note: d.signers.map((x) => x.email).join(", ") });
    const to = d.signers.find((x) => !x.sender) ?? d.signers[0];
    pipelineEvent(s, me.id, d.companyId, "proposal_sent", now, { document: { to: to ? { name: to.name, ...(to.title ? { title: to.title } : {}) } : null } });
  });
  const sent = await notify(id, origin, nowMs);
  if (!sent) {
    // Nobody got it: back to a draft, so the member can try again.
    await T.mutate((s) => {
      const d = (s.documents ?? []).find((x) => x.id === id);
      if (d && !d.signers.some((x) => x.notifiedAt)) delete d.sentAt, delete d.expiresAt, ev(d, "voided", now, { note: "The email didn't go out, so it went back to a draft" });
    });
    throw new ProposalProblem("The email didn't go out. Try again in a moment.", 502);
  }
  const d = await getDocument(token, id, origin, nowMs);
  const firsts = d.signers.filter((x) => x.notifiedAt).map((x) => x.name);
  return { document: d, message: `Sent to ${firsts.join(" and ")}${d.ordered && d.signers.length > 1 ? ". The others get it in turn" : ""}. ${days ? `The links work for ${days} days.` : "The links have no end date."}` };
}

/** The member's own signing link, when they sign it too and it is their turn. */
export async function myDocLink(token: string | null, id: string, origin?: string, nowMs = Date.now()): Promise<{ link: string }> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberOf(seed, s, token);
  const d = mineDoc(s, me.id, id);
  const x = d.signers.find((y) => y.sender && y.email === me.email.toLowerCase());
  if (!x) throw new ProposalProblem("You aren't one of its signers.");
  if (!live(d, nowMs) || !turnOf(d).includes(x)) throw new ProposalProblem(x.signed ? "You signed it already." : "It isn't your turn yet.");
  return { link: signLinkOf(origin, d, x) };
}

/** The PDF for its member: the original, or the final once everyone signed. */
export async function ownerFile(token: string | null, id: string, final: boolean): Promise<{ bytes: Buffer; name: string }> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const d = mineDoc(s, memberOf(seed, s, token).id, id);
  const bytes = final ? (d.completed ? await readFinal(d.id) : null) : await readOriginal(d.id);
  if (!bytes) throw new ProposalProblem(final ? "The signed file isn't ready yet." : "The file isn't there anymore.", 404);
  return { bytes, name: final ? signedName(d) : d.fileName };
}
const signedName = (d: StoredDocument) => `${d.fileName.replace(/\.pdf$/i, "")} (signed).pdf`;

/* ---------- the signer's side ---------- */

type Found = { d: StoredDocument; x: DocSigner };
const GONE = "This link doesn't work. Ask the sender for a new one.";
function resolve(s: State, raw: unknown): Found {
  const t = readDocSignToken(raw);
  if (!t) throw new ProposalProblem(GONE, 404);
  for (const d of s.documents ?? []) {
    const x = d.signers.find((y) => y.id === t.signerId);
    if (x) {
      if (!d.sentAt || d.expiresAt === undefined || expMsOf(d.expiresAt) !== t.expMs) throw new ProposalProblem(GONE, 404);
      return { d, x };
    }
  }
  throw new ProposalProblem(GONE, 404);
}

function signerState(f: Found, nowMs: number): DocSignerView["status"] {
  const { d, x } = f;
  if (allSigned(d)) return "done";
  if (x.signed) return "signed";
  if (d.signers.some((y) => y.declined)) return "declined";
  if (d.voided) return "void";
  if (expiredAt(d.expiresAt, nowMs)) return "expired";
  return turnOf(d).includes(x) ? "open" : "waiting";
}

function viewOf(f: Found, from: { name: string; title: string }, nowMs: number, origin?: string): DocSignerView {
  const { d, x } = f;
  return {
    kind: "document",
    status: signerState(f, nowMs),
    title: d.title,
    from,
    company: d.companyName,
    me: { name: x.name, title: x.title ?? "" },
    emailHint: emailHint(x.email),
    pages: d.pages.map(shown),
    fields: d.fields.filter((fl) => fl.signer === x.id).map((fl) => ({ ...fl })),
    others: d.signers.filter((y) => y !== x).map((y) => ({ name: y.name, status: signerRec(y).status })),
    sha256: d.sha256,
    codeVerified: !!x.codeVerifiedAt,
    codeSent: !!x.code && nowMs - Date.parse(x.code.at) < CODE_TTL_MS,
    consent: consentText(from.name || "the sender", "document"),
    consentVersion: CONSENT_VERSION,
    signedAt: x.signed?.at ?? null,
    expiresAt: d.expiresAt ?? null,
    copyUrl: d.completed ? docCopyLink(origin, d) : null,
  };
}

async function fromOf(s: State, d: StoredDocument) {
  const m = await memberFor(await loadSeed(), d.memberId);
  return { name: m?.name ?? "", title: titleOf(s, { id: d.memberId, title: "" } as Parameters<typeof titleOf>[1]) };
}

const notOpen = (st: DocSignerView["status"]) =>
  st === "signed" || st === "done"
    ? "You signed it already."
    : st === "waiting"
      ? "It isn't your turn to sign yet. We'll email you when it is."
      : st === "declined"
        ? "This document was declined, so it can't be signed."
        : st === "void"
          ? "The sender withdrew this document, so it can't be signed."
          : "This link has expired. Ask the sender for a new one.";

/** The signing page's view. The first open by a signer whose turn it is goes on the audit trail. */
export async function docSignerView(token: unknown, who: Client, origin?: string, nowMs = Date.now()): Promise<DocSignerView> {
  const s = await loadState();
  const f0 = resolve(s, token);
  const from = await fromOf(s, f0.d);
  const st0 = signerState(f0, nowMs);
  if ((st0 !== "open" || f0.x.viewedAt) && st0 !== "expired") return viewOf(f0, from, nowMs, origin);
  const now = new Date(nowMs).toISOString();
  return T.mutate((st) => {
    const f = resolve(st, token);
    const k = signerState(f, nowMs);
    if (k === "open" && !f.x.viewedAt) (f.x.viewedAt = now), ev(f.d, "viewed", now, { ...who, who: f.x.email });
    if (k === "expired" && !f.d.events.some((e) => e.kind === "expired_open" && e.who === f.x.email)) ev(f.d, "expired_open", now, { ...who, who: f.x.email });
    return viewOf(f, from, nowMs, origin);
  });
}

/** The original PDF, for the signing page (the signer's link is the key). */
export async function signerFile(token: unknown, nowMs = Date.now()): Promise<Buffer> {
  const s = await loadState();
  const f = resolve(s, token);
  const st = signerState(f, nowMs);
  if (st === "void" || st === "expired" || st === "declined") throw new ProposalProblem(notOpen(st), 410);
  const b = await readOriginal(f.d.id);
  if (!b) throw new ProposalProblem("The file isn't there anymore. Ask the sender for a new link.", 410);
  return b;
}

export async function docRequestCode(token: unknown, who: Client, nowMs = Date.now()): Promise<{ sent: true; emailHint: string }> {
  if (!emailEnabled()) throw new ProposalProblem("Email isn't working on our side right now. Try again later.", 503);
  const now = new Date(nowMs).toISOString();
  const out = await T.mutate((s) => {
    const f = resolve(s, token);
    const st = signerState(f, nowMs);
    if (st !== "open") throw new ProposalProblem(notOpen(st), 409);
    const recent = (f.x.codesSent ?? []).filter((t) => nowMs - Date.parse(t) < 3_600_000);
    if (recent.length >= CODES_PER_HOUR) throw new ProposalProblem(`That's ${CODES_PER_HOUR} codes in an hour, which is the limit. Use the newest one, or try again in an hour.`, 429);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    f.x.code = { hash: mac(`rn-dcode:${f.x.id}:${code}`), at: now, tries: 0 };
    f.x.codesSent = [...recent, now];
    ev(f.d, "code_sent", now, { ...who, who: f.x.email, note: emailHint(f.x.email) });
    return { code, email: f.x.email, memberId: f.d.memberId, title: f.d.title };
  });
  const m = await memberFor(await loadSeed(), out.memberId);
  const mail = docCodeEmail({ member: m?.name ?? "the sender", title: out.title, code: out.code });
  if (!(await sendEmail(out.email, mail.subject, mail.text, mail.html))) throw new ProposalProblem("The code didn't go out. Try again in a moment.", 502);
  return { sent: true, emailHint: emailHint(out.email) };
}

export async function docVerifyCode(token: unknown, raw: unknown, who: Client, origin?: string, nowMs = Date.now()): Promise<DocSignerView> {
  const code = String(raw ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) throw new ProposalProblem("Type the 6 digits from the email.");
  const now = new Date(nowMs).toISOString();
  const s0 = await loadState();
  const from = await fromOf(s0, resolve(s0, token).d);
  const r = await T.mutate((s) => {
    const f = resolve(s, token);
    const st = signerState(f, nowMs);
    if (st !== "open") throw new ProposalProblem(notOpen(st), 409);
    const c = f.x.code;
    if (!c || nowMs - Date.parse(c.at) > CODE_TTL_MS) return { error: "That code has expired. Ask for a new one." };
    if (c.tries >= CODE_TRIES) return { error: "That's too many wrong tries. Ask for a new code." };
    if (!same(c.hash, mac(`rn-dcode:${f.x.id}:${code}`))) {
      c.tries++;
      ev(f.d, "code_failed", now, { ...who, who: f.x.email });
      return { error: c.tries >= CODE_TRIES ? "That code didn't match, and that was the last try. Ask for a new code." : "That code didn't match. Check the newest email and try again." };
    }
    delete f.x.code;
    f.x.codeVerifiedAt = now;
    ev(f.d, "code_verified", now, { ...who, who: f.x.email });
    return { view: viewOf(f, from, nowMs, origin) };
  });
  if ("error" in r) throw new ProposalProblem(r.error!, 401);
  return r.view;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const NO_DRAWING = "The drawing didn't come through. Draw it again, or type your name instead.";
/** A drawn signature as sent by the page: a PNG data URL, small, that decodes as a real image (a broken or fake one is refused, not stamped as a typed name). */
async function pngOf(raw: unknown): Promise<Buffer> {
  const m = String(raw ?? "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  const b = m ? Buffer.from(m[1], "base64") : Buffer.alloc(0);
  if (!b.length || b.length > SIG_MAX_BYTES || !b.subarray(0, 8).equals(PNG)) throw new ProposalProblem(NO_DRAWING);
  if (!(await checkPng(b))) throw new ProposalProblem(NO_DRAWING);
  return b;
}

export interface DocSignArgs {
  name?: unknown;
  method?: unknown;
  png?: unknown;
  values?: unknown;
  consent?: unknown;
  hash?: unknown;
}

/**
 * The sender's saved signature (lib/proposals/memberSig.ts), when the signer is the member who sent
 * it and is signed in to Merlin in this browser (`me`, their sign-in cookie): one click to sign.
 */
async function savedFor(s: State, f: Found, me: string | null | undefined) {
  if (!f.x.sender || !me) return null;
  const m = memberByToken(await loadSeed(), me, s);
  if (!m || m.id !== f.d.memberId) return null;
  const { savedSignatureOf } = await import("../proposals/memberSig");
  return savedSignatureOf(s, m.id);
}
/** The saved signature for the signing page, as it shows it. */
export async function docSavedSignature(token: unknown, me: string | null | undefined): Promise<DocSignerView["saved"]> {
  const s = await loadState();
  const sv = await savedFor(s, resolve(s, token), me).catch(() => null);
  return sv ? { kind: sv.sig.kind, typed: sv.sig.typed ?? null, img: sv.png ? `data:image/png;base64,${sv.png.toString("base64")}` : null } : null;
}

/** Sign: the signer's own fields filled, the signature adopted. The last signature finishes the document. `me`: the sign-in cookie, for the sender's saved signature (method "saved"). */
export async function docSign(token: unknown, a: DocSignArgs, who: Client, origin?: string, nowMs = Date.now(), me?: string | null): Promise<DocSignerView> {
  const name = cleanLine(a.name, 100);
  if (!NAME.test(name)) throw new ProposalProblem("Type your full name, first and last.");
  if (a.consent !== true) throw new ProposalProblem("Tick the box to agree to sign electronically.");
  const s0 = await loadState();
  const f0 = resolve(s0, token);
  const saved = a.method === "saved" ? await savedFor(s0, f0, me) : null;
  if (a.method === "saved" && !saved) throw new ProposalProblem("Your saved signature isn't here. Sign in to Merlin in this browser, or draw or type it.");
  const method = saved ? saved.sig.kind : a.method === "drawn" ? "drawn" : "typed";
  const from = await fromOf(s0, f0.d);
  const png = saved ? saved.png : method === "drawn" ? await pngOf(a.png) : null;
  const raw = (a.values && typeof a.values === "object" && !Array.isArray(a.values) ? a.values : {}) as Record<string, unknown>;
  const now = new Date(nowMs).toISOString();
  // The drawing is written aside first, and moved into place only by the request that records the signature: one that loses the race never overwrites the winner's.
  const staged = png && signerState(f0, nowMs) === "open" && f0.x.codeVerifiedAt ? await stageSignature(f0.d.id, f0.x.id, png) : null;
  const out = await T.mutate((s) => {
    const f = resolve(s, token);
    const st = signerState(f, nowMs);
    if (st !== "open") throw new ProposalProblem(notOpen(st), 409);
    if (!f.x.codeVerifiedAt) throw new ProposalProblem("Confirm your email with the code first.", 401);
    if (typeof a.hash !== "string" || !same(a.hash, f.d.sha256)) throw new ProposalProblem("This page is out of date. Reload it to read the document again before you sign.", 409);
    const values: Record<string, string> = {};
    for (const fl of f.d.fields.filter((x) => x.signer === f.x.id)) {
      const v = raw[fl.id];
      if (fl.kind === "text") {
        const t = cleanLine(v, DOC_LIMITS.text);
        if (fl.required && !t) throw new ProposalProblem(`Fill in ${fl.label ? `"${fl.label}"` : "every text field"} first.`);
        if (t) values[fl.id] = t;
      } else if (fl.kind === "checkbox") {
        const on = v === true || v === "yes";
        if (fl.required && !on) throw new ProposalProblem(`Tick ${fl.label ? `"${fl.label}"` : "every required box"} first.`);
        values[fl.id] = on ? "yes" : "";
      } else if (fl.kind === "initials") {
        const t = cleanLine(v, 6).replace(/[^\p{L}.]/gu, "").toUpperCase();
        if (t) values[fl.id] = t;
      }
    }
    f.x.values = values;
    f.x.signed = { at: now, ip: who.ip.slice(0, 64), ua: who.ua.slice(0, 300), name, method, consent: consentText(from.name || "the sender", "document"), consentVersion: CONSENT_VERSION, hash: f.d.sha256 };
    ev(f.d, "signed", now, { ...who, who: f.x.email, note: saved ? `applied their saved signature (${method}) as "${name}"` : method === "drawn" ? `drew their signature as "${name}"` : `typed name "${name}"` });
    f.d.updatedAt = now;
    if (method === "drawn" && !staged) throw new ProposalProblem(NO_DRAWING);
    const done = allSigned(f.d);
    if (done) pipelineEvent(s, f.d.memberId, f.d.companyId, "signed", now, { document: { to: null } });
    return { done, docId: f.d.id, signerId: f.x.id, view: viewOf(f, from, nowMs, origin) };
  }).catch(async (e) => {
    await dropSignature(staged);
    throw e;
  });
  if (staged) await commitSignature(out.docId, out.signerId, staged);
  if (out.done) await finish(out.docId, origin);
  else await notify(out.docId, origin, nowMs);
  return out.done ? docSignerView(token, who, origin, nowMs) : out.view;
}

export async function docDecline(token: unknown, a: { reason?: unknown }, who: Client, origin?: string, nowMs = Date.now()): Promise<DocSignerView> {
  const reason = cleanLine(a.reason, DOC_LIMITS.reason);
  const now = new Date(nowMs).toISOString();
  const s0 = await loadState();
  const from = await fromOf(s0, resolve(s0, token).d);
  const out = await T.mutate((s) => {
    const f = resolve(s, token);
    const st = signerState(f, nowMs);
    if (st !== "open") throw new ProposalProblem(notOpen(st), 409);
    // Declining speaks for the signer named, so it needs the email code first, as signing does.
    if (!f.x.codeVerifiedAt) throw new ProposalProblem("Confirm your email with the code first.", 401);
    f.x.declined = { at: now, reason, ip: who.ip.slice(0, 64), ua: who.ua.slice(0, 300) };
    ev(f.d, "declined", now, { ...who, who: f.x.email, ...(reason ? { note: reason } : {}) });
    f.d.updatedAt = now;
    pipelineEvent(s, f.d.memberId, f.d.companyId, "declined", now, { document: { to: null } });
    return { memberId: f.d.memberId, signer: f.x.name, title: f.d.title, view: viewOf(f, from, nowMs, origin) };
  });
  const m = await memberFor(await loadSeed(), out.memberId);
  if (m?.email) {
    const mail = docDeclinedEmail({ member: m.name, signer: out.signer, title: out.title, reason, app: `${base(origin)}/?p=proposals` });
    await sendEmail(m.email, mail.subject, mail.text, mail.html);
  }
  return out.view;
}

/* ---------- finishing: the final PDF and everyone's copy ---------- */

const finishing = new Map<string, Promise<void>>();

/** Stamp the values, add the audit trail, keep the final file and email it to everyone. Once a document; safe to call again. */
export function finish(docId: string, origin?: string): Promise<void> {
  const running = finishing.get(docId);
  if (running) return running;
  const p = (async () => {
    const s = await loadState();
    const d = (s.documents ?? []).find((x) => x.id === docId);
    if (!d || d.completed || !allSigned(d)) return;
    const original = await readOriginal(d.id);
    if (!original) return console.error("document finish: the original is missing", d.id);
    const sigs = new Map<string, Uint8Array>();
    for (const x of d.signers) if (x.signed?.method === "drawn") {
      const b = await readSignature(d.id, x.id);
      if (b) sigs.set(x.id, b);
    }
    const m = await memberFor(await loadSeed(), d.memberId);
    const sender = { name: m?.name ?? "", email: m?.email ?? "", title: titleOf(s, { id: d.memberId, title: "" } as Parameters<typeof titleOf>[1]) };
    const consentVersion = d.signers.map((x) => x.signed!.consentVersion).sort().pop() ?? CONSENT_VERSION;
    const fin = await buildFinal(original, { doc: d, signatures: sigs, sender, consentText: consentText(sender.name || "the sender", "document"), consentVersion, seal: { checkUrl: `${base(origin)}/check` } });
    await saveFinal(d.id, fin.bytes);
    const at = new Date().toISOString();
    // The seal's record (lib/seal.ts): the file's SHA-256 and the printed digest, signed with Merlin's key.
    const seal = fin.digest ? (await import("../seal")).sealRec({ digest: fin.digest, sha256: fin.sha256, bytes: fin.bytes }, at) : undefined;
    const ok = await T.mutate((st) => {
      const dd = (st.documents ?? []).find((x) => x.id === docId);
      if (!dd || dd.completed) return false;
      dd.completed = { at, sha256: fin.sha256, signedPagesSha256: fin.signedPagesSha256, size: fin.bytes.length, ...(seal ? { seal } : {}) };
      ev(dd, "completed", at, { note: `final file SHA-256 ${fin.sha256}` });
      dd.updatedAt = at;
      return true;
    });
    if (!ok) return;
    const copy = docCopyLink(origin, d);
    const download = docDownloadLink(origin, d);
    const attach = fin.bytes.length <= MAX_ATTACHMENT_BYTES;
    const names = d.signers.map((x) => x.name);
    const to = [...d.signers.filter((x) => !x.sender).map((x) => ({ email: x.email, name: x.name })), ...(m?.email ? [{ email: m.email, name: m.name }] : [])];
    const sent: string[] = [];
    for (const r of to) {
      const mail = docDoneEmail({ name: r.name, title: d.title, signers: names, completedAt: at, copy, download, sha256: fin.sha256, attached: attach });
      if (await sendEmail(r.email, mail.subject, mail.text, mail.html, attach ? { attachments: [{ filename: signedName(d), content: fin.bytes }] } : {})) sent.push(r.email);
    }
    if (sent.length)
      await T.mutate((st) => {
        const dd = (st.documents ?? []).find((x) => x.id === docId);
        if (dd) ev(dd, "copy_sent", new Date().toISOString(), { note: `to ${sent.join(", ")}${attach ? ", with the PDF attached" : ""}` });
      });
  })()
    .catch((e) => console.error("document finish failed", docId, (e as Error)?.message))
    .finally(() => finishing.delete(docId));
  finishing.set(docId, p);
  return p;
}

/** The finished document's page. Null: no such link, or not finished. */
export async function docCopy(raw: unknown, origin?: string): Promise<DocCopy | null> {
  const id = readDocCopyToken(raw);
  if (!id) return null;
  const s = await loadState();
  const d = (s.documents ?? []).find((x) => x.id === id);
  if (!d) return null;
  if (!d.completed && allSigned(d)) await finish(d.id, origin);
  const dd = (await loadState()).documents?.find((x) => x.id === id);
  if (!dd?.completed) return null;
  const from = await fromOf(s, dd);
  return {
    id: dd.id,
    title: dd.title,
    fileName: dd.fileName,
    from,
    signers: dd.signers.map((x) => ({ name: x.signed!.name, email: x.email, title: x.title ?? null, signedAt: x.signed!.at, method: x.signed!.method })),
    sha256: dd.sha256,
    finalSha256: dd.completed.sha256,
    signedPagesSha256: dd.completed.signedPagesSha256,
    completedAt: dd.completed.at,
    download: docDownloadLink(origin, dd),
    events: dd.events.map((e) => ({ ...e })),
    sealed: dd.completed.seal ? { at: dd.completed.seal.at, check: `${base(origin)}/check` } : null,
  };
}

/** The final PDF from the finished page's link. */
export async function copyFile(raw: unknown): Promise<{ bytes: Buffer; name: string } | null> {
  const id = readDocCopyToken(raw);
  const d = id ? (await loadState()).documents?.find((x) => x.id === id) : undefined;
  if (!d?.completed) return null;
  const bytes = await readFinal(d.id);
  return bytes ? { bytes, name: signedName(d) } : null;
}

