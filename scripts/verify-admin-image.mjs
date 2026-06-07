/**
 * ScanDine — menu item photo upload. Owner edits an item, uploads a PNG, and we
 * verify it lands in Storage + on the row + serves publicly. Restores the item.
 *
 * Run:  node scripts/verify-admin-image.mjs
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

// a valid 1×1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

let pass = 0;
let fail = 0;
const ok = (n, c, d = "") => {
  console.log(`${c ? "✅" : "❌"}  ${n}${d ? `  —  ${d}` : ""}`);
  if (c) pass++;
  else fail++;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

let itemId = null;
let original = null;

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill("admin@scandine.demo");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin/dashboard", { timeout: 20000 });

  await page.goto(`${BASE}/admin/menu`, { waitUntil: "domcontentloaded" });
  await page.getByTitle("Edit").first().waitFor({ timeout: 15000 });
  await page.getByTitle("Edit").first().click();
  await page.waitForTimeout(400);

  // identify the edited item by the unique editor name field
  const name = await page.locator("#name").inputValue();
  ok("edit populates an item", !!name, name);
  const { data: before } = await svc
    .from("menu_items")
    .select("id, image_url")
    .eq("restaurant_id", RID)
    .eq("name", name)
    .limit(1)
    .single();
  itemId = before?.id ?? null;
  original = before?.image_url ?? null;

  // upload a photo + save
  await page.locator("#image").setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Saved ✓").waitFor({ timeout: 15000 });

  const { data: after } = await svc
    .from("menu_items")
    .select("image_url")
    .eq("id", itemId)
    .single();
  ok(
    "image_url saved to the row",
    typeof after.image_url === "string" && after.image_url.includes("menu-images"),
    after.image_url?.slice(0, 60),
  );

  const resp = await fetch(after.image_url);
  ok(
    "public image URL serves an image",
    resp.status === 200 && (resp.headers.get("content-type") ?? "").startsWith("image/"),
    `status ${resp.status}`,
  );

  // customer menu renders an <img> (resolve_table exposes image_url)
  const { data: t } = await svc
    .from("tables")
    .select("qr_token")
    .eq("qr_token", "demo")
    .maybeSingle();
  if (t) {
    const cust = await page.goto(`${BASE}/order/demo`, { waitUntil: "networkidle" });
    if (cust) {
      const imgs = await page.locator('img[src*="menu-images"]').count();
      ok("customer menu shows the photo", imgs >= 1, `${imgs} img(s)`);
    }
  }

  ok("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
} catch (e) {
  ok("image flow crashed", false, e.message);
} finally {
  await browser.close();
  if (itemId) {
    await svc.from("menu_items").update({ image_url: original }).eq("id", itemId);
  }
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
