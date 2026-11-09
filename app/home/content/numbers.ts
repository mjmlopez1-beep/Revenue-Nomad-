/**
 * Every figure a visitor sees on the marketing site. One source, one shape.
 * `verified: false` means the founder has not confirmed the figure; it renders with a
 * visible "confirm" badge everywhere except the production deployment (see showUnverified).
 * Phase 9 (doubt review) flips flags it can confirm from a primary source.
 */
import rateIndex from "@/data/rate-index.json";

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
  rateIndexCount: String(rateIndex.rates.all.n),
  firstTerm: "3 to 6 months",
  noticePeriod: "30 days",
  operatorsCount: "350+",
  reportOperators: "172",
  reportContracts: String(rateIndex.contracts.engagements),
  reportBuyerRequests: "77",
  daysPerWeek: "1 to 3 days a week",
  updated: new Date(rateIndex.asOf + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
} as const;

/* Rate figures derive from data/rate-index.json (built from the research data source) so the homepage, the
   footer and the Rate Index page cannot disagree. */
const k = (n: number) => "$" + Math.round(n / 1000) + "k";
const vpSeat = rateIndex.contracts.bySeat.find((s) => s.seat === "Sales Director or VP of Sales");
const fractionalSeats = rateIndex.contracts.bySeat.filter((s) => s.seat !== "Interim head of sales" && s.monthly);
const vpMonthly = vpSeat?.monthly ? k(vpSeat.monthly.min) + " - " + k(vpSeat.monthly.max) + "/month" : "see the Rate Index";
const vpHours = vpSeat?.hours ? vpSeat.hours.min + " to " + vpSeat.hours.max + " hours a month" : "";
const allMonthly = fractionalSeats.flatMap((s) => (s.monthly ? [s.monthly.min, s.monthly.max] : []));
const fractionalRange = allMonthly.length ? k(Math.min(...allMonthly)) + " - " + k(Math.max(...allMonthly)) + "/month" : "see the Rate Index";
const indexSource = "Revenue Nomad Rate Index, " + rateIndex.rates.all.n + " hourly rates from the operator survey and platform listings, " + facts.updated;

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
    source: "The Fractional GTM Buyer's Guide 2027 (published 2026)",
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
    value: vpMonthly,
    label: "Fractional VP of Sales, " + vpHours,
    source: "Revenue Nomad direct contracts, 2026 (" + (vpSeat?.contracts ?? 0) + " agreements)",
    verified: true,
  },
  faqPriceRange: {
    value: fractionalRange,
    label: "depending on the seat and days per week",
    source: "Revenue Nomad direct contracts, 2026",
    verified: true,
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


  // Solution pages
  founderHandoffShare: {
    value: rateIndex.survey.founderHandoff.share + "%",
    label: "of engagements operators described were brought in to take sales off a founder, CEO or owner",
    source: "The Fractional GTM Buyer's Guide 2027 operator survey, n=" + rateIndex.survey.founderHandoff.n + " engagements with a stated reason; keyword match on the reason",
    verified: true,
  },
  founderContracts: { value: "3 of 11", label: "of our direct contracts name the founder handoff in the scope", source: "Revenue Nomad signed agreements, 2026", verified: false },
  inboundRevenueSystems: { value: "7 of 20", label: "detailed inbound buyer requests named revenue systems and CRM as the first need", source: "Revenue Nomad Demand Scan, detailed inbound requests, 2026", verified: false },
  inboundAi: { value: "6 of 20", label: "detailed inbound requests named AI as a need", source: "Revenue Nomad Demand Scan, detailed inbound requests, 2026", verified: false },
  aiUseShare: {
    value: rateIndex.survey.aiUse.share + "%",
    label: "of fractional GTM operators already use AI in delivery",
    source: "The Fractional GTM Buyer's Guide 2027 operator survey, n=" + rateIndex.survey.aiUse.n + "; " + rateIndex.survey.aiUse.most + "% run most of their work through it",
    verified: true,
  },
  aiDemandTrend: {
    value: (rateIndex.survey.demandByCategory.find((c) => c.category === "AI GTM")?.mean ?? "-") + " of 5",
    label: "AI GTM demand trend, among AI GTM operators",
    source: "The Fractional GTM Buyer's Guide 2027 operator survey, n=" + (rateIndex.survey.demandByCategory.find((c) => c.category === "AI GTM")?.n ?? 0) + "; demand compared with 12 months ago on a 1 to 5 scale",
    verified: true,
  },
  outcomeClarusPipeline: { value: "833%", label: "pipeline generation pace, year over year", source: "Engagement record, Clarus Care", verified: false },
  outcomeBuildingLink: { value: "$400K", label: "expansion engine on the secondary product motion", source: "Engagement record, BuildingLink, at 18 months", verified: false },
  outcomeSoftwareRoadmap: { value: "15 months", label: "from a month-one Revenue Health Diagnostic to a roadmap still running", source: "Engagement record, a $400M ARR software company", verified: false },

  // Footer "At a glance"
  glanceVpSales: { value: vpMonthly, label: "Fractional VP of Sales", source: "Our 2026 contracts, " + vpHours, verified: true },
  glanceMedianRate: { value: "$" + rateIndex.rates.all.median + "/hour", label: "Market median rate", source: indexSource, verified: true },
  glanceEngagement: { value: facts.daysPerWeek, label: "Typical engagement", source: "First term of 3 to 6 months, then 30 days notice", verified: false },
  glanceResults60: {
    value: rateIndex.engagements.resultInside60 + "%",
    label: "Results inside 60 days",
    source: "Operators reporting a first measurable result inside 60 days, operator survey, n=" + rateIndex.engagements.ttrN,
    verified: true,
  },
  glanceResponse: { value: "Within 24 hours", label: "Response time", source: "Service commitment; intro calls with matched leaders follow within days", verified: false },
  glanceFees: { value: "None", label: "Fees for companies", source: "You pay the operator's rate.", verified: true },
} satisfies Record<string, Figure>;

export type NumberKey = keyof typeof numbers;

