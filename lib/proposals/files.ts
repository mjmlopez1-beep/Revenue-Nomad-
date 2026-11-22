/**
 * Where a signed proposal's sealed PDF lives: on the data volume (RN_DATA_DIR/proposals/<send id>/
 * final.pdf), readable by the server alone (0700 folders, 0600 files), as a document's files are
 * (lib/documents/files.ts). Never in the state, the repo, the export or a backup of the state.
 * Served only through app/api/sign/pdf, to someone with the signed copy's link (both sides got it).
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

export async function saveSealedPdf(sendId: string, bytes: Uint8Array): Promise<void> {
  const file = path.join(folder(sendId), "final.pdf");
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await fs.writeFile(tmp, bytes, { mode: 0o600 });
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}
export const readSealedPdf = (sendId: string): Promise<Buffer | null> => fs.readFile(path.join(folder(sendId), "final.pdf")).catch(() => null);
/** A member's proposals' files, when their personal data is deleted. */
export const removeSealedPdf = (sendId: string) => fs.rm(folder(sendId), { recursive: true, force: true }).catch(() => {});
