/**
 * Merlin's new design (the owner-approved v5 system, app/post/ui3) behind one flag, RN_UI3:
 *
 *   off     the default: nothing changes for anyone, and nothing below is sent.
 *   optin   admins only (the owner) see "Try the new design" in their account menu. Their choice is
 *           kept on their profile (Profile.ui3), so a second device agrees. Every other member sees
 *           nothing of it.
 *   on      everyone.
 *
 * The new design is drawn over the new look (RN_UI2): its work pages are today's new-look pages
 * inside the new shell. With RN_UI2 off it is off too.
 *
 * Also here, the new design's two company lists, kept on the member's profile so every device
 * agrees and nothing lives in a browser alone: Saved (Target Companies' Saved tab, "Keep it in
 * Saved") and Hidden ("Leave it out of these lists", with Undo). Public company ids only.
 *
 * Shared by server and client (no Node imports).
 */
import type { Action } from "./tableTypes";

export type Ui3Mode = "off" | "optin" | "on";

/** RN_UI3 as the server reads it: "on" or "optin"; anything else (unset included) is off. */
export function ui3Mode(): Ui3Mode {
  const v = (typeof process !== "undefined" ? process.env.RN_UI3 ?? "" : "").trim().toLowerCase();
  return v === "on" ? "on" : v === "optin" ? "optin" : "off";
}

/** A company's public id as the client has it ("c_" and an opaque tail). */
export const UI3_ID_RE = /^[a-z]_[A-Za-z0-9_-]{4,40}$/;
/** At most this many saved, and this many hidden, companies are kept. */
export const UI3_LIST_MAX = 500;

export interface Ui3Prof {
  ui3?: boolean;
  ui3Saved?: string[];
  ui3Hidden?: string[];
}

const clean = (ids: unknown): string[] => (Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && UI3_ID_RE.test(x)).slice(-UI3_LIST_MAX) : []);

/** May this member have the new design at all: the flag, the new look, and (optin) an admin. */
function allowed(x: { admin: boolean; ui2: boolean }, mode: Ui3Mode): boolean {
  if (mode === "off" || !x.ui2) return false;
  return mode === "on" || x.admin;
}

/** What Me carries for the new design. Empty with the flag off, and for anyone the flag doesn't reach. */
export function ui3Me(prof: Ui3Prof, x: { admin: boolean; ui2: boolean }, mode: Ui3Mode = ui3Mode()): { ui3?: boolean; ui3Optin?: true; ui3Saved?: string[]; ui3Hidden?: string[] } {
  if (!allowed(x, mode)) return {};
  const on = mode === "on" || !!prof.ui3;
  return {
    ui3: on,
    ...(mode === "optin" ? { ui3Optin: true as const } : {}),
    ...(on ? { ui3Saved: clean(prof.ui3Saved), ui3Hidden: clean(prof.ui3Hidden) } : {}),
  };
}

/** The settings action's fields for the new design (lib/table.ts reads them through ui3Setting). */
export interface Ui3Fields {
  /** "Try the new design" (true) or "Back to the current design" (false). Admins only, while the flag is optin. */
  ui3?: boolean;
  /** Keep a company in Saved (on), or take it out. */
  ui3Save?: { id: string; on: boolean };
  /** Leave a company out of the new design's lists (on), or bring it back (Undo). */
  ui3Hide?: { id: string; on: boolean };
}

/** The settings action carrying the new design's fields. */
export const ui3Action = (x: Ui3Fields): Action => ({ type: "settings", ...x }) as Action;

/**
 * The settings action, for the new design's fields: the profile as it becomes and what to say, a
 * refusal in a plain sentence, or null when the action is about something else.
 */
export function ui3Setting<P extends Ui3Prof>(a: unknown, prof: P, x: { admin: boolean; ui2: boolean }, mode: Ui3Mode = ui3Mode()): { profile: P; message: string } | { refused: string } | null {
  const v = (a ?? {}) as Record<string, unknown>;
  if (typeof v.ui3 === "boolean") {
    if (mode !== "optin" || !allowed(x, mode)) return { refused: mode === "on" ? "The new design is on for everyone now." : "The new design isn't open yet." };
    const p = { ...prof };
    if (v.ui3) p.ui3 = true;
    else delete p.ui3;
    return { profile: p, message: v.ui3 ? "This is the new design. Everything you had is still here. You can go back from your menu." : "Back to the current design. You can try the new one again from your menu." };
  }
  for (const key of ["ui3Save", "ui3Hide"] as const) {
    const f = v[key] as { id?: unknown; on?: unknown } | undefined;
    if (f === undefined) continue;
    if (!allowed(x, mode)) return { refused: "The new design isn't open yet." };
    if (!f || typeof f.id !== "string" || !UI3_ID_RE.test(f.id) || typeof f.on !== "boolean") return { refused: "That didn't go through. Refresh the page and try again." };
    const field = key === "ui3Save" ? "ui3Saved" : "ui3Hidden";
    const had = clean(prof[field]).filter((id) => id !== f.id);
    const next = f.on ? [...had, f.id].slice(-UI3_LIST_MAX) : had;
    const p = { ...prof };
    if (next.length) p[field] = next;
    else delete p[field];
    const message = key === "ui3Save" ? (f.on ? "Saved. It's in your Saved tab." : "Taken out of Saved.") : f.on ? "Hidden from these lists." : "It's back in your lists.";
    return { profile: p, message };
  }
  return null;
}
