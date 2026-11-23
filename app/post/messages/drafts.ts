"use client";

/**
 * The composer's drafts, one per conversation (and one for a new message), kept in this browser
 * only: an unsent draft is a convenience for the member at this screen, never sent to the server,
 * never seen by anyone else. Keyed by the member, so a second member on the same browser does not
 * see them. Every read and write is wrapped: a private window or blocked storage just keeps the
 * draft for as long as the page is open.
 */
import { useCallback, useSyncExternalStore } from "react";

export interface Draft {
  text: string;
  /** Merlin drafted it (the "Drafted by Merlin" line shows while the text is as Merlin wrote it or edited from it). */
  merlin: "template" | "ai" | null;
  /** Still as Merlin wrote it: a new name or reason drafts it again. Typing makes it the member's. */
  auto?: boolean;
  at: number;
}
type Drafts = Record<string, Draft>;

const KEEP_DAYS = 30;
const MAX = 60;
const keyOf = (memberId: string) => `rn-msg-drafts:${memberId}`;
let mem: { member: string; all: Drafts } | null = null;
const subs = new Set<() => void>();

function read(member: string): Drafts {
  if (mem?.member === member) return mem.all;
  let all: Drafts = {};
  try {
    const raw = window.localStorage.getItem(keyOf(member));
    const j = raw ? JSON.parse(raw) : {};
    if (j && typeof j === "object") all = j as Drafts;
  } catch {}
  const cut = Date.now() - KEEP_DAYS * 86_400_000;
  for (const [k, d] of Object.entries(all)) if (!d || typeof d.text !== "string" || !(d.at > cut)) delete all[k];
  mem = { member, all };
  return all;
}
function write(member: string, all: Drafts) {
  // The newest MAX only.
  const keep = Object.entries(all)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX);
  const next = Object.fromEntries(keep);
  mem = { member, all: next };
  try {
    window.localStorage.setItem(keyOf(member), JSON.stringify(next));
  } catch {}
  subs.forEach((f) => f());
}

export function setDraft(member: string, key: string, d: Omit<Draft, "at"> | null) {
  const all = { ...read(member) };
  if (!d || !d.text.trim()) delete all[key];
  else all[key] = { ...d, at: Date.now() };
  write(member, all);
}

const sub = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

/** Every draft the member keeps here, by conversation id ("new" for a new message). */
const EMPTY: Drafts = {};
const empty = () => EMPTY;
export function useDrafts(member: string): Drafts {
  const get = useCallback(() => (typeof window === "undefined" ? EMPTY : read(member)), [member]);
  return useSyncExternalStore(sub, get, empty);
}
