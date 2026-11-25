"use client";

/**
 * The new design's top bar is the shell's (TradingPost draws it), but the page on screen says what
 * its breadcrumb is: the new design's own pages through useUi3Head, and today's pages through their
 * ShellHeader, which hands its crumbs to the new top bar while the new design is on (Ui3HeaderCtx).
 * No styles or new-design code here, so the current look loads nothing of it.
 */
import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { Crumb } from "../shell/Header";

export interface Ui3Head {
  crumbs: Crumb[];
  title: string;
}

/** Set by TradingPost while the new design is on: a page's own breadcrumb, and the top bar for a page that draws its own header. */
export interface Ui3HeaderApi {
  setHead: (h: Ui3Head | null) => void;
  /** The new top bar with these crumbs (today's pages' ShellHeader draws this in place of its own). */
  top: (h: Ui3Head & { search?: ReactNode; actions?: ReactNode; hosts?: ReactNode }) => ReactNode;
  phone: boolean;
}

export const Ui3HeaderCtx = createContext<Ui3HeaderApi | null>(null);
export const useUi3Header = () => useContext(Ui3HeaderCtx);

/** A new-design page's breadcrumb, for the shell's top bar. */
export function useUi3Head(crumbs: Crumb[], title: string) {
  const api = useUi3Header();
  const key = JSON.stringify([crumbs.map((c) => c.label), title]);
  useEffect(() => {
    api?.setHead({ crumbs, title });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key]);
  useEffect(() => () => api?.setHead(null), [api]);
}

/** The new design's own pages, by key, and which are built (the rest draw today's page inside the new shell). */
export type Ui3PageKey = "home" | "crystal" | "targets" | "company" | "network" | "warm";
export const UI3_BUILT: readonly Ui3PageKey[] = ["home", "crystal", "targets", "company", "network"];
