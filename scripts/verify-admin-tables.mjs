/**
 * ScanDine — owner-managed tables: add tables, download a table QR, delete.
 * Cleans up any tables it added.
 *
 * Run:  node scripts/verify-admin-tables.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const BASE = process.env.BASE ?? "http://localhost:3000";
const RID = "11111111-1111-1111-1111-111111111111";

let pass = 0;
let fail = 0;
const ok = (n, c, d = "") => {
  console.log(`${c ? "✅" : "❌"}  ${n}${d ? `  —  ${d}` : ""}`);
  if (c) pass++;
  else fail++;
};
const tableCount = async () =>
  (await svc.from("tables").select("id").eq("restaurant_id", RID)).data ?? [];

const before = await tableCount();
const beforeIds = new Set(before.map((t) => t.id));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill("admin@scandine.demo");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin/dashboard", { timeout: 20000 });

  await page.goto(`${BASE}/admin/tables`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Tables", exact: true }).waitFor({ timeout: 15000 });

  // add 2 tables
  await page.locator("#count").fill("2");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(1500);
  const after = await tableCount();
  ok("owner adds tables", after.length === before.length + 2, `${before.length} → ${after.length}`);

  const added = (
    await svc
      .from("tables")
      .select("id, qr_token, table_number")
      .eq("restaurant_id", RID)
  ).data.filter((t) => !beforeIds.has(t.id));

  // download a QR for an added table (uses the owner's session cookies)
  const resp = await page.request.get(`${BASE}/api/admin/qr/${added[0].qr_token}`);
  ok(
    "owner downloads a table QR (PNG)",
    resp.status() === 200 && resp.headers()["content-type"] === "image/png",
    `status ${resp.status()}`,
  );

  // bulk zip works too
  const zip = await page.request.get(`${BASE}/api/admin/qr-zip`);
  ok("owner downloads all QRs (zip)", zip.status() === 200 && (zip.headers()["content-type"] ?? "").includes("zip"));

  // a QR for a table NOT in this restaurant is refused (fake token)
  const denied = await page.request.get(`${BASE}/api/admin/qr/not-a-real-token-xyz`);
  ok("QR for an unknown token is refused", denied.status() === 404, `status ${denied.status()}`);

  // delete one table via the UI
  page.on("dialog", (d) => d.accept());
  await page
    .locator("li")
    .filter({ hasText: added[0].table_number })
    .getByTitle("Delete table")
    .click();
  await page.waitForTimeout(1500);
  const after2 = await tableCount();
  ok("owner deletes a table", after2.length === before.length + 1, `now ${after2.length}`);

  ok("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
} catch (e) {
  ok("tables flow crashed", false, e.message);
} finally {
  await browser.close();
  // remove any tables this test added
  const now = await tableCount();
  const toDelete = now.filter((t) => !beforeIds.has(t.id)).map((t) => t.id);
  if (toDelete.length) await svc.from("tables").delete().in("id", toDelete);
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
