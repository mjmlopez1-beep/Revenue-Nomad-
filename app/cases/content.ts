/**
 * The seven case studies (/case-studies and /case-studies/<slug>). Every engagement here is real: the three the
 * homepage's Outcomes cards carry (myHR Partner, Grow Pro Agency, Practice Promotions), the two the Elevate
 * proposal cites (Ferry, BuildingLink), Clarus Care from the Pipeline page's results, and the $400M ARR software
 * company the Diagnostic page describes, which stays unnamed. Figures come from app/home/content/numbers.ts so they
 * carry the house confirm badge until the founder signs them off; outcome bullets that need the client's blessing
 * before they go public carry `confirm: true`. Sources: the signed agreements and statements of work, the proposal
 * case-study slides (April and May 2026), the myHR Partner expansion plan (Q1 2025), the Clarus lead-gen play, and
 * the reviews on the homepage. No fee, rate or hours figure from a contract appears here.
 */
import type { Pillar } from "../check/content";
import type { NumberKey } from "../home/content/numbers";
import type { MotifKey } from "../problems/ProblemMotif";

export type Outcome = string | { t: string; confirm: true };

export type CaseStudy = {
  slug: string;
  company: string;
  /** True when the company is described, not named. */
  unnamed?: boolean;
  sector: string;
  /** Key into colorLogos (app/home/content/logos.ts) when a color mark exists. */
  logo?: string;
  /** Cover photo from public/home/cards/ for the hub card; the isometric motif stands in when there is none. */
  photo?: string;
  motif: MotifKey;
  seat: string;
  engagement: string;
  /** The page's headline figure, from numbers.ts, or a status word when the result is not a number yet. */
  figure?: NumberKey;
  status?: string;
  title: string;
  lede: string;
  glance: { v: string; l: string; id?: NumberKey }[];
  situation: string[];
  talent: string[];
  scope: string[];
  changed: Outcome[];
  quote?: { text: string; by: string; title: string };
  pillars: Pillar[];
  problem: { label: string; href: string };
  role: { label: string; href: string };
  basis: string;
};

export const cases: CaseStudy[] = [
  {
    slug: "myhr-partner",
    company: "myHR Partner",
    sector: "Outsourced HR for companies of 10 to 800 employees",
    logo: "myHR Partner",
    photo: "case-myhr.webp",
    motif: "founder",
    seat: "Fractional VP of Sales",
    engagement: "18 months and counting, since May 2024",
    figure: "outcomeMyHr",
    title: "A sales engine built where there had never been a revenue leader",
    lede: "A growing HR firm with no comp plan, no pricing model and no forecast. Eighteen months later, monthly new business bookings were up 51% and the team was running the system itself.",
    glance: [
      { v: "+51%", l: "monthly new business bookings over 18 months", id: "outcomeMyHr" },
      { v: "1 AE", l: "beating quota on the new comp plan" },
      { v: "Largest", l: "new contract in two years, closed in the engagement" },
    ],
    situation: [
      "myHR Partner had grown on referrals and a founder who could sell. By 2024 the company had an account executive, a marketing engine and a growing client base, and nobody whose job was revenue. There was no written sales process, no pricing model the team could quote from, no compensation plan tied to the behavior the business needed, and no forecast anyone planned around.",
      "The question was not whether to hire a sales leader. It was whether a full-time VP of Sales made sense for a company this size, or whether the same seat could be filled a few days a week by someone who had built this before.",
    ],
    talent: ["Fractional VP of Sales, 1 to 3 days a week", "Revenue Nomad engagement lead"],
    scope: [
      "A written sales playbook: stages, qualification, the offer and the talk track, built from the 2024 Revenue Health Assessment",
      "A pricing model and a compensation plan the account executive could be managed against",
      "A weekly pipeline review and a forecast the leadership team plans around",
      "In 2025, an expansion motion between Sales and Customer Success: trigger-based outreach, a 90-day check-in and quarterly reviews that surface new needs in the client base",
    ],
    changed: [
      "Monthly new business bookings up 51% across the 18 months, against the 17 months before",
      "An account executive beating quota on the new comp plan",
      "The largest new contract in two years",
      "A Sales and Customer Success expansion process the team runs, with a shared revenue target for the year",
    ],
    quote: {
      text: "Knowledgeable, responsive, and provided transformative insights and actions to help our growing sales org.",
      by: "Eric B.",
      title: "Account Executive, myHR Partner",
    },
    pillars: ["gtm_design", "operating_rhythm", "team_enablement", "revenue_insights"],
    problem: { label: "Scaling beyond founder-led sales", href: "/problems/founder-led-sales" },
    role: { label: "Fractional VP of Sales", href: "/fractional-vp-of-sales" },
    basis: "Company bookings data, the 18 months of the engagement against the 17 months before; the signed agreement of May 2024; the 2025 Sales and CS expansion plan. The review is a verified company review, 5 of 5.",
  },
  {
    slug: "grow-pro-agency",
    company: "Grow Pro Agency",
    sector: "Growth marketing agency for dance studios",
    photo: "case-growpro.webp",
    motif: "founder",
    seat: "Fractional Sales Director",
    engagement: "Since October 2025, expanded in year two",
    figure: "outcomeGrowPro",
    title: "The founder stepped out of the sales seat, and the team kept selling",
    lede: "A founder moving from Sales Director to Visionary needed someone to run the sales team the way he had, without being him. Twelve months in, June sales were up 54.8% year over year and the company expanded the engagement by 75%.",
    glance: [
      { v: "+54.8%", l: "June sales, year over year, in year two", id: "outcomeGrowPro" },
      { v: "+75%", l: "hours added to the engagement after year one" },
      { v: "2", l: "reps coached weekly, with Friday call review" },
    ],
    situation: [
      "Grow Pro Agency sells growth marketing to dance studio owners, a niche the founder knows cold. He had been the company's Sales Director as well as its CEO, and the business runs on EOS, so the move to Visionary was planned. What it needed was a Sales Director who would hold the weekly Level 10, run the accountability cadence and coach two reps, inside the collaborative culture the founder wanted to keep as the team grew.",
      "The scope was deliberately small: 20 hours a month, a 90-day opt-out, then month to month.",
    ],
    talent: ["Fractional Sales Director, 20 hours a month, then 35"],
    scope: [
      "The weekly sales Level 10 in EOS format, with metrics rolling up into the company's scorecard",
      "A daily team sync and pipeline management, with written updates to the founder",
      "One-on-one coaching for both reps and a Friday game tape session on recorded calls",
      "Dashboards in the CRM and a dance-niche go-to-market plan proposed as the team scaled",
    ],
    changed: [
      "The founder out of the sales seat, with a team that kept selling without him",
      "The strongest June since 2021: sales up 54.8% year over year",
      "The engagement expanded from 20 to 35 hours a month in October 2026, on the same scope, to deepen execution",
    ],
    pillars: ["operating_rhythm", "team_enablement", "revenue_insights"],
    problem: { label: "Scaling beyond founder-led sales", href: "/problems/founder-led-sales" },
    role: { label: "Fractional VP of Sales", href: "/fractional-vp-of-sales" },
    basis: "Company sales reporting, year two against year one; the signed agreement of October 2025 and its addendum of October 2026.",
  },
  {
    slug: "practice-promotions",
    company: "Practice Promotions",
    sector: "Marketing agency for physical therapy practices, $9M+ revenue",
    logo: "Practice Promotions",
    photo: "case-practice.webp",
    motif: "pipeline",
    seat: "Fractional VP of Sales",
    engagement: "Since September 2026, an early result",
    figure: "outcomePracticePromotions",
    title: "From two to four new clients a month toward ten, starting with the sales system",
    lede: "A $9M agency with a $15M goal, a marketing engine that worked and a sales motion that did not. Five weeks in, two SDRs were hired and training and the first AE hire was underway.",
    glance: [
      { v: "5 weeks", l: "to a hired, training SDR team", id: "outcomePracticePromotions" },
      { v: "30-40%", l: "the strategy-call conversion the plan is built to recover, from the teens" },
      { v: "10", l: "new clients a month the plan targets, from 2 to 4" },
    ],
    situation: [
      "Practice Promotions had done the hard things: raised its price point, expanded the service, handled churn and built a marketing engine. Conversion on qualified strategy calls had still fallen from 30 to 40% into the teens, the sales cycle had stretched to six to eight weeks across a three-meeting process, and outbound had never worked. At two to four new clients a month the business would not reach $15M.",
      "The gap was not lead volume or effort. It was a revenue leader with the experience to diagnose the system, redesign it and hold the team to the plan, above a Director of Sales who kept selling and coaching day to day.",
    ],
    talent: ["Fractional VP of Sales, 30 hours a month for the first 90 days, then 20"],
    scope: [
      "A revenue diagnostic in the first three weeks: the $15M plan reverse-engineered, the funnel analyzed by stage, source, segment and rep in HubSpot and Gong",
      "The sales process redesigned from three meetings to an outcome-led motion, with stage exit criteria and a required next step on every call",
      "An outbound and BDR rebuild for multi-location practices: vertical messaging, peer proof, a free diagnostic offer and signal-based targeting, tested over 60 days",
      "Weekly coaching with the Director of Sales, call review with the team, and a 12 to 18 month revenue plan by day 90",
    ],
    changed: [
      "Two SDRs hired and training by week five",
      "The first account executive hire underway",
      "A weekly pipeline and forecast cadence the CEO can see, in place of escalations",
    ],
    quote: {
      text: "Jeff has been fantastic to work with. I do feel 100% confident that Jeff was the right choice for what we needed at this stage of the game.",
      by: "Neil Trickett, PT",
      title: "CEO, Practice Promotions",
    },
    pillars: ["gtm_design", "team_enablement", "operating_rhythm", "revenue_insights"],
    problem: { label: "Pipeline beyond your network", href: "/problems/pipeline" },
    role: { label: "Fractional VP of Sales", href: "/fractional-vp-of-sales" },
    basis: "The statement of work of August 2026 and the engagement record at week five. An early result; the 90-day plan and its targets are the measure that follows.",
  },
  {
    slug: "ferry",
    company: "Ferry",
    sector: "Hospitality technology, selling to restaurant groups",
    logo: "Ferry",
    motif: "pipeline",
    seat: "Fractional Head of Sales with a RevOps and HubSpot architect",
    engagement: "Active",
    status: "Active",
    title: "Outbound rebuilt for a technical buyer who ignores marketing",
    lede: "A strong founder-led motion with no infrastructure behind it: HubSpot barely configured, a database nobody had tiered, generic outbound aimed at controllers and CFOs who do not answer marketing. The fix was the system first, then the hire into it.",
    glance: [
      { v: "3", l: "seats from one bench: head of sales, RevOps architect, outbound copy partner" },
      { v: "1", l: "new account executive onboarded into the built system" },
      { v: "Enterprise", l: "restaurant groups and resorts now in the pipeline" },
    ],
    situation: [
      "Ferry sells to the finance side of restaurant groups: controllers and CFOs who buy on numbers and do not respond to marketing-driven outreach. The founders had sold the early deals themselves. What they had not built was the machine: HubSpot was barely configured, the database was not tiered, and the outbound that existed was generic.",
      "Rather than hire a seller into that, the engagement built the system first. A fractional head of sales owned the motion, a RevOps and HubSpot architect rebuilt the stages, properties and scoring for the real buyer, and an outbound copy partner wrote the cadences for a finance audience.",
    ],
    talent: ["Fractional Head of Sales", "RevOps and HubSpot architect", "Outbound copy and cadence partner"],
    scope: [
      "The database re-segmented and tiered for the finance buyer at restaurant groups",
      "HubSpot rebuilt for the new motion: pipeline stages with exit criteria, properties, scoring and a weekly forecast view",
      "Cadences and discovery scripts written for controllers and CFOs, not for marketing contacts",
      "A new account executive hired and onboarded into the built system",
    ],
    changed: [
      { t: "An enterprise restaurant-group RFP in flight", confirm: true },
      { t: "A Las Vegas resort group in active workflow", confirm: true },
      "A new account executive executing the system rather than inventing one",
      "Engagement active and ongoing",
    ],
    quote: {
      text: "I couldn't recommend working with Matt and his team more. I hope to work with him again on future growth projects.",
      by: "Trista Kempa",
      title: "COO, Ferry",
    },
    pillars: ["revenue_technology", "data_foundations", "gtm_design", "team_enablement"],
    problem: { label: "Pipeline beyond your network", href: "/problems/pipeline" },
    role: { label: "Fractional RevOps leader", href: "/fractional-revops" },
    basis: "Engagement record as of May 2026; the review is a verified company review, 5 of 5. Named prospects are shown only with the client's permission.",
  },
  {
    slug: "buildinglink",
    company: "BuildingLink",
    sector: "Property management technology, 7,000+ properties",
    motif: "forecast",
    seat: "Fractional VP of Sales with a RevOps and comp design partner",
    engagement: "18 months, active",
    figure: "outcomeBuildingLink",
    title: "One sales team, three products, and a second motion that finally got sold",
    lede: "A flagship product crowded out two adjacent ones with real margin and a different buyer. The CRM did not track them and reps drifted back to the easier sale. Eighteen months later the secondary motion runs as a $400K expansion engine.",
    glance: [
      { v: "$400K", l: "expansion engine on the secondary product motion", id: "outcomeBuildingLink" },
      { v: "3", l: "product lines on one unified compensation model" },
      { v: "18 mo", l: "engagement, still active" },
    ],
    situation: [
      "BuildingLink runs a multi-product portfolio: the flagship property management platform, KeyLink for front-desk key management and Ledger for accounting. The sales team had no structured compensation model across the three, and no systematic motion to cross-sell into an installed base of more than 7,000 properties. The core resident-experience product took the attention; the adjacent products, with a distinct buyer and real margin, went undersold.",
      "The shape is common inside larger companies: one motion underweighted inside a bigger one, with a CRM that does not even track it.",
    ],
    talent: ["Fractional VP of Sales, 18 months", "RevOps and pipeline architect", "Compensation design partner", "Sales recruiting support"],
    scope: [
      "A tiered commission structure across the three products, with quarterly attainment tiers",
      "Cross-sell standard operating procedures from the flagship platform into Ledger, and a joint-selling motion with the Ledger sales lead",
      "A structured handoff between Sales and Customer Success",
      "Role profile design and sourcing for the next sales hires",
    ],
    changed: [
      "A unified compensation model across three product lines",
      "A structured cross-sell motion into the installed base",
      "A $400K expansion engine on the secondary motion",
      "An operating cadence across both motions, and faster hiring through a managed recruiting pipeline",
    ],
    pillars: ["gtm_design", "operating_rhythm", "team_enablement", "revenue_technology"],
    problem: { label: "A forecast the board believes", href: "/problems/forecast" },
    role: { label: "Fractional VP of Sales", href: "/fractional-vp-of-sales" },
    basis: "Engagement record at 18 months, April and May 2026.",
  },
  {
    slug: "clarus-care",
    company: "Clarus Care",
    sector: "Call management for healthcare practices and small health systems",
    motif: "pipeline",
    seat: "Fractional sales and pipeline leadership",
    engagement: "Outbound rebuild",
    figure: "outcomeClarusPipeline",
    title: "Pipeline from a narrow segment and a number the buyer did not have",
    lede: "Instead of more sequences to more clinics, the play benchmarked the thing the buyer worried about and opened with it. Pipeline generation ran at 833% of the year before.",
    glance: [
      { v: "833%", l: "pipeline generation pace, year over year", id: "outcomeClarusPipeline" },
      { v: "10-100", l: "practices per health system: the one segment the play targeted" },
      { v: "7", l: "specialties the shopping calls covered inside each system" },
    ],
    situation: [
      "Clarus Care sells call management to healthcare practices, where the pain is real but invisible from the outside: abandoned calls, slow call-backs, patients who give up. Generic outbound to clinics produced little. The buyers who could change it, a COO or a VP of Patient Access at a small health system, had never been shown their own numbers.",
      "The engagement narrowed the target to systems that own 10 to 100 practices and built a play around measuring what they could not see.",
    ],
    talent: ["Fractional sales leadership", "Outbound and research support"],
    scope: [
      "A target list of small health systems, and inside each, five to eight practices across the specialties where call volume hurts most",
      "Shopping calls to those practices to benchmark abandonment rate and call-back time, compiled into a per-system scorecard",
      "Outreach to the corporate personas that opened with the system's own benchmark, not with a product",
      "Two-week sprints with decision rules set in advance, measured on meetings with the right accounts and replies",
    ],
    changed: [
      "Pipeline generation at 833% of the prior year's pace",
      "A repeatable, benchmark-led play the team can run on each new system",
      "Outreach measured on meetings and replies, not dials and sends",
    ],
    pillars: ["gtm_design", "revenue_insights", "data_foundations"],
    problem: { label: "Pipeline beyond your network", href: "/problems/pipeline" },
    role: { label: "Fractional VP of Sales", href: "/fractional-vp-of-sales" },
    basis: "Engagement record, Clarus Care, pipeline generation pace year over year; the lead-generation play as documented in 2025.",
  },
  {
    slug: "software-400m-arr",
    company: "A $400M ARR software company",
    unnamed: true,
    sector: "Enterprise software, reporting to the CRO",
    motif: "forecast",
    seat: "Revenue Health Diagnostic, then a fractional VP of Revenue Operations",
    engagement: "15 months, from a month-one diagnostic",
    figure: "outcomeSoftwareRoadmap",
    title: "A month-one diagnostic that became a 15-month roadmap, and the leader to run it",
    lede: "The board asked questions the revenue team answered a week later. The Diagnostic scored where the engine was strong and where it was person-dependent, ranked what was broken, and became the roadmap a fractional RevOps leader then ran from the CRO's team.",
    glance: [
      { v: "15 mo", l: "from the month-one readout to a roadmap still running", id: "outcomeSoftwareRoadmap" },
      { v: "7", l: "pillars scored, 21 blocks, with the evidence beside each" },
      { v: "1", l: "fractional VP of Revenue Operations, reporting to the CRO" },
    ],
    situation: [
      "At $400M in annual recurring revenue the company had every system and every report, and still could not answer the board's questions quickly or the same way twice. Definitions differed by team, the forecast moved in both directions, and the people who knew where the numbers came from were the only ones who could produce them.",
      "The engagement started with a Revenue Health Diagnostic rather than a hire: 30 to 60 days, every block scored on the evidence, a day-30 readout to the CEO and CFO, and a roadmap with owners, impact and time to impact.",
    ],
    talent: ["One senior Revenue Nomad operator for the Diagnostic", "Fractional VP of Revenue Operations, reporting to the CRO, to run the roadmap"],
    scope: [
      "The 21 building blocks scored on a 1 to 4 scale, with the lowest scores pulled forward as the first workstreams",
      "One data model and one set of definitions across sales, marketing and customer success",
      "A forecast cadence the board can plan on, with inspection built in",
      "An operating rhythm: a live backlog, a monthly summary and a 90-day re-score",
    ],
    changed: [
      "A 15-month roadmap built from the month-one readout",
      "A fractional VP of Revenue Operations in the CRO's team to run it, 1 to 3 days a week",
      "An operating rhythm that still runs",
    ],
    pillars: ["data_foundations", "revenue_insights", "operating_rhythm", "revenue_technology"],
    problem: { label: "A forecast the board believes", href: "/problems/forecast" },
    role: { label: "Fractional RevOps leader", href: "/fractional-revops" },
    basis: "Engagement record. The company is described, not named, at its request.",
  },
];

export const caseBySlug = (slug: string) => cases.find((c) => c.slug === slug);

export const hub = {
  eyebrow: "Case studies",
  title: { plain: "What changed when", em: "companies hired us" },
  lede: "Seven engagements, each one real. The figure on every card is one company's result against its own baseline, with the basis stated on the page, never an average or a composite.",
  pattern: {
    title: "The pattern across seven engagements",
    items: [
      "The leader joined the team rather than advising it: a seat on the leadership team, the authority to change things, and a number to own.",
      "Each one fixed the biggest leak first. A process the team follows, a forecast the board can plan on, a motion for the buyer who was being missed.",
      "Most started small, a few days a week on a first term of three to six months, and several expanded on the same scope once the result showed.",
    ],
  },
};
