import * as f from "../../guide/content/figures";
import type { RolePage } from "./types";

/**
 * Fractional RevOps leader, from the Design canvas artboard "RevOpsPage" (desktop) and its phone twin.
 * Every dataset figure is read from app/guide/content/figures.ts so the page moves with data/rate-index.json.
 * Figures with no column in the dataset (the director cadence $12k - $15k/month, the 40 to 160 rebuild hours,
 * the 1.5- to 3-month AI deployments, the "7 of 20" inbound count, the case study numbers and the sample
 * profiles) stay as the artboard wrote them.
 */

const ro = f.category("Revenue Operations");
const roRole = f.role("Revenue Operations");
const roMonth = f.engagements.monthlyByCategory.find((c) => c.category === "Revenue Operations");
const sales = f.category("Sales Leadership");
const ai = f.category("AI GTM");
const aiRole = f.role("AI GTM");
const transformation = f.seat("CRO and revenue transformation");
const status = f.survey.status;
const under30 = f.ttr("Under 30 days");

/** The survey's median RevOps month, e.g. "$9,000", and the hours it buys. */
const medianMonth = f.monthly(roMonth?.medianMonthly);
const medianHours = roMonth?.medianHours ?? roRole.medianHours;
/** The largest revenue transformation contract we reviewed, e.g. "$27k". */
const transformationTop = f.k(transformation?.monthly.max);

/** How the RevOps median rate sits against sales leadership, computed so the claim cannot go stale. */
const rateStanding =
  ro.raw != null && sales.raw != null && ro.raw > sales.raw
    ? "the highest median rate of the core roles"
    : ro.raw === sales.raw
      ? "a median rate level with sales leadership, the highest of the core roles"
      : "a median rate just under sales leadership";
const rateStandingShort =
  ro.raw != null && sales.raw != null && ro.raw > sales.raw
    ? "Highest of the core GTM roles"
    : ro.raw === sales.raw
      ? "Level with sales leadership, the highest of the core GTM roles"
      : "Just under sales leadership";

/** AI GTM against the core roles: demand from the survey (roles with more than one answer, as the guide
 * counts it), rate from the Rate Index. */
const aiDemandLead = f.survey.byRole.filter((r) => r.n > 1).every((r) => r.demandMean <= aiRole.demandMean)
  ? "the highest demand of any role in our survey"
  : "demand near the top of our survey";
const aiRateStanding =
  ai.raw != null && ro.raw != null && ai.raw < ro.raw
    ? "below the core roles"
    : ai.raw === ro.raw
      ? `level with the core roles, on ${ai.n} rates`
      : "above the core roles";

const keptGoing = `${100 - Math.round((status.endedEarly / status.n) * 100)}%`;

const page: RolePage = {
  slug: "fractional-revops",
  role: "Fractional RevOps leader",
  leadersNoun: "RevOps leaders",
  category: "Revenue Operations",
  meta: {
    title: "Fractional RevOps leader | Revenue Nomad",
    description: `A fractional RevOps leader puts marketing, sales and customer success on one set of data and reporting, so the forecast holds. Median month ${medianMonth}, operator survey. No fees for companies.`,
  },
  order: ["leaders", "compare", "triggers", "does", "cost", "owns", "engagements", "ninety", "practice", "pick", "faq", "keepReading"],

  hero: {
    eyebrow: "Solutions - Fractional RevOps leader",
    h1: { plain: "A revenue engine that", em: "makes growth predictable" },
    lede: "A fractional RevOps leader puts marketing, sales and customer success on one set of data and reporting, so the forecast holds. In our 2027 research, revenue systems were the top buyer request - 7 of 20.",
    primary: { label: "Talk to us", href: "/talk" },
    secondary: { label: "Browse RevOps leaders", href: "/operators/browse" },
    price: { v: `${medianMonth}/month`, l: "median month, operator survey", s: `${medianHours} hours a month` },
  },

  compare: {
    title: "Fractional, full time or a CRM admin?",
    intro: "Three ways to put revenue operations in the building. We do not sell advice - we place the leader who owns the data model and the forecast.",
    columns: ["Fractional RevOps leader", "Full-time RevOps hire", "CRM admin or agency"],
    rows: [
      {
        label: "Starts",
        cells: ["We speak within 24 hours, intro calls within days", "A search that commonly runs a quarter or two", "Days - for tickets, not direction"],
      },
      {
        label: "Monthly cost",
        cells: [
          `${medianMonth}/month - the median month in our operator survey, no search fee, no equity`,
          "Salary, bonus and equity, with search fees on top",
          "Hourly or per ticket - cheap until you count the rework",
        ],
      },
      {
        label: "Who owns the number",
        cells: [
          "The operator - embedded on your leadership team, accountable for the data model and the forecast",
          "The hire - once the ramp is done",
          "Nobody - tickets get closed, the model stays unowned",
        ],
      },
      {
        label: "If it is not working",
        cells: ["A defined first term, then 30 days notice", "A severance conversation and a restarted search", "Swap vendors and start the context over"],
      },
    ],
  },

  triggers: {
    title: "When companies hire one",
    items: [
      {
        title: "Every team has its own numbers",
        body: "Sales, marketing and CS each built a stack in a silo. Every review ends in an argument about whose number is right.",
      },
      {
        title: "The CRM is a junk drawer",
        body: "Fields nobody fills, stages nobody agrees on, automations nobody remembers building.",
      },
      {
        title: "Reporting takes days and still gets challenged",
        body: "The board deck takes a week to build and falls apart under one question.",
      },
      {
        title: "The forecast is a feeling",
        body: "Commit, best case and coverage mean different things to different people - so the number moves every week.",
      },
      {
        title: "Handoffs leak pipeline",
        body: "Marketing to SDR to AE to CS - every handoff drops leads, and nobody owns the seams.",
      },
      {
        title: "Tools multiplied, insight did not",
        body: "The stack grew one tool at a time. Spend went up, and the answers did not.",
      },
    ],
  },

  does: {
    title: "What does a fractional RevOps leader do?",
    intro: "The same job a full-time RevOps leader does, scoped to the days a week your stage needs - and starting within days, not quarters.",
    items: [
      "One data model - a single definition of a lead, an opportunity and a dollar",
      "A CRM rebuild - stages, fields and hygiene the team actually keeps",
      "A forecast cadence - bottoms-up, reviewed weekly, defensible in the board room",
      "Dashboards and KPIs - one source of truth every team reads",
      "The stack - consolidated tooling, with AI automation where it pays for itself",
    ],
  },

  cost: {
    title: "What does one cost?",
    intro: "Fractional engagements run a fraction of a full-time executive's monthly cost, with no search fee and no equity ask.",
    price: { v: `${medianMonth}/month`, l: `median month, operator survey - ${medianHours} hours a month, hands-on execution cadence` },
    more: `The median RevOps rate is ${ro.median} an hour in the Rate Index, ${rateStandingShort.charAt(0).toLowerCase()}${rateStandingShort.slice(1)}. Director level, about 2 days a week, runs $12k - $15k/month, and larger transformation programs run to about ${transformationTop}/month.`,
    link: { label: "See the Rate Index", href: "/research/rate-index" },
    noFees: "No fees for companies - you pay the operator's rate and nothing else. A Revenue Health Diagnostic, scoped to your business, is the usual starting point.",
  },

  owns: {
    eyebrow: "What the leader works on",
    title: "Six things a fractional RevOps leader owns",
    intro: "The same scope a full-time head of revenue operations carries, sequenced to the days a week your stage needs. Open any one to see what it covers, what you should see by day 90, and the questions buyers ask first.",
    source: `Figures from the State of Fractional GTM 2027 operator survey, n=${f.survey.detailed}, and the Revenue Nomad Rate Index, ${f.rates.n} rates.`,
    items: [
      {
        n: "01",
        title: "Data model",
        sub: "One definition of a lead, an opportunity and a deal.",
        body: "A single definition of a lead, an opportunity and a deal, shared by sales, marketing and customer success, so every report starts from the same numbers.",
        byDay90: "One data model, documented and enforced in the CRM.",
        qa: [
          {
            q: "What does a fractional RevOps leader cost?",
            a: `RevOps carries ${rateStanding} - ${ro.median} an hour in the Rate Index, about ${medianMonth} a month at the survey's median ${medianHours} hours. Larger revenue transformation programs in our 2026 contracts run to about ${transformationTop}/month.`,
          },
          {
            q: "RevOps or a sales leader first?",
            a: "If the motion is the gap, a sales leader. If the data is the blocker, RevOps. They pair well - RevOps is the most common second fractional hire alongside a sales leader, and several operators said the sales leader should not be hired without it.",
          },
        ],
      },
      {
        n: "02",
        title: "CRM rebuild",
        sub: "Stages, fields and hygiene the team keeps.",
        body: "Stages, fields and hygiene rebuilt so the CRM reflects how buyers actually buy, often alongside a migration.",
        byDay90: "Stages redefined and the team keeping the data clean without chasing.",
        qa: [
          {
            q: "What should we check before hiring for a rebuild?",
            a: "Whether they have built the thing, not just run reports on it, and on which CRM. Our 2027 report puts it plainly - RevOps people who can only talk to RevOps people do not last in a fractional seat.",
          },
          {
            q: "Is a CRM migration a fractional job?",
            a: "Yes. A Salesforce migration is one of the common RevOps triggers in our survey, and those engagements run heavy - 40 to 160 hours a month during a rebuild.",
          },
        ],
      },
      {
        n: "03",
        title: "Forecast cadence",
        sub: "Bottoms-up, reviewed weekly, defensible.",
        body: "Stage definitions, an inspection cadence and the reporting layer that make the forecast true.",
        byDay90: "A weekly forecast the board can plan on.",
        qa: [
          {
            q: "When is it time to bring someone in?",
            a: "One operator's rule from our survey - the first time your forecast is off by more than 5%, hire one.",
          },
          {
            q: "Is this a retained role or a project?",
            a: `Usually a project. Only ${f.of(roRole.extended.x, roRole.extended.y)} RevOps engagements in our 2027 survey extended past the first term. They end when the system works, so scope it with an end.`,
          },
        ],
      },
      {
        n: "04",
        title: "Reporting and dashboards",
        sub: "One source of truth every team reads.",
        body: "Dashboards and KPIs every team reads from the same data, built to answer the board's question the first time.",
        byDay90: "The board deck builds from dashboards, not a week of spreadsheets.",
        qa: [
          {
            q: "We are preparing for a raise or a sale. When should we start?",
            a: "Earlier than feels necessary. Twelve months of clean data is worth far more than three, and a diligence team will look at the pipeline.",
          },
          {
            q: "Light advisory or a full rebuild?",
            a: "RevOps hours are bimodal in our survey - under 20 a month advising a team that executes, or 40 to 160 running a rebuild. Almost nothing in between.",
          },
        ],
      },
      {
        n: "05",
        title: "The stack",
        sub: "Every tool tied to a job.",
        body: "Systems design, integrations and the tooling roadmap, consolidated so each tool does a job the revenue process needs.",
        byDay90: "A documented stack, with every tool tied to a job and its integrations mapped.",
        qa: [
          {
            q: "Where does the diagnostic fit?",
            a: "It is how most RevOps engagements start. The Revenue Health Diagnostic scores 21 building blocks across seven pillars, including AI, and hands you a prioritized roadmap.",
          },
          {
            q: "What does a RevOps leader need from us?",
            a: "Access, and a plain-language owner - the CRM, the data, and someone internal who keeps the system running on the days the leader is not there.",
          },
        ],
      },
      {
        n: "06",
        title: "AI and automation",
        sub: "Automation where it pays for itself.",
        body: "The revenue process mapped to the task level, the work AI should absorb identified, and assistants shipped into the CRM the team already uses.",
        byDay90: "Assistants in the workflow, measured by usage.",
        qa: [
          {
            q: "How long does an AI deployment take?",
            a: "The AI deployment contracts in our 2027 data were 1.5- to 3-month projects - deploy specific assistants into a sales team's CRM and get them adopted.",
          },
          {
            q: "Is AI GTM its own hire?",
            a: `For now. AI GTM has ${aiDemandLead} and a median rate of about ${ai.median} an hour, ${aiRateStanding}. We expect the skill to fold into RevOps and sales leadership.`,
          },
        ],
      },
    ],
  },

  engagements: {
    title: "Engagements shaped to the problem",
    cards: [
      {
        title: "Diagnostic first",
        body: "A Revenue Health Diagnostic - a scored read across seven pillars and a prioritized roadmap in about a month.",
        href: "/revenue-health-diagnostic",
      },
      {
        title: "Monthly fractional",
        price: { v: `${medianMonth}/month`, l: `starting point: median month at about ${medianHours} hours, operator survey` },
        badge: "Most common",
        body: `Hands-on execution at the survey's median month of ${medianMonth}, or a director cadence at about 2 days a week for $12k - $15k/month.`,
        href: "/how-we-engage/fractional",
      },
      {
        title: "Converts to full time",
        price: { v: "Hire-away terms", l: "written into the contract from day one" },
        body: "When the role becomes a full-time job, hire the person already doing it - with the data model, the cadence and the trust built.",
        href: "/how-we-engage/full-time",
      },
    ],
    stats: [
      { v: f.pct(f.engagements.resultInside60), l: "of engagements show a measurable result inside 60 days" },
      { v: keptGoing, l: `of engagements kept going - only ${f.of(status.endedEarly, status.n)} ended early` },
    ],
    source: `From the State of Fractional GTM 2027 operator survey, n=${f.survey.detailed}.`,
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
        body: "A read of the CRM, the data, the process and the reporting - often scoped as the Revenue Health Diagnostic. Output is a scored baseline and a roadmap.",
        note: `${f.pct(under30.share)} of operators hit a first measurable result inside 30 days.`,
      },
      {
        n: "3",
        when: "Days 31 - 60",
        title: "Build",
        body: "One data model. Stages and fields rebuilt in the CRM. Dashboards connected to one source of truth. Integrations mapped.",
        note: "The week-8 opt-out sits in this window. By now you know.",
      },
      {
        n: "4",
        when: "Days 61 - 90",
        title: "Run",
        body: "Weekly forecast cadence, the team keeping the data, dashboards replacing the spreadsheet deck. The readout sets what comes next.",
        note: "The readout decides whether to extend, expand or end.",
      },
      {
        n: "5",
        when: "After day 90",
        title: "Decide",
        body: "Whatever you choose, you choose it with a working system in place.",
        note: `Usually a project with an end - only ${f.of(roRole.extended.x, roRole.extended.y)} RevOps engagements extended. They end when the system works.`,
      },
    ],
    source: `Structure from the contracts reviewed for the State of Fractional GTM 2027. Results from its operator survey, n=${f.survey.detailed} - role-level cells are smaller.`,
  },

  practice: {
    title: "What it looks like in practice",
    quote: {
      text: "RevOps execution is where strategy goes to live or die - so the diagnostic comes first, and the roadmap earns the retainer.",
      by: "How our engagements start",
      context: "A month-one Revenue Health Diagnostic became a 15-month roadmap at a $400M ARR software company, and the operating rhythm it built still runs",
    },
    caseHref: "/case-studies",
    caseLabel: "Read the case study",
    stat: {
      v: "15 months",
      l: "A month-one diagnostic became a 15-month roadmap at a $400M ARR software company. The operating rhythm held after the build phase, run by its own RevOps team.",
    },
    allHref: "/case-studies",
  },

  leaders: {
    title: "Leaders ready for this seat",
    note: "Sample profiles with illustrative data - the live network shows current availability.",
    browse: { label: "Browse RevOps leaders", href: "/operators/browse" },
    items: [
      {
        name: "Priya Raman",
        role: "Fractional RevOps leader",
        blurb: "CRM rebuilds and forecast discipline for SaaS and services companies.",
        tags: ["CRM rebuild", "Forecasting"],
        days: "2 days/wk available",
        price: "$8k - $13k/month",
        location: "Remote, US",
        score: 91,
        tier: "Apex",
        reviews: "3 company reviews · 5.0 - would hire again",
      },
      {
        name: "Owen Garcia",
        role: "Fractional RevOps leader",
        blurb: "Diagnostic-led builds for companies moving off spreadsheets.",
        tags: ["Diagnostics", "Data and dashboards"],
        days: "1 - 2 days/wk available",
        price: "$6k - $10k/month",
        location: "Remote, US",
        score: 86,
        tier: "Elite",
        reviews: "2 company reviews · 5.0 - would hire again",
      },
      {
        name: "Claire Dunn",
        role: "Fractional RevOps director",
        blurb: "Director cadence and operating rhythm for PE-backed portfolios.",
        tags: ["Operating cadence", "PE-backed companies"],
        days: "2 days/wk available",
        price: "$12k - $15k/month",
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
        a: "Execution engagements run 1 to 3 days a week; a director cadence runs about 2. The diagnostic that starts most engagements takes about a month.",
      },
      {
        q: "How fast can we start?",
        a: "Tell us the problem and we speak within 24 hours. Intro calls with matched leaders follow within days.",
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
        q: "RevOps leader or a CRM admin?",
        a: "An admin closes tickets; our leader owns the data model, the cadence and the forecast. Many teams keep their admin - the leader is what finally gives the work direction.",
      },
      {
        q: "How long do engagements run?",
        a: `A defined first term of three to six months to start. ${f.pct(f.engagements.extendedShare)} of surveyed engagements extended past it, and our longest-running ones are measured in years.`,
      },
      {
        q: "What does the diagnostic cover?",
        a: "A scored read of the revenue engine across seven pillars, including where AI can make sellers more effective, and a prioritized roadmap in about a month. It is how most engagements start, and it is scoped to your business.",
      },
      {
        q: "Can one serve during a leadership gap?",
        a: `Yes - the reporting, the forecast and the operating cadence hold while you search. When the role becomes the full-time job, the hire-away is priced into the contract up front - in the 2027 survey it happened in ${status.converted === 1 ? "one" : status.converted} of ${status.n} engagements.`,
      },
    ],
  },

  keepReading: {
    title: "Keep reading",
    cards: [
      {
        kicker: "Rate Index",
        title: "What do fractional leaders charge?",
        body: "Real engagement rates by role, refreshed quarterly.",
        href: "/research/rate-index",
      },
      {
        kicker: "Guide",
        title: "Should you fix your CRM or switch",
        body: "The decision framework we run inside engagements.",
        href: "/guides",
      },
      {
        kicker: "Case studies",
        title: "What changed when companies hired us",
        body: "Seven engagements, in the companies' own numbers.",
        href: "/case-studies",
      },
    ],
  },
};

export default page;
