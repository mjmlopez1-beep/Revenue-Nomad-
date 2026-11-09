import { numbers, showUnverified, type Figure, type NumberKey } from "./content/numbers";

const figure = (id: NumberKey): Figure => numbers[id];

/**
 * Renders one figure from numbers.ts. Unverified figures carry data-unverified and a
 * visible "confirm" badge unless NEXT_PUBLIC_SITE_ENV is production.
 */
export function FigureValue({ id, className }: { id: NumberKey; className?: string }) {
  const f = figure(id);
  const flag = !f.verified;
  return (
    <span className={className} data-unverified={flag && showUnverified ? "" : undefined}>
      {f.value}
      {flag && showUnverified && (
        <sup className="rn-badge" title="Not yet confirmed by the founder. See numbers.ts.">
          confirm
        </sup>
      )}
    </span>
  );
}

export function FigureLabel({ id }: { id: NumberKey }) {
  return <>{numbers[id].label}</>;
}

export function FigureSource({ id, prefix = "Source: " }: { id: NumberKey; prefix?: string }) {
  const s = figure(id).source;
  return s ? (
    <>
      {prefix}
      {s}
    </>
  ) : null;
}
