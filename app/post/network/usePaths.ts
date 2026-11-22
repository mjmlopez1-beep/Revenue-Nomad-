"use client";

/**
 * The member's smart ways in (GET /api/paths), read once per page load and shared by every part that
 * shows them: Your network's LinkedIn card and "Your hidden paths", the record's "Smart ways in" and
 * Crystal Ball's chip. With Your network off the answer is { on: false } and none of them render.
 */
import { useEffect, useState } from "react";
import type { CompanyPathsView, PathsAnswer, PathsView } from "@/lib/paths/types";
import type { IntroPlanView } from "@/lib/paths/intro";
import { errorText } from "../../ui/shared";

type Snap = { answer: PathsAnswer | null; failed: boolean; version: number };
let snap: Snap = { answer: null, failed: false, version: 0 };
let loading: Promise<void> | null = null;
const subs = new Set<(s: Snap) => void>();
const companyCache = new Map<string, CompanyPathsView>();

function set(answer: PathsAnswer | null, failed = false) {
  if (answer && answer !== snap.answer) companyCache.clear();
  snap = { answer, failed, version: snap.version + (answer !== snap.answer ? 1 : 0) };
  subs.forEach((f) => f(snap));
}

export function loadPaths(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = fetch("/api/paths", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { view: PathsAnswer }) => set(j.view))
    .catch(() => set(snap.answer, true))
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Upload the member's own Connections.csv (its text), or delete it. The answer replaces the view. */
export async function pathsAct(op: "import" | "delete", csv?: string): Promise<{ message?: string; error?: string }> {
  try {
    const r = await fetch("/api/paths", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(op === "import" ? { op, csv } : { op }) });
    const j = (await r.json().catch(() => ({}))) as { view?: PathsAnswer; message?: string; error?: string };
    if (j.view) set(j.view);
    return r.ok ? { message: j.message } : { error: errorText(r.status, j.error, "That didn't go through. Try again.") };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}

/** The member's ways in, or null while loading, signed out, or with the feature off. */
export function usePaths(): { view: PathsView | null; failed: boolean; version: number } {
  const [s, setS] = useState<Snap>(snap);
  useEffect(() => {
    subs.add(setS);
    if (!snap.answer && !loading) void loadPaths();
    return () => {
      subs.delete(setS);
    };
  }, []);
  const a = s.answer;
  return { view: a && a.on ? a : null, failed: s.failed, version: s.version };
}

/** How many ways in the member has at a company (its public id): { n, first }, or null. */
export function usePathCount(id: string | null | undefined): { n: number; first: number } | null {
  const { view } = usePaths();
  return (id && view?.counts[id]) || null;
}

/** One company's ways in, fetched when the member has any there. */
export function useCompanyPaths(id: string | null | undefined): CompanyPathsView | null {
  const { view, version } = usePaths();
  const has = !!(id && view?.counts[id]?.n);
  const [got, setGot] = useState<CompanyPathsView | null>(() => (id ? companyCache.get(id) ?? null : null));
  useEffect(() => {
    if (!id || !has) {
      setGot(null);
      return;
    }
    const hit = companyCache.get(id);
    if (hit) {
      setGot(hit);
      return;
    }
    let live = true;
    fetch(`/api/paths?company=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { company?: CompanyPathsView } | null) => {
        if (!live || !j?.company || !("paths" in j.company)) return;
        companyCache.set(id, j.company);
        setGot(j.company);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, has, version]);
  return has ? got : null;
}

/** Everyone with a specific ask (lib/paths/intro.ts), by each of their keys. */
const planMemo = new WeakMap<PathsView, Map<string, IntroPlanView>>();
export function plansOf(view: PathsView | null): Map<string, IntroPlanView> {
  if (!view) return new Map();
  let m = planMemo.get(view);
  if (!m) {
    m = new Map();
    for (const p of view.people ?? []) for (const k of p.keys) if (!m.has(k)) m.set(k, p);
    planMemo.set(view, m);
  }
  return m;
}
/** The specific ask for someone the member knows, by any of their keys ("g:<email>" for a Google contact, "l:<slug>", "m:<id>"), or null. */
export function usePlan(...keys: (string | null | undefined)[]): IntroPlanView | null {
  const { view } = usePaths();
  const m = plansOf(view);
  for (const k of keys) if (k && m.has(k)) return m.get(k)!;
  return null;
}
