import Link from "next/link";
import Arrow from "./Arrow";
import { hrefs, type Route } from "./content/links";
import "./ThreeRoads.css";

type Road = { n: string; title: string; body: string; label: string; href: Route };

/** Artboard section 06 "Which one is you?": three entry points, one link each, and the Rate Index line. */
const roads: Road[] = [
  {
    n: "01",
    title: "Your sales leader just left",
    body: "A team, a number and a seat that is expensive to fill well and far more expensive to fill wrong. An interim leader keeps the team selling while you search.",
    label: "See interim cover",
    href: "/engage/interim",
  },
  {
    n: "02",
    title: "You have been running sales yourself",
    body: "You grew the company through sheer force. Now there are things only you can do, and you need someone who has built what you are building.",
    label: "Scaling beyond founder-led sales",
    href: "/problems/founder-led-sales",
  },
  {
    n: "03",
    title: "You just inherited the number",
    body: "A board or sponsor put you in to fix it, with 60 to 90 days to know whether the pipeline is real. Start with a scored read before you hire.",
    label: "See the Revenue Health Diagnostic",
    href: "/engage/diagnostic",
  },
];

export default function ThreeRoads() {
  return (
    <section className="roads rn-band--mist" aria-labelledby="roads-h">
      <div className="rn-wrap">
        <p className="rn-eyebrow">Which one is you?</p>
        <h2 id="roads-h" className="rn-h2 roads-h">
          Most companies arrive here <em>one of three ways</em>
        </h2>
        <ul className="roads-grid">
          {roads.map((r) => (
            <li key={r.n} className="roads-card">
              <p className="roads-n">Road {r.n}</p>
              <h3 className="roads-title">{r.title}</h3>
              <p className="roads-body">{r.body}</p>
              <p className="roads-go">
                <Link href={r.href} className="rn-link roads-link">
                  {r.label}
                  <Arrow size={13} />
                </Link>
              </p>
            </li>
          ))}
        </ul>
        <p className="roads-cost">
          Just exploring what it costs?{" "}
          <Link href={hrefs.rateIndex} className="roads-cost-link">
            Open the Rate Index
          </Link>
        </p>
      </div>
    </section>
  );
}
