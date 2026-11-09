/** The guide's identity, order and gate. Chapters import their content lazily by slug in app/guide/content/index.ts. */
export const guide = {
  title: "The Fractional GTM Buyer's Guide 2027",
  shortTitle: "Fractional GTM Buyer's Guide 2027",
  subtitle:
    "What companies pay for fractional sales, marketing and RevOps leadership, and how to hire one. Built from 38 signed contracts, 137 rates and 172 operators.",
  edition: "First edition. Working draft, data as of October 2026; figures subject to final edit.",
  author: "Matt Lopez, CEO, Revenue Nomad",
  publisher: "Revenue Nomad Research",
  path: "/fractional-gtm-buyers-guide-2027",
  citeAs: "Revenue Nomad, The Fractional GTM Buyer's Guide 2027",
} as const;

export type ChapterMeta = { slug: string; number: string; title: string; dek: string; open: boolean };

/** Order of the guide. `open` chapters need no email; the rest sit behind the gate. */
export const chapters: ChapterMeta[] = [
  { slug: "start-here", number: "—", title: "Start here", dek: "The three roads that bring a CEO to fractional, and the short version of everything that follows", open: true },
  { slug: "answers", number: "—", title: "The answers CEOs ask for first", dek: "Fourteen questions, each answered with the number behind it", open: true },
  { slug: "01-why-now", number: "01", title: "Why this is happening now", dek: "The official numbers undercount this market, and the estimate, with the math shown", open: true },
  { slug: "02-who-buys", number: "02", title: "Who buys fractional GTM, and what they are really buying", dek: "The center of gravity is a real business that has outgrown the way it sells", open: false },
  { slug: "03-what-it-costs", number: "03", title: "What fractional GTM actually costs", dek: "The $225 center, the seat ladder, and what the signed contracts say", open: false },
  { slug: "04-vs-full-time", number: "04", title: "Fractional vs full-time vs agency: the honest math", dek: "This is the chapter where most fractional firms put their thumb on the scale. We are going to try not to.", open: false },
  { slug: "05-how-fast-how-long", number: "05", title: "How fast, how long, how it ends", dek: "The data on the three things CEOs worry about, with one real caveat", open: false },
  { slug: "06-role-guide", number: "06", title: "The fractional GTM role guide", dek: "Five roles that cost, run and go wrong differently", open: false },
  { slug: "07-when-it-fits", number: "07", title: "Sixteen situations where fractional GTM makes sense, and three where it does not", dek: "Nobody wakes up needing a title. They wake up with a situation.", open: false },
  { slug: "08-how-to-pick-one", number: "08", title: "How to pick one: the logo trap and what to check instead", dek: "The resume is almost useless, and the resume is almost all you will be given", open: false },
  { slug: "09-first-90-days", number: "09", title: "The first 90 days, and the nine ways buyers get it wrong", dek: "Sixty-three operators named the biggest buyer mistake. Nine patterns cover them all.", open: false },
  { slug: "10-ai-and-what-comes-next", number: "10", title: "AI, lean revenue teams, and where fractional GTM goes from here", dek: "Most AI chapters are speculation. This one is mostly data.", open: false },
  { slug: "methodology", number: "—", title: "Methodology", dek: "Five sources, described plainly, so you can judge how much weight a finding deserves", open: false },
];

export const chapterMeta = (slug: string) => chapters.find((c) => c.slug === slug);
export const chapterHref = (slug: string) => `${guide.path}/${slug}`;
