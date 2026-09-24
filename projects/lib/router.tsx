// Tiny router. Path mode inside the Next.js site (/buyer/projects/:id and so on),
// hash mode inside the claude.ai artifact where only #fragments survive (gap G19).

import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { signInAs } from "./store";

type Mode = "path" | "hash";
let mode: Mode = "path";
const listeners = new Set<() => void>();
/** Which paths this page renders itself. Anything else is a full page load (path mode only). */
let handles: (path: string) => boolean = () => true;

export function configureRouter(m: Mode, opts: { handles?: (path: string) => boolean } = {}) {
  mode = m;
  if (opts.handles) handles = opts.handles;
  if (typeof window !== "undefined") (window as unknown as { __rnpNavigate?: typeof navigate }).__rnpNavigate = navigate;
}

/** Old prototype operator paths now live in the operator dashboard: /operator/projects/:id -> /dashboard/projects/:id. */
export function operatorAlias(to: string): string {
  const [path, q = ""] = to.split("?");
  const qs = q ? `?${q}` : "";
  if (path === "/operator/roles") return `/dashboard/projects?tab=open${q ? `&${q}` : ""}`;
  if (path === "/operator" || path === "/operator/projects") return `/dashboard/projects${qs}`;
  if (path.startsWith("/operator/")) return `/dashboard/${path.slice("/operator/".length)}${qs}`;
  return to;
}

function resolve(to: string): string {
  return operatorAlias(to);
}

function rawLocation(): string {
  if (typeof window === "undefined") return "/";
  if (mode === "hash") {
    const h = window.location.hash.replace(/^#/, "");
    return h.startsWith("/") ? h : "/" + h;
  }
  return window.location.pathname + window.location.search;
}

let lastRaw = "";
let lastLoc: { path: string; query: URLSearchParams; raw: string } = { path: "/", query: new URLSearchParams(), raw: "/" };
function snapshot() {
  const raw = rawLocation();
  if (raw !== lastRaw) {
    lastRaw = raw;
    const [path, q = ""] = raw.split("?");
    lastLoc = { path: path.replace(/\/+$/, "") || "/", query: new URLSearchParams(q), raw };
  }
  return lastLoc;
}

function emit() {
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", emit);
  window.addEventListener("hashchange", emit);
}

export function href(to: string): string {
  return mode === "hash" ? "#" + to : resolve(to);
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  to = resolve(to);
  if (mode === "path" && !handles(to.split("?")[0])) {
    // Another Next.js page renders this path.
    if (opts.replace) window.location.replace(to);
    else window.location.assign(to);
    return;
  }
  if (mode === "hash") {
    if (opts.replace) window.history.replaceState(window.history.state, "", "#" + to);
    else window.location.hash = to;
  } else if (opts.replace) window.history.replaceState(window.history.state, "", to);
  else window.history.pushState(window.history.state, "", to);
  emit();
  if (!opts.replace) window.scrollTo(0, 0);
}

/** Follow an outbox link: sign in as the recipient (magic link, no password) and open the target. */
export function followLink(path: string, as?: string) {
  if (as) signInAs(as);
  navigate(path);
}

export function useLocation() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    snapshot,
    snapshot,
  );
}

/** Match "/buyer/projects/:id" against a path. Returns params or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/").filter(Boolean);
  const b = path.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function Link({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...rest}
      href={href(to)}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    />
  );
}
