import Image from "next/image";
import Link from "next/link";
import Arrow from "../home/Arrow";
import ClosingBand from "../home/ClosingBand";
import { FigureLabel, FigureSource, FigureValue } from "../home/Figure";
import { facts } from "../home/content/numbers";
import { hrefs } from "../home/content/links";
import { pillarLabel, pillars as allPillars } from "../check/content";
import ProblemMotif from "./ProblemMotif";
import type { Solution } from "./content";
import "./Solution.css";

/** The hero art is 520px wide at 1440 and full width on phones. */
const ART_SIZES = "(max-width: 900px) calc(100vw - 40px), 520px";

const two = (n: number) => String(n).padStart(2, "0");

/**
 * Shared template for the four "Solve a problem" pages, in artboard order: hero with art, the checklist card,
 * data, why (night band with the motif), the fix with its pillars strip, the method (forest band), the
 * comparison, results, common questions, the closing band. Visual treatment in docs/specs/solution-pages.md.
 */
export default function SolutionPage({ s }: { s: Solution }) {
  return (
    <main id="main" className="sol-page">
      <section className="solp-hero" aria-labelledby="solp-h">
        <div className="rn-wrap solp-hero-grid">
          <div className="solp-hero-copy">
            <p className="rn-eyebrow">{s.eyebrow}</p>
            <h1 id="solp-h" className="rn-h1 solp-h1">
              {s.title}
              <span className="solp-stop">.</span>
            </h1>
            <p className="rn-lede solp-lede">{s.lede}</p>
            <div className="solp-actions">
              <Link className="rn-btn" href={hrefs.talk}>
                Talk to us
                <Arrow />
              </Link>
              <a className="rn-btn rn-btn--ghost" href="#fix">
                See the fix
              </a>
            </div>
            <p className="rn-small solp-fine">We speak within {facts.responseHours} - no fees for companies</p>
          </div>
          {s.art && (
            <div className="solp-art" aria-hidden="true">
              <Image
                className="solp-art-img"
                src={`/home/cards/${s.art.file}`}
                alt=""
                width={s.art.width}
                height={s.art.height}
                sizes={ART_SIZES}
                priority
                style={s.art.position ? { objectPosition: s.art.position } : undefined}
              />
              <span className="solp-art-rule" />
            </div>
          )}
        </div>
      </section>

      <section className="solp-signs-band" aria-labelledby="solp-signs-h">
        <div className="rn-wrap">
          <div className="solp-signs">
            <div className="solp-signs-head">
              <p className="rn-eyebrow">{s.signsTitle}</p>
              <h2 id="solp-signs-h" className="solp-signs-h">
                Check the signs that fit
              </h2>
            </div>
            <ul className="solp-signs-list">
              {s.signs.map((sign) => (
                <li key={sign}>
                  <span className="solp-check" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <path d="M2.5 6.5l2.2 2.2L9.5 3.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {sign}
                </li>
              ))}
            </ul>
            {s.signsNote && <p className="solp-signs-note">{s.signsNote}</p>}
          </div>
        </div>
      </section>

      {s.stats && (
        <section className="solp-section rn-band--mist solp-stats" aria-labelledby="solp-stats-h">
          <div className="rn-wrap">
            <p className="rn-eyebrow">The data</p>
            <h2 id="solp-stats-h" className="rn-h2 solp-h2">
              {s.stats.heading}
            </h2>
            <ul className="solp-bigstats">
              {s.stats.items.map((it, i) => (
                <li key={i}>
                  <p className="solp-big-v">
                    <span className="solp-big-u">{it.id ? <FigureValue id={it.id} /> : it.value}</span>
                  </p>
                  <p className="rn-body">{it.label}</p>
                  {it.id && (
                    <p className="rn-small solp-stat-s">
                      <FigureSource id={it.id} />
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="rn-small solp-note">{s.stats.source}</p>
          </div>
        </section>
      )}

      <section className="solp-section rn-band--dark solp-why" aria-labelledby="solp-why-h">
        <div className="rn-wrap">
          <div className="solp-why-grid">
            <div>
              <p className="rn-eyebrow solp-why-eyebrow">Why it happens</p>
              <h2 id="solp-why-h" className="rn-h2 solp-h2 solp-why-h">
                {s.why.statement}
              </h2>
            </div>
            {s.motif && (
              <div className="solp-why-art">
                <ProblemMotif motif={s.motif} />
              </div>
            )}
          </div>
          <ol className="solp-reasons">
            {s.why.reasons.map((r, i) => (
              <li key={r.title}>
                <span className="solp-reason-n" aria-hidden="true">
                  {two(i + 1)}
                </span>
                <h3>{r.title}</h3>
                <p className="solp-reason-body">{r.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="fix" className="solp-section solp-fixband" aria-labelledby="solp-fix-h">
        <div className="rn-wrap">
          <p className="rn-eyebrow">The fix</p>
          <h2 id="solp-fix-h" className="rn-h2 solp-h2">
            The fix we place
          </h2>
          <p className="rn-body solp-intro">{s.fixIntro}</p>
          <div className="solp-fixes">
            {s.fixes.map((f, i) => (
              <article key={f.title} className={i === 0 ? "solp-fix is-primary" : "solp-fix"}>
                <div className="solp-fix-art">
                  <span className="solp-fix-brand">Revenue Nomad</span>
                  <span className="solp-fix-kicker">{f.kicker}</span>
                </div>
                <div className="solp-fix-body">
                  <h3>{f.title}</h3>
                  <p className="rn-body">{f.body}</p>
                  <p className="solp-price">
                    {f.price}
                    <span> - {f.priceNote}</span>
                  </p>
                  <Link className={i === 0 ? "rn-btn" : "rn-link"} href={f.href}>
                    {f.cta}
                    <Arrow />
                  </Link>
                </div>
              </article>
            ))}
          </div>
          {s.pillars && s.pillars.length > 0 && (
            <div className="solp-pillars">
              <p className="rn-eyebrow">Pillars this touches</p>
              <ul className="solp-pillar-list">
                {s.pillars.map((p) => (
                  <li key={p}>
                    <Link className="solp-pillar" href="/revenue-health-diagnostic">
                      <span className="solp-pillar-n" aria-hidden="true">
                        {two(allPillars.indexOf(p) + 1)}
                      </span>
                      <span className="rn-sr-only">Pillar {allPillars.indexOf(p) + 1} of 7, </span>
                      {pillarLabel[p]}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="rn-small solp-pillars-line">The Diagnostic scores these first.</p>
            </div>
          )}
        </div>
      </section>

      {s.steps && (
        <section className="solp-section rn-band--forest solp-method" aria-labelledby="solp-steps-h">
          <div className="rn-wrap solp-method-grid">
            <div className="solp-method-intro">
              <p className="rn-eyebrow">How outbound works now</p>
              <h2 id="solp-steps-h" className="rn-h2 solp-h2">
                {s.steps.heading}
              </h2>
              <p className="rn-body solp-intro">{s.steps.intro}</p>
              <p className="rn-small solp-note solp-method-note">{s.steps.note}</p>
            </div>
            <ol className="solp-steps">
              {s.steps.items.map((st) => (
                <li key={st.n}>
                  <span className="solp-step-n" aria-hidden="true">
                    {st.n}
                  </span>
                  <div>
                    <p className="rn-eyebrow solp-step-kicker">{st.kicker}</p>
                    <h3>{st.title}</h3>
                    <p className="solp-step-body">{st.body}</p>
                    {st.result && <p className="solp-step-result">{st.result}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {s.comparison && (
        <section className="solp-section rn-band--mist" aria-labelledby="solp-cmp-h">
          <div className="rn-wrap">
            <p className="rn-eyebrow">Then and now</p>
            <h2 id="solp-cmp-h" className="rn-h2 solp-h2">
              {s.comparison.heading}
            </h2>
            <p className="rn-body solp-intro">{s.comparison.intro}</p>
            <div className="solp-tablewrap" role="region" aria-label={s.comparison.heading} tabIndex={0}>
              <table className="solp-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="rn-sr-only">Dimension</span>
                    </th>
                    <th scope="col" className="is-now">
                      {s.comparison.now}
                    </th>
                    <th scope="col">{s.comparison.then}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.comparison.rows.map((r) => (
                    <tr key={r.k}>
                      <th scope="row">{r.k}</th>
                      <td className="is-now">{r.now}</td>
                      <td>{r.then}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {s.results && (
        <section className="solp-section solp-results" aria-labelledby="solp-res-h">
          <div className="rn-wrap">
            <p className="rn-eyebrow">Results</p>
            <h2 id="solp-res-h" className="rn-h2 solp-h2">
              {s.results.heading}
            </h2>
            <ul className="solp-bigstats">
              {s.results.items.map((it) => (
                <li key={it.id}>
                  <p className="solp-big-v">
                    <span className="solp-big-u">
                      <FigureValue id={it.id} />
                    </span>
                  </p>
                  <p className="rn-body">
                    {it.label} <b>{it.company}</b>
                  </p>
                  <p className="rn-small solp-stat-s">
                    <FigureSource id={it.id} />
                  </p>
                </li>
              ))}
            </ul>
            <p className="rn-small solp-note">
              {s.results.note}{" "}
              <Link className="solp-inline" href={hrefs.caseStudies}>
                Read the case studies
              </Link>
            </p>
          </div>
        </section>
      )}

      <section className="solp-section rn-band--mist" aria-labelledby="solp-faq-h">
        <div className="rn-wrap">
          <p className="rn-eyebrow">Common questions</p>
          <h2 id="solp-faq-h" className="rn-h2 solp-h2">
            What companies ask first
          </h2>
          <dl className="solp-faq">
            {s.faqs.map((f) => (
              <div key={f.q}>
                <dt>{f.q}</dt>
                <dd>
                  {f.a}
                  {/Rate Index/.test(f.a) && (
                    <>
                      {" "}
                      <Link className="solp-inline" href={hrefs.rateIndex}>
                        Open the Rate Index
                      </Link>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <ClosingBand />
    </main>
  );
}

// Re-exported so pages can render a stat's label without importing Figure directly.
export { FigureLabel };
