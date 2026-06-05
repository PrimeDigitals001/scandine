/**
 * Demo helper: walk the demo table's active order through the kitchen stages,
 * so you can WATCH the customer's live status screen update in real time
 * (until the real KDS is built in step 5).
 *
 * 1. Place an order on your phone at /order/demo (you'll land on the tracker).
 * 2. Keep that screen open.
 * 3. Run:  node scripts/advance-order.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { data: table } = await admin
  .from("tables")
  .select("id")
  .eq("qr_token", "demo")
  .single();

const { data: order } = await admin
  .from("orders")
  .select("id, status")
  .eq("table_id", table.id)
  .neq("status", "cleared")
  .order("placed_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (!order) {
  console.log("No active order on the demo table. Place one on your phone first.");
  process.exit(0);
}

// orders.status flow → mirror onto order_items.status where it makes sense
const STEPS = [
  { status: "accepted", items: "pending" },
  { status: "cooking", items: "cooking" },
  { status: "ready", items: "ready" },
  { status: "served", items: "ready" },
];

console.log(`Advancing order ${order.id.slice(0, 8)} (watch your phone)…\n`);
for (const step of STEPS) {
  await admin.from("orders").update({ status: step.status }).eq("id", order.id);
  await admin.from("order_items").update({ status: step.items }).eq("order_id", order.id);
  console.log(`  → ${step.status}`);
  await sleep(3500);
}
console.log("\nDone. Order is 'served' — the rating prompt should have popped on the phone.");
