/**
 * Backups of the runtime state (intel.json: everything members added, unlocks, credits).
 *
 * 1. Daily snapshot on the data volume: <data>/backups/intel-YYYY-MM-DD.json, last 14 kept.
 * 2. Off-site copy to an S3-compatible bucket (e.g. a Railway bucket) when these are set:
 *      RN_BACKUP_S3_ENDPOINT  e.g. https://storage.railway.app
 *      RN_BACKUP_S3_BUCKET
 *      RN_BACKUP_S3_KEY_ID / RN_BACKUP_S3_SECRET
 *      RN_BACKUP_S3_REGION    (default "auto")
 *      RN_BACKUP_S3_PATH_STYLE=1 for path-style endpoints (default: virtual-hosted, as Railway uses)
 *    Uploaded once a day as backups/intel-YYYY-MM-DD.json, overwritten through the day
 *    by the latest state (at most once an hour).
 */
import { promises as fs } from "fs";
import path from "path";
import { createHash, createHmac } from "crypto";

const KEEP_DAYS = 14;
let lastUpload = 0;
/** The day whose snapshot is already on disk, so later writes that day skip the disk checks. */
let snappedDay: string | null = null;

export async function snapshot(dataDir: string, json: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  if (snappedDay !== day) {
    const dir = path.join(dataDir, "backups");
    const file = path.join(dir, `intel-${day}.json`);
    try {
      await fs.mkdir(dir, { recursive: true });
      // The first write of the day keeps the start-of-day state.
      try {
        await fs.access(file);
      } catch {
        await fs.writeFile(file, json, "utf8");
        const files = (await fs.readdir(dir)).filter((f) => /^intel-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
        for (const old of files.slice(0, Math.max(0, files.length - KEEP_DAYS))) await fs.unlink(path.join(dir, old)).catch(() => {});
      }
      snappedDay = day;
    } catch (e) {
      console.error("backup snapshot failed", e);
    }
  }
  if (s3Configured() && Date.now() - lastUpload > 60 * 60 * 1000) {
    lastUpload = Date.now();
    putObject(`backups/intel-${day}.json`, json).catch((e) => console.error("backup upload failed", e));
  }
}

export const s3Configured = () =>
  !!(process.env.RN_BACKUP_S3_ENDPOINT && process.env.RN_BACKUP_S3_BUCKET && process.env.RN_BACKUP_S3_KEY_ID && process.env.RN_BACKUP_S3_SECRET);

const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const hmac = (k: Buffer | string, s: string) => createHmac("sha256", k).update(s).digest();

/** Minimal AWS Signature V4 PUT, enough for S3-compatible buckets (virtual-hosted or path style). */
export async function putObject(key: string, body: string): Promise<void> {
  const endpoint = new URL(process.env.RN_BACKUP_S3_ENDPOINT!);
  const bucket = process.env.RN_BACKUP_S3_BUCKET!;
  const region = process.env.RN_BACKUP_S3_REGION || "auto";
  const keyId = process.env.RN_BACKUP_S3_KEY_ID!;
  const secret = process.env.RN_BACKUP_S3_SECRET!;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const pathStyle = process.env.RN_BACKUP_S3_PATH_STYLE === "1";
  const objectPath = `/${key.split("/").map(encodeURIComponent).join("/")}`;
  const canonicalUri = pathStyle ? `/${bucket}${objectPath}` : objectPath;
  const payloadHash = sha256(body);
  const host = pathStyle ? endpoint.host : `${bucket}.${endpoint.host}`;
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const r = await fetch(`${endpoint.protocol}//${host}${canonicalUri}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  });
  if (!r.ok) throw new Error(`S3 PUT ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
