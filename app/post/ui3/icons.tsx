/** The new design's line icons (24 by 24, stroke 1.8, currentColor), from find-design/v5. Decorative unless labelled. */
const PATHS = {
  home: ['<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>', 1.8],
  orb: ['<circle cx="12" cy="10.5" r="6.5"/><path d="M7.5 20.5h9M9.5 17l-.8 3.5M14.5 17l.8 3.5"/><path d="M9.2 8.6a3.2 3.2 0 0 1 2.6-1.9"/>', 1.8],
  network: ['<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17.5" cy="9" r="2.4"/><path d="M16.5 14.3A4.6 4.6 0 0 1 21.5 19"/>', 1.8],
  building: ['<rect x="4" y="3.5" width="10.5" height="17" rx="1.5"/><path d="M14.5 9h4.5a1 1 0 0 1 1 1v10.5M7.5 7.5h4M7.5 11h4M7.5 14.5h4M3 20.5h18"/>', 1.8],
  route: ['<circle cx="5.5" cy="18" r="2.3"/><circle cx="18.5" cy="6" r="2.3"/><path d="M7.8 18H14a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h6.2"/>', 1.8],
  pipe: ['<rect x="3.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="9.8" y="4" width="4.5" height="11" rx="1.2"/><rect x="16" y="4" width="4.5" height="7" rx="1.2"/>', 1.8],
  doc: ['<path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M9 12.5h6M9 16h4"/>', 1.8],
  search: ['<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>', 1.8],
  plus: ['<path d="M12 5v14M5 12h14"/>', 2],
  check: ['<path d="m5 12.5 4.5 4.5L19 7.5"/>', 2.2],
  send: ['<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z"/>', 1.8],
  lock: ['<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8.5 11V7.8a3.5 3.5 0 0 1 7 0V11"/>', 1.8],
  down: ['<path d="m6 9 6 6 6-6"/>', 1.8],
  right: ['<path d="m9 6 6 6-6 6"/>', 1.8],
  arrow: ['<path d="M5 12h14M13 6l6 6-6 6"/>', 1.8],
  eye: ['<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>', 1.8],
  eyeoff: ['<path d="M3 3l18 18M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.7 3.4M6.6 6.6C3.9 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4.4-1.1"/>', 1.8],
  trend: ['<path d="M3.5 16.5 9 11l4 4 7.5-7.5"/><path d="M15 7.5h5.5V13"/>', 1.8],
  team: ['<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M18.5 8v6M15.5 11h6"/>', 1.8],
  door: ['<path d="M13.5 4H7a1 1 0 0 0-1 1v15h7.5"/><path d="M16 9l3.5 3.5L16 16M19.5 12.5H11"/>', 1.8],
  cal: ['<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>', 1.8],
  loop: ['<path d="M17 2.5l3 3-3 3"/><path d="M4 11V9.5a4 4 0 0 1 4-4h12"/><path d="M7 21.5l-3-3 3-3"/><path d="M20 13v1.5a4 4 0 0 1-4 4H4"/>', 1.8],
  globe: ['<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5a13 13 0 0 1 0 17M12 3.5a13 13 0 0 0 0 17"/>', 1.8],
  x: ['<path d="M6 6l12 12M18 6 6 18"/>', 2],
  copy: ['<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', 1.8],
  info: ['<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>', 1.8],
  spark: ['<path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2z"/>', 1.8],
  mail: ['<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>', 1.8],
  sun: ['<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>', 1.8],
  moon: ['<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>', 1.8],
  link: ['<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>', 1.8],
  brief: ['<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 13h18"/>', 1.8],
  seat: ['<path d="M6.5 11V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v6"/><path d="M4.5 11h15v4h-15zM6.5 15v6M17.5 15v6"/>', 1.8],
  pin: ['<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>', 1.8],
  sliders: ['<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>', 1.8],
  star: ['<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>', 1.8],
  bolt: ['<path d="M13 2.5 4.5 14H11l-1 7.5L18.5 10H12z"/>', 1.8],
  more: ['<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>', 1.8],
  person: ['<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>', 1.8],
  filter: ['<path d="M4 6h16M7 12h10M10 18h4"/>', 1.8],
  dots: ['<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>', 1.8],
  bookmark: ['<path d="M6.5 4h11v16.5L12 16.5l-5.5 4z"/>', 1.6],
  hide: ['<path d="M3 3l18 18M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.7 3.4M6.6 6.6C3.9 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4.4-1.1"/>', 1.6],
  diamond: ['<path d="M12 3.5 20.5 12 12 20.5 3.5 12z"/>', 1.6],
  calnew: ['<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17M12 13v5M9.5 15.5h5"/>', 1.6],
  sparkle: ['<path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.7l-1.6-5.5L5 10.6 10.4 9z"/><path d="M18.5 3v3M17 4.5h3M5.5 17v3M4 18.5h3"/>', 1.6],
  layers: ['<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5"/>', 1.6],
  sprout: ['<path d="M12 20v-8"/><path d="M12 12c0-4 3-6.5 7.5-6.5 0 4.5-3 6.5-7.5 6.5z"/><path d="M12 14.5C12 11 9.5 9 5 9c0 3.8 2.6 5.5 7 5.5z"/>', 1.6],
  flag: ['<path d="M6 21V4"/><path d="M6 4.5h10.5l-2 4 2 4H6"/>', 1.6],
  check2: ['<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.8-5"/>', 1.6],
  user: ['<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>', 1.6],
  target: ['<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>', 1.6],
  flow: ['<rect x="3.5" y="4" width="6" height="5" rx="1.3"/><rect x="14.5" y="15" width="6" height="5" rx="1.3"/><path d="M6.5 9v3.5a2 2 0 0 0 2 2h5.5a2 2 0 0 1 2 2V15"/><circle cx="17.5" cy="6.5" r="2.5"/>', 1.8],
  contract: ['<path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M8.5 16.5c1.2-1.6 2.2-1.6 2.8 0 .6 1.4 1.4 1.3 2.4-.2M9 11.5h6"/>', 1.8],
  vault: ['<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5v1.2M12 14.3v1.2M15.5 12h-1.2M9.7 12H8.5M3.5 9h-1.5M3.5 15h-1.5"/>', 1.8],
  chat: ['<path d="M20.5 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.8A7.5 7.5 0 1 1 20.5 12z"/>', 1.8],
  gear: ['<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 1.7],
  bell: ['<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>', 1.8],
  grid: ['<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>', 1.8],
  back: ['<path d="M19 12H5M11 6l-6 6 6 6"/>', 1.8],
  coin: ['<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.6.8-2.6 2s1.1 1.6 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.1 0-2-.4-2.5-1.2M12 6.5V8M12 16v1.5"/>', 1.8],
  logout: ['<path d="M14 4.5H6.5a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5H14M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5"/>', 1.8],
  panel: ['<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M15 4v16"/>', 1.8],
} as const;
export type IconName = keyof typeof PATHS;

export function Ic({ n, className, size, label }: { n: IconName; className?: string; size?: number; label?: string }) {
  const [d, w] = PATHS[n];
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
      // Our own static path data.
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}
