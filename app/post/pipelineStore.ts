"use client";

/**
 * Your pipeline in the page (lib/pipeline.ts PipelineView): read once from GET /api/table?pipeline=1
 * and shared by Home's follow-ups, the Your pipeline page, the record's Your pipeline block and an
 * intro's line in Messages. Every pipeline action answers with the whole view, which takes its
 * place here, so each of them redraws at once. The member's own, from their own session only.
 */
import { useEffect, useSyncExternalStore } from "react";
import { post, type Action } from "../ui/shared";
import type { PipelineView } from "@/lib/pipeline";

let view: PipelineView | null = null;
let failed = false;
let loading: Promise<void> | null = null;
let loadedAt = 0;
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());
/** Read again after this long, when a part that shows it is drawn. */
const STALE_MS = 60_000;

export function setPipeline(v: PipelineView | null | undefined) {
  if (!v) return;
  view = v;
  failed = false;
  loadedAt = Date.now();
  tell();
}

/** Read the pipeline from the server (one request at a time). */
export function loadPipeline(force = false): Promise<void> {
  if (loading) return loading;
  if (!force && view && Date.now() - loadedAt < STALE_MS) return Promise.resolve();
  loading = (async () => {
    try {
      const r = await fetch("/api/table?pipeline=1", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setPipeline((await r.json()) as PipelineView);
    } catch {
      failed = true;
      tell();
    } finally {
      loading = null;
    }
  })();
  return loading;
}

const snap = () => view;
const failSnap = () => failed;
const sub = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

/** The pipeline as last read. `load`: read it when this part is drawn (and again once it is a minute old). */
export function usePipeline(load = true): { view: PipelineView | null; failed: boolean } {
  const v = useSyncExternalStore(sub, snap, () => null);
  const f = useSyncExternalStore(sub, failSnap, () => false);
  useEffect(() => {
    if (load) void loadPipeline();
  }, [load]);
  return { view: v, failed: f };
}

/** Run a pipeline action. The answer's view takes the place of the one here. */
export async function pipelineAct(action: Action): Promise<{ ok: boolean; message: string }> {
  const r = await post<{ message?: string; pipeline?: PipelineView }>({ action });
  if (r.error) return { ok: false, message: r.error };
  setPipeline(r.pipeline);
  return { ok: true, message: r.message ?? "" };
}
