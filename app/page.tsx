import Link from "next/link";
import Brand from "./Brand";
import { loadDb } from "@/lib/store";
import operators from "../projects/seed/operators.json";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = await loadDb().catch(() => ({ jobs: [] as { status?: string }[] }));
  const roles = db.jobs.length;
  const vetted = (operators as unknown[]).length;
  return (
    <div className="container">
      <nav className="nav">
        <Brand />
        <div className="nav-links">
          <Link href="/buyer/projects">Find an operator</Link>
          <Link href="/dashboard">Operator sign in</Link>
        </div>
      </nav>

      <section className="hero">
        <h1>
          Senior <em>go-to-market</em> operators, a few days a week.
        </h1>
        <p>Revenue Nomad matches companies with vetted fractional sales, marketing and RevOps leaders, and gives operators one place to find their next engagement.</p>
      </section>

      <section className="doors">
        <Link href="/buyer/projects" className="door">
          <span className="door-k">For companies</span>
          <b>Hire a fractional operator</b>
          <ul>
            <li>Pick a role template and post in three clicks</li>
            <li>Responses arrive ranked by fit</li>
            <li>Book intro calls in one tap</li>
          </ul>
          <span className="btn">Post a project →</span>
        </Link>
        <Link href="/dashboard" className="door">
          <span className="door-k">For operators</span>
          <b>Find your next engagement</b>
          <ul>
            <li>Invites from clients, respond in two minutes</li>
            <li>Every fractional GTM role on the web, scored for you</li>
            <li>Companies likely to need you, before they post</li>
          </ul>
          <span className="btn btn-ghost">Open your dashboard →</span>
        </Link>
      </section>

      <section className="proof" aria-label="Revenue Nomad in numbers">
        <div>
          <b>{vetted}</b>
          <span>vetted operators</span>
        </div>
        <div>
          <b>{roles}</b>
          <span>fractional GTM roles tracked</span>
        </div>
        <div>
          <b>2 min</b>
          <span>to respond to an invite</span>
        </div>
        <div>
          <b>Daily</b>
          <span>crawl of job boards and communities</span>
        </div>
      </section>
    </div>
  );
}
