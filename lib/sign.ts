import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signed one-click pulse links (spec §10 decision: signed links, not
 * magic-link sessions — one tap on mobile, no login, no session created).
 *
 * Token = base64url(payload).base64url(hmac(payload)). Payload carries the
 * operator, week, and band, so each button in the Tuesday email encodes one
 * answer. Links are valid only for the week they were minted for, which
 * bounds replay: re-tapping is idempotent (one pulse per operator-week).
 */

const SECRET = process.env.NB_LINK_SECRET || "dev-only-secret-set-NB_LINK_SECRET";

export interface PulseToken {
  op: string; // operator id
  week: string; // ISO week key
  band: string; // pulse band
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hmac(payload: string): Buffer {
  return createHmac("sha256", SECRET).update(payload).digest();
}

export function signPulseToken(t: PulseToken): string {
  const payload = b64url(Buffer.from(JSON.stringify(t), "utf8"));
  return `${payload}.${b64url(hmac(payload))}`;
}

export function verifyPulseToken(token: string): PulseToken | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64url(hmac(payload));
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    ) as PulseToken;
    if (typeof parsed.op !== "string" || typeof parsed.week !== "string" || typeof parsed.band !== "string")
      return null;
    return parsed;
  } catch {
    return null;
  }
}
