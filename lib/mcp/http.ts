/**
 * Small HTTP helpers for the connector's routes (app/api/mcp, app/api/oauth, app/.well-known).
 *
 * The public address (the OAuth issuer and the MCP resource) is RN_PUBLIC_URL when it is set,
 * else the address the request came in on (the host's proxy headers first).
 */
import { NextResponse } from "next/server";

export const MCP_PATH = "/api/mcp";
export const SCOPE = "table";

export function publicOrigin(req: Request): string {
  const env = process.env.RN_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (env) return env;
  const h = req.headers;
  const url = new URL(req.url);
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(":", "");
  const host = h.get("x-forwarded-host")?.split(",")[0].trim() || h.get("host") || url.host;
  return `${proto}://${host}`;
}
export const mcpUrl = (req: Request) => publicOrigin(req) + MCP_PATH;
export const resourceMetadataUrl = (req: Request) => `${publicOrigin(req)}/.well-known/oauth-protected-resource${MCP_PATH}`;

/** CORS for the endpoints a browser-based client calls with a bearer token (no cookies). */
export const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-expose-headers": "www-authenticate, mcp-session-id, mcp-protocol-version",
  "access-control-max-age": "86400",
};

export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });

export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store", pragma: "no-cache", ...CORS, ...extra } });
}

/** An OAuth error answer (RFC 6749 section 5.2). */
export const oauthError = (error: string, description: string, status = 400, extra: Record<string, string> = {}) =>
  json({ error, error_description: description }, status, extra);

/** A request body as form fields or JSON (token and revoke take forms; register takes JSON). At most 16 KB. */
export async function readFields(req: Request): Promise<Record<string, string> | null> {
  const text = await readText(req, 16 * 1024);
  if (text === null) return null;
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    try {
      const o = JSON.parse(text);
      if (!o || typeof o !== "object" || Array.isArray(o)) return null;
      return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
    } catch {
      return null;
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

/** The body as text, or null past `max` bytes. */
export async function readText(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      void reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
