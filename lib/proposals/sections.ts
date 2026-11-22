/**
 * Where each section of a proposal goes on the client's page, the signed copy and the sealed PDF:
 * the cover in the header; 01 Scope (the situation, the math, team and reporting, the plan with
 * its workstreams, milestones, commitments, success measures, assumptions and out of scope);
 * 02 Timeline and investment; 03 the agreement, its parts opening one by one; then signatures. A
 * section the proposal doesn't have is simply absent.
 *
 * Also the small readers that turn a section's plain text (the member's own words: a line starting
 * "- " a bullet, a blank line a new paragraph) into the page's shapes: stat cards for "Label: value"
 * lines, phases and workstreams with their deliverables, dated milestones, the agreement's parts.
 * Each falls back to plain paragraphs when the text has another shape. Pure: no Node or React.
 */
import type { FrozenDoc } from "./types";

/** First letter up: "a written readout" reads as a sentence. */
const cap = (t: string) => t.replace(/^\p{Ll}/u, (c) => c.toUpperCase());

export type Para = { kind: "p"; lines: string[] } | { kind: "list"; items: string[] };

/** Plain text as paragraphs and bullet lists. */
export function parseText(text: string): Para[] {
  const out: Para[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushP = () => para.length && (out.push({ kind: "p", lines: para }), (para = []));
  const flushL = () => list.length && (out.push({ kind: "list", items: list }), (list = []));
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*[-•*]\s+/.test(line)) flushP(), list.push(line.replace(/^\s*[-•*]\s+/, ""));
    else if (!line.trim()) flushP(), flushL();
    else flushL(), para.push(line.trim());
  }
  flushP();
  flushL();
  return out;
}

/** A section as placed: its library kind, the stable id the page marks it with (data-section), and for the agreement its parts. */
export interface Placed {
  kind: string;
  id: string;
  title: string;
  text: string;
  sections: { title: string; body: string }[];
}
export interface Arranged {
  cover: { lead: string; title: string } | null;
  scope: Placed[];
  invest: Placed[];
  terms: Placed[];
  sign: Placed[];
}

/** The library's block titles (templates.json), kept here so the client's page doesn't carry the whole library. */
const TITLE_KIND = new Map(
  Object.entries({
    cover: "Cover",
    what_we_heard: "What we heard",
    why_now: "The moment",
    diagnosis: "Diagnosis",
    the_math: "The math",
    recommendation: "What we recommend",
    role_profile: "Role profile and selection",
    phases_workstreams: "Plan: phases and workstreams",
    milestones: "Milestones",
    success_measures: "Success measures",
    operating_cadence: "Operating cadence",
    reporting_structure: "Reporting structure",
    assumptions: "Assumptions and client responsibilities",
    out_of_scope: "Out of scope",
    why_fractional: "Why fractional",
    proof: "Proof",
    team_rates: "Team and rates",
    investment: "Timeline and investment",
    payment_schedule: "Payment schedule",
    future_phases: "Potential next phases",
    next_steps: "Next steps",
    terms: "Terms and conditions",
    signature: "Signature",
    addendum_header: "Addendum reference",
  }).map(([id, title]) => [title.toLowerCase(), id]),
);
/** A section's kind: as frozen, or (a send from before kinds were kept) its library title's. */
export const kindOf = (b: { title: string; kind?: string }) => b.kind ?? TITLE_KIND.get(b.title.trim().toLowerCase()) ?? "custom";

/** 01 Scope's order: the situation first, then the math, team, the plan, milestones, commitments, success, the rest, assumptions and out of scope. */
const SCOPE_RANK: Record<string, number> = {
  the_math: 1,
  reporting_structure: 2,
  team_rates: 2,
  operating_cadence: 2,
  role_profile: 2,
  phases_workstreams: 3,
  milestones: 4,
  commitments: 5,
  success_measures: 6,
  future_phases: 7,
  assumptions: 8,
  out_of_scope: 8,
};
const INVEST = new Set(["investment", "payment_schedule", "next_steps"]);
const AGREEMENT = /\b(agreement|terms|conditions)\b/i;
const COMMIT = /\b(commit|commitments|deliverables?|what .* deliver)\b/i;

/** The proposal's sections, placed. */
export function arrange(d: Pick<FrozenDoc, "blocks">): Arranged {
  const out: Arranged = { cover: null, scope: [], invest: [], terms: [], sign: [] };
  const used = new Map<string, number>();
  const idFor = (k: string) => {
    const n = (used.get(k) ?? 0) + 1;
    used.set(k, n);
    return n === 1 ? k : `${k}-${n}`;
  };
  const scope: (Placed & { rank: number; at: number })[] = [];
  d.blocks.forEach((b, at) => {
    let kind = kindOf(b);
    if (kind === "custom" && COMMIT.test(b.title)) kind = "commitments";
    if (kind === "cover") {
      const lead = b.text
        .split("\n")
        .filter((l) => l.trim() && !/^(prepared (for|by)|version\b)/i.test(l.trim()) && !/·\s*version\s+\d+/i.test(l))
        .join("\n")
        .trim();
      out.cover = { lead, title: b.title };
      return;
    }
    const placed: Placed = { kind, id: idFor(kind === "custom" ? "custom" : kind), title: b.title, text: b.text, sections: [] };
    if (kind === "signature") out.sign.push(placed);
    else if (INVEST.has(kind)) out.invest.push(placed);
    else if (kind === "terms" || (kind === "custom" && AGREEMENT.test(b.title))) out.terms.push({ ...placed, sections: agreementParts(b.title, b.text) });
    else scope.push({ ...placed, rank: SCOPE_RANK[kind] ?? 0, at });
  });
  out.scope = scope.sort((a, b) => a.rank - b.rank || a.at - b.at).map(({ rank: _r, at: _a, ...p }) => p);
  return out;
}

/* ---------- the readers ---------- */

/** "Label: value" lines (two or more, short values) as stat cards; the rest stays text. */
export function statCards(text: string): { cards: { value: string; label: string }[]; rest: string } {
  const cards: { value: string; label: string }[] = [];
  const rest: string[] = [];
  for (const l of text.split("\n")) {
    const m = l.trim().replace(/^[-•]\s+/, "").match(/^([^:]{2,48}):\s+(.{1,40})$/);
    if (m && !/^https?$/i.test(m[1])) cards.push({ label: m[1].trim(), value: m[2].trim() });
    else rest.push(l);
  }
  return cards.length >= 2 ? { cards, rest: rest.join("\n").trim() } : { cards: [], rest: text };
}

export interface Workstream {
  title: string;
  when: string;
  items: string[];
  deliverable: string;
}
export interface Phase {
  badge: string;
  title: string;
  /** Workstreams that open and close; or plain bullets under the phase. */
  streams: Workstream[];
  items: string[];
  text: string;
}

/** "Phase 1, days 1 to 90: build", its workstreams (a bullet "Weeks 1 to 2, diagnose: … Deliverable: …", or a heading with bullets and a "Deliverable:" line). */
export function phases(text: string): Phase[] | null {
  const paras = text.split(/\n\s*\n/).map((p) => p.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim()));
  const out: Phase[] = [];
  let cur: Phase | null = null;
  const start = (badge: string, title: string) => {
    cur = { badge, title, streams: [], items: [], text: "" };
    out.push(cur);
  };
  for (const lines of paras) {
    if (!lines.length) continue;
    const head = lines[0].trim();
    const ph = head.match(/^(phase\s+\d+|stage\s+\d+)\s*[,:·–—-]?\s*(.*)$/i);
    if (ph && !/^\s*[-•]/.test(lines[0])) {
      start(ph[1].replace(/^\w/, (c) => c.toUpperCase()), ph[2].replace(/:\s*/, " · ").trim());
      lines.shift();
    } else if (!cur) start("", "");
    const phase = cur!;
    // A heading line, then bullets and a "Deliverable:" line: one workstream.
    if (lines.length && !/^\s*[-•]/.test(lines[0]) && lines.slice(1).some((l) => /^\s*[-•]/.test(l) || /^deliverables?:/i.test(l.trim()))) {
      const h = lines[0].trim();
      const parts = h.split(/\s+·\s+/);
      const when = parts.length > 1 && /\b(week|day|month|by|q\d)/i.test(parts[parts.length - 1]) ? parts.pop()! : "";
      const ws: Workstream = { title: parts.join(" · "), when, items: [], deliverable: "" };
      for (const l of lines.slice(1)) {
        const t = l.trim();
        if (/^deliverables?:/i.test(t)) ws.deliverable = t.replace(/^deliverables?:\s*/i, "");
        else ws.items.push(t.replace(/^[-•]\s+/, ""));
      }
      phase.streams.push(ws);
      continue;
    }
    for (const l of lines) {
      const t = l.trim();
      if (/^[-•]\s+/.test(t)) {
        const b = t.replace(/^[-•]\s+/, "");
        const dm = b.match(/^(.*?)\s*Deliverables?:\s*(.*)$/i);
        if (dm) {
          const [pre, deliverable] = [dm[1], dm[2]];
          const c = pre.indexOf(":");
          const title = c > 0 && c < 60 ? pre.slice(0, c).trim() : pre.split(/[.;]/)[0].trim();
          const item = c > 0 && c < 60 ? pre.slice(c + 1).trim() : pre.slice(title.length).replace(/^[.;]\s*/, "").trim();
          const tm = title.match(/^((?:weeks?|days?|months?)\s+[\d\s to–-]+),\s*(.+)$/i);
          phase.streams.push({ title: cap(tm ? tm[2] : title), when: tm ? cap(tm[1].trim()) : "", items: item ? [cap(item)] : [], deliverable: cap(deliverable.trim()) });
        } else phase.items.push(b);
      } else if (/^deliverables?:/i.test(t) && phase.streams.length) phase.streams[phase.streams.length - 1].deliverable = t.replace(/^deliverables?:\s*/i, "");
      else phase.text += (phase.text ? "\n" : "") + t;
    }
  }
  return out.some((p) => p.badge || p.streams.length) ? out : null;
}

/** "- Day 30: a readout …" lines as dated milestones, or null for another shape. */
export function milestones(text: string): { rest: string; items: { when: string; text: string }[] } | null {
  const items: { when: string; text: string }[] = [];
  const rest: string[] = [];
  for (const l of text.split("\n")) {
    const m = l.trim().replace(/^[-•]\s+/, "").match(/^((?:by\s+)?(?:day|week|month|q)\s*\d+[^:.]{0,16}|[A-Z][a-z]{2,8}\s+\d{1,2}(?:,\s*\d{4})?)\s*[:.–-]\s+(.+)$/i);
    if (m) items.push({ when: cap(m[1]), text: cap(m[2]) });
    else rest.push(l);
  }
  return items.length >= 2 ? { rest: rest.join("\n").trim(), items } : null;
}

/** "By day 90. A real baseline …" or "Day 90: …" bullets as cards with a bold lead; else null. */
export function leadCards(text: string): { rest: string; items: { lead: string; text: string }[] } | null {
  const items: { lead: string; text: string }[] = [];
  const rest: string[] = [];
  for (const l of text.split("\n")) {
    const t = l.trim();
    const m = /^[-•]\s+/.test(t) ? t.replace(/^[-•]\s+/, "").match(/^([^.:]{2,40})[.:]\s+(.+)$/) : null;
    if (m && m[1].split(/\s+/).length <= 5) items.push({ lead: m[1], text: m[2] });
    else rest.push(l);
  }
  return items.length >= 2 ? { rest: rest.join("\n").trim(), items } : null;
}

/** The agreement's parts: "1. Services. The Company …" or "Payments: …" lines each a part (an untitled first line is its opening words); otherwise the whole text is one. */
export function agreementParts(title: string, text: string): { title: string; body: string }[] {
  const parts: { title: string; body: string }[] = [];
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    const m = l.match(/^(?:\d+[.)]\s*)?([A-Z][^.:]{1,50})[.:]\s+(.+)$/);
    if (m && m[1].trim().split(/\s+/).length <= 6) parts.push({ title: m[1].trim(), body: m[2].trim() });
    else if (parts.length) parts[parts.length - 1].body += `\n${l}`;
    else parts.push({ title: "", body: l });
  }
  // An untitled first part is the agreement's opening words; every other part needs its title.
  if (parts.filter((p) => p.title).length < 2 || parts.slice(1).some((p) => !p.title)) return [{ title, body: text.trim() }];
  return parts;
}

/** About how long the proposal takes to read, in minutes (200 words a minute, at least 1). */
export const readMinutes = (d: Pick<FrozenDoc, "blocks">) => Math.max(1, Math.round(d.blocks.reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0) / 200));
