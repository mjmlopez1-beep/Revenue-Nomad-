"use client";

/**
 * Granola from the browser (/api/integrations/granola/*): the status, read once per page load and
 * shared by the Integrations card, its top-row chip and the call picker; Connect Granola (the
 * sign-in: a page load to Granola and back), connect a pasted key, disconnect, the calls and one
 * picked call's transcript. A key goes up once, on Connect, and never comes back; tokens never
 * reach the browser at all.
 */
import { useEffect, useState } from "react";
import type { CallsAnswer, GranolaStatus, GranolaTranscript } from "@/lib/granola/types";
import { errorText } from "../ui/shared";

const BASE = "/api/integrations/granola";
const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";

type Snap = { status: GranolaStatus | null; failed: boolean };
let snap: Snap = { status: null, failed: false };
let loading: Promise<void> | null = null;
const subs = new Set<(s: Snap) => void>();
const set = (status: GranolaStatus | null, failed = false) => {
  snap = { status, failed };
  subs.forEach((f) => f(snap));
};

export function loadGranola(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = fetch(`${BASE}/status`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { status: GranolaStatus }) => set(j.status))
    .catch(() => set(snap.status, true))
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** The member's Granola status, shared. Null while it loads. */
export function useGranola(): Snap {
  const [s, setS] = useState(snap);
  useEffect(() => {
    subs.add(setS);
    if (!snap.status && !loading) void loadGranola();
    setS(snap);
    return () => {
      subs.delete(setS);
    };
  }, []);
  return s;
}

export type Answer<T> = (T & { error?: undefined; code?: undefined }) | { error: string; code?: string };

async function ask<T>(path: string, init?: RequestInit): Promise<Answer<T>> {
  try {
    const r = await fetch(`${BASE}/${path}`, { cache: "no-store", ...init });
    const j = (await r.json().catch(() => ({}))) as T & { error?: string; code?: string };
    if (r.ok) return j as Answer<T>;
    return { error: errorText(r.status, j.error, "That didn't go through. Try again."), code: j.code };
  } catch {
    return { error: NETWORK, code: "network" };
  }
}
const post = <T,>(op: string, body: Record<string, unknown> = {}) => ask<T>(op, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

type StatusAnswer = { status: GranolaStatus; message: string };
export async function connectKey(key: string): Promise<Answer<StatusAnswer>> {
  const r = await post<StatusAnswer>("connect", { key });
  if (r.error === undefined) set(r.status);
  return r;
}
export async function disconnectKey(): Promise<Answer<StatusAnswer>> {
  const r = await post<StatusAnswer>("disconnect");
  if (r.error === undefined) set(r.status);
  return r;
}

export function fetchCalls(by: { company?: string | null; email?: string | null; recent?: boolean }, titles: boolean): Promise<Answer<CallsAnswer>> {
  const q = new URLSearchParams();
  if (by.company) q.set("company", by.company);
  else if (by.email) q.set("email", by.email);
  else q.set("recent", "1");
  if (titles) q.set("titles", "1");
  return ask<CallsAnswer>(`calls?${q}`);
}

export function fetchTranscript(noteId: string, titles: boolean): Promise<Answer<GranolaTranscript>> {
  const q = new URLSearchParams({ note: noteId });
  if (titles) q.set("titles", "1");
  return ask<GranolaTranscript>(`transcript?${q}`);
}

/**
 * Connect Granola: off to Granola's consent page, and back to this same page (`back`: a path in the
 * app, by default where the member is now) with ?granola=connected, denied, failed or unavailable.
 */
export function startGranola(back?: string): void {
  const here = back ?? `${window.location.pathname}${window.location.search}`;
  window.location.assign(`${BASE}/start?back=${encodeURIComponent(here)}`);
}

/** ?granola=connected|denied|failed|unavailable from the way back: read when this file loads, shown once by whichever Granola card is on screen first. */
export type GranolaNotice = "connected" | "denied" | "failed" | "unavailable";
export const GRANOLA_NOTICE_WORDS: Record<GranolaNotice, string> = {
  connected: "Granola connected. Pick a call when you start a proposal.",
  denied: "Nothing was connected. You said no at Granola. Connect whenever you like.",
  failed: "We couldn't connect Granola, so nothing was saved. Try again in a moment.",
  unavailable: "Connecting with Granola isn't available right now. Paste a Granola API key instead, or try again later.",
};
let notice: GranolaNotice | null = (() => {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("granola");
  return v === "connected" || v === "denied" || v === "failed" || v === "unavailable" ? v : null;
})();
/** The notice, once, and off the address. */
export function takeGranolaNotice(): GranolaNotice | null {
  const n = notice;
  notice = null;
  if (n)
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("granola");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    } catch {}
  return n;
}
/** Show the notice once, when a Granola card mounts. */
export function useGranolaNotice(show: (words: string, err: boolean) => void): void {
  useEffect(() => {
    const n = takeGranolaNotice();
    if (n) {
      show(GRANOLA_NOTICE_WORDS[n], n !== "connected");
      // The status changed at Granola's end: read it again.
      void loadGranola(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Tests and stories: set the shared status by hand. */
export const _granolaSnap = { set };
