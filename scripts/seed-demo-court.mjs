/**
 * ScanDine — seed a demo FOOD COURT for testing/demos. Idempotent.
 * Creates a court at the stable token `court-demo` (→ /court/court-demo) and
 * groups the existing restaurants under it as pickup stores. Single-café still
 * works for the same restaurants (food_court_id just groups them).
 *
 * Run:  node scripts/seed-demo-court.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const SLUG = "scandine-demo-court";
const TOKEN = "court-demo";

// fresh court (deleting nulls restaurants.food_court_id via on-delete-set-null)
await svc.from("food_courts").delete().eq("slug", SLUG);
const { data: court, error } = await svc
  .from("food_courts")
  .insert({ name: "ScanDine Food Court", slug: SLUG, qr_token: TOKEN, address: "Demo Mall, Bengaluru" })
  .select()
  .single();
if (error) {
  console.error("create court failed:", error.message);
  process.exit(1);
}

// attach only restaurants that actually have a menu (skip empty/experiment ones)
const { data: withMenu } = await svc.from("menu_items").select("restaurant_id");
const menuIds = [...new Set((withMenu ?? []).map((m) => m.restaurant_id))];
const { data: rests } = await svc
  .from("restaurants").select("id, name").in("id", menuIds).eq("is_active", true);
for (const r of rests) {
  await svc.from("restaurants").update({ food_court_id: court.id }).eq("id", r.id);
}
console.log(`✅ demo court "${court.name}" with ${rests.length} stores → token "${TOKEN}"`);

const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const liveBase = "https://scandine-demo.vercel.app";
for (const [label, b] of [["local", base], ["live", liveBase]]) {
  const out = `C:/Users/krish/Desktop/scandine-court-QR-${label}.png`;
  await QRCode.toFile(out, `${b}/court/${TOKEN}`, { width: 900, margin: 3, color: { dark: "#1C1917", light: "#FFFFFF" } });
  console.log(`   QR (${label}) → ${out}  [${b}/court/${TOKEN}]`);
}
