/**
 * The new look ("Merlin Workspace", BUILD_PLAN F0) behind one flag, RN_UI2:
 *
 *   off     the default: the app is exactly as it was, and nothing below reaches a member
 *   optin   a member turns it on (and off) in the member menu: "Try the new Merlin", "Back to the old look"
 *   on      every member gets it
 *
 * The member's choice is Profile.ui2 (lib/table.ts), so a second device agrees. Me carries the
 * outcome (Me.ui2, and Me.ui2Optin while the menu offers the switch); View.ui2 says the same for
 * the view as a whole. With the flag off none of these fields is sent at all.
 *
 * Also here: the page strips a member dismissed ("what this page is for", F6), Profile.stripsOff,
 * kept on the server so a second device agrees. Shared by server and client (no Node imports).
 */
import type { Action } from "./tableTypes";

export type Ui2Mode = "off" | "optin" | "on";

/** RN_UI2 as the server reads it. Anything but "optin" or "on" is off. */
export function ui2Mode(): Ui2Mode {
  const v = (typeof process !== "undefined" ? process.env.RN_UI2 ?? "" : "").trim().toLowerCase();
  return v === "on" || v === "optin" ? v : "off";
}

/** A strip's key: a page key, lower case ("companies", "home", "find"). */
export const STRIP_KEY_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** At most this many dismissed strips are kept (there are about twenty pages). */
export const STRIPS_MAX = 40;

/** What Me carries for the new look, from the member's profile and the flag. Empty with the flag off. */
export function ui2Me(prof: { ui2?: boolean; stripsOff?: string[] }, mode: Ui2Mode = ui2Mode()): { ui2?: boolean; ui2Optin?: true; stripsOff?: string[] } {
  if (mode === "off") return {};
  const on = mode === "on" || !!prof.ui2;
  return {
    ui2: on,
    ...(mode === "optin" ? { ui2Optin: true as const } : {}),
    ...(on ? { stripsOff: (prof.stripsOff ?? []).filter((k) => STRIP_KEY_RE.test(k)).slice(0, STRIPS_MAX) } : {}),
  };
}

/** The settings action's fields for the new look (lib/table.ts reads them through ui2Setting). */
export interface Ui2Fields {
  /** "Try the new Merlin" (true) or "Back to the old look" (false). Only while the flag is optin. */
  ui2?: boolean;
  /** Dismiss a page's "what this page is for" strip. */
  stripOff?: string;
  /** Bring one back (Undo). */
  stripOn?: string;
}

/** The settings action carrying the new look's fields. */
export const ui2Action = (x: Ui2Fields): Action => ({ type: "settings", ...x });

/**
 * The settings action, for the new look's fields: the profile as it becomes and what to say, or
 * null when the action is about something else. Throws a plain sentence when refused.
 */
export function ui2Setting<P extends { ui2?: boolean; stripsOff?: string[] }>(a: unknown, prof: P, mode: Ui2Mode = ui2Mode()): { profile: P; message: string } | { refused: string } | null {
  const x = (a ?? {}) as Record<string, unknown>;
  if (typeof x.ui2 === "boolean") {
    if (mode !== "optin") return { refused: mode === "on" ? "The new look is on for everyone now." : "The new look isn't open yet." };
    const p = { ...prof };
    if (x.ui2) p.ui2 = true;
    else delete p.ui2;
    return { profile: p, message: x.ui2 ? "This is the new Merlin. Everything you had is still here. You can go back from your menu." : "Back to the old look. You can try the new one again from your menu." };
  }
  const off = typeof x.stripOff === "string" ? x.stripOff : null;
  const on = typeof x.stripOn === "string" ? x.stripOn : null;
  if (off !== null || on !== null) {
    const k = (off ?? on)!;
    if (!STRIP_KEY_RE.test(k)) return { refused: "That didn't go through. Refresh the page and try again." };
    const had = (prof.stripsOff ?? []).filter((s) => s !== k);
    const p = { ...prof };
    const next = off !== null ? [...had, k].slice(-STRIPS_MAX) : had;
    if (next.length) p.stripsOff = next;
    else delete p.stripsOff;
    return { profile: p, message: "" };
  }
  return null;
}
