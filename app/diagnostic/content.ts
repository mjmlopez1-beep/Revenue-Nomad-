import { pillars, type Pillar } from "../check/content";

/**
 * Every word of the "AssessmentPage" artboard (Design canvas "Revenue Nomad - Option D website"), in order.
 * Pillar names and the four maturity levels come from app/check/content.ts so the 2-minute check and the
 * Diagnostic cannot drift; only the 21 building blocks and the page copy live here.
 * One change from the board: "quick wins split from bigger bets" reads "quick wins separated from bigger bets",
 * because "split" is on the client-facing fee-language blocklist (CONSTRAINTS.md "Design").
 */

export const hero = {
  eyebrow: "Solutions - How we engage",
  h1: { plain: "Find out what is broken", em: "before you hire anyone" },
  lede:
    "The Revenue Health Diagnostic scores 21 building blocks across seven pillars, with the evidence behind every score. A day-30 readout ranks what is broken, and a roadmap follows with a bridge from pipeline to the bookings goal that your CEO and CFO can defend to the board.",
  primary: "Talk to us",
  secondary: "See what you get",
  scopeNote: "scoped to your business",
  checkFirst: "Take the 2-minute check first",
};

export const start = {
  title: "When to start here",
  intro: "Four situations from the State of Fractional GTM 2027 where the right first step is a scored read, not a hire.",
  cards: [
    {
      title: "You cannot say what is broken",
      body: "The decision tree in our 2027 report starts here. If you cannot name, specifically, what is broken in your revenue function, run a 30- to 45-day diagnostic first, then decide who to hire.",
    },
    {
      title: "The forecast moves every week",
      body: "The board asks a question and the answer changes every week. Stage definitions, hygiene, inspection and reporting get scored before anyone rebuilds them.",
    },
    {
      title: "A raise, a sale or diligence is coming",
      body: "A transaction in 6 to 18 months and a revenue function that would not survive a diligence team’s questions. Twelve months of clean data is worth far more than three.",
    },
    {
      title: "CEO needs to know what is real",
      body: "A board or sponsor put in a new leader with 90 days to report what is real. Scope it as a diagnostic with a written readout, then decide the permanent structure.",
    },
  ],
};

export const model = {
  eyebrow: "The model",
  title: "Seven pillars, 21 building blocks",
  intro:
    "Every diagnostic scores the same 21 building blocks, so you see your revenue engine the way an operator would - from structure and systems to the data, the operating rhythm, the team, and where AI can take work off your sellers.",
  levelsKicker: "Each block is scored on four levels",
  /** The board's tag on the seventh card; its title is pillarLabel.ai. */
  aiTag: "AI Native",
};

/** The 21 building blocks, three per pillar, in the board's order. */
export const blocks: Record<Pillar, readonly [string, string, string]> = {
  gtm_design: ["GTM structure", "Systems design", "Performance management"],
  revenue_technology: ["Sales technology", "Marketing technology", "CS technology"],
  revenue_insights: ["Forecasting", "KPI management", "Operational rigor"],
  data_foundations: ["Documentation", "Stewardship", "Hygiene"],
  operating_rhythm: ["Project management", "Team alignment", "Process and purpose"],
  team_enablement: ["Sales readiness", "Coaching", "Revenue optimization"],
  ai: ["AI opportunity mapping", "Seller effectiveness", "GTM efficiency"],
};
export const blockCount = pillars.reduce((n, p) => n + blocks[p].length, 0);

/** The eight steps of the method diagram (MethodDiagram.tsx). Captions are the page's, not the board's. */
export const method = {
  label: "The method, in eight steps: one revenue engine is cut into seven pillars and 21 building blocks, each block is scored on four levels, the lowest come out ranked, regroup into workstreams, a bridge runs from pipeline to the bookings goal, and an operating rhythm keeps the finished engine moving.",
  steps: [
    { title: "One revenue engine", caption: "The whole function, before anyone looks inside." },
    { title: "Seven pillars", caption: "From structure and systems to the team and AI." },
    { title: "21 building blocks", caption: "Three per pillar, scored the same way every time." },
    { title: "Scored on four levels", caption: "Each block from Ad Hoc to Optimized, with the evidence beside it." },
    { title: "What is broken, ranked", caption: "The lowest blocks come out first, by severity." },
    { title: "Regrouped into workstreams", caption: "Quick wins and bigger bets, each with an owner." },
    { title: "A bridge to the bookings goal", caption: "From pipeline to the number the board can test." },
    { title: "An operating rhythm", caption: "Monthly re-scores and a 90-day readout keep it moving." },
  ],
};

export const analyze = {
  eyebrow: "What we analyze",
  title: "Every question tied to an analysis",
  intro:
    "The interviews and the data answer two questions - where revenue leaks, and whether the team is set up to stop it. Every question maps to a specific analysis, not a topic to discuss.",
  lenses: [
    {
      kicker: "Lens 1",
      title: "Where pipeline leaks",
      items: [
        "Conversion by stage, segment, source and rep",
        "Handoffs - marketing to SDR, SDR to AE",
        "Speed to lead and follow-up",
        "Loss reasons, including no decision",
        "Spend by source, against what converts",
      ],
    },
    {
      kicker: "Lens 2",
      title: "Whether the team is set up to win",
      items: [
        "Sales structure and roles for the motion",
        "Coverage, territories and capacity",
        "Quota and compensation design",
        "Talent against the role profile",
        "The systems and data the team relies on",
      ],
    },
  ],
  benchmark: {
    kicker: "Benchmark ranges",
    body: "Where a public range exists, each metric sits beside it - aligned, off or well off. Ranges frame the conversation. The evidence decides the score.",
  },
};

export const runs = {
  eyebrow: "How it runs",
  title: "A readout at day 30, a plan by day 60",
  intro: "Run by one senior Revenue Nomad operator on the same model every time, so every score means the same thing.",
  steps: [
    {
      n: "01",
      when: "Week 0",
      title: "Access and kickoff",
      body: "CRM, reporting and finance access, the interview list agreed, and one owner on your side for data requests.",
    },
    {
      n: "02",
      when: "Weeks 1 - 4",
      title: "Interviews and data, in parallel",
      body: "Executives and frontline sellers are interviewed while the CRM and reporting data are pulled - each block opens with a baseline question, then depth questions.",
    },
    {
      n: "03",
      when: "Day 30",
      title: "The readout",
      body: "Every block scored 1 to 4 with the evidence beside it. What is broken, ranked by severity, with quick wins separated from bigger bets.",
      note: "Delivered to the CEO and CFO",
    },
    {
      n: "04",
      when: "Days 30 - 60",
      title: "Roadmap and bridge",
      body: "Workstreams with an owner, expected impact and time to impact - and a bridge from pipeline to the bookings goal the board can test.",
    },
    {
      n: "05",
      when: "Day 90",
      title: "Operating rhythm",
      body: "If the same operator stays on to run the roadmap, the operating rhythm is live by day 90.",
      note: "One owner, diagnosis to execution",
    },
  ],
  foot: "Customer interviews can be added through a specialist partner. Timing scales with scope - 30 to 60 days from kickoff to the full roadmap.",
};

export const get = {
  eyebrow: "What you get",
  title: "Four things you keep",
  scores: {
    title: "Scores by pillar",
    badge: "Illustrative",
    target: 3,
    targetLabel: "Target",
    note: "Sample scores to show the format - not a client’s results.",
  },
  cards: [
    {
      title: "Maturity scorecard",
      body: "All 21 building blocks scored 1 to 4 and rolled up by pillar, so you see where the engine is strong and where it is person-dependent.",
    },
    {
      title: "Evidence log",
      body: "What we saw or heard behind every score, with the follow-ups and data requests still open.",
    },
    {
      title: "Priority workstreams",
      body: "The few workstreams that move revenue most, sorted into quick wins and bigger bets - each with an owner, the expected impact and the time it takes to show.",
    },
    {
      title: "Revenue roadmap",
      body: "Month by month for the first quarter, then quarterly - what gets done, in what order, and the bridge from pipeline to the bookings goal.",
    },
  ],
};

/** The illustrative pillar scores (the board's sample scorecard), on the 1 to 4 scale. */
export const sampleScores: { pillar: Pillar; score: number }[] = [
  { pillar: "gtm_design", score: 2.3 },
  { pillar: "revenue_technology", score: 2.8 },
  { pillar: "revenue_insights", score: 1.7 },
  { pillar: "data_foundations", score: 1.5 },
  { pillar: "operating_rhythm", score: 2.4 },
  { pillar: "team_enablement", score: 2.0 },
  { pillar: "ai", score: 1.3 },
];

/** Period columns: 1 is Month 1, 6 is Q4. Bars and milestones are [start, end) in those columns. */
export type Bar = { from: number; to: number; label: string };
export type Workstream = {
  title: string;
  pillar: Pillar;
  score: string;
  target: string;
  owner: string;
  bars: Bar[];
  milestone: { at: number; label: string };
};
export const roadmap = {
  eyebrow: "Sample roadmap",
  title: "From scores to a plan you can hold us to",
  intro:
    "The lowest scores become the workstreams. Each one names the pillar it fixes, the score it starts from and the target, who owns it, and the milestone that proves it moved - the view an operating partner or a diligence team reviews.",
  badge: "Illustrative",
  columns: ["Month 1", "Month 2", "Month 3", "Q2", "Q3", "Q4"],
  head: { workstream: "Workstream", score: "Score", target: "Target", owner: "Owner" },
  rows: [
    {
      title: "Data foundations and pipeline hygiene",
      pillar: "data_foundations",
      score: "1.5",
      target: "3",
      owner: "RevOps lead",
      bars: [{ from: 1, to: 3, label: "Stage definitions, field cleanup, owners" }],
      milestone: { at: 3, label: "Pipeline clean enough to inspect" },
    },
    {
      title: "Forecast and KPI rhythm",
      pillar: "revenue_insights",
      score: "1.7",
      target: "3",
      owner: "Sales leader + RevOps",
      bars: [{ from: 2, to: 5, label: "Weekly forecast call, one KPI set, board view" }],
      milestone: { at: 4, label: "First forecast built on inspected deals" },
    },
    {
      title: "Sales process and org structure",
      pillar: "gtm_design",
      score: "2.3",
      target: "3",
      owner: "Sales leader",
      bars: [
        { from: 1, to: 2, label: "Design" },
        { from: 2, to: 5, label: "Roles, stages and comp plan rolled out" },
      ],
      milestone: { at: 4, label: "Structure signed off by the CEO" },
    },
    {
      title: "Team enablement",
      pillar: "team_enablement",
      score: "2.0",
      target: "3",
      owner: "Sales leader",
      bars: [{ from: 3, to: 6, label: "Playbook, onboarding, coaching cadence" }],
      milestone: { at: 6, label: "Ramp time measured, not guessed" },
    },
    {
      title: "AI in the seller workflow",
      pillar: "ai",
      score: "1.3",
      target: "2.5",
      owner: "RevOps lead",
      bars: [{ from: 4, to: 7, label: "Two use cases piloted, then scaled" }],
      milestone: { at: 7, label: "Time back per seller measured" },
    },
  ] satisfies Workstream[],
  unlocks: {
    label: "What it unlocks",
    items: [
      { from: 1, to: 3, label: "A baseline the CEO, the board and the team agree on" },
      { from: 3, to: 5, label: "A forecast the board can inspect" },
      { from: 5, to: 7, label: "A revenue engine that survives a change in people" },
    ],
  },
  legend: "Milestone the scorecard is re-run against",
  cadence: "Monthly re-score of the five workstreams · 90-day readout to the CEO and board",
  note: "Sample roadmap to show the format - not a client’s plan. Starting scores match the sample scorecard above.",
};

export const compare = {
  title: "An operator’s diagnostic, not a consultant’s deck",
  intro: "Big-firm assessments bring a team, a framework and a deck. We bring one senior operator who can run what they find.",
  columns: ["Revenue Health Diagnostic", "Consulting firm assessment"],
  rows: [
    { label: "Who runs it", cells: ["One senior operator who has run the seat", "A team of consultants and analysts"] },
    { label: "What you get", cells: ["A day-30 readout, a ranked roadmap and a bridge the board can test", "A findings deck and recommendations"] },
    { label: "After the readout", cells: ["The same operator can run the roadmap, {daysPerWeek}", "A new statement of work, or a handoff to your team"] },
    { label: "Accountability", cells: ["One named owner from diagnosis to execution", "Recommendations - execution is yours"] },
  ],
};

export const governance = {
  eyebrow: "Governance",
  title: "How the work is run once it starts",
  cards: [
    { title: "A named owner on each side", body: "Our operator and one owner on your team, accountable for the backlog and the data requests." },
    { title: "A live backlog", body: "Every workstream and task in one board your team can see - not a static plan in a deck." },
    { title: "A monthly summary", body: "What moved, what is stuck and what is next, written for the CEO and the board." },
    { title: "A 90-day reset", body: "The scorecard re-run against the baseline, and next quarter’s priorities set from it." },
  ],
};

export const after = {
  title: "What happens after the readout",
  intro: "The roadmap is yours. There are three ways to run it.",
  options: [
    {
      n: "01",
      title: "Run the roadmap yourself",
      body: "Your team takes the workstreams and the sequence, with the scorecard as the baseline to measure against.",
    },
    {
      n: "02",
      title: "Put a fractional leader on it",
      body: "A RevOps, sales or marketing leader runs the workstreams {daysPerWeek}, matched to what the scores found.",
    },
    {
      n: "03",
      title: "Hire full time into a clear role",
      body: "You hire with a working diagnosis and a job description you can now write - the step our report’s decision tree comes back to.",
    },
  ],
  caseStat: {
    kicker: "How one started",
    value: "15 months",
    body: "A month-one Revenue Health Diagnostic became a 15-month roadmap at a $400M ARR software company - then a fractional VP of Revenue Operations reporting to the CRO to run it.",
    link: "Read the case study",
  },
};

export const faq = {
  title: "Common questions",
  items: [
    {
      q: "How is it priced?",
      a: "It is scoped to your business - the size of the team and the systems in play - and agreed in writing before anything starts.",
    },
    { q: "How long does it take?", a: "A readout at day 30 and the full roadmap by day 60, depending on scope." },
    {
      q: "What do you need from us?",
      a: "Access to the CRM and reporting, interview time with the people who run each function, and a named owner on your side for data requests.",
    },
    {
      q: "We already know what is broken. Do we need this?",
      a: "Probably not. The decision tree in our 2027 report sends companies that can name the problem straight to deciding who should fix it. Talk to us and we will tell you which side of that line you are on.",
    },
    {
      q: "Does it commit us to anything after?",
      a: "No. The roadmap is yours to run - with a fractional leader, with a full-time hire, or with your own team.",
    },
    { q: "Who runs it?", a: "A Revenue Nomad operator, using the same 21-block model on every diagnostic." },
    {
      q: "Do you benchmark us against peers?",
      a: "Yes, against public ranges where they exist - flagged aligned, off or well off. Ranges are context. The score comes from the evidence in your business.",
    },
    {
      q: "Can a PE sponsor commission it?",
      a: "Yes. The day-30 readout and the bridge from pipeline to the bookings goal are built for a CEO, a CFO and a board to test.",
    },
  ],
};

export const meta = {
  title: "Revenue Health Diagnostic",
  description:
    "The Revenue Health Diagnostic scores 21 building blocks across seven pillars, with the evidence behind every score. A day-30 readout ranks what is broken, and a roadmap follows with a bridge from pipeline to the bookings goal.",
};
