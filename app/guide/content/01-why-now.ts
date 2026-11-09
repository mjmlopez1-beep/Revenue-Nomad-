import type { Chapter } from "./types";

const LIGHTCAST = "https://lightcast.io/resources/blog/rise-of-fractional-leadership";
const OBSERVER = "https://observer.com/2025/06/how-companies-are-scaling-with-fractional-leaders/";

const chapter: Chapter = {
  slug: "01-why-now",
  number: "01",
  title: "Why this is happening now",
  dek: "The official numbers undercount this market, and the estimate, with the math shown",
  stats: [
    { v: "~14,000", l: "US fractional GTM leaders (range 11,000 to 18,000)" },
    { v: "~$2.8B", l: "US fractional GTM spend a year (range $2.2 to $3.6B)" },
    { v: "265%", l: "growth in \"fractional\" job titles since 2019", s: "Lightcast" },
    { v: "1 of 74", l: "operators found a client through a job post" },
  ],
  blocks: [
    {
      t: "lede",
      html: "Fractional leadership is not new. Companies have rented CFOs for thirty years. What is new is that the practice has moved from finance into the revenue function, and from a workaround into a way of running the business.",
    },

    { t: "h2", eyebrow: "Public data", text: "The official numbers undercount this market", id: "the-official-numbers-undercount-this-market" },
    {
      t: "stats",
      items: [
        { v: "34,000+", l: "US \"fractional\" job titles, 2025" },
        { v: "46%", l: "of fractional postings are finance" },
        { v: "10%", l: "are marketing" },
        { v: "59%", l: "of operators found clients by peer referral" },
      ],
    },
    {
      t: "p",
      html: `Lightcast, the labor-data firm, counted at least 34,000 US workers with "fractional" in their job title in 2025, up 265% since 2019. Fractional job postings nearly doubled in 2025, and the first seven months of 2026 produced more postings than all of 2025 combined (<a href="${LIGHTCAST}">Lightcast</a>).`,
    },
    {
      t: "p",
      html: `Those are the best public numbers available, and they understate what is happening in go-to-market. Here is why. Lightcast's posting data is dominated by finance: 46% of fractional postings are finance roles, and the CFO is the single largest title. Marketing is 10%. Sales barely registers (<a href="${LIGHTCAST}">Lightcast</a>).`,
    },
    {
      t: "p",
      html: "That is not because fractional sales leadership is rare. It is because nobody posts a job for it. In our survey of 74 operators with a current engagement, exactly one found a client through a job post. 59% came through a peer referral, 38% through a marketplace or network, 27% through a prior colleague or employer. A market that runs on referrals is invisible to a dataset that counts postings.",
    },
    {
      t: "stats",
      items: [
        { v: "59%", l: "peer referral" },
        { v: "38%", l: "marketplace or network" },
        { v: "27%", l: "prior colleague or employer" },
        { v: "1", l: "job post" },
      ],
    },
    {
      t: "callout",
      tone: "leaf",
      html: "So take the public growth numbers as a floor. The GTM side of fractional is growing underneath them, and most of it never shows up in a job board.",
    },

    { t: "h2", eyebrow: "Market size", text: "About 14,000 leaders and $2.8 billion a year", id: "about-14000-leaders-and-28-billion-a-year" },
    {
      t: "p",
      html: "Nobody has counted fractional GTM leaders directly, so we built an estimate from public data and our own, and we show the math so you can argue with it.",
    },
    {
      t: "steps",
      items: [
        {
          n: "1",
          title: "The base",
          html: `Lightcast counts at least 34,000 US workers whose current job title contains the word "fractional" (<a href="${LIGHTCAST}">Lightcast</a>). That is the strictest public number available: it requires the word in the title, and Lightcast calls it a floor.`,
          aside: "Running total 34,000",
        },
        {
          n: "2",
          title: "The GTM share",
          html: `Among fractional executive roles, CMOs are the second most common title at 14%, behind CFOs at 18% (<a href="${OBSERVER}">Observer</a>). Add VP and director-level marketing titles and marketing is 16% to 18% of the fractional population.<br><br>Sales and revenue leadership (CRO, CSO, VP Sales, Head of Sales) plus revenue operations and enablement have no published share, but Lightcast identifies sales as one of the two functions where fractional demand began, alongside finance. We put it at 10% to 18%, deliberately no higher than marketing because sales titles are less standardized and more often appear as "interim" or "outsourced" than "fractional."`,
          aside: "GTM total: 26% to 36% = 8,800 - 12,200",
        },
        {
          n: "3",
          title: "The people who do not use the word",
          html: `The base counts only titles containing "fractional." A large share of this market brands itself as "Outsourced VP of Sales," "Interim CRO," "Advisor" or simply "CRO" at their own LLC. The largest sales-leadership networks in the country use "outsourced" rather than "fractional" as their standard title. We apply an uplift of 1.25 to 1.5 for those people, which we believe is conservative.`,
          aside: "Uplift × 1.25 - 1.5",
        },
      ],
    },
    {
      t: "stats",
      items: [
        {
          v: "~14,000",
          l: "US fractional GTM leaders",
          s: "11,000 to 18,000 fractional GTM leaders in the United States, central estimate about 14,000.",
          tone: "forest",
        },
      ],
    },
    {
      t: "p",
      html: "The hard floor, people with \"fractional\" in their title doing GTM work, is roughly 9,000.",
    },
    {
      t: "steps",
      items: [
        {
          n: "4",
          title: "What they bill",
          html: "Operators in our survey run a median of two to three clients at a time, and the Rate Index puts the median monthly engagement at $8,900. At 2.5 clients, 12 months and a 75% utilization haircut for gaps between engagements, the typical operator bills about $200,000 a year.",
          aside: "2.5 clients × $8,900 / mo × 12 months × 75% ≈ ~$200,000 / yr",
        },
      ],
    },
    {
      t: "stats",
      items: [
        {
          v: "~$2.8B",
          l: "US fractional GTM spend",
          s: "Across 11,000 to 18,000 operators, that is $2.2 to $3.6 billion a year in US fractional GTM spend, central estimate about $2.8 billion.",
          tone: "forest",
        },
      ],
    },
    {
      t: "callout",
      tone: "leaf",
      title: "Two sanity checks",
      html: `<strong>~35,000 companies.</strong> First, 14,000 operators at 2.5 clients each means roughly 35,000 US companies have a fractional GTM leader at any given moment. There are several hundred thousand US companies between $5 million and $200 million in revenue, so that is single-digit penetration, which is consistent with a market most CEOs still discover through a peer.<br><br><strong>9,000 - 12,000 operators.</strong> Second, the fractional job-posting data runs at roughly 1,700 postings a year (<a href="${LIGHTCAST}">Lightcast</a>), and one in 74 of our operators' engagements came through a posting. If postings are 1.5% of engagements and GTM is a third of postings, that implies roughly 35,000 GTM engagements a year. At three to four engagements per operator, that is 9,000 to 12,000 active operators in a given year, inside our range.`,
    },
    {
      t: "callout",
      tone: "gold",
      title: "About this estimate",
      html: "Every step here is an assumption you can replace. We will update the estimate each year as better data arrives, and we would rather publish a number with its method than let the market run on a number without one.",
    },

    { t: "h2", eyebrow: "Supply side", text: "What the operators look like", id: "what-the-operators-look-like" },
    { t: "lede", html: "The lazy assumption about fractional executives is that they are between jobs. The data does not support it." },
    {
      t: "p",
      html: "80% of the operators we surveyed say fractional, interim or advisory GTM work is their main income. 68% had three or more paid engagements in the last 12 months; a quarter had six or more. Two in five are running three or more clients at once right now.",
    },
    {
      t: "table",
      caption: "Figure 1.1. Operator income and engagements",
      head: ["Measure", "Share of operators"],
      rows: [
        ["Fractional GTM is main income", "80%"],
        ["3+ paid engagements in last 12 months", "68%"],
        ["6+ paid engagements in last 12 months", "25%"],
        ["Currently serving 3+ clients", "42%"],
      ],
      firstColHeader: true,
      note: "n=81.",
    },
    {
      t: "p",
      html: "This is a professional class. People who have chosen this as a career, built a book of clients, and are pricing and operating like a business. That matters to a buyer because it changes the risk. You are not hiring someone who will leave the moment a full-time offer appears. You are hiring someone whose livelihood depends on your reference.",
    },

    { t: "h2", eyebrow: "Pricing", text: "Rates are rising", id: "rates-are-rising" },
    { t: "lede", html: "That is a healthy market, not a frothy one." },
    {
      t: "stats",
      items: [
        { v: "~3%", l: "typical rate rise over the year" },
        { v: "1 in 3", l: "plan to raise again in 6 months" },
        { v: "61%", l: "plan to hold" },
        { v: "35%", l: "say demand is up" },
      ],
    },
    {
      t: "p",
      html: "The typical operator raised their rate about 3% over the year, the median of each operator's own change among those who recalled both numbers. Of those 60 operators, 30 raised their rate, 27 held it, and 3 cut it. One in three plans to raise again in the next six months; 61% plan to hold.",
    },
    {
      t: "stats",
      items: [
        { v: "30 of 60", l: "Raised" },
        { v: "27 of 60", l: "Held" },
        { v: "3 of 60", l: "Cut" },
      ],
    },
    { t: "h3", text: "Demand" },
    {
      t: "p",
      html: "That is a healthy market, not a frothy one. Rates are moving with demand, and demand is steady more than surging. Asked how demand for their work compares with 12 months ago, on a 1 to 5 scale, 35% said it is up (4 or 5), 50% said about the same, 15% said down.",
    },
    {
      t: "stats",
      items: [
        { v: "35%", l: "demand up" },
        { v: "50%", l: "about the same" },
        { v: "15%", l: "down" },
      ],
    },

    { t: "h2", eyebrow: "Availability", text: "Supply is not the constraint", id: "supply-is-not-the-constraint" },
    {
      t: "stats",
      items: [
        { v: "88%", l: "available to start now" },
        { v: "66%", l: "say steady pipeline is the hardest part" },
      ],
    },
    {
      t: "p",
      html: "On the Revenue Nomad platform, 88% of operators are available to start now, and nearly all within two weeks. Platform signups ran about 9 a month organically before launch in August 2026, then 17 in August and 34 in September.",
    },
    {
      t: "stats",
      items: [
        { v: "~9 / month", l: "Before launch", s: "organic signups" },
        { v: "17", l: "August 2026", s: "signups" },
        { v: "34", l: "September 2026", s: "signups" },
      ],
    },
    {
      t: "p",
      html: "And when we asked operators the hardest part of running a fractional business, 66% said the same thing: steady pipeline. Not delivery. Not clients. Finding the next one.",
    },
    {
      t: "p",
      html: "Read that from the buyer's chair. The supply of experienced revenue leaders who want to work this way is deep, available, and actively looking for the right next engagement.",
    },
    { t: "p", html: "The constraint in this market is not talent. It is matching." },

    { t: "h2", eyebrow: "Why now", text: "Three things converged", id: "three-things-converged" },
    {
      t: "steps",
      items: [
        {
          n: "1",
          title: "Cost of a full-time leader",
          html: "The cost of a full-time revenue leader kept climbing while the tolerance for a bad one kept falling. Chapter 4 does the math, but the short version is that a VP of Sales is a $350,000 cash commitment plus a six-figure search fee plus four months of waiting, and if it does not work, you do it again.",
          aside: "$350,000",
        },
        {
          n: "2",
          title: "The work itself changed",
          html: "AI handles more of the execution. 97% of the operators we surveyed use AI in delivery; 36% say most of their delivery runs through it. A single experienced leader with good tools can now do in 40 hours what used to take a leader and two analysts. The economics of buying a fraction of someone excellent improved.",
          aside: "97% use AI",
        },
        {
          n: "3",
          title: "Seniority of operators",
          html: "And a generation of senior revenue leaders decided they would rather run a portfolio than report to one board. The waitlist for our platform, before we had a single buyer, skewed heavily senior: 44% had run quotas of $50 million or more. Those people did not fall into fractional. They chose it.",
          aside: "44% ran $50M+",
        },
      ],
    },

    { t: "h2", eyebrow: "Figure 1.2", text: "The 2027 Fractional GTM Market Pulse", id: "the-2027-fractional-gtm-market-pulse" },
    {
      t: "table",
      head: ["Indicator", "Reading"],
      rows: [
        ["US fractional GTM leaders (estimate)", "About 14,000 (range 11,000 to 18,000)"],
        ["US fractional GTM spend (estimate)", "About $2.8 billion a year (range $2.2 to $3.6 billion)"],
        ["Median hourly rate", "$225, as companies pay it"],
        ["Median monthly engagement", "$8,900"],
        ["Typical hours per month", "20 to 40 (74% of engagements at 40 or fewer)"],
        ["Engagements with a measurable result inside 60 days", "78%"],
        ["Operators planning to raise rates in 6 months", "32%"],
        ["Operators reporting demand up vs. 12 months ago", "35%"],
        ["Operators reporting demand down", "15%"],
        ["Operators available to start now", "88%"],
        ["Operators citing pipeline as hardest part of the business", "66%"],
        ["Engagements extended past initial term", "57%"],
        ["Engagements ended early", "5%"],
      ],
      firstColHeader: true,
      note: "n=132 operators (81 survey respondents, 51 platform profiles). 2027 is the baseline year for this index. Each edition will report every row against the prior year.",
    },
  ],
};

export default chapter;
