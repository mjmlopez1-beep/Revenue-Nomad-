"use client";

/**
 * Notifications (page "notifications", ?p=notifications): everything Merlin sends a member, by
 * email and in Slack, and how often, in one place. The account menu and the sidebar's foot open it,
 * and every email's footer links here (signed in, lib/emailIn.ts). The places that had these
 * switches before (Your credits, Your profile, Crystal Ball's page, Integrations) point here.
 *
 *   By email   Crystal Ball: every morning (on a day something moved), twice a week, once a week,
 *              or off (Me.radarEmail; settings radarEmail). The weekly email of new open roles
 *              (Me.digest), and message emails (Me.messageEmail), on or off.
 *   In Slack   Crystal Ball in Slack, on or off apart from its email (Me.radarSlack; settings
 *              radarSlack), and the other alerts (/api/integrations op alerts), with Pro's locks as
 *              on Integrations. Not connected: a way to Integrations to connect it.
 *
 * Each change saves at once. The admin's own switches stay above all of this: with Crystal Ball
 * off in Pilot metrics, or email not set up, nothing goes out whatever is picked here.
 */
import { useEffect, useState, type ReactNode } from "react";
import { IconChevron, useToast } from "../ui/shared";
import { useUi } from "./ui";
import { ProLock, ProTag, planDay } from "./Billing";
import type { View } from "@/lib/tableTypes";
import type { AlertKind, IntegrationsView } from "@/lib/notify/types";
import { FEATURE_NAME, RADAR_EVERY_WHEN, RADAR_EVERY_WORDS, type RadarEmail } from "@/lib/radar/types";
import "./pages.css";
import "./integrations.css";
import "./notifications.css";

/** An on and off switch, labelled by its row's title and described by its line (as on Integrations). */
export function Switch({ id, on, onChange, busy }: { id: string; on: boolean; onChange: (next: boolean) => void; busy?: boolean }) {
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

/** The Slack alerts besides Crystal Ball, and how often each comes. */
export const SLACK_ALERTS: { key: Exclude<AlertKind, "radar">; title: (fn: string | null, saved: number) => string; desc: (fn: string | null, saved: number) => string }[] = [
  {
    key: "roles",
    title: (fn) => (fn && fn !== "Other" ? `New open roles in ${fn}` : "New open roles for your saved views"),
    desc: (fn, saved) =>
      `One post after each weekly scan${fn && fn !== "Other" ? ` with the new ${fn} roles` : ""}.${
        saved ? ` It covers your ${saved === 1 ? "saved view" : `${saved} saved views`} too.` : " Saved views count too, once you have some."
      }`,
  },
  { key: "message", title: () => "New messages", desc: () => "As they come. Who wrote, the company it's about and the first lines, with a link to reply, and who joined from your invite. Never an email address." },
  {
    key: "seat",
    title: () => "Someone engages your seat",
    desc: () => "As it happens. Another fractional unlocks who held your seat or facts on it, or writes to you about it. We show their function and title, never their name unless they wrote.",
  },
];

const CHOICES: RadarEmail[] = ["daily", "twice", "weekly", "off"];

async function integrations(body?: Record<string, unknown>): Promise<{ view?: IntegrationsView; error?: string }> {
  try {
    const r = await fetch("/api/integrations", body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { view?: IntegrationsView; error?: string };
    return r.ok ? j : { error: j.error || "That didn't go through. Try again." };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}

/** One setting: its title and line on the left, its control on the right (under it on a phone). */
function Row({ id, title, desc, children, note }: { id: string; title: ReactNode; desc: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <li className="nt-row">
      <div className="nt-row-t">
        <span className="nt-row-h" id={`${id}-t`}>
          {title}
        </span>
        <span className="nt-row-d" id={`${id}-d`}>
          {desc}
        </span>
        {note && <span className="nt-row-note">{note}</span>}
      </div>
      <div className="nt-row-c">{children}</div>
    </li>
  );
}

export function Notifications({ view, onBack, onIntegrations }: { view: View; onBack: () => void; onIntegrations: () => void }) {
  const ui = useUi();
  const toast = useToast();
  const me = ui.me;
  const plan = me.plan;
  // What the member just picked, shown until the server's answer arrives (put back if it fails).
  const [picked, setPicked] = useState<Partial<{ radarEmail: RadarEmail; radarSlack: boolean; digest: boolean; messageEmail: boolean; peerEmail: boolean }>>({});
  const radarEmail = picked.radarEmail ?? me.radarEmail ?? "daily";
  const radarSlack = picked.radarSlack ?? me.radarSlack !== false;
  const digest = picked.digest ?? me.digest;
  const messageEmail = picked.messageEmail ?? me.messageEmail !== false;
  const peerEmail = picked.peerEmail ?? me.peerEmail !== false;
  useEffect(() => setPicked({}), [me.radarEmail, me.radarSlack, me.digest, me.messageEmail, me.peerEmail]);
  const save = async (k: keyof typeof picked, v: RadarEmail | boolean) => {
    setPicked((p) => ({ ...p, [k]: v }));
    const r = await ui.act({ type: "settings", [k]: v });
    if (!r.ok) setPicked((p) => ({ ...p, [k]: undefined }));
  };

  const [slackView, setSlackView] = useState<IntegrationsView | null>(null);
  const [slackFailed, setSlackFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void integrations().then((r) => {
      if (!live) return;
      if (r.view) setSlackView(r.view);
      else setSlackFailed(true);
    });
    return () => {
      live = false;
    };
  }, []);
  const setAlert = (k: AlertKind, on: boolean) => {
    if (!slackView) return;
    setSlackView({ ...slackView, alerts: { ...slackView.alerts, [k]: on } });
    void integrations({ op: "alerts", [k]: on }).then((r) => {
      if (r.view) setSlackView(r.view);
      if (r.error) toast(r.error, true);
    });
  };
  const connected = !!(slackView?.slack || slackView?.webhook);
  const fn = me.function ?? null;
  const proNow = plan?.name === "pro" || plan?.name === "trial";

  return (
    <div className="tp-page nt-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">Notifications</h1>
      <p className="uc-lead">What Merlin sends you, by email and in Slack, and how often. Each change saves at once.</p>

      <section className="nt-section" aria-labelledby="nt-email-h">
        <h2 className="in-h" id="nt-email-h">
          By email
        </h2>
        {view.email ? (
          <section className="tp-card nt-card">
            <ul className="nt-rows">
              <Row
                id="nt-radar"
                title={FEATURE_NAME}
                desc={radarEmail === "off" ? `Off. ${FEATURE_NAME} in the app still lists what's new.` : `${RADAR_EVERY_WHEN[radarEmail]} Never on a day with nothing new.`}
                note={radarEmail !== "daily" && radarEmail !== "off" && radarSlack && slackView?.slack ? "What already went to your Slack isn't emailed again." : undefined}
              >
                <div className="tp-seg nt-seg" role="radiogroup" aria-labelledby="nt-radar-t" aria-describedby="nt-radar-d">
                  {CHOICES.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={radarEmail === c} className={`tp-seg-b${radarEmail === c ? " on" : ""}`} onClick={() => radarEmail !== c && void save("radarEmail", c)}>
                      {RADAR_EVERY_WORDS[c]}
                    </button>
                  ))}
                </div>
              </Row>
              {view.scan?.digest && (
                <Row
                  id="nt-digest"
                  title="New open roles, weekly"
                  desc={fn && fn !== "Other" ? `One email after each weekly scan with the new open roles, ${fn} first. We skip weeks with none.` : "One email after each weekly scan with the new open roles. We skip weeks with none."}
                >
                  <Switch id="nt-digest" on={digest} onChange={(on) => void save("digest", on)} />
                </Row>
              )}
              <Row id="nt-msg" title="Messages" desc="When a member writes to you, at most one an hour for each conversation. It never shows your email address to them.">
                <Switch id="nt-msg" on={messageEmail} onChange={(on) => void save("messageEmail", on)} />
              </Row>
              <Row id="nt-peer" title="From your peers" desc="When a peer passes you a lead or asks you to team up. One email each, never with your email address in it.">
                <Switch id="nt-peer" on={peerEmail} onChange={(on) => void save("peerEmail", on)} />
              </Row>
            </ul>
          </section>
        ) : (
          <section className="tp-card nt-card">
            <p className="cr-note">Merlin doesn&apos;t send email yet. When it does, you choose here which emails you get.</p>
          </section>
        )}
      </section>

      <section className="nt-section" aria-labelledby="nt-slack-h">
        <h2 className="in-h" id="nt-slack-h">
          In Slack
        </h2>
        {slackFailed ? (
          <p className="in-problem">We couldn&apos;t load your Slack alerts. Refresh the page to try again.</p>
        ) : !slackView ? (
          <p className="cr-note">Loading your Slack alerts…</p>
        ) : !slackView.allowed ? (
          <section className="tp-card nt-card">
            <p className="cr-note">Alerts in Slack aren&apos;t part of your plan.</p>
          </section>
        ) : !connected ? (
          <section className="tp-card nt-card nt-connect">
            <p className="cr-note">Connect Slack to get {FEATURE_NAME}, new roles and messages in a channel or a DM you pick.</p>
            <button type="button" className="btn btn-pine" onClick={onIntegrations}>
              Connect Slack
            </button>
          </section>
        ) : (
          <section className="tp-card nt-card">
            <ul className="nt-rows">
              <Row
                id="nt-radar-slack"
                title={FEATURE_NAME}
                desc={
                  proNow
                    ? `Each company as it shows${plan?.name === "trial" ? `, in your trial until ${planDay(plan.trialEndsAt)}` : ""}. Set apart from its email.`
                    : `Each morning a company in your profile moves. Set apart from its email.`
                }
              >
                <Switch id="nt-radar-slack" on={radarSlack} onChange={(on) => void save("radarSlack", on)} />
              </Row>
              {SLACK_ALERTS.map((a) => {
                // Every alert but the weekly roles post is Pro's: locked in place on Free, marked in the trial.
                const pro = a.key !== "roles" && !!plan && plan.name !== "pro";
                const locked = pro && plan!.name === "free";
                const title = a.title(slackView.function, slackView.savedViews);
                return (
                  <Row
                    key={a.key}
                    id={`nt-a-${a.key}`}
                    title={
                      <>
                        {title} {pro && !locked && <ProTag plan={plan} />}
                      </>
                    }
                    desc={a.desc(slackView.function, slackView.savedViews)}
                  >
                    {locked ? <ProLock from="slack" what={title} /> : <Switch id={`nt-a-${a.key}`} on={slackView.alerts[a.key]} onChange={(on) => setAlert(a.key, on)} />}
                  </Row>
                );
              })}
            </ul>
            <p className="in-hint">At most one post of each kind every 15 minutes. When more happen, they come together in one post with a count.</p>
            <button type="button" className="btn btn-ghost nt-manage" onClick={onIntegrations}>
              Change where they go
            </button>
          </section>
        )}
      </section>
    </div>
  );
}
