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

/** GET /api/proposals: the member's own proposals, and what their plan allows. */
export interface ProposalsView {
  proposals: ProposalRec[];
  /** Sending for signature: Trial and Pro (and every plan while billing is off). */
  canSend: boolean;
  /** Templates the member can start from: every one, or on Free only FREE_TEMPLATE. */
  templatesOpen: string[];
  /** Email is set up, so a proposal can go out. */
  email: boolean;
  /** The member's own name and title, for "Prepared by". */
  me: { name: string; title: string; function: string | null };
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
 * Written to the ESIGN Act and UETA disclosures (consent to electronic records, the right to paper,
 * withdrawing consent, what is needed to keep a copy). Have it reviewed before launch.
 */
export const CONSENT_VERSION = "2026-11-21";
export const consentText = (provider: string) =>
  `I agree to use electronic records and an electronic signature for this proposal. My typed name and clicking Sign is my signature, with the same effect as signing on paper. I can download or print the signed copy, and I get it by email. I can ask ${provider} for a paper copy at no cost, and I can withdraw this consent before I sign by closing this page: then I sign on paper instead. To use this, I need a web browser and access to my email address.`;
