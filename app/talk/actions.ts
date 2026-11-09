"use server";

import { field, recordLead, type HubSpotField, type LeadDelivery } from "../leads/record";
import { employeeRanges, needs, revenueRanges, starts, type Need, type Start } from "./content";
import type { EmployeeRange, RevenueRange } from "../check/content";

export type TalkSubmission = {
  need: string;
  revenue: string;
  employees: string;
  start: string;
  name: string;
  email: string;
  company?: string;
  title?: string;
  note?: string;
};

export type TalkReceipt = {
  firstName: string;
  email: string;
  summary: { need: string; revenue: string; employees: string; start: string; note?: string };
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);
const labelOf = <T extends readonly { value: string; label: string }[]>(list: T, v: string) => list.find((x) => x.value === v)?.label ?? "";

const delivery: LeadDelivery = {
  formIdEnv: "HUBSPOT_TALK_FORM_ID",
  localFile: "talk-requests.json",
  pageUri: "https://revenuenomad.com/talk",
  pageName: "Talk to us",
};

/**
 * Validates the request against the enumerated options, records it (HubSpot form when configured, else the
 * local store) and returns what the sent state needs. Nothing personal goes into a URL.
 */
export async function submitTalk(input: TalkSubmission): Promise<TalkReceipt> {
  const need = clean(input.need, 32);
  const revenue = clean(input.revenue, 20);
  const employees = clean(input.employees, 20);
  const start = clean(input.start, 20);
  if (!needs.some((n) => n.value === need)) throw new Error("Pick where revenue is stuck.");
  if (!revenueRanges.some((r) => r.value === revenue) || !employeeRanges.some((r) => r.value === employees)) throw new Error("Pick both company size bands.");
  if (!starts.some((s) => s.value === start)) throw new Error("Pick a start date.");

  const name = clean(input.name, 120);
  const email = clean(input.email, 160);
  const company = clean(input.company, 120);
  const title = clean(input.title, 80);
  const note = clean(input.note, 1000);
  if (!name) throw new Error("Add your name.");
  if (!EMAIL.test(email)) throw new Error("Add a work email we can reply to.");

  const [firstName, ...rest] = name.split(/\s+/);
  const lastName = rest.join(" ");

  const fields: HubSpotField[] = [
    field("email", email),
    field("firstname", firstName),
    ...(lastName ? [field("lastname", lastName)] : []),
    ...(company ? [field("company", company)] : []),
    ...(title ? [field("jobtitle", title)] : []),
    field("rn_talk_need", need as Need),
    field("rn_talk_revenue_range", revenue as RevenueRange),
    field("rn_talk_employee_range", employees as EmployeeRange),
    field("rn_talk_start", start as Start),
    ...(note ? [field("message", note)] : []),
  ];
  await recordLead(delivery, fields, { need, revenue, employees, start, name, email, company, title, note });

  return {
    firstName,
    email,
    summary: {
      need: labelOf(needs, need),
      revenue: labelOf(revenueRanges, revenue),
      employees: labelOf(employeeRanges, employees),
      start: labelOf(starts, start),
      note: note || undefined,
    },
  };
}
