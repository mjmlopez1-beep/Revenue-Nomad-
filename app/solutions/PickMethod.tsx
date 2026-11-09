import Image from "next/image";
import { FlagIf } from "../home/Figure";
import { numbers, type NumberKey } from "../home/content/numbers";
import { core, pick, tiers, type Tier } from "./content/shared";
import type { Stat } from "./content/types";

/**
 * The shared "How we pick the leader we introduce" section: three checks, the CORE letters and the five
 * Reputation Index tiers, from app/solutions/content/shared.ts. One implementation, rendered by the role pages
 * (app/solutions/RolePage.tsx) and the "How we engage" pages (app/engage/EngagePage.tsx, block `pick`).
 * Prefix rp-; styles in Role.css, which each page imports after home.css so the rp- overrides win. The figure
 * helpers below are shared for the same reason.
 */

/** The numbers.ts key whose value equals this stat and is not yet verified, so the stat carries the house badge. */
export function unverifiedKey(value: string): NumberKey | undefined {
  return (Object.keys(numbers) as NumberKey[]).find((k) => numbers[k].value === value && !numbers[k].verified);
}

export function StatValue({ stat, className }: { stat: Stat; className: string }) {
  const id = unverifiedKey(stat.v);
  const value = <span className={className}>{stat.v}</span>;
  return id ? <FlagIf id={id}>{value}</FlagIf> : value;
}

/** A Reputation Index badge with the score printed over the tier art. Decorative: the tier name sits beside it. */
export function TierMark({ tier, score, size = 38 }: { tier: Tier; score: number; size?: number }) {
  return (
    <span className={`rp-tier rp-tier--${tier.ink}`} style={{ width: size, height: size }}>
      <Image src={`/home/tiers/${tier.slug}.png`} alt="" width={size} height={size} />
      <b aria-hidden="true">{score}</b>
    </span>
  );
}

export function SectionHead({ id, eyebrow, title, intro, light }: { id: string; eyebrow?: string; title: string; intro?: string; light?: boolean }) {
  return (
    <>
      {eyebrow && <p className="rn-eyebrow">{eyebrow}</p>}
      <h2 id={id} className={eyebrow ? "rn-h2 rp-h2 rp-h2--after-eyebrow" : "rn-h2 rp-h2"}>
        {title}
      </h2>
      {intro && <p className={light ? "rn-lede rp-intro rp-intro--light" : "rn-lede rp-intro"}>{intro}</p>}
    </>
  );
}

export default function PickMethod() {
  return (
    <section className="rp-section rn-band--mist" aria-labelledby="rp-pick-h">
      <div className="rn-wrap">
        <SectionHead id="rp-pick-h" eyebrow={pick.eyebrow} title={pick.title} intro={pick.intro} />
        <ol className="rp-cards rp-cards--3 rp-picks">
          {pick.checks.map((c, i) => (
            <li key={c.n} className="rp-card rp-pick">
              <span className="rp-pick-n" aria-hidden="true">
                {c.n}
              </span>
              <h3>{c.title}</h3>
              <p className="rn-body">{c.body}</p>
              {c.stats && (
                <ul className="rp-pick-stats">
                  {c.stats.map((s, j) => (
                    <li key={s.l}>
                      <StatValue stat={s} className={j === 0 ? "rp-stat-v" : "rp-stat-v rp-stat-v--mute"} />
                      <span className="rp-stat-l">{s.l}</span>
                    </li>
                  ))}
                </ul>
              )}
              {i === 1 && (
                <ul className="rp-core">
                  {core.map((c) => (
                    <li key={c.letter}>
                      <span className="rp-core-letter" aria-hidden="true">
                        {c.letter}
                      </span>
                      {c.label}
                    </li>
                  ))}
                </ul>
              )}
              {i === 2 && (
                <ul className="rp-tiers">
                  {tiers.map((t) => (
                    <li key={t.slug}>
                      <TierMark tier={t} score={t.sample} />
                      <b>{t.name}</b>
                      <span>{t.range}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
        <p className="rn-small rp-source">{pick.source}</p>
      </div>
    </section>
  );
}
