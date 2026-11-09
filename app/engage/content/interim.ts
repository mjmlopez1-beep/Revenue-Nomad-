import * as f from "../../guide/content/figures";
import type { EngagePage } from "./types";

/**
 * Interim cover, from the Design canvas artboard "InterimPage" (desktop) and its phone twin "InterimMobile".
 * Every word of the board, in order. Dataset figures are read from app/guide/content/figures.ts so the page moves
 * with data/rate-index.json: the monthly range and the hours come from the signed "Interim head of sales"
 * contracts. Figures with no column in the dataset stay as the board wrote them: the Majhi Group search timing
 * (90 to 120 days), the "about two weeks" to cover the seat, the 24-hour response, the week 8 opt-out and
 * 30 days notice, and the facts of the one 2026 engagement.
 */

const seat = f.seat("Interim head of sales");

/** "$31.2k - $35.8k/month" from the signed interim head of sales contracts. */
const monthly = seat?.monthly ? `${f.k(seat.monthly.min)} - ${f.k(seat.monthly.max)}/month` : "see the Rate Index";
/** "130 to 173" hours a month from the same contracts. */
const hours = seat?.hours ? `${seat.hours.min} to ${seat.hours.max}` : "four days a week to full time";

const page: EngagePage = {
  slug: "interim",
  name: "Interim cover",
  meta: {
    title: "Interim cover",
    description: `When a sales leader leaves, an interim head of sales takes the seat within weeks, runs the team and the forecast, and hands your permanent hire a documented playbook instead of a gap. ${monthly} from our 2026 data, no search fee.`,
  },
  hero: {
    eyebrow: "How we engage - Interim cover",
    h1: { plain: "A sales team that keeps selling", em: "while you search" },
    lede: "When a sales leader leaves, an interim head of sales takes the seat within weeks, runs the team and the forecast, and hands your permanent hire a documented playbook instead of a gap.",
    primary: { label: "Talk to us", href: "/talk" },
    secondary: { label: "See how it runs", href: "#how-it-runs" },
    stat: { v: monthly, l: `from our 2026 data, ${hours} hours` },
  },
  sections: [
    {
      id: "how-it-runs",
      title: "How it runs",
      band: "mist",
      blocks: [
        {
          t: "steps",
          items: [
            { n: "1", when: "Week 0", title: "Scope and match", body: "We speak within 24 hours and match on stage and motion." },
            { n: "2", when: "Weeks 1 - 2", title: "In the seat", body: "Kickoff with the CEO, 1:1s with every rep and a full pipeline read." },
            { n: "3", when: "Months 1 - 2", title: "Hold the number", body: "Forecast call, pipeline review and win/loss. Opt-out at week 8." },
            { n: "4", when: "Months 2 - 3", title: "Document and hire", body: "The process written down, and help hiring the permanent leader." },
            { n: "5", when: "Handoff", title: "Overlap, then exit", body: "Up to two weeks side by side with the incoming leader." },
          ],
        },
      ],
    },
    {
      id: "when",
      title: "When companies call for interim cover",
      band: "white",
      blocks: [
        {
          t: "cards",
          cols: 4,
          items: [
            {
              title: "Your sales leader gave notice",
              body: "Two weeks left, a quarter in flight and a team that still needs its 1:1s, its pipeline review and its forecast call.",
            },
            {
              title: "The strategy just changed",
              body: "A new motion was announced - enterprise, outbound or a new segment - and the leader who was going to run it is gone.",
            },
            {
              title: "The search will take two quarters",
              body: "A VP-level search typically takes 90 to 120 days to an accepted offer, then a notice period and a ramp.",
            },
            {
              title: "The board still wants the number",
              body: "Someone has to own the forecast this quarter, not after the new hire settles in.",
            },
          ],
        },
      ],
      source: "Search timing from Majhi Group, as cited in the State of Fractional GTM 2027.",
    },
    {
      id: "case",
      eyebrow: "How one ran",
      title: "Covered in about two weeks, handed off with overlap",
      band: "white",
      blocks: [
        {
          t: "p",
          html: "A self-funded B2B software and services company lost its VP of Sales with two weeks’ notice - days after committing to an enterprise, outbound motion. Its four AEs had been hired to work inbound.",
        },
        {
          t: "p",
          html: "An interim head of sales started in the seat about two weeks later, reporting to the CEO. The first weeks went to the team and the pipeline: coaching every AE on new business and renewals, taking over the forecast and CRM hygiene, and partnering with marketing on account-based programs.",
        },
        {
          t: "p",
          html: "The company ran its own search for the permanent leader. When the interim leader was making changes the company wanted to see through, it moved the role from four days a week to full time rather than hand a new hire half a plan.",
        },
        {
          t: "p",
          html: "The final weeks were planned around the handoff - documentation, the playbook, team enablement, and up to two weeks of overlap with the incoming leader.",
        },
        {
          t: "callout",
          tone: "night",
          html:
            "<dl>" +
            "<dt>Time to cover</dt><dd>About two weeks from notice to a leader in the seat</dd>" +
            "<dt>Seat</dt><dd>Interim head of sales, reporting to the CEO</dd>" +
            "<dt>Hours</dt><dd>Four days a week, then full time at the company’s request</dd>" +
            "<dt>Terms</dt><dd>Three months, then month to month - an opt-out at week 8 and 30 days notice</dd>" +
            "<dt>Handoff</dt><dd>Documented process and up to two weeks of overlap with the permanent hire</dd>" +
            "</dl>",
        },
      ],
      source: "One 2026 engagement, described without the company’s name. Facts from the engagement agreement and records.",
    },
    {
      id: "compare",
      title: "Interim, an empty seat or a search alone?",
      intro: "Three ways to get through the gap between sales leaders.",
      band: "mist",
      blocks: [
        {
          t: "compare",
          columns: ["Interim head of sales", "Leave the seat empty", "Full-time search alone"],
          rows: [
            {
              label: "Starts",
              cells: ["About two weeks from notice in our 2026 engagement", "Now - the CEO absorbs it", "90 to 120 days to an accepted offer, then notice and ramp"],
            },
            {
              label: "Who runs the team",
              cells: ["A leader held to full-time expectations", "The CEO, on top of the day job", "Nobody until the hire starts"],
            },
            {
              label: "Monthly cost",
              cells: [`${monthly} - from our 2026 data, no search fee`, "No line item - the quarter pays for it", "Salary, equity and a search fee once hired"],
            },
            {
              label: "If it is not working",
              cells: ["Opt-out at week 8, then 30 days notice", "Reps drift and reviews stop", "A hard break and a second search"],
            },
            {
              label: "What the new hire inherits",
              cells: ["A documented playbook and a team that kept selling", "A team that went a quarter without a leader", "Whatever the last leader left behind"],
            },
          ],
          note: "Search timing from Majhi Group, as cited in the State of Fractional GTM 2027. Interim cost from the Revenue Nomad Rate Index seat rollup - what companies pay.",
        },
      ],
    },
    {
      id: "owns",
      eyebrow: "What the interim leader owns",
      title: "The whole seat, not a holding pattern",
      band: "mist",
      blocks: [
        {
          t: "cards",
          cols: 2,
          items: [
            {
              title: "Every rep, every week",
              body: "Coaching across new business and renewals, 1:1s and deal reviews, so nobody waits for the new hire.",
            },
            {
              title: "The forecast",
              body: "Pipeline, forecast and CRM hygiene - the number the board sees this quarter.",
            },
            {
              title: "The operating rhythm",
              body: "Weekly pipeline review and a win/loss routine the team keeps after the handoff.",
            },
            {
              title: "Marketing alignment",
              body: "Partnering with marketing on account-based programs and the pipeline it feeds.",
            },
            {
              title: "The playbook",
              body: "The process written down, so the permanent leader starts from a system, not from scratch.",
            },
            {
              title: "The next hire",
              body: "Job description, interview support and onboarding for the permanent leader - if you want it.",
            },
          ],
        },
      ],
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
              q: "How fast can someone start?",
              a: "We speak within 24 hours of your request. In our 2026 interim engagement, the leader was in the seat about two weeks after the previous VP gave notice.",
            },
            {
              q: "How many hours does interim take?",
              a: `More than monthly fractional. Interim runs about four days a week up to full time - ${hours} hours a month in our 2026 data.`,
            },
            {
              q: "Do you run the search for the permanent hire?",
              a: "Most companies run the search themselves while the interim leader holds the seat. The interim leader can help write the job description, interview and onboard the hire.",
            },
            {
              q: "Can the interim leader become our permanent hire?",
              a: "Yes. Conversion terms are written into the contract up front, so there is no surprise if you want to keep them.",
            },
            {
              q: "What if it is not working?",
              a: "There is an opt-out at week 8, then 30 days notice. Far less risk than unwinding a rushed full-time hire.",
            },
            {
              q: "What happens at the handoff?",
              a: "A documented process, team enablement in the final weeks, and up to two weeks of overlap with the incoming leader.",
            },
          ],
        },
      ],
    },
    {
      id: "other-ways",
      title: "Other ways we engage",
      band: "white",
      blocks: [{ t: "otherWays" }],
    },
  ],
};

export default page;
