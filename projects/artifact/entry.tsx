// Standalone build for the claude.ai artifact: hash routing (only #fragments survive there,
// gap G19), photos published next to the page, profile explorer links to its own artifact.
import { createRoot } from "react-dom/client";
import { configureRouter } from "../lib/router";
import { configureAssets } from "../lib/data";
import ProjectsApp from "../App";

configureRouter("hash");
configureAssets("./", "artifact");

createRoot(document.getElementById("root")!).render(<ProjectsApp />);
