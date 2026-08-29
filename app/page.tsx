import Brand from "./Brand";
import LoginPicker from "./LoginPicker";
import { loadDb } from "@/lib/store";
import { publicTeasers } from "@/lib/aggregate";
import { currentOperator } from "@/lib/session";
import { FUNC_LABELS } from "@/lib/config";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const db = await loadDb();
  const op = await currentOperator(db);
  if (op) redirect("/dashboard");
  // Headlines are visible to all; detail requires active status (spec §2.1).
  const teasers = publicTeasers(db);
  const operators = db.operators.map((o) => ({
    id: o.id,
    name: o.name,
    funcLabel: FUNC_LABELS[o.func],
    foundingFifty: o.foundingFifty,
  }));

  return (
    <>
      <div className="container">
        <nav className="nav">
          <Brand />
          <div className="nav-right">
            <a href="/admin">Admin</a>
          </div>
        </nav>
        <section className="hero">
          <h1>
            The market data fractional GTM operators <em>actually crave.</em>
          </h1>
          <p>
            Actual billed retainers — not list rates. Realization rate by function and stage. A weekly
            Demand Index nobody else can compute. You get it by giving it: your numbers go in anonymized,
            the network&apos;s truth comes back out.
          </p>
          <div className="teasers">
            {teasers.map((t) => (
              <div key={t} className="teaser">{t}</div>
            ))}
          </div>
        </section>
        <section className="card" style={{ marginBottom: 40 }}>
          <div className="card-title">
            <h2>Sign in</h2>
            <span className="meta">v1 internal preview — pick your operator profile</span>
          </div>
          <p className="card-sub">
            Production sign-in is a magic link to your RN email. Individual data is never shown to anyone;
            aggregates are medians over cells of 5+ operators.
          </p>
          <LoginPicker operators={operators} />
        </section>
        <footer className="footer">
          Revenue Nomad · The Nomad Benchmark. Credits never affect buyer matching.
        </footer>
      </div>
    </>
  );
}
