/**
 * Where a document's PDFs live: on the data volume (RN_DATA_DIR/documents/<document id>/), one
 * folder a document, readable by the server alone (0700 folders, 0600 files). The uploaded file
 * (original.pdf), the final one (final.pdf) and each drawn signature (sig-<signer id>.png). Never
 * in the state, the repo, the export or a backup of the state. Served only through
 * app/api/documents/file, to the member who uploaded it or a signer with their link.
 */
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "../table";

/** The largest PDF a member can upload (RN_DOC_MAX_MB, 15 by default). */
export const DOC_MAX_BYTES = Math.max(1, Math.min(50, Number(process.env.RN_DOC_MAX_MB) || 15)) * 1024 * 1024;
/** The largest drawn signature (a PNG). */
export const SIG_MAX_BYTES = 200 * 1024;

const ID = /^dc_[A-Za-z0-9_-]{12}$/;
const SID = /^ds_[A-Za-z0-9_-]{12}$/;
const root = () => path.join(DATA_DIR, "documents");
const folder = (id: string) => {
  if (!ID.test(id)) throw new Error("bad document id");
  return path.join(root(), id);
};

async function put(file: string, bytes: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, bytes, { mode: 0o600 });
  await fs.rename(tmp, file);
}
const get = async (file: string): Promise<Buffer | null> => fs.readFile(file).catch(() => null);

export const saveOriginal = (id: string, bytes: Uint8Array) => put(path.join(folder(id), "original.pdf"), bytes);
export const readOriginal = (id: string) => get(path.join(folder(id), "original.pdf"));
export const saveFinal = (id: string, bytes: Uint8Array) => put(path.join(folder(id), "final.pdf"), bytes);
export const readFinal = (id: string) => get(path.join(folder(id), "final.pdf"));
export function saveSignature(id: string, signerId: string, png: Uint8Array) {
  if (!SID.test(signerId)) throw new Error("bad signer id");
  return put(path.join(folder(id), `sig-${signerId}.png`), png);
}
export function readSignature(id: string, signerId: string) {
  if (!SID.test(signerId)) return Promise.resolve(null);
  return get(path.join(folder(id), `sig-${signerId}.png`));
}
/** A draft's files, when the member deletes it. */
export const removeFiles = (id: string) => fs.rm(folder(id), { recursive: true, force: true });
