/**
 * A member's own signature (Close): set once, typed or drawn with the same pad and PNG checks a
 * document's signer uses (app/sign/DocSign.tsx DrawPad, lib/documents/pdf.ts checkPng), replaced or
 * deleted at will. Their name and title come from their profile. The words of a typed one and the
 * fingerprint of a drawn one are in the state (State.memberSignatures); the drawing is a file on the
 * volume (lib/proposals/files.ts), never in the state, the export or the repo. Deleted with the
 * account's personal data (lib/account.ts).
 *
 * Saving it is agreeing to sign electronically with it (MEMBER_CONSENT, with its version), and each
 * time it is applied, to a send ("Sign it now") or as a countersignature, the audit trail says so.
 */
import { createHash } from "crypto";
import { loadSeed, loadState, tableInternals as T } from "../table";
import { checkPng } from "../documents/pdf";
import { SIG_MAX_BYTES } from "../documents/files";
import { commitSavedSignature, dropStaged, readSavedSignature, removeSavedSignature, stageSavedSignature } from "./files";
import { MEMBER_CONSENT, MEMBER_CONSENT_VERSION, type SavedSignature, type SignatureView } from "./types";
import { ProposalProblem, proposalInternals as PI } from "./store";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const NO_DRAWING = "The drawing didn't come through. Draw it again, or type your name instead.";
/** A drawn signature bigger than SIG_MAX_BYTES: its own words, with the limit. */
export const DRAWING_TOO_BIG = `That drawing is too big to save. Keep it under ${Math.round(SIG_MAX_BYTES / 1024)} KB: draw it again a little smaller, or type your name instead.`;
const NAME = /^\p{L}[\p{L}'’.-]*(?: +\p{L}[\p{L}'’.-]*)+$/u;

/** A drawn signature as a page sends it: a small PNG data URL that really decodes. */
export async function pngFromDataUrl(raw: unknown): Promise<Buffer> {
  const m = String(raw ?? "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  const b = m ? Buffer.from(m[1], "base64") : Buffer.alloc(0);
  if (b.length > SIG_MAX_BYTES) throw new ProposalProblem(DRAWING_TOO_BIG, 413);
  if (!b.length || !b.subarray(0, 8).equals(PNG)) throw new ProposalProblem(NO_DRAWING);
  if (!(await checkPng(b))) throw new ProposalProblem(NO_DRAWING);
  return b;
}
export const dataUrl = (png: Uint8Array) => `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
export const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** A signature typed or drawn, checked: the words (a full name), or the PNG. */
export async function signatureInput(a: { method?: unknown; png?: unknown; typed?: unknown }): Promise<{ kind: "typed"; typed: string } | { kind: "drawn"; png: Buffer }> {
  if (a.method === "drawn") return { kind: "drawn", png: await pngFromDataUrl(a.png) };
  const typed = PI.cleanLine(a.typed, 100);
  if (!NAME.test(typed)) throw new ProposalProblem("Type your full name, first and last, as your signature.");
  return { kind: "typed", typed };
}

/** The member's saved signature as their pages show it, or null. */
export async function signatureViewOf(s: { memberSignatures?: Record<string, SavedSignature> }, memberId: string, who: { name: string; title: string }): Promise<SignatureView | null> {
  const sig = s.memberSignatures?.[memberId];
  if (!sig) return null;
  const png = sig.kind === "drawn" ? await readSavedSignature(memberId) : null;
  if (sig.kind === "drawn" && (!png || sha(png) !== sig.sha256)) return null;
  return { kind: sig.kind, typed: sig.typed ?? null, img: png ? dataUrl(png) : null, at: sig.at, name: who.name, title: who.title };
}

/** The saved signature with its bytes, for applying it: null when there is none (or its drawing is gone). */
export async function savedSignatureOf(s: { memberSignatures?: Record<string, SavedSignature> }, memberId: string): Promise<{ sig: SavedSignature; png: Buffer | null } | null> {
  const sig = s.memberSignatures?.[memberId];
  if (!sig) return null;
  if (sig.kind === "typed") return { sig, png: null };
  const png = await readSavedSignature(memberId);
  return png && sha(png) === sig.sha256 ? { sig, png } : null;
}

const meOf = async (token: string | null) => {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = PI.memberOf(seed, s, token);
  return { seed, s, me, who: { name: me.name, title: PI.titleOf(s, me) } };
};

/** Their title, as their profile gives it (the signature's second line). */
export async function myTitle(token: string | null): Promise<string> {
  return (await meOf(token)).who.title;
}

export async function getMySignature(token: string | null): Promise<SignatureView | null> {
  const { s, me, who } = await meOf(token);
  return signatureViewOf(s, me.id, who);
}

/** Set or replace the saved signature (Close). Agreeing to MEMBER_CONSENT is required. */
export async function setMySignature(token: string | null, a: { method?: unknown; png?: unknown; typed?: unknown; consent?: unknown }, origin?: string, nowMs = Date.now()): Promise<SignatureView> {
  const { seed, s: s0, me: me0, who } = await meOf(token);
  PI.buildGate(s0, me0.id, nowMs, origin);
  if (a.consent !== true) throw new ProposalProblem("Tick the box to agree to sign electronically with it.");
  const input = await signatureInput(a);
  const at = new Date(nowMs).toISOString();
  const staged = input.kind === "drawn" ? await stageSavedSignature(me0.id, input.png) : null;
  try {
    await T.mutate((s) => {
      const me = PI.memberOf(seed, s, token);
      (s.memberSignatures ??= {})[me.id] =
        input.kind === "drawn" ? { kind: "drawn", sha256: sha(input.png), at, consentVersion: MEMBER_CONSENT_VERSION } : { kind: "typed", typed: input.typed, at, consentVersion: MEMBER_CONSENT_VERSION };
    });
  } catch (e) {
    await dropStaged(staged);
    throw e;
  }
  if (staged) await commitSavedSignature(me0.id, staged);
  else await removeSavedSignature(me0.id);
  return (await signatureViewOf(await loadState(), me0.id, who))!;
}

export async function deleteMySignature(token: string | null): Promise<void> {
  const { seed } = await meOf(token);
  const id = await T.mutate((s) => {
    const me = PI.memberOf(seed, s, token);
    if (s.memberSignatures) delete s.memberSignatures[me.id];
    return me.id;
  });
  await removeSavedSignature(id);
}

export { MEMBER_CONSENT, MEMBER_CONSENT_VERSION };
