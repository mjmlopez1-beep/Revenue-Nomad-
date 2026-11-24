"use client";

/**
 * <ServiceIcon service="slack" />: the icon of a service Merlin connects to, wherever the page names
 * it (Settings / Connections, Agent access, Alerts, the landing page's Works with, Granola, Google
 * prompts, Warm paths' sources, the set-up's Who you know).
 *
 * A brand service's icon comes from our own GET /api/logo/svc/<key> (lib/serviceIcon.ts), which
 * reads it from that service's own website: the browser never asks a third-party icon service. Until
 * the icon has loaded, and whenever there is none (a 204, a blank or tiny image, an error), the
 * service's own glyph drawn here shows instead, so there is never a broken image. A webhook, a
 * contacts file, email and the bell have no brand: always their plain glyph, and no request.
 *
 * LinkedIn's icon is for signed-in pages only (the member's own export and connections file): public
 * pages never name LinkedIn.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import "./serviceIcon.css";

/** The services with a brand icon: the keys lib/serviceIcon.ts SERVICE_SITES serves (scripts/test-service-icons.mts keeps them equal). */
export const BRAND_SERVICES = ["google", "slack", "claude", "claude-code", "chatgpt", "cursor", "granola", "linkedin", "stripe"] as const;
export type BrandService = (typeof BRAND_SERVICES)[number];
/** The plain ones: never a request. */
export type PlainService = "webhook" | "csv" | "email" | "bell";
export type Service = BrandService | PlainService;
const isBrand = (s: string): s is BrandService => (BRAND_SERVICES as readonly string[]).includes(s);

/** An icon address that answered with no icon this visit, and one that loaded: asked once a page load. */
const NONE = new Set<string>();
const LOADED = new Set<string>();

/** Google's four-color G (Google's own mark, drawn here). */
export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function SlackMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden focusable="false">
      <rect x="2" y="8" width="7" height="3.2" rx="1.6" fill="#36C5F0" />
      <rect x="8.8" y="2" width="3.2" height="7" rx="1.6" fill="#2EB67D" />
      <rect x="11" y="8.8" width="7" height="3.2" rx="1.6" fill="#ECB22E" />
      <rect x="8" y="11" width="3.2" height="7" rx="1.6" fill="#E01E5A" />
    </svg>
  );
}

const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;
/** The plain glyphs: a webhook, a file, an envelope, a bell. */
const PLAIN: Record<PlainService, string> = {
  webhook: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  csv: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4",
  email: "M4 6h16v12H4zM4 7l8 6 8-6",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
};
/** A brand service's name, for its lettered tile when there is no icon. */
const LETTER: Record<BrandService, string> = { google: "G", slack: "S", claude: "C", "claude-code": "C", chatgpt: "G", cursor: "C", granola: "G", linkedin: "in", stripe: "S" };

function Glyph({ service, size }: { service: Service; size: number }) {
  if (service === "google") return <GoogleMark size={size} />;
  if (service === "slack") return <SlackMark size={size} />;
  if (!isBrand(service))
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
        <path d={PLAIN[service]} {...line} />
      </svg>
    );
  return (
    <span className="svc-letter" style={{ fontSize: Math.max(9, Math.round(size * 0.58)) }}>
      {LETTER[service]}
    </span>
  );
}

export function ServiceIcon({ service, size = 16, fallback, className }: { service: Service; size?: number; /** Drawn in place of the built-in glyph while there is no icon. */ fallback?: ReactNode; className?: string }) {
  const src = isBrand(service) ? `/api/logo/svc/${service}` : null;
  const [state, setState] = useState<"wait" | "ok" | "none">(() => (!src || NONE.has(src) ? "none" : LOADED.has(src) ? "ok" : "wait"));
  const img = useRef<HTMLImageElement>(null);
  const judge = (i: HTMLImageElement) => {
    if (!src) return;
    // A 204 (no icon), a blank or a tiny image: the glyph stays.
    if (i.naturalWidth >= 16) (LOADED.add(src), setState("ok"));
    else (NONE.add(src), setState("none"));
  };
  // An icon that loaded before the page came alive fires no load event: look once.
  useEffect(() => {
    const i = img.current;
    if (i?.complete) judge(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  return (
    <span className={`svc-i svc-${service} svc-${state}${className ? ` ${className}` : ""}`} style={{ width: size, height: size }} aria-hidden>
      {state !== "ok" && (fallback ?? <Glyph service={service} size={size} />)}
      {src && state !== "none" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={img} src={src} alt="" width={size} height={size} decoding="async" onLoad={(e) => judge(e.currentTarget)} onError={() => (NONE.add(src), setState("none"))} />
      )}
    </span>
  );
}
