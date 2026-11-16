/** Dynamic client registration (RFC 7591). Public clients by default. 20 registrations an hour per network. */
import { notNow } from "@/lib/apiGuard";
import { clientIp, limited } from "@/lib/rateLimit";
import { json, oauthError, preflight, readText } from "@/lib/mcp/http";
import { OAuthFail, registerClient } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (limited(`oauth-reg:${clientIp(req)}`, 20, 60 * 60_000)) return oauthError("too_many_requests", "That's 20 registrations from this network in an hour. Try again later.", 429);
  const text = await readText(req, 16 * 1024);
  let meta: unknown;
  try {
    meta = text ? JSON.parse(text) : null;
  } catch {
    meta = null;
  }
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return oauthError("invalid_client_metadata", "Send the client metadata as a JSON object.");
  try {
    return json(await registerClient(meta as Record<string, unknown>), 201);
  } catch (e) {
    if (e instanceof OAuthFail) return oauthError(e.code, e.message, e.status);
    const r = notNow(e);
    if (r) return r;
    throw e;
  }
}

export const OPTIONS = () => preflight();
