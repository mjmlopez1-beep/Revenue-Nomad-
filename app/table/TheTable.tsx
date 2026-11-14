"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cell, Row, View } from "@/lib/table";
import { TYPES, typeDef, type FieldDef, type RecordType } from "@/lib/tableFields";

type Filter = "all" | "needs" | "locked" | "mine";
type Sort = { key: string; dir: 1 | -1 };

const initials = (s: string) =>
  s
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
const HUES = [142, 200, 265, 25, 330, 175, 45];
const hue = (s: string) => HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return y && mo ? new Date(y, mo - 1).toLocaleString("en-US", { month: "short", year: "numeric" }) : m;
};
const cellRank = (c: Cell) => (c.s === "value" ? 0 : c.s === "locked" ? 1 : c.s === "reported" ? 2 : 3);

export default function TheTable() {
  const [type, setType] = useState<RecordType>("company");
  const [view, setView] = useState<View | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort | null>(null);
  const [page, setPage] = useState(0);
  const [per, setPer] = useState(25);
  const [editing, setEditing] = useState<string | null>(null); // `${rowId}.${field}`
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<string | null>(null); // row id to highlight
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const def = typeDef(type)!;

  const load = useCallback(async (t: RecordType) => {
    const r = await fetch(`/api/table?type=${t}`, { cache: "no-store" });
    setView(await r.json());
  }, []);

  useEffect(() => {
    // Personal links look like /table?k=TOKEN: trade it for a cookie, then clean the URL.
    const k = new URLSearchParams(window.location.search).get("k");
    (async () => {
      if (k) {
        const r = await fetch("/api/table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signIn: k }) });
        if (!r.ok) setToast({ text: "That link isn't valid.", bad: true });
        window.history.replaceState(null, "", "/table");
      }
      await load("company");
    })();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const switchType = (t: RecordType) => {
    setType(t);
    setQ("");
    setFilter("all");
    setSort(null);
    setPage(0);
    setEditing(null);
    setAdding(false);
    load(t);
  };

  const act = async (action: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch("/api/table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json();
      setToast({ text: j.message ?? j.error, bad: !r.ok });
      if (r.ok) await load(type);
      return r.ok ? (j as { recordId?: string }) : null;
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => {
    if (!view || view.type !== type) return [];
    const needle = q.trim().toLowerCase();
    let list = view.rows.filter((r) => {
      if (needle && !r.name.toLowerCase().includes(needle) && !Object.values(r.cells).some((c) => c.s === "value" && c.v.toLowerCase().includes(needle))) return false;
      const cells = Object.values(r.cells);
      if (filter === "needs") return cells.some((c) => c.s === "empty");
      if (filter === "locked") return cells.some((c) => c.s === "locked");
      if (filter === "mine") return cells.some((c) => c.s === "value" && c.mine);
      return true;
    });
    if (sort) {
      const { key, dir } = sort;
      list = [...list].sort((a, b) => {
        if (key === "_name") return a.name.localeCompare(b.name) * dir;
        if (key === "_filled") return (a.filled - b.filled) * dir;
        const ca = a.cells[key], cb = b.cells[key];
        const r = cellRank(ca) - cellRank(cb);
        if (r) return r * dir;
        return ca.s === "value" && cb.s === "value" ? ca.v.localeCompare(cb.v) * dir : 0;
      });
    }
    // Pin a just-added row to the top so you can fill it right away.
    if (flash) list = [...list.filter((r) => r.id === flash), ...list.filter((r) => r.id !== flash)];
    return list;
  }, [view, type, q, filter, sort, flash]);

  const pages = Math.max(1, Math.ceil(rows.length / per));
  const cur = Math.min(page, pages - 1);
  const shown = rows.slice(cur * per, cur * per + per);
  const me = view?.me ?? null;
  const totalFields = def.fields.length;

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  const sortIcon = (key: string) => (sort?.key === key ? (sort.dir === 1 ? "↑" : "↓") : "↕");

  return (
    <div className="tt">
      <header className="tt-head">
        <div>
          <h1>The Table</h1>
          <p className="tt-sub">
            Fill an empty field, earn <b>1 credit</b>. Spend <b>1 credit</b> to unlock a <span className="tt-lockword">🔒 field</span> someone else filled.
          </p>
        </div>
        {me && (
          <div className="tt-credits" title={`Signed in as ${me.name}`}>
            <span className="tt-credits-n">{me.credits}</span>
            <span>credit{me.credits === 1 ? "" : "s"}</span>
          </div>
        )}
      </header>

      {view?.demo && (
        <div className="tt-banner">
          Demo data: no member seed is loaded (build it with <code>scripts/build-intel-seed.py</code>). <a href="/table?k=demo">Sign in as a demo member →</a>
        </div>
      )}
      {view && !me && !view.demo && <div className="tt-banner">Open The Table from your personal Revenue Nomad link to enrich and unlock.</div>}

      {me?.admin && view && view.reported.length > 0 && (
        <div className="tt-review">
          <b>Reported values</b>
          {view.reported.map((x) => (
            <div key={`${x.recordId}.${x.field}`} className="tt-review-item">
              <span>
                {x.record} · {x.label}: <code>{x.value}</code>
              </span>
              <span>
                <button className="tt-btn" onClick={() => act({ type: "review", recordId: x.recordId, field: x.field, decision: "keep" })}>Keep</button>
                <button className="tt-btn" onClick={() => act({ type: "review", recordId: x.recordId, field: x.field, decision: "remove" })}>Remove</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="tt-tabs" role="tablist">
        {TYPES.map((t) => (
          <button key={t.type} role="tab" aria-selected={type === t.type} className={`tt-tab ${type === t.type ? "active" : ""}`} onClick={() => switchType(t.type)}>
            {t.label}
            <span className="tt-tab-n">{view?.counts[t.type] ?? "·"}</span>
          </button>
        ))}
      </div>

      <div className="tt-card">
        {/* 1. Toolbar */}
        <div className="tt-toolbar">
          <label className="tt-search">
            <span aria-hidden>⌕</span>
            <input
              placeholder={`Search ${def.label.toLowerCase()}…`}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <label className="tt-select">
            <span>Show:</span>
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as Filter);
                setPage(0);
              }}
            >
              <option value="all">All</option>
              <option value="needs">Needs enrichment</option>
              <option value="locked">Has locked fields</option>
              {me && <option value="mine">I enriched</option>}
            </select>
          </label>
          <div className="tt-spacer" />
          {me && (
            <button className="tt-primary" onClick={() => setAdding((a) => !a)}>
              + Add {def.singular}
            </button>
          )}
        </div>

        {adding && (
          <AddBar
            def={def}
            busy={busy}
            onCancel={() => setAdding(false)}
            onAdd={async (name) => {
              const res = await act({ type: "add", recordType: type, name });
              if (res) {
                setAdding(false);
                setQ("");
                setFilter("all");
                setSort(null);
                setPage(0);
                setFlash(res.recordId ?? null);
              }
            }}
          />
        )}

        {/* 2-3. Header + body */}
        <div className="tt-scroll">
          <table className="tt-grid">
            <thead>
              <tr>
                <th className="tt-frozen" onClick={() => toggleSort("_name")}>
                  {def.identity.label} <span className="tt-sort">{sortIcon("_name")}</span>
                </th>
                {def.fields.map((f) => (
                  <th key={f.key} onClick={() => toggleSort(f.key)}>
                    {f.label}
                    {f.gated && <span className="tt-th-lock" title="Gated: 1 credit to unlock">🔒</span>} <span className="tt-sort">{sortIcon(f.key)}</span>
                  </th>
                ))}
                <th onClick={() => toggleSort("_filled")}>
                  Filled <span className="tt-sort">{sortIcon("_filled")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!view ? (
                <tr>
                  <td className="tt-none" colSpan={totalFields + 2}>Loading…</td>
                </tr>
              ) : shown.length === 0 ? (
                <tr>
                  <td className="tt-none" colSpan={totalFields + 2}>
                    {q ? <>No {def.label.toLowerCase()} match “{q}”.</> : <>No {def.label.toLowerCase()} yet.</>}{" "}
                    {me && (
                      <button className="tt-linkbtn" onClick={() => setAdding(true)}>
                        Add one →
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                shown.map((r) => (
                  <tr key={r.id} className={r.id === flash ? "tt-flash" : ""}>
                    <td className="tt-frozen">
                      <div className="tt-ident">
                        <span className="tt-avatar" style={{ background: `hsl(${hue(r.name)} 55% 92%)`, color: `hsl(${hue(r.name)} 45% 30%)` }}>
                          {initials(r.name)}
                        </span>
                        <span className="tt-name">{r.name}</span>
                        {r.verified && (
                          <span className="tt-verified" title="Corroborated by the buyer">
                            ✓
                          </span>
                        )}
                      </div>
                    </td>
                    {def.fields.map((f) => (
                      <td key={f.key}>
                        <CellView
                          row={r}
                          f={f}
                          cell={r.cells[f.key]}
                          canAct={!!me}
                          busy={busy}
                          editing={editing === `${r.id}.${f.key}`}
                          onEdit={() => setEditing(`${r.id}.${f.key}`)}
                          onCancel={() => setEditing(null)}
                          onSave={async (value) => {
                            if (await act({ type: "fill", recordId: r.id, field: f.key, value })) setEditing(null);
                          }}
                          onUnlock={() => act({ type: "unlock", recordId: r.id, field: f.key })}
                          onReport={() => {
                            if (window.confirm(`Report ${f.label} on ${r.name} as wrong? It'll be hidden until reviewed.`)) act({ type: "report", recordId: r.id, field: f.key });
                          }}
                        />
                      </td>
                    ))}
                    <td>
                      <span className="tt-meter" title={`${r.filled} of ${totalFields} fields filled`}>
                        <span style={{ width: `${(r.filled / totalFields) * 100}%` }} />
                      </span>
                      <span className="tt-meter-n">
                        {r.filled}/{totalFields}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 4. Footer */}
        <div className="tt-footer">
          <span className="tt-dim">
            {rows.length === 0 ? "No results" : `Showing ${cur * per + 1} to ${Math.min(rows.length, cur * per + per)} of ${rows.length} results`}
          </span>
          <div className="tt-pager">
            <label className="tt-dim">
              Rows per page:{" "}
              <select
                value={per}
                onChange={(e) => {
                  setPer(Number(e.target.value));
                  setPage(0);
                }}
              >
                {[25, 50, 100].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <button className="tt-btn" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
              ‹ Previous
            </button>
            {pageList(cur, pages).map((p, i) =>
              p < 0 ? (
                <span key={`gap${i}`} className="tt-dim">…</span>
              ) : (
                <button key={p} className={`tt-btn tt-page ${p === cur ? "active" : ""}`} onClick={() => setPage(p)}>
                  {p + 1}
                </button>
              ),
            )}
            <button className="tt-btn" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
              Next ›
            </button>
          </div>
        </div>
      </div>

      {me && (
        <p className="tt-foot tt-dim">
          Signed in as {me.name}. Values you fill are credited to you; other members never see who filled what.{" "}
          <button
            className="tt-linkbtn"
            onClick={async () => {
              await fetch("/api/table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signOut: true }) });
              load(type);
            }}
          >
            Sign out
          </button>
        </p>
      )}

      {toast && (
        <div className={`tt-toast ${toast.bad ? "bad" : ""}`} role="status" onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

/** Page numbers with gaps: 0 … 4 5 6 … 20 (-1 = gap). */
function pageList(cur: number, pages: number): number[] {
  if (pages <= 7) return [...Array(pages).keys()];
  const set = new Set([0, pages - 1, cur - 1, cur, cur + 1].filter((p) => p >= 0 && p < pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: number[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push(-1);
    out.push(p);
  });
  return out;
}

function AddBar({ def, busy, onAdd, onCancel }: { def: ReturnType<typeof typeDef> & object; busy: boolean; onAdd: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  return (
    <form
      className="tt-addbar"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name);
      }}
    >
      <input autoFocus placeholder={`${def.identity.label} name`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onCancel()} />
      <button className="tt-primary" disabled={busy || name.trim().length < 2}>
        Add
      </button>
      <button type="button" className="tt-btn" onClick={onCancel}>
        Cancel
      </button>
      <span className="tt-dim">Then fill its fields to earn credits.</span>
    </form>
  );
}

function CellView(props: {
  row: Row;
  f: FieldDef;
  cell: Cell;
  canAct: boolean;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (v: string) => void;
  onUnlock: () => void;
  onReport: () => void;
}) {
  const { f, cell, canAct, busy, editing } = props;
  if (editing) return <Editor f={f} initial={cell.s === "value" ? cell.v : ""} busy={busy} onSave={props.onSave} onCancel={props.onCancel} />;

  if (cell.s === "empty")
    return canAct ? (
      <button className="tt-add" onClick={props.onEdit} title={`Add ${f.label} · earn 1 credit`}>
        + Add <span>+1</span>
      </button>
    ) : (
      <span className="tt-empty-dash">—</span>
    );

  if (cell.s === "locked")
    return canAct ? (
      <button className="tt-lock" disabled={busy} onClick={props.onUnlock} title={`Unlock ${f.label} for 1 credit`}>
        🔒 Unlock <span>1</span>
      </button>
    ) : (
      <span className="tt-lock tt-lock-static">🔒</span>
    );

  if (cell.s === "reported") return <span className="tt-dim tt-small">{cell.mine ? "Reported · in review" : "In review"}</span>;

  const v = cell.v;
  let content: React.ReactNode = v;
  if (f.kind === "choice") content = <span className={`tt-pill tt-pill-${(f.options?.indexOf(v) ?? 0) % 4}`}>{v}</span>;
  else if (f.kind === "url") content = <a href={`https://${v}`} target="_blank" rel="noopener noreferrer nofollow">{v.replace(/^www\./, "")}</a>;
  else if (f.kind === "email") content = <a href={`mailto:${v}`}>{v}</a>;
  else if (f.kind === "month") content = fmtMonth(v);
  else if (f.kind === "number") content = `${v} h`;

  return (
    <span className={`tt-val ${f.gated ? "tt-val-gated" : ""}`}>
      <span className="tt-val-text" title={v}>
        {content}
      </span>
      {cell.mine ? (
        <button className="tt-hover-act" onClick={props.onEdit} title="Edit your value">
          ✎
        </button>
      ) : canAct ? (
        <button className="tt-hover-act" onClick={props.onReport} title="Report as wrong">
          ⚑
        </button>
      ) : null}
    </span>
  );
}

function Editor({ f, initial, busy, onSave, onCancel }: { f: FieldDef; initial: string; busy: boolean; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
  };
  return (
    <form
      className="tt-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      {f.kind === "choice" ? (
        <select ref={ref} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={keys}>
          <option value="">Pick…</option>
          {f.options!.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          ref={ref}
          type={f.kind === "month" ? "month" : f.kind === "email" ? "email" : f.kind === "number" ? "number" : "text"}
          placeholder={f.placeholder}
          value={v}
          maxLength={200}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={keys}
        />
      )}
      <button className="tt-ok" disabled={busy || !v.trim()} title="Save (Enter)">
        ✓
      </button>
      <button type="button" className="tt-x" onClick={onCancel} title="Cancel (Esc)">
        ✕
      </button>
    </form>
  );
}
