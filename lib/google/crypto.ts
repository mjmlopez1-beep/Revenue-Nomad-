/**
 * Google refresh tokens, sealed at rest with AES-256-GCM. The key is RN_GOOGLE_TOKEN_KEY when set,
 * else derived from the app's own secret (RN_ID_SECRET, as public ids and unsubscribe links use,
 * then RN_INTEL_SEED_KEY), with its own label so it never equals another key. A token is opened
 * only on the server, right before it is sent to Google, and is never logged or sent to a browser.
 *
 * Sealed form: "g1." + base64url(12-byte IV | 16-byte tag | ciphertext).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

let warned = false;
function key(): Buffer {
  const secret = process.env.RN_GOOGLE_TOKEN_KEY || process.env.RN_ID_SECRET || process.env.RN_INTEL_SEED_KEY;
  if (!secret && !warned && process.env.NODE_ENV === "production") {
    warned = true;
    console.error("Google tokens: no RN_GOOGLE_TOKEN_KEY, RN_ID_SECRET or RN_INTEL_SEED_KEY is set, so they are sealed with a development key. Set RN_ID_SECRET.");
  }
  return createHash("sha256").update(`rn-google-tokens:v1:${secret || "rn-dev-google"}`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `g1.${Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64url")}`;
}

/** The plain token, or null when it doesn't open (another key, or tampered with). */
export function unseal(sealed: string | null | undefined): string | null {
  if (!sealed || !sealed.startsWith("g1.")) return null;
  try {
    const raw = Buffer.from(sealed.slice(3), "base64url");
    if (raw.length < 29) return null;
    const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
