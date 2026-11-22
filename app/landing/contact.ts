/**
 * Who a member can write to, from the server at run time (View.contact, read from
 * RN_SUPPORT_EMAIL and RN_INTRO_EMAIL), so a build can never drop an address. A server that
 * predates View.contact, or has neither variable set, gives nulls.
 */
import type { View } from "../ui/shared";

/** `support`: where a member asks for a lost sign-in link or anything else. `intro`: where a member asks for an intro to a seat holder. */
export type Contact = NonNullable<View["contact"]>;

const clean = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);

export function contactOf(view: View | null | undefined): Contact {
  const c = view?.contact;
  return { support: clean(c?.support), intro: clean(c?.intro) };
}

/** A mailto link, or null when the address can't make one. */
export function mailto(to: string, subject: string): string | null {
  try {
    return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}`;
  } catch {
    return null;
  }
}

/**
 * The server's answer to a link or code it can't read, said for the way the member tried:
 * they clicked a link (it may have been cut off in the email) or pasted one into Sign in.
 * Any other answer (a rate limit, say) is shown as the server wrote it.
 */
export function signInFailText(error: string, how: "clicked" | "pasted"): string {
  if (!/didn.t work/i.test(error)) return error;
  return how === "clicked"
    ? "That sign-in link didn't work. It may have been cut off on the way to you. Paste the whole link here, or the code at the end of it."
    : "That link or code didn't work. Check that you copied all of it.";
}

/**
 * The short note the landing page shows after an account was closed (Close my account sends the
 * browser to /?closed=1, app/post/Settings.tsx) or a restore link that no longer works opened it
 * (/api/account/restore sends /?restore=gone). Null for any other address.
 */
export const ACCOUNT_NOTES = {
  closed: "Your account is closed. You can restore it within 30 days from the link we emailed you.",
  gone: "That restore link has expired.",
} as const;
export function accountNoteOf(search: string): string | null {
  const q = new URLSearchParams(search);
  if (q.get("closed") === "1") return ACCOUNT_NOTES.closed;
  if (q.get("restore") === "gone") return ACCOUNT_NOTES.gone;
  return null;
}
