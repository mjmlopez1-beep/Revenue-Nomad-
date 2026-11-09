import Link from "next/link";
import { guide } from "./content/guide";
import "./GuideCover.css";

/** The guide's cover as a rendered card, so the title on the homepage can never drift from the guide itself. */
export default function GuideCover() {
  return (
    <Link href={guide.path} className="gcov" aria-label={`Open ${guide.title}`}>
      <span className="gcov-top">
        <span className="gcov-pub">{guide.publisher}</span>
        <span className="gcov-ed">First edition</span>
      </span>
      <span className="gcov-title" aria-hidden="true">
        The Fractional GTM <em>Buyer&apos;s Guide</em> 2027<span className="gcov-stop">.</span>
      </span>
      <span className="gcov-sub">What companies pay for fractional sales, marketing and RevOps leadership, and how to hire one.</span>
      <span className="gcov-stats">
        <span>
          <b>38</b> signed contracts
        </span>
        <span>
          <b>137</b> rates
        </span>
        <span>
          <b>172</b> operators
        </span>
      </span>
    </Link>
  );
}
