import * as f from "../../guide/content/figures";
import { facts } from "../../home/content/numbers";
import type { RolePage } from "./types";

/**
 * Fractional VP of Sales, from the Design canvas artboard "VPSalesPage" (desktop) and its phone twin.
 * Every dataset figure is read from app/guide/content/figures.ts so the page moves with data/rate-index.json.
 * Figures with no column in the dataset (the Built In $350K full-time figure, the "Six of 20" inbound count,
 * the $4,000 / $7,500 to $10,000 hours illustration, the one-day-a-week client, the case study numbers and the
 * sample profiles) stay as the artboard wrote them.
 */

const vp = f.seat("Sales Director or VP of Sales");
const cro = f.seat("CRO and revenue transformation");
const sl = f.role("Sales Leadership");
const status = f.survey.status;

/** "$3.9k - $12k/month" from the signed Sales Director and VP of Sales contracts. */
const vpMonthly = vp?.monthly ? `${f.k(vp.monthly.min)} - ${f.k(vp.monthly.max)}/month` : "see the Rate Index";
/** "$8.5k - $27k/month" from the CRO and revenue transformation contracts. */
const croMonthly = cro?.monthly ? `${f.k(cro.monthly.min)} - ${f.k(cro.monthly.max)}/month` : "see the Rate Index";
/** Share of sales leadership engagements with a measurable result inside 30 days, e.g. "61%". */
const under30 = f.pct(Math.round((sl.resultUnder30.x / sl.resultUnder30.y) * 100));
/** Share of sales leadership engagements that extended, e.g. "58%". */
const extended = f.pct(Math.round((sl.extended.x / sl.extended.y) * 100));
const endedEarly = f.pct(Math.round((status.endedEarly / status.n) * 100));
const keptGoing = f.pct(100 - Math.round((status.endedEarly / status.n) * 100));
/** "one of 74" engagements converted to full time. */
const converted = `${status.converted === 1 ? "one" : status.converted} of ${status.n}`;
const aiMost = f.pct(f.survey.aiUse.most);

const interim = f.seat("Interim head of sales");

const page: RolePage = {
  slug: "fractional-vp-of-sales",
  role: "Fractional VP of Sales",
  leadersNoun: "sales leaders",
  category: "Sales Leadership",
  meta: {
    title: "Fractional VP of Sales",
    description: `A fractional VP of Sales builds the process, the pipeline and the forecast, then coaches your team to run them. ${vpMonthly} from our 2026 contracts, no fees for companies.`,
  },
  order: ["leaders", "triggers", "does", "cost", "owns", "compare", "engagements", "ninety", "practice", "pick", "faq", "keepReading"],
  hero: {
    eyebrow: "Solutions - Fractional VP of Sales",
    h1: { plain: "A sales engine that", em: "runs without you in every deal" },
    lede: `A fractional VP of Sales builds the process, the pipeline and the forecast, then coaches your team to run them. In our 2027 research, ${under30} of sales leadership engagements showed a measurable result inside 30 days.`,
    primary: { label: "Talk to us", href: "/talk" },
    secondary: { label: "Browse sales leaders", href: "/operators/browse" },
    price: { v: vpMonthly, l: "from our 2026 contracts" },
  },
  triggers: {
    title: "When companies hire one",
    items: [
      {
        title: "The founder is still selling",
        body: "Revenue depends on the founder's calendar, and the company cannot grow past it. The hand-off needs a leader, not just a hire.",
      },
      {
        title: "Growth is all referrals",
        body: "Inbound and word of mouth carried the company this far. There is no repeatable way to create qualified pipeline on purpose.",
      },
      {
        title: "Nobody trusts the forecast",
        body: "The quarter depends on one big deal landing. Leadership wants steady, predictable wins and a number it can plan on.",
      },
      {
        title: "The board is asking harder questions",
        body: "Investors or a PE sponsor want predictable revenue and a credible owner for it - and the answers cannot keep coming from the CEO.",
      },
      {
        title: "The seat is suddenly empty",
        body: "A sales leader left and the search ahead runs months. The team, the pipeline and the forecast cannot wait for it to finish.",
      },
      {
        title: "Quota keeps slipping",
        body: "The reps and the product are fine, but attainment falls short quarter after quarter - and someone has to find what is actually broken.",
      },
    ],
  },
  does: {
    title: "What does a fractional VP of Sales do?",
    intro: "The same job a full-time VP of Sales does, scoped to the days a week your stage needs - and starting within days, not quarters.",
    items: [
      "Sales process and playbook - stages, qualification and the offer, written down and run",
      "An outbound motion that creates pipeline instead of waiting for it",
      "Hiring and ramping the team - SDRs and AEs, with comp plans that pay for the right behavior",
      "A bottoms-up forecast and pipeline reviews leadership can plan on",
      "Deal coaching and taking the big ones into the room with your team",
    ],
  },
  cost: {
    title: "What does one cost?",
    intro: "Fractional engagements run a fraction of a full-time executive's monthly cost, with no search fee and no equity ask.",
    price: { v: vpMonthly, l: "from our 2026 contracts - typically 1 to 3 days a week, a defined first term, then 30 days notice." },
    more: `CRO-level scopes run ${croMonthly}.`,
    link: { label: "See the Rate Index", href: "/research/rate-index" },
    noFees: "No fees for companies - you pay the operator's rate and nothing else.",
  },
  owns: {
    eyebrow: "What the leader works on",
    title: "Six things a fractional VP of Sales owns",
    intro: "The same scope a full-time VP of Sales carries, sequenced to the days a week your stage needs. Each one shows what it covers, what you should see by day 90, and the questions buyers ask first.",
    source: `Figures from the State of Fractional GTM 2027 operator survey, n=${f.survey.detailed}, and the Revenue Nomad Rate Index, ${f.rates.n} rates.`,
    items: [
      {
        n: "01",
        title: "Playbook and sales process",
        sub: "Stages, qualification and the offer, written down.",
        body: "A written sales process the team actually follows - stages defined by what the buyer has agreed to, qualification rules, and an offer reps can quote without asking.",
        byDay90: "Stages redefined in the CRM and the team selling from one playbook.",
        qa: [
          {
            q: "Which sales methodology will they bring?",
            a: "Whichever fits your deal. Solution Selling, MEDDPICC, Value Selling and Challenger lead the list on our platform. Match the leader to your deal size and cycle first, and the method follows.",
          },
          {
            q: "How fast should something measurable show up?",
            a: `Sales leadership is the fastest role to show results. ${under30} of sales engagements in our 2027 survey showed something measurable inside 30 days - usually a clean pipeline or a documented process, not closed revenue yet.`,
          },
        ],
      },
      {
        n: "02",
        title: "Pipeline and outbound",
        sub: "A motion that creates pipeline on purpose.",
        body: "The first repeatable outbound motion - ICP, messaging, sequences, and the first SDR or an outsourced engine on a 90-day pilot.",
        byDay90: "Sequences live, and pipeline you can trace to the motion rather than the founder’s network.",
        qa: [
          {
            q: "How long before outbound shows pipeline?",
            a: "Plan on 60 to 90 days to see pipeline and longer to see revenue. Set the quarter’s metric accordingly.",
          },
          {
            q: "Should we hire the SDR agency first?",
            a: "No. Hire the leader before the agency or SDR vendor so someone owns the strategy they execute. It is one of the nine items on the pre-hire checklist in our 2027 report.",
          },
        ],
      },
      {
        n: "03",
        title: "Forecast",
        sub: "A number the board can plan on.",
        body: "A bottoms-up forecast built on clear stage definitions and a weekly pipeline review, so the call stops changing every week.",
        byDay90: "A weekly forecast cadence the team runs, with the leader coaching rather than doing.",
        qa: [
          {
            q: "When is a forecast problem a RevOps problem?",
            a: "When the CRM and the data are the blocker. Operators said it repeatedly in our survey - a sales leader who does not understand revenue operations will not fix a broken one. RevOps is the most common second fractional hire alongside a sales leader.",
          },
          {
            q: "What does the 90-day readout decide?",
            a: "Next quarter’s number, and whether to extend, expand, convert or end. That readout shows up in nearly every contract we reviewed for the 2027 report.",
          },
        ],
      },
      {
        n: "04",
        title: "Hiring and comp",
        sub: "The right reps, paid for the right behavior.",
        body: "Hiring and ramping the team - SDRs and AEs, with comp plans that pay for the right behavior.",
        byDay90: "If a hire is needed, the job description is out by day 60.",
        qa: [
          {
            q: "Can the fractional leader become our full-time VP?",
            a: `Yes, and the hire-away fee for it is written into the contract up front. In our 2027 survey it happened in ${converted} engagements - more often the leader builds the system and you hire into it.`,
          },
          {
            q: "Is 20 hours a month enough to build a team?",
            a: "Usually not. A Director at 20 hours runs about $4,000 a month; a VP at 30 to 40 hours, $7,500 to $10,000. Expecting a 20-hour Director to behave like a 40-hour VP is one of the ways sales engagements go wrong.",
          },
        ],
      },
      {
        n: "05",
        title: "Coaching and the team",
        sub: "Managers and reps running the system.",
        body: "Deal coaching, call reviews and 1:1s, and taking the big deals into the room with your team.",
        byDay90: "The team runs pipeline review, 1:1s and call reviews, with the leader coaching rather than doing.",
        qa: [
          {
            q: "Who runs the system on the days the leader is not here?",
            a: "Someone you name before day 1. The internal owner keeps the cadence going between the leader’s days - it is on the pre-hire checklist in our 2027 report.",
          },
          {
            q: "Builder or scaler - which do we need?",
            a: "If nobody has written the process yet, a builder - someone who built the motion, hired the first reps and wrote the playbook. Hiring a scaler for a builder’s job is one of the ways sales engagements go wrong in our survey.",
          },
        ],
      },
      {
        n: "06",
        title: "AI in the sales motion",
        sub: "AI inside the workflow, measured by use.",
        body: "Account research, call review, follow-up and reporting mapped to the task and shipped into the CRM the team already uses.",
        byDay90: "Usage you can measure, not tools you bought.",
        qa: [
          {
            q: "Do fractional leaders use AI in the work itself?",
            a: `${f.pct(f.survey.aiUse.share)} of operators in our 2027 survey use AI in delivery, and ${aiMost} say most of their work runs through it. The hours you buy go to judgment, not to building reports by hand.`,
          },
          {
            q: "We bought AI tools and nobody uses them. Is that a sales leader problem?",
            a: "Often. Six of 20 detailed inbound requests we received asked for AI in the sales process directly. Demos are easy. Adoption is the whole job, so measure usage, not deployment.",
          },
        ],
      },
    ],
  },
  compare: {
    title: "Fractional, full time or a consulting firm?",
    intro: "Three ways to put sales leadership in the building. We do not sell advice - we place the leader who owns the number.",
    columns: ["Fractional VP of Sales", "Full-time VP of Sales", "Consulting firm"],
    rows: [
      {
        label: "Starts",
        cells: [`We speak within ${facts.responseHours}, intro calls within days`, "An executive search that commonly runs two quarters", "After scoping, proposal and SOW"],
      },
      {
        label: "Monthly cost",
        cells: [
          `${vpMonthly} - from our 2026 contracts, no search fee, no equity`,
          "~$29k/month - about $350K a year in total cash (Built In), before recruiting and equity",
          "Fixed-fee projects - priced per deliverable, not per outcome",
        ],
      },
      {
        label: "Who owns the number",
        cells: ["The operator - embedded on your leadership team, accountable for the forecast", "The hire - once the ramp is done", "You - recommendations hand the number back"],
      },
      {
        label: "If it is not working",
        cells: ["A defined first term, then 30 days notice", "A severance conversation and a restarted search", "Re-scope the next phase"],
      },
    ],
  },
  engagements: {
    title: "Engagements shaped to the problem",
    cards: [
      {
        title: "Monthly fractional",
        price: { v: vpMonthly, l: "signed VP of Sales contracts, 20 to 40 hours a month" },
        badge: "Most common",
        body: `1 to 3 days a week at ${vpMonthly}. A defined first term of three to six months, then 30 days notice either way.`,
        href: "/how-we-engage/fractional",
      },
      {
        title: "Interim cover",
        price: interim?.monthly ? { v: `${f.k(interim.monthly.min)} - ${f.k(interim.monthly.max)}/month`, l: "signed interim contracts, 130 to 173 hours a month" } : { v: "Full-time hours", l: "priced from the operator's rate" },
        body: "The seat is empty and the search is running. An experienced leader holds the team, the pipeline and the forecast until it lands.",
        href: "/how-we-engage/interim",
      },
      {
        title: "Converts to full time",
        price: { v: "Hire-away terms", l: "written into the contract from day one" },
        body: "When the role becomes a full-time job, hire the person already doing it - with the ramp, the trust and the playbook built.",
        href: "/how-we-engage/full-time",
      },
    ],
    stats: [
      { v: f.pct(f.engagements.resultInside60), l: "of engagements show a measurable result inside 60 days" },
      { v: keptGoing, l: `of engagements kept going - only ${endedEarly} ended early` },
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
        body: "Write the sentence “In 90 days, this will have succeeded if ___.” Agree the reporting line, what the leader can decide without asking, the internal owner, and the opt-out date.",
      },
      {
        n: "2",
        when: "Days 1 - 30",
        title: "Diagnose",
        body: "A read of the funnel, the team, the process, the data and the comp plan. Output is a scored baseline and a roadmap, in a readout to the CEO.",
        note: `${under30} of sales engagements showed a measurable result inside 30 days.`,
      },
      {
        n: "3",
        when: "Days 31 - 60",
        title: "Build",
        body: "ICP and personas rewritten. Sales stages redefined in the CRM. Outbound sequences live. Coaching cadence running. If a hire is needed, the job description is out.",
        note: "The week-8 opt-out sits in this window. By now you know.",
      },
      {
        n: "4",
        when: "Days 61 - 90",
        title: "Run",
        body: "Weekly pipeline review, 1:1s, call reviews and forecast. The team runs the system, the leader coaches. The readout sets next quarter’s number.",
        note: "The readout decides whether to extend, expand, convert or end.",
      },
      {
        n: "5",
        when: "After day 90",
        title: "Decide",
        body: "Whatever you choose, you choose it with a working system in place.",
        note: `${extended} of sales engagements extended. One in ${status.n} converted to full time.`,
      },
    ],
    source: `Structure from the contracts reviewed for the State of Fractional GTM 2027. Results from its operator survey, n=${f.survey.detailed} - role-level cells are smaller.`,
  },
  practice: {
    title: "What it looks like in practice",
    quote: {
      text: "Jeff has been fantastic to work with... I do feel 100% confident that Jeff was the right choice for what we needed at this stage of the game.",
      by: "Neil Trickett, PT",
      context: "CEO, Practice Promotions, five weeks into a fractional VP of Sales engagement - two SDRs hired and training, first AE hire underway",
    },
    caseHref: "/case-studies/practice-promotions",
    caseLabel: "Read the case study",
    stat: {
      v: "+54.8%",
      l: "June sales, year over year, at Grow Pro Agency - year two with its fractional sales leader, as tracked in the company's own reporting.",
    },
    allHref: "/case-studies",
  },
  leaders: {
    title: "Leaders ready for this seat",
    note: "Sample profiles with illustrative data - the live network shows current availability.",
    browse: { label: "Browse sales leaders", href: "/operators/browse" },
    items: [
      {
        name: "Jordan Reyes",
        role: "Fractional VP of Sales",
        blurb: "Founder hand-off and first sales team builds for B2B services companies, $2M to $20M.",
        tags: ["Founder-led transition", "Outbound build"],
        days: "2 days/wk available",
        price: "$6k - $9k/month",
        location: "Remote, US",
        score: 91,
        tier: "Apex",
        reviews: "3 company reviews · 5.0 - would hire again",
      },
      {
        name: "Erin Maxwell",
        role: "Fractional VP of Sales",
        blurb: "Outbound motions and forecast discipline in SaaS and healthcare technology.",
        tags: ["Pipeline and forecasting", "SaaS"],
        days: "1 - 2 days/wk available",
        price: "$5k - $8k/month",
        location: "Remote, US",
        score: 86,
        tier: "Elite",
        reviews: "2 company reviews · 5.0 - would hire again",
      },
      {
        name: "Sam Whitaker",
        role: "Fractional VP of Sales",
        blurb: "Interim cover and turnarounds for agencies and PE-backed services companies.",
        tags: ["Interim leadership", "PE-backed companies"],
        days: "3 days/wk available",
        price: "$7k - $10k/month",
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
        a: "Most engagements run 1 to 3 days a week, set by the scope. One long-running client worked about a day a week - playbook, forecast, pricing and hiring all shipped on that cadence.",
      },
      {
        q: "How fast can we start?",
        a: `Tell us the problem and we speak within ${facts.responseHours}. Intro calls with matched leaders follow within days - most searches for a full-time VP take two quarters.`,
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
        q: "Fractional VP of Sales or a sales consultant?",
        a: "A consultant recommends; our operator runs the team, the pipeline and the forecast as part of your leadership team. We do not sell advice - we place the leader who owns the number.",
      },
      {
        q: "How long do engagements run?",
        a: `A defined first term of three to six months to start. ${f.pct(f.engagements.extendedShare)} of surveyed engagements extended past it, and our longest-running ones are measured in years.`,
      },
      {
        q: "When should a startup hire one?",
        a: "When founder-led selling has proven the offer and the founder's calendar is the bottleneck - usually around the first SDR or AE hires, before a full-time VP is affordable.",
      },
      {
        q: "Can one serve as interim VP of Sales?",
        a: `Yes - full cadence cover for the team, pipeline and forecast while you run the search. When the role becomes the full-time job, the hire-away is priced into the contract up front - in the 2027 survey it happened in ${converted} engagements.`,
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
        title: "How to hire a fractional VP of Sales",
        body: "The screen, the scope and the first 90 days.",
        href: "/guides/hiring-a-fractional-vp-of-sales",
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
