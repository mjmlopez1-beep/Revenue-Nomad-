"use client";

/**
 * Workflows in the new design (RN_UI3, on the v2 engine RN_WORKFLOWS_V2; find-design/v5/work.html,
 * Workflows, rounds 8 and 9). Merlin should feel like hiring a business development assistant, not
 * learning to build one. With RN_WORKFLOWS_V2 off, today's Alerts and workflows draws inside the page.
 *
 *   Simple (default)   the four stages, the signature pattern: 01 When this happens (gold), 02 Merlin
 *                      does this (purple), 03 I approve (forest), 04 Merlin follows through
 *                      (terracotta). It compiles to a real graph (lib/workflows/simple.ts) that the
 *                      engine runs: research and the decision maker at the app's prices, the way in,
 *                      a draft in the member's voice, then Approve, then send, which waits for the
 *                      member's tap (asked in-app and by email, skipped after N days), then the
 *                      pipeline, the reply watch and a follow-up for another tap.
 *   Spending           up to N credits a run (the engine's own ceiling), the monthly credit limit as
 *                      an enforced cap: at it, runs stop spending and wait for the member's yes.
 *   One status         Live, Unpublished changes, Paused (or Draft before the first publish).
 *                      "Publish changes" appears only with unpublished changes.
 *   Test workflow      a sample opportunity through all four stages: what it would cost and the
 *                      draft the member would approve. Nothing is spent or sent (op "test").
 *   Advanced           the canvas on the same graph: select a step for its settings, switch it off,
 *                      add one after it, remove it. Phones get the step list.
 *   Runs, Templates, Your workflows   waiting runs answered (yes, no), failed runs retried; templates
 *                      as four-stage cards; every workflow with its switch, runs and spend.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useToast } from "../../../../ui/shared";
import { pageDef, useApp } from "../../../shell/pages";
import { compileSimple, parseSimple, SCOPE_SAY, SIMPLE_DEFAULT, TRIGGER_SAY, type SimpleCfg, type SimpleTrigger } from "@/lib/workflows/simple";
import type { GraphVersion, GraphWorkflow, GraphCheck, GraphRun, GNode, NodeType } from "@/lib/workflows/graph";
import type { StepPrices } from "@/lib/workflows/types";
import { Chips, Gate, Sheet, Skel, St, Switch, Tabs, WorkMain, type Tone } from "../parts";
import { openPlans } from "../../../Billing";
import { WIc, type WIconName } from "../icons";
import { Canvas } from "./Canvas";
import "./workflows.css";

/* ---------------- the API ---------------- */

interface ListItem {
  id: string;
  name: string;
  on: boolean;
  stored: boolean;
  from: string | null;
  mode: "simple" | null;
  live: number | null;
  draft: number | null;
  notLive: boolean;
  trigger: string | null;
  steps: number;
  ceiling: number;
  cap: number | null;
  warn: number | null;
  spentMonth: number;
  runs30: number;
  waiting: number;
  failed: number;
}
export interface CatItem {
  type: NodeType;
  group: string;
  name: string;
  sub: string;
  paid: boolean;
  sends: boolean;
  pauses: boolean;
  hold: string | null;
  stub: string | null;
  outs: string[];
}
interface ListView {
  on: true;
  plan: { tier: string; paid: boolean; proposals: boolean; evidence: boolean };
  prices?: StepPrices;
  catalog: CatItem[];
  workflows: ListItem[];
}
interface OneView {
  workflow: Omit<GraphWorkflow, "hook">;
  liveCheck: GraphCheck | null;
  draftCheck: GraphCheck | null;
}
type RunRow = { id: string; at: string; test: boolean; status: GraphRun["status"]; line: string; quote: number; estimate: number; spent: number; waiting: string | null; failedAt: string | null };

async function wf<T>(method: "GET" | "POST", q = "", body?: unknown): Promise<T & { error?: string; status?: number }> {
  try {
    const r = await fetch(`/api/workflows2${q}`, { method, headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ...j, status: r.status, error: j.error || "That didn't go through. Try again." };
    return j;
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." } as T & { error: string };
  }
}

/* ---------------- templates: four-stage strategies ---------------- */

const TEMPLATES: { k: string; t: string; say: string; goal: string; cfg: SimpleCfg }[] = [
  { k: "first", t: "Be first in the door", say: "When a fractional seat ends at an ideal client, get a warm introduction ready before anyone else.", goal: "New clients", cfg: { ...SIMPLE_DEFAULT, trigger: "seat", scope: { kind: "radar" } } },
  { k: "hiring", t: "Who's hiring for my expertise", say: "When a company in my Crystal Ball posts a fractional role in my function, research it and draft my note.", goal: "New clients", cfg: { ...SIMPLE_DEFAULT, trigger: "role", scope: { kind: "radar" } } },
  { k: "money", t: "Follow the money", say: "When an ideal client files a funding round, find who decides and my warmest way in.", goal: "New clients", cfg: { ...SIMPLE_DEFAULT, trigger: "funding", scope: { kind: "radar" } } },
  { k: "fresh", t: "Act on Crystal Ball", say: "When a company in my Crystal Ball hires its first fractionals, reach out while the door is open.", goal: "Crystal Ball", cfg: { ...SIMPLE_DEFAULT, trigger: "hire", scope: { kind: "radar" } } },
  { k: "leader", t: "A new leader is building", say: "When a new leader shows at a company I follow, introduce myself with the right case study.", goal: "Relationships", cfg: { ...SIMPLE_DEFAULT, trigger: "leader", scope: { kind: "follows" }, dm: false } },
  { k: "reconnect", t: "Reconnect at the right time", say: "When someone I know starts at a new company, draft a warm note to reconnect.", goal: "Relationships", cfg: { ...SIMPLE_DEFAULT, trigger: "known", scope: { kind: "contacts" }, research: false, dm: false } },
];
const GOALS = ["All", "New clients", "Crystal Ball", "Relationships"] as const;

/* ---------------- words ---------------- */

const statusOf = (w: { live: unknown; draft: unknown; on: boolean }): { words: string; tone: Tone } =>
  !w.live ? { words: "Draft", tone: "gold" } : w.draft ? { words: "Unpublished changes", tone: "gold" } : w.on ? { words: "Live", tone: "forest" } : { words: "Paused", tone: "" };
const creditWords = (n: number) => (n === 1 ? "1 credit" : `${n} credits`);
const DEFAULT_CAP = 60;

/** What each paid Simple step costs this member now, from the engine's prices. */
function stepPrice(p: StepPrices | undefined, cfg: SimpleCfg, step: "research" | "dm"): number {
  if (!p) return 0;
  const company = cfg.scope.kind === "radar" && p.ballFree ? 0 : p.companyFull;
  if (step === "research") return company;
  return p.person + (cfg.research ? 0 : company);
}

/* ---------------- the page ---------------- */

type Tab = "editor" | "runs" | "templates" | "mine";

export function Ui3Workflows() {
  const c = useApp();
  const [list, setList] = useState<ListView | null>(null);
  const [off, setOff] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("mine");
  const [id, setId] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await wf<ListView>("GET");
    if (r.status === 404) return setOff(true);
    if (r.error) return setErr(r.error);
    setErr(null);
    setList(r);
    return r;
  }, []);
  useEffect(() => {
    void load().then((r) => r && setTab((t) => (t === "mine" && !r.workflows.length ? "templates" : t)));
  }, [load]);

  if (off) {
    // Workflows v2 is off for Merlin: today's Alerts and workflows, inside the new page.
    const Legacy = pageDef("alerts")?.component;
    return (
      <WorkMain group="Work" title="Workflows" cls="w3-wf">
        <div className="wf3-head">
          <h1 className="m-display m-h1">Workflows.</h1>
          <p className="m-sub">Tell Merlin what to watch and what to do. Nothing goes out without you.</p>
        </div>
        <div className="w3-host">{Legacy ? <Legacy /> : null}</div>
      </WorkMain>
    );
  }
  const cur = id ? list?.workflows.find((x) => x.id === id) ?? null : null;
  const waitingN = list?.workflows.reduce((n, x) => n + x.waiting, 0) ?? 0;
  return (
    <WorkMain group="Work" title={tab === "editor" && cur ? cur.name : "Workflows"} crumbs={tab === "editor" && cur ? [{ label: "Workflows", go: () => setTab("mine") }] : []} cls="w3-wf">
      {tab !== "editor" && (
        <div className="wf3-head">
          <h1 className="m-display m-h1">Workflows.</h1>
          <p className="m-sub">Tell Merlin what to watch and what to do, like giving an assistant instructions. Nothing goes out without you.</p>
        </div>
      )}
      <div className="wf3-tabs">
        <Tabs
          label="Workflows"
          on={tab}
          set={(t) => setTab(t)}
          items={[
            ...(id ? [{ k: "editor" as Tab, label: "Editor" }, { k: "runs" as Tab, label: "Runs", n: cur?.waiting || undefined }] : []),
            { k: "templates", label: "Templates" },
            { k: "mine", label: "Your workflows", n: list?.workflows.length },
          ]}
        />
        {waitingN > 0 && tab !== "runs" && <span className="w-st hot">{waitingN === 1 ? "1 run waits for you" : `${waitingN} runs wait for you`}</span>}
      </div>
      {err && !list ? (
        <p className="w3-err">{err}</p>
      ) : !list ? (
        <Skel rows={4} />
      ) : tab === "templates" ? (
        <Templates list={list} onMade={async (nid) => (await load(), setId(nid), setTab("editor"))} />
      ) : tab === "mine" ? (
        <Mine list={list} reload={load} open={(nid, t) => (setId(nid), setTab(t))} onTemplates={() => setTab("templates")} />
      ) : tab === "runs" && id ? (
        <Runs id={id} reload={load} catalog={list.catalog} />
      ) : id ? (
        <Editor key={id} id={id} list={list} item={cur} reload={load} onGone={() => (setId(null), setTab("mine"), void load())} />
      ) : null}
    </WorkMain>
  );
}

/* ---------------- the four-stage block (the signature pattern) ---------------- */

function stageRows(cfg: SimpleCfg): { n: string; cls: string; kicker: string; head?: string; lines: string[] }[] {
  const say = TRIGGER_SAY[cfg.trigger];
  return [
    { n: "01", cls: "g1", kicker: "When this happens", head: say.head, lines: [`${say.line}${cfg.trigger === "known" ? "" : ` ${SCOPE_SAY[cfg.scope.kind] ?? ""}`}`] },
    { n: "02", cls: "g2", kicker: "Merlin does this", lines: [cfg.research && "Research the company", cfg.dm && "Find the decision maker", cfg.way && "Find my warmest way in", "Draft an introduction in my voice"].filter(Boolean) as string[] },
    { n: "03", cls: "g3", kicker: "I approve", head: "Nothing goes out without me.", lines: [`Skipped if I don't answer in ${cfg.ask.days} days`] },
    { n: "04", cls: "g4", kicker: "Merlin follows through", lines: [cfg.follow.pipe && "Update my pipeline", cfg.follow.reply && "Watch for a reply", cfg.follow.followup && "Prepare a follow-up for approval"].filter(Boolean) as string[] },
  ];
}
function MiniStages({ cfg }: { cfg: SimpleCfg }) {
  return (
    <ol className="wf3-mini">
      {stageRows(cfg).map((s) => (
        <li key={s.n} className={s.cls}>
          <span className="wf3-mn">{s.n}</span>
          <span>
            <b>{s.kicker}</b>
            <small>{s.head && s.n !== "01" ? s.head : s.lines.join(" · ")}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Templates({ list, onMade }: { list: ListView; onMade: (id: string) => void }) {
  const toast = useToast();
  const [goal, setGoal] = useState<(typeof GOALS)[number]>("All");
  const [busy, setBusy] = useState<string | null>(null);
  const use = async (t: (typeof TEMPLATES)[number]) => {
    setBusy(t.k);
    const r = await wf<{ id: string; message: string }>("POST", "", { op: "save", name: t.t, mode: "simple", cap: DEFAULT_CAP, warn: null, version: compileSimple(t.cfg) });
    setBusy(null);
    if (r.error) return toast(r.error, true);
    toast(`${t.t} is ready. It's off until you make it live.`);
    onMade(r.id);
  };
  const shown = TEMPLATES.filter((t) => goal === "All" || t.goal === goal);
  return (
    <>
      <p className="w-help wf3-lead">Ready-made business development strategies. Each sets up in under a minute, and nothing runs until you make it live.</p>
      {!list.plan.paid && (
        <Gate title="Research and drafting are on Pro" onPlans={() => openPlans("billing")}>
          These workflows open the company and who decides, and draft your note: steps that are part of Pro. Your approval stays yours on every plan.
        </Gate>
      )}
      <Chips items={GOALS.map((g) => ({ k: g, label: g, n: g === "All" ? TEMPLATES.length : TEMPLATES.filter((t) => t.goal === g).length }))} on={goal} set={setGoal} label="Goals" />
      <div className="wf-tgrid">
        {shown.map((t) => (
          <article key={t.k} className="wf-tcard">
            <h3>{t.t}</h3>
            <p>{t.say}</p>
            <MiniStages cfg={t.cfg} />
            <div className="w-row">
              <span className="m-small">{list.plan.paid ? "Stops at 60 credits a month unless you change it" : "Research and drafting are on Pro"}</span>
              <span className="w-sp" />
              {list.plan.paid ? (
                <button type="button" className="m-btn m-btn-sm m-btn-primary" disabled={!!busy} aria-busy={busy === t.k || undefined} onClick={() => void use(t)}>
                  Use template
                </button>
              ) : (
                <button type="button" className="m-btn m-btn-sm m-btn-secondary" onClick={() => openPlans("billing")}>
                  <WIc n="lock" /> On Pro
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function Mine({ list, reload, open, onTemplates }: { list: ListView; reload: () => Promise<unknown>; open: (id: string, t: Tab) => void; onTemplates: () => void }) {
  const toast = useToast();
  const flip = async (x: ListItem, on: boolean) => {
    const r = await wf<{ message: string }>("POST", "", { op: "on", id: x.id, on });
    if (r.error) return toast(r.error, true);
    toast(r.message);
    void reload();
  };
  if (!list.workflows.length)
    return (
      <div className="pr3-empty">
        <b className="w-h4">No workflows yet</b>
        <p className="w-help">Start from a template: Merlin watches for the moment, does the research, drafts your note and waits for your tap. You set the monthly credit limit.</p>
        <button type="button" className="m-btn m-btn-sm m-btn-primary" onClick={onTemplates}>
          See templates
        </button>
      </div>
    );
  return (
    <div className="m-table wf-mine" role="table" aria-label="Your workflows">
      <div className="m-thead" role="row">
        <span>Workflow</span>
        <span>Status</span>
        <span>Runs, 30 days</span>
        <span>This month</span>
        <span>On</span>
        <span />
      </div>
      {list.workflows.map((x) => {
        const st = statusOf({ live: x.live, draft: x.draft, on: x.on });
        return (
          <div key={x.id} className="m-tr" role="row" onClick={() => open(x.id, "editor")}>
            <div className="m-co" role="cell">
              <span className={`wf-gi ${x.mode === "simple" ? "g-trigger" : "g-logic"}`} aria-hidden="true">
                <WIc n={x.mode === "simple" ? "bolt" : "canvas"} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="m-name">
                  <span>{x.name}</span>
                </div>
                <small>{x.mode === "simple" ? "Simple" : "Advanced"} · up to {creditWords(x.ceiling)} a run</small>
              </div>
            </div>
            <span role="cell" className="m-ph-hide">
              <St tone={x.waiting ? "hot" : st.tone}>{x.waiting ? `${x.waiting} waiting for you` : x.failed ? "Needs attention" : st.words}</St>
            </span>
            <span role="cell" className="m-small m-ph-hide">
              {x.runs30}
            </span>
            <span role="cell" className="m-small m-ph-hide">
              {x.cap !== null ? `${x.spentMonth} of ${x.cap} credits` : `${creditWords(x.spentMonth)}, no limit`}
            </span>
            <span role="cell" onClick={(e) => e.stopPropagation()}>
              <Switch sm on={x.on} disabled={!x.live} label={`${x.name} on`} set={(v) => void flip(x, v)} />
            </span>
            <div className="m-rowact w-racts m-ph-z" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="m-btn m-btn-sm m-btn-secondary" onClick={() => open(x.id, "editor")}>
                Edit
              </button>
              <button type="button" className="m-btn m-btn-sm m-btn-ghost" onClick={() => open(x.id, "runs")}>
                Runs
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- the editor ---------------- */

function Editor({ id, list, item, reload, onGone }: { id: string; list: ListView; item: ListItem | null; reload: () => Promise<unknown>; onGone: () => void }) {
  const c = useApp();
  const toast = useToast();
  const [one, setOne] = useState<OneView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cfg, setCfg] = useState<SimpleCfg | null>(null);
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<null | "live" | "spend" | "settings" | "test">(null);
  const [testRun, setTestRun] = useState<GraphRun | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const get = useCallback(async () => {
    const r = await wf<OneView>("GET", `?id=${encodeURIComponent(id)}`);
    if (r.error) return setErr(r.error);
    setOne(r);
    const ver = r.workflow.draft ?? r.workflow.live;
    const p = parseSimple(ver);
    setCfg(p);
    setMode((m) => (p ? m : "advanced"));
  }, [id]);
  useEffect(() => {
    void get();
  }, [get]);
  if (err) return <p className="w3-err">{err}</p>;
  if (!one) return <Skel rows={5} />;
  const w = one.workflow;
  const ver = (w.draft ?? w.live) as GraphVersion | null;
  const check = w.draft ? one.draftCheck : one.liveCheck;
  const st = statusOf({ live: w.live, draft: w.draft, on: w.on });
  const cap = w.cap;
  const spent = item?.spentMonth ?? 0;
  const ceiling = check?.ceiling ?? 0;

  /** Save the four stages as the draft (Unpublished changes), with the cap it keeps. */
  const saveCfg = async (next: SimpleCfg, more: Record<string, unknown> = {}) => {
    setCfg(next);
    setBusy(true);
    const r = await wf<{ message: string }>("POST", "", { op: "save", id, mode: "simple", cap: w.cap ?? DEFAULT_CAP, version: compileSimple(next), ...more });
    setBusy(false);
    if (r.error) return toast(r.error, true), void get();
    await get();
    void reload();
  };
  const saveGraph = async (v: Pick<GraphVersion, "nodes" | "edges">, more: Record<string, unknown> = {}) => {
    setBusy(true);
    const r = await wf<{ message: string }>("POST", "", { op: "save", id, mode: "advanced", version: v, ...more });
    setBusy(false);
    if (r.error) return toast(r.error, true);
    await get();
    void reload();
  };
  const publish = async () => {
    setBusy(true);
    const r = await wf<{ message: string }>("POST", "", { op: "live", id });
    if (!r.error && !w.on && !w.live) await wf("POST", "", { op: "on", id, on: true });
    setBusy(false);
    setSheet(null);
    if (r.error) return toast(r.error, true);
    toast(w.live ? "Published. New runs use these changes." : "Live. Merlin starts watching now.");
    await get();
    void reload();
  };
  const runTest = async () => {
    setBusy(true);
    // A sample opportunity: a company in your Crystal Ball, else one you can see.
    const sample = c.shell.radar.rows?.[0]?.i.c.id ?? c.infos.find((i) => !i.c.hidden)?.c.id ?? null;
    const r = await wf<{ run: GraphRun; message: string }>("POST", "", { op: "test", id, ...(sample ? { sample: { company: sample } } : {}) });
    setBusy(false);
    if (r.error) return toast(r.error, true);
    setTestRun(r.run);
    setSheet("test");
  };

  const bar = (
    <div className="wf3-bar">
      <h2 className="wf3-name">{w.name}</h2>
      <St tone={st.tone}>{st.words}</St>
      <span className="w-sp" />
      <span className="m-seg wf-modeseg" role="group" aria-label="Mode">
        <button type="button" aria-pressed={mode === "simple"} disabled={!cfg} title={cfg ? undefined : "This workflow has branches Simple can't show. It opens in Advanced."} onClick={() => setMode("simple")}>
          Simple
        </button>
        <button type="button" aria-pressed={mode === "advanced"} onClick={() => setMode("advanced")}>
          Advanced
        </button>
      </span>
      <button type="button" className="m-iconbtn sm" aria-label="Workflow settings" onClick={() => setSheet("settings")}>
        <WIc n="gear" />
      </button>
      <button type="button" className="m-btn m-btn-sm m-btn-secondary" disabled={busy || !ver} onClick={() => void runTest()}>
        <WIc n="play" /> Test workflow
      </button>
      {(!w.live || w.draft) && (
        <button type="button" className="m-btn m-btn-sm m-btn-primary" disabled={busy} onClick={() => setSheet("live")}>
          {w.live ? "Publish changes" : "Make live"}
        </button>
      )}
    </div>
  );

  const spending = (
    <section className="m-panel wfs-card wf3-spend" aria-label="Workflow spending">
      <div className="w-kicker">Workflow spending</div>
      <div className="wfs-big">
        {ceiling ? (
          <>
            Up to {creditWords(ceiling)}
            <small> per run</small>
          </>
        ) : (
          <>
            No credits
            <small> per run on your plan</small>
          </>
        )}
      </div>
      <div className="wf3-cap">
        <div className="w-row">
          <span className="m-small">Monthly credit limit</span>
          <span className="w-sp" />
          <b>{cap !== null ? `${spent} / ${cap}` : "None set"}</b>
        </div>
        {cap !== null && (
          <div className="wf3-bar-track" role="progressbar" aria-label="Credits used this month" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={Math.min(spent, cap)}>
            <i style={{ width: `${cap ? Math.min(100, (spent / cap) * 100) : 0}%` }} />
          </div>
        )}
        <span className="m-small">{cap !== null ? `${Math.max(0, cap - spent)} credits remaining this month` : "Set a limit: Simple workflows need one."}</span>
      </div>
      <p className="w-help">You&apos;re always in control. Merlin pauses spending at your monthly limit and asks before continuing.</p>
      <button type="button" className="w-link" onClick={() => setSheet("spend")}>
        Manage spending limit
      </button>
    </section>
  );
  const checks = (
    <section className="m-panel wfs-card">
      <div className="w-kicker">Before it goes live</div>
      <ul className="wf-checks">
        {check && !check.ok ? (
          check.problems.map((p) => (
            <li key={p}>
              <span className="m-check no" aria-hidden="true">
                <WIc n="x" />
              </span>
              <span>{p}</span>
            </li>
          ))
        ) : (
          ["One trigger, and every step connected", "Your tap comes before anything is sent", "Every step is on your plan", !ceiling ? "Nothing it does costs credits on your plan" : cap !== null ? `Up to ${creditWords(ceiling)} a run, within your ${cap} a month` : `Up to ${creditWords(ceiling)} a run`].map((t) => (
            <li key={t}>
              <span className="m-check" aria-hidden="true">
                <WIc n="check" />
              </span>
              <span>{t}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );

  return (
    <div className="wf3-ed">
      {bar}
      {mode === "simple" && cfg ? (
        <div className="wfs">
          <Simple cfg={cfg} prices={list.prices} busy={busy} save={(n) => void saveCfg(n)} open={open} setOpen={setOpen} lists={(c.me.savedViews ?? []).map((v) => ({ id: v.id, name: v.name }))} holds={check?.holds ?? {}} toAdvanced={() => setMode("advanced")} />
          <aside className="wfs-side">
            {spending}
            {checks}
          </aside>
        </div>
      ) : ver ? (
        <Canvas ver={ver} catalog={list.catalog} holds={check?.holds ?? {}} busy={busy} save={(v) => void saveGraph(v)} phone={c.phone} side={<>{spending}{checks}</>} />
      ) : (
        <p className="w-help">This workflow has no steps yet.</p>
      )}
      {sheet === "live" && (
        <Sheet
          title={w.live ? "Publish changes" : "Make it live"}
          onClose={() => setSheet(null)}
          foot={
            <>
              <button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => setSheet(null)}>
                Not yet
              </button>
              <button type="button" className="m-btn m-btn-primary m-btn-sm" disabled={busy || !!(check && !check.ok)} onClick={() => void publish()}>
                {w.live ? "Publish changes" : "Make live"}
              </button>
            </>
          }
        >
          <div className="wfs-cap">
            <WIc n="lock" className="w-ic" />
            <span>
              <b>
                Up to {creditWords(ceiling)} a run.{cap !== null ? ` Stops at ${cap} credits this month` : ""}
              </b>
              {cap !== null ? ` (${spent} used). At the limit, runs wait for your yes instead of spending.` : ""} Each run quotes before it spends and never goes past the quote.
            </span>
          </div>
          {check && !check.ok && <p className="w3-err">{check.problems[0]}</p>}
          <p className="w-help">{w.live ? "Runs already in flight finish on the version they started with." : "It starts with the next event Merlin sees."}</p>
        </Sheet>
      )}
      {sheet === "spend" && <SpendSheet w={w} spent={spent} ver={ver} simple={mode === "simple" && !!cfg} onClose={() => setSheet(null)} onSaved={async () => (setSheet(null), await get(), void reload())} />}
      {sheet === "settings" && <SettingsSheet w={w} id={id} onClose={() => setSheet(null)} onGone={onGone} onChanged={async () => (await get(), void reload())} />}
      {sheet === "test" && testRun && <TestSheet run={testRun} ver={ver} cfg={cfg} onClose={() => setSheet(null)} />}
    </div>
  );
}

/* ---------------- Simple mode ---------------- */

const TRIG_ORDER: SimpleTrigger[] = ["seat", "role", "hire", "funding", "leader", "known", "fact"];
const TRIG_LABEL: Record<SimpleTrigger, string> = { seat: "A fractional seat ends", role: "A fractional role is posted", hire: "A company hires a fractional", funding: "A funding round is filed", leader: "A new leader shows", known: "Someone I know changes jobs", fact: "A fact changes" };

function Simple({ cfg, prices, busy, save, open, setOpen, lists, holds, toAdvanced }: { cfg: SimpleCfg; prices?: StepPrices; busy: boolean; save: (c: SimpleCfg) => void; open: string | null; setOpen: (k: string | null) => void; lists: { id: string; name: string }[]; holds: Record<string, string>; toAdvanced: () => void }) {
  const say = TRIGGER_SAY[cfg.trigger];
  const price = (k: "research" | "dm") => stepPrice(prices, cfg, k);
  const row = (k: string, on: boolean, label: string, set: ((v: boolean) => void) | null, more: { cost?: number; sub?: string; hold?: string; detail?: ReactNode }) => (
    <li key={k} className={on ? "" : "off"}>
      <div className="wfs-row">
        {set ? <Switch sm on={on} label={label} disabled={busy} set={set} /> : <span className="wf3-lockon" title="Always on: your approval needs a note">On</span>}
        <button type="button" className="wfs-txt" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
          <span>{label}</span>
          {more.sub && <small>{more.sub}</small>}
        </button>
        {more.hold ? <span className="wf-pill plan">{more.hold}</span> : more.cost !== undefined ? <span className="wf-pill cr">{more.cost ? creditWords(more.cost) : "Free"}</span> : null}
        <WIc n="down" className="wfs-chev" />
      </div>
      {open === k && more.detail && <div className="wfs-detail">{more.detail}</div>}
    </li>
  );
  const stage = (num: string, cls: string, kicker: string, body: ReactNode) => (
    <section className={`wfs-step ${cls}`}>
      <span className={`wfs-n wf3-n${num}`}>
        <b>{num}</b>
      </span>
      <div className="wfs-b">
        <div className="w-kicker">{kicker}</div>
        {body}
      </div>
    </section>
  );
  const scopeSel =
    cfg.trigger === "known" ? (
      <b className="wfs-sel">in my contacts</b>
    ) : (
      <select
        className="wfs-sel"
        aria-label="Watching"
        disabled={busy}
        value={cfg.scope.kind === "list" ? `list:${cfg.scope.list}` : cfg.scope.kind}
        onChange={(e) => {
          const v = e.target.value;
          save({ ...cfg, scope: v.startsWith("list:") ? { kind: "list", list: v.slice(5) } : { kind: v as "radar" | "follows" } });
        }}
      >
        <option value="radar">in my Crystal Ball</option>
        <option value="follows">I follow</option>
        {lists.map((l) => (
          <option key={l.id} value={`list:${l.id}`}>
            on my list {l.name}
          </option>
        ))}
      </select>
    );
  return (
    <div className="wfs-main">
      {stage(
        "01",
        "",
        "When this happens",
        <>
          <h3 className="wfs-head">{say.head}</h3>
          <p className="wfs-say">
            When{" "}
            <select className="wfs-sel" aria-label="What sets it off" disabled={busy} value={cfg.trigger} onChange={(e) => save({ ...cfg, trigger: e.target.value as SimpleTrigger, scope: e.target.value === "known" ? { kind: "contacts" } : cfg.scope.kind === "contacts" ? { kind: "radar" } : cfg.scope })}>
              {TRIG_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TRIG_LABEL[t].toLowerCase()}
                </option>
              ))}
            </select>{" "}
            {cfg.trigger === "known" ? "" : "at a company "}
            {scopeSel}
          </p>
        </>,
      )}
      {stage(
        "02",
        "",
        "Merlin does this",
        <ul className="wfs-rows">
          {row("research", cfg.research, "Research the company", (v) => save({ ...cfg, research: v }), { cost: price("research"), hold: holds.s_open, detail: <p className="w-help">Opens the company at the app&apos;s price: its name, website and open roles. A company already open costs nothing.</p> })}
          {row("dm", cfg.dm, "Find the decision maker", (v) => save({ ...cfg, dm: v }), { cost: price("dm"), hold: holds.s_dm, detail: <p className="w-help">Opens who decides there: their name and title. Their email or phone stays a separate choice.</p> })}
          {row("way", cfg.way, "Find my warmest way in", (v) => save({ ...cfg, way: v }), { cost: 0, detail: <p className="w-help">Your ways in there, strongest first, from people you know. Free.</p> })}
          {row("draft", true, "Draft an introduction in my voice", null, { sub: "Using my voice", hold: holds.s_draft, detail: <p className="w-help">A draft from your voice. It goes nowhere until you approve it below.</p> })}
        </ul>,
      )}
      {stage(
        "03",
        "wfs-approve",
        "I approve",
        <>
          <h3 className="wfs-head">Nothing goes out without me.</h3>
          <p className="wfs-say2">
            I review, edit or skip each draft before it is sent. Ask me in{" "}
            <select className="wfs-sel" aria-label="Where to ask" disabled={busy} value={cfg.ask.email ? "both" : "app"} onChange={(e) => save({ ...cfg, ask: { ...cfg.ask, email: e.target.value === "both" } })}>
              <option value="both">In-app notifications and email</option>
              <option value="app">In-app notifications only</option>
            </select>
            ; if I don&apos;t answer in{" "}
            <select className="wfs-sel" aria-label="Skipped after" disabled={busy} value={cfg.ask.days} onChange={(e) => save({ ...cfg, ask: { ...cfg.ask, days: Number(e.target.value) } })}>
              {[3, 7, 14].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
            , it&apos;s skipped.
          </p>
        </>,
      )}
      {stage(
        "04",
        "",
        "Merlin follows through",
        <ul className="wfs-rows">
          {row("pipe", cfg.follow.pipe, "Update my pipeline", (v) => save({ ...cfg, follow: { ...cfg.follow, pipe: v } }), { detail: <p className="w-help">After your tap, the company goes in your pipeline and moves to Replied when they write back.</p> })}
          {row("reply", cfg.follow.reply, `Watch for a reply for ${cfg.follow.replyDays} days`, (v) => save({ ...cfg, follow: { ...cfg.follow, reply: v, followup: v ? cfg.follow.followup : false } }), {
            detail: (
              <label className="w-field">
                <span>Days to wait for a reply</span>
                <select className="w-sel" value={cfg.follow.replyDays} onChange={(e) => save({ ...cfg, follow: { ...cfg.follow, replyDays: Number(e.target.value) } })}>
                  {[2, 4, 7, 14].map((d) => (
                    <option key={d} value={d}>
                      {d} days
                    </option>
                  ))}
                </select>
              </label>
            ),
          })}
          {row("followup", cfg.follow.followup, "Prepare a follow-up for approval", cfg.follow.reply ? (v) => save({ ...cfg, follow: { ...cfg.follow, followup: v } }) : null, { detail: <p className="w-help">With no reply, Merlin drafts a short follow-up. It waits for your tap like the first note.</p> })}
        </ul>,
      )}
      <p className="m-small wfs-adv">
        Need branches, conditions or another tool?{" "}
        <button type="button" className="w-link" onClick={toAdvanced}>
          Open the Advanced canvas <WIc n="arrow" />
        </button>
      </p>
    </div>
  );
}

/* ---------------- sheets ---------------- */

function SpendSheet({ w, spent, ver, simple, onClose, onSaved }: { w: OneView["workflow"]; spent: number; ver: GraphVersion | null; simple: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [cap, setCap] = useState(String(w.cap ?? DEFAULT_CAP));
  const [warn, setWarn] = useState(w.warn !== null ? String(w.warn) : "");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!ver) return;
    setBusy(true);
    const r = await wf<{ message: string }>("POST", "", { op: "save", id: w.id, mode: simple ? "simple" : "advanced", cap: cap === "" ? null : Number(cap), warn: warn === "" ? null : Number(warn), version: { nodes: ver.nodes, edges: ver.edges } });
    setBusy(false);
    if (r.error) return toast(r.error, true);
    toast("Spending limit saved. Publish changes to use it.");
    onSaved();
  };
  return (
    <Sheet
      title="Spending limit"
      onClose={onClose}
      foot={
        <>
          <button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="m-btn m-btn-primary m-btn-sm" disabled={busy || (simple && !(Number(cap) >= 1))} onClick={() => void go()}>
            Save
          </button>
        </>
      }
    >
      <p className="w-help">This workflow has spent {creditWords(spent)} this month. At the limit it stops spending and asks you in the bell before going on.</p>
      <label className="w-field">
        <span>Monthly credit limit</span>
        <input className="w-in" type="number" min={simple ? 1 : 0} max={500} value={cap} onChange={(e) => setCap(e.target.value)} />
      </label>
      <label className="w-field">
        <span>Tell me when it passes (optional)</span>
        <input className="w-in" type="number" min={0} max={499} value={warn} placeholder="No warning" onChange={(e) => setWarn(e.target.value)} />
      </label>
    </Sheet>
  );
}

function SettingsSheet({ w, id, onClose, onGone, onChanged }: { w: OneView["workflow"]; id: string; onClose: () => void; onGone: () => void; onChanged: () => void }) {
  const toast = useToast();
  const post = async (body: Record<string, unknown>) => {
    const r = await wf<{ message: string }>("POST", "", body);
    if (r.error) return toast(r.error, true), false;
    toast(r.message);
    return true;
  };
  return (
    <Sheet title="Workflow settings" onClose={onClose}>
      <div className="w-row">
        <span style={{ flex: 1 }}>
          <b>{w.on ? "On" : "Paused"}</b>
          <span className="w-help" style={{ display: "block" }}>
            {w.live ? "Paused, nothing runs or spends." : "Make it live first."}
          </span>
        </span>
        <Switch on={w.on} disabled={!w.live} label="Workflow on" set={(v) => void post({ op: "on", id, on: v }).then((ok) => ok && onChanged())} />
      </div>
      <div className="w-row">
        <span style={{ flex: 1 }}>Tell me when a run fails</span>
        <span className="m-small">{w.notifyOnFail ? "On" : "Off"}</span>
      </div>
      <p className="w-help">Three failed runs in a row turn it off, and the bell says so. The last {w.versions.length ? `${w.versions.length + 1} versions are` : "version is"} kept.</p>
      <button type="button" className="m-btn m-btn-sm m-btn-ghost w-btn-danger" onClick={() => window.confirm("Remove this workflow? Its runs stay in the log for 90 days.") && void post({ op: "remove", id }).then((ok) => ok && onGone())}>
        <WIc n="trash" /> Remove workflow
      </button>
    </Sheet>
  );
}

/** A sample opportunity through all four stages: what it would cost, and the draft to approve. Nothing spent or sent. */
function TestSheet({ run, ver, cfg, onClose }: { run: GraphRun; ver: GraphVersion | null; cfg: SimpleCfg | null; onClose: () => void }) {
  const byNode = new Map(run.nodes.map((n) => [n.node, n]));
  const stageOf = (id: string): number => (id === "s_trigger" ? 1 : ["s_open", "s_dm", "s_way", "s_draft"].includes(id) ? 2 : id === "s_send" ? 3 : 4);
  const nodes = (ver?.nodes ?? []).filter((n) => byNode.has(n.id));
  const wouldSpend = run.nodes.reduce((s, n) => s + (typeof n.output?.["Would spend"] === "number" ? (n.output["Would spend"] as number) : 0), 0);
  const draft = run.nodes.find((n) => n.output && typeof n.output["Draft body"] === "string");
  const stages = cfg ? stageRows(cfg) : null;
  const icon = (s: string): WIconName => (s === "done" ? "check" : s === "waiting" ? "clock" : s === "failed" ? "x" : "stop");
  const groups = [1, 2, 3, 4].map((k) => nodes.filter((n) => (cfg ? stageOf(n.id) === k : k === 2)));
  return (
    <Sheet title="Test run" onClose={onClose} lg>
      <div className="wfs-cap wf3-testcap">
        <WIc n="check" className="w-ic" />
        <span>
          <b>A sample opportunity, through every stage. Nothing was spent or sent.</b> {wouldSpend ? `A live run would spend ${creditWords(wouldSpend)} here.` : "A live run would spend nothing here."}
        </span>
      </div>
      <ol className="wf3-test">
        {(stages ?? [{ n: "", cls: "g2", kicker: "Steps", lines: [] }]).map((s, i) => (
          <li key={s.n || i} className={s.cls}>
            <span className="wf3-mn">{s.n || "·"}</span>
            <div>
              <b>{s.kicker}</b>
              <ul>
                {(cfg ? groups[i] : nodes).map((n: GNode) => {
                  const r = byNode.get(n.id)!;
                  return (
                    <li key={n.id} className={`wf3-ts ${r.status}`}>
                      <WIc n={icon(r.status)} />
                      <span>
                        <b>{n.name}</b> {r.note}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {cfg && s.n === "04" && !groups[3].length && (
                <ul>
                  {s.lines.map((l) => (
                    <li key={l} className="wf3-ts skipped">
                      <WIc n="clock" />
                      <span>
                        <b>{l}</b> After your tap. A test stops at the approval.
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {s.n === "03" && draft && (
                <div className="wf3-draft">
                  <span className="w-kicker">The draft you would approve</span>
                  <b>{String(draft.output!["Draft subject"] ?? "")}</b>
                  <p>{String(draft.output!["Draft body"] ?? "")}</p>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

/* ---------------- runs ---------------- */

function Runs({ id, reload, catalog }: { id: string; reload: () => Promise<unknown>; catalog: CatItem[] }) {
  const toast = useToast();
  const c = useApp();
  const [rows, setRows] = useState<RunRow[] | null>(null);
  const [filter, setFilter] = useState<"all" | "waiting" | "failed" | "done">("all");
  const [open, setOpen] = useState<GraphRun | null>(null);
  const load = useCallback(async () => {
    const r = await wf<{ runs: RunRow[] }>("GET", `?id=${encodeURIComponent(id)}&runs=1`);
    if (r.error) return toast(r.error, true);
    setRows(r.runs);
  }, [id, toast]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (body: Record<string, unknown>) => {
    const r = await wf<{ message: string }>("POST", "", body);
    toast(r.error ?? r.message, !!r.error);
    await load();
    void reload();
  };
  const show = async (r: RunRow) => {
    const x = await wf<{ run: GraphRun }>("GET", `?id=${encodeURIComponent(id)}&run=${encodeURIComponent(r.id)}`);
    if (x.error) return toast(x.error, true);
    setOpen(x.run);
  };
  const list = useMemo(() => (rows ?? []).filter((r) => filter === "all" || (filter === "waiting" ? r.status === "waiting" : filter === "failed" ? r.status === "failed" : r.status === "done")), [rows, filter]);
  if (!rows) return <Skel rows={3} />;
  if (!rows.length) return <div className="pr3-empty"><b className="w-h4">No runs yet</b><p className="w-help">Runs show here once it is live and Merlin sees the moment, or when you test it.</p></div>;
  const TONE: Record<string, Tone> = { waiting: "hot", failed: "hot", done: "forest", running: "co", stopped: "" };
  return (
    <>
      <Chips items={[{ k: "all", label: "All", n: rows.length }, { k: "waiting", label: "Waiting for you", n: rows.filter((r) => r.status === "waiting").length }, { k: "failed", label: "Failed", n: rows.filter((r) => r.status === "failed").length }, { k: "done", label: "Done", n: rows.filter((r) => r.status === "done").length }]} on={filter} set={setFilter} />
      <div className="m-table wf-runs-t" role="table" aria-label="Runs">
        {list.map((r) => (
          <div key={r.id} className="m-tr" role="row" onClick={() => void show(r)}>
            <div className="m-co" role="cell">
              <div style={{ minWidth: 0 }}>
                <div className="m-name">
                  <span>{r.line}</span>
                </div>
                <small>
                  {new Date(r.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  {r.test ? " · Test" : ""} · spent {creditWords(r.spent)}
                </small>
              </div>
            </div>
            <span role="cell">
              <St tone={TONE[r.status] ?? ""}>{r.status === "waiting" ? (r.waiting === "send" ? "Waiting for your tap" : r.waiting === "cap" ? "At your monthly limit" : r.waiting === "limit" ? "At your daily limit" : r.waiting === "ask" ? "Asks you" : "Waiting") : r.status === "failed" ? "Failed" : r.status === "done" ? "Done" : r.status === "stopped" ? "Stopped" : "Running"}</St>
            </span>
            <div className="m-rowact w-racts m-ph-z" onClick={(e) => e.stopPropagation()}>
              {r.status === "waiting" && (r.waiting === "cap" || r.waiting === "limit" || r.waiting === "ask") && (
                <>
                  <button type="button" className="m-btn m-btn-sm m-btn-primary" onClick={() => void act({ op: "answer", run: r.id, yes: true })}>
                    {r.waiting === "ask" ? "Yes" : "Say yes"}
                  </button>
                  <button type="button" className="m-btn m-btn-sm m-btn-ghost" onClick={() => void act({ op: "answer", run: r.id, yes: false })}>
                    {r.waiting === "ask" ? "No" : "Skip"}
                  </button>
                </>
              )}
              {r.status === "waiting" && r.waiting === "send" && (
                <button type="button" className="m-btn m-btn-sm m-btn-primary" onClick={() => c.openPage("messages")}>
                  Review the draft
                </button>
              )}
              {r.status === "failed" && (
                <button type="button" className="m-btn m-btn-sm m-btn-secondary" onClick={() => void act({ op: "retry", id, run: r.id })}>
                  Retry from here
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {open && (
        <Sheet title="One run" onClose={() => setOpen(null)} lg>
          <p className="w-help">
            {open.line} · quoted {creditWords(open.quote)}, spent {creditWords(open.spent)}
          </p>
          <ul className="wf3-test-list">
            {open.nodes.map((n, i) => (
              <li key={i} className={`wf3-ts ${n.status}`}>
                <WIc n={n.status === "done" ? "check" : n.status === "waiting" ? "clock" : n.status === "failed" ? "x" : "stop"} />
                <span>
                  <b>{catalog.find((x) => x.type === n.type)?.name ?? "A step"}</b> {n.note}
                  {n.credits ? ` · ${creditWords(n.credits)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}
