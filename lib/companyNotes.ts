/**
 * Your private notes on a company (the company page's Notes and activity tab): what the member
 * learned there, in their own words, kept on any company on file, open or locked, in the pipeline
 * or not. State.companyNotes[memberId][internal company id], newest first.
 *
 * Private to the member who wrote them, the way their pipeline's notes are: never in another
 * member's view, the shared table, a connector's answer, an admin's panel or the admin export
 * (lib/table.ts exportState leaves the whole part out), and an account's purge deletes them
 * (purgeMember). Merlin reads them only to show them back to their writer.
 *
 * Pure: the action in lib/table.ts (type "companyNote") and GET /api/table?notes=<company id>
 * call these with the state's part and the company's internal id.
 */

export interface CompanyNote {
  id: string;
  /** When it was written (ISO). */
  at: string;
  text: string;
  /** When it was last changed, if it was (ISO). */
  edited?: string;
}

/** By member id, then internal company id. */
export type CompanyNotesState = Record<string, Record<string, CompanyNote[]>>;

/** What one member keeps at most: notes on one company, characters in a note, companies with notes. */
export const COMPANY_NOTE_LIMITS = { perCompany: 100, chars: 2000, companies: 1000 } as const;

export const NOTE_EMPTY = "Write the note first.";
export const NOTE_GONE = "That note isn't here anymore.";
export const NOTE_FULL = `You have ${COMPANY_NOTE_LIMITS.perCompany} notes on this company. Remove one to add another.`;
export const NOTES_FULL = `You have notes on ${COMPANY_NOTE_LIMITS.companies} companies. Remove the notes on one to start on another.`;

export class NoteProblem extends Error {}

/**
 * The text as it is kept: control characters out (a line break and a tab stay), runs of blank
 * lines cut to one, trimmed, and cut on a whole character at the limit. Empty is null.
 */
export function cleanNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!t) return null;
  const chars = [...t];
  return chars.length > COMPANY_NOTE_LIMITS.chars ? chars.slice(0, COMPANY_NOTE_LIMITS.chars).join("").trimEnd() : t;
}

/** A member's notes on a company, newest first (a copy). */
export function notesOf(all: CompanyNotesState | undefined, memberId: string, companyId: string): CompanyNote[] {
  return (all?.[memberId]?.[companyId] ?? []).map((n) => ({ ...n }));
}

/** How many companies a member has notes on, and on which (internal ids). */
export const noteCompanies = (all: CompanyNotesState | undefined, memberId: string): string[] => Object.keys(all?.[memberId] ?? {}).filter((k) => (all![memberId][k]?.length ?? 0) > 0);

/** Add a note. Throws NoteProblem with the words to say. */
export function addNote(all: CompanyNotesState, memberId: string, companyId: string, raw: unknown, nowIso: string, id: string): CompanyNote {
  const text = cleanNote(raw);
  if (!text) throw new NoteProblem(NOTE_EMPTY);
  const mine = (all[memberId] ??= {});
  if (!mine[companyId]?.length && noteCompanies(all, memberId).length >= COMPANY_NOTE_LIMITS.companies) throw new NoteProblem(NOTES_FULL);
  const list = (mine[companyId] ??= []);
  if (list.length >= COMPANY_NOTE_LIMITS.perCompany) throw new NoteProblem(NOTE_FULL);
  const note: CompanyNote = { id, at: nowIso, text };
  list.unshift(note);
  return note;
}

/** Change a note's text. Throws NoteProblem. */
export function editNote(all: CompanyNotesState, memberId: string, companyId: string, noteId: unknown, raw: unknown, nowIso: string): CompanyNote {
  const note = all[memberId]?.[companyId]?.find((n) => n.id === noteId);
  if (!note) throw new NoteProblem(NOTE_GONE);
  const text = cleanNote(raw);
  if (!text) throw new NoteProblem(NOTE_EMPTY);
  if (text !== note.text) {
    note.text = text;
    note.edited = nowIso;
  }
  return note;
}

/** Remove a note. A company left with none leaves the member's part. Throws NoteProblem. */
export function removeNote(all: CompanyNotesState, memberId: string, companyId: string, noteId: unknown): void {
  const mine = all[memberId];
  const list = mine?.[companyId];
  const k = list?.findIndex((n) => n.id === noteId) ?? -1;
  if (!list || k < 0) throw new NoteProblem(NOTE_GONE);
  list.splice(k, 1);
  if (!list.length) delete mine![companyId];
  if (mine && !Object.keys(mine).length) delete all[memberId];
}

/** A company removed from Merlin: everyone's notes on it go with it. */
export function forgetCompany(all: CompanyNotesState | undefined, companyId: string): void {
  if (!all) return;
  for (const [m, rec] of Object.entries(all)) {
    delete rec[companyId];
    if (!Object.keys(rec).length) delete all[m];
  }
}

/** Two records of one company folded into one: each member's notes on the copy join their notes on the one kept, newest first. */
export function mergeCompany(all: CompanyNotesState | undefined, from: string, to: string): void {
  if (!all || from === to) return;
  for (const rec of Object.values(all)) {
    const moved = rec[from];
    if (!moved) continue;
    delete rec[from];
    rec[to] = [...(rec[to] ?? []), ...moved].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, COMPANY_NOTE_LIMITS.perCompany);
  }
}
