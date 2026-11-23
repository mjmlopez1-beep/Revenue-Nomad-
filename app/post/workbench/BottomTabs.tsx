"use client";

/**
 * The tabs under the table: the record types linked by the same filters (Companies, People at
 * these companies, Seats at these companies), each with its count, and the status line. "Overview"
 * and "+ Add" (a new list from these filters) come with saved lists (F5); until then the tabs are
 * the three lists Merlin has.
 */
import type { ReactNode } from "react";
import type { RecordType } from "../model";

const LABEL: Record<RecordType, string> = { companies: "Companies", people: "People at these companies", engagements: "Seats at these companies" };

export function BottomTabs({ type, counts, onType, status, onNewList }: { type: RecordType; counts: Record<RecordType, number>; onType: (t: RecordType) => void; status: ReactNode; onNewList?: () => void }) {
  return (
    <div className="wb-bottom">
      <div role="tablist" aria-label="Lists with these filters" className="wb-bottom-tabs">
        {(["companies", "people", "engagements"] as RecordType[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === type} className={`wb-btab${t === type ? " on" : ""}`} onClick={() => onType(t)}>
            {LABEL[t]} · <span className="num">{counts[t].toLocaleString("en-US")}</span>
          </button>
        ))}
        {onNewList && (
          <button type="button" className="wb-btab wb-btab-add" onClick={onNewList}>
            + Add
          </button>
        )}
      </div>
      {status}
    </div>
  );
}
