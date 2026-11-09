import type { Chapter } from "./types";
import * as f from "./figures";

const under30 = f.ttr("Under 30 days").share;
const endedEarlyPct = Math.round((f.survey.status.endedEarly / f.survey.detailed) * 100);
const hoursN = f.survey.extendedByHours.reduce((a, b) => a + b.y, 0);
const hoursUnder = (...bands: string[]) => Math.round((bands.reduce((a, b) => a + f.extendedByHours(b).y, 0) / hoursN) * 100);
const under40Hours = hoursUnder("Under 20", "20 - 39");
const under60Hours = hoursUnder("Under 20", "20 - 39", "40 - 59");
const demandPct = (n: number) => f.pct(Math.round((n / f.movement.demand.n) * 100));
const vp = f.seat("Sales Director or VP of Sales")!;
const cro = f.seat("CRO and revenue transformation")!;
const aiGtm = f.category("AI GTM");
const operators = (n: number) => n.toLocaleString("en-US");

const chapter: Chapter = {
  slug: "answers",
  number: "—",
  title: "The answers CEOs ask for first",
  dek: "Fourteen questions, each answered with the number behind it",
  blocks: [
    {
      t: "lede",
      html: "Fourteen questions, each answered with the number behind it. Every one is expanded in the chapters that follow.",
    },
    {
      t: "qa",
      items: [
        {
          n: "01",
          figure: "A leader",
          q: "What is a fractional GTM leader?",
          html: "A senior sales, marketing, revenue operations or enablement executive who runs part of your revenue function on a retained, part-time basis, usually 20 to 40 hours a month, reporting to the CEO. Not a consultant who hands you a deck, not an agency, not a part-time rep. A leader, with decision rights, who is not on payroll.",
        },
        {
          n: "02",
          figure: `${f.rates.median}/hr`,
          q: "What does a fractional sales leader cost in 2027?",
          html: `The middle half runs ${f.rates.p25} to ${f.rates.p75}; the median engagement ${f.engagements.medianMonthly} a month. In our signed contracts, a Sales Director or VP at ${vp.hours.min} to ${vp.hours.max} hours runs ${f.monthly(vp.monthly.min)} to ${f.monthly(vp.monthly.max)}; a CRO at ${cro.hours.min} to ${cro.hours.max} hours ${f.monthly(cro.monthly.min)} to ${f.monthly(cro.monthly.max)}.`,
          see: "Chapter 3",
        },
        {
          n: "03",
          figure: "20 - 40 hrs",
          q: "How many hours a month is typical?",
          html: `${f.pct(under60Hours)} of engagements are under 60 hours a month, and ${f.pct(under40Hours)} under 40. Under 20 hours is advisory; over 80 is interim.`,
          see: "Chapters 3 and 5",
        },
        {
          n: "04",
          figure: f.pct(f.engagements.extendedShare),
          q: "How long does an engagement last?",
          html: `The largest share start at three to six months (${f.pct(f.term("3 to 6 months"))}) with an opt-out around week 8 to 12, then roll month to month. ${f.pct(f.engagements.extendedShare)} extend past the initial term; ${f.pct(f.survey.status.stillRunning)} in our data are still running.`,
          see: "Chapter 5",
        },
        {
          n: "05",
          figure: "30 days",
          q: "How fast do you see results?",
          html: `Half (${f.pct(under30)}) show a measurable result inside 30 days; four in five (${f.pct(f.engagements.resultInside60)}) inside 60. The first result is usually a forecast you can trust or a process the team actually follows, not closed revenue.`,
          see: "Chapter 5",
        },
        {
          n: "06",
          figure: f.pct(endedEarlyPct),
          tone: "coral",
          q: "How often does it fail?",
          html: `${f.of(f.survey.status.endedEarly, f.survey.detailed)} ended early. Three were at pre-revenue or sub-$1 million companies: expectations no leader could meet, a CEO who could not hold focus, a launch that slipped. The fourth was a leadership team not ready to adopt what it bought.`,
          see: "Chapters 5 and 7",
        },
        {
          n: "07",
          figure: `${f.category("Sales Leadership").median} vs $245+`,
          q: "Is fractional cheaper than a full-time VP of Sales?",
          html: "Per hour, about the same. A full-time VP costs $500,000 to $575,000 in year one including search, roughly $245 to $280 an hour loaded. Fractional is cheaper because you buy fewer hours, start in two weeks instead of four months, and can reverse the decision.",
          see: "Chapter 4",
        },
        {
          n: "08",
          figure: f.pct(f.coreShare),
          q: "Who hires fractional GTM leaders?",
          html: `Mostly CEOs and founders of $1 million to $50 million companies; ${f.pct(f.coreShare)} of engagements are at $1M to $20M. Three-quarters of inbound buyers have fewer than 100 employees. Agencies, services, healthcare and nonprofits buy as often as software.`,
          see: "Chapter 2",
        },
        {
          n: "09",
          figure: "Two roads",
          q: "Why do they hire one?",
          html: "They lost a sales leader and do not want to repeat the hire blind, or the founder has carried revenue for years and needs to hand it off. Six triggers: founder leaving the closing seat, a leader departure, a team with no system, founder-dependent pipeline, an untrusted forecast, a move upmarket.",
          see: "Chapters 2 and 7",
        },
        {
          n: "10",
          figure: `${f.pct(f.wish("stage"))} vs ${f.pct(f.wish("logos"))}`,
          q: "What should you check before hiring one?",
          html: `Stage and deal-size match first: ${f.pct(f.wish("stage"))} of operators wish clients had checked it. Then how they communicate part-time (${f.pct(f.wish("communication"))}), references (${f.pct(f.wish("references"))}) and industry (${f.pct(f.wish("industry"))}). Only ${f.pct(f.wish("logos"))} said big logos.`,
          see: "Chapter 8",
        },
        {
          n: "11",
          figure: f.pct(f.survey.howFound.peer),
          q: "How do you find one?",
          html: `${f.pct(f.survey.howFound.peer)} of engagements come through peer referral, ${f.pct(f.survey.howFound.marketplace)} through a marketplace or network, 19% through LinkedIn inbound. ${f.survey.howFound.jobPost} in ${f.survey.howFound.n} came from a job post. Ask a peer, then verify on a platform.`,
          see: "Chapters 1 and 8",
        },
        {
          n: "12",
          figure: `~${operators(f.market.operatorsCentral)}`,
          q: "How big is the fractional GTM market?",
          html: `About ${operators(f.market.operatorsCentral)} US fractional GTM leaders (range ${operators(f.market.operatorsLow)} to ${operators(f.market.operatorsHigh)}) billing roughly ${f.marketSpend.centralLong} a year (range ${f.marketSpend.rangeLong}). The floor, people with "fractional" in their title doing GTM work, is about 9,000.`,
          see: "Chapter 1",
        },
        {
          n: "13",
          figure: "+265%",
          q: "Is demand growing?",
          html: `Yes, steadily. ${demandPct(f.movement.demand.up)} of operators say demand is up from a year ago, ${demandPct(f.movement.demand.flat)} flat, ${demandPct(f.movement.demand.down)} down. The typical operator raised their rate about ${f.pct(f.movement.medianChangePct)}. Fractional job titles in the US are up 265% since 2019.`,
          see: "Chapter 1",
        },
        {
          n: "14",
          figure: f.pct(f.survey.aiUse.share),
          q: "How is AI changing it?",
          html: `${f.pct(f.survey.aiUse.share)} of operators use AI in delivery, and ${f.pct(f.survey.aiUse.most)} say most of their delivery runs through it. AI GTM is the highest-demand role and already prices at the market center, about ${aiGtm.median} an hour on ${aiGtm.n} rates. The early-adopter discount is gone.`,
          see: "Chapters 6 and 10",
        },
      ],
    },
  ],
};

export default chapter;
