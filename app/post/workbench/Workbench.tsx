"use client";

/**
 * The table of the workbench: a checkbox and a row number before every row, the columns the
 * member picked (columns.ts), the fill-rate row under the headings (FillRow), and "+" to add a
 * column. A row opens its record; its checkbox only picks it (selection is this page's own state,
 * never stored). The cells are the old tables' (cells.tsx), so their locks and prices are the same:
 * nothing here spends a credit except a lock's own box, and a bulk run only from its confirm.
 */
import { memo, type ReactNode } from "react";
import { IconChevron } from "../../ui/shared";
import type { RecordType, Row, SortKey } from "../model";
import type { ColumnDef } from "./columns";
import { companyCell, personCell, seatCell } from "./cells";
import { FillRow } from "./FillRow";

/** Names, functions, titles and places sort A to Z; everything else highest or newest first. */
const AZ: SortKey[] = ["name", "fn", "title", "hq"];

/** "minmax(140px, 1fr)" -> 140: a column's least width. */
const minPx = (w: string) => Number(/(\d+)px/.exec(w)?.[1] ?? 100);

export interface WorkbenchProps {
  type: RecordType;
  /** The rows in view (one page). */
  rows: Row[];
  cols: ColumnDef[];
  /** The member's function, for the chips. */
  mine: string | null;
  selected: ReadonlySet<string>;
  onPick: (key: string, on: boolean) => void;
  onPickAll: (on: boolean) => void;
  onOpen: (r: Row) => void;
  sort: SortKey;
  onSort?: (s: SortKey) => void;
  onAddColumn: () => void;
  /** First visit: the one row whose company cell is the highlighted "Open your first company". */
  hero?: { key: string; node: ReactNode } | null;
  /** First visit: one quiet line under the headings saying what the fill rate is. */
  fillNote?: boolean;
  /** Columns a run just filled: their heading reads pine. */
  fresh?: ReadonlySet<string>;
  /** The row number of the first row in view (the page's start). */
  start?: number;
  /** A page's own drawing of a column for a row (People's names and the member's own columns); undefined draws the registry's cell. */
  cell?: (colId: string, r: Row) => ReactNode | undefined;
  /** A row's own class (an example row, a row the member set aside). */
  rowClass?: (r: Row) => string;
  /** Rows that can't be picked (examples): no checkbox. */
  canPick?: (r: Row) => boolean;
}

const cellOf = (type: RecordType, id: string, r: Row, mine: string | null) => (type === "companies" ? companyCell(id, r, mine) : type === "engagements" ? seatCell(id, r, mine) : personCell(id, r));

const WbRow = memo(function WbRow({ r, n, type, cols, mine, on, onPick, onOpen, hero, cell, extra, pickable = true }: { r: Row; n: number; type: RecordType; cols: ColumnDef[]; mine: string | null; on: boolean; onPick: (key: string, on: boolean) => void; onOpen: (r: Row) => void; hero: ReactNode | null; cell?: WorkbenchProps["cell"]; extra?: string; pickable?: boolean }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <tr
      className={`${on ? "wb-on" : ""}${hero ? " wb-hero-row" : ""}${extra ? ` ${extra}` : ""}`}
      onClick={() => onOpen(r)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen(r);
      }}
      tabIndex={0}
      data-row={r.key}
    >
      <td className="wb-td-check" onClick={stop} onKeyDown={stop}>
        {pickable && <input type="checkbox" className="wb-check" checked={on} onChange={(e) => onPick(r.key, e.target.checked)} aria-label={`Select row ${n}`} />}
      </td>
      <td className="wb-td-n num" aria-hidden>
        {n}
      </td>
      {cols.map((c) =>
        c.id === "company" && hero ? (
          <td key={c.id} className="wb-td wb-td-co wb-hero" onClick={stop} onKeyDown={stop}>
            {hero}
          </td>
        ) : (
          <td key={c.id} className={`wb-td${c.id === "company" ? " wb-td-co" : ""}${c.num ? " num" : ""}`}>
            {cell?.(c.id, r) ?? cellOf(type, c.id, r, mine)}
          </td>
        ),
      )}
      <td className="wb-td-add" aria-hidden />
    </tr>
  );
});

export function Workbench({ type, rows, cols, mine, selected, onPick, onPickAll, onOpen, sort, onSort, onAddColumn, hero, fillNote, fresh, start = 0, cell, rowClass, canPick }: WorkbenchProps) {
  const pickRows = canPick ? rows.filter(canPick) : rows;
  const all = pickRows.length > 0 && pickRows.every((r) => selected.has(r.key));
  const some = !all && pickRows.some((r) => selected.has(r.key));
  const minWidth = 40 + 36 + 44 + cols.reduce((n, c) => n + minPx(c.width), 0);
  return (
    <div className="wb-scroll">
      <table className={`wb-table wb-table-${type}`} style={{ minWidth }}>
        <colgroup>
          <col style={{ width: 40 }} />
          <col style={{ width: 36 }} />
          {cols.map((c) => (
            <col key={c.id} style={{ minWidth: minPx(c.width) }} />
          ))}
          <col style={{ width: 44 }} />
        </colgroup>
        <thead>
          <tr className="wb-head">
            <th scope="col" className="wb-th-check">
              <input
                type="checkbox"
                className="wb-check"
                checked={all}
                ref={(el) => {
                  if (el) el.indeterminate = some;
                }}
                onChange={(e) => onPickAll(e.target.checked)}
                aria-label={all ? "Clear the rows in view" : "Select every row in view"}
              />
            </th>
            <th scope="col" className="wb-th-n">
              <span className="sr-only">Row</span>
              <span aria-hidden>#</span>
            </th>
            {cols.map((c) => {
              const by = onSort && c.sort;
              const on = !!by && sort === c.sort;
              const az = !!c.sort && AZ.includes(c.sort);
              return (
                <th key={c.id} scope="col" className={`wb-th${fresh?.has(c.id) ? " wb-th-fresh" : ""}${c.num ? " num" : ""}`} title={c.tip} aria-sort={on ? (az ? "ascending" : "descending") : undefined} style={{ minWidth: minPx(c.width) }}>
                  {by ? (
                    <button type="button" className={`wb-th-sort${on ? " on" : ""}`} onClick={() => onSort(by)}>
                      {c.label}
                      <IconChevron size={12} dir={az ? "up" : "down"} />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
            <th scope="col" className="wb-th-add">
              <button type="button" className="wb-add" onClick={onAddColumn} aria-label="Add a column">
                +
              </button>
            </th>
          </tr>
          <FillRow cols={cols} rows={rows} />
        </thead>
        <tbody>
          {fillNote && (
            <tr className="wb-note-row">
              <td colSpan={cols.length + 3}>
                <span className="wb-note">The small line under each heading is how much of that column is on file for the {rows.length} rows in view. A lock counts: Merlin has it, and it opens when you do.</span>
              </td>
            </tr>
          )}
          {rows.map((r, k) => (
            <WbRow key={r.key} r={r} n={start + k + 1} type={type} cols={cols} mine={mine} on={selected.has(r.key)} onPick={onPick} onOpen={onOpen} hero={hero && hero.key === r.key ? hero.node : null} cell={cell} extra={rowClass?.(r)} pickable={canPick ? canPick(r) : true} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
