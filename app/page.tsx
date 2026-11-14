import Brand from "./Brand";
import TheTable from "./table/TheTable";

/** The Table is the product: landing page, login and app in one. */
export default function Home() {
  return (
    <div className="container container-wide">
      <nav className="nav">
        <Brand />
      </nav>
      <TheTable />
    </div>
  );
}
