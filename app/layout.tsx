import type { Metadata, Viewport } from "next";
// Self-hosted type: one family for everything, mono only for domains and links.
import "@fontsource-variable/schibsted-grotesk/wght.css";
import "@fontsource-variable/red-hat-mono/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trading Post · Companies that hire fractional GTM leaders",
  description:
    "See which companies hire fractional sales, marketing and RevOps leaders, who held each seat, what it paid and which roles are open now. Add what you know to see more. A free pilot from Revenue Nomad.",
};

/**
 * viewport-fit=cover lets the safe-area padding in the CSS take effect (a phone on its side keeps
 * content clear of the notch). The browser's own bar takes the pine of the top bar.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#073F2F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
