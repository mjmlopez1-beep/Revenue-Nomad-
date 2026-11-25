"use client";

/** The new design's Work and Community pages, by key (pages.ts). Each loads on its own, only while the new design is on. */
import dynamic from "next/dynamic";
import type { Ui3WorkKey } from "./pages";

const wait = () => (
  <main className="tp-main tp-main-page u3 u3p w3" aria-busy="true">
    <div className="w3-skel">
      <i />
      <i />
      <i />
    </div>
  </main>
);
const PAGES: Partial<Record<Ui3WorkKey, React.ComponentType>> = {
  "w:proposals": dynamic(() => import("./proposals/ProposalsPage").then((m) => m.Ui3Proposals), { ssr: false, loading: wait }),
  "w:contracts": dynamic(() => import("./contracts/ContractsPage").then((m) => m.Ui3Contracts), { ssr: false, loading: wait }),
  "w:evidence": dynamic(() => import("./evidence/EvidencePage").then((m) => m.Ui3Evidence), { ssr: false, loading: wait }),
};

export function WorkPage({ k }: { k: Ui3WorkKey }) {
  const P = PAGES[k];
  return P ? <P /> : null;
}
