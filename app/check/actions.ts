"use server";

import { field, recordLead, type HubSpotField, type LeadDelivery } from "../leads/record";
import { employeeRanges, pillars, questions, revenueRanges, type EmployeeRange, type Level, type Pillar, type RevenueRange } from "./content";
import { levelForAnswer, score, type Answers, type CheckResult } from "./scoring";

/** What the stepper sends. Answers are answer indexes 0..3 (Optimized first). */
export type CheckSubmission = {
  revenue: string;
  employees: string;
  answers: Record<string, number>;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isRevenue = (v: string): v is RevenueRange => revenueRanges.some((r) => r.value === v);
const isEmployees = (v: string): v is EmployeeRange => employeeRanges.some((r) => r.value === v);
const clean = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);

/**
 * Validates the submission, scores it on the server, records the lead (HubSpot form when configured, else a
 * local JSON file), and returns the result for the results view. Nothing personal goes into a URL.
 */
export async function submitCheck(input: CheckSubmission): Promise<CheckResult> {
  const revenue = clean(input.revenue, 20);
  const employees = clean(input.employees, 20);
  if (!isRevenue(revenue) || !isEmployees(employees)) throw new Error("Choose a revenue range and an employee range.");

  const answers = {} as Answers;
  for (const p of pillars) {
    const idx = Number(input.answers?.[p]);
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) throw new Error("Answer every question.");
    answers[p] = levelForAnswer(idx);
  }

  const firstName = clean(input.firstName, 80);
  const lastName = clean(input.lastName, 80);
  const email = clean(input.email, 160);
  const company = clean(input.company, 120);
  if (!firstName || !lastName) throw new Error("Add your name.");
  if (!EMAIL.test(email)) throw new Error("Add a work email we can send the results to.");

  const result = score(answers, revenue);
  const lead: Lead = { revenue, employees, answers, firstName, lastName, email, company, result };
  await recordLead(delivery, hubspotFields(lead), {
    ...lead,
    answers: Object.fromEntries(questions.map((q) => [q.pillar, lead.answers[q.pillar]])),
  });
  return result;
}

type Lead = {
  revenue: RevenueRange;
  employees: EmployeeRange;
  answers: Answers;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  result: CheckResult;
};

/** HubSpot Forms API field names. Custom properties must exist on the contact (docs/specs/revenue-health-check.md). */
function hubspotFields(lead: Lead): HubSpotField[] {
  return [
    field("email", lead.email),
    field("firstname", lead.firstName),
    field("lastname", lead.lastName),
    ...(lead.company ? [field("company", lead.company)] : []),
    field("rn_check_revenue_range", lead.revenue),
    field("rn_check_employee_range", lead.employees),
    field("rn_check_total", lead.result.total),
    ...pillars.map((p: Pillar) => field(`rn_check_${p}`, lead.answers[p] as Level)),
    field("rn_check_fix_first", lead.result.fixFirst.map((x) => x.pillar).join(";")),
  ];
}

const delivery: LeadDelivery = {
  formIdEnv: "HUBSPOT_CHECK_FORM_ID",
  localFile: "checks.json",
  pageUri: "https://revenuenomad.com/check",
  pageName: "The 2-minute revenue health check",
};
