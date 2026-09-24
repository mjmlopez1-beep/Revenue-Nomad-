// Operator visibility insights: profile views, search appearances and compares,
// week over week, plus the search terms that lead to profile views.
//
// Live numbers come from the event log (trackSignals). The prototype has no history
// before its start date, so each operator gets a deterministic sample history for the
// 90 days before CLOCK_BASE. The page labels it; live events replace it day by day.

import type { Operator, State } from "./types";
import { completeness } from "./data";
import { CLOCK_BASE, nowOf } from "./store";

const DAY = 86400000;

export type Metric = "views" | "impressions" | "compares";
export const METRICS: { key: Metric; label: string; unit: string; event: string }[] = [
  { key: "views", label: "Profile views", unit: "view", event: "profile_viewed" },
  { key: "impressions", label: "Search appearances", unit: "appearance", event: "search_impression" },
  { key: "compares", label: "Compares", unit: "compare", event: "compared" },
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Search terms a buyer would plausibly type to find this operator, most likely first. */
function sampleTerms(op: Operator): string[] {
  const role = op.role.toLowerCase().replace(/^chief marketing officer$/, "cmo");
  const tags = (op.allTags || []).map((t) => t.toLowerCase()).filter((t) => t.length > 3 && t.length < 28);
  const inds = (op.allIndustries || []).map((i) => i.toLowerCase());
  const out = [role, ...tags.slice(0, 6), inds[0] ? `${role} ${inds[0]}` : "", `fractional ${op.cat.toLowerCase()}`];
  return [...new Set(out.filter(Boolean))].slice(0, 8);
}

interface Day {
  views: number;
  impressions: number;
  compares: number;
  terms: Record<string, { views: number; impressions: number }>;
}

/** Sample traffic for one day before the prototype started. Stable for a given operator and day. */
function sampleDay(op: Operator, dayIndex: number, terms: string[]): Day {
  const pct = completeness(op).pct;
  const strength = 0.4 + (op.reputation || 50) / 100 + pct / 200; // ~0.9 to 2
  const daysBefore = Math.floor(CLOCK_BASE / DAY) - dayIndex; // 1..90
  const trend = 1 + (90 - daysBefore) / 180; // gently rising into the present
  const weekday = new Date(dayIndex * DAY).getUTCDay();
  const workday = weekday === 0 || weekday === 6 ? 0.35 : 1;
  const r = (k: string) => hash(`${op.id}|${dayIndex}|${k}`);
  const impressions = Math.round(strength * trend * workday * (6 + r("i") * 8));
  const views = Math.round(impressions * (0.12 + r("v") * 0.14));
  const compares = r("c") < 0.12 * strength * workday ? 1 : 0;
  const t: Day["terms"] = {};
  for (let i = 0; i < impressions; i++) {
    // Earlier terms in the list are the likelier searches.
    const pick = terms[Math.min(terms.length - 1, Math.floor(Math.pow(r(`t${i}`), 1.8) * terms.length))];
    t[pick] = t[pick] || { views: 0, impressions: 0 };
    t[pick].impressions++;
  }
  let left = views;
  for (const term of terms) {
    if (!left) break;
    const imp = t[term]?.impressions || 0;
    const v = Math.min(left, Math.round(imp * (0.1 + hash(`${op.id}|${term}|ctr`) * 0.3)));
    if (v && t[term]) {
      t[term].views += v;
      left -= v;
    }
  }
  return { views, impressions, compares, terms: t };
}

function emptyDay(): Day {
  return { views: 0, impressions: 0, compares: 0, terms: {} };
}

/** One entry per day from `fromDay` (inclusive) to `toDay` (inclusive), sample plus live. */
function days(s: State, op: Operator, fromDay: number, toDay: number): Day[] {
  const startDay = Math.floor(CLOCK_BASE / DAY);
  const terms = sampleTerms(op);
  const live = new Map<number, Day>();
  for (const e of s.events) {
    if (e.operatorId !== op.id) continue;
    const m = METRICS.find((x) => x.event === e.type);
    if (!m) continue;
    const d = Math.floor(e.at / DAY);
    if (d < fromDay || d > toDay) continue;
    const day = live.get(d) || emptyDay();
    day[m.key]++;
    const term = String(e.meta?.term || "");
    if (term && (m.key === "views" || m.key === "impressions")) {
      day.terms[term] = day.terms[term] || { views: 0, impressions: 0 };
      day.terms[term][m.key === "views" ? "views" : "impressions"]++;
    }
    live.set(d, day);
  }
  const out: Day[] = [];
  for (let d = fromDay; d <= toDay; d++) {
    const base = d < startDay && d >= startDay - 90 ? sampleDay(op, d, terms) : emptyDay();
    const l = live.get(d);
    if (l) {
      base.views += l.views;
      base.impressions += l.impressions;
      base.compares += l.compares;
      for (const [k, v] of Object.entries(l.terms)) {
        base.terms[k] = base.terms[k] || { views: 0, impressions: 0 };
        base.terms[k].views += v.views;
        base.terms[k].impressions += v.impressions;
      }
    }
    out.push(base);
  }
  return out;
}

function sum(ds: Day[]) {
  const t = { views: 0, impressions: 0, compares: 0 };
  for (const d of ds) {
    t.views += d.views;
    t.impressions += d.impressions;
    t.compares += d.compares;
  }
  return t;
}

export interface TermRow {
  term: string;
  views: number;
  impressions: number;
  prevViews: number;
}

export interface Insights {
  range: number;
  totals: Record<Metric, number>;
  prev: Record<Metric, number>;
  weeks: { start: number; views: number; impressions: number; compares: number }[];
  terms: TermRow[];
  /** A term buyers search that shows the operator often but rarely leads to a view. */
  weakTerm: TermRow | null;
  sampleUntil: number;
}

export function operatorInsights(s: State, op: Operator, range: 7 | 30 | 60 | 90): Insights {
  const today = Math.floor(nowOf(s) / DAY);
  const cur = days(s, op, today - range + 1, today);
  const prevDays = days(s, op, today - 2 * range + 1, today - range);
  // 13 whole weeks ending today, oldest first.
  const all = days(s, op, today - 13 * 7 + 1, today);
  const weeks = Array.from({ length: 13 }, (_, i) => {
    const slice = all.slice(i * 7, i * 7 + 7);
    return { start: (today - 13 * 7 + 1 + i * 7) * DAY, ...sum(slice) };
  });
  const agg = (ds: Day[]) => {
    const m = new Map<string, { views: number; impressions: number }>();
    for (const d of ds)
      for (const [k, v] of Object.entries(d.terms)) {
        const x = m.get(k) || { views: 0, impressions: 0 };
        x.views += v.views;
        x.impressions += v.impressions;
        m.set(k, x);
      }
    return m;
  };
  const curT = agg(cur);
  const prevT = agg(prevDays);
  const rows: TermRow[] = [...curT.entries()].map(([term, v]) => ({ term, views: v.views, impressions: v.impressions, prevViews: prevT.get(term)?.views || 0 }));
  const terms = rows
    .filter((r) => r.views > 0)
    .sort((a, b) => b.views - a.views || b.impressions - a.impressions || a.term.localeCompare(b.term))
    .slice(0, 5);
  const weakTerm =
    rows
      .filter((r) => r.impressions >= 8)
      .sort((a, b) => a.views / a.impressions - b.views / b.impressions || b.impressions - a.impressions)
      .find((r) => r.views / r.impressions < 0.12) || null;
  return { range, totals: sum(cur), prev: sum(prevDays), weeks, terms, weakTerm, sampleUntil: CLOCK_BASE };
}

export function changeLabel(cur: number, prev: number): { text: string; up: boolean | null } {
  if (!prev && !cur) return { text: "No change", up: null };
  if (!prev) return { text: "New", up: true };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { text: "Same as before", up: null };
  return { text: `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`, up: pct > 0 };
}

export interface PlatformInsights extends Insights {
  /** Operators ranked by profile views in the range, with the search that brought most of them. */
  topOperators: { op: Operator; views: number; impressions: number; topTerm: string | null }[];
}

/** Every operator's insights added together: what buyers search for and who they look at. */
export function platformInsights(s: State, ops: Operator[], range: 7 | 30 | 60 | 90): PlatformInsights {
  const per = ops.map((op) => ({ op, ins: operatorInsights(s, op, range) }));
  const add = (a: Record<Metric, number>, b: Record<Metric, number>) => ({ views: a.views + b.views, impressions: a.impressions + b.impressions, compares: a.compares + b.compares });
  const zero = { views: 0, impressions: 0, compares: 0 };
  const totals = per.reduce((t, x) => add(t, x.ins.totals), zero);
  const prev = per.reduce((t, x) => add(t, x.ins.prev), zero);
  const weeks = per[0].ins.weeks.map((w, i) => ({ start: w.start, ...per.reduce((t, x) => add(t, x.ins.weeks[i]), zero) }));
  // Terms: every operator's top five, merged. Good enough to rank what buyers search most.
  const m = new Map<string, TermRow>();
  for (const { ins } of per)
    for (const t of ins.terms) {
      const x = m.get(t.term) || { term: t.term, views: 0, impressions: 0, prevViews: 0 };
      x.views += t.views;
      x.impressions += t.impressions;
      x.prevViews += t.prevViews;
      m.set(t.term, x);
    }
  const terms = [...m.values()].sort((a, b) => b.views - a.views || a.term.localeCompare(b.term)).slice(0, 10);
  const topOperators = per
    .map(({ op, ins }) => ({ op, views: ins.totals.views, impressions: ins.totals.impressions, topTerm: ins.terms[0]?.term || null }))
    .sort((a, b) => b.views - a.views || (a.op.id < b.op.id ? -1 : 1))
    .slice(0, 10);
  return { range, totals, prev, weeks, terms, weakTerm: null, sampleUntil: CLOCK_BASE, topOperators };
}
