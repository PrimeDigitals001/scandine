/**
 * ScanDine — super-admin food-court setup smoke test (real browser + auth).
 * Logs in as super admin, opens the seeded demo court (2 stores + QR), then
 * creates a new court via the form and confirms its detail renders. Cleans up.
 * Needs a local server (npm run build && npx next start) + the demo court seeded.
 *
 * Run:  node scripts/verify-superadmin-court.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.SUPER_ADMIN_EMAIL;
const PASSWORD = process.env.SUPER_ADMIN_LOCAL_PASSWORD ?? "12345678"; // local-only
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  console.log(`${c ? "✅" : "❌"}  ${n}${d ? `  —  ${d}` : ""}`);
  if (c) pass++;
  else fail++;
};

const NEW_COURT = "Verify UI Court";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/superadmin/dashboard", { timeout: 20000 });
  ok("super admin signs in", true);

  // food courts list shows the seeded demo court
  await page.goto(`${BASE}/superadmin/food-courts`, { waitUntil: "domcontentloaded" });
  await page.getByText("ScanDine Food Court").first().waitFor({ timeout: 12000 });
  ok("food courts list shows the demo court", true);

  // open it → detail shows both stores + the QR download
  await page.getByText("ScanDine Food Court").first().click();
  await page.getByRole("heading", { name: "ScanDine Food Court" }).waitFor({ timeout: 12000 });
  ok("demo court detail shows Friends & Fries store", await page.getByText("Friends & Fries Café").first().isVisible());
  ok("demo court detail shows Trial Cafe store", await page.getByText("Trial Cafe").first().isVisible());
  ok("court QR download is present", (await page.getByRole("link", { name: /Download QR/ }).count()) >= 1);
  ok("customer court URL shown (court-demo)", (await page.getByText(/court\/court-demo/).count()) >= 1);

  // create a new court via the form
  await page.goto(`${BASE}/superadmin/food-courts/new`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Food court name").fill(NEW_COURT);
  await page.getByRole("button", { name: "Create food court" }).click();
  await page.getByRole("heading", { name: NEW_COURT }).waitFor({ timeout: 15000 });
  ok("creating a court lands on its detail page", true);
  ok("new court has a downloadable QR", (await page.getByRole("link", { name: /Download QR/ }).count()) >= 1);

  ok("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
} catch (e) {
  ok("super-admin court flow crashed", false, e.message);
} finally {
  await b.close();
  await svc.from("food_courts").delete().eq("name", NEW_COURT); // cleanup created court
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
