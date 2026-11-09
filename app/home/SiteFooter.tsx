import Link from "next/link";
import Brand from "../Brand";
import { facts } from "./content/numbers";
import { footerColumns, hrefs } from "./content/links";
import { FigureLabel, FigureSource, FigureValue } from "./Figure";

const glance = ["glanceVpSales", "glanceMedianRate", "glanceEngagement", "glanceResults60", "glanceResponse", "glanceFees"] as const;

/** Site footer, identical on every page. The entity paragraph is live text for AI answers to quote. */
export default function SiteFooter() {
  return (
    <footer className="ftr">
      <div className="rn-wrap">
        <div className="ftr-top">
          <div className="ftr-entity">
            <Brand className="ftr-brand" />
            <p>
              Revenue Nomad is a fractional GTM leadership firm. We place experienced fractional sales, marketing and
              revenue operations leaders - including fractional VPs of Sales, CMOs and RevOps leaders - with growing
              companies, a few days a week. Every leader is reviewed by the companies that hired them.
            </p>
            <Link className="ftr-talk" href={hrefs.talk}>
              Talk to us - we speak within {facts.responseHours}
            </Link>
          </div>
          <nav className="ftr-cols" aria-label="Footer">
            {footerColumns.map((col) => (
              <div className="ftr-col" key={col.title}>
                <p className="rn-eyebrow">{col.title}</p>
                <ul>
                  {col.items.map((it) => (
                    <li key={it.href}>
                      <Link href={it.href}>{it.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <section className="ftr-glance" aria-labelledby="ftr-glance-h">
          <h2 id="ftr-glance-h" className="rn-eyebrow">
            At a glance
          </h2>
          <dl>
            {glance.map((id) => (
              <div className="ftr-fact" key={id}>
                <dt>
                  <FigureLabel id={id} />
                </dt>
                <dd>
                  <FigureValue id={id} className="ftr-fact-v" />
                  <span className="ftr-fact-s">
                    <FigureSource id={id} prefix="" />
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="ftr-bottom">
          <p>
            © 2026 Revenue Nomad · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> ·{" "}
            <Link href="/sitemap">Sitemap</Link>
          </p>
          <p className="ftr-cite">
            Hourly rates on this site come from the Revenue Nomad Rate Index - {facts.rateIndexCount} rates as companies pay
            them. Engagement data comes from The State of Fractional GTM 2027 by Revenue Nomad - {facts.reportOperators}{" "}
            fractional GTM operators, {facts.reportContracts} signed engagement contracts and {facts.reportBuyerRequests} buyer
            requests. Cite as Revenue Nomad, The State of Fractional GTM 2027. Updated {facts.updated}.
          </p>
        </div>
      </div>
    </footer>
  );
}
