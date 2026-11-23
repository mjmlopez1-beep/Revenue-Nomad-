/**
 * Where a signed proposal's sealed PDF lives: on the data volume (RN_DATA_DIR/proposals/<send id>/
 * final.pdf), readable by the server alone (0700 folders, 0600 files), as a document's files are
 * (lib/documents/files.ts). Never in the state, the repo, the export or a backup of the state.
 * Served only through app/api/sign/pdf, to someone with the signed copy's link (both sides got it).
 * Also the member's signature: their saved one (members/<id>/signature.png), and the copy applied
 * to a send (proposals/<send id>/member-sig.png).
 */
import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "../table";

const SEND = /^s_[A-Za-z0-9_-]{12}$/;
const folder = (sendId: string) => {
  if (!SEND.test(sendId)) throw new Error("bad send id");
  return path.join(DATA_DIR, "proposals", sendId);
};

/** A temporary name of its own for each write, so two writes at once never move each other's half-written file into place. */
const tmpName = (file: string) => `${file}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
async function put(file: string, bytes: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = tmpName(file);
  try {
    await fs.writeFile(tmp, bytes, { mode: 0o600 });
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}
/**
 * Written aside first, moved into place only by the request that wins the record (the documents'
 * one-winner pattern, lib/documents/files.ts stageSignature): a request that lost never overwrites.
 */
async function stage(file: string, bytes: Uint8Array): Promise<string> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const staged = tmpName(file);
  await fs.writeFile(staged, bytes, { mode: 0o600 });
  return staged;
}
async function commit(file: string, staged: string): Promise<void> {
  if (path.dirname(staged) !== path.dirname(file) || !path.basename(staged).startsWith(`${path.basename(file)}.`)) throw new Error("bad staged file");
  await fs.rename(staged, file);
}
export const dropStaged = (staged: string | null) => (staged ? fs.rm(staged, { force: true }).catch(() => {}) : Promise.resolve());

export const saveSealedPdf = (sendId: string, bytes: Uint8Array) => put(path.join(folder(sendId), "final.pdf"), bytes);

/* ---------- the member's signature on a send (a copy, so replacing their saved one never changes what was signed) ---------- */

const sendSig = (sendId: string) => path.join(folder(sendId), "member-sig.png");
export const stageSendSignature = (sendId: string, png: Uint8Array) => stage(sendSig(sendId), png);
export const commitSendSignature = (sendId: string, staged: string) => commit(sendSig(sendId), staged);
export const readSendSignature = (sendId: string): Promise<Buffer | null> => fs.readFile(sendSig(sendId)).catch(() => null);

/* ---------- the client's drawn signature on a send (proposals/<send id>/client-sig.png) ---------- */

const clientSig = (sendId: string) => path.join(folder(sendId), "client-sig.png");
export const stageClientSignature = (sendId: string, png: Uint8Array) => stage(clientSig(sendId), png);
export const commitClientSignature = (sendId: string, staged: string) => commit(clientSig(sendId), staged);
export const readClientSignature = (sendId: string): Promise<Buffer | null> => fs.readFile(clientSig(sendId)).catch(() => null);

/* ---------- a member's saved signature (RN_DATA_DIR/members/<member id>/signature.png) ---------- */

const MEMBER = /^[A-Za-z0-9_-]{1,64}$/;
const savedSig = (memberId: string) => {
  if (!MEMBER.test(memberId)) throw new Error("bad member id");
  return path.join(DATA_DIR, "members", memberId, "signature.png");
};
export const stageSavedSignature = (memberId: string, png: Uint8Array) => stage(savedSig(memberId), png);
export const commitSavedSignature = (memberId: string, staged: string) => commit(savedSig(memberId), staged);
export const readSavedSignature = (memberId: string): Promise<Buffer | null> => (MEMBER.test(memberId) ? fs.readFile(savedSig(memberId)).catch(() => null) : Promise.resolve(null));
/** Replaced by a typed one, deleted, or the account's data deleted. */
export const removeSavedSignature = (memberId: string) => (MEMBER.test(memberId) ? fs.rm(path.dirname(savedSig(memberId)), { recursive: true, force: true }).catch(() => {}) : Promise.resolve());
export const readSealedPdf = (sendId: string): Promise<Buffer | null> => fs.readFile(path.join(folder(sendId), "final.pdf")).catch(() => null);
/** A member's proposals' files, when their personal data is deleted. */
export const removeSealedPdf = (sendId: string) => fs.rm(folder(sendId), { recursive: true, force: true }).catch(() => {});
