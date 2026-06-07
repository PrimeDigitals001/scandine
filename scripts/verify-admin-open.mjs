/**
 * ScanDine — owner open/closed toggle. Owner flips "Closed", the customer sees
 * a closed notice + the server rejects new orders; flips back "Open" and orders
 * work again. Resets the café to Open after.
 *
 * Needs migration 006 applied. Run:  node scripts/verify-admin-open.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const BASE = process.env.BASE ?? "http://localhost:3000";
const RID = "11111111-1111-1111-1111-111111111111";

let pass = 0;
let fail = 0;
const ok = (n, c, d = "") => {
  console.log(`${c ? "✅" : "❌"}  ${n}${d ? `  —  ${d}` : ""}`);
  if (c) pass++;
  else fail++;
};
const accepting = async () =>
  (await admin.from("restaurants").select("is_accepting_orders").eq("id", RID).single())
    .data?.is_accepting_orders;

const placeOrder = async () => {
  const r = await anon.rpc("resolve_table", { p_qr_token: "demo" });
  const item = r.data.menu.flatMap((c) => c.items).find((i) => i.is_available);
  return anon.rpc("place_order", {
    p_qr_token: "demo",
    p_items: [{ menu_item_id: item.id, quantity: 1 }],
  });
};

// baseline: café open, demo table empty
const { data: t0 } = await admin
  .from("tables")
  .select("id")
  .eq("restaurant_id", RID)
  .eq("table_number", "T1")
  .single();
await admin.from("restaurants").update({ is_accepting_orders: true }).eq("id", RID);
await admin.from("orders").delete().neq("status", "cleared").eq("table_id", t0.id);
await admin.from("tables").update({ status: "empty", qr_token: "demo" }).eq("id", t0.id);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

let orderId = null;
try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill("admin@scandine.demo");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin/dashboard", { timeout: 20000 });

  // toggle shows OPEN
  await page.getByRole("button", { name: /Open . taking orders/ }).waitFor({ timeout: 15000 });
  ok("floor shows the Open toggle", true);

  // flip to CLOSED
  await page.getByRole("button", { name: /Open . taking orders/ }).click();
  await page.getByText(/not taking orders/i).first().waitFor({ timeout: 10000 });
  ok("owner flips to Closed (banner shows)", (await accepting()) === false);

  // customer sees the closed notice
  const cust = await browser.newPage();
  await cust.goto(`${BASE}/order/demo`, { waitUntil: "domcontentloaded" });
  await cust.getByText(/Not taking orders right now/i).waitFor({ timeout: 12000 });
  ok("customer sees 'closed' on the menu", true);
  ok("no 'Add' buttons while closed", (await cust.getByRole("button", { name: "Add" }).count()) === 0);
  await cust.close();

  // server rejects a new order while closed
  const blocked = await placeOrder();
  ok("server rejects orders while closed", !!blocked.error, blocked.error?.message ?? "");

  // flip back to OPEN
  await page.getByRole("button", { name: /Closed . paused/ }).click();
  await page.getByRole("button", { name: /Open . taking orders/ }).waitFor({ timeout: 10000 });
  ok("owner flips back to Open", (await accepting()) === true);

  // orders work again
  const okOrder = await placeOrder();
  orderId = okOrder.data;
  ok("orders work again once Open", !!orderId && !okOrder.error);

  ok("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
} catch (e) {
  ok("open/closed flow crashed", false, e.message);
} finally {
  await browser.close();
  if (orderId) await admin.from("orders").delete().eq("id", orderId);
  await admin.from("restaurants").update({ is_accepting_orders: true }).eq("id", RID);
  await admin.from("tables").update({ status: "empty", qr_token: "demo" }).eq("id", t0.id);
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
