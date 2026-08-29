import { cookies } from "next/headers";
import type { Database, Operator } from "./types";

/**
 * v1 auth: a demo operator-switcher cookie (this is an internal 300-operator
 * launch; the production path is magic-link email auth — see README). The
 * one-click email pulse deliberately does NOT use sessions at all: those
 * links are HMAC-signed (lib/sign.ts).
 */

export const OP_COOKIE = "nb_op";
export const ADMIN_COOKIE = "nb_admin";

export async function currentOperator(db: Database): Promise<Operator | null> {
  const jar = await cookies();
  const id = jar.get(OP_COOKIE)?.value;
  if (!id) return null;
  return db.operators.find((o) => o.id === id) ?? null;
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const key = jar.get(ADMIN_COOKIE)?.value;
  const expected = process.env.NB_ADMIN_KEY || "dev-admin";
  return !!key && key === expected;
}
