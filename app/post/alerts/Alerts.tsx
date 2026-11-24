"use client";

/**
 * Alerts and workflows (page "alerts"; ?p=alerts and the old ?p=notifications land here in the new
 * look), from Alerts.dc.html. The Alerts tab is one table of every alert the member has (alerts/model.ts):
 * what it watches, its trigger, where it goes (email, Slack, the bell), how often, when it last fired,
 * and its switch, with a bulk bar for the ones picked. Above it: "Since Thursday · N alerts sent",
 * where alerts go (email, Slack, a webhook, the bell; the 15-minute batch), and on a first visit a
 * gallery of starter alerts with the Slack step inline. "New alert" opens a short builder: a list,
 * what sets it off, how often and where. The Workflows tab is Stage 7b's (Beta, RN_WORKFLOWS,
 * alerts/Workflows.tsx): its table, recipes, runs and builder; off, it says Coming soon.
 *
 * Every switch members had on Notifications and Integrations is a chip or a switch here; each change
 * goes to the alert's own home (the list's alert, Me's settings, /api/integrations, Close's /api/activity,
 * lib/inbox.ts alerts.fixed) and saves at once. Every email links back here and turns its alert off in one click.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApp, stripGone } from "../shell/pages";
import { useToast, errorText, IconX } from "../../ui/shared";
import { openPlans } from "../Billing";
import { listAct, starterLists } from "../find/lists";
import { alertOn } from "../getStarted";
import type { Action } from "@/lib/tableTypes";
import type { IntegrationsView } from "@/lib/notify/types";
import type { CloseInboxView } from "@/lib/close/types";
import type { AlertsView } from "@/lib/inbox";
import { EVERY_WORDS, TRIGGER_DETAIL, TRIGGER_WORDS, type AlertEvery, type AlertTrigger, type ListAlert } from "@/lib/mcp/alerts";
import { ServiceIcon, type Service } from "../../ui/ServiceIcon";
import type { RadarEmail } from "@/lib/radar/types";
import { alertGroups, countingWords, headLines, onFree, recipes, sinceWords, statusLine, type Chip, type Group, type Row, type StarterRef } from "./model";
import { WorkflowBuilder, WorkflowPills, WorkflowsTab, blankBuild, useWorkflows, type WfBuild } from "./Workflows";
import { SortHeader, sorterOf, useSortState, type SortCol, type Sorter } from "../../ui/sortable";
import "./alerts.css";

/* ---------- the server ---------- */

async function getJson<T>(url: string, body?: unknown): Promise<T | { error: string }> {
  try {
    const r = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return r.ok ? (j as T) : { error: errorText(r.status, (j as { error?: string }).error, "That didn't go through. Try again.") };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}
const isErr = (x: unknown): x is { error: string } => !!x && typeof x === "object" && "error" in x;

const ChevDown = ({ open }: { open: boolean }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={open ? "M6 9l6 6 6-6" : "M9 6l6 6-6 6"} />
  </svg>
);
const Tick = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m5 12 5 5L20 7" />
  </svg>
);

function Switch({ on, label, onFlip, disabled }: { on: boolean; label: string; onFlip: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`al-switch${on ? " on" : ""}`} disabled={disabled} onClick={onFlip}>
      <span className="al-switch-track" aria-hidden>
        <span className="al-switch-knob" />
      </span>
      <span className="al-switch-l">{on ? "On" : "Off"}</span>
    </button>
  );
}

/* ---------- the page ---------- */

export function AlertsPage() {
  const c = useApp();
  const toast = useToast();
  const me = c.me;
  const free = onFree(me);
  const [integ, setInteg] = useState<IntegrationsView | null>(null);
  const [close, setClose] = useState<CloseInboxView | null>(null);
  const [av, setAv] = useState<AlertsView | null>(null);
  // Click a header to sort the alerts by it inside each group, both ways.
  const alSort = useSortState("alerts");
  const [tab, setTab] = useState<"alerts" | "flows">("alerts");
  const [dest, setDest] = useState<boolean | null>(null);
  const [only, setOnly] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [shut, setShut] = useState<Record<string, boolean> | null>(null);
  const [builder, setBuilder] = useState<null | { list: string; triggers: AlertTrigger[]; every: AlertEvery; email: boolean; slack: boolean; bell: boolean }>(null);
  const [busy, setBusy] = useState(false);
  // Read once when the page opens: what the member turns on here doesn't swap the page under them.
  const [first] = useState(() => !(me.savedViews ?? []).some(alertOn));
  const since = c.table.since;
  // Workflows (Beta): the tab, its builder, and the runs open on one workflow.
  const wf = useWorkflows();
  const [wb, setWb] = useState<WfBuild | null>(null);
  const [wfOpen, setWfOpen] = useState<string | null>(null);
  const [wfBusy, setWfBusy] = useState(false);
  const openWb = (b: WfBuild) => {
    setBuilder(null);
    setWb(b);
    window.setTimeout(() => document.getElementById("wf-builder")?.scrollIntoView({ block: "start", behavior: "smooth" }), 30);
  };
  const wfAct = async (a: Record<string, unknown>) => {
    setWfBusy(true);
    try {
      const ok = await wf.act(a);
      if (ok && a.type === "workflow.approve") void c.refresh();
      return ok;
    } finally {
      setWfBusy(false);
    }
  };
  const saveWb = async () => {
    if (!wb) return;
    const { id, ...rest } = wb;
    if (await wfAct({ type: "workflow.save", ...rest, ...(id ? { id } : {}), on: true })) setWb(null);
  };

  const loadInteg = useCallback(() => void getJson<{ view: IntegrationsView }>("/api/integrations").then((r) => !isErr(r) && setInteg(r.view)), []);
  const loadClose = useCallback(() => void getJson<CloseInboxView>("/api/activity").then((r) => !isErr(r) && setClose(r)), []);
  const loadAv = useCallback(() => void getJson<AlertsView>(`/api/table?alerts=1${since ? `&since=${encodeURIComponent(since)}` : ""}`).then((r) => !isErr(r) && setAv(r)), [since]);
  useEffect(() => {
    loadInteg();
    loadClose();
    loadAv();
  }, [loadInteg, loadClose, loadAv]);

  const starters: StarterRef[] = useMemo(() => (c.waiting ? [] : starterLists(me, c.infos).map((s) => ({ key: s.key, name: s.name, kind: s.kind, place: s.place, criteria: s.criteria }))), [me, c.infos, c.waiting]);
  const nowMs = Date.now();
  const groups0 = alertGroups({ me, email: !!c.view.email, digest: !!c.view.scan?.digest, integ, close, alerts: av, starters, nowMs });
  const alCols = alertSortCols(av);
  const alS = sorterOf(groups0.flatMap((g) => g.rows), alCols, alSort);
  const groups = alS.key ? groups0.map((g) => ({ ...g, rows: sorterOf(g.rows, alCols, alSort).rows })) : groups0;
  const heads = headLines(groups, av, nowMs);
  const rows = groups.flatMap((g) => g.rows);
  const slackOn = !!(integ?.slack || integ?.webhook);
  const destOpen = dest ?? first;
  const shutNow = shut ?? (first ? { proposals: true } : {});

  /* ---- changes, each to the alert's own home ---- */
  const act = async (a: Action) => {
    setBusy(true);
    try {
      return await c.act(a);
    } finally {
      setBusy(false);
    }
  };
  const integOp = async (body: Record<string, unknown>) => {
    const r = await getJson<{ view: IntegrationsView; message?: string }>("/api/integrations", body);
    if (isErr(r)) return toast(r.error, true), false;
    setInteg(r.view);
    if (r.message && body.op !== "alerts") toast(r.message);
    return true;
  };
  const closePref = async (kind: string, channel: "email" | "slack" | "app", on: boolean) => {
    const r = await getJson<CloseInboxView["prefs"]>("/api/activity", { op: "pref", kind, channel, on });
    if (isErr(r)) return toast(r.error, true);
    setClose((x) => (x ? { ...x, prefs: r } : x));
  };
  const listAlert = (id: string, alert: Partial<ListAlert>) => act(listAct({ op: "alert", id, list: { alert } }));
  const fixed = async (key: "follows" | "known", patch: Record<string, boolean>) => {
    await act({ type: "alerts.fixed", key, ...patch });
    loadAv();
  };
  const saveStarter = (s: StarterRef, triggers: AlertTrigger[]) =>
    act(
      listAct({
        op: "save",
        name: s.name,
        place: s.place,
        criteria: s.criteria as never,
        email: true,
        list: { kind: s.kind as never, starter: true, alert: { on: true, triggers, every: free ? "daily" : "instant", email: true, slack: false, bell: true } },
      }),
    );

  const setOn = async (r: Row, on: boolean) => {
    if (!r.canSwitch || r.on === on) return;
    switch (r.kind) {
      case "list":
        return void listAlert(r.list!.id, { on });
      case "starter":
        return void saveStarter(r.starter!, [r.starter!.kind === "seats" ? "seat" : "role"]);
      case "radar":
        if (on) return void act({ type: "settings", radarEmail: "daily" });
        await act({ type: "settings", radarEmail: "off" });
        return void (me.radarSlack !== false && act({ type: "settings", radarSlack: false }));
      case "digest":
        return void act({ type: "settings", digest: on });
      case "follows":
      case "known":
        return void fixed(r.kind, { on });
      case "message":
        return void act({ type: "settings", messageEmail: on });
      case "peer":
        return void act({ type: "settings", peerEmail: on });
      case "seat":
        return void integOp({ op: "alerts", seat: on });
      case "proposal":
        for (const ch of ["app", "email", ...(close?.slack ? ["slack"] : [])] as ("email" | "slack" | "app")[]) if (!(ch === "email" && r.proposal === "signed")) await closePref(r.proposal!, ch, on);
        return;
    }
  };
  const flipChip = async (r: Row, ch: Chip) => {
    if (ch.state === "connect") return setDest(true), document.getElementById("al-dest")?.scrollIntoView({ block: "start", behavior: "smooth" });
    if (ch.state === "pro") return openPlans("slack");
    if (ch.state !== "ok" || !r.canSwitch) return;
    const on = !ch.on;
    switch (r.kind) {
      case "list":
        return void listAlert(r.list!.id, { [ch.key]: on, ...(on ? { on: true } : {}) });
      case "starter":
        return void saveStarter(r.starter!, [r.starter!.kind === "seats" ? "seat" : "role"]);
      case "radar":
        return void (ch.key === "email" ? act({ type: "settings", radarEmail: on ? "daily" : "off" }) : act({ type: "settings", radarSlack: on }));
      case "digest":
        return void (ch.key === "email" ? act({ type: "settings", digest: on }) : integOp({ op: "alerts", roles: on }));
      case "follows":
      case "known":
        return void fixed(r.kind, { [ch.key]: on, ...(on ? { on: true } : {}) });
      case "message":
        return void (ch.key === "email" ? act({ type: "settings", messageEmail: on }) : integOp({ op: "alerts", message: on }));
      case "peer":
        return void act({ type: "settings", peerEmail: on });
      case "seat":
        return void integOp({ op: "alerts", seat: on });
      case "proposal":
        return void closePref(r.proposal!, ch.key === "bell" ? "app" : ch.key, on);
    }
  };
  const setEvery = (r: Row, v: string, pro: boolean) => {
    if (pro) return openPlans("slack");
    if (r.kind === "list") return void listAlert(r.list!.id, { every: v as AlertEvery });
    if (r.kind === "radar") return void act({ type: "settings", radarEmail: v as RadarEmail });
  };
  const setTriggers = (r: Row, t: AlertTrigger, pro: boolean) => {
    if (pro) return openPlans("radar");
    const cur = r.list!.alert.triggers;
    const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
    if (!next.length) return toast("An alert needs one thing to watch for. Pick another first, or turn the alert off.", true);
    void listAlert(r.list!.id, { triggers: next, on: true });
  };

  /* ---- the selection ---- */
  const picked = rows.filter((r) => sel[r.id]);
  const bulk = async (fn: (r: Row) => Promise<unknown> | unknown) => {
    for (const r of picked) await fn(r);
    setSel({});
  };

  /* ---- first visit: the strip and the starter gallery ---- */
  const watched = (me.savedViews ?? []).find(alertOn)?.name ?? null;
  const stripOn = first && !stripGone(c, "alerts");
  const hasSources = !!av?.sources;
  const useRecipe = async (key: string) => {
    const icp = starters.find((s) => s.key === "icp");
    const ended = starters.find((s) => s.key === "ended");
    const savedLike = (kind: string) => (me.savedViews ?? []).find((v) => v.starter && (v.kind ?? "companies") === kind);
    const onList = async (s: StarterRef | undefined, kind: string, t: AlertTrigger) => {
      if (s) return saveStarter(s, [t]);
      const v = savedLike(kind);
      if (v) {
        const cur = v.alert?.triggers ?? ["role"];
        return listAlert(v.id, { on: true, triggers: [...new Set([...cur, t])] });
      }
      setBuilder({ list: "", triggers: [t], every: free ? "daily" : "instant", email: true, slack: false, bell: true });
    };
    if (key === "icp-role") return onList(icp, "companies", "role");
    if (key === "ended-seat") return onList(ended, "seats", "seat");
    if (key === "icp-leader") return free ? openPlans("radar") : onList(icp, "companies", "leader");
    if (key === "icp-funding") return onList(icp, "companies", "funding");
    if (key === "known") return hasSources ? fixed("known", { on: true }) : c.openPage("warm");
    if (key === "radar") return act({ type: "settings", radarEmail: "daily" });
  };

  /* ---- the builder: a list, what sets it off, how often, where ---- */
  const lists = (me.savedViews ?? []).map((v) => ({ id: v.id, name: v.name, starter: false as boolean }));
  const builderLists = [...lists, ...starters.map((s) => ({ id: `starter:${s.key}`, name: s.name, starter: true }))];
  const openBuilder = (t: AlertTrigger = "role") =>
    (setWb(null), setBuilder({ list: builderLists[0]?.id ?? "", triggers: [t], every: free ? "daily" : "instant", email: true, slack: slackOn && !free, bell: true }));
  const turnOnBuilder = async () => {
    if (!builder || !builder.list || !builder.triggers.length) return;
    const alert = { on: true, triggers: builder.triggers, every: builder.every, email: builder.email, slack: builder.slack, bell: builder.bell };
    if (builder.list.startsWith("starter:")) {
      const s = starters.find((x) => `starter:${x.key}` === builder.list);
      if (!s) return;
      const r = await act(listAct({ op: "save", name: s.name, place: s.place, criteria: s.criteria as never, email: builder.email, list: { kind: s.kind as never, starter: true, alert } }));
      if (r.ok) setBuilder(null);
      return;
    }
    const r = await listAlert(builder.list, alert);
    if (r.ok) setBuilder(null);
  };

  const status = statusLine(me, heads.nOn, heads.nAll);
  const sinceLine = av ? `${sinceWords(since, nowMs)} · ${av.sent === 1 ? "1 alert sent" : `${av.sent} alerts sent`}` : null;

  return (
    <div className={`al-page${builder || wb ? " al-with-b" : ""}`}>
      <div className="al-main">
        {stripOn && (
          <section className={`ws-strip al-strip${watched ? " done" : ""}`} aria-label="About this page">
            {watched ? (
              <span className="ws-strip-t">
                <strong>Step 5 done. Merlin is watching {watched}.</strong> You hear by email and in the bell when it changes.
                {me.plan?.canClose ? " Next, write your first case study. It fills the Proof part of every proposal." : ""}
              </span>
            ) : (
              <span className="ws-strip-t">
                <strong>What this page is for.</strong> Merlin watches your lists for you. An alert tells you when something changes at a company on one. Start with one alert. Alerts are free.
              </span>
            )}
            <span className="ws-strip-acts">
              {watched ? (
                me.plan?.canClose ? (
                  <button type="button" className="btn btn-sm btn-pine" onClick={() => c.openPage("evidence")}>
                    Write a case
                  </button>
                ) : null
              ) : starters.some((s) => s.key === "icp") ? (
                <button type="button" className="btn btn-sm btn-pine" disabled={busy} onClick={() => void useRecipe("icp-role")}>
                  Watch your ideal client
                </button>
              ) : (
                <button type="button" className="btn btn-sm btn-pine" onClick={() => openBuilder()}>
                  New alert
                </button>
              )}
            </span>
            <button type="button" className="ws-strip-x" aria-label="Dismiss" onClick={() => c.start.dismissStrip("alerts")}>
              <IconX size={16} />
            </button>
          </section>
        )}

        {((!first && sinceLine) || wf.view) && (
          <nav className="al-since" aria-label="Since your last visit">
            {!first && sinceLine && (
              <>
                <span>
                  <strong>{sinceWords(since, nowMs)}</strong> · {av!.sent === 1 ? "1 alert sent" : `${av!.sent} alerts sent`}
                </span>
                <span className="al-since-sub">{countingWords(av!.countingSince)}</span>
              </>
            )}
            {wf.view && (
              <WorkflowPills
                v={wf.view}
                onWaiting={() => {
                  setTab("flows");
                  setWfOpen(wf.view!.flows.find((f) => f.waiting > 0)?.id ?? null);
                }}
                creditsHref={() => c.openPage(me.plan ? "billing" : "credits")}
              />
            )}
          </nav>
        )}

        {first && tab === "alerts" && (
          <section className="al-gallery" aria-labelledby="al-gal-h">
            <div className="al-gallery-head">
              <h2 id="al-gal-h">Start with an alert</h2>
              <span>Six that fit a new member. Each says what it does. Alerts never spend credits, and nothing is on until you turn it on.</span>
            </div>
            <div className="al-cards">
              {recipes(me, starters, hasSources).map((r) => (
                <div key={r.key} className="al-card">
                  <strong>{r.say}</strong>
                  <span className="al-card-foot">
                    <span className="al-pill">ALERT</span>
                    <span className="al-cost free">{r.cost}</span>
                    {r.plan && <span className="al-gate">{r.plan}</span>}
                    <button type="button" className="btn btn-sm btn-outline al-use" aria-label={`Use this alert: ${r.say}`} disabled={busy} onClick={() => void useRecipe(r.key)}>
                      Use this
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="al-bar">
          <div role="tablist" aria-label="Alerts or workflows" className="al-tabs">
            <button type="button" role="tab" aria-selected={tab === "alerts"} className={`al-tab${tab === "alerts" ? " on" : ""}`} onClick={() => setTab("alerts")}>
              Alerts <span className="al-tab-n num">{rows.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "flows"} className={`al-tab${tab === "flows" ? " on" : ""}`} onClick={() => setTab("flows")}>
              Workflows {wf.view ? <span className="al-tab-n num">{wf.view.flows.length}</span> : null}
              <span className="al-beta">Beta</span>
            </button>
          </div>
          <span className="al-grow" />
          <button type="button" className="al-dest-btn" aria-expanded={destOpen} aria-controls="al-dest" onClick={() => setDest(!destOpen)}>
            {slackOn ? "Goes to email, Slack and the bell" : "Goes to email and the bell. Slack is not connected"}
          </button>
          {tab === "alerts" && (
            <button type="button" className={`btn ${first && !watched ? "btn-outline" : "btn-pine"} al-new`} onClick={() => openBuilder()}>
              New alert
            </button>
          )}
          {tab === "flows" && wf.view && (
            <button type="button" className={`btn ${wf.view.flows.length ? "btn-pine" : "btn-outline"} al-new`} onClick={() => openWb(blankBuild(wf.view))}>
              New workflow
            </button>
          )}
        </div>

        {destOpen && (tab === "alerts" || dest === true) && <Destinations integ={integ} email={c.view.email ? me.email : null} first={first} onOp={integOp} onTest={() => void act({ type: "alerts.test", alert: "bell" })} />}

        {tab === "flows" && wf.view ? (
          <WorkflowsTab v={wf.view} act={wfAct} open={wfOpen} setOpen={setWfOpen} onBuild={openWb} openCompany={(id) => c.openCompany(id)} />
        ) : tab === "flows" ? (
          <section className="al-soon" aria-label="Workflows">
            <h2>Workflows are coming soon</h2>
            <p>A workflow is an alert that also does the next step for you: add the company to your pipeline, find your way in, draft a note in your voice. Each step shows what it costs before you turn it on, and you set a monthly limit. Messages are always drafts: a workflow never sends anything to a client.</p>
            <p className="al-soon-sub">Until then, every alert on the Alerts tab tells you by email, in Slack and in the bell.</p>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setTab("alerts")}>
              Back to your alerts
            </button>
          </section>
        ) : (
          <>
            <div className="al-tools">
              <button type="button" aria-pressed={only} className={`al-only${only ? " on" : ""}`} onClick={() => setOnly(!only)}>
                Show only what is on
              </button>
            </div>

            {picked.length > 0 && (
              <div role="toolbar" aria-label="Actions for selected alerts" className="al-bulk">
                <strong>{picked.length} selected</strong>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => void bulk((r) => setOn(r, true))}>
                  Turn on
                </button>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => void bulk((r) => setOn(r, false))}>
                  Turn off
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() =>
                    !slackOn
                      ? setDest(true)
                      : void bulk((r) => {
                          const ch = r.chips.find((x) => x.key === "slack");
                          return ch && ch.state === "ok" && !ch.on ? flipChip(r, ch) : null;
                        })
                  }
                >
                  Send to Slack too
                </button>
                <span className="al-bulk-note">Alerts Merlin sends everyone turn off here and stay listed.</span>
                <button type="button" className="tp-flink" onClick={() => setSel({})}>
                  Clear
                </button>
              </div>
            )}

            <section aria-label="Alerts" className="al-table-wrap">
              <div role="table" aria-label="Alerts" className="al-table">
                <div role="row" className="al-row al-head">
                  <span role="columnheader" className="al-c-sel" />
                  <Head s={alS} k="name" name="Alert and what it watches" fill={heads.alerts} />
                  <Head s={alS} k="trig" name="Trigger" fill={heads.trigger} />
                  <Head s={alS} k="where" name="Where it goes" fill={heads.where} />
                  <Head s={alS} k="often" name="How often" fill={heads.often} />
                  <Head s={alS} k="last" name="Last fired" fill={heads.last} />
                  <Head s={alS} k="on" name="On" fill={heads.on} />
                </div>
                {groups.map((g) => (
                  <GroupRows
                    key={g.key}
                    g={g}
                    open={!shutNow[g.key]}
                    flip={() => setShut({ ...shutNow, [g.key]: !shutNow[g.key] })}
                    only={only}
                    sel={sel}
                    pick={(id) => setSel((x) => ({ ...x, [id]: !x[id] }))}
                    hero={first && !watched ? "starter:icp" : null}
                    busy={busy}
                    onOn={setOn}
                    onChip={flipChip}
                    onEvery={setEvery}
                    onTrigger={setTriggers}
                    openRow={(r) => (r.list ? c.table.openView(r.list) : r.kind === "radar" ? c.openPage("radar") : r.kind === "proposal" ? c.openPage("proposals") : r.kind === "message" ? c.openPage("messages") : r.kind === "seat" ? c.openPage("seats") : r.kind === "known" ? c.openPage("warm") : null)}
                  />
                ))}
              </div>
            </section>
          </>
        )}

        <div className="al-status">
          <span>
            {tab === "alerts"
              ? status
              : wf.view
                ? `${wf.view.flows.filter((f) => f.on).length} of ${wf.view.flows.length} workflows on. A workflow only spends credits on a step that shows a price, and stops at its monthly limit when you set one. ${wf.view.plan.tier === "free" ? "Free keeps one workflow of free steps; paid steps are part of Pro." : "Merlin's daily limits still apply."}`
                : "Workflows are in Beta and come in a later release."}
          </span>
          <button type="button" className="tp-flink" onClick={() => c.openPage(me.plan ? "billing" : "credits")}>
            What each plan includes
          </button>
        </div>
      </div>

      {wb && wf.view && (
        <WorkflowBuilder
          b={wb}
          set={setWb}
          v={wf.view}
          busy={wfBusy}
          onClose={() => setWb(null)}
          onSave={() => void saveWb()}
          onRemove={() => void wfAct({ type: "workflow.remove", id: wb.id }).then((ok) => ok && setWb(null))}
        />
      )}
      {builder && (
        <Builder
          b={builder}
          set={setBuilder}
          lists={builderLists}
          free={free}
          slackOn={slackOn}
          busy={busy}
          onClose={() => setBuilder(null)}
          onGo={() => void turnOnBuilder()}
          onConnect={() => setDest(true)}
        />
      )}
    </div>
  );
}

function Head({ name, fill, s, k }: { name: string; fill: string; s?: Sorter<Row> | null; k?: string }) {
  return (
    <SortHeader as="span" s={s} k={k ?? name} className="al-h" extra={<span className="al-h-f">{fill}</span>}>
      <span className="al-h-n">{name}</span>
    </SortHeader>
  );
}

/** The alerts' columns as their headers sort them: what each cell shows. */
function alertSortCols(av: AlertsView | null): SortCol<Row>[] {
  return [
    { key: "name", label: "Alert", get: (r) => r.name },
    { key: "trig", label: "Trigger", get: (r) => r.trig },
    { key: "where", label: "Where it goes", kind: "number", get: (r) => r.chips.filter((c) => c.on).length },
    { key: "often", label: "How often", get: (r) => r.every.label },
    { key: "last", label: "Last fired", kind: "date", get: (r) => av?.last[r.logKey]?.at ?? null },
    { key: "on", label: "On", kind: "number", get: (r) => (r.on ? 1 : 0) },
  ];
}

function GroupRows({
  g,
  open,
  flip,
  only,
  sel,
  pick,
  hero,
  busy,
  onOn,
  onChip,
  onEvery,
  onTrigger,
  openRow,
}: {
  g: Group;
  open: boolean;
  flip: () => void;
  only: boolean;
  sel: Record<string, boolean>;
  pick: (id: string) => void;
  hero: string | null;
  busy: boolean;
  onOn: (r: Row, on: boolean) => void;
  onChip: (r: Row, c: Chip) => void;
  onEvery: (r: Row, v: string, pro: boolean) => void;
  onTrigger: (r: Row, t: AlertTrigger, pro: boolean) => void;
  openRow: (r: Row) => void;
}) {
  const shown = open ? g.rows.filter((r) => !only || r.on || r.id === hero) : [];
  return (
    <>
      <div role="row" className="al-group">
        <span role="cell" className="al-group-c">
          <button type="button" aria-expanded={open} className="al-group-b" onClick={flip}>
            <ChevDown open={open} />
            <strong>{g.name}</strong>
            <span className="al-group-n">
              {g.rows.length} alerts · {g.on} on
            </span>
            {g.note && <span className="al-group-note">{g.note}</span>}
          </button>
        </span>
      </div>
      {shown.map((r) => (
        <AlertRow key={r.id} r={r} picked={!!sel[r.id]} pick={() => pick(r.id)} hero={r.id === hero} busy={busy} onOn={onOn} onChip={onChip} onEvery={onEvery} onTrigger={onTrigger} openRow={openRow} />
      ))}
    </>
  );
}

function AlertRow({
  r,
  picked,
  pick,
  hero,
  busy,
  onOn,
  onChip,
  onEvery,
  onTrigger,
  openRow,
}: {
  r: Row;
  picked: boolean;
  pick: () => void;
  hero: boolean;
  busy: boolean;
  onOn: (r: Row, on: boolean) => void;
  onChip: (r: Row, c: Chip) => void;
  onEvery: (r: Row, v: string, pro: boolean) => void;
  onTrigger: (r: Row, t: AlertTrigger, pro: boolean) => void;
  openRow: (r: Row) => void;
}) {
  const [pickT, setPickT] = useState(false);
  const opts = r.every.options;
  const at = opts ? Math.max(0, opts.findIndex((o) => o.key === r.every.value)) : 0;
  const next = opts ? opts[(at + 1) % opts.length] : null;
  return (
    <div role="row" className={`al-row${picked ? " picked" : ""}${hero ? " hero" : ""}${r.held ? " held" : ""}`}>
      <span role="cell" className="al-c-sel">
        <button type="button" role="checkbox" aria-checked={picked} aria-label={`Select the alert ${r.name}`} className={`al-check${picked ? " on" : ""}`} onClick={pick}>
          {picked && <Tick />}
        </button>
      </span>
      <span role="cell" className="al-c-name">
        <span className="al-name-l">
          <button type="button" className="al-name" onClick={() => openRow(r)}>
            {r.name}
          </button>
          {r.tag && <span className={`al-tag${r.tag === "New" ? " new" : r.tag === "Made for you" ? " mint" : ""}`}>{r.tag}</span>}
        </span>
        <span className="al-sub">{r.held ?? r.watch}</span>
      </span>
      <span role="cell" className="al-c-trig">
        {r.triggers ? (
          <span className="al-trig-wrap">
            <button type="button" className="al-trig-b" aria-expanded={pickT} onClick={() => setPickT(!pickT)}>
              {r.trig}
            </button>
            <span className="al-sub">{r.det}</span>
            {pickT && (
              <span className="al-trig-pop" role="group" aria-label={`What sets off ${r.name}`}>
                {r.triggers.map((t) => (
                  <button key={t.key} type="button" role="checkbox" aria-checked={t.on} className={`al-trig-o${t.on ? " on" : ""}`} disabled={busy} onClick={() => onTrigger(r, t.key, t.pro)}>
                    <span className="al-box" aria-hidden>
                      {t.on && <Tick />}
                    </span>
                    <span>
                      <span className="al-trig-t">{TRIGGER_WORDS[t.key]}</span>
                      <span className="al-sub">{TRIGGER_DETAIL[t.key]}</span>
                    </span>
                    {t.pro && <span className="al-gate">Pro</span>}
                  </button>
                ))}
              </span>
            )}
          </span>
        ) : (
          <>
            <span className="al-trig">{r.trig}</span>
            <span className="al-sub">{r.det}</span>
          </>
        )}
      </span>
      <span role="cell" className="al-c-chips">
        {r.chips.map((ch) => (
          <button
            key={ch.key}
            type="button"
            aria-pressed={ch.on}
            aria-label={ch.state === "ok" ? `${ch.label} for ${r.name}` : `${ch.label} for ${r.name}: ${ch.note}`}
            title={ch.note || undefined}
            className={`al-chip${ch.on ? " on" : ""} ${ch.state}`}
            disabled={busy || ch.state === "none" || (ch.state === "fixed" && true) || (ch.state === "ok" && !r.canSwitch)}
            onClick={() => onChip(r, ch)}
          >
            {ch.label}
            {ch.state === "pro" && <span className="al-chip-pro">Pro</span>}
          </button>
        ))}
      </span>
      <span role="cell" className="al-c-often">
        {opts && next && r.canSwitch ? (
          <button type="button" className="al-often-b" aria-label={`How often for ${r.name}: ${r.every.label}. Change it to ${next.label}${next.pro ? ", part of Pro" : ""}`} disabled={busy} onClick={() => onEvery(r, next.key, next.pro)}>
            {r.every.label}
            <ChevDown open />
          </button>
        ) : (
          <span className="al-often">{r.every.label}</span>
        )}
      </span>
      <span role="cell" className="al-c-last">
        <span>{r.last}</span>
      </span>
      <span role="cell" className="al-c-on">
        {hero && !r.on ? (
          <button type="button" className="btn btn-sm btn-pine" aria-label={`Turn on the alert: ${r.name}`} disabled={busy} onClick={() => onOn(r, true)}>
            Turn on
          </button>
        ) : (
          <Switch on={r.on} label={`${r.on ? "Turn off" : "Turn on"} the alert: ${r.name}`} disabled={busy || !r.canSwitch} onFlip={() => onOn(r, !r.on)} />
        )}
      </span>
    </div>
  );
}

/* ---------- where alerts go ---------- */

function Destinations({ integ, email, first, onOp, onTest }: { integ: IntegrationsView | null; email: string | null; first: boolean; onOp: (b: Record<string, unknown>) => Promise<unknown>; onTest: () => void }) {
  const [paste, setPaste] = useState<"slack" | "webhook" | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const slack = integ?.slack ?? null;
  const hook = integ?.webhook ?? null;
  const run = async (b: Record<string, unknown>) => {
    setBusy(true);
    try {
      const ok = await onOp(b);
      if (ok && b.op === "connect") (setPaste(null), setUrl(""));
    } finally {
      setBusy(false);
    }
  };
  const lead = slack ? "Each alert picks from these in its row." : "Email and the bell are ready. Connect Slack if you want alerts in a channel too. It takes a minute and you can skip it.";
  const pasteForm = (field: "slack" | "webhook") => (
    <form
      className="al-paste"
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim()) void run({ op: "connect", field, url: url.trim() });
      }}
    >
      <label className="sr-only" htmlFor={`al-paste-${field}`}>
        {field === "slack" ? "Slack webhook URL" : "Webhook URL"}
      </label>
      <input id={`al-paste-${field}`} className="input mono" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder={field === "slack" ? "https://hooks.slack.com/services/…" : "https://hooks.zapier.com/…"} value={url} onChange={(e) => setUrl(e.target.value)} />
      <button type="submit" className="btn btn-sm btn-pine" disabled={busy || !url.trim()} aria-busy={busy}>
        {busy ? "Checking" : "Connect"}
      </button>
    </form>
  );
  return (
    <section id="al-dest" className="al-dest" aria-label="Where alerts go">
      <span className="al-dest-lead">
        <strong>Where alerts go.</strong> {lead}
      </span>
      <div className="al-dests">
        <Dest t="Email" svc="email" state={email ? "On" : "Not set up"} ok={!!email} line={email ?? "Merlin doesn't send email yet."} sub="Every email links back to this page. One click in it turns that alert off." />
        {integ && !integ.allowed ? (
          <Dest t="Slack" svc="slack" state="Not on your plan" ok={false} line="Alerts in Slack aren't part of your plan." sub="" />
        ) : slack ? (
          <Dest
            t="Slack"
            svc="slack"
            state={slack.broken ? "Needs attention" : "Connected"}
            ok={!slack.broken}
            line={slack.channel ? `${slack.channel}${slack.team ? ` in ${slack.team}` : ""}` : slack.masked}
            sub={slack.problem ?? "Merlin can post there. It cannot read anything."}
          >
            <button type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={() => void run({ op: "test", field: "slack" })}>
              Send a test
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void run({ op: "remove", field: "slack" })}>
              Remove
            </button>
          </Dest>
        ) : (
          <Dest t="Slack" svc="slack" state="Not connected" ok={false} line="Posts to one channel or DM you pick." sub="It cannot read your messages, channels or contacts. A Slack webhook URL works too." highlight={first}>
            {integ?.slackApp && (
              <a className="btn btn-sm btn-pine" href="/api/integrations/slack/start">
                Connect Slack
              </a>
            )}
            {paste === "slack" ? (
              pasteForm("slack")
            ) : (
              <button type="button" className={`btn btn-sm ${integ?.slackApp ? "btn-ghost" : "btn-pine"}`} onClick={() => (setPaste("slack"), setUrl(""))}>
                {integ?.slackApp ? "Paste a webhook URL" : "Connect Slack"}
              </button>
            )}
          </Dest>
        )}
        <Dest t="The bell" svc="bell" state="Always on" ok line="In Merlin, at the top of every page." sub="The number on the bell is what you have not read yet.">
          <button type="button" className="btn btn-sm btn-outline" onClick={onTest}>
            Send a test
          </button>
        </Dest>
        {hook ? (
          <Dest t="Webhook" svc="webhook" state={hook.broken ? "Needs attention" : "Connected"} ok={!hook.broken} line={hook.masked} sub={hook.problem ?? "Gets the same alerts as Slack, as plain fields. The full URL is never shown again."}>
            <button type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={() => void run({ op: "test", field: "webhook" })}>
              Send a test
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void run({ op: "remove", field: "webhook" })}>
              Remove
            </button>
          </Dest>
        ) : (
          <Dest t="Webhook" svc="webhook" state="Not connected" ok={false} line="Zapier, Make or any tool that takes a webhook." sub="Paste its URL. Merlin sends a test before it saves.">
            {paste === "webhook" ? (
              pasteForm("webhook")
            ) : integ && !integ.allowed ? null : (
              <button type="button" className="btn btn-sm btn-outline" onClick={() => (setPaste("webhook"), setUrl(""))}>
                Connect a webhook
              </button>
            )}
          </Dest>
        )}
      </div>
      <span className="al-dest-note">At most one post of each kind every 15 minutes. More than one come together, with a count. What went to Slack is not emailed again. An alert never names a company you have not opened.</span>
    </section>
  );
}

function Dest({ t, svc, state, ok, line, sub, children, highlight }: { t: string; /** Its icon: only Slack has a brand one (ServiceIcon). */ svc: Service; state: string; ok: boolean; line: string; sub: string; children?: ReactNode; highlight?: boolean }) {
  return (
    <div className={`al-d${highlight ? " hi" : ""}`}>
      <span className="al-d-top">
        <ServiceIcon service={svc} size={18} className="al-d-icon" />
        <strong>{t}</strong>
        <span className={`al-d-state${ok ? " ok" : ""}`}>{state}</span>
      </span>
      <span className="al-d-line">{line}</span>
      {sub && <span className="al-sub">{sub}</span>}
      {children && <span className="al-d-acts">{children}</span>}
    </div>
  );
}

/* ---------- the builder ---------- */

const B_TRIGGERS: AlertTrigger[] = ["role", "seat", "leader", "fact", "funding"];
type BuilderState = { list: string; triggers: AlertTrigger[]; every: AlertEvery; email: boolean; slack: boolean; bell: boolean };

function Builder({
  b,
  set,
  lists,
  free,
  slackOn,
  busy,
  onClose,
  onGo,
  onConnect,
}: {
  b: BuilderState;
  set: (b: BuilderState) => void;
  lists: { id: string; name: string; starter: boolean }[];
  free: boolean;
  slackOn: boolean;
  busy: boolean;
  onClose: () => void;
  onGo: () => void;
  onConnect: () => void;
}) {
  const listName = lists.find((l) => l.id === b.list)?.name ?? "";
  const say = `When ${b.triggers.map((t) => TRIGGER_WORDS[t].toLowerCase()).join(" or ") || "something"} at a company on ${listName || "a list"}, tell me ${b.every === "instant" ? "as it happens" : b.every === "daily" ? "every morning" : "weekly"}.`;
  return (
    <aside className="al-b" aria-label="New alert">
      <div className="al-b-top">
        <div>
          <span className="al-kicker">NEW · ALERT</span>
          <strong>Tell me when it happens</strong>
        </div>
        <button type="button" className="al-b-x" aria-label="Close the builder" onClick={onClose}>
          <IconX size={18} />
        </button>
      </div>
      <div className="al-b-sec">
        <span id="al-b-w" className="al-b-h">
          1. When this happens
        </span>
        <div role="group" aria-labelledby="al-b-w" className="al-b-tiles">
          {B_TRIGGERS.map((t) => {
            const on = b.triggers.includes(t);
            const pro = free && t === "leader";
            return (
              <button
                key={t}
                type="button"
                role="checkbox"
                aria-checked={on}
                className={`al-tile${on ? " on" : ""}`}
                onClick={() => (pro ? openPlans("radar") : set({ ...b, triggers: on ? b.triggers.filter((x) => x !== t) : [...b.triggers, t] }))}
              >
                <span>{TRIGGER_WORDS[t]}</span>
                {pro && <span className="al-gate">Pro</span>}
              </button>
            );
          })}
        </div>
        <span className="al-sub">{b.triggers.length === 1 ? `A company on the list: ${TRIGGER_DETAIL[b.triggers[0]]}.` : "Any of these at a company on the list."}</span>
      </div>
      <div className="al-b-sec">
        <span id="al-b-l" className="al-b-h">
          2. Watching
        </span>
        {lists.length ? (
          <div role="radiogroup" aria-labelledby="al-b-l" className="al-b-list">
            {lists.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={b.list === l.id} className={`al-tile${b.list === l.id ? " on" : ""}`} onClick={() => set({ ...b, list: l.id })}>
                <span className={`al-dot${b.list === l.id ? " on" : ""}`} aria-hidden />
                <span>{l.name}</span>
                {l.starter && <span className="al-tag mint">Made for you</span>}
              </button>
            ))}
          </div>
        ) : (
          <span className="al-sub">Save a list first, in Find or on Companies. Then its alert is here.</span>
        )}
      </div>
      <div className="al-b-sec">
        <span id="al-b-o" className="al-b-h">
          3. How often, and where
        </span>
        <div role="radiogroup" aria-labelledby="al-b-o" className="al-b-tiles">
          {(["instant", "daily", "weekly"] as AlertEvery[]).map((k) => {
            const pro = free && k === "instant";
            return (
              <button key={k} type="button" role="radio" aria-checked={b.every === k} className={`al-tile${b.every === k ? " on" : ""}`} onClick={() => (pro ? openPlans("slack") : set({ ...b, every: k }))}>
                <span>{EVERY_WORDS[k]}</span>
                {pro && <span className="al-gate">Pro</span>}
              </button>
            );
          })}
        </div>
        <div className="al-b-chips">
          {(["email", "slack", "bell"] as const).map((k) => {
            const need = k === "slack" && !slackOn;
            const pro = k === "slack" && free;
            const on = b[k] && !need && !pro;
            return (
              <button key={k} type="button" aria-pressed={on} className={`al-chip${on ? " on" : ""}${need ? " connect" : pro ? " pro" : ""}`} onClick={() => (pro ? openPlans("slack") : need ? onConnect() : set({ ...b, [k]: !b[k] }))}>
                {k === "email" ? "Email" : k === "slack" ? "Slack" : "Bell"}
                {pro && <span className="al-chip-pro">Pro</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="al-b-cost">
        <span className="al-kicker">WHAT IT COSTS</span>
        <strong>Free. Alerts never spend credits.</strong>
      </div>
      <div className="al-b-foot">
        <strong>{say}</strong>
        <div className="al-b-go">
          <span className="al-sub">{b.list && b.triggers.length ? "Turn it off or change it any time." : "Pick a list and one thing to watch for."}</span>
          <button type="button" className="btn btn-pine" disabled={busy || !b.list || !b.triggers.length || (!b.email && !b.bell && !(b.slack && slackOn && !free))} onClick={onGo}>
            Turn on
          </button>
        </div>
      </div>
    </aside>
  );
}

