import Link from "next/link";
import Brand from "../Brand";
import PortalTabs from "./PortalTabs";

export const metadata = { title: "Operator Portal — Revenue Nomad" };

export default function PortalPage() {
  return (
    <div className="container">
      <nav className="nav">
        <Brand />
        <div className="nav-links">
          <Link href="/portal">Operator Portal</Link>
        </div>
      </nav>
      <PortalTabs />
    </div>
  );
}
