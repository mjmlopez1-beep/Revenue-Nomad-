"use client";

import Link from "next/link";
import Brand from "../Brand";
import PortalTabs from "./PortalTabs";
import { ProtoBar } from "../../projects/ui/Shell";
import { SignedInChip } from "./projects/OperatorProjects";
import "../../projects/styles.css";
import "./projects/projects.css";

export default function PortalClient() {
  return (
    <>
      <div className="rnp rnp-strip">
        <div className="wrap">
          <ProtoBar />
        </div>
      </div>
      <div className="container">
        <nav className="nav">
          <Brand />
          <div className="nav-links">
            <Link href="/portal">Operator Portal</Link>
            <SignedInChip />
          </div>
        </nav>
        <main id="main">
          <PortalTabs />
        </main>
      </div>
    </>
  );
}
