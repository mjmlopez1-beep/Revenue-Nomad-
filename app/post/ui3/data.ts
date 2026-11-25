"use client";

/**
 * The new design's data, read once and shared by the nav and the pages: every company with its
 * fit, open role, ways in and lists (useTargets), Warm paths' list (useWarmShared), the member's
 * Saved and Hidden companies (lib/ui3.ts) and the actions on them. All of it comes from what the
 * app already loads: the table (AppCtx.infos), GET /api/paths (ways in) and the pipeline.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WarmRow, WarmView } from "@/lib/paths/types";
import { ui3Action } from "@/lib/ui3";
import { useApp } from "../shell/pages";
import { usePaths } from "../network/usePaths";
import { usePipeline, pipelineAct } from "../pipelineStore";
import type { CoInfo } from "../model";
import { fit7, openRole, type Fit7, type OpenRole } from "./model";

/* ---------- Warm paths' list, fetched once a visit ---------- */

type WarmSnap = { data: WarmView | null; off: boolean; failed: boolean };
let wsnap: WarmSnap = { data: null, off: false, failed: false };
let wloading: Promise<void> | null = null;
const wsubs = new Set<(s: WarmSnap) => void>();
export function loadWarm(force = false): Promise<void> {
  if (wloading && !force) return wloading;
  const run = fetch("/api/paths?warm=1", { cache: "no-store", headers: { accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { warm?: WarmView | { on: false } }) => {
      const m = j.warm;
      wsnap = m && m.on ? { data: m, off: false, failed: false } : { data: null, off: true, failed: false };
    })
    .catch(() => {
      wsnap = { ...wsnap, failed: true };
    })
    .finally(() => {
      wloading = null;
      wsubs.forEach((f) => f(wsnap));
    });
  wloading = run;
  return run;
}
export function useWarmShared(): WarmSnap {
  const [s, setS] = useState(wsnap);
  useEffect(() => {
    wsubs.add(setS);
    setS(wsnap);
    if (!wsnap.data && !wsnap.off && !wloading) void loadWarm();
    return () => {
      wsubs.delete(setS);
    };
  }, []);
  return s;
}

/** A warm way in: through someone the member knows or a fellow fractional, not a cold note to the company. */
export const isWarm = (w: WarmRow | null | undefined): w is WarmRow => !!w && !!w.via && w.src !== "direct";

/* ---------- every company, as the new design reads it ---------- */

export interface TRow {
  i: CoInfo;
  fit: Fit7;
  role: OpenRole | null;
  /** Ways in there through people the member knows (GET /api/paths counts), or null. */
  ways: { n: number; first: number } | null;
  /** Warm paths' row: who the best way in goes through. */
  warm: WarmRow | null;
  saved: boolean;
  hidden: boolean;
  inPipe: boolean;
}

export function useTargets() {
  const c = useApp();
  const { view: paths } = usePaths();
  const warm = useWarmShared().data;
  const pipe = usePipeline(true).view;
  const saved = useMemo(() => new Set(c.me.ui3Saved ?? []), [c.me.ui3Saved]);
  const hidden = useMemo(() => new Set(c.me.ui3Hidden ?? []), [c.me.ui3Hidden]);
  const inPipe = useMemo(() => new Set((pipe?.entries ?? []).filter((e) => !["lost", "notnow"].includes(e.stage)).map((e) => e.company)), [pipe]);
  const warmBy = useMemo(() => new Map((warm?.rows ?? []).map((r) => [r.id, r])), [warm]);
  const base = useMemo(() => c.infos.map((i) => ({ i, fit: fit7(i, c.me), role: openRole(i, c.me.function ?? null) })), [c.infos, c.me]);
  const rows: TRow[] = useMemo(
    () =>
      base.map((b) => ({
        ...b,
        ways: paths?.counts[b.i.c.id] ?? null,
        warm: warmBy.get(b.i.c.id) ?? null,
        saved: saved.has(b.i.c.id),
        hidden: hidden.has(b.i.c.id),
        inPipe: inPipe.has(b.i.c.id),
      })),
    [base, paths, warmBy, saved, hidden, inPipe],
  );
  const visible = useMemo(() => rows.filter((r) => !r.hidden), [rows]);
  /**
   * Opportunities: hiring for the member's function now, or a good fit (4 traits or more) that is
   * hiring or has a warm way in (someone between the member and the company). Best fit first.
   */
  const opps = useMemo(
    () =>
      visible
        .filter((r) => !!r.role?.mine || (r.fit.n >= 4 && (!!r.role || !!r.ways?.n || isWarm(r.warm))))
        .sort((a, b) => b.fit.n - a.fit.n || Number(!!b.role) - Number(!!a.role) || (b.ways?.n ?? 0) - (a.ways?.n ?? 0) || a.i.c.name.localeCompare(b.i.c.name)),
    [visible],
  );
  const all = useMemo(() => [...visible].sort((a, b) => b.fit.n - a.fit.n || Number(!!b.role) - Number(!!a.role) || a.i.c.name.localeCompare(b.i.c.name)), [visible]);
  const savedRows = useMemo(() => rows.filter((r) => r.saved), [rows]);
  return { rows, opps, all, saved: savedRows, hiddenN: rows.length - visible.length, loading: c.waiting, pathsOn: !!paths };
}

/* ---------- the actions on a company ---------- */

export function useCoActs() {
  const c = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const save = useCallback((id: string, on: boolean) => c.act(ui3Action({ ui3Save: { id, on } })), [c]);
  const hide = useCallback((id: string, on: boolean) => c.act(ui3Action({ ui3Hide: { id, on } })), [c]);
  const follow = useCallback((id: string, on: boolean) => c.act({ type: "follow", companyId: id, on }), [c]);
  /** Add to pipeline: a company the member can see goes in as To reach out. */
  const addPipe = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        const r = await pipelineAct({ type: "pipeline.add", companyIds: [id] });
        return r;
      } finally {
        setBusy(null);
      }
    },
    [],
  );
  return { save, hide, follow, addPipe, busy };
}

/* ---------- where Warm Paths opens, and Target Companies ---------- */

let warmFocus: { id: string; ask: boolean } | null = null;
/** Warm Paths opens at this company (and with "Request an intro" open when `ask`). Read once. */
export const setWarmFocus = (id: string, ask = false) => void (warmFocus = { id, ask });
export const takeWarmFocus = () => {
  const f = warmFocus;
  warmFocus = null;
  return f;
};

/** Target Companies: the companies list, on its default view. */
export function goTargets(c: ReturnType<typeof useApp>) {
  c.table.setRecordType("companies");
  if (c.table.tab === "hiring") c.table.setTab("all");
  c.openPage("table");
}
