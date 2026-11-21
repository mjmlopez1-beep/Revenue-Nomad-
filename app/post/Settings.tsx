"use client";

/** Member settings shown on Your credits: the weekly email, message emails, and the sign-in link actions. */
import { useEffect, useState } from "react";
import { useUi } from "./ui";
import { post, useToast } from "../ui/shared";
import "./pages.css";

export function WeeklyEmail() {
  const ui = useUi();
  const saved = ui.me.digest;
  const fn = ui.me.function;
  // What the member just picked, shown until the server's answer arrives.
  const [picked, setPicked] = useState<boolean | null>(null);
  const on = picked ?? saved;
  useEffect(() => {
    if (picked !== null && picked === saved) setPicked(null);
  }, [picked, saved]);
  const toggle = async () => {
    const next = !on;
    setPicked(next);
    const r = await ui.act({ type: "settings", digest: next });
    if (!r.ok) setPicked(null);
  };
  return (
    <section className="tp-card tp-set">
      <div className="tp-set-t">
        <h2 className="tp-card-h" id="tp-set-digest">
          Weekly email
        </h2>
        <p className="cr-note" id="tp-set-digest-d">
          {fn && fn !== "Other"
            ? `One email after each weekly scan with the new open roles, ${fn} first. We skip weeks with none.`
            : "One email after each weekly scan with the new open roles. We skip weeks with none."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="tp-set-digest"
        aria-describedby="tp-set-digest-d"
        className={`tp-switch${on ? " on" : ""}`}
        onClick={() => void toggle()}
      >
        <span className="tp-switch-track" aria-hidden>
          <span className="tp-switch-knob" />
        </span>
        <span className="tp-switch-l">{on ? "On" : "Off"}</span>
      </button>
    </section>
  );
}

/** "Send me a new sign-in link": a one-time link and code by email (email on only). */
export async function emailMeLink(toast: (text: string, err?: boolean) => void) {
  const r = await post<{ message?: string }>({ emailMe: true });
  toast(r.error ?? r.message ?? "Sent. Check your email.", !!r.error);
}

/** The email when a member messages you. Shown only while email is on. */
export function MessageEmail() {
  const ui = useUi();
  const saved = ui.me.messageEmail !== false;
  const [picked, setPicked] = useState<boolean | null>(null);
  const on = picked ?? saved;
  useEffect(() => {
    if (picked !== null && picked === saved) setPicked(null);
  }, [picked, saved]);
  const toggle = async () => {
    const next = !on;
    setPicked(next);
    const r = await ui.act({ type: "settings", messageEmail: next });
    if (!r.ok) setPicked(null);
  };
  return (
    <section className="tp-card tp-set">
      <div className="tp-set-t">
        <h2 className="tp-card-h" id="tp-set-msg">
          Message emails
        </h2>
        <p className="cr-note" id="tp-set-msg-d">
          An email when a member writes to you, at most one an hour for each conversation. It never shows your email address to them.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="tp-set-msg"
        aria-describedby="tp-set-msg-d"
        className={`tp-switch${on ? " on" : ""}`}
        onClick={() => void toggle()}
      >
        <span className="tp-switch-track" aria-hidden>
          <span className="tp-switch-knob" />
        </span>
        <span className="tp-switch-l">{on ? "On" : "Off"}</span>
      </button>
    </section>
  );
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
