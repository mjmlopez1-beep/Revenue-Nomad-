/**
 * A filtered list that matches nothing (owner review L1): the words that say which filter (and
 * search) is on, that the member's rows are all still there, and how many match when the filter
 * changes. An empty account is a different state with its own words (each page's first-time
 * empty), never these. Pure: no React, so scripts/test-ui3-work.mts can check them.
 */
export type Noun = readonly [one: string, many: string];
const say = (n: number, noun: Noun) => `${n.toLocaleString("en-US")} ${n === 1 ? noun[0] : noun[1]}`;
const scopeOf = (filter: string | null, q: string) => {
  const search = q.trim();
  return [filter ? `in ${filter}` : null, search ? `matching "${search}"` : null].filter(Boolean).join(" ");
};

/** The heading, the line and the button of a filtered list with no match. */
export function noMatchWords(o: { noun: Noun; filter: string | null; q?: string; total: number }): { head: string; line: string; button: string } {
  const q = o.q ?? "";
  return {
    head: `No ${o.noun[1]} ${scopeOf(o.filter, q)}`.trim(),
    line: `${o.total === 1 ? `Your ${o.noun[0]} is` : `All ${say(o.total, o.noun)} are`} still here. ${o.filter && q.trim() ? "Show all clears the filter and the search." : o.filter ? "Show all clears the filter." : "Show all clears the search."}`,
    button: `Show all ${o.total.toLocaleString("en-US")}`,
  };
}

/** What a screen reader hears when the filter or the search changes the list: "0 of 3 runs in Failed". */
export function matchLine(shown: number, total: number, noun: Noun, filter: string | null, q = ""): string {
  const scope = scopeOf(filter, q);
  if (!scope) return `${say(total, noun)}`;
  return `${shown.toLocaleString("en-US")} of ${say(total, noun)} ${scope}`;
}
