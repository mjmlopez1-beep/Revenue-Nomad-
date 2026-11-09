import { facts } from "./content/numbers";
import Link from "next/link";
import { hrefs } from "./content/links";
import { FigureLabel, FigureValue } from "./Figure";
import "./Faq.css";

function Plus() {
  return (
    <svg className="faq-plus" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 1.5v11M1.5 7h11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Section 21: the four questions companies ask first. Native details/summary, two columns above 900px. */
export default function Faq() {
  return (
    <section className="faq" aria-labelledby="faq-h">
      <div className="rn-wrap">
        <p className="rn-eyebrow">Common questions</p>
        <h2 id="faq-h" className="rn-h2">
          What companies ask first
        </h2>
        <div className="faq-list">
          <details className="faq-item">
            <summary>
              What is a fractional revenue leader?
              <Plus />
            </summary>
            <p className="faq-a">
              A senior sales, marketing or RevOps executive who runs the function {facts.daysPerWeek} - on your leadership
              team, accountable for a number, at a fraction of a full-time cost.
            </p>
          </details>
          <details className="faq-item">
            <summary>
              What does a fractional leader cost?
              <Plus />
            </summary>
            <p className="faq-a">
              <FigureValue id="faqPriceRange" /> <FigureLabel id="faqPriceRange" />, from our 2026 data. No fee on top - you
              pay the operator&apos;s rate. <Link href={hrefs.rateIndex}>See the Rate Index</Link>
            </p>
          </details>
          <details className="faq-item">
            <summary>
              How fast can this start?
              <Plus />
            </summary>
            <p className="faq-a">
              We speak within {facts.responseHours} and you meet matched leaders within days - not the two quarters a full-time search
              takes, and with no six-month onboarding after.
            </p>
          </details>
          <details className="faq-item">
            <summary>
              How is this different from consulting?
              <Plus />
            </summary>
            <p className="faq-a">
              Consultants advise from the sidelines. A Revenue Nomad operator sits in your org chart, goes to the board
              meeting and owns the result - with the scoped rigor we kept from our consulting roots.
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
