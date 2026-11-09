import type { Chapter } from "./types";

const chapter: Chapter = {
  slug: "03-what-it-costs",
  number: "03",
  title: "What fractional GTM actually costs",
  dek: "The $225 center, the seat ladder, and what the signed contracts say",
  stats: [
    { v: "$225", l: "median hourly rate, all roles", tone: "forest" },
    { v: "$165 - $300", l: "middle half of the market" },
    { v: "$400 - $875", l: "senior operator tier" },
    { v: "137", l: "hourly rates in the Rate Index" },
  ],
  blocks: [
    {
      t: "lede",
      html: "Every CEO asks the same first question, usually within the first five minutes: what does this cost?",
    },
    {
      t: "p",
      html:
        "The answer most fractional leaders give is a rate. The answer you need is a monthly number, and an understanding of what moves it. Three things do: the seat you are filling, the hours you are buying, and the size of the company doing the buying. This chapter takes them in order.",
    },
    {
      t: "list",
      ordered: true,
      items: ["The seat you are filling", "The hours you are buying", "The size of the company buying"],
    },

    { t: "h2", eyebrow: "The center", text: "The market centers on $225 an hour", id: "the-market-centers-on-225-an-hour" },
    {
      t: "p",
      html:
        "The Revenue Nomad Rate Index holds 137 hourly rates, as companies pay them - from our contracts, the operator survey, operator conversations, platform listings and public rates. The median is $225 an hour. The middle half of the market runs from $165 to $300. Above that sits a real tier of senior operators at $400 to $875 an hour, mostly CRO-level sales leadership and AI GTM work for companies above $20 million. It is a smaller group, but it is not an anomaly. It is where the people who have done this several times at scale price themselves, and buyers pay it.",
    },
    {
      t: "table",
      caption: "Figure 3.1. Median hourly rate by role",
      head: ["Role", "Median rate", "n"],
      rows: [
        ["Sales Leadership", "$230", "54"],
        ["Revenue Operations", "$238", "21"],
        ["Marketing", "$230", "30"],
        ["Customer Success & Growth", "$220", "9"],
        ["Sales Enablement", "$300 (highest)", "7"],
        ["AI GTM", "$212", "6"],
        ["Partnerships", "$165 (lowest)", "5"],
        ["<strong>All roles</strong>", "<strong>$225</strong>", "<strong>137</strong>"],
      ],
      firstColHeader: true,
      note: "Revenue Nomad Rate Index, 137 hourly rates as companies pay them. Bars scaled to the highest median rate ($300).",
    },
    {
      t: "callout",
      tone: "leaf",
      title: "Two things stand out",
      html:
        "RevOps and Enablement price above sales leadership, which surprises people until they realize how few people can build a forecast that holds or a playbook a rep will actually open.",
    },
    {
      t: "callout",
      tone: "leaf",
      title: "AI GTM rates",
      html:
        "And AI GTM, the role everyone is talking about, prices lowest. The category is young, the operators are younger, and buyers do not yet know what to pay for it. That will not last.",
    },

    { t: "h2", text: "The seat sets the rate", id: "the-seat-sets-the-rate" },
    { t: "lede", html: "The single biggest driver of price is what you are actually hiring." },
    {
      t: "p",
      html:
        "A fractional Sales Director who runs your weekly pipeline meeting and coaches two reps is a different job from a fractional CRO who owns the number, the team, the forecast and the board slide. The market prices them differently, and so do we.",
    },
    {
      t: "stats",
      items: [
        { v: "~$200/hr", l: "Director", s: "20 hrs / month" },
        { v: "~$250/hr", l: "VP", s: "30 - 40 hrs / month" },
        { v: "$260 - $465/hr", l: "CRO", s: "30 - 50 hrs / month", tone: "forest" },
      ],
    },
    {
      t: "p",
      html:
        "The ladder is consistent: director-level work prices around $200, VP-level around $250, and CRO-level from $260 up to $465 depending on scope and company size. The $465 engagement is a CRO owning a 12-month roadmap for a company above $50 million, with an operator who has done it before. That is what the top of the market looks like, and it is worth it to the company paying for it.",
    },
    {
      t: "table",
      caption: "Figure 3.2. Direct client contracts as an hourly rate",
      head: ["Seat", "Implied hourly rate", "Typical hours per month"],
      rows: [
        ["Fractional Sales Director", "$195 - $200", "20"],
        ["Fractional VP of Sales", "$250", "30 - 40"],
        ["Fractional CRO", "$260 - $465", "30 - 50"],
        ["Fractional Head of Sales (first GTM hire)", "$300", "40"],
        ["Lead Revenue Architect (transformation program)", "$320", "85"],
        ["Interim Head of Sales", "$205 - $240", "130 - 175"],
      ],
      firstColHeader: true,
      note: "Revenue Nomad direct contracts, 2024 - 2026. Implied rate is monthly fee divided by contracted hours.",
    },

    { t: "h2", text: "Hours move the rate too", id: "hours-move-the-rate-too" },
    { t: "lede", html: "The hourly rate eases a little as hours rise. The monthly number climbs steadily." },
    {
      t: "p",
      html:
        "We combined every leadership rate with recorded hours in the Revenue Nomad Rate Index - our signed contracts, the operator survey, operator rate conversations, platform listings and public rates - priced as companies pay them. The hourly rate eases a little as hours rise. The monthly number climbs steadily.",
    },
    {
      t: "table",
      caption: "Figure 3.3. Rate and monthly spend by hours per month",
      head: ["Hours per month", "Median rate", "Middle half", "Typical month", "n"],
      rows: [
        ["Under 20", "$250 (highest)", "$165 - $325", "$3,750", "9"],
        ["20 - 39", "$200", "$170 - $238", "$4,500", "15"],
        ["40 - 59", "$212", "$163 - $300", "$9,100", "16"],
        ["60+", "$190 (lowest)", "$150 - $242", "$16,500 (highest)", "28"],
      ],
      firstColHeader: true,
      note: "Revenue Nomad Rate Index, 68 leadership rates with recorded hours, as companies pay them. Typical month is the median of rate times hours. Bars scaled to the highest value in each column ($250 rate, $16,500 month).",
    },
    {
      t: "p",
      html:
        "This matters for how you budget. Committing more of someone's week lowers the hourly rate a little, but senior scope does not discount much - in our own contracts, engagements of 60 hours a month or more bill $175 to $318 an hour, a median of about $240. Buy the hours the job needs, not the hours that feel safe.",
    },

    { t: "h2", text: "What companies like yours pay", id: "what-companies-like-yours-pay" },
    {
      t: "stats",
      items: [{ v: "$5M", l: "revenue at which median monthly spend steps from $5,000 to $10,000", tone: "forest" }],
    },
    {
      t: "table",
      caption: "Figure 3.4. Median monthly spend by client revenue",
      head: ["Client annual revenue", "Median monthly spend", "n"],
      rows: [
        ["$1M - $5M", "$5,000", "23"],
        ["$5M - $20M", "$10,000", "23"],
        ["$20M - $50M", "$10,000", "12"],
        ["$50M+", "$11,200", "5"],
      ],
      firstColHeader: true,
      note: "Operator survey, n=63 engagements with a stated rate and client revenue, implied from hours x effective rate. Bars scaled to the highest median ($11,200).",
    },
    {
      t: "p",
      html:
        "The step from $5,000 to $10,000 happens at the $5 million mark and then the number flattens. A $40 million company is not paying four times what a $10 million company pays. It is paying about the same, because the job is roughly the same size: one experienced person, two or three days a week, running or rebuilding a revenue function. Above $50 million the engagements get bigger, but they also start looking less like fractional and more like interim, which is a different product with a different price.",
    },
    {
      t: "callout",
      tone: "leaf",
      title: "One more check on these numbers",
      html:
        "The survey asks what operators charge. The platform asks what they list. The contracts show what clients signed. Three different questions, three different populations, and they agree on the shape of the market:",
    },
    {
      t: "stats",
      items: [
        { v: "~$225/hr", l: "Center" },
        { v: "~$150/hr", l: "Floor", s: "junior or high-hour work" },
        { v: "~$500/hr", l: "Ceiling", s: "senior CRO-level work" },
        { v: "$5k - $13k/mo", l: "Most seats", s: "part-time leadership" },
      ],
    },
    { t: "p", html: "<strong>When three independent sources agree, you can budget off them.</strong>" },

    { t: "h2", eyebrow: "Signed terms", text: "What the contracts say", id: "what-the-contracts-say" },
    {
      t: "stats",
      items: [
        { v: "11", l: "direct-client engagements", tone: "forest" },
        { v: "27", l: "more via a partner channel" },
      ],
    },
    {
      t: "p",
      html:
        "Survey data tells you what people report. Contracts tell you what people signed. Below are the terms from our eleven direct-client engagements, plus the structural patterns from 27 more we delivered through a partner channel.",
    },
    {
      t: "table",
      caption: "Figure 3.5. Direct contract terms by seat",
      head: ["Seat", "Hours per month", "Monthly", "Initial term"],
      rows: [
        ["Sales Director", "20 - 35", "$4k - $5k", "4 months, then month to month"],
        ["VP of Sales", "30 - 40", "$7.5k - $10k", "3 months"],
        ["CRO and revenue transformation", "30 - 85", "$8.5k - $27k", "3 to 6 months"],
        ["Head of Sales or GTM lead", "~40", "$10k - $12k", "3 months"],
        ["Interim head of sales", "130 - 175", "$31k - $36k", "3 to 5 months"],
      ],
      firstColHeader: true,
      note: "Revenue Nomad direct contracts, 2024 - 2026, rolled up by seat - what companies pay.",
    },
    { t: "h3", text: "The commercial terms are nearly standardized at this point" },
    {
      t: "steps",
      items: [
        {
          n: "01",
          title: "Initial term of three to six months, then month to month.",
          html:
            "Nine of eleven. The exceptions are a prepaid hour block and an engagement that opened with a fixed-fee 45-day assessment before the retained CRO phase began. That assessment-first structure is becoming more common at the upper end, and it is a good sign when a firm proposes it: they want to diagnose before they prescribe.",
        },
        { n: "02", title: "Thirty days' written notice", html: "From either side, in every contract." },
        {
          n: "03",
          title: "An opt-out checkpoint inside the initial term",
          html: "At week 7, 8 or 12 depending on the deal. You are not locked in if the fit is wrong.",
        },
        {
          n: "04",
          title: "Overage billed hourly at or near the rate card",
          html: "Usually with a cap on how much can be billed without your approval (15% in the most recent one).",
        },
        { n: "05", title: "A hire-away fee", html: "$25,000 to $50,000, if you convert the leader to a full-time employee." },
      ],
    },
    {
      t: "callout",
      tone: "leaf",
      title: "Two terms appear once each and are worth asking for",
      html:
        "<strong>A success bonus:</strong> one CRO contract pays up to $10,000 a month above the retainer if revenue beats the goal set by day 90.<br><br><strong>A no-cost replacement clause:</strong> if the fit is wrong, the firm swaps the person without a new fee.",
    },

    { t: "h2", eyebrow: "Reading the contract", text: "The thing CEOs misread", id: "the-thing-ceos-misread" },
    {
      t: "stats",
      items: [
        { v: "1 in 74", l: "converted to full-time", tone: "forest" },
        { v: "4 of 11", l: "expanded hours" },
      ],
    },
    {
      t: "callout",
      tone: "gold",
      title: "The hire-away fee gets read as a trap",
      html:
        "It is the opposite. It means the firm has already priced in the possibility that this person becomes your VP of Sales, and told you the number up front. In our survey, one engagement in 74 converted to full-time. It happens. It is not the point.",
    },
    {
      t: "p",
      html:
        "The more important pattern in the contracts is that engagements grow. Four of our eleven direct clients expanded hours within months: 20 to 35, 30 to 40, 30 to 50, 130 to 173. None cut back. Buyers who start at 20 hours are usually testing the person, not sizing the job. Budget for the job.",
    },
    {
      t: "stats",
      items: [
        { v: "20 to 35", l: "hrs / month" },
        { v: "30 to 40", l: "hrs / month" },
        { v: "30 to 50", l: "hrs / month" },
        { v: "130 to 173", l: "hrs / month" },
      ],
    },

    { t: "h2", text: "What bigger companies buy instead", id: "what-bigger-companies-buy-instead" },
    { t: "lede", html: "The leader stays. The specialist comes in to fix one thing and leave." },
    {
      t: "p",
      html:
        "The 27 project engagements in our contract data, mostly with larger software companies, look different. Almost none of them are a retained leader. They are projects:",
    },
    {
      t: "list",
      items: [
        "30- to 45-day GTM diagnostic at a fixed fee",
        "12-week outbound motion build",
        "Sales playbook",
        "Manager enablement program",
        "AI pilot",
      ],
    },
    {
      t: "p",
      html: "Terms of one to three months. A readout at the end. Month-to-month renewal only if both sides confirm in writing.",
    },
    {
      t: "callout",
      tone: "night",
      html:
        "That is the other half of the fractional market, and it is what fractional looks like once a company has a VP of Sales already. The leader stays. The specialist comes in to fix one thing and leave. <strong>If you are above $50 million and already have a revenue leader, you are probably shopping for a project, not a person, and you should price it that way.</strong>",
    },

    { t: "h2", text: "The number to budget", id: "the-number-to-budget" },
    {
      t: "stats",
      items: [
        { v: "$4,000 - $5,000 / mo", l: "Sales Director for a small team" },
        { v: "$10,000 / mo", l: "VP-level at a $5M - $20M company", tone: "forest" },
        { v: "$13,000 - $25,000 / mo", l: "CRO or company above $20M" },
      ],
    },
    {
      t: "p",
      html: "If you need a Sales Director to run the cadence for a small team, $4,000 to $5,000 is the range.",
    },
    {
      t: "p",
      html:
        "If you are a $5 million to $20 million company bringing in a fractional VP-level sales or marketing leader for two days a week, budget $10,000 a month and a six-month initial commitment. That is $60,000 to find out whether this works, with an exit at week 8 to 12 if it is not.",
    },
    {
      t: "p",
      html:
        "If what you need is a CRO who owns the number and the team, or your company is above $20 million, plan on $13,000 to $25,000 a month.",
    },
    {
      t: "p",
      html:
        "Fractional is not always cheaper. We will get to the cases where the full-time hire wins in Chapter 4. But it is always faster to find out.",
    },
  ],
};

export default chapter;
