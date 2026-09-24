// One-click starting briefs for the most common fractional GTM seats. A buyer picks one,
// adjusts anything that differs, and posts. Budgets reflect the seeded operators' listed rates.
import type { Project } from "./types";

export interface Template {
  key: string;
  label: string;
  blurb: string;
  brief: Pick<Project, "title" | "successIn90Days" | "hoursPerMonthMin" | "hoursPerMonthMax" | "term" | "budgetMin" | "budgetMax" | "mustHaves" | "screeningQuestions">;
}

export const TEMPLATES: Template[] = [
  {
    key: "vp-sales",
    label: "VP of Sales",
    blurb: "Build the sales process and first team",
    brief: {
      title: "Fractional VP of Sales",
      successIn90Days: "A repeatable sales process, the first AEs hired and ramping, and a weekly forecast the CEO trusts.",
      hoursPerMonthMin: 20,
      hoursPerMonthMax: 30,
      term: "6 months",
      budgetMin: 175,
      budgetMax: 250,
      mustHaves: ["Sales Playbook", "B2B SaaS", "Sales Team Hiring & Ramp"],
      screeningQuestions: ["Walk us through the last sales process you built from scratch.", "How have you hired and ramped a first AE?"],
    },
  },
  {
    key: "cro",
    label: "Chief Revenue Officer",
    blurb: "Own the number across sales, CS and marketing",
    brief: {
      title: "Fractional Chief Revenue Officer",
      successIn90Days: "One revenue plan across sales, marketing and CS, a forecast within 10%, and a board-ready GTM narrative.",
      hoursPerMonthMin: 30,
      hoursPerMonthMax: 40,
      term: "6 months",
      budgetMin: 250,
      budgetMax: 350,
      mustHaves: ["Revenue forecasting", "B2B SaaS", "Board reporting"],
      screeningQuestions: ["Tell us about a revenue plan you owned end to end.", "How do you align sales, marketing and CS on one number?"],
    },
  },
  {
    key: "cmo",
    label: "Chief Marketing Officer",
    blurb: "Positioning, brand and a marketing plan",
    brief: {
      title: "Fractional Chief Marketing Officer",
      successIn90Days: "Sharp positioning and messaging, a 12-month marketing plan with a budget, and the first marketing hire scoped.",
      hoursPerMonthMin: 30,
      hoursPerMonthMax: 40,
      term: "6 months",
      budgetMin: 200,
      budgetMax: 300,
      mustHaves: ["Positioning & messaging", "B2B SaaS", "Marketing leadership"],
      screeningQuestions: ["Walk us through a repositioning you led and what changed.", "How do you decide the first marketing hire?"],
    },
  },
  {
    key: "revops",
    label: "VP of Revenue Operations",
    blurb: "Clean CRM, forecast and reporting",
    brief: {
      title: "Fractional VP of Revenue Operations",
      successIn90Days: "A clean CRM, one pipeline definition, dashboards leadership uses weekly, and a forecast process that runs itself.",
      hoursPerMonthMin: 20,
      hoursPerMonthMax: 30,
      term: "3 months",
      budgetMin: 150,
      budgetMax: 225,
      mustHaves: ["HubSpot", "Revenue forecasting", "CRM cleanup"],
      screeningQuestions: ["Which CRM rebuild are you proudest of?", "How do you run a weekly forecast call?"],
    },
  },
  {
    key: "demand-gen",
    label: "VP of Marketing",
    blurb: "Demand gen and pipeline from marketing",
    brief: {
      title: "Fractional VP of Marketing",
      successIn90Days: "Two channels producing qualified pipeline every week, clean attribution, and a quarterly plan with a budget.",
      hoursPerMonthMin: 20,
      hoursPerMonthMax: 30,
      term: "3 months",
      budgetMin: 150,
      budgetMax: 225,
      mustHaves: ["Demand generation", "B2B SaaS", "Paid acquisition"],
      screeningQuestions: ["Which channel did you last scale from zero?", "How do you report pipeline sourced by marketing?"],
    },
  },
  {
    key: "cs",
    label: "VP of Customer Success",
    blurb: "Retention and expansion motion",
    brief: {
      title: "Fractional VP of Customer Success",
      successIn90Days: "An onboarding playbook, health scores on every account, and an expansion motion with a named owner.",
      hoursPerMonthMin: 20,
      hoursPerMonthMax: 30,
      term: "6 months",
      budgetMin: 150,
      budgetMax: 225,
      mustHaves: ["Customer onboarding", "Retention", "Expansion revenue"],
      screeningQuestions: ["How did you last cut churn, and by how much?", "How do you hand accounts from sales to CS?"],
    },
  },
  {
    key: "enablement",
    label: "Director of Enablement",
    blurb: "Onboarding, training and call coaching",
    brief: {
      title: "Fractional Director of Enablement",
      successIn90Days: "A 30 day AE onboarding program, a call coaching rhythm, and ramp time cut by a third.",
      hoursPerMonthMin: 10,
      hoursPerMonthMax: 20,
      term: "3 months",
      budgetMin: 125,
      budgetMax: 200,
      mustHaves: ["New Hire Sales Onboarding", "Call Coaching & Feedback", "Sales Training Program"],
      screeningQuestions: ["Describe an onboarding program you built and its ramp results."],
    },
  },
  {
    key: "ai-architect",
    label: "GTM AI Architect",
    blurb: "AI agents and automation across the funnel",
    brief: {
      title: "Fractional GTM AI Architect",
      successIn90Days: "Two AI workflows live in the sales and marketing motion, measured time saved, and a roadmap the team can run.",
      hoursPerMonthMin: 20,
      hoursPerMonthMax: 30,
      term: "3 months",
      budgetMin: 175,
      budgetMax: 250,
      mustHaves: ["AI GTM", "Workflow automation", "CRM integration"],
      screeningQuestions: ["Which AI workflow have you put into production for a GTM team?", "How do you measure whether an AI workflow is working?"],
    },
  },
];

export const HOUR_PRESETS: [number, number][] = [
  [10, 20],
  [20, 30],
  [30, 40],
  [40, 60],
];

export const BUDGET_PRESETS: [number, number][] = [
  [125, 175],
  [150, 225],
  [175, 250],
  [250, 350],
];
