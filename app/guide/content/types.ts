/**
 * Block schema for The Fractional GTM Buyer's Guide 2027. Every chapter is an ordered list of blocks rendered by
 * app/guide/GuideBlocks.tsx. Keep copy in these files; the renderer owns markup and style.
 *
 * `html` fields allow only these inline tags: <strong>, <em>, <a href="...">, <br>. Nothing else.
 */
export type Stat = { v: string; l: string; s?: string; tone?: "forest" | "coral" | "ink" };

export type Block =
  | { t: "h2"; text: string; eyebrow?: string; id?: string }
  | { t: "h3"; text: string }
  | { t: "p"; html: string }
  | { t: "lede"; html: string }
  | { t: "stats"; items: Stat[]; note?: string }
  | { t: "list"; ordered?: boolean; items: string[] }
  | { t: "steps"; items: { n: string; title: string; html: string; aside?: string }[] }
  | { t: "table"; caption?: string; head: string[]; rows: string[][]; note?: string; firstColHeader?: boolean }
  | { t: "quote"; text: string; by?: string }
  | { t: "callout"; title?: string; html: string; tone?: "leaf" | "night" | "gold" }
  | { t: "note"; text: string }
  | { t: "qa"; items: { n: string; figure: string; q: string; html: string; see?: string; tone?: "forest" | "coral" }[] };

export type Chapter = {
  slug: string; // URL segment under /fractional-gtm-buyers-guide-2027/
  number: string; // "—" for foreword, answers and methodology
  title: string;
  dek: string; // one-line summary shown under the title and in the contents
  stats?: Stat[]; // the chapter header tiles
  blocks: Block[];
};
