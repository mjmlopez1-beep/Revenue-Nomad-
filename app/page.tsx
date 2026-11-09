import SiteFooter from "./home/SiteFooter";
import SiteHeader from "./home/SiteHeader";
import "./home/home.css";

/** Homepage D, the lead engine. Sections are added in artboard order (docs/design/homepage-d-design.md 4.1). */
export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main"></main>
      <SiteFooter />
    </>
  );
}
