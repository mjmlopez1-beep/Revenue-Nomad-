"use client";

/**
 * Integrations: alerts in Slack (and other tools by webhook), and the Claude connector.
 * Page key `integrations`; the old `?p=claude` opens it at the Claude section.
 *
 * Slack connects with an incoming webhook the member makes in their own workspace, so there is
 * no Slack app to review. The URL is checked and sent a test message before it's saved, and the
 * page only ever gets it back masked. Reads and writes /api/integrations.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconChevron, useToast } from "../ui/shared";
import { useCopy } from "./Credits";
import { UseInClaude } from "./UseInClaude";
import type { AlertKind, DestView, IntegrationsView } from "@/lib/notify/types";
import "./connect.css";
import "./pages.css";
import "./integrations.css";

const WEBHOOK_EXAMPLE = JSON.stringify(
  {
    source: "Trading Post",
    event: "message",
    count: 1,
    title: "Ana sent you a message about your seat at Acme",
    lines: ["“Saw you led marketing at Acme. Could we trade notes on their board?”"],
    url: "https://…/?p=messages&m=…",
    sentAt: "2026-11-17T15:04:05.000Z",
  },
  null,
  2,
);

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(new Date(iso).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });

type Answer = { message?: string; view?: IntegrationsView; error?: string };

async function call(body: Record<string, unknown>): Promise<Answer> {
  try {
    const r = await fetch("/api/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as Answer;
    return r.ok ? j : { error: j.error || "That didn't go through. Try again." };
  } catch {
    return { error: "We couldn't reach Trading Post. Check your connection and try again." };
  }
}

function SlackMark() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden focusable="false">
      <path fill="#E01E5A" d="M5.04 15.12a2.52 2.52 0 1 1-2.52-2.52h2.52v2.52Zm1.27 0a2.52 2.52 0 1 1 5.04 0v6.36a2.52 2.52 0 1 1-5.04 0v-6.36Z" />
      <path fill="#36C5F0" d="M8.83 5.04a2.52 2.52 0 1 1 2.52-2.52v2.52H8.83Zm0 1.27a2.52 2.52 0 1 1 0 5.04H2.52a2.52 2.52 0 1 1 0-5.04h6.31Z" />
      <path fill="#2EB67D" d="M18.96 8.83a2.52 2.52 0 1 1 2.52 2.52h-2.52V8.83Zm-1.27 0a2.52 2.52 0 1 1-5.04 0V2.52a2.52 2.52 0 1 1 5.04 0v6.31Z" />
      <path fill="#ECB22E" d="M15.17 18.96a2.52 2.52 0 1 1-2.52 2.52v-2.52h2.52Zm0-1.27a2.52 2.52 0 1 1 0-5.04h6.31a2.52 2.52 0 1 1 0 5.04h-6.31Z" />
    </svg>
  );
}
function ClaudeMark() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden focusable="false">
      <g stroke="#D97757" strokeWidth="2.6" strokeLinecap="round">
        <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
      </g>
    </svg>
  );
}
function HookMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 7a3 3 0 1 1 4.5 2.6L10 16" />
      <path d="M6.5 13.5A3 3 0 1 0 10 18h7" />
      <path d="M17 12a3 3 0 1 1 0 6" />
    </svg>
  );
}

function Switch({ id, on, onChange, busy }: { id: string; on: boolean; onChange: (next: boolean) => void; busy?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-d`}
      className={`tp-switch${on ? " on" : ""}`}
      disabled={busy}
      onClick={() => onChange(!on)}
    >
      <span className="tp-switch-track" aria-hidden>
        <span className="tp-switch-knob" />
      </span>
      <span className="tp-switch-l">{on ? "On" : "Off"}</span>
    </button>
  );
}

/** A connected URL: where it goes, when, and Send a test and Remove (Remove asks once, inline). */
function Connected({ d, label, onTest, onRemove, busy }: { d: DestView; label: string; onTest: () => void; onRemove: () => void; busy: string | null }) {
  const [asking, setAsking] = useState(false);
  const trouble = d.broken || !!d.problem;
  return (
    <div className="in-conn">
      <div className="in-conn-top">
        <span className={`chip ${trouble ? "chip-outline" : "chip-volt"}`}>{d.broken ? "Stopped" : trouble ? "Last try failed" : "Connected"}</span>
        <code className="mono in-masked" title="Only the end of the URL is shown. The rest stays on our side.">
          {d.masked}
        </code>
      </div>
      <p className="in-conn-meta">
        {label} since {day(d.addedAt)}
        {d.lastOkAt ? `. Last post went through ${day(d.lastOkAt)}.` : "."}
      </p>
      {d.problem && (
        <p className="in-problem" role="status">
          {d.problem}
          {d.broken ? " Alerts to it have stopped. Remove it and connect a new URL." : ""}
        </p>
      )}
      {asking ? (
        <div className="in-ask" role="group" aria-label={`Remove ${label}`}>
          <span>Remove it? Alerts stop at once.</span>
          <button type="button" className="btn btn-pine" onClick={onRemove} aria-busy={busy === "remove"} disabled={!!busy}>
            {busy === "remove" ? "Removing" : "Remove"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setAsking(false)} disabled={!!busy}>
            Keep it
          </button>
        </div>
      ) : (
        <div className="in-actions">
          <button type="button" className="btn" onClick={onTest} aria-busy={busy === "test"} disabled={!!busy || d.broken}>
            {busy === "test" ? "Sending" : "Send a test"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setAsking(true)} disabled={!!busy}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

/** Paste a URL and connect it. */
function ConnectForm({ id, label, placeholder, button, busy, onConnect, hint }: { id: string; label: string; placeholder: string; button: string; busy: boolean; onConnect: (url: string) => Promise<boolean>; hint?: ReactNode }) {
  const [url, setUrl] = useState("");
  return (
    <form
      className="in-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!url.trim() || busy) return;
        void onConnect(url.trim()).then((ok) => ok && setUrl(""));
      }}
    >
      <label className="in-label" htmlFor={id}>
        {label}
      </label>
      <div className="in-row">
        <input
          id={id}
          className="input mono in-input"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <button type="submit" className="btn btn-pine" aria-busy={busy} disabled={busy || !url.trim()}>
          {busy ? "Checking" : button}
        </button>
      </div>
      {hint && (
        <p className="in-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </form>
  );
}

const ALERTS: { key: AlertKind; title: (fn: string | null, saved: number) => string; desc: (fn: string | null, saved: number) => string }[] = [
  {
    key: "roles",
    title: (fn) => (fn && fn !== "Other" ? `New open roles in ${fn}` : "New open roles for your saved views"),
    desc: (fn, saved) =>
      `One post after each weekly scan${fn && fn !== "Other" ? ` with the new ${fn} roles` : ""}.${
        saved ? ` It covers your ${saved === 1 ? "saved view" : `${saved} saved views`} too.` : " Saved views count too, once you have some."
      }`,
  },
  { key: "message", title: () => "New messages", desc: () => "Who wrote, the company it's about and the first lines, with a link to reply. Never an email address." },
  {
    key: "seat",
    title: () => "Someone engages your seat",
    desc: () => "Another fractional unlocks who held your seat or facts on it, or writes to you about it. We show their function and title, never their name unless they wrote. It's often a chance to talk or partner.",
  },
];

export function Integrations({ onBack, onCredits, section }: { onBack: () => void; onCredits: () => void; section?: "claude" | "slack" }) {
  const toast = useToast();
  const copy = useCopy();
  const [view, setView] = useState<IntegrationsView | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const claudeRef = useRef<HTMLElement>(null);
  const slackRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/integrations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { view: IntegrationsView }) => live && setView(j.view))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);
  // The old "Use it in Claude" link opens here at the Claude section, once the Slack part above it has its height.
  const jumped = useRef(false);
  const ready = view !== null || failed;
  useEffect(() => {
    if (section !== "claude" || !ready || jumped.current) return;
    jumped.current = true;
    requestAnimationFrame(() => claudeRef.current?.scrollIntoView({ block: "start" }));
  }, [section, ready]);

  const run = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    const r = await call(body);
    setBusy(null);
    if (r.view) setView(r.view);
    if (r.error) toast(r.error, true);
    else if (r.message && r.message !== "Saved.") toast(r.message);
    return !r.error;
  };
  const setAlert = (k: AlertKind, on: boolean) => {
    if (!view) return;
    setView({ ...view, alerts: { ...view.alerts, [k]: on } }); // shown at once, put back if it fails
    void call({ op: "alerts", [k]: on }).then((r) => {
      if (r.view) setView(r.view);
      if (r.error) toast(r.error, true);
    });
  };
  const jump = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });

  const slack = view?.slack ?? null;
  const hook = view?.webhook ?? null;
  const anyOn = !!(slack || hook);

  return (
    <div className="tp-page in-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">Integrations</h1>
      <p className="uc-lead">Get a Slack post when something needs you, and ask the table from Claude in your own words.</p>

      <div className="in-picks">
        <button type="button" className="tp-card in-pick" onClick={() => jump(slackRef.current)}>
          <span className="in-mark" aria-hidden>
            <SlackMark />
          </span>
          <span className="in-pick-t">
            <span className="in-pick-h">Slack</span>
            <span className="in-pick-d">Alerts for new open roles in your function, new messages, and fractionals who engage your seats.</span>
          </span>
          <span className={`chip ${slack && !slack.broken ? "chip-volt" : "chip-outline"}`}>{!view ? "…" : slack ? (slack.broken ? "Stopped" : "Connected") : "Not set up"}</span>
        </button>
        <button type="button" className="tp-card in-pick" onClick={() => jump(claudeRef.current)}>
          <span className="in-mark" aria-hidden>
            <ClaudeMark />
          </span>
          <span className="in-pick-t">
            <span className="in-pick-h">Claude</span>
            <span className="in-pick-d">Ask the table from Claude, ChatGPT, Claude Code or Cursor. It asks before it spends a credit.</span>
          </span>
          <span className="chip chip-outline">Connector</span>
        </button>
      </div>

      <section className="in-section" id="slack" ref={slackRef} aria-labelledby="in-slack-h">
        <h2 className="in-h" id="in-slack-h">
          Alerts in Slack
        </h2>
        {failed ? (
          <p className="in-problem">We couldn&apos;t load your alerts. Refresh the page to try again.</p>
        ) : !view ? (
          <p className="cr-note">Loading your alerts…</p>
        ) : !view.allowed ? (
          <section className="tp-card">
            <p className="cr-note">Alerts in Slack aren&apos;t part of your plan.</p>
          </section>
        ) : (
          <>
            <section className="tp-card in-card" aria-labelledby="in-slack-card">
              <div className="in-card-h">
                <span className="in-mark in-mark-sm" aria-hidden>
                  <SlackMark />
                </span>
                <h3 className="tp-card-h" id="in-slack-card">
                  Slack
                </h3>
              </div>
              {slack ? (
                <Connected
                  d={slack}
                  label={slack.kind === "workflow" ? "Posting to a Slack workflow" : "Posting to Slack"}
                  busy={busy?.startsWith("slack:") ? busy.slice(6) : null}
                  onTest={() => void run("slack:test", { op: "test", field: "slack" })}
                  onRemove={() => void run("slack:remove", { op: "remove", field: "slack" })}
                />
              ) : (
                <>
                  <p className="cr-note">It takes about two minutes. You make a small app in your own Slack, so the alerts go to the channel or DM you pick, and nobody at Trading Post can read your Slack.</p>
                  <ol className="uc-steps in-steps">
                    <li>
                      Open{" "}
                      <a href="https://api.slack.com/apps?new_app=1" target="_blank" rel="noreferrer" className="in-link">
                        api.slack.com/apps
                      </a>{" "}
                      and pick Create New App, then From scratch. Name it Trading Post alerts, pick your workspace and pick Create App.
                    </li>
                    <li>In the app&apos;s menu, open Incoming Webhooks and turn Activate Incoming Webhooks on.</li>
                    <li>Pick Add New Webhook. Choose the channel for alerts, or your own name for a DM, then pick Allow.</li>
                    <li>Copy the Webhook URL it shows. The app can only post to that one channel. It can&apos;t read anything in your Slack.</li>
                    <li>Paste it below and pick Connect Slack. We send a test message first.</li>
                  </ol>
                  <ConnectForm
                    id="in-slack-url"
                    label="Slack webhook URL"
                    placeholder="https://hooks.slack.com/services/…"
                    button="Connect Slack"
                    busy={busy === "slack:connect"}
                    onConnect={(url) => run("slack:connect", { op: "connect", field: "slack", url })}
                    hint="Workflow Builder webhooks work too. They start with https://hooks.slack.com/workflows/."
                  />
                  <p className="uc-tip in-alt">
                    If your workspace has Slack&apos;s Incoming WebHooks app, there&apos;s a shorter way. In Slack, open Apps, find Incoming WebHooks and pick Add to Slack. Pick a channel
                    or your DM, then copy the webhook URL and paste it above.
                  </p>
                </>
              )}
            </section>

            {anyOn && (
              <section className="tp-card in-card" aria-labelledby="in-alerts-h">
                <h3 className="tp-card-h" id="in-alerts-h">
                  What you get alerts for
                </h3>
                <ul className="in-alerts">
                  {ALERTS.map((a) => (
                    <li key={a.key} className="in-alert">
                      <div className="in-alert-t">
                        <span className="in-alert-h" id={`in-a-${a.key}-t`}>
                          {a.title(view.function, view.savedViews)}
                        </span>
                        <span className="in-alert-d" id={`in-a-${a.key}-d`}>
                          {a.desc(view.function, view.savedViews)}
                        </span>
                      </div>
                      <Switch id={`in-a-${a.key}`} on={view.alerts[a.key]} onChange={(on) => setAlert(a.key, on)} />
                    </li>
                  ))}
                </ul>
                <p className="in-hint">At most one post of each kind every 15 minutes. When more happen, they come together in one post with a count.</p>
              </section>
            )}

            <section className="tp-card in-card" aria-labelledby="in-hook-h">
              <div className="in-card-h">
                <span className="in-mark in-mark-sm in-mark-hook" aria-hidden>
                  <HookMark />
                </span>
                <h3 className="tp-card-h" id="in-hook-h">
                  Other tools
                </h3>
              </div>
              {hook ? (
                <Connected
                  d={hook}
                  label="Posting to your webhook"
                  busy={busy?.startsWith("webhook:") ? busy.slice(8) : null}
                  onTest={() => void run("webhook:test", { op: "test", field: "webhook" })}
                  onRemove={() => void run("webhook:remove", { op: "remove", field: "webhook" })}
                />
              ) : (
                <>
                  <p className="cr-note">Send the same alerts to Zapier, Make or any tool that takes a webhook. Make a webhook trigger there, then paste its URL here.</p>
                  <ConnectForm
                    id="in-hook-url"
                    label="Webhook URL"
                    placeholder="https://hooks.zapier.com/hooks/catch/…"
                    button="Connect webhook"
                    busy={busy === "webhook:connect"}
                    onConnect={(url) => run("webhook:connect", { op: "connect", field: "webhook", url })}
                    hint="It has to start with https://. We send a test post first."
                  />
                </>
              )}
              <details className="in-details">
                <summary>What we send</summary>
                <p className="in-hint">One JSON post for each alert, with content-type application/json. A 2xx answer counts as delivered. We don&apos;t follow redirects and wait at most 5 seconds.</p>
                <pre className="uc-code uc-block mono">{WEBHOOK_EXAMPLE}</pre>
                <dl className="in-fields">
                  <div>
                    <dt className="mono">event</dt>
                    <dd>roles, message, seat or test</dd>
                  </div>
                  <div>
                    <dt className="mono">count</dt>
                    <dd>How many events the post covers. More than one when they came within 15 minutes.</dd>
                  </div>
                  <div>
                    <dt className="mono">title</dt>
                    <dd>The headline, one sentence</dd>
                  </div>
                  <div>
                    <dt className="mono">lines</dt>
                    <dd>One to three short lines of detail</dd>
                  </div>
                  <div>
                    <dt className="mono">url</dt>
                    <dd>The exact place in Trading Post. It opens for whoever is signed in, so it&apos;s safe to share.</dd>
                  </div>
                  <div>
                    <dt className="mono">sentAt</dt>
                    <dd>When we sent it, in UTC</dd>
                  </div>
                </dl>
              </details>
            </section>
            <p className="in-hint in-secret">A webhook URL works like a password for its channel. We keep it on our side and only show its last four characters.</p>
          </>
        )}
      </section>

      <section className="in-section" id="claude" ref={claudeRef} aria-labelledby="in-claude-h">
        <h2 className="in-h" id="in-claude-h">
          Use it in Claude
        </h2>
        <UseInClaude embedded onBack={onBack} onCredits={onCredits} />
      </section>
    </div>
  );
}
