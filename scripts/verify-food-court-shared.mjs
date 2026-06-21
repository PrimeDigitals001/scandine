/**
 * ScanDine — Food Court SHARED TABLE end-to-end (live DB).
 * A seat QR is claimed by one party; strangers are locked out; a friend joins
 * via the seat session; the party orders from TWO stores at the same seat; the
 * same store twice is blocked; and the admin clear releases the seat only when
 * the LAST order at it clears. Uses the demo café's admin to test clearing.
 *
 * Needs migrations 008 + the demo admin (admin@scandine.demo). Self-cleans.
 * Run:  node scripts/verify-food-court-shared.mjs
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
const seatSession = (data) => data?.session_token;
const firstItem = async (token, slug, session) => {
  const { data } = await anon.rpc("resolve_food_court_store", { p_token: token, p_store_slug: slug, p_session_token: session });
  return data.menu.flatMap((c) => c.items).find((i) => i.is_available);
};

const SLUG = "test-shared-court-verify";
let courtId = null;
const attached = [];
const orderIds = [];

try {
  // ---- setup: court over the DEMO café (has an admin) + a second store + a seat
  const { data: ff } = await svc.from("restaurants").select("id, slug").eq("slug", "friends-fries-cafe").single();
  const { data: other } = await svc.from("restaurants").select("id, slug").neq("id", ff.id).eq("is_active", true).limit(1).single();
  await svc.from("food_courts").delete().eq("slug", SLUG);
  const { data: court } = await svc.from("food_courts").insert({ name: "Shared Verify Court", slug: SLUG }).select().single();
  courtId = court.id;
  for (const id of [ff.id, other.id]) {
    await svc.from("restaurants").update({ food_court_id: courtId }).eq("id", id);
    attached.push(id);
  }
  const { data: seat } = await svc
    .from("food_court_tables")
    .insert({ food_court_id: courtId, mode: "shared_table", label: "Table 1", capacity: 4 })
    .select()
    .single();
  const seatToken = seat.qr_token;
  ok("shared-table court + seat created", true, `${ff.slug} + ${other.slug}`);

  // ---- resolve court via the SEAT token
  const { data: fc } = await anon.rpc("resolve_food_court", { p_token: seatToken });
  ok("seat token resolves as shared_table", fc?.access?.mode === "shared_table", fc?.access?.label);
  ok("store list has both stores", fc?.stores?.length === 2);

  // ---- first guest claims the seat
  const { data: claim } = await anon.rpc("resolve_food_court_store", { p_token: seatToken, p_store_slug: ff.slug, p_session_token: null });
  const session = seatSession(claim);
  ok("first guest claims a seat session", !!session && !claim.locked);

  // ---- stranger (no token) is locked out
  const { data: stranger } = await anon.rpc("resolve_food_court_store", { p_token: seatToken, p_store_slug: other.slug, p_session_token: null });
  ok("stranger sees the seat locked", stranger?.locked === true);

  // ---- friend WITH the session joins
  const { data: friend } = await anon.rpc("resolve_food_court_store", { p_token: seatToken, p_store_slug: other.slug, p_session_token: session });
  ok("friend with the session is let in", !friend?.locked && Array.isArray(friend?.menu));

  // ---- order from TWO stores at the same seat
  const iFF = await firstItem(seatToken, ff.slug, session);
  const iOther = await firstItem(seatToken, other.slug, session);
  const { data: oFF, error: eFF } = await anon.rpc("place_food_court_order", { p_token: seatToken, p_store_slug: ff.slug, p_items: [{ menu_item_id: iFF.id, quantity: 1 }], p_session_token: session });
  const { data: oOther, error: eOther } = await anon.rpc("place_food_court_order", { p_token: seatToken, p_store_slug: other.slug, p_items: [{ menu_item_id: iOther.id, quantity: 1 }], p_session_token: session });
  if (oFF?.order_id) orderIds.push(oFF.order_id);
  if (oOther?.order_id) orderIds.push(oOther.order_id);
  ok("two stores can have orders at one seat", !eFF && !eOther && oFF?.order_id !== oOther?.order_id, eFF?.message || eOther?.message || "");

  // ---- same store twice at the same seat is blocked
  const { error: dupe } = await anon.rpc("place_food_court_order", { p_token: seatToken, p_store_slug: ff.slug, p_items: [{ menu_item_id: iFF.id, quantity: 1 }], p_session_token: session });
  ok("same store twice at a seat is blocked", !!dupe, dupe?.message ?? "");

  // ---- both orders anchored on the seat
  const { data: rows } = await svc.from("orders").select("id, restaurant_id, table_id, food_court_table_id").in("id", orderIds);
  ok("both orders carry the seat + null single-café table", rows.every((r) => r.food_court_table_id === seat.id && r.table_id === null));

  // ---- admin clears the FF order → seat stays alive (other store remains)
  const admin = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: signErr } = await admin.auth.signInWithPassword({ email: "admin@scandine.demo", password: "admin123" });
  if (signErr) { ok("demo admin sign-in (needed for clear test)", false, signErr.message); }
  else {
    await admin.rpc("generate_bill", { p_order_id: oFF.order_id, p_discount: 0 });
    await admin.from("bills").update({ payment_method: "cash", paid_at: new Date().toISOString() }).eq("order_id", oFF.order_id);
    const { error: clrErr } = await admin.rpc("clear_fc_order", { p_order_id: oFF.order_id });
    const { data: seatAfter1 } = await svc.from("food_court_tables").select("session_token").eq("id", seat.id).single();
    ok("clearing one store keeps the seat (other store remains)", !clrErr && seatAfter1.session_token != null, clrErr?.message ?? "");

    // ---- make FF the LAST order: remove the other store's order, then a fresh
    //      single FF order, clear it → seat session released
    await svc.from("orders").delete().eq("id", oOther.order_id);
    const i2 = await firstItem(seatToken, ff.slug, session);
    const { data: oFF2 } = await anon.rpc("place_food_court_order", { p_token: seatToken, p_store_slug: ff.slug, p_items: [{ menu_item_id: i2.id, quantity: 1 }], p_session_token: session });
    orderIds.push(oFF2.order_id);
    await admin.rpc("generate_bill", { p_order_id: oFF2.order_id, p_discount: 0 });
    await admin.from("bills").update({ payment_method: "cash", paid_at: new Date().toISOString() }).eq("order_id", oFF2.order_id);
    await admin.rpc("clear_fc_order", { p_order_id: oFF2.order_id });
    const { data: seatAfter2 } = await svc.from("food_court_tables").select("session_token").eq("id", seat.id).single();
    ok("clearing the LAST order releases the seat", seatAfter2.session_token == null);
    await admin.auth.signOut();
  }
} catch (e) {
  ok("shared-table flow crashed", false, e.message);
} finally {
  if (orderIds.length) await svc.from("orders").delete().in("id", orderIds);
  for (const id of attached) await svc.from("restaurants").update({ food_court_id: null }).eq("id", id);
  if (courtId) await svc.from("food_courts").delete().eq("id", courtId); // cascades the seat
  console.log("🧹 cleaned up shared-table test court + orders");
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
