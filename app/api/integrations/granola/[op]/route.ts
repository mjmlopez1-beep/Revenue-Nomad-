/**
 * Granola (lib/granola), for the signed-in member only (the app's cookie). Off (404) unless RN_GRANOLA=1,
 * except status, which says { on: false }.
 *
 * GET  status                       GranolaStatus: connected or not (and how), the key's last four characters, canDraft, and
 *                                   whether Connect Granola is offered (oauth). Never a key or a token.
 * GET  start?back=<path>            Connect Granola: to Granola's consent page (OAuth 2.1 with PKCE, lib/granola/oauth.ts),
 *                                   with a sealed one-time state cookie bound to the member's session
 * GET  callback                     Granola's answer: the code swapped for tokens, kept sealed, then back to <path>
 *                                   with ?granola=connected|denied|failed|unavailable. The redirect address registered
 *                                   with Granola: `${RN_PUBLIC_URL}/api/integrations/granola/callback`.
 * POST connect { key }              the fallback: check a pasted API key with one call to Granola, then keep it sealed
 * POST disconnect                   delete the connection (a sign-in's tokens revoked at Granola first, when it can)
 * GET  calls?company=<id>           recent calls (last 30 days) with anyone at that company's domain, newest first
 *                                   (kept 2 minutes per member and query; up to 10 fresh asks of Granola a minute)
 * GET  calls?email=<addr>           ... with that person
 * GET  calls?recent=1               ... any recent call
 *      &titles=1                    with each note's title (the member asked to see them)
 * GET  transcript?note=<not_id>     the picked call's transcript and attendees, for drafting (Close; the trial counts)
 *
 * Every answer is JSON with no-store. Errors are { error, code } in the member's words.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { publicOrigin } from "@/lib/mcp/http";
import { limited } from "@/lib/rateLimit";
import { GranolaProblem, backPath, backWith, connectGranola, disconnectGranola, finishSignIn, granolaCalls, granolaStatus, startSignIn, transcriptForPicker } from "@/lib/granola";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH } from "@/lib/granola/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };
const SIGNED_OUT = "You're signed out. Sign in again.";
const SLOW = "That's a lot of tries in a few minutes. Give it a moment, then try again.";
/** The calls list: a list Merlin kept from the last 2 minutes doesn't count, only a fresh ask of Granola does. */
const SLOW_CALLS = "Merlin asked Granola for your calls a lot just now. Wait a minute, then try again.";
const CALLS_PER_MINUTE = 10;
const fail = (error: string, status = 400, code = "") => NextResponse.json({ error, ...(code ? { code } : {}) }, { status, headers: noStore });
type Ctx = { params: Promise<{ op: string }> };

async function answer(work: () => Promise<unknown>) {
  try {
    return NextResponse.json(await work(), { headers: noStore });
  } catch (e) {
    if (e instanceof GranolaProblem) return fail(e.message, e.status, e.code);
    throw e;
  }
}

export const GET = guarded(async (req: NextRequest, ctx: Ctx) => {
  const { op } = await ctx.params;
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const q = req.nextUrl.searchParams;
  if (op === "status") {
    const status = await granolaStatus(token);
    return status ? NextResponse.json({ status }, { headers: noStore }) : fail(SIGNED_OUT, 401, "signed_out");
  }
  // Connect Granola: the consent page, and the way back. Both are page loads, so they answer with a redirect.
  if (op === "start" || op === "callback") {
    const origin = publicOrigin(req);
    const secure = origin.startsWith("https://");
    const go = (path: string, status = 303) => NextResponse.redirect(`${origin}${path}`, { status, headers: { ...noStore, "referrer-policy": "no-referrer" } });
    if (op === "start") {
      if (!token) return go("/");
      if (limited(`granola-start:${token.slice(-16)}`, 10, 10 * 60_000)) return go(backWith(backPath(q.get("back")), "failed"));
      const out = await startSignIn(token, q.get("back"));
      if (!out.ok) return out.why === "unavailable" ? go(backWith(out.back, "unavailable")) : go("/");
      const res = NextResponse.redirect(out.url, { status: 302, headers: { ...noStore, "referrer-policy": "no-referrer" } });
      res.cookies.set(OAUTH_COOKIE, out.cookie, { httpOnly: true, sameSite: "lax", secure, path: OAUTH_COOKIE_PATH, maxAge: 600 });
      return res;
    }
    const { outcome, back } = await finishSignIn(token, { state: q.get("state"), code: q.get("code"), error: q.get("error") }, req.cookies.get(OAUTH_COOKIE)?.value ?? null);
    const res = go(backWith(back, outcome));
    res.cookies.set(OAUTH_COOKIE, "", { httpOnly: true, sameSite: "lax", secure, path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return res;
  }
  if (!token) return fail(SIGNED_OUT, 401, "signed_out");
  const key = token.slice(-16);
  if (op === "calls") {
    // Counted per minute (so "wait a minute" is true), and only when the list really goes to Granola.
    const gate = () => {
      if (limited(`granola-calls:${key}`, CALLS_PER_MINUTE, 60_000)) throw new GranolaProblem(SLOW_CALLS, 429, "slow");
    };
    return answer(() => granolaCalls(token, { companyId: q.get("company") ?? undefined, email: q.get("email") ?? undefined, recent: q.get("recent") ?? undefined, titles: q.get("titles") ?? undefined }, undefined, { gate }));
  }
  if (op === "transcript") {
    if (limited(`granola-transcript:${key}`, 20, 10 * 60_000)) return fail(SLOW, 429, "slow");
    return answer(() => transcriptForPicker(token, q.get("note"), { titles: q.get("titles") ?? undefined }));
  }
  return fail("Nothing here.", 404);
});

export const POST = guarded(async (req: NextRequest, ctx: Ctx) => {
  const { op } = await ctx.params;
  const origin = req.headers.get("origin");
  if (origin && origin !== publicOrigin(req) && origin !== req.nextUrl.origin) return fail("That didn't come from Merlin.", 403);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (!token) return fail(SIGNED_OUT, 401, "signed_out");
  const raw = await req.text();
  if (raw.length > 2048) return fail("That's too much to send.", 413);
  let body: { key?: unknown } = {};
  try {
    body = raw ? (JSON.parse(raw) as { key?: unknown }) : {};
  } catch {
    return fail("That didn't go through. Refresh the page and try again.");
  }
  const key = token.slice(-16);
  if (op === "connect") {
    if (limited(`granola-connect:${key}`, 8, 10 * 60_000)) return fail(SLOW, 429, "slow");
    return answer(() => connectGranola(token, body?.key));
  }
  if (op === "disconnect") return answer(() => disconnectGranola(token));
  return fail("Nothing here.", 404);
});
