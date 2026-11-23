"use client";

/**
 * The fill-rate row under the headings: for each column, how much of it is on file over the rows
 * in view ("60% named", "100% on file"). A lock counts as on file (columns.ts fillRate), so the
 * row reads what Merlin holds, and the Company column reads how many are open to the member.
 */
import type { Row } from "../model";
import { fillRate, type ColumnDef } from "./columns";

export function FillRow({ cols, rows }: { cols: ColumnDef[]; rows: readonly Row[] }) {
  return (
    <tr className="wb-fill">
      <td />
      <td />
      {cols.map((c) => {
        const f = fillRate(c, rows);
        return (
          <td key={c.id} className="wb-fill-td" title={c.words ? undefined : `${f.filled} of ${f.of} rows in view: ${c.counts === "value" ? "open to you" : "on file (a lock counts)"}`}>
            {!c.words && (
              <span className="wb-fill-bar" aria-hidden>
                <span style={{ width: `${f.pct}%` }} />
              </span>
            )}
            <span className="wb-fill-t">{c.words ? c.words(rows) : `${f.pct}% ${c.word}`}</span>
          </td>
        );
      })}
      <td />
    </tr>
  );
}
