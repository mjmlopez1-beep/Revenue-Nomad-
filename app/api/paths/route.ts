/**
 * Smart ways in (lib/paths), for the signed-in member only (the app's cookie).
 *
 * GET                        PathsView: the member's LinkedIn import, ways in by company (counts), Your hidden paths
 * GET ?company=<public id>   CompanyPathsView: that company's ways in, best first
 * POST { op: "import", csv } the member's own Connections.csv, as text (replaces the last one)
 * POST { op: "delete" }      delete the import and everything worked out from it
 * GET ?known=1               KnownView: everyone the member knows at companies on Merlin, from each of their own sources
 * POST { op: "importCsv", csv }   the member's own contacts CSV, only the columns they picked (lib/paths/csv.ts pickColumns)
 * POST { op: "deleteCsv" }   delete the contacts CSV and everything worked out from it
 * POST { op: "away", key, on }    "Not a relationship" on someone they know (on: false is Undo)
 * GET ?warm=1                WarmView: Warm paths (the new look), every company that fits placed by fit and by way in (lib/paths/ways.ts warmOf)
 * GET ?suggest=1             SuggestView: Suggested additions from your connections (RN_SUGGEST only; lib/paths/suggest.ts)
 * POST { op: "suggestAdd", keys }  add the ticked people (name, title and relationship only), 1 credit each within the day's cap
 * POST { op: "suggestSkip", keys } never suggest these again
 * GET ?map=1                 GetInView: Where you can get in, every company that fits the member, placed (lib/paths/ways.ts)
 * GET ?way=<public id>       WayInView: Your way into that company, its routes with Est. success, and the member's plan
 * GET ?plans=1               { plans: PlanLine[] }: the member's plans, for Home's move and the pipeline's route line
 * POST { op: "way", company, do: "go", route }                 go with a route (creates or updates the pipeline deal)
 * POST { op: "way", company, do: "step", step, answer }        what happened at a step (sent, intro, noreply, nudged, cant, booked)
 * POST { op: "way", company, do: "drop" }                      drop the plan (the deal stays)
 *                            Nothing is ever sent from here, and no credit is spent.
 * Every answer is { view } (or { company }, { known }) or { error }. { on: false } with RN_PATHS off. The
 * LinkedIn file and the contacts CSV need no Google (RN_GOOGLE): each source works on its own.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { ActionError } from "@/lib/table";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { companyPaths, deleteConnections, deleteContacts, importConnections, importContacts, knownView, pathsView, setAway } from "@/lib/paths";
import { FILE_MAX_BYTES } from "@/lib/paths/types";
import { getInView, planLines, warmView, wayAct, wayIn, type WayOp } from "@/lib/paths/ways";
import { suggestAdd, suggestSkip, suggestView } from "@/lib/paths/suggest";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };
const SIGNED_OUT = "You're signed out. Sign in again.";
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

export const GET = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const sp = req.nextUrl.searchParams;
  if (sp.get("map") !== null) {
    const v = await getInView(token);
    if (!v) return fail(SIGNED_OUT, 401);
    return NextResponse.json({ map: v }, { headers: noStore });
  }
  if (sp.get("warm") !== null) {
    const v = await warmView(token);
    if (!v) return fail(SIGNED_OUT, 401);
    return NextResponse.json({ warm: v }, { headers: noStore });
  }
  if (sp.get("suggest") !== null) {
    const v = await suggestView(token);
    if (!v) return fail(SIGNED_OUT, 401);
    return NextResponse.json({ suggest: v }, { headers: noStore });
  }
  if (sp.get("known") !== null) {
    const v = await knownView(token);
    if (!v) return fail(SIGNED_OUT, 401);
    return NextResponse.json({ known: v }, { headers: noStore });
  }
  if (sp.get("plans") !== null) {
    const v = await planLines(token);
    if (!v) return fail(SIGNED_OUT, 401);
    return NextResponse.json(v, { headers: noStore });
  }
  const way = sp.get("way");
  if (way !== null) {
    const v = await wayIn(token, way);
    if (!v) return fail(SIGNED_OUT, 401);
    return NextResponse.json({ way: v }, { headers: noStore });
  }
  const company = sp.get("company");
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
  if (size > FILE_MAX_BYTES + 4096) return fail("That file is too large. Pick one under 8 MB.", 413);
  const raw = await req.text();
  if (raw.length > FILE_MAX_BYTES + 4096) return fail("That file is too large. Pick one under 8 MB.", 413);
  type Body = { op?: unknown; csv?: unknown; company?: unknown; do?: unknown; route?: unknown; step?: unknown; answer?: unknown; key?: unknown; on?: unknown; keys?: unknown };
  let body: Body | null = null;
  try {
    body = JSON.parse(raw) as Body;
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
      case "importCsv": {
        if (limited(`paths-import:${key}`, 6, 60 * 60_000)) return fail("That's a lot of uploads at once. Give it a few minutes.", 429);
        const r = await importContacts(token, body.csv);
        return NextResponse.json({ view: r.answer, message: r.message }, { headers: noStore });
      }
      case "deleteCsv":
        return NextResponse.json({ view: await deleteContacts(token), message: "Deleted your contacts file and every way in found from it." }, { headers: noStore });
      case "away": {
        if (limited(`paths-away:${key}`, 240, 60 * 60_000)) return fail("That's a lot at once. Give it a few minutes.", 429);
        const on = body.on !== false;
        return NextResponse.json({ known: await setAway(token, body.key, on), message: on ? "Set aside. Merlin remembers it on every read." : "Back in People I know." }, { headers: noStore });
      }
      case "way": {
        if (limited(`paths-way:${key}`, 120, 60 * 60_000)) return fail("That's a lot at once. Give it a few minutes.", 429);
        const d = body.do;
        const op: WayOp | null =
          d === "go" ? { do: "go", route: String(body.route ?? "").slice(0, 40) } : d === "step" ? { do: "step", step: Number(body.step), answer: String(body.answer ?? "") as never } : d === "drop" ? { do: "drop" } : null;
        if (!op) return fail("That didn't go through. Refresh the page and try again.");
        const r = await wayAct(token, body.company, op);
        return NextResponse.json({ way: r.view, message: r.message }, { headers: noStore });
      }
      case "suggestAdd": {
        if (limited(`paths-suggest:${key}`, 30, 60 * 60_000)) return fail("That's a lot at once. Give it a few minutes.", 429);
        const r = await suggestAdd(token, body.keys);
        return NextResponse.json({ suggest: r.view, message: r.message, added: r.added, earned: r.earned }, { headers: noStore });
      }
      case "suggestSkip": {
        if (limited(`paths-suggest:${key}`, 30, 60 * 60_000)) return fail("That's a lot at once. Give it a few minutes.", 429);
        return NextResponse.json({ suggest: await suggestSkip(token, body.keys), message: "Merlin won't suggest them again." }, { headers: noStore });
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
