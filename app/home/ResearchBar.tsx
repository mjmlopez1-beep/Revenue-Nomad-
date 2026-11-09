import { FlagIf } from "./Figure";
import Link from "next/link";
import Arrow from "./Arrow";
import { hrefs, routes } from "./content/links";
import { facts } from "./content/numbers";
import "./ResearchBar.css";

/**
 * One-line research bar above the header (design 4.1, section 0). It has no heading of its own,
 * so it is an aside with a label rather than a section with an h2 placed before the page's h1.
 */
export default function ResearchBar() {
  return (
    <aside className="rbar" aria-label="New research">
      <div className="rn-wrap rbar-row">
        <p className="rbar-lead">
          <span className="rbar-badge">New research</span>
          <span className="rbar-title">
            {routes[hrefs.report]}
            <span className="rbar-detail">
              {" "}
              - <FlagIf id="researchSample">{facts.reportOperators} operators, {facts.reportContracts} signed contracts, {facts.reportBuyerRequests} buyer
              requests</FlagIf>
            </span>
          </span>
        </p>
        <Link className="rbar-link" href={hrefs.report}>
          <span>
            Read<span className="rbar-long"> the findings</span>
          </span>
          <Arrow size={12} />
        </Link>
      </div>
    </aside>
  );
}
