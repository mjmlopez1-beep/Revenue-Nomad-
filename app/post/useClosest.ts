"use client";

/**
 * Evidence Bank's closest cases for the companies on screen (workbench/closest.ts), and the
 * member's case counts (Getting started's step 6), only on Close (Evidence Bank is a Close
 * feature). The counts come from GET /api/evidence/closest; each company's closest case from
 * Evidence Bank's own match, POST /api/evidence { op: "match", companyIds } (lib/evidence
 * matchRowsIn), so the column, the cards and Evidence Bank rank the same way. Each company is asked
 * once a couple of minutes, in batches of 200; a page re-renders when its rows arrive.
 */
import { useEffect, useState } from "react";
import type { ClosestRow, ClosestView } from "@/lib/evidenceWire";
import { clearClosest, closestKnown, putClosest } from "./workbench/closest";

const BATCH = 200;
type Summary = Pick<ClosestView, "on" | "ready" | "drafts">;
let summary: { v: Summary; at: number } | null = null;
const SUMMARY_TTL = 60_000;
const subs = new Set<() => void>();
/** Goes up when what this browser has is forgotten: every page on screen asks again. */
let gen = 0;
const ping = () => subs.forEach((f) => f());

const flying = new Map<string, Promise<unknown>>();
/** One request for the same thing at a time (several parts of a page ask together). */
function once<T>(k: string, go: () => Promise<T>): Promise<T> {
  let q = flying.get(k) as Promise<T> | undefined;
  if (!q) {
    q = go().finally(() => flying.delete(k));
    flying.set(k, q);
  }
  return q;
}
/** The counts: how many cases are ready and in draft, and whether the member has Close. */
const askSummary = () =>
  once("summary", async (): Promise<Summary | null> => {
    try {
      const r = await fetch("/api/evidence/closest", { cache: "no-store" });
      if (!r.ok) return null;
      const v = (await r.json()) as ClosestView;
      return { on: v.on === true, ready: Number(v.ready) || 0, drafts: Number(v.drafts) || 0 };
    } catch {
      return null;
    }
  });
/** Each company's closest case, from Evidence Bank's match. Only a Same or Close case is the closest evidence (as Proof takes it). */
const askRows = (ids: string[]) =>
  once(`rows:${ids.join(",")}`, async (): Promise<Record<string, ClosestRow> | null> => {
    try {
      const r = await fetch("/api/evidence", { method: "POST", cache: "no-store", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ op: "match", companyIds: ids }) });
      if (!r.ok) return null;
      const j = (await r.json()) as { rows?: Record<string, (ClosestRow & { caseId: string }) | null> };
      const out: Record<string, ClosestRow> = {};
      for (const [id, x] of Object.entries(j.rows ?? {}))
        if (x && (x.label === "Same" || x.label === "Close")) out[id] = { label: x.label, same: x.same ?? [], diff: x.diff ?? [], caseId: x.caseId, title: x.title, ...(x.outcome ? { outcome: x.outcome } : {}) };
      return out;
    } catch {
      return null;
    }
  });

/** Forget what this browser has, so the next look asks again (after a case is saved). */
export function refreshEvidence(): void {
  summary = null;
  clearClosest();
  gen++;
  ping();
}

/**
 * The closest case for each of `ids` (read them with closestOf), and the counts. `on`: the member
 * has Close; off it, nothing is asked. The number it returns changes whenever new rows arrive.
 */
export function useClosest(ids: readonly string[], on: boolean): { summary: Summary | null; ver: number } {
  const [ver, setVer] = useState(0);
  useEffect(() => {
    const f = () => setVer((v) => v + 1);
    subs.add(f);
    return () => void subs.delete(f);
  }, []);
  const key = on ? ids.join(",") : "";
  const g = gen;
  useEffect(() => {
    if (!on) return;
    void (async () => {
      if (!summary || Date.now() - summary.at >= SUMMARY_TTL) {
        const v = await askSummary();
        if (!v) return;
        summary = { v, at: Date.now() };
        ping();
      }
      const missing = ids.filter((id) => !closestKnown(id));
      if (!missing.length) return;
      // No ready case, or no Close: nothing is close, and nothing is asked.
      if (!summary.v.on || !summary.v.ready) return putClosest(missing, {}), ping();
      for (let k = 0; k < missing.length; k += BATCH) {
        const part = missing.slice(k, k + BATCH);
        const rows = await askRows(part);
        if (!rows) return;
        putClosest(part, rows);
      }
      ping();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, on, g]);
  return { summary: on ? summary?.v ?? null : null, ver };
}
