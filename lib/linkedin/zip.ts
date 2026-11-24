/**
 * A small ZIP reader for the member's own LinkedIn data export, in the browser (and the checks).
 * No library: the archive's table of contents is read from its end, and only the entries the
 * caller asks for are sliced out of the file and inflated with the browser's own
 * DecompressionStream("deflate-raw"). Every other entry is never read: its bytes are never even
 * loaded. Nothing here sends anything anywhere.
 *
 * Handles stored and deflated entries, ZIP64 sizes and offsets, and refuses encrypted entries.
 */

/** What reading needs from a file: a slice of its bytes (a File or a Blob has it). */
export interface ZipSource {
  size: number;
  slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

export interface ZipEntry {
  name: string;
  /** Bytes in the archive, and once inflated. */
  packed: number;
  size: number;
  method: number;
  encrypted: boolean;
  /** Where its local header starts. */
  at: number;
}

export class ZipProblem extends Error {}

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);
const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true));

async function bytes(src: ZipSource, start: number, end: number): Promise<DataView> {
  const buf = await src.slice(Math.max(0, start), Math.min(src.size, end)).arrayBuffer();
  return new DataView(buf);
}

/** It starts like a ZIP archive ("PK\3\4", or an empty one's "PK\5\6"). */
export async function looksLikeZip(src: ZipSource): Promise<boolean> {
  if (src.size < 22) return false;
  const v = await bytes(src, 0, 4);
  const sig = u32(v, 0);
  return sig === 0x04034b50 || sig === 0x06054b50;
}

/** The archive's table of contents: every entry's name and sizes. Reads only the end of the file. */
export async function listZip(src: ZipSource): Promise<ZipEntry[]> {
  // The end record and the ZIP64 locator before it, only: an archive with no comment needs no more. With a
  // comment, the last 64 KB are searched for the end record (still only the table of contents and its end).
  const find = (tail: DataView) => {
    for (let i = tail.byteLength - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) return i;
    return -1;
  };
  let tail = await bytes(src, src.size - Math.min(src.size, 42), src.size);
  let eocd = tail.byteLength >= 22 && u32(tail, tail.byteLength - 22) === 0x06054b50 ? tail.byteLength - 22 : -1;
  if (eocd < 0) {
    tail = await bytes(src, src.size - Math.min(src.size, 65_557), src.size);
    eocd = find(tail);
  }
  if (eocd < 0) throw new ZipProblem("That archive couldn't be read. Download the export again and pick the .zip LinkedIn sent.");
  let count = u16(tail, eocd + 10);
  let cdSize = u32(tail, eocd + 12);
  let cdAt = u32(tail, eocd + 16);
  // ZIP64: the locator sits just before the end record.
  if (count === 0xffff || cdSize === 0xffffffff || cdAt === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && u32(tail, loc) === 0x07064b50) {
      const recAt = u64(tail, loc + 8);
      const rec = await bytes(src, recAt, recAt + 56);
      if (u32(rec, 0) !== 0x06064b50) throw new ZipProblem("That archive couldn't be read. Download the export again.");
      count = u64(rec, 32);
      cdSize = u64(rec, 40);
      cdAt = u64(rec, 48);
    }
  }
  if (cdAt + cdSize > src.size || count > 200_000) throw new ZipProblem("That archive couldn't be read. Download the export again.");
  const cd = await bytes(src, cdAt, cdAt + cdSize);
  const out: ZipEntry[] = [];
  let o = 0;
  const dec = new TextDecoder();
  for (let k = 0; k < count && o + 46 <= cd.byteLength; k++) {
    if (u32(cd, o) !== 0x02014b50) break;
    const flags = u16(cd, o + 8);
    const method = u16(cd, o + 10);
    let packed = u32(cd, o + 20);
    let size = u32(cd, o + 24);
    const nameLen = u16(cd, o + 28);
    const extraLen = u16(cd, o + 30);
    const commentLen = u16(cd, o + 32);
    let at = u32(cd, o + 42);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + o + 46, nameLen));
    // ZIP64 extra field: the sizes and offset that didn't fit, in this order.
    let e = o + 46 + nameLen;
    const end = e + extraLen;
    while (e + 4 <= end) {
      const id = u16(cd, e);
      const len = u16(cd, e + 2);
      if (id === 0x0001) {
        let p = e + 4;
        if (size === 0xffffffff) (size = u64(cd, p)), (p += 8);
        if (packed === 0xffffffff) (packed = u64(cd, p)), (p += 8);
        if (at === 0xffffffff) at = u64(cd, p);
      }
      e += 4 + len;
    }
    out.push({ name: name.replace(/\\/g, "/"), packed, size, method, encrypted: (flags & 1) === 1, at });
    o += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** One entry's bytes, inflated. `max`: refuse an entry larger than this once inflated. */
export async function readEntry(src: ZipSource, e: ZipEntry, max: number): Promise<Uint8Array> {
  if (e.encrypted) throw new ZipProblem(`${e.name} is protected with a password, so Merlin can't read it.`);
  if (e.size > max) throw new ZipProblem(`${e.name.split("/").pop()} is larger than Merlin reads.`);
  const head = await bytes(src, e.at, e.at + 30);
  if (u32(head, 0) !== 0x04034b50) throw new ZipProblem("That archive couldn't be read. Download the export again.");
  const start = e.at + 30 + u16(head, 26) + u16(head, 28);
  const raw = await src.slice(start, start + e.packed).arrayBuffer();
  if (e.method === 0) return new Uint8Array(raw);
  if (e.method !== 8) throw new ZipProblem(`${e.name.split("/").pop()} is packed in a way Merlin can't read.`);
  const stream = new Response(raw).body!.pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new ZipProblem(`${e.name.split("/").pop()} is larger than Merlin reads.`);
    }
    parts.push(value);
  }
  const outb = new Uint8Array(total);
  let p = 0;
  for (const x of parts) (outb.set(x, p), (p += x.byteLength));
  return outb;
}

/** One entry as text (UTF-8, a byte-order mark dropped). */
export async function readText(src: ZipSource, e: ZipEntry, max: number): Promise<string> {
  return new TextDecoder("utf-8").decode(await readEntry(src, e, max)).replace(/^﻿/, "");
}
