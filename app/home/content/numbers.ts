/**
 * Every figure a visitor sees on the marketing site. One source, one shape.
 * `verified: false` means the founder has not confirmed the figure; it renders with a
 * visible "confirm" badge everywhere except the production deployment (see showUnverified).
 * Phase 9 (doubt review) flips flags it can confirm from a primary source.
 */
export type Figure = {
  value: string;
  label: string;
  source?: string;
  verified: boolean;
};

export const showUnverified = process.env.NEXT_PUBLIC_SITE_ENV !== "production";

/** Plain constants quoted inside prose. Keep them here so a sentence and a stat block never disagree. */
export const facts = {
  companySizeRange: "$1M and $200M",
  responseHours: "24 hours",
  buildingBlocks: "21",
  rateIndexCount: "137",
  firstTerm: "3 to 6 months",
  noticePeriod: "30 days",
  operatorsCount: "350+",
  reportOperators: "172",
  reportContracts: "38",
  reportBuyerRequests: "77",
  daysPerWeek: "1 to 3 days a week",
  updated: "October 2026",
} as const;

export const numbers = {
  // Hero band
  operatorsInNetwork: { value: facts.operatorsCount, label: "operators in the network", verified: false },
  wouldHireAgain: {
    value: "100%",
    label: "of companies who reviewed their operator would hire them again",
    source: "Reviews come only from hiring companies; review count to be stated",
    verified: false,
  },
  researchSample: {
    value: facts.reportOperators,
    label: `operators surveyed and ${facts.reportContracts} signed contracts behind our 2027 research`,
    source: "The State of Fractional GTM 2027 (published 2026)",
    verified: false,
  },
  responseTime: { value: "24 hrs", label: "to a first conversation", source: "Service commitment", verified: false },

  // GTM is evolving (third-party)
  buyingDoneBeforeContact: {
    value: "69%",
    label: "of the purchase process happens before B2B buyers engage with sellers",
    source: "6sense, 2024 Buyer Experience Report (2,509 B2B buyers)",
    verified: true,
  },
  preferredVendorAtContact: {
    value: "81%",
    label: "of buyers already have a preferred vendor at first contact",
    source: "6sense, 2024 Buyer Experience Report (2,509 B2B buyers)",
    verified: true,
  },
  repFreePreference: {
    value: "67%",
    label: "of B2B buyers prefer a rep-free buying experience",
    source: "Gartner survey of 646 B2B buyers, Aug to Sep 2025, published March 2026",
    verified: true,
  },
  buyingGroupSize: {
    value: "6-10",
    label: "decision makers in the typical buying group for a complex B2B purchase",
    source: "Gartner, The New B2B Buying Journey, 2019",
    verified: false,
  },

  // What it costs and the FAQ
  vpSalesMonthly: {
    value: "$4k - $10k/month",
    label: "Fractional VP of Sales, 20 to 40 hours a month",
    source: "From our 2026 data, as companies pay it",
    verified: false,
  },
  faqPriceRange: {
    value: "$4k - $27k/month",
    label: "depending on the seat and days per week",
    source: "From our 2026 data",
    verified: false,
  },

  // Outcomes
  outcomeMyHr: {
    value: "+51%",
    label: "monthly new business bookings over 18 months",
    source: "Company bookings data, against the 17 months before",
    verified: false,
  },
  outcomeGrowPro: { value: "+54.8%", label: "June sales, year over year", source: "Company sales reporting, year two", verified: false },
  outcomePracticePromotions: {
    value: "5 weeks",
    label: "to a hired, training SDR team - an early result",
    source: "Engagement record, an early result",
    verified: false,
  },

  // Footer "At a glance"
  glanceVpSales: { value: "$4k - $10k/month", label: "Fractional VP of Sales", source: "From our 2026 data, 20 to 40 hours a month", verified: false },
  glanceMedianRate: { value: "$225/hour", label: "Market median rate", source: "Revenue Nomad Rate Index, 137 rates as companies pay them", verified: false },
  glanceEngagement: { value: facts.daysPerWeek, label: "Typical engagement", source: "First term of 3 to 6 months, then 30 days notice", verified: false },
  glanceResults60: { value: "82%", label: "Results inside 60 days", source: "Operators reporting a first measurable result, operator survey, n=65", verified: false },
  glanceResponse: { value: "Within 24 hours", label: "Response time", source: "Service commitment; intro calls with matched leaders follow within days", verified: false },
  glanceFees: { value: "None", label: "Fees for companies", source: "You pay the operator's rate.", verified: true },
} satisfies Record<string, Figure>;

export type NumberKey = keyof typeof numbers;

