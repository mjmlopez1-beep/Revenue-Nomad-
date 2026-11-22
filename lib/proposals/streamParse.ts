/**
 * Reading a draft or a change while it is still being written: the model's answer is JSON that
 * arrives a few characters at a time (lib/proposals/draft.ts and change.ts stream it), and this
 * pulls out what is already there, so the progress view can show real steps: each section as its
 * title appears, its text filling in, and a check once its text is closed. Nothing is guessed:
 * a section shows only once its title is in the text, and is done only once its body's closing
 * quote has arrived. Pure, shared by the server and the tests.
 */

export interface PartSection {
  /** The section's id in the answer (block_id for a draft, section_id for a change). */
  id: string;
  title: string;
  /** Its text so far, unescaped. */
  body: string;
  /** Its body's closing quote has arrived. */
  done: boolean;
}

/** A JSON string's contents as far as they have arrived (a cut escape at the end is left off). */
export function unescapePartial(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = s[i + 1];
    if (n === undefined) break;
    if (n === "u") {
      const hex = s.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }
    out += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "" : n === "b" || n === "f" ? "" : n;
    i++;
  }
  return out;
}

const STR = '"((?:[^"\\\\]|\\\\.)*)';
/** The sections written so far, in order. `idKey`: "block_id" for a draft, "section_id" for a change. */
export function sectionsSoFar(text: string, idKey: "block_id" | "section_id"): PartSection[] {
  const re = new RegExp(`"${idKey}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*,\\s*"title"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"(?:\\s*,\\s*"body"\\s*:\\s*${STR}(")?)?`, "g");
  const out: PartSection[] = [];
  for (const m of text.matchAll(re)) out.push({ id: unescapePartial(m[1]), title: unescapePartial(m[2]), body: m[3] !== undefined ? unescapePartial(m[3]) : "", done: m[4] === '"' });
  return out;
}

/** A string field's value once it has arrived whole (`"name": "Dana Whitfield"`), or null. */
export function fieldSoFar(text: string, key: string, within?: string): string | null {
  const from = within ? text.indexOf(`"${within}"`) : 0;
  if (from < 0) return null;
  const m = text.slice(from).match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? unescapePartial(m[1]) : null;
}
