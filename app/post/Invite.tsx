"use client";

/**
 * Invite a fractional: a message ready to send, written for the member's function, with the
 * link in it. Email it (a mail with the subject and the message filled in), copy it, or on a
 * phone share it. The zero-credits wall opens it in place, and Get started and the account menu
 * open it in a sheet.
 */
import { useState } from "react";
import { REFERRAL_BONUS } from "@/lib/tableFields";
import { useToast } from "../ui/shared";
import { copyText } from "./hooks";
import { inviteMailto, inviteMessage, inviteUrl } from "./earnBack";

export function InvitePanel({ fn, code }: { fn: string | null; code: string }) {
  const toast = useToast();
  const link = inviteUrl(code);
  const text = inviteMessage(fn, link);
  const [canShare] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");
  const copy = async () => {
    const ok = await copyText(text);
    toast(ok ? "Message copied. Paste it to a fractional you know." : "That didn't copy. Select the message and copy it yourself.", !ok);
  };
  const share = async () => {
    try {
      await navigator.share({ title: "Merlin", text: text.slice(0, text.lastIndexOf("\n\n")), url: link });
    } catch (e) {
      // Closing the sheet is a choice, not a failure. Anything else: the message can still be copied.
      if (!(e instanceof DOMException && e.name === "AbortError")) await copy();
    }
  };
  return (
    <div className="tp-invite">
      <label className="tp-invite-l" htmlFor="tp-invite-text">
        Your message
      </label>
      <textarea id="tp-invite-text" className="input tp-invite-text" readOnly value={text} rows={6} onFocus={(e) => e.currentTarget.select()} />
      <div className="tp-invite-acts">
        {canShare && (
          <button type="button" className="btn btn-pine" onClick={share}>
            Share it
          </button>
        )}
        <a className={`btn${canShare ? "" : " btn-pine"}`} href={inviteMailto(text)}>
          Email it
        </a>
        <button type="button" className="btn" onClick={copy}>
          Copy message
        </button>
      </div>
      <p className="tp-invite-note">You both get {REFERRAL_BONUS} credits once they add their first fact.</p>
    </div>
  );
}
