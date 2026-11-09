/**
 * Talk to us: the four-question request. Copy from the "Desktop - Talk to us flow" artboard.
 * Revenue and employee ranges reuse the standard fields from the check.
 */
export { employeeRanges, revenueRanges } from "../check/content";

export const needs = [
  { value: "sales_motion", label: "The sales motion" },
  { value: "pipeline_forecast", label: "Pipeline and forecast" },
  { value: "team", label: "The team" },
  { value: "systems_data", label: "Systems and data" },
  { value: "ai_gtm", label: "AI GTM" },
  { value: "retention_growth", label: "Retention and growth" },
  { value: "partners_channels", label: "Partners and channels" },
  { value: "other", label: "Other" },
] as const;
export type Need = (typeof needs)[number]["value"];

export const starts = [
  { value: "within_30_days", label: "Within 30 days" },
  { value: "this_quarter", label: "This quarter" },
  { value: "next_quarter", label: "Next quarter" },
  { value: "exploring", label: "Exploring - no date yet" },
] as const;
export type Start = (typeof starts)[number]["value"];

export const assurances = ["No fees for companies", "No login to browse", "We speak within 24 hours"] as const;

/**
 * Public booking page for "Rather talk now?" and "Book a call". Defaults to the firm's Calendly page
 * (the connected Calendly account's scheduling URL); NEXT_PUBLIC_BOOK_CALL_URL overrides it, and an empty
 * string hides the cards.
 */
export const bookCallUrl = process.env.NEXT_PUBLIC_BOOK_CALL_URL ?? "https://calendly.com/revenuenomad";
