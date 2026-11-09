import type { Chapter } from "./types";
import * as f from "./figures";

/* AI use in delivery: the survey gives the share using any AI and the share using it for most of their work. */
const ai = f.survey.aiUse;
const aiSome = ai.share - ai.most;
const aiNone = 100 - ai.share;
const aiRows: [string, number][] = [["Most", ai.most], ["Some", aiSome], ["None", aiNone]];
const aiTop = Math.max(...aiRows.map(([, v]) => v));
const mostAi = f.plansByAi("Most");
const someAi = f.plansByAi("Some");
const aiGtm = f.category("AI GTM");
const aiGtmRole = f.role("AI GTM");
const revOps = f.category("Revenue Operations");
const enablement = f.category("Sales Enablement");
const marketing = f.category("Marketing");

const chapter: Chapter = {
  slug: "10-ai-and-what-comes-next",
  number: "10",
  title: "AI, lean revenue teams, and where fractional GTM goes from here",
  dek: "Most AI chapters are speculation. This one is mostly data.",
  stats: [
    { v: f.pct(ai.share), l: "of operators use AI in delivery" },
    { v: "6 of 20", l: "detailed inbound requests named AI" },
    { v: `${aiGtmRole.demandMean} / 5`, l: "AI GTM demand trend" },
    { v: aiGtm.median, l: `AI GTM median hourly rate (${aiGtm.n} rates)` },
  ],
  blocks: [
    {
      t: "lede",
      html: "Every report published in 2026 has an AI chapter. Most of them are speculation. This one is mostly data, and the data says the change has already happened on the supply side and is just arriving on the demand side.",
    },

    { t: "h2", eyebrow: "Figure 10.1", text: "AI is already how the work gets done", id: "ai-is-already-how-the-work-gets-done" },
    {
      t: "table",
      caption: "Figure 10.1. How much of your delivery uses AI tools?",
      head: ["How much of your delivery uses AI tools?", "Share of operators"],
      rows: aiRows.map(([label, v]) => [label, `${f.pct(v)}${v === aiTop ? " (most common)" : ""}`]),
      firstColHeader: true,
      note: `n=${ai.n}. Stacked bar shows each share of the whole; table bars scaled to the highest value in the column (${f.pct(aiTop)}).`,
    },
    {
      t: "p",
      html: `<strong>${f.pct(ai.share)} of fractional GTM operators use AI in delivery.</strong> ${f.pct(ai.most)} say most of their work runs through it. On the pre-launch waitlist for our platform, back in early 2026, ChatGPT was already the third most-cited must-have tool, named by 46 of 67 operators, ahead of Gong, ZoomInfo, Outreach and Salesloft. On the platform today, "AI Sales Automation" is one of the five most common expertise tags.`,
    },
    {
      t: "p",
      html: `The operators who lean hardest into AI are also the ones doing best. Those who say "most" of their delivery uses AI report slightly higher demand (${mostAi.demandMean} versus ${someAi.demandMean} of 5) than those who say "some," and are far more likely to be raising their rates in the next six months (${f.pct(mostAi.raise)} versus ${f.pct(someAi.raise)}). Small differences, consistent direction.`,
    },
    {
      t: "stats",
      items: [
        { v: `${mostAi.demandMean} vs ${someAi.demandMean}`, l: "demand score out of 5" },
        { v: `${f.pct(mostAi.raise)} vs ${f.pct(someAi.raise)}`, l: "raising rates in the next six months" },
        { v: "46 of 67", l: "waitlist operators named ChatGPT a must-have" },
        { v: "Top 5", l: "\"AI Sales Automation\" as an expertise tag" },
      ],
      note: "\"Most\" AI users vs. \"some\"",
    },
    { t: "h3", text: "What this means for a buyer" },
    {
      t: "p",
      html: "What this means for a buyer is simple. The 40 hours a month you are buying in 2027 is not the same 40 hours it was in 2023. An experienced leader with good tools does the analysis, the sequence writing, the call review and the reporting in a fraction of the time, and spends the hours you are paying for on judgment. That is the quiet reason fractional economics keep improving.",
    },

    { t: "h2", eyebrow: "Buyer data", text: "The demand side is catching up", id: "the-demand-side-is-catching-up" },
    {
      t: "stats",
      items: [
        { v: "30%", l: "of buyer asks named AI (6 of 20)" },
        { v: "3 of 53", l: "inbound web requests via ChatGPT or OpenAI" },
      ],
    },
    {
      t: "p",
      html: "The buyer data shows the shift arriving. Six of 20 detailed inbound requests named AI directly: put it in the sales process, build an AI-native motion, map roles to the task level and find what GenAI can absorb. That is 30% of buyer asks for a category that barely existed in 2023.",
    },
    {
      t: "list",
      items: ["Put it in the sales process", "Build an AI-native motion", "Map roles to the task level and find what GenAI can absorb"],
    },
    { t: "h3", text: "Buyers finding help through AI" },
    {
      t: "p",
      html: "And buyers are finding fractional help through AI, too. Three of 53 inbound web requests we received this year arrived from ChatGPT or an OpenAI referral rather than Google. Operators in the survey listed \"AI search\" and \"LLMs, ChatGPT and Claude\" as places their recent clients came from. It is a small number today. It was zero two years ago.",
    },

    { t: "h2", eyebrow: "The anomaly, worth watching", text: "The pricing gap that will close", id: "the-pricing-gap-that-will-close" },
    { t: "lede", html: "Buyers want it more than anything else and, so far, pay the going rate for it, not a premium." },
    {
      t: "stats",
      items: [
        { v: `${aiGtmRole.demandMean} / 5`, l: "AI GTM demand trend" },
        { v: aiGtm.median, l: `AI GTM median hourly rate (${aiGtm.n} rates)` },
        { v: `${revOps.median} - ${enablement.median}`, l: "what RevOps and enablement command" },
      ],
    },
    {
      t: "p",
      html: `Here is the anomaly worth watching. AI GTM has the highest demand trend of any role in the survey with more than one answer (${aiGtmRole.demandMean} of 5, on ${aiGtmRole.n} operators) and a median rate of ${aiGtm.median} an hour, the market median, on ${aiGtm.n} rates. The lowest-priced role is Marketing, at ${marketing.median}. Buyers want AI GTM more than anything else and pay the going rate for it, not a premium.`,
    },
    {
      t: "p",
      html: `That will not hold. Either the AI GTM specialists will reprice toward the ${revOps.median} to ${enablement.median} that RevOps and enablement command (enablement on ${enablement.n} rates), or, more likely, the work will get absorbed into the other roles.`,
    },
    { t: "p", html: "A fractional CRO in 2028 who cannot put AI into a revenue process will not be a fractional CRO for long." },
    {
      t: "p",
      html: "<strong>We would bet on absorption:</strong> the title fades, the skill becomes table stakes, and the premium goes to the sales and RevOps leaders who have it.",
    },

    { t: "h2", text: "Three scenarios for the revenue team of 2030", id: "three-scenarios-for-the-revenue-team-of-2030" },
    { t: "h3", text: "The lean core" },
    {
      t: "p",
      html: "A full-time CEO, a full-time head of customer, and a fractional CRO at 40 to 60 hours a month running a team of six reps whose administrative work is almost entirely automated. RevOps is a fractional engagement renewed quarterly. Marketing is a fractional CMO plus two agencies. Total leadership cost for the revenue function is under $300,000 a year, for a company doing $20 million.",
    },
    {
      t: "p",
      html: `This is the scenario the current data points toward most directly: companies already extend ${f.pct(f.engagements.extendedShare)} of engagements, stack a second fractional role after the first works, and buy fewer hours as tools absorb the execution.`,
    },
    { t: "h3", text: "The hybrid network" },
    {
      t: "p",
      html: "A full-time VP of Sales who came in through a fractional engagement and converted, supported by a rotating network of fractional specialists (enablement, AI, channel) brought in for 90-day projects as needed. The company treats fractional the way it treats cloud infrastructure: capacity you turn up and down.",
    },
    { t: "p", html: "This is what the project contracts in our data already look like for larger companies." },
    { t: "h3", text: "The AI-first reset" },
    {
      t: "p",
      html: "A company that rebuilt its revenue process around AI agents for prospecting, qualification and follow-up, with two human closers and one fractional leader whose main job is designing and governing the system.",
    },
    {
      t: "p",
      html: "We have one direct contract that looks like an early version of this: a Lead Revenue Architect at 85 hours a month running a GTM transformation program with a CFO sponsor. It is not common yet. It is the one most likely to be common by 2030.",
    },
    { t: "h3", text: "What all three share" },
    {
      t: "p",
      html: "Fewer full-time revenue executives, more senior judgment bought in fractions, and a CEO who thinks about leadership as capability to be assembled rather than headcount to be filled.",
    },

    { t: "h2", eyebrow: "Falsifiable", text: "Five predictions for 2027 to 2030", id: "five-predictions-for-2027-to-2030" },
    { t: "lede", html: "Each tied to something in the data, each falsifiable." },
    {
      t: "steps",
      items: [
        {
          n: "1",
          title: "Fractional will show up in the org chart.",
          html: `Today, ${f.pct(f.survey.mainIncomeShare)} of operators do this as a career, and ${f.pct(f.engagements.extendedShare)} of engagements extend past their initial term. By 2030, the companies in our data will list fractional leaders on their leadership page and in their board decks as a standing part of the team, not a vendor.`,
        },
        {
          n: "2",
          title: "The three-month minimum becomes the three-month standard.",
          html: `Buyers ask for one to three months (${f.pct(f.term("1 to 3 months"))} of engagements); operators on our platform set a three-month minimum (${f.of(f.platform.minThreeMonths.x, f.platform.minThreeMonths.y)}). The contracts already split the difference with an opt-out at week 8 to 12. Expect that to be the default structure across the market within two years.`,
        },
        {
          n: "3",
          title: "AI GTM disappears as a separate role and reprices inside the others.",
          html: `From ${aiGtm.median} an hour as a specialty, the market rate, to a $50-an-hour premium on sales and RevOps leaders who have it. Watch the rate table in the 2028 edition of this guide.`,
        },
        {
          n: "4",
          title: "Verified engagement history replaces the résumé.",
          html: `${f.pct(f.survey.reference.neverAsked)} of clients never ask for a reference and ${f.pct(f.survey.reference.publicReview)} of operators have a public review. That gap is too big and too costly to persist. The marketplaces that win will be the ones with client-verified engagement records, and the operators on them will price higher than the ones who are not.`,
        },
        {
          n: "5",
          title: "Non-software companies become the majority of buyers.",
          html: `The network is ${f.pct(f.platform.softwareShare)} SaaS or enterprise software. Our direct clients are mostly agencies, services, healthcare and nonprofits. The inbound data is 75% companies under 100 people, most outside software. Supply will follow demand, and the 2029 network will look very different from today's.`,
        },
      ],
    },

    { t: "h2", text: "What to do with this", id: "what-to-do-with-this" },
    {
      t: "p",
      html: "If you are a CEO reading this in 2027, the practical implication is not \"go fractional.\" It is this: the revenue leadership your company needs over the next three years will be bought in more pieces, from more people, for shorter and more specific stretches, with better tools doing more of the work.",
    },
    { t: "h3", text: "Get good at buying it that way" },
    {
      t: "list",
      items: ["Define the problem", "Match on stage and deal size", "Set a number and a clock", "Let the leader lead"],
    },
    {
      t: "p",
      html: "The companies that get good at buying it that way, defining the problem, matching on stage and deal size, setting a number and a clock, and letting the leader lead, will spend less and get more.",
    },
    { t: "h3", text: "Where it goes wrong" },
    {
      t: "p",
      html: "The ones that keep running four-month searches for a single full-time hire will keep getting what they have been getting.",
    },
  ],
};

export default chapter;
