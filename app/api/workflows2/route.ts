/**
 * Workflows v2 (lib/workflows/v2.ts, RN_WORKFLOWS_V2). With the switch off every request is a 404 and
 * nothing changes anywhere. Signed in only (the member's cookie, never a bearer token); a POST must
 * come from Merlin's own pages (its Origin).
 *
 * GET                                  list: the member's workflows, the catalog, the plan
 * GET ?id=                             one workflow: live and draft, their checks, the webhook's link
 * GET ?id=&runs=1                      its runs, newest first
 * GET ?id=&run=                        one run: each node's input, output, status, credits and time
 * POST { op: "save", id?, name, version, cap?, warn?, notifyOnFail? }   save a draft (refused in plain words)
 * POST { op: "live", id }              Make live
 * POST { op: "on", id, on }            the workflow's switch
 * POST { op: "node", id, node, on }    a node's switch
 * POST { op: "test", id, sample? }     a test run: never spends, never sends
 * POST { op: "retry", id, run }        Retry from the failed node
 * POST { op: "answer", run, yes }      a tap on a waiting run (Ask me, Approve and send, a yes on credits)
 * POST { op: "run", id }               Run now
 * POST { op: "remove", id }
 * POST { op: "describe", text }        a sentence to a draft graph (never live)
 * POST ?hook=<id>.<secret>             an incoming webhook: that workflow's own secret is the only key
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { V2Problem, answer, describeFor, getOne, hookCall, list, makeLive, remove, retry, runNow, runOf, runs, save, setNodeOn, setOn, test, v2On } from "@/lib/workflows/v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });
const NOT_FOUND = () => fail("Not found.", 404);

async function answerWith(work: () => Promise<unknown>) {
  try {
    return NextResponse.json(await work(), { headers: noStore });
  } catch (e) {
    if (e instanceof V2Problem) return fail(e.message, e.status);
    throw e;
  }
}

export const GET = guarded(async (req: NextRequest) => {
  if (!v2On()) return NOT_FOUND();
  if (req.headers.get("authorization")) return fail("Workflows are in the Merlin app only.", 403);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (!token) return fail("You're signed out. Sign in again.", 401);
  if (limited(`wf2-get:${token.slice(-16)}`, 240, 60_000)) return fail("That's a lot in one minute. Give it a moment.", 429);
  const q = req.nextUrl.searchParams;
  const id = q.get("id");
  if (!id) return answerWith(() => list(token));
  if (q.get("run")) return answerWith(() => runOf(token, id, q.get("run")));
  if (q.get("runs") === "1") return answerWith(() => runs(token, id));
  return answerWith(() => getOne(token, id, publicOrigin(req)));
});

export const POST = guarded(async (req: NextRequest) => {
  if (!v2On()) return NOT_FOUND();
  // An incoming webhook: another tool calls the workflow's own link. Its secret is the only key.
  const hook = req.nextUrl.searchParams.get("hook");
  if (hook) {
    if (limited(`wf2-hook:${hook.split(".")[0]}`, 30, 60_000)) return fail("Too many calls. Give it a minute.", 429);
    const raw = (await req.text()).slice(0, 8192);
    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
    return answerWith(() => hookCall(hook, body));
  }
  if (req.headers.get("authorization")) return fail("Workflows are in the Merlin app only.", 403);
  const origin = req.headers.get("origin");
  if (!origin || (origin !== publicOrigin(req) && origin !== req.nextUrl.origin)) return fail("That didn't come from Merlin.", 403);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (!token) return fail("You're signed out. Sign in again.", 401);
  if (limited(`wf2-post:${token.slice(-16)}`, 60, 60_000)) return fail("That's a lot in one minute. Give it a moment.", 429);
  const text = await req.text();
  if (text.length > 200_000) return fail("That workflow is too big to save.", 413);
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return fail("That didn't go through. Refresh the page and try again.");
  }
  const at = publicOrigin(req);
  switch (b?.op) {
    case "save":
      return answerWith(() => save(token, b));
    case "live":
      return answerWith(() => makeLive(token, b.id));
    case "on":
      return answerWith(() => setOn(token, b.id, b.on === true));
    case "node":
      return answerWith(() => setNodeOn(token, b.id, b.node, b.on === true));
    case "test":
      if (limited(`wf2-test:${token.slice(-16)}`, 20, 60_000)) return fail("That's a lot of tests at once. Give it a minute.", 429);
      return answerWith(() => test(token, b.id, b.sample, at));
    case "retry":
      return answerWith(() => retry(token, b.id, b.run, at));
    case "answer":
      return answerWith(() => answer(token, b.run, b.yes === true, at));
    case "run":
      return answerWith(() => runNow(token, b.id, at));
    case "remove":
      return answerWith(() => remove(token, b.id));
    case "describe":
      if (limited(`wf2-describe:${token.slice(-16)}`, 10, 60_000)) return fail("That's a lot at once. Give it a minute.", 429);
      return answerWith(() => describeFor(token, b.text));
    default:
      return fail("Unknown request.");
  }
});
