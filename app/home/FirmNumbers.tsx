import { FigureLabel, FigureValue } from "./Figure";
import "./FirmNumbers.css";

const figures = ["operatorsInNetwork", "wouldHireAgain", "researchSample", "responseTime"] as const;

/** Four firm numbers under the hero (design 4.1, section 3). Values and labels come from numbers.ts. */
export default function FirmNumbers() {
  return (
    <section className="fnum" aria-labelledby="fnum-h">
      <div className="fnum-inner">
        <div className="rn-wrap">
          <h2 id="fnum-h" className="rn-sr-only">
            Revenue Nomad in numbers
          </h2>
          <ul className="fnum-list">
            {figures.map((id) => (
              <li className="fnum-item" key={id}>
                <FigureValue id={id} className="fnum-v" />
                <span className="fnum-l">
                  <FigureLabel id={id} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
