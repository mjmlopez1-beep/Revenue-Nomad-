/**
 * Checks of "Bring in your LinkedIn data export" (lib/linkedin): the member's own export, read in
 * their browser, and only the derived payload of each use they tick sent to Merlin.
 *
 *   npx tsx scripts/test-linkedin-export.mts      exits 1 on any failure
 *
 *  1. Which files: only the allowlisted names are read (exact names, at the top of the archive);
 *     Logins, Receipts, learning coach messages, Member_Follows and the rest never are.
 *  2. The archive: a synthetic ZIP (deflated and stored entries) is read in process with the
 *     browser's own DecompressionStream; the bytes of a file Merlin doesn't read are never even
 *     sliced out of the archive, and a secret planted in Logins and Receipts appears in no payload
 *     and no state.
 *  3. messages.csv: a big synthetic file (tens of thousands of rows, megabytes) gives one row per
 *     person with only { profileSlug, sent, received, first, last }; the words, subjects, titles and
 *     attachments are never put together (eachRecord's keep); counts, days, drafts, group blasts
 *     and the member's own profile are right.
 *  4. The payload, checked on the server: anything outside its shape is refused whole.
 *  5. The import: connections (old and December 2026 formats), invitations (accepted ones are
 *     connections; pending ones are weaker ties by profile link), warmth graded with Your network's
 *     words, recommendations matched by name AND company only, endorsements by link, roles offered
 *     but never added without the member's own Add, follows matched by exact name (a locked company
 *     described, not named), the voice kept as settings and never as text, skills only where empty,
 *     the proof text only with the tick and only on Close.
 *  6. Remove and closing the account delete all of it.
 *
 * No private data and no network: a made-up seed and state in a temporary folder, removed at the
 * end. Every person, company and file in them is made up.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 900)}`);
};

const DAY = 86_400_000;
const NOW = Date.now();
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const dayAgo = (d: number) => ago(d).slice(0, 10);
const dir = mkdtempSync(path.join(tmpdir(), "rn-lix-"));

/* ---------- the made-up seed and state ---------- */

const co = (id: string, name: string, website: string, industry: string, employees: string, hq: string) => ({ id, fields: { name, website, industry, employees, hq } });
const seed = {
  builtAt: ago(30),
  members: [
    { id: "mem_jordan", name: "Jordan Avery", email: "jordan@avery.example", title: "Member", token: "tok-jordan-lix-0001" },
    { id: "mem_free", name: "Frankie Free", email: "frankie@free.example", title: "Fractional CMO", token: "tok-free-lix-0001" },
  ],
  companies: [
    co("c_north", "Northwind Clinics", "northwind.example", "Hospitals and Health Care", "51-200", "Denver, CO"),
    co("c_cedar", "Cedar and Pine", "cedarpine.example", "Software Development", "11-50", "Austin, TX"),
    co("c_halcyon", "Halcyon Freight", "halcyon.example", "Truck Transportation", "201-500", "Dallas, TX"),
    co("c_lark", "Larkspur Learning", "larkspur.example", "E-Learning Providers", "51-200", "Boston, MA"),
  ],
  engagements: [{ id: "e_lark_mkt", companyId: "c_lark", fields: { source: "Published engagement", function: "Marketing", role: "Fractional CMO", operator: "Casey Vale", start: "2025-03", status: "Active", type: "Fractional" } }],
  contacts: [
    { id: "p_north_dana", companyId: "c_north", source: "Published engagement", fields: { name: "Dana Reyes", title: "CEO", relationship: "Decision maker", linkedin: "https://www.linkedin.com/in/dana-reyes-nw/" } },
    { id: "p_cedar_riley", companyId: "c_cedar", source: "Published engagement", fields: { name: "Riley Quinn", title: "COO", relationship: "Decision maker", linkedin: "https://www.linkedin.com/in/riley-quinn-cp" } },
    { id: "p_cedar_sky", companyId: "c_cedar", source: "Published engagement", fields: { name: "Sky Moss", title: "CFO", relationship: "Decision maker", linkedin: "https://www.linkedin.com/in/sky-moss-ca", location: "San Diego, California" } },
  ],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const trial = { trialStartedAt: ago(5), trialEndsAt: new Date(NOW + 16 * DAY).toISOString() };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: { "c_north.identity": ["mem_jordan"], "c_cedar.identity": ["mem_jordan"], "c_lark.identity": ["mem_jordan"] },
    seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(1)])),
    profiles: { mem_jordan: { onboarded: true }, mem_free: { function: "Marketing", title: "Fractional CMO", onboarded: true } },
    billing: { members: { mem_jordan: trial, mem_free: { trialStartedAt: ago(30), trialEndsAt: ago(9) } }, events: [], payments: [], ended: [] },
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_FREE_COMPANY: "off",
  RN_ID_SECRET: "test-id-secret-not-real",
  RN_BILLING: "1",
  RN_DIGEST: "0",
  STRIPE_SECRET_KEY: "sk_test_lix_made_up",
  STRIPE_WEBHOOK_SECRET: "whsec_test_lix_made_up",
  STRIPE_PRICE_MONTH: "price_month_lix",
  STRIPE_PRICE_YEAR: "price_year_lix",
});
for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RN_GOOGLE", "RESEND_API_KEY", "RN_SCAN", "RN_BACKUP_S3_ENDPOINT", "RN_SCAN_TEST", "RN_MCP_TEST", "RN_EMAIL_API_URL", "RN_LOCKED_MATCHES", "RN_SUGGEST", "RN_PATHS", "RN_ADMIN_EMAILS", "RN_REQUIRE_SEED", "RN_RADAR", "RN_OWNSITES"]) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

const JORDAN = "tok-jordan-lix-0001";
const FREE = "tok-free-lix-0001";
const stateFile = () => readFileSync(path.join(dir, "intel.json"), "utf8");

/* ---------- the made-up export ---------- */

const SECRETS = ["SECRET_LOGIN_TOKEN_9f3", "SECRET_RECEIPT_CARD_4242", "SECRET_PHONE_5550199", "SECRET_COACH_WORDS", "SECRET_MEMBER_FOLLOW", "SECRET_JOB_APPLICATION", "SECRET_INFERENCE"];
const WORDS = ["PLANTED_MESSAGE_WORDS", "PLANTED_SUBJECT_LINE", "PLANTED_CONVERSATION_TITLE", "PLANTED_ATTACHMENT_NAME", "PLANTED_INVITE_NOTE", "PLANTED_POSITION_DESC", "PLANTED_POST_TEXT", "PLANTED_REC_GIVEN_TEXT"];
const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
const csvOf = (head: string[], rows: string[][]) => [head.map(q).join(","), ...rows.map((r) => r.map(q).join(","))].join("\r\n");
const ME = "https://www.linkedin.com/in/jordan-avery-me";
const IN = (s: string) => `https://www.linkedin.com/in/${s}`;

const CONNECTIONS_OLD = [
  "Notes:",
  '"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address."',
  "",
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
  `Dana,Reyes,${IN("dana-reyes-nw")},,Northwind Clinics,CEO,12 Mar 2024`,
  `Pat,Lee,${IN("pat-lee-ll")},,Larkspur Learning,Director,01 Jan 2020`,
  `Alex,Kim,${IN("alex-kim-hf")},,Halcyon Freight,VP Operations,02 Jan 2025`,
  `Sam,Ortiz,${IN("sam-ortiz-x")},,Cedar and Pine,Engineer,02 Feb 2022`,
].join("\r\n");
const CONNECTIONS_NEW = ["Notes:", '"As of December 2026, your data download no longer includes your connections\' email addresses, current companies, or job titles."', "", "First Name,Last Name,URL,Connected On", `Dana,Reyes,${IN("dana-reyes-nw")},12 Mar 2024`, `Pat,Lee,${IN("pat-lee-ll")},01 Jan 2020`].join("\r\n");

const INVITATIONS = csvOf(
  ["From", "To", "Sent At", "Message", "Direction", "inviterProfileUrl", "inviteeProfileUrl"],
  [
    ["Riley Quinn", "Jordan Avery", "11/2/26, 9:14 AM", "PLANTED_INVITE_NOTE hello", "INCOMING", IN("riley-quinn-cp"), ME],
    ["Jordan Avery", "Dana Reyes", "1/5/24, 9:14 AM", "PLANTED_INVITE_NOTE", "OUTGOING", ME, IN("dana-reyes-nw")],
    ["Jordan Avery", "Sky Moss", "10/1/26, 8:00 AM", "", "OUTGOING", ME, IN("sky-moss-ca")],
    ["Jordan Avery", "Lou Nobody", "10/1/26, 8:00 AM", "", "OUTGOING", ME, IN("lou-nobody-zz")],
  ],
);
const POSITIONS = csvOf(
  ["Company Name", "Title", "Description", "Location", "Started On", "Finished On"],
  [
    ["Big Corp Example", "Account Executive", "PLANTED_POSITION_DESC", "Denver", "Jan 2015", "Dec 2019"],
    ["Cedar and Pine", "Interim CRO", "PLANTED_POSITION_DESC", "Austin", "Mar 2022", "Dec 2023"],
    ["Northwind Clinics", "Fractional VP Sales", "PLANTED_POSITION_DESC", "Remote", "Jan 2024", ""],
    ["Larkspur Learning", "Advisor", "", "", "Jun 2021", "Jan 2022"],
  ],
);
const MSG_HEAD = ["CONVERSATION ID", "CONVERSATION TITLE", "FROM", "SENDER PROFILE URL", "TO", "RECIPIENT PROFILE URLS", "DATE", "SUBJECT", "CONTENT", "FOLDER", "ATTACHMENTS", "IS MESSAGE DRAFT", "IS CONVERSATION DRAFT"];
const msg = (from: string, fromUrl: string, to: string, toUrls: string, d: string, extra: Partial<{ draft: string; folder: string }> = {}) => [
  `conv-${fromUrl.length}-${toUrls.length}`,
  "PLANTED_CONVERSATION_TITLE",
  from,
  fromUrl,
  to,
  toUrls,
  `${d} 14:22:11 UTC`,
  "PLANTED_SUBJECT_LINE",
  `PLANTED_MESSAGE_WORDS, with "quotes", commas and a\nline break`,
  extra.folder ?? "INBOX",
  "PLANTED_ATTACHMENT_NAME.pdf",
  extra.draft ?? "No",
  "No",
];
const small: string[][] = [];
// Dana: 7 each way, from 70 days ago to 10 days ago: a steady conversation (Strong).
for (let k = 0; k < 14; k++) small.push(k % 2 ? msg("Dana Reyes", IN("dana-reyes-nw"), "Jordan Avery", ME, dayAgo(70 - k * 4.6)) : msg("Jordan Avery", ME, "Dana Reyes", IN("dana-reyes-nw"), dayAgo(70 - k * 4.6)));
// Pat: one message the member sent 400 days ago (Fading).
small.push(msg("Jordan Avery", ME, "Pat Lee", IN("pat-lee-ll"), dayAgo(400)));
// A draft to Alex and spam from Alex: neither counts.
small.push(msg("Jordan Avery", ME, "Alex Kim", IN("alex-kim-hf"), dayAgo(3), { draft: "Yes" }));
small.push(msg("Alex Kim", IN("alex-kim-hf"), "Jordan Avery", ME, dayAgo(3), { folder: "SPAM" }));
// A blast to five people: counts for none of them.
small.push(msg("Jordan Avery", ME, "Five People", [1, 2, 3, 4, 5].map((n) => IN(`blast-${n}`)).join(","), dayAgo(5)));
// Riley (invited, not connected) wrote twice.
small.push(msg("Riley Quinn", IN("riley-quinn-cp"), "Jordan Avery", ME, dayAgo(20)));
small.push(msg("Riley Quinn", IN("riley-quinn-cp"), "Jordan Avery", ME, dayAgo(19)));
// A company page's InMail (no profile link): counts for nobody.
small.push(msg("Sponsored", "https://www.linkedin.com/company/sponsor-co", "Jordan Avery", ME, dayAgo(2)));
const MESSAGES_SMALL = csvOf(MSG_HEAD, small);
// The big one: 2,000 other people, 15 messages each, plus the ones above.
const big: string[][] = [...small];
for (let n = 0; n < 2000; n++) for (let k = 0; k < 15; k++) big.push(k % 3 ? msg("Jordan Avery", ME, `Filler ${n}`, IN(`filler-${n}`), dayAgo(800 - k)) : msg(`Filler ${n}`, IN(`filler-${n}`), "Jordan Avery", ME, dayAgo(800 - k)));
const MESSAGES_BIG = csvOf(MSG_HEAD, big);

const RECS_IN = csvOf(
  ["First Name", "Last Name", "Company", "Job Title", "Text", "Creation Date", "Status"],
  [
    ["Dana", "Reyes", "Northwind Clinics", "CEO", "Jordan rebuilt our sales motion in a quarter.", "03/01/26, 10:00 AM", "VISIBLE"],
    ["Pat", "Lee", "Some Other Co", "Director", "A good partner.", "03/02/26, 10:00 AM", "VISIBLE"],
    ["Sam", "Ortiz", "", "Engineer", "Kind words.", "03/03/26, 10:00 AM", "VISIBLE"],
    ["Hidden", "Person", "Halcyon Freight", "CEO", "Hidden text.", "03/04/26, 10:00 AM", "HIDDEN"],
  ],
);
const RECS_OUT = csvOf(["First Name", "Last Name", "Company", "Job Title", "Text", "Creation Date", "Status"], [["Alex", "Kim", "Halcyon Freight", "VP Operations", "PLANTED_REC_GIVEN_TEXT", "04/01/26, 10:00 AM", "VISIBLE"]]);
const END_IN = csvOf(["Endorsement Date", "Skill Name", "Endorser First Name", "Endorser Last Name", "Endorser Public Url", "Endorsement Status"], [["2025/01/01 10:00:00 UTC", "Sales", "Pat", "Lee", "www.linkedin.com/in/pat-lee-ll", "ACCEPTED"], ["2025/01/01 10:00:00 UTC", "Sales", "Not", "Known", "www.linkedin.com/in/not-a-tie", "ACCEPTED"]]);
const END_OUT = csvOf(["Endorsement Date", "Skill Name", "Endorsee First Name", "Endorsee Last Name", "Endorsee Public Url", "Endorsement Status"], [["2025/02/01 10:00:00 UTC", "Leadership", "Sam", "Ortiz", "www.linkedin.com/in/sam-ortiz-x", "ACCEPTED"]]);
const FOLLOWS = csvOf(["Organization", "Followed On"], [["Northwind Clinics", "Mon Jan 01 2024"], ["Halcyon Freight", "Mon Jan 01 2024"], ["Northwind Clinic", "Mon Jan 01 2024"], ["Nowhere Example Co", "Mon Jan 01 2024"]]);
const posts = Array.from({ length: 12 }, (_, k) => [`2026-${String((k % 9) + 1).padStart(2, "0")}-10 09:00:00`, `https://www.linkedin.com/feed/update/${k}`, `Hey folks! I'm stoked about this week. It's been super fun working with founders, and we don't slow down. ${k === 3 ? "PLANTED_POST_TEXT" : "Onward."}`, "", "", "MEMBER_NETWORK"]);
const SHARES = csvOf(["Date", "ShareLink", "ShareCommentary", "SharedUrl", "MediaUrl", "Visibility"], posts);
const COMMENTS = csvOf(["Date", "Link", "Message"], [["2026-10-01 10:00:00", "https://x.example", "Awesome work, folks! I'm so glad it's out."]]);
const RICH = csvOf(["Date/Time", "Media Description", "Media Link"], [["2026-10-02 10:00:00", "Our team at the offsite, super proud of everyone here!", "https://x.example/m"]]);
const SKILLS = csvOf(["Name"], [["Sales Strategy"], ["Revenue Operations"], ["Salesforce"], ["Sales Management"]]);

const NEVER_FILES: [string, string][] = [
  ["Logins.csv", csvOf(["Login Date", "IP Address", "User Agent", "Login Type"], [["2026-01-01", "203.0.113.9", "SECRET_LOGIN_TOKEN_9f3", "WEB"]])],
  ["Receipts.csv", csvOf(["Transaction Made At", "Card", "Total Amount"], [["2026-01-01", "SECRET_RECEIPT_CARD_4242", "59.00"]])],
  ["PhoneNumbers.csv", csvOf(["Extension", "Number", "Type"], [["", "SECRET_PHONE_5550199", "Mobile"]])],
  ["learning_coach_messages.csv", csvOf(MSG_HEAD, [msg("Coach", IN("coach-x"), "Jordan Avery", ME, dayAgo(1)).map((x) => x.replace("PLANTED_MESSAGE_WORDS", "SECRET_COACH_WORDS"))])],
  ["Member_Follows.csv", csvOf(["Date", "FullName", "Status"], [["2026-01-01", "SECRET_MEMBER_FOLLOW", "Active"]])],
  ["Jobs/Job Applications.csv", csvOf(["Application Date", "Company Name", "Job Title"], [["2026-01-01", "SECRET_JOB_APPLICATION", "VP"]])],
  ["Inferences_about_you.csv", csvOf(["Category", "Type of inference", "Inference"], [["x", "y", "SECRET_INFERENCE"]])],
  // A file in a folder with an allowlisted name: never read either.
  ["Jobs/messages.csv", csvOf(MSG_HEAD, [msg("Coach", IN("coach-y"), "Jordan Avery", ME, dayAgo(1)).map((x) => x.replace("PLANTED_MESSAGE_WORDS", "SECRET_COACH_WORDS"))])],
];

/** A ZIP archive, built here: deflated entries, one stored. Returns the bytes and where each entry's data sits. */
function zipOf(files: [string, string][]): { bytes: Uint8Array; spans: Map<string, [number, number]> } {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  const spans = new Map<string, [number, number]>();
  let off = 0;
  for (const [name, body] of files) {
    const raw = Buffer.from(body, "utf8");
    const stored = name === "Skills.csv";
    const data = stored ? raw : deflateRawSync(raw);
    const nameB = Buffer.from(name, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(stored ? 0 : 8, 8);
    lh.writeUInt32LE(0, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameB.length, 26);
    lh.writeUInt16LE(0, 28);
    const at = off;
    parts.push(lh, nameB, data);
    spans.set(name, [at + 30 + nameB.length, at + 30 + nameB.length + data.length]);
    off += 30 + nameB.length + data.length;
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(stored ? 0 : 8, 10);
    ch.writeUInt32LE(0, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameB.length, 28);
    ch.writeUInt32LE(at, 42);
    central.push(ch, nameB);
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(off, 16);
  return { bytes: new Uint8Array(Buffer.concat([...parts, cd, end])), spans };
}

/** A File-like source that records every byte range read from it. */
function recorded(name: string, bytes: Uint8Array) {
  const blob = new Blob([bytes]);
  const reads: [number, number][] = [];
  return {
    reads,
    file: {
      name,
      size: blob.size,
      slice: (a: number, b: number) => {
        reads.push([a, b]);
        return blob.slice(a, b);
      },
    },
  };
}

async function main() {
  const F = await import("../lib/linkedin/files.ts");
  const R = await import("../lib/linkedin/read.ts");
  const Z = await import("../lib/linkedin/zip.ts");
  const VT = await import("../lib/linkedin/types.ts");
  const VO = await import("../lib/voice.ts");

  /* ---------- 1. which files ---------- */
  console.log("\nWhich files Merlin reads");
  const yes = ["Connections.csv", "connections.csv", "Invitations.csv", "Positions.csv", "messages.csv", "Messages.CSV", "Recommendations_Received.csv", "Recommendations Received.csv", "Recommendations_Given.csv", "Endorsement_Received_Info.csv", "Endorsement_Given_Info.csv", "Company Follows.csv", "Company_Follows.csv", "Shares.csv", "Comments.csv", "Rich_Media.csv", "Rich Media.csv", "Skills.csv"];
  check("every allowlisted name is read, whatever its case, spaces or underscores", yes.every((n) => F.classify(n) !== null), yes.filter((n) => !F.classify(n)));
  const no = ["Logins.csv", "Security Challenges.csv", "Receipts.csv", "Receipts_v2.csv", "PhoneNumbers.csv", "Whatsapp Phone Numbers.csv", "Email Addresses.csv", "Registration.csv", "Ad_Targeting.csv", "Ads Clicked.csv", "LAN Ads Engagement.csv", "Inferences_about_you.csv", "Inferred Credibility Scores.csv", "SearchQueries.csv", "Job Applications.csv", "Saved Jobs.csv", "SavedJobAlerts.csv", "Job Seeker Preferences.csv", "Verifications.csv", "Learning.csv", "Events.csv", "Votes.csv", "Reactions.csv", "Member_Follows.csv", "Hashtag_Follows.csv", "Causes You Care About.csv", "Providers.csv", "Profile.csv", "Profile Summary.csv", "Education.csv", "Volunteering.csv", "Notes.csv", "learning_coach_messages.csv", "guide_messages.csv", "coach_messages.csv", "messages.txt", "Connections.xlsx"];
  check("none of the never-read files is read (exact names only: learning coach and guide messages are not messages)", no.every((n) => F.classify(n) === null), no.filter((n) => F.classify(n)));
  check("the consent screen's never list names Logins, Receipts, phone numbers, ads data and the coach messages", ["Logins", "Receipts", "PhoneNumbers", "Ad_Targeting", "Inferences_about_you", "learning_coach_messages", "Member_Follows", "Education", "Notes"].every((n) => F.NEVER_READ.includes(n)) && F.NEVER_WORDS.some((w) => /messages' words/.test(w)));
  const ent = F.readableEntries(["Basic_Export/Connections.csv", "Basic_Export/messages.csv", "Basic_Export/Jobs/messages.csv", "Basic_Export/Logins.csv"]);
  check("an archive of the export's folder: its top folder counts as the top; a file in a deeper folder is never read", ent.size === 2 && ent.get("Basic_Export/messages.csv") === "messages" && !ent.has("Basic_Export/Jobs/messages.csv"), [...ent]);
  const ent2 = F.readableEntries(["Connections.csv", "Jobs/Job Applications.csv", "Jobs/messages.csv"]);
  check("at the archive's root: only root files", ent2.size === 1 && ent2.has("Connections.csv"), [...ent2]);

  /* ---------- 2. the archive ---------- */
  console.log("\nThe archive, read on the device");
  const allFiles: [string, string][] = [
    ["Connections.csv", CONNECTIONS_OLD],
    ["Invitations.csv", INVITATIONS],
    ["Positions.csv", POSITIONS],
    ["messages.csv", MESSAGES_BIG],
    ["Recommendations_Received.csv", RECS_IN],
    ["Recommendations_Given.csv", RECS_OUT],
    ["Endorsement_Received_Info.csv", END_IN],
    ["Endorsement_Given_Info.csv", END_OUT],
    ["Company Follows.csv", FOLLOWS],
    ["Shares.csv", SHARES],
    ["Comments.csv", COMMENTS],
    ["Rich_Media.csv", RICH],
    ["Skills.csv", SKILLS],
    ...NEVER_FILES,
  ];
  const z = zipOf(allFiles);
  const src = recorded("Basic_LinkedInDataExport_11-23-2026.zip", z.bytes);
  check("the made-up messages.csv is big: tens of thousands of rows, megabytes", big.length > 30_000 && MESSAGES_BIG.length > 8_000_000, { rows: big.length, bytes: MESSAGES_BIG.length });
  const list = await Z.listZip(src.file);
  check("the table of contents lists every entry", list.length === allFiles.length, list.length);
  const t0 = Date.now();
  const rd = await R.readExport([src.file]);
  const took = Date.now() - t0;
  check("every allowlisted file is found, with what it holds", rd.found.connections === 4 && rd.found.positions === 4 && (rd.found.messages ?? 0) > 30_000 && rd.found.companyFollows === 4 && rd.found.skills === 4, rd.found);
  check("every other file is listed as never read, by name", NEVER_FILES.every(([n]) => rd.skipped.includes(n.split("/").pop()!)), rd.skipped);
  const touched = (span: [number, number]) => src.reads.some(([a, b]) => a < span[1] && b > span[0]);
  const neverTouched = NEVER_FILES.filter(([n]) => touched(z.spans.get(n)!));
  check("the bytes of a file Merlin doesn't read are never sliced out of the archive (only its name in the table of contents)", neverTouched.length === 0, neverTouched.map(([n]) => n));
  check("the allowlisted files are read", touched(z.spans.get("messages.csv")!) && touched(z.spans.get("Skills.csv")!));
  check(`a big export reads in reasonable time on the device (${took} ms)`, took < 30_000, took);
  const all = R.readExport.length >= 0 ? rd.payload(["know", "seats", "warm", "vouch", "follows", "skills", "voice", "proof"]) : null;
  const json = JSON.stringify(all);
  check("no planted secret from Logins, Receipts, phone numbers, coach messages, member follows, job applications or inferences is in the payload", SECRETS.every((x) => !json.includes(x)), SECRETS.filter((x) => json.includes(x)));
  check("no message words, subject, conversation title, attachment, invitation note, position description, post or given recommendation is in the payload", WORDS.every((x) => !json.includes(x)), WORDS.filter((x) => json.includes(x)));
  check("the payload's keys are only the ones each use names", Object.keys(all!).every((k) => ["v", "uses", "files", "connections", "invites", "positions", "warm", "recs", "endorsements", "follows", "voice", "skills"].includes(k)), Object.keys(all!));
  check("warmth rows carry only profileSlug, sent, received, first and last", all!.warm!.every((w) => Object.keys(w).sort().join(",") === "first,last,profileSlug,received,sent"), all!.warm![0]);
  const noProof = rd.payload(["know", "vouch"]);
  check("without the proof tick, no recommendation text is sent at all", noProof.recs!.every((r) => r.text === undefined) && !JSON.stringify(noProof).includes("rebuilt our sales motion"));
  check("with it, only a received recommendation's text", all!.recs!.filter((r) => r.text).every((r) => r.k === "in") && JSON.stringify(all).includes("rebuilt our sales motion"));
  const off = rd.payload(["know"]);
  check("an unticked use sends nothing of its own (Who you know only: no warmth, roles, follows, voice or skills)", !off.warm && !off.positions && !off.follows && !off.voice && !off.skills && !off.recs && !!off.connections && !!off.invites, Object.keys(off));
  check("the voice is off by default and so is Evidence Bank", !VT.USES_ON_BY_DEFAULT.includes("voice") && !VT.USES_ON_BY_DEFAULT.includes("proof") && VT.USES_ON_BY_DEFAULT.includes("know"));

  // Picked as CSV files instead of the archive.
  const asFile = (name: string, body: string) => {
    const b = new Blob([body]);
    return { name, size: b.size, slice: (a: number, c: number) => b.slice(a, c) };
  };
  const picked = await R.readExport([asFile("Connections.csv", CONNECTIONS_NEW), asFile("Logins.csv", NEVER_FILES[0][1]), asFile("guide_messages.csv", NEVER_FILES[3][1])]);
  check("several CSVs picked: matched by name, the rest never read", picked.found.connections === 2 && picked.skipped.includes("Logins.csv") && picked.skipped.includes("guide_messages.csv") && !JSON.stringify(picked.payload(["know"])).includes("SECRET_LOGIN"), [picked.found, picked.skipped]);

  /* ---------- 3. messages.csv ---------- */
  console.log("\nmessages.csv: who and when, never what");
  const heads: (string | undefined)[][] = [];
  R.eachRecord(MESSAGES_SMALL, (r) => void heads.push(r), { isHeader: (r) => r.includes("CONTENT"), keepFor: (h) => (i) => h[i] !== "CONTENT" && h[i] !== "SUBJECT" });
  const ci = MSG_HEAD.indexOf("CONTENT");
  check("a skipped column is never put together as text (undefined in every record), while the kept ones are", heads.length === small.length && heads.every((r) => r[ci] === undefined && r[MSG_HEAD.indexOf("SUBJECT")] === undefined && r[MSG_HEAD.indexOf("DATE")]!.endsWith("UTC")), heads[0]);
  const mw = R.messageWarmth(MESSAGES_SMALL);
  check("the member is the profile that sent the most", mw.me === "jordan-avery-me", mw.me);
  const by = new Map(mw.rows.map((r) => [r.profileSlug, r]));
  const dana = by.get("dana-reyes-nw");
  check("Dana: 7 sent, 7 received, first and last day right", dana?.sent === 7 && dana.received === 7 && dana.first === dayAgo(70) && dana.last === small.filter((r) => r[3].includes("dana") || r[5].includes("dana")).map((r) => r[6].slice(0, 10)).sort().pop(), dana);
  check("Pat: 1 sent, 0 received, 400 days ago", by.get("pat-lee-ll")?.sent === 1 && by.get("pat-lee-ll")?.received === 0 && by.get("pat-lee-ll")?.last === dayAgo(400), by.get("pat-lee-ll"));
  check("a draft and spam don't count (Alex), a blast to five counts for none, a company page's InMail for nobody", !by.has("alex-kim-hf") && ![1, 2, 3, 4, 5].some((n) => by.has(`blast-${n}`)) && mw.rows.length === 3, [...by.keys()]);
  check("the member's own profile is never a row", !by.has("jordan-avery-me"));
  check("the output holds no word of any message", !JSON.stringify(mw).includes("PLANTED"));
  const bigW = R.messageWarmth(MESSAGES_BIG);
  check(`the big file: at most ${VT.LIX_LIMITS.warm} people, the most messaged first, Dana in`, bigW.rows.length === 2003 && bigW.rows.length <= VT.LIX_LIMITS.warm && bigW.rows[0].sent + bigW.rows[0].received === 15 && bigW.rows.some((r) => r.profileSlug === "dana-reyes-nw"), bigW.rows.length);

  /* ---------- 4. the payload, checked on the server ---------- */
  console.log("\nThe payload, checked on the server");
  const L = await import("../lib/linkedin/index.ts");
  const refused = (p: unknown) => {
    try {
      L.cleanPayload(p);
      return false;
    } catch {
      return true;
    }
  };
  const ok = { v: 1, uses: ["warm"], files: ["messages"], warm: [{ profileSlug: "dana-reyes-nw", sent: 1, received: 2, first: "2026-01-01", last: "2026-02-01" }] };
  check("a payload in its shape is taken", !refused(ok));
  check("a warmth row with the message words in it is refused whole", refused({ ...ok, warm: [{ ...ok.warm[0], content: "hi" }] }));
  check("an unknown field is refused (no raw file rides along)", refused({ ...ok, logins: "x" }) && refused({ ...ok, messages: MESSAGES_SMALL }));
  check("a Sales Navigator id is refused as a profile link", refused({ ...ok, warm: [{ ...ok.warm[0], profileSlug: "acwaaabcdefghijklmnopqrstuvwx" }] }));
  check("data without its use ticked is refused", refused({ ...ok, uses: ["know"] }) && refused({ v: 1, uses: ["vouch"], files: [], recs: [{ f: "A", l: "B", c: "C", k: "in", text: "words" }] }));
  check("a given recommendation's text is refused even with the tick", refused({ v: 1, uses: ["proof", "vouch"], files: [], recs: [{ f: "A", l: "B", c: "C", k: "out", text: "words" }] }));
  check("too many rows, a bad day or a negative count are refused", refused({ ...ok, warm: Array.from({ length: VT.LIX_LIMITS.warm + 1 }, () => ok.warm[0]) }) && refused({ ...ok, warm: [{ ...ok.warm[0], first: "yesterday" }] }) && refused({ ...ok, warm: [{ ...ok.warm[0], sent: -1 }] }));
  check("a voice with a phrase lifted from a post is refused (only style conclusions)", refused({ v: 1, uses: ["voice"], files: [], voice: { ...VO.NEUTRAL_VOICE, phrases: ["PLANTED_POST_TEXT with a link https://x.example"] } }));
  check("a function from outside the list is refused", refused({ v: 1, uses: ["skills"], files: [], skills: { fn: "Wizardry" } }));

  /* ---------- 5. the import ---------- */
  console.log("\nThe import");
  const P = await import("../lib/paths/index.ts");
  const t = await import("../lib/table.ts");
  const pub = (id: string) => t.tableInternals.pubId(id);
  const before = await t.loadState();
  const engBefore = JSON.stringify([before.engagements ?? [], before.companies ?? []]);
  const voiceFrom = rd.voice(null);
  check("the voice from the posts, by rules on the device: casual, contractions, exclamation marks sometimes, no phrase", !!voiceFrom && voiceFrom.formality === "casual" && voiceFrom.contractions === true && voiceFrom.exclamations === "sometimes" && voiceFrom.phrases.length === 0, voiceFrom);
  const im = await L.importExport(JORDAN, all);
  check("the import says what came in, in counts", /Brought in 4 connections, 3 invited, warmth for 2,003 people, 4 roles to confirm as seats, 2 companies to follow\. Only you see it\./.test(im.message), im.message);
  const st = stateFile();
  check("the state holds no planted secret and no message, subject, title, attachment, note, description, post or given text", [...SECRETS, ...WORDS].every((x) => !st.includes(x)), [...SECRETS, ...WORDS].filter((x) => st.includes(x)));
  const s1 = await t.loadState();
  const lix = (s1 as unknown as { paths: Record<string, { lix: import("../lib/linkedin/types.ts").ExportStore; linkedin: { rows: unknown[] } }> }).paths.mem_jordan;
  check("kept for the member alone in State.paths, beside the connections file", !!lix.lix && lix.linkedin.rows.length === 4 && lix.lix.connections === true);
  check("invitations: the accepted one (Dana) is a connection, the pending ones are kept by link and name, never the note", (lix.lix.invites ?? []).map((x) => x.u).sort().join(",") === "lou-nobody-zz,riley-quinn-cp,sky-moss-ca" && (lix.lix.invites ?? []).every((x) => Object.keys(x).every((k) => ["u", "n", "out", "d"].includes(k))), lix.lix.invites);
  check("Who vouched: Dana (recommended you, same name and company) and Alex (you recommended), Pat (endorsed you by link), Sam (you endorsed by link)", JSON.stringify(lix.lix.vouch) === JSON.stringify({ "dana-reyes-nw": "r", "alex-kim-hf": "R", "pat-lee-ll": "e", "sam-ortiz-x": "E" }), lix.lix.vouch);
  check("a recommendation with the same name and another company, or no company, flags nobody (never a name alone)", !/pat-lee-ll":"[^"]*r/.test(JSON.stringify(lix.lix.vouch)) && !/sam-ortiz-x":"[^"]*r/.test(JSON.stringify(lix.lix.vouch)));
  check("an endorsement from someone who is no tie is dropped", !JSON.stringify(lix.lix.vouch).includes("not-a-tie"));
  check("the proof: kept with the tick on Close, by first name and company only", (lix.lix.proof ?? []).length === 3 && lix.lix.proof!.every((r) => Object.keys(r).every((k) => ["id", "first", "company", "text", "d"].includes(k))) && lix.lix.proof!.some((r) => r.first === "Dana" && r.company === "Northwind Clinics") && !JSON.stringify(lix.lix.proof).includes("Reyes"), lix.lix.proof);
  check("roles are offered, never added: the companies and seats on file are just as before", JSON.stringify([s1.engagements ?? [], s1.companies ?? []]) === engBefore);
  const voice = (s1 as unknown as { voice: Record<string, Record<string, unknown>> }).voice.mem_jordan;
  check("the voice is kept as settings only: the voice's own fields, when and by whom", Object.keys(voice).every((k) => [...VO.VOICE_FIELDS, "at", "by"].includes(k)) && voice.by === "you" && voice.formality === "casual" && !JSON.stringify(voice).includes("stoked"), voice);
  check("skills filled the empty function and title (Sales, the current role's title)", s1.profiles.mem_jordan.function === "Sales" && s1.profiles.mem_jordan.title === "Fractional VP Sales", s1.profiles.mem_jordan);

  const kv = (await P.knownView(JORDAN)) as import("../lib/paths/types.ts").KnownView;
  const kp = (name: string) => kv.people.find((p) => p.name === name);
  // Acceptance F1 (owner rule): a relationship band only from mail and calendar recency or messages on Merlin. The export's
  // messages and vouches say how the two are connected, in words, and still order the ways in; they show no band.
  check("Dana's 14 LinkedIn messages are said in words, with no band and no 'last message on Merlin'", kp("Dana Reyes")?.warmth === null && /14 LinkedIn messages both ways/.test(kp("Dana Reyes")!.why) && kp("Dana Reyes")?.lastKind === null, kp("Dana Reyes"));
  check("Pat at Larkspur: one message over a year ago and an endorsement, in words, no band", kp("Pat Lee")?.warmth === null && /1 LinkedIn message/.test(kp("Pat Lee")!.why) && /Endorsed you/.test(kp("Pat Lee")!.why), kp("Pat Lee"));
  check("...and the export still orders who comes first: Dana (messages both ways) before Riley (an invitation)", kv.people.findIndex((p) => p.name === "Dana Reyes") < kv.people.findIndex((p) => p.name === "Riley Quinn"), kv.people.map((p) => p.name));
  check("Alex, whom the member recommended, is at least Good", kp("Alex Kim")?.warmth === "Warm" || kp("Alex Kim") === undefined, kp("Alex Kim"));
  check("Riley (a pending invitation) is placed at Cedar by profile link alone, marked invited, weaker than a connection", !!kp("Riley Quinn") && /Invited you on LinkedIn, not connected yet/.test(kp("Riley Quinn")!.why) && kp("Riley Quinn")!.company === pub("c_cedar"), kp("Riley Quinn"));
  check("Sky (invited, in California by her own location) is never placed or named", !kp("Sky Moss"));
  check("Lou (invited, on file nowhere) is no way in", !kp("Lou Nobody"));
  const cedar = ((await P.companyPaths(JORDAN, pub("c_cedar"))) as import("../lib/paths/types.ts").CompanyPathsView).paths;
  const north = ((await P.companyPaths(JORDAN, pub("c_north"))) as import("../lib/paths/types.ts").CompanyPathsView).paths;
  const rileyP = cedar.find((p) => p.via.name === "Riley Quinn");
  const danaP = north.find((p) => p.via.name === "Dana Reyes");
  check("a way in through Dana (Strong) scores above one through Riley (invited)", !!rileyP && !!danaP && danaP.score > rileyP.score, [danaP?.score, rileyP?.score]);
  const W = await import("../lib/paths/ways.ts");
  const way = (await W.wayIn(JORDAN, pub("c_north"))) as import("../lib/paths/types.ts").WayInView;
  const dRoute = way.routes.find((r) => r.nodes.some((n) => n.label === "Dana Reyes"));
  check("Your way in: the link to Dana rests on the LinkedIn messages, said in counts", !!dRoute && /LinkedIn messages both ways/.test(dRoute.links[0].words), dRoute?.links);

  const ev = (await L.exportView(JORDAN)) as import("../lib/linkedin/types.ts").ExportView;
  check("the view says what came in and when", !!ev.info && ev.info.counts.connections === 4 && ev.info.counts.warm === 2003, ev.info);
  check("These look like your seats: the fractional, interim and advisor titles first, the full-time one last", ev.seats.map((x) => x.kind ?? "-").join(",") === "fractional,interim,advisor,-" && ev.seats[0].company === "Northwind Clinics" && ev.seats[0].active && ev.seats[3].company === "Big Corp Example", ev.seats.map((x) => `${x.kind}:${x.company}`));
  check("each says which company on Merlin it is, by its exact name", ev.seats[0].companyId === pub("c_north") && ev.seats[3].companyId === null);
  check("follows matched by exact name only: Northwind and Halcyon, not 'Northwind Clinic' or a company not on Merlin", ev.follows.map((f) => f.id).sort().join(",") === [pub("c_north"), pub("c_halcyon")].sort().join(","), ev.follows);
  const hal = ev.follows.find((f) => f.id === pub("c_halcyon"));
  check("a locked company to follow is described by its facts, never named", hal?.name === null && /Freight/.test(hal.facts) && !/Halcyon/.test(JSON.stringify(hal)), hal);
  check("nothing is followed until the member ticks it", ev.follows.every((f) => !f.following));
  await t.perform(JORDAN, { type: "follow", companyId: pub("c_halcyon"), on: true });
  const ev2 = (await L.exportView(JORDAN)) as import("../lib/linkedin/types.ts").ExportView;
  check("the member's tick follows it with the existing follow action (a locked one too)", ev2.follows.find((f) => f.id === pub("c_halcyon"))?.following === true && ev2.follows.find((f) => f.id === pub("c_north"))?.following === false);
  // Confirm one role with the existing Add, as the page does; Not a seat on another.
  const off0 = ev.seats[0];
  await t.perform(JORDAN, { type: "add", company: off0.company, newEngagement: true, engagementFields: { operator: "Jordan Avery", role: off0.title, ...(off0.fn ? { function: off0.fn } : {}), start: off0.from!, status: "Active" }, operatorMemberId: "me" });
  await L.seatOfferDone(JORDAN, off0.key, "added");
  await L.seatOfferDone(JORDAN, ev.seats[3].key, "no");
  const ev3 = (await L.exportView(JORDAN)) as import("../lib/linkedin/types.ts").ExportView;
  const s2 = await t.loadState();
  const added = [...(s2.engagements ?? [])].filter((e) => e.by === "mem_jordan");
  check("Confirm is the existing Add: one seat, only the ticked one; Not a seat goes off the list", added.length === 1 && ev3.seats.length === 2 && !ev3.seats.some((x) => x.key === off0.key || x.key === ev.seats[3].key), { added: added.length, left: ev3.seats.map((x) => x.company) });

  // The December 2026 format, through the export: names and profile links, carried over by link only.
  const rd2 = await R.readExport([asFile("Connections.csv", CONNECTIONS_NEW)]);
  await t.tableInternals.mutate((s) => void ((s as unknown as { paths: Record<string, { imports?: string[] }> }).paths.mem_jordan.imports = []));
  const im2 = await L.importExport(JORDAN, rd2.payload(["know"]));
  const s3 = await t.loadState();
  const rows3 = (s3 as unknown as { paths: Record<string, { linkedin: { rows: { u?: string; c?: string }[] } }> }).paths.mem_jordan.linkedin.rows;
  check("a names-only file in a newer export keeps what the older one said about the same profile links", /Brought in 2 connections/.test(im2.message) && rows3.find((r) => r.u === "dana-reyes-nw")?.c === "Northwind Clinics", [im2.message, rows3]);

  // The proof needs Close.
  const rdF = await R.readExport([asFile("Recommendations_Received.csv", RECS_IN)]);
  const imF = await L.importExport(FREE, rdF.payload(["proof"]));
  const sF = await t.loadState();
  check("on Free, the proof's text isn't kept, and the member is told why", /part of Close/.test(imF.message) && !JSON.stringify((sF as unknown as { paths: Record<string, unknown> }).paths.mem_free).includes("rebuilt our sales"), imF.message);

  /* ---------- 6. Remove, and closing the account ---------- */
  console.log("\nRemove and closing the account");
  await t.tableInternals.mutate((s) => void ((s as unknown as { paths: Record<string, { imports?: string[] }> }).paths.mem_jordan.imports = []));
  await L.importExport(JORDAN, all);
  const pr = (await L.exportView(JORDAN)) as import("../lib/linkedin/types.ts").ExportView;
  await L.removeProof(JORDAN, pr.proof[0].id);
  check("one recommendation can be taken out of Evidence Bank", ((await L.exportView(JORDAN)) as import("../lib/linkedin/types.ts").ExportView).proof.length === pr.proof.length - 1);
  await L.removeExport(JORDAN);
  const s4 = await t.loadState();
  const p4 = (s4 as unknown as { paths?: Record<string, { lix?: unknown; linkedin?: unknown }> }).paths?.mem_jordan;
  check("Remove deletes the export and the connections it brought", !p4?.lix && !p4?.linkedin, p4);
  const st4 = stateFile();
  check("nothing from the export is left in the state (no warmth, invitation, vouch or proof)", !st4.includes("riley-quinn-cp") && !st4.includes("filler-1") && !st4.includes("rebuilt our sales") && !st4.includes("dana-reyes-nw\":\"r"));
  const kv4 = (await P.knownView(JORDAN)) as import("../lib/paths/types.ts").KnownView;
  check("and every way in found from it goes", !kv4.people.some((p) => p.src.includes("linkedin")));
  await t.tableInternals.mutate((s) => {
    const ps = ((s as unknown as { paths?: Record<string, { imports?: string[] }> }).paths ??= {});
    (ps.mem_jordan ??= {}).imports = [];
  });
  await L.importExport(JORDAN, all);
  const A = await import("../lib/account.ts");
  await A.closeAccount(JORDAN, { origin: "https://post.example.com" });
  await A.purgeDue(NOW + 31 * DAY);
  const s5 = await t.loadState();
  check("closing the account deletes the export with the rest of the member's files", !(s5 as unknown as { paths?: Record<string, unknown> }).paths?.mem_jordan && !stateFile().includes("riley-quinn-cp") && !stateFile().includes("filler-7"));

  /* ---------- the words ---------- */
  console.log("\nThe words");
  const code = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
  const data = code("app/data/DataFlows.tsx");
  check("/data never names LinkedIn and has no em dash", !/LinkedIn/i.test(data) && !data.includes("—"));
  check("/data and docs/data-flows.md say what the export brings in", /connections export/i.test(data) && /lib\/linkedin/.test(code("docs/data-flows.md")));
  check("the request-early line, in the app", VT.ASK_EARLY.includes("December 2026") && /ASK_EARLY/.test(code("app/post/network/ExportPanel.tsx")));
  check("no upload of the archive from the page: only the derived payload is posted", !/FormData|readAsDataURL|body: file\b|body: f\b/.test(code("app/post/network/ExportPanel.tsx")) && /payload\(/.test(code("app/post/network/ExportPanel.tsx")));
}

main()
  .catch((e) => {
    failed++;
    console.error(e);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
