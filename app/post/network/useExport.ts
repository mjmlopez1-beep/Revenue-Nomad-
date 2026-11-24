"use client";

/**
 * The member's LinkedIn data export as Merlin holds it (GET /api/paths/export): what came in and
 * when, the roles to confirm as seats, the companies to follow and the proof. Read once a page load
 * and shared by the set-up, Settings / Connections, Warm paths, Your seats and Evidence Bank.
 */
import { useEffect, useState } from "react";
import type { ExportAnswer, ExportPayload, ExportView } from "@/lib/linkedin/types";
import { errorText } from "../../ui/shared";
import { loadPaths, loadKnown } from "./usePaths";

type Snap = { answer: ExportAnswer | null; failed: boolean };
let snap: Snap = { answer: null, failed: false };
let loading: Promise<void> | null = null;
const subs = new Set<(s: Snap) => void>();
const set = (answer: ExportAnswer | null, failed = false) => {
  snap = { answer, failed };
  subs.forEach((f) => f(snap));
};

export function loadExport(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = fetch("/api/paths/export", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { view: ExportAnswer }) => set(j.view))
    .catch(() => set(snap.answer, true))
    .finally(() => {
      loading = null;
    });
  return loading;
}

type Op = { op: "import"; payload: ExportPayload } | { op: "remove" } | { op: "seat"; key: string; do: "added" | "no" } | { op: "proof"; id: string };

/** One call: the derived payload, Remove, a role decided, or a proof removed. The answer replaces the view; who you know is read again. */
export async function exportAct(body: Op): Promise<{ message?: string; error?: string }> {
  try {
    const r = await fetch("/api/paths/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { view?: ExportAnswer; message?: string; error?: string };
    if (j.view) set(j.view);
    if (r.ok && (body.op === "import" || body.op === "remove")) {
      void loadPaths(true);
      void loadKnown(true);
    }
    return r.ok ? { message: j.message } : { error: errorText(r.status, j.error, "That didn't go through. Try again.") };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}

/** The export's view, or null while loading, signed out, or with the files off (RN_PATHS). */
export function useExport(): { view: ExportView | null; off: boolean; failed: boolean } {
  const [s, setS] = useState<Snap>(snap);
  useEffect(() => {
    subs.add(setS);
    if (!snap.answer && !loading) void loadExport();
    return () => {
      subs.delete(setS);
    };
  }, []);
  const a = s.answer;
  return { view: a && a.on ? a : null, off: !!a && !a.on, failed: s.failed };
}
