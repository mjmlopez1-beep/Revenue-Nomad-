import { redirect } from "next/navigation";
import { loadDb } from "@/lib/store";
import { currentOperator } from "@/lib/session";
import Dashboard from "./Dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const db = await loadDb();
  const op = await currentOperator(db);
  if (!op) redirect("/");
  return <Dashboard />;
}
