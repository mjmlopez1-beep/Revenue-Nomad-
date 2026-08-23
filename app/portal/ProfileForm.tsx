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

// Value/label pairs mirror the Revenue Nomad operator-entry enums.
const STAGES: [string, string][] = [
  ["pre_seed", "Pre-seed"],
  ["seed", "Seed"],
  ["series_a", "Series A"],
  ["series_b", "Series B"],
  ["series_c_plus", "Series C+"],
  ["growth", "Growth"],
];
const EMPLOYEE_SIZES: [string, string][] = [
  ["1_10", "1–10"],
  ["11_50", "11–50"],
  ["51_200", "51–200"],
  ["201_500", "201–500"],
  ["501_1000", "501–1,000"],
  ["1001_plus", "1,001+"],
];
const REVENUE_SIZES: [string, string][] = [
  ["pre_revenue", "Pre-revenue"],
  ["under_1m", "< $1M"],
  ["1m_5m", "$1M–$5M"],
  ["5m_20m", "$5M–$20M"],
  ["20m_50m", "$20M–$50M"],
  ["50m_plus", "$50M+"],
];
const SEGMENTS: [string, string][] = [
  ["smb", "SMB"],
  ["mid_market", "Mid-market"],
  ["enterprise", "Enterprise"],
];
const MOTIONS: [string, string][] = [
  ["plg", "PLG"],
  ["plg_to_sales", "PLG → Sales"],
  ["inside_sales", "Inside sales"],
  ["enterprise_sales", "Enterprise sales"],
  ["channel", "Channel"],
];

type ListKey = "stages" | "employeeSizes" | "revenueSizes" | "segmentFit" | "salesMotions";

export default function ProfileForm() {
  const [profile, setProfile] = useState<OperatorProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    // The browser's copy is authoritative: serverless instances don't share
    // storage, so the server may answer with defaults after a cold start.
    try {
      const raw = localStorage.getItem("rn-profile");
      if (raw) {
        setProfile(JSON.parse(raw));
        return;
      }
    } catch {
      /* fall through to server */
    }
    fetch("/api/profile", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setProfile(data.profile));
  }, []);

  if (!profile) return <div className="empty">Loading profile…</div>;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      localStorage.setItem("rn-profile", JSON.stringify(profile));
    } catch {
      /* private mode — server copy still saved below */
    }
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setSaving(false);
    setMsg(res.ok ? "Profile saved — run a Prospects scan to apply it." : "Save failed.");
  };

  const toggle = (key: ListKey, value: string) =>
    setProfile({
      ...profile,
      [key]: profile[key].includes(value)
        ? profile[key].filter((s) => s !== value)
        : [...profile[key], value],
    });

  const checks = (key: ListKey, options: [string, string][]) => (
    <div className="stage-checks">
      {options.map(([value, label]) => (
        <label key={value} className="check">
          <input
            type="checkbox"
            checked={profile[key].includes(value)}
            onChange={() => toggle(key, value)}
          />
          {label}
        </label>
      ))}
    </div>
  );

  const setList = (key: "industries" | "keywords") => (value: string) =>
    setProfile({ ...profile, [key]: value.split(",").map((s) => s.trim()).filter(Boolean) });

  return (
    <>
      <div className="portal-head">
        <div>
          <h1>Operator Profile</h1>
          <div className="sub">
            Mirrors your Revenue Nomad profile. The prospect engine deduces your ICP from these
            fields and cross-references it against a universal company dataset — target accounts
            are discovered automatically, no manual list needed.
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
          <span>Role category</span>
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
          <span>Industries — up to 7, comma-separated</span>
          <input
            value={profile.industries.join(", ")}
            onChange={(e) => setList("industries")(e.target.value)}
            placeholder="B2B SaaS, fintech, developer tools"
          />
        </label>
        <div className="field">
          <span>Company stages</span>
          {checks("stages", STAGES)}
        </div>
        <div className="field">
          <span>Employee size</span>
          {checks("employeeSizes", EMPLOYEE_SIZES)}
        </div>
        <div className="field">
          <span>Revenue size</span>
          {checks("revenueSizes", REVENUE_SIZES)}
        </div>
        <div className="field">
          <span>Segment fit</span>
          {checks("segmentFit", SEGMENTS)}
        </div>
        <div className="field">
          <span>Sales motions</span>
          {checks("salesMotions", MOTIONS)}
        </div>
        <label className="field">
          <span>ICP keywords / fit tags — comma-separated</span>
          <input
            value={profile.keywords.join(", ")}
            onChange={(e) => setList("keywords")(e.target.value)}
            placeholder="AI, outbound, vertical SaaS"
          />
        </label>
      </div>
    </>
  );
}
