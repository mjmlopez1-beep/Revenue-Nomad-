"use client";

import { useCallback, useEffect, useState } from "react";
import Brand from "../Brand";

interface AdminState {
  config: Record<string, Record<string, number | boolean | string> | string>;
  metrics: {
    operators: number;
    pulseRateByWeek: { week: string; responses: number; rate: number }[];
    pulseRateThisWeek: number;
    engagementCoverage: number;
    engagementRows: number;
    verifiedShare: number;
    signalsThisMonth: number;
    signalConversion: number;
  };
  signals: {
    id: string;
    operator: string;
    companyName: string | null;
    segment: { func?: string; industry?: string; stage?: string };
    signalType: string;
    timing: string;
    strength: string;
    note: string;
    status: string;
    bountyPaid: boolean;
    at: string;
  }[];
  moderation: { kind: "client" | "deal"; id: string; operator: string; summary: string; at: string | null }[];
  reconciliations: { id: string; uploadedAt: string; month: string; rows: number; matched: number; flagged: number }[];
  questions: { id: string; week: string; question: string; options: string[]; credits: number }[];
  week: string;
}

async function post(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, ...json };
}

export default function Admin() {
  const [state, setState] = useState<AdminState | null>(null);
  const [needKey, setNeedKey] = useState(false);
  const [key, setKey] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/state", { cache: "no-store" });
    if (res.status === 403) setNeedKey(true);
    else if (res.ok) {
      setState(await res.json());
      setNeedKey(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = (m: string) => {
    setToast(m);
    refresh();
  };

  async function login() {
    const res = await post("/api/admin/session", { key });
    if (res.ok) refresh();
    else setToast("Wrong key");
  }

  if (needKey)
    return (
      <div className="pulse-landing">
        <div className="pulse-card ok">
          <h1>RN Admin</h1>
          <p>Paste the admin key (NB_ADMIN_KEY; &quot;dev-admin&quot; in development).</p>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
          <button className="btn" onClick={login}>Enter</button>
        </div>
        {toast && <div className="toast">{toast}</div>}
      </div>
    );

  if (!state)
    return (
      <div className="container" style={{ padding: 60 }}>
        <p className="muted">Loading…</p>
      </div>
    );

  return (
    <div className="container">
      <nav className="nav">
        <Brand />
        <div className="nav-right">
          <span className="chip amber">Admin</span>
          <a href="/dashboard">Operator view</a>
        </div>
      </nav>

      <Metrics m={state.metrics} />
      <div className="grid2 section-gap">
        <SignalCrm signals={state.signals} notify={notify} />
        <div>
          <Reconcile recs={state.reconciliations} notify={notify} />
          <Moderation rows={state.moderation} notify={notify} />
          <Question q={state.questions} week={state.week} notify={notify} />
        </div>
      </div>
      <Economy config={state.config} notify={notify} />
      <footer className="footer">Signal bounties are cash, paid outside the app. Names never leave this screen.</footer>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ---------- §8 metrics vs targets ---------- */

function Metrics({ m }: { m: AdminState["metrics"] }) {
  const tiles: [string, string, string][] = [
    ["Weekly pulse rate", `${m.pulseRateThisWeek}%`, "targets: 25% wk2 · 40% wk6 · 55% wk12 · kill <20% by wk8"],
    ["Engagement coverage (2+ entries)", `${m.engagementCoverage}%`, "target 40% by week 6"],
    ["Verified share", `${m.verifiedShare}%`, "target ≥25% of edition rows"],
    ["Signals this month", `${m.signalsThisMonth}`, "target ≥10 by week 4"],
    ["Signal conversion", `${m.signalConversion}%`, "target ≥10%"],
    ["Engagement rows", `${m.engagementRows}`, `${m.operators} operators`],
  ];
  return (
    <div className="card section-gap">
      <div className="card-title">
        <h2>Metrics vs kill criteria</h2>
        <span className="meta">spec §8</span>
      </div>
      <div className="grid3">
        {tiles.map(([label, val, sub]) => (
          <div key={label} className="tile">
            <div className="tile-label">{label}</div>
            <div className="hero-num" style={{ fontSize: 28 }}>{val}</div>
            <div className="tiny">{sub}</div>
          </div>
        ))}
      </div>
      <hr className="divider" />
      <p className="muted" style={{ marginBottom: 6 }}>Pulse response rate, last 8 weeks</p>
      {m.pulseRateByWeek.map((w) => (
        <div key={w.week} className="barrow">
          <span className="lbl">{w.week}<span className="n">{w.responses} answers</span></span>
          <span className="bar-wrap"><span className="bar" style={{ width: `${Math.min(100, w.rate)}%` }} /></span>
          <span className="val">{w.rate}%</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- signal CRM ---------- */

function SignalCrm({ signals, notify }: { signals: AdminState["signals"]; notify: (m: string) => void }) {
  async function update(id: string, patch: Record<string, unknown>) {
    const res = await post("/api/admin/signal", { id, ...patch });
    notify(res.ok ? "Signal updated" : res.error ?? "Failed");
  }
  return (
    <div className="card">
      <div className="card-title">
        <h2>Signal CRM</h2>
        <span className="meta">$250 cash bounty per conversion — a 1.1% CAC on ≈$22.5k</span>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>From</th>
              <th>Signal</th>
              <th>Status</th>
              <th>Bounty</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.operator}
                  <div className="tiny">{s.companyName ?? "unnamed"} · {s.strength} · {s.timing}</div>
                </td>
                <td style={{ maxWidth: 220 }}>
                  {s.signalType.replace(/_/g, " ")}
                  <div className="tiny">{s.note}</div>
                </td>
                <td>
                  <select value={s.status} onChange={(e) => update(s.id, { status: e.target.value })} style={{ padding: "4px 8px", width: "auto" }}>
                    {["new", "qualifying", "intro_made", "converted", "dead"].map((st) => (
                      <option key={st} value={st}>{st.replace("_", " ")}</option>
                    ))}
                  </select>
                </td>
                <td>
                  {s.status === "converted" ? (
                    <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12 }}>
                      <input type="checkbox" style={{ width: "auto" }} checked={s.bountyPaid} onChange={(e) => update(s.id, { bountyPaid: e.target.checked })} />
                      paid
                    </label>
                  ) : (
                    <span className="tiny">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Bill.com reconciliation ---------- */

function Reconcile({ recs, notify }: { recs: AdminState["reconciliations"]; notify: (m: string) => void }) {
  const [csv, setCsv] = useState("");
  async function upload() {
    const res = await post("/api/admin/reconcile", { csv });
    notify(res.ok ? `Reconciled: ${res.reconciliation.matched} verified, ${res.reconciliation.flagged} flagged` : res.error ?? "Failed");
    if (res.ok) setCsv("");
  }
  return (
    <div className="card">
      <div className="card-title">
        <h2>Bill.com reconciliation</h2>
        <span className="meta">v1: monthly CSV · v1.5: API sync</span>
      </div>
      <p className="card-sub">
        Paste the Bill.com invoice export for RN-placed engagements. Columns: <code>client_id,invoice_amount</code> or{" "}
        <code>operator_email,client_name,invoice_amount</code>. Matches within 5% mark rows verified (2× weight).
      </p>
      <textarea rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"cl_0001,8500\ncl_0002,12000"} />
      <div style={{ marginTop: 8 }}>
        <button className="btn btn-sm" onClick={upload} disabled={!csv.trim()}>Run reconciliation</button>
      </div>
      {recs.length > 0 && (
        <>
          <hr className="divider" />
          {recs.slice(0, 5).map((r) => (
            <p key={r.id} className="muted" style={{ fontSize: 12.5 }}>
              {new Date(r.uploadedAt).toLocaleDateString()} · {r.rows} rows · {r.matched} verified · {r.flagged} flagged
            </p>
          ))}
        </>
      )}
    </div>
  );
}

/* ---------- moderation ---------- */

function Moderation({ rows, notify }: { rows: AdminState["moderation"]; notify: (m: string) => void }) {
  async function decide(kind: string, id: string, decision: string) {
    const res = await post("/api/admin/moderation", { kind, id, decision });
    notify(res.ok ? (decision === "clear" ? "Cleared — credits released" : "Rejected") : res.error ?? "Failed");
  }
  return (
    <div className="card">
      <div className="card-title">
        <h2>Moderation queue</h2>
        <span className="meta">plausibility-flagged, credits held</span>
      </div>
      {rows.length === 0 && <p className="muted">Queue is clear.</p>}
      {rows.map((r) => (
        <div key={r.id} className="wizard-row">
          <div className="info">
            <b>{r.operator}</b> <span className="tiny">{r.kind}</span>
            <div className="sub">{r.summary}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-sm" onClick={() => decide(r.kind, r.id, "clear")}>Clear</button>
            <button className="btn-ghost btn-sm" onClick={() => decide(r.kind, r.id, "reject")}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- question of the week ---------- */

function Question({ q, week, notify }: { q: AdminState["questions"]; week: string; notify: (m: string) => void }) {
  const current = q.find((x) => x.week === week);
  const [question, setQuestion] = useState(current?.question ?? "");
  const [options, setOptions] = useState((current?.options ?? []).join("\n"));
  const [credits, setCredits] = useState(String(current?.credits ?? 15));
  async function save() {
    const res = await post("/api/admin/question", {
      question,
      options: options.split("\n").filter(Boolean),
      credits: parseFloat(credits),
    });
    notify(res.ok ? `Question set for ${week}` : res.error ?? "Failed");
  }
  return (
    <div className="card">
      <div className="card-title">
        <h2>Question of the week</h2>
        <span className="meta">{week} · pays expiring credits</span>
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label>Question</label>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} />
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label>Options (one per line)</label>
        <textarea rows={3} value={options} onChange={(e) => setOptions(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div className="field" style={{ width: 110 }}>
          <label>Credits (10–20)</label>
          <input type="number" value={credits} onChange={(e) => setCredits(e.target.value)} />
        </div>
        <button className="btn btn-sm" onClick={save} disabled={!question.trim()}>Set question</button>
      </div>
    </div>
  );
}

/* ---------- economy config ---------- */

function Economy({ config, notify }: { config: AdminState["config"]; notify: (m: string) => void }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(config)) as AdminState["config"]);
  const sections = ["earn", "spend", "gates", "streak", "insider", "status", "verification"] as const;

  async function save() {
    const res = await post("/api/admin/config", draft, "PUT");
    notify(res.ok ? "Economy retuned — live immediately, no deploy" : res.error ?? "Failed");
  }

  return (
    <div className="card section-gap">
      <div className="card-title">
        <h2>Economy config</h2>
        <span className="meta">every value retunable without a deploy</span>
      </div>
      <div className="grid3">
        {sections.map((sec) => {
          const obj = draft[sec] as Record<string, number | boolean | string>;
          if (!obj || typeof obj !== "object") return null;
          return (
            <div key={sec} className="tile">
              <div className="tile-label" style={{ marginBottom: 8, textTransform: "uppercase" }}>{sec}</div>
              {Object.entries(obj).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{k}</span>
                  {typeof v === "boolean" ? (
                    <input
                      type="checkbox"
                      style={{ width: "auto" }}
                      checked={v}
                      onChange={(e) =>
                        setDraft({ ...draft, [sec]: { ...obj, [k]: e.target.checked } })
                      }
                    />
                  ) : (
                    <input
                      type={typeof v === "number" ? "number" : "text"}
                      value={String(v)}
                      step="0.05"
                      style={{ width: 84, padding: "4px 8px", fontSize: 12.5 }}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [sec]: { ...obj, [k]: typeof v === "number" ? parseFloat(e.target.value) || 0 : e.target.value },
                        })
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-sm" onClick={save}>Save economy</button>
      </div>
    </div>
  );
}
