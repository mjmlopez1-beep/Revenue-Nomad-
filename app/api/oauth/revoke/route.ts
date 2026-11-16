/** Token revocation (RFC 7009). An access or refresh token ends its whole grant. Answers 200 whether or not the token was known. */
import { notNow } from "@/lib/apiGuard";
import { clientIp, limited } from "@/lib/rateLimit";
import { json, oauthError, preflight, readFields } from "@/lib/mcp/http";
import { revokeToken } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (limited(`oauth-revoke:${clientIp(req)}`, 60, 60_000)) return oauthError("too_many_requests", "Too many requests. Wait a minute, then try again.", 429);
  const fields = await readFields(req);
  if (!fields?.token) return oauthError("invalid_request", "Send the token to revoke.");
  try {
    await revokeToken(fields.token);
    return json({});
  } catch (e) {
    const r = notNow(e);
    if (r) return r;
    throw e;
  }
}

export const OPTIONS = () => preflight();
