/**
 * Content shape for the four role pages ("Hire a fractional leader"): Fractional VP of Sales, CMO, RevOps
 * leader and AI GTM leader. One template (app/solutions/RolePage.tsx) renders every page from one of these.
 * Dataset figures (rates, monthly ranges, survey shares) are read from app/guide/content/figures.ts inside the
 * content module, never typed in, so the page moves with data/rate-index.json.
 */
export type Qa = { q: string; a: string };
export type Stat = { v: string; l: string; s?: string };

export type SectionKey =
  | "triggers"
  | "does"
  | "cost"
  | "owns"
  | "compare"
  | "engagements"
  | "ninety"
  | "practice"
  | "pick"
  | "leaders"
  | "faq"
  | "keepReading";

export type RolePage = {
  /** URL slug under the site root, e.g. "fractional-vp-of-sales". */
  slug: string;
  /** "Fractional VP of Sales" */
  role: string;
  /** Short noun for buttons and labels: "sales leaders", "marketing leaders", "RevOps leaders". */
  leadersNoun: string;
  /** Rate Index category the page's rates come from. */
  category: "Sales Leadership" | "Marketing" | "Revenue Operations" | "AI GTM" | "Sales Enablement";
  meta: { title: string; description: string };
  /** Section order as drawn on the artboard; omitted sections are skipped. */
  order: SectionKey[];
  hero: {
    eyebrow: string;
    /** Headline in two parts: plain, then the italic emphasis. The template adds the coral full stop. */
    h1: { plain: string; em: string };
    lede: string;
    primary: { label: string; href: string };
    secondary: { label: string; href: string };
    /** The price pill beside the headline, e.g. { value: "$4k - $12k/month", note: "from our 2026 contracts" }. */
    price: Stat;
  };
  triggers: { title: string; intro?: string; items: { title: string; body: string }[] };
  does?: { title: string; intro: string; items: string[] };
  cost?: { title: string; intro: string; price: Stat; more?: string; link: { label: string; href: string }; noFees: string };
  owns: {
    eyebrow: string;
    title: string;
    intro: string;
    source: string;
    items: { n: string; title: string; sub: string; body: string; byDay90: string; qa: Qa[] }[];
  };
  compare: {
    title: string;
    intro: string;
    columns: [string, string, string];
    rows: { label: string; cells: [string, string, string] }[];
    note?: string;
  };
  engagements: {
    title: string;
    /** `price` renders the card in the pricing style ("Starting at"); `badge` marks the most common one. */
    cards: { title: string; body: string; href?: string; price?: Stat; badge?: string }[];
    stats: Stat[];
    source: string;
  };
  ninety: {
    eyebrow: string;
    title: string;
    intro: string;
    steps: { n: string; when: string; title: string; body: string; note?: string }[];
    source: string;
  };
  practice: {
    title: string;
    quote: { text: string; by: string; context: string };
    caseHref: string;
    caseLabel: string;
    stat: Stat;
    allHref: string;
  };
  /** Illustrative sample profiles; rendered with initials avatars and a "Sample profile" label. */
  leaders: {
    title: string;
    note: string;
    browse: { label: string; href: string };
    items: { name: string; role: string; blurb: string; tags: string[]; days: string; price: string; location: string; score: number; tier: string; reviews: string }[];
  };
  faq: { title: string; items: Qa[] };
  keepReading: {
    title: string;
    cards: { kicker: string; title: string; body: string; href: string }[];
  };
};
