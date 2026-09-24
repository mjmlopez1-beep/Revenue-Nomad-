"use client";

import { useEffect } from "react";
import JobBoard from "./JobBoard";
import Prospects from "./Prospects";
import ProfileForm from "./ProfileForm";
import OperatorProjects, { projectsBadge } from "./projects/OperatorProjects";
import { navigate, useLocation } from "../../projects/lib/router";
import { getSession, operatorPortal, setSession, signInAs, useSession, useStore } from "../../projects/lib/store";

type View = "board" | "projects" | "prospects" | "profile";
const VIEWS: [View, string][] = [
  ["board", "Job Board"],
  ["projects", "Projects"],
  ["prospects", "Prospects"],
  ["profile", "Profile"],
];

export default function PortalTabs() {
  const { query, path } = useLocation();
  const s = useStore();
  const sess = useSession();
  const view = (VIEWS.some(([k]) => k === query.get("view")) ? query.get("view") : "board") as View;

  // Magic links from emails carry ?as=operator:<id>: sign in, then drop it from the URL.
  useEffect(() => {
    const as = query.get("as");
    if (as) {
      signInAs(as);
      const q = new URLSearchParams(query);
      q.delete("as");
      navigate(`${path}?${q.toString()}`, { replace: true });
    }
    if (getSession().role !== "operator") setSession({ role: "operator" });
  }, [query, path]);

  const waiting = projectsBadge(s, sess.operatorId);
  const openRoles = operatorPortal(s, sess.operatorId).openRoles.length;

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
            {key === "projects" && waiting > 0 && (
              <span className="opp-badge" data-testid="projects-badge">
                {waiting}
              </span>
            )}
          </button>
        ))}
      </div>
      {view === "board" && (waiting > 0 || openRoles > 0) && (
        <div className="pitch opp-strip" data-testid="projects-strip">
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
          <button type="button" className="action primary" onClick={() => navigate("/portal?view=projects")}>
            Open Projects
          </button>
        </div>
      )}
      {view === "board" && <JobBoard />}
      {view === "projects" && <OperatorProjects />}
      {view === "prospects" && <Prospects />}
      {view === "profile" && <ProfileForm />}
    </>
  );
}
