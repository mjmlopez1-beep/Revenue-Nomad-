import Link from "next/link";
import Arrow from "./Arrow";
import Avatar from "./Avatar";
import { hrefs } from "./content/links";
import { FigureLabel, FigureValue } from "./Figure";
import "./ForOperators.css";

/** Sample operators shown on the band. Initials until approved photos exist (design decision A5). */
const samples = [
  { name: "Erin", role: "Fractional Enablement Leader" },
  { name: "Scott", role: "Fractional VP of RevOps" },
  { name: "Lionel", role: "Fractional Director of Sales" },
];

/** Section 20: the forest band that recruits operators. One action: Join as an operator. */
export default function ForOperators() {
  return (
    <section className="ops rn-band--forest" aria-labelledby="ops-h">
      <div className="rn-wrap">
        <div className="ops-grid">
          <div className="ops-copy">
            <p className="rn-eyebrow">For operators</p>
            <h2 id="ops-h" className="rn-h2">
              Join a network that sends you work
            </h2>
            <p className="rn-lede ops-lede">Your profile carries reviews from the companies you led.</p>
            <p className="ops-count">
              <b>
                <FigureValue id="operatorsInNetwork" /> operators
              </b>{" "}
              in the network
            </p>
            <div className="ops-cta">
              <Link className="rn-btn rn-btn--outline-light" href={hrefs.join}>
                Join as an operator
                <Arrow />
              </Link>
            </div>
          </div>
          <div className="ops-side">
            <ul className="ops-cards">
              {samples.map((s) => (
                <li key={s.name}>
                  <Link className="ops-card" href={hrefs.browse}>
                    <Avatar name={s.name} size={72} tone="leaf" />
                    <span className="ops-card-text">
                      <b className="ops-name">{s.name}</b>
                      <span className="ops-role">{s.role}</span>
                      <span className="ops-view">
                        View profile
                        <Arrow size={11} />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="rn-small ops-note">Sample profiles - the live network shows current operators.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
