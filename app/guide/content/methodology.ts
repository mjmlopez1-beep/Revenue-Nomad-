import type { Chapter } from "./types";

const chapter: Chapter = {
  slug: "methodology",
  number: "—",
  title: "Methodology",
  dek: "Five sources, described plainly, so you can judge how much weight a finding deserves",
  stats: [
    { v: "172", l: "unique operators, deduplicated by email" },
    { v: "38", l: "signed engagement contracts" },
    { v: "77", l: "inbound requests" },
    { v: "137", l: "hourly rates in the Rate Index" },
  ],
  blocks: [
    {
      t: "lede",
      html: "This guide draws on five sources, all collected by Revenue Nomad between January 2024 and November 2026: 172 unique fractional GTM operators (survey, platform and waitlist, deduplicated by email), 38 signed engagement contracts, 77 inbound requests, and the Revenue Nomad Rate Index of 137 hourly rates. We describe each plainly so you can judge how much weight a finding deserves.",
    },
    { t: "note", text: "The evidence base: January 2024 to November 2026." },

    { t: "h2", eyebrow: "The data", text: "Five sources", id: "five-sources" },

    { t: "h3", text: "The Fractional GTM Buyer's Guide 2027 operator survey" },
    {
      t: "stats",
      items: [{ v: "n=81", l: "74 detailed" }],
      note: "Sept to Nov 2026. 77% US-based.",
    },
    {
      t: "p",
      html: "An online survey of fractional go-to-market operators, open September to November 2026, distributed through Revenue Nomad's network, platform and partners. 81 responses; 74 described a current or recent engagement in detail. Respondents are 77% US-based. The survey asked about rates, client profile, engagement structure, time to results, extension, and open-ended questions on buying triggers and buyer mistakes.",
    },
    {
      t: "p",
      html: "<strong>Respondents are operators, not buyers.</strong> Where this guide describes what clients did or wanted, it is reporting the operator's account unless a contract or inbound record says otherwise.",
    },

    { t: "h3", text: "Revenue Nomad platform profiles" },
    {
      t: "stats",
      items: [{ v: "n=51", l: "usable profiles" }],
      note: "As of Oct 26, 2026. 105 combined rate points.",
    },
    {
      t: "p",
      html: "Self-entered profile data from operators approved on the Revenue Nomad platform as of October 26, 2026. Of 65 2026 signups and 7 migrated profiles, 51 had usable rate or role data. Fourteen incomplete signups and three internal or test accounts were excluded. Eleven platform operators also answered the survey; their platform rate rows were removed before combining, so the 105 combined rate points are unique individuals.",
    },
    {
      t: "p",
      html: "<strong>Listing rates vs stated rates.</strong> Platform rates are listing rates (what the operator asks); survey rates are stated current rates (what they charge). The medians agree, but the two measure slightly different things.",
    },

    { t: "h3", text: "Signed engagement contracts" },
    {
      t: "stats",
      items: [
        { v: "n=38", l: "engagements" },
        { v: "11", l: "direct clients (14 documents, 2024 to 2026)" },
        { v: "27", l: "partner channel (2025 to 2026)" },
      ],
    },
    {
      t: "p",
      html: "Every signed agreement, statement of work and addendum on file: 11 direct Revenue Nomad clients (14 documents, 2024 to 2026) and 27 engagements delivered through a partner channel (2025 to 2026). Direct-client fees, hours and terms are reported as signed. Partner-channel contracts are used only for engagement structure, scope and term; their fee data reflects operator compensation rather than client price and is not reported. No client is named. Operator compensation and firm margin are excluded throughout.",
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
      items: [{ v: "n=137", l: "hourly rates" }],
      note: "As of Oct 11, 2026. 8 role categories. 5 inputs.",
    },
    {
      t: "p",
      html: "137 hourly rates as companies pay them, as of October 11, 2026, across eight role categories. It combines five inputs: the operator survey above, operator rate conversations, our signed direct contracts, publicly published operator rates and platform listings. Every rate is normalized to what the company pays per hour; operator compensation and firm margin are excluded, and no rate comes from another fractional firm's research. Hourly medians, the hours bands and the market estimate in this guide read from the index.",
    },

    { t: "h2", text: "Sample sizes", id: "sample-sizes" },
    {
      t: "p",
      html: "Every table carries a single n, the total number of records behind it regardless of which source they came from. Every role-level cut carries its n - Sales Leadership (n=48), Marketing (n=18), Revenue Operations (n=13), Sales Enablement (n=8), AI GTM (n=7) - so readers can weigh it. Cross-tabulations (extension by hours, result timing by stage) involve cells as small as 3 to 8 and should be read for pattern, not precision.",
    },
    { t: "h3", text: "Records behind each role-level cut" },
    {
      t: "table",
      caption: "Figure A.1. Records behind each role-level cut",
      head: ["Role-level cut", "Records (n)"],
      rows: [
        ["Sales Leadership", "48"],
        ["Marketing", "18"],
        ["Revenue Operations", "13"],
        ["Sales Enablement", "8"],
        ["AI GTM", "7"],
      ],
      firstColHeader: true,
      note: "n per role-level cut as stated in this appendix. Bars scaled to the largest value (Sales Leadership, n=48).",
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
        { v: "14,000", l: "leaders (estimate)" },
        { v: "$2.8B", l: "market (estimate)" },
      ],
    },
    {
      t: "p",
      html: "The 14,000-leader and $2.8 billion figures in Chapter 1 are estimates, not counts. They combine Lightcast's floor of 34,000 US fractional-titled workers, a published 14% CMO share of fractional executive roles, our assumed 10% to 18% share for sales and revenue roles, an uplift of 1.25 to 1.5 for operators who use \"outsourced,\" \"interim\" or no modifier, our survey's median for concurrent clients, and the Rate Index median monthly engagement. Each assumption and its range is stated in the text. We expect the estimate to move as better data arrives and will revise it in each edition.",
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
