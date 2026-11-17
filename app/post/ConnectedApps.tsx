"use client";

/**
 * "Connected apps" on Your credits: the AI apps a member let use their account (Claude, ChatGPT,
 * Claude Code, Cursor), when each connected and was last used, and Disconnect. Disconnecting asks
 * once, inline, then the app's tokens stop working at once. Reads /api/oauth/apps.
 */
import { useEffect, useState } from "react";
import { timeAgo, useToast } from "../ui/shared";
import "./connect.css";

interface App {
  id: string;
  name: string;
  connectedAt: string;
  lastUsedAt: string;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(new Date(iso).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });

export function ConnectedApps({ onHowTo }: { onHowTo?: () => void }) {
  const toast = useToast();
  const [apps, setApps] = useState<App[] | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/oauth/apps", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { apps: [] }))
      .then((j) => live && setApps(j.apps ?? []))
      .catch(() => live && setApps([]));
    return () => {
      live = false;
    };
  }, []);

  const disconnect = async (app: App) => {
    setBusy(app.id);
    try {
      const r = await fetch("/api/oauth/apps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revoke: app.id }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setApps(j.apps ?? []);
        toast(`Disconnected ${app.name}. It can't use your account any more.`);
      } else toast(j.error || "That didn't go through. Try again.", true);
    } catch {
      toast("We couldn't reach Merlin. Check your connection and try again.", true);
    }
    setBusy(null);
    setAsking(null);
  };

  return (
    <section className="tp-card ca-card" aria-labelledby="ca-h">
      <h2 className="tp-card-h" id="ca-h">
        Connected apps
      </h2>
      {apps === null ? (
        <p className="cr-note">Loading your apps…</p>
      ) : apps.length === 0 ? (
        <p className="cr-note">
          No apps connected yet. Connect Claude or ChatGPT and ask the table questions in your own words.{" "}
          {onHowTo && (
            <button type="button" className="ca-link" onClick={onHowTo}>
              See how
            </button>
          )}
        </p>
      ) : (
        <>
          <p className="cr-note">These apps can search the table and unlock or add facts when you ask. Disconnect one and it stops at once.</p>
          <ul className="ca-list">
            {apps.map((a) => (
              <li key={a.id} className="ca-row">
                <div className="ca-what">
                  <span className="ca-name">{a.name}</span>
                  <span className="ca-meta">
                    Connected <span className="num">{day(a.connectedAt)}</span> · used {timeAgo(a.lastUsedAt)}
                  </span>
                </div>
                {asking === a.id ? (
                  <div className="ca-ask" role="group" aria-label={`Disconnect ${a.name}?`}>
                    <span className="ca-q">Disconnect {a.name}?</span>
                    <button type="button" className="btn btn-sm btn-pine" onClick={() => void disconnect(a)} aria-busy={busy === a.id} disabled={!!busy}>
                      {busy === a.id ? "Disconnecting" : "Disconnect"}
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAsking(null)} disabled={!!busy}>
                      Keep it
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn btn-sm" onClick={() => setAsking(a.id)}>
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
