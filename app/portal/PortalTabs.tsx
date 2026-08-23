"use client";

import { useState } from "react";
import JobBoard from "./JobBoard";
import Prospects from "./Prospects";
import ProfileForm from "./ProfileForm";

type View = "board" | "prospects" | "profile";

export default function PortalTabs() {
  const [view, setView] = useState<View>("board");
  return (
    <>
      <div className="view-switch">
        {(
          [
            ["board", "📋 Job Board"],
            ["prospects", "🎯 Prospects"],
            ["profile", "👤 Profile"],
          ] as [View, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`view-btn ${view === key ? "active" : ""}`}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "board" && <JobBoard />}
      {view === "prospects" && <Prospects />}
      {view === "profile" && <ProfileForm />}
    </>
  );
}
