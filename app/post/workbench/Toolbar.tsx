"use client";

/**
 * The bar over the table: the View menu, "N of M columns", the rows in view, Filter · N, Sort,
 * Save as alert and the Tools toggle. Each opens its own small menu; none of them spends.
 */
import { useRef, useState, type ReactNode } from "react";
import { IconChevron, IconFilter } from "../../ui/shared";
import type { RecordType, SortKey } from "../model";
import { sortsFor } from "../model";
import { Anchored } from "../ui";
import { ColumnPicker } from "./ColumnPicker";
import { columnCount } from "./columns";

export interface ViewOption {
  key: string;
  label: string;
  hint?: string;
  n?: number;
}

export const PAGE_SIZES = [25, 50, 100];

export function Toolbar(o: {
  type: RecordType;
  views: ViewOption[];
  view: string;
  onView: (key: string) => void;
  picked: string[];
  shownCols: number;
  onCols: (next: string[]) => void;
  onColsReset: () => void;
  inView: number;
  total: number;
  pageSize: number;
  onPageSize: (n: number) => void;
  filterN: number;
  filterPanel: () => ReactNode;
  sort: SortKey;
  sortOptions?: SortKey[];
  /** A column header sorts the list ("Rate, high to low"): the Sort button says so, and no menu item is ticked. */
  sortWords?: string | null;
  onSort: (s: SortKey) => void;
  alertText: string;
  onAlert: (() => void) | null;
  toolsOpen: boolean;
  onTools: () => void;
  toolsText: string;
}) {
  const [menu, setMenu] = useState<"view" | "cols" | "rows" | "filter" | "sort" | null>(null);
  const refs = { view: useRef<HTMLButtonElement>(null), cols: useRef<HTMLButtonElement>(null), rows: useRef<HTMLButtonElement>(null), filter: useRef<HTMLButtonElement>(null), sort: useRef<HTMLButtonElement>(null) };
  const toggle = (m: NonNullable<typeof menu>) => setMenu((x) => (x === m ? null : m));
  const cur = o.views.find((v) => v.key === o.view);
  const sorts = sortsFor(o.type).filter((s) => !o.sortOptions || o.sortOptions.includes(s.key));
  const sortLabel = o.sortWords ?? sorts.find((s) => s.key === o.sort)?.label ?? "Sort";
  const close = () => setMenu(null);
  return (
    <div className="wb-toolbar" role="toolbar" aria-label="Table">
      <button ref={refs.view} type="button" className="wb-tb wb-tb-strong" aria-haspopup="menu" aria-expanded={menu === "view"} onClick={() => toggle("view")}>
        View: {cur?.label ?? "All"}
        <IconChevron size={12} />
      </button>
      <button ref={refs.cols} type="button" className="wb-tb" aria-haspopup="dialog" aria-expanded={menu === "cols"} onClick={() => toggle("cols")}>
        {columnCount(o.type, o.shownCols)}
      </button>
      <button ref={refs.rows} type="button" className="wb-tb wb-tb-quiet" aria-haspopup="menu" aria-expanded={menu === "rows"} onClick={() => toggle("rows")}>
        <span className="num">{`${o.inView.toLocaleString("en-US")} of ${o.total.toLocaleString("en-US")} rows`}</span>
      </button>
      <button ref={refs.filter} type="button" className={`wb-tb${o.filterN ? " on" : ""}`} aria-haspopup="dialog" aria-expanded={menu === "filter"} onClick={() => toggle("filter")}>
        <IconFilter size={14} /> Filter{o.filterN ? ` · ${o.filterN}` : ""}
      </button>
      <button ref={refs.sort} type="button" className="wb-tb" aria-haspopup="menu" aria-expanded={menu === "sort"} onClick={() => toggle("sort")} title={`Sorted by ${sortLabel}`}>
        <span>
          Sort<span className="wb-tb-sub">: {sortLabel}</span>
        </span>
      </button>
      <span className="wb-tb-sp" />
      {o.onAlert && (
        <button type="button" className="wb-tb" onClick={o.onAlert}>
          {o.alertText}
        </button>
      )}
      <button type="button" className={`wb-tb wb-tools-btn${o.toolsOpen ? " on" : ""}`} aria-pressed={o.toolsOpen} onClick={o.onTools}>
        {o.toolsText}
      </button>

      {menu === "view" && refs.view.current && (
        <Anchored anchor={refs.view.current} width={300} onClose={close} className="wb-pop wb-menu" role="menu" label="Views">
          {o.views.map((v) => (
            <button
              key={v.key}
              type="button"
              role="menuitemradio"
              aria-checked={v.key === o.view}
              className={`wb-mi${v.key === o.view ? " on" : ""}`}
              onClick={() => {
                o.onView(v.key);
                close();
              }}
            >
              <span className="wb-mi-t">
                {v.label}
                {v.hint && <span className="wb-mi-sub">{v.hint}</span>}
              </span>
              {v.n !== undefined && <span className="wb-mi-n num">{v.n.toLocaleString("en-US")}</span>}
            </button>
          ))}
        </Anchored>
      )}
      {menu === "cols" && refs.cols.current && <ColumnPicker anchor={refs.cols.current} type={o.type} picked={o.picked} onChange={o.onCols} onReset={o.onColsReset} onClose={close} />}
      {menu === "rows" && refs.rows.current && (
        <Anchored anchor={refs.rows.current} width={220} onClose={close} className="wb-pop wb-menu" role="menu" label="Rows a page">
          {PAGE_SIZES.map((n) => (
            <button
              key={n}
              type="button"
              role="menuitemradio"
              aria-checked={n === o.pageSize}
              className={`wb-mi${n === o.pageSize ? " on" : ""}`}
              onClick={() => {
                o.onPageSize(n);
                close();
              }}
            >
              <span className="wb-mi-t">{n} rows a page</span>
            </button>
          ))}
        </Anchored>
      )}
      {menu === "filter" && refs.filter.current && (
        <Anchored anchor={refs.filter.current} width={340} onClose={close} className="wb-pop wb-filterpop" label="Filters">
          {o.filterPanel()}
        </Anchored>
      )}
      {menu === "sort" && refs.sort.current && (
        <Anchored anchor={refs.sort.current} width={260} onClose={close} className="wb-pop wb-menu" role="menu" label="Sort">
          {sorts.map((s) => (
            <button
              key={s.key}
              type="button"
              role="menuitemradio"
              aria-checked={!o.sortWords && s.key === o.sort}
              className={`wb-mi${!o.sortWords && s.key === o.sort ? " on" : ""}`}
              onClick={() => {
                o.onSort(s.key);
                close();
              }}
            >
              <span className="wb-mi-t">{s.label}</span>
            </button>
          ))}
        </Anchored>
      )}
    </div>
  );
}
