"use client";

/**
 * Fractions for the signed-in app, loaded beside it instead of with it.
 *
 * The app must paint as fast as it did before it had pictures, so its pages import their art
 * from here, not from art.tsx: the kit (about 10 KB gzipped) is fetched once the first picture
 * is on a page and the browser is idle, and nothing waits for it. Until it is here (the first moments of a session's
 * first screen) each picture is an empty box of the same size in the same place, so nothing
 * moves when the picture lands; from then on every picture draws at once.
 *
 * The landing page's sign-in dialog draws from here too, so the landing page loads nothing for
 * it until the dialog opens. First run and the error pages import art.tsx directly.
 */
import { useSyncExternalStore, type ComponentProps } from "react";
import type * as Art from "./art";

type Kit = typeof Art;
let kit: Kit | null = null;
let asked = false;
const waiting = new Set<() => void>();
/**
 * Fetch the kit, once, when the first picture is on a page, and only when the browser has a
 * moment: the page's own first paint (Home's lead card, a table's rows) comes first.
 */
function ask() {
  if (asked) return;
  asked = true;
  const go = () =>
    void import("./art").then(
      (m) => {
        kit = m;
        waiting.forEach((f) => f());
        waiting.clear();
      },
      () => {
        // The pictures are decoration: without them the page is whole.
      },
    );
  const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(go, { timeout: 1500 });
  else setTimeout(go, 200);
}
const subscribe = (f: () => void) => {
  if (kit) return () => {};
  waiting.add(f);
  ask();
  return () => {
    waiting.delete(f);
  };
};
const useKit = () =>
  useSyncExternalStore(
    subscribe,
    () => kit,
    () => null,
  );
const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
/** The picture's box while the kit is on its way: the same classes (so the same place), the same size, nothing drawn. */
const Hold = ({ className, w, h }: { className?: string; w?: number | string; h?: number }) => <span className={cx("fx", className)} style={{ width: w, height: h }} aria-hidden />;

export type { SpotKind, PropKind } from "./art";

export function Spot(p: ComponentProps<Kit["Spot"]>) {
  const k = useKit();
  return k ? <k.Spot {...p} /> : <Hold className={cx("fx-spot", p.className)} w={p.size ?? 128} h={p.size ?? 128} />;
}
export function Prop(p: ComponentProps<Kit["Prop"]>) {
  const k = useKit();
  return k ? <k.Prop {...p} /> : <Hold className={cx("fx-prop", p.className)} w={p.height ?? 72} h={p.height ?? 72} />;
}
export function NomadArt(p: ComponentProps<Kit["NomadArt"]>) {
  const k = useKit();
  return k ? <k.NomadArt {...p} /> : <Hold className={cx("fx-nomad", p.className)} w={p.height ?? 56} h={p.height ?? 56} />;
}
export function Trail(p: ComponentProps<Kit["Trail"]>) {
  const k = useKit();
  const h = p.height ?? 40;
  return k ? <k.Trail {...p} /> : <Hold className={cx("fx-trail", p.className)} w={Math.round(((92 + p.total * 34) * h) / 40)} h={h} />;
}
export function Glyph(p: ComponentProps<Kit["Glyph"]>) {
  const k = useKit();
  return k ? <k.Glyph {...p} /> : <Hold className={cx("fx-glyph", p.className)} w={p.size ?? 16} h={p.size ?? 16} />;
}
export function Divider(p: ComponentProps<Kit["Divider"]>) {
  const k = useKit();
  return k ? <k.Divider {...p} /> : <Hold className={cx("fx-divider", p.className)} w="100%" h={24} />;
}
/* Sized and placed by CSS, out of the flow: nothing to hold. */
export function Strip(p: ComponentProps<Kit["Strip"]>) {
  const k = useKit();
  return k ? <k.Strip {...p} /> : null;
}
export function Bleed(p: ComponentProps<Kit["Bleed"]>) {
  const k = useKit();
  return k ? <k.Bleed {...p} /> : null;
}
export function Doorway(p: ComponentProps<Kit["Doorway"]>) {
  const k = useKit();
  return k ? <k.Doorway {...p} /> : null;
}
export function Scene(p: ComponentProps<Kit["Scene"]>) {
  const k = useKit();
  return k ? <k.Scene {...p} /> : null;
}
