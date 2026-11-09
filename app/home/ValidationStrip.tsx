import Link from "next/link";
import type { Route } from "./content/links";
import "./ValidationStrip.css";

export type ValidationSlot = {
  /** What kind of proof this slot holds, shown as the caption once real. */
  kind: "Press mention" | "Podcast" | "Clutch rating" | "G2 rating";
  /** The outlet, show or rating once confirmed, e.g. "Forbes" or "4.9 on Clutch". */
  name?: string;
  /** Where the entry links, when there is a page for it. */
  href?: Route;
  /** True until the founder supplies the real entry (design 4.1 row 14, A9). */
  placeholder: boolean;
};

/** Five slots from the artboard. Replace a slot's placeholder with the real entry and the strip appears. */
export const validationSlots: ValidationSlot[] = [
  { kind: "Press mention", placeholder: true },
  { kind: "Press mention", placeholder: true },
  { kind: "Podcast", placeholder: true },
  { kind: "Clutch rating", placeholder: true },
  { kind: "G2 rating", placeholder: true },
];

/**
 * Section 14: "As seen in / Rated on". Renders nothing while every slot is a placeholder. Once it renders,
 * data-placeholder marks a strip that still carries placeholder slots so check-home can flag it.
 */
export default function ValidationStrip() {
  // Only real entries ever render (decision A5: no placeholder boxes). data-placeholder still marks a strip
  // whose data has unfilled slots so check-home can report it.
  const real = validationSlots.filter((s) => !s.placeholder);
  if (real.length === 0) return null;
  const anyPlaceholder = real.length < validationSlots.length;
  return (
    <section className="val" aria-labelledby="val-h" data-section="validation" data-placeholder={anyPlaceholder ? "" : undefined}>
      <div className="rn-wrap val-row">
        <h2 id="val-h" className="val-k">
          As seen in · Rated on
        </h2>
        <ul className="val-grid">
          {real.map((s, i) => (
            <li className="val-slot" key={i}>
              <b>{s.href ? <Link href={s.href}>{s.name}</Link> : s.name}</b>
              <span>{s.kind}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
