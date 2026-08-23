import type { RawJob } from "../../types";
import { fetchJson } from "../fetch";

interface RemoteOkJob {
  position?: string;
  company?: string;
  location?: string;
  url?: string;
  date?: string;
  description?: string;
  salary_min?: number;
  salary_max?: number;
  tags?: string[];
}

export const name = "remoteok";

const RELEVANT_TAGS = /sales|marketing|growth|revenue|gtm|partnerships|customer success|exec/i;

export async function fetchJobs(): Promise<RawJob[]> {
  // First array element is API metadata, not a job.
  const data = await fetchJson<RemoteOkJob[]>("https://remoteok.com/api");
  const out: RawJob[] = [];
  for (const j of data) {
    if (!j.position || !j.company || !j.url) continue;
    const tagText = (j.tags || []).join(" ");
    if (!RELEVANT_TAGS.test(`${j.position} ${tagText}`)) continue;
    out.push({
      title: j.position,
      company: j.company,
      location: j.location || "Remote",
      url: j.url,
      source: name,
      postedAt: j.date,
      description: j.description,
      salary:
        j.salary_min && j.salary_max
          ? `$${Math.round(j.salary_min / 1000)}k–$${Math.round(j.salary_max / 1000)}k`
          : undefined,
    });
  }
  return out;
}
