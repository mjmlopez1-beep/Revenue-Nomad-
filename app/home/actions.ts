"use server";

import { redirect } from "next/navigation";

/**
 * Server actions for the two email forms (design 4.6). Each reads `email`, checks it against a
 * simple address pattern and redirects: valid input lands on /thanks with its variant, invalid
 * input returns to the form's section. The address is not stored, logged or sent anywhere;
 * wiring it to the email tool is launch work.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasValidEmail(formData: FormData): boolean {
  const value = formData.get("email");
  return typeof value === "string" && EMAIL.test(value.trim());
}

export async function requestReport(formData: FormData): Promise<void> {
  redirect(hasValidEmail(formData) ? "/thanks?for=report" : "/#research");
}

