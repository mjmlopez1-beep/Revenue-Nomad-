"use client";

/**
 * Pilot metrics: the Automatic jobs card (lib/jobs.ts jobsPanel, GET /api/jobs). One row per
 * background job: what it does, how often it runs (a select the owner changes, saved on the
 * server), how the last run went, when the next one starts, and "Run now". A job its env switch
 * keeps off says which switch, and can't be scheduled. Times are in the viewer's time zone; the
 * server keeps the hour in UTC. While a job runs the card reads its rows again every few seconds.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Action } from "@/lib/tableTypes";
import { CADENCES, CADENCE_PHRASE, CADENCE_WORDS, type Cadence, type JobId, type JobRow, type JobsPanel } from "@/lib/schedule";
import { useToast } from "../ui/shared";
import { useUi } from "./ui";

const DAY = 24 * 60 * 60 * 1000;
/** The hours UTC in the order the viewer's clock reads them, midnight first. */
const localHour = (h: number) => {
  const d = new Date();
  d.setUTCHours(h, 0, 0, 0);
  return d.getHours() * 60 + d.getMinutes();
};
const clock = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
/** "Today 1:02 PM", "Yesterday 6:01 AM", "Tomorrow 9:00 AM", else "Mon, Nov 16, 12:00 PM". In the viewer's time zone. */
export function when(iso: string, nowMs = Date.now()): string {
  const d = new Date(iso);
  const day = (ms: number) => new Date(ms).toDateString();
  if (day(d.getTime()) === day(nowMs)) return `Today ${clock(d)}`;
  if (day(d.getTime()) === day(nowMs - DAY)) return `Yesterday ${clock(d)}`;
  if (day(d.getTime()) === day(nowMs + DAY)) return `Tomorrow ${clock(d)}`;
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${clock(d)}`;
}
/** An hour UTC as the viewer's clock reads it today ("8:00 AM"). */
const hourLabel = (h: number) => {
  const d = new Date();
  d.setUTCHours(h, 0, 0, 0);
  return clock(d);
};

/** "Run now": the action each job had before this card (the funding filings got one here). */
async function runNow(job: JobId, act: (a: Action) => Promise<{ ok: boolean }>, toast: (m: string, bad?: boolean) => void): Promise<boolean> {
  if (job === "scan") return (await act({ type: "scanNow" })).ok;
  if (job === "about") return (await act({ type: "aboutNow" })).ok;
  if (job === "leaders") return (await act({ type: "leadersNow", scope: "next" })).ok;
  const [url, body] = job === "radar" ? ["/api/radar", { op: "send" }] : ["/api/jobs", { op: "run", job }];
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    toast(j.message || j.error || (res.ok ? "Started." : "That didn't go through. Try again."), !res.ok);
    return res.ok;
  } catch {
    toast("We couldn't reach Merlin. Check your connection and try again.", true);
    return false;
  }
}

function nextText(r: JobRow, timerOn: boolean, nowMs: number): string {
  if (r.off) return "Not scheduled";
  if (r.running) return "Running now";
  if (!r.nextAt) return "Not scheduled";
  if (Date.parse(r.nextAt) <= nowMs + 60_000) return timerOn ? "Within 5 minutes" : "On the next visit to Merlin";
  return when(r.nextAt, nowMs);
}

function Row({ r, timerOn, onChange, onRun, busy }: { r: JobRow; timerOn: boolean; onChange: (every: Cadence, hourUtc: number) => void; onRun: () => void; busy: boolean }) {
  const nowMs = Date.now();
  const hours = Array.from({ length: 24 }, (_, h) => h).sort((a, b) => localHour(a) - localHour(b));
  const id = `job-${r.id}`;
  return (
    <li className="tp-jobs-row">
      <div className="tp-jobs-what">
        <span className="tp-jobs-name" id={`${id}-name`}>
          {r.name}
        </span>
        <span className="tp-jobs-desc">{r.what}</span>
      </div>
      <div className="tp-jobs-cell">
        <span className="tp-jobs-l">How often</span>
        {r.off ? (
          <span className="tp-jobs-off">{r.off}</span>
        ) : (
          <span className="tp-jobs-pick">
            <select className="select tp-pm-select" aria-label={`How often ${r.name} runs`} value={r.every} disabled={busy} onChange={(e) => onChange(e.target.value as Cadence, r.hourUtc)}>
              {CADENCES.map((c) => (
                <option key={c} value={c}>
                  {CADENCE_WORDS[c]}
                </option>
              ))}
            </select>
            {r.every !== "off" && (
              <select className="select tp-pm-select" aria-label={`What time ${r.name} starts`} value={r.hourUtc} disabled={busy} onChange={(e) => onChange(r.every, Number(e.target.value))}>
                {hours.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            )}
          </span>
        )}
      </div>
      <div className="tp-jobs-cell">
        <span className="tp-jobs-l">Last run</span>
        {r.lastAt ? (
          <span className={r.lastFailed ? "tp-jobs-bad" : undefined}>
            {when(r.lastAt, nowMs)}
            {r.lastNote ? ` · ${r.lastNote}` : ""}
          </span>
        ) : (
          <span className="tp-jobs-none">Not yet</span>
        )}
      </div>
      <div className="tp-jobs-cell">
        <span className="tp-jobs-l">Next run</span>
        <span className={r.running ? "tp-jobs-live" : !r.nextAt || r.off ? "tp-jobs-none" : undefined}>{nextText(r, timerOn, nowMs)}</span>
      </div>
      <div className="tp-jobs-act">
        <button type="button" className="btn btn-sm btn-pine" disabled={busy || !r.canRun} aria-busy={busy} aria-describedby={`${id}-name`} title={r.cantRun} onClick={onRun}>
          {r.running ? "Running" : "Run now"}
        </button>
      </div>
    </li>
  );
}

export function AutoJobs({ refresh }: { refresh: () => Promise<void> }) {
  const ui = useUi();
  const toast = useToast();
  const [panel, setPanel] = useState<JobsPanel | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<JobId | null>(null);
  /** Read again every few seconds until this time (after "Run now"), and while anything runs. */
  const [watchUntil, setWatchUntil] = useState(0);
  const wasRunning = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setPanel((await res.json()) as JobsPanel);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const anyRunning = !!panel?.jobs.some((j) => j.running);
  useEffect(() => {
    // A run just ended: the other cards' numbers moved too.
    if (wasRunning.current && !anyRunning) void refresh();
    wasRunning.current = anyRunning;
    if (!anyRunning && Date.now() > watchUntil) return;
    // While a job runs, the view is read again too, so the job's own card shows its counts as it goes.
    const t = setTimeout(() => void Promise.all([load(), anyRunning ? refresh() : null]), 5000);
    return () => clearTimeout(t);
  }, [panel, anyRunning, watchUntil, load, refresh]);

  const change = async (r: JobRow, every: Cadence, hourUtc: number) => {
    setBusy(r.id);
    try {
      const res = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "cadence", job: r.id, every, hourUtc }) });
      const j = (await res.json().catch(() => ({}))) as { job?: JobRow; error?: string };
      if (!res.ok || !j.job) toast(j.error || "That didn't save. Try again.", true);
      else {
        const row = j.job;
        setPanel((p) => (p ? { ...p, jobs: p.jobs.map((x) => (x.id === row.id ? row : x)) } : p));
        toast(every === "off" ? `${r.name} won't run on its own now. Run now still works.` : `${r.name} now runs ${CADENCE_PHRASE[every]} at ${hourLabel(hourUtc)}.`);
      }
    } catch {
      toast("We couldn't reach Merlin. Check your connection and try again.", true);
    } finally {
      setBusy(null);
    }
  };

  const run = async (r: JobRow) => {
    setBusy(r.id);
    try {
      if (await runNow(r.id, (a) => ui.act(a), toast)) {
        setWatchUntil(Date.now() + 3 * 60_000);
        await new Promise((ok) => setTimeout(ok, 1200));
        await load();
        await refresh();
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="tp-card tp-pm-card tp-pm-span6 tp-jobs" aria-labelledby="tp-jobs-h">
      <div className="tp-pm-card-top">
        <h2 className="tp-card-h" id="tp-jobs-h">
          Automatic jobs
        </h2>
      </div>
      <p className="tp-small muted tp-jobs-intro">
        These run on their own. Change how often each one runs here, or press Run now to start one at once.
      </p>
      {!panel ? (
        <p className="tp-small muted">{failed ? "The jobs couldn't be loaded. Reload the page to try again." : "Loading the jobs."}</p>
      ) : (
        <>
          <ul className="tp-jobs-list">
            {panel.jobs.map((r) => (
              <Row key={r.id} r={r} timerOn={panel.timer.on} busy={busy === r.id} onChange={(every, hourUtc) => void change(r, every, hourUtc)} onRun={() => void run(r)} />
            ))}
          </ul>
          <p className="tp-small muted tp-pm-foot" role="status">
            {panel.timer.on
              ? `Merlin looks for due jobs every ${panel.timer.everyMin} minutes${panel.timer.checkedAt ? `, last at ${clock(new Date(panel.timer.checkedAt))}` : ""}. Times are in your time zone.`
              : "The timer isn't running on this server, so due jobs start on the next visit to Merlin. It runs in production unless RN_SCHEDULER=0 is set. Times are in your time zone."}
          </p>
        </>
      )}
    </section>
  );
}
