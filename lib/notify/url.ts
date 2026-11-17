/**
 * Checking a webhook URL a member pasted, and posting to one safely.
 *
 * Slack field: only https://hooks.slack.com/services/... (an incoming webhook) and
 * https://hooks.slack.com/workflows/... (a Workflow Builder trigger).
 * Other tools: any https URL on port 443 whose host is a public address. Names that resolve to a
 * private, loopback, link-local or otherwise internal address are refused, both when the URL is
 * saved and again before every post (the answer can change).
 *
 * Every post: https only, a 5 second limit, no redirects followed (a 3xx counts as a failure).
 */
import { lookup } from "dns/promises";
import { isIP } from "net";
import type { DestKind } from "./types";

export const SLACK_HOST = "hooks.slack.com";
const SLACK_SERVICES = /^\/services\/[A-Za-z0-9]{6,20}\/[A-Za-z0-9]{6,20}\/[A-Za-z0-9]{16,64}$/;
const SLACK_WORKFLOWS = /^\/workflows(\/[A-Za-z0-9_-]{1,64}){2,5}$/;
export const POST_TIMEOUT_MS = 5000;

export class UrlProblem extends Error {}

/** A URL from loose input, or a plain reason it can't be used. */
function parse(raw: unknown): URL {
  const text = String(raw ?? "").trim();
  if (!text) throw new UrlProblem("Paste the webhook URL first.");
  if (text.length > 500) throw new UrlProblem("That URL is too long to be a webhook URL. Copy it again.");
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    throw new UrlProblem("That isn't a full web address. Copy the whole URL, starting with https://.");
  }
  if (u.protocol !== "https:") throw new UrlProblem("Use the https:// address. Alerts only go over a secure connection.");
  if (u.username || u.password) throw new UrlProblem("That URL has a sign-in in it. Use the plain webhook URL.");
  if (u.port && u.port !== "443") throw new UrlProblem("Use a webhook URL on the standard https port.");
  return u;
}

/** The Slack field: an incoming webhook or a workflow webhook on hooks.slack.com, nothing else. */
export function checkSlackUrl(raw: unknown): { url: string; kind: Extract<DestKind, "slack" | "workflow"> } {
  const u = parse(raw);
  if (u.hostname.toLowerCase() !== SLACK_HOST) throw new UrlProblem("That isn't a Slack webhook. It should start with https://hooks.slack.com/services/.");
  if (u.search || u.hash) throw new UrlProblem("That Slack URL has extra parts at the end. Copy it again from Incoming Webhooks.");
  if (SLACK_SERVICES.test(u.pathname)) return { url: `https://${SLACK_HOST}${u.pathname}`, kind: "slack" };
  if (SLACK_WORKFLOWS.test(u.pathname)) return { url: `https://${SLACK_HOST}${u.pathname}`, kind: "workflow" };
  throw new UrlProblem("That Slack URL looks cut short. Copy the whole webhook URL from Incoming Webhooks.");
}

/* ---------- addresses that must never be reached ---------- */

function v4Private(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && p[2] === 0) ||
    (a === 192 && b === 0 && p[2] === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && p[2] === 100) ||
    (a === 203 && b === 0 && p[2] === 113) ||
    a >= 224
  );
}

/** Loopback, private, link-local, unique-local, multicast, documentation and the rest that isn't the public internet. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return v4Private(ip);
  if (v !== 6) return true;
  const low = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  // IPv4 inside IPv6 (::ffff:10.0.0.1, ::10.0.0.1, 64:ff9b::10.0.0.1)
  const tail = low.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) return v4Private(tail[1]);
  // ::ffff:a00:1 written in hex
  const mapped = low.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    const hi = parseInt(mapped[1], 16);
    const lo = parseInt(mapped[2], 16);
    return v4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (low === "::" || low === "::1") return true;
  const first = parseInt(low.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 site local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (low.startsWith("2001:db8") || low.startsWith("2001:0db8")) return true; // documentation
  if (low.startsWith("64:ff9b:") || low.startsWith("100::")) return true;
  return false;
}

const INTERNAL_NAME = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa|railway\.internal)$/i;

/** How a name is turned into addresses. Tests replace it. */
let resolver: (host: string) => Promise<string[]> = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
export function setResolver(fn: ((host: string) => Promise<string[]>) | null) {
  resolver = fn ?? (async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address));
}

/** The host must be a public name or address: every address it resolves to is public. */
async function mustBePublic(host: string): Promise<void> {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(h)) {
    if (isPrivateAddress(h)) throw new UrlProblem("That address is on a private network. Use the webhook URL your tool gives you.");
    return;
  }
  if (!h.includes(".") || INTERNAL_NAME.test(h)) throw new UrlProblem("That address is on a private network. Use the webhook URL your tool gives you.");
  let addrs: string[];
  try {
    addrs = await resolver(h);
  } catch {
    throw new UrlProblem("We couldn't find that address. Check the URL and try again.");
  }
  if (!addrs.length) throw new UrlProblem("We couldn't find that address. Check the URL and try again.");
  if (addrs.some(isPrivateAddress)) throw new UrlProblem("That address is on a private network. Use the webhook URL your tool gives you.");
}

/** The Other tools field: any public https webhook. A Slack URL pasted here is treated as Slack. */
export async function checkWebhookUrl(raw: unknown): Promise<{ url: string; kind: DestKind }> {
  const u = parse(raw);
  if (u.hostname.toLowerCase() === SLACK_HOST) return checkSlackUrl(raw);
  await mustBePublic(u.hostname);
  return { url: u.toString(), kind: "webhook" };
}

/** What one post did. `gone`: the service says this URL is no longer there, so stop using it. */
export interface PostResult {
  ok: boolean;
  status: number;
  /** A short code for what went wrong ("no_service", "timeout", "redirect", "http_500"). */
  error?: string;
  gone?: boolean;
}

/** Slack's answers that mean the webhook will never work again. */
const SLACK_GONE = new Set(["no_service", "no_team", "team_disabled", "channel_not_found", "channel_is_archived", "invalid_token", "no_active_hooks", "action_prohibited", "posting_to_general_channel_denied"]);

/** POST JSON to a destination with every guard on. Never throws. */
export async function postJson(url: string, kind: DestKind, body: unknown): Promise<PostResult> {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return { ok: false, status: 0, error: "not_https" };
    if (kind === "webhook") await mustBePublic(u.hostname);
    else if (u.hostname !== SLACK_HOST) return { ok: false, status: 0, error: "not_slack" };
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Merlin-Alerts/1.0" },
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
      cache: "no-store",
    });
    const text = (await r.text().catch(() => "")).slice(0, 200).trim();
    if (r.status >= 300 && r.status < 400) return { ok: false, status: r.status, error: "redirect" };
    if (r.ok) return { ok: true, status: r.status };
    const code = /^[a-z_]{3,60}$/.test(text) ? text : `http_${r.status}`;
    return { ok: false, status: r.status, error: code, gone: r.status === 404 || r.status === 410 || SLACK_GONE.has(text) };
  } catch (e) {
    if (e instanceof UrlProblem) return { ok: false, status: 0, error: "private_address", gone: false };
    const name = (e as { name?: string })?.name;
    return { ok: false, status: 0, error: name === "TimeoutError" || name === "AbortError" ? "timeout" : "unreachable" };
  }
}

/** "hooks.slack.com/…/abcd": enough to recognize it, not enough to use it. */
export function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const tail = u.pathname.replace(/\/+$/, "").slice(-4);
    return `${u.hostname}/…/${tail}`;
  } catch {
    return "…";
  }
}

/** Plain words for an error code, for the page. */
export function problemWords(code: string | undefined, kind: DestKind): string | null {
  if (!code) return null;
  const where = kind === "webhook" ? "Your tool" : "Slack";
  if (code === "timeout") return `${where} didn't answer within 5 seconds.`;
  if (code === "redirect") return `${where} answered with a redirect, which alerts don't follow. Use the final webhook URL.`;
  if (code === "unreachable") return `We couldn't reach ${kind === "webhook" ? "that address" : "Slack"}.`;
  if (code === "private_address") return "That address now points to a private network, so alerts stopped.";
  if (["no_service", "no_team", "team_disabled", "invalid_token", "no_active_hooks", "http_404", "http_410"].includes(code))
    return kind === "webhook" ? "That webhook isn't there anymore." : "Slack says this webhook was removed. Connect Slack again with a new URL.";
  if (code === "channel_not_found" || code === "channel_is_archived") return "The Slack channel for these alerts was archived or deleted. Connect Slack again with a new URL.";
  if (code === "action_prohibited" || code === "posting_to_general_channel_denied") return "Your Slack admin doesn't allow posts in that channel. Pick another channel.";
  if (code === "invalid_payload" || code === "invalid_blocks") return `${where} didn't take the alert's format.`;
  return `${where} answered with an error (${code.replace(/^http_/, "")}).`;
}
