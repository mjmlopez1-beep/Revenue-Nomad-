import Image from "next/image";
import Link from "next/link";
import Arrow from "./Arrow";
import { hrefs } from "./content/links";
import { FigureValue } from "./Figure";
import "./ForOperators.css";

/** Sample operators shown on the band, with the canvas's illustrative photos (480 by 480) from public/home/people/. */
const samples = [
  { name: "Erin", role: "Fractional Enablement Leader", photo: "sample-erin.webp" },
  { name: "Scott", role: "Fractional VP of RevOps", photo: "sample-scott.webp" },
  { name: "Lionel", role: "Fractional Director of Sales", photo: "sample-lionel.webp" },
];

/**
 * Section 20: the forest band that recruits operators. One action: Join as an operator.
 * Each sample card is a photo card as the artboard draws it: the portrait fills the card, cropped
 * to the top fifth, under a night scrim with the name, role and View profile at the foot.
 */
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
                    <Image
                      className="ops-photo"
                      src={`/home/people/${s.photo}`}
                      alt=""
                      width={480}
                      height={480}
                      sizes="(max-width: 900px) 210px, 196px"
                    />
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
