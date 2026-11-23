/**
 * What Rate benchmarks opens on when another page sends the member there with a question (Home's
 * Ask Merlin, "what should I charge a $5M to $20M client, 2 days a week"): the words, set just
 * before opening the page and taken once by it.
 */
let next: string | null = null;
export const setRatesStart = (text: string | null) => {
  next = text;
};
export const takeRatesStart = (): string | null => {
  const x = next;
  next = null;
  return x;
};
