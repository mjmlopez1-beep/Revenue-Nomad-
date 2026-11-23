"use client";

/**
 * Settings / Connections (Settings.dc.html): every source Merlin may read and every place it may
 * post, one row each, with what it reads, what it never does, its last activity, what it feeds and
 * Remove. A row opens below itself to connect, add a file, or manage it. Remove runs that source's
 * own delete (model.ts REMOVE, calls.ts runRemove): Google's Disconnect and delete everything, the
 * file deletes, Slack's and the webhook's Remove, Granola's Disconnect, an agent's revoke.
 *
 * Google moved here from Your network (connect, Read again, Gmail, what your agent saved, delete).
 * Google stays private to the member: only they see what it brings in (Google's Limited Use rules).
 */
import { useState, type ReactNode } from "react";
import type { IntegrationsView } from "@/lib/notify/types";
import type { NetworkView } from "@/lib/google/types";
import type { PathsView } from "@/lib/paths/types";
import type { GranolaStatus } from "@/lib/granola/types";
import { useToast } from "../../ui/shared";
import { GoogleG, GooglePolicyLink, startGoogle } from "../network/Network";
import { netAct, NOTICE_WORDS, type GoogleNotice } from "../network/useNetwork";
import { loadKnown } from "../network/usePaths";
import { CsvAct, LinkedInAct } from "../network/ConnectPanel";
import { ConnectForm, SlackGlyph } from "../Integrations";
import { connectKey, loadGranola, startGranola, useGranolaNotice } from "../granolaClient";
import { GRANOLA_READS } from "../GranolaSection";
import "../granola.css";
import { openPlans } from "../Billing";
import { useApp } from "../shell/pages";
import type { ConnKey } from "./at";
import { REMOVE, dayWords, type ConnRow, type Feed } from "./model";
import { runRemove, send } from "./calls";

export interface ConnData {
  net: { view: NetworkView | null; off: boolean };
  paths: PathsView | null;
  integ: IntegrationsView | null;
  setInteg: (v: IntegrationsView) => void;
  granola: GranolaStatus | null;
  apps: { id: string; name: string; connectedAt: string; lastUsedAt: string }[] | null;
  reloadApps: () => void;
}

const INITIALS: Record<ConnKey, string> = { google: "Go", linkedin: "Li", csv: "Co", slack: "Sl", hook: "Ot", granola: "Gr", agent: "Ag" };

export function Connections({ rows, open, setOpen, data, onNotif, flash }: { rows: ConnRow[]; open: ConnKey | null; setOpen: (k: ConnKey | null) => void; data: ConnData; onNotif: () => void; flash: (t: string, err?: boolean) => void }) {
  const [asking, setAsking] = useState<ConnKey | null>(null);
  const [busy, setBusy] = useState<ConnKey | null>(null);
  const remove = async (r: ConnRow) => {
    setBusy(r.key);
    const res = await runRemove(REMOVE[r.key], data.apps ?? []);
    setBusy(null);
    setAsking(null);
    if (!res.ok) return flash(res.error, true);
    if (r.key === "slack" || r.key === "hook") {
      const v = (res.data as { view?: IntegrationsView } | undefined)?.view;
      if (v) data.setInteg(v);
    }
    if (r.key === "agent") data.reloadApps();
    if (r.key === "linkedin" || r.key === "csv") void loadKnown(true);
    flash(`${r.name} is off. What it gave Merlin is deleted.`);
  };
  return (
    <>
      <div className="st-conn" role="table" aria-label="Connections">
        <div className="st-conn-row st-conn-headrow" role="row">
          <span role="columnheader">Connection</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">What it can read, and never</span>
          <span role="columnheader">What it feeds</span>
          <span role="columnheader">Last activity</span>
          <span role="columnheader">
            <span className="st-sr">Change</span>
          </span>
        </div>
        {rows.map((r) => {
          const op = open === r.key;
          return (
            <div key={r.key} className="st-conn-group" role="rowgroup">
              <div className={`st-conn-row${op ? " open" : ""}`} role="row" data-conn={r.key}>
                <span role="cell" className="st-conn-name">
                  <span className={`st-tile st-tile-${r.key}`} aria-hidden>
                    {r.key === "google" ? <GoogleG size={16} /> : INITIALS[r.key]}
                  </span>
                  <span className="st-two">
                    <strong>{r.name}</strong>
                    <span>{r.sub}</span>
                  </span>
                </span>
                <span role="cell" className="st-two">
                  <span className={`st-pill${r.on && !r.trouble ? " on" : ""}${r.trouble ? " warn" : ""}`}>{r.status}</span>
                  <span className="st-faint">{r.since}</span>
                </span>
                <span role="cell" className="st-reads">
                  <span>{r.reads}</span>
                  <span className="st-never">
                    <strong>Never:</strong> {r.never}
                  </span>
                </span>
                <span role="cell" className="st-feeds">
                  <Feeds feeds={r.feeds} />
                </span>
                <span role="cell" className="st-last">
                  {r.last}
                </span>
                <span role="cell" className="st-conn-acts">
                  <button type="button" className={`btn btn-sm${!r.on && !op ? " st-go-off" : ""}`} aria-expanded={op} aria-label={`${op ? "Close" : r.go} ${r.name}`} onClick={() => (setOpen(op ? null : r.key), setAsking(null))}>
                    {op ? "Close" : r.go}
                  </button>
                  {r.remove && asking !== r.key && (
                    <button type="button" className="btn btn-sm btn-ghost st-remove" aria-label={`Remove ${r.name}`} disabled={!!busy} onClick={() => setAsking(r.key)}>
                      Remove
                    </button>
                  )}
                </span>
              </div>
              {r.remove && asking === r.key && (
                <div className="st-conn-ask" role="row">
                  <div role="cell" className="st-ask" aria-label="Please confirm">
                    <span>{r.remove.ask}</span>
                    <span className="st-ask-acts">
                      <button type="button" className="btn btn-sm st-btn-red" disabled={busy === r.key} aria-busy={busy === r.key} onClick={() => void remove(r)}>
                        {busy === r.key ? "Removing" : r.remove.yes}
                      </button>
                      <button type="button" className="btn btn-sm btn-pine" autoFocus onClick={() => setAsking(null)}>
                        Keep it
                      </button>
                    </span>
                  </div>
                </div>
              )}
              {op && (
                <div className="st-conn-detail" role="row">
                  <div role="cell">
                    <Detail k={r.key} row={r} data={data} onNotif={onNotif} flash={flash} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="st-note">Merlin never reads the text of an email or a message, through any connection. When you remove one, what it gave Merlin is deleted as its row says. Connections never spend a credit.</p>
    </>
  );
}

/** A row's "what it feeds": each a link to that page. */
function Feeds({ feeds }: { feeds: Feed[] }) {
  const c = useApp();
  const go = (f: Feed) => {
    if (f.page === "people") return c.table.setRecordType("people"), c.openPage("table");
    if (f.page === "seats") return c.openSeats();
    c.openPage(f.page);
  };
  return (
    <>
      {feeds.map((f) => (
        <button key={f.label} type="button" className="st-feed" onClick={() => go(f)} title={f.why}>
          {f.label}
        </button>
      ))}
    </>
  );
}

function Facts({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <div className="st-facts">
      <span className="st-kicker">{title}</span>
      {rows.map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}

/** What opens under a row: how to connect it, or what is on file and what else it can do. */
function Detail({ k, row, data, onNotif, flash }: { k: ConnKey; row: ConnRow; data: ConnData; onNotif: () => void; flash: (t: string, err?: boolean) => void }) {
  const c = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const nowMs = Date.now();
  if (k === "google") {
    const v = data.net.view;
    const g = v?.google ?? null;
    const run = async (key: string, op: "sync" | "drop-gmail" | "forget-claude") => {
      setBusy(key);
      const r = await netAct(op);
      setBusy(null);
      flash(r.error ?? r.message ?? "Done.", !!r.error);
    };
    if (!v) return <p className="st-faint">Loading Google…</p>;
    if (!g)
      return (
        <div className="st-detail">
          <div className="st-detail-main">
            <strong className="st-detail-h">Connect Google to bring in who you know</strong>
            <span>Merlin reads your contacts and calendar, read only, and matches them to companies on Merlin. This is step 3 of getting started, and it turns into warm paths. Only you see it.</span>
            <ol className="st-steps">
              <li>Pick your Google account.</li>
              <li>Google shows what Merlin asks for: contacts and calendar, read only. No Gmail.</li>
              <li>The first read takes a minute or two. You can keep working.</li>
            </ol>
            {v.configured ? (
              <span className="st-acts">
                <button type="button" className="btn btn-pine st-g" onClick={() => startGoogle()}>
                  <GoogleG size={16} /> Connect Google
                </button>
                <GooglePolicyLink />
              </span>
            ) : (
              <span className="st-faint">Google isn&apos;t set up on Merlin yet. Your LinkedIn connections file or a contacts file works without it.</span>
            )}
          </div>
          <Facts title="WHAT MERLIN KEEPS" rows={[["Per company", "Counts and dates"], ["Per person", "Name, title, email"], ["Seen by", "Only you"], ["Cost", "Free, no credits"]]} />
          <FeedsBox row={row} />
        </div>
      );
    return (
      <div className="st-detail">
        <div className="st-detail-main">
          <strong className="st-detail-h">Google is connected{g.email ? ` as ${g.email}` : ""}</strong>
          <span>Merlin reads your contacts and calendar once a day, read only. It keeps counts and dates, never what a meeting or an email was about. Only you see it, and it never feeds another member&apos;s counts.</span>
          {g.status === "reconnect" && (
            <span className="st-warn" role="status">
              Google access was removed{g.goneAt ? ` on ${dayWords(g.goneAt, nowMs)}` : ""}. Reconnect{g.deleteOn ? ` before ${dayWords(`${g.deleteOn}T12:00:00Z`, nowMs)}` : " within 30 days"} or Merlin deletes what it read from Google.
            </span>
          )}
          <span className="st-acts">
            {g.status === "reconnect" ? (
              <button type="button" className="btn btn-pine btn-sm st-g" onClick={() => startGoogle()}>
                <GoogleG size={16} /> Reconnect Google
              </button>
            ) : (
              <button type="button" className="btn btn-sm" disabled={!!busy || v.syncing} aria-busy={busy === "sync"} onClick={() => void run("sync", "sync")}>
                {v.syncing ? "Reading" : "Read again now"}
              </button>
            )}
            {v.gmail && (
              <button type="button" className="btn btn-sm" disabled={!!busy} aria-busy={busy === "gmail"} onClick={() => void run("gmail", "drop-gmail")}>
                Drop Gmail
              </button>
            )}
            {v.claude && (
              <button type="button" className="btn btn-sm" disabled={!!busy} aria-busy={busy === "claude"} onClick={() => void run("claude", "forget-claude")}>
                Delete what your agent saved
              </button>
            )}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => c.openPage("warm")}>
              See your warm paths
            </button>
          </span>
          <span className="st-faint">If you remove Merlin at Google instead, Merlin deletes what it kept after 30 days. Remove deletes it at once.</span>
        </div>
        <Facts
          title="ON FILE NOW"
          rows={[
            ["Companies you know people at", (v.companies?.length ?? 0).toLocaleString("en-US")],
            ["Warm paths", (v.warm?.length ?? 0).toLocaleString("en-US")],
            ["Last read", g.syncedAt ? dayWords(g.syncedAt, nowMs) : v.syncing ? "Reading now" : "Not yet"],
            ["Seen by", "Only you"],
          ]}
        />
        <FeedsBox row={row} />
      </div>
    );
  }
  if (k === "linkedin" || k === "csv") {
    const info = k === "linkedin" ? data.paths?.linkedin : data.paths?.csv;
    return (
      <div className="st-detail">
        <div className="st-detail-main">
          <strong className="st-detail-h">{k === "linkedin" ? (info ? "Your LinkedIn connections file is in" : "Add your LinkedIn connections file") : info ? "Your contacts file is in" : "Add a contacts file"}</strong>
          <span>
            {k === "linkedin"
              ? "Your own copy of your connections, a file LinkedIn gives you. Merlin matches the people in it to companies on Merlin. It never asks for your LinkedIn sign-in. Only you see them."
              : "Any list with a name and a company. You match the columns and see a preview before anything is saved. Only the columns you pick reach Merlin."}
          </span>
          {k === "linkedin" ? (
            <LinkedInAct paths={data.paths} onAdded={() => (toast("Your connections are in. Only you see them."), void loadKnown(true))} />
          ) : (
            <CsvAct paths={data.paths} wide={!c.phone} onAdded={() => (toast("Your contacts are in. Only you see them."), void loadKnown(true))} />
          )}
        </div>
        <Facts
          title={info ? "ON FILE NOW" : "WHAT MERLIN KEEPS"}
          rows={info ? [["People in the file", info.rows.toLocaleString("en-US")], ["At companies on Merlin", info.matched.toLocaleString("en-US")], ["Added", dayWords(info.at, nowMs)], ["Seen by", "Only you"]] : [["Per person", "Name, company, title"], ["Seen by", "Only you"], ["Cost", "Free, no credits"]]}
        />
        <FeedsBox row={row} />
      </div>
    );
  }
  if (k === "slack" || k === "hook") {
    const integ = data.integ;
    const d = k === "slack" ? integ?.slack ?? null : integ?.webhook ?? null;
    const field = k === "slack" ? "slack" : "webhook";
    const op = async (key: string, body: Record<string, unknown>): Promise<string | null> => {
      setBusy(key);
      const r = await send<{ view?: IntegrationsView; message?: string }>("/api/integrations", body);
      setBusy(null);
      if (!r.ok) return r.error;
      if (r.data?.view) data.setInteg(r.data.view);
      if (r.message && r.message !== "Saved.") flash(r.message);
      return null;
    };
    if (!integ) return <p className="st-faint">Loading…</p>;
    return (
      <div className="st-detail">
        <div className="st-detail-main">
          {d ? (
            <>
              <strong className="st-detail-h">{k === "slack" ? (d.channel ? `Posting to ${d.channel}${d.team ? ` in ${d.team}` : ""}` : "Posting to Slack") : "Posting to your webhook"}</strong>
              <span>{k === "slack" ? "Merlin can post to this one channel and nothing else. You choose which alerts go there in Notifications." : "The same alerts you chose for Slack, one post each."}</span>
              {d.problem && (
                <span className="st-warn" role="status">
                  {d.problem}
                  {d.broken ? " Alerts to it have stopped. Remove it and connect a new URL." : ""}
                </span>
              )}
              <span className="st-acts">
                <button type="button" className="btn btn-sm" disabled={!!busy || d.broken} aria-busy={busy === "test"} onClick={() => void op("test", { op: "test", field }).then((e) => e && flash(e, true))}>
                  {busy === "test" ? "Sending" : "Send a test"}
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={onNotif}>
                  Choose what is posted
                </button>
              </span>
              <span className="st-faint">A webhook URL works like a password for its channel. Merlin keeps it sealed and shows only its last four characters.</span>
            </>
          ) : k === "slack" ? (
            <>
              <strong className="st-detail-h">Get alerts in Slack</strong>
              <span>Slack asks which channel Merlin can post to. That is all it can do. Merlin sends a test message before it saves anything.</span>
              {integ.slackApp && (
                <span className="st-acts">
                  <a className="btn btn-pine st-g" href="/api/integrations/slack/start">
                    <SlackGlyph /> Add to Slack
                  </a>
                </span>
              )}
              <ConnectForm
                id="st-slack-url"
                label={integ.slackApp ? "Or paste a Slack webhook URL you made" : "Slack webhook URL"}
                placeholder="https://hooks.slack.com/services/…"
                button="Connect Slack"
                busy={busy === "connect"}
                field="slack"
                onConnect={(url) => op("connect", { op: "connect", field: "slack", url })}
                hint="Make an incoming webhook in your own Slack and paste its URL. Workflow Builder webhooks work too."
              />
            </>
          ) : (
            <>
              <strong className="st-detail-h">Send alerts to another tool</strong>
              <span>Make a webhook trigger in Zapier, Make or n8n, then paste its URL. Merlin sends a test post first.</span>
              <ConnectForm
                id="st-hook-url"
                label="Webhook URL"
                placeholder="https://hooks.zapier.com/hooks/catch/…"
                button="Connect webhook"
                busy={busy === "connect"}
                field="webhook"
                onConnect={(url) => op("connect", { op: "connect", field: "webhook", url })}
                hint="It has to start with https://. Merlin waits at most 5 seconds for an answer."
              />
            </>
          )}
        </div>
        <Facts
          title={d ? "ON FILE NOW" : "BY PLAN"}
          rows={
            d
              ? [["URL", d.masked], ["Since", dayWords(d.addedAt, nowMs)], ["Last post", d.lastOkAt ? dayWords(d.lastOkAt, nowMs) : "Not yet"], ["Pace", "1 post per kind, per 15 minutes"]]
              : [["Free", "A weekly post of new roles"], ["Pro and the trial", "Every alert, as it happens"], ["Cost", "No credits"]]
          }
        />
        <FeedsBox row={row} />
      </div>
    );
  }
  if (k === "granola") return <GranolaDetail row={row} status={data.granola} flash={flash} />;
  // An agent, such as Claude: connecting, the tools' switches and the limit are Agent access's.
  const apps = data.apps ?? [];
  return (
    <div className="st-detail">
      <div className="st-detail-main">
        <strong className="st-detail-h">{apps.length ? `${apps.length === 1 ? "1 app can" : `${apps.length} apps can`} use your Merlin account` : "Use Merlin from your own agent"}</strong>
        <span>
          {apps.length
            ? "An agent asks Merlin in your own words and acts as you. It sees what you can see, and it asks before it spends a credit."
            : "Add the Merlin connector to Claude or another agent, then ask in your own words. It asks before it spends a credit."}
        </span>
        {!apps.length && (
          <ol className="st-steps">
            <li>Open Agent access and copy the connector address.</li>
            <li>Add it in your agent, and sign in to Merlin when it asks.</li>
          </ol>
        )}
        <span className="st-acts">
          <button type="button" className={`btn btn-sm${apps.length ? "" : " btn-pine"}`} onClick={() => c.openPage("agent")}>
            {apps.length ? "Open Agent access" : "Set up in Agent access"}
          </button>
        </span>
      </div>
      <Facts title={apps.length ? "CONNECTED APPS" : "LIMITS"} rows={apps.length ? apps.map((a) => [a.name, `Since ${dayWords(a.connectedAt, nowMs)} · used ${dayWords(a.lastUsedAt, nowMs).toLowerCase()}`] as [string, string]) : [["Spending", "Always asks first"], ["Cost", "No credits to connect"]]} />
      <FeedsBox row={row} />
    </div>
  );
}

function FeedsBox({ row }: { row: ConnRow }) {
  return (
    <div className="st-facts st-feedsbox">
      <span className="st-kicker">WHAT IT FEEDS</span>
      <Feeds feeds={row.feeds} />
    </div>
  );
}

/**
 * Granola (RN_GRANOLA): Connect Granola (one button to Granola's consent page and back here, with
 * "Granola connected"), or when Granola's sign-in isn't available a personal API key, checked
 * once, kept sealed. One status and one Disconnect (the row's Remove) either way. Drafting from a
 * call is Close.
 */
function GranolaDetail({ row, status, flash }: { row: ConnRow; status: GranolaStatus | null; flash: (t: string, err?: boolean) => void }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [going, setGoing] = useState(false);
  useGranolaNotice((t, bad) => flash(t, bad));
  if (!status) return null;
  const connect = async () => {
    const k = key.trim();
    if (!k) return setErr("Paste the API key from Granola. It starts with grn_.");
    setBusy(true);
    const r = await connectKey(k);
    setBusy(false);
    if (r.error !== undefined) return setErr(r.error);
    setKey("");
    setErr(null);
    void loadGranola(true);
    flash(r.message);
  };
  const oauth = status.via === "oauth";
  const keyForm = (
    <form
      className="st-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void connect();
      }}
    >
      <label className="st-label" htmlFor="st-granola-key">
        Granola API key
      </label>
      <span className="st-inrow">
        <input id="st-granola-key" className={`input mono${err ? " bad" : ""}`} type="password" autoComplete="off" spellCheck={false} placeholder="grn_…" value={key} aria-invalid={!!err} onChange={(e) => (setKey(e.target.value), err && setErr(null))} />
        <button type="submit" className={`btn${status.oauth ? "" : " btn-pine"}`} disabled={busy} aria-busy={busy}>
          {busy ? "Checking" : status.oauth ? "Connect this key" : "Connect Granola"}
        </button>
      </span>
      {err && (
        <span className="st-err" role="alert">
          {err}
        </span>
      )}
    </form>
  );
  return (
    <div className="st-detail">
      <div className="st-detail-main">
        {status.connected ? (
          <>
            <strong className="st-detail-h">Granola is connected</strong>
            <span>{oauth ? "Connected with your Granola account. " : ""}When you start a proposal, Merlin lists your recent calls with that company. It reads the one call you pick, and drafts from it. It keeps the draft, never the transcript.</span>
            {status.broken && <span className="st-warn">{oauth ? "Granola stopped letting Merlin read your calls. Disconnect, then connect Granola again." : "Granola stopped accepting this key. Remove it, make a new key in Granola and connect that one."}</span>}
            {!status.canDraft && (
              <span className="st-acts">
                <span className="st-faint">Drafting a proposal from a call is part of Close. {oauth ? "Granola stays connected." : "Your key stays connected."}</span>
                <button type="button" className="btn btn-sm" onClick={() => openPlans("proposals")}>
                  See the Close plan
                </button>
              </span>
            )}
          </>
        ) : status.oauth ? (
          <>
            <strong className="st-detail-h">Connect Granola to draft proposals from your calls</strong>
            <span>{GRANOLA_READS}</span>
            <span className="gr-signin">
              <button type="button" className="btn btn-pine" aria-busy={going} disabled={going} onClick={() => (setGoing(true), startGranola())}>
                {going ? "Opening Granola" : "Connect Granola"}
              </button>
              <span className="st-faint">You say yes at Granola, then come back here.</span>
            </span>
            <details className="gr-keyalt">
              <summary>Or paste a Granola API key</summary>
              <span className="st-faint">A key from Granola, Settings, Connectors, API keys. It needs a Granola Business or Enterprise plan. Merlin checks it with one call, then keeps it sealed.</span>
              {keyForm}
            </details>
          </>
        ) : (
          <>
            <strong className="st-detail-h">Connect Granola to draft proposals from your calls</strong>
            <span>Paste an API key from Granola. Merlin checks it with one call, then keeps it sealed. You only ever see its last four characters.</span>
            {keyForm}
          </>
        )}
      </div>
      <Facts
        title={status.connected ? "ON FILE NOW" : "GOOD TO KNOW"}
        rows={
          status.connected
            ? [[oauth ? "Access" : "Key", oauth ? "Your Granola account, kept sealed" : status.last4 ? `Ends ${status.last4}, kept sealed` : "Kept sealed"], ["Part of", "Close"]]
            : [["Without it", "Paste a transcript instead"], ["Part of", "Close, yours on the trial"]]
        }
      />
      <FeedsBox row={row} />
    </div>
  );
}

/** The words for Google's return (?google=connected, from Your network's old address): said once, in the page's flash. */
export const googleNoticeWords = (n: GoogleNotice) => NOTICE_WORDS[n];
