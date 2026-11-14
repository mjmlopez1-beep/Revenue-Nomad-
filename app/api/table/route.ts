import { NextRequest, NextResponse } from "next/server";
import { ActionError, buildView, loadSeed, memberByToken, perform, type Action } from "@/lib/table";

export const dynamic = "force-dynamic";

const COOKIE = "rn_table";

/** GET: the table as the signed-in member sees it. */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value ?? null;
  return NextResponse.json(await buildView(token));
}

/**
 * POST { signIn: token } sets the member cookie from a personal link.
 * POST { action: {...} } performs a give/get action.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid body" }, { status: 400 });

  if (typeof body.signIn === "string") {
    const seed = await loadSeed();
    const m = memberByToken(seed, body.signIn);
    if (!m) return NextResponse.json({ error: "That link isn't valid." }, { status: 401 });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, m.token, {
      httpOnly: true,
      sameSite: "lax",
      // Follow the real protocol (proxies set x-forwarded-proto) so http:// localhost still works.
      secure: (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  }
  if (body.signOut) {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(COOKIE);
    return res;
  }

  try {
    const result = await perform(req.cookies.get(COOKIE)?.value ?? null, body.action as Action);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
