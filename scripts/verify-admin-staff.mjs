/**
 * ScanDine — credential flow: owner creates a kitchen login, it works, owner
 * resets it (new works / old fails), and a disabled account can't sign in.
 * Cleans up the throwaway staff after.
 *
 * Run:  node scripts/verify-admin-staff.mjs
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
const STAFF_EMAIL = `teststaff-${Date.now()}@scandine.test`;

let pass = 0;
let fail = 0;
const ok = (n, c, d = "") => {
  console.log(`${c ? "✅" : "❌"}  ${n}${d ? `  —  ${d}` : ""}`);
  if (c) pass++;
  else fail++;
};
const grabPw = (html) => html.match(/Cafe-[0-9a-f]{8}/)?.[0] ?? null;

const browser = await chromium.launch();
async function login(ctx, email, password) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  return page;
}
async function landsOnKitchen(ctx, email, password) {
  const page = await login(ctx, email, password);
  let okk = false;
  try {
    await page.waitForURL("**/kitchen/**", { timeout: 12000 });
    okk = true;
  } catch {}
  await page.close();
  return okk;
}

let pw1 = null;
let pw2 = null;
try {
  // owner creates a kitchen login
  const owner = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let page = await login(owner, "admin@scandine.demo", "admin123");
  await page.waitForURL("**/admin/dashboard", { timeout: 20000 });
  await page.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(STAFF_EMAIL);
  await page.getByLabel("Name").fill("Test Cook");
  await page.getByRole("button", { name: "Create login" }).click();
  await page.getByText(/shown only once/i).waitFor({ timeout: 12000 });
  pw1 = grabPw(await page.content());
  ok("owner creates a kitchen login (temp password shown)", !!pw1, pw1 ?? "no password");
  await page.close();

  // the new staff can sign in → kitchen
  const c1 = await browser.newContext();
  ok("new staff signs in → /kitchen", await landsOnKitchen(c1, STAFF_EMAIL, pw1));
  await c1.close();

  // owner resets the password
  page = await owner.newPage();
  await page.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
  const row = page.locator("li").filter({ hasText: STAFF_EMAIL });
  await row.getByRole("button", { name: "Reset" }).click();
  await page.getByText(/New password/i).waitFor({ timeout: 12000 });
  pw2 = grabPw(await page.content());
  ok("owner resets the password", !!pw2 && pw2 !== pw1, pw2 ?? "no password");
  await page.close();

  // new password works, old one doesn't
  const c2 = await browser.newContext();
  ok("new password signs in", await landsOnKitchen(c2, STAFF_EMAIL, pw2));
  await c2.close();
  const c3 = await browser.newContext();
  ok("old password no longer works", !(await landsOnKitchen(c3, STAFF_EMAIL, pw1)));
  await c3.close();

  // disable → cannot sign in
  page = await owner.newPage();
  await page.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
  await page.locator("li").filter({ hasText: STAFF_EMAIL }).getByRole("button", { name: "Disable" }).click();
  await page.waitForTimeout(1200);
  await page.close();
  const c4 = await browser.newContext();
  ok("disabled account can't sign in", !(await landsOnKitchen(c4, STAFF_EMAIL, pw2)));
  await c4.close();

  // settings exposes change-password
  page = await owner.newPage();
  await page.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
  ok("settings shows 'Change your password'", await page.getByText("Change your password").isVisible());
  await page.close();
  await owner.close();
} catch (e) {
  ok("credential flow crashed", false, e.message);
} finally {
  await browser.close();
  // cleanup the throwaway staff
  const { data } = await svc.auth.admin.listUsers();
  const u = data.users.find((x) => x.email === STAFF_EMAIL);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
