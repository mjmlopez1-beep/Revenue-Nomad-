"use client";

/** How long a signing link works, picked when sending a proposal or a document: 30 days unless the member picks 14, 60, 90 or no end date. */
import { LINK_DAYS, LINK_DAYS_SAY, type LinkDays } from "@/lib/proposals/types";

export function LinkDaysPick({ value, onChange }: { value: LinkDays; onChange: (d: LinkDays) => void }) {
  return (
    <label className="pp-field" data-section="link-days">
      <span className="pp-field-l">The link works for</span>
      <select className="input" value={value} onChange={(e) => onChange(Number(e.target.value) as LinkDays)}>
        {LINK_DAYS.map((d) => (
          <option key={d} value={d}>
            {LINK_DAYS_SAY[d]}
          </option>
        ))}
      </select>
    </label>
  );
}
