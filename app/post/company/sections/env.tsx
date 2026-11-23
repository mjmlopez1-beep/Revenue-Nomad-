"use client";

/**
 * What the whole record shares: who is looking and how (RecordEnv), Esc for something open inside the record, and the small rules every section uses.
 * Moved out of Drawer.tsx: the record drawer (phones, RN_UI2 off) and the company page (company/CompanyPage.tsx) both draw these.
 */
import { createContext, useContext, useEffect, useRef } from "react";
import type { EngagementRec, PersonRec, View } from "@/lib/tableTypes";
import { COMPANY_PRICE_SAY, FRACTIONAL_TYPES } from "@/lib/tableFields";
import { COMPANY_GTM, isOpenSeat, shown, type CoInfo, type FactRef } from "../../model";
import { earnNote, type Ui } from "../../ui";
import { fmtStamp } from "../../RoleDate";
import { atTime, plural } from "../../hooks";

/** Where members reach Revenue Nomad (View.contact, read from the server at run time). */
export type Contact = NonNullable<View["contact"]>;

/* ---------- what the whole record shares ---------- */

export interface DrawerEnv {
  /** Touch screen: facts open the fact sheet instead of showing Confirm and Report on hover. */
  touch: boolean;
  phone: boolean;
  contact: Contact | null;
  company: string;
  hidden: boolean;
  /** Company pick lists earn here without the daily limit of 5 (see pickExempt). */
  exempt: boolean;
  /** The company's id, and whether it is named for one search only (CompanyRec.found): writing to its seat holders unlocks it first. */
  companyId?: string;
  found?: boolean;
}
export const EnvCtx = createContext<DrawerEnv>({ touch: false, phone: false, contact: null, company: "", hidden: false, exempt: false });
export const useEnv = () => useContext(EnvCtx);

/** An overlay sits above the record (a popover, the fact editor, a sheet or the Add modal): Esc is its to take. */
export const overlayAbove = () => !!document.querySelector(".tp-pop, .tp-modal-wrap, .tp-sheet-wrap");

/**
 * Esc for something open inside the record (a form, a confirm step, the fact sheet). It runs
 * before the app's own handler, which would close the whole record. `sheet`: this is a sheet
 * itself, so it takes Esc while it is the top one.
 */
export function useEscape(active: boolean, onEsc: () => void, sheet?: { current: HTMLElement | null }) {
  const ref = useRef(onEsc);
  ref.current = onEsc;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (sheet) {
        const wraps = document.querySelectorAll(".tp-sheet-wrap");
        const top = wraps[wraps.length - 1];
        if (document.querySelector(".tp-pop, .tp-modal-wrap") || !top || !sheet.current || !top.contains(sheet.current)) return;
      } else if (overlayAbove()) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      ref.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, sheet]);
}

/* ---------- small pieces ---------- */

/** "a", "a and b", "a, b and c". */
export const listOf = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
export const seatsTitle = (n: number | undefined) => (n ? `${plural(n, "seat")} on file` : undefined);
/** Where a company's seats came from, as it reads after "From" in the record's last line. */
export const SOURCE_SAY: Record<string, string> = {
  "Published engagement": "seats members published",
  "Member success story": "member stories",
  "Demand scan": "job postings",
  "Member added": "what members added",
  Clay: "Revenue Nomad research",
  "Seat scan": "Revenue Nomad research",
};
/** A role still open: the scan follows it and it has not closed, or it is marked Open role. */
export const openRole = (e: EngagementRec) => (e.opened ? !e.closed : isOpenSeat(e));
/** Company pick lists that share the 5 a day that earn (Me.sellEarnLeft). */
export const SELL_PICKS = ["industry", "employees", "revenue", "ownership", ...COMPANY_GTM];
export const SELL_NOTE = "Only 5 answers a day for a company's industry, size, revenue or how they sell earn a credit. You can still add them.";
/** The day a role closed, in the viewer's time zone. */
export const closedOn = (e: EngagementRec) => (e.closedAt ? fmtStamp(e.closedAt) : e.closed ? fmtStamp(`${e.closed}T12:00:00`) : "");

/** Company pick lists earn without the 5 a day at a company the member created (CompanyRec.added) or holds a seat at. */
export const pickExempt = (i: CoInfo) => !!i.c.added || i.engs.some((e) => e.yours);

/** Whether adding this fact earns a credit right now (today's cap, and the 5 a day for company pick lists). */
export function earnsNow(ui: Ui, env: { exempt: boolean }, t: FactRef) {
  if (earnNote(ui.me).capped) return false;
  if (t.entity === "company" && SELL_PICKS.includes(t.field) && !env.exempt) return (ui.me.sellEarnLeft ?? 1) > 0;
  return true;
}

/** How many of these empty facts would earn a credit today. */
export function earnable(ui: Ui, env: { exempt: boolean }, t: FactRef[]) {
  const room = Math.max(0, ui.me.earnCap - ui.me.earned24h);
  const picks = t.filter((x) => x.entity === "company" && SELL_PICKS.includes(x.field)).length;
  const sellLeft = env.exempt ? Infinity : ui.me.sellEarnLeft ?? Infinity;
  return Math.min(room, t.length - picks + Math.min(picks, sellLeft));
}

/** A link that can't be built (a value stored with half a character) is left out, not thrown. */
export function safeHref(build: () => string): string | null {
  try {
    return build();
  } catch {
    return null;
  }
}

/** Their email, when a person on file here has the seat holder's name and the member can see that email (Email it on Invite to connect). */
export const nameKey = (v: string) => v.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
export function emailOnFile(people: PersonRec[], name: string): string | null {
  const k = nameKey(name);
  for (const p of people) {
    const n = p.cells.name;
    const m = p.cells.email;
    if (n?.s === "value" && nameKey(n.v) === k && m?.s === "value") return m.v;
  }
  return null;
}


export const firstOfName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** What adding these earns today, in one sentence. */
export function earnLine(ui: Ui, env: { exempt: boolean }, t: FactRef[]): string {
  if (earnNote(ui.me).capped) return `You've earned today's ${ui.me.earnCap} credits, so adding these earns nothing. You can earn again ${atTime(ui.me.earnResetsAt)}.`;
  const n = earnable(ui, env, t);
  if (n === 0) return SELL_NOTE;
  if (n === t.length) return n === 1 ? "Add it and you earn a credit." : "Each one you add earns a credit.";
  return `Add these and earn up to ${plural(n, "credit")}.`;
}

export const COMPANY_ROWS = ["website", "linkedin", "industry", "employees", "revenue", "ownership", "hq"];
export const UNLOCK_COMPANY = `Unlock company · ${COMPANY_PRICE_SAY}`;
/**
 * What a seat counts as, by the same rule as the server's friendliness() (the header's "N
 * fractional seats" and the Fit tier): a fractional hire, an open role, or neither (a member
 * story about a full-time hire, or a posting that came down with nobody named).
 */
export function seatKind(e: EngagementRec): "hire" | "open" | "story" {
  if (openRole(e)) return "open";
  if (e.source === "Demand scan" && e.cells.operator?.s === "empty") return "story";
  const type = shown(e.cells.type);
  if (!type || FRACTIONAL_TYPES.includes(type)) return "hire";
  return "story";
}
/** "2 fractional seats and 2 from member stories, which aren't counted as fractional hires." */
export function seatSplit(engs: EngagementRec[]): string {
  const n = (k: string) => engs.filter((e) => seatKind(e) === k).length;
  const hires = n("hire");
  const open = n("open");
  const story = n("story");
  if (story === engs.length)
    return story === 1
      ? "This seat was a full-time hire or a posting that came down with nobody named. It isn't counted as a fractional hire."
      : "These seats were full-time hires or postings that came down with nobody named. They aren't counted as fractional hires.";
  const parts = [...(hires ? [plural(hires, "fractional seat")] : []), ...(open ? [plural(open, "open role")] : []), `${story} full-time or closed ${story === 1 ? "posting" : "postings"}`];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}. Those aren't counted as fractional hires.`;
}
/** An open role here has a posted rate behind the lock (a locked cell always has a value). The unlock names the rate only then. */
export const hasPostedRate = (i: CoInfo) => i.engs.some((e) => openRole(e) && (e.cells.rate?.s === "locked" || e.cells.rate?.s === "value"));
export const UNLOCK_ROLE_SHORT = UNLOCK_COMPANY;
export const UNLOCK_ROLE_SAY = `Unlock company for ${COMPANY_PRICE_SAY}`;
