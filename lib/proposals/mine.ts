/**
 * "My templates": a member's own past proposals and SOWs, uploaded once and read into sections
 * (lib/proposals/templateParse.ts), to start a proposal from or to give Claude the structure and
 * voice to draft in. Kept in State.myTemplates[memberId]: the sections' titles and text only,
 * never the file. Private to the member, like a proposal: never in another member's view, an
 * admin's panel or the export.
 */
import { randomBytes } from "crypto";
import { loadSeed, loadState, memberByToken, tableInternals as T } from "../table";
import { blockDef, newBlockId } from "./library";
import { parseTemplateFile, TemplateProblem } from "./templateParse";
import { PRICES } from "../billing/rules";
import { upgradeUrl } from "../plan";
import { publicBase } from "../links";

/**
 * Building proposals in Merlin is Close (lib/billing/rules.ts canClose): what the upgrade
 * prompt says wherever building is refused (lib/proposals/store.ts buildGate, saveGate here).
 */
export const CLOSE_BUILD = `Building proposals in Merlin is on Close: $${PRICES.closeMonth} a month, or $${PRICES.closeYear} a year. Your proposals and saved templates are kept, and come back when you upgrade.`;
import type { MyTemplate, ProposalBlock } from "./types";

/** The most templates a member keeps. */
export const MY_TEMPLATES_MAX = 20;

export class MineProblem extends Error {
  constructor(
    message: string,
    public status = 400,
    public upgrade?: string,
  ) {
    super(message);
  }
}

/**
 * Saving a template of theirs is Close (the trial is Close): during the trial a member saves
 * My templates; after it, without Close, they stay stored (never deleted) but none is added or
 * renamed until they upgrade.
 */
function saveGate(s: Parameters<typeof T.closeNow>[0], memberId: string, nowMs: number) {
  if (!T.closeNow(s, memberId, nowMs)) throw new MineProblem(CLOSE_BUILD, 403, upgradeUrl((publicBase() ?? "").replace(/\/$/, ""), "proposals"));
}

export const isMineId = (id: unknown): id is string => typeof id === "string" && /^mt_[A-Za-z0-9_-]{12}$/.test(id);

/** A member's own templates, newest first. */
export const templatesOf = (s: { myTemplates?: Record<string, MyTemplate[]> }, memberId: string): MyTemplate[] => [...(s.myTemplates?.[memberId] ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** A template of theirs as a proposal's blocks, in its order. */
export const blocksOfMine = (t: MyTemplate): ProposalBlock[] => t.blocks.map((b) => ({ id: newBlockId(), blockId: blockDef(b.blockId) ? b.blockId : "custom", title: b.title, body: b.body }));

const kindOf = (name: string): MyTemplate["kind"] | null => {
  const n = name.toLowerCase();
  return n.endsWith(".docx") ? "docx" : n.endsWith(".pdf") ? "pdf" : n.endsWith(".md") || n.endsWith(".markdown") ? "md" : n.endsWith(".txt") ? "txt" : null;
};

/** Read an upload into a template of theirs. */
export async function uploadTemplate(token: string | null, fileName: string, bytes: Buffer, nowMs = Date.now()): Promise<MyTemplate> {
  const [seed, s0] = await Promise.all([loadSeed(), loadState()]);
  const me0 = memberByToken(seed, token, s0);
  if (!me0) throw new MineProblem("You're signed out. Sign in again to add a template.", 401);
  saveGate(s0, me0.id, nowMs);
  const name = String(fileName ?? "").replace(/[\u0000-\u001F\u007F/\\]+/g, " ").trim().slice(0, 160) || "template.txt";
  const kind = kindOf(name);
  if (!kind) throw new MineProblem("Upload a .docx, .pdf, .md or .txt file.");
  if (templatesOf(s0, me0.id).length >= MY_TEMPLATES_MAX) throw new MineProblem(`You have ${MY_TEMPLATES_MAX} templates, which is the most. Delete one first.`);
  let parsed;
  try {
    parsed = await parseTemplateFile(name, bytes);
  } catch (e) {
    if (e instanceof TemplateProblem) throw new MineProblem(e.message);
    console.error("template could not be read", kind, (e as Error)?.message);
    throw new MineProblem(kind === "pdf" ? "That PDF didn't read. Upload it as a Word document (.docx) instead." : "That file didn't read. Save it again and try once more.");
  }
  const t: MyTemplate = {
    id: `mt_${randomBytes(9).toString("base64url")}`,
    title: parsed.title.slice(0, 120),
    fileName: name,
    kind,
    blocks: parsed.sections.map((x) => ({ blockId: x.blockId, title: x.title, body: x.body })),
    createdAt: new Date(nowMs).toISOString(),
  };
  return T.mutate((s) => {
    const me = memberByToken(seed, token, s);
    if (!me) throw new MineProblem("You're signed out. Sign in again to add a template.", 401);
    saveGate(s, me.id, nowMs);
    const list = ((s.myTemplates ??= {})[me.id] ??= []);
    if (list.length >= MY_TEMPLATES_MAX) throw new MineProblem(`You have ${MY_TEMPLATES_MAX} templates, which is the most. Delete one first.`);
    list.push(t);
    return structuredClone(t);
  });
}

export async function renameTemplate(token: string | null, id: string, title: unknown, nowMs = Date.now()): Promise<MyTemplate> {
  const seed = await loadSeed();
  return T.mutate((s) => {
    const me = memberByToken(seed, token, s);
    if (me) saveGate(s, me.id, nowMs);
    const t = me ? s.myTemplates?.[me.id]?.find((x) => x.id === id) : undefined;
    if (!t) throw new MineProblem("That template isn't there anymore.", 404);
    const v = String(title ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (v) t.title = v;
    return structuredClone(t);
  });
}

export async function deleteTemplate(token: string | null, id: string): Promise<void> {
  const seed = await loadSeed();
  await T.mutate((s) => {
    const me = memberByToken(seed, token, s);
    const list = me ? s.myTemplates?.[me.id] : undefined;
    if (!list?.some((x) => x.id === id)) throw new MineProblem("That template isn't there anymore.", 404);
    s.myTemplates![me!.id] = list.filter((x) => x.id !== id);
  });
}
