import { NextRequest, NextResponse } from "next/server";
import { ActionError, activateByToken, claimByToken, claimPage, joinMember, memberByEmail, memberForToken, nameOffByName, nameOffByToken, nameOffSeat, seatNameForJoin } from "@/lib/table";
import { clientIp, limited } from "@/lib/rateLimit";
import { guarded } from "@/lib/apiGuard";
import { emailEnabled, sendEmail } from "@/lib/email";
import { createSignIn, oneTimeEmail } from "@/lib/signin";
import { tidy } from "@/lib/tableFields";
import { isClaimToken } from "@/lib/claimToken";

export const dynamic = "force-dynamic";

/**
 * Claim links and Remove my name (lib/table.ts claimPage and the functions after it). Every answer
 * that touches a person's name is the same whoever asks, and none names anyone.
 *
 * GET  ?t=TOKEN[&ref=CODE]              the claim page's seat, as claimPage says (status, free facts only).
 * POST { op: "claim", t, ref }          signed in: claim the seat (claimSeat, with the name rule). With the invite
 *                                       code from the link (ref), the claim connects them with whoever sent it
 *                                       (Invite to connect). A seat that is theirs already just connects.
 * POST { op: "join", t, name, email, ref }  join free and claim it. With email off the member is in at
 *                                       once and the seat is claimed. With email on, the link to finish
 *                                       joining (or to sign in, for an address that is a member's) comes
 *                                       back to this page and claims it there. Same answer either way.
 * POST { op: "email", t, email, ref }   a one-time sign-in link back to this page. Same answer for any address.
 * POST { op: "notme" | "remove", t }    the name comes off the seat, no account needed (rate-limited by network). On a
 *                                       link whose fractional has more seats, off every seat of theirs still named.
 * POST { op: "activate", t, ref, skip, show, email?, name? }  Activate your fractional profile (a fractional with
 *                                       more than one seat): signed in, claim every seat of theirs but `skip` and
 *                                       connect with everyone who invited them; signed out, join with `email` (the
 *                                       name on the seats, or `name` when that won't do) and then the same, or with
 *                                       email on, a link back here that does it.
 * POST { op: "notmine-seat", t, seat }  "Not mine" on one seat of the activation page: its name comes off.
 * POST { op: "forget", name, company }  the public Remove my name page: the same answer whatever matched.
 */

const COOKIE = "rn_table";
const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
const SLOW = "That's a lot in a short time. Give it a few minutes, then try again.";
const BAD_LINK = "That claim link didn't work. It may be cut short. Open the whole link from the message.";
/** The public Remove my name page says this whatever matched, so it can't be used to look names up. */
const FORGET_ANSWER =
  "Done. If your name was on Merlin at that company, on a seat or read from the company's website, it's off now and stays off. Anyone who paid to see it got their credit back.";

const origin = (req: NextRequest) =>
  process.env.RN_PUBLIC_URL?.replace(/\/$/, "") ||
  `${req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}`;

function withSession(req: NextRequest, res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

/** The invite code a link carried (?ref=), as it may go back into one: 40 base64url characters at most. */
const refOf = (raw: unknown) => (typeof raw === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(raw.trim()) ? raw.trim() : null);

/**
 * A one-time link that signs in (or finishes joining) and comes back to this claim page to claim the
 * seat, with the invite code the page came with (so the claim still connects them). In the background.
 */
function sendBack(req: NextRequest, m: { id: string; name: string; email: string }, purpose: "signin" | "join", t: string, ref: string | null = null, more = "") {
  void (async () => {
    const { token, code } = await createSignIn(m.id, purpose);
    const e = oneTimeEmail(m.name, `${origin(req)}/claim/${t}?k=${encodeURIComponent(token)}&go=1${ref ? `&ref=${encodeURIComponent(ref)}` : ""}${more}`, code, purpose);
    await sendEmail(m.email, e.subject, e.text, e.html);
  })().catch((e) => console.error("claim link email failed", e));
}

export const GET = guarded(async (req: NextRequest) => {
  const ip = clientIp(req);
  if (limited(`claimget:${ip}`, 120, 60_000)) return err(SLOW, 429);
  const t = req.nextUrl.searchParams.get("t");
  const page = await claimPage(t, req.cookies.get(COOKIE)?.value ?? null, req.nextUrl.searchParams.get("ref"));
  return NextResponse.json(page, { headers: { "cache-control": "no-store" } });
});

export const POST = guarded(async (req: NextRequest) => {
  const ip = clientIp(req);
  let body: Record<string, unknown> | null = null;
  try {
    const text = await req.text();
    if (text.length > 8 * 1024) return err("That's too much to send at once.", 413);
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object") return err("That didn't go through. Refresh the page and try again.");
  const op = String(body.op ?? "");
  const token = req.cookies.get(COOKIE)?.value ?? null;

  if (op === "forget") {
    // Rate-limited by network, and the answer is the same whatever matched.
    if (limited(`forget:${ip}`, 10, 60 * 60_000)) return err(SLOW, 429);
    const name = tidy(body.name, 80);
    const company = tidy(body.company, 120);
    if (!/\p{L}.*\s+.*\p{L}/u.test(name)) return err("Type your first and last name, the way they show on the seat.");
    if (company.length < 2) return err("Type the company's name or its website.");
    await nameOffByName(name, company);
    return NextResponse.json({ ok: true, message: FORGET_ANSWER }, { headers: { "cache-control": "no-store" } });
  }

  const t = body.t;
  if (!isClaimToken(t)) return err(BAD_LINK);
  const ref = refOf(body.ref);

  if (op === "notme" || op === "remove") {
    if (limited(`nameoff:${ip}`, 20, 60 * 60_000)) return err(SLOW, 429);
    const r = await nameOffByToken(t, op, token);
    if (!r.done && r.why === "invalid") return err(BAD_LINK);
    const message =
      op === "remove"
        ? r.done
          ? "Done. Your name is off that seat for everyone now, and it won't show on Merlin."
          : r.why === "held"
            ? "This seat is claimed by a member now, so its name is theirs. Write to us if that's wrong."
            : "There's no name on this seat, so there was nothing to take off."
        : r.done
          ? "Thanks for telling us. We took that name off the seat, so nobody is shown as holding it."
          : "Thanks for telling us. We'll leave this seat for whoever held it.";
    return NextResponse.json({ ok: true, done: r.done, message }, { headers: { "cache-control": "no-store" } });
  }

  if (op === "claim") {
    if (limited(`claim:${ip}`, 30, 60 * 60_000)) return err(SLOW, 429);
    try {
      const out = await claimByToken(token, t, origin(req), ref);
      return NextResponse.json({ ok: true, claimed: !out.waiting, waiting: out.waiting, message: out.message }, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      if (e instanceof ActionError) return err(e.message);
      throw e;
    }
  }

  // Activate your fractional profile (a fractional with more than one seat, lib/table.ts activateByToken).
  if (op === "notmine-seat") {
    if (limited(`nameoff:${ip}`, 20, 60 * 60_000)) return err(SLOW, 429);
    const r = await nameOffSeat(t, body.seat);
    if (!r.done && r.why === "invalid") return err(BAD_LINK);
    return NextResponse.json(
      { ok: true, done: r.done, message: r.done ? "Thanks. That seat's name is off, so it isn't yours on Merlin." : "That seat is claimed by a member now, so its name is theirs." },
      { headers: { "cache-control": "no-store" } },
    );
  }

  if (op === "activate") {
    const skip = Array.isArray(body.skip) ? body.skip.filter((x): x is string => typeof x === "string" && /^e_[A-Za-z0-9_-]{6,20}$/.test(x)).slice(0, 200) : [];
    const show = body.show !== false;
    const activate = async (memberToken: string) => {
      const out = await activateByToken(memberToken, t, { origin: origin(req), ref, skip, show });
      return { ok: true, activated: true, message: out.message, record: out.id ?? null, conversationId: out.conversationId };
    };
    if (token && (await memberForToken(token))) {
      if (limited(`claim:${ip}`, 30, 60 * 60_000)) return err(SLOW, 429);
      try {
        return NextResponse.json(await activate(token), { headers: { "cache-control": "no-store" } });
      } catch (e) {
        if (e instanceof ActionError) return err(e.message);
        throw e;
      }
    }
    // Signed out: join with the name on the seats (never shown on the page), or the one they typed when that one won't do.
    if (limited(`join:${ip}`, 10, 60 * 60_000)) return err("That's 10 sign-ups from this network in an hour, which is the limit. Try again in an hour.", 429);
    const email = String(body.email ?? "").trim().toLowerCase().slice(0, 120);
    if (emailEnabled() && limited(`email:${email}`, 3, 20 * 60_000)) return err("We've sent 3 links to that email in the last 20 minutes. Check your inbox and spam, or try again later.", 429);
    const typed = tidy(body.name, 80);
    const name = typed || (await seatNameForJoin(t)) || "";
    try {
      const m = await joinMember(name, email, ref, ip);
      if (emailEnabled()) {
        const more = `${skip.length ? `&skip=${encodeURIComponent(skip.join(","))}` : ""}${show ? "" : "&show=0"}`;
        sendBack(req, m, m.existing ? "signin" : "join", t, ref, more);
        return NextResponse.json({ ok: true, sent: true }, { headers: { "cache-control": "no-store" } });
      }
      let answer: Record<string, unknown>;
      try {
        answer = await activate(m.token);
      } catch (e) {
        if (!(e instanceof ActionError)) throw e;
        answer = { ok: true, activated: false, message: e.message };
      }
      return withSession(req, NextResponse.json(answer, { headers: { "cache-control": "no-store" } }), m.token);
    } catch (e) {
      if (e instanceof ActionError) {
        // The name on the seats doesn't read as a first and last name: the page asks for theirs.
        if (!typed && /first and last name/i.test(e.message)) return NextResponse.json({ error: "Add your first and last name, the way you work under it.", needName: true }, { status: 400, headers: { "cache-control": "no-store" } });
        return err(e.message);
      }
      throw e;
    }
  }

  if (op === "email") {
    if (!emailEnabled()) return err("Email sign-in isn't on yet. Paste your personal sign-in link instead.");
    if (limited(`email:${ip}`, 5, 60 * 60_000)) return err("That's 5 requests in an hour, which is the limit. Check your inbox, or try again in an hour.", 429);
    const email = String(body.email ?? "").trim().toLowerCase().slice(0, 120);
    if (limited(`email:${email}`, 3, 20 * 60_000)) return err("We've sent 3 links to that email in the last 20 minutes. Check your inbox and spam, or try again later.", 429);
    const m = await memberByEmail(email);
    if (m?.email) sendBack(req, m, "signin", t, ref);
    return NextResponse.json({ ok: true, sent: true, message: "If that email is on Merlin, a link is on its way. Open it and the seat is yours." }, { headers: { "cache-control": "no-store" } });
  }

  if (op === "join") {
    // The same limits as joining from the homepage (app/api/table/route.ts): this network's sign-ups, and the per-address emails.
    if (limited(`join:${ip}`, 10, 60 * 60_000)) return err("That's 10 sign-ups from this network in an hour, which is the limit. Try again in an hour.", 429);
    const email = String(body.email ?? "").trim().toLowerCase().slice(0, 120);
    if (emailEnabled() && limited(`email:${email}`, 3, 20 * 60_000)) return err("We've sent 3 links to that email in the last 20 minutes. Check your inbox and spam, or try again later.", 429);
    try {
      // ?ref= came with the link: the invite counts the way an invite link's does.
      const m = await joinMember(tidy(body.name, 80), email, ref, ip);
      if (emailEnabled()) {
        sendBack(req, m, m.existing ? "signin" : "join", t, ref);
        return NextResponse.json({ ok: true, sent: true }, { headers: { "cache-control": "no-store" } });
      }
      // In at once: the seat is claimed now, or the claim waits for an admin (the name on it isn't theirs). A claim that can't go through still leaves them signed in, with the reason.
      let message: string;
      let claimed = false;
      let waiting = false;
      try {
        const out = await claimByToken(m.token, t, origin(req), ref);
        message = out.message;
        waiting = out.waiting;
        claimed = !out.waiting;
      } catch (e) {
        if (!(e instanceof ActionError)) throw e;
        message = e.message;
      }
      return withSession(req, NextResponse.json({ ok: true, claimed, waiting, message }, { headers: { "cache-control": "no-store" } }), m.token);
    } catch (e) {
      if (e instanceof ActionError) return err(e.message);
      throw e;
    }
  }

  return err("That didn't go through. Refresh the page and try again.");
});
