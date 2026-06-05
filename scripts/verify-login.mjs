/**
 * ScanDine — common /login routing test. One page, three destinations:
 * owner → /admin, staff → /kitchen, operator → /superadmin. Plus a bad password.
 *
 * Run:  node scripts/verify-login.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const BASE = "http://localhost:3000";
const SUPER_EMAIL = process.env.SUPER_ADMIN_EMAIL;
let pass = 0;
let fail = 0;
const ok = (n, c, d = "") => {
  console.log(`${c ? "✅" : "❌"}  ${n}${d ? `  —  ${d}` : ""}`);
  if (c) pass++;
  else fail++;
};

const browser = await chromium.launch();

async function login(email, password) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  return page;
}

try {
  // owner → /admin
  let page = await login("admin@scandine.demo", "admin123");
  let routed = false;
  try {
    await page.waitForURL("**/admin/**", { timeout: 15000 });
    routed = true;
  } catch {}
  ok("owner → /admin", routed, page.url().replace(BASE, ""));
  await page.close();

  // staff → /kitchen
  page = await login("kitchen@scandine.demo", "kitchen123");
  routed = false;
  try {
    await page.waitForURL("**/kitchen/**", { timeout: 15000 });
    routed = true;
  } catch {}
  ok("staff → /kitchen", routed, page.url().replace(BASE, ""));
  await page.close();

  // operator → /superadmin
  page = await login(SUPER_EMAIL, "12345678");
  routed = false;
  try {
    await page.waitForURL("**/superadmin/**", { timeout: 15000 });
    routed = true;
  } catch {}
  ok("operator → /superadmin", routed, page.url().replace(BASE, ""));
  await page.close();

  // wrong password → error, stays on /login
  page = await login("admin@scandine.demo", "wrong-password");
  let errShown = false;
  try {
    await page.getByText(/Invalid email or password/).waitFor({ timeout: 8000 });
    errShown = true;
  } catch {}
  ok("wrong password → error, stays on /login", errShown && page.url().includes("/login"));
  await page.close();
} catch (e) {
  ok("login flow crashed", false, e.message);
} finally {
  await browser.close();
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
