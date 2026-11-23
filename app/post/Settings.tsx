"use client";

/** Member settings shown on Your credits: the way to Notifications (every email and Slack post), the sign-in link actions, and closing the account. */
import { useState } from "react";
import { post, useToast, errorText } from "../ui/shared";
import "./pages.css";

/**
 * Your credits used to hold the weekly email's and the message emails' switches. They are on
 * Notifications now, with Crystal Ball's and Slack's: this card leads there.
 */
export function NotificationsCard({ onOpen }: { onOpen?: () => void }) {
  if (!onOpen) return null;
  return (
    <section className="tp-card tp-set">
      <div className="tp-set-t">
        <h2 className="tp-card-h" id="tp-set-nt">
          Emails and Slack
        </h2>
        <p className="cr-note">The weekly email, message emails and Crystal Ball, and how often each comes, are in Notifications.</p>
      </div>
      <button type="button" className="btn" aria-describedby="tp-set-nt" onClick={onOpen}>
        Open Notifications
      </button>
    </section>
  );
}

/** "Send me a new sign-in link": a one-time link and code by email (email on only). */
export async function emailMeLink(toast: (text: string, err?: boolean) => void) {
  const r = await post<{ message?: string }>({ emailMe: true });
  toast(r.error ?? r.message ?? "Sent. Check your email.", !!r.error);
}

/** A link to the public "Where Merlin's data goes" page (app/data), with the Privacy Policy (app/privacy) and Terms of Service (app/terms). */
export function DataLink() {
  return (
    <section className="tp-card tp-set">
      <div className="tp-set-t">
        <h2 className="tp-card-h">Where your data goes</h2>
        <p className="cr-note">What leaves Merlin, who receives it and why, and how to switch each part off.</p>
        <p className="cr-note tp-legal">
          <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a>
        </p>
      </div>
      <a className="btn btn-sm" href="/data">
        Read it
      </a>
    </section>
  );
}

/**
 * The sign-in link card's actions: send a new one-time link by email (email on), and sign out
 * on other devices (a new personal link: the old one stops working everywhere). Asks first.
 */
export function SignInActions({ emailOn, refresh }: { emailOn: boolean; refresh?: () => Promise<void> | void }) {
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const rotate = async () => {
    setBusy(true);
    const r = await post<{ message?: string; token?: string }>({ rotateLink: true });
    setBusy(false);
    setAsking(false);
    if (r.error) return toast(r.error, true);
    // The new link is on the page before the toast says to copy it.
    if (!refresh) return window.location.reload();
    await refresh();
    toast(r.message ?? "Signed out everywhere else.");
  };
  if (asking)
    return (
      <div className="tp-set-ask" role="group" aria-label="Sign out on other devices?">
        <p className="cr-note">
          Every other device signs out, and your old sign-in link stops working, in old emails too. This device stays signed in. Copy your new link after.
        </p>
        <span className="tp-linkcard-acts">
          <button type="button" className="btn btn-sm btn-pine" autoFocus disabled={busy} aria-busy={busy} onClick={() => void rotate()}>
            {busy ? "Signing out" : "Sign out other devices"}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAsking(false)}>
            Cancel
          </button>
        </span>
      </div>
    );
  return (
    <>
      {emailOn && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => void emailMeLink(toast)}>
          Send me a new sign-in link
        </button>
      )}
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAsking(true)}>
        Sign out on other devices
      </button>
    </>
  );
}

/** The words the close-account card and its confirmation read (lib/account.ts CLOSE_WORDS says the same on the server). */
export const CLOSE_ACCOUNT = {
  title: "Close your account",
  card: "Closes it now. You can bring it back for 30 days.",
  lead: "Your account closes now: you're signed out everywhere, you leave Peers and the Fractionals directory, and Merlin stops emailing you.",
  restore: "For 30 days you can bring it back with the link we email you, or by writing to us.",
  after:
    "After 30 days Merlin deletes your personal data: your profile, your Google and LinkedIn imports and network, the messages you wrote, your proposals and documents, your Evidence Bank cases, your AI usage log and your saved views. Facts you added to companies stay, with your name taken off.",
  plan: "A paid plan stops renewing at the end of the period you paid for.",
  confirm: "Close my account",
};

/**
 * Close your account (lib/account.ts): a question first, with what happens now, in 30 days and to a
 * paid plan, focus on Keep my account. Closing signs this browser out and opens the home page.
 */
export function CloseAccount({ startAsking = false }: { startAsking?: boolean }) {
  const toast = useToast();
  const [asking, setAsking] = useState(startAsking);
  const [busy, setBusy] = useState(false);
  const close = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "close", confirm: true }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!r.ok) {
        setBusy(false);
        return toast(errorText(r.status, j.error, "That didn't go through. Try again."), true);
      }
      window.location.assign("/?closed=1");
    } catch {
      setBusy(false);
      toast("We couldn't reach Merlin. Check your connection and try again.", true);
    }
  };
  return (
    <section className="tp-card tp-set tp-close" data-close-account data-asking={asking ? "" : undefined}>
      <div className="tp-set-t">
        <h2 className="tp-card-h" id="tp-set-close">
          {CLOSE_ACCOUNT.title}
        </h2>
        {!asking && <p className="cr-note">{CLOSE_ACCOUNT.card}</p>}
      </div>
      {asking ? (
        <div
          className="tp-set-ask"
          role="group"
          aria-labelledby="tp-set-close"
          onKeyDown={(e) => {
            if (e.key === "Escape") setAsking(false);
          }}
        >
          <p className="cr-note">{CLOSE_ACCOUNT.lead}</p>
          <p className="cr-note">{CLOSE_ACCOUNT.restore}</p>
          <p className="cr-note">{CLOSE_ACCOUNT.after}</p>
          <p className="cr-note">{CLOSE_ACCOUNT.plan}</p>
          <span className="tp-linkcard-acts">
            <button type="button" className="btn btn-sm tp-btn-red" disabled={busy} aria-busy={busy} onClick={() => void close()}>
              {busy ? "Closing" : CLOSE_ACCOUNT.confirm}
            </button>
            <button type="button" className="btn btn-sm btn-pine" autoFocus onClick={() => setAsking(false)}>
              Keep my account
            </button>
          </span>
        </div>
      ) : (
        <button type="button" className="btn btn-sm btn-ghost" aria-describedby="tp-set-close" onClick={() => setAsking(true)}>
          Close my account
        </button>
      )}
    </section>
  );
}
