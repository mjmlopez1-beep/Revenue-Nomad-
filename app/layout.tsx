import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trading Post · Revenue Nomad",
  description: "Give to get: the shared record of fractional GTM engagements, open roles and the people behind them.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=Red+Hat+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
