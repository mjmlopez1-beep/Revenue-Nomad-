/**
 * What members read about prices, without a server: the Claude connector's words and unlock
 * plans for the bundles and the order of purchases (lib/mcp/tools.ts, lib/mcp/server.ts), and the
 * landing page's "What's free and what costs a credit" and Questions (app/landing/prices.ts, faq.ts).
 *
 *   npx tsx scripts/test-prices.mts
 *
 * The view data is shaped the way the server sends it (lib/table.ts): a seat's end month that
 * only says the seat is still going comes as a value, so does the other half of a pair the member
 * holds, and the role of a seat found on LinkedIn with nobody named is a value or a lock as
 * SEAT_SCAN_ROLE_FREE says. Both ways are checked. What the connector adds on top:
 * - who held a seat and the role they held read and unlock as one purchase;
 * - a person's LinkedIn, email and phone read "opens after the name", and unlock refuses them
 *   until the member can see the name and title;
 * - at a locked company, people and seat holders read "opens after the company", and unlock
 *   refuses them until the company is unlocked (or puts the company first for "everything").
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Cell, CompanyRec, EngagementRec, PersonRec, View } from "../lib/tableTypes";

const dir = mkdtempSync(path.join(tmpdir(), "rn-connector-"));
process.env.RN_DATA_DIR = dir;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 400)}`}`);
};
const throws = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

const v = (x: string): Cell => ({ s: "value", v: x, ver: 0 });
const L: Cell = { s: "locked", ver: 0 };
const E: Cell = { s: "empty" };

function seat(id: string, cells: Record<string, Cell>, extra: Partial<EngagementRec> = {}): EngagementRec {
  return { id, source: "Published engagement", verified: false, cells: { operator: E, ...cells }, people: [], updatedAt: null, yours: false, ...extra } as EngagementRec;
}
function person(id: string, cells: Record<string, Cell>): PersonRec {
  return { id, engagementId: null, source: "member", cells: { name: E, title: E, relationship: E, email: E, phone: E, linkedin: E, ...cells } };
}
function company(id: string, name: string, engagements: EngagementRec[], people: PersonRec[], hidden = false): CompanyRec {
  return {
    id,
    name,
    ...(hidden ? { hidden: true } : {}),
    iconDomain: null,
    cells: { industry: v("SaaS"), employees: v("51–200"), revenue: v("$5M–$20M"), website: hidden ? L : v(`${id}.example.com`) },
    engagements,
    people,
    following: false,
    facts: { known: 0, locked: 0, missing: 0 },
    updatedAt: null,
    mine: false,
    friendly: { score: 50, tier: null, fractional: 2, open: hidden ? 1 : 0, functions: ["Sales", "Marketing"], operators: 1, recent: 0, hiring: [] },
  } as unknown as CompanyRec;
}

async function main() {
  const T = await import("../lib/mcp/tools");
  const { INSTRUCTIONS } = await import("../lib/mcp/server");
  const { deriveAll } = await import("../app/post/model");

  // A company the member can see.
  const held = seat("s_held", { function: v("Sales"), type: v("Fractional"), status: v("Ended"), start: v("2024-01"), end: L, operator: L, role: L });
  const going = seat("s_going", { function: v("Marketing"), type: v("Fractional"), status: v("Active"), start: v("2025-03"), end: v("Ongoing"), operator: L, role: L });
  // Found on LinkedIn, nobody named: the role is a lock (SEAT_SCAN_ROLE_FREE false) or a value (true).
  const foundLocked = seat("s_found_locked", { function: v("RevOps"), type: v("Fractional"), start: v("2025-01"), role: L }, { source: "Seat scan", claimable: true });
  const foundFree = seat("s_found_free", { function: v("RevOps"), type: v("Fractional"), start: v("2025-02"), role: v("Fractional Head of RevOps") }, { source: "Seat scan", claimable: true });
  const unseen = person("p_unseen", { name: L, title: L, relationship: v("Decision maker"), email: L, linkedin: L });
  const seen = person("p_seen", { name: v("Rae Reader"), title: v("CEO"), relationship: v("Decision maker"), email: L });
  const open = company("c_open", "Qa Open Co", [held, going, foundLocked, foundFree], [unseen, seen]);
  // A locked company: an open role, a past seat with its holder on file, and a decision maker.
  const role = seat("s_role", { function: v("Marketing"), type: v("Fractional"), status: v("Open role"), role: v("Fractional CMO"), posting: L, rate: L }, { source: "Demand scan", opened: "2026-11-10", closed: null });
  const past = seat("s_past", { function: v("Sales"), type: v("Fractional"), status: v("Ended"), start: v("2023-01"), operator: L, role: L });
  const boss = person("p_boss", { name: L, title: L, relationship: v("Decision maker"), linkedin: L });
  const locked = company("c_locked", "Locked company", [role, past], [boss], true);

  const infos = deriveAll([open, locked]);
  const [io, il] = infos;
  const mv = {
    view: { contact: { support: null, intro: null } } as unknown as View,
    infos,
    byId: new Map(infos.map((i) => [i.c.id, i])),
    bySeat: new Map(infos.flatMap((i) => i.engs.map((e) => [e.id, i] as const))),
    byPerson: new Map(infos.flatMap((i) => i.people.map(({ p }) => [p.id, i] as const))),
  };

  /* ---------- how locked facts read ---------- */
  const sHeld = T.seatOut(held, io, mv);
  check("who held a seat and the role they held read as one purchase", sHeld.seat_holder === T.LOCKED_SEAT && sHeld.role === T.LOCKED_SEAT, sHeld);
  check("a dated end on a seat that ended is its own credit", sHeld.end === T.LOCKED, sHeld.end);
  const sGoing = T.seatOut(going, io, mv);
  check("an end month that only says the seat is going shows free, as the server sends it", sGoing.end === "Ongoing" && sGoing.seat_holder === T.LOCKED_SEAT, sGoing);
  const sFoundL = T.seatOut(foundLocked, io, mv);
  const sFoundF = T.seatOut(foundFree, io, mv);
  check("a seat found on LinkedIn with nobody named: no holder to unlock, its role a credit of its own (SEAT_SCAN_ROLE_FREE false)", sFoundL.seat_holder === "Nobody named yet" && sFoundL.role === T.LOCKED && !!sFoundL.claimable, sFoundL);
  check("the same seat with the role free (SEAT_SCAN_ROLE_FREE true) shows the role", sFoundF.role === "Fractional Head of RevOps" && sFoundF.seat_holder === "Nobody named yet", sFoundF);
  const pUnseen = T.personOut(unseen);
  check("a person's name and title read as one purchase", pUnseen.name === T.LOCKED_PERSON && pUnseen.title === T.LOCKED_PERSON && pUnseen.relationship === "Decision maker", pUnseen);
  check("their LinkedIn and email read 'opens after the name'", pUnseen.email === T.AFTER_NAME && pUnseen.linkedin === T.AFTER_NAME && /^opens after the name/.test(T.AFTER_NAME), pUnseen);
  check("once the name and title show, the email is 1 credit", T.personOut(seen).email === T.LOCKED, T.personOut(seen));
  const sPast = T.seatOut(past, il, mv);
  // Fellow fractionals are free (PEERS_FREE): at a locked company who held a seat reads "free once the company is open".
  check("at a locked company, who held a seat and its role read 'free once the company is open'", sPast.seat_holder === T.AFTER_COMPANY_SEAT && sPast.role === T.AFTER_COMPANY_SEAT && /^free once the company is open/.test(T.AFTER_COMPANY_SEAT), sPast);
  check("an open role there still comes with the company (2 credits)", T.seatOut(role, il, mv).posting === "on file, unlocks with the company (2 credits)", T.seatOut(role, il, mv));
  const pBoss = T.personOut(boss, null, true);
  check("a person at a locked company reads 'opens after the company', name, title and LinkedIn", pBoss.name === T.AFTER_COMPANY && pBoss.title === T.AFTER_COMPANY && pBoss.linkedin === T.AFTER_COMPANY, pBoss);

  /* ---------- warm paths ---------- */
  const wOpen = T.warmPaths(io);
  const wHeld = wOpen.find((w) => w.seat_id === "s_held") as Record<string, any> | undefined;
  const wBoss = wOpen.find((w) => w.person_id === "p_unseen") as Record<string, any> | undefined;
  // A seat holder still locked at a company the member sees is one who keeps out of the directory: 1 credit, and it says why.
  check("a warm path to a locked seat holder (out of the directory) unlocks who held it and the role they held for 1 credit", wHeld?.unlock?.field === "seat_holder" && wHeld.opens === "who held it and the role they held, 1 credit (this fractional keeps out of the directory)" && wHeld.name === T.LOCKED_SEAT, wHeld);
  check("a warm path to a person unlocks their name and title for 1 credit", wBoss?.unlock?.field === "name" && wBoss.opens === "their name and title, 1 credit", wBoss);
  const wLocked = T.warmPaths(il);
  check(
    "at a locked company every warm path says to unlock the company first, and offers no unlock of its own",
    wLocked.length === 2 &&
      wLocked.every((w: Record<string, any>) => w.unlock === undefined && w.unlock_first?.entity === "company" && w.unlock_first.field === "identity" && w.name === (w.seat_id ? T.AFTER_COMPANY_SEAT : T.AFTER_COMPANY)),
    wLocked,
  );

  /* ---------- what everything costs: one per purchase ---------- */
  // Visible company: held (holder+role, end), going (holder+role), found (role), unseen (name+title, email, LinkedIn), seen (email) = 8.
  check("unlocking everything counts who held a seat with their role once, and a name with its title once", T.purchases(io) === 8, T.purchases(io));
  const onlyFree = deriveAll([company("c_free", "Qa Free Co", [foundFree], [])])[0];
  const onlyLocked = deriveAll([company("c_lock", "Qa Lock Co", [foundLocked], [])])[0];
  check("the role of a found seat counts as a purchase only while it is locked", T.purchases(onlyLocked) === 1 && T.purchases(onlyFree) === 0, [T.purchases(onlyLocked), T.purchases(onlyFree)]);

  /* ---------- unlock: what one call buys, and what has to come first ---------- */
  const plan = (entity: string, id: string, field: string) => T.unlockItems(mv as never, entity, id, field);
  const byRole = plan("seat", "s_held", "role");
  const byHolder = plan("seat", "s_held", "seat_holder");
  check(
    "asking for the role or for who held it buys the one purchase, on the seat holder",
    JSON.stringify(byRole.items) === JSON.stringify([{ entity: "engagement", id: "s_held", field: "operator" }]) && JSON.stringify(byHolder.items) === JSON.stringify(byRole.items) && byRole.what === "who held this seat and the role they held",
    [byRole, byHolder],
  );
  const allHeld = plan("seat", "s_held", "everything");
  check("everything on a seat asks for who held it once (with the role) and the dated end", allHeld.items.map((t) => t.field).sort().join() === "end,operator", allHeld.items);
  check("the role of a found seat with nobody named is its own purchase while locked", JSON.stringify(plan("seat", "s_found_locked", "role").items) === JSON.stringify([{ entity: "engagement", id: "s_found_locked", field: "role" }]));
  check("and nothing to buy once it is free", plan("seat", "s_found_free", "role").items.length === 0);
  check("an ongoing end month is nothing to buy", plan("seat", "s_going", "end").items.length === 0);
  check("a person's email before their name is refused: unlock their name and title first", /^Unlock their name and title first/.test(throws(() => plan("person", "p_unseen", "email")) ?? ""), throws(() => plan("person", "p_unseen", "email")));
  check("so is their LinkedIn", /^Unlock their name and title first/.test(throws(() => plan("person", "p_unseen", "linkedin")) ?? ""));
  const title = plan("person", "p_unseen", "title");
  check("asking for the title buys the name and title together", title.items.length === 1 && title.what === "the person's name and title", title);
  check("with the name showing, the email is 1 credit on its own", JSON.stringify(plan("person", "p_seen", "email").items) === JSON.stringify([{ entity: "contact", id: "p_seen", field: "email" }]));
  const allUnseen = plan("person", "p_unseen", "everything");
  check("everything about a person buys the name and title once, then the rest", allUnseen.items.length === 3 && allUnseen.items.filter((t) => t.field === "name" || t.field === "title").length === 1, allUnseen.items);
  check("who held a seat at a locked company is refused: unlock the company first", /^Unlock the company first/.test(throws(() => plan("seat", "s_past", "seat_holder")) ?? "") && /^Unlock the company first/.test(throws(() => plan("seat", "s_past", "role")) ?? ""));
  check("so is a person there", /^Unlock the company first/.test(throws(() => plan("person", "p_boss", "name")) ?? "") && /^Unlock the company first/.test(throws(() => plan("person", "p_boss", "linkedin")) ?? ""));
  const allBoss = plan("person", "p_boss", "everything");
  check("everything about a person at a locked company puts the company first", allBoss.items[0]?.entity === "company" && allBoss.items[0].field === "identity" && /^the company first/.test(allBoss.what), allBoss);
  const allPast = plan("seat", "s_past", "everything");
  check("so does everything on a seat there", allPast.items[0]?.entity === "company" && allPast.items.some((t) => t.field === "operator") && !allPast.items.some((t) => t.field === "role"), allPast.items);
  const posting = plan("seat", "s_role", "posting");
  check("an open role's posting at a locked company is the company's one credit, as before", posting.items.length === 1 && posting.items[0].entity === "company" && posting.target.entity === "company", posting);

  /* ---------- the instructions say the same ---------- */
  check(
    "the instructions say fellow fractionals are free, contact details open after the name and keep their price, and people after the company",
    /Fellow fractionals are free on every plan/.test(INSTRUCTIONS) &&
      /Contact details \(email, phone, LinkedIn\) and the company's own people \(decision makers, leaders, the hiring exec\) keep their prices/.test(INSTRUCTIONS) &&
      /LinkedIn, email and phone open only after that/.test(INSTRUCTIONS) &&
      /its people open only after the company, and who held its seats shows free once it is open/.test(INSTRUCTIONS) &&
      INSTRUCTIONS.includes("Pro opens everything. Credits are only for email and phone numbers, which come from fellow fractionals.") &&
      /up to 40 companies a UTC day, each opened in full/.test(INSTRUCTIONS) &&
      /end month while the seat is still going/.test(INSTRUCTIONS),
  );
  check("the instructions keep the rule: never spend a credit without asking", /Never spend a credit without asking/.test(INSTRUCTIONS));

  /* ---------- the landing page and Questions say the same ---------- */
  const { priceMatrix } = await import("../app/landing/prices");
  const { faqItems } = await import("../app/landing/faq");
  const row = (m: ReturnType<typeof priceMatrix>, e: string) => m.find((r) => r.entity === e)!;
  const paid = priceMatrix(false);
  const seatPaid = row(paid, "engagement");
  // Fellow fractionals are free (PEERS_FREE): who held a seat, with the role, is on the free side now.
  check(
    "the matrix shows who held a seat with the role they held as free, one chip",
    seatPaid.free.includes("Who held it, with the role they held") && !seatPaid.locked.includes("Who held it, with the role they held") && !seatPaid.locked.includes("Seat holder") && !seatPaid.locked.includes("Role") && /free once you can see the company/.test(seatPaid.note ?? ""),
    seatPaid,
  );
  const seatOld = row(priceMatrix(false, false), "engagement");
  check("with PEERS_FREE off it would sell them as one chip, first, as before", seatOld.locked[0] === "Who held it, with the role they held", seatOld.locked);
  check(
    "an end month is free while the seat is going, and a credit only once it ended",
    seatPaid.free.includes("End month while the seat is going") && seatPaid.locked.includes("End month of a seat that ended") && !seatPaid.locked.includes("End month"),
    seatPaid,
  );
  check("with SEAT_SCAN_ROLE_FREE off, the role of a seat with nobody named is a credit of its own", seatPaid.locked.includes("Role of a seat with nobody named") && !seatPaid.free.includes("Role of a seat with nobody named"));
  const seatFree = row(priceMatrix(true), "engagement");
  check("with it on, that role is free", seatFree.free.includes("Role of a seat with nobody named") && !seatFree.locked.includes("Role of a seat with nobody named"), seatFree);
  const co = row(paid, "company");
  check("the company's name is not free: name and website are one 2-credit unlock", !co.free.includes("Name") && co.locked[0] === "Name and website" && co.price === "2 credits" && /2 credits show the company/.test(co.note ?? ""), co);
  check("no copy says a company shows again when its role closes", !/everyone sees the company again/.test(JSON.stringify(paid)) && !faqItems(5).some((q: unknown) => /everyone sees the company again|1 credit shows the company/.test(JSON.stringify(q))));
  const contact = row(paid, "contact");
  check(
    "a contact's name and title are one chip, and the profile link, email and phone open after it (the landing page never names LinkedIn)",
    contact.locked[0] === "Name and title" && !contact.locked.includes("Title") && ["Profile link", "Email", "Phone"].every((x) => contact.locked.includes(x)) && /open after that, 1 credit each/.test(contact.note ?? "") && !/linkedin/i.test(JSON.stringify(paid)),
    contact,
  );
  check("a locked company's seat holders show free after the company, its people open after it", /Who held its seats then shows free, and its people open after it/.test(row(paid, "company").note ?? ""));
  const faq = (free: boolean) => new Map(faqItems(25, true, free));
  const fq = faq(false);
  // Free's free company a day is Crystal Ball's, fully open; Pro opens every company in it free.
  const cost = fq.get("What does it cost?") ?? "";
  check(
    "Questions: Free opens one Crystal Ball company a day, Pro opens everything, the trial 40 companies a day",
    /open one company a day from your Crystal Ball for free, with everything on it/.test(cost) && cost.includes("Pro opens everything. Credits are only for email and phone numbers, which come from fellow fractionals. The trial opens up to 40 companies a day, with everything on them.") && !/unlock one company a day for free/.test(cost),
    cost,
  );
  // Fellow fractionals are free (PEERS_FREE).
  check("Questions: who held a seat and the role they held are free once the company is visible", /free to see once you can see the company: fellow fractionals never cost a credit/.test(fq.get("How do I reach the fractional who held a seat?") ?? ""));
  check("Questions: Fractionals never costs a credit", /It never costs a credit/.test(fq.get("What is Fractionals?") ?? "") && !/costs 1 credit to see who they are/.test(fq.get("What is Fractionals?") ?? ""));
  check("Questions: no outcome-based price anywhere", ![...fq.values()].some((a) => /succes{2} fee|% of|percent of|per placement|when you win/i.test(a)));
  check("Questions: a seat's end month is free while it is going", /end month while the seat is still going/.test(fq.get("What does a seat cost to see?") ?? ""));
  check("Questions: contact details open after the name", /profile link, email and phone open after that, 1 credit each/.test(fq.get("What does a hiring contact cost?") ?? ""));
  check("the company's website and profile link open with its name, never on the free side", !co.free.includes("Website") && !co.free.includes("LinkedIn") && co.locked[0] === "Name and website", co.free);
  check("Questions: people at a locked company open after the company", /open after the company/.test(fq.get("What does an open role cost?") ?? ""));
  check(
    "Questions: the role of a seat with nobody named follows SEAT_SCAN_ROLE_FREE both ways",
    /the role is 1 credit on its own/.test(fq.get("What does a seat cost to see?") ?? "") && /the role is free/.test(faq(true).get("What does a seat cost to see?") ?? ""),
  );
  check("no line says one credit shows one thing, or that most seat holders are members", ![...fq.values()].some((a) => /one thing|Most seat holders are/.test(a)));

  console.log("\nThe landing page's use cases: alerts, workflows, Evidence Bank, Agent access, said as the rules gate them");
  {
    const R0 = await import("../lib/billing/rules");
    const CP0 = await import("../lib/billing/compare");
    const on = CP0.landingMoreRows(true);
    const off = CP0.landingMoreRows(false);
    const wfRow = on.find((r) => r[0] === "Workflows (Beta)");
    const W = R0.WORKFLOW_PLAN;
    check(
      "Workflows row: Free 1 with free steps, Pro 10 with paid steps, Close 25 with proposal triggers and the Evidence Bank step",
      !!wfRow && wfRow[1] === `${W.free.flows} workflow, free steps only` && W.free.flows === 1 && !W.free.paid && wfRow[2].startsWith(`Up to ${W.pro.flows},`) && W.pro.flows === 10 && W.pro.paid && /proposal triggers and the Evidence Bank step/.test(wfRow[3]) && W.close.flows === 25 && W.close.evidence && !W.pro.evidence,
      wfRow,
    );
    check("Workflows are named only when the server has them on", !off.some((r) => /Workflow/.test(r[0])) && on.length === off.length + 1);
    const ev = on.find((r) => r[0] === "Evidence Bank");
    check("Evidence Bank is Close's: the trial only on Free and Pro", !!ev && ev[1] === "In your trial only" && ev[2] === "In your trial only" && /past results/.test(ev[3]));
    const ag = on.find((r) => /Agent access/.test(r[0]));
    check("Agent access follows FREE_MCP_PER_DAY, Pro and Close the app's Claude row", !!ag && ag[1] === `${R0.FREE_MCP_PER_DAY} requests a day` && JSON.stringify(ag.slice(1)) === JSON.stringify(CP0.PLAN_ROWS.find((r) => r[0] === "Claude")!.slice(1)));
    const al = on.find((r) => r[0] === "Alerts on your lists");
    check("alerts: Free one list by email and the bell, each morning or weekly; Pro as it happens with Slack", !!al && al[1].startsWith(`${R0.FREE_SAVED_VIEWS} list, by email and the bell`) && R0.FREE_ALERT_EVERY.join() === "daily,weekly" && /as it happens, in Slack too/.test(al[2]));
    check("the rate row is the app's own", JSON.stringify(on.at(-1)) === JSON.stringify(CP0.PLAN_ROWS.find((r) => r[0] === "Rate benchmarks")));
    check("no price, percentage, export or download in the added rows", !/\$|%|export|csv|download/i.test(JSON.stringify(on)));
    const q = (live: { workflows?: boolean; google?: boolean }) => new Map(faqItems(25, true, false, live));
    const qOff = q({});
    const qOn = q({ workflows: true, google: true });
    check("Questions: workflows and Google are asked only when on", !qOff.has("What are workflows?") && !qOff.has("What does Merlin do with my Google account?") && qOn.has("What are workflows?") && qOn.has("What does Merlin do with my Google account?"));
    check("Questions: workflows say Beta, drafts only, and the plan gates", /in Beta/.test(qOn.get("What are workflows?")!) && /Nothing is ever sent for you/.test(qOn.get("What are workflows?")!) && /Free has 1 workflow with the free steps, Pro up to 10 with the steps that cost credits, and Close up to 25/.test(qOn.get("What are workflows?")!));
    check("Questions: Google is private, never shown to another member, never an email's text", /never shown to another member or an admin/.test(qOn.get("What does Merlin do with my Google account?")!) && /never its subject or text/.test(qOn.get("What does Merlin do with my Google account?")!));
    check("Questions: a warm way in names Google only when on", !/Google/.test(qOff.get("How does Merlin find a warm way in?")!) && /or Google/.test(qOn.get("How does Merlin find a warm way in?")!) && /connections file/.test(qOff.get("How does Merlin find a warm way in?")!));
    check("Questions: alerts, lookalikes, Agent access and Evidence Bank are asked", ["How do alerts work?", "What are lookalikes?", "Can I use Merlin from my own AI assistant?", "What is the Evidence Bank?"].every((k) => qOff.has(k)));
    check("Questions: Agent access asks before it spends and has no limit unless set", /asks before it spends one/.test(qOff.get("Can I use Merlin from my own AI assistant?")!) && /no daily spend limit unless you set one/.test(qOff.get("Can I use Merlin from my own AI assistant?")!));
    check("Questions: Evidence Bank is Close's", /part of Close/.test(qOff.get("What is the Evidence Bank?")!));
    const words = JSON.stringify([...qOn.entries()]);
    check("Questions: no LinkedIn, no em dash, no export, Merlin never a data provider", !/linkedin|—|export|download|\bcsv\b|data provider/i.test(words), (words.match(/.{30}(linkedin|—|export|download|csv|data provider).{30}/i) ?? [])[0]);
  }

  console.log("\nThe landing page's panels: five jobs, Close it and Workflows, nothing left only in a table");
  {
    const { readFileSync } = await import("node:fs");
    // The panels hold their pictures as JSX, and tsx compiles JSX to React.createElement.
    (globalThis as { React?: unknown }).React = (await import("react")).default;
    const F = await import("../app/landing/Features");
    const off = F.features({ workflows: false, google: false });
    const on = F.features({ workflows: true, google: false });
    const say = (fs: typeof off) => fs.map((f) => `${f.head.join("")} ${f.body}`).join(" ");
    check("five panels: find, get in, price, close, and Alerts while workflows are off", off.map((f) => f.label).join("|") === "Find the next client|Get in the door|Price it|Close it|Alerts", off.map((f) => f.label));
    check("with workflows on the last panel is Workflows, with Beta, and only then", on.at(-1)!.label === "Workflows" && on.at(-1)!.beta === true && !off.some((f) => f.beta) && !/workflow/i.test(say(off)));
    check("the first three panels are the same either way", JSON.stringify(on.slice(0, 3).map((f) => [f.label, f.head, f.body])) === JSON.stringify(off.slice(0, 3).map((f) => [f.label, f.head, f.body])));
    const close = off.find((f) => f.key === "close")!;
    check("Close it: send the proposal, get it signed", close.head.join("") === "Send the proposal, get it signed" && close.tone === "deep");
    check("Close it names Pipeline, a proposal from your call, e-signature, opens, Evidence Bank and the Close plan", ["Pipeline", "proposal from your call", "e-signature", "when they open it", "Evidence Bank", "Close plan"].every((w) => close.body.includes(w)), close.body);
    const wf = on.at(-1)!.body;
    check("Workflows (the owner's words): funding, leadership changes and new roles trigger the next steps; research the company, find the right contact, draft outreach; credits before it runs; outreach waits as a draft", ["funding rounds", "leadership changes", "new roles", "research the company", "find the right contact", "draft outreach", "credits before it runs", "waits as a draft"].every((w) => wf.includes(w)), wf);
    check("what the old table alone said is still on the page: Lookalikes and Hiring now in a panel, Agent access in the Alerts panel and the questions", /Lookalikes/.test(off[0].body) && /Hiring now/.test(off[0].body) && /your own AI assistant, such as Claude/.test(off.at(-1)!.body) && faqItems(25, true, false, {}).some(([q]) => /AI assistant/.test(q)));
    const qs = new Map(faqItems(25, true, false, {}));
    check("and Messages and Fractionals in the questions", /message them inside Merlin/.test(qs.get("How do I reach the fractional who held a seat?")!) && qs.has("What is Fractionals?"));
    check("no LinkedIn, em dash, export or download in any panel", !/linkedin|—|export|download|\bcsv\b/i.test(say(on) + say(off)));
    const src = readFileSync("app/landing/Features.tsx", "utf8");
    check("Everything in Merlin is gone: no table, no anchor, no styles", !/Everything in Merlin|id="everything"|lp-all/.test(src) && !/\.lp-all/.test(readFileSync("app/landing/landing.css", "utf8")) && !/#everything/.test(readFileSync("app/landing/Landing.tsx", "utf8")));
  }

  console.log("\nThe plans' names: Free, Pro and Close, and the Close trial");
  const R = await import("../lib/billing/rules");
  const CP = await import("../lib/billing/compare");
  check("the third plan is Close, its prices unchanged", R.TIER_NAME.close === "Close" && R.TIER_NAME.pro === "Pro" && CP.PLANS.map((p) => p.name).join(",") === "Free,Pro,Close" && R.PRICES.month === 59 && R.PRICES.year === 590 && R.PRICES.closeMonth === 79 && R.PRICES.closeYear === 790);
  check("the trial is the Close trial, in one constant", R.TRIAL_NAME === "Close trial" && R.TRIAL_LABEL === `${R.TRIAL_DAYS}-day Close trial` && R.keepWords("close") === "Keep Close" && R.keepWords("pro") === "Choose Pro");
  check(
    "what Pro leaves out is each a row where Close does more than Pro",
    CP.PRO_LEAVES_OUT.join("|") === "Sending for signature|Your own templates|Merlin drafting|The pipeline moving to Won when they sign" &&
      [/e-signature/, /own templates/, /^Merlin drafting/, /^Pipeline after a signature/].every((re) => CP.CLOSE_ADDS.some(([what, , close]) => re.test(what) || re.test(close))) &&
      CP.CLOSE_ADDS.some(([what, pro]) => /signature/i.test(what) && pro === "In your trial only"),
    CP.CLOSE_ADDS,
  );
  // Every file a member could read from (pages, components, emails, the connector's words, the Terms, the Privacy Policy, /data, the docs) is scanned, comments too.
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const f = path.join(d, n);
      if (statSync(f).isDirectory()) walk(f);
      else if (/\.(tsx?|mts|mjs|css|md)$/.test(n)) files.push(f);
    }
  };
  for (const d of ["app", "lib", "docs"]) walk(path.join(root, d));
  files.push(path.join(root, "README.md"));
  const OLD = /Pro ?\+ ?Close|Pro\+Close|Pro trial|trial of Pro|days of Pro\b/;
  const stale = files.filter((f) => OLD.test(readFileSync(f, "utf8"))).map((f) => path.relative(root, f));
  check("no user-facing string says Pro + Close or Pro trial anymore", stale.length === 0 && files.length > 100, stale);
}

main()
  .catch((e) => {
    failures++;
    console.log(`FAIL threw: ${String(e?.stack ?? e)}`);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
