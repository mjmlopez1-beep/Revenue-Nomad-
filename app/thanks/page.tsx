import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "../home/SiteFooter";
import SiteHeader from "../home/SiteHeader";
import "../home/home.css";

export const metadata: Metadata = { title: "Thank you", robots: { index: false, follow: true } };

const variants = {
  report: {
    heading: "The report is on its way",
    body: "Check your inbox for The State of Fractional GTM 2027. If it is not there in a few minutes, look in spam, then talk to us.",
  },
  newsletter: {
    heading: "You are on the list",
    body: "Once a month: what fractional leaders charge, what is working, and what we are seeing in the field. One click to leave.",
  },
  generic: { heading: "Thank you", body: "We will be in touch within 24 hours." },
} as const;

type Props = { searchParams: Promise<{ for?: string }> };

/** Landing page for the two email forms. The `for` value is matched against an enum, never rendered. */
export default async function ThanksPage({ searchParams }: Props) {
  const { for: f } = await searchParams;
  const v = f === "report" || f === "newsletter" ? variants[f] : variants.generic;
  return (
    <>
      <SiteHeader />
      <main className="stub">
        <div className="rn-wrap">
          <p className="rn-eyebrow">Revenue Nomad</p>
          <h1 className="rn-h1">{v.heading}</h1>
          <p className="rn-lede">{v.body}</p>
          <Link className="rn-btn" href="/">
            Back to the homepage
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
