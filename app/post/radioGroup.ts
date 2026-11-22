/**
 * Chip groups marked role="radiogroup" follow the ARIA radio group pattern: one Tab stop (the
 * checked chip, else the first), and the arrow keys move the choice (Home and End to the ends).
 *
 *   <div role="radiogroup" onKeyDown={radioKeys}>
 *     {opts.map((o, i) => <button role="radio" aria-checked={..} tabIndex={radioTab(i, checkedIndex)} ..>)}
 *
 * Moving with an arrow focuses the next chip and presses it, so the chip's own onClick picks it.
 */
import type { KeyboardEvent } from "react";

/** The chip's tabIndex: 0 for the checked one (the first when none is), -1 for the rest. */
export const radioTab = (i: number, checked: number): 0 | -1 => ((checked < 0 ? i === 0 : i === checked) ? 0 : -1);

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** The group's onKeyDown: arrows move and pick, wrapping at the ends; Home and End go to the first and last. */
export function radioKeys(e: KeyboardEvent<HTMLElement>): void {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const d = STEP[e.key];
  if (d === undefined && e.key !== "Home" && e.key !== "End") return;
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')].filter((r) => !(r as HTMLButtonElement).disabled && r.closest('[role="radiogroup"]') === e.currentTarget);
  const k = radios.indexOf(e.target as HTMLElement);
  if (k < 0 || !radios.length) return;
  const n = radios.length;
  const to = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (k + d + n) % n;
  e.preventDefault();
  const next = radios[to];
  next.focus();
  if (next.getAttribute("aria-checked") !== "true") next.click();
}
