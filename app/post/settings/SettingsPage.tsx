"use client";

/**
 * Settings (page "settings", Settings.dc.html), the new look's one page for what lived on separate
 * pages and sheets: Profile and card and Ideal client (Your profile's sheet, Hunt.tsx), Voice
 * (Voice.tsx), Connections (Integrations, Granola, Google from Your network, the LinkedIn
 * connections file and a contacts file), Notifications (the same switches as Alerts and workflows),
 * Signature (MySignature.tsx), Privacy (the directory, the name on your seats, leads), Your agents
 * (Stage 7a's card to Agent access), Plan (to Credits and usage) and Your account (the sign-in link,
 * closing the account with 30 days to bring it back). On the left, Your setup: what is done, what
 * is next.
 *
 * Every switch and every Save goes to the home it has today; nothing new is stored. Members cannot
 * export anything from Merlin (the owner's rule): there is no export or download here.
 *
 * Addresses: ?p=settings&sec=<section> (place.ts settingsSecOf), and the old ones land on theirs:
 * ?p=integrations is Connections, Google's return (?p=network&google=…) is Connections at Google.
 * On a phone the page opens on its list, and a section has a way back to it.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Icp } from "@/lib/tableTypes";
import type { IntegrationsView } from "@/lib/notify/types";
import type { CloseInboxView } from "@/lib/close/types";
import type { AlertsView } from "@/lib/inbox";
import { FUNCTIONS, NAME_HIDDEN } from "@/lib/tableFields";
import { planName } from "@/lib/billing/rules";
import { NEUTRAL_VOICE, VOICE_EXCLAMATIONS, VOICE_FORMALITY, VOICE_GREETINGS, VOICE_LENGTHS, VOICE_NAMES, VOICE_OPENERS, VOICE_PHRASES_MAX, VOICE_PHRASE_CHARS, VOICE_SIGNOFFS, greetingWords, phraseProblem, styleOf, type VoiceStyle } from "@/lib/voice";
import { IconCheck, IconChevron, IconX, initials } from "../../ui/shared";
import { copyText } from "../hooks";
import { useApp } from "../shell/pages";
import { ShellHeader } from "../shell/Header";
import { PageStrip } from "../shell/PageStrip";
import { BeforeFields, EMPTY_ICP, IcpFields, countriesByCount, industriesByCount } from "../Hunt";
import { icpEmpty, icpMatch, isFirm, isOpenRole, shown } from "../model";
import { useNetwork, takeNotice } from "../network/useNetwork";
import { usePaths } from "../network/usePaths";
import { useExport } from "../network/useExport";
import { ClaudeNetworkPrompt } from "../network/Network";
import { useGranola } from "../granolaClient";
import { VOICE_PROMPT, VoicePrompt } from "../Voice";
import { MySignature, useMySignature } from "../MySignature";
import { CloseAccount, SignInActions } from "../Settings";
import { openPlans } from "../Billing";
import { alertOn } from "../getStarted";
import { planLine } from "../navModel";
import { CARD_LINE_MAX, CARD_CITY_MAX } from "../fractionalsModel";
import { alertGroups, type ChanKey, type Row } from "../alerts/model";
import { onSettingsAt, takeSettingsAt, takeSlackNotice, atOf, type ConnKey } from "./at";
import { RADAR_FREQ, SECTIONS, SEC_LEAD, chipCall, connRows, listsLine, notifRows, sampleNote, secName, setupMeter, type SecKey, type NotifCall } from "./model";
import { Connections, googleNoticeWords, type ConnData } from "./Connections";
import { closePref, send } from "./calls";
import "../hunt.css";
import "./settings.css";

type Flash = { t: string; err?: boolean } | null;
const SLACK_WORDS = {
  connected: "Slack is connected. A test message went to the channel you picked.",
  denied: "Nothing was connected. You picked Cancel in Slack. Try again whenever you like.",
  failed: "Merlin couldn't connect Slack, so nothing was saved. Try Add to Slack again, or paste a webhook URL.",
} as const;

/* ---------- the icons of the section list (the mockup's) ---------- */
const ICON: Record<SecKey, string> = {
  profile: "M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0",
  ideal: "M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z",
  voice: "M4 20l4-1 11-11-3-3L5 16zM14 7l3 3",
  conn: "M9 3v5M15 3v5M7 8h10v4a5 5 0 0 1-10 0zM12 17v4",
  notif: "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15zM10 21a2 2 0 0 0 4 0",
  sig: "M4 17c3-6 5-6 6-2s3 3 4 0 3-2 6 2M4 21h16",
  priv: "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z",
  agents: "M5 8h14v10H5zM9 4h6M12 4v4M9 13h.01M15 13h.01",
  plan: "M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3",
  data: "M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3",
};
const Ico = ({ d, on }: { d: string; on?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={on ? "#073F2F" : "#28322D"} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

/* ---------- drafts: what a section with a Save button holds until it is saved ---------- */
type ProfileDraft = { title: string; headline: string; city: string };
type IdealDraft = { fn: string | null; icp: Icp; before: string[] | null; looking: boolean | null };
type VoiceDraft = { v: VoiceStyle; phrases: string[] };
type Drafts = { profile?: ProfileDraft; ideal?: IdealDraft; voice?: VoiceDraft };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

let arrived: { flash: Flash; at: number } | null = null;
/** Google's or Slack's answer from the address, taken once and kept for a few seconds. */
function arrivedNotice(): Flash {
  if (!arrived) {
    const g = takeNotice();
    const s = takeSlackNotice();
    arrived = { flash: g ? { t: googleNoticeWords(g), err: g !== "connected" && g !== "gmail" } : s ? { t: SLACK_WORDS[s], err: s !== "connected" } : null, at: Date.now() };
  }
  return Date.now() - arrived.at < 5000 ? arrived.flash : null;
}

export function SettingsPage() {
  const c = useApp();
  const me = c.me;
  const [land] = useState(() => takeSettingsAt() ?? (typeof window === "undefined" ? { sec: null, open: null } : atOf(window.location.search)));
  /*
   * A first visit: nothing of the member's own here beyond their sign-up answers (the ideal client
   * comes from sign-up): no one line, voice, alert, seat or source yet. Read once: what the member
   * sets here doesn't swap the page under them.
   */
  const [own] = useState(() => (icpEmpty(me.icp) ? 0 : [!!me.headline, !!me.voice, (me.savedViews ?? []).some(alertOn), c.shell.seats.length > 0, !!me.started?.network].filter(Boolean).length));
  const first = own === 0;
  const [sec, setSec] = useState<SecKey | null>(() => land.sec ?? (c.phone ? null : first ? "ideal" : "conn"));
  const [open, setOpen] = useState<ConnKey | null>(land.open);
  const [flash, setFlash] = useState<Flash>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const say = (t: string, err = false) => setFlash({ t, err });

  // The answers the member came back with (Google's and Slack's), once (kept a moment, as the shell may draw the page twice while it loads).
  useEffect(() => {
    const n = arrivedNotice();
    if (n) setFlash(n);
  }, []);
  // openSettings while the page is on screen: go there.
  useEffect(
    () =>
      onSettingsAt(() => {
        const at = takeSettingsAt();
        if (!at) return;
        if (at.sec) setSec(at.sec);
        if (at.open) setOpen(at.open);
        setFlash(null);
      }),
    [],
  );
  // The section in the address, so a reload or a shared link opens it (TradingPost keeps it: place.ts settingsSecOf).
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("p") !== "settings") return;
      if (sec) u.searchParams.set("sec", sec);
      else u.searchParams.delete("sec");
      if (sec === "conn" && open) u.searchParams.set("open", open);
      else u.searchParams.delete("open");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    } catch {}
  }, [sec, open]);

  /* ---- what the meter and Connections read ---- */
  const net = useNetwork();
  const { view: paths } = usePaths();
  const lixView = useExport().view;
  const gr = useGranola();
  const [integ, setInteg] = useState<IntegrationsView | null>(null);
  const [apps, setApps] = useState<ConnData["apps"]>(null);
  const loadInteg = () => void send<{ view: IntegrationsView }>("/api/integrations").then((r) => r.ok && r.data && setInteg(r.data.view));
  const loadApps = () => void send<{ apps?: NonNullable<ConnData["apps"]> }>("/api/oauth/apps").then((r) => setApps(r.ok ? r.data?.apps ?? [] : []));
  useEffect(() => {
    loadInteg();
    loadApps();
  }, []);
  const canClose = me.plan?.canClose ?? true;
  const [sigSt, setSig] = useMySignature();
  const g = net.view?.google ?? null;
  const source = (!!g && g.status !== "reconnect") || !!paths?.linkedin || !!paths?.csv || !!lixView?.info || !!me.started?.network;
  const meter = setupMeter({
    headline: !!me.headline?.trim(),
    icp: !icpEmpty(me.icp) && !!me.function,
    seats: c.shell.seats.length,
    source,
    voice: !!me.voice,
    sig: canClose ? (sigSt.loaded ? !!sigSt.sig : false) : null,
    alert: (me.savedViews ?? []).some(alertOn),
  });
  const nowMs = Date.now();
  const rows = connRows({
    google: net.off || !net.view ? (net.off ? null : { configured: true, link: null, gmail: null, claude: null, syncing: false, companies: 0 }) : { configured: net.view.configured, link: g, gmail: net.view.gmail, claude: net.view.claude, syncing: net.view.syncing, companies: net.view.companies?.length ?? 0 },
    paths: paths ? { linkedin: paths.linkedin, csv: paths.csv, ...(lixView ? { lix: lixView.info } : {}) } : null,
    integ,
    granola: gr.status,
    apps,
    nowMs,
  });
  const onConn = rows.filter((r) => r.on).length;

  const go = (k: SecKey | null, row?: ConnKey | null) => {
    setSec(k);
    setFlash(null);
    if (row !== undefined) setOpen(row);
    if (c.phone) window.scrollTo(0, 0);
  };
  const runNext = () => {
    const n = meter.next;
    if (!n) return;
    if ("sec" in n.go) return go(n.go.sec, n.go.sec === "conn" ? (net.off ? "linkedin" : "google") : undefined);
    if (n.go.page === "seats") return c.openSeats();
    c.openPage(n.go.page);
  };

  const dirty: Partial<Record<SecKey, boolean>> = {
    profile: !!drafts.profile && !same(drafts.profile, profileOf(me)),
    ideal: !!drafts.ideal && !same(drafts.ideal, idealOf(me)),
    voice: !!drafts.voice && !same(drafts.voice, voiceOf(me)),
  };
  const subOf = (k: SecKey): string => {
    switch (k) {
      case "profile":
        return me.headline ? `${me.name} · card ready` : "Add your one line";
      case "ideal":
        return icpEmpty(me.icp) ? "Not set yet" : `${me.function ?? "Any function"} · saved`;
      case "voice":
        return me.voice ? (me.voice.by === "claude" ? "Saved · by your own agent" : "Saved · set by you") : "Not set · neutral voice";
      case "conn":
        return `${onConn} of ${rows.length} on`;
      case "notif":
        return integ?.slack ? "Email, Slack and the bell" : "Email and the bell";
      case "sig":
        return !canClose ? "Part of Close" : sigSt.sig ? "Saved" : "Not set";
      case "priv":
        return me.nameHidden ? "Name hidden on seats" : me.fractionals === true ? "In the directory" : me.fractionals === false ? "Out of the directory" : "Not chosen yet";
      case "agents":
        return apps?.length ? `${apps.length} connected` : "Agent access";
      case "plan":
        return me.plan ? planLine(me.plan) ?? planName(me.plan) : "Credits and usage";
      case "data":
        return "Sign-in link, close account";
    }
  };
  const pill: Partial<Record<SecKey, string>> = {
    ideal: first && !icpEmpty(me.icp) ? "From your sign-up answers" : "",
    voice: me.voice ? (me.voice.by === "claude" ? "Saved by your own agent" : "Saved by you") : "Not set yet · Merlin writes plain and neutral",
    conn: `${onConn} of ${rows.length} on · none of these spend a credit`,
    notif: "Saves at once",
    sig: canClose ? (me.plan?.name === "trial" ? "Part of Close · yours on the trial" : "Part of Close") : "Part of Close",
    priv: "Saves at once",
    plan: me.plan ? planLine(me.plan) ?? planName(me.plan) : "",
  };

  const header = (
    <ShellHeader
      crumbs={[
        { label: "Home", href: c.hrefOf("today"), go: () => c.openPage("today") },
        ...(sec ? [{ label: "Settings", href: c.hrefOf("settings"), go: () => go(c.phone ? null : sec) }] : []),
      ]}
      title={sec ? secName(sec) : "Settings"}
      phone={c.phone}
      onHome={() => c.openPage("today")}
      actions={c.headerActions}
      hosts={null}
    />
  );
  const strip = (
    <PageStrip page="settings" own={own} title="What Settings is for.">
      Say who you want as clients, choose what Merlin may read, and set how it writes and signs as you. Your answers from sign-up are already filled in.
    </PageStrip>
  );

  const nav = (
    <nav className="st-nav" aria-label="Settings sections">
      <div className={`st-meter${meter.next ? " next" : ""}`}>
        <span className="st-meter-h">
          <strong>Your setup</strong>
          <span className="num">{meter.text}</span>
        </span>
        <span className="st-ticks" aria-hidden>
          {meter.items.map((it, i) => (
            <span key={it.key} className={i < meter.done ? "on" : ""} />
          ))}
        </span>
        <ul className="st-meter-list" aria-label="What is done and what is left">
          {meter.items.map((it) => (
            <li key={it.key} className={it.done ? "done" : ""}>
              <span className="st-dot" aria-hidden />
              {it.label}
              <span className="st-sr">{it.done ? ", done" : ", not done yet"}</span>
            </li>
          ))}
        </ul>
        <span className="st-meter-note">{meter.note}</span>
        {meter.next && !("sec" in meter.next.go && meter.next.go.sec === sec) && (
          <button type="button" className="btn btn-pine btn-sm st-next" onClick={runNext}>
            {meter.next.next}
          </button>
        )}
      </div>
      <div className="st-secs">
        {SECTIONS.map((s) => {
          const on = s.key === sec;
          return (
            <button key={s.key} type="button" className={`st-sec${on ? " on" : ""}`} aria-current={on ? "page" : undefined} onClick={() => go(s.key)}>
              <Ico d={ICON[s.key]} on={on} />
              <span className="st-two">
                <span className="st-sec-n">{s.name}</span>
                <span className="st-sec-s">{dirty[s.key] ? "Changes not saved yet" : subOf(s.key)}</span>
              </span>
              {c.phone && <IconChevron dir="right" size={14} />}
            </button>
          );
        })}
      </div>
      <span className="st-legal">
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
        <a href="/data">Where your data goes</a>
      </span>
    </nav>
  );

  const body = sec ? (
    <section className="st-main" aria-labelledby="st-h">
      {c.phone && (
        <button type="button" className="st-back" onClick={() => go(null)}>
          <IconChevron dir="left" size={14} /> All settings
        </button>
      )}
      <div className="st-head">
        <div>
          <h1 id="st-h">{secName(sec)}</h1>
          <span className="st-lead">{SEC_LEAD[sec]}</span>
        </div>
        {pill[sec] ? <span className="st-hpill">{pill[sec]}</span> : null}
      </div>
      {flash && (
        <div className={`st-flash${flash.err ? " err" : ""}`} role="status">
          {flash.err ? <IconX size={14} /> : <IconCheck size={14} />}
          <span>{flash.t}</span>
          <button type="button" className="st-flash-x" aria-label="Dismiss" onClick={() => setFlash(null)}>
            <IconX size={14} />
          </button>
        </div>
      )}
      {sec === "profile" && <ProfileSec draft={drafts.profile} setDraft={(d) => setDrafts((x) => ({ ...x, profile: d }))} say={say} onPrivacy={() => go("priv")} />}
      {sec === "ideal" && <IdealSec draft={drafts.ideal} setDraft={(d) => setDrafts((x) => ({ ...x, ideal: d }))} say={say} />}
      {sec === "voice" && <VoiceSec draft={drafts.voice} setDraft={(d) => setDrafts((x) => ({ ...x, voice: d }))} say={say} />}
      {sec === "conn" && (
        <Connections
          rows={rows}
          open={open}
          setOpen={setOpen}
          data={{ net: { view: net.view, off: net.off }, paths, lix: lixView?.info ?? null, integ, setInteg, granola: gr.status, apps, reloadApps: loadApps }}
          onNotif={() => go("notif")}
          flash={say}
        />
      )}
      {sec === "notif" && <NotifSec integ={integ} setInteg={setInteg} say={say} onSlack={() => go("conn", "slack")} />}
      {sec === "sig" && <SigSec canClose={canClose} st={sigSt} setSig={setSig} />}
      {sec === "priv" && <PrivSec say={say} />}
      {sec === "agents" && <AgentsSec apps={apps} />}
      {sec === "plan" && <PlanSec />}
      {sec === "data" && <DataSec onConn={() => go("conn")} />}
    </section>
  ) : null;

  return (
    <div className="st-wrap">
      {header}
      {strip}
      <div className={`st-page${c.phone ? (sec ? " st-phone-sec" : " st-phone-list") : ""}`}>
        {(!c.phone || !sec) && nav}
        {body}
      </div>
      <footer className="st-foot">
        <span>Notifications and Privacy save at once. Sections with a Save button wait for it.</span>
        <span>Signed in as {me.email}</span>
      </footer>
    </div>
  );
}

/* ---------- small parts ---------- */

/** A row of chips with one answer (radio) or several. */
function Chips<T extends string | boolean>({ label, hint, options, on, pick, multi = false, wide = false }: { label: string; hint?: string; options: readonly (readonly [T, string])[]; on: (v: T) => boolean; pick: (v: T) => void; multi?: boolean; wide?: boolean }) {
  return (
    <div className={`st-group${wide ? " wide" : ""}`} role={multi ? "group" : "radiogroup"} aria-label={label}>
      <span className="st-group-l">
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </span>
      <span className="st-chips">
        {options.map(([v, words]) => (
          <button
            key={String(v)}
            type="button"
            {...(multi ? { "aria-pressed": on(v) } : { role: "radio", "aria-checked": on(v) })}
            className={`st-chip${on(v) ? " on" : ""}`}
            onClick={() => pick(v)}
          >
            {on(v) && <IconCheck size={12} />}
            {words}
          </button>
        ))}
      </span>
    </div>
  );
}

function SwitchRow({ t, d, note, on, busy, onFlip, id }: { t: string; d: string; note?: string; on: boolean; busy?: boolean; onFlip: () => void; id?: string }) {
  return (
    <div className="st-switch">
      <span className="st-two">
        <strong>{t}</strong>
        <span>{d}</span>
        {note && <span className="st-switch-note">{note}</span>}
      </span>
      <button id={id} type="button" role="switch" aria-checked={on} aria-label={t} className={`st-sw${on ? " on" : ""}`} disabled={busy} aria-busy={busy} onClick={onFlip}>
        <span className="st-sw-track" aria-hidden>
          <span />
        </span>
        <span className="st-sw-w">{on ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

function Side({ kicker, label, children, foot }: { kicker: string; label: string; children: ReactNode; foot?: string }) {
  return (
    <aside className="st-side" aria-label={label}>
      <span className="st-kicker">{kicker}</span>
      {children}
      {foot && <span className="st-side-foot">{foot}</span>}
    </aside>
  );
}

function SideLines({ lines }: { lines: { k: string; v: string; go?: () => void }[] }) {
  return (
    <div className="st-lines">
      {lines.map((l) =>
        l.go ? (
          <button key={l.k} type="button" className="st-line link" onClick={l.go}>
            <strong>{l.k}</strong>
            <span>{l.v}</span>
          </button>
        ) : (
          <div key={l.k} className="st-line">
            <span>{l.k}</span>
            <strong>{l.v}</strong>
          </div>
        ),
      )}
    </div>
  );
}

function SaveBar({ text, note, dirty, busy, onSave, alt }: { text: string; note: string; dirty: boolean; busy: boolean; onSave: () => void; alt?: { text: string; go: () => void } }) {
  return (
    <div className="st-save">
      <button type="button" className={`btn${dirty ? " btn-pine" : ""} st-save-b`} disabled={busy} aria-busy={busy} onClick={onSave}>
        {busy ? "Saving" : text}
      </button>
      {alt && (
        <button type="button" className="btn btn-ghost" onClick={alt.go}>
          {alt.text}
        </button>
      )}
      <span className="st-save-n" role="status">
        {note}
      </span>
    </div>
  );
}

/** The card other members see in Fractionals, as it reads now. */
function CardPreview({ draft }: { draft?: ProfileDraft }) {
  const c = useApp();
  const me = c.me;
  const out = me.nameHidden || me.fractionals === false;
  const parts = me.name.trim().split(/\s+/);
  const name = me.fractionals === true ? me.name : `${parts[0] ?? ""}${parts.length > 1 ? ` ${parts[parts.length - 1].charAt(0)}.` : ""}`;
  const head = (draft?.headline ?? me.headline ?? "").trim();
  const title = (draft?.title ?? me.title ?? "").trim();
  const seats = c.shell.seats.slice(0, 2).map((s) => [shown(s.e.cells.function) ?? "Seat", s.i.c.hidden ? "a company" : s.i.c.name, shown(s.e.cells.start)?.slice(0, 4) ?? ""].filter(Boolean).join(" · "));
  if (out)
    return (
      <div className="st-card out">
        <span>
          {me.nameHidden
            ? `No card. Your seats read "${NAME_HIDDEN}" to everyone else. Members you already talk to can still write to you.`
            : "No card. You are out of the directory, and your name still shows on your seats. Members you already talk to can still write to you."}
        </span>
      </div>
    );
  return (
    <div className="st-card">
      <span className="st-card-top">
        <span className="st-av" aria-hidden>
          {initials(me.name)}
        </span>
        <span className="st-two">
          <strong>{name}</strong>
          <span>{title && title !== "Member" ? title : me.function ?? ""}</span>
        </span>
      </span>
      <span className="st-card-head">{head || "Your one line shows here."}</span>
      <span className="st-card-seats">{seats.length ? seats.map((s) => <span key={s}>{s}</span>) : <span>The seats you add show here</span>}</span>
      <span className="st-card-msg" aria-hidden>
        Message
      </span>
    </div>
  );
}

/* ---------- Profile and card ---------- */

const profileOf = (me: { title: string; headline?: string; city?: string }): ProfileDraft => ({ title: me.title && me.title !== "Member" ? me.title : "", headline: me.headline ?? "", city: me.city ?? "" });

function ProfileSec({ draft, setDraft, say, onPrivacy }: { draft?: ProfileDraft; setDraft: (d: ProfileDraft | undefined) => void; say: (t: string, err?: boolean) => void; onPrivacy: () => void }) {
  const c = useApp();
  const me = c.me;
  const base = profileOf(me);
  const d = draft ?? base;
  const dirty = !same(d, base);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ProfileDraft, v: string) => setDraft({ ...d, [k]: v });
  const save = async () => {
    if (!dirty) return say("Nothing to save.");
    setBusy(true);
    let ok = true;
    if (d.title.trim() !== base.title) ok = (await c.act({ type: "profile", title: d.title.trim() }, { quiet: true, silentError: true })).ok && ok;
    let msg = "";
    if (ok && (d.headline !== base.headline || d.city !== base.city)) {
      const r = await c.act({ type: "settings", headline: d.headline, city: d.city }, { quiet: true, silentError: true });
      ok = r.ok;
      msg = r.message;
    }
    setBusy(false);
    if (!ok) return say(msg || "That didn't go through. Leave out emails, links and phone numbers, then try again.", true);
    setDraft(undefined);
    say("Profile saved. Your card is up to date.");
  };
  const field = (k: keyof ProfileDraft, label: string, ph: string, hint: string, max: number) => (
    <label className="st-field">
      <span className="st-field-l">{label}</span>
      <input className="input" value={d[k]} maxLength={max} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
      <span className="st-field-h">{hint}</span>
    </label>
  );
  return (
    <div className="st-body">
      <div className="st-col">
        <div className="st-fields">
          <div className="st-field">
            <span className="st-field-l">Your name</span>
            <span className="st-fixed">{me.name}</span>
            <span className="st-field-h">Shown on your card and under your signature. Write to us to change it.</span>
          </div>
          {field("title", "Your title", "Fractional VP Sales", "Shown on your card and under your signature", 80)}
          {field("headline", "One line about you", "What you do, and for whom", `Shown on your card. Keep it under ${CARD_LINE_MAX} characters, with no email, link or phone`, CARD_LINE_MAX)}
          {field("city", "Based in", "City and state", "Shown on your card", CARD_CITY_MAX)}
          <div className="st-field">
            <span className="st-field-l">Sign-in email</span>
            <span className="st-fixed">{me.email}</span>
            <span className="st-field-h">Never shown to another member</span>
          </div>
        </div>
        <SaveBar text="Save profile" dirty={dirty} busy={busy} onSave={() => void save()} note={dirty ? "You have changes that are not saved yet." : me.headline ? "Nothing to save." : "Add one line about you, then save."} />
      </div>
      <Side kicker="YOUR CARD IN FRACTIONALS" label="Your card" foot="Other members see this card. Clients never do. Choose who sees it in Privacy.">
        <CardPreview draft={d} />
        <SideLines
          lines={[
            { k: "Fractionals", v: "See your card in the directory", go: () => c.openPage("fractionals") },
            { k: "Privacy", v: "Who sees you, and your name on your seats", go: onPrivacy },
          ]}
        />
      </Side>
    </div>
  );
}

/* ---------- Ideal client ---------- */

const idealOf = (me: { function: string | null; icp?: Icp | null; before?: string[]; looking?: boolean | null }): IdealDraft => ({
  fn: me.function && FUNCTIONS.includes(me.function) ? me.function : null,
  icp: me.icp ?? EMPTY_ICP,
  before: Array.isArray(me.before) ? me.before : null,
  looking: me.looking ?? null,
});

function IdealSec({ draft, setDraft, say }: { draft?: IdealDraft; setDraft: (d: IdealDraft | undefined) => void; say: (t: string, err?: boolean) => void }) {
  const c = useApp();
  const me = c.me;
  const base = idealOf(me);
  const d = draft ?? base;
  const dirty = !same(d, base);
  const [busy, setBusy] = useState(false);
  const companies = c.view.companies;
  const industries = useMemo(() => industriesByCount(companies), [companies]);
  const countries = useMemo(() => countriesByCount(companies), [companies]);
  const count = useMemo(() => {
    const list = c.infos.filter((i) => !isFirm(i.c));
    if (icpEmpty(d.icp)) return { match: list.length, hiring: list.filter((i) => i.engs.some(isOpenRole)).length, all: list.length };
    const m = list.filter((i) => icpMatch(d.icp, i.c) === "match");
    return { match: m.length, hiring: m.filter((i) => i.engs.some(isOpenRole)).length, all: list.length };
  }, [c.infos, d.icp]);
  // Their own function can't come before them; taking off the only pick leaves it unanswered.
  const rest = d.before === null ? null : d.before.filter((x) => x !== d.fn);
  const nb = d.before !== null && d.before.length > 0 && rest !== null && rest.length === 0 ? null : rest;
  const save = async () => {
    if (!dirty) return say("Nothing to save. Changing this never spends a credit.");
    setBusy(true);
    const changedBefore = nb !== null && !same(nb, me.before ?? null);
    const r = await c.act({ type: "profile", icp: d.icp, function: d.fn ?? "", ...(changedBefore ? { before: nb! } : {}), ...(d.looking !== base.looking && d.looking !== null ? { looking: d.looking } : {}) }, { quiet: true, silentError: true });
    setBusy(false);
    if (!r.ok) return say(r.message, true);
    // The table follows the ideal client, as Your profile's sheet did.
    c.table.setFilters({ ...c.table.filters, icp: !icpEmpty(d.icp) });
    setDraft(undefined);
    say(`Saved. Find, Crystal Ball and your lists now lead with these ${count.match.toLocaleString("en-US")} companies.`);
  };
  const n = (x: number) => (c.waiting ? "…" : x.toLocaleString("en-US"));
  return (
    <div className="st-body">
      <div className="st-col">
        <Chips label="Your function" hint="Merlin points out open roles in it" options={FUNCTIONS.map((f) => [f, f] as const)} on={(v) => d.fn === v} pick={(v) => setDraft({ ...d, fn: d.fn === v ? null : v })} wide />
        <div className="st-hunt">
          <BeforeFields fn={d.fn} companies={companies} value={nb} onChange={(b) => setDraft({ ...d, before: b })} />
          <IcpFields value={d.icp} onChange={(icp) => setDraft({ ...d, icp })} industries={industries} countries={countries} />
        </div>
        <Chips
          label="Looking for a new client"
          hint="Not now softens the nudges"
          options={[
            [true, "Yes"],
            [false, "Not now"],
          ]}
          on={(v) => d.looking === v}
          pick={(v) => setDraft({ ...d, looking: v })}
        />
        <SaveBar
          text="Save ideal client"
          dirty={dirty}
          busy={busy}
          onSave={() => void save()}
          note={dirty ? `You have changes that are not saved yet. ${n(count.match)} companies match.` : "Nothing to save. Changing this never spends a credit."}
          alt={!icpEmpty(d.icp) ? { text: "Clear all", go: () => setDraft({ ...d, icp: EMPTY_ICP }) } : undefined}
        />
      </div>
      <Side kicker="WHAT THIS CHANGES" label="What this changes" foot="Lists you already saved keep their own filters.">
        <span className="st-big">
          <strong className="num">{n(count.match)}</strong>
          <span>companies on Merlin {icpEmpty(d.icp) ? "in all, with no ideal client set" : `match, of ${n(count.all)}`}</span>
        </span>
        <SideLines
          lines={[
            { k: "Find", v: "Starts filtered to these", go: () => c.openPage("find") },
            { k: "Companies", v: `Your ideal client view · ${n(count.match)} rows`, go: () => (c.table.setRecordType("companies"), c.openPage("table")) },
            { k: "Crystal Ball", v: "Ranks these by fit and by who you know", go: () => c.openPage("radar") },
            { k: "Hiring now", v: `${n(count.hiring)} of them have an open role`, go: () => (c.table.setRecordType("engagements"), c.table.setTab("hiring"), c.openPage("table")) },
            { k: "Alerts and workflows", v: "New matches reach you by email", go: () => c.openPage("alerts") },
          ]}
        />
      </Side>
    </div>
  );
}

/* ---------- Voice ---------- */

const voiceOf = (me: { voice?: { phrases: string[] } & VoiceStyle }): VoiceDraft => ({ v: styleOf(me.voice ?? { ...NEUTRAL_VOICE, signoff: "Best," }), phrases: [...(me.voice?.phrases ?? [])] });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function VoiceSec({ draft, setDraft, say }: { draft?: VoiceDraft; setDraft: (d: VoiceDraft | undefined) => void; say: (t: string, err?: boolean) => void }) {
  const c = useApp();
  const me = c.me;
  const base = voiceOf(me);
  const d = draft ?? base;
  const dirty = !same(d, base);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof VoiceStyle>(k: K, val: VoiceStyle[K]) => setDraft({ ...d, v: { ...d.v, [k]: val } });
  const clean = d.phrases.map((p) => p.trim()).filter(Boolean);
  const bad = clean.map((p) => phraseProblem(p)).find(Boolean) ?? null;
  const save = async () => {
    if (bad) return say(`A phrase ${bad}. Keep each one short and your own: no names, addresses, links or numbers.`, true);
    setBusy(true);
    const r = await c.act({ type: "voice", voice: { ...d.v, phrases: clean } }, { quiet: true, silentError: true });
    setBusy(false);
    if (!r.ok) return say(r.message, true);
    setDraft(undefined);
    say("Voice saved. Merlin drafts your notes this way from now on.");
  };
  const remove = async () => {
    setBusy(true);
    const r = await c.act({ type: "voice", remove: true }, { quiet: true, silentError: true });
    setBusy(false);
    if (!r.ok) return say(r.message, true);
    setDraft(undefined);
    say("Voice removed. Merlin writes plain and neutral until you set one.");
  };
  const first = me.name.trim().split(/\s+/)[0] || "First name";
  const rows = Math.min(VOICE_PHRASES_MAX, Math.max(1, d.phrases.length + (d.phrases.every((p) => p.trim()) ? 1 : 0)));
  const note = sampleNote({ ...d.v, phrases: clean }, { name: me.name, fn: me.function });
  return (
    <div className="st-body">
      <div className="st-col">
        <Chips label="Greeting" hint="Dana stands in for their first name" options={VOICE_GREETINGS.map((g) => [g, g === "none" ? "None" : greetingWords(g)] as const)} on={(x) => d.v.greeting === x} pick={(x) => set("greeting", x)} />
        <Chips label="Sign-off" options={VOICE_SIGNOFFS.map((s) => [s, s === "none" ? "None" : s] as const)} on={(x) => d.v.signoff === x} pick={(x) => set("signoff", x)} />
        <Chips label="Signed with" options={VOICE_NAMES.map((x) => [x, x === "first" ? first : x === "full" ? me.name : "No name"] as const)} on={(x) => d.v.name === x} pick={(x) => set("name", x)} />
        <Chips label="Length" options={VOICE_LENGTHS.map((l) => [l, l === "short" ? "Short · 3 sentences" : "Medium · 5 sentences"] as const)} on={(x) => d.v.length === x} pick={(x) => set("length", x)} />
        <Chips label="Tone" options={VOICE_FORMALITY.map((f) => [f, cap(f)] as const)} on={(x) => d.v.formality === x} pick={(x) => set("formality", x)} />
        <Chips
          label="Contractions"
          options={[
            [true, "I'd, it's"],
            [false, "I would, it is"],
          ]}
          on={(x) => d.v.contractions === x}
          pick={(x) => set("contractions", x)}
        />
        <Chips label="Exclamation marks" options={VOICE_EXCLAMATIONS.map((e) => [e, cap(e)] as const)} on={(x) => d.v.exclamations === x} pick={(x) => set("exclamations", x)} />
        <Chips
          label="Emoji"
          options={[
            [false, "No"],
            [true, "Yes"],
          ]}
          on={(x) => d.v.emoji === x}
          pick={(x) => set("emoji", x)}
        />
        <Chips label="Opens with" options={VOICE_OPENERS.map((o) => [o, o === "direct" ? "Straight to the point" : "A line of small talk"] as const)} on={(x) => d.v.opener === x} pick={(x) => set("opener", x)} />
        <div className="st-fields">
          {Array.from({ length: rows }, (_, k) => (
            <label key={k} className="st-field">
              <span className="st-field-l">{k === 0 ? "A phrase you use" : "Another phrase"}</span>
              <input
                className="input"
                value={d.phrases[k] ?? ""}
                maxLength={VOICE_PHRASE_CHARS}
                placeholder={k === 0 ? "Hope you're well" : "Another phrase"}
                onChange={(e) => {
                  const list = [...d.phrases];
                  while (list.length <= k) list.push("");
                  list[k] = e.target.value;
                  setDraft({ ...d, phrases: list });
                }}
              />
              <span className="st-field-h">{k === 0 ? `Up to ${VOICE_PHRASES_MAX} short ones of your own` : "At most one goes into a note. No names, links or numbers"}</span>
            </label>
          ))}
        </div>
        <SaveBar text="Save voice" dirty={dirty} busy={busy} onSave={() => void save()} note={dirty ? "You have changes that are not saved yet. The sample already shows them." : me.voice ? "Nothing to save." : "Pick what fits, watch the sample change, then save."} />
        <span className="st-kicker">OTHER WAYS</span>
        <div className="st-acts-list">
          <div className="st-act">
            <span className="st-two">
              <strong>Let your own agent learn it</strong>
              <span>Your agent reads about 40 emails you sent, on its side, and saves only its conclusions here: greeting, sign-off, length, tone and a few phrases. Merlin never reads your email.</span>
            </span>
            <button type="button" className="btn btn-sm" onClick={() => void copyText(VOICE_PROMPT).then((ok) => say(ok ? "Prompt copied. Paste it into your agent, with Merlin and your mail both connected there." : "That didn't copy. Find the prompt in Your agents.", !ok))}>
              Copy the prompt
            </button>
          </div>
          {me.voice && (
            <div className="st-act">
              <span className="st-two">
                <strong>Remove your voice</strong>
                <span>Merlin goes back to a plain, neutral voice.</span>
              </span>
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void remove()}>
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
      <Side kicker="SAMPLE NOTE IN YOUR VOICE" label="Sample note" foot={`${d.v.emoji ? "Emoji on: Merlin may add one where it fits. " : ""}An example only, to a made-up company. You still edit and send every note yourself.`}>
        <div className="st-note-card">
          <span className="st-faint">Example · To Dana, CEO at Cedar and Pine</span>
          <span className="st-note-text">{note}</span>
        </div>
        <SideLines
          lines={[
            { k: "Outreach notes", v: "On a deal in your pipeline", go: () => c.openPage("pipeline") },
            { k: "Replies to members", v: "In Messages", go: () => c.openPage("messages") },
            { k: "Proposal cover notes", v: "In Proposals", go: () => c.openPage("proposals") },
          ]}
        />
      </Side>
    </div>
  );
}

/* ---------- Notifications ---------- */

function NotifSec({ integ, setInteg, say, onSlack }: { integ: IntegrationsView | null; setInteg: (v: IntegrationsView) => void; say: (t: string, err?: boolean) => void; onSlack: () => void }) {
  const c = useApp();
  const me = c.me;
  const [close, setClose] = useState<CloseInboxView | null>(null);
  const [av, setAv] = useState<AlertsView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const since = c.table.since;
  const loadAv = () => void send<AlertsView>(`/api/table?alerts=1${since ? `&since=${encodeURIComponent(since)}` : ""}`).then((r) => r.ok && r.data && setAv(r.data));
  useEffect(() => {
    void send<CloseInboxView>("/api/activity").then((r) => r.ok && r.data && setClose(r.data));
    loadAv();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const groups = alertGroups({ me, email: !!c.view.email, digest: !!c.view.scan?.digest, integ, close, alerts: av, starters: [], nowMs: Date.now() });
  const rows = notifRows(groups);
  const slackOn = !!(integ?.slack || integ?.webhook);
  const run = async (key: string, call: NotifCall) => {
    setBusy(key);
    try {
      if (call.via === "act" || call.via === "act-fixed") {
        const r = await c.act(call.action, { quiet: true });
        if (call.via === "act-fixed") loadAv();
        if (!r.ok) return;
      } else if (call.via === "integrations") {
        const r = await send<{ view: IntegrationsView }>("/api/integrations", call.body);
        if (!r.ok) return say(r.error, true);
        if (r.data?.view) setInteg(r.data.view);
      } else {
        const r = await closePref(call.kind, call.channel, call.on);
        if (!r.ok) return say(r.error, true);
        setClose((x) => (x && r.data ? { ...x, prefs: r.data } : x));
      }
      say("Saved.");
    } finally {
      setBusy(null);
    }
  };
  const flip = (r: Row, k: ChanKey, on: boolean) => {
    const call = chipCall(r, k, on);
    if (call) void run(`${r.id}:${k}`, call);
  };
  const radarEmail = me.radarEmail ?? "daily";
  const counts = (["email", "slack", "bell"] as ChanKey[]).map((k) => rows.filter((r) => r.chips.some((x) => x.key === k && x.on)).length);
  return (
    <div className="st-body">
      <div className="st-col">
        <Chips
          label="Crystal Ball email"
          hint="Never on a day with nothing new"
          options={RADAR_FREQ.map((f) => [f.key, f.label] as const)}
          on={(v) => radarEmail === v}
          pick={(v) => void run("freq", { via: "act", action: { type: "settings", radarEmail: v } })}
        />
        <div className="st-grid-wrap">
          <div className="st-grid" role="table" aria-label="What Merlin sends you">
            <div className="st-grid-row st-grid-head" role="row">
              <span role="columnheader">Event</span>
              {(["Email", "Slack", "Bell"] as const).map((name, j) => (
                <span key={name} role="columnheader" className="st-grid-c">
                  <span>{name}</span>
                  <span className="st-faint">{j === 1 && !slackOn ? "Off" : `${counts[j]} of ${rows.length}`}</span>
                </span>
              ))}
              <span role="columnheader" className="st-grid-often">
                How often
              </span>
            </div>
            {rows.map((r) => (
              <div key={r.id} className="st-grid-row" role="row">
                <span role="cell" className="st-two">
                  <span>
                    <strong>{r.name}</strong>
                    {r.tag && r.tag !== "New" && <span className="st-tag">{r.tag}</span>}
                  </span>
                  <span>{r.trig === r.name ? r.det : `${r.trig}, ${r.det}`}</span>
                  <span className="st-grid-often-sm">{r.every.label}</span>
                </span>
                {r.chips.map((ch) => (
                  <span key={ch.key} role="cell" className="st-grid-c">
                    {ch.state === "ok" && r.canSwitch ? (
                      <button type="button" role="checkbox" aria-checked={ch.on} aria-label={`${r.name}, ${ch.label}`} className={`st-box${ch.on ? " on" : ""}`} disabled={busy === `${r.id}:${ch.key}`} onClick={() => flip(r, ch.key, !ch.on)}>
                        {ch.on && <IconCheck size={13} />}
                      </button>
                    ) : ch.state === "fixed" && ch.on ? (
                      <span className="st-fixed-c" title={ch.note}>
                        Always
                      </span>
                    ) : ch.state === "pro" ? (
                      <button type="button" className="st-cant link" title={ch.note} onClick={() => openPlans("slack")}>
                        Pro
                      </button>
                    ) : ch.state === "connect" ? (
                      <button type="button" className="st-cant link" title={ch.note} onClick={onSlack}>
                        Connect
                      </button>
                    ) : (
                      <span className="st-cant" title={ch.note}>
                        Off
                      </span>
                    )}
                  </span>
                ))}
                <span role="cell" className="st-grid-often">
                  {r.every.label}
                </span>
              </div>
            ))}
          </div>
        </div>
        {!slackOn && (
          <div className="st-callout">
            <span>
              <strong>The Slack column is off because Slack is not connected.</strong> Merlin can only post to one channel you pick. It reads nothing.
            </span>
            <button type="button" className="btn btn-sm" onClick={onSlack}>
              Connect Slack
            </button>
          </div>
        )}
        <div className="st-act">
          <span className="st-two">
            <strong>Your lists</strong>
            <span>{listsLine(groups)} Each list&apos;s alert, what sets it off and how often, is on Alerts and workflows.</span>
          </span>
          <button type="button" className="btn btn-sm" onClick={() => c.openPage("alerts")}>
            Open Alerts and workflows
          </button>
        </div>
      </div>
      <Side kicker="WHERE IT GOES" label="Where it goes" foot="Pro and Close alerts are yours on the trial. On Free, Slack gets the weekly post of new roles only.">
        <SideLines
          lines={[
            { k: "Email", v: c.view.email ? me.email : "Merlin doesn't send email yet" },
            { k: "Slack", v: integ?.slack ? integ.slack.channel ?? "Connected" : "Not connected" },
            { k: "The bell", v: "Top right, in the app" },
            { k: "Slack pace", v: "1 post per kind, per 15 minutes" },
            { k: "No double sends", v: "What went to Slack is not emailed again" },
          ]}
        />
      </Side>
    </div>
  );
}

/* ---------- Signature ---------- */

function SigSec({ canClose, st, setSig }: { canClose: boolean; st: ReturnType<typeof useMySignature>[0]; setSig: ReturnType<typeof useMySignature>[1] }) {
  const c = useApp();
  if (!canClose)
    return (
      <div className="st-body">
        <div className="st-col">
          <div className="st-callout">
            <span>
              <strong>Your signature is part of Close.</strong> With Close you sign a proposal as it goes out, or countersign in one tap after your client signs.
            </span>
            <button type="button" className="btn btn-sm btn-pine" onClick={() => openPlans("proposals")}>
              See the Close plan
            </button>
          </div>
        </div>
      </div>
    );
  return (
    <div className="st-body">
      <div className="st-col st-sig">{st.loaded ? <MySignature value={st.sig} name={st.name} title={st.title} onChange={setSig} /> : <div className="st-wait" aria-busy="true" />}</div>
      <Side kicker="HOW IT IS USED" label="How it is used" foot="Your name and title come from Profile and card.">
        <SideLines
          lines={[
            { k: "Sign it now", v: "Applied when you send" },
            { k: "Countersign", v: "Applied after your client signs" },
            { k: "Audit trail", v: "Every use is recorded" },
            { k: "Contracts", v: "Your signed proposals and contracts", go: () => c.openPage("contracts") },
          ]}
        />
      </Side>
    </div>
  );
}

/* ---------- Privacy ---------- */

function PrivSec({ say }: { say: (t: string, err?: boolean) => void }) {
  const c = useApp();
  const me = c.me;
  const [busy, setBusy] = useState<string | null>(null);
  const flip = async (k: string, a: Parameters<typeof c.act>[0]) => {
    setBusy(k);
    const r = await c.act(a, { quiet: true, silentError: true });
    setBusy(null);
    say(r.message || (r.ok ? "Saved." : "That didn't go through. Try again."), !r.ok);
  };
  const dir = me.fractionals === true && !me.nameHidden;
  const closeOn = me.plan?.canClose ?? true;
  return (
    <div className="st-body">
      <div className="st-col">
        <SwitchRow
          t="Show me in the Fractionals directory"
          d="Members see your full name, title, seats and the clients you serve, free. Never your email."
          note={me.nameHidden ? "Off while your name is hidden on your seats." : me.fractionals == null ? "Not chosen yet. Until you choose, members see your first name and last initial." : undefined}
          on={dir}
          busy={busy === "dir"}
          onFlip={() => void flip("dir", { type: "settings", fractionals: !dir })}
        />
        <SwitchRow
          t="Hide my name on my seats"
          d={`Your seats read "${NAME_HIDDEN}" to everyone else, your agent included. The seats and roles still count.`}
          note={me.nameHidden ? "You are out of the directory while this is on." : undefined}
          on={!!me.nameHidden}
          busy={busy === "hide"}
          onFlip={() => void flip("hide", { type: "settings", nameHidden: !me.nameHidden })}
        />
        <SwitchRow
          t="Open to leads"
          d="A fellow fractional can refer you a company. It opens free for you."
          on={me.leads !== false}
          busy={busy === "leads"}
          onFlip={() => void flip("leads", { type: "settings", leads: me.leads === false })}
        />
        <div className="st-act">
          <span className="st-two">
            <strong>Evidence on your card</strong>
            <span>{closeOn ? "You choose case by case in Evidence Bank. Client names stay hidden until you name them, case by case." : "Evidence Bank is part of Close. Cases show on your card only when you choose."}</span>
          </span>
          <button type="button" className="btn btn-sm" onClick={() => c.openPage("evidence")}>
            Open Evidence Bank
          </button>
        </div>
      </div>
      <Side kicker="WHAT OTHER MEMBERS SEE" label="What other members see" foot="Clients never see your card. They see only the proposal you send them.">
        <CardPreview />
        <SideLines
          lines={[
            { k: "Your email", v: "Never shown" },
            { k: "Contacts and calendar", v: "Only you" },
            { k: "Pipeline and proposals", v: "You, and the client you send to" },
            { k: "Your voice", v: "Only you" },
          ]}
        />
      </Side>
    </div>
  );
}

/* ---------- Your agents (Stage 7a's card, kept) ---------- */

function AgentsSec({ apps }: { apps: ConnData["apps"] }) {
  const c = useApp();
  return (
    <div className="st-body">
      <div className="st-col st-agents">
        <div className="st-act">
          <span className="st-two">
            <strong>Agent access</strong>
            <span>Connect Claude, ChatGPT, Claude Code or Cursor, switch their tools on or off, set a daily spend limit and see what they did.{apps?.length ? ` Connected now: ${[...new Set(apps.map((a) => a.name))].join(", ")}.` : ""}</span>
          </span>
          <button type="button" className="btn btn-sm btn-pine" onClick={() => c.openPage("agent")}>
            Open Agent access
          </button>
        </div>
        <ClaudeNetworkPrompt />
        <VoicePrompt />
      </div>
    </div>
  );
}

/* ---------- Plan ---------- */

function PlanSec() {
  const c = useApp();
  const me = c.me;
  const p = me.plan;
  if (!p)
    return (
      <div className="st-body">
        <div className="st-col">
          <div className="st-act">
            <span className="st-two">
              <strong>No plan to choose</strong>
              <span>Every part of Merlin is open to you now. Your credits, what you earned and what you spent are in Credits and usage.</span>
            </span>
            <button type="button" className="btn btn-sm" onClick={() => c.openPage("credits")}>
              Open Credits and usage
            </button>
          </div>
        </div>
      </div>
    );
  const cur = p.name === "trial" ? "close" : p.tier;
  const plans: { k: "free" | "pro" | "close"; n: string; price: string; lines: string[] }[] = [
    { k: "free", n: "Free", price: "$0", lines: ["Spend and earn credits", "A company costs 2 credits to open", "1 Crystal Ball company a day, in full", "Slack: a weekly post of new roles"] },
    { k: "pro", n: "Pro", price: `$${p.prices.month}`, lines: ["Any company opens free, up to 15 a day", "Crystal Ball companies always open free", "Every alert in Slack, as it happens", "Your agent: no daily cap"] },
    { k: "close", n: "Close", price: `$${p.prices.closeMonth}`, lines: ["Everything in Pro", "Proposals from a call or a template", "Contracts and signing, with your signature", "Alerts when a client opens or signs"] },
  ];
  return (
    <div className="st-body">
      <div className="st-col">
        <div className="st-plans">
          {plans.map((x) => (
            <div key={x.k} className={`st-plan${cur === x.k ? " on" : ""}`}>
              <span className="st-plan-h">
                <strong>{x.n}</strong>
                {cur === x.k && <span className="st-tag">{p.name === "trial" ? `Your trial${p.trialDaysLeft ? ` · ${p.trialDaysLeft} days left` : ""}` : "Your plan"}</span>}
              </span>
              <span>
                <strong className="num st-plan-p">{x.price}</strong> {x.k === "free" ? "" : "a month"}
              </span>
              {x.lines.map((l) => (
                <span key={l} className="st-plan-l">
                  <IconCheck size={12} /> {l}
                </span>
              ))}
            </div>
          ))}
        </div>
        <span className="st-acts">
          <button type="button" className="btn btn-pine" onClick={() => openPlans(p.name === "trial" ? "trial" : "billing")}>
            Compare plans
          </button>
          <button type="button" className="btn" onClick={() => c.openPage("credits")}>
            Credits and usage
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => c.openPage("billing")}>
            Billing and receipts
          </button>
        </span>
        <span className="st-note">
          {p.name === "trial"
            ? `You are on the ${planName(p)}. When it ends you move to Free unless you choose a plan. Nothing is deleted.`
            : `You are on ${planName(p)}. Billing and receipts are in Credits and usage.`}
        </span>
      </div>
      <Side kicker="TODAY" label="Today" foot="A company costs 2 credits to open once you are past the free opens of the day, or on Free.">
        <span className="st-big">
          <strong className="num">{me.credits.toLocaleString("en-US")}</strong>
          <span>credits to spend</span>
        </span>
        <SideLines
          lines={[
            ...(me.proOpens ? [{ k: "Free opens today", v: `${me.proOpens.of - me.proOpens.left} of ${me.proOpens.of} used` }] : []),
            { k: "Crystal Ball opens", v: me.crystal === "all" ? "Always free" : me.crystal === "one" ? "1 free today" : me.crystal === "used" ? "Today's is used" : "As any company" },
            { k: "Earn by adding facts", v: `Up to ${me.earnCap} a day` },
            { k: "Credits and usage", v: "Every credit in and out", go: () => c.openPage("credits") },
          ]}
        />
      </Side>
    </div>
  );
}

/* ---------- Your account ---------- */

function DataSec({ onConn }: { onConn: () => void }) {
  const c = useApp();
  const me = c.me;
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/?k=${me.token}`;
  return (
    <div className="st-body">
      <div className="st-col">
        <span className="st-kicker">SIGNING IN</span>
        <div className="st-act">
          <span className="st-two">
            <strong>Your sign-in link</strong>
            <span>Open it on another device to sign in there. Anyone who has it can sign in as you, so keep it to yourself.</span>
          </span>
          <span className="st-acts">
            <button type="button" className="btn btn-sm" onClick={() => void copyText(link).then((ok) => setCopied(ok))}>
              {copied ? "Copied" : "Copy my sign-in link"}
            </button>
            <SignInActions emailOn={c.view.email} refresh={c.refresh} />
          </span>
        </div>
        <span className="st-kicker">YOUR DATA</span>
        <div className="st-act">
          <span className="st-two">
            <strong>Where your data goes</strong>
            <span>What leaves Merlin, who receives it and why, and how to switch each part off.</span>
          </span>
          <a className="btn btn-sm" href="/data">
            Read it
          </a>
        </div>
        <div className="st-act">
          <span className="st-two">
            <strong>Delete what a connection gave Merlin</strong>
            <span>Google, your LinkedIn connections file, a contacts file and Granola each delete on their own, at once.</span>
          </span>
          <button type="button" className="btn btn-sm" onClick={onConn}>
            Open Connections
          </button>
        </div>
        <span className="st-kicker">YOUR ACCOUNT</span>
        <div className="st-close">
          <CloseAccount />
        </div>
      </div>
      <Side kicker="WHAT MERLIN HOLDS ABOUT YOU" label="What Merlin holds about you" foot="If you close your account, facts you added to companies stay, with your name taken off.">
        <SideLines
          lines={[
            { k: "Seats you held", v: `${c.shell.seats.length} ${c.shell.seats.length === 1 ? "seat" : "seats"}`, go: () => c.openSeats() },
            { k: "Facts you added", v: `${me.added.toLocaleString("en-US")} ${me.added === 1 ? "fact" : "facts"}`, go: () => c.openPage("credits") },
            { k: "Saved lists", v: `${(me.savedViews ?? []).length}`, go: () => c.openPage("alerts") },
            { k: "Voice", v: me.voice ? "Saved" : "Not set" },
          ]}
        />
      </Side>
    </div>
  );
}
