"use client";

/**
 * The new design's shell, in the parts TradingPost places (one lazy module, loaded only with Me.ui3):
 *
 *   part "nav"     the forest navigation, and the gear's menu
 *   part "top"     the top bar: breadcrumb, search, bell, credits and Add what you know
 *   part "mtop"    phones and tablets: the forest top bar
 *   part "tabbar"  phones and tablets: the tab bar and the More sheet
 *   part "page"    one of the new design's own pages (ui3/pages.tsx), by key
 */
import { useCallback, useState, type ReactNode, type RefObject } from "react";
import type { Me } from "@/lib/tableTypes";
import type { NavItem2 } from "../navModel";
import type { Crumb } from "../shell/Header";
import { useApp } from "../shell/pages";
import { Ui3GearMenu, Ui3More, Ui3MobileTop, Ui3Nav, Ui3TabBar, Ui3Top, useUi3Groups, useUi3Theme } from "./Shell";
import { Ui3Page, type Ui3PageKey } from "./pages";

export interface Ui3FrameProps {
  part: "nav" | "top" | "mtop" | "tabbar" | "page";
  nav2?: NavItem2[];
  /** The key the nav marks (ui3Current). */
  current?: string | null;
  onNav?: (n: NavItem2) => void;
  me?: Me;
  onHome?: () => void;
  onAccount?: () => void;
  accountRef?: RefObject<HTMLButtonElement | null>;
  crumbs?: Crumb[];
  title?: string;
  search?: ReactNode;
  actions?: ReactNode;
  hosts?: ReactNode;
  moreOpen?: boolean;
  setMoreOpen?: (f: (x: boolean) => boolean) => void;
  moreRef?: RefObject<HTMLButtonElement | null>;
  page?: Ui3PageKey;
}

export function Ui3Frame(p: Ui3FrameProps) {
  if (p.part === "page") return <Ui3Page k={p.page!} />;
  if (p.part === "top") return <Ui3Top crumbs={(p.crumbs ?? []).filter((c) => c.label !== "Home")} title={p.title ?? ""} search={p.search} actions={p.actions} hosts={p.hosts} />;
  if (p.part === "mtop") return <Ui3MobileTop onHome={p.onHome!} search={p.search} actions={p.actions} onAccount={p.onAccount!} accountRef={p.accountRef!} hosts={p.hosts} />;
  return <NavParts {...p} />;
}

function NavParts(p: Ui3FrameProps) {
  const c = useApp();
  const hrefOf = useCallback((k: string) => c.hrefOf(k as never), [c]);
  const groups = useUi3Groups(p.nav2 ?? [], p.current ?? null, hrefOf);
  const [theme, setTheme] = useUi3Theme();
  const [gear, setGear] = useState<HTMLButtonElement | null>(null);
  const [gearRef] = useState<{ current: HTMLButtonElement | null }>({ current: null });
  if (p.part === "nav")
    return (
      <>
        <Ui3Nav groups={groups} me={p.me!} onNav={p.onNav!} onHome={p.onHome!} onAccount={p.onAccount!} accountRef={p.accountRef!} onGear={() => setGear((g) => (g ? null : gearRef.current))} gearRef={gearRef} />
        {gear && <Ui3GearMenu groups={groups} anchor={gear} onNav={p.onNav!} onClose={() => setGear(null)} theme={theme} setTheme={setTheme} />}
      </>
    );
  return (
    <>
      <Ui3TabBar groups={groups} onNav={p.onNav!} onMore={() => p.setMoreOpen?.((x) => !x)} moreOpen={!!p.moreOpen} moreRef={p.moreRef!} />
      {p.moreOpen && <Ui3More groups={groups} onNav={p.onNav!} onClose={() => p.setMoreOpen?.(() => false)} theme={theme} setTheme={setTheme} />}
    </>
  );
}
