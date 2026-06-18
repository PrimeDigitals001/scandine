/**
 * ScanDine — per-visit table session lock (migration 007). RPC-level proof:
 *   - free table claims a session; a stranger then sees it "locked"
 *   - orders need the matching session token; wrong/none is rejected
 *   - a friend with the share token is authorised and can add
 *   - after the table is cleared, the old token is dead (locked out of the new
 *     guest's order)
 *   - freeing the table releases the lock
 *
 * Run:  node scripts/verify-customer-session.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const RID = "11111111-1111-1111-1111-111111111111";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { console.log(`${c ? "✅" : "❌"}  ${n}${d ? `  —  ${d}` : ""}`); if (c) pass++; else fail++; };

const { data: t0 } = await admin.from("tables").select("id").eq("restaurant_id", RID).eq("table_number", "T1").single();
const reset = async () => {
  await admin.from("orders").delete().neq("status", "cleared").eq("table_id", t0.id);
  await admin.from("tables").update({ status: "empty", session_token: null, session_started_at: null, qr_token: "demo" }).eq("id", t0.id);
};
const resolve = (s) => anon.rpc("resolve_table", { p_qr_token: "demo", p_session_token: s ?? null });
let ITEM = null; // a valid available item id, captured from the first authorised resolve
const order = (s) =>
  anon.rpc("place_order", { p_qr_token: "demo", p_items: [{ menu_item_id: ITEM, quantity: 1 }], p_session_token: s ?? null });
let made = [];

try {
  await reset();

  // 1. free table → claims a session
  const r1 = await resolve(null);
  const S1 = r1.data?.session_token;
  ITEM = r1.data?.menu?.flatMap((c) => c.items).find((i) => i.is_available)?.id;
  ok("free table claims a session", r1.data?.locked === false && !!S1, S1?.slice(0, 8));

  // 2. a different scanner (no token) is locked out
  const r2 = await resolve(null);
  ok("stranger sees the table 'locked'", r2.data?.locked === true);

  // 3. orders require the matching token
  const noSess = await order(null);
  ok("order without a session is rejected", !!noSess.error);
  const wrong = await order("not-the-real-token");
  ok("order with a wrong session is rejected", !!wrong.error);

  // 4. the session holder can order
  const placed = await order(S1);
  ok("order with the valid session succeeds", !!placed.data && !placed.error, placed.error?.message ?? "");
  const orderId = placed.data;
  if (orderId) made.push(orderId);

  // 5. a friend with the share token is authorised and can add
  const friend = await resolve(S1);
  ok("friend with the share token is let in", friend.data?.locked === false && !!friend.data?.active_order);
  const add = await anon.rpc("add_items_to_order", {
    p_qr_token: "demo", p_order_id: orderId,
    p_items: [{ menu_item_id: friend.data.menu.flatMap((c) => c.items).find((i) => i.is_available).id, quantity: 1 }],
    p_session_token: S1,
  });
  ok("friend can add to the shared order", !!add.data && !add.error);

  // 6. clear the table (simulate the owner's bill→clear: order cleared, session released)
  await admin.from("orders").update({ status: "cleared" }).eq("id", orderId);
  await admin.from("tables").update({ status: "empty", session_token: null, session_started_at: null }).eq("id", t0.id);

  // a new guest claims a fresh session + orders
  const r3 = await resolve(null);
  const S2 = r3.data?.session_token;
  ok("after clear, a NEW session is issued", !!S2 && S2 !== S1);
  const placed2 = await order(S2);
  if (placed2.data) made.push(placed2.data);
  ok("new guest can order with the new session", !!placed2.data && !placed2.error);

  // 7. the PAST guest's old token is dead — locked out of the new order
  const stale = await resolve(S1);
  ok("past guest's old token is locked out", stale.data?.locked === true);
  const staleAdd = await anon.rpc("add_items_to_order", {
    p_qr_token: "demo", p_order_id: placed2.data,
    p_items: [{ menu_item_id: r3.data.menu.flatMap((c) => c.items).find((i) => i.is_available).id, quantity: 5 }],
    p_session_token: S1,
  });
  ok("past guest can't add to the new guest's order", !!staleAdd.error);

  // 8. free table releases the lock (abandoned pre-order claim)
  await reset();
  const c1 = await resolve(null);
  const Sf = c1.data?.session_token;
  await admin.from("tables").update({ session_token: null, session_started_at: null }).eq("id", t0.id); // = freeTableAction
  const c2 = await resolve(null);
  ok("freeing the table releases the lock", c2.data?.locked === false && c2.data?.session_token !== Sf);
} catch (e) {
  ok("session-lock flow crashed", false, e.message);
} finally {
  for (const id of made) await admin.from("orders").delete().eq("id", id);
  await admin.from("tables").update({ status: "empty", session_token: null, session_started_at: null, qr_token: "demo" }).eq("id", t0.id);
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
