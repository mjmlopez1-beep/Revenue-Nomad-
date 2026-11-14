import Link from "next/link";
import Brand from "../Brand";
import TheTable from "./TheTable";

export const metadata = { title: "The Table — Revenue Nomad" };

export default function TablePage() {
  return (
    <div className="container">
      <nav className="nav">
        <Brand />
        <div className="nav-links">
          <Link href="/table">The Table</Link>
          <Link href="/portal">Operator Portal</Link>
        </div>
      </nav>
      <TheTable />
    </div>
  );
}
