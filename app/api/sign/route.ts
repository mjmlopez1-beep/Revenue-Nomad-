import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/apiGuard";
import { clientIp, limited } from "@/lib/rateLimit";
import { ProposalProblem, askQuestion, chooseOption, handOff, declineProposal, requestCode, signProposal, signerView, verifyCode } from "@/lib/proposals/store";
import { docDecline, docRequestCode, docSavedSignature, docSign, docSignerView, docVerifyCode, isDocToken } from "@/lib/documents/store";

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
 * POST { token, op: "ask", question }             a question to the member, by email (reply-to the signer)
 * POST { token, op: "handoff", signer: { name, email, title? }, note? }   pass it to someone else to sign
 * POST { token, op: "choose", choice }            pick an option and add-ons ({ optionId, addOnIds }), until signed
 * POST { token, op: "sign", name, consent, hash, choice? } sign: the full name typed, consent true, the hash of the document shown, the option picked
 * POST { token, op: "decline", reason? }
 *
 * A document's link (a "ds_" token, lib/documents/store.ts) takes the same steps, and signs with
 * POST { token, op: "sign", name, method: "typed" | "drawn", png?, values: { fieldId: value }, consent, hash }.
 */
export const POST = guarded(async (req: NextRequest) => {
  const ip = clientIp(req);
  if (limited(`sign:${ip}`, 60, 60_000)) return err("That's a lot in one minute. Give it a moment, then try again.", 429);
  const text = await req.text();
  // A drawn signature (a small PNG) makes a document's signature bigger than a typed one.
  if (text.length > 320 * 1024) return err("That's too much to send at once.", 413);
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
  const doc = isDocToken(token);
  if (!doc && text.length > 16 * 1024) return err("That's too much to send at once.", 413);
  try {
    if (doc)
      switch (b.op) {
        case "view": {
          // The sender signing their own document, signed in here: their saved signature, for one click.
          const v = await docSignerView(token, who, o);
          return NextResponse.json({ ...v, saved: await docSavedSignature(token, req.cookies.get("rn_table")?.value) }, { headers: NO_STORE });
        }
        case "code":
          if (limited(`sign-code:${ip}`, 10, 60 * 60_000)) return err("That's a lot of codes from here in an hour. Use the newest one, or try again later.", 429);
          return NextResponse.json(await docRequestCode(token, who), { headers: NO_STORE });
        case "verify":
          if (limited(`sign-verify:${ip}`, 20, 10 * 60_000)) return err("That's a lot of tries. Wait 10 minutes, then try again.", 429);
          return NextResponse.json(await docVerifyCode(token, b.code, who, o), { headers: NO_STORE });
        case "sign":
          return NextResponse.json(await docSign(token, { name: b.name, method: b.method, png: b.png, values: b.values, consent: b.consent, hash: b.hash }, who, o, undefined, req.cookies.get("rn_table")?.value), { headers: NO_STORE });
        case "decline":
          return NextResponse.json(await docDecline(token, { reason: b.reason }, who, o), { headers: NO_STORE });
        default:
          return err("That didn't go through. Refresh the page and try again.");
      }
    switch (b.op) {
      case "view":
        return NextResponse.json(await signerView(token, who, o), { headers: NO_STORE });
      case "code":
        if (limited(`sign-code:${ip}`, 10, 60 * 60_000)) return err("That's a lot of codes from here in an hour. Use the newest one, or try again later.", 429);
        return NextResponse.json(await requestCode(token, who), { headers: NO_STORE });
      case "verify":
        if (limited(`sign-verify:${ip}`, 20, 10 * 60_000)) return err("That's a lot of tries. Wait 10 minutes, then try again.", 429);
        return NextResponse.json(await verifyCode(token, b.code, who, o), { headers: NO_STORE });
      case "ask":
        // A question to the member, by email (lib/proposals/store.ts askQuestion: a few a day on one link too).
        if (limited(`sign-ask:${ip}`, 10, 60 * 60_000)) return err("That's a lot of questions from here in an hour. Try again later.", 429);
        return NextResponse.json(await askQuestion(token, b.question, who, o), { headers: NO_STORE });
      case "handoff":
        if (limited(`sign-handoff:${ip}`, 5, 60 * 60_000)) return err("That's a lot from here in an hour. Try again later.", 429);
        return NextResponse.json(await handOff(token, { signer: b.signer, note: b.note }, who, o), { headers: NO_STORE });
      case "choose":
        return NextResponse.json(await chooseOption(token, b.choice, o), { headers: NO_STORE });
      case "sign":
        return NextResponse.json(await signProposal(token, { name: b.name, consent: b.consent, hash: b.hash, choice: b.choice }, who, o), { headers: NO_STORE });
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
