/**
 * The landing page's pricing: Free, Pro and Pro + Close in a few rows, framed by return. The rows
 * and plans are the app's own (lib/billing/compare.ts), the prices and the trial the billing rules'
 * (lib/billing/rules.ts), so the page can't say what the plans don't. No rate is cited: the page
 * reads no rate benchmarks (they are for members), so it makes no claim about what a client pays.
 * Flat prices only: no fee on what a member wins.
 */
import { LANDING_ROWS, PLANS } from "@/lib/billing/compare";
import { PRO_STORY, TRIAL_DAYS } from "@/lib/billing/rules";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** The heading: Pro framed as what one client is worth to a fractional. */
export const PRICING_H = "One client pays for years of Pro";

export default function Pricing({ starter, onJoin }: { starter: number; onJoin: () => void }) {
  return (
    <section className="lp-sec lp-price" id="pricing" aria-labelledby="pricing-h">
      <div className="lp-wrap">
        <div className="lp-sec-head lp-sec-head-c">
          <span className="lp-pill lp-pill-pine">Pricing</span>
          <h2 className="lp-h2" id="pricing-h">
            {PRICING_H}
          </h2>
          <p className="lp-lead">{PRO_STORY}</p>
        </div>
        <div className="lp-price-grid">
          {PLANS.map((p) => (
            <div key={p.key} className={`lp-price-plan${p.key === "close" ? " lp-price-pro" : ""}`}>
              <h3 className="lp-price-name">{p.name}</h3>
              <p className="lp-price-n num">
                {usd(p.month)}
                {p.month ? <span> a month</span> : null}
              </p>
              <p className="lp-price-sub num">
                {p.key === "free" ? (
                  <>
                    <span className="num">{starter}</span> credits to start, and 1 for each fact you add.
                  </>
                ) : (
                  <>or {usd(p.year)} a year. {p.line}</>
                )}
              </p>
            </div>
          ))}
        </div>
        <p className="lp-price-trial num">{TRIAL_DAYS}-day trial of Pro + Close, no card. It ends into Free on its own.</p>
        <table className="lp-price-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">What you get</span>
              </th>
              {PLANS.map((p) => (
                <th key={p.key} scope="col">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LANDING_ROWS.map(([what, free, pro, close]) => (
              <tr key={what}>
                <th scope="row">{what}</th>
                <td data-cap="Free">{free}</td>
                <td data-cap="Pro" className="lp-price-procell">
                  {pro}
                </td>
                <td data-cap="Pro + Close" className="lp-price-procell">
                  {close}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="lp-price-go">
          <button type="button" className="btn btn-pine" onClick={onJoin}>
            Start free, with the {TRIAL_DAYS}-day trial
          </button>
        </div>
      </div>
    </section>
  );
}
