import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Table · Revenue Nomad",
  description: "Give to get: the shared record of fractional GTM engagements, open roles and the people behind them.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
