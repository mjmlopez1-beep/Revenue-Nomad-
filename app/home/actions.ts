"use server";

import { redirect } from "next/navigation";
import { guide } from "../guide/content/guide";
import { EMAIL, openGuide } from "../guide/unlock";

/**
 * Server action for the Featured research form (design 4.6). One work email records the reader, opens every
 * chapter of the guide on this device and lands on the guide. Invalid input returns to the section.
 */
export async function requestReport(formData: FormData): Promise<void> {
  const value = formData.get("email");
  const email = typeof value === "string" ? value.trim().slice(0, 160) : "";
  if (!EMAIL.test(email)) redirect("/#research");
  await openGuide({ email, requested: "/#research" });
  redirect(guide.path);
}
