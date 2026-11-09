import Link from "next/link";
import Arrow from "./Arrow";
import RoleWheel from "./RoleWheel";
import { hrefs } from "./content/links";
import "./Hero.css";

/** Hero (Homepage C with the check button): the page's only h1, Talk to us, Take the 2-minute check, See what we solve, and the eight role categories drawn on the glow. */
export default function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-h">
      <div className="rn-wrap hero-inner">
        <div className="hero-copy">
          <p className="rn-eyebrow hero-eyebrow">Fractional revenue leadership</p>
          <h1 id="hero-h" className="rn-h1 hero-h">
            Meet the operators who already solved <em>your revenue problem</em>
            <span className="hero-stop">.</span>
          </h1>
          <p className="rn-lede hero-lede">
            Revenue Nomad is a fractional leadership firm. We place sales, marketing and RevOps leaders who have built
            what you are building.
          </p>
          <div className="hero-actions">
            <Link className="rn-btn" href={hrefs.talk}>
              Talk to us
              <Arrow />
            </Link>
            <Link className="rn-btn rn-btn--ghost" href={hrefs.check}>
              Take the 2-minute check
              <Arrow />
            </Link>
            <Link className="rn-link hero-see" href="#solutions">
              See what we solve
              <Arrow size={13} />
            </Link>
          </div>
        </div>
        <div className="hero-art">
          <span className="hero-glow" aria-hidden="true" />
          <RoleWheel />
        </div>
      </div>
    </section>
  );
}
