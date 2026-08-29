import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Nomad Benchmark",
  description:
    "Give-to-get market intelligence for fractional GTM operators. Contribute engagement actuals, get the data nobody else has.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
