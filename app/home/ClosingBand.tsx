import Link from "next/link";
import Arrow from "./Arrow";
import { hrefs } from "./content/links";
import { facts } from "./content/numbers";
import "./ClosingBand.css";

const gets = [
  "A read on where revenue is stuck, from someone who has sat in the seat",
  "Two or three matched leaders, with their rates and company reviews",
  "An honest call on whether fractional fits, or a full-time hire does",
];

function Check() {
  return (
    <svg className="closing-check" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2.5 7.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Section 22: the closing call to action before the footer. One action: Talk to us. */
export default function ClosingBand() {
  return (
    <section className="closing" aria-labelledby="closing-h">
      <div className="rn-wrap">
        <div className="closing-row">
          <div className="closing-copy">
            <h2 id="closing-h" className="rn-h2">
              Tell us where revenue is stuck
            </h2>
            <p className="closing-line">We speak within {facts.responseHours}. No fees for companies.</p>
            <div className="closing-gets">
              <p className="rn-eyebrow closing-kicker">The first call gets you</p>
              <ul>
                {gets.map((g) => (
                  <li key={g}>
                    <Check />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <Link className="rn-btn rn-btn--ghost" href={hrefs.talk}>
            Talk to us
            <Arrow />
          </Link>
        </div>
      </div>
    </section>
  );
}
