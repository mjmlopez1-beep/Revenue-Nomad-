"use client";

import dynamic from "next/dynamic";
import { configureRouter } from "../../projects/lib/router";
import { configureAssets } from "../../projects/lib/data";

// The portal renders only /portal; every other link (buyer, admin, profiles) is a page load.
configureRouter("path", { handles: (p) => p === "/portal"});
configureAssets("/rnp/", "local");

// Projects state lives in the browser (shared store), so the portal renders on the client.
const PortalClient = dynamic(() => import("./PortalClient"), {
  ssr: false,
  loading: () => <p style={{ padding: 24 }}>Loading the Operator Portal…</p>,
});

export default function PortalLoader() {
  return <PortalClient />;
}
