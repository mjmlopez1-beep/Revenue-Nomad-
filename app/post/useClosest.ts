"use client";

/**
 * Evidence Bank's closest cases for the companies on screen (workbench/closest.ts), and the
 * member's case counts (Getting started's step 6), fetched from GET /api/evidence/closest only on
 * Close (Evidence Bank is a Close feature). Each company is asked once a couple of minutes, in
 * batches of 200; a page re-renders when its rows arrive.
 */
import { useEffect, useState } from "react";
import type { ClosestView } from "@/lib/evidenceWire";
import { clearClosest, closestKnown, putClosest } from "./workbench/closest";

const BATCH = 200;
type Summary = Pick<ClosestView, "on" | "ready" | "drafts">;
let summary: { v: Summary; at: number } | null = null;
const SUMMARY_TTL = 60_000;
const subs = new Set<() => void>();
/** Goes up when what this browser has is forgotten: every page on screen asks again. */
let gen = 0;
const ping = () => subs.forEach((f) => f());

const flying = new Map<string, Promise<ClosestView | null>>();
/** One request for the same companies at a time (several parts of a page ask together). */
function ask(ids: string[]): Promise<ClosestView | null> {
  const k = ids.join(",");
  let q = flying.get(k);
  if (!q) {
    q = askNow(ids).finally(() => flying.delete(k));
    flying.set(k, q);
  }
  return q;
}
async function askNow(ids: string[]): Promise<ClosestView | null> {
  try {
    const r = await fetch(`/api/evidence/closest${ids.length ? `?ids=${encodeURIComponent(ids.join(","))}` : ""}`, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as ClosestView;
  } catch {
    return null;
  }
}

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
      const missing = ids.filter((id) => !closestKnown(id));
      const now = Date.now();
      if (!missing.length && summary && now - summary.at < SUMMARY_TTL) return;
      for (let k = 0; k < Math.max(1, missing.length); k += BATCH) {
        const part = missing.slice(k, k + BATCH);
        const v = await ask(part);
        if (!v) return;
        putClosest(part, v.rows);
        summary = { v: { on: v.on, ready: v.ready, drafts: v.drafts }, at: Date.now() };
      }
      ping();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, on, g]);
  return { summary: on ? summary?.v ?? null : null, ver };
}
