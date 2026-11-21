/**
 * Smart ways in (lib/paths), for the signed-in member only (the app's cookie).
 *
 * GET                        PathsView: the member's LinkedIn import, ways in by company (counts), Your hidden paths
 * GET ?company=<public id>   CompanyPathsView: that company's ways in, best first
 * POST { op: "import", csv } the member's own Connections.csv, as text (replaces the last one)
 * POST { op: "delete" }      delete the import and everything worked out from it
 * Every answer is { view } (or { company }) or { error }. { on: false } with Your network off.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { ActionError } from "@/lib/table";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { companyPaths, deleteConnections, importConnections, pathsView } from "@/lib/paths";
import { FILE_MAX_BYTES } from "@/lib/paths/types";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };
const SIGNED_OUT = "You're signed out. Sign in again.";
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

export const GET = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const company = req.nextUrl.searchParams.get("company");
  if (company !== null) {
    const c = await companyPaths(token, company);
    if (!c) return fail(SIGNED_OUT, 401);
    return NextResponse.json({ company: c }, { headers: noStore });
  }
  const view = await pathsView(token);
  if (!view) return fail(SIGNED_OUT, 401);
  return NextResponse.json({ view }, { headers: noStore });
});

export const POST = guarded(async (req: NextRequest) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== publicOrigin(req) && origin !== req.nextUrl.origin) return fail("That didn't come from Merlin.", 403);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (!token) return fail(SIGNED_OUT, 401);
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > FILE_MAX_BYTES + 4096) return fail("That file is larger than LinkedIn's Connections.csv can be.", 413);
  const raw = await req.text();
  if (raw.length > FILE_MAX_BYTES + 4096) return fail("That file is larger than LinkedIn's Connections.csv can be.", 413);
  let body: { op?: unknown; csv?: unknown } | null = null;
  try {
    body = JSON.parse(raw) as { op?: unknown; csv?: unknown };
  } catch {
    body = null;
  }
  const key = token.slice(-16);
  try {
    switch (body?.op) {
      case "import": {
        if (limited(`paths-import:${key}`, 6, 60 * 60_000)) return fail("That's a lot of uploads at once. Give it a few minutes.", 429);
        const r = await importConnections(token, body.csv);
        return NextResponse.json({ view: r.answer, message: r.message }, { headers: noStore });
      }
      case "delete":
        return NextResponse.json({ view: await deleteConnections(token), message: "Deleted your LinkedIn connections and every way in found from them." }, { headers: noStore });
      default:
        return fail("That didn't go through. Refresh the page and try again.");
    }
  } catch (e) {
    if (e instanceof ActionError) return fail(e.message, /signed out/i.test(e.message) ? 401 : 400);
    throw e;
  }
});
