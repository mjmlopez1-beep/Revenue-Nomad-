/**
 * Fractional AI GTM leader. There is no artboard for this page: it follows the VP of Sales board's structure,
 * section order and voice, with content drawn from the Buyer's Guide (Chapter 6, the AI GTM section, and
 * Chapter 10, AI and what comes next), the "AI that pays for itself" problem page and the Rate Index.
 * Every dataset figure is read from figures.ts; the sample leader profiles are illustrative.
 */
import type { RolePage } from "./types";
import * as f from "../../guide/content/figures";

/* The Rate Index cut: eight rates, so the guide calls it directional. */
const cat = f.category("AI GTM");
/* The operator survey cut for the role: seven operators. */
const role = f.role("AI GTM");
/* The median month for the category, from the engagements operators described. */
const month = f.engagements.monthlyByCategory.find((c) => c.category === "AI GTM");
const monthly = f.monthly(month?.medianMonthly);
const monthlyHours = month?.medianHours ?? "n/a";
const monthlyN = month?.n ?? 0;
const price = `${monthly}/month`;
const priceNote = `median month at about ${monthlyHours} hours, operator survey`;

/* AI use in delivery, and the two neighbouring roles the guide expects AI GTM to reprice toward. */
const ai = f.survey.aiUse;
const mostAi = f.plansByAi("Most");
const someAi = f.plansByAi("Some");
const revOps = f.category("Revenue Operations");
const enablement = f.category("Sales Enablement");

const under30 = f.of(role.resultUnder30.x, role.resultUnder30.y);
const extended = f.of(role.extended.x, role.extended.y);
const surveyN = f.survey.detailed;

const page: RolePage = {
  slug: "fractional-ai-gtm",
  role: "Fractional AI GTM leader",
  leadersNoun: "AI GTM leaders",
  category: "AI GTM",
  meta: {
    title: "Fractional AI GTM leader",
    description: `Hire a fractional AI GTM leader who maps your revenue process to the task level, ships AI into the workflow your team already uses and measures adoption. ${cat.median} an hour median on the Rate Index, ${monthly} a month median in the engagements operators described. No fees for companies.`,
  },
  order: ["leaders", "triggers", "does", "cost", "owns", "compare", "engagements", "ninety", "practice", "pick", "faq", "keepReading"],

  hero: {
    eyebrow: "Solutions - Fractional AI GTM leader",
    h1: { plain: "AI in your revenue process that", em: "the team actually uses" },
    lede: `A fractional AI GTM leader maps the revenue process to the task level, picks what to automate, ships it into the tools your team already works in and measures adoption. In our 2027 research, ${under30} AI GTM engagements showed a measurable result inside 30 days, and ${extended} extended.`,
    primary: { label: "Talk to us", href: "/talk" },
    secondary: { label: "Browse AI GTM leaders", href: "/operators/browse" },
    price: { v: price, l: priceNote },
  },

  triggers: {
    title: "When companies hire one",
    items: [
      {
        title: "AI tools were bought and nobody uses them",
        body: "The licenses are paid for and the demos went well. Adoption never happened, because nobody owned it - and nobody mapped the work the tools were meant to replace.",
      },
      {
        title: "Reps still do the work by hand",
        body: "Account research, call notes, follow-up and reporting eat the selling week. The time AI should be giving back to the team is still going to admin.",
      },
      {
        title: "Pilots never leave the pilot",
        body: "A use case worked for one rep or one quarter and then stalled. Nothing was built into the workflow, so nothing stuck.",
      },
      {
        title: "The board wants an AI plan",
        body: "Investors or a PE sponsor ask what the company is doing with AI in revenue - and there is no owner for the answer.",
      },
      {
        title: "Nobody can say what pays back",
        body: "Spend on AI tools is visible and the return is not. Usage, time saved and pipeline were never measured, so every renewal is a guess.",
      },
      {
        title: "The data is not ready",
        body: "Scoring, routing and forecasting with AI need clean data foundations first. The CRM is not there yet, and nobody owns getting it there.",
      },
    ],
  },

  does: {
    title: "What does a fractional AI GTM leader do?",
    intro: "A leader who puts AI into the revenue process - lead scoring, outbound automation, call intelligence, assistants embedded in the CRM, and increasingly the strategy for which revenue tasks should be automated at all. Scoped to the hours the work needs, starting within days, not quarters.",
    items: [
      "A task-level map of the revenue process - which tasks AI absorbs, which stay with people, and in what order",
      "Lead scoring, routing and account research shipped into the CRM the team already uses",
      "Outbound automation and follow-up that runs inside the sequence tools, measured by replies and meetings rather than sends",
      "Call intelligence - call review, next steps and CRM updates done by the tools, coached by the manager",
      "Data foundations clean enough for scoring, routing and forecasting to work on",
      "Adoption measured weekly - the tools that earn a place in the workflow stay, the rest get cut",
    ],
  },

  cost: {
    title: "What does one cost?",
    intro: "AI GTM is the most wanted role in our research and, so far, priced at the market median - with no search fee and no equity ask.",
    price: { v: `${cat.median}/hour`, l: `median rate, Revenue Nomad Rate Index - ${cat.n} rates, so directional` },
    more: `The middle half of AI GTM rates runs ${cat.p25} - ${cat.p75} an hour. In the engagements operators described, the median AI GTM month was ${monthly} at about ${monthlyHours} hours (${monthlyN} engagements). Our 2027 guide expects the rate to move toward the ${revOps.median} - ${enablement.median} that RevOps and enablement command - if you are buying this in 2027, you are buying early.`,
    link: { label: "See the Rate Index", href: "/research/rate-index" },
    noFees: "No fees for companies - you pay the operator's rate and nothing else.",
  },

  owns: {
    eyebrow: "What the leader works on",
    title: "Six things a fractional AI GTM leader owns",
    intro: "The same scope a full-time head of revenue AI would carry, sequenced so the first use cases ship before the strategy deck does. Open any one to see what it covers, what you should see by day 90, and the questions buyers ask first.",
    source: `Figures from the State of Fractional GTM 2027 operator survey, n=${surveyN}, and the Revenue Nomad Rate Index, ${f.rates.n} rates. The AI GTM cells are ${role.n} operators and ${cat.n} rates, so directional.`,
    items: [
      {
        n: "01",
        title: "The task-level map",
        sub: "Which revenue tasks AI absorbs, and in what order.",
        body: "The revenue process written down by task, not by role - research, qualification, follow-up, call notes, reporting, forecasting - with a call on which tasks GenAI can take over, which it can assist, and which stay with people. The map decides what gets built first.",
        byDay90: "A written map of the revenue process by task, the first two use cases shipped and the next three sequenced.",
        qa: [
          {
            q: "Where do we start - the tool or the map?",
            a: "The map. AI in go-to-market fails the same way most tools do: it gets bought before anyone maps the work it should do. Once the tasks are written down, the tool has something specific to replace, and you can see whether it did.",
          },
          {
            q: "Do we need an AI person or an AI tool?",
            a: "A leader first. Tools without an owner become shelfware. The leader decides which tools earn a place in the workflow - and which of the ones you already pay for should go.",
          },
        ],
      },
      {
        n: "02",
        title: "Scoring, routing and research",
        sub: "Clean signals, inside the CRM the team already uses.",
        body: "Lead scoring and routing built on the data you actually have, account research assembled before the call rather than during it, and all of it surfaced where the rep already works - not in a tool they have to open.",
        byDay90: "Scoring and routing live in the CRM, research briefs arriving before first calls, and a usage number for each.",
        qa: [
          {
            q: "Our CRM data is a mess. Does that block this?",
            a: "For scoring, routing and forecasting, yes - those need clean data foundations first. The leader starts there, or pairs with a RevOps leader when the data model itself is the job. Account research and call review can usually ship before the data is clean.",
          },
          {
            q: "Which tools will they bring?",
            a: `Whichever earn a place in the workflow. "AI Sales Automation" is one of the five most common expertise tags on our platform (22 of ${f.platform.usable} operators), so the claim is common. The proof is rarer - ask to see something shipped into a real revenue team's workflow, not a demo.`,
          },
        ],
      },
      {
        n: "03",
        title: "Outbound and follow-up automation",
        sub: "Speed without adding to the noise.",
        body: "Follow-up written from what the rep learned on the call, sequences that run inside the tools the team has, and research that narrows the list instead of widening it. Measured by replies and meetings - never by sends.",
        byDay90: "Follow-up and sequencing automated for the whole team, with reply and meeting rates tracked against the hand-written baseline.",
        qa: [
          {
            q: "Will AI outbound just add to the noise?",
            a: "It will if it is measured on volume. Your buyers already get the same AI-written email from dozens of vendors a week. The leader uses AI for the research and the follow-up, keeps the target narrow and counts meetings with the right accounts, not opens.",
          },
          {
            q: "How fast should something measurable show up?",
            a: `${under30} AI GTM engagements in our 2027 survey showed something measurable inside 30 days - usually usage and hours back per rep, not closed revenue yet. Set the quarter's metric accordingly.`,
          },
        ],
      },
      {
        n: "04",
        title: "Call intelligence and coaching",
        sub: "Call review, next steps and CRM updates done by the tools.",
        body: "Every call reviewed, summarized and logged without the rep typing it up, next steps drafted for the manager to approve, and coaching themes pulled from the calls themselves rather than from memory.",
        byDay90: "Call review running on every recorded call, CRM updates written by the tools, and managers coaching from the output.",
        qa: [
          {
            q: "Do fractional leaders use AI in their own work?",
            a: `${f.pct(ai.share)} of operators in our 2027 survey use AI in delivery, and ${f.pct(ai.most)} say most of their work runs through it. The hours you buy go to judgment, not to building reports by hand - and the leader has already made the tools work for one team: their own.`,
          },
          {
            q: "What does the 90-day readout decide?",
            a: "Which use cases stay, which get cut, and whether to extend, expand, convert or end the engagement. That readout shows up in nearly every contract we reviewed for the 2027 report.",
          },
        ],
      },
      {
        n: "05",
        title: "Data foundations and governance",
        sub: "Data clean enough for AI to work on, and rules for what it may do.",
        body: "The fields, definitions and hygiene that scoring, routing and forecasting depend on, plus the rules: what the tools may write to the CRM, what they may send to a buyer, and who reviews it.",
        byDay90: "A data model the tools can run on, written rules for what AI may do unsupervised, and an internal owner named for both.",
        qa: [
          {
            q: "Who runs the system on the days the leader is not here?",
            a: "Someone you name before day 1. The internal owner keeps the usage review going and answers the team's questions between the leader's days - it is on the pre-hire checklist in our 2027 report.",
          },
          {
            q: "Is this really a RevOps job?",
            a: `Often the two overlap, and increasingly the AI work is folded into the sales and RevOps roles rather than bought separately - ${f.pct(ai.share)} of operators already use AI in delivery. Buy the AI GTM seat when the mapping and adoption work is the job; buy RevOps when the data model and the forecast are.`,
          },
        ],
      },
      {
        n: "06",
        title: "Adoption, measured",
        sub: "Usage you can measure, not tools you bought.",
        body: "Weekly usage by rep and by use case, hours back per seller, then pipeline and win rate. Tools that are not used get fixed or cut, and every renewal is decided on the numbers.",
        byDay90: "A usage dashboard the team runs, a payback number for every live use case, and a renewal decision for every license you pay for.",
        qa: [
          {
            q: "How do we measure payback?",
            a: "Usage, then time saved, then pipeline and win rate - in that order. If reps are not using it, nothing downstream moves, so usage is the first number on the dashboard and the one the leader is held to.",
          },
          {
            q: "We bought AI tools and nobody uses them. Is that a leadership problem?",
            a: "Often. Six of 20 detailed inbound requests we received asked for AI in the sales process directly. Demos are easy. Adoption is the whole job, so measure usage, not deployment.",
          },
        ],
      },
    ],
  },

  compare: {
    title: "Fractional, full time or an AI vendor?",
    intro: "Three ways to put AI into the revenue process. We do not sell software - we place the leader who owns whether it gets used.",
    columns: ["Fractional AI GTM leader", "Full-time head of revenue AI", "AI vendor or agency"],
    rows: [
      {
        label: "Starts",
        cells: [
          "We speak within 24 hours, intro calls within days",
          "An executive search for a job description few companies have written before - commonly two quarters",
          "After the demo, the pilot and the annual contract",
        ],
      },
      {
        label: "Monthly cost",
        cells: [
          `${price} - ${priceNote}, no search fee, no equity`,
          "A full-time executive's salary and equity, for work most companies cannot yet fill 40 hours a week",
          "Seat licenses plus implementation fees - priced per seat, not per outcome",
        ],
      },
      {
        label: "Who owns adoption",
        cells: [
          "The operator - embedded on your leadership team, measured on usage and hours back",
          "The hire - once the ramp is done",
          "You - the vendor ships the tool and hands adoption back",
        ],
      },
      {
        label: "If it is not working",
        cells: ["A defined first term, then 30 days notice", "A severance conversation and a restarted search", "An annual contract you are still paying for"],
      },
    ],
    note: `AI GTM has the highest demand trend of any role in our 2027 survey with more than one answer (${role.demandMean} of 5, on ${role.n} operators) and a median rate of ${cat.median} an hour - the market median. Buyers want it more than anything else and pay the going rate for it, not a premium.`,
  },

  engagements: {
    title: "Engagements shaped to the problem",
    cards: [
      {
        title: "Monthly fractional",
        price: { v: price, l: `starting point: ${priceNote}` },
        badge: "Most common",
        body: `Scoped to the hours the work needs, ${price} at about ${monthlyHours} hours - the median month in the engagements operators described. A defined first term of three to six months, then 30 days notice either way.`,
        href: "/how-we-engage/fractional",
      },
      {
        title: "The Diagnostic first",
        body: "When you want the map before the leader. The Revenue Health Diagnostic's AI pillar maps where AI can raise seller effectiveness and GTM efficiency, with a prioritized roadmap in 30 to 60 days.",
        href: "/revenue-health-diagnostic",
      },
      {
        title: "Inside another seat",
        body: `Increasingly the AI work is folded into a sales or RevOps engagement rather than bought separately - ${f.pct(ai.share)} of operators already use AI in delivery. When the number is the problem and AI is the method, hire the leader who owns the number.`,
        href: "/fractional-vp-of-sales",
      },
    ],
    stats: [
      { v: f.pct(f.engagements.resultInside60), l: "of engagements show a measurable result inside 60 days" },
      { v: extended, l: "AI GTM engagements extended past the first term" },
    ],
    source: `From the State of Fractional GTM 2027 operator survey, n=${surveyN}. The AI GTM cell is ${role.n} operators, so directional.`,
  },

  ninety: {
    eyebrow: "The first 90 days",
    title: "What the first 90 days look like",
    intro: "This structure shows up in nearly every contract we reviewed. It is what the market has converged on, and it is how our engagements run - with the first use cases shipped inside it.",
    steps: [
      {
        n: "1",
        when: "Before day 1",
        title: "Agree the terms",
        body: "Write the sentence \"In 90 days, this will have succeeded if ___.\" Agree the reporting line, what the leader can decide without asking, what the tools may do unsupervised, the internal owner, and the opt-out date.",
      },
      {
        n: "2",
        when: "Days 1 - 30",
        title: "Map",
        body: "The revenue process written down by task. A read of the data, the tools already paid for and how much of the selling week goes to admin. Output is a baseline of hours per rep per task and a sequenced list of use cases, in a readout to the CEO.",
        note: `${under30} AI GTM engagements showed a measurable result inside 30 days.`,
      },
      {
        n: "3",
        when: "Days 31 - 60",
        title: "Ship",
        body: "The first two use cases live inside the CRM and the sequence tools - usually account research and call review. The usage dashboard is up. Tools nobody uses get a fix date or a cancellation date.",
        note: "The week-8 opt-out sits in this window. By now you know.",
      },
      {
        n: "4",
        when: "Days 61 - 90",
        title: "Adopt",
        body: "Weekly usage review by rep and use case. Managers coach from the call output. The next three use cases ship. The readout sets the payback number for each and next quarter's plan.",
        note: "The readout decides whether to extend, expand, convert or end.",
      },
      {
        n: "5",
        when: "After day 90",
        title: "Decide",
        body: "Whatever you choose, you choose it with the map written, the first use cases in daily use and a usage number for every tool you pay for.",
        note: `${extended} AI GTM engagements extended. ${f.pct(f.engagements.extendedShare)} of all surveyed engagements did.`,
      },
    ],
    source: `Structure from the contracts reviewed for the State of Fractional GTM 2027. Results from its operator survey, n=${surveyN} - the AI GTM cell is ${role.n} operators.`,
  },

  practice: {
    title: "What it looks like in practice",
    quote: {
      text: "A fractional CRO in 2028 who cannot put AI into a revenue process will not be a fractional CRO for long.",
      by: "The Fractional GTM Buyer's Guide 2027",
      context: `Chapter 10, on why the AI GTM title will fade and the skill become table stakes - ${f.pct(ai.share)} of operators already use AI in delivery, ${f.pct(ai.most)} for most of their work`,
    },
    caseHref: "/case-studies",
    caseLabel: "Read the case studies",
    stat: {
      v: "85 hours",
      l: "a month - one direct contract, a Lead Revenue Architect running a GTM transformation program with a CFO sponsor. The closest thing in our data to an AI-first revenue team, and the shape the guide expects to be common by 2030.",
      s: "Revenue Nomad direct contracts, reviewed for the 2027 guide",
    },
    allHref: "/case-studies",
  },

  leaders: {
    title: "Leaders ready for this seat",
    note: "Sample profiles with illustrative data - the live network shows current availability.",
    browse: { label: "Browse AI GTM leaders", href: "/operators/browse" },
    items: [
      {
        name: "Priya Natarajan",
        role: "Fractional AI GTM leader",
        blurb: "Task-level maps and shipped use cases for B2B services and healthcare technology sales teams, $2M to $20M.",
        tags: ["Revenue process mapping", "CRM-embedded AI"],
        days: "1 - 2 days/wk available",
        price: "$6k - $9k/month",
        location: "Remote, US",
        score: 88,
        tier: "Elite",
        reviews: "3 company reviews · 5.0 - would hire again",
      },
      {
        name: "Marcus Bell",
        role: "Fractional AI GTM leader",
        blurb: "Outbound automation and call intelligence for SaaS sales teams of 5 to 25 reps, measured on hours back per seller.",
        tags: ["Outbound automation", "Call intelligence"],
        days: "1 day/wk available",
        price: "$5k - $7k/month",
        location: "Remote, US",
        score: 77,
        tier: "Trusted",
        reviews: "2 company reviews · 4.9 - would hire again",
      },
      {
        name: "Dana Okafor",
        role: "Fractional AI GTM leader",
        blurb: "Data foundations, scoring and AI governance for PE-backed services companies, usually alongside a RevOps build.",
        tags: ["Data foundations", "PE-backed companies"],
        days: "2 days/wk available",
        price: "$7k - $11k/month",
        location: "Remote, US",
        score: 92,
        tier: "Apex",
        reviews: "4 company reviews · 5.0 - would hire again",
      },
    ],
  },

  faq: {
    title: "Common questions",
    items: [
      {
        q: "How many hours a month do we get?",
        a: `Scoped to the work. The median AI GTM month in the engagements operators described was ${monthly} at about ${monthlyHours} hours; the AI GTM operators in our survey report a median of ${role.medianHours} hours a month across their clients, the most of the five roles in the guide. A task-level map and two shipped use cases is a different month from running the whole system.`,
      },
      {
        q: "How fast can we start?",
        a: "Tell us the problem and we speak within 24 hours. Intro calls with matched leaders follow within days - a search for a full-time head of revenue AI is a search for a title few companies have hired before.",
      },
      {
        q: "What if it is not working?",
        a: "A defined first term of three to six months, then 30 days notice. The week-8 opt-out sits inside the first term, and by then the first use cases have either shipped or they have not.",
      },
      {
        q: "How do we know the leader is good?",
        a: `Every profile carries reviews from the companies that hired the operator - rated on Communication, Ownership, Results focus and Expertise - and whether they would hire again. For this seat, also ask to see adoption data from something they shipped into a real revenue team. "AI Sales Automation" is one of the five most common expertise tags on our platform (22 of ${f.platform.usable} operators); the proof is rarer than the claim.`,
      },
      {
        q: "Fractional AI GTM leader or an AI vendor?",
        a: "A vendor ships the tool and hands adoption back to you. Our operator maps the work, picks the tools, ships them into the workflow and is measured on whether the team uses them. We do not sell software - we place the leader who owns adoption.",
      },
      {
        q: "How long do engagements run?",
        a: `A defined first term of three to six months to start. ${extended} AI GTM engagements in our 2027 survey extended past it, and ${f.pct(f.engagements.extendedShare)} of all surveyed engagements did.`,
      },
      {
        q: "Should we hire an AI GTM leader or fold this into a sales or RevOps hire?",
        a: `Hire the AI GTM seat when the mapping and adoption work is the job itself. When the number is the problem and AI is the method, hire the sales or RevOps leader who has it. Our 2027 guide bets on absorption over time - the title fades, the skill becomes table stakes - but today buyers want AI GTM more than anything else: a ${role.demandMean} of 5 demand trend, the highest of any role with more than one answer.`,
      },
      {
        q: "What does it cost?",
        a: `The Rate Index puts AI GTM at ${cat.median} an hour median (${cat.n} rates, directional), the market median - with the middle half at ${cat.p25} - ${cat.p75}. ${monthly} a month at about ${monthlyHours} hours was the median in the engagements operators described. The guide expects that rate to rise toward the ${revOps.median} - ${enablement.median} RevOps and enablement command. No fees for companies.`,
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
        title: "Where AI fits in sales",
        body: "The tasks to automate first, the ones to leave alone, and how to measure adoption.",
        href: "/guides/where-ai-fits-in-sales",
      },
      {
        kicker: "Research",
        title: "AI, lean revenue teams, and where fractional GTM goes from here",
        body: "Chapter 10 of the Buyer's Guide: the data, three scenarios for 2030 and five falsifiable predictions.",
        href: "/fractional-gtm-buyers-guide-2027",
      },
    ],
  },
};

export default page;
