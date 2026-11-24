"use client";

/**
 * Click-to-sort for a page's workbench table: the columns it shows, each sorting by the value its
 * row shows there (rowSort.ts), plus the page's own columns (`extra`, keyed by column id). Call it
 * on the page's whole sorted list, before the page is cut to the rows in view, and pass the result
 * to <Workbench sorter>. `extra` and `ctx` should be stable (a module constant or useMemo).
 */
import { useMemo } from "react";
import { useSort, type SortCol, type SortKind, type SortVal, type Sorter } from "@/app/ui/sortable";
import type { Row } from "../model";
import { rowSortSpec, type RowSortCtx } from "../rowSort";

export type ExtraSorts = Record<string, { kind?: SortKind; get: (r: Row) => SortVal } | null>;

export function workbenchSortCols(cols: readonly { id: string; label: string }[], extra?: ExtraSorts | null, ctx?: RowSortCtx): SortCol<Row>[] {
  const out: SortCol<Row>[] = [];
  for (const c of cols) {
    // A page's own drawing of a column sorts by what it draws (null in extra: this column doesn't sort).
    const own = extra && c.id in extra ? extra[c.id] : undefined;
    const s = own === undefined ? rowSortSpec(c.id, ctx) : own;
    if (s) out.push({ key: c.id, label: c.label, kind: s.kind ?? "text", get: s.get });
  }
  return out;
}

export function useWorkbenchSort<R extends Row>(rows: readonly R[], cols: readonly { id: string; label: string }[], storageKey: string, extra?: ExtraSorts | null, ctx?: RowSortCtx): Sorter<R> {
  const ids = cols.map((c) => c.id).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sortCols = useMemo(() => workbenchSortCols(cols, extra, ctx), [ids, extra, ctx?.hire]);
  return useSort<R>(rows, sortCols as SortCol<R>[], { storageKey });
}
