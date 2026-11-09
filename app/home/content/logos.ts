/**
 * Client logos for the "Hired by teams at" marquee. A logo renders only when `file`
 * names an image in public/home/logos/. The marquee itself renders only when at least
 * MIN_LOGOS entries have a file (design decision A5/A9: no placeholder boxes).
 */
export type Logo = { name: string; file?: string; width?: number; height?: number };

export const MIN_LOGOS = 6;

export const logos: Logo[] = [
  { name: "Skaled" },
  { name: "myHR Partner" },
  { name: "VinnieMac" },
  { name: "Practice Promotions" },
  { name: "ApexRx" },
  { name: "Ferry" },
  { name: "BuildingLink" },
  { name: "Clarus" },
  { name: "Workforce Software" },
  { name: "ACLED" },
  { name: "Automatic Leader" },
  { name: "Citizen Trucking" },
  { name: "Bee360" },
];

export const availableLogos = logos.filter((l): l is Logo & { file: string } => Boolean(l.file));
