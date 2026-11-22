"use client";

/**
 * After a proposal or document goes out (lib/close), for the member who sent it:
 *
 *   ActivityPanel     on the proposal's page and the document's page, once sent: when to follow up
 *                     (rules, with a one-line why and a draft to open in Gmail or copy), the counts,
 *                     where they spent their time and which options they looked at, the timeline, the
 *                     reminders with their switches, and on a signed proposal its renewal. Desktop as
 *                     Insights.dc.html, phone as InsightsPhone.dc.html (one column, three counts).
 *   ProposalAlerts    the Notifications grid: each proposal alert in Slack, by email and in Merlin.
 *   CloseOnHome       Home: renewals due (Start the renewal) and the latest proposal notifications.
 *   ProposalBell      the top bar's bell: the same notifications, with the unread count, in a panel.
 *
 * Close only (canClose; the trial counts): off it, the panel is the upgrade prompt and Home shows nothing.
 * Everything comes from GET/POST /api/activity.
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ActivityView, CloseInboxView, ReminderRow } from "@/lib/close/types";
import { ALERT_ROWS, CHANNELS, NO_END_WORDS, type Channel } from "@/lib/close/types";
import type { ProposalRec } from "@/lib/proposals/types";
import { minShort, minWords } from "@/lib/close/activity";
import { errorText, useToast } from "../ui/shared";
import { openPlans } from "./Billing";
import { UiCtx, useUi } from "./ui";
import "./activity.css";

const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";
const START = typeof window !== "undefined" ? window.location.search : "";

async function api<T>(body?: Record<string, unknown>, id?: string): Promise<T | { error: string; upgrade?: string }> {
  try {
    const r = await fetch(body ? "/api/activity" : `/api/activity${id ? `?id=${encodeURIComponent(id)}` : ""}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return r.ok ? (j as T) : { error: errorText(r.status, j.error, "That didn't go through. Try again."), upgrade: j.upgrade };
  } catch {
    return { error: NETWORK };
  }
}

/* ---------- opening a proposal or document from elsewhere (Home, an alert's link) ---------- */

let want: { pr?: string; dc?: string } | null = null;
let startUsed = false;
const OPEN_EVENT = "rn-open-item";
/** Open Proposals on this proposal or document (Proposals already open hears it through useOpenItem). */
export function openItem(ui: { openPage: (p: "proposals") => void } | null, x: { pr?: string; dc?: string }) {
  if (!ui) return window.location.assign(`/?p=proposals&${x.pr ? `pr=${encodeURIComponent(x.pr)}` : `dc=${encodeURIComponent(x.dc ?? "")}`}`);
  want = x;
  ui.openPage("proposals");
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}
/** Proposals, already open: switch to what openItem asked for. */
export function useOpenItem(open: (x: { pr?: string; dc?: string }) => void) {
  useEffect(() => {
    const on = () => {
      const x = want;
      want = null;
      if (x) open(x);
    };
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, [open]);
}
/** The proposal (pr) or document (dc) to open, once: one picked in the app, else the address's (?p=proposals&dc=ID). */
export function takeItem(k: "pr" | "dc"): string | null {
  if (want?.[k]) {
    const v = want[k]!;
    want = null;
    return v;
  }
  if (k === "dc" && !startUsed) {
    startUsed = true;
    const q = new URLSearchParams(START);
    return q.get("p") === "proposals" ? q.get("dc") : null;
  }
  return null;
}
/** The address asked for the follow-up drafted (&draft=1) or the renewal (&renew=1). */
const startFlag = (k: "draft" | "renew") => new URLSearchParams(START).get(k) === "1";

/* ---------- words ---------- */

const when = (iso: string) => {
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / 86_400_000;
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return days < 6 && days > -1 ? `${d.toLocaleDateString("en-US", { weekday: "short" })} ${t}` : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const longDay = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
const STATE: Record<ReminderRow["state"], string> = { sent: "Sent", planned: "", skipped: "Not needed", off: "Off", stopped: "Stopped" };

/* ================= the activity panel ================= */

export function ActivityPanel({ kind, id, version, onOpen, quiet }: { kind: "proposal" | "document"; id: string; version?: number | string; onOpen?: (p: ProposalRec) => void; quiet?: boolean }) {
  const toast = useToast();
  const [v, setV] = useState<ActivityView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [end, setEnd] = useState("");
  const follow = useRef<HTMLElement>(null);
  const load = useCallback(async () => {
    const r = await api<ActivityView>(undefined, id);
    if ("error" in r) setErr(r.error);
    else setV(r), setErr(null);
  }, [id]);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => document.visibilityState === "visible" && void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load, version]);
  useEffect(() => {
    if (v && (startFlag("draft") || startFlag("renew"))) follow.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [v]);

  if (err && !v) return <p className="pp-err">{err}</p>;
  if (!v) return <div className="ac-skel" aria-busy="true" />;
  if (!v.open)
    return (
      <section className="pp-card ac-gate" data-plan="free" aria-label="Activity">
        <span className="bl-tag bl-tag-lock">Close</span>
        <p>Knowing when they open it, what they read and when to follow up is on Close, with reminders until they sign.</p>
        <button type="button" className="btn btn-sm" onClick={() => openPlans("proposals")}>
          See the Close plan
        </button>
      </section>
    );

  const post = async (what: string, body: Record<string, unknown>) => {
    setBusy(what);
    const r = await api<ActivityView>(body);
    setBusy(null);
    if ("error" in r) return toast(r.error, true), null;
    setV(r);
    return r;
  };
  const s = v.suggestion;
  const max = Math.max(1, ...v.sections.map((x) => x.ms));
  const first = (v.signer?.name ?? "").split(" ")[0];
  const done = v.status === "signed" || v.status === "client_signed" || v.status === "declined" || v.status === "void" || v.status === "expired";

  return (
    <div className="ac" aria-label="Activity">
      <p className="ac-line">
        <span className="ac-badge">{v.statusWords}</span>
        {v.sentAt && v.signer && (
          <span>
            Sent {day(v.sentAt)} to {v.signer.name}
            {v.signer.title ? `, ${v.signer.title}` : ""}
            {!done ? (v.expiresAt ? ` · link open until ${day(v.expiresAt)}` : ` · ${NO_END_WORDS}`) : ""}
          </span>
        )}
      </p>

      {s && (
        <section ref={follow} className="ac-follow" aria-labelledby={`ac-f-${id}`}>
          <div className="ac-follow-main">
            <span className="ac-badge">{s.when}</span>
            <h2 className="ac-h" id={`ac-f-${id}`}>
              {s.headline}
            </h2>
            {s.points.length > 0 && (
              <ul className="ac-points">
                {s.points.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            <p className="ac-why">{s.why}</p>
          </div>
          {s.draft && (
            <div className="ac-follow-draft">
              <div className="ac-draft">
                <span className="ac-small">Drafted for you</span>
                <span>{s.draft}</span>
              </div>
              <div className="ac-row">
                {v.gmail && (
                  <a className={`btn btn-lg ${quiet ? "" : "btn-pine"}`} href={v.gmail} target="_blank" rel="noreferrer">
                    Open in Gmail
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-lg"
                  onClick={() =>
                    void navigator.clipboard?.writeText(s.draft!).then(
                      () => toast("Copied."),
                      () => toast("Copy didn't work here. Select the text instead.", true),
                    )
                  }
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="ac-stats">
        <div className="ac-stat">
          <b>{v.stats.opens}</b>
          <span>{first ? `opens by ${first}` : "opens"}</span>
        </div>
        <div className="ac-stat">
          <b>{v.stats.readers}</b>
          <span>{v.stats.readers === 1 ? "person reading" : "people reading"}</span>
        </div>
        <div className="ac-stat">
          <b>
            <span className="ac-long">{minWords(v.stats.ms)}</span>
            <span className="ac-short">{minShort(v.stats.ms)}</span>
          </b>
          <span>reading in total</span>
        </div>
        {v.stats.option && (
          <div className="ac-stat ac-stat-opt">
            <b>{v.stats.option}</b>
            <span>option they&apos;re on now</span>
          </div>
        )}
      </div>

      <div className="ac-cols">
        <section className="pp-card ac-time" aria-labelledby={`ac-t-${id}`}>
          <h2 className="ac-h3" id={`ac-t-${id}`}>
            Where they spent their time
          </h2>
          {v.sections.length === 0 || v.stats.ms === 0 ? (
            <p className="pp-muted">
              {v.stats.readers ? "No reading time on file." : `Nothing read yet. Merlin shows each ${v.kind === "document" ? "page" : "section"} here once they open it.`}
            </p>
          ) : (
            <div className="ac-bars">
              {v.sections.map((x) => {
                const share = x.ms / max;
                return (
                  <div key={x.id} className="ac-bar-row" data-top={x.top}>
                    <span className="ac-bar-l">{x.top ? <strong>{x.label}</strong> : x.label}</span>
                    <span className="ac-bar" aria-hidden>
                      <span style={{ width: `${Math.max(x.ms ? 3 : 0, Math.round(share * 100))}%`, opacity: x.top ? 1 : 0.3 + 0.35 * share }} />
                    </span>
                    <span className="ac-bar-v">
                      <span className="ac-long">{x.ms ? minWords(x.ms) : "not read"}</span>
                      <span className="ac-short">{x.ms ? minShort(x.ms) : "0"}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {(v.options.length > 0 || v.addons.some((a) => a.on)) && (
            <div className="ac-opts">
              <span className="ac-small">Options they looked at</span>
              <div className="ac-chips">
                {[...v.options]
                  .sort((a, b) => b.picks - a.picks || b.ms - a.ms)
                  .map((o, i) => (
                    <span key={o.id} className="ac-chip" data-on={i === 0 && o.picks > 0 ? "lead" : o.picks > 0 ? "picked" : undefined}>
                      {o.label} · {o.words}
                    </span>
                  ))}
                {v.addons
                  .filter((a) => a.on)
                  .map((a) => (
                    <span key={a.label} className="ac-chip">
                      + {a.label}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </section>

        <aside className="ac-side">
          <section className="pp-card" aria-labelledby={`ac-a-${id}`}>
            <h2 className="ac-h3" id={`ac-a-${id}`}>
              Activity
            </h2>
            <ol className="ac-tl">
              {v.timeline.map((x, i) => (
                <li key={`${x.at}${i}`}>
                  <span className="ac-tl-at">{when(x.at)}</span>
                  <span>
                    {x.strong && <strong>{x.strong}</strong>}
                    {x.text}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {v.reminders.length > 0 && (
            <section className="pp-card ac-rem" aria-labelledby={`ac-r-${id}`}>
              <h2 className="ac-h3" id={`ac-r-${id}`}>
                Reminders
              </h2>
              <p className="ac-p">Merlin nudges {first || "them"} only while it&apos;s unsigned, and stops the moment they sign or decline.</p>
              <ul className="ac-rem-list">
                {v.reminders.map((r) => (
                  <li key={`${r.to}${r.key}`}>
                    {editing && r.state !== "sent" && r.state !== "stopped" ? (
                      <label className="ac-check tap44">
                        <input type="checkbox" checked={r.on} disabled={!!busy} onChange={(e) => void post(r.key, { op: "reminders", id, [r.key]: e.target.checked })} />
                        <span>{r.label}</span>
                      </label>
                    ) : (
                      <span>{r.label}</span>
                    )}
                    <span className="ac-rem-st" data-state={r.state}>
                      {r.state === "planned" ? day(r.at) : STATE[r.state]}
                    </span>
                  </li>
                ))}
              </ul>
              {!done && (
                <button type="button" className="tp-flink" onClick={() => setEditing((x) => !x)}>
                  {editing ? "Done" : "Change or turn off"}
                </button>
              )}
            </section>
          )}

          {v.renewal && (
            <section className="pp-card ac-renew" data-due={v.renewal.due} aria-labelledby={`ac-n-${id}`}>
              <h2 className="ac-h3" id={`ac-n-${id}`}>
                Renewal
              </h2>
              {v.renewal.ask ? (
                <form
                  className="ac-ask"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (end) await post("end", { op: "renewal", id, end });
                  }}
                >
                  <label className="ac-p" htmlFor={`ac-end-${id}`}>
                    When does this engagement end? Merlin reminds you 30 days before, with the renewal ready to draft.
                  </label>
                  <input id={`ac-end-${id}`} className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
                  <div className="ac-row">
                    <button type="submit" className="btn" disabled={!end || !!busy}>
                      Save
                    </button>
                    <button type="button" className="tp-flink" disabled={!!busy} onClick={() => void post("skip", { op: "renewal", id, skip: true })}>
                      Not sure
                    </button>
                  </div>
                </form>
              ) : v.renewal.startedId ? (
                <p className="ac-p">The renewal draft is in your proposals.</p>
              ) : v.renewal.ending ? (
                <p className="ac-p">
                  Marked as ending. Mark the seat ended on Your seats, which earns a credit.{" "}
                  <button type="button" className="tp-flink" onClick={() => void post("unend", { op: "renewal", id, ending: false })}>
                    Undo
                  </button>
                </p>
              ) : v.renewal.end ? (
                <>
                  <p className="ac-p">
                    {v.renewal.due ? `It ends ${longDay(v.renewal.end)}. A good moment to propose the next term.` : `It ends ${longDay(v.renewal.end)}. Merlin reminds you 30 days before.`}
                  </p>
                  <div className="ac-row">
                    <button
                      type="button"
                      className={`btn ${v.renewal.due && !quiet ? "btn-pine" : ""}`}
                      aria-busy={busy === "renew"}
                      disabled={!!busy}
                      onClick={async () => {
                        setBusy("renew");
                        const r = await api<ProposalRec>({ op: "renew", id });
                        setBusy(null);
                        if ("error" in r) return r.upgrade ? openPlans("proposals") : toast(r.error, true);
                        toast("A renewal draft, with the dates moved on.");
                        onOpen?.(r);
                      }}
                    >
                      Start the renewal
                    </button>
                    <button type="button" className="btn" disabled={!!busy} onClick={() => void post("ending", { op: "renewal", id, ending: true })}>
                      It&apos;s ending
                    </button>
                  </div>
                </>
              ) : (
                <p className="ac-p">No end date on file, so no renewal reminder.</p>
              )}
            </section>
          )}
        </aside>
      </div>
      <p className="ac-note">{v.kind === "document" ? "Signers are told on the signing page" : "Clients are told on the proposal"} that the sender sees when it&apos;s opened and which parts were read.</p>
    </div>
  );
}

/* ================= Notifications: the proposal alerts grid ================= */

const CH_SAY: Record<Channel, string> = { slack: "Slack", email: "Email", app: "Merlin" };

export function ProposalAlerts() {
  const toast = useToast();
  const [v, setV] = useState<CloseInboxView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void api<CloseInboxView>().then((r) => ("error" in r ? setErr(r.error) : setV(r)));
  }, []);
  if (err) return <p className="in-problem">{err}</p>;
  if (!v) return <p className="cr-note">Loading your proposal alerts…</p>;
  if (!v.open)
    return (
      <section className="tp-card nt-card ac-gate" data-plan="free">
        <span className="bl-tag bl-tag-lock">Close</span>
        <p>Proposal alerts (opened, a new reader, time to follow up, signed, renewal) are on Close.</p>
        <button type="button" className="btn btn-sm" onClick={() => openPlans("proposals")}>
          See the Close plan
        </button>
      </section>
    );
  const set = async (kind: string, channel: Channel, on: boolean) => {
    setV({ ...v, prefs: { ...v.prefs, [kind]: { ...v.prefs[kind as keyof typeof v.prefs], [channel]: on } } });
    const r = await api<CloseInboxView["prefs"]>({ op: "pref", kind, channel, on });
    if ("error" in r) return toast(r.error, true);
    setV((x) => (x ? { ...x, prefs: r } : x));
  };
  return (
    <section className="tp-card nt-card ac-grid-card" aria-labelledby="ac-alerts-h">
      <h3 className="ac-h3" id="ac-alerts-h">
        Proposal alerts
      </h3>
      <div className="ac-grid" role="table" aria-label="Proposal alerts by channel">
        <span role="columnheader" />
        {CHANNELS.map((c) => (
          <span key={c} role="columnheader" className="ac-grid-h">
            {CH_SAY[c]}
          </span>
        ))}
        {ALERT_ROWS.map((row) => (
          <div key={row.kind} role="row" className="ac-grid-row">
            <span role="rowheader" className="ac-grid-l">
              <span>{row.label}</span>
              <span className="ac-grid-d">{row.line}</span>
            </span>
            {CHANNELS.map((c) => {
              const fixed = c === "email" && row.kind === "signed";
              const noSlack = c === "slack" && !v.slack;
              const noEmail = c === "email" && !v.email;
              return (
                <span key={c} role="cell" className="ac-grid-c tap44">
                  <input
                    type="checkbox"
                    aria-label={`${row.label} ${c === "app" ? "in Merlin" : c === "email" ? "by email" : "in Slack"}`}
                    checked={fixed ? true : v.prefs[row.kind][c] && !noSlack}
                    disabled={fixed || noSlack || noEmail}
                    title={fixed ? "The signed copy and a decline always come by email." : noSlack ? "Connect Slack in Integrations first." : undefined}
                    onChange={(e) => void set(row.kind, c, e.target.checked)}
                  />
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {!v.slack && <p className="cr-note">Slack alerts go out once Slack is connected in Integrations.</p>}
    </section>
  );
}

/* ================= Home: renewals due and the latest notifications ================= */

export function CloseOnHome() {
  const ui = useUi();
  const toast = useToast();
  const [v, setV] = useState<CloseInboxView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // A countersignature Home already asks for (MySignature.tsx CountersignDue) shows once: there, not here too.
  const [due, setDue] = useState<Set<string>>(new Set());
  useEffect(() => {
    void api<CloseInboxView>().then((r) => !("error" in r) && setV(r));
    void fetch("/api/proposals?countersign=due", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { due: [] }))
      .then((j: { due?: { id: string }[] }) => setDue(new Set((j.due ?? []).map((d) => d.id))))
      .catch(() => {});
  }, []);
  const shown = v ? v.items.filter((x) => !(x.kind === "countersign" && due.has(x.item))) : [];
  if (!v?.open || (!v.renewals.length && !shown.length)) return null;
  const items = shown.slice(0, 5);
  const read = () => {
    if (!v.unread) return;
    setV({ ...v, unread: 0, items: v.items.map((x) => ({ ...x, read: true })) });
    void api({ op: "read" });
  };
  return (
    <div className="ac-home">
      {v.renewals.map((r, i) => (
        <article key={r.id} className="ac-renewcard" aria-labelledby={`ac-rn-${r.id}`}>
          <span className="ac-renewcard-top">
            <span className="ac-badge">Renewal</span>
            <span className="ac-small">
              {r.company} · {r.line}
            </span>
          </span>
          <h2 className="ac-h" id={`ac-rn-${r.id}`}>
            {r.days > 0 ? `Your ${r.company.split(" ")[0]} engagement ends in ${r.days} ${r.days === 1 ? "day" : "days"}` : `Your ${r.company.split(" ")[0]} engagement has ended`}
          </h2>
          <p className="ac-p">
            {r.terms ? `${r.terms} ` : ""}A good moment to propose the next term.
          </p>
          <div className="ac-draft">
            <span className="ac-small">Drafted from your signed terms</span>
            <span>Same scope, the dates moved on by one term. You change what you want before it goes.</span>
          </div>
          <div className="ac-row">
            <button
              type="button"
              className={`btn btn-lg ${i === 0 ? "btn-pine" : ""}`}
              aria-busy={busy === r.id}
              disabled={!!busy}
              onClick={async () => {
                setBusy(r.id);
                const x = await api<ProposalRec>({ op: "renew", id: r.id });
                setBusy(null);
                if ("error" in x) return x.upgrade ? openPlans("proposals") : toast(x.error, true);
                openItem(ui, { pr: x.id });
              }}
            >
              Start the renewal
            </button>
            <button
              type="button"
              className="btn btn-lg"
              disabled={!!busy}
              onClick={async () => {
                const x = await api<ActivityView>({ op: "renewal", id: r.id, ending: true });
                if ("error" in x) return toast(x.error, true);
                setV({ ...v, renewals: v.renewals.filter((y) => y.id !== r.id) });
                toast("Noted. Mark the seat ended on Your seats, which earns a credit.");
              }}
            >
              It&apos;s ending
            </button>
          </div>
        </article>
      ))}
      {items.length > 0 && (
        <section className="tp-card ac-inbox" aria-labelledby="ac-inbox-h">
          <h2 className="ac-h3" id="ac-inbox-h">
            Proposal activity{v.unread ? <span className="ac-unread">{v.unread} new</span> : null}
          </h2>
          <ul>
            {items.map((x) => (
              <li key={x.id}>
                <button type="button" className="ac-inbox-row" onClick={() => (read(), openItem(ui, x.item.startsWith("dc_") ? { dc: x.item } : { pr: x.item }))}>
                  <span className="ac-dot" data-new={!x.read} aria-hidden />
                  <span className="ac-inbox-t">
                    <span>
                      <strong>{x.head}</strong> {x.text}
                    </span>
                    <span className="ac-small">
                      {when(x.at)}
                      {x.sub ? ` · ${x.sub}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {v.unread > 0 && (
            <button type="button" className="tp-flink" onClick={read}>
              Mark all read
            </button>
          )}
        </section>
      )}
    </div>
  );
}

/* ================= the top bar's bell ================= */

const IconBell = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </svg>
);

/**
 * The bell in the top bar (desktop and phone): the proposal notifications (opened, a new reader,
 * follow up, a question, passed on, signed or declined, countersign, renewal, reminders sent),
 * newest first, with the unread count. Merlin has no other in-app notification store, so these are
 * the proposal ones. Each opens what it's about and is marked read; Mark all read; read state is
 * kept per member on the server. A real button with the count in its label; the panel is a dialog
 * that Escape or a click outside closes, focus back on the bell. Nothing on Free or Pro.
 */
export function ProposalBell({ phone }: { phone?: boolean }) {
  const ui = useContext(UiCtx);
  const [v, setV] = useState<CloseInboxView | null>(null);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const load = useCallback(() => {
    void api<CloseInboxView>().then((r) => !("error" in r) && setV(r));
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(() => document.visibilityState === "visible" && load(), 120_000);
    window.addEventListener("focus", load);
    return () => (window.clearInterval(t), window.removeEventListener("focus", load));
  }, [load]);
  const close = useCallback((back = true) => {
    setOpen(false);
    if (back) btn.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && (e.preventDefault(), close());
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", down);
    return () => (document.removeEventListener("keydown", key), document.removeEventListener("mousedown", down));
  }, [open, close]);
  if (!v?.open) return null;
  const unread = v.unread;
  const read = (ids?: string[]) => {
    setV({ ...v, unread: ids ? v.items.filter((x) => !x.read && !ids.includes(x.id)).length : 0, items: v.items.map((x) => (!ids || ids.includes(x.id) ? { ...x, read: true } : x)) });
    void api({ op: "read", ...(ids ? { ids } : {}) });
  };
  return (
    <div className={`ac-bell${phone ? " ac-bell-phone" : ""}`}>
      <button
        ref={btn}
        type="button"
        className={`tp-iconbtn tp-has-badge${unread ? " on" : ""}`}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="ac-bell-panel"
        title={unread ? `${unread} unread` : "Notifications"}
        onClick={() => (open ? close() : (setOpen(true), load()))}
      >
        <IconBell />
        {unread > 0 && (
          <span className="tp-badge tp-badge-dot num" aria-hidden>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div ref={panel} id="ac-bell-panel" className="ac-bell-panel" role="dialog" aria-modal="false" aria-labelledby="ac-bell-h" tabIndex={-1}>
          <div className="ac-bell-head">
            <h2 className="ac-h3" id="ac-bell-h">
              Notifications{unread ? <span className="ac-unread">{unread} new</span> : null}
            </h2>
            {unread > 0 && (
              <button type="button" className="tp-flink" onClick={() => read()}>
                Mark all read
              </button>
            )}
          </div>
          {v.items.length === 0 ? (
            <p className="ac-p ac-bell-empty">Nothing yet. When a client opens, reads, asks or signs a proposal, it shows here.</p>
          ) : (
            <ul className="ac-bell-list">
              {v.items.map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    className="ac-inbox-row"
                    onClick={() => {
                      if (!x.read) read([x.id]);
                      close(false);
                      openItem(ui, x.item.startsWith("dc_") ? { dc: x.item } : { pr: x.item });
                    }}
                  >
                    <span className="ac-dot" data-new={!x.read} aria-hidden />
                    <span className="ac-inbox-t">
                      <span>
                        {!x.read && <span className="sr-only">New: </span>}
                        <strong>{x.head}</strong> {x.text}
                      </span>
                      <span className="ac-small">
                        {when(x.at)}
                        {x.sub ? ` · ${x.sub}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
