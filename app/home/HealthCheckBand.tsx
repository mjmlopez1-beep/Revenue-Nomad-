import Link from "next/link";
import Arrow from "./Arrow";
import { FigureLabel, FigureSource, FigureValue } from "./Figure";
import { hrefs } from "./content/links";
import { facts } from "./content/numbers";
import "./HealthCheckBand.css";

/**
 * Free revenue health check band (design 4.1 row 10). Static: the pitch, a preview of question 1 of 7
 * with its answers as a plain list, one primary button to the check page, and the "What it costs"
 * example row with the Rate Index link. The artboard's selects and Next button are drawn, not
 * functional, so nothing here is a control except the two links.
 */

const QUESTION = "Could you name, specifically, what is broken in your revenue function today?";
const ANSWERS = ["Yes - and we know how to fix it", "Yes - but not how to fix it", "We have theories, not evidence", "Honestly, no"];
const HIGHLIGHTED_ANSWER = 2; // the artboard draws the third answer as the picked one
const QUESTION_COUNT = 7;

export default function HealthCheckBand() {
  return (
    <section id="health-check" className="hc rn-section rn-band--mist" aria-labelledby="hc-h">
      <div className="rn-wrap hc-grid">
        <div className="hc-pitch">
          <p className="rn-eyebrow">Free revenue health check</p>
          <h2 id="hc-h" className="rn-h2 hc-h2">
            Score your revenue engine <em>in 2 minutes</em>
          </h2>
          <p className="rn-lede hc-lede">
            Seven questions, one per pillar. You get a score for each, the two to fix first, and how companies like yours fixed them. No call
            needed.
          </p>
          <div className="hc-cta">
            <Link className="rn-btn" href={hrefs.check}>
              Start the check
              <Arrow />
            </Link>
          </div>
          <p className="hc-talk">Prefer to talk? We speak within {facts.responseHours}.</p>
        </div>

        <div className="hc-cards">
          <div className="hc-card hc-question">
            <div className="hc-meta">
              <span>Question 1 of {QUESTION_COUNT}</span>
              <span className="hc-meta-pillar">GTM Design</span>
            </div>
            <div className="hc-progress" aria-hidden="true">
              {Array.from({ length: QUESTION_COUNT }, (_, i) => (
                <span key={i} className={i === 0 ? "hc-progress-on" : undefined} />
              ))}
            </div>
            <p className="hc-q">{QUESTION}</p>
            <ul className="hc-answers">
              {ANSWERS.map((answer, i) => (
                <li key={answer} className={`hc-answer${i === HIGHLIGHTED_ANSWER ? " hc-answer--on" : ""}`}>
                  {answer}
                </li>
              ))}
            </ul>
            <p className="hc-time">About 2 minutes</p>
          </div>

          <div className="hc-card hc-cost">
            <p className="rn-eyebrow hc-cost-eyebrow">What it costs</p>
            <p className="hc-cost-label">
              <FigureLabel id="vpSalesMonthly" />
            </p>
            <p className="hc-cost-value">
              <FigureValue id="vpSalesMonthly" />
            </p>
            <p className="hc-cost-source">
              <FigureSource id="vpSalesMonthly" prefix="" />
            </p>
            <Link className="hc-cost-link" href={hrefs.rateIndex}>
              Open the Rate Index
              <Arrow size={13} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
