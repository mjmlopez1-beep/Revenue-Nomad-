import type { Metadata } from "next";
import SiteFooter from "../home/SiteFooter";
import SiteHeader from "../home/SiteHeader";
import Talk from "./Talk";
import "../home/home.css";

export const metadata: Metadata = {
  title: "Talk to us",
  description:
    "Tell us where revenue is stuck. Four questions, then a person speaks with you within 24 hours. No fees for companies.",
  alternates: { canonical: "https://revenuenomad.com/talk" },
};

export default function TalkPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="talk">
        <div className="rn-wrap">
          <Talk />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
