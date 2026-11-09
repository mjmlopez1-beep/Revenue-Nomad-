import type { Chapter } from "./types";

const chapter: Chapter = {
  slug: "09-first-90-days",
  number: "09",
  title: "The first 90 days, and the nine ways buyers get it wrong",
  dek: "Sixty-three operators named the biggest buyer mistake. Nine patterns cover them all.",
  stats: [
    { v: "63 of 74", l: "operators gave a real answer on the biggest mistake" },
    { v: "9", l: "patterns cover every answer" },
    { v: "4 of 74", l: "engagements ended early" },
    { v: "57%", l: "extend after day 90" },
  ],
  blocks: [
    {
      t: "lede",
      html: "Sixty-three operators named the biggest buyer mistake. Nine patterns cover them all - every one the buyer's to fix.",
    },

    { t: "h2", eyebrow: "The nine mistakes", text: "Every one of them is the buyer's to fix", id: "every-one-of-them-is-the-buyers-to-fix" },
    {
      t: "p",
      html: "We asked 74 operators the biggest mistake companies make when hiring a fractional GTM leader. Sixty-three gave real answers. We coded every one. Nine patterns cover them all, and every one of them is the buyer's to fix.",
    },
    {
      t: "steps",
      items: [
        {
          n: "01",
          title: "Expecting full-time output for fractional hours",
          html: "The most common answer by a wide margin, roughly one in four. \"Assume it's a full-time hire.\" \"Expecting full-time output or commitment for fractional compensation.\" \"They still act like they're hiring them full time.\" \"Unrealistic expectations: attending events, business travel.\"<br><br><strong>The fix</strong><br>The fix is arithmetic. Forty hours a month is one day a week. Write down what one day a week can do. If the list is longer than that, buy more hours (Chapter 3 shows they get cheaper) or cut the list.",
          aside: "Most common answer",
        },
        {
          n: "02",
          title: "No defined problem, no metric",
          html: "Nearly as common. \"Hiring before defining the problem is huge.\" \"What does success look like? Without quantitative goals, impact is emotional.\" \"Hiring them to help with growth without giving them a specific business problem, decision rights, and a clock.\"<br><br><strong>The fix</strong><br>Before the first invoice, you should be able to finish this sentence: \"In 90 days, this engagement will have succeeded if ______.\" One number. If you can't, the first two weeks of the engagement should be spent getting to that sentence, and the contract should say so.<br><br>The inbound data shows how rare that is. Of 20 detailed inbound requests we received, about half stated something a leader could be measured against. The other half were one line: grow sales, train the managers, fix outbound. Those buyers were not wrong about their problem. They just had not done the work that turns a problem into a mandate, and the first month of any engagement they started was going to be spent doing it for them.",
        },
      ],
    },

    { t: "h2", text: "What a well-written request looks like", id: "what-a-well-written-request-looks-like" },
    {
      t: "stats",
      items: [
        { v: "5", l: "executive workstreams" },
        { v: "40 hrs", l: "a month" },
      ],
    },
    {
      t: "p",
      html: "One buyer in the inbound data had done the work. A financial services company with three business units posted a spec for a fractional VP of Marketing at 40 hours a month. It laid out five areas:",
    },
    {
      t: "list",
      ordered: true,
      items: [
        "Strategic GTM leadership across the three units",
        "A 12-month budget and paid-media plan with CAC and ROI targets",
        "A performance framework with pipeline attribution",
        "A future-state org design with a hiring roadmap",
        "A seat at the leadership table",
      ],
    },
    {
      t: "p",
      html: "That is a good spec. It names the outcomes. It names the deliverables. It even asks the fractional leader to decide which marketing roles should stay fractional and which should go full-time, which is exactly the right question to hand them.",
    },
    { t: "h3", text: "Where it overreaches" },
    {
      t: "p",
      html: "It is also five executive-level workstreams in ten hours a week. Any one of the first four is a quarter of work on its own. This is mistake number one and mistake number two in a single document: a clear mandate, attached to a time budget that cannot hold it.",
    },
    { t: "h3", text: "The fix" },
    {
      t: "p",
      html: "The fix is not to write a vaguer spec. It is to keep the spec and sequence it. Framework and budget in the first 90 days. Org design in the second. Or buy 80 hours instead of 40, which Chapter 3 shows costs less than double.",
    },

    { t: "h2", text: "The remaining seven mistakes", id: "the-remaining-seven-mistakes" },
    {
      t: "steps",
      items: [
        {
          n: "03",
          title: "No authority",
          html: "\"Not allowing the fractional leader to own and drive.\" \"Treating them like a TaskRabbit versus an experienced strategic leader.\" \"Owners not able to give empowerment to the fractional to move faster.\" \"Companies need to give fractional leaders the authority, access and support to make decisions.\"<br><br>A fractional leader without decision rights is a consultant with a worse rate. Decide, in writing, what they can do without asking you: hire, fire, change comp, change the CRM, kill a channel, spend to a budget. Our contracts specify who the leader reports to, and in nine of eleven direct engagements it is the CEO. Not a director. Not a committee.",
          aside: "9 of 11 direct engagements report to the CEO",
        },
        {
          n: "04",
          title: "Chasing logos over fit",
          html: "Covered in Chapter 8. It shows up again here because operators see the consequences after the hire. \"Hiring someone too junior and not experienced working with founders and CEOs.\" \"Identifying builders versus scalers and the stage they work best in.\"",
        },
        {
          n: "05",
          title: "Hiring in the wrong order",
          html: "One of the sharpest observations in the whole survey came from a fractional CMO who had interviewed 34 founders over the prior year: \"Eleven of the 25 who brought in outside GTM help had an agency, consultant or hire that didn't work out. The pattern: specialists started executing before anyone owned the strategy. Bring in the GTM leader first, set the one number that matters for the next 90 days, then hire specialists to hit it.\"<br><br>The mirror-image mistake: \"Hiring a fractional leader for strategy only, without an owner and budget for execution. Then the plan stays a slide deck.\" Or: \"They want to invest in fractional marketing leadership but don't set aside a marketing budget, which means nothing can get executed.\"",
          aside: "Leader first, then budget, then specialists.",
        },
        {
          n: "06",
          title: "Waiting too long",
          html: "\"Waiting too long to make the decision.\" \"Not deciding faster.\" \"The first time your forecast is off by more than 5%, or the MBR is disappointing, hire one.\"<br><br>Most companies bring in a fractional leader a year after they needed one. The data on speed to results (half under 30 days) says the cost of waiting is higher than the cost of starting.",
        },
        {
          n: "07",
          title: "Not sustaining it",
          html: "\"Appreciating the work, but not enforcing policies and process after I'm gone.\" \"They all want help, but will they actually put it into practice?\" \"Immediate results, but no structure, no performance management.\"<br><br><strong>The fix</strong><br>A fractional leader builds a system. The system only works if somebody runs it on the days they are not there. Name that person before the engagement starts.",
        },
        {
          n: "08",
          title: "No off-ramp",
          html: "\"No exit or off-ramp.\" \"Not clarifying expectations and any guarantees up front.\" Two of the 63 answers; both from operators who had seen engagements end badly because nobody had defined how they would end well.<br><br><strong>The fix</strong><br>The contracts handle this: opt-out at week 8 to 12, 30-day notice, hire-away fee if you want to keep them. Use those clauses. Talk about the end on day one.",
        },
        {
          n: "09",
          title: "Not giving it enough time",
          html: "The counterweight to number 6. \"Thinking it will be done overnight.\" \"Not giving enough time to execute.\" \"Building a sustainable pipeline and generating revenue takes time.\"<br><br>This sounds like it contradicts \"half show results in 30 days.\" It does not. A measurable result in 30 days is a cleaned CRM, a working outbound sequence, a forecast that is right. Revenue follows. Operators with first results at 30 to 60 days were extended 77% of the time in our data; those with results under 30 days, 50%. The sample is small and the pattern could be an artifact, but it is consistent with what the operators are saying: <strong>the fast win is not the point. The system is.</strong>",
        },
      ],
    },
    {
      t: "stats",
      items: [
        { v: "77%", l: "extended when first results came at 30 to 60 days" },
        { v: "50%", l: "extended when results came under 30 days" },
      ],
    },

    { t: "h2", eyebrow: "Four of 74", text: "What the early terminations have in common", id: "what-the-early-terminations-have-in-common" },
    { t: "lede", html: "All four readiness failures. None a competence failure." },
    {
      t: "p",
      html: "Of 74 engagements, four ended early, and every operator told us why. Two in their own words; the other two described.",
    },
    {
      t: "list",
      items: [
        "In their own words: \"Client had unrealistic expectations about market penetration and revenue attainment, typical of pre-revenue and unskilled founders.\"",
        "In their own words: \"CEO was 23 and couldn't stay on focus and was easily offended.\"",
        "Launch slipped: a pre-revenue client whose product launch slipped.",
        "AI adoption: a leadership team that bought AI help before it was ready to adopt it.",
      ],
    },
    { t: "h3", text: "Caveat" },
    {
      t: "p",
      html: "Three of the four pre-revenue or near it. All four readiness failures. None a competence failure. That is four data points, not a trend. But it rhymes with everything above.",
    },

    { t: "h2", eyebrow: "Figure 9.1", text: "The 90-day structure that answers all nine", id: "the-90-day-structure-that-answers-all-nine" },
    {
      t: "p",
      html: "This is the structure that shows up, in some form, in nearly every contract we reviewed. It is not ours. It is what the market has converged on.",
    },
    {
      t: "steps",
      items: [
        {
          n: "Before day 1",
          title: "Set up",
          html: "Write the sentence: \"In 90 days, this will have succeeded if ______.\" Agree who the leader reports to (the CEO). List what they can decide without asking. Name the internal owner who runs the system when they are not there. Confirm the opt-out date and the notice period.",
        },
        {
          n: "Days 1 - 30",
          title: "Diagnose",
          html: "Every good engagement starts here, and most contracts name it: a 30- to 45-day assessment of the funnel, the team, the process, the data, the comp plan. Output is a scored baseline and a prioritized roadmap, delivered in a readout to the CEO. The first measurable result usually lands here: a clean pipeline, a real forecast, a documented process. Half of our operators hit it inside this window.",
        },
        {
          n: "Days 31 - 60",
          title: "Build",
          html: "The roadmap becomes artifacts. ICP and personas rewritten. Sales stages redefined in the CRM. Outbound sequences live. Coaching cadence running. If a hire is needed, the job description is out. This is the window where the week-8 opt-out sits. By now you know.",
        },
        {
          n: "Days 61 - 90",
          title: "Run",
          html: "Weekly pipeline review, 1:1s, call reviews, forecast. The team is running the system with the leader coaching rather than doing. The 90-day readout sets the next quarter's number and decides whether to extend, expand, convert or end.",
        },
        {
          n: "After day 90",
          title: "Decide",
          html: "In our data, 57% extend. Four of eleven direct clients expanded hours. One in 74 converted to full-time. Whatever you choose, you should be choosing it with a working system in place, which is the one outcome the full-time search never gives you.",
          aside: "57% extend. 4 of 11 expand. 1 in 74 convert.",
        },
      ],
    },
    {
      t: "quote",
      text: "\"Treating them like a TaskRabbit versus an experienced strategic leader.\"",
      by: "Fractional GTM operator, Revenue Nomad survey",
    },

    { t: "h2", eyebrow: "Tool", text: "The pre-hire checklist", id: "the-pre-hire-checklist" },
    { t: "lede", html: "Nine yes-or-no questions." },
    { t: "p", html: "If more than two are \"no,\" you are not ready, and the engagement will prove it." },
    {
      t: "list",
      ordered: true,
      items: [
        "We can state in one sentence, with one number, what success looks like in 90 days.",
        "The fractional leader will report directly to the CEO.",
        "We have written down what they can decide without asking.",
        "We have budgeted for execution (tools, ads, hires), not just the leader's fee.",
        "We have named the internal person who owns the system on the days the leader is not here.",
        "We are hiring the leader before, not after, the agency or SDR vendor.",
        "We have matched on stage, deal size and motion before we looked at logos.",
        "We have called two references.",
        "We know the opt-out date and have talked about how this ends well.",
      ],
    },
  ],
};

export default chapter;
