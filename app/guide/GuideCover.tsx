import Link from "next/link";
import * as f from "./content/figures";
import { guide } from "./content/guide";
import "./GuideCover.css";

/** The guide's cover as a rendered card (Report Redesign palette), so the title on the homepage can never drift from the guide itself. */
export default function GuideCover() {
  return (
    <Link href={guide.path} className="gcov" aria-label={`Open ${guide.title}`}>
      <span className="gcov-top">
        <span className="gcov-pub">{guide.publisher}</span>
        <span className="gcov-ed">First edition</span>
      </span>
      <span className="gcov-title" aria-hidden="true">
        The Fractional GTM Buyer&apos;s Guide <span className="gcov-year">2027</span>
      </span>
      <span className="gcov-sub">
        What companies pay for fractional sales, marketing and RevOps leadership, and how to hire one<span className="gcov-stop">.</span>
      </span>
      <span className="gcov-stats">
        <span>
          <b>{f.headline.contracts}</b> signed contracts
        </span>
        <span>
          <b>{f.rates.n}</b> rates
        </span>
        <span>
          <b>{f.headline.operators}</b> operators
        </span>
      </span>
    </Link>
  );
}
