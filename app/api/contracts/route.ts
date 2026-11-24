import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { limited } from "@/lib/rateLimit";
import { memberForToken } from "@/lib/table";
import { ProposalProblem } from "@/lib/proposals/store";
import { contracts2On } from "@/lib/documents/store";
import { cancelItem, remindNow, signerLink, signingList } from "@/lib/documents/contracts2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOKIE = "rn_table";
const NO_STORE = { "cache-control": "no-store" };
const origin = (req: NextRequest) =>
  process.env.RN_PUBLIC_URL?.replace(/\/$/, "") ||
  `${req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}`;
const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: NO_STORE });

async function answer(work: () => Promise<unknown>) {
  try {
    return NextResponse.json(await work(), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ProposalProblem) return err(e.message, e.status);
    throw e;
  }
}

/**
 * Contracts, rebuilt (RN_CONTRACTS2, lib/documents/contracts2.ts). Signed in only.
 *
 * GET ?probe=1               { on }: which Contracts page to draw (the shell asks once)
 * GET                         { on: false } while the switch is off (the old Contracts page draws), else Contracts2View
 * POST { op: "remind", id }   email whoever's turn it is again (at most once a day each)
 * POST { op: "link", id, signer? }   the current signer's own link (it still asks for their email code)
 * POST { op: "cancel", id }   void it and tell each signer who had a link
 *
 * Drafts, uploads, fields, saved contracts and sending stay on /api/documents and /api/proposals.
 */
export const GET = guarded(async (req: NextRequest) => {
  if (!contracts2On()) return NextResponse.json({ on: false }, { headers: NO_STORE });
  if (req.nextUrl.searchParams.get("probe") === "1") return NextResponse.json({ on: true }, { headers: NO_STORE });
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) return err("You're signed out. Sign in again to see your contracts.", 401);
  if (limited(`ct2-get:${me.id}`, 120, 60_000)) return err("That's a lot in one minute. Give it a moment, then try again.", 429);
  return answer(() => signingList(token, origin(req)));
});

export const POST = guarded(async (req: NextRequest) => {
  if (!contracts2On()) return err("That isn't switched on.", 404);
  const token = req.cookies.get(COOKIE)?.value ?? null;
  const me = await memberForToken(token);
  if (!me) return err("You're signed out. Sign in again to work on contracts.", 401);
  if (limited(`ct2-post:${me.id}`, 60, 60_000)) return err("That's a lot in one minute. Give it a moment, then try again.", 429);
  let b: Record<string, unknown>;
  try {
    b = JSON.parse((await req.text()).slice(0, 8192));
  } catch {
    return err("That didn't go through. Refresh the page and try again.");
  }
  const id = typeof b?.id === "string" ? b.id : "";
  const o = origin(req);
  switch (b?.op) {
    case "remind":
      return answer(() => remindNow(token, id, o));
    case "link":
      return answer(() => signerLink(token, id, b.signer, o));
    case "cancel":
      return answer(() => cancelItem(token, id, o));
    default:
      return err("That didn't go through. Refresh the page and try again.");
  }
});
