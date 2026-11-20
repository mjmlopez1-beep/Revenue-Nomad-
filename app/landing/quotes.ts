/**
 * What members say about Merlin, for the landing page (Quotes.tsx). Empty on purpose: the
 * section is not drawn until a real quote is here. Add only words a member wrote or said, with
 * their permission to show their name and title. Never a made-up quote, name, logo or company.
 *
 *   { quote: "…", name: "Jane Smith", title: "Fractional CMO" }
 */
export interface Quote {
  /** The member's own words, without quotation marks. */
  quote: string;
  /** Their name, as they agreed to show it. */
  name: string;
  /** What they do, like "Fractional CFO". */
  title: string;
}

export const QUOTES: Quote[] = [];
