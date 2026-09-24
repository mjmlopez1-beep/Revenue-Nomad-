// Operator work outside projects: the crawled job board and the prospect engine.
// Data comes from the site's APIs (/api/jobs, /api/prospects) and falls back to a
// bundled sample where those aren't available (the artifact). Every status an
// operator sets lives in their own slice of the shared store, never on the server.

import { useEffect, useState } from "react";
import type { Operator } from "./types";
import { OPERATORS, displayName } from "./data";
import { fitScore, seatCategory, tierOf, type FitResult } from "./fit";
import seedJobs from "../../data/seed.json";
import seedProspects from "../seed/prospects.json";

export interface WorkJob {
  id: string;
  kind?: "listing" | "discussion";
  title: string;
  company: string;
  location: string;
  remote: boolean;
  url: string;
  source: string;
  postedAt: string;
  description: string;
  salary?: string;
  functions: string[];
  engagement: string[];
  seniority?: string;
  commitment?: string;
  rate?: string;
  term?: string;
  score: number;
}

export interface WorkSignal {
  type: string;
  label: string;
  detail?: string;
  evidenceUrl?: string;
  detectedOn?: string;
}

export interface WorkProspect {
  id: string;
  company: string;
  domain?: string;
  summary: string;
  icpFit: number;
  matchedIcp: string[];
  timing: number;
  overall: number;
  signals: WorkSignal[];
}

// ---------------------------------------------------------------- loading

type Feed<T> = { items: T[]; updatedAt: string | null; sample: boolean; loading: boolean };

const cache: { jobs?: Feed<WorkJob>; prospects?: Record<string, Feed<WorkProspect>> } = {};

const SAMPLE_JOBS = (seedJobs as { jobs: WorkJob[] }).jobs;

export function useJobs(): Feed<WorkJob> {
  const [feed, setFeed] = useState<Feed<WorkJob>>(cache.jobs || { items: SAMPLE_JOBS, updatedAt: null, sample: true, loading: true });
  useEffect(() => {
    if (cache.jobs && !cache.jobs.loading) return;
    let live = true;
    fetch("/api/jobs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { jobs: WorkJob[]; lastCrawl: { at: string } | null }) => {
        const items = (d.jobs || []).filter((j) => j && j.title);
        return { items: items.length ? items : SAMPLE_JOBS, updatedAt: d.lastCrawl?.at || null, sample: !items.length || items.every((j) => j.source === "sample"), loading: false };
      })
      .catch(() => ({ items: SAMPLE_JOBS, updatedAt: null, sample: true, loading: false }))
      .then((f) => {
        cache.jobs = f;
        if (live) setFeed(f);
      });
    return () => {
      live = false;
    };
  }, []);
  return feed;
}

/** The prospect engine scans per role category; map the operator's category onto one it has. */
export function prospectRole(op: Operator): string {
  return (
    {
      "Revenue Operations": "Revenue Operations",
      Marketing: "Marketing",
      "AI GTM": "Marketing",
      "Customer Success & Growth": "Customer Success",
    } as Record<string, string>
  )[op.cat] || "Sales Leadership";
}

const SAMPLE_PROSPECTS = (seedProspects as { byRole: Record<string, WorkProspect[]> }).byRole;

export function useProspects(op: Operator): Feed<WorkProspect> {
  const role = prospectRole(op);
  const sample = SAMPLE_PROSPECTS[role] || SAMPLE_PROSPECTS["Sales Leadership"] || [];
  const cached = cache.prospects?.[role];
  const [feed, setFeed] = useState<Feed<WorkProspect>>(cached || { items: sample, updatedAt: null, sample: true, loading: true });
  useEffect(() => {
    if (cache.prospects?.[role] && !cache.prospects[role].loading) {
      setFeed(cache.prospects[role]);
      return;
    }
    let live = true;
    // Scan server-side for this operator's role; anything that fails keeps the sample.
    fetch("/api/prospects/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: engineProfile(op) }) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { prospects: (WorkProspect & { role?: string })[]; scan: { at: string } }) => {
        const items = (d.prospects || []).filter((p) => !p.role || p.role === role);
        return { items: items.length ? items : sample, updatedAt: d.scan?.at || null, sample: !items.length, loading: false };
      })
      .catch(() => ({ items: sample, updatedAt: null, sample: true, loading: false }))
      .then((f) => {
        cache.prospects = { ...cache.prospects, [role]: f };
        if (live) setFeed(f);
      });
    return () => {
      live = false;
    };
  }, [role, op.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return feed;
}

function engineProfile(op: Operator) {
  return {
    name: displayName(op),
    headline: op.role,
    role: prospectRole(op),
    industries: (op.allIndustries || []).slice(0, 7),
    stages: ["seed", "series_a", "series_b"],
    employeeSizes: ["11_50", "51_200"],
    revenueSizes: ["1m_5m", "5m_20m"],
    segmentFit: ["smb", "mid_market"],
    salesMotions: [],
    keywords: (op.allTags || []).slice(0, 12),
  };
}

// ---------------------------------------------------------------- job fit

const VOCAB = [...new Set(OPERATORS.flatMap((o) => (o.allTags || []).map((t) => t.toLowerCase())))].filter((t) => t.length > 3);

function money(v: string): number {
  const m = v.match(/([\d.]+)\s*(k)?/i);
  if (!m) return 0;
  return parseFloat(m[1]) * (m[2] ? 1000 : 1);
}

/** Hours a month the role implies, from "2 days/week", "15 hrs/wk" and similar. */
export function jobHours(j: WorkJob): number | null {
  const text = `${j.commitment || ""} ${j.description}`;
  const days = text.match(/(\d(?:\.\d)?)\s*(?:-|–|to)?\s*\d?\s*days?\s*(?:\/|a|per)\s*w/i);
  if (days) return Math.round(parseFloat(days[1]) * 8 * 4.33);
  const hrs = text.match(/~?(\d{1,2})\s*(?:-|–|to)?\s*(\d{1,2})?\s*(?:hrs?|hours)\s*(?:\/|a|per)\s*w/i);
  if (hrs) return Math.round(parseFloat(hrs[1]) * 4.33);
  const month = text.match(/(\d{2,3})\s*(?:hrs?|hours)\s*(?:\/|a|per)\s*mo/i);
  return month ? parseInt(month[1], 10) : null;
}

/** Hourly range the role pays, converting monthly retainers with the implied hours. */
export function jobRate(j: WorkJob): [number, number] | null {
  const src = j.rate || j.salary || "";
  if (!src) return null;
  const parts = src.split(/–|-|to/).map(money).filter(Boolean);
  if (!parts.length) return null;
  const [lo, hi] = [parts[0], parts[1] || parts[0]];
  if (/\/\s*h|hour|hr\b/i.test(src)) return [lo, hi];
  if (/\/\s*mo|month/i.test(src)) {
    const h = jobHours(j) || 60;
    return [Math.round(lo / h / 5) * 5, Math.round(hi / h / 5) * 5];
  }
  return null;
}

export interface JobFit extends FitResult {
  cat: string;
  rate: [number, number] | null;
  hours: number | null;
}

export function jobFit(j: WorkJob, op: Operator, override: Partial<Operator> = {}): JobFit {
  const cat = seatCategory(j.title);
  const text = `${j.title} ${j.description}`.toLowerCase();
  const kw = VOCAB.filter((t) => text.includes(t)).slice(0, 12);
  const rate = jobRate(j);
  const hours = jobHours(j);
  const who = { ...op, ...override };
  const f = fitScore(who, { cat, kw, rmin: rate ? rate[0] : 0, rmax: rate ? rate[1] : 100000, hmin: hours || 40, hlabel: hours ? `about ${hours}` : "40" });
  // A role that lists no pay says nothing about budget fit; score it neutral.
  if (!rate) {
    const parts: [number, number, number, number] = [f.parts[0], f.parts[1], 10, f.parts[3]];
    const fit = parts.reduce((a, b) => a + b, 0);
    return { ...f, parts, fit, tier: tierOf(fit), plus: f.plus.replace(/\. ?\$\d+\/hr is inside budget|\$\d+\/hr is inside budget\.? ?/, ""), cat, rate, hours };
  }
  return { ...f, plus: f.plus.replace("inside budget", "inside the posted rate"), minus: f.minus.replace(/over the \$(\d+) budget/, "over the posted $$$1/hr"), cat, rate, hours };
}

// ---------------------------------------------------------------- prospects

/** Who to write to, from the signal that fired. No names are invented. */
export function contactFor(p: WorkProspect): { title: string; why: string } {
  const types = new Set(p.signals.map((s) => s.type));
  if (types.has("leader-appointed")) return { title: "the new GTM leader", why: "New leaders rebuild in their first quarter" };
  if (types.has("departure") || types.has("leadership-gap")) return { title: "the CEO", why: "They own the empty seat until it's filled" };
  if (types.has("funding")) return { title: "the CEO", why: "They decide how the raise gets spent" };
  if (types.has("team-without-leader") || types.has("function-gap")) return { title: "the CEO or COO", why: "The team reports to them for now" };
  return { title: "the founder or CEO", why: "At this size they still buy GTM help directly" };
}

export function linkedinSearch(p: WorkProspect, title: string): string {
  const role = title.replace(/^the /, "").replace(/ or .*/, "");
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${p.company} ${role === "new GTM leader" ? "VP" : role}`)}`;
}

const PITCH: Record<string, (role: string) => string> = {
  funding: (r) => `fresh capital usually means pressure to turn it into pipeline fast. A fractional ${r} can deploy it before full-time hires land`,
  "leadership-gap": (r) => `a leadership search takes four to six months. Interim ${r} coverage keeps the number moving while it runs`,
  "team-without-leader": (r) => `you're adding GTM people without a leader in place. A fractional ${r} can onboard them and build the playbook`,
  departure: (r) => `the ${r.toLowerCase()} seat looks open. Interim coverage keeps things moving while you search`,
  "hiring-role": (r) => `you have open roles in ${r.toLowerCase()}. A fractional lead can deliver results while you hire`,
  "actively-hiring": (r) => `you're in build mode. Fractional ${r} is a faster, lower-risk way to add senior help now`,
  "early-inflection": (r) => `you're at the point where founder-led sales hands off. A fractional ${r} can build the first real motion`,
  "started-hiring": (r) => `you've just started hiring. A fractional ${r} gets things moving while the reqs fill`,
  "headcount-jump": (r) => `headcount just jumped. A fractional ${r} can put structure under the growth`,
  "positioning-shift": (r) => `new positioning needs new messaging and motion. A fractional ${r} can land it in market`,
  "newly-launched": (r) => `you've just launched. A fractional ${r} can build the motion before you hire in-house`,
  "function-gap": (r) => `nobody seems to own ${r.toLowerCase()} yet. A fractional lead can fill the gap before it costs a quarter`,
  "leader-appointed": (r) => `a new leader just took the seat. A fractional ${r} can be their fastest path to a working system`,
  restructuring: (r) => `headcount is frozen but targets aren't. Fractional ${r} gives senior output without the FTE`,
};

export function whyNow(p: WorkProspect): string {
  const s = p.signals[0];
  return s ? s.label.replace(/\s+—\s+/g, ", ") : "Matches your ideal client profile";
}

export function draftFor(p: WorkProspect, op: Operator): { subject: string; body: string } {
  const role = prospectRole(op);
  const s = p.signals[0];
  const angle = s && PITCH[s.type] ? PITCH[s.type](role) : `a fractional ${role} could help at your stage`;
  const inds = (op.allIndustries || []).slice(0, 2).join(" and ") || "B2B";
  return {
    subject: `${p.company}: fractional ${role.toLowerCase()} help`,
    body: `Hi [first name],

I noticed ${angle}.

I'm ${displayName(op)}, ${op.role}. I've done this for ${inds} companies at your stage, a few days a week, without the cost or wait of a full-time hire.

Open to a 20-minute call this week to see if it fits?

${op.first}`,
  };
}

/** Rank-based label, so the strongest prospects stand out whatever the engine's absolute scale. */
export function prospectTier(rank: number, total: number): "top" | "good" | null {
  if (rank < Math.max(1, Math.ceil(total * 0.2))) return "top";
  if (rank < Math.ceil(total * 0.5)) return "good";
  return null;
}
