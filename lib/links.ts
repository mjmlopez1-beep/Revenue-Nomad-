/**
 * Web links as they go out: in the app (hrefFor), the connector's answers, emails, Slack and
 * webhooks. The table stores a website, a LinkedIn page or a job posting without its scheme
 * ("acme.com/jobs/1", see cleanValue in lib/tableFields.ts), so every place that shows one as a
 * link adds https:// here. Anything that is not a plain web address (javascript:, data:, a
 * mailto: or any other scheme, a space in the host) is no link at all. Pure, no Node imports.
 */

/** A scheme at the start ("javascript:", "data:", "https:"), but not a host with a port ("acme.com:8080"). */
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const HOST_PORT = /^([\w-]+(\.[\w-]+)+|localhost):\d{1,5}(\/|$)/;

/**
 * The value as an absolute https (or http) address, or null when it is not a web address.
 * "acme.com" -> "https://acme.com", "//acme.com/x" -> "https://acme.com/x", "http://acme.com"
 * stays, "javascript:alert(1)" -> null.
 */
export function webLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  // Control and invisible characters never belong in a link (and can hide a scheme: "java\tscript:").
  if (/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/.test(v)) return null;
  if (!v || v.length > 2000 || /[\s<>"'`\\]/.test(v)) return null;
  let full: string;
  const scheme = v.match(SCHEME)?.[1]?.toLowerCase();
  if (v.startsWith("//")) full = `https:${v}`;
  else if (scheme && !HOST_PORT.test(v)) {
    if (scheme !== "https" && scheme !== "http") return null;
    full = v;
  } else full = `https://${v}`;
  let u: URL;
  try {
    u = new URL(full);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  // A host with a dot and a top-level part of letters ("acme.com", "jobs.acme.co.uk").
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(u.hostname) && u.hostname !== "localhost") return null;
  return u.toString().replace(/\/$/, v.endsWith("/") ? "/" : "");
}

/** The app's public address for links (RN_PUBLIC_URL, with https:// added when it was set without one), or null. */
export function publicBase(): string | null {
  const env = process.env.RN_PUBLIC_URL?.trim();
  const u = env ? webLink(env) : null;
  return u ? u.replace(/\/+$/, "") : null;
}
