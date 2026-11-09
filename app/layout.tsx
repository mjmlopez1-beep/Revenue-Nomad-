import type { Metadata } from "next";
import { DM_Serif_Display, Red_Hat_Display } from "next/font/google";
import "./tokens.css";
import "./globals.css";

const redHat = Red_Hat_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-red-hat",
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
    <html lang="en" className={`${redHat.variable} ${dmSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
