/**
 * Saved contracts: a contract the member sends again and again (an NDA, a master services
 * agreement, a statement of work), kept with its fields where they were placed, so next time they
 * only say who it is for. Contracts in the app (app/post/contracts) lists them as tiles, and
 * "Save to reuse" on a contract (or while sending one) keeps it.
 *
 * A saved contract is a document of the member's own (State.documents, StoredDocument.saved) with
 * a copy of the PDF on the data volume, so it is private like every document, purged with the
 * member's data and kept out of the export as documents are (lib/table.ts). It is never sent: the
 * member's own place among its signers stays theirs, the other places are empty ("roles") until it
 * is used. Using it makes a new draft from it, with the people the member names in those places,
 * and the same fields.
 *
 *   savedOf(s, memberId)          the member's saved contracts, newest first (SavedContract)
 *   saveContract(token, id, name) keep one of the member's documents to reuse (any status)
 *   useContract(token, id, a)     a new draft from a saved one: { signers, companyId?, companyName?, title? }
 *   removeSaved(token, id)        delete a saved contract and its file
 *
 * Up to SAVED_MAX a member. No imports from the app: the server only.
 */
import { randomBytes } from "crypto";
import { loadSeed, loadState, tableInternals as T, type State } from "../table";
import { ProposalProblem, companyFor, proposalInternals as PI } from "../proposals/store";
import { readOriginal, removeFiles, saveOriginal } from "./files";
import { DOC_LIMITS, docRec, mineDoc } from "./store";
import type { DocSigner, DocumentRec, StoredDocument } from "./types";

export const SAVED_MAX = 20;
const newId = (p: string) => `${p}${randomBytes(9).toString("base64url")}`;
const { cleanLine, cleanSigner, memberOf } = PI;

/** A saved contract as the app lists it. */
export interface SavedContract {
  id: string;
  name: string;
  fileName: string;
  pages: number;
  /** Fields placed, for everyone. */
  fields: number;
  /** The places for the other side's signers, in signing order ("Signer 1"), each with its title when one was kept. */
  roles: { id: string; label: string; title: string | null }[];
  /** The member signs it too (their place and fields are kept). */
  meSigns: boolean;
  ordered: boolean;
  savedAt: string;
  uses: number;
  lastUsedAt: string | null;
  /** The pages with fields on them, 0-based (the preview shows the first). */
  fieldPages: number[];
}

const roleLabel = (i: number, n: number) => (n === 1 ? "Their signer" : `Signer ${i + 1}`);

export function savedRec(d: StoredDocument): SavedContract {
  const others = d.signers.filter((x) => !x.sender);
  return {
    id: d.id,
    name: d.title,
    fileName: d.fileName,
    pages: d.pages.length,
    fields: d.fields.length,
    roles: others.map((x, i) => ({ id: x.id, label: roleLabel(i, others.length), title: x.title ?? null })),
    meSigns: d.signers.some((x) => x.sender),
    ordered: d.ordered,
    savedAt: d.saved!.at,
    uses: d.saved!.uses,
    lastUsedAt: d.saved!.lastAt ?? null,
    fieldPages: [...new Set(d.fields.map((f) => f.page))].sort((a, b) => a - b),
  };
}

/** The member's saved contracts, newest first. */
export const savedOf = (s: State, memberId: string): SavedContract[] =>
  (s.documents ?? [])
    .filter((d) => d.memberId === memberId && !!d.saved)
    .sort((a, b) => b.saved!.at.localeCompare(a.saved!.at))
    .map(savedRec);

export async function listSaved(token: string | null): Promise<SavedContract[]> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  return savedOf(s, memberOf(seed, s, token).id);
}

/** A saved contract, for the app's preview (its page and fields): the document as the member sees one. */
export async function getSaved(token: string | null, id: string, origin?: string): Promise<{ saved: SavedContract; document: DocumentRec }> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const d = mineDoc(s, memberOf(seed, s, token).id, id);
  if (!d.saved) throw new ProposalProblem("That isn't a saved contract.", 404);
  return { saved: savedRec(d), document: docRec(d, Date.now(), origin) };
}

/**
 * Keep one of the member's documents to reuse: the same PDF (copied, so deleting either leaves
 * the other) and the same fields. The member's own place stays; the others become empty places,
 * keeping only their title (a title is about the role, a name and email are about one client).
 */
export async function saveContract(token: string | null, id: string, a: { name?: unknown } = {}, nowMs = Date.now()): Promise<SavedContract> {
  const [seed, s0] = await Promise.all([loadSeed(), loadState()]);
  const me0 = memberOf(seed, s0, token);
  const src = mineDoc(s0, me0.id, id);
  if (src.saved) throw new ProposalProblem("That one is saved already.");
  if (!src.fields.length || !src.signers.length) throw new ProposalProblem("Place its fields and say who signs first, then save it.");
  if ((s0.documents ?? []).filter((d) => d.memberId === me0.id && d.saved).length >= SAVED_MAX) throw new ProposalProblem(`You have ${SAVED_MAX} saved contracts, which is the most. Delete one you no longer use first.`);
  const bytes = await readOriginal(src.id);
  if (!bytes) throw new ProposalProblem("The file isn't there anymore. Upload it again.", 410);
  const nid = newId("dc_");
  await saveOriginal(nid, bytes);
  const now = new Date(nowMs).toISOString();
  try {
    return await T.mutate((s) => {
      const me = memberOf(seed, s, token);
      const d = mineDoc(s, me.id, id);
      if ((s.documents ?? []).filter((x) => x.memberId === me.id && !!x.saved).length >= SAVED_MAX) throw new ProposalProblem(`You have ${SAVED_MAX} saved contracts, which is the most.`);
      const ids = new Map(d.signers.map((x) => [x.id, newId("ds_")]));
      const name = cleanLine(a.name, DOC_LIMITS.title) || plainTitle(d);
      const signers: DocSigner[] = d.signers.map((x) =>
        x.sender ? { id: ids.get(x.id)!, name: x.name, email: x.email, ...(x.title ? { title: x.title } : {}), sender: true } : { id: ids.get(x.id)!, name: "", email: "", ...(x.title ? { title: x.title } : {}) },
      );
      const saved: StoredDocument = {
        id: nid,
        memberId: me.id,
        companyId: null,
        companyPub: null,
        companyName: "",
        title: name,
        fileName: d.fileName,
        size: d.size,
        pages: structuredClone(d.pages),
        sha256: d.sha256,
        // A field's text filled in for one client (their title) stays a field, empty: the next client fills their own.
        fields: d.fields.map((f) => {
          const { prefill: _p, ...rest } = f; // eslint-disable-line @typescript-eslint/no-unused-vars
          return { ...rest, signer: ids.get(f.signer)! };
        }),
        signers,
        ordered: d.ordered,
        createdAt: now,
        updatedAt: now,
        events: [{ kind: "uploaded", at: now, note: "Saved to reuse" }],
        saved: { at: now, uses: 0 },
      };
      (s.documents ??= []).push(saved);
      return savedRec(saved);
    });
  } catch (e) {
    await removeFiles(nid).catch(() => {});
    throw e;
  }
}

/** "Cedar and Pine · Statement of work" saved reads "Statement of work": the client's name is for one client. */
export function plainTitle(d: Pick<StoredDocument, "title" | "companyName">): string {
  const t = d.title.trim();
  const parts = t.split(" · ");
  if (parts.length > 1 && (!d.companyName || parts[0].trim().toLowerCase() === d.companyName.trim().toLowerCase())) return parts.slice(1).join(" · ").trim() || t;
  return t || "Contract";
}

/**
 * A new draft from a saved contract: the PDF copied again, its fields placed as saved, and the
 * people the member names in its empty places, in order. Their title fills a Title field, for
 * them to check. The member's own place stays theirs. The company, when it is on Merlin, links the
 * new draft to its pipeline deal as any contract does.
 */
export async function useContract(
  token: string | null,
  id: string,
  a: { signers?: unknown; companyId?: unknown; companyName?: unknown; title?: unknown; me?: unknown } = {},
  origin?: string,
  nowMs = Date.now(),
): Promise<DocumentRec> {
  const [seed, s0] = await Promise.all([loadSeed(), loadState()]);
  const me0 = memberOf(seed, s0, token);
  const src0 = mineDoc(s0, me0.id, id);
  if (!src0.saved) throw new ProposalProblem("That isn't a saved contract.", 404);
  const others0 = src0.signers.filter((x) => !x.sender);
  const raw = Array.isArray(a.signers) ? a.signers : [];
  if (raw.length !== others0.length) throw new ProposalProblem(others0.length === 1 ? "Say who signs it." : `Say who signs in each of its ${others0.length} places.`);
  const people = raw.map((r) => cleanSigner(r));
  const mine = me0.email?.toLowerCase();
  if (people.some((p) => p.email === mine)) throw new ProposalProblem("That's your own email. Type the email of the person who signs for them.");
  if (new Set(people.map((p) => p.email)).size !== people.length) throw new ProposalProblem("The same email is in two places.");
  const pub = typeof a.companyId === "string" && a.companyId ? a.companyId : null;
  const co = pub ? await companyFor(token!, pub) : null;
  if (pub && !co) throw new ProposalProblem("That company isn't on Merlin. Type its name instead.");
  if ((s0.documents ?? []).filter((d) => d.memberId === me0.id).length >= DOC_LIMITS.documents) throw new ProposalProblem(`You have ${DOC_LIMITS.documents} documents, which is the most. Delete an old draft first.`);
  const bytes = await readOriginal(src0.id);
  if (!bytes) throw new ProposalProblem("The file isn't there anymore. Upload it again and save it.", 410);
  const nid = newId("dc_");
  await saveOriginal(nid, bytes);
  const now = new Date(nowMs).toISOString();
  try {
    return await T.mutate((s) => {
      const me = memberOf(seed, s, token);
      const src = mineDoc(s, me.id, id);
      if (!src.saved) throw new ProposalProblem("That isn't a saved contract.", 404);
      const ids = new Map(src.signers.map((x) => [x.id, newId("ds_")]));
      // The member may leave themselves off this time (me: false): their place and fields go.
      const meToo = a.me !== false;
      let k = 0;
      const signers: DocSigner[] = src.signers.flatMap((x) => {
        if (x.sender) return meToo ? [{ id: ids.get(x.id)!, name: me.name || x.name, email: (me.email || x.email).toLowerCase(), ...(x.title ? { title: x.title } : {}), sender: true }] : [];
        const p = people[k++]!;
        return [{ id: ids.get(x.id)!, name: p.name, email: p.email, ...(p.title ? { title: p.title } : x.title ? { title: x.title } : {}) }];
      });
      const keep = new Set(signers.map((x) => x.id));
      const fields = src.fields
        .map((f) => ({ ...f, signer: ids.get(f.signer)! }))
        .filter((f) => keep.has(f.signer))
        .map((f) => (f.kind === "text" && /^title$/i.test(f.label ?? "") ? { ...f, prefill: signers.find((x) => x.id === f.signer)?.title || undefined } : f))
        .map((f) => (f.prefill === undefined ? (({ prefill: _p, ...rest }) => rest)(f) : f)); // eslint-disable-line @typescript-eslint/no-unused-vars
      const company = co ? co.name || cleanLine(a.companyName, 120) : cleanLine(a.companyName, 120);
      const title = cleanLine(a.title, DOC_LIMITS.title) || (company ? `${company} · ${src.title}` : src.title);
      const d: StoredDocument = {
        id: nid,
        memberId: me.id,
        companyId: co?.internal ?? null,
        companyPub: co ? pub : null,
        companyName: company,
        title: title.slice(0, DOC_LIMITS.title),
        fileName: src.fileName,
        size: src.size,
        pages: structuredClone(src.pages),
        sha256: src.sha256,
        fields,
        signers,
        ordered: src.ordered,
        createdAt: now,
        updatedAt: now,
        events: [{ kind: "uploaded", at: now, note: `From the saved contract ${src.title}` }],
      };
      (s.documents ??= []).push(d);
      src.saved = { ...src.saved, uses: src.saved.uses + 1, lastAt: now };
      return docRec(d, nowMs, origin);
    });
  } catch (e) {
    await removeFiles(nid).catch(() => {});
    throw e;
  }
}

/** Delete a saved contract and its file. Contracts made from it keep their own copies. */
export async function removeSaved(token: string | null, id: string): Promise<void> {
  const seed = await loadSeed();
  await T.mutate((s) => {
    const d = mineDoc(s, memberOf(seed, s, token).id, id);
    if (!d.saved) throw new ProposalProblem("That isn't a saved contract.", 404);
    s.documents = (s.documents ?? []).filter((x) => x !== d);
  });
  await removeFiles(id).catch(() => {});
}
