/** Quick check: admin mobile hamburger menu opens, navigates, and closes. */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const BASE = "http://localhost:3000";
let pass = 0;
let fail = 0;
const ok = (n, c, d = "") => {
  console.log(`${c ? "✅" : "❌"}  ${n}${d ? `  —  ${d}` : ""}`);
  if (c) pass++;
  else fail++;
};

const browser = await chromium.launch();
// phone viewport
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill("admin@scandine.demo");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin/dashboard", { timeout: 20000 });

  // aria-expanded is the reliable open/closed signal (overflow-clip fools isVisible)
  const burger = page.getByRole("button", { name: "Menu" });
  ok("menu closed initially", (await burger.getAttribute("aria-expanded")) === "false");

  await burger.click();
  await page.waitForTimeout(350);
  ok("hamburger opens the menu", (await burger.getAttribute("aria-expanded")) === "true");

  // tap the mobile menu's "Menu" link (last match = inside the drawer)
  await page.getByRole("link", { name: "Menu", exact: true }).last().click();
  await page.waitForURL("**/admin/menu", { timeout: 10000 });
  ok("tapping a link navigates", page.url().includes("/admin/menu"));

  await page.waitForTimeout(350);
  ok("menu closes after navigation", (await burger.getAttribute("aria-expanded")) === "false");

  ok("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
} catch (e) {
  ok("nav check crashed", false, e.message);
} finally {
  await browser.close();
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
