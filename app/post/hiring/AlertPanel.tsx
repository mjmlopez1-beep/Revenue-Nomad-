"use client";

/**
 * "Save view with an alert" on Hiring now (HiringNow.dc.html, the alert panel): the "role posted"
 * list alert (BUILD_PLAN F5). The view is saved as a list of open roles with its alert on: the
 * weekly email of new roles that match (lib/table.ts digestList, after the weekly scan), and Slack when roles
 * open (lib/notify/events.ts) once Slack is connected. These are the Stage 1 list alert fields
 * (lib/mcp/alerts.ts ListAlert); the other triggers (a rate posted, a role closes) come with Alerts
 * and workflows, so they are not offered here. An alert never spends a credit.
 *
 * The member's other saved lists of roles are listed with their own switch (op "alert").
 */
import { useEffect, useState } from "react";
import type { IntegrationsView } from "@/lib/notify/types";
import type { SavedViewRec } from "@/lib/tableTypes";
import { IconX } from "../../ui/shared";

export function AlertPanel({
  title,
  defaultName,
  keeps,
  existing,
  others,
  first,
  free,
  onSave,
  onOff,
  onOther,
  onClose,
  onSlack,
  onAlerts,
}: {
  title: string;
  defaultName: string;
  keeps: string[];
  /** This view is saved already: its name and alert. */
  existing: SavedViewRec | null;
  /** The member's other saved lists of roles. */
  others: SavedViewRec[];
  first: boolean;
  /** On the Free plan (one saved list). */
  free: boolean;
  onSave: (name: string, slack: boolean) => Promise<boolean>;
  onOff: () => Promise<boolean>;
  onOther: (v: SavedViewRec, on: boolean) => void;
  onClose: () => void;
  onSlack: () => void;
  onAlerts: () => void;
}) {
  const was = existing?.alert;
  const on = !!(existing && (was ? was.on : existing.email));
  const [name, setName] = useState(existing?.name ?? defaultName);
  const [slack, setSlack] = useState(was ? !!was.slack : false);
  const [busy, setBusy] = useState(false);
  // Whether Slack is connected (Integrations), read once the panel opens. Null while unknown.
  const [slackOn, setSlackOn] = useState<{ on: boolean; channel: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/integrations", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<IntegrationsView>) : null))
      .then((v) => live && v && setSlackOn({ on: !!v.slack && !v.slack.broken, channel: v.slack?.channel ?? null }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const save = async () => {
    setBusy(true);
    const ok = await onSave(name.trim() || defaultName, slack);
    setBusy(false);
    if (ok) onClose();
  };
  const off = async () => {
    setBusy(true);
    const ok = await onOff();
    setBusy(false);
    if (ok) onClose();
  };
  const chan = (k: boolean, t: string, s: string) => (
    <button type="button" role="radio" aria-checked={slack === k} className={`hn-chan${slack === k ? " on" : ""}`} onClick={() => setSlack(k)}>
      <span className="hn-dot" aria-hidden />
      <span className="hn-chan-t">
        <span>{t}</span>
        <span className="hn-sub">{s}</span>
      </span>
      <span className="hn-free">Free</span>
    </button>
  );
  return (
    <aside className="wb-tools hn-drawer" aria-label="Saved view and alert">
      <form
        className="hn-dr hn-alert"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="hn-dr-top">
          <span className="hn-cap">Saved view · alert</span>
          <button type="button" className="hn-x" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        <h2 className="hn-dr-role">{title}</h2>
        <label className="hn-field">
          Name of this view
          <input className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="hn-keeps">
          <span className="hn-k">It keeps</span>
          {keeps.map((k) => (
            <span key={k} className="hn-keep">
              {k}
            </span>
          ))}
        </div>
        <fieldset className="hn-fs">
          <legend>Tell me when</legend>
          <span className="hn-when">
            <span className="hn-box-on" aria-hidden>
              ✓
            </span>
            <span className="hn-chan-t">
              <span>A new role matches this view</span>
              <span className="hn-sub">Merlin checks job boards every week. A rate posted and a role closing come with Alerts and workflows.</span>
            </span>
          </span>
        </fieldset>
        <fieldset className="hn-fs" role="radiogroup" aria-label="Send it to">
          <legend>Send it to</legend>
          {chan(false, "Email, once a week", "One email after the weekly scan, with the new roles")}
          {chan(true, "Email and Slack, the day it posts", slackOn?.on ? `Posts to ${slackOn.channel ?? "your Slack channel"}` : "Slack is not connected yet")}
          {slack && slackOn && !slackOn.on && (
            <p className="hn-note">
              <strong>Slack is not connected yet.</strong> Merlin posts alerts to one channel you pick. It does not read your messages or your other channels. Until then this alert comes by email.{" "}
              <button type="button" className="tp-flink" onClick={onSlack}>
                Connect Slack
              </button>
            </p>
          )}
        </fieldset>
        {others.length > 0 && (
          <div className="hn-others">
            <span className="hn-k">Alerts on your other saved views</span>
            {others.map((v) => {
              const vOn = v.alert ? v.alert.on : v.email;
              return (
                <span key={v.id} className="hn-other">
                  <span className="hn-chan-t">
                    <span>{v.name}</span>
                    <span className="hn-sub">{vOn ? (v.alert?.slack ? "Email and Slack" : "Weekly email") : "No alert"}</span>
                  </span>
                  <button type="button" role="switch" aria-checked={vOn} aria-label={`Alert for ${v.name}`} className={`hn-switch${vOn ? " on" : ""}`} onClick={() => onOther(v, !vOn)}>
                    {vOn ? "Alert on" : "Alert off"}
                  </button>
                </span>
              );
            })}
            <button type="button" className="tp-flink" onClick={onAlerts}>
              Rename or remove a view in Alerts and workflows
            </button>
          </div>
        )}
        <p className="hn-note hn-note-quiet">
          <strong>An alert never spends a credit.</strong>{" "}
          {first ? "Saving this view is step 5 of getting started. " : ""}
          {free ? "The Free plan keeps 1 saved view." : "Your plan has no limit on saved views. The Free plan keeps 1."} Your agent can open this view too.
        </p>
        <div className="hn-alert-foot">
          {on && (
            <button type="button" className="btn" disabled={busy} onClick={() => void off()}>
              Turn off
            </button>
          )}
          <button type="submit" className="btn btn-pine tp-grow" disabled={busy} aria-busy={busy}>
            {busy ? "Saving" : on ? "Save changes" : "Save view and alert"}
          </button>
        </div>
      </form>
    </aside>
  );
}
