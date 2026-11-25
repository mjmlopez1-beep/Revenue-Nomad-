"use client";

/** The new design's own pages, by key (head.ts UI3_BUILT lists the ones built). Each loads on its own. */
import dynamic from "next/dynamic";
import type { Ui3PageKey } from "./head";
import { Wait } from "./parts";
import "./pages.css";
export type { Ui3PageKey };

const wait = () => (
  <main className="tp-main tp-main-page u3 u3p">
    <Wait />
  </main>
);
const Home = dynamic(() => import("./Home").then((m) => m.Ui3Home), { ssr: false, loading: wait });

export function Ui3Page({ k }: { k: Ui3PageKey }) {
  if (k === "home") return <Home />;
  return null;
}
