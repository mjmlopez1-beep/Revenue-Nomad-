/**
 * Every internal destination on the marketing site, in one place.
 * The header, footer, sections and the stub route (app/[...slug]) all read from here,
 * so a link on the page can only point at a path that exists.
 */
export const routes = {
  "/": "Home",
  "/portal": "Operator Portal",
  "/solutions/vp-sales": "Fractional VP of Sales",
  "/solutions/cmo": "Fractional CMO",
  "/solutions/revops": "Fractional RevOps leader",
  "/solutions/ai-gtm": "Fractional AI GTM leader",
  "/problems/founder-led-sales": "Scaling beyond founder-led sales",
  "/problems/pipeline": "Pipeline beyond your network",
  "/problems/forecast": "A forecast the board believes",
  "/problems/ai": "AI that pays for itself",
  "/engage/diagnostic": "Revenue Health Diagnostic",
  "/engage/fractional": "Monthly fractional leadership",
  "/engage/interim": "Interim cover",
  "/engage/full-time": "Fractional to full time",
  "/research/state-of-fractional-gtm-2027": "The State of Fractional GTM 2027",
  "/research/rate-index": "The Rate Index",
  "/case-studies": "Case studies",
  "/guides": "Guides",
  "/guides/hiring-a-fractional-vp-of-sales": "Hiring a fractional VP of Sales",
  "/guides/where-ai-fits-in-sales": "Where AI fits in sales",
  "/resources": "Resources",
  "/check": "The 2-minute revenue health check",
  "/about": "About Revenue Nomad",
  "/operators": "For operators",
  "/operators/join": "Join as an operator",
  "/operators/browse": "Browse operator profiles",
  "/talk": "Talk to us",
  "/thanks": "Thank you",
  "/privacy": "Privacy",
  "/terms": "Terms",
  "/sitemap": "Sitemap",
} as const;

export type Route = keyof typeof routes;

/** Paths the stub route serves: everything that is not a real page yet. */
const realPages: Route[] = ["/", "/portal", "/thanks", "/check", "/talk", "/research/rate-index"];
export const stubRoutes = (Object.keys(routes) as Route[]).filter((p) => !realPages.includes(p));

export const hrefs = {
  talk: "/talk",
  check: "/check",
  rateIndex: "/research/rate-index",
  report: "/research/state-of-fractional-gtm-2027",
  caseStudies: "/case-studies",
  browse: "/operators/browse",
  join: "/operators/join",
  portal: "/portal",
} satisfies Record<string, Route>;

export type LinkItem = { label: string; href: Route; note?: string };
export type LinkGroup = { title: string; items: LinkItem[] };

export const solutionsMenu: LinkGroup[] = [
  {
    title: "Hire a fractional leader",
    items: [
      { label: "Fractional VP of Sales", href: "/solutions/vp-sales" },
      { label: "Fractional CMO", href: "/solutions/cmo" },
      { label: "Fractional RevOps leader", href: "/solutions/revops" },
      { label: "Fractional AI GTM leader", href: "/solutions/ai-gtm" },
    ],
  },
  {
    title: "Solve a problem",
    items: [
      { label: "Scaling beyond founder-led sales", href: "/problems/founder-led-sales" },
      { label: "Pipeline beyond your network", href: "/problems/pipeline" },
      { label: "A forecast the board believes", href: "/problems/forecast" },
      { label: "AI that pays for itself", href: "/problems/ai" },
    ],
  },
  {
    title: "How we engage",
    items: [
      { label: "Revenue Health Diagnostic", href: "/engage/diagnostic" },
      { label: "Monthly fractional leadership", href: "/engage/fractional" },
      { label: "Interim cover", href: "/engage/interim" },
      { label: "Fractional to full time", href: "/engage/full-time" },
    ],
  },
];

export const resourcesMenu: LinkGroup[] = [
  {
    title: "Research",
    items: [
      { label: "The State of Fractional GTM 2027", href: "/research/state-of-fractional-gtm-2027" },
      { label: "Fractional leader rates", href: "/research/rate-index" },
      { label: "Case studies", href: "/case-studies" },
    ],
  },
  {
    title: "Guides",
    items: [
      { label: "Hiring a fractional VP of Sales", href: "/guides/hiring-a-fractional-vp-of-sales" },
      { label: "Where AI fits in sales", href: "/guides/where-ai-fits-in-sales" },
      { label: "All resources", href: "/resources" },
    ],
  },
];

export const footerColumns: LinkGroup[] = [
  solutionsMenu[0],
  solutionsMenu[1],
  solutionsMenu[2],
  {
    title: "Research",
    items: [
      { label: "The State of Fractional GTM 2027", href: "/research/state-of-fractional-gtm-2027" },
      { label: "Fractional leader rates", href: "/research/rate-index" },
      { label: "Case studies", href: "/case-studies" },
      { label: "Guides", href: "/guides" },
    ],
  },
  {
    title: "Company",
    items: [
      { label: "About", href: "/about" },
      { label: "For operators", href: "/operators" },
      { label: "Talk to us", href: "/talk" },
      { label: "Operator login", href: "/portal" },
    ],
  },
];
