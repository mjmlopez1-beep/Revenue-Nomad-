/**
 * Fractional CMO. Copy from the Design canvas "Revenue Nomad - Option D website", artboards "Desktop -
 * Fractional CMO" (CMOPage.dc.html) and its phone twin, carried word for word in artboard order. Dataset figures
 * (the Marketing rate median, the median month, survey shares and counts) are read from figures.ts so the page
 * moves with data/rate-index.json. Figures with no column stay as the board wrote them and are flagged inline.
 */
import * as f from "../../guide/content/figures";
import type { RolePage } from "./types";

const mk = f.role("Marketing");
const month = f.engagements.monthlyByCategory.find((c) => c.category === "Marketing");
const monthly = `${f.k(month?.medianMonthly)}/month`;
const monthlyNote = "median month, operator survey";
const hoursNote = month?.medianHours != null ? `at about ${month.medianHours} hours a month` : "";
const median = f.category("Marketing").median;
const n = f.survey.detailed;
const share = (x: number, y: number) => f.pct(Math.round((x / y) * 100));
const inside30 = share(mk.resultUnder30.x, mk.resultUnder30.y);
const extended = f.of(mk.extended.x, mk.extended.y);
/** Marketing's inside-60 share has no dataset column (the guide hardcodes it too); confirm before launch. */
const inside60 = f.pct(Math.round((f.role("Marketing").resultUnder60.x / f.role("Marketing").resultUnder60.y) * 100));
/** Most common monthly cadence for Marketing, e.g. "40 hrs" -> 40. */
const modeHours = parseInt(mk.modeHours, 10);
const status = f.survey.status;
const endedEarly = share(status.endedEarly, status.n);
const keptGoing = share(status.n - status.endedEarly, status.n);
const converted = status.converted === 1 ? "one" : String(status.converted);

const page: RolePage = {
  slug: "fractional-cmo",
  role: "Fractional CMO",
  leadersNoun: "marketing leaders",
  category: "Marketing",
  meta: {
    title: "Fractional CMO | Revenue Nomad",
    description: `A marketing leader 1 to 3 days a week, owning positioning, the demand engine and the pipeline marketing produces. ${monthly} median. No fees for companies.`,
  },
  order: ["does", "cost", "triggers", "compare", "owns", "engagements", "ninety", "practice", "pick", "leaders", "faq", "keepReading"],

  hero: {
    eyebrow: "Solutions - Fractional CMO",
    h1: { plain: "Marketing that", em: "proves the pipeline it produces" },
    lede: `A fractional CMO sharpens the positioning, ties every channel to pipeline and cuts the spend that does not produce. In our 2027 research, ${inside60} of marketing engagements showed a measurable result inside 60 days, and ${extended} extended.`,
    primary: { label: "Talk to us", href: "/talk" },
    secondary: { label: "Browse marketing leaders", href: "/operators/browse" },
    price: { v: monthly, l: monthlyNote, s: hoursNote },
  },

  /* The board's "The short answer" block. The list is the six scopes the board names under "Six things a
     fractional CMO owns", title and one-line sub, so the answer has a list to render. */
  does: {
    title: "What does a fractional CMO do?",
    intro:
      "A fractional CMO is a senior marketing leader who works 1 to 3 days a week to own positioning, the demand engine and the pipeline marketing produces - the same job as a full-time CMO, scoped to your stage, and starting within days rather than quarters.",
    items: [
      "Positioning and messaging - one story, told the same way everywhere",
      "Demand engine - channels picked for your buyer",
      "One funnel with sales - shared definitions, one pipeline",
      "Team and agency leadership - every vendor held to the number",
      "Measurement and attribution - reporting the board can actually read",
      "AI and search - found where buyers now research",
    ],
  },

  /* The board's "At a glance" strip: cost, median rate, time, terms, first result, extension, and its source line. */
  cost: {
    title: "At a glance",
    intro: "Rates from the Revenue Nomad Rate Index, as companies pay them. Results from The State of Fractional GTM 2027.",
    price: { v: monthly, l: monthlyNote, s: hoursNote },
    more: `Median rate ${median}/hour, Marketing, Revenue Nomad Rate Index. Time: 1 to 3 days a week - about ${modeHours} hours a month is the norm. Terms: first term of 3 to 6 months, then 30 days notice. First result: ${inside60} inside 60 days, The State of Fractional GTM 2027, n=${n}. Extension: ${extended} extended - the longest-running role in our data.`,
    link: { label: "See the Rate Index", href: "/research/rate-index" },
    noFees: "No fees for companies - you pay the operator's rate.",
  },

  triggers: {
    title: "When companies hire one",
    items: [
      {
        title: "Marketing is channels, not a strategy",
        body: "Ads run, posts publish, emails send - and none of it ladders up to a number anyone owns.",
      },
      {
        title: "Pipeline still comes from referrals",
        body: "Word of mouth carried the company this far. There is no engine that creates demand on purpose.",
      },
      {
        title: "The website and the sales deck disagree",
        body: "Nobody owns positioning, so every asset tells a slightly different story - and buyers notice.",
      },
      {
        title: "The board asks what marketing returns",
        body: "Spend is visible and return is not - and the answers cannot keep coming from the CEO.",
      },
      {
        title: "The last agency did not move the number",
        body: "Deliverables shipped on schedule and pipeline did not change. Execution was never the gap - direction was.",
      },
      {
        title: "AI rewrote the playbook",
        body: "Buyers research through AI answers now. Content, SEO and the funnel need a leader who has already adapted.",
      },
    ],
  },

  compare: {
    title: "Fractional, full time or an agency?",
    intro: "Three ways to put marketing leadership in the building. We do not sell deliverables - we place the leader who owns the number.",
    columns: ["Fractional CMO", "Full-time CMO", "Marketing agency"],
    rows: [
      {
        label: "Starts",
        cells: [
          "We speak within 24 hours, intro calls within days",
          "An executive search that commonly runs two quarters",
          "After scoping and a month of onboarding",
        ],
      },
      {
        label: "Monthly cost",
        cells: [
          `${monthly} - ${monthlyNote}, no search fee, no equity`,
          "Salary, bonus and equity, with search fees on top - and a two-quarter search to get there",
          "Retainers per channel - strategy billed separately",
        ],
      },
      {
        label: "Who owns the number",
        cells: [
          "The operator - embedded on your leadership team, accountable for the forecast",
          "The hire - once the ramp is done",
          "Nobody - agencies own deliverables, not pipeline",
        ],
      },
      {
        label: "If it is not working",
        cells: [
          "A defined first term, then 30 days notice",
          "A severance conversation and a restarted search",
          "Unwind the retainer and lose the context",
        ],
      },
    ],
  },

  owns: {
    eyebrow: "What the leader works on",
    title: "Six things a fractional CMO owns",
    intro:
      "The same scope a full-time CMO carries, sequenced to the days a week your stage needs. Open any one to see what it covers, what you should see by day 90, and the questions buyers ask first.",
    source: `Figures from the State of Fractional GTM 2027 operator survey, n=${n}, and the Revenue Nomad Rate Index, ${f.rates.n} rates.`,
    items: [
      {
        n: "01",
        title: "Positioning and messaging",
        sub: "One story, told the same way everywhere.",
        body: "The story the website, the sales deck and every campaign tell - rewritten so marketing and sales say the same thing to the same buyer.",
        byDay90: "Positioning rewritten and in use on the website and the sales deck.",
        qa: [
          {
            q: "Can positioning fix a product problem?",
            a: "No. Pre-product-market-fit companies that want marketing to solve a product problem were the clearest case where operators in our 2027 survey said they should have declined the engagement.",
          },
          {
            q: "How fast does marketing show results?",
            a: `A little slower than sales. ${inside30} of marketing engagements in our survey showed something measurable inside 30 days, and ${inside60} inside 60.`,
          },
        ],
      },
      {
        n: "02",
        title: "Demand engine",
        sub: "Channels picked for your buyer.",
        body: "The channels that reach your buyer, built to create pipeline on purpose, and the spend that does not produce, cut.",
        byDay90: "A channel plan in market, with pipeline - not lead volume - as the number.",
        qa: [
          {
            q: "Do we need a budget beyond the CMO's fee?",
            a: "Yes. Hiring marketing leadership without a marketing budget was the second most pointed complaint in our survey. Nothing gets executed. Budget for execution, not just the leader.",
          },
          {
            q: "Will a fractional CMO run our campaigns?",
            a: "Decide that before you hire. The most common marketing complaint in our survey was buyers expecting a fractional CMO to run campaigns like a growth marketer. Both are available. They are different people.",
          },
        ],
      },
      {
        n: "03",
        title: "One funnel with sales",
        sub: "Shared definitions, one pipeline.",
        body: "The definitions sales and marketing share, reset, so the weekly review looks at one funnel and the bad-leads argument ends.",
        byDay90: "A weekly cadence where both teams look at the same funnel.",
        qa: [
          {
            q: "Sales says the leads are bad. Where do we start?",
            a: "With the definitions. A team that reports lead volume but not pipeline is the clearest marketing ask in our inbound data. The fix starts with what counts as a lead, then the attribution.",
          },
          {
            q: "What size company runs into this?",
            a: "In our 2027 report the pattern shows up most at $20 to $75 million companies with a marketing team, a budget, and a CEO who cannot connect any of it to revenue.",
          },
        ],
      },
      {
        n: "04",
        title: "Team and agency leadership",
        sub: "Every vendor held to the number.",
        body: "Hiring, scoping and managing the team and the agencies, so specialists execute a strategy someone owns.",
        byDay90: "Agencies and specialists scoped to the one number that matters this quarter.",
        qa: [
          {
            q: "We already have an agency. Do we still need a CMO?",
            a: "Often, and many clients keep the agency. One fractional CMO in our survey put it this way: of 25 founders they had talked to who brought in outside GTM help, 11 had an agency, consultant or hire that did not work out. One operator's experience, not a study. Specialists started executing before anyone owned the strategy.",
          },
          {
            q: "How many hours does a CMO need?",
            a: `${modeHours} hours a month is the norm - the most common cadence among the ${mk.n} marketing engagements in our 2027 survey. Initial terms run three to six months most often.`,
          },
        ],
      },
      {
        n: "05",
        title: "Measurement and attribution",
        sub: "Reporting the board can actually read.",
        body: "Attribution rebuilt so marketing spend connects to pipeline and revenue, in reporting the board can read.",
        byDay90: "Pipeline, not lead volume, reported every week.",
        qa: [
          {
            q: "How long do marketing engagements last?",
            a: `Longer than any other role. ${extended} marketing engagements in our 2027 survey extended past their first term.`,
          },
          {
            q: "What does a fractional CMO cost?",
            a: `${monthly}, ${monthlyNote} - typically 1 to 3 days a week. The Rate Index puts the marketing median at ${median} an hour.`,
          },
        ],
      },
      {
        n: "06",
        title: "AI and search",
        sub: "Found where buyers now research.",
        body: "Content, SEO and the funnel rebuilt for buyers who research through AI answers before they talk to anyone.",
        byDay90: "A content and search plan that covers AI answers, not just Google.",
        qa: [
          {
            q: "Do buyers really find companies through ChatGPT?",
            a: "It is starting. Three of 53 inbound web requests we received this year arrived from ChatGPT or an OpenAI referral rather than Google. Two years ago it was zero.",
          },
          {
            q: "Do fractional marketers use AI in the work?",
            a: `${f.pct(f.survey.aiUse.share)} of operators in our 2027 survey use AI in delivery, and ${f.pct(f.survey.aiUse.most)} say most of their work runs through it.`,
          },
        ],
      },
    ],
  },

  engagements: {
    title: "Engagements shaped to the problem",
    cards: [
      {
        title: "Monthly fractional",
        body: `1 to 3 days a week at ${monthly}, ${monthlyNote}. A defined first term of three to six months, then 30 days notice either way.`,
        href: "/engage/fractional",
      },
      {
        title: "Interim cover",
        body: "The seat is empty and the search is running. An experienced leader holds the team, the pipeline and the forecast until it lands.",
        href: "/engage/interim",
      },
      {
        title: "Converts to full time",
        body: "When the role becomes a full-time job, hire the person already doing it - with the ramp, the trust and the playbook built.",
        href: "/engage/full-time",
      },
    ],
    stats: [
      { v: f.pct(f.engagements.resultInside60), l: "of engagements show a measurable result inside 60 days" },
      { v: keptGoing, l: `of engagements kept going - only ${endedEarly} ended early` },
    ],
    source: `From the State of Fractional GTM 2027 operator survey, n=${n}.`,
  },

  ninety: {
    eyebrow: "The first 90 days",
    title: "What the first 90 days look like",
    intro: "This structure shows up in nearly every contract we reviewed. It is what the market has converged on, and it is how our engagements run.",
    steps: [
      {
        n: "1",
        when: "Before day 1",
        title: "Agree the terms",
        body: 'Write the sentence "In 90 days, this will have succeeded if ___." Agree the reporting line, what the leader can decide without asking, the internal owner, and the opt-out date.',
      },
      {
        n: "2",
        when: "Days 1 - 30",
        title: "Diagnose",
        body: "A read of positioning, the funnel, the team, the spend and the attribution. Output is a scored baseline and a roadmap, in a readout to the CEO.",
        note: `${inside30} of marketing engagements showed a measurable result inside 30 days, ${inside60} inside 60.`,
      },
      {
        n: "3",
        when: "Days 31 - 60",
        title: "Build",
        body: "Positioning rewritten. Channel plan in market. Funnel definitions agreed with sales. Agencies scoped to the number. If a hire is needed, the job description is out.",
        note: "The week-8 opt-out sits in this window. By now you know.",
      },
      {
        n: "4",
        when: "Days 61 - 90",
        title: "Run",
        body: "Weekly funnel review with sales, pipeline reported to the board, agencies held to the number. The readout sets next quarter's number.",
        note: "The readout decides whether to extend, expand, convert or end.",
      },
      {
        n: "5",
        when: "After day 90",
        title: "Decide",
        body: "Whatever you choose, you choose it with a working system in place.",
        note: `Marketing extends more than any role - ${extended} engagements ran past their first term.`,
      },
    ],
    source: `Structure from the contracts reviewed for the State of Fractional GTM 2027. Results from its operator survey, n=${n} - role-level cells are smaller.`,
  },

  practice: {
    title: "What it looks like in practice",
    quote: {
      text: "She's wonderful. She's really, really good.",
      by: "Engagement lead at Skaled, on a placed operator",
      context: "Skaled staffs sales, marketing, RevOps and AI leadership seats from this network",
    },
    caseHref: "/case-studies",
    caseLabel: "Read the case study",
    stat: {
      v: "100%",
      l: "of companies who reviewed their operator would hire them again - every review scored on Communication, Ownership, Results focus and Expertise.",
    },
    allHref: "/case-studies",
  },

  leaders: {
    title: "Leaders ready for this seat",
    note: "Sample profiles with illustrative data - the live network shows current availability.",
    browse: { label: "Browse marketing leaders", href: "/operators/browse" },
    items: [
      {
        name: "Morgan Hale",
        role: "Fractional CMO",
        blurb: "Positioning rebuilds and demand engines for B2B services and SaaS, $2M to $50M.",
        tags: ["Positioning", "Demand generation"],
        days: "2 days/wk available",
        price: "$8k - $14k/month",
        location: "Remote, US",
        score: 85,
        tier: "Elite",
        reviews: "3 company reviews · 5.0 - would hire again",
      },
      {
        name: "Nina Kessler",
        role: "Fractional CMO",
        blurb: "Product marketing and AEO-era content engines for technology companies.",
        tags: ["Product marketing", "AI and AEO"],
        days: "1 - 2 days/wk available",
        price: "$9k - $15k/month",
        location: "Remote, US",
        score: 86,
        tier: "Elite",
        reviews: "2 company reviews · 5.0 - would hire again",
      },
      {
        name: "Marcus Bell",
        role: "Fractional CMO",
        blurb: "Interim cover and brand-to-demand turnarounds for PE-backed companies.",
        tags: ["Interim leadership", "PE-backed companies"],
        days: "3 days/wk available",
        price: "$12k - $20k/month",
        location: "Remote, US",
        score: 88,
        tier: "Elite",
        reviews: "4 company reviews · 4.9 - would hire again",
      },
    ],
  },

  faq: {
    title: "Common questions",
    items: [
      {
        q: "How many days a week do we get?",
        a: "Most engagements run 1 to 3 days a week, set by the scope - positioning and messaging on a lighter cadence, a full demand-engine build on a heavier one.",
      },
      {
        q: "How fast can we start?",
        a: "Tell us the problem and we speak within 24 hours. Intro calls with matched leaders follow within days - most searches for a full-time CMO take two quarters.",
      },
      {
        q: "What if it is not working?",
        a: "A defined first term of three to six months, then 30 days notice. Far less risk than unwinding a bad full-time executive hire.",
      },
      {
        q: "How do we know the leader is good?",
        a: "Every profile carries reviews from the companies that hired the operator - rated on Communication, Ownership, Results focus and Expertise - and whether they would hire again.",
      },
      {
        q: "Fractional CMO or an agency?",
        a: "An agency executes channels; our operator sets direction, runs the team and owns pipeline as part of your leadership team. Many clients keep their agency - the CMO is what finally makes it productive.",
      },
      {
        q: "How long do engagements run?",
        a: `A defined first term of three to six months to start. ${f.pct(f.engagements.extendedShare)} of surveyed engagements extended past it, and our longest-running ones are measured in years.`,
      },
      {
        q: "When should a startup hire one?",
        a: "When the founder's network stops filling pipeline and before the first big demand-generation spend - direction should be set before the budget is.",
      },
      {
        q: "Can one serve as interim CMO?",
        a: `Yes - full cadence cover for the team, the calendar and the pipeline while you run the search. When the role becomes the full-time job, the hire-away is priced into the contract up front - in the 2027 survey it happened in ${converted} of ${status.n} engagements.`,
      },
    ],
  },

  keepReading: {
    title: "Keep reading",
    cards: [
      {
        kicker: "Revenue Nomad research - Rate Index",
        title: "What do fractional leaders charge?",
        body: "Real engagement rates by role, refreshed quarterly.",
        href: "/research/rate-index",
      },
      {
        kicker: "Revenue Nomad research - Guide",
        title: "How to hire a fractional CMO",
        body: "The screen, the scope and the first 90 days.",
        href: "/guides",
      },
      {
        kicker: "Revenue Nomad research - Case studies",
        title: "What changed when companies hired us",
        body: "Seven engagements, in the companies' own numbers.",
        href: "/case-studies",
      },
    ],
  },
};

export default page;
