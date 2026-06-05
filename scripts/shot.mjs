import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

const W = Number(process.argv[2] ?? 1536);
const b = await chromium.launch();

let p = await b.newPage({ viewport: { width: W, height: 920 } });
await p.goto("http://localhost:3000/order/demo", { waitUntil: "networkidle" });
await p.getByText("Friends & Fries Café").waitFor();
await p.screenshot({ path: "shot-menu.png" });
await p.close();

const r = await anon.rpc("resolve_table", { p_qr_token: "demo" });
const item = r.data.menu.flatMap((c) => c.items).find((i) => i.is_available);
const placed = await anon.rpc("place_order", {
  p_qr_token: "demo",
  p_items: [{ menu_item_id: item.id, quantity: 2 }],
  p_table_note: "shot",
});

p = await b.newPage({ viewport: { width: W, height: 920 } });
await p.goto("http://localhost:3000/order/demo/cart", { waitUntil: "networkidle" });
await p.close();

p = await b.newPage({ viewport: { width: W, height: 920 } });
await p.goto("http://localhost:3000/order/demo/status", { waitUntil: "networkidle" });
await p.waitForTimeout(700);
await p.screenshot({ path: "shot-status.png" });
await p.close();

if (placed.data) await admin.from("orders").delete().eq("id", placed.data);
await admin.from("tables").update({ status: "empty" }).eq("qr_token", "demo");
await b.close();
console.log(`screenshots saved at ${W}px`);
