/**
 * The Merlin MCP server (Streamable HTTP, stateless, JSON answers). One address for
 * Claude, ChatGPT, Claude Code and Cursor: <origin>/api/mcp.
 *
 * POST   JSON-RPC (initialize, tools/list, tools/call, ping, notifications). Needs a bearer token
 *        from /api/oauth/token. Without a good one: 401 with WWW-Authenticate naming the
 *        protected resource metadata, so the client starts the OAuth sign-in.
 * GET    405: there is no stream of messages from the server (allowed by the transport spec).
 * DELETE 405: there are no sessions to end.
 */
import { NextRequest, NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { notNow } from "@/lib/apiGuard";
import { clientIp, limited } from "@/lib/rateLimit";
import { memberById } from "@/lib/table";
import { CORS, SCOPE, mcpUrl, preflight, publicOrigin, readText, resourceMetadataUrl } from "@/lib/mcp/http";
import { checkAccess } from "@/lib/mcp/oauth";
import { makeServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY = 256 * 1024;

/** Browser origins allowed to call (server-side clients send none). RN_MCP_ORIGINS adds more, comma separated. */
function originAllowed(req: NextRequest): boolean {
  const o = req.headers.get("origin");
  if (!o) return true;
  if (o === publicOrigin(req)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(o)) return true;
  const allowed = ["https://claude.ai", "https://claude.com", "https://chatgpt.com", "https://chat.openai.com", ...(process.env.RN_MCP_ORIGINS ?? "").split(",").map((x) => x.trim()).filter(Boolean)];
  return allowed.includes(o);
}

const rpcError = (status: number, message: string, extra: Record<string, string> = {}) =>
  NextResponse.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status, headers: { ...CORS, "cache-control": "no-store", ...extra } });

function unauthorized(req: NextRequest, why: "missing" | "invalid" | "expired") {
  const meta = resourceMetadataUrl(req);
  const challenge =
    why === "missing"
      ? `Bearer resource_metadata="${meta}", scope="${SCOPE}"`
      : `Bearer error="invalid_token", error_description="${why === "expired" ? "The access token expired" : "The access token is not valid"}", resource_metadata="${meta}", scope="${SCOPE}"`;
  return rpcError(401, why === "missing" ? "Sign in to Merlin to use this connector." : "Your Merlin sign-in ran out. Connect again.", { "www-authenticate": challenge });
}

async function authed(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.match(/^Bearer\s+([A-Za-z0-9._~+/=-]+)\s*$/i)?.[1] ?? null;
  const r = await checkAccess(bearer, mcpUrl(req), publicOrigin(req));
  if ("error" in r) return { fail: unauthorized(req, r.error) };
  const member = await memberById(r.grant.memberId);
  if (!member) return { fail: unauthorized(req, "invalid") };
  return { member, grant: r.grant };
}

async function handle(req: NextRequest): Promise<Response> {
  try {
    if (limited(`mcp-ip:${clientIp(req)}`, 600, 60_000)) return rpcError(429, "That's a lot in one minute. Give it a moment, then try again.", { "retry-after": "30" });
    if (!originAllowed(req)) return rpcError(403, "This origin isn't allowed to call Merlin.");
    const who = await authed(req);
    if ("fail" in who) return who.fail!;
    if (req.method !== "POST") return rpcError(405, "Send JSON-RPC requests with POST.", { allow: "POST, OPTIONS" });

    const text = await readText(req, MAX_BODY);
    if (text === null) return rpcError(413, "That request is too large.");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }, { status: 400, headers: CORS });
    }

    const server = makeServer({ member: who.member, origin: publicOrigin(req), app: who.grant.clientName });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
      const res = await transport.handleRequest(req, {
        parsedBody: body,
        authInfo: { token: "", clientId: who.grant.clientId, scopes: [who.grant.scope], extra: { memberId: who.member.id } },
      });
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
      headers.set("cache-control", "no-store");
      return new Response(await res.arrayBuffer(), { status: res.status, headers });
    } finally {
      void server.close().catch(() => {});
    }
  } catch (e) {
    const r = notNow(e);
    if (r) return r;
    throw e;
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = () => preflight();
