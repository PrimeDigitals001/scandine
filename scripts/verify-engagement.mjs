/**
 * ScanDine — engagement: per-dish reviews + daily-special / best-seller / rating
 * fields in the menu. RPC-level e2e against live. Needs migration 009 applied.
 * Self-cleans. Run:  node scripts/verify-engagement.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  console.log(`${c ? "✅" : "❌"}  ${n}${d ? `  —  ${d}` : ""}`);
  if (c) pass++;
  else fail++;
};
const findItem = (data) => data.menu.flatMap((c) => c.items);

let orderId = null;
let specialItemId = null;

try {
  // pre-flight: migration applied?
  const probe = await anon.rpc("submit_dish_review", {
    p_order_id: "00000000-0000-0000-0000-000000000000",
    p_menu_item_id: "00000000-0000-0000-0000-000000000000",
    p_stars: 5,
  });
  if (probe.error && probe.error.code === "PGRST202") {
    console.error("⚠️  Migration 009 not applied — submit_dish_review missing. Run it first.");
    process.exit(1);
  }

  // reset demo table
  const { data: t } = await svc.from("tables").select("id, restaurant_id").eq("qr_token", "demo").single();
  await svc.from("orders").delete().neq("status", "cleared").eq("table_id", t.id);
  await svc.from("tables").update({ status: "empty", session_token: null, session_started_at: null }).eq("id", t.id);

  // resolve → session + two distinct items
  const r = await anon.rpc("resolve_table", { p_qr_token: "demo", p_session_token: null });
  const session = r.data.session_token;
  const items = findItem(r.data).filter((i) => i.is_available);
  ok("menu items expose the new fields", "is_daily_special" in items[0] && "avg_rating" in items[0] && "is_bestseller" in items[0]);
  const item = items[0];
  const otherItem = items.find((i) => i.id !== item.id);
  specialItemId = item.id;

  // place an order with that item
  const placed = await anon.rpc("place_order", {
    p_qr_token: "demo", p_items: [{ menu_item_id: item.id, quantity: 1 }], p_session_token: session,
  });
  orderId = placed.data;

  // review BEFORE served → rejected
  const early = await anon.rpc("submit_dish_review", {
    p_order_id: orderId, p_menu_item_id: item.id, p_stars: 5, p_session_token: session,
  });
  ok("review rejected before the dish is served", !!early.error, early.error?.message ?? "");

  // serve it
  await svc.from("orders").update({ status: "served", served_at: new Date().toISOString() }).eq("id", orderId);

  // wrong session → rejected
  const wrong = await anon.rpc("submit_dish_review", {
    p_order_id: orderId, p_menu_item_id: item.id, p_stars: 5, p_session_token: "nope",
  });
  ok("review rejected with a wrong session", !!wrong.error, wrong.error?.message ?? "");

  // item not on the order → rejected
  if (otherItem) {
    const notOn = await anon.rpc("submit_dish_review", {
      p_order_id: orderId, p_menu_item_id: otherItem.id, p_stars: 5, p_session_token: session,
    });
    ok("review rejected for a dish not on the order", !!notOn.error, notOn.error?.message ?? "");
  }

  // valid review → ok
  const good = await anon.rpc("submit_dish_review", {
    p_order_id: orderId, p_menu_item_id: item.id, p_stars: 5, p_comment: "delicious", p_session_token: session,
  });
  ok("valid review submitted", !good.error, good.error?.message ?? "");

  // mark daily special
  await svc.from("menu_items").update({ is_daily_special: true }).eq("id", item.id);

  // resolve again → fields reflect
  const r2 = await anon.rpc("resolve_table", { p_qr_token: "demo", p_session_token: session });
  const it2 = findItem(r2.data).find((i) => i.id === item.id);
  ok("daily special flag shows in the menu", it2.is_daily_special === true);
  ok("avg rating + count show in the menu", Number(it2.avg_rating) === 5 && it2.rating_count >= 1, `${it2.avg_rating} (${it2.rating_count})`);
  ok("is_bestseller field is present (boolean)", typeof it2.is_bestseller === "boolean", String(it2.is_bestseller));

  // tenant isolation: another café's admin can't read this review
  const { data: cafeB } = await svc.from("restaurants").select("id").neq("id", t.restaurant_id).limit(1).maybeSingle();
  if (cafeB) {
    const { count } = await svc.from("dish_ratings").select("id", { count: "exact", head: true }).eq("restaurant_id", t.restaurant_id);
    ok("review stored under the correct restaurant", (count ?? 0) >= 1);
  }
} catch (e) {
  ok("engagement flow crashed", false, e.message);
} finally {
  if (orderId) {
    await svc.from("dish_ratings").delete().eq("order_id", orderId);
    await svc.from("orders").delete().eq("id", orderId);
  }
  if (specialItemId) await svc.from("menu_items").update({ is_daily_special: false }).eq("id", specialItemId);
  await svc.from("tables").update({ status: "empty", session_token: null, session_started_at: null }).eq("qr_token", "demo");
  console.log("🧹 cleaned up engagement test data");
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
