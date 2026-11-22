"use client";

/**
 * Finding a company by its exact name or website (GET /api/table?find=). The server answers with
 * the company named for this answer only (CompanyRec.found): the page shows it in the search that
 * asked and the record opened from it, never in a table, and drops it when the search changes.
 * A part of a name finds nothing and says nothing about how many companies start with it.
 */
import { useEffect, useRef, useState } from "react";
import type { CompanyRec } from "@/lib/tableTypes";
import { FIND_MIN } from "@/lib/tableFields";
import { errorText } from "./shared";

/** What a lookup came to. `recs`: the companies found (named). `none`: no exact match (the server's words). `error`: a refusal, such as the day's limit. */
export type Found = { q: string; recs: CompanyRec[]; none?: string; error?: string };

/** Ask the server once. A text shorter than FIND_MIN asks nothing. */
export async function findCompany(text: string): Promise<Found | null> {
  const q = text.trim();
  if (q.length < FIND_MIN) return null;
  try {
    const res = await fetch(`/api/table?find=${encodeURIComponent(q)}`, { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { companies?: CompanyRec[]; found?: string; message?: string; error?: string };
    if (!res.ok) return { q, recs: [], error: errorText(res.status, j.error, "That didn't go through. Try again in a moment.") };
    if (j.found === "none") return { q, recs: [], none: j.message ?? "No company with that exact name or website." };
    return { q, recs: (j.companies ?? []).filter((c) => c && c.id) };
  } catch {
    return null;
  }
}

/**
 * The lookup for a search box: after a pause while `on` (the text matches nothing on screen), or at
 * once when `now` changes (Enter). The answer stands while the text is the one it was for. The
 * second value asks again (a repeat the same day costs nothing), for a record that changed.
 */
export function useExactFind(text: string, on: boolean, now = 0, delay = 700): [Found | null, () => void] {
  const [found, setFound] = useState<Found | null>(null);
  const seq = useRef(0);
  const q = text.trim();
  const ask = (t: string) => {
    const n = ++seq.current;
    void findCompany(t).then((f) => {
      if (n === seq.current && f) setFound(f);
    });
  };
  useEffect(() => {
    if (found && found.q !== q) setFound(null);
    if (!on || q.length < FIND_MIN || (found && found.q === q)) return;
    const h = setTimeout(() => ask(q), delay);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, on]);
  useEffect(() => {
    if (now && q.length >= FIND_MIN && !(found && found.q === q)) ask(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);
  return [found && found.q === q ? found : null, () => void (q.length >= FIND_MIN && ask(q))];
}
