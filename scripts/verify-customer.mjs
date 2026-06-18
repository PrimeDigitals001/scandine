/**
 * ScanDine — Customer PWA smoke test (requires `npm run dev` running).
 * Exercises the real order flow over RPC + checks the pages render.
 * Cleans up the order it creates.
 *
 * Run:  node scripts/verify-customer.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
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

let orderId = null;
try {
  // 1. menu page renders the café + an item
  const menuHtml = await (await fetch(`${BASE}/order/demo`)).text();
  ok(
    "/order/demo renders café + menu",
    menuHtml.includes("Friends &amp; Fries") &&
      /Chai|Brownie|Coffee/.test(menuHtml),
  );

  // 2. invalid token shows the friendly error
  const badHtml = await (await fetch(`${BASE}/order/nope-not-real`)).text();
  ok("/order/<bad token> shows inactive state", badHtml.includes("isn't active"));

  // 3. status with no active order
  const noOrder = await (await fetch(`${BASE}/order/demo/status`)).text();
  ok("/order/demo/status shows 'No active order'", noOrder.includes("No active order"));

  // 4. place an order via the RPC (as the customer would)
  const r = await anon.rpc("resolve_table", { p_qr_token: "demo" });
  const item = r.data.menu.flatMap((c) => c.items).find((i) => i.is_available);
  const placed = await anon.rpc("place_order", {
    p_qr_token: "demo",
    p_items: [{ menu_item_id: item.id, quantity: 2 }],
    p_table_note: "smoke test",
  });
  orderId = placed.data ?? null;
  ok("anon place_order succeeds", !placed.error && !!orderId, placed.error?.message ?? `order ${orderId?.slice(0, 8)}`);

  // 5. status page now shows the live tracker
  const statusHtml = await (await fetch(`${BASE}/order/demo/status`)).text();
  ok(
    "/order/demo/status shows the live tracker",
    statusHtml.includes("Order placed") && statusHtml.includes("Your items"),
  );

  // 6. drive it to 'served' and confirm the page reflects it
  await admin.from("orders").update({ status: "served" }).eq("id", orderId);
  const servedHtml = await (await fetch(`${BASE}/order/demo/status`)).text();
  ok("status reflects 'served'", servedHtml.includes("Served"));

  // 7. bill page renders (estimate, since no bill generated)
  const billHtml = await (await fetch(`${BASE}/order/demo/bill`)).text();
  ok("/order/demo/bill renders", billHtml.includes("Total") || billHtml.includes("Bill"));
} finally {
  if (orderId) await admin.from("orders").delete().eq("id", orderId);
  await admin.from("tables").update({ status: "empty", session_token: null, session_started_at: null }).eq("qr_token", "demo");
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
