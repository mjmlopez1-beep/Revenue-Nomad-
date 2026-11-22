/**
 * What the open proposal screen says before the member leaves it (Esc, Back, All proposals): the
 * editor with an edit not saved yet, the start sheet with typed text. One at a time: the screen
 * that is open sets it, and clears it when it goes.
 */
import { useEffect, useRef } from "react";

let ask: (() => boolean) | null = null;

/** True to go on: nothing to lose, or the member said leave. */
export const okToLeave = () => (ask ? ask() : true);

/** While this screen is open, `check` answers whether to leave (it asks the member when there is something to lose). */
export function useLeaveGuard(check: () => boolean) {
  const ref = useRef(check);
  ref.current = check;
  useEffect(() => {
    const mine = () => ref.current();
    ask = mine;
    return () => {
      if (ask === mine) ask = null;
    };
  }, []);
}
