import Link from "next/link";
import Arrow from "./Arrow";
import CubeSolid from "./CubeSolid";
import type { Route } from "./content/links";
import "./Assessment.css";

const diagnostic: Route = "/revenue-health-diagnostic";

const layers = [
  { kicker: "Layer 01 · 2 of 7 pillars", title: "What it runs on", text: "Data you can trust and tools that carry the work" },
  { kicker: "Layer 02 · 5 of 7 pillars", title: "How it runs", text: "A team that runs the same way every week" },
  { kicker: "Layer 03 · 7 of 7 pillars", title: "What you see", text: "A forecast the board believes, and AI that pays" },
] as const;

/** The seven pillars (design 4.8), grouped by the layer they belong to. */
const groups = [
  { num: "Layer 01", title: "What it runs on", pillars: ["Data Foundations", "Revenue Technology"] },
  { num: "Layer 02", title: "How it runs", pillars: ["GTM Design", "Operating Rhythm", "Team Enablement"] },
  { num: "Layer 03", title: "What you see", pillars: ["Revenue Insights", "AI"] },
] as const;

/** Section 12: the Revenue Health Assessment. Gold band, the cube solid in three layers, the seven pillars. */
export default function Assessment() {
  return (
    <section className="asmt rn-section" aria-labelledby="asmt-h">
      <div className="rn-wrap">
        <p className="rn-eyebrow asmt-eyebrow">The Revenue Health Assessment</p>
        <h2 id="asmt-h" className="rn-h2 asmt-h">
          Building the GTM foundation
        </h2>
        <p className="asmt-lede">
          Identify the issue.
          <br />
          Build the plan.
          <br />
          Hit the number.
        </p>

        <ol className="asmt-layers">
          {layers.map((l, i) => (
            <li className="asmt-layer" key={l.title}>
              <div className="asmt-cube-box">
                <CubeSolid layer={i as 0 | 1 | 2} className="asmt-solid" />
              </div>
              <p className="asmt-layer-k">{l.kicker}</p>
              <h3 className="asmt-layer-t">{l.title}</h3>
              <p className="asmt-layer-d">{l.text}</p>
            </li>
          ))}
        </ol>

        <div className="asmt-pillars">
          {groups.map((g, gi) => (
            <div className={`asmt-group asmt-group--${gi + 1}`} key={g.title} style={{ flex: g.pillars.length }}>
              <p className="asmt-group-k">
                <span className="asmt-dot" aria-hidden="true" />
                <span className="asmt-group-num">{g.num} - </span>
                {g.title}
              </p>
              <ul className="asmt-pills">
                {g.pillars.map((p) => (
                  <li className="asmt-pill" key={p}>
                    <span className="asmt-bar" aria-hidden="true" />
                    <span className="asmt-pill-label">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="asmt-cta">
          <Link className="rn-link asmt-link" href={diagnostic}>
            See how the assessment works
            <Arrow size={13} />
          </Link>
        </p>
      </div>
    </section>
  );
}
