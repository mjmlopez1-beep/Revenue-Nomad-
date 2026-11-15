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

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A field label in running text: lowercase, except labels with inner capitals (HQ, LinkedIn). Same rule as lower() in lib/table.ts. */
export const fieldText = (f: string) => (/[A-Z]/.test(f.slice(1)) ? f : f.toLowerCase());

/** This month as YYYY-MM (the max for month inputs). */
export const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
