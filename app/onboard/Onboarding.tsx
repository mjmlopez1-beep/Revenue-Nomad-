"use client";

/**
 * First run. Two flows, one per look:
 *
 *   the new look (RN_UI2, on by default since Stage 9)   Setup.tsx, the mockup's screens
 *       (Onboarding.dc.html): Welcome, Your ideal client, The seats you have held, Like your past
 *       clients (lookalikes, the member's first list), Who you know, Open your first company, Done.
 *   the old look (RN_UI2=off, the rollback)              Classic.tsx, the three steps as they were.
 *
 * Which one follows Me.ui2 (the join answer carries it, so the flow never changes under the member
 * when the full view lands), else View.ui2. Both take the same props from app/Root.tsx and keep the
 * answers on the server after each step (OnboardDraft), so a new tab or another device picks up.
 */
import Classic, { type OnboardingProps } from "./Classic";
import Setup from "./Setup";

export type { OnboardingProps };
export { localCountry } from "./Classic";

/** The new look's set-up is on for this member. */
export const setupOn = (view: OnboardingProps["view"]) => !!(view.me?.ui2 ?? view.ui2);

export default function Onboarding(p: OnboardingProps) {
  return setupOn(p.view) ? <Setup {...p} /> : <Classic {...p} />;
}
