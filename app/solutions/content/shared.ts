import * as f from "../../guide/content/figures";
import type { Stat } from "./types";

/**
 * Content every role page shares: the "How we pick the leader we introduce" section (three checks, the CORE
 * letters and the five Reputation Index tiers). Identical on every page, so it lives here rather than in each
 * module. Survey shares are read from figures.ts; the tier sample scores are illustrative.
 */

export type TierSlug = "emerging" | "proven" | "trusted" | "elite" | "apex";
export type Tier = {
  slug: TierSlug;
  name: string;
  /** Reputation Index range the tier covers. */
  range: string;
  /** The score drawn on the badge in the method section (illustrative). */
  sample: number;
  /** Which token colors the score printed over the badge art in public/home/tiers/<slug>.png. */
  ink: "ink" | "white" | "gold";
};

export const tiers: Tier[] = [
  { slug: "emerging", name: "Emerging", range: "50 - 59", sample: 54, ink: "ink" },
  { slug: "proven", name: "Proven", range: "60 - 69", sample: 66, ink: "white" },
  { slug: "trusted", name: "Trusted", range: "70 - 79", sample: 77, ink: "white" },
  { slug: "elite", name: "Elite", range: "80 - 89", sample: 85, ink: "ink" },
  { slug: "apex", name: "Apex", range: "90 - 100", sample: 96, ink: "gold" },
];

/** Finds a tier from the name a sample profile carries ("Apex", "Elite"), case-insensitive. */
export const tierFor = (name: string): Tier | undefined => tiers.find((t) => t.slug === name.trim().toLowerCase());

export const core = [
  { letter: "C", label: "Communication" },
  { letter: "O", label: "Ownership" },
  { letter: "R", label: "Results focus" },
  { letter: "E", label: "Expertise" },
];

export type PickCheck = { n: string; title: string; body: string; stats?: Stat[] };

export const pick: { eyebrow: string; title: string; intro: string; checks: PickCheck[]; source: string } = {
  eyebrow: "Our method",
  title: "How we pick the leader we introduce",
  intro: "Every introduction runs through the same three checks. They are why each leader below carries a score and a tier.",
  checks: [
    {
      n: "01",
      title: "Fit before logos",
      body: "Every request is matched on stage, deal size and motion first. Industry and logos come last.",
      stats: [
        { v: f.pct(f.wish("stage")), l: "of operators say clients wish they had checked stage and deal size" },
        { v: f.pct(f.wish("logos")), l: "say big-company logos" },
      ],
    },
    {
      n: "02",
      title: "Scored by the companies they led",
      body: "Only a company that hired the operator can review them. Every engagement is rated 1 to 5 on four measures - CORE - plus whether they would hire again.",
    },
    {
      n: "03",
      title: "A Reputation Index built on evidence",
      body: "The Index moves only on company evidence - reviews, verified focus areas and engagements. Featuring is never paid.",
    },
  ],
  source: `Survey figures from the State of Fractional GTM 2027, n=${f.survey.detailed}. CORE scoring and Reputation Index tiers as published on our operator page.`,
};

/** The four seats, for the "Which leader do you need?" switcher in the hero and the related-roles strip. */
export const roles = [
  { href: "/fractional-vp-of-sales", short: "VP of Sales", name: "Fractional VP of Sales", line: "Owns the number, the team and the forecast 1 to 3 days a week." },
  { href: "/fractional-cmo", short: "CMO", name: "Fractional CMO", line: "Positioning, the demand engine and the pipeline marketing produces." },
  { href: "/fractional-revops", short: "RevOps", name: "Fractional RevOps leader", line: "One pipeline definition, a CRM people trust and a forecast the board believes." },
  { href: "/fractional-ai-gtm", short: "AI GTM", name: "Fractional AI GTM leader", line: "AI in the revenue engine that pays for itself, measured on pipeline and cost." },
] as const;
