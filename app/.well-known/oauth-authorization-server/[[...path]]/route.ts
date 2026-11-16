/** RFC 8414 authorization server metadata (also answered with a path after it, for clients that add the resource's path). */
import { json, preflight } from "@/lib/mcp/http";
import { serverMetadata } from "@/lib/mcp/metadata";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => json(serverMetadata(req), 200, { "cache-control": "public, max-age=300" });
export const OPTIONS = () => preflight();
