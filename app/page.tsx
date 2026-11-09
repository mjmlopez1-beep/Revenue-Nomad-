// home.css first so each section's own stylesheet, imported by the component, wins the cascade.
import "./home/home.css";
import Assessment from "./home/Assessment";
import ClosingBand from "./home/ClosingBand";
import Faq from "./home/Faq";
import FeaturedResearch from "./home/FeaturedResearch";
import ForOperators from "./home/ForOperators";
import GtmEvolving from "./home/GtmEvolving";
import Hero from "./home/Hero";
import HowItWorks from "./home/HowItWorks";
import InTheirWords from "./home/InTheirWords";
import LogoMarquee from "./home/LogoMarquee";
import Outcomes from "./home/Outcomes";
import Resources from "./home/Resources";
import SiteFooter from "./home/SiteFooter";
import SiteHeader from "./home/SiteHeader";
import Solutions from "./home/Solutions";
import { homeMetadata } from "./home/metadata";

export const metadata = homeMetadata;

/** Homepage C (founder decision 2026-11-09) with the check button in the hero. Section order follows the
 * "Desktop - Homepage C, the middle ground" artboard; see docs/design/homepage-d-design.md 4.1 for what each does. */
export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Hero />
        <LogoMarquee />
        <GtmEvolving />
        <Solutions />
        <HowItWorks />
        <InTheirWords />
        <Assessment />
        <Outcomes />
        <FeaturedResearch />
        <Resources />
        <ForOperators />
        <Faq />
        <ClosingBand />
      </main>
      <SiteFooter />
    </>
  );
}
