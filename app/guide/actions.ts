"use server";

import { redirect } from "next/navigation";
import { guide } from "./content/guide";
import { EMAIL, openGuide } from "./unlock";

const clean = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);

/**
 * The guide's gate. Validates name and work email, records the reader, sets the cookie that opens every
 * chapter, and returns the reader to the chapter they asked for. The address is never put in a URL.
 */
export async function unlockGuide(formData: FormData): Promise<void> {
  const name = clean(formData.get("name"), 120);
  const email = clean(formData.get("email"), 160);
  const company = clean(formData.get("company"), 120);
  const returnTo = clean(formData.get("returnTo"), 200);
  const back = returnTo.startsWith(guide.path) && !returnTo.includes("//") ? returnTo : guide.path;
  if (!name || !EMAIL.test(email)) redirect(`${back}?gate=invalid`);
  await openGuide({ name, email, company: company || undefined, requested: back });
  redirect(back);
}
