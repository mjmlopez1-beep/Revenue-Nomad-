import Link from "next/link";

export default function Home() {
  return (
    <div className="container">
      <nav className="nav">
        <Link href="/" className="brand">
          <span className="brand-mark">R</span> Revenue Nomad
        </Link>
        <div className="nav-links">
          <Link href="/portal">Operator Portal</Link>
        </div>
      </nav>

      <section className="hero">
        <h1>
          Every open <em>fractional GTM</em> role. One board.
        </h1>
        <p>
          Revenue Nomad crawls the web for open fractional, interim, and contract go-to-market
          roles — CROs, CMOs, RevOps leads, growth operators — scores them for relevance, and
          aggregates them into a single operator portal. Stop tab-hopping job boards; start
          picking engagements.
        </p>
        <Link href="/portal" className="btn">
          Open the portal →
        </Link>
      </section>

      <section className="features">
        <div className="feature">
          <h3>🕸️ Multi-source crawler</h3>
          <p>
            Pulls open roles from Remotive, RemoteOK, We Work Remotely, and any Greenhouse board
            you point it at — deduped and refreshed on demand.
          </p>
        </div>
        <div className="feature">
          <h3>🎯 GTM relevance scoring</h3>
          <p>
            Every listing is scored 0–100 for fractional-GTM fit and tagged by function, engagement
            type, and seniority. Noise never reaches the board.
          </p>
        </div>
        <div className="feature">
          <h3>📋 Operator pipeline</h3>
          <p>
            Save roles, mark them applied, or hide them. Filter by function, engagement, source, and
            score to find your next engagement fast.
          </p>
        </div>
      </section>
    </div>
  );
}
