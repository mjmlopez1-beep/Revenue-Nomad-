"use client";

import { useEffect, useState } from "react";
import type { OperatorProfile, OperatorRole } from "@/lib/types";

const ROLES: OperatorRole[] = [
  "Sales Leadership",
  "Marketing",
  "Revenue Operations",
  "Sales Enablement",
  "Customer Success",
  "AI GTM",
  "Partnerships",
  "Sellers",
];

const STAGES = ["Pre-seed", "Seed", "Series A", "Series B", "Series C+"];

export default function ProfileForm() {
  const [profile, setProfile] = useState<OperatorProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [watchlistText, setWatchlistText] = useState("");

  useEffect(() => {
    fetch("/api/profile", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setProfile(data.profile);
        setWatchlistText(
          (data.profile.watchlist || [])
            .map((w: { company: string; domain?: string }) =>
              w.domain ? `${w.company}, ${w.domain}` : w.company
            )
            .join("\n")
        );
      });
  }, []);

  if (!profile) return <div className="empty">Loading profile…</div>;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const watchlist = watchlistText
      .split("\n")
      .map((line) => {
        const [company, domain] = line.split(",").map((s) => s.trim());
        return company ? { company, domain: domain || undefined } : null;
      })
      .filter(Boolean);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...profile, watchlist }),
    });
    setSaving(false);
    setMsg(res.ok ? "Profile saved — run a Prospects scan to apply it." : "Save failed.");
  };

  const setList = (key: "industries" | "keywords") => (value: string) =>
    setProfile({ ...profile, [key]: value.split(",").map((s) => s.trim()).filter(Boolean) });

  const toggleStage = (stage: string) =>
    setProfile({
      ...profile,
      stages: profile.stages.includes(stage)
        ? profile.stages.filter((s) => s !== stage)
        : [...profile.stages, stage],
    });

  return (
    <>
      <div className="portal-head">
        <div>
          <h1>Operator Profile</h1>
          <div className="sub">
            Mirrors your Revenue Nomad profile — the prospect engine uses this to decide which
            companies fit your ICP and which timing signals matter for your role.
          </div>
        </div>
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>

      {msg && <div className="notice">{msg}</div>}

      <div className="profile-grid">
        <label className="field">
          <span>Name</span>
          <input
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            placeholder="Your name"
          />
        </label>
        <label className="field">
          <span>Headline</span>
          <input
            value={profile.headline}
            onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
            placeholder="e.g. Fractional CRO for PLG SaaS"
          />
        </label>
        <label className="field">
          <span>Role (Revenue Nomad category)</span>
          <select
            value={profile.role}
            onChange={(e) => setProfile({ ...profile, role: e.target.value as OperatorRole })}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>ICP industries (comma-separated)</span>
          <input
            value={profile.industries.join(", ")}
            onChange={(e) => setList("industries")(e.target.value)}
            placeholder="B2B SaaS, fintech, devtools"
          />
        </label>
        <div className="field">
          <span>ICP stages</span>
          <div className="stage-checks">
            {STAGES.map((s) => (
              <label key={s} className="check">
                <input
                  type="checkbox"
                  checked={profile.stages.includes(s)}
                  onChange={() => toggleStage(s)}
                />
                {s}
              </label>
            ))}
          </div>
        </div>
        <label className="field">
          <span>ICP keywords (comma-separated)</span>
          <input
            value={profile.keywords.join(", ")}
            onChange={(e) => setList("keywords")(e.target.value)}
            placeholder="PLG, outbound, enterprise, AI"
          />
        </label>
        <label className="field full">
          <span>Target-account watchlist — one per line: Company, domain.com (domain optional, enables content-gap & careers checks)</span>
          <textarea
            rows={6}
            value={watchlistText}
            onChange={(e) => setWatchlistText(e.target.value)}
            placeholder={"Acme Analytics, acme.com\nNorthwind Devtools, northwind.dev"}
          />
        </label>
      </div>
    </>
  );
}
