/**
 * Content shape for the three "How we engage" pages: Monthly fractional leadership, Interim cover, Fractional to
 * full time. Each page is a hero plus a list of sections; each section is a list of typed blocks, so the three
 * artboards, which share a visual language but not a section order, render through one template
 * (app/engage/EngagePage.tsx). Dataset figures come from app/guide/content/figures.ts inside the module.
 */
export type Stat = { v: string; l: string; s?: string };
export type Qa = { q: string; a: string };

export type Band = "white" | "mist" | "night" | "forest" | "gold";

export type EngageBlock =
  | { t: "lede"; html: string }
  | { t: "p"; html: string }
  | { t: "list"; items: string[]; ordered?: boolean }
  | { t: "cards"; cols?: 2 | 3 | 4; items: { kicker?: string; title: string; body: string; href?: string; cta?: string }[] }
  | { t: "steps"; items: { n: string; when?: string; title: string; body: string; note?: string }[] }
  | { t: "stats"; items: Stat[]; source?: string }
  | { t: "compare"; columns: string[]; rows: { label: string; cells: string[] }[]; note?: string }
  | { t: "table"; head: string[]; rows: string[][]; note?: string; firstColHeader?: boolean }
  | { t: "callout"; title?: string; html: string; tone?: "gold" | "leaf" | "night" }
  | { t: "quote"; text: string; by: string; context?: string; stat?: Stat; href?: string; label?: string }
  | { t: "faq"; items: Qa[] }
  /** The shared "How we pick the leader we introduce" method from app/solutions/content/shared.ts. */
  | { t: "pick" }
  /** The other three engagement cards, minus the current page. */
  | { t: "otherWays" };

export type EngageSection = {
  id: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  band?: Band;
  blocks: EngageBlock[];
  source?: string;
};

export type EngagePage = {
  /** "fractional" | "interim" | "full-time"; the route is /how-we-engage/<slug>. */
  slug: "fractional" | "interim" | "full-time";
  name: string;
  meta: { title: string; description: string };
  hero: {
    eyebrow: string;
    h1: { plain: string; em: string };
    lede: string;
    primary: { label: string; href: string };
    secondary: { label: string; href: string };
    stat: Stat;
  };
  sections: EngageSection[];
};

/** The four ways to engage, for the "Other ways we engage" block and the menus. */
export const engagements = [
  { slug: "diagnostic", name: "Revenue Health Diagnostic", kicker: "Start here", href: "/revenue-health-diagnostic", body: "Seven pillars scored in 30 to 60 days, before you hire anyone." },
  { slug: "fractional", name: "Monthly fractional leadership", kicker: "A leader 1 to 3 days a week", href: "/how-we-engage/fractional", body: "Senior leadership sized to the scope, on a first term of three to six months, then 30 days notice." },
  { slug: "interim", name: "Interim cover", kicker: "Hold the seat while you search", href: "/how-we-engage/interim", body: "An interim head of sales in the seat within weeks, handed off with overlap when the hire lands." },
  { slug: "full-time", name: "Fractional to full time", kicker: "Hire the leader already doing the job", href: "/how-we-engage/full-time", body: "Start fractional, then convert on terms written into the contract from day one." },
] as const;
