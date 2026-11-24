/**
 * Which files of the member's own LinkedIn data export Merlin reads (lib/linkedin), and the
 * ones it never reads. Pure: the browser asks it before it opens anything, and the checks ask it
 * too (scripts/test-linkedin-export.mts).
 *
 * The rule is an allowlist, never a blocklist: a file is read only when its name is exactly one of
 * READS below (case, spaces, underscores and hyphens aside, at the top of the archive). Everything
 * else in the archive is never decompressed, never read and never sent: the browser sees only its
 * name in the archive's table of contents. NEVER_READ lists the files LinkedIn's export holds that
 * Merlin leaves alone, for the consent screen; a file that is on neither list is left alone too.
 */

/** What each file Merlin reads is for. */
export type ExportFile =
  | "connections"
  | "invitations"
  | "positions"
  | "messages"
  | "recsReceived"
  | "recsGiven"
  | "endorseReceived"
  | "endorseGiven"
  | "companyFollows"
  | "shares"
  | "comments"
  | "richMedia"
  | "skills";

/** The files Merlin reads: its key, the name it has in the export, and what Merlin takes from it. */
export const READS: { key: ExportFile; name: string; takes: string }[] = [
  { key: "connections", name: "Connections.csv", takes: "Names, profile links and the day you connected (companies and titles where the file has them)" },
  { key: "invitations", name: "Invitations.csv", takes: "Who you invited or who invited you, by profile link. Never the note" },
  { key: "positions", name: "Positions.csv", takes: "Your own roles: company, title and dates. Never the description" },
  { key: "messages", name: "messages.csv", takes: "Who you write to, how often and when. The words are dropped on your device" },
  { key: "recsReceived", name: "Recommendations_Received.csv", takes: "Who recommended you (and the text, only if you tick Evidence Bank)" },
  { key: "recsGiven", name: "Recommendations_Given.csv", takes: "Who you recommended. Never the text" },
  { key: "endorseReceived", name: "Endorsement_Received_Info.csv", takes: "Who endorsed you, by profile link" },
  { key: "endorseGiven", name: "Endorsement_Given_Info.csv", takes: "Who you endorsed, by profile link" },
  { key: "companyFollows", name: "Company Follows.csv", takes: "The companies you follow, by name" },
  { key: "shares", name: "Shares.csv", takes: "Your own posts, read on your device for your voice only (opt-in)" },
  { key: "comments", name: "Comments.csv", takes: "Your own comments, read on your device for your voice only (opt-in)" },
  { key: "richMedia", name: "Rich_Media.csv", takes: "Your own media captions, read on your device for your voice only (opt-in)" },
  { key: "skills", name: "Skills.csv", takes: "Your skills, to suggest your function" },
];

/**
 * The files of LinkedIn's export Merlin never reads, said plainly on the consent screen. Not the
 * rule (the rule is READS): a list for the member to see.
 */
export const NEVER_READ: string[] = [
  "Logins",
  "Security Challenges",
  "Receipts",
  "PhoneNumbers",
  "Whatsapp Phone Numbers",
  "Email Addresses",
  "Registration",
  "Ad_Targeting",
  "Ads Clicked",
  "LAN Ads Engagement",
  "Inferences_about_you",
  "Inferred Credibility Scores",
  "SearchQueries",
  "Job Applications",
  "Saved Jobs",
  "SavedJobAlerts",
  "Job Seeker Preferences",
  "Verifications",
  "Learning",
  "Events",
  "Votes",
  "Reactions",
  "Member_Follows",
  "Hashtag_Follows",
  "Causes",
  "Providers",
  "Profile",
  "Profile Summary",
  "Education",
  "Volunteering",
  "Notes",
  "learning_coach_messages",
  "guide_messages",
  "coach_messages",
];

/** The kinds of data in NEVER_READ, in words: "It never reads: your messages' words, logins, receipts, ...". */
export const NEVER_WORDS = [
  "your messages' words, subjects and attachments",
  "logins and security challenges",
  "receipts and payments",
  "phone numbers and email addresses",
  "ads data and what LinkedIn infers about you",
  "searches, job applications and saved jobs",
  "learning, events, reactions and votes",
  "your profile summary, education and notes",
];

/** A file name as the rule compares it: the last part of its path, no extension, lowercase, no spaces, underscores or hyphens. */
export const fileKey = (name: string) =>
  String(name ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const BY_KEY = new Map<string, ExportFile>(READS.map((r) => [fileKey(r.name), r.key]));

/**
 * Which file Merlin reads this is, or null for every other file. Exact name only: "messages.csv"
 * is read, "learning_coach_messages.csv" and "guide_messages.csv" are not; "Company Follows.csv" is
 * read, "Member_Follows.csv" is not. A CSV only.
 */
export function classify(name: string): ExportFile | null {
  if (!/\.csv$/i.test(String(name ?? "").trim())) return null;
  return BY_KEY.get(fileKey(name)) ?? null;
}

/**
 * The archive's entries Merlin may read: classify, and only at the top of the archive (an archive
 * of the export's folder has every entry under one folder: that folder counts as the top). A file
 * in any other folder (LinkedIn keeps job and learning files in their own) is never read.
 */
export function readableEntries(names: string[]): Map<string, ExportFile> {
  const files = names.filter((n) => !n.endsWith("/"));
  const dirs = files.map((n) => n.split("/").slice(0, -1).join("/"));
  const top = dirs.length && dirs.every((d) => d && d.split("/")[0] === dirs[0].split("/")[0]) ? dirs[0].split("/")[0] : "";
  const out = new Map<string, ExportFile>();
  for (const n of files) {
    const dir = n.split("/").slice(0, -1).join("/");
    if (dir !== top) continue;
    const k = classify(n);
    if (k && ![...out.values()].includes(k)) out.set(n, k);
  }
  return out;
}

/** The name of a file Merlin never opened, as the consent screen lists it: its name without folders. */
export const shownFileName = (n: string) => String(n).split("/").pop() ?? n;
