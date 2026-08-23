import type { RawJob } from "../../types";
import { fetchJson } from "../fetch";

export const name = "greenhouse";

/**
 * Greenhouse exposes a public JSON API per company board:
 * https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true
 * Add company board tokens here (or via RN_GREENHOUSE_BOARDS, comma-separated)
 * to watch specific companies for GTM openings.
 */
const DEFAULT_BOARDS: string[] = [];

interface GhJob {
  title: string;
  absolute_url: string;
  updated_at: string;
  location?: { name?: string };
  content?: string;
}

interface GhResponse {
  jobs: GhJob[];
}

export async function fetchJobs(): Promise<RawJob[]> {
  const boards = (process.env.RN_GREENHOUSE_BOARDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .concat(DEFAULT_BOARDS);
  const out: RawJob[] = [];
  for (const board of boards) {
    const data = await fetchJson<GhResponse>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`
    );
    for (const j of data.jobs || []) {
      out.push({
        title: j.title,
        company: board,
        location: j.location?.name || "Unspecified",
        url: j.absolute_url,
        source: name,
        postedAt: j.updated_at,
        description: j.content,
      });
    }
  }
  return out;
}
