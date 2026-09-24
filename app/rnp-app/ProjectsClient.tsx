"use client";

import dynamic from "next/dynamic";
import "../../projects/styles.css";
import { configureRouter } from "../../projects/lib/router";
import { configureAssets } from "../../projects/lib/data";

configureRouter("path");
configureAssets("/rnp/", "local");

// The prototype keeps all state in localStorage, so it renders on the client only.
const ProjectsApp = dynamic(() => import("../../projects/App"), {
  ssr: false,
  loading: () => <p style={{ padding: 24, fontFamily: "system-ui" }}>Loading Revenue Nomad Projects…</p>,
});

export default function ProjectsClient() {
  return <ProjectsApp />;
}
