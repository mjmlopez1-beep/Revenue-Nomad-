"use client";

/**
 * Approve, then send, in the app (lib/send): the member's outbox from GET /api/send, read once per
 * page and shared by every draft on screen. With RN_SEND off the route answers { view: null }, the store says
 * "off", and no button, line or field of it draws: every page reads as it did.
 *
 * Every POST carries the app's header (x-rn-tap) and goes from this page's own origin: the server
 * refuses anything else, an agent's bearer token included.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { ApproveInput, SendItemView, SendView } from "@/lib/send/types";

type Status = "idle" | "loading" | "off" | "on";
interface Snap {
  status: Status;
  view: SendView | null;
}
let snap: Snap = { status: "idle", view: null };
const subs = new Set<() => void>();
const set = (n: Snap) => {
  snap = n;
  subs.forEach((f) => f());
};

export function loadSend(force = false) {
  if (typeof window === "undefined") return;
  if (!force && snap.status !== "idle") return;
  if (snap.status === "idle") snap = { ...snap, status: "loading" };
  void fetch("/api/send", { cache: "no-store" })
    .then(async (r) => {
      if (r.status === 404) return set({ status: "off", view: null });
      const j = (await r.json().catch(() => null)) as { view?: SendView | null } | null;
      if (r.ok && j && j.view === null) return set({ status: "off", view: null });
      if (r.ok && j?.view) set({ status: "on", view: j.view });
      else if (snap.status !== "on") set({ status: "off", view: null });
    })
    .catch(() => {
      if (snap.status === "loading") set({ status: "idle", view: null });
    });
}

const sub = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};
/** The outbox as this page has it. `on` is true only when the server said sending is on. */
export function useSend(): Snap & { on: boolean } {
  const s = useSyncExternalStore(sub, () => snap, () => snap);
  useEffect(() => loadSend(), []);
  return { ...s, on: s.status === "on" };
}
export const sendSnap = () => snap;

async function post<T>(body: unknown): Promise<{ ok: true; j: T } | { ok: false; error: string }> {
  try {
    const r = await fetch("/api/send", { method: "POST", headers: { "content-type": "application/json", "x-rn-tap": "1" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as T & { error?: string; view?: SendView };
    if (!r.ok) return { ok: false, error: j.error || "That didn't go through. Try again." };
    if (j.view) set({ status: "on", view: j.view });
    return { ok: true, j };
  } catch {
    return { ok: false, error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}

export type ApproveResult = { ok: true; item: SendItemView; grant: string | null; again: boolean } | { ok: false; error: string };
export async function approveDraft(d: ApproveInput): Promise<ApproveResult> {
  const r = await post<{ item: SendItemView; grant: string | null; again: boolean }>({ op: "approve", draft: d });
  return r.ok ? { ok: true, item: r.j.item, grant: r.j.grant, again: r.j.again } : r;
}
export async function cancelSend(id: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const r = await post<{ message: string }>({ op: "cancel", id });
  return r.ok ? { ok: true, message: r.j.message } : r;
}
export async function dismissSend(id: string) {
  await post({ op: "dismiss", id });
}
/** Stop Merlin sending from this Gmail: the permission is removed at Google too. */
export async function stopSending(): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const r = await post<{ message: string }>({ op: "revoke" });
  return r.ok ? { ok: true, message: r.j.message } : r;
}

/* ---------- after a tap: the toast, then "Sent from your Gmail" ---------- */

type Toaster = (text: string, err?: boolean, opts?: { action?: { label: string; onClick: () => void }; ms?: number }) => void;
let toaster: Toaster | null = null;
/** The shell's host (SendHost) gives the store its toast. */
export const setToaster = (t: Toaster | null) => void (toaster = t);
export const SENT_EVENT = "rn:send-sent";

const watching = new Set<string>();
/** What a page does once its note went (a plan's step, a list refreshed): kept here, so it runs even after the sheet closed. */
const after = new Map<string, (it: SendItemView) => void>();
export function whenSent(id: string, fn: (it: SendItemView) => void) {
  after.set(id, fn);
}
/** Look again when the note should have gone; say Sent from your Gmail (or why not), and tell the page. */
export function watchSent(id: string, atIso: string | null) {
  if (watching.has(id)) return;
  watching.add(id);
  let tries = 0;
  const look = () => {
    tries++;
    void fetch("/api/send", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ view?: SendView }>) : null))
      .then((j) => {
        if (j?.view) set({ status: "on", view: j.view });
        const it = j?.view?.items.find((x) => x.id === id);
        if (!it || it.status === "cancelled") return void (watching.delete(id), after.delete(id));
        if (it.status === "sent") {
          watching.delete(id);
          toaster?.(`Sent from your Gmail${it.toName ? ` to ${it.toName.split(/\s+/)[0]}` : ""}.`);
          window.dispatchEvent(new CustomEvent(SENT_EVENT, { detail: { id, company: it.company, pipelineId: it.pipelineId, key: it.key } }));
          const fn = after.get(id);
          after.delete(id);
          try {
            fn?.(it);
          } catch {
            /* the page's own follow-on; the note went either way */
          }
          return;
        }
        if (it.status === "held" || it.status === "failed" || it.status === "replied") {
          watching.delete(id);
          return toaster?.(it.note ?? "It wasn't sent.", it.status !== "replied");
        }
        if (it.status === "scheduled" || tries > 12) return void watching.delete(id);
        setTimeout(look, 2500);
      })
      .catch(() => (tries > 12 ? watching.delete(id) : setTimeout(look, 4000)));
  };
  const wait = Math.max(500, (atIso ? Date.parse(atIso) : Date.now()) - Date.now() + 1500);
  setTimeout(look, wait);
}
