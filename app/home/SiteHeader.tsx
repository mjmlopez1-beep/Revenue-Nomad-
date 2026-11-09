"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import Brand from "../Brand";
import { hrefs, resourcesMenu, solutionsMenu, type LinkGroup } from "./content/links";

type MenuId = "solutions" | "resources" | null;

/**
 * Site header. Desktop: wordmark, two click-to-open menus (Solutions, Resources), About,
 * For operators, Talk to us. Below 900px: wordmark, Talk to us and a Menu button that opens
 * a drawer. Escape, outside click and route changes close everything and return focus.
 */
export default function SiteHeader() {
  const [open, setOpen] = useState<MenuId>(null);
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const lastButton = useRef<HTMLButtonElement | null>(null);
  const ids = { solutions: useId(), resources: useId(), drawer: useId() };

  // Route change closes menus and drawer.
  useEffect(() => {
    setOpen(null);
    setDrawer(false);
  }, [pathname]);

  // Escape and outside click close the open menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        lastButton.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // Drawer: lock scroll, trap focus, Escape closes and restores focus.
  useEffect(() => {
    if (!drawer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      Array.from(drawerRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawer(false);
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      menuButtonRef.current?.focus();
    };
  }, [drawer]);

  const toggle = (id: Exclude<MenuId, null>) => (e: React.MouseEvent<HTMLButtonElement>) => {
    lastButton.current = e.currentTarget;
    setOpen((cur) => (cur === id ? null : id));
  };

  return (
    <header className="hdr">
      <div className="rn-wrap hdr-row">
        <Brand className="hdr-brand" />
        <nav className="hdr-nav" aria-label="Main" ref={navRef}>
          <div className="hdr-menu">
            <button type="button" className="hdr-link hdr-menu-btn" aria-expanded={open === "solutions"} aria-controls={ids.solutions} onClick={toggle("solutions")}>
              Solutions <Chevron />
            </button>
            <MenuPanel id={ids.solutions} groups={solutionsMenu} open={open === "solutions"} />
          </div>
          <div className="hdr-menu">
            <button type="button" className="hdr-link hdr-menu-btn" aria-expanded={open === "resources"} aria-controls={ids.resources} onClick={toggle("resources")}>
              Resources <Chevron />
            </button>
            <MenuPanel id={ids.resources} groups={resourcesMenu} open={open === "resources"} />
          </div>
          <Link className="hdr-link" href="/about">
            About
          </Link>
          <Link className="hdr-link" href="/operators">
            For operators
          </Link>
        </nav>
        <Link className="rn-btn rn-btn--sm hdr-cta" href={hrefs.talk}>
          Talk to us
        </Link>
        <button
          ref={menuButtonRef}
          type="button"
          className="hdr-burger"
          aria-label="Menu"
          aria-expanded={drawer}
          aria-controls={ids.drawer}
          onClick={() => setDrawer(true)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {drawer && (
        <div className="hdr-drawer-backdrop" onClick={() => setDrawer(false)}>
          <div
            id={ids.drawer}
            ref={drawerRef}
            className="hdr-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hdr-drawer-top">
              <Brand className="hdr-brand" />
              <button type="button" className="hdr-close" aria-label="Close menu" onClick={() => setDrawer(false)}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {[...solutionsMenu, ...resourcesMenu].map((g) => (
              <div className="hdr-drawer-group" key={g.title}>
                <p className="rn-eyebrow">{g.title}</p>
                <ul>
                  {g.items.map((it) => (
                    <li key={it.href}>
                      <Link href={it.href}>{it.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="hdr-drawer-group">
              <ul>
                <li>
                  <Link href="/about">About</Link>
                </li>
                <li>
                  <Link href="/operators">For operators</Link>
                </li>
              </ul>
            </div>
            <Link className="rn-btn hdr-drawer-cta" href={hrefs.talk}>
              Talk to us
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function MenuPanel({ id, groups, open }: { id: string; groups: LinkGroup[]; open: boolean }) {
  return (
    <div id={id} className="hdr-panel" hidden={!open}>
      {groups.map((g) => (
        <div className="hdr-panel-group" key={g.title}>
          <p className="rn-eyebrow">{g.title}</p>
          <ul>
            {g.items.map((it) => (
              <li key={it.href}>
                <Link href={it.href}>{it.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
