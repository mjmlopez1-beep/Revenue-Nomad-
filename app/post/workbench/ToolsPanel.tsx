"use client";

/**
 * The Tools panel on the right of the table: a search box, the tabs (For you, Sources, Enrich,
 * Signals, Actions) and their items, each with what it costs a row (tools.ts). An Enrich item opens
 * the run's drill-in (RunConfig); nothing here spends until that drill-in's Run.
 */
import { useState } from "react";
import { IconSearch, IconX } from "../../ui/shared";
import type { RecordType, Row } from "../model";
import { RunConfig } from "./RunConfig";
import { itemsFor, toolTabsFor, type ToolCtx, type ToolDo, type ToolTab } from "./tools";

export function ToolsPanel({
  type,
  ctx,
  tab,
  onTab,
  run,
  onRun,
  rows,
  picked,
  onDo,
  onRunDone,
  onClose,
}: {
  type: RecordType;
  ctx: ToolCtx;
  tab: ToolTab;
  onTab: (t: ToolTab) => void;
  /** The column whose drill-in is open, or null for the list. */
  run: string | null;
  onRun: (col: string | null) => void;
  rows: Row[];
  picked: Row[];
  onDo: (d: ToolDo) => void;
  onRunDone: (x: { col: string; scope: Row[]; done: number; spent: number }) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const items = itemsFor(type, ctx, tab, q);
  return (
    <aside className="wb-tools" aria-label="Tools">
      {run ? (
        <RunConfig key={run} type={type} col={run} rows={rows} picked={picked} onBack={() => onRun(null)} onDone={onRunDone} />
      ) : (
        <div className="wb-tools-list">
          <div className="wb-tools-top">
            <label className="wb-tools-search">
              <IconSearch size={15} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tools" placeholder="Search columns, sources and actions" />
            </label>
            <button type="button" className="wb-iconbtn" aria-label="Close tools" onClick={onClose}>
              <IconX size={16} />
            </button>
          </div>
          {!q && (
            <div role="tablist" aria-label="Tools" className="wb-tabs">
              {toolTabsFor(type).map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={t.key === tab} className={`wb-tab${t.key === tab ? " on" : ""}`} onClick={() => onTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="wb-items" role={q ? undefined : "tabpanel"}>
            {items.map((it) => (
              <button key={it.id} type="button" className="wb-item" onClick={() => onDo(it.do)}>
                <span className="wb-item-t">
                  <strong>{it.label}</strong>
                  <span>{it.sub}</span>
                </span>
                <span className={`wb-cost ${it.tone}`}>{it.cost}</span>
              </button>
            ))}
            {!items.length && (
              <p className="wb-empty">
                {q ? "Nothing matches that. Try a column, such as decision maker or rate." : `Columns are added on the Companies list. Here, the columns picker shows what this list has.`}
              </p>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
