import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "../home/SiteFooter";
import SiteHeader from "../home/SiteHeader";
import { hrefs } from "../home/content/links";
import { facts } from "../home/content/numbers";
import Check from "./Check";
import "../home/home.css";

export const metadata: Metadata = {
  title: "The 2-minute revenue health check",
  description:
    "Eight quick questions: where the company is today, then one per pillar of the Revenue Health Assessment. See where your revenue engine is weak, read against companies your size, and the two things to fix first.",
  alternates: { canonical: "https://revenuenomad.com/check" },
};

export default function CheckPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="chk">
        <div className="rn-wrap">
          <div className="chk-intro">
            <p className="rn-eyebrow">Free revenue health check</p>
            <h1 className="rn-h1">
              Score your revenue engine <em>in 2 minutes</em>
            </h1>
            <p className="rn-lede">
              Eight quick questions: where the company is today, then one per pillar. You get a score for each, the two to fix first for a company your size,
              and how companies like yours fixed them. No call needed.{" "}
              <Link className="chk-intro-link" href={hrefs.talk}>
                Prefer to talk? We speak within {facts.responseHours}.
              </Link>
            </p>
          </div>
          <Check />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
