"use client";

/**
 * "What this page is for": the one-line strip at the top of a page on the member's first visit
 * there (BUILD_PLAN F6, firstVisit.ts). It says what the page is for and the two or three things
 * you do on it, with at most one action, and it can be dismissed: the dismissal is kept on the
 * server (Profile.stripsOff), so a second device agrees.
 *
 *   <PageStrip page="companies" own={opened} />            the page's own count of the member's data
 *   <PageStrip page="find" />                              what Me and the view say (firstVisit.ts ownOf)
 *   <PageStrip page="home" actions={<button …/>}>…</PageStrip>   its own words and an action
 *
 * Draws nothing outside the new look, on a page that has the member's data, or once dismissed.
 */
import type { ReactNode } from "react";
import { IconX } from "../../ui/shared";
import { firstOf, ownOf } from "../firstVisit";
import { useAppMaybe } from "./pages";
import "./shell.css";

export function PageStrip({ page, own, children, actions, title = "What this page is for." }: { page: string; own?: number | null; children?: ReactNode; actions?: ReactNode; title?: string }) {
  const c = useAppMaybe();
  if (!c || !c.ui2) return null;
  const n = own !== undefined ? own : ownOf(page, c.me, c.view, { seats: c.shell.seats.length });
  const f = firstOf(page, n, [...(c.me.stripsOff ?? [])]);
  if (!f.strip || c.start.stripOff(page)) return null;
  return (
    <section className="ws-strip" aria-label="About this page">
      <span className="ws-strip-t">
        <strong>{title}</strong> {children ?? f.strip}
      </span>
      {actions && <span className="ws-strip-acts">{actions}</span>}
      <button type="button" className="ws-strip-x" aria-label="Dismiss" onClick={() => c.start.dismissStrip(page)}>
        <IconX size={16} />
      </button>
    </section>
  );
}
