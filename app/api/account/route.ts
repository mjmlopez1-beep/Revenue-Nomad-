import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { limited } from "@/lib/rateLimit";
import { ActionError } from "@/lib/table";
import { adminRestore, closeAccount, closedAccounts } from "@/lib/account";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOKIE = "rn_table";
const NO_STORE = { "cache-control": "no-store" };
const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: NO_STORE });
const originOf = (req: NextRequest) =>
  process.env.RN_PUBLIC_URL?.replace(/\/$/, "") || `${req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}`;

/**
 * Closing an account (lib/account.ts).
 *
 * GET  ?closed=1                         admins: the closed accounts, with when their data goes.
 * POST { op: "close", confirm: true }    the member closes their own account now (signed out at once).
 * POST { op: "close", memberId, confirm: true }  an admin closes another member's.
 * POST { op: "restore", memberId }       an admin brings one back within its 30 days.
 * The member's own restore link is GET /api/account/restore?k=...
 */
export const GET = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  if (req.nextUrl.searchParams.get("closed") !== "1") return err("Nothing here.", 404);
  try {
    return NextResponse.json({ closed: await closedAccounts(token) }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ActionError) return err(e.message, 403);
    throw e;
  }
});

export const POST = guarded(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const body = (await req.json().catch(() => null)) as { op?: unknown; confirm?: unknown; memberId?: unknown } | null;
  if (!body || typeof body !== "object") return err("That didn't go through. Refresh the page and try again.");
  if (limited(`account:${token ?? "none"}`, 10, 60 * 60_000)) return err("That's a lot of tries in an hour. Try again later.", 429);
  try {
    if (body.op === "close") {
      if (body.confirm !== true) return err("Confirm that you want to close the account.");
      const r = await closeAccount(token, { origin: originOf(req), ...(typeof body.memberId === "string" ? { memberId: body.memberId } : {}) });
      const res = NextResponse.json(r, { headers: NO_STORE });
      // Their own: this browser signs out too (the token stopped working everywhere already).
      if (typeof body.memberId !== "string") res.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
      return res;
    }
    if (body.op === "restore") return NextResponse.json(await adminRestore(token, body.memberId), { headers: NO_STORE });
    return err("Unknown request.");
  } catch (e) {
    if (e instanceof ActionError) return err(e.message, 403);
    throw e;
  }
});
