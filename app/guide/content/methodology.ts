import type { Chapter } from "./types";
import * as f from "./figures";

/** The roles the guide reports on, in the order the Rate Index lists them. */
const GUIDE_ROLES = ["Sales Leadership", "Marketing", "Revenue Operations", "Sales Enablement", "AI GTM"];
const roleCuts = f.byCategory.filter((c) => GUIDE_ROLES.includes(c.category));
const largestCut = roleCuts.reduce((a, b) => (b.n > a.n ? b : a));
const smallCuts = roleCuts.filter((c) => c.n < f.rates.floor).map((c) => c.category);
const list = (xs: string[]) => (xs.length > 1 ? xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1] : xs.join(""));
const operators = (n: number) => n.toLocaleString("en-US");

const chapter: Chapter = {
  slug: "methodology",
  number: "—",
  title: "Methodology",
  dek: "Five sources, described plainly, so you can judge how much weight a finding deserves",
  stats: [
    { v: f.headline.operators, l: "unique operators, deduplicated by email" },
    { v: f.headline.contracts, l: "signed engagement contracts" },
    { v: f.headline.inbound, l: "inbound requests" },
    { v: f.headline.rates, l: "hourly rates in the Rate Index" },
  ],
  blocks: [
    {
      t: "lede",
      html: `This guide draws on five sources, all collected by Revenue Nomad between January 2024 and ${f.asOf.monthYear}: ${f.headline.operators} unique fractional GTM operators (${f.headline.operatorsNote}), ${f.headline.contracts} signed engagement contracts, ${f.headline.inbound} inbound requests, and the Revenue Nomad Rate Index of ${f.headline.rates} hourly rates. We describe each plainly so you can judge how much weight a finding deserves.`,
    },
    { t: "note", text: `The evidence base: January 2024 to ${f.asOf.monthYear}.` },

    { t: "h2", eyebrow: "The data", text: "Five sources", id: "five-sources" },

    { t: "h3", text: "The Fractional GTM Buyer's Guide 2027 operator survey" },
    {
      t: "stats",
      items: [{ v: `n=${f.survey.responses}`, l: `${f.survey.detailed} detailed` }],
      note: `Sept to Nov 2026. ${f.pct(f.survey.usShare)} US-based.`,
    },
    {
      t: "p",
      html: `An online survey of fractional go-to-market operators, open September to November 2026, distributed through Revenue Nomad's network, platform and partners. ${f.survey.responses} responses; ${f.survey.detailed} described a current or recent engagement in detail. Respondents are ${f.pct(f.survey.usShare)} US-based. The survey asked about rates, client profile, engagement structure, time to results, extension, and open-ended questions on buying triggers and buyer mistakes.`,
    },
    {
      t: "p",
      html: "<strong>Respondents are operators, not buyers.</strong> Where this guide describes what clients did or wanted, it is reporting the operator's account unless a contract or inbound record says otherwise.",
    },

    { t: "h3", text: "Revenue Nomad platform profiles" },
    {
      t: "stats",
      items: [{ v: `n=${f.platform.usable}`, l: "usable profiles" }],
      note: `As of ${f.asOf.long}. ${f.platform.listingsInIndex} unique listings in the Rate Index.`,
    },
    {
      t: "p",
      html: `Self-entered profile data from operators approved on the Revenue Nomad platform as of ${f.asOf.long}. Of ${f.platform.approved} approved profiles, ${f.platform.usable} had usable rate or role data and ${f.platform.withRate} list an hourly rate. Incomplete signups and internal or test accounts were excluded. ${f.platform.alsoInSurvey} platform operators also answered the survey; their platform rate rows were removed before combining, so the ${f.platform.listingsInIndex} platform listings in the Rate Index are unique individuals.`,
    },
    {
      t: "p",
      html: "<strong>Listing rates vs stated rates.</strong> Platform rates are listing rates (what the operator asks); survey rates are stated current rates (what they charge). The medians agree, but the two measure slightly different things.",
    },

    { t: "h3", text: "Signed engagement contracts" },
    {
      t: "stats",
      items: [
        { v: `n=${f.contracts.engagements}`, l: "engagements" },
        { v: String(f.contracts.directClients), l: `direct clients (${f.contracts.directDocuments} documents, 2024 to 2026)` },
        { v: String(f.contracts.partnerEngagements), l: "partner channel (2025 to 2026)" },
      ],
    },
    {
      t: "p",
      html: `Every signed agreement, statement of work and addendum on file, ${f.contracts.documents} documents in all: ${f.contracts.directClients} direct Revenue Nomad clients (${f.contracts.directDocuments} documents, 2024 to 2026) and ${f.contracts.partnerEngagements} engagements delivered through a partner channel (2025 to 2026). Direct-client fees, hours and terms are reported as signed. Partner-channel contracts are used only for engagement structure, scope and term; their fee data reflects operator compensation rather than client price and is not reported. No client is named. Operator compensation and firm margin are excluded throughout.`,
    },

    { t: "h3", text: "Inbound requests we received" },
    {
      t: "stats",
      items: [
        { v: "n=77", l: "Dec 2025 to Oct 2026" },
        { v: "20", l: "detailed requests" },
        { v: "10", l: "Jan 2026 submissions" },
        { v: "1", l: "role specification" },
        { v: "53", l: "web leads" },
      ],
    },
    {
      t: "p",
      html: "77 inbound requests received between December 2025 and October 2026: 20 detailed requests (February 2026) with company size, title, how the buyer found us and stated need; 10 additional submissions from January 2026 (3 classified as buyers, 7 excluded as vendor pitches, misdirected or operator applications); one buyer-written role specification; and 53 web leads with landing page, search term and, where recorded, qualification status. All of it is reported as counts and paraphrase. No company names, contact details or verbatim text appear.",
    },
    {
      t: "p",
      html: "<strong>Not in this edition.</strong> Buyer-quoted budgets from the full coded inbound ledger were not available for this edition.",
    },

    { t: "h3", text: "The Revenue Nomad Rate Index" },
    {
      t: "stats",
      items: [{ v: `n=${f.rates.n}`, l: "hourly rates" }],
      note: `As of ${f.asOf.long}. ${f.byCategory.length} role categories. 2 inputs.`,
    },
    {
      t: "p",
      html: `${f.rates.n} hourly rates as companies pay them, as of ${f.asOf.long}, across ${f.byCategory.length} role categories. It combines two inputs: ${f.rates.surveyN} rates from the operator survey above and ${f.rates.platformN} Revenue Nomad platform listings; operators already in the survey are not counted twice. Every rate is normalized to what the company pays per hour; operator compensation and firm margin are excluded, and no rate comes from another fractional firm's research. Hourly medians, the hours bands and the market estimate in this guide read from the index.`,
    },

    { t: "h2", text: "Sample sizes", id: "sample-sizes" },
    {
      t: "p",
      html: `Every table carries a single n, the total number of records behind it regardless of which source they came from. Every role-level cut carries its n - ${roleCuts.map((c) => `${c.category} (n=${c.n})`).join(", ")} - so readers can weigh it. The index tags highest and lowest only among roles with ${f.rates.floor} records or more; ${list(smallCuts)} sit under that floor, and their n is printed beside every figure. Cross-tabulations (extension by hours, result timing by stage) involve cells as small as 3 to 8; the n is there to weigh them.`,
    },
    { t: "h3", text: "Records behind each role-level cut" },
    {
      t: "table",
      caption: "Figure A.1. Records behind each role-level cut",
      head: ["Role-level cut", "Records (n)"],
      rows: roleCuts.map((c) => [c.category, String(c.n)]),
      firstColHeader: true,
      note: `n per role-level cut in the Rate Index as of ${f.asOf.long}. Bars scaled to the largest value (${largestCut.category}, n=${largestCut.n}).`,
    },

    { t: "h2", text: "External sources", id: "external-sources" },
    {
      t: "p",
      html: "Market-context figures on fractional job titles and postings are from Lightcast's August 2026 analysis of US labor-market data. Full-time compensation and search-cost figures in Chapter 4 are from published 2026 compensation aggregators and executive-search fee guides, cited in-line. We have not cited research published by other fractional talent firms.",
    },

    { t: "h2", text: "Conflict of interest", id: "conflict-of-interest" },
    {
      t: "p",
      html: "Revenue Nomad is a fractional GTM firm and operates a marketplace for fractional GTM talent. We sell what this guide describes. We have tried to let the data lead, to report the findings that cut against our interest (fractional is not cheaper per hour; some situations call for a full-time hire; light engagements rarely extend), and to label every number with its source and size. Readers should weigh our findings accordingly.",
    },

    { t: "h2", text: "Market size estimate", id: "market-size-estimate" },
    {
      t: "stats",
      items: [
        { v: operators(f.market.operatorsCentral), l: "leaders (estimate)" },
        { v: f.marketSpend.central, l: "market (estimate)" },
      ],
    },
    {
      t: "p",
      html: `The ${operators(f.market.operatorsCentral)}-leader and ${f.marketSpend.centralLong} figures in Chapter 1 are estimates, not counts. They combine Lightcast's floor of 34,000 US fractional-titled workers, a published 14% CMO share of fractional executive roles, our assumed 10% to 18% share for sales and revenue roles, an uplift of 1.25 to 1.5 for operators who use "outsourced," "interim" or no modifier, our survey's median for concurrent clients, and the Rate Index median monthly engagement of ${f.engagements.medianMonthly}. Each assumption and its range is stated in the text. We expect the estimate to move as better data arrives and will revise it in each edition.`,
    },
    {
      t: "steps",
      items: [
        { n: "1", title: "Lightcast floor of US fractional-titled workers", html: "", aside: "34,000" },
        { n: "2", title: "Published CMO share of fractional executive roles", html: "", aside: "14%" },
        { n: "3", title: "Assumed share for sales and revenue roles", html: "", aside: "10% to 18%" },
        { n: "4", title: "Uplift for \"outsourced,\" \"interim\" or no modifier", html: "", aside: "1.25 to 1.5" },
        { n: "5", title: "Median for concurrent clients", html: "", aside: "Survey" },
        { n: "6", title: "Median monthly engagement", html: "", aside: "Rate Index" },
      ],
    },

    { t: "h2", eyebrow: "First edition", text: "Baseline year", id: "baseline-year" },
    {
      t: "p",
      html: "This is the first edition. Where we report change over time (rates and demand versus 12 months ago), it is operator-recalled, not measured across two surveys. The 2028 edition will be the first with a true year-over-year comparison, against the Market Pulse table in Chapter 1.",
    },

    { t: "h2", text: "Rounding", id: "rounding" },
    {
      t: "p",
      html: "Percentages are rounded to the nearest whole number and may not sum to 100. Dollar figures are rounded to the nearest $5 (rates) or $100 (monthly fees) unless taken directly from a contract.",
    },

    { t: "h2", text: "How to cite", id: "how-to-cite" },
    { t: "p", html: "Cite as: Revenue Nomad, The Fractional GTM Buyer's Guide 2027" },
  ],
};

export default chapter;
