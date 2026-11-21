import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { clientIp, limited } from "@/lib/rateLimit";
import { ProposalProblem, declineProposal, requestCode, signProposal, signerView, verifyCode } from "@/lib/proposals/store";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const origin = (req: NextRequest) =>
  process.env.RN_PUBLIC_URL?.replace(/\/$/, "") ||
  `${req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}`;
const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: NO_STORE });

/**
 * The client's side of a proposal (lib/proposals/store.ts), with no account: the signed link's
 * token is the only key. Every step goes on the audit trail with the IP address and browser.
 *
 * POST { token, op: "view" }                      SignerView (the first open is noted)
 * POST { token, op: "code" }                      email a 6-digit code to the signer
 * POST { token, op: "verify", code }              confirm it
 * POST { token, op: "sign", name, consent, hash } sign: the full name typed, consent true, the hash of the document shown
 * POST { token, op: "decline", reason? }
 */
export const POST = guarded(async (req: NextRequest) => {
  const ip = clientIp(req);
  if (limited(`sign:${ip}`, 60, 60_000)) return err("That's a lot in one minute. Give it a moment, then try again.", 429);
  const text = await req.text();
  if (text.length > 16 * 1024) return err("That's too much to send at once.", 413);
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(text);
  } catch {
    return err("That didn't go through. Refresh the page and try again.");
  }
  if (!b || typeof b !== "object") return err("That didn't go through. Refresh the page and try again.");
  const token = typeof b.token === "string" ? b.token.slice(0, 120) : "";
  const who = { ip, ua: (req.headers.get("user-agent") ?? "").slice(0, 300) };
  const o = origin(req);
  try {
    switch (b.op) {
      case "view":
        return NextResponse.json(await signerView(token, who, o), { headers: NO_STORE });
      case "code":
        if (limited(`sign-code:${ip}`, 10, 60 * 60_000)) return err("That's a lot of codes from here in an hour. Use the newest one, or try again later.", 429);
        return NextResponse.json(await requestCode(token, who), { headers: NO_STORE });
      case "verify":
        if (limited(`sign-verify:${ip}`, 20, 10 * 60_000)) return err("That's a lot of tries. Wait 10 minutes, then try again.", 429);
        return NextResponse.json(await verifyCode(token, b.code, who, o), { headers: NO_STORE });
      case "sign":
        return NextResponse.json(await signProposal(token, { name: b.name, consent: b.consent, hash: b.hash }, who, o), { headers: NO_STORE });
      case "decline":
        return NextResponse.json(await declineProposal(token, { reason: b.reason }, who, o), { headers: NO_STORE });
      default:
        return err("That didn't go through. Refresh the page and try again.");
    }
  } catch (e) {
    if (e instanceof ProposalProblem) return err(e.message, e.status);
    throw e;
  }
});
