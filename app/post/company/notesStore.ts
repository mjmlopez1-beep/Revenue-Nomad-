"use client";

/**
 * Your private notes on a company, in the page: read from GET /api/table?notes=<company id> when
 * the Notes tab (or the Activity it feeds) is drawn, and changed with the action "companyNote",
 * whose answer is the company's notes as they now stand. The member's own, from their own session
 * only (lib/companyNotes.ts).
 */
import { useCallback, useEffect, useState } from "react";
import { post } from "../../ui/shared";

export interface NoteRec {
  id: string;
  at: string;
  text: string;
  edited?: string;
}

const cache = new Map<string, NoteRec[]>();

export function useCompanyNotes(companyId: string) {
  const [notes, setNotes] = useState<NoteRec[] | null>(() => cache.get(companyId) ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setNotes(cache.get(companyId) ?? null);
    setFailed(false);
    void (async () => {
      try {
        const r = await fetch(`/api/table?notes=${encodeURIComponent(companyId)}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { notes?: NoteRec[] };
        cache.set(companyId, j.notes ?? []);
        if (live) setNotes(j.notes ?? []);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [companyId]);
  /** Add, change or remove a note. Resolves with the error to show, or null. */
  const act = useCallback(
    async (op: "add" | "edit" | "remove", o: { text?: string; noteId?: string }): Promise<string | null> => {
      const r = await post<{ message?: string; notes?: NoteRec[] }>({ action: { type: "companyNote", op, companyId, ...o } });
      if (r.error) return r.error;
      if (r.notes) {
        cache.set(companyId, r.notes);
        setNotes(r.notes);
      }
      setFailed(false);
      return null;
    },
    [companyId],
  );
  return { notes, failed, act };
}
