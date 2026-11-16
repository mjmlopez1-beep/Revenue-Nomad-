/**
 * The weekly digest email: new open roles in the member's function, and what they can add.
 * Contract only for now: the scan agent writes the real copy and layout.
 */
import type { DigestData } from "./scanTypes";

export function renderDigest(d: DigestData): { subject: string; text: string; html: string } {
  const subject = `${d.newRoles} new fractional roles this week`;
  const text = `${subject}\n\n${d.appUrl}\n\nUnsubscribe: ${d.unsubscribeUrl}`;
  return { subject, text, html: `<p>${subject}</p>` };
}
