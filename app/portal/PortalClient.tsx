"use client";

import Link from "next/link";
import Brand from "../Brand";
import PortalTabs from "./PortalTabs";
import { ProtoBar } from "../../projects/ui/Shell";
import "../../projects/styles.css";

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
            <Link href="/dashboard">Dashboard</Link>
          </div>
        </nav>
        <main id="main">
          <PortalTabs />
        </main>
      </div>
    </>
  );
}
