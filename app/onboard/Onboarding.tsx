"use client";
/** PLACEHOLDER: replaced by the onboarding build. */
import type { Act, View } from "../ui/shared";
export interface OnboardingProps {
  view: View;
  act: Act;
  /** Call when the member finishes (after the profile action marks them onboarded). */
  onDone: () => Promise<void> | void;
}
export default function Onboarding({ act }: OnboardingProps) {
  return <button onClick={() => act({ type: "profile" })}>Continue</button>;
}
