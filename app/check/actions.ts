"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
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
  await recordLead({ revenue, employees, answers, firstName, lastName, email, company, result });
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
function hubspotFields(lead: Lead) {
  const f = (name: string, value: string | number) => ({ objectTypeId: "0-1", name, value: String(value) });
  return [
    f("email", lead.email),
    f("firstname", lead.firstName),
    f("lastname", lead.lastName),
    ...(lead.company ? [f("company", lead.company)] : []),
    f("rn_check_revenue_range", lead.revenue),
    f("rn_check_employee_range", lead.employees),
    f("rn_check_total", lead.result.total),
    ...pillars.map((p: Pillar) => f(`rn_check_${p}`, lead.answers[p] as Level)),
    f("rn_check_fix_first", lead.result.fixFirst.map((x) => x.pillar).join(";")),
  ];
}

async function recordLead(lead: Lead): Promise<void> {
  const portal = process.env.HUBSPOT_PORTAL_ID;
  const form = process.env.HUBSPOT_CHECK_FORM_ID;
  if (portal && form) {
    const res = await fetch(`https://api.hsforms.com/submissions/v3/integration/submit/${portal}/${form}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fields: hubspotFields(lead),
        context: { pageUri: "https://revenuenomad.com/check", pageName: "The 2-minute revenue health check" },
      }),
    });
    if (res.ok) return;
    console.error(`HubSpot form submission failed: HTTP ${res.status}. Falling back to the local store.`);
  } else {
    console.warn("HUBSPOT_PORTAL_ID or HUBSPOT_CHECK_FORM_ID is not set; the check lead is written to the local store only.");
  }
  await appendLocal(lead);
}

/** Same directory rule as lib/store.ts: RN_DATA_DIR, else /tmp on serverless hosts, else ./data. */
function dataDir(): string {
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  return process.env.RN_DATA_DIR || (serverless ? path.join("/tmp", "revenue-nomad") : path.join(process.cwd(), "data"));
}

async function appendLocal(lead: Lead): Promise<void> {
  const dir = dataDir();
  const file = path.join(dir, "checks.json");
  await fs.mkdir(dir, { recursive: true });
  let existing: unknown[] = [];
  try {
    existing = JSON.parse(await fs.readFile(file, "utf8")) as unknown[];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.error("checks.json unreadable, starting a new file:", e);
  }
  existing.push({
    at: new Date().toISOString(),
    ...lead,
    answers: Object.fromEntries(questions.map((q) => [q.pillar, lead.answers[q.pillar]])),
  });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(existing, null, 2), "utf8");
  await fs.rename(tmp, file);
}
