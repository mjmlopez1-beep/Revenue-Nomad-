/**
 * Client logos for the "Hired by teams at" marquee, in the artboard's order. Each file lives in
 * public/home/logos/ as a 72px-tall monochrome PNG; `display` is the rendered height the artboard
 * tuned by hand for each mark (desktop, phone). The marquee renders only when at least MIN_LOGOS
 * entries have a file (design decision A9: no placeholder boxes). Decision A5 (no imagery until
 * approved) is superseded by the owner's request to ship the canvas images.
 */
export type Logo = {
  name: string;
  file?: string;
  width?: number;
  height?: number;
  /** Rendered height in px: [desktop, phone]. */
  display?: [number, number];
};

export const MIN_LOGOS = 6;

export const logos: Logo[] = [
  { name: "Skaled", file: "skaled.png", width: 439, height: 72, display: [19, 17] },
  { name: "myHR Partner", file: "myhr-partner.png", width: 245, height: 72, display: [26, 22] },
  { name: "VinnieMac", file: "vinniemac.png", width: 537, height: 72, display: [19, 15] },
  { name: "Practice Promotions", file: "practice-promotions.png", width: 423, height: 72, display: [20, 17] },
  { name: "ApexRx", file: "apexrx.png", width: 200, height: 72, display: [24, 25] },
  { name: "Ferry", file: "ferry.png", width: 246, height: 72, display: [22, 22] },
  { name: "BuildingLink", file: "buildinglink.png", width: 365, height: 72, display: [20, 18] },
  { name: "Clarus", file: "clarus.png", width: 192, height: 72, display: [24, 25] },
  { name: "Workforce Software", file: "workforce-software.png", width: 442, height: 72, display: [19, 17] },
  { name: "ACLED", file: "acled.png", width: 327, height: 72, display: [19, 19] },
  { name: "Automatic Leader", file: "automatic-leader.png", width: 657, height: 72, display: [18, 14] },
  { name: "Citizen Trucking", file: "citizen-trucking.png", width: 83, height: 72, display: [36, 30] },
  { name: "Bee360", file: "bee360.png", width: 128, height: 72, display: [34, 30] },
];

export const availableLogos = logos.filter((l): l is Logo & { file: string } => Boolean(l.file));

/** Color variants, 72px tall, for the Outcomes case cards and In their words. Keyed by company name. */
export type ColorLogo = { file: string; width: number; height: number };

export const colorLogos: Record<string, ColorLogo> = {
  "myHR Partner": { file: "myhr-partner-color.png", width: 245, height: 72 },
  "Practice Promotions": { file: "practice-promotions-color.png", width: 423, height: 72 },
  Ferry: { file: "ferry-color.png", width: 246, height: 72 },
};
