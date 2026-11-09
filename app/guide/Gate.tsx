import Link from "next/link";
import Arrow from "../home/Arrow";
import { unlockGuide } from "./actions";
import { chapterHref, chapters, guide } from "./content/guide";

/** The email gate shown in place of a locked chapter, as a report card (Report Redesign palette), inline rather than modal. */
export default function Gate({ returnTo, invalid }: { returnTo: string; invalid?: boolean }) {
  const locked = chapters.filter((c) => !c.open).length;
  return (
    <section className="gd-gate" aria-labelledby="gd-gate-h">
      <div className="gd-gate-card">
        <p className="gd-eyebrow gd-eyebrow--forest">{guide.shortTitle}</p>
        <h2 id="gd-gate-h" className="gd-gate-h">
          Unlock the full guide
        </h2>
        <p className="gd-p">
          Chapters 2 to 10 and the methodology open with one email, and they stay open on this device. Tell us where to
          reach you.
        </p>
        <form action={unlockGuide} className="gd-gate-form">
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="gd-gate-row">
            <label className="gd-field">
              <span>Name</span>
              <input name="name" type="text" autoComplete="name" required maxLength={120} />
            </label>
            <label className="gd-field">
              <span>
                Company <em>(optional)</em>
              </span>
              <input name="company" type="text" autoComplete="organization" maxLength={120} />
            </label>
          </div>
          <label className="gd-field">
            <span>Work email</span>
            <input name="email" type="email" autoComplete="email" required maxLength={160} />
          </label>
          {invalid && (
            <p className="gd-gate-error" role="alert">
              Add your name and a work email we can reach.
            </p>
          )}
          <button type="submit" className="gd-btn gd-gate-btn">
            Unlock the full guide
            <Arrow />
          </button>
          <p className="gd-note gd-gate-fine">We send the guide and nothing else - no sales sequence, and your email never leaves Revenue Nomad.</p>
        </form>
        <p className="gd-gate-alt">
          Not ready?{" "}
          <Link href={chapterHref("start-here")}>Keep reading the preview - Start here, the Answers and Chapter 1 stay open</Link>
        </p>
      </div>
      <p className="gd-note">
        {locked} chapters open with the email: {chapters.filter((c) => !c.open).map((c) => c.title).join("; ")}.
      </p>
    </section>
  );
}
