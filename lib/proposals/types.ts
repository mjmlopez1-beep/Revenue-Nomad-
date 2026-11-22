/**
 * Proposals: what the state keeps (StoredProposal, State.proposals) and what leaves the server
 * (ProposalRec for the member who wrote it, SignerView for the client who signs it). No imports
 * from lib/table.ts, so the app, the connector and the table can all use this file.
 *
 * A proposal is private to the member who wrote it: never in another member's view, an admin's
 * panel or the export. What the client sees is the frozen copy of one version (FrozenDoc), and
 * nothing else: no notes, no snippets from a call, no budget signals, no ids.
 */

/** One block of the proposal, in the member's order. `blockId` is a library block's id, or "custom". */
export interface ProposalBlock {
  /** This block's own id in the proposal (a block can be added twice). */
  id: string;
  blockId: string;
  title: string;
  /** Plain text. A line starting "- " is a bullet. {{key}} is filled from the proposal's fields. */
  body: string;
}

/**
 * A line the member accepted from a call (pasted or dropped transcript, or what their own Claude
 * pulled out of one). Only these are kept: the transcript itself never reaches the server from
 * the app, and nothing else from it is stored. `key` is the discovery field it answers.
 */
export interface DiscoveryNote {
  key: string;
  text: string;
  at: string;
}

export interface SignerInfo {
  name: string;
  email: string;
  title?: string;
}

/** One event on a send's audit trail. */
export interface AuditEvent {
  kind: "sent" | "viewed" | "code_sent" | "code_failed" | "code_verified" | "signed" | "declined" | "voided" | "expired_open" | "copy_sent";
  at: string;
  ip?: string;
  ua?: string;
  /** A short note: who voided it, why, which address an email went to. */
  note?: string;
}

/** The exact document the client is shown and signs. Its SHA-256 (hashDoc) goes on the audit trail. */
export interface FrozenDoc {
  title: string;
  version: number;
  company: string;
  from: { name: string; title: string };
  to: { name: string; title: string; email: string };
  blocks: { title: string; text: string }[];
  preparedAt: string;
}

/** One send of one version to one signer. The link is signed and expires (lib/proposals/links.ts). */
export interface StoredSend {
  id: string;
  version: number;
  signer: SignerInfo;
  doc: FrozenDoc;
  /** SHA-256 of the canonical JSON of `doc`, hex. */
  hash: string;
  sentAt: string;
  expiresAt: string;
  viewedAt?: string;
  /** The email code: an HMAC of the 6 digits, when it was sent, wrong tries since. */
  code?: { hash: string; at: string; tries: number };
  codesSent?: string[];
  codeVerifiedAt?: string;
  signed?: { name: string; at: string; ip: string; ua: string; consent: string; consentVersion: string; hash: string; email: string };
  declined?: { at: string; reason: string; ip: string; ua: string };
  voided?: { at: string; why: "member" | "changed" };
  events: AuditEvent[];
}

export type ProposalStatus = "draft" | "sent" | "viewed" | "signed" | "declined" | "void" | "expired";

export interface StoredProposal {
  id: string;
  memberId: string;
  /** The company on Merlin (internal id), when it is one. */
  companyId: string | null;
  /** Its public id, for the app's links. */
  companyPub: string | null;
  /** The company's name as the member knows it: from the record when they can see it, else what they typed. */
  companyName: string;
  templateId: string | null;
  title: string;
  blocks: ProposalBlock[];
  /** Values for {{key}}: what the member typed or accepted, and the facts filled at creation. */
  fields: Record<string, string>;
  /** Where each filled field came from (record, profile, rate, discovery, manual, claude). */
  sources: Record<string, string>;
  /** Accepted lines from a call. Private: never in the document unless the member put one in a field. */
  notes: DiscoveryNote[];
  /** Was the person who signs on the call: true, false, or not known. */
  signerOnCall: boolean | null;
  signer: SignerInfo | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  sends: StoredSend[];
}

/* ---------- what the member's app gets ---------- */

export interface AuditRow {
  kind: AuditEvent["kind"];
  at: string;
  ip?: string;
  ua?: string;
  note?: string;
}

export interface ProposalSendRec {
  id: string;
  version: number;
  signer: SignerInfo;
  status: Exclude<ProposalStatus, "draft">;
  sentAt: string;
  expiresAt: string;
  viewedAt: string | null;
  codeVerifiedAt: string | null;
  signedAt: string | null;
  signedName: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  voidedAt: string | null;
  hash: string;
  /** The signed copy with its audit trail (signed only). */
  copyUrl: string | null;
  events: AuditRow[];
}

export interface ProposalRec {
  id: string;
  title: string;
  company: { id: string | null; name: string };
  templateId: string | null;
  blocks: ProposalBlock[];
  fields: Record<string, string>;
  sources: Record<string, string>;
  notes: DiscoveryNote[];
  signerOnCall: boolean | null;
  signer: SignerInfo | null;
  version: number;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  /** The current send, if any; then every earlier one, newest first. */
  send: ProposalSendRec | null;
  history: ProposalSendRec[];
}

/**
 * One of the member's own templates: a past proposal or SOW they uploaded (.docx, .pdf, .md,
 * .txt), read into sections (lib/proposals/templateParse.ts). Private to them, like a proposal.
 * The file itself is not kept: only its sections' titles and text.
 */
export interface MyTemplate {
  /** "mt_" and 12 characters. */
  id: string;
  title: string;
  fileName: string;
  kind: "docx" | "pdf" | "md" | "txt";
  blocks: { blockId: string; title: string; body: string }[];
  createdAt: string;
}

/** A template as the app lists it: ours (the library) or theirs. */
export interface TemplateChoice {
  id: string;
  title: string;
  /** Who it suits (ours), or the file it came from (theirs). */
  about: string;
  mine: boolean;
  open: boolean;
  sections: number;
}

/** GET /api/proposals: the member's own proposals, and what their plan allows. */
export interface ProposalsView {
  proposals: ProposalRec[];
  /** Documents they uploaded to be signed (lib/documents), in the same list. */
  documents: import("../documents/types").DocumentRec[];
  /** Every template they can start from: theirs first, then the library's. */
  templates: TemplateChoice[];
  /**
   * Drafting with Claude on the server: "on" (RN_AI_DRAFTS=1 with a key and a model, and their
   * plan has it), "off" (not set up on this server), "plan" (set up, not on their plan).
   */
  ai: "on" | "off" | "plan";
  /** They agreed once that a transcript may go to Anthropic's API to write a draft. */
  aiAgreed: boolean;
  /**
   * Their AI usage is all used (lib/proposals/aiUsage.ts): what the draft explains, the pack's
   * button and where it goes. Never a number of dollars or tokens. Left out while some is left.
   */
  aiUsedUp?: { words: string; pack: string; button: string };
  /** Sending for signature: Pro + Close and the trial (canClose in lib/billing/rules.ts; every plan while billing is off). */
  canSend: boolean;
  /** Templates the member can start from: every one, or on Free only FREE_TEMPLATE. */
  templatesOpen: string[];
  /** Email is set up, so a proposal can go out. */
  email: boolean;
  /** The member's own name and title, for "Prepared by". */
  me: { name: string; title: string; function: string | null; email: string };
}

/* ---------- what the client who signs gets ---------- */

export interface SignerView {
  status: "open" | "signed" | "declined" | "void" | "changed" | "expired";
  doc: FrozenDoc;
  hash: string;
  /** The signer's email, partly hidden ("da***@acme.com"), for "we sent a code to". */
  emailHint: string;
  codeVerified: boolean;
  /** A code went out in the last 15 minutes. */
  codeSent: boolean;
  consent: string;
  consentVersion: string;
  signedAt: string | null;
  signedName: string | null;
  declinedAt: string | null;
  expiresAt: string;
  copyUrl: string | null;
}

/** The signed copy's page: the document, the signature and the audit trail. */
export interface SignedCopy {
  doc: FrozenDoc;
  hash: string;
  /** The hash of the document as it reads now, so the page shows they match. */
  hashNow: string;
  signed: NonNullable<StoredSend["signed"]>;
  events: AuditRow[];
  sentAt: string;
  sendId: string;
}

/**
 * The consent shown above the signature, kept with each signature word for word, with its version.
 * Modelled on what the established e-signature services show signers (Dropbox Sign's eSign
 * Disclosure: a separate box the signer ticks, recorded in the audit trail, covering electronic
 * delivery and the right to withdraw and its consequences; Contractbook: whoever signs for a company
 * confirms they are authorised to) and on the ESIGN Act's section 101(c) consumer disclosures: consent
 * to electronic records, its scope, the right to a paper copy at no cost, how to withdraw and what
 * withdrawing does, keeping contact details current, what is needed to open and keep the records,
 * and consent given in a way that shows the signer can open them. Our own words. Have it reviewed
 * before launch; bump CONSENT_VERSION whenever the words change.
 */
export const CONSENT_VERSION = "2026-11-23";
export const consentText = (provider: string, what: "proposal" | "document" = "proposal") =>
  [
    `I agree to use electronic records and an electronic signature for this ${what} and the records about it: the signed copy, its audit trail and any notice about it.`,
    `Typing my full name, or drawing my signature, and clicking Sign is my signature. It is legally binding, with the same effect as signing by hand. If I sign for a company or another person, I confirm I am authorised to sign for them.`,
    `I can ask ${provider} for a paper copy at any time, at no cost. I can withdraw this consent before I sign by not signing and telling ${provider}; we then sign another way. Withdrawing does not undo anything already signed.`,
    `To open, sign and keep these records I need a device with a current web browser, access to my email, and a way to save or print a web page. Opening this page shows I can. If my email address changes, I tell ${provider}.`,
    `A record of my signing (the time, my IP address and device, the email code I confirmed, and a fingerprint of this exact document) is kept with the signed copy and shared with both parties.`,
  ].join(" ");

/** What the member agrees to before sending (as Contractbook asks of its customers): the document suits e-signature, and the law where they and their client are is theirs to follow. */
export const SENDER_DUTY =
  "You confirm this proposal can be signed electronically and that sending it this way follows the rules that apply to you and your client. Merlin records the signing; it doesn't give legal advice.";
