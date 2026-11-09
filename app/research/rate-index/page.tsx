import type { Metadata } from "next";
import Link from "next/link";
import rateIndex from "@/data/rate-index.json";
import Arrow from "../../home/Arrow";
import ClosingBand from "../../home/ClosingBand";
import SiteFooter from "../../home/SiteFooter";
import SiteHeader from "../../home/SiteHeader";
import { hrefs } from "../../home/content/links";
import "../../home/home.css";
import "./RateIndex.css";

export const metadata: Metadata = {
  title: "What fractional leaders charge: the Rate Index",
  description:
    "Hourly rates by role category, what a month costs, how the number moves with company size and hours, and how rates are trending. Computed from the research data source behind The Fractional GTM Buyer's Guide 2027.",
  alternates: { canonical: "https://revenuenomad.com/research/rate-index" },
};

const usd = (n: number | null | undefined, opts: { k?: boolean } = {}) => {
  if (n == null) return "-";
  if (opts.k && n >= 1000) return `$${(Math.round(n / 100) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
};
const hr = (n: number | null | undefined) => (n == null ? "-" : `${usd(n)}/hr`);
const month = (n: number | null | undefined) => (n == null ? "-" : `${usd(n)}/month`);
const monthName = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

const d = rateIndex;
const floor = d.rates.publicationFloor;
const published = d.rates.byCategory.filter((c) => c.n >= floor);
const small = d.rates.byCategory.filter((c) => c.n > 0 && c.n < floor);
const asOf = monthName(d.asOf);
const bands = d.engagements.byRevenue.filter((b) => b.band !== "Pre-revenue");
const scaleMin = 80, scaleMax = 400;
const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - scaleMin) / (scaleMax - scaleMin)) * 100))}%`;

/** The Rate Index: every figure comes from data/rate-index.json, built by scripts/build-rate-index.mjs from the research data source. */
export default function RateIndexPage() {
  const seat = (name: string) => d.contracts.bySeat.find((s) => s.seat === name);
  const vp = seat("Sales Director or VP of Sales");
  const cro = seat("CRO and revenue transformation");
  const interim = seat("Interim head of sales");
  const step = bands.find((b) => b.band === "$1M - $5M");
  const stepUp = bands.find((b) => b.band === "$5M - $20M");
  const mv = d.movement;
  return (
    <>
      <SiteHeader />
      <main id="main" className="rix">
        <section className="rix-hero" aria-labelledby="rix-h">
          <div className="rn-wrap">
            <p className="rn-eyebrow">Resources - Rate Index</p>
            <h1 id="rix-h" className="rn-h1">
              What do fractional leaders charge<span className="rix-stop">?</span>
            </h1>
            <p className="rn-lede rix-lede">
              The rates companies paid in our 2026 contracts, an index of {d.rates.all.n} hourly rates across eight role
              categories, and how the monthly number moves with company size and hours. Computed from the same research
              data source as The Fractional GTM Buyer's Guide 2027. Updated {asOf}.
            </p>
            <dl className="rix-kpis">
              <div>
                <dt>Median hourly rate</dt>
                <dd>{hr(d.rates.all.median)}</dd>
                <dd className="rix-kpi-s">
                  middle half {usd(d.rates.all.p25)} to {usd(d.rates.all.p75)}, n={d.rates.all.n}
                </dd>
              </div>
              <div>
                <dt>Median month, $5M to $20M company</dt>
                <dd>{usd(stepUp?.medianMonthly)}</dd>
                <dd className="rix-kpi-s">n={stepUp?.monthlyN} engagements</dd>
              </div>
              <div>
                <dt>Operators who raised their rate</dt>
                <dd>{Math.round((mv.raised / mv.n) * 100)}%</dd>
                <dd className="rix-kpi-s">
                  {mv.held} held, {mv.cut} cut, n={mv.n}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="rix-section" aria-labelledby="rix-contracts-h">
          <div className="rn-wrap">
            <h2 id="rix-contracts-h" className="rn-h2">
              How much does a fractional leader cost per month?
            </h2>
            <p className="rn-body rix-intro">
              What companies paid, rolled up from our {d.contracts.direct} Revenue Nomad contracts in 2026 - ranges by seat,
              never a single deal. As of {asOf}.
            </p>
            <div className="rix-tablewrap" role="region" aria-label="What companies paid, by seat" tabIndex={0}>
              <table className="rix-table">
                <thead>
                  <tr>
                    <th scope="col">Role</th>
                    <th scope="col">Hourly</th>
                    <th scope="col">Hrs / month</th>
                    <th scope="col">Monthly</th>
                    <th scope="col">Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {d.contracts.bySeat
                    .filter((s) => s.hourly || s.monthly)
                    .map((s) => (
                      <tr key={s.seat}>
                        <th scope="row">
                          {s.seat}
                          <span className="rix-sub">{seatNote(s.seat)}</span>
                        </th>
                        <td>{s.hourly ? (s.hourly.min === s.hourly.max ? hr(s.hourly.min) : `${usd(s.hourly.min)} - ${usd(s.hourly.max)}/hr`) : "-"}</td>
                        <td>{s.hours ? (s.hours.min === s.hours.max ? s.hours.min : `${s.hours.min} - ${s.hours.max}`) : "-"}</td>
                        <td>{s.monthly ? `${usd(s.monthly.min, { k: true })} - ${usd(s.monthly.max, { k: true })}/month` : "-"}</td>
                        <td>
                          Our 2026 contracts ({s.contracts})
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="rn-small rix-note">
              Hourly figures are what the company was billed. Hours are the contracted month. The Skaled subcontracting book
              and operator pay are not in these ranges.
            </p>
          </div>
        </section>

        <section className="rix-section rn-band--mist" aria-labelledby="rix-cat-h">
          <div className="rn-wrap">
            <div className="rix-head">
              <h2 id="rix-cat-h" className="rn-h2">
                What is the hourly rate by role category?
              </h2>
              <p className="rn-eyebrow rix-updated">Updated {asOf}</p>
            </div>
            <p className="rn-body rix-intro">
              The middle half of rates (25th to 75th percentile) with the median marked, per role category. Every figure is an
              hourly rate from the Revenue Nomad Rate Index, with the number of rates behind each category beside it.
            </p>
            <ol className="rix-ranges">
              {[...published, ...small].map((c) => (
                <li key={c.category} className={c.n < floor ? "rix-range is-small" : "rix-range"}>
                  <div className="rix-range-label">
                    <b>{c.category}</b>
                    <span>
                      n={c.n}
                    </span>
                  </div>
                  <div className="rix-range-bar" role="img" aria-label={`${c.category}: ${usd(c.p25)} to ${usd(c.p75)} an hour, median ${usd(c.median)}, from ${c.n} rates`}>
                    <span className="rix-range-fill" style={{ left: pct(c.p25 ?? scaleMin), width: `calc(${pct(c.p75 ?? scaleMin)} - ${pct(c.p25 ?? scaleMin)})` }} />
                    <span className="rix-range-med" style={{ left: pct(c.median ?? scaleMin) }} />
                  </div>
                  <div className="rix-range-vals">
                    <span>
                      {usd(c.p25)} - {usd(c.p75)}/hr
                    </span>
                    <b>· {usd(c.median)}</b>
                  </div>
                </li>
              ))}
            </ol>
            <div className="rix-scale" aria-hidden="true">
              <span>{usd(scaleMin)}/hr</span>
              <span>{usd((scaleMin + scaleMax) / 2)}/hr</span>
              <span>{usd(scaleMax)}/hr</span>
            </div>
            <p className="rn-small rix-note">
              Source - the Revenue Nomad Rate Index, {d.rates.all.n} hourly rates: {d.rates.surveyN} from The Fractional GTM Buyer's Guide
              2027 operator survey and {d.rates.platformN} Revenue Nomad platform listings from operators not already in
              the survey. The 2027 report reads its rates from this index.
            </p>
          </div>
        </section>

        <section className="rix-section" aria-labelledby="rix-month-h">
          <div className="rn-wrap">
            <h2 id="rix-month-h" className="rn-h2">
              What a month costs, by role
            </h2>
            <p className="rn-body rix-intro">
              The median monthly spend on a fractional engagement, with the hours behind it. Budget off the monthly number -
              it is what you actually sign.
            </p>
            <ul className="rix-cards">
              {d.engagements.monthlyByCategory
                .filter((c) => c.n >= 5 && c.medianMonthly != null)
                .map((c) => {
                  const cat = d.rates.byCategory.find((x) => x.category === c.category);
                  return (
                    <li key={c.category} className="rix-card">
                      <p className="rn-eyebrow">{c.category}</p>
                      <p className="rix-card-v">
                        {usd(c.medianMonthly)}
                        <span>/month</span>
                      </p>
                      <p className="rn-small">
                        {cat ? `${hr(cat.median)} median rate · ` : ""}about {c.medianHours} hrs a month
                      </p>
                      <p className="rn-small rix-n">n={c.n} engagements with recorded hours</p>
                    </li>
                  );
                })}
            </ul>
            <p className="rn-small rix-note">
              Source - engagements described in The Fractional GTM Buyer's Guide 2027 operator survey; monthly spend is the median
              of hours a month times the effective hourly rate on that engagement. Categories with fewer than five engagements
              are not shown.
            </p>
          </div>
        </section>

        <section className="rix-section rn-band--mist" aria-labelledby="rix-size-h">
          <div className="rn-wrap">
            <h2 id="rix-size-h" className="rn-h2">
              How the number changes with company size
            </h2>
            <p className="rn-body rix-intro">
              Most engagements sit with companies between $1 million and $20 million in revenue. The monthly number moves with
              size, but not in a straight line.
            </p>
            <div className="rix-two">
              <div className="rix-panel">
                <h3 className="rix-h3">Median monthly spend, by client revenue</h3>
                <ol className="rix-bars">
                  {bands.map((b) => (
                    <li key={b.band}>
                      <span className="rix-bar-label">{b.band}</span>
                      <span className="rix-bar-track" role="img" aria-label={`${b.band}: ${usd(b.medianMonthly)} a month, ${b.monthlyN} engagements`}>
                        <span className="rix-bar-fill" style={{ width: `${Math.round(((b.medianMonthly ?? 0) / 12000) * 100)}%` }} />
                      </span>
                      <span className="rix-bar-v">{usd(b.medianMonthly)}</span>
                    </li>
                  ))}
                </ol>
                <p className="rn-small">n={bands.map((b) => b.monthlyN).join(", ")} engagements by band.</p>
              </div>
              <div className="rix-panel">
                <h3 className="rix-h3">Where engagements land</h3>
                <ol className="rix-bars">
                  {d.engagements.byRevenue.map((b) => (
                    <li key={b.band}>
                      <span className="rix-bar-label">{b.band}</span>
                      <span className="rix-bar-track" role="img" aria-label={`${b.band}: ${b.share} percent of engagements`}>
                        <span className="rix-bar-fill rix-bar-fill--leaf" style={{ width: `${b.share * 2.5}%` }} />
                      </span>
                      <span className="rix-bar-v">{b.share}%</span>
                    </li>
                  ))}
                </ol>
                <p className="rn-small">n={d.engagements.byRevenue.reduce((s, b) => s + b.engagements, 0)} engagements.</p>
              </div>
            </div>
            <ul className="rix-reads">
              <li>
                <b>The step is at $5 million.</b> Median spend moves from {usd(step?.medianMonthly)} at $1M to $5M companies to{" "}
                {usd(stepUp?.medianMonthly)} once a company passes $5 million in revenue.
              </li>
              <li>
                <b>It keeps climbing with size.</b> Companies at $20M to $50M pay about {usd(bands.find((b) => b.band === "$20M - $50M")?.medianMonthly)} a
                month and $50M+ companies about {usd(bands.find((b) => b.band === "$50M+")?.medianMonthly)}, where engagements start to look like interim.
              </li>
            </ul>
            <p className="rn-small rix-note">
              Source - The Fractional GTM Buyer's Guide 2027 operator survey, {d.engagements.n} engagements (first and second client);
              monthly spend implied from hours times effective rate. We do not publish hourly rates by company size: spread
              across six bands, cuts fall under our publication floor of {floor}.
            </p>
          </div>
        </section>

        <section className="rix-section" aria-labelledby="rix-hours-h">
          <div className="rn-wrap">
            <h2 id="rix-hours-h" className="rn-h2">
              How hours change the rate
            </h2>
            <p className="rn-body rix-intro">
              The hourly rate eases as hours rise, but the monthly number climbs steadily. A leader at 60 hours or more
              typically runs {usd(d.engagements.byHours.find((h) => h.band === "60+")?.typicalMonth)} a month.
            </p>
            <div className="rix-tablewrap" role="region" aria-label="Rates by hours a month" tabIndex={0}>
              <table className="rix-table">
                <thead>
                  <tr>
                    <th scope="col">Hours a month</th>
                    <th scope="col">Median rate</th>
                    <th scope="col">Middle half</th>
                    <th scope="col">Typical month</th>
                    <th scope="col">n</th>
                  </tr>
                </thead>
                <tbody>
                  {d.engagements.byHours.map((h) => (
                    <tr key={h.band}>
                      <th scope="row">{h.band}</th>
                      <td>{hr(h.median)}</td>
                      <td>
                        {usd(h.p25)} - {usd(h.p75)}
                      </td>
                      <td>{usd(h.typicalMonth)}</td>
                      <td>{h.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="rix-reads">
              <li>
                <b>Senior scope does not discount.</b> In our own contracts, the median billed rate is {hr(d.contracts.hourly.median)} (middle half{" "}
                {usd(d.contracts.hourly.p25)} to {usd(d.contracts.hourly.p75)}, n={d.contracts.hourly.n}). The rate softens with hours mostly in
                operator-reported data, not in what companies sign for senior leaders.
              </li>
              <li>
                <b>Most engagements extend.</b> {d.engagements.extendedShare}% of the engagements operators described were extended past the
                initial term (n={d.engagements.extendedN}), and {d.engagements.resultInside60}% showed a first measurable result inside 60 days
                (n={d.engagements.ttrN}).
              </li>
            </ul>
            <p className="rn-small rix-note">
              Source - engagements described in The Fractional GTM Buyer's Guide 2027 operator survey with recorded hours and an
              effective rate; typical month is the median of rate times hours. Contract figures from Revenue Nomad direct
              agreements.
            </p>
          </div>
        </section>

        <section className="rix-section rn-band--mist" aria-labelledby="rix-move-h">
          <div className="rn-wrap">
            <h2 id="rix-move-h" className="rn-h2">
              How rates are moving
            </h2>
            <p className="rn-body rix-intro">A healthy market, not a frothy one. Rates are rising with demand, and demand is up but not wild.</p>
            <ul className="rix-cards rix-cards--4">
              <li className="rix-card">
                <p className="rix-card-v">+{mv.medianChangePct}%</p>
                <p className="rn-small">Median change in operators&apos; list rates, year over year (n={mv.n})</p>
              </li>
              <li className="rix-card">
                <p className="rix-card-v">
                  {mv.raised} · {mv.held} · {mv.cut}
                </p>
                <p className="rn-small">Operators who raised, held or cut their rate over the year</p>
              </li>
              <li className="rix-card">
                <p className="rix-card-v">{Math.round((mv.plan.raise / mv.plan.n) * 100)}%</p>
                <p className="rn-small">
                  Plan to raise in the next six months - {Math.round((mv.plan.hold / mv.plan.n) * 100)}% plan to hold (n={mv.plan.n})
                </p>
              </li>
              <li className="rix-card">
                <p className="rix-card-v">{Math.round((mv.demand.up / mv.demand.n) * 100)}%</p>
                <p className="rn-small">
                  Say demand is up from a year ago - {Math.round((mv.demand.flat / mv.demand.n) * 100)}% flat, {Math.round((mv.demand.down / mv.demand.n) * 100)}% down
                  (n={mv.demand.n})
                </p>
              </li>
            </ul>
            <p className="rn-small rix-note">
              Source - The Fractional GTM Buyer's Guide 2027 operator survey. Rate change from operators who gave both a current and a
              prior-year rate. 2027 is the baseline year; every figure here is reported against it next edition.
            </p>
          </div>
        </section>

        <section className="rix-section" aria-labelledby="rix-faq-h">
          <div className="rn-wrap">
            <h2 id="rix-faq-h" className="rn-h2">
              Common questions
            </h2>
            <dl className="rix-faq">
              <div>
                <dt>What does a fractional VP of Sales cost?</dt>
                <dd>
                  In our 2026 contracts, {vp?.hourly ? `${usd(vp.hourly.min)} - ${usd(vp.hourly.max)}/hr` : "-"} at {vp?.hours ? `${vp.hours.min} to ${vp.hours.max}` : "-"} hours a month -{" "}
                  {vp?.monthly ? `${usd(vp.monthly.min, { k: true })} - ${usd(vp.monthly.max, { k: true })}/month` : "-"} for a director or VP running a team under 5 to 8 reps.
                  No fees for companies: that is the price.
                </dd>
              </div>
              <div>
                <dt>What does a CRO or a revenue transformation cost?</dt>
                <dd>
                  {cro?.hourly ? `${usd(cro.hourly.min)} - ${usd(cro.hourly.max)}/hr` : "-"} at {cro?.hours ? `${cro.hours.min} to ${cro.hours.max}` : "-"} hours a month -{" "}
                  {cro?.monthly ? `${usd(cro.monthly.min, { k: true })} - ${usd(cro.monthly.max, { k: true })}/month` : "-"} in our 2026 contracts, for a leader who owns the number, the team or a full rebuild.
                </dd>
              </div>
              <div>
                <dt>What does interim cover cost?</dt>
                <dd>
                  An interim head of sales in the seat four days a week billed {interim?.hourly ? hr(interim.hourly.min) : "-"} at{" "}
                  {interim?.hours ? `${interim.hours.min} to ${interim.hours.max}` : "-"} hours a month, {interim?.monthly ? `${usd(interim.monthly.min, { k: true })} - ${usd(interim.monthly.max, { k: true })}/month` : "-"}. It is a
                  different product from fractional leadership, with a different price.
                </dd>
              </div>
              <div>
                <dt>Why do rates vary so much?</dt>
                <dd>
                  Company size and scope. Median monthly spend steps from {usd(step?.medianMonthly)} at $1M to $5M companies to {usd(stepUp?.medianMonthly)} at $5M to $20M,
                  and the middle half of hourly rates runs from {usd(d.rates.all.p25)} for execution work to {usd(d.rates.all.p75)} for senior scopes.
                </dd>
              </div>
            </dl>
            <p className="rn-small rix-note">
              Where these numbers come from - the research data source behind The Fractional GTM Buyer's Guide 2027: the operator
              survey, Revenue Nomad platform listings and Revenue Nomad&apos;s signed 2026 agreements, recomputed on {asOf}.
              Every figure on this page is a median or a range, never a single deal.{" "}
              <Link className="rix-link" href={hrefs.report}>
                Read the guide
                <Arrow size={12} />
              </Link>
            </p>
          </div>
        </section>

        <ClosingBand />
      </main>
      <SiteFooter />
    </>
  );
}

function seatNote(seat: string) {
  return (
    {
      "Sales Director or VP of Sales": "Teams under 5 to 8 reps",
      "CRO and revenue transformation": "Owns the number, the team or a full rebuild",
      "Interim head of sales": "Holds the seat while the search runs",
      "Revenue operations leader": "Hands-on execution to a director cadence",
      "Fractional CMO": "Marketing leadership",
      "Sales enablement lead": "Playbooks, onboarding and coaching",
      "AI GTM lead": "AI in the seller workflow",
      "Revenue Health Diagnostic": "Scorecard, specs and roadmap, scoped to the business",
    } as Record<string, string>
  )[seat];
}
