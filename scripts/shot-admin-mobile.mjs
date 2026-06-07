/** Screenshot the admin Tables page + open nav drawer at a phone width. */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const BASE = process.env.BASE ?? "http://localhost:3000";
const W = Number(process.argv[2] ?? 371);

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: 820 } });

await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await p.getByLabel("Email").fill("admin@scandine.demo");
await p.getByLabel("Password").fill("admin123");
await p.getByRole("button", { name: "Sign in" }).click();
await p.waitForURL("**/admin/dashboard", { timeout: 20000 });

await p.goto(`${BASE}/admin/tables`, { waitUntil: "networkidle" });
await p.getByRole("heading", { name: "Tables", exact: true }).waitFor();

// rows (drawer closed)
await p.screenshot({ path: "shot-tables.png", fullPage: true });

// open the nav drawer and check Sign out is fully visible
await p.getByRole("button", { name: "Menu" }).click();
await p.waitForTimeout(450);
const signOut = p.getByRole("button", { name: "Sign out" });
const box = await signOut.boundingBox();
const drawer = await p.locator("header").boundingBox();
const clipped = box ? box.y + box.height > drawer.y + drawer.height + 1 : true;
await p.screenshot({ path: "shot-nav.png" });
console.log(
  `signOut bottom=${box ? Math.round(box.y + box.height) : "?"} headerBottom=${Math.round(
    drawer.y + drawer.height,
  )} clipped=${clipped}`,
);

await b.close();
console.log(`saved shot-tables.png + shot-nav.png at ${W}px`);
