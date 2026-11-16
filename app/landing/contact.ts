/**
 * Who a member can write to, from the server at run time (View.contact, read from
 * RN_SUPPORT_EMAIL and RN_INTRO_EMAIL), so a build can never drop an address. A server that
 * predates View.contact, or has neither variable set, gives nulls.
 */
import type { View } from "../ui/shared";

export interface Contact {
  /** Where a member asks for a lost sign-in link or anything else. */
  support: string | null;
  /** Where a member asks for an intro to a seat holder. */
  intro: string | null;
}

const clean = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);

export function contactOf(view: View | null | undefined): Contact {
  const c = (view as (View & { contact?: Partial<Contact> | null }) | null | undefined)?.contact;
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
