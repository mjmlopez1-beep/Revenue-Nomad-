"use client";

import { useEffect } from "react";
import JobBoard from "./JobBoard";
import Prospects from "./Prospects";
import ProfileForm from "./ProfileForm";
import { navigate, useLocation } from "../../projects/lib/router";
import { operatorPortal, signInAs, useSession, useStore } from "../../projects/lib/store";

type View = "board" | "prospects" | "profile";
const VIEWS: [View, string][] = [
  ["board", "Job Board"],
  ["prospects", "Prospects"],
  ["profile", "Profile"],
];

export default function PortalTabs() {
  const { query, path } = useLocation();
  const s = useStore();
  const sess = useSession();
  const view = (VIEWS.some(([k]) => k === query.get("view")) ? query.get("view") : "board") as View;

  // Old links into the portal's Projects view now open the operator dashboard.
  useEffect(() => {
    const as = query.get("as");
    if (as) signInAs(as);
    if (query.get("view") === "projects") {
      const project = query.get("project");
      navigate(project ? `/dashboard/projects/${project}` : "/dashboard/projects", { replace: true });
    } else if (as) {
      const q = new URLSearchParams(query);
      q.delete("as");
      navigate(`${path}${q.toString() ? `?${q}` : ""}`, { replace: true });
    }
  }, [query, path]);

  const portal = operatorPortal(s, sess.operatorId);
  const waiting = portal.invited.length;
  const openRoles = portal.openRoles.length;

  return (
    <>
      <div className="view-switch" role="tablist" aria-label="Portal sections">
        {VIEWS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={view === key}
            className={`view-btn ${view === key ? "active" : ""}`}
            onClick={() => navigate(`/portal?view=${key}`)}
            data-testid={`portal-tab-${key}`}
          >
            {label}
          </button>
        ))}
        <button className="view-btn" onClick={() => navigate("/dashboard/projects")} data-testid="portal-tab-projects">
          Projects
          {waiting > 0 && <span className="portal-badge">{waiting}</span>}
        </button>
      </div>
      {view === "board" && (waiting > 0 || openRoles > 0) && (
        <div className="pitch portal-strip" data-testid="projects-strip">
          <span>
            {waiting > 0 ? (
              <>
                <b>
                  {waiting} Revenue Nomad project invite{waiting === 1 ? "" : "s"}
                </b>{" "}
                waiting on you
              </>
            ) : (
              <>
                <b>
                  {openRoles} open Revenue Nomad project{openRoles === 1 ? "" : "s"}
                </b>{" "}
                match your profile
              </>
            )}
            . Respond in about two minutes.
          </span>
          <button type="button" className="action primary" onClick={() => navigate("/dashboard/projects")}>
            Open Projects
          </button>
        </div>
      )}
      {view === "board" && <JobBoard />}
      {view === "prospects" && <Prospects />}
      {view === "profile" && <ProfileForm />}
    </>
  );
}
