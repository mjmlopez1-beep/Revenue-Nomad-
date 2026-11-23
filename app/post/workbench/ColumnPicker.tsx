"use client";

/**
 * Which columns show: every column the list has (columns.ts), with what it costs a row and what
 * opens first. Showing a column never spends: its locks are the cells' own, each a single purchase,
 * and a column filled for many rows at once runs from Tools with a quote first.
 */
import type { RecordType } from "../model";
import { Anchored } from "../ui";
import { COLUMNS, costWords } from "./columns";

export function ColumnPicker({ anchor, type, picked, onChange, onReset, onClose }: { anchor: HTMLElement; type: RecordType; picked: readonly string[]; onChange: (next: string[]) => void; onReset: () => void; onClose: () => void }) {
  const on = new Set(picked);
  const cols = COLUMNS[type];
  return (
    <Anchored anchor={anchor} width={340} onClose={onClose} className="wb-pop wb-cols" label="Columns">
      <div className="wb-pop-head">
        <strong>Columns</strong>
        <button type="button" className="tp-flink" onClick={onReset}>
          Back to the usual
        </button>
      </div>
      <ul className="wb-cols-list">
        {cols.map((c) => (
          <li key={c.id}>
            <label className={`wb-col${c.fixed ? " fixed" : ""}`}>
              <input
                type="checkbox"
                className="wb-check"
                checked={c.fixed || on.has(c.id)}
                disabled={c.fixed}
                onChange={(e) => onChange(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))}
              />
              <span className="wb-col-t">
                <span className="wb-col-name">{c.label}</span>
                {(c.needs || c.tip) && <span className="wb-col-sub">{c.needs ?? c.tip}</span>}
              </span>
              <span className={`wb-cost ${c.cost === "free" ? "free" : "paid"}`}>{c.id === "company" ? "Opens" : costWords(c.cost)}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="wb-pop-foot">Showing a column spends nothing. A lock in it opens one row for its price, or run it on many rows from Tools.</p>
    </Anchored>
  );
}
