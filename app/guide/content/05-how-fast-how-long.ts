import type { Chapter } from "./types";

const chapter: Chapter = {
  slug: "05-how-fast-how-long",
  number: "05",
  title: "How fast, how long, how it ends",
  dek: "The data on the three things CEOs worry about, with one real caveat",
  stats: [
    { v: "49%", l: "first measurable result inside 30 days" },
    { v: "57%", l: "extended past the initial term" },
    { v: "77%", l: "of most recent engagements still running" },
    { v: "4 of 74", l: "ended early, all readiness failures" },
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
      rows: [
        ["Under 30 days", "49% (highest)"],
        ["30 to 60 days", "30%"],
        ["60 to 90 days", "8%"],
        ["90+ days", "9%"],
        ["Not measured", "4%"],
      ],
      note: "n=74. Stacked bar shows each share of the whole; table bars scaled to the highest value in the column (49%).",
    },
    {
      t: "p",
      html: "Half of engagements produced something measurable inside a month. Nearly four in five inside two. The 9% that took more than 90 days were concentrated in enablement programs and marketing builds, both of which have longer natural cycles.",
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
      rows: [
        ["1 to 3 months", "36%"],
        ["3 to 6 months", "38% (most common)"],
        ["6 to 12 months", "16%"],
        ["12+ months", "9%"],
      ],
      note: "n=74. Bars scaled to the highest value in the column (38%).",
    },
    {
      t: "stats",
      items: [
        { v: "61%", l: "of platform operators set a three-month minimum" },
        { v: "A third", l: "will take one month" },
        { v: "36%", l: "initial terms of 1 to 3 months" },
        { v: "38%", l: "initial terms of 3 to 6 months" },
      ],
    },
    {
      t: "p",
      html: "Initial terms split almost evenly between three to six months (38%) and one to three months (36%). Buyers want a short trial. But on the Revenue Nomad platform, 61% of operators set a minimum engagement of three months, and only a third will take one month. Experienced operators have learned that nothing meaningful happens in 30 days except a diagnosis, and they do not want to be judged on it.",
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
      html: "<strong>57% of engagements extended past their initial term.</strong> But extension is not evenly distributed, and the pattern is worth knowing before you set your hours.",
    },
    {
      t: "table",
      head: ["Hours per month", "Extended past initial term", "Engagements"],
      firstColHeader: true,
      rows: [
        ["Under 20", "35% (lowest)", "7 of 20"],
        ["20", "69%", "11 of 16"],
        ["40", "58%", "11 of 19"],
        ["60", "88% (highest)", "7 of 8"],
        ["80+", "55%", "6 of 11"],
      ],
      note: "n=74. Bars scaled to the highest value in the column (88%).",
    },
    {
      t: "p",
      html: "Engagements under 20 hours a month extend a third of the time. Everything from 20 to 60 hours extends at least half the time, usually much more. The light advisory engagement, a few hours a week of senior counsel, is the one most likely to end on schedule. It is also the one least likely to change anything, because nobody is in the business long enough to move it. If you want the engagement to work well enough that you keep it, 20 hours a month appears to be the floor.",
    },
    {
      t: "p",
      html: "By role, marketing engagements extended most often (13 of 18), sales leadership a bit above half (18 of 31). Revenue operations extended least of the core roles (4 of 11), which makes sense: RevOps work is often a project with a finish line, a CRM migration or a forecast rebuild, and ending on time is the plan.",
    },
    {
      t: "stats",
      items: [
        { v: "13 of 18", l: "Marketing" },
        { v: "18 of 31", l: "Sales leadership" },
        { v: "4 of 11", l: "Revenue operations" },
      ],
      note: "Extended, by role.",
    },

    { t: "h2", eyebrow: "Figure 5.4", text: "How it ends", id: "how-it-ends" },
    {
      t: "table",
      head: ["Status of most recent engagement", "Share"],
      firstColHeader: true,
      rows: [
        ["Still running", "77%"],
        ["Extended, then ended", "9%"],
        ["Ended at the planned date", "7%"],
        ["Ended early", "5%"],
        ["Converted operator to a full-time hire", "1%"],
      ],
      note: "n=74. Stacked bar shows each share of the whole; table bars scaled to the highest value in the column (77%).",
    },
    { t: "h3", text: "Four of 74 ended early, and every operator told us why" },
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
      title: "1 in 74",
      html: "The one engagement in 74 that converted to full-time is worth a word. It happens. The contracts price it in (a hire-away fee of $25,000 to $50,000, Chapter 3). But it is rare, and the operators are not angling for it. 80% of them are doing this as a career.",
    },

    { t: "h2", eyebrow: "Direct contracts", text: "What our contracts add", id: "what-our-contracts-add" },
    { t: "lede", html: "The survey tells you how engagements end. Our contracts tell you how they change along the way." },
    {
      t: "stats",
      items: [
        { v: "4 of 11", l: "direct clients expanded hours" },
        { v: "None", l: "reduced" },
      ],
    },
    {
      t: "p",
      html: "Four of eleven direct clients expanded hours during the engagement. None reduced. In three cases the expansion happened inside the first 90 days.",
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
        { v: "46%", l: "say their current client never asked for a review or reference" },
        { v: "19%", l: "have a written public review anywhere" },
        { v: "23%", l: "gave a private reference only" },
      ],
    },
    {
      t: "p",
      html: "One more finding that belongs here because it is about how engagements end: 46% of operators said their current client never asked them for a review or reference. Only 19% have a written public review anywhere. 23% gave a private reference only.",
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
