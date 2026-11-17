/**
 * "Add to Slack": connecting alerts with Revenue Nomad's own Slack app (Merlin Alerts), Slack's
 * OAuth v2 flow with the `incoming-webhook` scope only. Slack asks the member which channel the
 * app may post to and hands back an incoming webhook for it. That webhook is stored exactly like
 * one pasted by hand (lib/notify connect path, test message first). The bot token Slack also
 * returns is dropped on the spot: Merlin never keeps it.
 *
 * Env: SLACK_CLIENT_ID and SLACK_CLIENT_SECRET (both, or the button doesn't show), optional
 * SLACK_REDIRECT_URL (else RN_PUBLIC_URL or the request's origin + CALLBACK_PATH).
 *
 * The `state`: 32 random bytes, kept in this process's memory for 10 minutes (as hashes), bound
 * to the member who started, used once, and also set as an httpOnly cookie on the callback path,
 * so a callback only finishes in the browser that started it, for the member who started it.
 *
 * Tests only: with RN_SCAN_TEST=1, RN_SLACK_API_TEST replaces https://slack.com (a mock server).
 * Never read otherwise.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { loadSeed, loadState, memberByToken } from "../table";
import { integrationsAllowed } from "./plan";

export const CALLBACK_PATH = "/api/integrations/slack/callback";
export const STATE_COOKIE = "rn_slack_state";
export const STATE_COOKIE_PATH = "/api/integrations/slack";
export const STATE_TTL_MS = 10 * 60 * 1000;
const STATES_MAX = 5000;
const EXCHANGE_TIMEOUT_MS = 10_000;

/** Both halves of the app's credentials are set. Never says what they are. */
export const slackAppConfigured = () => !!(process.env.SLACK_CLIENT_ID?.trim() && process.env.SLACK_CLIENT_SECRET?.trim());

/** https://slack.com, or a mock on a test server. */
export function slackApiBase(): string {
  if (process.env.RN_SCAN_TEST === "1" && process.env.RN_SLACK_API_TEST) return process.env.RN_SLACK_API_TEST.replace(/\/+$/, "");
  return "https://slack.com";
}

/** Where Slack sends the member back. Must match a Redirect URL in the app's OAuth & Permissions. */
export function redirectUri(origin: string): string {
  const set = process.env.SLACK_REDIRECT_URL?.trim();
  if (set) return set;
  const base = (process.env.RN_PUBLIC_URL?.trim() || origin).replace(/\/+$/, "");
  return base + CALLBACK_PATH;
}

/* ---------- state ---------- */

const hashOf = (v: string) => createHash("sha256").update(`rn-slack-state:${v}`).digest("hex");
const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
/** hash(state) -> who started and until when. One process, like the connector's codes (lib/mcp/oauth.ts). */
const states = new Map<string, { memberId: string; exp: number }>();
function sweep() {
  const now = Date.now();
  for (const [k, v] of states) if (v.exp <= now) states.delete(k);
  while (states.size >= STATES_MAX) states.delete(states.keys().next().value as string);
}

export type StartResult = { ok: true; url: string; state: string } | { ok: false; why: "signed_out" | "not_configured" | "not_allowed" };

/** GET /start: a new one-time state for the signed-in member, and Slack's authorize URL. */
export async function startSlackApp(token: string | null, origin: string): Promise<StartResult> {
  if (!slackAppConfigured()) return { ok: false, why: "not_configured" };
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  if (!m) return { ok: false, why: "signed_out" };
  if (!integrationsAllowed(m.id)) return { ok: false, why: "not_allowed" };
  sweep();
  const state = randomBytes(32).toString("base64url");
  states.set(hashOf(state), { memberId: m.id, exp: Date.now() + STATE_TTL_MS });
  const q = new URLSearchParams({ client_id: process.env.SLACK_CLIENT_ID!.trim(), scope: "incoming-webhook", redirect_uri: redirectUri(origin), state });
  return { ok: true, url: `${slackApiBase()}/oauth/v2/authorize?${q}`, state };
}

/**
 * The state on a callback: known, not expired, the same as the cookie of the browser that
 * started, and started by the member signed in now. Used up whatever the answer.
 */
export async function takeState(stateRaw: string | null, cookie: string | null, token: string | null): Promise<{ memberId: string } | null> {
  const state = String(stateRaw ?? "");
  if (!state || state.length > 200) return null;
  const key = hashOf(state);
  const got = states.get(key);
  states.delete(key);
  if (!got || got.exp <= Date.now()) return null;
  if (!cookie || !same(cookie, state)) return null;
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  if (!m || m.id !== got.memberId) return null;
  return { memberId: m.id };
}

/* ---------- the code ---------- */

const clean = (v: unknown, max = 80) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f<>*_~`|]/g, "")
    .trim()
    .slice(0, max);

export interface SlackHook {
  url: string;
  /** "#alerts", or "@ana" for a DM. */
  channel: string | null;
  team: string | null;
}

/**
 * Swap the code for the incoming webhook (POST oauth.v2.access). Null when Slack said no or
 * didn't answer. The access token in the answer is never read past this function, and nothing
 * here is logged but Slack's short error code.
 */
export async function exchangeCode(code: string, origin: string): Promise<SlackHook | null> {
  if (!code || code.length > 500) return null;
  try {
    const r = await fetch(`${slackApiBase()}/api/oauth.v2.access`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID!.trim(),
        client_secret: process.env.SLACK_CLIENT_SECRET!.trim(),
        code,
        redirect_uri: redirectUri(origin),
      }).toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
      cache: "no-store",
    });
    const j = (await r.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      incoming_webhook?: { url?: unknown; channel?: unknown };
      team?: { name?: unknown };
    } | null;
    if (!r.ok || !j?.ok) {
      const code = typeof j?.error === "string" && /^[a-z_]{2,60}$/.test(j.error) ? j.error : `http_${r.status}`;
      console.error(`Add to Slack: the code exchange failed (${code})`);
      return null;
    }
    const url = typeof j.incoming_webhook?.url === "string" ? j.incoming_webhook.url : "";
    if (!url) {
      console.error("Add to Slack: Slack's answer had no incoming webhook");
      return null;
    }
    const ch = clean(j.incoming_webhook?.channel);
    return { url, channel: ch ? (/^[#@]/.test(ch) ? ch : `#${ch}`) : null, team: clean(j.team?.name) || null };
  } catch (e) {
    const name = (e as { name?: string })?.name;
    console.error(`Add to Slack: couldn't reach Slack (${name === "TimeoutError" ? "timeout" : "unreachable"})`);
    return null;
  }
}

/** Tests: forget every state. */
export const resetStates = () => states.clear();
