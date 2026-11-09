import type { Chapter } from "./types";
import * as f from "./figures";

const chapter: Chapter = {
  slug: "07-when-it-fits",
  number: "07",
  title: "Sixteen situations where fractional GTM makes sense, and three where it does not",
  dek: "Nobody wakes up needing a title. They wake up with a situation.",
  stats: [
    { v: "16", l: "situations we see most" },
    { v: String(f.survey.detailed), l: "operator descriptions of why they were hired" },
    { v: String(f.contracts.directClients), l: "direct contracts" },
    { v: "20", l: "buyer requests" },
  ],
  blocks: [
    {
      t: "lede",
      html: `Most buyers' guides organize by title. Nobody wakes up needing a title. They wake up with a situation. These are the sixteen we see most, drawn from ${f.survey.detailed} operator descriptions of why they were hired, ${f.contracts.directClients} direct contracts, and 20 buyer requests. The first twelve are mostly about sales. The last four are where the rest of the GTM network, marketing, revenue operations and enablement, gets hired, and they are growing faster. For each: what it looks like, what the fractional leader actually does, and what to watch.`,
    },

    { t: "h2", text: "The first twelve are mostly about sales", id: "sales-situations" },
    {
      t: "steps",
      items: [
        {
          n: "01",
          title: "The founder is stepping out of the closing seat",
          aside: "Most common trigger",
          html: `The most common trigger in the data by a wide margin. Three of our ${f.contracts.directClients} direct contracts say it almost word for word in the scope: the founder is moving to a different seat, and someone has to run revenue.<br><br><strong>What it looks like:</strong> The founder has closed every meaningful deal for years. There are two to six reps who were hired to \"help,\" and they close what the founder hands them. Pipeline is the founder's calendar.<br><br><strong>What the leader does:</strong> Documents the founder's winning motion before it walks out the door. Builds the process, the stages, the cadence. Coaches the reps to run it. In one of our contracts, Phase 1 is literally \"convert the founder's winning motion into a documented process and train the team on it.\"<br><br><strong>Watch:</strong> The founder has to actually step out. Several operators named "owners not able to give empowerment" as the way this one fails.`,
        },
        {
          n: "02",
          title: "You lost your sales leader",
          html: "<strong>What it looks like:</strong> The VP left, was let go, or the relationship ended badly. The team is reporting to the CEO again. The search will take four months.<br><br><strong>What the leader does:</strong> Stabilizes the team on Monday. Runs the forecast, the pipeline reviews, the 1:1s. Then, critically, figures out whether the problem was the person or the role, and writes the job description for the permanent hire if you still need one. Our two largest engagements by hours were this shape.<br><br><strong>Watch:</strong> This shades into interim at 100-plus hours a month, and the price goes with it. Decide early whether you are buying a bridge or a rebuild.",
        },
        {
          n: "03",
          title: "A technical founder needs a first GTM leader",
          html: "<strong>What it looks like:</strong> \"Engineer CEO, no GTM experience,\" as one operator put it. Great product, a few customers from the network, no idea how to build a repeatable way to get more.<br><br><strong>What the leader does:</strong> Everything, in sequence. Our Head of Sales contract for this situation ran:<br><strong>Month 1</strong> GTM assessment and 18-month roadmap.<br><strong>Month 2</strong> ICP, personas, playbook, CRM stages, proposal deck.<br><strong>Month 3</strong> Revenue forecast, hiring plan, recruiting partner.<br>Forty hours a month.<br><br><strong>Watch:</strong> Product-market fit has to exist. See <a href=\"#three-situations-where-fractional-is-the-wrong-answer\">anti-pattern 1</a>.",
        },
        {
          n: "04",
          title: "You have a sales team but no sales system",
          html: "<strong>What it looks like:</strong> \"They had a sales team but no structured sales engine.\" Reps, a CRM nobody trusts, no defined stages, no consistent prospecting, results that depend on who is having a good month.<br><br><strong>What the leader does:</strong> Builds the engine around the team that exists. One contract: a Fractional VP of Sales placed above an existing Director of Sales, with a mandate to take the company from 2 - 4 new clients a month to 10, through a revenue diagnostic, process and offer redesign, an outbound rebuild with a 60-day test, and a coaching cadence.<br><br><strong>Watch:</strong> The existing manager. Decide whether they report to the fractional leader, and tell them.",
        },
        {
          n: "05",
          title: "Pipeline depends on the founder's network",
          aside: "Most common inbound ask",
          html: "<strong>What it looks like:</strong> Revenue is fine; it just all comes from people the founder knows. There is no outbound. Inbound is referrals.<br><br><strong>What the leader does:</strong> Builds the first repeatable outbound motion: ICP, messaging, sequences, the first SDR or an outsourced engine with a 90-day pilot. This was the second most common trigger in the survey, and the most common ask in the inbound data.<br><br><strong>Watch:</strong> Outbound takes 60 to 90 days to show pipeline and longer to show revenue. Set the metric accordingly.",
        },
        {
          n: "06",
          title: "Moving upmarket, or from order-taking to real selling",
          aside: "Hardest situation in the list",
          html: "<strong>What it looks like:</strong> \"Transform from order-taking to enterprise sales.\" The company has grown on inbound and small deals and wants bigger ones, which means longer cycles, more stakeholders and a different kind of rep.<br><br><strong>What the leader does:</strong> Redesigns the motion for the new deal size. Often re-hires or re-levels the team.<br><br><strong>Watch:</strong> This is the hardest situation in the list, and the one where stage-and-deal-size match matters most. Someone who has only sold $300,000 deals cannot teach a team to sell them if they have never built that motion from a $30,000 base.",
        },
        {
          n: "07",
          title: "Building or resetting a channel program",
          html: `<strong>What it looks like:</strong> "Needed to hit the reset button on their channel program." Partners who signed and never sold. Or no partners at all in a market that runs on them.<br><br><strong>What the leader does:</strong> Partner strategy, program design, enablement, the operating cadence with the partners. Three of ${f.survey.detailed} survey engagements were exactly this.<br><br><strong>Watch:</strong> Channel takes longer than direct. Plan for six months before judging.`,
        },
        {
          n: "08",
          title: "New market or new product",
          html: "<strong>What it looks like:</strong> US entry for a non-US company. A new product line that sells differently from the core. A launch.<br><br><strong>What the leader does:</strong> Validation first. One operator described the best version: \"a bounded validation project before a full engagement.\" Then the GTM plan, then execution.<br><br><strong>Watch:</strong> Do not hire the full engagement before the validation. Buy the 30-day project, then decide.",
        },
        {
          n: "09",
          title: "You cannot trust your forecast",
          aside: "RevOps engagement",
          html: "<strong>What it looks like:</strong> \"Inability to forecast revenue and cash flow.\" The board asks a question and the answer changes every week. One operator's rule: \"The first time your forecast is off by more than 5%, hire one.\"<br><br><strong>What the leader does:</strong> This is a RevOps engagement. Stages, definitions, hygiene, inspection cadence, the reporting layer. Often a CRM migration.<br><br><strong>Watch:</strong> It is usually a project, not a retained role. Scope it with an end.",
        },
        {
          n: "10",
          title: "Preparing for a raise, a sale or diligence",
          html: "<strong>What it looks like:</strong> A transaction in 6 to 18 months and a revenue function that would not survive a diligence team's questions.<br><br><strong>What the leader does:</strong> Makes the revenue story defensible. Clean pipeline data, documented process, a forecast with a track record, a team that can run without the founder. One survey engagement was an \"AI revenue analytics project to assist company in structuring for sale.\"<br><br><strong>Watch:</strong> Start earlier than feels necessary. Twelve months of clean data is worth far more than three.",
        },
        {
          n: "11",
          title: "Putting AI into the revenue organization",
          aside: "6 of 20 inbound buyers",
          html: "<strong>What it looks like:</strong> Six of 20 inbound buyers asked for this directly. The CEO knows AI should be doing something in sales and does not know what, or has tools nobody uses.<br><br><strong>What the leader does:</strong> Maps the revenue process to the task level, identifies what to automate, ships it into the actual workflow, trains the team. The AI deployment contracts in this category were 1.5- to 3-month projects to deploy specific assistants into a sales team's CRM and get them adopted.<br><br><strong>Watch:</strong> Demos are easy. Adoption is the whole job. Measure usage, not deployment.",
        },
        {
          n: "12",
          title: "Enabling a team you already have",
          html: "<strong>What it looks like:</strong> A good leader, a team about to grow, and no onboarding, playbook or coaching system to grow it with. One inbound buyer: formalize process, playbooks, training and onboarding to add ten reps in six months without hurting current targets.<br><br><strong>What the leader does:</strong> Builds the enablement layer. Longest engagements in the data, often 12 months, because the work is a program.<br><br><strong>Watch:</strong> Measure adoption and ramp time, not content produced.",
        },
      ],
    },

    { t: "h2", eyebrow: "Growing faster", text: "Where the rest of the GTM network gets hired", id: "gtm-situations" },
    { t: "p", html: "Marketing, revenue operations and enablement." },
    {
      t: "steps",
      items: [
        {
          n: "13",
          title: "A new CEO was just put in to fix the company",
          aside: "RevOps",
          html: `<strong>What it looks like:</strong> A board or a private equity sponsor replaced the CEO. The new one has 90 days to tell the board what is real. The revenue number the last team reported does not reconcile with the CRM, the forecast has been missed three quarters running, and nobody can explain why. A friend who has been through it says: get a fractional head of revenue operations in before you touch anything else.<br><br><strong>What the leader does:</strong> Diagnoses before anyone reorganizes. Rebuilds the pipeline definitions, audits the data, produces the first forecast the board can trust, and tells the CEO which of the inherited sales leaders are the problem and which are victims of the system. In our data this is where revenue operations engagements at $50 million-plus companies cluster, and why RevOps prices level with sales leadership at ${f.category("Revenue Operations").median} an hour.<br><br><strong>Watch:</strong> Decision rights. The new CEO has to let the fractional leader see everything and say anything, including about people the board likes. Scope it as a 60- to 90-day diagnostic with a written readout, then decide what the permanent structure should be.`,
        },
        {
          n: "14",
          title: "The company grew by acquisition and lost its story",
          aside: "Brand and marketing",
          html: "<strong>What it looks like:</strong> A $200 million company that bought six businesses in three years. Five product names, four websites, three sales decks that contradict each other, and a team that cannot say in one sentence what the company does. The market is confused, the reps are improvising, and the next acquisition will make it worse. Nobody inside has ever done a brand rebuild, and a full-time CMO at this size is a $400,000 bet on a job that might be 12 months long.<br><br><strong>What the leader does:</strong> A fractional brand and marketing leader, usually a CMO-level operator with repositioning experience, rebuilds the identity from the outside in: one story for the market, one for the team, one architecture for the products, and a rollout plan the sales organization will actually adopt. Operators in our survey described this trigger as \"a rebrand for a business model shift,\" and marketing engagements have the highest extension rate of any role because the rollout outlasts the strategy.<br><br><strong>Watch:</strong> This is a leadership engagement, not an agency brief. The agency can produce the logo and the site. Only a leader can get six former founders and their teams to say the same thing. Pair it with sales leadership from the start, or the new story stays in marketing.",
        },
        {
          n: "15",
          title: "Marketing cannot prove it produces pipeline",
          aside: "Marketing",
          html: "<strong>What it looks like:</strong> A $20 to $75 million company with a marketing team, a budget, and a CEO who cannot connect any of it to revenue. Lead volume is reported; pipeline is not. The sales team says the leads are bad; marketing says sales does not follow up. The last head of marketing left, or is about to.<br><br><strong>What the leader does:</strong> A fractional CMO or VP of Marketing who has owned a pipeline number, not just a brand. Resets the definitions sales and marketing share, rebuilds the attribution, cuts the spend that does not produce, and installs the weekly cadence where both teams look at the same funnel. In the inbound data this is the clearest marketing ask: \"they don't get marketing and need qualified leads.\"<br><br><strong>Watch:</strong> Decide whether you need a leader or an executor before you hire. The most common marketing complaint in our survey is buyers who expected a fractional CMO to run campaigns like a growth marketer. Both are available. They are different people.",
        },
        {
          n: "16",
          title: "A second-generation owner takes over a business that never had a go-to-market function",
          aside: "Sales and marketing",
          html: `<strong>What it looks like:</strong> A family or founder-owned business, often $10 to $50 million in revenue, often in services, distribution, manufacturing or healthcare, that grew for 20 years on relationships and reputation. The new owner is the founder's child or a long-time operator who bought the company. The relationships are aging out with the founder. There has never been a marketing plan, a CRM anyone uses, or a sales process beyond "call the people we know."<br><br><strong>What the leader does:</strong> Usually two fractional leaders in sequence or in tandem: a sales leader to build the first real process and pipeline, and a marketing leader to give the company a presence beyond the founder's network. Both at 20 to 40 hours a month, because the business cannot absorb more change than that at once. Our direct clients skew exactly this way: agencies, services firms, healthcare and consulting businesses, only two of ${f.contracts.directClients} in software.<br><br><strong>Watch:</strong> The founder, if still around, has to bless the change in front of the team. And the new owner should expect the first 90 days to be about seeing the business clearly for the first time, which is uncomfortable, before anything grows.`,
        },
      ],
    },

    {
      t: "h2",
      eyebrow: "Anti-patterns",
      text: "Three situations where fractional is the wrong answer",
      id: "three-situations-where-fractional-is-the-wrong-answer",
    },
    { t: "p", html: "Operators were unusually candid about this, and the buyer should be too." },
    {
      t: "steps",
      items: [
        {
          n: "1",
          title: "You have not found product-market fit.",
          html: `<em>"They think they are ready for a full GTM launch but they haven't validated product-market fit, which makes any investment in marketing moot."</em><br><br>A fractional sales or marketing leader cannot sell a product the market has not said yes to. Three of the ${f.survey.status.endedEarly} early terminations in our data were at pre-revenue or sub-$1 million companies with expectations, or launch dates, that no leader could control.<br><br><strong>Instead:</strong> If you have fewer than ten paying customers, buy a 30-day validation project, not a leader.`,
        },
        {
          n: "2",
          title: "You want strategy with no budget or owner for execution.",
          html: "<em>\"Hiring a fractional leader for strategy only, without a clear mandate, an owner and budget for execution. Then the plan stays a slide deck.\"</em><br><br>If there is no money to execute the plan and nobody inside to run it, you are buying a document.<br><br><strong>Instead:</strong> Buy a cheaper one.",
        },
        {
          n: "3",
          title: "You are not going to let them lead.",
          html: "<em>\"Owners not able to give empowerment.\"</em><br><em>\"Treating them like a TaskRabbit.\"</em><br><em>\"Founders unable to recognize they need help, and ego prevents the result.\"</em><br><br>A fractional leader without decision rights is a consultant at a worse rate, and they will leave.<br><br><strong>Instead:</strong> If the honest answer is that you want someone to execute your sales strategy rather than fix it, hire a very good sales manager full-time.",
        },
      ],
    },
    {
      t: "callout",
      tone: "gold",
      title: "A mismatch: you want a fractional sales rep",
      html: `And one that is not quite an anti-pattern but is a mismatch: <strong>you want a fractional sales rep.</strong> Two of the inbound requests we received this year did. It is a real need at very small companies. It is just not what this market sells; ${f.platform.frontLine} profile in ${f.platform.usable} on our platform is a front-line seller. If what you need is someone to make calls, that is a different search.`,
    },

    { t: "h2", eyebrow: "Tool", text: "The Fractional Opportunity Finder", id: "the-fractional-opportunity-finder" },
    { t: "p", html: "Answer yes or no." },
    {
      t: "table",
      caption: "The Fractional Opportunity Finder",
      head: ["", "Question"],
      firstColHeader: true,
      rows: [
        ["1", "Has the founder or CEO personally closed most of the revenue in the last two years?"],
        ["2", "Did a sales or marketing leader leave in the last six months?"],
        ["3", "Are there reps on payroll with no documented process they all follow?"],
        ["4", "Does more than half of pipeline come from the founder's personal network?"],
        ["5", "Has the forecast missed by more than 10% in two of the last four quarters?"],
        ["6", "Is there a transaction, raise or diligence event in the next 18 months?"],
        ["7", "Are you trying to sell a materially larger deal than you sell today?"],
        ["8", "Is there an AI tool in the sales stack that nobody uses?"],
        ["9", "Has the company acquired or merged with another business in the last three years without rebuilding its positioning?"],
        ["10", "Can marketing show you, this week, how much pipeline it produced last quarter?"],
        ["11", "Has a new CEO, owner or sponsor taken control of the company in the last 12 months?"],
      ],
    },
    { t: "h3", text: "Scoring" },
    {
      t: "table",
      head: ["Yes answers", "What it means"],
      firstColHeader: true,
      rows: [
        ["Two or more yes", "A fractional GTM leader is likely to be the right next hire, and the \"yes\" questions tell you which kind."],
        ["One yes", "Probably a project."],
        ["None", "You may be fine, or you may have a product problem."],
      ],
    },
  ],
};

export default chapter;
