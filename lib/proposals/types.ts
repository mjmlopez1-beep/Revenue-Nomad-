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

/* ---------- the member's own signature (Close) ---------- */

/**
 * A member's saved signature (lib/proposals/memberSig.ts), set once and replaced at will: typed (the
 * words, drawn in a script face) or drawn (a PNG on the data volume, never in the state). Private to
 * them; deleted with their account. `consent` is what they agreed to when they saved it.
 */
export interface SavedSignature {
  kind: "typed" | "drawn";
  /** The words, for a typed one. */
  typed?: string;
  /** SHA-256 of the PNG, for a drawn one. */
  sha256?: string;
  at: string;
  consentVersion: string;
}
/** The member's signature as their app and the pages show it: a drawn one as a data URL. */
export interface SignatureView {
  kind: "typed" | "drawn";
  typed: string | null;
  img: string | null;
  at: string;
  name: string;
  title: string;
}
/**
 * Per proposal, the member's own signature: applied when they send ("now"), after the client
 * signs ("after", a countersignature), or none (prepared and sent by them, as before).
 */
export type MemberSignMode = "now" | "after" | "none";
export const MEMBER_SIGN_SAY: Record<MemberSignMode, string> = { now: "Add my signature now", after: "I'll countersign after they sign", none: "No signature from me" };

/** How long a signing link works, picked per send: days, or 0 for no end date. 30 unless the member picks another. */
export const LINK_DAYS = [14, 30, 60, 90, 0] as const;
export type LinkDays = (typeof LINK_DAYS)[number];
export const LINK_DAYS_SAY: Record<LinkDays, string> = { 14: "14 days", 30: "30 days", 60: "60 days", 90: "90 days", 0: "No end date" };
/** What the member agrees to when they save a signature or countersign. Bump MEMBER_CONSENT_VERSION when the words change. */
export const MEMBER_CONSENT_VERSION = "2026-11-22";
export const MEMBER_CONSENT =
  "I agree to sign electronically. Applying my saved signature to a proposal I send or countersign, or drawing or typing it there, is my signature, legally binding with the same effect as signing by hand, for me and for any business I sign for. Merlin records when and how it was applied, with a fingerprint of the exact document.";
/** The member's signature on one send: applied at send, or a countersignature after the client's. */
export interface MemberSigned {
  name: string;
  title: string;
  at: string;
  /** How: their saved signature applied when they sent it, or at countersigning, or drawn or typed then. */
  how: "saved_at_send" | "saved" | "drawn" | "typed";
  kind: "typed" | "drawn";
  typed?: string;
  /** SHA-256 of the drawing kept with the send (lib/proposals/files.ts). */
  pngSha256?: string;
  ip: string;
  ua: string;
  consent: string;
  consentVersion: string;
  /** The document it signed: the send's hash, as the client's signature keeps it. */
  hash: string;
}

/** One event on a send's audit trail. */
export interface AuditEvent {
  kind: "sent" | "viewed" | "code_sent" | "code_failed" | "code_verified" | "signed" | "declined" | "voided" | "expired_open" | "copy_sent" | "member_signed" | "countersigned" | "question" | "passed";
  at: string;
  ip?: string;
  ua?: string;
  /** A short note: who voided it, why, which address an email went to. */
  note?: string;
}

/* ---------- pricing the client picks from (Close) ---------- */

/** How an option or add-on is billed: every month, or once. */
export type Billing = "month" | "once";
export const BILLING_SAY: Record<Billing, string> = { month: "a month", once: "once" };

/** One way to work together, with its price. A proposal has 1, 2 or 3 (lib/proposals/pricing.ts). */
export interface PriceOption {
  /** "o" and a few characters, kept across edits so a choice names it. */
  id: string;
  name: string;
  /** Whole dollars. */
  price: number;
  billing: Billing;
  /** A short line under the price ("Months 1 to 3, then $11,000 a month"). */
  note?: string;
  /** One line on what it is. */
  about?: string;
  /** What's included, one line each: the comparison table's rows. */
  included: string[];
  recommended?: boolean;
}
/** Something the client can add to any option. */
export interface PriceAddOn {
  id: string;
  name: string;
  price: number;
  billing: Billing;
  about?: string;
}
export interface Pricing {
  options: PriceOption[];
  addOns: PriceAddOn[];
}
/** What the client picked: one option (by id) and any add-ons. */
export interface Choice {
  optionId: string;
  addOnIds: string[];
}
/** A choice in words and numbers, as signed: what the signed record, the emails and the PDF say. */
export interface ChoiceRec {
  optionId: string;
  option: string;
  price: number;
  billing: Billing;
  addOns: { id: string; name: string; price: number; billing: Billing }[];
  /** Dollars a month and dollars once, all in. */
  monthly: number;
  once: number;
  /** "$15,000 a month, plus $6,000 once". */
  total: string;
  /** "Assessment + Fractional CRO ($15,000 a month) with Sales hiring support". */
  summary: string;
}

/** The exact document the client is shown and signs. Its SHA-256 (hashDoc) goes on the audit trail. */
export interface FrozenDoc {
  title: string;
  version: number;
  company: string;
  from: { name: string; title: string };
  to: { name: string; title: string; email: string };
  /** `kind` is the library block's id ("the_math", "terms", "custom"): where the client's page places it. Sends from before it have none. */
  blocks: { title: string; text: string; kind?: string }[];
  /** The options and add-ons the client picks from (Close): absent for a single-price proposal. */
  pricing?: Pricing;
  preparedAt: string;
}

/**
 * The seal on a final PDF (lib/seal.ts): the SHA-256 of the file as delivered, the SHA-256 printed
 * on its audit page (the file with those 64 characters read as zeros), and Merlin's Ed25519
 * signature over both, so /check can tell anyone whether a copy is the one sealed.
 */
export interface SealRec {
  /** "sl_" and 12 characters. */
  id: string;
  /** SHA-256 of the whole file, hex. */
  sha256: string;
  /** SHA-256 printed on the audit page, hex. */
  digest: string;
  size: number;
  at: string;
  /** The first 16 hex characters of the SHA-256 of the public key. */
  keyId: string;
  /** Ed25519 over sealMessage(), base64url. */
  sig: string;
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
  /** When the link stops working; null: no end date (the member picked it). */
  expiresAt: string | null;
  viewedAt?: string;
  /** The email code: an HMAC of the 6 digits, when it was sent, wrong tries since. */
  code?: { hash: string; at: string; tries: number };
  codesSent?: string[];
  codeVerifiedAt?: string;
  signed?: { name: string; at: string; ip: string; ua: string; consent: string; consentVersion: string; hash: string; email: string; choice?: ChoiceRec };
  declined?: { at: string; reason: string; ip: string; ua: string };
  voided?: { at: string; why: "member" | "changed" | "passed" };
  /** The client passed it to someone else to sign: this link is read only now, and `to` has the new one. */
  passedTo?: { name: string; email: string; title?: string; at: string; sendId: string };
  /** This send came from a hand-off: who passed it on, and how many hand-offs there have been (at most 3). */
  passedFrom?: { name: string; email: string; at: string; sendId: string };
  handoffs?: number;
  /** When the client asked a question here (a few a day at most). */
  questions?: string[];
  /** Sent while the member had Close (canClose, the trial too): the client picks from its options, and the signed copy is a sealed PDF. */
  close?: boolean;
  /** What the client has picked so far: theirs to change until they sign. */
  choice?: Choice;
  /** The sealed PDF of the proposal as signed (lib/proposals/pdf.ts), kept on the data volume. */
  seal?: SealRec;
  /** The member's own signature on this send (frozen at send): when, and their signature once applied. Absent: none, as before. */
  memberMode?: MemberSignMode;
  member?: MemberSigned;
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
  /** The options and add-ons the client picks from (Close). Absent: one price, in the proposal's own words. */
  pricing?: Pricing;
  /** The member's own signature for the next send. Absent: "now" when they have a saved signature, else "none". */
  memberSign?: MemberSignMode;
  /** Earlier versions kept when a change was accepted or a version restored (lib/proposals/change.ts), oldest first. */
  versions?: ProposalVersion[];
}

/** A version kept so it can be compared or restored: what the document said, and what changed after it. */
export interface ProposalVersion {
  version: number;
  at: string;
  title: string;
  blocks: ProposalBlock[];
  fields: Record<string, string>;
  /** What the next version changed, in a line ("Scope is now two phases"). */
  note: string;
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
  expiresAt: string | null;
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
  /** What the client picked and signed (a proposal with options). */
  choice: ChoiceRec | null;
  /** The sealed PDF (Close): its download and when it was sealed. */
  sealed: { at: string; pdf: string; sha256: string } | null;
  /** Passed on by the client: who passed it, and (on the earlier send) who it went to. */
  passedFrom: { name: string; at: string } | null;
  passedTo: { name: string; at: string } | null;
  /** The member's own signature on this send: the mode frozen, when they signed, and "member" while the client has signed and it waits for the member's countersignature. */
  memberMode: MemberSignMode;
  memberSignedAt: string | null;
  waiting: "member" | null;
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
  /** Options and add-ons for the client to pick from (Close), or null for one price. */
  pricing: Pricing | null;
  /** The member's own signature for the next send, as it will be frozen (MemberSignMode). */
  memberSign: MemberSignMode;
  version: number;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  /** The current send, if any; then every earlier one, newest first. */
  send: ProposalSendRec | null;
  history: ProposalSendRec[];
  /** Earlier versions that can be compared and restored, newest first (their text: POST op "versions"). */
  versions?: { version: number; at: string; note: string }[];
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
  /** Sending for signature: Close and the trial (canClose in lib/billing/rules.ts; every plan while billing is off). */
  canSend: boolean;
  /** Building proposals at all (new, edit, a saved template): Close and the trial (canClose). Else read only, with the upgrade prompt. */
  canBuild: boolean;
  /** Templates the member can start from: every one on Close and the trial, none otherwise (their own stay stored). */
  templatesOpen: string[];
  /** Email is set up, so a proposal can go out. */
  email: boolean;
  /** They saved a writing voice (lib/voice.ts): drafts and changes are written in it. */
  voice?: boolean;
  /** The member's own name and title, for "Prepared by". */
  me: { name: string; title: string; function: string | null; email: string };
  /** Their saved signature (Close), or null. */
  mySignature: SignatureView | null;
}

/* ---------- what the client who signs gets ---------- */

export interface SignerView {
  status: "open" | "signed" | "declined" | "void" | "changed" | "expired" | "passed";
  /** Who signs on this link (the addressee, or who it was passed to), for the signature card. */
  signer: { name: string; title: string };
  /** This link was passed to someone else to sign. */
  passedTo: { name: string } | null;
  /** Hand-offs left on this link (at most 3 in all). */
  handoffsLeft: number;
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
  expiresAt: string | null;
  copyUrl: string | null;
  /** What they have picked so far (open), or what they signed. Null: a single price, or nothing picked yet. */
  choice: Choice | null;
  /** The choice as signed, in words. */
  signedChoice: ChoiceRec | null;
  /** The sealed PDF, once signed (Close). */
  sealed: { at: string; pdf: string } | null;
  /** Signing makes a sealed PDF (sent under Close). */
  sealOnSign: boolean;
  /** The member's side: their mode, and their signature once applied (a drawn one as a data URL). */
  memberMode: MemberSignMode;
  member: { name: string; title: string; at: string; how: MemberSigned["how"]; kind: "typed" | "drawn"; typed: string | null; img: string | null } | null;
  /** The client signed; the member countersigns next. */
  awaitingMember: boolean;
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
  /** The sealed PDF (Close): download, when, its SHA-256 and where to check a copy. */
  sealed: { at: string; pdf: string; sha256: string; check: string; events: number } | null;
  memberMode: MemberSignMode;
  member: SignerView["member"];
  awaitingMember: boolean;
  signer: { name: string; title: string };
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
