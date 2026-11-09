import type { Metadata } from "next";
import CasesHub from "../cases/CasesHub";
import SiteFooter from "../home/SiteFooter";
import SiteHeader from "../home/SiteHeader";
import "../home/home.css";

export const metadata: Metadata = {
  title: "Case studies | Revenue Nomad",
  description: "Seven engagements, each one real: what the company had, the seat we filled, the work, and what changed, with the basis for every figure.",
  alternates: { canonical: "https://revenuenomad.com/case-studies" },
};

export default function CaseStudiesPage() {
  return (
    <>
      <SiteHeader />
      <CasesHub />
      <SiteFooter />
    </>
  );
}
