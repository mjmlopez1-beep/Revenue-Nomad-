import { Newsreader, Red_Hat_Display, Red_Hat_Text } from "next/font/google";

/*
 * The Buyer's Guide (Report Redesign) fonts, loaded only where the guide renders so the rest of the site does
 * not pay for them: Red Hat Display through the heavy weights for headings and numerals, Red Hat Text for
 * body, Newsreader italic for deks and pull quotes. Apply `guideFonts` on the guide's <main> so the variables
 * scope to it; app/tokens.css maps them to --rn-font-report-*.
 */
const redHatHeavy = Red_Hat_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-red-hat-heavy",
});
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

export const guideFonts = `${redHatHeavy.variable} ${redHatText.variable} ${newsreader.variable}`;
