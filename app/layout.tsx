import type { Metadata } from "next";
// Self-hosted type: one family for everything, mono only for domains and links.
import "@fontsource-variable/schibsted-grotesk/wght.css";
import "@fontsource-variable/red-hat-mono/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trading Post · Revenue Nomad",
  description: "Give to get. The shared record of fractional GTM engagements, open roles and the people behind them.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
