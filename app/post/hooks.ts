"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * A function that keeps one identity for the life of the component and always runs the
 * newest version of `fn`. Memoized rows and the Ui context can hold it without re-rendering,
 * and it never keeps an old render's view alive (callbacks that close over older callbacks
 * chain old tables together in memory).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useStable<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback(((...args: Parameters<T>) => ref.current(...args)) as T, []);
}

/** Live media query (client only; Merlin renders after the first fetch). */
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
/**
 * The phone layout: narrower than 768, or a touch screen under 600 tall (a phone on its side,
 * where the table's small targets and a popover taller than the screen don't work). Same test
 * as the phone rules in post.css.
 */
export const PHONE_QUERY = "(max-width: 767px), (pointer: coarse) and (max-height: 599px)";
/** phone (see PHONE_QUERY), tablet 768 to 1279 (filters as an overlay), desktop 1280 and up. */
export function useLayout(): Layout {
  const phone = useMedia(PHONE_QUERY);
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

/** A rate the benchmarks can't read, with the forms that work (lib/rates.ts, the one reader). */
export { BENCH_RATE_HELP } from "@/lib/rates";

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
