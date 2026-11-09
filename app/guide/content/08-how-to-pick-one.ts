import type { Chapter } from "./types";

const chapter: Chapter = {
  slug: "08-how-to-pick-one",
  number: "08",
  title: "How to pick one: the logo trap and what to check instead",
  dek: "The resume is almost useless, and the resume is almost all you will be given",
  stats: [
    { v: "47%", l: "say clients wish they had checked stage and deal size" },
    { v: "4%", l: "say the same of big-name companies on the résumé", tone: "coral" },
    { v: "46%", l: "say their current client never asked for a reference" },
    { v: "19%", l: "have a written public review anywhere" },
  ],
  blocks: [
    {
      t: "lede",
      html: "Here is the uncomfortable truth about hiring a fractional GTM leader. The résumé is almost useless, and the résumé is almost all you will be given.",
    },

    { t: "h2", eyebrow: "Figure 8.1", text: "What clients wish they had checked", id: "what-clients-wish-they-had-checked" },
    {
      t: "p",
      html: "We asked 74 operators a pointed question: what do clients most wish they had checked before hiring someone like you? They could pick more than one answer.",
    },
    {
      t: "table",
      caption: "Figure 8.1. What clients wish they had checked",
      head: ["What clients wish they had checked", "Share of operators"],
      rows: [
        ["They had done it at the same company stage and deal size", "47%"],
        ["How they communicate when they are part-time", "39%"],
        ["References from past clients", "31%"],
        ["Experience in the same industry", "31%"],
        ["Big-name companies on the résumé (lowest)", "4%"],
      ],
      firstColHeader: true,
      note: "Operator survey, n=74, multi-select. Bars scaled to the highest value (47%).",
    },
    {
      t: "p",
      html: "Read the bottom row again. The thing most CEOs look at first, where the person worked, is the thing operators themselves say matters least. <strong>4%.</strong>",
    },
    { t: "p", html: "The written answers are blunter." },
    {
      t: "quote",
      text: "\"Hiring the person with the big company logo despite being a much smaller version of that business with completely different challenges.\"",
    },
    { t: "quote", text: "\"Looking for Big 4 consulting experience. Delivery and outcomes matter more than pedigree.\"" },
    {
      t: "quote",
      text: "\"Getting caught up on the logos they've worked at instead of the circumstances in which they did so, and how much of the overall GTM they architected versus overseeing an already established company's scale.\"",
    },
    { t: "p", html: "That last one names the distinction this entire chapter turns on." },

    { t: "h2", text: "Builders and scalers", id: "builders-and-scalers" },
    { t: "lede", html: "Both are good at their jobs. They are not the same job." },
    { t: "p", html: "There are two kinds of people with \"VP of Sales\" on their LinkedIn." },
    {
      t: "steps",
      items: [
        {
          n: "1",
          title: "The builder",
          html: "One joined a company at $4 million, figured out who to sell to and how, hired the first six reps, built the process from nothing, and got it to $20 million.",
          aside: "$4M to $20M",
        },
        {
          n: "2",
          title: "The scaler",
          html: "The other joined at $60 million, inherited a working machine, and ran it well to $150 million.",
          aside: "$60M to $150M",
        },
      ],
    },
    {
      t: "p",
      html: "Both are good at their jobs. They are not the same job. If you are an $8 million company, the second person has never done what you need done. They have managed a thing. They have not built a thing. And the logos on their résumé are bigger, which is exactly why you will be tempted.",
    },
    { t: "h3", text: "The question to ask" },
    {
      t: "p",
      html: "It is not \"where have you worked.\" It is \"walk me through the last time you took a company from roughly where I am to roughly where I want to be. What did you find when you arrived, what did you change, and what broke.\"",
    },

    { t: "h2", text: "Stage and deal size", id: "stage-and-deal-size" },
    { t: "lede", html: "Industry knowledge can be learned in 60 days." },
    {
      t: "stats",
      items: [
        { v: "47%", l: "stage and deal size" },
        { v: "31%", l: "industry experience" },
      ],
    },
    {
      t: "p",
      html: "31% of operators said clients wish they had checked industry experience. 47% said stage and deal size. The operators who wrote about it were sharper:",
    },
    { t: "quote", text: "\"They only look for people in their industry.\"" },
    { t: "quote", text: "\"Too much focus on exact-fit industry and existing buyer relationships instead of skill set.\"" },
    {
      t: "p",
      html: "Industry knowledge can be learned in 60 days. Knowing how to build a sales motion for a $30,000 deal with a 90-day cycle, when you have only ever sold $300,000 deals with a 9-month cycle, cannot.",
    },
    { t: "h3", text: "Deal size and sales cycle" },
    {
      t: "p",
      html: "Deal size and sales cycle determine everything: how many reps you need, how much pipeline, what the CRM should look like, how you forecast.",
    },
    { t: "h3", text: "Recommendation" },
    { t: "p", html: "Match on that first. Match on industry only if your industry has a genuinely unusual buying process." },

    { t: "h2", text: "The part-time question nobody asks", id: "the-part-time-question-nobody-asks" },
    { t: "lede", html: "You need to know, before you sign, what Tuesday looks like." },
    {
      t: "stats",
      items: [
        { v: "39%", l: "flagged part-time communication" },
        { v: "22%", l: "run four or more clients" },
        { v: "20%", l: "run three" },
      ],
    },
    {
      t: "p",
      html: "39% flagged \"how they communicate when they are part-time.\" This is the question specific to fractional, and it is the one buyers skip because it feels awkward.",
    },
    {
      t: "p",
      html: "Ask it anyway. Here is why: 22% of the operators in our survey are running four or more clients at once. Another 20% are running three. That is not a red flag by itself. It is how the model works. But it means you need to know, before you sign, what Tuesday looks like. When are they in your Slack. How fast do they respond on a day they are not scheduled for you. What happens when two clients have a fire at the same time.",
    },
    { t: "h3", text: "Questions that get real answers" },
    {
      t: "list",
      ordered: true,
      items: [
        "How many clients are you working with right now, and how many hours is each.",
        "What is your response time on a day you are not scheduled for us.",
        "What does your weekly update to the CEO look like. Can I see one, redacted.",
        "Tell me about a time two clients needed you on the same day.",
      ],
    },
    { t: "h3", text: "What to listen for" },
    {
      t: "p",
      html: "A good operator has crisp answers because they have been asked before and have a system. A weak one gets vague.",
    },

    { t: "h2", text: "Check the references. Almost nobody does.", id: "check-the-references-almost-nobody-does" },
    {
      t: "stats",
      items: [
        { v: "31%", l: "say clients wish they had checked references" },
        { v: "46%", l: "current client never asked for one" },
        { v: "19%", l: "have a written public review" },
      ],
    },
    {
      t: "p",
      html: "31% of operators said clients wish they had checked references. Here is the number that goes with it: 46% of operators said their current client never asked for one. Only 19% have a written public review anywhere.",
    },
    {
      t: "p",
      html: "This is a market where the buyer who makes two phone calls has an edge over nearly half of all other buyers.",
    },
    { t: "p", html: "Make the calls. Ask the prior client three things:" },
    {
      t: "list",
      items: [
        "What did they find when they arrived?",
        "What did they actually change?",
        "Would you hire them again at the same rate?",
      ],
    },

    { t: "h2", text: "Advisor or operator", id: "advisor-or-operator" },
    { t: "lede", html: "Know which one you are buying." },
    {
      t: "quote",
      text: "\"Hiring advisors and not practitioners. In order for fractional to work for you, you need a strategist who can also get in the weeds.\"",
    },
    {
      t: "quote",
      text: "\"Hiring a fractional leader for strategy only, without a clear mandate, an owner and a budget for execution. Then the plan stays a slide deck.\"",
    },
    {
      t: "p",
      html: "Some fractional leaders advise. Some operate. The second kind will run your pipeline meeting, get in the CRM, listen to calls, and rewrite the sequence themselves on a Thursday night. The first kind will tell you what you should do and check in next week. Both have a place. Know which one you are buying, and know that at $5 million to $20 million you almost always need the second.",
    },
    { t: "h3", text: "A quick test" },
    {
      t: "p",
      html: "Ask what they did personally, with their own hands, in the first 30 days of the last engagement. Operators list artifacts. Advisors list meetings.",
    },

    { t: "h2", eyebrow: "Figure 8.2", text: "The scorecard", id: "the-scorecard" },
    { t: "p", html: "Score every candidate 1 to 5 on each line. Weight the first two double." },
    {
      t: "table",
      caption: "Figure 8.2. The scorecard",
      head: ["Criterion", "What good looks like", "Weight"],
      rows: [
        ["Stage and deal-size match", "Has taken a company from roughly your revenue to roughly your target, at a similar deal size and cycle", "2x"],
        ["Builder vs. scaler", "Built the motion, hired the first reps, wrote the process; did not inherit it", "2x"],
        ["Operator vs. advisor", "Lists artifacts, not meetings, for their first 30 days", "1x"],
        ["Part-time communication", "Clear answers on client load, response time, weekly update format", "1x"],
        ["References", "Two prior clients reached, both would rehire at the same rate", "1x"],
        ["Motion match", "Has run your motion (enterprise, inside, channel, PLG), not just your industry", "1x"],
        ["Industry", "Relevant, or demonstrates they can learn it in 60 days", "0.5x"],
        ["Logos", "Interesting. Not decisive.", "0.5x"],
      ],
      firstColHeader: true,
      note: "Score 1 to 5 per line, then multiply by the weight. Highlighted rows carry double weight.",
    },
    { t: "p", html: "If the top two lines score under 4, stop. Nothing below them will save the engagement." },
  ],
};

export default chapter;
