import type { Metadata } from "next";
import { RemoveView } from "./Remove";

export const metadata: Metadata = {
  title: "Remove my name · Merlin",
  description: "Take your name off a seat on Merlin. No account needed.",
};

/** The public Remove my name page (no claim link needed), linked from claim pages, the site footer and Questions. */
export default function Page() {
  return <RemoveView />;
}
