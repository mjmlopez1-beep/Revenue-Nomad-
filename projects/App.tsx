"use client";

import { useEffect, type ReactNode } from "react";
import { match, navigate, operatorAlias, useLocation } from "./lib/router";
import { projectById, setSession, signInAs, useSession, useStore } from "./lib/store";
import { ProtoBar, ROLE_HOME, SiteHeader } from "./ui/Shell";
import { BuyerBrief, BuyerDashboard, BuyerIntros, BuyerInvite, BuyerProject, BuyerSelect } from "./ui/buyer/Buyer";
import { LiveAvailability, LiveIntros, LiveOverview, LiveProject, LiveProjects, LiveShell } from "./ui/live/Live";
import { AdminIntros, AdminOperators, AdminProject, AdminReports } from "./ui/admin/Admin";
import { AdminAudit, AdminClients, AdminEngagements, AdminProjectsList, AdminPulse, AdminReviews, AdminShell, AdminShortlist, AdminToday, AdminWizard } from "./ui/admin/Console";
import { ClientShortlist, OperatorDirectory, OperatorProfile } from "./ui/Pages";
import type { Role } from "./lib/types";
import { Empty } from "./ui/common";

type RouteDef = [pattern: string, role: Role | null, render: (p: Record<string, string>) => ReactNode];

const ROUTES: RouteDef[] = [
  ["/buyer/projects", "buyer", () => <BuyerDashboard />],
  ["/buyer/intros", "buyer", () => <BuyerIntros />],
  ["/buyer/projects/:id/edit", "buyer", (p) => <BuyerBrief key={p.id} id={p.id} />],
  ["/buyer/projects/:id/invite", "buyer", (p) => <BuyerInvite id={p.id} />],
  ["/buyer/projects/:id/select/:op", "buyer", (p) => <BuyerSelect id={p.id} opId={p.op} />],
  ["/buyer/projects/:id", "buyer", (p) => <BuyerProject key={p.id} id={p.id} />],
  ["/dashboard", "operator", () => <LiveOverview />],
  ["/dashboard/projects", "operator", () => <LiveProjects />],
  ["/dashboard/projects/:id", "operator", (p) => <LiveProject key={p.id} id={p.id} />],
  ["/dashboard/intros", "operator", () => <LiveIntros />],
  ["/dashboard/availability", "operator", () => <LiveAvailability />],
  ["/admin/today", "admin", () => <AdminToday />],
  ["/admin/projects", "admin", () => <AdminProjectsList />],
  ["/admin/operators", "admin", () => <AdminOperators />],
  ["/admin/clients", "admin", () => <AdminClients />],
  ["/admin/reviews", "admin", () => <AdminReviews />],
  ["/admin/engagements", "admin", () => <AdminEngagements />],
  ["/admin/pulse", "admin", () => <AdminPulse />],
  ["/admin/reports", "admin", () => <AdminReports />],
  ["/admin/audit", "admin", () => <AdminAudit />],
  ["/admin/intros", "admin", () => <AdminIntros />],
  ["/admin/projects/:id/setup", "admin", (p) => <AdminWizard key={p.id} id={p.id} />],
  ["/admin/projects/:id/shortlist", "admin", (p) => <AdminShortlist key={p.id} id={p.id} />],
  ["/admin/projects/:id", "admin", (p) => <AdminProjectRoute key={p.id} id={p.id} />],
  ["/operators", null, () => <OperatorDirectory />],
  ["/operators/:slug", null, (p) => <OperatorProfile slug={p.slug} />],
  ["/client/projects/:id", null, (p) => <ClientShortlist id={p.id} />],
];

// Revenue Nomad projects use the console wizard and pipeline; buyer projects keep the buyer view.
function AdminProjectRoute({ id }: { id: string }) {
  const s = useStore();
  const p = projectById(s, id);
  return p?.origin === "revenue_nomad" ? <AdminWizard id={id} /> : <AdminProject id={id} />;
}

const ADMIN_CRUMBS: [string, string][] = [
  ["/admin/today", "Today"],
  ["/admin/projects", "Projects"],
  ["/admin/intros", "Intro requests"],
  ["/admin/operators", "Operators"],
  ["/admin/clients", "Clients"],
  ["/admin/reviews", "Reviews"],
  ["/admin/engagements", "Engagements"],
  ["/admin/pulse", "Availability pulse"],
  ["/admin/reports", "Analytics"],
  ["/admin/audit", "Audit log"],
];

function AdminCrumb({ path }: { path: string }) {
  const s = useStore();
  const top = ADMIN_CRUMBS.find(([p]) => path === p || path.startsWith(p + "/"));
  const pid = match("/admin/projects/:id", path) || match("/admin/projects/:id/:sub", path);
  const proj = pid ? projectById(s, pid.id) : null;
  const sub = pid && "sub" in pid ? { setup: proj?.status === "draft" ? "New project" : "Setup", shortlist: "Send shortlist" }[pid.sub] : null;
  return (
    <>
      Admin / {proj ? <>{top?.[1]} / </> : <b>{top?.[1] || "Admin"}</b>}
      {proj && (sub ? <>{proj.title || "Untitled"} / <b>{sub}</b></> : <b>{proj.title || "Untitled"}</b>)}
    </>
  );
}

export default function ProjectsApp() {
  const loc = useLocation();
  const sess = useSession();

  // Magic links carry ?as=role:id. Sign in, then drop the parameter (gap G12).
  useEffect(() => {
    const as = loc.query.get("as");
    if (as) {
      signInAs(as);
      const q = new URLSearchParams(loc.query);
      q.delete("as");
      const rest = q.toString();
      navigate(loc.path + (rest ? `?${rest}` : ""), { replace: true });
    }
  }, [loc]);

  let found: ReactNode = null;
  let routeRole: Role | null = null;
  for (const [pattern, role, render] of ROUTES) {
    const m = match(pattern, loc.path);
    if (m) {
      found = render(m);
      routeRole = role;
      break;
    }
  }

  // Deep link into another role's area: switch role so the header and data line up.
  useEffect(() => {
    if (routeRole && routeRole !== sess.role && !loc.query.get("as")) setSession({ role: routeRole });
  }, [routeRole, sess.role, loc.query]);

  // Old prototype operator links (/operator/...) now live in the operator dashboard.
  useEffect(() => {
    if (loc.path === "/operator" || loc.path.startsWith("/operator/")) navigate(operatorAlias(loc.raw), { replace: true });
  }, [loc.path, loc.raw]);

  useEffect(() => {
    if (loc.path === "/" || loc.path === "/projects" || loc.path === "/buyer" || loc.path === "/operator" || loc.path === "/admin") {
      const r = (loc.path.slice(1) as Role) || sess.role;
      navigate(ROLE_HOME[(["buyer", "operator", "admin"] as Role[]).includes(r) ? r : sess.role], { replace: true });
    }
  }, [loc.path, sess.role]);

  const body = found ?? (
    <div className="page">
      <Empty>Page not found.</Empty>
    </div>
  );
  // Operators see the live revenuenomad.com dashboard layout, including on profile pages.
  const live = loc.path.startsWith("/dashboard") || (sess.role === "operator" && loc.path.startsWith("/operators"));
  const admin = loc.path.startsWith("/admin");

  return (
    <div className="rnp" data-role={sess.role}>
      <a
        href="#main"
        className="skip"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="wrap">
        <ProtoBar />
        {live ? (
          <LiveShell>{body}</LiveShell>
        ) : admin ? (
          <AdminShell crumb={<AdminCrumb path={loc.path} />}>{body}</AdminShell>
        ) : (
          <>
            <SiteHeader />
            <main id="main" tabIndex={-1}>
              {body}
            </main>
          </>
        )}
      </div>
    </div>
  );
}
