import type { Chapter } from "./types";
import * as f from "./figures";

/* The guide's "center of gravity": first-client engagements with $1M to $20M companies. */
const CORE_BANDS = ["$1M - $5M", "$5M - $20M"];
const revenueBands = f.survey.firstClientRevenue;
const topRevenueShare = Math.max(...revenueBands.map((b) => b.share));
const directClients = f.contracts.directClients;
const aiGtm = f.category("AI GTM");

const chapter: Chapter = {
  slug: "02-who-buys",
  number: "02",
  title: "Who buys fractional GTM, and what they are really buying",
  dek: "The center of gravity is a real business that has outgrown the way it sells",
  stats: [
    { v: f.pct(f.coreShare), l: "of engagements are with $1M to $20M companies", tone: "forest" },
    { v: "15 of 20", l: "inbound requesters had fewer than 100 employees" },
    { v: "1 of 20", l: "requests came from a sitting head of sales" },
    { v: "6 of 20", l: "buyers named AI directly" },
  ],
  blocks: [
    {
      t: "lede",
      html:
        "There is a story the fractional industry tells about itself: fractional is for startups that can't afford a real executive. The data says that is about a third true.",
    },

    { t: "h2", eyebrow: "Client profile", text: "Who", id: "who" },
    { t: "lede", html: "A real business with real customers that has outgrown the way it sells." },
    {
      t: "stats",
      items: [
        { v: f.pct(f.coreShare), l: "$1M to $20M revenue", tone: "forest" },
        { v: f.pct(f.midShare), l: "$20M to $50M" },
        { v: f.pct(f.smallShare), l: "pre-revenue or under $1M" },
        { v: `2 of ${directClients}`, l: "direct clients are software companies" },
      ],
    },
    {
      t: "p",
      html: `${f.pct(f.coreShare)} of the engagements our operators described are with companies between $1 million and $20 million in revenue. Another ${f.pct(f.midShare)} are $20 million to $50 million. Pre-revenue and sub-$1 million companies together are ${f.pct(f.smallShare)}. The center of gravity is a real business with real customers that has outgrown the way it sells.`,
    },
    {
      t: "table",
      caption: "Figure 2.1. Engagements by client annual revenue",
      head: ["Client annual revenue", "Share of engagements"],
      rows: revenueBands.map((b) => [b.band, `${f.pct(b.share)}${CORE_BANDS.includes(b.band) ? " (center)" : ""}`]),
      firstColHeader: true,
      note: `n=${f.survey.detailed}. Bars scaled to the highest value in the column (${f.pct(topRevenueShare)}).`,
    },
    {
      t: "callout",
      tone: "leaf",
      title: "Our direct clients",
      html: `Our own direct clients tell the same story from the buyer's chair. ${directClients} companies. Most sit between $5 million and $50 million. Only two are what you would call a software company.`,
    },
    {
      t: "list",
      items: [
        "Digital marketing agency",
        "Strategy consultancy",
        "Physical-therapy marketing agency",
        "Restoration marketing agency",
        "Pharmacy services business",
        "Cybersecurity startup",
        "Data nonprofit",
        "Healthcare communications company",
        "AI implementation consultancy",
        "Billing software company",
      ],
    },
    {
      t: "p",
      html: `That last point deserves a pause, because it exposes a gap in the market. The network is built for software. ${f.pct(f.platform.softwareShare)} of operators on our platform list SaaS or enterprise software as a primary industry. ${f.pct(f.survey.softwareClientShare)} of the engagements in our survey are SaaS or enterprise software. But the companies actually signing contracts with us are agencies, services firms, healthcare, nonprofits. Businesses where the founder has been the closer for a decade and the sales "team" is two people and a spreadsheet.`,
    },
    {
      t: "stats",
      items: [
        { v: `${f.pct(f.platform.softwareShare)} SaaS`, l: "Platform operators", s: "list it or enterprise software as a primary industry" },
        { v: `${f.pct(f.survey.softwareClientShare)} SaaS`, l: "Survey engagements", s: "or enterprise software" },
        { v: `2 of ${directClients}`, l: "Our direct clients", s: "are software companies", tone: "forest" },
      ],
    },
    {
      t: "callout",
      tone: "gold",
      title: "Good news and a warning",
      html:
        "If you run one of those businesses, that gap is good news and a warning in the same sentence. Good news because the experienced operators who can work outside software are out there and under-used. Warning because a lot of the people you will interview have only ever sold a subscription, and your business is not a subscription.",
    },
    {
      t: "p",
      html:
        "The inbound requests point the same way. Of 20 companies that sent us a detailed inbound request in early 2026, 11 had fewer than 50 employees and 15 had fewer than 100. The businesses behind them: a route-based food service operator, a healthcare administrative services firm, a systems implementer selling into pharma, a compliance consultancy, a facilities services company with no CRM at all. A few large enterprises showed up too: a partner at a consulting firm, a corporate development executive, a private equity operating partner integrating three acquisitions. But the center of the demand is the same as the center of the contracts: a company under 100 people, outside software, that has outgrown the way it sells.",
    },

    { t: "h2", eyebrow: "Inbound data", text: "Who actually fills out the form", id: "who-actually-fills-out-the-form" },
    { t: "lede", html: "The person asking is usually not the sales leader." },
    {
      t: "p",
      html:
        "One detail from the inbound data that matters for anyone selling into this market, or buying in it: the person asking is usually not the sales leader. Of those 20 requests, six came from the CEO, founder, president or owner. The rest came from marketing (three), operations and finance (three), consulting and private equity partners (two), corporate development, client solutions, revenue enablement, a CTO, a business development manager. Exactly one came from a sitting head of sales.",
    },
    {
      t: "stats",
      items: [
        { v: "6", l: "CEO, founder, president or owner", tone: "forest" },
        { v: "3", l: "marketing" },
        { v: "3", l: "operations and finance" },
        { v: "2", l: "consulting and PE partners" },
        { v: "1 each", l: "corp dev, client solutions, revenue enablement, CTO, BD manager" },
        { v: "1", l: "sitting head of sales", tone: "coral" },
      ],
    },
    {
      t: "p",
      html:
        "That tells you something about when the request happens. It happens when there is no revenue leader, or when the one in the seat is the problem, and someone adjacent to the function has decided to act. It also tells you why the first conversation is so often about diagnosis rather than scope. The CEO knows the number is wrong. The CTO knows the CRM is a mess. Neither is sure what job to post.",
    },

    { t: "h2", eyebrow: "Operator survey", text: "What they are buying", id: "what-they-are-buying" },
    {
      t: "p",
      html: `We asked ${f.survey.detailed} operators to describe, in a sentence, why their current client brought them in. We coded the answers. Six triggers account for nearly all of them.`,
    },
    {
      t: "steps",
      items: [
        {
          n: "1",
          title: "Getting the founder out of the closing seat",
          aside: "About 1 in 4",
          html: `This is the biggest one by a wide margin, about one in four. The language is consistent: "transition from founder-led sales to a revenue engine," "move away from founder-led sales and build a system," "they had a sales team but no structured sales engine." 3 of our ${directClients} direct contracts say it almost word for word in the scope: the founder is moving to a different seat and someone needs to run revenue.`,
        },
        {
          n: "2",
          title: "Pipeline that doesn't depend on the founder's network",
          aside: "About 1 in 6",
          html:
            "About one in six. \"Stabilize and build consistent pipeline.\" \"Build an outbound engine.\" \"Needed a repeatable pipeline.\" This is often the same company as trigger one, six months later.",
        },
        {
          n: "3",
          title: "A motion change",
          aside: "1 in 9",
          html:
            "Order-taking to enterprise. Direct to channel. Services to product. One in nine. These are the hardest engagements and the ones where stage-and-motion experience matters most.",
        },
        {
          n: "4",
          title: "New market, new product",
          aside: "1 in 9",
          html: "US market entry for a foreign company. A new product line. A launch. One in nine.",
        },
        {
          n: "5",
          title: "A leadership gap",
          aside: "1 in 12",
          html:
            "The VP left, the search is six months out, someone has to run the team Monday. One in twelve. This is where fractional shades into interim, and where hours per month climb above 100.",
        },
        {
          n: "6",
          title: "A specific skill the company doesn't have",
          aside: "1 in 6",
          html:
            "Forecasting. Analytics that tie marketing to revenue. AI in the revenue org. Channel program design. One in six. These engagements are smaller and more project-shaped.",
        },
      ],
    },
    {
      t: "callout",
      tone: "leaf",
      title: "Notice what is not on the list",
      html:
        "Nobody said \"we couldn't afford a full-time person.\" A handful said something close: \"they do not want to pay a full-time sales leader and the CEO is involved at times and not involved at times.\" That is not a cost statement. That is a statement about not needing 40 hours a week of a person whose job is to be the adult in the room on sales.",
    },
    {
      t: "p",
      html:
        "Cost is why fractional is possible. It is almost never why a specific company does it. They do it because something about how they sell has to change, and they want someone who has made that exact change before.",
    },

    { t: "h2", eyebrow: "Inbound forms", text: "What buyers ask for", id: "what-buyers-ask-for" },
    {
      t: "p",
      html:
        "The operator survey tells you why clients hired. The inbound forms tell you what buyers were asking for before anyone shaped the request. We coded the stated needs from the 20 detailed submissions. Most named more than one thing.",
    },
    {
      t: "table",
      caption: "Figure 2.2. Stated needs in inbound requests",
      head: ["Stated need", "Mentions (of 20)"],
      rows: [
        ["<strong>Revenue systems and CRM:</strong> migrate, clean up, get visibility, automate", "7 (most named)"],
        ["Pipeline and outbound prospecting", "6"],
        ["AI in the sales process", "6"],
        ["Enablement, training, playbooks, onboarding", "6"],
        ["Scale the team without breaking what works", "2"],
        ["Retention, expansion and churn forecasting", "1"],
      ],
      firstColHeader: true,
      note: "Inbound requests we received, early 2026. Paraphrased and anonymized. Bars scaled to the highest value in the column (7).",
    },
    { t: "h3", text: "Three things to take from this" },
    {
      t: "steps",
      items: [
        {
          n: "1",
          title: "Buyers describe systems, not seats.",
          html:
            "Nobody wrote \"we need a fractional CRO.\" They described an outbound process that reliably produces qualified meetings with the right accounts, plus the tracking to measure it. A set of playbooks, training and onboarding solid enough to add ten reps in six months without the current team missing its number. A CRM migration as the first step in rebuilding the whole revenue stack. That matches the operator triggers almost exactly. The founder-led-to-repeatable story and the pipeline story are the same story told from two sides of the table.",
        },
        {
          n: "2",
          title: "AI is in nearly a third of the asks.",
          html: `Six of 20 buyers named it directly: put AI into the sales process to move more deals, build a GTM motion that is AI-native from the start, map every revenue role down to the task level and find what GenAI can absorb, make a proprietary AI insight engine the thing that drives every outbound and renewal touch. Recall from Chapter 3 that AI GTM prices at the market center in the operator data, ${aiGtm.median} an hour on ${aiGtm.n} rates, with no premium over sales leadership. Demand is ahead of the market's ability to price it. That will correct, and probably fast.`,
        },
        {
          n: "3",
          title: "About half the requests are specific enough to act on and half are not.",
          html:
            "Grow sales by a third. Train our sales managers. Fix one part of our outbound. Those are real needs with no shape yet, and they are exactly what operators were describing in Chapter 9 when they named \"hiring before defining the problem\" as a top mistake. If your request would fit on one line, you are not ready to pick a person. You are ready for a diagnostic.",
        },
      ],
    },

    { t: "h2", eyebrow: "Website leads", text: "What they search for", id: "what-they-search-for" },
    { t: "lede", html: "Buyers search for the seat and then, when asked, describe the system." },
    {
      t: "stats",
      items: [
        { v: "42 of 53", l: "landed on a VP of Sales or sales leader page", tone: "forest" },
        { v: "3 of 53", l: "arrived from ChatGPT or OpenAI" },
        { v: "36 of 56", l: "coded inbound requests were real buyers" },
        { v: `${f.platform.frontLine} in ${f.platform.usable}`, l: "platform profiles is a front-line seller" },
      ],
    },
    {
      t: "p",
      html:
        "Our own website gives a different view of the same demand: not what buyers write, but what they type into Google before they arrive. Of the 53 leads that came through Revenue Nomad's site in the past year, 42 landed on a page about a fractional VP of Sales or fractional sales leader. One landed on the Sales Director page. The paid search terms that brought them:",
    },
    {
      t: "list",
      items: ["\"fractional sales leader\"", "\"fractional CRO services\"", "\"hire fractional VP of sales\"", "\"fractional chief sales officer\""],
    },
    {
      t: "p",
      html:
        "Not one marketing, RevOps or enablement term. So buyers search for the seat and then, when asked, describe the system. That is the gap a good first conversation has to close.",
    },
    {
      t: "p",
      html: `A few other things from the inbound requests worth knowing. Three of 53 arrived from ChatGPT or an OpenAI referral rather than Google, which matches operators in the survey who listed "AI search" and "LLMs" as a new source of clients. Two leads, both from very small companies, turned out to want a fractional sales rep, not a leader, which is a thing people ask for and almost nobody sells (${f.platform.frontLine === 1 ? "one profile" : `${f.platform.frontLine} profiles`} in ${f.platform.usable} on our platform ${f.platform.frontLine === 1 ? "is" : "are"} a front-line seller).`,
    },
    {
      t: "callout",
      tone: "gold",
      title: "Requests that were not buyers",
      html:
        "And of one January batch of 10 requests, 7 were vendor pitches, a phishing report or an operator looking for work. Across the full coded ledger of inbound requests, 36 of 56 were real buyers. Roughly a third of what comes through a fractional firm's front door is noise, which is one reason the good firms qualify hard before they introduce anyone.",
    },

    { t: "h2", text: "The discovery problem", id: "the-discovery-problem" },
    { t: "p", html: "Put the two sides together and you see why this market is hard to shop." },
    {
      t: "stats",
      items: [
        {
          v: "9 of 20",
          l: "Buyers search",
          s: "Buyers find fractional help through Google: 9 of the 20 detailed inbound requests and nearly all of our paid web leads came from search.",
          tone: "forest",
        },
        {
          v: `${f.pct(f.survey.howFound.peer)} vs 19%`,
          l: "Operator referrals",
          s: `Operators find clients through referral: ${f.pct(f.survey.howFound.peer)} of operators got their last three clients from a peer, and only 19% through LinkedIn inbound.`,
        },
      ],
    },
    {
      t: "callout",
      tone: "night",
      html:
        "The buyers are searching. The best operators are not listed. <strong>The two sides are using different maps, and the marketplaces and firms that sit between them exist to fix that.</strong>",
    },

    { t: "h2", eyebrow: "Pre-launch waitlist", text: "What they are not buying", id: "what-they-are-not-buying" },
    {
      t: "stats",
      items: [
        { v: "44%", l: "had run quotas of $50M+", tone: "forest" },
        { v: "28%", l: "had managed teams of 50+" },
      ],
    },
    {
      t: "p",
      html:
        "The pre-launch waitlist for our platform skewed senior: 44% of those operators had run quotas of $50 million or more, and 28% had managed teams of 50 or more people. Those are impressive résumés. They are also, in most cases, the wrong résumé for a $6 million agency with two reps.",
    },
    {
      t: "p",
      html:
        "Buyers are not buying scale experience. They are buying build experience. The next several chapters are about how to tell the difference.",
    },
  ],
};

export default chapter;
