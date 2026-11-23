"use client";

/**
 * Workflows (Beta, Stage 7b, behind RN_WORKFLOWS): the Alerts page's Workflows tab, from the
 * Workflows tab of Alerts.dc.html. GET /api/table?workflows=1 (lib/workflows WorkflowsAnswer); every
 * change is a POST action "workflow.*". Off ({ on: false }): the tab says Coming soon · Beta, as before.
 *
 *   the table      each workflow in plain words, its steps with what each costs, runs and credits in 30
 *                  days, its last run, its switch, Edit, and Runs: each run with its time, what set it
 *                  off (a locked company described, never named), each step done, waiting or skipped,
 *                  and what it spent; a run waiting at its monthly limit says "Say yes · N credits"
 *   recipes        starter workflows; Use this opens the builder prefilled. Nothing is on until turned on
 *   the builder    When this happens, Watching, Then do this, What a run costs (each step's price and the
 *                  most a run can spend, before it is on), the monthly limit and the warning
 *   drafts         Messages shows the notes workflows drafted (WorkflowDrafts): drafts only, never sent
 * No export anywhere: nothing here downloads.
 */
import { useCallback, useEffect, useState } from "react";
import { errorText, IconX, useToast } from "../../ui/shared";
import { openPlans } from "../Billing";
import {
  RECIPES, REMIND_DAYS, STEPS, STEP_ORDER, TRIGGERS, costWords, creditWords, runCeiling, sayFlow, sortSteps,
  type FlowRow, type RunRow, type WfDraft, type WfScope, type WfScopeKind, type WfStep, type WfStepKey, type WfTrigger, type WorkflowsAnswer, type WorkflowsView,
} from "@/lib/workflows/types";
import { whenWords } from "./model";
import "./alerts.css";

/* ---------- the server ---------- */

async function call<T>(url: string, body?: unknown): Promise<T | { error: string }> {
  try {
    const r = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return r.ok ? (j as T) : { error: errorText(r.status, (j as { error?: string }).error, "That didn't go through. Try again.") };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}
const isErr = (x: unknown): x is { error: string } => !!x && typeof x === "object" && "error" in x;

/** The Workflows tab's data and its one action call. */
export function useWorkflows() {
  const toast = useToast();
  const [v, setV] = useState<WorkflowsAnswer | null>(null);
  const load = useCallback(() => void call<WorkflowsAnswer>("/api/table?workflows=1").then((r) => !isErr(r) && setV(r)), []);
  useEffect(() => load(), [load]);
  const act = useCallback(
    async (action: Record<string, unknown>) => {
      const r = await call<{ message?: string; workflows?: WorkflowsAnswer }>("/api/table", { action });
      if (isErr(r)) {
        toast(r.error, true);
        return false;
      }
      if (r.workflows) setV(r.workflows);
      else load();
      if (r.message) toast(r.message);
      return true;
    },
    [toast, load],
  );
  return { v, on: !!v && v.on, view: v && v.on ? (v as WorkflowsView) : null, load, act };
}

/* ---------- small parts ---------- */

const COST = (paid: boolean) => `wf-cost${paid ? "" : " free"}`;
const stepLabel = (st: WfStep) => (st.key === "remind" ? `Remind me in ${st.days ?? REMIND_DAYS.default} ${(st.days ?? 2) === 1 ? "day" : "days"}` : STEPS[st.key].name);
const scopeName = (sc: WfScope, lists: { id: string; name: string }[]) =>
  sc.kind === "list" ? `List: ${lists.find((l) => l.id === sc.list)?.name ?? "a list you removed"}` : sc.kind === "radar" ? "Your Crystal Ball" : sc.kind === "follows" ? "Companies you follow" : sc.kind === "contacts" ? "Your own contacts" : "Every proposal you send";

/** The header's pills: credits workflows spent in 30 days, runs waiting for a yes. */
export function WorkflowPills({ v, onWaiting, creditsHref }: { v: WorkflowsView; onWaiting: () => void; creditsHref: () => void }) {
  return (
    <>
      {v.waiting > 0 && (
        <button type="button" className="wf-pill" onClick={onWaiting}>
          <span className="wf-hot" aria-hidden />
          <strong>{v.waiting}</strong> {v.waiting === 1 ? "run waiting for your yes" : "runs waiting for your yes"}
        </button>
      )}
      <button type="button" className="wf-pill" onClick={creditsHref}>
        <strong>{v.spent30}</strong> credits spent by workflows in 30 days
      </button>
    </>
  );
}

/* ---------- the builder's state ---------- */

export interface WfBuild {
  id: string;
  name: string;
  trigger: WfTrigger;
  scope: WfScope;
  steps: WfStep[];
  cap: number | null;
  warn: number | null;
}
export const fromRow = (f: FlowRow): WfBuild => ({ id: f.id, name: f.name, trigger: f.trigger, scope: f.scope, steps: f.steps, cap: f.cap, warn: f.warn });
const defaultScope = (t: WfTrigger, v: WorkflowsView | null, kind?: WfScopeKind): WfScope => {
  const k = kind && TRIGGERS[t].scopes.includes(kind) ? kind : TRIGGERS[t].scopes[0];
  return k === "list" ? { kind: "list", list: v?.lists[0]?.id ?? "" } : { kind: k };
};
export const fromRecipe = (key: string, v: WorkflowsView | null): WfBuild => {
  const r = RECIPES.find((x) => x.key === key) ?? RECIPES[0];
  return { id: "", name: "", trigger: r.trigger, scope: defaultScope(r.trigger, v, r.scope), steps: r.steps, cap: null, warn: null };
};
export const blankBuild = (v: WorkflowsView | null): WfBuild => fromRecipe("seat-pipe-way", v);

/* ---------- the tab ---------- */

export function WorkflowsTab({
  v,
  act,
  open,
  setOpen,
  onBuild,
  openCompany,
}: {
  v: WorkflowsView;
  act: (a: Record<string, unknown>) => Promise<boolean>;
  /** The workflow whose runs are open. */
  open: string | null;
  setOpen: (id: string | null) => void;
  onBuild: (b: WfBuild) => void;
  openCompany: (pub: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (a: Record<string, unknown>) => {
    setBusy(true);
    try {
      await act(a);
    } finally {
      setBusy(false);
    }
  };
  const nowMs = Date.now();
  const first = !v.flows.length;
  const nOn = v.flows.filter((f) => f.on).length;
  const spentAll = v.flows.reduce((n, f) => n + f.spent30, 0);
  const runs30 = v.flows.reduce((n, f) => n + f.runs30, 0);
  const lastAt = v.flows.map((f) => f.last).filter(Boolean).sort().pop() ?? null;
  const used = new Set(v.flows.map((f) => `${f.trigger}|${f.steps.map((s) => s.key).join(",")}`));
  const recipes = RECIPES.filter((r) => !used.has(`${r.trigger}|${sortSteps(r.steps).map((s) => s.key).join(",")}`) && (v.funding || !TRIGGERS[r.trigger].funding));
  const gallery = (
    <section className="al-gallery wf-gallery" aria-labelledby="wf-gal-h">
      <div className="al-gallery-head">
        <h2 id="wf-gal-h">{first ? "Start with a recipe" : "More recipes"}</h2>
        <span>Each says what it does and what a run costs. Nothing is on until you turn it on.</span>
      </div>
      <div className="al-cards">
        {recipes.map((r) => {
          const ceiling = runCeiling(r.steps, { kind: r.scope }, v.prices).total;
          const plan = TRIGGERS[r.trigger].plan ?? (r.steps.some((s) => STEPS[s.key].close) ? "Close" : r.steps.some((s) => STEPS[s.key].paid) ? "Pro" : null);
          const held = plan === "Close" ? !v.plan.proposals : plan === "Pro" ? !v.plan.paid : false;
          const say = sayFlow({ trigger: r.trigger, scope: { kind: r.scope }, steps: r.steps });
          return (
            <div key={r.key} className="al-card">
              <strong>{say}</strong>
              <span className="al-card-foot">
                <span className="al-pill">WORKFLOW</span>
                <span className={`al-cost${ceiling ? "" : " free"}`}>{costWords(ceiling)}</span>
                {plan && <span className="al-gate">{plan}</span>}
                <button type="button" className="btn btn-sm btn-outline al-use" aria-label={`Use this recipe: ${say}`} onClick={() => (held ? openPlans("radar") : onBuild(fromRecipe(r.key, v)))}>
                  Use this
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
  return (
    <>
      {first && gallery}
      <section aria-label="Workflows" className="wf-wrap">
        <div role="table" aria-label="Workflows" className="wf-table">
          <div role="row" className="wf-row wf-head">
            <Head name="Workflow, in plain words" fill={first ? "None yet" : `${v.flows.length} ${v.flows.length === 1 ? "workflow" : "workflows"}`} />
            <Head name="Runs" fill={runs30 ? `${runs30} in 30 days` : "None yet"} />
            <Head name="Credits" fill={spentAll ? `${spentAll} spent` : "None spent"} />
            <Head name="Last run" fill={lastAt ? whenWords(lastAt, nowMs) : "None yet"} />
            <Head name="On" fill={`${nOn} of ${v.flows.length}`} />
            <span role="columnheader" className="al-h" />
          </div>
          {first && (
            <div role="row" className="wf-row wf-empty">
              <span role="cell">No workflow yet. Pick a recipe above, or New workflow. A workflow only spends credits on a step that shows a price, and you can set a monthly limit.</span>
            </div>
          )}
          {v.flows.map((f) => (
            <FlowRowView key={f.id} f={f} v={v} busy={busy} open={open === f.id} toggle={() => setOpen(open === f.id ? null : f.id)} onEdit={() => onBuild(fromRow(f))} act={run} openCompany={openCompany} nowMs={nowMs} />
          ))}
        </div>
      </section>
      {!first && recipes.length > 0 && gallery}
    </>
  );
}

function Head({ name, fill }: { name: string; fill: string }) {
  return (
    <span role="columnheader" className="al-h">
      <span className="al-h-n">{name}</span>
      <span className="al-h-f">{fill}</span>
    </span>
  );
}

function FlowRowView({ f, v, busy, open, toggle, onEdit, act, openCompany, nowMs }: { f: FlowRow; v: WorkflowsView; busy: boolean; open: boolean; toggle: () => void; onEdit: () => void; act: (a: Record<string, unknown>) => Promise<void>; openCompany: (pub: string) => void; nowMs: number }) {
  const ceil = runCeiling(f.steps, f.scope, v.prices);
  const runs = v.runs.filter((r) => r.wf === f.id);
  const held = f.holds.trigger ?? Object.values(f.holds.steps)[0] ?? null;
  return (
    <>
      <div role="row" className={`wf-row${f.on ? "" : " off"}`}>
        <span role="cell" className="wf-c-name">
          <span className="wf-say">
            <strong>{f.say}</strong>
            {f.waiting > 0 && <span className="al-tag wf-wait">{f.waiting} waiting</span>}
            {held && <span className="al-gate">{held}</span>}
          </span>
          <span className="al-sub">
            {scopeName(f.scope, v.lists)}
            {f.cap !== null ? ` · Stops at ${creditWords(f.cap)} a month` : ""}
            {f.warn !== null ? ` · Tells you past ${creditWords(f.warn)}` : ""}
          </span>
          <span className="wf-steps">
            {sortSteps(f.steps).map((s) => (
              <span key={s.key} className={COST(STEPS[s.key].paid && (ceil.per[s.key] ?? 0) > 0)}>
                {stepLabel(s)}
                {STEPS[s.key].paid && (ceil.per[s.key] ?? 0) > 0 ? ` · up to ${ceil.per[s.key]}` : ""}
              </span>
            ))}
          </span>
        </span>
        <span role="cell" className="wf-c-n">
          <span>{f.runs30 ? `${f.runs30} ${f.runs30 === 1 ? "run" : "runs"}` : "None"}</span>
          <span className="al-sub">in the last 30 days</span>
        </span>
        <span role="cell" className="wf-c-n">
          <span>{f.spent30 ? creditWords(f.spent30) : "None"}</span>
          <span className="al-sub">{ceil.total ? `up to ${ceil.total} a run` : "every step is free"}</span>
        </span>
        <span role="cell" className="wf-c-n">
          <span>{f.last ? whenWords(f.last, nowMs) : "Not yet"}</span>
          <span className="al-sub">{f.spentMonth ? `${creditWords(f.spentMonth)} this month` : "Nothing spent this month"}</span>
        </span>
        <span role="cell" className="wf-c-on">
          <button type="button" role="switch" aria-checked={f.on} aria-label={`${f.on ? "Turn off" : "Turn on"} the workflow: ${f.say}`} className={`al-switch${f.on ? " on" : ""}`} disabled={busy} onClick={() => void act({ type: "workflow.on", id: f.id, on: !f.on })}>
            <span className="al-switch-track" aria-hidden>
              <span className="al-switch-knob" />
            </span>
            <span className="al-switch-l">{f.on ? "On" : "Off"}</span>
          </button>
        </span>
        <span role="cell" className="wf-c-acts">
          <button type="button" className="btn btn-sm wf-edit" aria-label={`Edit the workflow: ${f.say}`} onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="btn btn-sm wf-edit" aria-expanded={open} aria-label={`Run history for: ${f.say}`} onClick={toggle}>
            Runs
          </button>
        </span>
      </div>
      {open && (
        <div role="row" className="wf-hist-row">
          <div role="cell" className="wf-hist">
            <span className="al-kicker">{runs.length ? `RUN HISTORY${runs.length >= 60 ? " · LATEST 60" : ""}` : "RUN HISTORY"}</span>
            {runs.length ? runs.map((r) => <RunLine key={r.id} r={r} busy={busy} act={act} openCompany={openCompany} nowMs={nowMs} />) : <span className="wf-none">No runs yet. The first one shows here with what it did, what it found and what it cost.</span>}
          </div>
        </div>
      )}
    </>
  );
}

const STATUS_WORDS = { done: "Done", waiting: "Waiting", skipped: "Skipped" } as const;

export function RunLine({ r, busy, act, openCompany, nowMs }: { r: RunRow; busy: boolean; act: (a: Record<string, unknown>) => Promise<void>; openCompany: (pub: string) => void; nowMs: number }) {
  const wait = !!r.ask && !r.ask.answer;
  return (
    <div className={`wf-run${wait ? " wait" : ""}`}>
      <span className="wf-run-when">{whenWords(r.at, nowMs)}</span>
      <span className="wf-run-main">
        {r.company ? (
          <button type="button" className="wf-run-line" onClick={() => openCompany(r.company!)}>
            {r.line}
          </button>
        ) : (
          <span className="wf-run-line plain">{r.line}</span>
        )}
        <span className="wf-run-steps">
          {r.steps.map((s) => (
            <span key={s.key} className={`wf-st ${s.status}`} title={s.note}>
              <span className="sr-only">{STATUS_WORDS[s.status]}: </span>
              {STEPS[s.key].name}
              {s.credits ? ` · ${creditWords(s.credits)}` : ""}
            </span>
          ))}
        </span>
        <span className="wf-run-notes">{r.steps.filter((s) => s.note).map((s) => s.note).filter((x, i, a) => a.indexOf(x) === i).slice(0, 3).join(" ")}</span>
      </span>
      <span className="wf-run-cr">{r.spent ? creditWords(r.spent) : wait ? "Nothing yet" : "No credits"}</span>
      <span className="wf-run-act">
        {wait ? (
          <>
            <button type="button" className="btn btn-sm btn-pine" disabled={busy} onClick={() => void act({ type: "workflow.approve", run: r.id, yes: true })}>
              Say yes · {creditWords(r.ask!.credits)}
            </button>
            <button type="button" className="btn btn-sm wf-edit" disabled={busy} onClick={() => void act({ type: "workflow.approve", run: r.id, yes: false })}>
              No
            </button>
          </>
        ) : (
          <span className={`wf-st ${r.ask?.answer === "no" ? "skipped" : r.steps.some((s) => s.status === "skipped") && !r.steps.some((s) => s.status === "done") ? "skipped" : "done"}`}>
            {r.ask?.answer === "yes" ? "You said yes" : r.ask?.answer === "no" ? "You said no" : r.steps.some((s) => s.status === "done") ? "Ran" : "Nothing to do"}
          </span>
        )}
      </span>
    </div>
  );
}

/* ---------- the builder ---------- */

const CAPS: (number | null)[] = [null, 10, 25, 50];
const WARNS: (number | null)[] = [null, 5, 10, 20];

export function WorkflowBuilder({ b, set, v, busy, onClose, onSave, onRemove }: { b: WfBuild; set: (b: WfBuild) => void; v: WorkflowsView; busy: boolean; onClose: () => void; onSave: () => void; onRemove: () => void }) {
  const info = TRIGGERS[b.trigger];
  const listName = b.scope.kind === "list" ? v.lists.find((l) => l.id === b.scope.list)?.name ?? null : null;
  const fits = STEP_ORDER.filter((k) => STEPS[k].fits.includes(b.trigger));
  const has = (k: WfStepKey) => b.steps.some((s) => s.key === k);
  const ceil = runCeiling(b.steps, b.scope, v.prices);
  const stepHeld = (k: WfStepKey) => (STEPS[k].close && !v.plan.evidence ? "Close" : STEPS[k].paid && !v.plan.paid ? "Pro" : null);
  const trigHeld = (t: WfTrigger) => (TRIGGERS[t].plan === "Close" && !v.plan.proposals ? "Close" : null);
  const pick = (t: WfTrigger) => {
    if (trigHeld(t)) return openPlans("radar");
    const keep = b.steps.filter((s) => STEPS[s.key].fits.includes(t));
    set({ ...b, trigger: t, scope: TRIGGERS[t].scopes.includes(b.scope.kind) ? b.scope : defaultScope(t, v), steps: keep.length ? keep : [{ key: "tell" }] });
  };
  const flip = (k: WfStepKey) => {
    if (stepHeld(k)) return openPlans("radar");
    set({ ...b, steps: has(k) ? b.steps.filter((s) => s.key !== k) : sortSteps([...b.steps, k === "remind" ? { key: k, days: REMIND_DAYS.default } : { key: k }]) });
  };
  const days = b.steps.find((s) => s.key === "remind")?.days ?? REMIND_DAYS.default;
  const lines: string[] = [];
  if (has("open") || has("dm") || has("draft")) {
    lines.push(
      b.scope.kind === "radar" && v.prices.ballFree
        ? "A company in your Crystal Ball opens free on your plan."
        : v.prices.opensLeft > 0
          ? `Opening a company is free on your plan, ${v.prices.opensLeft} left today. After that it is ${creditWords(v.prices.companyFull)}, so most runs cost less than this.`
          : `Opening a locked company is ${creditWords(v.prices.companyFull)}. A company already open to you costs nothing.`,
    );
  }
  if (has("dm")) lines.push(`Who decides: ${creditWords(v.prices.person)} for their name and title. Nothing when nobody is on file, or you have them already.`);
  if (has("draft")) lines.push("A note is a template in your voice: no credits. It waits in Messages as a draft. Nothing is sent.");
  lines.push(ceil.total ? `Each run is quoted just before it spends, and spends exactly that. Merlin's daily limits still apply. You have ${creditWords(v.credits)}.` : "Every step here is free. Nothing ever spends a credit.");
  const say = sayFlow(b, listName);
  const ready = b.steps.length > 0 && (b.scope.kind !== "list" || !!b.scope.list) && !trigHeld(b.trigger) && !b.steps.some((s) => stepHeld(s.key)) && !(info.funding && !v.funding);
  return (
    <aside id="wf-builder" className="al-b" aria-label="Workflow builder">
      <div className="al-b-top">
        <div>
          <span className="al-kicker">{b.id ? "EDIT" : "NEW"} · WORKFLOW · BETA</span>
          <strong>When this, then that</strong>
        </div>
        <button type="button" className="al-b-x" aria-label="Close the builder" onClick={onClose}>
          <IconX size={18} />
        </button>
      </div>
      <div className="al-b-sec">
        <span id="wf-b-w" className="al-b-h">
          1. When this happens
        </span>
        <div role="radiogroup" aria-labelledby="wf-b-w" className="al-b-tiles">
          {(Object.keys(TRIGGERS) as WfTrigger[])
            .filter((t) => v.funding || !TRIGGERS[t].funding)
            .map((t) => {
              const held = trigHeld(t);
              return (
                <button key={t} type="button" role="radio" aria-checked={b.trigger === t} className={`al-tile${b.trigger === t ? " on" : ""}`} onClick={() => pick(t)}>
                  <span>{TRIGGERS[t].name}</span>
                  {held && <span className="al-gate">{held}</span>}
                </button>
              );
            })}
        </div>
        <span className="al-sub">{info.detail}</span>
      </div>
      <div className="al-b-sec">
        <span id="wf-b-l" className="al-b-h">
          2. Watching
        </span>
        {info.scopes.length === 1 && info.scopes[0] !== "list" ? (
          <span className="al-sub">{info.scopes[0] === "contacts" ? (v.sources ? "Your own contacts: your LinkedIn file, contacts file and Google. They stay yours." : "Your own contacts, once you bring them in on Warm paths.") : "Every proposal and contract you send."}</span>
        ) : (
          <div role="radiogroup" aria-labelledby="wf-b-l" className="al-b-list">
            {info.scopes.includes("list") &&
              v.lists.map((l) => {
                const on = b.scope.kind === "list" && b.scope.list === l.id;
                return (
                  <button key={l.id} type="button" role="radio" aria-checked={on} className={`al-tile${on ? " on" : ""}`} onClick={() => set({ ...b, scope: { kind: "list", list: l.id } })}>
                    <span className={`al-dot${on ? " on" : ""}`} aria-hidden />
                    <span>{l.name}</span>
                    <span className="al-sub">List</span>
                  </button>
                );
              })}
            {(["radar", "follows"] as WfScopeKind[])
              .filter((k) => info.scopes.includes(k))
              .map((k) => {
                const on = b.scope.kind === k;
                return (
                  <button key={k} type="button" role="radio" aria-checked={on} className={`al-tile${on ? " on" : ""}`} onClick={() => set({ ...b, scope: { kind: k } })}>
                    <span className={`al-dot${on ? " on" : ""}`} aria-hidden />
                    <span>{k === "radar" ? "Your Crystal Ball" : "Companies you follow"}</span>
                  </button>
                );
              })}
            {info.scopes.includes("list") && !v.lists.length && <span className="al-sub wrap">Save a list in Find or on Companies to watch it here.</span>}
          </div>
        )}
      </div>
      <div className="al-b-sec">
        <span className="al-b-h">3. Then do this</span>
        {fits.map((k) => {
          const on = has(k);
          const held = stepHeld(k);
          const per = ceil.per[k];
          const price = held ? null : STEPS[k].paid ? (on ? (per ? `Up to ${creditWords(per)}` : "Free on your plan") : k === "draft" ? "Opens the company if locked" : k === "dm" ? `${creditWords(v.prices.person)}, plus the company if locked` : "Free on your plan, up to 15 a day") : "Free";
          return (
            <div key={k} className="wf-b-step">
              <button type="button" role="checkbox" aria-checked={on} className={`wf-check-row${on ? " on" : ""}`} onClick={() => flip(k)}>
                <span className={`al-check${on ? " on" : ""}`} aria-hidden>
                  {on && (
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </span>
                <span className="wf-b-step-t">
                  <span>{STEPS[k].name}</span>
                  <span className="al-sub wrap">{STEPS[k].sub}</span>
                </span>
                {held ? <span className="al-gate">{held}</span> : <span className={COST(STEPS[k].paid && !!per)}>{price}</span>}
              </button>
              {k === "remind" && on && (
                <label className="wf-days">
                  In
                  <select className="input" value={days} onChange={(e) => set({ ...b, steps: b.steps.map((s) => (s.key === "remind" ? { ...s, days: Number(e.target.value) } : s)) })}>
                    {[1, 2, 3, 5, 7, 14, 30].map((d) => (
                      <option key={d} value={d}>
                        {d} {d === 1 ? "day" : "days"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          );
        })}
      </div>
      <div className="al-b-cost">
        <span className="al-kicker">WHAT A RUN COSTS</span>
        <strong>{ceil.total ? costWords(ceil.total) : "Free. Every step is free."}</strong>
        {lines.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      {ceil.total > 0 && (
        <div className="al-b-sec">
          <span className="al-b-h">4. Credits</span>
          <span className="al-sub wrap">It spends on its own. Set a monthly limit and it stops there and asks you in the bell: Say yes, and the run goes on.</span>
          <div role="radiogroup" aria-label="Monthly limit" className="wf-chips">
            <span>Up to</span>
            {CAPS.map((c) => (
              <button key={String(c)} type="button" role="radio" aria-checked={b.cap === c} className={`al-chip${b.cap === c ? " on" : ""}`} onClick={() => set({ ...b, cap: c, warn: c !== null && b.warn !== null && b.warn >= c ? null : b.warn })}>
                {c === null ? "No limit" : c}
              </button>
            ))}
            <span>credits a month</span>
          </div>
          <div role="radiogroup" aria-label="Warning" className="wf-chips">
            <span>Tell me before it passes</span>
            {WARNS.map((w) => {
              const bad = w !== null && b.cap !== null && w >= b.cap;
              return (
                <button key={String(w)} type="button" role="radio" aria-checked={b.warn === w} disabled={bad} className={`al-chip${b.warn === w ? " on" : ""}`} onClick={() => set({ ...b, warn: w })}>
                  {w === null ? "Off" : w}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="al-b-foot">
        <strong>{say}</strong>
        <div className="al-b-go">
          <span className="al-sub">{ready ? (ceil.total ? `${costWords(ceil.total)}. Turn it off any time.` : "Free. Turn it off any time.") : info.funding && !v.funding ? "Funding filings aren't switched on yet." : "Pick what it watches and one thing to do."}</span>
          {b.id && (
            <button type="button" className="btn btn-sm wf-edit" disabled={busy} onClick={onRemove}>
              Remove
            </button>
          )}
          <button type="button" className="btn btn-pine" disabled={busy || !ready} onClick={onSave}>
            {b.id ? "Save" : "Turn it on"}
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ---------- Messages: the notes workflows drafted ---------- */

/** In Messages, above the conversations: the notes workflows drafted. Drafts only: Copy, and Remove. Nothing here sends. */
export function WorkflowDrafts({ openCompany }: { openCompany: (pub: string) => void }) {
  const toast = useToast();
  const [list, setList] = useState<(WfDraft & { name: string })[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    void call<{ drafts?: (WfDraft & { name: string })[] }>("/api/table?workflows=drafts").then((r) => !isErr(r) && setList(r.drafts ?? null));
  }, []);
  if (!list?.length) return null;
  const copy = async (d: WfDraft) => {
    try {
      await navigator.clipboard.writeText(`${d.subject}\n\n${d.body}`);
      toast("Copied. Paste it where you write to them.");
    } catch {
      toast("Your browser didn't let Merlin copy. Select the text and copy it.", true);
    }
  };
  const remove = async (id: string) => {
    const r = await call<unknown>("/api/table", { action: { type: "workflow.draftRemove", id } });
    if (isErr(r)) return toast(r.error, true);
    setList((x) => (x ?? []).filter((d) => d.id !== id));
  };
  return (
    <section className="wf-drafts" aria-label="Drafts from your workflows">
      <div className="wf-drafts-h">
        <strong>Drafts from your workflows</strong>
        <span className="al-sub">Never sent. Copy one to use it.</span>
      </div>
      <ul>
        {list.slice(0, 5).map((d) => (
          <li key={d.id}>
            <button type="button" className="wf-draft" aria-expanded={open === d.id} onClick={() => setOpen(open === d.id ? null : d.id)}>
              <span className="wf-draft-s">{d.subject}</span>
              <span className="al-sub">
                {d.companyName} · <span className="ms2-tag">Draft</span>
              </span>
            </button>
            {open === d.id && (
              <div className="wf-draft-body">
                <pre>{d.body}</pre>
                <span className="wf-draft-acts">
                  <button type="button" className="btn btn-sm btn-pine" onClick={() => void copy(d)}>
                    Copy
                  </button>
                  <button type="button" className="btn btn-sm wf-edit" onClick={() => openCompany(d.company)}>
                    Open the company
                  </button>
                  <button type="button" className="tp-flink" onClick={() => void remove(d.id)}>
                    Remove
                  </button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

