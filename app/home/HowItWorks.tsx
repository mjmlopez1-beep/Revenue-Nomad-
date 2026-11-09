import Link from "next/link";
import Arrow from "./Arrow";
import { hrefs } from "./content/links";
import { facts } from "./content/numbers";
import "./HowItWorks.css";

type Step = { n: string; title: string; body: React.ReactNode };

/** Three steps. Copy from the content appendix, section 10; figures from numbers.ts facts. */
const steps: Step[] = [
  {
    n: "01",
    title: "Tell us the problem",
    body: <>One conversation - no login, no fee. We speak within {facts.responseHours}.</>,
  },
  {
    n: "02",
    title: "Meet matched fractional operators",
    body: "Two or three leaders who have run your play - each with reviews from the companies that hired them. Intro calls within days, not weeks.",
  },
  {
    n: "03",
    title: "Start on clear terms",
    body: (
      <>
        Scope, hours and rate in writing before anyone starts. A first term of {facts.firstTerm}, then{" "}
        {facts.noticePeriod} notice.
      </>
    ),
  },
];

/**
 * "How it works": the dark band with three gold-numbered steps, "No fees for companies."
 * and one Talk to us button (design 4.1, row 9). Gold sits on the dark surface only.
 * The artboard's looping background video is dropped: no asset, and nothing to pause.
 */
export default function HowItWorks() {
  return (
    <section className="how rn-section rn-band--dark" aria-labelledby="how-h">
      <div className="rn-wrap how-layout">
        <div className="how-intro">
          <p className="rn-eyebrow how-eyebrow">How it works</p>
          <h2 id="how-h" className="rn-h2 how-h2">
            From a first call to start date
          </h2>
          <p className="how-note">No fees for companies.</p>
        </div>
        <ol className="how-steps">
          {steps.map((s) => (
            <li key={s.n} className="how-step">
              <span className="how-num" aria-hidden="true">
                {s.n}
              </span>
              <h3 className="how-title">{s.title}</h3>
              <p className="how-body">{s.body}</p>
              <span className="how-tail" aria-hidden="true">
                <Arrow size={18} />
              </span>
            </li>
          ))}
        </ol>
        <div className="how-cta">
          <Link className="rn-btn how-btn" href={hrefs.talk}>
            Talk to us
            <Arrow />
          </Link>
        </div>
      </div>
    </section>
  );
}
