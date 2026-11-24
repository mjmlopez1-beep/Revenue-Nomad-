"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * A switch turned this source on (Settings / Connections, Warm paths, the set-up): open its file
 * picker at once, and say so when the member closes the picker with no file (`onStop()`).
 */
export function useAutoPick(input: RefObject<HTMLInputElement | null>, autoPick: boolean | undefined, onStop?: (why?: string) => void) {
  const stop = useRef(onStop);
  stop.current = onStop;
  const done = useRef(false);
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const cancel = () => stop.current?.();
    el.addEventListener("cancel", cancel);
    if (autoPick && !done.current) {
      done.current = true;
      el.click();
    }
    return () => el.removeEventListener("cancel", cancel);
  }, [input, autoPick]);
}
