import Image from "next/image";
import Link from "next/link";
import Arrow from "./Arrow";
import { hrefs } from "./content/links";
import { facts } from "./content/numbers";
import "./Hero.css";

/** Hero (design 4.1, section 2): the page's only h1, two actions and the glass mark on its glow. */
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
            Revenue Nomad is a fractional leadership firm for companies between {facts.companySizeRange} in revenue. We
            place sales, marketing and RevOps leaders who have built what you are building.
          </p>
          <div className="hero-actions">
            <Link className="rn-btn" href={hrefs.talk}>
              Talk to us
              <Arrow />
            </Link>
            <Link className="rn-btn rn-btn--ghost" href="#health-check">
              Take the 2-minute check
              <Arrow />
            </Link>
          </div>
        </div>
        <div className="hero-art">
          <span className="hero-glow" aria-hidden="true" />
          <Image
            className="hero-mark"
            src="/home/glass-mark.webp"
            alt="Revenue Nomad mark in glass"
            width={980}
            height={984}
            priority
            sizes="(max-width: 900px) 255px, 539px"
          />
        </div>
      </div>
    </section>
  );
}
