import Link from "next/link";
import { guide } from "../guide/content/guide";
import GuideCover from "../guide/GuideCover";
import { requestReport } from "./actions";
import Arrow from "./Arrow";
import { hrefs } from "./content/links";
import "./FeaturedResearch.css";

/** Dark band: the guide cover, its title, one email field and the "Read it" button (design 4.1 row 15, 4.6). */
export default function FeaturedResearch() {
  return (
    <section id="research" className="research" aria-labelledby="research-h">
      <div className="rn-wrap research-grid">
        <div className="research-copy">
          <p className="rn-eyebrow research-eyebrow">Featured research</p>
          <h2 id="research-h" className="rn-h2 research-h">
            <Link href={hrefs.report} className="research-title">
              {guide.title}
            </Link>
          </h2>
          <p className="rn-lede research-lede">{guide.subtitle}</p>
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
          <p className="rn-small research-note">
            One email opens every chapter on this device. Or{" "}
            <Link href={hrefs.report} className="research-preview">
              start with the free chapters
            </Link>
            .
          </p>
        </div>
        <div className="research-cover">
          <GuideCover />
        </div>
      </div>
    </section>
  );
}
