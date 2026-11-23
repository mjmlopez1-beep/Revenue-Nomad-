"use client";

/**
 * Your way in (lib/paths/ways.ts), read and changed through /api/paths: one company's routes and
 * plan (GET ?way=), Where you can get in (GET ?map=1), and the member's plans for Home's move and
 * the pipeline's route line (GET ?plans=1, shared by every part that shows them). Going with a
 * route and answering a step is POST { op: "way" }: the answer replaces the page and the plans.
 *
 * openWay(company) opens Your way into that company from anywhere (Home, the pipeline, a record):
 * TradingPost listens for the event and shows the page.
 */
import { useCallback, useEffect, useState } from "react";
import type { GetInView, PlanLine, WayInView } from "@/lib/paths/types";
import type { StepOp } from "@/lib/paths/plan";
import { errorText } from "../../ui/shared";

export const WAY_EVENT = "rn-way";
/** Open Your way into a company (its public id), from anywhere in the app. */
export function openWay(company: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(WAY_EVENT, { detail: company }));
}

type Got<T> = { data: T | null; off: boolean; failed: boolean };

async function getJson<T>(q: string): Promise<{ ok: boolean; j: T | null }> {
  try {
    const r = await fetch(`/api/paths?${q}`, { cache: "no-store" });
    return { ok: r.ok, j: (await r.json().catch(() => null)) as T | null };
  } catch {
    return { ok: false, j: null };
  }
}

/* ---------- the member's plans (Home, the pipeline) ---------- */

let plansSnap: PlanLine[] | null = null;
let plansLoading: Promise<void> | null = null;
const plansSubs = new Set<(p: PlanLine[] | null) => void>();
function setPlans(p: PlanLine[] | null) {
  plansSnap = p;
  plansSubs.forEach((f) => f(p));
}
export function loadPlans(force = false): Promise<void> {
  if (plansLoading && !force) return plansLoading;
  plansLoading = getJson<{ plans?: PlanLine[] }>("plans=1")
    .then(({ j }) => setPlans(j?.plans ?? []))
    .finally(() => {
      plansLoading = null;
    });
  return plansLoading;
}
/** The member's plans, best first (null while loading; empty with Your network off). */
export function usePlans(): PlanLine[] | null {
  const [p, setP] = useState(plansSnap);
  useEffect(() => {
    plansSubs.add(setP);
    if (!plansSnap && !plansLoading) void loadPlans();
    return () => {
      plansSubs.delete(setP);
    };
  }, []);
  return p;
}

/* ---------- one company ---------- */

export function useWayIn(company: string | null): Got<WayInView> & { reload: () => Promise<void>; set: (v: WayInView) => void } {
  const [s, setS] = useState<Got<WayInView>>({ data: null, off: false, failed: false });
  const reload = useCallback(async () => {
    if (!company) return;
    const { ok, j } = await getJson<{ way?: WayInView | { on: false } | { none: true } }>(`way=${encodeURIComponent(company)}`);
    const w = j?.way;
    if (!ok || !w) setS((x) => ({ ...x, failed: true }));
    else if ("none" in w || !w.on) setS({ data: null, off: true, failed: false });
    else setS({ data: w, off: false, failed: false });
  }, [company]);
  useEffect(() => {
    setS({ data: null, off: false, failed: false });
    void reload();
  }, [reload]);
  return { ...s, reload, set: (v) => setS({ data: v, off: false, failed: false }) };
}

export type WayDo = { do: "go"; route: string } | { do: "step"; step: number; answer: StepOp } | { do: "drop" };
/** Go with a route, or answer a step. The page and the plans are replaced by the answer. */
export async function wayPost(company: string, op: WayDo): Promise<{ view?: WayInView; message?: string; error?: string }> {
  try {
    const r = await fetch("/api/paths", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "way", company, ...op }) });
    const j = (await r.json().catch(() => ({}))) as { way?: WayInView; message?: string; error?: string };
    if (r.ok) void loadPlans(true);
    return r.ok ? { view: j.way, message: j.message } : { error: errorText(r.status, j.error, "That didn't go through. Try again.") };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}

/* ---------- Where you can get in ---------- */

export function useGetIn(): Got<GetInView> & { reload: () => Promise<void> } {
  const [s, setS] = useState<Got<GetInView>>({ data: null, off: false, failed: false });
  const reload = useCallback(async () => {
    const { ok, j } = await getJson<{ map?: GetInView | { on: false } }>("map=1");
    const m = j?.map;
    if (!ok || !m) setS((x) => ({ ...x, failed: true }));
    else if (!m.on) setS({ data: null, off: true, failed: false });
    else setS({ data: m, off: false, failed: false });
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { ...s, reload };
}

/* ---------- Warm paths (the new look) ---------- */

/** Warm paths' map and list (GET ?warm=1). */
export function useWarm(): Got<import("@/lib/paths/types").WarmView> & { reload: () => Promise<void> } {
  type WV = import("@/lib/paths/types").WarmView;
  const [s, setS] = useState<Got<WV>>({ data: null, off: false, failed: false });
  const reload = useCallback(async () => {
    const { ok, j } = await getJson<{ warm?: WV | { on: false } }>("warm=1");
    const m = j?.warm;
    if (!ok || !m) setS((x) => ({ ...x, failed: true }));
    else if (!m.on) setS({ data: null, off: true, failed: false });
    else setS({ data: m, off: false, failed: false });
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { ...s, reload };
}

/** Suggested additions from the member's own files (GET ?suggest=1; RN_SUGGEST only). */
export function useSuggest(on: boolean): { data: import("@/lib/paths/types").SuggestView | null; reload: () => Promise<void>; set: (v: import("@/lib/paths/types").SuggestView) => void } {
  type SV = import("@/lib/paths/types").SuggestView;
  const [d, setD] = useState<SV | null>(null);
  const reload = useCallback(async () => {
    const { ok, j } = await getJson<{ suggest?: SV }>("suggest=1");
    setD(ok && j?.suggest ? j.suggest : null);
  }, []);
  useEffect(() => {
    if (on) void reload();
  }, [on, reload]);
  return { data: d, reload, set: setD };
}

/** Add the ticked people, or never suggest them again. */
export async function suggestPost(op: "suggestAdd" | "suggestSkip", keys: string[]): Promise<{ view?: import("@/lib/paths/types").SuggestView; message?: string; error?: string }> {
  try {
    const r = await fetch("/api/paths", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, keys }) });
    const j = (await r.json().catch(() => ({}))) as { suggest?: import("@/lib/paths/types").SuggestView; message?: string; error?: string };
    return r.ok ? { view: j.suggest, message: j.message } : { error: errorText(r.status, j.error, "That didn't go through. Try again.") };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}
