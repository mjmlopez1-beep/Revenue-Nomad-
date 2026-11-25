/** The key on screen, as the new design's nav marks it (no styles here: TradingPost imports it directly). */
export function ui3Current(page: string, recordType: string, tab: string, recordOpen: boolean, nav2Current: string | null, recordFrom: string | null = null): string | null {
  // A record opened from a page (Crystal Ball, Home, Warm Paths, Pipeline...) sits under that page, as its breadcrumb says; from a list, under Target Companies.
  if (recordOpen) return recordFrom && recordFrom !== "table" ? (recordFrom === "getin" ? "warm" : recordFrom) : "companies";
  if (page === "today") return "today";
  if (page === "radar") return "radar";
  if (page === "network") return "network";
  if (page === "warm" || page === "getin") return "warm";
  if (page === "table" && recordType === "companies" && tab !== "hiring") return "companies";
  return nav2Current;
}
