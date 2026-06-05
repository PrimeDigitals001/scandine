/** Quick check: admin menu builder (toggle availability) + settings render. */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const BASE = "http://localhost:3000";
let pass = 0;
let fail = 0;
const ok = (n, c, d = "") => {
  console.log(`${c ? "✅" : "❌"}  ${n}${d ? `  —  ${d}` : ""}`);
  if (c) pass++;
  else fail++;
};

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

  // menu builder
  await page.goto(`${BASE}/admin/menu`, { waitUntil: "domcontentloaded" });
  await page.getByText("Nutella Brownie").first().waitFor({ timeout: 15000 });
  ok("menu builder lists items", true);

  // toggle availability on the Brownie row, verify DB, toggle back
  const { data: before } = await admin
    .from("menu_items")
    .select("id, is_available")
    .eq("name", "Nutella Brownie")
    .single();
  const row = page
    .locator("div", { hasText: "Nutella Brownie" })
    .filter({ has: page.getByRole("button", { name: /Available|Sold out/ }) })
    .last();
  await row.getByRole("button", { name: /Available|Sold out/ }).click();
  await page.waitForTimeout(1200);
  const { data: after } = await admin
    .from("menu_items")
    .select("is_available")
    .eq("id", before.id)
    .single();
  ok("availability toggle persists", after.is_available !== before.is_available, `${before.is_available} → ${after.is_available}`);
  // restore
  await admin.from("menu_items").update({ is_available: before.is_available }).eq("id", before.id);

  // settings renders with the key fields
  await page.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
  ok("settings shows Google review field", await page.getByLabel(/Google review URL/).isVisible());
  ok("settings shows GST fields", await page.getByLabel("SGST %").isVisible());

  ok("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
} catch (e) {
  ok("admin menu/settings crashed", false, e.message);
} finally {
  await browser.close();
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
