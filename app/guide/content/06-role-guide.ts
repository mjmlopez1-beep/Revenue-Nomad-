import type { Chapter } from "./types";
import * as f from "./figures";

/* The five roles in the guide, in the author's order, with the short labels the pricing table uses. */
const roles = [
  { name: "Sales Leadership", short: "Sales" },
  { name: "Marketing", short: "Marketing" },
  { name: "Revenue Operations", short: "RevOps" },
  { name: "Sales Enablement", short: "Enablement" },
  { name: "AI GTM", short: "AI GTM" },
] as const;

const share = (b: { x: number; y: number }) => Math.round((b.x / b.y) * 100);
const ofShare = (b: { x: number; y: number }) => `${share(b)}%`;
const mean = (n: number | null) => (n == null ? "n/a" : n.toFixed(1));

const sl = f.role("Sales Leadership");
const mk = f.role("Marketing");
const ro = f.role("Revenue Operations");
const se = f.role("Sales Enablement");
const ai = f.role("AI GTM");
const cs = f.role("Customer Success & Growth");
const pa = f.role("Partnerships");

/* Figure 6.1: one row per role. Rates from the Rate Index; the rest from the survey. */
const roleRows = roles.map((r) => {
  const c = f.category(r.name);
  const s = f.role(r.name);
  return { ...r, rate: c.raw ?? 0, rateN: c.n, s, extended: share(s.extended) };
});
const rateHigh = Math.max(...roleRows.map((r) => r.rate));
const rateLow = Math.min(...roleRows.map((r) => r.rate));
const extendedHigh = Math.max(...roleRows.map((r) => r.extended));
const demandHigh = Math.max(...roleRows.map((r) => r.s.demandMean ?? 0));
const rateTag = (r: (typeof roleRows)[number]) =>
  r.rate === rateHigh ? (r.rateN < f.rates.floor ? " (highest, directional)" : " (highest)") : r.rate === rateLow ? " (lowest)" : "";
const extendedTag = (s: number) => (s === extendedHigh ? " (highest)" : s === 0 ? " (long terms)" : "");
const demandTag = (m: number | null) => (m === demandHigh ? " (highest)" : "");

/* The pricing table under AI GTM: the same five roles, highest median first. */
const pricingRows = [...roleRows].sort((a, b) => b.rate - a.rate);

const chapter: Chapter = {
  slug: "06-role-guide",
  number: "06",
  title: "The fractional GTM role guide",
  dek: "Five roles that cost, run and go wrong differently",
  stats: [
    { v: f.pct(sl.share), l: "Sales Leadership" },
    { v: f.pct(mk.share), l: "Marketing" },
    { v: f.pct(ro.share), l: "Revenue Operations" },
    { v: f.pct(ai.share), l: "AI GTM" },
    { v: f.pct(se.share), l: "Sales Enablement" },
    { v: f.pct(cs.share + pa.share), l: "CS & Partnerships" },
  ],
  blocks: [
    { t: "note", text: `Share of operators by role. Operator survey, n=${f.survey.detailed}.` },
    {
      t: "lede",
      html: "\"Fractional GTM\" covers at least five different jobs. They cost different amounts, run at different hours, show results on different timelines, and go wrong in different ways.",
    },

    { t: "h2", eyebrow: "Figure 6.1", text: "At a glance", id: "at-a-glance" },
    {
      t: "table",
      head: ["Role", "Median rate", "Median hours / mo", "Median monthly", "Demand (1 to 5)", "Extended", "n"],
      firstColHeader: true,
      rows: roleRows.map((r) => [
        r.name,
        `${f.rate(r.rate)}${rateTag(r)}`,
        String(r.s.medianHours),
        f.monthly(r.s.medianMonthly),
        `${mean(r.s.demandMean)}${demandTag(r.s.demandMean)}`,
        `${f.pct(r.extended)}${extendedTag(r.extended)}`,
        String(r.rateN),
      ]),
      note: `Rates and n from the Revenue Nomad Rate Index (cuts under ${f.rates.floor} records are directional). Median monthly spend from the ${f.engagements.n} engagements described in the operator survey; hours, demand and extension from the operator survey, n=${f.survey.detailed}. Bars scaled to the highest value in each column.`,
    },

    { t: "h2", text: "Sales Leadership", id: "sales-leadership" },
    { t: "lede", html: "The core of the market. This is what most buyers mean when they say fractional GTM." },
    {
      t: "stats",
      items: [
        { v: f.pct(sl.share), l: "of operators" },
        { v: f.category("Sales Leadership").median, l: "median hourly" },
        { v: ofShare(sl.resultUnder30), l: "result inside 30 days" },
        { v: ofShare(sl.extended), l: "extended" },
      ],
    },
    {
      t: "p",
      html: "A Sales Director, VP of Sales, Head of Sales or CRO who runs your revenue team part-time. The seat determines the scope, and Chapter 3 shows the price ladder.",
    },
    {
      t: "stats",
      items: [
        { v: "~$200/hr", l: "Director", s: "20 hrs / month" },
        { v: "~$250/hr", l: "VP", s: "30 - 40 hrs / month" },
        { v: "$260 - $465/hr", l: "CRO", s: "30 - 50 hrs / month" },
      ],
    },
    { t: "h3", text: "What triggers it" },
    {
      t: "p",
      html: "Founder stepping out of the closing seat. Sales leader left. Team exists, system does not. Moving from order-taking to real selling. These four account for most sales leadership engagements in our survey and all but one of our direct contracts.",
    },
    { t: "h3", text: "How it runs" },
    {
      t: "p",
      html: "Hours are the most varied of any role: a quarter under 20 hours, a third at 20, a quarter at 40, the rest heavier. Results come fastest here.",
    },
    { t: "h3", text: "What to check" },
    {
      t: "p",
      html: "Stage and deal-size match above everything (Chapter 8). The network is heavy on enterprise and inside sales (82% and 67% of platform profiles), thin on product-led (27%). Solution Selling, MEDDPICC, Value Selling and Challenger lead. HubSpot and Salesforce are near-universal (75% and 71%).",
    },
    {
      t: "callout",
      tone: "gold",
      title: "Where it goes wrong",
      html: "Hiring a scaler for a builder's job. Expecting a 20-hour Director to behave like a 40-hour VP. And the warning that came up repeatedly: a sales leader who does not understand revenue operations will not be able to fix a broken one. If your CRM and forecast are the problem, see the next role.",
    },

    { t: "h2", text: "Marketing", id: "marketing" },
    { t: "lede", html: "The longest-running engagements." },
    {
      t: "stats",
      items: [
        { v: f.pct(mk.share), l: "of operators" },
        { v: mk.modeHours, l: "most common monthly hours" },
        { v: ofShare(mk.resultUnder30), l: "result inside 30 days" },
        { v: f.of(mk.extended.x, mk.extended.y), l: "extended" },
      ],
    },
    {
      t: "p",
      html: "A fractional CMO or VP of Marketing, usually owning positioning, demand generation and the connection between marketing activity and pipeline.",
    },
    {
      t: "list",
      items: [
        "<em>\"They don't get marketing and need qualified leads.\"</em>",
        "Rebrand for a business-model shift",
        "Analytics that can't tie marketing to revenue",
        "New product or market launch",
      ],
    },
    { t: "h3", text: "How it runs" },
    {
      t: "p",
      html: `Forty hours a month is the most common (7 of ${mk.n} engagements). Terms are three to six months most often. Results take longer than sales: ${ofShare(mk.resultUnder30)} inside 30 days, 67% inside 60. But once running, marketing extends more than any other role.`,
    },
    { t: "h3", text: "What to check" },
    {
      t: "p",
      html: "Whether they can execute or only direct; decide which you need. And whether you have a marketing budget. Without one, nothing gets executed.",
    },
    {
      t: "callout",
      tone: "gold",
      title: "Where it goes wrong",
      html: "Pre-product-market-fit companies that want marketing to solve a product problem. Operators named this as the clearest case where they should have declined the engagement.",
    },

    { t: "h2", text: "Revenue Operations", id: "revenue-operations" },
    { t: "lede", html: `The most project-shaped role, priced level with sales leadership at ${f.category("Revenue Operations").median}.` },
    {
      t: "stats",
      items: [
        { v: f.pct(ro.share), l: "of operators" },
        { v: f.category("Revenue Operations").median, l: "median hourly" },
        { v: f.monthly(ro.medianMonthly), l: "median monthly" },
        { v: f.of(ro.extended.x, ro.extended.y), l: "extended" },
      ],
    },
    {
      t: "p",
      html: "<strong>The person who makes the forecast true.</strong> CRM architecture, pipeline stages, data hygiene, reporting, comp plan mechanics, tooling.",
    },
    {
      t: "callout",
      tone: "night",
      title: "7 of 20",
      html: "inbound requests named revenue systems, the single most requested need. Typical asks: \"inability to forecast revenue and cash flow,\" a Salesforce migration, a sale process where diligence will look at the pipeline.",
    },
    { t: "h3", text: "How it runs" },
    {
      t: "p",
      html: "Hours are bimodal: light (under 20, advising a team that executes) or heavy (40 to 160, running a rebuild). Almost nothing in between. Few extend because RevOps engagements are projects: they end when the system works.",
    },
    { t: "h3", text: "What to check" },
    {
      t: "p",
      html: "Whether they have built the thing, not just run reports on it. Which CRM. And whether they can talk to a CEO in plain language; RevOps people who can only talk to RevOps people do not last in a fractional seat.",
    },
    {
      t: "callout",
      tone: "leaf",
      title: "Pairing",
      html: "RevOps is the most common second fractional hire alongside a sales leader, and several operators said the sales leader should not be hired without it.",
    },

    { t: "h2", text: "Sales Enablement", id: "sales-enablement" },
    { t: "lede", html: "The long game." },
    {
      t: "stats",
      items: [
        { v: f.pct(se.share), l: "of operators" },
        { v: f.category("Sales Enablement").median, l: "median hourly", s: `${f.category("Sales Enablement").n} rates, directional` },
        { v: f.of(se.term12Plus.x, se.term12Plus.y), l: "12-month+ terms" },
        { v: f.of(se.resultOver90.x, se.resultOver90.y), l: "results past 90 days" },
      ],
    },
    {
      t: "p",
      html: "Onboarding, playbooks, training, coaching cadence, manager development. The work that makes an existing team better rather than replacing its leader.",
    },
    { t: "h3", text: "What triggers it" },
    {
      t: "p",
      html: "A team about to grow fast (one inbound buyer wanted to add ten reps in six months without hurting the current number). A methodology rollout. Manager development.",
    },
    { t: "h3", text: "How it runs" },
    {
      t: "p",
      html: "Forty hours a month and the longest initial terms of any role. Results take longer. None extended, because they were already long.",
    },
    { t: "h3", text: "What to check" },
    { t: "p", html: "Whether their content gets used. Ask to see adoption data from a prior program, not the program itself." },

    { t: "h2", eyebrow: "Fastest-moving", text: "AI GTM", id: "ai-gtm" },
    { t: "lede", html: "Highest demand, priced at the market center." },
    {
      t: "stats",
      items: [
        { v: `${mean(ai.demandMean)} / 5`, l: "demand score" },
        { v: `${ai.medianHours} hrs`, l: "median hours a month" },
        { v: "6 of 20", l: "inbound asked for it" },
        { v: f.of(ai.extended.x, ai.extended.y), l: "extended" },
      ],
    },
    {
      t: "p",
      html: "A leader who puts AI into the revenue process: lead scoring, outbound automation, call intelligence, assistants embedded in the CRM, and increasingly the strategy for which revenue tasks should be automated at all.",
    },
    {
      t: "list",
      items: [
        "<em>\"Integrate AI into our sales process.\"</em>",
        "<em>\"Build an AI-native GTM.\"</em>",
        "<em>\"Map roles to the task level and find what GenAI can take over.\"</em>",
      ],
    },
    { t: "h3", text: "The pricing anomaly" },
    {
      t: "table",
      head: ["Role", "Median rate"],
      firstColHeader: true,
      rows: pricingRows.map((r) => [r.short, f.rate(r.rate)]),
    },
    {
      t: "p",
      html: `Demand is highest; price is not. AI GTM sits at the market median of ${f.rates.median} (n=${f.category("AI GTM").n}), no higher than sales leadership or revenue operations. Part of that is that the operators are younger. Part is that buyers do not yet know what to pay for a job that did not exist three years ago. <strong>That gap is closing. If you are buying this in 2027, you are buying early.</strong>`,
    },
    { t: "h3", text: "What to check" },
    {
      t: "p",
      html: `Whether they have shipped something into a real revenue team's workflow, not a demo. "AI Sales Automation" is one of the five most common expertise tags on the platform (22 of ${f.platform.usable} operators), so the claim is common. The proof is rarer.`,
    },

    {
      t: "callout",
      tone: "night",
      title: "Customer Success and Partnerships",
      html: `Together, ${f.pct(cs.share + pa.share)} of operators. Customer Success and Growth prices around ${f.category("Customer Success & Growth").median} (n=${f.category("Customer Success & Growth").n}); Partnerships around ${f.category("Partnerships").median} (n=${f.category("Partnerships").n}); both cuts are directional. Channel and partner experience is on 53% of platform profiles, so partner work is usually bought inside a sales leadership engagement. Three of the ${f.survey.detailed} survey engagements were channel resets.`,
    },

    {
      t: "h2",
      eyebrow: "Pairings that work",
      text: "Companies that get value from one fractional leader usually add a second",
      id: "pairings",
    },
    {
      t: "table",
      head: ["Pairing", "When it works"],
      firstColHeader: true,
      rows: [
        ["Sales + RevOps (most common)", "The most defensible pair. One owns the team and the number; the other makes the number measurable."],
        ["Sales + Enablement", "When the team is bigger than the leader can personally coach."],
        ["Marketing + Sales", "When the founder was both, and is stepping out of both."],
        [
          "Any + AI GTM",
          `Increasingly, the AI work is folded into the other roles rather than bought separately. ${f.pct(f.survey.aiUse.share)} of operators already use AI in delivery.`,
        ],
      ],
    },
  ],
};

export default chapter;
