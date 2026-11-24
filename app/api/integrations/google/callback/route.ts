/**
 * GET /api/integrations/google/callback: where Google sends the member back after consent
 * (lib/google finishConnect). Then to Your network with ?google=connected, gmail, denied, scopes
 * or failed. The code and tokens are never logged or sent to the browser; the page that follows
 * sends no referrer.
 *
 * The Authorized redirect URI on the OAuth client: `${RN_PUBLIC_URL}/api/integrations/google/callback`.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { publicOrigin } from "@/lib/mcp/http";
import { finishConnect } from "@/lib/google";
import { STATE_COOKIE, STATE_COOKIE_PATH } from "@/lib/google/config";
import { SEND_BACK_COOKIE, SEND_STATE_COOKIE, finishGrant, isSendState } from "@/lib/send";

export const dynamic = "force-dynamic";
const COOKIE = "rn_table";
const noStore = { "cache-control": "no-store" };

export const GET = guarded(async (req: NextRequest) => {
  const origin = publicOrigin(req);
  const q = req.nextUrl.searchParams;
  // Approve and send's one extra permission (lib/send): back to the page the note was approved on, and it sends.
  if (isSendState(q.get("state"))) {
    const out = await finishGrant(req.cookies.get(COOKIE)?.value ?? null, { state: q.get("state"), code: q.get("code"), error: q.get("error") }, req.cookies.get(SEND_STATE_COOKIE)?.value ?? null, origin);
    const r = NextResponse.redirect(`${origin}${out.back}#rn-send=${out.outcome}${out.id ? `.${out.id}` : ""}`, { status: 303, headers: { ...noStore, "referrer-policy": "no-referrer" } });
    r.cookies.set(SEND_STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"), path: STATE_COOKIE_PATH, maxAge: 0 });
    // The page may tidy its address before the app reads the hash: the same answer, for two minutes, in a cookie the app reads once and clears.
    r.cookies.set(SEND_BACK_COOKIE, `${out.outcome}${out.id ? `.${out.id}` : ""}`, { httpOnly: false, sameSite: "lax", secure: origin.startsWith("https://"), path: "/", maxAge: 120 });
    return r;
  }
  const { outcome } = await finishConnect(
    req.cookies.get(COOKIE)?.value ?? null,
    { state: q.get("state"), code: q.get("code"), error: q.get("error") },
    req.cookies.get(STATE_COOKIE)?.value ?? null,
    origin,
  );
  const res = NextResponse.redirect(`${origin}/?p=network&google=${outcome}`, { status: 303, headers: { ...noStore, "referrer-policy": "no-referrer" } });
  res.cookies.set(STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"), path: STATE_COOKIE_PATH, maxAge: 0 });
  return res;
});
