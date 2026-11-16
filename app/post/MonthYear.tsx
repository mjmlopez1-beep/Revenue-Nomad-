"use client";

/**
 * A month and a year as two plain selects, in place of the browser's month input (which shows
 * a row of dashes until it is touched). Gives "YYYY-MM", or "YYYY" when only the year is known.
 * Used wherever a start or an end month is asked for: Your seats, the Add flow and the fact editor.
 */
import { useEffect, useRef, useState } from "react";
import "./seats.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FIRST_YEAR = 1990;
const yearOf = (v: string) => (/^\d{4}/.test(v) ? v.slice(0, 4) : "");
const monthOf = (v: string) => (/^\d{4}-\d{2}$/.test(v) ? v.slice(5, 7) : "");

export function MonthYear({
  value,
  onChange,
  label,
  id,
  disabled,
  autoFocus,
  big,
  invalid,
  describedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  id?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Taller controls, for a phone sheet. */
  big?: boolean;
  /** The form has a problem with this date: both selects say so (aria-invalid), and point at the message. */
  invalid?: boolean;
  describedBy?: string;
}) {
  const [y, setY] = useState(() => yearOf(value));
  const [m, setM] = useState(() => monthOf(value));
  // What this control last sent. A different value from outside (a form reset) replaces both selects.
  const sent = useRef(value);
  useEffect(() => {
    if (value === sent.current) return;
    sent.current = value;
    setY(yearOf(value));
    setM(monthOf(value));
  }, [value]);
  const now = new Date();
  const thisYear = String(now.getFullYear());
  const years = Array.from({ length: now.getFullYear() - FIRST_YEAR + 1 }, (_, k) => String(now.getFullYear() - k));
  const set = (ny: string, nm: string) => {
    // A month that has not happened yet this year can't be picked.
    const month = ny === thisYear && nm && Number(nm) > now.getMonth() + 1 ? "" : nm;
    setY(ny);
    setM(month);
    const v = ny ? (month ? `${ny}-${month}` : ny) : "";
    sent.current = v;
    onChange(v);
  };
  const bad = invalid ? { "aria-invalid": true as const, "aria-describedby": describedBy } : {};
  return (
    <span className={`my${big ? " my-big" : ""}`}>
      <select className="select my-m" aria-label={`${label}, month`} value={m} disabled={disabled} autoFocus={autoFocus} onChange={(e) => set(y, e.target.value)} {...bad}>
        <option value="">Month</option>
        {MONTHS.map((name, k) => (
          <option key={name} value={String(k + 1).padStart(2, "0")} disabled={y === thisYear && k > now.getMonth()}>
            {name}
          </option>
        ))}
      </select>
      <select id={id} className="select my-y" aria-label={`${label}, year`} value={y} disabled={disabled} onChange={(e) => set(e.target.value, m)} {...bad}>
        <option value="">Year</option>
        {years.map((yr) => (
          <option key={yr} value={yr}>
            {yr}
          </option>
        ))}
      </select>
    </span>
  );
}
