import type { Metadata } from "next";
import { DM_Serif_Display, Newsreader, Red_Hat_Display, Red_Hat_Text } from "next/font/google";
import "./tokens.css";
import "./globals.css";

const redHat = Red_Hat_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-red-hat",
});

/* The Buyer's Guide (Report Redesign): Red Hat Text for body, Newsreader italic for deks and pull quotes. */
const redHatText = Red_Hat_Text({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-red-hat-text",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["italic"],
  display: "swap",
  variable: "--font-newsreader",
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-dm-serif",
});

export const metadata: Metadata = {
  title: { default: "Revenue Nomad", template: "%s | Revenue Nomad" },
  description:
    "Revenue Nomad is a fractional GTM leadership firm. We place experienced fractional sales, marketing and revenue operations leaders with growing companies, a few days a week.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${redHat.variable} ${dmSerif.variable} ${redHatText.variable} ${newsreader.variable}`}>
      <body>{children}</body>
    </html>
  );
}
