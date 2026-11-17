"use client";

/**
 * "Allow Claude to use your Merlin account?" The page an app's sign-in opens
 * (/api/oauth/authorize sends the browser here). Signed out, it asks for the member's sign-in
 * link or code (and offers the emailed link when email is on), then comes back to the question.
 * Allow or Don't allow sends the browser back to the app.
 */
import { useCallback, useEffect, useState } from "react";
import { Brand } from "../../ui/shared";
import "./consent.css";

interface Info {
  ok: boolean;
  app?: string;
  returnsTo?: string;
  signedIn?: boolean;
  firstName?: string | null;
  email?: boolean;
  support?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

const STOPPED: Record<string, { h: string; p: string }> = {
  client: { h: "We don't know this app", p: "The app that sent you here isn't registered with Merlin. Go back to it and connect Merlin again." },
  redirect: { h: "We stopped this sign-in", p: "The app asked to send you back somewhere it never registered, so we stopped here. Go back to the app and connect again." },
  busy: { h: "That's a lot of tries", p: "Wait a minute, then go back to the app and connect again." },
  expired: { h: "This sign-in ran out of time", p: "Requests last 30 minutes. Go back to the app and connect Merlin again." },
};

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: "We couldn't reach Merlin. Check your connection and try again." } };
  }
}

function Mark() {
  return (
    <div className="cs-brand">
      <Brand size={32} />
      <span className="cs-by">by Revenue Nomad</span>
    </div>
  );
}

export default function Consent() {
  const [req, setReq] = useState<string | null>(null);
  const [stop, setStop] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState<"allow" | "deny" | "signin" | "email" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const load = useCallback(async (r: string) => {
    try {
      const res = await fetch(`/api/oauth/authorize?info=1&r=${encodeURIComponent(r)}`, { cache: "no-store" });
      const j = (await res.json()) as Info;
      if (!j.ok) setStop("expired");
      setInfo(j);
    } catch {
      setErr("We couldn't reach Merlin. Check your connection, then reload this page.");
    }
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const e = q.get("e");
    const r = q.get("r");
    if (e) setStop(STOPPED[e] ? e : "client");
    else if (!r) setStop("expired");
    else {
      setReq(r);
      void load(r);
    }
  }, [load]);

  // Signed in from the emailed link in another tab: coming back here picks it up.
  useEffect(() => {
    if (!req || info?.signedIn) return;
    const again = () => document.visibilityState === "visible" && void load(req);
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("focus", again);
    };
  }, [req, info?.signedIn, load]);

  const answer = async (allow: boolean) => {
    if (!req) return;
    setBusy(allow ? "allow" : "deny");
    setErr(null);
    const { ok, data } = await postJson("/api/oauth/authorize", { r: req, allow });
    if (ok && typeof data.redirect === "string") {
      window.location.assign(data.redirect);
      return;
    }
    setBusy(null);
    if (!ok && (data.error as string)?.includes("ran out of time")) setStop("expired");
    else setErr((data.error as string) || "That didn't go through. Try again.");
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !req) return;
    setBusy("signin");
    setErr(null);
    const { ok, data } = await postJson("/api/table", { signIn: code.trim() });
    setBusy(null);
    if (!ok) {
      setErr(
        (data.error as string) ||
          (info?.support ? `That link or code didn't work. Paste the whole thing, or write to ${info.support} for a new one.` : "That link or code didn't work. Paste the whole thing."),
      );
      return;
    }
    setCode("");
    await load(req);
  };

  const emailLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setErr("That doesn't look like an email address. Check it, then try again.");
      return;
    }
    setBusy("email");
    setErr(null);
    const { ok, data } = await postJson("/api/table", { emailLink: email.trim() });
    setBusy(null);
    if (!ok) setErr((data.error as string) || "That didn't go through. Try again.");
    else setSent(true);
  };

  const signOut = async () => {
    await postJson("/api/table", { signOut: true });
    if (req) await load(req);
  };

  const app = info?.app || "This app";
  const lost = info?.support ? (
    <>
      Lost your link? Write to <a href={`mailto:${info.support}?subject=${encodeURIComponent("My Merlin sign-in link")}`}>{info.support}</a> and we&apos;ll send a new one.
    </>
  ) : (
    "Lost your link? Ask the member who invited you to send it again."
  );

  let body: React.ReactNode;
  if (stop) {
    const s = STOPPED[stop];
    body = (
      <>
        <h1 className="cs-h">{s.h}</h1>
        <p className="cs-lead">{s.p}</p>
        <a className="btn cs-wide" href="/">
          Go to Merlin
        </a>
      </>
    );
  } else if (!info) {
    body = (
      <div className="cs-loading" role="status">
        <span className="cs-line" />
        <span className="cs-line cs-short" />
        <span className="sr-only">Loading</span>
      </div>
    );
  } else if (!info.signedIn) {
    body = (
      <>
        <h1 className="cs-h">Sign in to connect {app}</h1>
        <p className="cs-lead">Paste the personal sign-in link we sent you, or the code at the end of it. You&apos;ll come straight back here.</p>
        <form className="cs-form" onSubmit={signIn}>
          <label className="cs-label" htmlFor="cs-code">
            Your sign-in link or code
          </label>
          <input
            id="cs-code"
            className="input cs-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Paste it here"
          />
          <button type="submit" className="btn btn-pine cs-wide" disabled={!code.trim()} aria-busy={busy === "signin"}>
            {busy === "signin" ? "Signing in" : "Sign in"}
          </button>
        </form>
        {info.email &&
          (sent ? (
            <p className="cs-sent" role="status">
              Check your inbox. Open the link in this browser, then come back to this tab.
            </p>
          ) : (
            <form className="cs-form cs-or" onSubmit={emailLink}>
              <label className="cs-label" htmlFor="cs-email">
                Or get your link by email
              </label>
              <input id="cs-email" className="input cs-input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
              <button type="submit" className="btn cs-wide" disabled={!email.trim()} aria-busy={busy === "email"}>
                {busy === "email" ? "Sending" : "Email me my link"}
              </button>
            </form>
          ))}
        <p className="cs-small">{lost}</p>
        <p className="cs-small">
          New to Merlin? <a href="/">Join on the home page</a>, then connect again.
        </p>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="cs-h">Allow {app} to use your Merlin account?</h1>
        <p className="cs-lead">It can search the table, see what you&apos;ve unlocked, and unlock or add facts when you ask. Every unlock asks you first.</p>
        <ul className="cs-list">
          <li>Search companies, seats, open roles and rate benchmarks as you see them</li>
          <li>See your credits, your seats and what you&apos;ve unlocked</li>
          <li>Unlock a fact, add one you know, or save a search, when you ask it to</li>
        </ul>
        <p className="cs-who">
          Signed in as {info.firstName}.{" "}
          <button type="button" className="cs-link" onClick={() => void signOut()}>
            Not you?
          </button>
        </p>
        <div className="cs-acts">
          <button type="button" className="btn btn-pine btn-lg cs-wide" onClick={() => void answer(true)} disabled={!!busy} aria-busy={busy === "allow"}>
            {busy === "allow" ? "Connecting" : `Allow ${app}`}
          </button>
          <button type="button" className="btn btn-lg cs-wide" onClick={() => void answer(false)} disabled={!!busy} aria-busy={busy === "deny"}>
            Don&apos;t allow
          </button>
        </div>
        <p className="cs-small">
          {info.returnsTo ? (
            <>
              This takes you back to <span className="mono">{info.returnsTo}</span>.{" "}
            </>
          ) : null}
          You can disconnect it any time in Your credits.
        </p>
      </>
    );
  }

  return (
    <div className="cs-page">
      <main className="cs-card" aria-live="polite">
        <Mark />
        {body}
        {err && (
          <p className="cs-err" role="alert">
            {err}
          </p>
        )}
      </main>
    </div>
  );
}
