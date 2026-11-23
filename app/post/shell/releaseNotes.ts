/**
 * The words of "What's new in Merlin" (shell/WhatsNew.tsx), pure, so scripts/test-firstvisit.mts
 * reads the same lines the page shows: the release notes for members who used the old look.
 */
import type { ShellPage } from "./pages";

/** The strip key the dismissal is kept under. */
export const WHATS_NEW_KEY = "whatsnew";

/** Each line, and the page it points to.  */
export const WHATS_NEW: { key: string; text: string; go: string; page: ShellPage; find?: "lookup" }[] = [
  { key: "lists", text: "Saved views are lists now, each with its own alert. They left the side menu: your lists are on Home and in Find.", go: "Open Find", page: "find" },
  { key: "search", text: "Search moved to Find: look up any company by name there, or filter the whole table. Press / on any page to start.", go: "Open Find", page: "find", find: "lookup" },
  { key: "invite", text: "Invite a fractional moved to Credits and usage, under Ways to earn, and to Fractionals. You both still get the bonus.", go: "Open Credits and usage", page: "credits" },
  { key: "settings", text: "Settings is one page: your profile, ideal client, writing voice, connections, notifications, signature, privacy, plan and your data.", go: "Open Settings", page: "settings" },
  { key: "alerts", text: "Alerts and workflows shows every alert in one table, with where each goes and how often.", go: "Open Alerts", page: "alerts" },
];

/** Whether the notes show for this member: the new look on, and not closed before (on this device or another). */
export const whatsNewShown = (x: { ui2: boolean; stripsOff?: string[] | null; gone: boolean }) => x.ui2 && !x.gone && !(x.stripsOff ?? []).includes(WHATS_NEW_KEY);
