import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Lead recording shared by the site's forms. Posts to a HubSpot form (Forms API, no secret) when the portal
 * and the named form ID are configured; otherwise appends the record to a JSON file under the data directory so
 * a misconfigured deployment still keeps the lead. Never throws for a delivery failure: the visitor gets their
 * result and the failure is logged.
 */
export type HubSpotField = { objectTypeId: "0-1"; name: string; value: string };

export const field = (name: string, value: string | number): HubSpotField => ({ objectTypeId: "0-1", name, value: String(value) });

export type LeadDelivery = {
  /** Environment variable holding the HubSpot form GUID for this form. */
  formIdEnv: string;
  /** Local fallback file name under the data directory, e.g. "checks.json". */
  localFile: string;
  /** Page the form lives on, for HubSpot's context. */
  pageUri: string;
  pageName: string;
};

export async function recordLead(delivery: LeadDelivery, fields: HubSpotField[], record: Record<string, unknown>): Promise<"hubspot" | "local"> {
  const portal = process.env.HUBSPOT_PORTAL_ID;
  const form = process.env[delivery.formIdEnv];
  if (portal && form) {
    try {
      const res = await fetch(`https://api.hsforms.com/submissions/v3/integration/submit/${portal}/${form}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fields, context: { pageUri: delivery.pageUri, pageName: delivery.pageName } }),
      });
      if (res.ok) return "hubspot";
      console.error(`HubSpot form ${delivery.formIdEnv} submission failed: HTTP ${res.status}. Falling back to the local store.`);
    } catch (e) {
      console.error(`HubSpot form ${delivery.formIdEnv} submission errored. Falling back to the local store.`, e);
    }
  } else {
    console.warn(`HUBSPOT_PORTAL_ID or ${delivery.formIdEnv} is not set; the lead is written to the local store only.`);
  }
  await appendLocal(delivery.localFile, record);
  return "local";
}

/** Same directory rule as lib/store.ts: RN_DATA_DIR, else /tmp on serverless hosts, else ./data. */
function dataDir(): string {
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  return process.env.RN_DATA_DIR || (serverless ? path.join("/tmp", "revenue-nomad") : path.join(process.cwd(), "data"));
}

async function appendLocal(fileName: string, record: Record<string, unknown>): Promise<void> {
  const dir = dataDir();
  const file = path.join(dir, fileName);
  await fs.mkdir(dir, { recursive: true });
  let existing: unknown[] = [];
  try {
    existing = JSON.parse(await fs.readFile(file, "utf8")) as unknown[];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.error(`${fileName} unreadable, starting a new file:`, e);
  }
  existing.push({ at: new Date().toISOString(), ...record });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(existing, null, 2), "utf8");
  await fs.rename(tmp, file);
}
