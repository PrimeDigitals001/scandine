/**
 * ScanDine — Food Court (pickup) end-to-end at the data layer (live DB).
 * Creates a temporary court over the 2 existing restaurants, then proves a
 * customer can order from TWO stores independently — separate orders, separate
 * kitchens (restaurant_id), session isolation — and cleans everything up.
 *
 * Needs migrations 008 (schema + functions) applied. Run:
 *   node scripts/verify-food-court.mjs
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

const SLUG = "test-food-court-verify";
let courtId = null;
const attached = []; // restaurant ids we set food_court_id on (to restore)
const orderIds = [];

try {
  // ---- setup: group 2 restaurants that actually HAVE a menu under a test court
  const { data: withMenu } = await svc.from("menu_items").select("restaurant_id");
  const menuIds = [...new Set((withMenu ?? []).map((m) => m.restaurant_id))];
  const { data: rests } = await svc
    .from("restaurants").select("id, slug, name").in("id", menuIds).eq("is_active", true).limit(2);
  if (!rests || rests.length < 2) {
    ok("need 2 restaurants to test a food court", false, `found ${rests?.length ?? 0}`);
    process.exit(1);
  }
  await svc.from("food_courts").delete().eq("slug", SLUG); // idempotent
  const { data: court, error: cErr } = await svc
    .from("food_courts").insert({ name: "Verify Food Court", slug: SLUG }).select().single();
  if (cErr) { ok("create food court", false, cErr.message); process.exit(1); }
  courtId = court.id;
  for (const r of rests) {
    await svc.from("restaurants").update({ food_court_id: courtId }).eq("id", r.id);
    attached.push(r.id);
  }
  const token = court.qr_token; // generic = pickup entry
  ok("food court created + 2 stores attached", true, court.name);

  // ---- customer: resolve the court → store list
  const { data: fc, error: fErr } = await anon.rpc("resolve_food_court", { p_token: token });
  ok("resolve_food_court returns the store list", !fErr && fc?.stores?.length === 2, fErr?.message ?? `${fc?.stores?.length} stores`);
  ok("access mode is pickup (generic court token)", fc?.access?.mode === "pickup");

  // ---- place an independent pickup order at EACH store
  const placed = [];
  for (const s of fc.stores) {
    const { data: r } = await anon.rpc("resolve_food_court_store", {
      p_token: token, p_store_slug: s.slug, p_session_token: null,
    });
    const item = r.menu.flatMap((c) => c.items).find((i) => i.is_available);
    const { data: res, error: pErr } = await anon.rpc("place_food_court_order", {
      p_token: token, p_store_slug: s.slug,
      p_items: [{ menu_item_id: item.id, quantity: 1 }],
      p_session_token: null,
    });
    ok(`place pickup order at "${s.name}"`, !pErr && !!res?.order_id, pErr?.message ?? `#${res?.pickup_number}`);
    if (res?.order_id) { orderIds.push(res.order_id); placed.push({ store: s, res }); }
  }

  ok("two DISTINCT orders created", placed.length === 2 && placed[0].res.order_id !== placed[1].res.order_id);
  ok("each order has its own pickup token", placed[0]?.res.pickup_number !== placed[1]?.res.pickup_number);
  ok("each order has its own session token", placed[0]?.res.session_token !== placed[1]?.res.session_token);

  // ---- routing: each order carries the right store's restaurant_id (→ its KDS)
  const { data: orows } = await svc.from("orders")
    .select("id, restaurant_id, table_id, food_court_id, food_court_table_id, pickup_number")
    .in("id", orderIds);
  const a = orows.find((o) => o.id === placed[0].res.order_id);
  const b = orows.find((o) => o.id === placed[1].res.order_id);
  ok("order A routed to store A's kitchen", a.restaurant_id === placed[0].store.id);
  ok("order B routed to store B's kitchen", b.restaurant_id === placed[1].store.id);
  ok("food-court orders have no single-café table_id", a.table_id === null && b.table_id === null);
  ok("food-court orders anchored on the court", a.food_court_id === courtId && b.food_court_id === courtId);
  ok("pickup orders have no shared seat", a.food_court_table_id === null && b.food_court_table_id === null);

  // ---- add items to an existing pickup order (with its token)
  const itemA = (await anon.rpc("resolve_food_court_store", { p_token: token, p_store_slug: placed[0].store.slug, p_session_token: null }))
    .data.menu.flatMap((c) => c.items).find((i) => i.is_available);
  const { error: addErr } = await anon.rpc("add_items_to_fc_order", {
    p_order_id: placed[0].res.order_id, p_items: [{ menu_item_id: itemA.id, quantity: 1 }],
    p_session_token: placed[0].res.session_token,
  });
  ok("add items to a pickup order (correct token)", !addErr, addErr?.message);

  // ---- session isolation: wrong token can't read the bill / touch the order
  const { error: wrongErr } = await anon.rpc("get_fc_bill", {
    p_order_id: placed[0].res.order_id, p_session_token: "not-the-right-token",
  });
  ok("a stranger's token is rejected (isolation)", !!wrongErr, wrongErr?.message ?? "");

  const { data: noBill, error: billErr } = await anon.rpc("get_fc_bill", {
    p_order_id: placed[0].res.order_id, p_session_token: placed[0].res.session_token,
  });
  ok("get_fc_bill with the right token works (no bill yet)", !billErr && noBill === null, billErr?.message ?? "");

  // ---- request bill rides the store's realtime (bill_requested_at stamped)
  const { error: reqErr } = await anon.rpc("request_fc_bill", {
    p_order_id: placed[0].res.order_id, p_session_token: placed[0].res.session_token,
  });
  const { data: stamped } = await svc.from("orders").select("bill_requested_at").eq("id", placed[0].res.order_id).single();
  ok("request_fc_bill stamps the order (owner alert)", !reqErr && !!stamped?.bill_requested_at, reqErr?.message ?? "");
} catch (e) {
  ok("food-court flow crashed", false, e.message);
} finally {
  // ---- cleanup: delete the court's orders (can't null food_court_id — anchor
  // check), detach restaurants, then delete the court.
  if (courtId) await svc.from("orders").delete().eq("food_court_id", courtId);
  for (const id of attached) await svc.from("restaurants").update({ food_court_id: null }).eq("id", id);
  if (courtId) await svc.from("food_courts").delete().eq("id", courtId);
  console.log("🧹 cleaned up test court + orders");
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
