"use client";

/**
 * "Why Jake": how strong the member's relationship with someone is, and who and where in the
 * member's own list (Crystal Ball, saved views, their profile) that person can introduce them to
 * (lib/paths/intro.ts, from GET /api/paths). On the person's card in Your network and Your hidden
 * paths, and in the note sheet. A locked company says what opening it costs instead of its name.
 * Only the member sees any of it.
 */
import type { IntroPlanView, IntroTargetView } from "@/lib/paths/intro";
import { NOTHING_SPECIFIC } from "@/lib/paths/intro";
import "./paths.css";

/** "Acorn Ridge Logistics, Fernway Health and 1 locked company". */
export function targetsWords(targets: IntroTargetView[], count: number, locked: number): string {
  const named = targets.filter((t) => t.name).map((t) => t.name!);
  const more = Math.max(0, count - locked - Math.min(2, named.length));
  const parts = [...named.slice(0, 2), ...(more > 0 ? [`${more} more`] : [])];
  if (locked > 0) parts.push(`${locked} locked ${locked === 1 ? "company" : "companies"}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "");
}

/** The one line on a person's card: "Why Jake: 47 meetings since Dec 2024 · can introduce you to 3 companies in your profile". */
export function IntroLine({ plan, first }: { plan: IntroPlanView | null; first: string }) {
  if (!plan) return null;
  return (
    <span className="ia-line" data-intro={plan.count}>
      <b>Why {first}:</b> {plan.why}
      {plan.count > 0 && <span className="ia-names">{targetsWords(plan.targets, plan.count, plan.locked)}</span>}
    </span>
  );
}

/** In the note sheet: why this person, and the companies the note is about (or that it asks generally). */
export function IntroBlock({ plan, first, strength }: { plan: IntroPlanView | null; first: string; strength?: string | null }) {
  if (!plan || !plan.targets.length)
    return (
      <div className="ia-block" data-specific="0">
        {strength ? (
          <p className="ia-why">
            <b>Why {first}:</b> {strength}
          </p>
        ) : null}
        <p className="ia-none" role="note">
          {NOTHING_SPECIFIC}
        </p>
      </div>
    );
  return (
    <div className="ia-block" data-specific="1">
      <p className="ia-why">
        <b>Why {first}:</b> {plan.why}
      </p>
      <ul className="ia-list" aria-label={`Who ${first} can introduce you to`}>
        {plan.targets.map((t) => (
          <li key={t.id} data-target={t.id} data-locked={t.name ? undefined : "1"}>
            <span className="ia-co">
              {t.name ?? "A locked company"}
              <span className="ia-facts">{[t.facts, t.inWords].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="ia-how">{t.how}</span>
            {t.now && <span className="ia-now">{t.now}</span>}
            {t.open && <span className="ia-open">{t.open}, then the note can name it.</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
