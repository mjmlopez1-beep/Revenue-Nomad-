import { subscribe } from "./actions";
import Arrow from "./Arrow";
import "./Newsletter.css";

/** Newsletter card: one email field, "Subscribe" and the consent line (design 4.1 row 17, 4.6). */
export default function Newsletter() {
  return (
    <section id="newsletter" className="newsletter" aria-labelledby="newsletter-h">
      <div className="rn-wrap">
        <div className="newsletter-card">
          <div className="newsletter-copy">
            <h2 id="newsletter-h" className="newsletter-h">
              New research and rate updates, once a month
            </h2>
            <p className="rn-body newsletter-body">
              What fractional leaders charge, what is working and what we are seeing in the field. No spam, one click
              to leave.
            </p>
          </div>
          <form className="newsletter-form" action={subscribe}>
            <label htmlFor="newsletter-email" className="rn-sr-only">
              Work email
            </label>
            <input
              id="newsletter-email"
              className="newsletter-input"
              type="email"
              name="email"
              placeholder="Work email"
              autoComplete="email"
              required
            />
            <button type="submit" className="rn-btn newsletter-btn">
              Subscribe
              <Arrow size={12} />
            </button>
            <p className="rn-small newsletter-consent">Once a month. One click to leave.</p>
          </form>
        </div>
      </div>
    </section>
  );
}
