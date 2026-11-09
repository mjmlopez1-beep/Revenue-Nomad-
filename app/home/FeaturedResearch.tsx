import Image from "next/image";
import Link from "next/link";
import { requestReport } from "./actions";
import Arrow from "./Arrow";
import { hrefs } from "./content/links";
import "./FeaturedResearch.css";

/** Dark band: the report cover, its title, one email field and the "Read it" button (design 4.1 row 15, 4.6). */
export default function FeaturedResearch() {
  return (
    <section id="research" className="research" aria-labelledby="research-h">
      <div className="rn-wrap research-grid">
        <div className="research-copy">
          <p className="rn-eyebrow research-eyebrow">Featured research</p>
          <h2 id="research-h" className="rn-h2 research-h">
            <Link href={hrefs.report} className="research-title">
              The State of Fractional GTM 2027
            </Link>
          </h2>
          <p className="rn-lede research-lede">Get your copy</p>
          <form className="research-form" action={requestReport}>
            <label htmlFor="research-email" className="rn-sr-only">
              Work email
            </label>
            <input
              id="research-email"
              className="research-input"
              type="email"
              name="email"
              placeholder="Work email"
              autoComplete="email"
              required
            />
            <button type="submit" className="rn-btn research-btn">
              Read it
              <Arrow size={13} />
            </button>
          </form>
          <p className="rn-small research-note">One email opens the full report and sends the PDF.</p>
        </div>
        <div className="research-cover">
          <Image
            src="/home/report-cover.webp"
            alt="The State of Fractional GTM 2027 report"
            width={1200}
            height={734}
            sizes="(max-width: 900px) calc(100vw - 40px), 540px"
          />
        </div>
      </div>
    </section>
  );
}
