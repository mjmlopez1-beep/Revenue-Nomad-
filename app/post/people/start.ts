/**
 * What the People page opens on when another place sends the member there (Getting started's step
 * 3, "Bring them in"): a view and the step beside the table. Set just before opening it, taken once.
 */
import type { PeopleView } from "./peopleModel";

export type PeopleStart = { view?: PeopleView; step?: boolean };
let next: PeopleStart | null = null;
export const setPeopleStart = (x: PeopleStart | null) => {
  next = x;
};
export const takePeopleStart = (): PeopleStart | null => {
  const x = next;
  next = null;
  return x;
};
