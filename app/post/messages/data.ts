"use client";

/**
 * What both looks of Messages share (Messages.tsx, the old look and the records' sheets; and
 * messages/Messages2.tsx, the new look's three columns): the list from GET /api/table?messages=1
 * kept fresh, the actions (message.*), the unread count for the rail, the tab bar and the bell,
 * the conversation to open first, and how a time reads.
 */
import { useCallback, useEffect, useState } from "react";
import type { ConversationRec } from "@/lib/tableTypes";
import type { Me } from "@/lib/tableTypes";
import { errorText, post } from "../../ui/shared";
import { COMPANY_PRICE, COMPANY_PRICE_SAY } from "@/lib/tableFields";
import { freeCompanyNow } from "../display";
import type { FactRef } from "../model";

/* ---------- the unread count ---------- */

/** Sent on window when the unread count changes here (a conversation was read), so the badges follow at once. */
const UNREAD_EVENT = "tp-unread";
export const tellUnread = (n: number) => window.dispatchEvent(new CustomEvent(UNREAD_EVENT, { detail: n }));

/**
 * Conversations with something unread: the view's count, kept fresh by a light check every
 * minute while the tab is in view, and at once when Messages reads one.
 */
export function useUnread(fromView: number | undefined): number {
  const [n, setN] = useState(fromView ?? 0);
  useEffect(() => setN(fromView ?? 0), [fromView]);
  useEffect(() => {
    const on = (e: Event) => setN(Number((e as CustomEvent).detail) || 0);
    window.addEventListener(UNREAD_EVENT, on);
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/table?unread=1", { cache: "no-store" });
        const j = await r.json();
        if (r.ok && typeof j.unread === "number") setN(j.unread);
      } catch {}
    };
    const t = setInterval(tick, 60_000);
    return () => {
      clearInterval(t);
      window.removeEventListener(UNREAD_EVENT, on);
    };
  }, []);
  return n;
}

export function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}

/* ---------- data ---------- */

export type Act = { type: string; [k: string]: unknown };
export type ActAnswer = { message?: string; conversation?: ConversationRec; unread?: number; error?: string };
export const send = (action: Act) => post<ActAnswer>({ action });

/**
 * The viewer's conversations, kept for a short while so a record can say "Open conversation"
 * instead of offering a second opener. The Messages page refreshes it whenever it loads.
 */
export let known: { at: number; list: ConversationRec[] } | null = null;
let loading: Promise<ConversationRec[] | null> | null = null;
const KNOWN_FRESH = 30_000;
export const KNOWN_EVENT = "tp-conversations";
export function remember(list: ConversationRec[]) {
  known = { at: Date.now(), list };
  window.dispatchEvent(new CustomEvent(KNOWN_EVENT));
}
export function rememberOne(c: ConversationRec) {
  remember([c, ...(known?.list ?? []).filter((x) => x.id !== c.id)]);
}
export async function loadKnown(): Promise<ConversationRec[] | null> {
  if (known && Date.now() - known.at < KNOWN_FRESH) return known.list;
  loading ??= (async () => {
    try {
      const r = await fetch("/api/table?messages=1", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) return null;
      remember(j.conversations ?? []);
      return known!.list;
    } catch {
      return null;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** The conversation about this seat, if the viewer has one (null while unknown or when there is none). */
export function useConversationAbout(engagementId: string): ConversationRec | null {
  const pick = () => known?.list.find((c) => c.about.engagementId === engagementId) ?? null;
  const [c, setC] = useState<ConversationRec | null>(pick);
  useEffect(() => {
    let live = true;
    const on = () => live && setC(pick());
    window.addEventListener(KNOWN_EVENT, on);
    void loadKnown().then(on);
    return () => {
      live = false;
      window.removeEventListener(KNOWN_EVENT, on);
    };
  }, [engagementId]); // eslint-disable-line react-hooks/exhaustive-deps
  return c;
}

/**
 * Write to a seat holder who is a member, from outside the compose sheet (a move's drafted note,
 * MoveNote.tsx): the same action as "Message Ana" (message.start), so it goes into the conversation
 * about that seat when there is one already. The conversation is remembered for "Open conversation".
 */
export async function startSeatMessage(engagementId: string, text: string): Promise<ActAnswer> {
  const r = await send({ type: "message.start", engagementId, text });
  if (!r.error && r.conversation) rememberOne(r.conversation);
  return r;
}

/** A conversation the Messages page should open first (from "Open conversation" on a record). */
let openNext: string | null = null;
/** Open Messages at one conversation. */
export function openConversation(openPage: (p: "messages") => void, id: string) {
  openNext = id;
  openPage("messages");
}

export function useConversations() {
  const [list, setList] = useState<ConversationRec[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/table?messages=1", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) return setFailed(errorText(r.status, j?.error, "Messages didn't load. Try again."));
      setFailed(null);
      setList(j.conversations ?? []);
      remember(j.conversations ?? []);
      if (typeof j.unread === "number") tellUnread(j.unread);
    } catch {
      setFailed("We couldn't reach Merlin. Check your connection and try again.");
    }
  }, []);
  useEffect(() => {
    void load();
    // New replies show up while the page is open, without a reload.
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);
  /** Put one conversation's new state in the list (the answer to an action). */
  const put = useCallback((c: ConversationRec) => {
    rememberOne(c);
    setList((l) => {
      const rest = (l ?? []).filter((x) => x.id !== c.id);
      return [c, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }, []);
  return { list, failed, load, put };
}

/** The conversation id in the address bar (?m=), from a message email's link. Read once, when the page opens. */
export function readM(): string | null {
  if (openNext) {
    const id = openNext;
    openNext = null;
    return id;
  }
  try {
    return new URLSearchParams(window.location.search).get("m");
  } catch {
    return null;
  }
}

/** The server's refusal when who held a seat is still locked for the member (lib/messages.ts message.start). */
export const SEAT_LOCKED_FIRST = /^Unlock who held this seat first/;
/** "Unlock and send"'s price: a company free on a free open, else its price; any other fact 1 credit. */
/** The same in credits: what the one question before Unlock and send asks for. */
export const unlockSendCost = (me: Me, t: FactRef): number => (t.field === "identity" ? (freeCompanyNow(me) ? 0 : COMPANY_PRICE) : 1);
export function unlockSendPrice(me: Me, t: FactRef): string {
  if (t.field === "identity") return freeCompanyNow(me) ? "free" : COMPANY_PRICE_SAY;
  return "1 credit";
}

