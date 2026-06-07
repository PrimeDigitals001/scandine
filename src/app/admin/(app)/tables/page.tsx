import type { Metadata } from "next";
import { getTables } from "@/lib/admin/data";
import { TablesManager } from "./TablesManager";

export const metadata: Metadata = { title: "Admin · Tables" };

export default async function TablesPage() {
  const tables = await getTables();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return <TablesManager tables={tables} appUrl={appUrl} />;
}
