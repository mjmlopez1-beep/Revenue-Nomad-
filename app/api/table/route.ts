import { NextRequest, NextResponse } from "next/server";
import { ActionError, buildView, joinMember, memberForToken, perform, type Action } from "@/lib/table";

export const dynamic = "force-dynamic";

const COOKIE = "rn_table";

function withSession(req: NextRequest, res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Follow the real protocol (proxies set x-forwarded-proto) so http:// localhost still works.
    secure: (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

/** GET: the record table as the signed-in member sees it. */
export async function GET(req: NextRequest) {
  return NextResponse.json(await buildView(req.cookies.get(COOKIE)?.value ?? null));
}

/**
 * POST { signIn: tokenOrLink }  sign in with a personal link or the code at the end of it.
 * POST { join: { name, email } } join from the landing page (new people, not existing members).
 * POST { signOut: true }         sign out.
 * POST { action: {...} }         fill / unlock / verify / add / addContact / report / review.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid body" }, { status: 400 });

  if (typeof body.signIn === "string") {
    // Accept a whole pasted link (…?k=CODE) or just the code.
    const raw = body.signIn.trim();
    const token = raw.match(/[?&]k=([^&#\s]+)/)?.[1] ?? raw;
    const m = await memberForToken(token);
    if (!m) return NextResponse.json({ error: "That sign-in link or code isn't valid." }, { status: 401 });
    return withSession(req, NextResponse.json({ ok: true }), m.token);
  }
  if (body.join && typeof body.join === "object") {
    try {
      const m = await joinMember(body.join.name, body.join.email);
      return withSession(req, NextResponse.json({ ok: true }), m.token);
    } catch (e) {
      if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }
  }
  if (body.signOut) {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(COOKIE);
    return res;
  }

  try {
    return NextResponse.json(await perform(req.cookies.get(COOKIE)?.value ?? null, body.action as Action));
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
