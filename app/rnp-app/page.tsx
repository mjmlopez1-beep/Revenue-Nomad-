import type { Metadata } from "next";
import ProjectsClient from "./ProjectsClient";

export const metadata: Metadata = {
  title: "Projects · Revenue Nomad",
  description: "Post a project, invite operators, and review responses ranked by fit. Buyer, operator and admin flows on shared data.",
};

// Served for /buyer/*, /operator/*, /admin/*, /operators/* and /client/* via rewrites in next.config.ts.
export default function ProjectsPage() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        precedence="default"
      />
      <ProjectsClient />
    </>
  );
}
