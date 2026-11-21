"use client";

/** Member settings shown on Your credits: the way to Notifications (every email and Slack post), and the sign-in link actions. */
import { useState } from "react";
import { post, useToast } from "../ui/shared";
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

/** A link to the public "Where Merlin's data goes" page (app/data). */
export function DataLink() {
  return (
    <section className="tp-card tp-set">
      <div className="tp-set-t">
        <h2 className="tp-card-h">Where your data goes</h2>
        <p className="cr-note">What leaves Merlin, who receives it and why, and how to switch each part off.</p>
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
