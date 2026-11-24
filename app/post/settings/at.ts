/**
 * Where Settings opens (settings/SettingsPage.tsx): a section, and a Connections row to open. Small
 * and loaded with the shell (shell/pages.tsx imports it), so it reads the address the member
 * arrived on before the app rewrites it: an old ?p=integrations&slack=connected, Google's return
 * ?p=network&google=connected, or ?p=settings&sec=conn&open=google. In the app, openSettings sets
 * where to go and opens the page (a page already on screen moves there).
 */
import { settingsSecOf, type SettingsSection } from "../place";
// Granola's way back (?granola=connected) is read here too, with the shell, before the address is rewritten.
import "../granolaNotice";

export type ConnKey = "google" | "linkedin" | "lix" | "csv" | "slack" | "hook" | "granola" | "agent";
export const CONN_KEYS: readonly ConnKey[] = ["google", "linkedin", "lix", "csv", "slack", "hook", "granola", "agent"];
export type SlackNotice = "connected" | "denied" | "failed";

export interface SettingsAt {
  sec: SettingsSection | null;
  open: ConnKey | null;
}

/** Where an address lands: its section and the Connections row it opens (open=, or the source an old address came back from). */
export function atOf(search: string): SettingsAt {
  const q = new URLSearchParams(search);
  const want = q.get("open");
  const open: ConnKey | null =
    want && (CONN_KEYS as readonly string[]).includes(want) ? (want as ConnKey) : q.get("p") === "network" && q.has("google") ? "google" : q.get("p") === "integrations" && q.has("slack") ? "slack" : null;
  const sec = settingsSecOf(search);
  return { sec: open && !sec ? "conn" : sec, open };
}

const read = (): { at: SettingsAt | null; slack: SlackNotice | null } => {
  if (typeof window === "undefined") return { at: null, slack: null };
  const q = new URLSearchParams(window.location.search);
  const at = atOf(window.location.search);
  const v = q.get("slack");
  return { at: at.sec || at.open ? at : null, slack: v === "connected" || v === "denied" || v === "failed" ? v : null };
};
const first = read();
let pending: SettingsAt | null = first.at;
let slackNotice: SlackNotice | null = first.slack;
const subs = new Set<() => void>();

/** Where to open, once: the address the member arrived on, or the last openSettings. */
export function takeSettingsAt(): SettingsAt | null {
  const p = pending;
  pending = null;
  return p;
}
/** The "Add to Slack" answer the member came back with, once. */
export function takeSlackNotice(): SlackNotice | null {
  const n = slackNotice;
  slackNotice = null;
  return n;
}
export function onSettingsAt(f: () => void): () => void {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

/** Open Settings at a section (and a Connections row). `open` is the shell's openPage. */
export function openSettings(openPage: (p: "settings") => void, sec: SettingsSection, row?: ConnKey) {
  pending = { sec, open: row ?? null };
  subs.forEach((f) => f());
  openPage("settings");
}
