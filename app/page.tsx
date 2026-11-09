// home.css first so each section's own stylesheet, imported by the component, wins the cascade.
import "./home/home.css";
import Assessment from "./home/Assessment";
import ClosingBand from "./home/ClosingBand";
import Faq from "./home/Faq";
import FeaturedResearch from "./home/FeaturedResearch";
import FirmNumbers from "./home/FirmNumbers";
import ForOperators from "./home/ForOperators";
import GtmEvolving from "./home/GtmEvolving";
import HealthCheckBand from "./home/HealthCheckBand";
import Hero from "./home/Hero";
import HowItWorks from "./home/HowItWorks";
import InTheirWords from "./home/InTheirWords";
import LogoMarquee from "./home/LogoMarquee";
import Newsletter from "./home/Newsletter";
import Outcomes from "./home/Outcomes";
import ResearchBar from "./home/ResearchBar";
import Resources from "./home/Resources";
import SiteFooter from "./home/SiteFooter";
import SiteHeader from "./home/SiteHeader";
import Solutions from "./home/Solutions";
import ThreeRoads from "./home/ThreeRoads";
import ValidationStrip from "./home/ValidationStrip";
import WaysToWork from "./home/WaysToWork";
import { homeMetadata } from "./home/metadata";

export const metadata = homeMetadata;

/** Homepage D, the lead engine. Sections in artboard order (docs/design/homepage-d-design.md 4.1). */
export default function Home() {
  return (
    <>
      <ResearchBar />
      <SiteHeader />
      <main id="main">
        <Hero />
        <FirmNumbers />
        <LogoMarquee />
        <ThreeRoads />
        <GtmEvolving />
        <Solutions />
        <WaysToWork />
        <HowItWorks />
        <HealthCheckBand />
        <InTheirWords />
        <Assessment />
        <Outcomes />
        <ValidationStrip />
        <FeaturedResearch />
        <Resources />
        <Newsletter />
        <ForOperators />
        <Faq />
        <ClosingBand />
      </main>
      <SiteFooter />
    </>
  );
}
