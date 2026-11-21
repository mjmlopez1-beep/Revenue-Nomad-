import { NextResponse, type NextRequest } from "next/server";

/**
 * The page itself (the root address) says whether this browser holds a sign-in cookie, so the app
 * knows on a first visit what a returning member's browser remembers (tp_member, app/Root.tsx):
 * a member gets Home's small first screen (GET ?first=1) before the whole table, not the table
 * first. The sign-in cookie (rn_table) can't be read by the page, so a second one says only that it
 * is there: SIGNED_IN_COOKIE=1, set while rn_table is there and taken off when it is not. It names
 * nobody and opens nothing; the server still decides who the member is from rn_table alone.
 *
 * A browser without the sign-in cookie, and without this one, gets the page exactly as before.
 * The page stays built ahead of time: only this header changes.
 */
export const SIGNED_IN_COOKIE = "rn_in";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const signedIn = !!req.cookies.get("rn_table")?.value;
  const said = req.cookies.get(SIGNED_IN_COOKIE)?.value === "1";
  if (signedIn && !said)
    res.cookies.set(SIGNED_IN_COOKIE, "1", {
      sameSite: "lax",
      path: "/",
      secure: (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https",
    });
  else if (!signedIn && req.cookies.has(SIGNED_IN_COOKIE)) res.cookies.delete(SIGNED_IN_COOKIE);
  return res;
}

/** The root address only: the app lives there (app/page.tsx). In the Node.js server, as everything else. */
export const config = { matcher: "/", runtime: "nodejs" };
