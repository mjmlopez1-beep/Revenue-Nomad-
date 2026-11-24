/**
 * The call picker's logic, without React (GranolaCallPicker.tsx, ProposalStart.tsx; checked by
 * scripts/test-call-picker.mts):
 *
 *   callSearch     one list request at a time: a search waits SEARCH_WAIT_MS after the last change,
 *                  the same question twice is asked once, a newer question cancels the older request
 *                  (AbortController) and an answer that comes back late is dropped.
 *   callQueryKey   the question as one string (who, and whether titles show).
 *   withPicked     the list as shown: the picked call stays in it whatever the list says now.
 *   companyForCall the company a call was with: an attendee's work domain matched to a company the
 *                  member can see on Merlin (never a locked one), so Draft it needs no typing.
 */
import type { CoInfo } from "./model";

export const SEARCH_WAIT_MS = 400;

export type CallQuery = { company?: string | null; email?: string | null; recent?: boolean };

/** A whole email address (the search runs on nothing less). */
export const WHOLE_EMAIL = /^[^\s@<>()",;]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

export const callQueryKey = (b: CallQuery, titles: boolean) =>
  `${b.company ? `company:${b.company}` : b.email ? `email:${b.email.trim().toLowerCase()}` : "recent"}${titles ? "|titles" : ""}`;

type Timer = ReturnType<typeof setTimeout>;
export interface CallSearch<T> {
  /** Ask this question: after the wait, or at once with `now`. The same question again is skipped. */
  want(key: string, o?: { now?: boolean }): void;
  /** Ask the current question again (Try again). */
  retry(): void;
  /** Stop: no pending wait, the request in flight cancelled, its answer dropped. */
  stop(): void;
  /** The question asked last, or waiting. */
  readonly current: string | null;
}

export function callSearch<T>(o: {
  ask: (key: string, signal: AbortSignal) => Promise<T>;
  onStart?: (key: string) => void;
  onAnswer: (key: string, a: T) => void;
  waitMs?: number;
  timers?: { set: (f: () => void, ms: number) => Timer; clear: (t: Timer) => void };
}): CallSearch<T> {
  const wait = o.waitMs ?? SEARCH_WAIT_MS;
  const timers = o.timers ?? { set: (f: () => void, ms: number) => setTimeout(f, ms), clear: (t: Timer) => clearTimeout(t) };
  let current: string | null = null;
  let answered: string | null = null;
  let timer: Timer | null = null;
  let ctl: AbortController | null = null;
  let seq = 0;
  const clearWait = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };
  const fire = (key: string) => {
    clearWait();
    ctl?.abort();
    const mine = ++seq;
    const c = (ctl = new AbortController());
    answered = null;
    o.onStart?.(key);
    o.ask(key, c.signal).then(
      (a) => {
        if (mine !== seq || c.signal.aborted) return;
        answered = key;
        ctl = null;
        o.onAnswer(key, a);
      },
      () => {},
    );
  };
  return {
    want(key, w = {}) {
      if (key === current) {
        if (w.now && timer !== null) fire(key);
        return;
      }
      current = key;
      // Back to the question already on screen: nothing to ask.
      if (key === answered && !ctl) return clearWait();
      if (w.now) return fire(key);
      clearWait();
      timer = timers.set(() => {
        timer = null;
        fire(key);
      }, wait);
    },
    retry() {
      if (current) fire(current);
    },
    stop() {
      clearWait();
      ctl?.abort();
      ctl = null;
      seq++;
      current = answered = null;
    },
    get current() {
      return current;
    },
  };
}

/** The calls as shown: the one picked stays (first) even when the list now on screen doesn't have it. */
export function withPicked<C extends { noteId: string }>(calls: C[], picked: C | null | undefined, pickedId: string | null | undefined): C[] {
  if (!picked || !pickedId || picked.noteId !== pickedId || calls.some((c) => c.noteId === pickedId)) return calls;
  return [picked, ...calls];
}

const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "fastmail.com"]);
const domainOfEmail = (e: string | null | undefined) => /^[^\s@]+@([a-z0-9-]+(\.[a-z0-9-]+)+)$/i.exec(String(e ?? "").trim())?.[1].toLowerCase() ?? null;
const hostOf = (d: string | null | undefined) => String(d ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0] || null;

/**
 * The company on Merlin a call was with, from who was on it: the first attendee (in the order
 * given; the picker lists the matching ones first) whose work domain is, or sits under, the website
 * of exactly one company the member can see. Free mail, the member's own domain and locked
 * companies never match. Null when nothing fits.
 */
export function companyForCall(attendees: { email?: string | null }[], infos: CoInfo[], me: { email?: string | null }): CoInfo | null {
  const mine = domainOfEmail(me.email);
  const byHost = new Map<string, CoInfo[]>();
  for (const i of infos) {
    if (i.c.hidden || !i.c.name) continue;
    const h = hostOf(i.domain);
    if (!h || !h.includes(".")) continue;
    byHost.set(h, [...(byHost.get(h) ?? []), i]);
  }
  for (const a of attendees) {
    const d = domainOfEmail(a.email);
    if (!d || FREE_MAIL.has(d) || d === mine) continue;
    let hit = byHost.get(d);
    if (!hit) {
      // eu.cedarpine.example is Cedar and Pine (cedarpine.example): the longest website that fits.
      const up = [...byHost.keys()].filter((h) => d.endsWith(`.${h}`)).sort((x, y) => y.length - x.length)[0];
      hit = up ? byHost.get(up) : undefined;
    }
    if (hit?.length === 1) return hit[0];
  }
  return null;
}
