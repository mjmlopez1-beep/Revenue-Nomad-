import type { RawJob } from "../../types";
import { fetchJson } from "../fetch";

interface RemotiveJob {
  title: string;
  company_name: string;
  candidate_required_location: string;
  url: string;
  publication_date: string;
  description: string;
  salary: string;
  job_type: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

const SEARCHES = ["fractional", "go-to-market", "revenue operations", "interim marketing", "gtm"];

export const name = "remotive";

export async function fetchJobs(): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (const search of SEARCHES) {
    const data = await fetchJson<RemotiveResponse>(
      `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(search)}&limit=50`
    );
    for (const j of data.jobs || []) {
      out.push({
        title: j.title,
        company: j.company_name,
        location: j.candidate_required_location || "Remote",
        url: j.url,
        source: name,
        postedAt: j.publication_date,
        description: j.description,
        salary: j.salary || undefined,
      });
    }
  }
  return out;
}
