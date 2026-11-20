"use client";

/**
 * The member's own network (GET /api/integrations/google), read once per page load and shared by
 * every part that shows it: the Your network page, the record's "Your way in", Crystal Ball's chip,
 * the Google card on Integrations and onboarding's prompt. With RN_GOOGLE off the answer is
 * { on: false } and none of them render anything.
 */
import { useEffect, useState } from "react";
import type { NetCompanyView, NetworkAnswer, NetworkView } from "@/lib/google/types";

type Snap = { answer: NetworkAnswer | null; failed: boolean };
let snap: Snap = { answer: null, failed: false };
let loading: Promise<void> | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let polls = 0;
const subs = new Set<(s: Snap) => void>();
const emit = () => subs.forEach((f) => f(snap));

function set(answer: NetworkAnswer | null, failed = false) {
  snap = { answer, failed };
  emit();
  // While it reads the calendar, look again every few seconds (at most 2 minutes).
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  if (answer?.on && answer.syncing && polls < 40) {
    polls++;
    pollTimer = setTimeout(() => void load(true), 3000);
  } else polls = 0;
}

export function load(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = fetch("/api/integrations/google", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { view: NetworkAnswer }) => set(j.view))
    .catch(() => set(snap.answer, true))
    .finally(() => {
      loading = null;
    });
  return loading;
}

export type NetOp = "sync" | "disconnect" | "drop-gmail" | "forget-claude";
/** A button: the answer replaces the view. Returns the message or the error. */
export async function netAct(op: NetOp): Promise<{ message?: string; error?: string }> {
  try {
    const r = await fetch("/api/integrations/google", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op }) });
    const j = (await r.json().catch(() => ({}))) as { view?: NetworkAnswer; message?: string; error?: string };
    if (j.view) set(j.view);
    return r.ok ? { message: j.message } : { error: j.error || "That didn't go through. Try again." };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}

/** The network, or null while loading, signed out, or with the feature off (`off` says which). */
export function useNetwork(): { view: NetworkView | null; off: boolean; failed: boolean } {
  const [s, setS] = useState<Snap>(snap);
  useEffect(() => {
    subs.add(setS);
    if (!snap.answer && !loading) void load();
    return () => {
      subs.delete(setS);
    };
  }, []);
  const a = s.answer;
  return { view: a && a.on ? a : null, off: !!a && !a.on, failed: s.failed };
}

/** One company of the member's network, by its public id. */
export function useNetCompany(id: string | null | undefined): NetCompanyView | null {
  const { view } = useNetwork();
  return (id && view?.companies.find((c) => c.id === id)) || null;
}

/** ?google=connected|gmail|denied|scopes|failed from the callback: read when this file loads, shown once. */
export type GoogleNotice = "connected" | "gmail" | "denied" | "scopes" | "failed";
let notice: GoogleNotice | null = (() => {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("google");
  return v === "connected" || v === "gmail" || v === "denied" || v === "scopes" || v === "failed" ? v : null;
})();
export function takeNotice(): GoogleNotice | null {
  const n = notice;
  notice = null;
  if (n)
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("google");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    } catch {}
  return n;
}
export const NOTICE_WORDS: Record<GoogleNotice, string> = {
  connected: "Google is connected. Merlin is mapping who you know. It takes a minute or two.",
  gmail: "Gmail is added. Merlin is reading who you email with, headers only.",
  denied: "Nothing was connected. You picked Cancel at Google. Connect whenever you like.",
  scopes: "Nothing was connected. Merlin needs Calendar or Contacts ticked on Google's page to find who you know.",
  failed: "We couldn't connect Google, so nothing was saved. Try again in a moment.",
};

/** "9 days ago", "2 months ago", "today", from a YYYY-MM-DD. */
export function daysAgo(d: string | null | undefined, nowMs = Date.now()): string {
  if (!d) return "";
  const days = Math.round((nowMs - Date.parse(`${d}T12:00:00Z`)) / 86_400_000);
  if (days < 0) return days === -1 ? "tomorrow" : `in ${-days} days`;
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30.44);
  if (months < 18) return `${months} months ago`;
  return `${Math.round(months / 12)} years ago`;
}
export const monthYear = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 15)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};
export const firstName = (n: string | null) => (n ? n.trim().split(/\s+/)[0] : null);

/** "3 meetings · 23 emails" */
export function countsLine(x: { meetings: number; emails: number; upcoming?: number }): string {
  const parts: string[] = [];
  if (x.meetings) parts.push(`${x.meetings} ${x.meetings === 1 ? "meeting" : "meetings"}`);
  if (x.emails) parts.push(`${x.emails} ${x.emails === 1 ? "email" : "emails"}`);
  if (x.upcoming) parts.push(`${x.upcoming} coming up`);
  return parts.join(" · ");
}
