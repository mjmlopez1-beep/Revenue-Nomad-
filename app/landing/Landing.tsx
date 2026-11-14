"use client";
/** PLACEHOLDER: replaced by the landing page build. */
import type { View } from "../ui/shared";
export interface LandingProps {
  /** Signed-out view: only `stats` and `email` are filled; companies is empty. */
  view: View;
  /** Call after a successful join (no email provider) or sign-in, to load the signed-in view. */
  onSignedIn: () => Promise<void> | void;
}
export default function Landing({ view }: LandingProps) {
  return <main style={{ padding: 40 }}>Trading Post. {view.stats.companies} companies.</main>;
}
