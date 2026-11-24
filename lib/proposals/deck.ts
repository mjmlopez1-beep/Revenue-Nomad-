/**
 * A proposal as a deck (RN_PROPOSALS2): 16:9 slides in a clean design language: a dark cover, cream
 * content slides with large headings, numbered cards, a dark constraint card, the 90 days on a clock,
 * the bridge with "?" for the member's numbers, the operator's seat, and a small footer with both
 * names and the page count. A view of the document: the editor stays the source of truth, and this
 * reads the same sections' text (the house shapes in operator.ts and sections.ts). Pure.
 */
import { fieldLabel, fill } from "./library";

export interface DeckCard {
  n?: string;
  title: string;
  body: string;
  dark?: boolean;
  tag?: string;
}
export interface DeckPhase {
  head: string;
  when: string;
  items: string[];
  deliverable: string;
}
export type DeckSlide =
  | { kind: "cover"; eyebrow: string; title: string; accent: string; sub: string; prepared: string; stats: string[] }
  | { kind: "cards"; eyebrow: string; title: string; note: string; cards: DeckCard[]; cols: 2 | 3 }
  | { kind: "thesis"; eyebrow: string; line: string; cols: DeckCard[] }
  | { kind: "rows"; eyebrow: string; title: string; note: string; rows: { title: string; body: string; aside: string }[]; aside: string }
  | { kind: "plan"; eyebrow: string; title: string; phases: DeckPhase[]; decision: string }
  | { kind: "bridge"; eyebrow: string; title: string; lead: string; steps: string[] }
  | { kind: "org"; eyebrow: string; title: string; top: string; beside: string[]; operator: string; why: string }
  | { kind: "logos"; eyebrow: string; title: string; text: string; names: string[] }
  | { kind: "list"; eyebrow: string; title: string; items: string[]; text: string };

export interface Deck {
  slides: DeckSlide[];
  /** "Revenue Nomad × Cedar and Pine": both names, for the footer. */
  footer: string;
}

const BULLET = /^\s*[-•*]\s+/;
const lines = (t: string) => t.split("\n").map((l) => l.trim());
const paras = (t: string) => t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
const bulletsOf = (t: string) => lines(t).filter((l) => BULLET.test(l)).map((l) => l.replace(BULLET, ""));
const plainOf = (t: string) => lines(t).filter((l) => l && !BULLET.test(l)).join(" ");
const nn = (i: number) => String(i + 1).padStart(2, "0");
/** "Title: body" (or "Title. body" with a short title) as a card, else the whole line as its body. */
function card(x: string): { title: string; body: string } {
  const m = x.match(/^([^:]{2,70}):\s+(.+)$/) ?? x.match(/^([^.]{2,50})\.\s+(.+)$/);
  return m && m[1].split(/\s+/).length <= 9 ? { title: m[1].trim(), body: m[2].trim() } : { title: "", body: x };
}
const EYEBROW: Record<string, string> = {
  what_we_heard: "Situation",
  thesis: "Thesis",
  pitfalls: "Thesis",
  why_fractional: "Thesis",
  engagement_glance: "The engagement",
  proof: "The engagement",
  phases_workstreams: "The plan",
  milestones: "The plan",
  day30: "The assessment",
  the_math: "The plan",
  org_chart: "Structure",
  investment: "Investment",
  questions: "Next",
  next_steps: "Next",
};

/** One section as a slide. */
function slideOf(b: { blockId: string; title: string; body: string }, eyebrow: string): DeckSlide | null {
  const t = b.body.trim();
  if (!t) return null;
  const title = b.title;
  switch (b.blockId) {
    case "cover": {
      const ls = lines(t).filter(Boolean);
      const prepared = ls.filter((l) => /^prepared (for|by)\b/i.test(l)).join(" · ");
      const rest = ls.filter((l) => !/^prepared (for|by)\b/i.test(l) && !/·\s*version\s+\d+/i.test(l));
      const head = rest[0] ?? title;
      // The last word or two of the headline in the accent (as the owner's covers set "inside").
      const m = head.match(/^(.*?)(\binside\b|\bwithin\b)(.*)$/i);
      return { kind: "cover", eyebrow: "Proposed engagement", title: m ? m[1].trim() : head, accent: m ? `${m[2]}${m[3]}`.trim() : "", sub: rest.slice(1).join(" "), prepared, stats: [] };
    }
    case "thesis": {
      const p = paras(t);
      return { kind: "thesis", eyebrow, line: plainOf(p[0] ?? ""), cols: bulletsOf(t).map(card).slice(0, 3) };
    }
    case "pitfalls":
    case "why_fractional": {
      const rows = bulletsOf(t).map((x) => {
        const [main, shows] = x.split(/\s*Shows up as:\s*/i);
        const c = card(main);
        return { title: c.title || c.body, body: c.title ? c.body : "", aside: shows ?? "" };
      });
      return rows.length ? { kind: "rows", eyebrow, title, note: plainOf(paras(t).filter((p) => !BULLET.test(p))[0] ?? ""), rows, aside: b.blockId === "pitfalls" ? "Shows up as" : "" } : null;
    }
    case "phases_workstreams": {
      const phases: DeckPhase[] = [];
      let decision = "";
      for (const p of paras(t)) {
        const [head, ...rest] = lines(p);
        const [when, name] = head.includes("·") ? head.split(/\s*·\s*/, 2) : ["", head];
        if (/decision/i.test(name ?? "") && !rest.some((l) => BULLET.test(l))) {
          decision = rest.join(" ");
          continue;
        }
        phases.push({ head: name ?? head, when: when ?? "", items: rest.filter((l) => BULLET.test(l)).map((l) => l.replace(BULLET, "")), deliverable: (rest.find((l) => /^deliverables?:/i.test(l)) ?? "").replace(/^deliverables?:\s*/i, "") });
      }
      return phases.length ? { kind: "plan", eyebrow, title: /90 days/i.test(title) ? "The first 90 days, on a clock" : title, phases, decision } : null;
    }
    case "the_math": {
      const steps = lines(t).filter((l) => /:\s*\??\s*$/.test(l) || /:\s*\$?\?/.test(l)).map((l) => l.replace(/:.*$/, ""));
      return steps.length ? { kind: "bridge", eyebrow, title: "The math: show the bridge", lead: plainOf(paras(t)[0] ?? ""), steps } : { kind: "list", eyebrow, title, items: bulletsOf(t), text: plainOf(t) };
    }
    case "org_chart": {
      const get = (k: string) => (lines(t).find((l) => l.toLowerCase().startsWith(`${k}:`)) ?? "").replace(/^[^:]+:\s*/, "");
      const why = lines(t).filter((l) => l && !/^(top|beside|operator):/i.test(l)).join(" ");
      return { kind: "org", eyebrow, title, top: get("top"), beside: get("beside").split(/,\s*/).filter(Boolean), operator: get("operator"), why };
    }
    case "proof": {
      const named = lines(t).find((l) => /^companies .*worked with:/i.test(l));
      const names = named ? named.replace(/^[^:]+:\s*/, "").split(/,\s*/).filter(Boolean) : [];
      return { kind: "logos", eyebrow, title, text: lines(t).filter((l) => l !== named).join("\n").trim(), names };
    }
    default: {
      const bs = bulletsOf(t);
      const cs = bs.map(card);
      const constraint = paras(t).find((p) => /^the constraint:/i.test(p));
      if (bs.length >= 2 && cs.filter((c) => c.title).length >= Math.ceil(bs.length / 2)) {
        const cards: DeckCard[] = cs.map((c, i) => ({ n: nn(i), title: c.title, body: c.body }));
        if (constraint) {
          const c = card(constraint.replace(/^the constraint:\s*/i, ""));
          cards.push({ title: c.title || c.body, body: c.title ? c.body : "", dark: true, tag: "The constraint" });
        }
        const note = paras(t).filter((p) => !BULLET.test(p) && p !== constraint).map(plainOf).join(" ");
        return { kind: "cards", eyebrow, title, note, cards, cols: cards.length === 4 ? 2 : 3 };
      }
      return { kind: "list", eyebrow, title, items: bs, text: lines(t).filter((l) => l && !BULLET.test(l)).join("\n") };
    }
  }
}

/** The document as a deck. Blanks read as their label in brackets ("[Days a week]"), for the member to fill in the document. */
export function deckOf(d: { blocks: { blockId: string; title: string; body: string }[]; fields: Record<string, string>; from: string; to: string }): Deck {
  const slides: DeckSlide[] = [];
  let section = 0;
  let lastEyebrow = "";
  for (const b of d.blocks) {
    if (["signature", "terms", "agreement", "addendum_header"].includes(b.blockId)) continue;
    const body = fill(b.body, d.fields, (k) => `[${fieldLabel(k).replace(/\s*\([^)]*\)$/, "")}]`);
    const eb = EYEBROW[b.blockId] ?? b.title;
    if (b.blockId !== "cover" && eb !== lastEyebrow) section++;
    lastEyebrow = eb;
    const s = slideOf({ ...b, body }, b.blockId === "cover" ? "" : `${eb} / ${String(section).padStart(2, "0")}`);
    if (s) slides.push(s);
  }
  // The cover's small stats: the days a week and the first decision, when the document says them.
  const cover = slides.find((s) => s.kind === "cover");
  if (cover && cover.kind === "cover") {
    const days = (d.fields["pricing.allocation"] ?? "").trim();
    cover.stats = [days ? `${days}, embedded` : "", d.blocks.some((x) => x.blockId === "day30" || /day 30/i.test(x.body)) ? "30 days to a decision-ready diagnosis" : ""].filter(Boolean);
  }
  return { slides, footer: [d.from, d.to].filter(Boolean).join(" × ") };
}
