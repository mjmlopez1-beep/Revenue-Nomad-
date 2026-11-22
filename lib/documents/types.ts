/**
 * Documents to sign (lib/documents): a PDF the member wrote outside Merlin, with fields placed on
 * its pages for each signer, signed in order through the same signing page as a proposal
 * (/sign/<token>: a signed expiring link, a 6-digit code to the signer's email, the consent,
 * a typed or drawn signature). When everyone has signed, Merlin stamps the values into the PDF
 * and adds an audit trail page.
 *
 * What the state keeps (StoredDocument, State.documents) and what leaves the server (DocumentRec
 * for the member, DocSignerView for a signer). The PDFs themselves are files on the data volume
 * (lib/documents/files.ts), never in the state, the repo or the export. No imports from
 * lib/table.ts, so the app can read this file.
 */

export const FIELD_KINDS = ["signature", "initials", "date", "name", "text", "checkbox"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];
export const FIELD_SAY: Record<FieldKind, string> = { signature: "Signature", initials: "Initials", date: "Date signed", name: "Full name", text: "Text", checkbox: "Checkbox" };
/** A new field's size, as a share of the page's width and height (a US Letter page). */
export const FIELD_SIZE: Record<FieldKind, { w: number; h: number }> = {
  signature: { w: 0.3, h: 0.055 },
  initials: { w: 0.1, h: 0.045 },
  date: { w: 0.18, h: 0.035 },
  name: { w: 0.28, h: 0.035 },
  text: { w: 0.28, h: 0.035 },
  checkbox: { w: 0.03, h: 0.023 },
};

/** A field on a page. x, y, w and h are shares (0 to 1) of the page as shown, from its top left. */
export interface DocField {
  id: string;
  /** 0-based page. */
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: FieldKind;
  /** The signer who fills it (DocSigner.id). */
  signer: string;
  required: boolean;
  /** For a text field: what to type ("Start date"). */
  label?: string;
}

export interface DocEvent {
  kind: "uploaded" | "sent" | "notified" | "viewed" | "code_sent" | "code_failed" | "code_verified" | "signed" | "declined" | "voided" | "completed" | "copy_sent" | "expired_open";
  at: string;
  /** Whose step it was (a signer's email), when it was a signer's. */
  who?: string;
  ip?: string;
  ua?: string;
  note?: string;
}

export interface DocSigner {
  /** "ds_" and 12 characters: the key in the signing link. */
  id: string;
  name: string;
  email: string;
  title?: string;
  /** The member who sent it signs too. */
  sender?: boolean;
  /** When the link was emailed to them. */
  notifiedAt?: string;
  viewedAt?: string;
  code?: { hash: string; at: string; tries: number };
  codesSent?: string[];
  codeVerifiedAt?: string;
  signed?: { at: string; ip: string; ua: string; name: string; method: "typed" | "drawn"; consent: string; consentVersion: string; hash: string };
  declined?: { at: string; reason: string; ip: string; ua: string };
  /** What they filled, by field id. A checkbox is "yes" or "". */
  values?: Record<string, string>;
}

export interface StoredDocument {
  /** "dc_" and 12 characters. */
  id: string;
  memberId: string;
  /** The company on Merlin (internal id) it is for, when it is one: its pipeline moves on send, sign and decline. */
  companyId: string | null;
  companyPub: string | null;
  companyName: string;
  title: string;
  fileName: string;
  size: number;
  /** Each page's crop box in PDF points, and its rotation. */
  pages: { x: number; y: number; w: number; h: number; rot: number }[];
  /** SHA-256 of the uploaded file, hex. */
  sha256: string;
  fields: DocField[];
  signers: DocSigner[];
  /** One at a time, in the list's order. Off: everyone gets it at once. */
  ordered: boolean;
  message?: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  expiresAt?: string;
  voided?: { at: string };
  /** The final PDF: the fields stamped in and the audit trail page added. */
  completed?: { at: string; sha256: string; signedPagesSha256: string; size: number; seal?: import("../proposals/types").SealRec };
  events: DocEvent[];
}

export type DocStatus = "draft" | "sent" | "viewed" | "signed" | "declined" | "void" | "expired";

/* ---------- what the member's app gets ---------- */

export interface DocSignerRec {
  id: string;
  name: string;
  email: string;
  title: string | null;
  sender: boolean;
  status: "waiting" | "sent" | "viewed" | "signed" | "declined";
  notifiedAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
}

export interface DocumentRec {
  id: string;
  kind: "document";
  title: string;
  fileName: string;
  company: { id: string | null; name: string };
  pages: { w: number; h: number }[];
  size: number;
  sha256: string;
  fields: DocField[];
  signers: DocSignerRec[];
  ordered: boolean;
  status: DocStatus;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  finalSha256: string | null;
  /** The final PDF's page (signed only): the download and the hashes. */
  copyUrl: string | null;
  events: DocEvent[];
}

/* ---------- what a signer gets ---------- */

export interface DocSignerView {
  kind: "document";
  status: "open" | "waiting" | "signed" | "declined" | "void" | "expired" | "done";
  title: string;
  from: { name: string; title: string };
  company: string;
  me: { name: string; title: string };
  emailHint: string;
  /** The pages as shown (rotation applied), in PDF points. */
  pages: { w: number; h: number }[];
  /** The signer's own fields. */
  fields: DocField[];
  /** Everyone else, with where they are: the signer sees who signs before and after them. */
  others: { name: string; status: DocSignerRec["status"] }[];
  sha256: string;
  codeVerified: boolean;
  codeSent: boolean;
  consent: string;
  consentVersion: string;
  signedAt: string | null;
  expiresAt: string | null;
  copyUrl: string | null;
}

/** The completed document's page (/signed/<token>): who signed, the hashes, and the download. */
export interface DocCopy {
  title: string;
  fileName: string;
  from: { name: string; title: string };
  signers: { name: string; email: string; title: string | null; signedAt: string; method: "typed" | "drawn" }[];
  sha256: string;
  finalSha256: string;
  signedPagesSha256: string;
  completedAt: string;
  download: string;
  events: DocEvent[];
  id: string;
  /** Sealed (lib/seal.ts): anyone can check a copy at `check`. Null for a document finished before seals. */
  sealed: { at: string; check: string } | null;
}
