import type { Chapter } from "./types";
import * as f from "./figures";

/* Shares computed from x-of-y counts, rounded to whole percent. */
const share = (b: { x: number; y: number }) => Math.round((b.x / b.y) * 100);
const ofShare = (b: { x: number; y: number }) => `${share(b)}%`;

/* Figure 5.1: time to first measurable result. */
const ttrRows = f.survey.timeToResult;
const ttrHigh = Math.max(...ttrRows.map((t) => t.share));

/* Figure 5.2: initial term. */
const termRows = f.engagements.termShare;
const termHigh = Math.max(...termRows.map((t) => t.share));

/* Figure 5.3: extension by hours a month. */
const hoursRows = f.survey.extendedByHours.map((b) => ({ ...b, share: share(b) }));
const hoursHigh = Math.max(...hoursRows.map((b) => b.share));
const hoursLow = Math.min(...hoursRows.map((b) => b.share));
const hoursTag = (s: number) => (s === hoursHigh ? " (highest)" : s === hoursLow ? " (lowest)" : "");

/* Figure 5.4: status of the most recent engagement. stillRunning is a share; the rest are counts of n. */
const st = f.survey.status;
const statusPct = (count: number) => f.pct(Math.round((count / st.n) * 100));

/* Platform minimum terms. */
const minThree = f.platform.minThreeMonths;
const minOne = f.platform.minOneMonth;

const chapter: Chapter = {
  slug: "05-how-fast-how-long",
  number: "05",
  title: "How fast, how long, how it ends",
  dek: "The data on the three things CEOs worry about, with one real caveat",
  stats: [
    { v: f.pct(f.ttr("Under 30 days").share), l: "first measurable result inside 30 days" },
    { v: f.pct(f.engagements.extendedShare), l: "extended past the initial term" },
    { v: f.pct(st.stillRunning), l: "of most recent engagements still running" },
    { v: f.of(st.endedEarly, st.n), l: "ended early, all readiness failures" },
  ],
  blocks: [
    {
      t: "lede",
      html: "CEOs worry about three things with fractional: that it will take forever to show results, that the person will vanish, and that they will be stuck in a contract that is not working. The data on all three is reassuring, with one real caveat.",
    },

    { t: "h2", eyebrow: "Figure 5.1", text: "How fast", id: "how-fast" },
    {
      t: "table",
      head: ["Time to first measurable result", "Share of engagements"],
      firstColHeader: true,
      rows: ttrRows.map((t) => [t.band, `${f.pct(t.share)}${t.share === ttrHigh ? " (highest)" : ""}`]),
      note: `n=${f.survey.detailed}. Stacked bar shows each share of the whole; table bars scaled to the highest value in the column (${f.pct(ttrHigh)}).`,
    },
    {
      t: "p",
      html: `Half of engagements produced something measurable inside a month. Nearly four in five inside two. The ${f.pct(f.ttr("90+ days").share)} that took more than 90 days were concentrated in enablement programs and marketing builds, both of which have longer natural cycles.`,
    },
    {
      t: "p",
      html: "\"Measurable\" is doing some work in that sentence. A first result is rarely closed revenue. It is a forecast that holds, a pipeline that is clean enough to inspect, a documented process, a working outbound sequence, a comp plan that makes sense. Those are the things that produce revenue later, and the operators in our survey were clear that confusing the two is one of the main ways buyers set themselves up to be disappointed.",
    },
    {
      t: "callout",
      tone: "leaf",
      title: "What a first result looks like",
      html: "A forecast that holds<br>A pipeline clean enough to inspect<br>A documented process<br>A working outbound sequence<br>A comp plan that makes sense",
    },
    {
      t: "callout",
      tone: "gold",
      title: "Caveat",
      html: "Still: if you are 90 days in with nothing to point to, something is wrong. The data says that is a one-in-ten outcome, and the operators say it usually traces back to a scope that was never defined.",
    },

    { t: "h2", eyebrow: "Figure 5.2", text: "How long", id: "how-long" },
    { t: "lede", html: "Here is the one place buyers and operators disagree before the engagement starts." },
    {
      t: "table",
      head: ["Initial term agreed", "Share of engagements"],
      firstColHeader: true,
      rows: termRows.map((t) => [t.term, `${f.pct(t.share)}${t.share === termHigh ? " (most common)" : ""}`]),
      note: `n=${f.survey.detailed}. Bars scaled to the highest value in the column (${f.pct(termHigh)}).`,
    },
    {
      t: "stats",
      items: [
        { v: ofShare(minThree), l: "of platform operators set a three-month minimum" },
        { v: ofShare(minOne), l: "will take one month" },
        { v: f.pct(f.term("1 to 3 months")), l: "initial terms of 1 to 3 months" },
        { v: f.pct(f.term("3 to 6 months")), l: "initial terms of 3 to 6 months" },
      ],
    },
    {
      t: "p",
      html: `Initial terms split almost evenly between three to six months (${f.pct(f.term("3 to 6 months"))}) and one to three months (${f.pct(f.term("1 to 3 months"))}). Buyers want a short trial. But on the Revenue Nomad platform, ${ofShare(minThree)} of operators set a minimum engagement of three months, and only ${ofShare(minOne)} (${f.of(minOne.x, minOne.y)}) will take one month. Experienced operators have learned that nothing meaningful happens in 30 days except a diagnosis, and they do not want to be judged on it.`,
    },
    {
      t: "callout",
      tone: "leaf",
      title: "Recommended contract structure",
      html: "Our own contracts resolve this the way the market seems to be converging: a three- to six-month initial term with an opt-out checkpoint at week 7 to 12. The buyer gets an early exit. The operator gets enough runway to show the system working. Ask for that structure. Most good operators will say yes.",
    },

    { t: "h2", eyebrow: "Figure 5.3", text: "Whether it extends", id: "whether-it-extends" },
    {
      t: "p",
      html: `<strong>${f.pct(f.engagements.extendedShare)} of engagements extended past their initial term.</strong> But extension is not evenly distributed, and the pattern is worth knowing before you set your hours.`,
    },
    {
      t: "table",
      head: ["Hours per month", "Extended past initial term", "Engagements"],
      firstColHeader: true,
      rows: hoursRows.map((b) => [b.band, `${f.pct(b.share)}${hoursTag(b.share)}`, f.of(b.x, b.y)]),
      note: `n=${f.survey.detailed}. Bars scaled to the highest value in the column (${f.pct(hoursHigh)}).`,
    },
    {
      t: "p",
      html: "Engagements under 20 hours a month extend a third of the time. Everything from 20 hours a month up extends more than half the time. The light advisory engagement, a few hours a week of senior counsel, is the one most likely to end on schedule. It is also the one least likely to change anything, because nobody is in the business long enough to move it. If you want the engagement to work well enough that you keep it, 20 hours a month appears to be the floor.",
    },
    {
      t: "p",
      html: `By role, marketing engagements extended most often (${f.of(f.role("Marketing").extended.x, f.role("Marketing").extended.y)}), sales leadership a bit above half (${f.of(f.role("Sales Leadership").extended.x, f.role("Sales Leadership").extended.y)}). Revenue operations extended least of the core roles (${f.of(f.role("Revenue Operations").extended.x, f.role("Revenue Operations").extended.y)}), which makes sense: RevOps work is often a project with a finish line, a CRM migration or a forecast rebuild, and ending on time is the plan.`,
    },
    {
      t: "stats",
      items: [
        { v: f.of(f.role("Marketing").extended.x, f.role("Marketing").extended.y), l: "Marketing" },
        { v: f.of(f.role("Sales Leadership").extended.x, f.role("Sales Leadership").extended.y), l: "Sales leadership" },
        { v: f.of(f.role("Revenue Operations").extended.x, f.role("Revenue Operations").extended.y), l: "Revenue operations" },
      ],
      note: "Extended, by role.",
    },

    { t: "h2", eyebrow: "Figure 5.4", text: "How it ends", id: "how-it-ends" },
    {
      t: "table",
      head: ["Status of most recent engagement", "Share"],
      firstColHeader: true,
      rows: [
        ["Still running", f.pct(st.stillRunning)],
        ["Extended, then ended", statusPct(st.extendedThenEnded)],
        ["Ended at the planned date", statusPct(st.endedPlanned)],
        ["Ended early", statusPct(st.endedEarly)],
        ["Converted operator to a full-time hire", statusPct(st.converted)],
      ],
      note: `n=${st.n}. Stacked bar shows each share of the whole; table bars scaled to the highest value in the column (${f.pct(st.stillRunning)}).`,
    },
    { t: "h3", text: `${f.of(st.endedEarly, st.n)} ended early, and every operator told us why` },
    {
      t: "list",
      ordered: true,
      items: [
        "One client, a pre-revenue company, had expectations about market penetration and revenue that no leader could have met in the window.",
        "Another was a very young CEO who could not hold focus and took feedback badly.",
        "A third, also pre-revenue, paused when its product launch slipped and plans to bring the leader back closer to launch.",
        "The fourth, a $20 million to $50 million company, bought AI implementation help while its own executive team was not ready to adopt it.",
      ],
    },
    {
      t: "callout",
      tone: "gold",
      title: "Where it goes wrong",
      html: "None was a competence failure. All four were readiness failures, and three of the four were at the earliest stage of company. That is four data points, but it fits everything else in this guide: fractional works when there is a business to lead and a CEO who can be led.",
    },
    {
      t: "callout",
      tone: "night",
      title: `${st.converted} in ${st.n}`,
      html: `The one engagement in ${st.n} that converted to full-time is worth a word. It happens. The contracts price it in (a hire-away fee of $25,000 to $50,000, Chapter 3). But it is rare, and the operators are not angling for it. ${f.pct(f.survey.mainIncomeShare)} of them are doing this as a career.`,
    },

    { t: "h2", eyebrow: "Direct contracts", text: "What our contracts add", id: "what-our-contracts-add" },
    { t: "lede", html: "The survey tells you how engagements end. Our contracts tell you how they change along the way." },
    {
      t: "stats",
      items: [
        { v: f.of(f.contracts.expandedHours, f.contracts.directClients), l: "direct clients expanded hours" },
        { v: "None", l: "reduced" },
      ],
    },
    {
      t: "p",
      html: `${f.of(f.contracts.expandedHours, f.contracts.directClients)} direct clients expanded hours during the engagement. None reduced. In three cases the expansion happened inside the first 90 days.`,
    },
    {
      t: "stats",
      items: [
        { v: "20 to 35", l: "Hours / month" },
        { v: "30 to 40", l: "Hours / month" },
        { v: "30 to 50", l: "Hours / month" },
        { v: "4 to 5 days / week", l: "Interim role" },
      ],
    },
    {
      t: "callout",
      tone: "leaf",
      title: "Sizing an engagement",
      html: "The pattern is consistent enough to plan around: buyers start with the hours they are comfortable paying for, see results, and buy more. If you are sizing an engagement, size it for the job. If you cannot, size it for the trial and expect to grow.",
    },

    { t: "h2", eyebrow: "One more finding", text: "The reference gap", id: "the-reference-gap" },
    {
      t: "stats",
      items: [
        { v: f.pct(f.survey.reference.neverAsked), l: "say their current client never asked for a review or reference" },
        { v: f.pct(f.survey.reference.publicReview), l: "have a written public review anywhere" },
        { v: f.pct(f.survey.reference.privateOnly), l: "gave a private reference only" },
      ],
    },
    {
      t: "p",
      html: `One more finding that belongs here because it is about how engagements end: ${f.pct(f.survey.reference.neverAsked)} of operators said their current client never asked them for a review or reference. Only ${f.pct(f.survey.reference.publicReview)} have a written public review anywhere. ${f.pct(f.survey.reference.privateOnly)} gave a private reference only.`,
    },
    { t: "p", html: "For buyers, Chapter 8 covers why that is your edge. For the market, it is a problem." },
    { t: "p", html: "The best fractional leaders have the thinnest public record, because their clients are happy and quiet." },
    {
      t: "p",
      html: "The worst have none because nobody will vouch for them. From the outside, they look the same. <strong>The marketplaces that fix this, with verified engagement histories and client-side reviews, will be where this market consolidates.</strong>",
    },
  ],
};

export default chapter;
