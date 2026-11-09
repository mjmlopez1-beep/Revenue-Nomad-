import * as f from "../../guide/content/figures";
import type { EngagePage } from "./types";

/**
 * Fractional to full time, from the Design canvas artboard "FullTimePage" (desktop) and its phone twin
 * "FullTimeMobile". Every word of the board is carried in order; every dataset figure is read from
 * app/guide/content/figures.ts so the page moves with data/rate-index.json. Figures with no column in the dataset
 * (the executive search time, the SHRM cost-per-hire, the HBR CRO tenure, the 40 to 80 and 160 hours a month)
 * stay as the artboard wrote them.
 */

const status = f.survey.status;
/** "1 in 74" engagements converted to full time. */
const converted = `${status.converted} in ${status.n}`;
/** "One engagement in 74" for the FAQ. */
const convertedWords = `${status.converted === 1 ? "One engagement" : `${status.converted} engagements`} in ${status.n}`;
/** "5%" ended early. */
const endedEarly = f.pct(Math.round((status.endedEarly / status.n) * 100));
/** "4 of 11" direct clients added hours. */
const expanded = f.of(f.contracts.expandedHours, f.contracts.directClients);
/** "57%" ran past their first term. */
const extended = f.pct(f.engagements.extendedShare);
/** "82%" show a first measurable result inside 60 days. */
const inside60 = f.pct(f.engagements.resultInside60);

const page: EngagePage = {
  slug: "full-time",
  name: "Fractional to full time",
  meta: {
    title: "Fractional to full time",
    description: `Start with a fractional leader on a first term of 3 to 6 months. At the 90-day readout you decide - extend, expand, convert to full time or end - with the conversion terms already agreed. No fees for companies.`,
  },
  hero: {
    eyebrow: "How we engage - Fractional to full time",
    h1: { plain: "Hire the leader", em: "you have already seen work" },
    lede: "Start with a fractional leader on a first term of 3 to 6 months. At the 90-day readout you decide - extend, expand, convert to full time or end - with a working system in place and the conversion terms already agreed.",
    primary: { label: "Talk to us", href: "/talk" },
    secondary: { label: "How it works", href: "#how-it-works" },
    stat: { v: "Conversion terms", l: "written into the contract from day one" },
  },
  sections: [
    {
      id: "readout",
      title: "At the 90-day readout",
      band: "white",
      blocks: [
        {
          t: "stats",
          items: [
            { v: extended, l: "Extend", s: "ran past their first term" },
            { v: expanded, l: "Expand", s: "direct clients added hours within months" },
            { v: converted, l: "Convert", s: "converted to full time - on terms agreed up front" },
            { v: endedEarly, l: "End", s: "ended early" },
          ],
          source: `The State of Fractional GTM 2027 - operator survey n=${status.n} and direct contracts.`,
        },
      ],
    },
    {
      id: "fractional-or-search",
      title: "Fractional first, or search first?",
      intro: "Two ways to land a full-time sales leader.",
      band: "mist",
      blocks: [
        {
          t: "compare",
          columns: ["Fractional to full time", "Executive search first"],
          rows: [
            { label: "Time to a leader", cells: ["Intro calls within days, then a leader in the seat", "90 to 120 days to an accepted offer, then notice and ramp"] },
            { label: "What you see first", cells: ["90 days of their work - in your business, with your team and your numbers", "Interviews, references and a resume"] },
            { label: "Upfront cost", cells: [`The monthly fractional rate - ${f.engagements.medianMonthly}/month median engagement`, "Average executive cost-per-hire of $35,879, before salary"] },
            { label: "If it is the wrong person", cells: ["30 days notice in the first term - you never convert", "Severance, a second search and lost time - CROs average 25 months in the role"] },
            { label: "What the hire inherits", cells: ["A system they built and already run", "Whatever the last leader left behind"] },
          ],
          note: "Search time from Majhi Group. Cost-per-hire from SHRM 2025 benchmarking. CRO tenure from Harvard Business Review, October 2024. Median engagement from the Revenue Nomad Rate Index.",
        },
      ],
    },
    {
      id: "how-it-works",
      eyebrow: "How it works",
      title: "Fractional first, then decide",
      intro: "The cleanest pattern in our contracts is not fractional instead of full time. It is fractional first, with a decision point you can plan around.",
      band: "night",
      blocks: [
        {
          t: "steps",
          items: [
            { n: "1", when: "Day 1", title: "Start fractional", body: "A matched leader 1 to 3 days a week, on a first term of 3 to 6 months. Conversion terms are in the contract before work starts." },
            { n: "2", when: "Days 1 - 60", title: "Diagnose and build", body: "The leader scores what is broken, then builds - stages, forecast, playbook, coaching cadence.", note: `${inside60} show a first measurable result inside 60 days` },
            { n: "3", when: "Day 90", title: "The readout", body: "The leader presents what changed and next quarter's number. You decide: extend, expand, convert or end." },
            { n: "4", when: "Convert", title: "Make the offer", body: "Title, reporting line, compensation and start date - on conversion terms you agreed on day one." },
            { n: "5", when: "After", title: "Keep what was built", body: "The playbook, the dashboards and the operating rhythm stay with you, run by the leader who built them." },
          ],
        },
      ],
      source: `Structure from the contracts reviewed for the State of Fractional GTM 2027. Result timing from its operator survey, n=${status.n}.`,
    },
    {
      id: "six-questions",
      eyebrow: "The 90-day readout",
      title: "Six questions that decide it",
      band: "white",
      blocks: [
        { t: "callout", tone: "gold", html: "Bring these to the readout. If most answers are yes, convert. If not, extend or hire into a clear role." },
        {
          t: "cards",
          cols: 3,
          items: [
            { title: "Did the first result land?", body: "A forecast that holds, a pipeline clean enough to inspect, a process the team follows. Revenue follows these." },
            { title: "Does the job now need 160 hours a month?", body: "If the work fits in 40 to 80 hours, keep it fractional. Converting a part-time job into a full-time salary is the costly mistake." },
            { title: "Does the team run the system without them in the room?", body: "The best signal of a leader worth keeping is a team that keeps the cadence on their days off." },
            { title: "Is the next 18 months the same job?", body: "A builder who wrote the first playbook is not always the scaler you need for a team of fifty." },
            { title: "Do they want the seat?", body: "Many senior operators run a portfolio by choice. Ask early, not at the offer." },
            { title: "Can you fund the full-time package?", body: "Salary, variable, equity and benefits - against what the fractional hours cost today." },
          ],
        },
      ],
    },
    {
      id: "outcomes",
      eyebrow: "When the readout ends",
      title: "Three good outcomes, not one",
      band: "mist",
      blocks: [
        {
          t: "cards",
          cols: 3,
          items: [
            { title: "Convert", body: "The job is full time, the leader wants it and the team follows them. Make the offer on the terms you agreed up front." },
            { title: "Keep it fractional", body: "The work fits 1 to 3 days a week. Extend, or expand the hours - the most common outcome in our data.", href: "/how-we-engage/fractional", cta: "Monthly fractional leadership" },
            { title: "Hire into a clear role", body: "The leader writes the job description from what they built, helps interview, and hands the playbook to the person you hire." },
          ],
        },
      ],
    },
    {
      id: "the-switch",
      eyebrow: "The switch",
      title: "What to settle when you convert",
      band: "white",
      blocks: [
        {
          t: "cards",
          cols: 4,
          items: [
            { title: "Title and reporting line", body: "Usually the seat the leader already holds - with the CEO as the manager of record." },
            { title: "Compensation and equity", body: "Base, variable and equity for a full-time seat, set against the market for your stage." },
            { title: "Their other clients", body: "A start date that gives the leader time to hand off any other engagements cleanly." },
            { title: "What stays with you", body: "The playbook, the dashboards, the sequences and the cadence - all built in your systems, all yours." },
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
            { q: "Is there a hire-away fee?", a: "Yes, and it is written into the contract before the engagement starts - so you know the cost of converting on day one, not at the offer." },
            { q: "When can we convert?", a: "Most companies decide at the 90-day readout, once there is a working system to judge the leader by." },
            { q: "How often does it happen?", a: `${convertedWords} converted to full time in our 2027 research. Far more extended or expanded instead.` },
            { q: "What if the leader does not want full time?", a: "Then you know early. Keep them fractional, or have them write the job and help hire the full-time leader." },
            { q: "Can we start interim and convert?", a: "Yes. Interim cover holds the seat four days a week or more, and the same conversion terms can apply." },
            { q: "Is this a trial hire?", a: "It is a real engagement with a real scope. The leader owns an outcome from day one - conversion is an option, not the purpose." },
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
