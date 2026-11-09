"use client";

import Image from "next/image";
import { useState } from "react";
import { availableLogos, MIN_LOGOS, type Logo } from "./content/logos";
import "./LogoMarquee.css";

type ShippedLogo = Logo & { file: string };

/** Display height by shape: wide wordmarks sit shorter than square marks, as the artboard tuned each logo by hand. */
function displayHeight(l: ShippedLogo) {
  if (!l.width || !l.height) return 24;
  const ratio = l.height / l.width;
  if (ratio >= 0.6) return 34;
  if (ratio >= 0.3) return 26;
  return 20;
}

/**
 * "Hired by teams at" logo marquee (design 4.1, section 4). Client only for the pause/play button.
 * Renders nothing until MIN_LOGOS logos have files (design decisions A5, A9: no placeholder boxes).
 * One continuous CSS loop of about 40 seconds over a duplicated track; static rows under reduced motion.
 */
export default function LogoMarquee({ logos = availableLogos }: { logos?: ShippedLogo[] }) {
  const [paused, setPaused] = useState(false);
  if (logos.length < MIN_LOGOS) return null;

  const row = (hidden: boolean) => (
    <div className={hidden ? "lmq-group lmq-group--dup" : "lmq-group"} aria-hidden={hidden || undefined}>
      {logos.map((l) => (
        <span className="lmq-item" key={l.file}>
          <Image
            className="lmq-logo"
            src={`/home/logos/${l.file}`}
            alt={hidden ? "" : l.name}
            width={l.width ?? 160}
            height={l.height ?? 40}
            style={{ height: displayHeight(l) }}
          />
        </span>
      ))}
    </div>
  );

  return (
    <section className="lmq" aria-labelledby="lmq-h">
      <div className="lmq-head">
        <div className="rn-wrap lmq-head-row">
          <h2 id="lmq-h" className="lmq-h">
            Hired by teams at
          </h2>
          <button
            type="button"
            className="lmq-toggle"
            aria-label={paused ? "Play the logo animation" : "Pause the logo animation"}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3 1.5v9l7-4.5z" fill="currentColor" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
      </div>
      <div className="lmq-viewport">
        <div className="lmq-track" data-paused={paused || undefined}>
          {row(false)}
          {row(true)}
        </div>
        <span className="lmq-fade lmq-fade--l" aria-hidden="true" />
        <span className="lmq-fade lmq-fade--r" aria-hidden="true" />
      </div>
    </section>
  );
}
