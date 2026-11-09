import Link from "next/link";
import Brand from "./Brand";
import GlassHero from "./GlassHero";

export default function Home() {
  return (
    <>
      <header className="glass-hero">
        <GlassHero />
        <div className="glass-hero-fade" aria-hidden="true" />
        <div className="container glass-hero-inner">
          <nav className="nav nav-on-glass">
            <Brand />
            <div className="nav-links">
              <Link href="/portal">Operator Portal</Link>
            </div>
          </nav>

          <section className="hero">
            <p className="hero-kicker">Fractional GTM, aggregated</p>
            <h1>
              Every open <em>fractional GTM</em> role. One board.
            </h1>
            <p>
              Revenue Nomad crawls the web for open fractional, interim, and contract go-to-market
              roles — CROs, CMOs, RevOps leads, growth operators — scores them for relevance, and
              aggregates them into a single operator portal. Stop tab-hopping job boards; start
              picking engagements.
            </p>
            <div className="hero-actions">
              <Link href="/portal" className="btn">
                Open the portal →
              </Link>
              <a href="#features" className="btn btn-ghost">
                How it works
              </a>
            </div>
          </section>
        </div>
      </header>

      <main className="container">
        <section className="features" id="features">
          <div className="feature">
            <h3>Boards + communities</h3>
            <p>
              Pulls open roles from job boards (Remotive, RemoteOK, We Work Remotely, fractionaljobs.io,
              Greenhouse) and community leads from Hacker News and Reddit — founders talking about
              fractional GTM help before it ever hits a board.
            </p>
          </div>
          <div className="feature">
            <h3>Truly fractional only</h3>
            <p>
              Every item must show a real fractional signal — fractional/interim wording, ≤4 days a
              week, hourly pricing, or a contract term. Full-time roles are filtered out, and
              commitment, rate, and term are extracted onto each card.
            </p>
          </div>
          <div className="feature">
            <h3>Predictive prospecting</h3>
            <p>
              Set your ICP once and the engine flags companies to reach out to <em>before</em> they
              post a role — fresh funding, a departed GTM leader, teams hiring without leadership, or
              a stalled content engine — each with evidence and a suggested pitch.
            </p>
          </div>
          <div className="feature">
            <h3>Operator pipeline</h3>
            <p>
              Save roles, queue outreach, track contacted accounts. Filter by function, engagement,
              source, and score to find your next engagement fast.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
