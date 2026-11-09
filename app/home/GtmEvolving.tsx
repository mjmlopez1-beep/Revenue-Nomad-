import { FigureLabel, FigureSource, FigureValue } from "./Figure";
import type { NumberKey } from "./content/numbers";
import "./GtmEvolving.css";

/** Artboard section 07: four sourced third-party statistics beside the three "How we work" points. */
const stats: NumberKey[] = ["buyingDoneBeforeContact", "preferredVendorAtContact", "repFreePreference", "buyingGroupSize"];

const points = [
  { n: "01", title: "On your leadership team", body: "An embedded operator has the authority to change things." },
  {
    n: "02",
    title: "They have solved this before",
    body: "No learning curve and instant credibility - teams follow someone who has done it before.",
  },
  {
    n: "03",
    title: "Fix the biggest leak first",
    body: "Consulting discipline - find the leaks with the most lift, fix those, move on to the next.",
  },
];

export default function GtmEvolving() {
  return (
    <section className="gtm rn-band--dark" aria-labelledby="gtm-h">
      <div className="rn-wrap gtm-grid">
        <div className="gtm-shift">
          <p className="rn-eyebrow gtm-eyebrow">GTM is evolving</p>
          <h2 id="gtm-h" className="rn-h2 gtm-h">
            Buyer preference has shifted while we are still selling the same way
          </h2>
          <ul className="gtm-stats">
            {stats.map((id) => (
              <li key={id} className="gtm-stat">
                <div className="gtm-stat-row">
                  <FigureValue id={id} className="gtm-stat-v" />
                  <span className="gtm-stat-l">
                    <FigureLabel id={id} />
                  </span>
                </div>
                <p className="gtm-stat-src">
                  <FigureSource id={id} />
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div className="gtm-how">
          <p className="gtm-how-label">How we work</p>
          <ol className="gtm-points">
            {points.map((p) => (
              <li key={p.n} className="gtm-point">
                <span className="gtm-point-n" aria-hidden="true">
                  {p.n}
                </span>
                <div className="gtm-point-text">
                  <h3 className="gtm-point-title">{p.title}</h3>
                  <p className="gtm-point-body">{p.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
