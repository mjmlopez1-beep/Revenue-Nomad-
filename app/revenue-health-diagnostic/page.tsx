import type { Metadata } from "next";
import DiagnosticPage from "../diagnostic/DiagnosticPage";
import { meta } from "../diagnostic/content";

/** The Revenue Health Diagnostic. The root layout's title template appends " | Revenue Nomad". */
export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: "https://revenuenomad.com/revenue-health-diagnostic" },
};

export default function Page() {
  return <DiagnosticPage />;
}
