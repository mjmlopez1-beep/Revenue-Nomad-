import { promises as fs } from "fs";
import path from "path";
import type { Database } from "./types";
import { DEFAULT_CONFIG } from "./config";

// On serverless platforms the project directory is read-only, so the runtime
// database falls back to /tmp (warm invocations only). Point NB_DATA_DIR at a
// persistent disk for real persistence. The Postgres migration (v1.5) replaces
// this module wholesale — every accessor already goes through loadDb/saveDb.
const SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR =
  process.env.NB_DATA_DIR ||
  (SERVERLESS ? path.join("/tmp", "nomad-benchmark") : path.join(process.cwd(), "data"));
const DB_PATH = path.join(DATA_DIR, "benchmark.json");
// Seed data ships with the app itself, wherever the runtime database lives.
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

export function emptyDb(): Database {
  return {
    operators: [],
    clients: [],
    pulseResponses: [],
    demandIndexSnapshots: [],
    deals: [],
    signals: [],
    capacityPulses: [],
    toolReviews: [],
    questions: [],
    questionAnswers: [],
    credits: [],
    unlocks: [],
    billcomReconciliations: [],
    config: DEFAULT_CONFIG,
    meta: { seededAt: null },
  };
}

export async function loadDb(): Promise<Database> {
  const db = await readJson<Database>(DB_PATH);
  if (db && Array.isArray(db.operators)) {
    // Config gains keys across versions; merge defaults under stored values.
    db.config = {
      ...DEFAULT_CONFIG,
      ...db.config,
      earn: { ...DEFAULT_CONFIG.earn, ...db.config?.earn },
      spend: { ...DEFAULT_CONFIG.spend, ...db.config?.spend },
      gates: { ...DEFAULT_CONFIG.gates, ...db.config?.gates },
      streak: { ...DEFAULT_CONFIG.streak, ...db.config?.streak },
      insider: { ...DEFAULT_CONFIG.insider, ...db.config?.insider },
      status: { ...DEFAULT_CONFIG.status, ...db.config?.status },
      verification: { ...DEFAULT_CONFIG.verification, ...db.config?.verification },
    };
    return db;
  }
  // First run: bootstrap from the committed seed so day one isn't empty
  // (spec §9 — the August edition is computable immediately).
  const seed = await readJson<Database>(SEED_PATH);
  const fresh = seed && Array.isArray(seed.operators) ? seed : emptyDb();
  await saveDb(fresh);
  return fresh;
}

export async function saveDb(db: Database): Promise<void> {
  const run = async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = DB_PATH + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(db), "utf8");
    await fs.rename(tmp, DB_PATH);
  };
  writeLock = writeLock.then(run, run);
  return writeLock;
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
