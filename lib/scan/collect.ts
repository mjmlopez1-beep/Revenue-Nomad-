/**
 * Find open fractional GTM roles for the weekly scan. Contract only for now: the scan agent
 * fills this in on top of lib/crawler (sources and scoring).
 */
import type { ScanCollectResult } from "../scanTypes";

export async function collectOpenRoles(): Promise<ScanCollectResult> {
  return { roles: [], sources: [] };
}
