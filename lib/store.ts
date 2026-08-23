import { promises as fs } from "fs";
import path from "path";
import type { Database, Job, JobStatus } from "./types";

// On serverless platforms (Vercel/Lambda) the project directory is read-only,
// so the runtime database falls back to /tmp. Data there survives warm
// invocations only — use RN_DATA_DIR pointing at a persistent disk for real
// persistence (see README "Launch").
const SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR =
  process.env.RN_DATA_DIR ||
  (SERVERLESS ? path.join("/tmp", "revenue-nomad") : path.join(process.cwd(), "data"));
const DB_PATH = path.join(DATA_DIR, "jobs.json");
// Seed data always ships with the app itself, wherever the database lives.
const SEED_PATH = path.join(process.cwd(), "data", "seed.json");

let writeLock: Promise<void> = Promise.resolve();

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function loadDb(): Promise<Database> {
  const db = await readJson<Database>(DB_PATH);
  if (db && Array.isArray(db.jobs)) return db;
  // First run: bootstrap from seed data so the board isn't empty.
  const seed = await readJson<Database>(SEED_PATH);
  const fresh: Database = seed && Array.isArray(seed.jobs) ? seed : { jobs: [], lastCrawl: null };
  await saveDb(fresh);
  return fresh;
}

export async function saveDb(db: Database): Promise<void> {
  const run = async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = DB_PATH + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
    await fs.rename(tmp, DB_PATH);
  };
  writeLock = writeLock.then(run, run);
  return writeLock;
}

export async function updateJobStatus(id: string, status: JobStatus): Promise<Job | null> {
  const db = await loadDb();
  const job = db.jobs.find((j) => j.id === id);
  if (!job) return null;
  job.status = status;
  await saveDb(db);
  return job;
}
