/**
 * ScanDine — printable bill. Owner generates a bill, clicks "Print bill", and a
 * thermal-friendly receipt (café name, items, GST, TOTAL) renders for printing.
 *
 * Run:  node scripts/verify-admin-print.mjs
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

// reset demo table + place an order
const { data: t0 } = await admin
  .from("tables")
  .select("id")
  .eq("restaurant_id", RID)
  .eq("table_number", "T1")
  .single();
await admin.from("orders").delete().neq("status", "cleared").eq("table_id", t0.id);
await admin.from("tables").update({ status: "empty", session_token: null, session_started_at: null, qr_token: "demo" }).eq("id", t0.id);

const r = await anon.rpc("resolve_table", { p_qr_token: "demo", p_session_token: null });
const item = r.data.menu.flatMap((c) => c.items).find((i) => i.is_available);
const placed = await anon.rpc("place_order", {
  p_qr_token: "demo",
  p_items: [{ menu_item_id: item.id, quantity: 2 }],
  p_session_token: r.data.session_token,
});
const orderId = placed.data;

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

  await page.goto(`${BASE}/admin/billing`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Generate bill" }).first().waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Generate bill" }).first().click();

  const printBtn = page.getByRole("button", { name: "Print bill" });
  await printBtn.waitFor({ timeout: 10000 });
  ok("'Print bill' button appears once a bill exists", true);

  // click → a receipt is written into a hidden iframe for the print dialog
  await printBtn.click();
  const receipt = page.frameLocator("iframe").first();
  await receipt.getByText("Powered by ScanDine").waitFor({ timeout: 2000 });
  ok("receipt renders (footer)", true);
  ok(
    "receipt shows the café name",
    await receipt.getByText("Friends & Fries").first().isVisible(),
  );
  ok("receipt shows a TOTAL line", await receipt.getByText(/TOTAL/).first().isVisible());

  ok("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
} catch (e) {
  ok("print flow crashed", false, e.message);
} finally {
  await browser.close();
  await admin.from("orders").delete().eq("id", orderId);
  await admin.from("tables").update({ status: "empty", session_token: null, session_started_at: null, qr_token: "demo" }).eq("id", t0.id);
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
