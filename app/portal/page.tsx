import Link from "next/link";
import PortalTabs from "./PortalTabs";

export const metadata = { title: "Operator Portal — Revenue Nomad" };

export default function PortalPage() {
  return (
    <div className="container">
      <nav className="nav">
        <Link href="/" className="brand">
          <span className="brand-mark">R</span> Revenue Nomad
        </Link>
        <div className="nav-links">
          <Link href="/portal">Operator Portal</Link>
        </div>
      </nav>
      <PortalTabs />
    </div>
  );
}
