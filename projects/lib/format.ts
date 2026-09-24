const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Oct 15" from an ISO date or epoch ms. Dates are shown in UTC so the simulated clock is stable. */
export function shortDate(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const d = typeof v === "number" ? new Date(v) : new Date(v.length === 10 ? v + "T12:00:00Z" : v);
  if (isNaN(d.getTime())) return String(v);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function dayLabel(ms: number): string {
  const d = new Date(ms);
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function timeLabel(ms: number): string {
  const d = new Date(ms);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? "am" : "pm"}`;
}

export function ago(then: number | null | undefined, now: number): string {
  if (!then) return "—";
  const mins = Math.max(0, Math.round((now - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function daysBetween(a: number, b: number): number {
  return Math.floor((b - a) / 86400000);
}

export function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US");
}

export function rateLabel(n: number | null | undefined): string {
  return n == null ? "No rate listed" : `$${n}/hr`;
}

export function hoursRange(min: number, max: number): string {
  return min === max ? `${min}` : `${min}-${max}`;
}

export function plural(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Display names in title case, store raw (gap G9). "christian grandy" -> "Christian Grandy". */
export function titleCase(s: string): string {
  return s.replace(/(^|[\s-])([a-z])/g, (_m, p, c) => p + c.toUpperCase());
}

export function durationLabel(ms: number): string {
  const hrs = ms / 3600000;
  if (hrs < 1) return `${Math.max(1, Math.round(ms / 60000))} min`;
  if (hrs < 48) return `${Math.round(hrs)} hrs`;
  return `${Math.round(hrs / 24)} days`;
}
