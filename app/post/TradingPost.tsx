"use client";
/** PLACEHOLDER: replaced by the app build. */
import type { Act, View } from "../ui/shared";
export interface TradingPostProps {
  view: View;
  act: Act;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}
export default function TradingPost({ view }: TradingPostProps) {
  return <main style={{ padding: 40 }}>{view.companies.length} companies</main>;
}
