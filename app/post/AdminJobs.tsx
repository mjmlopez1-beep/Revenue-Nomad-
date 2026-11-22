"use client";

/**
 * Pilot metrics: the Automatic jobs card (lib/jobs.ts jobsPanel, GET /api/table/jobs). One row per
 * background job: what it does, how often it runs (a select the owner changes, saved on the
 * server), how the last run went, when the next one starts, and "Run now". A job its env switch
 * keeps off says which switch, and can't be scheduled. Times are in the viewer's time zone; the
 * server keeps the hour in UTC. While a job runs the card reads its rows again every few seconds.
 *
 * The website finder also has "Dry run" (reads and checks, writes nothing, works with RN_WEBSITES
 * off) and, below the rows, its recent finds with Undo (GET ?finds=websites). Admins only: members
 * never see this card, a find's confidence or how a website was found.
 *
 * Own sites has the same Dry run (what it finds stays unusable), and below the rows its counts, a
 * short sample of the emails it found (the owner's eyes only) and Undo, which takes every one back.
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

/** "Run now": the action each job had before this card (the funding filings and the website finder got one here). `dry`: the website finder's Dry run. */
async function runNow(job: JobId, act: (a: Action) => Promise<{ ok: boolean }>, toast: (m: string, bad?: boolean) => void, dry = false): Promise<boolean> {
  if (job === "scan") return (await act({ type: "scanNow" })).ok;
  if (job === "about") return (await act({ type: "aboutNow" })).ok;
  if (job === "leaders") return (await act({ type: "leadersNow", scope: "next" })).ok;
  const [url, body] = job === "radar" ? ["/api/radar", { op: "send" }] : ["/api/table/jobs", { op: "run", job, ...(dry ? { dry: true } : {}) }];
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

function Row({ r, timerOn, onChange, onRun, busy }: { r: JobRow; timerOn: boolean; onChange: (every: Cadence, hourUtc: number) => void; onRun: (dry?: boolean) => void; busy: boolean }) {
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
        {r.dryNote && <span className="tp-jobs-desc">{r.dryNote}</span>}
      </div>
      <div className="tp-jobs-cell">
        <span className="tp-jobs-l">Next run</span>
        <span className={r.running ? "tp-jobs-live" : !r.nextAt || r.off ? "tp-jobs-none" : undefined}>{nextText(r, timerOn, nowMs)}</span>
      </div>
      <div className="tp-jobs-act" style={r.canDry !== undefined ? { display: "flex", flexWrap: "wrap", gap: 6 } : undefined}>
        {r.canDry !== undefined && (
          <button type="button" className="btn btn-sm" disabled={busy || !r.canDry} aria-busy={busy} aria-describedby={`${id}-name`} title="Reads and checks, saves nothing" onClick={() => onRun(true)}>
            Dry run
          </button>
        )}
        <button type="button" className="btn btn-sm btn-pine" disabled={busy || !r.canRun} aria-busy={busy} aria-describedby={`${id}-name`} title={r.cantRun} onClick={() => onRun()}>
          {r.running ? "Running" : "Run now"}
        </button>
      </div>
    </li>
  );
}

interface Find {
  companyId: string;
  name: string;
  domain: string;
  linkedin?: string | null;
  confidence: "high" | "medium";
  at?: string;
  undone?: boolean;
  live?: boolean;
}

/** The website finder's recent finds, with Undo, and the last dry run's (nothing saved). Read when opened. */
function WebsiteFinds({ stamp }: { stamp: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ finds: Find[]; total: number; dry: { at: string; finds: Find[] } | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/table/jobs?finds=websites", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    if (open) void load();
  }, [open, stamp, load]);
  const undo = async (f: Find) => {
    setBusy(f.companyId);
    try {
      const res = await fetch("/api/table/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "undoWebsite", companyId: f.companyId }) });
      const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      toast(j.message || j.error || (res.ok ? "Taken back." : "That didn't go through. Try again."), !res.ok);
      await load();
    } catch {
      toast("We couldn't reach Merlin. Check your connection and try again.", true);
    } finally {
      setBusy(null);
    }
  };
  const line = (f: Find, withUndo: boolean) => (
    <li key={f.companyId} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px", padding: "4px 0" }}>
      <span style={{ fontWeight: 600 }}>{f.name}</span>
      <span style={f.undone ? { textDecoration: "line-through" } : undefined}>{f.domain}</span>
      <span className="tp-jobs-desc">
        {f.confidence}
        {f.linkedin ? " · LinkedIn page too" : ""}
        {f.at ? ` · ${when(f.at)}` : ""}
        {f.undone ? " · taken back" : f.live === false ? " · changed since" : ""}
      </span>
      {withUndo && !f.undone && f.live && (
        <button type="button" className="btn btn-sm" disabled={busy === f.companyId} aria-busy={busy === f.companyId} onClick={() => void undo(f)}>
          Undo
        </button>
      )}
    </li>
  );
  return (
    <details className="tp-small" style={{ marginTop: 8 }} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Website finder: recent finds</summary>
      {!data ? (
        <p className="tp-small muted">{failed ? "The finds couldn't be loaded. Try again." : "Loading."}</p>
      ) : (
        <>
          {data.finds.length ? (
            <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>{data.finds.map((f) => line(f, true))}</ul>
          ) : (
            <p className="tp-small muted">No finds saved yet.</p>
          )}
          {data.total > data.finds.length && <p className="tp-small muted">The newest {data.finds.length} of {data.total.toLocaleString("en-US")}.</p>}
          {data.dry && (
            <>
              <p className="tp-small muted" style={{ marginTop: 8 }}>
                Last dry run ({when(data.dry.at)}), not saved: {data.dry.finds.length ? "" : "nothing found."}
              </p>
              {data.dry.finds.length > 0 && <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{data.dry.finds.map((f) => line(f, false))}</ul>}
            </>
          )}
        </>
      )}
    </details>
  );
}

interface OwnRow {
  name: string;
  email: string;
  site: string;
  page: string;
  how: string;
  at: string;
  pending: boolean;
}
interface OwnData {
  stats: { linked: number; withSite: number; firmOnly: number; usable: number; pending: number; byHow: Record<string, number>; misses: Record<string, number>; removed: number; undone: number };
  rows: OwnRow[];
  total: number;
  usable: boolean;
}

/** Own sites: counts, a short sample of found emails (admins only) and Undo for all of them. Read when opened. */
function OwnSiteFinds({ stamp }: { stamp: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<OwnData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/table/jobs?finds=ownsites", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    if (open) void load();
  }, [open, stamp, load]);
  const undo = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/table/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "undoOwnSites" }) });
      const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      toast(j.message || j.error || (res.ok ? "Taken back." : "That didn't go through. Try again."), !res.ok);
      setAsk(false);
      await load();
    } catch {
      toast("We couldn't reach Merlin. Check your connection and try again.", true);
    } finally {
      setBusy(false);
    }
  };
  const n = (x: number) => x.toLocaleString("en-US");
  const st = data?.stats;
  return (
    <details className="tp-small" style={{ marginTop: 8 }} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Own sites: counts and found emails</summary>
      {!data || !st ? (
        <p className="tp-small muted">{failed ? "The counts couldn't be loaded. Try again." : "Loading."}</p>
      ) : (
        <>
          <p className="tp-small" style={{ margin: "6px 0" }}>
            {n(st.linked)} people linked to their own firm ({n(st.withSite)} with a site, {n(st.firmOnly)} by firm name). {n(st.usable)} emails found
            {st.usable ? ` (${Object.entries(st.byHow).map(([k, v]) => `${n(v)} ${k}`).join(", ")})` : ""}, {n(st.pending)} from dry runs (not usable). Not found:{" "}
            {Object.entries(st.misses).map(([k, v]) => `${n(v)} ${k}`).join(", ")}. {n(st.removed)} removed their name, {n(st.undone)} taken back.
          </p>
          <p className="tp-small muted">{data.usable ? "Found emails are usable now (RN_OWNSITES=1)." : "Found emails aren't usable: RN_OWNSITES is off, so members see none of them."}</p>
          {data.rows.length ? (
            <div style={{ overflowX: "auto" }}>
              <table className="tp-small" style={{ borderCollapse: "collapse", marginTop: 6 }}>
                <thead>
                  <tr>
                    {["Seat holder", "Email", "Site", "How", "When"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "2px 8px 2px 0" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={`${r.email}-${r.at}`}>
                      <td style={{ padding: "2px 8px 2px 0" }}>{r.name || "Name off"}</td>
                      <td style={{ padding: "2px 8px 2px 0" }}>{r.email}</td>
                      <td style={{ padding: "2px 8px 2px 0" }}>
                        <a href={r.page} target="_blank" rel="noopener noreferrer nofollow">
                          {r.site}
                        </a>
                      </td>
                      <td style={{ padding: "2px 8px 2px 0" }}>
                        {r.how}
                        {r.pending ? " · dry run" : ""}
                      </td>
                      <td style={{ padding: "2px 8px 2px 0" }}>{when(r.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.total > data.rows.length && <p className="tp-small muted">The newest {data.rows.length} of {n(data.total)}.</p>}
            </div>
          ) : (
            <p className="tp-small muted">No emails found yet.</p>
          )}
          {data.total > 0 &&
            (ask ? (
              <p className="tp-small" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 6 }}>
                Take back all {n(data.total)} found emails? Anyone who paid for one gets the credit back.
                <button type="button" className="btn btn-sm" disabled={busy} aria-busy={busy} onClick={() => void undo()}>
                  Take them all back
                </button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setAsk(false)}>
                  Keep them
                </button>
              </p>
            ) : (
              <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => setAsk(true)}>
                Undo
              </button>
            ))}
        </>
      )}
    </details>
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
      const res = await fetch("/api/table/jobs", { cache: "no-store" });
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
      const res = await fetch("/api/table/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "cadence", job: r.id, every, hourUtc }) });
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

  const run = async (r: JobRow, dry = false) => {
    setBusy(r.id);
    try {
      if (await runNow(r.id, (a) => ui.act(a), toast, dry)) {
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
              <Row key={r.id} r={r} timerOn={panel.timer.on} busy={busy === r.id} onChange={(every, hourUtc) => void change(r, every, hourUtc)} onRun={(dry) => void run(r, dry)} />
            ))}
          </ul>
          {panel.jobs.some((j) => j.id === "ownsites") && <OwnSiteFinds stamp={JSON.stringify(panel.jobs.find((j) => j.id === "ownsites")?.lastAt ?? "") + (panel.jobs.find((j) => j.id === "ownsites")?.dryNote ?? "")} />}
          {panel.jobs.some((j) => j.id === "websites") && <WebsiteFinds stamp={JSON.stringify(panel.jobs.find((j) => j.id === "websites")?.lastAt ?? "") + (panel.jobs.find((j) => j.id === "websites")?.dryNote ?? "")} />}
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
