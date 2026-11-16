/** RFC 9728 protected resource metadata, at the root and at /.well-known/oauth-protected-resource/api/mcp. */
import { json, preflight } from "@/lib/mcp/http";
import { resourceMetadata } from "@/lib/mcp/metadata";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => json(resourceMetadata(req), 200, { "cache-control": "public, max-age=300" });
export const OPTIONS = () => preflight();
