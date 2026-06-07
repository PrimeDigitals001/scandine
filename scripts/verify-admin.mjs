/**
 * ScanDine — Admin Dashboard billing flow (real browser + live DB).
 * Customer orders → owner generates bill (with GST) → takes payment → clears
 * the table → verifies the qr_token was regenerated. Resets the demo after.
 *
 * Run:  node scripts/verify-admin.mjs
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

// reset demo table to the known 'demo' token + empty
const { data: t0 } = await admin.from("tables").select("id").eq("restaurant_id", "11111111-1111-1111-1111-111111111111").eq("table_number", "T1").single();
await admin.from("orders").delete().neq("status", "cleared").eq("table_id", t0.id);
await admin.from("tables").update({ status: "empty", qr_token: "demo" }).eq("id", t0.id);

// customer places an order
const r = await anon.rpc("resolve_table", { p_qr_token: "demo" });
const item = r.data.menu.flatMap((c) => c.items).find((i) => i.is_available);
const placed = await anon.rpc("place_order", {
  p_qr_token: "demo",
  p_items: [{ menu_item_id: item.id, quantity: 2 }],
});
const orderId = placed.data;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

try {
  // sign in as owner
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill("admin@scandine.demo");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin/dashboard", { timeout: 20000 });
  ok("owner can sign into /admin", true);

  // floor shows the occupied table
  ok("floor view loads", await page.getByRole("heading", { name: "Floor" }).isVisible());

  // billing
  await page.goto(`${BASE}/admin/billing`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Generate bill" }).first().waitFor({ timeout: 15000 });
  ok("billing lists the open table", true);

  await page.getByRole("button", { name: "Generate bill" }).first().click();
  await page.getByText(/Mark as paid/).first().waitFor({ timeout: 10000 });
  ok("generate bill → GST breakdown shown", await page.getByText(/SGST/).first().isVisible());

  // DB: bill exists with correct GST math
  const { data: bill } = await admin.from("bills").select("*").eq("order_id", orderId).single();
  const expectGst = Math.round(Number(bill.subtotal) * 0.025 * 100) / 100;
  ok(
    "bill GST math correct (SGST = CGST = 2.5%)",
    Number(bill.sgst) === expectGst && Number(bill.cgst) === expectGst,
    `subtotal ${bill.subtotal}, sgst ${bill.sgst}`,
  );

  // take payment
  await page.getByRole("button", { name: "cash", exact: true }).click();
  await page.getByRole("button", { name: /Clear table/ }).waitFor({ timeout: 10000 });
  ok("mark paid → 'Paid via cash' + clear option", await page.getByText(/Paid via cash/).isVisible());

  // clear the table
  await page.getByRole("button", { name: /Clear table/ }).click();
  await page.getByText("No open tables").waitFor({ timeout: 10000 });
  ok("clear table → billing is empty", true);

  // DB: order cleared + qr_token STAYS STABLE (printed sticker keeps working).
  // (This assertion needs the 005_stable_qr_token migration applied.)
  const { data: o } = await admin.from("orders").select("status").eq("id", orderId).single();
  const { data: t1 } = await admin.from("tables").select("qr_token, status").eq("id", t0.id).single();
  ok("order is 'cleared'", o.status === "cleared", o.status);
  ok("qr_token stays stable (sticker keeps working)", t1.qr_token === "demo", t1.qr_token);
  ok("table reset to 'empty'", t1.status === "empty");

  ok("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
} catch (e) {
  ok("admin flow crashed", false, e.message);
} finally {
  await browser.close();
  // restore the demo so /order/demo keeps working
  await admin.from("orders").delete().eq("id", orderId);
  await admin.from("tables").update({ status: "empty", qr_token: "demo" }).eq("id", t0.id);
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
