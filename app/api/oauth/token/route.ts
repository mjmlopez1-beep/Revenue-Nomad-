/** The token endpoint: authorization_code (PKCE S256 required) and refresh_token (rotated). Form or JSON body. */
import { notNow } from "@/lib/apiGuard";
import { clientIp, limited } from "@/lib/rateLimit";
import { json, mcpUrl, oauthError, preflight, publicOrigin, readFields } from "@/lib/mcp/http";
import { OAuthFail, tokenRequest } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (limited(`oauth-token:${clientIp(req)}`, 60, 60_000)) return oauthError("too_many_requests", "Too many token requests. Wait a minute, then try again.", 429);
  const fields = await readFields(req);
  if (!fields) return oauthError("invalid_request", "Send the token request as a form.");
  try {
    return json(await tokenRequest(fields, req.headers.get("authorization"), mcpUrl(req), publicOrigin(req)));
  } catch (e) {
    if (e instanceof OAuthFail) return oauthError(e.code, e.message, e.status, e.status === 401 ? { "www-authenticate": 'Basic realm="Trading Post"' } : {});
    const r = notNow(e);
    if (r) return r;
    throw e;
  }
}

export const OPTIONS = () => preflight();
