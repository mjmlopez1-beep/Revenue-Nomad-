/**
 * The seal on a final PDF (a signed proposal, lib/proposals/pdf.ts; a signed document,
 * lib/documents/pdf.ts), and checking a copy against it (/check).
 *
 * How a file is sealed:
 *  1. Its audit page carries a line "Seal SHA-256: " and 64 zeros, written uncompressed in a
 *     content stream of its own (placeSeal), so the characters sit in the file as they read.
 *  2. Once saved, Merlin takes the SHA-256 of the whole file with those 64 characters as zeros
 *     (the digest), and writes the digest into them (finishSeal). The audit page now prints it.
 *  3. Merlin keeps the SHA-256 of the file as delivered and the digest, and signs both with its
 *     own Ed25519 key (sealRec). Anyone can repeat step 2 on a copy: zero those 64 characters and
 *     hash it.
 *
 * Checking a copy (checkPdf): its SHA-256 must be one Merlin sealed, with a signature that holds.
 * A copy that prints a digest Merlin sealed but no longer hashes to it was changed after sealing.
 *
 * This is a hash and an Ed25519 signature that Merlin checks, not a PAdES signature inside the PDF:
 * a PDF reader on its own does not show it. The key is RN_SEAL_KEY (a PKCS#8 PEM), or, without
 * it, one Merlin generates once and keeps in the data folder (never in the repo), saying so in the log.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign as edSign, verify as edVerify, type KeyObject } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { StandardFonts, type PDFDocument, type PDFPage } from "pdf-lib";
import type { SealRec } from "./proposals/types";
import { DATA_DIR, loadState } from "./table";

const LABEL = "Seal SHA-256: ";
const ZEROS = "0".repeat(64);
const MARK = Buffer.from(`(${LABEL}`, "latin1");

export const sha256hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/* ---------- the key ---------- */

let key: { priv: KeyObject; pub: KeyObject; keyId: string; generated: boolean } | null = null;
export const SEAL_KEY_FILE = "seal-key.pem";

/** Merlin's seal key: RN_SEAL_KEY, or one generated once into the data folder. */
export function sealKey(): { priv: KeyObject; pub: KeyObject; keyId: string; generated: boolean } {
  if (key) return key;
  const env = process.env.RN_SEAL_KEY?.trim();
  let priv: KeyObject;
  let generated = false;
  if (env) {
    priv = createPrivateKey(env.includes("-----BEGIN") ? env : env.replace(/\\n/g, "\n"));
  } else {
    const file = path.join(DATA_DIR, SEAL_KEY_FILE);
    let pem: string | null = null;
    try {
      pem = readFileSync(file, "utf8");
    } catch {
      /* none yet */
    }
    if (!pem) {
      pem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
      mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      try {
        // "wx": two servers starting at once never write two keys; the one that lost reads the winner's.
        writeFileSync(file, pem, { mode: 0o600, flag: "wx" });
      } catch {
        pem = readFileSync(file, "utf8");
      }
    }
    priv = createPrivateKey(pem);
    generated = true;
    console.log(`seal: RN_SEAL_KEY is not set, so the PDF seal uses a key Merlin generated in the data folder (${SEAL_KEY_FILE}). Set RN_SEAL_KEY to keep your own.`);
  }
  if (priv.asymmetricKeyType !== "ed25519") throw new Error("RN_SEAL_KEY must be an Ed25519 private key (PKCS#8 PEM)");
  const pub = createPublicKey(priv);
  const keyId = sha256hex(pub.export({ type: "spki", format: "der" })).slice(0, 16);
  key = { priv, pub, keyId, generated };
  return key;
}
/** Merlin's public seal key, PEM: anyone can check a record's signature with it. */
export const sealPublicKey = () => sealKey().pub.export({ type: "spki", format: "pem" }).toString();
/** For the tests: forget the key read, so RN_SEAL_KEY or the data folder is read again. */
export const resetSealKey = () => {
  key = null;
};

/* ---------- placing and finishing the seal ---------- */

/**
 * The seal line on a page: "Seal SHA-256: " and 64 zeros in Courier, uncompressed, at (x, y),
 * filled in by finishSeal once the file is saved. Once a file.
 */
export async function placeSeal(pdf: PDFDocument, page: PDFPage, x: number, y: number, size = 8): Promise<void> {
  const courier = await pdf.embedFont(StandardFonts.Courier);
  const name = page.node.newFontDictionary("RNSeal", courier.ref);
  const ops = `q BT 0.04 0.1 0.075 rg /${name.asString().replace(/^\//, "")} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${LABEL}${ZEROS}) Tj ET Q\n`;
  page.node.addContentStream(pdf.context.register(pdf.context.stream(ops)));
}

/** Where the 64 characters are in a file: their offset, or -1 (no seal line, or more than one). */
function sealAt(b: Buffer): number {
  const at = b.indexOf(MARK);
  if (at < 0 || b.indexOf(MARK, at + 1) >= 0) return -1;
  const start = at + MARK.length;
  return /^[0-9a-f]{64}\)$/.test(b.subarray(start, start + 65).toString("latin1")) ? start : -1;
}
/** The digest of a file: its SHA-256 with the seal's 64 characters as zeros. */
function digestOf(b: Buffer, start: number): string {
  const z = Buffer.from(b);
  z.write(ZEROS, start, "latin1");
  return sha256hex(z);
}

/** Write the digest into the saved file's seal line. Returns the sealed bytes, the digest and the file's SHA-256. */
export function finishSeal(saved: Uint8Array): { bytes: Uint8Array; digest: string; sha256: string } {
  const b = Buffer.from(saved);
  const start = sealAt(b);
  if (start < 0 || b.subarray(start, start + 64).toString("latin1") !== ZEROS) throw new Error("finishSeal: the file has no seal line to fill");
  const digest = digestOf(b, start);
  b.write(digest, start, "latin1");
  return { bytes: new Uint8Array(b), digest, sha256: sha256hex(b) };
}

/* ---------- the record ---------- */

export const sealMessage = (r: Pick<SealRec, "id" | "sha256" | "digest" | "size" | "at">) => `merlin-seal:v1:${r.id}:${r.sha256}:${r.digest}:${r.size}:${r.at}`;

/** The record of a sealed file, signed with Merlin's key. */
export function sealRec(fin: { digest: string; sha256: string; bytes: Uint8Array }, at = new Date().toISOString()): SealRec {
  const k = sealKey();
  const base = { id: `sl_${randomBytes(9).toString("base64url")}`, sha256: fin.sha256, digest: fin.digest, size: fin.bytes.length, at };
  return { ...base, keyId: k.keyId, sig: edSign(null, Buffer.from(sealMessage(base)), k.priv).toString("base64url") };
}
/** The record's signature holds under Merlin's key. */
export function sealHolds(r: SealRec): boolean {
  try {
    const k = sealKey();
    return r.keyId === k.keyId && edVerify(null, Buffer.from(sealMessage(r)), k.pub, Buffer.from(r.sig, "base64url"));
  } catch {
    return false;
  }
}

/* ---------- checking a copy ---------- */

/** A sealed record, with who signed it and when: all /check ever shows. */
export interface SealedFile {
  seal: SealRec;
  signers: { name: string; at: string }[];
}
export type CheckResult =
  | { result: "match"; sealedAt: string; signers: { name: string; at: string }[] }
  | { result: "changed" }
  | { result: "unknown" };

/**
 * Is this the file Merlin sealed? `find` looks a record up by the file's SHA-256 or by its printed
 * digest. The bytes are only read here: nothing is kept.
 */
export function checkPdf(bytes: Uint8Array, find: (by: { sha256?: string; digest?: string }) => SealedFile | null): CheckResult {
  const b = Buffer.from(bytes);
  const whole = find({ sha256: sha256hex(b) });
  if (whole && sealHolds(whole.seal)) return { result: "match", sealedAt: whole.seal.at, signers: whole.signers.map((x) => ({ ...x })) };
  // Not a file Merlin sealed as it is. Does it carry a seal Merlin made? Then it was changed after.
  const start = sealAt(b);
  if (start >= 0) {
    const printed = b.subarray(start, start + 64).toString("latin1");
    const rec = find({ digest: printed });
    if (rec && sealHolds(rec.seal)) return { result: "changed" };
    if (digestOf(b, start) !== printed && find({ digest: digestOf(b, start) })) return { result: "changed" };
  }
  return { result: "unknown" };
}

/** Every sealed file in the state: signed proposals and completed documents. */
export function sealedIn(s: {
  proposals?: { sends: { seal?: SealRec; signed?: { name: string; at: string } }[] }[];
  documents?: { completed?: { seal?: SealRec }; signers: { signed?: { name: string; at: string } }[] }[];
}): (by: { sha256?: string; digest?: string }) => SealedFile | null {
  return (by) => {
    const hit = (r?: SealRec) => !!r && ((!!by.sha256 && r.sha256 === by.sha256) || (!!by.digest && r.digest === by.digest));
    for (const p of s.proposals ?? []) for (const x of p.sends) if (hit(x.seal) && x.signed) return { seal: x.seal!, signers: [{ name: x.signed.name, at: x.signed.at }] };
    for (const d of s.documents ?? [])
      if (hit(d.completed?.seal)) return { seal: d.completed!.seal!, signers: d.signers.flatMap((x) => (x.signed ? [{ name: x.signed.name, at: x.signed.at }] : [])) };
    return null;
  };
}

/** The largest copy /check reads (the largest final PDF Merlin makes, with room). */
export const CHECK_MAX_BYTES = 60 * 1024 * 1024;

/** /check: is this copy one Merlin sealed? Read in memory and hashed; the file is never written anywhere or logged. */
export async function checkCopy(bytes: Uint8Array): Promise<CheckResult> {
  if (!bytes.length || bytes.length > CHECK_MAX_BYTES) return { result: "unknown" };
  return checkPdf(bytes, sealedIn(await loadState()));
}
