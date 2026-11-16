"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** Live media query (client only; Trading Post renders after the first fetch). */
export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export type Layout = "phone" | "tablet" | "desktop";
/** phone < 768, tablet 768 to 1279 (filters as an overlay), desktop 1280 and up. */
export function useLayout(): Layout {
  const phone = useMedia("(max-width: 767px)");
  const desktop = useMedia("(min-width: 1280px)");
  return phone ? "phone" : desktop ? "desktop" : "tablet";
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Per-viewer conveniences only. Every access is guarded: storage can be blocked. */
export const store = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* private mode or blocked storage */
    }
  },
};

export function useStoredFlag(key: string): [boolean, () => void] {
  const [on, setOn] = useState(() => store.get(key) === "1");
  const set = useCallback(() => {
    store.set(key, "1");
    setOn(true);
  }, [key]);
  return [on, set];
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** "3:14 PM" for today, else "Tue 3:14 PM". */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return sameDay ? t : `${d.toLocaleDateString("en-US", { weekday: "short" })} ${t}`;
}

/**
 * When earning opens again, to finish "You can earn again ...": "at 3:14 PM", or "tomorrow at
 * 9:05 AM". The limit is a rolling 24 hours, so it is never further off than that.
 */
export function atTime(iso: string | null | undefined): string {
  if (!iso) return "within 24 hours";
  const d = new Date(iso);
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? `at ${t}` : `tomorrow at ${t}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A rate the benchmarks can't read. They need a monthly or an hourly figure (see readRate in lib/rates.ts). */
export const BENCH_RATE_HELP = "Use a monthly or hourly rate, like $8k/mo or $150/hr.";

/**
 * A field label in running text: each word lowercase, except words with a capital inside
 * (HQ, LinkedIn). "Person LinkedIn" reads "person LinkedIn". Same rule as lower() in lib/table.ts.
 */
export const fieldText = (f: string) =>
  f
    .split(" ")
    .map((w) => (/[A-Z]/.test(w.slice(1)) ? w : w.toLowerCase()))
    .join(" ");

/** This month as YYYY-MM (the max for month inputs). */
export const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
