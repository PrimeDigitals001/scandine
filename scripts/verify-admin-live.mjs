/**
 * ScanDine — owner's Floor is LIVE. With the Floor open, a customer places an
 * order and the floor updates with no reload (realtime via the anon-readable
 * `orders` stream). Proves the AdminLive wiring.
 *
 * The "request bill" toast uses orders.bill_requested_at, which needs the
 * 005 migration applied — verified separately once the SQL is run.
 *
 * Run:  node scripts/verify-admin-live.mjs
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
const activeOrders = () =>
  page
    .getByText("Active orders", { exact: true })
    .locator("xpath=../p[1]")
    .innerText()
    .then((t) => t.trim())
    .catch(() => "?");

// clean baseline: no active orders on the demo café, demo token present
let { data: demo } = await admin.from("tables").select("id").eq("qr_token", "demo").maybeSingle();
if (!demo) {
  const { data: t1 } = await admin
    .from("tables")
    .select("id")
    .eq("restaurant_id", RID)
    .eq("table_number", "T1")
    .single();
  await admin.from("tables").update({ qr_token: "demo", status: "empty", session_token: null, session_started_at: null }).eq("id", t1.id);
  demo = t1;
}
await admin.from("orders").delete().neq("status", "cleared").eq("restaurant_id", RID);
await admin.from("tables").update({ status: "empty", session_token: null, session_started_at: null }).eq("restaurant_id", RID);

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
  await page.getByRole("heading", { name: "Floor" }).waitFor({ timeout: 15000 });

  ok("floor starts with 0 active orders", (await activeOrders()) === "0", await activeOrders());

  // let the realtime channel subscribe, then a customer orders
  await page.waitForTimeout(3000);
  const r = await anon.rpc("resolve_table", { p_qr_token: "demo", p_session_token: null });
  const item = r.data.menu.flatMap((c) => c.items).find((i) => i.is_available);
  const placed = await anon.rpc("place_order", {
    p_qr_token: "demo",
    p_items: [{ menu_item_id: item.id, quantity: 1 }],
    p_session_token: r.data.session_token,
  });
  orderId = placed.data;
  // request_bill also needs the session
  const SESS = r.data.session_token;

  // the floor live-updates (no reload) within a few seconds
  let live = false;
  for (let i = 0; i < 12; i++) {
    if ((await activeOrders()) === "1") {
      live = true;
      break;
    }
    await page.waitForTimeout(1000);
  }
  ok("floor live-updates when a customer orders (no reload)", live, `active=${await activeOrders()}`);

  // customer taps "Request bill" → the owner's screen pops the alert live
  await anon.rpc("request_bill", { p_qr_token: "demo", p_order_id: orderId, p_session_token: SESS });
  let toast = false;
  try {
    await page.getByText(/requested the bill/i).waitFor({ timeout: 12000 });
    toast = true;
  } catch {}
  ok("request-bill alert pops live (needs migration 005)", toast);

  ok("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
} catch (e) {
  ok("live floor crashed", false, e.message);
} finally {
  await browser.close();
  if (orderId) await admin.from("orders").delete().eq("id", orderId);
  await admin.from("tables").update({ status: "empty", session_token: null, session_started_at: null }).eq("id", demo.id);
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
