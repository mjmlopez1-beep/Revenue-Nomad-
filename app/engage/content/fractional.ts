import * as f from "../../guide/content/figures";
import { facts } from "../../home/content/numbers";
import { pick } from "../../solutions/content/shared";
import type { EngagePage } from "./types";

/**
 * Monthly fractional leadership, from the Design canvas artboard "FractionalPage" (desktop) and its phone twin
 * "FractionalMobile". Every word of the board, in order. Dataset figures are read from
 * app/guide/content/figures.ts so the page moves with data/rate-index.json: the hero's median engagement month,
 * the AI shares, the role table's shares (survey) and medians (Rate Index), the available-now share, the
 * extension, early-end, 60-day and hours shares, and the direct clients who expanded hours. Figures with no
 * column in the dataset stay as the board wrote them: the Lightcast 265%, "nearly all within two weeks", the
 * "half a day", "one day" and "two days" shapes and "only a third of the time" (the dataset's under-20-hours
 * extension rate supports it).
 */

const status = f.survey.status;
/** "5%" of surveyed engagements ended early. */
const endedEarly = f.pct(Math.round((status.endedEarly / status.n) * 100));
/** Share of surveyed engagements at 40 hours a month or fewer (the "Under 20" and "20 - 39" bands). */
const hours = f.engagements.byHours;
const hoursN = hours.reduce((a, b) => a + b.n, 0);
const under40 = f.pct(Math.round((hours.filter((b) => b.band === "Under 20" || b.band === "20 - 39").reduce((a, b) => a + b.n, 0) / hoursN) * 100));
/** "4 of 11" direct clients expanded hours. */
const expanded = f.of(f.contracts.expandedHours, f.contracts.directClients);
const availableNow = f.pct(f.platform.availableNowShare);
const median = (category: string) => `<b>${f.category(category).median}</b><small>/hr median</small>`;
const share = (...categories: string[]) => f.pct(categories.reduce((a, c) => a + f.role(c).share, 0));
const role = (name: string, sub: string, href?: string) => `${href ? `<a href="${href}">${name}</a>` : name}<small>${sub}</small>`;

const page: EngagePage = {
  slug: "fractional",
  name: "Monthly fractional leadership",
  meta: {
    title: "Monthly fractional leadership",
    description: `A fractional leader works ${facts.daysPerWeek} on a first term of ${facts.firstTerm}, then ${facts.noticePeriod} notice. Hours move up or down as the work does. ${f.engagements.medianMonthly}/month median engagement, no fees for companies.`,
  },
  hero: {
    eyebrow: "How we engage - Monthly fractional",
    h1: { plain: "Senior leadership that", em: "flexes with the business" },
    lede: `A fractional leader works ${facts.daysPerWeek} on a first term of ${facts.firstTerm}, then ${facts.noticePeriod} notice. Hours move up or down as the work does, and you pay only for the hours the job needs.`,
    primary: { label: "Talk to us", href: "/talk" },
    secondary: { label: "See the roles", href: "#roles" },
    stat: { v: `${f.engagements.medianMonthly}/month`, l: "median engagement, Revenue Nomad Rate Index" },
  },
  sections: [
    {
      id: "elastic",
      eyebrow: "The elastic workforce",
      title: "Companies compete on capability, not headcount",
      band: "mist",
      blocks: [
        {
          t: "lede",
          html: "We call it the elastic workforce: full-time employees, fractional leaders, interim cover, project specialists and AI, run as one pool of capability that flexes as the business changes. It is not gig work, freelancing or temp staffing - it is senior leaders who own an outcome, for the hours the outcome takes.",
        },
        {
          t: "cards",
          cols: 4,
          items: [
            {
              title: "Specialists over generalists",
              body: "A leader who has built your exact motion, at your stage and deal size, beats a bigger resume who could learn it.",
            },
            {
              title: "Capability over seats",
              body: "Buy the outcome and the hours it takes - not a 40-hour seat you have to fill whether the work is there or not.",
            },
            {
              title: "Elastic moves faster",
              body: "Pull a specialist in, ramp hours up or down, and swap skills as the plan changes - without a reorg.",
            },
            {
              title: "AI makes the hours count",
              body: `${f.pct(f.survey.aiUse.share)} of operators use AI in delivery, and ${f.pct(f.survey.aiUse.most)} say most of their delivery runs through it. The hours you buy go to judgment.`,
            },
          ],
        },
      ],
      source: `Fractional job titles in the US are up 265% since 2019 (Lightcast). AI use from the State of Fractional GTM 2027 operator survey, n=${f.survey.detailed}.`,
    },
    {
      id: "roles",
      eyebrow: "The network",
      title: "The roles on our platform",
      intro: "Senior go-to-market leaders across every seat in the revenue engine. Most companies start with sales leadership, and the most common pairing is a sales leader plus RevOps - one owns the team and the number, the other makes the number measurable.",
      band: "white",
      blocks: [
        {
          t: "table",
          head: ["Role", "Share of operators", "Rate companies pay"],
          firstColHeader: true,
          rows: [
            [role("Sales leadership", "Sales Director, VP of Sales, Head of Sales, CRO", "/fractional-vp-of-sales"), share("Sales Leadership"), median("Sales Leadership")],
            [role("Marketing", "CMO, VP of Marketing, demand and positioning", "/fractional-cmo"), share("Marketing"), median("Marketing")],
            [role("Revenue operations", "CRM, data, forecast and comp mechanics", "/fractional-revops"), share("Revenue Operations"), median("Revenue Operations")],
            [role("AI GTM", "AI in the sales and marketing workflow", "/fractional-ai-gtm"), share("AI GTM"), median("AI GTM")],
            [role("Sales enablement", "Onboarding, playbooks, coaching cadence"), share("Sales Enablement"), median("Sales Enablement")],
            [
              role("Customer success and partnerships", "Retention, expansion, channel programs"),
              share("Customer Success & Growth", "Partnerships"),
              `<b>${f.category("Customer Success & Growth").median} / ${f.category("Partnerships").median}</b><small>/hr median</small>`,
            ],
          ],
        },
      ],
      source: `Share of operators from the State of Fractional GTM 2027, ${f.headline.operators} operators. Median hourly rates from the Revenue Nomad Rate Index, as companies pay them. ${availableNow} of operators on the platform are available to start now.`,
    },
    {
      id: "staff",
      eyebrow: "How we staff",
      title: "From your first call to a leader in the seat",
      intro: "One process for every request. We match on the problem first - stage, deal size and motion - then put two or three leaders in front of you with their rates and company reviews.",
      band: "night",
      blocks: [
        {
          t: "steps",
          items: [
            {
              n: "1",
              when: "Day 1",
              title: "Tell us the problem",
              body: `We speak within ${facts.responseHours}. You describe where revenue is stuck, the team, the stage and the hours you can fund.`,
            },
            {
              n: "2",
              when: "Days 2 - 4",
              title: "We write the role profile",
              body: "The seat, the motion and the fit criteria - sales cycle, contract value, quota managed and outbound mix.",
            },
            {
              n: "3",
              when: "Within days",
              title: "Meet two or three leaders",
              body: "Each one with their rate, their tier and reviews from the companies they led. Ask them to walk you through their first 90 days.",
              note: "Intro calls within days",
            },
            {
              n: "4",
              when: "Contract",
              title: "One agreement, billed monthly",
              body: `The rate times the hours the scope needs, on a first term of ${facts.firstTerm}. No fees for companies.`,
            },
            {
              n: "5",
              when: "Kickoff",
              title: "The leader takes it from here",
              body: "The leader runs the kickoff with your team. Hours flex up or down as the work changes.",
              note: "Opt-out window in the first term",
            },
          ],
        },
      ],
      source: `${availableNow} of operators on the platform are available to start now, and nearly all within two weeks - State of Fractional GTM 2027.`,
    },
    {
      // The shared method from app/solutions/content/shared.ts, rendered by PickMethod exactly as on the role pages.
      id: "pick",
      eyebrow: pick.eyebrow,
      title: pick.title,
      blocks: [{ t: "pick" }],
    },
    {
      id: "hours",
      eyebrow: "Hours that flex",
      title: "Start with the hours the job needs, then adjust",
      intro: "Buyers start with the hours they are comfortable paying for, see results, and buy more. Size the engagement for the job, not for the hours that feel safe.",
      band: "white",
      blocks: [
        {
          t: "stats",
          items: [
            { v: f.pct(f.engagements.extendedShare), l: `of engagements ran past their first term - only ${endedEarly} ended early` },
            { v: expanded, l: "direct clients expanded hours within months - none cut back" },
            { v: f.pct(f.engagements.resultInside60), l: "showed a first measurable result inside 60 days" },
            { v: under40, l: "of engagements run 40 hours a month or fewer - about one day a week" },
          ],
        },
      ],
      source: `From the State of Fractional GTM 2027 - operator survey n=${f.survey.detailed} and the direct contracts reviewed for the report.`,
    },
    {
      id: "shapes",
      eyebrow: "Common shapes",
      title: `What ${facts.daysPerWeek} looks like`,
      band: "mist",
      blocks: [
        {
          t: "cards",
          cols: 4,
          items: [
            {
              title: "About 20 hours a month",
              body: "Half a day a week. A Director running pipeline review and coaching a small team. Below 20 hours, engagements extend only a third of the time.",
            },
            {
              title: "About 40 hours a month",
              body: "One day a week. A VP owning the team, the number and the forecast - or a CMO owning positioning and demand.",
            },
            {
              title: "60 hours and up",
              body: "Two days a week or more. A build - a new motion, a new team or a rebuild - where the leader is in the work, not advising on it.",
            },
            {
              title: "Two leaders, paired",
              body: "A sales leader plus RevOps is the most common pairing. Sales plus marketing gives an early company a presence beyond the founder’s network.",
            },
          ],
        },
      ],
      source: "Hours and extension patterns from the State of Fractional GTM 2027.",
    },
    {
      id: "faq",
      title: "Common questions",
      band: "mist",
      blocks: [
        {
          t: "faq",
          items: [
            {
              q: "How many days a week do we get?",
              a: `Most engagements run ${facts.daysPerWeek}. Forty hours a month is about one day a week.`,
            },
            {
              q: "What does it cost?",
              a: `The median monthly engagement in the Revenue Nomad Rate Index is ${f.engagements.medianMonthly}. You pay the operator’s rate times the hours the scope needs - no fees for companies.`,
            },
            {
              q: "Can we change the hours?",
              a: `Yes. Hours ramp up or down as the work changes. ${expanded} direct clients in our report expanded hours within months.`,
            },
            {
              q: "What if the fit is wrong?",
              a: `A first term of ${facts.firstTerm}, then ${facts.noticePeriod} notice - and we can introduce another matched leader.`,
            },
            {
              q: "Is this a staffing agency?",
              a: "No. We match a senior operator to a scoped problem and stand behind the fit. Every leader carries reviews from the companies they led, and the leader owns an outcome, not a timesheet.",
            },
            {
              q: "Can a fractional leader become full time?",
              a: "Yes. Conversion terms are written into the contract up front.",
            },
          ],
        },
      ],
    },
    {
      id: "other",
      title: "Other ways we engage",
      band: "white",
      blocks: [{ t: "otherWays" }],
    },
  ],
};

export default page;
