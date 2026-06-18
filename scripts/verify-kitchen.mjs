/**
 * ScanDine — Kitchen Display end-to-end test (real browser + live DB).
 * Customer places an order → staff signs into the KDS → drives it through the
 * kitchen → verifies the customer's status page reflects each step.
 * Requires `npm run build && next start` (or dev) running.
 *
 * Run:  node scripts/verify-kitchen.mjs
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
const BASE = "http://localhost:3000";

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "✅" : "❌"}  ${name}${detail ? `  —  ${detail}` : ""}`);
  if (cond) pass++;
  else fail++;
};
// the customer's status page needs their session cookie (set on the menu)
let SESSION = null;
const customerStatus = async () =>
  (
    await fetch(`${BASE}/order/demo/status`, {
      headers: SESSION ? { Cookie: `sd_session_demo=${SESSION}` } : {},
    })
  ).text();

// reset + place a fresh order as the customer
const { data: table } = await admin
  .from("tables")
  .select("id")
  .eq("qr_token", "demo")
  .single();
await admin.from("orders").delete().neq("status", "cleared").eq("table_id", table.id);
await admin.from("tables").update({ status: "empty", session_token: null, session_started_at: null }).eq("qr_token", "demo");

const r = await anon.rpc("resolve_table", { p_qr_token: "demo", p_session_token: null });
SESSION = r.data.session_token;
const item = r.data.menu.flatMap((c) => c.items).find((i) => i.is_available);
const placed = await anon.rpc("place_order", {
  p_qr_token: "demo",
  p_items: [{ menu_item_id: item.id, quantity: 2 }],
  p_table_note: "kds test",
  p_session_token: SESSION,
});
const orderId = placed.data;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

try {
  // sign in to the KDS
  await page.goto(`${BASE}/login`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("Email").fill("kitchen@scandine.demo");
  await page.getByLabel("Password").fill("kitchen123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/kitchen/friends-fries-cafe", { timeout: 20000 });
  ok("staff can sign into the KDS", true);

  // the new order shows as a ticket
  await page.getByRole("button", { name: "Accept order" }).first().waitFor({ timeout: 15000 });
  ok("KDS shows the new order ticket", await page.getByText(item.name).first().isVisible());

  // drive it through the kitchen, checking the customer screen each step
  await page.getByRole("button", { name: "Accept order" }).first().click();
  await page.getByRole("button", { name: "Start cooking" }).first().waitFor({ timeout: 10000 });
  ok("Accept → customer sees 'Order accepted'", (await customerStatus()).includes("Order accepted"));

  await page.getByRole("button", { name: "Start cooking" }).first().click();
  await page.getByRole("button", { name: "Mark ready" }).first().waitFor({ timeout: 10000 });
  ok("Start cooking → customer sees 'Cooking now'", (await customerStatus()).includes("Cooking now"));

  await page.getByRole("button", { name: "Mark ready" }).first().click();
  await page.getByRole("button", { name: "Mark served" }).first().waitFor({ timeout: 10000 });
  ok("Mark ready → customer sees 'Ready to serve!'", (await customerStatus()).includes("Ready to serve"));

  await page.getByRole("button", { name: "Mark served" }).first().click();
  await page.waitForTimeout(1500);
  const { data: o } = await admin.from("orders").select("status").eq("id", orderId).single();
  ok("Mark served → order is 'served' in the DB", o.status === "served", o.status);
  ok("customer sees 'Served'", (await customerStatus()).includes("Served"));

  ok("no console/page errors in the KDS", errors.length === 0, errors.slice(0, 2).join(" | "));
} catch (e) {
  ok("KDS flow crashed", false, e.message);
} finally {
  await browser.close();
  await admin.from("orders").delete().eq("id", orderId);
  await admin.from("tables").update({ status: "empty", session_token: null, session_started_at: null }).eq("qr_token", "demo");
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
