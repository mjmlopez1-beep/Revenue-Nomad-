/**
 * Warm paths' first visit: an example of the map once Google or a connections file is in
 * (WarmPaths.dc.html, "Example: after you connect"). Made up, from the brief's cast, wrapped as
 * Example<T> (examples.ts) so it can never be counted, sent or handed to an action: the page draws
 * `x.value` under its "Example" label, and its detail has nothing to press.
 */
import type { PathBand, Zone } from "@/lib/paths/rank";
import { routeTypeOf, wayBandOf } from "@/lib/paths/rank";
import type { RouteView, WarmRow, WaySource } from "@/lib/paths/types";
import { example, type Example } from "../examples";

type Spec = [name: string, facts: string, zone: Zone, x: number, y: number, fit: number, best: number | null, band: PathBand | null, src: WaySource | null, via: string | null, person: string | null, sub: string | null, hiring?: boolean];

const SPECS: Spec[] = [
  ["Cedar and Pine", "Software · $10M-$20M", "go", 82, 77, 5, 70, "Strong", "google", "You know Dana Whitfield", "Dana Whitfield", "CEO. Decides on fractional hires"],
  ["Larkspur Learning", "EdTech · $10M-$20M", "go", 66, 80, 5, 45, "Good", "fellow", "Through Jordan Reyes", "Jordan Reyes", "Held the Fractional VP Sales seat", true],
  ["Fernhill Software", "Software · $20M-$50M", "go", 72, 70, 4, 50, "Strong", "seat", "Through Marcus Lindqvist", "Marcus Lindqvist", "Held the Fractional CRO seat"],
  ["Bluegate Systems", "Software · $5M-$10M", "go", 61, 62, 4, 40, "Good", "google", "Through Asha Verma", "Asha Verma", "Holds the Fractional CMO seat", true],
  ["Redwood Pay", "Fintech · $10M-$20M", "find", 34, 76, 4, 25, "Fading", "linkedin", "Through Chris Bell", "Chris Bell", "Partner at an investor", true],
  ["Kestrel Analytics", "SaaS · $10M-$20M", "find", 22, 79, 5, 15, "Cold", "google", "You know Paul Brandt", "Paul Brandt", "Founder. In your contacts, not met"],
  ["Mesa Robotics", "Automation · $5M-$20M", "find", 6, 72, 5, null, null, null, null, null, null, true],
  ["Pinecrest Data", "Software · $10M-$20M", "find", 28, 60, 3, 15, "Cold", "linkedin", "Through Mina Sato", "Mina Sato", "Head of sales operations"],
  ["Northwind Clinics", "Health Care · $20M-$50M", "warm", 86, 40, 3, 75, "Strong", "google", "You know Sam Iverson", "Sam Iverson", "CEO. Your client until Dec 2024"],
  ["Quillmoor", "Media · $5M-$10M", "warm", 70, 26, 2, 65, "Good", "google", "You know Theo Grant", "Theo Grant", "Founder. Your client until Nov 2022"],
  ["Halcyon Freight", "Freight · $20M-$50M", "warm", 62, 42, 3, 45, "Good", "messages", "Through Rita Okafor", "Rita Okafor", "Held the Fractional CRO seat"],
  ["Osprey Legal", "Legal services · $10M-$20M", "warm", 74, 22, 1, 50, "Strong", "google", "Through Hannah Cole", "Hannah Cole", "General counsel there"],
  ["Tallgrass Foods", "Food · $20M-$50M", "watch", 30, 36, 2, 25, "Fading", "fellow", "Through Nell Brooks", "Nell Brooks", "Holds the Fractional CFO seat"],
  ["Wren Print", "Printing · $5M-$10M", "watch", 18, 26, 1, 10, "Cold", "google", "You know Lou Ferris", "Lou Ferris", "Controller there"],
  ["Dunmore Hotels", "Hospitality · $50M-$100M", "watch", 6, 22, 1, null, null, null, null, null, null],
  ["Alder Row Dental", "Health Care · $5M-$10M", "watch", 38, 32, 2, 20, "Fading", "google", "Through Tess Marlow", "Tess Marlow", "Office lead there"],
];

const WORDS = ["function", "industry", "size", "revenue", "a hiring signal"];

/** The example map's companies, labelled Example. */
export const EXAMPLE_ROWS: Example<WarmRow>[] = SPECS.map(([name, facts, zone, x, y, fit, best, band, src, via, person, sub, hiring], k) =>
  example<WarmRow>({
    id: `example-${k}`,
    name,
    facts,
    locked: false,
    fit,
    fitWords: WORDS.slice(0, fit),
    odds: fit >= 4 ? "High" : fit >= 2 ? "Medium" : "Low",
    hiringNow: !!hiring,
    ball: fit >= 4,
    list: null,
    best,
    way: best === null ? null : wayBandOf(best),
    wayType: best === null ? null : routeTypeOf({ est: best, between: /^You know/.test(via ?? "") ? 0 : 1, knows: true }),
    band,
    src,
    via,
    direct: /^You know/.test(via ?? ""),
    person: person ? { key: `example-p${k}`, name: person, sub } : null,
    people: person && band ? [{ key: `example-p${k}`, name: person, sub, band }] : [],
    fresh: best === null ? null : { word: best >= 45 ? "Fresh" : best >= 25 ? "Ageing" : "Stale", days: best >= 45 ? 10 : best >= 25 ? 60 : 200, line: "" },
    zone,
    x,
    y,
    onMap: true,
    plan: false,
    rank: k + 1,
  }),
);

const SRC_FROM: Record<WaySource, string> = {
  google: "Your Google contacts and calendar",
  linkedin: "Your LinkedIn connections file",
  csv: "Your CSV",
  messages: "Merlin messages",
  fellow: "Fellow fractionals on Merlin",
  seat: "Seats on Merlin",
  direct: "People on Merlin",
};

/** The example company's path, drawn like a real one (never sent anywhere). */
export function exampleRoute(r: WarmRow): RouteView | null {
  if (r.best === null || !r.person || !r.band || !r.src) return null;
  const direct = /^You know/.test(r.via ?? "");
  const target = { role: "target" as const, label: r.name ?? "", sub: "Whoever decides there", initials: "", company: true };
  const p = { role: direct ? ("target" as const) : ("person" as const), label: r.person.name, sub: r.person.sub, initials: "" };
  const nodes = direct ? [{ role: "you" as const, label: "You", sub: null, initials: "You" }, p] : [{ role: "you" as const, label: "You", sub: null, initials: "You" }, p, target];
  const first = { band: r.band, rel: r.src === "google" || r.src === "messages" ? r.band : null, strength: 0, words: r.src === "google" ? "6 meetings, last Nov 12" : r.src === "linkedin" ? "From your LinkedIn since 2019, not met" : r.src === "messages" ? "4 messages on Merlin, last Nov 20" : "A peer on Merlin", from: SRC_FROM[r.src] };
  const links = direct ? [first] : [first, { band: "Good" as PathBand, rel: null, strength: 0, words: "Held a fractional seat there until 2026", from: SRC_FROM.seat }];
  return {
    id: `example-r-${r.id}`,
    short: "",
    title: "",
    kind: "",
    nodes,
    links,
    chain: nodes.map((x) => x.label).join(" → "),
    between: direct ? 0 : 1,
    decides: direct,
    est: r.best,
    way: wayBandOf(r.best),
    type: routeTypeOf({ est: r.best, between: direct ? 0 : 1, knows: true }),
    why: direct ? `You and ${r.person.name.split(" ")[0]} know each other well, and they decide on fractional hires.` : `You know ${r.person.name.split(" ")[0]}, who knows the company from the inside. One hand-off to whoever decides.`,
    how: [],
    steps: [],
    because: "",
  };
}
